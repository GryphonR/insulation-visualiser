import { useEffect, useState } from 'react';
import { loadFavorites, saveFavorites } from '../engine/favorites';

/** Starred materials and categories, persisted to localStorage. */
export function useFavorites() {
  const [fav, setFav] = useState(() => loadFavorites());
  useEffect(() => saveFavorites(fav), [fav]);

  const toggleMaterial = (id: string) =>
    setFav((f) => ({ ...f, materials: f.materials.includes(id) ? f.materials.filter((x) => x !== id) : [...f.materials, id] }));

  const toggleCategory = (cat: string) =>
    setFav((f) => ({ ...f, categories: f.categories.includes(cat) ? f.categories.filter((x) => x !== cat) : [...f.categories, cat] }));

  return { fav, toggleMaterial, toggleCategory };
}
