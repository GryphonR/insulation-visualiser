import { stored } from './stored';

export const FAVORITES_KEY = 'insulation-visualiser.favorites.v1';
const STORAGE_KEY = FAVORITES_KEY;

export interface Favorites {
  /** Starred material ids. */
  materials: string[];
  /** Starred build-up presets in the add-to-project picker. */
  buildups: string[];
  /** Recently picked material ids, newest first. */
  recent: string[];
}

const EMPTY: Favorites = { materials: [], buildups: [], recent: [] };

export function loadFavorites(): Favorites {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      materials: Array.isArray(parsed.materials) ? parsed.materials : [],
      buildups: Array.isArray(parsed.buildups) ? parsed.buildups : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveFavorites(f: Favorites): void {
  try {
    const text = JSON.stringify(f);
    if (localStorage.getItem(STORAGE_KEY) === text) return; // unchanged: nothing to sync
    localStorage.setItem(STORAGE_KEY, text);
    stored(STORAGE_KEY);
  } catch {
    // Private browsing, storage quota, etc. — favourites just won't persist.
  }
}
