import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import { defaultHouse } from './house-default';
import { lpm } from './house-heating';
import { PIPE_SIZES, autoPipes, pipeFlow, sizePipes } from './house-pipes';

describe('pipe sizing', () => {
  it('velocity and pressure drop: a known case (15 mm copper, 3 l/min ≈ 0.34 m/s, ~130 Pa/m)', () => {
    const { v, paM } = pipeFlow(3, PIPE_SIZES['Cu 15 mm']);
    expect(v).toBeCloseTo(0.344, 2);
    expect(paM).toBeGreaterThan(100);
    expect(paM).toBeLessThan(170);
    expect(pipeFlow(0, 13.6)).toEqual({ v: 0, paM: 0 });
  });

  it('auto layout pipes every emitter; the primary carries the whole house load', () => {
    const h = defaultHouse();
    h.heating.pipes = autoPipes(h);
    const res = calcHouse(h), p = sizePipes(h, res);
    expect(p.unpiped).toEqual([]);
    const primary = p.rows.find((r) => r.pipe.id === 'P1')!;
    expect(primary.loadW).toBeCloseTo(res.peakW, 0);
    expect(primary.flowLpm).toBeCloseTo(lpm(res.peakW, h.heating.dT), 6);
    expect(p.indexPath[0]).toBe('P1');
    expect(p.rows.filter((r) => r.index).length).toBe(p.indexPath.length);
  });

  it('flags an undersized microbore run and a long index circuit', () => {
    const h = defaultHouse();
    h.heating.pipes = autoPipes(h).map((x) => (x.id === 'P1' ? { ...x, size: 'Cu 10 mm (microbore)' } : x));
    const p = sizePipes(h, calcHouse(h));
    expect(p.rows.find((r) => r.pipe.id === 'P1')!.ok).toBe(false);
    expect(p.headOk).toBe(false);
  });
});
