import {
  COLOURS, DOY, GLAZING, LOCATIONS, MASSES, MEAN, ORIENTS, SWING, WEATHER,
} from './data';
import type { Location, Orient, Weather } from './data';
import { simulate } from './simulate';
import { solarAt } from './solar';
import { bearingLabel } from './geom';
import { groundFloorU, layersR, suspendedFloorU } from './house';
import type { Buildup } from './house';
import type { LayerInput, SimParams, SimResult } from './simulate';

export type HeatMode = 'fixed' | 'schedule' | 'free';

/** Everything the user can choose. */
export interface Scenario {
  layers: LayerInput[];
  /** A city from LOCATIONS, or 'house' for the project's own site (then `site` holds it). */
  loc: string;
  site?: Location;
  month: number;
  weather: string;
  orient: string;
  /** Roofs: pitch in degrees (0 = flat). */
  pitch?: number;
  /** Floors: what lies under them (unset: the ground). Ceilings always have a room above. */
  under?: 'ground' | 'void' | 'room';
  /** Floors over a room and ceilings: that room's temperature, °C (unset: 18). */
  otherT?: number;
  /** Ground floors: the floor's U-value as the house works it out (BS EN ISO 13370, its size and edge); unset, a typical house. */
  floorU?: number;
  /** True bearing the face (or a pitched roof's slope) looks out on, degrees from north; unset, the orientation's own. */
  az?: number;
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
const UK_MEAN = MEAN.reduce((a, b) => a + b, 0) / 12;
/** What a floor or ceiling has on its far side, as the readouts and charts call it. */
export const OTHER_LABEL: Record<NonNullable<SimParams['other']>['what'], string> = { ground: 'Ground below', void: 'Void below', above: 'Room above', below: 'Room below' };
/** BS EN ISO 13370 characteristic floor dimension B′ for a typical house (floor area ÷ half its exposed perimeter), m. */
const TYPICAL_B = 5;

/**
 * What the far side of a floor or ceiling sees. A room above or below: held at its own temperature, through its own
 * surface film (BS EN ISO 6946: 0.10 for heat rising through a ceiling, 0.17 falling through a floor). The ground under a
 * slab (or the void of a suspended floor): steady for the month, through a resistance that gives the BS EN ISO 13370 U-value.
 */
function otherSide(sc: Scenario, loc: Location, tmean: number, ceiling: boolean): NonNullable<SimParams['other']> {
  // shortcut: heat is taken to flow from this room to the other one (up through a ceiling, down through a floor), whichever is warmer.
  if (ceiling) return { T: sc.otherT ?? 18, R: 0.1, Rsi: 0.1, what: 'above' };
  if (sc.under === 'room') return { T: sc.otherT ?? 18, R: 0.17, Rsi: 0.17, what: 'below' };
  const b = { id: '', name: '', kind: 'floor', layers: sc.layers.map((l) => [l.mat, l.t]) } as unknown as Buildup, susp = sc.under === 'void';
  // Typical suspended-floor void: 1500 mm² of airbrick per metre of wall, 0.3 m deep (as a new house starts).
  const U = sc.floorU ?? (susp ? suspendedFloorU(b, TYPICAL_B, 1500, 0.3) : groundFloorU(b, TYPICAL_B));
  // shortcut: ground under the slab at the region's mean ± 3 K, warmest in September (as the ground loop uses); a void halfway to the outdoor air.
  const ground = UK_MEAN + loc.dT + 3 * Math.cos((2 * Math.PI * (sc.month - 8)) / 12);
  return { T: susp ? (ground + tmean) / 2 : ground, R: Math.max(0.04, 1 / U - 0.17 - layersR(b)), Rsi: 0.17, what: susp ? 'void' : 'ground' };
}

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
  const loc = (sc.loc === 'house' ? sc.site : LOCATIONS.find((l) => l.id === sc.loc)) ?? LOCATIONS[1];
  const weather = WEATHER.find((w) => w.id === sc.weather) ?? WEATHER[1];
  const base = ORIENTS.find((o) => o.id === sc.orient) ?? ORIENTS[0];
  const pitch = Math.min(90, Math.max(0, sc.pitch ?? 0)), az = sc.az ?? base.az;
  const orient: Orient = base.id === 'roof'
    ? { ...base, tilt: pitch, az, name: pitch > 0 ? `Roof, ${Math.round(pitch)}° pitch facing ${bearingLabel(az)}` : 'Flat roof', label: pitch > 0 ? `${Math.round(pitch)}° roof` : 'Flat roof' }
    : sc.az != null ? { ...base, az, name: `Wall facing ${bearingLabel(az)}`, label: bearingLabel(az) } : base;
  const colour = COLOURS.find((c) => c.id === sc.colour) ?? COLOURS[1];
  const tmean = MEAN[sc.month] + loc.dT + weather.dM;
  const params: SimParams = {
    layers: sc.layers,
    orient,
    lat: loc.lat,
    doy: DOY[sc.month],
    c: weather.c,
    alpha: colour.a,
    tmean,
    swing: SWING[sc.month] * weather.sk,
    tinF: (h) => (sc.heat === 'schedule' ? (heatingOn(sc, h) ? sc.comfort : sc.setback) : sc.tin),
    ...(base.id === 'floor' || base.id === 'ceiling' ? { other: otherSide(sc, loc, tmean, base.id === 'ceiling') } : {}),
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
