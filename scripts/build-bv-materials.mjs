// Build blueprint-visualizer/bv-materials.js from the local SDE snapshot.
// Emits the SDE-derived set of every published type treated as an industry
// material, so the inventory scan can classify items with zero runtime SDE
// lookups (BV_MATERIAL_IDS) and show their names (BV_MATERIAL_NAMES).
// Usage: node scripts/build-bv-materials.mjs
// Re-run after each SDE refresh (see refresh-sde.ps1 / scripts/cron-sde-refresh.sh).
import { createReadStream, writeFileSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const SDE = join(here, '..', 'sde');
const OUT = join(here, '..', 'blueprint-visualizer', 'bv-materials.js');

// Entire categories whose published types are always materials.
const MATERIAL_CATEGORIES = [
  'Material',                  // 4
  'Reaction',                  // 24
  'Asteroid',                  // 25 (ore, ice, moon ore, compressed grades, gas)
  'Ancient Relics',            // 34
  'Decryptors',                // 35
  'Planetary Industry',        // 41
  'Planetary Resources',       // 42
  'Planetary Commodities',     // 43
];

// Individual Celestial group holding harvestable clouds (gas / fullerenes).
const MATERIAL_GROUPS_IN_OTHER_CATEGORIES = ['Harvestable Cloud'];

// Commodity sub-groups that count as materials (T2 components, datacores,
// capital/advanced components, research data, RAM, etc.). Other commodity
// groups (tags, filaments, keys, drugs, ...) are deliberately excluded.
const MATERIAL_COMMODITY_GROUPS = [
  'Construction Components',
  'Materials and Compounds',
  'Artifacts and Prototypes',
  'Advanced Capital Construction Components',
  'Research Data',
  'Capital Construction Components',
  'Unknown Components',
  'Datacores',
  'Structure Components',
  'Hybrid Tech Components',
  'Peculiar Materials',
  'Refinables',
  'Verity Cryo Tech',
  'Triglavian Artifacts',
  'Triglavian Data',
  'Sleeper Components',
  'Technical Data Chips',
  'Fabricator Data',
];

async function loadJsonl(file, fn) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line.length < 5) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    fn(j);
  }
}

// categoryID -> name
const catName = new Map();
await loadJsonl(join(SDE, 'categories.jsonl'), (c) => catName.set(c._key, (c.name && c.name.en) || ''));

// groupID -> { name, categoryID, category }
const groups = new Map();
await loadJsonl(join(SDE, 'groups.jsonl'), (g) => {
  groups.set(g._key, { name: (g.name && g.name.en) || '', categoryID: g.categoryID, category: catName.get(g.categoryID) || '' });
});

const materialCatSet = new Set(MATERIAL_CATEGORIES);
const otherGroupSet = new Set(MATERIAL_GROUPS_IN_OTHER_CATEGORIES);
const commodityGroupSet = new Set(MATERIAL_COMMODITY_GROUPS);

const out = [];
const stats = { total: 0, byCategory: new Map(), otherGroups: 0, commodityGroups: 0 };
const missingGroups = new Set(MATERIAL_GROUPS_IN_OTHER_CATEGORIES.concat(MATERIAL_COMMODITY_GROUPS));

await loadJsonl(join(SDE, 'types.jsonl'), (t) => {
  if (typeof t._key !== 'number' || t.published === false) return;
  const g = groups.get(t.groupID);
  if (!g) return;
  let kind = null;
  if (otherGroupSet.has(g.name)) kind = 'other-group';
  else if (g.category === 'Commodity') kind = commodityGroupSet.has(g.name) ? 'commodity-group' : null;
  else if (materialCatSet.has(g.category)) kind = 'category';
  if (!kind) return;
  const name = (t.name && t.name.en) || '';
  if (!name) return;
  out.push([t._key, name]);
  stats.total++;
  if (kind === 'category') stats.byCategory.set(g.category, (stats.byCategory.get(g.category) || 0) + 1);
  else if (kind === 'other-group') stats.otherGroups++;
  else stats.commodityGroups++;
  missingGroups.delete(g.name);
});

out.sort((a, b) => a[0] - b[0]);

let sdeBuild = '?', sdeDate = '?';
try {
  const meta = JSON.parse(readFileSync(join(SDE, '_sde.jsonl'), 'utf8'));
  sdeBuild = meta.buildNumber || '?';
  sdeDate = (meta.releaseDate || '?').slice(0, 10);
} catch {}

const header =
  '// Auto-generated from SDE (build ' + sdeBuild + ', ' + sdeDate + ') by scripts/build-bv-materials.mjs — DO NOT EDIT.\n' +
  '// Browser + Node compatible (Node test harnesses have no window).\n' +
  'var BV_GLOBAL = typeof window !== \'undefined\' ? window : (typeof globalThis !== \'undefined\' ? globalThis : {});\n' +
  '// Industry materials = ' + MATERIAL_CATEGORIES.join(', ') + ' categories\n' +
  '// + ' + MATERIAL_GROUPS_IN_OTHER_CATEGORIES.join(', ') + ' + material commodity groups (' + MATERIAL_COMMODITY_GROUPS.length + ').\n';

const body =
  'BV_GLOBAL.BV_MATERIAL_IDS = [' + out.map((r) => r[0]).join(',') + '];\n' +
  'BV_GLOBAL.BV_MATERIAL_NAMES = [' + out.map((r) => '[' + r[0] + ',' + JSON.stringify(r[1]) + ']').join(',') + '];\n';

writeFileSync(OUT, header + body);
console.log('material entries: ' + stats.total);
for (const [c, n] of [...stats.byCategory.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + n + 'x ' + c);
console.log('  ' + stats.otherGroups + 'x harvestable clouds');
console.log('  ' + stats.commodityGroups + 'x material commodities');
if (missingGroups.size) console.warn('WARNING: group names not found in SDE: ' + [...missingGroups].join(', '));
console.log('wrote ' + OUT);
