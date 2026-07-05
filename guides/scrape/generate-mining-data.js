const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ==============================
// ICE DATA
// ==============================
const iceTypes = [
  { name: 'Clear Icicle', category: 'Faction', heavyWater: 69, liquidOzone: 35, strontium: 1, isotopes: { type: 'Helium', amount: 414 }, space: 'High Sec', page: 'Clear_Icicle' },
  { name: 'White Glaze', category: 'Faction', heavyWater: 69, liquidOzone: 35, strontium: 1, isotopes: { type: 'Nitrogen', amount: 414 }, space: 'High Sec', page: 'White_Glaze' },
  { name: 'Blue Ice', category: 'Faction', heavyWater: 69, liquidOzone: 35, strontium: 1, isotopes: { type: 'Oxygen', amount: 414 }, space: 'High Sec', page: 'Blue_Ice' },
  { name: 'Glacial Mass', category: 'Faction', heavyWater: 69, liquidOzone: 35, strontium: 1, isotopes: { type: 'Hydrogen', amount: 414 }, space: 'High Sec', page: 'Glacial_Mass' },
  { name: 'Enriched Clear Icicle', category: 'Enriched', heavyWater: 104, liquidOzone: 55, strontium: 1, isotopes: { type: 'Helium', amount: 483 }, space: 'Null Sec', page: 'Enriched_Clear_Icicle' },
  { name: 'Pristine White Glaze', category: 'Enriched', heavyWater: 104, liquidOzone: 55, strontium: 1, isotopes: { type: 'Nitrogen', amount: 483 }, space: 'Null Sec', page: 'Pristine_White_Glaze' },
  { name: 'Thick Blue Ice', category: 'Enriched', heavyWater: 104, liquidOzone: 55, strontium: 1, isotopes: { type: 'Oxygen', amount: 483 }, space: 'Null Sec', page: 'Thick_Blue_Ice' },
  { name: 'Smooth Glacial Mass', category: 'Enriched', heavyWater: 104, liquidOzone: 55, strontium: 1, isotopes: { type: 'Hydrogen', amount: 483 }, space: 'Null Sec', page: 'Smooth_Glacial_Mass' },
  { name: 'Glare Crust', category: 'Standard', heavyWater: 1381, liquidOzone: 691, strontium: 35, isotopes: null, space: 'Low Sec', page: 'Glare_Crust' },
  { name: 'Dark Glitter', category: 'Standard', heavyWater: 691, liquidOzone: 1381, strontium: 69, isotopes: null, space: 'Low Sec', page: 'Dark_Glitter' },
  { name: 'Gelidus', category: 'Standard', heavyWater: 345, liquidOzone: 691, strontium: 104, isotopes: null, space: 'Null Sec', page: 'Gelidus' },
  { name: 'Krystallos', category: 'Standard', heavyWater: 173, liquidOzone: 691, strontium: 173, isotopes: null, space: 'Null Sec', page: 'Krystallos' },
];

