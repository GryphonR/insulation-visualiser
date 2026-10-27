import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onStorey, roomEdges, roomPoly } from '../engine/house';
import type { House, Room } from '../engine/house';
import { centroid, pointInPoly, polyArea, selfIntersects, sharedSpan } from '../engine/geom';
import type { Pt } from '../engine/geom';
import { addFloorZone, addLoopRect, addRoomAt, cutPlan, deleteRoom, emitterPose, flushDelta, innerDoorAt, insertCorner, isOutside, joinedCorners, moveCorners, nearestWall, openingCentre, problems, removeCorner, roomAt, splitRoom } from '../engine/house-draw';
import { addEmitter } from './HouseHeating';
import { planBounds } from './HousePlan';
import { uid } from './hform';

export type Tool = 'select' | 'box' | 'room' | 'split' | 'corner' | 'window' | 'door' | 'radiator' | 'ufh';
export interface WallRef { room: string; edge: number }
export interface Sel { room: string; walls: WallRef[]; item: { k: 'op' | 'em'; id: string } | null; /** A floor or ceiling zone. */ zone?: string; /** Several rooms picked with the selection box or Shift-click. */ group?: string[] }
export const NO_SEL: Sel = { room: '', walls: [], item: null };

export const GRID = 0.05;
const S = 48, MAGNET = 0.15, ALIGN = 0.15, FLUSH = 0.2, RATIO = 0.625;
const near = (a: Pt, b: Pt, d = 0.011) => Math.hypot(a[0] - b[0], a[1] - b[1]) < d;
interface View { x: number; y: number; w: number }

/** A view of the whole plan with a margin, never smaller than 16 × 10 m so an empty plan has room to draw in. */
function fit(h: House): View {
  const b = planBounds(h), w = Math.max(16, b.maxX - b.minX + 5, (b.maxY - b.minY + 5) / RATIO);
  return { x: ((b.minX + b.maxX) / 2 - w / 2) * S, y: ((b.minY + b.maxY) / 2 - (w * RATIO) / 2) * S, w: w * S };
}

type Drag =
  | { k: 'pan'; x0: number; y0: number; v: View; moved: boolean }
  /** Corners (room, corner number) move together; `normal` slides a wall along its normal only. */
  | { k: 'move'; start: Pt; cur: Pt; verts: Array<[string, number]>; base: Pt; normal?: Pt; free: boolean; room?: boolean; moved: boolean }
  | { k: 'op' | 'em'; id: string; start: Pt; cur: Pt; moved: boolean }
  /** A floor or ceiling zone (all of it, or one corner `idx`). */
  | { k: 'zone'; id: string; idx?: number; start: Pt; cur: Pt; moved: boolean }
  | { k: 'box'; a: Pt; cur: Pt }
  | { k: 'marq'; a: Pt; cur: Pt };

/**
 * The drawing canvas for one storey: rooms of any shape whose corners and walls drag, with windows, doors and heat emitters
 * placed on them. Every edit is one `upd` on a copy of the house; nothing is written while a drag is under way.
 */
