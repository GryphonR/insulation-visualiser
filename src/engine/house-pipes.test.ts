import { layoutPipes } from '../ui/HouseSchematic';
import { syncNet } from './house-net';
import type { Attach } from './house-pipes';
import { describe, expect, it } from 'vitest';
import { calcHouse } from './house';
import { defaultHouse } from './house-default';
import { emitterOut, lpm, roomOut, shareIn } from './house-heating';
import { PIPE_SIZES, PIPE_WALL, attachments, defaultLevel, dropAt, runRoute, setRunLevel, drawRun, moveOpenEnd, emitterPort, pipeRest, unpiped, wallSnap, autoPipes, combineRuns, dragSegment, fitSize, fittingsDp, joinRun, joints, kInsert, sizesOn, usable, maxFlow, paBudget, viaOf, voidName, voidOf, livePath, pipeFlow, removeRun, resetRun, routePipes, runLength, setBranchRiser, sizePipes, splitCircuits, splitSegment, squareInto } from './house-pipes';

/** Place a heater so its pipes connect at `p` (its valve end, for a radiator). */
const put = (h: ReturnType<typeof defaultHouse>, e: ReturnType<typeof defaultHouse>['heating']['emitters'][number], p: [number, number]) => {
  e.at = p; e.ang = 0;
  const q = emitterPort(h, e)!;
  e.at = [2 * p[0] - q[0], 2 * p[1] - q[1]];
};

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
    expect(primary.loadW).toBeCloseTo(res.roomSumW, 0);
    expect(primary.flowLpm).toBeCloseTo(lpm(res.roomSumW, h.heating.dT), 6);
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

  it('removing a run with no route hands the runs off it to the run it came off; a drawn one leaves them loose at their junction', () => {
    for (const drawn of [false, true]) {
      // Laid from the plan, the branch up the riser is drawn; with no heat source placed, the typical runs are lengths only.
      const h = syncNet(drawn ? laid() : (() => { const x = defaultHouse(); x.heating.pipes = autoPipes(x); return x; })());
      const mid = h.heating.pipes!.find((p) => p.parent && !!p.leg === drawn && h.heating.pipes!.some((c) => c.parent === p.id))!;
      const kids = h.heating.pipes!.filter((c) => c.parent === mid.id).map((c) => c.id);
      expect(kids.length).toBeGreaterThan(0);
      removeRun(h, mid.id);
      const n = syncNet(h);
      expect(n.heating.pipes!.some((p) => p.id === mid.id)).toBe(false);
      for (const id of kids) expect(n.heating.pipes!.find((p) => p.id === id)).toMatchObject(drawn ? { parent: null, loose: true } : { parent: mid.parent });
    }
  });

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
    expect(pts[pts.length - 1]).toEqual(emitterPort(h, e));
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
  it('by circuit: the riser splits into one run per zone, and runs share a pipe only within their zone', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0] }];
    h.heating.pipes = autoPipes(h);
    const res = calcHouse(h), zoneOf = (p: { emitter?: string }) => h.heating.emitters.find((e) => e.id === p.emitter)?.zone ?? null;
    const up = h.heating.pipes.filter((p) => p.name.startsWith('To first floor')).length;
    splitCircuits(h, zoneOf);
    combineRuns(h, res, zoneOf);
    const pipes = h.heating.pipes!, risers = pipes.filter((p) => p.name.startsWith('To first floor'));
    expect(risers.length).toBeGreaterThan(up);
    // Every run that feeds others leads to one zone only.
    const zones = (id: string): Set<string> => { const p = pipes.find((x) => x.id === id)!, z = zoneOf(p); return new Set([...(z ? [z] : []), ...pipes.filter((k) => k.parent === id).flatMap((k) => [...zones(k.id)])]); };
    for (const p of pipes.filter((x) => x.parent && !x.emitter)) expect(zones(p.id).size, p.name).toBe(1);
    expect(sizePipes(h, res).unpiped).toEqual([]);
  });
});

describe('dragging one run onto another', () => {
  it('joins them into one shared pipe', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    const [e1, e2] = h.heating.emitters;
    put(h, e1, [4, 3]); put(h, e2, [5, 2]);
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
    put(h, e1, [0.2, 5]); put(h, e2, [2, 4]); put(h, e3, [1, -2]);
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
    // Lengths are rounded to 0.1 m, each separately. In the room, it runs along the wall to the valves.
    run.via = 'floor';
    expect(Math.abs(runLength(h, run) - (route + 0.15 + st.zone / 2))).toBeLessThan(0.11);
    run.via = 'room';
    expect(Math.abs(runLength(h, run) - route)).toBeLessThan(0.11);
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
  it('a run saved without a level takes it from the run it comes off, once, and keeps it', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0, 0], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0] }];
    h.heating.pipes = autoPipes(h);
    combineRuns(h);
    for (const p of h.heating.pipes!) delete p.via;
    const kid = h.heating.pipes!.find((p) => p.emitter && p.leg?.storey === 0 && h.heating.pipes!.find((q) => q.id === p.parent)?.name.startsWith('Shared'))!;
    const trunk = h.heating.pipes!.find((q) => q.id === kid.parent)!;
    expect(viaOf(h, kid)).toBe('floor');
    trunk.via = 'ceiling';
    expect(viaOf(h, kid)).toBe('ceiling');
    // Not across floors: the riser branch's runs upstairs start in their own floor.
    const up = h.heating.pipes!.find((p) => p.leg?.storey === 1 && p.emitter)!;
    expect(viaOf(h, up)).toBe('floor');
    // Read into the net, each keeps the level it had, whatever it comes off afterwards.
    const n = syncNet(h);
    expect(n.heating.pipes!.find((p) => p.id === kid.id)!.via).toBe('ceiling');
    expect(n.heating.pipes!.filter((p) => p.leg).every((p) => p.via)).toBe(true);
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

