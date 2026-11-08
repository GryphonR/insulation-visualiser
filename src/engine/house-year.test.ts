import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import { defaultHouse } from './house-default';
import { simulate, yearRes } from './house-sim';

describe('annual figures from the typical-year run', () => {
  const h = defaultHouse(), res = calcHouse(h), sim = simulate(h, 'year', res);

  it('months add up to the year, and yearRes carries them', () => {
    expect(sim.monthHeat.reduce((a, b) => a + b, 0)).toBeCloseTo(sim.heatKWh, 3);
    expect(sim.monthBought.reduce((a, b) => a + b, 0)).toBeCloseTo(sim.boughtKWh, 3);
    const y = yearRes(h, res, sim);
    expect(y.annualFrom).toBe('year');
    expect(y.annualKWh).toBe(sim.heatKWh);
    expect(y.hp.kwh).toBe(sim.boughtKWh);
    expect(y.months.reduce((a, m) => a + m.heat, 0)).toBeCloseTo(sim.heatKWh, 3);
    expect(y.peakW).toBe(res.peakW);
  });

  it('without a run, scales the degree-day figures and says so', () => {
    const y = yearRes(h, res, null, 0.5);
    expect(y.annualFrom).toBe('estimate');
    expect(y.annualKWh).toBeCloseTo(res.annualKWh / 2, 6);
    expect(y.hp.kwh).toBeCloseTo(res.hp.kwh / 2, 6);
    expect(y.hp.seasonal).toBeCloseTo(res.hp.seasonal, 6);
  });

  it('an applied bills calibration moves the run: warmer rooms use more, a part-heated house less', () => {
    const warm = simulate({ ...h, calib: { dt: 2, q: 1, hf: 1, note: '' } }, 'year');
    const part = simulate({ ...h, calib: { dt: 0, q: 1, hf: 0.7, note: '' } }, 'year');
    expect(warm.heatKWh).toBeGreaterThan(sim.heatKWh * 1.05);
    expect(part.heatKWh).toBeCloseTo(sim.heatKWh * 0.7, 0);
  });
});
