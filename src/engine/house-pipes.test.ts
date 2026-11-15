import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import { defaultHouse } from './house-default';
import { lpm } from './house-heating';
import { PIPE_SIZES, autoPipes, combineRuns, dragSegment, joinRun, maxFlow, paBudget, viaOf, voidName, voidOf, livePath, pipeFlow, resetRun, routePipes, runLength, setBranchRiser, sizePipes, splitSegment } from './house-pipes';

describe('pipe sizing', () => {
  it('velocity and pressure drop: a known case (15 mm copper, 3 l/min ≈ 0.34 m/s, ~130 Pa/m)', () => {
    const { v, paM } = pipeFlow(3, PIPE_SIZES['Cu 15 mm']);
    expect(v).toBeCloseTo(0.344, 2);
    expect(paM).toBeGreaterThan(100);
    expect(paM).toBeLessThan(170);
    expect(pipeFlow(0, 13.6)).toEqual({ v: 0, paM: 0 });
  });

  it('auto layout pipes every emitter; the primary carries the whole house load', () => {
    const h = defaultHouse();
    h.heating.pipes = autoPipes(h);
    const res = calcHouse(h), p = sizePipes(h, res);
    expect(p.unpiped).toEqual([]);
    const primary = p.rows.find((r) => r.pipe.id === 'P1')!;
    expect(primary.loadW).toBeCloseTo(res.peakW, 0);
    expect(primary.flowLpm).toBeCloseTo(lpm(res.peakW, h.heating.dT), 6);
    expect(p.indexPath[0]).toBe('P1');
    expect(p.rows.filter((r) => r.index).length).toBe(p.indexPath.length);
  });

  it('flags an undersized microbore run and a long index circuit', () => {
    const h = defaultHouse();
    h.heating.pipes = autoPipes(h).map((x) => (x.id === 'P1' ? { ...x, size: 'Cu 10 mm (microbore)' } : x));
    const p = sizePipes(h, calcHouse(h));
    expect(p.rows.find((r) => r.pipe.id === 'P1')!.ok).toBe(false);
    expect(p.headOk).toBe(false);
  });
});

describe('pipes laid from the plan', () => {
  it('measures each run from the placed source, up the riser to the floor above', () => {
    const h = defaultHouse();
    expect(routePipes(h)).toBeNull();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0] }];
    h.heating.cylinder = { at: [1, 1], storey: 1 };
    const route = routePipes(h)!;
    const up = route.feeds.get(1)!;
    expect(up.riser).toBe('rs1');
    // 2 m along the floor to the riser, then up one storey (room height plus the floor zone above).
    expect(up.run).toBeCloseTo(2 + h.storeys[0].h + h.storeys[1].zone, 6);
    // Every emitter and the cylinder get a tail, measured along x then y.
    expect(route.tails.length).toBe(h.heating.emitters.length + 1);
    const cyl = route.tails.find((t) => t.cylinder)!;
    expect(cyl.run).toBeCloseTo(1 + 1, 6);
    const pipes = autoPipes(h);
    expect(pipes.filter((p) => p.emitter).length).toBe(h.heating.emitters.length);
    expect(pipes.find((p) => p.name.includes('cylinder'))?.length).toBe(2);
    h.heating.pipes = pipes;
    expect(sizePipes(h, calcHouse(h)).unpiped).toEqual([]);
  });
});

