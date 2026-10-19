import { useMemo, useState } from 'react';
import { BUILTIN_STACKUPS, layersFromTuples } from '../engine/library';
import type { Stackup } from '../engine/library';
import { runScenario } from '../engine/scenario';
import type { Scenario } from '../engine/scenario';
import { FRAMES_PER_HOUR } from '../engine/simulate';
import { clamp, pad2, sgn } from '../lib/util';
import { buildChart } from './charts';
import { EnvironmentPanel } from './EnvironmentPanel';
import { LineChart } from './LineChart';
import { StackupModal } from './StackupModal';
import type { StackupDraft } from './StackupModal';
import { WallSection } from './WallSection';
import { useClock } from './useClock';

const COLORS = ['#0b63b5', '#c75b00', '#2d7a4d', '#a23b72'];
const MAX_COMPARE = 4;

const DEFAULT_ENV: Scenario = {
  layers: [],
  loc: 'bir', month: 6, weather: 'typical', orient: 'W', colour: 'mid',
  heat: 'fixed', tin: 21, comfort: 21, setback: 16, on1: 6, off1: 9, on2: 17, off2: 22,
  floor: 16, elA: 12, glA: 2, rest: 20, ach: 3, gains: 150, glaz: 'std', mass: 'med',
};

const DEFAULT_SELECTION = ['preset:cavity_old', 'preset:cavity_new'];

interface Props {
  customStackups: Stackup[];
  setCustomStackups: (updater: (prev: Stackup[]) => Stackup[]) => void;
}

