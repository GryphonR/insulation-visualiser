// Hand-edited "typical" materials that build-up presets, house templates and the defaults lean on.
// Only what the other tables lack: generic masonry/boards/insulation with sensible default
// thicknesses, and the fixed-R air layers (adjustable thickness, unlike the k-based "N cm air layer"
// rows in materials-extra.ts). Anything with a direct equivalent in the other tables lives there
// instead; see ID_ALIASES in data.ts for ids retired from this file.
import type { Material } from './data';

export const COMMON_MATERIALS: Material[] = [
  { id: 'brick', name: 'Facing brick', k: 0.77, rho: 1800, cp: 840, col: '#b5563c', t: 102, min: 50, max: 440, step: 1, cat: 'common' },
  { id: 'earth', name: 'Rammed earth', k: 1.1, rho: 1900, cp: 1000, col: '#9c7a58', t: 300, min: 100, max: 600, step: 10, cat: 'common' },
  { id: 'dblock', name: 'Dense concrete block', k: 1.13, rho: 2000, cp: 1000, col: '#9aa1a6', t: 100, min: 75, max: 215, step: 1, cat: 'common' },
  { id: 'pb', name: 'Plasterboard', k: 0.21, rho: 700, cp: 1000, col: '#e9e9e4', t: 12.5, min: 9, max: 30, step: 0.5, cat: 'common' },
  { id: 'ply', name: 'OSB / plywood', k: 0.13, rho: 650, cp: 1700, col: '#c79a5b', t: 11, min: 6, max: 25, step: 1, cat: 'common' },
  { id: 'cavity', name: 'Air cavity', R: 0.18, rho: 1.2, cp: 1000, col: '#dcecf3', t: 50, min: 25, max: 150, step: 5, cat: 'common' },
  { id: 'vgap', name: 'Ventilated gap (tile batten void)', R: 0.16, rho: 1.2, cp: 1000, col: '#c9e6f2', t: 40, min: 25, max: 100, step: 5, cat: 'common', vent: true },
  // Low-emissivity variants: R = 1 / (h_conv + 5.15 x E), E = 1 / (1/e1 + 1/e2 - 1), foil e = 0.05, other face 0.9.
  // h_conv = 1.25 (horizontal flow, any depth over ~20 mm) or 1.95 (upward, the ventilated roof gap).
  { id: 'cavity_le1', name: 'Air cavity, one low-e (foil) face', R: 0.66, rho: 1.2, cp: 1000, col: '#e3eef2', t: 50, min: 25, max: 150, step: 5, cat: 'common' },
  { id: 'cavity_le2', name: 'Air cavity, both faces low-e (foil)', R: 0.72, rho: 1.2, cp: 1000, col: '#eef3f5', t: 50, min: 25, max: 150, step: 5, cat: 'common' },
  { id: 'vgap_le1', name: 'Ventilated gap, one low-e (foil) face', R: 0.45, rho: 1.2, cp: 1000, col: '#d6ebf5', t: 40, min: 25, max: 100, step: 5, cat: 'common', vent: true },
  { id: 'pir', name: 'PIR / PUR board', k: 0.022, rho: 30, cp: 1400, col: '#f0cf3f', t: 100, min: 20, max: 250, step: 5, cat: 'common' },
  { id: 'eps', name: 'EPS (expanded polystyrene)', k: 0.036, rho: 20, cp: 1450, col: '#e6e9ee', t: 100, min: 20, max: 250, step: 5, cat: 'common' },
  { id: 'mw', name: 'Mineral wool', k: 0.037, rho: 30, cp: 1030, col: '#caa86a', t: 100, min: 25, max: 300, step: 5, cat: 'common' },
  { id: 'wf', name: 'Wood fibre board', k: 0.042, rho: 160, cp: 2100, col: '#c9a77d', t: 80, min: 20, max: 200, step: 5, cat: 'common' },
  // Multifoils: declared core R only (no air spaces; add air layers separately). Thickness is fixed because R is not
  // proportional to it. rho/cp are estimates for a wadding-and-foil laminate, not manufacturer figures.
  { id: 'tlx', name: 'TLX Gold multifoil (33 mm)', R: 0.85, rho: 20, cp: 1400, col: '#d4b24a', t: 33, min: 33, max: 33, step: 1, cat: 'common' },
  { id: 'boostr', name: "Actis Boost'R Hybrid multifoil (35 mm)", R: 1.35, rho: 20, cp: 1400, col: '#c9c27a', t: 35, min: 35, max: 35, step: 1, cat: 'common' },
  { id: 'hemp', name: 'Hempcrete', k: 0.09, rho: 330, cp: 1550, col: '#9db08a', t: 300, min: 100, max: 450, step: 10, cat: 'common' },
];
