// New-house templates and age-band defaults (board 0a): a whole starting model from a few facts.
import { calcHouse } from './house';
import type { Buildup, House, Opening, Room, Side } from './house';
import { defaultHouse } from './house-default';
import { autoEmitters } from './house-heating';

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

export const TEMPLATES: Array<{ id: string; label: string; party: Side[]; storeys: number | null }> = [
  { id: 'mid', label: 'Mid-terrace', party: ['W', 'E'], storeys: null },
  { id: 'semi', label: 'Semi / end-terrace', party: ['E'], storeys: null },
  { id: 'det', label: 'Detached', party: [], storeys: null },
  { id: 'bung', label: 'Bungalow', party: [], storeys: 1 },
];

/** What an EPC (or a look at the house) says, overriding the age-band guess. */
export interface EpcFacts { wall?: boolean; roof?: boolean; floor?: boolean; win?: boolean }
export const EPC_LABELS: Record<keyof EpcFacts, string> = {
  wall: 'Cavity walls filled', roof: 'Loft insulation 250 mm+', floor: 'Floor insulated', win: 'Fully double glazed',
};

export interface NewHouseInput { template: string; age: string; W: number; D: number; storeys: number; epc: EpcFacts }

export function newHouse(inp: NewHouseInput): House {
  const t = TEMPLATES.find((x) => x.id === inp.template) ?? TEMPLATES[1];
  const a = AGE_BANDS.find((x) => x.id === inp.age) ?? AGE_BANDS[2];
  const W = Math.max(4, inp.W), D = Math.max(4, inp.D), n = t.storeys ?? Math.min(3, Math.max(1, Math.round(inp.storeys)));
  const h = defaultHouse();
  h.name = `${t.label}, ${a.label}`;
  h.storeys = Array.from({ length: n }, (_, i) => ({ name: ['Ground floor', 'First floor', 'Second floor'][i], h: 2.4, zone: 0.25 }));

  // Build-ups from the age band, with EPC facts on top.
  const cavityBand = a.wall.some(([m]) => m === 'cavity');
  const wall: Buildup = inp.epc.wall && cavityBand
    ? { id: 'wall', name: 'Cavity wall, filled (EPC)', kind: 'wall', layers: a.wall.map(([m, x]) => (m === 'cavity' ? ['mw', x] : [m, x]) as [string, number]) }
    : { id: 'wall', name: a.wallName, kind: 'wall', layers: a.wall };
  const loftMM = inp.epc.roof ? Math.max(250, a.loftMM) : a.loftMM;
  const floor: Buildup = inp.epc.floor
    ? { id: 'floor', name: 'Solid floor, 75 mm PIR (EPC)', kind: 'floor', layers: [['conc', 100], ['pir', 75], ['render', 65]] }
    : { id: 'floor', name: a.floorName, kind: 'floor', layers: a.floor, floorType: a.suspended ? 'suspended' : 'solid' };
  const winU = inp.epc.win ? Math.min(a.winU, 2.0) : a.winU;
  const keep = new Set(['stud', 'jf', 'tiles', 'flat', 'slope', 'knee', 'dwall', 'droof']);
  h.buildups = [
    wall, floor,
    { id: 'loftc', name: `Loft, ${loftMM} mm mineral wool`, kind: 'roof', layers: [['mw', loftMM], ['pb', 12.5]] },
    { id: 'win', name: `Windows, U ${winU}`, kind: 'glazing', layers: [], u: winU },
    { id: 'door', name: `External door, U ${a.doorU}`, kind: 'door', layers: [], u: a.doorU },
    ...h.buildups.filter((b) => keep.has(b.id)),
  ];
  h.defaults = { ...h.defaults, extWall: 'wall', groundFloor: 'floor', loftCeiling: 'loftc' };

  // Rooms: front (south, y = D) and back halves; the hall and landing rise through every storey.
  const rooms: Room[] = [];
  const R = (id: string, name: string, type: Room['type'], storey: number, x: number, y: number, w: number, d: number, extra: Partial<Room> = {}) =>
    rooms.push({ id, name, type, storey, span: 1, x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2), heated: true, setpoint: type === 'bathroom' ? 22 : ['hall', 'landing', 'wc', 'utility'].includes(type) ? 18 : 21, ach: 1, ...extra });
  if (n === 1) {
    const yb = 0.45 * D;
    R('bed1', 'Bedroom 1', 'bedroom', 0, 0, 0, 0.4 * W, yb); R('bath', 'Bathroom', 'bathroom', 0, 0.4 * W, 0, 0.2 * W, yb); R('kitchen', 'Kitchen', 'kitchen', 0, 0.6 * W, 0, 0.4 * W, yb);
    R('bed2', 'Bedroom 2', 'bedroom', 0, 0, yb, 0.4 * W, D - yb); R('hall', 'Hall', 'hall', 0, 0.4 * W, yb, 0.15 * W, D - yb); R('living', 'Living room', 'living', 0, 0.55 * W, yb, 0.45 * W, D - yb);
  } else {
    const a2 = 0.5 * W, yf = 0.45 * D, hw = Math.min(1.8, W - a2), rest = W - a2 - hw, wide = rest >= 1.2;
    // ground floor
    R('dining', 'Dining', 'dining', 0, 0, 0, a2, yf); R('kitchen', 'Kitchen', 'kitchen', 0, a2, 0, W - a2, yf);
    R('living', 'Living room', 'living', 0, 0, yf, a2, D - yf);
    R('hall', 'Hall & landing', 'hall', 0, a2, yf, hw, D - yf, { span: n });
    if (wide) { R('wc', 'WC', 'wc', 0, a2 + hw, yf + 0.5 * (D - yf), rest, 0.5 * (D - yf)); R('utility', 'Utility', 'utility', 0, a2 + hw, yf, rest, 0.5 * (D - yf), { heated: false, ach: 2 }); }
    // first floor
    R('bed1', 'Bedroom 1', 'bedroom', 1, 0, yf, a2, D - yf); R('bed2', 'Bedroom 2', 'bedroom', 1, 0, 0, a2, yf);
    // A narrow house has no room beside the landing, so the bathroom takes the back right.
    if (wide) { R('bed3', 'Bedroom 3', 'bedroom', 1, a2, 0, W - a2, yf); R('bath', 'Bathroom', 'bathroom', 1, a2 + hw, yf, rest, D - yf); }
    else R('bath', 'Bathroom', 'bathroom', 1, a2, 0, W - a2, yf);
    if (n >= 3) {
      R('bed4', 'Bedroom 4', 'bedroom', 2, 0, yf, a2, D - yf); R('bed5', 'Bedroom 5', 'bedroom', 2, 0, 0, a2, yf); R('bed6', 'Bedroom 6', 'bedroom', 2, a2, 0, W - a2, yf);
      if (wide) R('shower', 'Shower room', 'bathroom', 2, a2 + hw, yf, rest, D - yf);
    }
    if (!wide) rooms.find((r) => r.id === 'hall')!.w = +(W - a2).toFixed(2);
  }
  h.rooms = rooms;

  // Windows (about 15% of floor area) on the front or back wall, doors in the hall and kitchen.
  const openings: Opening[] = [];
  let k = 0;
  for (const r of rooms) {
    const front = Math.abs(r.y + r.d - D) < 1e-6, back = Math.abs(r.y) < 1e-6;
    if (!front && !back) continue;
    const side: Side = front ? 'S' : 'N', len = r.w;
    if (r.type === 'hall') openings.push({ id: `o${++k}`, room: r.id, side, name: 'Front door', w: 0.9, h: 2.1, buildup: 'door' });
    if (r.type === 'kitchen') openings.push({ id: `o${++k}`, room: r.id, side, name: 'Back door', w: 0.9, h: 2.1, buildup: 'door' });
    if (!r.heated) continue;
    const area = Math.max(0.4, Math.min(0.15 * r.w * r.d * r.span, len * 1.2));
    const wdt = Math.min(len - 0.3, ['bathroom', 'wc'].includes(r.type) ? 0.6 : Math.max(0.6, area / 1.2));
    if (wdt > 0.3) openings.push({ id: `o${++k}`, room: r.id, side, name: 'Window', w: +wdt.toFixed(2), h: +(Math.min(area, wdt * 1.4) / wdt).toFixed(2), buildup: 'win' });
  }
  h.openings = openings;

  // Party walls on the template's shared sides.
  h.faceBoundary = {};
  for (const side of t.party) {
    for (const r of rooms) {
      const onEdge = side === 'W' ? Math.abs(r.x) < 1e-6 : Math.abs(r.x + r.w - W) < 1e-6;
      if (!onEdge) continue;
      for (let s = r.storey; s < r.storey + r.span; s++) h.faceBoundary[`w:${r.id}:${side}:${s}`] = 'party';
    }
  }
  h.faceBuildup = {};

  // Airtightness and devices from the age band.
  h.vent.source = 'est';
  h.vent.factors = [
    { id: 'base', label: `Age-band default, ${a.label}`, dq: a.q50, on: true },
    ...(inp.epc.wall && cavityBand ? [{ id: 'fill', label: 'Cavity filled', dq: -2, on: true }] : []),
    ...(inp.epc.win ? [{ id: 'win', label: 'Replacement double glazing', dq: -2.5, on: true }] : []),
    { id: 'strip', label: 'Doors draught-stripped', dq: -1.5, on: false },
    { id: 'serv', label: 'Service holes sealed', dq: -1, on: false },
  ];
  const fan: Array<[string, number]> = [['Fitted', 10], ['None', 0]];
  h.vent.devices = [
    ...(a.chimney ? [{ id: 'chim', room: 'living', name: 'Chimney', fan: false, opts: [['Open', 80], ['Blocked (boarded fireplace)', 20], ['Closed fire', 10], ['Removed / sealed', 0]] as Array<[string, number]>, pick: 1 }] : []),
    { id: 'kfan', room: 'kitchen', name: 'Extract fan', fan: true, opts: fan, pick: 0 },
    { id: 'bfan', room: 'bath', name: 'Extract fan', fan: true, opts: fan, pick: 0 },
  ].filter((d) => rooms.some((r) => r.id === d.room));

  // Heating: two zones and radiators sized for the design loss at 45 °C.
  h.heating = { ...h.heating, zones: h.heating.zones.slice(0, 2), emitters: [] };
  const res = calcHouse(h);
  // A heat pump in whole kW with about 5% in hand.
  h.hp.capacity = Math.max(3, Math.ceil((res.peakW * 1.05) / 1000));
  h.heating.emitters = autoEmitters(h, res.rooms.filter((x) => x.room.heated).map((x) => ({ room: x.room, need: x.totalW }))).map((e) => {
    const r = rooms.find((x) => x.id === e.room)!;
    return { ...e, zone: r.type === 'bedroom' || r.type === 'bathroom' ? 'z2' : 'z1' };
  });
  return h;
}

/** Rough uncertainty on the design loss: age-band guesses ±30%, EPC facts ±15%, airtightness ±35% until tested. */
export function lossRange(h: House, epc: EpcFacts): { peak: number; lo: number; hi: number; unknown: number } {
  const r = calcHouse(h);
  const p = (l: string) => r.paths.find((x) => x.label === l)?.W ?? 0;
  const parts: Array<[number, boolean | undefined]> = [[p('Walls'), epc.wall], [p('Roof & ceilings'), epc.roof], [p('Floors'), epc.floor], [p('Windows') + p('Doors'), epc.win]];
  const v = parts.reduce((a, [w, known]) => a + (w * (known ? 0.15 : 0.3)) ** 2, 0) + (p('Ventilation') * 0.35) ** 2;
  const s = Math.sqrt(v);
  return { peak: r.peakW, lo: r.peakW - s, hi: r.peakW + s, unknown: parts.filter(([, k]) => !k).length + 1 };
}
