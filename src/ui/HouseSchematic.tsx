// Heating schematic: the heat source, every pipe run and the emitters as a 2D flow-and-return diagram, exportable as SVG or PNG.
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { SOURCE_LABEL, isHeatPump } from '../engine/house';
import type { House } from '../engine/house';
import { RAD_LABEL } from '../engine/house-heating';
import { runLength, sizePipes } from '../engine/house-pipes';
import type { Pipe } from '../engine/house-pipes';
import { download } from '../lib/util';
import { fmt } from './hform';
import { useProject } from './project';
import { href } from './route';

const FLOW = '#c2410c', RET = '#1f6fb5', INK = '#14212b', MUTED = '#5b6770', BAD = '#b91c1c', FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
const O = 4, ROW = 64, COL = 150, X0 = 170, TOP = 96, LABEL_W = 260;

interface Node { p: Pipe; depth: number; y: number; px: number; py: number }

/** Tree layout: each emitter or dead end gets a row; a branch sits level with its own emitter, else midway between its runs. */
export function layoutPipes(h: House): { nodes: Node[]; rows: number; maxDepth: number; srcY: number } {
  const pipes = h.heating.pipes ?? [], ids = new Set(pipes.map((p) => p.id));
  const storeyOf = (p: Pipe) => p.leg?.storey ?? h.rooms.find((r) => r.id === h.heating.emitters.find((e) => e.id === p.emitter)?.room)?.storey ?? 0;
  // Upper floors above, so the diagram reads like the house.
  const kids = (id: string | null) => pipes.filter((c) => (id === null ? !c.parent || !ids.has(c.parent) : c.parent === id)).sort((a, b) => storeyOf(b) - storeyOf(a));
  const nodes: Node[] = [];
  let row = 0, maxDepth = 0;
  const place = (p: Pipe, depth: number, seen: Set<string>): Node | null => {
    if (seen.has(p.id) || depth > 50) return null;
    seen.add(p.id);
    maxDepth = Math.max(maxDepth, depth);
    const n: Node = { p, depth, y: 0, px: 0, py: 0 };
    nodes.push(n);
    const own = p.emitter || !kids(p.id).length ? row++ : -1;
    const ks = kids(p.id).map((c) => place(c, depth + 1, seen)).filter((x): x is Node => !!x);
    n.y = own >= 0 ? own : (ks[0].y + ks[ks.length - 1].y) / 2;
    for (const k of ks) { k.px = depth; k.py = n.y; }
    return n;
  };
  const roots = kids(null).map((p) => place(p, 0, new Set())).filter((x): x is Node => !!x);
  const srcY = roots.length ? (roots[0].y + roots[roots.length - 1].y) / 2 : 0;
  for (const r of roots) { r.px = -1; r.py = srcY; }
  return { nodes, rows: row, maxDepth, srcY };
}

const short = (s: string) => s.replace(' (microbore)', '');

