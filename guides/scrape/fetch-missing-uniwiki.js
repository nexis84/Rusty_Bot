const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchOne(page) {
  const url = UNIWIKI + '/' + encodeURIComponent(page);
  const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(r => r.text());
  const $ = cheerio.load(html);

  const info = {};
  $('.infobox table tr').each((_, row) => {
    const th = $(row).find('th').first().text().trim();
    const td = $(row).find('td').first().text().trim();
    if (th && td) info[th] = td;
  });

  const descs = [];
  $('#mw-content-text > .mw-parser-output > p').each((_, p) => {
    const t = $(p).text().trim();
    if (t && t.length > 30 && !t.startsWith('[') && !t.startsWith('{{')) descs.push(t);
  });

  const sections = {};
  $('#mw-content-text h2, #mw-content-text h3').each((_, h) => {
    const text = $(h).text().trim();
    const lower = text.toLowerCase();
    if (/walkthrough|escalation|room\s+\d|wave|pocket|guide|tactic|strategy|tips?|notes?|overview|description|layout|composition|info/.test(lower)) {
      const chunks = [];
      let nxt = $(h).next();
      while (nxt.length && !['h2', 'h3'].includes((nxt.prop('tagName') || '').toLowerCase())) {
        const t = nxt.text().trim();
        if (t && t.length > 2) chunks.push(t);
        nxt = nxt.next();
      }
      if (chunks.length) sections[text] = chunks.join('\n');
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

  return { page, info, description: descs.join('\n\n'), sections, npcTables };
}

async function main() {
  const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  // All unique page names from index (including DED complexes now)
  const allPages = [...new Set(index.map(e => e.page).filter(Boolean))].sort();

  // Already have data for some
  const survPath = path.join(__dirname, '..', 'data', 'anomalies.json');
  const survData = JSON.parse(fs.readFileSync(survPath, 'utf8'));
  const haveSurvival = new Set(Object.keys(survData));

  const uniPath = path.join(__dirname, '..', 'data', 'anomalies-uniwiki.json');
  let uniData = {};
  if (fs.existsSync(uniPath)) {
    try { uniData = JSON.parse(fs.readFileSync(uniPath, 'utf8')); } catch (e) {}
  }
  const haveUniWiki = new Set(Object.keys(uniData));

  // Find missing pages
  const missing = allPages.filter(p => {
    let key = p.replace(/_/g, '');
    try { key = decodeURIComponent(key); } catch (e) {}
    key = key.replace(/\s+/g, '');
    // Skip if EVE-Survival has good data
    const surv = survData[key];
    if (surv && surv.pockets && surv.pockets.length > 0 && surv.info && Object.keys(surv.info).length > 0) return false;
    // Skip if already in UniWiki cache
    if (haveUniWiki.has(p)) return false;
    return true;
  });

  console.log('Total unique pages: ' + allPages.length);
  console.log('Already cached (UniWiki): ' + haveUniWiki.size);
  console.log('Missing (need to fetch): ' + missing.length);

  if (missing.length === 0) {
    console.log('Nothing to fetch!');
    return;
  }

  console.log('Fetching...');
  let done = 0;
  for (let i = 0; i < missing.length; i += 3) {
    await Promise.all(missing.slice(i, i + 3).map(async (page) => {
      try {
        await sleep(1500);
        const d = await fetchOne(page);
        uniData[page] = d;
        done++;
        process.stdout.write('\r' + done + '/' + missing.length + ' (' + page + ')      ');
      } catch (err) {
        process.stdout.write('\nFailed: ' + page + ' - ' + err.message + '\n');
        done++;
      }
    }));
    if (i > 0 && i % 30 === 0) {
      fs.writeFileSync(uniPath, JSON.stringify(uniData, null, 2));
    }
  }

  console.log('\nSaving...');
  fs.writeFileSync(uniPath, JSON.stringify(uniData, null, 2));
  console.log('Saved ' + Object.keys(uniData).length + ' total UniWiki detail pages');
}

main().catch(console.error);
