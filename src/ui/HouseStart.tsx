import { useMemo, useState } from 'react';
import type { House } from '../engine/house';
import { AGE_BANDS, EPC_LABELS, TEMPLATES, lossRange, newHouse } from '../engine/house-templates';
import type { EpcFacts } from '../engine/house-templates';
import { Chip } from './controls';

const fmt = (v: number, d = 1) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Board 0a: start a project from a template, the house's age and what the EPC says. */
export function HouseStart({ onCreate, onCancel, onDemo }: { onCreate: (h: House) => void; onCancel?: () => void; onDemo?: () => void }) {
  const [name, setName] = useState('');
  const [postcode, setPostcode] = useState('');
  const [template, setTemplate] = useState('semi');
  const [age, setAge] = useState('1950-66');
  const [W, setW] = useState(8);
  const [D, setD] = useState(7.5);
  const [storeys, setStoreys] = useState(2);
  const [epc, setEpc] = useState<EpcFacts>({});
  const one = TEMPLATES.find((t) => t.id === template)?.storeys === 1;
  const house = useMemo(() => newHouse({ template, age, W, D, storeys, epc }), [template, age, W, D, storeys, epc]);
  const range = useMemo(() => lossRange(house, epc), [house, epc]);
  const pc = (w: number) => Math.max(0, Math.min(100, ((w / 1000 - 2) / 12) * 100));

  return (
    <section className="card panel start start-wide">
      <div className="section-head">
        <div><h2>New project</h2><p className="muted small">A starting model from a few facts: shape, age and anything the EPC or a quick look tells you. Every room, wall and radiator can be edited afterwards.</p></div>
        {onCancel && <button type="button" className="btn-link" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="hf-row">
        <label className="hf"><span className="eyebrow">Project name</span><input className="h-text" placeholder={house.name} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="hf"><span className="eyebrow">Postcode (sets weather and ground temperature)</span><input className="h-text short" placeholder="e.g. B15 2TT" value={postcode} onChange={(e) => setPostcode(e.target.value)} /></label>
      </div>
      <div className="eyebrow">House type</div>
      <div className="chips">{TEMPLATES.map((t) => <Chip key={t.id} on={template === t.id} onClick={() => setTemplate(t.id)}>{t.label}</Chip>)}</div>
      <div className="hf-row">
        {([['Width (front)', W, setW, 4, 16], ['Depth', D, setD, 4, 14]] as const).map(([l, v, set, min, max]) => (
          <label key={l} className="hf"><span className="eyebrow">{l}</span>
            <span className="hf-in"><input type="number" className="thk-input" step={0.1} min={min} max={max} value={v} onChange={(e) => set(Math.min(max, Math.max(min, Number(e.target.value) || min)))} /><span className="small muted">m</span></span>
          </label>
        ))}
        {!one && (
          <label className="hf"><span className="eyebrow">Storeys</span>
            <select className="select" value={storeys} onChange={(e) => setStoreys(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        )}
      </div>
      <div className="eyebrow">Built</div>
      <div className="chips">{AGE_BANDS.map((a) => <Chip key={a.id} on={age === a.id} onClick={() => setAge(a.id)}>{a.label}</Chip>)}</div>
      <div className="eyebrow">The EPC or a look at the house says</div>
      <div className="chips">
        {(Object.keys(EPC_LABELS) as Array<keyof EpcFacts>).map((k) => <Chip key={k} on={!!epc[k]} onClick={() => setEpc({ ...epc, [k]: !epc[k] })}>{EPC_LABELS[k]}</Chip>)}
      </div>
      <div className="range">
        <div className="range-bar"><span className="range-fill" style={{ left: `${pc(range.lo)}%`, width: `${pc(range.hi) - pc(range.lo)}%` }} /><span className="range-mark" style={{ left: `${pc(range.peak)}%` }} /></div>
        <p className="small"><b>About {fmt(range.peak / 1000)} kW</b> design heat loss, likely {fmt(range.lo / 1000)}–{fmt(range.hi / 1000)} kW. {range.unknown} of 5 inputs are age-band guesses; an airtightness test and a look in the loft narrow it most.</p>
      </div>
      <p className="small muted">Creates {house.rooms.length} rooms over {house.storeys.length} storey{house.storeys.length > 1 ? 's' : ''}, {house.openings.length} windows and doors, {house.buildups.length} build-ups and a radiator in each heated room, sized for the loss.</p>
      <div className="chips">
        <button type="button" className="btn-primary" onClick={() => onCreate({ ...house, name: name.trim() || house.name, climate: postcode.trim() ? { ...house.climate, postcode: postcode.trim(), auto: true } : house.climate })}>Create project</button>
        {onDemo && <button type="button" className="btn-secondary" onClick={onDemo}>Open the demo house instead</button>}
      </div>
    </section>
  );
}