describe('drawing runs by hand', () => {
  const blank = () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    return h;
  };
  const em = (h: ReturnType<typeof defaultHouse>, storey: number) => h.heating.emitters.find((e) => h.rooms.find((r) => r.id === e.room)?.storey === storey)!;

  it('every heater, the source and the cylinder have an attachment point on their floor', () => {
    const h = blank();
    h.heating.cylinder = { at: [1, 1], storey: 1 };
    const g = attachments(h, 0).map((a) => a.id), f = attachments(h, 1).map((a) => a.id);
    expect(g).toContain('source');
    expect(f).toContain('cylinder');
    expect(g.filter((x) => x.startsWith('e:')).length + f.filter((x) => x.startsWith('e:')).length).toBe(h.heating.emitters.length);
  });

  it('a run drawn from a radiator to the source is turned round, squared up and sized; drawing it again replaces it', () => {
    const h = blank(), e = em(h, 0), at = attachments(h, 0).find((x) => x.id === `e:${e.id}`)!.at;
    const r = drawRun(h, 0, { id: `e:${e.id}` }, [[at[0], 0.5]], { id: 'source' });
    expect('id' in r).toBe(true);
    const p = h.heating.pipes!.find((x) => 'id' in r && x.id === r.id)!;
    expect(p.ends).toEqual(['source', `e:${e.id}`]);
    expect(p.emitter).toBe(e.id);
    expect(livePath(h, p)![0]).toEqual([0.5, 0.5]);
    for (let i = 1; i < p.leg!.pts.length; i++) { const [a, b] = [p.leg!.pts[i - 1], p.leg!.pts[i]]; expect(a[0] === b[0] || a[1] === b[1]).toBe(true); }
    drawRun(h, 0, { id: 'source' }, [], { id: `e:${e.id}` });
    expect(h.heating.pipes!.filter((x) => x.emitter === e.id).length).toBe(1);
    expect(sizePipes(h, calcHouse(h)).unpiped).not.toContain(e.id);
  });

  it('a run drawn on the slant keeps its slants, to the end when drawn free', () => {
    const h = blank(), e = em(h, 0), at = attachments(h, 0).find((x) => x.id === `e:${e.id}`)!.at;
    const c: [number, number] = [1.7, 1.3];
    const free = drawRun(h, 0, { id: 'source' }, [c], { id: `e:${e.id}` }, false) as { id: string };
    const p = h.heating.pipes!.find((x) => x.id === free.id)!;
    expect(p.leg!.pts).toEqual([[0.5, 0.5], c, at]);
    expect(livePath(h, p)).toEqual([[0.5, 0.5], c, at]);
    const straight = drawRun(h, 0, { id: 'source' }, [], { id: `e:${e.id}` }, false) as { id: string };
    expect(livePath(h, h.heating.pipes!.find((x) => x.id === straight.id)!)).toEqual([[0.5, 0.5], at]);
    // With snapping on, only the last stretch into the heater gets a corner; the drawn slant stays.
    const sq = drawRun(h, 0, { id: 'source' }, [c], { id: `e:${e.id}` }) as { id: string };
    const q = h.heating.pipes!.find((x) => x.id === sq.id)!.leg!.pts;
    expect(q.slice(0, 2)).toEqual([[0.5, 0.5], c]);
    expect(q.length).toBe(at[0] === c[0] || at[1] === c[1] ? 3 : 4);
  });

  it('teeing part way along a run splits it into a shared run feeding both', () => {
    const h = blank();
    const main = drawRun(h, 0, { id: 'source' }, [[4.5, 0.5]], null) as { id: string };
    const e = em(h, 0), r = drawRun(h, 0, { run: main.id, at: [2.5, 0.6] }, [], { id: `e:${e.id}` }) as { id: string };
    const x = h.heating.pipes!.find((p) => p.id === r.id)!, s = h.heating.pipes!.find((p) => p.id === x.parent)!;
    expect(s.leg!.pts).toEqual([[0.5, 0.5], [2.5, 0.5]]);
    expect(h.heating.pipes!.find((p) => p.id === main.id)!.parent).toBe(s.id);
    expect(livePath(h, x)![0]).toEqual([2.5, 0.5]);
  });

  it('new runs go under a suspended floor, else in the ceiling; one off another run is laid where that run is', () => {
    const h = blank(), gf = h.buildups.find((b) => b.id === h.defaults.groundFloor)!;
    gf.floorType = 'solid';
    const a = drawRun(h, 0, { id: 'source' }, [[3, 0.5], [3, 3]], null) as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === a.id)!.via).toBe('ceiling');
    gf.floorType = 'suspended';
    const b = drawRun(h, 0, { id: 'source' }, [[0.5, 3]], null) as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === b.id)!.via).toBe('floor');
    expect(defaultLevel(h, 1)).toBe('floor'); // upper floors always have a floor void
    // On the first floor, a run off the ground floor's ceiling run is in the same void: the floor of the first floor.
    const e = em(h, 1), r = drawRun(h, 1, { run: a.id, at: [3, 2] }, [], { id: `e:${e.id}` }) as { id: string };
    const R = h.heating.pipes!.find((p) => p.id === r.id)!;
    expect(R.via).toBe('floor');
    expect(voidOf(h, R)).toBe(voidOf(h, h.heating.pipes!.find((p) => p.id === a.id)!));
    // From the ground floor plan, a run off it in the ceiling stays in the ceiling.
    const g = drawRun(h, 0, { run: a.id, at: [3, 1] }, [[4, 1]], null) as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === g.id)!.via).toBe('ceiling');
    // Drawn at a level (the plan's switch): from the source it goes there; off a run, it goes where that run is.
    const rm = drawRun(h, 0, { id: 'source' }, [[0.5, 4]], null, true, 'room') as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === rm.id)!.via).toBe('room');
    const off = drawRun(h, 0, { run: a.id, at: [3, 2.5] }, [[4.5, 2.5]], null, true, 'room') as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === off.id)!.via).toBe('room'); // with a drop at the tee (see drops between levels)
  });

  it('a run finished on another run feeds it from there on, and never in a loop', () => {
    const h = blank();
    const main = drawRun(h, 0, { id: 'source' }, [[4.5, 0.5]], null) as { id: string };
    const r = drawRun(h, 0, { id: 'source' }, [[0.5, 2], [2.5, 2]], { run: main.id, at: [2.5, 0.6] }) as { id: string };
    const n = syncNet(h), y = n.heating.pipes!.find((p) => p.id === main.id)!, x = n.heating.pipes!.find((p) => p.id === r.id)!;
    // They meet at a junction on main, which splits there; the rest of main carries on from that junction.
    expect(x.leg!.pts[x.leg!.pts.length - 1]).toEqual([2.5, 0.5]);
    expect(livePath(n, y)![0]).toEqual([2.5, 0.5]);
    expect(y.a).toBe(x.b);
    // Two pipes from the source to one junction make a loop: one of them is marked, and carries nothing.
    expect(n.heating.pipes!.filter((p) => p.loop).length).toBe(1);
    expect(n.heating.pipes!.filter((p) => p.loose).length).toBe(0);
    expect('id' in drawRun(n, 0, { run: main.id, at: [4, 0.5] }, [[4, 2]], { run: r.id, at: [1.5, 2] })).toBe(true);
  });

  it('upstairs, a run off the source makes the branch through the floor', () => {
    const h = blank(), e = em(h, 1);
    const r = drawRun(h, 1, { id: 'source' }, [], { id: `e:${e.id}` }) as { id: string };
    const x = h.heating.pipes!.find((p) => p.id === r.id)!, br = h.heating.pipes!.find((p) => p.id === x.parent)!;
    expect(br.ends).toEqual(['source', 'source']);
    expect(br.rise).toBeCloseTo(h.storeys[0].h + h.storeys[1].zone, 6);
    expect('error' in drawRun(h, 0, { id: 'cylinder' }, [], { id: `e:${e.id}` })).toBe(true);
  });

  it('snaps a stretch to stop short of the wall across it', () => {
    const h = blank(), r = h.rooms.find((x) => x.storey === 0)!, xs = r.poly ? r.poly.map((q) => q[0] + (r.x ?? 0)) : [r.x, r.x + r.w];
    const wall = Math.max(...xs), q = wallSnap(h, 0, [wall - 2, 1], [wall - 0.05, 1.2], 0.3);
    expect(q).toEqual([+(wall - PIPE_WALL).toFixed(3), 1]);
  });

  it('follows a wall off the grid and stops short of the wall across it, square to that wall', () => {
    const h = blank(), c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const turn = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
    h.rooms = h.rooms.filter((r) => r.storey === 0).slice(0, 1);
    h.rooms[0].poly = [turn(0, 0), turn(4, 0), turn(4, 3), turn(0, 3)];
    // Local frame: along the room's long wall (u), across it (w).
    const loc = (p: [number, number]) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
    const last = turn(1, 0.1), q = wallSnap(h, 0, last, turn(3.95, 0.3), 0.3);
    const [x, y] = loc(q);
    expect(x).toBeCloseTo(4 - PIPE_WALL, 2);
    expect(y).toBeCloseTo(0.1, 2);
    // The last stretch into a heater turns square to the stretch before it, not to the grid.
    const tail = squareInto(h, 0, last, q, turn(3, 2));
    expect(tail.length).toBe(3);
    expect(loc(tail[1])[0]).toBeCloseTo(3, 2);
    expect(loc(tail[1])[1]).toBeCloseTo(0.1, 2);
  });
});

