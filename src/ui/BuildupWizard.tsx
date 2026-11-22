import { useMemo, useState } from 'react';
import { BUILTIN_STACKUPS } from '../engine/library';
import { buildupU, listedAs } from '../engine/house';
import type { Buildup, BuildupKind, House } from '../engine/house';
import { AddBuildupModal } from './AddBuildupModal';
import { StackupModal } from './StackupModal';
import { fmt, uid } from './hform';
import { useProject } from './project';
import { go } from './route';

type Key = keyof House['defaults'];
/** The defaults a new project is asked for, in order: every face drawn on the plan starts from these. */
export const WIZARD_STEPS: Array<{ key: Key; kind: 'wall' | 'floor' | 'roof'; title: string; note: string; optional?: boolean }> = [
  { key: 'extWall', kind: 'wall', title: 'Outside walls', note: 'What most of the outside walls are built of. A single wall can still be changed later on the plan.' },
  { key: 'intWall', kind: 'wall', title: 'Inside walls', note: 'The partitions between rooms. Their thickness sets the gap drawn between neighbouring rooms.' },
  { key: 'groundFloor', kind: 'floor', title: 'Ground floor', note: 'What the ground floor rooms stand on.', optional: true },
  { key: 'loftCeiling', kind: 'roof', title: 'Top ceiling', note: 'The ceiling under the loft, with any loft insulation.', optional: true },
];

const Close = () => <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /></svg>;

/** Getting started on a new project, in a modal over the Build-ups tab: pick, add or create the default build-ups before drawing the house. */
export function BuildupWizard() {
  const { house, upd, customStackups } = useProject();
  const [i, setI] = useState(0);
  const [sub, setSub] = useState<'add' | 'create' | null>(null);
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  const step = WIZARD_STEPS[i], last = i === WIZARD_STEPS.length - 1;
  const options = house.buildups.filter((b) => listedAs(b) === step.kind);
  const pick = (id: string) => upd((h) => { h.defaults[step.key] = id; });
  const thick = (layers: Array<[string, number]>) => layers.reduce((t, [, mm]) => t + mm, 0);
  /** Adds a build-up to the project, and makes it this step's default when it is the right kind. */
  const addAndPick = (b: Omit<Buildup, 'id'>) => {
    const id = uid('b');
    upd((h) => { h.buildups.push({ ...structuredClone(b), id }); if (listedAs(b) === step.kind) h.defaults[step.key] = id; });
    setSub(null);
  };
  const close = () => go('buildups');

  // One modal at a time: adding or creating replaces the wizard until it is done, then the wizard comes back on the same step.
  if (sub === 'add') return (
    <AddBuildupModal library={library} layeredOnly title={`Add to the project: ${step.title.toLowerCase()}`} have={new Set(house.buildups.map((x) => x.name))}
      onClose={() => setSub(null)} onCustom={() => setSub('create')} onAdd={(p) => addAndPick(p)} />
  );
  if (sub === 'create') return (
    <StackupModal library={library} title={`New build-up: ${step.title.toLowerCase()}`} initial={{ name: '', layers: [['pir', 100]], kind: step.kind, orient: step.kind === 'roof' ? 'roof' : undefined }}
      onCancel={() => setSub(null)}
      onSave={(d) => addAndPick({ name: d.name, kind: (d.kind ?? step.kind) as BuildupKind, layers: d.layers })} />
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal wizard" role="dialog" aria-modal="true" aria-labelledby="wiz-title" style={{ width: 'min(860px, 96vw)' }}>
        <div className="modal-head">
          <h2 id="wiz-title">Getting started · {step.title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}><Close /></button>
        </div>
        <div className="modal-body">
          <p className="eyebrow">Step {i + 1} of {WIZARD_STEPS.length}{step.optional ? ' · optional' : ''}</p>
          <p className="small muted">{step.note} These are the build-ups for a house of this age: pick the closest, add one from the library, or make your own.</p>
          <div className="wiz-steps" role="list">
            {WIZARD_STEPS.map((s, k) => (
              <button key={s.key} type="button" role="listitem" className={k === i ? 'chip on' : 'chip'} aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)}>
                {k + 1}. {s.title}: {house.buildups.find((b) => b.id === house.defaults[s.key])?.name ?? 'none'}
              </button>
            ))}
          </div>
          <div className="wiz-opts" role="radiogroup" aria-label={step.title}>
            {options.map((b) => (
              <label key={b.id} className={house.defaults[step.key] === b.id ? 'wiz-opt on' : 'wiz-opt'}>
                <input type="radio" name={`wiz-${step.key}`} checked={house.defaults[step.key] === b.id} onChange={() => pick(b.id)} />
                <span><b>{b.name}</b><br /><span className="small muted mono">U {fmt(buildupU(b), 2)} W/m²K{b.layers.length ? ` · ${fmt(thick(b.layers))} mm` : ''}</span></span>
              </label>
            ))}
            {options.length === 0 && <p className="small muted">No {step.kind} build-ups in this project yet: add one from the library or create your own.</p>}
          </div>
          <div className="chips">
            <button type="button" className="btn-secondary" onClick={() => setSub('add')}>Add from the library…</button>
            <button type="button" className="btn-secondary" onClick={() => setSub('create')}>Create a new build-up…</button>
          </div>
        </div>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn-link" onClick={close}>Skip setup</button>
          <div className="chips">
            {i > 0 && <button type="button" className="btn-secondary" onClick={() => setI(i - 1)}>Back</button>}
            {!last && <button type="button" className={WIZARD_STEPS[i + 1].optional ? 'btn-secondary' : 'btn-primary'} onClick={() => setI(i + 1)}>{WIZARD_STEPS[i + 1].optional && !step.optional ? 'Next: floor and ceiling' : 'Next'}</button>}
            {(last || WIZARD_STEPS[i + 1]?.optional) && <button type="button" className="btn-primary" onClick={() => go('plan')}>Start drawing the house ›</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
