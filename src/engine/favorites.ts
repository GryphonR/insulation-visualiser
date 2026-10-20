const STORAGE_KEY = 'insulation-visualiser.favorites.v1';

export interface Favorites {
  /** Starred material ids. */
  materials: string[];
  /** Recently picked material ids, newest first. */
  recent: string[];
}

const EMPTY: Favorites = { materials: [], recent: [] };

export function loadFavorites(): Favorites {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      materials: Array.isArray(parsed.materials) ? parsed.materials : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
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
