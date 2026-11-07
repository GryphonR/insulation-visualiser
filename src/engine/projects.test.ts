import { beforeEach, describe, expect, it } from 'vitest';
import { defaultHouse } from './house-default';
import { newProject } from './house-scenarios';
import { deleteStored, listProjects, loadActive, openStored, rawStored, saveProject, storedProjectsUsing } from './projects';

// Tests run in Node: a Map stands in for the browser's storage, with a switch to make it refuse writes.
let full = false;
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { if (full) throw new Error('QuotaExceededError'); store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
});

const named = (name: string) => { const h = defaultHouse(); h.name = name; return newProject(h); };

describe('projects in browser storage', () => {
  beforeEach(() => { store.clear(); full = false; });

  it('saves, reopens and deletes projects, and moves to another when the open one is deleted', () => {
    expect(saveProject('a', named('Alpha'))).toBe(true);
    expect(saveProject('b', named('Beta'))).toBe(true);
    expect(listProjects().map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(loadActive()).toMatchObject({ id: 'b' });
    expect(loadActive().project.scenarios[0].house.name).toBe('Beta');

    expect(openStored('a')?.scenarios[0].house.name).toBe('Alpha');
    expect(loadActive().id).toBe('a');

    deleteStored('a');
    expect(listProjects().map((p) => p.id)).toEqual(['b']);
    expect(openStored('a')).toBeNull();
  });

  it('reports a refused write and leaves what was stored before untouched', () => {
    saveProject('a', named('Alpha'));
    full = true;
    expect(saveProject('a', named('Alpha, edited'))).toBe(false);
    full = false;
    expect(loadActive().project.scenarios[0].house.name).toBe('Alpha');
  });

  it('opens an unreadable project under a new id, so saving never overwrites it', () => {
    saveProject('a', named('Alpha'));
    store.set('insulation-visualiser.project.a', '{"v":1,"scenarios":[{"broken":tru');
    const l = loadActive();
    expect(l.id).not.toBe('a');
    saveProject(l.id, l.project);
    expect(rawStored('a')).toBe('{"v":1,"scenarios":[{"broken":tru');
  });

  it('finds other stored projects that mention a custom material', () => {
    const p = named('Alpha');
    p.scenarios[0].house.buildups[0].layers.push(['cm123', 50]);
    saveProject('a', p);
    saveProject('b', named('Beta'));
    expect(storedProjectsUsing('cm123', 'b')).toEqual(['Alpha']);
    expect(storedProjectsUsing('cm123', 'a')).toEqual([]);
  });
});
