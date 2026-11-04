// Year-long transient heat and moisture transport through a wall or roof, after Künzel (1995) and
// EN 15026. Moisture moves two ways: as vapour, driven by vapour pressure, and as capillary liquid,
// driven by relative humidity. Each material stores it along its own sorption curve. Every layer is
// split into thin cells and stepped hourly through a synthetic year built from typical UK monthly weather.
//
// Nothing here depends on what kind of material a layer is: capillary flow comes from each material's
// water absorption coefficient A and free saturation wf (Künzel's liquid diffusivity), storage from its
// moisture content at 80% RH, vapour flow from its µ. A lime render wicks water out of the masonry behind
// it to the surface, where it evaporates; a cement render's low A means it can only leave as vapour.
//
// What this does NOT model: cracks or gaps letting rain past a render, air leakage, freezing, or
// measured hourly weather. Treat it as a screening tool, not a substitute for WUFI on a real project.
import { clamp } from '../lib/util';
import { LOCATIONS, MAT, MEAN } from './data';
import type { LayerInput } from './simulate';

/** Typical UK monthly mean outdoor relative humidity, %. */
export const RH_OUT = [89, 86, 82, 77, 74, 74, 75, 78, 82, 86, 89, 90];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Simulated October first (start of the heating season) so winter wetting builds up, then dries in summer. */
export const YEAR_ORDER = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];
/** Years run; results are from the last, by which time the starting state has washed out. */
export const YEARS = 3;
/** Vapour permeability of still air, kg/(m s Pa). */
const DELTA_A = 2e-10;
const RSE = 0.04;
const R_VAPOUR = 461.5; // J/kg K
const HV = 2.5e6; // latent heat of evaporation, J/kg
const CW = 4180; // specific heat of water, J/kg K
/** Surface vapour transfer, kg/(m² s Pa), from convective heat transfer of 17 (outside) and 3 W/m²K (inside) by the Lewis relation. */
const BETA_E = 7.7e-9 * 17;
const BETA_I = 7.7e-9 * 3;
/** Liquid water held above what a layer holds at 95% RH, g/m², below which it counts as dry. */
const DRY = 5;
/** Every layer starts at this RH. */
const PHI0 = 0.8;
/** Storage of a material with no sorption data, kg/m³ at saturation: little more than its pore air. */
const W_MIN = 0.01;
/** Water beyond free saturation, kg/m³ per unit of RH above 1, for each kg/m³ of wf: a numerical extension (vapour pressure is capped at saturation). */
const SUPER = 100;
/** Moisture supplement to conductivity, % per mass-% of water (the usual default, e.g. WUFI). */
const LAMBDA_W = 8;
/** Rising damp is supplied by capillary flow up from the footing over this height of wall, m. */
const DAMP_H = 1;
/** Rain falls as a 6-hour shower every 60 hours (about 12 a month), carrying that month's total. */
const SHOWER_EVERY = 60;
const SHOWER_HOURS = 6;
/** Time step, hours (implicit, so this is for accuracy, not stability; showers and days divide by it). */
const STEP_H = 2;
/** Depth from each face of an organic layer over which its moisture content is judged for rot, m. */
const EVAL_M = 0.01;
/** Inner-surface RH above this risks mould (ISO 13788 criterion). */
export const MOULD_RH = 80;
/** Inner surface resistance for the mould check, m²K/W: ISO 13788 uses 0.25 for opaque elements (corners, behind furniture). */
const RSI_MOULD = 0.25;

/** Peak indoor vapour excess over outdoors, g/m³, in the coldest weather; it falls to zero by 20 °C outside. */
export const LOADS = [
  { id: 'low', label: 'Low (well ventilated)', dv: 2 },
  { id: 'typ', label: 'Typical home', dv: 4 },
  { id: 'high', label: 'High (laundry drying, little extract)', dv: 6 },
];

