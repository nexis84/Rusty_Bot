const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
const uniPath = path.join(__dirname, '..', 'data', 'anomalies-uniwiki.json');

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const uniData = JSON.parse(fs.readFileSync(uniPath, 'utf8'));

// Build set of existing pages in the index
const existingPages = new Set();
const existingNames = new Set();
for (const e of index) {
  if (e.page) existingPages.add(decodeURIComponent(e.page));
  if (e.name) existingNames.add(e.name.toLowerCase());
}

// Collect all unique escalation target pages and names from the index
const escalationTargets = [];
for (const e of index) {
  if (e.escalation && e.escalation.page && e.escalation.name) {
    const page = decodeURIComponent(e.escalation.page);
    // Check if this target already has its own entry in the index
    if (!existingPages.has(page)) {
      // Check if the name is already in the index
      const nameLower = e.escalation.name.toLowerCase();
      if (!existingNames.has(nameLower)) {
        escalationTargets.push({ name: e.escalation.name, page: e.escalation.page, from: e.name });
      }
    }
  }
}

console.log('Escalation targets NOT yet in index: ' + escalationTargets.length);

// Now categorize them: check if they exist in uniwiki data with Type=Expedition
// Also check if they look like expedition names vs DED complex parts
const expeditionList = [];
const otherList = [];

for (const t of escalationTargets) {
  const page = t.page;
  // Check uniwiki data
  const uniEntry = uniData[page];
  let isExpedition = false;
  if (uniEntry && uniEntry.info && uniEntry.info.Type === 'Expedition') {
    isExpedition = true;
  }
  
  // Heuristic: if the name contains "Part 2", "Part 3", "2nd Part", it's an escalation chain part
  const isChainPart = /part\s*\d|2nd/i.test(t.name);
  
  if (isExpedition) {
    expeditionList.push(t);
  } else if (!isChainPart) {
    // Assume it's an expedition if it doesn't look like a DED complex
    // DED complexes have tier in the source entry, but expedition targets don't
    expeditionList.push(t);
  } else {
    otherList.push(t);
  }
}

console.log('Likely expeditions: ' + expeditionList.length);
console.log('Escalation chain parts (skipped): ' + otherList.length);

console.log('\n=== New expedition entries to add ===');
const newEntries = [];
for (const t of expeditionList) {
  // Derive faction from the source entry
  const sourceEntry = index.find(e => e.escalation && e.escalation.page === t.page);
  const faction = sourceEntry ? sourceEntry.faction : 'Rogue Drones';
  
  // Get space from source or uniwiki
  let space = { high: false, low: false, null: false };
  if (sourceEntry && sourceEntry.space) {
    space = { ...sourceEntry.space };
  }
  
  newEntries.push({
    name: t.name,
    faction,
    tier: 0,
    level: null,
    space,
    page: t.page,
    escalation: null,
    variant: 'Normal',
    anomalyType: null,
    siteType: 'combat_complex',
    anomalySubtype: 'expedition'
  });
  
  console.log('  ' + t.name.padEnd(40) + ' (' + t.page + ')  from: ' + t.from);
}

console.log('\n=== Escalation chain parts (not added) ===');
for (const t of otherList) {
  console.log('  ' + t.name.padEnd(40) + ' (' + t.page + ')  from: ' + t.from);
}

// Also check for any entries in uniwiki that have Type=Expedition but aren't in index
console.log('\n=== UniWiki pages with Type=Expedition not in index ===');
for (const entry of Object.keys(uniData)) {
  const v = uniData[entry];
  if (v.info && v.info.Type === 'Expedition' && !existingPages.has(entry)) {
    let name = entry.replace(/_/g, ' ');
    try { name = decodeURIComponent(name); } catch (e) {}
    console.log('  ' + name.padEnd(40) + ' (' + entry + ')');
    
    // Check if already in newEntries
    const already = newEntries.some(e => e.page === entry);
    if (!already) {
      newEntries.push({
        name,
        faction: 'Rogue Drones',
        tier: 0,
        level: null,
        space: { high: false, low: false, null: true },
        page: entry,
        escalation: null,
        variant: 'Normal',
        anomalyType: null,
        siteType: 'combat_complex',
        anomalySubtype: 'expedition'
      });
    }
  }
}

// Add to index
console.log('\nTotal new entries to add: ' + newEntries.length);
for (const e of newEntries) {
  index.push(e);
}

fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
console.log('New total: ' + index.length);

// Final count
const expCount = index.filter(e => e.anomalySubtype === 'expedition').length;
console.log('Expedition entries now: ' + expCount);
