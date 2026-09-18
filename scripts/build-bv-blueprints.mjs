// Build blueprint-visualizer/bv-blueprints.js from the local SDE snapshot.
// Manufacturing materials+products for every blueprint, so recipe lookups
// never depend on ESI's /universe/blueprints/ (which 404s some blueprints,
// e.g. Capital Capacitor Battery Blueprint 21020) or the Everef mirror.
// Usage: node scripts/build-bv-blueprints.mjs
// Re-run after each SDE refresh (see scripts/cron-sde-refresh.sh).
import { createReadStream, writeFileSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const SDE = join(here, '..', 'sde');
const OUT = join(here, '..', 'blueprint-visualizer', 'bv-blueprints.js');

const out = {};
let withMfg = 0, withoutMfg = 0;
const rl = createInterface({ input: createReadStream(join(SDE, 'blueprints.jsonl')), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line || line.length < 20) continue;
  let b;
  try { b = JSON.parse(line); } catch { continue; }
  if (typeof b._key !== 'number') continue;
  const mfg = b.activities && b.activities.manufacturing;
  const mats = mfg && Array.isArray(mfg.materials) ? mfg.materials : [];
  if (!mats.length) { withoutMfg++; continue; }
  const prods = Array.isArray(mfg.products) ? mfg.products : [];
  out[b._key] = {
    m: mats.map((m) => [m.typeID, m.quantity]).filter(([a, q]) => a > 0 && q > 0),
    p: prods.map((p) => [p.typeID, p.quantity]).filter(([a, q]) => a > 0 && q > 0),
    t: mfg.time || 0,
  };
  withMfg++;
}

let sdeBuild = '?', sdeDate = '?';
try {
  const meta = JSON.parse(readFileSync(join(SDE, '_sde.jsonl'), 'utf8'));
  sdeBuild = meta.buildNumber || '?';
  sdeDate = (meta.releaseDate || '?').slice(0, 10);
} catch {}

const header =
  '// Auto-generated from SDE (build ' + sdeBuild + ', ' + sdeDate + ') by scripts/build-bv-blueprints.mjs — DO NOT EDIT.\n' +
  '// Manufacturing recipes: bpId -> {m: [[typeId, qty]], p: [[typeId, qty]], t: time}.\n' +
  '// Covers blueprints ESI 404s (e.g. 21020) with zero network. Rebuild after SDE refresh.\n' +
  'window.BV_BLUEPRINTS = ';
writeFileSync(OUT, header + JSON.stringify(out) + '\n');
console.log('blueprints with manufacturing: ' + withMfg + ', without: ' + withoutMfg);
console.log('wrote ' + OUT);
