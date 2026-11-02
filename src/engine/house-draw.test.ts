import { describe, expect, it } from 'vitest';
import { calcHouse, roomEdges } from './house';
import { defaultHouse } from './house-default';
import type { Pt } from './geom';
import { addBasement, addRoomAt, addStoreyAbove, canRemoveBasement, ensurePoly, flushDelta, freeSpans, insertCorner, nearestWall, openingCentre, removeBasement, removeCorner, setWallLength, wallKeys } from './house-draw';

const peak = (h: ReturnType<typeof defaultHouse>) => Math.round(calcHouse(h).peakW);

describe('drawing edits', () => {
  it('turning a rectangle into an outline changes nothing about the heat loss', () => {
    const h = defaultHouse(), before = peak(h);
    h.rooms.forEach((r) => ensurePoly(h, r.id));
    expect(peak(h)).toBe(before);
  });

  it('keeps a wall build-up choice when the room gets an outline', () => {
    const h = defaultHouse();
    ensurePoly(h, 'bed3');
    expect(h.faceBuildup['w:bed3:e2:1']).toBe('solid');
    expect(h.faceBuildup['w:bed3:S:1']).toBeUndefined();
  });

  it('adding and removing a corner on a straight wall keeps the loss and the window', () => {
    const h = defaultHouse(), r = h.rooms[0], before = peak(h);
    const e = roomEdges(r)[0];
    insertCorner(h, r.id, 0, [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]);
    expect(h.rooms[0].poly).toHaveLength(5);
    expect(peak(h)).toBe(before);
    removeCorner(h, r.id, 1);
    expect(h.rooms[0].poly).toHaveLength(4);
    expect(peak(h)).toBe(before);
  });

  it('wall keys include the inside wall shared with a neighbour', () => {
    const h = defaultHouse();
    const shared = h.rooms.flatMap((r) => roomEdges(r).map((e) => ({ r, e }))).find(({ r, e }) => wallKeys(h, r.id, e.idx, r.storey).length > 1);
    expect(shared).toBeDefined();
    expect(wallKeys(h, shared!.r.id, shared!.e.idx, shared!.r.storey).some((k) => k.startsWith('iw:'))).toBe(true);
  });

  it('places an opening only on a free stretch of outside wall', () => {
    const h = defaultHouse(), r = h.rooms[0];
    const idx = roomEdges(r).findIndex((_, i) => freeSpans(h, r, i, r.storey).length > 0);
    const [a, b] = freeSpans(h, r, idx, r.storey)[0];
    expect(openingCentre(h, r, idx, r.storey, a, 1.2)).toBeCloseTo(a + Math.min(1.2, b - a) / 2);
    const hit = nearestWall(h, r.storey, [-50, -50], 0.5, { outside: true });
    expect(hit).toBeNull();
  });

  it('sets a room flush against a neighbour wall', () => {
    const wall: Pt[] = [[0, 0], [4, 0], [4, 3], [0, 3]];
    // A room 0.12 m off the wall's right-hand side is pulled onto it; one far away is left alone.
    expect(flushDelta([[4.12, 0.5], [6, 0.5], [6, 2], [4.12, 2]], [wall])).toEqual([-0.12000000000000011, 0]);
    expect(flushDelta([[9, 0.5]], [wall])).toEqual([0, 0]);
  });

  it('typing a wall length moves the far wall and the room beside it', () => {
    const h = defaultHouse(), liv = h.rooms.find((r) => r.id === 'living')!, kit = h.rooms.find((r) => r.id === 'kitchen')!;
    const i = roomEdges(liv).findIndex((e) => e.side === 'N'), before = roomEdges(liv)[i].len, kx = kit.x;
    setWallLength(h, 'living', i, before + 0.5);
    expect(roomEdges(h.rooms.find((r) => r.id === 'living')!)[i].len).toBeCloseTo(before + 0.5);
    expect(h.rooms.find((r) => r.id === 'kitchen')!.x).toBeCloseTo(kx + 0.5);
  });

  it('draws a new room and adds layers', () => {
    const h = defaultHouse();
    addRoomAt(h, 'new', [[20, 0], [24, 0], [24, 3], [20, 3]], 0);
    expect(h.rooms[h.rooms.length - 1].name).toBe('Room ' + h.rooms.length);
    const n = h.storeys.length;
    addStoreyAbove(h);
    expect(h.storeys).toHaveLength(n + 1);
  });

  it('a basement shifts the storeys and can be removed again when empty', () => {
    const h = defaultHouse();
    h.faceBuildup['w:bed3:S:1'] = 'solid';
    const ground = h.rooms.filter((r) => r.storey === 0).length;
    addBasement(h);
    expect(h.storeys[0].below).toBeGreaterThan(0);
    expect(h.rooms.filter((r) => r.storey === 1)).toHaveLength(ground);
    expect(h.faceBuildup['w:bed3:S:2']).toBe('solid');
    expect(canRemoveBasement(h)).toBe(true);
    removeBasement(h);
    expect(h.faceBuildup['w:bed3:S:1']).toBe('solid');
    expect(h.rooms.filter((r) => r.storey === 0)).toHaveLength(ground);
  });
});

describe('snapping a wall apart', () => {
  it('sits a corner a wall thickness off a neighbour on the side it is already on, or flush when that is nearer', () => {
    const wall: Pt[] = [[4, 0], [4, 5], [3, 5], [3, 0]]; // right edge at x = 4
    expect(flushDelta([[4.13, 1]], [wall], 0.2, 0.1)[0]).toBeCloseTo(-0.03, 6); // 10 cm off the wall
    expect(flushDelta([[4.04, 1]], [wall], 0.2, 0.1)[0]).toBeCloseTo(-0.04, 6); // flush is nearer
    expect(flushDelta([[3.87, 1]], [[[4, 0], [4, 5]]], 0.2, 0.1)[0]).toBeCloseTo(0.03, 6); // from the left side
  });
});

describe('detached rooms', () => {
  const detached = (h: ReturnType<typeof defaultHouse>) => calcHouse(h).checks.filter((c) => c.text.includes("doesn't touch any other room"));
  it('warns about a room that shares no wall with the rest of its storey', () => {
    const h = defaultHouse();
    expect(detached(h)).toEqual([]);
    addRoomAt(h, 'shed', [[20, 0], [23, 0], [23, 3], [20, 3]], 0);
    expect(detached(h).map((c) => c.text)).toEqual([expect.stringContaining(h.rooms.find((r) => r.id === 'shed')!.name)]);
  });
});
