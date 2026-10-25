// Hour-by-hour whole-house runs (boards 6, 6a, 4b): one air-and-contents node per room plus the loft,
// heating on a schedule with a setback, sun through windows, people, appliances and cooking.
import { DOY, MEAN, ORIENTS, SWING } from './data';
import { solarAt, solarFromData } from './solar';
import type { Tmy } from './weather-tmy';
import { calcHouse, heatPumpCop } from './house';
import type { House, HouseResult, RoomType } from './house';
import { roomOut, roomSchedule, systemFlow } from './house-heating';

export type CaseId = 'design' | 'summer' | 'snap' | 'year';
export const CASES: Array<{ id: CaseId; name: string; use: string }> = [
  { id: 'design', name: 'Winter design day', use: 'Peak heating with the schedule and setback, overcast, at the design temperature.' },
  { id: 'year', name: 'Typical year', use: 'Annual energy, monthly use and comfort hours.' },
  { id: 'summer', name: 'Summer peak day', use: 'Overheating in bedrooms and lofts: clear sky, 15–29 °C, no heating.' },
  { id: 'snap', name: 'Cold snap, 5 days', use: 'How long rooms hold heat with the heating off.' },
];

const BED: RoomType[] = ['bedroom', 'bathroom'];
const LIVING: RoomType[] = ['living', 'dining', 'kitchen', 'study'];
const PATTERNS = {
  work: (h: number, we: boolean) => we || h < 8 || h >= 17,
  home: () => true,
  shift: (h: number, we: boolean) => we || (h >= 9 && h < 20),
};

/** Internal gains for one hour, W: [people awake, people asleep, appliances + lighting, cooking]. Board 6a. */
export function hourGains(g: House['gains'], h: number, weekend: boolean): [number, number, number, number] {
  const home = PATTERNS[g.pattern](h, weekend), asleep = h < 7 || h >= 23, n = home ? g.people : 0;
  const app = 60 + (home && !asleep ? 110 : 0) + (home && h >= 18 && h < 22 ? 150 : 0) + (home && !asleep && (h < 8 || h >= 16) ? 110 : 0);
  const cook = home && (h === 7 || h === 18) ? (h === 18 ? 700 : 300) : 0;
  return [asleep ? 0 : n * 100, asleep ? n * 70 : 0, app, cook];
}

// Smooth repeatable "weather noise" in −1..1, so cold spells last a few days.
const noise = (d: number) => 0.5 * Math.sin(d * 1.7 + 0.3) * Math.sin(d * 0.23) + 0.3 * Math.sin(d * 0.61 + 1.1) + 0.2 * Math.sin(d * 2.9);
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_OF_DAY = DAYS.flatMap((n, m) => Array(n).fill(m) as number[]);
const UK_MEAN = MEAN.reduce((a, b) => a + b, 0) / 12;

interface Weather {
  T: (t: number) => number; c: (t: number) => number; doy: (t: number) => number; hours: number; warmup: number;
  /** Measured sun on a surface for this hour, when the weather comes from a file. */
  sol?: (t: number, orient: (typeof ORIENTS)[number]) => number;
}

