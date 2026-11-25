// Heating schematic: the heat source, every pipe run and the emitters as a 2D flow-and-return diagram, with the valves and
// the modes that set them (board 3b). The chosen mode is animated; exportable as SVG or PNG.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SOURCE_LABEL, isHeatPump } from '../engine/house';
import type { House } from '../engine/house';
import { EMITTER_NAME, RAD_LABEL, coolingOn, emitterCool, given } from '../engine/house-heating';
import { PLANS, applyPlan, controlChecks, markCustom, modeSummary, modesOf, passes, posOf, reach, runUse, teeOf } from '../engine/house-controls';
import type { Mode, PlanKind, Pos, Use, Valve, Water } from '../engine/house-controls';
import { endsOnHeater, runLength, sizePipes } from '../engine/house-pipes';
import type { Pipe } from '../engine/house-pipes';
import { download } from '../lib/util';
import { Chip } from './controls';
import { Num, SheetNum, fmt } from './hform';
import { useProject } from './project';
import { href } from './route';

const INK = '#14212b', MUTED = '#5b6770', BAD = '#b91c1c', IDLE = '#c5ccd3', FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
/** Flow and return colours by what the water is doing. */
// Flow, then return: each return a paler shade of its own flow, so a heating return never reads as chilled water.
const COL: Record<Use, [string, string]> = { heat: ['#c2410c', '#eea47f'], dhw: ['#d97706', '#f2c57c'], cool: ['#0284c7', '#86c8ea'], idle: [IDLE, IDLE] };
const TINT: Record<Use, string> = { heat: '#fde2d4', dhw: '#fde9c4', cool: '#d7ecfb', idle: '#fff' };
const O = 4, ROW = 64, STEP = 150, X0 = 170, TOP = 96, LABEL_W = 260;
const WATER: Record<Water, string> = { hot: 'Hot', chilled: 'Chilled', off: 'Off' };
const POS_LABEL: Record<Pos, string> = { open: 'Open', shut: 'Shut', A: 'Port A', B: 'Port B', AB: 'A + B' };

// Kept inside the SVG so an exported file animates too. Dots run out along the flow and back along the return.
const CSS = `
.sx-line { transition: stroke .5s ease; }
.sx-fill { transition: fill .5s ease; }
.sx-dots { stroke-dasharray: 2 10; stroke-linecap: round; animation: sx-move 1s linear infinite; }
.sx-dots.back { animation-direction: reverse; }
.sx-gate { transition: transform .45s ease; }
.sx-spin { animation: sx-spin 1.6s linear infinite; transform-box: fill-box; transform-origin: center; }
.sx-pulse { animation: sx-pulse 1.4s ease-in-out infinite; }
.sx-run { cursor: default; }
.sx-run.pick { cursor: copy; }
.sx-run.pick:hover .sx-hit, .sx-run.drop .sx-hit { stroke: rgba(2,132,199,.18); }
.sx-valve { cursor: grab; }
@keyframes sx-move { to { stroke-dashoffset: -24; } }
@keyframes sx-spin { to { transform: rotate(360deg); } }
@keyframes sx-pulse { 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .sx-dots, .sx-spin, .sx-pulse { animation: none; } .sx-line, .sx-fill, .sx-gate { transition: none; } }
`;

interface Node { p: Pipe; depth: number; y: number; px: number; py: number }

/** Tree layout: each emitter or dead end gets a row; a branch sits level with its own emitter, else midway between its runs. */
export function layoutPipes(h: House): { nodes: Node[]; rows: number; maxDepth: number; srcY: number } {
  const pipes = h.heating.pipes ?? [], ids = new Set(pipes.map((p) => p.id));
  const storeyOf = (p: Pipe) => p.leg?.storey ?? h.rooms.find((r) => r.id === h.heating.emitters.find((e) => e.id === p.emitter)?.room)?.storey ?? 0;
  // Upper floors above, so the diagram reads like the house.
  // A riser climb or a drop only shows pipes changing level: left out, what comes off it shows off the run before (unless a valve is on it).
  const hidden = (p: Pipe) => !p.leg && (!!p.drop || p.rise != null) && !valvesOn(h, p.id).length;
  const kids = (id: string | null): Pipe[] => pipes.filter((c) => (id === null ? !c.parent || !ids.has(c.parent) : c.parent === id))
    .flatMap((c) => (hidden(c) ? kids(c.id) : [c])).sort((a, b) => storeyOf(b) - storeyOf(a));
  const nodes: Node[] = [];
  let row = 0, maxDepth = 0;
  const place = (p: Pipe, depth: number, seen: Set<string>): Node | null => {
    if (seen.has(p.id) || depth > 50) return null;
    seen.add(p.id);
    maxDepth = Math.max(maxDepth, depth);
    const n: Node = { p, depth, y: 0, px: 0, py: 0 };
    nodes.push(n);
    const own = endsOnHeater(p) || !kids(p.id).length ? row++ : -1;
    const ks = kids(p.id).map((c) => place(c, depth + 1, seen)).filter((x): x is Node => !!x);
    n.y = own >= 0 ? own : (ks[0].y + ks[ks.length - 1].y) / 2;
    for (const k of ks) { k.px = depth; k.py = n.y; }
    return n;
  };
  // Groups not joined to the source go last, each starting on its own row rather than from the source.
  const roots = kids(null).sort((a, b) => +!!a.loose - +!!b.loose).map((p) => place(p, 0, new Set())).filter((x): x is Node => !!x), fed = roots.filter((r) => !r.p.loose);
  const srcY = fed.length ? (fed[0].y + fed[fed.length - 1].y) / 2 : 0;
  for (const r of roots) { r.px = -1; r.py = r.p.loose ? r.y : srcY; }
  return { nodes, rows: row, maxDepth, srcY };
}

