// Pipe sizing (board 3): a tree of pipe runs from the heat pump, flows from the emitters each run serves,
// velocity and pressure drop per run, and the index circuit against the pump's available head.
import type { House, HouseResult } from './house';
import { pointInPoly } from './geom';
import type { Pt } from './geom';
import { calcHouse, onStorey, roomEdges, roomPoly } from './house';
import { emitterPose } from './house-draw';
import { emitterOut, lpm } from './house-heating';
import type { Emitter } from './house-heating';

/** Pipe sizes: label → internal diameter, mm. */
export const PIPE_SIZES: Record<string, number> = {
  'Cu 8 mm (microbore)': 6.0, 'Cu 10 mm (microbore)': 8.0, 'Cu 15 mm': 13.6, 'Cu 22 mm': 20.2, 'Cu 28 mm': 26.2, 'Cu 35 mm': 32.6,
  'PEX 16 mm': 12, 'PEX 20 mm': 16, 'PEX 25 mm': 20, 'PEX 32 mm': 26,
};
/** Design limits: velocity (m/s, lower for small bores to keep noise down) and pressure drop per metre (Pa/m). */
export const MAX_V = (id: number) => (id <= 8 ? 0.8 : id <= 14 ? 1.0 : 1.5);
/** Default cap on Pa/m, a common design limit for balancing and noise. */
export const MAX_PA_M = 300;
/** Allowance for fittings (bends, tees, valves) on top of the straight-pipe loss. */
const FITTINGS = 1.3;
/** Pressure drop across an emitter and its valves, Pa. */
const EMITTER_DP = 5000;

export interface Pipe {
  id: string; name: string;
  /** Upstream run, or null for the run leaving the heat pump. */
  parent: string | null;
  size: string; length: number;
  /** Emitter at the end of this run, if any. */
  emitter?: string;
  /** Its route on the plan, what its two ends are attached to ('source', 'cylinder', a riser id, or 'e:' + emitter id), and its climb between floors, m. */
  leg?: PipeLeg; ends?: [string, string]; rise?: number;
  /** The length was typed in, so it no longer follows the route. */
  typed?: boolean;
  /** Laid in the floor or the ceiling of its storey; unset, it follows the run it comes off on the same floor (else the floor). */
  via?: 'floor' | 'ceiling';
}

export interface PipeRow {
  pipe: Pipe; loadW: number; flowLpm: number; v: number; paM: number; dp: number;
  ok: boolean; why: string[]; index: boolean;
}
export interface PipeResult {
  rows: PipeRow[]; indexDp: number; indexPath: string[]; head: number; headOk: boolean; unpiped: string[];
  /** Each emitter's design load, W. */ emitterW: Map<string, number>;
  /** Pa/m each run may lose: the pump head shared along the longest circuit, or the cap if lower. */ paMax: number; longest: number;
  /** The pump's share alone (Infinity before there are runs), and the cap. */ paPump: number; paCap: number;
}

/**
 * Pressure budget per metre: the pump head, less the drop across the emitter and its valves, spread over the longest circuit
 * (flow and return, with the fittings allowance). A run within it keeps the circuit within the pump.
 */
export function paBudget(h: House): { paMax: number; longest: number; paPump: number; paCap: number } {
  const pipes = h.heating.pipes ?? [], byId = new Map(pipes.map((p) => [p.id, p]));
  let longest = 0;
  for (const p of pipes) {
    if (!p.emitter) continue;
    let L = 0, n = 0;
    for (let cur: Pipe | undefined = p; cur && n < 50; cur = cur.parent ? byId.get(cur.parent) : undefined, n++) L += runLength(h, cur);
    longest = Math.max(longest, L);
  }
  const head = (h.heating.pumpHead ?? 40) * 1000;
  const paCap = h.heating.paCap ?? MAX_PA_M, paPump = longest > 0 ? Math.max(1, (head - EMITTER_DP) / (2 * FITTINGS * longest)) : Infinity;
  return { paMax: Math.min(paCap, paPump), longest, paPump, paCap };
}

const RHO = 992, NU = 0.66e-6; // water at about 40 °C

/** Velocity (m/s) and pressure drop (Pa/m) for a flow in l/min through a pipe of internal diameter id (mm). */
export function pipeFlow(flowLpm: number, idMM: number): { v: number; paM: number } {
  const D = idMM / 1000, A = (Math.PI * D * D) / 4, Q = flowLpm / 60000;
  const v = A > 0 ? Q / A : 0, Re = (v * D) / NU;
  if (v <= 0) return { v: 0, paM: 0 };
  const f = Re < 2300 ? 64 / Re : 0.316 * Re ** -0.25; // laminar, else Blasius (smooth pipe)
  return { v, paM: ((f / D) * RHO * v * v) / 2 };
}

