// Ψ of the ground-floor-to-wall junction from a two-dimensional steady heat-flow model of the section (BS EN ISO 10211,
// with the UK conventions of BRE BR 497): the wall, its foundation, the floor layers, the ground, the foundation edge
// insulation and any perimeter upstand. Ψ is the model's heat flow per metre of wall less what the wall and floor U-values
// already count over the same internal lengths: Ψ = L2D − U_wall · h − U_floor · b.
import { MAT } from './data';
import { layerR } from './swap';

export interface JunctionInput {
  /** Outside wall layers, outside to inside: [material, mm]. */
  wall: Array<[string, number]>;
  /** Ground-floor layers, bottom to top: [material, mm]. */
  floor: Array<[string, number]>;
  /** Wall U-value and the floor's BS EN ISO 13370 U-value (with its edge insulation), W/m²K. */
  Uwall: number; Ufloor: number;
  /** Half the floor's characteristic dimension B′, m: how far the floor runs in from the wall in the model. */
  b: number;
  /** Foundation edge insulation, if any: horizontal (D wide) or vertical (D deep), outside or inside the foundation. */
  edge?: { kind: 'horizontal' | 'vertical'; side: 'inside' | 'outside'; D: number; mat: string; t: number };
  /** Perimeter upstand between the floor and the wall, if any: material and thickness, mm. */
  upstand?: { mat: string; t: number };
  /** Conductivity of the foundation under the wall, W/mK (unset: dense concrete or block). */
  footK?: number;
  /** Depth of the foundation below outside ground level, m (unset: 0.75; 0: the wall stands on the ground). */
  footDepth?: number;
}

// Conventions and assumed detail (BR 497; typical UK construction where the build-ups don't say).
export const JUNCTION = {
  /** Finished floor above outside ground level, m. */
  ffl: 0.15,
  /** Wall modelled above the finished floor, m (BR 497 asks for at least 1 m). */
  wallUp: 1.5,
  /** Ground modelled beside and below the floor, m. */
  ground: 20,
  /** Strip foundation under the wall: depth, m; standing proud of the wall each side, m; conductivity, W/mK (dense block or concrete). */
  footDepth: 0.75, footProud: 0.1, footK: 1.13,
  /** Soil conductivity, W/mK (BS EN ISO 13370 default for clay or silt). */
  soilK: 2.0,
  /** Surface resistances, m²K/W: inside a wall, inside a floor (heat down), outside. */
  rsiWall: 0.13, rsiFloor: 0.17, rse: 0.04,
};

/** A layer's conductivity, W/mK: its own, or (for a layer given by resistance, like an air gap) thickness ÷ R. */
const kOf = (mat: string, mm: number) => { const m = MAT[mat]; return !m ? 1 : m.k ?? (mm / 1000) / Math.max(1e-6, layerR(m, mm)); };

/** Grid lines through every edge in `breaks`, closer together near `focus` (cells `fine` m there, growing with distance). */
function lines(breaks: number[], focus: number, fine: number, grow: number, max: number): number[] {
  const b = [...new Set(breaks.map((x) => Math.round(x * 1e6) / 1e6))].sort((p, q) => p - q), out = [b[0]];
  for (let i = 1; i < b.length; i++) {
    let x = b[i - 1];
    while (b[i] - x > 1e-9) {
      const d = Math.min(Math.abs(x - focus), Math.abs(b[i] - focus));
      const s = Math.min(max, fine + grow * d), n = b[i] - x;
      x = n < s * 1.5 ? b[i] : x + s;
      out.push(x);
    }
  }
  return out;
}

/** Cells 1 cm at the junction, growing to 1.5 m far out in the ground: within about 0.003 W/mK of a much finer grid. */
export const GRID = { fine: 0.01, grow: 0.35, max: 1.5 };

const cache = new Map<string, number>();

/** Ψ of the junction, W/mK (cached by its inputs, as a solve takes a moment). */
export function junctionPsi(inp: JunctionInput): number {
  const key = JSON.stringify(inp);
  let v = cache.get(key);
  if (v === undefined) { v = solve(inp).psi; if (cache.size > 200) cache.clear(); cache.set(key, v); }
  return v;
}

type Side = 'E' | 'W' | 'N' | 'S';
/** A boundary a face sees: a temperature through a surface resistance; null for none (adiabatic). */
type BC = { T: number; R: number } | null;
export type Rect = [number, number, number, number, number];

/**
 * Steady two-dimensional conduction on a graded rectangular grid (cell-centred finite volumes, solved by preconditioned
 * conjugate gradients). Rectangles [x0, x1, y0, y1, k] are painted in order, later winning; `inside` says which cells are in
 * the model, and `bc` what a cell face sees where it meets a cell outside the model (`edge`: or the model's own border).
 * Returns the heat each boundary passes in, and the temperature on any face of the model.
 */
