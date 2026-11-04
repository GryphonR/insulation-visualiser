import { bearingLabel, roomEdges, shapeGeo, shapeOf, trueBearing } from '../engine/house';
import { useProject } from './project';
import type { EdgeSlope, Room, RoomShape, SlopeSide } from '../engine/house';
import { Chip } from './controls';

const fmt = (v: number, d = 1) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const PRESETS: Array<[string, string, [SlopeSide, SlopeSide] | null]> = [
  ['flat', 'Flat ceiling', null], ['c1', 'Coombed, one side', ['plate', 'full']], ['c2', 'Coombed, both sides', ['plate', 'plate']], ['rir', 'Room in roof', ['knee', 'knee']],
];
export const DEFAULT_SHAPE: RoomShape = { axis: 'ew', sides: ['knee', 'knee'], pitch: 40, knee: 1.0, ceiling: 2.3, eaves: ['cold', 'cold'], dormers: [null, null], rooflight: 0 };

/** Sloping ceilings, knee walls and dormers for a top-storey room (board 1c), with a live cross-section. */
export function RoomShapeEditor({ room, setShape, outside }: {
  room: Room; setShape: (s: RoomShape | undefined) => void;
  /** Which walls (in outline order) face outside: the presets slope those. */
  outside?: boolean[];
}) {
  if (room.poly && room.poly.length >= 3) return <PolyShapeEditor room={room} setShape={setShape} outside={outside ?? []} />;
  const sh = room.shape;
  const preset = !sh ? 'flat' : PRESETS.find((p) => p[2] && p[2][0] === sh.sides[0] && p[2][1] === sh.sides[1])?.[0] ?? 'custom';
  const set = (patch: Partial<RoomShape>) => sh && setShape({ ...sh, ...patch });
  const g = sh ? shapeGeo(room, sh) : null;
  const sideName = (i: number) => (sh?.axis === 'ns' ? ['North', 'South'] : ['West', 'East'])[i];

  // Section drawing, metres → px.
  let svg = null;
  if (g && sh) {
    const S = 60, eL = sh.sides[0] === 'knee' ? -g.k / g.t : 0, eR = g.W + (sh.sides[1] === 'knee' ? g.k / g.t : 0);
    const minX = Math.min(0, eL) - 0.4, maxX = Math.max(g.W, eR) + 0.4, maxY = g.hc + 0.6;
    const P = (x: number, y: number) => `${((x - minX) * S).toFixed(1)},${((maxY - y) * S).toFixed(1)}`;
    const room2 = [[0, 0], [g.W, 0], [g.W, g.sloped[1] ? g.k : g.hc], [g.W - g.run[1], g.hc], [g.run[0], g.hc], [0, g.sloped[0] ? g.k : g.hc]];
    const voids = [0, 1].filter((i) => sh.sides[i] === 'knee').map((i) => (i === 0 ? [[0, 0], [0, g.k], [eL, 0]] : [[g.W, 0], [g.W, g.k], [eR, 0]]));
    const dorm = [0, 1].flatMap((i) => { const d = g.dormers[i]; if (!d) return []; return [i === 0 ? [[0, g.k], [0, d.hd], [d.xr, d.hd]] : [[g.W, g.k], [g.W, d.hd], [g.W - d.xr, d.hd]]]; });
    const W = (maxX - minX) * S, H = (maxY + 0.3) * S;
    svg = (
      <svg className="shape-svg" viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} role="img" aria-label={`Section across ${room.name}`}>
        <line x1={0} x2={W} y1={maxY * S} y2={maxY * S} stroke="#14212b" />
        {voids.map((v, i) => <polygon key={`v${i}`} points={v.map(([x, y]) => P(x, y)).join(' ')} fill="#e8eef3" stroke="#8a96a1" strokeDasharray="4 3" />)}
        <polygon points={room2.map(([x, y]) => P(x, y)).join(' ')} fill="#fdf3ea" stroke="#14212b" strokeWidth={2} />
        {dorm.map((d, i) => <polygon key={`d${i}`} points={d.map(([x, y]) => P(x, y)).join(' ')} fill="#fdf3ea" stroke="#c2410c" strokeWidth={2} strokeDasharray="5 3" />)}
        {g.hc >= 1.5 && <line x1={(0 - minX) * S} x2={(g.W - minX) * S} y1={(maxY - 1.5) * S} y2={(maxY - 1.5) * S} stroke="#9a3412" strokeDasharray="2 3" />}
        <text x={(g.W / 2 - minX) * S} y={(maxY - g.hc / 2) * S} textAnchor="middle" className="plan-s">{fmt(g.A)} m² section</text>
        <text x={(g.W / 2 - minX) * S} y={(maxY - 1.5) * S - 4} textAnchor="middle" className="plan-s" fill="#9a3412">1.5 m headroom</text>
      </svg>
    );
  }

  return (
    <div className="shape-ed">
      <div className="eyebrow">Ceiling shape</div>
      <div className="chips">
        {PRESETS.map(([id, label, sides]) => (
          <Chip key={id} on={preset === id} onClick={() => setShape(sides ? { ...(sh ?? DEFAULT_SHAPE), sides, dormers: sh?.dormers ?? [null, null] } : undefined)}>{label}</Chip>
        ))}
      </div>
      {sh && g && <>
        <div className="hf-row">
          <label className="hf"><span className="eyebrow">Slopes on</span>
            <select className="select" value={sh.axis} onChange={(e) => set({ axis: e.target.value as RoomShape['axis'] })}>
              <option value="ew">West and east sides</option><option value="ns">North and south sides</option>
            </select>
          </label>
          {[0, 1].map((i) => (
            <label key={i} className="hf"><span className="eyebrow">{sideName(i)} side</span>
              <select className="select" value={sh.sides[i]} onChange={(e) => { const s = [...sh.sides] as RoomShape['sides']; s[i] = e.target.value as SlopeSide; set({ sides: s }); }}>
                <option value="full">Full-height wall</option><option value="plate">Coombed (wall to plate)</option><option value="knee">Knee wall + eaves void</option>
              </select>
            </label>
          ))}
        </div>
        <div className="hf-row">
          {([['Roof pitch', 'pitch', 1, '°'], [sh.sides.includes('knee') ? 'Knee wall height' : 'Wall plate height', 'knee', 0.05, 'm'], ['Ceiling height (flat part)', 'ceiling', 0.05, 'm']] as const).map(([l, k, step, u]) => (
            <label key={k} className="hf"><span className="eyebrow">{l}</span>
              <span className="hf-in"><input type="number" className="thk-input" step={step} value={sh[k]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ [k]: v } as Partial<RoomShape>); }} /><span className="small muted">{u}</span></span>
            </label>
          ))}
          <label className="hf"><span className="eyebrow">Rooflight ({sideName(0).toLowerCase()} slope)</span>
            <span className="hf-in"><input type="number" className="thk-input" step={0.1} min={0} value={sh.rooflight} onChange={(e) => set({ rooflight: Math.max(0, Number(e.target.value) || 0) })} /><span className="small muted">m²</span></span>
          </label>
        </div>
        {svg}
        <p className="small mono">Ceiling {fmt(g.hc, 2)} m{g.hc < sh.ceiling - 0.01 ? ` (the most this pitch allows)` : ''} · flat part {fmt(g.fw, 2)} m wide · volume {fmt(g.V)} m³</p>
        {[0, 1].map((i) => sh.sides[i] !== 'full' && (
          <div key={i} className="hf-row shape-side">
            <span className="small"><b>{sideName(i)} slope</b></span>
            {sh.sides[i] === 'knee' && (
              <label className="small">Eaves roof{' '}
                <select className="h-sel" value={sh.eaves[i]} onChange={(e) => { const ev = [...sh.eaves] as RoomShape['eaves']; ev[i] = e.target.value as 'cold' | 'warm'; set({ eaves: ev }); }}>
                  <option value="cold">Cold (tiles only)</option><option value="warm">Warm (insulated like the slope)</option>
                </select>
              </label>
            )}
            <label className="small"><input type="checkbox" checked={!!sh.dormers[i]} onChange={(e) => { const d = [...sh.dormers] as RoomShape['dormers']; d[i] = e.target.checked ? { w: 1.8, front: Math.min(2.3, g.hc), window: 1.0 } : null; set({ dormers: d }); }} /> Dormer</label>
            {sh.dormers[i] && (['w', 'front', 'window'] as const).map((k) => (
              <label key={k} className="small">{{ w: 'width', front: 'front height', window: 'window' }[k]}{' '}
                <input type="number" className="thk-input" step={0.1} value={sh.dormers[i]![k]} onChange={(e) => { const d = [...sh.dormers] as RoomShape['dormers']; d[i] = { ...d[i]!, [k]: Number(e.target.value) || 0 }; set({ dormers: d }); }} /> {k === 'window' ? 'm²' : 'm'}
              </label>
            ))}
          </div>
        ))}
        <p className="small muted">Slopes, knee walls and dormers take their build-ups from the Build-ups defaults; change any one face in the table below. A knee wall is counted in series with the roof over its eaves void.</p>
      </>}
    </div>
  );
}

