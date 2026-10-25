import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { MONTHS } from '../engine/data';
import { BUILTIN_STACKUPS } from '../engine/library';
import type { Stackup } from '../engine/library';
import { MCS_MEAN_TEMPS, MCS_STATIONS, ROOM_TEMPS } from '../engine/climate-mcs';
import { GLAZING_LIBRARY, SHADING, SIDES, buildupU, calcHouse, deviceM3, onStorey } from '../engine/house';
import type { Buildup, BuildupKind, DefaultKey, House, Room, RoomType, Side } from '../engine/house';
import { Chip } from './controls';
import { RoomShapeEditor } from './HouseShape';
import { StackupModal } from './StackupModal';
import type { StackupDraft } from './StackupModal';
import './house.css';

const fmt = (v: number, d = 0) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const ROOM_TYPES = Object.keys(ROOM_TEMPS) as RoomType[];
const KIND_LABEL: Record<BuildupKind, string> = { wall: 'Wall', floor: 'Floor', roof: 'Roof / ceiling', glazing: 'Glazing', door: 'Door' };
const DEFAULT_LABEL: Record<DefaultKey, [string, BuildupKind[]]> = {
  extWall: ['Outside walls', ['wall']], intWall: ['Internal walls', ['wall']], groundFloor: ['Ground floors', ['floor']], intFloor: ['Floors between storeys', ['floor']],
  loftCeiling: ['Ceilings to loft', ['roof', 'floor']], loftRoof: ['Loft roof', ['roof']], flatRoof: ['Flat roofs', ['roof']], exposedFloor: ['Exposed floors', ['floor']],
  slope: ['Sloping ceilings', ['roof']], knee: ['Knee walls', ['wall']], dormerWall: ['Dormer fronts & cheeks', ['wall']], dormerRoof: ['Dormer roofs', ['roof']],
};
/** Which build-up kinds fit a face. */
const fits = (faceKind: string): BuildupKind[] => (faceKind === 'wall' ? ['wall'] : faceKind === 'window' || faceKind === 'door' ? ['glazing', 'door'] : ['floor', 'roof']);
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function Num({ value, onChange, step = 0.1, min, max, label, unit }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string; unit?: string }) {
  return (
    <label className="hf">
      <span className="eyebrow">{label}</span>
      <span className="hf-in">
        <input type="number" className="thk-input" value={Number.isFinite(value) ? +value.toFixed(3) : ''} step={step} min={min} max={max}
          onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(v); }} />
        {unit && <span className="small muted">{unit}</span>}
      </span>
    </label>
  );
}

