import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import { defaultHouse } from './house-default';
import { emitterOut, loopArea, loopLength } from './house-heating';
import type { Emitter } from './house-heating';
import { loopLayout, loopRoute } from './house-ufh';
import type { LoopPattern } from './house-ufh';

const R = { x: 1, y: 2, w: 4, h: 3 };
const inside = (p: [number, number]) => p[0] >= R.x - 1e-9 && p[0] <= R.x + R.w + 1e-9 && p[1] >= R.y - 1e-9 && p[1] <= R.y + R.h + 1e-9;

describe('UFH routes', () => {
  for (const pat of ['spiral', 'serp', 'dserp'] as LoopPattern[]) {
    it(`${pat}: stays in its rectangle, length close to area ÷ spacing`, () => {
      const r = loopRoute(R, 150, pat);
      for (const p of [...r.flow, ...r.ret, ...r.bend]) expect(inside(p), `${pat} ${p}`).toBe(true);
      const est = (R.w * R.h) / 0.15;
      expect(r.inFloor).toBeGreaterThan(est * 0.8);
      expect(r.inFloor).toBeLessThan(est * 1.2);
      expect(r.entry[0]).toBeCloseTo(R.x, 6); // fed from the west edge
    });
  }

  it('closer spacing means a longer loop; mirroring to the south-east corner moves the feed', () => {
    expect(loopRoute(R, 100, 'spiral').inFloor).toBeGreaterThan(loopRoute(R, 200, 'spiral').inFloor * 1.6);
    const se = loopRoute(R, 150, 'spiral', 'se');
    expect(se.entry[0]).toBeCloseTo(R.x + R.w, 6);
    expect(se.entry[1]).toBeGreaterThan(R.y + R.h / 2);
    expect(se.inFloor).toBeCloseTo(loopRoute(R, 150, 'spiral').inFloor, 6);
  });

  it('a drawn loop takes its tails to the manifold, its length and area from the drawing', () => {
    const h = defaultHouse();
    h.heating.zones.push({ id: 'z4', name: 'UFH', kind: 'ufh', color: '#7a45b8', on: true, hours: null, blend: 35, manifold: { x: 8.5, y: 6.5 } });
    const e: Emitter = { id: 'L1', room: 'kitchen', kind: 'ufh', zone: 'z4', type: 'K2', len: 0, height: 0, rated: 0, area: 99, spacing: 150, cover: 'Tiles', tail: 5,
      rect: { x: 4.6, y: 0.1, w: 4.3, h: 3.4 }, pattern: 'spiral', corner: 'se' };
    h.heating.emitters = h.heating.emitters.filter((x) => x.room !== 'kitchen').concat(e);
    const lay = loopLayout(h, e)!;
    expect(lay.tails![2]).toEqual([8.5, 6.5]);
    expect(lay.tailLen).toBeCloseTo(2 * (Math.abs(8.5 - lay.route.entry[0]) + Math.abs(6.5 - lay.route.entry[1])), 6);
    expect(loopLength(e, h)).toBeCloseTo(lay.total, 6);
    expect(loopArea(e)).toBeCloseTo(4.3 * 3.4, 6);
    expect(emitterOut(e, 45, 21, h)).toBeGreaterThan(0);
    const res = calcHouse(h);
    expect(res.checks.some((c) => c.text.includes('runs outside'))).toBe(false);
    e.rect = { x: 3, y: 0.1, w: 4.3, h: 3.4 };
    expect(calcHouse(h).checks.some((c) => c.text.includes('runs outside'))).toBe(true);
  });
});
