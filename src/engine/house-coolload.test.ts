import { describe, expect, it } from 'vitest';
import { defaultHouse } from './house-default';
import { calcHouse } from './house';
import { coolingLoad } from './house-sim';

describe('design cooling load', () => {
  const h = defaultHouse(), load = coolingLoad(h, calcHouse(h));

  it('gives every heated room a load whose parts add up', () => {
    expect(load.rooms.some((r) => r.peakW > 500)).toBe(true);
    expect(load.rooms.length).toBe(h.rooms.filter((r) => r.heated).length);
    for (const r of load.rooms) {
      expect(r.peakW).toBeGreaterThanOrEqual(0);
      expect(r.sun + r.inside + r.fabric + r.air + r.other).toBeCloseTo(r.peakW, 3);
    }
  });

  it('block load is no more than the sum of room peaks', () => {
    const sum = load.rooms.reduce((t, r) => t + r.peakW, 0);
    expect(load.blockW).toBeGreaterThan(0);
    expect(load.blockW).toBeLessThanOrEqual(sum + 1);
  });

  it('a cooler setpoint needs more cooling', () => {
    const cold = coolingLoad({ ...h, heating: { ...h.heating, cooling: { on: false, capacity: 5, eer: 3.5, setpoint: 22, flow: 18, dT: 3 } } });
    expect(cold.blockW).toBeGreaterThan(load.blockW);
  });
});
