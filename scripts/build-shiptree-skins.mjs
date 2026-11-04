#!/usr/bin/env node
/* Build shiptree/data/skins.json: ship typeID -> [{ id, name, icon }].
 *
 * Reuses the market's generated ship -> skin map and icon map so the ship tree
 * stays in sync with the market without duplicating the matching logic.
 *
 * Run after scripts/build-skin-ships.mjs:
 *   node scripts/build-shiptree-skins.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MARKET = path.join(ROOT, 'market');
const OUT = path.join(ROOT, 'shiptree', 'data', 'skins.json');

function readBuild() {
  const file = path.join(ROOT, 'sde', '_sde.jsonl');
  if (!fs.existsSync(file)) return 0;
  return JSON.parse(fs.readFileSync(file, 'utf8')).buildNumber || 0;
}

function loadMarket() {
  const context = { window: {} };
  vm.createContext(context);
  for (const name of ['skin-ships.js', 'skin-icons.js', 'items_database.js']) {
    vm.runInContext(
      fs.readFileSync(path.join(MARKET, name), 'utf8'),
      context,
      { filename: name },
    );
  }
  vm.runInContext('globalThis.__market = AllMarketItems;', context);
  return {
    shipSkins: context.window.SkinShips || {},
    icons: context.window.SkinIcons || {},
    items: context.__market,
  };
}

const { shipSkins, icons, items } = loadMarket();
const skinNames = new Map(items.skins.items.map(item => [item.id, item.name]));
const treeShips = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'shiptree', 'data', 'shiptree.json'), 'utf8'))
    .ships.map(ship => ship.id),
);

const ships = {};
let count = 0;
let missing = 0;

for (const [shipId, skinIds] of Object.entries(shipSkins)) {
  if (!treeShips.has(Number(shipId))) continue;
  const list = [];
  for (const skinId of skinIds) {
    const name = skinNames.get(skinId);
    const icon = icons[skinId];
    if (!name || !icon) {
      missing++;
      continue;
    }
    list.push({ id: skinId, name, icon });
  }
  if (!list.length) continue;
  list.sort((a, b) => a.name.localeCompare(b.name));
  ships[shipId] = list;
  count += list.length;
}

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    sdeBuild: readBuild(),
    count,
  },
  ships,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload), 'utf8');

console.log(`ship skins:     ${count}`);
console.log(`ships:          ${Object.keys(ships).length}`);
if (missing) console.log(`skipped:        ${missing} (missing name/icon)`);
console.log(`written:        ${OUT}`);
