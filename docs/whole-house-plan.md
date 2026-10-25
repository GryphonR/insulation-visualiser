# Whole-house model: implementation plan

Design canvas: https://claude.ai/artifact/PEwA7xUd6LdQC4RmwpZJwB (28 boards; the board codes below, such as 1d, refer to it).

## Phase 1 (this branch)

A new "Whole house" tab alongside Single wall / Compare / Moisture.

- `src/engine/house.ts`: the data model and the design-day calculation, with no React.
- `src/engine/house-default.ts`: the reference house (layout from board 1).
- `src/engine/house.test.ts`: checks that the energy balance holds and that each figure's sign and range are sensible.
- `src/ui/HousePage.tsx` + `src/ui/house.css`: plan, room editor, results. Reuses `StackupModal` for editing build-up layers.
- The house is saved to localStorage under `insulation-visualiser.house.v1`. A save that can't be read falls back to the reference house.

### Data model

- **Storeys:** each has `h`, the ceiling height (m), and `zone`, the floor-zone thickness above it.
- **Rooms:** rectangles `x, y, w, d` (m) on a storey, with north at the top (y = 0).
  - `span` is 1 or 2 storeys. The hall and landing use 2.
  - Other fields: `heated`, `setpoint`, `type` (for the CIBSE rates), and `ach` for unheated rooms.
- **Faces are derived, not entered:**
  - A shared edge on the same storey becomes an internal wall to that room.
  - Any other edge is an outside wall, or a party wall if it's on the party side.
  - On the ground storey the floor is ground. On upper storeys, the floor faces the rooms below where they overlap and outside where they don't.
  - The ceiling of the top storey faces the loft (or outside, as a flat roof). Lower ceilings face the rooms above.
- **Build-up for each face:** from `defaults` by face type, with per-face `overrides` keyed by face.
- **Openings:** each sits on one side of a room and is subtracted from that side's outside wall area.
- **Build-ups:** layers from the existing material library, or a fixed `u` for glazing and doors.

### Calculation rules

- **Fabric:** U·A·(Ti − Tother).
  - Film resistances by face type: walls 0.13 + 0.04; internal walls 0.13 + 0.13; internal floors 0.17 + 0.10; ceiling to loft 0.10 + 0.10; roof 0.10 + 0.04.
  - Ground floors use the BS EN ISO 13370 slab formula, with λ = 2.0 and w = 0.3. B′ is worked out from the ground-storey area and exposed perimeter. ΔT is to the ground temperature.
- **Junctions:** y × external area × ΔT to outside. Default y = 0.08.
- **Ventilation:**
  - Whole-house model (board 1d): n_inf = q50·Env/V/20 · (0.5 + 0.25·extWalls + 0.15·underRoof).
  - Device allowances (SAP 10.2 Table 2.1), as m³/h: open chimney 80, blocked 20, closed fire 10, fan 10, vent 10.
  - Mechanical extract (dMEV) and MVHR are shared out by volume.
  - The CIBSE room-type rates are an alternative.
  - Loss = 0.33·n·V·ΔT.
- **Unheated spaces** (utility, loft): T = Σ(H·T)/ΣH, including ventilation 0.33·n·V. Solved together by iteration.
- **Annual heat:** HTC × HDD(15.5) × 24/1000, split across months by the monthly mean temperatures.
- **Heat pump:**
  - COP = 0.45·Tc/(Tc − Te), × 0.93 between −4 and 6 °C.
  - Weather compensation: flow 25 °C at 15 °C outside, rising to the max flow temperature at the design temperature.
  - Capacity is checked at the design temperature. The rated output already includes defrost.
- **Prices** (Ofgem cap, 1 Oct – 31 Dec 2026): electricity 26.32p/kWh; gas 7.97p/kWh plus 29.68p/day. Carbon: grid electricity 0.13 kg/kWh, gas 0.183 kg/kWh.

### Reference figures from the design boards

These are sample data. The engine works them out from geometry, so expect them to move.

- House peak 4.5 kW.
- Ventilation ~1,710 W. Kitchen 0.91 ach, 270 W.
- Windows 810 W; doors 135 W; junctions 330 W.
- Utility 12.8 °C; loft −1.7 °C.
- Space heating 10,200 kWh/yr.
- Heat pump 4.9 kW at −2.2 °C (9% spare).
- Estimated q50 10.5.

## Later phases

- **Phase 2:**
  - Scenarios and compare A vs B (5, 5a);
  - test conditions and year results (6, 4b);
  - occupancy and gains (6a).
- **Phase 3:** emitters, zones and UFH loops (3, 3a, 1b).
- **Phase 4:**
  - room shapes: coombed ceilings, room in roof, dormers (1c);
  - floor types: suspended timber, basement (2b);
  - rooms of any shape, and plan tracing.
- **Phase 5:**
  - calibration against bills (4d);
  - moisture risk (4f);
  - report and export (4e);
  - new-project templates and EPC (0a);
  - survey mode and history (1f).

## Decisions (answered)

