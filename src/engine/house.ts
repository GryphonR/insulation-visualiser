// Whole-house design-day heat loss: rooms are rectangles on storeys, every face is derived from how they touch.
// Plan and rules: docs/whole-house-plan.md.
import { MAT, MEAN } from './data';
import { layerR } from './swap';
import { compass, edges, overlapArea3, overlapAreaPoly, polyArea, selfIntersects, sharedSpan } from './geom';
import type { Edge, Pt } from './geom';
import { MCS_HDD, MCS_MEAN_TEMPS, MCS_STATIONS, ROOM_TEMPS, climateFromPostcode, designTemp, postcodeArea } from './climate-mcs';

/** The MCS station and region for a house: from its postcode unless set by hand, with a location for sun and weather. */
export function climateOf(h: House): { station: number; region: number; lat: number; lon: number; fromPostcode: boolean; km: number } {
  const found = h.climate.auto !== false ? climateFromPostcode(h.climate.postcode) : null;
  if (found) return { station: found.station, region: found.region, lat: found.latlon[0], lon: found.latlon[1], fromPostcode: true, km: found.km };
  const s = MCS_STATIONS[h.climate.station] ?? MCS_STATIONS[0];
  return { station: h.climate.station, region: h.climate.region, lat: s[2], lon: s[3], fromPostcode: false, km: 0 };
}
import { flowNeeded, loopLength, roomOut, systemFlow } from './house-heating';
import type { Heating } from './house-heating';
import type { Bills } from './house-calibrate';

export type Side = 'N' | 'E' | 'S' | 'W';
export const SIDES: Side[] = ['N', 'E', 'S', 'W'];
export type BuildupKind = 'wall' | 'floor' | 'roof' | 'glazing' | 'door';
export interface Buildup {
  id: string; name: string; kind: BuildupKind; layers: Array<[string, number]>; u?: number;
  /** Ground floors only: slab on ground (default) or suspended timber over a ventilated void. */
  floorType?: 'solid' | 'suspended';
  /** Glazing only: total solar transmittance of the glass, and the share of the opening that is frame. */
  g?: number; frame?: number;
}

/** Board 2c glazing library: typical U and g by type (SAP 10.2 Table 6b/6c style values). */
export const GLAZING_LIBRARY: Array<Pick<Buildup, 'name' | 'u' | 'g' | 'frame'>> = [
  { name: 'Single glazed, timber frame', u: 4.8, g: 0.85, frame: 0.3 },
  { name: 'Double glazed, before 2002', u: 2.8, g: 0.76, frame: 0.3 },
  { name: 'Double glazed, 2002–2021', u: 2.0, g: 0.72, frame: 0.3 },
  { name: 'Double glazed, low-e argon', u: 1.4, g: 0.63, frame: 0.3 },
  { name: 'Triple glazed', u: 0.9, g: 0.5, frame: 0.3 },
  { name: 'Secondary glazing over single', u: 2.4, g: 0.76, frame: 0.3 },
  { name: 'Rooflight, double glazed', u: 1.6, g: 0.6, frame: 0.2 },
];
/** Shading on a window: overhangs, neighbouring buildings and trees, net curtains. Multiplies its solar gain. */
export const SHADING: Record<string, [string, number]> = {
  none: ['Unshaded', 1], light: ['Light (nets, sparse trees)', 0.8], overhang: ['Overhang or reveal', 0.7], heavy: ['Heavy (buildings, dense trees)', 0.5],
};
export interface Storey {
  name: string; h: number; zone: number;
  /** Depth below ground, m (lowest storey only): its outside walls are in the ground and its floor is a basement floor. */
  below?: number;
}
export type SlopeSide = 'full' | 'plate' | 'knee';
export interface Dormer { w: number; front: number; window: number }
/** One wall of a polygon room under the roof: how it meets the ceiling, its eaves, and an optional dormer. */
export interface EdgeSlope { side: SlopeSide; eaves: 'cold' | 'warm'; dormer: Dormer | null }
/** Sloping ceilings under the roof (board 1c). Sides are [west, east] for axis 'ew', [north, south] for 'ns'.
 *  A polygon room uses `edges` instead: one entry per wall, in outline order. */
export interface RoomShape {
  edges?: EdgeSlope[];
  axis: 'ew' | 'ns';
  /** full = full-height wall; plate = coombed (wall to the wall plate, then slope); knee = knee wall with an eaves void behind. */
  sides: [SlopeSide, SlopeSide];
  pitch: number; knee: number; ceiling: number;
  /** Roof over the eaves void: cold (tiles only) or warm (insulated like the slope). */
  eaves: ['cold' | 'warm', 'cold' | 'warm'];
  dormers: [Dormer | null, Dormer | null];
  /** Rooflight area in the first slope, m². */
  rooflight: number;
}
export type RoomType = 'living' | 'dining' | 'kitchen' | 'bedroom' | 'bathroom' | 'wc' | 'hall' | 'landing' | 'utility' | 'study' | 'store' | 'other'
  | 'garage' | 'conservatory' | 'porch' | 'cellar';
export interface Room {
  id: string; name: string; type: RoomType;
  /** Lowest storey and how many storeys it rises through (2 for a hall with the stair void). */
  storey: number; span: number;
  /** Plan rectangle in metres, x east, y south (north is the top of the plan). */
  x: number; y: number; w: number; d: number;
  heated: boolean; setpoint: number;
  /** Air changes per hour, unheated rooms only. */
  ach: number;
  /** Sloping ceilings, rooms on the top storey only. */
  shape?: RoomShape;
  /** Outline of a room of any shape, corners in metres; x, y, w, d then hold its bounding box. */
  poly?: Pt[];
}
export interface Opening {
  id: string; room: string; side: Side; name: string; w: number; h: number; buildup: string; shade?: keyof typeof SHADING;
  /** Wall index on a polygon room (its edges in order); otherwise the first wall facing `side`. */
  edge?: number;
  /** An inside door: the room it leads to. Such a door sits on a wall shared with that room and is not part of the outside wall. */
  to?: string;
  /** Where the opening's centre sits along its wall, metres from the wall's first corner (drawing only); evenly spread if unset. */
  t?: number;
}
/**
 * A patch of a floor or ceiling with its own build-up: an insulated strip, a different slab. Band n is the floor of storey n and the
 * ceiling of storey n - 1; the top band is the ceiling or roof over the top storey.
 */
export interface FloorZone { id: string; band: number; name: string; poly: Pt[]; buildup: string }
export interface Device { id: string; room: string; name: string; fan: boolean; opts: Array<[string, number]>; pick: number }
export interface Factor { id: string; label: string; dq: number; on: boolean }
export type Boundary = 'out' | 'party';
export type DefaultKey = 'extWall' | 'intWall' | 'groundFloor' | 'intFloor' | 'loftCeiling' | 'loftRoof' | 'flatRoof' | 'exposedFloor'
  | 'slope' | 'knee' | 'dormerWall' | 'dormerRoof';