export function sizePipes(h: House, res: HouseResult): PipeResult {
  const pipes = h.heating.pipes ?? [], { paMax, longest, paPump, paCap } = paBudget(h);
  const flow = res.heat.designFlow;
  // Each emitter carries its share of its room's design loss (by output at the design flow).
  const load = new Map<string, number>();
  for (const r of res.rooms) {
    const ems = h.heating.emitters.filter((e) => e.room === r.room.id);
    const outs = ems.map((e) => emitterOut(e, flow, r.room.setpoint, h)), tot = outs.reduce((a, b) => a + b, 0);
    ems.forEach((e, i) => load.set(e.id, tot > 0 ? (r.totalW * outs[i]) / tot : 0));
  }
  const kids = (id: string) => pipes.filter((p) => p.parent === id);
  const memo = new Map<string, number>();
  const pipeLoad = (p: Pipe, seen = new Set<string>()): number => {
    if (memo.has(p.id)) return memo.get(p.id)!;
    if (seen.has(p.id)) return 0;
    seen.add(p.id);
    const w = (p.emitter ? load.get(p.emitter) ?? 0 : 0) + kids(p.id).reduce((a, c) => a + pipeLoad(c, seen), 0);
    memo.set(p.id, w);
    return w;
  };
  const rows: PipeRow[] = pipes.map((p) => {
    const loadW = pipeLoad(p), flowLpm = lpm(loadW, h.heating.dT), id = PIPE_SIZES[p.size] ?? 13.6;
    const { v, paM } = pipeFlow(flowLpm, id);
    const why: string[] = [];
    if (v > MAX_V(id)) why.push(`${v.toFixed(2)} m/s is over ${MAX_V(id)} m/s: noisy`);
    if (paM > paMax) why.push(`${Math.round(paM)} Pa/m is over the ${paMax < paCap ? "pump's" : ''} ${Math.round(paMax)} Pa/m limit`);
    return { pipe: p, loadW, flowLpm, v, paM, dp: paM * runLength(h, p) * FITTINGS, ok: !why.length, why, index: false };
  });
  // Index circuit: the path from the heat pump to an emitter with the highest total pressure drop.
  const byId = new Map(rows.map((r) => [r.pipe.id, r]));
  let indexDp = 0, indexPath: string[] = [];
  for (const r of rows) {
    if (!r.pipe.emitter) continue;
    const path: string[] = [];
    let dp = EMITTER_DP;
    for (let cur: PipeRow | undefined = r; cur && path.length < 50; cur = cur.pipe.parent ? byId.get(cur.pipe.parent) : undefined) { path.unshift(cur.pipe.id); dp += cur.dp * 2; } // flow and return
    if (dp > indexDp) { indexDp = dp; indexPath = path; }
  }
  for (const id of indexPath) byId.get(id)!.index = true;
  const head = (h.heating.pumpHead ?? 40) * 1000;
  const piped = new Set(pipes.map((p) => p.emitter).filter(Boolean));
  return { rows, indexDp, indexPath, head, headOk: indexDp <= head, unpiped: h.heating.emitters.filter((e) => !piped.has(e.id)).map((e) => e.id), emitterW: load, paMax, longest, paPump, paCap };
}

/** A pipe drawn on one storey's plan, as a path of points (m). */
export interface PipeLeg { storey: number; pts: Pt[] }
/** One storey's feed: where it comes up (the source itself, or a riser), the legs that get it there, and its rise between floors. */
interface Feed { hub: Pt; legs: PipeLeg[]; run: number; rise: number; riser?: string }
/** Every routed pipe: the storey feeds, and a tail from the feed to each emitter and to the cylinder. */
export interface PipeRoute { feeds: Map<number, Feed>; tails: Array<{ emitter?: string; cylinder?: true; storey: number; leg: PipeLeg; run: number }> }

// Pipes follow the walls and joists: along one axis then the other, turning inside the house where that is possible.
export const ell = (h: House, s: number, a: Pt, b: Pt): Pt[] => {
  const c: Pt = [b[0], a[1]], inside = h.rooms.some((r) => onStorey(r, s) && pointInPoly(c, roomPoly(r)));
  return tidy([a, inside ? c : [a[0], b[1]], b]);
};
const runOf = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
/** Height between two storeys' floors, m: room height plus floor zone of each storey crossed. */
const rise = (h: House, a: number, b: number) => { let t = 0; for (let k = Math.min(a, b); k < Math.max(a, b); k++) t += (h.storeys[k]?.h ?? 2.5) + (h.storeys[k + 1]?.zone ?? 0.25); return t; };

/** Lay pipes on the plan from the placed heat source: on its own storey straight to each emitter; to other storeys up whichever riser makes the runs shortest (straight up from the source if there are none). */
export function routePipes(h: House): PipeRoute | null {
  const src = h.heating.source;
  if (!src) return null;
  const risers = h.heating.risers ?? [];
  const ends = h.heating.emitters.flatMap((e) => {
    const r = h.rooms.find((x) => x.id === e.room), at = emitterPort(h, e) ?? undefined;
    return r && at ? [{ emitter: e.id as string | undefined, storey: r.storey, at }] : [];
  });
  const cyl = h.heating.cylinder;
  const all = cyl ? [...ends, { emitter: undefined, storey: cyl.storey, at: cyl.at }] : ends;
  const feeds = new Map<number, Feed>();
  for (const s of new Set(all.map((x) => x.storey))) {
    if (s === src.storey) { feeds.set(s, { hub: src.at, legs: [], run: 0, rise: 0 }); continue; }
    const here = all.filter((x) => x.storey === s);
    const cost = (p: Pt) => runOf(src.at, p) + here.reduce((t, x) => t + runOf(p, x.at), 0);
    // A placed riser is where pipes can pass the floors, so one is always used; with none, they go straight up from the source.
    const best = risers.length ? risers.reduce((b, r) => (cost(r.at) < cost(b.at) ? r : b)) : { id: undefined, at: src.at };
    const v = rise(h, src.storey, s);
    feeds.set(s, { hub: best.at, riser: best.id, run: runOf(src.at, best.at) + v, rise: v, legs: best.id ? [{ storey: src.storey, pts: ell(h, src.storey, src.at, best.at) }] : [] });
  }
  const tails = all.map((x) => {
    const hub = feeds.get(x.storey)!.hub;
    return { emitter: x.emitter, cylinder: x.emitter ? undefined : (true as const), storey: x.storey, leg: { storey: x.storey, pts: ell(h, x.storey, hub, x.at) }, run: runOf(hub, x.at) };
  });
  return { feeds, tails };
}

/**
 * Where a heater's pipes connect: a radiator or towel rail at its valve end (whichever end is nearer the heat source),
 * a UFH loop at its manifold, taken as the middle of the loop.
 */
