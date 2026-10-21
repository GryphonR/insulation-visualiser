// Hand-curated materials for old buildings: building stones, historic walling, breathable
// (vapour-open) insulation, and lime / insulating plasters. Unlike materials-extra.ts this file
// is NOT generated, so edit it directly.
//
// Values are typical UK design figures (dry to normal-moist conditions) gathered from
// EN ISO 10456 / EN 12524 tables, BRE and CIBSE data, Historic England guidance, published
// measurements of Scottish and Irish historic masonry, and manufacturer datasheets for the
// branded products (Diathonite Evolution, Fixit 222, Thermafleece, Steico, Multipor, Spaceloft).
// Treat them as indicative: natural stone, earth and handmade brick vary widely between
// quarries and batches, and conductivity rises sharply with moisture content (damp walls can
// conduct 2-3x the dry value). Vapour permeability (mu) is not modelled, so "breathable" here is
// a grouping, not a calculated property.
// Entries marked "est." are judgement calls with thinner published support.
import type { Material } from './data';

export const HERITAGE_MATERIALS: Material[] = [
  // Building stones, by type (thick walls: wide thickness range)
  { id: "h_portland_limestone", name: "Portland limestone", k: 1.5, rho: 2200, cp: 900, col: "#d8d0bb", t: 300, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_bath_stone", name: "Bath stone (oolitic limestone, soft)", k: 1.1, rho: 2000, cp: 900, col: "#dccf9f", t: 300, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_cotswold_limestone", name: "Cotswold limestone (oolite)", k: 1.4, rho: 2200, cp: 900, col: "#d6c28a", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_magnesian_limestone", name: "Magnesian limestone (e.g. Anston)", k: 1.6, rho: 2250, cp: 900, col: "#d3c9a4", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_purbeck_limestone", name: "Purbeck limestone (hard, shelly)", k: 1.9, rho: 2500, cp: 900, col: "#b8b09c", t: 300, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_mountain_limestone", name: "Carboniferous / mountain limestone", k: 2.3, rho: 2650, cp: 900, col: "#a9a79d", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_chalk_clunch", name: "Chalk / clunch blocks (est.)", k: 0.9, rho: 1700, cp: 1000, col: "#e8e4d6", t: 400, min: 100, max: 900, step: 10, cat: "stone-types" },
  { id: "h_gritstone", name: "Millstone grit / gritstone", k: 2.3, rho: 2300, cp: 800, col: "#8f8a80", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_yorkshire_sandstone", name: "Yorkshire sandstone (buff)", k: 2.0, rho: 2200, cp: 800, col: "#c4ae82", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_red_sandstone", name: "Red sandstone (Permian / Triassic)", k: 1.8, rho: 2100, cp: 800, col: "#b4644a", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_blond_sandstone", name: "Scottish blond sandstone (e.g. Craigleith)", k: 2.4, rho: 2250, cp: 800, col: "#d2bf94", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_granite", name: "Granite", k: 2.8, rho: 2650, cp: 790, col: "#8d8c8f", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_whinstone", name: "Whinstone / dolerite / basalt", k: 2.2, rho: 2900, cp: 840, col: "#5f6166", t: 400, min: 50, max: 900, step: 10, cat: "stone-types" },
  { id: "h_slate", name: "Slate", k: 2.2, rho: 2750, cp: 900, col: "#5b6472", t: 20, min: 6, max: 400, step: 2, cat: "stone-types" },
  { id: "h_flint", name: "Flint (est.)", k: 2.6, rho: 2600, cp: 800, col: "#6f6e72", t: 300, min: 100, max: 700, step: 10, cat: "stone-types" },
  { id: "h_rubble_wall", name: "Random rubble wall, stone + lime mortar (est.)", k: 1.4, rho: 2000, cp: 900, col: "#b3a58a", t: 500, min: 200, max: 1000, step: 10, cat: "stone-types" },

  // Historic walling, mortars and roofing
  { id: "h_cob", name: "Cob (West Country, normal moisture)", k: 0.6, rho: 1600, cp: 1000, col: "#a7835e", t: 500, min: 300, max: 900, step: 10, cat: "historic" },
  { id: "h_clay_lump", name: "Clay lump / adobe (est.)", k: 0.55, rho: 1550, cp: 1000, col: "#a98a64", t: 300, min: 150, max: 600, step: 10, cat: "historic" },
  { id: "h_wattle_daub", name: "Wattle and daub infill (est.)", k: 0.7, rho: 1500, cp: 1000, col: "#b49a73", t: 100, min: 50, max: 200, step: 5, cat: "historic" },
  { id: "h_straw_clay", name: "Light straw-clay infill (est.)", k: 0.12, rho: 350, cp: 1400, col: "#c3a56d", t: 150, min: 50, max: 300, step: 10, cat: "historic" },
  { id: "h_straw_bale", name: "Straw bale (across fibres)", k: 0.06, rho: 100, cp: 1800, col: "#d6b95e", t: 450, min: 300, max: 600, step: 10, cat: "historic" },
  { id: "h_soft_brick", name: "Handmade soft red brick (Georgian / Victorian)", k: 0.6, rho: 1650, cp: 840, col: "#b8603f", t: 215, min: 102, max: 450, step: 1, cat: "historic" },
  { id: "h_stock_brick", name: "London stock brick", k: 0.7, rho: 1750, cp: 840, col: "#c2a263", t: 215, min: 102, max: 450, step: 1, cat: "historic" },
  { id: "h_engineering_brick", name: "Engineering brick (blue / Staffordshire)", k: 1.2, rho: 2300, cp: 840, col: "#4f5a6e", t: 215, min: 102, max: 450, step: 1, cat: "historic" },
  { id: "h_lime_putty_mortar", name: "Lime putty mortar (bedding / pointing)", k: 0.7, rho: 1600, cp: 1000, col: "#d8d1c0", t: 10, min: 5, max: 20, step: 1, cat: "historic" },
  { id: "h_nhl_mortar", name: "NHL 3.5 lime mortar (bedding)", k: 0.85, rho: 1800, cp: 1000, col: "#cfc9b9", t: 10, min: 5, max: 20, step: 1, cat: "historic" },
  { id: "h_limecrete", name: "Limecrete floor slab (lime + aggregate)", k: 0.9, rho: 1800, cp: 1000, col: "#c8c2b2", t: 150, min: 75, max: 300, step: 5, cat: "historic" },
  { id: "h_water_reed", name: "Water reed thatch", k: 0.09, rho: 190, cp: 1300, col: "#c8b46c", t: 300, min: 200, max: 400, step: 10, cat: "historic" },
  { id: "h_long_straw", name: "Long straw thatch (est.)", k: 0.09, rho: 150, cp: 1300, col: "#d2bd74", t: 300, min: 200, max: 400, step: 10, cat: "historic" },

  // Breathable (vapour-open) insulation
  { id: "h_wf_flex", name: "Wood fibre batt, flexible (Steico Flex type)", k: 0.038, rho: 55, cp: 2100, col: "#cfb48a", t: 100, min: 40, max: 240, step: 5, cat: "breathable" },
  { id: "h_wf_dense", name: "Wood fibre board, dense roof / sarking (~240 kg/m³)", k: 0.047, rho: 240, cp: 2100, col: "#b99a6c", t: 50, min: 20, max: 120, step: 5, cat: "breathable" },
  { id: "h_wf_blown", name: "Wood fibre, blown / loose-fill", k: 0.04, rho: 45, cp: 2100, col: "#d3bd96", t: 150, min: 50, max: 400, step: 10, cat: "breathable" },
  { id: "h_sheep_wool", name: "Sheep's wool batt (Thermafleece type)", k: 0.039, rho: 25, cp: 1720, col: "#e7e1d1", t: 100, min: 50, max: 250, step: 5, cat: "breathable" },
  { id: "h_hemp_batt", name: "Hemp fibre batt", k: 0.04, rho: 40, cp: 1700, col: "#a9b78a", t: 100, min: 40, max: 240, step: 5, cat: "breathable" },
  { id: "h_flax_batt", name: "Flax batt", k: 0.038, rho: 30, cp: 1550, col: "#b8c0a0", t: 100, min: 40, max: 240, step: 5, cat: "breathable" },
  { id: "h_cotton_batt", name: "Recycled cotton / denim batt", k: 0.039, rho: 25, cp: 1600, col: "#93aac4", t: 100, min: 40, max: 200, step: 5, cat: "breathable" },
  { id: "h_cellulose_loft", name: "Cellulose, loose-fill (loft)", k: 0.04, rho: 30, cp: 1600, col: "#a2a294", t: 250, min: 100, max: 400, step: 10, cat: "breathable" },
  { id: "h_cork_icb", name: "Expanded cork board (ICB)", k: 0.04, rho: 115, cp: 1800, col: "#c79a64", t: 60, min: 20, max: 200, step: 5, cat: "breathable" },
  { id: "h_cork_granules", name: "Cork granules, loose-fill", k: 0.045, rho: 70, cp: 1800, col: "#cfa26a", t: 100, min: 50, max: 300, step: 10, cat: "breathable" },
  { id: "h_reed_board", name: "Reed insulation board (est.)", k: 0.056, rho: 190, cp: 1200, col: "#c9bd7c", t: 50, min: 30, max: 100, step: 5, cat: "breathable" },
  { id: "h_multipor", name: "Mineral insulation board (Multipor type, calcium silicate)", k: 0.042, rho: 115, cp: 1000, col: "#e9e7df", t: 60, min: 30, max: 200, step: 10, cat: "breathable" },
  { id: "h_calsitherm", name: "Calcium silicate climate board (Calsitherm type)", k: 0.059, rho: 240, cp: 1000, col: "#dedbd2", t: 30, min: 20, max: 100, step: 5, cat: "breathable" },
  { id: "h_aerogel_blanket", name: "Aerogel blanket (Spaceloft type)", k: 0.015, rho: 150, cp: 1000, col: "#cfd8e4", t: 10, min: 5, max: 40, step: 5, cat: "breathable" },
  { id: "h_hemp_lime_roof", name: "Hemp-lime, roof mix (~220 kg/m³, est.)", k: 0.06, rho: 220, cp: 1550, col: "#a9bd94", t: 250, min: 100, max: 400, step: 10, cat: "breathable" },
  { id: "h_hemp_lime_floor", name: "Hemp-lime, floor mix (~450 kg/m³, est.)", k: 0.12, rho: 450, cp: 1550, col: "#92a67e", t: 200, min: 100, max: 400, step: 10, cat: "breathable" },
  { id: "h_foam_glass_agg", name: "Foamed glass aggregate, loose (under limecrete)", k: 0.085, rho: 180, cp: 1000, col: "#c2d2cf", t: 200, min: 100, max: 400, step: 10, cat: "breathable" },
  { id: "h_leca", name: "Expanded clay aggregate, loose (Leca type)", k: 0.11, rho: 350, cp: 1000, col: "#a58a73", t: 200, min: 100, max: 400, step: 10, cat: "breathable" },

  // Lime and insulating plasters
  { id: "h_lime_putty_plaster", name: "Lime putty plaster (1:3 sand)", k: 0.7, rho: 1600, cp: 1000, col: "#e8e1d3", t: 15, min: 6, max: 40, step: 1, cat: "lime-plaster" },
  { id: "h_lime_hair_plaster", name: "Lime-hair plaster (lath & plaster, est.)", k: 0.7, rho: 1500, cp: 1000, col: "#e3dccd", t: 15, min: 6, max: 40, step: 1, cat: "lime-plaster" },
  { id: "h_nhl_render", name: "NHL lime render / harling", k: 0.8, rho: 1700, cp: 1000, col: "#d9d2c0", t: 20, min: 10, max: 40, step: 1, cat: "lime-plaster" },
  { id: "h_clay_plaster", name: "Clay / earth plaster", k: 0.6, rho: 1500, cp: 1000, col: "#c9ad8a", t: 15, min: 6, max: 40, step: 1, cat: "lime-plaster" },
  { id: "h_diathonite", name: "Cork-lime-clay insulating plaster (Diathonite Evolution)", k: 0.045, rho: 360, cp: 1000, col: "#d7cfae", t: 40, min: 10, max: 100, step: 5, cat: "lime-plaster" },
  { id: "h_aerogel_plaster", name: "Aerogel insulating plaster (Fixit 222)", k: 0.028, rho: 220, cp: 1000, col: "#e4e8ee", t: 40, min: 20, max: 100, step: 5, cat: "lime-plaster" },
];

export const HERITAGE_CATEGORIES: Record<string, string> = {
  "stone-types": "Building stones (by type)",
  "historic": "Historic walling, mortars & roofing",
  "breathable": "Breathable insulation",
  "lime-plaster": "Lime & insulating plasters",
};
