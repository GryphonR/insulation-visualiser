// Controls (board 3b, the system diagram): valves on the pipe runs, and the modes that set them. A mode is one state of the
// system (heating, hot water, a zone alone, cooling): the water it sends (hot, chilled or none) and each valve's position.
// Which runs carry water in a mode follows from the valves on the way from the heat source.
import type { House } from './house';
import type { Pipe } from './house-pipes';
import { mergeCircuits, splitCircuits } from './house-pipes';
import type { Emitter } from './house-heating';
import { canCool, coolingOn, zonePart } from './house-heating';

/** A 2-port valve is open or shut; a 3-port sends flow to port A, port B, or both (mid position, Y plan only). */
export type Pos = 'open' | 'shut' | 'A' | 'B' | 'AB';
export interface Valve {
  id: string; name: string;
  /** 'two': opens or shuts the runs in `runs`. 'three': sends flow to port A (`runs`) and/or port B (`b`). */
  kind: 'two' | 'three';
  runs: string[]; b?: string[];
  /** A 3-port with a mid position can feed both ports at once (Y plan); a diverter (W plan, heat pumps) cannot. */
  mid?: boolean;
}
export type Water = 'hot' | 'chilled' | 'off';
export interface Mode {
  id: string; name: string; water: Water;
  /** Each valve's position; a valve left out is open (2-port), or on port B (3-port; both ports if it has a mid position). */
  valves: Record<string, Pos>;
  /** The source heats hot water itself (a combi's plate heat exchanger), so no run needs to be open. */
  internal?: boolean;
}
export type PlanKind = 'y' | 's' | 'splus' | 'w' | 'hp' | 'combi';
export interface Controls { plan: PlanKind | 'custom'; valves: Valve[]; modes: Mode[] }

export const PLANS: Record<PlanKind, { name: string; note: string }> = {
  y: { name: 'Y plan', note: 'One 3-port mid-position valve shares the boiler between heating and hot water, either or both at once.' },
  s: { name: 'S plan', note: 'Two 2-port zone valves, one for heating and one for hot water, each opened by its own thermostat.' },
  splus: { name: 'S plan plus', note: 'A 2-port zone valve for each heating zone and one for hot water, so zones run on their own.' },
  w: { name: 'W plan', note: 'A 3-port diverter with hot water priority: heating stops while the cylinder reheats.' },
  hp: { name: 'Heat pump', note: 'A diverter for hot water priority, zone valves when there are zones, and valves that shut the radiators off while cooling.' },
  combi: { name: 'Combi', note: 'No cylinder: the boiler diverts inside itself to a plate heat exchanger for hot water, so heating pauses.' },
};

/** The run that feeds the cylinder coil. */
export const isCylRun = (p: Pipe) => p.ends?.[1] === 'cylinder';
/** A UFH zone whose manifold is placed on the heating layout, so a run to it feeds all its loops. */
export const placedManifold = (h: House, zone: string) => { const z = h.heating.zones.find((x) => x.id === zone && x.kind === 'ufh'); return z?.manifold?.storey != null ? z : undefined; };
/** The emitters a run feeds: its own (every room's part, for a UFH zone's loop), or every UFH loop on the placed manifold at its end. */
export function runEmitters(h: House, p: Pipe): string[] {
  if (p.emitter) {
    const e = h.heating.emitters.find((x) => x.id === p.emitter);
    // A later part of a zone is fed by the first part's run; a run of its own from before zones were one loop feeds nothing.
    return !e?.fromZone ? [p.emitter] : zonePart(h, e) ? [] : h.heating.emitters.filter((x) => x.fromZone === e.fromZone).map((x) => x.id);
  }
  const m = p.ends?.[1]?.startsWith('m:') ? p.ends[1].slice(2) : '';
  return m && placedManifold(h, m) ? h.heating.emitters.filter((e) => e.kind === 'ufh' && e.zone === m).map((e) => e.id) : [];
}
/** A 3-port's tee: its port A and port B runs, when each port is one run and both leave the same junction; else null. */
export function teeOf(h: House, v: Valve): { a: Pipe; b: Pipe } | null {
  const pipes = h.heating.pipes ?? [], ids = new Set(pipes.map((p) => p.id));
  const a = v.runs.length === 1 ? pipes.find((p) => p.id === v.runs[0]) : undefined, b = v.b?.length === 1 ? pipes.find((p) => p.id === v.b![0]) : undefined;
  const up = (p: Pipe) => (p.parent && ids.has(p.parent) ? p.parent : null);
  return a && b && up(a) === up(b) ? { a, b } : null;
}
export const posOf =(v: Valve, m: Mode): Pos => m.valves[v.id] ?? (v.kind === 'two' ? 'open' : v.mid ? 'AB' : 'B');
/** Whether flow gets past valve v into run `run` with the valve at `pos`. */
export function passes(v: Valve, pos: Pos, run: string): boolean {
  if (v.kind === 'two') return !v.runs.includes(run) || pos === 'open';
  if (v.runs.includes(run)) return pos === 'A' || pos === 'AB';
  if (v.b?.includes(run)) return pos === 'B' || pos === 'AB';
  return true;
}

