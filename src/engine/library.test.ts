import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORIENTS } from './data';
import { loadCustomStackups } from './library';
import type { Stackup } from './library';
import { inPeriod, runScenario } from './scenario';
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
    layers: [{ id: 1, mat: 'pir', t: 100 }, { id: 2, mat: 'conc', t: 150 }],
    loc: 'bir', month: 6, weather: 'typical', orient, colour: 'mid',
    heat: 'fixed', tin: 21, comfort: 21, setback: 16, on1: 6, off1: 9, on2: 17, off2: 22,
    floor: 16, elA: 12, glA: 2, rest: 20, ach: 3, gains: 150, glaz: 'std', mass: 'med',
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
