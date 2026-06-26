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

async function main() {
  console.log('Fetching Gas_cloud_harvesting...');
  const html = await fetchPage('Gas_cloud_harvesting');
  const $ = cheerio.load(html);

  const gasTypes = [];

  // Parse mykoserocin and cytoserocin tables
  let currentCategory = '';
  let currentFlavor = '';
  let currentBooster = '';

  $('h2, h3, h4, table.wikitable').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const text = $(el).text().trim();
      if (text === 'Mykoserocin') currentCategory = 'Mykoserocin';
      else if (text === 'Cytoserocin') currentCategory = 'Cytoserocin';
      else if (text === 'Fullerenes') currentCategory = 'Fullerenes';
      return;
    }

    if (tag === 'table' && currentCategory && currentCategory !== 'Fullerenes') {
      const $tbl = $(el);
      const rows = [];
      $tbl.find('tr').each((_, row) => {
        const cells = [];
        $(row).find('th, td').each((_, td) => {
          cells.push($(td).text().trim().replace(/\s+/g, ' '));
        });
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length < 2) return;

      const headerRow = rows[0].map(h => h.toLowerCase());

      // Detect gas flavor table
      if (headerRow.some(h => h.includes('gas flavor')) || headerRow.some(h => h.includes('flavor'))) {
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i];
          if (cells.length < 3) continue;
          const flavorCell = cells[0];
          const flavorMatch = flavorCell.match(/(\w+)\s*\/(\w+)/);
          if (flavorMatch) {
            currentFlavor = flavorMatch[1].trim();
            currentBooster = flavorMatch[2].trim();
          } else {
            currentFlavor = flavorCell.trim();
            currentBooster = '';
          }
        }
        return;
      }

      // Detect nebula table (has Location, Units per Cloud, etc.)
      if (headerRow.some(h => h.includes('location')) && headerRow.some(h => h.includes('unit'))) {
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i];
          if (cells.length < 2) continue;
          const nebulaName = cells[0];
          if (!nebulaName || nebulaName.includes('Total')) continue;

          const location = cells.length > 1 ? cells[1] : '';
          const unitsPerCloud = cells.length > 2 ? cells[2] : '';
          const totalUnits = cells.length > 3 ? cells[3] : '';
          const damage = cells.length > 4 ? cells[4] : '';
          const npcs = cells.length > 5 ? cells[5] : '';

          gasTypes.push({
            name: nebulaName,
            gasCategory: currentCategory,
            flavor: currentFlavor,
            booster: currentBooster,
            location,
            unitsPerCloud,
            totalUnits,
            damage: damage || null,
            npcs: npcs || null,
            page: nebulaName.replace(/\s+/g, '_')
          });
        }
      }
    }
  });

  // Parse fullerenes from the page text
  const fullerenes = [];
  $('table.wikitable').each((_, tbl) => {
    const $tbl = $(tbl);
    const headers = [];
    $tbl.find('tr').first().find('th, td').each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });
    if (headers.some(h => h.includes('name')) && headers.some(h => h.includes('volume'))) {
      $tbl.find('tr').slice(1).each((_, row) => {
        const cells = [];
        $(row).find('td, th').each((_, td) => {
          cells.push($(td).text().trim().replace(/\s+/g, ' '));
        });
        if (cells.length < 4) return;
        const name = cells[0];
        if (!name || name === 'Name') return;
        const volMatch = cells[1].match(/[\d.]+/);
        const volume = volMatch ? parseFloat(volMatch[0]) : 0;
        const foundIn = cells[2] || '';
        const value = cells[3] || '';
        gasTypes.push({
          name,
          gasCategory: 'Fullerenes',
          volume,
          foundIn,
          value,
          flavor: '',
          booster: '',
          page: name.replace(/\s+/g, '_')
        });
      });
    }
  });

  console.log('Found ' + gasTypes.length + ' gas types');
  const outPath = path.join(DATA_DIR, 'mining-gas.json');
  fs.writeFileSync(outPath, JSON.stringify(gasTypes, null, 2));
  console.log('Wrote ' + outPath);
}

main().catch(console.error);
