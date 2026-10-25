import { MAT, PRESETS } from './data';
import type { Buildup, Device, House, Opening, Room } from './house';

const preset = (id: string) => PRESETS.find((p) => p.id === id)?.layers ?? [];

export const DEFAULT_BUILDUPS: Buildup[] = [
  { id: 'cav', name: 'Cavity wall, PIR filled', kind: 'wall', layers: preset('cavity_new') },
  { id: 'solid', name: 'Solid brick, 225 mm', kind: 'wall', layers: preset('solid') },
  { id: 'stud', name: 'Stud partition', kind: 'wall', layers: [['pb', 12.5], ['cavity', 75], ['pb', 12.5]] },
  { id: 'sf', name: 'Solid floor, 75 mm PIR', kind: 'floor', layers: [['conc', 100], ['pir', 75], ['render', 65]] },
  { id: 'jf', name: 'Timber joist floor', kind: 'floor', layers: [['pb', 12.5], ['cavity', 150], ['timber', 20]] },
  { id: 'loft', name: 'Cold roof ceiling, 270 mm loft', kind: 'roof', layers: preset('cold270') },
  { id: 'tiles', name: 'Pitched roof, tiles on felt', kind: 'roof', layers: [['m_roof_tile_concrete', 15]] },
  { id: 'flat', name: 'Lightweight timber flat roof', kind: 'roof', layers: preset('roofl') },
  { id: 'dg', name: 'Double glazed, 2010', kind: 'glazing', layers: [], u: 1.4 },
  { id: 'door', name: 'Composite door', kind: 'door', layers: [], u: 1.6 },
];

const R = (id: string, name: string, type: Room['type'], storey: number, x: number, y: number, w: number, d: number, setpoint: number, extra: Partial<Room> = {}): Room =>
  ({ id, name, type, storey, span: 1, x, y, w, d, heated: true, setpoint, ach: 1, ...extra });

const ROOMS: Room[] = [
  R('living', 'Living room', 'living', 0, 0, 0, 4.5, 4.2, 21),
  R('kitchen', 'Kitchen', 'kitchen', 0, 4.5, 0, 4.5, 3.6, 21),
  R('dining', 'Dining', 'dining', 0, 0, 4.2, 4.5, 2.8, 21),
  R('hall', 'Hall & landing', 'hall', 0, 4.5, 3.6, 1.8, 3.4, 18, { span: 2 }),
  R('wc', 'WC', 'wc', 0, 6.3, 3.6, 2.7, 1.4, 18),
  R('utility', 'Utility', 'utility', 0, 6.3, 5.0, 2.7, 2.0, 18, { heated: false, ach: 2 }),
  R('bed1', 'Bedroom 1', 'bedroom', 1, 0, 0, 4.5, 4.2, 21),
  R('bed2', 'Bedroom 2', 'bedroom', 1, 4.5, 0, 4.5, 3.6, 21),
  R('bed3', 'Bedroom 3', 'bedroom', 1, 0, 4.2, 4.5, 2.8, 21),
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
const CHIMNEY: Array<[string, number]> = [['Open', 80], ['Blocked (boarded fireplace)', 20], ['Closed fire', 10], ['Removed / sealed', 0]];
const FAN: Array<[string, number]> = [['Fitted', 10], ['None', 0]];

export function defaultHouse(): House {
  return {
    v: 1,
    name: 'Demo house, 1950–66',
    storeys: [{ name: 'Ground floor', h: 2.4, zone: 0.25 }, { name: 'First floor', h: 2.4, zone: 0.25 }],
    rooms: ROOMS.map((r) => ({ ...r })),
    openings: OPENINGS.map((o) => ({ ...o })),
    buildups: DEFAULT_BUILDUPS.map((b) => ({ ...b, layers: b.layers.map(([m, t]) => [m, t] as [string, number]) })),
    defaults: { extWall: 'cav', intWall: 'stud', groundFloor: 'sf', intFloor: 'jf', loftCeiling: 'loft', loftRoof: 'tiles', flatRoof: 'flat', exposedFloor: 'jf' },
    faceBuildup: { 'w:bed3:S:1': 'solid', 'w:bath:E:1': 'solid' },
    faceBoundary: {},
    neighbourT: 10,
    loft: { present: true, ach: 4, height: 1.5, pitch: 35 },
    climate: { station: 7, pct: '99.6', altitude: 60, region: 16, postcode: 'M14' },
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
    hp: { capacity: 6, maxFlow: 45, elecP: 26.32, gasP: 7.97, gasSC: 29.68, boilerEff: 85 },
  };
}

const KEY = 'insulation-visualiser.house.v1';

/** Saved house, or the demo house if nothing usable is stored. Drops layers whose material no longer exists. */
export function loadHouse(): House {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!p || p.v !== 1 || !Array.isArray(p.rooms) || !Array.isArray(p.storeys) || !Array.isArray(p.buildups) || !p.buildups.length) return defaultHouse();
    const d = defaultHouse();
    const h: House = { ...d, ...p, vent: { ...d.vent, ...p.vent }, loft: { ...d.loft, ...p.loft }, climate: { ...d.climate, ...p.climate }, hp: { ...d.hp, ...p.hp } };
    h.buildups = h.buildups.map((b) => ({ ...b, layers: (b.layers ?? []).filter(([m, t]) => !!MAT[m] && Number.isFinite(t) && t > 0) }));
    return h;
  } catch {
    return defaultHouse();
  }
}

export function saveHouse(h: House): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // Private browsing or full storage: the house just won't persist.
  }
}
