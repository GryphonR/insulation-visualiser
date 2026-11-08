import { describe, expect, it } from 'vitest';
import { footprint, roofAt, roofLines, roofModel } from './house-roof';
import type { RoofEdge } from './house-roof';
import { pointInPoly, polyArea } from './geom';
import type { Pt } from './geom';

const t35 = Math.tan((35 * Math.PI) / 180);
const all = (n: number, pitch = 35): RoofEdge[] => Array.from({ length: n }, () => ({ kind: 'eave', pitch }));
const rect = (w: number, d: number): Pt[] => [[0, 0], [w, 0], [w, d], [0, d]];

/** The roof never rises faster than its steepest pitch between neighbouring points: no dents, steps or spikes. */
function smooth(poly: Pt[], es: RoofEdge[], step = 0.1) {
  const m = roofModel(poly, es, 0), tmax = Math.max(...es.filter((e) => e.kind === 'eave').map((e) => Math.tan((e.pitch * Math.PI) / 180)));
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  let worst = 0;
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
    const p: Pt = [x, y], q: Pt = [x + step, y], r: Pt = [x, y + step];
    if (!pointInPoly(p, poly)) continue;
    const z = roofAt(m, p).z;
    expect(z).toBeGreaterThanOrEqual(-1e-6);
    for (const o of [q, r]) if (pointInPoly(o, poly)) worst = Math.max(worst, Math.abs(roofAt(m, o).z - z) / step);
  }
  return worst / tmax;
}

describe('roof planes', () => {
  it('hip over a rectangle: height is pitch × distance to the nearest eave', () => {
    const m = roofModel(rect(10, 6), all(4), 2.4);
    expect(roofAt(m, [5, 3]).z).toBeCloseTo(2.4 + 3 * t35, 6);
    expect(roofAt(m, [1, 3]).z).toBeCloseTo(2.4 + 1 * t35, 6);
    expect(roofAt(m, [5, 0.5]).i).toBe(0);
  });
  it('gable: the end walls rise to the ridge', () => {
    const m = roofModel(rect(10, 6), [{ kind: 'eave', pitch: 35 }, { kind: 'gable', pitch: 35 }, { kind: 'eave', pitch: 35 }, { kind: 'gable', pitch: 35 }], 0);
    expect(roofAt(m, [0.2, 3]).z).toBeCloseTo(3 * t35, 6);
    expect(roofAt(m, [0.2, 1]).z).toBeCloseTo(1 * t35, 6);
  });
  it('monopitch rises away from its one eave; flat stays at the plate', () => {
    const m = roofModel(rect(4, 3), [{ kind: 'gable', pitch: 15 }, { kind: 'gable', pitch: 15 }, { kind: 'eave', pitch: 15 }, { kind: 'gable', pitch: 15 }], 2.4);
    expect(roofAt(m, [2, 0.1]).z).toBeCloseTo(2.4 + 2.9 * Math.tan((15 * Math.PI) / 180), 6);
    expect(roofAt(roofModel(rect(4, 3), all(4, 0), 2.4), [2, 1.5]).z).toBeCloseTo(2.4, 9);
  });
  it('L, T and U shaped hips have valleys and no dents', () => {
    const L: Pt[] = [[0, 0], [9, 0], [9, 3], [3, 3], [3, 9], [0, 9]];
    const T: Pt[] = [[0, 0], [9, 0], [9, 3], [6, 3], [6, 9], [3, 9], [3, 3], [0, 3]];
    const U: Pt[] = [[0, 0], [3, 0], [3, 3], [6, 3], [6, 0], [9, 0], [9, 6], [0, 6]];
    for (const p of [L, T, U]) expect(smooth(p, all(p.length))).toBeLessThan(1.05);
    // Arms 3 m wide: nowhere higher than the ridge of a 3 m span.
    const m = roofModel(L, all(6), 0);
    expect(roofAt(m, [1.5, 6]).z).toBeCloseTo(1.5 * t35, 6);
    expect(roofAt(m, [2.9, 2.9]).z).toBeLessThanOrEqual(1.5 * t35 + 1e-6);
  });
  it('mixed pitches and gables on an L stay smooth', () => {
    const L: Pt[] = [[0, 0], [9, 0], [9, 3], [3, 3], [3, 9], [0, 9]];
    const es: RoofEdge[] = [{ kind: 'eave', pitch: 40 }, { kind: 'gable', pitch: 40 }, { kind: 'eave', pitch: 30 }, { kind: 'eave', pitch: 30 }, { kind: 'gable', pitch: 30 }, { kind: 'eave', pitch: 40 }];
    expect(smooth(L, es)).toBeLessThan(1.05);
  });
  it('draws the ridge of a gable along the middle', () => {
    const lines = roofLines(roofModel(rect(10, 6), [{ kind: 'eave', pitch: 35 }, { kind: 'gable', pitch: 35 }, { kind: 'eave', pitch: 35 }, { kind: 'gable', pitch: 35 }], 0), 0.25);
    expect(lines.length).toBeGreaterThan(10);
    for (const [a, b] of lines) { expect(a[1]).toBeCloseTo(3, 6); expect(b[1]).toBeCloseTo(3, 6); }
  });
});

describe('footprint', () => {
  it('two rooms with a wall gap between them make one outline, grown by the outside wall', () => {
    const f = footprint([[[0, 0], [4, 0], [4, 3], [0, 3]], [[4.1, 0], [8, 0], [8, 3], [4.1, 3]]], 0.3);
    expect(f).toHaveLength(1);
    expect(f[0]).toHaveLength(4);
    expect(polyArea(f[0])).toBeCloseTo(8.6 * 3.6, 1);
  });
  it('keeps an L shape square-cornered, and separate buildings separate', () => {
    const L = footprint([[[0, 0], [6, 0], [6, 3], [0, 3]], [[0, 3.1], [3, 3.1], [3, 7], [0, 7]]], 0.25);
    expect(L[0]).toHaveLength(6);
    expect(footprint([rect(3, 3), [[10, 0], [13, 0], [13, 3], [10, 3]]], 0.25)).toHaveLength(2);
  });
});
