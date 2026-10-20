import { MAT } from '../engine/data';
import type { LayerInput, SimResult } from '../engine/simulate';
import { layerR } from '../engine/swap';
import { fgFor } from '../lib/util';

interface Props {
  layers: LayerInput[];
  sim: SimResult;
  onEdit: () => void;
}

/** Read-only view of the wall on the single-wall page; editing happens in the build-up modal. */
export function BuildupSummary({ layers, sim, onEdit }: Props) {
  const total = layers.reduce((s, l) => s + l.t, 0);
  return (
    <section className="card panel stack-10">
      <div className="row-between">
        <h2>Build-up</h2>
        <button type="button" className="btn-secondary" onClick={onEdit}>Edit build-up</button>
      </div>

      <div className="eyebrow row-between"><span>OUTSIDE ↓</span><span>{total} mm · U {sim.U.toFixed(2)}</span></div>
      <ol className="sum-list">
        {layers.map((L, i) => {
          const m = MAT[L.mat];
          return (
            <li key={L.id} className="sum-row">
              <span className="badge" style={{ background: m.col, color: fgFor(m.col) }}>{i + 1}</span>
              <span className="sum-name">{m.name}</span>
              <span className="mono small muted">{L.t} mm · R {layerR(m, L.t).toFixed(2)}</span>
            </li>
          );
        })}
      </ol>
      <div className="eyebrow">INSIDE ↑</div>

      <div className="strip" role="img" aria-label="Wall build-up drawn to scale, outside on the left">
        {layers.map((L, i) => {
          const m = MAT[L.mat];
          return <div key={L.id} className="strip-seg" style={{ flex: `${L.t} 1 0`, background: m.col, color: fgFor(m.col) }}>{i + 1}</div>;
        })}
      </div>
    </section>
  );
}
