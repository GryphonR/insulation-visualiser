import { Component } from 'react';
import type { ReactNode } from 'react';
import { newProject } from '../engine/house-scenarios';
import { newProjectId, rawActive, saveProject } from '../engine/projects';
import { download } from '../lib/util';

/** If the app crashes (say, on a saved project an older version wrote), offer the project as a file and a way back in. */
export class ErrorScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const raw = rawActive();
    const fresh = () => { saveProject(newProjectId(), newProject()); location.hash = ''; location.reload(); };
    return (
      <main className="card panel" style={{ maxWidth: 640, margin: '48px auto' }} role="alert">
        <h1>Something went wrong</h1>
        <p>Insuliser hit an error it couldn't recover from: <code>{error.message}</code></p>
        <p>Your project is still stored in this browser. Download it to keep a copy, then start a fresh project; the old one stays in your project list.</p>
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {raw && <button type="button" className="btn-secondary" onClick={() => download('house-project.json', raw, 'application/json')}>Download project (JSON)</button>}
          <button type="button" className="btn-secondary" onClick={() => location.reload()}>Try again</button>
          <button type="button" className="btn-primary" onClick={fresh}>Start a fresh project</button>
        </p>
      </main>
    );
  }
}
