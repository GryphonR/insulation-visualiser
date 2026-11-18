// Branded products, each traced to the manufacturer's own document. Edit by hand, and only from a document:
// - `src.verified` lists the fields printed in that document (or worked out directly from printed figures; `src.note`
//   says how). Any field not listed is an assumption the document doesn't give, usually ρ or c for an insulation board.
// - `src.checked` is the date the figures were last read from the document at `src.url`.
// - Vapour figures: a resistance Z in MN·s/g converts to Sd = Z / 5 m (air: about 5 MN·s/(g·m)), so μ = Sd / thickness;
//   a resistivity in MN·s/(g·m) converts to μ = resistivity / 5.
// - Foil-faced boards whose documents give no μ use MU_CLOSED, as the generic foil-faced PIR does.
// Ids here are permanent: saved projects refer to them.
import type { Material } from './data';
import { MU_CLOSED } from './materials-mu';

const CHECKED = '2026-11-18';
const AAC_HYG = { A: 0.04, wf: 350, w80: 6 }; // typical aircrete capillary data (materials-mu.ts), not on the datasheets

export const BRANDED_MATERIALS: Material[] = [
  // Foam boards
  {
    id: 'b_kingspan_k108', name: 'Kingspan Kooltherm K108 Cavity Board', brand: 'Kingspan', cat: 'ins-foam',
    k: 0.019, rho: 35, cp: 1400, mu: MU_CLOSED, col: '#e9a9a0', t: 75, min: 40, max: 150, step: 5,
    src: {
      doc: 'Kooltherm K108 brochure (GB & Ireland), Tenth Issue 04/2026', checked: CHECKED, verified: ['k', 'min', 'max'],
      url: 'https://www.kingspan.com/content/dam/kingspan/kil/products/kooltherm-k108-gb-and-ireland/kingspan-kooltherm-k108-brochure-en-gb-ie.pdf',
      note: 'Phenolic core, low-emissivity foil both faces; λ to BS EN 13166. Thickness range from the R-value table. Density, c and μ not stated.',
    },
  },
  {
    id: 'b_kingspan_tw50', name: 'Kingspan Thermawall TW50', brand: 'Kingspan', cat: 'ins-foam',
    k: 0.022, rho: 32, cp: 1400, mu: MU_CLOSED, col: '#e3c85a', t: 50, min: 25, max: 150, step: 5,
    src: {
      doc: 'Thermawall TW50 brochure (Ireland), Fifteenth Issue 04/2026', checked: CHECKED, verified: ['k', 'min', 'max'],
      url: 'https://www.kingspan.com/content/dam/kingspan/kil/products/thermawall-tw50-gb-and-ireland/kingspan-thermawall-tw50-brochure-en-ie.pdf',
      note: 'PIR core, low-emissivity foil both faces; λ to EN 13165. Partial-fill cavity board. Density, c and μ not stated.',
    },
  },
  {
    id: 'b_kingspan_tw55', name: 'Kingspan Thermawall TW55', brand: 'Kingspan', cat: 'ins-foam',
    k: 0.022, rho: 32, cp: 1400, mu: MU_CLOSED, col: '#dcc257', t: 100, min: 25, max: 150, step: 5,
    src: {
      doc: 'Thermawall TW55 brochure (GB), Fifteenth Issue 02/2026', checked: CHECKED, verified: ['k', 'min', 'max'],
      url: 'https://www.kingspan.com/content/dam/kingspan/kil/products/thermawall-tw55-gb-and-ireland/kingspan-thermawall-tw55-brochure-en-gb.pdf',
      note: 'PIR core, low-emissivity foil both faces; λ to BS EN 13165. Vapour resistance over 50 MN·s/g (core) and over 100 MN·s/g (facing), so treated as closed. Density and c not stated.',
    },
  },
  // Multifoils: declared core R only, at the stated thickness. Add the air spaces as separate layers.
  {
    id: 'tlx', name: 'TLX Gold multifoil (33 mm)', brand: 'TLX Insulation', cat: 'ins-special',
    R: 0.85, rho: 27, cp: 1400, mu: 3, col: '#d4b24a', t: 33, min: 33, max: 33, step: 1,
    src: {
      doc: 'TLX Gold Technical Data, Issue December 2015', checked: CHECKED, verified: ['R', 't', 'rho', 'mu'],
      url: 'https://tlxinsulation.co.uk/wp-content/uploads/2026/07/TLX-GOLD-DATA-SHEET.pdf',
      note: 'Core R (R90/90) 0.85 m²K/W; 900 g/m² over 33 mm gives ρ 27; vapour resistance 0.50 MN·s/g gives Sd 0.10 m, μ 3 (a breather membrane). Outer emissivity 0.16. c not stated.',
    },
  },
  {
    id: 'boostr', name: "Actis Boost'R Hybrid multifoil (35 mm)", brand: 'Actis', cat: 'ins-special',
    R: 1.35, rho: 19, cp: 1400, mu: 3, col: '#c9c27a', t: 35, min: 35, max: 35, step: 1,
    src: {
      doc: "BM TRADA Q-Mark Registration Schedule, Boost'R Hybrid, Revision 4 (issued 01/07/2022)", checked: CHECKED, verified: ['R', 't', 'rho', 'mu'],
      url: 'https://www.insulation-actis.com/files/actis/pdfs/en/certificates/BM_TRADA_QMARK/Q%20Mark%20Schedule%20-%20ACTIS%20-%20BoostR%20Hybrid%20V32%20010722.pdf',
      note: "Core R 1.35 m²K/W to BS EN 16012 (2.40 with two unventilated air gaps), confirmed by Actis's 2024 Hybrid range brochure. 650 g/m² over 35 mm gives ρ 19; Sd 0.11 m (0.55 MN·s/g) gives μ 3. Emissivity 0.31 outer / 0.05 inner. The schedule's validity ran to 03/03/2025. c not stated.",
    },
  },
  // Natural insulation
  {
    id: 'b_thermafleece_cosywool_roll', name: 'Thermafleece CosyWool Roll (sheep’s wool)', brand: 'Thermafleece', cat: 'ins-natural',
    k: 0.039, rho: 18, cp: 1800, mu: 1.27, muWet: 1.27, hygro: 0.18, col: '#e2dcc6', t: 100, min: 50, max: 200, step: 25,
    src: {
      doc: 'Thermafleece CosyWool Roll Technical Data Sheet, Version 6 (19/06/2024)', checked: CHECKED, verified: ['k', 'rho', 'cp', 'mu'],
      url: 'https://www.celticsustainables.co.uk/content/Thermafleece/2025/Cosywool/Thermafleece-CosyWool-Roll-Technical-Data-Sheet-v6.pdf',
      note: 'Merchant-hosted copy; the version 7 sheet from thermafleece.com gives the same figures. μ dry-cup 1.27; the printed wet-cup 0.80 is below air, so the dry value is used for both. Thickness range is not on the sheet.',
    },
  },
  // Aircrete blocks: λ is the design value for a protected inner leaf (3% moisture); exposed (5%) is 0.01 higher.
  {
    id: 'b_thermalite_shield', name: 'Thermalite Shield block (3.6 N/mm²)', brand: 'Thermalite (Forterra)', cat: 'brick',
    k: 0.15, rho: 600, cp: 1000, mu: 10, muWet: 10, ...AAC_HYG, col: '#cfd2d4', t: 100, min: 50, max: 215, step: 5,
    src: {
      doc: 'Thermalite Shield Block 3.6 Technical Data Sheet, Version 4 (21/08/2026)', checked: CHECKED, verified: ['k', 'rho', 'mu', 'min', 'max'],
      url: 'https://forterra.cdn.cloud-infra.co.uk/media/2026/08/21161947/Shield-Block-3.6-Technical-Data-Sheet-2026-08-21.pdf',
      note: 'λ protected 0.15 (exposed 0.16, λ10,dry 0.13); gross dry density 600. Vapour resistivity 50 MN·s/(g·m) gives μ 10. c not stated.',
    },
  },
  {
    id: 'b_thermalite_turbo', name: 'Thermalite Turbo block (2.9 N/mm²)', brand: 'Thermalite (Forterra)', cat: 'brick',
    k: 0.11, rho: 470, cp: 1000, mu: 10, muWet: 10, ...AAC_HYG, col: '#d6d8d9', t: 100, min: 100, max: 215, step: 5,
    src: {
      doc: 'Thermalite Turbo Block 2.9 Technical Data Sheet, Version 3 (24/06/2026)', checked: CHECKED, verified: ['k', 'rho', 'mu', 'min', 'max'],
      url: 'https://forterra.cdn.cloud-infra.co.uk/media/2021/02/24163536/Turbo-Block-2.9-Technical-Data-Sheet-2026-06-24.pdf',
      note: 'λ protected 0.11 (exposed 0.12, λ10,dry 0.095); gross dry density 470. Vapour resistivity 50 MN·s/(g·m) gives μ 10. c not stated.',
    },
  },
  {
    id: 'b_thermalite_hi7', name: 'Thermalite Hi-Strength 7 block (7.3 N/mm²)', brand: 'Thermalite (Forterra)', cat: 'brick',
    k: 0.185, rho: 730, cp: 1000, mu: 10, muWet: 10, ...AAC_HYG, col: '#c4c8cb', t: 100, min: 100, max: 215, step: 5,
    src: {
      doc: 'Thermalite Hi-Strength 7 Block Technical Data Sheet, Version 6 (21/08/2026)', checked: CHECKED, verified: ['k', 'rho', 'mu', 'min', 'max'],
      url: 'https://forterra.cdn.cloud-infra.co.uk/media/2021/02/21165534/Hi-Strength-7-Block-Technical-Data-Sheet-2026-08-21.pdf',
      note: 'λ protected 0.185 (exposed 0.20, λ10,dry 0.16); gross dry density 730. Vapour resistivity 50 MN·s/(g·m) gives μ 10. c not stated.',
    },
  },
];
