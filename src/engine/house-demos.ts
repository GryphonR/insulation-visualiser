// Demo projects for the start screen: a whole house as found, plus an upgrade scenario where it has one.
// Each starts from the age-band template (newHouse) and adds rooms, windows, party walls and its own build-ups.
import { calcHouse } from './house';
import type { Buildup, Device, House, Opening, Room } from './house';
import { CHIMNEY, FAN, defaultHouse } from './house-default';
import { autoEmitters } from './house-heating';
import { newProject } from './house-scenarios';
import type { Project, Scenario } from './house-scenarios';
import { newHouse } from './house-templates';

const room = (id: string, name: string, type: Room['type'], storey: number, x: number, y: number, w: number, d: number, setpoint: number, extra: Partial<Room> = {}): Room =>
  ({ id, name, type, storey, span: 1, x, y, w, d, heated: true, setpoint, ach: 1, ...extra });
const win = (room: string, side: Opening['side'], w: number, h: number, buildup = 'win', name = buildup === 'door' ? 'Door' : 'Window'): Omit<Opening, 'id'> =>
  ({ room, side, name, w, h, buildup });
const dev = (id: string, room: string, name: string, fan: boolean, opts: Array<[string, number]>, pick: number): Device => ({ id, room, name, fan, opts, pick });

/** Swap in or add build-ups by id. */
function setBuildups(h: House, list: Buildup[]) {
  for (const b of list) { const i = h.buildups.findIndex((x) => x.id === b.id); if (i >= 0) h.buildups[i] = b; else h.buildups.push(b); }
}

const HP_SIZES = [3, 4, 5, 6, 7, 8.5, 10, 12, 14, 16];

/** One radiator per heated room sized for the design loss at the house's max flow, and a heat pump that covers the peak. */
function size(h: House) {
  const res = calcHouse(h);
  h.heating.emitters = autoEmitters(h, res.rooms.filter((r) => r.room.heated).map((r) => ({ room: r.room, need: r.totalW })))
    .map((e) => ({ ...e, zone: ['bedroom', 'bathroom'].includes(h.rooms.find((r) => r.id === e.room)?.type ?? '') ? 'z2' : 'z1' }));
  h.hp.capacity = HP_SIZES.find((k) => k * 1000 >= res.peakW * 1.05) ?? HP_SIZES[HP_SIZES.length - 1];
}

/** As found on a gas boiler: fixed 70 °C flow, 10 K drop, radiators sized for that. */
function onGas(h: House) {
  h.hp = { ...h.hp, maxFlow: 70, boilerEff: 84 };
  h.heating = { ...h.heating, control: 'fixed', dT: 10 };
  size(h);
}

/** A copy of the base with the upgrades applied, then radiators resized for a heat pump at `flow` °C on weather compensation. */
function upgrade(base: House, name: string, flow: number, edit: (h: House) => void): Scenario {
  const h = structuredClone(base);
  edit(h);
  h.hp = { ...h.hp, maxFlow: flow };
  h.heating = { ...h.heating, control: 'ideal', dT: 5 };
  size(h);
  // Upsize only: a radiator already big enough stays as it is.
  h.heating.emitters = h.heating.emitters.map((e) => ({ ...e, len: Math.max(e.len, base.heating.emitters.find((b) => b.room === e.room)?.len ?? 0) }));
  return { id: 's1', name, kind: 'plan', parent: 'base', house: h };
}

function finish(h: House, rooms: Room[], openings: Array<Omit<Opening, 'id'>>): House {
  h.rooms = rooms;
  h.openings = openings.map((o, i) => ({ ...o, id: `o${i + 1}` }));
  return h;
}

const project = (base: House, ...more: Scenario[]): Project => {
  const p = newProject(base);
  p.scenarios.push(...more);
  return p;
};

