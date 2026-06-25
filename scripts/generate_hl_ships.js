const fs = require('fs');
const path = require('path');

// Read ships.json (rich data with class/race)
const shipsJson = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'ship-guess-game', 'data', 'ships.json'), 'utf8'
));

// Read items_database.js (has id mappings)
const itemsDb = fs.readFileSync(
  path.join(__dirname, '..', 'market', 'items_database.js'), 'utf8'
);

// Extract the ships section from items_database.js
const shipsSection = itemsDb.match(
  /ships:\s*\{[^}]*items:\s*\[([\s\S]*?)\]\s*\}/m
);

if (!shipsSection) {
  console.error('Could not find ships section in items_database.js');
  process.exit(1);
}

// Parse all { id: X, name: "Y" } entries
const nameToId = {};
const idRe = /\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)"\s*\}/g;
let match;
while ((match = idRe.exec(shipsSection[1])) !== null) {
  nameToId[match[2]] = parseInt(match[1], 10);
}

// Build class map from ships.json
const classMap = {};
const raceMap = {};
for (const ship of shipsJson) {
  classMap[ship.name] = ship.class || 'Ship';
  raceMap[ship.name] = ship.race || 'Unknown';
}

// Merge
const merged = [];
const unmatched = [];
for (const ship of shipsJson) {
  const id = nameToId[ship.name];
  if (id) {
    merged.push({
      id,
      name: ship.name,
      class: ship.class || 'Ship',
      race: ship.race || 'Unknown'
    });
  } else {
    unmatched.push(ship.name);
  }
}

// Try ESI lookup for unmatched ships
async function resolveUnmatched() {
  if (unmatched.length === 0) return;

  console.log(`Resolving ${unmatched.length} unmatched ships via ESI...`);

  // ESI universe/ids accepts up to 1000 names at once
  const chunks = [];
  for (let i = 0; i < unmatched.length; i += 1000) {
    chunks.push(unmatched.slice(i, i + 1000));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch('https://esi.evetech.net/latest/universe/ids/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      });
      if (!res.ok) {
        console.warn(`ESI resolve failed: ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data.inventory_types) {
        for (const entry of data.inventory_types) {
          nameToId[entry.name] = entry.id;
        }
      }
    } catch (err) {
      console.warn(`ESI resolve error:`, err.message);
    }
  }

  // Rebuild merged with resolved IDs
  for (const name of unmatched) {
    const id = nameToId[name];
    if (id) {
      merged.push({
        id,
        name,
        class: classMap[name] || 'Ship',
        race: raceMap[name] || 'Unknown'
      });
    } else {
      console.warn(`  Could not resolve: ${name}`);
    }
  }
}

async function main() {
  await resolveUnmatched();

  // Output ships.js
  const output = `// Auto-generated from EVE Online SDE
// Ships: ${merged.length}
// Generated: ${new Date().toISOString().split('T')[0]}

const SHIPS = ${JSON.stringify(merged, null, 2)};
`;

  const outPath = path.join(__dirname, '..', 'ship-higher-lower', 'ships.js');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, 'utf8');

  console.log(`Generated ships.js with ${merged.length} ships`);
  if (unmatched.length > 0) {
    console.log(`Resolved ${unmatched.length} previously unmatched ships`);
  }
}

main().catch(console.error);
