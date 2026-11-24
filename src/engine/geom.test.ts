import { describe, expect, it } from 'vitest';
import { boxPicks, centroid, compass, dropSpikes, edges, faceReach, overlapAreaPoly, polyArea, selfIntersects, sharedSpan, triangulate } from './geom';
import type { Pt } from './geom';

const rect = (x: number, y: number, w: number, d: number): Pt[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const L: Pt[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]; // L-shape, 12 m²

describe('plan geometry', () => {
  it('area, centroid and orientation-independent edges', () => {
    expect(polyArea(L)).toBeCloseTo(12, 9);
    expect(polyArea([...L].reverse())).toBeCloseTo(12, 9);
    expect(centroid(rect(0, 0, 4, 2))).toEqual([2, 1]);
    const e = edges(rect(0, 0, 4, 2)).map((x) => compass(x.az));
    expect(e).toEqual(['N', 'E', 'S', 'W']);
    expect(edges([...rect(0, 0, 4, 2)].reverse()).map((x) => compass(x.az)).sort()).toEqual(['E', 'N', 'S', 'W']);
  });

  it('a 45° bay faces south-east / south-west', () => {
    const bay: Pt[] = [[0, 0], [4, 0], [4, 3], [3, 4], [1, 4], [0, 3]];
    const az = edges(bay).map((x) => Math.round(x.az));
    expect(az).toEqual([0, 90, 135, 180, 225, 270]);
  });

  it('shared wall span between neighbours, none for a gap', () => {
    const a = edges(rect(0, 0, 4, 3)), b = edges(rect(4, 1, 3, 4));
    expect(sharedSpan(a[1], b[3])).toEqual([1, 3]);
    expect(sharedSpan(a[1], edges(rect(4.5, 0, 3, 3))[3])).toBeNull();
  });

  it('triangulates concave shapes and finds polygon overlaps', () => {
    expect(triangulate(L).reduce((s, t) => s + polyArea(t), 0)).toBeCloseTo(12, 9);
    expect(overlapAreaPoly(L, rect(1, 1, 2, 2))).toBeCloseTo(3, 9); // the L's notch removes one m²
    expect(overlapAreaPoly(rect(0, 0, 2, 2), rect(3, 3, 1, 1))).toBe(0);
    expect(overlapAreaPoly(rect(0, 0, 2, 2), rect(1, 1, 2, 2))).toBeCloseTo(1, 9);
  });

  it('spots a bow-tie', () => {
    expect(selfIntersects([[0, 0], [2, 2], [2, 0], [0, 2]])).toBe(true);
    expect(selfIntersects(L)).toBe(false);
  });
});

describe('dropSpikes', () => {
  it('removes a corner where the wall doubles back, and repeated corners', () => {
    // A near-miss on the first corner: the top wall runs 0.25 m past the left wall and back.
    expect(dropSpikes([[1.75, 8.4], [5.75, 8.4], [5.75, 12.35], [2, 12.35], [2, 8.4]])).toEqual([[5.75, 8.4], [5.75, 12.35], [2, 12.35], [2, 8.4]]);
    expect(dropSpikes([[0, 0], [4, 0], [4, 0], [4, 3], [0, 3]])).toEqual(rect(0, 0, 4, 3));
  });
  it('keeps a straight-through corner and an ordinary outline', () => {
    expect(dropSpikes([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]])).toHaveLength(5);
    expect(dropSpikes(rect(0, 0, 4, 3))).toEqual(rect(0, 0, 4, 3));
  });
});

describe('wall faces meeting at a corner', () => {
  // The L's walls, drawn outward: 0.5 m on the long bottom wall, 0.1 m elsewhere.
  const es = edges(L), out = (i: number) => es[i].n, at = (i: number, o: number, j: number, o2: number, end = true) =>
    faceReach(end ? es[i].d : [-es[i].d[0], -es[i].d[1]], es[i].n, o, es[j].d, es[j].n, o2);

  it('at an outside corner each face runs on to the other wall\'s face, so a thick wall stops at a thin one', () => {
    expect(out(0)[1]).toBeLessThan(0); // the first wall's outside is away from the room
    expect(at(0, 0.5, 1, 0.1)).toBeCloseTo(0.1); // thick wall: only as far as the thin wall's outer face
    expect(at(1, 0.1, 0, 0.5, false)).toBeCloseTo(0.5); // thin wall: on to the thick wall's outer face
    expect(at(0, 0, 1, 0)).toBeCloseTo(0); // the room-side faces meet at the corner itself
  });

  it('at an inside corner the outer face stops short, by the other wall\'s thickness', () => {
    expect(at(2, 0.1, 3, 0.1)).toBeCloseTo(-0.1);
    expect(at(2, 0, 3, 0)).toBeCloseTo(0);
  });
});

describe('boxPicks', () => {
  const sq: Pt[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
  it('dragged right, takes only outlines wholly inside the box', () => {
    expect(boxPicks(sq, [-1, -1], [5, 5])).toBe(true);
    expect(boxPicks(sq, [-1, -1], [3, 5])).toBe(false);
  });
  it('dragged left, takes anything the box touches', () => {
    expect(boxPicks(sq, [3, 5], [-1, -1])).toBe(true); // overlaps a corner
    expect(boxPicks(sq, [3, 3], [1, 1])).toBe(true); // box inside the room
    expect(boxPicks(sq, [5, 2], [-1, 1])).toBe(true); // a band right across the room: no corner of either inside the other
    expect(boxPicks(sq, [9, 1], [6, 3])).toBe(false);
  });
});
