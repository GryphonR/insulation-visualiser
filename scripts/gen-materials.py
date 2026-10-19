import re, json, colorsys, hashlib, sys

rows = []
with open('materials.tsv', encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line.strip():
            continue
        parts = line.split('\t')
        parts = [p.strip() for p in parts]
        while len(parts) < 4:
            parts.append('')
        name, k, rho, cp = parts[0], parts[1], parts[2], parts[3]
        rows.append({'name': name, 'k': float(k), 'rho': float(rho), 'cp': (float(cp) if cp else None)})

# --- classification ----------------------------------------------------
def classify(name):
    n = name.lower()
    if 'air layer' in n:
        return 'cavity'
    if re.search(r'\b(aluminium|copper|brass|gold|lead|zinc|steel|iron|molybdenum|cr-?ni)\b', n):
        return 'metal'
    # an explicit "insulation"/"insulating" in the name wins, unless it's really a
    # plaster, render or mortar product that happens to use that word.
    if re.search(r'insulat', n) and not re.search(r'plaster|gypsum|render|mortar', n):
        return 'insulation'
    # wood-based boards, checked before the generic brand/keyword insulation match so
    # e.g. an OSB or MDF board is never swept up just for sharing a brand prefix.
    if re.search(r'\bosb\b|\bfibreboard\b|\bmdf\b|chipboard|plywood|particleboard|\btimber\b|\bwood\b', n):
        return 'timber'
    if 'wool' in n:
        return 'insulation'
    if re.search(r'eps|xps|polystyrene|perlite|\bcork\b|\bfoam\b|polyurethane|\bpu\b|kingspan|isover|agepan|therma ?fleece|underlay', n):
        return 'insulation'
    if re.search(r'plaster|gypsum|render', n):
        return 'plaster'
    if re.search(r'concrete|brick|masonry|mortar|screed|clinker|clay/silt|sand/gravel|roof tile|tiles,', n):
        return 'masonry'
    if re.search(r'stone|marble|sandstone|limestone', n):
        return 'stone'
    if re.search(r'pvc|polyvinyl|polyacetate|polyamide|polycarbonate|polyester resin|silicone|rubber|butadiene|butyl|bitumen|asphalt|asbestos|linoleum|plastic', n):
        return 'membrane'
    # a bare "glass" (pane, not foam glass / glass fibre / glass wool, all handled above)
    if re.search(r'\bglass\b', n):
        return 'glass'
    if re.search(r'water|\bice\b|snow', n):
        return 'other-fluid'
    return 'other'

CATEGORY_LABEL = {
    'cavity': 'Air layers',
    'metal': 'Metals',
    'insulation': 'Insulation',
    'glass': 'Glass',
    'timber': 'Timber & wood-based boards',
    'masonry': 'Concrete, brick & mortar',
    'stone': 'Stone',
    'plaster': 'Plaster, gypsum & render',
    'membrane': 'Plastics, rubber & membranes',
    'other-fluid': 'Water, ice & snow',
    'other': 'Other',
}

CATEGORY_HUE = {
    # hue in degrees, base saturation/lightness
    'cavity': (200, 0.45, 0.90),
    'metal': (210, 0.06, 0.74),
    'insulation': (48, 0.55, 0.72),
    'glass': (195, 0.35, 0.90),
    'timber': (30, 0.38, 0.55),
    'masonry': (210, 0.05, 0.60),
    'stone': (40, 0.12, 0.70),
    'plaster': (40, 0.22, 0.88),
    'membrane': (0, 0.0, 0.32),
    'other-fluid': (205, 0.55, 0.78),
    'other': (0, 0.0, 0.65),
}
# brick gets its own warmer hue even though classed as masonry
def brick_tilt(name, cat):
    n = name.lower()
    if cat == 'masonry' and ('brick' in n or 'clinker' in n):
        return (18, 0.42, 0.52)
    return CATEGORY_HUE[cat]

def hsl_to_hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, l, s)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))

def color_for(name, cat):
    base_h, base_s, base_l = brick_tilt(name, cat)
    digest = hashlib.sha1(name.encode('utf-8')).hexdigest()
    hoff = (int(digest[0:2], 16) / 255.0 - 0.5) * 18  # +/-9 deg
    loff = (int(digest[2:4], 16) / 255.0 - 0.5) * 0.12  # +/-6%
    l = min(0.92, max(0.18, base_l + loff))
    return hsl_to_hex(base_h + hoff, base_s, l)

