// Edits behind the floor-plan drawing canvas: plain changes to a House copy, no UI.
import { edges, overlapAreaPoly, pointInPoly, selfIntersects, sharedSpan } from './geom';
import type { Pt } from './geom';
import { defaultTemp, fitEdges, maxWallGap, onStorey, pairKey, rectShapeToEdges, roomArea, roomEdges, roomPoly, setOutline } from './house';
import type { House, Room, Side, WallAlign } from './house';
import type { Emitter } from './house-heating';

const SIDE_IDX: Record<Side, number> = { N: 0, E: 1, S: 2, W: 3 };
/** Face keys that number a room's walls (slopes, eaves, dormers) rather than naming a side. */
const WALL_NO = ['sl', 'ev', 'dw', 'dc', 'dr', 'dg'];

/** Rewrite the wall number in a room's face keys and openings; `f` returns the new number, or null to drop that wall's settings. */
function renumberWalls(h: House, id: string, f: (i: number) => number | null): void {
  for (const m of [h.faceBuildup, h.faceBoundary, h.wallAlign] as Array<Record<string, string>>) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) {
      const w = k.match(/^w:([^:]+):e(\d+):(\d+)$/), n = k.match(/^(\w\w):([^:]+):(\d+)$/);
      if (w && w[1] === id) { const j = f(+w[2]); if (j != null) out[`w:${id}:e${j}:${w[3]}`] = v; }
      else if (n && n[2] === id && WALL_NO.includes(n[1])) { const j = f(+n[3]); if (j != null) out[`${n[1]}:${id}:${j}`] = v; }
      else out[k] = v;
    }
    for (const k of Object.keys(m)) delete m[k];
    Object.assign(m, out);
  }
  h.openings.forEach((o) => { if (o.room === id && o.edge != null) o.edge = f(o.edge) ?? Math.max(0, o.edge - 1); });
}

/** Give a rectangle room an outline so its corners and walls can move, keeping every face choice and window where it was. */
export function ensurePoly(h: House, id: string): Room | undefined {
  const r = h.rooms.find((x) => x.id === id);
  if (!r || r.poly) return r;
  const at = r.shape?.axis === 'ns' ? [0, 2] : [3, 1];
  if (r.shape && !r.shape.edges) r.shape = { ...r.shape, edges: rectShapeToEdges(r.shape) };
  setOutline(r, roomPoly(r));
  // Rectangle walls N, E, S, W become walls 0–3; slope settings 0 and 1 go to the walls they sat on.
  for (const m of [h.faceBuildup, h.faceBoundary, h.wallAlign] as Array<Record<string, string>>) {
    for (const k of Object.keys(m)) {
      const w = k.match(/^w:([^:]+):([NESW]):(\d+)$/), n = k.match(/^(\w\w):([^:]+):(\d+)$/);
      if (w && w[1] === id) { m[`w:${id}:e${SIDE_IDX[w[2] as Side]}:${w[3]}`] = m[k]; delete m[k]; }
      else if (n && n[2] === id && WALL_NO.includes(n[1]) && +n[3] < 2) { m[`${n[1]}:${id}:${at[+n[3]]}`] = m[k]; delete m[k]; }
    }
  }
  h.openings.forEach((o) => { if (o.room === id) o.edge = SIDE_IDX[o.side]; });
  return r;
}

/** Add a corner to wall `i` (between corner i and i + 1) at `p`; later walls renumber and the new wall keeps the old one's settings. */
export function insertCorner(h: House, id: string, i: number, p: Pt): void {
  const r = ensurePoly(h, id);
  if (!r?.poly) return;
  const poly = [...r.poly];
  poly.splice(i + 1, 0, p);
  if (r.shape?.edges) r.shape.edges.splice(i + 1, 0, { ...r.shape.edges[i], dormer: null });
  const copy = (m: Record<string, string>) => { for (const [k, v] of Object.entries(m)) { const w = k.match(/^w:([^:]+):e(\d+):(\d+)$/); if (w && w[1] === id && +w[2] === i) m[`w:${id}:e${i + 1}:${w[3]}`] = v; } };
  renumberWalls(h, id, (j) => (j > i ? j + 1 : j));
  copy(h.faceBuildup); copy(h.faceBoundary); copy(h.wallAlign);
  setOutline(r, poly);
}

/** Remove corner `i`; its two walls merge into the earlier one. Not below three corners. */
export function removeCorner(h: House, id: string, i: number): void {
  const r = ensurePoly(h, id);
  if (!r?.poly || r.poly.length <= 3) return;
  const n = r.poly.length, prev = (i + n - 1) % n;
  if (r.shape?.edges) r.shape.edges.splice(i, 1);
  h.openings.forEach((o) => { if (o.room === id && o.edge === i) { o.edge = prev; delete o.t; } });
  renumberWalls(h, id, (j) => (j === i ? null : j > i ? j - 1 : j));
  setOutline(r, r.poly.filter((_, j) => j !== i));
}

/** A new room on a storey with the outline `poly`. */
export function addRoomAt(h: House, id: string, poly: Pt[], storey: number): Room {
  const r: Room = { id, name: `Room ${h.rooms.length + 1}`, type: 'other', storey, span: 1, x: 0, y: 0, w: 0, d: 0, heated: true, setpoint: defaultTemp(h, 'other'), ach: 1 };
  setOutline(r, poly);
  h.rooms.push(r);
  return r;
}