export function emitterPort(h: House, e: Emitter): Pt | null {
  const ps = emitterPose(h, e);
  if (!ps || e.kind === 'ufh') return ps?.at ?? null;
  const half = (e.kind === 'towel' ? 0.5 : e.len / 1000) / 2, a = (ps.ang * Math.PI) / 180, d: Pt = [Math.cos(a) * half, Math.sin(a) * half];
  const ends: Pt[] = [[ps.at[0] - d[0], ps.at[1] - d[1]], [ps.at[0] + d[0], ps.at[1] + d[1]]].map((q) => [+q[0].toFixed(3), +q[1].toFixed(3)] as Pt);
  const src = h.heating.source?.at;
  return src && Math.hypot(ends[1][0] - src[0], ends[1][1] - src[1]) < Math.hypot(ends[0][0] - src[0], ends[0][1] - src[1]) ? ends[1] : ends[0];
}

const m1 = (v: number) => Math.max(0.5, Math.round(v * 10) / 10);

/** Typical pipework to start from: 28 mm primary, 22 mm to each storey, 15 mm (10 mm upstairs) tails, PEX to UFH loops. Measured from the plan when the heat source is placed. */
export function autoPipes(h: House): Pipe[] {
  const route = routePipes(h);
  if (route) return planPipes(h, route);
  const out: Pipe[] = [{ id: 'P1', name: 'Heat pump → manifold / tee', parent: null, size: 'Cu 28 mm', length: 8 }];
  let n = 1;
  h.storeys.forEach((s, si) => {
    const ems = h.heating.emitters.filter((e) => h.rooms.find((r) => r.id === e.room)?.storey === si);
    if (!ems.length) return;
    const branch = `P${++n}`;
    out.push({ id: branch, name: `To ${s.name.toLowerCase()}`, parent: 'P1', size: 'Cu 22 mm', length: 6 + 3 * si });
    for (const e of ems) {
      const room = h.rooms.find((r) => r.id === e.room)?.name ?? e.room;
      out.push({ id: `P${++n}`, name: `${room} ${e.kind === 'ufh' ? 'UFH loop' : e.kind === 'towel' ? 'towel rail' : e.id}`, parent: branch,
        size: e.kind === 'ufh' ? `PEX ${e.pipe ?? 16} mm` : si === 0 ? 'Cu 15 mm' : 'Cu 10 mm (microbore)', length: e.kind === 'ufh' ? 3 : 5, emitter: e.id });
    }
  });
  return out;
}

/** The pipe tree from a routed plan: lengths are the measured runs, sizes as in the typical layout. */
function planPipes(h: House, route: PipeRoute): Pipe[] {
  const src = h.heating.source!;
  const out: Pipe[] = [{ id: 'P1', name: `${h.hp.source === 'ashp' || h.hp.source === 'gshp' ? 'Heat pump' : 'Boiler'} → first tee`, parent: null, size: 'Cu 28 mm', length: 1 }];
  let n = 1;
  for (const [si, f] of [...route.feeds].sort((a, b) => a[0] - b[0])) {
    const s = h.storeys[si], hub = f.riser ?? 'source', other = si !== src.storey;
    // Runs on the source's own floor leave from the first tee; another floor's come off its branch.
    const branch = other ? `P${++n}` : 'P1';
    if (other) out.push({ id: branch, name: `To ${s?.name.toLowerCase() ?? `storey ${si}`}${f.riser ? ' (up the riser)' : other ? ' (through the floor)' : ''}`, parent: 'P1', size: 'Cu 22 mm', length: m1(f.run),
      ends: ['source', hub], rise: f.rise, ...(f.legs[0] ? { leg: f.legs[0] } : {}) });
    for (const t of route.tails.filter((x) => x.storey === si)) {
      const e = h.heating.emitters.find((x) => x.id === t.emitter), at = { leg: t.leg, ends: [hub, e ? `e:${e.id}` : 'cylinder'] as [string, string] };
      if (!e) { out.push({ id: `P${++n}`, name: 'Hot water cylinder coil', parent: branch, size: 'Cu 22 mm', length: m1(t.run), ...at }); continue; }
      const room = h.rooms.find((r) => r.id === e.room)?.name ?? e.room;
      out.push({ id: `P${++n}`, name: `${room} ${e.kind === 'ufh' ? 'UFH loop' : e.kind === 'towel' ? 'towel rail' : e.id}`, parent: branch,
        size: e.kind === 'ufh' ? `PEX ${e.pipe ?? 16} mm` : si === src.storey || si === 0 ? 'Cu 15 mm' : 'Cu 10 mm (microbore)', length: m1(t.run), emitter: e.id, ...at });
    }
  }
  return out;
}

// --- Editing routes on the plan ------------------------------------------------------------------

/** Where a run's end is attached now: the source, the cylinder, a riser, 'e:' + an emitter, or 'tee:' + the run it branches off (its far end). */
export function endPoint(h: House, id: string): Pt | null {
  if (id === 'source' || id === 'cylinder') return h.heating[id]?.at ?? null;
  if (id.startsWith('tee:')) { const p = h.heating.pipes?.find((x) => x.id === id.slice(4)), pts = p && livePath(h, p); return pts ? pts[pts.length - 1] : null; }
  if (id.startsWith('e:')) { const e = h.heating.emitters.find((x) => x.id === id.slice(2)); return (e && emitterPort(h, e)) ?? null; }
  return h.heating.risers?.find((r) => r.id === id)?.at ?? null;
}

const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
/** Drop repeated points and corners that lie on a straight line. */
export function tidy(pts: Pt[]): Pt[] {
  const out = pts.filter((q, i) => i === 0 || !same(q, pts[i - 1]));
  for (let i = out.length - 2; i >= 1; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(cross) < 1e-6 && dot >= 0) out.splice(i, 1);
  }
  return out;
}