describe('editing pipe routes', () => {
  const laid = () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0] }];
    h.heating.pipes = autoPipes(h);
    return h;
  };

  it('sliding a middle stretch moves its corners; an end stretch gains a bend and keeps its end', () => {
    const L: Array<[number, number]> = [[0, 0], [4, 0], [4, 3]];
    expect(dragSegment(L, 1, [1, 7])).toEqual([[0, 0], [5, 0], [5, 3], [4, 3]]);
    expect(dragSegment(L, 0, [0, 1])).toEqual([[0, 0], [0, 1], [4, 1], [4, 3]]);
    // Split then slide one half: a step in the pipe.
    const cut = splitSegment([[0, 0], [4, 0]], 0, [2, 0.3]);
    expect(dragSegment(cut, 0, [0, 1])).toEqual([[0, 0], [0, 1], [2, 1], [2, 0], [4, 0]]);
  });

  it('lengths follow the route, and its ends follow what they are attached to', () => {
    const h = laid();
    const run = h.heating.pipes!.find((p) => p.emitter)!, e = h.heating.emitters.find((x) => x.id === run.emitter)!;
    const before = runLength(h, run);
    // Away from the radiator: 1 m down and 1 m back up.
    run.leg!.pts = dragSegment(run.leg!.pts, 0, [0, -1]);
    expect(runLength(h, run)).toBeCloseTo(before + 2, 6);
    // Moving the radiator drags the run's end with it.
    e.at = [3, 2];
    const pts = livePath(h, run)!;
    expect(pts[pts.length - 1]).toEqual(e.at);
    // A typed length wins until it is cleared.
    run.typed = true; run.length = 42;
    expect(runLength(h, run)).toBe(42);
    resetRun(h, run.id);
    expect(run.typed).toBeUndefined();
  });

  it('a floor can be switched between a riser and straight up', () => {
    const h = laid();
    const br = h.heating.pipes!.find((p) => p.rise)!;
    expect(br.ends).toEqual(['source', 'rs1']);
    setBranchRiser(h, br.id, 'source');
    expect(br.leg).toBeUndefined();
    expect(Math.abs(runLength(h, br) - br.rise!)).toBeLessThan(0.06);
    for (const c of h.heating.pipes!.filter((p) => p.parent === br.id)) expect(c.ends![0]).toBe('source');
  });
});

describe('combining runs', () => {
  it('runs leaving together share one bigger pipe, teeing off to each heater', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0] }];
    h.heating.pipes = autoPipes(h);
    const res = calcHouse(h);
    const total = () => h.heating.pipes!.reduce((t, p) => t + runLength(h, p), 0);
    const before = total();
    expect(combineRuns(h, res)).toBeGreaterThan(0);
    expect(total()).toBeLessThan(before);
    const rows = sizePipes(h, res).rows;
    expect(sizePipes(h, res).unpiped).toEqual([]);
    for (const t of h.heating.pipes!.filter((p) => p.name.startsWith('Shared'))) {
      const kids = h.heating.pipes!.filter((p) => p.parent === t.id), lp = livePath(h, t)!, end = lp[lp.length - 1];
      expect(kids.length).toBeGreaterThanOrEqual(2);
      // Each run starts at the tee, and the shared pipe is within the limits and no smaller than what it feeds.
      for (const k of kids) expect(livePath(h, k)![0]).toEqual(end);
      expect(rows.find((r) => r.pipe.id === t.id)!.ok).toBe(true);
      for (const k of kids) expect(PIPE_SIZES[t.size]).toBeGreaterThanOrEqual(PIPE_SIZES[k.size]);
    }
    // Nothing left to combine the second time.
    expect(combineRuns(h, res)).toBe(0);
  });
});

describe('dragging one run onto another', () => {
  it('joins them into one shared pipe', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    const [e1, e2] = h.heating.emitters;
    e1.at = [4, 3]; e2.at = [5, 2];
    h.heating.pipes = [
      { id: 'P1', name: 'Boiler', parent: null, size: 'Cu 28 mm', length: 1 },
      { id: 'A', name: 'A', parent: 'P1', size: 'Cu 15 mm', length: 7, emitter: e1.id, ends: ['source', `e:${e1.id}`], leg: { storey: 0, pts: [[0, 0], [4, 0], [4, 3]] } },
      { id: 'B', name: 'B', parent: 'P1', size: 'Cu 15 mm', length: 7, emitter: e2.id, ends: ['source', `e:${e2.id}`], leg: { storey: 0, pts: [[0, 0], [0, 2], [5, 2]] } },
    ];
    h.heating.emitters = [e1, e2];
    expect(combineRuns(h)).toBe(0);
    // B's long stretch dragged up onto A's: as the canvas does on drop.
    const b = h.heating.pipes.find((p) => p.id === 'B')!;
    b.leg!.pts = dragSegment(b.leg!.pts, 1, [0, -2]);
    expect(combineRuns(h)).toBe(1);
    const shared = h.heating.pipes.find((p) => p.name.startsWith('Shared'))!;
    expect(shared.leg!.pts).toEqual([[0, 0], [4, 0]]);
    expect(h.heating.pipes.filter((p) => p.parent === shared.id).map((p) => p.id).sort()).toEqual(['A', 'B']);
  });
});

