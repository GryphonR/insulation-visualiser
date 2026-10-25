import { useMemo, useState } from 'react';
import { MONTHS } from '../engine/data';
import { calcHouse } from '../engine/house';
import type { House } from '../engine/house';
import { NO_KNOBS, bestFit, calibrate, demoBills } from '../engine/house-calibrate';
import type { Bills, Knobs } from '../engine/house-calibrate';

const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const EMPTY: Bills = { gas: Array(12).fill(NaN), temps: Array(12).fill(NaN), base: NaN };

/** Board 4d: monthly gas against the model, three household knobs, fit statistics and an energy signature. */
export function HouseBills({ house, setHouse }: { house: House; setHouse: (fn: (h: House) => House) => void }) {
  // Fit against the uncalibrated model so applying twice doesn't compound.
  const res = useMemo(() => calcHouse({ ...house, calib: undefined }), [house]);
  const eff = house.hp.boilerEff;
  const bills = house.bills ?? EMPTY;
  const setBills = (b: Bills) => setHouse((h) => ({ ...h, bills: b }));
  const [k, setK] = useState<Knobs>(house.calib ? { dt: house.calib.dt, q: house.calib.q, hf: house.calib.hf } : NO_KNOBS);
  const fit = calibrate(res, bills, eff, k);
  const top = Math.max(1, ...fit.pred, ...fit.meas.filter(Number.isFinite));
  const setMonth = (key: 'gas' | 'temps', m: number, v: string) => { const a = [...bills[key]]; a[m] = v === '' ? NaN : Number(v); setBills({ ...bills, [key]: a }); };
  const applied = !!house.calib && house.calib.dt === k.dt && house.calib.q === k.q && house.calib.hf === k.hf;

  // Energy signature chart.
  const W = 520, H = 200, L = 40, B = 22, xs = fit.signature.map((p) => p.t), ys = fit.signature.map((p) => p.w);
  const x0 = Math.min(-2, ...xs), x1 = Math.max(14, ...xs), y1 = Math.max(500, ...ys) * 1.1;
  const X = (t: number) => L + ((t - x0) / (x1 - x0)) * (W - L - 8), Y = (w: number) => 8 + (1 - w / y1) * (H - B - 8);
  const modelLine = (t: number) => k.hf * fit.htcModel * fit.kDD * Math.max(0, 15.5 + k.dt - t);

  return (
    <div className="house-grid">
      <div className="house-col">
        <section className="card panel">
          <div className="section-head">
            <div><h2>Gas bills</h2><p className="muted small">Monthly gas in kWh for one year (from bills, meter readings or the smart meter app). Optional: that year's monthly mean outside temperatures, otherwise the typical year for {res.region} is used.</p></div>
            <div className="chips">
              <button type="button" className="btn-secondary" onClick={() => setBills(demoBills(res, eff))}>Fill with example bills</button>
              <button type="button" className="btn-link" onClick={() => setBills(EMPTY)}>Clear</button>
            </div>
          </div>
          <div className="h-table-wrap">
            <table className="h-table bills-t">
              <thead><tr><th />{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}</tr></thead>
              <tbody>
                <tr><td>Gas kWh</td>{MONTHS.map((m, i) => <td key={m}><input type="number" className="thk-input" aria-label={`${m} gas kWh`} value={Number.isFinite(bills.gas[i]) ? bills.gas[i] : ''} onChange={(e) => setMonth('gas', i, e.target.value)} /></td>)}</tr>
                <tr><td>Mean °C</td>{MONTHS.map((m, i) => <td key={m}><input type="number" className="thk-input" aria-label={`${m} mean temperature`} placeholder={fmt(fit.temps[i], 1)} value={Number.isFinite(bills.temps[i]) ? bills.temps[i] : ''} onChange={(e) => setMonth('temps', i, e.target.value)} /></td>)}</tr>
              </tbody>
            </table>
          </div>
          <div className="hf-row">
            <label className="hf"><span className="eyebrow">Cooking & hot water per month</span>
              <span className="hf-in"><input type="number" className="thk-input" placeholder={fmt(fit.base)} value={Number.isFinite(bills.base) ? bills.base : ''} onChange={(e) => setBills({ ...bills, base: e.target.value === '' ? NaN : Number(e.target.value) })} /><span className="small muted">kWh (blank: lowest summer month)</span></span>
            </label>
            <label className="hf"><span className="eyebrow">Boiler efficiency</span>
              <span className="hf-in"><input type="number" className="thk-input" value={eff} onChange={(e) => setHouse((h) => ({ ...h, hp: { ...h.hp, boilerEff: Number(e.target.value) || 85 } }))} /><span className="small muted">%</span></span>
            </label>
          </div>
          <div className="months-bars bills-bars" role="img" aria-label="Measured and modelled gas by month">
            {MONTHS.map((m, i) => (
              <span key={m} className="mb">
                <span className="mb-pair">
                  <span className="mb-meas" style={{ height: `${(Number.isFinite(fit.meas[i]) ? fit.meas[i] : 0) / top * 100}%` }} />
                  <span className="mb-pred" style={{ height: `${fit.pred[i] / top * 100}%` }} />
                </span>
                <span className="mb-l">{m}</span>
              </span>
            ))}
          </div>
          <p className="small muted"><span className="key meas" /> bills <span className="key pred" /> model for the same weather · bills {fmt(fit.meas.filter(Number.isFinite).reduce((a, b) => a + b, 0))} kWh, model {fmt(fit.pred.reduce((a, b) => a + b, 0))} kWh</p>
        </section>
      </div>

      <div className="house-col">
        <section className="card panel">
          <h2>Match the model to the bills</h2>
          <div className="tiles">
            <div className={`tile ${Number.isFinite(fit.cv) && fit.cv < 15 ? 'tile-ok' : 'tile-bad'}`}><span className="tiles-head">CV(RMSE)</span><span className="tile-value"><span className="mono big">{fmt(fit.cv, 1)}</span><span className="small muted">%</span></span><span className="small muted">under 15% for monthly data</span></div>
            <div className={`tile ${Number.isFinite(fit.nmbe) && Math.abs(fit.nmbe) < 5 ? 'tile-ok' : 'tile-bad'}`}><span className="tiles-head">NMBE</span><span className="tile-value"><span className="mono big">{fit.nmbe > 0 ? '+' : ''}{fmt(fit.nmbe, 1)}</span><span className="small muted">%</span></span><span className="small muted">within ±5% (ASHRAE Guideline 14)</span></div>
          </div>
          {([['dt', 'Rooms run warmer / cooler', -3, 3, 0.1, (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} K`, 'Against the setpoints. Bills can\'t tell this apart from heating fewer hours.'],
            ['q', 'Airtightness factor', 0.6, 1.6, 0.01, (v: number) => `× ${v.toFixed(2)}`, house.vent.source === 'meas' ? 'Your q50 is measured, so this only affects the fit, not the model.' : 'Scales the estimated q50. Shows up as extra use in cold months.'],
            ['hf', 'Share of rooms heated', 0.6, 1, 0.01, (v: number) => `${Math.round(v * 100)}%`, 'Spare rooms left cold, doors shut.']] as const).map(([key, label, min, max, step, txt, hint]) => (
            <div key={key} className="slider">
              <div className="slider-head"><label htmlFor={`k-${key}`}>{label}</label><span className="mono">{txt(k[key])}</span></div>
              <input id={`k-${key}`} type="range" min={min} max={max} step={step} value={k[key]} onChange={(e) => setK({ ...k, [key]: Number(e.target.value) })} />
              <span className="small muted">{hint}</span>
            </div>
          ))}
          <div className="chips">
            <button type="button" className="btn-secondary" disabled={fit.n < 6} onClick={() => setK(bestFit(res, bills, eff))}>Best fit</button>
            <button type="button" className="btn-link" onClick={() => setK(NO_KNOBS)}>Reset</button>
            <button type="button" className="btn-primary" disabled={!fit.good || applied} onClick={() => setHouse((h) => ({ ...h, calib: { ...k, note: `Calibrated to ${fit.n} months of bills, CV(RMSE) ${fit.cv.toFixed(1)}%, NMBE ${fit.nmbe.toFixed(1)}%` } }))}>
              {applied ? 'Applied ✓' : 'Use as calibrated'}
            </button>
            {house.calib && <button type="button" className="btn-link" onClick={() => setHouse((h) => ({ ...h, calib: undefined }))}>Remove calibration</button>}
          </div>
          <p className="small">{fit.n < 6 ? 'Enter at least six months to check the fit.'
            : applied ? `This scenario is calibrated: space heating ${fmt(calcHouse(house).annualKWh)} kWh in a typical year.`
            : fit.good ? 'Within the usual limits for a calibrated model. Apply it to make this scenario match the bills.'
            : `Not matched yet: the model is ${fit.nmbe > 0 ? 'over' : 'under'} the bills by ${fmt(Math.abs(fit.nmbe))}% over the year. Try Best fit, then check the values make sense for this household.`}</p>
        </section>

        <section className="card panel">
          <h2>Energy signature</h2>
          {fit.signature.length < 3 ? <p className="small muted">Needs at least three heating months of bills.</p> : <>
            <svg className="day-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average heating power against outside temperature">
              {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - 8} y1={Y(f * y1)} y2={Y(f * y1)} className="dc-grid" /><text x={L - 4} y={Y(f * y1) + 4} textAnchor="end" className="dc-ax">{fmt(f * y1 / 1000, 1)}</text></g>)}
              {[0, 5, 10].map((t) => <text key={t} x={X(t)} y={H - 6} textAnchor="middle" className="dc-ax">{t} °C</text>)}
              {fit.sigLine && <line x1={X(x0)} x2={X(x1)} y1={Y(fit.sigLine.a + fit.sigLine.b * x0)} y2={Y(fit.sigLine.a + fit.sigLine.b * x1)} className="dc-sel" />}
              <line x1={X(x0)} x2={X(x1)} y1={Y(modelLine(x0))} y2={Y(modelLine(x1))} className="dc-out" />
              {fit.signature.map((p, i) => <circle key={i} cx={X(p.t)} cy={Y(p.w)} r={4} fill="#14212b" />)}
            </svg>
            <p className="small">Average heating power each month (kW) against outside temperature. The bills say this house loses about <b>{fmt(fit.htcMeter ?? NaN)} W/K</b>; the model says <b>{fmt(fit.htcModel)} W/K</b>.{' '}
              {fit.htcMeter && Math.abs(fit.htcMeter - fit.htcModel) / fit.htcModel < 0.1 ? 'Close: the fabric and airtightness inputs look right.' : 'A gap in the slope points at the fabric or airtightness rather than how the house is used.'}</p>
          </>}
        </section>
      </div>
    </div>
  );
}
