#!/usr/bin/env node
// Validate generated PI data
const fs = require('fs');
const path = require('path');
const PI_DATA = require(path.join(__dirname, '..', 'PI', 'pi-data.js'));

let errors = 0;
const check = (cond, msg) => { if (!cond) { errors++; console.error('FAIL:', msg); } };

// 1. Known material names must resolve correctly
const expect = {
  9838: 'Superconductors', 9832: 'Coolant', 9830: 'Rocket Fuel', 3691: 'Synthetic Oil',
  2344: 'Condensates', 2345: 'Camera Drones', 2346: 'Synthetic Synapses',
  17136: 'Ukomi Superconductors', 2870: 'Organic Mortar Applicators',
  2867: 'Broadcast Node', 2876: 'Wetware Mainframe',
  2389: 'Plasmoids', 2390: 'Electrolytes', 2392: 'Oxidizing Compound', 2393: 'Bacteria',
  2395: 'Proteins', 2396: 'Biofuels', 2397: 'Industrial Fibers', 2398: 'Reactive Metals',
  2399: 'Precious Metals', 2400: 'Toxic Metals', 2401: 'Chiral Structures', 2403: undefined,
  3645: 'Water', 3683: 'Oxygen', 3779: 'Biomass', 9828: 'Silicon',
  2268: 'Aqueous Liquids', 2305: 'Autotrophs', 2286: 'Planktic Colonies',
  2287: 'Complex Organisms', 2288: 'Carbon Compounds',
};
for (const [id, name] of Object.entries(expect)) {
  const m = PI_DATA.materials[id];
  if (!name) { check(!m, 'ID ' + id + ' should not exist'); continue; }
  check(m && m.name === name, 'ID ' + id + ' name: got ' + (m && m.name) + ' want ' + name);
  check(m && m.tier >= 0, 'ID ' + id + ' has tier');
}

// 2. All P2-P4 must have recipes, all recipe outputs exist as materials
const tiers = { 2: 24, 3: 21, 4: 8, 1: 15 };
for (const [tier, count] of Object.entries(tiers)) {
  const list = PI_DATA.tiers[tier];
  check(list && list.length === count, 'tier ' + tier + ' count: got ' + (list && list.length) + ' want ' + count);
}

// 3. Recipe structure: check a P4 chain (Wetware Mainframe 2876)
const wetware = PI_DATA.recipes[2876];
check(wetware && wetware.tier === 4, '2876 tier');
check(wetware && wetware.outputQty === 1, '2876 output qty');
// inputs should be Supercomputers(2349), Biotech Research Reports(2358), Cryoprotectant Solution(2367)
const wetInputs = wetware.inputs.map(i => PI_DATA.materials[i.id].name).sort();
check(wetInputs.join(',') === 'Biotech Research Reports,Cryoprotectant Solution,Supercomputers',
  '2876 inputs: ' + wetInputs.join(','));

// 4. Planet subtypes
const barren = PI_DATA.planetTypes[2016];
check(barren && barren.p0Materials.includes(2268), 'Barren should have Aqueous Liquids');
check(barren && barren.p0Materials.length === 5, 'Barren p0 count');
const lava = PI_DATA.planetTypes[2015];
check(lava && lava.p0Materials.length === 5, 'Lava p0 count');
check(lava && lava.p0Materials.every(id => PI_DATA.materials[id] && PI_DATA.materials[id].tier === 0), 'Lava p0s all tier 0');

// 5. P0 -> planet types inverse consistent
for (const [p0id, subtypes] of Object.entries(PI_DATA.p0ToPlanetTypes)) {
  for (const st of subtypes) {
    const pt = PI_DATA.planetTypes[st];
    check(pt && pt.p0Materials.includes(parseInt(p0id)), 'inverse mismatch ' + p0id + ' ' + st);
  }
}

// 6. Regions
check(PI_DATA.regions[10000002] === 'The Forge', 'Region 10000002 name');

console.log(errors === 0 ? 'ALL VALIDATION PASSED' : errors + ' ERRORS');
process.exit(errors === 0 ? 0 : 1);