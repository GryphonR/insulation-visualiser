import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { maxWallGap, onStorey, pairKey, roofEdgesOf, roofOutlines, roofParts, roofStorey, roomEdges, roomPoly } from '../engine/house';
import type { House, Room } from '../engine/house';
import { roofLines } from '../engine/house-roof';
import { freezeOutline, newRoof } from './HouseRoof';
import { centroid, dropSpikes, pointInPoly, polyArea, selfIntersects, sharedSpan } from '../engine/geom';
import type { Pt } from '../engine/geom';
import { addEmitter, addFloorZone, addRoomAt, cutPlan, deleteRoom, emitterPose, flushDelta, innerDoorAt, innerWallThickness, insertCorner, isOutside, joinedCorners, moveCorners, nearestWall, openingCentre, pieceAlign, pieceGap, pieceSeg, pieceThickness, problems, removeCorner, roomAt, splitRoom, stretchAtWall, wallIndex, wallPieces } from '../engine/house-draw';
import type { WallPiece } from '../engine/house-draw';
import { planBounds } from './HousePlan';
import { uid } from './hform';
import { href } from './route';

export type Tool = 'select' | 'box' | 'room' | 'split' | 'corner' | 'window' | 'door' | 'radiator' | 'ufh';
/** A wall of a room; with `span`, just the piece of it between two metre marks along the wall (`other` is the room it is shared with, if any). */
export interface WallRef { room: string; edge: number; span?: [number, number]; other?: string; /** Gap to the other room's line, metres (inside walls). */ gap?: number }
export interface Sel { room: string; walls: WallRef[]; item: { k: 'op' | 'em'; id: string } | null; /** A floor or ceiling zone. */ zone?: string; /** Several rooms picked with the selection box or Shift-click. */ group?: string[]; /** Arrows on the selected inside wall pick which side of the plan stretches to fit its build-up. */ stretch?: boolean }
export const NO_SEL: Sel = { room: '', walls: [], item: null };
/** What a right-click menu is for. */
type MenuFor = { k: 'wall'; wall: WallRef } | { k: 'room'; id: string } | { k: 'corner'; room: string; idx: number } | { k: 'op' | 'em'; id: string };
/** A field of the selection that the side panel can be opened on: its dropdown (build-up, glazing or radiator type), its first size, or a room's name. */
export type EditField = 'type' | 'size' | 'name';

export const GRID = 0.05;
const S = 48, MAGNET = 0.15, ALIGN = 0.15, FLUSH = 0.2;
const near = (a: Pt, b: Pt, d = 0.011) => Math.hypot(a[0] - b[0], a[1] - b[1]) < d;
interface View { x: number; y: number; w: number }

