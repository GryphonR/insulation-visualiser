import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORIENTS } from './data';
import { loadCustomStackups } from './library';
import type { Stackup } from './library';
import { DEFAULT_SCENARIO, inPeriod, runScenario } from './scenario';
import type { Scenario } from './scenario';

const stubStorage = (value: unknown) =>
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(value) });

afterEach(() => vi.unstubAllGlobals());

describe('loadCustomStackups', () => {
  it('drops entries with unknown materials, no layers or bad thickness, and keeps good ones', () => {
    const good: Stackup = { id: 'custom:1', name: 'ok', layers: [['brick', 102], ['pir', 100]] };
    stubStorage([
      good,
      { id: 'custom:2', name: 'stale id', layers: [['no_such_material', 50]] },
      { id: 'custom:3', name: 'empty', layers: [] },
      { id: 'custom:4', name: 'zero thickness', layers: [['brick', 0]] },
      null,
    ]);
    expect(loadCustomStackups()).toEqual([good]);
  });
});

describe('roof orientation', () => {
  const base = (orient: string): Scenario => ({
    ...DEFAULT_SCENARIO,
    orient,
    layers: [{ id: 1, mat: 'pir', t: 100 }, { id: 2, mat: 'conc', t: 150 }],
  });

  it('uses a different inside surface resistance for a roof than for a wall', () => {
    expect(ORIENTS.some((o) => o.id === 'roof')).toBe(true);
    expect(runScenario(base('roof')).sim.U).not.toBeCloseTo(runScenario(base('W')).sim.U, 3);
  });
});

describe('inPeriod', () => {
  it('handles periods that wrap past midnight', () => {
    expect(inPeriod(23, 22, 6)).toBe(true);
    expect(inPeriod(3, 22, 6)).toBe(true);
    expect(inPeriod(12, 22, 6)).toBe(false);
    expect(inPeriod(5, 5, 5)).toBe(false);
  });
});
