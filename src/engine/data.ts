import { EXTRA_MATERIALS, MATERIAL_CATEGORIES as EXTRA_CATEGORIES } from './materials-extra';

export interface Material {
  id: string;
  name: string;
  /** Conductivity, W/mK. Absent for fixed-resistance layers. */
  k?: number;
  /** Fixed thermal resistance, m²K/W (air cavities). */
  R?: number;
  /** Density, kg/m³. */
  rho: number;
  /** Specific heat, J/kgK. */
  cp: number;
  col: string;
  /** Default / min / max / step thickness, mm. */
  t: number;
  min: number;
  max: number;
  step: number;
  /** Loose grouping for the material dropdown (an optgroup label, via MATERIAL_CATEGORIES). */
  cat?: string;
}

const CURATED_MATERIALS: Material[] = [
  { id: 'brick', name: 'Facing brick', k: 0.77, rho: 1800, cp: 840, col: '#b5563c', t: 102, min: 50, max: 440, step: 1, cat: 'common' },
  { id: 'stone', name: 'Limestone', k: 1.7, rho: 2200, cp: 900, col: '#cdbf9c', t: 150, min: 50, max: 500, step: 10, cat: 'common' },
  { id: 'earth', name: 'Rammed earth', k: 1.1, rho: 1900, cp: 1000, col: '#9c7a58', t: 300, min: 100, max: 600, step: 10, cat: 'common' },
  { id: 'conc', name: 'Dense concrete', k: 2.3, rho: 2300, cp: 1000, col: '#7d858b', t: 150, min: 50, max: 400, step: 10, cat: 'common' },
  { id: 'dblock', name: 'Dense concrete block', k: 1.13, rho: 2000, cp: 1000, col: '#9aa1a6', t: 100, min: 75, max: 215, step: 1, cat: 'common' },
  { id: 'aac', name: 'Aerated block', k: 0.15, rho: 500, cp: 1000, col: '#bfc7c0', t: 100, min: 75, max: 300, step: 5, cat: 'common' },
  { id: 'render', name: 'Cement render', k: 1.0, rho: 1800, cp: 1000, col: '#d8d2c6', t: 15, min: 8, max: 40, step: 1, cat: 'common' },
  { id: 'lime', name: 'Lime / gypsum plaster', k: 0.8, rho: 1600, cp: 1000, col: '#e6ddd0', t: 13, min: 8, max: 40, step: 1, cat: 'common' },
  { id: 'pb', name: 'Plasterboard', k: 0.21, rho: 700, cp: 1000, col: '#e9e9e4', t: 12.5, min: 9, max: 30, step: 0.5, cat: 'common' },
  { id: 'ply', name: 'OSB / plywood', k: 0.13, rho: 650, cp: 1700, col: '#c79a5b', t: 11, min: 6, max: 25, step: 1, cat: 'common' },
  { id: 'timber', name: 'Softwood timber', k: 0.13, rho: 520, cp: 1600, col: '#a67c4e', t: 20, min: 10, max: 150, step: 5, cat: 'common' },
  { id: 'cavity', name: 'Air cavity', R: 0.18, rho: 1.2, cp: 1000, col: '#dcecf3', t: 50, min: 25, max: 150, step: 5, cat: 'common' },
  { id: 'pir', name: 'PIR / PUR board', k: 0.022, rho: 30, cp: 1400, col: '#f0cf3f', t: 100, min: 20, max: 250, step: 5, cat: 'common' },
  { id: 'eps', name: 'EPS (expanded polystyrene)', k: 0.036, rho: 20, cp: 1450, col: '#e6e9ee', t: 100, min: 20, max: 250, step: 5, cat: 'common' },
  { id: 'mw', name: 'Mineral wool', k: 0.037, rho: 30, cp: 1030, col: '#caa86a', t: 100, min: 25, max: 300, step: 5, cat: 'common' },
  { id: 'wf', name: 'Wood fibre board', k: 0.042, rho: 160, cp: 2100, col: '#c9a77d', t: 80, min: 20, max: 200, step: 5, cat: 'common' },
  { id: 'cel', name: 'Cellulose', k: 0.039, rho: 50, cp: 1600, col: '#a7a79a', t: 150, min: 50, max: 300, step: 10, cat: 'common' },
  { id: 'hemp', name: 'Hempcrete', k: 0.09, rho: 330, cp: 1550, col: '#9db08a', t: 300, min: 100, max: 450, step: 10, cat: 'common' },
];

export const MATERIALS: Material[] = [...CURATED_MATERIALS, ...EXTRA_MATERIALS];

export const MAT: Record<string, Material> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

/** Category id -> dropdown group label, in display order (the common/curated set first). */
export const MATERIAL_CATEGORIES: Record<string, string> = { common: 'Common build-up materials', ...EXTRA_CATEGORIES };

export interface MaterialGroup {
  cat: string;
  label: string;
  items: Material[];
}

/** MATERIALS grouped by `cat`, in MATERIAL_CATEGORIES order, for <optgroup>-based dropdowns. */
export const MATERIAL_GROUPS: MaterialGroup[] = Object.keys(MATERIAL_CATEGORIES)
  .map((cat) => ({ cat, label: MATERIAL_CATEGORIES[cat], items: MATERIALS.filter((m) => (m.cat ?? 'common') === cat) }))
  .filter((g) => g.items.length > 0);

