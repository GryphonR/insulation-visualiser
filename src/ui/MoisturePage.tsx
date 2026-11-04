import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { LOCATIONS, MONTHS, MONTHS_FULL } from '../engine/data';
import { layersFromTuples } from '../engine/library';
import type { Stackup } from '../engine/library';
import { clamp } from '../lib/util';
import { EXPOSURES, FOOTINGS, LOADS, MAX_YEARS, MIN_YEARS, MOULD_RH, YEAR_ORDER, psat } from '../engine/moisture';
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
const FLUX_Y = 206;
const COL = { warn: '#b91c1c', p: '#14212b', ps: '#1f6fb2' };
/** Top of the ground moisture chart, m of wall height. */
const FRONT_MAX = 3;

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

/** Wall section up from the ground (outside on the left): ground moisture wicking up the wicking layers and drying out through each face. */
function GroundChart({ res, month }: { res: MoistureResult; month: number }) {
  const m = res.months[month];
  const L = res.layers.length;
  const a = useTween([m.front, m.evapOut, m.evapIn, m.groundWet ? 1 : 0, ...m.sat]);
  const [front, eOut, eIn, wet] = a;
  const sat = a.slice(4, 4 + L);
  const gid = useId();
  const GL = 110, GR = 490, GT = 16, GB = 196; // the wall, and the ground line under it
  const total = res.layers.reduce((s, l) => s + l.t, 0);
  const xs = [0];
  res.layers.forEach((l, i) => xs.push(xs[i] + l.t));
  const x = (mm: number) => GL + ((GR - GL) * mm) / total;
  const y = (h: number) => GB - ((GB - GT) * Math.min(Math.max(h, 0), FRONT_MAX)) / FRONT_MAX;
  const runR = x(xs[res.dampLayers]); // inner edge of the wicking run
  const intoRoom = res.dampLayers === res.layers.length;
  const showing = front > 0.03;
  // Arrow size by mm/day on one fixed scale (1 mm/day is the largest), so walls can be compared side by side.
  const size = (e: number) => clamp(e / 1, 0, 1);
  const thick = (e: number) => 1 + 6 * size(e);
  const len = (e: number) => 6 + 48 * size(e);
  const fmtE = (e: number) => (e >= 1 ? e.toFixed(1) : e.toFixed(2));
  const heights = [0.25, 0.5, 0.75].map((f) => f * front);
  // Blue is calculated wetness on one scale for every wall: clear is dry, solid is saturated. Up the wet zone it follows
  // the engine's taper (Kirchhoff potential ∝ (1 - z/h)², so saturation 1 + 2 ln(1 - z/h) / ln 1000), anchored so each
  // layer matches its simulated saturation at 1 m; above a front lower than 1 m the wall shows its 1 m wetness.
  const shape = (f: number) => (f >= 1 ? 0 : clamp(1 + (2 * Math.log(1 - f)) / 6.9078, 0, 1));
  const op = (s: number) => 0.03 + 0.82 * clamp(s, 0, 1);
  const STOPS = [0, 0.3, 0.6, 0.8, 0.9, 0.96, 1];
  const at1m = front > 1 ? shape(1 / front) : 0;
  const anchor = (i: number) => (at1m > 0.05 ? Math.min(1, sat[i] / at1m) : 1);
  const inRun = (i: number) => i < res.dampLayers && showing;
  const wettest = [...Array(res.dampLayers).keys()].reduce((b, i) => (sat[i] > sat[b] ? i : b), 0);
  const col = '#1d5f94';
  const halo = { stroke: '#fff', strokeWidth: 3, paintOrder: 'stroke' } as const; // keeps labels readable over the arrows
  const arrow = (x1: number, x2: number, yy: number, w: number, key: string) => {
    const dir = x2 > x1 ? 1 : -1;
    return (
      <g key={key}>
        <line x1={x1} x2={x2 - dir * 5} y1={yy} y2={yy} stroke={col} strokeWidth={w} />
        <polygon points={`${x2},${yy} ${x2 - dir * 7},${yy - 3 - w} ${x2 - dir * 7},${yy + 3 + w}`} fill={col} />
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} 240`} role="img" className="svg-fluid"
      aria-label={`Ground moisture in ${MONTHS_FULL[month]}: wicks ${front.toFixed(1)} m up the wall, drying out about ${fmtE(eOut)} mm a day through the outer face and ${fmtE(eIn)} mm a day inward`}>
      <defs>
        {res.layers.map((_, i) => inRun(i) && (
          <linearGradient key={i} id={`${gid}-${i}`} x1="0" y1="1" x2="0" y2="0">
            {STOPS.map((f) => <stop key={f} offset={f} stopColor="#2b7bb9" stopOpacity={op(anchor(i) * shape(f))} />)}
          </linearGradient>
        ))}
      </defs>
      {[2, 3].map((h) => <line key={h} x1={GL} x2={GR} y1={y(h)} y2={y(h)} className="grid" />)}
      {res.layers.map((l, i) => (
        <rect key={i} x={x(xs[i])} y={GT} width={x(xs[i + 1]) - x(xs[i])} height={GB - GT} fill={l.col} opacity={0.35} />
      ))}
      <rect x={GL - 60} y={GB} width={GR - GL + 120} height={14} fill="#8b6b4a" opacity={0.45} />
      <rect x={GL - 60} y={GB} width={GR - GL + 120} height={14} fill="#2b7bb9" opacity={0.6 * wet} />
      <text x={GL - 56} y={GB + 11} className="svt" style={{ fill: '#fff', fontWeight: 600 }}>{wet > 0.5 ? 'wet ground, no DPC' : 'ground dry this month'}</text>
      {res.layers.map((_, i) => (
        <g key={`w${i}`}>
          {inRun(i) && <rect x={x(xs[i])} y={y(front)} width={x(xs[i + 1]) - x(xs[i])} height={GB - y(front)} fill={`url(#${gid}-${i})`} />}
          {(!inRun(i) || front < 1) && sat[i] > 0.005 && (
            <rect x={x(xs[i])} y={GT} width={x(xs[i + 1]) - x(xs[i])} height={(inRun(i) ? y(front) : GB) - GT} fill="#2b7bb9" opacity={op(sat[i])} />
          )}
        </g>
      ))}
      {showing && (
        <g>
          <line x1={GL} x2={runR} y1={y(front)} y2={y(front)} stroke={col} strokeWidth={2} />
          {wet > 0.5 && [0.25, 0.5, 0.75].map((f) => {
            const xx = GL + (runR - GL) * f, top = y(front * 0.85);
            return (
              <g key={f}>
                <line x1={xx} x2={xx} y1={GB - 2} y2={top + 6} stroke={col} strokeWidth={2} strokeDasharray="5 4" className="flux-flow" />
                <polygon points={`${xx},${top} ${xx - 4},${top + 8} ${xx + 4},${top + 8}`} fill={col} />
              </g>
            );
          })}
          {heights.map((h, k) => arrow(GL - 4, GL - 4 - len(eOut), y(h), thick(eOut), `o${k}`))}
          {heights.map((h, k) => arrow(runR + 2, runR + 2 + len(eIn), y(h), thick(eIn), `i${k}`))}
          {/* labels sit above the top arrow, clear of the arrows themselves */}
          <text x={GL - 6} y={y(front * 0.75) - 26} className="svt-end" style={{ fill: col, ...halo }}>dries out</text>
          <text x={GL - 6} y={y(front * 0.75) - 13} className="svt-end" style={{ fill: col, fontWeight: 600, ...halo }}>{fmtE(eOut)} mm/day</text>
          <text x={runR + 6} y={y(front * 0.75) - 26} className="svt" style={{ fill: col, ...halo }}>{intoRoom ? 'dries inward' : 'into the next layer'}</text>
          <text x={runR + 6} y={y(front * 0.75) - 13} className="svt" style={{ fill: col, fontWeight: 600, ...halo }}>{fmtE(eIn)} mm/day</text>
          {/* near 1 m the front label goes under its line, clear of the 1 m label */}
          <text x={GL + 6} y={Math.abs(front - 1) < 0.2 ? y(front) + 13 : Math.max(y(front) - 5, GT + 10)} className="svt" style={{ fill: '#174f7d', fontWeight: 600, ...halo }}>damp front {front.toFixed(1)} m</text>
        </g>
      )}
      <line x1={GL} x2={GR} y1={y(1)} y2={y(1)} stroke={COL.p} strokeWidth={1} strokeDasharray="4 3" />
      {[1, 2, 3].map((h) => (
        <text key={h} x={GR - 4} y={y(h) - 4} className="svt-end" style={{ stroke: '#fff', strokeWidth: 3, paintOrder: 'stroke' }}>{h === 1 ? `1 m (the chart above): ${res.layers[wettest].name} ${Math.round(100 * sat[wettest])}% saturated` : `${h} m`}</text>
      ))}
      <text x={8} y={234} className="svt"><tspan style={{ fontWeight: 600 }}>Outside</tspan></text>
      <text x={W - 8} y={234} className="svt-end"><tspan style={{ fontWeight: 600 }}>Inside</tspan></text>
    </svg>
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
        const f = clamp(Math.abs(g) / 50, 0, 1); // 0..1 in proportion to the flow, 50 g/m²/day is full, so ten times less looks ten times less
        const cx = x((xs[i] + xs[i + 1]) / 2);
        const half = clamp(((x(xs[i + 1]) - x(xs[i])) * 0.85) / 2, 5, 22);
        const dir = g >= 0 ? 1 : -1;
        const tip = cx + dir * half;
        const col = '#1d5f94';
        return (
          <g key={`f${i}`} opacity={0.25 + 0.75 * f}>
            <title>{`${l.name}: ${Math.abs(g) < 0.01 ? 'almost no' : fmt(Math.abs(g)) + ' g/m² per day of'} moisture flow ${dir > 0 ? 'towards the inside' : 'towards the outside'}`}</title>
            <line x1={cx - half} x2={cx + half} y1={FLUX_Y} y2={FLUX_Y} stroke={col} strokeWidth={0.75 + 4.25 * f} strokeDasharray="5 4" className={`flux-flow${dir < 0 ? ' flux-rev' : ''}`} />
            <polygon points={`${tip + dir * 5},${FLUX_Y} ${tip - dir * 1},${FLUX_Y - 4 - 2 * f} ${tip - dir * 1},${FLUX_Y + 4 + 2 * f}`} fill={col} />
          </g>
        );
      })}
      <text x={(PL + PR) / 2} y={FLUX_Y + 22} className="svt-mid">moisture flow (vapour and liquid): thickness in proportion to the amount, hover for the figure</text>
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

