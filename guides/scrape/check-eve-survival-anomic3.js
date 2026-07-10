const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  var url = 'https://eve-survival.org/?wakka=AnomicTeam4ga';
  var html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  var $ = cheerio.load(html);

  // Show full HTML structure
  console.log('Full HTML length: ' + html.length);

  // Find the content area by checking all major divs
  console.log('\nAll elements with id containing page or content:');
  $('[id*="page"], [id*="content"]').each(function(i, el) {
    var id = $(el).attr('id') || '';
    console.log('  <' + el.tagName + ' id="' + id + '"> textlen=' + $(el).text().trim().length);
  });

  // Check for the actual table data
  console.log('\nTables: ' + $('table').length);
  $('table').each(function(i, tbl) {
    console.log('  Table ' + i + ': class=' + ($(tbl).attr('class') || 'none') + ', rows=' + $(tbl).find('tr').length);
    $(tbl).find('tr').each(function(j, tr) {
      var txt = $(tr).text().trim().substring(0, 120);
      if (txt) console.log('    Row ' + j + ': ' + txt);
    });
  });

  // Check div.page
  console.log('\ndiv#page html:');
  console.log($('#page').html().substring(0, 3000));
}
main().catch(console.error);
