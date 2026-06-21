const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const EVE_SURVIVAL = 'https://eve-survival.org/';
const UNIWIKI = 'https://wiki.eveuniversity.org';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== EVE-Survival parser (same as before) =====
function extractSurvivalInfo(text) {
  const fields = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^(Faction|Location|Damage Dealt|Damage dealt|Web\/?\s*Scramble|Recommended Damage Dealing|Recommended damage dealing|Ship classes|Ships to use)\s*:\s*(.+)$/i);
    if (m) fields[m[1].trim()] = m[2].trim();
  }
  return fields;
}

function extractPockets($, content) {
  const pockets = [];
  let cur = null;
  content.contents().each((_, node) => {
    if (node.type === 'tag') {
      const text = $(node).text().trim();
      if (['h3', 'h4', 'h5'].includes(node.name)) {
        if (cur) pockets.push(cur);
        cur = { heading: text, level: node.name, lines: [] };
      } else if (cur && node.name !== 'hr' && node.name !== 'a') {
        if (text && text.length > 1) cur.lines.push(text);
      }
    } else if (node.type === 'text') {
      const text = $(node).text().trim();
      if (cur && text) {
        text.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
          if (line.length > 1 && !line.startsWith('[')) cur.lines.push(line);
        });
      }
    }
  });
  if (cur) pockets.push(cur);
  return pockets;
}

async function fetchSurvival(name) {
  const html = await fetch(EVE_SURVIVAL + '?wakka=' + encodeURIComponent(name)).then(r => r.text());
  const $ = cheerio.load(html);
  const content = $('#content');
  if (!content.length) return null;
  const title = content.find('h1').first().text().trim();
  const clone = content.clone();
  clone.find('h3, h4, h5, hr').remove();
  const info = extractSurvivalInfo(clone.text());
  const pockets = extractPockets($, content);
  let tips = '', loot = '';
  content.find('h5').each((_, h5) => {
    const t = $(h5).text().trim().toLowerCase();
    let sib = $(h5).next();
    const chunks = [];
    while (sib.length && !['h3', 'h4', 'h5', 'hr'].includes((sib.prop('tagName') || '').toLowerCase())) {
      const txt = sib.text().trim();
      if (txt && txt.length > 1) chunks.push(txt);
      sib = sib.next();
    }
    const combined = chunks.join('\n');
    if (/tip|note|advice/.test(t)) tips = combined;
    if (/loot|bounty|salvage|reward/.test(t)) loot = combined;
  });
  return { pageName: name, title, info, pockets, tips, loot };
}

// ===== EVE UniWiki parser =====
async function fetchUniWiki(page) {
  const url = UNIWIKI + '/' + encodeURIComponent(page);
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  // Infobox
  const info = {};
  $('.infobox table tr').each((_, row) => {
    const cells = $(row).find('th, td');
    if (cells.length >= 2) {
      const key = cells.eq(0).text().trim();
      const val = cells.eq(1).text().trim();
      if (key && val) info[key] = val;
    }
  });

  // Description
  const descs = [];
  $('#mw-content-text > .mw-parser-output > p').each((_, p) => {
    const t = $(p).text().trim();
    if (t && t.length > 20 && !t.startsWith('[')) descs.push(t);
  });

  // Walkthrough sections
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

  // NPC tables
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

// ===== MAIN =====
async function main() {
  const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  // Collect all EVE-Survival page names from index
  const uniquePages = new Set();
  for (const e of index) {
    let key = (e.page || '').replace(/_/g, '');
    try { key = decodeURIComponent(key); } catch (e2) { /* skip */ }
    key = key.replace(/\s+/g, '');
    if (key) uniquePages.add(key);
  }
  const pages = [...uniquePages].sort();
  console.log('Total unique pages: ' + pages.length);

  // Load existing EVE-Survival cache
  const survPath = path.join(__dirname, '..', 'data', 'anomalies.json');
  let survData = {};
  if (fs.existsSync(survPath)) {
    try { survData = JSON.parse(fs.readFileSync(survPath, 'utf8')); } catch (e) { /* ignore */ }
  }
  console.log('Cached EVE-Survival pages: ' + Object.keys(survData).length);

  // Fetch missing EVE-Survival pages
  const toFetchSurvival = pages.filter(p => !survData[p]);
  console.log('Fetching ' + toFetchSurvival.length + ' new pages from EVE-Survival...');
  let survCount = Object.keys(survData).length;

  for (let i = 0; i < toFetchSurvival.length; i += 3) {
    await Promise.all(toFetchSurvival.slice(i, i + 3).map(async (name) => {
      try {
        await sleep(500);
        const d = await fetchSurvival(name);
        if (d) {
          survData[name] = d;
          survCount++;
          process.stdout.write('\rEVE-Survival: ' + survCount + '/' + pages.length);
        }
      } catch (err) {
        // Page doesn't exist, skip silently
      }
    }));
  }

  console.log('\nSaving EVE-Survival data...');
  fs.writeFileSync(survPath, JSON.stringify(survData, null, 2));
  const survTotal = Object.keys(survData).length;
  console.log('EVE-Survival: ' + survTotal + ' pages');

  // Now fetch UniWiki for pages missing EVE-Survival data
  const uniPath = path.join(__dirname, '..', 'data', 'anomalies-uniwiki.json');
  let uniData = {};
  if (fs.existsSync(uniPath)) {
    try { uniData = JSON.parse(fs.readFileSync(uniPath, 'utf8')); } catch (e) { /* ignore */ }
  }

  // Collect all UniWiki page names from index
  const uniPages = [...new Set(index.map(e => e.page).filter(Boolean))].sort();
  const missingUni = uniPages.filter(p => {
    let key = p.replace(/_/g, '');
    try { key = decodeURIComponent(key); } catch (e2) { /* skip */ }
    key = key.replace(/\s+/g, '');
    return !survData[key] && !uniData[p];
  });

  console.log('Fetching ' + missingUni.length + ' missing pages from EVE UniWiki...');
  let uniCount = Object.keys(uniData).length;

  for (let i = 0; i < missingUni.length; i += 3) {
    await Promise.all(missingUni.slice(i, i + 3).map(async (page) => {
      try {
        await sleep(1200);
        const d = await fetchUniWiki(page);
        if (d) {
          uniData[page] = d;
          uniCount++;
          process.stdout.write('\rUniWiki: ' + uniCount + '/' + missingUni.length);
        }
      } catch (err) {
        process.stdout.write('\nFailed: ' + page + ' - ' + err.message);
      }
    }));
  }

  console.log('\nSaving UniWiki data...');
  fs.writeFileSync(uniPath, JSON.stringify(uniData, null, 2));
  console.log('UniWiki: ' + Object.keys(uniData).length + ' pages');
  console.log('Total with detail data: ' + survTotal + ' (EVE-Survival) + ' + Object.keys(uniData).length + ' (UniWiki)');
}

main().catch(console.error);