export interface House {
  v: 1;
  name: string;
  storeys: Storey[];
  rooms: Room[];
  openings: Opening[];
  buildups: Buildup[];
  defaults: Record<DefaultKey, string>;
  /** Per-face build-up and boundary choices, keyed by Face.key. */
  faceBuildup: Record<string, string>;
  faceBoundary: Record<string, Boundary>;
  /** Drawn patches of floors and ceilings with a different build-up. */
  zones?: FloorZone[];
  neighbourT: number;
  loft: { present: boolean; ach: number; height: number; pitch: number };
  /** Suspended floors: airbrick opening area per metre of exposed wall (mm²/m) and void height (m). */
  suspended: { vent: number; voidH: number };
  climate: {
    station: number; pct: '99.6' | '99'; altitude: number; region: number; postcode: string;
    /** Pick the station and region from the postcode (MCS nearest-location rule); false to use the ones chosen by hand. */
    auto?: boolean;
    /** Weather for the year run: synthetic from monthly means, or the station's typical meteorological year (PVGIS). */
    weather?: 'synthetic' | 'tmy';
  };
  vent: {
    method: 'model' | 'cibse'; source: 'est' | 'meas'; q50: number; factors: Factor[]; devices: Device[];
    mech: 'none' | 'dmev' | 'mvhr'; mechFlow: number; eta: number; minAch: boolean;
  };
  hp: { capacity: number; maxFlow: number; elecP: number; gasP: number; gasSC: number; boilerEff: number };
  gains: Gains;
  heating: Heating;
  /** Applied bills calibration (board 4d): rooms warmer/cooler by dt, estimated q50 scaled by q, share of rooms heated hf. */
  calib?: { dt: number; q: number; hf: number; note: string };
  /** Monthly gas bills for the calibration check. */
  bills?: Bills;
  /** EPC age band group for default room temperatures (CIBSE DHDG 2026 Table 2-2): A–J (before 2007) or K onwards. */
  ageBand?: 'AJ' | 'K';
  /** The user's own default temperature for each room type, overriding the table. */
  roomTemps?: Partial<Record<RoomType, number>>;
  /** Tracing underlay for the plan: a floor-plan image per storey, or satellite imagery. */
  trace?: TraceSettings;
}

/** A floor-plan image placed under one storey's plan: top-left corner and width in plan metres. */
export interface TraceImage { src: string; x: number; y: number; w: number; opacity: number }
export interface TraceSettings {
  mode: 'none' | 'image' | 'sat';
  images: Record<number, TraceImage>;
  /** Satellite imagery: plan (0, 0) sits at this latitude and longitude. */
  sat: { lat: number; lon: number; zoom: number; opacity: number };
}

/** Default setpoint for a room type: the user's own figure, else MCS / CIBSE Table 2-2 for the house's age band. */
export const defaultTemp = (h: Pick<House, 'ageBand' | 'roomTemps'>, type: RoomType) =>
  h.roomTemps?.[type] ?? (ROOM_TEMPS[type] ?? ROOM_TEMPS.other)[h.ageBand === 'K' ? 1 : 0];

/** Occupancy, heating schedule and gains for the hour-by-hour runs (board 6a). */
export interface Gains {
  people: number;
  pattern: 'work' | 'home' | 'shift';
  /** Heating on (1) or set back (0) for each hour, living areas and bedrooms. */
  living: number[];
  bedrooms: number[];
  setback: number;
  /** Thermal mass of rooms and their contents, kJ/m²K of floor (SAP TMP style). */
  mass: number;
  /** Solar transmittance of glazing including frame and curtains. */
  g: number;
}

export type To = { k: 'out' } | { k: 'ground' } | { k: 'party' } | { k: 'room'; id: string } | { k: 'loft' };
export interface Face {
  key: string; label: string; kind: 'wall' | 'floor' | 'ceiling' | 'window' | 'door';
  side?: Side; to: To; area: number; buildup: Buildup; U: number;
  /** Compass bearing the face looks out on, degrees from north (walls and windows). */
  az?: number;
  /** Outside walls can be switched to a party wall. */
  canParty?: boolean;
  /** Windows: effective solar transmittance of the whole opening (glass g × glass share × shading), or undefined to use the house default. */
  gEff?: number;
  /** Edge length along the plan, outside walls only. */
  len?: number;
}

const EPS = 1e-6;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;
// Surface resistances Rsi + Rse by face type, m²K/W (BS EN ISO 6946).
const FILMS = { extWall: 0.17, intWall: 0.26, intFloor: 0.27, loftCeiling: 0.2, roof: 0.14, exposedFloor: 0.21 };
const HABITABLE: RoomType[] = ['living', 'dining', 'bedroom', 'study'];
/** Older CIBSE room-type air change rates (pre-2000 houses), ach. */
export const CIBSE_ACH: Record<RoomType, number> = {
  living: 1.5, dining: 1.5, kitchen: 2, bedroom: 1, bathroom: 3, wc: 2, hall: 2, landing: 2, utility: 2, study: 1.5, store: 1, other: 1.5,
  garage: 3, conservatory: 1.5, porch: 3, cellar: 0.5,
};
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const layersR = (b: Buildup) => b.layers.reduce((s, [m, t]) => (MAT[m] ? s + layerR(MAT[m], t) : s), 0);
export const buildupU = (b: Buildup, films = FILMS.extWall) => b.u ?? 1 / (films + layersR(b));

/** BS EN ISO 13370 slab on ground (λ 2.0 W/mK soil, 0.3 m wall); `z` > 0 for a basement floor that depth below ground. */
export function groundFloorU(b: Buildup, Bp: number, z = 0): number {
  if (b.u != null) return b.u;
  const lam = 2, dt = 0.3 + lam * (0.17 + layersR(b) + 0.04) + z / 2;
  return dt < Bp ? (2 * lam / (Math.PI * Bp + dt)) * Math.log(Math.PI * Bp / dt + 1) : lam / (0.457 * Bp + dt);
}

/** BS EN ISO 13370 suspended floor: deck in series with the ground under the void, the void walls and airbrick ventilation. */
export function suspendedFloorU(b: Buildup, Bp: number, vent: number, voidH: number): number {
  if (b.u != null) return b.u;
  const lam = 2, Uf = 1 / (0.17 + layersR(b) + 0.17), dg = 0.3 + lam * (0.17 + 0.04);
  const Ug = (2 * lam / (Math.PI * Bp + dg)) * Math.log(Math.PI * Bp / dg + 1);
  // Void walls U 1.5, wind 4 m/s, wind shielding 0.05; vent in mm² per m of perimeter.
  const Ux = (2 * voidH * 1.5) / Bp + (1450 * (vent / 1e6) * 4 * 0.05) / Bp;
  return 1 / (1 / Uf + 1 / (Ug + Ux));
}

/** BS EN ISO 13370 basement wall that depth z below ground. */
export function basementWallU(b: Buildup, z: number, floor: Buildup): number {
  if (b.u != null) return b.u;
  const lam = 2, dt = 0.3 + lam * (0.17 + layersR(floor) + 0.04), dw = lam * (0.13 + layersR(b) + 0.04);
  return ((2 * lam) / (Math.PI * z)) * (1 + (0.5 * dt) / (dt + z)) * Math.log(z / dw + 1);
}