/** A run's route with its ends moved to where they are attached now. The corner next to a moved end follows, so the run stays square. */
export function livePath(h: House, p: Pipe): Pt[] | null {
  if (!p.leg) return null;
  const orig = p.leg.pts, pts = orig.map((q) => [q[0], q[1]] as Pt);
  const [a, b] = (p.ends ?? ['', '']).map((id) => endPoint(h, id));
  // A run whose ends met when it was laid has a single point.
  if (pts.length <= 2) {
    const s0 = a ?? pts[0], s1 = b ?? pts[pts.length - 1];
    // Laid on the slant (drawn so, to follow a wall off the grid), it stays a straight line.
    const slant = pts.length === 2 && Math.abs(orig[0][0] - orig[1][0]) > 1e-6 && Math.abs(orig[0][1] - orig[1][1]) > 1e-6;
    return slant || Math.abs(s0[0] - s1[0]) < 1e-6 || Math.abs(s0[1] - s1[1]) < 1e-6 ? [s0, s1] : ell(h, p.leg.storey, s0, s1);
  }
  const follow = (end: number, nb: number, to: Pt | null) => {
    if (!to) return;
    if (Math.abs(orig[nb][1] - orig[end][1]) < 1e-6) pts[nb][1] = to[1];
    else if (Math.abs(orig[nb][0] - orig[end][0]) < 1e-6) pts[nb][0] = to[0];
    pts[end] = to;
  };
  follow(0, 1, a);
  follow(pts.length - 1, pts.length - 2, b);
  return pts;
}

const pathLen = (pts: Pt[]) => pts.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
/** A run's length, m: along its route plus its climb, unless it was typed in. */
export function runLength(h: House, p: Pipe): number {
  const pts = p.typed ? null : livePath(h, p);
  if (!pts) return p.length;
  const e = p.emitter ? h.heating.emitters.find((x) => x.id === p.emitter) : undefined;
  return Math.round((pathLen(pts) + (p.rise ?? 0) + (e ? valveTail(h, p.leg!.storey, viaOf(h, p), e.kind) : 0)) * 10) / 10;
}

/** Height of radiator valves above the floor, m. */
const VALVE = 0.15;
/** Where a run is laid: as set, else as the run it comes off on the same floor, else in the floor. */
export function viaOf(h: House, p: Pipe): 'floor' | 'ceiling' {
  for (let cur: Pipe | undefined = p, n = 0; cur?.leg && cur.leg.storey === p.leg?.storey && n < 50; n++) {
    if (cur.via) return cur.via;
    const up: string | null = cur.parent;
    cur = up ? h.heating.pipes?.find((x) => x.id === up) : undefined;
  }
  return 'floor';
}
/** The void a run lies in: void s is under storey s, so a storey's ceiling and the floor of the one above are the same void. -1 with no route. */
export const voidOf = (h: House, p: Pipe): number => (p.leg ? p.leg.storey + (viaOf(h, p) === 'ceiling' ? 1 : 0) : -1);
/** A void described by the storeys either side of it. */
export function voidName(h: House, v: number): string {
  const below = h.storeys[v - 1]?.name.toLowerCase(), above = h.storeys[v]?.name.toLowerCase();
  return !below ? `under the ${above}` : !above ? `above the ${below}, in the roof space` : `between the ${below} and ${above}`;
}

/**
 * The pipe from the void to a radiator's valves, m: from the middle of the floor void up to the valves, or from the middle of the
 * ceiling void (the floor zone above, or 0.2 m under a roof) down the wall to them. UFH is fed at floor level either way.
 */
export function valveTail(h: House, storey: number, via: 'floor' | 'ceiling', kind: string): number {
  if (kind === 'ufh') return 0;
  const s = h.storeys[storey];
  if (!s) return 0;
  return via === 'ceiling' ? s.h - VALVE + (h.storeys[storey + 1]?.zone ?? 0.2) / 2 : VALVE + s.zone / 2;
}

/** Slide segment i of a route sideways by d (the part along it is ignored). A segment at either end leaves its end where it is attached and gains a bend. */
export function dragSegment(pts: Pt[], i: number, d: Pt): Pt[] {
  const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Pt = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], m = d[0] * n[0] + d[1] * n[1];
  const mv = (q: Pt): Pt => [+(q[0] + n[0] * m).toFixed(3), +(q[1] + n[1] * m).toFixed(3)];
  return tidy([...pts.slice(0, i), ...(i === 0 ? [a] : []), mv(a), mv(b), ...(i + 1 === pts.length - 1 ? [b] : []), ...pts.slice(i + 2)]);
}

/** Cut segment i at the point nearest `at`, so either half can then be dragged on its own. */
export function splitSegment(pts: Pt[], i: number, at: Pt): Pt[] {
  const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / L2)), q: Pt = [+(a[0] + dx * t).toFixed(3), +(a[1] + dy * t).toFixed(3)];
  return [...pts.slice(0, i + 1), q, [q[0], q[1]], ...pts.slice(i + 1)];
}

/** Take a run out; the runs coming off it then come off the run it came off (edits h in place). */
export function removeRun(h: House, id: string): void {
  const p = h.heating.pipes?.find((x) => x.id === id);
  if (p) h.heating.pipes = h.heating.pipes!.filter((x) => x !== p).map((x) => (x.parent === id ? { ...x, parent: p.parent } : x));
}

/** Put a run back to a plain square route between its two ends (edits h in place). */
export function resetRun(h: House, id: string): void {
  const p = h.heating.pipes?.find((x) => x.id === id), [a, b] = (p?.ends ?? ['', '']).map((e) => endPoint(h, e));
  if (p?.leg && a && b) { p.leg = { storey: p.leg.storey, pts: ell(h, p.leg.storey, a, b) }; delete p.typed; }
}

/** Feed a floor's branch up a riser, or straight up from the source ('source'); its runs on that floor now start there (edits h in place). */
export function setBranchRiser(h: House, branchId: string, riser: string): void {
  const p = h.heating.pipes?.find((x) => x.id === branchId), src = h.heating.source, at = endPoint(h, riser);
  if (!p?.ends || !src || !at) return;
  p.ends = ['source', riser];
  if (riser === 'source') { delete p.leg; p.length = Math.round((p.rise ?? 0) * 10) / 10; }
  else p.leg = { storey: src.storey, pts: ell(h, src.storey, src.at, at) };
  delete p.typed;
  for (const c of h.heating.pipes!) if (c.parent === branchId && c.ends) { c.ends = [riser, c.ends[1]]; resetRun(h, c.id); }
}

