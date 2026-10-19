import { useState } from 'react';
import { MAT, MATERIAL_GROUPS } from '../engine/data';
import type { Material } from '../engine/data';
import { useFavorites } from './useFavorites';

const FAV_CAT = '__fav__';

interface Props {
  /** Currently-chosen material id, if any (highlighted, and used to pick the starting category). */
  value: string;
  title: string;
  onSelect: (id: string) => void;
  onClose: () => void;
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
  return `${base} · ${Math.round(m.rho)} kg/m³`;
}

export function MaterialPickerModal({ value, title, onSelect, onClose }: Props) {
  const { fav, toggleMaterial } = useFavorites();
  const hasFavMaterials = fav.materials.length > 0;
  const [cat, setCat] = useState(() => (hasFavMaterials ? FAV_CAT : MAT[value]?.cat ?? 'common'));

  const items: Material[] =
    cat === FAV_CAT
      ? fav.materials.map((id) => MAT[id]).filter((m): m is Material => !!m)
      : MATERIAL_GROUPS.find((g) => g.cat === cat)?.items ?? [];

  const pick = (id: string) => {
    onSelect(id);
    onClose();
  };

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
            {hasFavMaterials && (
              <button type="button" className={cat === FAV_CAT ? 'picker-cat on' : 'picker-cat'} onClick={() => setCat(FAV_CAT)}>
                <span>★ Favourites</span><span className="picker-count">{fav.materials.length}</span>
              </button>
            )}
            {MATERIAL_GROUPS.map((g) => (
              <button key={g.cat} type="button" className={cat === g.cat ? 'picker-cat on' : 'picker-cat'} onClick={() => setCat(g.cat)}>
                <span>{g.label}</span><span className="picker-count">{g.items.length}</span>
              </button>
            ))}
          </nav>

          <div className="picker-items">
            {items.length === 0 && (
              <p className="small muted picker-empty">No materials starred yet — star one from any category to find it here quickly.</p>
            )}
            {items.map((m) => (
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
                  <span className="picker-item-meta mono">{matLine(m)}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
