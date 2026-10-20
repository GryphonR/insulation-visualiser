import { describe, expect, it } from 'vitest';
import { MAT } from './data';
import { layerR, sizeToU, swapFit, wallU } from './swap';

const L = (mat: string, t: number, id = 0) => ({ id, mat, t });

describe('swapFit', () => {
  const mw100 = L('mw', 100);
  it('same thickness clamps to the new range', () => {
    expect(swapFit(L('mw', 300), MAT.pir, 'same-t')!.t).toBe(250);
  });
  it('same R never falls short of the old R and is rounded to step', () => {
    const f = swapFit(mw100, MAT.pir, 'same-r')!;
    expect(f.t).toBe(60); // 100 mm x 0.037 -> R 2.70; PIR needs 59.4 -> 60
    expect(f.R).toBeGreaterThanOrEqual(layerR(MAT.mw, 100));
    expect(f.missed).toBe(false);
  });
  it('flags a target beyond the material range', () => {
    const f = swapFit(L('mw', 300), MAT.hemp, 'same-r')!; // R 8.1 needs ~730 mm of hempcrete
    expect(f).toMatchObject({ t: 450, missed: true });
  });
  it('custom U converts to R', () => {
    const f = swapFit(mw100, MAT.eps, 'custom-val', 0.25, 'U')!; // R 4 -> 144 mm of EPS -> 145
    expect(f.t).toBe(145);
  });
  it('rejects unusable custom values', () => {
    expect(swapFit(mw100, MAT.eps, 'custom-t', 0)).toBeNull();
    expect(swapFit(mw100, MAT.eps, 'custom-val', NaN)).toBeNull();
  });
  it('fixed-R new material keeps thickness and reports a miss', () => {
    const f = swapFit(mw100, MAT.cavity, 'same-r')!;
    expect(f).toMatchObject({ t: 100, R: 0.18, missed: true });
  });
});

describe('sizeToU', () => {
  const wall = [L('brick', 102, 1), L('mw', 100, 2), L('pb', 12.5, 3)];
  it('lands at or below the target U', () => {
    const f = sizeToU(wall, 1, 0.2)!;
    expect(f.U).toBeLessThanOrEqual(0.2);
    expect(f.missed).toBe(false);
  });
  it('reports the limit when the target is out of reach', () => {
    expect(sizeToU(wall, 1, 0.01)).toMatchObject({ t: 300, missed: true });
  });
  it('is null for fixed-R layers', () => {
    expect(sizeToU([L('cavity', 50)], 0, 0.3)).toBeNull();
  });
  it('wallU agrees with the sum of resistances', () => {
    expect(wallU(wall)).toBeCloseTo(1 / (0.17 + layerR(MAT.brick, 102) + layerR(MAT.mw, 100) + layerR(MAT.pb, 12.5)));
  });
});
