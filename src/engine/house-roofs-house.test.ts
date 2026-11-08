import { describe, expect, it } from 'vitest';
import { buildupU, calcHouse, extWallThickness, loftGeo, roofOutlines, roomRoof } from './house';
import type { House, RoofSection, Room } from './house';
import { defaultHouse, mainRoof, upgradeHouse } from './house-default';
import { simulate } from './house-sim';
import { polyArea } from './geom';
import type { Pt } from './geom';

const near = (a: number, b: number, tol = 0.02) => expect(Math.abs(a - b) / Math.max(1e-9, Math.abs(b))).toBeLessThan(tol);
const faces = (h: House, id: string) => calcHouse(h).rooms.find((r) => r.room.id === id)!.faces;
const room = (id: string, storey: number, x: number, y: number, w: number, d: number, extra: Partial<Room> = {}): Room =>
  ({ id, name: id, type: 'bedroom', storey, span: 1, x, y, w, d, heated: true, setpoint: 21, ach: 1, ...extra });

describe('the house roof', () => {
  const h = defaultHouse(), g = extWallThickness(h);
  it('follows the top storey outside its walls', () => {
    const [o] = roofOutlines(h, h.roofs[0]);
    near(polyArea(o), (9 + 2 * g) * (7 + 2 * g), 0.01);
  });
  it('gable over the default house: two equal slopes facing up and down the plan, the loft a triangular prism', () => {
    const lg = loftGeo(h), t = Math.tan((35 * Math.PI) / 180), W = 9 + 2 * g, D = 7 + 2 * g;
    expect(lg.slopes.map((s) => s.az).sort((a, b) => a - b)).toEqual([0, 180]);
    near(lg.slopes[0].area, lg.slopes[1].area, 0.02);
    // Over the rooms only: the strips over the walls, at the eaves, are too low to count as loft.
    near(lg.V, W * (D / 2) * (D / 2) * t - 2 * W * 0.5 * g * g * t, 0.04);
    const res = calcHouse(h);
    expect(res.loft).not.toBeNull();
    near(res.loft!.area, 63, 0.001);
  });
  it('hip over a square has four equal slopes; turning the plan turns them', () => {
    const x = defaultHouse();
    x.rooms = [room('a', 0, 0, 0, 8, 8), room('b', 1, 0, 0, 8, 8)];
    x.openings = []; x.heating.emitters = [];
    x.roofs = [{ ...mainRoof(), form: 'hip' }];
    x.north = 30;
    const s = calcHouse(x).loft!.slopes;
    expect(s).toHaveLength(4);
    s.forEach((q) => near(q.area, s[0].area, 0.03));
    expect(s.map((q) => Math.round(q.az)).sort((p, q) => p - q)).toEqual([30, 120, 210, 300]);
  });
  it('monopitch: one slope facing its side; a south one warms the summer loft more, and a dark roof more than a light one', () => {
    const x = defaultHouse();
    x.roofs = [{ ...mainRoof(15), form: 'mono', facing: 'E' }];
    expect(calcHouse(x).loft!.slopes.map((s) => Math.round(s.az))).toEqual([90]);
    const peak = (fn: (y: House) => void) => { const y = defaultHouse(); y.roofs = [{ ...mainRoof(), form: 'mono', facing: 'S' }]; fn(y); return Math.max(...simulate(y, 'summer').loftT!); };
    expect(peak(() => {})).toBeGreaterThan(peak((y) => { y.roofs[0].facing = 'N'; }));
    expect(peak((y) => { y.roofColour = 'dark'; })).toBeGreaterThan(peak((y) => { y.roofColour = 'light'; }));
  });
  it('no roof: the top ceilings are flat roofs and there is no loft', () => {
    const x = defaultHouse();
    x.roofs = [];
    const res = calcHouse(x);
    expect(res.loft).toBeNull();
    expect(res.rooms.find((r) => r.room.id === 'bed1')!.faces.some((f) => f.key === 'fr:bed1')).toBe(true);
  });
});

