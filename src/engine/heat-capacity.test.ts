import { describe, expect, it } from 'vitest';
import { MAT } from './data';
import { roomKappa } from './heat-capacity';
import { calcHouse } from './house';
import { DEMOS } from './house-demos';
import { roomMass } from './house-sim';

const P: [string, number] = ['m_gypsum_1200', 13], LIME: [string, number] = ['m_cement_lime_plaster', 15];

describe('room-side heat capacity (ISO 13786)', () => {
  it('a very thick layer matches the semi-infinite solid: T/2π × √2 λ/δ', () => {
    const b = MAT.brick, T = 86400, delta = Math.sqrt((b.k! * T) / (Math.PI * b.rho * b.cp));
    expect(roomKappa([['brick', 1500]])).toBeCloseTo(((T / (2 * Math.PI)) * Math.SQRT2 * b.k!) / delta / 1000, 0);
  });

  it('a thin lining in front of insulation counts in full; mass behind the insulation hardly at all', () => {
    const pb = MAT.pb, full = (pb.rho * pb.cp * 0.0125) / 1000;
    // The board counts in full, plus part of the PIR's own small heat capacity.
    const lined = roomKappa([['pir', 50], ['pb', 12.5]]);
    expect(lined).toBeGreaterThan(full);
    expect(lined).toBeLessThan(full + (MAT.pir.rho * MAT.pir.cp * 0.05) / 1000);
    // 215 mm of brick behind 50 mm PIR adds under 2% of its own heat capacity.
    const behind = roomKappa([['brick', 215], ['pir', 50], ['pb', 12.5]]) - roomKappa([['pir', 50], ['pb', 12.5]]);
    expect(behind).toBeLessThan(0.02 * (MAT.brick.rho * MAT.brick.cp * 0.215) / 1000);
  });

  it('an uninsulated solid wall counts the brick the daily swing reaches, not just its plaster', () => {
    const k = roomKappa([['brick', 215], P]);
    expect(k).toBeGreaterThan(100);
    expect(k).toBeLessThan((MAT.brick.rho * MAT.brick.cp * 0.215) / 1000);
  });

  it('wood fibre adds some mass, more than PIR of the same thickness, and its depth beyond the swing adds nothing', () => {
    const wf60 = roomKappa([['brick', 215], ['wf', 60], LIME]), wf100 = roomKappa([['brick', 215], ['wf', 100], LIME]);
    const pir60 = roomKappa([['brick', 215], ['pir', 60], LIME]);
    expect(wf60).toBeGreaterThan(pir60 + 5);
    expect(wf100).toBeCloseTo(wf60, 0);
  });

  it('a ventilated gap cuts off everything outside it', () => {
    expect(roomKappa([['m_roof_tile_concrete', 15], ['vgap', 50], ['pb', 12.5]])).toBeCloseTo(roomKappa([['pb', 12.5]]), 3);
  });

  it('half of a shared element: a stud partition gives each room its board; a thick wall no more than one side sees', () => {
    const pb = MAT.pb;
    expect(roomKappa([['pb', 12.5], ['cavity', 75], ['pb', 12.5]], { half: true })).toBeCloseTo((pb.rho * pb.cp * 0.0125) / 1000, 0);
    expect(roomKappa([P, ['brick', 215], P], { half: true })).toBeLessThanOrEqual(roomKappa([P, ['brick', 215], P]) + 1);
  });

  it('demo homes: the stone cottage stores far more per m² of floor than the Passivhaus bedrooms', () => {
    const per = (id: string, pick: (name: string) => boolean) => {
      const rooms = calcHouse(DEMOS.find((d) => d.id === id)!.make().scenarios[0].house).rooms.filter((r) => pick(r.room.name));
      return rooms.reduce((t, r) => t + roomMass(r).Cm, 0) / rooms.reduce((t, r) => t + r.area * r.room.span, 0) / 1000;
    };
    expect(per('cottage', () => true)).toBeGreaterThan(2 * per('passivhaus', (n) => n.startsWith('Bedroom')));
  });
});
