import { describe, expect, it } from 'vitest';
import { defaultHouse } from './house-default';
import { calcHouse } from './house';
import { roomSchedule, scheduleSource } from './house-heating';

describe('which schedule heats a room', () => {
  const h = defaultHouse();
  const withEm = h.rooms.filter((r) => r.heated && h.heating.emitters.some((e) => e.room === r.id));
  const bed = withEm.find((r) => r.type === 'bedroom')!, liv = withEm.find((r) => r.type === 'living')!;

  it('follows the occupancy row for its type while its zone has no hours of its own', () => {
    const plain = structuredClone(h);
    plain.heating.zones.forEach((z) => { z.on = true; z.hours = null; });
    expect(scheduleSource(plain, bed).kind).toBe('bedrooms');
    expect(scheduleSource(plain, liv).kind).toBe('living');
    expect(roomSchedule(plain, liv)).toBe(plain.gains.living);
  });

  it('zone hours override the row, a switched-off zone and a missing emitter heat nothing', () => {
    const x = structuredClone(h), e = x.heating.emitters.find((q) => q.room === liv.id)!;
    const z = x.heating.zones.find((q) => q.id === e.zone)!;
    z.on = true; z.hours = Array(24).fill(1);
    expect(scheduleSource(x, liv)).toMatchObject({ kind: 'zone', zone: z });
    expect(roomSchedule(x, liv)).toEqual(Array(24).fill(1));
    z.on = false;
    expect(scheduleSource(x, liv).kind).toBe('off');
    expect(roomSchedule(x, liv)).toEqual(Array(24).fill(0));
    x.heating.emitters = x.heating.emitters.filter((q) => q.room !== liv.id);
    expect(scheduleSource(x, liv).kind).toBe('none');
    expect(roomSchedule(x, liv)).toBeNull();
  });

  it('the model checks name a heated room the runs give no heat', () => {
    const x = structuredClone(h), z = x.heating.zones.find((q) => q.id === x.heating.emitters.find((e) => e.room === liv.id)!.zone)!;
    z.on = false;
    expect(calcHouse(x).checks.some((c) => c.text.startsWith(`Heating zone “${z.name}” is switched off`) && c.text.includes(liv.name))).toBe(true);
    x.heating.emitters = x.heating.emitters.filter((e) => e.room !== liv.id);
    expect(calcHouse(x).checks.some((c) => c.text.startsWith(`${liv.name} is set as heated but has no emitter`))).toBe(true);
  });
});
