import { useState } from 'react';
import { Card } from './hform';
import { go } from './route';
import { useProject } from './project';

const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Every project saved in this browser: open one, delete one, or start another. */
export function ProjectsPage() {
  const { projects, projectId, openProject, deleteProject } = useProject();
  const [sure, setSure] = useState<string | null>(null);
  return (
    <div style={{ padding: 20, maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <Card title="Projects" note="Saved in this browser. Opening one replaces what is on screen, and its own undo history starts again."
        right={<button type="button" className="btn-primary" onClick={() => go('start')}>+ New project</button>}>
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
