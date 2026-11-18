import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CIBSE_ACH, SHADING, defaultTemp, listedAs, onStorey, roomEdges, roomHeight } from '../engine/house';
import type { Buildup, BuildupKind, House, HouseResult, Room, RoomType } from '../engine/house';
import { EMITTER_NAME, RAD_LABEL, UFH_PIPES, UFH_SPACINGS, loopLength, loopMax } from '../engine/house-heating';
import type { RadType } from '../engine/house-heating';
import { OPEN_DOORWAY, addBasement, addStoreyAbove, bandName, canAddBasement, canRemoveBasement, canRemoveTop, copyRooms, deleteRoom, flipRooms, innerDoorAt, isOutside, narrowAtWall, openingCentre, partyKeys, pieceAlign, pieceGap, pieceKeys, pieceThickness, removeBasement, setPieceAlign, removeTop, rotateRooms, setWallLength, splitStoreys, wallIndex, wallKeys, wallPieces } from '../engine/house-draw';
import { polyArea } from '../engine/geom';
import { Num, fmt, uid, NumInput } from './hform';
import { NO_SEL, plantOf, removePlant } from './DrawCanvas';
import { MAX_PA_M, MAX_V, PIPE_SIZES, maxFlow, resetRun, runLength, setBranchRiser, sizePipes, valveTail, viaOf, voidName } from '../engine/house-pipes';
import type { Lens, OpPick, Sel, Tool, WallRef } from './DrawCanvas';
import { href } from './route';
import { RoofSectionFields, newRoof } from './HouseRoof';

type ToolDef = [Tool, string, string];
/** The tool bar, in groups: a group of more than one tool opens to the right on hover. Windows and doors open a list of the project's types. */
const GROUPS: Array<{ id: string; label: string; tools: ToolDef[]; list?: 'glazing' | 'door' }> = [
  { id: 'select', label: 'Select', tools: [['select', 'Select', '↖']] },
  { id: 'room', label: 'Draw a room', tools: [['box', 'Box room', '▭'], ['room', 'Polygon room', '⬠']] },
  { id: 'cut', label: 'Cut', tools: [['split', 'Split room', '✂'], ['join', 'Delete wall section', '⌫']] },
  { id: 'stairs', label: 'Stairs', tools: [['stairs', 'Stairwell', '☰']] },
  { id: 'window', label: 'Window', tools: [['window', 'Window', '▬']], list: 'glazing' },
  { id: 'door', label: 'Door', tools: [['door', 'Door', '▯']], list: 'door' },
  { id: 'heat', label: 'Heating', tools: [['radiator', 'Radiator', '≣'], ['ufh', 'UFH zone', '▦']] },
  { id: 'source', label: 'Boiler / heat pump', tools: [['source', 'Boiler / heat pump', '♨']] },
  { id: 'cylinder', label: 'Hot water cylinder', tools: [['cylinder', 'Hot water cylinder', '◍']] },
  { id: 'riser', label: 'Pipe riser', tools: [['riser', 'Pipe riser', '↕']] },
  { id: 'pipe', label: 'Draw a pipe run', tools: [['pipe', 'Draw a pipe run', '⌐']] },
];
const HINT: Record<Tool, string> = {
  select: 'Drag a wall or a corner to reshape; drag a room to move it and it snaps flush to its neighbours. Shift-drag on empty canvas boxes several rooms; Shift-click a room adds it; Shift-click walls selects several. Arrow keys nudge. Double-click a wall to add a corner, a corner to remove it, a room to open it. Alt stops neighbours following; hold Shift while drawing for free (no snapping). Double-click a tool to keep it.',
  room: 'Click each corner; lines snap square and 45° and sit flush on other rooms (Shift: free). Type a length and press Enter to set the next wall exactly. Click the first corner, double-click or press Enter to finish; Backspace undoes, Esc cancels.',
  box: 'Drag out a rectangular room, or click one corner then the opposite corner.',
  split: 'Click two points to draw a line across a room; it is cut in two along the line, with its windows, walls and emitters shared out.',
  join: 'Click a wall between two rooms to take it out: they become one room, keeping the first room\'s name and settings. Doors between them go; windows, heaters and wall build-ups carry over.',
  corner: 'Click a wall to add a corner there, then drag it.',
  stairs: 'On the floor the stairs go up from, drag out the hole they rise through (or click its corners), inside the room below and the room above. The two rooms then share their air through it. Drag it by its tag; Delete removes it.',
  window: 'Click an outside wall to place a window, then drag it along the wall or to another wall.',
  door: 'Click an outside wall to place a door, or a wall between two rooms for an inside door; an open doorway goes between two rooms only. Pick the type from the list beside the button. Drag it along or to another wall.',
  radiator: 'Click inside a heated room. A radiator snaps to the nearest wall; drag it to move it.',
  source: 'Click where the boiler or heat pump goes (on this floor). There is one: clicking again moves it. Pipes are laid from here to every radiator, along the walls.',
  cylinder: 'Click where the hot water cylinder goes, if there is one. Clicking again moves it.',
  riser: 'Click where pipes pass up or down through the floors, such as a cupboard or boxing in a corner. Pipes to other floors go up whichever riser makes the runs shortest; with no riser they go straight up from the boiler.',
  pipe: 'Click a green ring (the boiler or heat pump, a riser, a radiator, a UFH manifold or the cylinder) or an existing run to start, click the corners, then click what it feeds to finish. Stretches run square to the grid or to a nearby wall, even one at an angle, and stop 10 cm short of a wall across their way, so the next one runs along it. Hold Shift (or turn snapping off) to draw at any angle. Enter leaves the end open, to tee off later; Backspace undoes a corner. A heater that already had a run gets the new one instead.',
  ufh: "Drag out a rectangle, or click corners for any shape, to draw an underfloor heating zone. Every heated room it covers gets UFH for its part of the zone; set each room's covering and pipe spacing under Emitters. Drag the zone by its tag.",
};

const HINT_BAND: Partial<Record<Tool, string>> = {
  select: 'Drag a zone, or its corners, to reshape it. Double-click a zone edge to add a corner, a corner to remove it; Delete removes the zone. Pick a build-up for it on the right.',
  room: 'Click the corners of a patch of this floor or ceiling that has its own build-up, such as an insulated strip. Click the first corner or press Enter to finish.',
  box: 'Drag out a rectangular zone, or click one corner then the opposite one.',
  ufh: 'Drag out a rectangle, or click corners for any shape, to draw an underfloor heating zone in this floor. Every heated room above it gets UFH for its part of the zone.',
};

