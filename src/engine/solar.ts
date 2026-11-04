import { clamp } from '../lib/util';
import type { Orient } from './data';

/** Sun position: sine of altitude and azimuth (radians from north, clockwise). `h` is solar time in hours. */
function sun(lat: number, doy: number, h: number) {
  const rad = Math.PI / 180;
  const dec = 23.45 * rad * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const H = (h - 12) * 15 * rad;
  const phi = lat * rad;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const cosAlt = Math.sqrt(Math.max(0, 1 - sinAlt * sinAlt));
  const cosAz = clamp((Math.sin(dec) - sinAlt * Math.sin(phi)) / (cosAlt * Math.cos(phi) || 1e-9), -1, 1);
  let az = Math.acos(cosAz);
  if (H > 0) az = 2 * Math.PI - az;
  return { sinAlt, cosAlt, az };
}

/** Beam, sky and ground-reflected irradiance on a surface (isotropic sky, 0.2 albedo), W/m². */
function onSurface(s: ReturnType<typeof sun>, dni: number, dhi: number, orient: Orient): number {
  const rad = Math.PI / 180, beta = orient.tilt * rad, ghi = dni * Math.max(0, s.sinAlt) + dhi;
  const cosT = s.sinAlt * Math.cos(beta) + s.cosAlt * Math.sin(beta) * Math.cos(s.az - orient.az * rad);
  return dni * Math.max(0, cosT) + (dhi * (1 + Math.cos(beta))) / 2 + (0.2 * ghi * (1 - Math.cos(beta))) / 2;
}

/**
 * Total irradiance (W/m²) on a surface from a simple clear-sky model scaled by
 * a clearness factor c (0 overcast .. 1 clear). Meinel direct-beam attenuation,
 * isotropic sky diffuse, 0.2 ground albedo. `h` is solar time in hours.
 */
export function solarAt(lat: number, doy: number, h: number, c: number, orient: Orient): number {
  const s = sun(lat, doy, h);
  if (s.sinAlt <= 0.01) return 0;
  const AM = Math.min(38, 1 / s.sinAlt);
  const dniClear = 1361 * Math.pow(0.7, Math.pow(AM, 0.678));
  const dni = dniClear * Math.pow(c, 1.3);
  const dhi = s.sinAlt * dniClear * (0.1 + 0.22 * (1 - c));
  return onSurface(s, dni, dhi, orient);
}

/** Irradiance on a surface from measured direct-normal and diffuse-horizontal values (weather files). */
export function solarFromData(lat: number, doy: number, h: number, dni: number, dhi: number, orient: Orient): number {
  if (dni <= 0 && dhi <= 0) return 0;
  const s = sun(lat, doy, h);
  return onSurface(s, s.sinAlt > 0.01 ? dni : 0, dhi, orient);
}
