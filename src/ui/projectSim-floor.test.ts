import { describe, expect, it } from 'vitest';
import { calcHouse } from '../engine/house';
import { defaultHouse } from '../engine/house-default';
import { projectDay } from './projectSim';

describe('floors and ceilings from the house', () => {
  const res = calcHouse(defaultHouse());

  it('the joist floor between storeys opens facing the room next door, at its design temperature', () => {
    const p = projectDay(res, 'jf')!;
    expect(['floor', 'ceiling']).toContain(p.patch.orient);
    if (p.patch.orient === 'floor') expect(p.patch.under).toBe('room');
    expect(p.flip).toBe(p.patch.orient === 'ceiling');
    expect(p.patch.otherT).toBeGreaterThan(5);
    expect(p.note).toMatch(/(above|below) at/);
  });

  it('the ground floor slab still opens on the ground with the house U-value', () => {
    const p = projectDay(res, 'sf', false, true)!;
    expect(p.patch).toMatchObject({ orient: 'floor', under: 'ground' });
    expect(p.patch.floorU).toBeGreaterThan(0);
    expect(p.flip).toBe(false);
  });
});
