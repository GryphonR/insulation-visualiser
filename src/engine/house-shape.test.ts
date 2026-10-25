import { describe, expect, it } from 'vitest';
import { basementWallU, buildupU, calcHouse, groundFloorU, shapeGeo, suspendedFloorU } from './house';
import type { House, Room, RoomShape } from './house';
import { defaultHouse } from './house-default';

const rir: RoomShape = { axis: 'ew', sides: ['knee', 'knee'], pitch: 40, knee: 1.0, ceiling: 2.3, eaves: ['cold', 'cold'], dormers: [null, null], rooflight: 0 };

/** Demo house with a room in the roof added as a third storey over the whole first floor. */
function loftConversion(shape: RoomShape): House {
  const h = defaultHouse();
  h.storeys.push({ name: 'Loft room', h: 2.3, zone: 0 });
  h.storeys[1].zone = 0.25;
  h.rooms.push({ id: 'attic', name: 'Loft bedroom', type: 'bedroom', storey: 2, span: 1, x: 0, y: 0, w: 4.2, d: 3.8, heated: true, setpoint: 21, ach: 1, shape });
  return h;
}

describe('room shapes', () => {
  it('section geometry: knee walls, flat collar and area', () => {
    const r = { w: 4.2, d: 3.8 } as Room;
    const g = shapeGeo(r, rir);
    const t = Math.tan((40 * Math.PI) / 180);
    expect(g.run[0]).toBeCloseTo(1.3 / t, 6);
    expect(g.fw).toBeCloseTo(4.2 - 2 * (1.3 / t), 6);
    expect(g.A).toBeCloseTo(4.2 * 2.3 - 2 * 0.5 * (1.3 / t) * 1.3, 6);
    expect(g.V).toBeCloseTo(g.A * 3.8, 6);
  });

  it('a too-tall ceiling is limited by the pitch', () => {
    const g = shapeGeo({ w: 3, d: 3 } as Room, { ...rir, pitch: 20, ceiling: 3 });
    expect(g.hc).toBeCloseTo(g.hcMax, 6);
    expect(g.fw).toBeCloseTo(0.4, 6);
  });

  it('room in roof: slopes to outside, knee walls in series with the eaves roof, collar to the loft', () => {
    const h = loftConversion(rir);
    const res = calcHouse(h);
    const room = res.rooms.find((x) => x.room.id === 'attic')!;
    const f = (p: string) => room.faces.filter((x) => x.key.startsWith(p));
    expect(f('sl:attic').length).toBe(2);
    const knee = room.faces.find((x) => x.key === 'w:attic:W:2')!;
    const kb = h.buildups.find((b) => b.id === 'knee')!, tiles = h.buildups.find((b) => b.id === 'tiles')!;
    expect(knee.U).toBeLessThan(buildupU(kb, 0.26));
    expect(knee.U).toBeCloseTo(1 / (1 / buildupU(kb, 0.26) + Math.sin((40 * Math.PI) / 180) / buildupU(tiles, 0.14)), 6);
    expect(room.faces.find((x) => x.key === 'lc:attic')!.area).toBeCloseTo(shapeGeo(h.rooms[h.rooms.length - 1], rir).fw * 3.8, 6);
    // The room below now has a heated room above part of it.
    const bed1 = res.rooms.find((x) => x.room.id === 'bed1')!;
    expect(bed1.faces.some((x) => x.kind === 'ceiling' && x.to.k === 'room' && x.to.id === 'attic')).toBe(true);
    expect(room.V).toBeCloseTo(shapeGeo(h.rooms[h.rooms.length - 1], rir).V, 6);
  });

  it('a dormer takes area out of the slope and adds a front, cheeks, roof and window', () => {
    const plain = calcHouse(loftConversion(rir)).rooms.find((x) => x.room.id === 'attic')!;
    const withD = calcHouse(loftConversion({ ...rir, dormers: [null, { w: 1.8, front: 2.3, window: 1.0 }] })).rooms.find((x) => x.room.id === 'attic')!;
    const area = (r: typeof plain, k: string) => r.faces.find((x) => x.key === k)?.area ?? 0;
    expect(area(withD, 'sl:attic:1')).toBeLessThan(area(plain, 'sl:attic:1'));
    for (const k of ['dw:attic:1', 'dc:attic:1', 'dr:attic:1', 'dg:attic:1']) expect(area(withD, k), k).toBeGreaterThan(0);
    expect(withD.V).toBeGreaterThan(plain.V);
  });

  it('a shape on a room that is not on the top storey is ignored', () => {
    const h = defaultHouse();
    h.rooms.find((r) => r.id === 'living')!.shape = rir;
    expect(calcHouse(h).peakW).toBeCloseTo(calcHouse(defaultHouse()).peakW, 6);
  });
});

describe('floor types', () => {
  const h = defaultHouse();
  const deck = { id: 'x', name: 'Boards, uninsulated', kind: 'floor' as const, layers: [['timber', 22]] as Array<[string, number]>, floorType: 'suspended' as const };

  it('suspended floor U sits between the deck alone and zero, and falls with less ventilation', () => {
    const u = suspendedFloorU(deck, 4, 1500, 0.3);
    expect(u).toBeLessThan(1 / (0.34 + 0.022 / 0.13));
    expect(u).toBeGreaterThan(0.3);
    expect(suspendedFloorU(deck, 4, 500, 0.3)).toBeLessThan(u);
  });

  it('a basement floor loses less than a slab at ground level, and deeper walls lose less per m²', () => {
    const sf = h.buildups.find((b) => b.id === 'sf')!, cav = h.buildups.find((b) => b.id === 'cav')!;
    expect(groundFloorU(sf, 4, 2)).toBeLessThan(groundFloorU(sf, 4));
    expect(basementWallU(cav, 2.5, sf)).toBeLessThan(basementWallU(cav, 1, sf));
  });

  it('a house with a below-ground lowest storey puts its outside walls against the ground', () => {
    const hh = defaultHouse();
    hh.storeys[0].below = 2.4;
    const res = calcHouse(hh);
    const lr = res.rooms.find((x) => x.room.id === 'living')!;
    expect(lr.faces.filter((f) => f.kind === 'wall' && f.key.startsWith('w:')).every((f) => f.to.k === 'ground')).toBe(true);
    expect(lr.faces.find((f) => f.kind === 'floor')!.label).toBe('Basement floor');
  });
});
