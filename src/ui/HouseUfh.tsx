import { useState } from 'react';
import { onStorey, roomPoly } from '../engine/house';
import type { House } from '../engine/house';
import { loopArea, loopLength, loopMax } from '../engine/house-heating';
import type { Emitter } from '../engine/house-heating';
import { PATTERNS, loopLayout } from '../engine/house-ufh';
import type { Corner, LoopPattern } from '../engine/house-ufh';
import type { Pt } from '../engine/geom';
import { Chip } from './controls';
import { HousePlan } from './HousePlan';
import { fmt } from './hform';

type Drag = { kind: 'move' | 'size'; id: string; start: Pt; orig: { x: number; y: number; w: number; h: number } } | { kind: 'man'; id: string; start: Pt; orig: { x: number; y: number } };

/** A room's bounding box less 10 cm all round: where a new loop starts. */
export function defaultLoopRect(h: House, roomId: string) {
  const p = roomPoly(h.rooms.find((r) => r.id === roomId)!);
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  return { x: Math.min(...xs) + 0.1, y: Math.min(...ys) + 0.1, w: Math.max(0.3, Math.max(...xs) - Math.min(...xs) - 0.2), h: Math.max(0.3, Math.max(...ys) - Math.min(...ys) - 0.2) };
}

/** Board 1b: UFH loops and manifolds drawn on the plan, routed in the chosen pattern. */
export function HouseUfh({ house, upd }: { house: House; upd: (fn: (h: House) => void) => void }) {
  const ufh = house.heating.emitters.filter((e) => e.kind === 'ufh');
  const storeys = [...new Set(ufh.map((e) => house.rooms.find((r) => r.id === e.room)?.storey ?? 0))].sort();
  const [storey, setStorey] = useState(storeys[0] ?? 0);
  const [sel, setSel] = useState(ufh[0]?.id ?? '');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<House | null>(null);
  const shown = preview ?? house;
  const roomName = (id: string) => house.rooms.find((r) => r.id === id)?.name ?? id;
  const setE = (id: string, patch: Partial<Emitter>) => upd((h) => { const e = h.heating.emitters.find((x) => x.id === id); if (e) Object.assign(e, patch); });
  const loops = shown.heating.emitters.filter((e) => e.kind === 'ufh' && e.rect && onStorey(house.rooms.find((r) => r.id === e.room) ?? { storey: -1, span: 1 } as never, storey));
  const mans = shown.heating.zones.filter((z) => z.kind === 'ufh' && z.manifold && shown.heating.emitters.some((e) => e.zone === z.id && e.kind === 'ufh' && house.rooms.find((r) => r.id === e.room)?.storey === storey));
  const cur = house.heating.emitters.find((e) => e.id === sel && e.kind === 'ufh');

  const moveTo = (p: Pt) => {
    if (!drag) return;
    const c = (v: number) => Math.round(v * 100) / 100;
    const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1], n = structuredClone(house);
    if (drag.kind === 'man') { const z = n.heating.zones.find((x) => x.id === drag.id); if (z) z.manifold = { x: c(drag.orig.x + dx), y: c(drag.orig.y + dy) }; }
    else {
      const e = n.heating.emitters.find((x) => x.id === drag.id);
      const o = drag.orig as { x: number; y: number; w: number; h: number };
      if (e) e.rect = drag.kind === 'move' ? { ...o, x: c(o.x + dx), y: c(o.y + dy) } : { ...o, w: c(Math.max(0.3, o.w + dx)), h: c(Math.max(0.3, o.h + dy)) };
    }
    setPreview(n);
  };
  const finish = () => {
    if (preview) {
      const p = preview;
      upd((h) => { h.heating.emitters = p.heating.emitters; h.heating.zones = p.heating.zones; });
    }
    setDrag(null); setPreview(null);
  };

  if (!ufh.length) return null;
  return (
    <section className="card panel">
      <div className="section-head">
        <div><h2>UFH layout</h2><p className="muted small">Each loop is laid in a rectangle in its room and fed from a corner; tails run square to the zone's manifold. Drag a loop to move it, its corner to resize it, the square to move the manifold.</p></div>
        <div className="chips">{house.storeys.map((s, i) => storeys.includes(i) && <Chip key={i} on={storey === i} onClick={() => setStorey(i)}>{s.name}</Chip>)}</div>
      </div>
      <HousePlan house={house} storey={storey} sel="" setSel={() => {}} editOutline={false} onOutline={() => {}} readOnly
        fill={(r) => (ufh.some((e) => e.room === r.id) ? '#f6f0fb' : '#fff')} label={() => ''}
        overlay={(to, S, from) => (
          <g>
            {loops.map((e) => {
              const lay = loopLayout(shown, e)!, r = e.rect!, a = to([r.x, r.y]), z = to([r.x + r.w, r.y + r.h]);
              const line = (p: Pt[]) => p.map((q) => to(q).join(',')).join(' ');
              const on = e.id === sel;
              return (
                <g key={e.id}>
                  <rect x={a[0]} y={a[1]} width={z[0] - a[0]} height={z[1] - a[1]} className={on ? 'loop-box on' : 'loop-box'}
                    onPointerDown={(ev) => { const p = from(ev); if (!p) return; setSel(e.id); setDrag({ kind: 'move', id: e.id, start: p, orig: { ...r } }); }} />
                  <polyline points={line(lay.route.flow)} className="pipe-flow" />
                  <polyline points={line(lay.route.ret)} className="pipe-ret" />
                  {lay.route.bend.length > 1 && <polyline points={line(lay.route.bend)} className="pipe-bend" />}
                  {lay.tails && <polyline points={line(lay.tails)} className="pipe-tail" />}
                  {on && <rect x={z[0] - 8} y={z[1] - 8} width={16} height={16} className="vx" onPointerDown={(ev) => { ev.stopPropagation(); const p = from(ev); if (p) setDrag({ kind: 'size', id: e.id, start: p, orig: { ...r } }); }} />}
                  <text x={a[0] + 4} y={a[1] + 12} className="plan-s loop-label">{roomName(e.room)} · {fmt(lay.total)} m</text>
                </g>
              );
            })}
            {mans.map((zn) => { const m = to([zn.manifold!.x, zn.manifold!.y]); return (
              <g key={zn.id} onPointerDown={(ev) => { const p = from(ev); if (p) setDrag({ kind: 'man', id: zn.id, start: p, orig: { ...zn.manifold! } }); }} className="manifold">
                <rect x={m[0] - 9} y={m[1] - 9} width={18} height={18} fill={zn.color} /><text x={m[0]} y={m[1] + 22} textAnchor="middle" className="plan-s">{zn.name}</text>
              </g>
            ); })}
            {void S}
            {/* While dragging, a layer on top catches every move. */}
            {drag && <rect x={-1e4} y={-1e4} width={2e4} height={2e4} fill="transparent" onPointerMove={(e) => { const p = from(e); if (p) moveTo(p); }} onPointerUp={finish} />}
          </g>
        )} />

      <div className="h-table-wrap">
        <table className="h-table">
          <thead><tr><th>Loop</th><th>Pattern</th><th>Fed from</th><th className="n">m²</th><th className="n">Length m</th><th /></tr></thead>
          <tbody>
            {ufh.map((e) => {
              const len = loopLength(e, house), lay = loopLayout(house, e);
              return (
                <tr key={e.id} className={e.id === sel ? 'on' : ''} onClick={() => setSel(e.id)}>
                  <td>{roomName(e.room)}</td>
                  <td><select className="h-sel" value={e.pattern ?? 'spiral'} aria-label="Pattern" onChange={(ev) => setE(e.id, { pattern: ev.target.value as LoopPattern })}>{(Object.keys(PATTERNS) as LoopPattern[]).map((k) => <option key={k} value={k}>{PATTERNS[k][0]}</option>)}</select></td>
                  <td><select className="h-sel" value={e.corner ?? 'nw'} aria-label="Feed corner" onChange={(ev) => setE(e.id, { corner: ev.target.value as Corner })}>{(['nw', 'ne', 'sw', 'se'] as Corner[]).map((k) => <option key={k} value={k}>{k.toUpperCase()} corner</option>)}</select></td>
                  <td className="n mono">{fmt(loopArea(e), 1)}</td>
                  <td className={`n mono ${len > loopMax(e) ? 'bad' : ''}`}>{fmt(len)}{lay ? ` (${fmt(lay.route.inFloor)} in floor)` : ' est.'}</td>
                  <td>{e.fromZone ? <span className="small muted">From {house.zones?.find((x) => x.id === e.fromZone)?.name ?? 'a UFH zone'}</span> : e.rect ? <button type="button" className="btn-link" onClick={() => setE(e.id, { rect: undefined })}>Undraw</button>
                    : <button type="button" className="btn-link" onClick={() => {
                        upd((h) => {
                          const x = h.heating.emitters.find((y) => y.id === e.id)!;
                          x.rect = defaultLoopRect(h, e.room);
                          const z = h.heating.zones.find((y) => y.id === x.zone);
                          if (z && !z.manifold) z.manifold = { x: x.rect.x, y: x.rect.y + x.rect.h + 0.3 };
                        });
                        setSel(e.id); setStorey(house.rooms.find((r) => r.id === e.room)?.storey ?? 0);
                      }}>Draw on plan</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cur && <p className="small muted">{PATTERNS[cur.pattern ?? 'spiral'][1]}</p>}
    </section>
  );
}
