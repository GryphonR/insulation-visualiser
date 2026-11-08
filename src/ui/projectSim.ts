import { MEAN } from '../engine/data';
import { clamp } from '../lib/util';
import type { Scenario } from '../engine/scenario';
import type { HouseResult } from '../engine/house';


/**
 * Simulation settings taken from the project: the house's own site (latitude, and its region's temperatures as the house's
 * typical year uses them), and a typical room built from the largest face that uses
 * this build-up (or the largest outside wall): its orientation, the room's size, setpoint and air changes, and its areas.
 */
/** `flip`: the face is a ceiling, so the build-up's layers (listed bottom to top) go in top first, the far side being the room above. */
export function projectDay(res: HouseResult, buildupId?: string, roof = false, floor = false): { patch: Partial<Scenario>; note: string; flip: boolean } | null {
  let best: { room: HouseResult['rooms'][number]; face: HouseResult['rooms'][number]['faces'][number] } | null = null;
  for (const room of res.rooms) {
    if (!room.room.heated) continue;
    for (const face of room.faces) {
      // A floor (by id, or any library floor) is looked for on the ground; otherwise the build-up's own faces, or the largest outside wall.
      const fits = floor && !buildupId ? face.kind === 'floor' && face.to.k === 'ground'
        : buildupId ? face.buildup.id === buildupId && (face.kind === 'wall' || face.kind === 'ceiling' || face.kind === 'floor') : face.kind === 'wall' && face.to.k === 'out';
      if (fits && (!best || face.area > best.face.area)) best = { room, face };
    }
  }
  if (!best) return null;
  const { room, face } = best;
  const outside = (f: typeof face) => (f.kind === 'wall' || f.kind === 'ceiling') && (f.to.k === 'out' || f.to.k === 'loft');
  // Monthly means are a UK average; the region's annual mean shifts them, as in the house's synthetic year.
  const site = { id: 'house', name: `This house (${res.station})`, lat: res.climate.lat, dT: Math.round((res.Tg - MEAN.reduce((a, b) => a + b, 0) / 12) * 10) / 10 };
  const glazed = room.faces.filter((f) => f.kind === 'window' && f.side === face.side).reduce((a, f) => a + f.area, 0);
  const rest = room.faces.filter((f) => f !== face && outside(f)).reduce((a, f) => a + f.area, 0);
  // A roof's pitch and facing: a slope or flat roof has its own; a ceiling to the loft takes the loft's sunniest slope.
  // A floor or ceiling between two rooms faces that room; any other ceiling is under a roof or loft.
  const between = face.to.k === 'room' && (face.kind === 'floor' || face.kind === 'ceiling');
  const next = face.to.k === 'room' ? res.rooms.find((r) => r.room.id === (face.to as { id: string }).id) : undefined;
  const isRoof = !between && (roof || face.kind === 'ceiling');
  const sunny = res.loft?.slopes.reduce<(typeof res.loft.slopes)[number] | null>((a, s) => (!a || Math.cos(((s.az - 180) * Math.PI) / 180) > Math.cos(((a.az - 180) * Math.PI) / 180) ? s : a), null);
  const tilt = face.to.k === 'loft' ? sunny?.tilt ?? 0 : face.tilt ?? 0, az = face.to.k === 'loft' ? sunny?.az : face.az;
  // The house's own floor on the ground keeps its BS EN ISO 13370 U-value (its size and edge) and type; a library floor is a typical slab.
  // Between rooms, the other room is held at its design-day temperature.
  const isFloor = face.kind === 'floor', isCeiling = between && face.kind === 'ceiling', own = !!buildupId && face.to.k === 'ground';
  const floorPatch: Partial<Scenario> = between
    ? { under: isFloor ? 'room' : undefined, otherT: next ? Math.round(next.T * 10) / 10 : 18, floorU: undefined }
    : isFloor ? { under: own && face.buildup.floorType === 'suspended' ? 'void' : 'ground', floorU: own ? +face.U.toFixed(3) : undefined, otherT: undefined } : {};
  const patch: Partial<Scenario> = {
    loc: 'house', site,
    ...floorPatch,
    orient: isCeiling ? 'ceiling' : isFloor ? 'floor' : isRoof ? 'roof' : face.side ?? 'W',
    ...(isRoof ? { pitch: Math.round(tilt), az: tilt > 0 && az != null ? Math.round(az) : undefined } : { az: face.az != null ? Math.round(face.az) : undefined }),
    tin: clamp(room.room.setpoint, 10, 28), comfort: clamp(room.room.setpoint, 14, 28),
    floor: clamp(Math.round(room.area), 6, 60), elA: clamp(Math.round(face.area), 2, 60),
    glA: clamp(Math.round(glazed * 2) / 2, 0, 20), rest: clamp(Math.round(rest), 0, 100),
    ach: clamp(Math.round(room.n * 10) / 10, 0.1, 10),
  };
  const beside = next ? `, ${next.room.name} ${isCeiling ? 'above' : 'below'} at ${Math.round(next.T * 10) / 10} °C` : '';
  return { patch, note: `${room.room.name}: ${face.label}, ${Math.round(face.area)} m², ${room.room.setpoint} °C${beside}, ${res.station}`, flip: isCeiling };
}
