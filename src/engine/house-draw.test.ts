import { describe, expect, it } from 'vitest';
import { calcHouse, roomEdges } from './house';
import { defaultHouse } from './house-default';
import type { Pt } from './geom';
import { addBasement, addRoomAt, addStoreyAbove, canRemoveBasement, ensurePoly, flushDelta, parallelSnap, turnToWall, wallGhosts, freeSpans, insertCorner, nearestWall, openingCentre, removeBasement, removeCorner, setWallLength, wallKeys, wallPieces, pieceKeys, splitWall } from './house-draw';

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

  it('splitting an outside wall gives each part its own build-up', () => {
    const h = defaultHouse(), before = peak(h);
    const { r, e } = h.rooms.flatMap((r) => roomEdges(r).map((e) => ({ r, e }))).find(({ r, e }) => wallKeys(h, r.id, e.idx, r.storey).length === 1)!;
    const was = h.faceBuildup[wallKeys(h, r.id, e.idx, r.storey)[0]] ?? h.defaults.extWall;
    insertCorner(h, r.id, e.idx, [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]);
    const [k1, k2] = [e.idx, e.idx + 1].map((i) => wallKeys(h, r.id, i, r.storey)[0]);
    expect(k1).not.toBe(k2);
    expect(peak(h)).toBe(before);
    const other = h.buildups.find((b) => b.kind === 'wall' && b.id !== was)!;
    h.faceBuildup[k2] = other.id;
    expect(h.faceBuildup[k1] ?? h.defaults.extWall).toBe(was);
    expect(peak(h)).not.toBe(before);
  });

  it('splitting an inside wall gives each stretch its own build-up, seen from both rooms', () => {
    const h = defaultHouse();
    const hit = h.rooms.flatMap((r) => roomEdges(r).flatMap((e) => wallPieces(h, r.id, e.idx, r.storey).filter((p) => p.other && p.span[1] - p.span[0] > 1).map((p) => ({ r, e, p }))))[0];
    const { r, e, p } = hit, s = r.storey, other = p.other!, tm = (p.span[0] + p.span[1]) / 2;
    // A cooler neighbour, so heat crosses the wall and its build-up counts.
    h.rooms.find((x) => x.id === other)!.setpoint = r.setpoint - 6;
    const lossOf = () => Math.round(calcHouse(h).rooms.find((x) => x.room.id === r.id)!.fabricW), before = lossOf();
    splitWall(h, r.id, e.idx, [e.a[0] + e.d[0] * tm, e.a[1] + e.d[1] * tm], s);
    expect(lossOf()).toBe(before);
    // Each room now sees two stretches of wall to the other, each with a key of its own, the same from either side.
    const keysFrom = (a: string, b: string) => [...new Set(h.rooms.find((x) => x.id === a)!.poly!.flatMap((_, i) => wallPieces(h, a, i, s).filter((q) => q.other === b).flatMap((q) => pieceKeys(h, a, i, s, q))))].sort();
    const mine = keysFrom(r.id, other);
    expect(mine).toHaveLength(2);
    expect(keysFrom(other, r.id)).toEqual(mine);
    const thick = h.buildups.find((b) => b.kind === 'wall' && b.id !== h.faceBuildup[mine[1]])!;
    h.faceBuildup[mine[1]] = thick.id;
    expect(lossOf()).not.toBe(before);
    expect(h.faceBuildup[mine[0]]).not.toBe(thick.id);
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
  it('shows the inside wall a nearby parallel wall would snap to, and marks it once snapped', () => {
    const wall: Pt[] = [[4, 0], [4, 5], [3, 5], [3, 0]];
    const g = wallGhosts([[[4.3, 1], [4.3, 3]]], [wall], 0.1);
    expect(g).toHaveLength(1);
    expect(g[0].box.map((v) => +v.toFixed(6))).toEqual([4, 1, 4.1, 3]);
    expect(g[0].on).toBe(false);
    expect(wallGhosts([[[4.1, 1], [4.1, 3]]], [wall], 0.1)[0].on).toBe(true);
    expect(wallGhosts([[[5.2, 1], [5.2, 3]]], [wall], 0.1)).toEqual([]); // too far away
  });
  it('turns a nearly parallel wall parallel to a skewed wall nearby', () => {
    const skew: [Pt, Pt] = [[0, 0], [4, 1]]; // about 14 degrees
    const r = parallelSnap([4, 2.1], [[0, 1]], [skew]);
    expect(r.p[1] - 1).toBeCloseTo((r.p[0] * 1) / 4, 6); // now along the skewed direction from (0, 1)
    expect(r.refs).toEqual([skew]);
    expect(parallelSnap([4, 2.6], [[0, 1]], [skew]).refs).toEqual([]); // 8 degrees off: left alone
    expect(parallelSnap([4, 1], [[0, 1]], [[[0, 0], [4, 0]]]).refs).toEqual([]); // square walls are for the square snaps
  });
  it('turns a dragged room to match a nearly parallel skewed wall, and sits it a wall off', () => {
    const skew: Pt[] = [[0, 0], [4, 0.2], [4, -3], [0, -3]]; // bottom edge about 2.9 degrees off square
    const room: Pt[] = [[0.5, 0.3], [3.5, 0.3], [3.5, 3], [0.5, 3]];
    const t = turnToWall([room], [skew], 0.1)!;
    expect(t.ref).toEqual([[0, 0], [4, 0.2]]);
    const [p, q] = [t.map(room[0]), t.map(room[1])];
    expect((q[1] - p[1]) / (q[0] - p[0])).toBeCloseTo(0.05, 3); // parallel to the skewed wall
    const n = [-0.2, 4].map((v) => v / Math.hypot(0.2, 4)), dist = (p[0] * n[0] + p[1] * n[1]);
    expect(dist).toBeCloseTo(0.1, 3); // a 10 cm wall's thickness off it
    expect(turnToWall([room], [[[0, 0], [4, 0], [4, -3], [0, -3]]], 0.1)).toBeNull(); // square on square: flushDelta's job
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