const CU_UP = ['Cu 15 mm', 'Cu 22 mm', 'Cu 28 mm', 'Cu 35 mm'], PEX_UP = ['PEX 16 mm', 'PEX 20 mm', 'PEX 25 mm', 'PEX 32 mm'];
/** The most a pipe of internal diameter id (mm) can carry within the velocity and Pa/m limits, l/min. */
export function maxFlow(idMM: number, paMax = MAX_PA_M): number {
  let lo = 0, hi = 500;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, { v, paM } = pipeFlow(m, idMM); if (v <= MAX_V(idMM) && paM <= paMax) lo = m; else hi = m; }
  return lo;
}

/** The smallest pipe within the velocity and Pa/m limits for a flow, and no smaller than any pipe it feeds. */
export function fitSize(flowLpm: number, feeds: string[], paMax = MAX_PA_M): string {
  const list = feeds.some((f) => f.startsWith('PEX')) ? PEX_UP : CU_UP, min = Math.max(0, ...feeds.map((f) => PIPE_SIZES[f] ?? 0));
  return list.find((k) => { const id = PIPE_SIZES[k]; if (id < min) return false; const { v, paM } = pipeFlow(flowLpm, id); return v <= MAX_V(id) && paM <= paMax; }) ?? list[list.length - 1];
}

/**
 * Runs that leave the same point in the same direction share a pipe: the shared stretch becomes one run, sized for the flow of
 * everything beyond it, and the runs branch off its far end (a tee). Repeats down the tree. Returns how many shared runs were made (edits h in place).
 */
export function combineRuns(h: House, res: HouseResult = calcHouse(h)): number {
  const pipes = h.heating.pipes ?? [], made: Pipe[] = [];
  const nextId = () => { let n = pipes.length + 1; while (pipes.some((p) => p.id === `P${n}`)) n++; return `P${n}`; };
  const short = (p: Pipe): string[] => (p.leg && pipes.some((c) => c.parent === p.id) ? pipes.filter((c) => c.parent === p.id).flatMap(short) : [p.name.replace(/ e\d+$/, '')]);
  const group = (parent: string | null) => {
    const buckets = new Map<string, Array<{ p: Pipe; pts: Pt[]; first: number }>>();
    for (const p of pipes) {
      if (p.parent !== parent || !p.leg || !p.ends) continue;
      const pts = livePath(h, p);
      if (!pts || pts.length < 2) continue;
      const dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1], first = Math.hypot(dx, dy);
      if (first < 1e-3) continue;
      const key = `${p.leg.storey}|${p.ends[0]}|${Math.round((dx / first) * 1000)}|${Math.round((dy / first) * 1000)}`;
      buckets.set(key, [...(buckets.get(key) ?? []), { p, pts, first }]);
    }
    for (const g of buckets.values()) {
      if (g.length < 2) continue;
      const P = g[0].pts[0], d = Math.min(...g.map((x) => x.first));
      // A few centimetres together is a tee at the start, not a shared pipe.
      if (d < 0.15) continue;
      const u: Pt = [(g[0].pts[1][0] - P[0]) / g[0].first, (g[0].pts[1][1] - P[1]) / g[0].first];
      const Q: Pt = [+(P[0] + u[0] * d).toFixed(3), +(P[1] + u[1] * d).toFixed(3)], storey = g[0].p.leg!.storey;
      const t: Pipe = { id: nextId(), name: sharedName(g.flatMap((x) => short(x.p))), parent, size: g[0].p.size, length: m1(d), leg: { storey, pts: [P, Q] }, ends: [g[0].p.ends![0], ''], ...(g[0].p.via ? { via: g[0].p.via } : {}) };
      pipes.push(t); made.push(t);
      for (const x of g) {
        const rest = x.first - d < 1e-3 ? x.pts.slice(1) : [Q, ...x.pts.slice(1)];
        x.p.leg = { storey, pts: rest.length > 1 ? rest : [Q, [Q[0], Q[1]]] };
        x.p.ends = [`tee:${t.id}`, x.p.ends![1]]; x.p.parent = t.id; delete x.p.typed;
      }
      group(t.id);
    }
  };
  for (const parent of [null, ...pipes.map((p) => p.id)]) group(parent);
  if (!made.length) return 0;
  h.heating.pipes = pipes;
  // Innermost shared runs first, so each one is at least as big as the shared runs it feeds.
  const sized = sizePipes(h, res), flows = new Map(sized.rows.map((r) => [r.pipe.id, r.flowLpm]));
  for (const t of [...made].reverse()) t.size = fitSize(flows.get(t.id) ?? 0, pipes.filter((c) => c.parent === t.id).map((c) => c.size), sized.paMax);
  return made.length;
}

/** A shared run's name: what it feeds, each once ("Shared: Front room, Kitchen"). */
const sharedName = (names: string[]) => `Shared: ${[...new Set(names.flatMap((n) => n.replace(/^Shared: /, '').split(', ')).map((n) => n.replace(/ e\d+$/, '')))].join(', ')}`;

/** Shared runs left with nothing beyond them are removed; one left feeding a single run is folded into that run (edits h in place). */
function foldTrunks(h: House): void {
  for (let again = true; again; ) {
    again = false;
    const pipes = h.heating.pipes ?? [];
    for (const t of pipes) {
      if (!t.leg || t.ends?.[1] !== '') continue;
      const kids = pipes.filter((c) => c.parent === t.id);
      if (kids.length > 1) continue;
      const k = kids[0], tp = livePath(h, t), kp = k && livePath(h, k);
      if (k && (!kp || !tp || k.leg!.storey !== t.leg.storey)) continue;
      if (k && tp && kp) { k.leg = { storey: t.leg.storey, pts: tidy([...tp, ...kp.slice(1)]) }; k.parent = t.parent; k.ends = [t.ends[0], k.ends![1]]; delete k.typed; }
      h.heating.pipes = pipes.filter((x) => x !== t);
      again = true;
      break;
    }
  }
}

