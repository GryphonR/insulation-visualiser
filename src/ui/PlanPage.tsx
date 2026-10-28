import { useState } from 'react';
import type { Pt } from '../engine/geom';
import { DrawCanvas, GRID, NO_SEL } from './DrawCanvas';
import type { Sel, Tool } from './DrawCanvas';
import { DrawMenu, Inspector, LayerTree, RoomFields, drawHint } from './DrawPanels';
import { bandName } from '../engine/house-draw';
import { planBounds } from './HousePlan';
import { TraceControls, loadImagery, saveImagery, traceUnderlay } from './HouseTrace';
import type { Imagery } from './HouseTrace';
import { fmt, mix } from './hform';
import { useProject } from './project';
import { href } from './route';

/** Board 1: the floor plan as a drawing canvas, layer by layer, with a lens and a summary of the selected room. */
export function PlanPage({ selected }: { selected?: string }) {
  const { house, upd, res, undo, redo, canUndo, canRedo } = useProject();
  const startRoom = house.rooms.find((r) => r.id === selected) ?? house.rooms[0];
  const [storey, setStorey] = useState(startRoom?.storey ?? 0);
  /** Editing the floor / ceiling band with this number instead of the rooms of a storey. */
  const [band, setBand] = useState<number | null>(null);
  const [sel, setSel] = useState<Sel>({ ...NO_SEL, room: startRoom?.id ?? '' });
  const [tool, setTool] = useState<Tool>('select');
  const [lens, setLens] = useState<'loss' | 'temp' | 'cover' | 'none'>('loss');
  const [showBelow, setShowBelow] = useState(true);
  const [sticky, setSticky] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1100);
  const [grid, setGrid] = useState(GRID);
  const [measure, setMeasure] = useState<{ len: number; pts: Pt[] } | null>(null);
  const [imagery, setImageryState] = useState<Imagery>(loadImagery);
  const room = house.rooms.find((r) => r.id === sel.room);
  const rr = res.rooms.find((r) => r.room.id === sel.room);
  const cv = res.heat.rooms.find((q) => q.id === sel.room);
  const { maxX, maxY, minX, minY } = planBounds(house);
  const hasInspector = sel.walls.length > 0 || !!sel.item || !!sel.zone || (sel.group?.length ?? 0) > 1;
  const last = house.storeys.length - 1;
  // A band shows the rooms of the storey it is the floor of (the top band, the top storey).
  const shown = band == null ? storey : Math.min(band, last);
  const goStorey = (s: number) => { setStorey(s); setBand(null); setSel(NO_SEL); setTool('select'); };
  const goBand = (b: number) => { setBand(b); setSel(NO_SEL); setTool('select'); };


  const hint = drawHint(band != null, tool);
  const inspectorTitle = sel.zone ? 'Floor zone' : (sel.group?.length ?? 0) > 1 ? 'Rooms' : sel.walls.length ? 'Walls' : sel.item?.k === 'op' ? 'Window or door' : 'Heat emitter';

  return (
    <div className="plan-stage">
        <DrawCanvas key={`${shown}-${band}`} house={house} storey={shown} band={band ?? undefined} tool={measure ? 'select' : tool} setTool={setTool} sel={sel} setSel={setSel} upd={upd} below={showBelow} sticky={sticky} grid={grid} snapOn={snapOn}
          underlay={traceUnderlay(house, storey, imagery)}
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
                if (d > 0.01) upd((h) => { const im = h.trace?.images[storey]; if (!im) return; const k = measure.len / d; im.x = pts[0][0] - (pts[0][0] - im.x) * k; im.y = pts[0][1] - (pts[0][1] - im.y) * k; im.w *= k; });
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
      <DrawMenu band={band == null ? null : band > last ? 'top' : 'floor'} tool={tool} setTool={(t) => { setTool(t); if (t !== 'select') setSel({ ...NO_SEL, room: sel.room }); }} sticky={sticky} setSticky={setSticky} snapOn={snapOn} setSnapOn={setSnapOn} grid={grid} setGrid={setGrid} />

      <div className="float-top">
        <span className="mono small"><b>{fmt(res.peakW / 1000, 2)} kW</b> · {fmt(res.heatedA ? res.peakW / res.heatedA : 0)} W/m² · {fmt(maxX - minX, 1)} × {fmt(maxY - minY, 1)} m</span>
        <label className="small">Colour <select className="draw-grid-sel" style={{ width: 'auto' }} value={lens} aria-label="Colour rooms by" onChange={(e) => setLens(e.target.value as typeof lens)}>
          <option value="loss">heat loss</option><option value="temp">temperature</option><option value="cover">emitter cover</option><option value="none">none</option>
        </select></label>
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
        <details className="plan-hint">
          <summary>{hint.split(/(?<=\.)\s/)[0]}</summary>
          <p className="small">{hint}</p>
        </details>
      )}

      <button type="button" className="panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)} title={panelOpen ? 'Hide the layers panel' : 'Show the layers panel'}>{panelOpen ? '›' : '‹'}</button>
      {panelOpen && (
        <aside className="float-panel" aria-label="Layers and selection">
          {hasInspector && (
            <section className="fp-sec">
              <h3>{inspectorTitle}</h3>
              <Inspector house={house} res={res} storey={shown} sel={sel} setSel={setSel} upd={upd} />
            </section>
          )}
          {band == null && room && rr && (
            <section className="fp-sec">
              <h3>{room.name} <span className="small muted">{fmt(rr.area, 1)} m² · {room.heated ? `${fmt(rr.totalW)} W` : `${fmt(rr.T, 1)} °C`}{room.heated && cv ? ` · ${cv.has ? `${fmt(cv.cover * 100)}% emitters` : 'no emitter'}` : ''}</span></h3>
              <RoomFields house={house} roomId={room.id} upd={upd} onDeleted={() => setSel(NO_SEL)} />
              <a className="btn-secondary as-link" href={href('room', room.id)}>Open room ›</a>
            </section>
          )}
          <LayerTree house={house} res={res} storey={storey} band={band} pickStorey={goStorey} pickBand={goBand} zone={sel.zone} pickZone={(id) => setSel({ ...NO_SEL, zone: id })} upd={upd} below={showBelow} setBelow={setShowBelow} />
          <details className="fp-sec">
            <summary>Tracing image</summary>
            <TraceControls house={house} res={res} storey={storey} upd={upd} imagery={imagery} setImagery={(v) => { setImageryState(v); saveImagery(v); }} measuring={!!measure} onMeasure={(len) => setMeasure({ len, pts: [] })} />
          </details>
        </aside>
      )}
    </div>
  );
}
