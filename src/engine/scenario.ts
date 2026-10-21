import {
  COLOURS, DOY, GLAZING, LOCATIONS, MASSES, MEAN, ORIENTS, SWING, WEATHER,
} from './data';
import type { Location, Orient, Weather } from './data';
import { simulate } from './simulate';
import { solarAt } from './solar';
import type { LayerInput, SimParams, SimResult } from './simulate';

export type HeatMode = 'fixed' | 'schedule' | 'free';

/** Everything the user can choose. */
export interface Scenario {
  layers: LayerInput[];
  loc: string;
  month: number;
  weather: string;
  orient: string;
  colour: string;
  heat: HeatMode;
  /** Fixed room temperature, °C. */
  tin: number;
  /** Schedule: temperatures and on/off hours. */
  comfort: number;
  setback: number;
  on1: number;
  off1: number;
  on2: number;
  off2: number;
  /** Free-floating room. */
  floor: number;
  elA: number;
  glA: number;
  rest: number;
  ach: number;
  gains: number;
  glaz: string;
  mass: string;
}

export const DEFAULT_SCENARIO: Scenario = {
  layers: [],
  loc: 'bir', month: 6, weather: 'typical', orient: 'W', colour: 'mid',
  heat: 'fixed', tin: 21, comfort: 21, setback: 16, on1: 6, off1: 9, on2: 17, off2: 22,
  floor: 16, elA: 12, glA: 2, rest: 20, ach: 3, gains: 150, glaz: 'std', mass: 'med',
};

export const ROOM_HEIGHT = 2.5;
const AIR_CP = 1.2 * 1005; // J/m³K
const VENT_FACTOR = 0.33; // W per (m³/h·K)
const GLAZING_U = 1.4; // W/m²K

export function inPeriod(h: number, on: number, off: number): boolean {
  if (on === off) return false;
  return on < off ? h >= on && h < off : h >= on || h < off;
}

export function heatingOn(sc: Scenario, h: number): boolean {
  return inPeriod(h, sc.on1, sc.off1) || inPeriod(h, sc.on2, sc.off2);
}

export interface ScenarioContext {
  loc: Location;
  weather: Weather;
  orient: Orient;
  params: SimParams;
}

export function buildParams(sc: Scenario): ScenarioContext {
  const loc = LOCATIONS.find((l) => l.id === sc.loc) ?? LOCATIONS[1];
  const weather = WEATHER.find((w) => w.id === sc.weather) ?? WEATHER[1];
  const orient = ORIENTS.find((o) => o.id === sc.orient) ?? ORIENTS[0];
  const colour = COLOURS.find((c) => c.id === sc.colour) ?? COLOURS[1];
  const params: SimParams = {
    layers: sc.layers,
    orient,
    lat: loc.lat,
    doy: DOY[sc.month],
    c: weather.c,
    alpha: colour.a,
    tmean: MEAN[sc.month] + loc.dT + weather.dM,
    swing: SWING[sc.month] * weather.sk,
    tinF: (h) => (sc.heat === 'schedule' ? (heatingOn(sc, h) ? sc.comfort : sc.setback) : sc.tin),
  };
  if (sc.heat === 'free') {
    const g = GLAZING.find((x) => x.id === sc.glaz) ?? GLAZING[1];
    const m = MASSES.find((x) => x.id === sc.mass) ?? MASSES[1];
    const V = sc.floor * ROOM_HEIGHT;
    params.free = {
      Ael: sc.elA,
      Arest: sc.rest,
      Ag: sc.glA,
      gSol: g.g,
      Qint: sc.gains,
      Uv: VENT_FACTOR * sc.ach * V + GLAZING_U * sc.glA,
      Cr: V * AIR_CP + sc.floor * m.c * 1000,
    };
  }
  return { loc, weather, orient, params };
}

/** Sun landing on the face over the day, kWh/m² (same 10-minute sampling as the simulation). */
export function daySolar(p: SimParams, orient: Orient): number {
  let s = 0;
  for (let f = 0; f < 144; f++) s += solarAt(p.lat, p.doy, f / 6, p.c, orient) / 6 / 1000;
  return s;
}

export interface ScenarioResult extends ScenarioContext {
  sim: SimResult;
}

/**
 * Run a scenario. The decrement factor and decrement delay are wall properties, so when the
 * room temperature moves (schedule or free-floating) they come from a second run with it held steady.
 */
export function runScenario(sc: Scenario): ScenarioResult {
  const ctx = buildParams(sc);
  const sim = simulate(ctx.params);
  if (sc.heat !== 'fixed') {
    const ref = simulate({ ...ctx.params, free: undefined, tinF: () => sc.tin });
    sim.decr = ref.decr;
    sim.lag = ref.lag;
  }
  return { ...ctx, sim };
}