/**
 * A run dropped along another tees off it: the stretch they share becomes one run (sized for both) from the other run's start,
 * and both carry on from where the dropped run leaves it. Returns false when it lies along no other run on its floor (edits h in place).
 */
export function joinRun(h: House, id: string, res?: HouseResult): boolean {
  const pipes = h.heating.pipes ?? [], X = pipes.find((p) => p.id === id), xp = X && livePath(h, X);
  if (!X?.leg || !X.ends || !xp) return false;
  // Never onto a run fed through this one: that would loop.
  const below = new Set([id]);
  for (let grew = true; grew; ) { grew = false; for (const p of pipes) if (p.parent && below.has(p.parent) && !below.has(p.id)) { below.add(p.id); grew = true; } }
  let best: { Y: Pipe; yp: Pt[]; T: Pt; i: number; j: number; len: number } | null = null;
  // Runs in the same void can share a pipe, whichever floor's plan they were drawn on.
  const xv = voidOf(h, X);
  for (const Y of pipes) {
    const yp = Y.leg && Y.ends && Y.id !== X.id && voidOf(h, Y) === xv && !below.has(Y.id) ? livePath(h, Y) : null;
    if (!yp) continue;
    for (let i = 0; i + 1 < xp.length; i++) for (let j = 0; j + 1 < yp.length; j++) {
      const a = xp[i], b = xp[i + 1], c = yp[j], d = yp[j + 1], Lx = Math.hypot(b[0] - a[0], b[1] - a[1]), Ly = Math.hypot(d[0] - c[0], d[1] - c[1]);
      if (Lx < 1e-3 || Ly < 1e-3) continue;
      const u: Pt = [(b[0] - a[0]) / Lx, (b[1] - a[1]) / Lx];
      // Parallel and on the same line, within 2 cm.
      if (Math.abs(u[0] * (d[1] - c[1]) - u[1] * (d[0] - c[0])) / Ly > 1e-3 || Math.abs(u[0] * (c[1] - a[1]) - u[1] * (c[0] - a[0])) > 0.02) continue;
      const tc = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1], td = (d[0] - a[0]) * u[0] + (d[1] - a[1]) * u[1];
      const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(Lx, Math.max(tc, td));
      if (hi - lo > (best?.len ?? 0.15)) best = { Y, yp, i, j, len: hi - lo, T: [+(a[0] + u[0] * hi).toFixed(3), +(a[1] + u[1] * hi).toFixed(3)] };
    }
  }
  if (!best) return false;
  const { Y, yp, T, i, j } = best, storey = Y.leg!.storey, xs = X.leg.storey;
  // Their floor or ceiling is fixed before they change parents: following a run upstream stops at a change of floor.
  X.via = viaOf(h, X); Y.via = viaOf(h, Y);
  const two = (pts: Pt[]): Pt[] => (pts.length > 1 ? pts : [T, [T[0], T[1]]]);
  const up = tidy([...yp.slice(0, j + 1), T]), down = two(tidy([T, ...yp.slice(j + 1)])), rest = two(tidy([T, ...xp.slice(i + 1)]));
  if (pathLen(up) < 0.15) {
    // They meet at the other run's start: the dropped run just leaves from there too.
    X.parent = Y.parent; X.ends = [Y.ends![0], X.ends[1]]; X.leg = { storey: xs, pts: rest };
  } else {
    let n = pipes.length + 1;
    while (pipes.some((p) => p.id === `P${n}`)) n++;
    const S: Pipe = { id: `P${n}`, name: sharedName([Y.name, X.name]), parent: Y.parent, size: Y.size, length: m1(pathLen(up)), leg: { storey, pts: up }, ends: [Y.ends![0], ''], via: Y.via };
    pipes.push(S);
    Y.parent = S.id; Y.ends = [`tee:${S.id}`, Y.ends![1]]; Y.leg = { storey, pts: down }; delete Y.typed;
    X.parent = S.id; X.ends = [`tee:${S.id}`, X.ends[1]]; X.leg = { storey: xs, pts: rest };
    h.heating.pipes = pipes;
    const sized = sizePipes(h, res ?? calcHouse(h));
    S.size = fitSize(sized.rows.find((r) => r.pipe.id === S.id)?.flowLpm ?? 0, [Y.size, X.size], sized.paMax);
  }
  delete X.typed;
  h.heating.pipes = pipes;
  foldTrunks(h);
  return true;
}

// --- Drawing runs by hand ------------------------------------------------------------------------

/** Where a drawn run starts or ends: an attachment (see endPoint: 'source', 'cylinder', a riser id, 'e:' + emitter), or a point on an existing run. */
export type Attach = { id: string } | { run: string; at: Pt };
/** How far a pipe drawn along a wall sits off it, m (clips, and room for the plaster). */
export const PIPE_WALL = 0.1;

/** Everything on a storey's plan that a run can be attached to, and where. Risers pass every floor; the source and cylinder are on their own. */
export function attachments(h: House, storey: number): Array<{ id: string; at: Pt; label: string }> {
  const hs = h.heating, out: Array<{ id: string; at: Pt; label: string }> = [];
  const hp = h.hp.source === 'ashp' || h.hp.source === 'gshp';
  if (hs.source?.storey === storey) out.push({ id: 'source', at: hs.source.at, label: hp ? 'Heat pump' : 'Boiler' });
  if (hs.cylinder?.storey === storey) out.push({ id: 'cylinder', at: hs.cylinder.at, label: 'Hot water cylinder' });
  (hs.risers ?? []).forEach((r, i) => out.push({ id: r.id, at: r.at, label: `Riser ${i + 1}` }));
  for (const e of hs.emitters) {
    const r = h.rooms.find((x) => x.id === e.room), at = r?.storey === storey ? emitterPort(h, e) ?? undefined : undefined;
    if (r && at) out.push({ id: `e:${e.id}`, at, label: `${r.name} ${e.kind === 'ufh' ? 'UFH manifold' : e.kind === 'towel' ? 'towel rail' : 'radiator'}` });
  }
  return out;
}

