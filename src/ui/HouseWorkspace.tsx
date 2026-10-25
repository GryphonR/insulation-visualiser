import { useEffect, useMemo, useState } from 'react';
import type { Stackup } from '../engine/library';
import { calcHouse, onStorey, roomPoly } from '../engine/house';
import { centroid } from '../engine/geom';
import type { Pt } from '../engine/geom';
import { planBounds } from './HousePlan';
import type { House, HouseResult } from '../engine/house';
import { defaultHouse } from '../engine/house-default';
import { applyChanges, chain, describe, diff, groupChanges, loadProject, newProject, sanitizeProject, saveProject, steps } from '../engine/house-scenarios';
import type { Change, Project, Scenario } from '../engine/house-scenarios';
import { Chip } from './controls';
import { HouseBills } from './HouseBills';
import { HouseHeating } from './HouseHeating';
import { HouseMoisture } from './HouseMoisture';
import { HouseReport } from './HouseReport';
import { HouseStart } from './HouseStart';
import { HousePage } from './HousePage';
import { HouseRuns } from './HouseRuns';
import './house.css';

type View = 'model' | 'heating' | 'scenarios' | 'compare' | 'runs' | 'bills' | 'moisture' | 'report';
const fmt = (v: number, d = 0) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (v: number, d = 0) => (Math.abs(v) < 0.5 * 10 ** -d ? '0' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v), d)}`);
const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const KIND_LABEL: Record<Scenario['kind'], string> = { base: 'base · the house today', plan: 'plan', whatif: 'what-if' };

export function HouseWorkspace({ customStackups }: { customStackups: Stackup[] }) {
  // Undo / redo over the whole project (board 1f history). Edits typed in a field are grouped by the browser's own input events.
  const [hist, setHist] = useState<{ past: Project[]; now: Project; future: Project[] }>(() => ({ past: [], now: loadProject(), future: [] }));
  const project = hist.now;
  const setProject = (fn: Project | ((p: Project) => Project)) =>
    setHist((h) => {
      const next = typeof fn === 'function' ? fn(h.now) : fn;
      return next === h.now ? h : { past: [...h.past.slice(-49), h.now], now: next, future: [] };
    });
  const undo = () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h));
  useEffect(() => saveProject(project), [project]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [view, setView] = useState<View>('model');
  const [starting, setStarting] = useState(false);
  const active = project.scenarios.find((s) => s.id === project.active) ?? project.scenarios[0];
  const setHouse = (fn: (h: House) => House) =>
    setProject((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === p.active ? { ...s, house: fn(s.house) } : s)) }));
  const setActive = (id: string) => setProject((p) => ({ ...p, active: id }));
  const results = useMemo(() => new Map(project.scenarios.map((s) => [s.id, calcHouse(s.house)])), [project.scenarios]);

  const depth = (s: Scenario) => chain(project, s.id).length - 1;
  const ordered = useMemo(() => {
    const out: Scenario[] = [];
    const walk = (parent: string | null) => project.scenarios.filter((s) => s.parent === parent).forEach((s) => { out.push(s); walk(s.id); });
    walk(null);
    return out;
  }, [project.scenarios]);

  const branch = () => {
    const id = uid();
    setProject((p) => ({ ...p, active: id, scenarios: [...p.scenarios, { id, name: `${active.name} + changes`, kind: 'plan', parent: active.id, house: structuredClone(active.house) }] }));
  };
  const remove = () => {
    if (!active.parent || !confirm(`Delete "${active.name}"? Scenarios built on it move to its parent.`)) return;
    setProject((p) => ({
      ...p, active: active.parent!,
      scenarios: p.scenarios.filter((s) => s.id !== active.id).map((s) => (s.parent === active.id ? { ...s, parent: active.parent } : s)),
    }));
  };
  const patch = (x: Partial<Scenario>) => setProject((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === p.active ? { ...s, ...x } : s)) }));

  return (
    <div className="house">
      <section className="card panel scen-bar">
        <div className="section-head">
          <div>
            <div className="eyebrow">Scenario being edited</div>
            <div className="scen-row">
              <input className="h-text scen-name" value={active.name} aria-label="Scenario name" onChange={(e) => patch({ name: e.target.value })} />
              {active.parent && (
                <select className="select" value={active.kind} aria-label="Scenario kind" onChange={(e) => patch({ kind: e.target.value as Scenario['kind'] })}>
                  <option value="plan">Plan</option><option value="whatif">What-if</option>
                </select>
              )}
            </div>
          </div>
          <div className="chips">
            <button type="button" className="btn-secondary" onClick={branch}>New scenario from this</button>
            {active.parent && <button type="button" className="btn-secondary" onClick={remove}>Delete</button>}
            <button type="button" className="btn-secondary" disabled={!hist.past.length} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
            <button type="button" className="btn-secondary" disabled={!hist.future.length} onClick={redo} title="Redo (Ctrl+Y)">Redo</button>
            <button type="button" className="btn-secondary" onClick={() => setStarting(true)}>New project…</button>
            <button type="button" className="btn-link" onClick={() => { if (confirm('Start again from the demo house? All scenarios will be replaced.')) setProject(newProject(defaultHouse())); }}>Demo house</button>
          </div>
        </div>
        <div className="chips" role="group" aria-label="Scenarios">
          {ordered.map((s) => (
            <Chip key={s.id} on={s.id === active.id} onClick={() => setActive(s.id)}>
              {'· '.repeat(depth(s))}{s.name} <span className="mono small">{fmt((results.get(s.id)?.peakW ?? 0) / 1000, 2)} kW</span>
            </Chip>
          ))}
        </div>
      </section>

      {starting && (
        <HouseStart onCancel={() => setStarting(false)} onCreate={(h) => {
          if (!confirm('Replace the current project (all scenarios) with this new house? Undo can bring it back.')) return;
          setProject(newProject(h));
          setStarting(false);
          setView('model');
        }} />
      )}

      <div role="tablist" aria-label="Whole-house view" className="chips">
        {([['model', 'Model'], ['heating', 'Heating'], ['scenarios', 'Scenarios'], ['compare', 'Compare A vs B'], ['runs', 'Test conditions & year'],
          ['bills', 'Check against bills'], ['moisture', 'Moisture & mould'], ['report', 'Report']] as Array<[View, string]>).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'chip on' : 'chip'} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view === 'model' && <HousePage key={active.id} house={active.house} setHouse={setHouse} customStackups={customStackups} />}
      {view === 'heating' && <HouseHeating key={active.id} house={active.house} setHouse={setHouse} />}
      {view === 'scenarios' && <ScenariosView project={project} active={active} results={results} ordered={ordered} setProject={setProject} />}
      {view === 'compare' && <CompareView project={project} results={results} ordered={ordered} />}
      {view === 'runs' && <HouseRuns key={active.id} house={active.house} setHouse={setHouse} project={project} ordered={ordered} />}
      {view === 'bills' && <HouseBills key={active.id} house={active.house} setHouse={setHouse} />}
      {view === 'moisture' && <HouseMoisture key={active.id} house={active.house} />}
      {view === 'report' && <HouseReport house={active.house} scenarioName={active.name} project={project}
        onImport={(p) => { const q = sanitizeProject(p); if (q) setProject(q); else alert('That file has no usable scenarios.'); }} />}
    </div>
  );
}

function ScenariosView({ project, active, results, ordered, setProject }: {
  project: Project; active: Scenario; results: Map<string, HouseResult>; ordered: Scenario[]; setProject: (fn: (p: Project) => Project) => void;
}) {
  const parent = project.scenarios.find((s) => s.id === active.parent);
  // A new or removed room is one switchable step together with its windows, emitters and face choices.
  const own = useMemo(() => (parent ? groupChanges(diff(parent.house, active.house)) : []), [parent, active.house]);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const enabled = useMemo(() => own.filter((c) => !off[c.key]), [own, off]);
  const fall = useMemo(() => (parent ? steps(parent.house, enabled) : []), [parent, enabled]);
  const enabledFlat = useMemo(() => enabled.flatMap((g) => g.changes), [enabled]);
  const effective = parent && enabled.length !== own.length ? calcHouse(applyChanges(parent.house, enabledFlat)) : results.get(active.id)!;
  const inherited: Array<{ c: Change; from: Scenario; a: House; b: House }> = [];
  const anc = chain(project, active.id);
  for (let i = 1; i < anc.length - 1; i++) diff(anc[i - 1].house, anc[i].house).forEach((c) => inherited.push({ c, from: anc[i], a: anc[i - 1].house, b: anc[i].house }));
  const base = results.get(ordered[0]?.id ?? '')!;

  const cols = ordered.map((s) => ({ s, r: results.get(s.id)! }));
  const rowsM: Array<[string, (r: HouseResult) => number, number, string]> = [
    ['Peak heat loss, kW', (r) => r.peakW / 1000, 2, ''],
    ['Space heating, kWh/yr', (r) => r.annualKWh, 0, '%'],
    ['Heat loss parameter, W/m²K', (r) => r.hlp, 2, ''],
    ['Heat pump spare, %', (r) => r.hp.spare * 100, 0, ''],
    ['SCOP', (r) => r.hp.scop, 2, ''],
    ['Running cost, £/yr', (r) => r.hp.costHP, 0, '%'],
  ];
  const lo = Math.min(...fall.map((f) => f.kwh), Infinity) * 0.9, hi = Math.max(...fall.map((f) => f.kwh), 1);
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;

  return (
    <div className="house-grid">
      <div className="house-col">
        <section className="card panel">
          <h2>Scenario tree</h2>
          <p className="muted small">Each scenario starts as a copy of its parent. Edit it in the Model view; its changes are listed here.</p>
          <div className="tree">
            {ordered.map((s) => {
              const r = results.get(s.id)!;
              return (
                <button key={s.id} type="button" className={s.id === active.id ? 'node on' : 'node'} style={{ marginLeft: (chain(project, s.id).length - 1) * 18 }}
                  onClick={() => setProject((p) => ({ ...p, active: s.id }))}>
                  <span><b>{s.name}</b><br /><span className="small muted">{KIND_LABEL[s.kind]}</span></span>
                  <span className="mono small">{fmt(r.peakW / 1000, 2)} kW<br />{fmt(Math.round(r.annualKWh / 10) * 10)} kWh</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="card panel">
          <h2>All scenarios</h2>
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th />{cols.map(({ s }) => <th key={s.id} className={s.id === active.id ? 'n hl' : 'n'}>{s.name}</th>)}</tr></thead>
              <tbody>
                {rowsM.map(([label, f, d, mode]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {cols.map(({ s, r }) => {
                      const v = f(r), b = f(base), dv = mode === '%' ? ((v - b) / (b || 1)) * 100 : v - b;
                      return <td key={s.id} className={s.id === active.id ? 'n mono hl' : 'n mono'}>{fmt(v, d)}{s.parent && <span className="muted small"> {sgn(dv, mode === '%' ? 0 : d)}{mode}</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="house-col">
        <section className="card panel">
          <h2>Changes in {active.name}</h2>
          {!parent ? <p className="muted small">The base scenario is the house as it is. Make a new scenario from it to try changes.</p> : <>
            <p className="muted small">Switch a change off to see the scenario without it. Figures are each change's effect in the order listed.</p>
            {own.length === 0 && <p className="small">No changes yet: edit this scenario in the Model view.</p>}
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th /><th>Change</th><th>From</th><th>To</th><th className="n">Peak W</th><th className="n">kWh/yr</th></tr></thead>
                <tbody>
                  {own.map((c) => {
                    const d0 = describe(c.head, parent.house, active.house), k = enabled.indexOf(c);
                    const d = c.extra ? { ...d0, what: `${d0.what} (with ${c.extra} linked change${c.extra > 1 ? 's' : ''}: windows, emitters, faces)` } : d0;
                    const dw = k >= 0 ? fall[k + 1].peakW - fall[k].peakW : 0, dk = k >= 0 ? fall[k + 1].kwh - fall[k].kwh : 0;
                    return (
                      <tr key={c.key} className={off[c.key] ? 'off' : ''}>
                        <td><input type="checkbox" checked={!off[c.key]} aria-label={`Include ${d.what}`} onChange={() => setOff((o) => ({ ...o, [c.key]: !o[c.key] }))} /></td>
                        <td>{d.what}</td><td className="muted">{d.from}</td><td>{d.to}</td>
                        <td className={`n mono ${dw < 0 ? 'good' : ''}`}>{k >= 0 ? sgn(dw) : '—'}</td>
                        <td className={`n mono ${dk < 0 ? 'good' : ''}`}>{k >= 0 ? sgn(dk) : '—'}</td>
                      </tr>
                    );
                  })}
                  {inherited.map(({ c, from, a, b }) => {
                    const d = describe(c, a, b);
                    return <tr key={`${from.id}:${c.key}`} className="inh"><td /><td>{d.what}</td><td className="muted">{d.from}</td><td>{d.to}</td><td colSpan={2} className="small muted">from {from.name}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="small mono">With the changes switched on: {fmt(effective.peakW)} W, {fmt(effective.annualKWh)} kWh/yr ({sgn(effective.peakW - results.get(parent.id)!.peakW)} W against {parent.name}).</p>
            {Object.values(off).some(Boolean) && (
              <button type="button" className="btn-secondary" onClick={() => {
                setProject((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === active.id ? { ...s, house: applyChanges(parent.house, enabledFlat) } : s)) }));
                setOff({});
              }}>Remove the switched-off changes from this scenario</button>
            )}
          </>}
        </section>
        {parent && fall.length > 1 && (
          <section className="card panel">
            <h2>Step by step</h2>
            <p className="muted small">Space heating from {parent.name}, adding each change in turn.</p>
            <div className="fall">
              {[{ label: parent.name, v: fall[0].kwh, d: null as number | null }, ...enabled.map((c, i) => ({ label: describe(c.head, parent.house, active.house).what, v: fall[i + 1].kwh, d: fall[i + 1].kwh - fall[i].kwh })), { label: active.name, v: fall[fall.length - 1].kwh, d: null }].map((f, i, arr) => {
                const prev = i > 0 && f.d != null ? arr[i - 1].v : null;
                const l = prev == null ? 0 : pos(Math.min(prev, f.v)), w = prev == null ? pos(f.v) : Math.max(0.5, Math.abs(pos(prev) - pos(f.v)));
                return (
                  <div key={i} className="path">
                    <span className="small">{f.label}</span>
                    <span className="path-bar"><span style={{ marginLeft: `${l}%`, width: `${w}%` }} className={f.d == null ? (i ? 'end' : '') : f.d <= 0 ? 'down' : 'up'} /></span>
                    <span className="mono small n">{f.d == null ? fmt(f.v) : sgn(f.d)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const mix = (a: number[], b: number[], f: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, f)))).join(',')})`;