/** Pre-1919 detached stone cottage, nothing insulated, on gas. Upgrade: breathable insulating-plaster IWI, loft wool, bigger rads, heat pump. */
export function stoneCottage(): Project {
  const h = newHouse({ template: 'det', age: 'pre-1919', storeys: 2 });
  h.name = 'Stone cottage, before 1919';
  h.storeys = [{ name: 'Ground floor', h: 2.2, zone: 0.25 }, { name: 'First floor', h: 2.1, zone: 0.2 }];
  setBuildups(h, [
    // Layers run outside → inside.
    { id: 'wall', name: 'Rubble stone, 500 mm, lime plaster', kind: 'wall', layers: [['h_rubble_wall', 500], ['h_lime_putty_plaster', 20]] },
    { id: 'floor', name: 'Flagstones on earth', kind: 'floor', layers: [['h_yorkshire_sandstone', 75]], floorType: 'solid' },
    { id: 'loftc', name: 'Lath and plaster ceiling, no insulation', kind: 'roof', layers: [['h_lime_hair_plaster', 25]] },
    { id: 'win', name: 'Single glazed, timber sash', kind: 'glazing', layers: [], u: 4.8, g: 0.85, frame: 0.3 },
    { id: 'door', name: 'Solid timber door', kind: 'door', layers: [], u: 3.0 },
  ]);
  h.climate = { ...h.climate, postcode: 'GL54', auto: true, altitude: 150 };
  h.loft = { ...h.loft, pitch: 40 };
  h.vent.devices = [dev('chim', 'living', 'Chimney', false, CHIMNEY, 1), dev('kfan', 'kitchen', 'Extract fan', true, FAN, 1), dev('bfan', 'bath', 'Extract fan', true, FAN, 0)];
  finish(h, [
    room('living', 'Living room', 'living', 0, 0, 0, 4.4, 5.0, 21),
    room('kitchen', 'Kitchen', 'kitchen', 0, 4.4, 0, 3.6, 3.0, 21),
    room('hall', 'Hall & landing', 'hall', 0, 4.4, 3.0, 1.4, 2.0, 18, { span: 2 }),
    room('wc', 'WC', 'wc', 0, 5.8, 3.0, 2.2, 2.0, 18),
    room('bed1', 'Bedroom 1', 'bedroom', 1, 0, 0, 4.4, 3.0, 18),
    room('bed2', 'Bedroom 2', 'bedroom', 1, 0, 3.0, 4.4, 2.0, 18),
    room('bed3', 'Bedroom 3', 'bedroom', 1, 4.4, 0, 3.6, 3.0, 18),
    room('bath', 'Bathroom', 'bathroom', 1, 5.8, 3.0, 2.2, 2.0, 22),
  ], [
    win('living', 'S', 1.0, 1.1), win('living', 'W', 0.8, 1.0), win('living', 'N', 0.8, 1.0), win('kitchen', 'N', 1.0, 1.0), win('kitchen', 'E', 0.85, 1.95, 'door', 'Back door'),
    win('hall', 'S', 0.9, 1.95, 'door', 'Front door'), win('wc', 'S', 0.5, 0.6), win('bed1', 'N', 0.8, 0.9), win('bed2', 'S', 0.8, 0.9),
    win('bed3', 'N', 0.8, 0.9), win('bed3', 'E', 0.6, 0.8), win('bath', 'S', 0.6, 0.7),
  ]);
  onGas(h);
  return project(h, upgrade(h, 'IWI, loft wool, bigger rads, heat pump', 50, (s) => {
    setBuildups(s, [
      // Vapour-open and capillary-active so the wall still dries to the room; a mineral plaster has no rot risk and follows uneven rubble.
      { id: 'iwi', name: 'Rubble stone + 60 mm cork-lime insulating plaster IWI', kind: 'wall', layers: [['h_rubble_wall', 500], ['h_lime_putty_plaster', 15], ['h_diathonite', 60], ['h_lime_putty_plaster', 10]] },
      { id: 'loftw', name: "Lath and plaster + 250 mm sheep's wool", kind: 'roof', layers: [['h_sheep_wool', 250], ['h_lime_hair_plaster', 25]] },
    ]);
    s.defaults = { ...s.defaults, extWall: 'iwi', loftCeiling: 'loftw' };
  }));
}

