const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://wiki.eveuniversity.org';
const LIST_URL = BASE + '/Combat_site';

const FACTION_ORDER = [
  'Angel Cartel', 'Blood Raiders', 'Guristas Pirates',
  "Sansha's Nation", 'Serpentis', 'Rogue Drones'
];

async function fetchAnomalyIndex() {
  const html = await fetch(LIST_URL).then(r => r.text());
  const $ = cheerio.load(html);

  const anomalies = [];
  const table = $('table.wikitable.anomalies');
  if (!table.length) { console.error('Table not found'); return; }

  const rows = table.find('tr');
  let currentTier = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows.eq(i);
    const cells = row.find('td, th');
    const numCells = cells.length;

    if (numCells < 4) continue;

    // Skip header rows (first two rows)
    const firstTag = cells.eq(0).prop('tagName');
    if (firstTag === 'TH') continue;

    // Determine structure from cell count
    let hasTier, numFactions;

    if (numCells === 17) {
      // Tier + Level + Space(3) + 6 faction pairs(12)
      hasTier = true;
      numFactions = 6;
    } else if (numCells === 16) {
      // Level + Space(3) + 6 faction pairs(12) — Tier hidden by rowspan
      hasTier = false;
      numFactions = 6;
    } else if (numCells === 14) {
      // Level + Space(3) + 5 faction pairs(10) — Tier + Rogue Drones hidden
      hasTier = false;
      numFactions = 5;
    } else {
      continue; // Unknown layout, skip
    }

    let idx = 0;

    // Parse Tier
    if (hasTier) {
      const tierText = cells.eq(idx).text().trim();
      if (/^\d+$/.test(tierText)) currentTier = parseInt(tierText);
      idx++;
    }

    // Parse Level
    const levelText = cells.eq(idx).text().trim();
    const level = /^\d+$/.test(levelText) ? parseInt(levelText) : null;
    idx++;

    // Parse Space (3 TH cells)
    const high = cells.eq(idx).text().includes('\u2714');
    idx++;
    const low = cells.eq(idx).text().includes('\u2714');
    idx++;
    const nullSpace = cells.eq(idx).text().includes('\u2714');
    idx++;

    // Parse faction pairs
    for (let f = 0; f < numFactions; f++) {
      const nameCell = cells.eq(idx);
      const dedCell = cells.eq(idx + 1);

      const nameLink = nameCell.find('a').first();
      let name = nameLink.text().trim();
      let page = nameLink.attr('href') || '';
      page = page.replace(/^\/+/, '').replace(/[?&].*$/, '').trim();

      if (!page || !name) {
        idx += 2;
        continue;
      }

      // Skip redlink pages (non-existent)
      if (page.startsWith('index.php')) {
        idx += 2;
        continue;
      }

      // If link text is a DED level (e.g. "3/10"), derive proper name from page
      if (/^\d+\/10$/.test(name)) {
        let decoded = page;
        try { decoded = decodeURIComponent(page); } catch (e) { /* skip */ }
        name = decoded.replace(/_/g, ' ');
      }

      // Parse DED escalation
      const dedLink = dedCell.find('a').first();
      let escalation = null;
      if (dedLink.length) {
        let dedPage = dedLink.attr('href') || '';
        dedPage = dedPage.replace(/^\/+/, '').replace(/[?&].*$/, '').trim();
        const dedName = dedLink.text().trim();
        if (dedPage && dedName && dedName !== 'None' && dedName !== '?' && dedName !== 'N/A' && dedName !== '') {
          if (!dedPage.startsWith('index.php')) {
            escalation = { name: dedName, page: dedPage };
          }
        }
      }

      anomalies.push({
        name,
        faction: FACTION_ORDER[f],
        tier: currentTier,
        level: level,
        space: { high, low, null: nullSpace },
        page,
        escalation
      });

      idx += 2;
    }
  }

  // Deduplicate: keep first occurrence of each unique page+faction combination
  const seen = new Set();
  const deduped = [];
  for (const a of anomalies) {
    const key = a.page + '|' + a.faction;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  const outPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2));
  console.log('Indexed ' + deduped.length + ' anomaly entries (from ' + anomalies.length + ' raw)');
}

fetchAnomalyIndex().catch(console.error);
