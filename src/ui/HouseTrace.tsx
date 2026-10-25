import { useState } from 'react';
import type { ReactNode } from 'react';
import type { House, HouseResult, TraceSettings } from '../engine/house';
import type { Pt } from '../engine/geom';
import { Chip } from './controls';
import { planBounds } from './HousePlan';


const TILE = 256, ZOOM = 19;
// Esri World Imagery: free to view with attribution (see the Esri terms of use for commercial applications).
const tileUrl = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
export const SAT_CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community';

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

export const traceOf = (h: House): TraceSettings => h.trace ?? { mode: 'none', images: {}, sat: { lat: 0, lon: 0, zoom: ZOOM, opacity: 0.8 } };

/** What to draw under the plan for the current tracing mode. */
export function traceUnderlay(h: House, storey: number): ((to: (p: Pt) => Pt, S: number) => ReactNode) | undefined {
  const t = traceOf(h);
  if (t.mode === 'image') {
    const im = t.images[storey];
    if (!im) return undefined;
    return (to, S) => { const a = to([im.x, im.y]); return <image href={im.src} x={a[0]} y={a[1]} width={im.w * S} opacity={im.opacity} preserveAspectRatio="xMinYMin" />; };
  }
  if (t.mode === 'sat' && t.sat.lat) {
    return (to, S) => {
      const { lat, lon, zoom: z } = t.sat, m = metresPerPx(lat, z), P0 = worldPx(lat, lon, z), b = planBounds(h);
      // Tiles covering the plan plus 10 m round it; plan (0, 0) sits at the chosen latitude and longitude.
      const tx0 = Math.floor((P0[0] + (b.minX - 10) / m) / TILE), tx1 = Math.floor((P0[0] + (b.maxX + 10) / m) / TILE);
      const ty0 = Math.floor((P0[1] + (b.minY - 10) / m) / TILE), ty1 = Math.floor((P0[1] + (b.maxY + 10) / m) / TILE);
      const out: ReactNode[] = [];
      for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
        const a = to([(tx * TILE - P0[0]) * m, (ty * TILE - P0[1]) * m]);
        out.push(<image key={`${tx}-${ty}`} href={tileUrl(z, tx, ty)} x={a[0]} y={a[1]} width={TILE * m * S + 0.5} height={TILE * m * S + 0.5} opacity={t.sat.opacity} />);
      }
      return <g pointerEvents="none">{out}</g>;
    };
  }
  return undefined;
}

/** Tracing controls under the plan: a floor-plan image per storey, or satellite imagery. */
export function TraceControls({ house, res, storey, upd, onMeasure, measuring }: {
  house: House; res: HouseResult; storey: number; upd: (fn: (h: House) => void) => void;
  /** Start picking two points on the plan that are `len` metres apart, to scale the image. */
  onMeasure: (len: number) => void; measuring: boolean;
}) {
  const t = traceOf(house);
  const set = (fn: (t: TraceSettings) => void) => upd((h) => { const x = structuredClone(traceOf(h)); fn(x); h.trace = x; });
  const [msg, setMsg] = useState('');
  const [known, setKnown] = useState('');
  const im = t.images[storey];
  const nudge = (dx: number, dy: number) => set((x) => {
    const m = 1 / 111320; // degrees of latitude per metre
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
          <label className="btn-secondary file-btn">{im ? 'Replace image…' : `Upload a plan for the ${house.storeys[storey]?.name.toLowerCase()}…`}
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
            <label className="hf"><span className="eyebrow">Image width</span><span className="hf-in"><input type="number" className="thk-input" step={0.1} value={+im.w.toFixed(2)} onChange={(e) => set((x) => { x.images[storey].w = Math.max(0.5, Number(e.target.value) || 1); })} /><span className="small muted">m</span></span></label>
            <label className="hf"><span className="eyebrow">Left edge x</span><span className="hf-in"><input type="number" className="thk-input" step={0.05} value={+im.x.toFixed(2)} onChange={(e) => set((x) => { x.images[storey].x = Number(e.target.value) || 0; })} /><span className="small muted">m</span></span></label>
            <label className="hf"><span className="eyebrow">Top edge y</span><span className="hf-in"><input type="number" className="thk-input" step={0.05} value={+im.y.toFixed(2)} onChange={(e) => set((x) => { x.images[storey].y = Number(e.target.value) || 0; })} /><span className="small muted">m</span></span></label>
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
          <label className="hf"><span className="eyebrow">Plan corner (0, 0) at latitude</span><input type="number" className="thk-input wide" step={0.00001} value={+t.sat.lat.toFixed(6)} onChange={(e) => set((x) => { x.sat.lat = Number(e.target.value) || 0; })} /></label>
          <label className="hf"><span className="eyebrow">longitude</span><input type="number" className="thk-input wide" step={0.00001} value={+t.sat.lon.toFixed(6)} onChange={(e) => set((x) => { x.sat.lon = Number(e.target.value) || 0; })} /></label>
          <span className="nudge" role="group" aria-label="Move the imagery under the plan">
            <button type="button" className="icon-btn small" onClick={() => nudge(0, 1)} aria-label="Imagery north 1 m">↑</button>
            <button type="button" className="icon-btn small" onClick={() => nudge(1, 0)} aria-label="Imagery west 1 m">←</button>
            <button type="button" className="icon-btn small" onClick={() => nudge(-1, 0)} aria-label="Imagery east 1 m">→</button>
            <button type="button" className="icon-btn small" onClick={() => nudge(0, -1)} aria-label="Imagery south 1 m">↓</button>
          </span>
          <label className="hf"><span className="eyebrow">Show</span><input type="range" min={0.1} max={1} step={0.05} value={t.sat.opacity} onChange={(e) => set((x) => { x.sat.opacity = Number(e.target.value); })} /></label>
        </div>
      )}
      {t.mode === 'sat' && <p className="small muted">Starts at the centre of postcode district {house.climate.postcode.toUpperCase()}: paste your house's latitude and longitude (right-click it in any online map), then nudge until the roof lines up with the plan. Tiles load from Esri; that tells Esri which area you are looking at. {SAT_CREDIT}.</p>}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
