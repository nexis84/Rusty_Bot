#!/usr/bin/env node
// Builds appraisal/mining-data.js from the local EVE SDE.
// Only the data needed by the mining refinery tab is kept: ore/ice type names,
// portion sizes, volumes, and reprocessing outputs.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SDE = path.join(ROOT, 'sde');
const OUT = path.join(ROOT, 'appraisal', 'mining-data.js');

function readJsonl(file) {
    const full = path.join(SDE, file);
    if (!fs.existsSync(full)) throw new Error(`Missing SDE file: ${full}`);
    return fs.readFileSync(full, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const types = new Map();
const groups = new Map();
const categories = new Map();
const materials = new Map();

for (const t of readJsonl('types.jsonl')) {
    types.set(String(t._key), t);
}
for (const g of readJsonl('groups.jsonl')) {
    groups.set(String(g._key), g);
}
for (const c of readJsonl('categories.jsonl')) {
    categories.set(String(c._key), c);
}
for (const m of readJsonl('typeMaterials.jsonl')) {
    materials.set(String(m._key), m);
}

const asteroidCategory = [...categories.entries()].find(([, c]) => c.name?.en === 'Asteroid');
if (!asteroidCategory) throw new Error('Could not find the Asteroid category in the SDE');
const asteroidCategoryId = Number(asteroidCategory[0]);

const groupCategory = new Map();
for (const [id, group] of groups) groupCategory.set(id, Number(group.categoryID));

const ores = [];
for (const [id, type] of types) {
    if (type.published !== true) continue;
    if (groupCategory.get(String(type.groupID)) !== asteroidCategoryId) continue;
    if (!materials.has(id)) continue;

    const name = type.name?.en || '';
    if (!name || /UNUSED|PLACEHOLDER|\( copy \)/i.test(name)) continue;

    const refine = materials.get(id);
    const output = [];
    for (const mat of refine.materials || []) {
        const matType = types.get(String(mat.materialTypeID));
        const matName = matType?.name?.en || `Type ${mat.materialTypeID}`;
        output.push({
            id: Number(mat.materialTypeID),
            name: matName,
            quantity: Number(mat.quantity),
        });
    }
    if (!output.length) continue;

    const group = groups.get(String(type.groupID));
    ores.push({
        id: Number(id),
        name,
        group: group?.name?.en || '',
        portionSize: Number(type.portionSize) || 1,
        volume: Number(type.volume) || 0,
        materials: output,
    });
}

ores.sort((a, b) => a.name.localeCompare(b.name));

const sde = readJsonl('_sde.jsonl')[0] || {};
const payload = {
    build: sde.buildNumber || 0,
    releaseDate: sde.releaseDate || '',
    generated: new Date().toISOString(),
    ores,
};

fs.writeFileSync(OUT, `// Auto-generated from EVE Online SDE JSONL\n`
    + `// Ore types: ${ores.length}\n`
    + `// SDE build: ${payload.build}\n`
    + `// Generated: ${payload.generated}\n\n`
    + `const MiningData = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');

console.log(`Wrote ${ores.length} ore/ice types to ${OUT}`);
console.log(`SDE build: ${payload.build}`);