const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const r3 = (q: Pt): Pt => [+q[0].toFixed(3), +q[1].toFixed(3)];

/**
 * A run drawn from `last` towards `q`: along whichever is nearest its heading of the grid's axes and the lines along and
 * square to the walls within 2 m (so it follows a wall off the grid), stopping PIPE_WALL short of a wall across its way
 * when it comes within `tol`, so the next stretch runs along that wall.
 */
export function wallSnap(h: House, storey: number, last: Pt, q: Pt, tol: number): Pt {
  const v: Pt = [q[0] - last[0], q[1] - last[1]], vl = Math.hypot(v[0], v[1]);
  if (vl < 1e-9) return q;
  const walls = h.rooms.filter((r) => onStorey(r, storey)).flatMap((r) => roomEdges(r));
  const near = (e: (typeof walls)[number]) => {
    const t = Math.max(0, Math.min(e.len, dot([last[0] - e.a[0], last[1] - e.a[1]], e.d)));
    return Math.hypot(e.a[0] + e.d[0] * t - last[0], e.a[1] + e.d[1] * t - last[1]) < 2;
  };
  let u: Pt = [1, 0], fit = -1;
  for (const c of [[1, 0], [0, 1], ...walls.filter(near).flatMap((e) => [e.d, e.n])] as Pt[]) {
    const f = Math.abs(dot(v, c)) / vl;
    if (f > fit + 1e-6) { fit = f; u = c; }
  }
  let t = dot(v, u), best = tol;
  for (const e of walls) {
    const un = dot(u, e.n);
    if (Math.abs(un) < 0.2) continue; // along the run, not across it
    const side = Math.sign(dot([last[0] - e.a[0], last[1] - e.a[1]], e.n)) || 1;
    const s = (dot([e.a[0] + side * PIPE_WALL * e.n[0] - last[0], e.a[1] + side * PIPE_WALL * e.n[1] - last[1]], e.n)) / un;
    const along = dot([last[0] + u[0] * s - e.a[0], last[1] + u[1] * s - e.a[1]], e.d);
    if (along < -0.05 || along > e.len + 0.05) continue;
    if (Math.abs(s - dot(v, u)) < best) { best = Math.abs(s - dot(v, u)); t = s; }
  }
  return r3([last[0] + u[0] * t, last[1] + u[1] * t]);
}

/**
 * The last stretch of a drawn run, from `a` into `b`, with a corner: square to the stretch before it (`prev` → `a`) when
 * that one runs off the grid, along a wall at an angle, else square to the grid (see ell).
 */
export function squareInto(h: House, storey: number, prev: Pt | undefined, a: Pt, b: Pt): Pt[] {
  const d: Pt = prev ? [a[0] - prev[0], a[1] - prev[1]] : [0, 0], l = Math.hypot(d[0], d[1]);
  if (l < 1e-9 || Math.abs(d[0]) < 1e-6 || Math.abs(d[1]) < 1e-6) return ell(h, storey, a, b);
  const u: Pt = [d[0] / l, d[1] / l], w: Pt = [-u[1], u[0]], ab: Pt = [b[0] - a[0], b[1] - a[1]];
  const c1 = r3([a[0] + u[0] * dot(ab, u), a[1] + u[1] * dot(ab, u)]), c2 = r3([a[0] + w[0] * dot(ab, w), a[1] + w[1] * dot(ab, w)]);
  const inside = h.rooms.some((r) => onStorey(r, storey) && pointInPoly(c1, roomPoly(r)));
  return tidy([a, inside ? c1 : c2, b]);
}

const nextId = (pipes: Pipe[]) => { let n = pipes.length + 1; while (pipes.some((p) => p.id === `P${n}`)) n++; return `P${n}`; };

/** Tee into run `id` at the point nearest `at`: what a new run starts from and comes off. Splits the run when the tee is part way along (edits h in place). */
function teeAt(h: House, id: string, at: Pt): { start: string; parent: string | null; T: Pt } | null {
  const pipes = h.heating.pipes ?? [], Y = pipes.find((p) => p.id === id), yp = Y && livePath(h, Y);
  if (!Y?.leg || !Y.ends || !yp || yp.length < 2) return null;
  let best = { d: Infinity, j: 0, T: yp[0] };
  for (let j = 0; j + 1 < yp.length; j++) {
    const a = yp[j], b = yp[j + 1], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const T: Pt = [+(a[0] + dx * t).toFixed(3), +(a[1] + dy * t).toFixed(3)], d = Math.hypot(T[0] - at[0], T[1] - at[1]);
    if (d < best.d) best = { d, j, T };
  }
  const { j, T } = best, up = tidy([...yp.slice(0, j + 1), T]), down = tidy([T, ...yp.slice(j + 1)]);
  if (pathLen(up) < 0.15) return { start: Y.ends[0], parent: Y.parent, T: yp[0] };
  if (pathLen(down) < 0.15) return { start: `tee:${Y.id}`, parent: Y.id, T: yp[yp.length - 1] };
  Y.via = viaOf(h, Y);
  const S: Pipe = { id: nextId(pipes), name: sharedName([Y.name]), parent: Y.parent, size: Y.size, length: m1(pathLen(up)), leg: { storey: Y.leg.storey, pts: up }, ends: [Y.ends[0], ''], via: Y.via };
  pipes.push(S);
  Y.parent = S.id; Y.ends = [`tee:${S.id}`, Y.ends[1]]; Y.leg = { storey: Y.leg.storey, pts: down }; delete Y.typed;
  h.heating.pipes = pipes;
  return { start: `tee:${S.id}`, parent: S.id, T };
}

/** True for what a run can come from: the source, a riser or another run (not a heater or the cylinder). */
export const feedsFrom = (a: Attach) => 'run' in a || !(a.id === 'cylinder' || a.id.startsWith('e:'));

