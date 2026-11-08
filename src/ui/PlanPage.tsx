import { useEffect, useRef, useState } from 'react';
import type { Pt } from '../engine/geom';
import { DrawCanvas, GRID, NO_SEL } from './DrawCanvas';
import type { EditField, Sel, Tool } from './DrawCanvas';
import { DrawMenu, Inspector, LayerSettings, LayerTabs, RoomFields, drawHint } from './DrawPanels';
import { bandName } from '../engine/house-draw';
import { planBounds } from './HousePlan';
import { TraceControls, loadImagery, saveImagery, traceOf, traceUnderlay } from './HouseTrace';
import { roofStorey, storeyLevel } from '../engine/house';
import type { TraceSettings } from '../engine/house';
import type { Imagery } from './HouseTrace';
import { fmt, mix, NumInput } from './hform';
import { useProject } from './project';
import { href } from './route';

/** Board 1: the floor plan as a drawing canvas, layer by layer, with a lens and a summary of the selected room. */
export function PlanPage({ selected }: { selected?: string }) {
  const { house, upd, res, undo, redo, canUndo, canRedo, project, setProject } = useProject();
  const trace = traceOf(project);
  const setTrace = (fn: (t: TraceSettings) => void) => setProject((p) => { const x = structuredClone(traceOf(p)); fn(x); return { ...p, trace: x }; });
  const startRoom = house.rooms.find((r) => r.id === selected) ?? house.rooms[0];
  const [storey, setStorey] = useState(startRoom?.storey ?? 0);
  /** Editing the floor / ceiling band with this number instead of the rooms of a storey. */
  const [band, setBand] = useState<number | null>(null);
  /** Editing the roof sections instead. */
  const [roofOn, setRoofOn] = useState(false);
  const [sel, setSel] = useState<Sel>({ ...NO_SEL, room: startRoom?.id ?? '' });
  const [tool, setTool] = useState<Tool>('select');
  const [lens, setLens] = useState<'loss' | 'temp' | 'cover' | 'none'>('loss');
  const [showBelow, setShowBelow] = useState(true);
  const [sticky, setSticky] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1100);
  const [grid, setGrid] = useState(GRID);
  const [hintOpen, setHintOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  /** From the right-click menu: open the panel on a field of the selection. */
  const [editField, setEditField] = useState<EditField | null>(null);
  const editSel = (field: EditField) => { setPanelOpen(true); setEditField(field); };
  // Once the panel has rendered with the wall in it, focus the field asked for.
  useEffect(() => {
    if (!editField) return;
    // The selection's own section comes first in the panel, so its first dropdown or number is the one meant.
    const el = panel.current?.querySelector<HTMLInputElement | HTMLSelectElement>({ type: 'select', size: 'input[type="number"]', name: 'input[aria-label="Room name"]' }[editField]);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
    setEditField(null);
  }, [editField]);
  const [measure, setMeasure] = useState<{ len: number; pts: Pt[] } | null>(null);
  const [imagery, setImageryState] = useState<Imagery>(loadImagery);
  const room = house.rooms.find((r) => r.id === sel.room);
  const rr = res.rooms.find((r) => r.room.id === sel.room);
  const cv = res.heat.rooms.find((q) => q.id === sel.room);
  const { maxX, maxY, minX, minY } = planBounds(house);
  const hasInspector = sel.walls.length > 0 || !!sel.item || !!sel.zone || (sel.group?.length ?? 0) > 1;
  const last = house.storeys.length - 1;
  const roofSel = roofOn ? house.roofs.find((x) => x.id === sel.zone) : undefined;
  // A band shows the rooms of the storey it is the floor of (the top band, the top storey); the roof, the storey the chosen section sits on.
  const shown = roofOn ? (roofSel ? roofStorey(house, roofSel) : storey) : band == null ? storey : Math.min(band, last);
  const goStorey = (s: number) => { setStorey(s); setBand(null); setRoofOn(false); setSel(NO_SEL); setTool('select'); };
  const goBand = (b: number) => { setBand(b); setRoofOn(false); setSel(NO_SEL); setTool('select'); };
  const goRoof = (id?: string) => {
    const s = house.roofs.find((x) => x.id === id) ?? house.roofs[0];
    if (!roofOn) setStorey(s ? roofStorey(house, s) : last);
    setRoofOn(true); setBand(null); setSel(s ? { ...NO_SEL, zone: s.id } : NO_SEL); setTool('select');
  };


  const hint = drawHint(roofOn ? 'roof' : band != null, tool);
  const inspectorTitle = roofSel ? 'Roof' : sel.zone ? (house.zones?.find((x) => x.id === sel.zone)?.ufh ? 'Underfloor heating zone' : 'Floor zone') : (sel.group?.length ?? 0) > 1 ? 'Rooms' : sel.walls.length ? 'Walls' : sel.item?.k === 'op' ? 'Window or door' : 'Heat emitter';

  return (
    <div className="plan-stage">
        <DrawCanvas key={`${shown}-${band}-${roofOn}`} house={house} storey={shown} band={band ?? undefined} roof={roofOn} tool={measure ? 'select' : tool} setTool={setTool} sel={sel} setSel={setSel} upd={upd} below={showBelow} sticky={sticky} grid={grid} snapOn={snapOn} onEdit={editSel}
          underlay={traceUnderlay(house, trace, storey, imagery)}
          overlay={measure ? (to, _S, from) => (
            <g>
              {measure.pts.map((p, i) => { const q = to(p); return <circle key={i} cx={q[0]} cy={q[1]} r={5} fill="#c2410c" />; })}
              <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="transparent" style={{ cursor: 'crosshair' }} onPointerDown={(e) => {
                e.stopPropagation();
                const p = from(e);
                if (!p) return;
                const pts = [...measure.pts, p];
                if (pts.length < 2) { setMeasure({ ...measure, pts }); return; }
                // Rescale the image about the first point so the two points are `len` apart.
                const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
                if (d > 0.01) setTrace((t) => { const im = t.images[storeyLevel(house, storey)]; if (!im) return; const k = measure.len / d; im.x = pts[0][0] - (pts[0][0] - im.x) * k; im.y = pts[0][1] - (pts[0][1] - im.y) * k; im.w *= k; });
                setMeasure(null);
              }} />
            </g>
          ) : undefined}
          fill={(r) => {
            const x = res.rooms.find((q) => q.room.id === r.id), cv = res.heat.rooms.find((q) => q.id === r.id);
            if (!x) return '#fff';
            return lens === 'none' ? '#fff' : lens === 'loss' ? (r.heated ? mix([247, 239, 225], [233, 150, 95], (x.perM2 - 20) / 70) : '#eceff1')
              : lens === 'cover' ? (!cv ? '#eceff1' : !cv.has || cv.cover < 0.995 ? '#f3c9a2' : '#dcebdf')
              : mix([143, 179, 227], [247, 239, 225], (x.T - 5) / 16);
          }}
          label={(r) => {
            const x = res.rooms.find((q) => q.room.id === r.id), cv = res.heat.rooms.find((q) => q.id === r.id);
            if (!x) return '';
            return lens === 'temp' ? `${fmt(x.T, 1)} °C` : lens === 'cover' ? (!cv ? 'unheated' : cv.has ? `${fmt(cv.cover * 100)}% cover` : 'no emitter')
              : r.heated ? `${fmt(x.totalW)} W` : `unheated ${fmt(x.T, 1)} °C`;
          }} />
      <DrawMenu band={roofOn ? 'roof' : band == null ? null : band > last ? 'top' : 'floor'} tool={tool} setTool={(t) => { setTool(t); if (t !== 'select') setSel({ ...NO_SEL, room: sel.room }); }} sticky={sticky} setSticky={setSticky} snapOn={snapOn} setSnapOn={setSnapOn} grid={grid} setGrid={setGrid} />

      <div className="float-top">
        <span className="mono small"><b>{fmt(res.peakW / 1000, 2)} kW</b> · {fmt(res.heatedA ? res.peakW / res.heatedA : 0)} W/m² · {fmt(maxX - minX, 1)} × {fmt(maxY - minY, 1)} m</span>
        <label className="small">Colour <select className="draw-grid-sel" style={{ width: 'auto' }} value={lens} aria-label="Colour rooms by" onChange={(e) => setLens(e.target.value as typeof lens)}>
          <option value="loss">heat loss</option><option value="temp">temperature</option><option value="cover">emitter cover</option><option value="none">none</option>
        </select></label>
        <label className="small" title="Turn true north on the plan: the bearing that up on the screen faces. Walls, windows and roof slopes take their direction from it.">
          <span aria-hidden="true" className="north-arrow" style={{ transform: `rotate(${-(house.north ?? 0)}deg)` }}>↑N</span> Up faces{' '}
          <NumInput className="thk-input" step={5} value={house.north ?? 0} aria-label="Bearing that up on the plan faces, degrees from north"
            onChange={(e) => upd((h) => { const v = Number(e.target.value) || 0; h.north = ((v % 360) + 360) % 360; })} />°
        </label>
        <a className="small" href={href('pipes')}>Pipe runs ›</a>
        <a className="small" href={href('zones')}>Manifolds ›</a>
        {res.checks.length > 0 && (
          <details className="plan-checks">
            <summary>⚠ {res.checks.length} check{res.checks.length === 1 ? '' : 's'}</summary>
            <div>{res.checks.map((c, i) => <p key={i} className={c.level === 'error' ? 'h-err small' : 'warn small'}>{c.level === 'error' ? 'Error: ' : ''}{c.text}</p>)}</div>
          </details>
        )}
      </div>

      {hint && (
        <div className={`plan-hint${hintOpen ? ' open' : ''}`} onClick={() => setHintOpen(false)}>
          <button type="button" aria-expanded={hintOpen} aria-label={hintOpen ? 'Hide the full tip' : 'Show the full tip'} onClick={(e) => { e.stopPropagation(); setHintOpen(!hintOpen); }}>?</button>
          <span>{hintOpen ? hint : hint.split(/(?<=\.)\s/)[0]}</span>
        </div>
      )}

      <LayerTabs house={house} storey={storey} band={band} roof={roofOn} pickStorey={goStorey} pickBand={goBand} pickRoof={() => goRoof()} upd={upd} below={showBelow} setBelow={setShowBelow} />

      <button type="button" className="panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)} title={panelOpen ? 'Hide the layers panel' : 'Show the layers panel'}>{panelOpen ? '›' : '‹'}</button>
      {panelOpen && (
        <aside ref={panel} className="float-panel" aria-label="Layers and selection">
          {hasInspector && (
            <section className="fp-sec">
              <h3>{inspectorTitle}</h3>
              <Inspector house={house} res={res} storey={shown} sel={sel} setSel={setSel} upd={upd} />
            </section>
          )}
          {band == null && !roofOn && room && rr && (
            <section className="fp-sec">
              <h3>{room.name} <span className="small muted">{fmt(rr.area, 1)} m² · {room.heated ? `${fmt(rr.totalW)} W` : `${fmt(rr.T, 1)} °C`}{room.heated && cv ? ` · ${cv.has ? `${fmt(cv.cover * 100)}% emitters` : 'no emitter'}` : ''}</span></h3>
              <RoomFields house={house} roomId={room.id} upd={upd} onDeleted={() => setSel(NO_SEL)} />
              <a className="btn-secondary as-link" href={href('room', room.id)}>Open room ›</a>
            </section>
          )}
          {/* The open layer's own settings: always for a floor or the roof, for a storey when nothing on it is selected. */}
          {(band != null || roofOn || (!hasInspector && !room)) && (
            <section className="fp-sec">
              <h3>{roofOn ? 'Roof sections' : band != null ? bandName(house, band) : house.storeys[storey]?.name}</h3>
              <LayerSettings house={house} res={res} storey={storey} band={band} roof={roofOn} zone={sel.zone} pickZone={(id) => setSel({ ...NO_SEL, zone: id })} pickStorey={goStorey} pickRoof={goRoof} upd={upd} />
            </section>
          )}
          <details className="fp-sec">
            <summary>Tracing image</summary>
            <TraceControls house={house} res={res} storey={storey} trace={trace} setTrace={setTrace} imagery={imagery} setImagery={(v) => { setImageryState(v); saveImagery(v); }} measuring={!!measure} onMeasure={(len) => setMeasure({ len, pts: [] })} />
          </details>
        </aside>
      )}
    </div>
  );
}