describe('UFH manifolds', () => {
  it('a placed manifold takes the place of its loops: one run to it carries all their load', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const loops = h.heating.emitters.filter((e) => h.rooms.find((r) => r.id === e.room)?.storey === 0).slice(0, 2);
    h.heating.zones.push({ id: 'zm', name: 'Ground', kind: 'ufh', color: '#000', on: true, hours: null, blend: 35, manifold: { x: 3, y: 0.5, storey: 0 } });
    for (const e of loops) { e.kind = 'ufh'; e.zone = 'zm'; e.area = 12; e.spacing = 150; e.cover = 'Tiles'; }
    loops[0].area = 1; // too small for its room
    const ids = attachments(h, 0).map((a) => a.id);
    expect(ids).toContain('m:zm');
    for (const e of loops) expect(ids).not.toContain(`e:${e.id}`);
    expect(unpiped(h)).toContain('m:zm');
    const r = drawRun(h, 0, { id: 'source' }, [], { id: 'm:zm' }) as { id: string };
    const res = sizePipes(h, calcHouse(h)), row = res.rows.find((x) => x.pipe.id === r.id)!;
    // Each loop's share of its room's loss, or its full output if that is less.
    const flow = calcHouse(h).heat.designFlow, out = (e: (typeof loops)[number]) => emitterOut(e, flow, h.rooms.find((x) => x.id === e.room)!.setpoint, h);
    expect(row.loadW).toBeCloseTo(loops.reduce((a, e) => a + Math.min(res.emitterW.get(e.id) ?? 0, out(e)), 0), 6);
    expect(loops.some((e) => out(e) < res.emitterW.get(e.id)!)).toBe(true); // the cap is exercised
    expect(row.loadW).toBeGreaterThan(0);
    expect(row.pipe.size).toBe(fitSize(row.flowLpm, [], res.paMax)); // sized for its loops, not a fixed 22 mm
    for (const e of loops) expect(res.unpiped).not.toContain(e.id);
    expect(unpiped(h)).not.toContain('m:zm');
    // Taken off the plan, the loops are piped one by one again.
    delete h.heating.zones.find((z) => z.id === 'zm')!.manifold;
    expect(unpiped(h)).toContain(`e:${loops[0].id}`);
  });

  it('a run teed at the far end of a manifold run comes off just before it, not through it', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    h.heating.zones.push({ id: 'zm', name: 'UFH manifold', kind: 'ufh', color: '#000', on: true, hours: null, blend: 35, manifold: { x: 3, y: 2, storey: 0 } });
    const m = drawRun(h, 0, { id: 'source' }, [], { id: 'm:zm' }) as { id: string };
    const e = h.heating.emitters.find((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 0)!;
    const r = drawRun(h, 0, { run: m.id, at: [3, 2] }, [], { id: `e:${e.id}` }) as { id: string };
    const ps = h.heating.pipes, run = ps.find((p) => p.id === r.id)!, man = ps.find((p) => p.ends?.[1] === 'm:zm')!;
    expect(run.parent).not.toBe(man.id);
    expect(ps.some((p) => p.parent === man.id)).toBe(false);
    expect(run.parent).toBe(man.parent); // both off the shared stretch before the manifold
    expect(layoutPipes(h).nodes.some((n) => n.p.id === man.id)).toBe(true);
  });

  it('pipes the rest routes one run to a manifold, not one per loop', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const loops = h.heating.emitters.filter((e) => h.rooms.find((r) => r.id === e.room)?.storey === 0).slice(0, 2);
    h.heating.zones.push({ id: 'zm', name: 'UFH manifold', kind: 'ufh', color: '#000', on: true, hours: null, blend: 35, manifold: { x: 3, y: 0.5, storey: 0 } });
    for (const e of loops) { e.kind = 'ufh'; e.zone = 'zm'; e.area = 12; e.spacing = 150; e.cover = 'Tiles'; }
    pipeRest(h);
    expect(h.heating.pipes.filter((p) => p.ends?.[1] === 'm:zm').map((p) => p.name)).toEqual(['UFH manifold']);
    expect(unpiped(h)).toEqual([]);
  });
});

