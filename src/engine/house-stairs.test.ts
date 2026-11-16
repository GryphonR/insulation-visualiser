import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import { defaultHouse, upgradeHouse } from './house-default';
import { DEMOS } from './house-demos';
import { OPEN_STAIRWELL, splitStoreys } from './house-draw';

// The default house as it was: one hall & landing through both storeys.
function joined() {
  const h = defaultHouse(), up = h.rooms.find((r) => r.id === 'landing')!, hall = h.rooms.find((r) => r.id === 'hall')!;
  h.rooms = h.rooms.filter((r) => r !== up);
  Object.assign(hall, { span: 2, name: 'Hall & landing' });
  h.zones = [];
  h.openings.forEach((o) => { if (o.room === 'landing') o.room = 'hall'; if (o.to === 'landing') o.to = 'hall'; });
  return h;
}

describe('stairs: a room on each storey joined by an open stairwell', () => {
  it('the default house has a hall and a landing, joined by a stairwell zone in the floor between', () => {
    const h = defaultHouse(), z = h.zones!.find((q) => q.buildup === OPEN_STAIRWELL)!;
    expect(h.rooms.find((r) => r.id === 'hall')).toMatchObject({ storey: 0, span: 1, name: 'Hall' });
    expect(h.rooms.find((r) => r.id === 'landing')).toMatchObject({ storey: 1, span: 1, type: 'landing' });
    expect(z.band).toBe(1);
    // The bedroom doors lead off the landing now.
    expect(h.openings.filter((o) => o.to === 'landing' || o.room === 'landing').length).toBe(4);
    expect(calcHouse(h).checks.filter((c) => /open/.test(c.text))).toEqual([]);
  });

  it('splitting keeps the heat loss close and the hall and landing near one temperature', () => {
    const h = joined(), before = calcHouse(h).peakW;
    splitStoreys(h, 'hall', 'up');
    const res = calcHouse(h), stair = res.rooms.find((r) => r.room.id === 'hall')!.faces.find((f) => f.buildup.id === OPEN_STAIRWELL)!;
    expect(stair.U * stair.area).toBeGreaterThan(300);
    expect(Math.abs(res.peakW - before) / before).toBeLessThan(0.03);
    // Party wall and wall choices on the upper storey move with the upper room.
    expect(Object.keys(h.faceBuildup).some((k) => k.startsWith('w:hall:') && k.endsWith(':1'))).toBe(false);
  });

  it('every demo splits its stairs into a room per storey, each stairwell inside the rooms it joins', () => {
    for (const d of DEMOS) {
      const h = d.make().scenarios[0].house;
      expect(h.rooms.filter((r) => r.span > 1).map((r) => r.name), d.label).toEqual([]);
      expect(h.zones!.filter((z) => z.buildup === OPEN_STAIRWELL).length, d.label).toBeGreaterThan(0);
      expect(calcHouse(h).checks.filter((c) => c.text.includes('Stairwell')).map((c) => c.text), d.label).toEqual([]);
    }
  });

  it("a project saved before zones existed doesn't pick up the default house's stairwell", () => {
    const h = joined();
    delete h.zones;
    expect(upgradeHouse(h).zones).toEqual([]);
  });

  it('warns about a stairwell with no room over it', () => {
    const h = defaultHouse();
    h.zones![0].poly = h.zones![0].poly.map(([x, y]) => [x + 20, y]);
    expect(calcHouse(h).checks.some((c) => c.text.startsWith('Stairwell is open'))).toBe(true);
  });
});
