import { useRef, useState } from 'react';
import { DEMOS } from '../engine/house-demos';
import { parseProjectFile, projectFileText, readStored } from '../engine/projects';
import { download } from '../lib/util';
import { Card } from './hform';
import { go } from './route';
import { useProject } from './project';

const when =(t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Every project saved in this browser: open, export or delete one, import a file, or start another. */
export function ProjectsPage() {
  const { projects, projectId, openProject, deleteProject, createProject } = useProject();
  const [sure, setSure] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const exportOne = (id: string, name: string) => {
    const p = readStored(id);
    if (p) download(`${name.replace(/[^\w-]+/g, '_') || 'project'}.json`, projectFileText(p), 'application/json');
    else setMsg(`Couldn't read ${name} to export it.`);
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
  return (
    <div style={{ padding: 20, maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <Card title="Projects" note="Saved in this browser. Opening one replaces what is on screen, and its own undo history starts again. Export one to keep a copy or move it to another browser."
        right={<div className="chips">
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>Import…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          <button type="button" className="btn-primary" onClick={() => go('start')}>+ New project</button>
          <select className="select" aria-label="Open demo project" value="" onChange={(e) => { const d = DEMOS.find((x) => x.id === e.target.value); if (d) { createProject(d.make()); go('plan'); } }}>
            <option value="" disabled>Open demo project…</option>
            {DEMOS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>}>
        {msg && <p className="small">{msg}</p>}
        <div className="h-table-wrap">
          <table className="h-table">
            <thead><tr><th>Project</th><th className="n">Scenarios</th><th className="n">Rooms</th><th>Last saved</th><th /></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={p.id === projectId ? 'on' : ''}>
                  <td><b>{p.name}</b>{p.id === projectId && <span className="small muted"> · open now</span>}</td>
                  <td className="n mono">{p.scenarios}</td>
                  <td className="n mono">{p.rooms}</td>
                  <td className="small">{when(p.updated)}</td>
                  <td className="h-acts" style={{ whiteSpace: 'nowrap' }}>
                    {p.id !== projectId && <button type="button" className="btn-secondary" onClick={() => { openProject(p.id); go('plan'); }}>Open</button>}{' '}
                    <button type="button" className="btn-secondary" onClick={() => exportOne(p.id, p.name)}>Export</button>{' '}
                    {sure === p.id
                      ? <><button type="button" className="btn-danger" onClick={() => { deleteProject(p.id); setSure(null); }}>Delete for good</button> <button type="button" className="btn-secondary" onClick={() => setSure(null)}>Keep</button></>
                      : <button type="button" className="btn-secondary" onClick={() => setSure(p.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
              {projects.length === 0 && <tr><td colSpan={5} className="small muted">No projects saved yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
