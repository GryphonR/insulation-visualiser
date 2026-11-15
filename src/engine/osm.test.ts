import { describe, expect, it, vi } from 'vitest';
import { polyArea } from './geom';
import { fetchFootprint, footprintToPlan, parseLatLon, pickBuilding } from './osm';
import type { LatLon } from './osm';

const REF: LatLon = [52.2, 0.14];
/** Ground metres east and south of REF as latitude and longitude. */
const ll = (e: number, s: number): LatLon => [REF[0] - s / 111320, REF[1] + e / (111320 * Math.cos((REF[0] * Math.PI) / 180))];
/** A w × d box turned `deg` clockwise, its first corner `at` metres east and south of REF, as a closed OSM ring. */
function box(w: number, d: number, deg: number, at: [number, number] = [0, 0]): LatLon[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[0, 0], [w, 0], [w, d], [0, d], [0, 0]].map(([x, y]) => ll(at[0] + x * c - y * s, at[1] + x * s + y * c));
  return pts;
}
const geom = (r: LatLon[]) => ({ type: 'way', geometry: r.map(([lat, lon]) => ({ lat, lon })) });

describe('OpenStreetMap footprint', () => {
  it('reads a pasted latitude and longitude', () => {
    expect(parseLatLon(' 52.19870, 0.14350 ')).toEqual([52.1987, 0.1435]);
    expect(parseLatLon('51.5 -0.12')).toEqual([51.5, -0.12]);
    expect(parseLatLon('B15 2TT')).toBeNull();
    expect(parseLatLon('95, 0')).toBeNull();
  });

  it('picks the building the point is in, else the nearest close by', () => {
    const near = box(6, 6, 0, [-20, -3]), mine = box(8, 10, 0, [-4, -5]);
    expect(pickBuilding([geom(near), geom(mine)], REF)![1]).toEqual(mine[1]);
    expect(pickBuilding([geom(near)], REF)![1]).toEqual(near[1]);
    expect(pickBuilding([geom(box(6, 6, 0, [60, 60]))], REF)).toBeNull();
  });

  it('squares a turned house to the plan and keeps its size and place', () => {
    const f = footprintToPlan(box(8, 10, 20));
    expect(f.north).toBeCloseTo(20, 0);
    expect(f.poly).toHaveLength(4);
    expect(polyArea(f.poly)).toBeCloseTo(80, 0);
    const xs = f.poly.map((p) => p[0]), ys = f.poly.map((p) => p[1]);
    expect(Math.min(...xs)).toBe(0); expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...xs)).toBeCloseTo(8, 1); expect(Math.max(...ys)).toBeCloseTo(10, 1);
    // Plan (0, 0) is the box's first corner, which sat at REF.
    expect(f.origin[0]).toBeCloseTo(REF[0], 6); expect(f.origin[1]).toBeCloseTo(REF[1], 6);
  });

  it('treats a busy server\'s empty answer as busy, and asks the next server', async () => {
    const json = (body: object) => new Response(JSON.stringify(body), { status: 200 });
    const mine = box(8, 10, 0, [-4, -5]);
    const answers = [json({ elements: [], remark: 'runtime error: Query timed out' }), json({ elements: [geom(mine)] })];
    vi.stubGlobal('fetch', vi.fn(async () => answers.shift() ?? new Response('', { status: 502 })));
    try {
      expect((await fetchFootprint(REF))[1]).toEqual(mine[1]);
      answers.push(json({ elements: [], remark: 'runtime error: out of memory' }));
      await expect(fetchFootprint(REF)).rejects.toThrow(/busy/);
      answers.push(json({ elements: [] }));
      await expect(fetchFootprint(REF)).rejects.toThrow(/No building/);
    } finally { vi.unstubAllGlobals(); }
  });

  it('keeps a given plan turn, and drops corners on a straight wall', () => {
    const r = box(8, 10, 0);
    r.splice(1, 0, ll(4, 0.02)); // a stray point along the first wall
    const f = footprintToPlan(r, 0);
    expect(f.north).toBe(0);
    expect(f.poly).toHaveLength(4);
  });
});
