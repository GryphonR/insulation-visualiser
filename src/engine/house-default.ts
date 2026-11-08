import { MAT, PRESETS, canonId } from './data';
import { sharedSpan } from './geom';
import { calcHouse, maxWallGap, roomEdges, roomFaces } from './house';
import type { Buildup, Device, Dormer, House, Opening, Room, RoofSection, Side } from './house';

/** A pitched roof over the top storey that follows the rooms: gable, ridge along the longer side, on the wall plate. */
export const mainRoof = (pitch = 35): RoofSection => ({ id: 'roof', name: 'Main roof', form: 'gable', pitch, eaves: 'cold', dormers: [] });
import { autoEmitters } from './house-heating';
import type { Emitter, RadType } from './house-heating';

const preset = (id: string) => PRESETS.find((p) => p.id === id)?.layers ?? [];

export const DEFAULT_BUILDUPS: Buildup[] = [
  { id: 'cav', name: 'Cavity wall, PIR filled', kind: 'wall', layers: preset('cavity_new') },
  { id: 'solid', name: 'Solid brick, 225 mm', kind: 'wall', layers: preset('solid') },
  { id: 'stud', name: 'Stud partition', kind: 'wall', layers: [['pb', 12.5], ['cavity', 75], ['pb', 12.5]] },
  { id: 'sf', name: 'Solid floor, 75 mm PIR', kind: 'floor', layers: [['m_concrete_reinforced', 100], ['pir', 75], ['m_cement_sand', 65]] },
  { id: 'jf', name: 'Timber joist floor', kind: 'floor', layers: [['pb', 12.5], ['cavity', 150], ['m_timber_500_kg_m', 20]] },
  { id: 'loft', name: 'Cold roof ceiling, 270 mm loft', kind: 'roof', layers: preset('cold270') },
  { id: 'tiles', name: 'Pitched roof, tiles on felt', kind: 'roof', layers: [['m_roof_tile_concrete', 15]] },
  { id: 'flat', name: 'Lightweight timber flat roof', kind: 'roof', layers: preset('roofl') },
  // Layers run outside → inside, as everywhere in the app.
  { id: 'slope', name: 'Rafters, 100 mm mineral wool', kind: 'roof', layers: [['m_roof_tile_concrete', 15], ['vgap', 50], ['mw', 100], ['pb', 12.5]] },
  { id: 'knee', name: 'Knee wall, stud with 75 mm mineral wool', kind: 'wall', layers: [['pb', 12.5], ['mw', 75], ['pb', 12.5]] },
  { id: 'dwall', name: 'Dormer, timber frame 75 mm mineral wool', kind: 'wall', layers: [['m_timber_500_kg_m', 20], ['ply', 18], ['mw', 75], ['pb', 12.5]] },
  { id: 'droof', name: 'Dormer flat roof, 50 mm between joists', kind: 'roof', layers: [['ply', 18], ['cavity', 100], ['mw', 50], ['pb', 12.5]] },
  { id: 'dg', name: 'Double glazed, 2010', kind: 'glazing', layers: [], u: 1.4, g: 0.63, frame: 0.3 },
  { id: 'door', name: 'Composite door', kind: 'door', layers: [], u: 1.6 },
  // Whole-door U between two rooms, inside films included.
  { id: 'idoor', name: 'Internal door, hollow core', kind: 'door', layers: [], u: 2.2 },
];

const R = (id: string, name: string, type: Room['type'], storey: number, x: number, y: number, w: number, d: number, setpoint: number, extra: Partial<Room> = {}): Room =>
  ({ id, name, type, storey, span: 1, x, y, w, d, heated: true, setpoint, ach: 1, ...extra });

