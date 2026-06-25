const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
  const html = await fetch('https://eve-survival.org/?wakka=AnomalyReports').then(r => r.text());
  const $ = cheerio.load(html);

  // Find all links on the page
  const links = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && href.includes('wakka=') && !href.includes('AnomalyReports')) {
      let page = href.replace(/^.*wakka=/, '').replace(/[&?].*$/, '').trim();
      if (page && page !== 'AnomalyReports') {
        links.push({ text, page });
      }
    }
  });

  console.log('Found ' + links.length + ' anomaly links on AnomalyReports:');
  links.forEach(l => console.log('  ' + l.text + ' -> ' + l.page));

  // Now compare with what we scraped
  const fs = require('fs');
  const path = require('path');
  const scraped = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'anomalies.json'), 'utf8')));
  
  console.log('\nScraped ' + scraped.length + ' pages');

  const missing = links.filter(l => !scraped.includes(l.page));
  if (missing.length > 0) {
    console.log('\nMissing from scrape (' + missing.length + '):');
    missing.forEach(l => console.log('  ' + l.text + ' -> ' + l.page));
  } else {
    console.log('\nAll AnomalyReports pages are scraped!');
  }
}
main().catch(console.error);
