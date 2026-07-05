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
    let hasNpcHeader = false;
    $tbl.find('tr').each((i, tr) => {
      const cells = [];
      const allAlts = [];
      $(tr).find('th, td').each((j, td) => {
        let text = $(td).text().trim().replace(/\s+/g, ' ');
        // Detect NPC table by WD/EWAR/L header
        if (i === 0 && (text === 'WD' || text === 'EWAR' || text === 'L')) {
          hasNpcHeader = true;
        }
        // Capture image alt attributes
        const imgAlts = [];
        $(td).find('img').each((_, img) => {
          const alt = $(img).attr('alt') || '';
          if (alt) imgAlts.push(alt);
        });
        allAlts.push(imgAlts);
        // For NPC tables, skip empty cells (collapses 5-col layout to meaningful cols)
        // For other tables, preserve empty cells (including empty strings)
        if (hasNpcHeader) { if (text) cells.push(text); }
        else { cells.push(text || ''); }
      });
      // For NPC data rows, merge metadata into the description cell (index 1 for first text cell)
      if (hasNpcHeader && i > 0) {
        let descIndex = -1;
        // Find which cell index has the description (it's usually the first non-empty cell)
        let cellIdx = 0;
        $(tr).find('th, td').each((j, td) => {
          let text = $(td).text().trim().replace(/\s+/g, ' ');
          if (text && cellIdx < cells.length) {
            if (descIndex === -1) descIndex = cellIdx;
            // Append metadata as tags to the description cell
            // Check EWAR column (index 3)
            if (j === 3 && allAlts[j] && allAlts[j].length > 0) {
              const ewar = allAlts[j].filter(a => a.length > 0).join('/');
              if (ewar) cells[cellIdx] += ' [ewar:' + ewar + ']';
            }
            // Check trigger in description column (index 1)
            if (j === 1 && allAlts[j] && allAlts[j].length > 0) {
              // Filter out generic icon names and keep trigger descriptions
              const genericIcons = ['Frigate', 'Cruiser', 'Destroyer', 'Battlecruiser', 'Sentry', 'Structure', 'Commander Frigate', 'Elite Frigate', 'Acceleration Gate'];
              const triggerText = allAlts[j].filter(a => a.length > 5 && !genericIcons.includes(a)).join('; ');
              if (triggerText) cells[cellIdx] += ' [trigger:' + triggerText + ']';
            }
            // Check loot column (index 4)
            if (j === 4 && allAlts[j] && allAlts[j].length > 0) {
              const notes = allAlts[j].filter(a => a.length > 0).join('; ');
              if (notes) cells[cellIdx] += ' [note:' + notes + ']';
            }
            cellIdx++;
          } else if (!text && j === 3 && allAlts[j] && allAlts[j].length > 0) {
            // Cell had no text but has an image (EWAR icon) - need to add
            const ewar = allAlts[j].filter(a => a.length > 0).join('/');
            if (ewar && cells.length > 0) {
              cells[cells.length - 1] += ' [ewar:' + ewar + ']';
            }
          } else if (!text && j === 4 && allAlts[j] && allAlts[j].length > 0) {
            const notes = allAlts[j].filter(a => a.length > 0).join('; ');
            if (notes && cells.length > 0) {
              cells[cells.length - 1] += ' [note:' + notes + ']';
            }
          } else if (!text && j === 1 && allAlts[j] && allAlts[j].length > 0) {
            const genericIcons = ['Frigate', 'Cruiser', 'Destroyer', 'Battlecruiser', 'Sentry', 'Structure', 'Commander Frigate', 'Elite Frigate', 'Acceleration Gate'];
            const triggerText = allAlts[j].filter(a => a.length > 5 && !genericIcons.includes(a)).join('; ');
            if (triggerText && cells.length > 0) {
              cells[cells.length - 1] += ' [trigger:' + triggerText + ']';
            }
          }
        });
      }
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

  // Re-fetch specific pages that need flex-table rendering fix
  const needsRefetch = allPages.filter(p => {
    const existing = uniData[p];
    if (!existing) return true;
    // Re-fetch Mindflood (exploration logs table needs fresh data)
    if (p === 'Mindflood') return true;
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
