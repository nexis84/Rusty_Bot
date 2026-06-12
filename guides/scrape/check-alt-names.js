const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  // Try different naming conventions for the missing pages
  var attempts = [
    // Agent Guristas - try other naming
    { wakka: 'AnomicAgent4gu', label: 'Agent Guristas' },
    { wakka: 'AnomicAgent4GU', label: 'Agent Guristas (GU)' },
    // Base - try other naming
    { wakka: 'AnomicBase4an', label: 'Base Angel' },
    { wakka: 'AnomicBase4bl', label: 'Base Blood' },
    { wakka: 'AnomicBase4ca', label: 'Base Caldari' },
    { wakka: 'AnomicBase4se', label: 'Base Serpentis' },
    // Try with full faction names
    { wakka: 'AnomicBaseAngel', label: 'Base Angel alt' },
    { wakka: 'AnomicBaseBlood', label: 'Base Blood alt' },
    { wakka: 'AnomicBaseCaldari', label: 'Base Caldari alt' },
    { wakka: 'AnomicBaseSerpentis', label: 'Base Serpentis alt' },
    // Try with different levels
    { wakka: 'AnomicBase4Angel', label: 'Base 4 Angel' },
    { wakka: 'AnomicBase4Blood', label: 'Base 4 Blood' },
    { wakka: 'AnomicBase4Caldari', label: 'Base 4 Caldari' },
    { wakka: 'AnomicBase4Serpentis', label: 'Base 4 Serpentis' },
    // Check if these redirect
    { wakka: 'BurnerBaseAngel', label: 'Burner Base Angel' },
    { wakka: 'BurnerAgentGuristas', label: 'Burner Agent Guristas' },
  ];

  for (var a of attempts) {
    var url = 'https://eve-survival.org/?wakka=' + a.wakka;
    var res = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } });
    var html = await res.text();
    var $ = cheerio.load(html);
    var title = $('h1').first().text().trim() || $('title').text().trim();
    var contentLen = $('#content').text().trim().length;
    if (contentLen > 0) {
      console.log(a.wakka + ' (' + a.label + '): OK - contentLen=' + contentLen);
    } else {
      console.log(a.wakka + ' (' + a.label + '): EMPTY');
    }
  }
}
main().catch(console.error);
