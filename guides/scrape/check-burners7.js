const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  // Check the main Burner_Mission page
  const html = await fetch('https://wiki.eveuniversity.org/Burner_Mission', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);
  const content = $('#mw-content-text').text().trim();
  console.log('Burner_Mission page: ' + content.length + ' chars');
  console.log(content.substring(0, 3000));

  // Check all tables
  console.log('\nTables:');
  $('table.wikitable').each(function(i, tbl) {
    console.log('  Table ' + i + ': ' + $(tbl).find('tr').length + ' rows');
    $(tbl).find('tr').first().find('th').each(function(j, th) {
      console.log('    th: ' + $(th).text().trim());
    });
  });
}
main().catch(console.error);
