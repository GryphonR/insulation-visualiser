import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import type { House } from './house';
import { defaultHouse } from './house-default';
import { DEMOS, fiftiesSemi } from './house-demos';
import { COOLING_DEFAULT, canCool, coolEer, coolingOn, dewPoint, emitterCool, emitterOut } from './house-heating';
import { PLANS, applyPlan, controlChecks, isCylRun, modeSummary, modesOf, openRuns, passes, posOf, pureRoots, reach, runUse, served } from './house-controls';
import type { Mode, PlanKind, Valve } from './house-controls';
import { autoPipes, combineRuns, sizePipes } from './house-pipes';
import { simulate, verdict, yearRes } from './house-sim';

/** The 1950s semi: a heat pump, three radiator zones and a piped cylinder. */
// The 1950s semi as plain least-pipe pipework (shared trunks, not a circuit per zone), with its demo control plan and coil load
// taken off, so each test starts from no valves.
const semi = (): House => {
  const h = structuredClone(fiftiesSemi().scenarios[0].house);
  applyPlan(h, null);
  delete h.heating.coilW;
  h.heating.pipes = autoPipes(h);
  combineRuns(h);
  return h;
};
const mode = (h: House, id: string) => h.heating.controls!.modes.find((m) => m.id === id)!;
const cylRun = (h: House) => h.heating.pipes!.find(isCylRun)!;
/** Make two of the semi's radiators fan coils and turn cooling on. */
const cooled = (h: House) => {
  const es = h.heating.emitters.filter((e) => e.kind === 'radiator').slice(0, 2);
  for (const e of es) { e.kind = 'fancoil'; e.rated = 2500; }
  // As if read off a datasheet.
  h.heating.cooling = { ...COOLING_DEFAULT, capacity: 5, eer: 3.5 };
  return es.map((e) => e.id);
};

describe('cooling physics', () => {
  it('dew point: 25 °C at 60% is about 16.7 °C, and drier air has a lower one', () => {
    expect(dewPoint(25, 0.6)).toBeCloseTo(16.7, 1);
    expect(dewPoint(25, 0.4)).toBeLessThan(dewPoint(25, 0.6));
    expect(dewPoint(20, 1)).toBeCloseTo(20, 5);
  });

  it('a fan coil heats and cools linearly; a radiator never cools; UFH cools, held above the dew point', () => {
    const h = defaultHouse();
    h.heating.cooling = { ...COOLING_DEFAULT, flow: 7, dT: 5 };
    const fc = { ...h.heating.emitters[0], kind: 'fancoil' as const, rated: 2000 };
    // 2000 W at ΔT50 → 40 W/K; mean water 9.5 °C, room 25 °C → 620 W.
    expect(emitterCool(fc, 7, 25, h)).toBeCloseTo(40 * 15.5, 6);
    expect(emitterOut(fc, 45, 20, { heating: { ...h.heating, dT: 5 } })).toBeCloseTo(2000 * (42.5 - 20) / 50, 6);
    expect(emitterCool({ ...fc, kind: 'radiator' }, 7, 25, h)).toBe(0);
    const ufh = { ...fc, kind: 'ufh' as const, area: 10, spacing: 150, cover: 'Tiles' };
    const q = emitterCool(ufh, 7, 25, h) / 10;
    // Surface held at max(19, dew point + 1) = 19 °C: 7 W/m²K × 6 K.
    expect(q).toBeCloseTo(42, 6);
    expect(emitterCool(ufh, 22, 25, h)).toBeLessThan(emitterCool(ufh, 18, 25, h));
    expect(canCool(fc) && canCool(ufh) && !canCool({ kind: 'towel' })).toBe(true);
  });

  it('cooling is only on for a heat pump with it switched on; EER improves as it gets cooler outside', () => {
    const h = defaultHouse();
    expect(coolingOn(h)).toBe(false);
    h.heating.cooling = { ...COOLING_DEFAULT };
    expect(coolingOn(h)).toBe(true);
    h.hp.source = 'condensing';
    expect(coolingOn(h)).toBe(false);
    expect(coolEer(COOLING_DEFAULT, 35)).toBeNaN();
    const c = { ...COOLING_DEFAULT, eer: 3.5 };
    expect(coolEer(c, 35)).toBe(c.eer);
    expect(coolEer(c, 25)).toBeGreaterThan(c.eer);
    expect(coolEer(c, 80)).toBe(c.eer * 0.5);
    expect(coolEer(c, -40)).toBe(c.eer * 1.6);
  });
});

