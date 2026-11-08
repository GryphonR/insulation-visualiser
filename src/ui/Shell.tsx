import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { go, href } from './route';
import { useProject } from './project';
import { fmt } from './hform';

export const SECTIONS = [
  { n: 1, id: 'buildups', label: 'Build-ups', to: 'buildups', routes: ['buildups', 'library', 'materials', 'compare-buildups', 'wall'] },
  { n: 2, id: 'model', label: 'Model', to: 'plan', routes: ['plan', 'view3d', 'room', 'site', 'storeys', 'vent', 'floor', 'openings', 'spaces', 'checks'] },
  { n: 3, id: 'heating', label: 'Heating', to: 'heating', routes: ['heating', 'emitters', 'zones', 'pipes'] },
  { n: 4, id: 'results', label: 'Results', to: 'results', routes: ['results', 'energy', 'bills', 'moisture', 'report', 'gains'] },
] as const;

const SUBNAV: Record<string, Array<[string, string]>> = {
  model: [['plan', 'Floor plan'], ['view3d', '3D view'], ['site', 'Site & climate'], ['storeys', 'Storeys & loft'], ['vent', 'Ventilation'], ['floor', 'Floors'], ['openings', 'Windows & doors'], ['spaces', 'Unheated spaces'], ['checks', 'Checks & history']],
  heating: [['heating', 'System & flow'], ['emitters', 'Emitters'], ['zones', 'Zones & UFH'], ['pipes', 'Pipework']],
  buildups: [['buildups', 'Project'], ['materials', 'Materials'], ['library', 'Build-ups'], ['wall', 'Simulate']],
  results: [['results', 'Design day'], ['year', 'Test the house'], ['gains', 'Occupancy & heating times'], ['energy', 'Energy & cost'], ['bills', 'Check against bills'], ['moisture', 'Moisture & mould'], ['report', 'Report & export']],
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

const MANAGE = '__manage';

const Arrow = ({ flip }: { flip?: boolean }) => (
  <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M7 4 3 8l4 4M3 8h7a5 5 0 0 1 0 10" transform="translate(0 -1)" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Shell({ route, children }: { route: string; children: ReactNode }) {
  const { project, active, res, ordered, depth, setProject, undo, redo, canUndo, canRedo, saveOk } = useProject();
  const sec = sectionOf(route);
  const sub = sec ? SUBNAV[sec] : undefined;
  const issues = heatingIssues(res);
  const setActive = (id: string) => setProject((p) => ({ ...p, active: id }));
  return (
    <div className={route === 'plan' ? 'shell fill' : 'shell'}>
      <header className="top">
        <a className="brand" href={href('buildups')}>
          <span className="logo" aria-hidden="true"><span /><span /><span /></span>Insuliser
        </a>
        <div className="ctx">
          <span className="eb">Project</span>
          <a className="ctx-v" href={href('projects')} title="Switch, create or delete projects">{project.scenarios[0].house.name || 'My house'} ▾</a>
        </div>
        <label className="ctx">
          <span className="eb">Scenario</span>
          <select className="ctx-sel" value={active.id} onChange={(e) => (e.target.value === MANAGE ? go('scenarios') : setActive(e.target.value))} aria-label="Scenario being edited">
            {ordered.map((s) => <option key={s.id} value={s.id}>{'· '.repeat(depth(s))}{s.name}</option>)}
            <option value={MANAGE}>Manage scenarios…</option>
          </select>
        </label>
        <div className="ctx">
          <span className="eb">Conditions</span>
          <a className="ctx-v" href={href('site')} title="The design outside temperature, from the postcode: change it on Site & climate">Design day {fmt(res.Tout, 1)} °C ▾</a>
        </div>
        <nav className="wf" aria-label="Workflow">
          {SECTIONS.map((s) => (
            <a key={s.id} href={href(s.to)} className={sec === s.id ? 'on' : ''} aria-current={sec === s.id ? 'page' : undefined}>
              <span className="n">{s.n}</span>{s.label}
              {s.id === 'heating' && issues > 0 && <span className="warn" aria-label={`${issues} issues`}>{issues}</span>}
            </a>
          ))}
          <a href={href('learn')} className={route === 'learn' ? 'on' : ''} aria-current={route === 'learn' ? 'page' : undefined}>Learn</a>
        </nav>
        <div className="run">
          <button type="button" className="btn-secondary icon-only" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo"><Arrow /></button>
          <button type="button" className="btn-secondary icon-only" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)" aria-label="Redo"><Arrow flip /></button>
        </div>
      </header>
      {!saveOk && (
        <p className="save-fail" role="alert">
          Not saved: this browser's storage is full. <a href={href('report')}>Export the project</a> to keep your work, then delete old projects or traced plan images.
        </p>
      )}
      {sub && (
        <nav className="sub" aria-label="Section pages">
          {sub.map(([id, label], i) => (
            <Fragment key={id}>
              {sec === 'buildups' && i === 1 && <span className="sub-sep" aria-hidden="true" />}
              <a href={href(id)} className={route === id ? 'on' : ''} aria-current={route === id ? 'page' : undefined}>{label}</a>
            </Fragment>
          ))}
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
