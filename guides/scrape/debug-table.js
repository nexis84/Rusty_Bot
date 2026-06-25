const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function test() {
  const html = await fetch('https://wiki.eveuniversity.org/Mindflood', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(r => r.text());
  const $ = cheerio.load(html);
  const fs = require('fs');
  fs.writeFileSync('mindflood-raw.html', html);
  console.log('Saved raw HTML to mindflood-raw.html');
  
  $('table.wikitable').each((i, tbl) => {
    const txt = $(tbl).text().trim();
    if (txt.includes('May 2020') || txt.includes('Coreli C-Type Kinetic')) {
      console.log('=== Table #' + i + ' ===');
      $(tbl).find('tr').each((r, tr) => {
        const cells = [];
        $(tr).find('th, td').each((c, td) => {
          const raw = $(td).html();
          const text = $(td).text().trim();
          cells.push('{' + (text || '(empty)') + '}');
          console.log('  td[' + c + '] html: [' + raw + '] text: [' + text + ']');
        });
        console.log('  => Row ' + r + ' (' + cells.length + ' cells)');
      });
    }
  });
}
test().catch(console.error);