/** The modes in use: the control plan's, else one with everything open on hot water (and one on chilled water if cooling is on). */
export function modesOf(h: House): Mode[] {
  const c = h.heating.controls;
  if (c) return c.modes;
  return [{ id: 'heat', name: 'Heating', water: 'hot', valves: {} }, ...(coolingOn(h) ? [{ id: 'cool', name: 'Cooling', water: 'chilled' as const, valves: {} }] : [])];
}

/** Runs that carry water in a mode: every valve between the source and the run lets it through. */
export function openRuns(h: House, m: Mode): Set<string> {
  const pipes = h.heating.pipes ?? [], byId = new Map(pipes.map((p) => [p.id, p])), valves = h.heating.controls?.valves ?? [];
  const out = new Set<string>();
  if (m.water === 'off') return out;
  const memo = new Map<string, boolean>();
  const open = (p: Pipe, n = 0): boolean => {
    if (memo.has(p.id)) return memo.get(p.id)!;
    const up = p.parent ? byId.get(p.parent) : undefined;
    const ok = valves.every((v) => passes(v, posOf(v, m), p.id)) && (!up || n > 50 || open(up, n + 1));
    memo.set(p.id, ok);
    return ok;
  };
  for (const p of pipes) if (open(p)) out.add(p.id);
  return out;
}

/** What a mode reaches: the emitters on open runs and whether the cylinder coil is fed. */
export function reach(h: House, m: Mode): { emitters: Set<string>; cylinder: boolean; runs: Set<string> } {
  const runs = openRuns(h, m), pipes = (h.heating.pipes ?? []).filter((p) => runs.has(p.id));
  return { runs, emitters: new Set(pipes.flatMap((p) => runEmitters(h, p))), cylinder: pipes.some(isCylRun) };
}

/**
 * Emitters that ever get hot water, and the cooling emitters that ever get chilled water. With no pipework every emitter
 * counts (nothing is known to shut it off); a radiator on chilled water never cools.
 */
export function served(h: House): { heated: Set<string>; cooled: Set<string> } {
  const all = h.heating.emitters;
  if (!(h.heating.pipes ?? []).length) return { heated: new Set(all.map((e) => e.id)), cooled: new Set(all.filter(canCool).map((e) => e.id)) };
  const heated = new Set<string>(), cooled = new Set<string>();
  for (const m of modesOf(h)) {
    if (m.water === 'off') continue;
    // An emitter without a run is still taken as heated: the pipework page flags it as unpiped.
    for (const id of reach(h, m).emitters) (m.water === 'hot' ? heated : cooled).add(id);
  }
  const piped = new Set((h.heating.pipes ?? []).flatMap((p) => runEmitters(h, p)));
  for (const e of all) if (!piped.has(e.id)) { heated.add(e.id); if (canCool(e)) cooled.add(e.id); }
  for (const id of [...cooled]) if (!canCool(all.find((e) => e.id === id) ?? { kind: 'radiator' })) cooled.delete(id);
  return { heated, cooled };
}

// --- Finding where valves go ---------------------------------------------------------------------

type Term = { e: Emitter } | { cyl: true };
/** Runs by parent (a run whose parent is gone counts as leaving the source). */
function kidsOf(h: House): Map<string | null, Pipe[]> {
  const pipes = h.heating.pipes ?? [], ids = new Set(pipes.map((p) => p.id)), m = new Map<string | null, Pipe[]>();
  for (const p of pipes) { const k = p.parent && ids.has(p.parent) ? p.parent : null; m.set(k, [...(m.get(k) ?? []), p]); }
  return m;
}

