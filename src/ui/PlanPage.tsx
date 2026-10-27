import { useState } from 'react';
import type { Pt } from '../engine/geom';
import { Chip } from './controls';
import { DrawCanvas, GRID, NO_SEL } from './DrawCanvas';
import type { Sel, Tool } from './DrawCanvas';
import { DrawMenu, Inspector, LayerTree, RoomFields } from './DrawPanels';
import { bandName } from '../engine/house-draw';
import { planBounds } from './HousePlan';
import { TraceControls, loadImagery, saveImagery, traceUnderlay } from './HouseTrace';
import type { Imagery } from './HouseTrace';
import { Card, fmt, mix } from './hform';
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

  const peakKW = res.peakW / 1000;
  const tiles: Array<[string, string, string, string]> = [
    ['Design heat loss', fmt(peakKW, 2), 'kW', `Heated rooms at ${res.Tout} °C outside`],
    ['Per floor area', fmt(res.heatedA ? res.peakW / res.heatedA : 0), 'W/m²', `${fmt(res.heatedA, 1)} m² heated`],
    ['Heat loss parameter', fmt(res.hlp, 2), 'W/m²K', `HTC ${fmt(res.htc)} W/K`],
    ['Space heating', fmt(Math.round(res.annualKWh / 100) * 100), 'kWh/yr', `${fmt(res.hdd)} degree days`],
  ];

  return (
    <div className="house">
      <div className="tiles">
        {tiles.map(([l, v, u, n]) => (
          <div key={l} className="tile">
            <span className="tiles-head">{l}</span>
            <span className="tile-value"><span className="mono big">{v}</span><span className="small muted">{u}</span></span>
            <span className="small muted">{n}</span>
          </div>
        ))}
      </div>
      {res.checks.length > 0 && (
        <aside className="callout" role="status">
          <div className="eyebrow">Model checks</div>
          {res.checks.map((c, i) => <p key={i} className={c.level === 'error' ? 'h-err' : 'warn'}>{c.level === 'error' ? 'Error: ' : ''}{c.text}</p>)}
        </aside>
      )}
      <div className="plan-split">
        <div className="plan-main">
          <Card title={band == null ? `Plan · ${house.storeys[storey]?.name ?? ''}` : `Layer · ${bandName(house, band)}`} note={band == null ? 'Draw rooms, drag any wall or corner, then place windows, doors and emitters. North is up.' : 'A floor or ceiling layer: draw zones with their own build-up, or underfloor heating loops. Rooms are shown for reference.'}
            right={<div className="chips">{house.storeys.map((s, i) => <Chip key={i} on={band == null && storey === i} onClick={() => goStorey(i)}>{s.name}</Chip>)}</div>}>
            <div className="chips" role="group" aria-label="Colour rooms by">
              <Chip on={lens === 'loss'} onClick={() => setLens('loss')}>Heat loss W/m²</Chip>
              <Chip on={lens === 'temp'} onClick={() => setLens('temp')}>Temperature</Chip>
              <Chip on={lens === 'cover'} onClick={() => setLens('cover')}>Emitter cover</Chip>
              <Chip on={lens === 'none'} onClick={() => setLens('none')}>None</Chip>
              <a className="btn-secondary as-btn" href={href('pipes')}>Pipe runs ›</a>
              <a className="btn-secondary as-btn" href={href('zones')}>Manifolds ›</a>
            </div>
            <div className="draw-layout">
              <DrawMenu band={band == null ? null : band > last ? 'top' : 'floor'} tool={tool} setTool={(t) => { setTool(t); if (t !== 'select') setSel({ ...NO_SEL, room: sel.room }); }} sticky={sticky} setSticky={setSticky} snapOn={snapOn} setSnapOn={setSnapOn} grid={grid} setGrid={setGrid} canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} />
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
              <aside className="layer-col" aria-label="Layers and selection">
                {hasInspector && (
                  <div className="layer-inspector">
                    <h3>{sel.zone ? 'Floor zone' : (sel.group?.length ?? 0) > 1 ? 'Rooms' : sel.walls.length ? 'Walls' : sel.item?.k === 'op' ? 'Window or door' : 'Heat emitter'}</h3>
                    <Inspector house={house} res={res} storey={shown} sel={sel} setSel={setSel} upd={upd} />
                  </div>
                )}
                <LayerTree house={house} res={res} storey={storey} band={band} pickStorey={goStorey} pickBand={goBand} zone={sel.zone} pickZone={(id) => setSel({ ...NO_SEL, zone: id })} upd={upd} below={showBelow} setBelow={setShowBelow} />
              </aside>
            </div>
            <TraceControls house={house} res={res} storey={storey} upd={upd} imagery={imagery} setImagery={(v) => { setImageryState(v); saveImagery(v); }} measuring={!!measure} onMeasure={(len) => setMeasure({ len, pts: [] })} />
            <span className="small muted mono">{fmt(maxX - minX, 1)} × {fmt(maxY - minY, 1)} m overall · Ctrl + wheel zooms, drag the background to pan</span>
          </Card>
        </div>
        <div className="plan-side">
          {band != null ? null : room && rr ? (
            <Card title={room.name} note={`${fmt(rr.area, 1)} m² · ${fmt(rr.V, 1)} m³ · ${house.storeys[room.storey]?.name}`}>
              <RoomFields house={house} roomId={room.id} upd={upd} onDeleted={() => setSel(NO_SEL)} />
              <div className="kpis">
                <div className="kpi"><span className="eb">{room.heated ? 'Heat loss' : 'Settles at'}</span><span className="v">{room.heated ? fmt(rr.totalW) : fmt(rr.T, 1)} <span className="small muted">{room.heated ? 'W' : '°C'}</span></span><span className="small muted">{room.heated ? `${fmt(rr.perM2)} W/m² · fabric ${fmt(rr.totalW ? (rr.fabricW / rr.totalW) * 100 : 0)}%` : 'unheated'}</span></div>
                <div className="kpi"><span className="eb">Emitters</span><span className="v">{room.heated ? (cv ? (cv.has ? `${fmt(cv.cover * 100)}%` : 'none') : '—') : '—'}</span><span className="small muted">of the loss covered</span></div>
              </div>
              <div className="h-table-wrap">
                <table className="h-table">
                  <thead><tr><th>Face</th><th>Build-up</th><th className="n">W</th></tr></thead>
                  <tbody>
                    {rr.rows.map((row, i) => <tr key={`${row.key}-${i}`} className={row.kind === 'vent' ? 'vent' : ''}><td>{row.label}</td><td className="small">{row.buildup}</td><td className="n mono">{fmt(row.W)}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <a className="btn-primary as-link" href={href('room', room.id)}>Open room ›</a>
            </Card>
          ) : (
            <Card title="No room selected"><p className="small muted">Click a room on the plan, or draw one with the Room or Box room tool.</p></Card>
          )}
        </div>
      </div>
    </div>
  );
}
