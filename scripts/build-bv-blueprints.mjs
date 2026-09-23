// Build blueprint-visualizer/bv-blueprints.js from the local SDE snapshot.
// Emits two indexes:
//   window.BV_BLUEPRINTS - manufacturing recipes keyed by blueprint typeID,
//     the ESI-404 fallback for blueprintData() (identical legacy shape).
//   window.BV_RECIPES    - a product->recipe index keyed by product typeID,
//     covering manufacturing AND reactions, so the deep-tree resolver can
//     expand every sub-material locally with zero network.
// Recipe shape for BV_RECIPES: [kind, productQty, [[matTypeId, qty], ...]]
// where kind 0 = manufacturing, 1 = reaction.
// Usage: node scripts/build-bv-blueprints.mjs
// Re-run after each SDE refresh (see scripts/cron-sde-refresh.sh).
import { createReadStream, writeFileSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const SDE = join(here, '..', 'sde');
const OUT = join(here, '..', 'blueprint-visualizer', 'bv-blueprints.js');

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

// typeID -> English name, for canonical-selection: a product is normally built
// by the blueprint literally named "<Product> Blueprint" (or "<Product> Reaction
// Formula"); faction/test variants have different names and must not win.
const names = await loadMap(
  join(SDE, 'types.jsonl'),
  (j) => (typeof j._key === 'number' ? j._key : null),
  (j) => ((j.name && j.name.en) || '')
);

const blueprints = {};          // blueprintTypeID -> {m,p,t} (manufacturing only, legacy)
const recipes = {};             // productTypeID -> {k, q, m, canonical}
let withMfg = 0, withRx = 0, skipped = 0;

const rl = createInterface({ input: createReadStream(join(SDE, 'blueprints.jsonl')), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line || line.length < 20) continue;
  let b;
  try { b = JSON.parse(line); } catch { continue; }
  if (typeof b._key !== 'number') continue;

  const mfg = b.activities && b.activities.manufacturing;
  const rx = b.activities && b.activities.reaction;

  // Legacy manufacturing index (blueprintTypeID -> recipe). Identical to the
  // previous output: any manufacturing blueprint with materials is kept, even
  // when its products array is empty (e.g. Upwell consumable copies).
  if (mfg) {
    const mats = Array.isArray(mfg.materials) ? mfg.materials : [];
    if (mats.length) {
      const prods = Array.isArray(mfg.products) ? mfg.products : [];
      blueprints[b._key] = {
        m: mats.map((m) => [m.typeID, m.quantity]).filter(([a, q]) => a > 0 && q > 0),
        p: prods.map((p) => [p.typeID, p.quantity]).filter(([a, q]) => a > 0 && q > 0),
        t: mfg.time || 0,
      };
      withMfg++;
    } else {
      skipped++;
    }
  }

  // Product->recipe index (manufacturing + reaction). Requires a real product,
  // so product-less blueprint copies naturally never appear here.
  const act = mfg || rx;
  if (act) {
    const kind = mfg ? 0 : 1;
    const suffix = mfg ? ' Blueprint' : ' Reaction Formula';
    const mats = Array.isArray(act.materials) ? act.materials : [];
    const prods = Array.isArray(act.products) ? act.products : [];
    if (mats.length && prods.length) {
      const cleanMats = mats.map((m) => [m.typeID, m.quantity]).filter(([a, q]) => a > 0 && q > 0);
      if (cleanMats.length) {
        if (rx) withRx++;
        const blueprintName = names.get(b._key) || '';
        for (const p of prods) {
          const pid = p.typeID;
          if (!(pid > 0) || !(p.quantity > 0)) continue;
          const productName = names.get(pid) || '';
          const canonicalName = (productName + suffix).toLowerCase();
          const isCanonical = canonicalName.length > suffix.length && blueprintName.toLowerCase() === canonicalName;
          const existing = recipes[String(pid)];
          if (!existing || (isCanonical && !existing.canonical)) {
            recipes[String(pid)] = { k: kind, q: p.quantity, m: cleanMats, canonical: isCanonical };
          }
        }
      }
    }
  }
}

// Strip the build-only canonical flag before writing.
const recipesOut = {};
for (const [pid, r] of Object.entries(recipes)) recipesOut[pid] = [r.k, r.q, r.m];

let sdeBuild = '?', sdeDate = '?';
try {
  const meta = JSON.parse(readFileSync(join(SDE, '_sde.jsonl'), 'utf8'));
  sdeBuild = meta.buildNumber || '?';
  sdeDate = (meta.releaseDate || '?').slice(0, 10);
} catch {}

const header =
  '// Auto-generated from SDE (build ' + sdeBuild + ', ' + sdeDate + ') by scripts/build-bv-blueprints.mjs — DO NOT EDIT.\n' +
  '// BV_BLUEPRINTS: manufacturing recipes, blueprintTypeID -> {m:[[typeId,qty]],p:[[typeId,qty]],t:time}.\n' +
  '// BV_RECIPES: product->recipe, productTypeID -> [kind, productQty, [[matTypeId,qty],...]] (kind 0=manufacturing, 1=reaction).\n' +
  '// Both cover every blueprint with zero network; rebuild after SDE refresh.\n' +
  'window.BV_BLUEPRINTS = ' + JSON.stringify(blueprints) + ';\n' +
  'window.BV_RECIPES = ' + JSON.stringify(recipesOut) + ';\n';
writeFileSync(OUT, header);
console.log('manufacturing recipes: ' + withMfg + ', reaction recipes: ' + withRx + ', skipped: ' + skipped);
console.log('product->recipe entries: ' + Object.keys(recipesOut).length);
console.log('wrote ' + OUT);
