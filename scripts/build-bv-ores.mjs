// Build blueprint-visualizer/bv-ores.js from the local SDE snapshot.
// Refinable ore-family table so the inventory scan classifies + refines ore,
// compressed ore, ice, moon ore and gas WITHOUT runtime SDE lookups.
// Usage: node scripts/build-bv-ores.mjs
// Re-run after each SDE refresh (see scripts/cron-sde-refresh.sh).
import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const SDE = join(here, '..', 'sde');
const OUT = join(here, '..', 'blueprint-visualizer', 'bv-ores.js');

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

// Membership: category 25 (Asteroid — verified to hold every ore, ice, moon
// ore and compressed grade incl. all 62xxx/82xxx IDs) plus compressed gas
// (category 2 Celestial, gas->gas decompression). Everything else is excluded
// on purpose: modules, crystals, compressors and components also carry
// typeMaterials but must NEVER enter the refinery (verified: "Compressed
// Coil Gun", mining crystals and T2 comps matched a naive name rule).

const groups = await loadMap(
  join(SDE, 'groups.jsonl'),
  (j) => (typeof j._key === 'number' ? j._key : null),
  (j) => ({ categoryID: j.categoryID, name: (j.name && j.name.en) || '' })
);
const materials = await loadMap(
  join(SDE, 'typeMaterials.jsonl'),
  (j) => (typeof j._key === 'number' ? j._key : null),
  (j) => (Array.isArray(j.materials) ? j.materials.map((m) => [m.materialTypeID, m.quantity]).filter(([a, b]) => a > 0 && b > 0) : [])
);

const out = {};
const stats = { total: 0, cat25: 0, cat2gas: 0, skippedNoMats: 0, skippedOther: 0 };
const catDist = new Map();
const rl = createInterface({ input: createReadStream(join(SDE, 'types.jsonl')), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line || line.length < 20) continue;
  let t;
  try { t = JSON.parse(line); } catch { continue; }
  if (typeof t._key !== 'number' || t.published === false) continue;
  const mats = materials.get(t._key);
  if (!mats || !mats.length) { stats.skippedNoMats++; continue; }
  const g = groups.get(t.groupID);
  const cat = g ? g.categoryID : null;
  const name = (t.name && t.name.en) || '';
  const isOre = cat === 25 || (cat === 2 && /gas|mykoserocin|cytoserocin|fuller/i.test(name));
  if (!isOre) { stats.skippedOther++; continue; }
  if (cat !== 25) {
    stats.cat2gas++;
    catDist.set(cat + ':' + ((g && g.name) || ''), (catDist.get(cat + ':' + ((g && g.name) || '')) || 0) + 1);
  } else stats.cat25++;
  out[t._key] = [
    name,
    t.portionSize && t.portionSize > 0 ? t.portionSize : 1,
    typeof t.volume === 'number' ? t.volume : 0,
    cat,
    mats,
  ];
  stats.total++;
}

let sdeBuild = '?', sdeDate = '?';
try {
  const meta = JSON.parse((await import('fs')).readFileSync(join(SDE, '_sde.jsonl'), 'utf8'));
  sdeBuild = meta.buildNumber || '?';
  sdeDate = (meta.releaseDate || '?').slice(0, 10);
} catch {}

const header =
  '// Auto-generated from SDE (build ' + sdeBuild + ', ' + sdeDate + ') by scripts/build-bv-ores.mjs — DO NOT EDIT.\n' +
  '// Refinable ore-family table: id -> [name, portionSize, volume, categoryID, [[matId, qty], ...]].\n' +
  '// Lets the inventory scan classify + refine ore/compressed/ice/moon/gas with zero runtime SDE lookups.\n' +
  'window.BV_ORES = ';
writeFileSync(OUT, header + JSON.stringify(out) + '\n');
console.log('ore entries: ' + stats.total + ' (category-25: ' + stats.cat25 + ', compressed-gas: ' + stats.cat2gas + ')');
console.log('skipped (no yields): ' + stats.skippedNoMats + ', skipped (not ore-family): ' + stats.skippedOther);
console.log('non-25 categories included:');
for (const [k, v] of [...catDist.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + v + 'x category ' + k);
console.log('wrote ' + OUT);
