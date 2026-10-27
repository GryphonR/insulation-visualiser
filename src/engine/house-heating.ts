// Emitters, zones and flow temperature (boards 3, 3a, 1b). Types only from house.ts, so no import cycle.
import type { House, Room } from './house';
import type { Pt } from './geom';
import type { Pipe } from './house-pipes';
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
/** EN 1264 limit: floor surface no more than 29 °C (occupied areas). */
const qMaxFloor = (Troom: number) => 8.92 * Math.max(0, 29 - Troom) ** 1.1;

export interface Emitter {
  id: string; room: string; kind: 'radiator' | 'towel' | 'ufh'; zone: string;
  /** Radiator: panel type, length and height in mm. */
  type: RadType; len: number; height: number;
  /** Towel rail: rated output at ΔT50, W. */
  rated: number;
  /** UFH loop: heated area m², pipe spacing mm, covering, tail length to the manifold m. */
  area: number; spacing: number; cover: string; tail: number;
  /** UFH loop drawn on the plan: its rectangle (m), pattern and feed corner. The drawn area replaces `area`. */
  rect?: LoopRect; pattern?: LoopPattern; corner?: Corner;
  /** Where the emitter was placed on the plan (its centre, m) and the angle of a radiator along its wall, degrees (drawing only). */
  at?: Pt; ang?: number;
}
export interface Zone {
  id: string; name: string; kind: 'rad' | 'ufh'; color: string; on: boolean;
  /** Hours on (1) per hour of day, or null to follow the occupancy schedule (living areas / bedrooms). */
  hours: number[] | null;
  /** UFH blending valve temperature, °C; 0 means connected direct to the system flow. */
  blend: number;
  /** UFH manifold position on the plan, m (on the storey of its loops). */
  manifold?: { x: number; y: number };
}
export interface Heating {
  emitters: Emitter[]; zones: Zone[];
  control: 'fixed' | 'ideal' | 'curve';
  /** Manual curve: flow at the design temperature and at 15 °C outside. */
  curveDesign: number; curve15: number;
  /** Flow − return, K. */
  dT: number;
  /** Heat pump minimum flow rate, l/min. */
  minFlow: number;
  /** Pipe runs from the heat pump (board 3), and the pump's available head at the design flow, kPa. */
  pipes?: Pipe[];
  pumpHead?: number;
}

export const radRated = (e: Pick<Emitter, 'type' | 'len' | 'height'>) => (RAD_PER_M[e.type] ?? 1700) * (e.len / 1000) * (e.height / 600) ** 0.9;
export const ratedOf = (e: Emitter) => (e.kind === 'radiator' ? radRated(e) : e.kind === 'towel' ? e.rated : 0);
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

/** Hours a room's heating is scheduled on: its zone's own hours, or the occupancy schedule for its type. */
export function roomSchedule(h: House, room: Room): number[] | null {
  const e = h.heating.emitters.find((x) => x.room === room.id);
  if (!e) return null;
  const z = h.heating.zones.find((x) => x.id === e.zone);
  if (z && !z.on) return Array(24).fill(0);
  if (z?.hours) return z.hours;
  return room.type === 'bedroom' || room.type === 'bathroom' ? h.gains.bedrooms : h.gains.living;
}

/** One K2 radiator per heated room, the shortest 600-high length (in 200 mm steps) that meets the need at the max flow. */
export function autoEmitters(h: House, needs: RoomNeed[]): Emitter[] {
  return needs.filter((n) => n.room.heated && n.need > 0).map(({ room, need }, i) => {
    const per = radRated({ type: 'K2', len: 1000, height: 600 }) * Math.max(0.01, (h.hp.maxFlow - h.heating.dT / 2 - room.setpoint) / 50) ** 1.3;
    const len = Math.min(3000, Math.max(400, Math.ceil((need / per) * 5) * 200));
    return { id: `e${i + 1}`, room: room.id, kind: 'radiator', zone: '', type: 'K2', len, height: 600, rated: 0, area: 0, spacing: 150, cover: 'Tiles', tail: 5 };
  });
}
