import { fmtTick, niceRange, pad2, sgn } from '../lib/util';
import type { ScenarioResult } from '../engine/scenario';
import { N_FRAMES, FRAMES_PER_HOUR } from '../engine/simulate';

export const CHART = { W: 600, H: 220, PL: 48, PR: 548, PT: 14, PB: 188 };
export const xOf = (h: number): number => CHART.PL + ((CHART.PR - CHART.PL) * h) / 24;

export interface Series {
  name: string;
  arr: ArrayLike<number>;
  col: string;
  sw: number;
  dash?: string;
  points: string;
  yOf: (v: number) => number;
}

export interface ChartSpec {
  title: string;
  sub: string;
  alt: string;
  note: string;
  series: Series[];
  area?: string;
  ticksY: Array<{ y: number; label: string; zero: boolean }>;
  /** Labels for a second, right-hand axis (series with `axis: 'right'`); shares its gridlines with the left. */
  ticksYR?: Array<{ y: number; label: string }>;
  ticksX: Array<{ x: number; label: string }>;
}

export interface SeriesIn {
  name: string;
  arr: ArrayLike<number>;
  col: string;
  sw: number;
  dash?: string;
  /** Plot against the right-hand axis instead of the left. */
  axis?: 'right';
}

export interface ChartInput {
  title: string;
  sub: string;
  alt: string;
  note: string;
  series: SeriesIn[];
  zero?: boolean;
  area?: boolean;
}

/** Builds a 24h line/area chart spec from one or more named series, each already sampled at every frame. */
export function buildChart(spec: ChartInput): ChartSpec {
  const extent = (list: SeriesIn[]): [number, number] => {
    let mn = Infinity;
    let mx = -Infinity;
    list.forEach((s) => {
      for (let f = 0; f < N_FRAMES; f++) {
        if (s.arr[f] < mn) mn = s.arr[f];
        if (s.arr[f] > mx) mx = s.arr[f];
      }
    });
    if (spec.zero) {
      mn = Math.min(mn, 0);
      mx = Math.max(mx, 0);
    }
    if (spec.area) mn = 0;
    return [mn, mx];
  };
  const mapY = (lo: number, hi: number) => (v: number) => CHART.PB - ((CHART.PB - CHART.PT) * (v - lo)) / (hi - lo);

  const leftIn = spec.series.filter((s) => s.axis !== 'right');
  const rightIn = spec.series.filter((s) => s.axis === 'right');
  const [lmn, lmx] = extent(leftIn);
  const nr = niceRange(lmn, lmx, 4);
  let lo = nr.lo;
  let hi = nr.hi;
  let step = nr.step;
  let rAxis: { lo: number; hi: number; step: number; ticks: number[] } | undefined;

  if (rightIn.length) {
    // Both axes get the same number of divisions either side of zero, so gridlines and zero line up.
    const [rmn, rmx] = extent(rightIn);
    const nrR = niceRange(rmn, rmx, 4);
    const kb = Math.round(Math.max(-nr.lo / nr.step, -nrR.lo / nrR.step));
    const ka = Math.max(1, Math.round(Math.max(nr.hi / nr.step, nrR.hi / nrR.step)));
    const fit = (mn: number, mx: number) => {
      const st = niceRange(0, Math.max(kb ? -mn / kb : 0, mx / ka), 1).hi;
      return { lo: -kb * st, hi: ka * st, step: st, ticks: Array.from({ length: kb + ka + 1 }, (_, i) => +((i - kb) * st).toFixed(8)) };
    };
    const l = fit(lmn, lmx);
    ({ lo, hi, step } = l);
    rAxis = fit(rmn, rmx);
  }

  const yL = mapY(lo, hi);
  const yR = rAxis ? mapY(rAxis.lo, rAxis.hi) : yL;
  const series: Series[] = spec.series.map((s) => {
    const yOf = s.axis === 'right' ? yR : yL;
    return {
      ...s,
      yOf,
      points: Array.from({ length: N_FRAMES }, (_, f) => xOf(f / FRAMES_PER_HOUR).toFixed(1) + ',' + yOf(s.arr[f]).toFixed(1)).join(' '),
    };
  });
  const area = spec.area
    ? xOf(0).toFixed(1) + ',' + CHART.PB + ' ' + series[0].points + ' ' + xOf(24).toFixed(1) + ',' + CHART.PB
    : undefined;
  const leftTicks = rAxis ? Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => +(lo + i * step).toFixed(8)) : nr.ticks;
  return {
    title: spec.title,
    sub: spec.sub,
    alt: spec.alt,
    note: spec.note,
    series,
    area,
    ticksY: leftTicks.map((v) => ({ y: yL(v), label: fmtTick(v, step), zero: Math.abs(v) < 1e-9 && !!spec.zero })),
    ticksYR: rAxis?.ticks.map((v) => ({ y: yR(v), label: fmtTick(v, rAxis!.step) })),
    ticksX: [0, 6, 12, 18, 24].map((h) => ({ x: xOf(h), label: pad2(h) })),
  };
}

