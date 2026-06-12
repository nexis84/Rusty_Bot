const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://eve-survival.org/';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractInfoFields(text) {
  const fields = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^(Faction|Mission type|Space type|Damage dealt|Web\/?\s*Scramble|Recommended damage dealing|Recommended ship classes|Video|Blitz|Notes)\s*:\s*(.+)$/i);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      if (key === 'Web/ Scramble' || key === 'Web/Scramble') {
        fields['Web/Scramble'] = val;
      } else {
        fields[key] = val;
      }
    }
  }
  return fields;
}

function extractPockets($, content) {
  const pockets = [];
  let currentPocket = null;

  content.contents().each((_, node) => {
    if (node.type === 'tag') {
      const tag = node.name;
      const text = $(node).text().trim();

      if (['h3', 'h4', 'h5'].includes(tag)) {
        if (currentPocket) {
          pockets.push(currentPocket);
        }
        currentPocket = {
          heading: text,
          level: tag,
          lines: []
        };
      } else if (currentPocket && tag !== 'hr') {
        const line = text;
        if (line) {
          currentPocket.lines.push(line);
        }
      }
    } else if (node.type === 'text') {
      const text = $(node).text().trim();
      if (currentPocket && text) {
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        for (const line of lines) {
          if (line && !line.includes('javascript:') && line !== '>') {
            currentPocket.lines.push(line);
          }
        }
      }
    }
  });

  if (currentPocket) {
    pockets.push(currentPocket);
  }

  return pockets;
}

function extractVideoLinks($, infoText) {
  const videoLine = infoText.find(line => line.startsWith('Video:'));
  if (!videoLine) return [];

  const videoHtml = videoLine.replace('Video:', '').trim();
  const $tmp = cheerio.load('<div>' + videoHtml + '</div>');
  const links = [];
  $tmp('a').each((_, a) => {
    links.push({
      text: $(a).text().trim(),
      url: $(a).attr('href') || ''
    });
  });
  return links;
}

async function fetchDetail(pageName) {
  const url = BASE + '?wakka=' + encodeURIComponent(pageName);
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  const content = $('#content');
  if (!content.length) return null;

  const title = content.find('h1').first().text().trim();

  const contentClone = content.clone();
  contentClone.find('h3, h4, h5, hr').remove();
  const infoText = contentClone.text();

  const infoFields = extractInfoFields(infoText);

  const pockets = extractPockets($, content);

  const videoLinks = [];
  content.find('a.ext[href*="youtu"], a.ext[href*="youtube"]').each((_, a) => {
    videoLinks.push({
      text: $(a).text().trim(),
      url: $(a).attr('href') || ''
    });
  });

  let blobText = '';
  const blobH3 = content.find('h3').filter((_, h3) => {
    const text = $(h3).text().toLowerCase();
    return text.includes('blob') || text.includes('note');
  }).first();
  if (blobH3.length) {
    blobText = '';
    let next = blobH3.next();
    while (next.length && !next.is('h3, h4, h5')) {
      blobText += next.text().trim() + '\n';
      next = next.next();
    }
  }

  let tipsText = '';
  content.find('h5').each((_, h5) => {
    const text = $(h5).text().toLowerCase();
    if (text.includes('tip') || text.includes('hint')) {
      let next = $(h5).next();
      while (next.length && !next.is('h4, h5, hr, h3')) {
        tipsText += next.text().trim() + '\n';
        next = next.next();
      }
    }
  });

  let lootText = '';
  content.find('h5').each((_, h5) => {
    const text = $(h5).text().toLowerCase();
    if (text.includes('loot') || text.includes('bounty')) {
      let next = $(h5).next();
      while (next.length && !next.is('h4, h5, hr, h3')) {
        lootText += next.text().trim() + '\n';
        next = next.next();
      }
    }
  });

  const categories = [];
  content.find('a[href*="Category"]').each((_, a) => {
    categories.push($(a).text().trim());
  });

  return {
    pageName,
    title,
    info: infoFields,
    pockets,
    videoLinks,
    blob: blobText.trim(),
    tips: tipsText.trim(),
    loot: lootText.trim(),
    categories
  };
}

async function fetchAllDetails() {
  const indexPath = path.join(__dirname, '..', 'data', 'missions-index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  const allPageNames = new Set();
  for (const entry of index) {
    for (const level of Object.values(entry.levels)) {
      allPageNames.add(level);
    }
  }

  const pageNames = [...allPageNames].sort();
  console.log(`Fetching details for ${pageNames.length} unique pages...`);

  const results = {};
  let done = 0;
  const batchSize = 3;

  for (let i = 0; i < pageNames.length; i += batchSize) {
    const batch = pageNames.slice(i, i + batchSize);
    await Promise.all(batch.map(async (name) => {
      try {
        await sleep(500);
        const detail = await fetchDetail(name);
        if (detail) {
          results[name] = detail;
        }
        done++;
        process.stdout.write(`\r${done}/${pageNames.length}`);
      } catch (err) {
        console.error(`\nFailed ${name}: ${err.message}`);
        done++;
      }
    }));
  }

  console.log('\nDone fetching.');

  const outPath = path.join(__dirname, '..', 'data', 'missions.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Saved ${Object.keys(results).length} mission details to missions.json`);
}

fetchAllDetails().catch(console.error);
