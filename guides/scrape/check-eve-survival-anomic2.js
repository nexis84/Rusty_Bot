const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  // Check the showcode view to see raw content
  var url = 'https://eve-survival.org/?wakka=AnomicTeam4ga/showcode';
  var html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  var $ = cheerio.load(html);
  var content = $('#page-content').text().trim();
  console.log('AnomicTeam4ga source content:');
  console.log(content.substring(0, 3000));

  // Check the rendered content variant
  console.log('\n\n--- Trying raw text variant ---');
  var url2 = 'https://eve-survival.org/?wakka=AnomicTeam4ga';
  var html2 = await fetch(url2, { headers: { 'User-Agent': 'RustyBot/1.0', 'Accept': 'text/plain' } }).then(function(r) { return r.text(); });
  console.log(html2.substring(0, 2000));
}
main().catch(console.error);
