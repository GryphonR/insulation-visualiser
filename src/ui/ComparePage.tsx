import { useMemo, useState } from 'react';
import { BUILTIN_STACKUPS, layersFromTuples } from '../engine/library';
import type { Stackup } from '../engine/library';
import { DEFAULT_SCENARIO, buildParams, daySolar, runScenario } from '../engine/scenario';
import type { Scenario } from '../engine/scenario';
import { clamp, sgn } from '../lib/util';
import { buildChart } from './charts';
import { EnvironmentPanel } from './EnvironmentPanel';
import { projectDay } from './projectSim';
import { useProject } from './project';
import { LineChart } from './LineChart';
import { Player } from './Player';
import { StackupModal } from './StackupModal';
import type { StackupDraft } from './StackupModal';
import { WallSection } from './WallSection';
import { useClock } from './useClock';

const COLORS = ['#0b63b5', '#c75b00', '#2d7a4d', '#a23b72'];
const NEW_OPTION = '__new__';

const DEFAULT_SLOTS = ['preset:cavity_old', 'preset:cavity_new'];

interface Props {
  customStackups: Stackup[];
  setCustomStackups: (updater: (prev: Stackup[]) => Stackup[]) => void;
}

type Result = { stackup: Stackup; color: string; res: ReturnType<typeof runScenario> };

/** One plain sentence per measure: which wall is ahead, and by how much. */
function TextComparison({ a, b }: { a: Result; b: Result }) {
  const A = a.res.sim;
  const B = b.res.sim;
  const na = <b style={{ color: a.color }}>{a.stackup.name}</b>;
  const nb = <b style={{ color: b.color }}>{b.stackup.name}</b>;
  const rows: { key: string; text: React.ReactNode }[] = [];
  const pair = (key: string, va: number, vb: number, d: number, fmt: (n: number) => string, lowWins: boolean, what: string, better: string) => {
    if (Math.abs(va - vb) < 0.5 * 10 ** -d) {
      rows.push({ key, text: <>{what}: both about {fmt(va)}.</> });
      return;
    }
    const aWins = lowWins ? va < vb : va > vb;
    rows.push({ key, text: <>{what}: {aWins ? na : nb} is {better} at {fmt(aWins ? va : vb)} against {fmt(aWins ? vb : va)} for {aWins ? nb : na}.</> });
  };
  pair('U', A.U, B.U, 2, (n) => `${n.toFixed(2)} W/m²K`, true, 'U-value', 'better insulated');
  pair('decr', A.decr, B.decr, 2, (n) => n.toFixed(2), true, 'Decrement factor', 'steadier');
  pair('lag', A.lag, B.lag, 1, (n) => `${n.toFixed(1)} h`, false, 'Decrement delay', 'slower to pass heat on');
  pair('in', A.gain, B.gain, 0, (n) => `${n.toFixed(0)} Wh/m²`, true, 'Heat into the room over the day', 'lower');
  pair('out', A.loss, B.loss, 0, (n) => `${n.toFixed(0)} Wh/m²`, true, 'Heat out of the room over the day', 'lower');
  pair('swing', A.timax - A.timin, B.timax - B.timin, 1, (n) => `${n.toFixed(1)} K`, true, 'Inner face temperature swing', 'steadier');
  return (
    <section className="card panel" aria-label="Written comparison">
      <h2>In words</h2>
      <ul className="stack-10">{rows.map((r) => <li key={r.key}>{r.text}</li>)}</ul>
    </section>
  );
}

export function ComparePage({ customStackups, setCustomStackups, initial }: Props & { initial?: string[] }) {
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  const findStackup = (id: string) => library.find((s) => s.id === id);

  const [slots, setSlots] = useState<string[]>(() => {
    const ids = new Set(library.map((s) => s.id));
    // Arriving from the library's tick boxes: those two, if both still exist.
    if (initial?.length === 2 && initial.every((id) => ids.has(id))) return initial;
    const def = DEFAULT_SLOTS.filter((id) => ids.has(id));
    return def.length ? def : library.slice(0, 2).map((s) => s.id);
  });
  const { res: houseRes } = useProject();
  const proj = useMemo(() => projectDay(houseRes), [houseRes]);
  const [env, setEnv] = useState<Scenario>(() => ({ ...DEFAULT_SCENARIO, ...proj?.patch }));
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

  // Drives the "set the day" summary text; needs no wall, so no simulation.
  const day = useMemo(() => {
    const { params, orient } = buildParams(env);
    return { params, solar: daySolar(params, orient) };
  }, [env]);

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
  const valid = useMemo(() => results.filter((r): r is NonNullable<typeof r> => !!r), [results]);

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
      <EnvironmentPanel sc={env} params={day.params} solar={day.solar} set={set} wide project={proj} />

      <section className="card panel">
        <div className="section-head">
          <div>
            <h2>Heat moving through each wall</h2>
            <p className="muted small">Pick two build-ups to compare. Both run under the one day set above. Press play or drag the clock.</p>
          </div>
          <Player frame={f} playing={playing} setPlaying={setPlaying} scrub={scrub} />
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
                </div>
                {r && (
                  <>
                    <div className="mini-stats">
                      <span><b className="mono">{r.res.sim.U.toFixed(2)}</b> W/m²K U-value</span>
                      <span><b className="mono">{r.res.sim.decr.toFixed(2)}</b> decrement</span>
                      <span><b className="mono">{r.res.sim.lag.toFixed(1)}</b> h delay</span>
                      <span><b className="mono">{r.res.sim.gain.toFixed(0)}</b> Wh/m² into the room</span>
                      <span><b className="mono">{r.res.sim.loss.toFixed(0)}</b> Wh/m² out of the room</span>
                      <span><b className="mono">{sgn(r.res.sim.gain - r.res.sim.loss, 0)}</b> Wh/m² net</span>
                      <span><b className="mono">{sgn(r.res.sim.qmin, 1)} to {sgn(r.res.sim.qmax, 1)}</b> W/m² range</span>
                    </div>
                    <WallSection res={r.res} frame={f} />
                  </>
                )}
              </div>
            );
          })}
        </div>

      </section>

      {valid.length > 0 && (
        <section aria-label="Comparison charts" className="charts">
          {tempChart && <LineChart spec={tempChart} frame={f} />}
          {flowChart && <LineChart spec={flowChart} frame={f} />}
        </section>
      )}

      {valid.length === 2 && <TextComparison a={valid[0]} b={valid[1]} />}

      {modal && (
        <StackupModal
          title={modal.draft?.id ? 'Edit build-up' : modal.draft ? 'Customize build-up' : 'New build-up'}
          initial={modal.draft}
          library={library}
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
