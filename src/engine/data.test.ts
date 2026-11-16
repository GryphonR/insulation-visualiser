import { describe, expect, it } from 'vitest';
import { blend, canonId, ID_ALIASES, MAT, MATERIAL_CATEGORIES, MATERIAL_GROUPS, MATERIALS, PRESETS } from './data';

describe('material library', () => {
  it('has no duplicate ids', () => {
    const ids = MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every material a positive, finite conductivity or a fixed resistance', () => {
    for (const m of MATERIALS) {
      if (m.R !== undefined) {
        expect(m.R).toBeGreaterThan(0);
      } else {
        expect(m.k).toBeGreaterThan(0);
        expect(Number.isFinite(m.k)).toBe(true);
      }
      expect(m.rho).toBeGreaterThan(0);
      expect(m.cp).toBeGreaterThan(0);
    }
  });

  it('keeps each material\'s default thickness within its own min/max', () => {
    for (const m of MATERIALS) {
      expect(m.min).toBeLessThanOrEqual(m.max);
      expect(m.t).toBeGreaterThanOrEqual(m.min);
      expect(m.t).toBeLessThanOrEqual(m.max);
    }
  });

  it('locks air-layer thickness to the value baked into its conductivity', () => {
    const airLayers = MATERIALS.filter((m) => /air layer/i.test(m.name));
    expect(airLayers.length).toBeGreaterThan(0);
    for (const m of airLayers) {
      expect(m.min).toBe(m.max);
    }
  });

  it('groups every material into a listed category exactly once', () => {
    const grouped = MATERIAL_GROUPS.flatMap((g) => g.items);
    expect(grouped.length).toBe(MATERIALS.length);
    for (const m of MATERIALS) {
      expect(MATERIAL_CATEGORIES[m.cat ?? 'common']).toBeTruthy();
    }
  });

  it('resolves every preset layer to a real material', () => {
    for (const p of PRESETS) {
      for (const [matId] of p.layers) {
        expect(MAT[matId]).toBeTruthy();
      }
    }
  });
});

describe('retired material ids', () => {
  it('still resolve to a live material, so old saves keep working', () => {
    for (const [old, id] of Object.entries(ID_ALIASES)) {
      expect(MATERIALS.some((m) => m.id === old)).toBe(false);
      expect(MAT[old]).toBe(MAT[id]);
      expect(canonId(old)).toBe(id);
    }
  });
});

describe('mixed layers', () => {
  it('blends by area: k and heat capacity weighted, vapour in parallel, timber keeps its rot capacity', () => {
    const mw = MAT.mw, t = MAT.m_timber_500_kg_m, x = blend(mw, t, 0.15);
    expect(x.k).toBeCloseTo(0.85 * mw.k! + 0.15 * t.k!, 3);
    expect(x.rho * x.cp / (0.85 * mw.rho * mw.cp + 0.15 * t.rho * t.cp)).toBeCloseTo(1, 2);
    expect(x.mu).toBeCloseTo(1 / (0.85 / mw.mu! + 0.15 / t.mu!), 1);
    expect(x.rho * x.hygro!).toBeCloseTo(0.15 * t.rho * t.hygro!);
    expect(MAT.x_stud_mw.k).toBeCloseTo(x.k!);
    expect(MAT.x_soft_brick_lime.mix).toEqual({ a: 'h_soft_brick', b: 'h_lime_putty_mortar', f: 0.17 });
  });
});
