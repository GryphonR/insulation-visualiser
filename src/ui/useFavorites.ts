import { useEffect, useState } from 'react';
import { FAVORITES_KEY, loadFavorites, saveFavorites } from '../engine/favorites';

const RECENT_MAX = 8;

/** Starred and recently used materials, persisted to localStorage. */
export function useFavorites() {
  const [fav, setFav] = useState(() => loadFavorites());
  useEffect(() => saveFavorites(fav), [fav]);
  // Changed in another tab, or synced from another device.
  useEffect(() => {
    const f = (e: StorageEvent) => { if (e.key === FAVORITES_KEY) setFav(loadFavorites()); };
    window.addEventListener('storage', f);
    return () => window.removeEventListener('storage', f);
  }, []);

  const toggleMaterial = (id: string) =>
    setFav((f) => ({ ...f, materials: f.materials.includes(id) ? f.materials.filter((x) => x !== id) : [...f.materials, id] }));
  const toggleBuildup = (key: string) =>
    setFav((f) => ({ ...f, buildups: f.buildups.includes(key) ? f.buildups.filter((x) => x !== key) : [...f.buildups, key] }));
  const pushRecent = (id: string) =>
    setFav((f) => ({ ...f, recent: [id, ...f.recent.filter((x) => x !== id)].slice(0, RECENT_MAX) }));

  return { fav, toggleMaterial, toggleBuildup, pushRecent };
}
