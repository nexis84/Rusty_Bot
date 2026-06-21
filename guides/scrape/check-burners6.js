const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  // Search EVE-Survival for burner-related pages
  const searchTerms = ['burner', 'Burner', 'BURNER'];
  for (const term of searchTerms) {
    const url = 'https://eve-survival.org/?wakka=' + encodeURIComponent(term);
    const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
    const $ = cheerio.load(html);
    const title = $('h1, h2').first().text().trim();
    const content = $('#page-content').text().trim();
    if (content.length > 100) {
      console.log(term + ': ' + content.substring(0, 500));
    } else {
      console.log(term + ': ' + title + ' (empty, ' + content.length + ' chars)');
    }
  }

  // Search UniWiki for mission pages containing "burner"
  const cheerio2 = cheerio;
  const searchUrl = 'https://wiki.eveuniversity.org/index.php?title=Special:Search&search=burner+mission&fulltext=1';
  const searchHtml = await fetch(searchUrl, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $3 = cheerio2.load(searchHtml);
  const results = $3('.mw-search-result-heading a').map(function(i, a) { return $3(a).text().trim() + ' -> ' + $3(a).attr('href'); }).get();
  console.log('\nUniWiki search results for "burner mission": ' + results.length);
  results.slice(0, 20).forEach(function(r) { console.log('  ' + r); });
}
main().catch(console.error);
