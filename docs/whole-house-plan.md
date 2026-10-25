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

## Questions for Rowan

1. **Party wall:** board 0a calls the reference house a 1950–66 semi, but the plan on board 1 has outside walls on all four sides. Which side is the party wall? What temperature should the neighbour be: 10 °C as in MCS, or the same as ours?
2. **Wall U-value:** the reference cavity wall uses U 0.17 ("PIR filled"). A filled 1950s cavity is nearer 0.5. Keep 0.17, or use a realistic retrofill?
3. **Design temperature and degree days:** −2.2 °C and 2,200 K·day are fixed inputs for now. Should these come from the MCS / CIBSE location table, by postcode?
4. **Ground floor ΔT:** should it be to the annual-mean ground temperature (EN 12831 style, 9 °C here)? Or to the outside design temperature?
5. **Junctions:** a single house y-value (0.08 accredited, 0.15 SAP default for unknown details), or ψ × length per junction from phase 1?
6. **Minimum ventilation:** should the 0.5 ach minimum for habitable rooms (MCS 2026) be applied automatically?
7. **Annual energy:** should it include hot water now, or wait for phase 2 with occupancy?
