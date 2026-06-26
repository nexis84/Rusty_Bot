const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';
const DATA_DIR = path.join(__dirname, '..', 'data');

async function fetchPage(page) {
  const url = UNIWIKI + '/' + encodeURIComponent(page);
  const res = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } });
  return await res.text();
}

// Known mineral quantities per unit from game data
const MINERAL_AMOUNTS = {
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

function parseOreTable($) {
  const ores = [];
  $('table.wikitable').each((_, tbl) => {
    const hdrs = [];
    $(tbl).find('tr').first().find('th,td').each((_, th) => { hdrs.push($(th).text().trim().toLowerCase()); });
    if (hdrs.includes('ore') && (hdrs.includes('size (m3)') || hdrs.some(h => h.includes('size')))) {
      $(tbl).find('tr').slice(1).each((_, row) => {
        const cells = [];
        $(row).find('td,th').each((_, td) => { cells.push($(td).text().trim().replace(/\s+/g, ' ')); });
        if (cells.length < 2) return;
        const oreName = cells[0];
        if (!oreName || oreName.includes('Ore') || oreName === '' || oreName.includes('Base ore')) return;
        const volMatch = cells[1].match(/[\d.]+/);
        const volume = volMatch ? parseFloat(volMatch[0]) : 0;
        const mineralNames = cells[2] ? cells[2].split(',').map(s => s.trim()).filter(Boolean) : [];
        const minerals = MINERAL_AMOUNTS[oreName] || {};
        const note = cells[3] || '';
        ores.push({ name: oreName, volume, minerals, mineralNames, note });
      });
    }
  });
  return ores;
}

function parseVariantTable($) {
  const variants = {};
  $('table.wikitable').each((_, tbl) => {
    const hdrs = [];
    $(tbl).find('tr').first().find('th,td').each((_, th) => { hdrs.push($(th).text().trim().toLowerCase()); });
    if (hdrs.some(h => h.includes('base ore'))) {
      $(tbl).find('tr').slice(1).each((_, row) => {
        const cells = [];
        $(row).find('td,th').each((_, td) => { cells.push($(td).text().trim().replace(/\s+/g, ' ')); });
        if (cells.length < 2) return;
        const baseOre = cells[0];
        if (!baseOre || baseOre === '') return;
        variants[baseOre] = [];
        if (cells[1]) variants[baseOre].push({ grade: 'II', name: cells[1], multiplier: 1.05 });
        if (cells[2]) variants[baseOre].push({ grade: 'III', name: cells[2], multiplier: 1.10 });
        if (cells[3]) variants[baseOre].push({ grade: 'IV', name: cells[3], multiplier: 1.15 });
      });
    }
  });
  return variants;
}

// Known ore anomalies from the research
const KNOWN_ANOMALIES = [
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
  { name: 'Hidden Omber Deposit', space: 'high' },
  { name: 'Average Omber, Dark Ochre and Gneiss Deposit', space: 'low' },
];

async function main() {
  console.log('Fetching Asteroids_and_ore page...');
  const html = await fetchPage('Asteroids_and_ore');
  const $ = cheerio.load(html);

  console.log('Parsing ore table...');
  const ores = parseOreTable($);
  console.log('Found ' + ores.length + ' ores');

  console.log('Parsing variant table...');
  const variantMap = parseVariantTable($);
  console.log('Variant entries: ' + Object.keys(variantMap).length);

  for (const ore of ores) {
    ore.variants = variantMap[ore.name] || [];

    // Match anomalies to this ore
    ore.siteNames = [];
    for (const anomaly of KNOWN_ANOMALIES) {
      const nameLower = anomaly.name.toLowerCase();
      const oreLower = ore.name.toLowerCase();
      if (nameLower.includes(oreLower)) {
        ore.siteNames.push(anomaly.name);
      }
    }
  }

  // Also generate an ore->site map
  const oreToSiteMap = {};
  for (const ore of ores) {
    for (const siteName of ore.siteNames) {
      if (!oreToSiteMap[siteName]) oreToSiteMap[siteName] = [];
      oreToSiteMap[siteName].push(ore.name);
    }
  }

  const output = { ores, anomalies: KNOWN_ANOMALIES, oreToSiteMap };
  const outPath = path.join(DATA_DIR, 'mining-ores.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('Wrote ' + outPath);
}

main().catch(console.error);
