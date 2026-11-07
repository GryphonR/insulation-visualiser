import { describe, expect, it } from 'vitest';
import { MAT, addImportedMaterials } from './data';
import { defaultHouse } from './house-default';
import { describe as describeChange, diff, newProject, sanitizeProject } from './house-scenarios';

/** A project as an older version of the app saved it: no heat source settings, tracing inside each house. */
function oldSave() {
  const p = JSON.parse(JSON.stringify(newProject(defaultHouse())));
  const h = p.scenarios[0].house;
  for (const k of ['source', 'fuel', 'gasStanding', 'hpFactor', 'co2', 'oilP', 'lpgP']) delete h.hp[k];
  h.storeys[0].below = 2; // a basement, so the ground floor is storey 1
  h.trace = { mode: 'image', images: { 1: { src: 'data:x', x: 0, y: 0, w: 10, opacity: 0.5 } }, sat: { lat: 0, lon: 0, zoom: 19, opacity: 0.8 } };
  p.scenarios.push({ id: 's2', name: 'Orphan', kind: 'plan', parent: 'gone', house: JSON.parse(JSON.stringify(h)) });
  return p;
}

describe('loading old and imported projects', () => {
  it('fills in new settings, reattaches orphans, drops unknown materials and moves tracing to the project by level', () => {
    const p = oldSave();
    p.scenarios[0].house.buildups[0].layers.push(['no-such-material', 50]);
    const q = sanitizeProject(p)!;
    const h = q.scenarios[0].house;
    expect(h.hp).toMatchObject({ source: 'ashp', fuel: 'gas', gasStanding: false, hpFactor: 0.45 });
    expect(h.hp.co2.elec).toBeGreaterThan(0);
    expect(q.scenarios[1].parent).toBe('base');
    expect(h.buildups[0].layers.some(([m]) => m === 'no-such-material')).toBe(false);
    expect(Object.keys(q.trace!.images)).toEqual(['0']);
    expect(q.scenarios.every((s) => !('trace' in s.house))).toBe(true);
  });

  it('keeps layers made of custom materials the imported file carries', () => {
    const p = oldSave();
    p.scenarios[0].house.buildups[0].layers.push(['cm-import-test', 50]);
    addImportedMaterials([{ id: 'cm-import-test', name: 'Imported fibre', k: 0.04, rho: 50, cp: 2100, t: 100, min: 10, max: 300, step: 5, col: '#ccc' }]);
    expect(MAT['cm-import-test']).toBeDefined();
    expect(sanitizeProject(p)!.scenarios[0].house.buildups[0].layers.some(([m]) => m === 'cm-import-test')).toBe(true);
  });

  it('names a carbon factor change plainly', () => {
    const a = defaultHouse(), b = structuredClone(a);
    b.hp.co2.gas = 0.183;
    const [c] = diff(a, b);
    expect(describeChange(c, a, b).what).toBe('Carbon factor, Mains gas, kgCO₂/kWh');
  });
});