export function deleteRoom(h: House, id: string): void {
  h.rooms = h.rooms.filter((r) => r.id !== id);
  h.openings = h.openings.filter((o) => o.room !== id && o.to !== id);
  h.vent.devices = h.vent.devices.filter((d) => d.room !== id);
  h.heating.emitters = h.heating.emitters.filter((e) => e.room !== id);
}

/** Stretches of wall `idx` of a room that face outside (not against another room on the storey), as [from, to] metres along it. */
export function freeSpans(h: House, r: Room, idx: number, storey: number): Array<[number, number]> {
  const e = roomEdges(r)[idx];
  if (!e) return [];
  const cuts: Array<[number, number]> = [], gap = maxWallGap(h);
  for (const o of h.rooms) {
    if (o.id === r.id || !onStorey(o, storey)) continue;
    for (const f of roomEdges(o)) { const s = sharedSpan(e, f, 0.02, gap); if (s) cuts.push(s); }
  }
  cuts.sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let at = 0;
  for (const [a, b] of cuts) { if (a > at + 1e-6) out.push([at, a]); at = Math.max(at, b); }
  if (e.len > at + 1e-6) out.push([at, e.len]);
  return out;
}
export const isOutside = (h: House, r: Room, idx: number, storey: number) => freeSpans(h, r, idx, storey).some(([a, b]) => b - a > 0.05);

/** Every face key a wall of the plan stands for on one storey: its outside wall, and the inside wall shared with each room against it. */
export function wallKeys(h: House, roomId: string, idx: number, storey: number): string[] {
  const r = h.rooms.find((x) => x.id === roomId), e = r && roomEdges(r)[idx];
  if (!r || !e) return [];
  const keys = [`w:${roomId}:${e.id}:${storey}`], gap = maxWallGap(h);
  for (const o of h.rooms) {
    if (o.id === roomId || !onStorey(o, storey)) continue;
    if (roomEdges(o).some((f) => sharedSpan(e, f, 0.02, gap))) keys.push(`iw:${pairKey(roomId, o.id)}:${storey}`);
  }
  return keys;
}

/** A stretch of a wall that is one thing: outside wall, or the inside wall shared with `other`. A wall is split where its neighbours begin and end. */
export interface WallPiece { span: [number, number]; other?: string; /** Inside walls: the metres between the two rooms' lines, which is how thick the wall is drawn (0 when the lines coincide). */ gap?: number }
export function wallPieces(h: House, roomId: string, idx: number, storey: number): WallPiece[] {
  const r = h.rooms.find((x) => x.id === roomId), e = r && roomEdges(r)[idx];
  if (!r || !e) return [];
  const out: WallPiece[] = freeSpans(h, r, idx, storey).map((span) => ({ span })), gap = maxWallGap(h);
  for (const o of h.rooms) {
    if (o.id === roomId || !onStorey(o, storey)) continue;
    for (const f of roomEdges(o)) {
      const s = sharedSpan(e, f, 0.02, gap);
      if (s) { const off = (f.a[0] - e.a[0]) * e.n[0] + (f.a[1] - e.a[1]) * e.n[1]; out.push({ span: s, other: o.id, gap: off > 0.01 ? off : 0 }); }
    }
  }
  return out.sort((a, b) => a.span[0] - b.span[0]);
}

/** How far apart the two rooms of an inside wall are drawn now (a selected piece's own `gap` is from when it was picked). */
export const pieceGap = (h: House, roomId: string, idx: number, storey: number, p: Pick<WallPiece, 'other' | 'gap'>): number =>
  wallPieces(h, roomId, idx, storey).find((q) => q.other && q.other === p.other)?.gap ?? p.gap ?? 0;

/** The face keys of one piece of a wall. */
export const pieceKeys = (h: House, roomId: string, idx: number, storey: number, p: Pick<WallPiece, 'other'>): string[] => {
  const e = roomEdges(h.rooms.find((x) => x.id === roomId) ?? ({} as Room))[idx];
  return !e ? [] : p.other ? [`iw:${pairKey(roomId, p.other)}:${storey}`] : [`w:${roomId}:${e.id}:${storey}`];
};

const flipAlign = (a: WallAlign): WallAlign => (a === 'in' ? 'out' : a === 'out' ? 'in' : a);
/** The first room of an inside wall's pair: the room its stored alignment is measured from. */
const refRoom = (key: string) => (key.startsWith('iw:') ? key.split(':')[1].split('|')[0] : '');

/** How thick a piece of wall is drawn, in metres: the layers of its build-up (nothing if it has none). */
export function pieceThickness(h: House, roomId: string, idx: number, storey: number, p: Pick<WallPiece, 'other'>): number {
  const key = pieceKeys(h, roomId, idx, storey, p)[0];
  if (!key) return 0;
  const b = h.buildups.find((x) => x.id === (h.faceBuildup[key] ?? h.defaults[key.startsWith('w:') ? 'extWall' : 'intWall']));
  return b ? b.layers.reduce((t, [, mm]) => t + mm, 0) / 1000 : 0;
}

