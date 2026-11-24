import { describe, expect, it } from 'vitest';
import { calcBoth } from '../engine/house';
import { defaultHouse } from '../engine/house-default';
import { mcsView } from './project';

describe('MCS basis view', () => {
  it('shows MCS design figures with the best estimate running costs', () => {
    const best = calcBoth(defaultHouse()), v = mcsView(best);
    expect(v.basis).toBe('mcs');
    expect(v.peakW).toBe(best.mcs!.peakW);
    expect(v.hp.spare).toBe(best.mcs!.hp.spare);
    expect(v.annualKWh).toBe(best.annualKWh);
    expect(v.hp.cost).toBe(best.hp.cost);
    expect(mcsView(best)).toBe(v); // cached, so pages don't re-render on every pick
  });
});
