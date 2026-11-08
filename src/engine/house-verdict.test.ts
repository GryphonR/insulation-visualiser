import { describe, expect, it } from 'vitest';
import { defaultHouse } from './house-default';
import { roomAnswer, verdict } from './house-sim';
import type { SimResult } from './house-sim';

const h = defaultHouse();
const room = (id: string, heated = true) => ({ id, name: id.toUpperCase(), heated, setpoint: 21 });
const c = (id: string, p: Partial<SimResult['comfort'][number]> = {}) => ({ id, cold: 0, late: 0, warm: 0, min: 18, max: 22, below16: null, ...p });
const run = (id: SimResult['id'], comfort: SimResult['comfort'], extra: Partial<SimResult> = {}) =>
  ({ id, hours: id === 'snap' ? 120 : 24, rooms: comfort.map((x) => room(x.id)), comfort, peakW: 3000, heatKWh: 1000, ...extra }) as SimResult;

describe('test-case verdicts', () => {
  it('coldest day: warm-up hours are allowed, a room still short after them is named', () => {
    expect(verdict(h, run('design', [c('a', { cold: 3, late: 0 })])).ok).toBe(true);
    const v = verdict(h, run('design', [c('a', { cold: 5, late: 2 }), c('b')]));
    expect(v.ok).toBe(false);
    expect(v.text).toContain('A stays');
  });

  it('year: gives the cost, warns only past a day of shortfall', () => {
    expect(verdict(h, run('year', [c('a', { late: 20 })]), 742.4).text).toBe('About £742 for 1,000 kWh of space heating.');
    expect(verdict(h, run('year', [c('a', { late: 30 })]), 742).ok).toBe(false);
  });

  it('heatwave: over the limit for more than 3 hours counts', () => {
    expect(verdict(h, run('summer', [c('a', { warm: 3, max: 25.5 })])).ok).toBe(true);
    const v = verdict(h, run('summer', [c('a', { warm: 4, max: 27.2 }), c('b', { max: 24 })]));
    expect(v.ok).toBe(false);
    expect(v.text).toContain('A reaches 27.2 °C');
  });

  it('cold snap: a day or more above 16 °C passes; unheated rooms are left out', () => {
    expect(verdict(h, run('snap', [c('a', { below16: 30 })])).ok).toBe(true);
    expect(verdict(h, run('snap', [c('a')])).text).toBe('All 5 days: every heated room stays above 16 °C.');
    const r = run('snap', [c('a', { below16: 0 }), c('b', { below16: 5 })]);
    r.rooms[0].heated = false;
    expect(verdict(h, r).text).toBe('Less than a day: B is first to drop below 16 °C, after 5 hours.');
  });
});

describe('one room in the test runs', () => {
  const withP = (r: SimResult, w: number) => ({ ...r, P: r.rooms.map(() => Float32Array.from({ length: r.hours }, () => w)) }) as SimResult;

  it('coldest day and year: peak and energy when it keeps up, the shortfall when not', () => {
    expect(roomAnswer(withP(run('design', [c('a')]), 1234), 'a')).toEqual({ ok: true, text: 'Holds 21 °C after warming up; peak 1,234 W.' });
    expect(roomAnswer(withP(run('design', [c('a', { late: 1, min: 17.25 })]), 0), 'a')!.text).toBe('More than 1 K below 21 °C for 1 hour after warming up; lowest 17.3 °C.');
    expect(roomAnswer(withP(run('year', [c('a', { late: 30 })]), 500), 'a')).toEqual({ ok: false, text: '12 kWh a year; more than 1 K below 21 °C for 30 hours after warming up.' });
  });

  it('unheated rooms give their range, except in the heatwave; unknown rooms give nothing', () => {
    const r = run('snap', [c('a', { below16: 0, min: 9, max: 15 })]);
    r.rooms[0].heated = false;
    expect(roomAnswer(r, 'a')).toEqual({ ok: true, text: 'Unheated: between 9.0 and 15.0 °C.' });
    const s = run('summer', [c('a', { warm: 5, max: 28 })]);
    s.rooms[0].heated = false;
    expect(roomAnswer(s, 'a')).toEqual({ ok: false, text: 'Over the limit for 5 hours, peaking at 28.0 °C.' });
    expect(roomAnswer(r, 'nope')).toBeNull();
  });

  it('cold snap: hours to 16 °C', () => {
    expect(roomAnswer(run('snap', [c('a', { below16: 1 })]), 'a')).toEqual({ ok: false, text: 'Below 16 °C after 1 hour.' });
    expect(roomAnswer(run('snap', [c('a')]), 'a')!.ok).toBe(true);
  });
});
