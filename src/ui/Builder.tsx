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

/** What opened the picker: swap the material of layer `i`, or insert a new layer at position `at`. */
type PickerTarget = { swap: number } | { at: number } | null;

export function Builder({ layers, onChange, library, onPreset, nextId }: Props) {
  const [picker, setPicker] = useState<PickerTarget>(null);
  /** A replacement material chosen for layer `i`, waiting for the user to say how thick it should be. */
  const [swap, setSwap] = useState<{ i: number; mat: string } | null>(null);
  /** Layer being sized to a target wall U, with the typed value and any "limit reached" note. */
  const [sizing, setSizing] = useState<{ i: number; u: string; note?: string } | null>(null);
  /** Layers before the last swap / size / remove, so it can be undone. */
  /** A layer being dragged by its handle, and the insertion position (0..n) it would drop at. */
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
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
    if (!picker) return;
    if ('at' in picker) {
      const { at } = picker;
      edit((ls) => { ls.splice(at, 0, { id: nextId(), mat: nm.id, t: nm.t }); });
    } else if (layers[picker.swap].mat !== id) {
      setSwap({ i: picker.swap, mat: id });
    }
  };
  /** Move layer `from` to insertion position `to` (an index in the current list, 0..n). */
  const move = (from: number, to: number) => {
    if (to === from || to === from + 1) return;
    edit((ls) => { const [l] = ls.splice(from, 1); ls.splice(to > from ? to - 1 : to, 0, l); }, 'move');
  };
  const onHandleKey = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (j < 0 || j >= layers.length) return;
    e.preventDefault();
    move(i, j > i ? j + 1 : j);
    // The moved row is re-inserted in the DOM, which drops focus.
    const id = layers[i].id;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus());
  };
  const gap = (at: number, edge = false) => (
    <div key={`gap${at}`} className={`layer-gap${edge ? ' edge' : ''}${drag?.over === at ? ' drop' : ''}`}>
      <button type="button" className="layer-add" aria-label={`Add a layer at position ${at + 1}`} onClick={() => setPicker({ at })}>+</button>
    </div>
  );
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

      <div className="layers" onDragOver={(e) => { if (drag) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); if (drag && drag.over !== null) move(drag.from, drag.over); setDrag(null); }}>
        {gap(0, true)}
        {layers.flatMap((L, i) => {
          const m = MAT[L.mat];
          const R = m.R ?? L.t / 1000 / (m.k as number);
          return [(
            <div key={L.id} className={drag?.from === i ? 'layer dragging' : 'layer'}
              onDragOver={(e) => {
                if (!drag) return;
                const r = e.currentTarget.getBoundingClientRect();
                const over = e.clientY < r.top + r.height / 2 ? i : i + 1;
                if (over !== drag.over) setDrag({ ...drag, over });
              }}>
              <div className="layer-top">
                <span role="button" tabIndex={0} draggable className="drag-handle" data-handle={L.id}
                  aria-label={`Reorder layer ${i + 1}: drag, or press up or down arrow`}
                  onKeyDown={(e) => onHandleKey(e, i)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                    const row = e.currentTarget.closest('.layer');
                    if (row) e.dataTransfer.setDragImage(row, 20, 20);
                    setDrag({ from: i, over: null });
                  }}
                  onDragEnd={() => setDrag(null)}>
                  <svg width={14} height={20} viewBox="0 0 14 20" aria-hidden="true" fill="#51606c">
                    {[4, 10, 16].map((y) => [3.5, 10.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />))}
                  </svg>
                </span>
                <span className="badge" style={{ background: m.col, color: fgFor(m.col) }}>{i + 1}</span>
                <span className="select grow material-label"><span className="material-btn-name">{m.name}</span></span>
                <button type="button" className="icon-btn" aria-label={`Change material of layer ${i + 1}`} onClick={() => setPicker({ swap: i })}>
                  <Icon d="M10.5 2.5 13.5 5.5 5.5 13.5 2 14 2.5 10.5ZM9 4l3 3" />
                </button>
                <button type="button" className="icon-btn" aria-label={`Remove layer ${i + 1}`} disabled={layers.length <= 1}
                  onClick={() => edit((ls) => { ls.splice(i, 1); }, 'remove')}>
                  <Icon d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.5h6.6l.7-8.5M6.8 7v4M9.2 7v4" stroke="#a02828" />
                </button>
              </div>
              <div className="layer-mid">
                <input type="range" aria-label={`Thickness of layer ${i + 1}`} min={m.min} max={m.max} step={m.step} value={L.t}
                  onChange={(e) => edit((ls) => { ls[i].t = Number(e.target.value); })} />
                <ThicknessInput label={`Thickness of layer ${i + 1} in mm`} mat={m} value={L.t} onCommit={(t) => edit((ls) => { ls[i].t = t; })} />
              </div>
              {sizing?.i === i && !m.R && m.min !== m.max ? (
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
                  {!m.R && m.min !== m.max && <button type="button" className="btn-link inline" onClick={() => setSizing({ i, u: wallU(layers).toFixed(2) })}>Size to U…</button>}
                </div>
              )}
            </div>
          ), gap(i + 1, i === layers.length - 1)];
        })}
      </div>

      <div className="eyebrow">INSIDE ↑</div>

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
          value={'swap' in picker ? layers[picker.swap].mat : ''}
          title={'swap' in picker ? `Material for layer ${picker.swap + 1}` : 'Add a layer'}
          onClose={() => setPicker(null)}
          onSelect={applyPick}
          swapFrom={'swap' in picker ? layers[picker.swap] : undefined}
        />
      )}
      {swap && <SwapModal layers={layers} index={swap.i} newMat={swap.mat} onApply={applySwap} onClose={() => setSwap(null)} />}
    </section>
  );
}
