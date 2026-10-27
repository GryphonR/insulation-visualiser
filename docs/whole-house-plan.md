# Whole-house model: implementation plan

Design canvas: https://claude.ai/artifact/PEwA7xUd6LdQC4RmwpZJwB (28 boards; the board codes below, such as 1d, refer to it).

## Phase 1 (this branch)

A new "Whole house" tab alongside Single wall / Compare / Moisture. **Superseded: see "UI rebuild" below. The design is a multi-page app that replaces the old tabs.**

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

## Phase 3 status: built

- **Emitters** (`src/engine/house-heating.ts`):
  - **Panel radiators** (K1, P+, K2, K3) by length × height, from typical catalogue output per metre at ΔT50. Output = rated × ((mean water − room)/50)^1.3.
  - **Towel rails** by rated output.
  - **UFH loops:** area, spacing and covering. Output = (mean water − room) / (1/K_spacing + R_cover), capped at the EN 1264 29 °C floor-surface limit. Loop length = area/spacing + tails, flagged over 100 m.
- **Zones:** radiator zones and UFH manifolds (direct, or blended to 30–45 °C), switchable on and off, with their own hours or following the occupancy schedule.
- **Flow temperature:**
  - three controls: fixed, ideal weather compensation (the lowest flow that keeps every room at setpoint), or a two-point curve;
  - the room setting the flow temperature is named;
  - flow and COP by month. The heat pump COP now uses this flow, so bigger emitters raise SCOP.
- **Heating view:**
  - flow curve against the ideal;
  - emitter table with output, need and cover for each room, with add, remove and auto-size;
  - zones, plus heat pump flow by hour against its minimum flow;
  - the Model plan gains an "Emitter cover" colouring.
- **Hour-by-hour runs:** each room's heat is its emitters' output at the hour's flow temperature, on its zone's schedule.
- **Saved houses** from before phase 3 get one K2 radiator per heated room, sized for the design loss.

## Phase 4 status: built (room shapes and floor types)

- **Room shapes** (`RoomShape` in `house.ts`, editor in `src/ui/HouseShape.tsx`, top-storey rooms only):
  - presets: flat, coombed one side, coombed both sides, room in roof. Slopes run along either axis.
  - each side is a full wall, coombed (wall to the plate, then slope) or a knee wall with an eaves void;
  - inputs: pitch, knee or plate height, flat ceiling height (limited by the pitch), a rooflight, and a dormer per side (width, front height, window);
  - a live cross-section with the 1.5 m headroom line.
- **Geometry and heat paths:**
  - the section area sets the room volume and the mean height of the gable walls;
  - each slope is (ceiling − knee)/sin(pitch) × length, less the dormer cut;
  - the flat collar goes to the loft;
  - a knee wall is counted in series with the roof over its eaves void (cold tiles or warm), so the void temperature drops out.
