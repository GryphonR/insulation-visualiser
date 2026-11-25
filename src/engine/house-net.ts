// Pipework as a net: runs are edges between junction nodes, and runs join only where they share a node. Which way the water
// flows along each run, what each run comes off and which runs carry a shared trunk are worked out by walking the net out from the
// heat source, so a run drawn backwards, a run taken out, or runs meeting at a junction all read the way they are laid. The tree the
// rest of the app reads (each run's parent, ends and direction) is derived from the net by `syncNet` after every edit.
import type { Pt } from './geom';
import type { House } from './house';
import { emitterStorey } from './house-heating';
import { livePath, rise } from './house-pipes';
import type { Pipe } from './house-pipes';

export interface PipeNode {
  id: string;
  /**
   * What it is pinned to, with `storey`: 'source', 'cylinder', a riser id, 'e:' + an emitter id or 'm:' + a UFH zone; 'hp' is the heat
   * pump end of the run that leaves it when that run has no route on the plan. A free junction or open end has none.
   */
  on?: string; storey?: number;
  /** A free junction's or open end's place on the plan, m. */
  at?: Pt;
}

const pinId = (on: string, storey: number) => `${on}@${storey}`;
const PLANT = /^(e:|m:|cylinder$)/;

/**
 * The net the runs make: a node at each end of every run, shared where runs meet. Read from each run's parent and ends (the tree
 * as edited), keeping the nodes runs already had, so a run whose start no longer meets anything stays at its own junction.
 */
export function netOf(h: House): { pipes: Pipe[]; nodes: PipeNode[] } {
  const old = new Map((h.heating.nodes ?? []).map((n) => [n.id, n]));
  const pipes = (h.heating.pipes ?? []).map((p) => ({ ...p })), byId = new Map(pipes.map((p) => [p.id, p]));
  const nodes = new Map<string, PipeNode>(), claimed = new Set<string>(), src = h.heating.source?.storey ?? 0;
  let k = 0;
  const fresh = () => { let id: string; do id = `n${++k}`; while (old.has(id) || nodes.has(id)); return id; };
  const pin = (on: string, storey: number) => { const id = pinId(on, storey); if (!nodes.has(id)) nodes.set(id, { id, on, storey }); return id; };
  const storeyOf = (id: string) => nodes.get(id)?.storey ?? src;
  // Where a pinned end is: a heater, manifold or the cylinder on its own floor; a riser or the source column at the end of its climb.
  const pinStorey = (on: string, near: number, climb?: number) => {
    if (on.startsWith('e:')) { const e = h.heating.emitters.find((x) => x.id === on.slice(2)); return (e && emitterStorey(h, e)) ?? near; }
    if (on.startsWith('m:')) return h.heating.zones.find((z) => z.id === on.slice(2))?.manifold?.storey ?? near;
    if (on === 'cylinder') return h.heating.cylinder?.storey ?? near;
    if (climb) for (let t = 0; t <= h.storeys.length; t++) if (t !== near && Math.abs(rise(h, near, t) - climb) < 1e-6) return t;
    return near;
  };
  const starts = new Map<string, string>(), ends = new Map<string, string>();
  const startOf = (p: Pipe, depth = 0): string => {
    const got = starts.get(p.id);
    if (got) return got;
    const par = p.parent ? byId.get(p.parent) : undefined, s0 = p.ends?.[0], tee = s0?.startsWith('tee:') ? byId.get(s0.slice(4)) : undefined;
    let id: string;
    if (depth > 60) id = fresh();
    // Off a run with no route (a header, the run from the heat pump): at its far end, when its own start agrees (the source, or a
    // run still there); one whose start has gone is not quietly hung on it.
    else if (par && !par.leg && (!s0 || s0 === 'source' || !!tee)) id = endOf(par, depth + 1);
    else if (tee) id = endOf(tee, depth + 1);
    // Off the top of its parent's climb up a riser (or the source column): that climb's own node, so each circuit's riser stays its own.
    else if (s0 && par?.ends?.[1] === s0) id = endOf(par, depth + 1);
    else if (s0 && !s0.startsWith('tee:')) id = pin(s0, p.leg?.storey ?? (s0 === 'source' ? src : par ? storeyOf(endOf(par, depth + 1)) : src));
    // The run it was teed off has gone: it keeps the junction it had.
    else if (p.a && old.has(p.a) && !old.get(p.a)!.on) { id = p.a; nodes.set(id, { ...old.get(p.a)! }); }
    else if (par) id = endOf(par, depth + 1);
    else if (!p.ends && !p.leg) id = pin('hp', src);
    else { id = fresh(); nodes.set(id, { id, storey: p.leg?.storey, ...(p.leg ? { at: livePath(h, p)?.[0] } : {}) }); }
    starts.set(p.id, id);
    return id;
  };
  const endOf = (p: Pipe, depth = 0): string => {
    const got = ends.get(p.id);
    if (got) return got;
    const e1 = p.ends?.[1] ?? '';
    let id: string;
    if (depth > 60) id = fresh();
    else if (e1) {
      // A riser or the source column at the top (or foot) of a climb; else on the run's own floor.
      const s0 = storeyOf(startOf(p, depth + 1)), t = pinStorey(e1, PLANT.test(e1) ? s0 : p.rise ? s0 : p.leg?.storey ?? s0, p.rise);
      // A heater, manifold or the cylinder is one place; the top of a climb up a riser is this run's own, as each circuit has its own pipe there.
      if (PLANT.test(e1)) id = pin(e1, t);
      else { id = `${pinId(e1, t)}~${p.id}`; nodes.set(id, { id, on: e1, storey: t }); }
    }
    else if (!p.ends && p.emitter) id = pin(`e:${p.emitter}`, pinStorey(`e:${p.emitter}`, src));
    // The run from the heat pump with no route ends at the source: the runs drawn from the source come off it.
    else if (!p.ends && !p.leg && !p.parent) id = pin('source', src);
    else {
      id = p.b && old.has(p.b) && !old.get(p.b)!.on && !claimed.has(p.b) ? p.b : fresh();
      nodes.set(id, { id, storey: p.leg?.storey, ...(p.leg ? { at: livePath(h, p)?.slice(-1)[0] } : {}) });
    }
    if (!nodes.get(id)?.on) claimed.add(id);
    ends.set(p.id, id);
    return id;
  };
  for (const p of pipes) { p.a = startOf(p); p.b = endOf(p); }
  return { pipes, nodes: [...nodes.values()] };
}

