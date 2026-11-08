import { COLOURS, GLAZING, LOCATIONS, MASSES, MONTHS, MONTHS_FULL, ORIENTS, WEATHER } from '../engine/data';
import { heatingOn } from '../engine/scenario';
import type { HeatMode, Scenario } from '../engine/scenario';
import type { SimParams } from '../engine/simulate';
import { pad2 } from '../lib/util';
import { Chip, ChipGroup, Eyebrow, Field, Slider } from './controls';

interface Props {
  sc: Scenario;
  params: SimParams;
  /** Sun on this face over the day, kWh/m². */
  solar: number;
  set: (patch: Partial<Scenario>) => void;
  /** Lays groups out as a wide responsive grid instead of a narrow stack (for the comparison screen). */
  wide?: boolean;
  /** What the project says about this build-up's room, and how to apply it. */
  project?: { note: string; patch: Partial<Scenario> } | null;
}

const HEAT_MODES: Array<{ id: HeatMode; label: string }> = [
  { id: 'fixed', label: 'Held at one temperature' },
  { id: 'schedule', label: 'Heating on a timer' },
  { id: 'free', label: 'No heating: room drifts' },
];

// What each project setting is called, to say what a what-if run has changed.
const AREA: Partial<Record<keyof Scenario, string>> = { loc: 'location', site: 'location', orient: 'facing', pitch: 'facing', az: 'facing', tin: 'room temperature', comfort: 'room temperature', under: 'what is under the floor', floorU: 'what is under the floor', otherT: 'the other room', floor: 'room', elA: 'room', glA: 'room', rest: 'room', ach: 'room' };

const UNDER = [{ id: 'ground', label: 'On the ground (slab)' }, { id: 'void', label: 'Suspended over a void' }, { id: 'room', label: 'A room below' }];

const HOURS = Array.from({ length: 24 }, (_, i) => ({ id: i, name: `${pad2(i)}:00` }));

