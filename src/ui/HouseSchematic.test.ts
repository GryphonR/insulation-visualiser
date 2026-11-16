import { describe, expect, it } from 'vitest';
import { defaultHouse } from '../engine/house-default';
import { autoPipes } from '../engine/house-pipes';
import { layoutPipes } from './HouseSchematic';

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
});
