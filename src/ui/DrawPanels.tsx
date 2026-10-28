import { useMemo } from 'react';
import { CIBSE_ACH, SHADING, defaultTemp, onStorey, roomEdges, roomHeight } from '../engine/house';
import type { Buildup, BuildupKind, House, HouseResult, Room, RoomType } from '../engine/house';
import { RAD_LABEL } from '../engine/house-heating';
import type { RadType } from '../engine/house-heating';
import { addBasement, addStoreyAbove, bandName, canAddBasement, canRemoveBasement, canRemoveTop, copyRooms, deleteRoom, flipRooms, innerDoorAt, isOutside, openingCentre, pieceAlign, pieceKeys, pieceThickness, removeBasement, setPieceAlign, removeTop, rotateRooms, setWallLength, wallIndex, wallKeys, wallPieces } from '../engine/house-draw';
import { polyArea } from '../engine/geom';
import { Num, fmt, uid } from './hform';
import { NO_SEL } from './DrawCanvas';
import type { Sel, Tool, WallRef } from './DrawCanvas';
import { href } from './route';

const TOOLS: Array<[Tool, string, string]> = [
  ['select', 'Select', '↖'], ['room', 'Room', '⬠'], ['box', 'Box room', '▭'], ['split', 'Split room', '✂'], ['corner', 'Add corner', '＋'],
  ['window', 'Window', '▬'], ['door', 'Door', '▯'], ['radiator', 'Radiator', '≣'], ['ufh', 'UFH loop', '▦'],
];
const HINT: Record<Tool, string> = {
  select: 'Drag a wall or a corner to reshape; drag a room to move it and it snaps flush to its neighbours. Shift-drag on empty canvas boxes several rooms; Shift-click a room adds it; Shift-click walls selects several. Arrow keys nudge. Double-click a wall to add a corner, a corner to remove it. Alt stops neighbours following; hold Shift while drawing for free (no snapping). Double-click a tool to keep it.',
  room: 'Click each corner; lines snap square and 45° and sit flush on other rooms (Shift: free). Type a length and press Enter to set the next wall exactly. Click the first corner, double-click or press Enter to finish; Backspace undoes, Esc cancels.',
  box: 'Drag out a rectangular room, or click one corner then the opposite corner.',
  split: 'Click two points to draw a line across a room; it is cut in two along the line, with its windows, walls and emitters shared out.',
  corner: 'Click a wall to add a corner there, then drag it.',
  window: 'Click an outside wall to place a window, then drag it along the wall or to another wall.',
  door: 'Click an outside wall to place a door, or a wall between two rooms for an inside door. Drag it along or to another wall.',
  radiator: 'Click inside a heated room. A radiator snaps to the nearest wall; drag it to move it.',
  ufh: 'Click inside a heated room to add an underfloor heating loop; draw its pipe route under Pipe runs.',
};

const HINT_BAND: Partial<Record<Tool, string>> = {
  select: 'Drag a zone, or its corners, to reshape it. Double-click a zone edge to add a corner, a corner to remove it; Delete removes the zone. Pick a build-up for it on the right.',
  room: 'Click the corners of a patch of this floor or ceiling that has its own build-up, such as an insulated strip. Click the first corner or press Enter to finish.',
  box: 'Drag out a rectangular zone, or click one corner then the opposite one.',
  ufh: 'Drag out a rectangle inside a heated room: an underfloor heating loop. Choose its pattern and feed corner under Pipe runs.',
};

/** What the current tool does, for the hint bubble. */
export const drawHint = (band: boolean, tool: Tool) => (band ? HINT_BAND[tool] ?? HINT[tool] : HINT[tool]);

