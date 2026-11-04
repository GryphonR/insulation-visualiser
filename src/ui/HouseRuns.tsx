import { useEffect, useMemo, useState } from 'react';
import { DAYS, MONTHS, MONTHS_FULL } from '../engine/data';
import { calcHouse } from '../engine/house';
import type { House } from '../engine/house';
import { MCS_STATIONS } from '../engine/climate-mcs';
import { loadTmy } from '../engine/weather-tmy';
import type { Tmy } from '../engine/weather-tmy';
import type { Project, Scenario } from '../engine/house-scenarios';
import { CASES, hourGains, simulate, yearTotals } from '../engine/house-sim';
import type { CaseId } from '../engine/house-sim';
import { useYearSim } from './useYearSim';
import { Chip } from './controls';
import { fmt } from './hform';

const MASS: Array<[number, string]> = [[80, 'Light (timber frame, 80 kJ/m²K)'], [165, 'Medium (masonry, 165)'], [260, 'Heavy (solid, 260)']];

/** Hourly lines over one or more days, with the heat delivered as a shaded area. */
function DayChart({ out, rooms, heat, hours, start = 0 }: {
  out: Float32Array; rooms: Array<{ name: string; T: Float32Array; on: boolean }>; heat: Float32Array; hours: number; start?: number;
}) {
  const W = 640, H = 220, L = 34, B = 22, slice = (a: Float32Array) => Array.from(a.subarray(start, start + hours));
  const all = [slice(out), ...rooms.map((r) => slice(r.T))].flat();
  const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all, lo + 5) / 5) * 5;
  const x = (k: number) => L + (k / Math.max(1, hours - 1)) * (W - L - 6), y = (t: number) => 6 + (1 - (t - lo) / (hi - lo)) * (H - B - 6);
  const path = (v: number[]) => v.map((t, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(t).toFixed(1)}`).join(' ');
  const hv = slice(heat), hmax = Math.max(1, ...hv);
  const area = `M${x(0)} ${H - B} ${hv.map((p, k) => `L${x(k).toFixed(1)} ${(H - B - (p / hmax) * (H - B - 6) * 0.45).toFixed(1)}`).join(' ')} L${x(hours - 1)} ${H - B} Z`;
  const ticks = [lo, (lo + hi) / 2, hi], step = hours > 48 ? 24 : 6;
  return (
    <svg className="day-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Temperatures through the run">
      <path d={area} className="dc-heat" />
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} className="dc-grid" /><text x={L - 4} y={y(t) + 4} textAnchor="end" className="dc-ax">{t}</text></g>)}
      {Array.from({ length: Math.floor((hours - 1) / step) + 1 }, (_, i) => i * step).map((k) => (
        <text key={k} x={x(k)} y={H - 6} textAnchor="middle" className="dc-ax">{hours > 48 ? `day ${k / 24 + 1}` : `${String(k % 24).padStart(2, '0')}:00`}</text>
      ))}
      <path d={path(slice(out))} className="dc-out" />
      {rooms.filter((r) => !r.on).map((r) => <path key={r.name} d={path(slice(r.T))} className="dc-room" />)}
      {rooms.filter((r) => r.on).map((r) => <path key={r.name} d={path(slice(r.T))} className="dc-sel" />)}
    </svg>
  );
}

export function HouseRuns({ house, setHouse, project, ordered }: { house: House; setHouse: (fn: (h: House) => House) => void; project: Project; ordered: Scenario[] }) {
  const upd = (fn: (h: House) => void) => setHouse((prev) => { const n = structuredClone(prev); fn(n); return n; });
  const [caseId, setCase] = useState<CaseId>('design');
  const [roomId, setRoom] = useState('living');
  const [day, setDay] = useState(14);
  const [cmpId, setCmp] = useState('');
  const base = useMemo(() => calcHouse(house), [house]);
  const useTmy = house.climate.weather === 'tmy';
  const [tmy, setTmy] = useState<Tmy | null>(null);
  useEffect(() => {
    if (!useTmy) return;
    let live = true;
    loadTmy(base.climate.station).then((t) => { if (live) setTmy(t); });
    return () => { live = false; };
  }, [useTmy, base.climate.station]);
  const yearTmy = useTmy && tmy?.station === base.climate.station ? tmy : undefined;
  // One-day cases are quick; the year runs in a worker so editing doesn't freeze the page.
  const quick = useMemo(() => (caseId === 'year' ? null : simulate(house, caseId, base)), [house, caseId, base]);
  const yearRun = useYearSim(caseId === 'year' ? house : undefined, yearTmy);
  const cmpHouse = project.scenarios.find((s) => s.id === cmpId)?.house;
  const cmp = useYearSim(caseId === 'year' ? cmpHouse : undefined, yearTmy).result;
  const sim = quick ?? yearRun.result;
  const caseInfo = CASES.find((c) => c.id === caseId)!;

  const left = (
    <div className="house-col">
      <section className="card panel">
        <h2>Test conditions</h2>
        <div className="cases">
          {CASES.map((c) => (
            <button key={c.id} type="button" className={c.id === caseId ? 'node on' : 'node'} onClick={() => setCase(c.id)}>
              <span><b>{c.name}</b><br /><span className="small muted">{c.use}</span></span>
            </button>
          ))}
        </div>
      </section>

      <GainsCard house={house} upd={upd} />
    </div>
  );
  if (!sim) {
    return (
      <div className="house-grid">
        {left}
        <div className="house-col"><section className="card panel"><h2>{caseInfo.name}</h2><p className="muted" role="status">Running the year, hour by hour…</p></section></div>
      </div>
    );
  }

  const ri = Math.max(0, sim.rooms.findIndex((r) => r.id === roomId));
  const room = sim.rooms[ri];
  const year = caseId === 'year' ? yearTotals(sim) : null;
  const cyear = cmp ? yearTotals(cmp) : null;
  const lines = sim.rooms.map((r, i) => ({ name: r.name, T: sim.T[i], on: i === ri }));

  return (
    <div className="house-grid">
      {left}
      <div className="house-col">
        <section className="card panel">
          <div className="section-head">
            <div><h2>{caseInfo.name}</h2><p className="muted small">{caseInfo.use}{caseId === 'year' && yearRun.busy && <span role="status"> Updating…</span>}</p></div>
            {caseId === 'year' && (
              <label className="hf"><span className="eyebrow">Compare with</span>
                <select className="select" value={cmpId} onChange={(e) => setCmp(e.target.value)}>
                  <option value="">Nothing</option>
                  {ordered.filter((s) => s.id !== project.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="tiles">
            <div className="tile"><span className="tiles-head">Heat delivered</span><span className="tile-value"><span className="mono big">{fmt(sim.heatKWh, caseId === 'year' ? 0 : 1)}</span><span className="small muted">kWh</span></span>
              {cmp && <span className="small muted">{cmpHouse && ordered.find((s) => s.id === cmpId)?.name}: {fmt(cmp.heatKWh)}</span>}</div>
            <div className="tile"><span className="tiles-head">Peak hour</span><span className="tile-value"><span className="mono big">{fmt(sim.peakW / 1000, 2)}</span><span className="small muted">kW</span></span>
              <span className="small muted">{sim.peakW >= house.hp.capacity * 1000 - 1 ? 'heat pump flat out' : `of ${house.hp.capacity} kW`}</span></div>
            {sim.heatKWh > 0 && <div className="tile"><span className="tiles-head">Heat pump</span><span className="tile-value"><span className="mono big">{fmt(sim.heatKWh / sim.elecKWh, 2)}</span><span className="small muted">COP</span></span>
              <span className="small muted">{fmt(sim.elecKWh, caseId === 'year' ? 0 : 1)} kWh electricity · £{fmt((sim.elecKWh * house.hp.elecP) / 100, caseId === 'year' ? 0 : 2)}</span></div>}
          </div>

          {caseId !== 'year' && <>
            <div className="chips">{sim.rooms.map((r, i) => <Chip key={r.id} on={i === ri} onClick={() => setRoom(r.id)}>{r.name}</Chip>)}</div>
            <DayChart out={sim.out} rooms={lines} heat={sim.heat} hours={sim.hours} />
            <p className="small muted">Grey: outside air. Orange: {room?.name}. Thin lines: other rooms. Shaded: heat delivered.</p>
          </>}

          {caseId === 'year' && (
            <div className="hf-row">
              <div className="chips" role="group" aria-label="Weather for the year">
                <Chip on={!useTmy} onClick={() => upd((h) => { h.climate.weather = 'synthetic'; })}>Synthetic (monthly means)</Chip>
                <Chip on={useTmy} onClick={() => upd((h) => { h.climate.weather = 'tmy'; })}>Typical year, real hourly weather</Chip>
              </div>
              <p className="small muted">{useTmy ? (yearTmy ? `${MCS_STATIONS[base.climate.station][0]}: ${yearTmy.source}.` : 'Loading weather…') : `Monthly means for ${base.region}, a daily swing and multi-day spells.`}</p>
            </div>
          )}
          {year && <>
            <div className="months-bars" role="img" aria-label="Heat by month">
              {year.months.map((v, m) => {
                const top = Math.max(...year.months, ...(cyear?.months ?? [0]), 1);
                return (
                  <button key={m} type="button" className={year.monthOfDay[day] === m ? 'mb on' : 'mb'} onClick={() => setDay(year.monthOfDay.indexOf(m) + 14)}>
                    <span className="mb-bar" style={{ height: `${(v / top) * 100}%` }} />
                    {cyear && <span className="mb-ghost" style={{ height: `${(cyear.months[m] / top) * 100}%` }} />}
                    <span className="mb-l">{MONTHS[m]}</span>
                    <span className="mb-v mono">{fmt(v)}</span>
                  </button>
                );
              })}
            </div>
            {cyear && <p className="small muted">Outlined bars: the scenario you're comparing with.</p>}
            <div className="cal" role="grid" aria-label="Heat each day">
              {MONTHS.map((mn, m) => (
                <div key={mn} className="cal-row" role="row">
                  <span className="cal-m small">{mn}</span>
                  {Array.from({ length: 31 }, (_, d) => {
                    if (d >= DAYS[m]) return <span key={d} className="cal-d none" />;
                    const doy = year.monthOfDay.indexOf(m) + d, v = year.days[doy] ?? 0, f = Math.min(1, v / 60);
                    return (
                      <button key={d} type="button" className={doy === day ? 'cal-d on' : 'cal-d'} aria-label={`${d + 1} ${MONTHS_FULL[m]}: ${fmt(v)} kWh`}
                        style={{ background: `rgb(${Math.round(241 - 87 * f)},${Math.round(239 - 187 * f)},${Math.round(232 - 214 * f)})` }} onClick={() => setDay(doy)} />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="section-head">
              <h3>{(day % 365) - year.monthOfDay.indexOf(year.monthOfDay[day]) + 1} {MONTHS_FULL[year.monthOfDay[day]]}: {fmt(year.days[day] ?? 0)} kWh</h3>
            </div>
            <div className="chips">{sim.rooms.map((r, i) => <Chip key={r.id} on={i === ri} onClick={() => setRoom(r.id)}>{r.name}</Chip>)}</div>
            <DayChart out={sim.out} rooms={lines} heat={sim.heat} hours={24} start={day * 24} />
          </>}
        </section>

        <section className="card panel">
          <h2>Rooms</h2>
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th>Room</th><th className="n">Min °C</th><th className="n">Max °C</th>
                {caseId === 'snap' ? <th className="n">Below 16 °C after</th> : <><th className="n">Too cold, h</th><th className="n">Too warm, h</th></>}</tr></thead>
              <tbody>
                {sim.comfort.map((c, i) => (
                  <tr key={c.id} className={i === ri ? 'on' : ''} onClick={() => setRoom(c.id)}>
                    <td>{sim.rooms[i].name}{sim.rooms[i].heated ? '' : ' (unheated)'}</td>
                    <td className="n mono">{fmt(c.min, 1)}</td><td className="n mono">{fmt(c.max, 1)}</td>
                    {caseId === 'snap'
                      ? <td className="n mono">{c.below16 == null ? 'stays above' : `${c.below16} h`}</td>
                      : <><td className={`n mono ${c.cold > 0 ? 'bad' : ''}`}>{sim.rooms[i].heated ? c.cold : '—'}</td><td className={`n mono ${c.warm > 0 ? 'bad' : ''}`}>{c.warm}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Too cold: hours with the heating scheduled on and the room more than 1 K below its setpoint. Too warm: above 25 °C (26 °C in bedrooms).</p>
        </section>
      </div>
    </div>
  );
}

/** Board 6a: who is home, when the heating runs and the gains that follow. Used by the occupancy page and the test conditions. */
export function GainsCard({ house, upd }: { house: House; upd: (fn: (h: House) => void) => void }) {
  const g = house.gains;
  const gainsDay = Array.from({ length: 24 }, (_, h) => hourGains(g, h, false).reduce((a, b) => a + b, 0));
  return (
  <section className="card panel">
    <h2>Occupancy, heating times and gains</h2>
    <div className="hf-row">
      <label className="hf"><span className="eyebrow">People</span>
        <input type="number" className="thk-input" min={0} max={10} value={g.people} onChange={(e) => upd((h) => { h.gains.people = Math.max(0, Number(e.target.value) || 0); })} />
      </label>
      <div className="hf"><span className="eyebrow">Pattern</span>
        <div className="chips">
          {([['work', 'Out at work'], ['home', 'Home all day'], ['shift', 'Shift work']] as const).map(([k, l]) => <Chip key={k} on={g.pattern === k} onClick={() => upd((h) => { h.gains.pattern = k; })}>{l}</Chip>)}
        </div>
      </div>
    </div>
    <div className="sched">
      {(['living', 'bedrooms'] as const).map((k) => (
        <div key={k} className="sched-row">
          <span className="small">{k === 'living' ? 'Living areas' : 'Bedrooms & bath'}</span>
          <div className="sched-cells">
            {g[k].map((on, h) => (
              <button key={h} type="button" className={on ? 'sc on' : 'sc'} aria-pressed={!!on} aria-label={`${k} ${h}:00 ${on ? 'heating on' : 'setback'}`}
                onClick={() => upd((x) => { x.gains[k][h] = on ? 0 : 1; })} />
            ))}
          </div>
        </div>
      ))}
      <div className="sched-row"><span /><div className="sched-cells sched-ax">{Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}</div></div>
    </div>
    <p className="small muted">Orange hours heat to each room's setpoint; the rest hold the setback. Click an hour to switch it.</p>
    <div className="hf-row">
      <label className="hf"><span className="eyebrow">Setback</span>
        <span className="hf-in"><input type="number" className="thk-input" step={0.5} value={g.setback} onChange={(e) => upd((h) => { h.gains.setback = Number(e.target.value); })} /><span className="small muted">°C</span></span>
      </label>
      <label className="hf"><span className="eyebrow">Thermal mass</span>
        <select className="select" value={g.mass} onChange={(e) => upd((h) => { h.gains.mass = Number(e.target.value); })}>{MASS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="hf"><span className="eyebrow">Glazing g (with frame, curtains)</span>
        <input type="number" className="thk-input" step={0.05} min={0} max={0.9} value={g.g} onChange={(e) => upd((h) => { h.gains.g = Number(e.target.value); })} />
      </label>
    </div>
    <p className="small mono">Gains on a weekday: {fmt(gainsDay.reduce((a, b) => a + b, 0) / 1000, 1)} kWh, peak {fmt(Math.max(...gainsDay))} W (people, appliances, lighting, cooking).</p>
  </section>
  );
}
