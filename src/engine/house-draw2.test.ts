import { describe, expect, it } from 'vitest';
import { calcHouse, roomArea } from './house';
import { defaultHouse } from './house-default';
import { addFloorZone, addLoopRect, addRoomAt, addStoreyAbove, copyRooms, cutPlan, flipRooms, innerDoorAt, moveCorners, pieceAlign, pieceKeys, pieceThickness, problems, rotateRooms, setPieceAlign, splitRoom, wallPieces } from './house-draw';
import { newHouse } from './house-templates';

const area = (h: ReturnType<typeof defaultHouse>) => h.rooms.reduce((t, r) => t + roomArea(r) * r.span, 0);
const errors = (h: ReturnType<typeof defaultHouse>) => calcHouse(h).checks.filter((c) => c.level === 'error');
let n = 0;
const mk = (p: string) => `${p}x${n++}`;

describe('splitting and groups', () => {
  it('cuts a room in two without losing floor area, windows or walls', () => {
    const h = defaultHouse(), a = area(h), rooms = h.rooms.length, win = h.openings.filter((o) => o.room === 'living').length;
    expect(splitRoom(h, 'living', [2, -1], [2, 5], 'liv2')).toBe(true);
    expect(h.rooms).toHaveLength(rooms + 1);
    expect(area(h)).toBeCloseTo(a);
    expect(h.openings.filter((o) => o.room === 'living' || o.room === 'liv2')).toHaveLength(win);
    expect(errors(h)).toHaveLength(0);
  });

  it('refuses a line that misses the room', () => {
    const h = defaultHouse();
    expect(cutPlan([[0, 0], [4, 0], [4, 3], [0, 3]], [10, 0], [10, 5])).toBeNull();
    expect(splitRoom(h, 'living', [20, 0], [20, 5], 'nope')).toBe(false);
  });

  it('flipping or turning the whole house keeps its area and heat loss', () => {
    const h = defaultHouse(), peak = Math.round(calcHouse(h).peakW), a = area(h), ids = h.rooms.map((r) => r.id);
    flipRooms(h, ids, 'x');
    rotateRooms(h, ids);
    expect(area(h)).toBeCloseTo(a);
    expect(Math.round(calcHouse(h).peakW)).toBe(peak);
    expect(errors(h)).toHaveLength(0);
  });

  it('copies the ground floor up onto a new storey', () => {
    const h = defaultHouse();
    addStoreyAbove(h);
    const ground = h.rooms.filter((r) => r.storey === 0).map((r) => r.id), before = h.rooms.length;
    const ids = copyRooms(h, ground, [0, 0], 2, false, mk);
    expect(ids).toHaveLength(ground.length);
    expect(h.rooms).toHaveLength(before + ground.length);
    expect(h.rooms.filter((r) => r.storey === 2)).toHaveLength(ground.length);
    expect(errors(h)).toHaveLength(0);
  });
});

describe('inside doors', () => {
  it('a door between two rooms takes area off the shared wall and joins both rooms', () => {
    const h = defaultHouse(), liv = h.rooms.find((r) => r.id === 'living')!;
    const at = innerDoorAt(h, liv, 1, 0, 1.5, 0.9);
    expect(at?.to).toBe('kitchen');
    const wallBefore = calcHouse(h).rooms.find((r) => r.room.id === 'living')!.faces.filter((f) => f.to.k === 'room' && f.to.id === 'kitchen' && f.kind === 'wall').reduce((t, f) => t + f.area, 0);
    h.openings.push({ id: 'in1', room: 'living', side: 'E', name: 'Door', w: 0.9, h: 2, buildup: h.buildups.find((b) => b.kind === 'door')!.id, edge: 1, t: at!.t, to: 'kitchen' });
    const res = calcHouse(h);
    const wallAfter = res.rooms.find((r) => r.room.id === 'living')!.faces.filter((f) => f.to.k === 'room' && f.to.id === 'kitchen' && f.kind === 'wall').reduce((t, f) => t + f.area, 0);
    expect(wallBefore - wallAfter).toBeCloseTo(1.8);
    for (const id of ['living', 'kitchen']) expect(res.rooms.find((r) => r.room.id === id)!.faces.some((f) => f.key === 'op:in1' && f.kind === 'door')).toBe(true);
    expect(errors(h)).toHaveLength(0);
  });
});

