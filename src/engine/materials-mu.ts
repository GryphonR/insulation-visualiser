// Water-vapour resistance factor (mu, dimensionless; air = 1) for materials, applied on top of the
// material tables by withMu() so the generated materials-extra.ts needn't be edited.
// mu = dry-cup value, muWet = wet-cup value (omitted when equal or unknown). Entries without a
// confident figure are left undefined and the UI shows nothing for them.
//
// Sources: EN ISO 10456 / EN 12524 tables for generic materials; manufacturer datasheets for
// branded products (Diathonite Evolution mu 4 confirmed from its EN 998-1 sheet); typical
// published ranges for natural stone, earth and thatch. Rows marked "est." in the comments are
// mid-range judgement calls from wide published ranges. Natural stone in particular varies by
// quarry (limestone mu ~10-250, sandstone ~10-40). Hygroscopic materials (clay, wood fibre,
// lime) are far more open when damp, so prefer the wet value for them in old, damp walls.
import type { Material } from './data';

/** Vapour-closed (metal, glass, foil): EN ISO 10456 treats these as infinite. */
export const MU_CLOSED = 1e6;

type Rule = [RegExp, number, number?];

// Rules for the generated (m_*) materials, by category; first match wins, then the "*" default.
const RULES: Record<string, Rule[]> = {
  cavity: [[/./, 1]],
  glass: [[/./, MU_CLOSED]],
  metal: [[/./, MU_CLOSED]],
  insulation: [
    [/concrete_eps/, 15, 10],
    [/polystyrene_beads/, 3],
    [/xps/, 150],
    [/eps|polystyrene/, 60],
    [/alphacore|kooltherm|thermawall|polyurethane_pu_foam/, 50],
    [/k_roc|rock_wool|glass_wool|isover|sheeps_wool/, 1],
    [/agepan_dwd/, 11],
    [/agepan_(thd|udp)|wood_fibre/, 5, 3],
    [/foam_glass/, MU_CLOSED],
    [/cork/, 5],
    [/perlite_(loose|board)/, 5],
  ],
  membrane: [
    [/bitumen|asphalt|pvc|polyvinyl/, 50000],
    [/butyl/, 200000],
    [/rubber|epdm|butadiene/, 10000],
    [/silicone/, 5000],
    [/linoleum/, 1000],
    [/asbestos/, 50],
    [/./, 10000], // other plastics: est.
  ],
  masonry: [
    [/aerated_concrete|thermalite/, 10, 6],
    [/lightweight_concrete|light_gravel|expanded_shale|expanded_clay/, 15, 10],
    [/concrete_(1800|2000)kg/, 100, 60],
    [/reinforced|concrete_crushed|concrete_2[2-4]00kg/, 130, 80],
    [/roof_tile_clay|tiles_clay/, 30],
    [/tile/, 100, 60],
    [/brick|clinker/, 16, 10],
    [/light_mortar|lime_cement|cement_lime_mortar/, 15, 10],
    [/cement|one_coat|^m_mortar$/, 25, 15],
    [/sand_gravel|clay_silt/, 50],
  ],
  stone: [
    [/marble|crystalline/, 10000],
    [/limestone_hard|sedimentary/, 200, 150],
    [/sandstone/, 40, 25],
    [/porous/, 15, 10],
  ],
  plaster: [
    [/lime_hemp/, 5],
    [/cement_lime|ext_rendering|coloured/, 15, 10],
    [/./, 10, 6], // gypsum / lime / general-purpose plasters
  ],
  timber: [
    [/wood_wool/, 3, 2],
    [/cement_bonded/, 50, 30],
    [/plywood/, 150, 70],
    [/chipboard|particleboard/, 50, 10],
    [/fibreboard|mdf/, 20, 12],
    [/osb/, 50, 30],
    [/timber|wood/, 50, 20],
  ],
  other: [
    [/cement_sand/, 25, 15],
    [/lime_sand/, 10, 6],
    [/epdm/, 10000],
  ],
};

