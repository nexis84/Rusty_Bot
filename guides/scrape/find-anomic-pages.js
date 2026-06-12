const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  // Check PageIndex for anomic pages
  var url = 'https://eve-survival.org/?wakka=PageIndex';
  var html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  var $ = cheerio.load(html);
  var content = $('#content').text();

  // Find all anomic pages
  var anomicPages = [];
  $('#content a[href*="wakka="]').each(function(i, a) {
    var href = $(a).attr('href');
    var text = $(a).text().trim();
    if (href && href.toLowerCase().includes('anomic')) {
      var wakka = href.split('wakka=')[1]?.split('&')[0] || '';
      anomicPages.push({ wakka: wakka, name: text });
    }
  });

  console.log('Anomic pages found: ' + anomicPages.length);
  anomicPages.sort(function(a, b) { return a.wakka.localeCompare(b.wakka); });
  anomicPages.forEach(function(p) {
    console.log('  ' + p.wakka + ' -> ' + p.name);
  });

  // Also try to find by searching for links
  console.log('\n--- Also check CategoryBurner ---');
  var url2 = 'https://eve-survival.org/?wakka=CategoryBurner';
  var html2 = await fetch(url2, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  var $2 = cheerio.load(html2);
  var burnerPages = [];
  $2('#content a[href*="wakka="]').each(function(i, a) {
    var href = $(a).attr('href');
    var text = $(a).text().trim();
    if (href && href.toLowerCase().includes('wakka=') && !href.toLowerCase().includes('category')) {
      var wakka = href.split('wakka=')[1]?.split('&')[0] || '';
      if (wakka && wakka !== 'CategoryBurner') {
        burnerPages.push({ wakka: wakka, name: text });
      }
    }
  });
  console.log('Burner pages from CategoryBurner: ' + burnerPages.length);
  burnerPages.forEach(function(p) {
    console.log('  ' + p.wakka + ' -> ' + p.name);
  });
}
main().catch(console.error);
