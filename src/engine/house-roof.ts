// Roof geometry for outlines of any shape: each eave edge carries a plane rising inward at its pitch, gables stay vertical.
// Pure plan maths (metres, x east, y south); the house-aware parts live in house.ts.
import { edges, pointInPoly, signedArea } from './geom';
import type { Pt } from './geom';

export interface RoofEdge { kind: 'eave' | 'gable'; pitch: number }

interface Plane {
  /** Edge index in the outline. */
  i: number;
  a: Pt;
  /** Inward unit normal and rise per metre inward. */
  n: Pt; t: number;
  /** Half-planes m·p ≥ c where this plane can be the roof: in front of its edge and on its side of the line it shares with each neighbour. */
  cons: Array<[Pt, number]>;
}
export interface RoofModel { poly: Pt[]; plate: number; edges: RoofEdge[]; planes: Plane[] }

const EPS = 1e-7;
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const clampPitch = (p: number) => Math.min(75, Math.max(0, p));

/**
 * Planes and where each may apply. A plane is limited to the wedge between the lines where it meets its neighbouring eave
 * planes (hips at outside corners, valleys at inside ones); the roof at a point is the lowest plane whose wedge holds it.
 * That is exact for convex outlines and gives hips, valleys and ridges for the L, T and U shapes of houses.
 * shortcut: not a full straight skeleton; an outline that wraps round on itself (a spiral) can dip where an edge sees across a gap.
 */
export function roofModel(poly: Pt[], es: RoofEdge[], plate: number): RoofModel {
  const E = edges(poly), n = E.length;
  const inward = (i: number): Pt => [-E[i].n[0], -E[i].n[1]];
  const eave = (i: number) => es[i]?.kind !== 'gable';
  const tOf = (i: number) => Math.tan((clampPitch(es[i]?.pitch ?? 0) * Math.PI) / 180);
  const planes: Plane[] = [];
  for (let i = 0; i < n; i++) {
    if (!eave(i)) continue;
    const ni = inward(i), ti = tOf(i), cons: Array<[Pt, number]> = [[ni, dot(ni, E[i].a)]];
    // Start corner meets the previous edge, end corner the next one.
    for (const [k, v, along] of [[(i + n - 1) % n, E[i].a, E[i].d], [(i + 1) % n, E[i].b, [-E[i].d[0], -E[i].d[1]]]] as Array<[number, Pt, Pt]>) {
      if (!eave(k) || k === i) continue;
      const nk = inward(k), tk = tOf(k), m: Pt = [ti * ni[0] - tk * nk[0], ti * ni[1] - tk * nk[1]];
      if (Math.hypot(m[0], m[1]) < 1e-9) continue;
      const q: Pt = [v[0] + along[0] * 0.01 + ni[0] * 1e-4, v[1] + along[1] * 0.01 + ni[1] * 1e-4];
      const s = Math.sign(dot(m, [q[0] - v[0], q[1] - v[1]]));
      if (!s) continue;
      const ms: Pt = [s * m[0], s * m[1]];
      cons.push([ms, dot(ms, v)]);
    }
    planes.push({ i, a: E[i].a, n: ni, t: ti, cons });
  }
  return { poly, plate, edges: es, planes };
}

const planeZ = (m: RoofModel, pl: Plane, p: Pt) => m.plate + pl.t * dot(pl.n, [p[0] - pl.a[0], p[1] - pl.a[1]]);

/** Roof height at a plan point (same datum as the plate) and the edge whose plane it is on; −1 where no eave governs (flat at the plate). */
export function roofAt(m: RoofModel, p: Pt): { z: number; i: number } {
  let z = Infinity, i = -1;
  for (const pl of m.planes) {
    if (!pl.cons.every(([q, c]) => dot(q, p) >= c - EPS)) continue;
    const v = planeZ(m, pl, p);
    if (v < z) { z = v; i = pl.i; }
  }
  if (i >= 0) return { z, i };
  // Outside every wedge (rare): the lowest plane the point is in front of.
  for (const pl of m.planes) {
    if (dot(pl.cons[0][0], p) < pl.cons[0][1] - EPS) continue;
    const v = planeZ(m, pl, p);
    if (v < z) { z = v; i = pl.i; }
  }
  return i >= 0 ? { z, i } : { z: m.plate, i: -1 };
}

/** Tilt of the plane on edge i, degrees. */
export const edgeTilt = (m: RoofModel, i: number) => clampPitch(m.edges[i]?.pitch ?? 0);

/**
 * Ridges, hips and valleys in plan: where the governing plane changes, traced on a grid and placed exactly on the line where the
 * two planes are equal along each grid edge. Cells meeting three planes join their crossings at the cell centre.
 */
