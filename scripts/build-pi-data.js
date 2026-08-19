#!/usr/bin/env node
// Build PI/data.js from the SDE jsonl files in ../sde
// Generates: PI/pi-data.js  (materials, recipes, planet subtypes, system index, regions, skyhook data)
// Usage: node scripts/build-pi-data.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SDE = path.join(ROOT, 'sde');
const OUT = path.join(ROOT, 'PI', 'pi-data.js');

function loadLines(file) {
  const p = path.join(SDE, file);
  if (!fs.existsSync(p)) {
    console.error('Missing SDE file:', file);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}

const typesRaw = loadLines('types.jsonl');
const schematics = loadLines('planetSchematics.jsonl');
const systemsRaw = loadLines('mapSolarSystems.jsonl');
const planetsRaw = loadLines('mapPlanets.jsonl');
const planetResources = loadLines('planetResources.jsonl');
const regionsRaw = loadLines('mapRegions.jsonl');

// ---------- Type name / volume registry ----------
const typeMeta = new Map();
for (const t of typesRaw) {
  typeMeta.set(t._key, { name: (t.name && t.name.en) || '', volume: t.volume || 0, basePrice: t.basePrice || 0, groupID: t.groupID });
}
const nameOf = (id) => (typeMeta.get(id) && typeMeta.get(id).name) || String(id);

// ---------- Recipes from schematics ----------
// Tier rules (classic PI):
//   schematics 121-135  -> P1 (from P0), cycle 3600s, in 3000 / out 20
//   schematics 65-88    -> P2 (from 2x P1), cycle 3600s, in 40+40 / out 5
//   schematics 89-111   -> P3 (from 2-3x P2), cycle 3600s, in 10 each / out 3
//   schematics 112-119  -> P4 (from 2-3x P3 + optional P1), cycle 3600s, out 1

const RECIPES = [];          // array of { id, outputId, outputQty, inputs:[{id,qty}], pins, cycleTime, tier }
const outputToTier = {};     // output type id -> tier 1..4

for (const s of schematics) {
  const inputs = s.types.filter(t => t.isInput);
  const outputs = s.types.filter(t => !t.isInput);
  if (outputs.length !== 1) {
    console.warn('Schematic with !=1 outputs:', s._key, s.name);
    continue;
  }
  const out = outputs[0];
  let tier = 0;
  if (s._key >= 121 && s._key <= 135) tier = 1;
  else if (s._key >= 65 && s._key <= 88) tier = 2;
  else if (s._key >= 89 && s._key <= 111) tier = 3;
  else if (s._key >= 112 && s._key <= 119) tier = 4;
  else { console.warn('Unclassified schematic:', s._key, s.name); continue; }

  outputToTier[out._key] = tier;
  RECIPES.push({
    id: s._key,
    name: (s.name && s.name.en) || nameOf(out._key),
    outputId: out._key,
    outputQty: out.quantity,
    inputs: inputs.map(i => ({ id: i._key, qty: i.quantity })),
    pins: s.pins || [],
    cycleTime: s.cycleTime || 3600,
    tier,
  });
}

// ---------- Materials registry ----------
const materials = {};   // id -> { name, tier, volume, batchSize, inputs:{id:qty} }
const recipeByOutput = {};
for (const r of RECIPES) {
  recipeByOutput[r.outputId] = r;
  const inputs = {};
  for (const i of r.inputs) inputs[i.id] = i.qty;
  materials[r.outputId] = {
    id: r.outputId,
    name: nameOf(r.outputId) || r.name,
    tier: r.tier,
    volume: typeMeta.get(r.outputId)?.volume || 0,
    batchSize: r.outputQty,
    inputs,
  };
}

// P0 raw resources: every type used as an input to a P1 schematic
const p0Set = new Set();
for (const r of RECIPES) {
  if (r.tier === 1) for (const i of r.inputs) p0Set.add(i.id);
}
for (const id of p0Set) {
  materials[id] = {
    id,
    name: nameOf(id),
    tier: 0,
    volume: typeMeta.get(id)?.volume || 0,
    batchSize: 1,
    inputs: {},
  };
}

// ---------- Planet subtypes -> P0 resources ----------
// Source: EVE University Planetary Commodities table (community knowledge; not in SDE).
const SUBTYPE_P0_BY_NAME = {
  'Planet (Temperate)': ['Microorganisms', 'Carbon Compounds', 'Autotrophs', 'Complex Organisms', 'Aqueous Liquids'],
  'Planet (Barren)':    ['Microorganisms', 'Carbon Compounds', 'Noble Metals', 'Base Metals', 'Aqueous Liquids'],
  'Planet (Oceanic)':   ['Microorganisms', 'Carbon Compounds', 'Planktic Colonies', 'Complex Organisms', 'Aqueous Liquids'],
  'Planet (Ice)':       ['Microorganisms', 'Planktic Colonies', 'Noble Gas', 'Heavy Metals', 'Aqueous Liquids'],
  'Planet (Gas)':       ['Ionic Solutions', 'Reactive Gas', 'Noble Gas', 'Base Metals', 'Aqueous Liquids'],
  'Planet (Lava)':      ['Non-CS Crystals', 'Suspended Plasma', 'Base Metals', 'Felsic Magma', 'Heavy Metals'],
  'Planet (Plasma)':    ['Non-CS Crystals', 'Suspended Plasma', 'Noble Metals', 'Base Metals', 'Heavy Metals'],
  'Planet (Storm)':     ['Ionic Solutions', 'Noble Gas', 'Suspended Plasma', 'Base Metals', 'Aqueous Liquids'],
  'Planet (Shattered)': [],
  'Planet (Scorched Barren)': ['Microorganisms', 'Carbon Compounds', 'Noble Metals', 'Base Metals', 'Aqueous Liquids'],
};

const p0NameToId = {};
for (const id of p0Set) p0NameToId[materials[id].name] = id;

// planet subtype type id -> { name, color, p0:[ids] }
const subtypeToTypeId = {
  'Planet (Temperate)': 11,
  'Planet (Ice)': 12,
  'Planet (Gas)': 13,
  'Planet (Oceanic)': 2014,
  'Planet (Lava)': 2015,
  'Planet (Barren)': 2016,
  'Planet (Storm)': 2017,
  'Planet (Plasma)': 2063,
  'Planet (Shattered)': 30889,
  'Planet (Scorched Barren)': 73911,
};

const SUBTYPE_COLORS = {
  'Planet (Temperate)': '#4ade80',
  'Planet (Barren)': '#a16207',
  'Planet (Oceanic)': '#0ea5e9',
  'Planet (Lava)': '#dc2626',
  'Planet (Storm)': '#f59e0b',
  'Planet (Plasma)': '#8b5cf6',
  'Planet (Gas)': '#14b8a6',
  'Planet (Ice)': '#bae6fd',
  'Planet (Shattered)': '#6b7280',
  'Planet (Scorched Barren)': '#9a3412',
};

const planetTypes = {};   // subtype type id -> { name, color, p0Materials:[ids] }
for (const [subName, p0Names] of Object.entries(SUBTYPE_P0_BY_NAME)) {
  const tid = subtypeToTypeId[subName];
  if (!tid) continue;
  const p0 = p0Names.map(n => p0NameToId[n]).filter(Boolean);
  planetTypes[tid] = {
    name: subName.replace('Planet (', '').replace(')', ''),
    color: SUBTYPE_COLORS[subName] || '#666',
    p0Materials: p0,
  };
}

// ---------- Reagent type names (skyhook reagent contributions) ----------
const reagentTypes = {};
for (const t of typesRaw) {
  if (t._key === 81143 || t._key === 81144) {
    reagentTypes[t._key] = (t.name && t.name.en) || String(t._key);
  }
}

// ---------- Skyhook data (planet id -> power/workforce/reagent) ----------
const skyhook = new Map();
for (const pr of planetResources) {
  let val = null;
  if (pr.power) val = { kind: 'power', amount: pr.power };
  else if (pr.workforce) val = { kind: 'workforce', amount: pr.workforce };
  else if (pr.reagent) val = { kind: 'reagent', amount: pr.reagent.amount_per_cycle, reagentTypeId: pr.reagent.type_id };
  if (val) skyhook.set(pr._key, val);
}

// ---------- Region index (id -> name) ----------
const regions = {};
for (const r of regionsRaw) {
  regions[r._key] = (r.name && r.name.en) || String(r._key);
}

// ---------- System index (id -> { name, security, regionId, planets }) ----------
const planetById = new Map();  // planet celestial id -> { typeId, solarSystemId }
for (const p of planetsRaw) planetById.set(p._key, p);

const systems = {};
for (const s of systemsRaw) {
  const planets = (s.planetIDs || []).map(pid => {
    const p = planetById.get(pid);
    const sh = skyhook.get(pid);
    return {
      id: pid,
      typeId: p ? p.typeID : null,
      skyhook: sh || null,
    };
  }).filter(x => x.typeId);
  systems[s._key] = {
    id: s._key,
    name: (s.name && s.name.en) || String(s._key),
    security: typeof s.securityStatus === 'number' ? s.securityStatus : null,
    regionId: s.regionID || null,
    planets,
  };
}

// ---------- P4 list (for "Can produce locally" quick view) ----------
const p4ByTier = { 0: [], 1: [], 2: [], 3: [], 4: [] };
for (const m of Object.values(materials)) p4ByTier[m.tier].push(m.id);

// ---------- P0 -> planet subtypes (inverse) ----------
const p0ToPlanetTypes = {};
for (const id of p0Set) p0ToPlanetTypes[id] = [];
for (const [tid, pt] of Object.entries(planetTypes)) {
  for (const p0 of pt.p0Materials) p0ToPlanetTypes[p0].push(parseInt(tid));
}

// ---------- Emit ----------
const meta = {
  sdeBuild: '3466501',
  generated: new Date().toISOString().slice(0, 10),
};

// Core file: materials, recipes, planet types, regions, tier lists (small, always loaded)
const core = { meta, materials, recipes: recipeByOutput, planetTypes, p0ToPlanetTypes, regions, tiers: p4ByTier, reagentTypes };
fs.writeFileSync(OUT, '// Generated by scripts/build-pi-data.js — do not edit by hand\n' +
  'const PI_DATA = ' + JSON.stringify(core) + ';\n' +
  'if (typeof module !== "undefined" && module.exports) module.exports = PI_DATA;\n');

// Systems file: system index + per-planet skyhook data (larger, loaded lazily by the system checker)
const SYSTEMS_OUT = path.join(ROOT, 'PI', 'pi-systems.js');
fs.writeFileSync(SYSTEMS_OUT, '// Generated by scripts/build-pi-data.js — do not edit by hand\n' +
  'const PI_SYSTEMS = ' + JSON.stringify(systems) + ';\n' +
  'if (typeof module !== "undefined" && module.exports) module.exports = PI_SYSTEMS;\n');

// Stats
console.log('Materials:', Object.keys(materials).length,
  '| P0:', p0Set.size,
  '| P1:', p4ByTier[1].length,
  '| P2:', p4ByTier[2].length,
  '| P3:', p4ByTier[3].length,
  '| P4:', p4ByTier[4].length);
console.log('Recipes:', RECIPES.length, '| Systems:', Object.keys(systems).length,
  '| Regions:', Object.keys(regions).length, '| Skyhook planets:', skyhook.size);
const sz = fs.statSync(OUT).size;
const sz2 = fs.statSync(SYSTEMS_OUT).size;
console.log('pi-data.js size:', (sz / 1024).toFixed(1), 'KB');
console.log('pi-systems.js size:', (sz2 / 1024).toFixed(1), 'KB');