function CompareView({ project, results, ordered }: { project: Project; results: Map<string, HouseResult>; ordered: Scenario[] }) {
  const [aId, setA] = useState(ordered[0]?.id ?? '');
  const [bId, setB] = useState(ordered.find((s) => s.id === project.active && s.parent)?.id ?? ordered[1]?.id ?? ordered[0]?.id ?? '');
  const [mode, setMode] = useState<'A' | 'B' | 'diff' | 'split'>('diff');
  const [storey, setStorey] = useState(0);
  const [sel, setSel] = useState('');
  const A = project.scenarios.find((s) => s.id === aId) ?? ordered[0], B = project.scenarios.find((s) => s.id === bId) ?? ordered[0];
  const rA = results.get(A.id)!, rB = results.get(B.id)!;
  const changes = useMemo(() => diff(A.house, B.house), [A.house, B.house]);
  const rowOf = (r: HouseResult, id: string) => r.rooms.find((x) => x.room.id === id);

  const plan = (h: House, r: HouseResult, kind: 'A' | 'B' | 'diff', scale: number) => {
    const S = scale, PAD = 16, bb = planBounds(h);
    const to = (p: Pt): Pt => [PAD + (p[0] - bb.minX) * S, PAD + (p[1] - bb.minY) * S];
    const pts = (p: Pt[]) => p.map((q) => to(q).join(',')).join(' ');
    return (
      <svg className="plan" viewBox={`0 0 ${(bb.maxX - bb.minX) * S + PAD * 2} ${(bb.maxY - bb.minY) * S + PAD * 2}`}>
        {h.rooms.filter((x) => onStorey(x, storey)).map((room) => {
          const a = rowOf(rA, room.id), b = rowOf(rB, room.id), me = rowOf(r, room.id);
          let fill = '#fff', label = '';
          if (kind === 'diff') {
            const d = a && b && room.heated ? b.totalW - a.totalW : null;
            fill = d == null ? '#eceff1' : d < -1 ? mix([255, 254, 251], [143, 199, 160], -d / 300) : d > 1 ? mix([255, 254, 251], [233, 150, 95], d / 300) : '#fffefb';
            label = d == null ? (room.heated ? 'only in one' : 'unheated') : Math.abs(d) < 1 ? 'no change' : `${sgn(d)} W`;
          } else if (me) {
            fill = room.heated ? mix([247, 239, 225], [233, 150, 95], (me.perM2 - 20) / 70) : '#eceff1';
            label = room.heated ? `${fmt(me.totalW)} W` : `${fmt(me.T, 1)} °C`;
          }
          const c = to(centroid(roomPoly(room)));
          return (
            <g key={room.id} className="plan-room" onClick={() => setSel(room.id)}>
              <polygon points={pts(roomPoly(room))} fill={fill} stroke="#14212b" strokeWidth={1.5} />
              <text x={c[0]} y={c[1] - 3} textAnchor="middle" className="plan-t">{room.name}</text>
              <text x={c[0]} y={c[1] + 13} textAnchor="middle" className="plan-s">{label}</text>
            </g>
          );
        })}
        {h.rooms.filter((x) => x.id === sel && onStorey(x, storey)).map((x) => (
          <polygon key="sel" points={pts(roomPoly(x))} fill="none" stroke="#c2410c" strokeWidth={3} pointerEvents="none" />
        ))}
      </svg>
    );
  };

  const ra = rowOf(rA, sel), rb = rowOf(rB, sel);
  const detail: Array<[string, number | undefined, number | undefined, number, boolean]> = [
    ['Heat loss, W', ra?.totalW, rb?.totalW, 0, true],
    ['Per m², W', ra?.perM2, rb?.perM2, 0, true],
    ['Fabric, W', ra?.fabricW, rb?.fabricW, 0, true],
    ['Ventilation, W', ra?.ventW, rb?.ventW, 0, true],
    ['Air changes, ach', ra?.n, rb?.n, 2, true],
    ['Temperature, °C', ra?.T, rb?.T, 1, false],
  ];
  const storeys = A.house.storeys.length >= B.house.storeys.length ? A.house.storeys : B.house.storeys;

  return (
    <div className="house-grid">
      <div className="house-col">
        <section className="card panel">
          <div className="section-head">
            <div className="hf-row">
              <label className="hf"><span className="eyebrow">A</span>
                <select className="select" value={A.id} onChange={(e) => setA(e.target.value)}>{ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
              <label className="hf"><span className="eyebrow">B</span>
                <select className="select" value={B.id} onChange={(e) => setB(e.target.value)}>{ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
            </div>
            <div className="chips">{storeys.map((s, i) => <Chip key={i} on={storey === i} onClick={() => setStorey(i)}>{s.name}</Chip>)}</div>
          </div>
          <div className="chips" role="group" aria-label="Show">
            {([['A', 'A only'], ['B', 'B only'], ['diff', 'Difference'], ['split', 'Side by side']] as const).map(([m, l]) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{l}</Chip>)}
          </div>
          <p className="small muted">{mode === 'diff' ? 'Green rooms lose less heat in B, orange more.' : mode === 'split' ? 'Same scale and colours: A on the left, B on the right.' : `Heat loss per room in ${mode === 'A' ? A.name : B.name}.`}</p>
          {mode === 'split'
            ? <div className="split">{plan(A.house, rA, 'A', 34)}{plan(B.house, rB, 'B', 34)}</div>
            : plan(mode === 'A' ? A.house : B.house, mode === 'A' ? rA : rB, mode === 'diff' ? 'diff' : mode, 48)}
          <p className="small mono">A {fmt(rA.peakW)} W · B {fmt(rB.peakW)} W · {sgn(rB.peakW - rA.peakW)} W · {sgn(rB.annualKWh - rA.annualKWh)} kWh/yr</p>
        </section>
      </div>
      <div className="house-col">
        <section className="card panel">
          <h2>{(ra ?? rb)?.room.name ?? 'Click a room'}</h2>
          {(ra || rb) && (
            <table className="h-table">
              <thead><tr><th /><th className="n">A</th><th className="n">B</th><th className="n">B − A</th></tr></thead>
              <tbody>
                {detail.map(([l, a, b, d, downGood]) => {
                  const dv = a != null && b != null ? b - a : null;
                  const cls = dv == null || Math.abs(dv) < 10 ** -d / 2 ? '' : (dv < 0) === downGood ? 'good' : 'bad';
                  return <tr key={l}><td>{l}</td><td className="n mono">{a == null ? '—' : fmt(a, d)}</td><td className="n mono">{b == null ? '—' : fmt(b, d)}</td><td className={`n mono ${cls}`}>{dv == null ? '—' : sgn(dv, d)}</td></tr>;
                })}
              </tbody>
            </table>
          )}
        </section>
        <section className="card panel">
          <h2>What B changes</h2>
          {changes.length === 0 ? <p className="small muted">A and B are the same house.</p> : (
            <table className="h-table">
              <thead><tr><th>Change</th><th>A</th><th>B</th></tr></thead>
              <tbody>{changes.map((c) => { const d = describe(c, A.house, B.house); return <tr key={c.key}><td>{d.what}</td><td className="muted">{d.from}</td><td>{d.to}</td></tr>; })}</tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
