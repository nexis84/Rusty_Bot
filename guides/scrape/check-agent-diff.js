const fs = require('fs');
const uni = JSON.parse(fs.readFileSync('./data/anomic-missions.json', 'utf8'));
const surv = JSON.parse(fs.readFileSync('./data/anomic-missions-survival.json', 'utf8'));

['Anomic Agent (Angel)', 'Anomic Agent (Blood Raider)', 'Anomic Agent (Guristas)', 'Anomic Agent (Sansha)', 'Anomic Agent (Serpentis)'].forEach(function(name) {
  // Find in uni data
  var uKey = Object.keys(uni).find(function(k) { return uni[k].name === name; });
  var uData = uKey ? uni[uKey] : null;
  var sKey = Object.keys(surv).find(function(k) { return surv[k].name === name; });
  var sData = sKey ? surv[sKey] : null;

  console.log('=== ' + name + ' ===');
  console.log('  EVE-Survival pockets: ' + (sData && sData.pockets ? sData.pockets.length : 0));
  console.log('  UniWiki tables: ' + (uData && uData.npcTables ? uData.npcTables.length : 0));
  if (uData && uData.npcTables) {
    uData.npcTables.forEach(function(t, i) {
      if (t.rows) console.log('    [' + i + '] ' + t.rows.length + ' rows, first: ' + JSON.stringify(t.rows[0]));
    });
    console.log('  Sections: ' + Object.keys(uData.sections || {}).join(', '));
  }
});
