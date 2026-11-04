// Several projects in one browser: an index of them, and each project's body under its own key.
import { hasSavedProject, loadProject, sanitizeProject } from './house-scenarios';
import type { Project } from './house-scenarios';

const IDX = 'insulation-visualiser.projects.v1';
const bodyKey = (id: string) => `insulation-visualiser.project.${id}`;

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
const readBody = (id: string): Project | null => { try { return sanitizeProject(JSON.parse(localStorage.getItem(bodyKey(id)) ?? 'null')); } catch { return null; } };

export const newProjectId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** True once anything has been stored: false on a first visit, which opens the start screen. */
export const hasSaved = () => { try { return !!localStorage.getItem(IDX) || hasSavedProject(); } catch { return false; } };

/** The project that was open last. An older single-project save is picked up as the first one and moves into the index when it is next saved. */
export function loadActive(): { id: string; project: Project } {
  const i = readIndex();
  const p = i && readBody(i.active);
  return i && p ? { id: i.active, project: p } : { id: i?.active ?? 'p1', project: loadProject() };
}

/** The open project exactly as stored, unchecked: for rescuing it when it can't be shown. */
export const rawActive = (): string | null => { try { const i = readIndex(); return i && localStorage.getItem(bodyKey(i.active)); } catch { return null; } };

export const listProjects =(): ProjectInfo[] => [...(readIndex()?.items ?? [])].sort((a, b) => b.updated - a.updated);

/** Store a project under `id` and make it the open one. False if the browser refused (storage full or switched off). */
export function saveProject(id: string, project: Project): boolean {
  const i = readIndex() ?? { active: id, items: [] };
  const s0 = project.scenarios[0];
  const info: ProjectInfo = { id, name: s0.house.name || 'My house', updated: Date.now(), scenarios: project.scenarios.length, rooms: s0.house.rooms.length };
  i.active = id;
  i.items = [...i.items.filter((x) => x.id !== id), info];
  try { localStorage.setItem(bodyKey(id), JSON.stringify(project)); } catch { return false; }
  writeIndex(i);
  return true;
}

/** Open a stored project: makes it the active one and returns it (null if it can't be read). */
export function openStored(id: string): Project | null {
  const i = readIndex(), p = readBody(id);
  if (!i || !p) return null;
  writeIndex({ ...i, active: id });
  return p;
}

export function deleteStored(id: string): void {
  const i = readIndex();
  if (!i) return;
  try { localStorage.removeItem(bodyKey(id)); } catch { /* ignore */ }
  writeIndex({ ...i, items: i.items.filter((x) => x.id !== id) });
}
