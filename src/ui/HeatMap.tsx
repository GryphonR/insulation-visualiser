import { useMemo } from 'react';
import { cmap, pad2 } from '../lib/util';
import type { ScenarioResult } from '../engine/scenario';
import { FRAMES_PER_HOUR } from '../engine/simulate';

const PL = 104;
const PR = 548;
const PT = 14;
const PB = 250;
const COLS = 48;

export function HeatMap({ res, frame }: { res: ScenarioResult; frame: number }) {
  const { sim } = res;
  const geo = useMemo(() => {
    const sy = (PB - PT) / sim.total;
    const cw = (PR - PL) / COLS;
    const rects: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
    for (let j = 0; j < COLS; j++) {
      const ct = sim.fr.cellT[j * 3];
      sim.cells.forEach((c, i) => {
        rects.push({
          x: PL + j * cw,
          y: PT + c.x0 * sy,
          w: cw + 0.6,
          h: (c.x1 - c.x0) * sy + 0.6,
          fill: cmap((ct[i] - sim.tlo) / (sim.thi - sim.tlo)),
        });
      });
    }
    const lines: number[] = [];
    const labels: Array<{ y: number; t: string }> = [];
    let lastY = -99;
    sim.lay.forEach((l, i) => {
      if (i > 0) lines.push(PT + l.x0 * sy);
      const yc = PT + ((l.x0 + l.x1) / 2) * sy + 4;
      if (yc - lastY >= 12) {
        const nm = l.name.length > 16 ? l.name.slice(0, 15) + '…' : l.name;
        labels.push({ y: yc, t: (l.x1 - l.x0) * sy >= 14 ? `${i + 1} ${nm}` : String(i + 1) });
        lastY = yc;
      }
    });
    return { rects, lines, labels };
  }, [sim]);

  const cx = PL + ((PR - PL) * (frame / FRAMES_PER_HOUR)) / 24;
  return (
    <div className="card chart-card">
      <div>
        <h3>Depth × time</h3>
        <p className="muted">Outside face at the top. Watch the warm band slant down and fade as it travels inward.</p>
      </div>
      <svg viewBox="0 0 560 300" role="img" aria-label="Heat map of temperature by depth through the wall and time of day, same colour scale as the cross-section" className="svg-fluid">
        {geo.rects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} shapeRendering="crispEdges" />
        ))}
        <rect x={PL} y={PT} width={PR - PL} height={PB - PT} fill="none" stroke="#14212b" />
        {geo.lines.map((y, i) => (
          <line key={i} x1={PL} x2={PR} y1={y} y2={y} stroke="#14212b" strokeDasharray="2 3" opacity={0.55} />
        ))}
        {geo.labels.map((l, i) => (
          <text key={i} x={98} y={l.y} className="svt-end">{l.t}</text>
        ))}
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={PL + ((PR - PL) * h) / 24} y={268} className="svt-mid">{pad2(h)}</text>
        ))}
        <line x1={cx} x2={cx} y1={PT} y2={PB} stroke="#14212b" strokeWidth={1.5} />
        <text x={326} y={288} className="svt-mid">solar time, hours</text>
      </svg>
      <p className="note">
        Peak temperature reaches the inner face about {sim.lag.toFixed(1)} h after it peaks outside, at {(sim.decr * 100).toFixed(0)}% of the steady-state swing.
      </p>
    </div>
  );
}
