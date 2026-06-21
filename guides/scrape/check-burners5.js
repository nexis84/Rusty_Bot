const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const html = await fetch('https://wiki.eveuniversity.org/Burner_missions', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);

  // Print raw HTML of the content area
  console.log($('#mw-content-text').html().substring(0, 3000));
}
main().catch(console.error);