describe('dropping a run onto a run from another branch', () => {
  it('tees off it where they part, and tidies the shared run it left', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    const [e1, e2, e3] = h.heating.emitters;
    e1.at = [0.2, 5]; e2.at = [2, 4]; e3.at = [1, -2];
    h.heating.emitters = [e1, e2, e3];
    const run = (id: string, parent: string, ends: [string, string], pts: Array<[number, number]>, emitter?: string) =>
      ({ id, name: id, parent, size: 'Cu 10 mm (microbore)', length: 1, emitter, ends, leg: { storey: 0, pts } });
    h.heating.pipes = [
      { id: 'P1', name: 'Boiler', parent: null, size: 'Cu 28 mm', length: 1 },
      run('T1', 'P1', ['source', ''], [[0, 0], [1, 0]]),
      run('A', 'T1', ['tee:T1', `e:${e1.id}`], [[1, 0], [1, 5], [0.2, 5]], e1.id),
      run('K', 'T1', ['tee:T1', `e:${e3.id}`], [[1, 0], [1, -2]], e3.id),
      run('T2', 'P1', ['source', ''], [[0, 0], [2, 0]]),
      run('B', 'T2', ['tee:T2', `e:${e2.id}`], [[2, 0], [2, 4]], e2.id),
    ];
    const A = h.heating.pipes.find((p) => p.id === 'A')!;
    A.leg!.pts = dragSegment(A.leg!.pts, 0, [1, 0]);
    expect(joinRun(h, 'A')).toBe(true);
    const ps = h.heating.pipes, S = ps.find((p) => p.name.startsWith('Shared'))!;
    // T2 then fed only the new shared run, so the two became one pipe from the boiler to the tee.
    expect(S.parent).toBe('P1');
    expect(livePath(h, S)).toEqual([[0, 0], [2, 0], [2, 4]]);
    expect(ps.some((p) => p.id === 'T2')).toBe(false);
    expect(ps.filter((p) => p.parent === S.id).map((p) => p.id).sort()).toEqual(['A', 'B']);
    expect(livePath(h, A)).toEqual([[2, 4], [2, 5], [0.2, 5]]);
    expect(PIPE_SIZES[S.size]).toBeGreaterThanOrEqual(PIPE_SIZES['Cu 15 mm']);
    // T1 now feeds only K, so it is folded into K.
    expect(ps.some((p) => p.id === 'T1')).toBe(false);
    expect(ps.find((p) => p.id === 'K')!).toMatchObject({ parent: 'P1', ends: ['source', `e:${e3.id}`] });
    expect(sizePipes(h, calcHouse(h)).unpiped).toEqual([]);
  });
});

describe('floor or ceiling, and what a run carries', () => {
  it('a ceiling run to a radiator adds the drop down the wall; loads and limits add up', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.pipes = autoPipes(h);
    const run = h.heating.pipes.find((p) => p.emitter && h.heating.emitters.find((e) => e.id === p.emitter)?.kind === 'radiator')!;
    // From the floor void up to the valves (0.15 m + half the floor zone); from the ceiling void down the wall to them.
    const s = run.leg!.storey, st = h.storeys[s], route = runLength(h, { ...run, emitter: undefined });
    // Lengths are rounded to 0.1 m, each separately.
    expect(Math.abs(runLength(h, run) - (route + 0.15 + st.zone / 2))).toBeLessThan(0.11);
    run.via = 'ceiling';
    expect(Math.abs(runLength(h, run) - (route + st.h - 0.15 + (h.storeys[s + 1]?.zone ?? 0.2) / 2))).toBeLessThan(0.11);
    const r = sizePipes(h, calcHouse(h));
    const row = r.rows.find((x) => x.pipe.id === run.id)!;
    expect(row.loadW).toBeCloseTo(r.emitterW.get(run.emitter!)!, 6);
    // At its limit a 15 mm pipe is just inside the velocity and Pa/m limits.
    const cap = maxFlow(PIPE_SIZES['Cu 15 mm']), at = pipeFlow(cap, PIPE_SIZES['Cu 15 mm']);
    expect(at.v).toBeLessThanOrEqual(1.0 + 1e-6);
    expect(at.paM).toBeLessThanOrEqual(300 + 1e-6);
    expect(Math.max(at.v / 1.0, at.paM / 300)).toBeGreaterThan(0.999);
    expect(maxFlow(PIPE_SIZES['Cu 22 mm'])).toBeGreaterThan(cap);
  });
});

