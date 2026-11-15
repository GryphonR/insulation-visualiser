// Heat a build-up stores and gives back to the room over a daily cycle: ISO 13786 areal heat capacity.
// Each layer's conductivity, density and heat capacity set how far a 24 h swing reaches into it, so mass
// behind insulation drops out and mass inside low-conductivity layers (wood fibre) counts in part,
// with no rule about which layer is "the insulation".
import { MAT } from './data';

type C = [number, number];
type M = [C, C, C, C]; // Z11, Z12, Z21, Z22
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const abs = (a: C) => Math.hypot(a[0], a[1]);
const mm = (A: M, B: M): M => [
  add(mul(A[0], B[0]), mul(A[1], B[2])), add(mul(A[0], B[1]), mul(A[1], B[3])),
  add(mul(A[2], B[0]), mul(A[3], B[2])), add(mul(A[2], B[1]), mul(A[3], B[3])),
];
const resistance = (R: number): M => [[1, 0], [-R, 0], [0, 0], [1, 0]];
const PERIOD = 86400;

function layerMatrix(id: string, t: number): M {
  const m = MAT[id], d = t / 1000;
  if (!m || d <= 0) return resistance(0);
  if (m.R != null) return resistance(m.R); // a fixed-resistance air layer, as in the wall run
  const lam = m.k!, delta = Math.sqrt((lam * PERIOD) / (Math.PI * m.rho * m.cp)), x = d / delta;
  const sh = Math.sinh(x), ch = Math.cosh(x), s = Math.sin(x), c = Math.cos(x), a = delta / (2 * lam), b = lam / delta;
  return [[ch * c, sh * s], [-a * (sh * c + ch * s), -a * (ch * s - sh * c)], [-b * (sh * c - ch * s), -b * (sh * c + ch * s)], [ch * c, sh * s]];
}

/**
 * Areal heat capacity seen from the room over a 24 h cycle, kJ/m²K. Layers [material id, mm] run outside → room.
 * The room-side surface film is left out: the house run models that link itself (9.1 W/m²K).
 * rse: the far-side film. half: an element shared with another heated room, cut at its middle where no heat
 * crosses (both rooms swing together), so each room counts only its own half.
 */
export function roomKappa(layers: Array<[string, number]>, opts: { rse?: number; half?: boolean } = {}): number {
  let ls = [...layers].reverse();
  // A ventilated gap ties everything beyond it to outdoor air.
  const v = ls.findIndex(([id]) => MAT[id]?.vent);
  if (v >= 0) ls = ls.slice(0, v);
  if (opts.half) {
    let left = ls.reduce((t, [, d]) => t + d, 0) / 2;
    const cut: Array<[string, number]> = [];
    for (const [id, d] of ls) { if (left <= 0) break; cut.push([id, Math.min(d, left)]); left -= d; }
    ls = cut;
  }
  let Z = resistance(0);
  for (const [id, t] of ls) Z = mm(layerMatrix(id, t), Z);
  // Adiabatic far face: the room sees Z21/Z22; otherwise the far side holds steady behind its film.
  if (opts.half) return (PERIOD / (2 * Math.PI)) * abs(Z[2]) / abs(Z[3]) / 1000;
  Z = mm(resistance(opts.rse ?? 0.04), Z);
  const z12 = abs(Z[1]);
  return z12 > 0 ? (PERIOD / (2 * Math.PI)) * abs([Z[0][0] - 1, Z[0][1]]) / z12 / 1000 : 0;
}
