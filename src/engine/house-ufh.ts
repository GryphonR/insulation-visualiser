// UFH pipe routes (board 1b): a loop laid in a rectangle inside its room, in one of three patterns, fed from a
// corner, with tails run square to its zone's manifold. Lengths come from the drawn route.
import type { Pt } from './geom';
import type { House } from './house';
import type { Emitter } from './house-heating';

export type LoopPattern = 'spiral' | 'serp' | 'dserp';
export const PATTERNS: Record<LoopPattern, [string, string]> = {
  spiral: ['Counterflow spiral', 'Flow spirals in and the return spirals out between it, so hot and cool pipes alternate everywhere: the most even floor, and one tight bend at the centre.'],
  serp: ['Single serpentine', 'One pipe snakes across the room and returns along the edge. Simple to lay, but the floor cools across the room: start on the outside wall.'],
  dserp: ['Double serpentine', 'Flow and return snake side by side. More even than a single serpentine, but every turn is a tight 180° bend.'],
};
export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export interface LoopRect { x: number; y: number; w: number; h: number }

const plen = (p: Pt[]) => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);

/** Drop repeated points and straight-through midpoints from an orthogonal polyline. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1], b = pts[i];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-4) continue;
    if (out.length > 1) {
      const z = out[out.length - 2];
      if ((Math.abs(z[0] - a[0]) < 1e-4 && Math.abs(a[0] - b[0]) < 1e-4) || (Math.abs(z[1] - a[1]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4)) { out[out.length - 1] = b; continue; }
    }
    out.push(b);
  }
  return out;
}

/** Offset an orthogonal polyline sideways by d (positive = left of travel on the plan, y south). */
function offset(pts: Pt[], d: number): Pt[] {
  const n = (a: Pt, b: Pt): Pt => { const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]); return [dy, -dx]; };
  return pts.map((p, i) => {
    const ni = i > 0 ? n(pts[i - 1], p) : null, no = i < pts.length - 1 ? n(p, pts[i + 1]) : null;
    return [p[0] + d * ((ni?.[0] ?? 0) + (no?.[0] ?? 0)), p[1] + d * ((ni?.[1] ?? 0) + (no?.[1] ?? 0))];
  });
}

/** Centreline of a clockwise inward rectangular spiral, pitch nudged so whole rings fit; it stops one spacing short of itself. */
function spiralLine(x0: number, y0: number, x1: number, y1: number, p: number, s: number): Pt[] {
  const fit = (e: number) => e / Math.max(1, Math.round(e / p)), px = fit(x1 - x0), py = fit(y1 - y0);
  const b = { x0, y0, x1, y1 }, pts: Pt[] = [[x0, y0]];
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return [...pts, [x0 + s / 2, y0]];
  type K = keyof typeof b;
  const RUNS: Array<[0 | 1, K, number, K, number, () => boolean]> = [
    [0, 'x1', 1, 'y0', py, () => b.y1 >= b.y0 - 0.001], [1, 'y1', 1, 'x1', -px, () => b.x1 >= b.x0 - 0.001],
    [0, 'x0', -1, 'y1', -py, () => b.y1 >= b.y0 - 0.001], [1, 'y0', -1, 'x0', px, () => b.x1 >= b.x0 - 0.001],
  ];
  for (let i = 0; i < 400; i++) {
    const [ax, to, dir, sh, by, next] = RUNS[i % 4], q = [...pts[pts.length - 1]] as Pt;
    q[ax] = b[to]; b[sh] += by;
    const last = !next();
    if (last) q[ax] += (dir * s) / 2;
    pts.push(q);
    if (last) break;
  }
  return pts;
}

export interface LoopRoute { flow: Pt[]; ret: Pt[]; bend: Pt[]; inFloor: number; entry: Pt; bends: number }

/** The loop's route in plan metres. Built for a north-west feed, then mirrored to the chosen corner. */
export function loopRoute(r: LoopRect, spacingMM: number, pattern: LoopPattern, corner: Corner = 'nw'): LoopRoute {
  const s = Math.max(0.05, spacingMM / 1000), w = Math.max(s * 2, r.w), hh = Math.max(s * 2, r.h);
  let flow: Pt[], ret: Pt[], bend: Pt[];
  if (pattern === 'serp') {
    const T = hh > w, W = T ? hh : w, H = T ? w : hh, P = (x: number, y: number): Pt => (T ? [y, x] : [x, y]);
    const n = Math.max(2, 2 * Math.round(((H - s) / s - 1) / 2) + 2), ps = (H - s) / (n - 1), xa = 1.5 * s, xb = W - s / 2;
    flow = [P(0, s / 2)];
    for (let k = 0; k < n; k++) { const y = s / 2 + k * ps, right = k % 2 === 0; if (k > 0) flow.push(P(right ? xa : xb, y)); flow.push(P(right ? xb : xa, y)); }
    const ry = s / 2 + (n - 1) * ps;
    ret = [P(xa, ry), P(s / 2, ry), P(s / 2, s / 2 + ps), P(0, s / 2 + ps)];
    bend = [];
  } else {
    // Spiral and double serpentine: a centreline at twice the spacing, flow and return either side of it.
    let cl: Pt[];
    if (pattern === 'spiral') cl = simplify([[0, s] as Pt, ...spiralLine(s, s, w - s, hh - s, 2 * s, s)]);
    else {
      const T = hh > w, W = T ? hh : w, H = T ? w : hh, P = (x: number, y: number): Pt => (T ? [y, x] : [x, y]);
      const m = Math.max(1, Math.round(H / (2 * s))), ps = H / m;
      const c: Pt[] = [P(0, ps / 2)];
      for (let k = 0; k < m; k++) { const y = ps / 2 + k * ps, right = k % 2 === 0; if (k > 0) c.push(P(right ? s : W - s, y)); c.push(P(right ? W - s : s, y)); }
      cl = simplify(c);
    }
    const f = offset(cl, s / 2), rr = offset(cl, -s / 2);
    flow = f; ret = [...rr].reverse(); bend = [f[f.length - 1], rr[rr.length - 1]];
  }
  const fx = corner[1] === 'e', fy = corner[0] === 's';
  const m = (p: Pt): Pt => [r.x + (fx ? w - p[0] : p[0]), r.y + (fy ? hh - p[1] : p[1])];
  flow = flow.map(m); ret = ret.map(m); bend = bend.map(m);
  const inFloor = plen(flow) + plen(ret) + plen(bend);
  return { flow, ret, bend, inFloor, entry: flow[0], bends: Math.max(0, flow.length - 2) + Math.max(0, ret.length - 2) + (bend.length ? 1 : 0) };
}

/** Tails from a loop's feed point to its manifold, run square (along x, then y). */
export const tailPath = (from: Pt, man: Pt): Pt[] => [from, [man[0], from[1]], man];

export interface LoopLayout { route: LoopRoute; tails: Pt[] | null; tailLen: number; total: number }

/** A drawn loop's route and its tails to the zone's manifold; null for a loop with no rectangle drawn. */
export function loopLayout(h: Pick<House, 'heating'>, e: Emitter): LoopLayout | null {
  if (e.kind !== 'ufh' || !e.rect) return null;
  const route = loopRoute(e.rect, e.spacing, e.pattern ?? 'spiral', e.corner ?? 'nw');
  const man = h.heating.zones.find((z) => z.id === e.zone)?.manifold;
  const tails = man ? tailPath(route.entry, [man.x, man.y]) : null;
  const tailLen = tails ? 2 * plen(tails) : 2 * e.tail;
  return { route, tails, tailLen, total: route.inFloor + tailLen };
}