/** What the current tool does, for the hint bubble. */
const HINT_ROOF: Partial<Record<Tool, string>> = {
  select: 'Click a roof to edit its form, pitch, edges and dormers on the right. Drag it, or its corners, to reshape it (a roof that follows the rooms gets an outline of its own). Double-click an edge to add a corner, a corner to remove it.',
  room: 'Click each corner of the roof at its eaves (outside the walls); click the first corner, double-click or press Enter to finish. It sits on the storey shown.',
  box: 'Drag out a rectangular roof at its eaves, or click one corner then the opposite one.',
};
export const drawHint = (band: boolean | 'roof', tool: Tool, lens: Lens = 'plan') => (lens === 'pipes' && tool === 'select' ? PIPE_SELECT_HINT : band === 'roof' ? HINT_ROOF[tool] ?? HINT[tool] : band ? HINT_BAND[tool] ?? HINT[tool] : HINT[tool]);
const PIPE_SELECT_HINT = 'Click an emitter, an underfloor zone tag or a pipe run to edit it; drag an emitter to move it. A pipe run shows what it serves and its size. Drag a stretch sideways to move it; double-click to add a bend; drop it on another run to share one pipe; right-click it for more. Teal dots are where each heater takes its pipes; a red dashed ring has no run yet, and a small square is the open end of a run. To add a run, or put back one you deleted, use Draw a pipe run (⌐), or Pipe the unpiped at the top. Drag the boiler, cylinder or a riser to move it. Delete removes whatever is selected.';