/** Victorian mid-terrace, solid brick, on gas. Upgrade: IWI, loft top-up, underfloor insulation, draught-proofing, bigger rads, heat pump. */
export function victorianTerrace(): Project {
  const h = newHouse({ template: 'mid', age: 'pre-1919', storeys: 2 });
  h.name = 'Victorian mid-terrace';
  h.storeys = [{ name: 'Ground floor', h: 2.8, zone: 0.25 }, { name: 'First floor', h: 2.6, zone: 0.25 }];
  setBuildups(h, [
    { id: 'wall', name: 'Solid brick, 225 mm, plastered', kind: 'wall', layers: [['h_soft_brick', 225], ['m_lime_sand', 15]] },
    { id: 'kfloor', name: 'Solid floor, uninsulated', kind: 'floor', layers: [['m_concrete_reinforced', 100], ['m_cement_sand', 50]], floorType: 'solid' },
    { id: 'win', name: 'Double glazed, before 2002', kind: 'glazing', layers: [], u: 2.8, g: 0.76, frame: 0.3 },
  ]);
  h.climate = { ...h.climate, postcode: 'LS6', auto: true, altitude: 70 };
  h.faceBuildup = { 'gf:kitchen': 'kfloor' };
  // Neighbours on both sides; the kitchen and bathroom outrigger has a side return to the east.
  h.faceBoundary = Object.fromEntries([
    'w:front:W:0', 'w:dining:W:0', 'w:kitchen:W:0', 'w:bed1:W:1', 'w:bed2:W:1', 'w:bath:W:1',
    'w:hall:E:0', 'w:hall:E:1', 'w:dining:E:0', 'w:bed2:E:1',
  ].map((k) => [k, 'party' as const]));
  h.vent.devices = [
    dev('chim1', 'front', 'Chimney', false, CHIMNEY, 1), dev('chim2', 'dining', 'Chimney', false, CHIMNEY, 1),
    dev('kfan', 'kitchen', 'Extract fan', true, FAN, 0), dev('bfan', 'bath', 'Extract fan', true, FAN, 0),
    dev('front', 'hall', 'Front door, letterbox', false, [['As found', 14], ['Brushed + sealed', 3]], 0),
  ];
  finish(h, [
    room('front', 'Front room', 'living', 0, 0, 0, 3.6, 4.2, 21),
    room('hall', 'Hall & landing', 'hall', 0, 3.6, 0, 1.0, 4.2, 18, { span: 2 }),
    room('dining', 'Back room', 'dining', 0, 0, 4.2, 4.6, 3.6, 21),
    room('kitchen', 'Kitchen', 'kitchen', 0, 0, 7.8, 2.8, 3.0, 18),
    room('bed1', 'Front bedroom', 'bedroom', 1, 0, 0, 3.6, 4.2, 18),
    room('bed2', 'Back bedroom', 'bedroom', 1, 0, 4.2, 4.6, 3.6, 18),
    room('bath', 'Bathroom', 'bathroom', 1, 0, 7.8, 2.8, 3.0, 22),
  ], [
    win('front', 'N', 1.6, 1.8, 'win', 'Bay window'), win('hall', 'N', 0.9, 2.1, 'door', 'Front door'), win('dining', 'S', 1.2, 1.6),
    win('kitchen', 'E', 1.0, 1.1), win('kitchen', 'S', 0.9, 2.0, 'door', 'Back door'),
    win('bed1', 'N', 1.0, 1.5), win('bed1', 'N', 0.6, 1.5), win('bed2', 'S', 1.0, 1.4), win('bath', 'E', 0.6, 0.9), win('bath', 'S', 0.6, 0.9),
  ]);
  onGas(h);
  return project(h, upgrade(h, 'IWI, loft, floor, draughts, bigger rads, heat pump', 50, (s) => {
    setBuildups(s, [
      // Mineral board: in moderate rain wood fibre here passes its rot threshold, this dries out.
      { id: 'iwi', name: 'Solid brick + 60 mm mineral board IWI, lime plaster', kind: 'wall', layers: [['h_soft_brick', 225], ['m_lime_sand', 15], ['h_multipor', 60], ['h_lime_putty_plaster', 10]] },
      { id: 'loft300', name: 'Loft, 300 mm mineral wool', kind: 'roof', layers: [['mw', 300], ['pb', 12.5]] },
      { id: 'floorins', name: 'Suspended timber, 100 mm wood fibre between joists', kind: 'floor', layers: [['h_wf_flex', 100], ['m_timber_500_kg_m', 22]], floorType: 'suspended' },
    ]);
    s.defaults = { ...s.defaults, extWall: 'iwi', loftCeiling: 'loft300', groundFloor: 'floorins' };
    s.vent.factors = s.vent.factors.map((f) => ({ ...f, on: true }));
    s.vent.devices = s.vent.devices.map((d) => (d.id === 'front' ? { ...d, pick: 1 } : d));
  }));
}