describe('valves and modes', () => {
  it('a 2-port passes only when open; a 3-port feeds its ports by position; other runs are unaffected', () => {
    const two: Valve = { id: 'V1', name: '', kind: 'two', runs: ['P2'] }, three: Valve = { id: 'V2', name: '', kind: 'three', runs: ['P3'], b: ['P4'] };
    expect([passes(two, 'open', 'P2'), passes(two, 'shut', 'P2'), passes(two, 'shut', 'P9')]).toEqual([true, false, true]);
    expect([passes(three, 'A', 'P3'), passes(three, 'A', 'P4'), passes(three, 'B', 'P4'), passes(three, 'AB', 'P3'), passes(three, 'AB', 'P4'), passes(three, 'B', 'P9')]).toEqual([true, false, true, true, true, true]);
    const m: Mode = { id: 'm', name: '', water: 'hot', valves: {} };
    expect([posOf(two, m), posOf(three, m), posOf({ ...three, mid: true }, m)]).toEqual(['open', 'B', 'AB']);
  });

  it('with no plan everything is open: one heating mode, plus cooling when it is on', () => {
    const h = semi();
    expect(modesOf(h).map((m) => m.water)).toEqual(['hot']);
    expect(openRuns(h, modesOf(h)[0]).size).toBe(h.heating.pipes!.length);
    h.heating.cooling = { ...COOLING_DEFAULT };
    expect(modesOf(h).map((m) => m.water)).toEqual(['hot', 'chilled']);
    // With no valves the chilled water reaches the semi's radiators and cylinder.
    expect(controlChecks(h).some((c) => c.level === 'error' && c.text.includes('condensation'))).toBe(true);
    delete h.heating.cooling;
    expect(controlChecks(h)).toEqual([]);
  });

  it('a shut valve shuts everything beyond it', () => {
    const h = semi(), root = h.heating.pipes!.find((p) => !p.parent)!;
    h.heating.controls = { plan: 'custom', valves: [{ id: 'V1', name: 'Main', kind: 'two', runs: [root.id] }], modes: [{ id: 'x', name: 'X', water: 'hot', valves: { V1: 'shut' } }] };
    expect(openRuns(h, h.heating.controls.modes[0]).size).toBe(0);
    expect(controlChecks(h).some((c) => c.text.includes('every circuit is shut'))).toBe(true);
    expect(modeSummary(h, h.heating.controls.modes[0])).toBe('Every circuit shut');
    expect(openRuns(h, { id: 'o', name: 'Off', water: 'off', valves: {} }).size).toBe(0);
  });

  it('pure roots: the biggest runs leading only to radiators, or only to the cylinder', () => {
    const h = semi();
    const dhw = pureRoots(h, (t) => 'cyl' in t), ch = pureRoots(h, (t) => 'e' in t);
    expect(dhw).toEqual([cylRun(h).id]);
    // Between them, every emitter and the cylinder are under exactly one root.
    const pipes = h.heating.pipes!, under = (root: string, id: string): boolean => { const p = pipes.find((x) => x.id === id)!; return p.id === root || (!!p.parent && under(root, p.parent)); };
    for (const p of pipes.filter((x) => x.emitter || isCylRun(x))) expect([...dhw, ...ch].filter((r) => under(r, p.id)).length, p.id).toBe(1);
  });
});

