import { Fragment, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Basis } from '../engine/house';
import { go, href } from './route';
import { useProject } from './project';
import { fmt } from './hform';
import { Account } from './Account';
import { PROJECT_LIMIT_MSG } from '../engine/limits';

export const SECTIONS = [
  { n: 1, id: 'buildups', label: 'Build-ups', to: 'buildups', routes: ['buildups', 'library', 'materials', 'compare-buildups', 'wall'] },
  { n: 2, id: 'model', label: 'House', to: 'plan', routes: ['plan', 'view3d', 'room', 'storeys', 'vent', 'floor', 'openings'] },
  { n: 3, id: 'heating', label: 'Heating', to: 'heating', routes: ['heating', 'layout', 'emitters', 'gains', 'zones', 'pipes', 'schematic'] },
  { n: 4, id: 'results', label: 'Results', to: 'results', routes: ['results', 'year', 'conditions', 'energy', 'spaces', 'bills', 'moisture', 'scenarios', 'compare', 'report'] },
] as const;

const SUBNAV: Record<string, Array<[string, string]>> = {
  model: [['plan', 'Floor plan'], ['view3d', '3D view'], ['floor', 'Floors, storeys & roofs'], ['vent', 'Ventilation'], ['openings', 'Windows & doors']],
  heating: [['heating', 'Source & flow'], ['layout', 'Layout on plan'], ['emitters', 'Emitters'], ['gains', 'Occupancy & times'], ['zones', 'Zones & UFH'], ['pipes', 'Pipework'], ['schematic', 'System diagram']],
  buildups: [['buildups', 'In this house'], ['materials', 'Materials'], ['library', 'Library'], ['wall', 'Simulate']],
  results: [['results', 'Design day'], ['year', 'Test the house'], ['energy', 'Energy & cost'], ['spaces', 'Unheated spaces'], ['bills', 'Check against bills'], ['moisture', 'Moisture & mould'], ['scenarios', 'Scenarios'], ['report', 'Report & export']],
};
/** Addresses that share a page with a sub tab: highlight that one. */
const SAME_AS: Record<string, string> = { storeys: 'floor', compare: 'scenarios', conditions: 'year' };

/** Which workflow step (and sub-nav) a route belongs to. */
export function sectionOf(route: string): string | null {
  return SECTIONS.find((s) => (s.routes as readonly string[]).includes(route))?.id ?? null;
}

/** Heating needs attention while any heated room's emitters fall short of its loss; not before the first emitter is placed. */
function heatingIssues(res: ReturnType<typeof useProject>['res'], emitters: number): number {
  return emitters ? res.heat.rooms.filter((r) => !r.has || r.cover < 0.995).length : 0;
}

const MANAGE = '__manage';

const Arrow = ({ flip }: { flip?: boolean }) => (
  <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M7 4 3 8l4 4M3 8h7a5 5 0 0 1 0 10" transform="translate(0 -1)" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Shell({ route, children }: { route: string; children: ReactNode }) {
  const { project, active, house, res, ordered, depth, setProject, undo, redo, canUndo, canRedo, saveOk, basis, setBasis, shared, viewShared, createProject, canAddProject } = useProject();
  const sec = sectionOf(route);
  const sub = sec ? SUBNAV[sec] : undefined;
  const issues = heatingIssues(res, house.heating.emitters.length);
  const here = SAME_AS[route] ?? route;
  const errors = res.checks.filter((c) => c.level === 'error').length;
  const setActive = (id: string) => setProject((p) => ({ ...p, active: id }));
  // Project list and admin aren't about one project: no project, scenario or workflow controls there.
  const inProject = route !== 'projects' && route !== 'admin';
  const head = useRef<HTMLDivElement>(null);
  // Publish the fixed header's height so sticky contents and scrolled-to elements clear it (0 on phones, where it scrolls away).
  useEffect(() => {
    const el = head.current!;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--head-h', `${getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={route === 'plan' || route === 'layout' ? 'shell fill' : route === 'schematic' ? 'shell wide' : 'shell'}>
      <div className="shell-head" ref={head}>
      <header className="top">
        <a className="brand" href={import.meta.env.BASE_URL} title="Insuliser home">
          <span className="logo" aria-hidden="true"><span /><span /><span /></span>Insuliser<span className="beta">Beta</span>
        </a>
        {inProject && <>
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
          <a className="ctx-v" href={href('settings')} title="The design outside temperature, from the postcode: change it in Project settings">Design day {fmt(res.Tout, 1)} °C ▾</a>
        </div>
        <label className="ctx" title="MCS design: the rules an installer is held to (MCS outside temperature, MIS room minimums, a thermal bridging allowance). Best estimate: your own settings and the most accurate method, for what the house will really do. Running costs always use the best estimate; the MCS report always uses MCS design.">
          <span className="eb">Basis</span>
          <select className="ctx-sel" value={basis} onChange={(e) => setBasis(e.target.value as Basis)} aria-label="Basis the figures follow">
            <option value="mcs">MCS design</option>
            <option value="best">Best estimate</option>
          </select>
        </label>
        </>}
        <nav className="wf" aria-label="Workflow">
          {inProject && SECTIONS.map((s) => (
            <a key={s.id} href={href(s.to)} className={sec === s.id ? 'on' : ''} aria-current={sec === s.id ? 'page' : undefined}>
              <span className="n">{s.n}</span>{s.label}
              {s.id === 'heating' && issues > 0 && <span className="warn" aria-label={`${issues} issues`}>{issues}</span>}
            </a>
          ))}
          {inProject && <a href={href('settings')} className={route === 'settings' ? 'on' : ''} aria-current={route === 'settings' ? 'page' : undefined}>Settings</a>}
          <a href={href('learn')} className={route === 'learn' ? 'on' : ''} aria-current={route === 'learn' ? 'page' : undefined}>Learn</a>
        </nav>
        <div className="run">
          {inProject && <button type="button" className="btn-secondary icon-only" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo"><Arrow /></button>}
          {inProject && <button type="button" className="btn-secondary icon-only" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)" aria-label="Redo"><Arrow flip /></button>}
          <Account />
        </div>
      </header>
      {shared && (
        <p className="shared-bar" role="status">
          <span>Viewing <b>{shared.name}</b>: a read-only shared snapshot. Make your own copy to change it.</span>
          <button type="button" className="btn-link" disabled={!canAddProject} title={canAddProject ? undefined : PROJECT_LIMIT_MSG} onClick={() => { createProject(project); go('plan'); }}>Make my own copy</button>
          <button type="button" className="btn-link" onClick={() => { viewShared(null); go('projects'); }}>Close</button>
        </p>
      )}
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
              <a href={href(id)} className={here === id ? 'on' : ''} aria-current={here === id ? 'page' : undefined}>{label}</a>
            </Fragment>
          ))}
          {res.checks.length > 0 && route !== 'plan' && route !== 'layout' && (
            <details className="plan-checks sub-checks">
              <summary>{'\u26a0'} {res.checks.length} model check{res.checks.length === 1 ? '' : 's'}{errors ? ` (${errors} error${errors === 1 ? '' : 's'})` : ''}</summary>
              <div>{res.checks.map((c, i) => <p key={i} className={c.level === 'error' ? 'h-err small' : 'warn small'}>{c.level === 'error' ? 'Error: ' : ''}{c.text}</p>)}</div>
            </details>
          )}
        </nav>
      )}
      </div>
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
