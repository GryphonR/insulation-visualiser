import { describe, expect, it } from 'vitest';
import { groundFloorU, layersR, suspendedFloorU } from './house';
import type { Buildup } from './house';
import { DEFAULT_SCENARIO, runScenario } from './scenario';
import type { Scenario } from './scenario';

const slab: Scenario = { ...DEFAULT_SCENARIO, orient: 'floor', month: 0, layers: [{ id: 1, mat: 'm_concrete_reinforced', t: 100 }, { id: 2, mat: 'pir', t: 75 }, { id: 3, mat: 'm_cement_sand', t: 65 }] };
const asBuildup = (sc: Scenario) => ({ id: '', name: '', kind: 'floor', layers: sc.layers.map((l) => [l.mat, l.t]) }) as unknown as Buildup;

describe('ground floors in the single build-up simulator', () => {
  it('a slab: the ISO 13370 U-value, no sun, and heat flowing down to the ground in winter', () => {
    const { sim, params } = runScenario(slab);
    expect(sim.U).toBeCloseTo(groundFloorU(asBuildup(slab), 5), 3);
    expect(Math.max(...sim.fr.I)).toBe(0);
    expect(params.other!.T).toBeGreaterThan(params.tmean); // the ground is warmer than January air
    expect(Math.max(...sim.fr.q)).toBeLessThan(0); // room loses heat downwards all day
  });

  it("takes the house's own floor U when given, and a suspended floor sees a colder void", () => {
    expect(runScenario({ ...slab, floorU: 0.15 }).sim.U).toBeCloseTo(0.15, 3);
    const sus = { ...slab, under: 'void' as const, layers: [{ id: 1, mat: 'pir', t: 100 }, { id: 2, mat: 'm_timber_500_kg_m', t: 22 }] };
    const r = runScenario(sus);
    expect(r.sim.U).toBeCloseTo(suspendedFloorU(asBuildup(sus), 5, 1500, 0.3), 3);
    expect(r.params.other!.T).toBeLessThan(runScenario(slab).params.other!.T);
  });

  it('walls and roofs are unchanged', () => {
    expect(runScenario({ ...slab, orient: 'S' }).params.other).toBeUndefined();
  });

  it('a ceiling under a room above, and a floor over a room below: both surface films, heat follows the temperature difference', () => {
    const joist = [{ id: 1, mat: 'm_timber_500_kg_m', t: 20 }, { id: 2, mat: 'cavity', t: 150 }, { id: 3, mat: 'pb', t: 12.5 }];
    const R = layersR(asBuildup({ ...slab, layers: joist }));
    const ceiling = runScenario({ ...slab, orient: 'ceiling', layers: joist, tin: 21, otherT: 15 });
    expect(ceiling.sim.U).toBeCloseTo(1 / (0.1 + R + 0.1), 3);
    expect(ceiling.params.other).toMatchObject({ T: 15, what: 'above' });
    expect(Math.max(...ceiling.sim.fr.q)).toBeLessThan(0); // the warmer room below loses heat up
    expect(Math.abs(runScenario({ ...slab, orient: 'ceiling', layers: joist, tin: 18 }).sim.fr.q[0])).toBeLessThan(0.01); // same temperature both sides
    const floor = runScenario({ ...slab, orient: 'floor', under: 'room', layers: joist, otherT: 10 });
    expect(floor.sim.U).toBeCloseTo(1 / (0.17 + R + 0.17), 3);
    expect(floor.params.other).toMatchObject({ T: 10, what: 'below' });
  });
});
