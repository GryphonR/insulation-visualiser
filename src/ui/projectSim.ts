import { LOCATIONS } from '../engine/data';
import type { Scenario } from '../engine/scenario';
import type { HouseResult } from '../engine/house';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Simulation settings taken from the project: the nearest city, and a typical room built from the largest face that uses
 * this build-up (or the largest outside wall): its orientation, the room's size, setpoint and air changes, and its areas.
 */
export function projectDay(res: HouseResult, buildupId?: string, roof = false): { patch: Partial<Scenario>; note: string } | null {
  let best: { room: HouseResult['rooms'][number]; face: HouseResult['rooms'][number]['faces'][number] } | null = null;
  for (const room of res.rooms) {
    if (!room.room.heated) continue;
    for (const face of room.faces) {
      const fits = buildupId ? face.buildup.id === buildupId && (face.kind === 'wall' || face.kind === 'ceiling' || face.kind === 'floor') : face.kind === 'wall' && face.to.k === 'out';
      if (fits && (!best || face.area > best.face.area)) best = { room, face };
    }
  }
  if (!best) return null;
  const { room, face } = best;
  const outside = (f: typeof face) => (f.kind === 'wall' || f.kind === 'ceiling') && (f.to.k === 'out' || f.to.k === 'loft');
  const lat = res.climate.lat;
  const loc = LOCATIONS.reduce((a, l) => (Math.abs(l.lat - lat) < Math.abs(a.lat - lat) ? l : a));
  const glazed = room.faces.filter((f) => f.kind === 'window' && f.side === face.side).reduce((a, f) => a + f.area, 0);
  const rest = room.faces.filter((f) => f !== face && outside(f)).reduce((a, f) => a + f.area, 0);
  // A roof's pitch and facing: a slope or flat roof has its own; a ceiling to the loft takes the loft's sunniest slope.
  const isRoof = roof || face.kind === 'ceiling';
  const sunny = res.loft?.slopes.reduce<(typeof res.loft.slopes)[number] | null>((a, s) => (!a || Math.cos(((s.az - 180) * Math.PI) / 180) > Math.cos(((a.az - 180) * Math.PI) / 180) ? s : a), null);
  const tilt = face.to.k === 'loft' ? sunny?.tilt ?? 0 : face.tilt ?? 0, az = face.to.k === 'loft' ? sunny?.az : face.az;
  const patch: Partial<Scenario> = {
    loc: loc.id,
    orient: isRoof ? 'roof' : face.side ?? 'W',
    ...(isRoof ? { pitch: Math.round(tilt), az: tilt > 0 && az != null ? Math.round(az) : undefined } : { az: face.az != null ? Math.round(face.az) : undefined }),
    tin: clamp(room.room.setpoint, 10, 28), comfort: clamp(room.room.setpoint, 14, 28),
    floor: clamp(Math.round(room.area), 6, 60), elA: clamp(Math.round(face.area), 2, 60),
    glA: clamp(Math.round(glazed * 2) / 2, 0, 20), rest: clamp(Math.round(rest), 0, 100),
    ach: clamp(Math.round(room.n * 10) / 10, 0.1, 10),
  };
  return { patch, note: `${room.room.name}: ${face.label}, ${Math.round(face.area)} m², ${room.room.setpoint} °C, ${loc.name}` };
}
