const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const url = 'https://wiki.eveuniversity.org/' + encodeURIComponent(decodeURIComponent('Serpentis_Capital_Staging'));
  const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);

  console.log('Title: ' + $('h1').first().text().trim());
  console.log('Redirect: ' + $('.redirectMsg').text().trim().substring(0, 200));

  $('.infobox tr').each(function(i, row) {
    const th = $(row).find('th').first().text().trim();
    const td = $(row).find('td').first().text().trim();
    if (th && td) console.log('  [' + i + '] ' + th + ' = ' + td);
  });

  $('#mw-content-text table.wikitable').each(function(i, tbl) {
    const cls = $(tbl).attr('class') || '';
    console.log('  Table ' + i + ': class=' + cls + ', rows=' + $(tbl).find('tr').length + ', header=' + $(tbl).find('th').first().text().trim().substring(0, 60));
  });
}
main().catch(console.error);
