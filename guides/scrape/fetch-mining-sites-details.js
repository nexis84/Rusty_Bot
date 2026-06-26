const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';
const DATA_DIR = path.join(__dirname, '..', 'data');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(page) {
  const url = UNIWIKI + '/' + encodeURIComponent(page);
  const res = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } });
  if (res.status !== 200) {
    console.error('  Failed to fetch ' + page + ': HTTP ' + res.status);
    return null;
  }
  return await res.text();
}

async function fetchOne(page, name) {
  const html = await fetchPage(page);
  if (!html) return null;
  const $ = cheerio.load(html);

  // Infobox
  const info = {};
  $('.infobox tr').each((_, row) => {
    const th = $(row).find('th').first().text().trim();
    const td = $(row).find('td').first().text().trim();
    if (th && td && th !== '' && td !== '' && th.length < 30) info[th] = td;
  });

  // Description - first significant paragraph
  let description = '';
  $('#mw-content-text > .mw-parser-output > p').each((_, p) => {
    const t = $(p).text().trim();
    if (t && t.length > 20 && !t.startsWith('[') && !t.startsWith('{{') && !description) {
      description = t;
    }
  });

  // Extract ores from the name and description
  const oreNames = [];
  const knownOres = [
    'Arkonor', 'Bistot', 'Mercoxit', 'Crokite', 'Dark Ochre', 'Gneiss',
    'Hedbergite', 'Hemorphite', 'Jaspet', 'Kernite', 'Omber',
    'Plagioclase', 'Pyroxeres', 'Scordite', 'Spodumain', 'Veldspar',
    'Ducinium', 'Eifyrium', 'Mordunium', 'Ytirium',
    'Bezdnacine', 'Rakovene', 'Talassonite',
    'Griemeer', 'Hezorime', 'Kylixium', 'Nocxite', 'Ueganite', 'Prismaticite'
  ];
  for (const ore of knownOres) {
    if (name.includes(ore) || description.includes(ore)) {
      oreNames.push(ore);
    }
  }

  // Volume info from description
  let totalVolume = null;
  const volMatch = description.match(/([\d,.]+)\s*m[³3]/);
  if (volMatch) {
    totalVolume = parseFloat(volMatch[1].replace(/,/g, ''));
  }

  // Space from infobox or description
  let space = 'Unknown';
  const spaceKeywords = [
    { kw: 'High', space: 'high' },
    { kw: 'Low', space: 'low' },
    { kw: 'Null', space: 'null' },
    { kw: 'Wormhole', space: 'wormhole' },
    { kw: 'Pochven', space: 'pochven' },
  ];
  const allText = name + ' ' + description + ' ' + JSON.stringify(info);
  const lowerAll = allText.toLowerCase();
  const spaceFound = [];
  for (const sk of spaceKeywords) {
    if (lowerAll.includes(sk.kw.toLowerCase())) {
      spaceFound.push(sk.space);
    }
  }
  if (spaceFound.length > 0) {
    space = spaceFound.join(', ');
  }

  return {
    name,
    page,
    info,
    description: description.substring(0, 500),
    ores: oreNames,
    totalVolume,
    space
  };
}

async function main() {
  // Load site index
  const indexPath = path.join(DATA_DIR, 'mining-sites-index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('Run fetch-mining-sites-index.js first');
    process.exit(1);
  }
  const sites = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  console.log('Fetching details for ' + sites.length + ' ore sites...');

  const details = {};
  let count = 0;
  for (const site of sites) {
    count++;
    console.log('[' + count + '/' + sites.length + '] ' + site.name);
    const detail = await fetchOne(site.page, site.name);
    if (detail) {
      details[site.page] = detail;
    }
    await sleep(800);
  }

  console.log('Fetched ' + Object.keys(details).length + ' site details');
  const outPath = path.join(DATA_DIR, 'mining-sites.json');
  fs.writeFileSync(outPath, JSON.stringify(details, null, 2));
  console.log('Wrote ' + outPath);
}

main().catch(console.error);
