import { useMemo, useState } from 'react';
import { DOOR_LIBRARY, GLAZING_LIBRARY, buildupU } from '../engine/house';
import type { Buildup, BuildupKind } from '../engine/house';
import type { Stackup } from '../engine/library';
import { fmt } from './hform';
import { go, href } from './route';
import { useFavorites } from './useFavorites';

type Preset = Omit<Buildup, 'id'>;
interface Item { key: string; preset: Preset }

const CATS: Array<[string, string]> = [['all', 'All'], ['fav', '★ Favourites'], ['wall', 'Walls'], ['roof', 'Roofs'], ['glazing', 'Windows'], ['door', 'Doors']];

const custom = (key: string) => !/^(preset:|g:|d:)/.test(key);

/** Categories on the left, matching presets on the right, stars remembered across projects. Custom presets can be deleted. */
export function PresetBrowser({ library, have, onAdd, onDelete, tools, actionLabel = 'Add', layeredOnly }: {
  library: Stackup[]; have: Set<string>; onAdd: (p: Preset, key: string) => void; onDelete?: (id: string) => void;
  actionLabel?: string;
  /** Walls and roofs only: for picking something to simulate. */
  layeredOnly?: boolean;
  /** Adds Simulate and Compare to each layered build-up, and a Compare button under the list. */
  tools?: boolean;
}) {
  const [pick, setPick] = useState<string[]>([]);
  const togglePick = (k: string) => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 2 ? [...p, k] : p));
  const { fav, toggleBuildup } = useFavorites();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const cats = layeredOnly ? CATS.filter(([c]) => c !== 'glazing' && c !== 'door') : CATS;
  const items = useMemo<Item[]>(() => [
    ...library.map((s): Item => ({ key: s.id, preset: { name: s.name, kind: s.orient === 'roof' ? 'roof' : 'wall', layers: s.layers.map(([m, t]) => [m, t]) } })),
    ...GLAZING_LIBRARY.map((g): Item => ({ key: `g:${g.name}`, preset: { kind: 'glazing', layers: [], ...g } })),
    ...DOOR_LIBRARY.map((d): Item => ({ key: `d:${d.name}`, preset: { kind: 'door', layers: [], ...d } })),
  ].filter((i) => !layeredOnly || i.preset.layers.length > 0), [library, layeredOnly]);
  const shown = items.filter((i) => (cat === 'all' || (cat === 'fav' ? fav.buildups.includes(i.key) : i.preset.kind === (cat as BuildupKind))) && i.preset.name.toLowerCase().includes(q.toLowerCase()));
  const count = (c: string) => items.filter((i) => (c === 'all' || (c === 'fav' ? fav.buildups.includes(i.key) : i.preset.kind === c))).length;

  return (
    <div style={{ display: 'flex', minHeight: 360 }}>
      <nav aria-label="Categories" style={{ flex: '0 0 170px', borderRight: '1px solid var(--line-strong)', display: 'flex', flexDirection: 'column' }}>
            {cats.map(([c, label]) => (
              <button key={c} type="button" className={c === cat ? 'lib-row on' : 'lib-row'} aria-pressed={c === cat} onClick={() => setCat(c)}>
                <span>{label}</span><span className="mono small muted">{count(c)}</span>
              </button>
            ))}
          </nav>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--line-strong)' }}>
              <input className="srch" style={{ width: '100%' }} autoFocus aria-label="Search build-ups" placeholder="Search build-ups" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div style={{ overflow: 'auto', maxHeight: '50vh' }}>
              {shown.map((i) => {
                const added = have.has(i.preset.name), starred = fav.buildups.includes(i.key);
                return (
                  <div key={i.key} className="lib-row" style={{ display: 'grid', gap: 8, gridTemplateColumns: `auto 1fr 70px ${tools ? '84px 90px ' : ''}96px${onDelete ? ' 84px' : ''}`, alignItems: 'center', cursor: 'default' }}>
                    <button type="button" className="btn-link" style={{ fontSize: 16 }} aria-pressed={starred} aria-label={`${starred ? 'Unstar' : 'Star'} ${i.preset.name}`} onClick={() => toggleBuildup(i.key)}>{starred ? '★' : '☆'}</button>
                    <span><b style={{ fontWeight: 500 }}>{i.preset.name}</b> <span className="small muted">· {i.preset.kind}</span></span>
                    <span className="mono small">U {fmt(buildupU({ id: '', ...i.preset }), 2)}</span>
                    {tools && (i.preset.layers.length > 0 ? <>
                      <label className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={pick.includes(i.key)} disabled={!pick.includes(i.key) && pick.length >= 2} onChange={() => togglePick(i.key)} />Compare</label>
                      <a className="btn-secondary as-btn" href={href('wall', i.key)}>Simulate</a>
                    </> : <><span /><span /></>)}
                    {added ? <span className="small muted" style={{ textAlign: 'center' }}>In project</span> : <button type="button" className="btn-secondary" onClick={() => onAdd(i.preset, i.key)}>{actionLabel}</button>}
                    {onDelete && (custom(i.key) ? <button type="button" className="btn-secondary" onClick={() => onDelete(i.key)}>Remove</button> : <span />)}
                  </div>
                );
              })}
              {shown.length === 0 && <p className="small muted" style={{ padding: 12 }}>{cat === 'fav' ? 'Star presets to find them here.' : 'No presets match.'}</p>}
            </div>
            {tools && (
              <div style={{ padding: 12, borderTop: '1px solid var(--line-strong)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                <span className="small muted">{pick.length}/2 ticked to compare</span>
                <button type="button" className="btn-primary" disabled={pick.length !== 2} onClick={() => go('wall', pick[0], pick[1])}>Compare</button>
              </div>
            )}
          </div>
    </div>
  );
}

/** Pick presets to add to the project. */
export function AddBuildupModal({ library, have, onAdd, onCustom, onClose, title = 'Add build-up to project', actionLabel, layeredOnly }: {
  library: Stackup[]; have: Set<string>; onAdd: (p: Preset, key: string) => void; onCustom?: () => void; onClose: () => void;
  title?: string; actionLabel?: string; layeredOnly?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: 'min(860px, 96vw)' }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          <PresetBrowser library={library} have={have} onAdd={onAdd} actionLabel={actionLabel} layeredOnly={layeredOnly} />
        </div>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          {onCustom ? <button type="button" className="btn-secondary" onClick={onCustom}>Create a custom build-up…</button> : <span />}
          <button type="button" className="btn-primary" onClick={onClose}>{onCustom ? 'Done' : 'Cancel'}</button>
        </div>
      </div>
    </div>
  );
}
