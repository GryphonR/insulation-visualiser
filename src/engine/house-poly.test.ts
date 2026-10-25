import { describe, expect, it } from 'vitest';
import { calcHouse, roomArea } from './house';
import type { Room } from './house';
import { defaultHouse } from './house-default';
import { simulate } from './house-sim';
import type { Pt } from './geom';

const asPoly = (r: Room, poly: Pt[]) => {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  Object.assign(r, { poly, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) });
};

describe('rooms of any shape', () => {
  it('a rectangle drawn as a polygon gives the same heat loss as the rectangle', () => {
    const a = calcHouse(defaultHouse()), h = defaultHouse();
    const lr = h.rooms.find((r) => r.id === 'living')!;
    asPoly(lr, [[0, 0], [4.5, 0], [4.5, 4.2], [0, 4.2]]);
    // The polygon numbers its walls e0..e3: N, E, S, W. Move the living room's windows onto them.
    h.openings.filter((o) => o.room === 'living').forEach((o) => { o.edge = o.side === 'N' ? 0 : 3; });
    const b = calcHouse(h);
    expect(b.peakW).toBeCloseTo(a.peakW, 6);
    expect(b.rooms.find((x) => x.room.id === 'living')!.totalW).toBeCloseTo(a.rooms.find((x) => x.room.id === 'living')!.totalW, 6);
  });

  it('a bay window on the living room: more area, angled walls, sun from the right bearing', () => {
    const h = defaultHouse();
    const lr = h.rooms.find((r) => r.id === 'living')!;
    const bay: Pt[] = [[0, 0], [1.5, 0], [2, -0.6], [3, -0.6], [3.5, 0], [4.5, 0], [4.5, 4.2], [0, 4.2]];
    asPoly(lr, bay);
    h.openings = h.openings.filter((o) => o.room !== 'living');
    h.openings.push({ id: 'b1', room: 'living', side: 'N', name: 'Bay side', w: 0.6, h: 1.4, buildup: 'dg', edge: 1 });
    h.openings.push({ id: 'b2', room: 'living', side: 'N', name: 'Bay front', w: 1.0, h: 1.4, buildup: 'dg', edge: 2 });
    const res = calcHouse(h), r = res.rooms.find((x) => x.room.id === 'living')!;
    expect(roomArea(lr)).toBeCloseTo(4.5 * 4.2 + 0.5 * (1 + 2) * 0.6, 6);
    expect(res.checks.filter((c) => c.level === 'error')).toEqual([]);
    const bayWall = r.faces.find((f) => f.key === 'w:living:e1:0')!;
    expect(Math.round(bayWall.az!)).toBe(310); // west side of the bay looks north-west
    expect(Math.round(r.faces.find((f) => f.key === 'w:living:e3:0')!.az!)).toBe(50);
    expect(r.faces.find((f) => f.key === 'op:b1')!.az).toBeCloseTo(bayWall.az!, 6);
    // Bedroom 1 sits over the rectangle only; the bay has a roof of its own.
    expect(r.faces.find((f) => f.kind === 'ceiling' && f.to.k === 'room')!.area).toBeCloseTo(4.5 * 4.2, 6);
    expect(simulate(h, 'summer').heatKWh).toBe(0);
  });

  it('an L-shaped room shares walls with its neighbours along the right lengths', () => {
    const h = defaultHouse();
    // Living and dining merged into one long room.
    const lr = h.rooms.find((r) => r.id === 'living')!;
    h.rooms = h.rooms.filter((r) => r.id !== 'dining');
    h.openings = h.openings.filter((o) => o.room !== 'dining');
    h.heating.emitters = h.heating.emitters.filter((e) => e.room !== 'dining');
    asPoly(lr, [[0, 0], [4.5, 0], [4.5, 7], [0, 7]]);
    const res = calcHouse(h), r = res.rooms.find((x) => x.room.id === 'living')!;
    const east = r.faces.filter((f) => f.kind === 'wall' && f.to.k === 'room');
    const hallWall = east.filter((f) => f.to.k === 'room' && f.to.id === 'hall').reduce((t, f) => t + f.area, 0);
    expect(hallWall).toBeCloseTo(3.4 * 2.4, 6);
    expect(east.filter((f) => f.to.k === 'room' && f.to.id === 'kitchen').reduce((t, f) => t + f.area, 0)).toBeCloseTo(3.6 * 2.4, 6);
    expect(res.checks.filter((c) => c.level === 'error')).toEqual([]);
  });

  it('flags an outline that crosses itself', () => {
    const h = defaultHouse();
    asPoly(h.rooms.find((r) => r.id === 'living')!, [[0, 0], [4.5, 4.2], [4.5, 0], [0, 4.2]]);
    expect(calcHouse(h).checks.some((c) => c.text.includes('crosses itself'))).toBe(true);
  });
});
