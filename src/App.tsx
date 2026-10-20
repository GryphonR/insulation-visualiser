import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_FULL, PRESETS } from './engine/data';
import { BUILTIN_STACKUPS, loadCustomStackups, loadScenario, saveCustomStackups, saveScenario } from './engine/library';
import type { Stackup } from './engine/library';
import { DEFAULT_SCENARIO, runScenario } from './engine/scenario';
import type { Scenario } from './engine/scenario';
import { N_FRAMES } from './engine/simulate';
import { clamp, sgn } from './lib/util';
import { BuildupSummary } from './ui/BuildupSummary';
import { ComparePage } from './ui/ComparePage';
import { EnvironmentPanel } from './ui/EnvironmentPanel';
import { HeatMap } from './ui/HeatMap';
import { LearnPage } from './ui/LearnPage';
import { LineChart } from './ui/LineChart';
import { Player } from './ui/Player';
import { StackupModal } from './ui/StackupModal';
import type { StackupDraft } from './ui/StackupModal';
import { Stats } from './ui/Stats';
import { WallSection } from './ui/WallSection';
import { buildCharts } from './ui/charts';
import { useClock } from './ui/useClock';

type Mode = 'single' | 'compare' | 'learn';

const MODES: Mode[] = ['single', 'compare', 'learn'];
// Hash routes (#/compare, #/learn): GitHub Pages can't rewrite deep links to index.html.
const modeFromHash = (): Mode => MODES.find((m) => location.hash === `#/${m}`) ?? 'single';

