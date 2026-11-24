import { useEffect, useRef, useState } from 'react';
import type { Pt } from '../engine/geom';
import { DrawCanvas, GRID, NO_SEL } from './DrawCanvas';
import type { EditField, Lens, OpPick, Sel, Tool, View as CanvasView } from './DrawCanvas';
import { DrawMenu, GridSelect, Inspector, LayerSettings, LayerTabs, PlanBar, RoomFields, drawHint } from './DrawPanels';
import { bandName } from '../engine/house-draw';
import { planBounds } from './HousePlan';
import { TraceControls, loadImagery, saveImagery, traceOf, traceUnderlay } from './HouseTrace';
import { roofStorey, storeyLevel } from '../engine/house';
import type { TraceSettings } from '../engine/house';
import type { Imagery } from './HouseTrace';
import { fmt, mix } from './hform';
import { useProject } from './project';
import { AddBuildupProvider } from './AddBuildupFlow';
import { autoPipes, combineRuns, pipeRest, unpiped } from '../engine/house-pipes';

/** The floor plan as a drawing canvas, layer by layer, with a summary of the selected room. Model draws the rooms; Heating lays out emitters, plant and pipes on the same canvas. */
export function PlanPage({ selected, mode = 'model' }: { selected?: string; mode?: 'model' | 'heating' }) {
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
  const [lens, setLens] = useState<'loss' | 'temp' | 'cover' | 'none'>(mode === 'heating' ? 'cover' : 'loss');
  /** What is being edited: the plan, or the pipework. Floor and ceiling layers (where UFH zones are drawn) and the roof are plan only. */
  const base: Lens = mode === 'heating' ? 'pipes' : 'plan';
  const [view, setView] = useState<Lens>(base);
  /** The canvas pan and zoom, the same on every floor and layer. */
  const canvasView = useRef<CanvasView | null>(null);
  const [opPick, setOpPick] = useState<OpPick>({});
  const [showBelow, setShowBelow] = useState(true);
  // Asked in the bar, not with confirm(): embedded browsers can drop native dialogs silently.
  const [ask, setAsk] = useState<'auto' | 'unroute' | null>(null);
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
    const el = panel.current?.querySelector<HTMLInputElement | HTMLSelectElement>({ type: 'select', size: 'input[type="number"]', name: 'input[aria-label="Room name"], input[aria-label="Zone name"], input[aria-label="Roof name"]', via: 'select[name="via"]' }[editField]);
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
  const goStorey = (s: number) => { setStorey(s); setBand(null); setRoofOn(false); setSel(NO_SEL); setTool('select'); setView(base); };
  const goBand = (b: number) => { setBand(b); setRoofOn(false); setSel(NO_SEL); setTool('select'); setView('plan'); };
  const goRoof = (id?: string) => {
    const s = house.roofs.find((x) => x.id === id) ?? house.roofs[0];
    if (!roofOn) setStorey(s ? roofStorey(house, s) : last);
    setRoofOn(true); setBand(null); setSel(s ? { ...NO_SEL, zone: s.id } : NO_SEL); setTool('select'); setView('plan');
  };


  const hint = drawHint(roofOn ? 'roof' : band != null, tool, view);
  const inspectorTitle = roofSel ? 'Roof' : sel.zone ? (() => { const zz = house.zones?.find((x) => x.id === sel.zone); return zz?.ufh ? 'Underfloor heating zone' : zz?.buildup === 'open-stairwell' ? 'Stairwell' : 'Floor zone'; })() : (sel.group?.length ?? 0) > 1 ? 'Rooms' : sel.walls.length ? 'Walls' : sel.item?.k === 'op' ? 'Window or door' : sel.item?.k === 'plant' ? 'Heating plant' : sel.item?.k === 'pipe' ? 'Pipe run' : 'Heat emitter';

  return (
    <AddBuildupProvider>
    <div className="plan-stage">
        <DrawCanvas key={`${shown}-${band}-${roofOn}`} house={house} storey={shown} band={band ?? undefined} roof={roofOn} tool={measure ? 'select' : tool} setTool={setTool} sel={sel} setSel={setSel} upd={upd} below={showBelow} sticky={sticky} grid={grid} snapOn={snapOn} onEdit={editSel} lens={view} opPick={opPick} viewRef={canvasView} zoomStart={<GridSelect grid={grid} setGrid={setGrid} />}
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
      <PlanBar house={house} mode={mode}>
        <span className="mono small"><b>{fmt(res.peakW / 1000, 2)} kW</b> · {fmt(res.heatedA ? res.peakW / res.heatedA : 0)} W/m² · {fmt(maxX - minX, 1)} × {fmt(maxY - minY, 1)} m</span>
        <label className="small">Colour <select className="draw-grid-sel" style={{ width: 'auto' }} value={lens} aria-label="Colour rooms by" onChange={(e) => setLens(e.target.value as typeof lens)}>
          <option value="loss">heat loss</option><option value="temp">temperature</option><option value="cover">emitter cover</option><option value="none">none</option>
        </select></label>
        {res.checks.length > 0 && (
          <details className="plan-checks">
            <summary>⚠ {res.checks.length} check{res.checks.length === 1 ? '' : 's'}</summary>
            <div>{res.checks.map((c, i) => <p key={i} className={c.level === 'error' ? 'h-err small' : 'warn small'}>{c.level === 'error' ? 'Error: ' : ''}{c.text}</p>)}</div>
          </details>
        )}
      </PlanBar>

      {/* The tools down the left of the canvas. */}
      <div className="plan-left">
      <DrawMenu house={house} opPick={opPick} setOpPick={setOpPick} lens={view} band={roofOn ? 'roof' : band == null ? null : band > last ? 'top' : 'floor'} tool={tool} setTool={(t) => { setTool(t); if (t !== 'select') setSel({ ...NO_SEL, room: sel.room }); }} sticky={sticky} setSticky={setSticky} snapOn={snapOn} setSnapOn={setSnapOn} />
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
          {/* One section at a time: the selection, else its room, else the open layer. */}
          {hasInspector ? (
            <section className="fp-sec">
              {band == null && !roofOn && room && !sel.zone && (sel.group?.length ?? 0) < 2 && <button type="button" className="btn-link fp-crumb" onClick={() => setSel({ ...NO_SEL, room: room.id })}>‹ {room.name}</button>}
              <h3>{inspectorTitle}</h3>
              <Inspector house={house} res={res} storey={shown} sel={sel} setSel={setSel} upd={upd} />
            </section>
          ) : band == null && !roofOn && room && rr ? (
            <section className="fp-sec">
              <h3>Room</h3>
              <dl className="fp-stats">
                <div><dt>Area</dt><dd>{fmt(rr.area, 1)} m²</dd></div>
                {room.heated ? <>
                  <div><dt>Heat loss</dt><dd>{fmt(rr.totalW)} W <span className="muted">{fmt(rr.perM2)} W/m²</span></dd></div>
                  <div><dt>Emitters</dt><dd>{cv?.has ? `${fmt(cv.cover * 100)}% cover` : 'none yet'}</dd></div>
                </> : <div><dt>Temperature</dt><dd>{fmt(rr.T, 1)} °C</dd></div>}
                <div><dt>Ventilation</dt><dd>{fmt(rr.n, 2)} ach</dd></div>
              </dl>
              <RoomFields house={house} roomId={room.id} calcAch={rr.n} upd={upd} onDeleted={() => setSel(NO_SEL)} />
            </section>
          ) : <>
            {view === 'pipes' && (
              <section className="fp-sec">
                <h3>Pipe runs</h3>
                {!house.heating.source ? <p className="small muted">Place the boiler or heat pump first: pipes run from it to every heater.</p> : (() => {
                  const n = unpiped(house).length, runs = house.heating.pipes?.length ?? 0;
                  return ask ? (
                    <>
                      <p className="small" role="alert">{ask === 'auto' ? `Replace all ${runs} pipe run${runs === 1 ? '' : 's'} with an automatic layout? Runs you drew or moved are lost.` : `Delete all ${runs} pipe run${runs === 1 ? '' : 's'}? The boiler, cylinder, risers and heaters stay.`} Ctrl+Z undoes it.</p>
                      <div className="row-between">
                        <button type="button" className="btn-secondary" onClick={() => setAsk(null)}>Cancel</button>
                        <button type="button" className={ask === 'auto' ? 'btn-primary' : 'btn-danger'} autoFocus onClick={() => {
                          if (ask === 'auto') upd((h) => { h.heating.pipes = autoPipes(h); combineRuns(h, res); });
                          else { upd((h) => { h.heating.pipes = []; }); setSel(NO_SEL); }
                          setAsk(null);
                        }}>{ask === 'auto' ? 'Replace' : 'Delete all'}</button>
                      </div>
                    </>
                  ) : <>
                    <p className="small muted">{runs ? `${runs} run${runs === 1 ? '' : 's'}` : 'No runs yet'}{n ? `; ${n} heater${n === 1 ? '' : 's'} not piped.` : runs ? '; every heater is piped.' : '.'}</p>
                    <button type="button" className="btn-secondary" title="Lay every run from the plan: from the heat source, up the riser that makes the runs shortest, to every heater, with runs that leave together sharing a pipe."
                      onClick={() => { if (runs) setAsk('auto'); else upd((h) => { h.heating.pipes = autoPipes(h); combineRuns(h, res); }); }}>Auto route all</button>
                    {n > 0 && runs > 0 && <button type="button" className="btn-secondary" title="A plain square run from the heat source, or the floor's riser, to each heater with none. Runs already drawn stay."
                      onClick={() => upd((h) => { pipeRest(h); })}>Pipe the {n} unpiped</button>}
                    {runs > 0 && <button type="button" className="btn-link" title="Take out every pipe run, to draw them yourself." onClick={() => setAsk('unroute')}>Unroute all</button>}
                  </>;
                })()}
              </section>
            )}
            <section className="fp-sec">
              <h3>{roofOn ? 'Roof sections' : band != null ? bandName(house, band) : house.storeys[storey]?.name}</h3>
              <LayerSettings house={house} res={res} storey={storey} band={band} roof={roofOn} zone={sel.zone} pickZone={(id) => setSel({ ...NO_SEL, zone: id })} pickStorey={goStorey} pickRoof={goRoof} upd={upd} />
            </section>
            {mode === 'model' && <details className="fp-sec">
            <summary>Site and tracing</summary>
            <TraceControls house={house} res={res} storey={storey} trace={trace} setTrace={setTrace} upd={upd} imagery={imagery} setImagery={(v) => { setImageryState(v); saveImagery(v); }} measuring={!!measure} onMeasure={(len) => setMeasure({ len, pts: [] })} />
          </details>}
          </>}
        </aside>
      )}
    </div>
    </AddBuildupProvider>
  );
}
