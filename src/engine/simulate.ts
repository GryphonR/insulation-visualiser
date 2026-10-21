import { clamp } from '../lib/util';
import { MAT } from './data';
import type { Material, Orient } from './data';
import { solarAt } from './solar';

export interface LayerInput {
  id: number;
  mat: string;
  t: number;
}

/** Lumped single-zone room coupled to the modelled element (free-floating mode). */
export interface FreeRoom {
  /** Area of the modelled element, m². */
  Ael: number;
  /** Other external fabric, m² (same U-value, no sun, no mass). */
  Arest: number;
  /** Glazing area on the same face, m². */
  Ag: number;
  /** Solar transmittance of the glazing incl. shading. */
  gSol: number;
  /** Constant internal gains, W. */
  Qint: number;
  /** Ventilation + glazing conduction conductance, W/K. */
  Uv: number;
  /** Room heat capacity (air + contents), J/K. */
  Cr: number;
}

export interface SimParams {
  layers: LayerInput[];
  orient: Orient;
  lat: number;
  doy: number;
  /** Sky clearness 0..1. */
  c: number;
  /** Solar absorptance of the outer surface. */
  alpha: number;
  /** Daily mean and range of outdoor air temperature. */
  tmean: number;
  swing: number;
  /** Prescribed room air temperature by solar hour (ignored when `free`). */
  tinF: (h: number) => number;
  free?: FreeRoom;
}

export interface Cell {
  k: number;
  dx: number;
  C: number;
  li: number;
  /** Conductance to outdoor air (ventilated gap cells only), W/m²K. */
  gv: number;
  x0: number;
  x1: number;
}

export interface LayerGeom {
  x0: number;
  x1: number;
  R: number;
  C: number;
  k: number;
  name: string;
  mat: Material;
}

/** Number of stored frames (every 10 minutes, plus the closing 24:00 frame). */
export const N_FRAMES = 145;
export const FRAMES_PER_HOUR = 6;
/** Heat exchange between a ventilated gap and outdoor air, W/m²K (~0.5 m/s through a 40 mm gap on a 5 m rafter). */
const GV_VENT = 5;

export function harmonic(arr: ArrayLike<number>): { amp: number; ph: number } {
  const n = arr.length;
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * i) / n;
    a += arr[i] * Math.cos(w);
    b += arr[i] * Math.sin(w);
  }
  a *= 2 / n;
  b *= 2 / n;
  return { amp: Math.hypot(a, b), ph: Math.atan2(b, a) };
}

/** Phase lag (hours, 0..24) of `to` behind `from` for the daily first harmonic. */
export function lagHours(from: { ph: number }, to: { ph: number }): number {
  return ((((to.ph - from.ph) / (2 * Math.PI)) * 24) % 24 + 24) % 24;
}

export interface Frames {
  cellT: Float64Array[];
  prof: Float64Array[];
  tsOut: Float64Array;
  tsIn: Float64Array;
  /** Heat flow into the room at the inner face, W/m² (positive = into room). */
  q: Float64Array;
  /** Heat flow entering the wall at the outer face, W/m² (positive = towards the room). */
  qOut: Float64Array;
  tin: Float64Array;
  tsa: Float64Array;
  tair: Float64Array;
  I: Float64Array;
}

/**
 * One-dimensional transient conduction through a layered element, driven by
 * sol-air temperature outside. Cell-centred finite volume, backward Euler,
 * 2-minute steps, repeated for several days until the daily cycle settles.
 */