// Curated common materials and the heritage set, by id: [dry, wet?].
const BY_ID: Record<string, [number, number?]> = {
  // curated
  brick: [16, 10], earth: [10, 6], dblock: [100, 60], pb: [10, 4], ply: [100, 50], cavity: [1], vgap: [1],
  cavity_le1: [1], cavity_le2: [1], vgap_le1: [1], pir: [60], eps: [60], mw: [1], wf: [5, 3],
  tlx: [MU_CLOSED], boostr: [MU_CLOSED], hemp: [5],
  // building stones (est. mid-range except where EN ISO 10456 classes apply)
  h_portland_limestone: [40, 25], h_bath_stone: [15, 10], h_cotswold_limestone: [40, 25], h_magnesian_limestone: [40, 25],
  h_purbeck_limestone: [200, 150], h_mountain_limestone: [250, 200], h_chalk_clunch: [8, 6],
  h_gritstone: [30, 20], h_yorkshire_sandstone: [30, 20], h_red_sandstone: [30, 20], h_blond_sandstone: [30, 20],
  h_granite: [10000], h_whinstone: [10000], h_slate: [800], h_flint: [10000], h_rubble_wall: [20, 12],
  // historic walling, mortars, roofing
  h_cob: [8, 6], h_clay_lump: [8, 6], h_wattle_daub: [8, 6], h_straw_clay: [4, 3], h_straw_bale: [2],
  h_soft_brick: [10, 6], h_stock_brick: [10, 6], h_engineering_brick: [50, 40],
  h_lime_putty_mortar: [10, 6], h_nhl_mortar: [12, 8], h_limecrete: [15, 10], h_water_reed: [2], h_long_straw: [2],
  // breathable insulation
  h_wf_flex: [2], h_wf_dense: [5, 3], h_wf_blown: [2], h_sheep_wool: [1], h_hemp_batt: [2, 1], h_flax_batt: [2, 1],
  h_cotton_batt: [2, 1], h_cellulose_loft: [1], h_cork_icb: [8], h_cork_granules: [2], h_multipor: [3],
  h_calsitherm: [6], h_aerogel_blanket: [5], h_hemp_lime_roof: [5], h_hemp_lime_floor: [7], h_foam_glass_agg: [1], h_leca: [1],
  // lime and insulating plasters
  h_lime_putty_plaster: [10, 6], h_lime_hair_plaster: [10, 6], h_nhl_render: [12, 8], h_clay_plaster: [7, 5],
  h_diathonite: [4], h_aerogel_plaster: [5],
};

/** Organic materials that absorb condensate; ~18% moisture by dry mass is the usual onset of rot risk. Mineral porous materials are left out (no single limit). */
const HYGRO = /wood_fibre|agepan|cork|sheeps_wool|fleece|^h_(wf_|sheep|hemp_batt|flax|cotton|cellulose|cork|reed|straw|water_reed|long_straw)|^(wf|ply)$/;
const HYGRO_CRIT = 0.18;

