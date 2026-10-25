// Plan geometry for rooms of any shape: polygons in metres, x east, y south.
export type Pt = [number, number];

/** Signed shoelace area (positive when the corners run clockwise on the plan, i.e. x east, y south). */
export const signedArea = (p: Pt[]) => p.reduce((a, q, i) => { const n = p[(i + 1) % p.length]; return a + q[0] * n[1] - n[0] * q[1]; }, 0) / 2;
export const polyArea = (p: Pt[]) => Math.abs(signedArea(p));

export function centroid(p: Pt[]): Pt {
  const A = signedArea(p);
  if (Math.abs(A) < 1e-9) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  let cx = 0, cy = 0;
  p.forEach((q, i) => { const n = p[(i + 1) % p.length], c = q[0] * n[1] - n[0] * q[1]; cx += (q[0] + n[0]) * c; cy += (q[1] + n[1]) * c; });
  return [cx / (6 * A), cy / (6 * A)];
}

export interface Edge { a: Pt; b: Pt; len: number; /** Unit direction a → b. */ d: Pt; /** Outward unit normal. */ n: Pt; /** Compass bearing of the outward normal, degrees from north. */ az: number }

export function edges(p: Pt[]): Edge[] {
  const s = Math.sign(signedArea(p)) || 1;
  return p.map((a, i) => {
    const b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const d: Pt = [dx / len, dy / len], n: Pt = [s * d[1], -s * d[0]];
    // North is −y on the plan.
    const az = ((Math.atan2(n[0], -n[1]) * 180) / Math.PI + 360) % 360;
    return { a, b, len: Math.hypot(dx, dy), d, n, az };
  });
}

export const compass = (az: number): 'N' | 'E' | 'S' | 'W' => (['N', 'E', 'S', 'W'] as const)[Math.round(az / 90) % 4];

/** Stretch of edge e (as [t0, t1] along it, metres from e.a) that lies against edge f running the other way. */
export function sharedSpan(e: Edge, f: Edge, tol = 0.02): [number, number] | null {
  if (e.d[0] * f.d[0] + e.d[1] * f.d[1] > -0.999) return null; // not anti-parallel
  const off = (q: Pt) => Math.abs((q[0] - e.a[0]) * e.n[0] + (q[1] - e.a[1]) * e.n[1]);
  if (off(f.a) > tol || off(f.b) > tol) return null; // not on the same line
  const t = (q: Pt) => (q[0] - e.a[0]) * e.d[0] + (q[1] - e.a[1]) * e.d[1];
  const t0 = Math.max(0, Math.min(t(f.a), t(f.b))), t1 = Math.min(e.len, Math.max(t(f.a), t(f.b)));
  return t1 - t0 > 1e-6 ? [t0, t1] : null;
}

/** Ear-clipping triangulation of a simple polygon. */
export function triangulate(p: Pt[]): Array<[Pt, Pt, Pt]> {
  const pts = signedArea(p) > 0 ? [...p] : [...p].reverse();
  const out: Array<[Pt, Pt, Pt]> = [];
  const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (q: Pt, a: Pt, b: Pt, c: Pt) => cross(a, b, q) >= -1e-12 && cross(b, c, q) >= -1e-12 && cross(c, a, q) >= -1e-12;
  let guard = 0;
  while (pts.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if (cross(a, b, c) <= 1e-12) continue; // reflex or flat corner
      if (pts.some((q) => q !== a && q !== b && q !== c && inside(q, a, b, c))) continue;
      out.push([a, b, c]);
      pts.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break; // degenerate input: stop rather than loop
  }
  if (pts.length === 3) out.push([pts[0], pts[1], pts[2]]);
  return out;
}

/** Sutherland–Hodgman: subject polygon clipped by a convex polygon (both positive orientation). */
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], inp = out;
    const side = (q: Pt) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
  }
  return out;
}

/** Area shared by two simple polygons (via their triangles). */
export function overlapAreaPoly(p: Pt[], q: Pt[]): number {
  const box = (x: Pt[]) => [Math.min(...x.map((v) => v[0])), Math.min(...x.map((v) => v[1])), Math.max(...x.map((v) => v[0])), Math.max(...x.map((v) => v[1]))];
  const A = box(p), B = box(q);
  if (A[2] <= B[0] || B[2] <= A[0] || A[3] <= B[1] || B[3] <= A[1]) return 0;
  const tp = triangulate(p), tq = triangulate(q);
  let s = 0;
  for (const t of tp) for (const u of tq) { const c = clipConvex(t, u); if (c.length >= 3) s += polyArea(c); }
  return s;
}

/** True if the polygon's edges cross each other (not a simple polygon). */
export function selfIntersects(p: Pt[]): boolean {
  const seg = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const o = (p1: Pt, p2: Pt, p3: Pt) => Math.sign((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) {
    if (i === 0 && j === p.length - 1) continue;
    if (seg(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])) return true;
  }
  return false;
}