export function field2d(spec: {
  rects: Rect[]; xb: number[]; yb: number[]; focus: [number, number]; grid: { fine: number; grow: number; max: number };
  inside: (x: number, y: number) => boolean; bc: (x: number, y: number, side: Side, edge: boolean) => BC; kDefault: number;
}) {
  const { rects, grid } = spec;
  const xs = lines(spec.xb, spec.focus[0], grid.fine, grid.grow, grid.max), ys = lines(spec.yb, spec.focus[1], grid.fine, grid.grow, grid.max);
  const nx = xs.length - 1, ny = ys.length - 1;
  const kAt = (cx: number, cy: number) => { let k = 0; for (const r of rects) if (cx > r[0] && cx < r[1] && cy > r[2] && cy < r[3]) k = r[4]; return k || spec.kDefault; };
  const idx = new Int32Array(nx * ny).fill(-1), K: number[] = [], DX: number[] = [], DY: number[] = [], CX: number[] = [], CY: number[] = [];
  let n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (!spec.inside(cx, cy)) continue;
    idx[j * nx + i] = n++;
    K.push(kAt(cx, cy)); DX.push(xs[i + 1] - xs[i]); DY.push(ys[j + 1] - ys[j]); CX.push(cx); CY.push(cy);
  }
  // Up to four neighbours a cell, in flat arrays so the solver loop stays fast; boundary faces kept to report heat flows.
  const nb = new Int32Array(n * 4).fill(-1), ng = new Float64Array(n * 4), cnt = new Uint8Array(n);
  const diag = new Float64Array(n), rhs = new Float64Array(n), faces: Array<{ c: number; g: number; T: number; R: number; side: Side }> = [];
  const add = (a: number, b: number, g: number) => { const q = a * 4 + cnt[a]++; nb[q] = b; ng[q] = g; diag[a] += g; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = idx[j * nx + i];
    if (c < 0) continue;
    const half = (d: number) => d / (2 * K[c]);
    const sides: Array<[Side, number, number, number]> = [['E', i + 1, j, DY[c]], ['W', i - 1, j, DY[c]], ['N', i, j + 1, DX[c]], ['S', i, j - 1, DX[c]]];
    for (const [side, ii, jj, len] of sides) {
      const across = side === 'E' || side === 'W', edge = ii < 0 || ii >= nx || jj < 0 || jj >= ny, o = edge ? -1 : idx[jj * nx + ii];
      const d = across ? DX[c] : DY[c];
      if (o >= 0) {
        if (o > c) { const g = len / (half(d) + (across ? DX[o] : DY[o]) / (2 * K[o])); add(c, o, g); add(o, c, g); }
        continue;
      }
      const b = spec.bc(CX[c], CY[c], side, edge);
      if (!b) continue;
      const g = len / (half(d) + b.R);
      diag[c] += g; rhs[c] += g * b.T; faces.push({ c, g, T: b.T, R: b.R, side });
    }
  }
  // Preconditioned conjugate gradients on the symmetric system (diagonal preconditioner).
  const T = new Float64Array(n), r = Float64Array.from(rhs), z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
  for (let c = 0; c < n; c++) { z[c] = r[c] / diag[c]; p[c] = z[c]; }
  let rz = 0;
  for (let c = 0; c < n; c++) rz += r[c] * z[c];
  const r0 = Math.sqrt(rhs.reduce((a, v) => a + v * v, 0)) || 1;
  let it = 0;
  for (; it < 20000; it++) {
    let pAp = 0;
    for (let c = 0; c < n; c++) {
      let s = diag[c] * p[c];
      for (let q = c * 4, end = q + cnt[c]; q < end; q++) s -= ng[q] * p[nb[q]];
      Ap[c] = s; pAp += p[c] * s;
    }
    // Nothing left to solve (or no heat into the model at all): stop rather than divide by zero.
    if (!(pAp > 0)) break;
    const a = rz / pAp;
    let rr = 0;
    for (let c = 0; c < n; c++) { T[c] += a * p[c]; r[c] -= a * Ap[c]; rr += r[c] * r[c]; }
    if (Math.sqrt(rr) / r0 < 1e-9) break;
    let rzNew = 0;
    for (let c = 0; c < n; c++) { z[c] = r[c] / diag[c]; rzNew += r[c] * z[c]; }
    const beta = rzNew / rz;
    rz = rzNew;
    for (let c = 0; c < n; c++) p[c] = z[c] + beta * p[c];
  }
  return {
    cells: n, iterations: it,
    /** Heat passed into the model, per metre depth, through the boundary faces `which` picks. */
    flowIn: (which: (f: { T: number; side: Side }) => boolean) => faces.reduce((a, f) => (which(f) ? a + f.g * (f.T - T[f.c]) : a), 0),
    /** Temperature on the boundary face nearest (x, y) on a given side: the boundary's, less the drop across its surface resistance. */
    surfaceT: (x: number, y: number, side: Side) => {
      let best: (typeof faces)[number] | undefined, bd = Infinity;
      for (const f of faces) {
        if (f.side !== side) continue;
        const d = Math.hypot(CX[f.c] - x, CY[f.c] - y);
        if (d < bd) { bd = d; best = f; }
      }
      if (!best) return NaN;
      const q = best.g * (best.T - T[best.c]), len = best.side === 'E' || best.side === 'W' ? DY[best.c] : DX[best.c];
      return best.T - (q / len) * best.R;
    },
  };
}