// ==============================
// GAS DATA
// ==============================
const gasTypes = [
  // Mykoserocin
  { name: 'Lime Mykoserocin (Sister Nebula)', gasCategory: 'Mykoserocin', flavor: 'Lime', booster: 'Frentix', location: 'Aridia, Curse, Derelik, Kador, Khanid, Kor-Azor, Omist, Solitude, Wicked Creek', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Lime_Mykoserocin' },
  { name: 'Lime Mykoserocin (Helix Nebula)', gasCategory: 'Mykoserocin', flavor: 'Lime', booster: 'Frentix', location: 'Aridia, Curse, Derelik, Khanid, Kor-Azor, Solitude', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Lime_Mykoserocin' },
  { name: 'Malachite Mykoserocin (Wild Nebula)', gasCategory: 'Mykoserocin', flavor: 'Malachite', booster: 'Mindflood', location: 'Aridia, Insmother, Kor-Azor, Curse, Omist, Solitude, Tash-Murkon', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Malachite_Mykoserocin' },
  { name: 'Malachite Mykoserocin (Blackeye Nebula)', gasCategory: 'Mykoserocin', flavor: 'Malachite', booster: 'Mindflood', location: 'Aridia, Curse, Khanid, Kor-Azor, Omist, Solitude', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Malachite_Mykoserocin' },
  { name: 'Amber Mykoserocin (Sunspark Nebula)', gasCategory: 'Mykoserocin', flavor: 'Amber', booster: 'Blue Pill', location: 'Black Rise, Lonetrek, Outer Passage, Sinq Laison, The Citadel, The Forge, The Spire', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Amber_Mykoserocin' },
  { name: 'Amber Mykoserocin (Diablo Nebula)', gasCategory: 'Mykoserocin', flavor: 'Amber', booster: 'Blue Pill', location: 'Black Rise, Everyshore, Lonetrek, Outer Passage, Sinq Laison, The Citadel, The Forge, Vale of the Silent', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Amber_Mykoserocin' },
  { name: 'Golden Mykoserocin (Smoking Nebula)', gasCategory: 'Mykoserocin', flavor: 'Golden', booster: 'Crash', location: 'Black Rise, Etherium Reach, Everyshore, Lonetrek, Outer Passage, Perrigen Falls, Sinq Laison, The Citadel, The Spire', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Golden_Mykoserocin' },
  { name: 'Golden Mykoserocin (Ring Nebula)', gasCategory: 'Mykoserocin', flavor: 'Golden', booster: 'Crash', location: 'Black Rise, Etherium Reach, Everyshore, Lonetrek, Malpais, Outer Passage, Perrigen Falls, Sinq Laison, The Citadel', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Golden_Mykoserocin' },
  { name: 'Celadon Mykoserocin (Calabash Nebula)', gasCategory: 'Mykoserocin', flavor: 'Celadon', booster: 'Exile', location: 'Domain, Genesis, Placid, Solitude, Fountain (Pegasus)', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Celadon_Mykoserocin' },
  { name: 'Celadon Mykoserocin (Glass Nebula)', gasCategory: 'Mykoserocin', flavor: 'Celadon', booster: 'Exile', location: 'Domain, Solitude, Pure Blind, Placid, Genesis', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Celadon_Mykoserocin' },
  { name: 'Viridian Mykoserocin (Bright Nebula)', gasCategory: 'Mykoserocin', flavor: 'Viridian', booster: 'Drop', location: 'Essence, Fountain, Placid, Tenal, Venal', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Viridian_Mykoserocin' },
  { name: 'Viridian Mykoserocin (Sparking Nebula)', gasCategory: 'Mykoserocin', flavor: 'Viridian', booster: 'Drop', location: 'Domain, Essence, Fountain, Genesis, Placid, Pure Blind, Tenal', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Viridian_Mykoserocin' },
  { name: 'Azure Mykoserocin (Ghost Nebula)', gasCategory: 'Mykoserocin', flavor: 'Azure', booster: 'Sooth Sayer', location: 'Curse, Derelik, Devoid, The Bleak Lands, Heimatar, Molden Heath', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Azure_Mykoserocin' },
  { name: 'Azure Mykoserocin (Eagle Nebula)', gasCategory: 'Mykoserocin', flavor: 'Azure', booster: 'Sooth Sayer', location: 'Curse, Derelik, The Bleak Lands, Devoid, Heimatar, Insmother, Metropolis, Molden Heath, Tenerifis', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Azure_Mykoserocin' },
  { name: 'Vermillion Mykoserocin (Flame Nebula)', gasCategory: 'Mykoserocin', flavor: 'Vermillion', booster: 'X-Instinct', location: 'Curse, Derelik, Devoid, The Bleak Lands, Great Wildlands, Detorid, Heimatar, Insmother, Metropolis, Omist, Tenerifis', unitsPerCloud: '1000', space: 'High/Low Sec', page: 'Vermillion_Mykoserocin' },
  { name: 'Vermillion Mykoserocin (Pipe Nebula)', gasCategory: 'Mykoserocin', flavor: 'Vermillion', booster: 'X-Instinct', location: 'Curse, Derelik, Devoid, The Bleak Lands, Heimatar, Immensea, Metropolis, Tenerifis', unitsPerCloud: '2000', space: 'High/Low Sec', page: 'Vermillion_Mykoserocin' },
  // Fullerenes
  { name: 'C50', gasCategory: 'Fullerenes', volume: 1, foundIn: 'Barren Perimeter Reservoir / Sizable Perimeter Reservoir', value: 'Low', space: 'Wormhole', page: 'C50' },
  { name: 'C60', gasCategory: 'Fullerenes', volume: 1, foundIn: 'Token Perimeter Reservoir / Barren Perimeter Reservoir', value: 'Low', space: 'Wormhole', page: 'C60' },
  { name: 'C70', gasCategory: 'Fullerenes', volume: 1, foundIn: 'Minor Perimeter Reservoir / Token Perimeter Reservoir', value: 'Mid', space: 'Wormhole', page: 'C70' },
  { name: 'C72', gasCategory: 'Fullerenes', volume: 2, foundIn: 'Ordinary Perimeter Reservoir / Minor Perimeter Reservoir', value: 'Mid', space: 'Wormhole', page: 'C72' },
  { name: 'C84', gasCategory: 'Fullerenes', volume: 2, foundIn: 'Sizable Perimeter Reservoir / Ordinary Perimeter Reservoir', value: 'Low', space: 'Wormhole', page: 'C84' },
  { name: 'C28', gasCategory: 'Fullerenes', volume: 2, foundIn: 'Bountiful Frontier Reservoir / Vast Frontier Reservoir', value: 'Mid', space: 'Wormhole', page: 'C28' },
  { name: 'C32', gasCategory: 'Fullerenes', volume: 5, foundIn: 'Vast Frontier Reservoir / Bountiful Frontier Reservoir', value: 'Low', space: 'Wormhole', page: 'C32' },
  { name: 'C320', gasCategory: 'Fullerenes', volume: 5, foundIn: 'Instrumental Core Reservoir / Vital Core Reservoir', value: 'High', space: 'Wormhole (C5/C6)', page: 'C320' },
  { name: 'C540', gasCategory: 'Fullerenes', volume: 10, foundIn: 'Vital Core Reservoir / Instrumental Core Reservoir', value: 'High', space: 'Wormhole (C5/C6)', page: 'C540' },
];

// ==============================
// ORE DATA (same as before but with known mineral amounts)
// ==============================
const mineralAmounts = {
  'Veldspar': { tritanium: 1000 },
  'Scordite': { tritanium: 833, pyerite: 416 },
  'Pyroxeres': { pyerite: 844, mexallon: 120 },
  'Plagioclase': { tritanium: 107, mexallon: 107 },
  'Omber': { pyerite: 100, isogen: 85 },
  'Kernite': { mexallon: 386, isogen: 386 },
  'Jaspet': { mexallon: 350, nocxium: 75 },
  'Hemorphite': { isogen: 100, nocxium: 100 },
  'Hedbergite': { pyerite: 100, nocxium: 100 },
  'Gneiss': { pyerite: 1100, mexallon: 220, isogen: 110 },
  'Dark Ochre': { mexallon: 350, isogen: 350, nocxium: 100 },
  'Crokite': { pyerite: 700, mexallon: 350, nocxium: 35 },
  'Spodumain': { tritanium: 560, isogen: 120, nocxium: 21, zydrine: 8, megacyte: 4 },
  'Arkonor': { pyerite: 300, mexallon: 300, megacyte: 300 },
  'Bistot': { pyerite: 300, mexallon: 300, zydrine: 300 },
  'Mercoxit': { morphite: 300 },
  'Ducinium': { megacyte: 300 },
  'Eifyrium': { zydrine: 300 },
  'Mordunium': { pyerite: 1000 },
  'Ytirium': { isogen: 850 },
  'Bezdnacine': { tritanium: 420, isogen: 310, megacyte: 110 },
  'Rakovene': { tritanium: 420, isogen: 310, zydrine: 110 },
  'Talassonite': { tritanium: 410, nocxium: 280, megacyte: 110 },
  'Griemeer': { tritanium: 500, isogen: 300 },
  'Hezorime': { tritanium: 200, isogen: 120, zydrine: 50 },
  'Kylixium': { tritanium: 300, pyerite: 200, mexallon: 100 },
  'Nocxite': { tritanium: 250, pyerite: 150, nocxium: 80 },
  'Ueganite': { tritanium: 300, megacyte: 50 },
  'Prismaticite': { tritanium: 100, pyerite: 100, mexallon: 100, isogen: 100, nocxium: 100, zydrine: 50, megacyte: 50, morphite: 10 },
};

const variantNames = {
  'Veldspar': [{ grade: 'II', name: 'Concentrated Veldspar', multiplier: 1.05 }, { grade: 'III', name: 'Dense Veldspar', multiplier: 1.10 }, { grade: 'IV', name: 'Stable Veldspar', multiplier: 1.15 }],
  'Scordite': [{ grade: 'II', name: 'Condensed Scordite', multiplier: 1.05 }, { grade: 'III', name: 'Massive Scordite', multiplier: 1.10 }, { grade: 'IV', name: 'Glossy Scordite', multiplier: 1.15 }],
  'Pyroxeres': [{ grade: 'II', name: 'Solid Pyroxeres', multiplier: 1.05 }, { grade: 'III', name: 'Viscous Pyroxeres', multiplier: 1.10 }, { grade: 'IV', name: 'Opulent Pyroxeres', multiplier: 1.15 }],
  'Plagioclase': [{ grade: 'II', name: 'Azure Plagioclase', multiplier: 1.05 }, { grade: 'III', name: 'Rich Plagioclase', multiplier: 1.10 }, { grade: 'IV', name: 'Sparkling Plagioclase', multiplier: 1.15 }],
  'Omber': [{ grade: 'II', name: 'Silvery Omber', multiplier: 1.05 }, { grade: 'III', name: 'Golden Omber', multiplier: 1.10 }, { grade: 'IV', name: 'Platinoid Omber', multiplier: 1.15 }],
  'Kernite': [{ grade: 'II', name: 'Luminous Kernite', multiplier: 1.05 }, { grade: 'III', name: 'Fiery Kernite', multiplier: 1.10 }, { grade: 'IV', name: 'Resplendant Kernite', multiplier: 1.15 }],
  'Jaspet': [{ grade: 'II', name: 'Pure Jaspet', multiplier: 1.05 }, { grade: 'III', name: 'Pristine Jaspet', multiplier: 1.10 }, { grade: 'IV', name: 'Immaculate Jaspet', multiplier: 1.15 }],
  'Hemorphite': [{ grade: 'II', name: 'Vivid Hemorphite', multiplier: 1.05 }, { grade: 'III', name: 'Radiant Hemorphite', multiplier: 1.10 }, { grade: 'IV', name: 'Scintillating Hemorphite', multiplier: 1.15 }],
  'Hedbergite': [{ grade: 'II', name: 'Vitric Hedbergite', multiplier: 1.05 }, { grade: 'III', name: 'Glazed Hedbergite', multiplier: 1.10 }, { grade: 'IV', name: 'Lustrous Hedbergite', multiplier: 1.15 }],
  'Gneiss': [{ grade: 'II', name: 'Iridescent Gneiss', multiplier: 1.05 }, { grade: 'III', name: 'Prismatic Gneiss', multiplier: 1.10 }, { grade: 'IV', name: 'Brilliant Gneiss', multiplier: 1.15 }],
  'Dark Ochre': [{ grade: 'II', name: 'Onyx Ochre', multiplier: 1.05 }, { grade: 'III', name: 'Obsidian Ochre', multiplier: 1.10 }, { grade: 'IV', name: 'Jet Ochre', multiplier: 1.15 }],
  'Crokite': [{ grade: 'II', name: 'Sharp Crokite', multiplier: 1.05 }, { grade: 'III', name: 'Crystalline Crokite', multiplier: 1.10 }, { grade: 'IV', name: 'Pellucid Crokite', multiplier: 1.15 }],
  'Spodumain': [{ grade: 'II', name: 'Bright Spodumain', multiplier: 1.05 }, { grade: 'III', name: 'Gleaming Spodumain', multiplier: 1.10 }, { grade: 'IV', name: 'Dazzling Spodumain', multiplier: 1.15 }],
  'Arkonor': [{ grade: 'II', name: 'Crimson Arkonor', multiplier: 1.05 }, { grade: 'III', name: 'Prime Arkonor', multiplier: 1.10 }, { grade: 'IV', name: 'Flawless Arkonor', multiplier: 1.15 }],
  'Bistot': [{ grade: 'II', name: 'Triclinic Bistot', multiplier: 1.05 }, { grade: 'III', name: 'Monoclinic Bistot', multiplier: 1.10 }, { grade: 'IV', name: 'Cubic Bistot', multiplier: 1.15 }],
  'Mercoxit': [{ grade: 'II', name: 'Magma Mercoxit', multiplier: 1.05 }, { grade: 'III', name: 'Vitreous Mercoxit', multiplier: 1.10 }],
  'Ducinium': [{ grade: 'II', name: 'Noble Ducinium', multiplier: 1.05 }, { grade: 'III', name: 'Royal Ducinium', multiplier: 1.10 }, { grade: 'IV', name: 'Imperial Ducinium', multiplier: 1.15 }],
  'Eifyrium': [{ grade: 'II', name: 'Doped Eifyrium', multiplier: 1.05 }, { grade: 'III', name: 'Boosted Eifyrium', multiplier: 1.10 }, { grade: 'IV', name: 'Augmented Eifyrium', multiplier: 1.15 }],
  'Mordunium': [{ grade: 'II', name: 'Plum Mordunium', multiplier: 1.05 }, { grade: 'III', name: 'Prize Mordunium', multiplier: 1.10 }, { grade: 'IV', name: 'Plunder Mordunium', multiplier: 1.15 }],
  'Ytirium': [{ grade: 'II', name: 'Bootleg Ytirium', multiplier: 1.05 }, { grade: 'III', name: 'Firewater Ytirium', multiplier: 1.10 }, { grade: 'IV', name: 'Moonshine Ytirium', multiplier: 1.15 }],
  'Bezdnacine': [{ grade: 'II', name: 'Abyssal Bezdnacine', multiplier: 1.05 }, { grade: 'III', name: 'Hadal Bezdnacine', multiplier: 1.10 }],
  'Rakovene': [{ grade: 'II', name: 'Abyssal Rakovene', multiplier: 1.05 }, { grade: 'III', name: 'Hadal Rakovene', multiplier: 1.10 }],
  'Talassonite': [{ grade: 'II', name: 'Abyssal Talassonite', multiplier: 1.05 }, { grade: 'III', name: 'Hadal Talassonite', multiplier: 1.10 }],
  'Griemeer': [{ grade: 'II', name: 'Clear Griemeer', multiplier: 1.05 }, { grade: 'III', name: 'Inky Griemeer', multiplier: 1.10 }, { grade: 'IV', name: 'Opaque Griemeer', multiplier: 1.15 }],
  'Hezorime': [{ grade: 'II', name: 'Dull Hezorime', multiplier: 1.05 }, { grade: 'III', name: 'Serrated Hezorime', multiplier: 1.10 }, { grade: 'IV', name: 'Sharp Hezorime', multiplier: 1.15 }],
  'Kylixium': [{ grade: 'II', name: 'Kaolin Kylixium', multiplier: 1.05 }, { grade: 'III', name: 'Argil Kylixium', multiplier: 1.10 }, { grade: 'IV', name: 'Adobe Kylixium', multiplier: 1.15 }],
  'Nocxite': [{ grade: 'II', name: 'Fragrant Nocxite', multiplier: 1.05 }, { grade: 'III', name: 'Intoxicating Nocxite', multiplier: 1.10 }, { grade: 'IV', name: 'Ambrosial Nocxite', multiplier: 1.15 }],
  'Ueganite': [{ grade: 'II', name: 'Foggy Ueganite', multiplier: 1.05 }, { grade: 'III', name: 'Overcast Ueganite', multiplier: 1.10 }, { grade: 'IV', name: 'Stormy Ueganite', multiplier: 1.15 }],
};

const oreVolumes = {
  'Veldspar': 0.1, 'Scordite': 0.15, 'Pyroxeres': 0.3, 'Plagioclase': 0.35,
  'Omber': 0.6, 'Kernite': 1.2, 'Jaspet': 2, 'Hemorphite': 3, 'Hedbergite': 3,
  'Gneiss': 5, 'Dark Ochre': 8, 'Crokite': 16, 'Spodumain': 16, 'Arkonor': 16,
  'Bistot': 16, 'Mercoxit': 40, 'Ducinium': 16, 'Eifyrium': 16,
  'Mordunium': 0.1, 'Ytirium': 0.6, 'Bezdnacine': 16, 'Rakovene': 16,
  'Talassonite': 16, 'Griemeer': 0.8, 'Hezorime': 5, 'Kylixium': 1.20,
  'Nocxite': 4, 'Ueganite': 5, 'Prismaticite': 40,
};

const knownSites = [
  { name: 'Small Arkonor and Bistot Deposit', space: 'null' },
  { name: 'Medium Arkonor and Bistot Deposit', space: 'null' },
  { name: 'Average Arkonor and Bistot Deposit', space: 'null' },
  { name: 'Large Arkonor and Bistot Deposit', space: 'null' },
  { name: 'Small Bistot Deposit', space: 'null' },
  { name: 'Average Bistot Deposit', space: 'null' },
  { name: 'Large Bistot Deposit', space: 'null' },
  { name: 'Small Gneiss Deposit', space: 'low' },
  { name: 'Hidden Gneiss Deposit', space: 'low' },
  { name: 'Average Gneiss Deposit', space: 'low' },
  { name: 'Large Gneiss Deposit', space: 'low' },
  { name: 'Small Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Hidden Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Average Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Large Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Small Crokite and Dark Ochre Deposit', space: 'low' },
  { name: 'Average Crokite and Dark Ochre Deposit', space: 'low' },
  { name: 'Large Crokite and Dark Ochre Deposit', space: 'low' },
  { name: 'Small Crokite, Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Average Crokite, Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Large Crokite, Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Hidden Crokite, Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Small Hedbergite, Hemorphite and Jaspet Deposit', space: 'low' },
  { name: 'Average Hedbergite, Hemorphite and Jaspet Deposit', space: 'low' },
  { name: 'Large Hedbergite, Hemorphite and Jaspet Deposit', space: 'low' },
  { name: 'Average Jaspet Deposit', space: 'low' },
  { name: 'Small Omber Deposit', space: 'high' },
  { name: 'Hidden Omber Deposit', space: 'high' },
  { name: 'Average Omber Deposit', space: 'high' },
  { name: 'Large Omber Deposit', space: 'high' },
  { name: 'Small Kernite and Omber Deposit', space: 'high' },
  { name: 'Average Kernite and Omber Deposit', space: 'high' },
  { name: 'Large Kernite and Omber Deposit', space: 'high' },
  { name: 'Small Mordunium Deposit', space: 'high' },
  { name: 'Mordunium Deposit', space: 'low' },
  { name: 'Large Mordunium Deposit', space: 'null' },
  { name: 'Small Mercoxit Deposit', space: 'null' },
  { name: 'Average Mercoxit Deposit', space: 'null' },
  { name: 'Large Mercoxit Deposit', space: 'null' },
  { name: 'Enormous Mercoxit Deposit', space: 'null' },
  { name: 'Small Asteroid Cluster', space: 'null' },
  { name: 'Medium Asteroid Cluster', space: 'null' },
  { name: 'Large Asteroid Cluster', space: 'null' },
  { name: 'Enormous Asteroid Cluster', space: 'null' },
  { name: 'Colossal Asteroid Cluster', space: 'null' },
  { name: 'Griemeer Deposit', space: 'null' },
  { name: 'Large Griemeer Deposit', space: 'null' },
  { name: 'Kylixium Deposit', space: 'null' },
  { name: 'Large Kylixium Deposit', space: 'null' },
  { name: 'Small Ueganite Deposit', space: 'null' },
  { name: 'Ueganite Deposit', space: 'null' },
  { name: 'Large Ueganite Deposit', space: 'null' },
  { name: 'Nocxite Deposit', space: 'null' },
  { name: 'Large Nocxite Deposit', space: 'null' },
  { name: 'Veldspar Deposit', space: 'null' },
  { name: 'Large Veldspar Deposit', space: 'null' },
  { name: 'Small Hezorime Deposit', space: 'null' },
  { name: 'Hezorime Deposit', space: 'null' },
  { name: 'Large Hezorime Deposit', space: 'null' },
  { name: 'Empire Border Rare Asteroids', space: 'border' },
  { name: 'Nullsec Border Rare Asteroids', space: 'null' },
  { name: 'Nullsec Blue A0 Rare Asteroids', space: 'null' },
  { name: 'W-Space Blue A0 Rare Asteroids', space: 'wormhole' },
  { name: 'Interstitial Ore Deposit', space: 'null' },
  { name: 'Veiled Asteroid Field', space: 'null' },
  { name: 'Shattered Debris Field', space: 'wormhole' },
  { name: 'Average Omber, Dark Ochre and Gneiss Deposit', space: 'low' },
  { name: 'Average Frontier Deposit', space: 'null' },
  { name: 'Common Perimeter Deposit', space: 'null' },
  { name: 'Exceptional Core Deposit', space: 'null' },
  { name: 'Infrequent Core Deposit', space: 'null' },
  { name: 'Isolated Core Deposit', space: 'null' },
  { name: 'Ordinary Perimeter Deposit', space: 'null' },
  { name: 'Rarified Core Deposit', space: 'null' },
  { name: 'Uncommon Core Deposit', space: 'null' },
  { name: 'Unexceptional Frontier Deposit', space: 'null' },
  { name: 'Unusual Core Deposit', space: 'null' },
];

const ores = Object.keys(oreVolumes).map(name => {
  const minerals = mineralAmounts[name] || {};
  const variants = variantNames[name] || [];
  const siteNames = knownSites.filter(s => s.name.toLowerCase().includes(name.toLowerCase())).map(s => s.name);
  const mineralNames = Object.keys(minerals);
  return { name, volume: oreVolumes[name], minerals, mineralNames, variants, siteNames, note: '' };
});

const oreToSiteMap = {};
for (const ore of ores) {
  for (const siteName of ore.siteNames) {
    if (!oreToSiteMap[siteName]) oreToSiteMap[siteName] = [];
    oreToSiteMap[siteName].push(ore.name);
  }
}

// Write all data files
fs.writeFileSync(path.join(DATA_DIR, 'mining-ores.json'), JSON.stringify({ ores, anomalies: knownSites, oreToSiteMap }, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'mining-ice.json'), JSON.stringify(iceTypes, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'mining-gas.json'), JSON.stringify(gasTypes, null, 2));

console.log('Wrote mining-ores.json (' + ores.length + ' ores, ' + knownSites.length + ' sites)');
console.log('Wrote mining-ice.json (' + iceTypes.length + ' ice types)');
console.log('Wrote mining-gas.json (' + gasTypes.length + ' gas types)');
