import { describe, expect, it } from 'vitest';
import { MAT, MATERIAL_CATEGORIES, MATERIAL_GROUPS, MATERIALS, PRESETS } from './data';

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
