const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
  const html = await fetch('https://wiki.eveuniversity.org/Guristas_Scout_Outpost', {
    headers: { 'User-Agent': 'RustyBot/1.0' }
  }).then(r => r.text());
  const $ = cheerio.load(html);

  console.log('=== INFOBOX ===');
  // Try multiple selectors for infobox
  const infoboxSelectors = ['.infobox', 'table.infobox', '.infobox table', 'table.wikitable.infobox'];
  for (const sel of infoboxSelectors) {
    const el = $(sel);
    if (el.length) {
      console.log('Found with selector: ' + sel);
      console.log($.html(el).substring(0, 2000));
      break;
    }
  }

  // Check all tables for the first one that looks like an infobox
  console.log('\n=== ALL TABLES IN CONTENT ===');
  $('#mw-content-text table').each((i, tbl) => {
    const cls = $(tbl).attr('class') || '(none)';
    const html = $.html(tbl).substring(0, 300);
    console.log('Table ' + i + ' class=' + cls);
    console.log(html);
    console.log('---');
  });

  console.log('\n=== FIRST PARAGRAPHS ===');
  $('#mw-content-text > .mw-parser-output > p').each((i, p) => {
    const t = $(p).text().trim();
    if (t.length > 20) console.log('P' + i + ': ' + t.substring(0, 200));
  });

  console.log('\n=== ALL H2/H3 HEADINGS ===');
  $('#mw-content-text h2, #mw-content-text h3').each((i, h) => {
    const tag = h.name;
    const text = $(h).text().trim();
    console.log(tag + ': ' + text);
    // Show content after heading
    let nxt = $(h).next();
    let c = 0;
    let chunks = [];
    while (nxt.length && !['h2', 'h3'].includes((nxt.prop('tagName') || '').toLowerCase()) && c < 5) {
      const t = nxt.text().trim();
      if (t && t.length > 5) chunks.push(t.substring(0, 100));
      nxt = nxt.next();
      c++;
    }
    if (chunks.length) console.log('  preview: ' + chunks.join(' | ').substring(0, 200));
  });
}
main().catch(console.error);
