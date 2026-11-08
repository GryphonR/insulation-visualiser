// The house as triangles for a 3D view: rooms (floors, walls, ceilings, each tagged with its heat-loss face), the outside
// shell, the roofs, windows, doors and dormers. Coordinates: X = plan x (east), Y = height, Z = plan y (south); metres.
import { ceilingCap, extWallThickness, onStorey, pairKey, placeDormer, roofOver, roofParts, roomEdges, roomPoly } from './house';
import type { House, Room } from './house';
import { wallPieces } from './house-draw';
import { footprint, roofAt } from './house-roof';
import { edges, pointInPoly, triangulate } from './geom';
import type { Pt } from './geom';

export type Kind3 = 'floor' | 'wall' | 'outwall' | 'ceiling' | 'shell' | 'roof' | 'flat' | 'window' | 'door' | 'dormer';
/**
 * One surface: its triangles (x, y, z per corner), the storey it belongs to, and for room surfaces the room and the face key
 * its colour comes from (a heat-loss face key, or `floor:<room>` / `ceil:<room>` for a room's floors or flat ceilings together).
 * Windows and doors come on both faces of the shell (`outer`) and on both faces of the room's own wall.
 * An `outwall` is a room's stretch of outside wall drawn on the outside face of the house, to colour the house by room from outside.
 */
export interface Surf { kind: Kind3; tris: number[]; storey: number; room?: string; key?: string; label: string; outer?: boolean }

/** Floor level of each storey, m (ground floor at 0; a basement below it). */
export function storeyZ(h: Pick<House, 'storeys'>): number[] {
  const z: number[] = [];
  let at = h.storeys[0]?.below ? -(h.storeys[0].h + h.storeys[0].zone) : 0;
  h.storeys.forEach((s, i) => { z[i] = at; at += s.h + (i < h.storeys.length - 1 ? s.zone : 0); });
  return z;
}

const top = (r: Room) => r.storey + r.span - 1;
/** How far a room's walls are drawn inside its outline, m. */
const WALL_IN = 0.01;
/** How far a room's outside-wall patch sits proud of the shell, m (windows sit further out still). */
const OUT_PROUD = 0.008;
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
type Tri = [Pt, Pt, Pt];
/** Split triangles until no edge is longer than L (each split into four), so a height field can follow a roof. */
function refine(ts: Tri[], L: number): Tri[] {
  const out: Tri[] = [];
  const go = (t: Tri, depth: number) => {
    const [a, b, c] = t, m = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (m <= L || depth > 7) { out.push(t); return; }
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    for (const x of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] as Tri[]) go(x, depth + 1);
  };
  ts.forEach((t) => go(t, 0));
  return out;
}

/** A height field over an outline, grouped by what each small triangle is (its key); null keys are left out. */
function field(poly: Pt[], L: number, at: (p: Pt) => { z: number; key: string | null }, push: (key: string, tri: number[]) => void) {
  for (const t of refine(triangulate(poly), L)) {
    const c: Pt = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3], k = at(c).key;
    if (k == null) continue;
    push(k, t.flatMap((p) => [p[0], at(p).z, p[1]]));
  }
}

/** A vertical strip along a plan segment, bottom and top heights sampled every ~0.25 m. */
function strip(a: Pt, b: Pt, bottom: (p: Pt) => number, topZ: (p: Pt) => number): number[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 0.25)), out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p: Pt = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n], q: Pt = [a[0] + ((b[0] - a[0]) * (i + 1)) / n, a[1] + ((b[1] - a[1]) * (i + 1)) / n];
    const p0 = bottom(p), q0 = bottom(q), p1 = Math.max(p0, topZ(p)), q1 = Math.max(q0, topZ(q));
    out.push(p[0], p0, p[1], q[0], q0, q[1], q[0], q1, q[1], p[0], p0, p[1], q[0], q1, q[1], p[0], p1, p[1]);
  }
  return out;
}
const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]) => [...a, ...b, ...c, ...a, ...c, ...d];

