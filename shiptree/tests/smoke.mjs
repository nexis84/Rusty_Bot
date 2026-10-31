/* Ship tree smoke tests.
 *
 * Run with:  npm install && npm test
 *
 * Uses a tiny static server and the locally installed Chrome/Edge via
 * playwright-core, so no browser download is required.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: true }); } catch { /* next */ }
  }
  throw new Error('Chrome or Edge is required for the smoke tests');
}

const browser = await launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
await page.addInitScript(() => { try { localStorage.setItem('st.welcome_seen', '1'); } catch {} });
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

async function load(url = base) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#status');
  await page.waitForTimeout(200);
}

async function search(q) {
  await page.fill('#q', q);
  await page.waitForTimeout(120);
  return page.locator('#hits .hit[data-i]').allTextContents();
}

async function pick(q) {
  await page.fill('#q', q);
  await page.waitForTimeout(120);
  await page.locator('#hits .hit[data-i]').first().click();
  await page.waitForTimeout(220);
}

await load();
assert.match(await page.textContent('#status'), /425 hulls/);
assert.equal((await search('Herald'))[0], 'HeraldAmarr');
assert.match((await search('HAC'))[0], /HAC/);
assert.match((await search('armor'))[0], /Armor/);
assert.match((await search('Amarr'))[0], /Amarr/);
assert.match((await search('T2'))[0], /T2/);
assert.equal((await search('97793'))[0], 'Heraldtype ID');
assert.match((await search('herlad'))[0], /Herald/);

await pick('Herald');
assert.equal(await page.textContent('#panel h2'), 'Herald');
assert.equal(await page.locator('#panelShare').count(), 1);

// Four-hull comparison.
await page.click('#panelCompare');
await pick('Penitence');
await pick('Ishtar');
await pick('Raven');
assert.equal(await page.locator('.cmp-head').count(), 4);

// Plan cost + saved plan persistence.
await pick('Herald');
await page.click('.panel-tab[data-tab="plan"]');
await page.waitForTimeout(300);
assert.doesNotMatch(await page.textContent('#planCost'), /fetching/);
page.once('dialog', d => d.accept('Smoke test plan'));
await page.click('#planSave');
await page.waitForTimeout(200);
assert.equal(await page.locator('.saved-plan').count(), 1);

// Deep links.
await load(`${base}?q=Herald`);
assert.equal(await page.locator('#hits .hit[data-i]').count(), 1);
await load(`${base}?ship=97793&compare=97793,97904`);
assert.equal(await page.locator('.cmp-head').count(), 2);
await load(`${base}?lanes=500003`);
assert.match(await page.textContent('#status'), /1 lane/);

// Mobile filter sheet.
const mobile = await context.newPage();
await mobile.addInitScript(() => { try { localStorage.setItem('st.welcome_seen', '1'); } catch {} });
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(base, { waitUntil: 'networkidle' });
await mobile.waitForTimeout(250);
assert.equal(await mobile.locator('#filtersBtn').isVisible(), true);
await mobile.click('#filtersBtn');
assert.equal(await mobile.locator('#filterChips').isVisible(), true);
await mobile.click('#alphaBtn');
assert.equal(await mobile.locator('#alphaBtn').evaluate(el => el.classList.contains('on')), true);
await mobile.click('#filterClose');
await mobile.waitForTimeout(150);
assert.equal(await mobile.locator('#filterChips').isVisible(), false);
await mobile.close();

assert.deepEqual(errors, []);
await browser.close();
server.close();
console.log('ship tree smoke tests passed');
