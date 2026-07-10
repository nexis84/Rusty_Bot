const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

const FACTION_ORDER = ['Angel Cartel', 'Blood Raiders', 'Guristas Pirates', "Sansha's Nation", 'Serpentis', 'Rogue Drones'];

function exists(name) {
  return index.some(e => e.name === name && e.faction === getFactionForName(name));
}

function getFactionForName(name) {
  if (name.includes('Angel') || name.includes('Minmatar') || name.includes('Domination')) return 'Angel Cartel';
  if (name.includes('Blood') || name.includes('Dark Blood') || name.includes('Mul-Zatah') || name.includes('Crimson') || name.includes('Old Meanie')) return 'Blood Raiders';
  if (name.includes('Gurista') || name.includes('Pith') || name.includes('Dread') || name.includes('The Maze')) return 'Guristas Pirates';
  if (name.includes('Sansha') || name.includes('True Sansha') || name.includes('Centus')) return "Sansha's Nation";
  if (name.includes('Serpentis') || name.includes('Shadow Serpentis')) return 'Serpentis';
  if (name.includes('Drone') || name.includes('Rogue')) return 'Rogue Drones';
  return 'Rogue Drones';
}

const newEntries = [];

// ===== 1. MISSING COMBAT ANOMALIES =====

// Forsaken Sanctum variants
const forsakenSanctums = [
  { name: 'Angel Forsaken Sanctum', faction: 'Angel Cartel', space: { high: false, low: false, null: true }, escalation: null },
  { name: 'Blood Forsaken Sanctum', faction: 'Blood Raiders', space: { high: false, low: false, null: true }, escalation: null },
  { name: 'Guristas Forsaken Sanctum', faction: 'Guristas Pirates', space: { high: false, low: false, null: true }, escalation: null },
];
for (const s of forsakenSanctums) {
  if (!exists(s.name)) {
    newEntries.push({
      name: s.name,
      faction: s.faction,
      tier: 10,
      level: 2,
      space: s.space,
      page: s.name.replace(/'/g, '%27').replace(/ /g, '_'),
      escalation: s.escalation
    });
  }
}

// Teeming Drone Horde
if (!exists('Teeming Drone Horde')) {
  newEntries.push({
    name: 'Teeming Drone Horde',
    faction: 'Rogue Drones',
    tier: 10,
    level: 2,
    space: { high: false, low: false, null: true },
    page: 'Teeming_Drone_Horde',
    escalation: null
  });
}

// ===== 2. UNRATED COMPLEXES =====

function addUnrated(name, faction, space) {
  if (exists(name)) return;
  newEntries.push({
    name,
    faction,
    tier: 0,
    level: null,
    space,
    page: name.replace(/'/g, '%27').replace(/ /g, '_'),
    escalation: null
  });
}

// Hideout family - High + Low
const hideoutFactions = [
  ['Angel Hideout', 'Angel Cartel'],
  ['Blood Hideout', 'Blood Raiders'],
  ['Gurista Hideout', 'Guristas Pirates'],
  ['Sansha Hideout', "Sansha's Nation"],
  ['Serpentis Hideout', 'Serpentis'],
];
for (const [n, f] of hideoutFactions) {
  addUnrated(n, f, { high: true, low: true, null: false });
}

// Lookout family - High + Low
for (const [base, f] of [['Angel', 'Angel Cartel'], ['Blood', 'Blood Raiders'], ['Gurista', 'Guristas Pirates'], ['Sansha', "Sansha's Nation"], ['Serpentis', 'Serpentis']]) {
  addUnrated(base + ' Lookout', f, { high: true, low: true, null: false });
}

// Watch family - High + Low
for (const [base, f] of [['Angel', 'Angel Cartel'], ['Blood', 'Blood Raiders'], ['Guristas', 'Guristas Pirates'], ['Sansha', "Sansha's Nation"], ['Serpentis', 'Serpentis']]) {
  addUnrated(base + ' Watch', f, { high: true, low: true, null: false });
}

// Vigil family - High + Low
for (const [base, f] of [['Angel', 'Angel Cartel'], ['Blood', 'Blood Raiders'], ['Guristas', 'Guristas Pirates'], ['Sansha', "Sansha's Nation"], ['Serpentis', 'Serpentis']]) {
  addUnrated(base + ' Vigil', f, { high: true, low: true, null: false });
}

// Provisional Outpost - Null only
for (const [base, f] of [['Provisional Angel Outpost', 'Angel Cartel'], ['Provisional Blood Outpost', 'Blood Raiders'], ['Provisional Gurista Outpost', 'Guristas Pirates'], ['Provisional Sansha Outpost', "Sansha's Nation"], ['Provisional Serpentis Outpost', 'Serpentis']]) {
  addUnrated(base, f, { high: false, low: false, null: true });
}

// Outpost - Null only
const outpostFactions = [
  ['Angel Outpost', 'Angel Cartel'],
  ['Blood Raider Outpost', 'Blood Raiders'],
  ['Gurista Outpost', 'Guristas Pirates'],
  ['Sansha Outpost', "Sansha's Nation"],
  ['Serpentis Outpost', 'Serpentis'],
];
for (const [n, f] of outpostFactions) {
  addUnrated(n, f, { high: false, low: false, null: true });
}

// Minor Annex - Null only
for (const [base, f] of [['Minor Angel Annex', 'Angel Cartel'], ['Minor Blood Annex', 'Blood Raiders'], ['Minor Guristas Annex', 'Guristas Pirates'], ['Minor Sansha Annex', "Sansha's Nation"], ['Minor Serpentis Annex', 'Serpentis']]) {
  addUnrated(base, f, { high: false, low: false, null: true });
}

// Annex - Null only
for (const [base, f] of [['Angel Annex', 'Angel Cartel'], ['Blood Annex', 'Blood Raiders'], ['Guristas Annex', 'Guristas Pirates'], ['Sansha Annex', "Sansha's Nation"], ['Serpentis Annex', 'Serpentis']]) {
  addUnrated(base, f, { high: false, low: false, null: true });
}

// Base - Null only
const baseFactions = [
  ['Angel Base', 'Angel Cartel'],
  ['Blood Raider Base', 'Blood Raiders'],
  ['Gurista Base', 'Guristas Pirates'],
  ['Sansha Base', "Sansha's Nation"],
  ['Serpentis Base', 'Serpentis'],
];
for (const [n, f] of baseFactions) {
  addUnrated(n, f, { high: false, low: false, null: true });
}

// Fortress - Null only
const fortressFactions = [
  ['Angel Fortress', 'Angel Cartel'],
  ['Blood Raider Fortress', 'Blood Raiders'],
  ['Gurista Fortress', 'Guristas Pirates'],
  ['Sansha Fortress', "Sansha's Nation"],
  ['Serpentis Fortress', 'Serpentis'],
];
for (const [n, f] of fortressFactions) {
  addUnrated(n, f, { high: false, low: false, null: true });
}

// Military Complex (unrated) - Null only
const mcFactions = [
  ['Angel Military Complex', 'Angel Cartel'],
  ['Blood Military Complex', 'Blood Raiders'],
  ['Gurista Military Complex', 'Guristas Pirates'],
  ['Sansha Military Complex', "Sansha's Nation"],
  ['Serpentis Military Complex', 'Serpentis'],
];
// Note: Some of these may conflict with existing DED entries like "Angel Military Operations Complex"
// The unrated variant is "Angel Military Complex" (no "Operations")
for (const [n, f] of mcFactions) {
  addUnrated(n, f, { high: false, low: false, null: true });
}

// Provincial HQ - Null only
const hqFactions = [
  ['Angel Provincial HQ', 'Angel Cartel'],
  ['Blood Provincial HQ', 'Blood Raiders'],
  ['Gurista Provincial HQ', 'Guristas Pirates'],
  ['Sansha Provincial HQ', "Sansha's Nation"],
  ['Serpentis Provincial HQ', 'Serpentis'],
];
for (const [n, f] of hqFactions) {
  addUnrated(n, f, { high: false, low: false, null: true });
}

// Dark Blood Fleet Staging Point (missing unrated variant)
if (!exists('Dark Blood Fleet Staging Point')) {
  newEntries.push({
    name: 'Dark Blood Fleet Staging Point',
    faction: 'Blood Raiders',
    tier: 0,
    level: null,
    space: { high: false, low: false, null: true },
    page: 'Dark_Blood_Fleet_Staging_Point',
    escalation: null
  });
}

// Rogue Drone unrated complexes
const rdUnrated = [
  ['Haunted Yard', { high: true, low: true, null: false }],
  ['Desolate Site', { high: true, low: true, null: false }],
  ['Chemical Yard', { high: true, low: true, null: false }],
  ['Rogue Trial Yard', { high: false, low: false, null: true }],
  ['Dirty Site', { high: false, low: false, null: true }],
  ['Ruins', { high: false, low: false, null: true }],
  ['Independence', { high: false, low: false, null: true }],
  ['Radiance', { high: false, low: false, null: true }],
  ['Hierarchy', { high: false, low: false, null: true }],
];
for (const [n, s] of rdUnrated) {
  addUnrated(n, 'Rogue Drones', s);
}

// ===== 3. MISSING DED COMPLEXES =====

function addDED(name, faction, dedRating, space) {
  if (exists(name)) return;
  newEntries.push({
    name,
    faction,
    tier: dedRating,
    level: dedRating,
    space,
    page: name.replace(/'/g, '%27').replace(/ /g, '_'),
    escalation: null
  });
}

// DED 1/10 - High only
addDED('Minmatar Contracted Bio-Farm', 'Angel Cartel', 1, { high: true, low: true, null: false });
addDED('Old Meanie - Cultivation Center', 'Blood Raiders', 1, { high: true, low: true, null: false });
addDED('Pith Robux Asteroid Mining & Co.', 'Guristas Pirates', 1, { high: true, low: true, null: false });
addDED('Sansha Military Outpost', "Sansha's Nation", 1, { high: true, low: true, null: false });
addDED('Serpentis Drug Outlet', 'Serpentis', 1, { high: true, low: true, null: false });

// DED 2/10 - High + Low
addDED('Angel Creo-Corp Mining', 'Angel Cartel', 2, { high: true, low: true, null: false });
addDED('Blood Raider Human Farm', 'Blood Raiders', 2, { high: true, low: true, null: false });
addDED('Pith Merchant Depot', 'Guristas Pirates', 2, { high: true, low: true, null: false });
addDED('Sansha Acclimatization Facility', "Sansha's Nation", 2, { high: true, low: true, null: false });
addDED('Serpentis Live Cargo Distribution Facilities', 'Serpentis', 2, { high: true, low: true, null: false });
addDED('Rogue Drone Infestation Sprout', 'Rogue Drones', 2, { high: true, low: true, null: false });

// DED 3/10 - High + Low (missing ones only)
addDED('Blood Raider Intelligence Collection Point', 'Blood Raiders', 3, { high: true, low: true, null: false });
addDED('Guristas Guerilla Grounds', 'Guristas Pirates', 3, { high: true, low: true, null: false });

// DED 4/10 - High + Low (missing ones only)
addDED('Angel Cartel Occupied Mining Colony', 'Angel Cartel', 4, { high: true, low: true, null: false });
// Mul-Zatah Monastery - EXISTS (Blood, tier: 3)
// Guristas Scout Outpost - EXISTS
addDED("Sansha's Nation Occupied Mining Colony", "Sansha's Nation", 4, { high: true, low: true, null: false });
addDED('Serpentis Phi-Outpost', 'Serpentis', 4, { high: true, low: true, null: false });
addDED('Drone Infested Mine', 'Rogue Drones', 4, { high: true, low: true, null: false });

// ===== 4. TRIGLAVIAN & EDENCOM SITES =====

function addTriglavian(name, faction, space) {
  if (exists(name)) return;
  newEntries.push({
    name,
    faction,
    tier: 0,
    level: null,
    space,
    page: name.replace(/'/g, '%27').replace(/ /g, '_'),
    escalation: null
  });
}

const triglavianSites = [
  ['Emerging Conduit', 'Rogue Drones', { high: false, low: false, null: true }],
  ['Minor Conduit', 'Rogue Drones', { high: false, low: false, null: true }],
  ['Major Conduit', 'Rogue Drones', { high: false, low: false, null: true }],
  ['Stellar Fleet Deployment Site', 'Rogue Drones', { high: false, low: false, null: true }],
  ['World Ark Deployment Site', 'Rogue Drones', { high: false, low: false, null: true }],
  ['EDENCOM Forward Post', 'Rogue Drones', { high: false, low: false, null: true }],
  ['EDENCOM Staging Area', 'Rogue Drones', { high: false, low: false, null: true }],
  ['EDENCOM Field Base', 'Rogue Drones', { high: false, low: false, null: true }],
  ['Observatory Flashpoint', 'Rogue Drones', { high: false, low: false, null: true }],
];
for (const [n, f, s] of triglavianSites) {
  addTriglavian(n, f, s);
}

// ===== 5. BESIEGED COVERT RESEARCH FACILITY =====
if (!exists('Besieged Covert Research Facility')) {
  newEntries.push({
    name: 'Besieged Covert Research Facility',
    faction: 'Guristas Pirates',
    tier: 0,
    level: null,
    space: { high: false, low: true, null: false },
    page: 'Besieged_Covert_Research_Facility',
    escalation: null
  });
}

// ===== 6. CHEMICAL LABS =====

const chemLabs = [
  // Angel Cartel
  ['Angel Chemical Lab', 'Angel Cartel', { high: false, low: true, null: false }],
  ['Angel Gas Processing Site', 'Angel Cartel', { high: false, low: true, null: false }],
  ['Elohim Sooth Sayer Distribution Base', 'Angel Cartel', { high: false, low: true, null: false }],
  ['Elohim X-Instinct Distribution Base', 'Angel Cartel', { high: false, low: true, null: false }],
  ['Elohim Sooth Sayer Production Facility', 'Angel Cartel', { high: false, low: false, null: true }],
  ['Elohim X-Instinct Production Facility', 'Angel Cartel', { high: false, low: false, null: true }],
  ['Digital Matrix', 'Angel Cartel', { high: false, low: false, null: true }],
  ['Digital Network', 'Angel Cartel', { high: false, low: false, null: true }],
  // Blood Raiders
  ['Blood Raider Chemical Lab', 'Blood Raiders', { high: false, low: true, null: false }],
  ['Blood Raider Gas Processing Site', 'Blood Raiders', { high: false, low: true, null: false }],
  ['CHAIN Mindflood Distribution Base', 'Blood Raiders', { high: false, low: true, null: false }],
  ['CHAIN Mindflood Production Facility', 'Blood Raiders', { high: false, low: false, null: true }],
  ['Digital Complex', 'Blood Raiders', { high: false, low: false, null: true }],
  // Guristas
  ['Guristas Chemical Lab', 'Guristas Pirates', { high: false, low: true, null: false }],
  ['Guristas Gas Processing Site', 'Guristas Pirates', { high: false, low: true, null: false }],
  ['H-PA Crew Blue Pill Distribution Base', 'Guristas Pirates', { high: false, low: true, null: false }],
  ['H-PA Crew Crash Distribution Base', 'Guristas Pirates', { high: false, low: true, null: false }],
  ['H-PA Crew Blue Pill Production Facility', 'Guristas Pirates', { high: false, low: false, null: true }],
  ['H-PA Crew Crash Production Facility', 'Guristas Pirates', { high: false, low: false, null: true }],
  ['Digital Plexus', 'Guristas Pirates', { high: false, low: false, null: true }],
  ['Digital Convolution', 'Guristas Pirates', { high: false, low: false, null: true }],
  // Sansha
  ['Sansha Chemical Lab', "Sansha's Nation", { high: false, low: true, null: false }],
  ['Sansha Gas Processing Site', "Sansha's Nation", { high: false, low: true, null: false }],
  ['PDW-09FX Frentix Distribution Base', "Sansha's Nation", { high: false, low: true, null: false }],
  ['PDW-09FX Frentix Production Facility', "Sansha's Nation", { high: false, low: false, null: true }],
  ['Digital Circuitry', "Sansha's Nation", { high: false, low: false, null: true }],
  // Serpentis
  ['Serpentis Chemical Lab', 'Serpentis', { high: false, low: true, null: false }],
  ['Serpentis Gas Processing Site', 'Serpentis', { high: false, low: true, null: false }],
  ['Core Runner Drop Distribution', 'Serpentis', { high: false, low: true, null: false }],
  ['Core Runner Exile Distribution Base', 'Serpentis', { high: false, low: true, null: false }],
  ['Core Runner Drop Production Facility', 'Serpentis', { high: false, low: false, null: true }],
  ['Core Runner Exile Production Facility', 'Serpentis', { high: false, low: false, null: true }],
  ['Digital Compound', 'Serpentis', { high: false, low: false, null: true }],
  ['Digital Tessellation', 'Serpentis', { high: false, low: false, null: true }],
];
for (const [n, f, s] of chemLabs) {
  addUnrated(n, f, s);
}

// ===== 7. COMBAT RELIC SITES =====
const relicSites = [
  ['Ancient Ruins', { high: false, low: false, null: true }],
  ['Bloated Ruins', { high: false, low: false, null: true }],
  ['Crumbling Ruins', { high: false, low: false, null: true }],
  ['Festering Ruins', { high: false, low: false, null: true }],
  ['Forgotten Ruins', { high: false, low: false, null: true }],
  ['Hidden Ruins', { high: false, low: false, null: true }],
  ['Wispy Ruins', { high: false, low: false, null: true }],
];
for (const [n, s] of relicSites) {
  addUnrated(n, 'Rogue Drones', s);
}

// ===== 8. SPECIAL SITES =====
const specialSites = [
  ['Blood Raider Temple Complex', 'Blood Raiders', { high: false, low: true, null: true }],
  ['Blood Raider Temple Complex (The Inner Sanctum)', 'Blood Raiders', { high: false, low: false, null: true }],
  ['ISHAEKA Tactical Response HQ', 'Rogue Drones', { high: true, low: false, null: false }],
];
for (const [n, f, s] of specialSites) {
  addUnrated(n, f, s);
}

// Add all new entries
for (const entry of newEntries) {
  index.push(entry);
}

fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
console.log('Added ' + newEntries.length + ' new entries');
console.log('Total entries: ' + index.length);
