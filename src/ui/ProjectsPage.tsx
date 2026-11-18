import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEMOS } from '../engine/house-demos';
import { parseProjectFile, projectFileText, readStored } from '../engine/projects';
import type { ProjectInfo } from '../engine/projects';
import { download } from '../lib/util';
import { go, href } from './route';
import { useProject } from './project';

const when = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STEPS: Array<[string, string, string]> = [
  ['buildups', 'Build-ups', 'Pick the walls, roofs and floors the house is made of, from its age or the materials library.'],
  ['plan', 'Model', 'Draw the rooms on the floor plan, or trace a drawing, and add windows and doors.'],
  ['heating', 'Heating', 'Choose the heat source, size the emitters and route the pipework.'],
  ['results', 'Results', 'Room-by-room heat loss, running costs, moisture checks and a report for the customer.'],
];

function Modal({ title, onClose, children, actions, wide }: { title: string; onClose: () => void; children: ReactNode; actions: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={wide ? 'modal' : 'modal modal-small'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

/** Edit a project's name and the customer's details. */
function DetailsModal({ info, onSave, onClose }: { info: ProjectInfo; onSave: (d: { name: string; customer: string; address: string }) => void; onClose: () => void }) {
  const [d, setD] = useState({ name: info.name, customer: info.customer ?? '', address: info.address ?? '' });
  const field = (k: keyof typeof d, label: string, multi?: boolean) => (
    <label className="hf"><span className="eyebrow">{label}</span>
      {multi
        ? <textarea className="h-text" rows={3} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
        : <input className="h-text" value={d[k]} autoFocus={k === 'name'} onChange={(e) => setD({ ...d, [k]: e.target.value })} />}
    </label>
  );
  return (
    <Modal title={`Project ${info.number ?? ''}`} onClose={onClose}
      actions={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={() => { onSave(d); onClose(); }}>Save</button></>}>
      {field('name', 'Project name')}
      {field('customer', 'Customer (optional)')}
      {field('address', 'Address (optional)', true)}
    </Modal>
  );
}

/** The screen the app opens on: what it does and how to start, beside every project saved in this browser. */
export function ProjectsPage() {
  const { projects, projectId, openProject, deleteProject, createProject, editProject } = useProject();
  const [menu, setMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'demo' } | { kind: 'details' | 'delete'; p: ProjectInfo } | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => setDialog(null);
  const exportOne = (p: ProjectInfo) => {
    const q = readStored(p.id);
    if (q) download(`${[p.number, p.name].filter(Boolean).join(' ').replace(/[^\w-]+/g, '_') || 'project'}.json`, projectFileText({ ...q, number: q.number ?? p.number }), 'application/json');
    else setMsg(`Couldn't read ${p.name} to export it.`);
  };
  const importFile = async (f: File) => {
    try {
      const p = parseProjectFile(await f.text());
      if (!p) throw new Error('it has no usable scenarios');
      createProject(p);
      setMsg(`Imported ${f.name} as a new project, now open.`);
    } catch (e) {
      setMsg(`Couldn't import ${f.name}: ${(e as Error).message}.`);
    }
  };
  const open = (id: string) => { openProject(id); go('plan'); };
  const trim = (s: string) => s.trim() || undefined;

  return (
    <div className={projects.length ? 'projects has-list' : 'projects'}>
      <section className="card panel proj-intro">
        <div className="proj-hero">
          <span className="logo big" aria-hidden="true"><span /><span /><span /></span>
          <h1>Insuliser</h1>
          <p className="tagline">It's not all about U</p>
        </div>
        <p>Model a house room by room: how its walls, roofs and floors lose heat and handle moisture, what heating it needs, and what an upgrade would save. Compare scenarios side by side, then hand the customer a report.</p>
        <div className="eyebrow">Getting started</div>
        <ol className="proj-steps">
          {STEPS.map(([to, t, d], i) => <li key={to}><span className="n">{i + 1}</span><span><b>{t}</b><span className="small muted">{d}</span></span></li>)}
        </ol>
        <div className="chips">
          <button type="button" className="btn-primary" onClick={() => go('start')}>+ New project</button>
          <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'demo' })}>Try a demo house</button>
        </div>
        <p className="small muted">New to heat loss? <a href={href('learn')}>Learn</a> walks through the ideas behind each step.</p>
      </section>

      <section className="card panel proj-list-card">
        <div className="section-head">
          <div><h2>Projects</h2><p className="muted small">Saved in this browser. Export one to keep a copy or move it to another.</p></div>
          <div className="chips">
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>Import…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
            <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'demo' })}>Demos…</button>
          </div>
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
        <ul className="proj-list">
          {projects.map((p) => {
            const now = p.id === projectId;
            return (
              <li key={p.id} className={now ? 'on' : ''}>
                <button type="button" className="proj-main" onClick={() => (now ? go('plan') : open(p.id))}>
                  <span className="proj-title"><b>{p.name}</b>{p.number && <span className="proj-no mono">{p.number}</span>}{now && <span className="proj-now">Open</span>}</span>
                  {(p.customer || p.address) && <span className="small">{[p.customer, p.address?.replace(/\s*\n\s*/g, ', ')].filter(Boolean).join(' · ')}</span>}
                  <span className="small muted">{p.rooms} room{p.rooms === 1 ? '' : 's'} · {p.scenarios} scenario{p.scenarios === 1 ? '' : 's'} · saved {when(p.updated)}</span>
                </button>
                <div className="proj-more">
                  <button type="button" className="btn-secondary icon-only" aria-label={`More for ${p.name}`} aria-haspopup="menu" aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>⋮</button>
                  {menu === p.id && (
                    <>
                      <div className="menu-scrim" onMouseDown={() => setMenu(null)} />
                      <div className="menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') setMenu(null); }}>
                        {([['Edit details…', () => setDialog({ kind: 'details', p })], ['Export file', () => exportOne(p)], ['Delete…', () => setDialog({ kind: 'delete', p })]] as const).map(([l, f]) => (
                          <button key={l} type="button" role="menuitem" autoFocus={l === 'Edit details…'} className={l === 'Delete…' ? 'danger' : ''} onClick={() => { setMenu(null); f(); }}>{l}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {projects.length === 0 && <li className="proj-empty small muted">No projects yet. Start a new one, or open a demo house to see how it works.</li>}
        </ul>
      </section>

      {dialog?.kind === 'demo' && (
        <Modal title="Open a demo house" wide onClose={close} actions={<button type="button" className="btn-secondary" onClick={close}>Cancel</button>}>
          <p className="small muted" style={{ margin: 0 }}>Each opens as a new project of its own, with its upgrade scenarios, so you can change it freely.</p>
          <div className="demo-list">
            {DEMOS.map((d) => (
              <button key={d.id} type="button" className="demo-item" onClick={() => { createProject(d.make()); close(); go('plan'); }}>
                <b>{d.label}</b><span className="small muted">{d.blurb}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog?.kind === 'details' && (
        <DetailsModal info={dialog.p} onClose={close}
          onSave={(d) => editProject(dialog.p.id, (q) => ({
            ...q, customer: trim(d.customer), address: trim(d.address),
            scenarios: q.scenarios.map((s, i) => (i === 0 ? { ...s, house: { ...s.house, name: d.name.trim() || s.house.name } } : s)),
          }))} />
      )}
      {dialog?.kind === 'delete' && (
        <Modal title="Delete project" onClose={close}
          actions={<><button type="button" className="btn-secondary" autoFocus onClick={close}>Keep it</button><button type="button" className="btn-danger" onClick={() => { deleteProject(dialog.p.id); close(); }}>Delete for good</button></>}>
          <p style={{ margin: 0 }}>Delete <b>{dialog.p.name}</b>{dialog.p.number && <> ({dialog.p.number})</>} from this browser? This can't be undone; export it first to keep a copy.</p>
        </Modal>
      )}
    </div>
  );
}
