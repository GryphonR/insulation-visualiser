import { COMMON_MATERIALS } from './materials-common';
import { EXTRA_MATERIALS, MATERIAL_CATEGORIES as EXTRA_CATEGORIES } from './materials-extra';
import { HERITAGE_MATERIALS, HERITAGE_CATEGORIES } from './materials-heritage';
import { withMu } from './materials-mu';

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
  /** Air layer ventilated to outside (e.g. tile batten gap): exchanges heat with outdoor air. */
  vent?: boolean;
  /** Vapour resistance factor (air = 1): dry-cup and wet-cup. Absent when no confident figure (see materials-mu.ts). */
  mu?: number;
  muWet?: number;
  /** Critical moisture content (fraction of dry mass) for hygroscopic organic materials that soak up condensate; absent = non-absorbent. */
  hygro?: number;
  /** Capillary data (see materials-mu.ts): water absorption coefficient, kg/(m² s^0.5); free water saturation and moisture content at 80% RH, kg/m³. Absent = no data. */
  A?: number;
  wf?: number;
  w80?: number;
}

export const MATERIALS: Material[] = [...COMMON_MATERIALS, ...EXTRA_MATERIALS, ...HERITAGE_MATERIALS].map(withMu);

/** Curated ids retired in favour of the equivalent generated/heritage material; saved projects may still carry them. */
export const ID_ALIASES: Record<string, string> = {
  conc: 'm_concrete_reinforced', render: 'm_cement_sand', lime: 'm_lime_sand', stone: 'm_limestone_hard',
  aac: 'm_aerated_concrete_500_kg_m', timber: 'm_timber_500_kg_m', cel: 'h_cellulose_loft',
};
export const canonId = (id: string): string => ID_ALIASES[id] ?? id;

export const MAT: Record<string, Material> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));
// Lookups by a retired id still resolve, so old saves, favourites and library entries keep simulating.
for (const [old, id] of Object.entries(ID_ALIASES)) MAT[old] = MAT[id];

/** Category id -> dropdown group label, in display order (the common/curated set first). */
export const MATERIAL_CATEGORIES: Record<string, string> = { common: 'Common build-up materials', ...HERITAGE_CATEGORIES, ...EXTRA_CATEGORIES };

export interface MaterialGroup {
  cat: string;
  label: string;
  items: Material[];
}

/** MATERIALS grouped by `cat`, in MATERIAL_CATEGORIES order,. */
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
  { id: 'cavity_new', name: 'Insulated cavity wall (modern)', layers: [['brick', 102], ['cavity', 25], ['pir', 100], ['m_aerated_concrete_500_kg_m', 100], ['pb', 12.5]] },
  { id: 'cavity_old', name: 'Uninsulated cavity wall (1960s)', layers: [['brick', 102], ['cavity', 50], ['dblock', 100], ['m_lime_sand', 13]] },
  { id: 'solid', name: 'Solid brick wall (Victorian)', layers: [['brick', 225], ['m_lime_sand', 15]] },
  { id: 'retro', name: 'Solid brick + internal wood fibre', layers: [['brick', 225], ['wf', 80], ['m_lime_sand', 15]] },
  { id: 'tf', name: 'Timber frame, mineral wool', layers: [['m_timber_500_kg_m', 20], ['cavity', 25], ['ply', 11], ['mw', 140], ['pb', 12.5]] },
  { id: 'hemp', name: 'Hempcrete with lime finish', layers: [['m_cement_sand', 15], ['hemp', 300], ['m_lime_sand', 15]] },
  { id: 'roofc', name: 'Warm flat roof on concrete deck', orient: 'roof', layers: [['pir', 120], ['m_concrete_reinforced', 150], ['m_lime_sand', 13]] },
  { id: 'roofl', name: 'Lightweight timber roof', orient: 'roof', layers: [['ply', 18], ['mw', 200], ['pb', 12.5]] },
  // Cold-roof ceilings: the outside face is the ventilated loft, treated as outdoor air.
  { id: 'cold270', name: 'Cold roof ceiling, 270 mm loft insulation', orient: 'roof', layers: [['mw', 270], ['pb', 12.5]] },
  { id: 'cold100', name: 'Cold roof ceiling, 100 mm loft insulation (older)', orient: 'roof', layers: [['mw', 100], ['pb', 12.5]] },
  { id: 'cold0', name: 'Cold roof ceiling, uninsulated', orient: 'roof', layers: [['pb', 12.5]] },
  // Pitched warm roofs: concrete tile, ventilated batten gap, then insulation.
  { id: 'warmabove', name: 'Pitched warm roof, PIR over rafters', orient: 'roof', layers: [['m_roof_tile_concrete', 15], ['vgap', 40], ['pir', 120], ['ply', 18], ['pb', 12.5]] },
  { id: 'warmbetween', name: 'Pitched warm roof, between + under rafters', orient: 'roof', layers: [['m_roof_tile_concrete', 15], ['vgap', 40], ['mw', 150], ['pir', 40], ['pb', 12.5]] },
  { id: 'warmfoil', name: 'Pitched warm roof, multifoil + between rafters', orient: 'roof', layers: [['m_roof_tile_concrete', 15], ['vgap', 40], ['tlx', 33], ['mw', 100], ['pb', 12.5]] },
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Days in each month, January first (a non-leap year). */
export const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
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
  // The roof's pitch and the way its slope faces come from the scenario (flat when the pitch is 0).
  { id: 'roof', name: 'Roof', label: 'Roof', az: 180, tilt: 0 },
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

