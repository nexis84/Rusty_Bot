const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const html = await fetch('https://wiki.eveuniversity.org/Anomic_missions', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);
  
  // Get all wikitable tables
  console.log('Wikitable tables: ' + $('table.wikitable').length);
  $('table.wikitable').each(function(i, tbl) {
    console.log('\nTable ' + i + ': ' + $(tbl).find('tr').length + ' rows');
    $(tbl).find('tr').each(function(j, row) {
      var cells = [];
      $(row).find('th, td').each(function(k, cell) {
        var link = $(cell).find('a').first();
        var text = $(cell).text().trim();
        var href = link.attr('href') || '';
        if (href) cells.push(text + ' [' + href + ']');
        else cells.push(text);
      });
      if (cells.length) console.log('  Row ' + j + ': ' + cells.join(' | '));
    });
  });

  // Check all links to anomic pages
  console.log('\n\nAll links to Anomic pages:');
  $('a[href*="Anomic"]').each(function(i, a) {
    console.log('  ' + $(a).attr('href') + ' -> ' + $(a).text().trim());
  });
}
main().catch(console.error);
