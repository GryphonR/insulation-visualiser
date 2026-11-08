import { useState } from 'react';
import { FOOTINGS_K, SHADING, UPSTAND_PSI, bearingLabel, buildupU, edgeR } from '../engine/house';
import type { Buildup, FloorEdge } from '../engine/house';
import { Chip } from './controls';
import { MAT } from '../engine/data';
import { Card, Num, Why, fmt } from './hform';
import { WHY } from './assumptions';
import { GainsCard } from './HouseRuns';
import { MaterialPickerModal } from './MaterialPickerModal';
import { EdgeSketch } from './EdgeSketch';
import { useProject } from './project';
import { href } from './route';

/** Board 6a: occupancy, heating times and gains. */
export function GainsPage() {
  const { house, upd } = useProject();
  return <div className="house"><GainsCard house={house} upd={upd} /></div>;
}

const EDGE0: FloorEdge = { edge: 'none', D: 0.6, R: 1.5, mat: 'm_xps_033', t: 50, upstand: 'off', psi: UPSTAND_PSI.none };

/** Board 2b: what the ground floor sits on, and its edge: foundation edge insulation and the upstand junction. */
export function FloorPage() {
  const { house, upd, res } = useProject();
  const fe = house.floorEdge ?? EDGE0;
  const setFe = (patch: Partial<FloorEdge>) => upd((h) => { h.floorEdge = { ...(h.floorEdge ?? EDGE0), ...patch }; });
  const [picking, setPicking] = useState<'edge' | 'up' | null>(null);
  const um = fe.upMat ? MAT[fe.upMat] : undefined;
  // The drawing shows the default outside wall on the default ground floor: its own Ψ, or the average if that pair isn't in the house.
  const dWall = house.buildups.find((b) => b.id === house.defaults.extWall)?.name, dFloor = house.buildups.find((b) => b.id === house.defaults.groundFloor)?.name;
  const sketchPsi = res.junctions.find((jn) => jn.wall === dWall && jn.floor === dFloor)?.psi ?? res.junctionPsi;
  const em = fe.mat ? MAT[fe.mat] : undefined;
  const floors = res.rooms.flatMap((r) => r.faces.filter((f) => f.kind === 'floor' && (f.to.k === 'ground')).map((f) => ({ r, f })));
  const area = floors.reduce((a, x) => a + x.f.area, 0);
  const W = res.rooms.reduce((a, r) => a + r.rows.filter((x) => x.kind === 'floor' && x.to === 'ground').reduce((b, x) => b + x.W, 0), 0);
  const kinds = [...new Map(floors.map((x) => [x.f.buildup.id, x.f.buildup])).values()];
  const ground = house.buildups.filter((b) => b.kind === 'floor');
  return (
    <div className="house-grid">
      <div className="house-col">
        <Card title="Ground floor" note={`${fmt(area, 1)} m² on the ground · ${fmt(W)} W on the design day at ${fmt(res.Tg, 1)} °C ground`}>
          <div className="stack-10">
            <label className="hf"><span className="eyebrow">Default build-up for ground floors</span>
              <select className="select" value={house.defaults.groundFloor} onChange={(e) => upd((h) => { h.defaults.groundFloor = e.target.value; })}>
                {ground.map((b) => <option key={b.id} value={b.id}>{b.name} (U {fmt(buildupU(b), 2)})</option>)}
              </select>
            </label>
            {kinds.map((b) => <FloorLayers key={b.id} b={b} />)}
          </div>
          <p className="small muted">The U-value is the BS EN ISO 13370 figure for the whole floor: it depends on the floor area and exposed perimeter, so a bigger footprint loses less per m². Change the layers or the floor type in the build-up library.</p>
        </Card>
        {picking === 'edge' && <MaterialPickerModal value={fe.mat ?? ''} title="Edge insulation material" onClose={() => setPicking(null)}
          onSelect={(id) => { setFe({ mat: id, t: fe.mat === id ? fe.t : MAT[id]?.t }); setPicking(null); }} />}
        {picking === 'up' && <MaterialPickerModal value={fe.upMat ?? ''} title="Upstand material" onClose={() => setPicking(null)}
          onSelect={(id) => { setFe({ upMat: id, upT: fe.upMat === id ? fe.upT : 25 }); setPicking(null); }} />}
        <Card title="Floor edge" note="Solid slabs on the ground only. Both lower or add to every ground-floor room's floor U-value.">
          <div className="stack-10">
            <div className="eyebrow">Foundation edge insulation (BS EN ISO 13370)<Why label="Horizontal or vertical: what's the difference?">{WHY.edgeInsulation}</Why></div>
            <div className="chips" role="group" aria-label="Edge insulation">
              {([['none', 'None'], ['horizontal', 'Horizontal, round the edge'], ['vertical', 'Vertical, down the foundation']] as const).map(([k, l]) => <Chip key={k} on={fe.edge === k} onClick={() => setFe({ edge: k })}>{l}</Chip>)}
            </div>
            {fe.edge !== 'none' && (<>
              <div className="chips" role="group" aria-label="Side of the foundation">
                {([['outside', 'Outside the foundation'], ['inside', 'Inside the foundation']] as const).map(([k, l]) => <Chip key={k} on={(fe.side ?? 'outside') === k} onClick={() => setFe({ side: k })}>{l}</Chip>)}
              </div>
              <p className="small muted">BS EN ISO 13370 counts both sides the same for the floor U-value{fe.upstand === 'calc' ? '; the calculated junction below does use it.' : ', so here it only moves it in the drawing.'}</p>
              <div className="hf-row">
                <Num label={fe.edge === 'vertical' ? 'Depth below ground' : 'Width from the wall'} unit="m" step={0.1} value={fe.D} why={WHY.edgeD} onChange={(v) => setFe({ D: Math.max(0, v) })} />
                <label className="hf"><span className="hf-lab"><span className="eyebrow">Insulation</span></span>
                  <button type="button" className="btn-secondary" onClick={() => setPicking('edge')}>{em ? em.name : 'Choose a material'}</button>
                </label>
                {em && !em.R && <Num label="Thickness" unit="mm" step={em.step} min={em.min} max={em.max} value={fe.t ?? em.t} onChange={(v) => setFe({ t: Math.max(1, v) })} />}
              </div>
              <p className="small muted">{em
                ? <>R {fmt(edgeR(fe), 2)} m²K/W{em.k ? ` (${fe.t ?? em.t} mm ÷ λ ${em.k} W/mK)` : ''}.<Why>{WHY.edgeR}</Why></>
                : <>R {fmt(fe.R, 2)} m²K/W, typed in before materials could be picked. Choose a material to work it out from its thickness instead.</>}</p>
            </>)}
            <div className="eyebrow">Floor-to-wall junction (perimeter upstand)</div>
            <div className="chips" role="group" aria-label="Perimeter upstand">
              {([['off', 'Leave out'], ['calc', 'Calculate from my build-ups'], ['none', `No upstand, Ψ ${UPSTAND_PSI.none}`], ['insulated', `Insulated upstand, Ψ ${UPSTAND_PSI.insulated}`], ['custom', 'Own Ψ']] as const).map(([k, l]) => <Chip key={k} on={fe.upstand === k} onClick={() => k === 'calc' && fe.upstand !== 'calc' && fe.upMat === undefined ? setFe({ upstand: k, upMat: 'pir', upT: 25 }) : setFe({ upstand: k })}>{l}</Chip>)}
            </div>
            {fe.upstand === 'custom' && <div className="hf-row"><Num label="Ψ" unit="W/mK" step={0.01} value={fe.psi} onChange={(v) => setFe({ psi: Math.max(0, v) })} /></div>}
            {fe.upstand === 'calc' && (<>
              <div className="hf-row">
                <label className="hf"><span className="hf-lab"><span className="eyebrow">Upstand</span></span>
                  <span className="chips">
                    <button type="button" className="btn-secondary" onClick={() => setPicking('up')}>{um ? um.name : 'Choose a material'}</button>
                    {um && <button type="button" className="btn-link inline" onClick={() => setFe({ upMat: undefined })}>No upstand</button>}
                  </span>
                </label>
                {um && !um.R && <Num label="Thickness" unit="mm" step={5} min={5} max={100} value={fe.upT ?? 25} onChange={(v) => setFe({ upT: Math.max(1, v) })} />}
                <label className="hf"><span className="eyebrow">Foundation under the wall</span>
                  <select className="select" value={fe.footK ?? FOOTINGS_K[0][0]} onChange={(e) => setFe({ footK: Number(e.target.value) })}>
                    {FOOTINGS_K.map(([k, l]) => <option key={k} value={k}>{l} (λ {k})</option>)}
                  </select>
                </label>
                <Num label="Foundation depth" unit="m" step={0.05} min={0} max={2} value={fe.footD ?? 0.75} why={WHY.footD} onChange={(v) => setFe({ footD: Math.min(2, Math.max(0, v)) })} />
              </div>
              {res.junctions.length > 1 ? (<>
                <div className="h-table-wrap">
                  <table className="h-table">
                    <thead><tr><th>Outside wall</th><th>Ground floor</th><th className="n">Length, m</th><th className="n">Ψ, W/mK</th></tr></thead>
                    <tbody>{res.junctions.map((jn) => <tr key={jn.wall + jn.floor}><td className="small">{jn.wall}</td><td className="small">{jn.floor}</td><td className="n mono">{fmt(jn.len, 1)}</td><td className="n mono">{fmt(jn.psi, 3)}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="small">Each worked out from a 2-D heat-flow model of that wall meeting that floor (BS EN ISO 10211); <b>{fmt(res.junctionPsi, 3)} W/mK</b> on average over the walls.<Why label="How is this worked out?">{WHY.junctionCalc}</Why></p>
              </>) : (
                <p className="small"><b>Ψ {fmt(res.junctionPsi, 3)} W/mK</b>, from a 2-D heat-flow model of your wall and ground floor at this junction (BS EN ISO 10211).<Why label="How is this worked out?">{WHY.junctionCalc}</Why></p>
              )}
            </>)}
            <p className="small muted">The junction is a loss per metre of outside wall on the ground floor, spread over each room's floor. The two set values are SAP Table K1 (E5, ground floor): the default for an unchecked detail, and an approved detail with an insulated upstand at the screed edge. Use your own Ψ from a junction calculation if you have one.</p>
            <EdgeSketch house={house} fe={fe} psi={sketchPsi} />
            <p className="small"><a href={href('learn', 'floor-edge')}>Why floor edges and junctions matter ›</a> · <a href={href('learn', 'junction-model')}>How the junction Ψ is worked out ›</a></p>
          </div>
        </Card>
        <Card title="Suspended timber floors" note="Used when a ground floor build-up is set to suspended timber.">
          <div className="hf-row">
            <Num label="Airbricks" unit="mm²/m" step={100} value={house.suspended.vent} onChange={(v) => upd((h) => { h.suspended.vent = Math.max(0, v); })} />
            <Num label="Void height" unit="m" step={0.05} value={house.suspended.voidH} onChange={(v) => upd((h) => { h.suspended.voidH = Math.max(0.05, v); })} />
          </div>
        </Card>
      </div>
      <div className="house-col">
        <Card title="Floors by room" note="Each ground-floor room's loss through the floor.">
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th>Room</th><th>Build-up</th><th className="n">m²</th><th className="n">U</th><th className="n">W</th></tr></thead>
              <tbody>
                {floors.map(({ r, f }) => (
                  <tr key={f.key}><td><a href={href('room', r.room.id)}>{r.room.name}</a></td><td className="small">{f.buildup.name}</td><td className="n mono">{fmt(f.area, 1)}</td><td className="n mono">{fmt(f.U, 2)}</td>
                    <td className="n mono">{fmt(r.rows.find((x) => x.key === f.key)?.W ?? 0)}</td></tr>
                ))}
                {floors.length === 0 && <tr><td colSpan={5} className="muted small">No room sits on the ground.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="small muted">U includes the floor edge set on the left. Heated floors (UFH) use the same U-value; their warmer screed is not treated separately.</p>
        </Card>
      </div>
    </div>
  );
}

function FloorLayers({ b }: { b: Buildup }) {
  return (
    <div className="stack-10">
      <div className="row-between"><b>{b.name}</b><span className="mono small">{b.floorType === 'suspended' ? 'suspended timber' : 'solid slab'} · plane U {fmt(buildupU(b), 2)}</span></div>
      {b.layers.length > 0 && <div className="layer-strip" role="img" aria-label={`${b.name} layers, top to ground`}>{b.layers.map(([m, t], i) => <span key={i} title={`${MAT[m]?.name ?? m} ${t} mm`} style={{ flex: `${t} 1 0`, background: MAT[m]?.col }} />)}</div>}
      <span className="small muted">{b.layers.map(([m, t]) => `${MAT[m]?.name ?? m} ${t}`).join(' · ')} mm</span>
    </div>
  );
}

/** Board 2c: the glazing library, every window and door in the house, and how much each loses. */
export function OpeningsPage() {
  const { house, upd, res } = useProject();
  const glass = house.buildups.filter((b) => b.kind === 'glazing' || b.kind === 'door');
  const loss = new Map<string, number>();
  res.rooms.forEach((r) => r.rows.forEach((x) => { if (x.key.startsWith('op:')) loss.set(x.key.slice(3), x.W); }));
  const usedBy = (id: string) => house.openings.filter((o) => o.buildup === id).length;
  const total = [...loss.values()].reduce((a, b) => a + b, 0);
  const area = house.openings.reduce((a, o) => a + o.w * o.h, 0);
  const set = (id: string, patch: Partial<(typeof house.openings)[number]>) => upd((h) => { const o = h.openings.find((x) => x.id === id); if (o) Object.assign(o, patch); });
  return (
    <div className="house">
      <div className="kpis">
        <div className="kpi"><span className="eb">Openings</span><span className="v">{house.openings.length}</span><span className="small muted">{fmt(area, 1)} m²</span></div>
        <div className="kpi"><span className="eb">Loss, design day</span><span className="v">{fmt(total)} <span className="small muted">W</span></span><span className="small muted">{fmt(res.peakW ? (total / res.peakW) * 100 : 0)}% of the house</span></div>
      </div>
      <div className="house-grid">
        <div className="house-col">
          <Card title="Glazing and door library" note="U for the whole window, g = share of sun let through. Edit values in the build-up library.">
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th>Type</th><th className="n">U</th><th className="n">g</th><th className="n">Frame</th><th className="n">Used</th></tr></thead>
                <tbody>
                  {glass.map((b) => <tr key={b.id}><td><a href={href('buildups', b.id)}>{b.name}</a></td><td className="n mono">{fmt(buildupU(b), 2)}</td><td className="n mono">{b.kind === 'glazing' ? fmt(b.g ?? 0, 2) : '—'}</td><td className="n mono">{b.kind === 'glazing' ? fmt(b.frame ?? 0.3, 2) : '—'}</td><td className="n mono">{usedBy(b.id) || '—'}</td></tr>)}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="house-col">
          <Card title="Every window and door" note="Sun reaches the glass in the hour-by-hour runs: g × glass share × shading, by the wall's bearing.">
            <div className="h-table-wrap">
              <table className="h-table">
                <thead><tr><th>Room</th><th>Opening</th><th>Side</th><th className="n">m²</th><th>Type</th><th>Shading</th><th className="n">W</th></tr></thead>
                <tbody>
                  {house.openings.map((o) => {
                    const room = house.rooms.find((r) => r.id === o.room);
                    const isGlass = house.buildups.find((b) => b.id === o.buildup)?.kind === 'glazing';
                    return (
                      <tr key={o.id}>
                        <td>{room ? <a href={href('room', room.id, 'openings')}>{room.name}</a> : '—'}</td><td>{o.name}</td><td>{(() => { const f = res.rooms.find((r) => r.room.id === o.room)?.faces.find((x) => x.key === `op:${o.id}`); return f?.az != null ? bearingLabel(f.az) : o.side; })()}</td><td className="n mono">{fmt(o.w * o.h, 1)}</td>
                        <td><select className="h-sel" value={o.buildup} aria-label={`${o.name} type`} onChange={(e) => set(o.id, { buildup: e.target.value })}>{glass.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                        <td>{isGlass ? <select className="h-sel" value={o.shade ?? 'none'} aria-label={`${o.name} shading`} onChange={(e) => set(o.id, { shade: e.target.value })}>{Object.entries(SHADING).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select> : '—'}</td>
                        <td className="n mono">{fmt(loss.get(o.id) ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><td colSpan={6}>Total</td><td className="n mono">{fmt(total)}</td></tr></tfoot>
              </table>
            </div>
            <p className="small muted">Junctions (thermal bridges) are left out apart from the ground-floor edge (Floor page); the design day isn't helped by sun, so shading only changes the year runs.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Board 1e: unheated rooms and the loft settle where heat in equals heat out. */
export function SpacesPage() {
  const { house, res } = useProject();
  const spaces = [
    ...res.rooms.filter((r) => !r.room.heated).map((r) => ({ id: r.room.id, name: r.room.name, T: r.T, V: r.V, n: r.n, rows: r.faces, vent: r.ventW })),
    ...(res.loft ? [{ id: 'loft', name: 'Loft', T: res.loft.T, V: res.loft.V, n: house.loft.ach, rows: [], vent: 0 }] : []),
  ];
  const [sel, setSel] = useState(spaces[0]?.id ?? '');
  const s = spaces.find((x) => x.id === sel) ?? spaces[0];
  if (!s) return <div className="callout"><p>Every room is heated and there is no loft, so there is nothing to settle. Mark a room as unheated in its details to model a garage, porch or utility.</p></div>;
  // Heated rooms' faces onto this space, and the space's own faces.
  const into = res.rooms.flatMap((r) => r.faces.filter((f) => (s.id === 'loft' ? f.to.k === 'loft' : f.to.k === 'room' && f.to.id === s.id) && r.room.heated).map((f) => ({ r, f })));
  const own = s.id === 'loft' ? [] : s.rows;
  const lossIn = into.reduce((a, { r, f }) => a + (r.rows.find((x) => x.key === f.key)?.W ?? 0), 0);
  const outDT = (house.rooms.find((r) => r.id === s.id)?.setpoint ?? 20) - res.Tout;
  return (
    <div className="plan-split">
      <div className="plan-main">
        <Card title={`Heat balance · ${s.name}`} note={`${fmt(s.V, 1)} m³ · settles at ${fmt(s.T, 1)} °C on the design day (${fmt(res.Tout, 1)} °C outside)`}>
          <div className="kpis">
            <div className="kpi"><span className="eb">Settles at</span><span className="v">{fmt(s.T, 1)} <span className="small muted">°C</span></span><span className="small muted">T = ΣH·T / ΣH</span></div>
            <div className="kpi"><span className="eb">Air changes</span><span className="v">{fmt(s.n, 2)} <span className="small muted">ach</span></span><span className="small muted">{s.id === 'loft' ? 'set on Storeys & loft' : 'set in the room details'}</span></div>
            <div className="kpi"><span className="eb">Loss into it</span><span className="v">{fmt(lossIn)} <span className="small muted">W</span></span><span className="small muted">from heated rooms</span></div>
          </div>
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th>Element</th><th>Other side</th><th className="n">m²</th><th className="n">U</th><th className="n">W/K</th></tr></thead>
              <tbody>
                {own.map((f) => <tr key={f.key}><td>{f.label}</td><td>{f.to.k === 'room' ? (house.rooms.find((r) => r.id === (f.to as { id: string }).id)?.name ?? '—') : f.to.k}</td><td className="n mono">{fmt(f.area, 1)}</td><td className="n mono">{fmt(f.U, 2)}</td><td className="n mono">{fmt(f.U * f.area, 1)}</td></tr>)}
                {s.id === 'loft' && <tr><td colSpan={5} className="small muted">Ceilings below, the roof and ventilation at {fmt(house.loft.ach, 1)} ach; set on Storeys &amp; loft.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Effect on the heated rooms" note="What each one loses to this space.">
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th>Room</th><th>Element</th><th className="n">W</th></tr></thead>
              <tbody>{into.map(({ r, f }) => <tr key={r.room.id + f.key}><td><a href={href('room', r.room.id)}>{r.room.name}</a></td><td>{f.label}</td><td className="n mono">{fmt(r.rows.find((x) => x.key === f.key)?.W ?? 0)}</td></tr>)}
                {into.length === 0 && <tr><td colSpan={3} className="small muted">No heated room touches it.</td></tr>}</tbody>
            </table>
          </div>
          {s.id !== 'loft' && <p className="small muted">If it were treated as outside, a room held at its setpoint would lose about ΔT {fmt(outDT, 0)} K worth of heat through the same faces; the space shields it by sitting at {fmt(s.T, 1)} °C.</p>}
        </Card>
      </div>
      <aside className="plan-side">
        <Card title="Unheated spaces">
          <div className="storey-stack">
            {spaces.map((x) => <button key={x.id} type="button" className={x.id === s.id ? 'on' : ''} onClick={() => setSel(x.id)}><span>{x.name}</span><span className="mono small muted">{fmt(x.T, 1)} °C</span></button>)}
          </div>
          <p className="small muted">Eaves voids belong to the room shape; sub-floor voids belong to suspended floors.</p>
        </Card>
      </aside>
    </div>
  );
}

/** Board 1f: model checks as you draw, the storeys stacked, and history. */
export function ChecksPage() {
  const { house, res, undo, redo, canUndo, canRedo, project } = useProject();
  let height = 0;
  const stack = house.storeys.map((s, i) => { const base = height; height += s.h + (i < house.storeys.length - 1 ? s.zone : 0); return { s, i, base, top: base + s.h }; });
  const errors = res.checks.filter((c) => c.level === 'error').length;
  return (
    <div className="house-grid">
      <div className="house-col">
        <Card title="Model checks" note="Checks run as you draw. Errors stop a simulation; warnings don't.">
          {res.checks.length === 0 && <p className="small">No problems found.</p>}
          {res.checks.map((c, i) => <p key={i} className={c.level === 'error' ? 'h-err' : 'warn'}>{c.level === 'error' ? 'Error: ' : 'Warning: '}{c.text}</p>)}
          <p className="small mono">{errors} error{errors === 1 ? '' : 's'} · {res.checks.length - errors} warning{res.checks.length - errors === 1 ? '' : 's'}</p>
        </Card>
        <Card title="History" note="Every edit to the project can be stepped back (Ctrl+Z) and forward (Ctrl+Y).">
          <div className="chips">
            <button type="button" className="btn-secondary" disabled={!canUndo} onClick={undo}>Undo</button>
            <button type="button" className="btn-secondary" disabled={!canRedo} onClick={redo}>Redo</button>
          </div>
          <p className="small muted">Autosaved in this browser · {project.scenarios.length} scenario{project.scenarios.length === 1 ? '' : 's'}. Export a copy from the report page to keep a restore point.</p>
        </Card>
      </div>
      <div className="house-col">
        <Card title="Storeys, stacked" note={`${fmt(height, 2)} m to the top of the ceiling`}>
          <div className="h-table-wrap">
            <table className="h-table">
              <thead><tr><th>Storey</th><th className="n">Floor level m</th><th className="n">Ceiling m</th><th className="n">Rooms</th></tr></thead>
              <tbody>{[...stack].reverse().map((x) => <tr key={x.i}><td>{x.s.name}</td><td className="n mono">{fmt(x.base, 2)}</td><td className="n mono">{fmt(x.top, 2)}</td><td className="n mono">{house.rooms.filter((r) => r.storey === x.i).length}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="small muted">Storeys stack by their floor zones: a room's floor face links to whatever room is drawn above or below it, so "ceiling: Bedroom 2" on a room box comes from here. <a href={href('storeys')}>Edit heights</a></p>
        </Card>
      </div>
    </div>
  );
}
