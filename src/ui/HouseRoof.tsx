import { SIDES, bearingLabel, ceilingCap, roofEdgesOf, roofOutlines, roofParts, roofPlate, roofStorey, roomRoof, trueBearing } from '../engine/house';
import type { House, HouseResult, RoofForm, RoofSection, Room } from '../engine/house';
import { roofAt } from '../engine/house-roof';
import { edges, pointInPoly, polyArea } from '../engine/geom';
import type { Pt } from '../engine/geom';
import { Chip } from './controls';
import { Num, fmt, uid, NumInput } from './hform';

type Upd = (fn: (h: House) => void) => void;
const FORMS: Array<[RoofForm, string]> = [['gable', 'Gable'], ['hip', 'Hipped'], ['mono', 'Monopitch'], ['flat', 'Flat'], ['custom', 'Each edge']];

/** A new roof section: hipped, on the top storey's wall plate, over a drawn outline (or following the rooms when none). */
export function newRoof(h: House, poly?: Pt[]): RoofSection {
  const n = (h.roofs ?? []).length;
  return { id: uid('rf'), name: n ? `Roof ${n + 1}` : 'Main roof', form: 'hip', pitch: 35, eaves: 'cold', dormers: [], ...(poly ? { poly: poly.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)] as Pt) } : {}) };
}

/** Change one section in place. */
export const setRoof = (upd: Upd, id: string, fn: (s: RoofSection, h: House) => void) => upd((h) => { const s = h.roofs.find((x) => x.id === id); if (s) fn(s, h); });

/** Give a section that follows the rooms a drawn outline of its own (its current one), so it can be edited corner by corner. */
export function freezeOutline(h: House, s: RoofSection): void {
  if (s.poly) return;
  const o = roofOutlines(h, s)[0];
  if (o) s.poly = o.map(([x, y]) => [x, y] as Pt);
}

/** Highest point of a section above its storey's floor, sampled. */
function ridgeHeight(h: House, id: string): number {
  let top = 0;
  for (const p of roofParts(h).filter((q) => q.sec.id === id)) {
    const xs = p.poly.map((q) => q[0]), ys = p.poly.map((q) => q[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.2) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.2) {
      if (pointInPoly([x, y], p.poly)) top = Math.max(top, roofAt(p.model, [x, y]).z);
    }
  }
  return top;
}

