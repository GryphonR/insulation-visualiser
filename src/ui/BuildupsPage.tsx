import { useMemo, useState } from 'react';
import { BUILTIN_STACKUPS } from '../engine/library';
import { MAT, MATERIAL_GROUPS } from '../engine/data';
import { GLAZING_LIBRARY, buildupU } from '../engine/house';
import type { Buildup, BuildupKind, DefaultKey } from '../engine/house';
import { Card, Num, fmt, uid } from './hform';
import { useProject } from './project';
import { href } from './route';
import { StackupModal } from './StackupModal';
import type { StackupDraft } from './StackupModal';

const KIND_LABEL: Record<BuildupKind, string> = { wall: 'Wall', floor: 'Floor', roof: 'Roof / ceiling', glazing: 'Glazing', door: 'Door' };
const KIND_GROUP: Record<BuildupKind, string> = { wall: 'Walls', floor: 'Floors', roof: 'Roofs', glazing: 'Glazing', door: 'Doors' };
const DEFAULT_LABEL: Record<DefaultKey, [string, BuildupKind[]]> = {
  extWall: ['Outside walls', ['wall']], intWall: ['Internal walls', ['wall']], groundFloor: ['Ground floors', ['floor']], intFloor: ['Floors between storeys', ['floor']],
  loftCeiling: ['Ceilings to loft', ['roof', 'floor']], loftRoof: ['Loft roof', ['roof']], flatRoof: ['Flat roofs', ['roof']], exposedFloor: ['Exposed floors', ['floor']],
  slope: ['Sloping ceilings', ['roof']], knee: ['Knee walls', ['wall']], dormerWall: ['Dormer fronts & cheeks', ['wall']], dormerRoof: ['Dormer roofs', ['roof']],
};
const layerR = (m: string, t: number) => { const x = MAT[m]; return !x ? 0 : x.R ?? (x.k ? t / 1000 / x.k : 0); };

