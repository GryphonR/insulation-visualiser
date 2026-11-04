import { describe, expect, it } from 'vitest';
import { psat, runMoisture } from './moisture';

const L = (...a: Array<[string, number]>) => a.map(([mat, t], i) => ({ id: i, mat, t }));
const base = { loc: 'bir', tin: 20, dv: 4, roof: false };

describe('runMoisture', () => {
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
    // rising damp, no rain: the brick behind cement render stays damper at the render than behind lime
    const rh = (r: ReturnType<typeof wall>) => r.months[0].p[1] / r.months[0].ps[1];
    expect(rh(wall('m_cement_sand', { footing: 0.97 }))).toBeGreaterThan(rh(wall('m_lime_sand', { footing: 0.97 })) + 0.02);
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
    const run = (ins: string) => runMoisture({ ...base, footing: 0.97, layers: L(['h_soft_brick', 215], [ins, 80], ['pb', 12.5]) })!;
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
