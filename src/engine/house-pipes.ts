// Pipe sizing (board 3): a tree of pipe runs from the heat pump, flows from the emitters each run serves,
// velocity and pressure drop per run, and the index circuit against the pump's available head.
import type { House, HouseResult } from './house';
import { emitterOut, lpm } from './house-heating';

/** Pipe sizes: label → internal diameter, mm. */
export const PIPE_SIZES: Record<string, number> = {
  'Cu 8 mm (microbore)': 6.0, 'Cu 10 mm (microbore)': 8.0, 'Cu 15 mm': 13.6, 'Cu 22 mm': 20.2, 'Cu 28 mm': 26.2, 'Cu 35 mm': 32.6,
  'PEX 16 mm': 12, 'PEX 20 mm': 16, 'PEX 25 mm': 20, 'PEX 32 mm': 26,
};
/** Design limits: velocity (m/s, lower for small bores to keep noise down) and pressure drop per metre (Pa/m). */
export const MAX_V = (id: number) => (id <= 8 ? 0.8 : id <= 14 ? 1.0 : 1.5);
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
}

export interface PipeRow {
  pipe: Pipe; loadW: number; flowLpm: number; v: number; paM: number; dp: number;
  ok: boolean; why: string[]; index: boolean;
}
export interface PipeResult { rows: PipeRow[]; indexDp: number; indexPath: string[]; head: number; headOk: boolean; unpiped: string[] }

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
  const pipes = h.heating.pipes ?? [];
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
    if (paM > MAX_PA_M) why.push(`${Math.round(paM)} Pa/m is over ${MAX_PA_M} Pa/m`);
    return { pipe: p, loadW, flowLpm, v, paM, dp: paM * p.length * FITTINGS, ok: !why.length, why, index: false };
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
  return { rows, indexDp, indexPath, head, headOk: indexDp <= head, unpiped: h.heating.emitters.filter((e) => !piped.has(e.id)).map((e) => e.id) };
}

/** Typical pipework to start from: 28 mm primary, 22 mm to each storey, 15 mm (10 mm upstairs) tails, PEX to UFH loops. */
export function autoPipes(h: House): Pipe[] {
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
        size: e.kind === 'ufh' ? 'PEX 16 mm' : si === 0 ? 'Cu 15 mm' : 'Cu 10 mm (microbore)', length: e.kind === 'ufh' ? 3 : 5, emitter: e.id });
    }
  });
  return out;
}
