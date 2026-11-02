import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { calcHouse } from '../engine/house';
import { syncUfh } from '../engine/house-draw';
import type { House, HouseResult } from '../engine/house';
import { chain, newProject } from '../engine/house-scenarios';
import { deleteStored, hasSaved, listProjects, loadActive, newProjectId, openStored, saveProject } from '../engine/projects';
import type { ProjectInfo } from '../engine/projects';
import type { Project, Scenario } from '../engine/house-scenarios';
import type { Stackup } from '../engine/library';

interface Ctx {
  project: Project;
  setProject: (fn: Project | ((p: Project) => Project)) => void;
  active: Scenario;
  house: House;
  setHouse: (fn: (h: House) => House) => void;
  /** Same edit, written to a copy so a page can mutate freely. */
  upd: (fn: (h: House) => void) => void;
  res: HouseResult;
  results: Map<string, HouseResult>;
  ordered: Scenario[];
  depth: (s: Scenario) => number;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  customStackups: Stackup[];
  setCustomStackups: (fn: (s: Stackup[]) => Stackup[]) => void;
  /** The projects stored in this browser, newest first, and which one is open. Opening or creating one starts a fresh undo history. */
  projects: ProjectInfo[];
  projectId: string;
  openProject: (id: string) => void;
  createProject: (p: Project) => void;
  deleteProject: (id: string) => void;
}

const C = createContext<Ctx | null>(null);
export const useProject = (): Ctx => {
  const c = useContext(C);
  if (!c) throw new Error('useProject outside ProjectProvider');
  return c;
};

export function ProjectProvider({ customStackups, setCustomStackups, children }: {
  customStackups: Stackup[]; setCustomStackups: Ctx['setCustomStackups']; children: ReactNode;
}) {
  // Undo / redo over the whole project (board 1f history). Edits typed in a field are grouped by the browser's own input events.
  const [first] = useState(loadActive);
  const [projectId, setProjectId] = useState(first.id);
  const [hist, setHist] = useState<{ past: Project[]; now: Project; future: Project[] }>(() => ({ past: [], now: first.project, future: [] }));
  const project = hist.now;
  // A first visit shows the start screen, so the demo house loaded behind it isn't saved until something changes; a project just opened needn't be saved again.
  const skipSave = useRef<Project | null>(hasSaved() ? null : project);
  const [ver, bump] = useState(0);
  const setProject: Ctx['setProject'] = (fn) =>
    setHist((h) => {
      const next = typeof fn === 'function' ? fn(h.now) : fn;
      return next === h.now ? h : { past: [...h.past.slice(-49), h.now], now: next, future: [] };
    });
  const undo = () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h));
  useEffect(() => { if (project !== skipSave.current) saveProject(projectId, project); }, [project, projectId]);
  const show = (id: string, p: Project) => { skipSave.current = p; setProjectId(id); setHist({ past: [], now: p, future: [] }); bump((n) => n + 1); };
  const openProject = (id: string) => { if (id === projectId) return; const p = openStored(id); if (p) show(id, p); };
  const createProject = (p: Project) => { const id = newProjectId(); saveProject(id, p); show(id, p); };
  const deleteProject = (id: string) => {
    deleteStored(id);
    if (id !== projectId) { bump((n) => n + 1); return; }
    const next = listProjects()[0];
    const p = next && openStored(next.id);
    if (next && p) show(next.id, p); else createProject(newProject());
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!(e.ctrlKey || e.metaKey) || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const active = project.scenarios.find((s) => s.id === project.active) ?? project.scenarios[0];
  const setHouse: Ctx['setHouse'] = (fn) =>
    setProject((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === p.active ? { ...s, house: syncUfh(fn(s.house)) } : s)) }));
  const upd: Ctx['upd'] = (fn) => setHouse((prev) => { const n = structuredClone(prev); fn(n); return n; });
  const results = useMemo(() => new Map(project.scenarios.map((s) => [s.id, calcHouse(s.house)])), [project.scenarios]);
  const ordered = useMemo(() => {
    const out: Scenario[] = [];
    const walk = (parent: string | null) => project.scenarios.filter((s) => s.parent === parent).forEach((s) => { out.push(s); walk(s.id); });
    walk(null);
    return out;
  }, [project.scenarios]);
  const depth = (s: Scenario) => chain(project, s.id).length - 1;

  const projects = useMemo(() => listProjects(), [project, projectId, hist, ver]);
  const value: Ctx = {
    project, setProject, active, house: active.house, setHouse, upd, res: results.get(active.id)!, results, ordered, depth,
    undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, customStackups, setCustomStackups,
    projects, projectId, openProject, createProject, deleteProject,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
