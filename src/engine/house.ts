// Whole-house design-day heat loss: rooms are rectangles on storeys, every face is derived from how they touch.
// Plan and rules: docs/whole-house-plan.md.
import { DAYS, MAT, MEAN } from './data';
import { layerR } from './swap';
import { junctionPsi } from './junction';
import { bearingLabel, compass, edges, overlapArea3, overlapAreaPoly, pointInPoly, polyArea, selfIntersects, sharedSpan } from './geom';
import type { Edge, Pt } from './geom';
import { edgeTilt, footprint, roofAt, roofModel } from './house-roof';
import type { RoofEdge, RoofModel } from './house-roof';
export type { RoofEdge };
export { bearingLabel };
import { MCS_HDD, MCS_MEAN_TEMPS, MCS_STATIONS, ROOM_TEMPS, climateFromPostcode, designTemp, postcodeArea } from './climate-mcs';

/** The MCS station and region for a house: from its postcode unless set by hand, with a location for sun and weather. */
export function climateOf(h: House): { station: number; region: number; lat: number; lon: number; fromPostcode: boolean; km: number } {
  const found = h.climate.auto !== false ? climateFromPostcode(h.climate.postcode) : null;
  if (found) return { station: found.station, region: found.region, lat: found.latlon[0], lon: found.latlon[1], fromPostcode: true, km: found.km };
  const s = MCS_STATIONS[h.climate.station] ?? MCS_STATIONS[0];
  return { station: h.climate.station, region: h.climate.region, lat: s[2], lon: s[3], fromPostcode: false, km: 0 };
}
import { flowNeeded, loopLength, loopMax, roomOut, scheduleSource, systemFlow } from './house-heating';
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
  g?: number; frame?: number;}

/** Board 2c glazing library: typical U and g by type (SAP 10.2 Table 6b/6c style values). */
export const GLAZING_LIBRARY: Array<Pick<Buildup, 'name' | 'u' | 'g' | 'frame'>> = [
  { name: 'Single glazed, timber frame', u: 4.8, g: 0.85, frame: 0.3 },
  { name: 'Double glazed, before 2002', u: 2.8, g: 0.76, frame: 0.3 },
  { name: 'Double glazed, 2002–2021', u: 2.0, g: 0.72, frame: 0.3 },
  { name: 'Double glazed, low-e argon', u: 1.4, g: 0.63, frame: 0.3 },
  { name: 'Triple glazed', u: 0.9, g: 0.5, frame: 0.3 },
  { name: 'Secondary glazing over single', u: 2.4, g: 0.76, frame: 0.3 },
  { name: 'Rooflight, double glazed', u: 1.6, g: 0.6, frame: 0.2 },
  { name: 'Single glazed, metal frame', u: 5.7, g: 0.85, frame: 0.2 },
  { name: 'Double glazed, uPVC, argon', u: 1.6, g: 0.67, frame: 0.3 },
  { name: 'Double glazed, aluminium', u: 1.8, g: 0.67, frame: 0.2 },
  { name: 'Triple glazed, passive-house frame', u: 0.7, g: 0.5, frame: 0.3 },
  { name: 'Glass block', u: 3.5, g: 0.6, frame: 0.1 },
  { name: 'Patio / bifold doors, double glazed', u: 1.6, g: 0.63, frame: 0.25 },
  { name: 'Conservatory glazing', u: 2.0, g: 0.7, frame: 0.2 },
];
/** Typical external doors (U-values from SAP Table 6e and manufacturer data). */
export const DOOR_LIBRARY: Array<Pick<Buildup, 'name' | 'u'>> = [
  { name: 'Solid timber door', u: 3.0 },
  { name: 'Old part-glazed timber door', u: 3.7 },
  { name: 'Insulated composite door', u: 1.4 },
  { name: 'Uninsulated metal / steel door', u: 5.7 },
  { name: 'Passive-house door', u: 0.8 },
  { name: 'uPVC door, part-glazed', u: 2.2 },
];
/** Shading on a window: overhangs, neighbouring buildings and trees, net curtains. Multiplies its solar gain. */
export const SHADING: Record<string, [string, number]> = {
  none: ['Unshaded', 1], light: ['Light (nets, sparse trees)', 0.8], overhang: ['Overhang or reveal', 0.7], heavy: ['Heavy (buildings, dense trees)', 0.5],
};
/** Foundation edge insulation (D: width out or depth down, m) and the floor-to-wall junction. The insulation is a material and
 * thickness (mm) from the library; R, m²K/W, is only used by older projects saved before that. */
export interface FloorEdge { edge: 'none' | 'horizontal' | 'vertical'; D: number; R: number; mat?: string; t?: number;
  /** Which side of the foundation the edge insulation is on: BS EN ISO 13370 counts both the same for the floor U-value; the calculated junction Ψ uses it. */
  side?: 'inside' | 'outside';
  /** Junction 'calc': the upstand's material and thickness, mm (no material: no upstand), and the foundation's conductivity, W/mK. */
  upMat?: string; upT?: number; footK?: number;
  /** Junction 'calc' and the drawing: foundation depth below outside ground level, m (unset 0.75; 0: none, the wall stands on the ground). */
  footD?: number; upstand: 'off' | 'none' | 'insulated' | 'custom' | 'calc'; psi: number }
/** The edge insulation's thermal resistance, m²K/W: from its material and thickness, or the resistance an older project typed in. */
export const edgeR = (e: FloorEdge) => (e.mat && MAT[e.mat] ? layerR(MAT[e.mat], e.t ?? MAT[e.mat].t) : e.R);
/** Floor-to-wall junction Ψ, W/mK (SAP Table K1, E5 ground floor: default and approved detail). */
export const UPSTAND_PSI = { none: 0.32, insulated: 0.16 } as const;
export const upstandPsi = (e?: FloorEdge) => (!e || e.upstand === 'off' ? 0 : e.upstand === 'custom' ? Math.max(0, e.psi) : e.upstand === 'calc' ? UPSTAND_PSI.none : UPSTAND_PSI[e.upstand]);
/** Foundation conductivities offered for the calculated junction, W/mK. */
export const FOOTINGS_K: Array<[number, string]> = [[1.13, 'Dense concrete or block'], [0.47, 'Lightweight aggregate block'], [0.15, 'Aircrete thermal block'], [0.77, 'Brick'], [2.3, 'Stone']];

/**
 * The floor-to-wall junction's Ψ, W/mK, where this outside wall meets this ground floor: the set or entered value, or for 'calc'
 * a 2-D heat-flow model of the two build-ups at the junction (BS EN ISO 10211, BR 497), with the house's edge insulation,
 * upstand and foundation. A suspended floor isn't modelled: it takes the SAP default.
 */
export function junctionPsiFor(h: House, Bp: number, wall: Buildup | undefined, floor: Buildup | undefined): number {
  const e = h.floorEdge;
  if (!e || e.upstand !== 'calc') return upstandPsi(e);
  if (!wall || !floor || floor.floorType === 'suspended' || !wall.layers.length || !floor.layers.length) return UPSTAND_PSI.none;
  const em = e.mat && MAT[e.mat] ? e.mat : undefined;
  return junctionPsi({
    wall: wall.layers, floor: floor.layers, Uwall: buildupU(wall), Ufloor: groundFloorU(floor, Bp, 0, e), b: Math.min(10, Math.max(0.5, Bp / 2)),
    edge: e.edge !== 'none' && em ? { kind: e.edge, side: e.side ?? 'outside', D: e.D, mat: em, t: e.t ?? MAT[em].t } : undefined,
    upstand: e.upMat && MAT[e.upMat] && (e.upT ?? 0) > 0 ? { mat: e.upMat, t: e.upT! } : undefined,
    footK: e.footK, footDepth: e.footD,
  });
}

/** The junction Ψ of the house's default outside wall and ground floor (what the floor-edge drawing shows). */
export const junctionPsiOf = (h: House, Bp: number) =>
  junctionPsiFor(h, Bp, h.buildups.find((b) => b.id === h.defaults.extWall), h.buildups.find((b) => b.id === h.defaults.groundFloor));

/** One kind of floor-to-wall junction in the house: an outside wall build-up meeting a ground-floor build-up, its length and Ψ. */
export interface Junction { wall: string; floor: string; len: number; psi: number }

