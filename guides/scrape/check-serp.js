const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/anomic-missions.json', 'utf8'));
var d = data['Anomic_Base_(Serpentis)'];
console.log('Name: ' + d.name);
console.log('Tables: ' + d.npcTables.length);
d.npcTables.forEach(function(t, i) {
  if (t.type === 'table' && t.rows) {
    console.log('  [' + i + '] ' + t.rows.length + ' rows, first row: ' + JSON.stringify(t.rows[0]));
    t.rows.forEach(function(r, j) {
      console.log('    Row ' + j + ': ' + JSON.stringify(r));
    });
  } else {
    console.log('  [' + i + '] type=' + t.type);
  }
});
console.log('Sections: ' + JSON.stringify(Object.keys(d.sections)));
