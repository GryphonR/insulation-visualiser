// Scenarios (board 5): each scenario is a full copy of the house plus its parent. Its changes are the
// difference from the parent, so they can be listed, switched off one by one and applied step by step.
import { buildupU, calcHouse } from './house';
import type { House } from './house';
import { defaultHouse, loadHouse } from './house-default';

export type Seg = string | { id: string };
export interface Change { key: string; path: Seg[]; from: unknown; to: unknown }
export interface Scenario { id: string; name: string; kind: 'base' | 'plan' | 'whatif'; parent: string | null; house: House }
export interface Project { v: 1; scenarios: Scenario[]; active: string }

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
    default: return { what: c.path.map((s) => (typeof s === 'string' ? s : s.id)).join(' › '), from: val(c.from), to: val(c.to) };
  }
}

/** Peak and annual figures after each change in turn (the waterfall). */
export function steps(parent: House, changes: Change[]) {
  const r0 = calcHouse(parent);
  const out = [{ peakW: r0.peakW, kwh: r0.annualKWh }];
  for (let i = 1; i <= changes.length; i++) {
    const r = calcHouse(applyChanges(parent, changes.slice(0, i)));
    out.push({ peakW: r.peakW, kwh: r.annualKWh });
  }
  return out;
}

const KEY = 'insulation-visualiser.house-project.v1';

export function newProject(house: House = defaultHouse()): Project {
  return { v: 1, active: 'base', scenarios: [{ id: 'base', name: 'As built', kind: 'base', parent: null, house }] };
}

/** Saved project; an older single-house save becomes the base scenario. */
export function loadProject(): Project {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && p.v === 1 && Array.isArray(p.scenarios) && p.scenarios.length) {
      const d = defaultHouse();
      const scenarios = p.scenarios.filter((s: Scenario) => s && typeof s.id === 'string' && s.house && Array.isArray(s.house.rooms))
        .map((s: Scenario) => ({ ...s, house: { ...d, ...s.house, vent: { ...d.vent, ...s.house.vent }, gains: { ...d.gains, ...s.house.gains } } }));
      if (scenarios.length) return { v: 1, scenarios, active: scenarios.some((s: Scenario) => s.id === p.active) ? p.active : scenarios[0].id };
    }
  } catch {
    // fall through to a fresh project
  }
  return newProject(loadHouse());
}

export function saveProject(p: Project): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private browsing or full storage: the project just won't persist.
  }
}

/** Ancestors first, ending with the scenario itself. */
export function chain(p: Project, id: string): Scenario[] {
  const out: Scenario[] = [];
  for (let s = p.scenarios.find((x) => x.id === id); s && out.length < 50; s = p.scenarios.find((x) => x.id === s!.parent)) out.unshift(s);
  return out;
}
