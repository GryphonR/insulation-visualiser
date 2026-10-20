import { useEffect, useState } from 'react';
import { loadFavorites, saveFavorites } from '../engine/favorites';

const RECENT_MAX = 8;

/** Starred and recently used materials, persisted to localStorage. */
export function useFavorites() {
  const [fav, setFav] = useState(() => loadFavorites());
  useEffect(() => saveFavorites(fav), [fav]);

  const toggleMaterial = (id: string) =>
    setFav((f) => ({ ...f, materials: f.materials.includes(id) ? f.materials.filter((x) => x !== id) : [...f.materials, id] }));
  const pushRecent = (id: string) =>
    setFav((f) => ({ ...f, recent: [id, ...f.recent.filter((x) => x !== id)].slice(0, RECENT_MAX) }));

  return { fav, toggleMaterial, pushRecent };
}