export interface Storey {
  name: string; h: number; zone: number;
  /** Depth below ground, m (lowest storey only): its outside walls are in the ground and its floor is a basement floor. */
  below?: number;
}
/** A dormer on a roof section: it stands on the eave nearest `at` (plan m), `w` wide, its front `front` m above the storey floor, with a window of `window` m². */
export interface Dormer { id: string; at: Pt; w: number; front: number; window: number }
/**
 * Shape of a roof section: gable (slopes from the edges along the ridge, gable ends across it), hip (slopes from every edge),
 * mono (one slope, from the edges facing `facing`), flat, or custom (each edge set by hand).
 */
export type RoofForm = 'gable' | 'hip' | 'mono' | 'flat' | 'custom';
/** A roof over part (or all) of the house. Rooms under it take their ceilings, slopes, knee walls and dormers from it. */
export interface RoofSection {
  id: string; name: string;
  /** Storey whose walls carry it; the top storey when unset. */
  storey?: number;
  /** Wall-plate height above that storey's floor, m (where the slopes start); that storey's height when unset. */
  plate?: number;
  /** Outline in plan metres, at the eaves; unset = follows the outside of the rooms whose top storey carries it. */
  poly?: Pt[];
  form: RoofForm; pitch: number;
  /** Gable: ridge along the plan's x (left–right) or y (up–down); along the longer side when unset. */
  ridge?: 'x' | 'y';
  /** Mono: the plan side the slope faces. */
  facing?: Side;
  /** Custom: one per outline edge, in order. */
  edges?: RoofEdge[];
  /** Roof over eaves voids behind knee walls: cold (tiles only) or warm (insulated like the slopes). */
  eaves: 'cold' | 'warm';
  dormers: Dormer[];
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
  /**
   * Under a roof: how high its ceiling goes on its top storey. Unset = flat at the storey height (the roof slopes it where it
   * comes lower); a number = a flat collar at that height; 'roof' = open to the roof (vaulted).
   */
  ceiling?: number | 'roof';
  /** Rooflight area in its biggest roof slope, m². */
  rooflight?: number;
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
export interface FloorZone { id: string; band: number; name: string; poly: Pt[]; buildup: string;
  /** Underfloor heating: every heated room on the storey above this floor gets a loop for its part of the zone, with this pipe spacing and outside diameter (mm; 150 and 16 when unset). */
  ufh?: boolean; spacing?: number; pipe?: number;
}
export interface Device { id: string; room: string; name: string; fan: boolean; opts: Array<[string, number]>; pick: number }
export interface Factor { id: string; label: string; dq: number; on: boolean }
export type Boundary = 'out' | 'party';
export type WallAlign = 'in' | 'ctr' | 'out';
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
  /** Where each drawn wall's thickness sits on its line, from the interior of the room the wall belongs to (inside walls: the first room of the pair). Default: outside walls outside the line, inside walls centred. */
  wallAlign: Record<string, WallAlign>;
  /** Drawn patches of floors and ceilings with a different build-up. */
  zones?: FloorZone[];
  neighbourT: number;
  /** True bearing of "up" on the plan, degrees clockwise from north (0 = plan drawn north-up). */
  north?: number;
  /** The roofs over the house. No roof: every top ceiling is a flat roof. */
  roofs: RoofSection[];
  /** The loft (the space between the roofs and the flat ceilings under them): its ventilation, ach. Its shape comes from the roofs. */
  loft: { ach: number };
  /** Outside colour of every roof (light, mid or dark from COLOURS): how much sun the roof covering absorbs. Mid when unset. */
  roofColour?: string;
  /**
   * Edge of a solid ground floor: foundation edge insulation (BS EN ISO 13370, horizontal width or vertical depth D in m,
   * thermal resistance R m²K/W) and the floor-to-wall junction at the screed upstand, as a linear loss Ψ W/mK.
   * Upstand 'off' leaves the junction out.
   */
  floorEdge?: FloorEdge;
  /** Suspended floors: airbrick opening area per metre of exposed wall (mm²/m) and void height (m). */
  suspended: { vent: number; voidH: number };
  climate: {
    station: number; pct: '99.6' | '99'; altitude: number; region: number; postcode: string;
    /** Your own design outside temperature, °C, in place of the MCS figure; unset to use MCS. */
    designT?: number;
    /** Pick the station and region from the postcode (MCS nearest-location rule); false to use the ones chosen by hand. */
    auto?: boolean;
    /** Weather for the year run: synthetic from monthly means, or the station's typical meteorological year (PVGIS). */
    weather?: 'synthetic' | 'tmy';
  };
  vent: {
    method: 'model' | 'cibse'; source: 'est' | 'meas'; q50: number; factors: Factor[]; devices: Device[];
    mech: 'none' | 'dmev' | 'mvhr'; mechFlow: number; eta: number; minAch: boolean;
  };
  /**
   * Heat source (named hp for older saves): type, boiler fuel, output at the design temperature, max flow, prices (p/kWh,
   * gas standing p/day and whether to count it), non-condensing boiler seasonal efficiency %, heat pump
   * performance factor (share of the ideal Carnot COP), and carbon factors kgCO2/kWh.
   */
  hp: {
    source: HeatSource; fuel: Fuel; capacity: number; maxFlow: number;
    elecP: number; gasP: number; gasSC: number; gasStanding: boolean; oilP: number; lpgP: number; boilerEff: number; hpFactor: number;
    co2: Record<'elec' | Fuel, number>;
    /** A specific heat pump's datasheet COP points; used in place of hpFactor while `source` matches the heat source. */
    sheet?: HeatPumpSheet;
  };
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
  /** A dashed footprint (metres) to draw within, from the new-project dialog; not a room. */
  guide?: { w: number; d: number };
}

/** A floor-plan image placed under one storey's plan: top-left corner and width in plan metres. */
export interface TraceImage { src: string; x: number; y: number; w: number; opacity: number }
/** Tracing underlay for the plan, kept once per project (images are large): a floor-plan image per level, or satellite imagery. */
export interface TraceSettings {
  mode: 'none' | 'image' | 'sat';
  /** By level (storeyLevel), so a basement added in one scenario doesn't move the images. */
  images: Record<number, TraceImage>;
  /** Satellite imagery: plan (0, 0) sits at this latitude and longitude. */
  sat: { lat: number; lon: number; zoom: number; opacity: number };
}

/** A storey's level counted from the ground floor (0); a basement is −1. Only storey 0 can be a basement. */
export const storeyLevel = (h: Pick<House, 'storeys'>, storey: number) => storey - ((h.storeys[0]?.below ?? 0) > 0 ? 1 : 0);

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
  /** True compass bearing the face looks out on, degrees from north (walls, windows, roof slopes). */
  az?: number;
  /** Tilt from horizontal, degrees: 90 for walls (when unset), 0 for flat roofs, the pitch for slopes. */
  tilt?: number;
  /** Outside walls can be switched to a party wall. */
  canParty?: boolean;
  /** Windows: effective solar transmittance of the whole opening (glass g × glass share × shading), or undefined to use the house default. */
  gEff?: number;
  /** Edge length along the plan, outside walls only. */
  len?: number;
  /** Walls: which wall of the room (roomEdges index), on which storey, and the stretches of it this face covers, metres from its start. */
  along?: { edge: number; storey: number; t: Array<[number, number]> };
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

export const layersR = (b: Buildup) => b.layers.reduce((s, [m, t]) => (MAT[m] ? s + layerR(MAT[m], t) : s), 0);
export const buildupU = (b: Buildup, films = FILMS.extWall) => b.u ?? 1 / (films + layersR(b));

/**
 * BS EN ISO 13370 slab on ground (λ 2.0 W/mK soil, 0.3 m wall); `z` > 0 for a basement floor that depth below ground.
 * Edge insulation (slab on ground only) lowers it by 2ΔΨ/B'.
 */
