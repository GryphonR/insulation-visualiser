import { useMemo, useRef, useState } from 'react';
import { given } from '../engine/house-heating';
import { MONTHS } from '../engine/data';
import { coverText, emitterText, layersText, reportBuildups, heatPaths, methodRows } from './reportText';
import { downloadMcsPdf } from './mcsPdf';
import { projectFileText } from '../engine/projects';
import { FUEL_LABEL, SOURCE_LABEL, buildupU, dhwDemand, effText, isHeatPump, mcsOf, tariff } from '../engine/house';
import type { House, McsDetails } from '../engine/house';
import type { Project } from '../engine/house-scenarios';
import { download } from '../lib/util';
import { Chip } from './controls';
import { SheetNum, fmt } from './hform';
import { sourceWhy } from './assumptions';
import { useProject } from './project';

const SECTIONS = [['cond', 'Method and conditions'], ['rooms', 'Room-by-room table'], ['mcs', 'MCS design summary'], ['faces', 'Room elements'], ['hp', 'Heat pump and running'], ['fabric', 'Build-ups (U-values)'], ['assume', 'Assumptions and checks']] as const;
const DETAILS: Array<[keyof McsDetails, string, string?]> = [['client', 'Client'], ['site', 'Site address'], ['contractor', 'MCS contractor'], ['certNo', 'Certification body and number'], ['designer', 'Designer'],
  ['cylinder', 'Cylinder', 'make, model, litres'], ['metering', 'Metering', 'e.g. heat meter for BUS']];
const missing = <span className="bad">not entered</span>;
type Sec = (typeof SECTIONS)[number][0];

