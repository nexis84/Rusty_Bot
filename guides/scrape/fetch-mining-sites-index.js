const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';
const DATA_DIR = path.join(__dirname, '..', 'data');

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } });
  return await res.text();
}

async function main() {
  console.log('Fetching Category:Ore_sites...');
  const html = await fetchPage(UNIWIKI + '/Category:Ore_sites');
  const $ = cheerio.load(html);

  const sites = [];
  // Pages in category are listed in #mw-pages div
  $('#mw-pages a').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const name = $a.text().trim();
    if (name && href && !href.includes('Category:') && !href.includes('index.php') && !href.includes('File:')) {
      let page = href.replace(/^\/+/, '').split('?')[0].split('#')[0];
      if (page) {
        sites.push({ name, page });
      }
    }
  });

  console.log('Found ' + sites.length + ' ore site pages');
  const outPath = path.join(DATA_DIR, 'mining-sites-index.json');
  fs.writeFileSync(outPath, JSON.stringify(sites, null, 2));
  console.log('Wrote ' + outPath);
}

main().catch(console.error);