describe('attachment points and filling in', () => {
  it("a radiator's pipes connect at its valve end nearer the heat source", () => {
    const h = defaultHouse(), e = h.heating.emitters.find((x) => x.kind === 'radiator')!;
    h.heating.source = { at: [0, 0], storey: 0 };
    e.at = [5, 2]; e.ang = 0;
    expect(emitterPort(h, e)).toEqual([+(5 - e.len / 2000).toFixed(3), 2]);
  });

  it('pipes the rest: every heater left without a run gets one, and drawn runs stay', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0.5] }];
    h.heating.pipes = autoPipes(h);
    const gone = h.heating.pipes.filter((p) => p.emitter).slice(-2);
    gone.forEach((p) => removeRun(h, p.id));
    expect(unpiped(h).length).toBe(2);
    expect(pipeRest(h)).toBe(2);
    expect(unpiped(h)).toEqual([]);
    expect(sizePipes(h, calcHouse(h)).unpiped).toEqual([]);
  });

  it("tees into a run in the ceiling void from the floor below's plan, and lays the new run in that ceiling", () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const main = drawRun(h, 0, { id: 'source' }, [[4.5, 0.5]], null) as { id: string };
    h.heating.pipes.find((p) => p.id === main.id)!.via = 'ceiling';
    const e = h.heating.emitters.find((x) => h.rooms.find((r) => r.id === x.room)?.storey === 0)!;
    const r = drawRun(h, 0, { run: main.id, at: [2.5, 0.5] }, [], { id: `e:${e.id}` }) as { id: string };
    expect(viaOf(h, h.heating.pipes.find((p) => p.id === r.id)!)).toBe('ceiling');
    expect('error' in drawRun(h, 1, { run: main.id, at: [2, 0.5] }, [[2, 2]], null)).toBe(false);
  });
});

