import { CHART, xOf } from './charts';
import type { ChartSpec } from './charts';
import { FRAMES_PER_HOUR } from '../engine/simulate';

function legendSwatch(dash: string | undefined, col: string): React.CSSProperties {
  const style = !dash ? 'solid' : parseInt(dash, 10) <= 3 ? 'dotted' : 'dashed';
  return { display: 'inline-block', width: 24, height: 0, borderTop: `3px ${style} ${col}` };
}

export function LineChart({ spec, frame }: { spec: ChartSpec; frame: number }) {
  const cx = xOf(frame / FRAMES_PER_HOUR);
  return (
    <div className="card chart-card">
      <div>
        <h3>{spec.title}</h3>
        <p className="muted">{spec.sub}</p>
      </div>
      <div className="legend">
        {spec.series.map((s) => (
          <span key={s.name} className="legend-item">
            <span style={legendSwatch(s.dash, s.col)} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${CHART.W} ${CHART.H}`} role="img" aria-label={spec.alt} className="svg-fluid">
        {spec.ticksY.map((t) => (
          <g key={t.label}>
            <line x1={CHART.PL} x2={CHART.PR} y1={t.y} y2={t.y} className={t.zero ? 'grid zero' : 'grid'} />
            <text x={CHART.PL - 6} y={t.y + 4} className="svt-end">{t.label}</text>
          </g>
        ))}
        {spec.ticksX.map((t) => (
          <g key={t.label}>
            <line x1={t.x} x2={t.x} y1={CHART.PT} y2={CHART.PB} className="grid-v" />
            <text x={t.x} y={206} className="svt-mid">{t.label}</text>
          </g>
        ))}
        {spec.area && <polygon points={spec.area} fill="#f2a900" opacity={0.28} />}
        {spec.series.map((s) => (
          <polyline
            key={s.name}
            points={s.points}
            fill="none"
            stroke={s.col}
            strokeWidth={s.sw}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        <line x1={cx} x2={cx} y1={CHART.PT} y2={CHART.PB} stroke="#14212b" strokeWidth={1.2} />
        {spec.series.map((s) => (
          <circle key={s.name} cx={cx} cy={spec.yOf(s.arr[frame])} r={4.5} fill={s.col} stroke="#fff" strokeWidth={1.5} />
        ))}
        <text x={298} y={218} className="svt-mid">solar time, hours</text>
      </svg>
      <p className="note">{spec.note}</p>
    </div>
  );
}
