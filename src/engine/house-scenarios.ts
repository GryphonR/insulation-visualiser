// Scenarios (board 5): each scenario is a full copy of the house plus its parent. Its changes are the
// difference from the parent, so they can be listed, switched off one by one and applied step by step.
import { FUEL_LABEL, SOURCE_LABEL, buildupU, calcHouse, storeyLevel } from './house';
import type { Fuel, HeatSource, House, TraceSettings } from './house';
import { defaultHouse, loadHouse, upgradeHouse } from './house-default';

export type Seg = string | { id: string };
export interface Change { key: string; path: Seg[]; from: unknown; to: unknown }
export interface Scenario { id: string; name: string; kind: 'base' | 'plan' | 'whatif'; parent: string | null; house: House }
/** Tracing images and satellite placement are drawing aids shared by every scenario, so they live here once, not in each house. */
export interface Project { v: 1; scenarios: Scenario[]; active: string; trace?: TraceSettings }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const idArray = (x: unknown): x is Array<{ id: string }> => Array.isArray(x) && x.every((e) => isObj(e) && typeof e.id === 'string');
const segKey = (p: Seg[]) => p.map((s) => (typeof s === 'string' ? s : `#${s.id}`)).join('.');

/** Leaf-level differences from a to b. Arrays of {id} items are matched by id; other arrays are compared whole. */
export function diff(a: unknown, b: unknown, path: Seg[] = [], out: Change[] = []): Change[] {
  if (same(a, b)) return out;
  if (idArray(a) && idArray(b) && (a.length || b.length)) {
    const ids = [...new Set([...b.map((e) => e.id), ...a.map((e) => e.id)])];
    for (const id of ids) {
      const ea = a.find((e) => e.id === id), eb = b.find((e) => e.id === id), p = [...path, { id }];
      if (ea && eb) diff(ea, eb, p, out);
      else out.push({ key: segKey(p), path: p, from: ea, to: eb });
    }
  } else if (isObj(a) && isObj(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) diff(a[k], b[k], [...path, k], out);
  } else out.push({ key: segKey(path), path, from: a, to: b });
  return out;
}

/** House with the changes applied (a change whose parent item no longer exists is skipped). */
export function applyChanges(h: House, changes: Change[]): House {
  const n = structuredClone(h) as unknown as Record<string, unknown>;
  for (const c of changes) {
    let o: unknown = n;
    for (let i = 0; i < c.path.length - 1 && o; i++) {
      const s = c.path[i];
      if (typeof s === 'string') {
        const rec = o as Record<string, unknown>;
        if (rec[s] == null) rec[s] = typeof c.path[i + 1] === 'string' ? {} : [];
        o = rec[s];
      } else o = (o as Array<{ id: string }>).find((e) => e.id === s.id);
    }
    if (!o) continue;
    const last = c.path[c.path.length - 1], to = structuredClone(c.to);
    if (typeof last === 'string') {
      if (to === undefined) delete (o as Record<string, unknown>)[last];
      else (o as Record<string, unknown>)[last] = to;
    } else {
      const arr = o as Array<{ id: string }>, i = arr.findIndex((e) => e.id === last.id);
      if (to === undefined) { if (i >= 0) arr.splice(i, 1); } else if (i >= 0) arr[i] = to as { id: string }; else arr.push(to as { id: string });
    }
  }
  return n as unknown as House;
}

const SIDE_NAME: Record<string, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const HP_FIELD: Record<string, string> = {
  source: 'Heat source', fuel: 'Boiler fuel', capacity: 'Heat source output, kW', maxFlow: 'Max flow, °C', boilerEff: 'Boiler efficiency, %',
  sheet: 'Heat pump datasheet', hpFactor: 'Heat pump performance factor', gasStanding: 'Gas standing charge counted',
  elecP: 'Electricity, p/kWh', gasP: 'Gas, p/kWh', gasSC: 'Gas standing, p/day', oilP: 'Oil, p/kWh', lpgP: 'LPG, p/kWh',
};

