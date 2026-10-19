export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

export const hex2rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const lum = (h: string): number => {
  const c = hex2rgb(h).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** Readable text colour for a given background. */
export const fgFor = (h: string): string => (lum(h) > 0.3 ? '#14212b' : '#ffffff');

/** Signed number with a true minus sign. */
export const sgn = (v: number, d: number): string => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface NiceRange {
  lo: number;
  hi: number;
  ticks: number[];
  step: number;
}

export function niceRange(min: number, max: number, n: number): NiceRange {
  if (max - min < 1e-6) max = min + 1;
  const raw = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(8));
  return { lo, hi, ticks, step };
}

export const fmtTick = (v: number, step: number): string =>
  step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.1 ? 1 : 2);

const CM: Array<[number, [number, number, number]]> = (
  [
    [0, '#23418f'],
    [0.25, '#4f8fc9'],
    [0.5, '#eeeae0'],
    [0.75, '#f0a35a'],
    [1, '#b9301f'],
  ] as Array<[number, string]>
).map(([p, h]) => [p, hex2rgb(h)]);

/** Temperature colour map, u in 0..1 (cold blue to hot red). */
export function cmap(u: number): string {
  u = clamp(u, 0, 1);
  for (let i = 1; i < CM.length; i++) {
    if (u <= CM[i][0]) {
      const [p0, c0] = CM[i - 1];
      const [p1, c1] = CM[i];
      const f = (u - p0) / (p1 - p0);
      return 'rgb(' + [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * f)).join(',') + ')';
    }
  }
  return 'rgb(185,48,31)';
}