/**
 * The biggest runs that lead only to what `ok` accepts (emitters or the cylinder): where one valve shuts all of those off
 * and nothing else. Runs that lead nowhere are ignored.
 */
export function pureRoots(h: House, ok: (t: Term) => boolean): string[] {
  const kids = kidsOf(h), out: string[] = [];
  const own = (p: Pipe): Term[] => {
    const es = runEmitters(h, p).flatMap((id) => h.heating.emitters.filter((x) => x.id === id));
    return es.length ? es.map((e) => ({ e })) : isCylRun(p) ? [{ cyl: true }] : [];
  };
  // 'none': leads nowhere, 'pure': only accepted ends, 'mixed': at least one other.
  const walk = (p: Pipe, n: number): 'none' | 'pure' | 'mixed' => {
    const ks = n > 50 ? [] : (kids.get(p.id) ?? []).map((c) => [c, walk(c, n + 1)] as const);
    const t = own(p);
    const st = ks.some(([, s]) => s === 'mixed') || t.some((x) => !ok(x)) ? 'mixed' : ks.some(([, s]) => s === 'pure') || t.length ? 'pure' : 'none';
    if (st === 'mixed') for (const [c, s] of ks) if (s === 'pure') out.push(c.id);
    return st;
  };
  for (const r of kids.get(null) ?? []) if (walk(r, 0) === 'pure') out.push(r.id);
  return out;
}

const nextId = (pipes: Pipe[]) => { let n = pipes.length + 1; while (pipes.some((p) => p.id === `P${n}`)) n++; return `P${n}`; };

/** Several runs off the same tee get a short header so one valve shuts them all; returns the runs the valve sits on (edits h in place). */
function header(h: House, runs: string[], name: string): string[] {
  const pipes = h.heating.pipes ?? [], rs = pipes.filter((p) => runs.includes(p.id));
  if (rs.length < 2 || rs.some((p) => p.parent !== rs[0].parent)) return runs;
  const up = pipes.find((p) => p.id === rs[0].parent);
  const hd: Pipe = { id: nextId(pipes), name, parent: rs[0].parent, size: up?.size ?? 'Cu 28 mm', length: 0.5, typed: true, header: true };
  pipes.push(hd);
  for (const p of rs) p.parent = hd.id;
  return [hd.id];
}

/** Take out the headers a plan put in; the runs off them go back to the run before (edits h in place). */
function stripHeaders(h: House): void {
  const pipes = h.heating.pipes ?? [], hs = new Map(pipes.filter((p) => p.header).map((p) => [p.id, p]));
  if (!hs.size) return;
  // Headers can sit under headers (zones under the heating circuit): climb past all of them.
  const up = (id: string | null | undefined) => { for (let n = 0; id && hs.has(id) && n < 50; n++) id = hs.get(id)!.parent; return id; };
  h.heating.pipes = pipes.filter((p) => !p.header).map((p) => (p.parent && hs.has(p.parent) ? { ...p, parent: up(p.parent) ?? null } : p));
}

/**
 * Put in a control plan: the valves where it needs them (with headers where several runs share one valve) and its modes.
 * null takes the controls out. Returns why it cannot be done, or null (edits h in place).
 */