export function house3d(h: House): Surf[] {
  const Z = storeyZ(h), last = h.storeys.length - 1, parts = roofParts(h), wallT = extWallThickness(h), out: Surf[] = [];
  const add = (s: Surf) => { if (s.tris.length) out.push(s); };
  const on = (s: number) => parts.filter((p) => p.storey === s);
  const grouped = (kind: Kind3, storey: number, label: (k: string) => string, room?: string) => {
    const m = new Map<string, number[]>();
    return {
      push: (k: string, t: number[]) => { const a = m.get(k) ?? m.set(k, []).get(k)!; for (const v of t) a.push(v); },
      done: () => m.forEach((tris, key) => add({ kind, tris, storey, room, key, label: label(key) })),
    };
  };

  // Rooms: floors, walls (piece by piece, so each takes its own face), ceilings following any roof over them.
  for (const r of h.rooms) {
    const poly = roomPoly(r), t = top(r), st = h.storeys[t];
    if (!st) continue;
    const zt = Z[t], cap = ceilingCap(h, r), flatH = Number.isFinite(cap) ? cap : st.h, mine = on(t);
    const above = t < last ? h.rooms.filter((o) => o.id !== r.id && onStorey(o, t + 1)).map(roomPoly) : [];
    // Ceiling height above the top storey's floor, and the face it belongs to.
    const ceil = (p: Pt): { z: number; key: string } => {
      if (above.some((q) => pointInPoly(p, q))) return { z: st.h, key: `ceil:${r.id}` };
      const R = mine.length ? roofOver(mine, p) : null;
      if (!R || R.z - cap > 0.05 || R.i < 0) return { z: R && R.i < 0 ? Math.min(flatH, R.z) : flatH, key: `ceil:${r.id}` };
      return { z: Math.max(0, Math.min(cap, R.z)), key: `sl:${r.id}:${R.part.key}:${R.i}` };
    };
    add({ kind: 'floor', tris: triangulate(poly).flatMap((tr) => tr.flatMap((p) => [p[0], Z[r.storey], p[1]])), storey: r.storey, room: r.id, key: `floor:${r.id}`, label: `${r.name} floor` });
    const cg = grouped('ceiling', t, (k) => (k.startsWith('sl:') ? `${r.name} sloping ceiling` : `${r.name} ceiling`), r.id);
    field(poly, mine.length ? 0.15 : 1e9, (p) => { const c = ceil(p); return { z: zt + c.z, key: c.key }; }, cg.push);
    cg.done();
    const es = roomEdges(r);
    es.forEach((e) => {
      for (let s = r.storey; s <= t; s++) {
        for (const pc of wallPieces(h, r.id, e.idx, s)) {
          // Each room's wall sits 1 cm inside its own line, so two rooms sharing a wall never draw on the same plane (they would flicker).
          const at = (u: number): Pt => [e.a[0] + e.d[0] * u - e.n[0] * WALL_IN, e.a[1] + e.d[1] * u - e.n[1] * WALL_IN];
          const a = at(pc.span[0]), b = at(pc.span[1]);
          const topZ = s < t ? () => Z[s + 1] : (p: Pt) => zt + ceil([p[0] - e.n[0] * 0.01, p[1] - e.n[1] * 0.01]).z;
          const key = pc.other ? `iw:${pairKey(r.id, pc.other)}:${s}` : `w:${r.id}:${e.id}:${s}`;
          add({ kind: 'wall', tris: strip(a, b, () => Z[s], topZ), storey: s, room: r.id, key, label: `${r.name} ${pc.other ? 'inside' : 'outside'} wall` });
          if (pc.other) continue;
          // The same stretch on the outside face of the wall, just proud of the shell, so it can take the room's colour: up through the
          // floor zone, or to the roof where that comes lower (a loft gable above the room's ceiling stays the shell's).
          const ss = h.storeys[s], roofs = on(s), full = Z[s] + ss.h + (s < last ? ss.zone : 0), off = wallT + OUT_PROUD;
          const ou = (u: number): Pt => [e.a[0] + e.d[0] * u + e.n[0] * off, e.a[1] + e.d[1] * u + e.n[1] * off];
          const outTop = (p: Pt) => { const R = roofs.length ? roofOver(roofs, [p[0] - e.n[0] * (off - 0.05), p[1] - e.n[1] * (off - 0.05)]) : null; return R ? Math.min(full, Z[s] + R.z) : full; };
          // At an outside corner of the house both walls run on round the corner, so the colour meets with no gap.
          const n = es.length, prev = es[(e.idx + n - 1) % n], next = es[(e.idx + 1) % n];
          const outsideEnd = (k: number, atStart: boolean) => wallPieces(h, r.id, k, s).some((p) => !p.other && (atStart ? p.span[0] < 1e-6 : p.span[1] > es[k].len - 1e-6));
          const u0 = pc.span[0] < 1e-6 && prev.d[0] * e.n[0] + prev.d[1] * e.n[1] > 0.5 && outsideEnd(prev.idx, false) ? -off : pc.span[0];
          const u1 = pc.span[1] > e.len - 1e-6 && next.d[0] * e.n[0] + next.d[1] * e.n[1] < -0.5 && outsideEnd(next.idx, true) ? e.len + off : pc.span[1];
          add({ kind: 'outwall', tris: strip(ou(u0), ou(u1), () => Z[s], outTop), storey: s, room: r.id, key, label: `${r.name} outside wall` });
        }
      }
    });
  }

  // Windows and doors: on the outside face of the wall, and on both faces of the room's own wall (seen from in the room and from outside it).
  for (const r of h.rooms) {
    const es = roomEdges(r), isPoly = !!r.poly, st = h.storeys[r.storey];
    if (!st) continue;
    for (const e of es) {
      const ops = h.openings.filter((o) => !o.to && o.room === r.id && (isPoly ? (o.edge ?? es.findIndex((x) => x.side === o.side)) === e.idx : o.side === e.side));
      ops.forEach((o, i) => {
        const door = h.buildups.find((x) => x.id === o.buildup)?.kind === 'door', w = Math.min(o.w, e.len), half = w / 2;
        const c = o.t != null ? Math.max(half, Math.min(e.len - half, o.t)) : (e.len * (i + 0.5)) / ops.length;
        const head = Math.min(2.1, st.h - 0.2), z0 = Z[r.storey] + (door ? 0 : Math.max(0.15, head - o.h)), z1 = Math.min(Z[r.storey] + st.h, z0 + o.h);
        // The shell is one thin surface on the outside face, so outside windows go on both sides of it (seen into a cut-away storey too).
        for (const [off, outer] of [[wallT + 0.02, true], [wallT - 0.015, true], [-WALL_IN - 0.015, false], [-WALL_IN + 0.015, false]] as Array<[number, boolean]>) {
          const p = (u: number): Pt => [e.a[0] + e.d[0] * u + e.n[0] * off, e.a[1] + e.d[1] * u + e.n[1] * off];
          const a = p(c - half), b = p(c + half);
          add({ kind: door ? 'door' : 'window', tris: quad([a[0], z0, a[1]], [b[0], z0, b[1]], [b[0], z1, b[1]], [a[0], z1, a[1]]), storey: r.storey, room: r.id, key: `op:${o.id}`, label: o.name, outer });
        }
      });
    }
  }

  // The outside: each storey's footprint (outside its walls) up to the next floor, or up to the roof where one covers it.
  const feet = h.storeys.map((_, s) => footprint(h.rooms.filter((r) => onStorey(r, s)).map(roomPoly), wallT));
  feet.forEach((loops, s) => {
    const st = h.storeys[s], mine = on(s), full = Z[s] + st.h + (s < last ? st.zone : 0);
    const shell: number[] = [];
    for (const loop of loops) {
      for (const e of edges(loop)) {
        const inside = (p: Pt): Pt => [p[0] - e.n[0] * 0.05, p[1] - e.n[1] * 0.05];
        shell.push(...strip(e.a, e.b, () => Z[s], (p) => { const R = mine.length ? roofOver(mine, inside(p)) : null; return R ? Z[s] + R.z : full; }));
      }
      // Flat tops where neither the storey above nor a roof covers this one.
      const flat: number[] = [];
      field(loop, 0.5, (p) => ({ z: full, key: (feet[s + 1] ?? []).some((q) => pointInPoly(p, q)) || (mine.length && roofOver(mine, p)) ? null : 'flat' }), (_k, t) => flat.push(...t));
      add({ kind: 'flat', tris: flat, storey: s, label: 'Flat roof' });
    }
    add({ kind: 'shell', tris: shell, storey: s, label: `${st.name} outside walls` });
  });

  // Roofs, plane by plane, gable ends where the roof runs past the walls, and dormers.
  for (const part of parts) {
    const z0 = Z[part.storey], g = grouped('roof', part.storey, () => `${part.sec.name} slope`);
    field(part.poly, 0.15, (p) => { const R = roofAt(part.model, p); return { z: z0 + R.z, key: `roof:${part.key}:${R.i}` }; }, g.push);
    g.done();
    const shellEdges = (feet[part.storey] ?? []).flatMap((l) => edges(l));
    const onShell = (p: Pt) => shellEdges.some((e) => {
      const u = Math.max(0, Math.min(e.len, (p[0] - e.a[0]) * e.d[0] + (p[1] - e.a[1]) * e.d[1]));
      return Math.hypot(p[0] - e.a[0] - e.d[0] * u, p[1] - e.a[1] - e.d[1] * u) < 0.05;
    });
    const gables: number[] = [];
    edges(part.poly).forEach((e, i) => {
      if (part.model.edges[i]?.kind !== 'gable' || onShell(mid(e.a, e.b))) return;
      gables.push(...strip(e.a, e.b, () => z0 + part.plate, (p) => z0 + roofAt(part.model, [p[0] - e.n[0] * 0.02, p[1] - e.n[1] * 0.02]).z));
    });
    add({ kind: 'shell', tris: gables, storey: part.storey, label: `${part.sec.name} gable` });
    for (const d of part.sec.dormers ?? []) {
      const pl = placeDormer(part, d);
      if (!pl) continue;
      const { e, u, xr, dw, hd } = pl, lo = z0 + part.plate, hi = z0 + hd;
      const at = (along: number, inw: number): Pt => [e.a[0] + e.d[0] * along - e.n[0] * inw, e.a[1] + e.d[1] * along - e.n[1] * inw];
      const fa = at(u - dw / 2, 0), fb = at(u + dw / 2, 0), ba = at(u - dw / 2, xr), bb = at(u + dw / 2, xr);
      const tris = [
        ...quad([fa[0], lo, fa[1]], [fb[0], lo, fb[1]], [fb[0], hi, fb[1]], [fa[0], hi, fa[1]]),
        ...quad([fa[0], hi, fa[1]], [fb[0], hi, fb[1]], [bb[0], hi, bb[1]], [ba[0], hi, ba[1]]),
        fa[0], lo, fa[1], fa[0], hi, fa[1], ba[0], hi, ba[1],
        fb[0], lo, fb[1], bb[0], hi, bb[1], fb[0], hi, fb[1],
      ];
      add({ kind: 'dormer', tris, storey: part.storey, key: `dw:${d.id}`, label: 'Dormer' });
      const ww = Math.min(dw - 0.2, Math.max(0.4, d.window / Math.max(0.3, (hd - part.plate) * 0.7))), wh = Math.min((hd - part.plate) * 0.8, d.window / Math.max(0.1, ww));
      const wa = at(u - ww / 2, -0.02), wb = at(u + ww / 2, -0.02), wz = lo + (hd - part.plate - wh) / 2;
      if (d.window > 0.05) add({ kind: 'window', tris: quad([wa[0], wz, wa[1]], [wb[0], wz, wb[1]], [wb[0], wz + wh, wb[1]], [wa[0], wz + wh, wa[1]]), storey: part.storey, key: `dg:${d.id}`, label: 'Dormer window', outer: true });
    }
  }
  return out;
}