/** Where a piece of wall sits on its drawn line, seen from the interior of `roomId`: toward that room (in), centred, or away from it (out). */
export function pieceAlign(h: House, roomId: string, idx: number, storey: number, p: Pick<WallPiece, 'other'>): WallAlign {
  const key = pieceKeys(h, roomId, idx, storey, p)[0];
  const a = (key && h.wallAlign?.[key]) || (p.other ? 'ctr' : 'out');
  return key && refRoom(key) && refRoom(key) !== roomId ? flipAlign(a) : a;
}

export function setPieceAlign(h: House, roomId: string, idx: number, storey: number, p: Pick<WallPiece, 'other'>, a: WallAlign): void {
  const key = pieceKeys(h, roomId, idx, storey, p)[0];
  if (!key) return;
  h.wallAlign = h.wallAlign ?? {};
  h.wallAlign[key] = refRoom(key) && refRoom(key) !== roomId ? flipAlign(a) : a;
}

/** The two end points of a piece of a wall, in metres. */
export function pieceSeg(h: House, roomId: string, idx: number, span: [number, number]): [Pt, Pt] | null {
  const r = h.rooms.find((x) => x.id === roomId), e = r && roomEdges(r)[idx];
  return e ? [[e.a[0] + e.d[0] * span[0], e.a[1] + e.d[1] * span[0]], [e.a[0] + e.d[0] * span[1], e.a[1] + e.d[1] * span[1]]] : null;
}

export interface WallHit { room: string; edge: number; t: number; dist: number; at: Pt }
/** The wall of a room on the storey nearest `p` (within `max` m), with the distance along it. `only` limits it to outside walls. */
export function nearestWall(h: House, storey: number, p: Pt, max: number, only?: { outside?: boolean; room?: string }): WallHit | null {
  let best: WallHit | null = null;
  for (const r of h.rooms) {
    if (!onStorey(r, storey) || (only?.room && r.id !== only.room)) continue;
    roomEdges(r).forEach((e) => {
      const t = Math.max(0, Math.min(e.len, (p[0] - e.a[0]) * e.d[0] + (p[1] - e.a[1]) * e.d[1]));
      const at: Pt = [e.a[0] + e.d[0] * t, e.a[1] + e.d[1] * t], dist = Math.hypot(p[0] - at[0], p[1] - at[1]);
      if (dist > max || (best && dist >= best.dist)) return;
      if (only?.outside && !freeSpans(h, r, e.idx, storey).some(([a, b]) => t >= a - 0.05 && t <= b + 0.05)) return;
      best = { room: r.id, edge: e.idx, t, dist, at };
    });
  }
  return best;
}

/** Where a window or door of width `w` can sit with its centre near `t` on an outside wall: clamped into the free stretch, or null if none is wide enough. */
export function openingCentre(h: House, r: Room, idx: number, storey: number, t: number, w: number): number | null {
  const span = freeSpans(h, r, idx, storey).find(([a, b]) => t >= a - 0.05 && t <= b + 0.05 && b - a >= Math.min(w, 0.4));
  if (!span) return null;
  const half = Math.min(w, span[1] - span[0]) / 2;
  return Math.max(span[0] + half, Math.min(span[1] - half, t));
}

/** Where an emitter is drawn: where it was placed, else a radiator along the room's longest outside wall (the next one for each further radiator), a loop at the middle. */
export function emitterPose(h: House, e: Emitter): { at: Pt; ang: number } | null {
  if (e.at) return { at: e.at, ang: e.ang ?? 0 };
  const r = h.rooms.find((x) => x.id === e.room);
  if (!r) return null;
  const poly = roomPoly(r), es = edges(poly);
  if (e.kind === 'ufh') {
    const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
    return { at: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], ang: 0 };
  }
  const order = es.map((x, i) => ({ x, i })).filter(({ i }) => isOutside(h, r, i, r.storey)).sort((a, b) => b.x.len - a.x.len);
  const same = h.heating.emitters.filter((q) => q.room === e.room && !q.at && q.kind !== 'ufh');
  const w = order.length ? order[same.findIndex((q) => q.id === e.id) % order.length] : { x: es.reduce((a, b) => (b.len > a.len ? b : a)), i: 0 };
  const c: Pt = [(w.x.a[0] + w.x.b[0]) / 2 - w.x.n[0] * 0.2, (w.x.a[1] + w.x.b[1]) / 2 - w.x.n[1] * 0.2];
  return { at: c, ang: (Math.atan2(w.x.d[1], w.x.d[0]) * 180) / Math.PI };
}

/** Room containing the point, among those on the storey. */
export const roomAt = (h: House, storey: number, p: Pt): Room | undefined => h.rooms.find((r) => r.storey === storey && pointInPoly(p, roomPoly(r)));

// --- Layers (storeys) --------------------------------------------------------------------------------

/** Move every storey number up or down by one (a basement added or removed below the ground floor). */
function shiftStoreys(h: House, d: 1 | -1): void {
  h.rooms.forEach((r) => { r.storey += d; });
  for (const m of [h.faceBuildup, h.faceBoundary, h.wallAlign] as Array<Record<string, string>>) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) {
      const x = k.match(/^((?:w:[^:]+:[^:]+|iw:[^:]+):)(\d+)$/);
      out[x ? `${x[1]}${+x[2] + d}` : k] = v;
    }
    for (const k of Object.keys(m)) delete m[k];
    Object.assign(m, out);
  }
  if (h.trace) h.trace.images = Object.fromEntries(Object.entries(h.trace.images).map(([s, im]) => [+s + d, im]));
}

