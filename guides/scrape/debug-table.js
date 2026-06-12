const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
  const html = await fetch('https://wiki.eveuniversity.org/Combat_site').then(r => r.text());
  const $ = cheerio.load(html);
  const table = $('table.wikitable.anomalies');
  const rows = table.find('tr');
  // Show full details for row 24
  for (let i = 22; i < rows.length; i++) {
    const row = rows.eq(i);
    const cells = row.find('td, th');
    console.log('Row ' + i + ' (' + cells.length + ' cells):');
    cells.each((j, cell) => {
      const $cell = $(cell);
      const tag = $cell.prop('tagName');
      const rowspan = parseInt($cell.attr('rowspan') || '1');
      const colspan = parseInt($cell.attr('colspan') || '1');
      const hasLink = $cell.find('a').length > 0;
      const linkText = $cell.find('a').first().text().trim();
      const linkHref = $cell.find('a').first().attr('href');
      const text = $cell.text().trim().substring(0, 80);
      console.log('  [' + j + '] <' + tag + '> rs=' + rowspan + ' cs=' + colspan + ' link=' + hasLink + ' text="' + text + '"');
      if (linkHref) console.log('       href=' + linkHref);
    });
    console.log();
  }
}
main().catch(console.error);
