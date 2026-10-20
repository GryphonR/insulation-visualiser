import { useRef, useState } from 'react';
import { layersFromTuples } from '../engine/library';
import type { Stackup } from '../engine/library';
import type { LayerInput } from '../engine/simulate';
import { Builder } from './Builder';
import { Field } from './controls';

export interface StackupDraft {
  /** Present only when editing a custom entry in place; absent means "save as new". */
  id?: string;
  name: string;
  layers: Array<[string, number]>;
  orient?: string;
}

interface Props {
  initial?: StackupDraft;
  library: Stackup[];
  title: string;
  onCancel: () => void;
  onSave: (draft: StackupDraft) => void;
}

export function StackupModal({ initial, library, title, onCancel, onSave }: Props) {
  const idRef = useRef(1000000);
  const nextId = () => idRef.current++;
  const [name, setName] = useState(initial?.name ?? '');
  const [layers, setLayers] = useState<LayerInput[]>(() => layersFromTuples(initial?.layers ?? [['pir', 100]]));
  const [isRoof, setIsRoof] = useState(initial?.orient === 'roof');

  const onPreset = (s: Stackup) => {
    setLayers(layersFromTuples(s.layers));
    if (s.orient === 'roof') setIsRoof(true);
  };

  /** `asNew` drops the id so an edit is saved as a separate build-up instead of replacing the original. */
  const save = (asNew: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      id: asNew ? undefined : initial?.id,
      name: trimmed,
      layers: layers.map((l) => [l.mat, l.t]),
      orient: isRoof ? 'roof' : undefined,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onCancel}>
            <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" fill="none" stroke="#14212b" strokeWidth={1.8} strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <Field label="Name this build-up">
            <input
              className="select"
              value={name}
              maxLength={60}
              placeholder="e.g. Internal wood-fibre retrofit"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <label className="roof-check">
            <input type="checkbox" checked={isRoof} onChange={(e) => setIsRoof(e.target.checked)} />
            This is a roof build-up (always compared as a flat roof, whatever orientation is set)
          </label>

          <Builder layers={layers} onChange={setLayers} library={library} onPreset={onPreset} nextId={nextId} bare />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          {initial?.id && (
            <button type="button" className="btn-secondary" disabled={!name.trim()} onClick={() => save(true)}>Save as new build-up</button>
          )}
          <button type="button" className="btn-primary" disabled={!name.trim()} onClick={() => save(false)}>Save build-up</button>
        </div>
      </div>
    </div>
  );
}
