import { useEffect, useState } from 'react';
import { calcHouse } from '../engine/house';
import type { House } from '../engine/house';
import type { SimResult } from '../engine/house-sim';
import type { Tmy } from '../engine/weather-tmy';

/**
 * The typical-year run for a house, in a worker. Returns the last finished result (null until the first, or with no house)
 * and whether a newer run is still going. A new house or weather abandons the run in progress.
 */
export function useYearSim(house: House | undefined, tmy: Tmy | undefined): { result: SimResult | null; busy: boolean } {
  const [done, setDone] = useState<{ house: House; tmy?: Tmy; result: SimResult } | null>(null);
  useEffect(() => {
    if (!house) return;
    const w = new Worker(new URL('../engine/house-sim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<SimResult>) => setDone({ house, tmy, result: e.data });
    w.postMessage({ house, base: calcHouse(house), tmy });
    return () => w.terminate();
  }, [house, tmy]);
  return { result: house ? done?.result ?? null : null, busy: !!house && (done?.house !== house || done?.tmy !== tmy) };
}
