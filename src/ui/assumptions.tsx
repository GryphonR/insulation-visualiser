// Where each efficiency and cost figure comes from, shown behind the "?" buttons. One place, so every page says the same thing.
import { activeSheet } from '../engine/house';
import type { House } from '../engine/house';

type Hp = House['hp'];

export const WHY = {
  elecP: 'Default: the Ofgem price cap unit rate for electricity, 1 Oct – 31 Dec 2026, paying by direct debit. Put in your own tariff. Heat pump and time-of-use tariffs are often much cheaper than this.',
  gasP: 'Default: the Ofgem price cap unit rate for gas, 1 Oct – 31 Dec 2026, paying by direct debit. Put in your own tariff.',
  gasSC: 'Default: the Ofgem price cap gas standing charge, 1 Oct – 31 Dec 2026. Only added to the running cost when the standing charge box is ticked.',
  standing: 'The gas standing charge is paid every day whatever you use, so it only changes the comparison if moving off gas lets you cap the supply. Left out by default. Electricity standing charges are paid with any heat source, so they are never counted.',
  oilP: 'A rough typical UK heating oil (kerosene) price, not an official figure. From your last delivery: pence per litre ÷ 10.3 kWh per litre.',
  lpgP: 'A rough typical UK bulk LPG price, not an official figure. From your last delivery: pence per litre ÷ 7.0 kWh per litre. Bottled LPG costs more.',
  co2: 'SAP 10.2 emission factors, kgCO₂e per kWh bought: electricity 0.136, mains gas 0.210, heating oil 0.298, LPG 0.241. The electricity figure is a yearly grid average and keeps falling as the grid decarbonises; put in a current or future figure to see the effect.',
  capacity: 'The heat source\'s output at the design outside temperature, from its datasheet. Heat pumps give less output in colder weather, so use the figure at your design temperature, not the headline rating. Spare capacity compares this with the design heat loss.',
  boilerEff: 'Seasonal efficiency of a boiler that never condenses, the same at any flow temperature. Roughly 65–75% for old cast-iron or back boilers and 78–85% for later fan-flued ones. A specific model\'s SEDBUK figure is on the Product Characteristics Database (PCDB).',
  condensing: 'Worked out from the return water temperature (flow minus the flow–return drop), month by month. A condensing boiler only condenses, and gains its extra efficiency, when the return is below the flue gas dew point. Gross efficiency (the basis fuel is billed on): 96% for gas, 94% LPG, 93% oil at a 30 °C return or below, falling in a straight line to 86% at the dew point (55 °C gas, 50 °C LPG, 47 °C oil) and staying there above it. These are typical values, not a specific boiler. Real part-load returns run cooler than the design drop, so this is slightly cautious. The ErP or SEDBUK rating is measured with a cool return, so it overstates a boiler running at 70/60 °C.',
  hpFactor: 'How close the heat pump gets to the ideal (Carnot) COP for its temperatures. This one number stands in for the heat pump model. Manufacturer datasheets, measured in a lab at steady conditions, usually work out at 0.50–0.60. Whole installed systems measured in UK field trials come in lower. 0.45 is a middle, slightly cautious figure. To match a specific unit, adjust it until "COP at design" matches the datasheet COP at your design outside and flow temperatures.',
  sheet: 'Enter COP test points from the heat pump\'s datasheet to model that unit instead of a typical one. They are listed as "EN 14511" performance data, for example A7/W35 = air 7 °C, water flow 35 °C (ground source: B0/W35 = brine 0 °C). The Heat Pump Keymark certificate and the MCS product directory list the same figures. The points that matter most are at cold source temperatures (A2, A−7) and at the flow temperatures this house will run. Datasheet figures are measured in a lab at steady full load, so a real installation usually does somewhat worse.',
  pointFactor: 'The share of the ideal (Carnot) COP this point achieves: its COP ÷ the ideal COP at its temperatures. Between points the factor is blended by source temperature; beyond the coldest and warmest points the nearest one is used. The physics then sets COP at other flow temperatures.',
  seasonal:'Heat delivered over the year ÷ energy bought over the year: SCOP for a heat pump, seasonal efficiency for a boiler. Months are weighted by how much heat each one needs. It leaves out hot water, circulation pumps, backup heaters and cycling in mild weather, and uses each month\'s mean outside temperature, which averages out cold snaps. Use it to compare options, not to predict a particular product.',
  bought: 'Space heating ÷ heat per kWh bought, month by month: electricity for a heat pump, fuel for a boiler. Space heating only; hot water is not included yet.',
  cost: (hp: Hp) => `Energy bought × unit price${hp.gasStanding ? ', plus the gas standing charge for gas boilers' : ''}. Uses the prices on the Energy & cost page; set your own there.${hp.gasStanding ? '' : ' Standing charges are left out.'}`,
  carbon: 'Energy bought × the emission factor for that fuel (SAP 10.2 by default; editable on the Energy & cost page).',
};

/** How the COP or efficiency of this heat source is worked out, with the house's own figures. */
export function sourceWhy(hp: Hp): string {
  const f = hp.hpFactor, sheet = activeSheet(hp);
  if (sheet) {
    const L = sheet.source === 'gshp' ? 'B' : 'A';
    const pts = sheet.points.filter((p) => p.cop > 0).map((p) => `${L}${p.src}/W${p.flow} COP ${p.cop}`).join(', ');
    return `Calibrated to the ${sheet.model || 'entered'} datasheet (${pts}). The COP matches each point exactly. Between and beyond them it follows the ideal (Carnot) COP scaled by each point's performance factor, so other flow and source temperatures are worked out from the physics. ${sheet.source === 'gshp' ? 'Brine is taken as 5 K under the region\'s ground temperature, swinging ±3 K: coldest in March.' : 'Defrost is included the way the datasheet A2 point includes it.'} Datasheet figures are from lab tests at steady full load; real installations usually do somewhat worse.`;
  }
  switch (hp.source) {
    case 'boiler': return WHY.boilerEff;
    case 'condensing': return WHY.condensing;
    case 'gshp': return `An estimate, not a specific model. COP = ${f} (the performance factor) × the ideal (Carnot) COP between the refrigerant temperatures: condensing 5 K above the flow temperature and evaporating 4 K below the ground loop brine. Brine is taken as 5 K under the region's ground temperature, swinging ±3 K: coldest in March, warmest in September. No defrost. Capped at 7. Real units vary by model and by how the ground loop is sized.`;
    default: return `An estimate, not a specific model. COP = ${f} (the performance factor) × the ideal (Carnot) COP between the refrigerant temperatures: condensing 5 K above the flow temperature and evaporating 6 K below the outside air. Between −4 and 6 °C it loses 7% to defrosting. Capped at 7. Real units vary by model, so check the datasheet COP at your design temperature and flow, and set the performance factor to match.`;
  }
}
