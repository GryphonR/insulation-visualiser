import { describe, expect, it } from 'vitest';
import { MAT } from './data';
import { edgeR, groundFloorU } from './house';
import type { Buildup, FloorEdge } from './house';

const slab = { id: 'sf', name: '', kind: 'floor', layers: [['m_concrete_reinforced', 100], ['m_cement_sand', 65]] } as Buildup;
const edge = (p: Partial<FloorEdge>): FloorEdge => ({ edge: 'vertical', D: 0.6, R: 1.5, upstand: 'off', psi: 0, ...p });

describe('foundation edge insulation from a material', () => {
  it('works out R from the material and thickness, and an older typed-in R still counts', () => {
    expect(edgeR(edge({ mat: 'm_xps_033', t: 50 }))).toBeCloseTo(0.05 / (MAT.m_xps_033.k as number), 6);
    expect(edgeR(edge({}))).toBe(1.5);
  });

  it('thicker insulation lowers the floor U, and vertical beats horizontal of the same size', () => {
    const U = (p: Partial<FloorEdge>) => groundFloorU(slab, 4, 0, edge({ mat: 'm_xps_033', ...p }));
    expect(U({ t: 100 })).toBeLessThan(U({ t: 25 }));
    expect(U({ t: 50 })).toBeLessThan(U({ t: 50, edge: 'horizontal' }));
    expect(U({ t: 50, edge: 'none' })).toBeGreaterThan(U({ t: 50 }));
  });
});