export interface Preset {
  id: string;
  name: string;
  orient?: string;
  layers: Array<[string, number]>;
}

export const PRESETS: Preset[] = [
  { id: 'cavity_new', name: 'Insulated cavity wall (modern)', layers: [['brick', 102], ['cavity', 25], ['pir', 100], ['aac', 100], ['pb', 12.5]] },
  { id: 'cavity_old', name: 'Uninsulated cavity wall (1960s)', layers: [['brick', 102], ['cavity', 50], ['dblock', 100], ['lime', 13]] },
  { id: 'solid', name: 'Solid brick wall (Victorian)', layers: [['brick', 225], ['lime', 15]] },
  { id: 'retro', name: 'Solid brick + internal wood fibre', layers: [['brick', 225], ['wf', 80], ['lime', 15]] },
  { id: 'tf', name: 'Timber frame, mineral wool', layers: [['timber', 20], ['cavity', 25], ['ply', 11], ['mw', 140], ['pb', 12.5]] },
  { id: 'hemp', name: 'Hempcrete with lime finish', layers: [['render', 15], ['hemp', 300], ['lime', 15]] },
  { id: 'roofc', name: 'Warm flat roof on concrete deck', orient: 'roof', layers: [['pir', 120], ['conc', 150], ['lime', 13]] },
  { id: 'roofl', name: 'Lightweight timber roof', orient: 'roof', layers: [['ply', 18], ['mw', 200], ['pb', 12.5]] },
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Typical UK monthly mean air temperature, °C. */
export const MEAN = [4.5, 4.7, 6.5, 8.8, 11.8, 14.7, 17.0, 16.7, 14.0, 10.8, 7.2, 5.0];
/** Typical UK monthly mean daily temperature range, K. */
export const SWING = [5, 6, 8, 9, 10, 10, 10, 10, 9, 7, 5, 4.5];
/** Mid-month day of year. */
export const DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

export interface Location { id: string; name: string; lat: number; dT: number }
export const LOCATIONS: Location[] = [
  { id: 'lon', name: 'London', lat: 51.5, dT: 1.2 },
  { id: 'bir', name: 'Birmingham', lat: 52.5, dT: 0 },
  { id: 'car', name: 'Cardiff', lat: 51.5, dT: 0.4 },
  { id: 'man', name: 'Manchester', lat: 53.5, dT: -0.4 },
  { id: 'bel', name: 'Belfast', lat: 54.6, dT: -0.6 },
  { id: 'edi', name: 'Edinburgh', lat: 55.95, dT: -1.4 },
  { id: 'abe', name: 'Aberdeen', lat: 57.1, dT: -2.0 },
];

export interface Weather {
  id: string;
  name: string;
  /** Sky clearness 0..1. */
  c: number;
  /** Offset to monthly mean temperature, K. */
  dM: number;
  /** Multiplier on daily temperature range. */
  sk: number;
}
export const WEATHER: Weather[] = [
  { id: 'overcast', name: 'Overcast', c: 0.15, dM: -0.5, sk: 0.6 },
  { id: 'typical', name: 'Typical', c: 0.5, dM: 0, sk: 1 },
  { id: 'sunny', name: 'Clear & sunny', c: 0.9, dM: 1, sk: 1.35 },
  { id: 'heat', name: 'Heatwave', c: 0.95, dM: 7, sk: 1.5 },
  { id: 'cold', name: 'Cold, clear snap', c: 0.8, dM: -6, sk: 1.3 },
];

export interface Orient { id: string; name: string; label: string; az: number; tilt: number }
export const ORIENTS: Orient[] = [
  { id: 'N', name: 'North wall', label: 'N wall', az: 0, tilt: 90 },
  { id: 'E', name: 'East wall', label: 'E wall', az: 90, tilt: 90 },
  { id: 'S', name: 'South wall', label: 'S wall', az: 180, tilt: 90 },
  { id: 'W', name: 'West wall', label: 'W wall', az: 270, tilt: 90 },
  { id: 'roof', name: 'Flat roof', label: 'Flat roof', az: 0, tilt: 0 },
];

export const COLOURS = [
  { id: 'light', label: 'Light (0.3)', a: 0.3 },
  { id: 'mid', label: 'Mid (0.55)', a: 0.55 },
  { id: 'dark', label: 'Dark (0.85)', a: 0.85 },
];

export const GLAZING = [
  { id: 'shaded', label: 'Shaded (g 0.25)', g: 0.25 },
  { id: 'std', label: 'Standard (g 0.5)', g: 0.5 },
  { id: 'open', label: 'Unshaded (g 0.7)', g: 0.7 },
];

/** Room contents thermal mass per m² floor, kJ/m²K. */
export const MASSES = [
  { id: 'light', label: 'Light (50 kJ/m²K)', c: 50 },
  { id: 'med', label: 'Medium (120)', c: 120 },
  { id: 'heavy', label: 'Heavy (250)', c: 250 },
];
