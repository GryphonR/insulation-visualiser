import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCATIONS, MONTHS, MONTHS_FULL } from '../engine/data';
import { BUILTIN_STACKUPS, layersFromTuples } from '../engine/library';
import type { Stackup } from '../engine/library';
import { clamp } from '../lib/util';
import { EXPOSURES, FOOTINGS, LOADS, MOULD_RH, YEARS, YEAR_ORDER, psat } from '../engine/moisture';
import type { MoistureInput, MoistureResult } from '../engine/moisture';
import { ChipGroup, Eyebrow, Field, Slider } from './controls';
import { StackupModal } from './StackupModal';
import type { StackupDraft } from './StackupModal';
import { useMoisture } from './useMoisture';

const W = 600;
const PL = 52;
const PR = 584;
const PT = 14;
const PB = 188;
const SLOT_COLORS = ['#0b63b5', '#c75b00', '#2d7a4d', '#a23b72'];
const MAX_SLOTS = 4;
const NEW_OPTION = '__new__';
const DEFAULT_SLOTS = ['preset:solid', 'preset:retro'];
const FLUX_Y = 206;
const COL = { warn: '#b91c1c', p: '#14212b', ps: '#1f6fb2' };

const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const niceMax = (v: number) => {
  const m = 10 ** Math.floor(Math.log10(Math.max(v, 1e-9)));
  return ([1, 2, 5, 10].find((s) => s * m >= v) as number) * m;
};