export const addStoreyAbove = (h: House): void => { h.storeys.push({ name: `Storey ${h.storeys.length + 1}`, h: 2.4, zone: 0.25 }); };
export const canAddBasement = (h: House) => !(h.storeys[0]?.below ?? 0);
/** A basement under the ground floor: a new lowest storey whose outside walls are in the ground. */
export function addBasement(h: House): void {
  if (!canAddBasement(h)) return;
  h.storeys.unshift({ name: 'Basement', h: 2.4, zone: 0.25, below: 2.65 });
  shiftStoreys(h, 1);
}
export const canRemoveTop = (h: House) => h.storeys.length > 1 && !h.rooms.some((r) => r.storey + r.span >= h.storeys.length);
export const canRemoveBasement = (h: House) => !canAddBasement(h) && h.storeys.length > 1 && !h.rooms.some((r) => onStorey(r, 0));
export function removeTop(h: House): void { if (canRemoveTop(h)) h.storeys.pop(); }
export function removeBasement(h: House): void {
  if (!canRemoveBasement(h)) return;
  h.storeys.shift();
  shiftStoreys(h, -1);
}

// --- Snapping and exact sizes -------------------------------------------------------------------------

/** Thickness in metres of the default inside wall: how far apart two rooms sit when a wall is drawn between them. */
export const innerWallThickness = (h: House) => (h.buildups.find((b) => b.id === h.defaults.intWall)?.layers ?? []).reduce((t, [, mm]) => t + mm, 0) / 1000;

/**
 * Nudge that sits a moving outline's corners flush on nearby vertical or horizontal walls of other rooms (within `tol` m),
 * or, when `off` is given, a wall's thickness away on the side the corner is already on: the two rooms then have a wall between them.
 */
export function flushDelta(moving: Pt[], others: Pt[][], tol = 0.2, off = 0): Pt {
  let bx = tol, by = tol, cx = 0, cy = 0;
  const lines = (at: number, v: number) => (off > 0.005 ? [at, v >= at ? at + off : at - off] : [at]);
  for (const v of moving) for (const poly of others) poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (Math.abs(a[0] - b[0]) < 1e-6 && v[1] >= Math.min(a[1], b[1]) - tol && v[1] <= Math.max(a[1], b[1]) + tol) for (const t of lines(a[0], v[0])) if (Math.abs(t - v[0]) < bx) { bx = Math.abs(t - v[0]); cx = t - v[0]; }
    if (Math.abs(a[1] - b[1]) < 1e-6 && v[0] >= Math.min(a[0], b[0]) - tol && v[0] <= Math.max(a[0], b[0]) + tol) for (const t of lines(a[1], v[1])) if (Math.abs(t - v[1]) < by) { by = Math.abs(t - v[1]); cy = t - v[1]; }
  });
  return [cx, cy];
}

/** Corners that move with corners `idx` of a room: those, and every corner of another room sitting on one. For a dragged wall (`wall` = its number) only rooms sharing that wall come along. */
export function joinedCorners(h: House, storey: number, room: string, idx: number[], wall?: number): Array<[string, number]> {
  const out: Array<[string, number]> = idx.map((i) => [room, i]);
  const r = h.rooms.find((x) => x.id === room);
  if (!r) return out;
  const mine = roomPoly(r), e = wall != null ? roomEdges(r)[wall] : null;
  for (const o of h.rooms) {
    if (o.id === room || !onStorey(o, storey) || (e && !roomEdges(o).some((f) => sharedSpan(e, f)))) continue;
    // A shared wall takes every corner of the neighbour lying along it; a lone corner only the ones on it.
    const on = (q: Pt) => (e ? Math.abs((q[0] - e.a[0]) * e.n[0] + (q[1] - e.a[1]) * e.n[1]) < 0.011 && (q[0] - e.a[0]) * e.d[0] + (q[1] - e.a[1]) * e.d[1] > -0.011 && (q[0] - e.a[0]) * e.d[0] + (q[1] - e.a[1]) * e.d[1] < e.len + 0.011
      : idx.some((i) => Math.hypot(mine[i][0] - q[0], mine[i][1] - q[1]) < 0.011));
    roomPoly(o).forEach((q, j) => { if (on(q)) out.push([o.id, j]); });
  }
  return out;
}

export function moveCorners(h: House, verts: Array<[string, number]>, d: Pt): void {
  for (const id of new Set(verts.map(([r]) => r))) {
    const r = ensurePoly(h, id);
    if (r?.poly) setOutline(r, r.poly.map((q, i) => (verts.some(([rid, j]) => rid === id && j === i) ? [q[0] + d[0], q[1] + d[1]] as Pt : q)));
  }
}

/** Make wall `i` of a room `len` metres long by sliding the wall at its far end (rooms sharing that wall go with it). */
export function setWallLength(h: House, roomId: string, i: number, len: number): void {
  const r = h.rooms.find((x) => x.id === roomId);
  if (!r || !(len >= 0.1)) return;
  const es = roomEdges(r), n = es.length, e = es[i], far = (i + 1) % n;
  moveCorners(h, joinedCorners(h, r.storey, roomId, [far, (i + 2) % n], far), [e.d[0] * (len - e.len), e.d[1] * (len - e.len)]);
}

