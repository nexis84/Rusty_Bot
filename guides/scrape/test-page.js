const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const url = 'https://wiki.eveuniversity.org/' + encodeURIComponent(decodeURIComponent('Sansha%27s_Command_Relay_Outpost'));
  const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(r => r.text());
  const $ = cheerio.load(html);

  console.log('Title: ' + $('h1').first().text().trim());
  console.log('Infobox tables: ' + $('.infobox').length);
  console.log('Infobox rows: ' + $('.infobox tr').length);

  $('.infobox tr').each((i, row) => {
    const th = $(row).find('th').first().text().trim();
    const td = $(row).find('td').first().text().trim();
    if (th && td) console.log('  [' + i + '] ' + th + ' = ' + td);
  });

  console.log('Wikitable tables (in content): ' + $('#mw-content-text table.wikitable').length);
  console.log('All wikitable tables: ' + $('table.wikitable').length);
  console.log('Redirect msg: ' + $('.redirectMsg').text().trim().substring(0, 200));
  console.log('No article text: ' + $('#noarticletext').length);
  console.log('FirstHeading: ' + $('#firstHeading').text().trim());

  // Check all tables in mw-content-text
  $('#mw-content-text table').each((i, tbl) => {
    const cls = $(tbl).attr('class') || 'none';
    console.log('Content Table ' + i + ': class=' + cls + ', rows=' + $(tbl).find('tr').length);
  });
}
main().catch(console.error);
