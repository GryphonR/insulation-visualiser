// Emitters, zones and flow temperature (boards 3, 3a, 1b). Types only from house.ts, so no import cycle.
import type { House, Room } from './house';
import type { Pt } from './geom';
import type { Pipe } from './house-pipes';
import type { Controls } from './house-controls';
import { loopLayout } from './house-ufh';
import type { Corner, LoopPattern, LoopRect } from './house-ufh';

export type RadType = 'K1' | 'P1' | 'K2' | 'K3';
/** Panel radiator output per metre length at 600 mm high, ΔT50, W/m (typical catalogue values). */
export const RAD_PER_M: Record<RadType, number> = { K1: 960, P1: 1330, K2: 1700, K3: 2400 };
export const RAD_LABEL: Record<RadType, string> = { K1: 'K1 single panel', P1: 'P+ single plus', K2: 'K2 double', K3: 'K3 triple' };
/** Floor covering thermal resistance, m²K/W (EN 1264 typical values). */
export const COVERS: Record<string, number> = { Tiles: 0.01, Vinyl: 0.025, 'Engineered wood 15 mm': 0.1, Carpet: 0.15 };
/** UFH heat transfer from mean water to room with 16 mm pipe in 65 mm screed and a thin covering, W/m²K, by spacing. */
const UFH_K: Record<number, number> = { 100: 6.7, 150: 6.0, 200: 5.3, 300: 4.3 };
export const UFH_SPACINGS = Object.keys(UFH_K).map(Number);
/** UFH pipe outside diameters, mm, and the usual longest single loop for each, m. */
export const UFH_PIPES: Record<number, number> = { 16: 100, 20: 120 };
export const loopMax = (e: Pick<Emitter, 'pipe'>) => UFH_PIPES[e.pipe ?? 16] ?? 100;
/** EN 1264 limit: floor surface no more than 29 °C (occupied areas). */
const qMaxFloor = (Troom: number) => 8.92 * Math.max(0, 29 - Troom) ** 1.1;

export interface Emitter {
  id: string; room: string; kind: 'radiator' | 'towel' | 'ufh' | 'fancoil'; zone: string;
  /** Radiator: panel type, length and height in mm. */
  type: RadType; len: number; height: number;
  /** Towel rail or fan coil: rated heat output at ΔT50, W. */
  rated: number;
  /** UFH loop: heated area m², pipe spacing mm, covering, tail length to the manifold m. */
  area: number; spacing: number; cover: string; tail: number;
  /** UFH pipe outside diameter, mm (16 when unset). */
  pipe?: number;
  /** UFH loop drawn on the plan: its rectangle (m), pattern and feed corner. The drawn area replaces `area`. */
  rect?: LoopRect; pattern?: LoopPattern; corner?: Corner;
  /** Where the emitter was placed on the plan (its centre, m) and the angle of a radiator along its wall, degrees (drawing only). */
  at?: Pt; ang?: number;
  /** The underfloor heating zone this loop comes from: its area is the room's part of the zone, kept up to date by `syncUfh`. */
  fromZone?: string;
}
export interface Zone {
  id: string; name: string; kind: 'rad' | 'ufh'; color: string; on: boolean;
  /** Hours on (1) per hour of day, or null to follow the occupancy schedule (living areas / bedrooms). */
  hours: number[] | null;
  /** UFH blending valve temperature, °C; 0 means connected direct to the system flow. */
  blend: number;
  /** UFH manifold position on the plan, m. With a storey it was placed on the heating layout: pipe runs go to it, and it feeds every loop in this zone. */
  manifold?: { x: number; y: number; storey?: number };
}
export interface Plant { at: Pt; storey: number }
/** Colours for heating zones on the plan, in the order zones are added. */
export const ZONE_COLOURS = ['#c2410c', '#1f6fb5', '#1f7a4d', '#7a45b8', '#b45309', '#be185d'];
export interface Heating {
  emitters: Emitter[]; zones: Zone[];
  control: 'fixed' | 'ideal' | 'curve';
  /** Manual curve: flow at the design temperature and at 15 °C outside. */
  curveDesign: number; curve15: number;
  /** Flow − return, K. */
  dT: number;
  /** Heat pump minimum flow rate, l/min. */
  minFlow: number;
  /** Where the boiler or heat pump and the hot water cylinder sit on the plan (m, on a storey), and the risers: points where pipes pass through every floor. */
  source?: Plant; cylinder?: Plant; risers?: Array<{ id: string; at: Pt }>;
  /** Most a run may lose per metre, Pa/m, even when the pump has head to spare (for balancing and quiet). 300 when unset. */
  paCap?: number;
  /** Pipe sizes not used on this project: left out of the size lists, the layouts and the sizing. Unset: every size. */
  pipeOff?: string[];
  /** Bore through each size's fittings, mm, where it differs from the typical figure. */
  fitBore?: Record<string, number>;
  /** Pipe runs from the heat pump (board 3), and the pump's available head at the design flow, kPa. */
  pipes?: Pipe[];
  pumpHead?: number;
  /** Valves on the runs and the modes that set them (board 3b, the system diagram). Unset: no valves, everything open. */
  controls?: Controls;
  /** Hot water cylinder coil reheat, W: what the coil takes while the cylinder heats. Unset: 0 (not counted). */
  coilW?: number;
  /** Cooling from a reversible heat pump. */
  cooling?: Cooling;
}

