import { describe, expect, it } from 'vitest';
import { basementWallU, buildupU, calcHouse, groundFloorU, suspendedFloorU } from './house';
import { defaultHouse } from './house-default';

describe('floor types', () => {
  const h = defaultHouse();
  const deck = { id: 'x', name: 'Boards, uninsulated', kind: 'floor' as const, layers: [['m_timber_500_kg_m', 22]] as Array<[string, number]>, floorType: 'suspended' as const };

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
