import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import { defaultHouse } from './house-default';
import { NO_KNOBS, bestFit, calibrate, demoBills } from './house-calibrate';
import { buildupMoisture, dewPoint, roomMoisture, vsat } from './house-moisture';
import { AGE_BANDS, TEMPLATES, newHouse } from './house-templates';

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

describe('new-house templates', () => {
  it('every template and age band builds a house with no errors and a sensible loss', () => {
    for (const t of TEMPLATES) for (const a of AGE_BANDS) {
      const h = newHouse({ template: t.id, age: a.id, W: 8, D: 7, storeys: 2, epc: {} });
      const r = calcHouse(h);
      expect(r.checks.filter((c) => c.level === 'error'), `${t.id} ${a.id}`).toEqual([]);
      expect(r.peakW / r.heatedA, `${t.id} ${a.id}`).toBeGreaterThan(15);
      expect(r.peakW / r.heatedA, `${t.id} ${a.id}`).toBeLessThan(200);
      expect(h.heating.emitters.length).toBeGreaterThan(0);
    }
  });

  it('older houses lose more than newer ones; a mid-terrace less than a detached', () => {
    const loss = (age: string, template = 'semi') => calcHouse(newHouse({ template, age, W: 8, D: 7, storeys: 2, epc: {} })).peakW;
    expect(loss('pre-1919')).toBeGreaterThan(loss('1983-95'));
    expect(loss('1983-95')).toBeGreaterThan(loss('2007+'));
    expect(loss('1950-66', 'mid')).toBeLessThan(loss('1950-66', 'det'));
  });

  it('a narrow terrace (5 m) and a three-storey house build cleanly too', () => {
    for (const inp of [{ W: 5, storeys: 2 }, { W: 9, storeys: 3 }]) {
      const h = newHouse({ template: 'mid', age: 'pre-1919', D: 9, epc: {}, ...inp });
      const r = calcHouse(h);
      expect(r.checks.filter((c) => c.level === 'error')).toEqual([]);
      expect(h.rooms.some((x) => x.type === 'bathroom')).toBe(true);
      expect(r.heatedA).toBeCloseTo(inp.W * 9 * inp.storeys - (h.rooms.find((x) => x.id === 'utility') ? h.rooms.find((x) => x.id === 'utility')!.w * h.rooms.find((x) => x.id === 'utility')!.d : 0), 1);
    }
  });

  it('EPC choices override the age defaults', () => {
    const a = calcHouse(newHouse({ template: 'semi', age: '1950-66', W: 8, D: 7, storeys: 2, epc: {} })).peakW;
    const b = calcHouse(newHouse({ template: 'semi', age: '1950-66', W: 8, D: 7, storeys: 2, epc: { wall: true, roof: true } })).peakW;
    expect(b).toBeLessThan(a);
  });
});