const SIDE_LABEL: Record<SlopeSide, string> = { full: 'Full-height wall', plate: 'Coombed (wall to plate)', knee: 'Knee wall + eaves void' };

/** Sloping ceilings on a room of any shape: one setting per wall, slopes rising inward from each sloped wall. */
function PolyShapeEditor({ room, setShape, outside }: { room: Room; setShape: (s: RoomShape | undefined) => void; outside: boolean[] }) {
  const { house } = useProject();
  const sh = room.shape, es = roomEdges(room);
  const edges: EdgeSlope[] = es.map((_, i) => sh?.edges?.[i] ?? { side: 'full', eaves: 'cold', dormer: null });
  const only = (side: SlopeSide) => edges.every((e, i) => e.side === (outside[i] ? side : 'full'));
  const preset = !sh ? 'flat' : only('plate') ? 'plate' : only('knee') ? 'knee' : 'custom';
  const base: RoomShape = sh ?? { ...DEFAULT_SHAPE };
  const all = (side: SlopeSide) => setShape({ ...base, edges: es.map((_, i) => ({ side: outside[i] ? side : 'full', eaves: 'cold', dormer: null })) });
  const setEdge = (i: number, patch: Partial<EdgeSlope>) => setShape({ ...base, edges: edges.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const set = (patch: Partial<RoomShape>) => { if (sh) setShape({ ...sh, ...patch, edges }); };
  const g = sh ? shapeOf(room, { ...sh, edges }) : null;
  const FIELDS: Array<[string, 'pitch' | 'knee' | 'ceiling' | 'rooflight', number, string]> = [
    ['Roof pitch', 'pitch', 1, '°'], ['Knee / wall plate height', 'knee', 0.05, 'm'], ['Flat ceiling height', 'ceiling', 0.05, 'm'], ['Rooflight (first slope)', 'rooflight', 0.1, 'm²'],
  ];
  return (
    <div className="shape-ed">
      <div className="eyebrow">Ceiling shape</div>
      <div className="chips">
        <Chip on={preset === 'flat'} onClick={() => setShape(undefined)}>Flat ceiling</Chip>
        <Chip on={preset === 'plate'} onClick={() => all('plate')}>Coombed on outside walls</Chip>
        <Chip on={preset === 'knee'} onClick={() => all('knee')}>Room in roof</Chip>
        {preset === 'custom' && <Chip on onClick={() => {}}>Custom</Chip>}
      </div>
      {sh && g && <>
        <div className="hf-row">
          {FIELDS.map(([l, k, step, u]) => (
            <label key={k} className="hf"><span className="eyebrow">{l}</span>
              <span className="hf-in"><input type="number" className="thk-input" step={step} min={0} value={sh[k]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ [k]: v }); }} /><span className="small muted">{u}</span></span>
            </label>
          ))}
        </div>
        <div className="h-table-wrap">
          <table className="h-table">
            <thead><tr><th>Wall</th><th>Meets the roof as</th><th>Eaves roof</th><th>Dormer: width, front height, window m²</th></tr></thead>
            <tbody>
              {es.map((e, i) => (
                <tr key={i}>
                  <td>Wall {i + 1} <span className="muted small">({bearingLabel(trueBearing(house, e.az))}, {fmt(e.len, 2)} m{outside[i] ? '' : ', inside'})</span></td>
                  <td>
                    <select className="h-sel" value={edges[i].side} aria-label={`Wall ${i + 1} slope`} onChange={(ev) => setEdge(i, { side: ev.target.value as SlopeSide, dormer: ev.target.value === 'full' ? null : edges[i].dormer })}>
                      {(Object.keys(SIDE_LABEL) as SlopeSide[]).map((k) => <option key={k} value={k}>{SIDE_LABEL[k]}</option>)}
                    </select>
                  </td>
                  <td>
                    {edges[i].side === 'knee'
                      ? <select className="h-sel" value={edges[i].eaves} aria-label={`Wall ${i + 1} eaves`} onChange={(ev) => setEdge(i, { eaves: ev.target.value as 'cold' | 'warm' })}><option value="cold">Cold (tiles only)</option><option value="warm">Warm (insulated)</option></select>
                      : <span className="muted small">—</span>}
                  </td>
                  <td>
                    {edges[i].side !== 'full' && (
                      <span className="dormer-row small">
                        <input type="checkbox" aria-label={`Wall ${i + 1} dormer`} checked={!!edges[i].dormer} onChange={(ev) => setEdge(i, { dormer: ev.target.checked ? { w: Math.max(0.6, Math.min(1.8, e.len - 0.3)), front: Math.min(2.3, g.hc), window: 1 } : null })} />
                        {edges[i].dormer && (['w', 'front', 'window'] as const).map((k) => (
                          <input key={k} type="number" className="thk-input" step={0.1} aria-label={`Wall ${i + 1} dormer ${k}`} value={edges[i].dormer![k]} onChange={(ev) => setEdge(i, { dormer: { ...edges[i].dormer!, [k]: Number(ev.target.value) || 0 } })} />
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small mono">Volume {fmt(g.V)} m³ · flat ceiling {fmt(g.flatA, 1)} m² · slopes: {g.slopes.map((x) => `wall ${x.i + 1} ${fmt(x.area, 1)} m²`).join(', ') || 'none'}</p>
        <p className="small muted">From each sloped wall the ceiling rises at the roof pitch from the knee or plate height; where slopes meet they form hips, and above the flat-ceiling height the ceiling is flat. Slopes, knee walls and dormers take their build-ups from the Build-ups defaults.</p>
      </>}
    </div>
  );
}