describe('pressure budget from the pump', () => {
  it('shares the pump head along the longest circuit, flow and return', () => {
    const h = defaultHouse();
    expect(paBudget(h).paMax).toBe(300); // no runs yet: the cap
    h.heating.paCap = 1e9; // uncapped, to check the pump's share
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.pipes = autoPipes(h);
    h.heating.pumpHead = 40;
    const { paMax, longest } = paBudget(h);
    expect(longest).toBeGreaterThan(0);
    expect(paMax).toBeCloseTo((40000 - 5000) / (2 * 1.3 * longest), 6);
    h.heating.pumpHead = 75;
    expect(paBudget(h).paMax).toBeGreaterThan(paMax);
    expect(sizePipes(h, calcHouse(h)).paMax).toBeCloseTo(paBudget(h).paMax, 6);
  });
});

describe('Pa/m cap', () => {
  it('limits the budget when the pump has head to spare, and can be changed', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.pipes = autoPipes(h);
    h.heating.pumpHead = 200;
    expect(paBudget(h).paPump).toBeGreaterThan(300);
    expect(paBudget(h).paMax).toBe(300);
    h.heating.paCap = 250;
    expect(paBudget(h).paMax).toBe(250);
    h.heating.pumpHead = 6; // barely any head: the pump sets it
    expect(paBudget(h).paMax).toBeLessThan(250);
  });
});

describe('floor or ceiling follows the run upstream', () => {
  it('a run off a ceiling run on the same floor is in the ceiling unless set', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0] }];
    h.heating.pipes = autoPipes(h);
    combineRuns(h);
    const kid = h.heating.pipes!.find((p) => p.emitter && p.leg?.storey === 0 && h.heating.pipes!.find((q) => q.id === p.parent)?.name.startsWith('Shared'))!;
    const trunk = h.heating.pipes!.find((q) => q.id === kid.parent)!;
    expect(viaOf(h, kid)).toBe('floor');
    trunk.via = 'ceiling';
    expect(viaOf(h, kid)).toBe('ceiling');
    kid.via = 'floor';
    expect(viaOf(h, kid)).toBe('floor');
    // Not across floors: the riser branch's runs upstairs start in their own floor.
    const up = h.heating.pipes!.find((p) => p.leg?.storey === 1 && p.emitter)!;
    for (const p of h.heating.pipes!) if (p.leg?.storey === 0) p.via = 'ceiling';
    expect(viaOf(h, up)).toBe('floor');
  });
});

describe('the void between floors', () => {
  it('a ground floor ceiling run and a first floor floor run are in one void, and can share a pipe', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [1, 0] }];
    const onFloor = (s: number) => h.heating.emitters.find((e) => h.rooms.find((r) => r.id === e.room)?.storey === s)!;
    const g = onFloor(0), f = onFloor(1);
    g.at = [0, 5]; f.at = [3, 4];
    h.heating.emitters = [g, f];
    h.heating.pipes = [
      { id: 'P1', name: 'Boiler', parent: null, size: 'Cu 28 mm', length: 1 },
      { id: 'G', name: 'G', parent: 'P1', size: 'Cu 15 mm', length: 5, emitter: g.id, via: 'ceiling', ends: ['source', `e:${g.id}`], leg: { storey: 0, pts: [[0, 0], [0, 5]] } },
      { id: 'F', name: 'F', parent: 'P1', size: 'Cu 10 mm (microbore)', length: 6, emitter: f.id, ends: ['rs1', `e:${f.id}`], leg: { storey: 1, pts: [[1, 0], [1, 4], [3, 4]] } },
    ];
    const [G, F] = [h.heating.pipes[1], h.heating.pipes[2]];
    expect(voidOf(h, G)).toBe(1);
    expect(voidOf(h, F)).toBe(1);
    expect(voidName(h, 1)).toBe(`between the ${h.storeys[0].name.toLowerCase()} and ${h.storeys[1].name.toLowerCase()}`);
    F.leg!.pts = dragSegment(F.leg!.pts, 0, [-1, 0]);
    expect(joinRun(h, 'F')).toBe(true);
    const S = h.heating.pipes.find((p) => p.name.startsWith('Shared'))!;
    expect(S.leg).toEqual({ storey: 0, pts: [[0, 0], [0, 4]] });
    expect(S.via).toBe('ceiling');
    // Each keeps its own floor and where it runs: F still serves the first floor, from its floor void.
    expect(F).toMatchObject({ parent: S.id, via: 'floor', leg: { storey: 1 } });
    expect(voidOf(h, F)).toBe(1);
  });
});