export function applyPlan(h: House, plan: PlanKind | null): string | null {
  const pipes = h.heating.pipes ?? [];
  if (plan && !pipes.length) return 'Lay out the pipework first, on the Pipework page or the plan.';
  const hasCyl = pipes.some(isCylRun);
  if (plan && (plan === 'y' || plan === 's' || plan === 'w') && !hasCyl) return `The ${PLANS[plan].name} switches a hot water cylinder: place and pipe the cylinder first, or choose S plan plus, Heat pump or Combi.`;
  if (plan === 'combi' && hasCyl) return 'A combi has no cylinder: take the cylinder off the plan, or choose another plan.';
  stripHeaders(h);
  // Any earlier plan's runs per circuit become one again, so removing the valves gives back the pipework as drawn.
  mergeCircuits(h);
  if (!plan) { delete h.heating.controls; return null; }
  const V: Valve[] = [];
  const valve = (v: Omit<Valve, 'id'>) => { const x = { id: `V${V.length + 1}`, ...v }; V.push(x); return x; };
  const isEm = (t: Term): t is { e: Emitter } => 'e' in t;
  const piped = h.heating.emitters.filter((e) => pipes.some((p) => runEmitters(h, p).includes(e.id)));
  const zones = h.heating.zones.filter((z) => piped.some((e) => e.zone === z.id));
  const unzoned = piped.some((e) => !zones.some((z) => z.id === e.zone));
  const zoned = plan === 'splus' || (plan === 'hp' && zones.length + (unzoned ? 1 : 0) >= 2);
  const cools = plan === 'hp' && piped.some(canCool);
  let dhw: Valve | undefined, dhw2: Valve | undefined, ch: Valve | undefined;
  // Each valve is one body: trunks shared by circuits it switches apart (hot water and heating, and each zone when zoned) become a
  // run per circuit along the same route, so each circuit leaves from one tee.
  const zoneOf = (id: string) => { const z = h.heating.emitters.find((e) => e.id === id)?.zone; return zones.some((q) => q.id === z) ? `Zone ${z}` : 'No zone'; };
  if (plan !== 'combi') splitCircuits(h, (p) => (isCylRun(p) ? 'Hot water' : !runEmitters(h, p).length ? null : zoned ? zoneOf(runEmitters(h, p)[0]) : 'Heating'));
  if (hasCyl && (plan === 'y' || plan === 'w' || plan === 'hp')) {
    const a = header(h, pureRoots(h, (t) => !isEm(t)), 'Hot water circuit'), b = header(h, pureRoots(h, isEm), 'Heating circuit');
    dhw = valve({ name: plan === 'y' ? 'Mid-position valve' : 'Diverter valve', kind: 'three', runs: a, b, mid: plan === 'y' });
  }
  if (hasCyl && (plan === 's' || plan === 'splus')) dhw2 = valve({ name: 'Hot water zone valve', kind: 'two', runs: header(h, pureRoots(h, (t) => !isEm(t)), 'Hot water circuit') });
  if (plan === 's') ch = valve({ name: 'Heating zone valve', kind: 'two', runs: header(h, pureRoots(h, isEm), 'Heating circuit') });
  if (plan === 'combi') ch = valve({ name: 'Diverter (inside the boiler)', kind: 'two', runs: header(h, pureRoots(h, isEm), 'Heating circuit') });
  const zv: Array<{ name: string; v: Valve; ok: (e: Emitter) => boolean }> = [];
  if (zoned) {
    const groups = [...zones.map((z) => ({ name: z.name, ok: (e: Emitter) => e.zone === z.id })), ...(unzoned ? [{ name: 'No zone', ok: (e: Emitter) => !zones.some((z) => z.id === e.zone) }] : [])];
    for (const g of groups) {
      const runs = header(h, pureRoots(h, (t) => isEm(t) && g.ok(t.e)), `Zone: ${g.name}`);
      if (runs.length) zv.push({ name: g.name, ok: g.ok, v: valve({ name: `Zone valve: ${g.name}`, kind: 'two', runs }) });
    }
  }
  // Zones with only radiators and towel rails are shut in cooling by their own zone valves; a separate isolation valve only when they don't cover them all.
  const heatOnly = cools ? zv.filter((z) => piped.filter(z.ok).every((e) => !canCool(e))) : [];
  const warm = piped.filter((e) => !canCool(e)), covered = warm.every((e) => heatOnly.some((z) => z.ok(e)));
  const iso = cools && warm.length && !covered ? valve({ name: 'Radiator isolation (cooling)', kind: 'two', runs: header(h, pureRoots(h, (t) => isEm(t) && !canCool(t.e)), 'Radiators') }) : undefined;
  const coolShut: Array<[Valve | undefined, Pos]> = [[iso, 'shut'], ...(covered ? heatOnly.map((z) => [z.v, 'shut'] as [Valve, Pos]) : [])];

  const set = (over: Array<[Valve | undefined, Pos]>): Record<string, Pos> => {
    const out: Record<string, Pos> = {};
    for (const v of V) out[v.id] = v.kind === 'two' ? 'open' : 'B';
    for (const [v, p] of over) if (v) out[v.id] = p;
    return out;
  };
  const shutZones = zv.map((z) => [z.v, 'shut'] as [Valve, Pos]);
  const M: Mode[] = [{ id: 'off', name: 'Off', water: 'off', valves: set([]) }];
  M.push({ id: 'heat', name: 'Heating', water: 'hot', valves: set([[dhw, 'B'], [dhw2, 'shut']]) });
  if (zv.length > 1) for (const z of zv) M.push({ id: `heat-${z.v.id}`, name: `Heating: ${z.name}`, water: 'hot', valves: set([[dhw, 'B'], [dhw2, 'shut'], ...shutZones, [z.v, 'open']]) });
  if (dhw || dhw2) M.push({ id: 'dhw', name: 'Hot water', water: 'hot', valves: set([[dhw, 'A'], [dhw2, 'open'], [ch, 'shut'], ...shutZones, [iso, 'shut']]) });
  if (plan === 'combi') M.push({ id: 'dhw', name: 'Hot water', water: 'hot', internal: true, valves: set([[ch, 'shut']]) });
  if (plan === 'y' || plan === 's' || plan === 'splus') M.push({ id: 'both', name: 'Heating + hot water', water: 'hot', valves: set([[dhw, 'AB'], [dhw2, 'open']]) });
  if (cools) M.push({ id: 'cool', name: 'Cooling', water: 'chilled', valves: set([[dhw, 'B'], ...coolShut]) });
  h.heating.controls = { plan, valves: V, modes: M };
  return null;
}

