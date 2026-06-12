const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchOne(page) {
  const url = UNIWIKI + '/' + encodeURIComponent(decodeURIComponent(page));
  const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(r => r.text());
  const $ = cheerio.load(html);

  // === Infobox: .infobox IS the table, not a wrapper ===
  const info = {};
  $('.infobox tr').each((_, row) => {
    const th = $(row).find('th').first().text().trim();
    const td = $(row).find('td').first().text().trim();
    if (th && td && th !== '' && td !== '' && th.length < 30) info[th] = td;
  });

  // === Description: first significant paragraph ===
  const descs = [];
  $('#mw-content-text > .mw-parser-output > p, #mw-content-text > .mw-parser-output > ul li').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length > 30 && !t.startsWith('[') && !t.startsWith('{{')) descs.push(t);
  });

  // === Sections (h2 + h3 content) ===
  const sections = {};
  $('#mw-content-text h2, #mw-content-text h3').each((_, h) => {
    const text = $(h).text().trim();
    const chunks = [];
    let nxt = $(h).next();
    while (nxt.length && !['h2', 'h3'].includes((nxt.prop('tagName') || '').toLowerCase())) {
      const tag = (nxt.prop('tagName') || '').toLowerCase();
      if (tag === 'table') {
        // Skip tables in sections (we capture them separately)
        nxt = nxt.next();
        continue;
      }
      const t = nxt.text().trim();
      if (t && t.length > 2) chunks.push(t);
      nxt = nxt.next();
    }
    if (chunks.length) sections[text] = chunks.join('\n');
  });

  // === NPC Tables ===
  const npcTables = [];
  $('#mw-content-text table.wikitable').each((_, tbl) => {
    const $tbl = $(tbl);
    const cls = $tbl.attr('class') || '';
    // Skip navigation/DED chain tables (collapsible with faction names)
    if (cls.includes('collapsible') && ($tbl.find('th').text().includes('DED Complexes') || $tbl.find('tr').length <= 1)) {
      return; // Skip navigation tables
    }
    // Skip loot tables (they have "Item Name" header)
    if ($tbl.find('th').first().text().trim() === 'Item Name') return;

    const rows = [];
    $tbl.find('tr').each((_, tr) => {
      const cells = [];
      $(tr).find('th, td').each((_, td) => {
        // Get raw text, cleaning up whitespace
        let text = $(td).text().trim().replace(/\s+/g, ' ');
        if (text) cells.push(text);
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length > 0) {
      // Check if first row is a section header (like "On warp in:")
      const firstHeader = rows[0][0] || '';
      if (rows.length === 1 && firstHeader.endsWith(':') && rows[0].length === 1) {
        npcTables.push({ type: 'header', text: firstHeader.replace(':', '') });
        return;
      }
      // Check if second row is a description text
      if (rows.length === 2 && rows[0].length === 1 && rows[0][0].endsWith(':') && rows[1].length <= 2) {
        npcTables.push({ type: 'desc', text: rows[1].join(' ') });
        return;
      }
      // It's a structured NPC table
      npcTables.push({ type: 'table', rows });
    }
  });

  return { page, info, description: descs.join('\n\n'), sections, npcTables };
}

async function main() {
  const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const allPages = [...new Set(index.map(e => e.page).filter(Boolean))].sort();

  const survPath = path.join(__dirname, '..', 'data', 'anomalies.json');
  const survData = JSON.parse(fs.readFileSync(survPath, 'utf8'));

  const uniPath = path.join(__dirname, '..', 'data', 'anomalies-uniwiki.json');
  let uniData = {};
  if (fs.existsSync(uniPath)) {
    try { uniData = JSON.parse(fs.readFileSync(uniPath, 'utf8')); } catch (e) {}
  }

  // Find pages that need re-fetching (those with empty info)
  const needsRefetch = allPages.filter(p => {
    const existing = uniData[p];
    if (!existing) return true; // missing entirely
    // Re-fetch if info is empty and it's a DED complex (has sections or NPC tables)
    if (existing.info && Object.keys(existing.info).length === 0 && existing.npcTables && existing.npcTables.length > 0) return true;
    return false;
  });

  console.log('Total unique pages: ' + allPages.length);
  console.log('Currently cached: ' + Object.keys(uniData).length);
  console.log('Needs re-fetch (empty infobox): ' + needsRefetch.length);

  if (needsRefetch.length === 0) {
    console.log('Nothing to update!');
    return;
  }

  console.log('Re-fetching...');
  let done = 0;
  for (let i = 0; i < needsRefetch.length; i += 3) {
    await Promise.all(needsRefetch.slice(i, i + 3).map(async (page) => {
      try {
        await sleep(1500);
        const d = await fetchOne(page);
        uniData[page] = d;
        done++;
        process.stdout.write('\r' + done + '/' + needsRefetch.length + ' (' + page + ')      ');
      } catch (err) {
        process.stdout.write('\nFailed: ' + page + ' - ' + err.message + '\n');
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