export function ComparePage({ customStackups, setCustomStackups }: Props) {
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  const [selected, setSelected] = useState<string[]>(() => {
    const ids = new Set(library.map((s) => s.id));
    const def = DEFAULT_SELECTION.filter((id) => ids.has(id));
    return def.length ? def : library.slice(0, 2).map((s) => s.id);
  });
  const [env, setEnv] = useState<Scenario>(DEFAULT_ENV);
  const [modal, setModal] = useState<null | { draft?: StackupDraft }>(null);
  const [confirmDelete, setConfirmDelete] = useState<Stackup | null>(null);
  const { frame, scrub } = useClock();

  const set = (patch: Partial<Scenario>) => setEnv((s) => ({ ...s, ...patch }));

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_COMPARE ? [...s, id] : s));
  };

  // A throwaway single-layer run, only to drive the "set the day" summary text
  // (solar geometry and outdoor temperatures), independent of any compared wall.
  const envProbe = useMemo(
    () => runScenario({ ...env, layers: layersFromTuples([['brick', 100]]) }),
    [env],
  );

  const results = useMemo(
    () =>
      selected
        .map((id) => library.find((s) => s.id === id))
        .filter((s): s is Stackup => !!s)
        .map((s, i) => ({
          stackup: s,
          color: COLORS[i % COLORS.length],
          res: runScenario({ ...env, layers: layersFromTuples(s.layers) }),
        })),
    [selected, env, library],
  );

  const f = clamp(frame, 0, 143);

  const tempChart = useMemo(
    () =>
      results.length
        ? buildChart({
            title: 'Inner face temperature',
            sub: 'Compare how each build-up tempers the day',
            alt: 'Line chart comparing inner face temperature across build-ups over 24 hours',
            series: results.map((r) => ({ name: r.stackup.name, arr: r.res.sim.fr.tsIn, col: r.color, sw: 2.5 })),
            note: 'A flatter, more delayed line means more effective thermal mass and insulation together.',
          })
        : null,
    [results],
  );

  const flowChart = useMemo(
    () =>
      results.length
        ? buildChart({
            title: 'Heat flow into the room',
            sub: 'W/m². Above zero the wall is warming the room.',
            alt: 'Line chart comparing heat flow into the room across build-ups over 24 hours',
            zero: true,
            series: results.map((r) => ({ name: r.stackup.name, arr: r.res.sim.fr.q, col: r.color, sw: 2.5 })),
            note: 'Smaller peaks and a flatter line mean the room feels less of the outside swing.',
          })
        : null,
    [results],
  );

  const saveStackup = (draft: StackupDraft) => {
    if (draft.id) {
      setCustomStackups((prev) => prev.map((s) => (s.id === draft.id ? { ...s, name: draft.name, layers: draft.layers, orient: draft.orient } : s)));
    } else {
      const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setCustomStackups((prev) => [...prev, { id, name: draft.name, layers: draft.layers, orient: draft.orient }]);
      setSelected((prev) => (prev.length < MAX_COMPARE ? [...prev, id] : prev));
    }
    setModal(null);
  };

  const doDelete = (s: Stackup) => {
    setCustomStackups((prev) => prev.filter((x) => x.id !== s.id));
    setSelected((prev) => prev.filter((id) => id !== s.id));
    setConfirmDelete(null);
  };

  return (
    <div className="cols">
      <aside className="side">
        <EnvironmentPanel sc={env} res={envProbe} set={set} />
      </aside>

      <main className="main">
        <section className="card panel">
          <div className="row-between">
            <h2><span className="step">1</span>Choose build-ups to compare</h2>
            <button type="button" className="btn-link" onClick={() => setModal({})}>+ New build-up</button>
          </div>
          <p className="small muted">Pick up to {MAX_COMPARE}. They all run under the same day, set on the left.</p>
          <div className="lib-list">
            {library.map((s) => {
              const idx = selected.indexOf(s.id);
              const on = idx >= 0;
              const color = on ? COLORS[idx % COLORS.length] : undefined;
              return (
                <div key={s.id} className="lib-row">
                  <button
                    type="button"
                    className={on ? 'chip on' : 'chip'}
                    aria-pressed={on}
                    disabled={!on && selected.length >= MAX_COMPARE}
                    style={on ? { background: color, borderColor: color } : undefined}
                    onClick={() => toggle(s.id)}
                  >
                    {s.name}{s.orient === 'roof' ? ' (roof)' : ''}
                  </button>
                  <button
                    type="button"
                    className="icon-btn small"
                    aria-label={s.builtin ? `Customize a copy of ${s.name}` : `Edit ${s.name}`}
                    onClick={() => setModal({ draft: { id: s.builtin ? undefined : s.id, name: s.builtin ? `${s.name} (copy)` : s.name, layers: s.layers, orient: s.orient } })}
                  >
                    <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5 13.5 5 5 13.5 2 14l.5-3L11 2.5Z" fill="none" stroke="#14212b" strokeWidth={1.4} strokeLinejoin="round" /></svg>
                  </button>
                  {!s.builtin && (
                    <button type="button" className="icon-btn small" aria-label={`Delete ${s.name}`} onClick={() => setConfirmDelete(s)}>
                      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" fill="none" stroke="#a02828" strokeWidth={1.6} strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {results.length === 0 ? (
          <section className="card panel"><p className="muted">Select at least one build-up above to see a comparison.</p></section>
        ) : (
          <>
            <section className="card panel">
              <div className="section-head">
                <div>
                  <h2>Heat moving through each wall</h2>
                  <p className="muted small">Every build-up runs the same day, side by side. Drag the clock to compare them at any hour.</p>
                </div>
                <div className="player">
                  <input type="range" aria-label="Time of day" min={0} max={143} step={1} value={f} onChange={(e) => scrub(Number(e.target.value))} />
                  <span className="mono clock">{pad2(Math.floor(f / FRAMES_PER_HOUR))}:{pad2((f % FRAMES_PER_HOUR) * 10)}</span>
                </div>
              </div>

              <div className="compare-grid">
                {results.map((r) => (
                  <div key={r.stackup.id} className="compare-card">
                    <div className="compare-card-head">
                      <span className="dot" style={{ background: r.color }} />
                      <h3>{r.stackup.name}</h3>
                    </div>
                    <div className="mini-stats">
                      <span><b className="mono">{r.res.sim.U.toFixed(2)}</b> W/m²K U-value</span>
                      <span><b className="mono">{r.res.sim.decr.toFixed(2)}</b> decrement</span>
                      <span><b className="mono">{r.res.sim.lag.toFixed(1)}</b> h lag</span>
                      <span><b className="mono">{sgn(r.res.sim.gain - r.res.sim.loss, 0)}</b> Wh/m² net</span>
                    </div>
                    <WallSection res={r.res} frame={f} />
                  </div>
                ))}
              </div>
            </section>

            <section aria-label="Comparison charts" className="charts">
              {tempChart && <LineChart spec={tempChart} frame={f} />}
              {flowChart && <LineChart spec={flowChart} frame={f} />}
            </section>
          </>
        )}
      </main>

      {modal && (
        <StackupModal
          title={modal.draft?.id ? 'Edit build-up' : modal.draft ? 'Customize build-up' : 'New build-up'}
          initial={modal.draft}
          onCancel={() => setModal(null)}
          onSave={saveStackup}
        />
      )}

      {confirmDelete && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="modal modal-small" role="dialog" aria-modal="true" aria-label="Confirm delete">
            <div className="modal-body">
              <p>Delete “{confirmDelete.name}” from your library? This can't be undone.</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={() => doDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
