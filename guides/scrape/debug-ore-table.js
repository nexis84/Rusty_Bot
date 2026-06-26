const fetch = require('node-fetch');
const cheerio = require('cheerio');

(async () => {
  const html = await fetch('https://wiki.eveuniversity.org/Asteroids_and_ore', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(r => r.text());
  const $ = cheerio.load(html);
  $('table.wikitable').each((i, tbl) => {
    const hdrs = [];
    $(tbl).find('tr').first().find('th,td').each((_, th) => { hdrs.push($(th).text().trim().toLowerCase()); });
    if (hdrs.includes('ore') && (hdrs.includes('size (m3)') || hdrs.some(h => h.includes('size')))) {
      console.log('=== ORE TABLE HEADERS ===', JSON.stringify(hdrs));
      $(tbl).find('tr').slice(1, 5).each((ri, row) => {
        const cells = [];
        $(row).find('td,th').each((_, td) => { cells.push($(td).text().trim().replace(/\s+/g, ' ')); });
        console.log('Row ' + ri + ':', JSON.stringify(cells));
      });
    }
  });
})();
