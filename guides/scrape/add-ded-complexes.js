const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

const existingPages = new Set(index.map(e => e.page));

const newEntries = [];
for (const entry of index) {
  if (!entry.escalation || !entry.escalation.page) continue;
  const escPage = entry.escalation.page;
  // Check if already in index
  let found = false;
  for (const existing of index) {
    if (existing.page === escPage) { found = true; break; }
    // Try URL-decoded comparison
    let dec = escPage;
    try { dec = decodeURIComponent(escPage); } catch (e) { /* skip */ }
    if (existing.page === dec) { found = true; break; }
  }
  if (found) continue;

  // Derive name from page
  let name = escPage;
  try { name = decodeURIComponent(escPage); } catch (e) { /* skip */ }
  name = name.replace(/_/g, ' ');

  // Extract DED level from name (e.g., "Angel's Red Light District" -> no level)
  // Or from page if it has DED info
  const dedMatch = escPage.match(/\((\d+)\/10\)/);
  const level = dedMatch ? parseInt(dedMatch[1]) : null;

  // Try to get tier from the source entry
  const tier = entry.tier || null;

  newEntries.push({
    name,
    faction: entry.faction,
    tier,
    level,
    space: { ...entry.space },
    page: escPage,
    escalation: null
  });
}

console.log('New DED complex entries to add: ' + newEntries.length);

// Add new entries
const updated = [...index, ...newEntries];

// Deduplicate by page+faction
const seen = new Set();
const deduped = [];
for (const e of updated) {
  const key = e.page + '|' + (e.faction || '');
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(e);
}

fs.writeFileSync(indexPath, JSON.stringify(deduped, null, 2));
console.log('Updated index: ' + index.length + ' -> ' + deduped.length + ' entries');

// Show some new entries
console.log('\nSample new entries:');
newEntries.slice(0, 5).forEach(e => console.log('  ' + e.name + ' [' + e.faction + '] tier=' + e.tier + ' page=' + e.page));
