import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCATIONS, MONTHS, MONTHS_FULL } from '../engine/data';
import { BUILTIN_STACKUPS, layersFromTuples } from '../engine/library';
import type { Stackup } from '../engine/library';
import { clamp } from '../lib/util';
import { EXPOSURES, FOOTINGS, LOADS, MOULD_RH, YEAR_ORDER, psat, runMoisture } from '../engine/moisture';
import type { MoistureResult } from '../engine/moisture';
import { ChipGroup, Eyebrow, Field, Slider } from './controls';
import { StackupModal } from './StackupModal';
import type { StackupDraft } from './StackupModal';

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
  const n = m.p.length;
  const target = [...m.p, ...m.T, ...m.stored, niceMax(Math.max(...m.ps, ...m.p) * 1.05), ...m.flux, m.wetFace, ...m.drained];
  const a = useTween(target);
  // Month state with every number eased from the previous month's.
  const s = { p: a.slice(0, n), T: a.slice(n, 2 * n), stored: a.slice(2 * n, 3 * n), ps: a.slice(n, 2 * n).map(psat) };
  const flux = a.slice(3 * n + 1, 4 * n); // one per layer (n - 1)
  const wetFace = a[4 * n];
  const drained = a.slice(4 * n + 1, 5 * n + 1);
  const total = res.layers.reduce((a, l) => a + l.t, 0);
  const xs = [0];
  res.layers.forEach((l, i) => xs.push(xs[i] + l.t));
  const x = (mm: number) => PL + ((PR - PL) * mm) / total;
  const pts: Array<[number, number]> = []; // saturation curve, sampled inside each layer
  res.layers.forEach((_, i) => {
    for (let j = 0; j <= 8; j++) {
      const f = j / 8;
      pts.push([xs[i] + (xs[i + 1] - xs[i]) * f, psat(s.T[i] + (s.T[i + 1] - s.T[i]) * f)]);
    }
  });
  const yMax = a[3 * n];
  const y = (v: number) => PB - ((PB - PT) * v) / yMax;
  const line = (arr: Array<[number, number]>) => arr.map(([mm, v]) => `${x(mm).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} 250`} role="img" aria-label={`Vapour pressure, saturation pressure and vapour flow through the wall in ${MONTHS_FULL[month]}`} className="svg-fluid">
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
      {drained.map((g, k) => g > 0.05 && (
        <g key={`d${k}`}>
          <circle cx={x(xs[k])} cy={y(s.ps[k])} r={5} fill="#fff" stroke="#1d5f94" strokeWidth={2} />
          <text x={x(xs[k])} y={y(s.ps[k]) - 9} className="svt-mid" style={{ fill: '#1d5f94', fontWeight: 600 }}>{fmt(g)} g/m² drains</text>
        </g>
      ))}
      {s.stored.map((g, k) => g > 0.05 && (
        <g key={k}>
          <circle cx={x(xs[k])} cy={y(s.ps[k])} r={5} fill={COL.warn} stroke="#fff" strokeWidth={1.5} />
          <text x={x(xs[k])} y={y(s.ps[k]) - 9} className="svt-mid" style={{ fill: COL.warn, fontWeight: 600 }}>{fmt(g)} g/m²</text>
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
            <title>{`${l.name}: ${Math.abs(g) < 0.01 ? 'almost no' : fmt(Math.abs(g)) + ' g/m² per day of'} vapour flow ${dir > 0 ? 'towards the inside' : 'towards the outside'}`}</title>
            <line x1={cx - half} x2={cx + half} y1={FLUX_Y} y2={FLUX_Y} stroke={col} strokeWidth={1 + 3 * f} strokeDasharray="5 4" className={`flux-flow${dir < 0 ? ' flux-rev' : ''}`} />
            <polygon points={`${tip + dir * 5},${FLUX_Y} ${tip - dir * 1},${FLUX_Y - 4 - 2 * f} ${tip - dir * 1},${FLUX_Y + 4 + 2 * f}`} fill={col} />
          </g>
        );
      })}
      <text x={(PL + PR) / 2} y={FLUX_Y + 22} className="svt-mid">vapour flow: thicker is more, the arrow points the way it travels</text>
      <circle cx={x(0)} cy={y(s.p[0])} r={4.5} fill={COL.p} stroke="#fff" strokeWidth={1.5} />
      <circle cx={x(total)} cy={y(s.p[n - 1])} r={4.5} fill={COL.p} stroke="#fff" strokeWidth={1.5} />
      <text x={PL} y={246} className="svt"><tspan style={{ fontWeight: 600 }}>Outside</tspan> {m.te.toFixed(1)} °C · {m.rhe.toFixed(0)}% RH · <tspan style={{ fontWeight: 600 }}>{Math.round(m.pe)} Pa</tspan></text>
      <text x={PR} y={246} className="svt-end"><tspan style={{ fontWeight: 600 }}>Inside</tspan> {m.ti.toFixed(1)} °C · {m.rhi.toFixed(0)}% RH · <tspan style={{ fontWeight: 600 }}>{Math.round(m.p[n - 1])} Pa</tspan></text>
      <text x={PL + 4} y={10} className="svt">Pa</text>
    </svg>
  );
}

/** How the peak condensate sits in the adjacent layers: soaked into hygroscopic ones, or free water on a non-absorbent face. */
function Absorbed({ res }: { res: MoistureResult }) {
  const a = res.absorbed;
  if (!a) return <>{res.peak > 500 ? 'No absorbent layer beside it, so this sits as free water, above the 500 g/m² commonly used as a limit.' : 'No absorbent layer beside it, so this sits as free water.'}</>;
  return (
    <>
      Soaked into the adjacent absorbent layer(s) it is about {a.pct.toFixed(1)}% moisture by mass, {a.pct > a.crit ? <strong>above</strong> : 'below'} the ~{a.crit.toFixed(0)}% where rot risk begins.
    </>
  );
}