export function DrawCanvas({ house, storey, tool, setTool, sel, setSel, upd, fill, label, below, sticky, grid, snapOn, band, underlay, overlay }: {
  house: House; storey: number; tool: Tool; setTool: (t: Tool) => void;
  sel: Sel; setSel: (s: Sel) => void; upd: (fn: (h: House) => void) => void;
  fill: (r: Room) => string; label: (r: Room) => string;
  /** Show the storeys above and below faintly, to line walls up. */
  below: boolean;
  /** Keep the drawing tool after each room, and the grid size in m and whether snapping is on. */
  sticky: boolean; grid: number; snapOn: boolean;
  /** Editing a floor or ceiling layer (zones and heated-floor loops) instead of the rooms of a storey. */
  band?: number;
  underlay?: (to: (p: Pt) => Pt, S: number) => ReactNode;
  /** Drawn over everything and may capture the pointer (the scale tool); `from` turns an event into snapped plan metres. */
  overlay?: (to: (p: Pt) => Pt, S: number, from: (e: React.PointerEvent) => Pt | null) => ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const snap = (v: number) => Math.round(v / grid) * grid;
  const [view, setView] = useState<View>(() => fit(house));
  const [cw, setCw] = useState(900);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [note, setNote] = useState('');
  /** First corner of a box room (click, click), first point of a split line. */
  const [boxA, setBoxA] = useState<Pt | null>(null);
  const [cut, setCut] = useState<Pt | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ d: number; v: View } | null>(null);
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  const hs = coarse ? 1.8 : 1;
  const zoneMode = band != null;
  /** Digits typed while drawing a room: the length of the next wall. */
  const [typed, setTyped] = useState('');
  /** Shift held: no snapping to walls or angles. */
  const loose = useRef(false);
  const u = view.w / cw, z = (n: number) => n * u;
  const to = (p: Pt): Pt => [p[0] * S, p[1] * S];

  useLayoutEffect(() => {
    const on = () => setCw(svgRef.current?.clientWidth || 900);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // Ctrl + wheel zooms about the pointer (a plain wheel still scrolls the page).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()), f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setView((v) => ({ x: q.x - (q.x - v.x) * f, y: q.y - (q.y - v.y) * f, w: v.w * f }));
    };
    svg.addEventListener('wheel', on, { passive: false });
    return () => svg.removeEventListener('wheel', on);
  }, []);
  useEffect(() => { setDraft([]); setNote(''); setTyped(''); setBoxA(null); setCut(null); }, [tool, storey]);

  const onThis = house.rooms.filter((r) => onStorey(r, storey));
  const ghost = below ? house.rooms.filter((r) => (onStorey(r, storey - 1) || onStorey(r, storey + 1)) && !onStorey(r, storey)) : [];
  const raw = (e: { clientX: number; clientY: number }): Pt => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return [0, 0];
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [q.x / S, q.y / S];
  };
  /**
   * A nearby corner of another room if one is close; else the grid point, set flush on nearby walls of other rooms, then lined up
   * square with the `anchors` (same x or y) and, from `diag`, at 45 degrees. Shift turns the wall and angle snaps off.
   */
  const magnet = (p: Pt, skip?: Array<[string, number]>, anchors: Pt[] = [], diag?: Pt): Pt => {
    let best: Pt | null = null, bd = MAGNET;
    for (const r of [...onThis, ...ghost]) roomPoly(r).forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd && !skip?.some(([id, j]) => id === r.id && j === i)) { bd = d; best = q; }
    });
    if (best) return best;
    let [x, y] = [snap(p[0]), snap(p[1])];
    if (loose.current) return [x, y];
    const f = flushDelta([[x, y]], [...onThis.filter((r) => !skip?.some(([id]) => id === r.id)), ...ghost].map(roomPoly), ALIGN);
    x += f[0]; y += f[1];
    for (const a of anchors) { if (Math.abs(x - a[0]) < ALIGN) x = a[0]; if (Math.abs(y - a[1]) < ALIGN) y = a[1]; }
    if (diag) {
      const dx = x - diag[0], dy = y - diag[1];
      if (dx && dy && Math.abs(Math.abs(dx) - Math.abs(dy)) < ALIGN) { const m = (Math.abs(dx) + Math.abs(dy)) / 2; x = diag[0] + Math.sign(dx) * m; y = diag[1] + Math.sign(dy) * m; }
    }
    return [x, y];
  };
  const fromEvent = (e: React.PointerEvent): Pt => { const p = raw(e); return [snap(p[0]), snap(p[1])]; };

  // Corners while a drag is under way.
  const delta = (d: Extract<Drag, { k: 'move' }>): Pt => {
    if (d.normal) {
      const n = d.normal, ax: 0 | 1 | null = Math.abs(n[0]) > 0.999 ? 0 : Math.abs(n[1]) > 0.999 ? 1 : null;
      let s = snap((d.cur[0] - d.start[0]) * n[0] + (d.cur[1] - d.start[1]) * n[1]);
      if (ax !== null && !loose.current) {
        // A square wall also lines up with the corners of other rooms and of the storeys above and below.
        const at = d.base[ax] + s * n[ax];
        const near = [...onThis, ...ghost].flatMap((r) => roomPoly(r).filter((_, i) => !d.verts.some(([id, j]) => id === r.id && j === i)).map((q) => q[ax]))
          .filter((c) => Math.abs(c - at) < MAGNET).sort((x, y) => Math.abs(x - at) - Math.abs(y - at))[0];
        if (near !== undefined) s = (near - d.base[ax]) * n[ax];
      }
      return [n[0] * s, n[1] * s];
    }
    const want: Pt = [d.base[0] + d.cur[0] - d.start[0], d.base[1] + d.cur[1] - d.start[1]];
    if (d.room) {
      // A whole room: on the grid, then pushed flush against the walls of the other rooms.
      const g: Pt = [snap(want[0]) - d.base[0], snap(want[1]) - d.base[1]], ids = d.verts.map(([r]) => r);
      if (loose.current) return g;
      const f = flushDelta(onThis.filter((r) => ids.includes(r.id)).flatMap(roomPoly).map((q): Pt => [q[0] + g[0], q[1] + g[1]]), [...onThis.filter((r) => !ids.includes(r.id)), ...ghost].map(roomPoly), FLUSH);
      return [g[0] + f[0], g[1] + f[1]];
    }
    const [id, i] = d.verts[0], poly = roomPoly(house.rooms.find((r) => r.id === id)!);
    const t = d.free ? magnet(want, d.verts, [poly[(i + poly.length - 1) % poly.length], poly[(i + 1) % poly.length]]) : [snap(want[0]), snap(want[1])] as Pt;
    return [t[0] - d.base[0], t[1] - d.base[1]];
  };
  const polyOf = (r: Room): Pt[] => {
    const p = roomPoly(r);
    if (drag?.k !== 'move' || !drag.verts.some(([id]) => id === r.id)) return p;
    const dl = delta(drag);
    return p.map((q, i) => (drag.verts.some(([id, j]) => id === r.id && j === i) ? [q[0] + dl[0], q[1] + dl[1]] as Pt : q));
  };

  const zones = (house.zones ?? []).filter((z) => z.band === band);
  const zoneDelta = (d: Extract<Drag, { k: 'zone' }>): Pt => {
    const z = (house.zones ?? []).find((q) => q.id === d.id);
    if (!z) return [0, 0];
    const base = z.poly[d.idx ?? 0], t = magnet([base[0] + d.cur[0] - d.start[0], base[1] + d.cur[1] - d.start[1]]);
    return [t[0] - base[0], t[1] - base[1]];
  };
  const zonePoly = (z: { id: string; poly: Pt[] }): Pt[] => {
    if (drag?.k !== 'zone' || drag.id !== z.id || !drag.moved) return z.poly;
    const dl = zoneDelta(drag);
    return z.poly.map((q, i): Pt => (drag.idx == null || drag.idx === i ? [q[0] + dl[0], q[1] + dl[1]] : q));
  };

  const begin = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    svgRef.current?.focus({ preventScroll: true });
    setDrag(d);
  };
  const together = (room: string, idx: number[], alt: boolean, wall?: number) => (alt ? idx.map((i): [string, number] => [room, i]) : joinedCorners(house, storey, room, idx, wall));

  /** Where an emitter goes for a pointer position: its room, and a radiator snaps to the wall beside it. */
  const emitterAt = (p: Pt, kind: 'radiator' | 'ufh' | 'towel', keep?: string) => {
    const room = roomAt(house, storey, p) ?? (keep ? house.rooms.find((r) => r.id === keep) : undefined);
    if (!room) return null;
    const hit = kind === 'ufh' ? null : nearestWall(house, storey, p, 0.6, { room: room.id });
    if (hit) { const e = roomEdges(room)[hit.edge]; return { room, at: [hit.at[0] - e.n[0] * 0.2, hit.at[1] - e.n[1] * 0.2] as Pt, ang: (Math.atan2(e.d[1], e.d[0]) * 180) / Math.PI }; }
    return { room, at: [snap(p[0]), snap(p[1])] as Pt, ang: 0 };
  };
  const isDoorOp = (o: { buildup: string }) => house.buildups.find((x) => x.id === o.buildup)?.kind === 'door';
  /** Where a window or door of width `w` goes for a pointer position: on an outside wall, or (`inner`) a door on a wall shared with another room. */
  const openingAt = (p: Pt, w: number, inner = false): { room: Room; edge: number; t: number; to?: string } | null => {
    const hit = nearestWall(house, storey, p, 0.6, { outside: true });
    const r = hit && house.rooms.find((x) => x.id === hit.room);
    const t = hit && r ? openingCentre(house, r, hit.edge, storey, hit.t, w) : null;
    if (hit && r && t != null) return { room: r, edge: hit.edge, t };
    if (!inner) return null;
    const hi = nearestWall(house, storey, p, 0.6), ri = hi && house.rooms.find((x) => x.id === hi.room), d = hi && ri ? innerDoorAt(house, ri, hi.edge, storey, hi.t, w) : null;
    return hi && ri && d ? { room: ri, edge: hi.edge, t: d.t, to: d.to } : null;
  };
  /** A new room (or, on a floor or ceiling layer, a zone) with this outline. */
  const create = (pts: Pt[]) => {
    const id = uid(zoneMode ? 'z' : 'r');
    if (zoneMode) { upd((h) => addFloorZone(h, id, band!, pts)); setSel({ ...NO_SEL, zone: id }); }
    else { upd((h) => { addRoomAt(h, id, pts, storey); }); setSel({ room: id, walls: [], item: null }); }
    if (!sticky) setTool('select');
  };
  const closeDraft = (pts: Pt[]) => {
    if (pts.length < 3 || polyArea(pts) < 0.5) { setNote('An outline needs at least three corners.'); return; }
    if (selfIntersects(pts)) { setNote('That outline crosses itself; undo a corner with Backspace.'); return; }
    create(pts);
    setDraft([]); setNote('');
  };

  /** The next corner of the room being drawn for a pointer position: square or 45 degrees to what is drawn, or the typed length. */
  const draftPt = (p: Pt): Pt => {
    const last = draft[draft.length - 1], q = magnet(p, undefined, draft, last), L = Number(typed);
    if (!last || !(L > 0)) return q;
    const d = Math.hypot(q[0] - last[0], q[1] - last[1]);
    return d < 1e-6 ? [+(last[0] + L).toFixed(3), last[1]] : [+(last[0] + ((q[0] - last[0]) * L) / d).toFixed(3), +(last[1] + ((q[1] - last[1]) * L) / d).toFixed(3)];
  };

  /** Two fingers on the canvas pinch to zoom; the second finger never reaches the tools underneath. */
  const trackDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size !== 2) return;
    e.stopPropagation();
    setDrag(null);
    const [a, b] = [...pointers.current.values()];
    pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, v: view };
  };

  const down = (e: React.PointerEvent) => {
    loose.current = e.shiftKey || !snapOn;
    const p = raw(e);
    svgRef.current?.focus({ preventScroll: true });
    if (tool === 'select' && e.shiftKey && e.button === 0) { begin(e, { k: 'marq', a: p, cur: p }); return; }
    if (tool === 'select' || e.button === 1) { begin(e, { k: 'pan', x0: e.clientX, y0: e.clientY, v: view, moved: false }); return; }
    if (tool === 'split') {
      const q = magnet(p, undefined, cut ? [cut] : []);
      if (!cut) { setCut(q); setNote(''); return; }
      const mid: Pt = [(cut[0] + q[0]) / 2, (cut[1] + q[1]) / 2];
      const r = onThis.find((x) => pointInPoly(mid, roomPoly(x)) && cutPlan(roomPoly(x), cut, q)) ?? onThis.find((x) => cutPlan(roomPoly(x), cut, q));
      if (!r) { setNote('Draw the line across a room, from one side to the other.'); setCut(null); return; }
      const nid = uid('r');
      upd((h) => { splitRoom(h, r.id, cut, q, nid); });
      setCut(null); setNote(''); setSel({ room: r.id, walls: [], item: null });
      return;
    }
    if (tool === 'box' || (tool === 'ufh' && zoneMode)) {
      if (boxA && tool === 'box') {
        const q = magnet(p), w = Math.abs(q[0] - boxA[0]), dd = Math.abs(q[1] - boxA[1]);
        if (w < 0.5 || dd < 0.5) { setNote('Pick a corner at least 0.5 m away each way.'); return; }
        const x0 = Math.min(boxA[0], q[0]), y0 = Math.min(boxA[1], q[1]);
        create([[x0, y0], [x0 + w, y0], [x0 + w, y0 + dd], [x0, y0 + dd]]);
        setBoxA(null); setNote('');
        return;
      }
      const a = magnet(p); begin(e, { k: 'box', a, cur: a }); return;
    }
    if (tool === 'room') {
      const last = draft[draft.length - 1], q = draftPt(p);
      if (draft.length >= 3 && near(q, draft[0], 0.2)) { closeDraft(draft); return; }
      if (!last || !near(q, last, 0.05)) setDraft([...draft, q]);
      return;
    }
    if (tool === 'corner') {
      const hit = nearestWall(house, storey, p, 0.4);
      if (!hit) return;
      const e0 = roomEdges(house.rooms.find((r) => r.id === hit.room)!)[hit.edge];
      const q: Pt = Math.abs(e0.d[1]) < 1e-9 ? [snap(hit.at[0]), hit.at[1]] : Math.abs(e0.d[0]) < 1e-9 ? [hit.at[0], snap(hit.at[1])] : hit.at;
      upd((h) => insertCorner(h, hit.room, hit.edge, q));
      return;
    }
    if (tool === 'window' || tool === 'door') {
      const door = tool === 'door', w = door ? 0.9 : 1.2, at = openingAt(p, w, door);
      const b = house.buildups.find((x) => x.kind === (door ? 'door' : 'glazing'));
      if (!at) { setNote(door ? 'Doors go on outside walls, or on a wall shared with another room, in a clear stretch wide enough.' : 'Windows go on outside walls, in a clear stretch wide enough for them.'); return; }
      if (!b) { setNote(`Add a ${door ? 'door' : 'glazing'} build-up first.`); return; }
      const id = uid('o'), side = roomEdges(at.room)[at.edge].side;
      upd((h) => { h.openings.push({ id, room: at.room.id, side, name: door ? 'Door' : 'Window', w, h: door ? 2.0 : 1.2, buildup: b.id, edge: at.edge, t: at.t, ...(at.to ? { to: at.to } : {}) }); });
      setSel({ room: at.room.id, walls: [], item: { k: 'op', id } });
      return;
    }
    const at = emitterAt(p, tool);
    if (!at) { setNote('Click inside a room to place it.'); return; }
    if (!at.room.heated) { setNote(`${at.room.name} is unheated; switch it to heated first.`); return; }
    upd((h) => { addEmitter(h, at.room.id, tool); const e = h.heating.emitters[h.heating.emitters.length - 1]; e.at = at.at; e.ang = at.ang; });
    setSel({ room: at.room.id, walls: [], item: null });
  };

  const move = (e: React.PointerEvent) => {
    loose.current = e.shiftKey || !snapOn;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], f = pinch.current.d / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1), v = pinch.current.v, r = svgRef.current!.getBoundingClientRect();
      const q = { x: v.x + (((a[0] + b[0]) / 2 - r.left) / r.width) * v.w, y: v.y + (((a[1] + b[1]) / 2 - r.top) / r.height) * v.w * RATIO };
      setView({ x: q.x - (q.x - v.x) * f, y: q.y - (q.y - v.y) * f, w: v.w * f });
      return;
    }
    const p = raw(e);
    if (!drag) { setHover(p); return; }
    if (drag.k === 'pan') {
      const f = view.w / cw, moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 3;
      if (moved) setView({ ...drag.v, x: drag.v.x - (e.clientX - drag.x0) * f, y: drag.v.y - (e.clientY - drag.y0) * f });
      setDrag({ ...drag, moved });
    } else if (drag.k === 'box') setDrag({ ...drag, cur: magnet(p) });
    else if (drag.k === 'marq') setDrag({ ...drag, cur: p });
    else if (drag.k === 'move') setDrag({ ...drag, cur: p, moved: drag.moved || Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) * S > 3 });
    else setDrag({ ...drag, cur: p, moved: drag.moved || Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > 0.1 });
    setHover(p);
  };

  const up = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.k === 'pan') { if (!d.moved) setSel(NO_SEL); return; }
    if (d.k === 'marq') {
      const [x0, x1, y0, y1] = [Math.min(d.a[0], d.cur[0]), Math.max(d.a[0], d.cur[0]), Math.min(d.a[1], d.cur[1]), Math.max(d.a[1], d.cur[1])];
      const ids = onThis.filter((r) => { const q = roomPoly(r); return Math.min(...q.map((v) => v[0])) <= x1 && Math.max(...q.map((v) => v[0])) >= x0 && Math.min(...q.map((v) => v[1])) <= y1 && Math.max(...q.map((v) => v[1])) >= y0; }).map((r) => r.id);
      setSel({ room: ids[0] ?? '', walls: [], item: null, group: ids.length > 1 ? ids : [] });
      return;
    }
    if (d.k === 'box') {
      const w = Math.abs(d.cur[0] - d.a[0]), dd = Math.abs(d.cur[1] - d.a[1]);
      // A click without a drag sets the first corner; the next click sets the opposite one.
      if (w < 0.2 && dd < 0.2) { setBoxA(d.a); setNote('Now click the opposite corner.'); return; }
      if (w < 0.5 || dd < 0.5) { setNote('Drag out a box at least 0.5 m each way.'); return; }
      const x0 = Math.min(d.a[0], d.cur[0]), y0 = Math.min(d.a[1], d.cur[1]);
      if (tool === 'ufh') {
        // On a floor layer a box is a heated-floor loop, laid in the room under its centre.
        const room = roomAt(house, storey, [x0 + w / 2, y0 + dd / 2]), id = uid('e');
        if (!room) { setNote('Draw the loop inside a room.'); return; }
        if (!room.heated) { setNote(`${room.name} is unheated; switch it to heated first.`); return; }
        upd((h) => { addLoopRect(h, id, storey, { x: x0, y: y0, w, h: dd }, (hh, r) => addEmitter(hh, r, 'ufh')); });
        setSel({ ...NO_SEL, item: { k: 'em', id } });
        return;
      }
      create([[x0, y0], [x0 + w, y0], [x0 + w, y0 + dd], [x0, y0 + dd]]);
      return;
    }
    if (!d.moved) return;
    if (d.k === 'move') {
      const dl = delta(d);
      if (!dl[0] && !dl[1]) return;
      upd((h) => moveCorners(h, d.verts, dl));
    } else if (d.k === 'zone') {
      const dl = zoneDelta(d);
      if (!dl[0] && !dl[1]) return;
      upd((h) => { const x = h.zones?.find((q) => q.id === d.id); if (x) x.poly = x.poly.map((q, i): Pt => (d.idx == null || d.idx === i ? [+(q[0] + dl[0]).toFixed(3), +(q[1] + dl[1]).toFixed(3)] : q)); });
    } else if (d.k === 'op') {
      const o = house.openings.find((x) => x.id === d.id), at = o && openingAt(d.cur, o.w, isDoorOp(o));
      if (o && at) upd((h) => { const x = h.openings.find((q) => q.id === d.id)!; x.room = at.room.id; x.edge = at.edge; x.side = roomEdges(at.room)[at.edge].side; x.t = at.t; if (at.to) x.to = at.to; else delete x.to; });
    } else {
      const e = house.heating.emitters.find((x) => x.id === d.id), at = e && emitterAt(d.cur, e.kind, e.room);
      if (e?.rect) { const dl = loopShift(d); upd((h) => { const x = h.heating.emitters.find((q) => q.id === d.id); if (x?.rect) x.rect = { ...x.rect, x: +(x.rect.x + dl[0]).toFixed(3), y: +(x.rect.y + dl[1]).toFixed(3) }; }); return; }
      if (e && at) upd((h) => { const x = h.heating.emitters.find((q) => q.id === d.id)!; x.room = at.room.id; x.at = at.at; x.ang = at.ang; });
    }
  };

  const release = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (e.type === 'pointercancel') setDrag(null); else up();
  };

  /** How far a dragged heated-floor loop has moved, on the grid. */
  const loopShift = (d: { start: Pt; cur: Pt }): Pt => [snap(d.cur[0] - d.start[0]), snap(d.cur[1] - d.start[1])];

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setDraft([]); setNote(''); setTyped(''); setDrag(null); setTool('select'); }
    else if (tool === 'room' && draft.length && /^[0-9.]$/.test(e.key)) setTyped(typed + e.key);
    else if (tool === 'room' && e.key === 'Enter' && Number(typed) >= 0.1) { setDraft([...draft, draftPt(hover ?? draft[draft.length - 1])]); setTyped(''); }
    else if (tool === 'room' && e.key === 'Enter') closeDraft(draft);
    else if (tool === 'room' && e.key === 'Backspace') { if (typed) setTyped(typed.slice(0, -1)); else setDraft(draft.slice(0, -1)); }
    else if (tool === 'select' && e.key.startsWith('Arrow')) {
      // Arrow keys nudge the selected walls (along their normal), group or room by one grid step; Shift for 1 cm.
      e.preventDefault();
      const step = e.shiftKey ? 0.01 : grid, k = e.key.slice(5);
      const dv: Pt = k === 'Left' ? [-step, 0] : k === 'Right' ? [step, 0] : k === 'Up' ? [0, -step] : [0, step];
      const ids = sel.group?.length ? sel.group : sel.room ? [sel.room] : [];
      if (sel.walls.length) {
        upd((h) => sel.walls.forEach((w) => {
          const r = h.rooms.find((x) => x.id === w.room), es = r && roomEdges(r), ed = es?.[w.edge];
          if (!r || !es || !ed) return;
          const m = dv[0] * ed.n[0] + dv[1] * ed.n[1];
          moveCorners(h, joinedCorners(h, storey, w.room, [w.edge, (w.edge + 1) % es.length], w.edge), [ed.n[0] * m, ed.n[1] * m]);
        }));
      } else if (ids.length) upd((h) => moveCorners(h, ids.flatMap((id) => roomPoly(h.rooms.find((x) => x.id === id)!).map((_, i): [string, number] => [id, i])), dv));
    }
    else if (tool === 'select' && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (sel.item?.k === 'op') upd((h) => { h.openings = h.openings.filter((o) => o.id !== sel.item!.id); });
      else if (sel.item?.k === 'em') upd((h) => { h.heating.emitters = h.heating.emitters.filter((x) => x.id !== sel.item!.id); });
      else if (sel.zone) upd((h) => { h.zones = h.zones?.filter((z) => z.id !== sel.zone); });
      else if (!sel.walls.length && sel.room) { const ids = sel.group?.length ? sel.group : [sel.room]; upd((h) => ids.forEach((id) => deleteRoom(h, id))); setSel(NO_SEL); return; }
      else return;
      setSel({ ...sel, item: null });
    }
  };

  // --- drawing -----------------------------------------------------------------------------------
  const pts = (p: Pt[]) => p.map((q) => to(q).join(',')).join(' ');
  // A wall shared by two rooms is one wall: selecting either side highlights both.
  const isSelWall = (room: string, edge: number) => sel.walls.some((w) => {
    if (w.room === room) return w.edge === edge;
    const a = house.rooms.find((r) => r.id === w.room), b = house.rooms.find((r) => r.id === room);
    const ea = a && roomEdges(a)[w.edge], eb = b && roomEdges(b)[edge];
    return !!ea && !!eb && !!sharedSpan(ea, eb);
  });
  const dimOf = (r: Room, p: Pt[]) => roomEdges({ ...r, poly: p, x: 0, y: 0 }).map((e) => ({ e, mid: to([(e.a[0] + e.b[0]) / 2 + e.n[0] * 0.28, (e.a[1] + e.b[1]) / 2 + e.n[1] * 0.28]) }));
  const wallClick = (e: React.PointerEvent, r: Room, i: number) => {
    const same = isSelWall(r.id, i), multi = e.shiftKey || e.ctrlKey || e.metaKey;
    const walls = multi ? (same ? sel.walls.filter((w) => !(w.room === r.id && w.edge === i)) : [...sel.walls, { room: r.id, edge: i }]) : same && sel.walls.length === 1 ? sel.walls : [{ room: r.id, edge: i }];
    setSel({ room: r.id, walls, item: null });
    const es = roomEdges(r), n = es.length;
    begin(e, { k: 'move', start: raw(e), cur: raw(e), verts: together(r.id, [i, (i + 1) % n], e.altKey, i), base: roomPoly(r)[i], normal: es[i].n, free: false, moved: false });
  };

  const hv = hover;
  const probs = useMemo(() => problems(house, storey), [house, storey]);
  const grp = sel.group ?? [];
  // Guides: dashed lines from the point being placed to every corner it lines up with.
  const target: Pt | null = tool === 'room' && hv ? draftPt(hv) : drag?.k === 'box' ? drag.cur : drag?.k === 'move' && drag.free ? (() => { const dl = delta(drag); return [drag.base[0] + dl[0], drag.base[1] + dl[1]] as Pt; })()
    : tool === 'split' && hv ? magnet(hv, undefined, cut ? [cut] : []) : null;
  const guides = target ? [...onThis, ...ghost].flatMap((r) => roomPoly(r).filter((_, i) => !(drag?.k === 'move' && drag.verts.some(([id, j]) => id === r.id && j === i)))).concat(draft).flatMap((q): Array<[Pt, Pt]> => {
    const sx = Math.abs(q[0] - target[0]) < 1e-6, sy = Math.abs(q[1] - target[1]) < 1e-6;
    return sx !== sy ? [[q, target]] : [];
  }) : [];
  const cutLine = tool === 'split' && cut && hv ? magnet(hv, undefined, [cut]) : null;
  const cutHit = cut && cutLine ? onThis.map((r) => cutPlan(roomPoly(r), cut, cutLine)).find((x) => x) : null;
  const pose = (tool === 'window' || tool === 'door') && hv ? openingAt(hv, tool === 'door' ? 0.9 : 1.2, tool === 'door') : null;
  const eg = (tool === 'radiator' || tool === 'ufh') && hv ? emitterAt(hv, tool) : null;
  const cornerAt = tool === 'corner' && hv ? nearestWall(house, storey, hv, 0.4) : null;
  const cursor = drag?.k === 'pan' && drag.moved ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair';
  const dragPoly = drag?.k === 'move' ? onThis.filter((r) => drag.verts.some(([id]) => id === r.id)) : [];

  return (
    <div className="draw-wrap">
      <svg ref={svgRef} className="draw" tabIndex={0} style={{ cursor }} viewBox={`${view.x} ${view.y} ${view.w} ${view.w * RATIO}`} role="application"
        aria-label={`${house.storeys[storey]?.name} drawing canvas`} onPointerDownCapture={trackDown} onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release}
        onPointerLeave={() => setHover(null)} onKeyDown={key}
        onDoubleClick={() => { if (tool === 'room') closeDraft(draft); }}>
        <defs>
          <pattern id="zone-hatch" width={z(9)} height={z(9)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={z(9)} height={z(9)} fill="#0b8a7a" fillOpacity={0.12} /><line x1={0} y1={0} x2={0} y2={z(9)} stroke="#0b8a7a" strokeWidth={z(2.5)} strokeOpacity={0.55} />
          </pattern>
          <pattern id="draw-grid" width={S} height={S} patternUnits="userSpaceOnUse"><path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#d7dde2" strokeWidth={z(1)} /></pattern>
        </defs>
        <rect x={view.x} y={view.y} width={view.w} height={view.w * RATIO} fill="#fff" />
        <rect x={view.x} y={view.y} width={view.w} height={view.w * RATIO} fill="url(#draw-grid)" pointerEvents="none" />
        <line x1={view.x} x2={view.x + view.w} y1={0} y2={0} stroke="#b9c4cc" strokeWidth={z(1)} strokeDasharray={`${z(6)} ${z(4)}`} pointerEvents="none" />
        <line y1={view.y} y2={view.y + view.w * RATIO} x1={0} x2={0} stroke="#b9c4cc" strokeWidth={z(1)} strokeDasharray={`${z(6)} ${z(4)}`} pointerEvents="none" />
        <text x={view.x + view.w / 2} y={view.y + z(18)} textAnchor="middle" className="plan-n" style={{ fontSize: z(13) }}>N ↑</text>
        {underlay?.(to, S)}
        {ghost.map((r) => <polygon key={r.id} points={pts(roomPoly(r))} fill="#14212b" fillOpacity={0.04} stroke="#8a96a1" strokeWidth={z(1.2)} strokeDasharray={`${z(5)} ${z(4)}`} pointerEvents="none" />)}

        {onThis.map((r) => {
          const p = polyOf(r), c = to(centroid(p)), on = sel.room === r.id || grp.includes(r.id);
          return (
            <g key={r.id}>
              <polygon points={pts(p)} fill={zoneMode ? '#f7f7f4' : fill(r)} fillOpacity={0.92} stroke="none" style={{ cursor: tool === 'select' && !zoneMode ? 'move' : undefined }} pointerEvents={zoneMode ? 'none' : undefined}
                onPointerDown={tool === 'select' && !zoneMode ? (e) => {
                  if (e.shiftKey) {
                    // Shift-click adds the room to, or takes it from, the group.
                    e.stopPropagation();
                    const base = grp.length ? grp : sel.room ? [sel.room] : [];
                    setSel({ room: r.id, walls: [], item: null, group: base.includes(r.id) ? base.filter((x) => x !== r.id) : [...base, r.id] });
                    return;
                  }
                  const moving = grp.length > 1 && grp.includes(r.id) ? grp : [r.id];
                  setSel({ room: r.id, walls: [], item: null, group: moving.length > 1 ? moving : [] });
                  begin(e, { k: 'move', start: raw(e), cur: raw(e), verts: moving.flatMap((id) => roomPoly(house.rooms.find((x) => x.id === id)!).map((_, i): [string, number] => [id, i])), base: roomPoly(r)[0], free: false, room: true, moved: false });
                } : undefined} />
              <text x={c[0]} y={c[1] - z(3)} textAnchor="middle" className="plan-t" style={{ fontSize: z(13) }}>{r.name}</text>
              <text x={c[0]} y={c[1] + z(12)} textAnchor="middle" className="plan-s" style={{ fontSize: z(12) }}>{zoneMode ? '' : label(r)}</text>
              <text x={c[0]} y={c[1] + z(26)} textAnchor="middle" className="plan-s" style={{ fontSize: z(11) }}>{polyArea(p).toFixed(1)} m²</text>
              {r.span > 1 && storey > r.storey && <text x={c[0]} y={c[1] + z(39)} textAnchor="middle" className="plan-s" style={{ fontSize: z(12) }}>(open to below)</text>}
              {on && <polygon points={pts(p)} fill="none" stroke="#c2410c" strokeWidth={z(1.5)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />}
            </g>
          );
        })}

        {/* Walls: outside ones heavier. A wide invisible line is the target to grab. */}
        {onThis.flatMap((r) => {
          const p = polyOf(r);
          return roomEdges({ ...r, poly: p, x: 0, y: 0 }).map((e) => {
            const a = to(e.a), b = to(e.b), s = isSelWall(r.id, e.idx), out = isOutside(house, r, e.idx, storey);
            return (
              <g key={`${r.id}-${e.idx}`}>
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={s ? '#c2410c' : '#14212b'} strokeWidth={z(s ? 5 : out ? 4 : 2)} strokeLinecap="round" pointerEvents="none" />
                {tool === 'select' && !zoneMode && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={z(14 * hs)} className="wall-hit"
                  onPointerDown={(ev) => wallClick(ev, r, e.idx)}
                  onDoubleClick={(ev) => { ev.stopPropagation(); const q = raw(ev); const hit = nearestWall(house, storey, q, 0.5, { room: r.id }); if (hit && hit.edge === e.idx) upd((h) => insertCorner(h, r.id, e.idx, [snap(hit.at[0]), snap(hit.at[1])])); }} />}
              </g>
            );
          });
        })}

        {/* Problems: rooms overlapping or crossing themselves, and walls that almost touch */}
        {!zoneMode && onThis.filter((r) => probs.overlap.has(r.id)).map((r) => <polygon key={`o${r.id}`} points={pts(polyOf(r))} fill="none" stroke="#c0392b" strokeWidth={z(3)} strokeDasharray={`${z(8)} ${z(4)}`} pointerEvents="none"><title>{r.name} overlaps another room</title></polygon>)}
        {!zoneMode && probs.gaps.map((g, i) => (
          <g key={`g${i}`} pointerEvents="none">
            <line x1={to(g.a)[0]} y1={to(g.a)[1]} x2={to(g.b)[0]} y2={to(g.b)[1]} stroke="#d99a00" strokeWidth={z(7)} opacity={0.7} />
            <text x={(to(g.a)[0] + to(g.b)[0]) / 2} y={(to(g.a)[1] + to(g.b)[1]) / 2 - z(8)} textAnchor="middle" className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{(g.gap * 100).toFixed(0)} cm gap</text>
          </g>
        ))}

        {/* Floor and ceiling zones */}
        {zoneMode && zones.map((zn) => {
          const pz = zonePoly(zn), c = to(centroid(pz)), on = sel.zone === zn.id, bu = house.buildups.find((x) => x.id === zn.buildup);
          const nearEdge = (q: Pt) => { let best = { i: -1, d: 0.5 }; pz.forEach((a, i) => { const b = pz[(i + 1) % pz.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L))), d = Math.hypot(q[0] - a[0] - u * (b[0] - a[0]), q[1] - a[1] - u * (b[1] - a[1])); if (d < best.d) best = { i, d }; }); return best.i; };
          return (
            <g key={zn.id}>
              <polygon points={pts(pz)} fill="url(#zone-hatch)" stroke={on ? '#c2410c' : '#0b8a7a'} strokeWidth={z(on ? 2.5 : 1.8)} style={{ cursor: tool === 'select' ? 'move' : undefined }} pointerEvents={tool === 'select' ? undefined : 'none'}
                onPointerDown={(e) => { setSel({ ...NO_SEL, zone: zn.id }); begin(e, { k: 'zone', id: zn.id, start: raw(e), cur: raw(e), moved: false }); }}
                onDoubleClick={(e) => { e.stopPropagation(); const i = nearEdge(raw(e)); if (i >= 0) upd((h) => { const x = h.zones?.find((q) => q.id === zn.id); if (x) x.poly.splice(i + 1, 0, [snap(raw(e)[0]), snap(raw(e)[1])]); }); }} />
              <text x={c[0]} y={c[1] - z(2)} textAnchor="middle" className="plan-t" style={{ fontSize: z(12) }} pointerEvents="none">{zn.name}</text>
              <text x={c[0]} y={c[1] + z(12)} textAnchor="middle" className="plan-s" style={{ fontSize: z(11) }} pointerEvents="none">{(bu?.name ?? '?').slice(0, 20)}{(bu?.name.length ?? 0) > 20 ? '…' : ''} · {polyArea(pz).toFixed(1)} m²</text>
            </g>
          );
        })}
        {zoneMode && tool === 'select' && zones.filter((zn) => zn.id === sel.zone).flatMap((zn) => zonePoly(zn).map((q, i) => (
          <circle key={`${zn.id}-v${i}`} cx={to(q)[0]} cy={to(q)[1]} r={z(6.5 * hs)} className="vx on" strokeWidth={z(2)} aria-label={`${zn.name} corner ${i + 1}`}
            onPointerDown={(e) => begin(e, { k: 'zone', id: zn.id, idx: i, start: raw(e), cur: raw(e), moved: false })}
            onDoubleClick={(e) => { e.stopPropagation(); if (zn.poly.length > 3) upd((h) => { const x = h.zones?.find((y) => y.id === zn.id); if (x) x.poly.splice(i, 1); }); }} />
        )))}

        {/* Windows and doors */}
        {!zoneMode && onThis.flatMap((r) => {
          const es = roomEdges(r), isPoly = !!r.poly;
          return es.flatMap((e) => {
            const ops = house.openings.filter((o) => o.room === r.id && (isPoly ? (o.edge ?? es.findIndex((x) => x.side === o.side)) === e.idx : o.side === e.side));
            return ops.map((o, i) => {
              const L = e.len, half = Math.min(o.w, L) / 2;
              const dragged = drag?.k === 'op' && drag.id === o.id && drag.moved ? openingAt(drag.cur, o.w, isDoorOp(o)) : null;
              const rr = dragged?.room ?? r, ee = dragged ? roomEdges(rr)[dragged.edge] : e;
              const c = dragged ? dragged.t : o.t != null ? Math.max(half, Math.min(L - half, o.t)) : (L * (i + 0.5)) / ops.length;
              const a = to([ee.a[0] + ee.d[0] * (c - half), ee.a[1] + ee.d[1] * (c - half)]), b = to([ee.a[0] + ee.d[0] * (c + half), ee.a[1] + ee.d[1] * (c + half)]);
              const door = house.buildups.find((x) => x.id === o.buildup)?.kind === 'door', on = sel.item?.k === 'op' && sel.item.id === o.id;
              return (
                <g key={o.id}>
                  {on && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#c2410c" strokeWidth={z(12)} strokeLinecap="round" opacity={0.35} pointerEvents="none" />}
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={door ? '#8a5a2b' : '#1f6fb5'} strokeWidth={z(6)} pointerEvents="none" />
                  {tool === 'select' && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={z(16 * hs)} style={{ cursor: 'grab' }}
                    onPointerDown={(ev) => { setSel({ room: r.id, walls: [], item: { k: 'op', id: o.id } }); begin(ev, { k: 'op', id: o.id, start: raw(ev), cur: raw(ev), moved: false }); }} />}
                </g>
              );
            });
          });
        })}

        {/* Heat emitters */}
        {house.heating.emitters.filter((e) => { const r = house.rooms.find((x) => x.id === e.room); return r && r.storey === storey && (!zoneMode || (e.kind === 'ufh' && !!e.rect && band! <= house.storeys.length - 1)); }).map((e) => {
          if (e.kind === 'ufh' && e.rect) {
            // A drawn loop is its rectangle; on a floor layer it can be picked up and moved.
            const dl: Pt = drag?.k === 'em' && drag.id === e.id && drag.moved ? loopShift(drag) : [0, 0], on = sel.item?.k === 'em' && sel.item.id === e.id, a = to([e.rect.x + dl[0], e.rect.y + dl[1]]);
            return (
              <g key={e.id} pointerEvents={zoneMode && tool === 'select' ? undefined : 'none'} style={{ cursor: 'grab' }}
                onPointerDown={(ev) => { setSel({ ...NO_SEL, item: { k: 'em', id: e.id } }); begin(ev, { k: 'em', id: e.id, start: raw(ev), cur: raw(ev), moved: false }); }}>
                <rect x={a[0]} y={a[1]} width={e.rect.w * S} height={e.rect.h * S} fill="#f3c9a2" fillOpacity={0.5} stroke={on ? '#c2410c' : '#9a3412'} strokeWidth={z(on ? 2.5 : 1.5)} strokeDasharray={`${z(5)} ${z(3)}`} />
                <text x={a[0] + (e.rect.w * S) / 2} y={a[1] + (e.rect.h * S) / 2 + z(4)} textAnchor="middle" className="plan-s" style={{ fontSize: z(11) }}>UFH {(e.rect.w * e.rect.h).toFixed(1)} m²</text>
              </g>
            );
          }
          const dragged = drag?.k === 'em' && drag.id === e.id && drag.moved ? emitterAt(drag.cur, e.kind, e.room) : null;
          const ps = dragged ? { at: dragged.at, ang: dragged.ang } : emitterPose(house, e);
          if (!ps) return null;
          const c = to(ps.at), on = sel.item?.k === 'em' && sel.item.id === e.id;
          const len = (e.kind === 'ufh' ? 0.9 : e.kind === 'towel' ? 0.5 : e.len / 1000) * S, th = (e.kind === 'ufh' ? 0.9 : 0.1) * S;
          return (
            <g key={e.id} transform={`translate(${c[0]} ${c[1]}) rotate(${e.kind === 'ufh' ? 0 : ps.ang})`}
              onPointerDown={tool === 'select' ? (ev) => { setSel({ room: e.room, walls: [], item: { k: 'em', id: e.id } }); begin(ev, { k: 'em', id: e.id, start: raw(ev), cur: raw(ev), moved: false }); } : undefined}
              style={{ cursor: tool === 'select' ? 'grab' : undefined }} pointerEvents={tool === 'select' ? undefined : 'none'}>
              <rect x={-len / 2 - z(4)} y={-th / 2 - z(4)} width={len + z(8)} height={th + z(8)} fill="transparent" />
              {e.kind === 'ufh'
                ? <><rect x={-len / 2} y={-th / 2} width={len} height={th} fill="#f3c9a2" fillOpacity={0.55} stroke={on ? '#c2410c' : '#9a3412'} strokeWidth={z(on ? 2.5 : 1.5)} strokeDasharray={`${z(4)} ${z(3)}`} /><text textAnchor="middle" y={z(4)} className="plan-s" style={{ fontSize: z(11) }}>UFH</text></>
                : <rect x={-len / 2} y={-th / 2} width={len} height={th} fill={on ? '#c2410c' : '#9a3412'} stroke="#14212b" strokeWidth={z(1)} rx={z(2)} />}
            </g>
          );
        })}

        {/* Dimensions on the selected room and on anything being dragged */}
        {[...new Set([...onThis.filter((r) => r.id === sel.room), ...dragPoly])].flatMap((r) => dimOf(r, polyOf(r)).filter(({ e }) => e.len > 0.15).map(({ e, mid }) => (
          <text key={`${r.id}-d${e.idx}`} x={mid[0]} y={mid[1] + z(4)} textAnchor="middle" className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{e.len.toFixed(2)} m</text>
        )))}

        {/* Corners: every one drags; double-click removes it. */}
        {tool === 'select' && !zoneMode && onThis.flatMap((r) => polyOf(r).map((q, i) => {
          const v = to(q), on = sel.room === r.id, moving = drag?.k === 'move' && drag.verts.some(([id, j]) => id === r.id && j === i);
          return <circle key={`${r.id}-v${i}`} cx={v[0]} cy={v[1]} r={z((on ? 6.5 : 4.5) * hs)} className={`vx${on ? ' on' : ''}${moving ? ' moving' : ''}`} strokeWidth={z(2)} aria-label={`${r.name} corner ${i + 1}`}
            onPointerDown={(e) => { setSel({ room: r.id, walls: [], item: null }); begin(e, { k: 'move', start: raw(e), cur: raw(e), verts: together(r.id, [i], e.altKey), base: roomPoly(r)[i], free: true, moved: false }); }}
            onDoubleClick={(e) => { e.stopPropagation(); upd((h) => removeCorner(h, r.id, i)); }} />;
        }))}

        {/* In-progress drawing and placement previews */}
        {draft.length > 0 && <>
          <polyline points={pts(hv && tool === 'room' ? [...draft, draftPt(hv)] : draft)} fill="none" stroke="#c2410c" strokeWidth={z(2.5)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />
          {draft.map((q, i) => <circle key={i} cx={to(q)[0]} cy={to(q)[1]} r={z(i === 0 && draft.length >= 3 ? 7 : 4.5)} fill={i === 0 ? '#fdf3ea' : '#c2410c'} stroke="#c2410c" strokeWidth={z(2)} pointerEvents="none" />)}
          {hv && <text x={to(draftPt(hv))[0] + z(12)} y={to(draftPt(hv))[1] - z(10)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{typed ? `${typed} m ⏎` : `${Math.hypot(draftPt(hv)[0] - draft[draft.length - 1][0], draftPt(hv)[1] - draft[draft.length - 1][1]).toFixed(2)} m`}</text>}
        </>}
        {tool === 'room' && hv && <circle cx={to(draftPt(hv))[0]} cy={to(draftPt(hv))[1]} r={z(4)} fill="none" stroke="#c2410c" strokeWidth={z(1.5)} pointerEvents="none" />}
        {drag?.k === 'box' && <>
          <rect x={Math.min(drag.a[0], drag.cur[0]) * S} y={Math.min(drag.a[1], drag.cur[1]) * S} width={Math.abs(drag.cur[0] - drag.a[0]) * S} height={Math.abs(drag.cur[1] - drag.a[1]) * S}
            fill="#fdf3ea" fillOpacity={0.6} stroke="#c2410c" strokeWidth={z(2)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />
          <text x={drag.cur[0] * S + z(10)} y={drag.cur[1] * S - z(8)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{Math.abs(drag.cur[0] - drag.a[0]).toFixed(2)} × {Math.abs(drag.cur[1] - drag.a[1]).toFixed(2)} m</text>
        </>}
        {pose && (() => {
          const e = roomEdges(pose.room)[pose.edge], half = (tool === 'door' ? 0.45 : 0.6);
          const a = to([e.a[0] + e.d[0] * (pose.t - half), e.a[1] + e.d[1] * (pose.t - half)]), b = to([e.a[0] + e.d[0] * (pose.t + half), e.a[1] + e.d[1] * (pose.t + half)]);
          return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={tool === 'door' ? '#8a5a2b' : '#1f6fb5'} strokeWidth={z(6)} opacity={0.55} pointerEvents="none" />;
        })()}
        {eg && <g transform={`translate(${to(eg.at)[0]} ${to(eg.at)[1]}) rotate(${tool === 'ufh' ? 0 : eg.ang})`} opacity={0.55} pointerEvents="none">
          <rect x={-(tool === 'ufh' ? 0.45 : 0.5) * S} y={-(tool === 'ufh' ? 0.45 : 0.05) * S} width={(tool === 'ufh' ? 0.9 : 1) * S} height={(tool === 'ufh' ? 0.9 : 0.1) * S} fill="#9a3412" />
        </g>}
        {guides.map(([a, b], i) => <line key={`gd${i}`} x1={to(a)[0]} y1={to(a)[1]} x2={to(b)[0]} y2={to(b)[1]} stroke="#0b8a7a" strokeWidth={z(1.2)} strokeDasharray={`${z(5)} ${z(4)}`} pointerEvents="none" />)}
        {boxA && hv && tool === 'box' && (() => { const q = magnet(hv); return <rect x={Math.min(boxA[0], q[0]) * S} y={Math.min(boxA[1], q[1]) * S} width={Math.abs(q[0] - boxA[0]) * S} height={Math.abs(q[1] - boxA[1]) * S} fill="#fdf3ea" fillOpacity={0.6} stroke="#c2410c" strokeWidth={z(2)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />; })()}
        {cut && <circle cx={to(cut)[0]} cy={to(cut)[1]} r={z(5)} fill="#c2410c" pointerEvents="none" />}
        {cut && cutLine && <line x1={to(cut)[0]} y1={to(cut)[1]} x2={to(cutLine)[0]} y2={to(cutLine)[1]} stroke="#c2410c" strokeWidth={z(1.5)} strokeDasharray={`${z(4)} ${z(4)}`} pointerEvents="none" />}
        {cutHit && <line x1={to(cutHit[0].p)[0]} y1={to(cutHit[0].p)[1]} x2={to(cutHit[1].p)[0]} y2={to(cutHit[1].p)[1]} stroke="#c2410c" strokeWidth={z(4)} pointerEvents="none" />}
        {drag?.k === 'box' && tool === 'ufh' && <text x={drag.cur[0] * S + z(10)} y={drag.cur[1] * S + z(16)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>UFH loop</text>}
        {drag?.k === 'marq' && <rect x={Math.min(drag.a[0], drag.cur[0]) * S} y={Math.min(drag.a[1], drag.cur[1]) * S} width={Math.abs(drag.cur[0] - drag.a[0]) * S} height={Math.abs(drag.cur[1] - drag.a[1]) * S} fill="#0b63b5" fillOpacity={0.08} stroke="#0b63b5" strokeWidth={z(1.5)} strokeDasharray={`${z(5)} ${z(3)}`} pointerEvents="none" />}
        {cornerAt && <circle cx={to(cornerAt.at)[0]} cy={to(cornerAt.at)[1]} r={z(6)} fill="#fff" stroke="#c2410c" strokeWidth={z(2)} pointerEvents="none" />}
        {overlay?.(to, S, fromEvent)}
      </svg>
      <div className="draw-zoom" role="group" aria-label="Zoom">
        <button type="button" className="btn-secondary" aria-label="Zoom in" onClick={() => setView((v) => ({ x: v.x + v.w * 0.1, y: v.y + v.w * RATIO * 0.1, w: v.w * 0.8 }))}>+</button>
        <button type="button" className="btn-secondary" aria-label="Zoom out" onClick={() => setView((v) => ({ x: v.x - v.w * 0.125, y: v.y - v.w * RATIO * 0.125, w: v.w * 1.25 }))}>−</button>
        <button type="button" className="btn-secondary" onClick={() => setView(fit(house))}>Fit</button>
      </div>
      {note && <p className="draw-note" role="status">{note}</p>}
    </div>
  );
}
