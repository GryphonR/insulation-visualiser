# Insulation Visualiser

Visualises how heat moves through a building's insulation build-up over a 24-hour UK day: layer temperatures, heat flow, decrement factor, time lag, and (optionally) a free-floating room driven by the weather.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests
npm run build    # typecheck + production build
```

## Layout

- `src/engine/` – pure TypeScript physics, no UI imports.
  - `data.ts` materials, presets, UK months/locations/weather
  - `solar.ts` clear-sky irradiance on a wall or roof
  - `simulate.ts` 1-D transient conduction (finite volume, backward Euler) plus the optional lumped room
  - `scenario.ts` turns the user's choices into simulation parameters
- `src/ui/` – React components and SVG charts.

## Model in one paragraph

Each layer is split into slices. Outside is driven by sol-air temperature (air + absorbed sun, minus long-wave loss for roofs); inside is a fixed temperature, a schedule, or a lumped room node coupled to the wall, glazing, ventilation and gains. The day is repeated until periodic; decrement factor and time lag come from the first harmonic of sol-air temperature versus inner-face heat flow.

Limits: no thermal bridging, moisture, or ventilated cavities; synthetic weather from monthly means; teaching and early-design use, not compliance.
