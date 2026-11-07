// Several projects in one browser: an index of them, and each project's body under its own key.
import { hasSavedProject, loadProject, sanitizeProject } from './house-scenarios';
import type { Project } from './house-scenarios';

const IDX = 'insulation-visualiser.projects.v1';
/** Storage key of one project's body (another tab's save shows up as a storage event on it). */
export const projectKey = (id: string) => `insulation-visualiser.project.${id}`;

export interface ProjectInfo { id: string; name: string; updated: number; scenarios: number; rooms: number }
interface Index { active: string; items: ProjectInfo[] }

const readIndex = (): Index | null => {
  try {
    const i = JSON.parse(localStorage.getItem(IDX) ?? 'null') as Index | null;
    return i && typeof i.active === 'string' && Array.isArray(i.items) ? i : null;
  } catch {
    return null;
  }
};
const writeIndex = (i: Index) => { try { localStorage.setItem(IDX, JSON.stringify(i)); } catch { /* storage full or private: nothing persists */ } };
export const readStored = (id: string): Project | null => { try { return sanitizeProject(JSON.parse(localStorage.getItem(projectKey(id)) ?? 'null')); } catch { return null; } };

export const newProjectId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** True once anything has been stored: false on a first visit, which opens the start screen. */
export const hasSaved = () => { try { return !!localStorage.getItem(IDX) || hasSavedProject(); } catch { return false; } };

/** The project that was open last. An older single-project save is picked up as the first one and moves into the index when it is next saved. */
export function loadActive(): { id: string; project: Project } {
  const i = readIndex();
  const p = i && readStored(i.active);
  if (i && p) return { id: i.active, project: p };
  // Stored but unreadable: open the fallback under a new id, so saving it can't overwrite what is there.
  const stored = !!i && (() => { try { return localStorage.getItem(projectKey(i.active)) != null; } catch { return false; } })();
  return { id: stored ? newProjectId() : i?.active ?? 'p1', project: loadProject() };
}

/** The open project exactly as stored, unchecked: for rescuing it when it can't be shown. */
export const rawStored = (id: string): string | null => { try { return localStorage.getItem(projectKey(id)); } catch { return null; } };
export const rawActive = (): string | null => { const i = readIndex(); return i && rawStored(i.active); };

export const listProjects =(): ProjectInfo[] => [...(readIndex()?.items ?? [])].sort((a, b) => b.updated - a.updated);

/** Store a project under `id` and make it the open one. False if the browser refused (storage full or switched off). */
export function saveProject(id: string, project: Project): boolean {
  const i = readIndex() ?? { active: id, items: [] };
  const s0 = project.scenarios[0];
  const info: ProjectInfo = { id, name: s0.house.name || 'My house', updated: Date.now(), scenarios: project.scenarios.length, rooms: s0.house.rooms.length };
  i.active = id;
  i.items = [...i.items.filter((x) => x.id !== id), info];
  try { localStorage.setItem(projectKey(id), JSON.stringify(project)); } catch { return false; }
  writeIndex(i);
  return true;
}

/** Open a stored project: makes it the active one and returns it (null if it can't be read). */
export function openStored(id: string): Project | null {
  const i = readIndex(), p = readStored(id);
  if (!i || !p) return null;
  writeIndex({ ...i, active: id });
  return p;
}

/** Names of the other stored projects whose saved text mentions `id` (a custom material id, unique enough to search for). */
export function storedProjectsUsing(id: string, except: string): string[] {
  try {
    return (readIndex()?.items ?? []).filter((x) => x.id !== except && (localStorage.getItem(projectKey(x.id)) ?? '').includes(`"${id}"`)).map((x) => x.name);
  } catch {
    return [];
  }
}

export function deleteStored(id: string): void {
  const i = readIndex();
  if (!i) return;
  try { localStorage.removeItem(projectKey(id)); } catch { /* ignore */ }
  writeIndex({ ...i, items: i.items.filter((x) => x.id !== id) });
}
