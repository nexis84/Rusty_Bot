// Merge UniWiki site data into the guide's anomaly detail cache.
// Read-only by default; pass --apply to write anomalies-uniwiki.json.
//
// Usage:
//   node merge-uniwiki-sites.js
//   node merge-uniwiki-sites.js --apply

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const UNI = path.join(DATA, 'uniwiki-sites.json');
const INDEX = path.join(DATA, 'anomalies-index.json');
const DETAIL = path.join(DATA, 'anomalies-uniwiki.json');
const REPORT = path.join(DATA, 'uniwiki-merge-report.json');

const apply = process.argv.includes('--apply');

const uniwiki = JSON.parse(fs.readFileSync(UNI, 'utf8')).sites;
const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const detail = JSON.parse(fs.readFileSync(DETAIL, 'utf8'));

function decodePage(page) {
  let p = String(page || '').replace(/_/g, ' ');
  try { p = decodeURIComponent(p); } catch { /* keep */ }
  return p;
}

function norm(s) {
  return decodePage(s)
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function baseName(s) {
  return norm(s).replace(/\b(hidden|forsaken|forlorn)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

const byExact = new Map();
const byBase = new Map();
for (const site of Object.values(uniwiki)) {
  const exact = norm(site.title);
  if (!byExact.has(exact)) byExact.set(exact, site);
  const base = baseName(site.title);
  if (!byBase.has(base)) byBase.set(base, site);
}

function findSite(entry) {
  const candidates = [entry.page, entry.name].filter(Boolean).map(norm);
  for (const c of candidates) {
    if (byExact.has(c)) return byExact.get(c);
    if (byBase.has(c)) return byBase.get(c);
    const b = baseName(c);
    if (byBase.has(b)) return byBase.get(b);
  }
  return null;
}

const TYPE_LABELS = {
  anomaly: 'Combat Anomaly',
  ded: 'DED Complex',
  cosmos: 'COSMOS Site',
  mission: 'Mission',
  wormhole: 'Wormhole Site',
  incursion: 'Incursion Site',
  homefront: 'Homefront Operation',
  expedition: 'Expedition',
};

function typeLabel(type) {
  if (!type) return '';
  return TYPE_LABELS[String(type).toLowerCase()] || String(type);
}

function infoFrom(site) {
  const ib = site.infobox || {};
  const info = {};
  const put = (key, value) => { if (value && String(value).trim()) info[key] = String(value).trim(); };
  put('Type', typeLabel(ib.type));
  put('Rating', ib.rating);
  put('Found in', ib.location);
  put('Max ship size', ib['ship limit']);
  put('Faction', ib.faction);
  put('Best damage to deal', ib.damage);
  put('Damage to resist', ib.resist);
  put('Sig. strength', ib['signature strength']);
  return info;
}

const report = {
  generatedAt: new Date().toISOString(),
  applied: apply,
  indexEntries: index.length,
  matched: 0,
  unmatched: [],
  infoAdded: 0,
  pocketsAdded: 0,
  descriptionsAdded: 0,
  untouched: 0,
};

for (const entry of index) {
  const site = findSite(entry);
  if (!site) {
    report.unmatched.push({ name: entry.name, page: entry.page });
    continue;
  }
  report.matched++;

  const key = entry.page;
  if (!key) continue;
  const existing = detail[key] || {
    pageName: key.replace(/_/g, ''),
    title: site.title,
    info: {},
    pockets: [],
    tips: '',
    loot: '',
  };
  if (!existing.info) existing.info = {};
  if (!Array.isArray(existing.pockets)) existing.pockets = [];

  let changed = false;

  const newInfo = infoFrom(site);
  for (const [k, v] of Object.entries(newInfo)) {
    if (!existing.info[k]) {
      existing.info[k] = v;
      changed = true;
      report.infoAdded++;
    }
  }

  if ((!existing.pockets.length || site.pockets.length > existing.pockets.length) && site.pockets.length) {
    existing.pockets = site.pockets;
    changed = true;
    report.pocketsAdded++;
  }

  if (!existing.description && site.description) {
    existing.description = site.description;
    changed = true;
    report.descriptionsAdded++;
  }

  if (!existing.title && site.title) {
    existing.title = site.title;
    changed = true;
  }
  if (!existing.sourceUrl && site.url) {
    existing.sourceUrl = site.url;
    changed = true;
  }

  if (!changed) report.untouched++;
  detail[key] = existing;
}

fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');

console.log(`Index entries: ${report.indexEntries}`);
console.log(`Matched UniWiki pages: ${report.matched}`);
console.log(`Unmatched: ${report.unmatched.length}`);
console.log(`Info fields added: ${report.infoAdded}`);
console.log(`Pocket sets added/upgraded: ${report.pocketsAdded}`);
console.log(`Descriptions added: ${report.descriptionsAdded}`);
console.log(`Untouched: ${report.untouched}`);
console.log(`Report: ${REPORT}`);

if (apply) {
  fs.writeFileSync(DETAIL, JSON.stringify(detail, null, 2), 'utf8');
  console.log(`Wrote ${DETAIL}`);
} else {
  console.log('Dry run only. Re-run with --apply to write anomalies-uniwiki.json.');
}