/** Typical monthly rainfall for the Midlands (Birmingham), mm; other places scale by RAIN_FACTOR. */
const RAIN_MM = [70, 50, 52, 53, 60, 60, 58, 65, 62, 80, 75, 78];
const RAIN_FACTOR: Record<string, number> = { lon: 0.8, bir: 1, car: 1.4, man: 1.3, bel: 1.3, edi: 0.9, abe: 0.9 };
/** Mean daytime warming of a sunlit outer face above air temperature, K, by month (24-hour mean; it peaks at midday). */
const SUN_K = [0.5, 1, 2, 3, 4.5, 5.5, 5.5, 4.5, 3, 1.5, 0.5, 0.3];
/** Rain taken up in a month, mm, that counts as a fully wet outer face (for the chart). */
const WET_CAP = 15;

/** Share of the rain that reaches the wall face (driving-rain exposure). */
export const EXPOSURES = [
  { id: 'none', label: 'No rain', catch: 0 },
  { id: 'sheltered', label: 'Sheltered (urban, trees)', catch: 0.05 },
  { id: 'moderate', label: 'Moderate', catch: 0.15 },
  { id: 'exposed', label: 'Exposed (hill, coast, SW face)', catch: 0.3 },
  { id: 'severe', label: 'Severe', catch: 0.5 },
];
/** Rising damp: relative humidity (fraction) of the masonry at the footing. */
export const FOOTINGS = [
  { id: 'dry', label: 'Dry footings', rh: 0 },
  { id: 'damp', label: 'Damp (occasional)', rh: 0.85 },
  { id: 'wet', label: 'Wet (standing damp)', rh: 0.97 },
];

export function psat(T: number): number {
  return T >= 0 ? 610.5 * Math.exp((17.269 * T) / (237.3 + T)) : 610.5 * Math.exp((21.875 * T) / (265.5 + T));
}

export interface MoistureInput {
  layers: LayerInput[];
  loc: string;
  /** Indoor air temperature, °C. */
  tin: number;
  /** Indoor vapour excess, g/m³ (see LOADS). */
  dv: number;
  roof: boolean;
  /** Driving-rain catch ratio (see EXPOSURES); default 0 = no rain wetting. */
  catch?: number;
  /** Rising-damp RH fraction at the footing (see FOOTINGS); default 0 = dry. */
  footing?: number;
}

export interface MoistureLayer {
  name: string;
  col: string;
  /** Thickness, mm. */
  t: number;
  /** Thermal resistance, m²K/W. */
  R: number;
  /** Conductivity, W/mK (absent for fixed-resistance layers). */
  k?: number;
  /** An air cavity: condensation in it drains away (weep holes, trays) instead of building up. */
  air: boolean;
  rho: number;
  /** Critical moisture content, fraction of dry mass, for organic layers at risk of rot (undefined = not checked). */
  hygro?: number;
  /** Dry-cup and wet-cup vapour resistance factors. */
  mu: number;
  muWet: number;
  /** Dry-cup water-vapour-equivalent air thickness, m. */
  sd: number;
  /** Water absorption coefficient, kg/(m² s^0.5); 0 = no capillary data or not capillary. */
  A: number;
}

export interface MonthState {
  month: number;
  te: number;
  ti: number;
  /** Indoor RH, %, and RH on the inner surface, %. */
  rhi: number;
  rhSurf: number;
  /** Per layer boundary 0..n (outer face .. inner face), monthly means: temperature °C, cumulative sd m, vapour pressure Pa, saturation pressure Pa. */
  T: number[];
  S: number[];
  p: number[];
  ps: number[];
  /** Liquid water held in each layer at month end, g/m²: above what the layer holds at 95% RH. */
  stored: number[];
  total: number;
  /** Outdoor RH, %, and outdoor vapour pressure (before rain), Pa. */
  rhe: number;
  pe: number;
  /** Water condensed this month in each air cavity, g/m², assumed to drain away rather than be held. */
  drained: number[];
  /** Moisture flow (vapour and capillary liquid) through each layer, g/m² per day; positive = towards the inside. */
  flux: number[];
  /** How much rain the outer face took up this month, 0..1 (1 = WET_CAP mm or more). */
  wetFace: number;
}

