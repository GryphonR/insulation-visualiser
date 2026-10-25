import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
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
    expect(r2.hp.scop).toBeGreaterThan(res.hp.scop);
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
