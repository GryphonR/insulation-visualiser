import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_FULL, PRESETS } from './engine/data';
import { loadCustomStackups, saveCustomStackups } from './engine/library';
import type { Stackup } from './engine/library';
import { DEFAULT_SCENARIO, runScenario } from './engine/scenario';
import type { Scenario } from './engine/scenario';
import { N_FRAMES } from './engine/simulate';
import { clamp, sgn } from './lib/util';
import { Builder } from './ui/Builder';
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

  const idRef = useRef(100);
  const nextId = useCallback(() => idRef.current++, []);
  const mkLayers = useCallback(
    (layers: Array<[string, number]>) => layers.map(([mat, t]) => ({ id: nextId(), mat, t })),
    [nextId],
  );

  const [sc, setSc] = useState<Scenario>(() => ({
    ...DEFAULT_SCENARIO,
    layers: PRESETS[0].layers.map(([mat, t], i) => ({ id: i + 1, mat, t })),
  }));

  const { frame, playing, setPlaying, scrub } = useClock(90); // 15:00

  const res = useMemo(() => runScenario(sc), [sc]);
  const charts = useMemo(() => buildCharts(res), [res]);
  const f = clamp(frame, 0, N_FRAMES - 1);
  const fr = res.sim.fr;
  const set = useCallback((patch: Partial<Scenario>) => setSc((s) => ({ ...s, ...patch })), []);

  const onPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setSc((s) => ({ ...s, layers: mkLayers(p.layers), orient: p.orient ?? (s.orient === 'roof' ? 'W' : s.orient) }));
  };

  const [saveModal, setSaveModal] = useState(false);
  const saveCurrentToLibrary = (draft: StackupDraft) => {
    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCustomStackups((prev) => [...prev, { id, name: draft.name, layers: draft.layers, orient: draft.orient }]);
    setSaveModal(false);
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
              Build a wall or roof, pick a UK day, and watch the heat soak through each layer. Steady-state U-values hide this: thermal mass delays and flattens the swing.
            </p>
          </div>
          <div className="head-right">
            <button type="button" aria-pressed={mode === 'learn'} className={mode === 'learn' ? 'chip on' : 'chip'} onClick={() => setMode('learn')}>Learn</button>
            {mode === 'single' && (
              <p className="mono small muted">
                {res.loc.name} · {MONTHS_FULL[sc.month]} · {res.weather.name} · {res.orient.name}
              </p>
            )}
          </div>
        </header>

        <div role="tablist" aria-label="View" className="chips">
          <button type="button" role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'chip on' : 'chip'} onClick={() => setMode('single')}>Single wall</button>
          <button type="button" role="tab" aria-selected={mode === 'compare'} className={mode === 'compare' ? 'chip on' : 'chip'} onClick={() => setMode('compare')}>Compare build-ups</button>
        </div>

        {mode === 'learn' ? (
          <LearnPage onOpenSimulator={() => setMode('single')} />
        ) : mode === 'compare' ? (
          <ComparePage customStackups={customStackups} setCustomStackups={setCustomStackups} />
        ) : (
          <div className="cols">
            <aside className="side">
              <Builder layers={sc.layers} onChange={(layers) => set({ layers })} onPreset={onPreset} nextId={nextId} onSaveToLibrary={() => setSaveModal(true)} />
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

      {saveModal && (
        <StackupModal
          title="Save current build-up to library"
          initial={{ name: '', layers: sc.layers.map((l) => [l.mat, l.t]), orient: sc.orient === 'roof' ? 'roof' : undefined }}
          onCancel={() => setSaveModal(false)}
          onSave={saveCurrentToLibrary}
        />
      )}
    </div>
  );
}