export interface MoistureResult {
  layers: MoistureLayer[];
  /** Last simulated year, by calendar month index (0 = Jan). */
  months: MonthState[];
  /** Total liquid water held at each month end, chronological from October, in year 1 and the last year. */
  year1: number[];
  yearN: number[];
  /** Peak total held in the last year, g/m², and the layer holding most of it then (-1 if none). */
  peak: number;
  peakLayer: number;
  /** Still wetter at the end of the last year than the year before. */
  growing: boolean;
  /** Wettest organic layer in the last year: its peak moisture content, % of dry mass, against its rot threshold. */
  absorbed?: { pct: number; crit: number; layer: number };
  /** Last-year water drained from cavities, g/m², in total and the cavity layer that shed the most (-1 if none). */
  drainedTotal: number;
  drainedLayer: number;
  /** Number of outer layers (base masonry) that rising damp can wick into; 0 if none. */
  dampLayers: number;
  verdict: 'none' | 'dries' | 'accumulates';
  /** Calendar month (0..11) in which the last year's water first falls back to dry after the peak. */
  dryMonth?: number;
  mouldMonths: number[];
  /** Layers with no vapour data (treated as open, mu 1), and with no capillary/storage data (treated as non-capillary). */
  missing: string[];
  noCapillary: string[];
  /** True if the build-up was cut at a ventilated gap. */
  cutAtVent: boolean;
  /** Solver self-check: last year's change in stored water minus the net water in, g/m² (should be near 0). */
  massError: number;
}

/** One slice of a layer. */
interface Cell {
  dx: number; layer: number; air: boolean;
  lam0: number; rhoCp: number; rho: number;
  mu: number; muWet: number;
  /** Capillary data; b is the shape of Künzel's sorption curve, 0 when there is no storage data. */
  A: number; wf: number; b: number;
  /** Moisture content at saturation (wf, or W_MIN) and at 95% RH, kg/m³. */
  wSat: number; w95: number;
}

/** Moisture content at RH f, kg/m³; above f = 1, free water beyond saturation. */
function wOf(c: Cell, f: number): number {
  if (f > 1) return c.wSat + SUPER * Math.max(c.wSat, 1) * (f - 1);
  return c.b ? (c.wf * (c.b - 1) * f) / (c.b - f) : W_MIN * f;
}
/** dw/dφ, kg/m³. */
function capOf(c: Cell, f: number): number {
  if (f > 1) return SUPER * Math.max(c.wSat, 1);
  return c.b ? (c.wf * (c.b - 1) * c.b) / (c.b - f) ** 2 : W_MIN;
}
/** Liquid conductivity on the RH gradient, Dφ = Dw dw/dφ, kg/(m s). Künzel: Dws = 3.8 (A/wf)² 1000^(w/wf - 1); redistribution (no rain) a tenth of that. */
function dPhi(c: Cell, f: number, suction: boolean): number {
  if (!c.A) return 0;
  const w = Math.min(wOf(c, f), c.wf);
  const dws = 3.8 * (c.A / c.wf) ** 2 * Math.exp(6.9078 * (w / c.wf - 1));
  return (suction ? dws : dws / 10) * capOf(c, f);
}
const deltaOf = (c: Cell, f: number) => DELTA_A / (c.mu + (c.muWet - c.mu) * clamp((f - 0.5) / 0.4, 0, 1));
const lamOf = (c: Cell, w: number) => (c.air ? c.lam0 : c.lam0 * (1 + (LAMBDA_W * w) / c.rho));

