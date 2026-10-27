import { describe, expect, it } from 'vitest';
import { calcHouse, roomArea } from './house';
import { defaultHouse } from './house-default';
import { addFloorZone, addLoopRect, addStoreyAbove, copyRooms, cutPlan, flipRooms, innerDoorAt, moveCorners, problems, rotateRooms, splitRoom } from './house-draw';

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
  it('flags a gap between rooms that nearly touch, and an overlap', () => {
    const h = defaultHouse();
    expect(problems(h, 0).gaps).toHaveLength(0);
    expect(problems(h, 0).overlap.size).toBe(0);
    moveCorners(h, [['kitchen', 0], ['kitchen', 1], ['kitchen', 2], ['kitchen', 3]], [0.1, 0]);
    expect(problems(h, 0).gaps.length).toBeGreaterThan(0);
    moveCorners(h, [['kitchen', 0], ['kitchen', 1], ['kitchen', 2], ['kitchen', 3]], [-0.4, 0]);
    expect(problems(h, 0).overlap.has('kitchen')).toBe(true);
  });
});