describe('control plans', () => {
  it.each(Object.keys(PLANS) as PlanKind[])('%s: every emitter is heated by some mode, and the cylinder is reheated unless it is a combi', (plan) => {
    const h = semi();
    if (plan === 'combi') h.heating.pipes = h.heating.pipes!.filter((p) => !isCylRun(p));
    const err = applyPlan(h, plan);
    expect(err).toBeNull();
    const c = h.heating.controls!;
    expect(c.plan).toBe(plan);
    expect(c.modes[0].water).toBe('off');
    const { heated } = served(h);
    for (const e of h.heating.emitters) expect(heated.has(e.id), e.id).toBe(true);
    const reheat = c.modes.some((m) => m.water === 'hot' && reach(h, m).cylinder);
    expect(reheat).toBe(plan !== 'combi');
    // Every valve sits on runs that exist.
    const ids = new Set(h.heating.pipes!.map((p) => p.id));
    for (const v of c.valves) for (const r of [...v.runs, ...(v.b ?? [])]) expect(ids.has(r)).toBe(true);
    // The only errors a plan may leave are none; warnings only about a heat pump serving both at once.
    expect(controlChecks(h).filter((x) => x.level === 'error')).toEqual([]);
  });

  it('Y plan: heating, hot water, or both through one mid-position valve', () => {
    const h = semi();
    applyPlan(h, 'y');
    const [v] = h.heating.controls!.valves;
    expect(v).toMatchObject({ kind: 'three', mid: true });
    expect(reach(h, mode(h, 'heat'))).toMatchObject({ cylinder: false });
    expect(reach(h, mode(h, 'heat')).emitters.size).toBe(h.heating.emitters.length);
    expect(reach(h, mode(h, 'dhw'))).toMatchObject({ cylinder: true });
    expect(reach(h, mode(h, 'dhw')).emitters.size).toBe(0);
    expect(reach(h, mode(h, 'both')).cylinder && reach(h, mode(h, 'both')).emitters.size === h.heating.emitters.length).toBe(true);
    expect(modeSummary(h, mode(h, 'both'))).toMatch(/^Heats \d+ emitters, reheats the cylinder$/);
  });

  it('S plan puts in a header so one valve shuts all the heating runs; changing plan takes it out again', () => {
    // The plain layout: the cylinder and the heating runs all leave the first tee.
    const h = semi();
    h.heating.pipes = autoPipes(h);
    const before = h.heating.pipes.length;
    applyPlan(h, 's');
    const hd = h.heating.pipes!.filter((p) => p.header);
    expect(hd.length).toBeGreaterThan(0);
    const chV = h.heating.controls!.valves.find((v) => v.name === 'Heating zone valve')!;
    expect(chV.runs).toHaveLength(1);
    applyPlan(h, null);
    expect(h.heating.controls).toBeUndefined();
    expect(h.heating.pipes!.length).toBe(before);
    expect(h.heating.pipes!.some((p) => p.header)).toBe(false);
  });

  it('zone headers nested under the heating header all come out, and no run is left without its parent', () => {
    const h = semi(), ems = h.heating.emitters.slice(0, 4), z = h.heating.zones;
    ems.forEach((e, i) => (e.zone = z[i < 2 ? 0 : 1].id));
    h.heating.emitters = ems;
    h.heating.pipes = [{ id: 'P1', name: 'Main', parent: null, size: 'Cu 22 mm', length: 5 }, { id: 'P2', name: 'Coil', parent: 'P1', size: 'Cu 22 mm', length: 3, ends: ['a', 'cylinder'] },
      ...ems.map((e, i) => ({ id: `P${3 + i}`, name: e.id, parent: 'P1', size: 'Cu 15 mm', length: 4, emitter: e.id }))];
    applyPlan(h, 'hp');
    const hs = h.heating.pipes!.filter((p) => p.header);
    expect(hs.some((p) => hs.some((q) => q.id === p.parent))).toBe(true); // nested
    applyPlan(h, null);
    const ids = new Set(h.heating.pipes!.map((p) => p.id));
    expect(h.heating.pipes!.some((p) => p.header)).toBe(false);
    expect(h.heating.pipes!.filter((p) => p.parent && !ids.has(p.parent))).toEqual([]);
    expect(h.heating.pipes!.filter((p) => p.parent === 'P1')).toHaveLength(5);
  });

  it('S plan plus: one zone valve per zone, and each zone mode heats only that zone', () => {
    const h = semi();
    applyPlan(h, 'splus');
    const zones = new Set(h.heating.emitters.map((e) => e.zone));
    const zmodes = h.heating.controls!.modes.filter((m) => m.id.startsWith('heat-'));
    expect(zmodes.length).toBe(zones.size);
    for (const m of zmodes) {
      const got = new Set([...reach(h, m).emitters].map((id) => h.heating.emitters.find((e) => e.id === id)!.zone));
      expect(got.size).toBe(1);
    }
  });

  it('a diverter has no mid position; asking it for both ports is flagged', () => {
    const h = semi();
    applyPlan(h, 'w');
    expect(h.heating.controls!.modes.some((m) => m.id === 'both')).toBe(false);
    mode(h, 'heat').valves.V1 = 'AB';
    expect(controlChecks(h).some((c) => c.text.includes('no mid position'))).toBe(true);
  });

  it('heat pump plan with fan coils: cooling shuts the radiators off and reaches only the fan coils', () => {
    const h = semi(), fcs = cooled(h);
    applyPlan(h, 'hp');
    const cool = mode(h, 'cool'), r = reach(h, cool);
    expect([...r.emitters].sort()).toEqual([...fcs].sort());
    expect(r.cylinder).toBe(false);
    expect(served(h).cooled).toEqual(new Set(fcs));
    expect(controlChecks(h).filter((c) => c.level === 'error')).toEqual([]);
    // Open the isolation valve in cooling and the radiators sweat.
    const iso = h.heating.controls!.valves.find((v) => v.name.startsWith('Radiator isolation'))!;
    cool.valves[iso.id] = 'open';
    expect(controlChecks(h).some((c) => c.level === 'error' && c.text.includes('condensation'))).toBe(true);
  });

  it('chilled water to the cylinder, or from a boiler, is an error; cooling switched off is a warning', () => {
    const h = semi();
    cooled(h);
    applyPlan(h, 'hp');
    const cool = mode(h, 'cool');
    cool.valves.V1 = 'A';
    expect(controlChecks(h).some((c) => c.text.includes('cool the hot water'))).toBe(true);
    cool.valves.V1 = 'B';
    h.heating.cooling!.on = false;
    expect(controlChecks(h).some((c) => c.level === 'warn' && c.text.includes('cooling is off'))).toBe(true);
    h.hp.source = 'condensing';
    expect(controlChecks(h).some((c) => c.text.includes('boiler cannot cool'))).toBe(true);
  });

  it('plans that switch a cylinder need one; with no pipework there is nothing to put valves on', () => {
    const h = semi();
    h.heating.pipes = h.heating.pipes!.filter((p) => !isCylRun(p));
    expect(applyPlan(h, 'y')).toMatch(/cylinder/);
    expect(applyPlan(h, 'splus')).toBeNull();
    h.heating.pipes = [];
    expect(applyPlan(h, 'hp')).toMatch(/pipework/);
  });

  it('flags valves left on runs that are gone, and emitters no mode heats', () => {
    const h = semi();
    applyPlan(h, 's');
    h.heating.controls!.valves.push({ id: 'V9', name: 'Stray', kind: 'two', runs: ['P999'] });
    const chV = h.heating.controls!.valves.find((v) => v.name === 'Heating zone valve')!;
    for (const m of h.heating.controls!.modes) m.valves[chV.id] = 'shut';
    const t = controlChecks(h).map((c) => c.text).join('\n');
    expect(t).toMatch(/V9 Stray sits on runs that are gone/);
    expect(t).toMatch(/No mode heats/);
  });

  it('where the heating leaves the trunk at more than one tee, its valve sits on each of those runs', () => {
    const h = semi();
    applyPlan(h, 's');
    const chV = h.heating.controls!.valves.find((v) => v.name === 'Heating zone valve')!;
    expect(chV.runs.length).toBeGreaterThan(1);
    expect(reach(h, mode(h, 'dhw')).emitters.size).toBe(0);
  });

  it('a combi heats its hot water itself, so its hot water mode needs no open run; it refuses a cylinder', () => {
    const h = semi();
    expect(applyPlan(h, 'combi')).toMatch(/combi has no cylinder/);
    h.heating.pipes = h.heating.pipes!.filter((p) => !isCylRun(p));
    applyPlan(h, 'combi');
    const dhw = mode(h, 'dhw');
    expect(dhw.internal).toBe(true);
    expect(reach(h, dhw).emitters.size).toBe(0);
    expect(modeSummary(h, dhw)).toMatch(/plate heat exchanger/);
    expect(controlChecks(h)).toEqual([]);
  });

  it.each(DEMOS.map((d) => [d.label, d] as const))('%s: each plan applies, or says why not', (_, d) => {
    for (const s of d.make().scenarios) for (const plan of Object.keys(PLANS) as PlanKind[]) {
      const h = structuredClone(s.house), err = applyPlan(h, plan);
      if (err) { expect(err).toMatch(/cylinder|pipework/); continue; }
      expect(controlChecks(h).filter((c) => c.level === 'error')).toEqual([]);
      expect(() => sizePipes(h, calcHouse(h))).not.toThrow();
    }
  });
});

