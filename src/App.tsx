import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_FULL, PRESETS } from './engine/data';
import { runScenario } from './engine/scenario';
import type { Scenario } from './engine/scenario';
import { N_FRAMES, FRAMES_PER_HOUR } from './engine/simulate';
import { clamp, pad2, sgn } from './lib/util';
import { Builder } from './ui/Builder';
import { EnvironmentPanel } from './ui/EnvironmentPanel';
import { HeatMap } from './ui/HeatMap';
import { LineChart } from './ui/LineChart';
import { Stats } from './ui/Stats';
import { WallSection } from './ui/WallSection';
import { buildCharts } from './ui/charts';

export default function App() {
  const idRef = useRef(100);
  const nextId = useCallback(() => idRef.current++, []);
  const mkLayers = useCallback(
    (layers: Array<[string, number]>) => layers.map(([mat, t]) => ({ id: nextId(), mat, t })),
    [nextId],
  );

  const [sc, setSc] = useState<Scenario>(() => ({
    layers: PRESETS[0].layers.map(([mat, t], i) => ({ id: i + 1, mat, t })),
    loc: 'bir', month: 6, weather: 'typical', orient: 'W', colour: 'mid',
    heat: 'fixed', tin: 21, comfort: 21, setback: 16, on1: 6, off1: 9, on2: 17, off2: 22,
    floor: 16, elA: 12, glA: 2, rest: 20, ach: 3, gains: 150, glaz: 'std', mass: 'med',
  }));

  const [frame, setFrame] = useState(90); // 15:00
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % 144), 110);
    return () => clearInterval(t);
  }, [playing]);

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
          <p className="mono small muted">
            {res.loc.name} · {MONTHS_FULL[sc.month]} · {res.weather.name} · {res.orient.name}
          </p>
        </header>

        <div className="cols">
          <aside className="side">
            <Builder layers={sc.layers} onChange={(layers) => set({ layers })} onPreset={onPreset} nextId={nextId} />
            <EnvironmentPanel sc={sc} res={res} set={set} />
          </aside>

          <main className="main">
            <Stats res={res} />

            <section className="card panel">
              <div className="section-head">
                <div>
                  <h2>Heat moving through the wall</h2>
                  <p className="muted small">Colour shows temperature in every slice of every layer, arrows show the heat flow. Press play or drag the clock.</p>
                </div>
                <div className="player">
                  <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                    {playing ? (
                      <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 3h3.2v12H4.5zM10.3 3h3.2v12h-3.2z" fill="#fff" /></svg>
                    ) : (
                      <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3.2v11.6L15 9z" fill="#fff" /></svg>
                    )}
                  </button>
                  <input
                    type="range" aria-label="Time of day" min={0} max={143} step={1} value={f % 144}
                    onChange={(e) => { setFrame(Number(e.target.value)); setPlaying(false); }}
                  />
                  <span className="mono clock">{pad2(Math.floor(f / FRAMES_PER_HOUR))}:{pad2((f % FRAMES_PER_HOUR) * 10)}</span>
                </div>
              </div>

              <div className="pills">
                {pills.map((p) => (
                  <div key={p.label} className="pill"><span className="small muted">{p.label}</span><span className="mono">{p.value}</span></div>
                ))}
              </div>

              <WallSection res={res} frame={f} />

              <div className="cbar">
                <span className="mono">{res.sim.tlo.toFixed(0)} °C</span>
                <div className="cbar-grad" />
                <span className="mono">{res.sim.thi.toFixed(0)} °C</span>
              </div>
              <p className="small muted">
                Arrows show the heat flow through each slice of the wall: pointing right means heading into the room, thicker means more. Full scale is {Math.round(res.sim.fmax)} W/m². Where arrows differ between layers, heat is being stored or released.
              </p>
            </section>

            <section aria-label="Charts over 24 hours" className="charts">
              {charts.map((c) => <LineChart key={c.title} spec={c} frame={f} />)}
              <HeatMap res={res} frame={f} />
            </section>
          </main>
        </div>

        <footer className="foot">
          Model: one-dimensional transient conduction through uniform layers (implicit finite volume, 2-minute steps, repeated until the daily cycle settles). Outside is driven by sol-air temperature (air + absorbed sun, with a long-wave loss for roofs); indoor air is held constant unless the room is free-floating. Weather is a synthetic clear-sky-scaled day built from typical UK monthly means, not measured data. Thermal bridging, moisture, ventilated cavities and window gains in the fixed and scheduled modes are not modelled. Values are for teaching and early design, not compliance.
        </footer>
      </div>
    </div>
  );
}
