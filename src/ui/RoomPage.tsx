import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ROOM_TEMPS } from '../engine/climate-mcs';
import { SHADING, SIDES, bearingLabel, buildupU, trueBearing, defaultTemp, edgesToRectShape, rectShapeToEdges, roomArea, roomEdges, roomPoly, setOutline } from '../engine/house';
import type { BuildupKind, Face, RoomType, Side } from '../engine/house';
import { MAT } from '../engine/data';
import { simulate } from '../engine/house-sim';
import { RoomShapeEditor } from './HouseShape';
import { Card, Num, fmt, mix, uid } from './hform';
import { useProject } from './project';
import { Crumbs } from './Shell';
import { href } from './route';

const ROOM_TYPES = Object.keys(ROOM_TEMPS) as RoomType[];
/** Which build-up kinds fit a face. */
const fits = (faceKind: string): BuildupKind[] => (faceKind === 'wall' ? ['wall'] : faceKind === 'window' || faceKind === 'door' ? ['glazing', 'door'] : ['floor', 'roof']);
const GROUPS = ['N', 'E', 'S', 'W', 'floor', 'ceiling'] as const;
type Group = (typeof GROUPS)[number];
const GROUP_LABEL: Record<Group, string> = { N: 'North wall', E: 'East wall', S: 'South wall', W: 'West wall', floor: 'Floor', ceiling: 'Ceiling' };
const groupOf = (f: Face): Group | null => (f.kind === 'floor' ? 'floor' : f.kind === 'ceiling' ? 'ceiling' : f.side ?? null);
const layerColour = (id: string) => MAT[id]?.col ?? '#ddd';

