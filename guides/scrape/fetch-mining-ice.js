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
  console.log('Fetching Ice_harvesting...');
  const html = await fetchPage('Ice_harvesting');
  const $ = cheerio.load(html);

  const iceTypes = [];

  // Find the ice refining table by looking for tables with rowspan=4 (category labels)
  $('table.wikitable').each((_, tbl) => {
    const $tbl = $(tbl);
    let hasRiceData = false;
    $tbl.find('td').each((_, td) => {
      const text = $(td).text().trim();
      if (text === 'Faction' && $(td).attr('rowspan') === '4') hasRiceData = true;
    });
    if (!hasRiceData) return;

    let currentCategory = '';
    $tbl.find('tr').each((_, row) => {
      const $row = $(row);
      // Check for category label in first cell
      const firstCell = $row.find('td, th').first();
      const firstText = firstCell.text().trim();
      if (firstText === 'Faction' && firstCell.attr('rowspan') === '4') { currentCategory = 'Faction'; return; }
      if (firstText === 'Enriched' && firstCell.attr('rowspan') === '4') { currentCategory = 'Enriched'; return; }
      if (firstText === 'Standard' && firstCell.attr('rowspan') === '4') { currentCategory = 'Standard'; return; }
      // Skip header rows
      if ($row.find('th').length > 3) return;

      // Get ice name from the second cell (first after category label)
      const cells = $row.find('td');
      if (cells.length < 4) return;
      const nameCell = cells.eq(0);
      const name = nameCell.text().trim().replace(/[‹›]/g, '').trim();
      if (!name || name.includes('File:') || name === '') return;

      // Clean the name - extract from HTML (it's wrapped in {{co|slateblue|Name}})
      const nameHtml = nameCell.html() || '';
      const nameMatch = nameHtml.match(/>([^<]+)</);
      const cleanName = nameMatch ? nameMatch[1].trim() : name;

      const hw = parseInt(cells.eq(1).text().trim()) || 0;
      const lo = parseInt(cells.eq(2).text().trim()) || 0;
      const str = parseInt(cells.eq(3).text().trim()) || 0;

      // Isotopes in cells 4-7
      let isotopeType = '';
      let isotopeAmount = 0;
      for (let ci = 4; ci < Math.min(cells.length, 8); ci++) {
        const val = parseInt(cells.eq(ci).text().trim());
        if (val > 0) {
          const isoHeaders = ['Helium', 'Nitrogen', 'Oxygen', 'Hydrogen'];
          isotopeType = isoHeaders[ci - 4] || '';
          isotopeAmount = val;
          break;
        }
      }

      let space = 'High Sec';
      if (currentCategory === 'Enriched') space = 'Null Sec';
      else if (currentCategory === 'Standard') {
        if (cleanName.includes('Glare Crust')) space = 'Low Sec';
        else if (cleanName.includes('Dark Glitter')) space = 'Low Sec';
        else space = 'Null Sec';
      }

      iceTypes.push({
        name: cleanName,
        category: currentCategory,
        heavyWater: hw,
        liquidOzone: lo,
        strontium: str,
        isotopes: isotopeType ? { type: isotopeType, amount: isotopeAmount } : null,
        space,
        page: cleanName.replace(/\s+/g, '_')
      });
    });
  });

  console.log('Found ' + iceTypes.length + ' ice types');
  const outPath = path.join(DATA_DIR, 'mining-ice.json');
  fs.writeFileSync(outPath, JSON.stringify(iceTypes, null, 2));
  console.log('Wrote ' + outPath);
}

main().catch(console.error);
