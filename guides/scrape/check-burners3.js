const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const html = await fetch('https://eve-survival.org/?wakka=BurnerMissions', { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);

  // Get all content text
  const content = $('#page-content').text().trim();
  console.log('Content length: ' + content.length);
  console.log(content.substring(0, 2000));

  // Check all tables
  console.log('\nAll tables:');
  $('table').each(function(i, tbl) {
    const cls = $(tbl).attr('class') || 'none';
    console.log('  Table ' + i + ': class="' + cls + '", rows=' + $(tbl).find('tr').length);
  });

  // Check preformatted text
  console.log('\nPre tags: ' + $('pre').length);
  $('pre').each(function(i, pre) {
    console.log('  Pre ' + i + ': ' + $(pre).text().trim().substring(0, 500));
  });
}
main().catch(console.error);
