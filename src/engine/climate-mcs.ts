import { DISTRICTS_RAW } from './postcode-districts';

// MCS Heat Load Calculator design conditions:
// https://heatloadcalculator.mcscertified.com/docs/reference-sources/design-conditions

/** CIBSE Guide A (2015) Table 2.5: [name, station, lat, lon, altitude m, 99.6% °C, 99% °C]. */
export const MCS_STATIONS: Array<[string, string, number, number, number, number, number]> = [
  ['Belfast', 'Aldergrove', 54.664, -6.224, 63, -3.2, -1.5],
  ['Birmingham', 'Coleshill', 52.48, -1.689, 96, -5.1, -3.2],
  ['Cardiff', 'St Athan', 51.401, -3.445, 49, -3.1, -1.5],
  ['Edinburgh', 'Gogarbank', 55.928, -3.343, 57, -5.4, -3.2],
  ['Glasgow', 'Bishopton', 55.907, -4.531, 59, -5.6, -3.5],
  ['Leeds', 'Church Fenton', 53.836, -1.197, 8, -3.3, -1.9],
  ['London', 'Heathrow', 51.479, -0.449, 25, -3.0, -1.7],
  ['Manchester', 'Woodford', 53.339, -2.153, 88, -4.5, -2.7],
  ['Newcastle', 'Albermarle', 55.02, -1.88, 142, -3.7, -2.0],
  ['Norwich', 'Marham', 52.651, 0.568, 21, -4.6, -3.1],
  ['Nottingham', 'Watnall', 53.005, -1.25, 117, -3.9, -2.4],
  ['Plymouth', 'Mountbatten', 50.354, -4.12, 50, -1.5, -0.2],
  ['Southampton', 'Hurn', 50.779, -1.83, 10, -4.8, -3.4],
  ['Swindon', 'Brize Norton', 51.758, -1.576, 82, -4.6, -2.9],
  ['St Helier (Channel Islands)', 'Maison St Louis', 49.19142, -2.0937, 53, 0.1, 2.0],
];

/** MGD 007 Table B1 mean annual external air temperature (used as the ground temperature): [region, station, lat, lon, °C]. */
export const MCS_MEAN_TEMPS: Array<[string, string, number, number, number]> = [
  ['Borders', 'Boulmer', 55.421, -1.6, 9.0],
  ['East Pennines', 'Finningley', 53.4791, -1.008, 10.0],
  ['East Scotland', 'Leuchars', 56.377, -2.862, 8.8],
  ['East Anglia', 'Honington', 52.342, 0.773, 10.1],
  ['Midlands', 'Elmdon', 52.446, -1.747, 9.8],
  ['North East England', 'Leeming', 54.296, -1.53, 9.4],
  ['North East Scotland', 'Dyce', 57.206, -2.202, 8.5],
  ['North West England', 'Carlisle', 54.933, -2.963, 9.4],
  ['North West Scotland', 'Stornoway', 58.214, -6.325, 8.6],
  ['Northern Ireland', 'Aldergrove', 54.664, -6.224, 9.4],
  ['Severn Valley', 'Filton', 51.521, -2.576, 10.6],
  ['South East England', 'Gatwick', 51.15, -0.183, 10.2],
  ['South West England', 'Plymouth', 50.354, -4.12, 11.0],
  ['Southern England', 'Hurn', 50.779, -1.835, 10.4],
  ['Thames Valley', 'Heathrow', 51.479, -0.449, 11.3],
  ['Wales', 'Aberporth', 52.139, -4.571, 9.9],
  ['West Pennines', 'Ringway', 53.356, -2.27, 10.0],
  ['West Scotland', 'Abbotsinch', 55.863, -4.428, 9.1],
  ['Channel Islands', 'Maison St Louis', 49.19142, -2.0937, 12.4],
];

/** Heating degree days, base 15.5 °C, by postcode area. */
export const MCS_HDD: Record<string, number> = {
  AB: 2668, AL: 2033, B: 2425, BA: 1835, BB: 2228, BD: 2307, BH: 2224, BL: 2228, BN: 2224, BR: 2255, BS: 1835, BT: 2360,
  CA: 2388, CB: 2033, CF: 1835, CH: 2228, CM: 2033, CO: 2254, CR: 2224, CT: 2255, CV: 2425, CW: 2228, DA: 2255, DD: 2577,
  DE: 2228, DG: 2483, DH: 2370, DL: 2388, DN: 2307, DT: 2224, DY: 2425, E: 2033, EC: 2033, EH: 2577, EN: 2255, EX: 1858,
  FK: 2577, FY: 2388, G: 2494, GL: 2425, GU: 2033, GY: 1800, HA: 2033, HD: 2307, HG: 2307, HP: 2033, HR: 2425, HS: 1800,
  HU: 2307, HX: 2228, IG: 2033, IM: 2228, IP: 2254, IV: 2668, JE: 1800, KA: 2494, KT: 2033, KW: 2668, KY: 2577, L: 2228,
  LA: 2388, LD: 2161, LE: 2425, LL: 2228, LN: 2307, LS: 2307, LU: 2033, M: 2228, ME: 2033, MK: 2425, ML: 2494, N: 2033,
  NE: 2370, NG: 2254, NN: 2425, NP: 2425, NR: 2254, NW: 2033, OL: 2228, OX: 2425, PA: 2494, PE: 2254, PH: 2668, PL: 1858,
  PO: 2224, PR: 2388, RG: 2033, RH: 2033, RM: 2033, S: 2228, SA: 2161, SE: 2033, SG: 2033, SK: 2228, SL: 2033, SM: 2033,
  SN: 2425, SO: 2224, SP: 2224, SR: 2370, SS: 2033, ST: 2228, SW: 2033, SY: 2161, TA: 1835, TD: 2483, TF: 2425, TN: 2255,
  TQ: 1858, TR: 1858, TS: 2370, TW: 2203, UB: 2203, W: 2203, WA: 2228, WC: 2203, WD: 2203, WF: 2307, WN: 2228, WR: 2425,
  WS: 2425, WV: 2425, YO: 2307, ZE: 2668,
};