/** A reversible heat pump's cooling: on, output at A35/W18 (kW), EER there, room setpoint, chilled flow and its rise, °C / K. */
/** Cooling output (kW) and EER come only from the unit's datasheet: left out, the output is taken as unlimited (the emitters limit it) and cooling electricity isn't worked out. */
export interface Cooling { on: boolean; capacity?: number; eer?: number; setpoint: number; flow: number; dT: number }
export const COOLING_DEFAULT: Cooling = { on: true, setpoint: 25, flow: 18, dT: 3 };
/** A datasheet figure the user has entered: a positive finite number. */
export const given = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
/** Indoor humidity taken for the dew point in cooling. shortcut: a fixed 60% (UK summer indoors); use a humidity input if the planner gains one. */
export const COOL_RH = 0.6;
/** Dew point, °C, from air temperature and relative humidity (0–1), Magnus formula. */
export function dewPoint(T: number, rh = COOL_RH): number {
  const g = Math.log(Math.max(0.01, rh)) + (17.62 * T) / (243.12 + T);
  return (243.12 * g) / (17.62 - g);
}
/** Cooling is in use: a heat pump with cooling switched on. */
export const coolingOn = (h: Pick<House, 'hp' | 'heating'>) => (h.hp.source === 'ashp' || h.hp.source === 'gshp') && !!h.heating.cooling?.on;
/** EER at outside Te: rated at 35 °C, about 2.5% better per K cooler. shortcut: linear in Te, held to 0.5–1.6× rated; use datasheet points if cooling gains them. */
export const coolEer = (c: Cooling, Te: number) => (given(c.eer) ? c.eer : NaN) * Math.min(1.6, Math.max(0.5, 1 + 0.025 * (35 - Te)));
/** Emitters that can cool: underfloor loops and fan coils. Radiators and towel rails only sweat. */
export const canCool = (e: Pick<Emitter, 'kind'>) => e.kind === 'ufh' || e.kind === 'fancoil';
export const EMITTER_NAME: Record<Emitter['kind'], string> = { radiator: 'Radiator', towel: 'Towel rail', ufh: 'Underfloor loop', fancoil: 'Fan coil' };

/**
 * Heat an emitter takes out of a room in cooling, W, at chilled flow `flow` and room air `Troom`. A fan coil is linear in
 * mean water to air (rated/50 W/K; sensible only, the condensate drained). A UFH loop has a weaker surface coefficient in
 * cooling (0.6× heating) and its surface is held at 19 °C or 1 K over the dew point, whichever is higher (EN 1264-5).
 */
export function emitterCool(e: Emitter, flow: number, Troom: number, h: Pick<House, 'heating'>): number {
  const dT = h.heating.cooling?.dT ?? 3, mean = flow + dT / 2;
  if (e.kind === 'fancoil') return (e.rated / 50) * Math.max(0, Troom - mean);
  if (e.kind !== 'ufh') return 0;
  const k = 0.6 * (UFH_K[e.spacing] ?? 6.0), q = (Troom - mean) / (1 / k + (COVERS[e.cover] ?? 0.05));
  const qMax = 7 * Math.max(0, Troom - Math.max(19, dewPoint(Troom) + 1));
  return Math.max(0, Math.min(q, qMax)) * loopArea(e);
}
export const roomCool = (h: Pick<House, 'heating'>, room: string, flow: number, Troom: number) =>
  h.heating.emitters.filter((e) => e.room === room).reduce((t, e) => t + emitterCool(e, flow, Troom, h), 0);

export const radRated = (e: Pick<Emitter, 'type' | 'len' | 'height'>) => (RAD_PER_M[e.type] ?? 1700) * (e.len / 1000) * (e.height / 600) ** 0.9;
export const ratedOf = (e: Emitter) => (e.kind === 'radiator' ? radRated(e) : e.kind === 'towel' || e.kind === 'fancoil' ? e.rated : 0);
/** Loop length: from the drawn route and tails when the loop is on the plan, else area ÷ spacing plus tails. */
export const loopLength = (e: Emitter, h?: Pick<House, 'heating'>) => (h && loopLayout(h, e)?.total) || (e.area * 1000) / (e.spacing || 150) + 2 * e.tail;
/** Heated floor area of a loop: its drawn rectangle, or the area entered. */
export const loopArea = (e: Emitter) => (e.rect ? e.rect.w * e.rect.h : e.area);
export const lpm = (W: number, dT: number) => (W * 60) / (4186 * (dT || 5));

