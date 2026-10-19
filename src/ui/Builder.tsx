import { MAT, MATERIAL_GROUPS, PRESETS } from '../engine/data';
import type { LayerInput } from '../engine/simulate';
import { clamp, fgFor } from '../lib/util';
import { Field } from './controls';

/** A material <select>, grouped into <optgroup>s (common build-up materials first). */
function MaterialSelect({ value, onChange, label, className }: { value: string; onChange: (id: string) => void; label: string; className?: string }) {
  return (
    <select className={className ?? 'select'} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {value === '' && <option value="">+ Choose a material…</option>}
      {MATERIAL_GROUPS.map((g) => (
        <optgroup key={g.cat} label={g.label}>
          {g.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

interface Props {
  layers: LayerInput[];
  onChange: (layers: LayerInput[]) => void;
  onPreset: (id: string) => void;
  nextId: () => number;
  onSaveToLibrary?: () => void;
  /** Set when embedded somewhere that already has its own heading (e.g. a modal). */
  bare?: boolean;
}

const Icon = ({ d, stroke = '#14212b' }: { d: string; stroke?: string }) => (
  <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Builder({ layers, onChange, onPreset, nextId, onSaveToLibrary, bare }: Props) {
  const edit = (fn: (ls: LayerInput[]) => void) => {
    const ls = layers.map((l) => ({ ...l }));
    fn(ls);
    onChange(ls);
  };
  const total = layers.reduce((s, l) => s + l.t, 0);

  return (
    <section className={bare ? 'stack-10' : 'card panel'}>
      {!bare && (
        <div className="row-between">
          <h2><span className="step">1</span>Build the wall</h2>
          {onSaveToLibrary && (
            <button type="button" className="btn-link" onClick={onSaveToLibrary}>+ Save to library</button>
          )}
        </div>
      )}

      <Field label="Start from a preset">
        <select className="select" value="" onChange={(e) => e.target.value && onPreset(e.target.value)}>
          <option value="">Choose a build-up…</option>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>

      <div className="eyebrow row-between"><span>OUTSIDE ↓</span><span>{total} mm</span></div>

      <div className="layers">
        {layers.map((L, i) => {
          const m = MAT[L.mat];
          const R = m.R ?? L.t / 1000 / (m.k as number);
          return (
            <div key={L.id} className="layer">
              <div className="layer-top">
                <span className="badge" style={{ background: m.col, color: fgFor(m.col) }}>{i + 1}</span>
                <MaterialSelect
                  className="select grow"
                  label={`Material for layer ${i + 1}`}
                  value={L.mat}
                  onChange={(id) => {
                    const nm = MAT[id];
                    edit((ls) => { ls[i].mat = nm.id; ls[i].t = clamp(ls[i].t, nm.min, nm.max); });
                  }}
                />
                <button type="button" className="icon-btn" aria-label={`Move layer ${i + 1} towards outside`} disabled={i === 0}
                  onClick={() => edit((ls) => { [ls[i - 1], ls[i]] = [ls[i], ls[i - 1]]; })}>
                  <Icon d="M3.5 10 8 5.5 12.5 10" />
                </button>
                <button type="button" className="icon-btn" aria-label={`Move layer ${i + 1} towards inside`} disabled={i === layers.length - 1}
                  onClick={() => edit((ls) => { [ls[i + 1], ls[i]] = [ls[i], ls[i + 1]]; })}>
                  <Icon d="M3.5 6 8 10.5 12.5 6" />
                </button>
                <button type="button" className="icon-btn" aria-label={`Remove layer ${i + 1}`} disabled={layers.length <= 1}
                  onClick={() => edit((ls) => { ls.splice(i, 1); })}>
                  <Icon d="M4 4 12 12M12 4 4 12" stroke="#a02828" />
                </button>
              </div>
              <div className="layer-mid">
                <input type="range" aria-label={`Thickness of layer ${i + 1}`} min={m.min} max={m.max} step={m.step} value={L.t}
                  onChange={(e) => edit((ls) => { ls[i].t = Number(e.target.value); })} />
                <span className="mono thk">{L.t} mm</span>
              </div>
              <div className="mono small muted">
                {m.R ? `R fixed ${R.toFixed(2)} m²K/W` : `λ ${m.k} W/mK · R ${R.toFixed(2)} m²K/W`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="eyebrow">INSIDE ↑</div>

      <Field label="Add a layer (inside face)">
        <MaterialSelect
          label="Add a layer (inside face)"
          value=""
          onChange={(id) => {
            const m = MAT[id];
            if (m) edit((ls) => { ls.push({ id: nextId(), mat: m.id, t: m.t }); });
          }}
        />
      </Field>

      <div className="stack-6">
        <div className="eyebrow">Build-up to scale</div>
        <div className="strip" role="img" aria-label="Wall build-up drawn to scale, outside on the left">
          {layers.map((L, i) => {
            const m = MAT[L.mat];
            return (
              <div key={L.id} className="strip-seg" style={{ flex: `${L.t} 1 0`, background: m.col, color: fgFor(m.col) }}>{i + 1}</div>
            );
          })}
        </div>
        <div className="row-between small muted"><span>Outside</span><span>Inside</span></div>
      </div>
    </section>
  );
}
