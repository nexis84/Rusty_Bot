#!/usr/bin/env node
// Builds recycle-data.js for the RustyAppraisal "Loot Recycle" tab.
//
// Reads the local EVE SDE written by the SDE updater (typeMaterials.jsonl and
// types.jsonl) and produces a compact global:
//
//   window.RecycleData = {
//     build, types: { [typeId]: { p: portionSize, m: [[materialId, qty], ...] } },
//     names: { [materialId]: name }
//   }
//
// Usage:
//   node build-recycle-data.mjs
//   node build-recycle-data.mjs --sde "C:\path\to\sde"

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const sdeArg = args.indexOf('--sde');
const SDE_DIR = sdeArg >= 0 && args[sdeArg + 1]
  ? path.resolve(args[sdeArg + 1])
  : path.resolve(__dirname, '../sde');
const OUT_FILE = path.join(__dirname, 'recycle-data.js');

const readLines = (file) => readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

if (!fs.existsSync(path.join(SDE_DIR, 'typeMaterials.jsonl'))) {
  console.error(`[recycle-data] typeMaterials.jsonl not found in ${SDE_DIR}. Pass --sde <path>.`);
  process.exit(1);
}

const materials = new Map();
for await (const line of readLines(path.join(SDE_DIR, 'typeMaterials.jsonl'))) {
  if (!line.trim()) continue;
  let row;
  try { row = JSON.parse(line); } catch { continue; }
  const id = Number(row?._key);
  if (!Number.isFinite(id) || id <= 0) continue;
  const mats = (Array.isArray(row?.materials) ? row.materials : [])
    .map((m) => [Math.round(Number(m?.materialTypeID) || 0), Math.round(Number(m?.quantity) || 0)])
    .filter(([matId, qty]) => matId > 0 && qty > 0);
  if (mats.length) materials.set(id, mats);
}

const materialNames = new Set();
for (const mats of materials.values()) for (const [matId] of mats) materialNames.add(matId);

const types = {};
const names = {};
let build = '';
for await (const line of readLines(path.join(SDE_DIR, 'types.jsonl'))) {
  if (!line.trim()) continue;
  let row;
  try { row = JSON.parse(line); } catch { continue; }
  const id = Number(row?._key);
  if (!Number.isFinite(id) || id <= 0) continue;
  const name = row?.name?.en;
  if (materialNames.has(id) && name) names[id] = name;
  const mats = materials.get(id);
  if (!mats) continue;
  types[id] = { p: Math.max(1, Math.round(Number(row?.portionSize) || 1)), m: mats };
}

try {
  const sde = JSON.parse(fs.readFileSync(path.join(SDE_DIR, '_sde.jsonl'), 'utf8').split('\n')[0]);
  build = `${sde?.buildNumber || ''} ${sde?.releaseDate || ''}`.trim();
} catch { /* ignore */ }

const payload = { build, types, names };
fs.writeFileSync(
  OUT_FILE,
  `// Auto-generated from EVE Online SDE typeMaterials. Do not edit by hand.\n// Regenerate with: node build-recycle-data.mjs\nwindow.RecycleData = ${JSON.stringify(payload)};\n`,
  'utf8',
);
const sizeMb = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
console.log(`[recycle-data] ${Object.keys(types).length} reprocessable types, ${Object.keys(names).length} material names, ${sizeMb} MB -> ${OUT_FILE}`);