/**
 * A run drawn on storey `storey`'s plan through the corners `mid`, from `a` to `b` (an open end, for teeing off later, if null).
 * Drawn from a heater back to its feed, it is turned round. On a floor away from the source it comes off that floor's branch
 * (up the riser, or straight up), made if there is none. A heater or cylinder that already had a run gets this one instead.
 * The corners are kept as drawn, slants and all; with `square`, the last stretch into the heater gets a corner rather than running on the slant.
 * Returns the new run's id, or why it cannot be drawn (edits h in place).
 */
export function drawRun(h: House, storey: number, a: Attach, mid: Pt[], b: Attach | null, square = true): { id: string } | { error: string } {
  const src = h.heating.source;
  if (!src) return { error: 'Place the boiler or heat pump first.' };
  if (b && !feedsFrom(a) && feedsFrom(b)) { [a, b] = [b, a]; mid = [...mid].reverse(); }
  if (!feedsFrom(a)) return { error: 'A run comes from the boiler or heat pump, a riser or another run: start or finish on one.' };
  if (b && feedsFrom(b)) return { error: 'Finish on a radiator, UFH manifold or the cylinder, or press Enter to leave the end open for teeing off later.' };
  if (!b && mid.length < 1) return { error: 'Draw at least one stretch.' };
  if (!('run' in a) && a.id !== 'source' && storey === src.storey) return { error: 'On the floor with the heat source, start from the heat source itself.' };
  const B = b as { id: string } | null; // never a run: checked above
  const pipes = (h.heating.pipes ??= []);
  // The heater's old run goes, so it is not counted twice.
  if (B) for (const old of pipes.filter((p) => (B.id === 'cylinder' ? p.ends?.[1] === 'cylinder' : p.emitter === B.id.slice(2)))) removeRun(h, old.id);
  const all = h.heating.pipes!, root = all.find((p) => p.parent === null && !p.leg)?.id ?? null;
  let start: string, parent: string | null, P0: Pt;
  let via: Pipe['via'];
  if ('run' in a) {
    // A run in this floor's void or its ceiling void (the floor void of the storey above) can be teed into from this plan.
    const Y = all.find((p) => p.id === a.run), yv = Y ? voidOf(h, Y) : -1;
    if (Y && yv !== storey && yv !== storey + 1) return { error: 'That run is not under this floor or in its ceiling.' };
    if (Y?.leg && Y.leg.storey !== storey) via = yv === storey ? 'floor' : 'ceiling';
    const t = Y ? teeAt(h, a.run, a.at) : null;
    if (!t) return { error: 'That run is gone.' };
    ({ start, parent, T: P0 } = t);
  } else if (storey === src.storey) {
    start = 'source'; parent = root; P0 = src.at;
  } else {
    // Another floor: off its branch from the source, up this riser (or straight up).
    const v = rise(h, src.storey, storey), at = endPoint(h, a.id)!, riser = a.id !== 'source';
    let br = all.find((p) => p.ends?.[0] === 'source' && p.ends[1] === a.id && Math.abs((p.rise ?? -1) - v) < 1e-6);
    if (!br) {
      br = { id: nextId(all), name: `To ${h.storeys[storey]?.name.toLowerCase() ?? `storey ${storey}`}${riser ? ' (up the riser)' : ' (through the floor)'}`, parent: root, size: 'Cu 22 mm',
        length: m1((riser ? runOf(src.at, at) : 0) + v), ends: ['source', a.id], rise: v, ...(riser ? { leg: { storey: src.storey, pts: ell(h, src.storey, src.at, at) } } : {}) };
      all.push(br);
    }
    start = a.id; parent = br.id; P0 = at;
  }
  const end = B ? endPoint(h, B.id)! : mid[mid.length - 1];
  const raw = tidy([P0, ...(B ? mid : mid.slice(0, -1)), end]);
  const n = raw.length, pts = square && b && n > 1 ? tidy([...raw.slice(0, -1), ...squareInto(h, storey, raw[n - 3], raw[n - 2], raw[n - 1]).slice(1)]) : raw;
  if (pts.length < 2) return { error: 'Draw at least one stretch.' };
  const e = B?.id.startsWith('e:') ? h.heating.emitters.find((x) => x.id === B.id.slice(2)) : undefined, room = e && h.rooms.find((r) => r.id === e.room)?.name;
  const id = nextId(all);
  all.push({ id, parent, leg: { storey, pts }, ends: [start, B?.id ?? ''], length: m1(pathLen(pts)),
    name: e ? `${room ?? e.room} ${e.kind === 'ufh' ? 'UFH loop' : e.kind === 'towel' ? 'towel rail' : e.id}` : B ? 'Hot water cylinder coil' : 'Main',
    size: e ? (e.kind === 'ufh' ? `PEX ${e.pipe ?? 16} mm` : storey === src.storey || storey === 0 ? 'Cu 15 mm' : 'Cu 10 mm (microbore)') : 'Cu 22 mm',
    ...(e ? { emitter: e.id } : {}), ...(via ? { via } : {}) });
  return { id };
}

/** Heaters, and the cylinder, with no run to them. */
export function unpiped(h: House): string[] {
  const ps = h.heating.pipes ?? [], has = new Set(ps.map((p) => p.emitter));
  return [...h.heating.emitters.filter((e) => !has.has(e.id)).map((e) => `e:${e.id}`), ...(h.heating.cylinder && !ps.some((p) => p.ends?.[1] === 'cylinder') ? ['cylinder'] : [])];
}

/** A plain square run from the source, or the floor's riser, to each heater and the cylinder that has none; the runs already drawn stay. Returns how many were added (edits h in place). */
export function pipeRest(h: House): number {
  const route = routePipes(h), todo = new Set(unpiped(h));
  if (!route) return 0;
  let n = 0;
  for (const t of route.tails) {
    const id = t.emitter ? `e:${t.emitter}` : 'cylinder';
    if (todo.has(id) && 'id' in drawRun(h, t.storey, { id: route.feeds.get(t.storey)?.riser ?? 'source' }, [], { id })) n++;
  }
  return n;
}
