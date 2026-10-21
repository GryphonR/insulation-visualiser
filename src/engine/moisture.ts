// Year-long vapour diffusion and interstitial condensation, in the style of the EN ISO 13788
// (Glaser) monthly method: steady state within each month, condensate accumulated at the layer
// interfaces and re-evaporated when conditions allow.
//
// Liquid water is handled only as a vapour source, not by capillary transport: wind-driven rain
// raises the vapour pressure at the (sun-warmed) outer face, and rising damp holds the masonry
// run behind any insulation at a high relative humidity. Both then drive vapour through the wall.
//
// What this does NOT model: capillary redistribution, moisture storage in the masonry, air leakage
// carrying vapour, or hourly weather. Treat it as a screening tool for diffusion risk, not a
// substitute for a transient hygrothermal simulation (e.g. WUFI) on a real project.
import { clamp } from '../lib/util';
import { LOCATIONS, MAT, MEAN } from './data';
import type { LayerInput } from './simulate';

/** Typical UK monthly mean outdoor relative humidity, %. */
export const RH_OUT = [89, 86, 82, 77, 74, 74, 75, 78, 82, 86, 89, 90];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Simulated October first (start of the heating season) so winter condensation builds up, then dries in summer. */
export const YEAR_ORDER = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];
/** Years run to see whether any condensate carries over from one year to the next. */
const YEARS = 5;
/** Vapour permeability of still air, kg/(m s Pa). */
const DELTA_A = 2e-10;
const RSE = 0.04;
const R_VAPOUR = 461.5; // J/kg K
/** Stored moisture below this, g/m², counts as dry. */
const DRY = 0.5;
/** A layer whose mean RH is above this (fraction) uses its wet-cup mu. */
const WET_RH = 0.7;
/** Depth into a hygroscopic layer that condensate is assumed to reach, mm (conservative: no deeper redistribution). */
const ABSORB_MM = 30;
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
/** Mean daytime warming of a sunlit wet outer face above air temperature, K, by month (diurnal mean, so it understates afternoon peaks). */
const SUN_K = [0.5, 1, 2, 3, 4.5, 5.5, 5.5, 4.5, 3, 1.5, 0.5, 0.3];
/** Rain, mm on the wall in a month, that keeps the outer face of a porous layer fully wet (allowing for run-off and drying between showers). */
const WET_CAP = 15;

/** Share of the rain that reaches the wall face (driving-rain exposure). */
export const EXPOSURES = [
  { id: 'none', label: 'No rain', catch: 0 },
  { id: 'sheltered', label: 'Sheltered (urban, trees)', catch: 0.05 },
  { id: 'moderate', label: 'Moderate', catch: 0.15 },
  { id: 'exposed', label: 'Exposed (hill, coast, SW face)', catch: 0.3 },
  { id: 'severe', label: 'Severe', catch: 0.5 },
];
/** Rising damp: relative humidity (fraction) held in the base masonry. */
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
  /** Rising-damp RH fraction in the base masonry (see FOOTINGS); default 0 = dry. */
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
  /** An air cavity: condensation on its faces drains away (weep holes, trays) instead of building up. */
  air: boolean;
  rho: number;
  /** Critical moisture content, fraction of dry mass, for hygroscopic layers (undefined = treated as non-absorbent). */
  hygro?: number;
  /** Dry-cup and wet-cup vapour resistance factors. */
  mu: number;
  muWet: number;
  /** Dry-cup water-vapour-equivalent air thickness, m. */
  sd: number;
}