function weather(id: CaseId, res: HouseResult, regionMean: number, tmy?: Tmy): Weather {
  if (id === 'year' && tmy) {
    // Hourly data, hour k = k hours after 1 Jan 00:00 UTC (≈ GMT); interpolate between readings.
    const at = (a: Float32Array, t: number) => { const k = Math.floor(t), f = t - k; return a[k % 8760] * (1 - f) + a[(k + 1) % 8760] * f; };
    return {
      T: (t) => at(tmy.T, t), c: () => 0.5, doy: (t) => (Math.floor(t / 24) % 365) + 1, hours: 8760, warmup: 24 * 14,
      sol: (t, o) => { const k = Math.floor(t) % 8760; return solarFromData(tmy.lat, (Math.floor(t / 24) % 365) + 1, (t % 24) + 0.5 + tmy.lon / 15, tmy.dni[k], tmy.dhi[k], o); },
    };
  }
  const sine = (t: number, mean: number, amp: number) => mean + amp * Math.sin(((t % 24) - 9) / 24 * 2 * Math.PI);
  if (id === 'design') return { T: (t) => sine(t, res.Tout + 2.5, 2.5), c: () => 0.15, doy: () => 21, hours: 24, warmup: 24 * 6 };
  if (id === 'summer') return { T: (t) => sine(t, 22, 7), c: () => 0.9, doy: () => 202, hours: 24, warmup: 24 * 6 };
  if (id === 'snap') return { T: (t) => sine(t, res.Tout + 2, 2), c: () => 0.3, doy: () => 21, hours: 24 * 5, warmup: 24 * 3 };
  // Typical year: monthly means shifted to the region, a daily swing, and day-to-day spells.
  const off = regionMean - UK_MEAN;
  return {
    T: (t) => {
      const d = Math.floor(t / 24) % 365, m = MONTH_OF_DAY[d];
      return MEAN[m] + off + 3 * noise(d) + (SWING[m] / 2) * Math.sin(((t % 24) - 9) / 24 * 2 * Math.PI);
    },
    c: (t) => Math.min(0.95, Math.max(0.1, 0.45 + 0.35 * noise(Math.floor(t / 24) + 40))),
    doy: (t) => (Math.floor(t / 24) % 365) + 1, hours: 8760, warmup: 24 * 14,
  };
}

export interface SimResult {
  id: CaseId; hours: number;
  rooms: Array<{ id: string; name: string; heated: boolean; setpoint: number }>;
  /** Hourly arrays: outside air, total heat delivered (W), and per-room air temperature and heat (W). */
  out: Float32Array; heat: Float32Array; T: Float32Array[]; P: Float32Array[];
  loftT: Float32Array | null;
  peakW: number; heatKWh: number; elecKWh: number;
  comfort: Array<{ id: string; cold: number; warm: number; min: number; max: number; below16: number | null }>;
}

const DT = 600; // s

