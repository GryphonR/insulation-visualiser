// Whole-house design-day heat loss: rooms are rectangles on storeys, every face is derived from how they touch.
// Plan and rules: docs/whole-house-plan.md.
import { MAT, MEAN } from './data';
import { layerR } from './swap';
import { MCS_HDD, MCS_MEAN_TEMPS, MCS_STATIONS, designTemp, postcodeArea } from './climate-mcs';

export type Side = 'N' | 'E' | 'S' | 'W';
export const SIDES: Side[] = ['N', 'E', 'S', 'W'];
export type BuildupKind = 'wall' | 'floor' | 'roof' | 'glazing' | 'door';
export interface Buildup { id: string; name: string; kind: BuildupKind; layers: Array<[string, number]>; u?: number }
export interface Storey { name: string; h: number; zone: number }
export type RoomType = 'living' | 'dining' | 'kitchen' | 'bedroom' | 'bathroom' | 'wc' | 'hall' | 'landing' | 'utility' | 'study' | 'store' | 'other';
export interface Room {
  id: string; name: string; type: RoomType;
  /** Lowest storey and how many storeys it rises through (2 for a hall with the stair void). */
  storey: number; span: number;
  /** Plan rectangle in metres, x east, y south (north is the top of the plan). */
  x: number; y: number; w: number; d: number;
  heated: boolean; setpoint: number;
  /** Air changes per hour, unheated rooms only. */
  ach: number;
}
export interface Opening { id: string; room: string; side: Side; name: string; w: number; h: number; buildup: string }
export interface Device { id: string; room: string; name: string; fan: boolean; opts: Array<[string, number]>; pick: number }
export interface Factor { id: string; label: string; dq: number; on: boolean }
export type Boundary = 'out' | 'party';
export type DefaultKey = 'extWall' | 'intWall' | 'groundFloor' | 'intFloor' | 'loftCeiling' | 'loftRoof' | 'flatRoof' | 'exposedFloor';

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
  neighbourT: number;
  loft: { present: boolean; ach: number; height: number; pitch: number };
  climate: { station: number; pct: '99.6' | '99'; altitude: number; region: number; postcode: string };
  vent: {
    method: 'model' | 'cibse'; source: 'est' | 'meas'; q50: number; factors: Factor[]; devices: Device[];
    mech: 'none' | 'dmev' | 'mvhr'; mechFlow: number; eta: number; minAch: boolean;
  };
  hp: { capacity: number; maxFlow: number; elecP: number; gasP: number; gasSC: number; boilerEff: number };
}

export type To = { k: 'out' } | { k: 'ground' } | { k: 'party' } | { k: 'room'; id: string } | { k: 'loft' };
export interface Face {
  key: string; label: string; kind: 'wall' | 'floor' | 'ceiling' | 'window' | 'door';
  side?: Side; to: To; area: number; buildup: Buildup; U: number;
  /** Outside walls can be switched to a party wall. */
  canParty?: boolean;
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
};
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const layersR = (b: Buildup) => b.layers.reduce((s, [m, t]) => (MAT[m] ? s + layerR(MAT[m], t) : s), 0);
export const buildupU = (b: Buildup, films = FILMS.extWall) => b.u ?? 1 / (films + layersR(b));

