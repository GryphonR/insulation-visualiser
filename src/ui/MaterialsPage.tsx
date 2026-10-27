import { useState } from 'react';
import { MATERIALS, MATERIAL_CATEGORIES, MAT, deleteCustomMaterial, saveCustomMaterial } from '../engine/data';
import type { Material } from '../engine/data';
import { Card, Num, fmt, uid } from './hform';
import { useProject } from './project';
import { href } from './route';

/** Board 2a: the material library. Built-in values are locked, so this is a reference for the layers in the build-ups. */
export function MaterialsPage() {
  const { house } = useProject();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [sel, setSel] = useState('pir');
  const [, bump] = useState(0);
  const save = (m: Material) => { saveCustomMaterial(m); bump((n) => n + 1); };
  const copy = (m: Material | null) => {
    const id = uid('cm');
    save(m ? { ...m, id, name: `${m.name} (custom)` } : { id, name: 'New material', k: 0.04, rho: 100, cp: 1000, col: '#d8c9a3', t: 100, min: 10, max: 400, step: 5, mu: 5 });
    setSel(id);
  };
  const rows = MATERIALS.filter((m) => (cat === 'all' || (m.cat ?? 'common') === cat) && m.name.toLowerCase().includes(q.toLowerCase()));
  const s = MAT[sel] ?? MATERIALS[0];
  const usedBy = (id: string) => house.buildups.filter((b) => b.layers.some(([m]) => m === id));
  const inUse = usedBy(s.id);
  const custom = s.cat === 'custom';
  const edit = (patch: Partial<Material>) => save({ ...s, ...patch });
  return (
    <div className="plan-split">
      <section className="plan-main">
        <div className="chips" style={{ alignItems: 'center' }}>
          <input className="srch" aria-label="Search materials" placeholder="Search materials" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" aria-label="Group" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All groups</option>
            {Object.entries(MATERIAL_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="mono small muted">{rows.length} of {MATERIALS.length}</span>
          <button type="button" className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => copy(null)}>+ Custom material</button>
        </div>
        <div className="card" style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <table className="h-table">
            <thead><tr><th>Material</th><th className="n">λ W/mK</th><th className="n">R fixed</th><th className="n">ρ kg/m³</th><th className="n">c J/kgK</th><th className="n">μ</th><th className="n">Used in</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={m.id === s.id ? 'on' : ''} onClick={() => setSel(m.id)} style={{ cursor: 'pointer' }}>
                  <td><span style={{ display: 'inline-block', width: 14, height: 14, border: '1px solid var(--ink)', background: m.col, verticalAlign: 'middle', marginRight: 8 }} aria-hidden="true" />
                    <button type="button" className="btn-link" aria-pressed={m.id === s.id} onClick={() => setSel(m.id)}>{m.name}</button></td>
                  <td className="n mono">{m.k ?? '—'}</td><td className="n mono">{m.R ?? '—'}</td><td className="n mono">{m.rho}</td><td className="n mono">{m.cp}</td>
                  <td className="n mono">{m.mu ?? '—'}</td><td className="n mono">{usedBy(m.id).length || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="plan-side">
        <Card title={s.name} note={custom ? 'custom · editable' : 'built-in · locked'}>
          <div style={{ height: 56, border: '1.5px solid var(--ink)', background: s.col }} aria-hidden="true" />
          <div className="kpis">
            <div className="kpi"><span className="eb">{s.R != null ? 'Fixed R' : 'λ'}</span><span className="v">{s.R ?? s.k}</span><span className="small muted">{s.R != null ? 'm²K/W (air gaps, foils)' : 'W/mK'}</span></div>
            <div className="kpi"><span className="eb">ρ</span><span className="v">{s.rho}</span><span className="small muted">kg/m³</span></div>
            <div className="kpi"><span className="eb">c</span><span className="v">{s.cp}</span><span className="small muted">J/kgK</span></div>
          </div>
          {custom && (
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">Name</span><input className="h-text" value={s.name} onChange={(e) => edit({ name: e.target.value })} /></label>
              {s.R != null
                ? <Num label="Fixed R" unit="m²K/W" step={0.01} min={0.01} value={s.R} onChange={(v) => v > 0 && edit({ R: v })} />
                : <Num label="λ" unit="W/mK" step={0.005} min={0.005} value={s.k ?? 0.04} onChange={(v) => v > 0 && edit({ k: v })} />}
              <Num label="ρ" unit="kg/m³" step={10} min={1} value={s.rho} onChange={(v) => v > 0 && edit({ rho: v })} />
              <Num label="c" unit="J/kgK" step={10} min={100} value={s.cp} onChange={(v) => v > 0 && edit({ cp: v })} />
              <Num label="μ" step={1} min={1} value={s.mu ?? 1} onChange={(v) => v >= 1 && edit({ mu: v })} />
              <Num label="Default thickness" unit="mm" step={5} min={1} value={s.t} onChange={(v) => v > 0 && edit({ t: v, min: Math.min(s.min, v), max: Math.max(s.max, v) })} />
              <label className="hf"><span className="eyebrow">Colour</span><input type="color" value={s.col} onChange={(e) => edit({ col: e.target.value })} /></label>
            </div>
          )}
          <p className="small">Volumetric heat capacity <b className="mono">{fmt((s.rho * s.cp) / 1000)} kJ/m³K</b>{s.k ? <> · R per 100 mm <b className="mono">{fmt(0.1 / s.k, 2)} m²K/W</b></> : null}</p>
          <p className="small">Default thickness {s.t} mm (range {s.min}–{s.max}). Vapour resistance μ {s.mu ?? 'not given'}.</p>
          <div className="chips">
            <button type="button" className="btn-primary" onClick={() => copy(s)}>Duplicate as custom</button>
            {custom && <button type="button" className="btn-danger" disabled={inUse.length > 0} title={inUse.length ? 'Used in a build-up' : undefined} onClick={() => { deleteCustomMaterial(s.id); setSel('pir'); bump((n) => n + 1); }}>Delete</button>}
          </div>
          <div className="eyebrow">Used in</div>
          {inUse.length ? inUse.map((b) => <a key={b.id} className="small" href={href('buildups', b.id)}>{b.name}</a>) : <p className="small muted">Not used in any build-up yet.</p>}
        </Card>
      </aside>
    </div>
  );
}