export function HouseSchematic() {
  const { house: h, res, active } = useProject();
  const svgRef = useRef<SVGSVGElement>(null);
  const sized = sizePipes(h, res), byId = new Map(sized.rows.map((r) => [r.pipe.id, r]));
  const { nodes, rows, maxDepth, srcY } = layoutPipes(h);
  const hp = isHeatPump(h.hp.source);
  const xOf = (d: number) => X0 + (d + 1) * COL, yOf = (r: number) => TOP + r * ROW;
  const xE = xOf(maxDepth) + 24; // every emitter in one column
  const W = xE + 60 + LABEL_W, H = TOP + Math.max(1, rows) * ROW + 110;
  const roomOf = (id: string) => h.rooms.find((r) => r.id === id);
  const flowT = res.heat.designFlow, dT = h.heating.dT;
  const totalW = sized.rows.filter((r) => !r.pipe.parent).reduce((t, r) => t + r.loadW, 0);
  const name = `${active.name.replace(/[^\w-]+/g, '_')}-heating-schematic`;

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
    const p = n.p, e = h.heating.emitters.find((x) => x.id === p.emitter);
    const stroke = { stroke: INK, strokeWidth: 1.5, fill: '#fff' };
    if (!e && p.ends?.[1] === 'cylinder') return <g>
      <rect x={x} y={y - 24} width={30} height={48} rx={10} {...stroke} />
      <path d={`M${x} ${y - O} h8 l14 5 l-14 5 l14 5 M${x} ${y + O} h8`} stroke={INK} fill="none" />
    </g>;
    if (!e) return <circle cx={x + 4} cy={y} r={4} fill={INK} />;
    if (e.kind === 'ufh') return <path d={`M${x} ${y - O} h6 v-12 h30 v6 h-26 v6 h26 v6 h-26 v6 h26 v6 h-30 v-12 h-6`} stroke={INK} strokeWidth={1.3} fill="none" />;
    if (e.kind === 'towel') return <g>
      <path d={`M${x + 4} ${y - 20} v40 M${x + 30} ${y - 20} v40 ${[-14, -6, 2, 10, 18].map((d) => `M${x + 4} ${y + d} H${x + 30}`).join(' ')}`} stroke={INK} strokeWidth={1.5} fill="none" />
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
    const what = !e ? (p.ends?.[1] === 'cylinder' ? 'Hot water cylinder coil' : p.name) : e.kind === 'ufh' ? `UFH loop · ${fmt(e.area, 1)} m² · ${e.spacing} mm` : e.kind === 'towel' ? `Towel rail · ${fmt(e.rated)} W at ΔT50` : `${RAD_LABEL[e.type]} · ${e.len}×${e.height}`;
    return <g fontFamily={FONT}>
      <text x={x} y={y - 6} fontSize={12} fontWeight={600} fill={INK}>{room?.name ?? (e ? e.room : what)}{storey ? <tspan fill={MUTED} fontWeight={400}> · {storey}</tspan> : null}</text>
      <text x={x} y={y + 9} fontSize={10.5} fill={MUTED}>{e ? what : ''}{r && r.loadW > 0 ? `${e ? ' · ' : ''}${fmt(r.loadW)} W` : ''}{zone ? ` · ${zone.name}${zone.kind === 'ufh' && zone.blend ? `, blended to ${zone.blend} °C` : ''}` : ''}</text>
    </g>;
  };

  return (
    <div className="house-stack">
      <section className="card panel">
        <div className="section-head">
          <div><h2>System diagram</h2><p className="muted small">The {hp ? 'heat pump' : 'boiler'}, every pipe run and the emitters it feeds, flow and return, from the <a href={href('pipes')}>pipework</a>. Each run shows its size, length and design flow; the index circuit is drawn heavier.</p></div>
          {nodes.length > 0 && <div className="chips">
            <button type="button" className="btn-secondary" onClick={() => download(`${name}.svg`, svgText(), 'image/svg+xml')}>Export SVG</button>
            <button type="button" className="btn-secondary" onClick={savePng}>Export PNG</button>
          </div>}
        </div>
        {!nodes.length ? <p className="small muted">No pipework yet: lay it out on the <a href={href('pipes')}>Pipework</a> page first.</p> : (
          <div>
            <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Heating system schematic" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <rect width={W} height={H} fill="#fff" />
              <g fontFamily={FONT}>
                <text x={24} y={34} fontSize={18} fontWeight={700} fill={INK}>Heating system schematic</text>
                <text x={24} y={54} fontSize={11.5} fill={MUTED}>{active.name} · {SOURCE_LABEL[h.hp.source]} {fmt(h.hp.capacity, 1)} kW · design flow {fmt(flowT, 1)} °C, return {fmt(flowT - dT, 1)} °C · {fmt(totalW)} W at {res.Tout} °C outside</text>
              </g>
              {/* The heat source, flow out on top and return in below */}
              <rect x={24} y={yOf(srcY) - 36} width={X0 - 40} height={72} rx={6} fill="#fff7ed" stroke={INK} strokeWidth={1.5} />
              <text x={24 + (X0 - 40) / 2} y={yOf(srcY) - 4} textAnchor="middle" fontFamily={FONT} fontSize={12} fontWeight={600} fill={INK}>{hp ? 'Heat pump' : 'Boiler'}</text>
              <text x={24 + (X0 - 40) / 2} y={yOf(srcY) + 12} textAnchor="middle" fontFamily={FONT} fontSize={10.5} fill={MUTED}>{fmt(h.hp.capacity, 1)} kW · {h.heating.pumpHead ?? 40} kPa</text>
              {nodes.map((n) => {
                const r = byId.get(n.p.id), x0 = n.px < 0 ? X0 - 16 : xOf(n.px), y0 = yOf(n.py), y = yOf(n.y);
                const leaf = !nodes.some((k) => k.p.parent === n.p.id), x1 = leaf ? xE : xOf(n.depth), w = r?.index ? 3 : 1.8;
                const lx = (n.px < 0 ? X0 : xOf(n.px)) + 10, bad = r && !r.ok;
                return <g key={n.p.id}>
                  <path d={`M${x0} ${y0 + O} H${x0 + (n.px < 0 ? 16 : 0) - O} V${y + O} H${x1}`} stroke={RET} strokeWidth={w} fill="none" />
                  <path d={`M${x0} ${y0 - O} H${x0 + (n.px < 0 ? 16 : 0) + O} V${y - O} H${x1}`} stroke={FLOW} strokeWidth={w} fill="none" />
                  <text x={lx} y={y - O - 5} fontFamily={FONT} fontSize={10} fill={bad ? BAD : INK}>{short(n.p.size)} · {fmt(runLength(h, n.p), 1)} m</text>
                  {r && <text x={lx} y={y + O + 13} fontFamily={FONT} fontSize={10} fill={bad ? BAD : MUTED}>{fmt(r.flowLpm, 1)} l/min · {fmt(r.v, 2)} m/s</text>}
                  {(n.p.emitter || leaf) && <>{symbol(n, x1, y)}{label(n, xE + 52, y)}</>}
                  {!leaf && <circle cx={x1 + O} cy={y - O} r={2.5} fill={FLOW} />}
                  {!leaf && <circle cx={x1 - O} cy={y + O} r={2.5} fill={RET} />}
                </g>;
              })}
              {/* Key and the index circuit */}
              <g fontFamily={FONT} fontSize={10.5} transform={`translate(24 ${H - 64})`}>
                <line x1={0} x2={28} y1={0} y2={0} stroke={FLOW} strokeWidth={2} /><text x={34} y={4} fill={INK}>Flow</text>
                <line x1={80} x2={108} y1={0} y2={0} stroke={RET} strokeWidth={2} /><text x={114} y={4} fill={INK}>Return</text>
                <line x1={170} x2={198} y1={0} y2={0} stroke={INK} strokeWidth={3.5} /><text x={204} y={4} fill={INK}>Index circuit</text>
                <text x={300} y={4} fill={BAD}>Red label: over the velocity or Pa/m limit</text>
                <text x={0} y={26} fill={sized.headOk ? MUTED : BAD}>Index circuit {fmt(sized.indexDp / 1000, 1)} kPa against {fmt(sized.head / 1000)} kPa pump head · {dT} K flow − return · Pa/m limit {fmt(sized.paMax)}</text>
                {sized.unpiped.length > 0 && <text x={0} y={44} fill={BAD}>Not piped: {sized.unpiped.map((id) => { const e = h.heating.emitters.find((x) => x.id === id); return e ? roomOf(e.room)?.name ?? id : id; }).join(', ')}</text>}
              </g>
            </svg>
          </div>
        )}
      </section>
    </div>
  );
}