/** Heat from one emitter, W, given the system flow temperature and the room air temperature. */
export function emitterOut(e: Emitter, flow: number, Troom: number, h: Pick<House, 'heating'>): number {
  const dT = h.heating.dT;
  if (e.kind === 'ufh') {
    const z = h.heating.zones.find((x) => x.id === e.zone);
    const water = z && z.blend > 0 ? Math.min(flow, z.blend) : flow;
    const mean = water - dT / 2, k = UFH_K[e.spacing] ?? 6.0;
    const q = (mean - Troom) / (1 / k + (COVERS[e.cover] ?? 0.05));
    return Math.max(0, Math.min(q, qMaxFloor(Troom))) * loopArea(e);
  }
  const mean = flow - dT / 2;
  // A fan coil's forced convection is close to linear in the temperature difference.
  if (e.kind === 'fancoil') return e.rated * Math.max(0, (mean - Troom) / 50);
  return ratedOf(e) * Math.max(0, (mean - Troom) / 50) ** 1.3;
}

export const roomOut = (h: Pick<House, 'heating'>, room: string, flow: number, Troom: number) =>
  h.heating.emitters.filter((e) => e.room === room).reduce((t, e) => t + emitterOut(e, flow, Troom, h), 0);

/** Lowest flow temperature that delivers `need` W to the room at `Troom`, or Infinity if none up to 80 °C will. */
export function flowNeeded(h: Pick<House, 'heating'>, room: string, need: number, Troom: number): number {
  if (need <= 0) return 0;
  if (roomOut(h, room, 80, Troom) < need) return Infinity;
  let lo = Troom, hi = 80;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (roomOut(h, room, m, Troom) >= need) hi = m; else lo = m; }
  return hi;
}

export interface RoomNeed { room: Room; need: number }

/** System flow temperature at outside temperature Te for the chosen control. Needs are design-day losses. */
export function systemFlow(h: House, needs: RoomNeed[], Tdesign: number, Te: number): number {
  const max = h.hp.maxFlow, c = h.heating;
  const clamp = (f: number) => Math.min(max, Math.max(25, f));
  if (c.control === 'fixed') return max;
  if (c.control === 'curve') return clamp(c.curveDesign + ((c.curve15 - c.curveDesign) * (Te - Tdesign)) / (15 - Tdesign || 1));
  // Ideal weather compensation: the lowest flow that keeps every heated room at its setpoint, loads scaled by ΔT.
  let f = 25;
  for (const { room, need } of needs) {
    if (!room.heated || need <= 0 || !c.emitters.some((e) => e.room === room.id)) continue;
    const r = Math.max(0, (room.setpoint - Te) / (room.setpoint - Tdesign || 1));
    f = Math.max(f, flowNeeded(h, room.id, need * r, room.setpoint));
  }
  return clamp(f);
}

/** What sets a room's heating hours: no emitter (never heated), its zone switched off, the zone's own hours, or an occupancy row. */
export function scheduleSource(h: House, room: Room): { kind: 'none' | 'off' | 'zone' | 'living' | 'bedrooms'; zone?: House['heating']['zones'][number] } {
  const e = h.heating.emitters.find((x) => x.room === room.id);
  if (!e) return { kind: 'none' };
  const zone = h.heating.zones.find((x) => x.id === e.zone);
  if (zone && !zone.on) return { kind: 'off', zone };
  if (zone?.hours) return { kind: 'zone', zone };
  return { kind: room.type === 'bedroom' || room.type === 'bathroom' ? 'bedrooms' : 'living', zone };
}

/** Hours a room's heating is scheduled on: its zone's own hours, or the occupancy schedule for its type. */
export function roomSchedule(h: House, room: Room): number[] | null {
  const s = scheduleSource(h, room);
  return s.kind === 'none' ? null : s.kind === 'off' ? Array(24).fill(0) : s.kind === 'zone' ? s.zone!.hours! : h.gains[s.kind];
}

/** One K2 radiator per heated room, the shortest 600-high length (in 200 mm steps) that meets the need at the max flow. */
export function autoEmitters(h: House, needs: RoomNeed[]): Emitter[] {
  return needs.filter((n) => n.room.heated && n.need > 0).map(({ room, need }, i) => {
    const per = radRated({ type: 'K2', len: 1000, height: 600 }) * Math.max(0.01, (h.hp.maxFlow - h.heating.dT / 2 - room.setpoint) / 50) ** 1.3;
    const len = Math.min(3000, Math.max(400, Math.ceil((need / per) * 5) * 200));
    return { id: `e${i + 1}`, room: room.id, kind: 'radiator', zone: '', type: 'K2', len, height: 600, rated: 0, area: 0, spacing: 150, cover: 'Tiles', tail: 5 };
  });
}