/** Board 4e: a printable heat loss report for the scenario being edited, plus project export and import. */
export function HouseReport({ house, scenarioName, project, onImport }: { house: House; scenarioName: string; project: Project; onImport: (p: Project) => void }) {
  // The report is the MCS design; the running costs and the comparison line come from the best estimate.
  const { best, upd } = useProject();
  const res = mcsOf(best);
  const [inc, setInc] = useState<Record<Sec, boolean>>({ cond: true, rooms: true, mcs: true, faces: true, hp: true, fabric: true, assume: true });
  // shortcut: kept per scenario like the rest of the house, so a new scenario copies them; move to the project if they drift apart.
  const d = house.mcs ?? {};
  const setD = (k: keyof McsDetails, v: string | number | undefined) => upd((h) => { h.mcs = { ...h.mcs, [k]: v === '' ? undefined : v }; });
  const dhw = dhwDemand(house), hp = isHeatPump(house.hp.source);
  const govName = res.heat.gov ? house.rooms.find((r) => r.id === res.heat.gov!.id)?.name : undefined;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const emit = (id: string) => house.heating.emitters.filter((e) => e.room === id).map(emitterText).join(', ');
  const heated = res.rooms.filter((r) => r.room.heated);
  const paths = heatPaths(res).map(([l, w]): [string, number] => [l.toLowerCase(), w]);
  const usedB = reportBuildups(house, res);

  const csv = () => {
    const rows = [['Room', 'Setpoint °C', 'Floor m²', 'Volume m³', 'Fabric W', 'Ventilation W', 'Total W', 'W/m²', 'Air changes', 'Emitters', 'Cover %']];
    for (const r of heated) {
      const c = res.heat.rooms.find((x) => x.id === r.room.id);
      rows.push([r.room.name, String(r.room.setpoint), r.area.toFixed(1), r.V.toFixed(1), (r.fabricW).toFixed(0), r.ventW.toFixed(0), r.totalW.toFixed(0), r.perM2.toFixed(0), r.n.toFixed(2), emit(r.room.id), c?.has ? coverText(c.out, r.totalW) : '']);
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
          <div><h2>Heat loss report</h2><p className="muted small">For the scenario being edited. The MCS report is a PDF made for sending: cover with your details, the whole house with its plans, then room by room.</p></div>
          <div className="chips">
            <button type="button" className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await downloadMcsPdf(house, res, scenarioName); } catch (e) { setMsg(`Couldn't make the PDF: ${(e as Error).message}.`); } finally { setBusy(false); } }}>{busy ? 'Making PDF…' : 'Download MCS report (PDF)'}</button>
            <button type="button" className="btn-secondary" onClick={() => window.print()}>Print this page</button>
            <button type="button" className="btn-secondary" onClick={csv}>Room table (CSV)</button>
            <button type="button" className="btn-secondary" onClick={() => download('house-project.json', projectFileText(project), 'application/json')}>Export project (JSON)</button>
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>Import project…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </div>
        </div>
        <div className="chips">{SECTIONS.map(([k, l]) => <Chip key={k} on={inc[k]} onClick={() => setInc({ ...inc, [k]: !inc[k] })}>{l}</Chip>)}</div>
        {msg && <p className="small">{msg}</p>}
        <h3>MCS details</h3>
        <p className="small muted">For the report header and the MIS 3005-D design summary. Only you can give these: the SCoP comes from the heat pump's MCS product listing at the design flow temperature.</p>
        <div className="chips">
          {DETAILS.map(([k, l, ph]) => <label key={k} className="hf"><span className="eyebrow">{l}</span><input className="h-text" value={(d[k] as string) ?? ''} placeholder={ph} onChange={(e) => setD(k, e.target.value)} /></label>)}
          <SheetNum label="Cylinder recovery" unit="min" step={1} value={d.recovery} onChange={(v) => setD('recovery', v)} />
          {hp && <SheetNum label={`MCS SCoP at ${fmt(res.heat.designFlow)} °C`} unit="" step={0.01} value={d.scop} onChange={(v) => setD('scop', v)} />}
        </div>
      </section>

      <article className="card panel report-body">
        <header>
          <h1 className="report-title">{house.name}</h1>
          <p className="muted">{scenarioName} · room-by-room heat loss to BS EN 12831-1:2017 and MIS 3005-D · {new Date().toLocaleDateString('en-GB')}</p>
          <p className="small">
            {DETAILS.slice(0, 5).map(([k, l]) => <span key={k}>{l}: {(d[k] as string) || missing}<br /></span>)}
            Postcode: {house.climate.postcode || missing}
          </p>
        </header>
        <div className="tiles">
          <div className="tile"><span className="tiles-head">Design heat loss</span><span className="tile-value"><span className="mono big">{fmt(res.peakW / 1000, 2)}</span><span className="small muted">kW</span></span></div>
          <div className="tile"><span className="tiles-head">Heat loss parameter</span><span className="tile-value"><span className="mono big">{fmt(res.hlp, 2)}</span><span className="small muted">W/m²K</span></span></div>
          <div className="tile"><span className="tiles-head">Space heating</span><span className="tile-value"><span className="mono big">{fmt(Math.round(best.annualKWh / 100) * 100)}</span><span className="small muted">kWh/yr{best.annualFrom === "year" ? "" : " (estimate)"}</span></span></div>
          <div className="tile"><span className="tiles-head">{SOURCE_LABEL[house.hp.source]}</span><span className="tile-value"><span className="mono big">{given(house.hp.capacity) ? house.hp.capacity : '—'}</span><span className="small muted">kW{given(house.hp.capacity) ? '' : ' not entered'} · {hp ? (given(d.scop) ? `MCS SCoP ${fmt(d.scop, 2)}` : 'MCS SCoP not entered') : `${fmt(best.hp.seasonal * 100)}% seasonal`}</span></span></div>
        </div>

        {inc.cond && <section>
          <h2>Method and design conditions</h2>
          <table className="h-table"><tbody>
            {methodRows(house, res).map(([k, t]) => <tr key={k}><td>{k}</td><td>{t}</td></tr>)}
          </tbody></table>
        </section>}

        {inc.rooms && <section>
          <h2>Room by room</h2>
          <div className="h-table-wrap"><table className="h-table">
            <thead><tr><th>Room</th><th className="n">°C</th><th className="n">m²</th><th className="n">Fabric W</th><th className="n">Vent W</th><th className="n">Total W</th><th className="n">W/m²</th><th>Emitters</th><th className="n">Cover</th></tr></thead>
            <tbody>
              {heated.map((r) => {
                const c = res.heat.rooms.find((x) => x.id === r.room.id);
                return <tr key={r.room.id}><td>{r.room.name}</td><td className="n mono">{r.room.setpoint}</td><td className="n mono">{fmt(r.area, 1)}</td><td className="n mono">{fmt(r.fabricW)}</td><td className="n mono">{fmt(r.ventW)}</td><td className="n mono">{fmt(r.totalW)}</td><td className="n mono">{fmt(r.perM2)}</td><td className="small">{emit(r.room.id) || '—'}</td><td className={`n mono ${c?.has && c.out < r.totalW * 0.995 ? 'bad' : ''}`}>{c?.has ? coverText(c.out, r.totalW) : '—'}</td></tr>;
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}>Rooms added up, each in its own worst case (sizes the emitters)</td><td className="n mono">{fmt(res.roomSumW)}</td><td colSpan={3} /></tr><tr><td colSpan={5}>Whole house at once (sizes the heat source)</td><td className="n mono">{fmt(res.peakW)}</td><td colSpan={3} /></tr></tfoot>
          </table></div>
          <p className="small muted">The two totals differ only in ventilation. Each room is sized for the wind blowing on its own side and its full fresh air; across the whole house that air comes in once and passes from room to room, so the house needs less at any one moment than its rooms added up (BS EN 12831-1 eq. 16 and 17).</p>
          <p className="small muted">Unheated: {res.rooms.filter((r) => !r.room.heated).map((r) => `${r.room.name} ${fmt(r.T, 1)} °C`).join(', ') || 'none'}{res.loft ? `; loft ${fmt(res.loft.T, 1)} °C` : ''}. Paths: {paths.map(([l, w]) => `${l} ${fmt(w)} W`).join(', ')}.</p>
        </section>}

        {inc.mcs && <section>
          <h2>MCS design summary</h2>
          <p className="small muted">What MIS 3005-D clause 5.9.2 asks the customer to be given in writing before installation.</p>
          <table className="h-table"><tbody>
            <tr><td>a) Heat loss of each room</td><td>W/m² in the room-by-room table{inc.rooms ? '' : ' (switched off in this report)'}</td></tr>
            <tr><td>b) Daily hot water demand</td><td className="mono">{dhw.litres} litres (45 × {dhw.n}: the greater of {dhw.bedrooms} bedrooms + 1 and {house.gains.people} occupants, clause 5.6.2)</td></tr>
            <tr><td>c) Emitters</td><td>Type and size in the room-by-room table</td></tr>
            <tr><td>d) Design emitter temperature</td><td className="mono">{fmt(res.heat.designFlow, 1)} °C flow, {fmt(res.heat.designFlow - house.heating.dT, 1)} °C return{govName ? `, set by ${govName}` : ''}</td></tr>
            <tr><td>e) Hot water cylinder</td><td>{d.cylinder || missing}{given(d.recovery) ? `, recovers in ${fmt(d.recovery)} min` : <>, recovery time {missing}</>}</td></tr>
            <tr><td>f) Design flow temperature leaving the heat source</td><td className="mono">{fmt(res.heat.designFlow, 1)} °C</td></tr>
            {hp && <tr><td>g) SCoP from the MCS listing</td><td className="mono">{given(d.scop) ? `${fmt(d.scop, 2)} at ${fmt(res.heat.designFlow)} °C flow` : missing}</td></tr>}
            <tr><td>h) Metering</td><td>{d.metering || missing}</td></tr>
          </tbody></table>
        </section>}

        {inc.faces && <section>
          <h2>Room elements</h2>
          <p className="small muted">Every face and the ventilation in each heated room on the design day: area, U-value (with ΔU {res.tb} W/m²K for thermal bridging on the heated envelope), the temperature difference to what is on the other side, and the heat lost.</p>
          {heated.map((r) => <div key={r.room.id} className="h-table-wrap"><table className="h-table">
            <thead><tr><th>{r.room.name} ({r.room.setpoint} °C)</th><th>To</th><th>Build-up</th><th className="n">m²</th><th className="n">U</th><th className="n">ΔT K</th><th className="n">W</th></tr></thead>
            <tbody>{r.rows.map((x) => <tr key={x.key}><td>{x.label}</td><td>{x.to}</td><td className="small">{x.buildup}</td><td className="n mono">{x.kind === 'vent' ? '' : fmt(x.area, 2)}</td><td className="n mono">{x.kind === 'vent' ? '' : fmt(x.U, 2)}</td><td className="n mono">{fmt(x.dT, 1)}</td><td className="n mono">{fmt(x.W)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={6}>Total</td><td className="n mono">{fmt(r.totalW)}</td></tr></tfoot>
          </table></div>)}
        </section>}

        {inc.hp && <section>
          <h2>Heat source and running</h2>
          {hp && <p className="small warn">This running estimate comes from this tool's own model, not the MCS 031 performance estimate from the EPC that MIS 3005-D clause 4.1 requires. Treat it with caution if it is much better than the MCS 031 figure.</p>}
          <p className="small">{SOURCE_LABEL[house.hp.source]}{isHeatPump(house.hp.source) ? '' : ` on ${FUEL_LABEL[house.hp.fuel].toLowerCase()}`}{given(house.hp.capacity) ? `, ${house.hp.capacity} kW at ${res.Tout} °C (${res.hp.spare >= 0 ? `${fmt(res.hp.spare * 100)}% spare` : `${fmt(-res.hp.spare * 100)}% short`})` : ', output not entered'}. Flow {fmt(res.heat.designFlow, 1)} °C on the design day ({house.heating.control === 'ideal' ? 'ideal weather compensation' : house.heating.control === 'curve' ? 'weather compensation curve' : 'fixed flow'}){res.heat.gov ? `, set by ${house.rooms.find((r) => r.id === res.heat.gov!.id)?.name}` : ''}. {effText(house.hp.source, best.hp.designEff)} on the design day, {effText(house.hp.source, best.hp.seasonal)} over the year.</p>
          <p className="small">{fmt(best.hp.kwh)} kWh {isHeatPump(house.hp.source) ? 'electricity' : FUEL_LABEL[house.hp.fuel].toLowerCase()} a year for space heating, about £{fmt(best.hp.cost)} at {tariff(house.hp).p}p/kWh{tariff(house.hp).standing ? ' plus the gas standing charge' : ' (standing charges not included)'}, and {fmt(best.hp.co2)} kgCO₂ at {tariff(house.hp).co2} kg/kWh.</p>
          {best.cool && <p className="small">Cooling: {Number.isFinite(best.cool.kwh) ? `${fmt(best.cool.kwh)} kWh electricity a year to take out ${fmt(best.cool.removed)} kWh, about £${fmt(best.cool.cost)}` : `${fmt(best.cool.removed)} kWh a year taken out (no EER entered, so no electricity or cost)`}, peaking at {fmt(best.cool.peakW / 1000, 1)} kW.</p>}
          <p className="small muted">How the efficiency is worked out: {sourceWhy(house.hp)} Space heating only; hot water, pumps and backup heaters are not included.</p>
          <table className="h-table months-t"><thead><tr><th />{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}</tr></thead>
            <tbody><tr><td>Heat kWh</td>{best.months.map((m, i) => <td key={i} className="n mono">{fmt(m.heat)}</td>)}</tr><tr><td>{isHeatPump(house.hp.source) ? 'COP' : 'Efficiency %'}</td>{best.months.map((m, i) => <td key={i} className="n mono">{m.heat > 0 ? (isHeatPump(house.hp.source) ? fmt(m.eff, 1) : fmt(m.eff * 100)) : '—'}</td>)}</tr></tbody>
          </table>
        </section>}

        {inc.fabric && <section>
          <h2>Build-ups</h2>
          <table className="h-table"><thead><tr><th>Build-up</th><th>Layers (outside → inside)</th><th className="n">U W/m²K</th></tr></thead>
            <tbody>{usedB.map((b) => <tr key={b.id}><td>{b.name}</td><td className="small">{layersText(b)}</td><td className="n mono">{fmt(buildupU(b), 2)}</td></tr>)}</tbody>
          </table>
          <p className="small muted">U shown with outside-wall surface resistances; each face uses the right ones for where it sits. Ground floors are by BS EN ISO 13370 for the whole floor.</p>
        </section>}

        {inc.assume && <section>
          <h2>Assumptions and checks</h2>
          <ul className="small">
            {house.calib && <li>{house.calib.note}: rooms {house.calib.dt > 0 ? '+' : ''}{house.calib.dt} K against setpoints, {Math.round(house.calib.hf * 100)}% of rooms heated.</li>}
            {house.vent.source !== 'meas' && <li>Airtightness is estimated from the house's age and features ({house.vent.factors.filter((f) => f.on).map((f) => f.label.toLowerCase()).join(', ')}). A blower-door test would firm it up.</li>}
            <li>With its own floor-edge Ψ in place of the ΔU allowance, the best estimate gives {fmt(best.peakW)} W for the house.</li>
            {res.checks.map((c, i) => <li key={i} className={c.level === 'error' ? 'bad' : 'warn'}>{c.text}</li>)}
          </ul>
        </section>}
      </article>
    </div>
  );
}
