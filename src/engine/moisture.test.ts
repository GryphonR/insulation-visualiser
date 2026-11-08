import { describe, expect, it } from 'vitest';
import { FOOTINGS, psat, runMoisture } from './moisture';

const L = (...a: Array<[string, number]>) => a.map(([mat, t], i) => ({ id: i, mat, t }));
const base = { loc: 'bir', tin: 20, dv: 4, roof: false };
const WET = FOOTINGS[2].months;

describe('runMoisture', () => {
  it('WTA 6-5 checks: a sound wall passes frost; PIR on solid brick wets the interface and raises frost risk; mineral IWI on stone passes', () => {
    const run = (...l: Array<[string, number]>) => runMoisture({ ...base, loc: 'man', catch: 0.15, layers: L(...l) })!;
    const get = (r: ReturnType<typeof run>, id: string) => r.checks.filter((c) => c.id === id);
    // uninsulated: over WTA's 30% of pores in rain, but taken as a sound wall that copes with its own exposure
    const brick = run(['brick', 225], ['m_lime_sand', 15]);
    expect(get(brick, 'frost').every((c) => c.level === 'ok')).toBe(true);
    expect(get(brick, 'interface')).toHaveLength(0);
    const pir = run(['brick', 225], ['pir', 60], ['pb', 12.5]);
    expect(get(pir, 'frost')[0].level).toBe('fail');
    expect(get(pir, 'frost')[0].value).toBeGreaterThan(get(brick, 'frost')[0].value);
    expect(get(pir, 'interface')[0].level).toBe('fail');
    const stone = run(['h_rubble_wall', 500], ['h_lime_putty_plaster', 15], ['h_diathonite', 60], ['h_lime_putty_plaster', 10]);
    expect(stone.checks.every((c) => c.level === 'ok')).toBe(true); // interface 95–99%, but all mineral
    // a filled cavity is not internal insulation, and is judged for frost against the empty cavity
    const fill = run(['brick', 102], ['eps', 50], ['dblock', 100], ['m_lime_sand', 13]);
    expect(get(fill, 'interface')).toHaveLength(0);
    expect(get(fill, 'frost')[0].level).toBe('fail');
    // gypsum plaster behind EPS passes 95% RH
    const gyp = run(['brick', 225], ['m_gypsum_1200', 13], ['eps', 80], ['pb', 12.5]);
    expect(get(gyp, 'gypsum')[0]?.level).toBe('fail');
  });

  it('a thick sound stone wall in moderate rain settles and dries each year; insulating it inside keeps it damp but no wetter year on year', () => {
    const run = (...l: Array<[string, number]>) => runMoisture({ ...base, loc: 'man', catch: 0.15, layers: L(...l) })!;
    const bare = run(['h_rubble_wall', 500], ['h_lime_putty_plaster', 20]);
    expect(bare.years).toBeGreaterThan(3); // takes longer than a thin wall to settle
    expect(bare.verdict).toBe('dries');
    const iwi = run(['h_rubble_wall', 500], ['h_lime_putty_plaster', 15], ['h_diathonite', 60], ['h_lime_putty_plaster', 10]);
    expect(iwi.verdict).toBe('accumulates');
    expect(iwi.growing).toBe(false);
    expect(iwi.low).toBeGreaterThan(2 * bare.low);
  });

  it('psat matches standard values', () => {
    expect(psat(20)).toBeCloseTo(2339, -1);
    expect(psat(0)).toBeCloseTo(610.5, 1);
  });

  it('a vapour-open wall stays dry, and the water balance closes', () => {
    const r = runMoisture({ ...base, layers: L(['brick', 215], ['m_lime_sand', 15]) })!;
    expect(r.verdict).toBe('none');
    expect(Math.abs(r.massError)).toBeLessThan(1);
  });

  it('lime render lets a rain-wetted brick wall dry better than cement render', () => {
    const wall = (render: string, o = {}) => runMoisture({ ...base, ...o, layers: L([render, 20], ['brick', 225], ['m_lime_sand', 15]) })!;
    const lime = wall('m_lime_sand', { catch: 0.15 }), cement = wall('m_cement_sand', { catch: 0.15 });
    expect(lime.peak).toBeLessThan(0.8 * cement.peak);
    expect(lime.months[0].stored[1]).toBeLessThan(cement.months[0].stored[1]); // water held in the brick in January
    // the water balance still closes to well under 1% of the rain on the wall (~110 kg/m² a year)
    expect(Math.abs(cement.massError)).toBeLessThan(100);
    // ground moisture, no rain: cement slows the drying, so the damp rises higher and the brick holds more; with wet
    // ground all year the lime-rendered wall dries right out each summer while the cement-rendered one keeps some water
    // (a few percent of what the brick can hold, so it still counts as drying for a wall this thick)
    const [limeW, cementW] = ['m_lime_sand', 'm_cement_sand'].map((r) => wall(r, { footing: WET }));
    expect(cementW.riseHeight).toBeGreaterThan(1.1 * limeW.riseHeight);
    expect(cementW.peak).toBeGreaterThan(1.15 * limeW.peak);
    expect(limeW.verdict).toBe('dries');
    expect(limeW.low).toBe(0);
    expect(cementW.low).toBeGreaterThan(500);
  });

  it('judges drying on the driest month: solid brick in moderate rain dries out; cement-rendered hempcrete builds up', () => {
    const run = (...l: Array<[string, number]>) => runMoisture({ ...base, catch: 0.15, layers: L(...l) })!;
    const brick = run(['brick', 225], ['m_lime_sand', 15]);
    expect(brick.verdict).toBe('dries'); // autumn rain starts rewetting it before September ends
    expect(brick.low).toBeLessThan(5);
    const iwi = run(['brick', 225], ['wf', 80], ['m_lime_sand', 15]);
    expect(iwi.growing).toBe(false); // still settling from its starting state, not building up
    // hempcrete behind cement render gets wetter each winter (peak still rising after 3 years); behind lime it has settled
    const hempCement = run(['m_cement_sand', 15], ['hemp', 300], ['m_lime_sand', 15]);
    const hempLime = run(['m_lime_sand', 15], ['hemp', 300], ['m_lime_sand', 15]);
    expect(Math.max(...hempCement.yearN)).toBeGreaterThan(1.1 * Math.max(...hempCement.year1));
    expect(Math.max(...hempLime.yearN)).toBeLessThan(1.05 * Math.max(...hempLime.year1));
    expect(hempCement.peak).toBeGreaterThan(1.5 * hempLime.peak);
    expect(hempLime.verdict).toBe('dries');
  });

  it('damp footings only ever add water, never drain a rain-wetted wall', () => {
    const wall = (months: number[]) => runMoisture({ ...base, catch: 0.15, footing: months, layers: L(['brick', 225], ['m_lime_sand', 15]) })!;
    const [dry, damp, wet] = FOOTINGS.map((f) => wall(f.months));
    expect(dry.riseHeight).toBe(0);
    expect(damp.peak).toBeGreaterThan(dry.peak);
    expect(wet.low).toBeGreaterThan(damp.low);
    expect(wet.riseHeight).toBeGreaterThan(0.5);
    expect(wet.riseHeight).toBeLessThan(3);
    // winter-only damp climbs no higher than standing damp, and drains away in summer while standing damp stays up
    expect(wet.riseHeight).toBeGreaterThanOrEqual(damp.riseHeight);
    expect(damp.riseLow).toBeLessThan(0.1);
    expect(wet.riseLow).toBeGreaterThan(0.5);
    // moisture tapers up the wet zone: at 1 m below a ~1.4 m front the brick is damp, not waterlogged (wf is 188 kg/m³)
    const brickAt1m = (wet.months[1].stored[0] / 1000 + 13.4 * 0.225) / 0.225; // held is above the 95% RH level, 13.4 kg/m³
    expect(brickAt1m).toBeGreaterThan(0.25 * 188);
    expect(brickAt1m).toBeLessThan(0.75 * 188);
  });

  it('a wicking layer never holds more than its free saturation: the excess runs down out of it', () => {
    const r = runMoisture({ ...base, catch: 0.5, layers: L(['brick', 225], ['pir', 80], ['pb', 12.5]) })!;
    const brickMax = 188 * 0.225 * 1000; // free saturation x thickness, g/m²
    for (const m of r.months) expect(m.stored[0]).toBeLessThanOrEqual(brickMax);
    expect(Math.max(...r.months.map((m) => m.sat[0]))).toBeCloseTo(1, 2);
    expect(r.overflowLayer).toBe(0);
    expect(r.overflowTotal).toBeGreaterThan(1000);
    expect(Math.abs(r.massError)).toBeLessThan(200);
  });

  it('a timber frame with no vapour control wets the sheathing above the rot threshold', () => {
    const tf = runMoisture({ ...base, dv: 6, layers: L(['brick', 102], ['cavity', 50], ['ply', 11], ['mw', 140], ['pb', 12.5]) })!;
    expect(tf.verdict).not.toBe('none');
    expect(tf.peakLayer).toBe(3); // free water in the mineral wool against the cold ply
    expect(tf.absorbed?.layer).toBe(2);
    expect(tf.absorbed!.pct).toBeGreaterThan(tf.absorbed!.crit);
    expect(tf.noCapillary).toContain('Mineral wool');
  });

  it('reports moisture content only for organic layers', () => {
    const wf = runMoisture({ ...base, dv: 6, layers: L(['m_limestone_hard', 300], ['wf', 80], ['pb', 12.5]) })!;
    expect(wf.absorbed?.pct).toBeGreaterThan(0);
    expect(wf.absorbed?.crit).toBe(18);
    const pir = runMoisture({ ...base, dv: 6, layers: L(['m_limestone_hard', 300], ['pir', 100], ['pb', 12.5]) })!;
    expect(pir.absorbed).toBeUndefined();
  });

  it('the outer face takes up rain by exposure and by its capillarity', () => {
    const wall = (outer: string, c: number) => runMoisture({ ...base, catch: c, layers: L([outer, 215], ['m_lime_sand', 15]) })!.months[0].wetFace;
    expect(wall('h_soft_brick', 0)).toBe(0);
    expect(wall('h_soft_brick', 0.5)).toBeGreaterThan(wall('h_soft_brick', 0.05));
    expect(wall('h_granite', 0.15)).toBeLessThan(0.2 * wall('h_soft_brick', 0.15));
  });

  it('rising damp wicks into the masonry, and vapour-open insulation lets it dry inward faster than PIR', () => {
    const run = (ins: string) => runMoisture({ ...base, footing: WET, layers: L(['h_soft_brick', 215], [ins, 80], ['pb', 12.5]) })!;
    const pir = run('pir');
    const wf = run('wf');
    expect(pir.dampLayers).toBe(1);
    const jan = (r: typeof pir) => r.months[0];
    expect(jan(pir).p[1] / jan(pir).ps[1]).toBeGreaterThan(0.9);
    expect(-jan(wf).flux[1]).toBeGreaterThan(-5 * jan(pir).flux[1]); // flow through the insulation layer, towards the room
    expect(runMoisture({ ...base, layers: L(['h_soft_brick', 215], ['pir', 80]) })!.dampLayers).toBe(0);
  });

  it('condensation in a cavity between non-absorbent layers drains instead of being held', () => {
    const r = runMoisture({ ...base, dv: 6, layers: L(['pir', 25], ['cavity', 50], ['mw', 100], ['pb', 12.5]) })!;
    expect(r.drainedTotal).toBeGreaterThan(100);
    expect(r.drainedLayer).toBe(1);
  });

  it('ignores layers outside a ventilated gap and handles an empty wall', () => {
    const r = runMoisture({ ...base, layers: L(['m_roof_tile_concrete', 15], ['vgap', 40], ['mw', 100], ['pb', 12.5]) })!;
    expect(r.layers).toHaveLength(2);
    expect(r.cutAtVent).toBe(true);
    expect(runMoisture({ ...base, layers: [] })).toBeNull();
  });
});

describe('runMoisture at the house site', () => {
  it("uses the site's latitude and temperatures, the same as a city with those numbers; without a site, the default city", () => {
    const layers = L(['brick', 225], ['pir', 60], ['pb', 12.5]);
    const city = runMoisture({ ...base, loc: 'man', layers })!;
    const site = runMoisture({ ...base, loc: 'house', site: { id: 'house', name: 'This house', lat: 53.5, dT: -0.4 }, layers })!;
    expect(site.months.map((m) => m.rhSurf)).toEqual(city.months.map((m) => m.rhSurf));
    const warmer = runMoisture({ ...base, loc: 'house', site: { id: 'house', name: 'This house', lat: 53.5, dT: 1.5 }, layers })!;
    expect(warmer.months[0].te).toBeGreaterThan(city.months[0].te);
    expect(runMoisture({ ...base, loc: 'house', layers })!.months[0].te).toBe(runMoisture({ ...base, layers })!.months[0].te);
  });
});
