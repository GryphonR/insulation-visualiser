// New-house templates and age-band defaults (board 0a): a whole starting model from a few facts.
import type { House } from './house';
import { defaultHouse } from './house-default';

export interface AgeBand {
  id: string; label: string;
  wall: Array<[string, number]>; wallName: string;
  loftMM: number; floor: Array<[string, number]>; floorName: string; suspended: boolean;
  winU: number; doorU: number; q50: number; chimney: boolean;
}
// Wall, loft, floor and window defaults by age band (typical RdSAP-style assumptions for England & Wales).
export const AGE_BANDS: AgeBand[] = [
  { id: 'pre-1919', label: 'Before 1919', wall: [['brick', 225], ['lime', 15]], wallName: 'Solid brick, 225 mm', loftMM: 100, floor: [['timber', 22]], floorName: 'Suspended timber, uninsulated', suspended: true, winU: 4.8, doorU: 3.0, q50: 15, chimney: true },
  { id: '1919-49', label: '1919–49', wall: [['brick', 102], ['cavity', 50], ['brick', 102], ['lime', 13]], wallName: 'Cavity, unfilled (brick)', loftMM: 100, floor: [['timber', 22]], floorName: 'Suspended timber, uninsulated', suspended: true, winU: 2.8, doorU: 3.0, q50: 14, chimney: true },
  { id: '1950-66', label: '1950–66', wall: [['brick', 102], ['cavity', 50], ['dblock', 100], ['lime', 13]], wallName: 'Cavity, unfilled (block)', loftMM: 100, floor: [['conc', 150], ['render', 50]], floorName: 'Solid, uninsulated', suspended: false, winU: 2.8, doorU: 3.0, q50: 13, chimney: true },
  { id: '1967-82', label: '1967–82', wall: [['brick', 102], ['cavity', 50], ['aac', 100], ['lime', 13]], wallName: 'Cavity, unfilled (aerated block)', loftMM: 100, floor: [['conc', 150], ['render', 50]], floorName: 'Solid, uninsulated', suspended: false, winU: 2.8, doorU: 3.0, q50: 11, chimney: false },
  { id: '1983-95', label: '1983–95', wall: [['brick', 102], ['cavity', 25], ['eps', 25], ['aac', 100], ['pb', 12.5]], wallName: 'Cavity, partial fill 25 mm', loftMM: 150, floor: [['conc', 100], ['eps', 25], ['render', 65]], floorName: 'Solid, 25 mm insulation', suspended: false, winU: 2.0, doorU: 2.0, q50: 10, chimney: false },
  { id: '1996-2006', label: '1996–2006', wall: [['brick', 102], ['cavity', 25], ['eps', 50], ['aac', 100], ['pb', 12.5]], wallName: 'Cavity, partial fill 50 mm', loftMM: 200, floor: [['conc', 100], ['eps', 50], ['render', 65]], floorName: 'Solid, 50 mm insulation', suspended: false, winU: 2.0, doorU: 2.0, q50: 9, chimney: false },
  { id: '2007+', label: '2007 on', wall: [['brick', 102], ['cavity', 25], ['pir', 60], ['aac', 100], ['pb', 12.5]], wallName: 'Cavity, 60 mm PIR', loftMM: 270, floor: [['conc', 100], ['pir', 75], ['render', 65]], floorName: 'Solid, 75 mm PIR', suspended: false, winU: 1.4, doorU: 1.6, q50: 6, chimney: false },
];

export const TEMPLATES: Array<{ id: string; label: string; storeys: number | null }> = [
  { id: 'mid', label: 'Mid-terrace', storeys: null },
  { id: 'semi', label: 'Semi / end-terrace', storeys: null },
  { id: 'det', label: 'Detached', storeys: null },
  { id: 'bung', label: 'Bungalow', storeys: 1 },
];

/** W and D, when both are given, only draw a dashed footprint on the plan to draw within; no rooms are made. */
export interface NewHouseInput { template: string; age: string; storeys: number; W?: number; D?: number }

/** An empty house of the right age: its storeys, and the build-ups, airtightness and glazing typical of that age, but no rooms. */
export function newHouse(inp: NewHouseInput): House {
  const t = TEMPLATES.find((x) => x.id === inp.template) ?? TEMPLATES[1];
  const a = AGE_BANDS.find((x) => x.id === inp.age) ?? AGE_BANDS[2];
  const n = t.storeys ?? Math.min(3, Math.max(1, Math.round(inp.storeys)));
  const h = defaultHouse();
  h.name = `${t.label}, ${a.label}`;
  h.ageBand = a.id === '2007+' ? 'K' : 'AJ';
  h.storeys = Array.from({ length: n }, (_, i) => ({ name: ['Ground floor', 'First floor', 'Second floor'][i], h: 2.4, zone: 0.25 }));
  if (inp.W && inp.D) h.guide = { w: inp.W, d: inp.D };

  const keep = new Set(['stud', 'jf', 'tiles', 'flat', 'slope', 'knee', 'dwall', 'droof']);
  h.buildups = [
    { id: 'wall', name: a.wallName, kind: 'wall', layers: a.wall },
    { id: 'floor', name: a.floorName, kind: 'floor', layers: a.floor, floorType: a.suspended ? 'suspended' : 'solid' },
    { id: 'loftc', name: `Loft, ${a.loftMM} mm mineral wool`, kind: 'roof', layers: [['mw', a.loftMM], ['pb', 12.5]] },
    { id: 'win', name: `Windows, U ${a.winU}`, kind: 'glazing', layers: [], u: a.winU, g: a.winU >= 4 ? 0.85 : a.winU >= 2.5 ? 0.76 : a.winU >= 1.8 ? 0.72 : 0.63, frame: 0.3 },
    { id: 'door', name: `External door, U ${a.doorU}`, kind: 'door', layers: [], u: a.doorU },
    ...h.buildups.filter((b) => keep.has(b.id)),
  ];
  h.defaults = { ...h.defaults, extWall: 'wall', groundFloor: 'floor', loftCeiling: 'loftc' };

  h.rooms = []; h.openings = []; h.faceBoundary = {}; h.faceBuildup = {}; h.wallAlign = {};
  h.vent.source = 'est';
  h.vent.factors = [
    { id: 'base', label: `Age-band default, ${a.label}`, dq: a.q50, on: true },
    { id: 'strip', label: 'Doors draught-stripped', dq: -1.5, on: false },
    { id: 'serv', label: 'Service holes sealed', dq: -1, on: false },
  ];
  h.vent.devices = [];
  h.heating = { ...h.heating, zones: h.heating.zones.slice(0, 2), emitters: [] };
  return h;
}