function Card({ title, note, children, right }: { title: string; note?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card panel">
      <div className="section-head">
        <div><h2>{title}</h2>{note && <p className="muted small">{note}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

const mix = (a: number[], b: number[], f: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, f)))).join(',')})`;

export function HousePage({ house, setHouse, customStackups }: { house: House; setHouse: (fn: (h: House) => House) => void; customStackups: Stackup[] }) {
  const upd = (fn: (h: House) => void) => setHouse((prev) => { const n = structuredClone(prev); fn(n); return n; });
  const res = useMemo(() => calcHouse(house), [house]);

  const [storey, setStorey] = useState(0);
  const [sel, setSel] = useState<string>(house.rooms[0]?.id ?? '');
  const [lens, setLens] = useState<'loss' | 'temp' | 'cover' | 'none'>('loss');
  const [editing, setEditing] = useState<string | null>(null);
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);

  const room = house.rooms.find((r) => r.id === sel);
  const rr = res.rooms.find((r) => r.room.id === sel);
  const setRoom = (patch: Partial<Room>) => upd((h) => { const r = h.rooms.find((x) => x.id === sel); if (r) Object.assign(r, patch); });
  const nameOf = (id: string) => house.rooms.find((r) => r.id === id)?.name ?? id;

  // Plan geometry, shared by all storeys so they line up.
  const S = 48, PAD = 34;
  const maxX = Math.max(1, ...house.rooms.map((r) => r.x + r.w)), maxY = Math.max(1, ...house.rooms.map((r) => r.y + r.d));
  const onThis = house.rooms.filter((r) => onStorey(r, storey));

  const addRoom = () => {
    const id = uid('r');
    upd((h) => { h.rooms.push({ id, name: 'New room', type: 'other', storey, span: 1, x: maxX, y: 0, w: 3, d: 3, heated: true, setpoint: 21, ach: 1 }); });
    setSel(id);
  };
  const delRoom = () => {
    upd((h) => {
      h.rooms = h.rooms.filter((r) => r.id !== sel);
      h.openings = h.openings.filter((o) => o.room !== sel);
      h.vent.devices = h.vent.devices.filter((d) => d.room !== sel);
      h.heating.emitters = h.heating.emitters.filter((e) => e.room !== sel);
    });
    setSel(house.rooms.find((r) => r.id !== sel)?.id ?? '');
  };

  const applyLayers = (id: string) => (draft: StackupDraft) => {
    upd((h) => { const b = h.buildups.find((x) => x.id === id); if (b) { b.layers = draft.layers; if (draft.name.trim()) b.name = draft.name.trim(); } });
    setEditing(null);
  };
  const editB = house.buildups.find((b) => b.id === editing);
  const bOpts = (kinds: BuildupKind[]) => house.buildups.filter((b) => kinds.includes(b.kind));

  const peakKW = res.peakW / 1000;
  const tiles: Array<[string, string, string, string]> = [
    ['Design heat loss', fmt(peakKW, 2), 'kW', `Heated rooms at ${res.Tout} °C outside`],
    ['Per floor area', fmt(res.heatedA ? res.peakW / res.heatedA : 0), 'W/m²', `${fmt(res.heatedA, 1)} m² heated`],
    ['Heat loss parameter', fmt(res.hlp, 2), 'W/m²K', `HTC ${fmt(res.htc)} W/K`],
    ['Space heating', fmt(Math.round(res.annualKWh / 100) * 100), 'kWh/yr', `${fmt(res.hdd)} degree days`],
    ['Heat pump', `${res.hp.spare >= 0 ? '+' : ''}${fmt(res.hp.spare * 100)}`, '% spare', `${house.hp.capacity} kW · SCOP ${fmt(res.hp.scop, 1)}`],
    ['Running cost', `£${fmt(res.hp.costHP)}`, '/yr', `Gas boiler £${fmt(res.hp.costGas)} incl. standing charge`],
  ];

  const maxPath = Math.max(1, ...res.paths.map((p) => p.W));

  return (
    <div className="house">
      <p className="muted small">Design-day heat loss room by room (MCS / CIBSE method). Rooms are rectangles on each storey; walls, floors and ceilings are found from how they touch.</p>

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

      <div className="house-grid">
        <div className="house-col">
          <Card title="Plan" note="Click a room to edit it. North is up. Blue marks are windows, brown are doors."
            right={<div className="chips">{house.storeys.map((s, i) => <Chip key={i} on={storey === i} onClick={() => setStorey(i)}>{s.name}</Chip>)}</div>}>
            <div className="chips" role="group" aria-label="Colour rooms by">
              <Chip on={lens === 'loss'} onClick={() => setLens('loss')}>Heat loss W/m²</Chip>
              <Chip on={lens === 'temp'} onClick={() => setLens('temp')}>Temperature</Chip>
              <Chip on={lens === 'cover'} onClick={() => setLens('cover')}>Emitter cover</Chip>
              <Chip on={lens === 'none'} onClick={() => setLens('none')}>None</Chip>
            </div>
            <svg className="plan" viewBox={`0 0 ${maxX * S + PAD * 2} ${maxY * S + PAD * 2}`} role="img" aria-label={`${house.storeys[storey]?.name} plan`}>
              <text x={PAD + (maxX * S) / 2} y={18} textAnchor="middle" className="plan-n">N</text>
              {onThis.map((r) => {
                const x = res.rooms.find((q) => q.room.id === r.id)!;
                const cv = res.heat.rooms.find((q) => q.id === r.id);
                const fill = lens === 'none' ? '#fff' : lens === 'loss' ? (r.heated ? mix([247, 239, 225], [233, 150, 95], (x.perM2 - 20) / 70) : '#eceff1')
                  : lens === 'cover' ? (!cv ? '#eceff1' : !cv.has || cv.cover < 0.995 ? '#f3c9a2' : '#dcebdf')
                  : mix([143, 179, 227], [247, 239, 225], (x.T - 5) / 16);
                const label = lens === 'temp' ? `${fmt(x.T, 1)} °C` : lens === 'cover' ? (!cv ? 'unheated' : cv.has ? `${fmt(cv.cover * 100)}% cover` : 'no emitter')
                  : r.heated ? `${fmt(x.totalW)} W` : `unheated ${fmt(x.T, 1)} °C`;
                const X = PAD + r.x * S, Y = PAD + r.y * S;
                return (
                  <g key={r.id} onClick={() => setSel(r.id)} className="plan-room">
                    <rect x={X} y={Y} width={r.w * S} height={r.d * S} fill={fill} stroke="#14212b" strokeWidth={1.5} />
                    <text x={X + (r.w * S) / 2} y={Y + (r.d * S) / 2 - 4} textAnchor="middle" className="plan-t">{r.name}</text>
                    <text x={X + (r.w * S) / 2} y={Y + (r.d * S) / 2 + 12} textAnchor="middle" className="plan-s">{label}</text>
                    {r.span > 1 && storey > r.storey && <text x={X + (r.w * S) / 2} y={Y + (r.d * S) / 2 + 26} textAnchor="middle" className="plan-s">(open to below)</text>}
                  </g>
                );
              })}
              {onThis.filter((r) => r.storey === storey).flatMap((r) => SIDES.flatMap((side) => {
                const ops = house.openings.filter((o) => o.room === r.id && o.side === side);
                const hz = side === 'N' || side === 'S', L = (hz ? r.w : r.d) * S;
                return ops.map((o, i) => {
                  const len = Math.min(L / ops.length - 6, o.w * S), c = (L * (i + 0.5)) / ops.length;
                  const X = PAD + r.x * S + (side === 'E' ? r.w * S : 0), Y = PAD + r.y * S + (side === 'S' ? r.d * S : 0);
                  const door = house.buildups.find((b) => b.id === o.buildup)?.kind === 'door';
                  return hz
                    ? <line key={o.id} x1={X + c - len / 2} x2={X + c + len / 2} y1={Y} y2={Y} className={door ? 'plan-door' : 'plan-win'} />
                    : <line key={o.id} y1={Y + c - len / 2} y2={Y + c + len / 2} x1={X} x2={X} className={door ? 'plan-door' : 'plan-win'} />;
                });
              }))}
              {onThis.filter((r) => r.id === sel).map((r) => (
                <rect key="sel" x={PAD + r.x * S} y={PAD + r.y * S} width={r.w * S} height={r.d * S} fill="none" stroke="#c2410c" strokeWidth={3} pointerEvents="none" />
              ))}
            </svg>
            <div className="row-between">
              <button type="button" className="btn-secondary" onClick={addRoom}>Add room on this storey</button>
              <span className="small muted mono">{fmt(maxX, 1)} × {fmt(maxY, 1)} m</span>
            </div>
          </Card>

          {room && rr && (
            <Card title={room.name} note={`${fmt(rr.area, 1)} m² · ${fmt(rr.V, 1)} m³ · ${room.heated ? `${fmt(rr.totalW)} W (${fmt(rr.perM2)} W/m²)` : `settles at ${fmt(rr.T, 1)} °C`}`}
              right={<button type="button" className="btn-danger" onClick={delRoom}>Delete room</button>}>
              <div className="hf-row">
                <label className="hf"><span className="eyebrow">Name</span><input className="h-text" value={room.name} onChange={(e) => setRoom({ name: e.target.value })} /></label>
                <label className="hf"><span className="eyebrow">Type</span>
                  <select className="select" value={room.type} onChange={(e) => setRoom({ type: e.target.value as RoomType })}>
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
              {room.heated && <p className="small muted">MCS / CIBSE default for this type: {ROOM_TEMPS[room.type][0]} °C (age bands A–J), {ROOM_TEMPS[room.type][1]} °C (K onwards).</p>}
              <div className="hf-row">
                <Num label="x (from west)" unit="m" value={room.x} onChange={(v) => setRoom({ x: v })} />
                <Num label="y (from north)" unit="m" value={room.y} onChange={(v) => setRoom({ y: v })} />
                <Num label="Width (E–W)" unit="m" value={room.w} min={0.1} onChange={(v) => setRoom({ w: v })} />
                <Num label="Depth (N–S)" unit="m" value={room.d} min={0.1} onChange={(v) => setRoom({ d: v })} />
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

              {room.storey + room.span === house.storeys.length && (
                <RoomShapeEditor room={room} setShape={(s) => upd((h) => { const r = h.rooms.find((x) => x.id === room.id); if (r) { if (s) r.shape = s; else delete r.shape; } })} />
              )}

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

              <div className="eyebrow">Windows and doors</div>
              {house.openings.filter((o) => o.room === room.id).map((o) => {
                const set = (patch: Partial<typeof o>) => upd((h) => { const x = h.openings.find((y) => y.id === o.id); if (x) Object.assign(x, patch); });
                return (
                  <div key={o.id} className="hf-row op-row">
                    <label className="hf"><span className="eyebrow">Name</span><input className="h-text" value={o.name} onChange={(e) => set({ name: e.target.value })} /></label>
                    <label className="hf"><span className="eyebrow">Side</span>
                      <select className="select" value={o.side} onChange={(e) => set({ side: e.target.value as Side })}>{SIDES.map((s) => <option key={s}>{s}</option>)}</select>
                    </label>
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
        </div>

        <div className="house-col">
          <Card title="Where the heat goes" note={`Whole house, design day: ${res.Tout} °C outside, ground ${res.Tg} °C.`}>
            <div className="paths">
              {res.paths.map((p) => (
                <div key={p.label} className="path">
                  <span className="small">{p.label}</span>
                  <span className="path-bar"><span style={{ width: `${Math.max(0, (p.W / maxPath) * 100)}%` }} className={p.label === 'Ventilation' ? 'v' : ''} /></span>
                  <span className="mono small n">{fmt(p.W)} W</span>
                </div>
              ))}
            </div>
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th>Room</th><th className="n">°C</th><th className="n">ach</th><th className="n">Fabric W</th><th className="n">Vent W</th><th className="n">Total W</th><th className="n">W/m²</th></tr></thead>
                <tbody>
                  {res.rooms.map((x) => (
                    <tr key={x.room.id} className={x.room.id === sel ? 'on' : ''} onClick={() => { setSel(x.room.id); setStorey(x.room.storey); }}>
                      <td>{x.room.name}{x.room.heated ? '' : ' (unheated)'}</td>
                      <td className="n mono">{fmt(x.T, 1)}</td>
                      <td className="n mono">{fmt(x.n, 2)}</td>
                      <td className="n mono">{x.room.heated ? fmt(x.fabricW) : '—'}</td>
                      <td className="n mono">{x.room.heated ? fmt(x.ventW) : '—'}</td>
                      <td className="n mono">{x.room.heated ? fmt(x.totalW) : '—'}</td>
                      <td className="n mono">{x.room.heated ? fmt(x.perM2) : '—'}</td>
                    </tr>
                  ))}
                  {res.loft && <tr><td>Loft (unheated)</td><td className="n mono">{fmt(res.loft.T, 1)}</td><td className="n mono">{fmt(house.loft.ach, 1)}</td><td colSpan={4} className="muted small">{fmt(res.loft.area, 1)} m² over the top storey</td></tr>}
                </tbody>
                <tfoot><tr><td colSpan={5}>Heated rooms</td><td className="n mono">{fmt(res.peakW)}</td><td /></tr></tfoot>
              </table>
            </div>
          </Card>

          <Card title="Climate" note="MCS design conditions: nearest weather station, altitude, postcode area for degree days.">
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Weather station</span>
                <select className="select" value={house.climate.station} onChange={(e) => upd((h) => { h.climate.station = Number(e.target.value); })}>
                  {MCS_STATIONS.map((s, i) => <option key={i} value={i}>{s[0]} ({s[1]}, {s[4]} m)</option>)}
                </select>
              </label>
              <label className="hf"><span className="eyebrow">Percentile</span>
                <select className="select" value={house.climate.pct} onChange={(e) => upd((h) => { h.climate.pct = e.target.value as '99.6' | '99'; })}>
                  <option value="99.6">99.6% (default)</option><option value="99">99%</option>
                </select>
              </label>
              <Num label="Altitude" unit="m" step={10} value={house.climate.altitude} onChange={(v) => upd((h) => { h.climate.altitude = v; })} />
              <label className="hf"><span className="eyebrow">Postcode</span><input className="h-text short" value={house.climate.postcode} onChange={(e) => upd((h) => { h.climate.postcode = e.target.value; })} /></label>
              <label className="hf"><span className="eyebrow">Region (ground temperature)</span>
                <select className="select" value={house.climate.region} onChange={(e) => upd((h) => { h.climate.region = Number(e.target.value); })}>
                  {MCS_MEAN_TEMPS.map((s, i) => <option key={i} value={i}>{s[0]} ({s[4]} °C)</option>)}
                </select>
              </label>
              <Num label="Neighbour (party walls)" unit="°C" step={0.5} value={house.neighbourT} onChange={(v) => upd((h) => { h.neighbourT = v; })} />
            </div>
            <p className="small muted mono">Design outside {res.Tout} °C · ground {res.Tg} °C · {fmt(res.hdd)} degree days{res.hddKnown ? '' : ' (default)'}</p>
          </Card>

          <Card title="Ventilation and airtightness" note={`q50 ${fmt(res.q50, 1)} m³/h·m² · n50 ${fmt(res.n50, 1)} ach · envelope ${fmt(res.envelope)} m² · ${fmt(res.heatedV)} m³ heated`}>
            <div className="chips">
              <Chip on={house.vent.method === 'model'} onClick={() => upd((h) => { h.vent.method = 'model'; })}>Whole-house model (airtightness)</Chip>
              <Chip on={house.vent.method === 'cibse'} onClick={() => upd((h) => { h.vent.method = 'cibse'; })}>Room-type rates (CIBSE, pre-2000)</Chip>
            </div>
            <label className="small"><input type="checkbox" checked={house.vent.minAch} onChange={(e) => upd((h) => { h.vent.minAch = e.target.checked; })} /> Apply the MCS minimum of 0.5 ach in habitable rooms</label>
            {house.vent.method === 'model' && <>
              <div className="chips">
                <Chip on={house.vent.source === 'est'} onClick={() => upd((h) => { h.vent.source = 'est'; })}>Estimate q50</Chip>
                <Chip on={house.vent.source === 'meas'} onClick={() => upd((h) => { h.vent.source = 'meas'; })}>Measured (blower test)</Chip>
              </div>
              {house.vent.source === 'meas'
                ? <Num label="Measured q50" unit="m³/h·m²" value={house.vent.q50} min={0} onChange={(v) => upd((h) => { h.vent.q50 = v; })} />
                : house.vent.factors.map((f) => (
                  <label key={f.id} className="small h-check">
                    <input type="checkbox" checked={f.on} onChange={(e) => upd((h) => { const x = h.vent.factors.find((y) => y.id === f.id); if (x) x.on = e.target.checked; })} />
                    <span>{f.label}</span><span className="mono">{f.dq > 0 ? '+' : ''}{f.dq}</span>
                  </label>
                ))}
              <div className="eyebrow">Chimneys, fans and doors (SAP 10.2 allowances)</div>
              {house.vent.devices.map((d) => (
                <div key={d.id} className="h-dev">
                  <span className="small">{d.name} · {nameOf(d.room)}</span>
                  <select className="h-sel" value={d.pick} aria-label={d.name} onChange={(e) => upd((h) => { const x = h.vent.devices.find((y) => y.id === d.id); if (x) x.pick = Number(e.target.value); })}>
                    {d.opts.map((o, i) => <option key={i} value={i}>{o[0]}</option>)}
                  </select>
                  <span className="mono small n">{house.vent.mech !== 'none' && d.fan ? 'replaced' : `${deviceM3(d)} m³/h`}</span>
                </div>
              ))}
              <div className="chips">
                {(['none', 'dmev', 'mvhr'] as const).map((m) => <Chip key={m} on={house.vent.mech === m} onClick={() => upd((h) => { h.vent.mech = m; })}>{{ none: 'Natural only', dmev: 'Continuous extract', mvhr: 'MVHR' }[m]}</Chip>)}
              </div>
              {house.vent.mech !== 'none' && (
                <div className="hf-row">
                  <Num label="Whole-house flow" unit="m³/h" step={5} value={house.vent.mechFlow} onChange={(v) => upd((h) => { h.vent.mechFlow = v; })} />
                  {house.vent.mech === 'mvhr' && <Num label="Heat recovery" unit="%" step={1} min={0} max={95} value={house.vent.eta} onChange={(v) => upd((h) => { h.vent.eta = v; })} />}
                </div>
              )}
            </>}
          </Card>

          <Card title="Storeys and ground" note="Ceiling heights, the floor zone between storeys, and what the ground floor sits on.">
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th>Storey</th><th className="n">Ceiling m</th><th className="n">Floor zone above m</th><th className="n">Below ground m</th></tr></thead>
                <tbody>
                  {house.storeys.map((s, i) => (
                    <tr key={i}>
                      <td><input className="h-text" value={s.name} aria-label="Storey name" onChange={(e) => upd((h) => { h.storeys[i].name = e.target.value; })} /></td>
                      <td className="n"><input type="number" className="thk-input" step={0.05} value={s.h} aria-label="Ceiling height" onChange={(e) => upd((h) => { h.storeys[i].h = Math.max(1, Number(e.target.value) || 1); })} /></td>
                      <td className="n">{i < house.storeys.length - 1 ? <input type="number" className="thk-input" step={0.05} value={s.zone} aria-label="Floor zone" onChange={(e) => upd((h) => { h.storeys[i].zone = Math.max(0, Number(e.target.value) || 0); })} /> : '—'}</td>
                      <td className="n">{i === 0 ? <input type="number" className="thk-input" step={0.1} min={0} value={s.below ?? 0} aria-label="Depth below ground" onChange={(e) => upd((h) => { h.storeys[0].below = Math.max(0, Number(e.target.value) || 0); })} /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-between">
              <button type="button" className="btn-secondary" onClick={() => upd((h) => { h.storeys.push({ name: `Storey ${h.storeys.length + 1}`, h: 2.4, zone: 0.25 }); })}>Add storey on top</button>
              {house.storeys.length > 1 && !house.rooms.some((r) => r.storey + r.span >= house.storeys.length) && (
                <button type="button" className="btn-link" onClick={() => upd((h) => { h.storeys.pop(); })}>Remove top storey</button>
              )}
            </div>
            <p className="small muted">{(house.storeys[0]?.below ?? 0) > 0
              ? `Basement: the lowest storey's outside walls are in the ground (BS EN ISO 13370 basement walls) and its floor is a basement floor ${house.storeys[0].below} m down.`
              : 'Ground floors are solid slabs unless their build-up is set to suspended timber in the Build-ups list.'}</p>
            <div className="hf-row">
              <Num label="Suspended floors: airbricks" unit="mm²/m" step={100} value={house.suspended.vent} onChange={(v) => upd((h) => { h.suspended.vent = Math.max(0, v); })} />
              <Num label="Void height" unit="m" step={0.05} value={house.suspended.voidH} onChange={(v) => upd((h) => { h.suspended.voidH = Math.max(0.05, v); })} />
            </div>
          </Card>

          <Card title="Loft" note={res.loft ? `Settles at ${fmt(res.loft.T, 1)} °C on the design day.` : 'No loft: top-storey ceilings are flat roofs.'}>
            <div className="hf-row">
              <label className="small"><input type="checkbox" checked={house.loft.present} onChange={(e) => upd((h) => { h.loft.present = e.target.checked; })} /> Loft over the top storey</label>
              <Num label="Ventilation" unit="ach" value={house.loft.ach} min={0} onChange={(v) => upd((h) => { h.loft.ach = v; })} />
              <Num label="Mean height" unit="m" value={house.loft.height} min={0.1} onChange={(v) => upd((h) => { h.loft.height = v; })} />
              <Num label="Roof pitch" unit="°" step={1} min={0} max={70} value={house.loft.pitch} onChange={(v) => upd((h) => { h.loft.pitch = v; })} />
            </div>
          </Card>

          <Card title="Heat pump and running cost" note="Carnot-fraction COP with weather compensation, by month. Space heating only; hot water comes later.">
            <div className="hf-row">
              <Num label="Output at design temp" unit="kW" value={house.hp.capacity} min={0} onChange={(v) => upd((h) => { h.hp.capacity = v; })} />
              <Num label="Max flow" unit="°C" step={1} value={house.hp.maxFlow} onChange={(v) => upd((h) => { h.hp.maxFlow = v; })} />
              <Num label="Electricity" unit="p/kWh" step={0.01} value={house.hp.elecP} onChange={(v) => upd((h) => { h.hp.elecP = v; })} />
              <Num label="Gas" unit="p/kWh" step={0.01} value={house.hp.gasP} onChange={(v) => upd((h) => { h.hp.gasP = v; })} />
              <Num label="Gas standing" unit="p/day" step={0.01} value={house.hp.gasSC} onChange={(v) => upd((h) => { h.hp.gasSC = v; })} />
              <Num label="Boiler efficiency" unit="%" step={1} value={house.hp.boilerEff} onChange={(v) => upd((h) => { h.hp.boilerEff = v; })} />
            </div>
            <p className="small mono">COP at design {fmt(res.hp.designCop, 2)} · SCOP {fmt(res.hp.scop, 2)} · {fmt(res.hp.elecKWh)} kWh electricity · £{fmt(res.hp.costHP)}/yr vs gas £{fmt(res.hp.costGas)}/yr ({fmt(res.hp.gasKWh)} kWh)</p>
            <div className="h-table-wrap">
              <table className="h-table months-t">
                <thead><tr><th />{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Heat kWh</td>{res.months.map((m, i) => <td key={i} className="n mono">{fmt(m.heat)}</td>)}</tr>
                  <tr><td>Flow °C</td>{res.months.map((m, i) => <td key={i} className="n mono">{fmt(m.flow)}</td>)}</tr>
                  <tr><td>COP</td>{res.months.map((m, i) => <td key={i} className="n mono">{fmt(m.cop, 1)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Build-ups" note="U-values come from each stack-up's layers. Defaults apply to every face of that type unless a face picks its own.">
            <div className="hf-row">
              {(Object.keys(DEFAULT_LABEL) as DefaultKey[]).map((k) => (
                <label key={k} className="hf"><span className="eyebrow">{DEFAULT_LABEL[k][0]}</span>
                  <select className="select" value={house.defaults[k]} onChange={(e) => upd((h) => { h.defaults[k] = e.target.value; })}>
                    {bOpts(DEFAULT_LABEL[k][1]).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th>Build-up</th><th>Kind</th><th className="n" title="With outside-wall surface resistances; each face uses the ones for where it sits">U (as outside wall)</th><th /></tr></thead>
                <tbody>
                  {house.buildups.map((b) => {
                    const set = (patch: Partial<Buildup>) => upd((h) => { const x = h.buildups.find((y) => y.id === b.id); if (x) Object.assign(x, patch); });
                    const used = Object.values(house.defaults).includes(b.id) || Object.values(house.faceBuildup).includes(b.id) || house.openings.some((o) => o.buildup === b.id);
                    return (
                      <tr key={b.id}>
                        <td><input className="h-text" value={b.name} aria-label="Build-up name" onChange={(e) => set({ name: e.target.value })} /></td>
                        <td>
                          <select className="h-sel" value={b.kind} aria-label="Kind" onChange={(e) => set({ kind: e.target.value as BuildupKind })}>
                            {(Object.keys(KIND_LABEL) as BuildupKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                          </select>
                          {b.kind === 'floor' && (
                            <select className="h-sel" value={b.floorType ?? 'solid'} aria-label="Ground floor type" onChange={(e) => set({ floorType: e.target.value as Buildup['floorType'] })}>
                              <option value="solid">on the ground: solid slab</option><option value="suspended">on the ground: suspended timber</option>
                            </select>
                          )}
                        </td>
                        <td className="n mono">
                          {b.u != null
                            ? <input type="number" className="thk-input" step={0.05} min={0.1} value={b.u} aria-label="U-value" onChange={(e) => { const v = Number(e.target.value); if (v > 0) set({ u: v }); }} />
                            : fmt(buildupU(b), 2)}
                          {b.kind === 'glazing' && (
                            <span className="small glz">
                              g <input type="number" className="thk-input" step={0.01} min={0} max={1} value={b.g ?? ''} placeholder="—" aria-label="g-value" onChange={(e) => set({ g: e.target.value === '' ? undefined : Number(e.target.value) })} />
                              frame <input type="number" className="thk-input" step={0.05} min={0} max={0.9} value={b.frame ?? 0.3} aria-label="Frame fraction" onChange={(e) => set({ frame: Number(e.target.value) })} />
                            </span>
                          )}
                        </td>
                        <td className="h-acts">
                          {b.u == null && <button type="button" className="btn-link" onClick={() => setEditing(b.id)}>Edit layers</button>}
                          <button type="button" className="btn-link" disabled={used} title={used ? 'In use' : undefined}
                            onClick={() => upd((h) => { h.buildups = h.buildups.filter((x) => x.id !== b.id); })}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Add from the build-up library</span>
                <select className="select" value="" onChange={(e) => {
                  const s = library.find((x) => x.id === e.target.value);
                  if (s) upd((h) => { h.buildups.push({ id: uid('b'), name: s.name, kind: s.orient === 'roof' ? 'roof' : 'wall', layers: s.layers.map(([m, t]) => [m, t]) }); });
                }}>
                  <option value="">Choose…</option>
                  {library.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="hf"><span className="eyebrow">Add from the glazing library</span>
                <select className="select" value="" onChange={(e) => {
                  const i = Number(e.target.value);
                  if (e.target.value === 'door') upd((h) => { h.buildups.push({ id: uid('b'), name: 'New door', kind: 'door', layers: [], u: 1.8 }); });
                  else if (GLAZING_LIBRARY[i]) upd((h) => { h.buildups.push({ id: uid('b'), kind: 'glazing', layers: [], ...GLAZING_LIBRARY[i] }); });
                }}>
                  <option value="">Choose…</option>
                  {GLAZING_LIBRARY.map((x, i) => <option key={x.name} value={i}>{x.name} (U {x.u}, g {x.g})</option>)}
                  <option value="door">External door (U 1.8)</option>
                </select>
              </label>
            </div>
          </Card>
        </div>
      </div>

      <p className="foot">
        Steady-state design heat loss, room by room: fabric U·A·ΔT with U from each build-up's layers (BS EN ISO 6946 surface resistances; ground floors by BS EN ISO 13370),
        ventilation from one airtightness figure shared by exposure plus SAP device allowances, and unheated rooms and the loft solved for the temperature where heat in balances heat out.
        Design conditions from the MCS Heat Load Calculator tables. Thermal bridges, solar and internal gains, emitters and hot water are not modelled yet.
      </p>

      {editB && (
        <StackupModal library={library} title={`Edit layers: ${editB.name}`} initial={{ name: editB.name, layers: editB.layers, orient: editB.kind === 'roof' ? 'roof' : undefined }}
          onCancel={() => setEditing(null)} onSave={applyLayers(editB.id)} onApply={applyLayers(editB.id)} />
      )}
    </div>
  );
}
