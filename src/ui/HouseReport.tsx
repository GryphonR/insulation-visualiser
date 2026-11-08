import { useMemo, useRef, useState } from 'react';
import { MONTHS, customMaterialsIn } from '../engine/data';
import { FUEL_LABEL, SOURCE_LABEL, buildupU, effText, isHeatPump, tariff } from '../engine/house';
import type { House } from '../engine/house';
import { RAD_LABEL, ratedOf } from '../engine/house-heating';
import type { Project } from '../engine/house-scenarios';
import { download } from '../lib/util';
import { Chip } from './controls';
import { fmt } from './hform';
import { sourceWhy } from './assumptions';
import { useProject } from './project';

const SECTIONS = [['cond', 'Design conditions'], ['rooms', 'Room-by-room table'], ['hp', 'Heat pump and running'], ['fabric', 'Build-ups (U-values)'], ['assume', 'Assumptions and checks']] as const;
type Sec = (typeof SECTIONS)[number][0];

/** Board 4e: a printable heat loss report for the scenario being edited, plus project export and import. */
export function HouseReport({ house, scenarioName, project, onImport }: { house: House; scenarioName: string; project: Project; onImport: (p: Project) => void }) {
  const { res } = useProject();
  const [inc, setInc] = useState<Record<Sec, boolean>>({ cond: true, rooms: true, hp: true, fabric: true, assume: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const emit = (id: string) => house.heating.emitters.filter((e) => e.room === id)
    .map((e) => (e.kind === 'radiator' ? `${e.len}×${e.height} ${RAD_LABEL[e.type].split(' ')[0]}` : e.kind === 'towel' ? `Towel rail ${fmt(ratedOf(e))} W` : `UFH ${fmt(e.area, 1)} m²`)).join(', ');
  const heated = res.rooms.filter((r) => r.room.heated);
  const usedB = house.buildups.filter((b) => res.rooms.some((r) => r.faces.some((f) => f.buildup.id === b.id)));

  const csv = () => {
    const rows = [['Room', 'Setpoint °C', 'Floor m²', 'Volume m³', 'Fabric W', 'Ventilation W', 'Total W', 'W/m²', 'Air changes', 'Emitters', 'Cover %']];
    for (const r of heated) {
      const c = res.heat.rooms.find((x) => x.id === r.room.id);
      rows.push([r.room.name, String(r.room.setpoint), r.area.toFixed(1), r.V.toFixed(1), r.fabricW.toFixed(0), r.ventW.toFixed(0), r.totalW.toFixed(0), r.perM2.toFixed(0), r.n.toFixed(2), emit(r.room.id), c?.has ? (c.cover * 100).toFixed(0) : '']);
    }
    download(`${scenarioName.replace(/[^\w-]+/g, '_')}-rooms.csv`, rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
  const importFile = async (f: File) => {
    try {
      const p = JSON.parse(await f.text());
      if (!p || p.v !== 1 || !Array.isArray(p.scenarios) || !p.scenarios.length) throw new Error('not a project file');
      if (confirm(`Replace the current project with "${f.name}" (${p.scenarios.length} scenario${p.scenarios.length > 1 ? 's' : ''})?`)) { onImport(p); setMsg(`Imported ${f.name}.`); }
    } catch (e) {
      setMsg(`Couldn't import ${f.name}: ${(e as Error).message}.`);
    }
  };

  return (
    <div className="house report">
      <section className="card panel no-print">
        <div className="section-head">
          <div><h2>Heat loss report</h2><p className="muted small">For the scenario being edited. Print it or save it as a PDF from the print dialog.</p></div>
          <div className="chips">
            <button type="button" className="btn-primary" onClick={() => window.print()}>Print / save PDF</button>
            <button type="button" className="btn-secondary" onClick={csv}>Room table (CSV)</button>
            <button type="button" className="btn-secondary" onClick={() => download('house-project.json', JSON.stringify({ ...project, materials: customMaterialsIn(project.scenarios.flatMap((s) => s.house.buildups.flatMap((b) => b.layers))) }, null, 1), 'application/json')}>Export project (JSON)</button>
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>Import project…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </div>
        </div>
        <div className="chips">{SECTIONS.map(([k, l]) => <Chip key={k} on={inc[k]} onClick={() => setInc({ ...inc, [k]: !inc[k] })}>{l}</Chip>)}</div>
        {msg && <p className="small">{msg}</p>}
      </section>

      <article className="card panel report-body">
        <header>
          <h1 className="report-title">{house.name}</h1>
          <p className="muted">{scenarioName} · room-by-room heat loss · {new Date().toLocaleDateString('en-GB')}</p>
        </header>
        <div className="tiles">
          <div className="tile"><span className="tiles-head">Design heat loss</span><span className="tile-value"><span className="mono big">{fmt(res.peakW / 1000, 2)}</span><span className="small muted">kW</span></span></div>
          <div className="tile"><span className="tiles-head">Heat loss parameter</span><span className="tile-value"><span className="mono big">{fmt(res.hlp, 2)}</span><span className="small muted">W/m²K</span></span></div>
          <div className="tile"><span className="tiles-head">Space heating</span><span className="tile-value"><span className="mono big">{fmt(Math.round(res.annualKWh / 100) * 100)}</span><span className="small muted">kWh/yr{res.annualFrom === "year" ? "" : " (estimate)"}</span></span></div>
          <div className="tile"><span className="tiles-head">{SOURCE_LABEL[house.hp.source]}</span><span className="tile-value"><span className="mono big">{house.hp.capacity}</span><span className="small muted">kW · {isHeatPump(house.hp.source) ? `SCOP ${fmt(res.hp.seasonal, 2)}` : `${fmt(res.hp.seasonal * 100)}% seasonal`}</span></span></div>
        </div>

        {inc.cond && <section>
          <h2>Design conditions</h2>
          <table className="h-table"><tbody>
            <tr><td>Outside design temperature</td><td className="mono">{res.Tout} °C ({Number.isFinite(house.climate.designT) ? `set by hand; MCS gives ${res.ToutMcs} °C at ` : ''}{house.climate.pct}%, {res.station}, {house.climate.altitude} m altitude)</td></tr>
            <tr><td>Ground temperature</td><td className="mono">{res.Tg} °C ({res.region} annual mean)</td></tr>
            <tr><td>Degree days</td><td className="mono">{fmt(res.hdd)} K·day, base 15.5 °C ({house.climate.postcode})</td></tr>
            <tr><td>Airtightness</td><td className="mono">q50 {fmt(res.q50, 1)} m³/h·m² ({house.vent.source === 'meas' ? 'measured' : 'estimated'}{house.calib && house.vent.source !== 'meas' ? `, ×${house.calib.q} from bills` : ''}) · {house.vent.method === 'cibse' ? 'CIBSE room-type rates' : 'whole-house model'}{house.vent.minAch ? ', 0.5 ach minimum in habitable rooms' : ''}</td></tr>
            <tr><td>Method</td><td>Steady-state room by room: U·A·ΔT through every face (BS EN ISO 6946, 13370), ventilation 0.33·n·V·ΔT, unheated spaces at their balance temperature. MCS / CIBSE DHDG 2026 design data.</td></tr>
          </tbody></table>
        </section>}

        {inc.rooms && <section>
          <h2>Room by room</h2>
          <div className="h-table-wrap"><table className="h-table">
            <thead><tr><th>Room</th><th className="n">°C</th><th className="n">m²</th><th className="n">Fabric W</th><th className="n">Vent W</th><th className="n">Total W</th><th className="n">W/m²</th><th>Emitters</th><th className="n">Cover</th></tr></thead>
            <tbody>
              {heated.map((r) => {
                const c = res.heat.rooms.find((x) => x.id === r.room.id);
                return <tr key={r.room.id}><td>{r.room.name}</td><td className="n mono">{r.room.setpoint}</td><td className="n mono">{fmt(r.area, 1)}</td><td className="n mono">{fmt(r.fabricW)}</td><td className="n mono">{fmt(r.ventW)}</td><td className="n mono">{fmt(r.totalW)}</td><td className="n mono">{fmt(r.perM2)}</td><td className="small">{emit(r.room.id) || '—'}</td><td className={`n mono ${c && c.cover < 0.995 ? 'bad' : ''}`}>{c?.has ? `${fmt(c.cover * 100)}%` : '—'}</td></tr>;
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}>Whole house</td><td className="n mono">{fmt(res.peakW)}</td><td colSpan={3} /></tr></tfoot>
          </table></div>
          <p className="small muted">Unheated: {res.rooms.filter((r) => !r.room.heated).map((r) => `${r.room.name} ${fmt(r.T, 1)} °C`).join(', ') || 'none'}{res.loft ? `; loft ${fmt(res.loft.T, 1)} °C` : ''}. Paths: {res.paths.map((p) => `${p.label.toLowerCase()} ${fmt(p.W)} W`).join(', ')}.</p>
        </section>}

        {inc.hp && <section>
          <h2>Heat source and running</h2>
          <p className="small">{SOURCE_LABEL[house.hp.source]}{isHeatPump(house.hp.source) ? '' : ` on ${FUEL_LABEL[house.hp.fuel].toLowerCase()}`}, {house.hp.capacity} kW at {res.Tout} °C ({res.hp.spare >= 0 ? `${fmt(res.hp.spare * 100)}% spare` : `${fmt(-res.hp.spare * 100)}% short`}). Flow {fmt(res.heat.designFlow, 1)} °C on the design day ({house.heating.control === 'ideal' ? 'ideal weather compensation' : house.heating.control === 'curve' ? 'weather compensation curve' : 'fixed flow'}){res.heat.gov ? `, set by ${house.rooms.find((r) => r.id === res.heat.gov!.id)?.name}` : ''}. {effText(house.hp.source, res.hp.designEff)} on the design day, {effText(house.hp.source, res.hp.seasonal)} over the year.</p>
          <p className="small">{fmt(res.hp.kwh)} kWh {isHeatPump(house.hp.source) ? 'electricity' : FUEL_LABEL[house.hp.fuel].toLowerCase()} a year for space heating, about £{fmt(res.hp.cost)} at {tariff(house.hp).p}p/kWh{tariff(house.hp).standing ? ' plus the gas standing charge' : ' (standing charges not included)'}, and {fmt(res.hp.co2)} kgCO₂ at {tariff(house.hp).co2} kg/kWh.</p>
          <p className="small muted">How the efficiency is worked out: {sourceWhy(house.hp)} Space heating only; hot water, pumps and backup heaters are not included.</p>
          <table className="h-table months-t"><thead><tr><th />{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}</tr></thead>
            <tbody><tr><td>Heat kWh</td>{res.months.map((m, i) => <td key={i} className="n mono">{fmt(m.heat)}</td>)}</tr><tr><td>{isHeatPump(house.hp.source) ? 'COP' : 'Efficiency %'}</td>{res.months.map((m, i) => <td key={i} className="n mono">{m.heat > 0 ? (isHeatPump(house.hp.source) ? fmt(m.eff, 1) : fmt(m.eff * 100)) : '—'}</td>)}</tr></tbody>
          </table>
        </section>}

        {inc.fabric && <section>
          <h2>Build-ups</h2>
          <table className="h-table"><thead><tr><th>Build-up</th><th>Layers (outside → inside)</th><th className="n">U W/m²K</th></tr></thead>
            <tbody>{usedB.map((b) => <tr key={b.id}><td>{b.name}</td><td className="small">{b.u != null ? 'declared U' : b.layers.map(([m, t]) => `${m} ${t} mm`).join(' · ')}</td><td className="n mono">{fmt(buildupU(b), 2)}</td></tr>)}</tbody>
          </table>
          <p className="small muted">U shown with outside-wall surface resistances; each face uses the right ones for where it sits. Ground floors are by BS EN ISO 13370 for the whole floor.</p>
        </section>}

        {inc.assume && <section>
          <h2>Assumptions and checks</h2>
          <ul className="small">
            {house.calib && <li>{house.calib.note}: rooms {house.calib.dt > 0 ? '+' : ''}{house.calib.dt} K against setpoints, {Math.round(house.calib.hf * 100)}% of rooms heated.</li>}
            {house.vent.source !== 'meas' && <li>Airtightness is estimated from the house's age and features ({house.vent.factors.filter((f) => f.on).map((f) => f.label.toLowerCase()).join(', ')}). A blower-door test would firm it up.</li>}
            <li>{house.floorEdge && house.floorEdge.upstand !== 'off' ? 'The ground floor-to-wall junction is included; other' : 'Thermal bridges at'} junctions are not included.</li>
            {res.checks.map((c, i) => <li key={i} className={c.level === 'error' ? 'bad' : 'warn'}>{c.text}</li>)}
          </ul>
        </section>}
      </article>
    </div>
  );
}
