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
const NEW_OPTION = '__new__';

const DEFAULT_ENV: Scenario = {
  layers: [],
  loc: 'bir', month: 6, weather: 'typical', orient: 'W', colour: 'mid',
  heat: 'fixed', tin: 21, comfort: 21, setback: 16, on1: 6, off1: 9, on2: 17, off2: 22,
  floor: 16, elA: 12, glA: 2, rest: 20, ach: 3, gains: 150, glaz: 'std', mass: 'med',
};

const DEFAULT_SLOTS = ['preset:cavity_old', 'preset:cavity_new'];

interface Props {
  customStackups: Stackup[];
  setCustomStackups: (updater: (prev: Stackup[]) => Stackup[]) => void;
}

export function ComparePage({ customStackups, setCustomStackups }: Props) {
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  const findStackup = (id: string) => library.find((s) => s.id === id);

  const [slots, setSlots] = useState<string[]>(() => {
    const ids = new Set(library.map((s) => s.id));
    const def = DEFAULT_SLOTS.filter((id) => ids.has(id));
    return def.length ? def : library.slice(0, 2).map((s) => s.id);
  });
  const [env, setEnv] = useState<Scenario>(DEFAULT_ENV);
  const [modal, setModal] = useState<null | { draft?: StackupDraft; slot: number | null }>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | { stackup: Stackup; slot: number }>(null);
  const { frame, playing, setPlaying, scrub } = useClock();

  const set = (patch: Partial<Scenario>) => setEnv((s) => ({ ...s, ...patch }));

  const pickForSlot = (slot: number, value: string) => {
    if (value === NEW_OPTION) {
      setModal({ slot });
      return;
    }
    setSlots((prev) => prev.map((id, i) => (i === slot ? value : id)));
  };

  const editSlot = (slot: number, s: Stackup) => {
    setModal({
      slot,
      draft: { id: s.builtin ? undefined : s.id, name: s.builtin ? `${s.name} (copy)` : s.name, layers: s.layers, orient: s.orient },
    });
  };

  const addColumn = () => {
    if (slots.length >= MAX_COMPARE) return;
    const unused = library.find((s) => !slots.includes(s.id));
    setSlots((prev) => [...prev, (unused ?? library[0]).id]);
  };

  const removeColumn = (slot: number) => {
    setSlots((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== slot) : prev));
  };

  // A throwaway single-layer run, only to drive the "set the day" summary text
  // (solar geometry and outdoor temperatures), independent of any compared wall.
  const envProbe = useMemo(
    () => runScenario({ ...env, layers: layersFromTuples([['brick', 100]]) }),
    [env],
  );

  const results = useMemo(
    () =>
      slots.map((id, i) => {
        const s = findStackup(id);
        if (!s) return null;
        return { stackup: s, color: COLORS[i % COLORS.length], res: runScenario({ ...env, orient: s.orient ?? env.orient, layers: layersFromTuples(s.layers) }) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, env, library],
  );

  const f = clamp(frame, 0, 143);
  const valid = results.filter((r): r is NonNullable<typeof r> => !!r);

  const tempChart = useMemo(
    () =>
      valid.length
        ? buildChart({
            title: 'Inner face temperature',
            sub: 'Compare how each build-up tempers the day',
            alt: 'Line chart comparing inner face temperature across build-ups over 24 hours',
            series: valid.map((r) => ({ name: r.stackup.name, arr: r.res.sim.fr.tsIn, col: r.color, sw: 2.5 })),
            note: 'A flatter, more delayed line means more effective thermal mass and insulation together.',
          })
        : null,
    [valid],
  );

  const flowChart = useMemo(
    () =>
      valid.length
        ? buildChart({
            title: 'Heat flow into the room',
            sub: 'W/m². Above zero the wall is warming the room.',
            alt: 'Line chart comparing heat flow into the room across build-ups over 24 hours',
            zero: true,
            series: valid.map((r) => ({ name: r.stackup.name, arr: r.res.sim.fr.q, col: r.color, sw: 2.5 })),
            note: 'Smaller peaks and a flatter line mean the room feels less of the outside swing.',
          })
        : null,
    [valid],
  );

  const saveStackup = (draft: StackupDraft) => {
    const slot = modal?.slot ?? null;
    if (draft.id) {
      setCustomStackups((prev) => prev.map((s) => (s.id === draft.id ? { ...s, name: draft.name, layers: draft.layers, orient: draft.orient } : s)));
      if (slot !== null) setSlots((prev) => prev.map((id, i) => (i === slot ? draft.id! : id)));
    } else {
      const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setCustomStackups((prev) => [...prev, { id, name: draft.name, layers: draft.layers, orient: draft.orient }]);
      if (slot !== null) setSlots((prev) => prev.map((sid, i) => (i === slot ? id : sid)));
    }
    setModal(null);
  };

  const doDelete = (stackup: Stackup, slot: number) => {
    setCustomStackups((prev) => prev.filter((x) => x.id !== stackup.id));
    const fallback = library.find((s) => s.id !== stackup.id)?.id ?? stackup.id;
    setSlots((prev) => prev.map((id) => (id === stackup.id ? fallback : id)));
    setConfirmDelete(null);
  };

  return (
    <div className="compare-page">
      <EnvironmentPanel sc={env} res={envProbe} set={set} wide />

      <section className="card panel">
        <div className="section-head">
          <div>
            <h2><span className="step">1</span>Heat moving through each wall</h2>
            <p className="muted small">Pick a build-up for each column below. They all run under the one day set above. Press play or drag the clock.</p>
          </div>
          <div className="player">
            <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? (
                <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 3h3.2v12H4.5zM10.3 3h3.2v12h-3.2z" fill="#fff" /></svg>
              ) : (
                <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3.2v11.6L15 9z" fill="#fff" /></svg>
              )}
            </button>
            <input type="range" aria-label="Time of day" min={0} max={143} step={1} value={f} onChange={(e) => scrub(Number(e.target.value))} />
            <span className="mono clock">{pad2(Math.floor(f / FRAMES_PER_HOUR))}:{pad2((f % FRAMES_PER_HOUR) * 10)}</span>
          </div>
        </div>

        <div className="compare-grid">
          {slots.map((id, i) => {
            const s = findStackup(id);
            const r = results[i];
            const color = COLORS[i % COLORS.length];
            return (
              <div key={i} className="compare-card">
                <div className="compare-card-head">
                  <span className="dot" style={{ background: color }} />
                  <select className="select grow" aria-label={`Build-up for column ${i + 1}`} value={id} onChange={(e) => pickForSlot(i, e.target.value)}>
                    <option value={NEW_OPTION}>+ New build-up…</option>
                    {library.map((o) => <option key={o.id} value={o.id}>{o.name}{o.orient === 'roof' ? ' (roof)' : ''}</option>)}
                  </select>
                  {s && (
                    <button type="button" className="icon-btn small" aria-label={s.builtin ? `Customize a copy of ${s.name}` : `Edit ${s.name}`} onClick={() => editSlot(i, s)}>
                      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5 13.5 5 5 13.5 2 14l.5-3L11 2.5Z" fill="none" stroke="#14212b" strokeWidth={1.4} strokeLinejoin="round" /></svg>
                    </button>
                  )}
                  {s && !s.builtin && (
                    <button type="button" className="icon-btn small" aria-label={`Delete ${s.name}`} onClick={() => setConfirmDelete({ stackup: s, slot: i })}>
                      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" fill="none" stroke="#a02828" strokeWidth={1.6} strokeLinecap="round" /></svg>
                    </button>
                  )}
                  {slots.length > 1 && (
                    <button type="button" className="icon-btn small" aria-label={`Remove column ${i + 1}`} onClick={() => removeColumn(i)}>
                      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" fill="none" stroke="#51606c" strokeWidth={1.6} strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
                {r && (
                  <>
                    <div className="mini-stats">
                      <span><b className="mono">{r.res.sim.U.toFixed(2)}</b> W/m²K U-value</span>
                      <span><b className="mono">{r.res.sim.decr.toFixed(2)}</b> decrement</span>
                      <span><b className="mono">{r.res.sim.lag.toFixed(1)}</b> h lag</span>
                      <span><b className="mono">{sgn(r.res.sim.gain - r.res.sim.loss, 0)}</b> Wh/m² net</span>
                    </div>
                    <WallSection res={r.res} frame={f} />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {slots.length < MAX_COMPARE && (
          <button type="button" className="btn-link" onClick={addColumn}>+ Add a build-up to compare</button>
        )}
      </section>

      {valid.length > 0 && (
        <section aria-label="Comparison charts" className="charts">
          {tempChart && <LineChart spec={tempChart} frame={f} />}
          {flowChart && <LineChart spec={flowChart} frame={f} />}
        </section>
      )}

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
              <p>Delete “{confirmDelete.stackup.name}” from your library? This can't be undone.</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={() => doDelete(confirmDelete.stackup, confirmDelete.slot)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
