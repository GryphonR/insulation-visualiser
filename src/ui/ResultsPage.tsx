import { useState } from 'react';
import { fmt, Card } from './hform';
import { useProject } from './project';
import { href } from './route';

type Sort = 'loss' | 'cold' | 'plan';

/** Board 4: design-day results, room by room. Every row drills into the room. */
export function ResultsPage() {
  const { house, res, results, ordered, active } = useProject();
  const [scope, setScope] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<Sort>('loss');
  const [cmpId, setCmpId] = useState('');
  const cmp = results.get(cmpId);
  const cvOf = (id: string) => res.heat.rooms.find((q) => q.id === id);

  let rows = res.rooms.filter((r) => scope === 'all' || r.room.storey === scope);
  if (sort === 'loss') rows = rows.slice().sort((a, b) => b.totalW - a.totalW);
  if (sort === 'cold') rows = rows.slice().sort((a, b) => a.T - b.T);
  const maxW = Math.max(1, ...res.rooms.map((r) => r.totalW));
  const maxPath = Math.max(1, ...res.paths.map((p) => p.W));
  const short = res.heat.rooms.filter((r) => r.has && r.cover < 0.995).length, withEm = res.heat.rooms.filter((r) => r.has).length;
  const coldest = res.rooms.filter((r) => r.room.heated).sort((a, b) => a.T - b.T)[0];
  const d = (a: number, b: number | undefined, dp: number, unit = '') => (b == null || Math.abs(a - b) < 0.5 * 10 ** -dp ? '' : `${a > b ? '+' : '−'}${fmt(Math.abs(a - b), dp)}${unit} vs ${active.name}`);
  const kpis: Array<[string, string, string, string, string]> = [
    ['Peak heat loss', fmt(res.peakW / 1000, 2), 'kW', `Heated rooms at ${res.Tout} °C`, cmp ? d(cmp.peakW / 1000, res.peakW / 1000, 2, ' kW') : ''],
    ['Space heating', fmt(Math.round(res.annualKWh / 10) * 10), 'kWh/yr', `${fmt(res.hdd)} degree days`, cmp ? d(cmp.annualKWh, res.annualKWh, 0, ' kWh') : ''],
    ['Heat loss parameter', fmt(res.hlp, 2), 'W/m²K', 'Per m² of floor area', cmp ? d(cmp.hlp, res.hlp, 2) : ''],
    ['Coldest heated room', coldest ? fmt(coldest.T, 1) : '—', '°C', coldest ? `${coldest.room.name}, setpoint ${coldest.room.setpoint}` : '', ''],
    ['Emitters meeting loss', `${withEm - short} / ${withEm}`, '', short ? `${short} short at ${house.hp.maxFlow} °C flow` : 'All rooms covered', ''],
  ];

  return (
    <div className="house">
      <div className="chips" style={{ alignItems: 'center' }}>
        <div className="seg" role="group" aria-label="Scope">
          <button type="button" className={scope === 'all' ? 'on' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Whole house</button>
          {house.storeys.map((s, i) => <button key={i} type="button" className={scope === i ? 'on' : ''} aria-pressed={scope === i} onClick={() => setScope(i)}>{s.name}</button>)}
        </div>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className="eb">Compare with</span>
          <select className="select" value={cmpId} onChange={(e) => setCmpId(e.target.value)}>
            <option value="">Nothing</option>
            {ordered.filter((s) => s.id !== active.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <span className="mono small muted" style={{ marginLeft: 'auto' }}>Design day {res.Tout} °C · <a href={href('year')}>typical year ›</a></span>
      </div>
      <div className="kpis">
        {kpis.map(([l, v, u, n, dl]) => (
          <div key={l} className="kpi"><span className="eb">{l}</span><span className="v">{v} <span className="small muted">{u}</span></span><span className="small muted">{n}</span>{dl && <span className="d">{dl}</span>}</div>
        ))}
      </div>
      <div className="plan-split">
        <div className="plan-main">
          <Card title="Rooms" note="Click a row to drill in."
            right={<div className="chips">{([['loss', 'Heat loss'], ['cold', 'Coldest first'], ['plan', 'Plan order']] as Array<[Sort, string]>).map(([k, l]) => <button key={k} type="button" className={sort === k ? 'chip on' : 'chip'} aria-pressed={sort === k} style={{ minHeight: 32 }} onClick={() => setSort(k)}>{l}</button>)}</div>}>
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th>Room</th><th>Floor</th><th style={{ width: '28%' }}>Heat loss · fabric ■ ventilation ■</th><th className="n">W</th><th className="n">W/m²</th><th className="n">Air °C</th><th className="n">Emitter</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const cv = cvOf(r.room.id), fab = r.totalW ? (r.fabricW / r.totalW) * 100 : 0;
                    return (
                      <tr key={r.room.id}>
                        <td style={{ fontWeight: 500 }}><a href={href('room', r.room.id)}>{r.room.name}</a></td>
                        <td className="small muted">{house.storeys[r.room.storey]?.name}</td>
                        <td>{r.room.heated ? <div style={{ display: 'flex', height: 12, width: `${(r.totalW / maxW) * 100}%` }}><span style={{ flex: fab, background: 'var(--ink)' }} /><span style={{ flex: 100 - fab, background: '#e9965f' }} /></div> : <span className="small muted">unheated</span>}</td>
                        <td className="n mono">{r.room.heated ? fmt(r.totalW) : '—'}</td>
                        <td className="n mono">{r.room.heated ? fmt(r.perM2) : '—'}</td>
                        <td className="n mono" style={{ color: r.room.heated && r.T < r.room.setpoint - 0.5 ? '#9a3412' : undefined }}>{fmt(r.T, 1)}</td>
                        <td className="n mono" style={{ color: cv && cv.has && cv.cover < 0.995 ? '#9a3412' : undefined, fontWeight: cv && cv.has && cv.cover < 0.995 ? 600 : 400 }}>{cv && cv.has ? `${fmt(cv.cover * 100)}%` : '—'}</td>
                        <td><a className="btn-secondary as-btn" style={{ minHeight: 32, padding: '0 10px' }} href={href('room', r.room.id)} aria-label={`Open ${r.room.name}`}>›</a></td>
                      </tr>
                    );
                  })}
                  {res.loft && scope === 'all' && <tr><td>Loft (unheated)</td><td /><td colSpan={3} className="small muted">{fmt(res.loft.area, 1)} m² over the top storey</td><td className="n mono">{fmt(res.loft.T, 1)}</td><td colSpan={2} /></tr>}
                </tbody>
                <tfoot><tr><td colSpan={3}>Heated rooms</td><td className="n mono">{fmt(rows.reduce((a, r) => a + (r.room.heated ? r.totalW : 0), 0))}</td><td colSpan={4} /></tr></tfoot>
              </table>
            </div>
          </Card>
        </div>
        <div className="plan-side">
          <Card title="Where the heat goes" note={`Whole house, design day: ${res.Tout} °C outside, ground ${res.Tg} °C.`}>
            <div className="paths">
              {res.paths.map((p) => {
                const c = cmp?.paths.find((x) => x.label === p.label);
                return (
                  <div key={p.label} className="path">
                    <span className="small">{p.label}</span>
                    <span className="path-bar"><span style={{ width: `${Math.max(0, (p.W / maxPath) * 100)}%` }} className={p.label === 'Ventilation' ? 'v' : ''} /></span>
                    <span className="mono small n">{fmt(p.W)} W{c && Math.abs(c.W - p.W) > 0.5 ? ` → ${fmt(c.W)}` : ''}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="More results">
            <div className="stack-10">
              <a className="btn-secondary as-btn" href={href('year')}>Test conditions &amp; typical year ›</a>
              <a className="btn-secondary as-btn" href={href('energy')}>Energy, cost &amp; heat pump ›</a>
              <a className="btn-secondary as-btn" href={href('bills')}>Check against bills ›</a>
              <a className="btn-secondary as-btn" href={href('moisture')}>Moisture &amp; mould ›</a>
              <a className="btn-secondary as-btn" href={href('report')}>Report &amp; export ›</a>
              <a className="btn-primary as-btn" href={href('plan')}>Open plan lens ›</a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
