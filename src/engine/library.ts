import { MAT, PRESETS } from './data';
import { DEFAULT_SCENARIO } from './scenario';
import type { Scenario } from './scenario';
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

const SCENARIO_KEY = 'insulation-visualiser.scenario.v1';

/**
 * The saved simulation inputs (null if none usable) and a plain-English reason for each layer dropped.
 * Anything missing or malformed falls back to the default, so stale saves can't crash the app.
 */
export function loadScenario(): { sc: Scenario | null; dropped: string[] } {
  const dropped: string[] = [];
  try {
    const p = JSON.parse(localStorage.getItem(SCENARIO_KEY) ?? 'null');
    if (!p || typeof p !== 'object' || !Array.isArray(p.layers)) return { sc: null, dropped };
    const layers = p.layers.filter((l: LayerInput) => {
      if (!l || !MAT[l.mat]) {
        dropped.push(`A layer made of "${l?.mat ?? 'unknown'}" was removed because that material is no longer available.`);
        return false;
      }
      if (!Number.isFinite(l.t) || l.t <= 0) {
        dropped.push(`A ${MAT[l.mat].name} layer was removed because its saved thickness wasn't a valid number.`);
        return false;
      }
      return true;
    });
    if (!layers.length) return { sc: null, dropped };
    const sc: Scenario = { ...DEFAULT_SCENARIO, layers: layers.map((l: LayerInput, i: number) => ({ id: i + 1, mat: l.mat, t: l.t })) };
    for (const k of Object.keys(DEFAULT_SCENARIO) as Array<keyof Scenario>) {
      if (k !== 'layers' && typeof p[k] === typeof DEFAULT_SCENARIO[k]) (sc as unknown as Record<string, unknown>)[k] = p[k];
    }
    if (!Number.isInteger(sc.month) || sc.month < 0 || sc.month > 11) sc.month = DEFAULT_SCENARIO.month;
    return { sc, dropped };
  } catch {
    return { sc: null, dropped };
  }
}

export function saveScenario(sc: Scenario): void {
  try {
    localStorage.setItem(SCENARIO_KEY, JSON.stringify(sc));
  } catch {
    // Private browsing, storage quota, etc. — the inputs just won't persist.
  }
}

let nextLayerId = 1;

/** Turn a stored (material, thickness) list into live layer state with fresh React keys. */
export function layersFromTuples(tuples: Array<[string, number]>): LayerInput[] {
  return tuples.map(([mat, t]) => ({ id: nextLayerId++, mat, t }));
}
