import { describe, expect, it } from 'vitest';
import { maxWallGap, roomEdges } from './house';
import { defaultHouse } from './house-default';
import { OPEN_DOORWAY, addRoomAt, ensureOpenDoorway, joinRooms, mergeRooms, unionOutline } from './house-draw';
import { calcHouse } from './house';

const blank = () => { const h = defaultHouse(); h.rooms = []; h.openings = []; h.heating.emitters = []; h.vent.devices = []; h.faceBuildup = {}; h.faceBoundary = {}; h.wallAlign = {}; return h; };
const box = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe('joining rooms', () => {
  it('outlines that share a wall become one; an L stays an L', () => {
    expect(unionOutline(box(0, 0, 3, 4), box(3, 0, 6, 4))).toHaveLength(4);
    const L = unionOutline(box(0, 0, 3, 4), box(3, 0, 6, 2))!;
    expect(L).toHaveLength(6);
    expect(unionOutline(box(0, 0, 3, 4), box(5, 0, 8, 4))).toBeNull(); // apart
  });

  it('takes out the wall: the door between goes, a window and a wall build-up carry over', () => {
    const h = blank();
    addRoomAt(h, 'a', box(0, 0, 3, 4), 0);
    addRoomAt(h, 'b', box(3, 0, 6, 4), 0);
    const bEast = roomEdges(h.rooms[1]).findIndex((e) => e.n[0] > 0.9), bNorth = roomEdges(h.rooms[1]).findIndex((e) => e.n[1] < -0.9);
    h.openings.push({ id: 'win', room: 'b', side: 'E', name: 'Window', w: 1, h: 1, buildup: 'x', edge: bEast, t: 2 });
    h.openings.push({ id: 'door', room: 'a', side: 'E', name: 'Door', w: 0.9, h: 2, buildup: 'x', to: 'b' });
    h.faceBuildup[`w:b:e${bNorth}:0`] = 'special';
    expect(joinRooms(h, 'a', 'b')).toBe(true);
    expect(h.rooms.map((r) => r.id)).toEqual(['a']);
    expect(h.rooms[0].poly).toHaveLength(4);
    expect(h.openings.map((o) => o.id)).toEqual(['win']);
    const e = roomEdges(h.rooms[0]);
    expect(e[h.openings[0].edge!].n[0]).toBeGreaterThan(0.9); // still on the east wall
    expect(h.openings[0].t).toBeCloseTo(2, 2);
    const north = e.findIndex((x) => x.n[1] < -0.9);
    expect(h.faceBuildup[`w:a:e${north}:0`]).toBe('special');
  });

  it('closes the gap of a thick wall between them', () => {
    const h = blank();
    const g = Math.min(0.1, maxWallGap(h) - 0.01);
    addRoomAt(h, 'a', box(0, 0, 3, 4), 0);
    addRoomAt(h, 'b', box(3 + g, 0, 6, 4), 0);
    expect(joinRooms(h, 'a', 'b')).toBe(true);
    expect(h.rooms[0].poly).toEqual(box(0, 0, 6, 4));
  });

  it('merges a row of three, whichever order they were picked in; a room that touches none fails', () => {
    const h = blank();
    addRoomAt(h, 'a', box(0, 0, 3, 4), 0);
    addRoomAt(h, 'b', box(3, 0, 6, 4), 0);
    addRoomAt(h, 'c', box(6, 0, 9, 4), 0);
    addRoomAt(h, 'far', box(20, 0, 23, 4), 0);
    expect(mergeRooms(structuredClone(h), ['a', 'c', 'far'])).toBe(false);
    expect(mergeRooms(h, ['a', 'c', 'b'])).toBe(true); // c only touches a once b is in
    expect(h.rooms.map((r) => r.id)).toEqual(['a', 'far']);
    expect(h.rooms[0].poly).toEqual(box(0, 0, 9, 4));
  });
});

describe('open doorway', () => {
  it('is one build-up, added once, and links the two rooms strongly', () => {
    const h = blank();
    addRoomAt(h, 'a', box(0, 0, 3, 4), 0);
    addRoomAt(h, 'b', box(3, 0, 6, 4), 0);
    ensureOpenDoorway(h); ensureOpenDoorway(h);
    expect(h.buildups.filter((b) => b.id === OPEN_DOORWAY)).toHaveLength(1);
    h.openings.push({ id: 'gap', room: 'a', side: 'E', name: 'Opening', w: 0.9, h: 2, buildup: OPEN_DOORWAY, to: 'b' });
    const face = calcHouse(h).rooms.find((r) => r.room.id === 'a')!.faces.find((f) => f.key === 'op:gap')!;
    expect(face.U).toBe(60);
    expect(face.to).toEqual({ k: 'room', id: 'b' });
  });
});
