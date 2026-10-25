// Typical meteorological years for the MCS stations, bundled from PVGIS (EU JRC, CC BY 4.0) and loaded on demand.

export interface Tmy { station: number; lat: number; lon: number; source: string; T: Float32Array; dni: Float32Array; dhi: Float32Array }

/** File for each MCS_STATIONS index, in the same order. */
export const TMY_FILES = ['belfast', 'birmingham', 'cardiff', 'edinburgh', 'glasgow', 'leeds', 'london', 'manchester', 'newcastle', 'norwich', 'nottingham', 'plymouth', 'southampton', 'swindon', 'sthelier'];

const files = import.meta.glob<{ default: { source: string; lat: number; lon: number; T: string; dni: string; dhi: string } }>('../data/tmy/*.json');
const cache = new Map<number, Promise<Tmy>>();

export function loadTmy(station: number): Promise<Tmy> {
  if (!cache.has(station)) {
    const load = files[`../data/tmy/${TMY_FILES[station] ?? TMY_FILES[0]}.json`];
    cache.set(station, load().then(({ default: d }) => {
      const nums = (s: string, k = 1) => Float32Array.from(s.split(','), (v) => Number(v) * k);
      return { station, lat: d.lat, lon: d.lon, source: d.source, T: nums(d.T, 0.1), dni: nums(d.dni), dhi: nums(d.dhi) };
    }));
  }
  return cache.get(station)!;
}
