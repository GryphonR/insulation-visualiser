import { describe, expect, it } from 'vitest';
import { buildupU, calcHouse } from './house';
import { defaultHouse } from './house-default';
import { KWH_PER_M3, NO_KNOBS, bestFit, calibrate, demoBills, parseMeterCsv } from './house-calibrate';
import { buildupMoisture, dewPoint, roomMoisture, vsat } from './house-moisture';
import { AGE_BANDS, TEMPLATES, newHouse } from './house-templates';
import { simulate } from './house-sim';

describe('bills calibration', () => {
  const h = defaultHouse(), res = calcHouse(h), eff = h.hp.boilerEff;
  const bills = demoBills(res, eff);

  it('uncalibrated model is off; best fit meets ASHRAE Guideline 14 monthly limits', () => {
    const raw = calibrate(res, bills, eff, NO_KNOBS);
    expect(raw.good).toBe(false);
    const k = bestFit(res, bills, eff);
    const f = calibrate(res, bills, eff, k);
    expect(f.cv).toBeLessThan(15);
    expect(Math.abs(f.nmbe)).toBeLessThan(5);
    expect(k.dt).toBeLessThan(0);
    expect(k.hf).toBeLessThan(1);
  });

  it('the energy signature recovers a heat loss coefficient from the bills', () => {
    const f = calibrate(res, bills, eff, NO_KNOBS);
    expect(f.htcMeter).not.toBeNull();
    expect(f.htcMeter!).toBeGreaterThan(res.htc * 0.7);
    expect(f.htcMeter!).toBeLessThan(res.htc * 1.4);
  });

  it('applying a calibration changes annual heat but not the design-day figures unless q50 is estimated', () => {
    const hh = defaultHouse();
    hh.calib = { dt: -1, q: 1, hf: 0.9, note: '' };
    const r2 = calcHouse(hh);
    expect(r2.peakW).toBeCloseTo(res.peakW, 6);
    expect(r2.annualKWh).toBeLessThan(res.annualKWh * 0.9);
    hh.calib.q = 1.2;
    expect(calcHouse(hh).peakW).toBeGreaterThan(res.peakW);
  });
});

describe('meter CSV import', () => {
  it('adds half-hourly kWh into months and keeps the last twelve', () => {
    const rows = ['Start,End,Consumption (kWh)'];
    for (let d = 0; d < 400; d++) {
      const day = new Date(Date.UTC(2025, 0, 1) + d * 86400000).toISOString().slice(0, 10);
      rows.push(`${day}T00:00:00Z,${day}T00:30:00Z,1.5`, `${day}T12:00:00Z,${day}T12:30:00Z,0.5`);
    }
    const r = parseMeterCsv(rows.join('\n'), 'kWh');
    expect(r.error).toBeUndefined();
    expect(r.months.length).toBe(12);
    // 400 days from 1 Jan 2025 end on 4 Feb 2026: the last twelve months are Mar 2025 – Feb 2026.
    expect(r.months[0]).toBe('2025-03');
    expect(r.gas[2]).toBe(62);
    expect(r.gas[1]).toBe(8);
  });

  it('reads UK dates and converts m³ to kWh', () => {
    const r = parseMeterCsv('Date;Reading m3\n01/01/2025;10\n15/01/2025;5\n02/02/2025;2', 'm3');
    expect(r.gas[0]).toBe(Math.round(15 * KWH_PER_M3));
    expect(r.gas[1]).toBe(Math.round(2 * KWH_PER_M3));
  });

  it('explains a file it cannot read', () => {
    expect(parseMeterCsv('a,b\n1,2', 'kWh').error).toMatch(/date column/);
  });
});