/** The drawing menu: a slim column of tool icons (names on hover) that floats over the canvas; groups open to the right. */
/** The heating and cooling lens's tools; the rest are the floor plan's. UFH zones are also drawn in a floor layer, which is plan only. */
const PIPE_TOOLS: Tool[] = ['select', 'radiator', 'ufh', 'source', 'cylinder', 'riser', 'pipe'];
export function DrawMenu({ house, band, tool, setTool, sticky, setSticky, snapOn, setSnapOn, lens = 'plan', opPick, setOpPick }: {
  house: House;
  /** On a floor or ceiling layer: only zones and (on floors) heated-floor loops can be drawn. */
  band: null | 'floor' | 'top' | 'roof'; lens?: Lens;
  tool: Tool; setTool: (t: Tool) => void; sticky: boolean; setSticky: (v: boolean) => void; snapOn: boolean; setSnapOn: (v: boolean) => void;
  /** The window and door types the tools place. */
  opPick: OpPick; setOpPick: (p: OpPick) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // The last tool used in each group is the one its button shows and picks.
  const [lastIn, setLastIn] = useState<Record<string, Tool>>({});
  const allowed = (id: Tool) => (lens === 'pipes' ? PIPE_TOOLS.includes(id) : !PIPE_TOOLS.includes(id) || id === 'select' || (id === 'ufh' && band === 'floor')) && (!band || id === 'select' || id === 'room' || id === 'box' || (id === 'ufh' && band === 'floor'));
  const named = (id: Tool, l: string) => (band ? ((band === 'roof' ? { room: 'Roof', box: 'Box roof' } : { room: 'Zone', box: 'Box zone' }) as Record<string, string>)[id] ?? l : l);
  const pick = (g: string, id: Tool, keep: boolean) => { setTool(id); setSticky(keep && id !== 'select'); setLastIn({ ...lastIn, [g]: id }); };
  const groups = GROUPS.map((g) => ({ ...g, tools: g.tools.filter(([id]) => allowed(id)) })).filter((g) => g.tools.length);
  return (
    <div className="draw-menu" role="toolbar" aria-label="Drawing tools">
      {groups.map((g) => {
        const shown = g.tools.find(([id]) => id === tool) ?? g.tools.find(([id]) => id === lastIn[g.id]) ?? g.tools[0];
        const [id, l, glyph] = shown, label = named(id, l), on = g.tools.some(([t]) => t === tool), more = g.tools.length > 1 || !!g.list;
        const types = g.list === 'glazing' ? ofKind(house, 'glazing') : g.list === 'door' ? ofKind(house, 'door').filter((b) => b.id !== OPEN_DOORWAY) : [];
        const chosen = g.list === 'glazing' ? opPick.glazing ?? types[0]?.id : opPick.door ?? types[0]?.id;
        return (
          <div key={g.id} className="tool-group" onMouseEnter={() => more && setOpen(g.id)} onMouseLeave={() => setOpen(null)}>
            <button type="button" className={on ? 'on' : ''} aria-pressed={on} aria-label={label} aria-haspopup={more || undefined} aria-expanded={more ? open === g.id : undefined}
              title={`${label}${more ? ' (more on hover)' : ''}. Double-click to keep this tool after each use`}
              onClick={() => { pick(g.id, id, false); if (more) setOpen(open === g.id ? null : g.id); }} onDoubleClick={() => pick(g.id, id, true)}>
              <span aria-hidden="true">{glyph}</span>{more && <i className="more" aria-hidden="true" />}{sticky && on && <i className="lock" aria-hidden="true" />}
            </button>
            {more && open === g.id && (g.list ? (
              <div className="flyout list" role="menu" aria-label={`${g.label} types`}>
                {types.map((b) => (
                  <button key={b.id} type="button" role="menuitemradio" aria-checked={on && chosen === b.id} className={on && chosen === b.id ? 'on' : ''}
                    onClick={() => { setOpPick(g.list === 'glazing' ? { ...opPick, glazing: b.id } : { ...opPick, door: b.id }); pick(g.id, id, false); setOpen(null); }}>
                    <b>{b.name}</b><span>{b.u != null ? `U ${fmt(b.u, 2)}` : ''}</span>
                  </button>
                ))}
                {g.list === 'door' && (
                  <button type="button" role="menuitemradio" aria-checked={on && chosen === OPEN_DOORWAY} className={on && chosen === OPEN_DOORWAY ? 'on' : ''}
                    onClick={() => { setOpPick({ ...opPick, door: OPEN_DOORWAY }); pick(g.id, id, false); setOpen(null); }}>
                    <b>Opening</b><span>between two rooms, no door</span>
                  </button>
                )}
                {!types.length && g.list === 'glazing' && <p className="small muted">No glazing build-ups yet: add one under Build-ups.</p>}
              </div>
            ) : (
              <div className="flyout" role="menu" aria-label={g.label}>
                {g.tools.map(([t, tl, tg]) => (
                  <button key={t} type="button" role="menuitemradio" aria-checked={tool === t} aria-label={named(t, tl)} title={`${named(t, tl)}. Double-click to keep this tool after each use`} className={tool === t ? 'on' : ''}
                    onClick={() => { pick(g.id, t, false); setOpen(null); }} onDoubleClick={() => pick(g.id, t, true)}>
                    <span aria-hidden="true">{tg}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        );
      })}
      <div className="draw-menu-end">
        <button type="button" className={snapOn ? 'on' : ''} aria-pressed={snapOn} aria-label="Snap to walls and angles" title="Snap to walls and angles" onClick={() => setSnapOn(!snapOn)}><span aria-hidden="true">⌖</span></button>
      </div>
    </div>
  );
}

/** The grid size, beside the zoom buttons. It stops the mouse-down so the zoom group keeping focus on the canvas does not stop it opening. */
export function GridSelect({ grid, setGrid }: { grid: number; setGrid: (v: number) => void }) {
  return (
    <select className="draw-grid-sel btn-secondary" value={grid} aria-label="Grid size" title="Grid size" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setGrid(Number(e.target.value))}>
      {[[0.01, '1 cm'], [0.05, '5 cm'], [0.1, '10 cm'], [0.25, '25 cm']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

const common = <T,>(xs: T[]): T | '' => (xs.length && xs.every((x) => x === xs[0]) ? xs[0] : '');

function BuildupSelect({ label, value, options, onPick }: { label: string; value: string; options: Buildup[]; onPick: (id: string) => void }) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => e.target.value && onPick(e.target.value)}>
      {value === '' && <option value="">Mixed: pick one for all</option>}
      {options.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}
const ofKind = (h: House, ...k: BuildupKind[]) => h.buildups.filter((b) => k.includes(listedAs(b)));

const ZONE_KINDS: BuildupKind[] = ['floor', 'roof'];

/**
 * The layers of the house as a stack, top to bottom: the roof or top ceiling, each storey, and the floor / ceiling band between
 * and under them. A storey is drawn with rooms and walls; a band is drawn with zones (patches with their own build-up) and
 * heated-floor loops. Click a layer to edit it; the open one lists its zones.
 */
// Short names for the tabs; the full name is in the tooltip.
const bandTab = (h: House, b: number) => (b > h.storeys.length - 1 ? (h.roofs?.length ? 'Top ceilings' : 'Flat roof') : b === 0 ? (h.storeys[0].below ? 'Basement floor' : 'Ground slab') : 'Floor');

/** The layers of the house as tabs along the bottom of the canvas, ground up from left to right: each storey, the floor between storeys, the roof. */
export function LayerTabs({ house, storey, band, roof, pickStorey, pickBand, pickRoof, upd, below, setBelow }: {
  house: House; storey: number; band: number | null; roof: boolean; pickStorey: (s: number) => void; pickBand: (b: number) => void; pickRoof: () => void;
  upd: (fn: (h: House) => void) => void; below: boolean; setBelow: (v: boolean) => void;
}) {
  const last = house.storeys.length - 1;
  const bandTabEl = (b: number) => {
    const zs = (house.zones ?? []).filter((z) => z.band === b).length;
    return <button key={`b${b}`} type="button" role="tab" className={`lt lt-band${band === b ? ' on' : ''}`} aria-selected={band === b} title={`${bandName(house, b)}${zs ? ` · ${zs} zone${zs === 1 ? '' : 's'}` : ''}`} onClick={() => pickBand(b)}>{bandTab(house, b)}</button>;
  };
  const tabs: JSX.Element[] = [];
  for (let s = 0; s <= last; s++) {
    const n = house.rooms.filter((r) => onStorey(r, s)).length, on = band == null && !roof && storey === s;
    tabs.push(bandTabEl(s));
    tabs.push(<button key={`s${s}`} type="button" role="tab" className={`lt${on ? ' on' : ''}`} aria-selected={on} onClick={() => pickStorey(s)}><b>{house.storeys[s].name}</b><span>{n} room{n === 1 ? '' : 's'}</span></button>);
  }
  tabs.push(bandTabEl(last + 1));
  tabs.push(<button key="roof" type="button" role="tab" className={`lt${roof ? ' on' : ''}`} aria-selected={roof} onClick={() => pickRoof()}><b>Roof</b><span>{house.roofs.length ? `${house.roofs.length} section${house.roofs.length === 1 ? '' : 's'}` : 'flat'}</span></button>);
  return (
    <div className="layer-tabs">
      <button type="button" className="lt-add" disabled={!canAddBasement(house)} title={canAddBasement(house) ? 'Add a basement below' : 'There is a basement already'} onClick={() => { upd(addBasement); pickStorey(0); }}>＋ Basement</button>
      <div className="lt-row" role="tablist" aria-label="Storeys and layers, ground up">{tabs}</div>
      <button type="button" className="lt-add" onClick={() => { upd(addStoreyAbove); pickStorey(house.storeys.length); }}>＋ Storey</button>
      <label className="lt-faint small" title="Show the storeys above and below faintly"><input type="checkbox" checked={below} onChange={(e) => setBelow(e.target.checked)} /> Faint above / below</label>
    </div>
  );
}

/** The lenses along the top of the canvas: what is being edited, each with its own tools and things to pick. `children` sit at the right of the bar. */
export function LensTabs({ house, lens, setLens, children }: { house: House; lens: Lens; setLens: (l: Lens) => void; children?: ReactNode }) {
  const runs = (house.heating.pipes ?? []).length, ems = house.heating.emitters.length;
  const src = house.heating.source ? (house.hp.source === 'ashp' || house.hp.source === 'gshp' ? 'heat pump placed' : 'boiler placed') : 'no heat source yet';
  const tab = (id: Lens, name: string, sub: string) => (
    <button key={id} type="button" role="tab" className={`lt${lens === id ? ' on' : ''}`} aria-selected={lens === id} onClick={() => setLens(id)}><b>{name}</b><span>{sub}</span></button>
  );
  return (
    <div className="lens-tabs">
      <div className="lt-row" role="tablist" aria-label="Lens: what to edit">
        {tab('plan', 'Floor plan', 'rooms, walls, windows and doors')}
        {tab('pipes', 'Heating and cooling', `${ems} emitter${ems === 1 ? '' : 's'} · ${runs} pipe run${runs === 1 ? '' : 's'} · ${src}`)}
      </div>
      {children && <div className="lens-stats">{children}</div>}
    </div>
  );
}

/** The settings of the layer open in the tabs: a storey's height, a floor's build-up and zones, the roof's sections. */
export function LayerSettings({ house, res, storey, band, roof, zone, pickZone, pickStorey, pickRoof, upd }: {
  house: House; res: HouseResult; storey: number; band: number | null; roof: boolean; zone?: string;
  pickZone: (id: string) => void; pickStorey: (s: number) => void; pickRoof: (id?: string) => void; upd: (fn: (h: House) => void) => void;
}) {
  const last = house.storeys.length - 1;
  const faces = (rooms: string[], pick: (key: string, kind: string) => boolean) => res.rooms.filter((r) => rooms.includes(r.room.id)).flatMap((r) => r.faces.filter((f) => pick(f.key, f.kind) && !f.key.includes('~')));
  if (roof) return (
    <div className="layer-body">
          {house.roofs.map((s) => (
            <div key={s.id} className={`zone-row${zone === s.id ? ' on' : ''}`}>
              <button type="button" className="btn-link" onClick={() => pickRoof(s.id)}>{s.name} · {s.form === 'custom' ? 'edge by edge' : s.form}{s.form === 'flat' ? '' : ` ${s.pitch}°`}</button>
              <button type="button" className="btn-link" aria-label={`Delete ${s.name}`} onClick={() => upd((h) => { h.roofs = h.roofs.filter((q) => q.id !== s.id); })}>Delete</button>
            </div>
          ))}
          {!house.roofs.some((s) => !s.poly) && <button type="button" className="btn-secondary" onClick={() => { const r = newRoof(house); r.form = 'gable'; upd((h) => { h.roofs.push(r); }); pickRoof(r.id); }}>＋ Roof over the top storey</button>}
          <span className="small muted">Or draw one with Roof or Box roof: a lean-to, a wing, a porch.</span>
          <span className="eyebrow">Loft roof build-up</span>
          <BuildupSelect label="Loft roof" value={house.defaults.loftRoof} options={ofKind(house, 'roof')} onPick={(id) => upd((h) => { h.defaults.loftRoof = id; })} />
    </div>
  );
  if (band != null) {
    const b = band, fs = b > last
      ? faces(house.rooms.filter((r) => r.storey + r.span - 1 === last).map((r) => r.id), (k) => k.startsWith('lc:') || k.startsWith('fr:'))
      : faces(house.rooms.filter((r) => r.storey === b).map((r) => r.id), (_k, kind) => kind === 'floor');
    const zs = (house.zones ?? []).filter((z) => z.band === b), kinds: BuildupKind[] = b > last ? ['roof', 'floor'] : ['floor'];
    return (
      <div className="layer-body">
            <span className="eyebrow">Whole layer</span>
            {fs.length
              ? <BuildupSelect label={`${bandName(house, b)} build-up`} value={common(fs.map((f) => f.buildup.id))} options={ofKind(house, ...kinds)} onPick={(id) => upd((h) => { fs.forEach((f) => { h.faceBuildup[f.key] = id; }); })} />
              : <span className="small muted">Nothing drawn here yet.</span>}
            {b > 0 && b <= last && <label className="small muted">Thickness <NumInput className="thk-input" step={0.05} min={0} value={house.storeys[b - 1].zone} aria-label="Floor zone thickness" onChange={(e) => upd((h) => { h.storeys[b - 1].zone = Math.max(0, Number(e.target.value) || 0); })} /> m</label>}
            <span className="eyebrow">Zones</span>
            {zs.length === 0 && <span className="small muted">Draw one with Zone or Box zone.</span>}
            {zs.map((z) => (
              <div key={z.id} className={`zone-row${zone === z.id ? ' on' : ''}`}>
                <button type="button" className="btn-link" onClick={() => pickZone(z.id)}>{z.name} · {fmt(polyArea(z.poly), 1)} m²</button>
                <BuildupSelect label={`${z.name} build-up`} value={z.buildup} options={ofKind(house, ...ZONE_KINDS)} onPick={(id) => upd((h) => { const x = h.zones?.find((q) => q.id === z.id); if (x) x.buildup = id; })} />
                <button type="button" className="btn-link" aria-label={`Delete ${z.name}`} onClick={() => upd((h) => { h.zones = h.zones?.filter((q) => q.id !== z.id); })}>Delete</button>
              </div>
            ))}
      </div>
    );
  }
  const s = storey, st = house.storeys[s], n = house.rooms.filter((r) => onStorey(r, s)).length;
  if (!st) return null;
  return (
    <div className="layer-body">
          <label className="small muted">Height <NumInput className="thk-input" step={0.05} min={1} value={st.h} aria-label={`${st.name} height`} onChange={(e) => upd((h) => { h.storeys[s].h = Math.max(1, Number(e.target.value) || 1); })} /> m</label>
          {n > 0 && <button type="button" className="btn-link" title="Copy this storey's rooms, windows and doors onto the storey above (a new one if this is the top)"
            onClick={() => {
              const above = s < last ? house.rooms.filter((r) => onStorey(r, s + 1)).length : 0;
              if (above && !confirm(`${house.storeys[s + 1].name} already has ${above} room${above === 1 ? '' : 's'}. Copy ${st.name}'s rooms on top of them?`)) return;
              const sfx = uid(''); upd((h) => { if (s === h.storeys.length - 1) addStoreyAbove(h); let k = 0; copyRooms(h, h.rooms.filter((r) => r.storey === s).map((r) => r.id), [0, 0], s + 1, false, (p) => `${p}${sfx}${k++}`); }); pickStorey(s + 1); }}>Copy rooms up ›</button>}
      {s === last && canRemoveTop(house) && <button type="button" className="btn-link" onClick={() => { upd(removeTop); pickStorey(Math.min(storey, last - 1)); }}>Remove this empty top storey</button>}
      {s === 0 && canRemoveBasement(house) && <button type="button" className="btn-link" onClick={() => { upd(removeBasement); pickStorey(0); }}>Remove this empty basement</button>}
    </div>
  );
}

/** One limit as a bar: green well inside it, amber within 20% of it, red over it. */
function Gauge({ label, val, max, unit, dp }: { label: string; val: number; max: number; unit: string; dp: number }) {
  const f = max > 0 ? val / max : 0;
  return (
    <div className={`gauge ${f > 1 ? 'over' : f > 0.8 ? 'near' : 'ok'}`}>
      <div className="gauge-head"><span>{label}</span><span className="mono">{fmt(val, dp)} / {fmt(max, dp)} {unit}</span></div>
      <div className="gauge-track" role="meter" aria-label={label} aria-valuenow={val} aria-valuemin={0} aria-valuemax={max}><div className="gauge-fill" style={{ width: `${Math.min(100, f * 100)}%` }} /></div>
    </div>
  );
}

export function Inspector({ house, res, storey, sel, setSel, upd }: {
  house: House; res: HouseResult; storey: number; sel: Sel; setSel: (s: Sel) => void; upd: (fn: (h: House) => void) => void;
}) {
  const walls = sel.walls;
  const info = useMemo(() => walls.map((w) => {
    const r = house.rooms.find((x) => x.id === w.room), e = r && roomEdges(r)[w.edge], keys = w.span ? pieceKeys(house, w.room, w.edge, storey, w) : wallKeys(house, w.room, w.edge, storey);
    const face = res.rooms.find((x) => x.room.id === w.room)?.faces.find((f) => f.key === keys[0]) ?? res.rooms.find((x) => x.room.id === w.room)?.faces.find((f) => keys.includes(f.key));
    return { w, r, keys, len: w.span ? w.span[1] - w.span[0] : e?.len ?? 0, thick: w.span ? pieceThickness(house, w.room, w.edge, storey, w) : 0, align: w.span ? pieceAlign(house, w.room, w.edge, storey, w) : null, whole: e?.len ?? 0, gap: w.span && w.other ? pieceGap(house, w.room, w.edge, storey, w) : 0, id: face?.buildup.id ?? house.defaults[keys[0]?.startsWith('w:') ? 'extWall' : 'intWall'], U: face?.U, party: house.faceBoundary[keys[0]] === 'party', outside: w.span ? !w.other : !!r && isOutside(house, r, w.edge, storey) };
  }), [walls, house, res, storey]);

  const pick = (list: WallRef[]) => setSel({ ...NO_SEL, room: sel.room, walls: list });
  const here = house.rooms.filter((r) => onStorey(r, storey));
  // Walls a piece at a time, so "outside walls" takes only the outside stretches; an inside wall is listed once, from the first room of its pair.
  const every = (outsideOnly: boolean, only?: string): WallRef[] => here.filter((r) => !only || r.id === only).flatMap((r) => roomEdges(r).flatMap((e) =>
    wallPieces(house, r.id, e.idx, storey).filter((p) => (outsideOnly ? !p.other : !p.other || !!only || r.id < p.other!))
      .map((p): WallRef => ({ room: r.id, edge: e.idx, span: p.span, ...(p.other ? { other: p.other, gap: p.gap } : {}) }))));

  if (sel.zone && house.roofs.some((x) => x.id === sel.zone)) return <RoofSectionFields house={house} id={sel.zone} upd={upd} onDeleted={() => setSel(NO_SEL)} />;
  if (sel.zone) {
    const z = house.zones?.find((x) => x.id === sel.zone);
    if (!z) return null;
    const set = (patch: Partial<typeof z>) => upd((h) => { const x = h.zones?.find((q) => q.id === z.id); if (x) Object.assign(x, patch); });
    return (
      <>
        <div className="eyebrow">{bandName(house, z.band)} · {fmt(polyArea(z.poly), 1)} m²</div>
        <input className="h-text" value={z.name} aria-label="Zone name" onChange={(e) => set({ name: e.target.value })} />
        <label className="hf"><span className="eyebrow">Build-up</span>
          <select className="select" value={z.buildup} onChange={(e) => set({ buildup: e.target.value })}>{ofKind(house, ...ZONE_KINDS).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <p className="small muted">The part of each room's floor or ceiling under this zone uses this build-up instead of the layer's.</p>
        {z.band < house.storeys.length && <label className="small"><input type="checkbox" checked={!!z.ufh} onChange={(e) => set({ ufh: e.target.checked || undefined })} /> Underfloor heating</label>}
        {z.ufh && (() => {
          const loops = house.heating.emitters.filter((e) => e.fromZone === z.id);
          return <>
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Pipe spacing</span>
                <select className="select" value={z.spacing ?? 150} onChange={(e) => set({ spacing: Number(e.target.value) })}>{UFH_SPACINGS.map((v) => <option key={v} value={v}>{v} mm</option>)}</select>
              </label>
              <label className="hf"><span className="eyebrow">Pipe diameter</span>
                <select className="select" value={z.pipe ?? 16} onChange={(e) => set({ pipe: Number(e.target.value) })}>{Object.keys(UFH_PIPES).map((v) => <option key={v} value={v}>{v} mm</option>)}</select>
              </label>
            </div>
            <span className="eyebrow">Heats</span>
            {loops.length ? loops.map((e) => {
              const len = loopLength(e, house), over = len > loopMax(e);
              return <p key={e.id} className={`small${over ? ' warn' : ''}`}><b>{house.rooms.find((r) => r.id === e.room)?.name ?? '?'}</b> · {fmt(e.area, 1)} m² · loop {fmt(len)} m{over ? ` (over ${loopMax(e)} m: split it, or use wider pipe or spacing)` : ''}</p>;
            }) : <p className="small muted">No heated room yet.</p>}
            <p className="small muted">Each room's floor covering is set under <a href={href('emitters')}>Emitters</a>.</p>
          </>;
        })()}
        <a className="btn-link" href={href('buildups')}>Edit build-up layers ›</a>
        <button type="button" className="btn-danger" onClick={() => { upd((h) => { h.zones = h.zones?.filter((q) => q.id !== z.id); }); setSel(NO_SEL); }}>Delete zone</button>
      </>
    );
  }
  const group = sel.group ?? [];
  if (group.length > 1) {
    const regroup = (ids: string[]) => setSel({ ...NO_SEL, room: ids[0], group: ids });
    return (
      <>
        <div className="eyebrow">{group.length} rooms selected</div>
        <p className="small muted">Drag any of them to move the lot; arrow keys nudge.</p>
        <div className="chips">
          <button type="button" className="btn-secondary" onClick={() => {
            const sfx = uid('');
            upd((h) => { let k = 0; copyRooms(h, group, [1, 1], undefined, true, (p) => `${p}${sfx}${k++}`); });
            regroup(group.map((_, i) => `r${sfx}${i}`));
          }}>Copy</button>
          <button type="button" className="btn-secondary" onClick={() => upd((h) => flipRooms(h, group, 'x'))}>Mirror ↔</button>
          <button type="button" className="btn-secondary" onClick={() => upd((h) => flipRooms(h, group, 'y'))}>Mirror ↕</button>
          <button type="button" className="btn-secondary" onClick={() => upd((h) => rotateRooms(h, group))}>Rotate 90°</button>
          <button type="button" className="btn-danger" onClick={() => { upd((h) => group.forEach((id) => deleteRoom(h, id))); setSel(NO_SEL); }}>Delete</button>
        </div>
        <button type="button" className="btn-link" onClick={() => setSel({ ...NO_SEL, room: sel.room })}>Clear selection</button>
      </>
    );
  }
  if (walls.length) {
    const ids = info.map((i) => i.id), Us = info.map((i) => i.U).filter((u): u is number => u != null);
    return (
      <>
        <div className="eyebrow">{walls.length} wall{walls.length === 1 ? '' : 's'} selected · {fmt(info.reduce((t, i) => t + i.len, 0), 1)} m</div>
        {walls.length === 1 && walls[0].span && <p className="small muted">{walls[0].other ? `Inside wall shared with ${house.rooms.find((x) => x.id === walls[0].other)?.name ?? 'another room'}` : 'Outside wall'} · part of {house.rooms.find((x) => x.id === walls[0].room)?.name}'s wall</p>}
        {walls.length === 1 && <Num label={info[0].whole - info[0].len > 0.01 ? 'Whole wall length' : 'Length'} unit="m" step={0.05} min={0.1} value={info[0].whole} onChange={(v) => upd((h) => setWallLength(h, walls[0].room, walls[0].edge, v))} />}
        <div className="chips">
          <button type="button" className="btn-secondary" onClick={() => pick(every(true))}>All outside walls</button>
          <button type="button" className="btn-secondary" onClick={() => pick(every(false))}>All walls</button>
          {sel.room && <button type="button" className="btn-secondary" onClick={() => pick(every(false, sel.room))}>This room's walls</button>}
        </div>
        <label className="hf"><span className="eyebrow">Wall build-up</span>
          {/* Only the selected walls: the house's default wall (which every wall without its own pick follows) is set under Build-ups. */}
          <BuildupSelect label="Wall build-up" value={common(ids)} options={ofKind(house, 'wall')} onPick={(id) => upd((h) => {
            info.forEach((i) => i.keys.forEach((k) => { h.faceBuildup[k] = id; }));
          })} />
        </label>
        {Us.length > 0 && <p className="small">U-value {Us.length && Math.min(...Us) === Math.max(...Us) ? fmt(Us[0], 2) : `${fmt(Math.min(...Us), 2)}–${fmt(Math.max(...Us), 2)}`} W/m²K</p>}
        {info.length === 1 && info[0].gap > 0.01 && (() => {
          const w = info[0].w, gap = info[0].gap, by = info[0].thick - gap, wider = by > 0, off = info[0].thick > 0 && Math.abs(by) > 0.005;
          return <>
            <p className="small">Drawn <b>{Math.round(gap * 1000)} mm</b> thick: the space between the two rooms. {off ? `Its build-up is ${Math.round(info[0].thick * 1000)} mm, so the rooms are ${Math.round(Math.abs(by) * 1000)} mm ${wider ? 'too close' : 'too far apart'} to match it.` : 'That matches its build-up.'}</p>
            {off && (sel.stretch ? <>
              <p className="small"><b>Pick an arrow on the plan</b> for the side that moves {Math.round(Math.abs(by) * 1000)} mm {wider ? 'out' : 'in'}.</p>
              <button type="button" className="btn-link" onClick={() => setSel({ ...sel, stretch: undefined })}>Cancel</button>
            </> : (
              <div className="chips">
                <button type="button" className="btn-secondary" title={wider ? 'Move one side of the plan out: the house gets bigger, the rooms stay the same' : 'Move one side of the plan in: the house gets smaller, the rooms stay the same'}
                  onClick={() => setSel({ ...sel, stretch: true })}>{wider ? 'Stretch the plan' : 'Close up the plan'}</button>
                <button type="button" className="btn-secondary" title={wider ? 'Each room gives up half: the house stays the same size' : 'Each room gains half: the house stays the same size'}
                  onClick={() => upd((h) => narrowAtWall(h, w.room, w.edge, w.other!, gap, by))}>{wider ? 'Narrow the rooms' : 'Widen the rooms'}</button>
              </div>
            ))}
          </>;
        })()}
        {info.every((i) => i.w.span && !(i.gap > 0.01)) && (
          <div className="stack-6" role="group" aria-label="Where the wall sits on the line">
            <div className="eyebrow">Wall sits on the drawn line{info.length === 1 && info[0].thick > 0 ? ` · ${Math.round(info[0].thick * 1000)} mm thick` : ''}</div>
            <div className="chips">
              {([['in', 'Inside'], ['ctr', 'Centred'], ['out', 'Outside']] as const).map(([a, l]) => (
                <button key={a} type="button" className={`chip${info.every((i) => i.align === a) ? ' on' : ''}`}
                  title={a === 'in' ? 'The wall fills the room side of the line' : a === 'out' ? 'The wall sits on the far side of the line: the line is the inside face' : 'Half the wall each side of the line'}
                  onClick={() => upd((h) => info.forEach((i) => setPieceAlign(h, i.w.room, i.w.edge, storey, i.w, a)))}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <div className="eyebrow">What's on the other side of this wall</div>
        {info.filter((i) => i.w.other).map((i) => {
          const o = house.rooms.find((x) => x.id === i.w.other);
          return <p key={`${i.w.room}-${i.w.edge}-${i.w.other}`} className="small"><b>{o?.name ?? 'Another room'}</b> · {o ? (o.heated ? `heated to ${o.setpoint} °C` : 'unheated') : ''}. An inside wall: heat only moves through it when the two rooms differ in temperature.</p>;
        })}
        {info.some((i) => !i.w.other) && (
          <div className="chips" role="group" aria-label="Other side of the wall">
            <button type="button" className={`chip${info.filter((i) => !i.w.other).every((i) => !i.party) ? ' on' : ''}`} onClick={() => upd((h) => info.filter((i) => !i.w.other).forEach((i) => { for (const k of [i.keys[0], ...partyKeys(h, i.w.room, i.w.edge)]) delete h.faceBoundary[k]; }))}>Outside</button>
            <button type="button" className={`chip${info.filter((i) => !i.w.other).every((i) => i.party) ? ' on' : ''}`} disabled={info.some((i) => !i.w.other && !i.outside)} title="Neighbour's side, at the neighbour temperature. Sets this wall line on every storey."
              onClick={() => upd((h) => info.filter((i) => !i.w.other).forEach((i) => { for (const k of [i.keys[0], ...partyKeys(h, i.w.room, i.w.edge)]) h.faceBoundary[k] = 'party'; }))}>Party wall</button>
          </div>
        )}
        <button type="button" className="btn-link" onClick={() => upd((h) => info.forEach((i) => h.openings.forEach((o) => { if (o.room === i.w.room && wallIndex(h, o) === i.w.edge) delete o.t; })))}>Spread windows and doors evenly</button>
        <a className="btn-link" href={href('buildups')}>Edit build-up layers ›</a>
        <button type="button" className="btn-link" onClick={() => setSel({ ...sel, walls: [] })}>Clear selection</button>
      </>
    );
  }

  if (sel.item?.k === 'op') {
    const o = house.openings.find((x) => x.id === sel.item!.id);
    if (!o) return null;
    const set = (patch: Partial<typeof o>) => upd((h) => { const x = h.openings.find((q) => q.id === o.id); if (x) Object.assign(x, patch); });
    const ob = house.buildups.find((b) => b.id === o.buildup), kind = ob ? listedAs(ob) : 'glazing';
    // No bigger than the wall it is in.
    const oRoom = house.rooms.find((x) => x.id === o.room), maxW = oRoom ? roomEdges(oRoom)[wallIndex(house, o)]?.len ?? 20 : 20, maxH = oRoom ? roomHeight(house, oRoom) : 3;
    return (
      <>
        <div className="eyebrow">{kind === 'door' ? 'Door' : 'Window'} · {house.rooms.find((r) => r.id === o.room)?.name}{o.to ? ` to ${house.rooms.find((r) => r.id === o.to)?.name ?? '?'}` : ''}</div>
        <input className="h-text" value={o.name} aria-label="Name" onChange={(e) => set({ name: e.target.value })} />
        <div className="hf-row">
          <Num label="Width" unit="m" step={0.05} min={0.3} max={maxW} value={o.w} onChange={(v) => set({ w: Math.min(maxW, Math.max(0.3, v)) })} />
          <Num label="Height" unit="m" step={0.05} min={0.3} max={maxH} value={o.h} onChange={(v) => set({ h: Math.min(maxH, Math.max(0.3, v)) })} />
        </div>
        <label className="hf"><span className="eyebrow">{kind === 'door' ? 'Door type' : 'Glazing'}</span>
          <select className="select" value={o.buildup} onChange={(e) => set({ buildup: e.target.value })}>{ofKind(house, kind === 'door' ? 'door' : 'glazing').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        {ob?.kind !== 'door' && <label className="hf"><span className="eyebrow">Shading</span>
          <select className="select" value={o.shade ?? 'none'} onChange={(e) => set({ shade: e.target.value as keyof typeof SHADING })}>{Object.entries(SHADING).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>}
        <button type="button" className="btn-secondary" onClick={() => upd((h) => {
          const x = h.openings.find((q) => q.id === o.id), r = x && h.rooms.find((q) => q.id === x.room);
          if (!x || !r) return;
          const idx = wallIndex(h, x), len = roomEdges(r)[idx]?.len ?? 0, c = x.to ? innerDoorAt(h, r, idx, r.storey, len / 2, x.w)?.t : openingCentre(h, r, idx, r.storey, len / 2, x.w);
          if (c != null) x.t = c;
        })}>Centre on wall</button>
        <button type="button" className="btn-danger" onClick={() => { upd((h) => { h.openings = h.openings.filter((x) => x.id !== o.id); }); setSel({ ...sel, item: null }); }}>Delete</button>
      </>
    );
  }

  if (sel.item?.k === 'pipe') {
    const p = house.heating.pipes?.find((x) => x.id === sel.item!.id);
    if (!p) return null;
    // The floor's branch: this run itself if it climbs, else the first run upstream that does.
    let br: typeof p | undefined = p;
    while (br && br.rise == null) { const up: string | null = br.parent; br = house.heating.pipes?.find((x) => x.id === up); }
    // What it carries: every heater beyond it, the flow for that, and what its size can take.
    const pr = sizePipes(house, res), row = pr.rows.find((r) => r.pipe.id === p.id);
    const served: string[] = [];
    const walk = (x: typeof p) => { if (x.emitter) served.push(x.emitter); house.heating.pipes!.filter((c) => c.parent === x.id).forEach(walk); };
    walk(p);
    const idMM = PIPE_SIZES[p.size] ?? 13.6, cap = maxFlow(idMM, pr.paMax), flowL = row?.flowLpm ?? 0;
    const family = Object.keys(PIPE_SIZES).filter((k) => k.startsWith(p.size.startsWith('PEX') ? 'PEX' : 'Cu')).sort((a, b) => PIPE_SIZES[a] - PIPE_SIZES[b]);
    const fits = family.find((k) => maxFlow(PIPE_SIZES[k], pr.paMax) >= flowL);
    const st = p.leg ? house.storeys[p.leg.storey]?.name.toLowerCase() : '';
    // The run it comes off, when that is on the same floor: it can follow its floor or ceiling.
    const upSame = house.heating.pipes?.find((x) => x.id === p.parent && x.leg && x.leg.storey === p.leg?.storey);
    const em = p.emitter ? house.heating.emitters.find((x) => x.id === p.emitter) : undefined, tail = em && p.leg ? valveTail(house, p.leg.storey, viaOf(house, p), em.kind) : 0;
    const emName = (id: string) => { const e = house.heating.emitters.find((x) => x.id === id); return e ? `${house.rooms.find((r) => r.id === e.room)?.name ?? e.room} ${e.kind === 'ufh' ? 'UFH' : e.kind === 'towel' ? 'towel rail' : e.kind === 'fancoil' ? 'fan coil' : 'radiator'}` : id; };
    const setRun = (patch: Partial<typeof p>) => upd((h) => { const x = h.heating.pipes?.find((q) => q.id === p.id); if (x) Object.assign(x, patch); });
    return (
      <>
        <p className="small"><b>{p.name}</b> · {runLength(house, p)} m{p.typed ? ' (typed in)' : ''}{p.rise ? `, ${p.rise.toFixed(1)} m of it between floors` : ''}{tail && !p.typed ? `, ${tail.toFixed(2)} m of it ${viaOf(house, p) === 'ceiling' ? 'down the wall to' : 'up to'} the valves` : ''}.</p>
        <div className="hf-row">
          <label className="hf"><span className="eyebrow">Pipe size</span>
            <select className="select" value={p.size} onChange={(e) => setRun({ size: e.target.value })}>{Object.keys(PIPE_SIZES).map((k) => <option key={k}>{k}</option>)}</select>
          </label>
          {p.leg && <label className="hf"><span className="eyebrow">Runs in the</span>
            <select className="select" name="via" value={p.via ?? (upSame ? 'same' : 'floor')} onChange={(e) => setRun({ via: e.target.value === 'same' ? undefined : (e.target.value as 'floor' | 'ceiling') })}>
              {upSame && <option value="same">{viaOf(house, upSame)}, as the run it comes off</option>}
              <option value="floor">floor: void {voidName(house, p.leg.storey)}</option><option value="ceiling">ceiling: void {voidName(house, p.leg.storey + 1)}</option>
            </select>
          </label>}
        </div>
        {served.length > 0 && (
          <table className="h-table">
            <thead><tr><th>Serves</th><th className="n">kW</th></tr></thead>
            <tbody>
              {served.map((id) => <tr key={id}><td>{emName(id)}</td><td className="n mono">{fmt((pr.emitterW.get(id) ?? 0) / 1000, 2)}</td></tr>)}
              <tr><td><b>Carries</b></td><td className="n mono"><b>{fmt((row?.loadW ?? 0) / 1000, 2)}</b></td></tr>
            </tbody>
          </table>
        )}
        <div className="gauges" aria-label={`${p.size} against its limits`}>
          <Gauge label={`Flow (${house.heating.dT} K)`} val={flowL} max={cap} unit="l/min" dp={1} />
          <Gauge label="Velocity" val={row?.v ?? 0} max={MAX_V(idMM)} unit="m/s" dp={2} />
          <Gauge label="Pressure drop" val={row?.paM ?? 0} max={pr.paMax} unit="Pa/m" dp={0} />
        </div>
        <p className="small muted">
          {pr.longest > 0 && <>Pump budget: {fmt(pr.head / 1000)} kPa of head, less 5 kPa for the heater and valves, over the {fmt(pr.longest, 1)} m longest circuit, flow and return, plus 30% for fittings: {fmt(pr.paPump)} Pa/m. </>}
          {pr.paMax < pr.paPump ? `Capped at ${fmt(pr.paCap)} Pa/m.` : 'Under the cap, so the pump sets the limit.'}
        </p>
        <div className="hf-row">
          <Num label="Flow − return (whole system)" unit="K" step={1} value={house.heating.dT} onChange={(v) => upd((h) => { h.heating.dT = Math.max(1, v); })} />
          <Num label="Pump head" unit="kPa" step={1} value={house.heating.pumpHead ?? 40} onChange={(v) => upd((h) => { h.heating.pumpHead = Math.max(0, v); })} />
          <Num label="Pa/m cap" unit="Pa/m" step={10} value={house.heating.paCap ?? MAX_PA_M} onChange={(v) => upd((h) => { h.heating.paCap = Math.max(10, v); })} />
        </div>
        {flowL > cap ? <p className="small warn">Too small for this flow{fits ? <>: <button type="button" className="btn-link" onClick={() => setRun({ size: fits })}>use {fits}</button></> : '.'}</p>
          : fits && fits !== p.size && PIPE_SIZES[fits] < idMM ? <p className="small muted">{fits} would also do.</p> : null}
        <p className="small muted">Drag a stretch of the pipe sideways to move it; its ends stay on what they connect to. Double-click a stretch to add a bend there. Drag a run onto another and they join into one shared pipe, sized for both, that tees off to each.</p>
        {br && (house.heating.risers?.length ?? 0) > 0 && (
          <label className="hf"><span className="eyebrow">{br.name.replace(/ \(.*\)$/, '')} comes up</span>
            <select className="select" value={br.ends?.[1] ?? 'source'} onChange={(e) => upd((h) => setBranchRiser(h, br.id, e.target.value))}>
              <option value="source">Straight up from the {house.hp.source === 'ashp' || house.hp.source === 'gshp' ? 'heat pump' : 'boiler'}</option>
              {house.heating.risers!.map((r, i) => <option key={r.id} value={r.id}>Riser {i + 1} ({r.at[0].toFixed(1)}, {r.at[1].toFixed(1)} m)</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn-link" onClick={() => upd((h) => resetRun(h, p.id))}>Straighten this run</button>
        <a className="btn-link" href={href('pipes')}>Pipework: sizes and flows ›</a>
      </>
    );
  }

  if (sel.item?.k === 'plant') {
    const id = sel.item.id, at = plantOf(house, id);
    if (!at) return null;
    const what = id === 'cylinder' ? 'Hot water cylinder' : id === 'source' ? (house.hp.source === 'ashp' || house.hp.source === 'gshp' ? 'Heat pump' : 'Boiler') : 'Pipe riser';
    return (
      <>
        <p className="small"><b>{what}</b> at {at.at[0].toFixed(2)}, {at.at[1].toFixed(2)} m. Drag it to move it.
          {id === 'source' ? ' Pipes run from here to every heater.' : id === 'cylinder' ? ' Its coil is fed from the heat source.' : ' Pipes to other floors can pass through the floors here.'}</p>
        <a className="btn-link" href={href('pipes')}>Pipework: lay out pipes from the plan ›</a>
        <button type="button" className="btn-link" onClick={() => { upd((h) => removePlant(h, id)); setSel(NO_SEL); }}>Delete</button>
      </>
    );
  }

  if (sel.item?.k === 'em') {
    const e = house.heating.emitters.find((x) => x.id === sel.item!.id);
    if (!e) return null;
    const set = (patch: Partial<typeof e>) => upd((h) => { const x = h.heating.emitters.find((q) => q.id === e.id); if (x) Object.assign(x, patch); });
    return (
      <>
        <div className="eyebrow">{EMITTER_NAME[e.kind]} · {house.rooms.find((r) => r.id === e.room)?.name}</div>
        {e.kind !== 'ufh' && <label className="hf"><span className="eyebrow">Kind</span>
          <select className="select" value={e.kind} onChange={(ev) => { const k = ev.target.value as typeof e.kind; set(k === 'fancoil' && e.kind !== 'fancoil' ? { kind: k, rated: 2000 } : { kind: k }); }}>
            {(['radiator', 'towel', 'fancoil'] as const).map((k) => <option key={k} value={k}>{EMITTER_NAME[k]}</option>)}
          </select>
        </label>}
        {(e.kind === 'towel' || e.kind === 'fancoil') && <Num label="Rated output at ΔT50" unit="W" step={50} min={0} value={e.rated} onChange={(v) => set({ rated: Math.max(0, v) })} />}
        {e.kind === 'radiator' && <>
          <label className="hf"><span className="eyebrow">Type</span>
            <select className="select" value={e.type} onChange={(ev) => set({ type: ev.target.value as RadType })}>{(Object.keys(RAD_LABEL) as RadType[]).map((t) => <option key={t} value={t}>{RAD_LABEL[t]}</option>)}</select>
          </label>
          <div className="hf-row">
            <Num label="Length" unit="mm" step={100} min={300} value={e.len} onChange={(v) => set({ len: Math.max(300, v) })} />
            <Num label="Height" unit="mm" step={50} min={300} value={e.height} onChange={(v) => set({ height: Math.max(300, v) })} />
          </div>
        </>}
        {e.kind === 'ufh' && e.rect && <div className="hf-row">
          <Num label="Width" unit="m" step={0.05} min={0.3} value={e.rect.w} onChange={(v) => set({ rect: { ...e.rect!, w: Math.max(0.3, v) }, area: +(Math.max(0.3, v) * e.rect!.h).toFixed(2) })} />
          <Num label="Length" unit="m" step={0.05} min={0.3} value={e.rect.h} onChange={(v) => set({ rect: { ...e.rect!, h: Math.max(0.3, v) }, area: +(e.rect!.w * Math.max(0.3, v)).toFixed(2) })} />
        </div>}
        {e.kind === 'ufh' && !e.rect && (e.fromZone
          ? <p className="small">Heated floor area <b>{fmt(e.area, 1)} m²</b>: this room's part of {house.zones?.find((x) => x.id === e.fromZone)?.name ?? 'its UFH zone'}.</p>
          : <Num label="Heated floor area" unit="m²" step={0.5} min={1} value={e.area} onChange={(v) => set({ area: Math.max(1, v) })} />)}
        <a className="btn-link" href={href('emitters')}>All emitters and zones ›</a>
        <button type="button" className="btn-danger" onClick={() => { upd((h) => { h.heating.emitters = h.heating.emitters.filter((x) => x.id !== e.id); }); setSel({ ...sel, item: null }); }}>Delete</button>
      </>
    );
  }
  return null;
}

/** Turns a room through several storeys into a room on each, joined by a stairwell zone in the floor between. */
export function SplitStoreys({ roomId, upd }: { roomId: string; upd: (fn: (h: House) => void) => void }) {
  return (
    <div className="row-between">
      <span className="small muted">Different shape upstairs? Make it a room on each floor, joined by an open stairwell.</span>
      <button type="button" className="btn-secondary" onClick={() => upd((h) => { splitStoreys(h, roomId, uid('r')); })}>Split across floors</button>
    </div>
  );
}

/** Name, use and heating of the selected room, with delete. */
export function RoomFields({ house, roomId, upd, onDeleted }: { house: House; roomId: string; upd: (fn: (h: House) => void) => void; onDeleted: () => void }) {
  const r = house.rooms.find((x) => x.id === roomId);
  if (!r) return null;
  const set = (fn: (x: Room, h: House) => void) => upd((h) => { const x = h.rooms.find((q) => q.id === roomId); if (x) fn(x, h); });
  return (
    <>
      <input className="h-text" value={r.name} aria-label="Room name" onChange={(e) => set((x) => { x.name = e.target.value; })} />
      <div className="hf-row">
        <label className="hf"><span className="eyebrow">Use</span>
          <select className="select" value={r.type} onChange={(e) => set((x, h) => {
            const was = defaultTemp(h, x.type) === x.setpoint, old = x.type;
            x.type = e.target.value as RoomType;
            if (was) x.setpoint = defaultTemp(h, x.type);
            // A room still carrying a default name takes its use as its name: "Kitchen", "Bedroom 2".
            if (/^Room \d+( 2| copy)?$/.test(x.name) || x.name.toLowerCase().replace(/ \d+$/, '') === old) {
              const base = x.type === 'wc' ? 'WC' : x.type.charAt(0).toUpperCase() + x.type.slice(1), n = h.rooms.filter((q) => q.id !== x.id && q.name.replace(/ \d+$/, '') === base).length;
              x.name = n ? `${base} ${n + 1}` : base;
            }
          })}>
            {(Object.keys(CIBSE_ACH) as RoomType[]).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <Num label="Setpoint" unit="°C" step={0.5} value={r.setpoint} onChange={(v) => set((x) => { x.setpoint = v; })} />
      </div>
      <div className="row-between">
        <label className="small"><input type="checkbox" checked={r.heated} onChange={(e) => set((x) => { x.heated = e.target.checked; })} /> Heated</label>
        <button type="button" className="btn-link" onClick={() => { upd((h) => deleteRoom(h, roomId)); onDeleted(); }}>Delete room</button>
      </div>
      {r.span > 1 && <SplitStoreys roomId={roomId} upd={upd} />}
    </>
  );
}
