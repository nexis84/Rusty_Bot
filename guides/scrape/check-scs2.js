const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const url = 'https://wiki.eveuniversity.org/' + encodeURIComponent(decodeURIComponent('Serpentis_Capital_Staging'));
  const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);

  // Get all text content in mw-parser-output
  $('#mw-content-text > .mw-parser-output').children().each(function(i, el) {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'table') {
      const cls = $(el).attr('class') || '';
      console.log('[' + i + '] <table class="' + cls + '"> ' + $(el).find('tr').length + ' rows');
    } else if (tag === 'p') {
      console.log('[' + i + '] <p> ' + $(el).text().trim().substring(0, 120));
    } else if (tag === 'h2') {
      console.log('[' + i + '] <h2> ' + $(el).text().trim());
    } else if (tag === 'h3') {
      console.log('[' + i + '] <h3> ' + $(el).text().trim());
    } else if (tag === 'ul') {
      console.log('[' + i + '] <ul> ' + $(el).find('li').length + ' items');
    } else {
      console.log('[' + i + '] <' + tag + '> ' + $(el).text().trim().substring(0, 80));
    }
  });
}
main().catch(console.error);
