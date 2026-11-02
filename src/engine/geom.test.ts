import { describe, expect, it } from 'vitest';
import { centroid, compass, dropSpikes, edges, overlapAreaPoly, polyArea, selfIntersects, sharedSpan, triangulate } from './geom';
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
