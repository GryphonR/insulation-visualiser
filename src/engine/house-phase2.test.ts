import { describe, expect, it } from 'vitest';
import { calcHouse, setOutline } from './house';
import type { House } from './house';
import { defaultHouse, withHeating } from './house-default';
import { applyChanges, describe as describeChange, diff, groupChanges, steps } from './house-scenarios';
import { simulate, yearTotals } from './house-sim';
import { TMY_FILES, loadTmy } from './weather-tmy';

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

  it('a new room travels with its window, emitter and face choices as one switchable change', () => {
    const c = structuredClone(a);
    c.rooms.push({ id: 'ext', name: 'Extension', type: 'dining', storey: 0, span: 1, x: 0, y: 7, w: 4.5, d: 3, heated: true, setpoint: 21, ach: 1 });
    c.openings.push({ id: 'oX', room: 'ext', side: 'S', name: 'Bifold', w: 3, h: 2.1, buildup: 'dg' });
    c.heating.emitters.push({ ...c.heating.emitters[0], id: 'RX', room: 'ext' });
    c.faceBoundary['w:ext:W:0'] = 'party';
    c.vent.q50 = 9;
    const groups = groupChanges(diff(a, c));
    expect(groups.length).toBe(2);
    const g = groups.find((x) => x.head.key === 'rooms.#ext')!;
    expect(g.extra).toBe(3);
    expect(JSON.stringify(applyChanges(a, groups.flatMap((x) => x.changes)))).toBe(JSON.stringify(c));
    // Without the room group, none of its window, radiator or face choices are left behind.
    const without = applyChanges(a, groups.filter((x) => x !== g).flatMap((x) => x.changes));
    expect(without.openings.some((o) => o.room === 'ext')).toBe(false);
    expect(without.heating.emitters.some((e) => e.room === 'ext')).toBe(false);
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

  it('typical year from the bundled PVGIS weather: loads for every station and gives a sensible year', async () => {
    const tmy = await loadTmy(7);
    expect(tmy.T.length).toBe(8760);
    expect(tmy.T.reduce((a, b) => a + b, 0) / 8760).toBeCloseTo(9.0, 0);
    expect(Math.max(...tmy.dni)).toBeGreaterThan(500);
    for (let i = 0; i < TMY_FILES.length; i++) expect((await loadTmy(i)).T.length).toBe(8760);
    const real = simulate(h, 'year', calcHouse(h), tmy), synth = simulate(h, 'year');
    expect(real.heatKWh).toBeGreaterThan(synth.heatKWh * 0.7);
    expect(real.heatKWh).toBeLessThan(synth.heatKWh * 1.4);
    expect(Math.min(...real.out)).toBeLessThan(-2);
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

  it('every shared face links two rooms once: an unheated room wrapped round a heated one, with an inside door, balances over its design-calc faces', () => {
    const hh = structuredClone(h);
    const a = { ...hh.rooms[0], id: 'A', name: 'A', x: 0, y: 0, w: 4, d: 4 };
    const b = { ...hh.rooms[0], id: 'B', name: 'B', heated: false, ach: 0.5 };
    setOutline(b, [[4, 0], [6, 0], [6, 6], [0, 6], [0, 4], [4, 4]]);
    hh.storeys = hh.storeys.slice(0, 1);
    hh.rooms = [a, b];
    hh.openings = [{ id: 'd1', room: 'A', to: 'B', side: 'E', name: 'Door', w: 0.8, h: 2, buildup: 'door' }];
    hh.vent.devices = [];
    hh.gains.people = 0;
    hh.gains.living = Array(24).fill(1);
    const ready = withHeating({ ...hh, heating: undefined as unknown as House['heating'] });
    const base = calcHouse(ready), r = simulate(ready, 'design', base);
    // Over a settled day B (no gains, no sun) sits at the U·A-weighted mean of what is around it, ventilation included.
    const avg = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
    const rb = base.rooms.find((x) => x.room.id === 'B')!;
    const near = (to: (typeof rb.faces)[number]['to']) => (to.k === 'out' ? avg(r.out) : to.k === 'ground' ? base.Tg : to.k === 'loft' ? avg(r.loftT!)
      : to.k === 'party' ? hh.neighbourT : avg(r.T[r.rooms.findIndex((x) => x.id === to.id)]));
    const Hv = 0.33 * rb.n * rb.V;
    const num = rb.faces.reduce((t, f) => t + f.U * f.area * near(f.to), Hv * avg(r.out)), den = rb.faces.reduce((t, f) => t + f.U * f.area, Hv);
    expect(rb.faces.filter((f) => f.to.k === 'room').length).toBe(3);
    expect(avg(r.T[r.rooms.findIndex((x) => x.id === 'B')])).toBeCloseTo(num / den, 1);
  });
});
