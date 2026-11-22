// Cloud sync for a signed-in user (cloud build only). localStorage stays the working copy: each local save is pushed in the
// background, and on start, sign-in and reconnect the server's newer copies are pulled in. Every push names the rev it was
// based on; when the server has moved on, both versions are kept, so an edit on one device never silently erases another's.
import { onStored } from './stored';
import { deleteStored, listProjects, newProjectId, projectKey, putStored, rawStored, readStored, storedProjectsUsing } from './projects';
import { sanitizeProject } from './house-scenarios';
import { addImportedMaterials, customMaterials, CUSTOM_MATERIALS_KEY, deleteCustomMaterial, saveCustomMaterial } from './data';
import type { Material } from './data';
import { LIBRARY_KEY, loadCustomStackups } from './library';
import { MAX_PROJECTS, MAX_SCENARIOS } from './limits';
import { FAVORITES_KEY } from './favorites';

export const CLOUD = !!import.meta.env?.VITE_CLOUD;

const DATA: Record<string, string> = { materials: CUSTOM_MATERIALS_KEY, library: LIBRARY_KEY, favorites: FAVORITES_KEY };
const STATE_KEY = 'insulation-visualiser.sync.v1';
const PROJECT_PREFIX = projectKey('');

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';
export interface SyncInfo { status: SyncStatus; email?: string; message?: string }

/** `user`: who the local copies were last synced for. `revs`: server rev each item was last in step with. `dirty`: items changed here since. */
interface State { user?: string; revs: Record<string, number>; dirty: string[] }

interface Row { id: string; rev: number; updated: number; deleted: number; body?: string }

// ---------- state ----------

const readState = (): State => {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (s && typeof s.revs === 'object' && Array.isArray(s.dirty)) return s;
  } catch { /* fall through */ }
  return { revs: {}, dirty: [] };
};
const writeState = (s: State) => { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* storage full: re-synced next start */ } };
const markDirty = (path: string) => { const s = readState(); if (!s.dirty.includes(path)) { s.dirty.push(path); writeState(s); } };
const settle = (path: string, rev: number) => { const s = readState(); s.revs[path] = rev; s.dirty = s.dirty.filter((p) => p !== path); writeState(s); };

let info: SyncInfo = { status: CLOUD ? 'signed-out' : 'off' };
const watchers = new Set<(i: SyncInfo) => void>();
const setInfo = (i: Partial<SyncInfo>) => { info = { ...info, ...i }; watchers.forEach((w) => w(info)); };
export const syncInfo = () => info;
export const watchSync = (fn: (i: SyncInfo) => void) => { watchers.add(fn); return () => { watchers.delete(fn); }; };

// Writes made by sync itself aren't local edits: they mustn't be pushed straight back.
let muted = false;
const quietly = <T>(fn: () => T): T => { muted = true; try { return fn(); } finally { muted = false; } };

/** Tell the app a key changed under it (the same event another tab's save raises), so open views reload it. */
const announce = (key: string) => { try { window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) })); } catch { /* not in a browser */ } };

// ---------- server ----------

const FULL = "This browser's storage is full, so a project from the cloud couldn't be saved here. Delete old projects or traced plan images.";
class Offline extends Error {}
class SignedOut extends Error {}

async function call(method: string, path: string, body?: string, rev?: number): Promise<{ status: number; data: any }> {
  let r: Response;
  try {
    r = await fetch(path, {
      method, body, credentials: 'same-origin',
      headers: { ...(body != null ? { 'Content-Type': 'application/json' } : {}), ...(rev != null ? { 'If-Match': String(rev) } : {}) },
    });
  } catch {
    throw new Offline();
  }
  if (r.status === 401) throw new SignedOut();
  return { status: r.status, data: await r.json().catch(() => null) };
}