/** Board 2: the project's build-up library. Edits here change every face that uses the build-up. */
export function BuildupsPage({ selected }: { selected?: string }) {
  const { house, upd, res, customStackups } = useProject();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<BuildupKind | 'all'>('all');
  const [sel, setSel] = useState(selected && house.buildups.some((b) => b.id === selected) ? selected : house.buildups[0]?.id ?? '');
  const [editing, setEditing] = useState(false);
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  const b = house.buildups.find((x) => x.id === sel);

  // Faces by build-up, for "where used" and the counts in the list.
  const used = useMemo(() => {
    const m = new Map<string, Map<string, Set<string>>>();
    res.rooms.forEach((r) => r.faces.forEach((f) => {
      const byRoom = m.get(f.buildup.id) ?? new Map<string, Set<string>>();
      const tags = byRoom.get(r.room.name) ?? new Set<string>();
      tags.add(f.kind === 'wall' || f.kind === 'window' || f.kind === 'door' ? f.side ?? f.kind : f.kind);
      byRoom.set(r.room.name, tags); m.set(f.buildup.id, byRoom);
    }));
    return m;
  }, [res]);
  const usedCount = (id: string) => [...(used.get(id)?.values() ?? [])].reduce((a, s) => a + s.size, 0);
  const isUsed = (id: string) => Object.values(house.defaults).includes(id) || Object.values(house.faceBuildup).includes(id) || house.openings.some((o) => o.buildup === id);

  const set = (patch: Partial<Buildup>) => upd((h) => { const x = h.buildups.find((y) => y.id === sel); if (x) Object.assign(x, patch); });
  const setLayer = (i: number, fn: (l: [string, number]) => [string, number] | null) => upd((h) => {
    const x = h.buildups.find((y) => y.id === sel);
    if (!x) return;
    const n = fn(x.layers[i]);
    if (n) x.layers[i] = n; else x.layers.splice(i, 1);
  });
  const move = (i: number, d: number) => upd((h) => { const x = h.buildups.find((y) => y.id === sel); if (x && x.layers[i + d]) [x.layers[i], x.layers[i + d]] = [x.layers[i + d], x.layers[i]]; });
  const duplicate = () => {
    if (!b) return;
    const id = uid('b');
    upd((h) => { h.buildups.push({ ...structuredClone(b), id, name: `${b.name} (copy)` }); });
    setSel(id);
  };
  const remove = () => {
    if (!b || isUsed(b.id)) return;
    upd((h) => { h.buildups = h.buildups.filter((x) => x.id !== b.id); });
    setSel(house.buildups.find((x) => x.id !== b.id)?.id ?? '');
  };
  const applyLayers = (draft: StackupDraft) => {
    set({ layers: draft.layers, ...(draft.name.trim() ? { name: draft.name.trim() } : {}) });
    setEditing(false);
  };

  const shown = house.buildups.filter((x) => (kind === 'all' || x.kind === kind) && x.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(shown.map((x) => x.kind))];
  const thick = b ? b.layers.reduce((a, [, t]) => a + t, 0) : 0;
  const R = b ? 1 / buildupU(b) : 0;
  const whereUsed = b ? [...(used.get(b.id)?.entries() ?? [])] : [];
  const defaultsUsing = b ? (Object.keys(DEFAULT_LABEL) as DefaultKey[]).filter((k) => house.defaults[k] === b.id).map((k) => DEFAULT_LABEL[k][0]) : [];

  return (
    <>
      <div className="lib">
        <aside className="lib-list">
          <div className="filters">
            <input className="srch" aria-label="Search build-ups" placeholder="Search build-ups" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="chips">
              {(['all', 'wall', 'floor', 'roof', 'glazing', 'door'] as const).map((k) => (
                <button key={k} type="button" className={kind === k ? 'chip on' : 'chip'} aria-pressed={kind === k} style={{ minHeight: 32 }} onClick={() => setKind(k)}>{k === 'all' ? 'All' : KIND_GROUP[k]}</button>
              ))}
            </div>
          </div>
          <div className="lib-items">
            {groups.map((g) => (
              <div key={g}>
                <div className="eyebrow" style={{ padding: '10px 12px 4px' }}>{KIND_GROUP[g]}</div>
                {shown.filter((x) => x.kind === g).map((x) => (
                  <button key={x.id} type="button" className={x.id === sel ? 'lib-row on' : 'lib-row'} aria-pressed={x.id === sel} onClick={() => setSel(x.id)}>
                    <span style={{ fontWeight: 500, color: isUsed(x.id) ? 'var(--ink)' : 'var(--muted)' }}>{x.name}</span><span className="mono small">U {fmt(buildupU(x), 2)}</span>
                    <span className="mono small muted">{usedCount(x.id) || 'not used'}</span>
                  </button>
                ))}
              </div>
            ))}
            {shown.length === 0 && <p className="small muted" style={{ padding: 12 }}>No build-ups match.</p>}
          </div>
          <div style={{ padding: 12, borderTop: '1px solid var(--line-strong)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="hf"><span className="eyebrow">Add from the wall and roof presets</span>
              <select className="select" value="" onChange={(e) => {
                const s = library.find((x) => x.id === e.target.value);
                if (!s) return;
                const id = uid('b');
                upd((h) => { h.buildups.push({ id, name: s.name, kind: s.orient === 'roof' ? 'roof' : 'wall', layers: s.layers.map(([m, t]) => [m, t]) }); });
                setSel(id);
              }}>
                <option value="">Choose…</option>
                {library.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="hf"><span className="eyebrow">Add glazing or a door</span>
              <select className="select" value="" onChange={(e) => {
                const i = Number(e.target.value), id = uid('b');
                if (e.target.value === 'door') upd((h) => { h.buildups.push({ id, name: 'New door', kind: 'door', layers: [], u: 1.8 }); });
                else if (GLAZING_LIBRARY[i]) upd((h) => { h.buildups.push({ id, kind: 'glazing', layers: [], ...GLAZING_LIBRARY[i] }); });
                else return;
                setSel(id);
              }}>
                <option value="">Choose…</option>
                {GLAZING_LIBRARY.map((x, i) => <option key={x.name} value={i}>{x.name} (U {x.u}, g {x.g})</option>)}
                <option value="door">External door (U 1.8)</option>
              </select>
            </label>
          </div>
        </aside>

        <main className="lib-main">
          {!b ? <p className="muted">No build-up selected.</p> : <>
            <div className="page-title">
              <div>
                <div className="eyebrow">{KIND_LABEL[b.kind]} · {isUsed(b.id) ? 'in use' : 'not used'}</div>
                <input className="h-text" style={{ fontSize: 22, fontWeight: 600, minWidth: 320 }} value={b.name} aria-label="Build-up name" onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="chips">
                <button type="button" className="btn-secondary" onClick={duplicate}>Duplicate</button>
                <button type="button" className="btn-secondary" disabled={isUsed(b.id)} title={isUsed(b.id) ? 'In use: reassign its faces first' : undefined} onClick={remove}>Delete</button>
                {b.layers.length > 0 && <a className="btn-primary as-btn" href={href('wall', b.id)}>Simulate ›</a>}
              </div>
            </div>

            <div className="kpis">
              <div className="kpi"><span className="eb">U-value</span><span className="v">{fmt(buildupU(b), 2)}</span><span className="small muted">W/m²K{b.u == null ? ` · R ${fmt(R, 2)}` : ' · fixed'}</span></div>
              {b.layers.length > 0 && <div className="kpi"><span className="eb">Thickness</span><span className="v">{fmt(thick, 1)}</span><span className="small muted">mm</span></div>}
              <div className="kpi"><span className="eb">Kind</span>
                <select className="select" value={b.kind} aria-label="Kind" onChange={(e) => set({ kind: e.target.value as BuildupKind })}>
                  {(Object.keys(KIND_LABEL) as BuildupKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                {b.kind === 'floor' && (
                  <select className="select" value={b.floorType ?? 'solid'} aria-label="Ground floor type" onChange={(e) => set({ floorType: e.target.value as Buildup['floorType'] })}>
                    <option value="solid">on the ground: solid slab</option><option value="suspended">on the ground: suspended timber</option>
                  </select>
                )}
              </div>
            </div>

            {b.u != null ? (
              <Card title="Fixed values" note="Glazing and doors take a fixed U-value; every other build-up is computed from its layers.">
                <div className="hf-row">
                  <Num label="U-value" unit="W/m²K" step={0.05} min={0.1} value={b.u} onChange={(v) => v > 0 && set({ u: v })} />
                  {b.kind === 'glazing' && <>
                    <Num label="g-value" step={0.01} min={0} max={1} value={b.g ?? 0.6} onChange={(v) => set({ g: v })} />
                    <Num label="Frame fraction" step={0.05} min={0} max={0.9} value={b.frame ?? 0.3} onChange={(v) => set({ frame: v })} />
                  </>}
                </div>
              </Card>
            ) : (
              <Card title="Layers · outside → inside" right={<div className="chips"><button type="button" className="btn-secondary" onClick={() => upd((h) => { const x = h.buildups.find((y) => y.id === sel); if (x) x.layers.push(['pb', MAT.pb?.t ?? 12.5]); })}>+ Add layer</button><button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Layer editor…</button></div>}>
                <div className="h-table-wrap">
                  <table className="h-table">
                    <thead><tr><th>#</th><th>Material</th><th className="n">mm</th><th className="n">λ</th><th className="n">R m²K/W</th><th className="n">ρ</th><th className="n">c</th><th /></tr></thead>
                    <tbody>
                      {b.layers.map(([m, t], i) => {
                        const x = MAT[m];
                        return (
                          <tr key={i}>
                            <td><span className="mono small" style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, border: '1px solid var(--ink)', background: x?.col }}>{i + 1}</span></td>
                            <td>
                              <select className="h-sel" value={m} aria-label={`Layer ${i + 1} material`} onChange={(e) => { const n = MAT[e.target.value]; if (n) setLayer(i, () => [n.id, Math.min(n.max, Math.max(n.min, t))]); }}>
                                {MATERIAL_GROUPS.map((g) => <optgroup key={g.cat} label={g.label}>{g.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</optgroup>)}
                              </select>
                            </td>
                            <td className="n"><input type="number" className="thk-input" min={x?.min} max={x?.max} step={x?.step ?? 1} value={t} aria-label={`${x?.name ?? m} thickness`}
                              onChange={(e) => { const v = Number(e.target.value); if (v > 0) setLayer(i, ([mm]) => [mm, v]); }} /></td>
                            <td className="n mono">{x?.k ?? '—'}</td>
                            <td className="n mono">{fmt(layerR(m, t), 2)}</td>
                            <td className="n mono">{x?.rho}</td>
                            <td className="n mono">{x?.cp}</td>
                            <td className="h-acts">
                              <button type="button" className="btn-link" disabled={i === 0} aria-label="Move out" onClick={() => move(i, -1)}>↑</button>
                              <button type="button" className="btn-link" disabled={i === b.layers.length - 1} aria-label="Move in" onClick={() => move(i, 1)}>↓</button>
                              <button type="button" className="btn-link" disabled={b.layers.length <= 1} aria-label={`Remove ${x?.name ?? m}`} onClick={() => setLayer(i, () => null)}>×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr><td colSpan={2}>Total</td><td className="n mono">{fmt(thick, 1)}</td><td /><td className="n mono">{fmt(R, 2)}</td><td colSpan={3} /></tr></tfoot>
                  </table>
                </div>
                <div className="layer-strip" style={{ height: 90 }} role="img" aria-label="Section through the build-up">
                  {b.layers.map(([m, t], i) => <span key={i} title={`${MAT[m]?.name ?? m} ${t} mm`} style={{ flex: `${t} 1 0`, background: MAT[m]?.col }} />)}
                </div>
              </Card>
            )}

            <Card title="Where used" note={`${usedCount(b.id)} face${usedCount(b.id) === 1 ? '' : 's'}${defaultsUsing.length ? ` · default for ${defaultsUsing.join(', ').toLowerCase()}` : ''}`}>
              {whereUsed.length === 0 && <p className="small muted">Not used by any face yet. Pick it for a face in the room view, or make it a default below.</p>}
              {whereUsed.map(([room, tags]) => <div key={room} className="small"><b>{room}</b> · {[...tags].join(', ')}</div>)}
              <p className="small muted">Edits here change every face that uses this build-up. Duplicate it to try a change on one face without touching the rest.</p>
            </Card>
          </>}
        </main>
      </div>

      <Card title="Defaults by face type" note="Applies to every face of that type unless a face picks its own in the room view.">
        <div className="hf-row">
          {(Object.keys(DEFAULT_LABEL) as DefaultKey[]).map((k) => (
            <label key={k} className="hf"><span className="eyebrow">{DEFAULT_LABEL[k][0]}</span>
              <select className="select" value={house.defaults[k]} onChange={(e) => upd((h) => { h.defaults[k] = e.target.value; })}>
                {house.buildups.filter((x) => DEFAULT_LABEL[k][1].includes(x.kind)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Card>

      {editing && b && (
        <StackupModal library={library} title={`Edit layers: ${b.name}`} initial={{ name: b.name, layers: b.layers, orient: b.kind === 'roof' ? 'roof' : undefined }}
          onCancel={() => setEditing(false)} onSave={applyLayers} onApply={applyLayers} />
      )}
    </>
  );
}
