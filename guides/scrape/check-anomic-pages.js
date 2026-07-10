const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const pages = [
    '/Anomic_Agent_(Angel)',
    '/Anomic_Team_(Caldari)',
    '/Anomic_Base_(Serpentis)'
  ];
  for (const p of pages) {
    const url = 'https://wiki.eveuniversity.org' + p;
    const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
    const $ = cheerio.load(html);

    console.log('=== ' + decodeURIComponent(p) + ' ===');
    console.log('Title: ' + $('h1').first().text().trim());

    // Check infobox
    console.log('Infobox rows: ' + $('.infobox tr').length);
    $('.infobox tr').each(function(i, row) {
      var th = $(row).find('th').first().text().trim();
      var td = $(row).find('td').first().text().trim();
      if (th && td) console.log('  ' + th + ' = ' + td);
    });

    // Check wikitable tables
    console.log('Wikitable tables: ' + $('table.wikitable').length);
    $('table.wikitable').each(function(i, tbl) {
      console.log('  Table ' + i + ': ' + $(tbl).find('tr').length + ' rows');
      $(tbl).find('tr').first().find('th').each(function(j, th) {
        console.log('    th: ' + $(th).text().trim());
      });
    });

    // Check sections
    console.log('Sections:');
    $('#mw-content-text h2').each(function(i, h) {
      console.log('  ' + $(h).text().trim());
    });
    $('#mw-content-text h3').each(function(i, h) {
      console.log('    ' + $(h).text().trim());
    });
    console.log('');
  }
}
main().catch(console.error);