describe('floor and ceiling zones', () => {
  const sum = (h: ReturnType<typeof defaultHouse>, id: string, kind: string) => calcHouse(h).rooms.find((r) => r.room.id === id)!.faces.filter((f) => f.kind === kind && f.to.k !== 'loft' || (f.kind === kind && f.key.startsWith('lc:'))).reduce((t, f) => t + f.area, 0);

  it('an insulated patch of ground floor keeps the area and lowers the loss', () => {
    const h = defaultHouse(), before = calcHouse(h).rooms.find((r) => r.room.id === 'living')!, a0 = sum(h, 'living', 'floor');
    h.buildups.push({ id: 'warm', name: 'Floor, 200 mm PIR', kind: 'floor', layers: [['conc', 100], ['pir', 200], ['render', 65]] });
    addFloorZone(h, 'z1', 0, [[0, 0], [2.25, 0], [2.25, 4.2], [0, 4.2]]);
    h.zones![0].buildup = 'warm';
    const after = calcHouse(h).rooms.find((r) => r.room.id === 'living')!;
    expect(sum(h, 'living', 'floor')).toBeCloseTo(a0);
    expect(after.faces.filter((f) => f.key.includes('~z1'))).toHaveLength(1);
    expect(after.faces.find((f) => f.key.includes('~z1'))!.area).toBeCloseTo(2.25 * 4.2);
    expect(after.totalW).toBeLessThan(before.totalW);
  });

  it('a patch of the floor between storeys is the same area above and below', () => {
    const h = defaultHouse();
    h.buildups.push({ id: 'warm', name: 'Floor, deep', kind: 'floor', layers: [['pb', 12.5], ['cavity', 150], ['timber', 20]] });
    addFloorZone(h, 'z2', 1, [[0, 0], [4.5, 0], [4.5, 2], [0, 2]]);
    h.zones![0].buildup = 'warm';
    const res = calcHouse(h), part = (id: string) => res.rooms.find((r) => r.room.id === id)!.faces.filter((f) => f.key.includes('~z2')).reduce((t, f) => t + f.area, 0);
    const upper = h.rooms.filter((r) => r.storey === 1).map((r) => r.id), lower = h.rooms.filter((r) => r.storey === 0).map((r) => r.id);
    expect(upper.reduce((t, id) => t + part(id), 0)).toBeGreaterThan(5);
    expect(upper.reduce((t, id) => t + part(id), 0)).toBeCloseTo(lower.reduce((t, id) => t + part(id), 0));
  });

  it('draws a heated-floor loop as a rectangle in its room', () => {
    const h = defaultHouse();
    const ok = addLoopRect(h, 'loop1', 0, { x: 0.5, y: 0.5, w: 3, h: 3 }, (hh, room) => hh.heating.emitters.push({ id: 'tmp', room, kind: 'ufh', zone: 'z1', type: 'K2', len: 1000, height: 600, rated: 0, area: 0, spacing: 150, cover: 'Tiles', tail: 5 }));
    expect(ok).toBe(true);
    expect(h.heating.emitters.find((e) => e.id === 'loop1')?.area).toBe(9);
    expect(addLoopRect(h, 'loop2', 0, { x: 50, y: 50, w: 1, h: 1 }, () => undefined)).toBe(false);
  });
});

describe('problems', () => {
  it('treats a gap between rooms as a wall, and flags an overlap', () => {
    const h = defaultHouse();
    expect(problems(h, 0).gaps).toHaveLength(0);
    expect(problems(h, 0).overlap.size).toBe(0);
    // A gap up to the thickest wall build-up is a wall drawn between the rooms, not a mistake.
    moveCorners(h, [['kitchen', 0], ['kitchen', 1], ['kitchen', 2], ['kitchen', 3]], [0.2, 0]);
    expect(problems(h, 0).gaps).toHaveLength(0);
    moveCorners(h, [['kitchen', 0], ['kitchen', 1], ['kitchen', 2], ['kitchen', 3]], [-0.7, 0]);
    expect(problems(h, 0).overlap.has('kitchen')).toBe(true);
  });
});

describe('wall pieces', () => {
  it('a wall is split where a neighbour starts and ends: outside, shared, and the neighbour keeps its own outside piece', () => {
    const h = newHouse({ template: 'det', age: '1950-66', storeys: 1 });
    addRoomAt(h, 'a', [[0, 0], [7.5, 0], [7.5, 4.5], [0, 4.5]], 0);
    addRoomAt(h, 'b', [[3.5, 4.5], [7.5 + 2, 4.5], [7.5 + 2, 8], [3.5, 8]], 0);
    const mine = wallPieces(h, 'a', 2, 0); // living's south wall, drawn right to left
    expect(mine).toHaveLength(2);
    expect(mine.filter((p) => p.other === 'b')).toHaveLength(1);
    expect(mine.filter((p) => !p.other)).toHaveLength(1);
    const theirs = wallPieces(h, 'b', 0, 0);
    expect(theirs.map((p) => !!p.other).sort()).toEqual([false, true]);
    // the shared piece is one face from both sides; the outside pieces are their own rooms' faces
    const shared = mine.find((p) => p.other)!;
    expect(pieceKeys(h, 'a', 2, 0, shared)).toEqual(pieceKeys(h, 'b', 0, 0, { other: 'a' }));
    expect(pieceKeys(h, 'a', 2, 0, mine.find((p) => !p.other)!)[0]).toMatch(/^w:a:/);
  });
});