# --- thickness ranges per category (mm): (min, default, max, step) -----
THICK = {
    'metal': (0.5, 2, 12, 0.5),
    'insulation': (20, 100, 300, 5),
    'glass': (3, 6, 25, 1),
    'timber': (6, 18, 150, 1),
    'masonry': (50, 150, 500, 10),
    'stone': (20, 100, 400, 5),
    'plaster': (6, 15, 40, 1),
    'membrane': (1, 3, 15, 0.5),
    'other-fluid': (10, 50, 300, 5),
    'other': (10, 50, 300, 5),
}

def slugify(s):
    s = s.lower()
    s = re.sub(r'[³°,/()%.]', ' ', s)
    s = re.sub(r'[^a-z0-9]+', '_', s)
    return re.sub(r'_+', '_', s).strip('_')[:40]

# --- air-layer thickness (fixed, from the name) ------------------------
def air_layer_thickness_mm(name):
    m = re.match(r'(\d+)\s*cm', name)
    return int(m.group(1)) * 10 if m else None

out = []
seen_ids = {}
seen_names = {}
for r in rows:
    seen_names.setdefault(r['name'], []).append(r)

for r in rows:
    name = r['name']
    cat = classify(name)
    dupes = seen_names[name]
    disp = name
    if len(dupes) > 1:
        disp = f"{name} ({int(r['rho'])} kg/m³)"
    base_id = slugify(disp)
    idx = seen_ids.get(base_id, 0)
    seen_ids[base_id] = idx + 1
    mid = base_id if idx == 0 else f'{base_id}_{idx+1}'
    mid = 'm_' + mid

    cp = r['cp']
    if cp is None:
        cp = 1400 if cat == 'insulation' else 1000

    col = color_for(disp, cat)

    if cat == 'cavity':
        t = air_layer_thickness_mm(name)
        mn, mx, step = t, t, 1
    else:
        mn, default_t, mx, step = THICK[cat]
        t = default_t

    out.append({
        'id': mid, 'name': disp, 'k': round(r['k'], 4), 'rho': r['rho'], 'cp': round(cp),
        'col': col, 't': t, 'min': mn, 'max': mx, 'step': step, 'cat': cat,
    })

# sanity: unique ids
ids = [o['id'] for o in out]
assert len(ids) == len(set(ids)), 'duplicate ids!'

# --- emit TypeScript ----------------------------------------------------
cat_order = ['cavity', 'insulation', 'timber', 'masonry', 'stone', 'plaster', 'glass', 'membrane', 'metal', 'other-fluid', 'other']
by_cat = {c: [] for c in cat_order}
for o in out:
    by_cat[o['cat']].append(o)

lines = []
lines.append('// Auto-generated from a pasted materials table (thermal conductivity, density, specific')
lines.append('// heat). Grouped by category for the dropdowns via `cat`, which must match a label in')
lines.append('// MATERIAL_CATEGORIES below. Regenerate with scripts/gen-materials.py if the source table')
lines.append("// changes — don't hand-edit entries here.")
lines.append('//')
lines.append('// A few notes on where the numbers needed a judgement call:')
lines.append('// - The "N cm ... Air layer" rows give an effective conductivity that is only valid at')
lines.append('//   that exact thickness (cavity convection depends on the gap width), so each one is')
lines.append('//   locked to its stated thickness (min = max = that value) rather than given a slider.')
lines.append('// - A handful of rows (the Kingspan AlphaCore pair) had no specific heat capacity in the')
lines.append('//   source table; they\'re given 1400 J/kgK, in line with similar PIR-type boards.')
lines.append('// - `cat` is a loose grouping for the dropdown and colour, guessed from the material name —')
lines.append('//   it has no effect on the physics.')
lines.append("import type { Material } from './data';")
lines.append('')
lines.append('export const EXTRA_MATERIALS: Material[] = [')
for c in cat_order:
    items = by_cat[c]
    if not items:
        continue
    lines.append(f'  // {CATEGORY_LABEL[c]}')
    for o in items:
        lines.append(
            "  { id: %s, name: %s, k: %s, rho: %s, cp: %s, col: %s, t: %s, min: %s, max: %s, step: %s, cat: %s }," % (
                json.dumps(o['id']), json.dumps(o['name']), o['k'], o['rho'], o['cp'], json.dumps(o['col']),
                o['t'], o['min'], o['max'], o['step'], json.dumps(c),
            )
        )
lines.append('];')
lines.append('')
lines.append('export const MATERIAL_CATEGORIES: Record<string, string> = {')
for c in cat_order:
    lines.append(f'  {json.dumps(c)}: {json.dumps(CATEGORY_LABEL[c])},')
lines.append('};')

text = '\n'.join(lines)
with open('../src/engine/materials-extra.ts', 'w', encoding='utf-8') as f:
    f.write(text + '\n')

print('rows:', len(rows), 'categories:', {c: len(v) for c, v in by_cat.items()})