/** The drawing menu: a slim column of tool icons (names on hover) that floats over the canvas. */
export function DrawMenu({ band, tool, setTool, sticky, setSticky, snapOn, setSnapOn, grid, setGrid }: {
  /** On a floor or ceiling layer: only zones and (on floors) heated-floor loops can be drawn. */
  band: null | 'floor' | 'top';
  tool: Tool; setTool: (t: Tool) => void; sticky: boolean; setSticky: (v: boolean) => void; snapOn: boolean; setSnapOn: (v: boolean) => void; grid: number; setGrid: (v: number) => void;
}) {
  return (
    <div className="draw-menu" role="toolbar" aria-label="Drawing tools">
      {TOOLS.filter(([id]) => !band || id === 'select' || id === 'room' || id === 'box' || (id === 'ufh' && band === 'floor')).map(([id, l, glyph]) => [id, band ? ({ room: 'Zone', box: 'Box zone', ufh: 'UFH loop' } as Record<string, string>)[id] ?? l : l, glyph] as [Tool, string, string]).map(([id, label, glyph]) => (
        <button key={id} type="button" className={tool === id ? 'on' : ''} aria-pressed={tool === id} aria-label={label} title={`${label}. Double-click to keep this tool after each use`}
          onClick={() => { setTool(id); setSticky(false); }} onDoubleClick={() => { setTool(id); setSticky(id !== 'select'); }}>
          <span aria-hidden="true">{glyph}</span>{sticky && tool === id && <i className="lock" aria-hidden="true" />}
        </button>
      ))}
      <div className="draw-menu-end">
        <button type="button" className={snapOn ? 'on' : ''} aria-pressed={snapOn} aria-label="Snap to walls and angles" title="Snap to walls and angles" onClick={() => setSnapOn(!snapOn)}><span aria-hidden="true">⌖</span></button>
        <select className="draw-grid-sel" value={grid} aria-label="Grid size" title="Grid size" onChange={(e) => setGrid(Number(e.target.value))}>
          {[[0.01, '1cm'], [0.05, '5cm'], [0.1, '10cm'], [0.25, '25cm']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </div>
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
const ofKind = (h: House, ...k: BuildupKind[]) => h.buildups.filter((b) => k.includes(b.kind));

const ZONE_KINDS: BuildupKind[] = ['floor', 'roof'];

/**
 * The layers of the house as a stack, top to bottom: the roof or top ceiling, each storey, and the floor / ceiling band between
 * and under them. A storey is drawn with rooms and walls; a band is drawn with zones (patches with their own build-up) and
 * heated-floor loops. Click a layer to edit it; the open one lists its zones.
 */
export function LayerTree({ house, res, storey, band, pickStorey, pickBand, zone, pickZone, upd, below, setBelow }: {
  house: House; res: HouseResult; storey: number; band: number | null; pickStorey: (s: number) => void; pickBand: (b: number) => void;
  zone?: string; pickZone: (id: string) => void; upd: (fn: (h: House) => void) => void; below: boolean; setBelow: (v: boolean) => void;
}) {
  const last = house.storeys.length - 1;
  const faces = (rooms: string[], pick: (key: string, kind: string) => boolean) => res.rooms.filter((r) => rooms.includes(r.room.id)).flatMap((r) => r.faces.filter((f) => pick(f.key, f.kind) && !f.key.includes('~')));
  const bandFaces = (b: number) => (b > last
    ? faces(house.rooms.filter((r) => r.storey + r.span - 1 === last).map((r) => r.id), (k) => k.startsWith('lc:') || k.startsWith('fr:'))
    : faces(house.rooms.filter((r) => r.storey === b).map((r) => r.id), (_k, kind) => kind === 'floor'));
  const rows: JSX.Element[] = [];

  const bandRow = (b: number) => {
    const on = band === b, fs = bandFaces(b), zs = (house.zones ?? []).filter((z) => z.band === b), kinds: BuildupKind[] = b > last ? ['roof', 'floor'] : ['floor'];
    return (
      <div key={`b${b}`} className={`layer-band${on ? ' on' : ''}`}>
        <button type="button" aria-pressed={on} onClick={() => pickBand(b)}><b>{bandName(house, b)}</b><span className="small muted">{zs.length ? `${zs.length} zone${zs.length === 1 ? '' : 's'}` : 'no zones'}</span></button>
        {on && (
          <div className="layer-body">
            <span className="eyebrow">Whole layer</span>
            {fs.length
              ? <BuildupSelect label={`${bandName(house, b)} build-up`} value={common(fs.map((f) => f.buildup.id))} options={ofKind(house, ...kinds)} onPick={(id) => upd((h) => { fs.forEach((f) => { h.faceBuildup[f.key] = id; }); })} />
              : <span className="small muted">Nothing drawn here yet.</span>}
            {b > last && house.loft.present && <>
              <span className="eyebrow">Loft roof</span>
              <BuildupSelect label="Loft roof" value={house.defaults.loftRoof} options={ofKind(house, 'roof')} onPick={(id) => upd((h) => { h.defaults.loftRoof = id; })} />
            </>}
            {b > 0 && b <= last && <label className="small muted">Thickness <input type="number" className="thk-input" step={0.05} min={0} value={house.storeys[b - 1].zone} aria-label="Floor zone thickness" onChange={(e) => upd((h) => { h.storeys[b - 1].zone = Math.max(0, Number(e.target.value) || 0); })} /> m</label>}
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
        )}
      </div>
    );
  };

  rows.push(bandRow(last + 1));
  for (let s = last; s >= 0; s--) {
    const st = house.storeys[s], n = house.rooms.filter((r) => onStorey(r, s)).length, on = band == null && storey === s;
    rows.push(
      <div key={`s${s}`} className={`layer-storey${on ? ' on' : ''}`}>
        <button type="button" onClick={() => pickStorey(s)} aria-pressed={on}><b>{st.name}</b><span className="small muted">{n} room{n === 1 ? '' : 's'}{st.below ? ` · ${st.below} m underground` : ''}</span></button>
        {on && <>
          <label className="small muted">Height <input type="number" className="thk-input" step={0.05} min={1} value={st.h} aria-label={`${st.name} height`} onChange={(e) => upd((h) => { h.storeys[s].h = Math.max(1, Number(e.target.value) || 1); })} /> m</label>
          {n > 0 && <button type="button" className="btn-link" title="Copy this storey's rooms, windows and doors onto the storey above (a new one if this is the top)"
            onClick={() => { const sfx = uid(''); upd((h) => { if (s === h.storeys.length - 1) addStoreyAbove(h); let k = 0; copyRooms(h, h.rooms.filter((r) => r.storey === s).map((r) => r.id), [0, 0], s + 1, false, (p) => `${p}${sfx}${k++}`); }); pickStorey(s + 1); }}>Copy rooms up ›</button>}
        </>}
      </div>,
    );
    rows.push(bandRow(s));
  }

  return (
    <div className="layers">
      <button type="button" className="btn-secondary" onClick={() => { upd(addStoreyAbove); pickStorey(house.storeys.length); }}>＋ Add storey above</button>
      <div className="layer-stack">{rows}</div>
      <div className="chips">
        <button type="button" className="btn-secondary" disabled={!canAddBasement(house)} title={canAddBasement(house) ? '' : 'There is a basement already'}
          onClick={() => { upd(addBasement); pickStorey(0); }}>＋ Add basement below</button>
        {canRemoveTop(house) && <button type="button" className="btn-link" onClick={() => { upd(removeTop); pickStorey(Math.min(storey, last - 1)); }}>Remove empty top storey</button>}
        {canRemoveBasement(house) && <button type="button" className="btn-link" onClick={() => { upd(removeBasement); pickStorey(0); }}>Remove empty basement</button>}
      </div>
      <label className="small"><input type="checkbox" checked={below} onChange={(e) => setBelow(e.target.checked)} /> Show the storeys above and below faintly</label>
    </div>
  );
}

/** What is selected on the canvas: walls (assign build-ups), a window or door, or an emitter. */
export function Inspector({ house, res, storey, sel, setSel, upd }: {
  house: House; res: HouseResult; storey: number; sel: Sel; setSel: (s: Sel) => void; upd: (fn: (h: House) => void) => void;
}) {
  const walls = sel.walls;
  const info = useMemo(() => walls.map((w) => {
    const r = house.rooms.find((x) => x.id === w.room), e = r && roomEdges(r)[w.edge], keys = w.span ? pieceKeys(house, w.room, w.edge, storey, w) : wallKeys(house, w.room, w.edge, storey);
    const face = res.rooms.find((x) => x.room.id === w.room)?.faces.find((f) => f.key === keys[0]) ?? res.rooms.find((x) => x.room.id === w.room)?.faces.find((f) => keys.includes(f.key));
    return { w, r, keys, len: w.span ? w.span[1] - w.span[0] : e?.len ?? 0, thick: w.span ? pieceThickness(house, w.room, w.edge, storey, w) : 0, align: w.span ? pieceAlign(house, w.room, w.edge, storey, w) : null, whole: e?.len ?? 0, id: face?.buildup.id ?? house.defaults[keys[0]?.startsWith('w:') ? 'extWall' : 'intWall'], U: face?.U, party: house.faceBoundary[keys[0]] === 'party', outside: w.span ? !w.other : !!r && isOutside(house, r, w.edge, storey) };
  }), [walls, house, res, storey]);

  const pick = (list: WallRef[]) => setSel({ ...NO_SEL, room: sel.room, walls: list });
  const here = house.rooms.filter((r) => onStorey(r, storey));
  // Walls a piece at a time, so "outside walls" takes only the outside stretches; an inside wall is listed once, from the first room of its pair.
  const every = (outsideOnly: boolean, only?: string): WallRef[] => here.filter((r) => !only || r.id === only).flatMap((r) => roomEdges(r).flatMap((e) =>
    wallPieces(house, r.id, e.idx, storey).filter((p) => (outsideOnly ? !p.other : !p.other || !!only || r.id < p.other!))
      .map((p): WallRef => ({ room: r.id, edge: e.idx, span: p.span, ...(p.other ? { other: p.other, gap: p.gap } : {}) }))));

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
          <BuildupSelect label="Wall build-up" value={common(ids)} options={ofKind(house, 'wall')} onPick={(id) => upd((h) => {
            info.forEach((i) => i.keys.forEach((k) => { h.faceBuildup[k] = id; }));
            // The last pick becomes what the next wall drawn starts with.
            h.defaults[info.some((i) => i.outside) ? 'extWall' : 'intWall'] = id;
          })} />
        </label>
        {Us.length > 0 && <p className="small">U-value {Us.length && Math.min(...Us) === Math.max(...Us) ? fmt(Us[0], 2) : `${fmt(Math.min(...Us), 2)}–${fmt(Math.max(...Us), 2)}`} W/m²K</p>}
        {info.length === 1 && (info[0].w.gap ?? 0) > 0.01 && (
          <p className="small">Drawn <b>{Math.round(info[0].w.gap! * 1000)} mm</b> thick: the space between the two rooms. {info[0].thick > 0 && Math.abs(info[0].thick - info[0].w.gap!) > 0.005 ? `Its build-up is ${Math.round(info[0].thick * 1000)} mm, so the rooms are ${Math.round(Math.abs(info[0].thick - info[0].w.gap!) * 1000)} mm ${info[0].w.gap! > info[0].thick ? 'too far apart' : 'too close'} to match it.` : 'That matches its build-up.'}</p>
        )}
        {info.every((i) => i.w.span && !((i.w.gap ?? 0) > 0.01)) && (
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
            <button type="button" className={`chip${info.filter((i) => !i.w.other).every((i) => !i.party) ? ' on' : ''}`} onClick={() => upd((h) => info.filter((i) => !i.w.other).forEach((i) => { delete h.faceBoundary[i.keys[0]]; }))}>Outside</button>
            <button type="button" className={`chip${info.filter((i) => !i.w.other).every((i) => i.party) ? ' on' : ''}`} disabled={info.some((i) => !i.w.other && !i.outside)} title="Neighbour's side, at the neighbour temperature"
              onClick={() => upd((h) => info.filter((i) => !i.w.other).forEach((i) => { h.faceBoundary[i.keys[0]] = 'party'; }))}>Party wall</button>
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
    const kind = house.buildups.find((b) => b.id === o.buildup)?.kind ?? 'glazing';
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
        {kind === 'glazing' && <label className="hf"><span className="eyebrow">Shading</span>
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

  if (sel.item?.k === 'em') {
    const e = house.heating.emitters.find((x) => x.id === sel.item!.id);
    if (!e) return null;
    const set = (patch: Partial<typeof e>) => upd((h) => { const x = h.heating.emitters.find((q) => q.id === e.id); if (x) Object.assign(x, patch); });
    return (
      <>
        <div className="eyebrow">{e.kind === 'ufh' ? 'Underfloor loop' : e.kind === 'towel' ? 'Towel rail' : 'Radiator'} · {house.rooms.find((r) => r.id === e.room)?.name}</div>
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
        {e.kind === 'ufh' && !e.rect && <Num label="Heated floor area" unit="m²" step={0.5} min={1} value={e.area} onChange={(v) => set({ area: Math.max(1, v) })} />}
        <a className="btn-link" href={href('emitters')}>All emitters and zones ›</a>
        <button type="button" className="btn-danger" onClick={() => { upd((h) => { h.heating.emitters = h.heating.emitters.filter((x) => x.id !== e.id); }); setSel({ ...sel, item: null }); }}>Delete</button>
      </>
    );
  }
  return null;
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
    </>
  );
}