/** Run `edit`, then put every placed window and door back at the point `place` maps its old centre to (by default, where it was). */
function keepOpenings(h: House, edit: () => void, place: (p: Pt) => Pt = (p) => p): void {
  const at = (o: House['openings'][number]) => { const r = h.rooms.find((x) => x.id === o.room); return r ? roomEdges(r)[wallIndex(h, o)] : undefined; };
  const was = h.openings.flatMap((o) => { const e = o.t != null && at(o); return e ? [[o, place([e.a[0] + e.d[0] * o.t!, e.a[1] + e.d[1] * o.t!])] as const] : []; });
  edit();
  for (const [o, p] of was) { const e = at(o); if (e) o.t = +Math.max(0, Math.min(e.len, (p[0] - e.a[0]) * e.d[0] + (p[1] - e.a[1]) * e.d[1])).toFixed(3); }
}

/**
 * Make the space between two rooms drawn a wall apart `by` metres wider (narrower when negative) by moving everything on one side of
 * the wall's middle line away from it, on every storey: rooms, windows, floor zones and emitters. Rooms across the line stretch.
 * `side` 1 moves the side of the room across the wall, -1 the side of `roomId`.
 */
export function stretchAtWall(h: House, roomId: string, idx: number, gap: number, by: number, side: 1 | -1): void {
  const r = h.rooms.find((x) => x.id === roomId), e = r && roomEdges(r)[idx];
  if (!e || Math.abs(by) < 1e-6) return;
  const n: Pt = [e.n[0] * side, e.n[1] * side], m: Pt = [e.a[0] + e.n[0] * gap / 2, e.a[1] + e.n[1] * gap / 2];
  const beyond = (p: Pt) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] > 1e-6;
  const move = (p: Pt): Pt => (beyond(p) ? [p[0] + n[0] * by, p[1] + n[1] * by] : p);
  keepOpenings(h, () => {
    for (const o of h.rooms) if (roomPoly(o).some(beyond)) setOutline(ensurePoly(h, o.id)!, o.poly!.map(move));
    for (const z of h.zones ?? []) z.poly = z.poly.map(move);
    for (const em of h.heating.emitters) {
      if (em.at) em.at = move(em.at);
      if (em.rect && beyond([em.rect.x + em.rect.w / 2, em.rect.y + em.rect.h / 2])) { em.rect.x += n[0] * by; em.rect.y += n[1] * by; }
    }
  }, move);
}

/** Make the space between two rooms drawn a wall apart `by` metres wider (narrower when negative) by moving each room's wall half of it into the room. */
export function narrowAtWall(h: House, roomId: string, idx: number, other: string, gap: number, by: number): void {
  const r = h.rooms.find((x) => x.id === roomId), o = h.rooms.find((x) => x.id === other), e = r && roomEdges(r)[idx];
  const j = o && e ? roomEdges(o).findIndex((f) => sharedSpan(e, f, 0.02, gap + 0.02)) : -1;
  if (!e || !o || j < 0) return;
  const d: Pt = [e.n[0] * by / 2, e.n[1] * by / 2];
  keepOpenings(h, () => {
    moveCorners(h, lineCorners(r, idx).map((k) => [roomId, k]), [-d[0], -d[1]]);
    moveCorners(h, lineCorners(o, j).map((k) => [other, k]), d);
  });
}

/** The corners of wall `i` and of the walls either side carrying on in a straight line: all of them move to keep the line straight. */
function lineCorners(r: Room, i: number): number[] {
  const es = roomEdges(r), n = es.length, e = es[i];
  const straight = (k: number) => k !== i && es[k].d[0] * e.d[0] + es[k].d[1] * e.d[1] > 0.9999 && Math.abs((es[k].a[0] - e.a[0]) * e.n[0] + (es[k].a[1] - e.a[1]) * e.n[1]) < 1e-3;
  let a = i, b = i;
  while (straight((a + n - 1) % n)) a = (a + n - 1) % n;
  while (straight((b + 1) % n) && (b + 1) % n !== a) b = (b + 1) % n;
  const out = [a];
  for (let k = a; k !== (b + 1) % n; k = (k + 1) % n) out.push((k + 1) % n);
  return out;
}

// --- Inside doors, splitting, groups of rooms, problems ---------------------------------------------------

/** Wall number an opening sits on. */
export function wallIndex(h: House, o: { room: string; side: Side; edge?: number }): number {
  const r = h.rooms.find((x) => x.id === o.room);
  if (!r) return 0;
  const bySide = roomEdges(r).findIndex((x) => x.side === o.side);
  return r.poly ? o.edge ?? bySide : bySide;
}

/** An inside door at about `t` on a wall shared with another room: the room it leads to and where it can sit, or null. */
export function innerDoorAt(h: House, r: Room, idx: number, storey: number, t: number, w: number): { to: string; t: number } | null {
  const e = roomEdges(r)[idx];
  if (!e) return null;
  for (const o of h.rooms) {
    if (o.id === r.id || !onStorey(o, storey)) continue;
    for (const f of roomEdges(o)) {
      const s = sharedSpan(e, f, 0.02, maxWallGap(h));
      if (!s || t < s[0] - 0.05 || t > s[1] + 0.05 || s[1] - s[0] < Math.min(w, 0.4)) continue;
      const half = Math.min(w, s[1] - s[0]) / 2;
      return { to: o.id, t: Math.max(s[0] + half, Math.min(s[1] - half, t)) };
    }
  }
  return null;
}

