import { COLOURS, MONTHS } from '../engine/data';
import { MCS_MEAN_TEMPS, MCS_STATIONS, ROOM_TEMPS } from '../engine/climate-mcs';
import { FUEL_LABEL, SIDES, SOURCE_LABEL, activeSheet, bearingLabel, defaultTemp, deviceM3, isHeatPump, pointFactor, tariff, trueBearing } from '../engine/house';
import type { Fuel, HeatPumpSheet, HeatSource, RoomType } from '../engine/house';
import { Chip } from './controls';
import { Card, Num, Why, fmt } from './hform';
import { WHY, sourceWhy } from './assumptions';
import { useProject } from './project';

const ROOM_TYPES = Object.keys(ROOM_TEMPS) as RoomType[];

/** Climate and room temperatures: where the house is and what it is held at. */
export function SitePage() {
  const { house, upd, res } = useProject();
  return (
    <div className="house-grid">
      <div className="house-col">
          <Card title="Climate" note="MCS design conditions: the nearest weather station and region to the postcode, altitude, and degree days for the postcode area.">
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Postcode</span><input className="h-text short" value={house.climate.postcode} onChange={(e) => upd((h) => { h.climate.postcode = e.target.value; })} /></label>
              <label className="small"><input type="checkbox" checked={house.climate.auto !== false} onChange={(e) => upd((h) => {
                // Turning the lookup off keeps whatever it had found, ready to adjust by hand.
                if (!e.target.checked) { h.climate.station = res.climate.station; h.climate.region = res.climate.region; }
                h.climate.auto = e.target.checked;
              })} /> Station and region from the postcode</label>
            </div>
            {house.climate.auto !== false && (
              <p className="small">{res.climate.fromPostcode
                ? `Nearest station ${res.station} (${MCS_STATIONS[res.climate.station][1]}), ${fmt(res.climate.km)} km away; ground temperature from ${res.region}.`
                : `Postcode "${house.climate.postcode}" isn't in the bundled table, so the station and region below are used.`}</p>
            )}
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Weather station</span>
                <select className="select" disabled={res.climate.fromPostcode} value={res.climate.station} onChange={(e) => upd((h) => { h.climate.station = Number(e.target.value); })}>
                  {MCS_STATIONS.map((s, i) => <option key={i} value={i}>{s[0]} ({s[1]}, {s[4]} m)</option>)}
                </select>
              </label>
              <label className="hf"><span className="eyebrow">Percentile</span>
                <select className="select" value={house.climate.pct} onChange={(e) => upd((h) => { h.climate.pct = e.target.value as '99.6' | '99'; })}>
                  <option value="99.6">99.6% (default)</option><option value="99">99%</option>
                </select>
              </label>
              <Num label="Altitude" unit="m" step={10} value={house.climate.altitude} onChange={(v) => upd((h) => { h.climate.altitude = v; })} />
              <label className="hf"><span className="eyebrow">Region (ground temperature)</span>
                <select className="select" disabled={res.climate.fromPostcode} value={res.climate.region} onChange={(e) => upd((h) => { h.climate.region = Number(e.target.value); })}>
                  {MCS_MEAN_TEMPS.map((s, i) => <option key={i} value={i}>{s[0]} ({s[4]} °C)</option>)}
                </select>
              </label>
              <Num label="Neighbour (party walls)" unit="°C" step={0.5} value={house.neighbourT} onChange={(v) => upd((h) => { h.neighbourT = v; })} />
            </div>
            <p className="small muted mono">Design outside {res.Tout} °C · ground {res.Tg} °C · {fmt(res.hdd)} degree days{res.hddKnown ? '' : ' (default)'}</p>
          </Card>
      </div>
      <div className="house-col">
          <Card title="Room temperatures" note="Default setpoint for each room type: MCS / CIBSE DHDG 2026 Table 2-2 by age band, or your own. Each room can still have its own setpoint.">
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Age band (EPC)</span>
                <select className="select" value={house.ageBand ?? 'AJ'} onChange={(e) => upd((h) => { h.ageBand = e.target.value as 'AJ' | 'K'; })}>
                  <option value="AJ">A–J (built before 2007)</option><option value="K">K onwards (2007 or later)</option>
                </select>
              </label>
              <button type="button" className="btn-secondary" onClick={() => upd((h) => { h.rooms.forEach((r) => { if (r.heated) r.setpoint = defaultTemp(h, r.type); }); })}>Apply to every heated room</button>
            </div>
            <div className="temps">
              {ROOM_TYPES.map((t) => {
                const own = house.roomTemps?.[t];
                return (
                  <label key={t} className="small temp">
                    <span>{t}</span>
                    <input type="number" className="thk-input" step={0.5} value={defaultTemp(house, t)} aria-label={`${t} default temperature`}
                      onChange={(e) => upd((h) => { h.roomTemps = { ...h.roomTemps, [t]: Number(e.target.value) }; })} />
                    {own != null ? <button type="button" className="btn-link inline" onClick={() => upd((h) => { const r = { ...h.roomTemps }; delete r[t]; h.roomTemps = r; })}>reset</button> : <span className="muted">MCS</span>}
                  </label>
                );
              })}
            </div>
          </Card>
      </div>
    </div>
  );
}

