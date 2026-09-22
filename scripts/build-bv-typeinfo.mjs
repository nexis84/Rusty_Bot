// Build blueprint-visualizer/bv-typeinfo.js from the local SDE snapshot.
// Compact per-type info index for the floating item info panel: name,
// description (with SDE showinfo anchors preserved), group/category/market
// group, and core stats. Local-first so the panel needs no network for the
// common industry types; Everef/ESI tail the rest at runtime.
// Usage: node scripts/build-bv-typeinfo.mjs
// Re-run after each SDE refresh (see scripts/cron-sde-refresh.sh).
import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const SDE = join(here, '..', 'sde');
const OUT = join(here, '..', 'blueprint-visualizer', 'bv-typeinfo.js');

async function loadMap(file, keyFn, valFn) {
  const map = new Map();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line.length < 10) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const k = keyFn(j);
    if (k != null) map.set(k, valFn(j));
  }
  return map;
}

const groups = await loadMap(
  join(SDE, 'groups.jsonl'),
  (j) => (typeof j._key === 'number' ? j._key : null),
  (j) => ({ categoryID: j.categoryID, name: (j.name && j.name.en) || '' })
);
const categories = await loadMap(
  join(SDE, 'categories.jsonl'),
  (j) => (typeof j._key === 'number' ? j._key : null),
  (j) => (j.name && j.name.en) || ''
);
const marketGroups = await loadMap(
  join(SDE, 'marketGroups.jsonl'),
  (j) => (typeof j._key === 'number' ? j._key : null),
  (j) => (j.name && j.name.en) || ''
);

// Industry-relevant categories: keep descriptions for types a builder/trader
// actually inspects. Everything else is left to the Everef fallback so the
// file stays lean. (Category IDs are stable SDE values.)
const INDUSTRY_CATS = new Set([
  4,   // Material (minerals, components, reactions)
  5,   // Accessories? (rarely; harmless)
  6,   // Ship
  7,   // Module
  8,   // Charge
  9,   // Blueprint
  18,  // Drone
  20,  // Implant
  22,  // Deployable
  23,  // Starbase
  24,  // Reaction
  25,  // Asteroid (ore/ice/moon/gas)
  32,  // Subsystem
  39,  // Fighter
  40,  // Structure
  43,  // Planetary Industry
  46,  // Planetary Resources
  65,  // Structure Module
]);

const out = { types: {}, groups: {}, categories: {}, marketGroups: {} };
for (const [id, g] of groups) out.groups[String(id)] = g.name;
for (const [id, n] of categories) out.categories[String(id)] = n;
for (const [id, n] of marketGroups) out.marketGroups[String(id)] = n;

const stats = { total: 0, kept: 0, skippedUnpublished: 0, skippedCat: 0, skippedNoName: 0 };
const rl = createInterface({ input: createReadStream(join(SDE, 'types.jsonl')), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line || line.length < 20) continue;
  let t;
  try { t = JSON.parse(line); } catch { continue; }
  if (typeof t._key !== 'number' || t._key <= 0) continue;
  stats.total++;
  if (t.published === false) { stats.skippedUnpublished++; continue; }
  const name = (t.name && t.name.en) || '';
  if (!name) { stats.skippedNoName++; continue; }
  const g = groups.get(t.groupID);
  const cat = g ? g.categoryID : null;
  if (cat == null || !INDUSTRY_CATS.has(cat)) { stats.skippedCat++; continue; }

  const e = { n: name };
  const desc = (t.description && t.description.en) || '';
  if (desc) e.d = desc;
  if (t.groupID != null) e.g = t.groupID;
  if (cat != null) e.c = cat;
  if (t.marketGroupID != null) e.mg = t.marketGroupID;
  if (t.volume != null) e.v = t.volume;
  if (t.packagedVolume != null) e.pv = t.packagedVolume;
  if (t.portionSize != null) e.ps = t.portionSize;
  if (t.basePrice != null) e.bp = t.basePrice;
  if (t.iconID != null) e.ic = t.iconID;
  if (t.radius != null && t.radius > 0 && t.radius < 1e9) e.r = t.radius;
  // SDE uses a ~1e23 placeholder for "no mass" on celestials/asteroids.
  if (t.mass != null && t.mass > 0 && t.mass < 1e15) e.m = t.mass;
  out.types[String(t._key)] = e;
  stats.kept++;
}

const banner = [
  '// Auto-generated from EVE Online SDE JSONL (types/groups/categories/marketGroups).',
  '// Compact per-type info for the floating item info panel. Do not edit by hand.',
  '// Regenerate: node scripts/build-bv-typeinfo.mjs',
  '',
].join('\n');

writeFileSync(OUT, banner + 'window.BV_TYPEINFO = ' + JSON.stringify(out) + ';\n');

console.log('bv-typeinfo: wrote', OUT);
console.log('  types kept:', stats.kept, '/', stats.total);
console.log('  skipped (unpublished):', stats.skippedUnpublished, '(non-industry cat):', stats.skippedCat, '(no name):', stats.skippedNoName);
console.log('  groups:', Object.keys(out.groups).length, 'categories:', Object.keys(out.categories).length, 'marketGroups:', Object.keys(out.marketGroups).length);