/** Eases a set of numbers to new targets over `ms`; snaps when the length changes or reduced motion is set. */
function useTween(target: number[], ms = 450): number[] {
  const [val, setVal] = useState(target);
  const cur = useRef(target);
  const key = target.join(',');
  useEffect(() => {
    const from = cur.current;
    if (from.length !== target.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cur.current = target;
      setVal(target);
      return;
    }
    const t0 = performance.now();
    const tick = () => {
      const f = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - (1 - f) ** 3;
      cur.current = target.map((t, i) => from[i] + (t - from[i]) * e);
      setVal(cur.current);
      if (f >= 1) clearInterval(id);
    };
    const id = setInterval(tick, 16); // a timer, not rAF: still runs where frames are throttled
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return val;
}

interface Line { name: string; vals: number[]; col: string; dash?: string }

/** Twelve chronological points (October first), with optional horizontal reference lines. */
function YearChart({ title, sub, unit, lines, yMax, refs = [], alt, step }: {
  title: string; sub: string; unit: string; lines: Line[]; yMax: number; refs?: Array<{ y: number; label: string }>; alt: string;
  /** Chronological index (0 = October) marked by a vertical cursor. */
  step: number;
}) {
  const x = (i: number) => PL + ((PR - PL) * i) / 11;
  const y = (v: number) => PB - ((PB - PT) * Math.min(v, yMax)) / yMax;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  return (
    <div className="card chart-card">
      <div>
        <h3>{title}</h3>
        <p className="muted">{sub}</p>
      </div>
      <div className="legend">
        {lines.map((l) => (
          <span key={l.name} className="legend-item">
            <span style={{ display: 'inline-block', width: 24, borderTop: `3px ${l.dash ? 'dashed' : 'solid'} ${l.col}` }} />
            {l.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} 220`} role="img" aria-label={alt} className="svg-fluid">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={PR} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PL - 6} y={y(t) + 4} className="svt-end">{fmt(t)}</text>
          </g>
        ))}
        {YEAR_ORDER.map((m, i) => (
          <text key={m} x={x(i)} y={206} className="svt-mid">{MONTHS[m]}</text>
        ))}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={PL} x2={PR} y1={y(r.y)} y2={y(r.y)} stroke={COL.warn} strokeDasharray="5 4" strokeWidth={1.2} />
            <text x={PR} y={y(r.y) - 4} className="svt-end" style={{ fill: COL.warn }}>{r.label}</text>
          </g>
        ))}
        <line x1={PL} x2={PL} y1={PT} y2={PB} stroke={COL.p} strokeWidth={1.2} style={{ transform: `translateX(${x(step) - PL}px)`, transition: 'transform 0.45s ease' }} />
        {lines.map((l) => (
          <polyline key={l.name} fill="none" stroke={l.col} strokeWidth={2.5} strokeDasharray={l.dash} strokeLinejoin="round"
            points={l.vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
        <text x={PL + 4} y={10} className="svt">{unit}</text>
      </svg>
    </div>
  );
}

/** Vapour pressure (solid) against saturation pressure (blue) through the wall for one month; outside on the left. */
function PressureChart({ res, month }: { res: MoistureResult; month: number }) {
  const m = res.months[month];
  const n = m.p.length; // layer boundaries
  const L = res.layers.length;
  const target = [...m.p, ...m.T, ...m.stored, niceMax(Math.max(...m.ps, ...m.p) * 1.05), ...m.flux, m.wetFace, ...m.drained];
  const a = useTween(target);
  // Month state with every number eased from the previous month's: p and T per boundary; stored, flux and drained per layer.
  const s = { p: a.slice(0, n), T: a.slice(n, 2 * n), stored: a.slice(2 * n, 2 * n + L), ps: a.slice(n, 2 * n).map(psat) };
  const yMax = a[2 * n + L];
  const flux = a.slice(2 * n + L + 1, 2 * n + 2 * L + 1);
  const wetFace = a[2 * n + 2 * L + 1];
  const drained = a.slice(2 * n + 2 * L + 2, 2 * n + 3 * L + 2);
  const total = res.layers.reduce((a, l) => a + l.t, 0);
  const xs = [0];
  res.layers.forEach((l, i) => xs.push(xs[i] + l.t));
  const x = (mm: number) => PL + ((PR - PL) * mm) / total;
  const mid = (k: number) => (xs[k] + xs[k + 1]) / 2;
  const pts: Array<[number, number]> = []; // saturation curve, sampled inside each layer
  res.layers.forEach((_, i) => {
    for (let j = 0; j <= 8; j++) {
      const f = j / 8;
      pts.push([xs[i] + (xs[i + 1] - xs[i]) * f, psat(s.T[i] + (s.T[i + 1] - s.T[i]) * f)]);
    }
  });
  const y = (v: number) => PB - ((PB - PT) * v) / yMax;
  const line = (arr: Array<[number, number]>) => arr.map(([mm, v]) => `${x(mm).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} 250`} role="img" aria-label={`Vapour pressure, saturation pressure and moisture flow through the wall in ${MONTHS_FULL[month]}`} className="svg-fluid">
      {res.layers.map((l, i) => (
        <rect key={i} x={x(xs[i])} y={PT} width={x(xs[i + 1]) - x(xs[i])} height={PB - PT} fill={l.col} opacity={0.35} />
      ))}
      {res.dampLayers > 0 && (
        <g>
          <rect x={x(0)} y={PT} width={x(xs[res.dampLayers]) - x(0)} height={PB - PT} fill="#2b7bb9" opacity={0.14} />
          <text x={x(0) + 6} y={PB - 6} className="svt" style={{ fill: '#1d5f94' }}>rising damp</text>
        </g>
      )}
      {wetFace > 0.05 && (
        <g>
          <rect x={x(0)} y={PT} width={6} height={PB - PT} fill="#2b7bb9" opacity={0.25 + 0.65 * wetFace} />
          <text x={x(0) + 10} y={PT + 12} className="svt" style={{ fill: '#1d5f94' }}>rain on outer face</text>
        </g>
      )}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={PL} x2={PR} y1={y(f * yMax)} y2={y(f * yMax)} className="grid" />
          <text x={PL - 6} y={y(f * yMax) + 4} className="svt-end">{Math.round(f * yMax)}</text>
        </g>
      ))}
      <polyline fill="none" stroke={COL.ps} strokeWidth={2} strokeDasharray="6 4" points={line(pts)} />
      <polyline fill="none" stroke={COL.p} strokeWidth={2.5} points={line(xs.map((mm, k) => [mm, s.p[k]]))} />
      {drained.map((g, k) => g > 0.5 && (
        <g key={`d${k}`}>
          <circle cx={x(mid(k))} cy={y((s.p[k] + s.p[k + 1]) / 2)} r={5} fill="#fff" stroke="#1d5f94" strokeWidth={2} />
          <text x={x(mid(k))} y={y((s.p[k] + s.p[k + 1]) / 2) - 9} className="svt-mid" style={{ fill: '#1d5f94', fontWeight: 600 }}>{fmt(g)} g/m² drains</text>
        </g>
      ))}
      {s.stored.map((g, k) => g > 0.5 && (
        <g key={k}>
          <circle cx={x(mid(k))} cy={y((s.p[k] + s.p[k + 1]) / 2)} r={5} fill={COL.warn} stroke="#fff" strokeWidth={1.5} />
          <text x={x(mid(k))} y={y((s.p[k] + s.p[k + 1]) / 2) - 9} className="svt-mid" style={{ fill: COL.warn, fontWeight: 600 }}>{fmt(g)} g/m²</text>
        </g>
      ))}
      {res.layers.map((l, i) => {
        const g = flux[i];
        const f = clamp(Math.log10(1 + Math.abs(g) * 10) / 3, 0, 1); // 0..1, log scale: 100 g/m²/day is full
        const cx = x((xs[i] + xs[i + 1]) / 2);
        const half = clamp(((x(xs[i + 1]) - x(xs[i])) * 0.85) / 2, 5, 22);
        const dir = g >= 0 ? 1 : -1;
        const tip = cx + dir * half;
        const col = '#1d5f94';
        return (
          <g key={`f${i}`} opacity={0.3 + 0.7 * f}>
            <title>{`${l.name}: ${Math.abs(g) < 0.01 ? 'almost no' : fmt(Math.abs(g)) + ' g/m² per day of'} moisture flow ${dir > 0 ? 'towards the inside' : 'towards the outside'}`}</title>
            <line x1={cx - half} x2={cx + half} y1={FLUX_Y} y2={FLUX_Y} stroke={col} strokeWidth={1 + 3 * f} strokeDasharray="5 4" className={`flux-flow${dir < 0 ? ' flux-rev' : ''}`} />
            <polygon points={`${tip + dir * 5},${FLUX_Y} ${tip - dir * 1},${FLUX_Y - 4 - 2 * f} ${tip - dir * 1},${FLUX_Y + 4 + 2 * f}`} fill={col} />
          </g>
        );
      })}
      <text x={(PL + PR) / 2} y={FLUX_Y + 22} className="svt-mid">moisture flow (vapour and liquid): thicker is more, the arrow points the way it travels</text>
      <circle cx={x(0)} cy={y(s.p[0])} r={4.5} fill={COL.p} stroke="#fff" strokeWidth={1.5} />
      <circle cx={x(total)} cy={y(s.p[n - 1])} r={4.5} fill={COL.p} stroke="#fff" strokeWidth={1.5} />
      <text x={PL} y={246} className="svt"><tspan style={{ fontWeight: 600 }}>Outside</tspan> {m.te.toFixed(1)} °C · {m.rhe.toFixed(0)}% RH · <tspan style={{ fontWeight: 600 }}>{Math.round(m.pe)} Pa</tspan></text>
      <text x={PR} y={246} className="svt-end"><tspan style={{ fontWeight: 600 }}>Inside</tspan> {m.ti.toFixed(1)} °C · {m.rhi.toFixed(0)}% RH · <tspan style={{ fontWeight: 600 }}>{Math.round(m.p[n - 1])} Pa</tspan></text>
      <text x={PL + 4} y={10} className="svt">Pa</text>
    </svg>
  );
}

/** The wettest timber or fibre layer against its rot threshold. */
function Absorbed({ res }: { res: MoistureResult }) {
  const a = res.absorbed;
  if (!a) return null;
  return (
    <p className="small">
      {a.pct > a.crit && <strong>Rot risk. </strong>}{res.layers[a.layer].name} reaches about {a.pct.toFixed(0)}% moisture by mass at its wetter face, {a.pct > a.crit ? <strong>above</strong> : 'below'} the ~{a.crit.toFixed(0)}% where rot risk begins.
    </p>
  );
}

function Verdict({ res }: { res: MoistureResult }) {
  const where = (k: number) => res.layers[k].name;
  const peakMonth = YEAR_ORDER[res.yearN.indexOf(res.peak)];
  return (
    <div className="stack-6" aria-live="polite">
      {res.verdict === 'none' && (
        res.drainedLayer >= 0
          ? <p className="small"><strong>No water is held in the wall.</strong> The only condensation is in a cavity, below.</p>
          : <p className="small"><strong>Stays dry.</strong> No layer holds liquid water at any point in the year.</p>
      )}
      {res.verdict === 'dries' && (
        <p className="small">
          <strong>Gets wet, then dries out.</strong> Most is in the {where(res.peakLayer)}: peak {fmt(res.peak)} g/m² of liquid water around {MONTHS_FULL[peakMonth]}
          {res.dryMonth !== undefined && <>, dry again by {MONTHS_FULL[res.dryMonth]}</>}.
        </p>
      )}
      {res.verdict === 'accumulates' && (
        <p className="small">
          <strong>Doesn't dry out{res.growing ? ', and gets wetter year on year' : ''}.</strong> Most is in the {where(res.peakLayer)}: peak {fmt(res.peak)} g/m², still {fmt(res.yearN[11])} g/m² at the end of September. Risks rot, frost damage and lost insulation.
        </p>
      )}
      <Absorbed res={res} />
      <p className="small">
        {res.mouldMonths.length === 0
          ? `Inner surface stays below ${MOULD_RH}% RH: mould unlikely.`
          : <><strong>Mould risk</strong> on the inner surface in {res.mouldMonths.map((m) => MONTHS[m]).join(', ')}.</>}
      </p>
      {res.drainedLayer >= 0 && (
        <p className="small">
          <strong>Drained condensation.</strong> About {fmt(res.drainedTotal)} g/m² a year condenses in the {where(res.drainedLayer)}. It is assumed to run down the cavity and out through the weep holes, so it is not counted as water held in the wall.
        </p>
      )}
      {res.missing.length > 0 && <p className="small muted">No vapour data for {res.missing.join(', ')}; treated as open (µ 1).</p>}
      {res.noCapillary.length > 0 && <p className="small muted">No capillary data for {res.noCapillary.join(', ')}; treated as not wicking or storing water.</p>}
      {res.cutAtVent && <p className="small muted">Layers outside the ventilated gap are ignored.</p>}
    </div>
  );
}

interface Props {
  customStackups: Stackup[];
  setCustomStackups: (updater: (prev: Stackup[]) => Stackup[]) => void;
}

export function MoisturePage({ customStackups, setCustomStackups }: Props) {
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  const [slots, setSlots] = useState<string[]>(() => {
    const ids = new Set(library.map((s) => s.id));
    const def = DEFAULT_SLOTS.filter((id) => ids.has(id));
    return def.length ? def : library.slice(0, 2).map((s) => s.id);
  });
  const [modal, setModal] = useState<null | { draft?: StackupDraft; slot: number }>(null);
  const [loc, setLoc] = useState('bir');
  const [tin, setTin] = useState(20);
  const [load, setLoad] = useState('typ');
  const [exposure, setExposure] = useState('moderate');
  const [footing, setFooting] = useState('dry');
  // Position in the simulated year (0 = October), and the calendar month it corresponds to.
  const [step, setStep] = useState(3);
  const [playing, setPlaying] = useState(false);
  const month = YEAR_ORDER[step];
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setStep((s) => (s + 1) % 12), 900);
    return () => clearInterval(t);
  }, [playing]);
  const dv = LOADS.find((l) => l.id === load)?.dv ?? 4;

  const inputs = useMemo(
    () =>
      slots.map((id): MoistureInput | null => {
        const s = library.find((x) => x.id === id);
        return s ? {
          layers: layersFromTuples(s.layers), loc, tin, dv, roof: s.orient === 'roof',
          catch: EXPOSURES.find((e) => e.id === exposure)?.catch, footing: FOOTINGS.find((f) => f.id === footing)?.rh,
        } : null;
      }),
    [slots, library, loc, tin, dv, exposure, footing],
  );
  const { results, busy } = useMoisture(inputs);
  // res is undefined until the first run finishes, and null when everything is outside a ventilated gap.
  const runs = slots.map((id, i) => {
    const s = library.find((x) => x.id === id);
    return s ? { stackup: s, res: results?.[i], color: SLOT_COLORS[i % SLOT_COLORS.length] } : null;
  });
  const withRes = runs.filter((r): r is NonNullable<typeof r> & { res: MoistureResult } => !!r?.res);

  const pick = (slot: number, value: string) => (value === NEW_OPTION ? setModal({ slot }) : setSlots((prev) => prev.map((id, i) => (i === slot ? value : id))));
  const edit = (slot: number, s: Stackup) =>
    setModal({ slot, draft: { id: s.builtin ? undefined : s.id, name: s.builtin ? `${s.name} (copy)` : s.name, layers: s.layers, orient: s.orient } });
  const addColumn = () => {
    const unused = library.find((s) => !slots.includes(s.id));
    setSlots((prev) => [...prev, (unused ?? library[0]).id]);
  };
  const removeColumn = (slot: number) => setSlots((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== slot) : prev));
  const save = (draft: StackupDraft) => {
    const id = draft.id ?? `custom:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next = { id, name: draft.name, layers: draft.layers, orient: draft.orient };
    setCustomStackups((prev) => (draft.id ? prev.map((s) => (s.id === id ? { ...s, ...next } : s)) : [...prev, next]));
    if (modal) setSlots((prev) => prev.map((sid, i) => (i === modal.slot ? id : sid)));
    setModal(null);
  };

  const lines = withRes.flatMap((r) => [
    { name: r.stackup.name, vals: r.res.yearN, col: r.color },
    ...(r.res.growing ? [{ name: `${r.stackup.name} (year 1)`, vals: r.res.year1, col: r.color, dash: '6 4' }] : []),
  ]);
  const peak = Math.max(1, ...withRes.map((r) => r.res.peak));
  const rhMax = Math.max(MOULD_RH, ...withRes.flatMap((r) => r.res.months.map((m) => m.rhSurf)));

  return (
    <div className="compare-page">
      <section className="card panel">
        <h2>Set the year</h2>
        <div className="grid-2">
          <Field label="Location">
            <select className="select" value={loc} onChange={(e) => setLoc(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Slider id="mtin" label="Room air held at" value={tin} min={10} max={28} step={0.5} unit="°C" onChange={setTin} />
        </div>
        <div className="stack-6">
          <Eyebrow>Indoor moisture</Eyebrow>
          <ChipGroup label="Indoor moisture" items={LOADS} value={load} onPick={setLoad} text={(l) => l.label} />
        </div>
        <div className="stack-6">
          <Eyebrow>Rain on the wall</Eyebrow>
          <ChipGroup label="Rain exposure" items={EXPOSURES} value={exposure} onPick={setExposure} text={(e) => e.label} />
        </div>
        <div className="stack-6">
          <Eyebrow>Rising damp from the footings</Eyebrow>
          <ChipGroup label="Footings" items={FOOTINGS} value={footing} onPick={setFooting} text={(f) => f.label} />
        </div>
      </section>

      <section className="card panel">
        <div className="section-head">
          <div>
            <h2>Moisture moving through each wall</h2>
            <p className="muted small">Vapour travels from the side with the higher vapour pressure (the actual amount of water in the air, shown at each end) to the lower, whatever the relative humidity. Liquid water also moves through materials that wick, like brick, stone and lime, from wetter to drier. Where the solid line reaches the dashed one the material is saturated and can hold liquid water. Each month shows averages from an hourly simulation. Press play to run through the year from October, or drag the slider.</p>
          </div>
        </div>
        <div className="player" style={{ flex: 'none' }}>
          <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? (
              <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 3h3.2v12H4.5zM10.3 3h3.2v12h-3.2z" fill="#fff" /></svg>
            ) : (
              <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3.2v11.6L15 9z" fill="#fff" /></svg>
            )}
          </button>
          <input type="range" aria-label="Month of the year" min={0} max={11} step={1} value={step} onChange={(e) => { setStep(Number(e.target.value)); setPlaying(false); }} />
          <span className="mono clock" style={{ minWidth: '6.5em' }}>{MONTHS_FULL[month]}</span>
          {busy && <span className="small muted" role="status">Calculating…</span>}
        </div>
        <div className="legend" aria-label="Key to the vapour charts">
          <span className="legend-item"><span style={{ display: 'inline-block', width: 24, borderTop: `3px solid ${COL.p}` }} />Actual vapour pressure (what is really in the wall)</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 24, borderTop: `3px dashed ${COL.ps}` }} />Saturation pressure (the most the air can hold at that temperature)</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COL.warn }} />Liquid water held in the layer at month end</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #1d5f94' }} />Condensation in a cavity, assumed to drain away</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 24, borderTop: '3px dashed #1d5f94' }} />Moisture flow along the bottom (moving dashes show the direction)</span>
        </div>
        <div className="compare-grid">
          {slots.map((id, i) => {
            const s = library.find((x) => x.id === id);
            const r = runs[i];
            return (
              <div key={i} className="compare-card" style={{ opacity: busy ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                <div className="compare-card-head">
                  <span className="dot" style={{ background: SLOT_COLORS[i % SLOT_COLORS.length] }} />
                  <select className="select grow" aria-label={`Build-up for column ${i + 1}`} value={id} onChange={(e) => pick(i, e.target.value)}>
                    <option value={NEW_OPTION}>+ New build-up…</option>
                    {library.map((o) => <option key={o.id} value={o.id}>{o.name}{o.orient === 'roof' ? ' (roof)' : ''}</option>)}
                  </select>
                  {s && (
                    <button type="button" className="icon-btn small" aria-label={s.builtin ? `Customize a copy of ${s.name}` : `Edit ${s.name}`} onClick={() => edit(i, s)}>
                      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5 13.5 5 5 13.5 2 14l.5-3L11 2.5Z" fill="none" stroke="#14212b" strokeWidth={1.4} strokeLinejoin="round" /></svg>
                    </button>
                  )}
                  {slots.length > 1 && (
                    <button type="button" className="icon-btn small" aria-label={`Remove column ${i + 1}`} onClick={() => removeColumn(i)}>
                      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" fill="none" stroke="#51606c" strokeWidth={1.6} strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
                {r?.res ? (
                  <>
                    <Verdict res={r.res} />
                    <PressureChart res={r.res} month={month} />
                    <p className="small mono muted">
                      {MONTHS[month]}: out {r.res.months[month].te.toFixed(1)} °C · room {r.res.months[month].rhi.toFixed(0)}% RH · surface {r.res.months[month].rhSurf.toFixed(0)}% RH · held {fmt(r.res.months[month].total)} g/m²
                    </p>
                  </>
                ) : r?.res === null ? <p className="small muted">Every layer is outside a ventilated gap, so there is nothing to analyse.</p>
                  : r && <p className="small muted">Calculating…</p>}
              </div>
            );
          })}
        </div>
        {slots.length < MAX_SLOTS && <button type="button" className="btn-link" onClick={addColumn}>+ Add a build-up to compare</button>}
      </section>

      {withRes.length > 0 && (
        <section aria-label="Charts over the year" className="charts">
          <YearChart
            title="Moisture held in the wall"
            sub={`Liquid water held at each month end, in the last of ${YEARS} simulated years from October (the first starts at 80% RH). A dashed line is year 1, shown where the wall is still getting wetter.`}
            unit="g/m²"
            alt="Moisture stored in each wall by month"
            step={step}
            yMax={niceMax(peak * 1.1)}
            lines={lines}
          />
          <YearChart
            title="Inner surface humidity"
            sub={`Relative humidity of the air touching the inside face. Above ${MOULD_RH}% mould can grow.`}
            unit="% RH"
            alt="Relative humidity at the inner surface by month"
            step={step}
            yMax={niceMax(rhMax * 1.05)}
            refs={[{ y: MOULD_RH, label: `${MOULD_RH}% mould limit` }]}
            lines={withRes.map((r) => ({ name: r.stackup.name, vals: YEAR_ORDER.map((m) => r.res.months[m].rhSurf), col: r.color }))}
          />
        </section>
      )}

      <p className="small muted">
        Method: transient heat and moisture transport in the style of EN 15026 (Künzel), stepped every 2 hours for {YEARS} years through a typical UK year built from monthly temperature, humidity and rainfall. Each layer is cut into thin slices. Moisture moves as vapour (by µ) and as capillary liquid, at a rate worked out from each material's water absorption coefficient and free saturation, and is stored along each material's sorption curve. Rain arrives as showers on the outer face, which takes up only as much as its capillarity allows; the rest runs off. Rising damp is fed by capillary flow up from the footing into the outer run of wicking layers. Indoor vapour load is set by the moisture class and shrinks as outdoor temperature rises. "Liquid water held" is water above what each layer holds at 95% RH. Timber and fibre layers are judged for rot over their outer 10 mm. Material data are typical values for each material type, not measured for a product. Not modelled: cracks letting rain past a render, air leakage, freezing, and measured hourly weather. Treat the result as a screening check, not a substitute for a full hygrothermal study.
      </p>

      {modal && (
        <StackupModal
          title={modal.draft?.id ? 'Edit build-up' : modal.draft ? 'Customize build-up' : 'New build-up'}
          initial={modal.draft}
          library={library}
          onCancel={() => setModal(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