/** Board 1d: ventilation and airtightness. */
export function VentPage() {
  const { house, upd, res } = useProject();
  const nameOf = (id: string) => house.rooms.find((r) => r.id === id)?.name ?? id;
  return (
    <div className="house">
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
    </div>
  );
}

/** Storeys, ground and loft. */
export function StoreysPage() {
  const { house, upd, res } = useProject();
  return (
    <div className="house-grid">
      <div className="house-col">
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
      </div>
      <div className="house-col">
          <Card title="Loft" note={res.loft ? `Settles at ${fmt(res.loft.T, 1)} °C on the design day.` : 'No loft: top-storey ceilings are flat roofs.'}>
            <div className="hf-row">
              <label className="small"><input type="checkbox" checked={house.loft.present} onChange={(e) => upd((h) => { h.loft.present = e.target.checked; })} /> Loft over the top storey</label>
              <Num label="Ventilation" unit="ach" value={house.loft.ach} min={0} onChange={(v) => upd((h) => { h.loft.ach = v; })} />
              <Num label="Mean height" unit="m" value={house.loft.height} min={0.1} onChange={(v) => upd((h) => { h.loft.height = v; })} />
              <Num label="Roof pitch" unit="°" step={1} min={0} max={70} value={house.loft.pitch} onChange={(v) => upd((h) => { h.loft.pitch = v; })} />
            </div>
            {house.loft.present && <div className="stack-10">
              <div className="chips" role="group" aria-label="Roof form">
                {([['gable', 'Gable'], ['hip', 'Hipped'], ['mono', 'Monopitch']] as const).map(([k, l]) => <Chip key={k} on={(house.loft.form ?? 'gable') === k} onClick={() => upd((h) => { h.loft.form = k; })}>{l}</Chip>)}
              </div>
              {house.loft.form === 'mono' ? (
                <div className="chips" role="group" aria-label="Slope faces">
                  {SIDES.map((s, i) => <Chip key={s} on={(house.loft.facing ?? 'S') === s} onClick={() => upd((h) => { h.loft.facing = s; })}>{`Faces ${bearingLabel(trueBearing(house, i * 90))}`}</Chip>)}
                </div>
              ) : (
                <div className="chips" role="group" aria-label="Ridge runs">
                  {([[undefined, 'Ridge along the longer side'], ['x', 'Ridge left–right on the plan'], ['y', 'Ridge up–down on the plan']] as const).map(([k, l]) => <Chip key={l} on={house.loft.ridge === k} onClick={() => upd((h) => { if (k) h.loft.ridge = k; else delete h.loft.ridge; })}>{l}</Chip>)}
                </div>
              )}
              <div className="chips" role="group" aria-label="Roof colour">
                {COLOURS.map((c) => <Chip key={c.id} on={(house.roofColour ?? 'mid') === c.id} onClick={() => upd((h) => { h.roofColour = c.id; })}>{c.label}</Chip>)}
              </div>
              {res.loft && <p className="small mono">{res.loft.slopes.map((s) => `${bearingLabel(s.az)} ${fmt(s.area, 1)} m²`).join(' · ')}</p>}
              <p className="small muted">Sun on each slope warms the loft in the hour-by-hour runs; the design day is overcast, so heat loss doesn't change. The colour applies to every roof, slopes and flat roofs included.</p>
            </div>}
          </Card>
      </div>
    </div>
  );
}

