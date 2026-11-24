import { MCS_STATIONS } from '../engine/climate-mcs';
import { MAT } from '../engine/data';
import { OPEN_DOORWAY, OPEN_STAIRWELL } from '../engine/house-draw';
import { mcsHouse } from '../engine/house';
import type { Buildup, House, HouseResult } from '../engine/house';
import { EMITTER_NAME, RAD_LABEL, ratedOf } from '../engine/house-heating';
import type { Emitter } from '../engine/house-heating';
import { fmt } from './hform';

/** The method and design conditions an assessor checks, one fact per row: shared by the report page and the MCS PDF. */
export function methodRows(drawn: House, res: HouseResult): Array<[string, string]> {
  const house = res.basis === 'mcs' ? mcsHouse(drawn) : drawn, v = house.vent;
  return [
    ['Standard', 'BS EN 12831-1:2017, room by room, as MIS 3005-D Issue 3.0 requires; design data from CIBSE DHDG 2026'],
    ['Outside design temperature', Number.isFinite(house.climate.designT)
      ? `${res.Tout} °C, set by the designer (MCS figure ${res.ToutMcs} °C)`
      : `${res.Tout} °C: CIBSE Guide A, ${MCS_STATIONS[res.climate.station]?.[1] ?? res.station} (${res.station}), exceeded ${house.climate.pct}% of hours, corrected for ${house.climate.altitude} m altitude`],
    ['Room temperatures', `As listed for each room; defaults from CIBSE DHDG 2026 Table 2-2, age band ${house.ageBand === 'K' ? 'K onwards' : 'A–J'}${res.basis === 'mcs' ? ', and no lower than MIS 3005-D Table 1' : ''}`],
    ['Ground floors', `U-value by BS EN ISO 13370; solid floors to the annual mean ground temperature, ${res.Tg} °C (${res.region}), suspended floors to the outside design temperature (MIS 3005-D 5.5.1)`],
    ['Next door', `${house.neighbourT} °C across party walls and floors`],
    ['Unheated spaces', 'At the temperature where their heat gains and losses balance'],
    ['Thermal bridging', res.tb > 0 ? `ΔU ${res.tb} W/m²K added to the U-value of every element of the heated envelope` : 'Calculated Ψ at the floor-to-wall junction, where modelled'],
    ['Ventilation', `${v.method === 'cibse' ? 'CIBSE room-type air change rates' : 'BS EN 12831-1 6.3.3.3, the heated rooms as one ventilation zone, Annex B default coefficients'}`
      + `; air permeability q50 ${fmt(res.q50, 1)} m³/h·m² (${v.source === 'meas' ? 'measured' : `estimated${house.calib ? ', adjusted to the bills' : ''}`})`
      + (v.minAch ? '; at least 0.5 ach in every room with outside envelope' : '')
      + (v.mech === 'mvhr' ? `; MVHR ${fmt(v.mechFlow)} m³/h, ${fmt(v.eta)}% heat recovery` : v.mech === 'dmev' ? `; continuous extract ${fmt(v.mechFlow)} m³/h` : '')],
  ];
}

/** An emitter in a few words: a radiator's size and type, a rated output, or a loop's area and spacing. */
export const emitterText = (e: Emitter) => (e.kind === 'radiator' ? `${e.len}×${e.height} ${RAD_LABEL[e.type].split(' ')[0]}`
  : e.kind === 'towel' || e.kind === 'fancoil' ? `${EMITTER_NAME[e.kind]} ${fmt(ratedOf(e))} W` : `UFH ${fmt(e.area, 1)} m² at ${e.spacing} mm`);

/** The constructions the house uses, for the build-ups table: not the open stairwell or doorway, which are gaps, not build-ups. */
export const reportBuildups = (house: House, res: HouseResult) => house.buildups.filter((b) => b.id !== OPEN_STAIRWELL && b.id !== OPEN_DOORWAY
  && res.rooms.some((r) => r.faces.some((f) => f.buildup.id === b.id)));

/** A build-up's layers by material name, outside to inside, or that its U-value was declared. */
export const layersText = (b: Buildup) => (b.u != null ? 'Declared U-value' : b.layers.map(([m, t]) => `${MAT[m]?.name ?? m} ${t} mm`).join(' · '));

/** Emitter output as a share of the room's MCS heat loss; a room that loses no heat on the design day needs none. */
export const coverText = (out: number, need: number) => (need > 0 ? `${fmt((out / need) * 100)}%` : 'no loss');

/** Heat paths of a result: each kind of face and the whole-house ventilation, W (they add up to its peakW). */
export function heatPaths(res: HouseResult): Array<[string, number]> {
  const heated = res.rooms.filter((r) => r.room.heated);
  const kinds: Array<[string, string]> = [['Walls', 'wall'], ['Windows', 'window'], ['Doors', 'door'], ['Floors', 'floor'], ['Roof and ceilings', 'ceiling']];
  return [['Ventilation', heated.reduce((t, r) => t + r.ventZoneW, 0)],
    ...kinds.map(([l, k]): [string, number] => [l, heated.reduce((t, r) => t + r.rows.filter((x) => x.kind === k).reduce((s, x) => s + x.W, 0), 0)])];
}
