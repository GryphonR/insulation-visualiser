import { useEffect, useMemo, useRef, useState } from 'react';
import { calcHouse } from '../engine/house';
import type { House } from '../engine/house';
import type { SimResult } from '../engine/house-sim';
import { loadTmy } from '../engine/weather-tmy';

// Houses are never mutated (edits go to a copy), so a finished run stays valid for as long as its house exists.
const done = new WeakMap<House, SimResult>();
/** Wait this long after the last edit before starting runs, so dragging on the plan doesn't start one per mouse move. */
const SETTLE_MS = 250;

/**
 * Typical-year runs for several houses, one worker each, cached by house. A house's own weather setting picks synthetic
 * or real hourly weather. Pass a memoised array: a run still going when its house leaves the list is stopped.
 */
export function useYearSims(houses: House[]): Array<SimResult | null> {
  const [, bump] = useState(0);
  useEffect(() => {
    const todo = houses.filter((h, i) => !done.has(h) && houses.indexOf(h) === i);
    if (!todo.length) return;
    let live = true;
    const workers: Worker[] = [];
    const t = setTimeout(() => todo.forEach(async (house) => {
      const base = calcHouse(house);
      // A weather file that won't load falls back to the synthetic year rather than leaving the figures unfinished.
      const tmy = house.climate.weather === 'tmy' ? await loadTmy(base.climate.station).catch(() => undefined) : undefined;
      if (!live) return;
      const w = new Worker(new URL('../engine/house-sim.worker.ts', import.meta.url), { type: 'module' });
      workers.push(w);
      w.onmessage = (e: MessageEvent<SimResult>) => { done.set(house, e.data); w.terminate(); if (live) bump((n) => n + 1); };
      w.onerror = () => w.terminate();
      w.postMessage({ house, base, tmy });
    }), SETTLE_MS);
    return () => { live = false; clearTimeout(t); workers.forEach((w) => w.terminate()); };
  }, [houses]);
  return houses.map((h) => done.get(h) ?? null);
}

/** One house's typical year: the latest finished run (kept while a newer one goes) and whether a newer one is still going. */
export function useYearSim(house: House | undefined): { result: SimResult | null; busy: boolean } {
  const list = useMemo(() => (house ? [house] : []), [house]);
  const [r = null] = useYearSims(list);
  const last = useRef<SimResult | null>(null);
  if (r) last.current = r;
  return { result: house ? r ?? last.current : null, busy: !!house && !r };
}