/** Cross-section of a room with sloping ceilings. W runs across the slopes, L along the ridge. */
export function shapeGeo(r: Room, sh: RoomShape) {
  const ew = sh.axis === 'ew', W = ew ? r.w : r.d, L = ew ? r.d : r.w;
  const slopeSides: [Side, Side] = ew ? ['W', 'E'] : ['N', 'S'], gables: [Side, Side] = ew ? ['N', 'S'] : ['W', 'E'];
  const th = (Math.min(70, Math.max(10, sh.pitch)) * Math.PI) / 180, t = Math.tan(th), sn = Math.sin(th);
  const sloped = sh.sides.map((s) => s !== 'full'), n = sloped.filter(Boolean).length;
  const k = Math.max(0, sh.knee);
  const hcMax = n ? k + ((W - 0.4) * t) / n : sh.ceiling;
  const hc = n ? Math.max(k + 0.1, Math.min(sh.ceiling, hcMax)) : sh.ceiling;
  const run = sloped.map((s) => (s ? (hc - k) / t : 0));
  const fw = Math.max(0, W - run[0] - run[1]);
  const A = W * hc - sloped.reduce((a, s, i) => a + (s ? 0.5 * run[i] * (hc - k) : 0), 0);
  const dormers = sh.dormers.map((d, i) => {
    if (!d || !sloped[i]) return null;
    const hd = Math.max(k + 0.3, Math.min(d.front, hc)), xr = (hd - k) / t, dw = Math.max(0.5, Math.min(d.w, L - 0.2));
    return { hd, xr, dw, front: dw * (hd - k), cheeks: xr * (hd - k), roof: xr * dw, slopeCut: ((hd - k) / sn) * dw, vol: 0.5 * xr * (hd - k) * dw, window: Math.min(d.window, dw * (hd - k) * 0.9) };
  });
  const slopeArea = sloped.map((s, i) => (s ? ((hc - k) / sn) * L - (dormers[i]?.slopeCut ?? 0) : 0));
  const V = A * L + dormers.reduce((a, d) => a + (d?.vol ?? 0), 0);
  return { W, L, k, hc, hcMax, t, sn, run, fw, A, V, slopeSides, gables, sloped, dormers, slopeArea };
}

const FLAT_EDGE: EdgeSlope = { side: 'full', eaves: 'cold', dormer: null };
/** One wall setting per outline edge: pad new walls as full height, drop extra ones. */
export const fitEdges = (e: EdgeSlope[], n: number): EdgeSlope[] => Array.from({ length: n }, (_, i) => e[i] ?? { ...FLAT_EDGE });

type DormerGeo = { hd: number; xr: number; dw: number; front: number; cheeks: number; roof: number; slopeCut: number; vol: number; window: number };
function dormerGeo(d: Dormer | null, k: number, hc: number, t: number, sn: number, wallLen: number): DormerGeo | null {
  if (!d) return null;
  const hd = Math.max(k + 0.3, Math.min(d.front, hc)), xr = (hd - k) / t, dw = Math.max(0.5, Math.min(d.w, wallLen - 0.2));
  return { hd, xr, dw, front: dw * (hd - k), cheeks: xr * (hd - k), roof: xr * dw, slopeCut: ((hd - k) / sn) * dw, vol: 0.5 * xr * (hd - k) * dw, window: Math.min(d.window, dw * (hd - k) * 0.9) };
}

/** What a sloping-ceiling room means for its faces, the same for rectangles and polygons. */
export interface ShapeOut {
  k: number; hc: number; sn: number; V: number; flatA: number;
  /** Height of the wall on this edge in the shaped storey. */
  wallH: (e: { side: Side; idx: number }) => number;
  /** The slope a knee wall on this edge sits under, or −1 if the edge is not a knee wall. */
  kneeOf: (e: { side: Side; idx: number }) => number;
  slopes: Array<{ i: number; side: Side; area: number; dormer: DormerGeo | null; kind: SlopeSide; eaves: 'cold' | 'warm' }>;
}

/** A rectangle's two-sided shape as one setting per wall, in outline order N, E, S, W (for "Make any shape"). */
export function rectShapeToEdges(sh: RoomShape): EdgeSlope[] {
  const at = sh.axis === 'ew' ? [3, 1] : [0, 2];
  const out = Array.from({ length: 4 }, () => ({ ...FLAT_EDGE }));
  at.forEach((idx, i) => { out[idx] = { side: sh.sides[i], eaves: sh.eaves[i], dormer: sh.dormers[i] ? { ...sh.dormers[i]! } : null }; });
  return out;
}

/** Back to a rectangle: keep the slopes if they sit on one opposite pair of walls (N/S or E/W), else none. */
export function edgesToRectShape(sh: RoomShape): RoomShape | undefined {
  const e = fitEdges(sh.edges ?? [], 4);
  const ew = e[0].side === 'full' && e[2].side === 'full', ns = e[1].side === 'full' && e[3].side === 'full';
  const pair = ew ? [3, 1] : ns ? [0, 2] : null;
  if (!pair) return undefined;
  const { edges: _edges, ...rest } = sh;
  void _edges;
  return { ...rest, axis: ew ? 'ew' : 'ns', sides: [e[pair[0]].side, e[pair[1]].side], eaves: [e[pair[0]].eaves, e[pair[1]].eaves], dormers: [e[pair[0]].dormer, e[pair[1]].dormer] };
}

const shapeCache = new Map<string, ShapeOut>();
export function shapeOf(r: Room, sh: RoomShape): ShapeOut {
  if (!(r.poly && r.poly.length >= 3 && sh.edges)) {
    const g = shapeGeo(r, sh);
    return {
      k: g.k, hc: g.hc, sn: g.sn, V: g.V, flatA: g.fw * g.L,
      wallH: (e) => { const i = g.slopeSides.indexOf(e.side); return i >= 0 ? (sh.sides[i] === 'full' ? g.hc : g.k) : g.A / g.W; },
      kneeOf: (e) => { const i = g.slopeSides.indexOf(e.side); return i >= 0 && sh.sides[i] === 'knee' ? i : -1; },
      slopes: g.slopeSides.flatMap((side, i) => (g.sloped[i] ? [{ i, side, area: g.slopeArea[i], dormer: g.dormers[i], kind: sh.sides[i], eaves: sh.eaves[i] }] : [])),
    };
  }
  const key = JSON.stringify([r.poly, sh]);
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const out = polyShape(r.poly, sh);
  if (shapeCache.size > 200) shapeCache.clear();
  shapeCache.set(key, out);
  return out;
}

/**
 * Sloping ceiling over a room of any shape: from every sloped wall the ceiling rises at the roof pitch from the
 * knee (or wall plate) height, the lowest of those slopes wins at each point (hips form at corners), capped at the
 * flat ceiling. Areas, volume and gable heights come from sampling the room on a fine grid.
 */