// ---------- merging ----------

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Settings from two devices, combined: lists of {id} items and of plain values are unioned (this device's copy wins on the same id). */
export function mergeData(server: unknown, local: unknown): unknown {
  if (local === undefined || local === null) return server;
  if (Array.isArray(server) && Array.isArray(local)) {
    const key = (x: unknown) => (isObj(x) && typeof x.id === 'string' ? `#${x.id}` : JSON.stringify(x));
    const seen = new Set(local.map(key));
    return [...local, ...server.filter((x) => !seen.has(key(x)))];
  }
  if (isObj(server) && isObj(local)) {
    const out: Record<string, unknown> = { ...server };
    for (const k of Object.keys(local)) out[k] = k in server ? mergeData(server[k], local[k]) : local[k];
    return out;
  }
  return local;
}

const parse = (t: string | null | undefined): unknown => { try { return t ? JSON.parse(t) : undefined; } catch { return undefined; } };

/** Custom materials become the server's list. One removed there but still used here is kept (true: push it back). */
function replaceMaterials(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  addImportedMaterials(list); // new ones
  const there = new Map((list as Material[]).map((m) => [m.id, m]));
  let kept = false;
  for (const m of customMaterials()) {
    const s = there.get(m.id);
    if (s) { if (JSON.stringify({ ...s, cat: 'custom' }) !== JSON.stringify(m)) saveCustomMaterial(s); continue; }
    const used = storedProjectsUsing(m.id, '').length > 0 || loadCustomStackups().some((b) => b.layers.some(([id]) => id === m.id));
    if (used) kept = true; else deleteCustomMaterial(m.id);
  }
  return kept;
}

/**
 * Put a settings body from the server into local storage. Unchanged here: the server's copy replaces it, so a removal
 * made on another device sticks. Changed on both: the two are merged. True if the result should go back up.
 */
function applyData(key: string, serverText: string, merge: boolean): boolean {
  const lsKey = DATA[key];
  if (!merge) {
    let kept = false;
    quietly(() => {
      if (key === 'materials') kept = replaceMaterials(parse(serverText));
      else localStorage.setItem(lsKey, serverText);
    });
    announce(lsKey);
    return kept;
  }
  const merged = mergeData(parse(serverText), parse(localStorage.getItem(lsKey)));
  if (merged === undefined) return false;
  quietly(() => {
    // Custom materials also live in memory: register the new ones there (this persists them too).
    if (key === 'materials') addImportedMaterials(merged);
    else localStorage.setItem(lsKey, JSON.stringify(merged));
  });
  announce(lsKey);
  return (localStorage.getItem(lsKey) ?? '') !== serverText;
}

/** Put a project from the server into local storage under `id`. False if it isn't a usable project. */
// shortcut: traced plan images never leave the device (they're big, and D1 rows cap at 2 MB); sync them via R2 when wanted.
/** A stored project's text as it goes to the server: without its traced plan images. */
export function withoutImages(text: string | null): string | null {
  const p = parse(text) as { trace?: { images?: unknown } } | undefined;
  if (!p?.trace?.images) return text;
  return JSON.stringify({ ...p, trace: { ...p.trace, images: {} } });
}

/** False only if this browser's storage refused it (full): it is fetched again next time. One that isn't usable is skipped. */
function applyProject(id: string, body: string): boolean {
  let p = sanitizeProject(parse(body));
  if (!p) return true;
  // The server never has the images: keep this device's own.
  const here = readStored(id)?.trace;
  if (here) p = { ...p, trace: p.trace ? { ...p.trace, images: here.images } : here };
  if (!quietly(() => putStored(id, p))) return false;
  announce(projectKey(id));
  return true;
}

/** Both devices changed this project: the server's version becomes a separate project here (and is pushed as one). */
function keepServerCopy(body: string) {
  const p = sanitizeProject(parse(body));
  if (!p) return;
  const h = p.scenarios[0].house;
  p.scenarios[0] = { ...p.scenarios[0], house: { ...h, name: `${h.name || 'My house'} (other device)` } };
  putStored(newProjectId(), { ...p, number: undefined });
  announce(PROJECT_PREFIX);
}

// ---------- pull ----------

/** Pull everything newer from the server. True if some project couldn't be stored here (storage full). */
async function pull(): Promise<boolean> {
  const s = readState();
  let unsaved = false;
  const [projects, data] = await Promise.all([call('GET', '/api/projects'), call('GET', '/api/data')]);
  const rows = (projects.data ?? []) as Row[];
  const local = new Set(listProjects().map((p) => p.id));
  for (const r of rows) {
    const path = `projects/${r.id}`;
    if (r.rev <= (s.revs[path] ?? 0)) continue;
    if (s.dirty.includes(path) && local.has(r.id)) continue; // both changed: the push that follows sorts it out
    if (r.deleted) { quietly(() => deleteStored(r.id)); announce(PROJECT_PREFIX); settle(path, r.rev); continue; }
    const full = await call('GET', `/api/projects/${r.id}`);
    if (full.status !== 200) continue;
    if (applyProject(r.id, full.data.body)) settle(path, r.rev); else unsaved = true;
  }
  // Projects the server has never seen (made signed out, or before the first sign-in) go up.
  const known = new Set(rows.map((r) => r.id));
  for (const id of local) if (!known.has(id)) markDirty(`projects/${id}`);

  const drows = (data.data ?? []) as Row[];
  for (const key of Object.keys(DATA)) {
    const path = `data/${key}`, r = drows.find((x) => x.id === key);
    if (!r) { if (localStorage.getItem(DATA[key]) != null) markDirty(path); continue; }
    if (r.rev <= (s.revs[path] ?? 0)) continue;
    const full = await call('GET', `/api/data/${key}`);
    if (full.status !== 200) continue;
    const differs = applyData(key, full.data.body, s.dirty.includes(path));
    settle(path, r.rev);
    if (differs) markDirty(path);
  }
  return unsaved;
}

// ---------- push ----------

/** Push one item; 'limit' when the server refused it for the beta limits (it stays on this device, still marked changed). */
async function pushOne(path: string): Promise<'limit' | void> {
  const [kind, id] = path.split('/') as ['projects' | 'data', string];
  const s = readState();
  const body = kind === 'projects' ? withoutImages(rawStored(id)) : localStorage.getItem(DATA[id] ?? '');
  if (kind === 'data' && !DATA[id]) { settle(path, 0); return; }
  if (kind === 'data' && body == null) { settle(path, s.revs[path] ?? 0); return; }
  const send = (rev: number) => (body == null ? call('DELETE', `/api/projects/${id}`, undefined, rev) : call('PUT', `/api/${kind}/${id}`, body, rev));

  let r = await send(s.revs[path] ?? 0);
  if (r.status === 409) {
    const cur = r.data as Row | null;
    if (kind === 'data') {
      if (cur?.body) applyData(id, cur.body, true);
    } else if (cur && !cur.deleted && cur.body) {
      // Deleted here but edited there: keep the edited one. Edited in both: keep both.
      if (body == null) { if (applyProject(id, cur.body)) settle(path, cur.rev); else throw new Error(FULL); return; }
      keepServerCopy(cur.body);
    }
    const again = kind === 'data' ? localStorage.getItem(DATA[id]) : body;
    r = again == null ? await call('DELETE', `/api/projects/${id}`, undefined, cur?.rev ?? 0) : await call('PUT', `/api/${kind}/${id}`, again, cur?.rev ?? 0);
  }
  if (r.status === 200) { settle(path, r.data.rev); return; }
  if (r.status === 403 && r.data?.error === 'limit') return 'limit';
  if (r.status === 413) throw new Error('A project is too large to sync. It is still saved on this device.');
  throw new Error(`Sync failed (${r.status}).`);
}

let running: Promise<void> | null = null, again = false;

/** Pull, then push everything changed here. Safe to call often: overlapping calls are folded into one more pass. */
export function syncNow(): Promise<void> {
  if (!CLOUD || !info.email) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    setInfo({ status: 'syncing', message: undefined });
    try {
      const over = new Set<string>();
      let unsaved = false;
      do {
        again = false;
        unsaved = await pull();
        // Each push settles its item, throws or is set aside as over the limit, so this ends; pushes may add items (a kept copy), which go up in the same pass.
        for (let path; (path = readState().dirty.find((p) => !over.has(p))); ) if (await pushOne(path) === 'limit') over.add(path);
      } while (again);
      setInfo(unsaved ? { status: 'error', message: FULL } : over.size
        ? { status: 'error', message: `The open beta syncs up to ${MAX_PROJECTS} projects with ${MAX_SCENARIOS} scenarios each. ${over.size} ${over.size === 1 ? 'project is' : 'projects are'} saved on this device only.` }
        : { status: 'synced' });
    } catch (e) {
      if (e instanceof Offline) setInfo({ status: 'offline' });
      else if (e instanceof SignedOut) setInfo({ status: 'signed-out', email: undefined });
      else setInfo({ status: 'error', message: (e as Error).message });
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
const soon = () => { clearTimeout(timer); timer = setTimeout(syncNow, 2000); };

const pathOf = (key: string): string | null => {
  if (key.startsWith(PROJECT_PREFIX)) return `projects/${key.slice(PROJECT_PREFIX.length)}`;
  const d = Object.keys(DATA).find((k) => DATA[k] === key);
  return d ? `data/${d}` : null;
};

// ---------- accounts ----------

/** Every key this app keeps on the device (for "sign out and remove from this device"). */
const appKeys = () => {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('insulation-visualiser.')) out.push(k); }
  return out;
};

/** Sign-in found (or changed). Local copies made for a different account are only uploaded if the user says so. */
async function signedIn(user: { id: string; email: string }) {
  const s = readState();
  if (s.user && s.user !== user.id) {
    const upload = confirm(`The projects on this device were synced with a different account. Copy them into ${user.email} too?\n\nCancel removes them from this device instead (they stay in the other account, but changes not yet synced are lost).`);
    if (!upload) appKeys().forEach((k) => localStorage.removeItem(k));
    writeState({ user: user.id, revs: {}, dirty: [] });
    if (!upload) { location.reload(); return; }
  } else if (!s.user) writeState({ ...s, user: user.id });
  setInfo({ status: 'syncing', email: user.email });
  await syncNow();
}

let started = false;
/** Start syncing if this is the cloud build and someone is signed in. */
export async function startSync() {
  if (!CLOUD || started) return;
  started = true;
  onStored((key) => {
    if (muted) return;
    const path = pathOf(key);
    if (path) { markDirty(path); soon(); }
  });
  window.addEventListener('online', () => void syncNow());
  try {
    const r = await fetch('/api/auth/get-session', { credentials: 'same-origin' });
    const s = r.ok ? await r.json() : null;
    if (s?.user) await signedIn(s.user);
    else setInfo({ status: 'signed-out' });
  } catch {
    setInfo({ status: 'offline' });
  }
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Email a sign-in link. Resolves to an error message, or null when sent. */
export async function sendSignInLink(email: string): Promise<string | null> {
  try {
    const r = await post('/api/auth/sign-in/magic-link', { email, callbackURL: location.pathname });
    return r.ok ? null : ((await r.json().catch(() => null))?.message ?? `Couldn't send the link (${r.status}).`);
  } catch {
    return 'No connection.';
  }
}

export async function signInWithGoogle(): Promise<string | null> {
  try {
    const r = await post('/api/auth/sign-in/social', { provider: 'google', callbackURL: location.pathname });
    const d = await r.json().catch(() => null);
    if (r.ok && d?.url) { location.href = d.url; return null; }
    return d?.message ?? `Couldn't start Google sign-in (${r.status}).`;
  } catch {
    return 'No connection.';
  }
}

/** Sign out. `forget` also removes this app's data from the device (for a shared computer), after a last push. */
export async function signOut(forget: boolean) {
  if (forget) await syncNow();
  if (forget && readState().dirty.length && !confirm('Some changes haven\'t reached the cloud yet. Remove them from this device anyway?')) return;
  await post('/api/auth/sign-out', {}).catch(() => null);
  if (forget) { appKeys().forEach((k) => localStorage.removeItem(k)); location.reload(); return; }
  setInfo({ status: 'signed-out', email: undefined });
}

/** Delete the account and everything stored with it on the server. What is on this device stays. */
export async function deleteAccount(): Promise<boolean> {
  const r = await fetch('/api/account', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
  if (!r?.ok) return false;
  writeState({ revs: {}, dirty: [] });
  setInfo({ status: 'signed-out', email: undefined });
  return true;
}
