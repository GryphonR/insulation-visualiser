// Hour-by-hour whole-house runs (boards 6, 6a, 4b): one air-and-contents node per room plus the loft,
// heating on a schedule with a setback, sun through windows, people, appliances and cooking.
import { COLOURS, DAYS, DOY, MEAN, ORIENTS, SWING } from './data';
import { solarAt, solarFromData } from './solar';
import type { Tmy } from './weather-tmy';
import { calcHouse, sourceEff, tariff } from './house';
import type { Face, House, HouseResult, RoomType } from './house';
import type { Orient } from './data';
import { roomOut, roomSchedule, systemFlow } from './house-heating';

/** Where a face looks for the sun: its true bearing and tilt (vertical unless set). */
export function faceOrient(f: Pick<Face, 'az' | 'tilt' | 'side'>): Orient {
  const az = f.az ?? ORIENTS.find((o) => o.id === f.side)?.az ?? 0, tilt = f.tilt ?? 90;
  return { id: `az${Math.round(az)}t${Math.round(tilt)}`, name: '', label: '', az, tilt };
}

export type CaseId = 'design' | 'summer' | 'snap' | 'year';
export const CASES: Array<{ id: CaseId; q: string; name: string; use: string }> = [
  { id: 'design', q: 'Can the heating keep up on the coldest day?', name: 'Winter design day', use: 'Peak heating with the schedule and setback, overcast, at the design temperature.' },
  { id: 'year', q: 'What will a year of heating cost?', name: 'Typical year', use: 'Annual energy, monthly use and comfort hours.' },
  { id: 'summer', q: 'Will rooms overheat in a heatwave?', name: 'Summer peak day', use: 'Clear sky, 15–29 °C outside, no heating.' },
  { id: 'snap', q: 'How long does the house stay warm without heating?', name: 'Cold snap, 5 days', use: 'A power cut or breakdown: heating off from a house held at its setpoints, near the design temperature.' },
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
  /** Peak hour W; heat delivered and energy bought (electricity or boiler fuel), kWh. */
  peakW: number; heatKWh: number; boughtKWh: number;
  /** Heat delivered and energy bought in each calendar month, kWh (a one-day case lands in its own month). */
  monthHeat: number[]; monthBought: number[];
  /** Per room: hours too cold while heated (late: past the warm-up after switching on), too warm, the range, and the first hour below 16 °C. */
  comfort: Array<{ id: string; cold: number; late: number; warm: number; min: number; max: number; below16: number | null }>;
}

const DT = 600; // s
/** Hours a room may take to warm up after its heating comes on before it counts as falling short. */
const WARMUP_H = 2;

