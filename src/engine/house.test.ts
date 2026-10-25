import { describe, expect, it } from 'vitest';
import { MAT } from './data';
import { buildupU, calcHouse, groundFloorU } from './house';
import { defaultHouse } from './house-default';
import { MCS_MEAN_TEMPS, MCS_STATIONS, climateFromPostcode, designTemp, postcodeArea } from './climate-mcs';

describe('whole-house model', () => {
  const h = defaultHouse();
  const res = calcHouse(h);
  const room = (id: string) => res.rooms.find((r) => r.room.id === id)!;

  it('uses only known materials in the demo house', () => {
    for (const b of h.buildups) for (const [m] of b.layers) expect(MAT[m], `${b.name}: ${m}`).toBeTruthy();
  });

  it('takes U-values from the stack-up layers', () => {
    expect(buildupU(h.buildups.find((b) => b.id === 'cav')!)).toBeCloseTo(0.174, 2);
    expect(buildupU(h.buildups.find((b) => b.id === 'dg')!)).toBe(1.4);
  });

  it('builds the demo plan with no errors', () => {
    expect(res.checks.filter((c) => c.level === 'error')).toEqual([]);
  });

  it('internal transfers between heated rooms cancel out over the house', () => {
    let net = 0;
    for (const r of res.rooms.filter((x) => x.room.heated)) for (const row of r.rows) {
      const other = res.rooms.find((o) => o.room.name === row.to);
      if (other?.room.heated) net += row.W;
    }
    expect(Math.abs(net)).toBeLessThan(1e-6);
  });

  it('derives each face once per side: living room has two outside walls, kitchen above-floor neighbour', () => {
    const lr = room('living');
    expect(new Set(lr.faces.filter((f) => f.to.k === 'out' && f.kind === 'wall').map((f) => f.side))).toEqual(new Set(['N', 'W']));
    expect(lr.faces.find((f) => f.kind === 'ceiling')?.to).toEqual({ k: 'room', id: 'bed1' });
    expect(room('bath').faces.some((f) => f.kind === 'floor' && f.to.k === 'room' && f.to.id === 'utility')).toBe(true);
  });

  it('settles unheated spaces between outside and inside', () => {
    const u = room('utility').T;
    expect(u).toBeGreaterThan(res.Tout);
    expect(u).toBeLessThan(21);
    expect(res.loft!.T).toBeGreaterThan(res.Tout);
    expect(res.loft!.T).toBeLessThan(res.Tout + 3);
  });

  it('applies the MCS 0.5 ach minimum to habitable rooms only', () => {
    const hh = defaultHouse();
    hh.vent.source = 'meas';
    hh.vent.q50 = 1;
    hh.vent.devices = [];
    const r = calcHouse(hh);
    expect(r.rooms.find((x) => x.room.id === 'bed1')!.n).toBe(0.5);
    expect(r.rooms.find((x) => x.room.id === 'kitchen')!.n).toBeLessThan(0.5);
  });

  it('path totals add up to the peak', () => {
    expect(res.paths.reduce((t, p) => t + p.W, 0)).toBeCloseTo(res.peakW, 6);
  });

  it('switching a wall to party removes its loss when the neighbour is as warm as the room', () => {
    const hh = defaultHouse();
    hh.faceBoundary['w:living:W:0'] = 'party';
    hh.neighbourT = 21;
    const lr = calcHouse(hh).rooms.find((x) => x.room.id === 'living')!;
    expect(lr.rows.find((r) => r.key === 'w:living:W:0')!.W).toBeCloseTo(0, 6);
  });

  it('MCS climate helpers', () => {
    expect(designTemp(7, 60, '99.6')).toBe(-4.5);
    expect(designTemp(7, 300, '99.6')).toBe(-5.7); // 212 m above Woodford: two whole 100 m steps
    expect(postcodeArea('m14 5ab')).toBe('M');
    expect(res.hdd).toBe(2228);
  });

  it('postcode picks the nearest MCS station and region (bundled district table)', () => {
    const st = (pc: string) => { const c = climateFromPostcode(pc); return c && [MCS_STATIONS[c.station][0], MCS_MEAN_TEMPS[c.region][0]]; };
    expect(st('M14 5AB')).toEqual(['Manchester', 'West Pennines']);
    expect(st('PL1 2AB')).toEqual(['Plymouth', 'South West England']);
    expect(st('EH1 1AA')![0]).toBe('Edinburgh');
    expect(st('JE2 3AB')![0]).toMatch(/St Helier/);
    expect(st('M')![0]).toBe('Manchester');
    expect(climateFromPostcode('ZZ9 9ZZ')).toBeNull();
    const hh = defaultHouse();
    hh.climate.postcode = 'PL4 8AA';
    expect(calcHouse(hh).Tout).toBe(-1.5);
    hh.climate.auto = false;
    expect(calcHouse(hh).Tout).toBe(-4.5);
  });

  it('ground floor U falls with a larger floor', () => {
    const sf = h.buildups.find((b) => b.id === 'sf')!;
    expect(groundFloorU(sf, 8)).toBeLessThan(groundFloorU(sf, 3));
  });

  it('prints the demo house figures', () => {
    console.log(JSON.stringify({
      Tout: res.Tout, Tg: res.Tg, peak: Math.round(res.peakW), paths: res.paths.map((p) => [p.label, Math.round(p.W)]),
      q50: res.q50, env: Math.round(res.envelope), V: Math.round(res.heatedV), utility: room('utility').T.toFixed(1), loft: res.loft!.T.toFixed(1),
      kitchen: [room('kitchen').n.toFixed(2), Math.round(room('kitchen').ventW)], annual: Math.round(res.annualKWh), hp: res.hp,
      rooms: res.rooms.map((r) => [r.room.name, Math.round(r.totalW), r.n.toFixed(2)]),
    }));
  });
});