export function groundFloorU(b: Buildup, Bp: number, z = 0, edge?: FloorEdge): number {
  if (b.u != null) return b.u;
  const lam = 2, dt = 0.3 + lam * (0.17 + layersR(b) + 0.04) + z / 2;
  const U0 = dt < Bp ? (2 * lam / (Math.PI * Bp + dt)) * Math.log(Math.PI * Bp / dt + 1) : lam / (0.457 * Bp + dt);
  const R = edge ? edgeR(edge) : 0;
  if (z > 0 || !edge || edge.edge === 'none' || edge.D <= 0 || R <= 0) return U0;
  // shortcut: R' is taken as the insulation's own R (the soil it displaces, d/λ, is ignored); fine for edge insulation under ~100 mm.
  const d2 = R * lam, D = edge.edge === 'vertical' ? 2 * edge.D : edge.D;
  const dPsi = -(lam / Math.PI) * (Math.log(D / dt + 1) - Math.log(D / (dt + d2) + 1));
  return Math.max(0.01, U0 + (2 * dPsi) / Bp);
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

// --- Roofs ---------------------------------------------------------------------------------------------
// The house has roof sections; each room under one takes its ceiling, slopes, knee walls and dormers from it.

/** Thickness of the default outside wall, m: how far the eaves of a roof that follows the rooms sit outside them. */
export const extWallThickness = (h: House) =>
  Math.min(0.7, Math.max(0.1, (h.buildups.find((b) => b.id === h.defaults.extWall)?.layers ?? []).reduce((t, [, mm]) => t + mm, 0) / 1000));
/** The storey whose walls carry a section (the top storey when unset), and its wall-plate height above that storey's floor. */
export const roofStorey = (h: Pick<House, 'storeys'>, s: RoofSection) => Math.min(h.storeys.length - 1, Math.max(0, s.storey ?? h.storeys.length - 1));
export const roofPlate = (h: Pick<House, 'storeys'>, s: RoofSection) => s.plate ?? h.storeys[roofStorey(h, s)]?.h ?? 2.4;

const footCache = new Map<string, Pt[][]>();
/** A section's outlines: the drawn one, or the outside of the rooms whose top storey carries it (one outline per separate block). */
export function roofOutlines(h: House, s: RoofSection): Pt[][] {
  if (s.poly && s.poly.length >= 3) return [s.poly];
  const st = roofStorey(h, s), polys = h.rooms.filter((r) => topStorey(r) === st).map(roomPoly), grow = extWallThickness(h);
  const key = JSON.stringify([polys, grow]);
  let out = footCache.get(key);
  if (!out) {
    out = footprint(polys, grow);
    if (footCache.size > 100) footCache.clear();
    footCache.set(key, out);
  }
  return out;
}

/** How each edge of an outline meets the roof: an eave with a slope rising from it, or a vertical gable. */
export function roofEdgesOf(s: RoofSection, poly: Pt[]): RoofEdge[] {
  const es = edges(poly), p = s.pitch;
  if (s.form === 'custom') return es.map((_, i) => s.edges?.[i] ?? { kind: 'eave', pitch: p });
  if (s.form === 'flat') return es.map(() => ({ kind: 'eave', pitch: 0 }));
  if (s.form === 'hip') return es.map(() => ({ kind: 'eave', pitch: p }));
  if (s.form === 'mono') {
    const want = SIDES.indexOf(s.facing ?? 'S') * 90, off = (az: number) => Math.abs(((az - want + 540) % 360) - 180);
    const best = Math.min(...es.map((e) => off(e.az)));
    return es.map((e) => ({ kind: off(e.az) <= Math.max(45, best) + 1e-6 ? 'eave' : 'gable', pitch: p }));
  }
  // Gable: the edges running along the ridge carry the slopes; the ones across it are gable ends.
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  const ridge = s.ridge ?? (Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y');
  return es.map((e) => ({ kind: (ridge === 'x' ? Math.abs(e.d[0]) >= Math.abs(e.d[1]) - 1e-9 : Math.abs(e.d[1]) > Math.abs(e.d[0]) + 1e-9) ? 'eave' : 'gable', pitch: p }));
}

/** One outline of one section, ready to give heights. `key` is `section.n`. */
export interface RoofPart { sec: RoofSection; key: string; storey: number; plate: number; poly: Pt[]; model: RoofModel }
const partCache = new Map<string, RoofPart[]>();
let partKey = '';
/** Every roof outline in the house with its planes. */
export function roofParts(h: House): RoofPart[] {
  const key = JSON.stringify([h.roofs ?? [], h.storeys.map((s) => s.h), h.rooms.map((r) => [r.storey, r.span, roomPoly(r)]), extWallThickness(h)]);
  partKey = key;
  const hit = partCache.get(key);
  if (hit) return hit;
  const out = (h.roofs ?? []).flatMap((sec) => {
    const storey = roofStorey(h, sec), plate = roofPlate(h, sec);
    return roofOutlines(h, sec).filter((p) => p.length >= 3 && !selfIntersects(p)).map((poly, n): RoofPart => ({ sec, key: `${sec.id}.${n}`, storey, plate, poly, model: roofModel(poly, roofEdgesOf(sec, poly), plate) }));
  });
  if (partCache.size > 50) partCache.clear();
  partCache.set(key, out);
  return out;
}

/** The roof over a plan point among some sections' outlines: the highest one there, its height above the storey floor and its plane. */
export function roofOver(parts: RoofPart[], p: Pt): { z: number; i: number; part: RoofPart } | null {
  let best: { z: number; i: number; part: RoofPart } | null = null;
  for (const part of parts) {
    if (!pointInPoly(p, part.poly)) continue;
    const r = roofAt(part.model, p);
    if (!best || r.z > best.z) best = { ...r, part };
  }
  return best;
}

/** The highest a room's ceiling goes on its top storey: the storey height, a collar height of its own, or the roof itself. */
export const ceilingCap = (h: House, r: Room) => (r.ceiling === 'roof' ? Infinity : typeof r.ceiling === 'number' && r.ceiling > 0 ? r.ceiling : h.storeys[topStorey(r)]?.h ?? 2.4);

export interface RoomSlope { part: string; edge: number; planAz: number; tilt: number; area: number }
export interface RoomDormer { d: Dormer; part: string; edge: number; planAz: number; front: number; cheeks: number; roof: number; window: number; vol: number }
/** What a room under a roof takes from it, on its top storey. Areas are plan-true (they add up to the room's uncovered ceiling). */
export interface RoomRoof {
  /** Volume of the top storey's part of the room, m³ (dormers included). */
  V: number;
  /** Flat ceiling under a loft, and flat roof (nothing over it or the roof sits right on the ceiling), m² of plan. */
  flatLoft: number; flatOut: number;
  /** Plan area of the ceiling not under a room above, as sampled (flat parts plus slopes). */
  unc: number;
  slopes: RoomSlope[];
  /** Per wall in outline order: share of it at full height, and the mean height of the rest weighted by its share. */
  walls: Array<{ full: number; low: number }>;
  /** Per wall: an eaves void behind it (the roof carries on past it), with the slope over the void and the section's eaves. */
  knee: Array<{ tilt: number; eaves: 'cold' | 'warm' } | null>;
  dormers: RoomDormer[];
}

const roomRoofCache = new Map<string, RoomRoof | null>();
/** A room's share of the roof over its top storey, or null when no roof is over it (its ceiling is then flat). */
export function roomRoof(h: House, r: Room): RoomRoof | null {
  const top = topStorey(r), last = h.storeys.length - 1, all = roofParts(h), parts = all.filter((p) => p.storey === top);
  if (!parts.length) return null;
  const poly = roomPoly(r), st = h.storeys[top];
  const above = top < last ? h.rooms.filter((o) => o.id !== r.id && onStorey(o, top + 1)).map(roomPoly) : [];
  const neighbours = h.rooms.filter((o) => o.id !== r.id && onStorey(o, top)).map(roomPoly);
  const key = JSON.stringify([partKey, r.id, poly, r.storey, r.span, r.ceiling, above, neighbours]);
  if (roomRoofCache.has(key)) return roomRoofCache.get(key)!;
  const out = computeRoomRoof(h, r, parts, poly, st, above, neighbours);
  if (roomRoofCache.size > 400) roomRoofCache.clear();
  roomRoofCache.set(key, out);
  return out;
}

function computeRoomRoof(h: House, r: Room, parts: RoofPart[], poly: Pt[], st: Storey, above: Pt[][], neighbours: Pt[][]): RoomRoof | null {
  const cap = ceilingCap(h, r), flatH = Number.isFinite(cap) ? cap : st.h;
  const A = polyArea(poly), step = Math.max(0.03, Math.min(0.15, Math.sqrt(A) / 50));
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  let n = 0, any = false, vol = 0, loft = 0, out = 0;
  const sl = new Map<string, { part: RoofPart; edge: number; plan: number }>();
  for (let x = Math.min(...xs) + step * 0.513; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step * 0.491; y < Math.max(...ys); y += step) {
      const p: Pt = [x, y];
      if (!pointInPoly(p, poly)) continue;
      n++;
      if (above.some((a) => pointInPoly(p, a))) { vol += st.h; continue; }
      const R = roofOver(parts, p);
      if (!R) { vol += flatH; out++; continue; }
      any = true;
      if (R.z - cap > 0.05) { vol += cap; loft++; continue; }
      // The roof is the ceiling here (or sits on a flat ceiling): a slope of its plane, or flat at the plate where no eave governs.
      vol += Math.max(0, Math.min(cap, R.z));
      if (R.i < 0) { out++; continue; }
      const k = `${R.part.key}:${R.i}`, s = sl.get(k);
      if (s) s.plan++; else sl.set(k, { part: R.part, edge: R.i, plan: 1 });
    }
  }
  if (!any || !n) return null;
  const cell = A / n;
  const E = edges(poly), wallT = extWallThickness(h);
  const walls = E.map((e) => {
    let full = 0, low = 0;
    for (let j = 0; j < 30; j++) {
      const u = ((j + 0.5) / 30) * e.len, p: Pt = [e.a[0] + e.d[0] * u - e.n[0] * 0.01, e.a[1] + e.d[1] * u - e.n[1] * 0.01];
      const R = above.some((a) => pointInPoly(p, a)) ? null : roofOver(parts, p);
      if (!R || R.z >= cap) full++; else low += Math.max(0, R.z);
    }
    return { full: full / 30, low: low / 30 };
  });
  // A low wall with roof still over the far side of it (and no room there) has an eaves void behind it.
  const knee = E.map((e, i) => {
    if (walls[i].full > 0.5) return null;
    let hits = 0, tilt = 0, eaves: 'cold' | 'warm' = 'cold';
    for (let j = 0; j < 5; j++) {
      const u = ((j + 0.5) / 5) * e.len, p: Pt = [e.a[0] + e.d[0] * u + e.n[0] * (wallT + 0.15), e.a[1] + e.d[1] * u + e.n[1] * (wallT + 0.15)];
      if (neighbours.some((q) => pointInPoly(p, q))) continue;
      const R = roofOver(parts, p);
      if (R && R.z > 0.05 && R.i >= 0) { hits++; tilt = edgeTilt(R.part.model, R.i); eaves = R.part.sec.eaves; }
    }
    return hits >= 3 ? { tilt, eaves } : null;
  });
  const slopes: RoomSlope[] = [...sl.values()].map(({ part, edge, plan }) => {
    const tilt = edgeTilt(part.model, edge);
    return { part: part.key, edge, planAz: edges(part.poly)[edge].az, tilt, area: (plan * cell) / Math.cos((tilt * Math.PI) / 180) };
  });
  // Dormers stand on the nearest eave of their section; this room takes those whose inside falls in it.
  const dormers: RoomDormer[] = [];
  const seen = new Set<string>();
  for (const part of parts) for (const d of part.sec.dormers ?? []) {
    if (seen.has(d.id)) continue;
    const pl = placeDormer(part, d);
    if (!pl) continue;
    seen.add(d.id);
    const { i: edge, u, e, th, rise, xr, dw } = pl, best = { i: edge, u };
    // The room under the dormer: the first one met walking in from its front (past a knee wall's eaves void if need be).
    const inside = Array.from({ length: 20 }, (_, j) => wallT + 0.1 + ((xr + 0.3) * j) / 19).some((dd) => pointInPoly([e.a[0] + e.d[0] * best.u - e.n[0] * dd, e.a[1] + e.d[1] * best.u - e.n[1] * dd], poly));
    if (!inside) continue;
    const front = dw * rise;
    dormers.push({ d, part: part.key, edge: best.i, planAz: e.az, front, cheeks: xr * rise, roof: xr * dw, window: Math.min(d.window, front * 0.9), vol: 0.5 * xr * rise * dw });
    const s = slopes.find((x) => x.part === part.key && x.edge === best.i);
    if (s) s.area = Math.max(0, s.area - (rise / Math.sin(th)) * dw);
  }
  const slopeCells = [...sl.values()].reduce((a, x) => a + x.plan, 0);
  return { V: vol * cell + dormers.reduce((a, x) => a + x.vol, 0), flatLoft: loft * cell, flatOut: out * cell, unc: (loft + out + slopeCells) * cell, slopes, walls, knee, dormers };
}

/**
 * Where a dormer stands: on the eave of this outline nearest its `at` point (within 1.5 m), `u` m along it, with its rise
 * above the plate, depth into the roof and width. Null when no eave is near or the slope is too shallow for one.
 */
export function placeDormer(part: RoofPart, d: Dormer): { i: number; u: number; e: Edge; th: number; rise: number; xr: number; dw: number; hd: number } | null {
  const pe = edges(part.poly);
  let best = { i: -1, dist: 1.5, u: 0 };
  part.model.planes.forEach(({ i }) => {
    const e = pe[i], u = Math.max(0, Math.min(e.len, (d.at[0] - e.a[0]) * e.d[0] + (d.at[1] - e.a[1]) * e.d[1]));
    const dist = Math.hypot(d.at[0] - e.a[0] - e.d[0] * u, d.at[1] - e.a[1] - e.d[1] * u);
    if (dist < best.dist) best = { i, dist, u };
  });
  if (best.i < 0) return null;
  const e = pe[best.i], th = (edgeTilt(part.model, best.i) * Math.PI) / 180, t = Math.tan(th);
  if (t < 0.1) return null;
  const hd = Math.max(part.plate + 0.3, d.front), rise = hd - part.plate;
  return { i: best.i, u: best.u, e, th, rise, xr: rise / t, dw: Math.max(0.5, Math.min(d.w, e.len - 0.2)), hd };
}

/**
 * The loft: the space between the roof and the flat ceilings under it, and the roof over that space as slopes
 * (true bearing, tilt, m²). Eaves voids behind knee walls are left to the knee walls.
 */
const loftCache = new Map<string, { V: number; slopes: LoftSlope[] }>();
export function loftGeo(h: House): { V: number; slopes: LoftSlope[] } {
  const parts = roofParts(h), key = JSON.stringify([partKey, h.north ?? 0, h.rooms.map((r) => r.ceiling ?? null)]);
  const hit = loftCache.get(key);
  if (hit) return hit;
  if (loftCache.size > 50) loftCache.clear();
  const out = computeLoft(h, parts);
  loftCache.set(key, out);
  return out;
}

function computeLoft(h: House, parts: RoofPart[]): { V: number; slopes: LoftSlope[] } {
  const last = h.storeys.length - 1;
  let V = 0;
  const by = new Map<string, LoftSlope>();
  for (const part of parts) {
    const S = part.storey, st = h.storeys[S], same = parts.filter((p) => p.storey === S);
    const rooms = h.rooms.filter((r) => onStorey(r, S)), up = S < last ? h.rooms.filter((r) => onStorey(r, S + 1)).map(roomPoly) : [];
    const A = polyArea(part.poly), step = Math.max(0.05, Math.min(0.2, Math.sqrt(A) / 80)), cell = step * step;
    const xs = part.poly.map((q) => q[0]), ys = part.poly.map((q) => q[1]);
    for (let x = Math.min(...xs) + step * 0.513; x < Math.max(...xs); x += step) {
      for (let y = Math.min(...ys) + step * 0.491; y < Math.max(...ys); y += step) {
        const p: Pt = [x, y];
        if (!pointInPoly(p, part.poly)) continue;
        const R = roofOver(same, p);
        if (!R || R.part !== part || R.i < 0) continue;
        const r = rooms.find((q) => pointInPoly(p, roomPoly(q)));
        if (r && topStorey(r) > S) continue;
        if (up.some((q) => pointInPoly(p, q))) continue;
        const c = r ? ceilingCap(h, r) : st.h;
        if (!Number.isFinite(c) || R.z - c <= 0.05) continue;
        V += (R.z - c) * cell;
        const k = `${part.key}:${R.i}`, tilt = edgeTilt(part.model, R.i), az = trueBearing(h, edges(part.poly)[R.i].az);
        const s = by.get(k) ?? by.set(k, { az, tilt, area: 0 }).get(k)!;
        s.area += cell / Math.cos((tilt * Math.PI) / 180);
      }
    }
  }
  return { V, slopes: [...by.values()].filter((s) => s.area > EPS) };
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
}

/** A room's outline: its polygon if it has one, else its rectangle (corners clockwise on the plan). */
export const roomPoly = (r: Room): Pt[] => (r.poly && r.poly.length >= 3 ? r.poly : [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]]);
export const roomArea = (r: Room) => (r.poly && r.poly.length >= 3 ? polyArea(r.poly) : r.w * r.d);
const overlapArea = (r: Room, o: Room) => (r.poly || o.poly
  ? overlapAreaPoly(roomPoly(r), roomPoly(o))
  : overlap1(r.x, r.x + r.w, o.x, o.x + o.w) * overlap1(r.y, r.y + r.d, o.y, o.y + o.d));