/**
 * The tree read from the net: walking out from the heat pump (or the source), each run is turned to run away from it, comes off the
 * run that reached its start, and starts and ends where its nodes are pinned (or 'tee:' + its parent at a free junction, '' at an
 * open end or a junction it feeds). Runs it never reaches are walked from their own starts and marked loose; a run whose far end was
 * already reached closes a loop and is marked so.
 */
export function treeOf(pipes: Pipe[], nodes: PipeNode[], srcStorey = 0): Pipe[] {
  const byNode = new Map<string, Pipe[]>(), node = new Map(nodes.map((n) => [n.id, n]));
  for (const p of pipes) for (const n of new Set([p.a, p.b])) if (n) byNode.set(n, [...(byNode.get(n) ?? []), p]);
  const into = new Map<string, string | null>(), done = new Map<string, Pipe>(), loose = new Set<string>(), loops = new Set<string>();
  const walk = (from: string, isLoose: boolean) => {
    if (!into.has(from)) into.set(from, null);
    for (const queue = [from]; queue.length; ) {
      const n = queue.shift()!;
      for (const p of byNode.get(n) ?? []) {
        if (done.has(p.id)) continue;
        const flip = p.a !== n, other = flip ? p.a : p.b, parent = into.get(n) ?? null;
        const q: Pipe = { ...p, parent, a: n, b: other };
        if (flip && p.leg) q.leg = { storey: p.leg.storey, pts: [...p.leg.pts].reverse() };
        done.set(p.id, q);
        if (isLoose) loose.add(p.id);
        if (!other || into.has(other)) { if (other) loops.add(p.id); continue; }
        into.set(other, p.id);
        queue.push(other);
      }
    }
  };
  const root = node.has(pinId('hp', srcStorey)) ? pinId('hp', srcStorey) : pinId('source', srcStorey);
  if (byNode.has(root)) walk(root, false);
  // A loose group is walked from where it was laid from: a run's start that is no run's far end, before any other.
  const fed = new Set(pipes.map((p) => p.b)), firsts = [...pipes].sort((x, y) => +fed.has(x.a) - +fed.has(y.a));
  for (const p of firsts) if (!done.has(p.id) && p.a) walk(p.a, true);
  const ref = new Map(pipes.map((p) => [p.id, p]));
  return pipes.map((p0) => {
    const q = done.get(p0.id) ?? { ...p0 }, A = q.a ? node.get(q.a) : undefined, B = q.b ? node.get(q.b) : undefined, par = q.parent ? ref.get(q.parent) : undefined;
    delete q.loose; delete q.loop;
    if (loose.has(q.id)) q.loose = true;
    if (loops.has(q.id)) q.loop = true;
    // A run with no route keeps having no ends; one with a route starts and ends where its nodes say.
    if (p0.ends) {
      const flipped = q.a !== p0.a;
      // Off a run with no route (a header): as it was laid, unless it has been turned round.
      const start = A?.on && A.on !== 'hp' ? A.on : par?.leg ? `tee:${par.id}` : !flipped ? p0.ends[0] : par ? `tee:${par.id}` : '';
      q.ends = [start, B?.on && B.on !== 'hp' ? B.on : ''];
    }
    // A run closing a loop does not feed the heater at its far end: that is fed the other way round.
    if (B?.on?.startsWith('e:') && !q.loop) q.emitter = B.on.slice(2); else if (p0.ends || !B?.on || q.loop) delete q.emitter;
    return q;
  });
}

/** The runs re-read from their net after an edit (see `treeOf`). Returns `h` itself when nothing changes, else a changed copy. */
export function syncNet(h: House): House {
  if (!h.heating.pipes?.length) return h;
  const { pipes, nodes } = netOf(h), tree = treeOf(pipes, nodes, h.heating.source?.storey ?? 0);
  if (JSON.stringify(tree) === JSON.stringify(h.heating.pipes) && JSON.stringify(nodes) === JSON.stringify(h.heating.nodes ?? [])) return h;
  return { ...h, heating: { ...h.heating, pipes: tree, nodes } };
}
