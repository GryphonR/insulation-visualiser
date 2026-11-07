// Check the model against gas bills (board 4d): a monthly degree-day model with three household knobs,
// ASHRAE Guideline 14 fit statistics, and an energy signature from the bills themselves.
import { DAYS, MEAN } from './data';
import type { HouseResult } from './house';

const UK_MEAN = MEAN.reduce((a, b) => a + b, 0) / 12;

export interface Bills {
  /** Gas used each month, kWh (NaN where unknown). */
  gas: number[];
  /** Mean outside temperature each month of the billing year, °C (NaN: use the typical year for the region). */
  temps: number[];
  /** Gas for cooking and hot water per month, kWh; NaN to estimate from the summer months. */
  base: number;
  /** Seasonal efficiency of the boiler on these bills, %; unset: the model's own figure when the house is on a boiler. */
  eff?: number;
}
export interface Knobs { dt: number; q: number; hf: number }
export const NO_KNOBS: Knobs = { dt: 0, q: 1, hf: 1 };

export interface Fit {
  pred: number[]; meas: number[]; temps: number[]; base: number;
  cv: number; nmbe: number; n: number; good: boolean;
  /** Heat loss coefficient from the model (with the airtightness factor) and from the bills' energy signature, W/K. */
  htcModel: number; htcMeter: number | null;
  signature: Array<{ t: number; w: number }>; sigLine: { a: number; b: number } | null;
  /** Monthly-mean degree days are scaled by this to match the postcode's HDD. */
  kDD: number;
}

/** Model gas per month for the knobs. Space heat = hf × (H_fabric + q·H_vent) × degree days at (15.5 + dt). */
export function calibrate(res: HouseResult, bills: Bills, eff: number, k: Knobs): Fit {
  const off = res.Tg - UK_MEAN;
  const temps = bills.temps.map((t, m) => (Number.isFinite(t) ? t : MEAN[m] + off));
  // Monthly-mean degree days miss cold spells; scale so the typical year matches the postcode's HDD.
  const typ = MEAN.reduce((a, t, m) => a + Math.max(0, 15.5 - (t + off)) * DAYS[m], 0) || 1;
  const kDD = res.hdd / typ;
  const vent = res.paths.find((p) => p.label === 'Ventilation')?.W ?? 0;
  const dT = res.peakW / Math.max(1, res.htc);
  const Hv = vent / dT, Hf = res.htc - Hv, H = Hf + Hv * k.q;
  const meas = bills.gas;
  const summer = [5, 6, 7].map((m) => meas[m]).filter(Number.isFinite);
  const base = Number.isFinite(bills.base) ? bills.base : summer.length ? Math.min(...summer) : 0;
  const pred = temps.map((t, m) => (k.hf * H * Math.max(0, 15.5 + k.dt - t) * DAYS[m] * kDD * 24) / 1000 / (eff / 100) + base);
  const idx = meas.map((v, m) => (Number.isFinite(v) ? m : -1)).filter((m) => m >= 0), n = idx.length;
  const mean = idx.reduce((a, m) => a + meas[m], 0) / Math.max(1, n);
  const cv = n > 1 ? (Math.sqrt(idx.reduce((a, m) => a + (meas[m] - pred[m]) ** 2, 0) / (n - 1)) / mean) * 100 : NaN;
  const nmbe = n > 1 ? (idx.reduce((a, m) => a + (pred[m] - meas[m]), 0) / ((n - 1) * mean)) * 100 : NaN;
  // Energy signature: average heating power each month against outside temperature, heating months only.
  const signature = idx.filter((m) => temps[m] < 13).map((m) => ({ t: temps[m], w: (Math.max(0, meas[m] - base) * (eff / 100) * 1000) / (DAYS[m] * 24) }));
  let sigLine: Fit['sigLine'] = null, htcMeter: number | null = null;
  if (signature.length >= 3) {
    const mx = signature.reduce((a, p) => a + p.t, 0) / signature.length, my = signature.reduce((a, p) => a + p.w, 0) / signature.length;
    const sxx = signature.reduce((a, p) => a + (p.t - mx) ** 2, 0);
    if (sxx > 1e-6) {
      const b = signature.reduce((a, p) => a + (p.t - mx) * (p.w - my), 0) / sxx;
      sigLine = { a: my - b * mx, b };
      htcMeter = -b / kDD;
    }
  }
  return { pred, meas, temps, base, cv, nmbe, n, good: n >= 6 && cv < 15 && Math.abs(nmbe) < 5, htcModel: H, htcMeter, signature, sigLine, kDD };
}