/** True bearing of a plan bearing (north-up) once the plan is turned by the house's north. */
export const trueBearing = (h: Pick<House, 'north'>, planAz: number) => (((planAz + (h.north ?? 0)) % 360) + 360) % 360;
/** A room's walls in plan: rectangles keep their N/E/S/W ids (and saved face choices); polygons number theirs e0, e1… */
export function roomEdges(r: Room): Array<Edge & { side: Side; id: string; idx: number }> {
  return edges(roomPoly(r)).map((e, i) => ({ ...e, side: compass(e.az), id: r.poly && r.poly.length >= 3 ? `e${i}` : compass(e.az), idx: i }));
}
export const onStorey = (r: Room, s: number) => r.storey <= s && s < r.storey + r.span;
const topStorey = (r: Room) => r.storey + r.span - 1;

/** A window or door's area, never more than its wall: a mistyped size must not swamp the whole house. */
export const openingArea = (o: { w: number; h: number }, wallLen: number, roomH: number) => Math.min(o.w * o.h, wallLen * roomH);

export function roomHeight(h: House, r: Room): number {
  let t = 0;
  for (let s = r.storey; s <= topStorey(r); s++) t += (h.storeys[s]?.h ?? 0) + (s < topStorey(r) ? h.storeys[s]?.zone ?? 0 : 0);
  return t;
}