function Verdict({ res }: { res: MoistureResult }) {
  const where = (k: number) => `${res.layers[k - 1].name} / ${res.layers[k].name}`;
  const peakMonth = YEAR_ORDER[res.year1.indexOf(Math.max(...res.year1))];
  return (
    <div className="stack-6" aria-live="polite">
      {res.verdict === 'none' && (
        res.drainedNode >= 0
          ? <p className="small"><strong>No water is held in the wall.</strong> The only condensation is on a cavity face, below.</p>
          : <p className="small"><strong>No interstitial condensation.</strong> Vapour reaches the inside without saturating anywhere.</p>
      )}
      {res.verdict === 'dries' && (
        <p className="small">
          <strong>Condenses, then dries out.</strong> At {where(res.peakNode)}: peak {fmt(res.peak)} g/m² around {MONTHS_FULL[peakMonth]}
          {res.dryMonth !== undefined && <>, dry again by {MONTHS_FULL[res.dryMonth]}</>}. <Absorbed res={res} />
        </p>
      )}
      {res.verdict === 'accumulates' && (
        <p className="small">
          <strong>Builds up year on year.</strong> At {where(res.peakNode)}: peak {fmt(res.peak)} g/m², still {fmt(res.yearN[11])} g/m² after 5 years. Risks rot, frost damage and lost insulation. <Absorbed res={res} />
        </p>
      )}
      <p className="small">
        {res.mouldMonths.length === 0
          ? `Inner surface stays below ${MOULD_RH}% RH: mould unlikely.`
          : <><strong>Mould risk</strong> on the inner surface in {res.mouldMonths.map((m) => MONTHS[m]).join(', ')}.</>}
      </p>
      {res.drainedNode >= 0 && (
        <p className="small">
          <strong>Drained condensation.</strong> About {fmt(res.drainedTotal)} g/m² a year condenses on the cavity face at {where(res.drainedNode)}. It is assumed to run down the cavity and out through the weep holes, so it is not counted as water held in the wall.
        </p>
      )}
      {res.missing.length > 0 && <p className="small muted">No vapour data for {res.missing.join(', ')}; treated as open (µ 1).</p>}
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

  const runs = useMemo(
    () =>
      slots.map((id, i) => {
        const s = library.find((x) => x.id === id);
        if (!s) return null;
        const res = runMoisture({
          layers: layersFromTuples(s.layers), loc, tin, dv, roof: s.orient === 'roof',
          catch: EXPOSURES.find((e) => e.id === exposure)?.catch, footing: FOOTINGS.find((f) => f.id === footing)?.rh,
        });
        return { stackup: s, res, color: SLOT_COLORS[i % SLOT_COLORS.length] };
      }),
    [slots, library, loc, tin, dv, exposure, footing],
  );
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
    { name: r.stackup.name, vals: r.res.year1, col: r.color },
    ...(r.res.verdict === 'accumulates' ? [{ name: `${r.stackup.name} (year 5)`, vals: r.res.yearN, col: r.color, dash: '6 4' }] : []),
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
            <h2>Vapour moving through each wall</h2>
            <p className="muted small">Vapour travels from the side with the higher vapour pressure (the actual amount of water in the air, shown at each end) to the lower, whatever the relative humidity. Where the solid line reaches the dashed one, the air is full and water condenses. Press play to run through the year from October, or drag the slider.</p>
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
        </div>
        <div className="legend" aria-label="Key to the vapour charts">
          <span className="legend-item"><span style={{ display: 'inline-block', width: 24, borderTop: `3px solid ${COL.p}` }} />Actual vapour pressure (what is really in the wall)</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 24, borderTop: `3px dashed ${COL.ps}` }} />Saturation pressure (the most the air can hold at that temperature)</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COL.warn }} />Condensation, with the water held</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #1d5f94' }} />Condensation on a cavity face, assumed to drain away</span>
          <span className="legend-item"><span style={{ display: 'inline-block', width: 24, borderTop: '3px dashed #1d5f94' }} />Vapour flow along the bottom (moving dashes show the direction)</span>
        </div>
        <div className="compare-grid">
          {slots.map((id, i) => {
            const s = library.find((x) => x.id === id);
            const r = runs[i];
            return (
              <div key={i} className="compare-card">
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
                ) : r && <p className="small muted">Every layer is outside a ventilated gap, so there is nothing to analyse.</p>}
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
            sub="Starts in October with a dry wall and runs 5 years. A dashed line means it hadn't dried out by year 5."
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
        Method: monthly steady-state vapour diffusion (Glaser method, as in EN ISO 13788) using typical UK monthly temperature and humidity, with condensate accumulating at layer interfaces and evaporating again when conditions allow. Indoor vapour load is set by the moisture class and shrinks as outdoor temperature rises. It does not model rain, rising damp, air leakage, or moisture stored in absorbent materials such as lime, clay, wood fibre or stone, which matters most in old buildings. Rain and rising damp are vapour sources only: rain raises the vapour pressure at the sun-warmed outer face in proportion to exposure and how absorbent the outer layer is, and rising damp holds the base masonry (outside any insulation) at 85% or 97% humidity. Water is not tracked as liquid, so there is no capillary movement, and the sun-warming uses monthly averages. Layers above 70% humidity use their wet-cup µ, otherwise the dry-cup value. Condensate beside a hygroscopic layer (wood fibre, cork, wool, timber boards) is shown as moisture content, assuming it reaches only 30 mm into the layer; mineral materials like stone, brick and lime are not treated as absorbent. Treat the result as a screening check, not a hygrothermal simulation.
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
