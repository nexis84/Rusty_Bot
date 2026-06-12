const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  // Check the specific page
  var url = 'https://eve-survival.org/?wakka=AnomicTeam4ga';
  var html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  var $ = cheerio.load(html);
  console.log('AnomicTeam4ga - title: ' + $('h1, h2').first().text().trim());
  console.log('Page content length: ' + $('#page-content').text().length);
  console.log();

  // Try to find all Anomic pages on EVE-Survival by checking a search or pattern
  // Check the sidebar/menu for links
  var links = $('a[href*="wakka=Anomic"]').map(function(i, a) { return $(a).attr('href'); }).get();
  console.log('Links to anomic pages from this page: ' + links.length);
  links.forEach(function(l) { console.log('  ' + l); });

  // Also check for any wakka page that might be useful
  var allWakka = $('a[href*="wakka="]').map(function(i, a) { return $(a).attr('href') + ' -> ' + $(a).text().trim(); }).get();
  console.log('\nAll wakka links:');
  allWakka.forEach(function(l) { console.log('  ' + l); });
}
main().catch(console.error);