const SOURCE_NOTE: Record<HeatSource, string> = {
  boiler: 'An older boiler that never condenses: the same seasonal efficiency whatever the flow temperature.',
  condensing: 'Efficiency set by the return water temperature month by month: it condenses, and gains up to ~10%, only when the return is below the flue dew point.',
  ashp: 'COP estimated from outside air and flow temperature for a typical unit, not a specific model.',
  gshp: 'COP estimated from the ground loop and flow temperature for a typical unit, not a specific model.',
};

/** Standard EN 14511 test points, offered in turn by "Add point". */
const STD_POINTS: Record<'ashp' | 'gshp', Array<[number, number]>> = {
  ashp: [[7, 35], [2, 35], [-7, 35], [7, 55], [2, 55], [-7, 55]],
  gshp: [[0, 35], [0, 45], [0, 55], [5, 35]],
};

/** A specific heat pump's datasheet COP points, which replace the performance factor. */
function SheetEditor() {
  const { house, upd } = useProject();
  const s = house.hp.source === 'gshp' ? 'gshp' : 'ashp', L = s === 'gshp' ? 'B' : 'A';
  const sheet = house.hp.sheet?.source === s ? house.hp.sheet : null;
  const set = (fn: (sh: HeatPumpSheet) => void) => upd((h) => {
    const cur: HeatPumpSheet = h.hp.sheet?.source === s ? h.hp.sheet : { source: s, model: '', points: [] };
    fn(cur); h.hp.sheet = cur;
  });
  const num = (v: string) => (v === '' ? NaN : Number(v));
  const next = STD_POINTS[s].find(([a, b]) => !sheet?.points.some((p) => p.src === a && p.flow === b)) ?? STD_POINTS[s][0];
  const active = activeSheet(house.hp);
  return (
    <div className="sheet">
      <h3 className="eyebrow">Datasheet for a specific heat pump<Why>{WHY.sheet}</Why></h3>
      {!sheet ? <p className="small muted">No datasheet: COP uses the performance factor above. Add a datasheet point to match a real unit.</p> : <>
        <label className="hf"><span className="eyebrow">Make and model</span>
          <input className="h-text" value={sheet.model} placeholder="e.g. 7 kW monobloc" onChange={(e) => set((sh) => { sh.model = e.target.value; })} /></label>
        <div className="h-table-wrap">
          <table className="h-table">
            <thead><tr><th className="n">{s === 'gshp' ? 'Brine' : 'Outside air'} °C</th><th className="n">Flow °C</th><th className="n">COP</th><th>Test point</th><th className="n">Factor<Why>{WHY.pointFactor}</Why></th><th /></tr></thead>
            <tbody>
              {sheet.points.map((p, i) => {
                const ok = p.cop > 0 && Number.isFinite(p.src) && Number.isFinite(p.flow);
                return (
                  <tr key={i}>
                    <td className="n"><input type="number" className="thk-input" aria-label={`Point ${i + 1} source temperature`} value={Number.isFinite(p.src) ? p.src : ''} onChange={(e) => set((sh) => { sh.points[i].src = num(e.target.value); })} /></td>
                    <td className="n"><input type="number" className="thk-input" aria-label={`Point ${i + 1} flow temperature`} value={Number.isFinite(p.flow) ? p.flow : ''} onChange={(e) => set((sh) => { sh.points[i].flow = num(e.target.value); })} /></td>
                    <td className="n"><input type="number" className="thk-input" step={0.01} aria-label={`Point ${i + 1} COP`} value={Number.isFinite(p.cop) ? p.cop : ''} onChange={(e) => set((sh) => { sh.points[i].cop = num(e.target.value); })} /></td>
                    <td className="mono small">{L}{p.src}/W{p.flow}</td>
                    <td className="n mono">{ok ? fmt(pointFactor(s, p), 2) : '—'}</td>
                    <td><button type="button" className="btn-secondary" aria-label={`Remove point ${L}${p.src}/W${p.flow}`} onClick={() => set((sh) => { sh.points.splice(i, 1); })}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <div className="chips">
        <button type="button" className="btn-secondary" onClick={() => set((sh) => { sh.points.push({ src: next[0], flow: next[1], cop: NaN }); })}>Add point {L}{next[0]}/W{next[1]}</button>
        {sheet && <button type="button" className="btn-secondary" onClick={() => upd((h) => { delete h.hp.sheet; })}>Remove datasheet</button>}
      </div>
      {sheet && !active && <p className="small muted">Enter a COP for at least one point to use the datasheet.</p>}
    </div>
  );
}

function Tile({ head, why, value, unit }: { head: string; why: string; value: string; unit: string }) {
  return <div className="tile"><span className="tiles-head">{head}<Why>{why}</Why></span><span className="tile-value"><span className="mono big">{value}</span><span className="small muted">{unit}</span></span></div>;
}

/** Heat source and running cost, by month. */
export function EnergyPage() {
  const { house, upd, res } = useProject();
  const s = house.hp.source, hp = isHeatPump(s), tf = tariff(house.hp), sheet = activeSheet(house.hp);
  return (
    <div className="house">
          <Card title="Heat source and running cost" note="Space heating only; hot water comes later. Make a scenario with a different heat source to compare them.">
            <div className="chips" role="group" aria-label="Heat source">
              {(Object.keys(SOURCE_LABEL) as HeatSource[]).map((k) => <Chip key={k} on={s === k} onClick={() => upd((h) => { h.hp.source = k; })}>{SOURCE_LABEL[k]}</Chip>)}
            </div>
            {!hp && <div className="chips" role="group" aria-label="Boiler fuel">
              {(Object.keys(FUEL_LABEL) as Fuel[]).map((k) => <Chip key={k} on={house.hp.fuel === k} onClick={() => upd((h) => { h.hp.fuel = k; })}>{FUEL_LABEL[k]}</Chip>)}
            </div>}
            <p className="small muted">{sheet ? `COP calibrated to the ${sheet.model || 'entered'} datasheet points.` : SOURCE_NOTE[s]}<Why label="How is the efficiency worked out?">{sourceWhy(house.hp)}</Why></p>
            <div className="hf-row">
              <Num label="Output at design temp" unit="kW" value={house.hp.capacity} min={0} why={WHY.capacity} onChange={(v) => upd((h) => { h.hp.capacity = v; })} />
              <Num label="Max flow" unit="°C" step={1} value={house.hp.maxFlow} onChange={(v) => upd((h) => { h.hp.maxFlow = v; })} />
              {s === 'boiler' && <Num label="Seasonal efficiency" unit="%" step={1} value={house.hp.boilerEff} why={WHY.boilerEff} onChange={(v) => upd((h) => { h.hp.boilerEff = v; })} />}
              {hp && !sheet && <Num label="Performance factor" unit="× ideal COP" step={0.01} min={0.2} max={0.8} value={house.hp.hpFactor} why={WHY.hpFactor} onChange={(v) => upd((h) => { h.hp.hpFactor = v; })} />}
            </div>
            {hp && <SheetEditor />}
            <h3 className="eyebrow">Your prices</h3>
            <div className="hf-row">
              <Num label="Electricity" unit="p/kWh" step={0.01} value={house.hp.elecP} why={WHY.elecP} onChange={(v) => upd((h) => { h.hp.elecP = v; })} />
              <Num label="Gas" unit="p/kWh" step={0.01} value={house.hp.gasP} why={WHY.gasP} onChange={(v) => upd((h) => { h.hp.gasP = v; })} />
              <Num label="Oil" unit="p/kWh" step={0.01} value={house.hp.oilP} why={WHY.oilP} onChange={(v) => upd((h) => { h.hp.oilP = v; })} />
              <Num label="LPG" unit="p/kWh" step={0.01} value={house.hp.lpgP} why={WHY.lpgP} onChange={(v) => upd((h) => { h.hp.lpgP = v; })} />
            </div>
            <div className="hf-row">
              <label className="hf-lab small"><input type="checkbox" checked={house.hp.gasStanding} onChange={(e) => upd((h) => { h.hp.gasStanding = e.target.checked; })} /> Include the gas standing charge for gas boilers</label>
              <Why>{WHY.standing}</Why>
              {house.hp.gasStanding && <Num label="Gas standing" unit="p/day" step={0.01} value={house.hp.gasSC} why={WHY.gasSC} onChange={(v) => upd((h) => { h.hp.gasSC = v; })} />}
            </div>
            <h3 className="eyebrow">Carbon factors</h3>
            <div className="hf-row">
              {(['elec', 'gas', 'oil', 'lpg'] as const).map((k) => <Num key={k} label={k === 'elec' ? 'Electricity' : FUEL_LABEL[k]} unit="kgCO₂/kWh" step={0.001} value={house.hp.co2[k]} why={WHY.co2} onChange={(v) => upd((h) => { h.hp.co2[k] = v; })} />)}
            </div>
            <div className="tiles">
              <Tile head={hp ? 'Estimated COP at design' : 'Efficiency at design'} why={sourceWhy(house.hp)} value={hp ? fmt(res.hp.designEff, 2) : fmt(res.hp.designEff * 100)} unit={hp ? `at ${res.Tout} °C outside` : '%'} />
              <Tile head={hp ? 'Estimated SCOP' : 'Seasonal efficiency'} why={WHY.seasonal} value={hp ? fmt(res.hp.seasonal, 2) : fmt(res.hp.seasonal * 100)} unit={hp ? (sheet ? `from ${sheet.model || 'datasheet'}` : 'typical unit') : '%'} />
              <Tile head="Energy bought" why={WHY.bought} value={fmt(res.hp.kwh)} unit={`kWh ${hp ? 'electricity' : FUEL_LABEL[house.hp.fuel].toLowerCase()}`} />
              <Tile head="Running cost" why={WHY.cost(house.hp)} value={`£${fmt(res.hp.cost)}`} unit={tf.standing ? `/yr incl. £${fmt(tf.standing)} standing` : '/yr'} />
              <Tile head="Carbon" why={WHY.carbon} value={fmt(res.hp.co2)} unit="kgCO₂/yr" />
            </div>
            <div className="h-table-wrap">
              <table className="h-table months-t">
                <thead><tr><th />{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Heat kWh</td>{res.months.map((m, i) => <td key={i} className="n mono">{fmt(m.heat)}</td>)}</tr>
                  <tr><td>Flow °C</td>{res.months.map((m, i) => <td key={i} className="n mono">{fmt(m.flow)}</td>)}</tr>
                  <tr><td>{hp ? 'Est. COP' : 'Efficiency %'}<Why>{sourceWhy(house.hp)}</Why></td>{res.months.map((m, i) => <td key={i} className="n mono">{hp ? fmt(m.eff, 1) : fmt(m.eff * 100)}</td>)}</tr>
                  <tr><td>Bought kWh<Why>{WHY.bought}</Why></td>{res.months.map((m, i) => <td key={i} className="n mono">{fmt(m.bought)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </Card>
    </div>
  );
}