const ROOMS: Room[] = [
  R('living', 'Living room', 'living', 0, 0, 0, 4.5, 4.5, 21),
  R('kitchen', 'Kitchen', 'kitchen', 0, 4.5, 0, 4.5, 3.6, 21),
  R('dining', 'Dining', 'dining', 0, 0, 4.5, 4.5, 2.5, 21),
  R('hall', 'Hall & landing', 'hall', 0, 4.5, 3.6, 1.8, 3.4, 18, { span: 2 }),
  R('wc', 'WC', 'wc', 0, 6.3, 3.6, 2.7, 1.4, 18),
  R('utility', 'Utility', 'utility', 0, 6.3, 5.0, 2.7, 2.0, 18, { heated: false, ach: 2 }),
  R('bed1', 'Bedroom 1', 'bedroom', 1, 0, 0, 4.5, 4.5, 21),
  R('bed2', 'Bedroom 2', 'bedroom', 1, 4.5, 0, 4.5, 3.6, 21),
  R('bed3', 'Bedroom 3', 'bedroom', 1, 0, 4.5, 4.5, 2.5, 21),
  R('bath', 'Bathroom', 'bathroom', 1, 6.3, 3.6, 2.7, 3.4, 22),
];

let n = 0;
const W = (room: string, side: Opening['side'], w: number, h: number, buildup = 'dg', name?: string): Opening =>
  ({ id: `o${++n}`, room, side, name: name ?? (buildup === 'door' ? 'Door' : 'Window'), w, h, buildup });
const OPENINGS: Opening[] = [
  W('living', 'N', 2.4, 1.5), W('living', 'W', 1.9, 1.5), W('kitchen', 'N', 2.0, 1.2), W('kitchen', 'E', 0.9, 2.1, 'door', 'Back door'),
  W('dining', 'S', 2.0, 1.5), W('dining', 'W', 1.0, 1.2), W('hall', 'S', 0.9, 2.1, 'door', 'Front door'), W('hall', 'S', 0.6, 1.0),
  W('wc', 'E', 0.5, 0.8), W('bed1', 'N', 1.6, 1.25), W('bed1', 'W', 1.2, 1.25), W('bed2', 'N', 1.5, 1.2),
  W('bed3', 'S', 1.5, 1.2), W('bed3', 'W', 1.0, 1.2), W('bath', 'E', 0.8, 1.0),
];

const D = (id: string, room: string, name: string, fan: boolean, opts: Array<[string, number]>, pick: number): Device => ({ id, room, name, fan, opts, pick });
// SAP 10.2 Table 2.1 allowances, m³/h
export const CHIMNEY: Array<[string, number]> = [['Open', 80], ['Blocked (boarded fireplace)', 20], ['Closed fire', 10], ['Removed / sealed', 0]];
export const FAN: Array<[string, number]> = [['Fitted', 10], ['None', 0]];

const hours = (on: number[]) => Array.from({ length: 24 }, (_, h) => (on.includes(h) ? 1 : 0));

/** Inside doors, each in the middle of the wall its two rooms share. */
export function addInnerDoors(h: House, pairs: Array<[string, string]>, w = 0.76, ht = 1.98) {
  const gap = maxWallGap(h);
  for (const pair of pairs) {
    // Owned by the room with fewer storeys: the plan draws a room's doors on every storey it spans.
    const [r, o] = pair.map((id) => h.rooms.find((x) => x.id === id)!).sort((x, y) => x.span - y.span), a = r.id, b = o.id;
    const both = r.storey < o.storey + o.span && o.storey < r.storey + r.span;
    const hit = both ? roomEdges(r).flatMap((e) => roomEdges(o).map((f) => ({ e, s: sharedSpan(e, f, 0.02, gap) }))).find((x) => x.s && x.s[1] - x.s[0] >= w) : undefined;
    if (!hit?.s) throw new Error(`${a} and ${b} share no wall wide enough for a door`);
    h.openings.push({ id: `d-${a}-${b}`, room: a, to: b, side: hit.e.side, edge: hit.e.idx, name: `Door to ${o.name.toLowerCase()}`, w, h: ht, buildup: 'idoor', t: (hit.s[0] + hit.s[1]) / 2 });
  }
}

export function defaultHouse(): House {
  const h = baseHouse();
  // Through lounge: the living room opens to the hall and to the dining room.
  addInnerDoors(h, [['hall', 'living'], ['hall', 'dining'], ['hall', 'kitchen'], ['hall', 'wc'], ['hall', 'utility'], ['living', 'dining'],
    ['hall', 'bed1'], ['hall', 'bed2'], ['hall', 'bed3'], ['hall', 'bath']]);
  return h;
}

