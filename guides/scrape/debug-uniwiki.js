const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
  const html = await fetch('https://wiki.eveuniversity.org/Angel_Forsaken_Den', {
    headers: { 'User-Agent': 'RustyBot/1.0' }
  }).then(r => r.text());
  const $ = cheerio.load(html);
  
  console.log('--- ALL TABLES ---');
  $('table').each((i, tbl) => {
    const cls = $(tbl).attr('class') || '(none)';
    const rows = $(tbl).find('tr').length;
    const text = $(tbl).text().trim().substring(0, 80);
    console.log('Table ' + i + ': class=' + cls + ' rows=' + rows + ' text="' + text + '"');
  });

  console.log('\n--- INFOBOX ---');
  // Try different infobox selectors
  console.log('.infobox:', $('.infobox').length);
  console.log('.infobox table:', $('.infobox table').length);
  console.log('table.infobox:', $('table.infobox').length);
  console.log('table.wikitable.infobox:', $('table.wikitable.infobox').length);
  
  // Show any table with "infobox" in class
  $('table').each((i, tbl) => {
    const cls = $(tbl).attr('class') || '';
    if (cls.toLowerCase().includes('infobox')) {
      console.log('\nInfobox table HTML:');
      console.log($.html(tbl).substring(0, 1500));
    }
  });

  // Also check for floated right tables
  console.log('\n--- FIRST TABLE IN MW-PARSER-OUTPUT ---');
  const firstTable = $('#mw-content-text table').first();
  if (firstTable.length) {
    console.log('Class:', firstTable.attr('class'));
    console.log('HTML:', $.html(firstTable).substring(0, 1000));
  }
}
main().catch(console.error);