/** The default house with a room-in-roof storey: the roof over the whole first floor, its plate `plate` m above the new floor. */
function roofRoom(plate: number, extra: Partial<Room> = {}, sec: Partial<RoofSection> = {}): House {
  const h = defaultHouse();
  h.storeys.push({ name: 'Loft room', h: 2.3, zone: 0 });
  h.storeys[1].zone = 0.25;
  const g = extWallThickness(h), poly: Pt[] = [[-g, -g], [9 + g, -g], [9 + g, 7 + g], [-g, 7 + g]];
  // Ridge along x: slopes rise from the north and south eaves; the room sits between knee walls 1.5 m in from each.
  h.roofs = [{ ...mainRoof(40), poly, plate, storey: 2, ...sec }];
  h.rooms.push(room('attic', 2, 1, 1.5, 7, 4, extra));
  return h;
}

describe('rooms inherit the roof', () => {
  it('a room in the roof gets slopes, knee walls in series with the eaves roof, and a collar to the loft', () => {
    const h = roofRoom(0.3), f = faces(h, 'attic');
    const sl = f.filter((x) => x.key.startsWith('sl:attic:'));
    expect(sl).toHaveLength(2);
    expect(sl.map((x) => x.az).sort((a, b) => a! - b!)).toEqual([0, 180]);
    sl.forEach((x) => expect(x.tilt).toBe(40));
    const knee = f.find((x) => x.key === 'w:attic:N:2')!;
    const kb = h.buildups.find((b) => b.id === 'knee')!, tiles = h.buildups.find((b) => b.id === 'tiles')!;
    expect(knee.label).toContain('knee wall');
    expect(knee.U).toBeCloseTo(1 / (1 / buildupU(kb, 0.26) + Math.sin((40 * Math.PI) / 180) / buildupU(tiles, 0.14)), 6);
    // Knee height: plate + tan 40° × (1.5 m + the wall) in from the eaves.
    const g = extWallThickness(h), k = 0.3 + Math.tan((40 * Math.PI) / 180) * (1.5 + g);
    near(knee.area, 7 * k, 0.03);
    // Gable-end walls are as tall as the ceiling they meet: the collar in the middle, the slopes either side.
    expect(f.find((x) => x.key === 'w:attic:E:2')!.label).not.toContain('knee');
    const lc = f.find((x) => x.key === 'lc:attic')!, slopePlan = sl.reduce((t, x) => t + x.area * Math.cos((40 * Math.PI) / 180), 0);
    near(lc.area + slopePlan, 28, 0.001);
    expect(lc.area).toBeGreaterThan(5);
  });
  it('rooms side by side under one roof get the same slopes', () => {
    const h = roofRoom(0.3);
    h.rooms = h.rooms.filter((r) => r.id !== 'attic');
    h.rooms.push(room('a1', 2, 1, 1.5, 3.5, 4), room('a2', 2, 4.5, 1.5, 3.5, 4));
    const t = (id: string) => faces(h, id).filter((x) => x.key.startsWith('sl:')).map((x) => [x.az, x.tilt, +x.area.toFixed(2)]);
    expect(t('a1')).toEqual(t('a2'));
  });
  it('a vaulted room follows the roof all the way up: no loft over it, more volume', () => {
    const flat = roofRoom(0.3), vault = roofRoom(0.3, { ceiling: 'roof' });
    expect(faces(vault, 'attic').some((x) => x.key === 'lc:attic')).toBe(false);
    const V = (h: House) => calcHouse(h).rooms.find((r) => r.room.id === 'attic')!.V;
    expect(V(vault)).toBeGreaterThan(V(flat));
  });
  it('a dormer takes area out of a slope and adds a front, cheeks, roof and window', () => {
    const plain = roofRoom(0.3);
    const withD = roofRoom(0.3, {}, { dormers: [{ id: 'd1', at: [4.5, 7.3], w: 1.8, front: 2.2, window: 1 }] });
    const area = (h: House, k: string) => faces(h, 'attic').filter((x) => x.key.startsWith(k)).reduce((t, x) => t + x.area, 0);
    const south = (h: House) => faces(h, 'attic').filter((x) => x.key.startsWith('sl:') && x.az === 180).reduce((t, x) => t + x.area, 0);
    expect(south(withD)).toBeLessThan(south(plain));
    for (const k of ['dw:d1', 'dc:d1', 'dr:d1', 'dg:d1']) expect(area(withD, k), k).toBeGreaterThan(0);
    expect(roomRoof(withD, withD.rooms.find((r) => r.id === 'attic')!)!.V).toBeGreaterThan(roomRoof(plain, plain.rooms.find((r) => r.id === 'attic')!)!.V);
  });
  it('a lean-to over a single-storey extension slopes that room; without one it has a flat roof', () => {
    const h = defaultHouse();
    h.rooms.push(room('ext', 0, 0, 7, 4, 3));
    expect(faces(h, 'ext').some((f) => f.key === 'fr:ext')).toBe(true);
    const g = extWallThickness(h);
    h.roofs.push({ id: 'lean', name: 'Lean-to', storey: 0, plate: 2.4, form: 'mono', facing: 'S', pitch: 15, eaves: 'cold', dormers: [], poly: [[-g, 7], [4 + g, 7], [4 + g, 10 + g], [-g, 10 + g]] });
    const f = faces(h, 'ext');
    expect(f.some((x) => x.key === 'fr:ext')).toBe(false);
    expect(f.some((x) => x.key === 'lc:ext')).toBe(true);
    expect(calcHouse(h).loft!.slopes.some((s) => s.tilt === 15)).toBe(true);
  });
  it('an L-shaped top storey gets one hipped roof whose slopes cover its footprint', () => {
    const h = defaultHouse();
    h.rooms = h.rooms.filter((r) => r.storey === 0 || r.id === 'bed1' || r.id === 'bed2');
    h.rooms.push(room('bed4', 1, 0, 4.2, 4.5, 2.8));
    h.roofs = [{ ...mainRoof(), form: 'hip' }];
    const [o] = roofOutlines(h, h.roofs[0]);
    expect(o).toHaveLength(6);
    const plan = calcHouse(h).loft!.slopes.reduce((t, s) => t + s.area * Math.cos((35 * Math.PI) / 180), 0);
    // Loft over the three bedrooms (most of the L) and over the inside walls.
    expect(plan).toBeGreaterThan(polyArea(o) * 0.8);
    expect(plan).toBeLessThan(polyArea(o) * 1.001);
  });
});

