// Local saves that cloud sync listens for. A plain listener list keeps the storage modules free of any sync code.
const listeners = new Set<(key: string) => void>();

export const onStored = (fn: (key: string) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Call after writing (or removing) this localStorage key. */
export const stored = (key: string) => listeners.forEach((fn) => fn(key));
