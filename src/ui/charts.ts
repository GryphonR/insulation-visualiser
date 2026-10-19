import { fmtTick, niceRange, pad2, sgn } from '../lib/util';
import type { ScenarioResult } from '../engine/scenario';
import { N_FRAMES, FRAMES_PER_HOUR } from '../engine/simulate';

export const CHART = { W: 560, H: 220, PL: 48, PR: 548, PT: 14, PB: 188 };
export const xOf = (h: number): number => CHART.PL + ((CHART.PR - CHART.PL) * h) / 24;

export interface Series {
  name: string;
  arr: ArrayLike<number>;
  col: string;
  sw: number;
  dash?: string;
  points: string;
}

export interface ChartSpec {
  title: string;
  sub: string;
  alt: string;
  note: string;
  series: Series[];
  area?: string;
  ticksY: Array<{ y: number; label: string; zero: boolean }>;
  ticksX: Array<{ x: number; label: string }>;
  yOf: (v: number) => number;
}

export interface SeriesIn {
  name: string;
  arr: ArrayLike<number>;
  col: string;
  sw: number;
  dash?: string;
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
  let mn = Infinity;
  let mx = -Infinity;
  spec.series.forEach((s) => {
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
  const nr = niceRange(mn, mx, 4);
  const yOf = (v: number) => CHART.PB - ((CHART.PB - CHART.PT) * (v - nr.lo)) / (nr.hi - nr.lo);
  const series: Series[] = spec.series.map((s) => ({
    ...s,
    points: Array.from({ length: N_FRAMES }, (_, f) => xOf(f / FRAMES_PER_HOUR).toFixed(1) + ',' + yOf(s.arr[f]).toFixed(1)).join(' '),
  }));
  const area = spec.area
    ? xOf(0).toFixed(1) + ',' + CHART.PB + ' ' + series[0].points + ' ' + xOf(24).toFixed(1) + ',' + CHART.PB
    : undefined;
  return {
    title: spec.title,
    sub: spec.sub,
    alt: spec.alt,
    note: spec.note,
    series,
    area,
    ticksY: nr.ticks.map((v) => ({ y: yOf(v), label: fmtTick(v, nr.step), zero: Math.abs(v) < 1e-9 && !!spec.zero })),
    ticksX: [0, 6, 12, 18, 24].map((h) => ({ x: xOf(h), label: pad2(h) })),
    yOf,
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
      sub: 'W/m². Above zero the wall is warming the room.',
      alt: 'Line chart comparing simulated heat flow into the room with a steady-state U-value estimate over 24 hours',
      zero: true,
      series: [
        { name: 'Simulated (with thermal mass)', arr: fr.q, col: '#0b63b5', sw: 3 },
        { name: 'Steady-state: U × (sol-air − room)', arr: sim.qss, col: '#6b7a86', sw: 2, dash: '6 4' },
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