export function EnvironmentPanel({ sc, params, solar, set, wide, project }: Props) {
  // Which project settings this run no longer matches (none: it is the house as modelled).
  const off = project ? [...new Set((Object.keys(project.patch) as Array<keyof Scenario>).filter((k) => JSON.stringify(sc[k]) !== JSON.stringify(project.patch[k])).map((k) => AREA[k] ?? k))] : [];
  const site = sc.site ?? project?.patch.site;
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
      <div className={wide ? 'env-span env-head section-head' : 'env-head section-head'}>
        <div>
          <h2>{!project ? 'Simulation settings' : off.length ? 'What if…' : 'Your house'}</h2>
          <p className="small muted">{!project ? 'No house to take settings from yet, so these are generic settings.'
            : off.length ? `Changed from your house: ${off.join(', ')}. The house: ${project.note}.`
            : `Set from your house: ${project.note}. Change anything below to try a what-if.`}</p>
        </div>
        {project && off.length > 0 && <button type="button" className="btn-secondary" onClick={() => set(project.patch)}>Back to your house</button>}
      </div>

      <Field label="Location">
        <select className="select" value={sc.loc} onChange={(e) => set(e.target.value === 'house' ? { loc: 'house', site } : { loc: e.target.value })}>
          {site && <option value="house">{site.name}</option>}
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
        <ChipGroup label="Orientation" items={ORIENTS} value={sc.orient} onPick={(orient) => set({ orient, az: undefined })} text={(o) => o.label} />
        {sc.orient === 'roof' && <Slider id="env-pitch" label="Roof pitch (0 = flat)" value={sc.pitch ?? 0} min={0} max={70} step={1} unit="°" onChange={(pitch) => set({ pitch })} />}
        {sc.orient !== 'floor' && sc.orient !== 'ceiling' && (sc.orient !== 'roof' || (sc.pitch ?? 0) > 0) && <Slider id="env-az" label={sc.orient === 'roof' ? 'Slope faces (bearing)' : 'Faces (bearing)'} value={Math.round(params.orient.az)} min={0} max={355} step={5} unit="°" onChange={(az) => set({ az })} />}
      </div>

      {params.other ? (
        <div className="stack-6">
          <Eyebrow>{sc.orient === 'ceiling' ? 'Above the ceiling' : 'Under the floor'}</Eyebrow>
          {sc.orient === 'floor' && <ChipGroup label="Under the floor" items={UNDER} value={sc.under ?? 'ground'} onPick={(under) => set({ under: under as Scenario['under'], floorU: undefined })} text={(t) => t.label} />}
          {(params.other.what === 'above' || params.other.what === 'below') && (
            <Slider id="env-other" label={`Room ${params.other.what} held at`} value={sc.otherT ?? 18} min={0} max={28} step={0.5} unit="°C" onChange={(otherT) => set({ otherT })} />
          )}
          <p className="small muted">{params.other.what === 'above' || params.other.what === 'below'
            ? `The room ${params.other.what} stays at its temperature all day. Heat is taken to flow ${params.other.what === 'above' ? 'up' : 'down'} through it (surface films ${params.other.Rsi.toFixed(2)} m²K/W each side, BS EN ISO 6946). Layers are listed from the room ${params.other.what} first.`
            : `${params.other.what === 'void' ? 'Void' : 'Ground'} below at ${params.other.T.toFixed(1)} °C in ${MONTHS_FULL[sc.month]}, steady over the day. U-value from BS EN ISO 13370 ${sc.floorU != null ? 'for this floor in your house' : 'for a typical house (B′ 5 m)'}.`}</p>
        </div>
      ) : (
        <div className="stack-6">
          <Eyebrow>Outer surface colour</Eyebrow>
          <ChipGroup label="Outer surface colour" items={COLOURS} value={sc.colour} onPick={(colour) => set({ colour })} text={(c) => c.label} />
        </div>
      )}

      <div className={wide ? 'stack-10 env-span' : 'stack-10'}>
        <Eyebrow>Room temperature</Eyebrow>
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
            <Slider id="rs_rest" label="Other outside walls and roof (same build-up, in shade)" value={sc.rest} min={0} max={100} step={1} unit="m²" onChange={(rest) => set({ rest })} />
            <Slider id="rs_gla" label="Glazing on the same face" value={sc.glA} min={0} max={20} step={0.5} unit="m²" onChange={(glA) => set({ glA })} />
            <Slider id="rs_ach" label="Ventilation" value={sc.ach} min={0.1} max={10} step={0.1} unit="air changes/h" onChange={(ach) => set({ ach })} />
            <Slider id="rs_gains" label="Heat from people and appliances" value={sc.gains} min={0} max={1000} step={25} unit="W" onChange={(gains) => set({ gains })} />
            <div className="small muted">Glazing treatment</div>
            <ChipGroup label="Glazing treatment" items={GLAZING} value={sc.glaz} onPick={(glaz) => set({ glaz })} text={(g) => g.label} />
            <div className="small muted">Other thermal mass in the room (floor, partitions, contents)</div>
            <ChipGroup label="Room thermal mass" items={MASSES} value={sc.mass} onPick={(mass) => set({ mass })} text={(m) => m.label} />
          </div>
        )}
      </div>

      <p className={wide ? 'small muted env-span' : 'small muted'}>
        Mean air {params.tmean.toFixed(1)} °C, swinging ±{(params.swing / 2).toFixed(1)} K around it, peaking at 15:00.{' '}
        {params.other
          ? `This ${sc.orient === 'ceiling' ? 'ceiling' : 'floor'} sees no sun${params.other.what === 'void' ? '; the void under it follows the outdoor air in part' : ', and the outdoor air only matters for a room left with no heating'}.`
          : `${solar.toFixed(1)} kWh/m² of sun lands on this face; the outer surface absorbs ${Math.round(params.alpha * 100)}% of it.`}{' '}
        Times are solar time (add one hour in BST).
      </p>
    </section>
  );
}