describe('saves from before roof sections', () => {
  const old = (fn: (h: Record<string, unknown> & House) => void) => {
    const h = structuredClone(defaultHouse()) as unknown as Record<string, unknown> & House;
    delete (h as Partial<House>).roofs;
    fn(h);
    return upgradeHouse(h);
  };
  it('a loft becomes a roof of the same form and pitch; no loft, no roof', () => {
    const a = old((h) => { (h as unknown as { loft: object }).loft = { present: true, ach: 3, height: 1.5, pitch: 40, form: 'hip' }; });
    expect(a.roofs).toHaveLength(1);
    expect(a.roofs[0]).toMatchObject({ form: 'hip', pitch: 40 });
    expect(a.loft).toEqual({ ach: 3 });
    const b = old((h) => { (h as unknown as { loft: object }).loft = { present: false, ach: 4, height: 1.5, pitch: 35 }; });
    expect(b.roofs).toEqual([]);
  });
  it('a room in the roof becomes a roof on its storey; its collar, rooflight, dormer and slope build-up carry over', () => {
    const a = old((h) => {
      h.storeys.push({ name: 'Loft room', h: 2.3, zone: 0 });
      (h as unknown as { loft: object }).loft = { present: true, ach: 4, height: 1.5, pitch: 35 };
      h.rooms.push({ ...room('attic', 2, 0, 0, 4.2, 3.8), shape: { axis: 'ew', sides: ['knee', 'knee'], pitch: 40, knee: 1, ceiling: 2.2, eaves: ['warm', 'warm'], dormers: [null, { w: 1.8, front: 2.2, window: 1 }], rooflight: 0.5 } } as Room);
      h.faceBuildup['sl:attic:0'] = 'solid';
    });
    const r = a.rooms.find((x) => x.id === 'attic')!;
    expect('shape' in r).toBe(false);
    expect(r.ceiling).toBe(2.2);
    expect(r.rooflight).toBe(0.5);
    expect(a.roofs[0]).toMatchObject({ pitch: 40, plate: 1, eaves: 'warm', form: 'gable', ridge: 'y' });
    expect(a.roofs[0].dormers).toHaveLength(1);
    const f = calcHouse(a).rooms.find((x) => x.room.id === 'attic')!.faces;
    expect(f.filter((x) => x.key.startsWith('sl:attic:')).every((x) => x.buildup.id === 'solid')).toBe(true);
    expect(Object.keys(a.faceBuildup).some((k) => /^sl:attic:\d+$/.test(k))).toBe(false);
  });
});
