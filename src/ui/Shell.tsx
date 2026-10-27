import type { ReactNode } from 'react';
import { href } from './route';
import { useProject } from './project';
import { fmt } from './hform';

export const SECTIONS = [
  { n: 1, id: 'model', label: 'Model', to: 'plan', routes: ['plan', 'room', 'site', 'storeys', 'vent', 'floor', 'openings', 'spaces', 'checks'] },
  { n: 2, id: 'buildups', label: 'Build-ups', to: 'buildups', routes: ['buildups', 'materials', 'compare-buildups'] },
  { n: 3, id: 'heating', label: 'Heating', to: 'heating', routes: ['heating', 'emitters', 'zones', 'pipes'] },
  { n: 4, id: 'results', label: 'Results', to: 'results', routes: ['results', 'energy', 'bills', 'moisture', 'report', 'gains'] },
] as const;

const SUBNAV: Record<string, Array<[string, string]>> = {
  model: [['plan', 'Floor plan'], ['site', 'Site & climate'], ['storeys', 'Storeys & loft'], ['vent', 'Ventilation'], ['floor', 'Floors'], ['openings', 'Windows & doors'], ['spaces', 'Unheated spaces'], ['checks', 'Checks & history']],
  heating: [['heating', 'System & flow'], ['emitters', 'Emitters'], ['zones', 'Zones & UFH'], ['pipes', 'Pipework']],
  buildups: [['buildups', 'Build-ups'], ['materials', 'Materials'], ['compare-buildups', 'Compare build-ups']],
  results: [['results', 'Design day'], ['year', 'Typical year & test conditions'], ['gains', 'Occupancy & gains'], ['energy', 'Energy & cost'], ['bills', 'Check against bills'], ['moisture', 'Moisture & mould'], ['report', 'Report & export']],
  scenarios: [['scenarios', 'Scenarios'], ['compare', 'Compare A vs B']],
};

/** Which workflow step (and sub-nav) a route belongs to. */
export function sectionOf(route: string): string | null {
  if (route === 'year') return 'results';
  if (route === 'scenarios' || route === 'compare') return 'scenarios';
  return SECTIONS.find((s) => (s.routes as readonly string[]).includes(route))?.id ?? null;
}

/** Heating needs attention while any heated room's emitters fall short of its loss. */
function heatingIssues(res: ReturnType<typeof useProject>['res']): number {
  return res.heat.rooms.filter((r) => !r.has || r.cover < 0.995).length;
}

export function Shell({ route, children }: { route: string; children: ReactNode }) {
  const { project, active, house, res, ordered, depth, setProject, undo, redo, canUndo, canRedo } = useProject();
  const sec = sectionOf(route);
  const sub = sec ? SUBNAV[sec] : undefined;
  const issues = heatingIssues(res);
  const setActive = (id: string) => setProject((p) => ({ ...p, active: id }));
  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href={href('plan')}>
          <span className="logo" aria-hidden="true"><span /><span /><span /></span>Insulation Visualiser
        </a>
        <div className="ctx">
          <span className="eb">Project</span>
          <a className="ctx-v" href={href('start')} title="Start a new project">{project.scenarios[0].house.name || 'My house'} · new…</a>
        </div>
        <label className="ctx">
          <span className="eb">Scenario</span>
          <select className="ctx-sel" value={active.id} onChange={(e) => setActive(e.target.value)} aria-label="Scenario being edited">
            {ordered.map((s) => <option key={s.id} value={s.id}>{'· '.repeat(depth(s))}{s.name}</option>)}
          </select>
        </label>
        <div className="ctx">
          <span className="eb">Conditions</span>
          <a className="ctx-v" href={href('conditions')}>Design day {fmt(res.Tout, 1)} °C ▾</a>
        </div>
        <nav className="wf" aria-label="Workflow">
          {SECTIONS.map((s) => (
            <a key={s.id} href={href(s.to)} className={sec === s.id ? 'on' : ''} aria-current={sec === s.id ? 'page' : undefined}>
              <span className="n">{s.n}</span>{s.label}
              {s.id === 'heating' && issues > 0 && <span className="warn" aria-label={`${issues} issues`}>{issues}</span>}
            </a>
          ))}
        </nav>
        <div className="run">
          <button type="button" className="btn-secondary" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" className="btn-secondary" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">Redo</button>
          <a className="btn-secondary as-btn" href={href('scenarios')}>Scenarios</a>
          <a className="btn-secondary as-btn" href={href('learn')}>Learn</a>
        </div>
      </header>
      {sub && (
        <nav className="sub" aria-label="Section pages">
          {sub.map(([id, label]) => <a key={id} href={href(id)} className={route === id ? 'on' : ''} aria-current={route === id ? 'page' : undefined}>{label}</a>)}
          <span className="mono small muted sub-end">{house.name} · {fmt(res.peakW / 1000, 2)} kW · live: every edit recalculates</span>
        </nav>
      )}
      <div className="shell-body">{children}</div>
    </div>
  );
}

/** Breadcrumb for pages below the plan. */
export function Crumbs({ items, end }: { items: Array<[string, string | null]>; end?: ReactNode }) {
  return (
    <div className="crumbs">
      {items.map(([label, to], i) => (
        <span key={i}>{i > 0 && <span className="sep"> / </span>}{to ? <a href={to}>{label}</a> : <b>{label}</b>}</span>
      ))}
      {end && <span className="crumbs-end">{end}</span>}
    </div>
  );
}
