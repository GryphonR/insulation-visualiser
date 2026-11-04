import { useEffect, useState } from 'react';
import type { MoistureInput, MoistureResult } from '../engine/moisture';

/**
 * Runs the moisture model for each input in a worker. Returns the last finished results (null until the
 * first) and whether a newer run is still going. A change of inputs abandons the run in progress.
 */
export function useMoisture(inputs: Array<MoistureInput | null>): { results: Array<MoistureResult | null> | null; busy: boolean } {
  const key = JSON.stringify(inputs);
  const [done, setDone] = useState<{ key: string; results: Array<MoistureResult | null> } | null>(null);
  useEffect(() => {
    const w = new Worker(new URL('../engine/moisture.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Array<MoistureResult | null>>) => setDone({ key, results: e.data });
    w.postMessage(JSON.parse(key));
    return () => w.terminate();
  }, [key]);
  return { results: done?.results ?? null, busy: done?.key !== key };
}