const CUSTOM_MATERIALS_KEY = 'insulation-visualiser.materials.v1';

const regroup = () => {
  MATERIAL_GROUPS.splice(0, MATERIAL_GROUPS.length, ...Object.keys(MATERIAL_CATEGORIES)
    .map((cat) => ({ cat, label: MATERIAL_CATEGORIES[cat], items: MATERIALS.filter((m) => (m.cat ?? 'common') === cat) }))
    .filter((g) => g.items.length > 0));
};

const validCustom = (m: Material) =>
  !!m && typeof m.id === 'string' && typeof m.name === 'string' && Number.isFinite(m.rho) && Number.isFinite(m.cp) && ((m.k ?? 0) > 0 || (m.R ?? 0) > 0) && Number.isFinite(m.t);

/** The materials the user added, always in the 'custom' group. */
export const customMaterials = (): Material[] => MATERIALS.filter((m) => m.cat === 'custom');

/** Add or replace a custom material and keep it for next time. */
export function saveCustomMaterial(m: Material): void {
  const i = MATERIALS.findIndex((x) => x.id === m.id);
  const mat = { ...m, cat: 'custom' };
  if (i >= 0) MATERIALS[i] = mat; else MATERIALS.push(mat);
  MAT[mat.id] = mat;
  MATERIAL_CATEGORIES.custom = 'Custom materials';
  regroup();
  persistCustom();
}

/** Remove a custom material. Callers check that no build-up still uses it. */
export function deleteCustomMaterial(id: string): void {
  const i = MATERIALS.findIndex((x) => x.id === id && x.cat === 'custom');
  if (i < 0) return;
  MATERIALS.splice(i, 1);
  delete MAT[id];
  regroup();
  persistCustom();
}

function persistCustom() {
  try {
    localStorage.setItem(CUSTOM_MATERIALS_KEY, JSON.stringify(customMaterials()));
  } catch {
    // Private browsing or full storage: the materials just won't persist.
  }
}

// Read at start-up, before any saved build-up is checked against the library.
try {
  const stored = JSON.parse(localStorage.getItem(CUSTOM_MATERIALS_KEY) ?? '[]');
  if (Array.isArray(stored)) for (const m of stored) if (validCustom(m) && !MAT[m.id]) { const x = { ...m, cat: 'custom' }; MATERIALS.push(x); MAT[x.id] = x; }
  if (customMaterials().length) { MATERIAL_CATEGORIES.custom = 'Custom materials'; regroup(); }
} catch {
  // Unreadable storage: start without custom materials.
}
