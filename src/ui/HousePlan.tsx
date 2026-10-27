import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onStorey, roomEdges, roomPoly } from '../engine/house';
import type { House, Room } from '../engine/house';
import { centroid } from '../engine/geom';
import type { Pt } from '../engine/geom';

export const PLAN_S = 48, PLAN_PAD = 34;
const SNAP = 0.05;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/** Bounds of every room on every storey, so storeys line up. */
export function planBounds(h: House) {
  const pts = h.rooms.flatMap(roomPoly);
  if (!pts.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX: Math.min(0, ...pts.map((p) => p[0])), minY: Math.min(0, ...pts.map((p) => p[1])), maxX: Math.max(1, ...pts.map((p) => p[0])), maxY: Math.max(1, ...pts.map((p) => p[1])) };
}

/**
 * The plan of one storey: rooms of any shape, windows and doors on their walls, the selected room outlined,
 * and corner handles to reshape a polygon room (drag a corner, click + on a wall to add one).
 */
export function HousePlan({ house, storey, sel, setSel, fill, label, editOutline, onOutline, underlay, overlay, readOnly }: {
  house: House; storey: number; sel: string; setSel: (id: string) => void;
  fill: (r: Room) => string; label: (r: Room) => string;
  editOutline: boolean;
  /** No room selection outline or corner handles (a plan used as a backdrop). */
  readOnly?: boolean;
  /** New outline for a room; `insertedAfter` is the corner index a new corner was added after (walls after it renumber). */
  onOutline: (id: string, poly: Pt[], insertedAfter?: number) => void;
  /** Drawn under the rooms (a traced plan or satellite image), in plan coordinates via the `to` mapper. */
  underlay?: (to: (p: Pt) => Pt, S: number) => ReactNode;
  /** Drawn over the rooms (UFH loops, pipes); `from` turns a pointer event into plan metres (snapped). */
  overlay?: (to: (p: Pt) => Pt, S: number, from: (e: React.PointerEvent) => Pt | null) => ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; i: number; poly: Pt[] } | null>(null);
  const S = PLAN_S, PAD = PLAN_PAD, b = planBounds(house);
  const to = (p: Pt): Pt => [PAD + (p[0] - b.minX) * S, PAD + (p[1] - b.minY) * S];
  const fromEvent = (e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current, m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [snap((pt.x - PAD) / S + b.minX), snap((pt.y - PAD) / S + b.minY)];
  };
  const onThis = house.rooms.filter((r) => onStorey(r, storey));
  const polyOf = (r: Room) => (drag && drag.id === r.id ? drag.poly : roomPoly(r));
  const pts = (p: Pt[]) => p.map((q) => to(q).join(',')).join(' ');
  const selRoom = onThis.find((r) => r.id === sel);

  return (
    <svg ref={svgRef} className="plan" viewBox={`0 0 ${(b.maxX - b.minX) * S + PAD * 2} ${(b.maxY - b.minY) * S + PAD * 2}`} role="img" aria-label={`${house.storeys[storey]?.name} plan`}
      onPointerMove={(e) => { if (!drag) return; const p = fromEvent(e); if (p) setDrag({ ...drag, poly: drag.poly.map((q, i) => (i === drag.i ? p : q)) }); }}
      onPointerUp={() => { if (drag) { onOutline(drag.id, drag.poly); setDrag(null); } }}>
      {underlay?.(to, S)}
      <text x={PAD + ((b.maxX - b.minX) * S) / 2} y={18} textAnchor="middle" className="plan-n">N</text>
      {onThis.map((r) => {
        const p = polyOf(r), c = to(centroid(p));
        return (
          <g key={r.id} onClick={() => setSel(r.id)} className="plan-room">
            <polygon points={pts(p)} fill={fill(r)} stroke="#14212b" strokeWidth={1.5} />
            <text x={c[0]} y={c[1] - 4} textAnchor="middle" className="plan-t">{r.name}</text>
            <text x={c[0]} y={c[1] + 12} textAnchor="middle" className="plan-s">{label(r)}</text>
            {r.span > 1 && storey > r.storey && <text x={c[0]} y={c[1] + 26} textAnchor="middle" className="plan-s">(open to below)</text>}
          </g>
        );
      })}
      {onThis.filter((r) => r.storey === storey).flatMap((r) => {
        const es = roomEdges({ ...r, poly: r.poly ? polyOf(r) : undefined });
        const isPoly = !!r.poly;
        return es.flatMap((e) => {
          const ops = house.openings.filter((o) => o.room === r.id && (isPoly ? (o.edge ?? es.findIndex((x) => x.side === o.side)) === e.idx : o.side === e.side));
          return ops.map((o, i) => {
            const L = e.len, half = Math.min(L / ops.length - 0.15, o.w) / 2, c = o.t != null ? Math.max(half, Math.min(L - half, o.t)) : (L * (i + 0.5)) / ops.length;
            const a = to([e.a[0] + e.d[0] * (c - half), e.a[1] + e.d[1] * (c - half)]), z = to([e.a[0] + e.d[0] * (c + half), e.a[1] + e.d[1] * (c + half)]);
            const door = house.buildups.find((x) => x.id === o.buildup)?.kind === 'door';
            return <line key={o.id} x1={a[0]} y1={a[1]} x2={z[0]} y2={z[1]} className={door ? 'plan-door' : 'plan-win'} />;
          });
        });
      })}
      {overlay?.(to, S, fromEvent)}
      {!readOnly && selRoom && <polygon points={pts(polyOf(selRoom))} fill="none" stroke="#c2410c" strokeWidth={3} pointerEvents="none" />}
      {!readOnly && selRoom && editOutline && selRoom.poly && (() => {
        const p = polyOf(selRoom);
        return <>
          {p.map((q, i) => {
            const n = p[(i + 1) % p.length], m = to([(q[0] + n[0]) / 2, (q[1] + n[1]) / 2]);
            return (
              <g key={`m${i}`} className="vx-add" onClick={(e) => { e.stopPropagation(); const np = [...p]; np.splice(i + 1, 0, [snap((q[0] + n[0]) / 2), snap((q[1] + n[1]) / 2)]); onOutline(selRoom.id, np, i); }}>
                <circle cx={m[0]} cy={m[1]} r={7} /><text x={m[0]} y={m[1] + 4} textAnchor="middle">+</text>
              </g>
            );
          })}
          {p.map((q, i) => {
            const v = to(q);
            return <circle key={`v${i}`} cx={v[0]} cy={v[1]} r={7} className="vx" aria-label={`Corner ${i + 1}`}
              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: selRoom.id, i, poly: p }); }} />;
          })}
        </>;
      })()}
    </svg>
  );
}