describe('sizing by mode', () => {
  it('with no plan and no coil load, sizing is as before: one mode', () => {
    const h = semi(), p = sizePipes(h, calcHouse(h));
    expect(p.modes.map((m) => m.name)).toEqual(['Heating']);
    expect(p.rows.every((r) => r.mode === 'Heating')).toBe(true);
  });

  it('hot water priority sizes the primary for the larger of heating and reheat, not both', () => {
    const h = semi(), res = calcHouse(h);
    h.heating.coilW = 4000;
    const open = sizePipes(h, res), root = (p: ReturnType<typeof sizePipes>) => p.rows.find((r) => !r.pipe.parent)!;
    // No valves: heating and the coil at once.
    expect(root(open).loadW).toBeCloseTo(res.peakW + 4000, 0);
    applyPlan(h, 'w');
    const pri = sizePipes(h, res);
    expect(root(pri).loadW).toBeCloseTo(Math.max(res.peakW, 4000), 0);
    expect(root(pri).mode).toBe(res.peakW > 4000 ? 'Heating' : 'Hot water');
    // The cylinder run is sized in the hot water mode.
    expect(pri.rows.find((r) => isCylRun(r.pipe))!.mode).toBe('Hot water');
    expect(pri.modes.map((m) => m.name)).toEqual(['Heating', 'Hot water']);
    // The index circuit is the worst of any mode.
    expect(pri.indexDp).toBe(Math.max(...pri.modes.map((m) => m.indexDp)));
  });

  it('applying a plan leaves the coil output to be entered, and keeps one that was', () => {
    const h = semi();
    applyPlan(h, 'y');
    expect(h.heating.coilW).toBeUndefined();
    h.heating.coilW = 1234;
    applyPlan(h, 's');
    expect(h.heating.coilW).toBe(1234);
  });

  it('cooling flows: the fan coils at full cooling output, at the chilled-water rise', () => {
    const h = semi(), fcs = cooled(h), res = calcHouse(h);
    applyPlan(h, 'hp');
    const p = sizePipes(h, res), cool = p.modes.find((m) => m.name === 'Cooling')!;
    const c = h.heating.cooling!;
    for (const id of fcs) {
      const run = h.heating.pipes!.find((x) => x.emitter === id)!, e = h.heating.emitters.find((x) => x.id === id)!;
      expect(cool.flow.get(run.id)).toBeCloseTo((emitterCool(e, c.flow, c.setpoint, h) * 60) / (4186 * c.dT), 6);
    }
    // Radiator runs carry nothing in cooling.
    const rad = h.heating.pipes!.find((x) => x.emitter && !fcs.includes(x.emitter))!;
    expect(cool.flow.has(rad.id)).toBe(false);
    expect(cool.indexPath.length).toBeGreaterThan(0);
  });
});