/** WTA 6-5 durability checks: frost, the interface behind internal insulation, gypsum. */
function Checks({ res }: { res: MoistureResult }) {
  return <>{res.checks.map((c, i) => {
    const at = c.text.indexOf(':');
    return <p key={i} className="small">{c.level === 'ok' ? c.text : <><strong>{c.text.slice(0, at + 1)}</strong>{c.text.slice(at + 1)}</>}</p>;
  })}</>;
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
          {res.growing
            ? <><strong>Gets wetter year on year.</strong> Most is in the {where(res.peakLayer)}: peak {fmt(res.peak)} g/m², and never below {fmt(res.low)} g/m² even in its driest month, more than the year before. Risks rot, frost damage and lost insulation.</>
            : <><strong>Stays damp all year.</strong> Most is in the {where(res.peakLayer)}: peak {fmt(res.peak)} g/m², and never below {fmt(res.low)} g/m² even in its driest month, but no wetter from one year to the next. That alone does no harm: the checks below say whether it does.</>}
        </p>
      )}
      <Absorbed res={res} />
      <Checks res={res} />
      {res.riseHeight > 0 && (
        <p className="small">
          <strong>Ground moisture</strong> {res.riseHeight < 10 ? <>wicks about {res.riseHeight.toFixed(Math.abs(res.riseHeight - 1) < 0.05 ? 2 : 1)} m up this wall at its highest</> : 'would wick up the full height of this wall'}
          {res.riseLow >= 0.1 ? <>, falling to about {res.riseLow.toFixed(1)} m at its lowest</> : ', draining away when the ground dries'}: as high as evaporation from its faces lets it wick. {res.riseHeight > 1 ? 'The results are for 1 m above the footing.' : 'It stays below 1 m, the height the results are for.'}
        </p>
      )}
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
      {res.overflowLayer >= 0 && (
        <p className="small">
          <strong>Saturated.</strong> The {where(res.overflowLayer)} fills to the most it can soak up, and about {fmt(res.overflowTotal / 1000)} kg/m² a year more runs down out of it. Water running down inside a wall feeds damp at its base and anything built into it.
        </p>
      )}
      {res.missing.length > 0 && <p className="small muted">No vapour data for {res.missing.join(', ')}; treated as open (µ 1).</p>}
      {res.noCapillary.length > 0 && <p className="small muted">No capillary data for {res.noCapillary.join(', ')}; treated as not wicking or storing water.</p>}
      {res.cutAtVent && <p className="small muted">Layers outside the ventilated gap are ignored.</p>}
    </div>
  );
}