describe('pipe sizes on the project', () => {
  it('switched-off sizes are swapped for the nearest one on, in layouts and sizing', () => {
    const h = defaultHouse();
    h.heating.pipeOff = ['Cu 10 mm (microbore)', 'Cu 22 mm', 'PEX 16 mm'];
    expect(usable(h, 'Cu 10 mm (microbore)')).toBe('Cu 15 mm');
    expect(usable(h, 'Cu 22 mm')).toBe('Cu 28 mm');
    expect(usable(h, 'Cu 15 mm')).toBe('Cu 15 mm');
    expect(fitSize(0.1, [], 300, sizesOn(h))).toBe('Cu 15 mm');
    expect(fitSize(12, [], 300, sizesOn(h))).not.toBe('Cu 22 mm');
    const used = new Set(autoPipes(h).map((p) => p.size));
    for (const k of h.heating.pipeOff) expect(used.has(k)).toBe(false);
    // With all of a material off, a plastic loop goes to the nearest size on in another.
    h.heating.pipeOff = Object.keys(PIPE_SIZES).filter((k) => k.startsWith('PEX'));
    expect(usable(h, 'PEX 16 mm')).toBe('MLCP 16 mm');
  });
});

describe('fitting losses', () => {
  it('counts elbows on a run laid on the plan, and plastic inserts add to them', () => {
    const h = defaultHouse();
    expect(kInsert(13.6, 13.6)).toBe(0);
    expect(kInsert(11.6, 9.5)).toBeGreaterThan(0.5);
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = autoPipes(h);
    const p = h.heating.pipes.find((x) => x.leg && joints(h, x)!.elbows > 0 && x.size.startsWith('Cu') && !x.size.includes('micro'))!;
    const j = joints(h, p)!, q = (992 * 0.7 * 0.7) / 2;
    expect(fittingsDp(h, p, 0.7, 1000)).toBeCloseTo(q * (j.elbows * 0.8 + (j.tee ? 1 : 0)), 6); // copper: no inserts
    const cu = fittingsDp(h, p, 0.7, 1000);
    p.size = 'PEX 15 mm';
    expect(fittingsDp(h, p, 0.7, 1000)).toBeGreaterThan(cu);
    h.heating.fitBore = { 'PEX 15 mm': 11.6 }; // fittings as wide as the pipe: back to copper's loss
    expect(fittingsDp(h, p, 0.7, 1000)).toBeCloseTo(cu, 6);
    p.typed = true;
    expect(fittingsDp(h, p, 0.7, 1000)).toBeCloseTo(300, 6); // a typed length keeps the 30% allowance
  });
});

describe('ducted fan coils', () => {
  it('share their output between the rooms they feed by floor area, and their run carries every room they feed', () => {
    const h = defaultHouse();
    const top = h.storeys.length - 1, [a, b] = h.rooms.filter((r) => r.storey === top && r.heated);
    h.heating.emitters = h.heating.emitters.filter((e) => e.room !== a.id && e.room !== b.id);
    h.heating.emitters.push({ id: 'fc', room: a.id, kind: 'fancoil', zone: h.heating.zones[0].id, type: 'K2', len: 1000, height: 600, rated: 3000, area: 0, spacing: 150, cover: 'Tiles', tail: 0, feeds: [a.id, b.id], storey: top + 1, at: [a.x + 1, a.y + 1] });
    const fc = h.heating.emitters.find((e) => e.id === 'fc')!, area = (r: typeof a) => r.w * r.d;
    expect(shareIn(h, fc, a.id)).toBeCloseTo(area(a) / (area(a) + area(b)), 6);
    expect(shareIn(h, fc, b.id) + shareIn(h, fc, a.id)).toBeCloseTo(1, 6);
    const full = emitterOut(fc, 45, 21, h);
    expect(roomOut(h, a.id, 45, 21) + roomOut(h, b.id, 45, 21)).toBeCloseTo(full, 6);
    const res = calcHouse(h);
    for (const r of [a, b]) expect(res.heat.rooms.find((q) => q.id === r.id)?.has).toBe(true);
    // In the roof space, piped up the riser from below.
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    expect(attachments(h, top + 1).map((x) => x.id)).toContain('e:fc');
    expect(attachments(h, top).map((x) => x.id)).not.toContain('e:fc');
    pipeRest(h);
    const s = sizePipes(h, calcHouse(h)), row = s.rows.find((x) => x.pipe.emitter === 'fc')!;
    const need = (id: string) => calcHouse(h).rooms.find((r) => r.room.id === id)!.totalW;
    expect(row.loadW).toBeCloseTo(need(a.id) + need(b.id), 0);
  });
});

