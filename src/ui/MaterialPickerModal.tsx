import { useState } from 'react';
import { MAT, MATERIALS, MATERIAL_GROUPS } from '../engine/data';
import type { Material } from '../engine/data';
import { MU_CLOSED } from '../engine/materials-mu';
import type { LayerInput } from '../engine/simulate';
import { ROLE_LABELS, layerR, roleOf, thicknessForR } from '../engine/swap';
import type { Role } from '../engine/swap';
import { useFavorites } from './useFavorites';

const FAV_CAT = '__fav__';
const RECENT_CAT = '__recent__';

type Sort = 'default' | 'thin' | 'lambda';

interface Props {
  /** Currently-chosen material id, if any (highlighted, and used to pick the starting category). */
  value: string;
  title: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** The layer being replaced: enables the "same R" thickness preview, the thinnest-first sort and a like-for-like filter. */
  swapFrom?: LayerInput;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.5 9.8 5.6 14.3 6.1 11 9.1 11.9 13.5 8 11.3 4.1 13.5 5 9.1 1.7 6.1 6.2 5.6 8 1.5Z"
        fill={filled ? '#f2a900' : 'none'}
        stroke={filled ? '#c98400' : '#8a97a0'}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function matLine(m: Material): string {
  const r = m.R ?? m.t / 1000 / (m.k as number);
  const base = m.R ? `R ${r.toFixed(2)} m²K/W` : `λ ${m.k} W/mK`;
  const mu = m.mu === undefined ? '' : m.mu >= MU_CLOSED ? ' · vapour-closed' : ` · µ ${m.mu === m.muWet ? m.mu : `${m.mu}/${m.muWet}`}`;
  return `${base} · ${Math.round(m.rho)} kg/m³${mu}`;
}

export function MaterialPickerModal({ value, title, onSelect, onClose, swapFrom }: Props) {
  const { fav, toggleMaterial, pushRecent } = useFavorites();
  const hasFavMaterials = fav.materials.length > 0;
  const hasRecent = fav.recent.length > 0;
  const [cat, setCat] = useState(() => (swapFrom ? MAT[value]?.cat ?? 'common' : hasFavMaterials ? FAV_CAT : MAT[value]?.cat ?? 'common'));
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | 'all'>(() => (swapFrom ? roleOf(MAT[swapFrom.mat]) : 'all'));
  const [sort, setSort] = useState<Sort>('default');

  const oldR = swapFrom ? layerR(MAT[swapFrom.mat], swapFrom.t) : 0;
  const eq = (m: Material) => (swapFrom ? thicknessForR(m, oldR, swapFrom.t) : null);

  const byId = (ids: string[]) => ids.map((id) => MAT[id]).filter((m): m is Material => !!m);
  const q = query.trim().toLowerCase();
  let items: Material[] = q
    ? MATERIALS.filter((m) => m.name.toLowerCase().includes(q))
    : cat === FAV_CAT
      ? byId(fav.materials)
      : cat === RECENT_CAT
        ? byId(fav.recent)
        : MATERIAL_GROUPS.find((g) => g.cat === cat)?.items ?? [];
  if (role !== 'all') items = items.filter((m) => roleOf(m) === role);
  if (sort === 'lambda') items = [...items].sort((a, b) => (a.k ?? Infinity) - (b.k ?? Infinity));
  if (sort === 'thin') items = [...items].sort((a, b) => (a.R ? Infinity : eq(a)!.t) - (b.R ? Infinity : eq(b)!.t));

  const pick = (id: string) => {
    pushRecent(id);
    onSelect(id);
    onClose();
  };
  const catBtn = (id: string, label: string, count: number) => (
    <button key={id} type="button" className={!q && cat === id ? 'picker-cat on' : 'picker-cat'} onClick={() => { setCat(id); setQuery(''); }}>
      <span>{label}</span><span className="picker-count">{count}</span>
    </button>
  );

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-picker" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" fill="none" stroke="#14212b" strokeWidth={1.8} strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="picker-body">
          <nav className="picker-cats" aria-label="Material categories">
            {hasFavMaterials && catBtn(FAV_CAT, '★ Favourites', fav.materials.length)}
            {hasRecent && catBtn(RECENT_CAT, 'Recently used', fav.recent.length)}
            {MATERIAL_GROUPS.map((g) => catBtn(g.cat, g.label, g.items.length))}
          </nav>

          <div className="picker-main">
            <div className="picker-tools">
              <div className="picker-tools-row">
                <input type="search" className="picker-search" placeholder="Search all materials…" aria-label="Search materials" value={query} onChange={(e) => setQuery(e.target.value)} />
                <select className="select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="default">Default order</option>
                  <option value="lambda">Lowest λ first</option>
                  {swapFrom && <option value="thin">Thinnest for same R</option>}
                </select>
              </div>
              <div className="picker-chips" role="group" aria-label="Filter by type">
                {(['all', 'insulation', 'dense', 'other', 'air'] as const).map((r) => (
                  <button key={r} type="button" className={role === r ? 'picker-chip on' : 'picker-chip'} aria-pressed={role === r} onClick={() => setRole(r)}>
                    {r === 'all' ? 'All types' : ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="picker-items">
              {items.length === 0 && (
                <p className="small muted picker-empty">
                  {cat === FAV_CAT && !q && role === 'all'
                    ? 'No materials starred yet — star one from any category to find it here quickly.'
                    : 'No materials match. Try a different search or filter.'}
                </p>
              )}
              {items.map((m) => {
                const f = eq(m);
                return (
                  <div key={m.id} className={m.id === value ? 'picker-item on' : 'picker-item'}>
                    <button
                      type="button"
                      className="icon-btn small"
                      aria-label={fav.materials.includes(m.id) ? `Unfavourite ${m.name}` : `Favourite ${m.name}`}
                      onClick={() => toggleMaterial(m.id)}
                    >
                      <StarIcon filled={fav.materials.includes(m.id)} />
                    </button>
                    <button type="button" className="picker-item-btn" onClick={() => pick(m.id)}>
                      <span className="picker-item-name">{m.name}</span>
                      <span className="picker-item-meta mono">
                        <span>{matLine(m)}</span>
                        {f && !m.R && <span className="picker-item-eq">same R → {f.t} mm{f.missed ? ' (limit)' : ''}</span>}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
