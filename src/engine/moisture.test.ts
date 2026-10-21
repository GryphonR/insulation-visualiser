import { describe, expect, it } from 'vitest';
import { psat, runMoisture } from './moisture';

const L = (...a: Array<[string, number]>) => a.map(([mat, t], i) => ({ id: i, mat, t }));
const base = { loc: 'bir', tin: 20, dv: 4, roof: false };

describe('runMoisture', () => {
  it('psat matches standard values', () => {
    expect(psat(20)).toBeCloseTo(2339, -1);
    expect(psat(0)).toBeCloseTo(610.5, 1);
  });

  it('a vapour-open wall has no interstitial condensation', () => {
    const r = runMoisture({ ...base, layers: L(['brick', 215], ['lime', 15]) })!;
    expect(r.verdict).toBe('none');
  });

  it('vapour-tight insulation on cold masonry condenses at the interface', () => {
    const r = runMoisture({ ...base, dv: 6, layers: L(['brick', 215], ['pir', 100], ['pb', 12.5]) })!;
    expect(r.verdict).not.toBe('none');
    expect(r.peakNode).toBe(1); // between brick and PIR
    expect(r.months.every((m) => m.total >= 0)).toBe(true);
  });

  it('reports moisture content only where an absorbent layer sits beside the condensate', () => {
    const wf = runMoisture({ ...base, dv: 6, layers: L(['stone', 300], ['wf', 80], ['pb', 12.5]) })!;
    expect(wf.peak).toBeGreaterThan(0);
    expect(wf.absorbed?.pct).toBeGreaterThan(0);
    expect(wf.absorbed?.crit).toBe(18);
    const pir = runMoisture({ ...base, dv: 6, layers: L(['stone', 300], ['pir', 100], ['pb', 12.5]) })!;
    expect(pir.absorbed).toBeUndefined();
  });

  it('rain wets the outer face of an absorbent layer only in proportion to exposure', () => {
    const wall = L(['h_soft_brick', 215], ['lime', 15]);
    const dry = runMoisture({ ...base, layers: wall })!;
    const sev = runMoisture({ ...base, layers: wall, catch: 0.5 })!;
    const shel = runMoisture({ ...base, layers: wall, catch: 0.05 })!;
    expect(dry.months[0].wetFace).toBe(0);
    expect(sev.months[0].wetFace).toBeGreaterThan(shel.months[0].wetFace);
    // a tight outer layer (hard limestone, mu 200) takes up much less than open brick
    const stone = runMoisture({ ...base, layers: L(['stone', 215], ['lime', 15]), catch: 0.5 })!;
    expect(stone.months[0].wetFace).toBeLessThan(sev.months[0].wetFace);
  });

  it('rising damp holds the base masonry wet, and vapour-open insulation lets it dry inward far faster than PIR', () => {
    const run = (ins: string) => runMoisture({ ...base, footing: 0.97, layers: L(['h_soft_brick', 215], [ins, 80], ['pb', 12.5]) })!;
    const pir = run('pir');
    const wf = run('wf');
    expect(pir.dampLayers).toBe(1);
    const jan = (r: typeof pir) => r.months[0];
    expect(jan(pir).p[1] / jan(pir).ps[1]).toBeGreaterThan(0.9);
    expect(jan(wf).flux[1]).toBeGreaterThan(20 * jan(pir).flux[1]); // flux through the insulation layer, inward
    expect(runMoisture({ ...base, layers: L(['h_soft_brick', 215], ['pir', 80]) })!.dampLayers).toBe(0);
  });

  it('condensation on an air cavity face drains instead of being held', () => {
    const r = runMoisture({ ...base, dv: 6, layers: L(['brick', 102], ['cavity', 50], ['pb', 12.5]) })!;
    expect(r.verdict).toBe('none');
    expect(r.peak).toBe(0);
    expect(r.drainedTotal).toBeGreaterThan(100);
    expect(r.drainedNode).toBe(1); // brick / cavity
    // behind the cavity, the sheathing/insulation boundary is not a drain, so water is still held there
    const tf = runMoisture({ ...base, dv: 6, layers: L(['brick', 102], ['cavity', 50], ['ply', 11], ['mw', 140], ['pb', 12.5]) })!;
    expect(tf.verdict).not.toBe('none');
    expect(tf.peakNode).toBe(3);
  });

  it('ignores layers outside a ventilated gap and handles an empty wall', () => {
    const r = runMoisture({ ...base, layers: L(['m_roof_tile_concrete', 15], ['vgap', 40], ['mw', 100], ['pb', 12.5]) })!;
    expect(r.layers).toHaveLength(2);
    expect(r.cutAtVent).toBe(true);
    expect(runMoisture({ ...base, layers: [] })).toBeNull();
  });
});
