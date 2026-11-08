import { useState } from 'react';
import type { ReactNode } from 'react';
import { storeyLevel } from '../engine/house';
import type { House, HouseResult, TraceSettings } from '../engine/house';
import type { Project } from '../engine/house-scenarios';
import type { Pt } from '../engine/geom';
import { Chip } from './controls';
import { planBounds } from './HousePlan';
import { NumInput } from './hform';


const TILE = 256, ZOOM = 19;

/**
 * Satellite imagery is bring-your-own: tiles load only from a provider and key the user is licensed for, so the
 * app itself never relies on free-to-view terms. Kept in this browser only, never in the project or its exports.
 */
export interface Imagery { provider: 'mapbox' | 'custom'; key: string; template: string; credit: string }
const IMAGERY_KEY = 'insulation-visualiser.imagery';
export const IMAGERY_PRESETS: Record<Imagery['provider'], Omit<Imagery, 'key' | 'provider'> & { label: string; terms: string }> = {
  mapbox: { label: 'Mapbox Satellite (your access token)', template: 'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg90?access_token={key}', credit: '© Mapbox © Maxar', terms: 'https://www.mapbox.com/legal/tos' },
  custom: { label: 'Other provider (tile URL)', template: '', credit: '', terms: '' },
};
export function loadImagery(): Imagery {
  try {
    const v = JSON.parse(localStorage.getItem(IMAGERY_KEY) ?? 'null');
    if (v && (v.provider === 'mapbox' || v.provider === 'custom')) return { key: '', template: '', credit: '', ...v };
  } catch { /* fall through */ }
  return { provider: 'mapbox', key: '', template: IMAGERY_PRESETS.mapbox.template, credit: IMAGERY_PRESETS.mapbox.credit };
}
export function saveImagery(v: Imagery) { try { localStorage.setItem(IMAGERY_KEY, JSON.stringify(v)); } catch { /* storage off: lasts this session */ } }
/** Tile URL from a {z}/{x}/{y}/{key} template; null until the imagery is set up. */
export function tileUrl(im: Imagery, z: number, x: number, y: number): string | null {
  if (!im.template || (im.template.includes('{key}') && !im.key.trim())) return null;
  return im.template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{key}', encodeURIComponent(im.key.trim()));
}

const worldPx = (lat: number, lon: number, z: number): Pt => {
  const n = TILE * 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};
const metresPerPx = (lat: number, z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** Shrink an uploaded image to at most 1600 px and JPEG it, so it fits in the saved project. */
async function shrink(file: File): Promise<{ src: string; aspect: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('not an image')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL('image/jpeg', 0.75), aspect: c.height / c.width };
  } finally { URL.revokeObjectURL(url); }
}