/** Board 1a: one room as a box. Each face is its own element with a build-up and a boundary. */
export function RoomPage({ id, initialTab }: { id: string; initialTab?: string }) {
  const { house, upd, res } = useProject();
  const sel = id;
  const room = house.rooms.find((r) => r.id === sel);
  const rr = res.rooms.find((r) => r.room.id === sel);
  const [tab, setTab] = useState<'faces' | 'details' | 'openings'>(initialTab === 'details' || initialTab === 'openings' ? initialTab : 'faces');
  const [group, setGroup] = useState<Group>('N');
  const [outlineMode, setOutlineMode] = useState(true);
  const day = useMemo(() => simulate(house, 'design', res), [house, res]);
  if (!room || !rr) return <div className="callout"><p>That room no longer exists. <a href={href('plan')}>Back to the plan</a></p></div>;

  const setRoom = (patch: Partial<typeof room>) => upd((h) => { const r = h.rooms.find((x) => x.id === sel); if (r) Object.assign(r, patch); });
  const bOpts = (kinds: BuildupKind[]) => house.buildups.filter((b) => kinds.includes(b.kind));
  const sameStorey = house.rooms.filter((r) => r.storey === room.storey);
  const at = sameStorey.findIndex((r) => r.id === sel);
  const prev = sameStorey[(at + sameStorey.length - 1) % sameStorey.length], next = sameStorey[(at + 1) % sameStorey.length];
  const delRoom = () => {
    if (!confirm(`Delete ${room.name}, with its windows, doors and emitters?`)) return;
    upd((h) => {
      h.rooms = h.rooms.filter((r) => r.id !== sel);
      h.openings = h.openings.filter((o) => o.room !== sel);
      h.vent.devices = h.vent.devices.filter((d) => d.room !== sel);
      h.heating.emitters = h.heating.emitters.filter((e) => e.room !== sel);
    });
    location.hash = href('plan');
  };

  // Rows by box face. A row's face gives the side; the ventilation row has no face and stays in the table only.
  const faceOf = new Map(rr.faces.map((f) => [f.key, f]));
  const rowsIn = (g: Group) => rr.rows.filter((r) => { const f = faceOf.get(r.key); return f && groupOf(f) === g; });
  const wIn = (g: Group) => rowsIn(g).reduce((a, r) => a + r.W, 0);
  const maxW = Math.max(1, ...GROUPS.map(wIn));
  const here = rowsIn(group);
  const face = (g: Group, style?: CSSProperties) => {
    const w = wIn(g), rows = rowsIn(g);
    const to = rows.length ? [...new Set(rows.filter((r) => !r.key.startsWith('op:')).map((r) => r.to))].join(', ') : 'none';
    return (
      <button type="button" className={`face${group === g ? ' on' : ''}${g === 'floor' || g === 'ceiling' ? ' dashed' : ''}`} aria-pressed={group === g}
        style={{ background: mix([255, 254, 251], [233, 150, 95], w / maxW), ...style }} onClick={() => setGroup(g)}>
        <b>{GROUP_LABEL[g]}</b><span className="mono">{fmt(w)} W</span><span className="xs">{to}</span>
        {rows.some((r) => r.key.startsWith('op:')) && <span className="xs mono">{rows.filter((r) => r.key.startsWith('op:')).length} opening(s)</span>}
      </button>
    );
  };

  const cv = res.heat.rooms.find((q) => q.id === sel);
  const tabs: Array<['faces' | 'details' | 'openings', string]> = [['faces', 'Faces'], ['details', 'Room & outline'], ['openings', 'Windows & doors']];

  return (
    <>
      <Crumbs items={[[house.name || 'House', href('results')], [house.storeys[room.storey]?.name ?? 'Storey', href('plan', room.id)], [room.name, null], [tab === 'faces' ? GROUP_LABEL[group] : tabs.find((t) => t[0] === tab)![1], null]]}
        end={<><a href={href('room', prev.id)}>‹ {prev.name}</a><span>·</span><a href={href('room', next.id)}>{next.name} ›</a></>} />
      <div className="page-title">
        <div><div className="eyebrow">{house.storeys[room.storey]?.name} · {room.type}</div><h1>{room.name}</h1></div>
        <div className="seg" role="tablist" aria-label="Room view">
          {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="eb">{room.heated ? 'Heat loss' : 'Settles at'}</span><span className="v">{room.heated ? fmt(rr.totalW) : fmt(rr.T, 1)} <span className="small muted">{room.heated ? 'W' : '°C'}</span></span><span className="small muted">{room.heated ? `${fmt(rr.perM2)} W/m² · design day` : 'unheated room'}</span></div>
        <div className="kpi"><span className="eb">Size</span><span className="v">{fmt(rr.area, 1)} <span className="small muted">m²</span></span><span className="small muted">{fmt(rr.V, 1)} m³</span></div>
        <div className="kpi"><span className="eb">Ventilation</span><span className="v">{fmt(rr.n, 2)} <span className="small muted">ach</span></span><span className="small muted">{fmt(rr.ventW)} W</span></div>
        <div className="kpi"><span className="eb">Emitter cover</span><span className="v">{cv && cv.has ? `${fmt(cv.cover * 100)}%` : '—'}</span><span className="small muted">{cv ? (cv.has ? 'of the loss' : 'no emitter') : 'unheated'}</span></div>
      </div>

      {tab === 'faces' && (
        <div className="plan-split">
          <div className="plan-main">
            <Card title="Faces unfolded around the floor" note="Each face is one element with its own build-up and boundary. Click a face to inspect it."
              right={<button type="button" className="btn-link" onClick={() => setTab('details')}>Shape: {room.shape ? 'sloping' : 'flat ceiling'} · change ›</button>}>
              <div className="box-wrap">
                <div className="box">
                  <span />{face('N')}<span />
                  {face('W')}{face('floor')}{face('E')}
                  <span />{face('S')}<span />
                </div>
                <div className="stack-10">
                  {face('ceiling', { width: 180, minHeight: 72 })}
                  <span className="eb">Faces colour</span>
                  <div className="row-between" style={{ gap: 6, alignItems: 'center' }}><span className="mono small">0 W</span><span aria-hidden="true" style={{ width: 120, height: 10, border: '1px solid var(--ink)', background: 'linear-gradient(90deg,#fffefb,#e9965f)' }} /><span className="mono small">{fmt(maxW)} W</span></div>
                </div>
              </div>
              <div className="h-table-wrap">
                <table className="h-table">
                  <thead><tr><th>Face</th><th>To</th><th>Build-up</th><th className="n">m²</th><th className="n">U</th><th className="n">ΔT</th><th className="n">W</th></tr></thead>
                  <tbody>
                    {rr.rows.map((row) => {
                      const face = rr.faces.find((f) => f.key === row.key);
                      const isOp = row.key.startsWith('op:');
                      return (
                        <tr key={row.key} className={row.kind === 'vent' ? 'vent' : ''}>
                          <td>{row.label}</td>
                          <td>
                            {row.canParty ? (
                              <select className="h-sel" value={row.party ? 'party' : 'out'} aria-label={`${row.label} boundary`}
                                onChange={(e) => upd((h) => { if (e.target.value === 'party') h.faceBoundary[row.key] = 'party'; else delete h.faceBoundary[row.key]; })}>
                                <option value="out">outside</option><option value="party">neighbour ({house.neighbourT} °C)</option>
                              </select>
                            ) : row.to}
                          </td>
                          <td>
                            {face && !isOp ? (
                              <select className="h-sel" value={face.buildup.id} aria-label={`${row.label} build-up`}
                                onChange={(e) => upd((h) => { h.faceBuildup[row.key] = e.target.value; })}>
                                {bOpts(fits(face.kind)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            ) : row.buildup}
                          </td>
                          <td className="n mono">{row.kind === 'vent' ? '—' : fmt(row.area, 1)}</td>
                          <td className="n mono">{row.kind === 'vent' ? '—' : fmt(row.U, 2)}</td>
                          <td className="n mono">{fmt(row.dT, 1)}</td>
                          <td className="n mono">{fmt(row.W)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {room.heated && <tfoot><tr><td colSpan={6}>Total</td><td className="n mono">{fmt(rr.totalW)}</td></tr></tfoot>}
                </table>
              </div>
            </Card>
          </div>
          <div className="plan-side">
            <Card title="Room air over the design day" note={`${fmt(res.Tout, 1)} °C outside; the heat pump follows the living and bedroom schedules.`}>
              {(() => {
                const i = day.rooms.findIndex((r) => r.id === sel), T = i >= 0 ? day.T[i] : null;
                if (!T) return <p className="small muted">Not simulated.</p>;
                const hrs = Math.min(24, T.length), vals = Array.from(T.slice(0, hrs)), out = Array.from(day.out.slice(0, hrs));
                const lo = Math.floor(Math.min(...vals, ...out, room.setpoint) - 1), hi = Math.ceil(Math.max(...vals, room.setpoint) + 1);
                const X = (h: number) => (h / (hrs - 1)) * 100, Y = (t: number) => 100 - ((t - lo) / (hi - lo)) * 100;
                const pts = (a: number[]) => a.map((t, h) => `${X(h)},${Y(t)}`).join(' ');
                return (
                  <>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div className="mono small muted" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 130 }}><span>{hi}</span><span>{lo}</span></div>
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${room.name} air temperature between ${fmt(Math.min(...vals), 1)} and ${fmt(Math.max(...vals), 1)} °C`} style={{ flex: 1, height: 130, borderLeft: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
                        {room.heated && <line x1="0" x2="100" y1={Y(room.setpoint)} y2={Y(room.setpoint)} stroke="#55626e" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                        <polyline points={pts(out)} fill="none" stroke="#1f6fb5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                        <polyline points={pts(vals)} fill="none" stroke="#c2410c" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                      </svg>
                    </div>
                    <div className="mono small muted" style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 24 }}><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
                    <p className="small"><span style={{ color: '#c2410c' }}>■</span> Room air {fmt(Math.min(...vals), 1)}–{fmt(Math.max(...vals), 1)} °C · <span style={{ color: '#1f6fb5' }}>■</span> Outside · dashed: setpoint</p>
                  </>
                );
              })()}
            </Card>
            <Card title={`Selected · ${GROUP_LABEL[group]}`} note={here.length ? `${here.length} element${here.length > 1 ? 's' : ''} · ${fmt(wIn(group))} W` : 'Nothing on this face.'}>
              {here.length === 0 && <p className="small muted">No wall, opening or floor on this side.</p>}
              {here.map((row) => {
                const f = faceOf.get(row.key)!;
                const isOp = row.key.startsWith('op:');
                const b = f.buildup;
                return (
                  <div key={row.key} className="stack-10" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                    <div className="row-between"><b>{row.label}</b><span className="mono small">U {fmt(row.U, 2)} · {fmt(row.W)} W</span></div>
                    <span className="small muted">{fmt(row.area, 1)} m² to {row.to} · ΔT {fmt(row.dT, 1)} K</span>
                    {!isOp && (
                      <label className="hf"><span className="eyebrow">Build-up</span>
                        <select className="select" value={b.id} onChange={(e) => upd((h) => { h.faceBuildup[row.key] = e.target.value; })}>
                          {bOpts(fits(f.kind)).map((x) => <option key={x.id} value={x.id}>{x.name} (U {fmt(buildupU(x), 2)})</option>)}
                        </select>
                      </label>
                    )}
                    {isOp && <span className="small">{b.name}</span>}
                    {b.layers.length > 0 && (
                      <div className="layer-strip" role="img" aria-label={`${b.name} layers`}>{b.layers.map(([m, t], i) => <span key={i} title={`${MAT[m]?.name ?? m} ${t} mm`} style={{ flex: `${t} 1 0`, background: layerColour(m) }} />)}</div>
                    )}
                    {row.canParty && (
                      <label className="hf"><span className="eyebrow">Boundary</span>
                        <select className="select" value={row.party ? 'party' : 'out'} onChange={(e) => upd((h) => { if (e.target.value === 'party') h.faceBoundary[row.key] = 'party'; else delete h.faceBoundary[row.key]; })}>
                          <option value="out">outside</option><option value="party">neighbour ({house.neighbourT} °C)</option>
                        </select>
                      </label>
                    )}
                    <div className="chips">
                      <a className="btn-secondary as-btn" href={href('buildups', b.id)}>Edit in library ›</a>
                      {b.layers.length > 0 && <a className="btn-primary as-btn" href={href('wall', b.id)}>Simulate this face ›</a>}
                    </div>
                  </div>
                );
              })}
              <button type="button" className="btn-secondary" onClick={() => setTab('openings')}>Windows &amp; doors on this room ›</button>
            </Card>
          </div>
        </div>
      )}

      {tab === 'details' && (
        <Card title="Room & outline" right={<button type="button" className="btn-danger" onClick={delRoom}>Delete room</button>}>
              <div className="hf-row">
                <label className="hf"><span className="eyebrow">Name</span><input className="h-text" value={room.name} onChange={(e) => setRoom({ name: e.target.value })} /></label>
                <label className="hf"><span className="eyebrow">Type</span>
                  <select className="select" value={room.type} onChange={(e) => { const type = e.target.value as RoomType; setRoom({ type, setpoint: defaultTemp(house, type) }); }}>
                    {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="hf"><span className="eyebrow">Heated</span>
                  <select className="select" value={room.heated ? 'y' : 'n'} onChange={(e) => setRoom({ heated: e.target.value === 'y' })}>
                    <option value="y">Heated</option><option value="n">Unheated</option>
                  </select>
                </label>
                {room.heated
                  ? <Num label="Setpoint" unit="°C" value={room.setpoint} step={0.5} onChange={(v) => setRoom({ setpoint: v })} />
                  : <Num label="Air changes" unit="ach" value={room.ach} step={0.1} min={0} onChange={(v) => setRoom({ ach: v })} />}
              </div>
              {room.heated && room.setpoint !== defaultTemp(house, room.type) && <p className="small muted">Default for a {room.type} in this house: {defaultTemp(house, room.type)} °C (Room temperatures card).</p>}
              <div className="hf-row">
                <Num label="x (from west)" unit="m" value={room.x} onChange={(v) => upd((h) => { const r = h.rooms.find((x) => x.id === sel)!; if (r.poly) setOutline(r, r.poly.map(([x, y]) => [x + v - r.x, y])); else r.x = v; })} />
                <Num label="y (from north)" unit="m" value={room.y} onChange={(v) => upd((h) => { const r = h.rooms.find((x) => x.id === sel)!; if (r.poly) setOutline(r, r.poly.map(([x, y]) => [x, y + v - r.y])); else r.y = v; })} />
                {!room.poly && <>
                  <Num label="Width (E–W)" unit="m" value={room.w} min={0.1} onChange={(v) => setRoom({ w: v })} />
                  <Num label="Depth (N–S)" unit="m" value={room.d} min={0.1} onChange={(v) => setRoom({ d: v })} />
                </>}
                <label className="hf"><span className="eyebrow">Storey</span>
                  <select className="select" value={room.storey} onChange={(e) => setRoom({ storey: Number(e.target.value) })}>
                    {house.storeys.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                  </select>
                </label>
                <label className="hf"><span className="eyebrow">Rises through</span>
                  <select className="select" value={room.span} onChange={(e) => setRoom({ span: Number(e.target.value) })}>
                    {house.storeys.map((_, i) => <option key={i} value={i + 1}>{i + 1} storey{i ? 's' : ''}</option>)}
                  </select>
                </label>
              </div>

              <div className="outline-ed">
                <div className="row-between">
                  <span className="eyebrow">Outline</span>
                  {room.poly
                    ? <span className="chips">
                        <label className="small"><input type="checkbox" checked={outlineMode} onChange={(e) => setOutlineMode(e.target.checked)} /> Corner handles on the plan</label>
                        <button type="button" className="btn-link" onClick={() => upd((h) => {
                          const r = h.rooms.find((x) => x.id === sel)!;
                          if (r.shape?.edges) r.shape = edgesToRectShape(r.shape);
                          if (!r.shape) delete r.shape;
                          setOutline(r, null); h.openings.forEach((o) => { if (o.room === r.id) delete o.edge; });
                        })}>Back to a rectangle</button>
                      </span>
                    : <button type="button" className="btn-secondary" onClick={() => upd((h) => {
                        const r = h.rooms.find((x) => x.id === sel)!;
                        if (r.shape && !r.shape.edges) r.shape = { ...r.shape, edges: rectShapeToEdges(r.shape) };
                        setOutline(r, roomPoly(r));
                        // A rectangle's walls N, E, S, W become walls 1–4: keep each window on its wall.
                        h.openings.forEach((o) => { if (o.room === r.id) o.edge = ['N', 'E', 'S', 'W'].indexOf(o.side); });
                      })}>Make any shape</button>}
                </div>
                {room.poly && <>
                  <p className="small muted">Drag a corner on the plan, or click + on a wall to add one. Corners snap to 5 cm. {fmt(roomArea(room), 2)} m².</p>
                  <div className="vx-table">
                    {room.poly.map(([x, y], i) => (
                      <span key={i} className="vx-row small">
                        <b>{i + 1}</b>
                        <input type="number" className="thk-input" step={0.05} value={x} aria-label={`Corner ${i + 1} x`} onChange={(e) => upd((h) => { const r = h.rooms.find((q) => q.id === sel)!; setOutline(r, r.poly!.map((p, j) => (j === i ? [Number(e.target.value) || 0, p[1]] : p))); })} />
                        <input type="number" className="thk-input" step={0.05} value={y} aria-label={`Corner ${i + 1} y`} onChange={(e) => upd((h) => { const r = h.rooms.find((q) => q.id === sel)!; setOutline(r, r.poly!.map((p, j) => (j === i ? [p[0], Number(e.target.value) || 0] : p))); })} />
                        <button type="button" className="btn-link inline" disabled={room.poly!.length <= 3} onClick={() => upd((h) => {
                          const r = h.rooms.find((q) => q.id === sel)!;
                          if (r.shape?.edges) r.shape.edges.splice(i, 1);
                          setOutline(r, r.poly!.filter((_, j) => j !== i));
                          h.openings.forEach((o) => { if (o.room === r.id && o.edge != null && o.edge >= i) o.edge = Math.max(0, o.edge - 1); });
                        })}>remove</button>
                      </span>
                    ))}
                  </div>
                </>}
              </div>
              {room.storey + room.span === house.storeys.length && (
                <RoomShapeEditor room={room} setShape={(s) => upd((h) => { const r = h.rooms.find((x) => x.id === room.id); if (r) { if (s) r.shape = s; else delete r.shape; } })}
                  outside={roomEdges(room).map((e) => rr.faces.some((f) => f.key.startsWith(`w:${room.id}:${e.id}:`) && f.to.k !== 'room'))} />
              )}
        </Card>
      )}

      {tab === 'openings' && (
        <Card title="Windows & doors" note="Each opening sits on one wall of the room and is taken off that wall's area.">
              <div className="eyebrow">Windows and doors</div>
              {house.openings.filter((o) => o.room === room.id).map((o) => {
                const set = (patch: Partial<typeof o>) => upd((h) => { const x = h.openings.find((y) => y.id === o.id); if (x) Object.assign(x, patch); });
                return (
                  <div key={o.id} className="hf-row op-row">
                    <label className="hf"><span className="eyebrow">Name</span><input className="h-text" value={o.name} onChange={(e) => set({ name: e.target.value })} /></label>
                    {room.poly ? (
                      <label className="hf"><span className="eyebrow">Wall</span>
                        <select className="select" value={o.edge ?? roomEdges(room).findIndex((x) => x.side === o.side)} onChange={(e) => { const i = Number(e.target.value); set({ edge: i, side: roomEdges(room)[i].side }); }}>
                          {roomEdges(room).map((x) => <option key={x.idx} value={x.idx}>Wall {x.idx + 1} ({bearingLabel(trueBearing(house, x.az))}, {fmt(x.len, 2)} m)</option>)}
                        </select>
                      </label>
                    ) : (
                      <label className="hf"><span className="eyebrow">Side</span>
                        <select className="select" value={o.side} onChange={(e) => set({ side: e.target.value as Side })}>{SIDES.map((s, i) => <option key={s} value={s}>{house.north ? `${['Top', 'Right', 'Bottom', 'Left'][i]} wall, faces ${bearingLabel(trueBearing(house, i * 90))}` : s}</option>)}</select>
                      </label>
                    )}
                    <Num label="Width" unit="m" value={o.w} min={0.1} onChange={(v) => set({ w: v })} />
                    <Num label="Height" unit="m" value={o.h} min={0.1} onChange={(v) => set({ h: v })} />
                    <label className="hf"><span className="eyebrow">Type</span>
                      <select className="select" value={o.buildup} onChange={(e) => set({ buildup: e.target.value })}>
                        {bOpts(['glazing', 'door']).map((b) => <option key={b.id} value={b.id}>{b.name} (U {fmt(buildupU(b), 2)})</option>)}
                      </select>
                    </label>
                    {house.buildups.find((b) => b.id === o.buildup)?.kind === 'glazing' && (
                      <label className="hf"><span className="eyebrow">Shading</span>
                        <select className="select" value={o.shade ?? 'none'} onChange={(e) => set({ shade: e.target.value })}>
                          {Object.entries(SHADING).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </label>
                    )}
                    <button type="button" className="btn-link" onClick={() => upd((h) => { h.openings = h.openings.filter((x) => x.id !== o.id); })}>Remove</button>
                  </div>
                );
              })}
              <p><button type="button" className="btn-secondary" onClick={() => upd((h) => {
                h.openings.push({ id: uid('o'), room: room.id, side: 'N', name: 'Window', w: 1.2, h: 1.2, buildup: bOpts(['glazing'])[0]?.id ?? h.buildups[0].id });
              })}>Add window or door</button></p>
        </Card>
      )}
    </>
  );
}
