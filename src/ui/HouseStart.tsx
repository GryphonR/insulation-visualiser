import { useState } from 'react';
import type { House } from '../engine/house';
import { DEMOS } from '../engine/house-demos';
import type { Project } from '../engine/house-scenarios';
import { AGE_BANDS, TEMPLATES, newHouse } from '../engine/house-templates';
import { Chip } from './controls';

/** Board 0a: start a project from a template, the house's age and what the EPC says. */
export function HouseStart({ onCreate, onCancel, onDemo }: { onCreate: (h: House) => void; onCancel?: () => void; onDemo?: (p: Project) => void }) {
  const [name, setName] = useState('');
  const [postcode, setPostcode] = useState('');
  const [template, setTemplate] = useState('semi');
  const [age, setAge] = useState('1950-66');
  const [W, setW] = useState('');
  const [D, setD] = useState('');
  const [storeys, setStoreys] = useState(2);
  const one = TEMPLATES.find((t) => t.id === template)?.storeys === 1;
  const house = newHouse({ template, age, storeys, W: Number(W) > 0 ? Number(W) : undefined, D: Number(D) > 0 ? Number(D) : undefined });

  return (
    <section className="card panel start start-wide">
      <div className="section-head">
        <div><h2>New project</h2><p className="muted small">The house's age sets the build-ups, glazing and airtightness to start from. You draw the rooms yourself on the floor plan.</p></div>
        {onCancel && <button type="button" className="btn-link" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="hf-row">
        <label className="hf"><span className="eyebrow">Project name</span><input className="h-text" placeholder={house.name} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="hf"><span className="eyebrow">Postcode (sets weather and ground temperature)</span><input className="h-text short" placeholder="e.g. B15 2TT" value={postcode} onChange={(e) => setPostcode(e.target.value)} /></label>
      </div>
      <div className="eyebrow">House type</div>
      <div className="chips">{TEMPLATES.map((t) => <Chip key={t.id} on={template === t.id} onClick={() => setTemplate(t.id)}>{t.label}</Chip>)}</div>
      <div className="hf-row">
        {([['Width (optional)', W, setW], ['Depth (optional)', D, setD]] as const).map(([l, v, set]) => (
          <label key={l} className="hf"><span className="eyebrow">{l}</span>
            <span className="hf-in"><input type="number" className="thk-input" step={0.1} min={2} max={40} placeholder="–" value={v} onChange={(e) => set(e.target.value)} /><span className="small muted">m</span></span>
          </label>
        ))}
        {!one && (
          <label className="hf"><span className="eyebrow">Storeys</span>
            <select className="select" value={storeys} onChange={(e) => setStoreys(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        )}
      </div>
      <p className="small muted">With a width and depth, a dashed footprint of that size is drawn on the plan to build rooms inside.</p>
      <div className="eyebrow">Built</div>
      <div className="chips">{AGE_BANDS.map((a) => <Chip key={a.id} on={age === a.id} onClick={() => setAge(a.id)}>{a.label}</Chip>)}</div>
      <p className="small muted">Starts with {house.buildups.length} build-ups for a house of this age ({house.buildups.slice(0, 5).map((b) => b.name).join('; ')}) and {house.storeys.length} storey{house.storeys.length > 1 ? 's' : ''}, with no rooms.</p>
      <div className="chips">
        <button type="button" className="btn-primary" onClick={() => onCreate({ ...house, name: name.trim() || house.name, climate: postcode.trim() ? { ...house.climate, postcode: postcode.trim(), auto: true } : house.climate })}>Create project</button>
      </div>
      {onDemo && <>
        <div className="eyebrow">Or open a demo house</div>
        <div className="chips">{DEMOS.map((d) => <button key={d.id} type="button" className="btn-secondary" onClick={() => onDemo(d.make())}>{d.label}</button>)}</div>
      </>}
    </section>
  );
}