/** One run of a test case. Pass a typical meteorological year to drive the year case with real hourly weather. */
export function simulate(h: House, id: CaseId, base: HouseResult = calcHouse(h), tmy?: Tmy): SimResult {
  const lat = base.climate.lat;
  const wx = weather(id, base, base.Tg, tmy);
  const heatingOn = id !== 'summer';
  const rooms = base.rooms;
  const N = rooms.length + (base.loft ? 1 : 0), LOFT = rooms.length;
  const idx = new Map(rooms.map((r, i) => [r.room.id, i]));
  const g = h.gains;

  // Node capacity: contents mass by floor area plus air.
  // Two parts per room (ISO 13790 simple hourly idea): air that settles within minutes, and the fabric and
  // contents mass (kJ/m²K of floor) tied to it by 9.1 W/m²K over 2.5 × the floor area.
  const Cm = new Float64Array(N), Hms = new Float64Array(N);
  rooms.forEach((r, i) => { const A = r.area * r.room.span; Cm[i] = A * g.mass * 1000; Hms[i] = 9.1 * 2.5 * A; });
  if (base.loft) { Cm[LOFT] = base.loft.area * 15 * 1000; Hms[LOFT] = 9.1 * 2 * base.loft.area; }

  // Links between nodes (each shared face once) and conductances to fixed temperatures.
  const links: Array<[number, number, number]> = [];
  const Hout = new Float64Array(N), Hg = new Float64Array(N), Hp = new Float64Array(N);
  const seen = new Set<string>();
  const solar: Array<{ node: number; area: number; g: number; orient: (typeof ORIENTS)[number] }> = [];
  rooms.forEach((r, i) => {
    for (const f of r.faces) {
      const UA = f.U * f.area;
      if (f.to.k === 'out') Hout[i] += UA;
      else if (f.to.k === 'ground') Hg[i] += UA;
      else if (f.to.k === 'party') Hp[i] += UA;
      else if (f.to.k === 'loft') { if (base.loft) links.push([i, LOFT, UA]); else Hout[i] += UA; }
      else if (!seen.has(f.key) || f.key.startsWith('op:')) {
        seen.add(f.key);
        const j = idx.get(f.to.id);
        if (j !== undefined) links.push([i, j, UA]);
      }
      // Windows in slopes or dormer roofs face the sky: treat as a flat roof light.
      if (f.kind === 'window') solar.push({ node: i, area: f.area, g: f.gEff ?? g.g, orient: ORIENTS.find((o) => o.id === (f.key.startsWith('rl:') ? 'roof' : f.side))! });
    }
    Hout[i] += 0.33 * r.n * r.V;
  });
  if (base.loft) {
    // Roof plus loft ventilation, recovered from the design calc's balance: H = Σ(links)·(Tin − T)/(T − Tout).
    const Hin = links.filter((l) => l[1] === LOFT).reduce((t, l) => t + l[2] * (rooms[l[0]].T - base.loft!.T), 0);
    Hout[LOFT] = Math.max(1, Hin / Math.max(0.05, base.loft.T - base.Tout));
  }

  // Heating: each room's emitters at the system flow for this hour, on its zone's schedule.
  const needs = rooms.filter((r) => r.room.heated).map((r) => ({ room: r.room, need: r.totalW }));
  const flowCache = new Map<number, number>();
  const flowAt = (Te: number) => {
    const k = Math.round(Te * 4) / 4;
    if (!flowCache.has(k)) flowCache.set(k, systemFlow(h, needs, base.Tout, k));
    return flowCache.get(k)!;
  };
  const off = Array(24).fill(0);
  const sched = rooms.map((r) => (r.room.heated ? roomSchedule(h, r.room) ?? off : off));

  // Gain shares: awake gains to living spaces, asleep to bedrooms, cooking to kitchens (by floor area).
  const share = (types: RoomType[]) => {
    const pick = rooms.map((r) => (r.room.heated && types.includes(r.room.type) ? r.area : 0));
    const tot = pick.reduce((a, b) => a + b, 0);
    const all = rooms.map((r) => (r.room.heated ? r.area : 0)), allT = all.reduce((a, b) => a + b, 0) || 1;
    return tot > 0 ? pick.map((a) => a / tot) : all.map((a) => a / allT);
  };
  const sLiv = share(LIVING), sBed = share(['bedroom']), sKit = share(['kitchen']);

  const T = new Float64Array(N), Tm = new Float64Array(N);
  rooms.forEach((r, i) => { T[i] = r.T; });
  if (base.loft) T[LOFT] = base.loft.T;
  Tm.set(T);
  // Conductance from each node's air to everything around it (fixed while the house is unchanged).
  const Hsum = new Float64Array(N);
  for (let i = 0; i < N; i++) Hsum[i] = Hout[i] + Hg[i] + Hp[i] + Hms[i];
  for (const [a, b, UA] of links) { Hsum[a] += UA; Hsum[b] += UA; }

  const hours = wx.hours;
  const out = new Float32Array(hours), heat = new Float32Array(hours);
  const Th = rooms.map(() => new Float32Array(hours)), Ph = rooms.map(() => new Float32Array(hours));
  const loftT = base.loft ? new Float32Array(hours) : null;
  const total = wx.warmup + hours, stepsPerH = 3600 / DT;
  const rhs = new Float64Array(N), gain = new Float64Array(N), P = new Float64Array(N);

  for (let s = 0; s < total * stepsPerH; s++) {
    const tAbs = s / stepsPerH;
    // Warm-up runs the start of the case (the last day for one-day cases) so the record begins settled.
    const tc = tAbs < wx.warmup ? (id === 'year' ? (tAbs % (24 * 14)) : tAbs % 24) : tAbs - wx.warmup;
    const hr = Math.floor(tc) % 24, day = Math.floor(tc / 24);
    const To = wx.T(tc), weekend = id === 'year' ? day % 7 >= 5 : false;
    const [awake, asleep, app, cook] = hourGains(g, hr, weekend);
    gain.fill(0);
    rooms.forEach((_, i) => { gain[i] = awake * sLiv[i] + asleep * sBed[i] + app * sLiv[i] + cook * sKit[i]; });
    const c = wx.c(tc), doy = wx.doy(tc);
    for (const w of solar) if (w.orient) gain[w.node] += (wx.sol ? wx.sol(tc, w.orient) : solarAt(lat, doy, (tc % 24) + 0.5 / stepsPerH, c, w.orient)) * w.area * w.g;

    // Air: balance of heat in and out given the mass and the neighbours' last air temperatures.
    for (let i = 0; i < N; i++) rhs[i] = gain[i] + Hout[i] * To + Hg[i] * base.Tg + Hp[i] * h.neighbourT + Hms[i] * Tm[i];
    for (const [a, b, UA] of links) { rhs[a] += UA * T[b]; rhs[b] += UA * T[a]; }
    const snapOff = id === 'snap' && tAbs >= wx.warmup;
    let Ptot = 0;
    P.fill(0);
    const flow = flowAt(To);
    rooms.forEach((r, i) => {
      if (!r.room.heated || !heatingOn || snapOff || sched[i] === off) return;
      // The cold snap starts from a house held at its setpoints.
      const set = sched[i][hr] || id === 'snap' ? r.room.setpoint : g.setback;
      const need = set * Hsum[i] - rhs[i];
      if (need <= 0) return;
      P[i] = Math.min(roomOut(h, r.room.id, flow, T[i]), need);
      Ptot += P[i];
    });
    const cap = h.hp.capacity * 1000;
    if (Ptot > cap) { for (let i = 0; i < N; i++) P[i] *= cap / Ptot; Ptot = cap; }
    for (let i = 0; i < N; i++) {
      T[i] = (rhs[i] + P[i]) / Hsum[i];
      Tm[i] += (Hms[i] * (T[i] - Tm[i]) * DT) / Cm[i];
    }

    if (tAbs >= wx.warmup) {
      const k = Math.floor(tc);
      if (k < hours) {
        out[k] += To / stepsPerH; heat[k] += Ptot / stepsPerH;
        for (let i = 0; i < rooms.length; i++) { Th[i][k] += T[i] / stepsPerH; Ph[i][k] += P[i] / stepsPerH; }
        if (loftT) loftT[k] += T[LOFT] / stepsPerH;
      }
    }
  }

  let peakW = 0, heatKWh = 0, elecKWh = 0;
  for (let k = 0; k < hours; k++) {
    peakW = Math.max(peakW, heat[k]);
    heatKWh += heat[k] / 1000;
    elecKWh += heat[k] / 1000 / heatPumpCop(flowAt(out[k]), out[k]);
  }
  const comfort = rooms.map((r, i) => {
    let cold = 0, warm = 0, min = Infinity, max = -Infinity, below16: number | null = null;
    for (let k = 0; k < hours; k++) {
      const t = Th[i][k];
      min = Math.min(min, t); max = Math.max(max, t);
      if (r.room.heated && heatingOn && sched[i][k % 24] && t < r.room.setpoint - 1) cold++;
      if (t > (BED.includes(r.room.type) ? 26 : 25)) warm++;
      if (below16 === null && t < 16) below16 = k;
    }
    return { id: r.room.id, cold, warm, min, max, below16 };
  });
  return {
    id, hours, rooms: rooms.map((r) => ({ id: r.room.id, name: r.room.name, heated: r.room.heated, setpoint: r.room.setpoint })),
    out, heat, T: Th, P: Ph, loftT, peakW, heatKWh, elecKWh, comfort,
  };
}

/** Daily and monthly heat from a year run, kWh. */
export function yearTotals(r: SimResult) {
  const days = Array.from({ length: Math.floor(r.hours / 24) }, (_, d) => {
    let s = 0;
    for (let k = d * 24; k < d * 24 + 24; k++) s += r.heat[k];
    return s / 1000;
  });
  const months = DAYS.map((_, m) => days.reduce((t, v, d) => (MONTH_OF_DAY[d] === m ? t + v : t), 0));
  return { days, months, monthOfDay: MONTH_OF_DAY, doyStart: DOY };
}
