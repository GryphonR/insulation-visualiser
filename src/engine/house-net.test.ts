import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import type { House } from './house';
import { applyPlan } from './house-controls';
import { defaultHouse } from './house-default';
import { DEMOS } from './house-demos';
import { syncNet, treeOf } from './house-net';
import { autoPipes, drawRun, removeRun, sizePipes } from './house-pipes';

// What the rest of the app reads from a run: its parent, its ends, which heater it feeds and its route.
const shape = (h: House) => (h.heating.pipes ?? []).map((p) => ({ id: p.id, parent: p.parent, ends: p.ends, emitter: p.emitter, pts: p.leg?.pts, rise: p.rise }));
const pipe = (h: House, id: string) => h.heating.pipes!.find((p) => p.id === id)!;

const laidOut = () => {
  const h = defaultHouse();
  h.heating.source = { at: [0.5, 0.5], storey: 0 };
  h.heating.risers = [{ id: 'rs1', at: [2, 0.5] }];
  h.heating.pipes = autoPipes(h);
  return h;
};

describe('the pipe net', () => {
  const houses: Array<[string, () => House]> = [
    ['typical runs, lengths only', () => { const h = defaultHouse(); h.heating.pipes = autoPipes(h); return h; }],
    ['laid out from the plan', laidOut],
    ...DEMOS.map((d): [string, () => House] => [d.label, () => d.make().scenarios.slice(-1)[0].house]),
  ];

  it.each(houses)('reads every existing layout back unchanged, and a second pass changes nothing: %s', (_, make) => {
    const h = make();
    const n = syncNet(h);
    expect(shape(n)).toEqual(shape(h));
    expect(n.heating.pipes!.some((p) => p.loose || p.loop)).toBe(false);
    expect(syncNet(n)).toBe(n);
    expect(sizePipes(n, calcHouse(n)).rows.map((r) => Math.round(r.loadW))).toEqual(sizePipes(h, calcHouse(h)).rows.map((r) => Math.round(r.loadW)));
  });

  it('keeps a control plan’s split circuits and headers apart', () => {
    for (const plan of ['s', 'splus', 'hp'] as const) {
      const h = laidOut();
      applyPlan(h, plan);
      expect(shape(syncNet(h))).toEqual(shape(h));
    }
  });

  it('turns a run that was laid towards the source round, so it comes off the run that reaches it', () => {
    const h = syncNet(laidOut()), r = h.heating.pipes!.find((p) => p.emitter && p.leg && p.parent)!;
    // The same net with that run's ends the other way round, as if drawn from the radiator back to the junction.
    const pipes = h.heating.pipes!.map((p) => (p.id === r.id ? { ...p, a: p.b, b: p.a, leg: { storey: p.leg!.storey, pts: [...p.leg!.pts].reverse() } } : p));
    const t = treeOf(pipes, h.heating.nodes!, 0);
    expect(t.find((p) => p.id === r.id)).toMatchObject({ parent: r.parent, a: r.a, b: r.b, leg: r.leg, emitter: r.emitter });
  });

  it('leaves the runs off a deleted run loose at their junction, not fed from further back', () => {
    const h = syncNet(laidOut()), mid = h.heating.pipes!.find((p) => p.leg && h.heating.pipes!.some((c) => c.parent === p.id))!;
    const kids = h.heating.pipes!.filter((c) => c.parent === mid.id).map((c) => c.id);
    const x = structuredClone(h);
    removeRun(x, mid.id);
    const n = syncNet(x);
    for (const id of kids) { expect(pipe(n, id).loose).toBe(true); expect(pipe(n, id).parent).toBeNull(); }
    expect(n.heating.pipes!.filter((p) => !kids.includes(p.id)).some((p) => p.loose)).toBe(false);
  });

  it('walks a loose group from its upstream end, whichever order its runs are listed in', () => {
    // A trunk, a run on from its end, two radiators off that run's end; then the trunk is taken out.
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const [e1, e2] = h.heating.emitters.filter((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 0);
    const t = drawRun(h, 0, { id: 'source' }, [[3, 0.5]], null) as { id: string };
    const q = drawRun(h, 0, { run: t.id, at: [3, 0.5] }, [[3, 3]], null) as { id: string };
    const k1 = drawRun(h, 0, { run: q.id, at: [3, 3] }, [], { id: `e:${e1.id}` }) as { id: string };
    const k2 = drawRun(h, 0, { run: q.id, at: [3, 3] }, [], { id: `e:${e2.id}` }) as { id: string };
    const n0 = syncNet(h), x = structuredClone(n0);
    removeRun(x, t.id);
    // The radiators' runs listed first, so a walk in list order would start at the far end of q.
    x.heating.pipes!.sort((a, b) => +(b.id === k1.id || b.id === k2.id) - +(a.id === k1.id || a.id === k2.id));
    const n = syncNet(x);
    expect(pipe(n, q.id).loose).toBe(true);
    expect(pipe(n, q.id).leg).toEqual(pipe(n0, q.id).leg);
    expect(pipe(n, k1.id).parent).toBe(q.id);
    expect(pipe(n, k2.id).parent).toBe(q.id);
  });

  it('marks the run that closes a loop; it carries no flow', () => {
    const h = syncNet(laidOut()), [r1, r2] = h.heating.pipes!.filter((p) => p.emitter && p.leg && p.leg.storey === 0);
    // A run joining two radiators' far ends makes a loop through both.
    const pipes = [...h.heating.pipes!, { id: 'PX', name: 'Loop', parent: null, size: 'Cu 15 mm', length: 2, a: r1.b, b: r2.b, leg: { storey: 0, pts: [[0, 0], [1, 0]] as Array<[number, number]> }, ends: ['', ''] as [string, string] }];
    const t = treeOf(pipes, h.heating.nodes!, 0);
    expect(t.filter((p) => p.loop).map((p) => p.id)).toEqual(['PX']);
    expect(t.some((p) => p.loose)).toBe(false);
    const n = { ...h, heating: { ...h.heating, pipes: t } };
    expect(sizePipes(n, calcHouse(n)).rows.find((r) => r.pipe.id === 'PX')!.loadW).toBe(0);
  });

  it('only joins runs that share a node: two runs crossing on the plan stay apart', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const [e1, e2] = h.heating.emitters.filter((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 0);
    const a = drawRun(h, 0, { id: 'source' }, [[3, 0.5], [3, 3]], { id: `e:${e1.id}` }) as { id: string };
    const b = drawRun(h, 0, { id: 'source' }, [[0.5, 2], [5, 2]], { id: `e:${e2.id}` }) as { id: string }; // crosses a at (3, 2)
    const n = syncNet(h);
    expect(pipe(n, a.id).parent).toBe(pipe(h, a.id).parent);
    expect(pipe(n, b.id).parent).toBe(pipe(h, b.id).parent);
    expect(pipe(n, a.id).b).not.toBe(pipe(n, b.id).a);
  });

  it('runs up a riser and on from it share the riser node on that floor', () => {
    const h = syncNet(laidOut()), br = h.heating.pipes!.find((p) => p.rise && p.ends?.[1] === 'rs1')!;
    const up = h.heating.pipes!.filter((p) => p.parent === br.id);
    expect(up.length).toBeGreaterThan(0);
    for (const p of up) { expect(p.a).toBe(br.b); expect(p.ends![0]).toBe('rs1'); }
    expect(h.heating.nodes!.find((n) => n.id === br.b)).toMatchObject({ on: 'rs1', storey: 1 });
  });
});