/** Where a line through a and b cuts a room's outline in two: the two crossing points and the wall each lies on, or null. */
export function cutPlan(poly: Pt[], a: Pt, b: Pt): Array<{ k: number; u: number; p: Pt }> | null {
  const dir: Pt = [b[0] - a[0], b[1] - a[1]], cr = (p: Pt, q: Pt) => p[0] * q[1] - p[1] * q[0];
  if (Math.hypot(dir[0], dir[1]) < 1e-6) return null;
  const hits: Array<{ k: number; u: number; t: number; p: Pt }> = [];
  poly.forEach((s, k) => {
    const e = poly[(k + 1) % poly.length], ed: Pt = [e[0] - s[0], e[1] - s[1]], den = cr(ed, dir);
    if (Math.abs(den) < 1e-9) return;
    const u = cr([a[0] - s[0], a[1] - s[1]], dir) / den, t = cr([s[0] - a[0], s[1] - a[1]], ed) / cr(dir, ed);
    if (u >= -1e-9 && u < 1 - 1e-9) hits.push({ k, u: Math.max(0, u), t, p: [s[0] + ed[0] * u, s[1] + ed[1] * u] });
  });
  hits.sort((x, y) => x.t - y.t);
  // The stretch between a pair of crossings that lies inside the room and holds the middle of the drawn line.
  for (let i = 0; i + 1 < hits.length; i += 2) {
    const [c, d] = [hits[i], hits[i + 1]], mid: Pt = [(c.p[0] + d.p[0]) / 2, (c.p[1] + d.p[1]) / 2];
    if (pointInPoly(mid, poly) && c.t - 1e-6 <= 0.5 && d.t + 1e-6 >= 0.5 && Math.hypot(d.p[0] - c.p[0], d.p[1] - c.p[1]) > 0.1) return [c, d].map(({ k, u, p }) => ({ k, u, p }));
  }
  return null;
}

/** Cut a room in two along the line a-b: the first half keeps the room, the second is a new room `newId` with its walls, windows and emitters. */
export function splitRoom(h: House, id: string, a: Pt, b: Pt, newId: string): boolean {
  const room = ensurePoly(h, id);
  const plan = room?.poly && cutPlan(room.poly, a, b);
  if (!room?.poly || !plan) return false;
  for (const c of [...plan].sort((x, y) => y.k - x.k)) if (c.u > 1e-6) insertCorner(h, id, c.k, c.p);
  const poly = room.poly, n = poly.length;
  const at = (p: Pt) => poly.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 2e-3);
  const [i, j] = [at(plan[0].p), at(plan[1].p)].sort((x, y) => x - y);
  if (i < 0 || j - i < 2 || n - (j - i) < 2) return false;
  const loopA = poly.slice(i, j + 1), loopB = [...poly.slice(j), ...poly.slice(0, i + 1)];
  // Old wall k becomes wall fA(k) of the first room, or fB(k) of the second.
  const inA = (k: number) => k >= i && k < j, fA = (k: number) => k - i, fB = (k: number) => (k >= j ? k - j : n - j + k);
  for (const m of [h.faceBuildup, h.faceBoundary, h.wallAlign] as Array<Record<string, string>>) {
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(m)) {
      const w = key.match(/^w:([^:]+):e(\d+):(\d+)$/), x = key.match(/^(\w\w):([^:]+):(\d+)$/), iw = key.match(/^iw:([^:]+):(\d+)$/), one = key.match(/^(gf|xf|lc|fr):(.+)$/);
      if (w && w[1] === id) { const k = +w[2]; if (inA(k)) out[`w:${id}:e${fA(k)}:${w[3]}`] = v; else out[`w:${newId}:e${fB(k)}:${w[3]}`] = v; }
      else if (x && x[2] === id && WALL_NO.includes(x[1])) { const k = +x[3]; if (inA(k)) out[`${x[1]}:${id}:${fA(k)}`] = v; else out[`${x[1]}:${newId}:${fB(k)}`] = v; }
      else if (iw && iw[1].split('|').includes(id)) { out[key] = v; out[`iw:${pairKey(...(iw[1].split('|').map((q) => (q === id ? newId : q)) as [string, string]))}:${iw[2]}`] = v; }
      else if (one && one[2] === id) { out[key] = v; out[`${one[1]}:${newId}`] = v; }
      else out[key] = v;
    }
    for (const key of Object.keys(m)) delete m[key];
    Object.assign(m, out);
  }
  const second: Room = { ...structuredClone(room), id: newId, name: `${room.name} 2` };
  h.openings.forEach((o) => {
    if (o.room !== id || o.edge == null) return;
    if (inA(o.edge)) o.edge = fA(o.edge); else { o.room = newId; o.edge = fB(o.edge); }
  });
  if (room.shape?.edges) {
    const es = room.shape.edges;
    room.shape = { ...room.shape, edges: fitEdges(es.slice(i, j), loopA.length) };
    second.shape = { ...second.shape!, edges: fitEdges([...es.slice(j), ...es.slice(0, i)], loopB.length) };
  }
  setOutline(room, loopA);
  setOutline(second, loopB);
  h.rooms.push(second);
  h.heating.emitters.forEach((e) => { if (e.room === id && e.at && pointInPoly(e.at, loopB)) e.room = newId; });
  return true;
}