interface Props {
  library: Stackup[];
  setCustomStackups: (updater: (prev: Stackup[]) => Stackup[]) => void;
  /** Build-up ids, one per column; shared with the other Simulate views. */
  slots: string[];
  setSlots: (updater: (prev: string[]) => string[]) => void;
  /** Opens the page's build-up picker; shown in place of the column dropdown when there is one build-up. */
  onChangeBuildup: () => void;
}

export function MoisturePage({ library, setCustomStackups, slots, setSlots, onChangeBuildup }: Props) {
  const single = slots.length === 1;
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
          catch: EXPOSURES.find((e) => e.id === exposure)?.catch, footing: FOOTINGS.find((f) => f.id === footing)?.months,
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
          <Eyebrow>Ground moisture at the base of the wall</Eyebrow>
          <ChipGroup label="Ground moisture" items={FOOTINGS} value={footing} onPick={setFooting} text={(f) => f.label} />
        </div>
      </section>

      <section className="card panel">
        <div className="section-head">
          <div>
            <h2>Moisture moving through {single ? 'the' : 'each'} wall</h2>
            <p className="muted small">Vapour travels from the side with the higher vapour pressure (the actual amount of water in the air, shown at each end) to the lower, whatever the relative humidity. Liquid water also moves through materials that wick, like brick, stone and lime, from wetter to drier. Where the solid line reaches the dashed one the material is saturated and can hold liquid water. Each month shows averages from a simulation in two-hour steps. Press play to run through the year from October, or drag the slider.</p>
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
        <div className={single ? 'compare-grid single' : 'compare-grid'}>
          {slots.map((id, i) => {
            const s = library.find((x) => x.id === id);
            const r = runs[i];
            return (
              <div key={i} className="compare-card" style={{ opacity: busy ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                {single ? (
                  <div className="chips">
                    <button type="button" className="btn-secondary" onClick={onChangeBuildup}>Change build-up</button>
                    {s && <button type="button" className="btn-secondary" onClick={() => edit(i, s)}>{s.builtin ? 'Customize a copy' : 'Edit build-up'}</button>}
                  </div>
                ) : (
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
                )}
                {r?.res ? (
                  <>
                    <Verdict res={r.res} />
                    <PressureChart res={r.res} month={month} />
                    {r.res.dampLayers > 0 && (
                      <>
                        <p className="small"><strong>Ground moisture up the wall.</strong> Water from the ground wicks up the layers that can carry it, until it dries out through the faces as fast as it rises. Blue shows how full of water each layer is, on one scale for every wall: clear is dry, solid blue is saturated.</p>
                        <GroundChart res={r.res} month={month} />
                      </>
                    )}
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
        {!single && slots.length < MAX_SLOTS && <button type="button" className="btn-link" onClick={addColumn}>+ Add a build-up to compare</button>}
      </section>

      {withRes.length > 0 && (
        <section aria-label="Charts over the year" className="charts">
          <YearChart
            title="Moisture held in the wall"
            sub={`Liquid water held at each month end, in the last simulated year, once one year repeats the next (${MIN_YEARS} to ${MAX_YEARS} years from October, the first starting at 80% RH). If it never comes back to zero, the wall doesn't dry out. A dashed line is year 1, shown where the wall is still getting wetter.`}
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
        Method: transient heat and moisture transport in the style of EN 15026 (Künzel), stepped every 2 hours through a typical UK year, run again and again until one year repeats the last ({MIN_YEARS} to {MAX_YEARS} years: thick masonry takes longest) built from monthly temperature, humidity and rainfall. Each layer is cut into thin slices. Moisture moves as vapour (by µ) and as capillary liquid, at a rate worked out from each material's water absorption coefficient and free saturation, and is stored along each material's sorption curve. Rain arrives as showers on the outer face, which takes up only as much as its capillarity allows; the rest runs off. Ground moisture is capillary flow up from water at the base of the wall (all year, or November to March) into the outer run of wicking layers. Indoor vapour load is set by the moisture class and shrinks as outdoor temperature rises. "Liquid water held" is water above what each layer holds at 95% RH. Timber and fibre layers are judged for rot over their outer 10 mm. Harm is judged layer by layer as WTA 6-5 does for internal insulation: frost in the part of the masonry that freezes on a −5 °C night (against the same wall without insulation), humidity behind internal insulation, and gypsum. Material data are typical values for each material type, not measured for a product. Not modelled: cracks letting rain past a render, air leakage, freezing, and measured hourly weather. Treat the result as a screening check, not a substitute for a full hygrothermal study.
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
