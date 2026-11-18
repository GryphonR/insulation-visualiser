// Several projects in one browser: an index of them, and each project's body under its own key.
import { hasSavedProject, loadProject, sanitizeProject } from './house-scenarios';
import type { Project } from './house-scenarios';
import { addImportedMaterials, customMaterialsIn } from './data';

const IDX = 'insulation-visualiser.projects.v1';
/** Storage key of one project's body (another tab's save shows up as a storage event on it). */
export const projectKey = (id: string) => `insulation-visualiser.project.${id}`;

export interface ProjectInfo { id: string; name: string; updated: number; scenarios: number; rooms: number; number?: string; customer?: string; address?: string }
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
  if (i?.items.some((x) => !x.number)) { i.items.forEach((x) => { x.number ??= nextProjectNumber(); }); writeIndex(i); }
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

const SEQ = 'insulation-visualiser.project-seq.v1';
/** Next job number in this browser, e.g. P26-0007. shortcut: unique per browser only; let the server issue them once there is one. */
export function nextProjectNumber(): string {
  let n = 1;
  try { n = (Number(localStorage.getItem(SEQ)) || 0) + 1; localStorage.setItem(SEQ, String(n)); } catch { n = Date.now() % 10000; }
  return `P${String(new Date().getFullYear()).slice(2)}-${String(n).padStart(4, '0')}`;
}

function store(id: string, project: Project, activate: boolean): boolean {
  const i = readIndex() ?? { active: id, items: [] };
  const prev = i.items.find((x) => x.id === id);
  // A project keeps the number it was first stored with; one arriving with a number already in use (an import of a copy) gets a new one.
  const number = prev?.number ?? (project.number && !i.items.some((x) => x.number === project.number) ? project.number : nextProjectNumber());
  const s0 = project.scenarios[0];
  const info: ProjectInfo = { id, name: s0.house.name || 'My house', updated: Date.now(), scenarios: project.scenarios.length, rooms: s0.house.rooms.length, number, customer: project.customer, address: project.address };
  if (activate) i.active = id;
  i.items = [...i.items.filter((x) => x.id !== id), info];
  try { localStorage.setItem(projectKey(id), JSON.stringify({ ...project, number })); } catch { return false; }
  writeIndex(i);
  return true;
}

/** Store a project under `id` and make it the open one. False if the browser refused (storage full or switched off). */
export const saveProject = (id: string, project: Project): boolean => store(id, project, true);

/** Change a stored project without opening it (false if it can't be read or stored). */
export function updateStored(id: string, fn: (p: Project) => Project): boolean {
  const p = readStored(id);
  return !!p && store(id, fn(p), false);
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

/** A project as a file: carries the custom materials its layers use, so another browser can open it. */
export const projectFileText = (p: Project) =>
  JSON.stringify({ ...p, materials: customMaterialsIn(p.scenarios.flatMap((s) => s.house.buildups.flatMap((b) => b.layers))) }, null, 1);

/** Read a project file (throws on bad JSON). Its custom materials are registered first, or cleaning drops the layers made of them. */
export function parseProjectFile(text: string): Project | null {
  const p = JSON.parse(text);
  addImportedMaterials(p?.materials);
  return sanitizeProject(p);
}

export function deleteStored(id: string): void {
  const i = readIndex();
  if (!i) return;
  try { localStorage.removeItem(projectKey(id)); } catch { /* ignore */ }
  writeIndex({ ...i, items: i.items.filter((x) => x.id !== id) });
}