describe('room moisture', () => {
  it('vapour helpers agree: dew point of saturated air is its own temperature', () => {
    expect(dewPoint(vsat(12), 12)).toBeCloseTo(12, 6);
  });

  it('wet rooms and cold surfaces show higher surface RH; drying washing indoors raises the living room', () => {
    const h = defaultHouse(), res = calcHouse(h);
    const base = roomMoisture(h, res, { dryIndoors: false, fansUsed: true, trickleOpen: false });
    const wet = roomMoisture(h, res, { dryIndoors: true, fansUsed: true, trickleOpen: false });
    const lr = (x: typeof base) => x.rooms.find((r) => r.id === 'living')!;
    expect(lr(wet).srh).toBeGreaterThan(lr(base).srh);
    const bath = base.rooms.find((r) => r.id === 'bath')!, bed3 = base.rooms.find((r) => r.id === 'bed3')!;
    expect(bath.dv).toBeGreaterThan(lr(base).dv);
    expect(bed3.f).toBeLessThan(0.75); // solid brick south wall
    expect(bed3.spot).toMatch(/Solid brick/);
    const noFans = roomMoisture(h, res, { dryIndoors: false, fansUsed: false, trickleOpen: false });
    expect(noFans.rooms.find((r) => r.id === 'bath')!.rh).toBeGreaterThan(bath.rh);
  });

  it('default build-ups list layers outside → inside: a ventilated gap sits outside the insulation', () => {
    for (const b of defaultHouse().buildups) {
      const gap = b.layers.findIndex(([m]) => m.startsWith('vgap'));
      const ins = b.layers.findIndex(([m]) => ['mw', 'pir', 'eps', 'wf', 'cel'].includes(m));
      if (gap >= 0 && ins >= 0) expect(gap, b.name).toBeLessThan(ins);
    }
  });

  it('runs the interstitial check for each outside build-up in use', () => {
    const h = defaultHouse(), res = calcHouse(h);
    const m = buildupMoisture(h, res);
    expect(m.map((x) => x.b.id).sort()).toEqual(['cav', 'loft', 'solid']);
    expect(m.every((x) => x.r !== null)).toBe(true);
  });
});

describe('glazing g-values and shading', () => {
  it('shading a south window cools the room on the summer day; better glass g lets in more sun', () => {
    const peak = (fn: (h: ReturnType<typeof defaultHouse>) => void) => {
      const h = defaultHouse();
      fn(h);
      const r = simulate(h, 'summer'), i = r.rooms.findIndex((x) => x.id === 'dining');
      return Math.max(...r.T[i]);
    };
    const base = peak(() => {});
    const shaded = peak((h) => { h.openings.filter((o) => o.room === 'dining').forEach((o) => { o.shade = 'heavy'; }); });
    const clearer = peak((h) => { h.buildups.find((b) => b.id === 'dg')!.g = 0.85; });
    expect(shaded).toBeLessThan(base);
    expect(clearer).toBeGreaterThan(base);
  });
});

describe('new-house templates', () => {
  it('every template and age band gives an empty house that still calculates', () => {
    for (const t of TEMPLATES) for (const a of AGE_BANDS) {
      const h = newHouse({ template: t.id, age: a.id, storeys: 2 });
      expect(h.rooms, `${t.id} ${a.id}`).toEqual([]);
      expect(h.openings).toEqual([]);
      expect(h.heating.emitters).toEqual([]);
      const r = calcHouse(h);
      expect(r.checks.filter((c) => c.level === 'error'), `${t.id} ${a.id}`).toEqual([]);
      expect(Number.isFinite(r.peakW)).toBe(true);
    }
  });

  it('the age sets the build-ups: older walls leak more heat than newer ones', () => {
    const U = (age: string) => { const h = newHouse({ template: 'semi', age, storeys: 2 }); return buildupU(h.buildups.find((b) => b.id === h.defaults.extWall)!); };
    expect(U('pre-1919')).toBeGreaterThan(U('1983-95'));
    expect(U('1983-95')).toBeGreaterThan(U('2007+'));
  });

  it('storeys follow the template, and a width and depth only draw a footprint', () => {
    expect(newHouse({ template: 'bung', age: '1950-66', storeys: 3 }).storeys).toHaveLength(1);
    expect(newHouse({ template: 'det', age: '1950-66', storeys: 3 }).storeys).toHaveLength(3);
    expect(newHouse({ template: 'det', age: '1950-66', storeys: 2 }).guide).toBeUndefined();
    const g = newHouse({ template: 'det', age: '1950-66', storeys: 2, W: 8, D: 7 });
    expect(g.guide).toEqual({ w: 8, d: 7 });
    expect(g.rooms).toEqual([]);
  });
});
