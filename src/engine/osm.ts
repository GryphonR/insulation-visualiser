// A house's footprint from OpenStreetMap building outlines (© OpenStreetMap contributors, ODbL), via the Overpass API.
import { pointInPoly, signedArea } from './geom';
import type { Pt } from './geom';

export type LatLon = [number, number];
const M_PER_DEG = 111320;

/** "52.1987, 0.1435" (as copied from a right-click in most online maps) to [lat, lon]; null if it isn't one. */
export function parseLatLon(s: string): LatLon | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

/** Metres east and south of `ref`. */
const toLocal = (ref: LatLon, [lat, lon]: LatLon): Pt => [(lon - ref[1]) * M_PER_DEG * Math.cos((ref[0] * Math.PI) / 180), -(lat - ref[0]) * M_PER_DEG];

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Overpass `out geom` ways: the building the point is inside, else the nearest within `max` metres. */
export function pickBuilding(elements: Array<{ type: string; geometry?: Array<{ lat: number; lon: number }> }>, at: LatLon, max = 30): LatLon[] | null {
  // shortcut: plain ways only; buildings mapped as multipolygon relations (rare for houses) are skipped.
  const rings = elements.filter((e) => e.type === 'way' && (e.geometry?.length ?? 0) >= 4).map((e) => e.geometry!.map((g): LatLon => [g.lat, g.lon]));
  let best: LatLon[] | null = null, bestD = max;
  for (const r of rings) {
    const loc = r.map((q) => toLocal(at, q));
    if (pointInPoly([0, 0], loc)) return r;
    const d = Math.min(...loc.map((q, i) => segDist([0, 0], q, loc[(i + 1) % loc.length])));
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/** Drop the closing point and corners that sit within 0.1 m of a straight line. */
function simplify(p: Pt[]): Pt[] {
  let q = p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-6 ? p.slice(0, -1) : [...p];
  for (let i = 0; q.length > 3 && i < q.length;) {
    const a = q[(i + q.length - 1) % q.length], b = q[(i + 1) % q.length];
    if (segDist(q[i], a, b) < 0.1) q = q.filter((_, j) => j !== i); else i++;
  }
  return q;
}

export interface Footprint {
  /** Plan outline in metres (x right, y down), corners clockwise on the plan, its bounding box starting at (0, 0). */
  poly: Pt[];
  /** Bearing of "up" on the plan that squares the longest wall to the plan. */
  north: number;
  /** Latitude and longitude of plan (0, 0), for lining up satellite imagery. */
  origin: LatLon;
}

/** A building ring as a plan outline. With `north` given the plan keeps that turn; otherwise the longest wall sets it. */
export function footprintToPlan(ring: LatLon[], north?: number): Footprint {
  const ref = ring[0], w = simplify(ring.map((q) => toLocal(ref, q)));
  if (north == null) {
    let L = 0, phi = 0;
    w.forEach((a, i) => { const b = w[(i + 1) % w.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > L) { L = l; phi = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; } });
    north = +((((phi % 90) + 135) % 90) - 45).toFixed(1); // into (-45, 45]
  }
  const a = (north * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // Inverse of planToWorld: ground metres east and south to plan metres.
  let p = w.map(([x, y]): Pt => [x * c + y * s, -x * s + y * c]);
  const x0 = Math.min(...p.map((q) => q[0])), y0 = Math.min(...p.map((q) => q[1]));
  p = p.map(([x, y]): Pt => [+(x - x0).toFixed(3), +(y - y0).toFixed(3)]);
  if (signedArea(p) < 0) p.reverse();
  const e = x0 * c - y0 * s, so = x0 * s + y0 * c; // plan (0, 0) on the ground, east and south of ref
  return { poly: p, north, origin: [ref[0] - so / M_PER_DEG, ref[1] + e / (M_PER_DEG * Math.cos((ref[0] * Math.PI) / 180))] };
}

// Public Overpass servers, tried in turn: they are often busy. Each one receives the point looked up, so the privacy page
// names them all: change both together.
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

/** The outline of the building at `at`, or an Error saying why not. */
export async function fetchFootprint(at: LatLon): Promise<LatLon[]> {
  const q = `[out:json][timeout:25];way(around:40,${at[0]},${at[1]})["building"];out geom;`;
  let ring: LatLon[] | null = null, reached = false, empty = false;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(30000) });
      reached = true;
      if (!r.ok) continue;
      // A busy server can answer 200 with no elements and a "runtime error" remark, so only a clean answer means nothing is there.
      const j: { elements?: []; remark?: string } = await r.json();
      ring = pickBuilding(j.elements ?? [], at);
      if (ring) break;
      if (!j.remark) empty = true;
    } catch { /* timed out, unreachable or not JSON: try the next */ }
  }
  if (!ring && !empty) throw new Error(reached ? "OpenStreetMap's map servers are busy. Try again in a minute." : "Couldn't reach OpenStreetMap. Check the connection and try again.");
  if (!ring) throw new Error('No building is mapped at that point on OpenStreetMap. Check the latitude and longitude, or draw the outline yourself.');
  return ring;
}
