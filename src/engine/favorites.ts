const STORAGE_KEY = 'insulation-visualiser.favorites.v1';

export interface Favorites {
  /** Starred material ids. */
  materials: string[];
}

const EMPTY: Favorites = { materials: [] };

export function loadFavorites(): Favorites {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      materials: Array.isArray(parsed.materials) ? parsed.materials : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveFavorites(f: Favorites): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // Private browsing, storage quota, etc. — favourites just won't persist.
  }
}
