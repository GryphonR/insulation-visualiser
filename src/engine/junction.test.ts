import { describe, expect, it } from 'vitest';
import { UPSTAND_PSI, buildupU, calcHouse, groundFloorU, junctionPsiOf } from './house';
import { defaultHouse } from './house-default';
import { field2d, solve } from './junction';
import type { JunctionInput, Rect } from './junction';

const h = defaultHouse();
const wall = h.buildups.find((b) => b.id === h.defaults.extWall)!, floor = h.buildups.find((b) => b.id === h.defaults.groundFloor)!;
const base: JunctionInput = { wall: wall.layers, floor: floor.layers, Uwall: buildupU(wall), Ufloor: groundFloorU(floor, 8), b: 4 };

describe('floor-to-wall junction Ψ from a 2-D model', () => {
  it('an insulated upstand lowers Ψ, a thicker one more, and an aircrete foundation lowers it too', () => {
    const none = solve(base).psi, thin = solve({ ...base, upstand: { mat: 'pir', t: 25 } }).psi, thick = solve({ ...base, upstand: { mat: 'pir', t: 50 } }).psi;
    expect(none).toBeGreaterThan(thin);
    expect(thin).toBeGreaterThan(thick);
    expect(solve({ ...base, footK: 0.15 }).psi).toBeLessThan(none);
    // A cavity wall and an insulated slab land well under SAP's default for an unchecked detail.
    expect(none).toBeGreaterThan(0);
    expect(none).toBeLessThan(UPSTAND_PSI.none);
  });

  it('the default grid is within 0.005 W/mK of a much finer one', () => {
    expect(Math.abs(solve(base).psi - solve(base, { fine: 0.005, grow: 0.2, max: 1 }).psi)).toBeLessThan(0.005);
  });

  it('the calculated Ψ goes into the ground-floor heat loss; a suspended floor takes the SAP default', () => {
    const off = calcHouse({ ...h, floorEdge: { edge: 'none', D: 0.6, R: 1.5, upstand: 'off', psi: 0 } });
    const x = { ...h, floorEdge: { edge: 'none' as const, D: 0.6, R: 1.5, upstand: 'calc' as const, psi: 0, upMat: 'pir', upT: 25 } };
    const on = calcHouse(x);
    expect(on.junctionPsi).toBeGreaterThan(0);
    const floorW = (r: typeof on) => r.rooms.reduce((a, q) => a + q.rows.filter((w) => w.kind === 'floor' && w.to === 'ground').reduce((b, w) => b + w.W, 0), 0);
    expect(floorW(on)).toBeGreaterThan(floorW(off));
    const sus = structuredClone(x);
    sus.buildups.find((b) => b.id === sus.defaults.groundFloor)!.floorType = 'suspended';
    expect(junctionPsiOf(sus, 8)).toBe(UPSTAND_PSI.none);
  });

  it('each outside wall gets the Ψ of its own build-up on the floor of its room, and the floor loss follows it', () => {
    const x = { ...h, floorEdge: { edge: 'none' as const, D: 0.6, R: 1.5, upstand: 'calc' as const, psi: 0, upMat: 'pir', upT: 25 } };
    const one = calcHouse(x);
    expect(one.junctions).toHaveLength(1);
    // Make one ground-floor room's outside walls solid brick instead of the insulated cavity.
    const y = structuredClone(x), room = one.rooms.find((r) => r.room.storey === 0 && r.faces.some((f) => f.kind === 'wall' && f.to.k === 'out'))!;
    for (const f of room.faces) if (f.kind === 'wall' && f.to.k === 'out' && f.key.startsWith('w:')) y.faceBuildup[f.key] = 'solid';
    const two = calcHouse(y);
    expect(two.junctions.map((j) => j.wall).sort()).toEqual(['Cavity wall, PIR filled', 'Solid brick, 225 mm']);
    const [cav, brick] = ['Cavity wall, PIR filled', 'Solid brick, 225 mm'].map((n) => two.junctions.find((j) => j.wall === n)!);
    expect(brick.psi).not.toBeCloseTo(cav.psi, 2);
    expect(cav.len + brick.len).toBeCloseTo(one.junctions[0].len, 6);
  });

  it('a foundation 0 m deep (wall on the ground) works, and a stone footing passes more heat than a brick one', () => {
    const none = solve({ ...base, footDepth: 0 }).psi;
    expect(Number.isFinite(none)).toBe(true);
    expect(solve({ ...base, footDepth: 0.3, footK: 2.3 }).psi).toBeGreaterThan(solve({ ...base, footDepth: 0.3, footK: 0.77 }).psi);
  });
});

describe('the 2-D solver against BS EN ISO 10211 test reference case 2', () => {
  // A 500 x 47.5 mm composite section: concrete over insulation with an aluminium L-section and a timber batten; 0 °C above
  // through 0.06 m²K/W, 20 °C below through 0.11; the sides adiabatic. The standard gives 9.5 W/m and these temperatures, ±0.1 K.
  const rects: Rect[] = [
    [0, 0.5, 0, 0.0415, 0.029], [0, 0.5, 0.0415, 0.0475, 1.15], [0, 0.015, 0.0365, 0.0415, 0.12],
    [0, 0.5, 0, 0.0015, 230], [0, 0.0015, 0, 0.0365, 230], [0, 0.015, 0.035, 0.0365, 230],
  ];
  const f = field2d({
    rects, kDefault: 0.029, grid: { fine: 0.0005, grow: 0.1, max: 0.005 }, focus: [0, 0.036],
    xb: [0, ...rects.flatMap((r) => [r[0], r[1]]), 0.5], yb: [0, ...rects.flatMap((r) => [r[2], r[3]]), 0.0475], inside: () => true,
    bc: (_x, _y, side, edge) => (!edge ? null : side === 'N' ? { T: 0, R: 0.06 } : side === 'S' ? { T: 20, R: 0.11 } : null),
  });

  it('total heat flow 9.5 W/m, within 0.1 W/m', () => {
    expect(Math.abs(f.flowIn((b) => b.T > 0) - 9.5)).toBeLessThan(0.1);
  });

  it('surface temperatures at A, B, H and I within 0.1 K', () => {
    expect(Math.abs(f.surfaceT(0, 0.0475, 'N') - 7.1)).toBeLessThan(0.1);
    expect(Math.abs(f.surfaceT(0.5, 0.0475, 'N') - 0.8)).toBeLessThan(0.1);
    expect(Math.abs(f.surfaceT(0, 0, 'S') - 16.8)).toBeLessThan(0.1);
    expect(Math.abs(f.surfaceT(0.5, 0, 'S') - 18.3)).toBeLessThan(0.1);
  });
});