- **Floor types:**
  - suspended timber (BS EN ISO 13370: deck in series with ground plus void walls and airbrick ventilation; airbrick area and void height are house inputs);
  - basement (lowest storey's depth below ground: walls against the ground, basement floor formula).
- **Storeys card:** names, ceiling heights, floor zones, adding and removing storeys. A loft conversion is a new top storey with a room-in-roof room.

## Phase 5 status: built

- **Check against bills** (`house-calibrate.ts`, `HouseBills.tsx`):
  - inputs: 12 months of gas, optional monthly mean temperatures, and a cooking and hot-water baseline (blank estimates it from the summer);
  - monthly model with knobs for room temperature offset, airtightness factor and share of rooms heated;
  - fit statistics against ASHRAE Guideline 14 limits (CV(RMSE) < 15%, NMBE ±5%);
  - grid-search best fit, and an energy-signature heat loss figure from the bills;
  - "Use as calibrated" stores the knobs on the scenario: annual heat uses them, and an estimated q50 is scaled; design-day temperatures are unchanged.
- **Moisture and mould** (`house-moisture.ts`, `HouseMoisture.tsx`):
  - room by room on a mean January day: moisture sources by room type and occupancy, removed by each room's ventilation;
  - the coldest opaque surface by ISO 13788 (Rsi 0.25), giving surface RH and a suggested fix;
  - toggles for drying washing indoors, extract fans used and trickle vents open;
  - the existing EN ISO 13788 condensation check for each outside build-up in use.
- **Report** (`HouseReport.tsx`):
  - printable report (print to PDF) with section toggles: design conditions, room table with emitters and cover, heat pump and running cost, build-ups, assumptions and checks;
  - room-table CSV; project export and import as JSON (sanitised, older saves upgraded).
- **New project** (`house-templates.ts`, `HouseStart.tsx`):
  - templates: mid-terrace, semi/end, detached, bungalow; width × depth; 1–3 storeys; seven age bands;
  - EPC facts (cavity filled, loft 250 mm+, floor insulated, double glazed) override the age guesses;
  - generates the rooms, windows and doors, party walls, build-ups, q50 and devices, plus radiators sized for the loss and a heat pump sized to it;
  - shows the likely range of the design loss before creating.
- **Undo and redo** for the whole project (50 steps, Ctrl+Z / Ctrl+Y outside text fields).
- **Unheated room types** from board 1e: garage, conservatory, porch, cellar.
- **Glazing library and shading** (board 2c):
  - glazing build-ups carry a g-value and frame fraction;
  - a library of seven typical types (single to triple, secondary, rooflight);
  - each window has a shading choice (none, light, overhang, heavy);
  - the hour-by-hour runs use g × glass share × shading for each window, and rooflights face the sky.

## Round 2: answers and what was built

1. **Postcode → station and region:** a bundled table of postcode-district centres (ONS and OS open data, OGL; 2,944 districts) finds the nearest MCS station and region by straight line. Both can be set by hand. Jersey and Guernsey use St Helier.
2. **Room temperature defaults:** follow CIBSE DHDG 2026 Table 2-2 for the house's age band (A–J or K onwards). They can be edited per room type, and "Apply to every heated room" sets them all.
3. **MVHR and the 0.5 ach minimum:** applies to fresh air supplied. Any top-up comes through the MVHR, so only its unrecovered share counts as loss.
4. **Real weather:** an option in the year run to use PVGIS 5.2 typical meteorological years (EU JRC, CC BY 4.0). These are bundled for all 15 MCS stations and loaded on demand. They give hourly temperature plus measured direct and diffuse sun, with sun on surfaces worked out from the sun's position.
5. **Too-warm threshold:** kept (25 °C, or 26 °C in bedrooms).
6. **Adding rooms in scenarios:** allowed. A new or removed room switches on and off together with its windows, emitters and face choices.
7. **Radiators:** generic outputs only.
8. **UFH routes:** loops drawn on the plan (rectangle, pattern, feed corner), with tails to a draggable manifold. Loop length and area come from the drawing.
9. **Pipe sizing:**
   - a tree of runs from the heat pump, each with flow, velocity and Pa/m;
   - limits flagged, and the index circuit checked against the pump head;
   - a typical layout to start from.
10. **Rooms of any shape:** polygon outlines. Edges anywhere along the same line become shared walls, each wall has its own bearing for sun, and polygon overlaps set floors and ceilings. Corners can be dragged or added; windows sit on a chosen wall.
11. **Tracing:**
    - a floor-plan image per storey, scaled from two points;
    - or Esri World Imagery satellite tiles, free to view with attribution;
    - the satellite view starts at the postcode district's centre and is nudged into place.
12. **Style:** the whole app is in the Drafting Table style (`src/drafting.css`). The other two skins are dropped.
13. **Smart meter:** CSV import of meter readings (supplier, n3rgy or Bright export; kWh or m³; any interval), added up into months.
14. **Sharing:** PDF and JSON export is enough.

## Round 3: answers and what was built

1. **Satellite imagery for a paid app:** the keyless Esri World Imagery tiles are gone, because their terms don't clearly allow commercial use. Satellite tracing is now bring-your-own:
   - a Mapbox Satellite preset (the user's own access token, under Mapbox's terms), or any tile URL template the user is licensed for;
   - the key stays in that browser and is never saved in the project or its exports;
   - Esri's keyed static basemap tiles have no plain imagery style, so they aren't offered.
2. **Sloping ceilings on rooms of any shape:**
   - each wall of a polygon room is full height, coombed, or a knee wall with an eaves void, and has its own eaves setting and optional dormer;
   - pitch, knee, flat-ceiling height and rooflight are shared;
   - the ceiling is the lowest of the slopes rising inward from each sloped wall (hips form at corners), capped at the flat ceiling;
   - volume, flat area, the slope area for each wall and the mean gable-wall heights come from a fine grid, cached per shape;
   - a rectangle drawn as a polygon matches the exact rectangle figures within 2–3%;
   - slope settings follow their walls when corners are added or removed, and convert both ways between rectangle and polygon where possible.
3. **Survey mode:** not wanted; dropped.

## Not built yet (from the design boards)

- Hot water and junctions (thermal bridges): later, as asked.

## Open questions

None outstanding.


## UI rebuild (replaces the single Whole house tab)

The phases above built the engine and its features, but put them all into one extra tab of the old app. The design boards describe a different app: board 0 (structure) and board 1a (room drill-down) are the specification for navigation.

**Structure:** one spine drilled by level, with results at each level.

| Level | Model | Results at that level |
| --- | --- | --- |
| House | location, design day, scenarios | whole-house kW and kWh, compare |
| Floor plan | rooms drawn per storey | plan lens |
| Room | a box of faces | loss by face |
| Element | one wall, floor, roof or window | the old single-wall simulator |

**Shell (`src/ui/Shell.tsx`):** project, scenario and conditions in the header; workflow 1 Model, 2 Build-ups, 3 Heating, 4 Results (a badge counts emitters that fall short); a sub-navigation for each step; a breadcrumb below the plan. The old Single wall, Compare and Moisture tabs are gone as top-level pages.

**Routes** (hash, `src/ui/route.ts`; no hash opens `#/start` on a first visit, otherwise `#/plan`):

| Route | Page | Board |
| --- | --- | --- |
| `#/start` | New project (name, postcode, template, age, EPC) | 0a |
| `#/plan[/room]` | Floor plan, lens, tracing, selected-room summary | 1 |
| `#/room/<id>[/details\|openings]` | Room as a box of faces; room and outline; windows and doors | 1a, 1c |
| `#/site`, `#/storeys`, `#/vent` | Climate and temperatures; storeys, ground and loft; ventilation | 1d, 1f |
| `#/buildups[/id]`, `#/materials` | Build-up library with layers, where used, defaults; material reference | 2, 2a |
| `#/compare-buildups` | The old Compare build-ups page, under the library | |
| `#/wall/<buildup id>` | Element level: the old single-wall simulator (heat flow, moisture over a year), loaded with that build-up | |
| `#/heating` | Flow temperature, emitters, zones, UFH, pipes | 3, 3a, 1b |
| `#/results`, `#/year`, `#/energy`, `#/bills`, `#/moisture`, `#/report` | Design-day results by room; test conditions and year; heat pump and cost; bills; moisture; report | 4, 4b, 6, 4c, 4d, 4f, 4e |
| `#/scenarios`, `#/compare` | Scenario tree; A vs B on the plan | 5, 5a |

**State:** `src/ui/project.tsx` holds the project, undo/redo, the active scenario and the results for every page. The first visit does not save the demo house until something changes, so the start screen shows again on reload.

### Added in the second pass

- Room page: 24-hour air temperature against outside and the setpoint (design-day run).
- Plan page: an add bar (room, window, door, radiator, UFH loop on the selected room; links to pipe runs and manifolds).
- New pages: Floors (2b), Windows & doors (2c), Unheated spaces (1e), Checks & history (1f), Occupancy & gains (6a, the same card as in the test conditions).
- Heating is split into System & flow, Emitters, Zones & UFH and Pipework.
- Materials: custom materials (saved in this browser, usable in any build-up); build-up layers change material inline and add layers.

### Still not built

- Internal doors open, shut or on a schedule: the engine has no door model, so there is no control.
- Floor edge upstand and junction values (2b), junction list and y-value (2c): junctions were deferred (decision 5).
- Window sun gain per month and curtains (2c); hot water, cylinder and the energy-board hot-water inputs (4c); named restore points and survey mode (1f; survey was dropped).
- Plan: free-form wall, pipe and manifold drawing tools; the shared clock dock; "storey below" ghost.
- Custom materials are not exported with a project; a shared project opens with their layers dropped.
- Not checked at phone width.
