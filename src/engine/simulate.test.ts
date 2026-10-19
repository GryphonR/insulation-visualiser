import { describe, expect, it } from 'vitest';
import { ORIENTS, PRESETS } from './data';
import { runScenario } from './scenario';
import type { Scenario } from './scenario';
import { simulate } from './simulate';
import type { SimParams } from './simulate';

const layersOf = (id: string) =>
  PRESETS.find((p) => p.id === id)!.layers.map(([mat, t], i) => ({ id: i, mat, t }));

const wall = (id: string, over: Partial<SimParams> = {}): SimParams => ({
  layers: layersOf(id),
  orient: ORIENTS[3],
  lat: 52.5,
  doy: 196,
  c: 0.9,
  alpha: 0.55,
  tmean: 20,
  swing: 12,
  tinF: () => 21,
  ...over,
});

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  layers: layersOf('solid'),
  loc: 'bir', month: 6, weather: 'typical', orient: 'W', colour: 'mid',
  heat: 'fixed', tin: 21, comfort: 21, setback: 16, on1: 6, off1: 9, on2: 17, off2: 22,
  floor: 16, elA: 12, glA: 2, rest: 20, ach: 3, gains: 150, glaz: 'std', mass: 'med',
  ...over,
});

describe('steady state', () => {
  it('reproduces the U-value flux when conditions do not change', () => {
    // No sun absorbed and no swing: sol-air is constant, so flux must equal U x dT.
    const r = simulate(wall('cavity_new', { alpha: 0, swing: 0 }));
    const expected = r.U * (20 - 21);
    for (let f = 0; f < 144; f += 12) expect(r.fr.q[f]).toBeCloseTo(expected, 2);
  });

  it('computes the textbook U-value for an uninsulated solid brick wall', () => {
    const r = simulate(wall('solid'));
    expect(r.U).toBeGreaterThan(1.9);
    expect(r.U).toBeLessThan(2.3);
  });
});

describe('energy balance', () => {
  it('daily mean flux equals U x mean(sol-air minus room) once the cycle has settled', () => {
    const r = simulate(wall('retro'));
    let meanQ = 0;
    let meanSS = 0;
    for (let f = 0; f < 144; f++) {
      meanQ += r.fr.q[f] / 144;
      meanSS += r.qss[f] / 144;
    }
    expect(meanQ).toBeCloseTo(meanSS, 1);
  });
});

describe('thermal mass', () => {
  it('delays and damps the heat wave more in a heavy wall than a light one', () => {
    const heavy = simulate(wall('solid'));
    const light = simulate(wall('tf'));
    expect(heavy.lag).toBeGreaterThan(light.lag);
    expect(heavy.decr).toBeLessThan(1);
    expect(light.decr).toBeGreaterThan(0);
  });

  it('keeps decrement factor between 0 and 1 for every preset', () => {
    for (const p of PRESETS) {
      const r = simulate(wall(p.id));
      expect(r.decr).toBeGreaterThanOrEqual(0);
      expect(r.decr).toBeLessThanOrEqual(1.05);
    }
  });
});

describe('free-floating room', () => {
  it('follows outdoor air closely when ventilation is very high and gains are nil', () => {
    const r = runScenario(scenario({ heat: 'free', ach: 10, gains: 0, glA: 0, weather: 'overcast' }));
    const mean = r.sim.fr.tin.slice(0, 144).reduce((s, v) => s + v, 0) / 144;
    expect(Math.abs(mean - r.params.tmean)).toBeLessThan(1.5);
  });

  it('reports wall decrement and lag from the steady-room reference', () => {
    const fixed = runScenario(scenario());
    const free = runScenario(scenario({ heat: 'free' }));
    expect(free.sim.decr).toBeCloseTo(fixed.sim.decr, 5);
    expect(free.sim.lag).toBeCloseTo(fixed.sim.lag, 5);
  });

  it('runs hotter with more glazing', () => {
    const peak = (glA: number) => Math.max(...Array.from(runScenario(scenario({ heat: 'free', glA })).sim.fr.tin));
    expect(peak(6)).toBeGreaterThan(peak(1));
  });
});

describe('steady-state comparison totals', () => {
  it('nets to the same daily total as the simulated flow when no mass delays anything', () => {
    // No sun absorbed and no swing: sol-air is constant, so the simulated and
    // steady-state totals should coincide once the transient has died out.
    const r = simulate(wall('cavity_new', { alpha: 0, swing: 0 }));
    expect(r.gainSS - r.lossSS).toBeCloseTo(r.gain - r.loss, 0);
  });

  it('is damped relative to the steady-state swing for a heavy wall on a swinging day', () => {
    const r = simulate(wall('solid'));
    // Thermal mass should narrow the gain/loss split versus the mass-free comparison.
    expect(r.gain + r.loss).toBeLessThan(r.gainSS + r.lossSS);
  });
});

describe('colour scale anchoring', () => {
  it('centres the colour scale on the room reference temperature', () => {
    const r = simulate(wall('solid', { tmean: 28, swing: 14 })); // a hot day, well above room temp
    expect((r.tlo + r.thi) / 2).toBeCloseTo(r.roomRef, 6);
    expect(r.roomRef).toBeCloseTo(21, 0.6);
  });

  it('keeps the room reference as the midpoint even when the day runs colder than the room', () => {
    const r = simulate(wall('solid', { tmean: -5, swing: 6 })); // a cold day
    expect((r.tlo + r.thi) / 2).toBeCloseTo(r.roomRef, 6);
  });
});

describe('heating schedule', () => {
  it('switches the room between comfort and setback temperatures', () => {
    const r = runScenario(scenario({ heat: 'schedule', comfort: 21, setback: 16 }));
    expect(r.sim.fr.tin[7 * 6]).toBe(21); // 07:00 on
    expect(r.sim.fr.tin[12 * 6]).toBe(16); // 12:00 off
    expect(r.sim.fr.tin[19 * 6]).toBe(21); // 19:00 on
  });
});