// Capillary and storage data for the moisture model: [A water absorption coefficient kg/(m² s^0.5),
// wf free water saturation kg/m³, w80 moisture content at 80% RH kg/m³]. Brick is MASEA's "Vollziegel";
// the rest are typical mid-range values for the material type from published hygrothermal data
// (WUFI / MASEA-style tables, EN 1015-18 render tests), so treat them as representative, not measured
// for a product. Lime renders and plasters take up water roughly 5-10x faster than cement ones.
// Materials with no entry are treated as non-capillary with almost no hygroscopic storage.
type Hyg = [number, number, number];
const LIME: Hyg = [0.08, 250, 6], NHL: Hyg = [0.06, 250, 6], LIME_CEMENT: Hyg = [0.03, 220, 20], CEMENT: Hyg = [0.01, 200, 30];
const BRICK: Hyg = [0.18, 188, 3.1], CONCRETE: Hyg = [0.018, 155, 85], AAC: Hyg = [0.04, 350, 6], GYPSUM: Hyg = [0.29, 400, 6.3];
const EARTH: Hyg = [0.08, 300, 15], HEMPCRETE: Hyg = [0.04, 450, 20], SANDSTONE: Hyg = [0.08, 140, 6], DENSE_STONE: Hyg = [0.0005, 10, 0.5];
const HYG_BY_ID: Record<string, Hyg> = {
  brick: BRICK, h_soft_brick: [0.3, 250, 4], h_stock_brick: [0.25, 230, 4], h_engineering_brick: [0.01, 60, 2],
  earth: EARTH, h_cob: EARTH, h_clay_lump: EARTH, h_wattle_daub: EARTH, h_straw_clay: [0.05, 250, 12],
  dblock: CONCRETE, pb: GYPSUM, ply: [0.001, 600, 70], wf: [0.003, 300, 16], h_wf_dense: [0.003, 300, 16],
  hemp: HEMPCRETE, h_hemp_lime_roof: HEMPCRETE, h_hemp_lime_floor: HEMPCRETE, h_limecrete: [0.03, 250, 10],
  h_lime_putty_mortar: LIME, h_lime_putty_plaster: LIME, h_lime_hair_plaster: LIME, h_nhl_mortar: NHL, h_nhl_render: NHL,
  h_clay_plaster: [0.07, 330, 15], h_calsitherm: [1.0, 830, 6],
  h_portland_limestone: [0.04, 150, 3], h_cotswold_limestone: [0.06, 170, 3], h_magnesian_limestone: [0.04, 150, 3],
  h_bath_stone: [0.15, 230, 4], h_chalk_clunch: [0.2, 300, 5], h_purbeck_limestone: [0.01, 60, 2], h_mountain_limestone: [0.005, 30, 1],
  h_gritstone: SANDSTONE, h_yorkshire_sandstone: SANDSTONE, h_red_sandstone: SANDSTONE, h_blond_sandstone: SANDSTONE,
  h_granite: DENSE_STONE, h_whinstone: DENSE_STONE, h_flint: DENSE_STONE, h_slate: [0.001, 20, 1], h_rubble_wall: [0.1, 180, 8],
};
const HYG_RULES: Record<string, Array<[RegExp, Hyg]>> = {
  masonry: [
    [/aerated_concrete|thermalite/, AAC],
    [/lightweight_concrete|light_gravel|expanded_shale|expanded_clay/, [0.03, 300, 20]],
    [/clinker|engineering/, [0.01, 60, 2]],
    [/brick/, BRICK],
    [/light_mortar|lime_cement|cement_lime/, LIME_CEMENT],
    [/concrete|tile_concrete/, CONCRETE],
    [/roof_tile_clay/, [0.1, 150, 3]],
    [/cement|one_coat|^m_mortar$/, CEMENT],
  ],
  plaster: [[/lime_hemp/, HEMPCRETE], [/cement_lime|ext_rendering|coloured/, LIME_CEMENT], [/gypsum|general_purpose|^m_plaster$/, GYPSUM]],
  stone: [[/marble|crystalline/, DENSE_STONE], [/limestone_hard|sedimentary/, [0.01, 60, 2]], [/sandstone/, SANDSTONE], [/porous/, [0.15, 230, 4]]],
  other: [[/cement_sand/, CEMENT], [/lime_sand/, LIME]],
};
/** Wood products: slow capillary uptake across the grain; about 15% moisture by mass at 80% RH. */
const timberHyg = (m: Material): Hyg => [0.002, 600, 0.15 * m.rho];

export function withMu(m: Material): Material {
  const hit = BY_ID[m.id] ?? RULES[m.cat ?? '']?.find(([re]) => re.test(m.id))?.slice(1);
  let out: Material = hit ? { ...m, mu: hit[0], muWet: hit[1] ?? hit[0] } : m;
  const hyg = HYG_BY_ID[m.id] ?? HYG_RULES[m.cat ?? '']?.find(([re]) => re.test(m.id))?.[1] ?? (m.cat === 'timber' && !/wood_wool|cement_bonded/.test(m.id) ? timberHyg(m) : undefined);
  if (hyg) out = { ...out, A: hyg[0], wf: hyg[1], w80: hyg[2] };
  return m.cat === 'timber' || HYGRO.test(m.id) ? { ...out, hygro: HYGRO_CRIT } : out;
}
