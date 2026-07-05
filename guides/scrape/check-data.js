const fs = require('fs');
const uni = JSON.parse(fs.readFileSync('./data/anomalies-uniwiki.json', 'utf8'));
const pages = [
  'Sansha%27s_Command_Relay_Outpost',
  'Angel%27s_Red_Light_District',
  'Sansha%27s_Nation_Neural_Paralytic_Facility',
  'Serpentis_Capital_Staging',
  'Pith%27s_Penal_Complex'
];
for (const p of pages) {
  const d = uni[p];
  if (d) {
    console.log('=== ' + p + ' ===');
    console.log('Info keys: ' + Object.keys(d.info).length);
    console.log('Description length: ' + (d.description || '').length);
    console.log('Sections: ' + Object.keys(d.sections || {}).join(', '));
    console.log('NPC tables: ' + (d.npcTables ? d.npcTables.length : 0));
    if (d.npcTables) {
      d.npcTables.forEach(function(t, i) {
        console.log('  [' + i + '] type=' + t.type + (t.rows ? ' rows=' + t.rows.length : '') + (t.text ? ' text=' + t.text.substring(0, 80) : ''));
      });
    }
  } else {
    console.log(p + ': NOT FOUND');
  }
}