/** Early-2000s semi, partial-fill cavity, on gas. Upgrade: heat pump, bigger rads, loft top-up and draught-stripping only. */
export function newBuildSemi(): Project {
  const h = newHouse({ template: 'semi', age: '1996-2006', storeys: 2 });
  h.name = 'Early-2000s semi';
  h.climate = { ...h.climate, postcode: 'MK10', auto: true, altitude: 80 };
  h.faceBoundary = Object.fromEntries(['w:hall:E:0', 'w:hall:E:1', 'w:wc:E:0', 'w:kitchen:E:0', 'w:bath:E:1', 'w:bed3:E:1'].map((k) => [k, 'party' as const]));
  h.vent.devices = [dev('kfan', 'kitchen', 'Extract fan', true, FAN, 0), dev('bfan', 'bath', 'Extract fan', true, FAN, 0), dev('wfan', 'wc', 'Extract fan', true, FAN, 0)];
  finish(h, [
    room('living', 'Living room', 'living', 0, 0, 0, 3.6, 4.6, 21),
    room('hall', 'Hall & landing', 'hall', 0, 3.6, 0, 1.6, 2.6, 18, { span: 2 }),
    room('wc', 'WC', 'wc', 0, 3.6, 2.6, 1.6, 2.0, 18),
    room('kitchen', 'Kitchen / diner', 'kitchen', 0, 0, 4.6, 5.2, 3.6, 21),
    room('bed1', 'Bedroom 1', 'bedroom', 1, 0, 0, 3.6, 4.6, 18),
    room('bath', 'Bathroom', 'bathroom', 1, 3.6, 2.6, 1.6, 2.0, 22),
    room('bed2', 'Bedroom 2', 'bedroom', 1, 0, 4.6, 2.8, 3.6, 18),
    room('bed3', 'Bedroom 3', 'bedroom', 1, 2.8, 4.6, 2.4, 3.6, 18),
  ], [
    win('living', 'N', 1.8, 1.3), win('hall', 'N', 0.9, 2.1, 'door', 'Front door'), win('kitchen', 'S', 1.2, 1.1), win('kitchen', 'S', 1.6, 2.1, 'win', 'Patio doors'),
    win('kitchen', 'W', 0.9, 1.1), win('bed1', 'N', 1.4, 1.2), win('bed2', 'S', 1.2, 1.2), win('bed3', 'S', 1.0, 1.2), win('wc', 'N', 0.5, 0.6),
  ]);
  onGas(h);
  return project(h, upgrade(h, 'Heat pump, bigger rads, loft top-up, draught-stripping', 45, (s) => {
    setBuildups(s, [{ id: 'loft300', name: 'Loft, 300 mm mineral wool', kind: 'roof', layers: [['mw', 300], ['pb', 12.5]] }]);
    s.defaults = { ...s.defaults, loftCeiling: 'loft300' };
    s.vent.factors = s.vent.factors.map((f) => (f.id === 'strip' ? { ...f, on: true } : f));
  }));
}