/** Plain-English name for what a change touches, and its from / to values. */
export function describe(c: Change, a: House, b: House): { what: string; from: string; to: string } {
  const room = (id: string) => b.rooms.find((r) => r.id === id)?.name ?? a.rooms.find((r) => r.id === id)?.name ?? id;
  const bu = (id: unknown) => {
    const x = b.buildups.find((y) => y.id === id) ?? a.buildups.find((y) => y.id === id);
    return x ? `${x.name}` : String(id ?? '—');
  };
  const val = (v: unknown) => (v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'object' ? '…' : String(v));
  const face = (key: string) => {
    const [kind, rest, s] = key.split(':');
    const pair = () => rest.split('|').map(room).join(' / ');
    if (kind === 'w') return `${room(rest)}, ${SIDE_NAME[s] ?? s} wall`;
    if (kind === 'iw') return `Wall ${pair()}`;
    if (kind === 'f') return `Floor ${pair()}`;
    if (kind === 'gf') return `${room(rest)}, ground floor`;
    if (kind === 'xf') return `${room(rest)}, exposed floor`;
    if (kind === 'lc') return `${room(rest)}, ceiling to loft`;
    if (kind === 'fr') return `${room(rest)}, flat roof`;
    return key;
  };
  const [top, second] = c.path;
  const sid = (s: Seg | undefined) => (s && typeof s !== 'string' ? s.id : '');
  const field = c.path.slice(2).map((s) => (typeof s === 'string' ? s : s.id)).join('.');
  switch (top) {
    case 'faceBuildup': return { what: face(String(second)), from: bu(c.from ?? a.defaults.extWall), to: bu(c.to) };
    case 'faceBoundary': return { what: `${face(String(second))} boundary`, from: c.from === 'party' ? 'neighbour' : 'outside', to: c.to === 'party' ? 'neighbour' : 'outside' };
    case 'defaults': return { what: `Default ${String(second)}`, from: bu(c.from), to: bu(c.to) };
    case 'buildups': {
      const id = sid(second), name = bu(id);
      if (c.from === undefined) return { what: `New build-up: ${name}`, from: '—', to: 'added' };
      if (c.to === undefined) return { what: `Build-up removed: ${name}`, from: 'present', to: '—' };
      if (field === 'layers') {
        const ba = a.buildups.find((x) => x.id === id), bb = b.buildups.find((x) => x.id === id);
        return { what: `${name} layers`, from: ba ? `U ${buildupU(ba).toFixed(2)}` : '—', to: bb ? `U ${buildupU(bb).toFixed(2)}` : '—' };
      }
      return { what: `${name} ${field}`, from: val(c.from), to: val(c.to) };
    }
    case 'rooms': {
      const id = sid(second);
      if (c.from === undefined) return { what: `New room: ${room(id)}`, from: '—', to: 'added' };
      if (c.to === undefined) return { what: `Room removed: ${room(id)}`, from: 'present', to: '—' };
      return { what: `${room(id)} ${field}`, from: val(c.from), to: val(c.to) };
    }
    case 'openings': {
      const id = sid(second), o = b.openings.find((x) => x.id === id) ?? a.openings.find((x) => x.id === id);
      const name = o ? `${room(o.room)} ${o.name}` : id;
      if (c.from === undefined) return { what: `New opening: ${name}`, from: '—', to: 'added' };
      if (c.to === undefined) return { what: `Opening removed: ${name}`, from: 'present', to: '—' };
      return { what: `${name} ${field}`, from: field === 'buildup' ? bu(c.from) : val(c.from), to: field === 'buildup' ? bu(c.to) : val(c.to) };
    }
    case 'vent': {
      if (second === 'factors') {
        const f = b.vent.factors.find((x) => x.id === sid(c.path[2])) ?? a.vent.factors.find((x) => x.id === sid(c.path[2]));
        return { what: `Airtightness: ${f?.label ?? '?'}`, from: val(c.from), to: val(c.to) };
      }
      if (second === 'devices') {
        const d = b.vent.devices.find((x) => x.id === sid(c.path[2])) ?? a.vent.devices.find((x) => x.id === sid(c.path[2]));
        const opt = (v: unknown) => (typeof v === 'number' && d ? d.opts[v]?.[0] ?? String(v) : val(v));
        return { what: `${d?.name ?? 'Device'}, ${d ? room(d.room) : ''}`, from: opt(c.from), to: opt(c.to) };
      }
      return { what: `Ventilation ${String(second)}`, from: val(c.from), to: val(c.to) };
    }
    case 'hp': {
      // A datasheet shows as its model name, whichever part of it changed.
      if (second === 'co2') return { what: `Carbon factor, ${c.path[2] === 'elec' ? 'electricity' : FUEL_LABEL[c.path[2] as Fuel] ?? String(c.path[2])}, kgCO₂/kWh`, from: val(c.from), to: val(c.to) };
      if (second === 'sheet') return { what: 'Heat pump datasheet', from: a.hp.sheet ? a.hp.sheet.model || 'datasheet' : '—', to: b.hp.sheet ? b.hp.sheet.model || 'datasheet' : '—' };
      const lab = (v: unknown) => SOURCE_LABEL[v as HeatSource] ?? FUEL_LABEL[v as Fuel] ?? val(v);
      return { what: HP_FIELD[String(second)] ?? `Heat source ${field || String(second)}`, from: lab(c.from), to: lab(c.to) };
    }
    default: return { what: c.path.map((s) => (typeof s === 'string' ? s : s.id)).join(' › '), from: val(c.from), to: val(c.to) };
  }
}

