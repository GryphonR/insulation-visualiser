import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { buildupLabel, listedAs, maxWallGap, onStorey, pairKey, roofEdgesOf, roofOutlines, roofParts, roofStorey, roomEdges, roomPoly } from '../engine/house';
import type { Buildup, BuildupKind, House, Room } from '../engine/house';
import { roofLines } from '../engine/house-roof';
import { FORMS, freezeOutline, newRoof } from './HouseRoof';
import { boxPicks, centroid, dropSpikes, faceReach, pointInPoly, polyArea, selfIntersects, sharedSpan } from '../engine/geom';
import type { Pt } from '../engine/geom';
import { OPEN_DOORWAY, addEmitter, addFloorZone, addStairwell, OPEN_STAIRWELL, ensureOpenDoorway, joinRooms, addRoomAt, cutPlan, deleteRoom, emitterPose, flushDelta, parallelSnap, innerDoorAt, innerWallThickness, insertCorner, isOutside, joinedCorners, mapCorners, turnToWall, mergeRooms, moveCorners, nearestWall, openingCentre, pieceAlign, pieceGap, pieceKeys, pieceSeg, pieceThickness, problems, removeCorner, roomAt, splitRoom, splitWall, stretchAtWall, wallGhosts, wallIndex, wallKeys, wallPieces } from '../engine/house-draw';
import type { WallPiece } from '../engine/house-draw';
import { planBounds } from './HousePlan';
import { LEVEL_AT, LEVELS, attachments, defaultLevel, dragSegment, drawRun, dropAt, ell, feedsFrom, joinRun, levelDash, levelIn, livePath, moveNode, moveOpenEnd, onPlan, viaOf, manifoldName, manifolds, removeRun, routePipes, splitSegment, squareInto, unpiped, voidName, voidOf, wallSnap } from '../engine/house-pipes';
import { placedManifold } from '../engine/house-controls';
import type { Attach, Level } from '../engine/house-pipes';
import type { Emitter, Heating, Plant } from '../engine/house-heating';
import { EMITTER_NAME, ZONE_COLOURS, emitterStorey } from '../engine/house-heating';
import { uid } from './hform';
import { href } from './route';
import { ADD_BUILDUP, ADD_BUILDUP_LABEL, useAddBuildup } from './AddBuildupFlow';

/** Every wall of a storey a piece at a time, so "outside walls" takes only the outside stretches; an inside wall is listed once, from the first room of its pair (or from `only`). */
export const storeyWalls = (house: House, storey: number, outsideOnly: boolean, only?: string): WallRef[] => house.rooms.filter((r) => onStorey(r, storey) && (!only || r.id === only)).flatMap((r) => roomEdges(r).flatMap((e) =>
  wallPieces(house, r.id, e.idx, storey).filter((p) => (outsideOnly ? !p.other : !p.other || !!only || r.id < p.other!))
    .map((p): WallRef => ({ room: r.id, edge: e.idx, span: p.span, ...(p.other ? { other: p.other, gap: p.gap } : {}) }))));

/** What the canvas is for: the rooms and what is in them, or the pipework. Each has its own tools and its own things to pick. */
export type Lens = 'plan' | 'pipes';
/** The window and door build-ups the tools place (unset: the first of each). */
export interface OpPick { glazing?: string; door?: string }
export type Tool = 'select' | 'box' | 'room' | 'split' | 'join' | 'corner' | 'stairs' | 'window' | 'door' | 'radiator' | 'fancoil' | 'ufh' | 'source' | 'cylinder' | 'riser' | 'manifold' | 'pipe';
/** A wall of a room; with `span`, just the piece of it between two metre marks along the wall (`other` is the room it is shared with, if any). */
export interface WallRef { room: string; edge: number; span?: [number, number]; other?: string; /** Gap to the other room's line, metres (inside walls). */ gap?: number }
export interface Sel { room: string; walls: WallRef[]; item: { k: 'op' | 'em' | 'plant' | 'pipe'; id: string } | null; /** A floor or ceiling zone. */ zone?: string; /** Several rooms picked with the selection box or Shift-click. */ group?: string[]; /** Arrows on the selected inside wall pick which side of the plan stretches to fit its build-up. */ stretch?: boolean }
export const NO_SEL: Sel = { room: '', walls: [], item: null };
/** The heat source, the cylinder, a riser, or a UFH manifold ('m:' + its zone), by its selection id. */
export const plantOf = (h: { heating: Heating }, id: string): Pick<Plant, 'at'> | undefined => {
  if (id.startsWith('m:')) { const m = h.heating.zones.find((z) => z.id === id.slice(2))?.manifold; return m?.storey != null ? { at: [m.x, m.y] } : undefined; }
  return id === 'source' || id === 'cylinder' ? h.heating[id] : h.heating.risers?.find((r) => r.id === id);
};
export const movePlant = (h: { heating: Heating }, id: string, d: Pt) => {
  const r = (v: number) => +v.toFixed(3), m = id.startsWith('m:') ? h.heating.zones.find((z) => z.id === id.slice(2))?.manifold : undefined;
  if (m) { m.x = r(m.x + d[0]); m.y = r(m.y + d[1]); return; }
  const x = plantOf(h, id);
  if (x) x.at = [r(x.at[0] + d[0]), r(x.at[1] + d[1])];
};
/** Taking a manifold off the plan keeps its zone: its loops go back to being piped one by one. */
export const removePlant = (h: { heating: Heating }, id: string) => {
  if (id.startsWith('m:')) { const z = h.heating.zones.find((x) => x.id === id.slice(2)); if (z) delete z.manifold; }
  else if (id === 'source' || id === 'cylinder') delete h.heating[id]; else h.heating.risers = h.heating.risers?.filter((r) => r.id !== id);
};
/** What a plant item is called. */
export const plantName = (h: House, id: string) => id.startsWith('m:') ? manifoldName(h, id.slice(2)) : id === 'cylinder' ? 'Hot water cylinder'
  : id === 'source' ? (h.hp.source === 'ashp' || h.hp.source === 'gshp' ? 'Heat pump' : 'Boiler') : 'Pipe riser';
/** What a right-click menu is for. */
type MenuFor = { k: 'wall'; wall: WallRef } | { k: 'room'; id: string } | { k: 'corner'; room: string; idx: number } | { k: 'op' | 'em'; id: string } | { k: 'pipe'; id: string; seg: number }
  | { k: 'plant'; id: string } | { k: 'zone'; id: string } | { k: 'zcorner'; id: string; idx: number };
/** A field of the selection that the side panel can be opened on: its dropdown (build-up, glazing or radiator type), its first size, or a room's name. */
export type EditField = 'type' | 'size' | 'name';

export const GRID = 0.05;
const S = 48, MAGNET = 0.15, ALIGN = 0.15, FLUSH = 0.2;
const near = (a: Pt, b: Pt, d = 0.011) => Math.hypot(a[0] - b[0], a[1] - b[1]) < d;
/** The edge of outline `pz` within 0.5 m of `q`, nearest first; -1 if none. */
const nearZoneEdge = (pz: Pt[], q: Pt) => { let best = { i: -1, d: 0.5 }; pz.forEach((a, i) => { const b = pz[(i + 1) % pz.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L))), d = Math.hypot(q[0] - a[0] - u * (b[0] - a[0]), q[1] - a[1] - u * (b[1] - a[1])); if (d < best.d) best = { i, d }; }); return best.i; };
export interface View { x: number; y: number; w: number }

/** A view of the whole plan with a margin, never smaller than 16 m wide so an empty plan has room to draw in. `ratio` is the canvas height over its width. */
function fit(h: House, ratio: number): View {
  const pb = planBounds(h), b = { ...pb, maxX: Math.max(pb.maxX, h.guide?.w ?? 0), maxY: Math.max(pb.maxY, h.guide?.d ?? 0) };
  const w = Math.max(16, b.maxX - b.minX + 5, (b.maxY - b.minY + 5) / ratio);
  return { x: ((b.minX + b.maxX) / 2 - w / 2) * S, y: ((b.minY + b.maxY) / 2 - (w * ratio) / 2) * S, w: w * S };
}

/** A compass needle pointing to true north on a plan whose "up" faces `deg` degrees clockwise of it. */
const Needle = ({ deg }: { deg: number }) => (
  <svg viewBox="-22 -22 44 44" aria-hidden="true">
    <circle r={20} className="dn-ring" />
    <g transform={`rotate(${-deg})`}>
      <path d="M0 -10 L4 0 L0 -2 L-4 0 Z" className="dn-n" />
      <path d="M0 10 L4 0 L0 2 L-4 0 Z" className="dn-s" />
      <text y={-11.5} textAnchor="middle" className="dn-t">N</text>
    </g>
  </svg>
);

/**
 * True north over the canvas: a small badge that cannot be dragged by accident. Clicking it opens a dial whose needle is dragged
 * round to north (5° steps; Shift for any angle; arrow keys too), kept with the tick (or Enter) or dropped with the cross (or Esc).
 */