function polyShape(poly: Pt[], sh: RoomShape): ShapeOut {
  const es = edges(poly), ed = fitEdges(sh.edges ?? [], es.length);
  const th = (Math.min(70, Math.max(10, sh.pitch)) * Math.PI) / 180, t = Math.tan(th), sn = Math.sin(th);
  const k = Math.max(0, sh.knee), hc = Math.max(k + 0.1, sh.ceiling);
  const sloped = ed.map((x) => x.side !== 'full');
  const segDist = (p: Pt, e: Edge) => {
    const vx = p[0] - e.a[0], vy = p[1] - e.a[1], u = Math.max(0, Math.min(e.len, vx * e.d[0] + vy * e.d[1]));
    return Math.hypot(vx - u * e.d[0], vy - u * e.d[1]);
  };
  const height = (p: Pt) => { let h = hc; es.forEach((e, i) => { if (sloped[i]) h = Math.min(h, k + t * segDist(p, e)); }); return h; };
  const inside = (p: Pt) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const A = polyArea(poly), step = Math.max(0.02, Math.min(0.1, Math.sqrt(A) / 160)), cell = step * step;
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  let V = 0, flat = 0;
  const slopeH = es.map(() => 0);
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      const p: Pt = [x, y];
      if (!inside(p)) continue;
      let h = hc, gov = -1;
      es.forEach((e, i) => { if (!sloped[i]) return; const z = k + t * segDist(p, e); if (z < h) { h = z; gov = i; } });
      V += h * cell;
      if (gov < 0) flat += cell; else slopeH[gov] += cell;
    }
  }
  // Mean height along each full-height wall (a gable end where slopes meet it).
  const edgeH = es.map((e, i) => {
    if (sloped[i]) return k;
    let s = 0;
    for (let j = 0; j < 40; j++) { const u = ((j + 0.5) / 40) * e.len; s += height([e.a[0] + e.d[0] * u - e.n[0] * 0.01, e.a[1] + e.d[1] * u - e.n[1] * 0.01]); }
    return s / 40;
  });
  // Sampling error: scale so the plan areas add up exactly.
  const sum = flat + slopeH.reduce((a, b) => a + b, 0), fix = sum > 0 ? A / sum : 1;
  const slopes = es.flatMap((e, i) => {
    if (!sloped[i]) return [];
    const dormer = dormerGeo(ed[i].dormer, k, hc, t, sn, e.len);
    return [{ i, side: compass(e.az), area: Math.max(0, (slopeH[i] * fix) / Math.cos(th) - (dormer?.slopeCut ?? 0)), dormer, kind: ed[i].side, eaves: ed[i].eaves }];
  });
  return {
    k, hc, sn, V: V * fix + slopes.reduce((a, x) => a + (x.dormer?.vol ?? 0), 0), flatA: flat * fix,
    wallH: (e) => edgeH[e.idx] ?? hc,
    kneeOf: (e) => (ed[e.idx]?.side === 'knee' ? e.idx : -1),
    slopes,
  };
}

/** [a, b] with the cut ranges removed. */
function subtract(a: number, b: number, cuts: Array<[number, number]>): Array<[number, number]> {
  let segs: Array<[number, number]> = [[a, b]];
  for (const [c, d] of cuts) {
    segs = segs.flatMap(([s, e]): Array<[number, number]> => (d <= s + EPS || c >= e - EPS ? [[s, e]] : [
      ...(c > s + EPS ? [[s, c] as [number, number]] : []), ...(d < e - EPS ? [[d, e] as [number, number]] : []),
    ]));
  }
  return segs;
}
const overlap1 = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));
/** Give a room an outline (or drop it with null), keeping x, y, w, d as its bounding box. */
export function setOutline(r: Room, poly: Pt[] | null): void {
  if (!poly || poly.length < 3) { delete r.poly; return; }
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  r.poly = poly.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)] as Pt);
  r.x = Math.min(...xs); r.y = Math.min(...ys); r.w = +(Math.max(...xs) - r.x).toFixed(3); r.d = +(Math.max(...ys) - r.y).toFixed(3);
  if (r.shape?.edges) r.shape.edges = fitEdges(r.shape.edges, r.poly.length);
}

/** A room's outline: its polygon if it has one, else its rectangle (corners clockwise on the plan). */
export const roomPoly = (r: Room): Pt[] => (r.poly && r.poly.length >= 3 ? r.poly : [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]]);
export const roomArea = (r: Room) => (r.poly && r.poly.length >= 3 ? polyArea(r.poly) : r.w * r.d);
const overlapArea = (r: Room, o: Room) => (r.poly || o.poly
  ? overlapAreaPoly(roomPoly(r), roomPoly(o))
  : overlap1(r.x, r.x + r.w, o.x, o.x + o.w) * overlap1(r.y, r.y + r.d, o.y, o.y + o.d));
/** A room's walls in plan: rectangles keep their N/E/S/W ids (and saved face choices); polygons number theirs e0, e1… */
export function roomEdges(r: Room): Array<Edge & { side: Side; id: string; idx: number }> {
  return edges(roomPoly(r)).map((e, i) => ({ ...e, side: compass(e.az), id: r.poly && r.poly.length >= 3 ? `e${i}` : compass(e.az), idx: i }));
}
export const onStorey = (r: Room, s: number) => r.storey <= s && s < r.storey + r.span;
const topStorey = (r: Room) => r.storey + r.span - 1;

export function roomHeight(h: House, r: Room): number {
  let t = 0;
  for (let s = r.storey; s <= topStorey(r); s++) t += (h.storeys[s]?.h ?? 0) + (s < topStorey(r) ? h.storeys[s]?.zone ?? 0 : 0);
  return t;
}

/** A room's shape applies only on the top storey of the house. */
export const roomShape = (h: House, r: Room) => (r.shape && topStorey(r) === h.storeys.length - 1 && (!r.poly || r.shape.edges) ? r.shape : undefined);

