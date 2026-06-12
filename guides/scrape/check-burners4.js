const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const html = await fetch('https://wiki.eveuniversity.org/Burner_missions', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);

  // Check all tables
  console.log('All tables:');
  $('table').each(function(i, tbl) {
    const cls = $(tbl).attr('class') || 'none';
    const txt = $(tbl).find('th').first().text().trim().substring(0, 60);
    console.log('  Table ' + i + ': class="' + cls + '", rows=' + $(tbl).find('tr').length + ', first th: ' + txt);
  });

  // Check content
  const content = $('#mw-content-text').text().trim();
  console.log('\nContent length: ' + content.length);
  console.log('Has "Burner": ' + content.toLowerCase().includes('burner'));
  console.log('Has "Mission": ' + content.toLowerCase().includes('mission'));
}
main().catch(console.error);
