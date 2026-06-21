const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'data', 'anomalies-index.json');
const uniPath = path.join(__dirname, '..', 'data', 'anomalies-uniwiki.json');

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const uniData = JSON.parse(fs.readFileSync(uniPath, 'utf8'));

// Normalize page name: names are stored with underscores, URL-encoded
function toPageName(name) {
  let n = name.trim();
  // Handle special characters
  n = n.replace(/'/g, "%27");
  n = n.replace(/&/g, "%26");
  n = n.replace(/ /g, "_");
  return n;
}

// Known mappings for complex names
const nameToPageOverrides = {
  "Angel's Red Light District": "Angel%27s_Red_Light_District",
  "Sansha's Command Relay Outpost": "Sansha%27s_Command_Relay_Outpost",
  "Sansha's Nation Neural Paralytic Facility": "Sansha%27s_Nation_Neural_Paralytic_Facility",
  "Sansha's Rally Point": "Sansha%27s_Rally_Point",
  "Pith Robux Asteroid Mining & Co.": "Pith_Robux_Asteroid_Mining_%26_Co.",
};

// Get the first meaningful sentence/lines from the Escalation section
// The sections often include huge navigation tables at the end
function getFirstPart(text) {
  if (!text) return '';
  // Split on double newline and take the first block that has actual content
  const blocks = text.split(/\n\n+/);
  let first = '';
  for (const block of blocks) {
    const t = block.trim();
    if (t.length > 5 && !t.startsWith('DED Complexes') && !t.startsWith('Combat Anomalies') && !t.startsWith('Site Details') && !t.startsWith('Last modified')) {
      first = t;
      break;
    }
  }
  // If no good block found, fall back to first 3 lines
  if (!first) {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    first = lines.slice(0, 3).join(' ');
  }
  return first;
}

function extractEscalationName(rawText) {
  const text = getFirstPart(rawText);
  if (!text || text.length < 5) return null;

  // Exclude known non-escalation texts
  if (/needs\s+info/i.test(text)) return null;
  if (/^\*\*WARNING\*\*/.test(text)) return null;
  if (/does\s+not\s+(appear\s+to\s+)?escalat/i.test(text)) return null;
  if (/doesn't\s+have\s+any\s+escalations/i.test(text)) return null;
  if (/unknown at this time/i.test(text)) return null;
  if (/^\d+\/10\s+DED/i.test(text)) return null; // e.g., "7/10 DED complex"

  // ---- Pattern matching ----

  // "escalate to X", "escalates into X", "escalates to X", "escalation to X"
  let m = text.match(/(?:escalat(?:e|es|ion)\s+(?:to|into))\s+(.+?)(?:[.,!?;]|\s*$)/i);
  if (m) {
    let name = cleanName(m[1]);
    if (name) return name;
  }

  // "trigger(ing) an escalation to X" or "triggers an escalation for X" or "can trigger escalation"
  m = text.match(/trigger(?:s|ing)?\s+(?:a|an\s+)?(?:possible\s+)?escalation\s+(?:to|for)\s+(.+?)(?:[.,!?;]|\s*$)/i);
  if (m) {
    let name = cleanName(m[1]);
    if (name) return name;
  }

  // "receive the escalation X" or "receive an escalation to X"
  m = text.match(/receiv(?:e|ing)\s+(?:a|an\s+)?(?:possible\s+)?escalation\s+(?:to\s+|called\s+|known\s+as\s+)?["']?(.+?)["']?(?:[.,!?;]|\s*$)/i);
  if (m) {
    let name = cleanName(m[1]);
    if (name) return name;
  }

  // "lead(s) to X" or "may lead to X"
  m = text.match(/(?:may\s+)?(?:lead|leads)\s+to\s+(?:the\s+)?(.+?)(?:[.,!?;]|\s*$)/i);
  if (m) {
    let name = cleanName(m[1]);
    if (name) return name;
  }

  // Pattern for entries like "Menacing Mechanics:" or "Mare Sargassum:" with colon
  m = text.match(/^(["']?)([A-Z][A-Za-z\s'-]+?)\1\s*:/);
  if (m) {
    let name = m[2].trim();
    if (name.length > 3 && !/^(this|the|site|drones|on|combat)/i.test(name)) return name;
  }

  // Pattern for entries like "Trouble in Paradise, a four part expedition"
  m = text.match(/^(?:Can\s+)?escalat(?:e|ion)\s+to\s+(.+?)(?:,|\s*$)/i);
  if (m) {
    let name = cleanName(m[1]);
    if (name) return name;
  }

  // "Chance of triggering escalation site X"
  m = text.match(/escalation\s+site\s+(.+?)(?:[.,!?;]|\s*$)/i);
  if (m) {
    let name = cleanName(m[1]);
    if (name) return name;
  }

  // "X (escalation)" or "Expeditions: X"
  m = text.match(/Expeditions?:\s*(.+?)(?:\s*$)/i);
  if (m) {
    let name = cleanName(m[1]);
    if (name) return name;
  }

  return null;
}

function cleanName(name) {
  name = name.trim();
  // Strip leading "the " or "an " or "a "
  name = name.replace(/^(?:the|an?)\s+/i, '');
  // Strip trailing "expedition", "complex", etc.
  name = name.replace(/\s+(?:expedition|complex)$/i, '');
  // Strip trailing parenthetical
  name = name.replace(/\s*\(.*$/, '');
  if (name.length < 3) return null;
  // Make sure it's not a generic description
  if (/^(?:a|an|the|this|it|some|another|part|destroying)\b/i.test(name)) return null;
  if (/^\d/.test(name)) return null;
  return name;
}

let updated = 0;
let skipped = 0;
let hadEsc = 0;

for (const entry of index) {
  if (entry.escalation && entry.escalation.name) {
    hadEsc++;
    continue;
  }

  const page = entry.page;
  if (!page) continue;
  if (!uniData[page]) continue;
  const sec = uniData[page].sections;
  if (!sec || !sec.Escalation) continue;

  const rawText = sec.Escalation;
  const escName = extractEscalationName(rawText);
  if (!escName) {
    skipped++;
    continue;
  }

  // Determine page name for the escalation
  let escPage = toPageName(escName);

  // Check overrides
  if (nameToPageOverrides[escName]) {
    escPage = nameToPageOverrides[escName];
  }

  // Look for existing entries in the index that match the escalation name
  for (const existing of index) {
    if (existing.name.toLowerCase() === escName.toLowerCase() && existing.page) {
      escPage = existing.page;
      break;
    }
  }

  entry.escalation = { name: escName, page: escPage };
  updated++;
}

// Save
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

console.log(`Index entries: ${index.length}`);
console.log(`Already had escalation: ${hadEsc}`);
console.log(`New escalations extracted: ${updated}`);
console.log(`Skipped (could not parse): ${skipped}`);

// Show new entries
console.log('\n=== New escalations added ===');
const newIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const backup = JSON.parse(fs.readFileSync(indexPath.replace('.json', '.json.bak'), 'utf8'));
const oldMap = {};
for (const e of backup) oldMap[e.page] = e;
let shown = 0;
for (const e of newIndex) {
  if (e.escalation && e.escalation.name) {
    const o = oldMap[e.page];
    if (!o || !o.escalation || !o.escalation.name) {
      if (shown < 100) {
        console.log(`  ${e.name.padEnd(40)} -> ${e.escalation.name}  (${e.escalation.page})`);
        shown++;
      }
    }
  }
}
console.log(`\nSaved to ${indexPath}`);