/** The valves on a run, each with the port it gates there (2-port valves: A). */
export function valvesOn(h: House, run: string): Array<{ v: Valve; port: 'A' | 'B' }> {
  return (h.heating.controls?.valves ?? []).flatMap((v): Array<{ v: Valve; port: 'A' | 'B' }> => (v.runs.includes(run) ? [{ v, port: 'A' as const }] : v.b?.includes(run) ? [{ v, port: 'B' as const }] : []));
}

/** Move a valve's port from one run to another, or add a run to it (from null), or take one off (to null) (edits h in place). */
export function moveValve(h: House, id: string, port: 'A' | 'B', from: string | null, to: string | null): void {
  const v = h.heating.controls?.valves.find((x) => x.id === id);
  if (!v) return;
  const list = port === 'B' ? (v.b ??= []) : v.runs;
  const next = list.filter((r) => r !== from && r !== to);
  if (to) next.push(to);
  if (port === 'B') v.b = next; else v.runs = next;
  // A run is on one port of a valve, not both.
  if (to) { if (port === 'B') v.runs = v.runs.filter((r) => r !== to); else if (v.b) v.b = v.b.filter((r) => r !== to); }
  markCustom(h);
}

const short = (s: string) => s.replace(' (microbore)', '');

export function HouseSchematic() {
  const { house: h, res, active, upd } = useProject();
  const svgRef = useRef<SVGSVGElement>(null);
  const modes = modesOf(h);
  const [modeId, setModeId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pick, setPick] = useState<{ v: string; port: 'A' | 'B' } | null>(null);
  const [drag, setDrag] = useState<{ v: string; port: 'A' | 'B'; from: string; over: string | null } | null>(null);
  const [plan, setPlan] = useState<PlanKind>((h.heating.controls?.plan !== 'custom' && h.heating.controls?.plan) || (isHeatPump(h.hp.source) ? 'hp' : h.heating.cylinder ? 'y' : 'combi'));
  const [msg, setMsg] = useState('');
  const m = modes.find((x) => x.id === modeId) ?? modes.find((x) => x.water !== 'off') ?? modes[0];

  // Play steps through the modes.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setModeId((cur) => { const i = modes.findIndex((x) => x.id === (cur ?? m.id)); return modes[(i + 1) % modes.length].id; }), 2600);
    return () => clearInterval(t);
  }, [playing, modes, m.id]);
  // Drop a dragged valve on the run under the pointer.
  useEffect(() => {
    if (!drag) return;
    // The run under the pointer where it is let go (hover can miss a fast drag).
    const up = (ev: PointerEvent) => {
      const to = (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-run]') as SVGElement | null)?.dataset.run ?? drag.over;
      if (to && to !== drag.from) upd((x) => moveValve(x, drag.v, drag.port, drag.from, to));
      setDrag(null);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [drag, upd]);

  const sized = sizePipes(h, res), byId = new Map(sized.rows.map((r) => [r.pipe.id, r]));
  const now = sized.modes.find((x) => x.id === m.id), vNow = now?.v;
  const use = runUse(h, m), got = reach(h, m), running = m.water !== 'off';
  const { nodes, rows, maxDepth, srcY } = layoutPipes(h);
  const hp = isHeatPump(h.hp.source), ctl = h.heating.controls, cool = h.heating.cooling;
  const xOf = (d: number) => X0 + (d + 1) * STEP, yOf = (r: number) => TOP + r * ROW;
  const xE = xOf(maxDepth) + 24; // every emitter in one column
  const looseTops = nodes.filter((n) => n.p.loose && n.px < 0), loops = nodes.filter((n) => n.p.loop), notes = +!!looseTops.length + +!!loops.length;
  const W = xE + 60 + LABEL_W, H = TOP + Math.max(1, rows) * ROW + 110 + notes * 18;
  const roomOf = (id: string) => h.rooms.find((r) => r.id === id);
  const flowT = res.heat.designFlow, dT = h.heating.dT;
  const totalW = sized.rows.filter((r) => !r.pipe.parent && !r.pipe.loose).reduce((t, r) => t + r.loadW, 0);
  const name = `${active.name.replace(/[^\w-]+/g, '_')}-heating-schematic`;
  const checks = controlChecks(h);
  const edit = (fn: (x: House) => void) => upd((x) => { fn(x); markCustom(x); });

  const svgText = () => new XMLSerializer().serializeToString(svgRef.current!);
  const savePng = () => {
    const img = new Image(), url = URL.createObjectURL(new Blob([svgText()], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * 2; c.height = H * 2;
      const g = c.getContext('2d')!;
      g.scale(2, 2); g.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png'); a.download = `${name}.png`; a.click();
    };
    img.src = url;
  };

  const symbol = (n: Node, x: number, y: number): ReactNode => {
    const p = n.p, e = h.heating.emitters.find((x) => x.id === p.emitter), u = use.get(p.id) ?? 'idle';
    const stroke = { stroke: INK, strokeWidth: 1.5, fill: TINT[u], className: 'sx-fill' };
    if (!e && p.ends?.[1] === 'cylinder') return <g>
      <rect x={x} y={y - 24} width={30} height={48} rx={10} {...stroke} />
      <path d={`M${x} ${y - O} h8 l14 5 l-14 5 l14 5 M${x} ${y + O} h8`} stroke={INK} fill="none" />
    </g>;
    // A UFH manifold: a bar with its loops' ports.
    if (!e && p.ends?.[1]?.startsWith('m:')) return <g>
      <rect x={x} y={y - 7} width={36} height={14} rx={2} {...stroke} />
      <path d={[8, 16, 24, 32].map((d) => `M${x + d - 2} ${y + 7} v6`).join(' ')} stroke={INK} strokeWidth={1.5} />
    </g>;
    if (!e) return <circle cx={x + 4} cy={y} r={4} fill={INK} />;
    if (e.kind === 'ufh') return <g>
      <rect x={x + 4} y={y - 14} width={34} height={28} rx={3} {...stroke} stroke="none" />
      <path d={`M${x} ${y - O} h6 v-12 h30 v6 h-26 v6 h26 v6 h-26 v6 h26 v6 h-30 v-12 h-6`} stroke={INK} strokeWidth={1.3} fill="none" />
    </g>;
    if (e.kind === 'towel') return <g>
      <rect x={x + 4} y={y - 20} width={26} height={40} {...stroke} stroke="none" />
      <path d={`M${x + 4} ${y - 20} v40 M${x + 30} ${y - 20} v40 ${[-14, -6, 2, 10, 18].map((d) => `M${x + 4} ${y + d} H${x + 30}`).join(' ')}`} stroke={INK} strokeWidth={1.5} fill="none" />
    </g>;
    if (e.kind === 'fancoil') return <g>
      <rect x={x} y={y - 16} width={40} height={32} rx={4} {...stroke} />
      <g className={u !== 'idle' ? 'sx-spin' : undefined}><circle cx={x + 20} cy={y} r={10} fill="none" stroke={INK} strokeWidth={1} /><path d={`M${x + 20} ${y} l0 -9 M${x + 20} ${y} l8 5 M${x + 20} ${y} l-8 5`} stroke={INK} strokeWidth={1.6} /></g>
    </g>;
    return <g>
      <rect x={x} y={y - 16} width={40} height={32} {...stroke} />
      <path d={[8, 16, 24, 32].map((d) => `M${x + d} ${y - 12} v24`).join(' ')} stroke={INK} strokeWidth={0.8} />
    </g>;
  };

  const label = (n: Node, x: number, y: number): ReactNode => {
    const p = n.p, e = h.heating.emitters.find((x) => x.id === p.emitter), r = byId.get(p.id);
    const room = e ? roomOf(e.room) : undefined, storey = h.storeys[room?.storey ?? p.leg?.storey ?? -1]?.name;
    const zone = e && h.heating.zones.find((z) => z.id === e.zone);
    // A UFH zone's loop runs through each of its rooms.
    const parts = e?.fromZone ? h.heating.emitters.filter((x) => x.fromZone === e.fromZone) : [];
    const what = !e ? (p.ends?.[1] === 'cylinder' ? 'Hot water cylinder coil' : p.name) : e.kind === 'ufh' ? `UFH loop · ${fmt(parts.length ? parts.reduce((a, x) => a + x.area, 0) : e.area, 1)} m² · ${e.spacing} mm${parts.length > 1 ? ` · ${parts.map((x) => roomOf(x.room)?.name ?? x.room).join(', ')}` : ''}` : e.kind === 'radiator' ? `${RAD_LABEL[e.type]} · ${e.len}×${e.height}` : `${EMITTER_NAME[e.kind]} · ${fmt(e.rated)} W at ΔT50`;
    const coolW = e && m.water === 'chilled' && got.emitters.has(e.id) && cool ? emitterCool(e, cool.flow, cool.setpoint, h) : 0;
    return <g fontFamily={FONT}>
      <text x={x} y={y - 6} fontSize={12} fontWeight={600} fill={INK}>{room?.name ?? (e ? e.room : what)}{storey ? <tspan fill={MUTED} fontWeight={400}> · {storey}</tspan> : null}</text>
      <text x={x} y={y + 9} fontSize={10.5} fill={MUTED}>{e ? what : ''}{coolW > 0 ? ` · cools ${fmt(coolW)} W` : r && r.loadW > 0 ? `${e ? ' · ' : ''}${fmt(r.loadW)} W` : ''}{zone ? ` · ${zone.name}${zone.kind === 'ufh' && zone.blend ? `, blended to ${zone.blend} °C` : ''}` : ''}</text>
    </g>;
  };

  /** A valve on the flow line: a bowtie, filled when shut, with a gate bar that turns along the pipe when it opens. */
  const valveMark = (v: Valve, port: 'A' | 'B', run: string, cx: number, cy: number): ReactNode => {
    const open = running && passes(v, posOf(v, m), run), sel = pick?.v === v.id;
    return <g key={`${v.id}${port}`} className="sx-valve" role="button" aria-label={`${v.id} ${v.name}${v.kind === 'three' ? `, port ${port}` : ''}: ${open ? 'open' : 'shut'}. Drag to another run.`}
      onPointerDown={(ev) => { ev.preventDefault(); setDrag({ v: v.id, port, from: run, over: null }); }}
      onClick={() => setPick(sel ? null : { v: v.id, port })}>
      {sel && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#0284c7" strokeWidth={2} />}
      <path d={`M${cx - 8} ${cy - 6} L${cx + 8} ${cy + 6} L${cx + 8} ${cy - 6} L${cx - 8} ${cy + 6} Z`} fill={open ? '#fff' : INK} stroke={INK} strokeWidth={1.3} className="sx-fill" />
      {v.kind === 'three' && <path d={`M${cx} ${cy} v10 M${cx - 4} ${cy + 10} h8`} stroke={INK} strokeWidth={1.3} />}
      <rect x={cx - 1.2} y={cy - 7} width={2.4} height={14} fill={open ? '#16a34a' : BAD} className="sx-gate sx-fill" style={{ transform: `rotate(${open ? 90 : 0}deg)`, transformOrigin: `${cx}px ${cy}px` }} />
      <path d={`M${cx} ${cy - 6} v-4`} stroke={INK} strokeWidth={1.2} />
      <rect x={cx - 5} y={cy - 16} width={10} height={6} rx={1} fill="#fff" stroke={INK} strokeWidth={1} />
      <text x={cx} y={cy - 19} textAnchor="middle" fontFamily={FONT} fontSize={9.5} fontWeight={600} fill={INK}>{v.id}{v.kind === 'three' ? ` ${port}` : ''}</text>
    </g>;
  };

  // A 3-port sits where its two port runs leave one junction: drawn once there, each port on its own leg.
  const nodeOf = new Map(nodes.map((n) => [n.p.id, n]));
  const tees = (ctl?.valves ?? []).flatMap((v) => {
    const t = v.kind === 'three' ? teeOf(h, v) : null, na = t && nodeOf.get(t.a.id), nb = t && nodeOf.get(t.b.id);
    if (!t || !na || !nb) return [];
    const x = (na.px < 0 ? X0 : xOf(na.px)) + O, y = yOf(na.py) - O;
    const dir = (n: Node): [number, number] => { const d = Math.sign(yOf(n.y) - yOf(n.py)); return d ? [0, d] : [1, 0]; };
    const legs = [{ port: 'A' as const, run: t.a.id, d: dir(na) }, { port: 'B' as const, run: t.b.id, d: dir(nb) }];
    // Both legs leave the same way (more runs off this junction): no clear tee to draw, so mark each run instead.
    return legs[0].d.join() === legs[1].d.join() ? [] : [{ v, x, y, legs }];
  });
  const atTee = new Set(tees.map((t) => t.v.id));
  const tri = (x: number, y: number, [dx, dy]: [number, number]) => `M${x} ${y} L${x + 12 * dx - 6 * dy} ${y + 12 * dy + 6 * dx} L${x + 12 * dx + 6 * dy} ${y + 12 * dy - 6 * dx} Z`;
  const teeMark = ({ v, x, y, legs }: (typeof tees)[number]): ReactNode => <g key={v.id}>
    {pick?.v === v.id && <circle cx={x} cy={y} r={19} fill="none" stroke="#0284c7" strokeWidth={2} />}
    <path d={tri(x, y, [-1, 0])} fill="#fff" stroke={INK} strokeWidth={1.3} />
    {legs.map(({ port, run, d }) => {
      const open = running && passes(v, posOf(v, m), run);
      return <g key={port} className="sx-valve" role="button" aria-label={`${v.id} ${v.name}, port ${port}: ${open ? 'open' : 'shut'}. Drag to another run.`}
        onPointerDown={(ev) => { ev.preventDefault(); setDrag({ v: v.id, port, from: run, over: null }); }}
        onClick={() => setPick(pick?.v === v.id && pick.port === port ? null : { v: v.id, port })}>
        <path d={tri(x, y, d)} fill={open ? '#fff' : INK} stroke={INK} strokeWidth={1.3} className="sx-fill" />
        <text x={x + 20 * d[0] + (d[0] ? 0 : 9)} y={y + 20 * d[1] + 3.5} textAnchor={d[0] ? 'middle' : 'start'} fontFamily={FONT} fontSize={9.5} fontWeight={600} fill={open ? '#16a34a' : BAD}>{port}</text>
      </g>;
    })}
    <text x={x - 16} y={y - 8} textAnchor="end" fontFamily={FONT} fontSize={9.5} fontWeight={600} fill={INK}>{v.id}</text>
  </g>;

  const srcMode = !running ? 'Standby' : m.water === 'chilled' ? `Cooling · ${cool?.flow ?? 18} °C flow` : m.internal ? 'Hot water (plate HEX)' : got.cylinder && !got.emitters.size ? 'Hot water' : `Heating · ${fmt(flowT, 1)} °C flow`;
  const srcUse: Use = !running ? 'idle' : m.water === 'chilled' ? 'cool' : m.internal || (got.cylinder && !got.emitters.size) ? 'dhw' : 'heat';

  return (
    <div className="house-stack">
      <section className="card panel">
        <div className="section-head">
          <div><h2>System diagram</h2><p className="muted small">The {hp ? 'heat pump' : 'boiler'}, every pipe run and the emitters it feeds, flow and return, from the <a href={href('pipes')}>pipework</a>, with the valves and the modes that set them. Pick a mode to see where the water goes; drag a valve onto another run to move it.</p></div>
          {nodes.length > 0 && <div className="chips">
            <button type="button" className="btn-secondary" onClick={() => download(`${name}.svg`, svgText(), 'image/svg+xml')}>Export SVG</button>
            <button type="button" className="btn-secondary" onClick={savePng}>Export PNG</button>
          </div>}
        </div>
        {!nodes.length ? <p className="small muted">No pipework yet: lay it out on the <a href={href('pipes')}>Pipework</a> page first.</p> : (<>
          <div className="row-between sx-bar">
            <div className="chips" role="group" aria-label="Mode">
              {modes.map((x) => <Chip key={x.id} on={x.id === m.id} onClick={() => { setPlaying(false); setModeId(x.id); }}>{x.name}</Chip>)}
              <button type="button" className="btn-secondary" aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play modes'}</button>
            </div>
            <span className="small muted" aria-live="polite">{m.name}: {modeSummary(h, m)}</span>
          </div>
          <div className="sx-wrap">
            <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Heating system schematic, ${m.name}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: drag ? 'none' : undefined }}>
              <style>{CSS}</style>
              <rect width={W} height={H} fill="#fff" />
              <g fontFamily={FONT}>
                <text x={24} y={34} fontSize={18} fontWeight={700} fill={INK}>Heating system schematic · {m.name}</text>
                <text x={24} y={54} fontSize={11.5} fill={MUTED}>{active.name} · {SOURCE_LABEL[h.hp.source]}{given(h.hp.capacity) ? ` ${fmt(h.hp.capacity, 1)} kW` : ''} · design flow {fmt(flowT, 1)} °C, return {fmt(flowT - dT, 1)} °C · {fmt(totalW)} W at {res.Tout} °C outside{coolingOn(h) && cool ? ` · cooling${given(cool.capacity) ? ` ${fmt(cool.capacity, 1)} kW` : ''} at ${cool.flow} °C` : ''}{ctl ? ` · ${ctl.plan === 'custom' ? 'custom controls' : PLANS[ctl.plan].name}` : ''}</text>
              </g>
              {/* The heat source, flow out on top and return in below */}
              <rect x={24} y={yOf(srcY) - 36} width={X0 - 40} height={72} rx={6} fill={TINT[srcUse]} stroke={INK} strokeWidth={1.5} className="sx-fill" />
              <text x={24 + (X0 - 40) / 2} y={yOf(srcY) - 12} textAnchor="middle" fontFamily={FONT} fontSize={12} fontWeight={600} fill={INK}>{hp ? 'Heat pump' : 'Boiler'}</text>
              <text x={24 + (X0 - 40) / 2} y={yOf(srcY) + 3} textAnchor="middle" fontFamily={FONT} fontSize={10.5} fill={MUTED}>{given(h.hp.capacity) ? `${fmt(h.hp.capacity, 1)} kW · ` : ''}{h.heating.pumpHead ?? 40} kPa</text>
              <text x={24 + (X0 - 40) / 2} y={yOf(srcY) + 18} textAnchor="middle" fontFamily={FONT} fontSize={10.5} fontWeight={600} fill={COL[srcUse][0] === IDLE ? MUTED : COL[srcUse][0]}>{srcMode}</text>
              {hp
                ? <g className={running ? 'sx-spin' : undefined}><circle cx={38} cy={yOf(srcY) - 22} r={8} fill="none" stroke={INK} strokeWidth={1} /><path d={`M38 ${yOf(srcY) - 22} l0 -7 M38 ${yOf(srcY) - 22} l6 4 M38 ${yOf(srcY) - 22} l-6 4`} stroke={INK} strokeWidth={1.5} /></g>
                : <path className={running ? 'sx-pulse' : undefined} d={`M38 ${yOf(srcY) - 14} c-7 -4 -5 -10 0 -16 c1 5 6 6 6 11 c0 3 -3 5 -6 5 z`} fill={running ? '#ea580c' : IDLE} />}
              {nodes.map((n) => {
                // A group not joined to the source starts at a red cross, not from the source, and carries nothing.
                const loose = !!n.p.loose, r = byId.get(n.p.id), x0 = n.px < 0 ? (loose ? X0 + 6 : X0 - 16) : xOf(n.px), y0 = yOf(n.py), y = yOf(n.y), u = loose || n.p.loop ? 'idle' : use.get(n.p.id) ?? 'idle';
                const leaf = !nodes.some((k) => k.p.parent === n.p.id), tip = endsOnHeater(n.p), x1 = leaf || tip ? xE : xOf(n.depth), w = r?.index ? 3 : 1.8;
                const xs = n.px < 0 ? X0 : xOf(n.px), lx = xs + 10, bad = r && !r.ok;
                const ret = `M${x0} ${y0 + O} H${x0 + (n.px < 0 ? 16 : 0) - O} V${y + O} H${x1}`, flo = `M${x0} ${y0 - O} H${x0 + (n.px < 0 ? 16 : 0) + O} V${y - O} H${x1}`;
                const v = vNow?.get(n.p.id) ?? 0, dur = `${Math.min(6, Math.max(0.5, 0.6 / Math.max(v, 0.05))).toFixed(2)}s`;
                const vs = valvesOn(h, n.p.id).filter((q) => !atTee.has(q.v.id));
                const cls = `sx-run${pick ? ' pick' : ''}${drag?.over === n.p.id ? ' drop' : ''}`;
                return <g key={n.p.id} className={cls} data-run={n.p.id}
                  onPointerEnter={drag ? () => setDrag({ ...drag, over: n.p.id }) : undefined}
                  onClick={pick ? () => upd((x) => moveValve(x, pick.v, pick.port, valvesOn(x, n.p.id).some((q) => q.v.id === pick.v && q.port === pick.port) ? n.p.id : null, valvesOn(x, n.p.id).some((q) => q.v.id === pick.v && q.port === pick.port) ? null : n.p.id)) : undefined}>
                  <path className="sx-hit" d={flo} stroke="transparent" strokeWidth={18} fill="none" />
                  <path className="sx-line" d={ret} stroke={COL[u][1]} strokeWidth={w} fill="none" />
                  <path className="sx-line" d={flo} stroke={COL[u][0]} strokeWidth={w} fill="none" strokeDasharray={n.p.loop ? '5 4' : undefined} />
                  {u !== 'idle' && <>
                    <path className="sx-dots" d={flo} stroke="#fff" strokeOpacity={0.9} strokeWidth={Math.max(1.4, w - 0.4)} fill="none" style={{ animationDuration: dur }} />
                    <path className="sx-dots back" d={ret} stroke="#fff" strokeOpacity={0.9} strokeWidth={Math.max(1.4, w - 0.4)} fill="none" style={{ animationDuration: dur }} />
                  </>}
                  <text x={lx} y={y - O - 5} fontFamily={FONT} fontSize={10} fill={bad ? BAD : INK}>{n.p.header ? `${n.p.name} · ` : ''}{short(n.p.size)} · {fmt(runLength(h, n.p), 1)} m</text>
                  {/* This mode's flow; the size (and a red label) follow the busiest mode, named when it is another one. */}
                  {r && <text x={lx} y={y + O + 13} fontFamily={FONT} fontSize={10} fill={bad ? BAD : MUTED}>{running && now ? (u === 'idle' ? 'No flow' : !now.flow.get(n.p.id) && u === 'dhw' && !h.heating.coilW ? 'Coil reheat not entered' : `${fmt(now.flow.get(n.p.id) ?? 0, 1)} l/min · ${fmt(v, 2)} m/s`) : `Design ${fmt(r.flowLpm, 1)} l/min · ${fmt(r.v, 2)} m/s`}{ctl && r.mode && (!running || r.mode !== m.name) ? ` · sized for ${r.mode}` : ''}</text>}
                  {loose && n.px < 0 && <g><title>{n.p.name}: not joined to the {hp ? 'heat pump' : 'boiler'}</title><path d={`M${x0 - 6} ${y - 6} l12 12 m0 -12 l-12 12`} stroke={BAD} strokeWidth={2.2} /></g>}
                  {n.p.loop
                    ? <text x={xE + 52} y={y + 4} fontFamily={FONT} fontSize={10.5} fill={BAD}>{n.p.name}: closes a loop, so no flow is counted along it</text>
                    : (tip || leaf) && <>{symbol(n, x1, y)}{label(n, xE + 52, y)}</>}
                  {!leaf && <circle cx={xOf(n.depth) + O} cy={y - O} r={2.5} fill={COL[u][0]} className="sx-fill" />}
                  {!leaf && <circle cx={xOf(n.depth) - O} cy={y + O} r={2.5} fill={COL[u][1]} className="sx-fill" />}
                  {vs.map(({ v: vv, port }, k) => valveMark(vv, port, n.p.id, xs + STEP - 22 - k * 26, y - O))}
                </g>;
              })}
              {tees.map(teeMark)}
              {/* Key and the index circuit */}
              <g fontFamily={FONT} fontSize={10.5} transform={`translate(24 ${H - 64})`}>
                {([['Heating', COL.heat[0]], ['Hot water', COL.dhw[0]], ['Cooling', COL.cool[0]], ['Return', COL.heat[1]], ['No flow', IDLE]] as const).map(([t, c], i) => <g key={t} transform={`translate(${i * 86} 0)`}><line x1={0} x2={24} y1={0} y2={0} stroke={c} strokeWidth={2.5} /><text x={30} y={4} fill={INK}>{t}</text></g>)}
                <line x1={440} x2={464} y1={0} y2={0} stroke={INK} strokeWidth={3.5} /><text x={470} y={4} fill={INK}>Index circuit</text>
                <path d="M556 -6 L572 6 L572 -6 L556 6 Z" fill="#fff" stroke={INK} /><text x={578} y={4} fill={INK}>Valve open</text>
                <path d="M650 -6 L666 6 L666 -6 L650 6 Z" fill={INK} stroke={INK} /><text x={672} y={4} fill={INK}>shut</text>
                <text x={0} y={26} fill={sized.headOk ? MUTED : BAD}>Index circuit {fmt(sized.indexDp / 1000, 1)} kPa against {fmt(sized.head / 1000)} kPa pump head · {dT} K flow − return · Pa/m limit {fmt(sized.paMax)}{sized.modes.length > 1 ? ' · each run sized for its busiest mode' : ''} · red label: over the velocity or Pa/m limit</text>
                {looseTops.length > 0 && <text x={0} y={44 + 18 * +(sized.unpiped.length > 0)} fill={BAD}>Not joined to the {hp ? 'heat pump' : 'boiler'} (red cross): {looseTops.map((n) => n.p.name).join('; ')}. Draw a run from one that is onto them, or drop an open end on them.</text>}
                {loops.length > 0 && <text x={0} y={44 + 18 * (+(sized.unpiped.length > 0) + +!!looseTops.length)} fill={BAD}>Closes a loop (dashed): {loops.map((n) => n.p.name).join('; ')}. Water could go round it either way, so no flow is counted along it.</text>}
                {sized.unpiped.length > 0 && <text x={0} y={44} fill={BAD}>Not piped: {sized.unpiped.map((id) => { const e = h.heating.emitters.find((x) => x.id === id); return e ? roomOf(e.room)?.name ?? id : id; }).join(', ')}</text>}
              </g>
            </svg>
          </div>
          {pick && <p className="small sx-hint">Editing {pick.v}{ctl?.valves.find((x) => x.id === pick.v)?.kind === 'three' ? `, port ${pick.port}` : ''}: click runs in the diagram to put the valve on them or take it off. <button type="button" className="btn-link inline" onClick={() => setPick(null)}>Done</button></p>}
        </>)}
      </section>

      {nodes.length > 0 && <div className="house-grid">
        <section className="card panel">
          <h2>Control plan</h2>
          <p className="small muted">A plan puts the valves where it needs them on your pipework and fills in its modes. Change anything after, and the plan becomes your own.</p>
          <div className="chips" role="group" aria-label="Control plan">
            {(Object.keys(PLANS) as PlanKind[]).map((k) => <Chip key={k} on={plan === k} onClick={() => setPlan(k)}>{PLANS[k].name}</Chip>)}
          </div>
          <p className="small">{PLANS[plan].note}</p>
          <div className="chips">
            <button type="button" className="btn-primary" onClick={() => {
              if (ctl?.plan === 'custom' && !window.confirm('Replace your own valves and modes with the plan?')) return;
              let err: string | null = null;
              upd((x) => { err = applyPlan(x, plan); });
              setMsg(err ?? ''); setModeId(null); setPick(null);
            }}>{ctl ? `Apply ${PLANS[plan].name}` : `Add ${PLANS[plan].name}`}</button>
            {ctl && <button type="button" className="btn-secondary" onClick={() => { upd((x) => { applyPlan(x, null); }); setModeId(null); setPick(null); setMsg(''); }}>Remove valves</button>}
          </div>
          {msg && <p className="small bad">{msg}</p>}
          {!ctl && <p className="small muted">No valves yet: everything is open, so heating{h.heating.cylinder ? ' and the cylinder run' : ''} {h.heating.cylinder ? 'take' : 'takes'} water at once{coolingOn(h) ? ', and cooling would reach every emitter' : ''}.</p>}
          {h.heating.cylinder && <div className="hf-row">
            <SheetNum label="Cylinder coil reheat" unit="kW" step={0.5} value={given(h.heating.coilW) ? h.heating.coilW / 1000 : undefined} why="The cylinder's coil output from its datasheet, at your flow temperature. Left blank, the cylinder run carries no reheat load when the pipes are sized." onChange={(v) => upd((x) => { if (v == null) delete x.heating.coilW; else x.heating.coilW = Math.round(v * 1000); })} />
          </div>}
          {checks.length > 0 && <ul className="small sx-checks">{checks.map((c, i) => <li key={i} className={c.level === 'error' ? 'bad' : 'warn'}>{c.text}</li>)}</ul>}
          {ctl && !checks.length && <p className="small good">Every mode checks out: no shut-off pump, no radiator on chilled water, every emitter heated.</p>}
        </section>

        <section className="card panel">
          <div className="row-between"><h2>Valves</h2>
            <button type="button" className="btn-secondary" onClick={() => {
              let k = (ctl?.valves.length ?? 0) + 1;
              while (ctl?.valves.some((q) => q.id === `V${k}`)) k++;
              const id = `V${k}`;
              upd((x) => {
                const c = (x.heating.controls ??= { plan: 'custom', valves: [] as Valve[], modes: modesOf(x).map((q) => ({ ...q, valves: {} })) });
                c.valves.push({ id, name: 'Zone valve', kind: 'two', runs: [] });
                c.plan = 'custom';
              });
              setPick({ v: id, port: 'A' });
            }}>Add valve</button>
          </div>
          {!ctl?.valves.length ? <p className="small muted">No valves. Add a plan, or add a valve and click the runs it goes on.</p> : (
            <table className="h-table"><tbody>
              {ctl.valves.map((v) => {
                const runName = (id: string) => h.heating.pipes?.find((p) => p.id === id)?.name ?? `${id} (gone)`;
                const ports: Array<'A' | 'B'> = v.kind === 'three' ? ['A', 'B'] : ['A'];
                return <tr key={v.id} className={pick?.v === v.id ? 'on' : undefined}>
                  <td className="mono">{v.id}</td>
                  <td><input className="h-text" aria-label={`${v.id} name`} value={v.name} onChange={(e) => edit((x) => { x.heating.controls!.valves.find((q) => q.id === v.id)!.name = e.target.value; })} />
                    <div className="small muted">
                      {ports.map((pt) => <div key={pt}>{v.kind === 'three' ? `Port ${pt}: ` : 'On: '}{(pt === 'A' ? v.runs : v.b ?? []).map(runName).join(', ') || 'no run'}{' '}
                        <button type="button" className="btn-link inline" onClick={() => setPick(pick?.v === v.id && pick.port === pt ? null : { v: v.id, port: pt })}>{pick?.v === v.id && pick.port === pt ? 'done' : 'pick runs'}</button></div>)}
                    </div>
                  </td>
                  <td>
                    <select className="h-sel" aria-label={`${v.id} kind`} value={v.kind === 'two' ? 'two' : v.mid ? 'mid' : 'div'} onChange={(e) => edit((x) => {
                      const q = x.heating.controls!.valves.find((z) => z.id === v.id)!, k = e.target.value;
                      q.kind = k === 'two' ? 'two' : 'three'; q.mid = k === 'mid';
                      if (q.kind === 'two') delete q.b; else q.b ??= [];
                      // Positions that no longer fit fall back to the default.
                      for (const md of x.heating.controls!.modes) { const p = md.valves[v.id]; if (p && !posChoices(q).includes(p)) delete md.valves[v.id]; }
                    })}>
                      <option value="two">2-port zone valve</option><option value="mid">3-port mid-position</option><option value="div">3-port diverter</option>
                    </select>
                  </td>
                  <td><button type="button" className="btn-link" aria-label={`Delete ${v.id}`} onClick={() => { edit((x) => { const c = x.heating.controls!; c.valves = c.valves.filter((q) => q.id !== v.id); for (const md of c.modes) delete md.valves[v.id]; }); setPick(null); }}>✕</button></td>
                </tr>;
              })}
            </tbody></table>
          )}
        </section>
      </div>}

      {nodes.length > 0 && ctl && <section className="card panel">
        <div className="row-between"><h2>Modes</h2>
          <button type="button" className="btn-secondary" onClick={() => {
            let id = 'm1';
            edit((x) => { const c = x.heating.controls!; let k = c.modes.length + 1; while (c.modes.some((q) => q.id === `m${k}`)) k++; id = `m${k}`; c.modes.push({ ...structuredClone(m), id, name: `${m.name} (copy)` }); });
            setModeId(id);
          }}>Add mode</button>
        </div>
        <p className="small muted">Each mode is one state of the system: the water the {hp ? 'heat pump' : 'boiler'} sends and where each valve sits. Pick a row to show it in the diagram. The thermal runs heat every emitter some hot mode reaches, and cool every fan coil or loop a chilled mode reaches.</p>
        <div className="h-table-wrap"><table className="h-table">
          <thead><tr><th>Mode</th><th>Water</th>{ctl.valves.map((v) => <th key={v.id} title={v.name}>{v.id}</th>)}<th>Does</th><th /></tr></thead>
          <tbody>{ctl.modes.map((md, i) => (
            <tr key={md.id} className={md.id === m.id ? 'on' : undefined} onClick={() => { setPlaying(false); setModeId(md.id); }}>
              <td><input className="h-text" aria-label="Mode name" value={md.name} onChange={(e) => edit((x) => { x.heating.controls!.modes[i].name = e.target.value; })} /></td>
              <td><select className="h-sel" aria-label={`${md.name} water`} value={md.water} onChange={(e) => edit((x) => { x.heating.controls!.modes[i].water = e.target.value as Water; })}>
                {(Object.keys(WATER) as Water[]).map((w) => <option key={w} value={w}>{WATER[w]}</option>)}
              </select></td>
              {ctl.valves.map((v) => <td key={v.id}>
                <select className="h-sel" aria-label={`${md.name}: ${v.id}`} value={posOf(v, md)} onChange={(e) => edit((x) => { x.heating.controls!.modes[i].valves[v.id] = e.target.value as Pos; })}>
                  {posChoices(v).map((p) => <option key={p} value={p}>{POS_LABEL[p]}</option>)}
                </select>
              </td>)}
              <td className="small muted">{modeSummary(h, md)}</td>
              <td><button type="button" className="btn-link" aria-label={`Delete ${md.name}`} disabled={ctl.modes.length < 2} onClick={(e) => { e.stopPropagation(); edit((x) => { x.heating.controls!.modes.splice(i, 1); }); setModeId(null); }}>✕</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>}
    </div>
  );
}

/** The positions a valve can take: open or shut, or the ports of a 3-port (both only with a mid position). */
export const posChoices = (v: Valve): Pos[] => (v.kind === 'two' ? ['open', 'shut'] : v.mid ? ['A', 'B', 'AB'] : ['A', 'B']);
export type { Mode };