/** Postcode area = the leading letters of the postcode ("M14 5AB" -> "M"). */
export const postcodeArea = (pc: string): string => (pc.trim().toUpperCase().match(/^[A-Z]{1,2}/)?.[0] ?? '');

/** Postcode district (outward code): "M14 5AB" or "M145AB" -> "M14". */
export function postcodeDistrict(pc: string): string {
  const s = pc.trim().toUpperCase().replace(/\s+/g, ' ');
  if (s.includes(' ')) return s.split(' ')[0];
  return s.length > 4 ? s.slice(0, -3) : s;
}

let districts: Map<string, [number, number]> | null = null;
/** Centre of a postcode district, or of its whole area if only the area is known; null if unknown. */
export function postcodeLatLon(pc: string): [number, number] | null {
  if (!districts) districts = new Map(DISTRICTS_RAW.split(';').map((r) => { const [k, v] = r.split(':'); const [a, b] = v.split(','); return [k, [+a, +b]]; }));
  const d = districts.get(postcodeDistrict(pc));
  if (d) return d;
  const area = postcodeArea(pc);
  if (!area) return null;
  // Area only ("M"): average its districts. Districts in "M" start with M then a digit, so "ME1" isn't counted.
  const re = new RegExp(`^${area}\\d`);
  const pts = [...districts].filter(([k]) => re.test(k)).map(([, v]) => v);
  return pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : null;
}

/** Straight-line distance, km (MCS: nearest reference location by straight line). */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Nearest MCS design-temperature station and mean-temperature region to a postcode, or null if the postcode isn't known. */
export function climateFromPostcode(pc: string): { station: number; region: number; latlon: [number, number]; km: number } | null {
  // The district table has no Channel Islands; they use the St Helier data anyway.
  const ciArea = /^(JE|GY)/.test(postcodeArea(pc));
  const p: [number, number] | null = ciArea ? [MCS_STATIONS[MCS_STATIONS.length - 1][2], MCS_STATIONS[MCS_STATIONS.length - 1][3]] : postcodeLatLon(pc);
  if (!p) return null;
  // MCS measures from the centre of the postcode area ("CV"), not the district, for both the station and the region.
  const c = (ciArea ? null : postcodeLatLon(postcodeArea(pc))) ?? p;
  const near = <T extends unknown[]>(list: T[], lat: (x: T) => number, lon: (x: T) => number) =>
    list.reduce((best, x, i) => { const d = distanceKm(c, [lat(x), lon(x)]); return d < best.d ? { i, d } : best; }, { i: 0, d: Infinity });
  // Channel Islands use their own standard data (JE, GY).
  const ci = /^(JE|GY)/.test(postcodeArea(pc));
  const st = ci ? { i: MCS_STATIONS.length - 1, d: 0 } : near(MCS_STATIONS.slice(0, -1), (s) => s[2], (s) => s[3]);
  const rg = ci ? { i: MCS_MEAN_TEMPS.length - 1, d: 0 } : near(MCS_MEAN_TEMPS.slice(0, -1), (s) => s[2], (s) => s[3]);
  return { station: st.i, region: rg.i, latlon: p, km: st.d };
}

/** MCS rule: 0.6 °C colder for every whole 100 m the property sits above the station; no uplift below it. */
export function designTemp(station: number, altitude: number, pct: '99.6' | '99'): number {
  const s = MCS_STATIONS[station] ?? MCS_STATIONS[0];
  const base = pct === '99' ? s[6] : s[5];
  return +(base - 0.6 * Math.max(0, Math.floor((altitude - s[4]) / 100))).toFixed(1);
}

/** CIBSE DHDG 2026 Table 2-2 design room temperatures: [age band A-J, age band K onwards]. */
export const ROOM_TEMPS: Record<string, [number, number]> = {
  living: [21, 21], dining: [21, 21], kitchen: [18, 21], bedroom: [18, 21], bathroom: [22, 22], wc: [18, 21],
  hall: [18, 21], landing: [18, 21], utility: [18, 21], study: [21, 21], store: [18, 21], other: [21, 21],
  // Spaces usually left unheated (board 1e); figures are for when someone heats them.
  garage: [10, 10], conservatory: [18, 18], porch: [10, 10], cellar: [10, 10],
};