function baseHouse(): House {
  return {
    v: 1,
    name: 'Demo house, 1950–66',
    storeys: [{ name: 'Ground floor', h: 2.4, zone: 0.25 }, { name: 'First floor', h: 2.4, zone: 0.25 }],
    rooms: ROOMS.map((r) => ({ ...r })),
    openings: OPENINGS.map((o) => ({ ...o })),
    buildups: DEFAULT_BUILDUPS.map((b) => ({ ...b, layers: b.layers.map(([m, t]) => [m, t] as [string, number]) })),
    defaults: {
      extWall: 'cav', intWall: 'stud', groundFloor: 'sf', intFloor: 'jf', loftCeiling: 'loft', loftRoof: 'tiles', flatRoof: 'flat', exposedFloor: 'jf',
      slope: 'slope', knee: 'knee', dormerWall: 'dwall', dormerRoof: 'droof',
    },
    suspended: { vent: 1500, voidH: 0.3 },
    faceBuildup: { 'w:bed3:S:1': 'solid', 'w:bath:E:1': 'solid' },
    faceBoundary: {},
    wallAlign: {},
    neighbourT: 10,
    roofs: [mainRoof()],
    loft: { ach: 4 },
    climate: { station: 7, pct: '99', altitude: 60, region: 16, postcode: 'M14' },
    vent: {
      method: 'model', source: 'est', q50: 10.5, mech: 'none', mechFlow: 120, eta: 88, minAch: true,
      factors: [
        { id: 'base', label: 'Age-band default, 1950–66', dq: 13, on: true },
        { id: 'fill', label: 'Cavity filled', dq: -2, on: true },
        { id: 'win', label: 'Replacement double glazing', dq: -2.5, on: true },
        { id: 'floor', label: 'Gaps at skirting and floor edges', dq: 1.5, on: true },
        { id: 'hatch', label: 'Loft hatch not sealed', dq: 0.5, on: true },
        { id: 'strip', label: 'Doors draught-stripped', dq: -1.5, on: false },
        { id: 'serv', label: 'Service holes sealed', dq: -1, on: false },
      ],
      devices: [
        D('chim', 'living', 'Chimney', false, CHIMNEY, 1),
        D('kfan', 'kitchen', 'Extract fan', true, FAN, 0),
        D('bfan', 'bath', 'Extract fan', true, FAN, 0),
        D('wfan', 'wc', 'Extract fan', true, FAN, 0),
        D('back', 'kitchen', 'Back door, used often', false, [['Unsealed', 4.9], ['Draught-stripped', 2]], 0),
        D('front', 'hall', 'Front door, letterbox', false, [['As found', 14], ['Brushed + sealed', 3]], 0),
      ],
    },
    // Electricity and gas: Ofgem cap 1 Oct – 31 Dec 2026. Oil and LPG: rough typical UK delivered prices per kWh.
    // Carbon: SAP 10.2 factors, kgCO2/kWh. Reasons for each figure are shown in the UI (src/ui/assumptions.tsx).
    hp: {
      source: 'ashp', fuel: 'gas', capacity: 6, maxFlow: 45, elecP: 26.32, gasP: 7.97, gasSC: 29.68, gasStanding: false, oilP: 6.5, lpgP: 9.5, boilerEff: 85, hpFactor: 0.45,
      co2: { elec: 0.136, gas: 0.21, oil: 0.298, lpg: 0.241 },
    },
    gains: {
      people: 3, pattern: 'work', setback: 16, mass: 165, g: 0.45,
      living: hours([6, 7, 8, 16, 17, 18, 19, 20, 21, 22]),
      bedrooms: hours([6, 7, 21, 22]),
    },
    heating: {
      control: 'ideal', curveDesign: 45, curve15: 30, dT: 5, minFlow: 7,
      zones: [
        { id: 'z1', name: 'Living areas', kind: 'rad', color: '#c2410c', on: true, hours: null, blend: 0 },
        { id: 'z2', name: 'Bedrooms', kind: 'rad', color: '#1f6fb5', on: true, hours: null, blend: 0 },
        { id: 'z3', name: 'Bathroom', kind: 'rad', color: '#1f7a4d', on: true, hours: null, blend: 0 },
      ],
      emitters: [
        E('R1', 'living', 'z1', 'K2', 1400), E('R2', 'kitchen', 'z1', 'K2', 800), E('R3', 'hall', 'z1', 'K1', 600),
        { ...E('R4', 'wc', 'z1', 'K1', 500), kind: 'towel', rated: 860 }, E('R5', 'dining', 'z1', 'K2', 1200),
        E('R6', 'bed1', 'z2', 'K2', 1200), E('R7', 'bed2', 'z2', 'K2', 1200), E('R8', 'bed3', 'z2', 'K2', 800),
        { ...E('R9', 'bath', 'z3', 'K1', 800), kind: 'towel', rated: 1440 },
      ],
    },
  };
}

