const fetch = require('node-fetch');
const cheerio = require('cheerio');
async function main() {
  const html = await fetch('https://eve-survival.org/?wakka=MissionReports').then(function(r) { return r.text(); });
  const $ = cheerio.load(html);
  console.log('Tables with class data: ' + $('table.data').length);
  $('table.data').each(function(i, tbl) {
    const caption = $(tbl).find('caption').text().trim();
    console.log('Table ' + i + ' caption: ' + caption.substring(0, 100));
    $(tbl).find('tr').slice(0, 3).each(function(j, row) {
      console.log('  Row ' + j + ': ' + $(row).text().trim().substring(0, 120));
    });
    console.log('  Total rows: ' + $(tbl).find('tr').length);
  });

  console.log('\nAny mention of Burner: ' + ($('body').text().toLowerCase().includes('burner')));
  const links = $('a[href*="burner"]').map(function(i, a) { return $(a).attr('href') + ' -> ' + $(a).text().trim(); }).get();
  console.log('Burner links: ' + links.length);
  links.forEach(function(l) { console.log('  ' + l); });

  // Check for other page names
  console.log('\nSearching for burner wakka pages...');
  const allLinks = $('a[href*="wakka"]').map(function(i, a) { return $(a).attr('href'); }).get();
  const burnerLinks = allLinks.filter(function(h) { return h && h.toLowerCase().includes('burner'); });
  console.log('Wakka links mentioning burner: ' + burnerLinks.length);
  burnerLinks.forEach(function(l) { console.log('  ' + l); });
}
main().catch(console.error);
