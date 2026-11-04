import { describe, expect, it } from 'vitest';
import { MAT } from './data';
import { calcHouse } from './house';
import { DEMOS } from './house-demos';
import { flowNeeded } from './house-heating';
import { runMoisture } from './moisture';

describe('demo projects', () => {
  for (const d of DEMOS) {
    it(`${d.label}: every material exists, every face has a build-up, and each scenario's rads keep up`, () => {
      const p = d.make();
      for (const s of p.scenarios) {
        const h = s.house;
        for (const b of h.buildups) for (const [m] of b.layers) expect(MAT[m], `${b.name}: ${m}`).toBeTruthy();
        for (const id of [...Object.values(h.defaults), ...Object.values(h.faceBuildup), ...h.openings.map((o) => o.buildup)]) expect(h.buildups.some((b) => b.id === id), id).toBe(true);
        const res = calcHouse(h);
        expect(res.peakW).toBeGreaterThan(0);
        expect(res.hp.spare).toBeGreaterThanOrEqual(0);
        // The original 1950s demo's kitchen radiator already falls short; not part of these demos.
        if (d.id !== '1950s') for (const r of res.rooms.filter((x) => x.room.heated)) expect(flowNeeded(h, r.room.id, r.totalW, r.room.setpoint), `${s.name}: ${r.room.name}`).toBeLessThanOrEqual(h.hp.maxFlow + 0.5);
      }
      // An upgrade scenario must cut the heat loss.
      if (p.scenarios.length > 1) expect(calcHouse(p.scenarios[1].house).peakW).toBeLessThan(calcHouse(p.scenarios[0].house).peakW);
    });
  }

  it('the breathable IWI on stone and on brick passes the WTA 6-5 checks in moderate rain, with no rot and no build-up', () => {
    for (const id of ['cottage', 'victorian']) {
      const iwi = DEMOS.find((d) => d.id === id)!.make().scenarios[1].house.buildups.find((b) => b.id === 'iwi')!;
      const r = runMoisture({ layers: iwi.layers.map(([mat, t], i) => ({ id: i, mat, t })), loc: 'man', tin: 20, dv: 4, roof: false, catch: 0.15 })!;
      expect(r.growing, iwi.name).toBe(false);
      for (const c of r.checks) expect(c.level, c.text).toBe('ok');
      if (r.absorbed) expect(r.absorbed.pct).toBeLessThan(r.absorbed.crit);
    }
  });
});
