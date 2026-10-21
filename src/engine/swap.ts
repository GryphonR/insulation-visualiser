import { clamp } from '../lib/util';
import { MAT } from './data';
import type { Material } from './data';
import type { LayerInput } from './simulate';

export type SwapMode = 'same-t' | 'same-r' | 'custom-t' | 'custom-val';
/** Unit of a typed per-layer value: resistance or U-value (1/R). */
export type ValUnit = 'R' | 'U';

// shortcut: plain series sum with wall films; ignores the roof film (0.10) and the ventilated-gap split in simulate().
// Fine for before/after comparisons in the builder, upgrade if the builder needs to quote the exact simulator U.
const R_FILMS = 0.04 + 0.13;

/** Layer thermal resistance, m²K/W. */
export const layerR = (m: Material, t: number): number => m.R ?? t / 1000 / (m.k as number);

export const wallR = (layers: LayerInput[]): number => R_FILMS + layers.reduce((s, l) => s + layerR(MAT[l.mat], l.t), 0);
export const wallU = (layers: LayerInput[]): number => 1 / wallR(layers);

export interface Fit {
  /** Thickness to use, mm. */
  t: number;
  /** Resulting layer resistance, m²K/W. */
  R: number;
  /** The requested target could not be met (range limit, or a fixed-R material). */
  missed: boolean;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Thickness of `m` that gives layer resistance `R`: rounded up to the step so R is never short, then clamped. */
export function thicknessForR(m: Material, R: number, keepT: number): Fit {
  if (m.R) {
    // Fixed-R layers: thickness doesn't change R, so keep the old one (within range).
    return { t: clamp(keepT, m.min, m.max), R: m.R, missed: Math.abs(m.R - R) > 0.005 };
  }
  const raw = R * (m.k as number) * 1000;
  const t = clamp(round3(Math.ceil(raw / m.step - 1e-9) * m.step), m.min, m.max);
  return { t, R: layerR(m, t), missed: raw < m.min - 1e-9 || raw > m.max + 1e-9 };
}

/** What swapping `old` for material `nm` gives under `mode`; null when a custom value is unusable. */
export function swapFit(old: LayerInput, nm: Material, mode: SwapMode, value = NaN, unit: ValUnit = 'R'): Fit | null {
  const oldR = layerR(MAT[old.mat], old.t);
  switch (mode) {
    case 'same-t': {
      const t = clamp(old.t, nm.min, nm.max);
      return { t, R: layerR(nm, t), missed: false };
    }
    case 'same-r':
      return thicknessForR(nm, oldR, old.t);
    case 'custom-t': {
      if (!(value > 0)) return null;
      const t = clamp(value, nm.min, nm.max);
      return { t, R: layerR(nm, t), missed: false };
    }
    case 'custom-val': {
      if (!(value > 0)) return null;
      return thicknessForR(nm, unit === 'U' ? 1 / value : value, old.t);
    }
  }
}

/** Thickness of layer `i` that brings the whole wall to `targetU` (others unchanged). Null for fixed-R layers or bad input. */
export function sizeToU(layers: LayerInput[], i: number, targetU: number): (Fit & { U: number }) | null {
  const m = MAT[layers[i].mat];
  if (m.R || m.min === m.max || !(targetU > 0)) return null;
  const others = wallR(layers) - layerR(m, layers[i].t);
  const fit = thicknessForR(m, Math.max(1 / targetU - others, 1e-6), layers[i].t);
  return { ...fit, U: 1 / (others + fit.R) };
}

export type Role = 'insulation' | 'air' | 'dense' | 'other';
export const ROLE_LABELS: Record<Role, string> = { insulation: 'Insulation', air: 'Air & foil', dense: 'Masonry & dense', other: 'Timber & boards' };

export function roleOf(m: Material): Role {
  // Imported air layers carry an effective k at one fixed thickness instead of R, but sit in the 'cavity' category.
  if (m.R || m.cat === 'cavity') return 'air';
  const k = m.k as number;
  return k <= 0.06 ? 'insulation' : k >= 0.5 ? 'dense' : 'other';
}
