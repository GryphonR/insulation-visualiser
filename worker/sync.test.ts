// Two "devices" (two storages) syncing through the real API on an in-memory database.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { testDb } from './d1-shim';
import type * as Sync from '../src/engine/sync';
import type * as Projects from '../src/engine/projects';
import type * as Favorites from '../src/engine/favorites';
import { MAX_PROJECTS } from '../src/engine/limits';
import { defaultHouse } from '../src/engine/house-default';
import { newProject } from '../src/engine/house-scenarios';

const storage = (m = new Map<string, string>()) => ({
  map: m,
  /** Keys this "browser" refuses to store, as a full one does. */
  refuse: undefined as ((k: string) => boolean) | undefined,
  getItem: (k: string) => m.get(k) ?? null,
  setItem(k: string, v: string) { if (this.refuse?.(k)) throw new Error('QuotaExceededError'); m.set(k, v); },
  removeItem: (k: string) => { m.delete(k); },
  key: (i: number) => [...m.keys()][i] ?? null,
  get length() { return m.size; },
});
let A = storage(), B = storage();
const on = (d: ReturnType<typeof storage>) => { (globalThis as any).localStorage = d; };

let db: D1Database, offline = false;
(globalThis as any).window = new EventTarget();
(globalThis as any).confirm = () => true;
globalThis.fetch = (async (path: string, init?: RequestInit) => {
  if (offline) throw new TypeError('Failed to fetch');
  if (path === '/api/auth/get-session') return Response.json({ user: { id: 'u1', email: 'a@example.com' } });
  return api(new Request(`http://x${path}`, init), db, 'u1', path);
}) as typeof fetch;

let sync: typeof Sync, projects: typeof Projects, favorites: typeof Favorites;
const named = (name: string) => { const h = defaultHouse(); h.name = name; return newProject(h); };
const names = () => projects.listProjects().map((p) => p.name).sort();

describe('cloud sync between two devices', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubEnv('VITE_CLOUD', '1');
    on(A);
    sync = await import('../src/engine/sync');
    projects = await import('../src/engine/projects');
    favorites = await import('../src/engine/favorites');
    await sync.startSync();
  });
  beforeEach(() => { db = testDb(); A = storage(); B = storage(); offline = false; });

  it('uploads what a device had before signing in, and the other device pulls it', async () => {
    on(A); projects.saveProject('a', named('Alpha'));
    await sync.syncNow();
    on(B); await sync.syncNow();
    expect(names()).toEqual(['Alpha']);
    expect(sync.syncInfo().status).toBe('synced');
  });

  it('brings a newer edit across', async () => {
    on(A); projects.saveProject('a', named('Alpha')); await sync.syncNow();
    on(B); await sync.syncNow();
    on(A); projects.saveProject('a', named('Alpha v2')); await sync.syncNow();
    on(B); await sync.syncNow();
    expect(names()).toEqual(['Alpha v2']);
  });

  it('keeps both versions when two devices edit the same project', async () => {
    on(A); projects.saveProject('a', named('Alpha')); await sync.syncNow();
    on(B); await sync.syncNow();
    on(A); projects.saveProject('a', named('Edited on A')); await sync.syncNow();
    on(B); projects.saveProject('a', named('Edited on B')); await sync.syncNow();
    expect(names()).toEqual(['Edited on A (other device)', 'Edited on B']);
    on(A); await sync.syncNow();
    expect(names()).toEqual(['Edited on A (other device)', 'Edited on B']);
  });

  it('passes a deletion on', async () => {
    on(A); projects.saveProject('a', named('Alpha')); projects.saveProject('b', named('Beta')); await sync.syncNow();
    on(B); await sync.syncNow();
    on(A); projects.deleteStored('a'); await sync.syncNow();
    on(B); await sync.syncNow();
    expect(names()).toEqual(['Beta']);
  });

  it('never sends traced plan images, and keeps this device\'s own when an edit comes back', async () => {
    const img = { src: 'data:image/png;base64,AAAA' };
    const traced = (name: string) => ({ ...named(name), trace: { mode: 'image', images: { 0: img }, sat: { lat: 51, lon: 0, zoom: 19, opacity: 0.5 } } } as any);
    on(A); projects.saveProject('a', traced('Alpha')); await sync.syncNow();
    const onServer = await (await api(new Request('http://x/api/projects/a'), db, 'u1', '/api/projects/a')).json();
    expect(onServer.body).not.toContain('data:image');
    on(B); await sync.syncNow();
    expect(projects.readStored('a')?.trace?.images).toEqual({});
    projects.saveProject('a', { ...projects.readStored('a')!, customer: 'Edited on B' }); await sync.syncNow();
    on(A); await sync.syncNow();
    expect(projects.readStored('a')).toMatchObject({ customer: 'Edited on B', trace: { images: { 0: img } } });
  });

  it('makes a removal on one device stick on the other', async () => {
    const fav = (materials: string[]) => favorites.saveFavorites({ materials, buildups: [], recent: [] });
    on(A); fav(['pir', 'brick']); await sync.syncNow();
    on(B); await sync.syncNow();
    expect(favorites.loadFavorites().materials).toEqual(['pir', 'brick']);
    on(A); fav(['pir']); await sync.syncNow();
    on(B); await sync.syncNow();
    on(A); await sync.syncNow();
    expect(favorites.loadFavorites().materials).toEqual(['pir']);
    on(B); expect(favorites.loadFavorites().materials).toEqual(['pir']);
  });

  it('fetches a project again when this browser was too full to store it, and says so', async () => {
    on(A); projects.saveProject('a', named('Alpha')); await sync.syncNow();
    on(B); B.refuse = (k) => k.startsWith('insulation-visualiser.project.'); await sync.syncNow();
    expect(names()).toEqual([]);
    expect(sync.syncInfo()).toMatchObject({ status: 'error', message: expect.stringContaining('storage is full') });
    B.refuse = undefined; await sync.syncNow();
    expect(names()).toEqual(['Alpha']);
  });

  it('syncs only up to the beta project limit and keeps the rest on this device', async () => {
    on(A);
    for (let i = 0; i <= MAX_PROJECTS; i++) projects.saveProject(`p${i}`, named(`P${i}`));
    await sync.syncNow();
    expect(sync.syncInfo()).toMatchObject({ status: 'error', message: expect.stringContaining('1 project is saved on this device only') });
    expect(names()).toHaveLength(MAX_PROJECTS + 1);
    on(B); await sync.syncNow();
    expect(names()).toHaveLength(MAX_PROJECTS);
  });

  it('waits out a lost connection and sends the edit when back', async () => {
    on(A); projects.saveProject('a', named('Alpha')); await sync.syncNow();
    offline = true;
    projects.saveProject('a', named('Typed offline')); await sync.syncNow();
    expect(sync.syncInfo().status).toBe('offline');
    offline = false;
    await sync.syncNow();
    on(B); await sync.syncNow();
    expect(names()).toEqual(['Typed offline']);
  });
});

describe('mergeData', () => {
  it('unions lists by id, this device winning on the same id', async () => {
    const { mergeData } = await import('../src/engine/sync');
    expect(mergeData([{ id: 'x', v: 1 }, { id: 'y' }], [{ id: 'x', v: 2 }, { id: 'z' }])).toEqual([{ id: 'x', v: 2 }, { id: 'z' }, { id: 'y' }]);
    expect(mergeData({ materials: ['a'], recent: ['b'] }, { materials: ['c'] })).toEqual({ materials: ['c', 'a'], recent: ['b'] });
  });
});
