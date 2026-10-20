import { useState } from 'react';
import type { Material } from '../engine/data';
import { MAT } from '../engine/data';
import type { Stackup } from '../engine/library';
import type { LayerInput } from '../engine/simulate';
import { sizeToU, wallU } from '../engine/swap';
import { clamp, fgFor } from '../lib/util';
import { Field } from './controls';
import { MaterialPickerModal } from './MaterialPickerModal';
import { SwapModal } from './SwapModal';

interface Props {
  layers: LayerInput[];
  onChange: (layers: LayerInput[]) => void;
  /** Build-ups offered in the "start from" menu: built-in presets, then the user's own. */
  library: Stackup[];
  onPreset: (s: Stackup) => void;
  nextId: () => number;
}

const Icon = ({ d, stroke = '#14212b' }: { d: string; stroke?: string }) => (
  <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDown = () => (
  <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" className="material-btn-chevron">
    <path d="M4 6 8 10 12 6" fill="none" stroke="#51606c" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Typed thickness in mm. Free typing while focused; clamped to the material's range on blur or Enter. */
function ThicknessInput({ label, mat, value, onCommit }: { label: string; mat: Material; value: number; onCommit: (t: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    const n = Number(draft);
    if (draft !== null && draft.trim() !== '' && Number.isFinite(n)) onCommit(clamp(n, mat.min, mat.max));
    setDraft(null);
  };
  return (
    <span className="thk">
      <input
        type="number" inputMode="decimal" className="thk-input mono" aria-label={label}
        min={mat.min} max={mat.max} step={mat.step}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && n >= mat.min && n <= mat.max) onCommit(n);
        }}
        onBlur={finish}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      mm
    </span>
  );
}

/** Index into `layers`, or 'add' for the "add a layer" slot — whichever opened the picker. */
type PickerTarget = number | 'add' | null;