function NorthDial({ north, onSet }: { north: number; onSet?: (n: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dial = useRef<HTMLDivElement>(null);
  useEffect(() => { if (draft != null) dial.current?.focus(); }, [draft != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const turn = (n: number) => ((n % 360) + 360) % 360;
  const angleAt = (e: React.PointerEvent<HTMLDivElement>, free: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    // The pointer's direction from the dial's centre, clockwise from screen up: the needle points there, so up faces the opposite turn.
    const n = turn(-(Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI);
    return free ? Math.round(n) % 360 : (Math.round(n / 5) * 5) % 360;
  };
  const close = (keep: boolean) => { if (keep && draft != null && draft !== north) onSet?.(draft); setDraft(null); setDragging(false); };

  if (draft == null) return onSet ? (
    <button type="button" className="draw-north" aria-label={`True north: up on the plan faces ${north}°. Change it`} title={`True north: up on the plan faces ${north}°. Click to change.`}
      onClick={() => setDraft(north)}><Needle deg={north} /></button>
  ) : <span className="draw-north fixed" role="img" aria-label={`True north: up on the plan faces ${north}°`} title={`True north: up on the plan faces ${north}°.`}><Needle deg={north} /></span>;

  return (
    <div className="draw-north-tool" role="dialog" aria-label="Set true north"
      onKeyDown={(e) => {
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? -1 : 0;
        if (e.key === 'Escape') close(false);
        else if (e.key === 'Enter') close(true);
        else if (d) setDraft(turn(draft + d * (e.shiftKey ? 1 : 5)));
        else return;
        e.preventDefault(); e.stopPropagation();
      }}>
      <div ref={dial} className="dn-dial" role="slider" tabIndex={0} aria-label="True north" aria-valuemin={0} aria-valuemax={359} aria-valuenow={draft}
        aria-valuetext={`Up on the plan faces ${draft}° from north`}
        onPointerDown={(e) => { e.stopPropagation(); setDragging(true); setDraft(angleAt(e, e.shiftKey)); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ } }}
        onPointerMove={(e) => { if (dragging) setDraft(angleAt(e, e.shiftKey)); }}
        onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
        <Needle deg={draft} />
      </div>
      <p className="small">Drag the needle to north on your plan. Up faces <b className="mono">{draft}°</b>.</p>
      <div className="dn-acts">
        <button type="button" className="btn-secondary" aria-label="Cancel" title="Cancel (Esc)" onClick={() => close(false)}>✕</button>
        <button type="button" className="btn-primary" aria-label="Set north" title="Set north (Enter)" onClick={() => close(true)}>✓</button>
      </div>
    </div>
  );
}

type Drag =
  | { k: 'pan'; x0: number; y0: number; v: View; moved: boolean }
  /** Corners (room, corner number) move together; `normal` slides a wall along its normal only. */
  | { k: 'move'; start: Pt; cur: Pt; verts: Array<[string, number]>; base: Pt; normal?: Pt; free: boolean; room?: boolean; moved: boolean }
  | { k: 'op' | 'em'; id: string; start: Pt; cur: Pt; moved: boolean }
  /** The heat source, the cylinder, or a riser (by id). */
  | { k: 'plant'; id: string; start: Pt; cur: Pt; moved: boolean }
  /** One segment of a pipe run's route, slid sideways; `base` is the route when the drag began. */
  | { k: 'pipe'; id: string; seg: number; base: Pt[]; start: Pt; cur: Pt; moved: boolean }
  /** The open end of a run, dragged to move it or drop it on what it should feed. */
  | { k: 'pend'; id: string; start: Pt; cur: Pt; moved: boolean }
  /** A junction where runs meet, dragged to move every run end on it. */
  | { k: 'node'; id: string; start: Pt; cur: Pt; moved: boolean }
  /** A floor or ceiling zone (all of it, or one corner `idx`). */
  | { k: 'zone'; id: string; idx?: number; start: Pt; cur: Pt; moved: boolean }
  | { k: 'box'; a: Pt; cur: Pt }
  | { k: 'marq'; a: Pt; cur: Pt };

/**
 * The drawing canvas for one storey: rooms of any shape whose corners and walls drag, with windows, doors and heat emitters
 * placed on them. Every edit is one `upd` on a copy of the house; nothing is written while a drag is under way.
 */
export function DrawCanvas({ house, storey, tool, setTool, sel, setSel, upd, fill, label, below, sticky, grid, snapOn, band, roof, underlay, overlay, onEdit, lens = 'plan', zoomStart, opPick = {}, viewRef }: {
  house: House; storey: number; tool: Tool; setTool: (t: Tool) => void; lens?: Lens; opPick?: OpPick;
  /** The pan and zoom, kept by the page so another floor or layer opens on the same view. */
  viewRef?: { current: View | null };
  /** Shown before the zoom buttons, in the same group (the grid size). */
  zoomStart?: ReactNode;
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
  // Selecting picks what the lens is for: rooms, walls and openings on the plan; heaters, underfloor zones, pipe runs and plant on heating and cooling.
  const planSel = tool === 'select' && lens !== 'pipes', pipeSel = tool === 'select' && lens === 'pipes';
  /** Tools that draw a zone in the plan rather than a room: underfloor heating, or a stairwell up to the next floor. */
  const area = tool === 'ufh' || tool === 'stairs';
  const [size, setSize] = useState({ w: 900, h: 560 });
  const cw = size.w, ratio = size.h / size.w;
  const [view, setView] = useState<View>(() => viewRef?.current ?? fit(house, 0.62));
  useEffect(() => { if (viewRef) viewRef.current = view; }, [view, viewRef]);
  /**
   * The view while a pan or zoom gesture runs. A full render is too slow to follow a finger, so the gesture writes the
   * svg's viewBox directly and the view is saved to state once the gesture pauses; any render meanwhile draws this one.
   */
  const live = useRef<View | null>(null);
  const liveTimer = useRef(0);
  const viewNow = useRef(view);
  viewNow.current = view;
  const ratioNow = useRef(ratio);
  ratioNow.current = ratio;
  const moveView = (fn: (v: View) => View) => {
    const v = fn(live.current ?? viewNow.current);
    live.current = v;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.w * ratioNow.current}`);
    // The wall-junction filter takes ~100 ms to redraw at every step; it is dropped until the gesture pauses.
    svgRef.current?.classList.add('moving');
    clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => { const x = live.current; live.current = null; svgRef.current?.classList.remove('moving'); if (x) setView(x); }, 150);
  };
  /** A one-off change (the zoom buttons and keys): starts from any gesture still under way. */
  const setViewNow = (fn: (v: View) => View) => { const base = live.current; clearTimeout(liveTimer.current); live.current = null; svgRef.current?.classList.remove('moving'); setView((v) => fn(base ?? v)); };
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [note, setNote] = useState('');
  /** First corner of a box room (click, click), first point of a split line. */
  const [boxA, setBoxA] = useState<Pt | null>(null);
  const [cut, setCut] = useState<Pt | null>(null);
  /** Where the pipe run being drawn starts; its corners so far are in `draft`. */
  const [pipeFrom, setPipeFrom] = useState<Attach | null>(null);
  /** The level new runs are drawn in; a run started off another is drawn where that one is. */
  const [level, setLevel] = useState<Level>(() => defaultLevel(house, Math.min(storey, house.storeys.length - 1)));
  const pointers = useRef(new Map<number, Pt>());
  /** Two fingers down: their spread and midpoint (screen px) and the view when they landed. */
  const pinch = useRef<{ d: number; m: Pt; v: View } | null>(null);
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  const hs = coarse ? 1.8 : 1;
  const roofMode = !!roof;
  const zoneMode = band != null || roofMode;
  /** Digits typed while drawing a room: the length of the next wall. */
  const [typed, setTyped] = useState('');
  /** Shift held: no snapping to walls or angles. */
  const loose = useRef(false);
  /** Space held: a left drag pans, for mice and trackpads without a middle button. */
  const space = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      if (e.type === 'keyup') { space.current = false; setSpaceHeld(false); return; }
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, button, [contenteditable]')) return;
      space.current = true;
      if (!e.repeat) setSpaceHeld(true);
      e.preventDefault();
    };
    window.addEventListener('keydown', on); window.addEventListener('keyup', on);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); };
  }, []);
  const u = view.w / cw, z = (n: number) => n * u;
  const to = (p: Pt): Pt => [p[0] * S, p[1] * S];

  // The canvas fills its container, so follow its size; the first real size fits the plan to it, unless a view was kept from another floor.
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let first = !viewRef?.current;
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
  // A mouse wheel zooms about the pointer. On a touchpad, two fingers pan and a pinch (sent as a wheel with Ctrl) zooms.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let padUntil = 0;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      const zoom = (f: number) => moveView((v) => ({ x: q.x - (q.x - v.x) * f, y: q.y - (q.y - v.y) * f, w: v.w * f }));
      if (e.ctrlKey) { zoom(Math.exp(Math.max(-50, Math.min(50, e.deltaY)) * 0.01)); return; }
      // shortcut: a touchpad scroll is told from a mouse wheel by its small, fractional or sideways steps, and stays a touchpad scroll for the rest of the gesture; a mouse with a free-spinning or hi-res wheel may pan instead of zoom.
      const pad = e.deltaMode === 0 && (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50);
      if (pad || e.timeStamp < padUntil) {
        padUntil = e.timeStamp + 300;
        const k = m.a ? 1 / m.a : 1; // screen pixels to plan units
        moveView((v) => ({ ...v, x: v.x + e.deltaX * k, y: v.y + e.deltaY * k }));
        return;
      }
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);
    };
    svg.addEventListener('wheel', on, { passive: false });
    return () => svg.removeEventListener('wheel', on);
  }, []);
  useEffect(() => { setDraft([]); setNote(''); setTyped(''); setBoxA(null); setCut(null); setMenu(null); setPipeFrom(null); }, [tool, storey]);
  // A note left in select mode (after a delete, say) fades after a while.
  useEffect(() => { if (!note || tool !== 'select') return; const t = setTimeout(() => setNote(''), 8000); return () => clearTimeout(t); }, [note, tool]);
  /** The semicircle of actions opened by right-clicking something: where (px in the canvas, and plan metres) and on what. */
  const [menu, setMenu] = useState<{ x: number; y: number; at: Pt; on: MenuFor } | null>(null);
  const addBuildup = useAddBuildup();
  const [menuTip, setMenuTip] = useState('');
  /** The menu item whose list of choices (build-ups) is open beside it. */
  const [sub, setSub] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Focus the first button for the keyboard, but keep the label describing what was clicked until a button is hovered or arrowed to.
  useEffect(() => { if (menu) { menuRef.current?.querySelector('button')?.focus({ preventScroll: true }); setMenuTip(''); } }, [menu]);
  /** Selects what the menu is for (so the panel shows it), then opens the menu at a point on screen. */
  const openMenu = (on: MenuFor, clientX: number, clientY: number, at: Pt) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    if (on.k === 'wall') setSel({ room: on.wall.room, walls: [on.wall], item: null });
    // Right-clicking a room in a picked group keeps the group, so the menu can act on all of them.
    else if (on.k === 'room') setSel(sel.group?.includes(on.id) ? { ...NO_SEL, room: on.id, group: sel.group } : { ...NO_SEL, room: on.id });
    else if (on.k === 'corner') setSel({ ...NO_SEL, room: on.room });
    else if (on.k === 'pipe' || on.k === 'plant') setSel({ ...NO_SEL, item: { k: on.k, id: on.id } });
    else if (on.k === 'zone' || on.k === 'zcorner') setSel({ ...NO_SEL, zone: on.id });
    else setSel({ ...NO_SEL, room: (on.k === 'op' ? house.openings : house.heating.emitters).find((x) => x.id === on.id)?.room ?? '', item: { k: on.k, id: on.id } });
    setMenuTip('');
    setSub(null);
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
  /** Walls the last snap with `from` turned parallel to, to highlight. */
  let parRefs: Array<[Pt, Pt]> = [];
  const magnet = (p: Pt, skip?: Array<[string, number]>, anchors: Pt[] = [], diag?: Pt, from: Pt[] = []): Pt => {
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
    if (from.length) {
      // The walls being drawn or dragged turn parallel to a nearby skewed wall they nearly follow (not to the walls moving with them).
      const moving = (r: Room, i: number) => skip?.some(([id, j]) => id === r.id && j === i);
      const walls = [...onThis, ...ghost].flatMap((r) => roomPoly(r).flatMap((q, i, ps): Array<[Pt, Pt]> => {
        const j = (i + 1) % ps.length;
        return moving(r, i) || moving(r, j) ? [] : [[q, ps[j]]];
      })).concat(draft.slice(1).map((q, i): [Pt, Pt] => [draft[i], q]));
      const ps = parallelSnap([x, y], from, walls);
      if (ps.refs.length) { parRefs = ps.refs; return ps.p; }
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
    const nb = [poly[(i + poly.length - 1) % poly.length], poly[(i + 1) % poly.length]], t = d.free ? magnet(want, d.verts, nb, undefined, nb) : [snap(want[0]), snap(want[1])] as Pt;
    return [t[0] - d.base[0], t[1] - d.base[1]];
  };
  /** Where a corner goes in a drag: slid by `delta`, and a whole room also turned to line up with a nearly parallel wall beside it. */
  const moveMap = (d: Extract<Drag, { k: 'move' }>): ((q: Pt) => Pt) => {
    const dl = delta(d), slid = (q: Pt): Pt => [q[0] + dl[0], q[1] + dl[1]];
    if (!d.room || loose.current) return slid;
    const ids = new Set(d.verts.map(([id]) => id));
    const t = turnToWall(onThis.filter((r) => ids.has(r.id)).map((r) => roomPoly(r).map(slid)), onThis.filter((r) => !ids.has(r.id)).map(roomPoly), innerT);
    if (!t) return slid;
    parRefs = [t.ref];
    return (q) => t.map(slid(q));
  };
  const polyOf = (r: Room): Pt[] => {
    const p = roomPoly(r);
    if (drag?.k !== 'move' || !drag.verts.some(([id]) => id === r.id)) return p;
    const f = moveMap(drag);
    return p.map((q, i) => (drag.verts.some(([id, j]) => id === r.id && j === i) ? f(q) : q));
  };

  // A floor or ceiling layer shows all its zones; a storey shows the underfloor heating zones in its floor and the stairwells up from it and down to it.
  type ZoneLike = { id: string; poly: Pt[]; name: string; buildup: string; ufh?: boolean };
  const stair = (z: { buildup: string }) => z.buildup === OPEN_STAIRWELL;
  const zones: ZoneLike[] = roofMode
    ? house.roofs.flatMap((r) => roofOutlines(house, r).slice(0, 1).map((poly) => ({ id: r.id, poly, name: r.name, buildup: '' })))
    : (house.zones ?? []).filter((z) => (zoneMode ? z.band === band : (!!z.ufh && z.band === storey) || (stair(z) && (z.band === storey || z.band === storey + 1))));
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
  // The roof space (one above the top storey) holds fan coils over the rooms below.
  const roofSpace = storey > house.storeys.length - 1;
  const emitterAt = (p: Pt, kind: Emitter['kind'], keep?: string) => {
    const room = roomAt(house, Math.min(storey, house.storeys.length - 1), p) ?? (keep ? house.rooms.find((r) => r.id === keep) : undefined);
    if (!room) return null;
    const hit = kind === 'ufh' || roofSpace ? null : nearestWall(house, storey, p, 0.6, { room: room.id });
    if (hit) { const e = roomEdges(room)[hit.edge]; return { room, at: [hit.at[0] - e.n[0] * 0.2, hit.at[1] - e.n[1] * 0.2] as Pt, ang: (Math.atan2(e.d[1], e.d[0]) * 180) / Math.PI }; }
    return { room, at: [snap(p[0]), snap(p[1])] as Pt, ang: 0 };
  };
  const isDoorOp = (o: { buildup: string }) => { const b = house.buildups.find((x) => x.id === o.buildup); return !!b && listedAs(b) === 'door'; };
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
    const w = door ? 0.9 : 1.2, at = openingAt(p, w, door, only), want = door ? opPick.door : opPick.glazing, gap = door && want === OPEN_DOORWAY;
    const b = gap ? undefined : house.buildups.find((x) => x.id === want && listedAs(x) === (door ? 'door' : 'glazing')) ?? house.buildups.find((x) => listedAs(x) === (door ? 'door' : 'glazing') && x.id !== OPEN_DOORWAY);
    if (!at) { setNote(door ? 'Doors go on outside walls, or on a wall shared with another room, in a clear stretch wide enough.' : 'Windows go on outside walls, in a clear stretch wide enough for them.'); return; }
    if (gap && !at.to) { setNote('An opening goes on a wall between two rooms.'); return; }
    if (!gap && !b) { setNote(`Add a ${door ? 'door' : 'glazing'} build-up first.`); return; }
    const id = uid('o'), side = roomEdges(at.room)[at.edge].side;
    upd((h) => { const bid = gap ? ensureOpenDoorway(h) : b!.id; h.openings.push({ id, room: at.room.id, side, name: gap ? 'Opening' : door ? 'Door' : 'Window', w, h: door ? 2.0 : 1.2, buildup: bid, edge: at.edge, t: at.t, ...(at.to ? { to: at.to } : {}) }); });
    setSel({ room: at.room.id, walls: [], item: { k: 'op', id } });
  };
  /** A corner on wall `edge` of a room, at the grid point nearest `q`. */
  const addCornerAt = (room: string, edge: number, q: Pt) => {
    const hit = nearestWall(house, storey, q, 0.5, { room });
    if (hit && hit.edge === edge) upd((h) => insertCorner(h, room, edge, [snap(hit.at[0]), snap(hit.at[1])]));
  };

  /** A corner in segment `seg` of a pipe run's route `pts`, at the point nearest `at`. */
  const addPipeCorner = (id: string, pts: Pt[], seg: number, at: Pt) =>
    upd((h) => { const y = h.heating.pipes?.find((r) => r.id === id); if (y?.leg) y.leg = { storey: y.leg.storey, pts: splitSegment(pts, seg, at) }; });

  /** What a pipe can attach to under the pointer: the source, cylinder, a riser or a heater (by its attachment point), else a run on this floor. */
  const pipeHit = (p: Pt): { a: Attach; at: Pt; label: string } | null => {
    const r = Math.max(0.3, z(14 * hs) / S);
    const port = attachments(house, storey).map((x) => ({ x, d: Math.hypot(x.at[0] - p[0], x.at[1] - p[1]) })).filter((q) => q.d < r).sort((a, b) => a.d - b.d)[0];
    if (port) return { a: { id: port.x.id }, at: port.x.at, label: port.x.label };
    // A drop's end on this plan: while drawing, the end at the level being drawn in.
    for (const d of house.heating.pipes ?? []) if (d.drop) for (const id of [d.a, d.b]) {
      const n = id ? house.heating.nodes?.find((x) => x.id === id) : undefined;
      if (!n?.at || n.v == null || !onPlan(storey, n.v) || (tool === 'pipe' && levelIn(storey, n.v) !== level)) continue;
      if (Math.hypot(n.at[0] - p[0], n.at[1] - p[1]) < r) return { a: { node: n.id }, at: n.at, label: `${d.name}: ${voidName(house, n.v)}` };
    }
    let best: { a: Attach; at: Pt; label: string } | null = null, bd = r;
    for (const x of house.heating.pipes ?? []) {
      // While drawing, only the runs on the level being drawn in can be joined.
      const v = voidOf(house, x), q = onPlan(storey, v) && (tool !== 'pipe' || levelIn(storey, v) === level) ? livePath(house, x) : null;
      for (let i = 0; q && i + 1 < q.length; i++) {
        const a = q[i], b = q[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const at: Pt = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(at[0] - p[0], at[1] - p[1]);
        if (d < bd) { bd = d; best = { a: { run: x.id, at }, at, label: `Tee off ${x.name}` }; }
      }
    }
    return best;
  };
  /** Take out a run, saying where the runs off it now come from. */
  const deleteRun = (id: string) => {
    const p = house.heating.pipes?.find((x) => x.id === id), kids = house.heating.pipes?.filter((x) => x.parent === id).length ?? 0;
    const up = p?.parent ? house.heating.pipes?.find((x) => x.id === p.parent)?.name : null;
    upd((h) => removeRun(h, id)); setSel(NO_SEL);
    if (p) setNote(`Deleted ${p.name}.${kids ? ` The ${kids} run${kids === 1 ? '' : 's'} off it now come${kids === 1 ? 's' : ''} off ${up ?? 'the heat source'}.` : ''} Ctrl+Z puts it back; Draw a pipe run draws a new one.`);
  };
  /** What a click finishes the pipe being drawn on: the other kind of end (a heater for a run from a feed, and back), or another run, which it then feeds. */
  const pipeEnd = (p: Pt) => {
    const x = pipeHit(p);
    if (!x || !pipeFrom) return null;
    if (feedsFrom(x.a) !== feedsFrom(pipeFrom)) return x;
    // A run can finish on a drop's end, or on a riser (it then feeds it).
    if ('node' in x.a) return 'node' in pipeFrom && pipeFrom.node === x.a.node ? null : x;
    if ('id' in x.a && x.a.id !== 'source' && feedsFrom(pipeFrom) && !('id' in pipeFrom && pipeFrom.id === x.a.id)) return x;
    return 'run' in x.a && !('run' in pipeFrom && pipeFrom.run === x.a.run) ? { ...x, label: x.label.replace('Tee off', 'Feed') } : null;
  };
  /** The next corner of the pipe being drawn: square to the last one, stopping just short of a wall across its way (Shift: free). */
  const pipePt = (p: Pt): Pt => {
    const last = draft[draft.length - 1];
    if (!last || loose.current) return p;
    const q = wallSnap(house, storey, last, [snap(p[0]), snap(p[1])], Math.max(0.3, z(14 * hs) / S));
    return q;
  };
  /** Finish the pipe being drawn on `to` (or, with null, leave its end open), if the engine takes it. */
  const finishPipe = (to: Attach | null) => {
    if (!pipeFrom) return;
    const mid = draft.slice(1), sq = !loose.current, test = drawRun(structuredClone(house), storey, pipeFrom, mid, to, sq, level);
    if ('error' in test) { setNote(test.error); return; }
    upd((h) => { drawRun(h, storey, pipeFrom, mid, to, sq, level); });
    setSel({ ...NO_SEL, item: { k: 'pipe', id: test.id } });
    setDraft([]); setPipeFrom(null); setNote('');
    if (!sticky) setTool('select');
  };

  /** Pick the level new runs go in. Part way through drawing one, a drop goes in at its last corner (or where it started) and it carries on from there. */
  const pickLevel = (l: Level) => {
    if (l === level) return;
    if (tool === 'pipe' && pipeFrom && draft.length) {
      const mid = draft.slice(1), test = dropAt(structuredClone(house), storey, pipeFrom, mid, level, l);
      if ('error' in test) { setNote(test.error); return; }
      upd((h) => { dropAt(h, storey, pipeFrom, mid, level, l); });
      setPipeFrom({ node: test.node }); setDraft([test.at]);
      setNote(`A drop goes in here; carry on ${LEVELS.find(([x]) => x === l)![1].toLowerCase()}.`);
    }
    setLevel(l);
  };

  /** A new room (or, on a floor or ceiling layer, a zone; with the UFH tool, an underfloor heating zone in this floor) with this outline. */
  const create = (pts: Pt[]) => {
    const id = uid(zoneMode || area ? 'z' : 'r');
    if (tool === 'stairs') { upd((h) => addStairwell(h, id, storey + 1, pts)); setSel({ ...NO_SEL, zone: id }); }
    else if (tool === 'ufh') { upd((h) => addFloorZone(h, id, band ?? storey, pts, true)); setSel({ ...NO_SEL, zone: id }); }
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
    const last = draft[draft.length - 1], q = magnet(p, undefined, draft, last, last ? [last] : []), L = Number(typed);
    if (!last || !(L > 0)) return q;
    const d = Math.hypot(q[0] - last[0], q[1] - last[1]);
    return d < 1e-6 ? [+(last[0] + L).toFixed(3), last[1]] : [+(last[0] + ((q[0] - last[0]) * L) / d).toFixed(3), +(last[1] + ((q[1] - last[1]) * L) / d).toFixed(3)];
  };

  /** Two fingers on the canvas pinch to zoom; the second finger never reaches the tools underneath. */
  const trackDown = (e: React.PointerEvent) => {
    // The right button only opens the wall menu (on contextmenu): it never drags, pans, draws or clears the selection.
    if (e.button === 2) { e.stopPropagation(); return; }
    // The middle button always pans, whatever is under it, and never clears the selection (preventDefault stops the browser's autoscroll).
    if (e.button === 1) { e.preventDefault(); begin(e, { k: 'pan', x0: e.clientX, y0: e.clientY, v: live.current ?? view, moved: true }); return; }
    // Space + left button pans too, even over a room or wall, which never sees the press.
    if (e.button === 0 && space.current) { e.stopPropagation(); begin(e, { k: 'pan', x0: e.clientX, y0: e.clientY, v: live.current ?? view, moved: true }); return; }
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size !== 2) return;
    e.stopPropagation();
    setDrag(null);
    const [a, b] = [...pointers.current.values()];
    pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: live.current ?? view };
  };

  const down = (e: React.PointerEvent) => {
    loose.current = e.shiftKey || !snapOn;
    const p = raw(e);
    svgRef.current?.focus({ preventScroll: true });
    // Left drag on empty canvas draws a selection box; Space, touch, and the pipework and floor/roof layers pan instead (the middle button always pans).
    if (tool === 'select') {
      const pan = !e.shiftKey && (space.current || e.pointerType === 'touch' || lens === 'pipes' || zoneMode);
      begin(e, pan ? { k: 'pan', x0: e.clientX, y0: e.clientY, v: live.current ?? view, moved: false } : { k: 'marq', a: p, cur: p });
      return;
    }
    if (tool === 'join') {
      // Take out the wall between two rooms: the clicked room keeps its name and settings.
      const hit = nearestWall(house, storey, p, 0.4);
      const pc = hit && wallPieces(house, hit.room, hit.edge, storey).find((q) => q.other && hit.t >= q.span[0] - 0.05 && hit.t <= q.span[1] + 0.05);
      if (!hit || !pc?.other) { setNote('Click a wall between two rooms to take it out.'); return; }
      if (!joinRooms(structuredClone(house), hit.room, pc.other)) { setNote('Those two rooms cannot be joined: they must be on the same storeys and join into one outline without a hole.'); return; }
      upd((h) => { joinRooms(h, hit.room, pc.other!); });
      setNote(''); setSel({ ...NO_SEL, room: hit.room });
      if (!sticky) setTool('select');
      return;
    }
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
    if (tool === 'stairs' && storey >= house.storeys.length - 1) { setNote('Draw the stairs on the floor they go up from: this is the top floor.'); return; }
    // The UFH and stairs tools drag out a rectangle like Box room, or (after a first click) take corners like Room.
    if (tool === 'box' || (area && !draft.length)) {
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
    if (tool === 'room' || area) {
      const last = draft[draft.length - 1], q = draftPt(p);
      // Close on a click within 0.2 m or 12 px of the first corner, whichever is bigger at this zoom.
      if (draft.length >= 3 && (near(q, draft[0], 0.2) || near(p, draft[0], z(12 * hs) / S))) { closeDraft(draft); return; }
      if (!last || !near(q, last, 0.05)) setDraft([...draft, q]);
      return;
    }
    if (tool === 'corner') {
      // Split a wall: a corner on the straight line, so each part has a face (and build-up) of its own.
      const hit = nearestWall(house, storey, p, 0.4);
      if (!hit) { setNote('Click on a wall to split it there.'); return; }
      const e0 = roomEdges(house.rooms.find((r) => r.id === hit.room)!)[hit.edge];
      const q: Pt = Math.abs(e0.d[1]) < 1e-9 ? [snap(hit.at[0]), hit.at[1]] : Math.abs(e0.d[0]) < 1e-9 ? [hit.at[0], snap(hit.at[1])] : hit.at;
      const t = (q[0] - e0.a[0]) * e0.d[0] + (q[1] - e0.a[1]) * e0.d[1];
      if (t < 0.1 || t > e0.len - 0.1) { setNote('Too close to a corner to split the wall there.'); return; }
      // Select the stretch just past the split, to pick its build-up.
      const next = structuredClone(house);
      splitWall(next, hit.room, hit.edge, q, storey);
      const pc = wallPieces(next, hit.room, hit.edge + 1, storey).find((x) => x.span[0] < 0.01);
      upd((h) => splitWall(h, hit.room, hit.edge, q, storey));
      setSel({ room: hit.room, walls: [{ room: hit.room, edge: hit.edge + 1, ...(pc ? { span: pc.span, ...(pc.other ? { other: pc.other, gap: pc.gap } : {}) } : {}) }], item: null });
      if (!sticky) setTool('select');
      // Straight to the new part's build-up in the panel, after the click has focused the canvas.
      setTimeout(() => onEdit?.('type'));
      return;
    }
    if (tool === 'window' || tool === 'door') { placeOpening(p, tool === 'door'); return; }
    if (tool === 'pipe') {
      if (!pipeFrom) {
        const hit = pipeHit(p);
        if (!hit) { setNote('Start on the boiler or heat pump, a riser, a radiator, a UFH manifold, the cylinder or an existing run (the green rings).'); return; }
        setPipeFrom(hit.a); setDraft([hit.at]);
        if ('run' in hit.a) { const r = house.heating.pipes?.find((x) => x.id === (hit.a as { run: string }).run); if (r) setLevel(levelIn(storey, voidOf(house, r))); }
        setNote(feedsFrom(hit.a) ? 'Click each corner; click a radiator, fan coil, manifold, the cylinder, a riser or another run to finish, or press Enter to leave the end open. Backspace undoes a corner, Esc cancels.'
          : 'Click each corner; click the boiler, a riser or a run to finish. Backspace undoes a corner, Esc cancels.');
        return;
      }
      const end = pipeEnd(p);
      if (end) { finishPipe(end.a); return; }
      const q = pipePt(p);
      if (!near(q, draft[draft.length - 1], 0.05)) setDraft([...draft, q]);
      return;
    }
    if (tool === 'source' || tool === 'cylinder' || tool === 'riser') {
      const q: Pt = [snap(p[0]), snap(p[1])], id = tool === 'riser' ? uid('rs') : tool;
      // One heat source and one cylinder: placing again moves it.
      upd((h) => { if (tool === 'riser') (h.heating.risers ??= []).push({ id, at: q }); else h.heating[tool] = { at: q, storey }; });
      setSel({ ...NO_SEL, item: { k: 'plant', id } });
      if (!sticky) setTool('select');
      return;
    }
    if (tool === 'manifold') {
      // The first UFH zone not yet on the plan takes it (the loops are usually already on it), else a new zone.
      const q: Pt = [snap(p[0]), snap(p[1])], free = house.heating.zones.find((z) => z.kind === 'ufh' && z.manifold?.storey == null), zid = free?.id ?? uid('z');
      upd((h) => {
        let z = h.heating.zones.find((x) => x.id === zid);
        if (!z) h.heating.zones.push(z = { id: zid, name: `UFH manifold ${manifolds(h).length + 1}`, kind: 'ufh', color: ZONE_COLOURS[h.heating.zones.length % ZONE_COLOURS.length], on: true, hours: null, blend: 35 });
        z.manifold = { x: q[0], y: q[1], storey };
        // UFH floor zones on this floor not yet fed from a placed manifold are fed from this one.
        for (const fz of h.zones ?? []) if (fz.ufh && fz.band === storey && !(fz.manifold && fz.manifold !== zid && placedManifold(h, fz.manifold))) fz.manifold = zid;
      });
      setSel({ ...NO_SEL, item: { k: 'plant', id: `m:${zid}` } });
      if (!sticky) setTool('select');
      return;
    }
    placeEmitter(p, tool === 'fancoil' ? 'fancoil' : 'radiator');
  };
  /** A radiator in the heated room at a pointer position, on the nearest wall if one is close; or a fan coil, which can also go in the roof space. */
  const placeEmitter = (p: Pt, kind: 'radiator' | 'fancoil') => {
    if (roofSpace && kind !== 'fancoil') { setNote('Only fan coils go in the roof space.'); return; }
    const at = emitterAt(p, kind), id = uid('e');
    if (!at) { setNote(roofSpace ? 'Click over a room on the floor below.' : 'Click inside a room to place it.'); return; }
    // A fan coil can sit in an unheated room (a cupboard) and be ducted to the rooms it feeds.
    if (!at.room.heated && kind === 'radiator') { setNote(`${at.room.name} is unheated; switch it to heated first.`); return; }
    upd((h) => {
      addEmitter(h, at.room.id, kind, id);
      const e = h.heating.emitters[h.heating.emitters.length - 1];
      e.at = at.at; e.ang = at.ang;
      if (kind === 'fancoil') e.rated = 2000;
      if (roofSpace) e.storey = storey;
    });
    setSel({ room: at.room.id, walls: [], item: null });
  };

  const move = (e: React.PointerEvent) => {
    if (drag && e.buttons && !svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current?.setPointerCapture(e.pointerId);
    loose.current = e.shiftKey || !snapOn;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size === 2) {
      // The plan point that was under the fingers' midpoint stays under it: spreading zooms, moving both fingers pans.
      const [a, b] = [...pointers.current.values()], { d, m, v } = pinch.current, r = svgRef.current!.getBoundingClientRect();
      const f = d / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1), w = v.w * f, k0 = v.w / r.width, k1 = w / r.width;
      const p0: Pt = [v.x + (m[0] - r.left) * k0, v.y + (m[1] - r.top) * k0];
      moveView(() => ({ x: p0[0] - ((a[0] + b[0]) / 2 - r.left) * k1, y: p0[1] - ((a[1] + b[1]) / 2 - r.top) * k1, w }));
      return;
    }
    const p = raw(e);
    if (!drag) { setHover(p); return; }
    if (drag.k === 'pan') {
      const f = view.w / cw, moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 3;
      if (moved) moveView(() => ({ ...drag.v, x: drag.v.x - (e.clientX - drag.x0) * f, y: drag.v.y - (e.clientY - drag.y0) * f }));
      // Re-render only when the drag first counts as a pan (for the grabbing cursor), not on every move.
      if (moved !== drag.moved) setDrag({ ...drag, moved });
      return;
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
      // A click without a drag clears the selection, as clicking empty canvas always has.
      if (Math.hypot(d.cur[0] - d.a[0], d.cur[1] - d.a[1]) * S * (cw / view.w) < 4) { setSel(NO_SEL); return; }
      const ids = onThis.filter((r) => boxPicks(roomPoly(r), d.a, d.cur)).map((r) => r.id);
      setSel({ room: ids[0] ?? '', walls: [], item: null, group: ids.length > 1 ? ids : [] });
      return;
    }
    if (d.k === 'box') {
      const w = Math.abs(d.cur[0] - d.a[0]), dd = Math.abs(d.cur[1] - d.a[1]);
      // A click without a drag sets the first corner; the next click sets the opposite one.
      if (w < 0.2 && dd < 0.2) {
        if (area) { setDraft([d.a]); setNote('Click each corner of the zone; click the first one, double-click or press Enter to finish.'); return; }
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
      if (d.room) {
        // A slide or a turn moves at least one of two points.
        const f = moveMap(d), moved = (q: Pt) => { const r = f(q); return Math.hypot(r[0] - q[0], r[1] - q[1]) > 1e-9; };
        if (moved([0, 0]) || moved([1, 0])) upd((h) => mapCorners(h, d.verts, f));
        return;
      }
      if (!dl[0] && !dl[1]) return;
      upd((h) => moveCorners(h, d.verts, dl));
    } else if (d.k === 'zone') {
      const dl = zoneDelta(d);
      if (!dl[0] && !dl[1]) return;
      upd((h) => editPoly(h, d.id, { move: (q, i) => (d.idx == null || d.idx === i ? [q[0] + dl[0], q[1] + dl[1]] : q) }));
    } else if (d.k === 'op') {
      const o = house.openings.find((x) => x.id === d.id), at = o && openingAt(d.cur, o.w, isDoorOp(o));
      if (o && at) upd((h) => { const x = h.openings.find((q) => q.id === d.id)!; x.room = at.room.id; x.edge = at.edge; x.side = roomEdges(at.room)[at.edge].side; x.t = at.t; if (at.to) x.to = at.to; else delete x.to; });
    } else if (d.k === 'pipe') {
      const pts = dragSegment(d.base, d.seg, loopShift(d));
      // Dropping a run along another joins them into one shared pipe, in the same undo step.
      upd((h) => { const x = h.heating.pipes?.find((q) => q.id === d.id); if (x?.leg) { x.leg = { storey: x.leg.storey, pts }; delete x.typed; joinRun(h, d.id); } });
    } else if (d.k === 'pend') {
      if (!d.moved) return;
      // On something it can feed (not itself): finished onto it; else the end just moves there.
      const hit = pipeHit(d.cur), b = hit && !('run' in hit.a && hit.a.run === d.id) ? hit.a : null;
      const at: Pt = b ? hit!.at : loose.current ? d.cur : [snap(d.cur[0]), snap(d.cur[1])], sq = !loose.current;
      const test = moveOpenEnd(structuredClone(house), d.id, b, at, sq);
      if ('error' in test) { setNote(test.error); return; }
      upd((h) => { moveOpenEnd(h, d.id, b, at, sq); });
      setNote('');
    } else if (d.k === 'node') {
      if (!d.moved) return;
      const at: Pt = loose.current ? d.cur : [snap(d.cur[0]), snap(d.cur[1])];
      upd((h) => moveNode(h, d.id, at));
    } else if (d.k === 'plant') {
      const dl = loopShift(d);
      upd((h) => movePlant(h, d.id, dl));
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
  const outline = tool === 'room' || area;
  const zoomIn = () => setViewNow((v) => ({ x: v.x + v.w * 0.1, y: v.y + v.w * ratio * 0.1, w: v.w * 0.8 }));
  const zoomOut = () => setViewNow((v) => ({ x: v.x - v.w * 0.125, y: v.y - v.w * ratio * 0.125, w: v.w * 1.25 }));
  const zoomFit = () => setViewNow(() => fit(house, ratio));
  const key = (e: React.KeyboardEvent) => {
    if (tool === 'select' && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      // The keyboard way to the menu: for the selected wall, window, door, emitter or room, opened at its middle.
      e.preventDefault();
      const t = ((): { on: MenuFor; at: Pt } | null => {
        if (sel.item?.k === 'pipe') {
          const p = house.heating.pipes?.find((x) => x.id === sel.item!.id), pts = p?.leg && (livePath(house, p) ?? p.leg.pts);
          if (!p || !pts || pts.length < 2) return null;
          const seg = Math.floor((pts.length - 2) / 2), a = pts[seg], b = pts[seg + 1];
          return { on: { k: 'pipe', id: p.id, seg }, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        }
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
        if (sel.item?.k === 'plant') { const pl = plantOf(house, sel.item.id); return pl ? { on: { k: 'plant', id: sel.item.id }, at: pl.at } : null; }
        const zn = zones.find((x) => x.id === sel.zone);
        if (zn) return { on: { k: 'zone', id: zn.id }, at: centroid(zn.poly) };
        const r = !zoneMode && onThis.find((x) => x.id === sel.room);
        return r ? { on: { k: 'room', id: r.id }, at: centroid(roomPoly(r)) } : null;
      })(), m = svgRef.current?.getScreenCTM();
      if (!t || !m) return;
      const q = new DOMPoint(t.at[0] * S, t.at[1] * S).matrixTransform(m);
      openMenu(t.on, q.x, q.y, t.at);
      return;
    }
    if (e.key === 'Escape') { setDraft([]); setNote(''); setTyped(''); setDrag(null); setPipeFrom(null); setTool('select'); }
    else if (tool === 'pipe' && pipeFrom && e.key === 'Enter') finishPipe(null);
    else if (tool === 'pipe' && pipeFrom && e.key === 'Backspace') { if (draft.length > 1) setDraft(draft.slice(0, -1)); else { setDraft([]); setPipeFrom(null); setNote(''); } }
    else if (outline && draft.length && /^[0-9.]$/.test(e.key)) setTyped(typed + e.key);
    // Zoom keys, only when no shape is being drawn (then digits type a length); Ctrl/Cmd keep the browser's own zoom.
    else if (!draft.length && !e.ctrlKey && !e.metaKey && !e.altKey && ['+', '=', '-', '_', '0', 'f', 'F'].includes(e.key)) {
      e.preventDefault();
      if (e.key === '+' || e.key === '=') zoomIn(); else if (e.key === '-' || e.key === '_') zoomOut(); else zoomFit();
    }
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
      else if (sel.item?.k === 'plant') upd((h) => removePlant(h, sel.item!.id));
      else if (sel.item?.k === 'pipe') { deleteRun(sel.item.id); return; }
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

  /** A resize cursor across the wall (the way it drags), to the nearest 45 degrees. */
  const DRAG_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  const wallCursor = (n: Pt) => DRAG_CURSORS[((Math.round((Math.atan2(n[1], n[0]) * 4) / Math.PI) % 4) + 4) % 4];
  /** Pointer handlers on a wall: press to select and drag, double-click for a corner, right-click (or long-press) for the wall menu. */
  const wallEvents = (r: Room, i: number, piece: WallPiece) => ({
    style: { cursor: wallCursor(roomEdges(r)[i].n) },
    onPointerDown: (ev: React.PointerEvent) => wallClick(ev, r, i, piece),
    onDoubleClick: (ev: React.MouseEvent) => { ev.stopPropagation(); addCornerAt(r.id, i, raw(ev)); },
    onContextMenu: menuOn({ k: 'wall', wall: { room: r.id, edge: i, span: piece.span, ...(piece.other ? { other: piece.other, gap: piece.gap } : {}) } }),
  });

  /** True where the wall at `t` metres along edge `idx` is drawn with thickness (the window or door is then drawn as a thin strip across it). */
  /** Where the wall at `t` along a room's wall is drawn, as offsets along the wall's normal (as the wall layer draws it); null where it has no thickness. */
  const wallBand = (room: string, idx: number, t: number): [number, number] | null => {
    const pc = wallPieces(house, room, idx, storey).find((p) => t >= p.span[0] - 0.01 && t <= p.span[1] + 0.01);
    if (!pc) return null;
    const between = !!pc.other && (pc.gap ?? 0) > 0.01, th = between ? pc.gap! : pieceThickness(house, room, idx, storey, pc);
    if (!(th > 0)) return null;
    const al = between ? 'out' : pieceAlign(house, room, idx, storey, pc);
    return al === 'out' ? [0, th] : al === 'in' ? [-th, 0] : [-th / 2, th / 2];
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
  const eg = (tool === 'radiator' && !roofSpace) || tool === 'fancoil' ? (hv ? emitterAt(hv, tool) : null) : null;
  const cornerAt = tool === 'corner' && hv ? nearestWall(house, storey, hv, 0.4) : null;
  const cursor = drag?.k === 'pan' && drag.moved ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair';
  const dragPoly = drag?.k === 'move' ? onThis.filter((r) => drag.verts.some(([id]) => id === r.id)) : [];
  // Sets the wall a dragged room is turning to match, for the highlight (the wall layer that also asks may be memoised).
  if (drag?.k === 'move' && drag.room) moveMap(drag);
  // The inside wall a room being moved or drawn would snap to: shown off each neighbour's wall it comes near, so the gap reads as a wall.
  const segs = (ps: Pt[], closed: boolean) => (closed ? ps : ps.slice(0, -1)).map((q, i): [Pt, Pt] => [q, ps[(i + 1) % ps.length]]);
  const rectOf = (a: Pt, b: Pt): Pt[] => [a, [b[0], a[1]], b, [a[0], b[1]]];
  const boxEnd = tool === 'box' ? (drag?.k === 'box' ? [drag.a, drag.cur] : boxA && hv ? [boxA, magnet(hv)] : null) : null;
  const movingSegs: Array<[Pt, Pt]> = zoneMode || loose.current ? [] : dragPoly.length ? dragPoly.flatMap((r) => segs(polyOf(r), true))
    : boxEnd ? segs(rectOf(boxEnd[0], boxEnd[1]), true) : tool === 'room' && draft.length && hv ? segs([...draft, draftPt(hv)], false) : [];
  const wallGhost = movingSegs.length ? wallGhosts(movingSegs, onThis.filter((r) => !dragPoly.includes(r)).map(roomPoly), innerT) : [];

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
      return { room, door: o.buildup === OPEN_DOORWAY ? ('open' as const) : house.buildups.find((x) => x.id === o.buildup)?.kind === 'door', p: [e.a[0] + e.d[0] * (c - half), e.a[1] + e.d[1] * (c - half)] as Pt, q: [e.a[0] + e.d[0] * (c + half), e.a[1] + e.d[1] * (c + half)] as Pt };
    });
  };
  const wallItems = (r: Room, moving: boolean) => {
    const es = roomEdges({ ...r, poly: polyOf(r), x: 0, y: 0 });
    return es.flatMap((e) => {
      // While a wall is being dragged the pieces are not recomputed: the whole wall moves as one.
      const pieces: WallPiece[] = moving ? [{ span: [0, e.len] }] : wallPieces(house, r.id, e.idx, storey);
      return pieces.map((pc, k) => {
        const s = !moving && isSelPiece(r.id, e.idx, pc) || (moving && sel.walls.some((w) => w.room === r.id && w.edge === e.idx));
        // Thickness comes from the build-up, on the side of the line the alignment says; rooms drawn a wall apart share a wall that fills the space between them.
        const between = !moving && !!pc.other && (pc.gap ?? 0) > 0.01;
        const th = moving ? 0 : between ? pc.gap! : pieceThickness(house, r.id, e.idx, storey, pc), al = between ? 'out' : pieceAlign(house, r.id, e.idx, storey, pc);
        const tm = Math.max(th, z(3) / S), lo = al === 'out' ? 0 : al === 'in' ? -tm : -tm / 2, hi = al === 'out' ? tm : al === 'in' ? 0 : tm / 2;
        const p0: Pt = [e.a[0] + e.d[0] * pc.span[0], e.a[1] + e.d[1] * pc.span[0]], p1: Pt = [e.a[0] + e.d[0] * pc.span[1], e.a[1] + e.d[1] * pc.span[1]];
        const atStart = pc.span[0] < 1e-6, atEnd = pc.span[1] > e.len - 1e-6;
        // At a corner each face (inner and outer) runs on to meet the same face of the room's next wall, so walls of different thickness, and inside corners, join without overhang.
        const ends = (end: boolean): { lo: number; hi: number } => {
          const g = es[(e.idx + (end ? 1 : es.length - 1)) % es.length];
          if (between || !(end ? atEnd : atStart) || atOther(r, end ? p1 : p0) || !g) return { lo: 0, hi: 0 };
          const [glo, ghi] = (moving ? null : wallBand(r.id, g.idx, end ? 0 : g.len)) ?? [0, 0], dir: Pt = end ? e.d : [-e.d[0], -e.d[1]];
          return { lo: faceReach(dir, e.n, lo, g.d, g.n, glo), hi: faceReach(dir, e.n, hi, g.d, g.n, ghi) };
        };
        const x0 = ends(false), x1 = ends(true);
        const q = (t: number, o: number) => to([e.a[0] + e.d[0] * t + e.n[0] * o, e.a[1] + e.d[1] * t + e.n[1] * o]).join(',');
        /** A stretch of the band; its ends are a length along the wall, or one for each face at a corner. */
        const band = (a: number | { lo: number; hi: number }, b: number | { lo: number; hi: number }) => {
          const A = typeof a === 'number' ? { lo: a, hi: a } : a, B = typeof b === 'number' ? { lo: b, hi: b } : b;
          return [q(A.lo, lo), q(Math.max(A.lo, B.lo), lo), q(Math.max(A.hi, B.hi), hi), q(A.hi, hi)].join(' ');
        };
        const s0 = { lo: pc.span[0] - x0.lo, hi: pc.span[0] - x0.hi }, s1 = { lo: pc.span[1] + x1.lo, hi: pc.span[1] + x1.hi };
        const owns = th > 0 && (!pc.other || r.id < pc.other);
        const hit = owns ? band(s0, s1) : null;
        const bands: string[] = [], strips: Array<{ pts: string; door: boolean | 'open' }> = [], cuts: Array<{ pts: string; color: string }> = [];
        if (owns) {
          // Windows and doors cut the wall: where one sits, only a thin strip is left.
          const holes: Array<[number, number, boolean | 'open', Room]> = [];
          const take = (o: { room: Room; door: boolean | 'open'; p: Pt; q: Pt }) => {
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
          let at: number | { lo: number; hi: number } = s0;
          for (const [t0, t1, door] of holes) {
            // The cut shows what is on each side of the thin strip: this room's colour on its side, and the colour of the room behind an inside wall, or of the outside for an outside wall.
            const mid = (lo + hi) / 2, near = zoneMode ? '#f7f7f4' : fill(r), far = pc.other ? (zoneMode ? '#f7f7f4' : fill(house.rooms.find((x) => x.id === pc.other) ?? r)) : '#fff';
            cuts.push({ pts: [q(t0, lo), q(t1, lo), q(t1, mid), q(t0, mid)].join(' '), color: near }, { pts: [q(t0, mid), q(t1, mid), q(t1, hi), q(t0, hi)].join(' '), color: far });
            const atMin = typeof at === 'number' ? at : Math.min(at.lo, at.hi);
            if (t0 > atMin) bands.push(band(at, t0));
            const m = (lo + hi) / 2, thin = Math.min(tm, Math.max(0.06, z(2) / S));
            strips.push({ pts: [q(t0, m - thin / 2), q(t1, m - thin / 2), q(t1, m + thin / 2), q(t0, m + thin / 2)].join(' '), door });
            at = Math.max(typeof at === 'number' ? at : Math.max(at.lo, at.hi), t1);
          }
          if (Math.max(s1.lo, s1.hi) > (typeof at === 'number' ? at : Math.min(at.lo, at.hi))) bands.push(band(at, s1));
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
        // Outside pieces of an edge share one face key; the canvas edges are renumbered, so take the id from the room itself.
        const party = !pc.other && !moving && house.faceBoundary[`w:${r.id}:${roomEdges(r)[e.idx]?.id}:${storey}`] === 'party';
        return { key: `${r.id}-${e.idx}-${k}`, r, e, pc, s, th, hit, bands, strips, cuts, a: to(p0), b: to(p1), out: !pc.other, party };
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
        {items.filter((i) => i.party && !i.s).flatMap((i) => i.bands.map((pts, n) => <polygon key={`p${i.key}-${n}`} points={pts} fill="url(#party-hatch)" pointerEvents="none"><title>Party wall (neighbour at {house.neighbourT} °C)</title></polygon>))}
        {items.filter((i) => i.s).flatMap((i) => i.bands.map((pts, n) => <polygon key={`s${i.key}-${n}`} points={pts} fill="#c2410c" pointerEvents="none" />))}
        {items.flatMap((i) => i.strips.map((t, n) => <polygon key={`t${i.key}-${n}`} points={t.pts} fill={t.door === 'open' ? '#e7d8c2' : t.door ? '#8a5a2b' : '#1f6fb5'} pointerEvents="none" />))}
        {items.map((i) => (
          <g key={i.key}>
            <line x1={i.a[0]} y1={i.a[1]} x2={i.b[0]} y2={i.b[1]} stroke={i.th > 0 ? (i.s ? '#fff' : '#9fb0bc') : i.s ? '#c2410c' : i.party ? '#7a4fb0' : '#14212b'} strokeWidth={i.th > 0 ? z(1) : z(i.s ? 5 : i.out ? 4 : 2)} strokeDasharray={i.th > 0 ? `${z(5)} ${z(3)}` : i.party ? `${z(8)} ${z(4)}` : undefined} strokeLinecap={i.th > 0 || i.pc.span[0] > 1e-6 || i.pc.span[1] < i.e.len - 1e-6 ? 'butt' : 'round'} pointerEvents="none" />
            {planSel && !zoneMode && i.hit && <polygon points={i.hit} fill="transparent" className="wall-hit" {...wallEvents(i.r, i.e.idx, i.pc)} />}
            {planSel && !zoneMode && <line x1={i.a[0]} y1={i.a[1]} x2={i.b[0]} y2={i.b[1]} stroke="transparent" strokeWidth={z(14 * hs)} className="wall-hit" {...wallEvents(i.r, i.e.idx, i.pc)} />}
          </g>
        ))}
      </>
    );
  }, [still, house, storey, zoneMode, fill, u, sel, tool, hs, grid, moveDrag, lens]); // eslint-disable-line react-hooks/exhaustive-deps

  const plantDrag = drag?.k === 'plant' && drag.moved ? drag : null;
  const plantLayer = useMemo(() => {
    const hs0 = house.heating, route = routePipes(house);
    const shift = (id: string, q: Pt): Pt => (plantDrag?.id === id ? [q[0] + loopShift(plantDrag)[0], q[1] + loopShift(plantDrag)[1]] : q);
    // Once pipework is laid out, its saved routes are drawn and can be edited; before that, a preview of where it would go.
    const runs = (hs0.pipes ?? []).filter((x) => x.leg);
    const legs = runs.length || !route ? [] : [...[...route.feeds.values()].flatMap((f) => f.legs), ...route.tails.map((t) => t.leg)].filter((l) => l.storey === storey);
    const pipeDrag = drag?.k === 'pipe' && drag.moved ? drag : null;
    // A storey shows the runs in its floor void and in its ceiling void, which is the floor void of the storey above, whichever floor they serve.
    const ends: Array<{ x: (typeof runs)[number]; end: Pt }> = [];
    // Where each free junction on this plan is, from the runs that meet there.
    const free = new Set((hs0.nodes ?? []).filter((n) => !n.on).map((n) => n.id)), junctions = new Map<string, Pt>();
    const runLines = runs.filter((x) => onPlan(storey, voidOf(house, x))).map((x) => {
      const live = livePath(house, x) ?? x.leg!.pts, endDrag = drag?.k === 'pend' && drag.moved && drag.id === x.id ? drag : null;
      const pts = pipeDrag?.id === x.id ? dragSegment(pipeDrag.base, pipeDrag.seg, loopShift(pipeDrag))
        : endDrag ? [...live.slice(0, -1), ...ell(house, storey, live[live.length - 2] ?? live[0], endDrag.cur).slice(1)] : live;
      const onR = sel.item?.k === 'pipe' && sel.item.id === x.id, v = voidOf(house, x), other = x.leg!.storey !== storey;
      const end = to(pts[pts.length - 1]), open = x.ends?.[1] === '' && !(hs0.pipes ?? []).some((c) => c.parent === x.id);
      if (open) ends.push({ x, end });
      if (x.leg!.storey === storey) { if (x.a && free.has(x.a)) junctions.set(x.a, pts[0]); if (x.b && free.has(x.b)) junctions.set(x.b, pts[pts.length - 1]); }
      return (
        <g key={`run${x.id}`}>
          <title>{x.name} · {x.size} · in the void {voidName(house, v)}{other ? ` · serves the ${house.storeys[x.leg!.storey]?.name.toLowerCase()}` : ''}{x.loose ? ' · not joined to the heat source' : x.loop ? ' · closes a loop: no flow is counted along it' : ''}</title>
          {/* Its level by line: solid under the floor, dots in the room, long dashes in the ceiling (a loop: dash-dot). Not joined to the heat
              source: grey. Runs serving the other floor are fainter; while drawing, runs on other levels fade right back. */}
          <polyline points={pts.map((q) => to(q).join(',')).join(' ')} fill="none" stroke={onR ? '#c2410c' : x.loose ? '#8a9199' : '#c0392b'} strokeOpacity={onR ? 1 : tool === 'pipe' && levelIn(storey, v) !== level ? 0.2 : other ? 0.45 : 0.8} strokeWidth={z(onR ? 3.5 : 2)} strokeLinejoin="round" pointerEvents="none"
            strokeDasharray={x.loop ? `${z(8)} ${z(3)} ${z(1)} ${z(3)}` : levelDash(levelIn(storey, v), z(1))} strokeLinecap={levelIn(storey, v) === 'room' && !x.loop ? 'round' : undefined} />
          {x.loose && !x.parent && (() => { const c = to(pts[0]), d = z(6); return <path d={`M${c[0] - d} ${c[1] - d} l${2 * d} ${2 * d} m0 ${-2 * d} l${-2 * d} ${2 * d}`} stroke="#b91c1c" strokeWidth={z(2.2)} pointerEvents="none"><title>{x.name} starts here, joined to nothing: draw a run to it, or drop an open end on it.</title></path>; })()}
          {/* Where a run from the void goes through to a heater on the other floor. */}
          {other && x.emitter && <circle cx={end[0]} cy={end[1]} r={z(3.5)} fill="#fff" stroke="#c0392b" strokeOpacity={0.6} strokeWidth={z(1.5)} pointerEvents="none" />}

          {onR && pts.slice(1, -1).map((q, i) => <circle key={i} cx={to(q)[0]} cy={to(q)[1]} r={z(3.5)} fill="#fff" stroke="#c2410c" strokeWidth={z(1.5)} pointerEvents="none" />)}
          {pipeSel && pts.slice(1).map((q, i) => (
            <line key={`h${i}`} x1={to(pts[i])[0]} y1={to(pts[i])[1]} x2={to(q)[0]} y2={to(q)[1]} stroke="transparent" strokeWidth={z(10 * hs)}
              style={{ cursor: Math.abs(q[0] - pts[i][0]) < 1e-6 ? 'ew-resize' : Math.abs(q[1] - pts[i][1]) < 1e-6 ? 'ns-resize' : 'move' }}
              onPointerDown={(ev) => { ev.stopPropagation(); setSel({ ...NO_SEL, item: { k: 'pipe', id: x.id } }); begin(ev, { k: 'pipe', id: x.id, seg: i, base: pts, start: raw(ev), cur: raw(ev), moved: false }); }}
              onDoubleClick={(ev) => { ev.stopPropagation(); addPipeCorner(x.id, pts, i, raw(ev)); }} onContextMenu={menuOn({ k: 'pipe', id: x.id, seg: i })} />
          ))}
        </g>
      );
    });
    const grab = (id: string) => pipeSel ? {
      onPointerDown: (ev: React.PointerEvent) => { setSel({ ...NO_SEL, item: { k: 'plant', id } }); begin(ev, { k: 'plant', id, start: raw(ev), cur: raw(ev), moved: false }); },
      onContextMenu: menuOn({ k: 'plant', id }),
      style: { cursor: 'grab' } } : { pointerEvents: 'none' as const };
    const on = (id: string) => sel.item?.k === 'plant' && sel.item.id === id;
    const box = (id: string, at: Pt, label: string, fillC: string, title: string) => {
      const c = to(shift(id, at)), r = z(11);
      return (
        <g key={id} {...grab(id)}>
          <title>{title}</title>
          <rect x={c[0] - r} y={c[1] - r} width={2 * r} height={2 * r} rx={z(id === 'cylinder' ? 11 : 2)} fill={fillC} stroke={on(id) ? '#c2410c' : '#14212b'} strokeWidth={z(on(id) ? 3 : 1.5)} />
          <text x={c[0]} y={c[1] + z(4)} textAnchor="middle" fill="#fff" style={{ fontSize: z(10), fontWeight: 700 }}>{label}</text>
        </g>
      );
    };
    const hp = house.hp.source === 'ashp' || house.hp.source === 'gshp';
    const src = hs0.source;
    return (
      <g>
        {/* Routes are measured from the saved positions, so they are hidden while something is dragged. */}
        {!plantDrag && legs.map((l, i) => <polyline key={`pl${i}`} points={pts(l.pts)} fill="none" stroke="#c0392b" strokeOpacity={0.75} strokeWidth={z(2)} strokeDasharray={`${z(6)} ${z(3)}`} strokeLinejoin="round" pointerEvents="none" />)}
        {!plantDrag && runLines}
        {/* A drop between levels: shown on each plan that shows either of its ends. */}
        {!plantDrag && (hs0.pipes ?? []).filter((d) => d.drop && [d.a, d.b].some((id) => { const v = hs0.nodes?.find((x) => x.id === id)?.v; return v != null && onPlan(storey, v); })).map((d) => {
          const c = to(d.drop!.at), on = sel.item?.k === 'pipe' && sel.item.id === d.id;
          return <g key={`drop${d.id}`} style={{ cursor: pipeSel ? 'pointer' : undefined }} pointerEvents={pipeSel ? undefined : 'none'}
            onPointerDown={pipeSel ? (ev) => { ev.stopPropagation(); setSel({ ...NO_SEL, item: { k: 'pipe', id: d.id } }); } : undefined}>
            <title>{d.name} · {d.size} · {d.length.toFixed(1)} m{d.loose ? ' · not joined to the heat source' : ''}</title>
            <circle cx={c[0]} cy={c[1]} r={z(8)} fill="#fff" stroke={on ? '#c2410c' : d.loose ? '#8a9199' : '#c0392b'} strokeWidth={z(on ? 2.5 : 1.8)} />
            <path d={`M${c[0]} ${c[1] - z(5)} v${z(10)} M${c[0] - z(2.5)} ${c[1] - z(2.5)} l${z(2.5)} ${-z(2.5)} l${z(2.5)} ${z(2.5)} M${c[0] - z(2.5)} ${c[1] + z(2.5)} l${z(2.5)} ${z(2.5)} l${z(2.5)} ${-z(2.5)}`} stroke={d.loose ? '#8a9199' : '#c0392b'} strokeWidth={z(1.5)} fill="none" />
          </g>;
        })}
        {/* A junction where two or more runs meet: drag it to move them all. */}
        {!plantDrag && pipeSel && [...junctions].filter(([id]) => (hs0.pipes ?? []).filter((p) => p.a === id || p.b === id).length > 1).map(([id, at]) => {
          const c = drag?.k === 'node' && drag.id === id && drag.moved ? to(drag.cur) : to(at);
          return <circle key={`j${id}`} cx={c[0]} cy={c[1]} r={z(5)} fill="#fff" stroke="#14212b" strokeWidth={z(1.5)} style={{ cursor: 'move' }}
            onPointerDown={(ev) => begin(ev, { k: 'node', id, start: raw(ev), cur: raw(ev), moved: false })}><title>Junction: drag to move every run that meets here</title></circle>;
        })}
        {!plantDrag && ends.map(({ x, end }) => <g key={`end${x.id}`}><rect x={end[0] - z(6)} y={end[1] - z(6)} width={z(12)} height={z(12)} fill="#fff" stroke="#c0392b" strokeWidth={z(2)} pointerEvents={pipeSel ? undefined : 'none'} style={{ cursor: 'grab' }}
            onPointerDown={pipeSel ? (ev) => { setSel({ ...NO_SEL, item: { k: 'pipe', id: x.id } }); begin(ev, { k: 'pend', id: x.id, start: raw(ev), cur: raw(ev), moved: false }); } : undefined}>
            <title>Open end: {x.name} feeds nothing yet. Drag it onto a radiator, fan coil, manifold, the cylinder or another run to connect it, or anywhere to move it; or tee a run off it with Draw a pipe run.</title></rect></g>)}
        {(hs0.risers ?? []).map((r) => {
          const c = to(shift(r.id, r.at));
          return (
            <g key={r.id} {...grab(r.id)}>
              <title>Pipe riser: pipes pass through the floors here</title>
              <circle cx={c[0]} cy={c[1]} r={z(8)} fill="#fff" stroke={on(r.id) ? '#c2410c' : '#c0392b'} strokeWidth={z(on(r.id) ? 3 : 2)} />
              <text x={c[0]} y={c[1] + z(4)} textAnchor="middle" fill="#c0392b" style={{ fontSize: z(11), fontWeight: 700 }}>↕</text>
            </g>
          );
        })}
        {/* Where each thing takes its pipes, and the ones that have none. The draw tool shows bigger rings of its own. */}
        {lens === 'pipes' && tool !== 'pipe' && (() => {
          const none = new Set(src ? unpiped(house) : []);
          return attachments(house, storey).map((a) => none.has(a.id)
            ? <circle key={`ap${a.id}`} cx={to(a.at)[0]} cy={to(a.at)[1]} r={z(9)} fill="none" stroke="#c0392b" strokeWidth={z(2)} strokeDasharray={`${z(3)} ${z(2)}`} pointerEvents="none"><title>{a.label}: no pipe run yet</title></circle>
            : <circle key={`ap${a.id}`} cx={to(a.at)[0]} cy={to(a.at)[1]} r={z(2.5)} fill="#0b8a7a" pointerEvents="none" />);
        })()}
        {hs0.cylinder?.storey === storey && box('cylinder', hs0.cylinder.at, 'HW', '#1f6fb5', 'Hot water cylinder')}
        {manifolds(house).filter((zn) => zn.manifold!.storey === storey).map((zn) => box(`m:${zn.id}`, [zn.manifold!.x, zn.manifold!.y], 'M', zn.color, `${manifoldName(house, zn.id)}: feeds every UFH loop on it`))}
        {src?.storey === storey && box('source', src.at, hp ? 'HP' : 'B', '#c2410c', hp ? 'Heat pump' : 'Boiler')}
        {src && src.storey !== storey && (
          // The source on another floor, faint, so the pipes coming through the floor make sense.
          <g pointerEvents="none" opacity={0.35}>
            <title>{hp ? 'Heat pump' : 'Boiler'} on {house.storeys[src.storey]?.name}</title>
            <rect x={to(src.at)[0] - z(9)} y={to(src.at)[1] - z(9)} width={z(18)} height={z(18)} rx={z(2)} fill="none" stroke="#c2410c" strokeWidth={z(1.5)} strokeDasharray={`${z(3)} ${z(2)}`} />
          </g>
        )}
      </g>
    );
  }, [house, storey, tool, sel, plantDrag, drag?.k === 'pipe' || drag?.k === 'pend' || drag?.k === 'node' ? drag : null, u, hs, lens]); // eslint-disable-line react-hooks/exhaustive-deps

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
              // The opening is drawn as a gap across the whole wall, so it is picked up across the whole wall too, not just at the room's outline.
              const band = wallBand(rr.id, ee.idx, c), mid = band ? ((band[0] + band[1]) / 2) * S : 0, nx = ee.n[0] * mid, ny = ee.n[1] * mid;
              return (
                <g key={o.id}>
                  {on && <line x1={a[0] + nx} y1={a[1] + ny} x2={b[0] + nx} y2={b[1] + ny} stroke="#c2410c" strokeWidth={Math.max(z(12), band ? (band[1] - band[0]) * S : 0)} strokeLinecap="round" opacity={0.35} pointerEvents="none" />}
                  {!band && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={o.buildup === OPEN_DOORWAY ? '#d6c2a4' : door ? '#8a5a2b' : '#1f6fb5'} strokeWidth={z(6)} pointerEvents="none" />}
                  {planSel && <line x1={a[0] + nx} y1={a[1] + ny} x2={b[0] + nx} y2={b[1] + ny} stroke="transparent" strokeWidth={Math.max(z(16 * hs), band ? (band[1] - band[0]) * S : 0)} style={{ cursor: 'grab' }}
                    onPointerDown={(ev) => { setSel({ room: r.id, walls: [], item: { k: 'op', id: o.id } }); begin(ev, { k: 'op', id: o.id, start: raw(ev), cur: raw(ev), moved: false }); }}
                    onContextMenu={menuOn({ k: 'op', id: o.id })} />}
                </g>
              );
            });
          });
  }), [house, storey, zoneMode, u, sel, tool, hs, opDrag, lens]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="draw-wrap">
      <svg ref={svgRef} className={`draw${drag?.k === 'pan' && drag.moved ? ' grabbing' : spaceHeld ? ' grab' : ''}`} tabIndex={0} style={{ cursor }} viewBox={`${(live.current ?? view).x} ${(live.current ?? view).y} ${(live.current ?? view).w} ${(live.current ?? view).w * ratio}`} role="application"
        aria-label={`${house.storeys[storey]?.name ?? 'Roof space'} drawing canvas`} onPointerDownCapture={trackDown} onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release}
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
          <pattern id="party-hatch" width={z(7)} height={z(7)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={z(7)} stroke="#c9b3ea" strokeWidth={z(2.5)} />
          </pattern>
          <pattern id="draw-grid" width={S} height={S} patternUnits="userSpaceOnUse"><path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#d7dde2" strokeWidth={z(1)} /></pattern>
        </defs>
        <rect x={view.x} y={view.y} width={view.w} height={view.w * ratio} fill="#fff" />
        <rect x={view.x} y={view.y} width={view.w} height={view.w * ratio} fill="url(#draw-grid)" pointerEvents="none" />
        <line x1={view.x} x2={view.x + view.w} y1={0} y2={0} stroke="#b9c4cc" strokeWidth={z(1)} strokeDasharray={`${z(6)} ${z(4)}`} pointerEvents="none" />
        {house.guide && <g pointerEvents="none">
          {house.guide.poly
            ? <polygon points={pts(house.guide.poly)} fill="none" stroke="#8a99a6" strokeWidth={z(1.5)} strokeDasharray={`${z(8)} ${z(5)}`} />
            : <rect x={0} y={0} width={house.guide.w * S} height={house.guide.d * S} fill="none" stroke="#8a99a6" strokeWidth={z(1.5)} strokeDasharray={`${z(8)} ${z(5)}`} />}
          <text x={z(6)} y={-z(6)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{house.guide.w} × {house.guide.d} m footprint{house.guide.poly ? ' © OpenStreetMap contributors' : ''}</text>
        </g>}
        <line y1={view.y} y2={view.y + view.w * ratio} x1={0} x2={0} stroke="#b9c4cc" strokeWidth={z(1)} strokeDasharray={`${z(6)} ${z(4)}`} pointerEvents="none" />
        {underlay?.(to, S)}
        {ghost.map((r) => <polygon key={r.id} points={pts(roomPoly(r))} fill="#14212b" fillOpacity={0.04} stroke="#8a96a1" strokeWidth={z(1.2)} strokeDasharray={`${z(5)} ${z(4)}`} pointerEvents="none" />)}

        {onThis.map((r) => {
          const p = polyOf(r), c = to(centroid(p)), on = sel.room === r.id || grp.includes(r.id);
          return (
            <g key={r.id}>
              <polygon points={pts(p)} fill={zoneMode ? '#f7f7f4' : fill(r)} fillOpacity={0.92} stroke="none" style={{ cursor: planSel && !zoneMode ? 'move' : undefined }} pointerEvents={zoneMode ? 'none' : undefined}
                onPointerDown={planSel && !zoneMode ? (e) => {
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
                onDoubleClick={planSel && !zoneMode ? () => { location.hash = href('room', r.id); } : undefined}
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

        {/* Where a wall is split: a corner on a straight line, ticked across the wall so the change of build-up shows. */}
        {!zoneMode && onThis.flatMap((r) => polyOf(r).flatMap((b, i, ps) => {
          const a = ps[(i + ps.length - 1) % ps.length], c = ps[(i + 1) % ps.length], ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1], lu = Math.hypot(ux, uy);
          if (lu < 1e-6 || Math.abs(ux * vy - uy * vx) > 1e-4 * lu * Math.hypot(vx, vy) || ux * vx + uy * vy <= 0) return [];
          const n: Pt = [-uy / lu, ux / lu], m = to(b), k = z(9);
          return [<line key={`sp${r.id}-${i}`} x1={m[0] - n[0] * k} y1={m[1] - n[1] * k} x2={m[0] + n[0] * k} y2={m[1] + n[1] * k} stroke="#c2410c" strokeWidth={z(2.5)} strokeLinecap="round" pointerEvents="none"><title>Wall split: each side has its own build-up</title></line>];
        }))}

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
          const nearEdge = (q: Pt) => nearZoneEdge(pz, q);
          return (
            <g key={zn.id}>
              <polygon points={pts(pz)} fill={roofMode ? 'url(#roof-hatch)' : zn.ufh ? 'url(#ufh-hatch)' : 'url(#zone-hatch)'} stroke={on ? '#c2410c' : roofMode ? '#5b4a8a' : zn.ufh ? '#b45309' : '#0b8a7a'} strokeWidth={z(on ? 2.5 : 1.8)} strokeDasharray={zn.ufh ? `${z(6)} ${z(3)}` : undefined}
                style={{ cursor: tool === 'select' ? 'move' : undefined }} pointerEvents={zoneMode && tool === 'select' ? undefined : 'none'}
                onPointerDown={(e) => { setSel({ ...NO_SEL, zone: zn.id }); begin(e, { k: 'zone', id: zn.id, start: raw(e), cur: raw(e), moved: false }); }}
                onContextMenu={zoneMode && tool === 'select' ? menuOn({ k: 'zone', id: zn.id }) : undefined}
                onDoubleClick={(e) => { e.stopPropagation(); const i = nearEdge(raw(e)); if (i >= 0) { const p: Pt = [snap(raw(e)[0]), snap(raw(e)[1])]; upd((h) => editPoly(h, zn.id, { insert: [i, p] })); } }} />
              {zoneMode ? <>
                <text x={c[0]} y={c[1] - z(2)} textAnchor="middle" className="plan-t" style={{ fontSize: z(12) }} pointerEvents="none">{zn.name}</text>
                <text x={c[0]} y={c[1] + z(12)} textAnchor="middle" className="plan-s" style={{ fontSize: z(11) }} pointerEvents="none">{roofMode ? (() => { const r = house.roofs.find((x) => x.id === zn.id); return r ? `${r.form === 'custom' ? 'edge by edge' : r.form}${r.form === 'flat' ? '' : ` ${r.pitch}°`} · on the ${house.storeys[roofStorey(house, r)]?.name.toLowerCase()}` : ''; })() : <>{(bu?.name ?? '?').slice(0, 20)}{(bu?.name.length ?? 0) > 20 ? '…' : ''}</>} · {polyArea(pz).toFixed(1)} m²</text>
              </> : (() => {
                // A tag below the room labels: click to select the zone, drag to move it.
                const st = stair(zn), up = st && (house.zones ?? []).find((q) => q.id === zn.id)?.band === storey + 1;
                const t = `${st ? (up ? '↑ ' : '↓ ') : ''}${zn.name} · ${polyArea(pz).toFixed(1)} m²`, w = z(t.length * 6.6 + 14), y = c[1] + z(44);
                const grab = st ? planSel : pipeSel;
                return (
                  <g style={{ cursor: grab ? 'move' : undefined }} pointerEvents={grab ? undefined : 'none'}
                    onPointerDown={(e) => { setSel({ ...NO_SEL, zone: zn.id }); begin(e, { k: 'zone', id: zn.id, start: raw(e), cur: raw(e), moved: false }); }}
                    onContextMenu={grab ? menuOn({ k: 'zone', id: zn.id }) : undefined}>
                    <rect x={c[0] - w / 2} y={y - z(10)} width={w} height={z(18)} rx={z(9)} fill={on ? '#c2410c' : st ? '#0b8a7a' : '#b45309'} />
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

        {/* Heat source, cylinder, risers and the pipe routes between them (under the emitters, so a radiator can still be picked up) */}
        {!zoneMode && <g opacity={lens === 'pipes' ? 1 : 0.4}>{plantLayer}</g>}

        {/* Heat emitters */}
        {house.heating.emitters.filter((e) => { const r = house.rooms.find((x) => x.id === e.room); return r && emitterStorey(house, e) === storey && !e.fromZone && (!zoneMode || (e.kind === 'ufh' && !!e.rect && band! <= house.storeys.length - 1)); }).map((e) => {
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
          const len = (e.kind === 'ufh' || e.kind === 'fancoil' ? 0.9 : e.kind === 'towel' ? 0.5 : e.len / 1000) * S, th = (e.kind === 'ufh' ? 0.9 : 0.1) * S;
          return (
            <g key={e.id} transform={`translate(${c[0]} ${c[1]}) rotate(${e.kind === 'ufh' ? 0 : ps.ang})`}
              onPointerDown={pipeSel ? (ev) => { setSel({ room: e.room, walls: [], item: { k: 'em', id: e.id } }); begin(ev, { k: 'em', id: e.id, start: raw(ev), cur: raw(ev), moved: false }); } : undefined}
              onContextMenu={pipeSel ? menuOn({ k: 'em', id: e.id }) : undefined}
              // On the plan lens heaters are fixed: greyed out, so they read as not movable there.
              style={{ cursor: pipeSel ? 'grab' : undefined, filter: lens === 'pipes' ? undefined : 'grayscale(1)' }} opacity={lens === 'pipes' ? 1 : 0.45} pointerEvents={pipeSel ? undefined : 'none'}>
              <rect x={-len / 2 - z(4)} y={-th / 2 - z(4)} width={len + z(8)} height={th + z(8)} fill="transparent" />
              {e.kind === 'ufh'
                ? <><rect x={-len / 2} y={-th / 2} width={len} height={th} fill="#f3c9a2" fillOpacity={0.55} stroke={on ? '#c2410c' : '#9a3412'} strokeWidth={z(on ? 2.5 : 1.5)} strokeDasharray={`${z(4)} ${z(3)}`} /><text textAnchor="middle" y={z(4)} className="plan-s" style={{ fontSize: z(11) }}>UFH</text></>
                : <rect x={-len / 2} y={-th / 2} width={len} height={th} fill={e.kind === 'fancoil' ? (on ? '#0e7490' : '#155e75') : on ? '#c2410c' : '#9a3412'} stroke="#14212b" strokeWidth={z(1)} rx={z(2)} />}
            </g>
          );
        })}

        {/* Dimensions on the selected room and on anything being dragged */}
        {[...new Set([...onThis.filter((r) => r.id === sel.room), ...dragPoly])].flatMap((r) => dimOf(r, polyOf(r)).filter(({ e }) => e.len > 0.15).map(({ e, mid }) => (
          <text key={`${r.id}-d${e.idx}`} x={mid[0]} y={mid[1] + z(4)} textAnchor="middle" className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{e.len.toFixed(2)} m</text>
        )))}

        {/* Corners: every one drags; double-click or the right-click menu removes it. */}
        {planSel && !zoneMode && onThis.flatMap((r) => polyOf(r).map((q, i) => {
          const v = to(q), on = sel.room === r.id, moving = drag?.k === 'move' && drag.verts.some(([id, j]) => id === r.id && j === i);
          return <circle key={`${r.id}-v${i}`} cx={v[0]} cy={v[1]} r={z((on ? 6.5 : 4.5) * hs)} className={`vx${on ? ' on' : ''}${moving ? ' moving' : ''}`} strokeWidth={z(2)} aria-label={`${r.name} corner ${i + 1}`}
            onPointerDown={(e) => { if (e.button === 2) { e.stopPropagation(); return; } setSel({ room: r.id, walls: [], item: null }); begin(e, { k: 'move', start: raw(e), cur: raw(e), verts: together(r.id, [i], e.altKey), base: roomPoly(r)[i], free: true, moved: false }); }}
            onDoubleClick={(e) => { e.stopPropagation(); upd((h) => removeCorner(h, r.id, i)); }} onContextMenu={menuOn({ k: 'corner', room: r.id, idx: i })} />;
        }))}

        {/* Corners of the selected zone, over the room corners they often sit on. */}
        {tool === 'select' && zones.filter((zn) => zn.id === sel.zone).flatMap((zn) => zonePoly(zn).map((q, i) => (
          <circle key={`${zn.id}-v${i}`} cx={to(q)[0]} cy={to(q)[1]} r={z(6.5 * hs)} className="vx on" strokeWidth={z(2)} aria-label={`${zn.name} corner ${i + 1}`}
            onPointerDown={(e) => begin(e, { k: 'zone', id: zn.id, idx: i, start: raw(e), cur: raw(e), moved: false })}
            onDoubleClick={(e) => { e.stopPropagation(); if (zn.poly.length > 3) upd((h) => editPoly(h, zn.id, { remove: i })); }} onContextMenu={menuOn({ k: 'zcorner', id: zn.id, idx: i })} />
        )))}
        {/* In-progress drawing and placement previews */}
        {tool === 'pipe' && (() => {
          // Attachment points, the rubber band from the last corner, and what a click would attach to.
          const hit = hv ? (pipeFrom ? pipeEnd(hv) : pipeHit(hv)) : null, last = draft[draft.length - 1];
          const next = hv && last ? (hit ? hit.at : pipePt(hv)) : null, band = last && next ? [...draft, ...(hit && !loose.current && !near(next, last) ? squareInto(house, storey, draft[draft.length - 2], last, next).slice(1, -1) : []), next] : draft;
          return <g pointerEvents="none">
            {attachments(house, storey).map((x) => <circle key={x.id} cx={to(x.at)[0]} cy={to(x.at)[1]} r={z(9)} fill="none" stroke="#0b8a7a" strokeWidth={z(2)} strokeDasharray={`${z(3)} ${z(2)}`}><title>{x.label}</title></circle>)}
            {band.length > 1 && <polyline points={pts(band)} fill="none" stroke="#c0392b" strokeWidth={z(2.5)} strokeDasharray={`${z(7)} ${z(4)}`} strokeLinejoin="round" />}
            {draft.map((q, i) => <circle key={i} cx={to(q)[0]} cy={to(q)[1]} r={z(3.5)} fill="#fff" stroke="#c0392b" strokeWidth={z(1.5)} />)}
            {hit && <circle cx={to(hit.at)[0]} cy={to(hit.at)[1]} r={z(11)} fill="#0b8a7a" fillOpacity={0.2} stroke="#0b8a7a" strokeWidth={z(2.5)} />}
            {hv && (hit || (last && next)) && <text x={to(hit ? hit.at : next!)[0] + z(12)} y={to(hit ? hit.at : next!)[1] - z(10)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>
              {hit ? hit.label : `${Math.hypot(next![0] - last[0], next![1] - last[1]).toFixed(2)} m`}</text>}
          </g>;
        })()}
        {draft.length > 0 && tool !== 'pipe' && <>
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
          {tool === 'fancoil' ? <rect x={-0.45 * S} y={-0.05 * S} width={0.9 * S} height={0.1 * S} fill="#155e75" /> : <rect x={-0.5 * S} y={-0.05 * S} width={S} height={0.1 * S} fill="#9a3412" />}
        </g>}
        {wallGhost.map(({ box: [x0, y0, x1, y1], on }, i) => {
          // At least 6 px across, so a thin inside wall still shows over a thick outside one.
          const m = z(6) / S, gx = Math.max(0, m - (x1 - x0)) / 2, gy = Math.max(0, m - (y1 - y0)) / 2;
          return <rect key={`wg${i}`} x={(x0 - gx) * S} y={(y0 - gy) * S} width={(x1 - x0 + 2 * gx) * S} height={(y1 - y0 + 2 * gy) * S}
            fill="#14b8a6" fillOpacity={on ? 0.95 : 0.6} stroke="#0b8a7a" strokeWidth={z(1)} strokeDasharray={on ? undefined : `${z(4)} ${z(3)}`} pointerEvents="none"><title>Inside wall: the room snaps to its far side</title></rect>;
        })}
        {parRefs.map(([a, b], i) => <line key={`pr${i}`} x1={to(a)[0]} y1={to(a)[1]} x2={to(b)[0]} y2={to(b)[1]} stroke="#14b8a6" strokeWidth={z(4)} strokeLinecap="round" opacity={0.8} pointerEvents="none"><title>Lined up parallel with this wall</title></line>)}
        {guides.map(([a, b], i) => <line key={`gd${i}`} x1={to(a)[0]} y1={to(a)[1]} x2={to(b)[0]} y2={to(b)[1]} stroke="#0b8a7a" strokeWidth={z(1.2)} strokeDasharray={`${z(5)} ${z(4)}`} pointerEvents="none" />)}
        {boxA && hv && tool === 'box' && (() => { const q = magnet(hv); return <rect x={Math.min(boxA[0], q[0]) * S} y={Math.min(boxA[1], q[1]) * S} width={Math.abs(q[0] - boxA[0]) * S} height={Math.abs(q[1] - boxA[1]) * S} fill="#fdf3ea" fillOpacity={0.6} stroke="#c2410c" strokeWidth={z(2)} strokeDasharray={`${z(7)} ${z(4)}`} pointerEvents="none" />; })()}
        {cut && <circle cx={to(cut)[0]} cy={to(cut)[1]} r={z(5)} fill="#c2410c" pointerEvents="none" />}
        {cut && cutLine && <line x1={to(cut)[0]} y1={to(cut)[1]} x2={to(cutLine)[0]} y2={to(cutLine)[1]} stroke="#c2410c" strokeWidth={z(1.5)} strokeDasharray={`${z(4)} ${z(4)}`} pointerEvents="none" />}
        {cutHit && <line x1={to(cutHit[0].p)[0]} y1={to(cutHit[0].p)[1]} x2={to(cutHit[1].p)[0]} y2={to(cutHit[1].p)[1]} stroke="#c2410c" strokeWidth={z(4)} pointerEvents="none" />}
        {drag?.k === 'box' && area && <text x={drag.cur[0] * S + z(10)} y={drag.cur[1] * S + z(16)} className="draw-dim" style={{ fontSize: z(11), strokeWidth: z(3) }}>{tool === 'ufh' ? 'UFH zone' : 'Stairwell'}</text>}
        {drag?.k === 'marq' && (() => { const crossing = drag.cur[0] < drag.a[0], c = crossing ? '#1f7a4d' : '#0b63b5'; return <rect x={Math.min(drag.a[0], drag.cur[0]) * S} y={Math.min(drag.a[1], drag.cur[1]) * S} width={Math.abs(drag.cur[0] - drag.a[0]) * S} height={Math.abs(drag.cur[1] - drag.a[1]) * S} fill={c} fillOpacity={0.08} stroke={c} strokeWidth={z(1.5)} strokeDasharray={crossing ? `${z(5)} ${z(3)}` : undefined} pointerEvents="none" />; })()}
        {cornerAt && <circle cx={to(cornerAt.at)[0]} cy={to(cornerAt.at)[1]} r={z(6)} fill="#fff" stroke="#c2410c" strokeWidth={z(2)} pointerEvents="none" />}
        {overlay?.(to, S, fromEvent)}
      </svg>
      {/* Stop the buttons taking focus, so typed lengths and Enter still reach the canvas. */}
      <NorthDial north={house.north ?? 0} onSet={lens === 'pipes' ? undefined : (n) => upd((h) => { h.north = n; })} />
      {/* The level new runs go in, and the key to the line styles. */}
      {lens === 'pipes' && <div className="level-switch" role="group" aria-label="Level new runs are drawn in" onMouseDown={(e) => e.preventDefault()}>
        {LEVELS.map(([l, name]) => (
          <button key={l} type="button" className={level === l ? 'chip on' : 'chip'} aria-pressed={level === l} onClick={() => pickLevel(l)} title={`New runs: ${voidName(house, storey + LEVEL_AT[l]).toLowerCase()}`}>
            <svg width="24" height="8" aria-hidden="true"><line x1="2" y1="4" x2="22" y2="4" stroke="#c0392b" strokeWidth="2" strokeDasharray={levelDash(l, 1)} strokeLinecap={l === 'room' ? 'round' : undefined} /></svg>{name}
          </button>
        ))}
      </div>}
      <div className="draw-zoom" role="group" aria-label="Zoom" onMouseDown={(e) => e.preventDefault()}>
        {zoomStart}
        <button type="button" className="btn-secondary" aria-label="Zoom in" title="Zoom in (+)" onClick={zoomIn}>+</button>
        <button type="button" className="btn-secondary" aria-label="Zoom out" title="Zoom out (−)" onClick={zoomOut}>−</button>
        <button type="button" className="btn-secondary" title="Fit the plan (0 or F)" onClick={zoomFit}>Fit</button>
      </div>
      {note && <p className="draw-note" role="status">{note}
        {/* For touch, where there is no Enter or Backspace. */}
        {tool === 'pipe' && pipeFrom && <span className="draw-note-acts" onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className="btn-link" onClick={() => { if (draft.length > 1) setDraft(draft.slice(0, -1)); else { setDraft([]); setPipeFrom(null); setNote(''); } }}>{draft.length > 1 ? 'Undo corner' : 'Cancel'}</button>
          {feedsFrom(pipeFrom) && draft.length > 1 && <button type="button" className="btn-link" onClick={() => finishPipe(null)}>Leave the end open</button>}
        </span>}
      </p>}
      {menu && (() => {
        /** `panel`: the action moves focus to the side panel, so the canvas must not take it back. */
        /** `panel`: the action moves focus to the side panel, so the canvas must not take it back. `list`: picking the item opens these choices beside it; `choose` applies one. */
        type Item = { label: string; glyph: string; off?: string; panel?: boolean; run: () => void; list?: Array<{ id: string; name: string }>; cur?: string; choose?: (id: string) => void };
        const edit = (label: string, glyph: string, field: EditField): Item => ({ label, glyph, panel: true, run: () => onEdit?.(field) });
        const choices = (label: string, list: Array<{ id: string; name: string }>, cur: string | undefined, choose: (id: string) => void): Item => ({ label, glyph: '◧', run: () => {}, list, cur, choose });
        /** A build-up picker: each with its U-value, then Add build-up at the bottom, which applies the one added. */
        const buChoices = (label: string, kind: BuildupKind, list: Buildup[], cur: string | undefined, choose: (id: string) => void): Item =>
          choices(label, [...list.map((b) => ({ id: b.id, name: buildupLabel(b) })), { id: ADD_BUILDUP, name: ADD_BUILDUP_LABEL }], cur, (id) => (id === ADD_BUILDUP ? addBuildup(kind, choose) : choose(id)));
        const on = menu.on, at = menu.at;
        const { title, tip, items } = ((): { title: string; tip: string; items: Item[] } => {
          if (on.k === 'wall') {
            const w = on.wall, outside = !w.other, len = w.span ? w.span[1] - w.span[0] : 0;
            // The same faces the panel's build-up picker sets: this stretch, or the whole wall.
            const keys = w.span ? pieceKeys(house, w.room, w.edge, storey, w) : wallKeys(house, w.room, w.edge, storey);
            return { title: 'Wall actions', tip: `${outside ? 'Outside' : 'Inside'} wall${len ? ` · ${len.toFixed(2)} m` : ''}`, items: [
              { label: 'Add a corner', glyph: '＋', run: () => addCornerAt(w.room, w.edge, at) },
              { label: 'Add a window', glyph: '▬', off: !outside ? 'Windows go on outside walls' : openingAt(at, 1.2, false, w.room) ? undefined : 'No clear stretch wide enough for a window here', run: () => placeOpening(at, false, w.room) },
              { label: 'Add a door', glyph: '▯', off: openingAt(at, 0.9, true, w.room) ? undefined : 'No clear stretch wide enough for a door here', run: () => placeOpening(at, true, w.room) },
              buChoices('Wall build-up', 'wall', house.buildups.filter((b) => b.kind === 'wall'), house.faceBuildup[keys[0]] ?? house.defaults[keys[0]?.startsWith('w:') ? 'extWall' : 'intWall'],
                (id) => upd((h) => keys.forEach((k) => { h.faceBuildup[k] = id; }))),
              edit('Wall length', '↔', 'size'),
              { ...choices('Select walls', [{ id: 'out', name: 'All outside walls' }, { id: 'all', name: 'All walls' }, { id: 'room', name: "This room's walls" }], undefined,
                (id) => setSel(id === 'room' ? { ...NO_SEL, room: w.room, walls: storeyWalls(house, storey, false, w.room) } : { ...NO_SEL, room: sel.room, walls: storeyWalls(house, storey, id === 'out') })), glyph: '⬚' },
            ] };
          }
          if (on.k === 'room') {
            const r = house.rooms.find((x) => x.id === on.id);
            if (!r) return { title: '', tip: '', items: [] };
            // The right-clicked room keeps its name and settings; the others join it.
            const ids = grp.length > 1 && grp.includes(r.id) ? [r.id, ...grp.filter((x) => x !== r.id)] : [];
            return { title: `${r.name} actions`, tip: ids.length ? `${ids.length} rooms selected` : `${r.name} · ${polyArea(roomPoly(r)).toFixed(1)} m²`, items: [
              ...(ids.length && lens !== 'pipes' ? [{ label: `Merge ${ids.length} rooms into ${r.name}`, glyph: '⊞', run: () => {
                if (!mergeRooms(structuredClone(house), ids)) { setNote('Those rooms cannot be merged: they must touch, be on the same storeys, and join into one outline without a hole.'); return; }
                upd((h) => { mergeRooms(h, ids); });
                setSel({ ...NO_SEL, room: r.id });
              } }] : []),
              { label: 'Open room', glyph: '↗', run: () => { location.hash = href('room', r.id); } },
              ...(lens === 'pipes' ? [] : [edit('Rename', '✎', 'name')]),
              { label: 'Add a radiator', glyph: '≣', off: r.heated ? undefined : `${r.name} is unheated; make it heated first`, run: () => placeEmitter(at, 'radiator') },
              { label: r.heated ? 'Make unheated' : 'Make heated', glyph: r.heated ? '❄' : '♨', run: () => upd((h) => { const x = h.rooms.find((q) => q.id === r.id); if (x) x.heated = !x.heated; }) },
              ...(lens === 'pipes' ? [] : [{ label: 'Delete room', glyph: '✕', run: () => { upd((h) => deleteRoom(h, r.id)); setSel(NO_SEL); } }]),
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
              buChoices(door ? 'Door type' : 'Glazing', door ? 'door' : 'glazing', house.buildups.filter((b) => listedAs(b) === (door ? 'door' : 'glazing')), o?.buildup,
                (id) => upd((h) => { const x = h.openings.find((q) => q.id === on.id); if (x) x.buildup = id; })),
              { label: 'Delete', glyph: '✕', run: () => { upd((h) => { h.openings = h.openings.filter((x) => x.id !== on.id); }); setSel(NO_SEL); } },
            ] };
          }
          if (on.k === 'pipe') {
            const p = house.heating.pipes?.find((x) => x.id === on.id), pts = p?.leg && (livePath(house, p) ?? p.leg.pts);
            if (!p || !pts) return { title: '', tip: '', items: [] };
            return { title: 'Pipe run actions', tip: `${p.name} · ${p.size} · in the void ${voidName(house, voidOf(house, p))}`, items: [
              { label: 'Add a corner', glyph: '＋', run: () => addPipeCorner(p.id, pts, on.seg, at) },
              choices('Where it runs', LEVELS.map(([id, name]) => ({ id, name })), viaOf(house, p), (id) => upd((h) => { const x = h.heating.pipes?.find((q) => q.id === p.id); if (x) x.via = id as Level; })),
              { label: 'Delete run', glyph: '✕', run: () => deleteRun(p.id) },
            ] };
          }
          if (on.k === 'plant') {
            const what = plantName(house, on.id);
            return { title: `${what} actions`, tip: what, items: [
              { label: 'Pipework', glyph: '↗', run: () => { location.hash = href('pipes'); } },
              { label: 'Delete', glyph: '✕', run: () => { upd((h) => removePlant(h, on.id)); setSel(NO_SEL); } },
            ] };
          }
          if (on.k === 'zcorner') {
            const zn = zones.find((x) => x.id === on.id);
            if (!zn) return { title: '', tip: '', items: [] };
            return { title: 'Corner actions', tip: `${zn.name} · corner ${on.idx + 1}`, items: [
              { label: 'Delete corner', glyph: '✕', off: zn.poly.length <= 3 ? 'An outline needs at least three corners' : undefined, run: () => upd((h) => editPoly(h, zn.id, { remove: on.idx })) },
            ] };
          }
          if (on.k === 'zone') {
            const zn = zones.find((x) => x.id === on.id), rf = roofMode ? house.roofs.find((x) => x.id === on.id) : undefined, zz = house.zones?.find((x) => x.id === on.id);
            if (!zn || (!rf && !zz)) return { title: '', tip: '', items: [] };
            const edge = nearZoneEdge(zn.poly, at);
            const addCorner: Item = { label: 'Add a corner', glyph: '＋', off: edge < 0 ? 'Right-click nearer an edge to add a corner there' : undefined, run: () => upd((h) => editPoly(h, zn.id, { insert: [edge, [snap(at[0]), snap(at[1])]] })) };
            if (rf) return { title: `${rf.name} actions`, tip: `${rf.name} · ${polyArea(zn.poly).toFixed(1)} m²`, items: [
              addCorner,
              edit('Rename', '✎', 'name'),
              choices('Roof form', FORMS.map(([id, name]) => ({ id, name })), rf.form, (id) => upd((h) => {
                const x = h.roofs.find((q) => q.id === rf.id);
                if (!x) return;
                // As the panel does: an edge-by-edge roof starts from the outline's current edges.
                if (id === 'custom') { freezeOutline(h, x); if (x.poly) x.edges = roofEdgesOf(x, x.poly); }
                x.form = id as typeof x.form;
              })),
              { label: 'Delete roof', glyph: '✕', run: () => { upd((h) => { h.roofs = h.roofs.filter((q) => q.id !== rf.id); }); setSel(NO_SEL); } },
            ] };
            const z0 = zz!, st = stair(z0);
            return { title: `${z0.name} actions`, tip: `${z0.name} · ${polyArea(zn.poly).toFixed(1)} m²`, items: [
              addCorner,
              edit('Rename', '✎', 'name'),
              ...(st ? [] : [buChoices('Build-up', 'floor', house.buildups.filter((b) => listedAs(b) === 'floor' || listedAs(b) === 'roof'), z0.buildup,
                (id) => upd((h) => { const x = h.zones?.find((q) => q.id === z0.id); if (x) x.buildup = id; }))]),
              ...(st || z0.band >= house.storeys.length ? [] : [{ label: z0.ufh ? 'Remove underfloor heating' : 'Add underfloor heating', glyph: '▦',
                run: () => upd((h) => { const x = h.zones?.find((q) => q.id === z0.id); if (x) x.ufh = x.ufh ? undefined : true; }) }]),
              { label: `Delete ${st ? 'stairwell' : 'zone'}`, glyph: '✕', run: () => { upd((h) => { h.zones = h.zones?.filter((q) => q.id !== z0.id); }); setSel(NO_SEL); } },
            ] };
          }
          const em = house.heating.emitters.find((x) => x.id === on.id), name = em ? EMITTER_NAME[em.kind] : 'Radiator';
          // Only the fields the panel shows for this kind: a radiator has a type and a length, a UFH marker its area, a towel rail neither.
          return { title: `${name} actions`, tip: em?.kind === 'radiator' ? `${name} · ${em.len} mm` : name, items: [
            ...(em?.kind === 'radiator' ? [edit('Radiator type', '◧', 'type'), edit('Size', '↔', 'size')] : em?.kind === 'ufh' && !em.rect ? [edit('Heated floor area', '↔', 'size')] : []),
            { label: 'Delete', glyph: '✕', run: () => { upd((h) => { h.heating.emitters = h.heating.emitters.filter((x) => x.id !== on.id); }); setSel(NO_SEL); } },
          ] };
        })();
        if (!items.length) return null;
        // A half circle above the pointer (below it near the top edge), kept clear of the sides.
        const R = 64, up = menu.y > R + 34, x = Math.min(Math.max(menu.x, R + 26), size.w - R - 26);
        const pos = items.map((_, k) => { const a = items.length > 1 ? Math.PI - (k * Math.PI) / (items.length - 1) : Math.PI / 2; return [R * Math.cos(a), (up ? -1 : 1) * R * Math.sin(a)]; });
        const pick = (k: number) => { const it = items[k]; if (it.off) { setMenuTip(it.off); return; } if (it.list) { setSub(sub === k ? null : k); return; } closeMenu(!it.panel); it.run(); };
        const step = (e: React.KeyboardEvent) => {
          // Arrows move round the ring, or through the open list when focus is in it.
          const inList = !!(document.activeElement as HTMLElement | null)?.closest('.radial-list');
          const box = inList ? document.activeElement!.parentElement : menuRef.current;
          const bs = [...(box?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])], k = bs.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === 'Escape' && inList) { e.preventDefault(); menuRef.current?.querySelectorAll<HTMLButtonElement>(':scope > button')[sub!]?.focus(); setSub(null); }
          else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
          else if (/^Arrow(Right|Down)$/.test(e.key)) { e.preventDefault(); bs[(k + 1) % bs.length]?.focus(); }
          else if (/^Arrow(Left|Up)$/.test(e.key)) { e.preventDefault(); bs[(k + bs.length - 1) % bs.length]?.focus(); }
          else if (e.key === 'Tab') closeMenu(false);
        };
        return (
          <div className="radial-back" onPointerDown={() => closeMenu()} onContextMenu={(e) => { e.preventDefault(); if (e.target === e.currentTarget) closeMenu(); }}>
            <div ref={menuRef} className={`radial${up ? '' : ' down'}`} role="menu" aria-label={title} style={{ left: x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={step}>
              {items.map((it, k) => {
                const [dx, dy] = pos[k];
                return (
                  <button key={it.label} type="button" role="menuitem" className="radial-item" aria-label={it.label} aria-disabled={!!it.off} title={it.off ?? it.label}
                    aria-haspopup={it.list ? 'menu' : undefined} aria-expanded={it.list ? sub === k : undefined}
                    style={{ '--x': `${dx.toFixed(1)}px`, '--y': `${dy.toFixed(1)}px`, animationDelay: `${k * 25}ms` } as CSSProperties}
                    onPointerEnter={() => setMenuTip(it.off ?? it.label)} onFocus={() => setMenuTip(it.off ?? it.label)} onClick={() => pick(k)}>
                    <span aria-hidden="true">{it.glyph}</span>
                  </button>
                );
              })}
              {sub != null && items[sub]?.list && (() => {
                // Level with its button, just outside the ring (so it covers none of the other buttons), on the side with more room.
                const it = items[sub], dy = pos[sub][1], left = x > size.w / 2;
                return (
                  <div className="radial-list" role="menu" aria-label={it.label} style={{ left: left ? -(R + 28) : R + 28, top: dy, transform: `translate(${left ? '-100%' : '0'}, -50%)` }}>
                    {it.list!.map((b, i) => (
                      <button key={b.id} type="button" role="menuitemradio" aria-checked={b.id === it.cur}
                        autoFocus={b.id === it.cur || (i === 0 && !it.list!.some((q) => q.id === it.cur))} onClick={() => { closeMenu(); it.choose!(b.id); }}>{b.name}</button>
                    ))}
                  </div>
                );
              })()}
              <span className="radial-tip" aria-live="polite">{menuTip || tip}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
