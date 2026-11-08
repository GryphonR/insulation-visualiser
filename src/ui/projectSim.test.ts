import { describe, expect, it } from 'vitest';
import { DOY, MEAN, WEATHER } from '../engine/data';
import { calcHouse } from '../engine/house';
import { defaultHouse } from '../engine/house-default';
import { DEFAULT_SCENARIO, buildParams } from '../engine/scenario';
import { projectDay } from './projectSim';

describe('build-up simulator settings from the house', () => {
  const res = calcHouse(defaultHouse()), p = projectDay(res)!;

  it("uses the house's own site: its latitude and its region's temperature offset", () => {
    expect(p.patch.loc).toBe('house');
    expect(p.patch.site!.lat).toBe(res.climate.lat);
    expect(p.patch.site!.dT).toBeCloseTo(res.Tg - MEAN.reduce((a, b) => a + b, 0) / 12, 1);
    expect(p.patch.site!.name).toContain(res.station);
  });

  it('the simulator runs at that site, and falls back to a city without one', () => {
    const sc = { ...DEFAULT_SCENARIO, ...p.patch, month: 0 }, w = WEATHER.find((x) => x.id === sc.weather)!;
    const { loc, params } = buildParams(sc);
    expect(loc.name).toBe(p.patch.site!.name);
    expect(params.lat).toBe(res.climate.lat);
    expect(params.doy).toBe(DOY[0]);
    expect(params.tmean).toBeCloseTo(MEAN[0] + p.patch.site!.dT + w.dM, 6);
    expect(buildParams({ ...DEFAULT_SCENARIO, loc: 'house' }).loc.id).toBe('bir');
  });
});