/** A plan offset in metres as metres east and south on the ground, for a plan whose "up" points `north` degrees clockwise of true north. */
export function planToWorld(p: Pt, north: number): Pt {
  const a = (north * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

export const traceOf = (p: Pick<Project, 'trace'>): TraceSettings => p.trace ?? { mode: 'none', images: {}, sat: { lat: 0, lon: 0, zoom: ZOOM, opacity: 0.8 } };

/** What to draw under the plan for the current tracing mode. */
export function traceUnderlay(h: House, t: TraceSettings, storey: number, imagery: Imagery): ((to: (p: Pt) => Pt, S: number) => ReactNode) | undefined {
  if (t.mode === 'image') {
    const im = t.images[storeyLevel(h, storey)];
    if (!im) return undefined;
    return (to, S) => { const a = to([im.x, im.y]); return <image href={im.src} x={a[0]} y={a[1]} width={im.w * S} opacity={im.opacity} preserveAspectRatio="xMinYMin" />; };
  }
  if (t.mode === 'sat' && t.sat.lat && tileUrl(imagery, 0, 0, 0)) {
    return (to, S) => {
      const { lat, lon, zoom: z } = t.sat, m = metresPerPx(lat, z), P0 = worldPx(lat, lon, z), b = planBounds(h), north = h.north ?? 0;
      // Tiles covering the plan plus 10 m round it, the plan turned to true north; plan (0, 0) sits at the chosen latitude and longitude.
      const ws = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map((p) => planToWorld(p as Pt, north));
      const wx = ws.map((p) => p[0]), wy = ws.map((p) => p[1]);
      const tx0 = Math.floor((P0[0] + (Math.min(...wx) - 10) / m) / TILE), tx1 = Math.floor((P0[0] + (Math.max(...wx) + 10) / m) / TILE);
      const ty0 = Math.floor((P0[1] + (Math.min(...wy) - 10) / m) / TILE), ty1 = Math.floor((P0[1] + (Math.max(...wy) + 10) / m) / TILE);
      const out: ReactNode[] = [];
      for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
        const a = to([(tx * TILE - P0[0]) * m, (ty * TILE - P0[1]) * m]);
        out.push(<image key={`${tx}-${ty}`} href={tileUrl(imagery, z, tx, ty)!} x={a[0]} y={a[1]} width={TILE * m * S + 0.5} height={TILE * m * S + 0.5} opacity={t.sat.opacity} />);
      }
      const o = to([0, 0]);
      return <g pointerEvents="none" transform={north ? `rotate(${-north} ${o[0]} ${o[1]})` : undefined}>{out}</g>;
    };
  }
  return undefined;
}

/** Tracing controls under the plan: a floor-plan image per storey, or satellite imagery. */
export function TraceControls({ house, res, storey: s, trace: t, setTrace: set, onMeasure, measuring, imagery, setImagery }: {
  house: House; res: HouseResult; storey: number; trace: TraceSettings; setTrace: (fn: (t: TraceSettings) => void) => void;
  /** This browser's satellite provider and key (not part of the project). */
  imagery: Imagery; setImagery: (v: Imagery) => void;
  /** Start picking two points on the plan that are `len` metres apart, to scale the image. */
  onMeasure: (len: number) => void; measuring: boolean;
}) {
  // Images are filed by level, so a basement added in one scenario leaves them under the right floor.
  const storey = storeyLevel(house, s);
  const [msg, setMsg] = useState('');
  const [known, setKnown] = useState('');

  const im = t.images[storey];
  // px right, py up on the plan as drawn, which may be turned from true north; dx east, dy north on the ground.
  const nudge = (px: number, py: number) => set((x) => {
    const m = 1 / 111320; // degrees of latitude per metre
    const [dx, s] = planToWorld([px, -py], house.north ?? 0), dy = -s;
    x.sat.lat -= dy * m; x.sat.lon += (dx * m) / Math.cos((x.sat.lat * Math.PI) / 180);
  });

  return (
    <div className="trace">
      <div className="chips" role="group" aria-label="Trace over">
        <Chip on={t.mode === 'none'} onClick={() => set((x) => { x.mode = 'none'; })}>No tracing</Chip>
        <Chip on={t.mode === 'image'} onClick={() => set((x) => { x.mode = 'image'; })}>Floor-plan image</Chip>
        <Chip on={t.mode === 'sat'} onClick={() => set((x) => {
          x.mode = 'sat';
          if (!x.sat.lat) { x.sat.lat = res.climate.lat; x.sat.lon = res.climate.lon; }
        })}>Satellite</Chip>
      </div>
      {t.mode === 'image' && (
        <div className="hf-row">
          <label className="btn-secondary file-btn">{im ? 'Replace image…' : `Upload a plan for the ${house.storeys[s]?.name.toLowerCase()}…`}
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try {
                const { src } = await shrink(f), b = planBounds(house);
                set((x) => { x.images[storey] = { src, x: b.minX, y: b.minY, w: Math.max(5, b.maxX - b.minX), opacity: 0.5 }; });
                setMsg(`Loaded ${f.name}. Set its scale: type a known length and click its two ends on the image.`);
              } catch { setMsg(`${f.name} isn't an image this browser can read. For a PDF, save the page as an image first.`); }
            }} />
          </label>
          {im && <>
            <label className="hf"><span className="eyebrow">Image width</span><span className="hf-in"><NumInput className="thk-input" step={0.1} value={+im.w.toFixed(2)} onChange={(e) => set((x) => { x.images[storey].w = Math.max(0.5, Number(e.target.value) || 1); })} /><span className="small muted">m</span></span></label>
            <label className="hf"><span className="eyebrow">Left edge x</span><span className="hf-in"><NumInput className="thk-input" step={0.05} value={+im.x.toFixed(2)} onChange={(e) => set((x) => { x.images[storey].x = Number(e.target.value) || 0; })} /><span className="small muted">m</span></span></label>
            <label className="hf"><span className="eyebrow">Top edge y</span><span className="hf-in"><NumInput className="thk-input" step={0.05} value={+im.y.toFixed(2)} onChange={(e) => set((x) => { x.images[storey].y = Number(e.target.value) || 0; })} /><span className="small muted">m</span></span></label>
            <label className="hf"><span className="eyebrow">Show</span><input type="range" min={0.1} max={1} step={0.05} value={im.opacity} onChange={(e) => set((x) => { x.images[storey].opacity = Number(e.target.value); })} /></label>
            <label className="hf"><span className="eyebrow">Scale from a known length</span>
              <span className="hf-in"><input type="number" className="thk-input" step={0.01} placeholder="m" value={known} onChange={(e) => setKnown(e.target.value)} />
                <button type="button" className="btn-secondary" disabled={!(Number(known) > 0) || measuring} onClick={() => onMeasure(Number(known))}>{measuring ? 'Click two points on the plan…' : 'Pick two points'}</button></span>
            </label>
            <button type="button" className="btn-link" onClick={() => set((x) => { delete x.images[storey]; })}>Remove image</button>
          </>}
        </div>
      )}
      {t.mode === 'sat' && (
        <div className="hf-row">
          <label className="hf"><span className="eyebrow">Plan corner (0, 0) at latitude</span><NumInput className="thk-input wide" step={0.00001} value={+t.sat.lat.toFixed(6)} onChange={(e) => set((x) => { x.sat.lat = Number(e.target.value) || 0; })} /></label>
          <label className="hf"><span className="eyebrow">longitude</span><NumInput className="thk-input wide" step={0.00001} value={+t.sat.lon.toFixed(6)} onChange={(e) => set((x) => { x.sat.lon = Number(e.target.value) || 0; })} /></label>
          <span className="nudge" role="group" aria-label="Move the imagery under the plan">
            <button type="button" className="icon-btn small" onClick={() => nudge(0, 1)} aria-label="Imagery up 1 m">↑</button>
            <button type="button" className="icon-btn small" onClick={() => nudge(1, 0)} aria-label="Imagery left 1 m">←</button>
            <button type="button" className="icon-btn small" onClick={() => nudge(-1, 0)} aria-label="Imagery right 1 m">→</button>
            <button type="button" className="icon-btn small" onClick={() => nudge(0, -1)} aria-label="Imagery down 1 m">↓</button>
          </span>
          <label className="hf"><span className="eyebrow">Show</span><input type="range" min={0.1} max={1} step={0.05} value={t.sat.opacity} onChange={(e) => set((x) => { x.sat.opacity = Number(e.target.value); })} /></label>
        </div>
      )}
      {t.mode === 'sat' && (
        <div className="hf-row">
          <label className="hf"><span className="eyebrow">Imagery from</span>
            <select className="select" value={imagery.provider} onChange={(e) => {
              const provider = e.target.value as Imagery['provider'], pre = IMAGERY_PRESETS[provider];
              setImagery({ ...imagery, provider, template: pre.template || imagery.template, credit: pre.credit || imagery.credit });
            }}>
              {(Object.keys(IMAGERY_PRESETS) as Imagery['provider'][]).map((k) => <option key={k} value={k}>{IMAGERY_PRESETS[k].label}</option>)}
            </select>
          </label>
          {imagery.provider === 'custom' && <>
            <label className="hf"><span className="eyebrow">Tile URL ({'{z} {x} {y}'}, and {'{key}'} if it needs one)</span><input className="h-text wide-text" value={imagery.template} placeholder="https://…/{z}/{x}/{y}.jpg?key={key}" onChange={(e) => setImagery({ ...imagery, template: e.target.value })} /></label>
            <label className="hf"><span className="eyebrow">Credit to show</span><input className="h-text" value={imagery.credit} onChange={(e) => setImagery({ ...imagery, credit: e.target.value })} /></label>
          </>}
          <label className="hf"><span className="eyebrow">Your key / token</span><input className="h-text" type="password" autoComplete="off" value={imagery.key} onChange={(e) => setImagery({ ...imagery, key: e.target.value })} /></label>
        </div>
      )}
      {t.mode === 'sat' && <p className="small muted">
        {tileUrl(imagery, 0, 0, 0) ? `Imagery ${imagery.credit}. ` : 'Satellite tiles need your own account with an imagery provider, under its terms (paid use included). '}
        The key stays in this browser only; it is never saved in the project or its exports. Starts at the centre of postcode district {house.climate.postcode.toUpperCase()}: paste your house's latitude and longitude (right-click it in any online map), then nudge until the roof lines up.
        {imagery.provider === 'mapbox' && <> <a href={IMAGERY_PRESETS.mapbox.terms} target="_blank" rel="noreferrer">Mapbox terms</a>.</>}
      </p>}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
