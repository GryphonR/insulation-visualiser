import type { ScenarioResult } from '../engine/scenario';
import { harmonic, lagHours } from '../engine/simulate';
import { pad2, sgn } from '../lib/util';

interface Tile {
  label: string;
  value: string;
  unit: string;
  note: string;
  /** A property of the build-up itself; otherwise it depends on the weather, room and heating chosen. */
  wall?: boolean;
}

export function buildTiles(res: ScenarioResult): Tile[] {
  const { sim, params } = res;
  const fr = sim.fr;
  const free = !!params.free;
  const held = fr.tin.some((v) => v !== fr.tin[0]) ? ' Wall property, found with the room held steady.' : '';
  const tiles: Tile[] = [
    { wall: true, label: 'U-value', value: sim.U.toFixed(2), unit: 'W/m²K', note: params.other?.what === 'ground' || params.other?.what === 'void'
      ? `BS EN ISO 13370, including the ground below (R = ${sim.Rtot.toFixed(2)} m²K/W in all).`
      : params.other ? `Between two rooms, R = ${sim.Rtot.toFixed(2)} m²K/W including both surface films.`
      : `Steady-state, R = ${sim.Rtot.toFixed(2)} m²K/W including surface films.` },
    // What lies beyond a floor or ceiling is held steady over the day, so there's no outside swing to let through or lag behind.
    ...(params.other ? [] : [{
      wall: true, label: 'Heat swing let through', value: sim.decr.toFixed(2), unit: '',
      note: 'Decrement factor: the share of the outside day-night heat swing that reaches the inside surface. Lower is better.' + held,
    },
    {
      wall: true, label: 'Time lag', value: sim.lag.toFixed(1), unit: 'hours',
      note: 'Decrement delay: how long after the hottest outside surface (sun plus air) the heat flow at the inside surface peaks.' + held,
    }]),
    { wall: true, label: 'Inner thermal mass', value: String(Math.round(sim.kin)), unit: 'kJ/m²K', note: `Heat capacity inside the main insulation (top 100 mm). Whole wall: ${Math.round(sim.ktot)} kJ/m²K.` },
    { label: 'Inside surface', value: `${sim.timin.toFixed(1)}–${sim.timax.toFixed(1)}`, unit: '°C', note: `Swing of ${(sim.timax - sim.timin).toFixed(1)} K across the day.` },
    { label: 'Heat into the room, 24 h', value: sim.gain.toFixed(0), unit: 'Wh/m²', note: 'Total heat crossing the inner face towards the room.' },
    { label: 'Heat out of the room, 24 h', value: sim.loss.toFixed(0), unit: 'Wh/m²', note: 'Total heat crossing the inner face away from the room.' },
    {
      label: 'Net heat flow, 24 h', value: sgn(sim.gain - sim.loss, 0), unit: 'Wh/m²',
      note: `${sim.gain.toFixed(0)} Wh/m² gained, ${sim.loss.toFixed(0)} Wh/m² lost. Positive means into the room.`,
    },
  ];
  if (free) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let g = 0; g < 144; g++) {
      lo = Math.min(lo, fr.tin[g]);
      hi = Math.max(hi, fr.tin[g]);
    }
    const hr = harmonic(fr.tin.subarray(0, 144));
    const ha = harmonic(fr.tair.subarray(0, 144));
    const peakH = ((((hr.ph / (2 * Math.PI)) * 24) % 24) + 24) % 24;
    const peak = `${pad2(Math.floor(peakH))}:${pad2(Math.round((peakH % 1) * 60) % 60)}`;
    tiles.unshift(
      { label: 'Room air', value: `${lo.toFixed(1)}–${hi.toFixed(1)}`, unit: '°C', note: `No heating, so the room drifts. Swing of ${(hi - lo).toFixed(1)} K; outdoor air swings ${params.swing.toFixed(1)} K.` },
      {
        label: 'Room peak delay', value: lagHours(ha, hr).toFixed(1), unit: 'h',
        note: `Room air peaks around ${peak}, this long after outdoor air peaks. Its daily swing is ${Math.round(ha.amp > 1e-6 ? (hr.amp / ha.amp) * 100 : 0)}% of the outdoor swing.`,
      },
    );
  }
  return tiles;
}

/** Build-up properties (headline cards) or the day's simulation results (shown inside the simulation box). */
export function Stats({ res, group }: { res: ScenarioResult; group: 'wall' | 'day' }) {
  const label = group === 'wall' ? 'Build-up properties' : "This day's results";
  return (
    <section aria-label={label} className="stack-10">
      {group === 'wall' && <h3 className="tiles-head">{label}</h3>}
      <div className="tiles">
        {buildTiles(res).filter((t) => !!t.wall === (group === 'wall')).map((t) => (
          <div key={t.label} className="tile">
            <div className="eyebrow">{t.label}</div>
            <div className="tile-value"><span className="mono big">{t.value}</span><span className="muted">{t.unit}</span></div>
            <div className="small muted">{t.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