describe('cooling in the simulation', () => {
  it('summer peak day: cooling keeps the fan coil rooms cooler, and counts the heat taken out and electricity bought', () => {
    const h = semi(), fcs = cooled(h);
    applyPlan(h, 'hp');
    const rooms = new Set(h.heating.emitters.filter((e) => fcs.includes(e.id)).map((e) => e.room));
    const off = structuredClone(h);
    off.heating.cooling!.on = false;
    const a = simulate(off, 'summer'), b = simulate(h, 'summer');
    expect(a.coolKWh).toBe(0);
    expect(b.coolKWh).toBeGreaterThan(0);
    expect(b.coolBoughtKWh).toBeGreaterThan(0);
    expect(b.coolBoughtKWh).toBeLessThan(b.coolKWh);
    expect(b.coolPeakW).toBeLessThanOrEqual(h.heating.cooling!.capacity! * 1000 + 1e-6);
    // Without the datasheet figures: no cap on the output, and no electricity made up for it.
    const blank = structuredClone(h); delete blank.heating.cooling!.capacity; delete blank.heating.cooling!.eer;
    const c = simulate(blank, 'summer');
    expect(c.coolKWh).toBeGreaterThanOrEqual(b.coolKWh - 1e-6);
    expect(c.coolBoughtKWh).toBeNaN();
    expect(b.heatKWh).toBe(0);
    for (const id of rooms) {
      const i = b.rooms.findIndex((r) => r.id === id);
      expect(b.comfort[i].max).toBeLessThan(a.comfort[i].max);
    }
    expect(verdict(h, b).text).toMatch(/With cooling peaking at/);
  });

  it('a cooled room is held near the cooling setpoint while the heat pump has spare capacity', () => {
    const h = semi(), fcs = cooled(h);
    for (const e of h.heating.emitters.filter((x) => fcs.includes(x.id))) e.rated = 20000;
    h.heating.cooling!.capacity = 50;
    h.heating.cooling!.setpoint = 23;
    const b = simulate(h, 'summer'), id = h.heating.emitters.find((e) => e.id === fcs[0])!.room, i = b.rooms.findIndex((r) => r.id === id);
    // In occupied hours (the room's heating schedule), at or below the setpoint plus a little for the step.
    expect(b.comfort[i].max).toBeLessThan(25);
  });

  it('the typical year counts cooling separately from heating, and the bills carry it', () => {
    const h = semi();
    cooled(h);
    h.heating.cooling!.setpoint = 22;
    const res = calcHouse(h), sim = simulate(h, 'year', res);
    expect(sim.coolKWh).toBeGreaterThan(0);
    expect(sim.monthCool.reduce((a, b) => a + b, 0)).toBeCloseTo(sim.coolKWh, 3);
    expect(sim.monthCoolBought.reduce((a, b) => a + b, 0)).toBeCloseTo(sim.coolBoughtKWh, 3);
    // Summer months cool far more than winter ones.
    expect(sim.monthCool[6]).toBeGreaterThan(sim.monthCool[0]);
    const y = yearRes(h, res, sim);
    expect(y.cool!.kwh).toBeCloseTo(sim.coolBoughtKWh, 6);
    expect(y.cool!.cost).toBeGreaterThan(0);
    expect(yearRes(h, res, null).cool).toBeUndefined();
  }, 60000);

  it('a boiler never cools, whatever is set', () => {
    const h = semi();
    cooled(h);
    h.hp.source = 'condensing';
    expect(simulate(h, 'summer').coolKWh).toBe(0);
  });

  it('a zone shut in every heating mode is not heated in the run', () => {
    const h = semi();
    applyPlan(h, 'splus');
    const zv = h.heating.controls!.valves.find((v) => v.name.startsWith('Zone valve'))!;
    for (const m of h.heating.controls!.modes) m.valves[zv.id] = 'shut';
    const r = simulate(h, 'design'), shut = h.heating.emitters.filter((e) => !served(h).heated.has(e.id)).map((e) => e.room);
    expect(shut.length).toBeGreaterThan(0);
    for (const id of shut) expect(Math.max(...r.P[r.rooms.findIndex((x) => x.id === id)])).toBe(0);
  });
});

