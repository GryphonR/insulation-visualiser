import { describe, expect, it } from 'vitest';
import { house3d, storeyZ } from './house-3d';
import type { Surf } from './house-3d';
import { calcHouse, extWallThickness, roofOutlines, roomArea } from './house';
import { defaultHouse } from './house-default';
import { polyArea } from './geom';

/** Total triangle area, and the area seen from above. */
function areas(s: Surf[]) {
  let a = 0, plan = 0;
  for (const x of s) for (let i = 0; i < x.tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = x.tris.slice(i, i + 9);
    const u = [bx - ax, by - ay, bz - az], v = [cx - ax, cy - ay, cz - az];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    a += Math.hypot(n[0], n[1], n[2]) / 2;
    plan += Math.abs(n[1]) / 2;
  }
  return { a, plan };
}

describe('the house in 3D', () => {
  const h = defaultHouse(), s = house3d(h), Z = storeyZ(h);
  it('stacks storeys on their floor zones', () => {
    expect(Z).toEqual([0, 2.4 + 0.25]);
  });
  it('every room has a floor of its own area at its storey level', () => {
    for (const r of h.rooms) {
      const f = s.filter((x) => x.kind === 'floor' && x.room === r.id);
      expect(areas(f).plan).toBeCloseTo(roomArea(r), 6);
      expect(f[0].tris.filter((_, i) => i % 3 === 1).every((y) => y === Z[r.storey])).toBe(true);
    }
  });
  it('the roof covers its outline and rises to the ridge', () => {
    const roof = s.filter((x) => x.kind === 'roof'), [o] = roofOutlines(h, h.roofs[0]);
    expect(areas(roof).plan).toBeCloseTo(polyArea(o), 3);
    const g = extWallThickness(h), ridge = Z[1] + 2.4 + ((7 + 2 * g) / 2) * Math.tan((35 * Math.PI) / 180);
    const ys = roof.flatMap((x) => x.tris.filter((_, i) => i % 3 === 1));
    expect(Math.max(...ys)).toBeCloseTo(ridge, 1);
    expect(Math.min(...ys)).toBeCloseTo(Z[1] + 2.4, 6);
  });
  it('outside wall surfaces match the heat-loss faces (before openings come off)', () => {
    const res = calcHouse(h), byKey = new Map(res.rooms.flatMap((r) => r.faces).map((f) => [f.key, f]));
    for (const x of s.filter((q) => q.kind === 'wall' && q.key?.startsWith('w:'))) {
      const f = byKey.get(x.key!)!;
      const opA = res.rooms.flatMap((r) => r.faces).filter((q) => q.key.startsWith('op:') && h.openings.find((o) => `op:${o.id}` === q.key && o.room === x.room && !o.to)).length;
      if (opA) continue;
      // The heat-loss face runs on up through the floor zone; the room's own wall stops at its ceiling.
      const st = h.storeys[x.storey], k = x.storey < h.storeys.length - 1 ? st.h / (st.h + st.zone) : 1;
      expect(areas([x]).a, x.key).toBeCloseTo(f.area * k, 2);
    }
  });
  it('every outside window and door shows on both faces of the outside wall and of its room wall', () => {
    const n = h.openings.filter((o) => !o.to).length;
    expect(s.filter((x) => (x.kind === 'window' || x.kind === 'door') && x.outer).length).toBe(2 * n);
    expect(s.filter((x) => (x.kind === 'window' || x.kind === 'door') && !x.outer).length).toBe(2 * n);
  });
  it('each room outside wall also shows on the outside of the house, with its own face, as tall as the outside', () => {
    const inner = s.filter((x) => x.kind === 'wall' && x.key?.startsWith('w:')), outer = s.filter((x) => x.kind === 'outwall');
    expect(outer.map((x) => `${x.room}|${x.key}`).sort()).toEqual(inner.map((x) => `${x.room}|${x.key}`).sort());
    for (const o of outer) {
      const i = inner.find((x) => x.key === o.key && x.room === o.room)!;
      // Up through the floor zone (or to the roof) outside, against the room's ceiling inside.
      expect(areas([o]).a, o.key).toBeGreaterThanOrEqual(areas([i]).a - 1e-6);
    }
  });
  it('rooms sharing a wall never draw it on the same plane', () => {
    const walls = s.filter((x) => x.kind === 'wall' && x.key?.startsWith('iw:'));
    const planes = new Map<string, string>();
    let pieces = 0;
    for (const w of walls) {
      // Every short piece of wall (two triangles, 18 numbers): its bottom edge, either way round, since the two rooms run a shared wall in opposite directions.
      for (let i = 0; i < w.tris.length; i += 18) {
        const [ax, ay, az, bx, , bz] = w.tris.slice(i, i + 6);
        const ends = [`${ax.toFixed(3)},${az.toFixed(3)}`, `${bx.toFixed(3)},${bz.toFixed(3)}`].sort(), k = `${ay.toFixed(3)}|${ends.join('|')}`;
        // A room through two storeys repeats its own wall; two different rooms on one plane would flicker.
        expect(planes.get(k) ?? w.room, w.label).toBe(w.room);
        planes.set(k, w.room!);
        pieces++;
      }
    }
    expect(pieces).toBeGreaterThan(20);
  });
  it('a dormer and a single-storey extension with no roof of its own (flat top) show up', () => {
    const x = defaultHouse();
    x.roofs[0].dormers.push({ id: 'd', at: [2, 7.3], w: 1.6, front: 3.6, window: 1 });
    x.rooms.push({ id: 'ext', name: 'Ext', type: 'kitchen', storey: 0, span: 1, x: 0, y: 7, w: 4, d: 3, heated: true, setpoint: 21, ach: 1 });
    const q = house3d(x);
    expect(q.some((k) => k.kind === 'dormer')).toBe(true);
    expect(areas(q.filter((k) => k.kind === 'flat')).plan).toBeGreaterThan(10);
  });
});
