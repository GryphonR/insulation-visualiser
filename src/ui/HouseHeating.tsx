import { useMemo } from 'react';
import { MONTHS } from '../engine/data';
import { SOURCE_LABEL, effText, isHeatPump, roomArea } from '../engine/house';
import type { House } from '../engine/house';
import { COOLING_DEFAULT, COVERS, fanCoilName, ZONE_COLOURS, given, RAD_LABEL, canCool, dewPoint, emitterCool, UFH_SPACINGS, autoEmitters, emitterOut, loopLength, loopMax, lpm, ratedOf, roomSchedule, systemFlow } from '../engine/house-heating';
import type { Emitter, RadType, Zone } from '../engine/house-heating';
import { Chip } from './controls';
import { HouseUfh } from './HouseUfh';
import { FIT_BORE, MAX_PA_M, MAX_V, PIPE_SIZES, autoPipes, fitBore, pipeFamily, sizesOn, combineRuns, removeRun, runLength, sizePipes } from '../engine/house-pipes';
import { addEmitter } from '../engine/house-draw';
import { Card, Num, SheetNum, Why, fmt, uid, NumInput } from './hform';
import { WHY, sourceWhy } from './assumptions';
import { useProject } from './project';
import { href } from './route';
import { HeatSourceCard } from './HouseSettings';
import { coolingLoad } from '../engine/house-sim';

const ZCOL = ZONE_COLOURS;

export type HeatingSection = 'system' | 'emitters' | 'zones' | 'pipes';

