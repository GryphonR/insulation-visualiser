import type { SwapMode, ValUnit } from './swap';

const STORAGE_KEY = 'insulation-visualiser.swap-prefs.v1';
const MODES: SwapMode[] = ['same-t', 'same-r', 'custom-t', 'custom-val'];

/** The user's last choice in the swap dialog, offered again next time. */
export interface SwapPrefs {
  mode: SwapMode;
  unit: ValUnit;
}

export const DEFAULT_SWAP_PREFS: SwapPrefs = { mode: 'same-r', unit: 'R' };

export function loadSwapPrefs(): SwapPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return { mode: MODES.includes(p?.mode) ? p.mode : DEFAULT_SWAP_PREFS.mode, unit: p?.unit === 'U' ? 'U' : 'R' };
  } catch {
    return { ...DEFAULT_SWAP_PREFS };
  }
}

export function saveSwapPrefs(p: SwapPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: the choice just isn't remembered.
  }
}