const rangeOf = (a: ArrayLike<number>, n = 144): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, a[i]);
    hi = Math.max(hi, a[i]);
  }
  return [lo, hi];
};

export function buildCharts(res: ScenarioResult): ChartSpec[] {
  const { sim, orient } = res;
  const fr = sim.fr;
  const [saLo, saHi] = rangeOf(fr.tsa);
  const cut = Math.max(sim.qsmax - sim.qsmin, 1e-6);
  const cutPct = Math.round((1 - (sim.qmax - sim.qmin) / cut) * 100);
  return [
    buildChart({
      title: 'Temperatures',
      sub: 'Outside drivers against what the wall faces see',
      alt: 'Line chart of air, sol-air, outer face, inner face and room temperature over 24 hours',
      series: [
        { name: 'Air', arr: fr.tair, col: '#6b7a86', sw: 2, dash: '6 4' },
        { name: 'Sol-air (air + sun)', arr: fr.tsa, col: '#c75b00', sw: 2.5 },
        { name: 'Outer face', arr: fr.tsOut, col: '#a23b72', sw: 2 },
        { name: 'Inner face', arr: fr.tsIn, col: '#0b63b5', sw: 3 },
        { name: 'Room air', arr: fr.tin, col: '#2d7a4d', sw: 2, dash: '2 4' },
      ],
      note: `Inner face swings ${sim.timin.toFixed(1)} to ${sim.timax.toFixed(1)} °C while the sol-air temperature outside swings ${saLo.toFixed(1)} to ${saHi.toFixed(1)} °C.`,
    }),
    buildChart({
      title: 'Heat flow into the room',
      sub: 'W/m². Above zero the heat is moving towards the room. Left axis: outer face. Right axis: inner face.',
      alt: 'Line chart comparing heat flow at the outer face, simulated heat flow into the room, and a steady-state U-value estimate over 24 hours',
      zero: true,
      series: [
        { name: 'Outer face (left axis)', arr: fr.qOut, col: '#a23b72', sw: 2 },
        { name: 'Inner face, simulated (right axis)', arr: fr.q, col: '#0b63b5', sw: 3, axis: 'right' },
        { name: 'Steady-state: U × (sol-air − room) (right axis)', arr: sim.qss, col: '#6b7a86', sw: 2, dash: '6 4', axis: 'right' },
      ],
      note: `Steady-state calculation: ${sgn(sim.qsmin, 1)} to ${sgn(sim.qsmax, 1)} W/m². Simulated: ${sgn(sim.qmin, 1)} to ${sgn(sim.qmax, 1)} W/m². ${res.params.free ? 'In a free-floating room the room temperature moves too, so this is not a like-for-like comparison; the wall alone delays heat by about ' + sim.lag.toFixed(1) + ' h.' : cutPct >= 0 ? `The swing is cut by ${cutPct}% and arrives about ${sim.lag.toFixed(1)} h later.` : `The swing is ${-cutPct}% larger and arrives about ${sim.lag.toFixed(1)} h later.`}`,
    }),
    buildChart({
      title: 'Sunshine on this face',
      sub: `W/m² striking the surface, ${sim.solar.toFixed(1)} kWh/m² over the day`,
      alt: 'Area chart of solar irradiance on the selected face over 24 hours',
      area: true,
      series: [{ name: 'Irradiance', arr: fr.I, col: '#b97a00', sw: 2.5 }],
      note:
        orient.id === 'roof'
          ? 'A flat roof sees the sun all day, and also loses heat to a clear night sky.'
          : 'This face sees direct sun for part of the day only; the rest is diffuse sky light.',
    }),
  ];
}
