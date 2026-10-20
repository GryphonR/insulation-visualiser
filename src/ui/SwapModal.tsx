import { useState } from 'react';
import { MAT } from '../engine/data';
import { layerR, swapFit, wallU } from '../engine/swap';
import type { SwapMode } from '../engine/swap';
import { loadSwapPrefs, saveSwapPrefs } from '../engine/swapPrefs';
import type { LayerInput } from '../engine/simulate';

interface Props {
  layers: LayerInput[];
  index: number;
  newMat: string;
  /** Called with the chosen thickness, mm. */
  onApply: (t: number) => void;
  onClose: () => void;
}

const fmt = (x: number, d = 2) => x.toFixed(d);

export function SwapModal({ layers, index, newMat, onApply, onClose }: Props) {
  const old = layers[index];
  const om = MAT[old.mat];
  const nm = MAT[newMat];
  const oldR = layerR(om, old.t);

  const [prefs, setPrefs] = useState(loadSwapPrefs);
  const [custom, setCustom] = useState(() => ({ t: String(old.t), R: fmt(oldR), U: fmt(1 / oldR) }));
  const { mode, unit } = prefs;
  const choose = (p: Partial<typeof prefs>) => setPrefs((s) => ({ ...s, ...p }));

  const customText = mode === 'custom-t' ? custom.t : custom[unit];
  const fit = swapFit(old, nm, mode, customText.trim() === '' ? NaN : Number(customText), unit);

  const apply = () => {
    if (!fit) return;
    saveSwapPrefs(prefs);
    onApply(fit.t);
    onClose();
  };

  const after = fit ? layers.map((l, i) => (i === index ? { ...l, mat: newMat, t: fit.t } : l)) : null;
  const totalBefore = layers.reduce((s, l) => s + l.t, 0);

  const preview = (m: SwapMode) => {
    const f = swapFit(old, nm, m);
    return f ? `→ ${f.t} mm · R ${fmt(f.R)}` : '';
  };
  const opt = (m: SwapMode, label: string, hint?: string) => (
    <label className={mode === m ? 'swap-opt on' : 'swap-opt'}>
      <input type="radio" name="swap-mode" checked={mode === m} onChange={() => choose({ mode: m })} />
      <span className="swap-opt-main">
        <span>{label}</span>
        {hint && <span className="small muted mono">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-small" role="dialog" aria-modal="true" aria-label="Swap material">
        <div className="modal-head">
          <h2>Swap layer {index + 1}</h2>
        </div>
        <div className="modal-body">
          <p className="small">
            <b>{om.name}</b> {old.t} mm <span className="muted mono">(R {fmt(oldR)}, U {fmt(1 / oldR)})</span>
            <br />→ <b>{nm.name}</b>
          </p>
          <p className="small muted" style={{ margin: 0 }}>How thick should the new layer be?</p>

          <div className="swap-opts">
            {opt('same-r', 'Same insulation value (equivalent R / U)', preview('same-r'))}
            {opt('same-t', 'Same thickness', preview('same-t'))}
            {opt('custom-t', 'Custom thickness')}
            {mode === 'custom-t' && (
              <div className="swap-custom">
                <input type="number" className="thk-input mono" aria-label="Thickness in mm" autoFocus min={0} value={custom.t} onChange={(e) => setCustom({ ...custom, t: e.target.value })} /> mm
              </div>
            )}
            {opt('custom-val', 'Custom R or U for this layer')}
            {mode === 'custom-val' && (
              <div className="swap-custom">
                <input type="number" className="thk-input mono" aria-label={`Layer ${unit}-value`} autoFocus min={0} step={0.01} value={custom[unit]} onChange={(e) => setCustom({ ...custom, [unit]: e.target.value })} />
                <select className="select" aria-label="Unit" value={unit} onChange={(e) => choose({ unit: e.target.value as 'R' | 'U' })}>
                  <option value="R">R, m²K/W</option>
                  <option value="U">U, W/m²K</option>
                </select>
              </div>
            )}
          </div>

          <div className="swap-result" aria-live="polite">
            {fit && after ? (
              <>
                <div><b className="mono">{fit.t} mm</b> <span className="muted mono">R {fmt(fit.R)} · U {fmt(1 / fit.R)}</span></div>
                <div className="small mono">
                  Wall U {fmt(wallU(layers))} → <b>{fmt(wallU(after))}</b> · Total {totalBefore} → {after.reduce((s, l) => s + l.t, 0)} mm
                </div>
                {nm.R && <div className="small muted">Fixed-resistance layer: thickness does not change its R.</div>}
                {fit.missed && !nm.R && (
                  <div className="small warn">Target is out of range for this material; closest is {fit.t} mm, giving R {fmt(fit.R)}.</div>
                )}
                {fit.missed && nm.R && (
                  <div className="small warn">This layer's R is fixed at {fmt(fit.R)}, so it cannot match the target.</div>
                )}
              </>
            ) : (
              <div className="small muted">Enter a value above zero.</div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!fit} onClick={apply}>Swap</button>
        </div>
      </div>
    </div>
  );
}