/** Copies of rooms (with their windows and doors, and optionally emitters) moved by `d`, onto `storey` if given. Returns the new room ids. */
export function copyRooms(h: House, ids: string[], d: Pt, storey: number | undefined, withEmitters: boolean, mk: (prefix: string) => string): string[] {
  const map = new Map<string, string>();
  for (const id of ids) { ensurePoly(h, id); map.set(id, mk('r')); }
  const out: string[] = [];
  for (const [id, nid] of map) {
    const r = h.rooms.find((x) => x.id === id);
    if (!r?.poly) continue;
    const c: Room = structuredClone(r), ds = storey == null ? 0 : storey - r.storey;
    c.id = nid;
    if (storey != null) { c.storey = storey; c.span = Math.max(1, Math.min(c.span, h.storeys.length - storey)); }
    if (ds === 0) c.name = `${r.name} copy`;
    setOutline(c, r.poly.map((q): Pt => [q[0] + d[0], q[1] + d[1]]));
    h.rooms.push(c);
    out.push(nid);
    for (const m of [h.faceBuildup, h.faceBoundary, h.wallAlign] as Array<Record<string, string>>) {
      for (const [key, v] of Object.entries(m)) {
        const w = key.match(/^w:([^:]+):(e\d+):(\d+)$/), x = key.match(/^(\w\w):([^:]+):(\d+)$/), one = key.match(/^(xf|lc|fr|gf):(.+)$/);
        if (w && w[1] === id) m[`w:${nid}:${w[2]}:${+w[3] + ds}`] = v;
        else if (x && x[2] === id && WALL_NO.includes(x[1])) m[`${x[1]}:${nid}:${x[3]}`] = v;
        else if (one && one[2] === id && (ds === 0 || one[1] !== 'gf')) m[`${one[1]}:${nid}`] = v;
      }
    }
    for (const o of h.openings.filter((q) => q.room === id)) {
      if (o.to && !map.has(o.to)) continue;
      const n = { ...o, id: mk('o'), room: nid };
      if (o.to) n.to = map.get(o.to);
      h.openings.push(n);
    }
    if (withEmitters) {
      for (const e of h.heating.emitters.filter((q) => q.room === id)) {
        const n = structuredClone(e);
        n.id = mk('e'); n.room = nid;
        if (n.at) n.at = [n.at[0] + d[0], n.at[1] + d[1]];
        if (n.rect) { n.rect.x += d[0]; n.rect.y += d[1]; }
        h.heating.emitters.push(n);
      }
    }
  }
  return out;
}