1. **Party walls:** user-definable. Any outside wall can be switched to a neighbour wall, and the neighbour temperature is an input (default 10 °C). The demo house has none.
2. **U-values:** always computed from the stack-up layers. The only exceptions are glazing and doors, which take a fixed U.
3. **Climate:** from the MCS tables (`src/engine/climate-mcs.ts`):
   - design temperature from the chosen weather station, 99.6% by default, with the altitude rule;
   - ground temperature from the regional mean annual temperature;
   - degree days from the postcode area.
4. **ΔT for each face:** set by what is on the other side. The ground floor uses the ground temperature.
5. **Junctions:** left out for now, as an advanced feature for later.
6. **Ventilation minimum:** the MCS 0.5 ach minimum applies to habitable rooms (living, dining, bedroom, study). It is on by default and can be switched off.
7. **Hot water:** later.

## Phase 1 status: built

- **Pages and code:**
  - `#/house` tab: plan with heat-loss and temperature colouring, room editor, per-face build-up and party-wall choice, windows and doors;
  - cards for climate, ventilation, loft, heat pump, and build-ups (layers edited with the existing layer editor);
  - room results table and model checks.
- **Tests:** `src/engine/house.test.ts`.
- **Demo house** at Manchester (Woodford, 60 m altitude, −4.5 °C):
  - heat loss 4.7 kW, of which ventilation 1.9 kW and windows 0.8 kW;
  - kitchen 0.90 ach;
  - utility room 12.6 °C;
  - about 10,000 kWh/yr;
  - SCOP 3.6.
- **Engine change from the design:** the COP uses refrigerant temperatures (condensing 5 K above flow, evaporating 6 K below outside). The plain flow-temperature Carnot fraction gave SCOP 4.9, which is too high.

## Phase 2 status: built

- **Scenarios** (`src/engine/house-scenarios.ts`):
  - A project holds a tree of scenarios. Each is a full copy of the house plus its parent.
  - A scenario's changes are the difference from its parent, matched by id for rooms, openings, build-ups, factors and devices.
  - Changes are described in plain words and can be switched off. The waterfall applies them one at a time.
  - Saved under `insulation-visualiser.house-project.v1`. An older single-house save becomes the base scenario.
- **Workspace** (`src/ui/HouseWorkspace.tsx`):
  - a scenario bar to rename a scenario, set it as a plan or what-if, branch or delete it;
  - views: Model, Scenarios (tree, changes, step by step, all-scenarios matrix), and Compare A vs B (A, B, difference or side-by-side plans; room detail; what B changes).
- **Hour-by-hour runs** (`src/engine/house-sim.ts`, `src/ui/HouseRuns.tsx`):
  - **Model:** each room is two parts, air and mass. The mass is coupled at 9.1 W/m²K over 2.5 × the floor area, as in ISO 13790. The loft is one more node.
  - **Heating:** follows the living-area and bedroom schedules, with a setback. Each room's emitter is sized as its design loss × (heat pump capacity / peak), and the heat pump total is capped.
  - **Gains:** people, appliances, lighting and cooking from board 6a, plus sun through windows from the existing sun model.
  - **Cases:** the design day, a summer peak day, a 5-day cold snap with the heating off, and a typical year. The year uses monthly means shifted to the region, plus daily swing and multi-day spells.
  - **Year view:** monthly bars against a comparison scenario, a calendar of daily heat, a chart for the chosen day, and comfort hours for each room.
- **Demo results:**
  - typical year about 8,350 kWh (degree-day estimate 10,000), SCOP 3.5;
  - with the setback, the design-day reheat runs the 6 kW heat pump flat out and leaves living rooms short for a few hours.

## Open questions

1. **Picking the weather station:** at present the user picks it from the list. MCS picks the nearest station to the postcode centre, which needs postcode coordinates. Should we use postcodes.io (a free external API, so the postcode is sent off-site), or bundle a table of postcode-area centres?
2. **Default room temperatures:** MCS (CIBSE 2026 Table 2-2) defaults depend on the age band. Should the house have an age-band field so new rooms take 18 or 21 °C automatically? At present it's 21 °C, with the MCS figure shown as a hint.
3. **MVHR and the 0.5 ach minimum:** at present the minimum applies to the effective rate after heat recovery. Should it apply to the supply rate instead? The MCS calculator's exact treatment isn't documented on its site.
4. **Loft gable walls:** not counted in the loft's heat balance yet. The loft-temperature effect is small. Add them as faces when room-in-roof (phase 4) arrives?
5. **Weather:** the typical year is synthetic, built from monthly means. Should we bundle real hourly test-reference-year data for the 14 MCS stations (CIBSE TRY files are paid; PVGIS TMY is free)?
6. **Comfort thresholds:** too warm is above 25 °C, or 26 °C in bedrooms (a simplification of CIBSE TM59). Is that enough, or do you want TM59's full criteria?
7. **Scenarios and the house plan:** a scenario can move or add rooms. Should structural changes be locked in scenarios, with only fabric and systems allowed to change?