function E(id: string, room: string, zone: string, type: RadType, len: number): Emitter {
  return { id, room, kind: 'radiator', zone, type, len, height: 600, rated: 0, area: 0, spacing: 150, cover: 'Tiles', tail: 5 };
}

/** Fill in anything an older save lacks (new settings, default build-ups, emitters) and drop layers whose material is gone. */
export function upgradeHouse(p: House): House {
  if (!Array.isArray(p.roofs)) p = roofsFromLoft(p);
  const d = defaultHouse();
  const h: House = {
    ...d, ...p, vent: { ...d.vent, ...p.vent }, loft: { ...d.loft, ...p.loft }, climate: { ...d.climate, ...p.climate }, hp: { ...d.hp, ...p.hp, co2: { ...d.hp.co2, ...p.hp?.co2 } },
    gains: { ...d.gains, ...p.gains }, suspended: { ...d.suspended, ...p.suspended }, defaults: { ...d.defaults, ...p.defaults }, heating: p.heating,
  };
  h.buildups = h.buildups.map((b) => ({ ...b, layers: (b.layers ?? []).filter(([m, t]) => !!MAT[m] && Number.isFinite(t) && t > 0).map(([m, t]) => [canonId(m), t] as [string, number]) }));
  for (const id of Object.values(h.defaults)) {
    if (!h.buildups.some((b) => b.id === id)) { const b = d.buildups.find((x) => x.id === id); if (b) h.buildups.push(b); }
  }
  return withHeating(h);
}

type OldDormer = { w: number; front: number; window: number } | null;
type OldShape = {
  edges?: Array<{ side: string; eaves: 'cold' | 'warm'; dormer: OldDormer }>; axis: 'ew' | 'ns'; sides: [string, string];
  pitch: number; knee: number; ceiling: number; eaves: ['cold' | 'warm', 'cold' | 'warm']; dormers: [OldDormer, OldDormer]; rooflight: number;
};
type OldLoft = { present?: boolean; ach?: number; pitch?: number; form?: 'gable' | 'hip' | 'mono'; ridge?: 'x' | 'y'; facing?: Side };

/**
 * A house saved before roof sections: one roof over the top storey from the old loft settings, or (with rooms in the roof)
 * from the first sloped room's pitch, knee and ridge. Rooms keep their collar height and rooflight; dormers move onto the roof;
 * slope and eaves build-up choices carry over to the new faces.
 */