/** Everything about one roof section: where it sits, its form and pitch, its edges, eaves and dormers. */
export function RoofSectionFields({ house, id, upd, onDeleted }: { house: House; id: string; upd: Upd; onDeleted?: () => void }) {
  const s = house.roofs.find((x) => x.id === id);
  if (!s) return null;
  const set = (fn: (x: RoofSection, h: House) => void) => setRoof(upd, id, fn);
  const outlines = roofOutlines(house, s), poly = outlines[0], es = poly ? edges(poly) : [], kinds = poly ? roofEdgesOf(s, poly) : [];
  const st = roofStorey(house, s), plate = roofPlate(house, s);
  const plan = outlines.reduce((t, p) => t + polyArea(p), 0);
  const eaves = es.map((e, i) => ({ e, i })).filter(({ i }) => kinds[i]?.kind === 'eave');
  const label = (i: number) => `Edge ${i + 1} (${bearingLabel(trueBearing(house, es[i].az))}, ${fmt(es[i].len, 1)} m)`;
  return (
    <div className="stack-10">
      <input className="h-text" value={s.name} aria-label="Roof name" onChange={(e) => set((x) => { x.name = e.target.value; })} />
      <p className="small muted">{fmt(plan, 1)} m² of plan · highest point {fmt(ridgeHeight(house, id), 2)} m above the {house.storeys[st]?.name.toLowerCase()} floor</p>
      <div className="hf-row">
        <label className="hf"><span className="eyebrow">Sits on</span>
          <select className="select" value={st} aria-label="Storey the roof sits on" onChange={(e) => set((x) => { const v = +e.target.value; if (v === house.storeys.length - 1) delete x.storey; else x.storey = v; })}>
            {house.storeys.map((q, i) => <option key={i} value={i}>{q.name}{i === house.storeys.length - 1 ? ' (top)' : ''}</option>)}
          </select>
        </label>
        <Num label="Wall plate" unit="m" step={0.05} min={0} value={plate} why="Height above that storey's floor where the slopes start. The storey height puts the roof on top of the walls, with a loft over flat ceilings; lower it for rooms in the roof, whose ceilings then slope down to knee walls."
          onChange={(v) => set((x, h) => { if (Math.abs(v - (h.storeys[roofStorey(h, x)]?.h ?? 0)) < 1e-6) delete x.plate; else x.plate = Math.max(0, v); })} />
        {s.form !== 'flat' && <Num label="Pitch" unit="°" step={1} min={0} max={75} value={s.pitch} onChange={(v) => set((x) => { x.pitch = Math.min(75, Math.max(0, v)); })} />}
      </div>
      <div className="chips" role="group" aria-label="Roof form">
        {FORMS.map(([k, l]) => <Chip key={k} on={s.form === k} onClick={() => set((x, h) => {
          if (k === 'custom') { freezeOutline(h, x); const p = x.poly; if (p) x.edges = roofEdgesOf(x, p); }
          x.form = k;
        })}>{l}</Chip>)}
      </div>
      {s.form === 'gable' && (
        <div className="chips" role="group" aria-label="Ridge runs">
          {([[undefined, 'Ridge along the longer side'], ['x', 'Left–right on the plan'], ['y', 'Up–down on the plan']] as const).map(([k, l]) => <Chip key={l} on={s.ridge === k} onClick={() => set((x) => { if (k) x.ridge = k; else delete x.ridge; })}>{l}</Chip>)}
        </div>
      )}
      {s.form === 'mono' && (
        <div className="chips" role="group" aria-label="Slope faces">
          {SIDES.map((q, i) => <Chip key={q} on={(s.facing ?? 'S') === q} onClick={() => set((x) => { x.facing = q; })}>{`Faces ${bearingLabel(trueBearing(house, i * 90))}`}</Chip>)}
        </div>
      )}
      {s.form === 'custom' && poly && (
        <table className="h-table">
          <thead><tr><th>Edge</th><th>Meets the roof as</th><th className="n">Pitch °</th></tr></thead>
          <tbody>
            {es.map((_, i) => (
              <tr key={i}>
                <td className="small">{label(i)}</td>
                <td><select className="h-sel" value={kinds[i].kind} aria-label={`${label(i)} kind`} onChange={(e) => set((x) => { x.edges = roofEdgesOf(x, poly); x.edges[i] = { ...x.edges[i], kind: e.target.value as 'eave' | 'gable' }; })}>
                  <option value="eave">Eave (a slope rises from it)</option><option value="gable">Gable (vertical end)</option>
                </select></td>
                <td className="n">{kinds[i].kind === 'eave' && <NumInput className="thk-input" step={1} min={0} max={75} value={kinds[i].pitch} aria-label={`${label(i)} pitch`}
                  onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set((x) => { x.edges = roofEdgesOf(x, poly); x.edges[i] = { ...x.edges[i], pitch: Math.min(75, Math.max(0, v)) }; }); }} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <label className="hf"><span className="eyebrow">Roof over eaves voids</span>
        <select className="select" value={s.eaves} aria-label="Roof over eaves voids" onChange={(e) => set((x) => { x.eaves = e.target.value as 'cold' | 'warm'; })}>
          <option value="cold">Cold: tiles only, insulation on the knee walls</option><option value="warm">Warm: insulated like the slopes</option>
        </select>
      </label>
      <div className="row-between">
        <span className="small">{s.poly ? 'Outline drawn on the plan.' : `Outline follows the ${house.storeys[st]?.name.toLowerCase()} rooms${outlines.length > 1 ? ` (${outlines.length} blocks)` : ''}.`}</span>
        {s.poly
          ? <button type="button" className="btn-link" onClick={() => set((x) => { delete x.poly; if (x.form === 'custom') { x.form = 'hip'; delete x.edges; } })}>Follow the rooms</button>
          : <button type="button" className="btn-link" onClick={() => set((x, h) => freezeOutline(h, x))}>Edit the outline</button>}
      </div>
      <span className="eyebrow">Dormers</span>
      {s.dormers.map((d, n) => {
        const best = eaves.reduce<{ i: number; u: number; dist: number } | null>((a, { e, i }) => {
          const u = Math.max(0, Math.min(e.len, (d.at[0] - e.a[0]) * e.d[0] + (d.at[1] - e.a[1]) * e.d[1]));
          const dist = Math.hypot(d.at[0] - e.a[0] - e.d[0] * u, d.at[1] - e.a[1] - e.d[1] * u);
          return !a || dist < a.dist ? { i, u, dist } : a;
        }, null);
        const place = (i: number, u: number) => set((x) => { const e = es[i], q = x.dormers.find((y) => y.id === d.id); if (q && e) q.at = [+(e.a[0] + e.d[0] * u).toFixed(3), +(e.a[1] + e.d[1] * u).toFixed(3)]; });
        const field = (k: 'w' | 'front' | 'window', l: string, u: string) => (
          <Num key={k} label={l} unit={u} step={0.1} min={0} value={d[k]} onChange={(v) => set((x) => { const q = x.dormers.find((y) => y.id === d.id); if (q) q[k] = Math.max(0, v); })} />
        );
        return (
          <div key={d.id} className="stack-10 zone-row">
            <div className="row-between">
              <b className="small">Dormer {n + 1}</b>
              <button type="button" className="btn-link" onClick={() => set((x) => { x.dormers = x.dormers.filter((y) => y.id !== d.id); })}>Delete</button>
            </div>
            {best && <div className="hf-row">
              <label className="hf"><span className="eyebrow">On</span>
                <select className="select" value={best.i} aria-label="Eave the dormer stands on" onChange={(e) => { const i = +e.target.value; place(i, es[i].len / 2); }}>
                  {eaves.map(({ i }) => <option key={i} value={i}>{label(i)}</option>)}
                </select>
              </label>
              <Num label="Centre along it" unit="m" step={0.1} min={0} max={es[best.i].len} value={best.u} onChange={(v) => place(best.i, Math.min(es[best.i].len, Math.max(0, v)))} />
            </div>}
            <div className="hf-row">{field('w', 'Width', 'm')}{field('front', 'Front height', 'm')}{field('window', 'Window', 'm²')}</div>
          </div>
        );
      })}
      {eaves.length > 0 && <button type="button" className="btn-secondary" onClick={() => set((x) => {
        const { e } = eaves.reduce((a, b) => (b.e.len > a.e.len ? b : a));
        x.dormers.push({ id: uid('dm'), at: [+((e.a[0] + e.b[0]) / 2).toFixed(3), +((e.a[1] + e.b[1]) / 2).toFixed(3)], w: 1.8, front: Math.max(roofPlate(house, x) + 1, 2.2), window: 1 });
      })}>Add a dormer</button>}
      <p className="small muted">The room behind a dormer's front gets its front, cheeks, roof and window, and a taller space.</p>
      <button type="button" className="btn-danger" onClick={() => { upd((h) => { h.roofs = h.roofs.filter((x) => x.id !== id); }); onDeleted?.(); }}>Delete this roof</button>
    </div>
  );
}

/** A room's ceiling under the roof: how high it goes, its rooflight, and what it takes from the roof. */
export function RoomCeilingFields({ house, room, res, upd }: { house: House; room: Room; res: HouseResult; upd: Upd }) {
  const rr = roomRoof(house, room);
  const set = (fn: (r: Room) => void) => upd((h) => { const r = h.rooms.find((x) => x.id === room.id); if (r) fn(r); });
  if (!rr) return <p className="small muted">No roof over this room's top: its ceiling is {room.storey + room.span < house.storeys.length ? 'under the rooms above' : 'a flat roof'}. Add a roof on the floor plan's Roof layer.</p>;
  const mode = room.ceiling === 'roof' ? 'roof' : typeof room.ceiling === 'number' ? 'collar' : 'storey';
  const cap = ceilingCap(house, room), faces = res.rooms.find((x) => x.room.id === room.id)?.faces ?? [];
  const slopes = faces.filter((f) => f.key.startsWith('sl:')), knees = faces.filter((f) => f.label.includes('knee wall'));
  return (
    <div className="stack-10">
      <div className="chips" role="group" aria-label="Ceiling">
        <Chip on={mode === 'storey'} onClick={() => set((r) => { delete r.ceiling; })}>Flat at the storey height</Chip>
        <Chip on={mode === 'collar'} onClick={() => set((r) => { r.ceiling = +(Math.min(cap, house.storeys[r.storey + r.span - 1]?.h ?? 2.4) - 0.1).toFixed(2); })}>Flat collar</Chip>
        <Chip on={mode === 'roof'} onClick={() => set((r) => { r.ceiling = 'roof'; })}>Open to the roof</Chip>
      </div>
      <div className="hf-row">
        {mode === 'collar' && <Num label="Collar height" unit="m" step={0.05} min={0.5} value={cap} onChange={(v) => set((r) => { r.ceiling = Math.max(0.5, v); })} />}
        <Num label="Rooflight" unit="m²" step={0.1} min={0} value={room.rooflight ?? 0} onChange={(v) => set((r) => { if (v > 0) r.rooflight = v; else delete r.rooflight; })} />
      </div>
      <p className="small mono">
        Volume {fmt(res.rooms.find((x) => x.room.id === room.id)?.V ?? 0, 1)} m³
        {slopes.length ? ` · slopes ${slopes.map((f) => `${f.label.replace(' roof slope', '')} ${fmt(f.area, 1)} m²`).join(', ')}` : ' · no slopes'}
        {knees.length ? ` · ${knees.length} knee wall${knees.length === 1 ? '' : 's'}` : ''}
        {rr.dormers.length ? ` · ${rr.dormers.length} dormer${rr.dormers.length === 1 ? '' : 's'}` : ''}
      </p>
      <p className="small muted">Slopes, knee walls and dormers come from the roof over the room; change them on the floor plan's Roof layer.</p>
    </div>
  );
}