export default function App() {
  const [mode, setModeState] = useState<Mode>(modeFromHash);
  useEffect(() => {
    const onHash = () => setModeState(modeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setMode = (m: Mode) => {
    location.hash = m === 'single' ? '' : `/${m}`;
    setModeState(m);
  };

  const [customStackups, setCustomStackups] = useState<Stackup[]>(() => loadCustomStackups());
  // Don't write back what we just loaded: if the stored JSON was unreadable, that would wipe it.
  const [loadedStackups] = useState(customStackups);
  useEffect(() => {
    if (customStackups !== loadedStackups) saveCustomStackups(customStackups);
  }, [customStackups, loadedStackups]);

  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);

  const idRef = useRef(100);
  const nextId = useCallback(() => idRef.current++, []);
  const mkLayers = useCallback(
    (layers: Array<[string, number]>) => layers.map(([mat, t]) => ({ id: nextId(), mat, t })),
    [nextId],
  );

  const [saved] = useState(loadScenario);
  const [notice, setNotice] = useState(saved.dropped);
  const [sc, setSc] = useState<Scenario>(() => saved.sc ?? ({
    ...DEFAULT_SCENARIO,
    layers: PRESETS[0].layers.map(([mat, t], i) => ({ id: i + 1, mat, t })),
  }));
  useEffect(() => saveScenario(sc), [sc]);

  const { frame, playing, setPlaying, scrub } = useClock(90); // 15:00

  const res = useMemo(() => runScenario(sc), [sc]);
  const charts = useMemo(() => buildCharts(res), [res]);
  const f = clamp(frame, 0, N_FRAMES - 1);
  const fr = res.sim.fr;
  const set = useCallback((patch: Partial<Scenario>) => setSc((s) => ({ ...s, ...patch })), []);

  const [editing, setEditing] = useState(false);
  const applyDraft = (draft: StackupDraft) => {
    setSc((s) => ({ ...s, layers: mkLayers(draft.layers), orient: draft.orient ?? (s.orient === 'roof' ? 'W' : s.orient) }));
    setEditing(false);
  };
  const saveAndApply = (draft: StackupDraft) => {
    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCustomStackups((prev) => [...prev, { id, name: draft.name, layers: draft.layers, orient: draft.orient }]);
    applyDraft(draft);
  };

  const pills = [
    { label: 'Sun on surface', value: `${Math.round(fr.I[f])} W/m²` },
    { label: 'Air', value: `${fr.tair[f].toFixed(1)} °C` },
    { label: 'Sol-air', value: `${fr.tsa[f].toFixed(1)} °C` },
    { label: 'Inner face', value: `${fr.tsIn[f].toFixed(1)} °C` },
    { label: 'Heat flow to room', value: `${sgn(fr.q[f], 1)} W/m²` },
  ];

  return (
    <div className="page">
      <div className="wrap">
        <header className="head">
          <div>
            <h1>Insulation Visualiser</h1>
            <p className="lede">
              Visualise heat transfer and the effects of insulation and thermal mass in wall and roof build-ups.
            </p>
          </div>
          <div className="head-right">
            <button type="button" aria-pressed={mode === 'learn'} className={mode === 'learn' ? 'chip on' : 'chip'} onClick={() => setMode('learn')}>Learn</button>
          </div>
        </header>

        {notice.length > 0 && (
          <aside role="status" className="callout">
            <div className="eyebrow">Your saved wall was changed</div>
            {notice.map((n, i) => <p key={i}>{n}</p>)}
            {!saved.sc && <p>Because no valid layers were left, the default build-up has been loaded instead.</p>}
            <p><button type="button" className="btn-secondary" onClick={() => setNotice([])}>Dismiss</button></p>
          </aside>
        )}

        <div className="tabs-row">
          <div role="tablist" aria-label="View" className="chips">
            <button type="button" role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'chip on' : 'chip'} onClick={() => setMode('single')}>Single wall</button>
            <button type="button" role="tab" aria-selected={mode === 'compare'} className={mode === 'compare' ? 'chip on' : 'chip'} onClick={() => setMode('compare')}>Compare build-ups</button>
          </div>
          {mode === 'single' && (
            <p className="mono small muted">
              {res.loc.name} · {MONTHS_FULL[sc.month]} · {res.weather.name} · {res.orient.name}
            </p>
          )}
        </div>

        {mode === 'learn' ? (
          <LearnPage onOpenSimulator={() => setMode('single')} />
        ) : mode === 'compare' ? (
          <ComparePage customStackups={customStackups} setCustomStackups={setCustomStackups} />
        ) : (
          <div className="cols">
            <aside className="side">
              <BuildupSummary layers={sc.layers} sim={res.sim} onEdit={() => setEditing(true)} />
              <EnvironmentPanel sc={sc} params={res.params} solar={res.sim.solar} set={set} />
            </aside>

            <main className="main">
              <Stats res={res} />

              <section className="card panel">
                <div className="section-head">
                  <div>
                    <h2>Heat moving through the wall</h2>
                    <p className="muted small">Colour shows temperature in every slice of every layer, arrows show the heat flow. Press play or drag the clock.</p>
                  </div>
                  <Player frame={f} playing={playing} setPlaying={setPlaying} scrub={scrub} />
                </div>

                <div className="pills">
                  {pills.map((p) => (
                    <div key={p.label} className="pill"><span className="small muted">{p.label}</span><span className="mono">{p.value}</span></div>
                  ))}
                </div>

                <WallSection res={res} frame={f} />

                <div className="cbar">
                  <span className="mono">{res.sim.tlo.toFixed(0)} °C</span>
                  <div className="cbar-grad">
                    <div className="cbar-room" style={{ left: '50%' }}>
                      <span className="mono cbar-room-label">{res.sim.roomRef.toFixed(0)} °C room</span>
                    </div>
                  </div>
                  <span className="mono">{res.sim.thi.toFixed(0)} °C</span>
                </div>
                <p className="small muted">
                  Colour is anchored to the room's own temperature (marked on the scale): blue is always colder than the room, red always warmer, cream about the same — so the same colour means the same thing whichever scenario you compare.
                  Arrows show the heat flow through each slice of the wall: pointing right means heading into the room, thicker means more. Full scale is {Math.round(res.sim.fmax)} W/m². Where arrows differ between layers, heat is being stored or released.
                </p>
              </section>

              <section aria-label="Charts over 24 hours" className="charts">
                {charts.map((c) => <LineChart key={c.title} spec={c} frame={f} />)}
                <HeatMap res={res} frame={f} />
              </section>
            </main>
          </div>
        )}

        <footer className="foot">
          Model: one-dimensional transient conduction through uniform layers (implicit finite volume, 2-minute steps, repeated until the daily cycle settles). Outside is driven by sol-air temperature (air + absorbed sun, with a long-wave loss for roofs); indoor air is held constant unless the room is free-floating. Weather is a synthetic clear-sky-scaled day built from typical UK monthly means, not measured data. Thermal bridging, moisture, ventilated cavities and window gains in the fixed and scheduled modes are not modelled. Values are for teaching and early design, not compliance.
        </footer>
      </div>

      {editing && (
        <StackupModal
          library={library}
          title="Customize build-up"
          initial={{ name: '', layers: sc.layers.map((l) => [l.mat, l.t]), orient: sc.orient === 'roof' ? 'roof' : undefined }}
          onCancel={() => setEditing(false)}
          onSave={saveAndApply}
          onApply={applyDraft}
        />
      )}
    </div>
  );
}
