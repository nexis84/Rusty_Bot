const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  var missingPages = [
    'AnomicAgent4gu',
    'AnomicBase4an',
    'AnomicBase4bl', 
    'AnomicBase4ca',
    'AnomicBase4se'
  ];
  for (var w of missingPages) {
    var url = 'https://eve-survival.org/?wakka=' + w;
    var res = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } });
    var html = await res.text();
    var $ = cheerio.load(html);
    var title = $('h1').first().text().trim() || $('h2').first().text().trim();
    var contentLen = $('#content').text().trim().length;
    console.log(w + ' -> status=' + res.status + ', title=' + title + ', contentLen=' + contentLen);
  }
}
main().catch(console.error);
