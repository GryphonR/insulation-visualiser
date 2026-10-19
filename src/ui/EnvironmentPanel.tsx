import { COLOURS, GLAZING, LOCATIONS, MASSES, MONTHS, MONTHS_FULL, ORIENTS, WEATHER } from '../engine/data';
import { heatingOn } from '../engine/scenario';
import type { HeatMode, Scenario, ScenarioResult } from '../engine/scenario';
import { pad2 } from '../lib/util';
import { Chip, ChipGroup, Eyebrow, Field, Slider } from './controls';

interface Props {
  sc: Scenario;
  res: ScenarioResult;
  set: (patch: Partial<Scenario>) => void;
  /** Lays groups out as a wide responsive grid instead of a narrow stack (for the comparison screen). */
  wide?: boolean;
}

const HEAT_MODES: Array<{ id: HeatMode; label: string }> = [
  { id: 'fixed', label: 'Fixed temperature' },
  { id: 'schedule', label: 'Time schedule' },
  { id: 'free', label: 'Free-floating room' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({ id: i, name: `${pad2(i)}:00` }));

export function EnvironmentPanel({ sc, res, set, wide }: Props) {
  const { params, sim } = res;
  const sel = (label: string, key: 'on1' | 'off1' | 'on2' | 'off2') => (
    <label className="field small muted">
      {label}
      <select className="select mono" value={sc[key]} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {HOURS.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>
    </label>
  );

  return (
    <section className={wide ? 'card panel env-wide' : 'card panel'}>
      <h2 className={wide ? 'env-span' : undefined}><span className="step">2</span>Set the day</h2>

      <Field label="Location">
        <select className="select" value={sc.loc} onChange={(e) => set({ loc: e.target.value })}>
          {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>

      <div className="stack-6">
        <Eyebrow>Month</Eyebrow>
        <div role="group" aria-label="Month" className="months">
          {MONTHS.map((m, i) => (
            <Chip key={m} on={sc.month === i} label={MONTHS_FULL[i]} onClick={() => set({ month: i })}>{m}</Chip>
          ))}
        </div>
      </div>

      <div className="stack-6">
        <Eyebrow>Weather</Eyebrow>
        <ChipGroup label="Weather" items={WEATHER} value={sc.weather} onPick={(weather) => set({ weather })} text={(w) => w.name} />
      </div>

      <div className="stack-6">
        <Eyebrow>Faces</Eyebrow>
        <ChipGroup label="Orientation" items={ORIENTS} value={sc.orient} onPick={(orient) => set({ orient })} text={(o) => o.label} />
      </div>

      <div className="stack-6">
        <Eyebrow>Outer surface colour</Eyebrow>
        <ChipGroup label="Outer surface colour" items={COLOURS} value={sc.colour} onPick={(colour) => set({ colour })} text={(c) => c.label} />
      </div>

      <div className={wide ? 'stack-10 env-span' : 'stack-10'}>
        <Eyebrow>Internal heating</Eyebrow>
        <ChipGroup label="Heating mode" items={HEAT_MODES} value={sc.heat} onPick={(heat) => set({ heat: heat as HeatMode })} text={(m) => m.label} />

        {sc.heat === 'fixed' && (
          <Slider id="tin" label="Room air held at" value={sc.tin} min={10} max={28} step={0.5} unit="°C" onChange={(tin) => set({ tin })} />
        )}

        {sc.heat === 'schedule' && (
          <div className="stack-10">
            <Slider id="comf" label="Heating on: room at" value={sc.comfort} min={14} max={28} step={0.5} unit="°C" onChange={(comfort) => set({ comfort })} />
            <Slider id="setb" label="Heating off: room at" value={sc.setback} min={8} max={24} step={0.5} unit="°C" onChange={(setback) => set({ setback })} />
            <div className="grid-2">
              {sel('Morning on', 'on1')}
              {sel('Morning off', 'off1')}
              {sel('Evening on', 'on2')}
              {sel('Evening off', 'off2')}
            </div>
            <div className="sched" role="img" aria-label="24-hour heating schedule, dark where heating is on">
              {Array.from({ length: 24 }, (_, h) => <div key={h} className={heatingOn(sc, h + 0.5) ? 'on' : ''} />)}
            </div>
            <div className="row-between mono tiny muted"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
            <p className="small muted">Room air is assumed to jump between the two temperatures; real rooms ramp, so treat the switch times as when the room reaches target.</p>
          </div>
        )}

        {sc.heat === 'free' && (
          <div className="stack-10">
            <p className="small muted">Room temperature responds to this wall, glazing on the same face, ventilation and internal gains. Heating is off, so the room drifts with the weather.</p>
            <Slider id="rs_floor" label="Room floor area" value={sc.floor} min={6} max={60} step={1} unit="m²" onChange={(floor) => set({ floor })} />
            <Slider id="rs_ela" label="Area of this wall / roof" value={sc.elA} min={2} max={60} step={1} unit="m²" onChange={(elA) => set({ elA })} />
            <Slider id="rs_rest" label="Other external fabric (same build-up, no sun)" value={sc.rest} min={0} max={100} step={1} unit="m²" onChange={(rest) => set({ rest })} />
            <Slider id="rs_gla" label="Glazing on the same face" value={sc.glA} min={0} max={20} step={0.5} unit="m²" onChange={(glA) => set({ glA })} />
            <Slider id="rs_ach" label="Ventilation" value={sc.ach} min={0.1} max={10} step={0.1} unit="air changes/h" onChange={(ach) => set({ ach })} />
            <Slider id="rs_gains" label="Internal gains (people, appliances)" value={sc.gains} min={0} max={1000} step={25} unit="W" onChange={(gains) => set({ gains })} />
            <div className="small muted">Glazing treatment</div>
            <ChipGroup label="Glazing treatment" items={GLAZING} value={sc.glaz} onPick={(glaz) => set({ glaz })} text={(g) => g.label} />
            <div className="small muted">Other thermal mass in the room (floor, partitions, contents)</div>
            <ChipGroup label="Room thermal mass" items={MASSES} value={sc.mass} onPick={(mass) => set({ mass })} text={(m) => m.label} />
          </div>
        )}
      </div>

      <p className={wide ? 'small muted env-span' : 'small muted'}>
        Mean air {params.tmean.toFixed(1)} °C, swinging ±{(params.swing / 2).toFixed(1)} K around it, peaking at 15:00.{' '}
        {sim.solar.toFixed(1)} kWh/m² of sun lands on this face; the outer surface absorbs {Math.round(params.alpha * 100)}% of it.
        Times are solar time (add one hour in BST).
      </p>
    </section>
  );
}
