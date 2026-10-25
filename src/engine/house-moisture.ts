// Room moisture and mould risk on a mean January day (board 4f), and the interstitial check for each build-up in use.
import { LOCATIONS, MEAN } from './data';
import { MOULD_RH, RH_OUT, runMoisture } from './moisture';
import type { MoistureResult } from './moisture';
import type { Buildup, House, HouseResult, RoomType } from './house';

/** Water vapour at saturation, g/m³. */
export const vsat = (t: number) => (216.7 * 6.112 * Math.exp((17.62 * t) / (243.12 + t))) / (t + 273.15);
export const dewPoint = (v: number, t: number) => { const e = (v * (t + 273.15)) / 216.7, l = Math.log(e / 6.112); return (243.12 * l) / (17.62 - l); };
const UK_MEAN = MEAN.reduce((a, b) => a + b, 0) / 12;
/** ISO 13788 inner surface resistance for the mould check (corners, behind furniture). */
const RSI_MOULD = 0.25;

export interface MoistureOptions { dryIndoors: boolean; fansUsed: boolean; trickleOpen: boolean }

/** Moisture released in a room, g/day, by type: board 4f's typical figures scaled by occupancy. */
function sources(type: RoomType, people: number, bedrooms: number, opt: MoistureOptions): Array<[string, number]> {
  const perBed = people / Math.max(1, bedrooms);
  const s: Record<string, Array<[string, number]>> = {
    living: [['People, evenings', 200 * people], ['Plants', 200]],
    kitchen: [['Cooking', 1800], ['Washing up', 400]],
    dining: [['Meals', 300]],
    bathroom: [[`Showers (${people})`, 800 * people], ['Towels drying', 600]],
    bedroom: [[`${fmtN(perBed)} overnight`, 320 * perBed]],
    wc: [['Use', 150]], hall: [['Coats, boots', 150]], landing: [['Airing cupboard', 100]],
    utility: [['Washing machine', 400], ['Tumble dryer, vented', 100]],
    study: [['One person by day', 200]],
  };
  const out = [...(s[type] ?? [])];
  if (opt.dryIndoors && type === 'living') out.push(['Washing drying indoors', 1500]);
  return out;
}
const fmtN = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? `${Math.round(n)} ${Math.round(n) === 1 ? 'person' : 'people'}` : `${n.toFixed(1)} people`);

export interface RoomMoisture {
  id: string; name: string; T: number; ach: number; sources: Array<[string, number]>; G: number;
  /** Vapour excess over outside, g/m³; indoor vapour, g/m³; air RH %. */
  dv: number; v: number; rh: number; dew: number;
  /** Coldest opaque surface: which face, its temperature factor, temperature and surface RH. */
  spot: string; f: number; tsi: number; srh: number;
  risk: 'ok' | 'watch' | 'mould'; fix: string;
}

export function roomMoisture(h: House, res: HouseResult, opt: MoistureOptions): { Tout: number; rhOut: number; rooms: RoomMoisture[] } {
  const Tout = MEAN[0] + (res.Tg - UK_MEAN), rhOut = RH_OUT[0] / 100, vo = vsat(Tout) * rhOut;
  const bedrooms = h.rooms.filter((r) => r.type === 'bedroom').length;
  const tJan = (T: number, heated: boolean, set: number) => (heated ? set : Tout + ((T - res.Tout) / Math.max(1, 21 - res.Tout)) * (21 - Tout));
  const rooms = res.rooms.map((rr) => {
    const r = rr.room, T = tJan(rr.T, r.heated, r.setpoint);
    let ach = Math.max(0.05, rr.n);
    const fanM3 = h.vent.devices.filter((d) => d.room === r.id && d.fan).reduce((t, d) => t + (d.opts[d.pick]?.[1] ?? 0), 0);
    if (!opt.fansUsed && rr.V > 0) ach = Math.max(0.2, ach - fanM3 / rr.V);
    if (opt.trickleOpen && r.type === 'bedroom') ach += 0.3;
    const src = sources(r.type, h.gains.people, bedrooms, opt), G = src.reduce((t, x) => t + x[1], 0);
    const dv = rr.V > 0 ? G / 24 / (ach * rr.V) : 0, v = vo + dv;
    // Coldest opaque element to the outside, ground, loft or an unheated room.
    let spot = 'no outside surface', f = 1, other = T;
    for (const face of rr.faces) {
      if (face.kind === 'window' || face.kind === 'door') continue;
      const to = face.to;
      const otherT = to.k === 'out' ? Tout : to.k === 'ground' ? res.Tg : to.k === 'loft' ? Tout + 1 : to.k === 'party' ? h.neighbourT
        : (() => { const o = res.rooms.find((x) => x.room.id === to.id); return o && !o.room.heated ? tJan(o.T, false, 0) : null; })();
      if (otherT == null || otherT >= T - 0.5) continue;
      const ff = Math.max(0, 1 - face.U * RSI_MOULD);
      const tsi = otherT + ff * (T - otherT);
      if (tsi < other + f * (T - other) - 1e-9 || spot === 'no outside surface') { spot = `${face.label} (${face.buildup.name})`; f = ff; other = otherT; }
    }
    const tsi = other + f * (T - other);
    const srh = Math.min(100, (v / vsat(tsi)) * 100), rh = Math.min(100, (v / vsat(T)) * 100);
    const risk = srh >= MOULD_RH ? 'mould' : srh >= 75 ? 'watch' : 'ok';
    const fix = risk === 'ok' ? 'Fine as it is.'
      : f < 0.75 ? `Insulate or line the cold surface: ${spot} has a temperature factor of ${f.toFixed(2)}, below the 0.75 BRE guide.`
      : dv > 4 ? 'More ventilation: use the extract fan, open trickle vents, keep doors shut while cooking or showering.'
      : 'Keep furniture off cold outside walls and ventilate after moisture-producing activities.';
    return { id: r.id, name: r.name, T, ach, sources: src, G, dv, v, rh, dew: dewPoint(v, T), spot, f, tsi, srh, risk, fix } as RoomMoisture;
  });
  return { Tout, rhOut, rooms };
}

/** Interstitial condensation (EN ISO 13788 monthly, the app's moisture engine) for each outside wall and roof build-up in use. */
export function buildupMoisture(h: House, res: HouseResult): Array<{ b: Buildup; where: string[]; r: MoistureResult | null }> {
  const lat = res.climate.lat;
  const loc = LOCATIONS.reduce((a, l) => (Math.abs(l.lat - lat) < Math.abs(a.lat - lat) ? l : a), LOCATIONS[0]).id;
  const used = new Map<string, { b: Buildup; where: Set<string> }>();
  for (const rr of res.rooms) {
    if (!rr.room.heated) continue;
    for (const f of rr.faces) {
      if (f.kind === 'window' || f.kind === 'door' || f.buildup.u != null || !f.buildup.layers.length) continue;
      if (!(f.to.k === 'out' || f.to.k === 'loft')) continue;
      const e = used.get(f.buildup.id) ?? { b: f.buildup, where: new Set<string>() };
      e.where.add(rr.room.name);
      used.set(f.buildup.id, e);
    }
  }
  return [...used.values()].map(({ b, where }) => ({
    b, where: [...where],
    r: runMoisture({ layers: b.layers.map(([mat, t], i) => ({ id: i + 1, mat, t })), loc, tin: 20, dv: 4, roof: b.kind === 'roof' }),
  }));
}