/** Changes that belong together: a room added or removed travels with its windows, emitters, devices and face choices. */
export interface ChangeGroup { key: string; head: Change; changes: Change[]; extra: number }

export function groupChanges(changes: Change[]): ChangeGroup[] {
  const roomOf = (c: Change) => (c.path[0] === 'rooms' && c.path.length === 2 && typeof c.path[1] !== 'string' && (c.from === undefined || c.to === undefined) ? c.path[1].id : null);
  const whole = new Map<string, ChangeGroup>();
  for (const c of changes) { const id = roomOf(c); if (id) whole.set(id, { key: c.key, head: c, changes: [c], extra: 0 }); }
  const belongs = (c: Change): string | null => {
    const v = (c.to ?? c.from) as { room?: string } | undefined;
    if (v && typeof v === 'object' && typeof v.room === 'string' && whole.has(v.room) && (c.from === undefined || c.to === undefined)) return v.room;
    if (c.path[0] === 'faceBuildup' || c.path[0] === 'faceBoundary') {
      const k = String(c.path[1]);
      for (const id of whole.keys()) if (k.split(/[:|]/).includes(id)) return id;
    }
    return null;
  };
  const out: ChangeGroup[] = [];
  for (const c of changes) {
    if (roomOf(c)) { out.push(whole.get(roomOf(c)!)!); continue; }
    const id = belongs(c);
    if (id) { const g = whole.get(id)!; g.changes.push(c); g.extra++; } else out.push({ key: c.key, head: c, changes: [c], extra: 0 });
  }
  return out;
}

/** Peak and annual figures after each change (or group of changes) in turn: the waterfall. */
export function steps(parent: House, changes: Array<Change | ChangeGroup>) {
  const flat = (x: Change | ChangeGroup) => ('changes' in x ? x.changes : [x]);
  const r0 = calcHouse(parent);
  const out = [{ peakW: r0.peakW, kwh: r0.annualKWh, cost: r0.hp.cost }];
  for (let i = 1; i <= changes.length; i++) {
    const r = calcHouse(applyChanges(parent, changes.slice(0, i).flatMap(flat)));
    out.push({ peakW: r.peakW, kwh: r.annualKWh, cost: r.hp.cost });
  }
  return out;
}

const KEY = 'insulation-visualiser.house-project.v1';

export function newProject(house: House = defaultHouse()): Project {
  return { v: 1, active: 'base', scenarios: [{ id: 'base', name: 'As built', kind: 'base', parent: null, house }] };
}

/** A project read from storage or a file, with unusable scenarios dropped and older houses upgraded; null if nothing usable. */
export function sanitizeProject(p: unknown): Project | null {
  const q = p as Project | null;
  if (!q || q.v !== 1 || !Array.isArray(q.scenarios)) return null;
  const valid = q.scenarios.filter((s) => s && typeof s.id === 'string' && s.house && Array.isArray(s.house.rooms) && Array.isArray(s.house.buildups) && Array.isArray(s.house.storeys));
  // Older saves kept tracing in every house, keyed by storey: take the first scenario's, keyed by level.
  const old = (valid[0]?.house as { trace?: TraceSettings } | undefined)?.trace;
  const trace = q.trace ?? (old && { ...old, images: Object.fromEntries(Object.entries(old.images ?? {}).map(([s, im]) => [storeyLevel(valid[0].house, +s), im])) });
  const scenarios = valid.map((s) => { const { trace: _t, ...house } = s.house as House & { trace?: unknown }; return { ...s, house: upgradeHouse(house) }; });
  // A scenario whose parent was dropped hangs off the first one instead.
  const ids = new Set(scenarios.map((s) => s.id));
  scenarios.forEach((s, i) => { if (i > 0 && (!s.parent || !ids.has(s.parent))) s.parent = scenarios[0].id; if (i === 0) s.parent = null; });
  if (!scenarios.length) return null;
  return { v: 1, scenarios, active: scenarios.some((s) => s.id === q.active) ? q.active : scenarios[0].id, ...(trace ? { trace } : {}) };
}

/** True once a project (or an older single-house save) has been stored: false on a first visit, which opens the start screen. */
export function hasSavedProject(): boolean {
  try {
    return !!(localStorage.getItem(KEY) || localStorage.getItem('insulation-visualiser.house.v1'));
  } catch {
    return false;
  }
}

/** Saved project; an older single-house save becomes the base scenario. */
export function loadProject(): Project {
  try {
    const p = sanitizeProject(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    if (p) return p;
  } catch {
    // fall through to a fresh project
  }
  return newProject(loadHouse());
}

/** Ancestors first, ending with the scenario itself. */
export function chain(p: Project, id: string): Scenario[] {
  const out: Scenario[] = [];
  for (let s = p.scenarios.find((x) => x.id === id); s && out.length < 50; s = p.scenarios.find((x) => x.id === s!.parent)) out.unshift(s);
  return out;
}