/** The control plan's modes and valves after an edit by hand: still the same valves and modes, but now its own ('custom'). */
export function markCustom(h: House): void { if (h.heating.controls) h.heating.controls.plan = 'custom'; }

/** What a mode does, in words: "Heats 6 emitters, reheats the cylinder". */
export function modeSummary(h: House, m: Mode): string {
  if (m.water === 'off') return 'Pump off, nothing flows';
  const r = reach(h, m), n = r.emitters.size, cool = m.water === 'chilled';
  const parts = [n ? `${cool ? 'Cools through' : 'Heats'} ${n} emitter${n === 1 ? '' : 's'}` : '', r.cylinder ? 'reheats the cylinder' : '', m.internal ? 'hot water from the plate heat exchanger' : ''].filter(Boolean);
  return parts.length ? parts.join(', ').replace(/^./, (c) => c.toUpperCase()) : 'Every circuit shut';
}

/** Problems with the valves and modes: shut-off circuits, radiators on chilled water, emitters never heated. */
export function controlChecks(h: House): Array<{ level: 'error' | 'warn'; text: string }> {
  const c = h.heating.controls, out: Array<{ level: 'error' | 'warn'; text: string }> = [];
  const pipes = h.heating.pipes ?? [], ids = new Set(pipes.map((p) => p.id));
  const emName = (id: string) => { const e = h.heating.emitters.find((x) => x.id === id); return e ? h.rooms.find((r) => r.id === e.room)?.name ?? e.room : id; };
  // No valves: everything is open, so only chilled water reaching radiators or the cylinder needs saying.
  if (!c) {
    if (!pipes.length || !coolingOn(h)) return out;
    const r = reach(h, modesOf(h).find((m) => m.water === 'chilled')!);
    const sweat = [...r.emitters].filter((id) => !canCool(h.heating.emitters.find((e) => e.id === id) ?? { kind: 'radiator' }));
    if (sweat.length) out.push({ level: 'error', text: `Cooling: with no valves, chilled water reaches ${sweat.length > 1 ? 'radiators or towel rails' : 'a radiator or towel rail'} in ${[...new Set(sweat.map(emName))].join(', ')}, which drip with condensation. Add a control plan on the System diagram to shut them off.` });
    if (r.cylinder) out.push({ level: 'error', text: 'Cooling: with no valves, chilled water reaches the cylinder coil and would cool the hot water.' });
    return out;
  }
  for (const v of c.valves) {
    const gone = [...v.runs, ...(v.b ?? [])].filter((r) => !ids.has(r));
    if (gone.length) out.push({ level: 'warn', text: `${v.id} ${v.name} sits on runs that are gone (${gone.join(', ')}); move it or apply the plan again.` });
    if (!v.runs.length && !(v.b ?? []).length) out.push({ level: 'warn', text: `${v.id} ${v.name} is on no run, so it does nothing.` });
    else if (v.kind === 'three' && !teeOf(h, v)) out.push({ level: 'warn', text: `${v.id} ${v.name} is a 3-port valve, so it sits at a tee: port A and port B should each be one run off the same junction. Move a port, or apply the plan again.` });
  }
  const hp = h.hp.source === 'ashp' || h.hp.source === 'gshp';
  if (!h.heating.coilW && c.modes.some((m) => m.water === 'hot' && !m.internal && reach(h, m).cylinder)) out.push({ level: 'warn', text: 'Hot water: the cylinder coil reheat is not entered, so the hot water runs carry no flow and are not sized for it. Enter it from the cylinder\'s datasheet on the System diagram.' });
  for (const m of c.modes) {
    if (m.water === 'off') continue;
    const r = reach(h, m);
    for (const v of c.valves) if (v.kind === 'three' && !v.mid && posOf(v, m) === 'AB') out.push({ level: 'warn', text: `${m.name}: ${v.name} is a diverter and has no mid position, so it cannot feed both ports.` });
    if (!r.emitters.size && !r.cylinder && !m.internal) out.push({ level: 'warn', text: `${m.name}: every circuit is shut, so the pump runs against closed valves. Fit an automatic bypass, or set the mode to off.` });
    if (m.water === 'chilled') {
      const sweat = [...r.emitters].filter((id) => !canCool(h.heating.emitters.find((e) => e.id === id) ?? { kind: 'radiator' }));
      if (sweat.length) out.push({ level: 'error', text: `${m.name}: chilled water reaches ${sweat.length > 1 ? 'radiators or towel rails' : 'a radiator or towel rail'} in ${[...new Set(sweat.map(emName))].join(', ')}, which cool little and drip with condensation. Shut them off in this mode.` });
      if (r.cylinder) out.push({ level: 'error', text: `${m.name}: chilled water reaches the cylinder coil and would cool the hot water.` });
      if (!hp) out.push({ level: 'error', text: `${m.name}: a boiler cannot cool; only a reversible heat pump can.` });
      else if (!coolingOn(h)) out.push({ level: 'warn', text: `${m.name}: cooling is off under Heating › Source & flow, so this mode is never used.` });
    }
    if (m.water === 'hot' && hp && r.cylinder && r.emitters.size) out.push({ level: 'warn', text: `${m.name}: a heat pump heats the cylinder at a higher flow than the heating needs; most divert to one or the other.` });
  }
  const { heated } = served(h);
  const never = h.heating.emitters.filter((e) => pipes.some((p) => runEmitters(h, p).includes(e.id)) && !heated.has(e.id));
  if (never.length) out.push({ level: 'warn', text: `No mode heats ${[...new Set(never.map((e) => emName(e.id)))].join(', ')}.` });
  if (pipes.some(isCylRun) && !c.modes.some((m) => m.water === 'hot' && reach(h, m).cylinder)) out.push({ level: 'warn', text: 'No mode reheats the cylinder.' });
  return out;
}

export type Use = 'heat' | 'dhw' | 'cool' | 'idle';
/** What each run carries in a mode: water for heating, for the cylinder alone, chilled water, or nothing (drawing and animation). */
export function runUse(h: House, m: Mode): Map<string, Use> {
  const open = openRuns(h, m), kids = kidsOf(h), out = new Map<string, Use>();
  // Whether an open run leads to an emitter, and to the cylinder.
  const walk = (p: Pipe, n: number): { em: boolean; cyl: boolean } => {
    let em = runEmitters(h, p).length > 0, cyl = isCylRun(p);
    for (const c of n > 50 ? [] : kids.get(p.id) ?? []) if (open.has(c.id)) { const r = walk(c, n + 1); em ||= r.em; cyl ||= r.cyl; }
    out.set(p.id, m.water === 'chilled' ? 'cool' : cyl && !em ? 'dhw' : 'heat');
    return { em, cyl };
  };
  for (const r of kids.get(null) ?? []) if (open.has(r.id)) walk(r, 0);
  for (const p of h.heating.pipes ?? []) if (!out.has(p.id)) out.set(p.id, 'idle');
  return out;
}