/** A view of the whole plan with a margin, never smaller than 16 m wide so an empty plan has room to draw in. `ratio` is the canvas height over its width. */
function fit(h: House, ratio: number): View {
  const pb = planBounds(h), b = { ...pb, maxX: Math.max(pb.maxX, h.guide?.w ?? 0), maxY: Math.max(pb.maxY, h.guide?.d ?? 0) };
  const w = Math.max(16, b.maxX - b.minX + 5, (b.maxY - b.minY + 5) / ratio);
  return { x: ((b.minX + b.maxX) / 2 - w / 2) * S, y: ((b.minY + b.maxY) / 2 - (w * ratio) / 2) * S, w: w * S };
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
export function DrawCanvas({ house, storey, tool, setTool, sel, setSel, upd, fill, label, below, sticky, grid, snapOn, band, roof, underlay, overlay, onEdit }: {
  house: House; storey: number; tool: Tool; setTool: (t: Tool) => void;
  sel: Sel; setSel: (s: Sel) => void; upd: (fn: (h: House) => void) => void;
  fill: (r: Room) => string; label: (r: Room) => string;
  /** Show the storeys above and below faintly, to line walls up. */
  below: boolean;
  /** Keep the drawing tool after each room, and the grid size in m and whether snapping is on. */
  sticky: boolean; grid: number; snapOn: boolean;
  /** Editing a floor or ceiling layer (zones and heated-floor loops) instead of the rooms of a storey. */
  band?: number;
  /** Editing the roof sections (drawn over the rooms of `storey`, greyed). */
  roof?: boolean;
  underlay?: (to: (p: Pt) => Pt, S: number) => ReactNode;
  /** Drawn over everything and may capture the pointer (the scale tool); `from` turns an event into snapped plan metres. */
  overlay?: (to: (p: Pt) => Pt, S: number, from: (e: React.PointerEvent) => Pt | null) => ReactNode;
  /** Open the side panel on a field of the selection (from the right-click menu). */
  onEdit?: (field: EditField) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const snap = (v: number) => Math.round(v / grid) * grid;
  const [size, setSize] = useState({ w: 900, h: 560 });
  const cw = size.w, ratio = size.h / size.w;
  const [view, setView] = useState<View>(() => fit(house, 0.62));
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
  const roofMode = !!roof;
  const zoneMode = band != null || roofMode;
  /** Digits typed while drawing a room: the length of the next wall. */
  const [typed, setTyped] = useState('');
  /** Shift held: no snapping to walls or angles. */
  const loose = useRef(false);
  const u = view.w / cw, z = (n: number) => n * u;
  const to = (p: Pt): Pt => [p[0] * S, p[1] * S];

  // The canvas fills its container, so follow its size; the first real size fits the plan to it.
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let first = true;
    const on = () => {
      const w = el.clientWidth || 900, h = el.clientHeight || 560;
      setSize({ w, h });
      if (first) { first = false; setView(fit(house, h / w)); }
    };
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  useEffect(() => { setDraft([]); setNote(''); setTyped(''); setBoxA(null); setCut(null); setMenu(null); }, [tool, storey]);
  /** The semicircle of actions opened by right-clicking something: where (px in the canvas, and plan metres) and on what. */
  const [menu, setMenu] = useState<{ x: number; y: number; at: Pt; on: MenuFor } | null>(null);
  const [menuTip, setMenuTip] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  // Focus the first button for the keyboard, but keep the label describing what was clicked until a button is hovered or arrowed to.
  useEffect(() => { if (menu) { menuRef.current?.querySelector('button')?.focus({ preventScroll: true }); setMenuTip(''); } }, [menu]);
  /** Selects what the menu is for (so the panel shows it), then opens the menu at a point on screen. */
  const openMenu = (on: MenuFor, clientX: number, clientY: number, at: Pt) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    if (on.k === 'wall') setSel({ room: on.wall.room, walls: [on.wall], item: null });
    else if (on.k === 'room') setSel({ ...NO_SEL, room: on.id });
    else if (on.k === 'corner') setSel({ ...NO_SEL, room: on.room });
    else setSel({ ...NO_SEL, room: (on.k === 'op' ? house.openings : house.heating.emitters).find((x) => x.id === on.id)?.room ?? '', item: { k: on.k, id: on.id } });
    setMenuTip('');
    setMenu({ x: clientX - box.left, y: clientY - box.top, at, on });
  };
  /** Right-click (or long-press) handler that opens the menu for `on` at the pointer. */
  const menuOn = (on: MenuFor) => (ev: React.MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); setDrag(null); openMenu(on, ev.clientX, ev.clientY, raw(ev)); };
  const closeMenu = (refocus = true) => { setMenu(null); if (refocus) svgRef.current?.focus({ preventScroll: true }); };

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
  /** The gap that leaves room for a default inside wall between two rooms. */
  const innerT = innerWallThickness(house);
  const magnet = (p: Pt, skip?: Array<[string, number]>, anchors: Pt[] = [], diag?: Pt): Pt => {
    let best: Pt | null = null, bd = MAGNET;
    for (const r of [...onThis, ...ghost]) roomPoly(r).forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd && !skip?.some(([id, j]) => id === r.id && j === i)) { bd = d; best = q; }
    });
    if (best) return best;
    let [x, y] = [snap(p[0]), snap(p[1])];
    if (loose.current) return [x, y];
    const f = flushDelta([[x, y]], [...onThis.filter((r) => !skip?.some(([id]) => id === r.id)), ...ghost].map(roomPoly), ALIGN, innerT);
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
          .flatMap((c) => (innerT > 0.005 ? [c, c + innerT, c - innerT] : [c]))
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
      const f = flushDelta(onThis.filter((r) => ids.includes(r.id)).flatMap(roomPoly).map((q): Pt => [q[0] + g[0], q[1] + g[1]]), [...onThis.filter((r) => !ids.includes(r.id)), ...ghost].map(roomPoly), FLUSH, innerT);
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

  // A floor or ceiling layer shows all its zones; a storey shows the underfloor heating zones in its floor.
  type ZoneLike = { id: string; poly: Pt[]; name: string; buildup: string; ufh?: boolean };
  const zones: ZoneLike[] = roofMode
    ? house.roofs.flatMap((r) => roofOutlines(house, r).slice(0, 1).map((poly) => ({ id: r.id, poly, name: r.name, buildup: '' })))
    : (house.zones ?? []).filter((z) => (zoneMode ? z.band === band : !!z.ufh && z.band === storey));
  /** Change a zone's or roof's outline; a roof that follows the rooms first gets an outline of its own, and per-edge settings follow the corners. */
  const editPoly = (h: House, id: string, op: { move?: (q: Pt, i: number) => Pt; insert?: [number, Pt]; remove?: number }) => {
    const round = (q: Pt): Pt => [+q[0].toFixed(3), +q[1].toFixed(3)];
    const apply = (poly: Pt[]) => {
      if (op.move) return poly.map((q, i) => round(op.move!(q, i)));
      if (op.insert) { const p = [...poly]; p.splice(op.insert[0] + 1, 0, round(op.insert[1])); return p; }
      if (op.remove != null && poly.length > 3) return poly.filter((_, i) => i !== op.remove);
      return poly;
    };
    if (!roofMode) { const x = h.zones?.find((q) => q.id === id); if (x) x.poly = apply(x.poly); return; }
    const r = h.roofs.find((q) => q.id === id);
    if (!r) return;
    freezeOutline(h, r);
    if (!r.poly) return;
    if (r.form === 'custom') {
      const es = roofEdgesOf(r, r.poly);
      if (op.insert) es.splice(op.insert[0] + 1, 0, { ...es[op.insert[0]] });
      if (op.remove != null && r.poly.length > 3) es.splice(op.remove, 1);
      r.edges = es;
    }
    r.poly = apply(r.poly);
  };
  // Ridges, hips and valleys of every roof, and which edges are eaves.
  const roofDraw = useMemo(() => (roofMode ? roofParts(house).map((p) => ({ id: p.sec.id, lines: roofLines(p.model, 0.1), kinds: p.model.edges, poly: p.poly })) : []), [roofMode, house]);
  const zoneDelta = (d: Extract<Drag, { k: 'zone' }>): Pt => {
    const z = zones.find((q) => q.id === d.id);
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
    // The pointer is captured on its first move (in move), so a click without a drag still reaches what was pressed and its double-click works.
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
  const openingAt = (p: Pt, w: number, inner = false, only?: string): { room: Room; edge: number; t: number; to?: string } | null => {
    const hit = nearestWall(house, storey, p, 0.6, { outside: true, room: only });
    const r = hit && house.rooms.find((x) => x.id === hit.room);
    const t = hit && r ? openingCentre(house, r, hit.edge, storey, hit.t, w) : null;
    if (hit && r && t != null) return { room: r, edge: hit.edge, t };
    if (!inner) return null;
    const hi = nearestWall(house, storey, p, 0.6, { room: only }), ri = hi && house.rooms.find((x) => x.id === hi.room), d = hi && ri ? innerDoorAt(house, ri, hi.edge, storey, hi.t, w) : null;
    return hi && ri && d ? { room: ri, edge: hi.edge, t: d.t, to: d.to } : null;
  };
  /** A window or door at a pointer position (on room `only`'s walls, if given), selected once placed. */
  const placeOpening = (p: Pt, door: boolean, only?: string) => {
    const w = door ? 0.9 : 1.2, at = openingAt(p, w, door, only);
    const b = house.buildups.find((x) => x.kind === (door ? 'door' : 'glazing'));
    if (!at) { setNote(door ? 'Doors go on outside walls, or on a wall shared with another room, in a clear stretch wide enough.' : 'Windows go on outside walls, in a clear stretch wide enough for them.'); return; }
    if (!b) { setNote(`Add a ${door ? 'door' : 'glazing'} build-up first.`); return; }
    const id = uid('o'), side = roomEdges(at.room)[at.edge].side;
    upd((h) => { h.openings.push({ id, room: at.room.id, side, name: door ? 'Door' : 'Window', w, h: door ? 2.0 : 1.2, buildup: b.id, edge: at.edge, t: at.t, ...(at.to ? { to: at.to } : {}) }); });
    setSel({ room: at.room.id, walls: [], item: { k: 'op', id } });
  };
  /** A corner on wall `edge` of a room, at the grid point nearest `q`. */
  const addCornerAt = (room: string, edge: number, q: Pt) => {
    const hit = nearestWall(house, storey, q, 0.5, { room });
    if (hit && hit.edge === edge) upd((h) => insertCorner(h, room, edge, [snap(hit.at[0]), snap(hit.at[1])]));
  };

  /** A new room (or, on a floor or ceiling layer, a zone; with the UFH tool, an underfloor heating zone in this floor) with this outline. */
  const create = (pts: Pt[]) => {
    const id = uid(zoneMode || tool === 'ufh' ? 'z' : 'r');
    if (tool === 'ufh') { upd((h) => addFloorZone(h, id, band ?? storey, pts, true)); setSel({ ...NO_SEL, zone: id }); }
    else if (roofMode) {
      const r = newRoof(house, pts);
      if (storey !== house.storeys.length - 1) r.storey = storey;
      upd((h) => { h.roofs.push(r); });
      setSel({ ...NO_SEL, zone: r.id });
    }
    else if (zoneMode) { upd((h) => addFloorZone(h, id, band!, pts)); setSel({ ...NO_SEL, zone: id }); }
    else { upd((h) => { addRoomAt(h, id, pts, storey); }); setSel({ room: id, walls: [], item: null }); }
    if (!sticky) setTool('select');
  };
  const closeDraft = (drawn: Pt[]) => {
    const pts = dropSpikes(drawn);
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
    // The right button only opens the wall menu (on contextmenu): it never drags, pans, draws or clears the selection.
    if (e.button === 2) { e.stopPropagation(); return; }
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
    // The UFH tool drags out a rectangle like Box room, or (after a first click) takes corners like Room.
    if (tool === 'box' || (tool === 'ufh' && !draft.length)) {
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
    if (tool === 'room' || tool === 'ufh') {
      const last = draft[draft.length - 1], q = draftPt(p);
      // Close on a click within 0.2 m or 12 px of the first corner, whichever is bigger at this zoom.
      if (draft.length >= 3 && (near(q, draft[0], 0.2) || near(p, draft[0], z(12 * hs) / S))) { closeDraft(draft); return; }
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
    if (tool === 'window' || tool === 'door') { placeOpening(p, tool === 'door'); return; }
    placeEmitter(p);
  };
  /** A radiator in the heated room at a pointer position, on the nearest wall if one is close. */
  const placeEmitter = (p: Pt) => {
    const at = emitterAt(p, 'radiator'), id = uid('e');
    if (!at) { setNote('Click inside a room to place it.'); return; }
    if (!at.room.heated) { setNote(`${at.room.name} is unheated; switch it to heated first.`); return; }
    upd((h) => { addEmitter(h, at.room.id, 'radiator', id); const e = h.heating.emitters[h.heating.emitters.length - 1]; e.at = at.at; e.ang = at.ang; });
    setSel({ room: at.room.id, walls: [], item: null });
  };

  const move = (e: React.PointerEvent) => {
    if (drag && e.buttons && !svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current?.setPointerCapture(e.pointerId);
    loose.current = e.shiftKey || !snapOn;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], f = pinch.current.d / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1), v = pinch.current.v, r = svgRef.current!.getBoundingClientRect();
      const q = { x: v.x + (((a[0] + b[0]) / 2 - r.left) / r.width) * v.w, y: v.y + (((a[1] + b[1]) / 2 - r.top) / r.height) * v.w * ratio };
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
      if (w < 0.2 && dd < 0.2) {
        if (tool === 'ufh') { setDraft([d.a]); setNote('Click each corner of the zone; click the first one, double-click or press Enter to finish.'); return; }
        setBoxA(d.a); setNote('Now click the opposite corner.'); return;
      }
      if (w < 0.5 || dd < 0.5) { setNote('Drag out a box at least 0.5 m each way.'); return; }
      const x0 = Math.min(d.a[0], d.cur[0]), y0 = Math.min(d.a[1], d.cur[1]);
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
      upd((h) => editPoly(h, d.id, { move: (q, i) => (d.idx == null || d.idx === i ? [q[0] + dl[0], q[1] + dl[1]] : q) }));
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

  /** Tools that take an outline corner by corner. */
  const outline = tool === 'room' || tool === 'ufh';
  const key = (e: React.KeyboardEvent) => {
    if (tool === 'select' && !zoneMode && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      // The keyboard way to the menu: for the selected wall, window, door, emitter or room, opened at its middle.
      e.preventDefault();
      const t = ((): { on: MenuFor; at: Pt } | null => {
        if (sel.walls.length === 1) {
          const w = sel.walls[0], seg = pieceSeg(house, w.room, w.edge, w.span ?? [0, roomEdges(house.rooms.find((r) => r.id === w.room)!)[w.edge].len]);
          return seg && { on: { k: 'wall', wall: w }, at: [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2] };
        }
        if (sel.item?.k === 'op') {
          const o = house.openings.find((x) => x.id === sel.item!.id), r = o && house.rooms.find((x) => x.id === o.room), ed = o && r && roomEdges(r)[wallIndex(house, o)];
          return ed ? { on: { k: 'op', id: o.id }, at: [ed.a[0] + ed.d[0] * (o.t ?? ed.len / 2), ed.a[1] + ed.d[1] * (o.t ?? ed.len / 2)] } : null;
        }
        if (sel.item?.k === 'em') {
          const em = house.heating.emitters.find((x) => x.id === sel.item!.id), ps = em && emitterPose(house, em);
          return ps ? { on: { k: 'em', id: em.id }, at: ps.at } : null;
        }
        const r = onThis.find((x) => x.id === sel.room);
        return r ? { on: { k: 'room', id: r.id }, at: centroid(roomPoly(r)) } : null;
      })(), m = svgRef.current?.getScreenCTM();
      if (!t || !m) return;
      const q = new DOMPoint(t.at[0] * S, t.at[1] * S).matrixTransform(m);
      openMenu(t.on, q.x, q.y, t.at);
      return;
    }
    if (e.key === 'Escape') { setDraft([]); setNote(''); setTyped(''); setDrag(null); setTool('select'); }
    else if (outline && draft.length && /^[0-9.]$/.test(e.key)) setTyped(typed + e.key);
    else if (outline && e.key === 'Enter' && Number(typed) >= 0.1) { setDraft([...draft, draftPt(hover ?? draft[draft.length - 1])]); setTyped(''); }
    else if (outline && e.key === 'Enter') closeDraft(draft);
    else if (outline && e.key === 'Backspace') { if (typed) setTyped(typed.slice(0, -1)); else setDraft(draft.slice(0, -1)); }
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
      else if (sel.zone) upd((h) => { h.zones = h.zones?.filter((z) => z.id !== sel.zone); h.roofs = h.roofs.filter((z) => z.id !== sel.zone); });
      else if (!sel.walls.length && sel.room) { const ids = sel.group?.length ? sel.group : [sel.room]; upd((h) => ids.forEach((id) => deleteRoom(h, id))); setSel(NO_SEL); return; }
      else return;
      setSel({ ...sel, item: null });
    }
  };

  // --- drawing -----------------------------------------------------------------------------------
  const pts = (p: Pt[]) => p.map((q) => to(q).join(',')).join(' ');
  // Walls are picked a piece at a time (outside stretch, or the stretch shared with one neighbour). A shared piece is one wall from either room's side.
  const near2 = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.03;
  type WId = { seg: [Pt, Pt]; pair: string | null };
  // The same wall seen from two rooms: lines that coincide, or (a wall drawn with thickness between two rooms) the same pair of rooms a wall's thickness apart.
  const sameWall = (a: WId, b: WId) => (near2(a.seg[0], b.seg[0]) && near2(a.seg[1], b.seg[1])) || (near2(a.seg[0], b.seg[1]) && near2(a.seg[1], b.seg[0]))
    || (!!a.pair && a.pair === b.pair && Math.hypot((a.seg[0][0] + a.seg[1][0] - b.seg[0][0] - b.seg[1][0]) / 2, (a.seg[0][1] + a.seg[1][1] - b.seg[0][1] - b.seg[1][1]) / 2) < 0.65);
  const idsOf = (w: WallRef): WId[] => (w.span ? [{ room: w.room, span: w.span, other: w.other }] : wallPieces(house, w.room, w.edge, storey).map((q) => ({ room: w.room, span: q.span, other: q.other })))
    .flatMap((q) => { const seg = pieceSeg(house, w.room, w.edge, q.span); return seg ? [{ seg, pair: q.other ? pairKey(q.room, q.other) : null }] : []; });
  const idOf = (room: string, edge: number, piece: { span: [number, number]; other?: string }): WId | null => idsOf({ room, edge, span: piece.span, other: piece.other })[0] ?? null;
  const isSelPiece = (room: string, edge: number, piece: { span: [number, number]; other?: string }) => {
    const me = idOf(room, edge, piece);
    return !!me && sel.walls.some((w) => idsOf(w).some((q) => sameWall(q, me)));
  };
  const dimOf = (r: Room, p: Pt[]) => roomEdges({ ...r, poly: p, x: 0, y: 0 }).map((e) => ({ e, mid: to([(e.a[0] + e.b[0]) / 2 + e.n[0] * 0.28, (e.a[1] + e.b[1]) / 2 + e.n[1] * 0.28]) }));
  const wallClick = (e: React.PointerEvent, r: Room, i: number, piece: WallPiece) => {
    const same = isSelPiece(r.id, i, piece), multi = e.shiftKey || e.ctrlKey || e.metaKey, me = idOf(r.id, i, piece);
    const ref: WallRef = { room: r.id, edge: i, span: piece.span, ...(piece.other ? { other: piece.other, gap: piece.gap } : {}) };
    const walls = multi ? (same ? sel.walls.filter((w) => !idsOf(w).some((q) => me && sameWall(q, me))) : [...sel.walls, ref]) : same && sel.walls.length === 1 ? sel.walls : [ref];
    setSel({ room: r.id, walls, item: null });
    const es = roomEdges(r), n = es.length;
    begin(e, { k: 'move', start: raw(e), cur: raw(e), verts: together(r.id, [i, (i + 1) % n], e.altKey, i), base: roomPoly(r)[i], normal: es[i].n, free: false, moved: false });
  };

  /** Pointer handlers on a wall: press to select and drag, double-click for a corner, right-click (or long-press) for the wall menu. */
  const wallEvents = (r: Room, i: number, piece: WallPiece) => ({
    onPointerDown: (ev: React.PointerEvent) => wallClick(ev, r, i, piece),
    onDoubleClick: (ev: React.MouseEvent) => { ev.stopPropagation(); addCornerAt(r.id, i, raw(ev)); },
    onContextMenu: menuOn({ k: 'wall', wall: { room: r.id, edge: i, span: piece.span, ...(piece.other ? { other: piece.other, gap: piece.gap } : {}) } }),
  });

  /** True where the wall at `t` metres along edge `idx` is drawn with thickness (the window or door is then drawn as a thin strip across it). */
  const wallIsThick = (room: string, idx: number, t: number) => {
    const pc = wallPieces(house, room, idx, storey).find((p) => t >= p.span[0] - 0.01 && t <= p.span[1] + 0.01);
    return !!pc && ((pc.gap ?? 0) > 0.01 || pieceThickness(house, room, idx, storey, pc) > 0);
  };

  const hv = hover;
  const probs = useMemo(() => problems(house, storey), [house, storey]);
  const grp = sel.group ?? [];
  // Guides: dashed lines from the point being placed to every corner it lines up with.
  const target: Pt | null = outline && hv && (tool === 'room' || draft.length) ? draftPt(hv) : drag?.k === 'box' ? drag.cur : drag?.k === 'move' && drag.free ? (() => { const dl = delta(drag); return [drag.base[0] + dl[0], drag.base[1] + dl[1]] as Pt; })()
    : tool === 'split' && hv ? magnet(hv, undefined, cut ? [cut] : []) : null;
  const guides = target ? [...onThis, ...ghost].flatMap((r) => roomPoly(r).filter((_, i) => !(drag?.k === 'move' && drag.verts.some(([id, j]) => id === r.id && j === i)))).concat(draft).flatMap((q): Array<[Pt, Pt]> => {
    const sx = Math.abs(q[0] - target[0]) < 1e-6, sy = Math.abs(q[1] - target[1]) < 1e-6;
    return sx !== sy ? [[q, target]] : [];
  }) : [];
  const cutLine = tool === 'split' && cut && hv ? magnet(hv, undefined, [cut]) : null;
  const cutHit = cut && cutLine ? onThis.map((r) => cutPlan(roomPoly(r), cut, cutLine)).find((x) => x) : null;
  const pose = (tool === 'window' || tool === 'door') && hv ? openingAt(hv, tool === 'door' ? 0.9 : 1.2, tool === 'door') : null;
  const eg = tool === 'radiator' && hv ? emitterAt(hv, 'radiator') : null;
  const cornerAt = tool === 'corner' && hv ? nearestWall(house, storey, hv, 0.4) : null;
  const cursor = drag?.k === 'pan' && drag.moved ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair';
  const dragPoly = drag?.k === 'move' ? onThis.filter((r) => drag.verts.some(([id]) => id === r.id)) : [];

  // Walls, as thick as their build-up: all the bands first (so where they meet they read as one wall), the selected ones on top, then the drawn lines.
  // Memoised: the walls are the costly part of a render, and hovering re-renders the canvas on every pointer move.
  const gapMax = maxWallGap(house) + 0.03;
  // A corner of a room that lies against another room's wall is a T-junction, not an outside corner: its wall must not stick out there.
  const atOther = (r: Room, p: Pt) => onThis.some((o) => o.id !== r.id && (pointInPoly(p, roomPoly(o)) || roomEdges(o).some((f) => {
    const t = Math.max(0, Math.min(f.len, (p[0] - f.a[0]) * f.d[0] + (p[1] - f.a[1]) * f.d[1]));
    return Math.hypot(p[0] - f.a[0] - f.d[0] * t, p[1] - f.a[1] - f.d[1] * t) <= gapMax;
  })));
  // Windows and doors of a room on one of its walls, as two points in the plan (placed the way they are drawn).
  const opsOn = (room: Room, e: { idx: number; side: string; len: number; a: Pt; d: Pt }) => {
    const es = roomEdges(room), isPoly = !!room.poly;
    const ops = house.openings.filter((o) => o.room === room.id && (isPoly ? (o.edge ?? es.findIndex((x) => x.side === o.side)) === e.idx : o.side === e.side));
    return ops.map((o, i) => {
      const half = Math.min(o.w, e.len) / 2, c = o.t != null ? Math.max(half, Math.min(e.len - half, o.t)) : (e.len * (i + 0.5)) / ops.length;
      return { room, door: house.buildups.find((x) => x.id === o.buildup)?.kind === 'door', p: [e.a[0] + e.d[0] * (c - half), e.a[1] + e.d[1] * (c - half)] as Pt, q: [e.a[0] + e.d[0] * (c + half), e.a[1] + e.d[1] * (c + half)] as Pt };
    });
  };
  const wallItems = (r: Room, moving: boolean) => {
    return roomEdges({ ...r, poly: polyOf(r), x: 0, y: 0 }).flatMap((e) => {
      // While a wall is being dragged the pieces are not recomputed: the whole wall moves as one.
      const pieces: WallPiece[] = moving ? [{ span: [0, e.len] }] : wallPieces(house, r.id, e.idx, storey);
      return pieces.map((pc, k) => {
        const s = !moving && isSelPiece(r.id, e.idx, pc) || (moving && sel.walls.some((w) => w.room === r.id && w.edge === e.idx));
        // Thickness comes from the build-up, on the side of the line the alignment says; rooms drawn a wall apart share a wall that fills the space between them.
        const between = !moving && !!pc.other && (pc.gap ?? 0) > 0.01;
        const th = moving ? 0 : between ? pc.gap! : pieceThickness(house, r.id, e.idx, storey, pc), al = between ? 'out' : pieceAlign(house, r.id, e.idx, storey, pc);
        const tm = Math.max(th, z(3) / S), lo = al === 'out' ? 0 : al === 'in' ? -tm : -tm / 2, hi = al === 'out' ? tm : al === 'in' ? 0 : tm / 2;
        const reach = al === 'out' ? tm : al === 'ctr' ? tm / 2 : 0;
        const p0: Pt = [e.a[0] + e.d[0] * pc.span[0], e.a[1] + e.d[1] * pc.span[0]], p1: Pt = [e.a[0] + e.d[0] * pc.span[1], e.a[1] + e.d[1] * pc.span[1]];
        const atStart = pc.span[0] < 1e-6, atEnd = pc.span[1] > e.len - 1e-6;
        const x0 = !between && atStart && !atOther(r, p0) ? reach : 0, x1 = !between && atEnd && !atOther(r, p1) ? reach : 0;
        const q = (t: number, o: number) => to([e.a[0] + e.d[0] * t + e.n[0] * o, e.a[1] + e.d[1] * t + e.n[1] * o]).join(',');
        const owns = th > 0 && (!pc.other || r.id < pc.other);
        const hit = owns ? [q(pc.span[0] - x0, lo), q(pc.span[1] + x1, lo), q(pc.span[1] + x1, hi), q(pc.span[0] - x0, hi)].join(' ') : null;
        const bands: string[] = [], strips: Array<{ pts: string; door: boolean }> = [], cuts: Array<{ pts: string; color: string }> = [];
        if (owns) {
          // Windows and doors cut the wall: where one sits, only a thin strip is left.
          const holes: Array<[number, number, boolean, Room]> = [];
          const take = (o: { room: Room; door: boolean; p: Pt; q: Pt }) => {
            const t = (v: Pt) => (v[0] - e.a[0]) * e.d[0] + (v[1] - e.a[1]) * e.d[1], n = (v: Pt) => (v[0] - e.a[0]) * e.n[0] + (v[1] - e.a[1]) * e.n[1];
            const t0 = Math.max(pc.span[0], Math.min(t(o.p), t(o.q))), t1 = Math.min(pc.span[1], Math.max(t(o.p), t(o.q)));
            if (t1 - t0 > 0.02 && Math.abs(n(o.p)) <= gapMax && Math.abs(n(o.q)) <= gapMax) holes.push([t0, t1, o.door, o.room]);
          };
          if (!moving) {
            opsOn(r, e).forEach(take);
            const other = pc.other ? house.rooms.find((x) => x.id === pc.other) : null;
            if (other) roomEdges(other).forEach((f) => { if (sharedSpan(e, f, 0.02, gapMax)) opsOn(other, f).forEach(take); });
          }
          holes.sort((u, v) => u[0] - v[0]);
          let at = pc.span[0] - x0;
          for (const [t0, t1, door] of holes) {
            // The cut shows what is on each side of the thin strip: this room's colour on its side, and the colour of the room behind an inside wall, or of the outside for an outside wall.
            const mid = (lo + hi) / 2, near = zoneMode ? '#f7f7f4' : fill(r), far = pc.other ? (zoneMode ? '#f7f7f4' : fill(house.rooms.find((x) => x.id === pc.other) ?? r)) : '#fff';
            cuts.push({ pts: [q(t0, lo), q(t1, lo), q(t1, mid), q(t0, mid)].join(' '), color: near }, { pts: [q(t0, mid), q(t1, mid), q(t1, hi), q(t0, hi)].join(' '), color: far });
            if (t0 > at) bands.push([q(at, lo), q(t0, lo), q(t0, hi), q(at, hi)].join(' '));
            const m = (lo + hi) / 2, thin = Math.min(tm, Math.max(0.06, z(2) / S));
            strips.push({ pts: [q(t0, m - thin / 2), q(t1, m - thin / 2), q(t1, m + thin / 2), q(t0, m + thin / 2)].join(' '), door });
            at = Math.max(at, t1);
          }
          if (pc.span[1] + x1 > at) bands.push([q(at, lo), q(pc.span[1] + x1, lo), q(pc.span[1] + x1, hi), q(at, hi)].join(' '));
          // An outside wall carries on across an inside wall that ends against it: bridge to the next room's outside wall on the same line.
          if (!pc.other && !moving) for (const [end, at2] of [[atStart, 0], [atEnd, e.len]] as const) {
            if (!end) continue;
            for (const o of onThis) if (o.id !== r.id) for (const f of roomEdges(o)) {
              // The same outside face, on the same line (whichever way the outline is wound), starting just past this wall's end.
              if (f.n[0] * e.n[0] + f.n[1] * e.n[1] < 0.999 || Math.abs((f.a[0] - e.a[0]) * e.n[0] + (f.a[1] - e.a[1]) * e.n[1]) > 0.02) continue;
              const ts = [f.a, f.b].map((v) => (v[0] - e.a[0]) * e.d[0] + (v[1] - e.a[1]) * e.d[1]);
              const beyond = ts.filter((v) => (at2 === 0 ? v <= 0.001 && v >= -gapMax : v >= e.len - 0.001 && v <= e.len + gapMax));
              if (!beyond.length || Math.abs(ts[0] - ts[1]) < 0.01) continue;
              const far = at2 === 0 ? Math.max(...beyond) : Math.min(...beyond);
              if (Math.abs(far - at2) > 0.001) bands.push([q(at2, lo), q(far, lo), q(far, hi), q(at2, hi)].join(' '));
            }
          }
        }
        return { key: `${r.id}-${e.idx}-${k}`, r, e, pc, s, th, hit, bands, strips, cuts, a: to(p0), b: to(p1), out: !pc.other };
      });
    });
  };
  const moveDrag = drag?.k === 'move' ? drag : null;
  const movingKey = moveDrag?.moved ? [...new Set(moveDrag.verts.map(([id]) => id))].join() : '';
  // The walls of the rooms not being dragged only change with the plan, the selection or the zoom, so a drag rebuilds just the moving rooms' walls.
  const still = useMemo(() => new Map(onThis.filter((r) => !movingKey.split(',').includes(r.id)).map((r) => [r.id, wallItems(r, false)])),
    [house, storey, zoneMode, fill, u, sel, movingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wallLayer = useMemo(() => {
    const items = onThis.flatMap((r) => still.get(r.id) ?? wallItems(r, true));
    return (
      <>
        {/* Closing (grow, then shrink) fills the small squares left where inside walls meet at a junction. */}
        <defs><filter id="wall-close" x="-10%" y="-10%" width="120%" height="120%"><feMorphology operator="dilate" radius={Math.min(gapMax / 2, 0.12) * S} /><feMorphology operator="erode" radius={Math.min(gapMax / 2, 0.12) * S} /></filter></defs>
        <g filter="url(#wall-close)">
          {items.filter((i) => !i.s).flatMap((i) => i.bands.map((pts, n) => <polygon key={`b${i.key}-${n}`} points={pts} fill="#26343f" pointerEvents="none" />))}
        </g>
        {items.flatMap((i) => i.cuts.map((c, n) => <polygon key={`c${i.key}-${n}`} points={c.pts} fill={c.color} fillOpacity={0.92} pointerEvents="none" />))}
        {items.filter((i) => i.s).flatMap((i) => i.bands.map((pts, n) => <polygon key={`s${i.key}-${n}`} points={pts} fill="#c2410c" pointerEvents="none" />))}
        {items.flatMap((i) => i.strips.map((t, n) => <polygon key={`t${i.key}-${n}`} points={t.pts} fill={t.door ? '#8a5a2b' : '#1f6fb5'} pointerEvents="none" />))}
        {items.map((i) => (
          <g key={i.key}>
            <line x1={i.a[0]} y1={i.a[1]} x2={i.b[0]} y2={i.b[1]} stroke={i.th > 0 ? (i.s ? '#fff' : '#9fb0bc') : i.s ? '#c2410c' : '#14212b'} strokeWidth={i.th > 0 ? z(1) : z(i.s ? 5 : i.out ? 4 : 2)} strokeDasharray={i.th > 0 ? `${z(5)} ${z(3)}` : undefined} strokeLinecap={i.th > 0 || i.pc.span[0] > 1e-6 || i.pc.span[1] < i.e.len - 1e-6 ? 'butt' : 'round'} pointerEvents="none" />
            {tool === 'select' && !zoneMode && i.hit && <polygon points={i.hit} fill="transparent" className="wall-hit" {...wallEvents(i.r, i.e.idx, i.pc)} />}
            {tool === 'select' && !zoneMode && <line x1={i.a[0]} y1={i.a[1]} x2={i.b[0]} y2={i.b[1]} stroke="transparent" strokeWidth={z(14 * hs)} className="wall-hit" {...wallEvents(i.r, i.e.idx, i.pc)} />}
          </g>
        ))}
      </>
    );
  }, [still, house, storey, zoneMode, fill, u, sel, tool, hs, grid, moveDrag]); // eslint-disable-line react-hooks/exhaustive-deps

  const opDrag = drag?.k === 'op' ? drag : null;
  const opLayer = useMemo(() => zoneMode ? null : onThis.flatMap((r) => {
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
                  {!wallIsThick(r.id, e.idx, c) && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={door ? '#8a5a2b' : '#1f6fb5'} strokeWidth={z(6)} pointerEvents="none" />}
                  {tool === 'select' && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={z(16 * hs)} style={{ cursor: 'grab' }}
                    onPointerDown={(ev) => { setSel({ room: r.id, walls: [], item: { k: 'op', id: o.id } }); begin(ev, { k: 'op', id: o.id, start: raw(ev), cur: raw(ev), moved: false }); }}
                    onContextMenu={menuOn({ k: 'op', id: o.id })} />}
                </g>
              );
            });
          });
  }), [house, storey, zoneMode, u, sel, tool, hs, opDrag]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="draw-wrap">
      <svg ref={svgRef} className="draw" tabIndex={0} style={{ cursor }} viewBox={`${view.x} ${view.y} ${view.w} ${view.w * ratio}`} role="application"
        aria-label={`${house.storeys[storey]?.name} drawing canvas`} onPointerDownCapture={trackDown} onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release}
        onPointerLeave={() => setHover(null)} onKeyDown={key} onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={() => { if (outline) closeDraft(draft); }}>
        <defs>
          <pattern id="zone-hatch" width={z(9)} height={z(9)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={z(9)} height={z(9)} fill="#0b8a7a" fillOpacity={0.12} /><line x1={0} y1={0} x2={0} y2={z(9)} stroke="#0b8a7a" strokeWidth={z(2.5)} strokeOpacity={0.55} />
          </pattern>
          <pattern id="roof-hatch" width={z(10)} height={z(10)} patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <rect width={z(10)} height={z(10)} fill="#5b4a8a" fillOpacity={0.07} /><line x1={0} y1={0} x2={0} y2={z(10)} stroke="#5b4a8a" strokeWidth={z(1.2)} strokeOpacity={0.3} />
          </pattern>
          <pattern id="ufh-hatch" width={z(9)} height={z(9)} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width={z(9)} height={z(9)} fill="#b45309" fillOpacity={0.1} /><line x1={0} y1={0} x2={0} y2={z(9)} stroke="#b45309" strokeWidth={z(2)} strokeOpacity={0.5} />
          </pattern>
          <pattern id="draw-grid" width={S} height={S} patternUnits="userSpaceOnUse"><path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#d7dde2" strokeWidth={z(1)} /></pattern>
        </defs>
        <rect x={view.x} y={view.y} width={view.w} height={view.w * ratio} fill="#fff" />
        <rect x={view.x} y={view.y} width={view.w} height={view.w * ratio} fill="url(#draw-grid)" pointerEvents="none" />
        <line x1={view.x} x2={view.x + view.w} y1={0} y2={0} stroke="#b9c4cc" strokeWidth={z(1)} strokeDasharray={`${z(6)} ${z(4)}`} pointerEvents="none" />
        {house.guide && <g pointerEvents="none"><rect x={0} y={0} width={house.guide.w * S} height={house.guide.d * S} fill="none" stroke="#8a99a6" strokeWidth={z(1.5)} strokeDasharray={`${z(8)} ${z(5)}`} /><text x={z(6)} y={-z(6)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{house.guide.w} × {house.guide.d} m footprint</text></g>}
        <line y1={view.y} y2={view.y + view.w * ratio} x1={0} x2={0} stroke="#b9c4cc" strokeWidth={z(1)} strokeDasharray={`${z(6)} ${z(4)}`} pointerEvents="none" />
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
                } : undefined}
                onDoubleClick={tool === 'select' && !zoneMode ? () => { location.hash = href('room', r.id); } : undefined}
                onContextMenu={tool === 'select' && !zoneMode ? menuOn({ k: 'room', id: r.id }) : undefined} />
              <text x={c[0]} y={c[1] - z(3)} textAnchor="middle" className="plan-t" style={{ fontSize: z(13) }}>{r.name}</text>
              <text x={c[0]} y={c[1] + z(12)} textAnchor="middle" className="plan-s" style={{ fontSize: z(12) }}>{zoneMode ? '' : label(r)}</text>
              <text x={c[0]} y={c[1] + z(26)} textAnchor="middle" className="plan-s" style={{ fontSize: z(11) }}>{polyArea(p).toFixed(1)} m²</text>
              {r.span > 1 && storey > r.storey && <text x={c[0]} y={c[1] + z(39)} textAnchor="middle" className="plan-s" style={{ fontSize: z(12) }}>(open to below)</text>}
              {on && <polygon points={pts(p)} fill="none" stroke="#c2410c" strokeWidth={z(1.5)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />}
            </g>
          );
        })}

        {wallLayer}

        {/* Problems: rooms overlapping or crossing themselves, and walls that almost touch */}
        {!zoneMode && onThis.filter((r) => probs.overlap.has(r.id)).map((r) => <polygon key={`o${r.id}`} points={pts(polyOf(r))} fill="none" stroke="#c0392b" strokeWidth={z(3)} strokeDasharray={`${z(8)} ${z(4)}`} pointerEvents="none"><title>{r.name} overlaps another room</title></polygon>)}
        {!zoneMode && probs.gaps.map((g, i) => (
          <g key={`g${i}`} pointerEvents="none">
            <line x1={to(g.a)[0]} y1={to(g.a)[1]} x2={to(g.b)[0]} y2={to(g.b)[1]} stroke="#d99a00" strokeWidth={z(7)} opacity={0.7} />
            <text x={(to(g.a)[0] + to(g.b)[0]) / 2} y={(to(g.a)[1] + to(g.b)[1]) / 2 - z(8)} textAnchor="middle" className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{(g.gap * 100).toFixed(0)} cm gap</text>
          </g>
        ))}

        {/* Stretching the plan to fit an inside wall: an arrow each side of it, for the side that moves. */}
        {!zoneMode && sel.stretch && sel.walls.length === 1 && (() => {
          const w = sel.walls[0], r = house.rooms.find((x) => x.id === w.room), e = r && roomEdges(r)[w.edge];
          const gap = e && w.other ? pieceGap(house, w.room, w.edge, storey, w) : 0;
          if (!e || !w.span || !w.other || gap <= 0.01) return null;
          const by = pieceThickness(house, w.room, w.edge, storey, w) - gap, tm = (w.span[0] + w.span[1]) / 2;
          const m: Pt = [e.a[0] + e.d[0] * tm + e.n[0] * gap / 2, e.a[1] + e.d[1] * tm + e.n[1] * gap / 2];
          const name = (id: string) => house.rooms.find((x) => x.id === id)?.name ?? 'this';
          return ([1, -1] as const).map((side) => {
            const off = gap / 2 + z(30 * hs) / S, c = to([m[0] + e.n[0] * side * off, m[1] + e.n[1] * side * off]);
            // Points away from the wall when it gets thicker, towards it when thinner.
            const ang = (Math.atan2(e.n[1] * side, e.n[0] * side) * 180) / Math.PI + (by < 0 ? 180 : 0);
            return (
              <g key={side} transform={`translate(${c[0]} ${c[1]}) rotate(${ang})`} style={{ cursor: 'pointer' }} role="button" aria-label={`Move ${name(side === 1 ? w.other! : w.room)}'s side of the plan`}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  upd((h) => stretchAtWall(h, w.room, w.edge, gap, by, side));
                  setSel({ ...sel, stretch: undefined });
                }}>
                <title>{`Move everything on ${name(side === 1 ? w.other! : w.room)}'s side ${Math.round(Math.abs(by) * 1000)} mm ${by > 0 ? 'out' : 'in'}`}</title>
                <circle r={z(16 * hs)} fill="#c2410c" />
                <path d={`M ${z(-8)} ${z(-6)} L ${z(2)} ${z(-6)} L ${z(2)} ${z(-11)} L ${z(11)} 0 L ${z(2)} ${z(11)} L ${z(2)} ${z(6)} L ${z(-8)} ${z(6)} Z`} fill="#fff" />
              </g>
            );
          });
        })()}

        {/* Floor and ceiling zones; on a storey, its underfloor heating zones, moved by their label (the rooms under them stay clickable). */}
        {zones.map((zn) => {
          const pz = zonePoly(zn), c = to(centroid(pz)), on = sel.zone === zn.id, bu = house.buildups.find((x) => x.id === zn.buildup);
          const nearEdge = (q: Pt) => { let best = { i: -1, d: 0.5 }; pz.forEach((a, i) => { const b = pz[(i + 1) % pz.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L))), d = Math.hypot(q[0] - a[0] - u * (b[0] - a[0]), q[1] - a[1] - u * (b[1] - a[1])); if (d < best.d) best = { i, d }; }); return best.i; };
          return (
            <g key={zn.id}>
              <polygon points={pts(pz)} fill={roofMode ? 'url(#roof-hatch)' : zn.ufh ? 'url(#ufh-hatch)' : 'url(#zone-hatch)'} stroke={on ? '#c2410c' : roofMode ? '#5b4a8a' : zn.ufh ? '#b45309' : '#0b8a7a'} strokeWidth={z(on ? 2.5 : 1.8)} strokeDasharray={zn.ufh ? `${z(6)} ${z(3)}` : undefined}
                style={{ cursor: tool === 'select' ? 'move' : undefined }} pointerEvents={zoneMode && tool === 'select' ? undefined : 'none'}
                onPointerDown={(e) => { setSel({ ...NO_SEL, zone: zn.id }); begin(e, { k: 'zone', id: zn.id, start: raw(e), cur: raw(e), moved: false }); }}
                onDoubleClick={(e) => { e.stopPropagation(); const i = nearEdge(raw(e)); if (i >= 0) { const p: Pt = [snap(raw(e)[0]), snap(raw(e)[1])]; upd((h) => editPoly(h, zn.id, { insert: [i, p] })); } }} />
              {zoneMode ? <>
                <text x={c[0]} y={c[1] - z(2)} textAnchor="middle" className="plan-t" style={{ fontSize: z(12) }} pointerEvents="none">{zn.name}</text>
                <text x={c[0]} y={c[1] + z(12)} textAnchor="middle" className="plan-s" style={{ fontSize: z(11) }} pointerEvents="none">{roofMode ? (() => { const r = house.roofs.find((x) => x.id === zn.id); return r ? `${r.form === 'custom' ? 'edge by edge' : r.form}${r.form === 'flat' ? '' : ` ${r.pitch}°`} · on the ${house.storeys[roofStorey(house, r)]?.name.toLowerCase()}` : ''; })() : <>{(bu?.name ?? '?').slice(0, 20)}{(bu?.name.length ?? 0) > 20 ? '…' : ''}</>} · {polyArea(pz).toFixed(1)} m²</text>
              </> : (() => {
                // A tag below the room labels: click to select the zone, drag to move it.
                const t = `${zn.name} · ${polyArea(pz).toFixed(1)} m²`, w = z(t.length * 6.6 + 14), y = c[1] + z(44);
                return (
                  <g style={{ cursor: tool === 'select' ? 'move' : undefined }} pointerEvents={tool === 'select' ? undefined : 'none'}
                    onPointerDown={(e) => { setSel({ ...NO_SEL, zone: zn.id }); begin(e, { k: 'zone', id: zn.id, start: raw(e), cur: raw(e), moved: false }); }}>
                    <rect x={c[0] - w / 2} y={y - z(10)} width={w} height={z(18)} rx={z(9)} fill={on ? '#c2410c' : '#b45309'} />
                    <text x={c[0]} y={y + z(3.5)} textAnchor="middle" className="ufh-tag" style={{ fontSize: z(11) }}>{t}</text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {roofMode && roofDraw.map((p, k) => (
          <g key={`rd${k}`} pointerEvents="none">
            {p.lines.map(([a, b], i) => <line key={i} x1={a[0] * S} y1={a[1] * S} x2={b[0] * S} y2={b[1] * S} stroke="#5b4a8a" strokeWidth={z(1.6)} strokeLinecap="round" />)}
            {p.poly.map((a, i) => {
              const b = p.poly[(i + 1) % p.poly.length], gable = p.kinds[i]?.kind === 'gable', m = to([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
              return (
                <g key={`e${i}`}>
                  <line x1={a[0] * S} y1={a[1] * S} x2={b[0] * S} y2={b[1] * S} stroke="#5b4a8a" strokeWidth={z(gable ? 1.5 : 3)} strokeDasharray={gable ? `${z(6)} ${z(4)}` : undefined} />
                  {sel.zone === p.id && <text x={m[0]} y={m[1] - z(5)} textAnchor="middle" className="draw-dim" style={{ fontSize: z(10), strokeWidth: z(3) }}>{i + 1}{gable ? ' gable' : ''}</text>}
                </g>
              );
            })}
            {(house.roofs.find((r) => r.id === p.id)?.dormers ?? []).map((d) => <rect key={d.id} x={to(d.at)[0] - z(6)} y={to(d.at)[1] - z(6)} width={z(12)} height={z(12)} fill="#5b4a8a" />)}
          </g>
        ))}

        {/* Windows and doors */}
        {opLayer}

        {/* Heat emitters */}
        {house.heating.emitters.filter((e) => { const r = house.rooms.find((x) => x.id === e.room); return r && r.storey === storey && !e.fromZone && (!zoneMode || (e.kind === 'ufh' && !!e.rect && band! <= house.storeys.length - 1)); }).map((e) => {
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
              onContextMenu={tool === 'select' ? menuOn({ k: 'em', id: e.id }) : undefined}
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

        {/* Corners: every one drags; double-click or the right-click menu removes it. */}
        {tool === 'select' && !zoneMode && onThis.flatMap((r) => polyOf(r).map((q, i) => {
          const v = to(q), on = sel.room === r.id, moving = drag?.k === 'move' && drag.verts.some(([id, j]) => id === r.id && j === i);
          return <circle key={`${r.id}-v${i}`} cx={v[0]} cy={v[1]} r={z((on ? 6.5 : 4.5) * hs)} className={`vx${on ? ' on' : ''}${moving ? ' moving' : ''}`} strokeWidth={z(2)} aria-label={`${r.name} corner ${i + 1}`}
            onPointerDown={(e) => { if (e.button === 2) { e.stopPropagation(); return; } setSel({ room: r.id, walls: [], item: null }); begin(e, { k: 'move', start: raw(e), cur: raw(e), verts: together(r.id, [i], e.altKey), base: roomPoly(r)[i], free: true, moved: false }); }}
            onDoubleClick={(e) => { e.stopPropagation(); upd((h) => removeCorner(h, r.id, i)); }} onContextMenu={menuOn({ k: 'corner', room: r.id, idx: i })} />;
        }))}

        {/* Corners of the selected zone, over the room corners they often sit on. */}
        {tool === 'select' && zones.filter((zn) => zn.id === sel.zone).flatMap((zn) => zonePoly(zn).map((q, i) => (
          <circle key={`${zn.id}-v${i}`} cx={to(q)[0]} cy={to(q)[1]} r={z(6.5 * hs)} className="vx on" strokeWidth={z(2)} aria-label={`${zn.name} corner ${i + 1}`}
            onPointerDown={(e) => begin(e, { k: 'zone', id: zn.id, idx: i, start: raw(e), cur: raw(e), moved: false })}
            onDoubleClick={(e) => { e.stopPropagation(); if (zn.poly.length > 3) upd((h) => editPoly(h, zn.id, { remove: i })); }} />
        )))}
        {/* In-progress drawing and placement previews */}
        {draft.length > 0 && <>
          <polyline points={pts(hv && outline ? [...draft, draftPt(hv)] : draft)} fill="none" stroke="#c2410c" strokeWidth={z(2.5)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />
          {draft.map((q, i) => <circle key={i} cx={to(q)[0]} cy={to(q)[1]} r={z(i === 0 && draft.length >= 3 ? 7 : 4.5)} fill={i === 0 ? '#fdf3ea' : '#c2410c'} stroke="#c2410c" strokeWidth={z(2)} pointerEvents="none" />)}
          {hv && <text x={to(draftPt(hv))[0] + z(12)} y={to(draftPt(hv))[1] - z(10)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{typed ? `${typed} m ⏎` : `${Math.hypot(draftPt(hv)[0] - draft[draft.length - 1][0], draftPt(hv)[1] - draft[draft.length - 1][1]).toFixed(2)} m`}</text>}
        </>}
        {outline && hv && (tool === 'room' || draft.length > 0) && <circle cx={to(draftPt(hv))[0]} cy={to(draftPt(hv))[1]} r={z(4)} fill="none" stroke="#c2410c" strokeWidth={z(1.5)} pointerEvents="none" />}
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
        {eg && <g transform={`translate(${to(eg.at)[0]} ${to(eg.at)[1]}) rotate(${eg.ang})`} opacity={0.55} pointerEvents="none">
          <rect x={-0.5 * S} y={-0.05 * S} width={S} height={0.1 * S} fill="#9a3412" />
        </g>}
        {guides.map(([a, b], i) => <line key={`gd${i}`} x1={to(a)[0]} y1={to(a)[1]} x2={to(b)[0]} y2={to(b)[1]} stroke="#0b8a7a" strokeWidth={z(1.2)} strokeDasharray={`${z(5)} ${z(4)}`} pointerEvents="none" />)}
        {boxA && hv && tool === 'box' && (() => { const q = magnet(hv); return <rect x={Math.min(boxA[0], q[0]) * S} y={Math.min(boxA[1], q[1]) * S} width={Math.abs(q[0] - boxA[0]) * S} height={Math.abs(q[1] - boxA[1]) * S} fill="#fdf3ea" fillOpacity={0.6} stroke="#c2410c" strokeWidth={z(2)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />; })()}
        {cut && <circle cx={to(cut)[0]} cy={to(cut)[1]} r={z(5)} fill="#c2410c" pointerEvents="none" />}
        {cut && cutLine && <line x1={to(cut)[0]} y1={to(cut)[1]} x2={to(cutLine)[0]} y2={to(cutLine)[1]} stroke="#c2410c" strokeWidth={z(1.5)} strokeDasharray={`${z(4)} ${z(4)}`} pointerEvents="none" />}
        {cutHit && <line x1={to(cutHit[0].p)[0]} y1={to(cutHit[0].p)[1]} x2={to(cutHit[1].p)[0]} y2={to(cutHit[1].p)[1]} stroke="#c2410c" strokeWidth={z(4)} pointerEvents="none" />}
        {drag?.k === 'box' && tool === 'ufh' && <text x={drag.cur[0] * S + z(10)} y={drag.cur[1] * S + z(16)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>UFH zone</text>}
        {drag?.k === 'marq' && <rect x={Math.min(drag.a[0], drag.cur[0]) * S} y={Math.min(drag.a[1], drag.cur[1]) * S} width={Math.abs(drag.cur[0] - drag.a[0]) * S} height={Math.abs(drag.cur[1] - drag.a[1]) * S} fill="#0b63b5" fillOpacity={0.08} stroke="#0b63b5" strokeWidth={z(1.5)} strokeDasharray={`${z(5)} ${z(3)}`} pointerEvents="none" />}
        {cornerAt && <circle cx={to(cornerAt.at)[0]} cy={to(cornerAt.at)[1]} r={z(6)} fill="#fff" stroke="#c2410c" strokeWidth={z(2)} pointerEvents="none" />}
        {overlay?.(to, S, fromEvent)}
      </svg>
      {/* Stop the buttons taking focus, so typed lengths and Enter still reach the canvas. */}
      <div className="draw-zoom" role="group" aria-label="Zoom" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" className="btn-secondary" aria-label="Zoom in" onClick={() => setView((v) => ({ x: v.x + v.w * 0.1, y: v.y + v.w * ratio * 0.1, w: v.w * 0.8 }))}>+</button>
        <button type="button" className="btn-secondary" aria-label="Zoom out" onClick={() => setView((v) => ({ x: v.x - v.w * 0.125, y: v.y - v.w * ratio * 0.125, w: v.w * 1.25 }))}>−</button>
        <button type="button" className="btn-secondary" onClick={() => setView(fit(house, ratio))}>Fit</button>
      </div>
      {note && <p className="draw-note" role="status">{note}</p>}
      {menu && (() => {
        /** `panel`: the action moves focus to the side panel, so the canvas must not take it back. */
        type Item = { label: string; glyph: string; off?: string; panel?: boolean; run: () => void };
        const edit = (label: string, glyph: string, field: EditField): Item => ({ label, glyph, panel: true, run: () => onEdit?.(field) });
        const on = menu.on, at = menu.at;
        const { title, tip, items } = ((): { title: string; tip: string; items: Item[] } => {
          if (on.k === 'wall') {
            const w = on.wall, outside = !w.other, len = w.span ? w.span[1] - w.span[0] : 0;
            return { title: 'Wall actions', tip: `${outside ? 'Outside' : 'Inside'} wall${len ? ` · ${len.toFixed(2)} m` : ''}`, items: [
              { label: 'Add a corner', glyph: '＋', run: () => addCornerAt(w.room, w.edge, at) },
              { label: 'Add a window', glyph: '▬', off: !outside ? 'Windows go on outside walls' : openingAt(at, 1.2, false, w.room) ? undefined : 'No clear stretch wide enough for a window here', run: () => placeOpening(at, false, w.room) },
              { label: 'Add a door', glyph: '▯', off: openingAt(at, 0.9, true, w.room) ? undefined : 'No clear stretch wide enough for a door here', run: () => placeOpening(at, true, w.room) },
              edit('Wall build-up', '◧', 'type'),
              edit('Wall length', '↔', 'size'),
            ] };
          }
          if (on.k === 'room') {
            const r = house.rooms.find((x) => x.id === on.id);
            if (!r) return { title: '', tip: '', items: [] };
            return { title: `${r.name} actions`, tip: `${r.name} · ${polyArea(roomPoly(r)).toFixed(1)} m²`, items: [
              { label: 'Open room', glyph: '↗', run: () => { location.hash = href('room', r.id); } },
              edit('Rename', '✎', 'name'),
              { label: 'Add a radiator', glyph: '≣', off: r.heated ? undefined : `${r.name} is unheated; make it heated first`, run: () => placeEmitter(at) },
              { label: r.heated ? 'Make unheated' : 'Make heated', glyph: r.heated ? '❄' : '♨', run: () => upd((h) => { const x = h.rooms.find((q) => q.id === r.id); if (x) x.heated = !x.heated; }) },
              { label: 'Delete room', glyph: '✕', run: () => { upd((h) => deleteRoom(h, r.id)); setSel(NO_SEL); } },
            ] };
          }
          if (on.k === 'corner') {
            const r = house.rooms.find((x) => x.id === on.room);
            if (!r) return { title: '', tip: '', items: [] };
            return { title: 'Corner actions', tip: `${r.name} · corner ${on.idx + 1}`, items: [
              { label: 'Delete corner', glyph: '✕', off: roomPoly(r).length <= 3 ? 'A room needs at least three corners' : undefined, run: () => upd((h) => removeCorner(h, r.id, on.idx)) },
            ] };
          }
          if (on.k === 'op') {
            const o = house.openings.find((x) => x.id === on.id), door = !!o && isDoorOp(o);
            return { title: `${door ? 'Door' : 'Window'} actions`, tip: o ? `${o.name} · ${o.w} × ${o.h} m` : '', items: [
              edit('Width and height', '↔', 'size'),
              edit(door ? 'Door type' : 'Glazing', '◧', 'type'),
              { label: 'Delete', glyph: '✕', run: () => { upd((h) => { h.openings = h.openings.filter((x) => x.id !== on.id); }); setSel(NO_SEL); } },
            ] };
          }
          const em = house.heating.emitters.find((x) => x.id === on.id), name = em?.kind === 'ufh' ? 'Underfloor loop' : em?.kind === 'towel' ? 'Towel rail' : 'Radiator';
          // Only the fields the panel shows for this kind: a radiator has a type and a length, a UFH marker its area, a towel rail neither.
          return { title: `${name} actions`, tip: em?.kind === 'radiator' ? `${name} · ${em.len} mm` : name, items: [
            ...(em?.kind === 'radiator' ? [edit('Radiator type', '◧', 'type'), edit('Size', '↔', 'size')] : em?.kind === 'ufh' && !em.rect ? [edit('Heated floor area', '↔', 'size')] : []),
            { label: 'Delete', glyph: '✕', run: () => { upd((h) => { h.heating.emitters = h.heating.emitters.filter((x) => x.id !== on.id); }); setSel(NO_SEL); } },
          ] };
        })();
        if (!items.length) return null;
        // A half circle above the pointer (below it near the top edge), kept clear of the sides.
        const R = 64, up = menu.y > R + 34, x = Math.min(Math.max(menu.x, R + 26), size.w - R - 26);
        const pick = (k: number) => { const it = items[k]; if (it.off) { setMenuTip(it.off); return; } closeMenu(!it.panel); it.run(); };
        const step = (e: React.KeyboardEvent) => {
          const bs = [...(menuRef.current?.querySelectorAll('button') ?? [])], k = bs.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
          else if (/^Arrow(Right|Down)$/.test(e.key)) { e.preventDefault(); bs[(k + 1) % bs.length]?.focus(); }
          else if (/^Arrow(Left|Up)$/.test(e.key)) { e.preventDefault(); bs[(k + bs.length - 1) % bs.length]?.focus(); }
          else if (e.key === 'Tab') closeMenu(false);
        };
        return (
          <div className="radial-back" onPointerDown={() => closeMenu()} onContextMenu={(e) => { e.preventDefault(); if (e.target === e.currentTarget) closeMenu(); }}>
            <div ref={menuRef} className={`radial${up ? '' : ' down'}`} role="menu" aria-label={title} style={{ left: x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={step}>
              {items.map((it, k) => {
                const a = items.length > 1 ? Math.PI - (k * Math.PI) / (items.length - 1) : Math.PI / 2, dx = R * Math.cos(a), dy = (up ? -1 : 1) * R * Math.sin(a);
                return (
                  <button key={it.label} type="button" role="menuitem" className="radial-item" aria-label={it.label} aria-disabled={!!it.off} title={it.off ?? it.label}
                    style={{ '--x': `${dx.toFixed(1)}px`, '--y': `${dy.toFixed(1)}px`, animationDelay: `${k * 25}ms` } as CSSProperties}
                    onPointerEnter={() => setMenuTip(it.off ?? it.label)} onFocus={() => setMenuTip(it.off ?? it.label)} onClick={() => pick(k)}>
                    <span aria-hidden="true">{it.glyph}</span>
                  </button>
                );
              })}
              <span className="radial-tip" aria-live="polite">{menuTip || tip}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