/** A Passivhaus-standard detached house: super-insulated, triple glazed, airtight with MVHR, small heat pump. No upgrade. */
export function passivhaus(): Project {
  const h = newHouse({ template: 'det', age: '2007+', storeys: 2 });
  h.name = 'Passivhaus-type house';
  h.storeys = [{ name: 'Ground floor', h: 2.5, zone: 0.35 }, { name: 'First floor', h: 2.5, zone: 0.4 }];
  setBuildups(h, [
    { id: 'wall', name: 'Timber frame, 300 mm wood fibre + cellulose, U ≈ 0.12', kind: 'wall', layers: [['m_timber_500_kg_m', 20], ['vgap', 25], ['h_wf_dense', 60], ['h_wf_blown', 240], ['ply', 15], ['cavity', 50], ['pb', 12.5]] },
    { id: 'floor', name: 'Slab on 250 mm EPS', kind: 'floor', layers: [['eps', 250], ['m_concrete_reinforced', 150], ['m_cement_sand', 50]], floorType: 'solid' },
    { id: 'loftc', name: 'Loft, 450 mm cellulose over airtight OSB', kind: 'roof', layers: [['h_cellulose_loft', 450], ['ply', 15], ['pb', 12.5]] },
    { id: 'win', name: 'Triple glazed, passive-house frame', kind: 'glazing', layers: [], u: 0.7, g: 0.5, frame: 0.3 },
    { id: 'door', name: 'Passive-house door', kind: 'door', layers: [], u: 0.8 },
  ]);
  h.ageBand = 'K';
  h.floorEdge = { edge: 'none', D: 0, R: 0, upstand: 'insulated', psi: 0.16 };
  h.climate = { ...h.climate, postcode: 'NR2', auto: true, altitude: 20 };
  h.vent = { ...h.vent, source: 'meas', q50: 0.6, mech: 'mvhr', mechFlow: 110, eta: 88, devices: [] };
  finish(h, [
    room('plant', 'Utility / plant', 'utility', 0, 0, 0, 2.4, 2.6, 18),
    room('hall', 'Hall & landing', 'hall', 0, 2.4, 0, 2.0, 2.6, 20, { span: 2 }),
    room('study', 'Study', 'study', 0, 4.4, 0, 2.6, 2.6, 20),
    room('living', 'Kitchen / living', 'living', 0, 0, 2.6, 7.0, 5.4, 20),
    room('bath', 'Bathroom', 'bathroom', 1, 0, 0, 2.4, 2.6, 21),
    room('bed3', 'Bedroom 3', 'bedroom', 1, 4.4, 0, 2.6, 2.6, 20),
    room('bed1', 'Bedroom 1', 'bedroom', 1, 0, 2.6, 3.6, 5.4, 20),
    room('bed2', 'Bedroom 2', 'bedroom', 1, 3.6, 2.6, 3.4, 5.4, 20),
  ], [
    win('hall', 'N', 1.0, 2.1, 'door', 'Front door'), win('study', 'N', 0.8, 1.0), win('plant', 'N', 0.6, 0.6),
    win('living', 'S', 2.4, 2.2, 'win', 'Sliding doors'), win('living', 'S', 1.6, 1.4), win('living', 'W', 1.2, 1.4), win('living', 'E', 1.2, 1.4),
    win('bath', 'N', 0.6, 0.8), win('bed3', 'N', 0.8, 1.0), win('bed1', 'S', 1.6, 1.4), win('bed1', 'W', 0.8, 1.2), win('bed2', 'S', 1.6, 1.4),
  ]);
  h.hp = { ...h.hp, maxFlow: 35 };
  h.heating = { ...h.heating, control: 'ideal', dT: 5 };
  size(h);
  return newProject(h);
}

export const DEMOS: Array<{ id: string; label: string; make: () => Project }> = [
  { id: '1950s', label: '1950s semi', make: () => newProject(defaultHouse()) },
  { id: 'cottage', label: 'Stone cottage', make: stoneCottage },
  { id: 'victorian', label: 'Victorian terrace', make: victorianTerrace },
  { id: 'semi2000', label: 'Early-2000s semi', make: newBuildSemi },
  { id: 'passivhaus', label: 'Passivhaus-type', make: passivhaus },
];
