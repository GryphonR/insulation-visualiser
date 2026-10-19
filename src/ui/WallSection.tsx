import { useMemo } from 'react';
import { clamp, cmap, fmtTick, niceRange, pad2, sgn } from '../lib/util';
import type { ScenarioResult } from '../engine/scenario';

const X0 = 130;
const X1 = 770;
const PY0 = 222;
const PY1 = 360;
const ARROW_ROWS = [76, 117, 158];
const ARROW_COLS = 21;

export function WallSection({ res, frame }: { res: ScenarioResult; frame: number }) {
  const { sim } = res;
  const fr = sim.fr;
  const f = frame;
  const sx = (X1 - X0) / sim.total;
  const xP = (mm: number) => X0 + mm * sx;

  // Everything that does not change while the clock moves.
  const fixed = useMemo(() => {
    let rmin = Infinity;
    let rmax = -Infinity;
    for (let j = 0; j < sim.pmin.length; j++) {
      rmin = Math.min(rmin, sim.pmin[j]);
      rmax = Math.max(rmax, sim.pmax[j]);
    }
    for (let g = 0; g < 144; g++) {
      rmin = Math.min(rmin, fr.tsa[g], fr.tin[g]);
      rmax = Math.max(rmax, fr.tsa[g], fr.tin[g]);
    }
    const nr = niceRange(rmin, rmax, 3);
    const yP = (v: number) => PY1 - ((PY1 - PY0) * (v - nr.lo)) / (nr.hi - nr.lo);
    const up = sim.px.map((mm, j) => xP(mm).toFixed(1) + ',' + yP(sim.pmax[j]).toFixed(1));
    const dn = sim.px.map((mm, j) => xP(mm).toFixed(1) + ',' + yP(sim.pmin[j]).toFixed(1)).reverse();
    const tx = niceRange(0, sim.total, 6);
    return {
      yP,
      grid: nr.ticks.map((v) => ({ y: yP(v), label: fmtTick(v, nr.step) })),
      envelope: up.concat(dn).join(' '),
      ticksX: tx.ticks.filter((v) => v <= sim.total + 1e-6).map((v) => ({ x: xP(v), label: String(Math.round(v)) })),
      faceX: [0].concat(sim.cells.map((c) => c.x1)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);
  const { yP } = fixed;

  const prof = fr.prof[f];
  const tsa = fr.tsa[f];
  const tin = fr.tin[f];
  const flux = fr.q[f];
  const sunFrac = clamp(fr.I[f] / 900, 0, 1);
  const time = `${pad2(Math.floor(f / 6))}:${pad2((f % 6) * 10)}`;

  const ff = sim.faceFlux(fr.cellT[f], tsa, tin);
  const arrows: Array<{ d: string; halo: React.CSSProperties; main: React.CSSProperties }> = [];
  ARROW_ROWS.forEach((cy) => {
    for (let a = 0; a < ARROW_COLS; a++) {
      const cx = X0 + 15 + a * 30;
      const mmx = (cx - X0) / sx;
      let bi = 0;
      let bd = Infinity;
      for (let j = 0; j < fixed.faceX.length; j++) {
        const dd = Math.abs(fixed.faceX[j] - mmx);
        if (dd < bd) {
          bd = dd;
          bi = j;
        }
      }
      const q = ff[bi];
      const m = Math.sqrt(clamp(Math.abs(q) / sim.fmax, 0, 1));
      const dir = q >= 0 ? 1 : -1;
      const L = 2 + 10 * m;
      const hd = 2 + 4 * m;
      const xa = cx - dir * L;
      const xb = cx + dir * L;
      const d = `M${xa.toFixed(1)} ${cy}L${xb.toFixed(1)} ${cy}M${(xb - dir * hd).toFixed(1)} ${cy - hd}L${xb.toFixed(1)} ${cy}L${(xb - dir * hd).toFixed(1)} ${cy + hd}`;
      const base = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
      arrows.push({
        d,
        halo: { ...base, stroke: '#fff', opacity: 0.7, strokeWidth: 3.5 + 4 * m },
        main: { ...base, stroke: '#14212b', strokeWidth: 1 + 2.2 * m },
      });
    }
  });

  const saY = yP(tsa);
  const tinY = yP(tin);
  const profile = sim.px.map((mm, j) => xP(mm).toFixed(1) + ',' + yP(prof[j]).toFixed(1)).join(' ');
  const filmOut = `${X0 - 28},${saY.toFixed(1)} ${X0},${yP(fr.tsOut[f]).toFixed(1)}`;
  const filmIn = `${X1},${yP(fr.tsIn[f]).toFixed(1)} ${X1 + 28},${tinY.toFixed(1)}`;

  return (
    <svg
      viewBox="0 0 900 404"
      role="img"
      aria-label={`Cross-section of the wall coloured by temperature at ${time}, with a temperature profile through its depth. Inner face ${fr.tsIn[f].toFixed(1)} degrees.`}
      className="svg-fluid"
    >
      <circle cx={64} cy={112} r={30} fill="none" stroke="#d7dde2" strokeDasharray="3 3" />
      <circle cx={64} cy={112} r={6 + 22 * sunFrac} fill="#f2a900" opacity={0.15 + 0.85 * sunFrac} />
      <text x={8} y={164} className="svt-b">SUN</text>
      <text x={8} y={180} className="svt">{Math.round(fr.I[f])} W/m²</text>
      <text x={8} y={196} className="svt">Air {fr.tair[f].toFixed(1)} °C</text>
      <text x={8} y={212} className="svt">Sol-air {tsa.toFixed(1)} °C</text>

      <text x={X0} y={16} className="svt-b">OUTSIDE</text>
      <text x={X1} y={16} className="svt-bend">INSIDE</text>

      {sim.lay.map((l, i) => (
        <g key={i}>
          <rect x={xP(l.x0)} y={44} width={(l.x1 - l.x0) * sx} height={12} fill={l.mat.col} />
          <text x={xP((l.x0 + l.x1) / 2)} y={38} className="svt-mid">{(l.x1 - l.x0) * sx >= 11 ? i + 1 : ''}</text>
        </g>
      ))}
      {sim.cells.map((c, i) => (
        <rect
          key={i}
          x={xP(c.x0)}
          y={58}
          width={(c.x1 - c.x0) * sx + 0.6}
          height={118}
          fill={cmap((fr.cellT[f][i] - sim.tlo) / (sim.thi - sim.tlo))}
          shapeRendering="crispEdges"
        />
      ))}
      {arrows.map((a, i) => (
        <g key={i}>
          <path d={a.d} style={a.halo} />
          <path d={a.d} style={a.main} />
        </g>
      ))}
      <rect x={X0} y={44} width={X1 - X0} height={132} fill="none" stroke="#14212b" strokeWidth={1.2} />
      {sim.lay.slice(1).map((l, i) => (
        <line key={i} x1={xP(l.x0)} x2={xP(l.x0)} y1={44} y2={360} stroke="#14212b" strokeDasharray="2 3" opacity={0.45} />
      ))}

      <text x={X0} y={194} className="svt">outer face {fr.tsOut[f].toFixed(1)} °C</text>
      <text x={X1} y={194} className="svt-end">inner face {fr.tsIn[f].toFixed(1)} °C</text>

      <text x={784} y={104} className="svt-b">ROOM</text>
      <text x={784} y={122} className="svt">{tin.toFixed(1)} °C</text>
      <text x={784} y={146} className="svt-b">HEAT FLOW</text>
      <text x={784} y={164} className="svt">{sgn(flux, 1)} W/m²</text>
      <text x={784} y={180} className="svt">{flux >= 0 ? 'into the room' : 'out of the room'}</text>

      {fixed.grid.map((g) => (
        <g key={g.label}>
          <line x1={X0} x2={X1} y1={g.y} y2={g.y} stroke="#e3e8ec" />
          <text x={X0 - 8} y={g.y + 4} className="svt-end">{g.label}</text>
        </g>
      ))}
      <text x={8} y={296} className="svt-b">TEMPERATURE</text>
      <text x={8} y={312} className="svt">°C through depth</text>
      <polygon points={fixed.envelope} fill="#0b63b5" opacity={0.12} />
      <line x1={X0} x2={X1} y1={tinY} y2={tinY} stroke="#2d7a4d" strokeWidth={1.5} strokeDasharray="5 4" />
      <polyline points={filmOut} fill="none" stroke="#c75b00" strokeWidth={1.5} strokeDasharray="3 3" />
      <polyline points={filmIn} fill="none" stroke="#2d7a4d" strokeWidth={1.5} strokeDasharray="3 3" />
      <polyline points={profile} fill="none" stroke="#14212b" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={X0 - 28} cy={saY} r={5} fill="#c75b00" />
      <circle cx={X1 + 28} cy={tinY} r={5} fill="#2d7a4d" />
      <text x={X0 - 28} y={saY - 9} className="svt-mid">sol-air</text>

      {fixed.ticksX.map((t) => (
        <text key={t.label} x={t.x} y={378} className="svt-mid">{t.label}</text>
      ))}
      <text x={450} y={398} className="svt-mid">depth through the wall, mm (shaded band = range over the 24 h)</text>
    </svg>
  );
}
