import { useMemo, useState } from 'react';
import { MONTHS } from '../engine/data';
import { calcHouse } from '../engine/house';
import type { House } from '../engine/house';
import { buildupMoisture, roomMoisture } from '../engine/house-moisture';
import type { MoistureOptions } from '../engine/house-moisture';
import { Chip } from './controls';

const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const col = (p: number) => (p < 65 ? '#e3f0e8' : p < 75 ? '#fffefb' : p < 80 ? '#f3c9a2' : '#e9965f');

/** Board 4f: surface humidity room by room on a mean January day, and the interstitial check per build-up. */
export function HouseMoisture({ house }: { house: House }) {
  const res = useMemo(() => calcHouse(house), [house]);
  const [opt, setOpt] = useState<MoistureOptions>({ dryIndoors: false, fansUsed: true, trickleOpen: false });
  const m = useMemo(() => roomMoisture(house, res, opt), [house, res, opt]);
  const walls = useMemo(() => buildupMoisture(house, res), [house, res]);
  const [sel, setSel] = useState('');
  const ranked = [...m.rooms].sort((a, b) => b.srh - a.srh);
  const c = m.rooms.find((r) => r.id === sel) ?? ranked[0];
  const risky = m.rooms.filter((r) => r.risk === 'mould').length;

  return (
    <div className="house-grid">
      <div className="house-col">
        <section className="card panel">
          <h2>Mould risk by room</h2>
          <p className="muted small">A mean January day: {fmt(m.Tout, 1)} °C and {Math.round(m.rhOut * 100)}% RH outside. Each room's moisture comes from its use and is carried away by its ventilation; the coldest opaque surface (ISO 13788, 0.25 m²K/W inside) sets the risk. Above 80% surface RH for weeks, mould grows.</p>
          <div className="chips">
            <Chip on={opt.dryIndoors} onClick={() => setOpt({ ...opt, dryIndoors: !opt.dryIndoors })}>Washing dried indoors</Chip>
            <Chip on={opt.fansUsed} onClick={() => setOpt({ ...opt, fansUsed: !opt.fansUsed })}>Extract fans used</Chip>
            <Chip on={opt.trickleOpen} onClick={() => setOpt({ ...opt, trickleOpen: !opt.trickleOpen })}>Bedroom trickle vents open</Chip>
          </div>
          <p className="small"><b>{risky}</b> room{risky === 1 ? '' : 's'} at mould risk.</p>
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th>Room</th><th className="n">°C</th><th className="n">Air RH</th><th className="n">Coldest surface</th><th className="n">Surface RH</th><th>What to do</th></tr></thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.id} className={r.id === c?.id ? 'on' : ''} onClick={() => setSel(r.id)}>
                    <td>{r.name}</td>
                    <td className="n mono">{fmt(r.T, 1)}</td>
                    <td className="n mono">{fmt(r.rh)}%</td>
                    <td className="n mono">{fmt(r.tsi, 1)} °C</td>
                    <td className="n mono" style={{ background: col(r.srh) }}>{fmt(r.srh)}%</td>
                    <td className="small">{r.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="house-col">
        {c && (
          <section className="card panel">
            <h2>{c.name}</h2>
            <div className="tiles">
              <div className="tile"><span className="tiles-head">Air</span><span className="tile-value"><span className="mono big">{fmt(c.rh)}</span><span className="small muted">% RH</span></span><span className="small muted">{fmt(c.T, 1)} °C, dew point {fmt(c.dew, 1)} °C</span></div>
              <div className="tile" style={{ background: col(c.srh) }}><span className="tiles-head">Coldest surface</span><span className="tile-value"><span className="mono big">{fmt(c.srh)}</span><span className="small muted">% RH</span></span><span className="small muted">{fmt(c.tsi, 1)} °C · f {c.f.toFixed(2)}</span></div>
            </div>
            <p className="small">Coldest spot: {c.spot}. Ventilation {fmt(c.ach, 2)} ach carries away {fmt(c.G)} g a day, leaving {fmt(c.dv, 1)} g/m³ more moisture than outside.</p>
            <table className="h-table">
              <thead><tr><th>Moisture source</th><th className="n">g/day</th></tr></thead>
              <tbody>{c.sources.map(([n, g]) => <tr key={n}><td>{n}</td><td className="n mono">{fmt(g)}</td></tr>)}</tbody>
            </table>
            <p className={c.risk === 'mould' ? 'small warn' : 'small'}>{c.fix}</p>
          </section>
        )}

        <section className="card panel">
          <h2>Condensation inside the build-ups</h2>
          <p className="muted small">The app's year-long vapour diffusion check (EN ISO 13788 monthly method) for each outside wall and roof in use, at 20 °C inside with a typical moisture load. Open it in "Moisture over a year" to vary rain, rising damp and loads.</p>
          <table className="h-table">
            <thead><tr><th>Build-up</th><th>Used in</th><th>Result</th></tr></thead>
            <tbody>
              {walls.map(({ b, where, r }) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className="small muted">{where.join(', ')}</td>
                  <td className={r?.verdict === 'accumulates' ? 'bad' : r?.mouldMonths.length ? 'warn' : 'good'}>
                    {!r ? 'not checked' : r.verdict === 'none' ? 'No condensation' : r.verdict === 'dries' ? `Some condensation, dries by ${MONTHS[r.dryMonth ?? 0]}` : 'Builds up year on year'}
                    {r && r.mouldMonths.length > 0 && <span className="small"> · inner surface over 80% RH in {r.mouldMonths.map((x) => MONTHS[x]).join(', ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