export interface MonthState {
  month: number;
  te: number;
  ti: number;
  /** Indoor RH, %, and RH on the inner surface, %. */
  rhi: number;
  rhSurf: number;
  /** Per node 0..n (outer face .. inner face): temperature °C, cumulative sd m, vapour pressure Pa, saturation pressure Pa. */
  T: number[];
  S: number[];
  p: number[];
  ps: number[];
  /** Moisture held at each node at month end, g/m². */
  stored: number[];
  total: number;
  /** Outdoor RH, %, and outdoor vapour pressure (before any rain wetting of the face), Pa. */
  rhe: number;
  pe: number;
  /** Condensate this month, g/m², on the faces of an air cavity, assumed to drain away rather than be held (per node). */
  drained: number[];
  /** Vapour flow through each layer, g/m² per day; positive = towards the inside. */
  flux: number[];
  /** How wet the outer face is from rain this month, 0..1. */
  wetFace: number;
}

export interface MoistureResult {
  layers: MoistureLayer[];
  /** Year-1 state by calendar month index (0 = Jan). */
  months: MonthState[];
  /** Total stored moisture at each month end, chronological from October, in year 1 and in the last simulated year. */
  year1: number[];
  yearN: number[];
  peak: number;
  /** Interface (node index) holding the most moisture at the peak, or -1. */
  peakNode: number;
  /** Moisture content, % of dry mass, if the peak condensate is soaked up by hygroscopic layers beside it, with their critical level. */
  absorbed?: { pct: number; crit: number };
  /** Year-1 condensate drained from cavity faces, g/m², in total and the node that shed the most (-1 if none). */
  drainedTotal: number;
  drainedNode: number;
  /** Number of outer layers (base masonry) held damp by rising damp; 0 if none. */
  dampLayers: number;
  verdict: 'none' | 'dries' | 'accumulates';
  /** Calendar month (0..11) in which year-1 moisture first falls back to dry after the peak. */
  dryMonth?: number;
  mouldMonths: number[];
  /** Layers with no vapour data (treated as open, mu 1). */
  missing: string[];
  /** True if the build-up was cut at a ventilated gap. */
  cutAtVent: boolean;
}

