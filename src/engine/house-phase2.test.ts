import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import type { House } from './house';
import { defaultHouse, withHeating } from './house-default';
import { applyChanges, describe as describeChange, diff, steps } from './house-scenarios';
import { simulate, yearTotals } from './house-sim';

describe('scenarios', () => {
  const a = defaultHouse();
  const b = structuredClone(a);
  b.faceBuildup['w:bed3:S:1'] = 'cav';
  b.vent.factors.find((f) => f.id === 'strip')!.on = true;
  b.openings = b.openings.filter((o) => o.id !== 'o1');
  b.rooms.find((r) => r.id === 'wc')!.setpoint = 20;

  it('lists each change once', () => {
    const ch = diff(a, b);
    expect(ch.map((c) => c.key).sort()).toEqual(['faceBuildup.w:bed3:S:1', 'openings.#o1', 'rooms.#wc.setpoint', 'vent.factors.#strip.on'].sort());
  });

  it('applying every change rebuilds the child exactly', () => {
    expect(JSON.stringify(applyChanges(a, diff(a, b)))).toBe(JSON.stringify(b));
  });

  it('describes changes in plain words', () => {
    const d = diff(a, b).map((c) => describeChange(c, a, b));
    expect(d).toContainEqual({ what: 'Bedroom 3, south wall', from: 'Solid brick, 225 mm', to: 'Cavity wall, PIR filled' });
    expect(d).toContainEqual({ what: 'Airtightness: Doors draught-stripped', from: 'off', to: 'on' });
  });

  it('step-by-step ends at the child result', () => {
    const s = steps(a, diff(a, b));
    expect(s[s.length - 1].peakW).toBeCloseTo(calcHouse(b).peakW, 6);
    expect(s[s.length - 1].peakW).toBeLessThan(s[0].peakW);
  });
});

describe('hour-by-hour runs', () => {
  const h = defaultHouse();

  it('design day, heating on all day with radiators sized for the loss: every heated room holds its setpoint', () => {
    const hh = withHeating({ ...structuredClone(h), heating: undefined as unknown as House['heating'] });
    hh.gains.living = Array(24).fill(1);
    hh.gains.bedrooms = Array(24).fill(1);
    const r = simulate(hh, 'design');
    r.rooms.forEach((room, i) => { if (room.heated) expect(Math.min(...r.T[i]), room.name).toBeGreaterThan(room.setpoint - 0.3); });
    expect(r.peakW).toBeLessThanOrEqual(hh.hp.capacity * 1000 + 1);
  });

  it('design day, demo house: the undersized kitchen radiator leaves the kitchen short even with heating on all day', () => {
    const hh = structuredClone(h);
    hh.gains.living = Array(24).fill(1);
    const r = simulate(hh, 'design');
    const k = r.rooms.findIndex((x) => x.id === 'kitchen'), l = r.rooms.findIndex((x) => x.id === 'living');
    expect(Math.min(...r.T[k])).toBeLessThan(20.5);
    expect(Math.min(...r.T[l])).toBeGreaterThan(20.7);
  });

  it('design day with a setback: rooms are short after the reheat starts', () => {
    const r = simulate(h, 'design');
    const i = r.rooms.findIndex((x) => x.id === 'living');
    expect(r.comfort[i].cold).toBeGreaterThan(0);
  });

  it('cold snap: rooms cool once the heating is off', () => {
    const r = simulate(h, 'snap');
    const i = r.rooms.findIndex((x) => x.id === 'bed1');
    expect(r.T[i][r.hours - 1]).toBeLessThan(r.T[i][0] - 3);
    expect(r.T[i][0]).toBeGreaterThan(19);
    expect(r.comfort[i].below16).toBeGreaterThan(3);
    expect(r.heatKWh).toBe(0);
  });

  it('summer day: no heating and warmer than outside on average', () => {
    const r = simulate(h, 'summer');
    expect(r.heatKWh).toBe(0);
    const i = r.rooms.findIndex((x) => x.id === 'bed3');
    const avg = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(avg(r.T[i])).toBeGreaterThan(avg(r.out));
  });

  it('typical year: heat mostly in winter, total in the same range as the degree-day estimate', () => {
    const r = simulate(h, 'year');
    const y = yearTotals(r);
    expect(y.months[0]).toBeGreaterThan(y.months[6] * 5);
    const dd = calcHouse(h).annualKWh;
    expect(r.heatKWh).toBeGreaterThan(dd * 0.5);
    expect(r.heatKWh).toBeLessThan(dd * 1.3);
    console.log('year', Math.round(r.heatKWh), 'dd', Math.round(dd), 'peak', Math.round(r.peakW), 'scop', (r.heatKWh / r.elecKWh).toFixed(2), y.months.map(Math.round).join(','));
  });
});
