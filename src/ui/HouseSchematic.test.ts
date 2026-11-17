import { describe, expect, it } from 'vitest';
import { defaultHouse } from '../engine/house-default';
import { fiftiesSemi } from '../engine/house-demos';
import { applyPlan, isCylRun } from '../engine/house-controls';
import { autoPipes } from '../engine/house-pipes';
import { layoutPipes, moveValve, posChoices, valvesOn } from './HouseSchematic';

describe('heating schematic layout', () => {
  it('gives every emitter its own row and hangs each run off its parent', () => {
    const h = defaultHouse();
    h.heating.pipes = autoPipes(h);
    const { nodes, rows } = layoutPipes(h), at = new Map(nodes.map((n) => [n.p.id, n]));
    expect(nodes.length).toBe(h.heating.pipes.length);
    const ems = nodes.filter((n) => n.p.emitter);
    expect(new Set(ems.map((n) => n.y)).size).toBe(ems.length);
    expect(rows).toBeGreaterThanOrEqual(ems.length);
    for (const n of nodes) if (n.p.parent) { const up = at.get(n.p.parent)!; expect([n.px, n.py]).toEqual([up.depth, up.y]); }
  });

  it('lays out the headers a plan puts in like any other run', () => {
    const h = structuredClone(fiftiesSemi().scenarios[0].house);
    h.heating.pipes = autoPipes(h);
    applyPlan(h, 's');
    expect(layoutPipes(h).nodes.length).toBe(h.heating.pipes!.length);
  });
});

describe('editing valves on the diagram', () => {
  const semi = () => { const h = structuredClone(fiftiesSemi().scenarios[0].house); applyPlan(h, 'y'); return h; };

  it('lists the valves on a run with the port they gate', () => {
    const h = semi(), v = h.heating.controls!.valves[0], cyl = h.heating.pipes!.find(isCylRun)!.id;
    expect(valvesOn(h, cyl)).toEqual([{ v, port: 'A' }]);
    expect(valvesOn(h, v.b![0])).toEqual([{ v, port: 'B' }]);
    expect(valvesOn(h, 'nope')).toEqual([]);
  });

  it('moving a port takes it off one run and puts it on another, never on both ports, and makes the plan custom', () => {
    const h = semi(), v = h.heating.controls!.valves[0], a = v.runs[0], b0 = v.b![0];
    moveValve(h, v.id, 'A', a, b0);
    const after = h.heating.controls!.valves[0];
    expect(after.runs).toEqual([b0]);
    expect(after.b).not.toContain(b0);
    expect(h.heating.controls!.plan).toBe('custom');
    // Adding from nowhere, and taking off to nowhere.
    moveValve(h, v.id, 'B', null, a);
    expect(h.heating.controls!.valves[0].b).toContain(a);
    moveValve(h, v.id, 'B', a, null);
    expect(h.heating.controls!.valves[0].b).not.toContain(a);
    moveValve(h, 'V99', 'A', null, a);
  });

  it('offers only the positions a valve has', () => {
    expect(posChoices({ id: 'V', name: '', kind: 'two', runs: [] })).toEqual(['open', 'shut']);
    expect(posChoices({ id: 'V', name: '', kind: 'three', runs: [], mid: true })).toEqual(['A', 'B', 'AB']);
    expect(posChoices({ id: 'V', name: '', kind: 'three', runs: [] })).toEqual(['A', 'B']);
  });
});
