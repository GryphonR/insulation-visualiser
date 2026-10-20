import { MAT, PRESETS } from './data';
import type { LayerInput } from './simulate';

/** A named, reusable build-up: the comparison library's unit. */
export interface Stackup {
  id: string;
  name: string;
  layers: Array<[string, number]>;
  /** Forces the orientation (used for roof presets); otherwise follows the shared environment. */
  orient?: string;
  /** Built-in stackups can be duplicated into a custom copy but not edited or deleted in place. */
  builtin?: boolean;
}

export const BUILTIN_STACKUPS: Stackup[] = PRESETS.map((p) => ({
  id: `preset:${p.id}`,
  name: p.name,
  layers: p.layers,
  orient: p.orient,
  builtin: true,
}));

const STORAGE_KEY = 'insulation-visualiser.library.v1';

/** Drops entries the simulator would crash on: no layers, or a material id that no longer exists. */
export function validStackup(s: Stackup): boolean {
  return (
    !!s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.layers) && s.layers.length > 0 &&
    s.layers.every((l) => Array.isArray(l) && !!MAT[l[0]] && Number.isFinite(l[1]) && l[1] > 0)
  );
}

export function loadCustomStackups(): Stackup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validStackup) : [];
  } catch {
    return [];
  }
}

export function saveCustomStackups(list: Stackup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Private browsing, storage quota, etc. — the library just won't persist.
  }
}

let nextLayerId = 1;

/** Turn a stored (material, thickness) list into live layer state with fresh React keys. */
export function layersFromTuples(tuples: Array<[string, number]>): LayerInput[] {
  return tuples.map(([mat, t]) => ({ id: nextLayerId++, mat, t }));
}
