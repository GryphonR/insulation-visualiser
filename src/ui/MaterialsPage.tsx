import { useMemo, useState } from 'react';
import { MATERIALS, MATERIAL_CATEGORIES, MAT, deleteCustomMaterial, saveCustomMaterial } from '../engine/data';
import type { Material } from '../engine/data';
import { Card, Num, fmt, uid } from './hform';
import { useProject } from './project';
import { storedProjectsUsing } from '../engine/projects';
import { href } from './route';

/** Every property of a new custom material, entered before it joins the library. */
function MaterialModal({ onCancel, onSave }: { onCancel: () => void; onSave: (m: Material) => void }) {
  const [m, setM] = useState({ name: '', fixedR: false, k: 0.04, R: 0.18, rho: 100, cp: 1000, mu: 5, t: 100, min: 10, max: 400, col: '#d8c9a3' });
  const set = (p: Partial<typeof m>) => setM((x) => ({ ...x, ...p }));
  const ok = m.name.trim() && (m.fixedR ? m.R > 0 : m.k > 0) && m.rho > 0 && m.cp > 0 && m.mu >= 1 && m.t > 0 && m.min > 0 && m.max >= m.min;
  const save = () => ok && onSave({
    id: uid('cm'), name: m.name.trim(), ...(m.fixedR ? { R: m.R } : { k: m.k }), rho: m.rho, cp: m.cp, mu: m.mu, col: m.col,
    t: m.t, min: Math.min(m.min, m.t), max: Math.max(m.max, m.t), step: m.t >= 50 ? 5 : 1,
  });
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="New custom material">
        <div className="modal-head"><h2>New custom material</h2></div>
        <div className="modal-body">
          <label className="hf"><span className="eyebrow">Name</span><input className="h-text" autoFocus maxLength={60} placeholder="e.g. Hemp-lime block" value={m.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="roof-check"><input type="checkbox" checked={m.fixedR} onChange={(e) => set({ fixedR: e.target.checked })} />Fixed resistance instead of conductivity (air gaps, foils)</label>
          <div className="hf-row">
            {m.fixedR
              ? <Num label="Fixed R" unit="m²K/W" step={0.01} min={0.01} value={m.R} onChange={(v) => set({ R: v })} />
              : <Num label="λ conductivity" unit="W/mK" step={0.005} min={0.005} value={m.k} onChange={(v) => set({ k: v })} />}
            <Num label="ρ density" unit="kg/m³" step={10} min={1} value={m.rho} onChange={(v) => set({ rho: v })} />
            <Num label="c specific heat" unit="J/kgK" step={10} min={100} value={m.cp} onChange={(v) => set({ cp: v })} />
            <Num label="μ vapour resistance" step={1} min={1} value={m.mu} onChange={(v) => set({ mu: v })} />
          </div>
          <div className="hf-row">
            <Num label="Default thickness" unit="mm" step={5} min={1} value={m.t} onChange={(v) => set({ t: v })} />
            <Num label="Minimum" unit="mm" step={5} min={1} value={m.min} onChange={(v) => set({ min: v })} />
            <Num label="Maximum" unit="mm" step={5} min={1} value={m.max} onChange={(v) => set({ max: v })} />
            <label className="hf"><span className="eyebrow">Colour</span><input type="color" value={m.col} onChange={(e) => set({ col: e.target.value })} /></label>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!ok} onClick={save}>Add material</button>
        </div>
      </div>
    </div>
  );
}

/** Board 2a: the material library. Built-in values are locked, so this is a reference for the layers in the build-ups. */
export function MaterialsPage() {
  const { house, project, active, customStackups, projectId } = useProject();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [sel, setSel] = useState('pir');
  const [, bump] = useState(0);
  const save = (m: Material) => { saveCustomMaterial(m); bump((n) => n + 1); };
  const [creating, setCreating] = useState(false);
  const copy = (m: Material) => {
    const id = uid('cm');
    save({ ...m, id, name: `${m.name} (custom)` });
    setSel(id);
  };
  const rows = MATERIALS.filter((m) => (cat === 'all' || (m.cat ?? 'common') === cat) && m.name.toLowerCase().includes(q.toLowerCase()));
  const s = MAT[sel] ?? MATERIALS[0];
  const usedBy = (id: string) => house.buildups.filter((b) => b.layers.some(([m]) => m === id));
  const inUse = usedBy(s.id);
  const custom = s.cat === 'custom';
  // A custom material can't be deleted while anything else uses it: its layers would silently drop out of those walls.
  const others = useMemo(() => (custom ? storedProjectsUsing(s.id, projectId) : []), [custom, s.id, projectId]);
  const has = (layers: Array<[string, number]>) => layers.some(([m]) => m === s.id);
  const elsewhere = custom ? [
    ...project.scenarios.filter((x) => x.id !== active.id && x.house.buildups.some((b) => has(b.layers))).map((x) => `scenario ${x.name}`),
    ...customStackups.filter((b) => has(b.layers)).map((b) => `library build-up ${b.name}`),
    ...others.map((n) => `project ${n}`),
  ] : [];
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
          <button type="button" className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>+ Custom material</button>
        </div>
        <div className="card" style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <table className="h-table sticky-head">
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
            {custom && <button type="button" className="btn-danger" disabled={inUse.length + elsewhere.length > 0} title={inUse.length + elsewhere.length ? 'Used in a build-up' : undefined} onClick={() => { deleteCustomMaterial(s.id); setSel('pir'); bump((n) => n + 1); }}>Delete</button>}
          </div>
          <div className="eyebrow">Used in</div>
          {inUse.length ? inUse.map((b) => <a key={b.id} className="small" href={href('buildups', b.id)}>{b.name}</a>) : <p className="small muted">Not used in this scenario's build-ups.</p>}
          {elsewhere.length > 0 && <p className="small muted">Also used in {elsewhere.join(', ')}.{custom && ' Remove it from those before deleting.'}</p>}
        </Card>
      </aside>
      {creating && <MaterialModal onCancel={() => setCreating(false)} onSave={(m) => { save(m); setSel(m.id); setCreating(false); }} />}
    </div>
  );
}
