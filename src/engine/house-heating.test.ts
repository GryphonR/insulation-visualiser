import { describe, expect, it } from 'vitest';
import { brineTemp, calcHouse, condensingEff, sheetFactor, sourceEff } from './house';
import { defaultHouse } from './house-default';
import { emitterOut, flowNeeded, loopLength, radRated, roomOut, systemFlow } from './house-heating';

describe('emitters and flow temperature', () => {
  const h = defaultHouse();
  const res = calcHouse(h);
  const needs = res.rooms.filter((r) => r.room.heated).map((r) => ({ room: r.room, need: r.totalW }));

  it('radiator output follows the ΔT50 rating with exponent 1.3', () => {
    const e = h.heating.emitters.find((x) => x.id === 'R1')!;
    expect(radRated(e)).toBeCloseTo(2380, 0);
    expect(emitterOut(e, 75, 20, h)).toBeCloseTo(2380 * (52.5 / 50) ** 1.3, 3);
    expect(emitterOut(e, 20, 21, h)).toBe(0);
  });

  it('flowNeeded inverts room output', () => {
    const f = flowNeeded(h, 'living', 600, 21);
    expect(roomOut(h, 'living', f, 21)).toBeCloseTo(600, 0);
    expect(flowNeeded(h, 'living', 1e6, 21)).toBe(Infinity);
  });

  it('ideal weather compensation drops with outside temperature and never goes above the max', () => {
    const cold = systemFlow(h, needs, res.Tout, res.Tout), mild = systemFlow(h, needs, res.Tout, 10);
    expect(cold).toBeLessThanOrEqual(h.hp.maxFlow);
    expect(mild).toBeLessThan(cold);
  });

  it('a bigger kitchen radiator lowers the design flow or the shortfall, and improves SCOP', () => {
    const hh = structuredClone(h);
    hh.heating.emitters.find((e) => e.id === 'R2')!.len = 1600;
    hh.heating.emitters.find((e) => e.id === 'R9')!.rated = 3000;
    hh.heating.emitters.find((e) => e.id === 'R4')!.rated = 1500;
    const r2 = calcHouse(hh);
    expect(r2.hp.seasonal).toBeGreaterThan(res.hp.seasonal);
    expect(r2.heat.rooms.find((x) => x.id === 'kitchen')!.cover).toBeGreaterThan(res.heat.rooms.find((x) => x.id === 'kitchen')!.cover);
  });

  it('flags the undersized demo kitchen', () => {
    expect(res.checks.some((c) => c.text.startsWith('Kitchen: emitters'))).toBe(true);
  });

  it('UFH loop length and the 29 °C floor limit', () => {
    const hh = structuredClone(h);
    hh.heating.zones.push({ id: 'z4', name: 'UFH', kind: 'ufh', color: '#7a45b8', on: true, hours: null, blend: 0 });
    const e = { id: 'L1', room: 'kitchen', kind: 'ufh' as const, zone: 'z4', type: 'K2' as const, len: 0, height: 0, rated: 0, area: 12, spacing: 150, cover: 'Tiles', tail: 5 };
    hh.heating.emitters = [e];
    expect(loopLength(e)).toBeCloseTo(90, 6);
    const q = emitterOut(e, 70, 20, hh) / e.area;
    expect(q).toBeCloseTo(8.92 * 9 ** 1.1, 3);
    hh.heating.zones.find((z) => z.id === 'z4')!.blend = 35;
    expect(emitterOut(e, 70, 20, hh)).toBeCloseTo(12 * (32.5 - 20) / (1 / 6 + 0.01), 3);
  });
});

describe('heat sources', () => {
  const h = defaultHouse();
  const as = (source: 'boiler' | 'condensing' | 'ashp' | 'gshp', edit: (x: ReturnType<typeof defaultHouse>) => void = () => {}) => {
    const x = structuredClone(h); x.hp.source = source; edit(x); return calcHouse(x);
  };

  it('condensing boilers gain from cool returns; non-condensing do not', () => {
    expect(condensingEff('gas', 25)).toBeCloseTo(0.96, 3);
    expect(condensingEff('gas', 60)).toBeCloseTo(0.86, 3);
    expect(condensingEff('oil', 40)).toBeLessThan(condensingEff('gas', 40));
    const hot = as('condensing', (x) => { x.heating.control = 'fixed'; x.hp.maxFlow = 75; x.heating.dT = 10; });
    const cool = as('condensing');
    expect(cool.hp.seasonal).toBeGreaterThan(hot.hp.seasonal);
    expect(as('boiler').hp.seasonal).toBeCloseTo(h.hp.boilerEff / 100, 6);
  });

  it('ground source beats air source in winter, and heat pumps buy less energy than boilers', () => {
    const air = as('ashp'), ground = as('gshp'), gas = as('condensing');
    expect(ground.hp.designEff).toBeGreaterThan(air.hp.designEff);
    expect(air.hp.kwh).toBeLessThan(gas.hp.kwh);
    expect(ground.annualKWh).toBeCloseTo(air.annualKWh, 6);
  });

  it('gas standing charge only when switched on; oil never; heat pump factor scales COP', () => {
    const gas = as('condensing'), oil = as('condensing', (x) => { x.hp.fuel = 'oil'; });
    const gasSC = as('condensing', (x) => { x.hp.gasStanding = true; });
    expect(gas.hp.cost).toBeCloseTo((gas.hp.kwh * h.hp.gasP) / 100, 6);
    expect(gasSC.hp.cost).toBeCloseTo((gas.hp.kwh * h.hp.gasP) / 100 + (h.hp.gasSC * 365) / 100, 6);
    expect(as('ashp', (x) => { x.hp.hpFactor = 0.5; }).hp.seasonal).toBeGreaterThan(as('ashp').hp.seasonal);
    expect(oil.hp.cost).toBeCloseTo((oil.hp.kwh * h.hp.oilP) / 100, 6);
    expect(oil.hp.co2).toBeCloseTo(oil.hp.kwh * h.hp.co2.oil, 6);
    expect(brineTemp(10, 2)).toBeLessThan(brineTemp(10, 8));
  });

  it('datasheet points are matched exactly and interpolated by source temperature', () => {
    const x = structuredClone(h);
    x.hp.sheet = { source: 'ashp', model: 'Test', points: [{ src: 7, flow: 35, cop: 4.8 }, { src: -7, flow: 35, cop: 2.6 }] };
    expect(sourceEff(x, 35, 7, 10, 0)).toBeCloseTo(4.8, 6);
    expect(sourceEff(x, 35, -7, 10, 0)).toBeCloseTo(2.6, 6);
    const f0 = sheetFactor(x.hp.sheet, 0)!, f7 = sheetFactor(x.hp.sheet, 7)!, fm7 = sheetFactor(x.hp.sheet, -7)!;
    expect(f0).toBeCloseTo(fm7 + ((f7 - fm7) * 7) / 14, 6);
    expect(sheetFactor(x.hp.sheet, 20)).toBeCloseTo(f7, 6);
    // Higher flow from the same factor gives a lower COP; the sheet is ignored once the source no longer matches.
    expect(sourceEff(x, 55, 7, 10, 0)).toBeLessThan(4.8);
    x.hp.source = 'gshp';
    expect(sourceEff(x, 35, 7, 10, 0)).not.toBeCloseTo(4.8, 2);
    x.hp.sheet = { source: 'gshp', model: 'G', points: [{ src: 0, flow: 35, cop: 4.5 }] };
    expect(sourceEff(x, 35, -5, 8, 2)).toBeCloseTo(4.5, 6); // brine in March = Tg − 8 = 0 °C
  });
});
