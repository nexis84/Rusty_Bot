const fs = require('fs');
const path = require('path');

const shipsPath = path.join(__dirname, '..', 'the-isk-is-right', 'ships.js');
const pricesPath = path.join(__dirname, '..', 'the-isk-is-right', 'prices.js');
const pricesJsonPath = path.join(__dirname, '..', 'the-isk-is-right', 'prices.json');

function readGlobalVar(filename, varName) {
  const text = fs.readFileSync(filename, 'utf8');
  const start = text.indexOf(`const ${varName} = `);
  if (start === -1) throw new Error(`Could not find const ${varName} in ${filename}`);
  let body = text.slice(start + `const ${varName} = `.length);
  // Find the matching close for the outermost bracket
  let depth = 0;
  let i = 0;
  do {
    const c = body[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    i++;
  } while (depth > 0 && i < body.length);
  body = body.slice(0, i);
  return JSON.parse(body);
}

// Also works for plain objects (prices.js)
function readGlobalVarLenient(filename, varName) {
  try { return readGlobalVar(filename, varName); }
  catch {
    const text = fs.readFileSync(filename, 'utf8');
    const match = text.match(new RegExp(`const\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*\\});`));
    if (!match) throw new Error(`Could not find ${varName} in ${filename}`);
    const fn = new Function(`return ${match[1]};`);
    return fn();
  }
}

const SHIPS = readGlobalVar(shipsPath, 'SHIPS');
const PRICE_DATA = readGlobalVarLenient(pricesPath, 'PRICE_DATA');
const existingIds = new Set(Object.keys(PRICE_DATA.prices).map(Number));

const missing = SHIPS.filter(s => !existingIds.has(s.id));
console.log(`Total ships: ${SHIPS.length}`);
console.log(`Ships with prices: ${existingIds.size}`);
console.log(`Missing prices: ${missing.length}`);
console.log('\nMissing ships:');
missing.forEach(s => console.log(`  ${s.id}: ${s.name} (${s.class}, ${s.race})`));

const ESI_BASE = 'https://esi.evetech.net/latest';
const JITA_REGION = '10000002';

async function fetchPrice(typeId) {
  const url = `${ESI_BASE}/markets/${JITA_REGION}/orders/?type_id=${typeId}&order_type=sell`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const orders = await res.json();
    if (!orders.length) return null;
    return Math.min(...orders.map(o => o.price));
  } catch { return null; }
}

async function main() {
  console.log('\nFetching missing prices from ESI (Jita)...');
  const newPrices = { ...PRICE_DATA.prices };
  let fetched = 0, failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const ship = missing[i];
    process.stdout.write(`  [${i + 1}/${missing.length}] ${ship.name}... `);
    const price = await fetchPrice(ship.id);
    if (price != null) {
      newPrices[ship.id] = price;
      fetched++;
      console.log(`${price} ISK`);
    } else {
      failed++;
      console.log('FAILED');
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nFetched: ${fetched}, Failed: ${failed}`);
  console.log(`Total prices: ${Object.keys(newPrices).length}`);

  const sortedPrices = {};
  Object.keys(newPrices).sort((a, b) => Number(a) - Number(b)).forEach(k => {
    sortedPrices[k] = newPrices[k];
  });

  const dateStr = new Date().toISOString();
  const count = Object.keys(sortedPrices).length;

  const jsContent = `const PRICE_DATA = {
  "generated": "${dateStr}",
  "count": ${count},
  "prices": ${JSON.stringify(sortedPrices, null, 2)}
};
`;

  const jsonContent = JSON.stringify({
    generated: dateStr,
    count,
    prices: sortedPrices
  }, null, 2);

  fs.writeFileSync(pricesPath, jsContent, 'utf8');
  fs.writeFileSync(pricesJsonPath, jsonContent, 'utf8');
  console.log(`\nUpdated ${pricesPath}`);
  console.log(`Updated ${pricesJsonPath}`);
}

main().catch(console.error);