export function HouseHeating({ house, setHouse, section }: { house: House; setHouse: (fn: (h: House) => House) => void; section?: HeatingSection }) {
  const show = (x: HeatingSection) => !section || section === x;
  const upd = (fn: (h: House) => void) => setHouse((prev) => { const n = structuredClone(prev); fn(n); return n; });
  const { res } = useProject();
  const c = house.heating;
  const needs = res.rooms.filter((r) => r.room.heated).map((r) => ({ room: r.room, need: r.totalW }));
  const designFlow = res.heat.designFlow;
  const roomName = (id: string) => house.rooms.find((r) => r.id === id)?.name ?? id;
  const setE = (id: string, patch: Partial<Emitter>) => upd((h) => { const e = h.heating.emitters.find((x) => x.id === id); if (e) Object.assign(e, patch); });
  const setZ = (id: string, patch: Partial<Zone>) => upd((h) => { const z = h.heating.zones.find((x) => x.id === id); if (z) Object.assign(z, patch); });

  // Flow curve chart: outside −10..20 °C, flow 20 °C up to 60 °C, or past the max flow for a boiler.
  const W = 520, H = 220, L = 36, B = 24, top = Math.max(60, Math.ceil((house.hp.maxFlow + 1) / 10) * 10);
  const X = (t: number) => L + ((t + 10) / 30) * (W - L - 8), Y = (f: number) => 8 + (1 - (f - 20) / (top - 20)) * (H - B - 8);
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

  const add = (room: string, kind: Emitter['kind']) => upd((h) => addEmitter(h, room, kind, uid('e')));

  // One sub-tab at a time: wide tables (emitters, zones, pipework) take the full width; the system cards flow across two columns.
  const layout = !section ? 'house-grid' : section === 'system' ? 'house-grid house-flow' : 'house-stack';
  return (
    <div className={layout}>
      <div className="house-col">
        {show('system') && <HeatSourceCard />}
        {show('system') && <CoolingCard />}
        {show('system') && <CoolingLoadCard />}
        {show('system') && (
        <section className="card panel">
          <h2>Flow temperature</h2>
          <div className="chips">
            {([['fixed', 'Fixed flow'], ['ideal', 'Weather comp · ideal'], ['curve', 'Weather comp · my curve']] as const).map(([k, l]) => (
              <Chip key={k} on={c.control === k} onClick={() => upd((h) => { h.heating.control = k; })}>{l}</Chip>
            ))}
          </div>
          <p className="small muted">{{
            fixed: 'Always sends the max flow temperature when heating. Simple, but the least efficient for a heat pump or condensing boiler.',
            ideal: 'The lowest flow temperature that still keeps every room at its setpoint, hour by hour: the best a well-tuned controller could do.',
            curve: 'A straight line between two points you set, as on most controllers. The dashed line is the ideal for comparison.',
          }[c.control]}</p>
          <div className="hf-row">
            <label className="hf"><span className="eyebrow">Max flow</span><span className="hf-in"><NumInput className="thk-input" value={house.hp.maxFlow} step={1} onChange={(e) => upd((h) => { h.hp.maxFlow = Number(e.target.value); })} /><span className="small muted">°C</span></span></label>
            <label className="hf"><span className="eyebrow">Flow − return</span><span className="hf-in"><NumInput className="thk-input" value={c.dT} min={2} max={15} step={1} onChange={(e) => upd((h) => { h.heating.dT = Math.max(1, Number(e.target.value)); })} /><span className="small muted">K</span></span></label>
            {c.control === 'curve' && <>
              <label className="hf"><span className="eyebrow">Flow at {res.Tout} °C</span><span className="hf-in"><NumInput className="thk-input" value={c.curveDesign} step={1} onChange={(e) => upd((h) => { h.heating.curveDesign = Number(e.target.value); })} /><span className="small muted">°C</span></span></label>
              <label className="hf"><span className="eyebrow">Flow at 15 °C</span><span className="hf-in"><NumInput className="thk-input" value={c.curve15} step={1} onChange={(e) => upd((h) => { h.heating.curve15 = Number(e.target.value); })} /><span className="small muted">°C</span></span></label>
            </>}
          </div>
          <svg className="day-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flow temperature against outside temperature">
            {Array.from({ length: (top - 20) / 10 + 1 }, (_, i) => 20 + i * 10).map((f) => <g key={f}><line x1={L} x2={W - 8} y1={Y(f)} y2={Y(f)} className="dc-grid" /><text x={L - 4} y={Y(f) + 4} textAnchor="end" className="dc-ax">{f}</text></g>)}
            {[-10, -5, 0, 5, 10, 15, 20].map((t) => <text key={t} x={X(t)} y={H - 6} textAnchor="middle" className="dc-ax">{t} °C</text>)}
            <rect x={X(15.5)} y={8} width={X(20) - X(15.5)} height={H - B - 8} fill="#eceff1" />
            <line x1={L} x2={W - 8} y1={Y(house.hp.maxFlow)} y2={Y(house.hp.maxFlow)} stroke="#9a3412" strokeDasharray="2 3" />
            {c.control !== 'ideal' && <path d={line(ideal)} className="dc-out" />}
            <path d={line(current)} className="dc-sel" />
            <circle cx={X(res.Tout)} cy={Y(designFlow)} r={4} fill="#c2410c" />
          </svg>
          <p className="small mono">Design day {fmt(designFlow, 1)} °C flow · seasonal average {fmt(avgFlow, 1)} °C · {SOURCE_LABEL[house.hp.source]} {isHeatPump(house.hp.source) ? 'estimated ' : ''}{effText(house.hp.source, res.hp.seasonal)} seasonal<Why>{`${sourceWhy(house.hp)} ${WHY.seasonal}`}</Why></p>
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
                <tr><td>{isHeatPump(house.hp.source) ? 'Est. COP' : 'Efficiency %'}<Why>{sourceWhy(house.hp)}</Why></td>{res.months.map((m, i) => <td key={i} className="n mono">{m.heat > 0 ? (isHeatPump(house.hp.source) ? fmt(m.eff, 1) : fmt(m.eff * 100)) : '—'}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </section>
        )}

        {show('emitters') && (
        <section className="card panel">
          <div className="section-head">
            <div><h2>Emitters</h2><p className="muted small">Output at the design-day flow of {fmt(designFlow, 1)} °C against each room's heat loss.</p>
              <p className="small">Sized for a <b>{SOURCE_LABEL[house.hp.source].toLowerCase()}</b> at up to {house.hp.maxFlow} °C flow, {c.dT} K flow − return. <a href={href('heating')}>Change the heat source ›</a> · <a href={href('layout')}>Place emitters on the plan ›</a></p></div>
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
                            setE(e.id, v === 'fancoil' ? { kind: v, rated: e.kind === 'fancoil' ? e.rated : 2000 } : v === 'towel' || v === 'ufh' ? { kind: v } : { kind: 'radiator', type: v as RadType });
                          }}>
                            {(Object.keys(RAD_LABEL) as RadType[]).map((t) => <option key={t} value={t}>{RAD_LABEL[t]}</option>)}
                            <option value="towel">Towel rail</option><option value="fancoil">Fan coil</option><option value="ufh">UFH loop</option>
                          </select>
                        </td>
                        <td className="h-size">
                          {e.kind === 'radiator' && <><NumInput className="thk-input" aria-label="Length mm" value={e.len} step={100} min={300} onChange={(ev) => setE(e.id, { len: Number(ev.target.value) })} /> × <NumInput className="thk-input" aria-label="Height mm" value={e.height} step={50} min={300} onChange={(ev) => setE(e.id, { height: Number(ev.target.value) })} /> mm</>}
                          {(e.kind === 'towel' || e.kind === 'fancoil') && <><NumInput className="thk-input" aria-label="Rated output W" value={e.rated} step={50} onChange={(ev) => setE(e.id, { rated: Number(ev.target.value) })} /> W at ΔT50</>}
                          {e.kind === 'ufh' && <>
                            {e.fromZone
                              ? <span title="This room's part of the UFH zone drawn on the plan">{fmt(e.area, 1)} m² from {house.zones?.find((x) => x.id === e.fromZone)?.name ?? 'a UFH zone'} ·{' '}</span>
                              : <><NumInput className="thk-input" aria-label="Loop area m²" value={e.area} step={0.5} onChange={(ev) => setE(e.id, { area: Number(ev.target.value) })} /> m² ·{' '}</>}
                            {e.fromZone
                              ? <span title="Set on the UFH zone, in the floor plan's side panel">{e.spacing} mm spacing, {e.pipe ?? 16} mm pipe ·{' '}</span>
                              : <><select className="h-sel" aria-label="Pipe spacing" value={e.spacing} onChange={(ev) => setE(e.id, { spacing: Number(ev.target.value) })}>{UFH_SPACINGS.map((s) => <option key={s} value={s}>{s} mm</option>)}</select>{' '}</>}
                            <select className="h-sel" aria-label="Floor covering" value={e.cover} onChange={(ev) => setE(e.id, { cover: ev.target.value })}>{Object.keys(COVERS).map((s) => <option key={s}>{s}</option>)}</select>
                            <br /><span className={`small ${loopLength(e, house) > loopMax(e) ? 'bad' : 'muted'}`}>loop {fmt(loopLength(e, house))} m{e.fromZone ? `, the whole zone's${house.zones?.find((z) => z.id === e.fromZone)?.length ? ', measured' : ''}` : e.rect ? ', drawn' : ` incl. ${e.tail} m tails`}</span>
                          </>}
                          {e.kind !== 'ufh' && <span className="small muted"> · {fmt(ratedOf(e))} W at ΔT50{e.kind === 'fancoil' && e.feeds?.length ? ` · ducted to ${e.feeds.map((id) => house.rooms.find((r) => r.id === id)?.name).filter(Boolean).join(', ')}` : ''}</span>}
                          {canCool(e) && c.cooling && <><br /><span className="small muted">cools {fmt(emitterCool(e, c.cooling.flow, c.cooling.setpoint, house))} W at {c.cooling.flow} °C flow</span></>}
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
                        {e && !e.fromZone && <button type="button" className="btn-link" onClick={() => upd((h) => { h.heating.emitters = h.heating.emitters.filter((x) => x.id !== e.id); })}>Remove</button>}
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
        )}
      </div>

      <div className="house-col">
        {show('zones') && (
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
                  <button type="button" className="btn-link" onClick={() => { if (z.kind === 'ufh' && z.manifold?.storey != null && !confirm(`${z.name} is a manifold on the plan: deleting it takes it off the plan, and its loops are piped one by one. Delete it?`)) return; upd((h) => { h.heating.zones = h.heating.zones.filter((x) => x.id !== z.id); h.heating.emitters.forEach((e) => { if (e.zone === z.id) e.zone = ''; }); }); }}>Delete</button>
                </div>
                <p className="small muted">{ems.length ? ems.map((e) => e.kind === 'fancoil' ? fanCoilName(house, e) : `${roomName(e.room)} ${e.kind === 'ufh' ? 'loop' : e.kind === 'towel' ? 'towel rail' : e.id}`).join(', ') : 'No emitters yet: pick this zone in the emitter table.'}</p>
                {z.kind === 'ufh' && (
                  <label className="small">Loop water:{' '}
                    <select className="h-sel" value={z.blend} onChange={(e) => setZ(z.id, { blend: Number(e.target.value) })}>
                      <option value={0}>System flow (direct)</option>{[30, 35, 40, 45].map((t) => <option key={t} value={t}>Blended to {t} °C</option>)}
                    </select>
                  </label>
                )}
                <label className="small"><input type="checkbox" checked={hrs === null} onChange={(e) => setZ(z.id, { hours: e.target.checked ? null : [...house.gains.living] })} /> Use the <a href={href('gains')}>house heating times</a> ({house.heating.followOccupancy ? 'occupancy rows' : 'all day'})</label>
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
        )}

        {show('zones') && <HouseUfh house={house} upd={upd} />}

        {show('pipes') && (
        <section className="card panel">
          <div className="section-head">
            <div><h2>Pipework</h2><p className="muted small">Pipe runs from the {isHeatPump(house.hp.source) ? 'heat pump' : 'boiler'}. Each run carries the design flow of every emitter beyond it ({c.dT} K flow − return). Limits: about 1 m/s (0.8 in microbore), and {fmt(pipesRes.paMax)} Pa/m: {pipesRes.paMax < pipesRes.paPump ? 'the cap set below' : `the pump head shared along the ${fmt(pipesRes.longest, 1)} m longest circuit`}.</p>
              <p className="muted small">{c.source ? 'Runs laid out from the plan are measured along their routes, which you can drag into place on the plan; lengths follow as radiators, risers and the source move. Where runs overlap, or you drag one onto another, they share one pipe, sized for their combined flow, which tees off to each heater. A typed length overrides the route. Laying out again replaces every run.' : <>Place the boiler or heat pump, and any cylinder and pipe risers, on the <a href={href('layout')}>layout plan</a> to measure the runs instead of guessing them.</>}</p></div>
            <div className="chips">
              <button type="button" className="btn-secondary" onClick={() => { if (!c.pipes?.length || confirm('Replace the pipe runs with a typical layout?')) upd((h) => { h.heating.pipes = autoPipes(h); if (h.heating.source) combineRuns(h, res); }); }}>{c.source ? 'Lay out pipework from the plan' : 'Lay out typical pipework'}</button>
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
                          <option value="">{isHeatPump(house.hp.source) ? 'Heat pump' : 'Boiler'}</option>{(c.pipes ?? []).filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select></td>
                        <td><select className="h-sel" value={p.size} aria-label="Pipe size" onChange={(e) => setP({ size: e.target.value })}>{[...new Set([...sizesOn(house), p.size])].map((k) => <option key={k}>{k}</option>)}</select></td>
                        <td className="n"><NumInput className="thk-input" step={0.5} min={0} value={runLength(house, p)} aria-label="Length m" title={p.leg && !p.typed ? 'Measured along its route on the plan; typing a length overrides it' : undefined}
                          onChange={(e) => setP({ length: Math.max(0, Number(e.target.value) || 0), typed: true })} />
                          {p.leg && p.typed && <button type="button" className="btn-link small" title="Measure along the route on the plan again" onClick={() => setP({ typed: undefined })}>plan</button>}</td>
                        <td><select className="h-sel" value={p.emitter ?? ''} aria-label="Emitter at the end" onChange={(e) => setP({ emitter: e.target.value || undefined })}>
                          <option value="">— (branch)</option>{c.emitters.map((e) => <option key={e.id} value={e.id}>{e.kind === 'fancoil' ? fanCoilName(house, e) : `${roomName(e.room)} ${e.kind === 'ufh' ? 'UFH' : e.kind === 'towel' ? 'towel rail' : e.id}`}</option>)}
                        </select></td>
                        <td className="n mono">{fmt(r.loadW)}</td>
                        <td className="n mono">{fmt(r.flowLpm, 1)}</td>
                        <td className={`n mono ${r.v > MAX_V(PIPE_SIZES[p.size] ?? 13.6) ? 'bad' : ''}`}>{fmt(r.v, 2)}</td>
                        <td className={`n mono ${r.paM > pipesRes.paMax ? 'bad' : ''}`}>{fmt(r.paM)}</td>
                        <td><button type="button" className="btn-link" onClick={() => upd((h) => removeRun(h, p.id))}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Pump head available</span><span className="hf-in"><NumInput className="thk-input" step={1} value={c.pumpHead ?? 40} onChange={(e) => upd((h) => { h.heating.pumpHead = Number(e.target.value) || 0; })} /><span className="small muted">kPa at the design flow</span></span></label>
              <label className="hf"><span className="eyebrow">Pa/m cap</span><span className="hf-in"><NumInput className="thk-input" step={10} value={c.paCap ?? MAX_PA_M} onChange={(e) => upd((h) => { h.heating.paCap = Math.max(10, Number(e.target.value) || MAX_PA_M); })} /><span className="small muted">even with head to spare</span></span></label>
            </div>
            <p className={pipesRes.headOk ? 'small' : 'small warn'}>Index circuit (highlighted): {fmt(pipesRes.indexDp / 1000, 1)} kPa through {pipesRes.indexPath.length} runs, flow and return, with each elbow, tee and fitting insert on runs laid on the plan (30% for fittings on typed lengths) and 5 kPa for the emitter and valves.{' '}
              {pipesRes.headOk ? `Within the pump's ${fmt(pipesRes.head / 1000)} kPa.` : `More than the pump's ${fmt(pipesRes.head / 1000)} kPa: upsize the highlighted runs.`}</p>
            {pipesRes.unpiped.length > 0 && <p className="small warn">Not piped yet: {pipesRes.unpiped.map((id) => { const e = c.emitters.find((x) => x.id === id); return e ? `${roomName(e.room)} ${e.kind === 'ufh' ? 'UFH' : id}` : id; }).join(', ')}.</p>}
          </>}
          <fieldset className="pipe-sizes">
            <legend className="eyebrow">Pipe sizes on this project</legend>
            <p className="small muted">Only the sizes ticked are offered for runs and used when laying out and sizing pipework. Sizes are outside diameters; the bore used for the flow is in brackets. The inserts and press sleeves in plastic and multilayer fittings narrow the bore at every joint: set the bore through the fittings you use.</p>
            <div className="pipe-size-cols">
              {['Cu', 'PEX', 'MLCP'].map((f) => (
                <div key={f}><p className="small"><b>{f === 'Cu' ? 'Copper' : f === 'MLCP' ? 'MLCP (multilayer)' : 'PEX'}</b></p>
                  {Object.keys(PIPE_SIZES).filter((k) => pipeFamily(k) === f).map((k) => (
                    <label key={k} className="small"><input type="checkbox" checked={!c.pipeOff?.includes(k)}
                      onChange={(e) => upd((h) => { const off = (h.heating.pipeOff ?? []).filter((x) => x !== k); h.heating.pipeOff = e.target.checked ? off : [...off, k]; if (!h.heating.pipeOff.length) delete h.heating.pipeOff; })} />
                      {' '}{k.replace(/^\S+ /, '')} <span className="muted">({PIPE_SIZES[k]} mm bore)</span>
                      {FIT_BORE[k] != null && <> · fittings <NumInput className="thk-input" step={0.5} min={1} max={PIPE_SIZES[k]} value={fitBore(house, k)} aria-label={`${k} fitting bore, mm`}
                        onChange={(e) => upd((h) => { const n = Number(e.target.value); h.heating.fitBore = { ...h.heating.fitBore, [k]: n > 0 ? Math.min(n, PIPE_SIZES[k]) : FIT_BORE[k] }; })} /> mm</>}</label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
        </section>
        )}

        {show('system') && isHeatPump(house.hp.source) && (
        <section className="card panel">
          <h2>Heat pump flow by hour</h2>
          <div className="hf-row">
            <label className="hf"><span className="eyebrow">Heat pump minimum flow</span><span className="hf-in"><NumInput className="thk-input" step={0.5} value={c.minFlow} onChange={(e) => upd((h) => { h.heating.minFlow = Number(e.target.value); })} /><span className="small muted">l/min</span></span></label>
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
        )}
      </div>
    </div>
  );
}

/** A reversible heat pump's cooling: switched on, its output and EER, the room setpoint and the chilled water. */
function CoolingCard() {
  const { house, upd } = useProject();
  if (!isHeatPump(house.hp.source)) return null;
  const c = house.heating.cooling, on = !!c?.on;
  const set = (patch: Partial<NonNullable<typeof c>>) => upd((h) => { h.heating.cooling = { ...(h.heating.cooling ?? COOLING_DEFAULT), ...patch }; });
  const cools = house.heating.emitters.filter(canCool), dew = c ? dewPoint(c.setpoint) : 0;
  const ufh = cools.some((e) => e.kind === 'ufh');
  return (
    <Card title="Cooling" note="A reversible heat pump can send chilled water to fan coils and underfloor loops in summer. Radiators and towel rails cool very little and sweat, so they are shut off by valves on the System diagram.">
      <label className="hf-lab small"><input type="checkbox" checked={on} onChange={(e) => set({ on: e.target.checked })} /> This heat pump also cools</label>
      {on && c && <>
        <div className="hf-row">
          <SheetNum label="Cooling output" unit="kW" value={c.capacity} step={0.5} onChange={(v) => set({ capacity: v })} />
          <SheetNum label="EER" unit="" value={c.eer} step={0.1} onChange={(v) => set({ eer: v })} />
        </div>
        <p className="small muted">From the heat pump's datasheet, at its rated cooling point (often A35/W18 or A35/W7). {!given(c.capacity) && 'With no cooling output the runs assume the heat pump can take out whatever the emitters can. '}{!given(c.eer) && 'With no EER the electricity for cooling is not worked out.'}</p>
        <div className="hf-row">
          <Num label="Cool rooms to" unit="°C" step={0.5} min={18} max={30} value={c.setpoint} onChange={(v) => set({ setpoint: v })} />
          <Num label="Chilled flow" unit="°C" step={1} min={5} max={22} value={c.flow} onChange={(v) => set({ flow: v })} />
          <Num label="Return − flow" unit="K" step={1} min={1} max={8} value={c.dT} onChange={(v) => set({ dT: Math.max(1, v) })} />
        </div>
        <p className="small muted">Dew point at {c.setpoint} °C and 60% humidity: {fmt(dew, 1)} °C. Underfloor surfaces are held above it (and at least 19 °C), which limits a floor to about {fmt(7 * Math.max(0, c.setpoint - Math.max(19, dew + 1)))} W/m².</p>
        {ufh && c.flow < dew && <p className="small bad">The chilled flow is below the dew point: pipes and manifolds will sweat. Insulate them, or raise the flow.</p>}
        <p className="small">{cools.length ? `${cools.length} emitter${cools.length > 1 ? 's' : ''} can cool (fan coils and underfloor loops).` : 'No emitter can cool yet: make a radiator a fan coil on the Emitters page, or add underfloor heating.'} Valves and the cooling mode are set on the <a href={href('schematic')}>System diagram ›</a></p>
      </>}
    </Card>
  );
}

/** Design cooling load: each heated room held at the cooling setpoint through the summer peak day, room peaks and the whole-house peak. */
function CoolingLoadCard() {
  const { house, res } = useProject();
  const load = useMemo(() => (isHeatPump(house.hp.source) ? coolingLoad(house, res) : null), [house, res]);
  if (!load) return null;
  const c = house.heating.cooling, on = !!c?.on;
  const sum = load.rooms.reduce((t, r) => t + r.peakW, 0), area = load.rooms.reduce((t, r) => t + r.area, 0);
  const hr = (k: number) => `${String(k).padStart(2, '0')}:00`;
  const cap = on && given(c!.capacity) ? c!.capacity : null;
  const short = cap != null && load.blockW > cap * 1000;
  return (
    <Card title="Design cooling load" note={`Heat to take out to hold every heated room at ${load.setpoint} °C all day on the summer peak day (clear sky, 15–29 °C outside, windows shut), after a month of such days so the walls and floors have warmed through. Each room's peak sizes its emitter; the whole house peaks lower than the sum because rooms peak at different times, and that figure sizes the heat pump. Sensible heat only: fan coils also remove some moisture. Times are solar time, about an hour behind the clock in summer.`}>
      <p className="mono"><b>{fmt(load.blockW / 1000, 1)} kW</b> for the whole house at {hr(load.blockHour)} · {fmt(area > 0 ? load.blockW / area : 0)} W/m² · room peaks add to {fmt(sum / 1000, 1)} kW</p>
      {on && (cap == null
        ? <p className="small">Enter the heat pump's cooling output from its datasheet to check it against this load.</p>
        : <p className={short ? 'small bad' : 'small'}>{short ? `More than the heat pump's ${cap} kW of cooling: at the peak, rooms will run above ${load.setpoint} °C.` : `Within the heat pump's ${cap} kW of cooling.`}</p>)}
      <div className="h-table-wrap">
        <table className="h-table">
          <thead><tr><th>Room</th><th className="n">Peak W</th><th className="n">At</th><th className="n">W/m²</th><th className="n">Sun</th><th className="n">People, appliances</th><th className="n">Walls, roof, glass</th><th className="n">Air</th><th className="n">Stored heat, other</th>{on && <th className="n">Emitters W</th>}</tr></thead>
          <tbody>
            {load.rooms.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="n mono"><b>{fmt(r.peakW)}</b></td>
                <td className="n mono">{r.peakW > 0 ? hr(r.hour) : '—'}</td>
                <td className="n mono">{r.area > 0 ? fmt(r.peakW / r.area) : '—'}</td>
                {[r.sun, r.inside, r.fabric, r.air, r.other].map((v, i) => <td key={i} className="n mono">{r.peakW > 0 ? fmt(v) : '—'}</td>)}
                {on && <td className={`n mono${r.peakW > 0 && r.canW < r.peakW ? ' bad' : ''}`}>{r.canW > 0 ? fmt(r.canW) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">The parts are at each room's peak hour. "Stored heat, other" is heat given back by warm walls and floors, the ground, the loft and neighbouring rooms; it can be negative when they soak heat up.{on && ' Emitters W is what each room’s fan coils and underfloor loops on chilled water take out at the setpoint; red where it falls short.'}</p>
    </Card>
  );
}
