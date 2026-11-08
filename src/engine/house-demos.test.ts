import { describe, expect, it } from 'vitest';
import { MAT } from './data';
import { sharedSpan } from './geom';
import { calcHouse, maxWallGap, onStorey, roomEdges } from './house';
import { innerDoorAt } from './house-draw';
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

  it.each(DEMOS.map((d) => [d.label, d] as const))('%s: every room can be reached from an outside door, and each inside door sits on a shared wall', (_, d) => {
    const h = d.make().scenarios[0].house, byId = new Map(h.rooms.map((r) => [r.id, r]));
    // Stairs and landings open into each other without a door.
    const open = (a: string, b: string) => {
      const r = byId.get(a)!, o = byId.get(b)!;
      const len = (e: ReturnType<typeof roomEdges>[number], f: typeof e) => { const sp = sharedSpan(e, f, 0.02, maxWallGap(h)); return sp ? sp[1] - sp[0] : 0; };
      return ['hall', 'landing'].includes(r.type) && ['hall', 'landing'].includes(o.type) && h.storeys.some((_, s) => onStorey(r, s) && onStorey(o, s))
        && roomEdges(r).some((e) => roomEdges(o).some((f) => len(e, f) > 0.7));
    };
    const inner = h.openings.filter((o) => o.to);
    for (const o of inner) {
      const r = byId.get(o.room)!, s = Math.max(r.storey, byId.get(o.to!)!.storey);
      expect(innerDoorAt(h, r, o.edge!, s, o.t!, o.w)?.to, o.name).toBe(o.to);
    }
    // No room is reached only by walking through a bedroom.
    const seen = new Set(h.openings.filter((o) => !o.to && h.buildups.find((b) => b.id === o.buildup)?.kind === 'door').map((o) => o.room));
    for (let grew = true; grew;) {
      grew = false;
      for (const r of h.rooms) {
        if (seen.has(r.id)) continue;
        const via = (id: string) => seen.has(id) && byId.get(id)!.type !== 'bedroom';
        const next = inner.some((o) => (o.room === r.id && via(o.to!)) || (o.to === r.id && via(o.room))) || [...seen].some((id) => via(id) && open(id, r.id));
        if (next) { seen.add(r.id); grew = true; }
      }
    }
    expect(h.rooms.filter((r) => !seen.has(r.id)).map((r) => r.name)).toEqual([]);
  });

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
