import { describe, expect, it } from 'vitest';
import { calcHouse, edgesToRectShape, rectShapeToEdges, roomArea, setOutline, shapeOf } from './house';
import type { House, Room, RoomShape } from './house';
import { defaultHouse } from './house-default';

const rir: RoomShape = { axis: 'ew', sides: ['knee', 'knee'], pitch: 40, knee: 1.0, ceiling: 2.3, eaves: ['cold', 'cold'], dormers: [null, null], rooflight: 0 };

/** Demo house with a loft room over Bedroom 1's footprint. */
function withLoft(room: Partial<Room>): House {
  const h = defaultHouse();
  h.storeys.push({ name: 'Loft room', h: 2.3, zone: 0 });
  h.rooms.push({ id: 'attic', name: 'Loft bedroom', type: 'bedroom', storey: 2, span: 1, x: 0, y: 0, w: 4.2, d: 3.8, heated: true, setpoint: 21, ach: 1, ...room });
  return h;
}
const near = (a: number, b: number, tol = 0.02) => expect(Math.abs(a - b) / Math.max(1e-9, Math.abs(b))).toBeLessThan(tol);

describe('sloping ceilings on rooms of any shape', () => {
  it('a rectangle drawn as a polygon matches the exact rectangle figures', () => {
    const rect = withLoft({ shape: { ...rir, dormers: [null, { w: 1.8, front: 2.2, window: 1 }] } });
    const poly = withLoft({ shape: { ...rir, dormers: [null, { w: 1.8, front: 2.2, window: 1 }] } });
    const r = poly.rooms[poly.rooms.length - 1];
    r.shape!.edges = rectShapeToEdges(r.shape!);
    setOutline(r, [[0, 0], [4.2, 0], [4.2, 3.8], [0, 3.8]]);
    const a = calcHouse(rect).rooms.find((x) => x.room.id === 'attic')!, b = calcHouse(poly).rooms.find((x) => x.room.id === 'attic')!;
    near(b.V, a.V);
    const area = (x: typeof a, pre: string) => x.faces.filter((f) => f.key.startsWith(pre)).reduce((t, f) => t + f.area, 0);
    near(area(b, 'sl:attic'), area(a, 'sl:attic'));
    near(area(b, 'lc:attic'), area(a, 'lc:attic'), 0.03);
    near(area(b, 'dw:attic') + area(b, 'dc:attic'), area(a, 'dw:attic') + area(a, 'dc:attic'));
    near(b.totalW, a.totalW, 0.02);
    // Gable walls (north and south) get the section's mean height in both.
    near(area(b, 'w:attic:e0'), area(a, 'w:attic:N'), 0.03);
  });

  it('an L-shaped room in the roof: plan areas add up, volume between the knee and ceiling heights', () => {
    const L: [number, number][] = [[0, 0], [4.2, 0], [4.2, 2], [2.5, 2], [2.5, 3.8], [0, 3.8]];
    const h = withLoft({ shape: { ...rir, edges: L.map(() => ({ side: 'knee' as const, eaves: 'cold' as const, dormer: null })) } });
    setOutline(h.rooms[h.rooms.length - 1], L);
    const r = h.rooms[h.rooms.length - 1], g = shapeOf(r, r.shape!);
    const A = roomArea(r), th = (40 * Math.PI) / 180;
    expect(g.flatA + g.slopes.reduce((t, s) => t + s.area * Math.cos(th), 0)).toBeCloseTo(A, 6);
    expect(g.V).toBeGreaterThan(A * 1.0);
    expect(g.V).toBeLessThan(A * 2.3);
    const res = calcHouse(h);
    expect(res.checks.filter((c) => c.level === 'error')).toEqual([]);
    expect(res.rooms.find((x) => x.room.id === 'attic')!.faces.filter((f) => f.key.startsWith('sl:attic')).length).toBe(6);
  });

  it('rectangle ↔ polygon keeps the slopes when they sit on an opposite pair', () => {
    const back = edgesToRectShape({ ...rir, edges: rectShapeToEdges({ ...rir, axis: 'ns', sides: ['plate', 'knee'] }) })!;
    expect([back.axis, back.sides]).toEqual(['ns', ['plate', 'knee']]);
    const hip = rectShapeToEdges(rir).map((e) => ({ ...e, side: 'knee' as const }));
    expect(edgesToRectShape({ ...rir, edges: hip })).toBeUndefined();
  });

  it('walls added or removed keep one slope setting per wall', () => {
    const h = withLoft({ shape: { ...rir, edges: rectShapeToEdges(rir) } });
    const r = h.rooms[h.rooms.length - 1];
    setOutline(r, [[0, 0], [2, -0.5], [4.2, 0], [4.2, 3.8], [0, 3.8]]);
    expect(r.shape!.edges!.length).toBe(5);
    setOutline(r, [[0, 0], [4.2, 0], [4.2, 3.8]]);
    expect(r.shape!.edges!.length).toBe(3);
  });
});