export function simulate(P: SimParams) {
  const Rse = 0.04;
  const Rsi = P.orient.id === 'roof' ? 0.1 : 0.13;
  const cells: Cell[] = [];
  const lay: LayerGeom[] = [];
  let xmm = 0;
  P.layers.forEach((L, li) => {
    const m = MAT[L.mat];
    const d = L.t / 1000;
    const k = m.R ? d / m.R : (m.k as number);
    const n = clamp(Math.ceil(L.t / (k > 0.4 ? 15 : 40)), 2, 14);
    const x0 = xmm;
    for (let j = 0; j < n; j++) {
      cells.push({ k, dx: d / n, C: (m.rho * m.cp * d) / n, li, gv: m.vent ? GV_VENT / n : 0, x0: x0 + (j * L.t) / n, x1: x0 + ((j + 1) * L.t) / n });
    }
    lay.push({ x0, x1: x0 + L.t, R: d / k, C: m.rho * m.cp * d, k, name: m.name, mat: m });
    xmm += L.t;
  });
  const N = cells.length;
  const total = xmm;
  // A ventilated gap ties its air to outdoor air in parallel with the path through the outer layers.
  // shortcut: only the first ventilated layer is handled, and the quoted U uses outdoor air = sol-air.
  const v = lay.findIndex((l) => l.mat.vent);
  let Rtot: number;
  if (v < 0) {
    Rtot = Rse + Rsi + lay.reduce((s, l) => s + l.R, 0);
  } else {
    const Rout = Rse + lay.slice(0, v).reduce((s, l) => s + l.R, 0) + lay[v].R / 2;
    const Rin = Rsi + lay.slice(v + 1).reduce((s, l) => s + l.R, 0) + lay[v].R / 2;
    Rtot = 1 / (GV_VENT + 1 / Rout) + Rin;
  }
  const U = 1 / Rtot;
  const dt = 120;
  const spd = 720;

  const G = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) G[i] = 1 / (cells[i].dx / (2 * cells[i].k) + cells[i + 1].dx / (2 * cells[i + 1].k));
  const Gout = 1 / (Rse + cells[0].dx / (2 * cells[0].k));
  const Gin = 1 / (Rsi + cells[N - 1].dx / (2 * cells[N - 1].k));
  const A = new Float64Array(N);
  const Cc = new Float64Array(N);
  const Bd = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    A[i] = i > 0 ? -G[i - 1] : 0;
    Cc[i] = i < N - 1 ? -G[i] : 0;
    Bd[i] = cells[i].C / dt + (i > 0 ? G[i - 1] : 0) + (i < N - 1 ? G[i] : 0) + (i === 0 ? Gout : 0) + (i === N - 1 ? Gin : 0) + cells[i].gv;
  }
  const cpr = new Float64Array(N);
  const bden = new Float64Array(N);
  bden[0] = Bd[0];
  cpr[0] = Cc[0] / bden[0];
  for (let i = 1; i < N; i++) {
    bden[i] = Bd[i] - A[i] * cpr[i - 1];
    cpr[i] = Cc[i] / bden[i];
  }

  // Environment at every step of the day.
  const tinK = new Float64Array(spd);
  const Ik = new Float64Array(spd);
  const tairK = new Float64Array(spd);
  const tsaK = new Float64Array(spd);
  let tsaMean = 0;
  let tinMean = 0;
  for (let k = 0; k < spd; k++) {
    const h = (k * dt) / 3600;
    tinK[k] = P.tinF(h);
    Ik[k] = solarAt(P.lat, P.doy, h, P.c, P.orient);
    tairK[k] = P.tmean + (P.swing / 2) * Math.cos((2 * Math.PI * (h - 15)) / 24);
    tsaK[k] = tairK[k] + P.alpha * Ik[k] * Rse - (P.orient.id === 'roof' ? 3.6 * P.c : 0);
    tsaMean += tsaK[k] / spd;
    tinMean += tinK[k] / spd;
  }
  const free = P.free;
  const Uv = free ? free.Uv + free.Arest * U : 0;
  if (free) {
    // Start the room at its daily-mean heat balance, so heavy, poorly ventilated rooms settle within the run.
    let ta = 0;
    let im = 0;
    for (let k = 0; k < spd; k++) {
      ta += tairK[k] / spd;
      im += Ik[k] / spd;
    }
    tinMean = (free.Ael * U * tsaMean + Uv * ta + free.gSol * free.Ag * im + free.Qint) / (free.Ael * U + Uv);
    tinK.fill(tinMean);
  }

  // Start from the steady state under the day's mean conditions.
  const T = new Float64Array(N);
  const qm = (tsaMean - tinMean) / Rtot;
  let r = Rse;
  for (let i = 0; i < N; i++) {
    const h2 = cells[i].dx / (2 * cells[i].k);
    r += h2;
    T[i] = tsaMean - qm * r;
    r += h2;
  }

  const fr: Frames = {
    cellT: [],
    prof: [],
    tsOut: new Float64Array(N_FRAMES),
    tsIn: new Float64Array(N_FRAMES),
    q: new Float64Array(N_FRAMES),
    qOut: new Float64Array(N_FRAMES),
    tin: new Float64Array(N_FRAMES),
    tsa: new Float64Array(N_FRAMES),
    tair: new Float64Array(N_FRAMES),
    I: new Float64Array(N_FRAMES),
  };
  const gC = cells.map((c) => (2 * c.k) / c.dx);
  const snap = (f: number, k: number) => {
    fr.cellT[f] = Float64Array.from(T);
    const tsa = tsaK[k];
    const gO = 1 / Rse;
    const gI = 1 / Rsi;
    const to = (gC[0] * T[0] + gO * tsa) / (gC[0] + gO);
    const ti = (gC[N - 1] * T[N - 1] + gI * tinK[k]) / (gC[N - 1] + gI);
    const pr = new Float64Array(2 * N + 1);
    pr[0] = to;
    for (let i = 0; i < N; i++) {
      pr[1 + 2 * i] = T[i];
      pr[2 + 2 * i] = i < N - 1 ? (gC[i] * T[i] + gC[i + 1] * T[i + 1]) / (gC[i] + gC[i + 1]) : ti;
    }
    fr.prof[f] = pr;
    fr.tsOut[f] = to;
    fr.tsIn[f] = ti;
    fr.q[f] = (ti - tinK[k]) / Rsi;
    fr.qOut[f] = (tsa - to) / Rse;
    fr.tin[f] = tinK[k];
    fr.tsa[f] = tsa;
    fr.tair[f] = tairK[k];
    fr.I[f] = Ik[k];
  };

  const days = free ? 14 : 6;
  const dp = new Float64Array(N);
  const rhs = new Float64Array(N);
  const solve = (out: Float64Array) => {
    dp[0] = rhs[0] / bden[0];
    for (let i = 1; i < N; i++) dp[i] = (rhs[i] - A[i] * dp[i - 1]) / bden[i];
    out[N - 1] = dp[N - 1];
    for (let i = N - 2; i >= 0; i--) out[i] = dp[i] - cpr[i] * out[i + 1];
  };
  // Free-floating room: T = Ta + Tb * Tin, where Tb is the (constant) response to a unit room temperature.
  const Tb = new Float64Array(N);
  const Ta = new Float64Array(N);
  let Tin = tinMean;
  if (free) {
    rhs.fill(0);
    rhs[N - 1] = Gin;
    solve(Tb);
  }
  for (let day = 0; day < days; day++) {
    const last = day === days - 1;
    if (last) snap(0, 0);
    for (let s = 0; s < spd; s++) {
      const kn = (s + 1) % spd;
      for (let i = 0; i < N; i++) rhs[i] = (cells[i].C / dt) * T[i] + cells[i].gv * tairK[kn];
      rhs[0] += Gout * tsaK[kn];
      if (free) {
        solve(Ta);
        const num = (free.Cr / dt) * Tin + free.Ael * Gin * Ta[N - 1] + Uv * tairK[kn] + free.gSol * free.Ag * Ik[kn] + free.Qint;
        const den = free.Cr / dt + free.Ael * Gin * (1 - Tb[N - 1]) + Uv;
        Tin = num / den;
        for (let i = 0; i < N; i++) T[i] = Ta[i] + Tb[i] * Tin;
        tinK[kn] = Tin;
      } else {
        rhs[N - 1] += Gin * tinK[kn];
        solve(T);
      }
      if (last && (s + 1) % 5 === 0) snap((s + 1) / 5, kn);
    }
  }

  // Positions of profile points (mm): outer surface, then centre and right face of every cell.
  const px: number[] = [0];
  cells.forEach((c) => {
    px.push((c.x0 + c.x1) / 2);
    px.push(c.x1);
  });

  const M = 2 * N + 1;
  const pmin = new Float64Array(M).fill(1e9);
  const pmax = new Float64Array(M).fill(-1e9);
  let extLo = Math.min(...Array.from(tinK));
  let extHi = Math.max(...Array.from(tinK));
  for (let f = 0; f < 144; f++) {
    const pr = fr.prof[f];
    for (let j = 0; j < M; j++) {
      if (pr[j] < pmin[j]) pmin[j] = pr[j];
      if (pr[j] > pmax[j]) pmax[j] = pr[j];
    }
    const ct = fr.cellT[f];
    for (let i = 0; i < N; i++) {
      if (ct[i] < extLo) extLo = ct[i];
      if (ct[i] > extHi) extHi = ct[i];
    }
  }

  // Colour scale: anchored on the room reference temperature so the same
  // colour always means the same thing relative to the room, in every
  // scenario and at every time of day. The midpoint of the scale (cream) is
  // the room reference; blue is always colder than the room, red always
  // warmer. The scale is symmetric around that reference so it is not
  // skewed by, say, a much larger swing on one side.
  let roomRef = 0;
  for (let f = 0; f < 144; f++) roomRef += fr.tin[f] / 144;
  const half = Math.max(extHi - roomRef, roomRef - extLo, 2);
  const tlo = roomRef - half;
  const thi = roomRef + half;

  // Metrics from the first harmonic of the daily cycle.
  const hs = harmonic(fr.tsa.subarray(0, 144));
  const hq = harmonic(fr.q.subarray(0, 144));
  const decr = hs.amp > 1e-6 ? hq.amp / (U * hs.amp) : 0;
  const lag = lagHours(hs, hq);
  let gain = 0;
  let loss = 0;
  // Steady-state comparison: what U x (sol-air - room) would give for the
  // same 24 h of outdoor and room temperatures, with no thermal mass at all.
  let gainSS = 0;
  let lossSS = 0;
  let solar = 0;
  let qmin = 1e9;
  let qmax = -1e9;
  let qsmin = 1e9;
  let qsmax = -1e9;
  let timin = 1e9;
  let timax = -1e9;
  const qss = new Float64Array(N_FRAMES);
  for (let f = 0; f < N_FRAMES; f++) {
    qss[f] = U * (fr.tsa[f] - fr.tin[f]);
    if (f < 144) {
      if (fr.q[f] > 0) gain += fr.q[f] / FRAMES_PER_HOUR;
      else loss -= fr.q[f] / FRAMES_PER_HOUR;
      if (qss[f] > 0) gainSS += qss[f] / FRAMES_PER_HOUR;
      else lossSS -= qss[f] / FRAMES_PER_HOUR;
      solar += fr.I[f] / FRAMES_PER_HOUR / 1000;
      qmin = Math.min(qmin, fr.q[f]);
      qmax = Math.max(qmax, fr.q[f]);
      qsmin = Math.min(qsmin, qss[f]);
      qsmax = Math.max(qsmax, qss[f]);
      timin = Math.min(timin, fr.tsIn[f]);
      timax = Math.max(timax, fr.tsIn[f]);
    }
  }

  // Thermal mass inside the main insulation (top 100 mm), kJ/m²K.
  let iIns = 0;
  let best = -1;
  lay.forEach((l, i) => {
    if (l.R > best) {
      best = l.R;
      iIns = i;
    }
  });
  let kin = 0;
  let depth = 0;
  for (let i = lay.length - 1; i > iIns; i--) {
    const thick = lay[i].x1 - lay[i].x0;
    const use = Math.min(thick, 100 - depth);
    if (use <= 0) break;
    kin += (lay[i].C * use) / thick / 1000;
    depth += use;
  }
  const ktot = lay.reduce((s, l) => s + l.C, 0) / 1000;

  // Heat flow through each face (N+1 faces), W/m², positive towards the room.
  const faceFlux = (ct: ArrayLike<number>, tsa: number, tin: number): Float64Array => {
    const o = new Float64Array(N + 1);
    o[0] = Gout * (tsa - ct[0]);
    for (let i = 0; i < N - 1; i++) o[i + 1] = G[i] * (ct[i] - ct[i + 1]);
    o[N] = Gin * (ct[N - 1] - tin);
    return o;
  };
  let fmax = 1;
  for (let f = 0; f < 144; f++) {
    const o = faceFlux(fr.cellT[f], fr.tsa[f], fr.tin[f]);
    for (let j = 0; j <= N; j++) fmax = Math.max(fmax, Math.abs(o[j]));
  }

  return {
    cells, lay, total, U, Rtot, fr, px, pmin, pmax, tlo, thi, roomRef,
    decr, lag, gain, loss, gainSS, lossSS, solar, qmin, qmax, qsmin, qsmax, qss, timin, timax,
    kin, ktot, faceFlux, fmax,
  };
}

export type SimResult = ReturnType<typeof simulate>;
