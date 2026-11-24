import { describe, expect, it } from 'vitest';
import { MAT } from './data';
import { buildupU, calcBoth, calcHouse, dhwDemand, groundFloorU } from './house';
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

  it('uses a heated room\'s air change override in place of the calculated rate', () => {
    const r = h.rooms.find((x) => x.heated)!, h2 = structuredClone(h);
    h2.rooms.find((x) => x.id === r.id)!.achOverride = 3;
    const was = room(r.id), now = calcHouse(h2).rooms.find((x) => x.room.id === r.id)!;
    expect(now.n).toBe(3);
    expect(now.ventW).toBeCloseTo(was.ventW * 3 / was.n, 6);
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

  it('MVHR: the supply counts toward the 0.5 ach minimum and loses only what the heat recovery misses', () => {
    const hh = defaultHouse();
    hh.vent.source = 'meas'; hh.vent.q50 = 1; hh.vent.devices = [];
    hh.vent.mech = 'mvhr'; hh.vent.mechFlow = 200; hh.vent.eta = 90;
    const bed = () => calcHouse(hh).rooms.find((x) => x.room.id === 'bed1')!;
    expect(bed().n).toBeLessThan(0.5);
    hh.vent.eta = 0; // no recovery: the minimum is met by air at the outside temperature
    expect(bed().n).toBeGreaterThanOrEqual(0.5 - 1e-9);
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

  it('applies the 0.5 ach minimum to every room with outside envelope, halved for the whole house (f_i-z)', () => {
    const hh = defaultHouse();
    hh.vent.source = 'meas';
    hh.vent.q50 = 1;
    hh.vent.devices = [];
    const r = calcHouse(hh), k = r.rooms.find((x) => x.room.id === 'kitchen')!;
    expect(r.rooms.find((x) => x.room.id === 'bed1')!.n).toBeCloseTo(0.5, 9);
    expect(k.n).toBeCloseTo(0.5, 9);
    expect(k.nZone).toBeCloseTo(0.25, 9);
    expect(r.peakW).toBeLessThan(r.roomSumW);
  });

  it('EN 12831-1: rooms take the wind on their own side (f_dir 2), the house as a whole does not', () => {
    const k = room('kitchen');
    expect(k.n).toBeGreaterThan(k.nZone * 1.5);
    expect(res.paths.find((p) => p.label === 'Ventilation')!.W).toBeCloseTo(res.rooms.reduce((t, x) => t + x.ventZoneW, 0), 6);
  });

  it('MCS basis: ΔU bridging on the heated envelope in place of the floor-edge Ψ; the best estimate keeps its own', () => {
    const hh = defaultHouse(), best = calcHouse(hh), mcs = calcHouse(hh, 'mcs');
    expect(best.basis).toBe('best');
    expect(best.tb).toBe(0);
    expect(mcs.tb).toBe(0.15);
    expect(mcs.peakW).toBeGreaterThan(best.peakW);
    for (const x of mcs.rooms.filter((y) => y.room.heated)) expect(x.rows.reduce((t, row) => t + row.W, 0)).toBeCloseTo(x.totalW, 6);
    expect(mcs.paths.reduce((t, p) => t + p.W, 0)).toBeCloseTo(mcs.peakW, 6);
    expect(calcBoth(hh).mcs!.peakW).toBeCloseTo(mcs.peakW, 9);
  });

  it('both bases agree when every MCS convention already holds', () => {
    const hh = defaultHouse();
    hh.tb = 0; hh.floorEdge = undefined; hh.neighbourT = 10; delete hh.climate.designT; hh.calib = undefined;
    expect(calcHouse(hh, 'mcs').peakW).toBeCloseTo(calcHouse(hh).peakW, 6);
  });

  it('MCS basis ignores your own design temperature (it changes only the best estimate)', () => {
    const hh = defaultHouse(), mcs0 = calcHouse(hh, 'mcs').peakW;
    hh.climate.designT = 2;
    expect(calcHouse(hh).Tout).toBe(2);
    expect(calcHouse(hh, 'mcs').Tout).toBe(calcHouse(hh, 'mcs').ToutMcs);
    expect(calcHouse(hh, 'mcs').peakW).toBeCloseTo(mcs0, 6);
    expect(calcHouse(hh, 'mcs').checks.some((c) => c.text.includes('best estimate only'))).toBe(true);
  });

  it('MCS basis raises rooms below MIS 3005-D Table 1 to its minimum; the best estimate keeps your setpoint', () => {
    const hh = defaultHouse(), r = hh.rooms.find((x) => x.heated && x.type === 'living')!;
    r.setpoint = 17;
    expect(calcHouse(hh).rooms.find((x) => x.room.id === r.id)!.T).toBe(17);
    const m = calcHouse(hh, 'mcs');
    expect(m.rooms.find((x) => x.room.id === r.id)!.T).toBe(21);
    expect(m.checks.some((c) => c.text.includes(`${r.name} is set to 17 °C`))).toBe(true);
  });

  it('bills calibration and the neighbour setting change only the best estimate', () => {
    const hh = defaultHouse(), mcs0 = calcHouse(hh, 'mcs').peakW;
    hh.calib = { dt: 1, q: 0.5, hf: 0.8, note: 'test' }; hh.neighbourT = 18;
    expect(calcHouse(hh, 'mcs').peakW).toBeCloseTo(mcs0, 6);
    expect(calcHouse(hh).peakW).not.toBeCloseTo(calcHouse(defaultHouse()).peakW, 0);
  });

  it('suspended ground floor loses to the design outside temperature on the design day (MIS 3005-D 5.5.1 d)', () => {
    const hh = defaultHouse(), gf = hh.buildups.find((b) => b.id === hh.defaults.groundFloor)!;
    gf.floorType = 'suspended';
    const r = calcHouse(hh), row = r.rooms.find((x) => x.room.id === 'living')!.rows.find((x) => x.label === 'Suspended floor')!;
    expect(row.dT).toBeCloseTo(21 - r.Tout, 6);
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
    // MCS measures from the centre of the postcode area: CV36 is nearer Brize Norton, but the CV area is nearest Coleshill.
    expect(st('CV36 4AA')![0]).toBe('Birmingham');
    const hh = defaultHouse();
    hh.climate.postcode = 'PL4 8AA';
    expect(calcHouse(hh).Tout).toBe(-1.5); // 99.6%, MIS 3005-D column B (no intermittent heating uplift needed)
    hh.climate.pct = '99';
    expect(calcHouse(hh).Tout).toBe(-0.2);
    expect(calcHouse(hh).checks.some((c) => c.text.includes('intermittent heating uplift'))).toBe(true);
    hh.climate.pct = '99.6';
    hh.climate.auto = false;
    expect(calcHouse(hh).Tout).toBe(-4.5);
  });

  it('your own design temperature replaces the MCS figure, and the loss follows it', () => {
    const hh = defaultHouse(), mcs = calcHouse(hh);
    hh.climate.designT = -6;
    const own = calcHouse(hh);
    expect([own.Tout, own.ToutMcs]).toEqual([-6, mcs.Tout]);
    expect(own.peakW).toBeGreaterThan(mcs.peakW);
    delete hh.climate.designT;
    expect(calcHouse(hh).Tout).toBe(mcs.Tout);
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

describe('glazed unit presets', () => {
  it('covers every unit × frame × glass with sane whole-unit U', async () => {
    const { GLAZING_LIBRARY } = await import('./house');
    const units = GLAZING_LIBRARY.filter((g) => /^(Window|French doors|Bifold doors), /.test(g.name));
    expect(units).toHaveLength(3 * 3 * 9);
    expect(new Set(GLAZING_LIBRARY.map((g) => g.name)).size).toBe(GLAZING_LIBRARY.length);
    const u = (n: string) => units.find((g) => g.name === n)!.u!;
    expect(u('Window, uPVC, double, low-e argon')).toBeCloseTo(1.28, 2);
    // French doors and bifolds list with doors, but stay glazing so they gain sun.
    const { listedAs } = await import('./house');
    const kindOf = (n: string) => listedAs({ kind: 'glazing', ...units.find((g) => g.name === n)! });
    expect(kindOf('Bifold doors, timber, triple, low-e argon')).toBe('door');
    expect(kindOf('Window, timber, triple, low-e argon')).toBe('glazing');
    // Triple beats double, and timber/uPVC beat aluminium, in every pairing.
    for (const t of ['Window', 'French doors', 'Bifold doors']) for (const f of ['aluminium', 'uPVC', 'timber']) {
      expect(u(`${t}, ${f}, triple, low-e argon`)).toBeLessThan(u(`${t}, ${f}, double, low-e argon`));
      if (f !== 'aluminium') expect(u(`${t}, ${f}, double, low-e argon`)).toBeLessThan(u(`${t}, aluminium, double, low-e argon`));
    }
  });
});

describe('MIS 3005-D report figures', () => {
  it('sizes daily hot water at 45 L × the greater of bedrooms + 1 and occupants', () => {
    const h = defaultHouse(), beds = h.rooms.filter((r) => r.type === 'bedroom').length;
    h.gains.people = 1;
    expect(dhwDemand(h).litres).toBe(45 * (beds + 1));
    h.gains.people = beds + 4;
    expect(dhwDemand(h).litres).toBe(45 * (beds + 4));
  });

  it('warns when a heated room is set below Table 1', () => {
    const h = defaultHouse(), r = h.rooms.find((x) => x.heated && x.type === 'living')!;
    r.setpoint = 19;
    expect(calcHouse(h).checks.some((c) => c.text.includes(`${r.name} is set to 19 °C`))).toBe(true);
  });
});
