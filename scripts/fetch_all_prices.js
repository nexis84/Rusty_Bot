const fs = require('fs');
const path = require('path');

const ESI_BASE = 'https://esi.evetech.net/latest';
const JITA_REGION = '10000002';
const MAX_CONCURRENT = 20;
const BATCH_DELAY = 150;

// Parse ship IDs from ships.js
const shipsJs = fs.readFileSync(path.join(__dirname, '..', 'the-isk-is-right', 'ships.js'), 'utf8');
const idRegex = /"id":\s*(\d+)/g;
const shipIds = [];
let m;
while ((m = idRegex.exec(shipsJs)) !== null) {
  shipIds.push(parseInt(m[1], 10));
}
console.log(`Found ${shipIds.length} ships`);

async function fetchPrice(typeId) {
  try {
    const url = `${ESI_BASE}/markets/${JITA_REGION}/orders/?type_id=${typeId}&order_type=sell`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const orders = await res.json();
    if (!orders.length) return null;
    return Math.min(...orders.map(o => o.price));
  } catch (e) {
    return null;
  }
}

async function fetchAll() {
  const prices = {};
  let fetched = 0;
  for (let i = 0; i < shipIds.length; i += MAX_CONCURRENT) {
    const batch = shipIds.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(batch.map(id => fetchPrice(id)));
    for (let j = 0; j < batch.length; j++) {
      const id = batch[j];
      const price = results[j].status === 'fulfilled' ? results[j].value : null;
      if (price != null && price > 0) {
        prices[id] = price;
        fetched++;
      }
    }
    if (i + MAX_CONCURRENT < shipIds.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
    console.log(`Progress: ${fetched} / ${shipIds.length} ships priced`);
  }
  return prices;
}

(async () => {
  console.log('Fetching all ship prices from ESI...');
  const prices = await fetchAll();
  const output = {
    generated: new Date().toISOString(),
    count: Object.keys(prices).length,
    prices
  };
  const outPath = path.join(__dirname, '..', 'the-isk-is-right', 'prices.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Saved ${Object.keys(prices).length} ship prices to prices.json`);
})();