export function roomVolume(h: House, r: Room): number {
  const sh = roomShape(h, r);
  if (!sh) return roomArea(r) * roomHeight(h, r);
  const below = roomHeight(h, r) - (h.storeys[topStorey(r)]?.h ?? 0);
  return shapeOf(r, sh).V + roomArea(r) * below;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface Ctx { Bp: number }

/** Every face of a room, with its build-up and U-value. */
export function roomFaces(h: House, r: Room, ctx: Ctx): Face[] {
  const B = (key: string, def: DefaultKey) => {
    const id = h.faceBuildup[key] ?? h.defaults[def];
    return h.buildups.find((b) => b.id === id) ?? h.buildups.find((b) => b.id === h.defaults[def]) ?? h.buildups[0];
  };
  const last = h.storeys.length - 1, faces: Face[] = [], top = topStorey(r);
  const sh = roomShape(h, r), g = sh ? shapeOf(r, sh) : null;
  // Wall height on one edge of one storey: sloped rooms have low walls under the slopes and gable ends of their mean height.
  const wallH = (e: { side: Side; idx: number }, s: number, external: boolean) => {
    const st = h.storeys[s];
    if (g && s === top) return g.wallH(e);
    return st.h + (external && s < last ? st.zone : 0);
  };
  const ground = h.storeys[0]?.below ?? 0;
  const floorB = B(`gf:${r.id}`, 'groundFloor');
  const myEdges = roomEdges(r);
  const isPoly = !!(r.poly && r.poly.length >= 3);
  const doorsDone = new Set<string>();
  for (const e of myEdges) {
    const side = e.side, ext: Face[] = [];
    for (let s = r.storey; s <= top; s++) {
      const st = h.storeys[s];
      if (!st) continue;
      const cuts: Array<[number, number]> = [];
      for (const o of h.rooms) {
        if (o.id === r.id || !onStorey(o, s)) continue;
        for (const f of roomEdges(o)) {
          const span = sharedSpan(e, f);
          if (!span) continue;
          cuts.push(span);
          const key = `iw:${pairKey(r.id, o.id)}:${s}`, b = B(key, 'intWall');
          // Inside doors between this pair come out of the first stretch of shared wall, on the storey where both rooms exist.
          const doors = s === Math.max(r.storey, o.storey) && !doorsDone.has(key)
            ? h.openings.filter((d) => d.to && ((d.room === r.id && d.to === o.id) || (d.room === o.id && d.to === r.id))) : [];
          doorsDone.add(key);
          const doorA = Math.min(doors.reduce((t, d) => t + d.w * d.h, 0), (span[1] - span[0]) * wallH(e, s, false));
          faces.push({ key, label: `${side} wall`, kind: 'wall', side, az: e.az, to: { k: 'room', id: o.id }, area: (span[1] - span[0]) * wallH(e, s, false) - doorA, buildup: b, U: buildupU(b, FILMS.intWall) });
          for (const d of doors) {
            const db = h.buildups.find((x) => x.id === d.buildup) ?? h.buildups[0];
            faces.push({ key: `op:${d.id}`, label: d.name, kind: 'door', side, az: e.az, to: { k: 'room', id: o.id }, area: d.w * d.h, buildup: db, U: buildupU(db, FILMS.intWall) });
          }
        }
      }
      const len = subtract(0, e.len, cuts).reduce((t, [a, b]) => t + b - a, 0);
      if (len <= EPS) continue;
      const key = `w:${r.id}:${e.id}:${s}`, party = h.faceBoundary[key] === 'party';
      const si = g && s === top ? g.kneeOf(e) : -1, knee = si >= 0;
      const b = B(key, knee ? 'knee' : 'extWall'), area = len * wallH(e, s, true);
      const what = knee ? 'knee wall (via eaves void)' : 'wall';
      const label = `${isPoly ? `Wall ${e.idx + 1} (${side})${knee ? `, ${what}` : ''}` : `${side} ${what}`}${r.span > 1 ? ` (${st.name.toLowerCase()})` : ''}`;
      let U = buildupU(b, FILMS.extWall), to: To = party ? { k: 'party' } : { k: 'out' };
      if (knee && !party) {
        // Knee wall and the roof over the eaves void in series: per m² of knee wall the roof is 1/sin(pitch) m².
        const eavesB = B(`ev:${r.id}:${si}`, g!.slopes.find((x) => x.i === si)?.eaves === 'warm' ? 'slope' : 'loftRoof');
        U = 1 / (1 / buildupU(b, FILMS.intWall) + g!.sn / buildupU(eavesB, FILMS.roof));
      } else if (s === 0 && ground > 0 && !party) {
        to = { k: 'ground' };
        U = basementWallU(b, Math.min(ground, st.h), floorB);
      }
      ext.push({ key, label, kind: 'wall', side, az: e.az, to, area, buildup: b, U, canParty: true, len });
    }
    // Openings come out of this wall's outside area, shared by area. On a polygon room an opening sits on its
    // chosen wall, or the first wall facing its compass side.
    const ops = h.openings.filter((o) => !o.to && o.room === r.id && (isPoly ? (o.edge ?? myEdges.findIndex((x) => x.side === o.side)) === e.idx : o.side === side));
    const gross = ext.reduce((t, f) => t + f.area, 0);
    const opArea = Math.min(gross, ops.reduce((t, o) => t + o.w * o.h, 0));
    for (const f of ext) f.area -= gross > 0 ? opArea * (f.area / gross) : 0;
    faces.push(...ext);
    for (const o of ops) {
      const b = h.buildups.find((x) => x.id === o.buildup) ?? h.buildups[0];
      const shade = SHADING[o.shade ?? 'none']?.[1] ?? 1;
      const gEff = b.kind === 'glazing' && b.g != null ? b.g * (1 - (b.frame ?? 0.3)) * shade : undefined;
      faces.push({ key: `op:${o.id}`, label: o.name, kind: b.kind === 'door' ? 'door' : 'window', side, az: e.az, to: ext[0]?.to ?? { k: 'out' }, area: o.w * o.h, buildup: b, U: buildupU(b), gEff });
    }
  }
  // Floor
  const A = roomArea(r), rp = roomPoly(r);
  // Drawn floor and ceiling zones take their share of a face, by the area they cover. shortcut: a zone is taken to cover each
  // stretch of the room's floor by the area it overlaps there; overlapping zones in one band are flagged by a check.
  const zoned = (f: Face, band: number, area: (z: FloorZone) => number, uOf: (b: Buildup) => number) => {
    let rest = f.area;
    const extra: Face[] = [];
    for (const z of h.zones ?? []) {
      const zb = z.band === band && z.poly.length >= 3 ? h.buildups.find((x) => x.id === z.buildup) : undefined;
      const a = zb ? Math.min(rest, area(z)) : 0;
      if (!zb || a <= EPS) continue;
      rest -= a;
      extra.push({ ...f, key: `${f.key}~${z.id}`, label: `${f.label}, ${z.name}`, area: a, buildup: zb, U: uOf(zb) });
    }
    if (rest > EPS) faces.push({ ...f, area: rest });
    faces.push(...extra);
  };
  if (r.storey === 0) {
    const b = floorB;
    const groundU = (x: Buildup) => (ground > 0 ? groundFloorU(x, ctx.Bp, ground) : x.floorType === 'suspended' ? suspendedFloorU(x, ctx.Bp, h.suspended.vent, h.suspended.voidH) : groundFloorU(x, ctx.Bp));
    const label = ground > 0 ? 'Basement floor' : b.floorType === 'suspended' ? 'Suspended floor' : 'Floor';
    zoned({ key: `gf:${r.id}`, label, kind: 'floor', to: { k: 'ground' }, area: A, buildup: b, U: groundU(b) }, 0, (z) => overlapAreaPoly(z.poly, rp), groundU);
  } else {
    let covered = 0;
    for (const o of h.rooms) {
      if (o.id === r.id || !onStorey(o, r.storey - 1)) continue;
      const a = overlapArea(r, o);
      if (a <= EPS) continue;
      covered += a;
      const key = `f:${pairKey(r.id, o.id)}`, b = B(key, 'intFloor');
      zoned({ key, label: 'Floor', kind: 'floor', to: { k: 'room', id: o.id }, area: a, buildup: b, U: buildupU(b, FILMS.intFloor) }, r.storey, (z) => overlapArea3(z.poly, rp, roomPoly(o)), (x) => buildupU(x, FILMS.intFloor));
    }
    if (A - covered > EPS) {
      const b = B(`xf:${r.id}`, 'exposedFloor'), below = h.rooms.filter((o) => o.id !== r.id && onStorey(o, r.storey - 1));
      zoned({ key: `xf:${r.id}`, label: 'Exposed floor', kind: 'floor', to: { k: 'out' }, area: A - covered, buildup: b, U: buildupU(b, FILMS.exposedFloor) }, r.storey,
        (z) => Math.max(0, overlapAreaPoly(z.poly, rp) - below.reduce((t, o) => t + overlapArea3(z.poly, rp, roomPoly(o)), 0)), (x) => buildupU(x, FILMS.exposedFloor));
    }
  }
  // Ceiling
  let covered = 0;
  const above: Room[] = [];
  if (top < last) {
    for (const o of h.rooms) {
      if (o.id === r.id || !onStorey(o, top + 1)) continue;
      const a = overlapArea(r, o);
      if (a <= EPS) continue;
      covered += a;
      above.push(o);
      const key = `f:${pairKey(r.id, o.id)}`, b = B(key, 'intFloor');
      zoned({ key, label: 'Ceiling', kind: 'ceiling', to: { k: 'room', id: o.id }, area: a, buildup: b, U: buildupU(b, FILMS.intFloor) }, top + 1, (z) => overlapArea3(z.poly, rp, roomPoly(o)), (x) => buildupU(x, FILMS.intFloor));
    }
  }
  const flatA = g ? g.flatA : A - covered;
  if (flatA > EPS) {
    const toLoft = top === last && h.loft.present;
    const key = toLoft ? `lc:${r.id}` : `fr:${r.id}`, b = B(key, toLoft ? 'loftCeiling' : 'flatRoof');
    const films = toLoft ? FILMS.loftCeiling : FILMS.roof;
    zoned({ key, label: g ? (toLoft ? 'Flat ceiling (collar) to loft' : 'Flat roof') : toLoft ? 'Ceiling to loft' : 'Flat roof', kind: 'ceiling', to: toLoft ? { k: 'loft' } : { k: 'out' }, area: flatA, buildup: b, U: buildupU(b, films) },
      top + 1, (z) => (g ? (overlapAreaPoly(z.poly, rp) / (A || 1)) * flatA : Math.max(0, overlapAreaPoly(z.poly, rp) - above.reduce((t, o) => t + overlapArea3(z.poly, rp, roomPoly(o)), 0))), (x) => buildupU(x, films));
  }
  if (g && sh) {
    const rlB = h.buildups.find((b) => b.kind === 'glazing') ?? h.buildups[0];
    const rlG = rlB.g != null ? rlB.g * (1 - (rlB.frame ?? 0.3)) : undefined;
    g.slopes.forEach(({ i, side, area: slopeArea, dormer: d }, n) => {
      // The rooflight goes in the first slope.
      const rl = n === 0 ? Math.min(sh.rooflight, slopeArea * 0.8) : 0;
      const sb = B(`sl:${r.id}:${i}`, 'slope');
      const name = isPoly ? `Wall ${i + 1} (${side})` : side;
      faces.push({ key: `sl:${r.id}:${i}`, label: `${name} slope`, kind: 'ceiling', side, to: { k: 'out' }, area: slopeArea - rl, buildup: sb, U: buildupU(sb, FILMS.roof) });
      if (rl > EPS) faces.push({ key: `rl:${r.id}`, label: 'Rooflight', kind: 'window', to: { k: 'out' }, area: rl, buildup: rlB, U: buildupU(rlB), gEff: rlG });
      if (d) {
        const wb = B(`dw:${r.id}:${i}`, 'dormerWall'), rb = B(`dr:${r.id}:${i}`, 'dormerRoof');
        faces.push({ key: `dw:${r.id}:${i}`, label: `${name} dormer front`, kind: 'wall', side, to: { k: 'out' }, area: d.front - d.window, buildup: wb, U: buildupU(wb, FILMS.extWall) });
        faces.push({ key: `dc:${r.id}:${i}`, label: `${name} dormer cheeks (2)`, kind: 'wall', to: { k: 'out' }, area: d.cheeks, buildup: wb, U: buildupU(wb, FILMS.extWall) });
        faces.push({ key: `dr:${r.id}:${i}`, label: `${name} dormer roof`, kind: 'ceiling', to: { k: 'out' }, area: d.roof, buildup: rb, U: buildupU(rb, FILMS.roof) });
        if (d.window > EPS) faces.push({ key: `dg:${r.id}:${i}`, label: `${name} dormer window`, kind: 'window', side, to: { k: 'out' }, area: d.window, buildup: rlB, U: buildupU(rlB), gEff: rlG });
      }
    });
  }
  return faces;
}

export interface Row { key: string; label: string; to: string; buildup: string; area: number; U: number; dT: number; W: number; kind: Face['kind'] | 'vent'; canParty?: boolean; party?: boolean }
export interface RoomResult {
  room: Room; area: number; V: number; T: number;
  n: number; nInf: number; nDev: number; nMech: number;
  fabricW: number; ventW: number; totalW: number; perM2: number;
  rows: Row[]; faces: Face[];
}
export interface HouseResult {
  /** Station and region in use, where the house is, and whether they came from the postcode. */
  climate: ReturnType<typeof climateOf>;
  Tout: number; Tg: number; hdd: number; hddKnown: boolean; station: string; region: string;
  rooms: RoomResult[]; loft: { T: number; area: number; V: number } | null;
  q50: number; n50: number; envelope: number; heatedV: number; heatedA: number;
  peakW: number; paths: Array<{ label: string; W: number }>;
  htc: number; hlp: number; annualKWh: number;
  months: Array<{ heat: number; Tout: number; flow: number; cop: number; elec: number }>;
  hp: { designCop: number; scop: number; elecKWh: number; spare: number; costHP: number; costGas: number; gasKWh: number };
  checks: Array<{ level: 'error' | 'warn'; text: string }>;
  heat: {
    designFlow: number;
    /** Per heated room: design need, emitter output at the design flow, cover (out / need), lowest flow that meets the need. */
    rooms: Array<{ id: string; need: number; out: number; cover: number; req: number; has: boolean }>;
    /** The room that sets the flow temperature. */
    gov: { id: string; req: number } | null;
  };
}

export function deviceM3(d: Device) { return d.opts[d.pick]?.[1] ?? 0; }

/** Carnot fraction 0.45 on refrigerant temperatures (condensing 5 K above flow, evaporating 6 K below outside), 0.93 for defrost between −4 and 6 °C. */
export function heatPumpCop(flow: number, Te: number): number {
  const Tc = flow + 5, Tev = Te - 6, c = (0.45 * (Tc + 273.15)) / Math.max(3, Tc - Tev);
  return Math.min(7, c * (Te > -4 && Te < 6 ? 0.93 : 1));
}

export function calcHouse(h: House): HouseResult {
  const cl = climateOf(h);
  const Tout = designTemp(cl.station, h.climate.altitude, h.climate.pct);
  const reg = MCS_MEAN_TEMPS[cl.region] ?? MCS_MEAN_TEMPS[0], Tg = reg[4];
  const area = postcodeArea(h.climate.postcode), hddKnown = area in MCS_HDD, hdd = MCS_HDD[area] ?? 2200;
  const checks: HouseResult['checks'] = [];

  // Ground floor shape factor B' = A / (0.5 P), P = exposed perimeter of the ground storey (party walls excluded).
  const ground = h.rooms.filter((r) => r.storey === 0);
  const pre = ground.flatMap((r) => roomFaces(h, r, { Bp: 1 }));
  const P = pre.filter((f) => f.kind === 'wall' && (f.to.k === 'out' || f.to.k === 'ground') && f.key.startsWith('w:') && f.key.endsWith(':0')).reduce((t, f) => t + (f.len ?? 0), 0);
  const gA = ground.reduce((t, r) => t + roomArea(r), 0);
  const Bp = P > EPS ? gA / (0.5 * P) : 1000;
  const ctx = { Bp };

  const faces = new Map(h.rooms.map((r) => [r.id, roomFaces(h, r, ctx)]));
  const T: Record<string, number> = {};
  for (const r of h.rooms) T[r.id] = r.heated ? r.setpoint : (r.setpoint + Tout) / 2;
  const loftFaces = h.rooms.flatMap((r) => (faces.get(r.id) ?? []).filter((f) => f.to.k === 'loft').map((f) => ({ ...f, to: { k: 'room', id: r.id } as To })));
  const loftA = loftFaces.reduce((t, f) => t + f.area, 0), hasLoft = h.loft.present && loftA > EPS;
  const loftV = loftA * h.loft.height, loftRoofA = loftA / Math.cos((h.loft.pitch * Math.PI) / 180);
  const roofB = h.buildups.find((b) => b.id === h.defaults.loftRoof) ?? h.buildups[0];
  const roofU = buildupU(roofB, FILMS.roof);
  T.loft = (Tout + 10) / 2;
  const tempOf = (to: To): number => (to.k === 'out' ? Tout : to.k === 'ground' ? Tg : to.k === 'party' ? h.neighbourT : to.k === 'loft' ? T.loft : T[to.id] ?? Tout);
  const vol = (r: Room) => roomVolume(h, r);

  // Unheated rooms and the loft settle where heat in balances heat out (Gauss-Seidel; converges as every space has a path outside).
  const unheated = h.rooms.filter((r) => !r.heated);
  for (let it = 0; it < 300; it++) {
    for (const r of unheated) {
      const Hv = 0.33 * r.ach * vol(r);
      let num = Hv * Tout, den = Hv;
      for (const f of faces.get(r.id) ?? []) { num += f.U * f.area * tempOf(f.to); den += f.U * f.area; }
      T[r.id] = den > EPS ? num / den : Tout;
    }
    if (hasLoft) {
      const Hv = 0.33 * h.loft.ach * loftV, Hr = roofU * loftRoofA;
      let num = (Hv + Hr) * Tout, den = Hv + Hr;
      for (const f of loftFaces) { num += f.U * f.area * tempOf(f.to); den += f.U * f.area; }
      T.loft = num / den;
    }
  }

  // Ventilation (board 1d): one airtightness figure shared by exposure, plus devices and mechanical ventilation.
  const heated = h.rooms.filter((r) => r.heated);
  const heatedV = heated.reduce((t, r) => t + vol(r), 0), heatedA = heated.reduce((t, r) => t + roomArea(r) * r.span, 0);
  // Leakage envelope: heated rooms' faces to outside, ground, loft and unheated rooms.
  const toHeated = (to: To) => to.k === 'room' && !!h.rooms.find((o) => o.id === to.id)?.heated;
  const envelope = heated.reduce((t, r) => t + (faces.get(r.id) ?? []).filter((f) => f.to.k !== 'party' && !toHeated(f.to)).reduce((s, f) => s + f.area, 0), 0);
  const v = h.vent;
  // A bills calibration scales an estimated q50; a measured one stands.
  const q50 = v.source === 'meas' ? v.q50 : v.factors.filter((f) => f.on).reduce((t, f) => t + f.dq, 0) * (h.calib?.q ?? 1);
  const n50 = heatedV > EPS ? (q50 * envelope) / heatedV : 0, base = n50 / 20;
  const fansOff = v.mech !== 'none';

  const rooms: RoomResult[] = h.rooms.map((r) => {
    const fs = faces.get(r.id) ?? [], V = vol(r), Ti = T[r.id];
    const rows: Row[] = fs.map((f) => {
      const to = tempOf(f.to);
      return {
        key: f.key, label: f.label, buildup: f.buildup.name, area: f.area, U: f.U, dT: Ti - to, W: f.U * f.area * (Ti - to), kind: f.kind, canParty: f.canParty, party: f.to.k === 'party',
        to: f.to.k === 'out' ? 'outside' : f.to.k === 'ground' ? 'ground' : f.to.k === 'party' ? 'neighbour' : f.to.k === 'loft' ? 'loft' : h.rooms.find((o) => o.id === (f.to as { id: string }).id)?.name ?? '?',
      };
    });
    let n = 0, nInf = 0, nDev = 0, nMech = 0;
    if (r.heated && V > EPS) {
      const extSides = new Set(fs.filter((f) => f.kind === 'wall' && f.to.k === 'out').map((f) => f.side)).size;
      const underRoof = fs.some((f) => f.kind === 'ceiling' && (f.to.k === 'loft' || f.to.k === 'out')) ? 1 : 0;
      nInf = base * (0.5 + 0.25 * extSides + 0.15 * underRoof);
      nDev = v.devices.filter((d) => d.room === r.id && !(fansOff && d.fan)).reduce((t, d) => t + deviceM3(d), 0) / V;
      const lossShare = v.mech === 'mvhr' ? 1 - v.eta / 100 : 1;
      const supplied = fansOff && heatedV > EPS ? (v.mechFlow * (V / heatedV)) / V : 0;
      nMech = supplied * lossShare;
      n = v.method === 'cibse' ? CIBSE_ACH[r.type] : nInf + nDev + nMech;
      // MCS 0.5 ach minimum for habitable rooms applies to the fresh air supplied. Any top-up comes through the
      // mechanical system, so under MVHR only its unrecovered share counts as heat loss.
      if (v.minAch && HABITABLE.includes(r.type)) {
        if (v.method === 'cibse') n = Math.max(n, 0.5);
        else {
          const air = nInf + nDev + supplied;
          if (air < 0.5) { const top = 0.5 - air; nMech += top * lossShare; n += top * lossShare; }
        }
      }
    } else if (!r.heated) n = r.ach;
    const ventW = r.heated ? 0.33 * n * V * (Ti - Tout) : 0;
    if (r.heated) rows.push({ key: `vent:${r.id}`, label: 'Ventilation', to: 'outside', buildup: `${n.toFixed(2)} ach · ${V.toFixed(1)} m³`, area: 0, U: 0, dT: Ti - Tout, W: ventW, kind: 'vent' });
    const fabricW = r.heated ? rows.filter((x) => x.kind !== 'vent').reduce((t, x) => t + x.W, 0) : 0;
    const a = roomArea(r);
    return { room: r, area: a, V, T: Ti, n, nInf, nDev, nMech, fabricW, ventW, totalW: fabricW + ventW, perM2: a > EPS ? (fabricW + ventW) / a : 0, rows, faces: fs };
  });

  const hr = rooms.filter((x) => x.room.heated);
  const peakW = hr.reduce((t, x) => t + x.totalW, 0);
  const sum = (pred: (row: Row) => boolean) => hr.reduce((t, x) => t + x.rows.filter(pred).reduce((s, row) => s + row.W, 0), 0);
  const paths = [
    { label: 'Ventilation', W: sum((x) => x.kind === 'vent') },
    { label: 'Walls', W: sum((x) => x.kind === 'wall') },
    { label: 'Windows', W: sum((x) => x.kind === 'window') },
    { label: 'Doors', W: sum((x) => x.kind === 'door') },
    { label: 'Floors', W: sum((x) => x.kind === 'floor') },
    { label: 'Roof & ceilings', W: sum((x) => x.kind === 'ceiling') },
  ];

  const Tin = heatedV > EPS ? hr.reduce((t, x) => t + x.T * x.V, 0) / heatedV : 21;
  const htc = Tin - Tout > EPS ? peakW / (Tin - Tout) : 0;
  // shortcut: degree-day estimate scales the whole design loss, ground loss included; replace with the year simulation (board 4b) in phase 2.
  const wts = MEAN.map((m, i) => Math.max(0, 15.5 + (h.calib?.dt ?? 0) - m) * DAYS[i]), wsum = wts.reduce((a, b) => a + b, 0) || 1;
  // Calibration: warmer rooms raise the degree-day base; part-heated houses use a share of it.
  const ddRatio = h.calib ? wsum / (MEAN.reduce((a, m, i) => a + Math.max(0, 15.5 - m) * DAYS[i], 0) || 1) : 1;
  const annualKWh = ((htc * hdd * 24) / 1000) * ddRatio * (h.calib?.hf ?? 1);
  const needs = hr.map((x) => ({ room: x.room, need: x.totalW }));
  const flowAt = (Te: number) => systemFlow(h, needs, Tout, Te);
  const copAt = (Te: number) => heatPumpCop(flowAt(Te), Te);
  const designFlow = flowAt(Tout);
  const emitRooms = hr.map((x) => {
    const has = h.heating.emitters.some((e) => e.room === x.room.id);
    const out = roomOut(h, x.room.id, designFlow, x.room.setpoint);
    return { id: x.room.id, need: x.totalW, out, cover: x.totalW > 0 ? out / x.totalW : Infinity, req: flowNeeded(h, x.room.id, x.totalW, x.room.setpoint), has };
  });
  const gov = emitRooms.filter((e) => e.has).reduce<(typeof emitRooms)[number] | null>((a, e) => (!a || e.req > a.req ? e : a), null);
  const months = MEAN.map((m, i) => {
    const heat = (annualKWh * wts[i]) / wsum, cop = copAt(m);
    return { heat, Tout: m, flow: flowAt(m), cop, elec: heat / cop };
  });
  const elecKWh = months.reduce((t, m) => t + m.elec, 0), gasKWh = annualKWh / (h.hp.boilerEff / 100 || 1);
  const hp = {
    designCop: copAt(Tout), scop: elecKWh > EPS ? annualKWh / elecKWh : 0, elecKWh,
    spare: peakW > EPS ? (h.hp.capacity * 1000) / peakW - 1 : 0,
    costHP: (elecKWh * h.hp.elecP) / 100, costGas: (gasKWh * h.hp.gasP) / 100 + (h.hp.gasSC * 365) / 100, gasKWh,
  };

  // Model checks (board 1f)
  for (let s = 0; s < h.storeys.length; s++) {
    const on = h.rooms.filter((r) => onStorey(r, s));
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      if (overlapArea(on[i], on[j]) > 0.01) checks.push({ level: 'error', text: `${on[i].name} and ${on[j].name} overlap on the ${h.storeys[s].name.toLowerCase()}.` });
    }
  }
  const zs = h.zones ?? [];
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
    if (zs[i].band === zs[j].band && overlapAreaPoly(zs[i].poly, zs[j].poly) > 0.01) checks.push({ level: 'warn', text: `Floor zones ${zs[i].name} and ${zs[j].name} overlap; the first one drawn gets the shared area.` });
  }
  for (const r of h.rooms) {
    if (roomArea(r) <= 0.01) checks.push({ level: 'error', text: `${r.name} has no floor area.` });
    if (r.poly && selfIntersects(r.poly)) checks.push({ level: 'error', text: `${r.name}'s outline crosses itself.` });
    if (r.storey + r.span > h.storeys.length) checks.push({ level: 'error', text: `${r.name} rises above the top storey.` });
    // Openings must sit on outside wall: check each wall that has any.
    const es = roomEdges(r), isPoly = !!(r.poly && r.poly.length >= 3);
    for (const e of es) {
      const ops = h.openings.filter((o) => !o.to && o.room === r.id && (isPoly ? (o.edge ?? es.findIndex((x) => x.side === o.side)) === e.idx : o.side === e.side));
      if (!ops.length) continue;
      const wall = (faces.get(r.id) ?? []).filter((f) => f.kind === 'wall' && f.key.startsWith(`w:${r.id}:${e.id}:`)).reduce((t, f) => t + f.area, 0);
      if (wall < 0.05) checks.push({ level: 'error', text: `${r.name}: ${ops.map((o) => o.name).join(', ')} on ${isPoly ? `wall ${e.idx + 1}` : `the ${e.side} side`}, which has no outside wall left.` });
    }
  }
  if (!hddKnown) checks.push({ level: 'warn', text: `Postcode area "${area || h.climate.postcode}" not in the MCS degree-day table; using 2,200 K·day.` });
  if (v.mech === 'mvhr' && q50 > 5) checks.push({ level: 'warn', text: `MVHR with q50 ${q50.toFixed(1)}: above 5 m³/h·m² most of the heat recovery is lost to leakage.` });
  if (hp.spare < 0) checks.push({ level: 'warn', text: `Heat pump is ${Math.round(-hp.spare * 100)}% short of the design heat loss.` });
  for (const e of emitRooms) {
    const name = h.rooms.find((r) => r.id === e.id)?.name ?? e.id;
    if (!e.has) checks.push({ level: 'warn', text: `${name} is heated but has no emitter.` });
    else if (e.cover < 0.995) checks.push({ level: 'warn', text: `${name}: emitters give ${Math.round(e.out)} W at ${designFlow.toFixed(0)} °C flow, ${Math.round(e.need)} W needed (${Math.round(e.cover * 100)}%).` });
  }
  for (const e of h.heating.emitters) {
    if (e.kind === 'ufh' && loopLength(e, h) > 100) checks.push({ level: 'warn', text: `UFH loop in ${h.rooms.find((r) => r.id === e.room)?.name ?? e.room} is ${Math.round(loopLength(e, h))} m; keep 16 mm loops under 100 m (split it in two).` });
    if (e.kind === 'ufh' && e.rect) {
      const room = h.rooms.find((r) => r.id === e.room);
      const rp: Pt[] = [[e.rect.x, e.rect.y], [e.rect.x + e.rect.w, e.rect.y], [e.rect.x + e.rect.w, e.rect.y + e.rect.h], [e.rect.x, e.rect.y + e.rect.h]];
      if (room && overlapAreaPoly(rp, roomPoly(room)) < e.rect.w * e.rect.h * 0.98) checks.push({ level: 'warn', text: `UFH loop in ${room.name} runs outside the room.` });
    }
  }

  return {
    Tout, Tg, hdd, hddKnown, station: MCS_STATIONS[cl.station]?.[0] ?? '?', region: reg[0], climate: cl,
    rooms, loft: hasLoft ? { T: T.loft, area: loftA, V: loftV } : null,
    q50, n50, envelope, heatedV, heatedA, peakW, paths, htc, hlp: heatedA > EPS ? htc / heatedA : 0, annualKWh, months, hp, checks,
    heat: { designFlow, rooms: emitRooms, gov: gov ? { id: gov.id, req: gov.req } : null },
  };
}