describe('open ends', () => {
  it('an open end can be moved, or finished onto a heater or another run, keeping its route and id', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const e = h.heating.emitters.find((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 0)!;
    const o = drawRun(h, 0, { id: 'source' }, [[2, 0.5]], null) as { id: string };
    const open = () => h.heating.pipes!.find((p) => p.id === o.id)!;
    expect(open().ends![1]).toBe('');
    // Moved: the end goes where it is dropped.
    expect(moveOpenEnd(h, o.id, null, [2, 1.5])).toEqual({ id: o.id });
    expect(livePath(h, open())!.slice(-1)[0]).toEqual([2, 1.5]);
    // Dropped on nothing it can feed from: refused, nothing changes.
    const before = JSON.stringify(h.heating.pipes);
    expect('error' in moveOpenEnd(h, o.id, { id: 'source' }, [0.5, 0.5])).toBe(true);
    expect(JSON.stringify(h.heating.pipes)).toBe(before);
    // Onto a radiator: it now feeds it, through its old corners.
    expect(moveOpenEnd(h, o.id, { id: `e:${e.id}` }, emitterPort(h, e)!)).toEqual({ id: o.id });
    expect(open().emitter).toBe(e.id);
    expect(open().ends).toEqual(['source', `e:${e.id}`]);
    expect(livePath(h, open())!.some((q) => q[0] === 2 && q[1] === 1.5)).toBe(true);
    expect(unpiped(h)).not.toContain(`e:${e.id}`);
    // Another open end finished onto that run tees into it and feeds it from there on.
    const o2 = drawRun(h, 0, { id: 'source' }, [[0.5, 1.5]], null) as { id: string };
    const r = moveOpenEnd(h, o2.id, { run: o.id, at: [2, 1] }, [2, 1]);
    expect(r).toEqual({ id: o2.id });
    // It ends at a junction on that run (split there), so both reach the radiator's run: a loop from the source, one of them marked.
    const n = syncNet(h), fed = n.heating.pipes!.find((p) => p.emitter === e.id)!;
    expect(n.heating.pipes!.find((p) => p.id === o2.id)!.b).toBe(fed.a);
    expect(n.heating.pipes!.filter((p) => p.loop).length).toBe(1);
  });

  it('keeps every run id unique when the run it is dropped on is split to make the tee', () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const e = h.heating.emitters.find((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 0)!;
    const r = drawRun(h, 0, { id: 'source' }, [[3, 0.5], [3, 2]], { id: `e:${e.id}` }) as { id: string };
    // The open end is the newest run: its id is the one a new run would be given once it is taken out.
    const o = drawRun(h, 0, { id: 'source' }, [[0.5, 2]], null) as { id: string };
    expect(moveOpenEnd(h, o.id, { run: r.id, at: [2, 0.5] }, [2, 0.5])).toEqual({ id: o.id });
    const ids = h.heating.pipes.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const parents = new Set(h.heating.pipes.map((p) => p.parent).filter(Boolean));
    for (const id of parents) expect(ids).toContain(id);
    // The moved run ends at a junction on that run: the two share it.
    const n = syncNet(h), fed = n.heating.pipes!.find((p) => p.emitter === e.id)!;
    expect(n.heating.pipes!.find((p) => p.id === o.id)!.b).toBe(fed.a);
  });
});

describe('runs between risers', () => {
  const setup = () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.risers = [{ id: 'rs1', at: [2, 0.5] }, { id: 'rs2', at: [6, 3] }];
    h.heating.pipes = [];
    const up = h.heating.emitters.find((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 1)!;
    return { h, up };
  };
  const chain = (h: ReturnType<typeof defaultHouse>, id: string) => { const out: string[] = []; for (let p = h.heating.pipes!.find((x) => x.id === id); p; p = h.heating.pipes!.find((x) => x.id === p!.parent)) out.push(p.id); return out; };

  it('a run on an upper floor from one riser to another feeds the second, and runs off it there come off it', () => {
    const { h, up } = setup();
    const f = drawRun(h, 1, { id: 'rs1' }, [[2, 3]], { id: 'rs2' }) as { id: string };
    expect(f.id).toBeTruthy();
    expect(h.heating.pipes!.find((p) => p.id === f.id)!.name).toBe('To riser 2');
    const r = drawRun(h, 1, { id: 'rs2' }, [], { id: `e:${up.id}` }) as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === r.id)!.parent).toBe(f.id);
    const s = sizePipes(h, calcHouse(h));
    expect(s.rows.find((x) => x.pipe.id === f.id)!.loadW).toBeGreaterThan(0);
  });

  it('a run from the source to a riser on the ground floor feeds it: the branches up it move onto that run', () => {
    const { h, up } = setup();
    const before = drawRun(h, 1, { id: 'rs2' }, [], { id: `e:${up.id}` }) as { id: string }; // up rs2 straight from the source
    const f = drawRun(h, 0, { id: 'source' }, [[6, 0.5]], { id: 'rs2' }) as { id: string };
    expect(chain(h, before.id)).toContain(f.id);
    const br = h.heating.pipes!.find((p) => p.ends?.[1] === 'rs2' && p.rise != null)!;
    expect(br.parent).toBe(f.id);
    expect(br.leg).toBeUndefined();
    expect(sizePipes(h, calcHouse(h)).unpiped).not.toContain(up.id);
    // On its own floor, a run started at the riser tees off the feed's end.
    const e0 = h.heating.emitters.find((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 0)!;
    const r0 = drawRun(h, 0, { id: 'rs2' }, [], { id: `e:${e0.id}` }) as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === r0.id)!.parent).toBe(f.id);
  });

  it('refuses a riser feed that would come off its own branch', () => {
    const { h } = setup();
    drawRun(h, 0, { id: 'source' }, [], { id: 'rs1' });
    drawRun(h, 1, { id: 'rs1' }, [[2, 3]], { id: 'rs2' });
    const r = drawRun(h, 0, { id: 'rs2' }, [[2, 3]], { id: 'rs1' });
    expect('error' in r && r.error).toMatch(/from itself/);
  });
});