/** BS EN ISO 13370 slab on ground: λ 2.0 W/mK soil, 0.3 m wall. */
export function groundFloorU(b: Buildup, Bp: number): number {
  if (b.u != null) return b.u;
  const lam = 2, dt = 0.3 + lam * (0.17 + layersR(b) + 0.04);
  return dt < Bp ? (2 * lam / (Math.PI * Bp + dt)) * Math.log(Math.PI * Bp / dt + 1) : lam / (0.457 * Bp + dt);
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
const overlapArea = (r: Room, o: Room) => overlap1(r.x, r.x + r.w, o.x, o.x + o.w) * overlap1(r.y, r.y + r.d, o.y, o.y + o.d);
export const onStorey = (r: Room, s: number) => r.storey <= s && s < r.storey + r.span;
const topStorey = (r: Room) => r.storey + r.span - 1;

export function roomHeight(h: House, r: Room): number {
  let t = 0;
  for (let s = r.storey; s <= topStorey(r); s++) t += (h.storeys[s]?.h ?? 0) + (s < topStorey(r) ? h.storeys[s]?.zone ?? 0 : 0);
  return t;
}

/** Edge of a room on one side: the range along the edge and the neighbour test and range. */
function edge(r: Room, side: Side) {
  const hz = side === 'N' || side === 'S';
  const line = side === 'N' ? r.y : side === 'S' ? r.y + r.d : side === 'W' ? r.x : r.x + r.w;
  return {
    a: hz ? r.x : r.y, b: hz ? r.x + r.w : r.y + r.d,
    touches: (o: Room) => (side === 'N' ? near(o.y + o.d, line) : side === 'S' ? near(o.y, line) : side === 'W' ? near(o.x + o.w, line) : near(o.x, line)),
    range: (o: Room): [number, number] => (hz ? [o.x, o.x + o.w] : [o.y, o.y + o.d]),
  };
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface Ctx { Bp: number }

/** Every face of a room, with its build-up and U-value. */
export function roomFaces(h: House, r: Room, ctx: Ctx): Face[] {
  const B = (key: string, def: DefaultKey) => {
    const id = h.faceBuildup[key] ?? h.defaults[def];
    return h.buildups.find((b) => b.id === id) ?? h.buildups.find((b) => b.id === h.defaults[def]) ?? h.buildups[0];
  };
  const last = h.storeys.length - 1, faces: Face[] = [];
  for (const side of SIDES) {
    const ext: Face[] = [];
    for (let s = r.storey; s <= topStorey(r); s++) {
      const st = h.storeys[s];
      if (!st) continue;
      const e = edge(r, side), cuts: Array<[number, number]> = [];
      for (const o of h.rooms) {
        if (o.id === r.id || !onStorey(o, s) || !e.touches(o)) continue;
        const [c, d] = e.range(o), len = overlap1(e.a, e.b, c, d);
        if (len <= EPS) continue;
        cuts.push([c, d]);
        const key = `iw:${pairKey(r.id, o.id)}:${s}`, b = B(key, 'intWall');
        faces.push({ key, label: `${side} wall`, kind: 'wall', side, to: { k: 'room', id: o.id }, area: len * st.h, buildup: b, U: buildupU(b, FILMS.intWall) });
      }
      const len = subtract(e.a, e.b, cuts).reduce((t, [a, b]) => t + b - a, 0);
      if (len <= EPS) continue;
      const key = `w:${r.id}:${side}:${s}`, b = B(key, 'extWall'), party = h.faceBoundary[key] === 'party';
      const f: Face = { key, label: `${side} wall${r.span > 1 ? ` (${st.name.toLowerCase()})` : ''}`, kind: 'wall', side, to: party ? { k: 'party' } : { k: 'out' },
        area: len * (st.h + (s < last ? st.zone : 0)), buildup: b, U: buildupU(b, FILMS.extWall), canParty: true, len };
      ext.push(f);
    }
    // Openings come out of this side's outside walls, shared by area.
    const ops = h.openings.filter((o) => o.room === r.id && o.side === side), gross = ext.reduce((t, f) => t + f.area, 0);
    const opArea = Math.min(gross, ops.reduce((t, o) => t + o.w * o.h, 0));
    for (const f of ext) f.area -= gross > 0 ? opArea * (f.area / gross) : 0;
    faces.push(...ext);
    for (const o of ops) {
      const b = h.buildups.find((x) => x.id === o.buildup) ?? h.buildups[0];
      faces.push({ key: `op:${o.id}`, label: o.name, kind: b.kind === 'door' ? 'door' : 'window', side, to: ext[0]?.to ?? { k: 'out' }, area: o.w * o.h, buildup: b, U: buildupU(b) });
    }
  }
  // Floor
  const A = r.w * r.d;
  if (r.storey === 0) {
    const b = B(`gf:${r.id}`, 'groundFloor');
    faces.push({ key: `gf:${r.id}`, label: 'Floor', kind: 'floor', to: { k: 'ground' }, area: A, buildup: b, U: groundFloorU(b, ctx.Bp) });
  } else {
    let covered = 0;
    for (const o of h.rooms) {
      if (o.id === r.id || !onStorey(o, r.storey - 1)) continue;
      const a = overlapArea(r, o);
      if (a <= EPS) continue;
      covered += a;
      const key = `f:${pairKey(r.id, o.id)}`, b = B(key, 'intFloor');
      faces.push({ key, label: 'Floor', kind: 'floor', to: { k: 'room', id: o.id }, area: a, buildup: b, U: buildupU(b, FILMS.intFloor) });
    }
    if (A - covered > EPS) {
      const b = B(`xf:${r.id}`, 'exposedFloor');
      faces.push({ key: `xf:${r.id}`, label: 'Exposed floor', kind: 'floor', to: { k: 'out' }, area: A - covered, buildup: b, U: buildupU(b, FILMS.exposedFloor) });
    }
  }
  // Ceiling
  const top = topStorey(r);
  let covered = 0;
  if (top < last) {
    for (const o of h.rooms) {
      if (o.id === r.id || !onStorey(o, top + 1)) continue;
      const a = overlapArea(r, o);
      if (a <= EPS) continue;
      covered += a;
      const key = `f:${pairKey(r.id, o.id)}`, b = B(key, 'intFloor');
      faces.push({ key, label: 'Ceiling', kind: 'ceiling', to: { k: 'room', id: o.id }, area: a, buildup: b, U: buildupU(b, FILMS.intFloor) });
    }
  }
  if (A - covered > EPS) {
    const toLoft = top === last && h.loft.present;
    const key = toLoft ? `lc:${r.id}` : `fr:${r.id}`, b = B(key, toLoft ? 'loftCeiling' : 'flatRoof');
    faces.push({ key, label: toLoft ? 'Ceiling to loft' : 'Flat roof', kind: 'ceiling', to: toLoft ? { k: 'loft' } : { k: 'out' }, area: A - covered, buildup: b,
      U: buildupU(b, toLoft ? FILMS.loftCeiling : FILMS.roof) });
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
  Tout: number; Tg: number; hdd: number; hddKnown: boolean; station: string; region: string;
  rooms: RoomResult[]; loft: { T: number; area: number; V: number } | null;
  q50: number; n50: number; envelope: number; heatedV: number; heatedA: number;
  peakW: number; paths: Array<{ label: string; W: number }>;
  htc: number; hlp: number; annualKWh: number;
  months: Array<{ heat: number; Tout: number; flow: number; cop: number; elec: number }>;
  hp: { designCop: number; scop: number; elecKWh: number; spare: number; costHP: number; costGas: number; gasKWh: number };
  checks: Array<{ level: 'error' | 'warn'; text: string }>;
}

export function deviceM3(d: Device) { return d.opts[d.pick]?.[1] ?? 0; }

export function calcHouse(h: House): HouseResult {
  const Tout = designTemp(h.climate.station, h.climate.altitude, h.climate.pct);
  const reg = MCS_MEAN_TEMPS[h.climate.region] ?? MCS_MEAN_TEMPS[0], Tg = reg[4];
  const area = postcodeArea(h.climate.postcode), hddKnown = area in MCS_HDD, hdd = MCS_HDD[area] ?? 2200;
  const checks: HouseResult['checks'] = [];

  // Ground floor shape factor B' = A / (0.5 P), P = exposed perimeter of the ground storey (party walls excluded).
  const ground = h.rooms.filter((r) => r.storey === 0);
  const pre = ground.flatMap((r) => roomFaces(h, r, { Bp: 1 }));
  const P = pre.filter((f) => f.kind === 'wall' && f.to.k === 'out' && f.key.endsWith(':0')).reduce((t, f) => t + (f.len ?? 0), 0);
  const gA = ground.reduce((t, r) => t + r.w * r.d, 0);
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
  const vol = (r: Room) => r.w * r.d * roomHeight(h, r);

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
  const heatedV = heated.reduce((t, r) => t + vol(r), 0), heatedA = heated.reduce((t, r) => t + r.w * r.d * r.span, 0);
  // Leakage envelope: heated rooms' faces to outside, ground, loft and unheated rooms.
  const toHeated = (to: To) => to.k === 'room' && !!h.rooms.find((o) => o.id === to.id)?.heated;
  const envelope = heated.reduce((t, r) => t + (faces.get(r.id) ?? []).filter((f) => f.to.k !== 'party' && !toHeated(f.to)).reduce((s, f) => s + f.area, 0), 0);
  const v = h.vent;
  const q50 = v.source === 'meas' ? v.q50 : v.factors.filter((f) => f.on).reduce((t, f) => t + f.dq, 0);
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
      nMech = fansOff && heatedV > EPS ? (v.mechFlow * (V / heatedV) * (v.mech === 'mvhr' ? 1 - v.eta / 100 : 1)) / V : 0;
      n = v.method === 'cibse' ? CIBSE_ACH[r.type] : nInf + nDev + nMech;
      // shortcut: MCS 0.5 ach floor applied to the effective rate, also under MVHR; check against the MCS calculator when MVHR is modelled in detail.
      if (v.minAch && HABITABLE.includes(r.type)) n = Math.max(n, 0.5);
    } else if (!r.heated) n = r.ach;
    const ventW = r.heated ? 0.33 * n * V * (Ti - Tout) : 0;
    if (r.heated) rows.push({ key: `vent:${r.id}`, label: 'Ventilation', to: 'outside', buildup: `${n.toFixed(2)} ach · ${V.toFixed(1)} m³`, area: 0, U: 0, dT: Ti - Tout, W: ventW, kind: 'vent' });
    const fabricW = r.heated ? rows.filter((x) => x.kind !== 'vent').reduce((t, x) => t + x.W, 0) : 0;
    const a = r.w * r.d;
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
  const annualKWh = (htc * hdd * 24) / 1000;
  const wts = MEAN.map((m, i) => Math.max(0, 15.5 - m) * DAYS[i]), wsum = wts.reduce((a, b) => a + b, 0) || 1;
  const flowAt = (Te: number) => 25 + (h.hp.maxFlow - 25) * Math.min(1, Math.max(0, (15 - Te) / (15 - Tout || 1)));
  const copAt = (Te: number) => {
    // Carnot fraction on refrigerant temperatures: condensing 5 K above flow, evaporating 6 K below outside air.
    const Tc = flowAt(Te) + 5, Tev = Te - 6, c = (0.45 * (Tc + 273.15)) / Math.max(3, Tc - Tev);
    return Math.min(7, c * (Te > -4 && Te < 6 ? 0.93 : 1));
  };
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
  for (const r of h.rooms) {
    if (r.w <= 0 || r.d <= 0) checks.push({ level: 'error', text: `${r.name} has no floor area.` });
    if (r.storey + r.span > h.storeys.length) checks.push({ level: 'error', text: `${r.name} rises above the top storey.` });
    for (const side of SIDES) {
      const ops = h.openings.filter((o) => o.room === r.id && o.side === side);
      if (!ops.length) continue;
      const wall = (faces.get(r.id) ?? []).filter((f) => f.kind === 'wall' && f.side === side && f.to.k !== 'room').reduce((t, f) => t + f.area, 0);
      if (wall < 0.05) checks.push({ level: 'error', text: `${r.name}: ${ops.map((o) => o.name).join(', ')} on the ${side} side, which has no outside wall left.` });
    }
  }
  if (!hddKnown) checks.push({ level: 'warn', text: `Postcode area "${area || h.climate.postcode}" not in the MCS degree-day table; using 2,200 K·day.` });
  if (v.mech === 'mvhr' && q50 > 5) checks.push({ level: 'warn', text: `MVHR with q50 ${q50.toFixed(1)}: above 5 m³/h·m² most of the heat recovery is lost to leakage.` });
  if (hp.spare < 0) checks.push({ level: 'warn', text: `Heat pump is ${Math.round(-hp.spare * 100)}% short of the design heat loss.` });

  return {
    Tout, Tg, hdd, hddKnown, station: MCS_STATIONS[h.climate.station]?.[0] ?? '?', region: reg[0],
    rooms, loft: hasLoft ? { T: T.loft, area: loftA, V: loftV } : null,
    q50, n50, envelope, heatedV, heatedA, peakW, paths, htc, hlp: heatedA > EPS ? htc / heatedA : 0, annualKWh, months, hp, checks,
  };
}