/** Turn, flip or otherwise map the corners of a group of rooms (and their emitters). */
function transformRooms(h: House, ids: string[], f: (p: Pt) => Pt, ang: (a: number) => number): void {
  const rooms = ids.map((id) => ensurePoly(h, id)).filter((r): r is Room => !!r?.poly);
  rooms.forEach((r) => setOutline(r, r.poly!.map(f)));
  h.heating.emitters.forEach((e) => {
    if (!ids.includes(e.room)) return;
    if (e.at) e.at = f(e.at);
    if (e.ang != null) e.ang = ang(e.ang);
    if (e.rect) {
      const [a, b] = [f([e.rect.x, e.rect.y]), f([e.rect.x + e.rect.w, e.rect.y + e.rect.h])];
      e.rect = { ...e.rect, x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    }
  });
}
const centreOf = (h: House, ids: string[]): Pt => {
  const ps = h.rooms.filter((r) => ids.includes(r.id)).flatMap(roomPoly);
  return [(Math.min(...ps.map((p) => p[0])) + Math.max(...ps.map((p) => p[0]))) / 2, (Math.min(...ps.map((p) => p[1])) + Math.max(...ps.map((p) => p[1]))) / 2];
};
export function flipRooms(h: House, ids: string[], axis: 'x' | 'y'): void {
  const c = centreOf(h, ids);
  transformRooms(h, ids, axis === 'x' ? (p) => [2 * c[0] - p[0], p[1]] : (p) => [p[0], 2 * c[1] - p[1]], axis === 'x' ? (a) => 180 - a : (a) => -a);
}
/** Turn a group a quarter turn clockwise on the plan. */
export function rotateRooms(h: House, ids: string[]): void {
  const c = centreOf(h, ids);
  transformRooms(h, ids, (p) => [c[0] - (p[1] - c[1]), c[1] + (p[0] - c[0])], (a) => a + 90);
}

export interface Problems { overlap: Set<string>; gaps: Array<{ a: Pt; b: Pt; gap: number }> }
/** What is wrong with the drawing on a storey: rooms overlapping or crossing themselves, and walls almost but not quite touching. */
export function problems(h: House, storey: number): Problems {
  const rooms = h.rooms.filter((r) => onStorey(r, storey)), overlap = new Set<string>(), gaps: Problems['gaps'] = [];
  for (const r of rooms) if (r.poly && selfIntersects(r.poly)) overlap.add(r.id);
  for (let x = 0; x < rooms.length; x++) for (let y = x + 1; y < rooms.length; y++) {
    const A = rooms[x], B = rooms[y];
    if (overlapAreaPoly(roomPoly(A), roomPoly(B)) > 0.01) { overlap.add(A.id); overlap.add(B.id); }
    for (const e of roomEdges(A)) for (const f of roomEdges(B)) {
      if (e.n[0] * f.n[0] + e.n[1] * f.n[1] > -0.999) continue;
      const off = (f.a[0] - e.a[0]) * e.n[0] + (f.a[1] - e.a[1]) * e.n[1];
      if (off <= Math.max(0.02, maxWallGap(h)) || off > 0.25) continue;
      const t = (q: Pt) => (q[0] - e.a[0]) * e.d[0] + (q[1] - e.a[1]) * e.d[1];
      const t0 = Math.max(0, Math.min(t(f.a), t(f.b))), t1 = Math.min(e.len, Math.max(t(f.a), t(f.b)));
      if (t1 - t0 > 0.3) gaps.push({ a: [e.a[0] + e.d[0] * t0, e.a[1] + e.d[1] * t0], b: [e.a[0] + e.d[0] * t1, e.a[1] + e.d[1] * t1], gap: off });
    }
  }
  return { overlap, gaps };
}

// --- Floor and ceiling layers ---------------------------------------------------------------------

/** What a band is: band n is the floor of storey n and the ceiling of storey n - 1. */
export function bandName(h: House, b: number): string {
  const last = h.storeys.length - 1;
  if (b > last) return h.loft.present ? 'Ceiling to loft' : 'Roof';
  return b === 0 ? (h.storeys[0].below ? 'Basement floor' : 'Ground floor slab') : `Floor / ceiling: ${h.storeys[b - 1].name} to ${h.storeys[b].name}`;
}

/** A new floor or ceiling zone in a band, starting with the band's usual build-up so nothing changes until a different one is picked. */
export function addFloorZone(h: House, id: string, band: number, poly: Pt[], ufh = false): void {
  const last = h.storeys.length - 1, key = band === 0 ? 'groundFloor' : band > last ? (h.loft.present ? 'loftCeiling' : 'flatRoof') : 'intFloor';
  const zs = (h.zones ??= []), name = ufh ? `UFH ${zs.filter((z) => z.ufh).length + 1}` : `Zone ${zs.filter((z) => z.band === band && !z.ufh).length + 1}`;
  zs.push({ id, band, name, poly: poly.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)] as Pt), buildup: h.defaults[key], ...(ufh ? { ufh: true } : {}) });
}

/** An emitter for a room in the first matching heating zone: a K2 radiator, towel rail or UFH loop (85% of the floor until it is sized). */
export function addEmitter(h: House, room: string, kind: Emitter['kind'], id: string): void {
  const zone = h.heating.zones.find((z) => (kind === 'ufh' ? z.kind === 'ufh' : z.kind === 'rad'))?.id ?? '';
  const r = h.rooms.find((x) => x.id === room);
  h.heating.emitters.push({ id, room, kind, zone, type: 'K2', len: 1000, height: 600, rated: 600, area: r ? +(roomArea(r) * 0.85).toFixed(1) : 10, spacing: 150, cover: 'Tiles', tail: 5 });
}

/**
 * Underfloor heating zones give every heated room they cover (on the storey whose floor they are in) a UFH loop sized to the part
 * of the room inside the zone, and the zone's pipe spacing and diameter; loops of zones that no longer cover a room go. Run after every edit. Returns `h` itself when
 * nothing changes, else a changed copy, so it never alters the house it is given.
 */
export function syncUfh(h: House): House {
  const want = new Map<string, { room: string; zone: string; area: number; spacing: number; pipe: number }>();
  for (const z of h.zones ?? []) {
    if (!z.ufh) continue;
    for (const r of h.rooms) {
      if (r.storey !== z.band || !r.heated) continue;
      const area = +overlapAreaPoly(z.poly, roomPoly(r)).toFixed(2);
      if (area >= 0.1) want.set(`u-${z.id}-${r.id}`, { room: r.id, zone: z.id, area, spacing: z.spacing ?? 150, pipe: z.pipe ?? 16 });
    }
  }
  const es = h.heating.emitters;
  const same = (e: Emitter, w?: { area: number; spacing: number; pipe: number }) => !!w && w.area === e.area && w.spacing === e.spacing && w.pipe === (e.pipe ?? 16);
  if (es.every((e) => !e.fromZone || same(e, want.get(e.id))) && [...want.keys()].every((id) => es.some((e) => e.id === id))) return h;
  const n = structuredClone(h);
  n.heating.emitters = n.heating.emitters.filter((e) => !e.fromZone || want.has(e.id));
  for (const [id, w] of want) {
    let e = n.heating.emitters.find((x) => x.id === id);
    if (!e) { addEmitter(n, w.room, 'ufh', id); e = n.heating.emitters[n.heating.emitters.length - 1]; e.fromZone = w.zone; }
    e.area = w.area; e.spacing = w.spacing; e.pipe = w.pipe;
  }
  return n;
}

