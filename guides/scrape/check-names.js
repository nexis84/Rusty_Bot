const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('./data/missions-index.json', 'utf8'));

// Find duplicate names
var nameCounts = {};
idx.forEach(function(m) { nameCounts[m.name] = (nameCounts[m.name] || 0) + 1; });
var dupes = Object.keys(nameCounts).filter(function(n) { return nameCounts[n] > 1; });
console.log('Duplicate names: ' + dupes.length);
dupes.slice(0, 15).forEach(function(n) {
  var entries = idx.filter(function(m) { return m.name === n; });
  console.log('  "' + n + '" x' + entries.length);
  entries.forEach(function(e) { console.log('    faction=' + e.faction + ', levels=' + Object.keys(e.levels).join(',')); });
});

// Find missions with "Assault" or "assault" in the name
console.log('\nMissions containing "assault":');
idx.filter(function(m) { return /assault/i.test(m.name); }).forEach(function(m) {
  console.log('  "' + m.name + '" faction=' + m.faction);
});

// Find names with The at the end
console.log('\nMissions with "The" at end:');
idx.filter(function(m) { return m.name.endsWith(', The'); }).forEach(function(m) {
  console.log('  "' + m.name + '"');
});

// Find names with empty parentheses
console.log('\nMissions with empty parentheses:');
idx.filter(function(m) { return /\(\s*\)/.test(m.name); }).forEach(function(m) {
  console.log('  "' + m.name + '" faction=' + m.faction);
});