export function roomVolume(h: House, r: Room): number {
  const rr = roomRoof(h, r);
  if (!rr) return roomArea(r) * roomHeight(h, r);
  const below = roomHeight(h, r) - (h.storeys[topStorey(r)]?.h ?? 0);
  return rr.V + roomArea(r) * below;
}

/**
 * The widest gap between two rooms that can still be a wall between them: the thickest wall build-up in the project, plus a little.
 * (The inside wall's own build-up can't be used: it is only known once the wall has been recognised.)
 */
export const maxWallGap = (h: House) =>
  Math.min(0.6, Math.max(0, ...h.buildups.filter((b) => b.kind === 'wall').map((b) => b.layers.reduce((s, [, mm]) => s + mm, 0) / 1000)) + 0.02);

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Bp: the ground floor's B′, m. junctions: count the floor-to-wall junctions, and note each kind here (unset on a preliminary pass). */
interface Ctx { Bp: number; junctions?: Map<string, Junction> }

/** Every face of a room, with its build-up and U-value. */
export function roomFaces(h: House, r: Room, ctx: Ctx): Face[] {
  const B = (key: string, def: DefaultKey) => {
    const id = h.faceBuildup[key] ?? h.defaults[def];
    return h.buildups.find((b) => b.id === id) ?? h.buildups.find((b) => b.id === h.defaults[def]) ?? h.buildups[0];
  };
  const last = h.storeys.length - 1, faces: Face[] = [], top = topStorey(r);
  const g = roomRoof(h, r), cap = ceilingCap(h, r);
  // Wall height on one edge of one storey: under a roof, walls are as high as the roof where it comes lower than the ceiling.
  const wallH = (e: { side: Side; idx: number }, s: number, external: boolean) => {
    const st = h.storeys[s], full = st.h + (external && s < last ? st.zone : 0);
    if (!g || s !== top) return full;
    const w = g.walls[e.idx];
    return w ? w.full * (Number.isFinite(cap) && r.ceiling != null ? cap : full) + w.low : full;
  };
  const ground = h.storeys[0]?.below ?? 0;
  const floorB = B(`gf:${r.id}`, 'groundFloor');
  const myEdges = roomEdges(r);
  const isPoly = !!(r.poly && r.poly.length >= 3);
  const rh = roomHeight(h, r);
  const doorsDone = new Set<string>();
  const wallGap = maxWallGap(h);
  const trueAz = (az: number) => trueBearing(h, az);
  for (const e of myEdges) {
    // e.side is the plan side (wall identity, saved choices); `side` and `az` are where the wall really faces.
    const az = trueAz(e.az), side = compass(az), ext: Face[] = [];
    const named = isPoly ? `Wall ${e.idx + 1} (${bearingLabel(az)})` : h.north ? bearingLabel(az) : side;
    for (let s = r.storey; s <= top; s++) {
      const st = h.storeys[s];
      if (!st) continue;
      const cuts: Array<[number, number]> = [];
      for (const o of h.rooms) {
        if (o.id === r.id || !onStorey(o, s)) continue;
        for (const f of roomEdges(o)) {
          const span = sharedSpan(e, f, 0.02, wallGap);
          if (!span) continue;
          cuts.push(span);
          const key = `iw:${pairKey(r.id, o.id)}:${s}`, b = B(key, 'intWall');
          // Inside doors between this pair come out of the first stretch of shared wall, on the storey where both rooms exist.
          const doors = s === Math.max(r.storey, o.storey) && !doorsDone.has(key)
            ? h.openings.filter((d) => d.to && ((d.room === r.id && d.to === o.id) || (d.room === o.id && d.to === r.id))) : [];
          doorsDone.add(key);
          const doorA = Math.min(doors.reduce((t, d) => t + openingArea(d, e.len, rh), 0), (span[1] - span[0]) * wallH(e, s, false));
          faces.push({ key, label: `${named} wall`, kind: 'wall', side, az, to: { k: 'room', id: o.id }, area: (span[1] - span[0]) * wallH(e, s, false) - doorA, buildup: b, U: buildupU(b, FILMS.intWall), along: { edge: e.idx, storey: s, t: [span] } });
          for (const d of doors) {
            const db = h.buildups.find((x) => x.id === d.buildup) ?? h.buildups[0];
            faces.push({ key: `op:${d.id}`, label: d.name, kind: 'door', side, az, to: { k: 'room', id: o.id }, area: openingArea(d, e.len, rh), buildup: db, U: buildupU(db, FILMS.intWall) });
          }
        }
      }
      const rest = subtract(0, e.len, cuts), len = rest.reduce((t, [a, b]) => t + b - a, 0);
      if (len <= EPS) continue;
      const key = `w:${r.id}:${e.id}:${s}`, party = h.faceBoundary[key] === 'party';
      const kn = g && s === top ? g.knee[e.idx] : null, knee = !!kn;
      const b = B(key, knee ? 'knee' : 'extWall'), area = len * wallH(e, s, true);
      const what = knee ? 'knee wall (via eaves void)' : 'wall';
      const label = `${isPoly ? `${named}${knee ? `, ${what}` : ''}` : `${named} ${what}`}${r.span > 1 ? ` (${st.name.toLowerCase()})` : ''}`;
      let U = buildupU(b, FILMS.extWall), to: To = party ? { k: 'party' } : { k: 'out' };
      if (kn && !party) {
        // Knee wall and the roof over the eaves void in series: per m² of knee wall the roof is 1/sin(pitch) m².
        const eavesB = B(`ev:${r.id}:${e.id}`, kn.eaves === 'warm' ? 'slope' : 'loftRoof');
        U = 1 / (1 / buildupU(b, FILMS.intWall) + Math.sin((Math.max(10, kn.tilt) * Math.PI) / 180) / buildupU(eavesB, FILMS.roof));
      } else if (s === 0 && ground > 0 && !party) {
        to = { k: 'ground' };
        U = basementWallU(b, Math.min(ground, st.h), floorB);
      }
      ext.push({ key, label, kind: 'wall', side, az, to, area, buildup: b, U, canParty: true, len, along: { edge: e.idx, storey: s, t: rest } });
    }
    // Openings come out of this wall's outside area, shared by area. On a polygon room an opening sits on its
    // chosen wall, or the first wall facing its compass side.
    const ops = h.openings.filter((o) => !o.to && o.room === r.id && (isPoly ? (o.edge ?? myEdges.findIndex((x) => x.side === o.side)) === e.idx : o.side === e.side));
    const gross = ext.reduce((t, f) => t + f.area, 0);
    const opArea = Math.min(gross, ops.reduce((t, o) => t + openingArea(o, e.len, rh), 0));
    for (const f of ext) f.area -= gross > 0 ? opArea * (f.area / gross) : 0;
    faces.push(...ext);
    for (const o of ops) {
      const b = h.buildups.find((x) => x.id === o.buildup) ?? h.buildups[0];
      const shade = SHADING[o.shade ?? 'none']?.[1] ?? 1;
      const gEff = b.kind === 'glazing' && b.g != null ? b.g * (1 - (b.frame ?? 0.3)) * shade : undefined;
      faces.push({ key: `op:${o.id}`, label: o.name, kind: b.kind === 'door' ? 'door' : 'window', side, az, to: ext[0]?.to ?? { k: 'out' }, area: openingArea(o, e.len, rh), buildup: b, U: buildupU(b), gEff });
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
    // The floor-to-wall junctions of a solid slab, spread over the floor: each outside wall on the ground storey, Ψ for its own
    // build-up meeting this room's floor, × its length.
    let lossPerK = 0;
    if (ctx.junctions && ground === 0 && b.floorType !== 'suspended') {
      for (const f of faces) {
        if (f.kind !== 'wall' || f.to.k !== 'out' || !f.key.endsWith(':0') || !f.key.startsWith('w:') || !f.len) continue;
        const psi = junctionPsiFor(h, ctx.Bp, f.buildup, b), key = `${f.buildup.id}|${b.id}`;
        lossPerK += psi * f.len;
        const j = ctx.junctions.get(key) ?? { wall: f.buildup.name, floor: b.name, len: 0, psi };
        j.len += f.len;
        ctx.junctions.set(key, j);
      }
    }
    const junction = A > EPS ? lossPerK / A : 0;
    const groundU = (x: Buildup) => (ground > 0 ? groundFloorU(x, ctx.Bp, ground) : x.floorType === 'suspended' ? suspendedFloorU(x, ctx.Bp, h.suspended.vent, h.suspended.voidH) : groundFloorU(x, ctx.Bp, 0, h.floorEdge) + junction);
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
  // Under a roof the sampled shares are scaled to the exact uncovered area; without one the rest of the ceiling is a flat roof.
  const unc = Math.max(0, A - covered), k = g && g.unc > EPS ? unc / g.unc : 0;
  const zoneShare = (z: FloorZone) => Math.max(0, overlapAreaPoly(z.poly, rp) - above.reduce((t, o) => t + overlapArea3(z.poly, rp, roomPoly(o)), 0));
  const flats: Array<[boolean, number]> = g ? [[true, g.flatLoft * k], [false, g.flatOut * k]] : [[false, unc]];
  for (const [toLoft, flatA] of flats) {
    if (flatA <= EPS) continue;
    const key = toLoft ? `lc:${r.id}` : `fr:${r.id}`, b = B(key, toLoft ? 'loftCeiling' : 'flatRoof');
    const films = toLoft ? FILMS.loftCeiling : FILMS.roof;
    zoned({ key, label: toLoft ? (r.ceiling != null ? 'Flat ceiling (collar) to loft' : 'Ceiling to loft') : 'Flat roof', kind: 'ceiling', to: toLoft ? { k: 'loft' } : { k: 'out' }, tilt: 0, area: flatA, buildup: b, U: buildupU(b, films) },
      top + 1, (z) => (unc > EPS ? (zoneShare(z) / unc) * flatA : 0), (x) => buildupU(x, films));
  }
  if (g) {
    const rlB = h.buildups.find((b) => b.kind === 'glazing') ?? h.buildups[0];
    const rlG = rlB.g != null ? rlB.g * (1 - (rlB.frame ?? 0.3)) : undefined;
    const slopes = g.slopes.map((s) => ({ ...s, area: s.area * k })).filter((s) => s.area > EPS);
    // The rooflight goes in the biggest pitched slope.
    const rlIn = slopes.filter((s) => s.tilt >= 5).reduce<RoomSlope | null>((a, s) => (!a || s.area > a.area ? s : a), null);
    for (const s of slopes) {
      const flat = s.tilt < 5, key = `sl:${r.id}:${s.part}:${s.edge}`, sb = B(key, flat ? 'flatRoof' : 'slope');
      const rl = s === rlIn ? Math.min(Math.max(0, r.rooflight ?? 0), s.area * 0.8) : 0;
      const az = trueAz(s.planAz), side = compass(az);
      faces.push({ key, label: flat ? 'Flat roof' : `${h.north ? bearingLabel(az) : side} roof slope`, kind: 'ceiling', side, az, tilt: s.tilt, to: { k: 'out' }, area: s.area - rl, buildup: sb, U: buildupU(sb, FILMS.roof) });
      if (rl > EPS) faces.push({ key: `rl:${r.id}`, label: 'Rooflight', kind: 'window', az, tilt: s.tilt, to: { k: 'out' }, area: rl, buildup: rlB, U: buildupU(rlB), gEff: rlG });
    }
    for (const d of g.dormers) {
      const az = trueAz(d.planAz), side = compass(az), name = `${h.north ? bearingLabel(az) : side} dormer`, id = d.d.id;
      const wb = B(`dw:${id}`, 'dormerWall'), rb = B(`dr:${id}`, 'dormerRoof');
      faces.push({ key: `dw:${id}`, label: `${name} front`, kind: 'wall', side, az, to: { k: 'out' }, area: d.front - d.window, buildup: wb, U: buildupU(wb, FILMS.extWall) });
      faces.push({ key: `dc:${id}`, label: `${name} cheeks (2)`, kind: 'wall', to: { k: 'out' }, area: d.cheeks, buildup: wb, U: buildupU(wb, FILMS.extWall) });
      faces.push({ key: `dr:${id}`, label: `${name} roof`, kind: 'ceiling', tilt: 0, to: { k: 'out' }, area: d.roof, buildup: rb, U: buildupU(rb, FILMS.roof) });
      if (d.window > EPS) faces.push({ key: `dg:${id}`, label: `${name} window`, kind: 'window', side, az, to: { k: 'out' }, area: d.window, buildup: rlB, U: buildupU(rlB), gEff: rlG });
    }
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
  /** Design outside temperature: your own figure if set, else ToutMcs (the MCS station figure for the percentile and altitude). */
  /** The floor-to-wall junctions by wall and floor build-up, with their Ψ, W/mK, as used (set, entered or calculated). */
  junctions: Junction[];
  /** Their Ψ averaged over the length of wall, W/mK (0 with none). */
  junctionPsi: number;
  Tout: number; ToutMcs: number; Tg: number; hdd: number; hddKnown: boolean; station: string; region: string;
  rooms: RoomResult[];
  /** The loft: its temperature, floor area and volume, and the roof over it as slopes (true bearing, tilt, m²) of U-value `U`. */
  loft: { T: number; area: number; V: number; U: number; slopes: LoftSlope[] } | null;
  q50: number; n50: number; envelope: number; heatedV: number; heatedA: number;
  peakW: number; paths: Array<{ label: string; W: number }>;
  htc: number; hlp: number; annualKWh: number;
  /** Set by yearRes: annualKWh, months and running costs come from a typical-year run, or are a scaled estimate while it runs. Unset: degree days. */
  annualFrom?: 'estimate' | 'year';
  /** By month: heat, outside and flow temperature, heat per kWh bought (COP or boiler efficiency), kWh bought. */
  months: Array<{ heat: number; Tout: number; flow: number; eff: number; bought: number }>;
  /** Heat source: heat per kWh bought on the design day and over the year, kWh bought, £/yr (standing charge included), kgCO2/yr, spare capacity. */
  hp: { designEff: number; seasonal: number; kwh: number; spare: number; cost: number; co2: number };
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

/** Share `f` of the ideal (Carnot) COP between refrigerant temperatures: condensing 5 K above flow, evaporating at `Tev`. */
const carnotCop = (flow: number, Tev: number, f: number) => (f * (flow + 5 + 273.15)) / Math.max(3, flow + 5 - Tev);

export type HeatSource = 'boiler' | 'condensing' | 'ashp' | 'gshp';
export type Fuel = 'gas' | 'oil' | 'lpg';
export const SOURCE_LABEL: Record<HeatSource, string> = { boiler: 'Boiler, non-condensing', condensing: 'Condensing boiler', ashp: 'Air-to-water heat pump', gshp: 'Ground-to-water heat pump' };
export const FUEL_LABEL: Record<Fuel, string> = { gas: 'Mains gas', oil: 'Heating oil', lpg: 'LPG' };
export const isHeatPump = (s: HeatSource) => s === 'ashp' || s === 'gshp';
/**
 * Typical design flow and flow−return drop for each source: an old boiler at 82/71 °C, a condensing boiler at 70/50 °C
 * (the return low enough to condense), a heat pump at 45 °C with a 5 K drop (the MCS range is 35–55 °C).
 */
export const SOURCE_FLOW: Record<HeatSource, { maxFlow: number; dT: number }> = {
  boiler: { maxFlow: 80, dT: 11 }, condensing: { maxFlow: 70, dT: 20 }, ashp: { maxFlow: 45, dT: 5 }, gshp: { maxFlow: 45, dT: 5 },
};
/** Switch the heat source, with that source's typical flow temperature and flow−return drop (edits h in place). */
export function setSource(h: House, s: HeatSource): void {
  h.hp.source = s;
  h.hp.maxFlow = SOURCE_FLOW[s].maxFlow;
  h.heating.dT = SOURCE_FLOW[s].dT;
}
/** Heat per kWh bought as text: COP for a heat pump, % for a boiler. */
export const effText = (s: HeatSource, e: number) => (isHeatPump(s) ? `COP ${e.toFixed(2)}` : `${Math.round(e * 100)}%`);

/** Ground loop brine: a few degrees under the ground temperature, coldest in March, warmest in September (month 0–11). */
export const brineTemp = (Tg: number, month: number) => Tg - 5 + 3 * Math.cos((2 * Math.PI * (month - 8)) / 12);

/**
 * Condensing boiler gross efficiency from return water temperature: fully condensing at 30 °C return or below,
 * falling to 86% at the flue gas dew point (gas 55, LPG 50, oil 47 °C) and above.
 * shortcut: return is flow minus the design drop at every load; real part-load returns run cooler.
 */
const CONDENSING: Record<Fuel, { dew: number; max: number }> = { gas: { dew: 55, max: 96 }, lpg: { dew: 50, max: 94 }, oil: { dew: 47, max: 93 } };
export function condensingEff(fuel: Fuel, ret: number): number {
  const { dew, max } = CONDENSING[fuel];
  return (ret <= 30 ? max : ret >= dew ? 86 : max - ((max - 86) * (ret - 30)) / (dew - 30)) / 100;
}

/** One datasheet test point: source temperature (outside air, or brine for ground source), flow temperature, COP. A7/W35 → 7, 35. */
export interface SheetPoint { src: number; flow: number; cop: number }
export interface HeatPumpSheet { source: 'ashp' | 'gshp'; model: string; points: SheetPoint[] }

/** The model's COP at a source temperature with performance factor 1 (before the 7 cap). */
const idealCop = (source: 'ashp' | 'gshp', flow: number, src: number) =>
  source === 'gshp' ? carnotCop(flow, src - 4, 1) : carnotCop(flow, src - 6, 1) * (src > -4 && src < 6 ? 0.93 : 1);

/** Performance factor that reproduces a datasheet point exactly. */
export const pointFactor = (source: 'ashp' | 'gshp', p: SheetPoint) => p.cop / idealCop(source, p.flow, p.src);

/**
 * Performance factor at source temperature `src` from a datasheet: each point's own factor, averaged where points share a
 * source temperature, straight-line between source temperatures and held level beyond the ends. Null with no usable point.
 */
export function sheetFactor(sheet: HeatPumpSheet, src: number): number | null {
  const by = new Map<number, number[]>();
  for (const p of sheet.points) if (p.cop > 0 && Number.isFinite(p.src) && Number.isFinite(p.flow) && p.flow + 5 - p.src > 3) by.set(p.src, [...(by.get(p.src) ?? []), pointFactor(sheet.source, p)]);
  const pts = [...by].map(([t, fs]) => [t, fs.reduce((a, b) => a + b, 0) / fs.length] as const).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;
  if (src <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (src <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (src - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
  return pts[pts.length - 1][1];
}

/** The datasheet in use for this heat source, if any. */
export const activeSheet = (hp: House['hp']) => (hp.sheet && hp.sheet.source === hp.source && sheetFactor(hp.sheet, 0) != null ? hp.sheet : null);

/** Heat per kWh bought at system flow `flow` and outside `Te`, in month 0–11 (ground temperature Tg for ground source). */
export function sourceEff(h: Pick<House, 'hp' | 'heating'>, flow: number, Te: number, Tg: number, month: number): number {
  const s = h.hp.source;
  if (s === 'boiler') return (h.hp.boilerEff || 80) / 100;
  if (s === 'condensing') return condensingEff(h.hp.fuel, flow - h.heating.dT);
  const src = s === 'gshp' ? brineTemp(Tg, month) : Te, sheet = activeSheet(h.hp);
  return Math.min(7, idealCop(s, flow, src) * ((sheet && sheetFactor(sheet, src)) ?? h.hp.hpFactor));
}

/** What the source buys: unit price p/kWh, the standing charge that goes with it £/yr, and carbon kgCO2/kWh. */
export function tariff(hp: House['hp']): { p: number; standing: number; co2: number } {
  if (isHeatPump(hp.source)) return { p: hp.elecP, standing: 0, co2: hp.co2.elec };
  const p = hp.fuel === 'oil' ? hp.oilP : hp.fuel === 'lpg' ? hp.lpgP : hp.gasP;
  return { p, standing: hp.fuel === 'gas' && hp.gasStanding ? (hp.gasSC * 365) / 100 : 0, co2: hp.co2[hp.fuel] };
}

export interface LoftSlope { az: number; tilt: number; area: number }

export function calcHouse(h: House): HouseResult {
  const cl = climateOf(h);
  const ToutMcs = designTemp(cl.station, h.climate.altitude, h.climate.pct);
  const Tout = Number.isFinite(h.climate.designT) ? h.climate.designT! : ToutMcs;
  const reg = MCS_MEAN_TEMPS[cl.region] ?? MCS_MEAN_TEMPS[0], Tg = reg[4];
  const area = postcodeArea(h.climate.postcode), hddKnown = area in MCS_HDD, hdd = MCS_HDD[area] ?? 2200;
  const checks: HouseResult['checks'] = [];

  // Ground floor shape factor B' = A / (0.5 P), P = exposed perimeter of the ground storey (party walls excluded).
  const ground = h.rooms.filter((r) => r.storey === 0);
  const pre = ground.flatMap((r) => roomFaces(h, r, { Bp: 1 }));
  const P = pre.filter((f) => f.kind === 'wall' && (f.to.k === 'out' || f.to.k === 'ground') && f.key.startsWith('w:') && f.key.endsWith(':0')).reduce((t, f) => t + (f.len ?? 0), 0);
  const gA = ground.reduce((t, r) => t + roomArea(r), 0);
  const Bp = P > EPS ? gA / (0.5 * P) : 1000;
  const ctx = { Bp, junctions: new Map<string, Junction>() };

  const faces = new Map(h.rooms.map((r) => [r.id, roomFaces(h, r, ctx)]));
  const junctions = [...ctx.junctions.values()], jLen = junctions.reduce((t, j) => t + j.len, 0);
  const junctionPsi = jLen > EPS ? junctions.reduce((t, j) => t + j.psi * j.len, 0) / jLen : 0;
  const T: Record<string, number> = {};
  for (const r of h.rooms) T[r.id] = r.heated ? r.setpoint : (r.setpoint + Tout) / 2;
  const loftFaces = h.rooms.flatMap((r) => (faces.get(r.id) ?? []).filter((f) => f.to.k === 'loft').map((f) => ({ ...f, to: { k: 'room', id: r.id } as To })));
  const loftA = loftFaces.reduce((t, f) => t + f.area, 0), hasLoft = loftA > EPS;
  const lg = hasLoft ? loftGeo(h) : { V: 0, slopes: [] };
  // A loft whose roof slopes found no sample (a sliver) still gets a roof the size of its floor.
  const slopes = lg.slopes.length ? lg.slopes : [{ az: trueBearing(h, 180), tilt: 0, area: loftA }];
  const loftV = Math.max(lg.V, loftA * 0.1), loftRoofA = slopes.reduce((t, s) => t + s.area, 0);
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
  // Degree-day estimate of the whole design loss, ground loss included: a quick stand-in until the typical-year run (yearRes) is in.
  const wts = MEAN.map((m, i) => Math.max(0, 15.5 + (h.calib?.dt ?? 0) - m) * DAYS[i]), wsum = wts.reduce((a, b) => a + b, 0) || 1;
  // Calibration: warmer rooms raise the degree-day base; part-heated houses use a share of it.
  const ddRatio = h.calib ? wsum / (MEAN.reduce((a, m, i) => a + Math.max(0, 15.5 - m) * DAYS[i], 0) || 1) : 1;
  const annualKWh = ((htc * hdd * 24) / 1000) * ddRatio * (h.calib?.hf ?? 1);
  const needs = hr.map((x) => ({ room: x.room, need: x.totalW }));
  const flowAt = (Te: number) => systemFlow(h, needs, Tout, Te);
  const effAt = (Te: number, m: number) => sourceEff(h, flowAt(Te), Te, Tg, m);
  const designFlow = flowAt(Tout);
  const emitRooms = hr.map((x) => {
    const has = h.heating.emitters.some((e) => e.room === x.room.id);
    const out = roomOut(h, x.room.id, designFlow, x.room.setpoint);
    return { id: x.room.id, need: x.totalW, out, cover: x.totalW > 0 ? out / x.totalW : Infinity, req: flowNeeded(h, x.room.id, x.totalW, x.room.setpoint), has };
  });
  const gov = emitRooms.filter((e) => e.has).reduce<(typeof emitRooms)[number] | null>((a, e) => (!a || e.req > a.req ? e : a), null);
  const months = MEAN.map((m, i) => {
    const heat = (annualKWh * wts[i]) / wsum, eff = effAt(m, i);
    return { heat, Tout: m, flow: flowAt(m), eff, bought: heat / eff };
  });
  const kwh = months.reduce((t, m) => t + m.bought, 0), tf = tariff(h.hp);
  const hp = {
    // The design day is in January; ground loops are coldest in March.
    designEff: effAt(Tout, h.hp.source === 'gshp' ? 2 : 0), seasonal: kwh > EPS ? annualKWh / kwh : 0, kwh,
    spare: peakW > EPS ? (h.hp.capacity * 1000) / peakW - 1 : 0,
    cost: (kwh * tf.p) / 100 + tf.standing, co2: kwh * tf.co2,
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
    // A room that shares no wall with any other is costed as a building of its own, usually by mistake.
    if (h.rooms.some((o) => o.id !== r.id && onStorey(o, r.storey)) && !faces.get(r.id)?.some((f) => f.kind === 'wall' && f.to.k === 'room')) {
      checks.push({ level: 'warn', text: `${r.name} doesn't touch any other room on the ${h.storeys[r.storey]?.name.toLowerCase() ?? 'storey'}, so all its walls count as outside walls. Move it against the house if it's part of it.` });
    }
    // Openings must sit on outside wall: check each wall that has any.
    const es = roomEdges(r), isPoly = !!(r.poly && r.poly.length >= 3);
    for (const e of es) {
      const mine = h.openings.filter((o) => o.room === r.id && (isPoly ? (o.edge ?? es.findIndex((x) => x.side === o.side)) === e.idx : o.side === e.side));
      for (const o of mine) if (o.w > e.len + 0.01 || o.h > roomHeight(h, r) + 0.01) checks.push({ level: 'warn', text: `${r.name}: ${o.name} is ${o.w} × ${o.h} m, bigger than its wall; it is counted at no more than the wall's ${(e.len * roomHeight(h, r)).toFixed(1)} m².` });
      const ops = mine.filter((o) => !o.to);
      if (!ops.length) continue;
      const wall = (faces.get(r.id) ?? []).filter((f) => f.kind === 'wall' && f.key.startsWith(`w:${r.id}:${e.id}:`)).reduce((t, f) => t + f.area, 0);
      if (wall < 0.05) checks.push({ level: 'error', text: `${r.name}: ${ops.map((o) => o.name).join(', ')} on ${isPoly ? `wall ${e.idx + 1}` : `the ${e.side} side`}, which has no outside wall left.` });
    }
  }
  if (!hddKnown) checks.push({ level: 'warn', text: `Postcode area "${area || h.climate.postcode}" not in the MCS degree-day table; using 2,200 K·day.` });
  if (v.mech === 'mvhr' && q50 > 5) checks.push({ level: 'warn', text: `MVHR with q50 ${q50.toFixed(1)}: above 5 m³/h·m² most of the heat recovery is lost to leakage.` });
  if (hp.spare < 0) checks.push({ level: 'warn', text: `${SOURCE_LABEL[h.hp.source]} is ${Math.round(-hp.spare * 100)}% short of the design heat loss.` });
  const offZones = new Map<string, string[]>();
  for (const e of emitRooms) {
    const room = h.rooms.find((r) => r.id === e.id), name = room?.name ?? e.id, src = room && scheduleSource(h, room);
    if (!e.has) checks.push({ level: 'warn', text: `${name} is set as heated but has no emitter, so the hour-by-hour runs give it no heat. Add one under Heating › Emitters, or mark the room unheated.` });
    else if (src?.kind === 'off') offZones.set(src.zone!.name, [...(offZones.get(src.zone!.name) ?? []), name]);
    else if (e.cover < 0.995) checks.push({ level: 'warn', text: `${name}: emitters give ${Math.round(e.out)} W at ${designFlow.toFixed(0)} °C flow, ${Math.round(e.need)} W needed (${Math.round(e.cover * 100)}%).` });
  }
  offZones.forEach((names, zone) => checks.push({ level: 'warn', text: `Heating zone “${zone}” is switched off, so the hour-by-hour runs give no heat to ${names.join(', ')}.` }));

  for (const e of h.heating.emitters) {
    if (e.kind === 'ufh' && loopLength(e, h) > loopMax(e)) checks.push({ level: 'warn', text: `UFH loop in ${h.rooms.find((r) => r.id === e.room)?.name ?? e.room} is ${Math.round(loopLength(e, h))} m; keep ${e.pipe ?? 16} mm loops under ${loopMax(e)} m (split it in two, or use wider pipe or spacing).` });
    if (e.kind === 'ufh' && e.rect) {
      const room = h.rooms.find((r) => r.id === e.room);
      const rp: Pt[] = [[e.rect.x, e.rect.y], [e.rect.x + e.rect.w, e.rect.y], [e.rect.x + e.rect.w, e.rect.y + e.rect.h], [e.rect.x, e.rect.y + e.rect.h]];
      if (room && overlapAreaPoly(rp, roomPoly(room)) < e.rect.w * e.rect.h * 0.98) checks.push({ level: 'warn', text: `UFH loop in ${room.name} runs outside the room.` });
    }
  }

  return {
    junctions, junctionPsi, Tout, ToutMcs, Tg, hdd, hddKnown, station: MCS_STATIONS[cl.station]?.[0] ?? '?', region: reg[0], climate: cl,
    rooms, loft: hasLoft ? { T: T.loft, area: loftA, V: loftV, U: roofU, slopes } : null,
    q50, n50, envelope, heatedV, heatedA, peakW, paths, htc, hlp: heatedA > EPS ? htc / heatedA : 0, annualKWh, months, hp, checks,
    heat: { designFlow, rooms: emitRooms, gov: gov ? { id: gov.id, req: gov.req } : null },
  };
}
