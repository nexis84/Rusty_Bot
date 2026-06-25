const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';

async function fetchUniWiki(page) {
  const url = UNIWIKI + '/' + encodeURIComponent(page);
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  // Check if page exists (has content)
  const content = $('#mw-content-text .mw-parser-output');
  if (!content.length || content.text().trim().length < 10) return null;

  const info = {};
  $('.infobox table tr').each((_, row) => {
    const cells = $(row).find('th, td');
    if (cells.length >= 2) {
      const key = cells.eq(0).text().trim();
      const val = cells.eq(1).text().trim();
      if (key && val) info[key] = val;
    }
  });

  const descs = [];
  $('#mw-content-text > .mw-parser-output > p').each((_, p) => {
    const t = $(p).text().trim();
    if (t && t.length > 20 && !t.startsWith('[')) descs.push(t);
  });

  const walkthrough = {};
  $('#mw-content-text h2, #mw-content-text h3').each((_, h) => {
    const text = $(h).text().trim().toLowerCase();
    if (/walkthrough|escalation|room|wave|pocket|guide|tactic|strategy|tips?|notes?/.test(text)) {
      const chunks = [];
      let nxt = $(h).next();
      while (nxt.length && !['h2', 'h3'].includes((nxt.prop('tagName') || '').toLowerCase())) {
        const t = nxt.text().trim();
        if (t && t.length > 2) chunks.push(t);
        nxt = nxt.next();
      }
      if (chunks.length) walkthrough[$(h).text().trim()] = chunks.join('\n');
    }
  });

  const npcTables = [];
  $('#mw-content-text table.wikitable').each((_, tbl) => {
    const rows = [];
    $(tbl).find('tr').each((_, tr) => {
      const cells = [];
      $(tr).find('th, td').each((_, td) => {
        const link = $(td).find('a').first();
        const text = link.length ? link.text().trim() : $(td).text().trim();
        if (text) cells.push(text);
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length > 1) npcTables.push(rows);
  });

  return { page, info, description: descs.join('\n'), walkthrough, npcTables };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
  const uniPath = path.join(__dirname, '..', 'data', 'anomalies-uniwiki.json');
  
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  let uniData = {};
  if (fs.existsSync(uniPath)) {
    try { uniData = JSON.parse(fs.readFileSync(uniPath, 'utf8')); } catch (e) {}
  }

  // Get all page names from index not already in uniData
  const toFetch = [...new Set(index.map(e => e.page).filter(Boolean))]
    .filter(p => !uniData[p]);
  
  console.log('Fetching ' + toFetch.length + ' pages from UniWiki...');
  let count = Object.keys(uniData).length;
  let fetched = 0;

  for (let i = 0; i < toFetch.length; i += 3) {
    await Promise.all(toFetch.slice(i, i + 3).map(async (page) => {
      try {
        await sleep(1200);
        const d = await fetchUniWiki(page);
        if (d) {
          uniData[page] = d;
          count++;
          fetched++;
          process.stdout.write('\rFetched: ' + count + ', New: ' + fetched + '/' + toFetch.length);
        }
      } catch (err) {
        // Silently skip
      }
    }));
  }

  console.log('\nSaving UniWiki data...');
  fs.writeFileSync(uniPath, JSON.stringify(uniData, null, 2));
  console.log('UniWiki now has ' + Object.keys(uniData).length + ' pages');
  console.log('Newly fetched: ' + fetched);
}

main().catch(console.error);