export function roofsFromLoft(p0: House): House {
  const p = structuredClone(p0) as House & { loft: OldLoft };
  const loft = p.loft ?? {}, rooms = p.rooms as Array<Room & { shape?: OldShape }>, last = p.storeys.length - 1;
  const shaped = rooms.filter((r) => r.shape && r.storey + r.span - 1 === last);
  const roofs: RoofSection[] = [];
  if (loft.present !== false || shaped.length) {
    const sec = mainRoof(loft.pitch ?? 35);
    if (loft.form) sec.form = loft.form;
    if (loft.ridge) sec.ridge = loft.ridge;
    if (loft.facing) sec.facing = loft.facing;
    const first = shaped[0]?.shape;
    if (first) {
      sec.pitch = first.pitch;
      if (first.sides.some((s) => s !== 'full')) sec.plate = Math.max(0, first.knee);
      sec.eaves = first.edges?.[0]?.eaves ?? first.eaves?.[0] ?? 'cold';
      if (first.edges) sec.form = 'hip';
      else {
        const sloped = first.sides.map((s) => s !== 'full'), slopeSides: [Side, Side] = first.axis === 'ew' ? ['W', 'E'] : ['N', 'S'];
        if (sloped[0] && sloped[1]) { sec.form = 'gable'; sec.ridge = first.axis === 'ew' ? 'y' : 'x'; }
        else { sec.form = 'mono'; sec.facing = slopeSides[sloped[0] ? 0 : 1]; }
      }
    }
    // Dormers stand at the middle of the wall they were on.
    const dormers: Dormer[] = [];
    for (const r of shaped) {
      const sh = r.shape!, es = roomEdges(r);
      const put = (wall: number, d: OldDormer) => { const e = es[wall]; if (d && e) dormers.push({ id: `dm-${r.id}-${wall}`, at: [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], w: d.w, front: d.front, window: d.window }); };
      if (sh.edges && r.poly) sh.edges.forEach((x, i) => put(i, x.dormer));
      else (sh.axis === 'ew' ? ['W', 'E'] : ['N', 'S']).forEach((side, i) => put(es.findIndex((e) => e.side === side), sh.dormers?.[i] ?? null));
    }
    sec.dormers = dormers;
    roofs.push(sec);
  }
  const old: Record<string, string> = {};
  for (const r of rooms) {
    const sh = r.shape;
    delete r.shape;
    if (!sh) continue;
    if (sh.ceiling > 0 && sh.ceiling < (p.storeys[r.storey + r.span - 1]?.h ?? 2.4) - 0.01) r.ceiling = sh.ceiling;
    if (sh.rooflight > 0) r.rooflight = sh.rooflight;
  }
  // Old slope, eaves and dormer choices were per room wall: keep each room's first one for its new faces.
  for (const k of Object.keys(p.faceBuildup ?? {})) {
    const m = k.match(/^(sl|ev|dw|dr):([^:]+):\d+$/);
    if (!m) continue;
    old[`${m[1]}:${m[2]}`] ??= p.faceBuildup[k];
    delete p.faceBuildup[k];
  }
  p.roofs = roofs;
  p.loft = { ach: loft.ach ?? 4 };
  // Best effort: a save too old to cost its faces just loses those choices, not the project.
  if (Object.keys(old).length) try {
    for (const r of p.rooms) {
      for (const f of roomFaces(p, r, { Bp: 1 })) {
        const kind = f.key.split(':')[0], id = kind === 'dw' || kind === 'dr' ? f.key.slice(3).replace(/^dm-([^-]+)-\d+$/, '$1') : r.id;
        const was = old[`${kind}:${id}`];
        if (was && ['sl', 'ev', 'dw', 'dr'].includes(kind)) p.faceBuildup[f.key] ??= was;
      }
    }
  } catch { /* keep the converted house without the old choices */ }
  return p;
}

/** A house saved before emitters existed: one radiator per heated room, sized for the design loss. */
export function withHeating(h: House): House {
  if (h.heating && Array.isArray(h.heating.emitters)) return h;
  const d = defaultHouse(), base = { ...h, heating: { ...d.heating, zones: [], emitters: [] } };
  const res = calcHouse(base);
  return { ...base, heating: { ...base.heating, emitters: autoEmitters(base, res.rooms.filter((r) => r.room.heated).map((r) => ({ room: r.room, need: r.totalW }))) } };
}

const KEY = 'insulation-visualiser.house.v1';

/** Saved house, or the demo house if nothing usable is stored. Drops layers whose material no longer exists. */
export function loadHouse(): House {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!p || p.v !== 1 || !Array.isArray(p.rooms) || !Array.isArray(p.storeys) || !Array.isArray(p.buildups) || !p.buildups.length) return defaultHouse();
    return upgradeHouse(p);
  } catch {
    return defaultHouse();
  }
}
