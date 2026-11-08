import { describe, expect, it } from 'vitest';
import { calcHouse, groundFloorU } from './house';
import type { Buildup, House } from './house';
import { defaultHouse } from './house-default';
import { solarAt } from './solar';
import { ORIENTS } from './data';

const o = (az: number, tilt: number) => ({ id: 'x', name: '', label: '', az, tilt });

describe('sun on tilted surfaces', () => {
  it('flat and vertical surfaces give the same as before', () => {
    const flat = ORIENTS.find((x) => x.id === 'roof')!;
    // Flat: independent of the bearing; vertical south at noon in June: beam × cos(altitude).
    expect(solarAt(53, 172, 12, 0.8, flat)).toBeCloseTo(solarAt(53, 172, 12, 0.8, o(90, 0)), 6);
    expect(solarAt(53, 172, 12, 0.8, o(180, 90))).toBeCloseTo(solarAt(53, 172, 12, 0.8, ORIENTS.find((x) => x.id === 'S')!), 6);
  });
  it('a south slope in winter catches more than flat, a north slope less', () => {
    const s = solarAt(53, 21, 12, 0.9, o(180, 35)), f = solarAt(53, 21, 12, 0.9, o(0, 0)), n = solarAt(53, 21, 12, 0.9, o(0, 35));
    expect(s).toBeGreaterThan(f);
    expect(f).toBeGreaterThan(n);
  });
});

describe('north on the plan', () => {
  const a = defaultHouse(), b = structuredClone(a);
  b.north = 90;
  const ra = calcHouse(a), rb = calcHouse(b);
  it('keeps every face and turns its bearing', () => {
    const fa = ra.rooms.flatMap((r) => r.faces), fb = rb.rooms.flatMap((r) => r.faces);
    expect(fb.map((f) => f.key)).toEqual(fa.map((f) => f.key));
    fa.forEach((f, i) => { if (f.az != null) expect(fb[i].az).toBeCloseTo((f.az + 90) % 360, 6); });
  });
  it('leaves the design heat loss alone (no sun on the design day)', () => {
    expect(rb.peakW).toBeCloseTo(ra.peakW, 6);
  });
});

describe('floor edge', () => {
  const slab: Buildup = { id: 's', name: 'slab', kind: 'floor', layers: [['m_concrete_reinforced', 100]] };
  it('edge insulation lowers a slab U, vertical (2D) more than horizontal of the same size', () => {
    const U0 = groundFloorU(slab, 5);
    const Uh = groundFloorU(slab, 5, 0, { edge: 'horizontal', D: 1, R: 2, upstand: 'off', psi: 0 });
    const Uv = groundFloorU(slab, 5, 0, { edge: 'vertical', D: 1, R: 2, upstand: 'off', psi: 0 });
    expect(Uh).toBeLessThan(U0);
    expect(Uv).toBeLessThan(Uh);
    expect(U0 - Uh).toBeLessThan(0.3 * U0);
  });
  it('the upstand junction adds Ψ × the outside wall length on the ground floor', () => {
    const a = defaultHouse();
    a.buildups.find((x) => x.id === a.defaults.groundFloor)!.floorType = 'solid';
    const b = structuredClone(a);
    b.floorEdge = { edge: 'none', D: 0, R: 0, upstand: 'none', psi: 0 };
    const UA = (h: House) => calcHouse(h).rooms.flatMap((r) => r.faces).filter((f) => f.kind === 'floor' && f.to.k === 'ground').reduce((t, f) => t + f.U * f.area, 0);
    const P = calcHouse(a).rooms.filter((r) => r.room.storey === 0).flatMap((r) => r.faces)
      .filter((f) => f.kind === 'wall' && f.to.k === 'out' && f.key.startsWith('w:') && f.key.endsWith(':0')).reduce((t, f) => t + (f.len ?? 0), 0);
    expect(P).toBeGreaterThan(5);
    expect(UA(b) - UA(a)).toBeCloseTo(0.32 * P, 6);
  });
});
