import type { ScenarioResult } from '../engine/scenario';
import { harmonic, lagHours } from '../engine/simulate';
import { pad2, sgn } from '../lib/util';

interface Tile {
  label: string;
  value: string;
  unit: string;
  note: string;
}

export function buildTiles(res: ScenarioResult): Tile[] {
  const { sim, params } = res;
  const fr = sim.fr;
  const free = !!params.free;
  const tiles: Tile[] = [
    { label: 'U-value', value: sim.U.toFixed(2), unit: 'W/m²K', note: `Steady-state, R = ${sim.Rtot.toFixed(2)} m²K/W including surface films.` },
    {
      label: 'Decrement factor', value: sim.decr.toFixed(2), unit: '',
      note: 'Share of the outside heat swing that reaches the inner face. Lower is better.' + (free ? ' Wall property, found with the room held steady.' : ''),
    },
    {
      label: 'Decrement delay', value: sim.lag.toFixed(1), unit: 'hours',
      note: 'Delay between peak sol-air temperature and peak heat flow at the inner face.' + (free ? ' Wall property, found with the room held steady.' : ''),
    },
    { label: 'Inner thermal mass', value: String(Math.round(sim.kin)), unit: 'kJ/m²K', note: `Heat capacity inside the main insulation (top 100 mm). Whole wall: ${Math.round(sim.ktot)} kJ/m²K.` },
    { label: 'Inner face', value: `${sim.timin.toFixed(1)}–${sim.timax.toFixed(1)}`, unit: '°C', note: `Swing of ${(sim.timax - sim.timin).toFixed(1)} K across the day.` },
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
      { label: 'Room air', value: `${lo.toFixed(1)}–${hi.toFixed(1)}`, unit: '°C', note: `Free-floating. Swing of ${(hi - lo).toFixed(1)} K; outdoor air swings ${params.swing.toFixed(1)} K.` },
      {
        label: 'Room peak delay', value: lagHours(ha, hr).toFixed(1), unit: 'h',
        note: `Room air peaks around ${peak}, this long after outdoor air peaks. Its daily swing is ${Math.round(ha.amp > 1e-6 ? (hr.amp / ha.amp) * 100 : 0)}% of the outdoor swing.`,
      },
    );
  }
  return tiles;
}

export function Stats({ res }: { res: ScenarioResult }) {
  return (
    <section aria-label="Wall properties" className="tiles">
      {buildTiles(res).map((t) => (
        <div key={t.label} className="tile">
          <div className="eyebrow">{t.label}</div>
          <div className="tile-value"><span className="mono big">{t.value}</span><span className="muted">{t.unit}</span></div>
          <div className="small muted">{t.note}</div>
        </div>
      ))}
    </section>
  );
}
