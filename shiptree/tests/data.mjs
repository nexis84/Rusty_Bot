#!/usr/bin/env node
/* Browser-free ship-tree data checks.
 *
 * Run with:  node tests/data.mjs   (or npm run test:data)
 *
 * Validates the generated data, static pages and sitemap without launching a
 * browser, so the SDE refresh pipeline and CI can run it. The interactive UI
 * checks live in tests/smoke.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const SPECIAL_LANE = 599999;
const SITE = 'https://www.rustybot.co.uk';

const problems = [];
const check = (condition, message) => { if (!condition) problems.push(message); };

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/shiptree.json'), 'utf8'));
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/version.json'), 'utf8'));
const sitemap = fs.readFileSync(path.join(REPO, 'sitemap.xml'), 'utf8');

check(Array.isArray(data.ships) && data.ships.length > 0, 'shiptree.json contains no ships');
check(Array.isArray(data.lanes) && data.lanes.length > 0, 'shiptree.json contains no lanes');
check(Array.isArray(data.rows) && data.rows.length > 0, 'shiptree.json contains no rows');
check(!!data.meta && Number.isInteger(data.meta.sdeBuild), 'shiptree.json has no meta.sdeBuild');

const laneIds = new Set((data.lanes || []).map(lane => lane.id));
const rowIds = new Set((data.rows || []).map(row => row.id));
const shipIds = new Set();
const shipByName = new Map();

for (const ship of data.ships) {
  check(Number.isInteger(ship.id), `invalid ship id: ${JSON.stringify(ship)}`);
  check(!shipIds.has(ship.id), `duplicate ship id ${ship.id}`);
  shipIds.add(ship.id);
  shipByName.set(ship.name, ship);

  check(typeof ship.name === 'string' && ship.name.trim().length > 0, `ship ${ship.id} has no name`);
  check(typeof ship.slug === 'string' && ship.slug.length > 0, `${ship.name} has no slug`);
  check(laneIds.has(ship.lane), `${ship.name} has unknown lane ${ship.lane}`);
  check(rowIds.has(ship.row), `${ship.name} has unknown row ${ship.row}`);
  check(ship.special === (ship.lane === SPECIAL_LANE),
    `${ship.name}: special=${ship.special} but lane=${ship.lane}`);
  check(Array.isArray(ship.prereqs), `${ship.name} has no prerequisite list`);
}

for (const lane of data.lanes) {
  const actual = data.ships.filter(ship => ship.lane === lane.id).length;
  check(lane.count === actual, `${lane.short}: lane count ${lane.count} != ${actual}`);
}

// Regression guard for the kind of CCP tree change that moved these tournament
// hulls out of the Amarr lane. They must stay in the synthetic Special lane.
for (const name of ['Herald', 'Penitence']) {
  const ship = shipByName.get(name);
  check(!!ship, `${name} is missing from shiptree.json`);
  if (!ship) continue;
  check(ship.special === true, `${name} should be marked special`);
  check(ship.lane === SPECIAL_LANE, `${name} should be in the Special lane, not ${ship.lane}`);
}

// Every hull has exactly one static page, and no orphan pages are left behind.
const shipDir = path.join(ROOT, 'ship');
const pageIds = new Set();
for (const entry of fs.readdirSync(shipDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const match = /^(\d+)-/.exec(entry.name);
  if (!match) continue;
  const id = Number(match[1]);
  pageIds.add(id);
  check(fs.existsSync(path.join(shipDir, entry.name, 'index.html')),
    `missing index.html in ship/${entry.name}`);
}
for (const ship of data.ships) {
  check(pageIds.has(ship.id), `no static page for ${ship.name} (${ship.id})`);
}
for (const id of pageIds) {
  check(shipIds.has(id), `orphan static ship page ${id}`);
}
check(fs.existsSync(path.join(shipDir, 'index.html')), 'missing ship index page');

// Per-hull SKIN data (used by the interactive SKINs tab and static pages).
const skinsPath = path.join(ROOT, 'data/skins.json');
if (!fs.existsSync(skinsPath)) {
  problems.push('missing data/skins.json');
} else {
  const skins = JSON.parse(fs.readFileSync(skinsPath, 'utf8'));
  const iconDir = path.join(REPO, 'market', 'skin-icons');
  const iconFiles = new Set(fs.existsSync(iconDir) ? fs.readdirSync(iconDir) : []);
  let skinCount = 0;
  for (const [shipId, list] of Object.entries(skins.ships || {})) {
    check(shipIds.has(Number(shipId)), `skins.json has unknown ship ${shipId}`);
    check(Array.isArray(list) && list.length > 0, `skins.json ship ${shipId} has no skins`);
    const seen = new Set();
    for (const skin of list || []) {
      skinCount++;
      check(Number.isInteger(skin.id), `skins.json ship ${shipId} has invalid skin id`);
      check(!seen.has(skin.id), `skins.json ship ${shipId} repeats skin ${skin.id}`);
      seen.add(skin.id);
      check(typeof skin.name === 'string' && skin.name.length > 0,
        `skins.json skin ${skin.id} has no name`);
      check(typeof skin.icon === 'string' && iconFiles.has(skin.icon),
        `skins.json skin ${skin.id} has missing icon ${skin.icon}`);
    }
  }
  check(skins.meta?.count === skinCount,
    `skins.json meta.count ${skins.meta?.count} != ${skinCount}`);
  check(skins.meta?.sdeBuild === version.build,
    `skins.json build ${skins.meta?.sdeBuild} != version ${version.build}`);
}

// Sitemap must contain exactly the index plus one URL per hull, with a date.
const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => ({
  loc: /<loc>(.*?)<\/loc>/.exec(match[1])?.[1],
  lastmod: /<lastmod>(.*?)<\/lastmod>/.exec(match[1])?.[1],
}));
const shipUrls = urls.filter(url => url.loc && url.loc.includes('/shiptree/ship/'));
check(shipUrls.length === data.ships.length + 1,
  `sitemap has ${shipUrls.length} ship URLs, expected ${data.ships.length + 1}`);
check(new Set(shipUrls.map(url => url.loc)).size === shipUrls.length,
  'sitemap contains duplicate ship URLs');

const sitemapLocs = new Set(shipUrls.map(url => url.loc));
for (const ship of data.ships) {
  const loc = `${SITE}/shiptree/ship/${ship.id}-${ship.slug}/`;
  check(sitemapLocs.has(loc), `sitemap is missing ${loc}`);
}
for (const url of shipUrls) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(url.lastmod || ''),
    `invalid lastmod for ${url.loc}: ${url.lastmod}`);
}

// The static page must describe the new classification, not just the JSON.
for (const name of ['Herald', 'Penitence']) {
  const ship = shipByName.get(name);
  if (!ship) continue;
  const page = fs.readFileSync(path.join(shipDir, `${ship.id}-${ship.slug}`, 'index.html'), 'utf8');
  check(/<div class="kicker">Special\b/.test(page),
    `${name} page kicker does not say Special`);
}

// Build stamps must agree so a stale tree cannot ship after an SDE refresh.
check(!!version.build, 'version.json has no build');
check(version.build === data.meta.sdeBuild,
  `version.build ${version.build} != shiptree meta.sdeBuild ${data.meta.sdeBuild}`);
check(version.detailsHash === data.meta.detailsHash,
  `version.detailsHash ${version.detailsHash} != shiptree meta.detailsHash ${data.meta.detailsHash}`);

const sdeMeta = path.join(REPO, 'sde', '_sde.jsonl');
if (fs.existsSync(sdeMeta)) {
  const sde = JSON.parse(fs.readFileSync(sdeMeta, 'utf8'));
  check(version.build === sde.buildNumber,
    `version.build ${version.build} != local SDE build ${sde.buildNumber}`);
} else {
  console.log('note: sde/_sde.jsonl is not present; skipped local SDE build check');
}

if (problems.length) {
  console.error(`ship-tree data checks failed (${problems.length}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

const specialCount = data.ships.filter(ship => ship.special).length;
console.log(`ship-tree data checks passed (${data.ships.length} hulls, ${specialCount} special, ${shipUrls.length} sitemap URLs)`);