/** One run of a test case. Pass a typical meteorological year to drive the year case with real hourly weather. */
export function simulate(h: House, id: CaseId, base: HouseResult = calcHouse(h), tmy?: Tmy): SimResult {
  const lat = base.climate.lat;
  const wx = weather(id, base, base.Tg, tmy);
  const heatingOn = id !== 'summer';
  const rooms = base.rooms;
  const N = rooms.length + (base.loft ? 1 : 0), LOFT = rooms.length;
  const idx = new Map(rooms.map((r, i) => [r.room.id, i]));
  const g = h.gains;
  // An applied bills calibration: rooms run warmer or cooler by dt, and only a share hf of the heat is used.
  const dt = h.calib?.dt ?? 0, hf = h.calib?.hf ?? 1;

  // Node capacity: contents mass by floor area plus air.
  // Two parts per room (ISO 13790 simple hourly idea): air that settles within minutes, and the fabric and
  // contents mass (kJ/m²K of floor) tied to it by 9.1 W/m²K over 2.5 × the floor area.
  const Cm = new Float64Array(N), Hms = new Float64Array(N);
  rooms.forEach((r, i) => { const A = r.area * r.room.span; Cm[i] = A * g.mass * 1000; Hms[i] = 9.1 * 2.5 * A; });
  if (base.loft) { Cm[LOFT] = base.loft.area * 15 * 1000; Hms[LOFT] = 9.1 * 2 * base.loft.area; }

  // Links between nodes (each shared face once) and conductances to fixed temperatures.
  const links: Array<[number, number, number]> = [];
  const Hout = new Float64Array(N), Hg = new Float64Array(N), Hp = new Float64Array(N);
  // Sun on glass (area × g), and on roofs as sol-air: U·A × α·Rse of the absorbed sun, less a clear-night sky loss.
  const solar: Array<{ node: number; area: number; g: number; orient: (typeof ORIENTS)[number] }> = [];
  const sky: Array<{ node: number; UA: number; f: number }> = [];
  const alpha = (COLOURS.find((c) => c.id === h.roofColour) ?? COLOURS[1]).a, RSE = 0.04;
  const roofSun = (node: number, UA: number, orient: Orient) => {
    solar.push({ node, area: UA, g: alpha * RSE, orient });
    // shortcut: sky loss of 3.6·c K on the sol-air temperature (as the one-build-up run uses) scaled by cos(tilt), so walls see none.
    sky.push({ node, UA, f: Math.max(0, Math.cos((orient.tilt * Math.PI) / 180)) });
  };
  rooms.forEach((r, i) => {
    for (const f of r.faces) {
      const UA = f.U * f.area;
      if (f.to.k === 'out') Hout[i] += UA;
      else if (f.to.k === 'ground') Hg[i] += UA;
      else if (f.to.k === 'party') Hp[i] += UA;
      else if (f.to.k === 'loft') { if (base.loft) links.push([i, LOFT, UA]); else Hout[i] += UA; }
      else {
        // Both rooms list every face they share; take it from the lower-numbered one only.
        const j = idx.get(f.to.id);
        if (j !== undefined && j > i) links.push([i, j, UA]);
      }
      if (f.kind === 'window') solar.push({ node: i, area: f.area, g: f.gEff ?? g.g, orient: faceOrient(f) });
      else if (f.kind === 'ceiling' && f.to.k === 'out') roofSun(i, UA, faceOrient({ ...f, tilt: f.tilt ?? 0 }));
    }
    Hout[i] += 0.33 * r.n * r.V;
  });
  if (base.loft) {
    // Roof plus loft ventilation, recovered from the design calc's balance: H = Σ(links)·(Tin − T)/(T − Tout).
    const Hin = links.filter((l) => l[1] === LOFT).reduce((t, l) => t + l[2] * (rooms[l[0]].T - base.loft!.T), 0);
    Hout[LOFT] = Math.max(1, Hin / Math.max(0.05, base.loft.T - base.Tout));
    for (const s of base.loft.slopes) roofSun(LOFT, base.loft.U * s.area, faceOrient(s));
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
    for (const s of sky) gain[s.node] -= s.UA * 3.6 * c * s.f;

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
      const set = (sched[i][hr] || id === 'snap' ? r.room.setpoint : g.setback) + dt;
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

  let peakW = 0, heatKWh = 0, boughtKWh = 0;
  const monthHeat = Array(12).fill(0) as number[], monthBought = Array(12).fill(0) as number[];
  for (let k = 0; k < hours; k++) {
    heat[k] *= hf;
    peakW = Math.max(peakW, heat[k]);
    heatKWh += heat[k] / 1000;
    const m = MONTH_OF_DAY[(wx.doy(k) - 1) % 365];
    monthHeat[m] += heat[k] / 1000;
    if (heat[k] > 0) { const b = heat[k] / 1000 / sourceEff(h, flowAt(out[k]), out[k], base.Tg, m); boughtKWh += b; monthBought[m] += b; }
  }
  const comfort = rooms.map((r, i) => {
    let cold = 0, late = 0, warm = 0, min = Infinity, max = -Infinity, below16: number | null = null;
    // Hours since the heating last came on (a schedule on at midnight carries on from the evening before).
    let since = sched[i][23] ? WARMUP_H : -1;
    for (let k = 0; k < hours; k++) {
      const t = Th[i][k], on = !!sched[i][k % 24];
      since = on ? (since >= 0 ? since + 1 : 0) : -1;
      min = Math.min(min, t); max = Math.max(max, t);
      if (r.room.heated && heatingOn && on && t < r.room.setpoint - 1) { cold++; if (since >= WARMUP_H) late++; }
      if (t > (BED.includes(r.room.type) ? 26 : 25)) warm++;
      if (below16 === null && t < 16) below16 = k;
    }
    return { id: r.room.id, cold, late, warm, min, max, below16 };
  });
  return {
    id, hours, rooms: rooms.map((r) => ({ id: r.room.id, name: r.room.name, heated: r.room.heated, setpoint: r.room.setpoint })),
    out, heat, T: Th, P: Ph, loftT, peakW, heatKWh, boughtKWh, monthHeat, monthBought, comfort,
  };
}

/**
 * The design calc with its annual figures (space heat, months, energy bought, cost, carbon) taken from a typical-year run.
 * Without a run yet, the degree-day figures scaled by k (the last run's ratio for this scenario), marked as an estimate.
 */
export function yearRes(h: House, res: HouseResult, sim: SimResult | null, k = 1): HouseResult {
  const tf = tariff(h.hp);
  const months = res.months.map((m, i) => {
    const heat = sim ? sim.monthHeat[i] : m.heat * k, bought = sim ? sim.monthBought[i] : m.bought * k;
    return { ...m, heat, bought, eff: sim && bought > 0 ? heat / bought : m.eff };
  });
  const annualKWh = sim ? sim.heatKWh : res.annualKWh * k, kwh = sim ? sim.boughtKWh : res.hp.kwh * k;
  return {
    ...res, annualKWh, months, annualFrom: sim ? 'year' : 'estimate',
    hp: { ...res.hp, kwh, seasonal: kwh > 0 ? annualKWh / kwh : res.hp.seasonal, cost: (kwh * tf.p) / 100 + tf.standing, co2: kwh * tf.co2 },
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

/** A one-line answer to a test case's question. cost is the run's running cost, £ (year case only). */
export function verdict(h: House, r: SimResult, cost = 0): { ok: boolean; text: string } {
  const named = (ids: string[]) => ids.map((id) => r.rooms.find((x) => x.id === id)!.name).join(', ');
  const short = r.comfort.filter((c) => c.late > 0).map((c) => c.id);
  if (r.id === 'design') {
    const flat = r.peakW >= h.hp.capacity * 1000 - 1;
    if (short.length) return { ok: false, text: `No: ${named(short)} ${short.length > 1 ? 'stay' : 'stays'} more than 1 K below the setpoint beyond a ${WARMUP_H}-hour warm-up${flat ? ', with the heat source flat out' : ''}.` };
    return { ok: true, text: `Yes: every heated room is within 1 K of its setpoint after a ${WARMUP_H}-hour warm-up, peaking at ${(r.peakW / 1000).toFixed(1)} of ${h.hp.capacity} kW.` };
  }
  if (r.id === 'year') {
    const text = `About £${Math.round(cost).toLocaleString('en-GB')} for ${Math.round(r.heatKWh).toLocaleString('en-GB')} kWh of space heating.`;
    // A few cold hours on the coldest mornings are normal; a room short for over a day's worth across the year isn't.
    const cold = r.comfort.filter((c) => c.late > 24).map((c) => c.id);
    return cold.length ? { ok: false, text: `${text} ${named(cold)} ${cold.length > 1 ? 'are' : 'is'} more than 1 K below the setpoint for over 24 hours of the year after warming up.` } : { ok: true, text };
  }
  if (r.id === 'summer') {
    // shortcut: a fixed 3 hours over 25 °C (26 °C in bedrooms) on the peak day; CIBSE TM59 judges over a whole summer.
    const hot = r.comfort.filter((c) => c.warm > 3), worst = r.comfort.reduce((a, c) => (c.max > a.max ? c : a));
    if (!hot.length) return { ok: true, text: `No: no room is over 25 °C (26 °C in bedrooms) for more than 3 hours; the warmest, ${named([worst.id])}, peaks at ${worst.max.toFixed(1)} °C.` };
    return { ok: false, text: `Yes: ${named(hot.map((c) => c.id))} ${hot.length > 1 ? 'are' : 'is'} over 25 °C (26 °C in bedrooms) for more than 3 hours; ${named([worst.id])} reaches ${worst.max.toFixed(1)} °C.` };
  }
  const heated = r.comfort.filter((c) => r.rooms.find((x) => x.id === c.id)!.heated);
  const first = heated.filter((c) => c.below16 != null).sort((a, b) => a.below16! - b.below16!)[0];
  if (!first) return { ok: true, text: `All ${r.hours / 24} days: every heated room stays above 16 °C.` };
  const when = first.below16 === 0 ? 'within the first hour' : `after ${first.below16} hour${first.below16 === 1 ? '' : 's'}`;
  return { ok: first.below16! >= 24, text: `${first.below16! >= 24 ? 'Over a day' : 'Less than a day'}: ${named([first.id])} is first to drop below 16 °C, ${when}.` };
}

/** One room's answer to a test case's question, on the same limits as verdict(). */
export function roomAnswer(r: SimResult, id: string): { ok: boolean; text: string } | null {
  const i = r.rooms.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const room = r.rooms[i], c = r.comfort[i], f1 = (t: number) => t.toFixed(1);
  if (r.id === 'summer') return c.warm > 3 ? { ok: false, text: `Over the limit for ${c.warm} hours, peaking at ${f1(c.max)} °C.` } : { ok: true, text: `Peaks at ${f1(c.max)} °C.` };
  if (!room.heated) return { ok: true, text: `Unheated: between ${f1(c.min)} and ${f1(c.max)} °C.` };
  if (r.id === 'snap') {
    if (c.below16 == null) return { ok: true, text: `Stays above 16 °C for all ${r.hours / 24} days.` };
    return { ok: c.below16 >= 24, text: c.below16 === 0 ? 'Below 16 °C within the first hour.' : `Below 16 °C after ${c.below16} hour${c.below16 === 1 ? '' : 's'}.` };
  }
  let peak = 0, kwh = 0;
  for (let k = 0; k < r.hours; k++) { peak = Math.max(peak, r.P[i][k]); kwh += r.P[i][k] / 1000; }
  if (r.id === 'year') {
    const text = `${Math.round(kwh).toLocaleString('en-GB')} kWh a year`;
    return c.late > 24 ? { ok: false, text: `${text}; more than 1 K below ${room.setpoint} °C for ${c.late} hours after warming up.` } : { ok: true, text: `${text}.` };
  }
  return c.late > 0
    ? { ok: false, text: `More than 1 K below ${room.setpoint} °C for ${c.late} hour${c.late === 1 ? '' : 's'} after warming up; lowest ${f1(c.min)} °C.` }
    : { ok: true, text: `Holds ${room.setpoint} °C after warming up; peak ${Math.round(peak).toLocaleString('en-GB')} W.` };
}