/** Cell widths for a layer, m: fine at both faces (2 mm), growing to 20 mm inside. */
function split(t: number): number[] {
  const half: number[] = [];
  let s = Math.min(0.002, t / 4), sum = 0;
  while (sum + s < t / 2 - 1e-9) { half.push(s); sum += s; s = Math.min(s * 1.6, 0.02); }
  const rest = t / 2 - sum;
  if (rest > 2e-4 || !half.length) half.push(rest); else half[half.length - 1] += rest;
  return [...half, ...[...half].reverse()];
}

/** Tridiagonal solve in place (Thomas): a sub, b diag, c super, d rhs -> x. */
function tdma(a: Float64Array, b: Float64Array, c: Float64Array, d: Float64Array, x: Float64Array, n: number) {
  for (let i = 1; i < n; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
  x[n - 1] = d[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = (d[i] - c[i] * x[i + 1]) / b[i];
}

/** Value of month-indexed data at a point in month m (0..1 through it), interpolated between mid-months. */
function interp(arr: number[], m: number, f: number): number {
  if (f < 0.5) return arr[m] * (0.5 + f) + arr[(m + 11) % 12] * (0.5 - f);
  return arr[m] * (1.5 - f) + arr[(m + 1) % 12] * (f - 0.5);
}

export function runMoisture(inp: MoistureInput): MoistureResult | null {
  const loc = LOCATIONS.find((l) => l.id === inp.loc) ?? LOCATIONS[1];
  // Everything outside a ventilated gap is at outdoor conditions, so analyse only what's inside it.
  const ventAt = inp.layers.reduce((a, l, i) => (MAT[l.mat]?.vent ? i : a), -1);
  const used = inp.layers.slice(ventAt + 1).filter((l) => MAT[l.mat] && l.t > 0);
  if (used.length === 0) return null;

  const missing: string[] = [];
  const noCapillary: string[] = [];
  const layers: MoistureLayer[] = used.map((l) => {
    const m = MAT[l.mat];
    const air = m.R !== undefined || m.cat === 'cavity';
    if (m.mu === undefined && !missing.includes(m.name)) missing.push(m.name);
    if (!air && m.w80 === undefined && !noCapillary.includes(m.name)) noCapillary.push(m.name);
    const mu = m.mu ?? 1;
    return {
      name: m.name, col: m.col, t: l.t, R: m.R ?? l.t / 1000 / (m.k as number), k: m.k, rho: m.rho, hygro: m.hygro,
      air, mu, muWet: m.muWet ?? mu, sd: mu * (l.t / 1000), A: air ? 0 : m.A ?? 0,
    };
  });
  const n = layers.length;

  // Cells, outside first.
  const cells: Cell[] = [];
  const first: number[] = []; // first cell of each layer
  layers.forEach((L, li) => {
    const m = MAT[used[li].mat], t = L.t / 1000;
    first.push(cells.length);
    const widths = L.air ? [t] : split(t);
    const wf = m.wf ?? 0, w80 = m.w80 ?? 0;
    const hasCurve = !L.air && wf > 1.25 * w80 && w80 > 0;
    const b = hasCurve ? (0.8 * (wf - w80)) / (0.8 * wf - w80) : 0;
    for (const dx of widths) {
      const c: Cell = {
        dx, layer: li, air: L.air, lam0: L.air ? t / L.R : (m.k as number), rhoCp: L.air ? 1200 : m.rho * (m.cp ?? 1000), rho: m.rho,
        mu: L.mu, muWet: L.muWet, A: hasCurve ? L.A : 0, wf, b, wSat: hasCurve ? wf : W_MIN, w95: 0,
      };
      c.w95 = wOf(c, 0.95);
      cells.push(c);
    }
  });
  first.push(cells.length);
  const N = cells.length;
  const rsi = inp.roof ? 0.1 : 0.13;
  const Rtot = RSE + layers.reduce((a, l) => a + l.R, 0) + rsi;

  // Rising damp wicks into the run of capillary layers from the outside, up to the first that isn't.
  let dampLayers = 0;
  const footing = inp.footing ?? 0;
  if (footing > 0) while (dampLayers < n && layers[dampLayers].A > 0) dampLayers++;
  const dampCells = first[dampLayers];

  // State.
  const phi = new Float64Array(N).map((_, i) => (i < dampCells ? Math.max(PHI0, footing) : PHI0));
  const T = new Float64Array(N).fill(inp.tin - 5);
  const vap = new Float64Array(N + 1); // vapour flow across each face, kg/(m² s), inward positive (face i is between cell i-1 and i)
  const flow = new Float64Array(N + 1); // vapour + liquid
  // Work arrays.
  const a = new Float64Array(N), bb = new Float64Array(N), cc = new Float64Array(N), d = new Float64Array(N), x = new Float64Array(N);
  const ps = new Float64Array(N), pk = new Float64Array(N), wn = new Float64Array(N), Gv = new Float64Array(N + 1), Gl = new Float64Array(N + 1);
  const ap = new Float64Array(N), cp = new Float64Array(N), rv = new Float64Array(N), rl = new Float64Array(N), gd = new Float64Array(N);
  /** Water into the wall over the last step (dampIn, kg/(m² s)) and over the last year (netIn, kg/m²), for the mass balance. */
  let dampIn = 0, netIn = 0;
  const half = (i: number, k: number) => cells[i].dx / 2 / k;

  interface Wx { te: number; tsa: number; pe: number; pi: number; rain: number }

  /** One implicit step of dt seconds; false if the moisture iteration didn't converge. */
  const step = (dt: number, wx: Wx): boolean => {
    // Heat, with the latent heat of the vapour condensing or evaporating in each cell (from the last step).
    for (let i = 0; i < N; i++) wn[i] = wOf(cells[i], phi[i]);
    for (let i = 0; i < N; i++) {
      const c = cells[i], C = ((c.rhoCp + wn[i] * CW) * c.dx) / dt;
      const gw = i === 0 ? 1 / (RSE + half(0, lamOf(c, wn[0]))) : 1 / (half(i - 1, lamOf(cells[i - 1], wn[i - 1])) + half(i, lamOf(c, wn[i])));
      const ge = i === N - 1 ? 1 / (rsi + half(i, lamOf(c, wn[i]))) : 1 / (half(i, lamOf(c, wn[i])) + half(i + 1, lamOf(cells[i + 1], wn[i + 1])));
      a[i] = i === 0 ? 0 : -gw;
      cc[i] = i === N - 1 ? 0 : -ge;
      bb[i] = C + gw + ge;
      d[i] = C * T[i] + HV * (vap[i] - vap[i + 1]) + (i === 0 ? gw * wx.tsa : 0) + (i === N - 1 ? ge * inp.tin : 0);
    }
    tdma(a, bb, cc, d, T, N);
    for (let i = 0; i < N; i++) ps[i] = psat(T[i]);

    // Moisture: RH is the unknown; storage linearised about the last iterate (mass-conserving Picard).
    const suction = wx.rain > 0;
    pk.set(phi);
    let ok = false;
    for (let it = 0; it < 12; it++) {
      for (let i = 0; i < N; i++) {
        const sat = pk[i] > 1;
        ap[i] = sat ? 0 : ps[i]; // p = ap φ + cp: vapour pressure is capped at saturation
        cp[i] = sat ? ps[i] : 0;
      }
      // Half-cell resistances to vapour and liquid flow, once per cell.
      for (let i = 0; i < N; i++) { rv[i] = half(i, deltaOf(cells[i], pk[i])); const dl = dPhi(cells[i], pk[i], suction); rl[i] = dl > 0 ? half(i, dl) : 0; }
      Gv[0] = 1 / (1 / BETA_E + rv[0]);
      Gv[N] = 1 / (1 / BETA_I + rv[N - 1]);
      Gl[0] = Gl[N] = 0;
      for (let f = 1; f < N; f++) {
        Gv[f] = 1 / (rv[f - 1] + rv[f]);
        Gl[f] = rl[f - 1] > 0 && rl[f] > 0 ? 1 / (rl[f - 1] + rl[f]) : 0;
      }
      for (let i = 0; i < N; i++) {
        const c = cells[i], C = (capOf(c, pk[i]) * c.dx) / dt;
        let diag = C, rhs = (c.dx / dt) * (wn[i] - wOf(c, pk[i])) + C * pk[i];
        // west face (f = i) and east face (f = i + 1)
        if (i === 0) { diag += Gv[0] * ap[0]; rhs += Gv[0] * (wx.pe - cp[0]) + wx.rain; a[i] = 0; }
        else { diag += Gl[i] + Gv[i] * ap[i]; a[i] = -(Gl[i] + Gv[i] * ap[i - 1]); rhs += Gv[i] * (cp[i - 1] - cp[i]); }
        if (i === N - 1) { diag += Gv[N] * ap[i]; rhs += Gv[N] * (wx.pi - cp[i]); cc[i] = 0; }
        else { diag += Gl[i + 1] + Gv[i + 1] * ap[i]; cc[i] = -(Gl[i + 1] + Gv[i + 1] * ap[i + 1]); rhs += Gv[i + 1] * (cp[i + 1] - cp[i]); }
        if (i < dampCells) { const g = (gd[i] = (dPhi(c, Math.max(pk[i], footing), true) * c.dx) / (DAMP_H * DAMP_H)); diag += g; rhs += g * footing; }
        bb[i] = diag;
        d[i] = rhs;
      }
      tdma(a, bb, cc, d, x, N);
      let err = 0;
      for (let i = 0; i < N; i++) { const v = Math.max(1e-3, x[i]); err = Math.max(err, Math.abs(v - pk[i])); pk[i] = v; }
      if (err < 1e-4) { ok = true; break; }
    }
    if (!ok) return false;
    phi.set(pk);
    const p = (i: number) => (phi[i] > 1 ? ps[i] : phi[i] * ps[i]);
    vap[0] = Gv[0] * (wx.pe - p(0));
    vap[N] = Gv[N] * (p(N - 1) - wx.pi);
    for (let f = 1; f < N; f++) vap[f] = Gv[f] * (p(f - 1) - p(f));
    for (let f = 0; f <= N; f++) flow[f] = vap[f] + (f > 0 && f < N ? Gl[f] * (phi[f - 1] - phi[f]) : 0);
    flow[0] += wx.rain;
    dampIn = 0;
    for (let i = 0; i < dampCells; i++) dampIn += gd[i] * (footing - phi[i]);
    return true;
  };

  /** Water above saturation that runs off the face in rain, or drains from a cavity, kg/m², removed from the cell. */
  const shed = (i: number): number => {
    if (phi[i] <= 1) return 0;
    const c = cells[i], ex = (wOf(c, phi[i]) - c.wSat) * c.dx;
    phi[i] = 1;
    return ex;
  };

  /** Advance dt seconds, halving the step where the moisture iteration struggles (sudden rain). */
  const save = { phi: new Float64Array(N), T: new Float64Array(N), vap: new Float64Array(N + 1) };
  let runoff = 0;
  const drainedNow = new Float64Array(n);
  const advance = (dt: number, wx: Wx, depth = 0) => {
    save.phi.set(phi); save.T.set(T); save.vap.set(vap);
    if (!step(dt, wx) && depth < 5) {
      phi.set(save.phi); T.set(save.T); vap.set(save.vap);
      advance(dt / 2, wx, depth + 1);
      advance(dt / 2, wx, depth + 1);
      return;
    }
    netIn += (flow[0] - flow[N] + dampIn) * dt;
    if (wx.rain > 0) { const r = shed(0); runoff += r; netIn -= r; }
    for (let i = 0; i < N; i++) if (cells[i].air) { const r = shed(i); drainedNow[cells[i].layer] += r; netIn -= r; }
  };

  const heldByLayer = (): number[] => {
    const h = new Array<number>(n).fill(0);
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      if (!c.air) h[c.layer] += Math.max(0, wOf(c, phi[i]) - c.w95) * c.dx * 1000;
    }
    return h;
  };

  // Rain hours in each calendar month (the shower pattern repeats every year: 8760 is a multiple of 60).
  const rainHours = new Array<number>(12).fill(0);
  {
    let h = 0;
    for (const m of YEAR_ORDER) for (let k = 0; k < DAYS[m] * 24; k++, h++) if (h % SHOWER_EVERY < SHOWER_HOURS) rainHours[m]++;
  }
  const catchR = inp.catch ?? 0;
  const hygroLayers = layers.map((l, i) => (l.hygro !== undefined ? i : -1)).filter((i) => i >= 0);
  const peakMC = new Array<number>(n).fill(0);
  // Rot is judged on the outermost EVAL_M of an organic layer at either face (the wetter), not one thin cell.
  const faceCells = (li: number): number[][] => {
    const out: number[] = [], inn: number[] = [], t = layers[li].t / 1000;
    let pos = 0;
    for (let i = first[li]; i < first[li + 1]; i++) {
      const mid = pos + cells[i].dx / 2;
      if (mid < EVAL_M) out.push(i);
      if (t - mid < EVAL_M) inn.push(i);
      pos += cells[i].dx;
    }
    return [out, inn];
  };
  const evalSets = hygroLayers.map((li) => [li, faceCells(li)] as const);
  const mcOf = (set: number[]) => set.reduce((s, i) => s + wOf(cells[i], phi[i]) * cells[i].dx, 0) / set.reduce((s, i) => s + cells[i].rho * cells[i].dx, 0);
  const water = () => cells.reduce((s, c, i) => s + wOf(c, phi[i]) * c.dx, 0);
  let water0 = 0;

  const months: MonthState[] = new Array(12);
  const yearTotals: number[][] = [];
  const drainedYear = new Array<number>(n).fill(0);
  let hour = 0;
  for (let y = 0; y < YEARS; y++) {
    const last = y === YEARS - 1;
    if (last) { water0 = water(); netIn = 0; }
    const totals: number[] = [];
    for (const m of YEAR_ORDER) {
      const hrs = DAYS[m] * 24;
      const rainRate = rainHours[m] ? (RAIN_MM[m] * (RAIN_FACTOR[loc.id] ?? 1) * catchR) / rainHours[m] / 3600 : 0; // kg/(m² s) while it rains
      const sumT = new Array<number>(n + 1).fill(0), sumP = new Array<number>(n + 1).fill(0), sumF = new Array<number>(n).fill(0);
      let rainIn = 0;
      drainedNow.fill(0);
      for (let k = 0; k < hrs; k += STEP_H, hour += STEP_H) {
        const f = (k + STEP_H / 2) / hrs;
        const te = interp(MEAN, m, f) + loc.dT;
        const rh = interp(RH_OUT, m, f) / 100;
        const raining = rainRate > 0 && hour % SHOWER_EVERY < SHOWER_HOURS;
        const hd = (hour % 24) + STEP_H / 2;
        const sun = raining || hd < 6 || hd >= 18 ? 0 : Math.PI * interp(SUN_K, m, f) * Math.sin((Math.PI * (hd - 6)) / 12);
        const pe0 = rh * psat(te);
        const dvh = ((inp.dv / 1000) * (20 - clamp(te, 0, 20))) / 20;
        const pi = Math.min(pe0 + dvh * R_VAPOUR * (inp.tin + 273.15), psat(inp.tin));
        const rain = raining ? rainRate : 0;
        runoff = 0;
        advance(STEP_H * 3600, { te, tsa: te + sun, pe: raining ? Math.max(rh, 0.95) * psat(te) : pe0, pi, rain });
        if (!last) continue;
        rainIn += rain * STEP_H * 3600 - runoff;
        // Monthly means at the layer boundaries: the cells either side of each.
        for (let k2 = 0; k2 <= n; k2++) {
          const i0 = k2 === 0 ? 0 : first[k2] - 1, i1 = k2 === n ? N - 1 : first[k2];
          sumT[k2] += (T[i0] + T[i1]) / 2;
          sumP[k2] += (Math.min(phi[i0], 1) * ps[i0] + Math.min(phi[i1], 1) * ps[i1]) / 2;
        }
        for (let li = 0; li < n; li++) sumF[li] += flow[Math.floor((first[li] + first[li + 1]) / 2)] * 86.4e6; // g/m² per day, mid-layer face
        for (const [li, sets] of evalSets) for (const s of sets) if (s.length) peakMC[li] = Math.max(peakMC[li], mcOf(s));
      }
      const held = heldByLayer();
      const total = held.reduce((s, v) => s + v, 0);
      totals.push(total);
      if (!last) continue;
      drainedNow.forEach((v, li) => (drainedYear[li] += v * 1000));
      const te = MEAN[m] + loc.dT, ti = inp.tin;
      const pe = (RH_OUT[m] / 100) * psat(te);
      const dvm = ((inp.dv / 1000) * (20 - clamp(te, 0, 20))) / 20;
      const pi = Math.min(pe + dvm * R_VAPOUR * (ti + 273.15), psat(ti));
      const steps = hrs / STEP_H;
      const Tm = sumT.map((v) => v / steps);
      const S = [0];
      layers.forEach((l, i) => S.push(S[i] + l.sd));
      const tSurf = ti - ((ti - te) * RSI_MOULD) / (Rtot - rsi + RSI_MOULD);
      months[m] = {
        month: m, te, ti, rhi: (pi / psat(ti)) * 100, rhSurf: (pi / psat(tSurf)) * 100,
        T: Tm, S, p: sumP.map((v) => v / steps), ps: Tm.map(psat), stored: held, total, rhe: RH_OUT[m], pe,
        drained: Array.from(drainedNow, (v) => v * 1000), flux: sumF.map((v) => v / steps), wetFace: clamp(rainIn / WET_CAP, 0, 1),
      };
    }
    yearTotals.push(totals);
  }

  const year1 = yearTotals[0], yearN = yearTotals[YEARS - 1], prev = yearTotals[YEARS - 2] ?? year1;
  const peak = Math.max(...yearN);
  const peakIdx = yearN.indexOf(peak);
  const peakHeld = months[YEAR_ORDER[peakIdx]].stored;
  const peakLayer = peak >= DRY ? peakHeld.indexOf(Math.max(...peakHeld)) : -1;
  const verdict = peak < DRY ? 'none' : yearN[11] < DRY ? 'dries' : 'accumulates';
  const dryIdx = yearN.findIndex((v, i) => i > peakIdx && v < DRY);
  const worst = hygroLayers.reduce((b, li) => (b < 0 || peakMC[li] / (layers[li].hygro as number) > peakMC[b] / (layers[b].hygro as number) ? li : b), -1);
  const drainedTotal = drainedYear.reduce((s, v) => s + v, 0);
  return {
    layers, months, year1, yearN, peak, peakLayer, verdict, dampLayers,
    growing: yearN[11] >= DRY && yearN[11] > prev[11] + DRY,
    absorbed: worst >= 0 ? { pct: peakMC[worst] * 100, crit: (layers[worst].hygro as number) * 100, layer: worst } : undefined,
    drainedTotal, drainedLayer: drainedTotal >= DRY ? drainedYear.indexOf(Math.max(...drainedYear)) : -1,
    dryMonth: dryIdx >= 0 ? YEAR_ORDER[dryIdx] : undefined,
    mouldMonths: months.filter((s) => s.rhSurf > MOULD_RH).map((s) => s.month),
    missing, noCapillary,
    cutAtVent: ventAt >= 0,
    massError: (water() - water0 - netIn) * 1000,
  };
}
