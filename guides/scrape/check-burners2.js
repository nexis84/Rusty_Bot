const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  // Try EVE-Survival BurnerMissions
  try {
    const html = await fetch('https://eve-survival.org/?wakka=BurnerMissions', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
    const $ = cheerio.load(html);
    console.log('EVE-Survival BurnerMissions page: ' + html.length + ' bytes');
    console.log('Has table data: ' + $('table.data').length);
    if ($('table.data').length) {
      $('table.data').each(function(i, tbl) {
        console.log('Table ' + i + ' rows: ' + $(tbl).find('tr').length);
        $(tbl).find('tr').slice(0, 3).each(function(j, row) {
          console.log('  Row ' + j + ': ' + $(row).text().trim().substring(0, 120));
        });
      });
    }
    // Check if it redirected or is a search page
    const title = $('h1, h2').first().text().trim();
    console.log('Title: ' + title);
  } catch(e) {
    console.log('EVE-Survival BurnerMissions error: ' + e.message);
  }

  // Try EVE UniWiki
  try {
    const html2 = await fetch('https://wiki.eveuniversity.org/Burner_missions', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
    const $2 = cheerio.load(html2);
    console.log('\nUniWiki Burner missions page: ' + html2.length + ' bytes');
    console.log('Title: ' + $2('h1').first().text().trim());
    const tables = $2('table.wikitable');
    console.log('Wikitable count: ' + tables.length);
    tables.each(function(i, tbl) {
      console.log('  Table ' + i + ': ' + $(tbl).find('tr').length + ' rows, header: ' + $(tbl).find('th').first().text().trim().substring(0, 60));
    });
  } catch(e) {
    console.log('UniWiki error: ' + e.message);
  }
}
main().catch(console.error);