describe('wall thickness and alignment', () => {
  it('is as thick as the build-up, outside walls default outside the line and inside walls centred, and one inside wall reads the same from both rooms', () => {
    const h = newHouse({ template: 'det', age: '1950-66', storeys: 1 });
    addRoomAt(h, 'a', [[0, 0], [7.5, 0], [7.5, 4.5], [0, 4.5]], 0);
    addRoomAt(h, 'b', [[3.5, 4.5], [9.5, 4.5], [9.5, 8], [3.5, 8]], 0);
    const out = wallPieces(h, 'a', 2, 0).find((p) => !p.other)!, inner = wallPieces(h, 'a', 2, 0).find((p) => p.other)!;
    const wall = h.buildups.find((b) => b.id === h.defaults.extWall)!;
    expect(pieceThickness(h, 'a', 2, 0, out)).toBeCloseTo(wall.layers.reduce((t, [, mm]) => t + mm, 0) / 1000, 6);
    expect(pieceAlign(h, 'a', 2, 0, out)).toBe('out');
    expect(pieceAlign(h, 'a', 2, 0, inner)).toBe('ctr');
    setPieceAlign(h, 'a', 2, 0, inner, 'in'); // toward room a
    expect(pieceAlign(h, 'a', 2, 0, inner)).toBe('in');
    expect(pieceAlign(h, 'b', 0, 0, { other: 'a' })).toBe('out'); // from room b it is on the far side
  });
});

describe('rooms a wall apart', () => {
  it('two rooms drawn a wall thickness apart share an inside wall, so no outside wall is lost or invented', () => {
    const mk = (gap: number) => {
      const h = newHouse({ template: 'det', age: '1950-66', storeys: 1 });
      addRoomAt(h, 'a', [[0, 0], [6, 0], [6, 4], [0, 4]], 0);
      addRoomAt(h, 'b', [[0, 4 + gap], [6, 4 + gap], [6, 8 + gap], [0, 8 + gap]], 0);
      return h;
    };
    const touching = mk(0), apart = mk(0.1);
    const piece = (h: ReturnType<typeof mk>) => wallPieces(h, 'a', 2, 0);
    expect(piece(touching)).toHaveLength(1);
    expect(piece(apart)).toHaveLength(1);
    expect(piece(apart)[0].other).toBe('b');
    expect(piece(apart)[0].gap).toBeCloseTo(0.1, 6);
    expect(piece(touching)[0].gap).toBe(0);
    // far enough apart to be a wall of nobody's: two outside walls again
    expect(wallPieces(mk(1), 'a', 2, 0).every((p) => !p.other)).toBe(true);
    const out = (h: ReturnType<typeof mk>) => calcHouse(h).rooms.flatMap((r) => r.faces).filter((f) => f.kind === 'wall' && f.to.k === 'out').reduce((t, f) => t + f.area, 0);
    expect(out(apart)).toBeCloseTo(out(touching), 6);
  });
});

describe('rooms wound the opposite way', () => {
  it('still share a wall: facing walls are found by their outward normals, not by which way each outline was drawn', () => {
    const h = newHouse({ template: 'det', age: '1950-66', storeys: 1 });
    addRoomAt(h, 'a', [[0, 0], [4, 0], [4, 4], [0, 4]], 0); // clockwise on the plan
    addRoomAt(h, 'b', [[4.1, 4], [4.1, 0], [8, 0], [8, 4]], 0); // anticlockwise
    expect(wallPieces(h, 'a', 1, 0).map((p) => p.other)).toEqual(['b']);
    expect(wallPieces(h, 'b', 0, 0).map((p) => p.other)).toEqual(['a']);
  });
});

describe('oversized openings', () => {
  it('a mistyped window height is counted at the size of its wall, and flagged', () => {
    const h = defaultHouse();
    const o = h.openings.find((x) => !x.to)!;
    const before = calcHouse(h).peakW;
    o.h = 600;
    const r = calcHouse(h);
    expect(r.peakW).toBeLessThan(before * 1.5);
    expect(r.checks.some((c) => c.level === 'warn' && c.text.includes('bigger than its wall'))).toBe(true);
  });
});