export function Builder({ layers, onChange, library, onPreset, nextId }: Props) {
  const [picker, setPicker] = useState<PickerTarget>(null);
  /** A replacement material chosen for layer `i`, waiting for the user to say how thick it should be. */
  const [swap, setSwap] = useState<{ i: number; mat: string } | null>(null);
  /** Layer being sized to a target wall U, with the typed value and any "limit reached" note. */
  const [sizing, setSizing] = useState<{ i: number; u: string; note?: string } | null>(null);
  /** Layers before the last swap / size / remove, so it can be undone. */
  const [undo, setUndo] = useState<{ layers: LayerInput[]; label: string } | null>(null);

  const edit = (fn: (ls: LayerInput[]) => void, undoLabel?: string) => {
    const ls = layers.map((l) => ({ ...l }));
    fn(ls);
    if (undoLabel) setUndo({ layers, label: undoLabel });
    onChange(ls);
  };
  const total = layers.reduce((s, l) => s + l.t, 0);
  // Show the preset while the layers still match it exactly; any edit returns the menu to its prompt.
  const matched = library.find((s) => s.layers.length === layers.length && s.layers.every(([m, t], i) => m === layers[i].mat && t === layers[i].t));

  const applyPick = (id: string) => {
    const nm = MAT[id];
    if (!nm) return;
    if (picker === 'add') {
      edit((ls) => { ls.push({ id: nextId(), mat: nm.id, t: nm.t }); });
    } else if (typeof picker === 'number' && layers[picker].mat !== id) {
      setSwap({ i: picker, mat: id });
    }
  };
  const applySwap = (t: number) => {
    if (swap) edit((ls) => { ls[swap.i].mat = swap.mat; ls[swap.i].t = t; }, 'swap');
  };
  const applySize = () => {
    if (!sizing) return;
    const fit = sizeToU(layers, sizing.i, Number(sizing.u));
    if (!fit) return setSizing({ ...sizing, note: 'Enter a U-value above zero.' });
    edit((ls) => { ls[sizing.i].t = fit.t; }, 'resize');
    setSizing(fit.missed ? { ...sizing, note: `Limit reached: ${fit.t} mm gives U ${fit.U.toFixed(2)}.` } : null);
  };

  return (
    <section className="stack-10">
      <Field label="Start from a preset">
        <select className="select" value={matched?.id ?? ''} onChange={(e) => { const s = library.find((x) => x.id === e.target.value); if (s) onPreset(s); }}>
          <option value="">Choose a build-up…</option>
          <optgroup label="Presets">
            {library.filter((s) => s.builtin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
          {library.some((s) => !s.builtin) && (
            <optgroup label="My build-ups">
              {library.filter((s) => !s.builtin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          )}
        </select>
      </Field>

      {undo && (
        <div><button type="button" className="btn-link" onClick={() => { onChange(undo.layers); setUndo(null); setSizing(null); }}>↶ Undo {undo.label}</button></div>
      )}

      <div className="eyebrow row-between"><span>OUTSIDE ↓</span><span>{total} mm · U {wallU(layers).toFixed(2)}</span></div>

      <div className="layers">
        {layers.map((L, i) => {
          const m = MAT[L.mat];
          const R = m.R ?? L.t / 1000 / (m.k as number);
          return (
            <div key={L.id} className="layer">
              <div className="layer-top">
                <span className="badge" style={{ background: m.col, color: fgFor(m.col) }}>{i + 1}</span>
                <button type="button" className="select grow material-btn" aria-label={`Material for layer ${i + 1}: ${m.name}`} onClick={() => setPicker(i)}>
                  <span className="material-btn-name">{m.name}</span>
                  <ChevronDown />
                </button>
                <button type="button" className="icon-btn" aria-label={`Move layer ${i + 1} towards outside`} disabled={i === 0}
                  onClick={() => edit((ls) => { [ls[i - 1], ls[i]] = [ls[i], ls[i - 1]]; })}>
                  <Icon d="M3.5 10 8 5.5 12.5 10" />
                </button>
                <button type="button" className="icon-btn" aria-label={`Move layer ${i + 1} towards inside`} disabled={i === layers.length - 1}
                  onClick={() => edit((ls) => { [ls[i + 1], ls[i]] = [ls[i], ls[i + 1]]; })}>
                  <Icon d="M3.5 6 8 10.5 12.5 6" />
                </button>
                <button type="button" className="icon-btn" aria-label={`Remove layer ${i + 1}`} disabled={layers.length <= 1}
                  onClick={() => edit((ls) => { ls.splice(i, 1); }, 'remove')}>
                  <Icon d="M4 4 12 12M12 4 4 12" stroke="#a02828" />
                </button>
              </div>
              <div className="layer-mid">
                <input type="range" aria-label={`Thickness of layer ${i + 1}`} min={m.min} max={m.max} step={m.step} value={L.t}
                  onChange={(e) => edit((ls) => { ls[i].t = Number(e.target.value); })} />
                <ThicknessInput label={`Thickness of layer ${i + 1} in mm`} mat={m} value={L.t} onCommit={(t) => edit((ls) => { ls[i].t = t; })} />
              </div>
              {sizing?.i === i && !m.R ? (
                <div className="size-row">
                  <label>Wall U ≤ <input type="number" className="thk-input mono" aria-label="Target wall U-value" autoFocus min={0} step={0.01} value={sizing.u}
                    onChange={(e) => setSizing({ ...sizing, u: e.target.value, note: undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') applySize(); }} /></label>
                  <button type="button" className="btn-link inline" onClick={applySize}>Set</button>
                  <button type="button" className="btn-link inline" onClick={() => setSizing(null)}>Cancel</button>
                  {sizing.note && <span className="small warn">{sizing.note}</span>}
                </div>
              ) : (
                <div className="row-between small">
                  <span className="mono muted">{m.R ? `R fixed ${R.toFixed(2)} m²K/W` : `λ ${m.k} W/mK · R ${R.toFixed(2)} m²K/W`}</span>
                  {!m.R && <button type="button" className="btn-link inline" onClick={() => setSizing({ i, u: wallU(layers).toFixed(2) })}>Size to U…</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="eyebrow">INSIDE ↑</div>

      <Field label="Add a layer (inside face)">
        <button type="button" className="select material-btn" onClick={() => setPicker('add')}>
          <span className="material-btn-name muted">+ Choose a material…</span>
          <ChevronDown />
        </button>
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

      {picker !== null && (
        <MaterialPickerModal
          value={picker === 'add' ? '' : layers[picker].mat}
          title={picker === 'add' ? 'Add a layer' : `Material for layer ${(picker as number) + 1}`}
          onClose={() => setPicker(null)}
          onSelect={applyPick}
          swapFrom={typeof picker === 'number' ? layers[picker] : undefined}
        />
      )}
      {swap && <SwapModal layers={layers} index={swap.i} newMat={swap.mat} onApply={applySwap} onClose={() => setSwap(null)} />}
    </section>
  );
}