export function runMoisture(inp: MoistureInput): MoistureResult | null {
  const loc = LOCATIONS.find((l) => l.id === inp.loc) ?? LOCATIONS[1];
  // Everything outside a ventilated gap is at outdoor conditions, so analyse only what's inside it.
  const ventAt = inp.layers.reduce((a, l, i) => (MAT[l.mat]?.vent ? i : a), -1);
  const used = inp.layers.slice(ventAt + 1).filter((l) => MAT[l.mat]);
  if (used.length === 0) return null;

  const missing: string[] = [];
  const layers: MoistureLayer[] = used.map((l) => {
    const m = MAT[l.mat];
    if (m.mu === undefined && !missing.includes(m.name)) missing.push(m.name);
    const mu = m.mu ?? 1;
    return {
      name: m.name, col: m.col, t: l.t, R: m.R ?? l.t / 1000 / (m.k as number), k: m.k, rho: m.rho, hygro: m.hygro,
      air: m.R !== undefined || m.cat === 'cavity',
      mu, muWet: m.muWet ?? mu, sd: mu * (l.t / 1000),
    };
  });
  const n = layers.length;
  const rsi = inp.roof ? 0.1 : 0.13;
  const Rtot = RSE + layers.reduce((a, l) => a + l.R, 0) + rsi;
  const cumR = [RSE];
  layers.forEach((l, i) => cumR.push(cumR[i] + l.R));
  // Base masonry: the run of conductive layers from the outside, up to the first insulation or air layer.
  let massRun = 0;
  while (massRun < n && (layers[massRun].k ?? 0) >= 0.3 && (layers[massRun].k as number) < 5) massRun++;
  const dampLayers = (inp.footing ?? 0) > 0 ? massRun : 0;
  if (dampLayers === 0) massRun = 0;
  // How readily the outer layer takes up rain: open porous materials fully, dense ones a little, tight ones not at all.
  const outer = layers[0];
  const absorbOuter = outer.k === undefined ? 0 : outer.mu <= 60 ? 1 : outer.mu <= 1000 ? 0.3 : 0;

  const stepMonth = (m: number, M: number[]): { state: MonthState; M: number[] } => {
    const te = MEAN[m] + loc.dT;
    const ti = inp.tin;
    const T = cumR.map((r) => te + ((ti - te) * r) / Rtot);
    const ps = T.map(psat);
    const pe = (RH_OUT[m] / 100) * psat(te);
    const dv = ((inp.dv / 1000) * (20 - clamp(te, 0, 20))) / 20;
    const pi = Math.min(pe + dv * R_VAPOUR * (ti + 273.15), psat(ti));

    // Liquid-water sources, as prescribed vapour pressures at fixed nodes. Rain wets the outer face of an
    // absorbent layer, whose vapour pressure then rises from ambient towards saturation at the sun-warmed face.
    const rain = RAIN_MM[m] * (RAIN_FACTOR[loc.id] ?? 1) * (inp.catch ?? 0);
    const wetFace = clamp((rain * absorbOuter) / WET_CAP, 0, 1);
    const src = new Map<number, number>([[0, pe + wetFace * (psat(te + SUN_K[m]) - pe)]]);
    // Rising damp holds the base masonry (outside any insulation) at a high RH, but never drier than the air outside.
    for (let k = 1; k <= Math.min(massRun, n - 1); k++) src.set(k, Math.min(Math.max((inp.footing ?? 0) * ps[k], pe), 0.99 * ps[k]));

    // Solve the month for a given choice of dry-cup or wet-cup mu in each layer.
    const solve = (wet: boolean[]) => {
      const S = [0];
      layers.forEach((l, i) => S.push(S[i] + (wet[i] ? l.muWet : l.mu) * (l.t / 1000)));

      // Pressure profile, linear in sd between the fixed nodes (sources, saturated interfaces, the inside).
      const profile = (F: Set<number>): number[] => {
        const anchors = [...new Set([...src.keys(), ...F, n])].sort((a, b) => a - b);
        const pA = (k: number) => (F.has(k) ? ps[k] : k === n ? pi : (src.get(k) as number));
        const p = new Array<number>(n + 1);
        for (let i = 0; i < anchors.length - 1; i++) {
          const a = anchors[i];
          const b = anchors[i + 1];
          for (let k = a; k <= b; k++) p[k] = pA(a) + ((pA(b) - pA(a)) * (S[k] - S[a])) / (S[b] - S[a]);
        }
        return p;
      };

      const F = new Set<number>();
      M.forEach((v, k) => v > 0 && F.add(k));
      let p = profile(F);
      for (let it = 0; it < 50; it++) {
        let worst = -1;
        let ex = 0.5; // Pa tolerance
        for (let k = 1; k < n; k++) if (!F.has(k) && !src.has(k) && p[k] - ps[k] > ex) { ex = p[k] - ps[k]; worst = k; }
        if (worst < 0) break;
        F.add(worst);
        p = profile(F);
      }

      // Net condensation (+) or evaporation (-) at each saturated interface over the month, g/m².
      const secs = DAYS[m] * 86400;
      const anchors = [...new Set([...src.keys(), ...F, n])].sort((a, b) => a - b);
      const Mn = M.slice();
      const drained = new Array<number>(n + 1).fill(0);
      for (let i = 1; i < anchors.length - 1; i++) {
        const c = anchors[i];
        if (!F.has(c)) continue;
        const gIn = (p[anchors[i + 1]] - ps[c]) / (S[anchors[i + 1]] - S[c]);
        const gOut = (ps[c] - p[anchors[i - 1]]) / (S[c] - S[anchors[i - 1]]);
        const held = Math.max(0, M[c] + DELTA_A * (gIn - gOut) * secs * 1000);
        // Water on the face of an air cavity runs down and out through the weep holes: counted, not held.
        if (layers[c - 1].air || layers[c].air) { drained[c] = held; Mn[c] = 0; } else Mn[c] = held;
      }
      return { S, p, Mn, drained };
    };

    // A layer above WET_RH takes its wet-cup mu (more open for hygroscopic materials). The RH depends on
    // the profile, which depends on mu, so iterate a few times; if it hasn't settled the last pass stands.
    let wet = layers.map(() => false);
    let r = solve(wet);
    for (let it = 0; it < 4; it++) {
      const next = layers.map((l, i) => l.muWet < l.mu && (r.p[i] / ps[i] + r.p[i + 1] / ps[i + 1]) / 2 > WET_RH);
      if (next.every((v, i) => v === wet[i])) break;
      wet = next;
      r = solve(wet);
    }
    const total = r.Mn.reduce((a, v) => a + v, 0);
    const flux = layers.map((_, i) => (DELTA_A * (r.p[i] - r.p[i + 1]) * 86.4e6) / (r.S[i + 1] - r.S[i])); // kg/m²s -> g/m²/day
    const tSurf = ti - ((ti - te) * RSI_MOULD) / (Rtot - rsi + RSI_MOULD);
    const state: MonthState = {
      month: m, te, ti, rhi: (pi / psat(ti)) * 100, rhSurf: (pi / psat(tSurf)) * 100, T, S: r.S, p: r.p, ps, stored: r.Mn, total, rhe: RH_OUT[m], pe, drained: r.drained, flux, wetFace,
    };
    return { state, M: r.Mn };
  };

  let M = new Array<number>(n + 1).fill(0);
  const months: MonthState[] = new Array(12);
  const year1: number[] = [];
  let yearN: number[] = [];
  let peak = 0;
  let peakNode = -1;
  let peakAt = 0; // g/m² held at peakNode when the total peaked
  const drainedBy = new Array<number>(n + 1).fill(0); // year-1 condensate drained, per node
  for (let y = 0; y < YEARS; y++) {
    const totals: number[] = [];
    for (const m of YEAR_ORDER) {
      const r = stepMonth(m, M);
      M = r.M;
      if (y === 0) {
        months[m] = r.state;
        r.state.drained.forEach((v, k) => (drainedBy[k] += v));
      }
      totals.push(r.state.total);
      if (r.state.total > peak) {
        peak = r.state.total;
        peakAt = Math.max(...r.state.stored);
        peakNode = r.state.stored.indexOf(peakAt);
      }
    }
    if (y === 0) year1.push(...totals);
    yearN = totals;
  }

  const verdict = peak < DRY ? 'none' : yearN[11] < DRY ? 'dries' : 'accumulates';
  const peakIdx = year1.indexOf(Math.max(...year1));
  const dryIdx = year1.findIndex((v, i) => i > peakIdx && v < DRY);
  // Condensate at the peak interface soaks into the hygroscopic layers either side, down to ABSORB_MM each.
  const absorbers = peakNode > 0 ? [layers[peakNode - 1], layers[peakNode]].filter((l) => l.hygro !== undefined) : [];
  const capacity = absorbers.reduce((a, l) => a + l.rho * Math.min(l.t, ABSORB_MM), 0); // g of dry material per m²
  const absorbed = capacity > 0 ? { pct: (peakAt / capacity) * 100, crit: Math.min(...absorbers.map((l) => l.hygro as number)) * 100 } : undefined;
  const drainedTotal = drainedBy.reduce((a, v) => a + v, 0);
  return {
    layers, months, year1, yearN, peak, peakNode, absorbed, dampLayers, verdict,
    drainedTotal, drainedNode: drainedTotal >= DRY ? drainedBy.indexOf(Math.max(...drainedBy)) : -1,
    dryMonth: dryIdx >= 0 ? YEAR_ORDER[dryIdx] : undefined,
    mouldMonths: months.filter((s) => s.rhSurf > MOULD_RH).map((s) => s.month),
    missing,
    cutAtVent: ventAt >= 0,
  };
}