describe('what each run carries', () => {
  it('Y plan: the cylinder run carries hot water only in the modes that reheat it; shut runs carry nothing', () => {
    const h = semi();
    applyPlan(h, 'y');
    const cyl = cylRun(h).id, rad = h.heating.pipes!.find((p) => p.emitter)!.id;
    const use = (id: string) => runUse(h, mode(h, id));
    expect([use('heat').get(cyl), use('heat').get(rad)]).toEqual(['idle', 'heat']);
    expect([use('dhw').get(cyl), use('dhw').get(rad)]).toEqual(['dhw', 'idle']);
    expect(use('both').get(cyl)).toBe('dhw');
    // The primary carries both, drawn as heating.
    expect(use('both').get(h.heating.pipes!.find((p) => !p.parent)!.id)).toBe('heat');
    expect([...use('off').values()].every((u) => u === 'idle')).toBe(true);
  });

  it('cooling: open runs carry chilled water', () => {
    const h = semi(), fcs = cooled(h);
    applyPlan(h, 'hp');
    const u = runUse(h, mode(h, 'cool'));
    expect(u.get(h.heating.pipes!.find((p) => p.emitter === fcs[0])!.id)).toBe('cool');
    expect(u.get(cylRun(h).id)).toBe('idle');
  });
});