describe('drops between levels', () => {
  const house = () => {
    const h = defaultHouse();
    h.heating.source = { at: [0.5, 0.5], storey: 0 };
    h.heating.pipes = [];
    const rad = (s: number) => h.heating.emitters.find((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === s)!;
    return { h, rad };
  };
  const zone = (h: ReturnType<typeof defaultHouse>, s: number) => h.storeys[s]?.zone ?? 0.25;

  it('switching level part way through a run ends it there, with a drop to carry on from at the new level', () => {
    const { h, rad } = house(), e = rad(0), e1 = rad(1);
    const top = dropAt(h, 0, { id: 'source' }, [[3, 0.5]], 'floor', 'ceiling') as { from: Attach; at: [number, number] };
    expect(top.at).toEqual([3, 0.5]);
    const r = drawRun(h, 0, top.from, [[3, 3]], { id: `e:${e.id}` }) as { id: string };
    expect(h.heating.pipes!.find((p) => p.id === r.id)!.via).toBe('ceiling');
    const n = syncNet(h), d = n.heating.pipes!.find((p) => p.drop)!;
    expect(n.heating.pipes!.some((p) => p.loose || p.loop)).toBe(false);
    expect(n.heating.pipes!.find((p) => p.id === r.id)!.parent).toBe(d.id);
    // From the middle of the ground floor's floor void to the middle of its ceiling void.
    expect(d.rise).toBeCloseTo(h.storeys[0].h + zone(h, 1) / 2 + zone(h, 0) / 2, 2);
    expect(Math.abs(runLength(n, d) - d.rise!)).toBeLessThanOrEqual(0.05 + 1e-9); // lengths are kept to 0.1 m
    // That ceiling is the first floor's floor void: a run upstairs can start from the top of the drop.
    const up = drawRun(n, 1, top.from, [[3, 4]], { id: `e:${e1.id}` }) as { id: string };
    const n2 = syncNet(n);
    expect(n2.heating.pipes!.find((p) => p.id === up.id)).toMatchObject({ parent: d.id, via: 'floor' });
    const s = sizePipes(n2, calcHouse(n2));
    expect(s.rows.find((x) => x.pipe.id === d.id)!.loadW).toBeCloseTo(s.emitterW.get(e.id)! + s.emitterW.get(e1.id)!, 0);
    // Said in words: where each comes from and goes to, looking through the drop.
    const first = n2.heating.pipes!.find((p) => p.id === d.parent)!;
    expect(runRoute(n2, n2.heating.pipes!.find((p) => p.id === r.id)!)).toMatch(new RegExp(`^From ${first.name} by way of a drop to the .+ radiator\. Between the `));
    expect(runRoute(n2, first)).toMatch(/^From the (heat pump|boiler) to a junction feeding .+ and .+\. Under the /);
    // The diagram leaves the drop out: the runs beyond it show off the run before it.
    const lay = layoutPipes(n2).nodes;
    expect(lay.some((x) => x.p.drop)).toBe(false);
    expect(lay.find((x) => x.p.id === r.id)!.px).toBe(lay.find((x) => x.p.id === d.parent)!.depth);
  });

  it('teeing off a run at another level puts a drop in at the tee; the new run is at the level picked', () => {
    const { h, rad } = house(), e = rad(0);
    const a = drawRun(h, 0, { id: 'source' }, [[3, 0.5], [3, 3]], null, true, 'ceiling') as { id: string };
    const r = drawRun(h, 0, { run: a.id, at: [3, 2] }, [[1, 2]], { id: `e:${e.id}` }, true, 'floor') as { id: string };
    const n = syncNet(h), R = n.heating.pipes!.find((p) => p.id === r.id)!, d = n.heating.pipes!.find((p) => p.drop)!;
    expect(R.via).toBe('floor');
    expect(R.parent).toBe(d.id);
    expect(d.drop!.at).toEqual([3, 2]);
    expect(n.heating.pipes!.some((p) => p.loose || p.loop)).toBe(false);
    expect(sizePipes(n, calcHouse(n)).unpiped).not.toContain(e.id);
  });

  it("changing a run's level puts drops in where it meets other runs, and none at its heater", () => {
    const { h, rad } = house(), e = rad(0);
    const a = drawRun(h, 0, { id: 'source' }, [[3, 0.5]], null, true, 'ceiling') as { id: string };
    const m = drawRun(h, 0, { run: a.id, at: [3, 0.5] }, [[3, 3]], null, true, 'ceiling') as { id: string };
    const k = drawRun(h, 0, { run: m.id, at: [3, 3] }, [], { id: `e:${e.id}` }, true, 'ceiling') as { id: string };
    const n = syncNet(h);
    setRunLevel(n, k.id, 'room'); // its start meets m; its end is the radiator
    setRunLevel(n, m.id, 'floor'); // both its ends meet other runs
    const x = syncNet(n), drops = x.heating.pipes!.filter((p) => p.drop);
    expect(x.heating.pipes!.find((p) => p.id === k.id)!.via).toBe('room');
    expect(drops.length).toBe(2); // the two at m's far end (under the floor to the ceiling, then to the room) merge into one
    expect(x.heating.pipes!.some((p) => p.loose || p.loop)).toBe(false);
    expect(sizePipes(x, calcHouse(x)).unpiped).not.toContain(e.id);
  });

  it('switching straight back to the level it left undoes that drop; drops stacked at one spot merge, and dead climbs go', () => {
    const { h } = house();
    const t1 = dropAt(h, 0, { id: 'source' }, [[3, 0.5]], 'floor', 'room') as { from: Attach; at: [number, number] };
    expect(h.heating.pipes!.filter((p) => p.drop).length).toBe(1);
    const back = dropAt(h, 0, t1.from, [], 'room', 'floor') as { from: Attach; at: [number, number] };
    expect(h.heating.pipes!.filter((p) => p.drop).length).toBe(0);
    expect(back.at).toEqual([3, 0.5]);
    // Under the floor to the room, then on to the ceiling at the same spot: one drop the whole way.
    const t2 = dropAt(h, 0, back.from, [], 'floor', 'room') as { from: Attach };
    const t3 = dropAt(h, 0, t2.from, [], 'room', 'ceiling') as { from: Attach };
    const e = h.heating.emitters.find((x) => x.kind === 'radiator' && h.rooms.find((r) => r.id === x.room)?.storey === 0)!;
    drawRun(h, 0, t3.from, [[3, 3]], { id: `e:${e.id}` });
    const n = syncNet(h), drops = n.heating.pipes!.filter((p) => p.drop);
    expect(drops.length).toBe(1);
    expect(drops[0].rise).toBeCloseTo(h.storeys[0].h + zone(h, 1) / 2 + zone(h, 0) / 2, 2);
    expect(n.heating.pipes!.some((p) => p.loose || p.loop)).toBe(false);
    // A drop with nothing beyond it (drawing given up after switching level) goes.
    const x = structuredClone(n);
    dropAt(x, 0, { id: 'source' }, [[1, 4]], 'floor', 'room');
    expect(syncNet(x).heating.pipes!.filter((p) => p.drop).length).toBe(1);
  });

  it('nothing joins at a manifold: a tee at the end of its run is 15 cm short, and a run left starting at one is loose', () => {
    const { h, rad } = house(), e1 = rad(1);
    h.heating.zones.push({ id: 'zm', name: 'UFH manifold', kind: 'ufh', color: '#000', on: true, hours: null, blend: 35, manifold: { x: 3, y: 3, storey: 0 } });
    const m = drawRun(h, 0, { id: 'source' }, [[3, 0.5]], { id: 'm:zm' }, true, 'ceiling') as { id: string };
    // Teed off at the manifold end from another level (a node join): it comes off 15 cm short of the manifold.
    const r = drawRun(h, 1, { run: m.id, at: [3, 3] }, [[4, 3]], { id: `e:${e1.id}` }, true, 'room') as { id: string };
    const n = syncNet(h), R = n.heating.pipes!.find((p) => p.id === r.id)!, man = n.heating.pipes!.find((p) => p.ends?.[1] === 'm:zm')!;
    expect(R.loose).toBeUndefined();
    expect(n.heating.pipes!.some((p) => (p.a === man.b || p.b === man.b) && p !== man)).toBe(false);
    // A run saved starting at the manifold itself (as older layouts can be) is read as loose there.
    const x = structuredClone(n), y = x.heating.pipes!.find((p) => p.id === r.id)!;
    const d = x.heating.pipes!.find((p) => p.drop && (p.a === y.a || p.b === y.a))!;
    x.heating.pipes = x.heating.pipes!.filter((p) => p !== d);
    y.a = man.b;
    const z = syncNet(x);
    expect(z.heating.pipes!.find((p) => p.id === r.id)!.loose).toBe(true);
    expect(sizePipes(z, calcHouse(z)).unpiped).toContain(e1.id);
  });

  it('finishing on a run at another level ends at this level, with a drop into that run', () => {
    const { h } = house();
    const a = drawRun(h, 0, { id: 'source' }, [[3, 0.5], [3, 3]], null, true, 'ceiling') as { id: string };
    const r = drawRun(h, 0, { id: 'source' }, [[0.5, 2]], { run: a.id, at: [3, 2] }, true, 'floor') as { id: string };
    const n = syncNet(h), R = n.heating.pipes!.find((p) => p.id === r.id)!, d = n.heating.pipes!.find((p) => p.drop)!;
    expect(R.via).toBe('floor');
    expect([d.a, d.b]).toContain(R.b);
    expect(d.rise).toBeCloseTo(h.storeys[0].h + zone(h, 1) / 2 + zone(h, 0) / 2, 2);
    // On the same level there is no drop.
    const x = drawRun(n, 0, { id: 'source' }, [[1, 4]], { run: a.id, at: [3, 2.5] }, true, 'ceiling');
    expect('id' in x).toBe(true);
    expect(n.heating.pipes!.filter((p) => p.drop).length).toBe(1);
  });
});
