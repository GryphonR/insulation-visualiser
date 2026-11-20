# Insuliser

Visualises how heat moves through a building's insulation build-up over a 24-hour UK day: layer temperatures, heat flow, decrement factor, time lag, and (optionally) a free-floating room driven by the weather.

## Run

```bash
npm install
npm run dev      # site: http://localhost:5173/insulation-visualiser/  app: …/insulation-visualiser/app/
npm test         # engine unit tests
npm run build    # typecheck + production build + prerendered site pages
```

There are two pages. The public site (landing page and Learn) is `index.html` + `src/site/`, and the app is `app/index.html` + `src/main.tsx`. After `vite build`, `scripts/prerender.mjs` renders the landing page, every Learn section (the app's own `LearnPage`, linked to static URLs) and a 404 page to static HTML, so they load without JavaScript and search engines can read them. Set `VITE_SITE_URL` (e.g. in `.env.cloud`) to add canonical links and a `sitemap.xml`. Old links like `/#/plan` forward to `/app/#/plan`.

Vite's `base` is set to `/insulation-visualiser/` (see `vite.config.ts`) so built asset URLs resolve correctly as a GitHub Pages project page; the dev server serves from under that same path, not the bare root.

## Deployment

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml` (Actions, not a `gh-pages` branch). Live at `https://<owner>.github.io/insulation-visualiser/`. That build has no accounts: everything stays in the browser.

### Cloud version (Cloudflare, with sign-in and sync)

`npm run cf:build` builds with `--mode cloud` (served from `/`, sign-in on). A Worker (`worker/`) serves the app, runs sign-in with [Better Auth](https://better-auth.com) (email magic link, plus Google if it's configured), and stores each user's projects (minus traced plan images, which stay on the device), custom materials, library and favourites in D1. localStorage is still the working copy, and `src/engine/sync.ts` pushes and pulls in the background. When two devices edit the same project, both versions are kept.

Local: copy `.dev.vars.example` to `.dev.vars`, run `npm run cf:db` once, then run `npm run cf:dev` and `npm run dev:cloud` together and open http://localhost:5173/app/. Sign-in links print in the wrangler console.

First deploy:
1. `npx wrangler d1 create insuliser`, then put the id it prints into `wrangler.jsonc`.
2. In `wrangler.jsonc`, set `BETTER_AUTH_URL` to the real origin and `MAIL_FROM` to an address on a domain verified with Resend.
3. `npx wrangler secret put BETTER_AUTH_SECRET` (a long random string) and `RESEND_API_KEY`. For Google, also `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, with redirect URI `<origin>/api/auth/callback/google`.
4. `npm run cf:deploy` (build, apply migrations, deploy).

## Layout

- `src/engine/` – pure TypeScript physics, no UI imports.
  - `data.ts` materials, presets, UK months/locations/weather
  - `solar.ts` clear-sky irradiance on a wall or roof
  - `simulate.ts` 1-D transient conduction (finite volume, backward Euler) plus the optional lumped room
  - `scenario.ts` turns the user's choices into simulation parameters
  - `library.ts` the build-up library: built-in presets plus custom stackups saved to `localStorage`
  - `materials-extra.ts` ~260 additional materials (conductivity, density, specific heat) generated from a pasted reference table by `scripts/gen-materials.py`; regenerate it from `scripts/materials.tsv` if that table changes, don't hand-edit the generated file
  - `favorites.ts` starred materials and categories (for `MaterialPickerModal`), saved to `localStorage`
- `src/ui/` – React components and SVG charts.
  - `Builder.tsx` the layer editor, reused both in the single-wall view and inside `StackupModal.tsx`
  - `MaterialPickerModal.tsx` the material picker: categories on the left, that category's materials on the right, a star on each material to favourite it (favourites get their own category, shown first)
  - `ComparePage.tsx` the side-by-side comparison screen: pick up to four build-ups from the library, they all run under one shared day, and the wall sections and overlay charts update together off one clock

## Modes

- **Single wall** – build one wall, set the day, see its stats, cross-section and charts.
- **Compare build-ups** – pick up to four build-ups (presets, or ones you've saved), set one shared day, and see each wall's cross-section and stats next to each other, plus overlaid temperature and heat-flow charts. Save your own build-ups to the library from either mode; they persist in the browser's `localStorage`.

## Model in one paragraph

Each layer is split into slices. Outside is driven by sol-air temperature (air + absorbed sun, minus long-wave loss for roofs); inside is a fixed temperature, a schedule, or a lumped room node coupled to the wall, glazing, ventilation and gains. The day is repeated until periodic; decrement factor and time lag come from the first harmonic of sol-air temperature versus inner-face heat flow.

Limits: no thermal bridging, moisture, or ventilated cavities; synthetic weather from monthly means; teaching and early-design use, not compliance.
