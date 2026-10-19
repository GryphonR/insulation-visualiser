import { clamp } from '../lib/util';
import type { Orient } from './data';

/**
 * Total irradiance (W/m²) on a surface from a simple clear-sky model scaled by
 * a clearness factor c (0 overcast .. 1 clear). Meinel direct-beam attenuation,
 * isotropic sky diffuse, 0.2 ground albedo. `h` is solar time in hours.
 */
export function solarAt(lat: number, doy: number, h: number, c: number, orient: Orient): number {
  const rad = Math.PI / 180;
  const dec = 23.45 * rad * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const H = (h - 12) * 15 * rad;
  const phi = lat * rad;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  if (sinAlt <= 0.01) return 0;
  const cosAlt = Math.sqrt(1 - sinAlt * sinAlt);
  const cosAz = clamp((Math.sin(dec) - sinAlt * Math.sin(phi)) / (cosAlt * Math.cos(phi)), -1, 1);
  let az = Math.acos(cosAz);
  if (H > 0) az = 2 * Math.PI - az;
  const AM = Math.min(38, 1 / sinAlt);
  const dniClear = 1361 * Math.pow(0.7, Math.pow(AM, 0.678));
  const dni = dniClear * Math.pow(c, 1.3);
  const dhi = sinAlt * dniClear * (0.1 + 0.22 * (1 - c));
  const ghi = dni * sinAlt + dhi;
  const beta = orient.tilt * rad;
  const cosT = orient.id === 'roof' ? sinAlt : cosAlt * Math.cos(az - orient.az * rad);
  return dni * Math.max(0, cosT) + (dhi * (1 + Math.cos(beta))) / 2 + (0.2 * ghi * (1 - Math.cos(beta))) / 2;
}