/** Grid search over the knobs, preferring small changes from the inputs (a gentle prior keeps the fit sensible). */
export function bestFit(res: HouseResult, bills: Bills, eff: number): Knobs {
  let best: [number, Knobs] | null = null;
  for (let dt = -3; dt <= 3.001; dt += 0.1) {
    for (let q = 0.6; q <= 1.6001; q += 0.02) {
      for (let hf = 0.6; hf <= 1.0001; hf += 0.02) {
        const f = calibrate(res, bills, eff, { dt, q, hf });
        if (!Number.isFinite(f.cv)) continue;
        let score = f.cv ** 2 + 4 * f.nmbe ** 2 + 20 * dt ** 2 + 400 * (q - 1) ** 2 + 400 * (1 - hf) ** 2;
        // The signature's slope pins the fabric + air: steer the airtightness factor towards it.
        if (f.htcMeter) score += 2000 * ((f.htcModel - f.htcMeter) / f.htcMeter) ** 2;
        if (!best || score < best[0]) best = [score, { dt: Math.round(dt * 10) / 10, q: Math.round(q * 100) / 100, hf: Math.round(hf * 100) / 100 }];
      }
    }
  }
  return best?.[1] ?? NO_KNOBS;
}

/** Gas kWh per m³: calorific value 39.5 MJ/m³ × volume correction 1.02264 ÷ 3.6 (the factor on UK gas bills). */
export const KWH_PER_M3 = (39.5 * 1.02264) / 3.6;

/**
 * Monthly totals from a meter-reading CSV (supplier, n3rgy or Bright export): a date or timestamp column and a
 * consumption column, any interval (half-hourly, daily, monthly). Keeps the last 12 months of data.
 */
export function parseMeterCsv(text: string, unit: 'kWh' | 'm3'): { gas: number[]; months: string[]; rows: number; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const split = (l: string) => l.split(/[,;\t]/).map((x) => x.replace(/^"|"$/g, '').trim());
  if (lines.length < 2) return { gas: Array(12).fill(NaN), months: [], rows: 0, error: 'the file has no data rows' };
  const head = split(lines[0]).map((x) => x.toLowerCase());
  const dateCol = head.findIndex((x) => /date|time|start|period|interval/.test(x));
  const valCol = head.findIndex((x, i) => i !== dateCol && /kwh|consumption|usage|value|reading|m3|m³/.test(x));
  if (dateCol < 0 || valCol < 0) return { gas: Array(12).fill(NaN), months: [], rows: 0, error: 'could not find a date column and a consumption column in the header' };
  const parseDate = (s: string): Date | null => {
    const uk = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (uk) return new Date(Date.UTC(+uk[3], +uk[2] - 1, +uk[1]));
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const byMonth = new Map<string, number>();
  let rows = 0;
  for (const l of lines.slice(1)) {
    const f = split(l), d = parseDate(f[dateCol] ?? ''), v = Number(f[valCol]);
    if (!d || !Number.isFinite(v)) continue;
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + v * (unit === 'm3' ? KWH_PER_M3 : 1));
    rows++;
  }
  const keys = [...byMonth.keys()].sort().slice(-12);
  const gas = Array(12).fill(NaN) as number[];
  for (const k of keys) gas[+k.slice(5) - 1] = Math.round(byMonth.get(k)!);
  return { gas, months: keys, rows, error: rows ? undefined : 'no rows had a readable date and number' };
}

/** Twelve months of gas for the demo house, so the view has something to fit. */
export function demoBills(res: HouseResult, eff: number): Bills {
  const truth = { dt: -1.2, q: 1.12, hf: 0.93 }, noise = [1.03, 0.97, 1.02, 0.98, 1.05, 1, 0.99, 1.01, 0.96, 1.02, 0.98, 1.01];
  const f = calibrate(res, { gas: Array(12).fill(0), temps: Array(12).fill(NaN), base: 290 }, eff, truth);
  return { gas: f.pred.map((p, m) => Math.round(p * noise[m])), temps: Array(12).fill(NaN), base: NaN };
}
