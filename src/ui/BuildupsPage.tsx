import { useMemo, useState } from 'react';
import { BUILTIN_STACKUPS, layersFromTuples } from '../engine/library';
import { DEFAULT_SCENARIO, runScenario } from '../engine/scenario';
import { MAT } from '../engine/data';
import { buildupU } from '../engine/house';
import type { Buildup, BuildupKind } from '../engine/house';
import { AddBuildupModal } from './AddBuildupModal';
import { Card, Num, fmt, uid } from './hform';
import { useProject } from './project';
import { href } from './route';
import { StackupModal } from './StackupModal';
import type { StackupDraft } from './StackupModal';

const KIND_LABEL: Record<BuildupKind, string> = { wall: 'Wall', floor: 'Floor', roof: 'Roof / ceiling', glazing: 'Glazing', door: 'Door' };
const KIND_GROUP: Record<BuildupKind, string> = { wall: 'Walls', floor: 'Floors', roof: 'Roofs', glazing: 'Glazing', door: 'Doors' };
const layerR = (m: string, t: number) => { const x = MAT[m]; return !x ? 0 : x.R ?? (x.k ? t / 1000 / x.k : 0); };

/** Board 2: the project's build-up library. Edits here change every face that uses the build-up. */
export function BuildupsPage({ selected }: { selected?: string }) {
  const { house, upd, res, customStackups } = useProject();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<BuildupKind | 'all'>('all');
  const [sel, setSel] = useState(selected && house.buildups.some((b) => b.id === selected) ? selected : house.buildups[0]?.id ?? '');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [hov, setHov] = useState<number | null>(null);
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
  // "Used" means some face, opening or zone really has it, the same test as the "not used" label in the list.
  const isUsed = (id: string) => usedCount(id) > 0 || house.openings.some((o) => o.buildup === id) || !!house.zones?.some((z) => z.buildup === id);

  const set = (patch: Partial<Buildup>) => upd((h) => { const x = h.buildups.find((y) => y.id === sel); if (x) Object.assign(x, patch); });
  const duplicate = () => {
    if (!b) return;
    const id = uid('b');
    upd((h) => { h.buildups.push({ ...structuredClone(b), id, name: `${b.name} (copy)` }); });
    setSel(id);
  };
  /** Drops build-ups; a default that pointed at one moves to another of the same kind, and one with no stand-in stays. */
  const drop = (ids: string[]) => {
    const gone = new Set(ids);
    upd((h) => {
      for (const k of Object.keys(h.defaults) as Array<keyof typeof h.defaults>) {
        const cur = h.buildups.find((x) => x.id === h.defaults[k]);
        if (!cur || !gone.has(cur.id)) continue;
        const alt = h.buildups.find((x) => !gone.has(x.id) && x.kind === cur.kind);
        if (alt) h.defaults[k] = alt.id; else gone.delete(cur.id);
      }
      h.buildups = h.buildups.filter((x) => !gone.has(x.id));
      for (const k of Object.keys(h.faceBuildup)) if (gone.has(h.faceBuildup[k])) delete h.faceBuildup[k];
    });
    setSel((s) => (gone.has(s) ? house.buildups.find((x) => !gone.has(x.id))?.id ?? '' : s));
  };
  const remove = () => b && !isUsed(b.id) && drop([b.id]);
  const unused = house.buildups.filter((x) => !isUsed(x.id));
  const removeUnused = () => drop(unused.map((x) => x.id));
  const applyLayers = (draft: StackupDraft) => {
    set({ layers: draft.layers, ...(draft.name.trim() ? { name: draft.name.trim() } : {}) });
    setEditing(false);
  };

  const shown = house.buildups.filter((x) => (kind === 'all' || x.kind === kind) && x.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(shown.map((x) => x.kind))];
  const thick = b ? b.layers.reduce((a, [, t]) => a + t, 0) : 0;
  const R = b ? 1 / buildupU(b) : 0;
  // Same typical-day run the layer editor uses: decrement and delay barely depend on weather.
  const dyn = useMemo(() => {
    // A floor sits on the ground, which doesn't swing over a day: no decrement or delay to show.
    if (!b || b.layers.length === 0 || b.kind === 'floor') return null;
    const { sim } = runScenario({ ...DEFAULT_SCENARIO, orient: b.kind === 'roof' ? 'roof' : DEFAULT_SCENARIO.orient, layers: layersFromTuples(b.layers) });
    return { decr: sim.decr, lag: sim.lag };
  }, [b]);
  const whereUsed = b ? [...(used.get(b.id)?.entries() ?? [])] : [];

  return (
    <>
      <div className="lib">
        <aside className="lib-list">
          <div className="filters">
            <div>
              <div className="eyebrow">This project's build-ups</div>
              <p className="small muted" style={{ margin: '2px 0 0' }}>Only these can be picked for walls, floors and roofs. Add presets or create your own at the bottom.</p>
            </div>
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
            <button type="button" className="btn-primary" onClick={() => setAdding(true)}>+ Add build-up to project</button>
            <button type="button" className="btn-secondary" disabled={unused.length === 0} onClick={removeUnused}>Remove {unused.length || 'all'} unused</button>
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
                <button type="button" className="btn-secondary" disabled={isUsed(b.id)} title={isUsed(b.id) ? 'In use: reassign its faces first' : undefined} onClick={remove}>Remove</button>
                {b.layers.length > 0 && <a className="btn-primary as-btn" href={href('wall', b.id)}>Simulate ›</a>}
              </div>
            </div>

            <div className="kpis">
              <div className="kpi"><span className="eb">U-value</span><span className="v">{fmt(buildupU(b), 2)}</span><span className="small muted">W/m²K{b.u == null ? ` · R ${fmt(R, 2)}` : ' · fixed'}</span></div>
              {b.layers.length > 0 && <div className="kpi"><span className="eb">Thickness</span><span className="v">{fmt(thick, 1)}</span><span className="small muted">mm</span></div>}
              {dyn && <div className="kpi"><span className="eb">Decrement factor</span><span className="v">{fmt(dyn.decr, 2)}</span><span className="small muted">share of outside swing reaching inside</span></div>}
              {dyn && <div className="kpi"><span className="eb">Decrement delay</span><span className="v">{fmt(dyn.lag, 1)}</span><span className="small muted">hours</span></div>}
              {b.kind === 'floor' && (
                <div className="kpi"><span className="eb">Ground floor type</span>
                  <select className="select" value={b.floorType ?? 'solid'} aria-label="Ground floor type" onChange={(e) => set({ floorType: e.target.value as Buildup['floorType'] })}>
                    <option value="solid">solid slab</option><option value="suspended">suspended timber</option>
                  </select>
                </div>
              )}
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
              <Card title="Layers · outside → inside" right={<button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>}>
                <div className="h-table-wrap">
                  <table className="h-table">
                    <thead><tr><th>#</th><th>Material</th><th className="n">mm</th><th className="n">λ</th><th className="n">R m²K/W</th><th className="n">ρ</th><th className="n">c</th></tr></thead>
                    <tbody onMouseLeave={() => setHov(null)}>
                      {b.layers.map(([m, t], i) => {
                        const x = MAT[m];
                        return (
                          <tr key={i} style={hov === i ? { background: '#fbe6d8' } : undefined} onMouseEnter={() => setHov(i)}>
                            <td><span className="mono small" style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, border: '1px solid var(--ink)', background: x?.col }}>{i + 1}</span></td>
                            <td>{x?.name ?? m}</td>
                            <td className="n mono">{t}</td>
                            <td className="n mono">{x?.k ?? '—'}</td>
                            <td className="n mono">{fmt(layerR(m, t), 2)}</td>
                            <td className="n mono">{x?.rho}</td>
                            <td className="n mono">{x?.cp}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="layer-strip" style={{ height: 90 }} role="img" aria-label="Section through the build-up" onMouseLeave={() => setHov(null)}>
                  {b.layers.map(([m, t], i) => (
                    <span key={i} title={`${MAT[m]?.name ?? m} ${t} mm`} onMouseEnter={() => setHov(i)}
                      style={{ flex: `${t} 1 0`, background: MAT[m]?.col, opacity: hov == null || hov === i ? 1 : 0.45, outline: hov === i ? '3px solid var(--ink)' : undefined, outlineOffset: -3 }} />
                  ))}
                </div>
              </Card>
            )}

            <Card title="Where used" note={`${usedCount(b.id)} face${usedCount(b.id) === 1 ? '' : 's'}`}>
              {whereUsed.length === 0 && <p className="small muted">Not used by any face yet. Pick it for a wall on the floor plan.</p>}
              {whereUsed.map(([room, tags]) => <div key={room} className="small"><b>{room}</b> · {[...tags].join(', ')}</div>)}
              <p className="small muted">Edits here change every face that uses this build-up. Duplicate it to try a change on one face without touching the rest.</p>
            </Card>
          </>}
        </main>
      </div>

      {adding && (
        <AddBuildupModal library={library} have={new Set(house.buildups.map((x) => x.name))} onClose={() => setAdding(false)}
          onCustom={() => { setAdding(false); setCreating(true); }}
          onAdd={(p) => { const id = uid('b'); upd((h) => { h.buildups.push({ ...structuredClone(p), id }); }); setSel(id); }} />
      )}
      {creating && (
        <StackupModal library={library} title="New build-up" initial={{ name: '', layers: [['pir', 100]], kind: 'wall' }}
          onCancel={() => setCreating(false)}
          onSave={(d) => {
            const id = uid('b');
            upd((h) => { h.buildups.push({ id, name: d.name, kind: d.kind ?? 'wall', layers: d.layers }); });
            setSel(id); setCreating(false);
          }} />
      )}
      {editing && b && (
        <StackupModal library={library} title={`Edit layers: ${b.name}`} initial={{ name: b.name, layers: b.layers, orient: b.kind === 'roof' ? 'roof' : undefined }}
          onCancel={() => setEditing(false)} onSave={applyLayers} onApply={applyLayers} />
      )}
    </>
  );
}
