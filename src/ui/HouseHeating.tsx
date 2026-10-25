import { useMemo } from 'react';
import { MONTHS } from '../engine/data';
import { calcHouse, roomArea } from '../engine/house';
import type { House } from '../engine/house';
import { COVERS, RAD_LABEL, autoEmitters, emitterOut, loopLength, lpm, ratedOf, roomSchedule, systemFlow } from '../engine/house-heating';
import type { Emitter, RadType, Zone } from '../engine/house-heating';
import { Chip } from './controls';
import { HouseUfh } from './HouseUfh';
import { MAX_PA_M, MAX_V, PIPE_SIZES, autoPipes, sizePipes } from '../engine/house-pipes';

const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ZCOL = ['#c2410c', '#1f6fb5', '#1f7a4d', '#7a45b8', '#b45309', '#be185d'];

export function HouseHeating({ house, setHouse }: { house: House; setHouse: (fn: (h: House) => House) => void }) {
  const upd = (fn: (h: House) => void) => setHouse((prev) => { const n = structuredClone(prev); fn(n); return n; });
  const res = useMemo(() => calcHouse(house), [house]);
  const c = house.heating;
  const needs = res.rooms.filter((r) => r.room.heated).map((r) => ({ room: r.room, need: r.totalW }));
  const designFlow = res.heat.designFlow;
  const roomName = (id: string) => house.rooms.find((r) => r.id === id)?.name ?? id;
  const setE = (id: string, patch: Partial<Emitter>) => upd((h) => { const e = h.heating.emitters.find((x) => x.id === id); if (e) Object.assign(e, patch); });
  const setZ = (id: string, patch: Partial<Zone>) => upd((h) => { const z = h.heating.zones.find((x) => x.id === id); if (z) Object.assign(z, patch); });

  // Flow curve chart: outside −10..20 °C, flow 20..60 °C.
  const W = 520, H = 220, L = 36, B = 24;
  const X = (t: number) => L + ((t + 10) / 30) * (W - L - 8), Y = (f: number) => 8 + (1 - (f - 20) / 40) * (H - B - 8);
  const line = (fn: (t: number) => number) => Array.from({ length: 52 }, (_, i) => -10 + i * 0.5).filter((t) => t <= 15.5).map((t, i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(fn(t)).toFixed(1)}`).join(' ');
  const ideal = (t: number) => systemFlow({ ...house, heating: { ...c, control: 'ideal' } }, needs, res.Tout, t);
  const current = (t: number) => systemFlow(house, needs, res.Tout, t);
  const seasonal = res.months.filter((m) => m.heat > 0);
  const avgFlow = seasonal.reduce((t, m) => t + m.flow * m.heat, 0) / (seasonal.reduce((t, m) => t + m.heat, 0) || 1);

  // Heat pump flow by hour: zones calling × their design load.
  const hourly = Array.from({ length: 24 }, (_, hr) => {
    let W = 0;
    for (const r of res.rooms) {
      if (!r.room.heated) continue;
      const s = roomSchedule(house, r.room);
      if (s && s[hr]) W += r.totalW;
    }
    return lpm(W, c.dT);
  });
  const fmax = Math.max(c.minFlow * 1.5, ...hourly);
  const lowHours = hourly.filter((f) => f > 0 && f < c.minFlow).length;
  const gov = res.heat.gov;
  const pipesRes = sizePipes(house, res);

  const add = (room: string, kind: Emitter['kind']) => upd((h) => {
    const zone = h.heating.zones.find((z) => (kind === 'ufh' ? z.kind === 'ufh' : z.kind === 'rad'))?.id ?? '';
    const r = h.rooms.find((x) => x.id === room);
    h.heating.emitters.push({ id: uid('e'), room, kind, zone, type: 'K2', len: 1000, height: 600, rated: 600, area: r ? +(roomArea(r) * 0.85).toFixed(1) : 10, spacing: 150, cover: 'Tiles', tail: 5 });
  });

  return (
    <div className="house-grid">
      <div className="house-col">
        <section className="card panel">
          <h2>Flow temperature</h2>
          <div className="chips">
            {([['fixed', 'Fixed flow'], ['ideal', 'Weather comp · ideal'], ['curve', 'Weather comp · my curve']] as const).map(([k, l]) => (
              <Chip key={k} on={c.control === k} onClick={() => upd((h) => { h.heating.control = k; })}>{l}</Chip>
            ))}
          </div>
          <p className="small muted">{{
            fixed: 'Always sends the max flow temperature when heating. Simple, but the least efficient for a heat pump.',
            ideal: 'The lowest flow temperature that still keeps every room at its setpoint, hour by hour: the best a well-tuned controller could do.',
            curve: 'A straight line between two points you set, as on most controllers. The dashed line is the ideal for comparison.',
          }[c.control]}</p>
          <div className="hf-row">
            <label className="hf"><span className="eyebrow">Max flow</span><span className="hf-in"><input type="number" className="thk-input" value={house.hp.maxFlow} step={1} onChange={(e) => upd((h) => { h.hp.maxFlow = Number(e.target.value); })} /><span className="small muted">°C</span></span></label>
            <label className="hf"><span className="eyebrow">Flow − return</span><span className="hf-in"><input type="number" className="thk-input" value={c.dT} min={2} max={15} step={1} onChange={(e) => upd((h) => { h.heating.dT = Math.max(1, Number(e.target.value)); })} /><span className="small muted">K</span></span></label>
            {c.control === 'curve' && <>
              <label className="hf"><span className="eyebrow">Flow at {res.Tout} °C</span><span className="hf-in"><input type="number" className="thk-input" value={c.curveDesign} step={1} onChange={(e) => upd((h) => { h.heating.curveDesign = Number(e.target.value); })} /><span className="small muted">°C</span></span></label>
              <label className="hf"><span className="eyebrow">Flow at 15 °C</span><span className="hf-in"><input type="number" className="thk-input" value={c.curve15} step={1} onChange={(e) => upd((h) => { h.heating.curve15 = Number(e.target.value); })} /><span className="small muted">°C</span></span></label>
            </>}
          </div>
          <svg className="day-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flow temperature against outside temperature">
            {[20, 30, 40, 50, 60].map((f) => <g key={f}><line x1={L} x2={W - 8} y1={Y(f)} y2={Y(f)} className="dc-grid" /><text x={L - 4} y={Y(f) + 4} textAnchor="end" className="dc-ax">{f}</text></g>)}
            {[-10, -5, 0, 5, 10, 15, 20].map((t) => <text key={t} x={X(t)} y={H - 6} textAnchor="middle" className="dc-ax">{t} °C</text>)}
            <rect x={X(15.5)} y={8} width={X(20) - X(15.5)} height={H - B - 8} fill="#eceff1" />
            <line x1={L} x2={W - 8} y1={Y(house.hp.maxFlow)} y2={Y(house.hp.maxFlow)} stroke="#9a3412" strokeDasharray="2 3" />
            {c.control !== 'ideal' && <path d={line(ideal)} className="dc-out" />}
            <path d={line(current)} className="dc-sel" />
            <circle cx={X(res.Tout)} cy={Y(designFlow)} r={4} fill="#c2410c" />
          </svg>
          <p className="small mono">Design day {fmt(designFlow, 1)} °C flow · seasonal average {fmt(avgFlow, 1)} °C · SCOP {fmt(res.hp.scop, 2)}</p>
          {gov && (
            <aside className={gov.req > house.hp.maxFlow ? 'callout warnbox' : 'callout'}>
              <div className="eyebrow">Room setting the flow temperature</div>
              <p className="small"><b>{roomName(gov.id)}</b> needs {Number.isFinite(gov.req) ? `${fmt(gov.req, 1)} °C` : 'more than 80 °C'} on the design day.{' '}
                {gov.req > house.hp.maxFlow ? `Above your max of ${house.hp.maxFlow} °C, so it falls short on the coldest days. A bigger emitter there lowers the curve for the whole house.` : 'Every other room is satisfied at a lower flow; upsizing this emitter would lower the curve for the whole house.'}</p>
            </aside>
          )}
          <div className="h-table-wrap">
            <table className="h-table months-t">
              <thead><tr><th />{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}</tr></thead>
              <tbody>
                <tr><td>Flow °C</td>{res.months.map((m, i) => <td key={i} className="n mono">{m.heat > 0 ? fmt(m.flow) : '—'}</td>)}</tr>
                <tr><td>COP</td>{res.months.map((m, i) => <td key={i} className="n mono">{m.heat > 0 ? fmt(m.cop, 1) : '—'}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="card panel">
          <div className="section-head">
            <div><h2>Emitters</h2><p className="muted small">Output at the design-day flow of {fmt(designFlow, 1)} °C against each room's heat loss.</p></div>
            <button type="button" className="btn-secondary" onClick={() => upd((h) => {
              const missing = needs.filter((n) => !h.heating.emitters.some((e) => e.room === n.room.id));
              const made = autoEmitters(h, missing).map((e) => ({ ...e, id: uid('e'), zone: h.heating.zones.find((z) => z.kind === 'rad')?.id ?? '' }));
              h.heating.emitters.push(...made);
            })}>Add radiators to rooms without one</button>
          </div>
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th>Room</th><th>Emitter</th><th>Size</th><th>Zone</th><th className="n">Output W</th><th className="n">Need W</th><th className="n">Cover</th><th /></tr></thead>
              <tbody>
                {res.heat.rooms.map((rr) => {
                  const ems = c.emitters.filter((e) => e.room === rr.id);
                  const cls = !rr.has ? 'bad' : rr.cover < 0.995 ? 'bad' : 'good';
                  const rows = ems.length ? ems : [null];
                  return rows.map((e, k) => (
                    <tr key={e?.id ?? rr.id}>
                      {k === 0 && <td rowSpan={rows.length}>{roomName(rr.id)}<br /><span className="small muted">needs {fmt(rr.req, 1)} °C flow</span></td>}
                      {e ? <>
                        <td>
                          <select className="h-sel" value={e.kind === 'radiator' ? e.type : e.kind} aria-label="Emitter type" onChange={(ev) => {
                            const v = ev.target.value;
                            setE(e.id, v === 'towel' || v === 'ufh' ? { kind: v } : { kind: 'radiator', type: v as RadType });
                          }}>
                            {(Object.keys(RAD_LABEL) as RadType[]).map((t) => <option key={t} value={t}>{RAD_LABEL[t]}</option>)}
                            <option value="towel">Towel rail</option><option value="ufh">UFH loop</option>
                          </select>
                        </td>
                        <td className="h-size">
                          {e.kind === 'radiator' && <><input type="number" className="thk-input" aria-label="Length mm" value={e.len} step={100} min={300} onChange={(ev) => setE(e.id, { len: Number(ev.target.value) })} /> × <input type="number" className="thk-input" aria-label="Height mm" value={e.height} step={50} min={300} onChange={(ev) => setE(e.id, { height: Number(ev.target.value) })} /> mm</>}
                          {e.kind === 'towel' && <><input type="number" className="thk-input" aria-label="Rated output W" value={e.rated} step={50} onChange={(ev) => setE(e.id, { rated: Number(ev.target.value) })} /> W at ΔT50</>}
                          {e.kind === 'ufh' && <>
                            <input type="number" className="thk-input" aria-label="Loop area m²" value={e.area} step={0.5} onChange={(ev) => setE(e.id, { area: Number(ev.target.value) })} /> m² ·{' '}
                            <select className="h-sel" aria-label="Pipe spacing" value={e.spacing} onChange={(ev) => setE(e.id, { spacing: Number(ev.target.value) })}>{[100, 150, 200, 300].map((s) => <option key={s} value={s}>{s} mm</option>)}</select>{' '}
                            <select className="h-sel" aria-label="Floor covering" value={e.cover} onChange={(ev) => setE(e.id, { cover: ev.target.value })}>{Object.keys(COVERS).map((s) => <option key={s}>{s}</option>)}</select>
                            <br /><span className={`small ${loopLength(e, house) > 100 ? 'bad' : 'muted'}`}>loop {fmt(loopLength(e, house))} m{e.rect ? ', drawn' : ` incl. ${e.tail} m tails`}</span>
                          </>}
                          {e.kind !== 'ufh' && <span className="small muted"> · {fmt(ratedOf(e))} W at ΔT50</span>}
                        </td>
                        <td>
                          <select className="h-sel" value={e.zone} aria-label="Zone" onChange={(ev) => setE(e.id, { zone: ev.target.value })}>
                            <option value="">No zone</option>
                            {c.zones.filter((z) => (e.kind === 'ufh') === (z.kind === 'ufh')).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                          </select>
                        </td>
                        <td className="n mono">{fmt(emitterOut(e, designFlow, house.rooms.find((r) => r.id === rr.id)?.setpoint ?? 21, house))}</td>
                      </> : <td colSpan={4} className="bad small">No emitter</td>}
                      {k === 0 && <>
                        <td rowSpan={rows.length} className="n mono">{fmt(rr.need)}</td>
                        <td rowSpan={rows.length} className={`n mono ${cls}`}>{rr.has ? `${fmt(rr.cover * 100)}%` : '—'}</td>
                      </>}
                      <td className="h-acts">
                        {e && <button type="button" className="btn-link" onClick={() => upd((h) => { h.heating.emitters = h.heating.emitters.filter((x) => x.id !== e.id); })}>Remove</button>}
                        {k === rows.length - 1 && <>
                          <button type="button" className="btn-link" onClick={() => add(rr.id, 'radiator')}>+ radiator</button>
                          <button type="button" className="btn-link" onClick={() => add(rr.id, 'ufh')}>+ UFH</button>
                        </>}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">Radiator outputs are typical catalogue figures per metre at 600 mm high, ΔT50, exponent 1.3. UFH: 16 mm pipe in 65 mm screed, EN 1264 style, capped at a 29 °C floor surface.</p>
        </section>
      </div>

      <div className="house-col">
        <section className="card panel">
          <div className="section-head">
            <h2>Zones</h2>
            <div className="chips">
              <button type="button" className="btn-secondary" onClick={() => upd((h) => { h.heating.zones.push({ id: uid('z'), name: 'New radiator zone', kind: 'rad', color: ZCOL[h.heating.zones.length % ZCOL.length], on: true, hours: null, blend: 0 }); })}>+ Radiator zone</button>
              <button type="button" className="btn-secondary" onClick={() => upd((h) => { h.heating.zones.push({ id: uid('z'), name: 'New UFH manifold', kind: 'ufh', color: ZCOL[h.heating.zones.length % ZCOL.length], on: true, hours: null, blend: 35 }); })}>+ UFH manifold</button>
            </div>
          </div>
          {c.zones.map((z) => {
            const ems = c.emitters.filter((e) => e.zone === z.id);
            const load = res.rooms.filter((r) => ems.some((e) => e.room === r.room.id)).reduce((t, r) => t + r.totalW, 0);
            const hrs = z.hours ?? null;
            return (
              <div key={z.id} className="zone" style={{ borderLeftColor: z.color, opacity: z.on ? 1 : 0.6 }}>
                <div className="hf-row">
                  <input className="h-text" value={z.name} aria-label="Zone name" onChange={(e) => setZ(z.id, { name: e.target.value })} />
                  <label className="small"><input type="checkbox" checked={z.on} onChange={(e) => setZ(z.id, { on: e.target.checked })} /> On</label>
                  <span className="small mono">{z.kind === 'ufh' ? 'UFH' : 'RAD'} · {fmt(load)} W · {fmt(lpm(load, c.dT), 1)} l/min</span>
                  <button type="button" className="btn-link" onClick={() => upd((h) => { h.heating.zones = h.heating.zones.filter((x) => x.id !== z.id); h.heating.emitters.forEach((e) => { if (e.zone === z.id) e.zone = ''; }); })}>Delete</button>
                </div>
                <p className="small muted">{ems.length ? ems.map((e) => `${roomName(e.room)} ${e.kind === 'ufh' ? 'loop' : e.kind === 'towel' ? 'towel rail' : e.id}`).join(', ') : 'No emitters yet: pick this zone in the emitter table.'}</p>
                {z.kind === 'ufh' && (
                  <label className="small">Loop water:{' '}
                    <select className="h-sel" value={z.blend} onChange={(e) => setZ(z.id, { blend: Number(e.target.value) })}>
                      <option value={0}>System flow (direct)</option>{[30, 35, 40, 45].map((t) => <option key={t} value={t}>Blended to {t} °C</option>)}
                    </select>
                  </label>
                )}
                <label className="small"><input type="checkbox" checked={hrs === null} onChange={(e) => setZ(z.id, { hours: e.target.checked ? null : [...house.gains.living] })} /> Follow the occupancy schedule</label>
                {hrs && (
                  <div className="sched-cells">
                    {hrs.map((on, h) => <button key={h} type="button" className={on ? 'sc on' : 'sc'} style={on ? { background: z.color } : undefined} aria-pressed={!!on} aria-label={`${z.name} ${h}:00`}
                      onClick={() => setZ(z.id, { hours: hrs.map((v, i) => (i === h ? (v ? 0 : 1) : v)) })} />)}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <HouseUfh house={house} upd={upd} />

        <section className="card panel">
          <div className="section-head">
            <div><h2>Pipework</h2><p className="muted small">Pipe runs from the heat pump. Each run carries the design flow of every emitter beyond it ({c.dT} K flow − return). Limits: about 1 m/s (0.8 in microbore) and {MAX_PA_M} Pa/m.</p></div>
            <div className="chips">
              <button type="button" className="btn-secondary" onClick={() => { if (!c.pipes?.length || confirm('Replace the pipe runs with a typical layout?')) upd((h) => { h.heating.pipes = autoPipes(h); }); }}>Lay out typical pipework</button>
              <button type="button" className="btn-secondary" onClick={() => upd((h) => { const ps = h.heating.pipes ?? []; h.heating.pipes = [...ps, { id: uid('p'), name: 'New run', parent: ps[0]?.id ?? null, size: 'Cu 15 mm', length: 3 }]; })}>+ Run</button>
            </div>
          </div>
          {!pipesRes.rows.length ? <p className="small muted">No pipework yet.</p> : <>
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th>Run</th><th>From</th><th>Size</th><th className="n">m</th><th>Ends at</th><th className="n">W</th><th className="n">l/min</th><th className="n">m/s</th><th className="n">Pa/m</th><th /></tr></thead>
                <tbody>
                  {pipesRes.rows.map((r) => {
                    const p = r.pipe;
                    const setP = (patch: Partial<typeof p>) => upd((h) => { const x = h.heating.pipes?.find((y) => y.id === p.id); if (x) Object.assign(x, patch); });
                    return (
                      <tr key={p.id} className={r.index ? 'idx' : ''} title={r.why.join('; ')}>
                        <td><input className="h-text" value={p.name} aria-label="Run name" onChange={(e) => setP({ name: e.target.value })} /></td>
                        <td><select className="h-sel" value={p.parent ?? ''} aria-label="Upstream run" onChange={(e) => setP({ parent: e.target.value || null })}>
                          <option value="">Heat pump</option>{(c.pipes ?? []).filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select></td>
                        <td><select className="h-sel" value={p.size} aria-label="Pipe size" onChange={(e) => setP({ size: e.target.value })}>{Object.keys(PIPE_SIZES).map((k) => <option key={k}>{k}</option>)}</select></td>
                        <td className="n"><input type="number" className="thk-input" step={0.5} min={0} value={p.length} aria-label="Length m" onChange={(e) => setP({ length: Math.max(0, Number(e.target.value) || 0) })} /></td>
                        <td><select className="h-sel" value={p.emitter ?? ''} aria-label="Emitter at the end" onChange={(e) => setP({ emitter: e.target.value || undefined })}>
                          <option value="">— (branch)</option>{c.emitters.map((e) => <option key={e.id} value={e.id}>{roomName(e.room)} {e.kind === 'ufh' ? 'UFH' : e.kind === 'towel' ? 'towel rail' : e.id}</option>)}
                        </select></td>
                        <td className="n mono">{fmt(r.loadW)}</td>
                        <td className="n mono">{fmt(r.flowLpm, 1)}</td>
                        <td className={`n mono ${r.v > MAX_V(PIPE_SIZES[p.size] ?? 13.6) ? 'bad' : ''}`}>{fmt(r.v, 2)}</td>
                        <td className={`n mono ${r.paM > MAX_PA_M ? 'bad' : ''}`}>{fmt(r.paM)}</td>
                        <td><button type="button" className="btn-link" onClick={() => upd((h) => { h.heating.pipes = (h.heating.pipes ?? []).filter((x) => x.id !== p.id).map((x) => (x.parent === p.id ? { ...x, parent: p.parent } : x)); })}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Pump head available</span><span className="hf-in"><input type="number" className="thk-input" step={1} value={c.pumpHead ?? 40} onChange={(e) => upd((h) => { h.heating.pumpHead = Number(e.target.value) || 0; })} /><span className="small muted">kPa at the design flow</span></span></label>
            </div>
            <p className={pipesRes.headOk ? 'small' : 'small warn'}>Index circuit (highlighted): {fmt(pipesRes.indexDp / 1000, 1)} kPa through {pipesRes.indexPath.length} runs, flow and return, with {Math.round((1.3 - 1) * 100)}% for fittings and 5 kPa for the emitter and valves.{' '}
              {pipesRes.headOk ? `Within the pump's ${fmt(pipesRes.head / 1000)} kPa.` : `More than the pump's ${fmt(pipesRes.head / 1000)} kPa: upsize the highlighted runs.`}</p>
            {pipesRes.unpiped.length > 0 && <p className="small warn">Not piped yet: {pipesRes.unpiped.map((id) => { const e = c.emitters.find((x) => x.id === id); return e ? `${roomName(e.room)} ${e.kind === 'ufh' ? 'UFH' : id}` : id; }).join(', ')}.</p>}
          </>}
        </section>

        <section className="card panel">
          <h2>Heat pump flow by hour</h2>
          <div className="hf-row">
            <label className="hf"><span className="eyebrow">Heat pump minimum flow</span><span className="hf-in"><input type="number" className="thk-input" step={0.5} value={c.minFlow} onChange={(e) => upd((h) => { h.heating.minFlow = Number(e.target.value); })} /><span className="small muted">l/min</span></span></label>
          </div>
          <div className="flow-bars" role="img" aria-label="Design flow rate by hour">
            {hourly.map((f, hr) => (
              <span key={hr} className="fb" title={`${String(hr).padStart(2, '0')}:00 · ${fmt(f, 1)} l/min`}>
                <span style={{ height: `${(f / fmax) * 100}%`, background: f > 0 && f < c.minFlow ? '#c2410c' : '#14212b' }} />
              </span>
            ))}
            <span className="fb-min" style={{ bottom: `${(c.minFlow / fmax) * 100}%` }} />
          </div>
          <p className="small muted">Design flow from the zones calling each hour, at {c.dT} K flow − return. Orange hours are below the heat pump's minimum: merge small zones, overlap their hours, or add a buffer or low-loss header.</p>
          {lowHours > 0 && <p className="small warn">{lowHours} hour{lowHours > 1 ? 's' : ''} a day below {c.minFlow} l/min.</p>}
        </section>
      </div>
    </div>
  );
}