/** The junction model: the heat flow per metre of wall for 1 K inside to outside, and Ψ from it. `grid`: cell size at the
 * junction, its growth per metre away from it, and the largest cell, m. */
export function solve(inp: JunctionInput, grid = GRID): { psi: number; L2D: number; cells: number; iterations: number } {
  const J = JUNCTION;
  const wT = Math.max(0.05, inp.wall.reduce((a, [, t]) => a + t / 1000, 0));
  const slabT = inp.floor.reduce((a, [, t]) => a + t / 1000, 0);
  const top = J.ffl + J.wallUp, xEnd = wT + Math.max(0.5, inp.b), slabBot = J.ffl - slabT;
  const FO = -J.footProud, FI = wT + J.footProud, base = -Math.max(0, inp.footDepth ?? J.footDepth);

  // Rectangles painted in order (later wins): [x0, x1, y0, y1, k]. y is up from outside ground level; x from the wall's outer face.
  const rects: Rect[] = [];
  rects.push([-J.ground, xEnd, -J.ground, 0, J.soilK]);
  rects.push([wT, xEnd, -J.ground, Math.max(0, slabBot), J.soilK]); // fill under a slab that sits above the ground
  if (base < 0) rects.push([FO, FI, base, 0, inp.footK ?? J.footK]);
  let x = 0;
  for (const [m, t] of inp.wall) { rects.push([x, x + t / 1000, 0, top, kOf(m, t)]); x += t / 1000; }
  let y = slabBot;
  for (const [m, t] of inp.floor) { rects.push([wT, xEnd, y, y + t / 1000, kOf(m, t)]); y += t / 1000; }
  const e = inp.edge;
  if (e && e.D > 0 && e.t > 0 && MAT[e.mat]) {
    const t = e.t / 1000, k = kOf(e.mat, e.t), D = e.D;
    if (e.kind === 'horizontal') rects.push(e.side === 'inside' ? [wT, wT + D, slabBot - t, slabBot, k] : [FO - D, FO, -0.05 - t, -0.05, k]);
    else rects.push(e.side === 'inside' ? [FI, FI + t, slabBot - D, slabBot, k] : [FO - t, FO, -D, 0, k]);
  }
  const up = inp.upstand && inp.upstand.t > 0 && MAT[inp.upstand.mat] ? inp.upstand : undefined;
  // An upstand stands on the structural slab (the bottom floor layer) and runs up to the finished floor.
  const upFrom = inp.floor.length > 1 ? slabBot + inp.floor[0][1] / 1000 : slabBot;
  if (up) rects.push([wT, wT + up.t / 1000, upFrom, J.ffl, kOf(up.mat, up.t)]);

  const f = field2d({
    rects, kDefault: J.soilK, grid, focus: [wT, 0],
    xb: [-J.ground, ...rects.flatMap((r) => [r[0], r[1]]).filter((v) => v >= -J.ground && v <= xEnd), xEnd],
    yb: [-J.ground, ...rects.flatMap((r) => [r[2], r[3]]).filter((v) => v >= -J.ground && v <= top), top],
    // In the model: below ground everywhere, the wall up to its cut, and the floor up to the finished floor.
    inside: (cx, cy) => cy < 0 || (cx > 0 && cx < wT && cy < top) || (cx > wT && cy < J.ffl),
    // The room (1 K) at the wall's inside face above the floor and at the floor's top; outside air (0 K) at the wall's
    // outer face and on the ground outside; the model's cut edges adiabatic.
    bc: (cx, cy, side, edge) => {
      if (edge) return null;
      if (side === 'E' && cx < wT && cy > J.ffl) return { T: 1, R: J.rsiWall };
      if (side === 'W' && cy > 0) return { T: 0, R: J.rse };
      if (side === 'N') return cx < 0 ? { T: 0, R: J.rse } : cx > wT ? { T: 1, R: J.rsiFloor } : null;
      return null;
    },
  });
  // Heat from the room for 1 K, per metre of wall; then less what the U-values count over the internal lengths.
  const L2D = f.flowIn((b) => b.T > 0);
  return { psi: L2D - inp.Uwall * J.wallUp - inp.Ufloor * (xEnd - wT), L2D, cells: f.cells, iterations: f.iterations };
}