export function roofLines(m: RoofModel, step = 0.1): Array<[Pt, Pt]> {
  const xs = m.poly.map((q) => q[0]), ys = m.poly.map((q) => q[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), nx = Math.ceil((Math.max(...xs) - x0) / step) + 1, ny = Math.ceil((Math.max(...ys) - y0) / step) + 1;
  const lab: number[] = [], inside: boolean[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const p: Pt = [x0 + i * step, y0 + j * step];
    inside.push(pointInPoly(p, m.poly));
    lab.push(roofAt(m, p).i);
  }
  const at = (i: number, j: number) => j * (nx + 1) + i;
  const byEdge = new Map(m.planes.map((pl) => [pl.i, pl]));
  // Point between two grid nodes where their two planes meet (midpoint if that fails).
  const cross = (p: Pt, q: Pt, a: number, b: number): Pt => {
    const A = byEdge.get(a), B = byEdge.get(b);
    if (!A || !B) return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const f = (r: Pt) => planeZ(m, A, r) - planeZ(m, B, r), fp = f(p), fq = f(q);
    const u = Math.abs(fp - fq) > 1e-12 ? Math.max(0, Math.min(1, fp / (fp - fq))) : 0.5;
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  };
  const out: Array<[Pt, Pt]> = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
    if (!c.every((k) => inside[k])) continue;
    const L = c.map((k) => lab[k]);
    if (L.every((v) => v === L[0])) continue;
    const P: Pt[] = [[x0 + i * step, y0 + j * step], [x0 + (i + 1) * step, y0 + j * step], [x0 + (i + 1) * step, y0 + (j + 1) * step], [x0 + i * step, y0 + (j + 1) * step]];
    const hits: Pt[] = [];
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; if (L[k] !== L[k2]) hits.push(cross(P[k], P[k2], L[k], L[k2])); }
    if (hits.length === 2) out.push([hits[0], hits[1]]);
    else if (hits.length > 2) { const mid: Pt = [x0 + (i + 0.5) * step, y0 + (j + 0.5) * step]; hits.forEach((h) => out.push([h, mid])); }
  }
  return out;
}

/** Mitred offset of a simple outline, `d` metres outward. */
export function offsetPoly(p: Pt[], d: number): Pt[] {
  const E = edges(p), n = E.length;
  return p.map((v, i) => {
    const a = E[(i + n - 1) % n], b = E[i];
    const nx = a.n[0] + b.n[0], ny = a.n[1] + b.n[1], k = 1 + dot(a.n, b.n);
    if (k < 1e-6) return [v[0] + b.n[0] * d, v[1] + b.n[1] * d];
    // Mitre length capped so a needle-sharp corner doesn't fly off.
    const s = Math.min(4, 1 / k) * d;
    return [v[0] + nx * s, v[1] + ny * s];
  });
}

/**
 * The outside of a set of outlines, each grown `grow` metres (closing wall-thick gaps between rooms): outer boundaries only,
 * largest first. Traced on a grid, straightened, and corners snapped back onto the grown outlines' own corners.
 * shortcut: courtyards (holes) are roofed over; fine for houses, wrong for a building round an open court.
 */
export function footprint(polys: Pt[][], grow: number, cell = 0.05): Pt[][] {
  const grown = polys.filter((p) => p.length >= 3).map((p) => offsetPoly(p, grow));
  if (!grown.length) return [];
  const all = grown.flat(), xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const x0 = Math.min(...xs) - 2 * cell, y0 = Math.min(...ys) - 2 * cell;
  const nx = Math.ceil((Math.max(...xs) - x0) / cell) + 2, ny = Math.ceil((Math.max(...ys) - y0) / cell) + 2;
  const fill = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c: Pt = [x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell];
    if (grown.some((g) => pointInPoly(c, g))) fill[j * nx + i] = 1;
  }
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && fill[j * nx + i] === 1;
  // Boundary edges between cell corners, filled cell on the right when walking (clockwise on the plan).
  const next = new Map<string, Pt[]>();
  const add = (a: Pt, b: Pt) => { const k = `${a[0]},${a[1]}`; (next.get(k) ?? next.set(k, []).get(k)!).push(b); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!on(i, j)) continue;
    if (!on(i, j - 1)) add([i, j], [i + 1, j]);
    if (!on(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!on(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!on(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const loops: Pt[][] = [];
  for (const [k0, outs] of next) {
    while (outs.length) {
      const loop: Pt[] = [];
      let k = k0, cur = outs.pop()!;
      loop.push(k.split(',').map(Number) as Pt);
      for (let guard = 0; guard < 1e6; guard++) {
        const ck = `${cur[0]},${cur[1]}`;
        if (ck === k0) break;
        loop.push(cur);
        const nn = next.get(ck);
        if (!nn?.length) break;
        k = ck; cur = nn.pop()!;
      }
      if (loop.length >= 4) loops.push(loop.map(([i, j]) => [x0 + i * cell, y0 + j * cell] as Pt));
    }
  }
  const corners = grown.flat();
  const outer = loops.filter((l) => signedArea(l) > 0).map((l) => {
    const s = simplify(l, cell * 1.2);
    return s.map((v) => {
      let best = v, d = cell * 1.6;
      for (const c of corners) { const e = Math.hypot(c[0] - v[0], c[1] - v[1]); if (e < d) { d = e; best = c; } }
      return [+best[0].toFixed(3), +best[1].toFixed(3)] as Pt;
    });
  });
  return outer.filter((l) => l.length >= 3 && Math.abs(signedArea(l)) > 0.5).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
}

/** Douglas–Peucker on a closed outline. */
function simplify(p: Pt[], tol: number): Pt[] {
  if (p.length < 4) return p;
  // Split at the corner farthest from the first one, simplify both halves.
  let far = 0, fd = -1;
  p.forEach((q, i) => { const d = Math.hypot(q[0] - p[0][0], q[1] - p[0][1]); if (d > fd) { fd = d; far = i; } });
  const dp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    let idx = -1, md = tol;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
      if (d > md) { md = d; idx = i; }
    }
    return idx < 0 ? [a, b] : [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  const A = dp(p.slice(0, far + 1)), B = dp([...p.slice(far), p[0]]);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
}
