const fs = require('fs');
const path = require('path');

const SDE_DIR = 'C:\\Users\\nexis\\AppData\\Local\\Temp\\opencode\\sde_extracted';
const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJsonl(filename) {
  const lines = fs.readFileSync(path.join(SDE_DIR, filename), 'utf8').trim().split('\n');
  return lines.map(l => JSON.parse(l));
}

function build() {
  console.log('Loading SDE files...');

  const npcChars = loadJsonl('npcCharacters.jsonl');
  const corporations = loadJsonl('npcCorporations.jsonl');
  const factions = loadJsonl('factions.jsonl');
  const agentTypes = loadJsonl('agentTypes.jsonl');
  const divisions = loadJsonl('npcCorporationDivisions.jsonl');
  const stations = loadJsonl('npcStations.jsonl');
  const solarSystems = loadJsonl('mapSolarSystems.jsonl');

  console.log('  npcCharacters: ' + npcChars.length);
  console.log('  corporations: ' + corporations.length);
  console.log('  factions: ' + factions.length);
  console.log('  agentTypes: ' + agentTypes.length);
  console.log('  divisions: ' + divisions.length);
  console.log('  stations: ' + stations.length);
  console.log('  solarSystems: ' + solarSystems.length);

  // Build lookup maps
  const corpMap = {};
  corporations.forEach(c => { corpMap[c._key] = c; });

  const factionMap = {};
  factions.forEach(f => { factionMap[f._key] = f; });

  const agentTypeMap = {};
  agentTypes.forEach(t => { agentTypeMap[t._key] = t.name; });

  const divisionMap = {};
  divisions.forEach(d => { divisionMap[d._key] = d.internalName; });

  const stationMap = {};
  stations.forEach(s => { stationMap[s._key] = s; });

  const systemMap = {};
  solarSystems.forEach(sys => { systemMap[sys._key] = sys; });

  // Build agents array
  const agents = [];
  let skipped = 0;

  npcChars.forEach(ch => {
    if (!ch.agent) {
      skipped++;
      return;
    }

    const agent = ch.agent;
    const agentTypeName = agentTypeMap[agent.agentTypeID] || 'Unknown';
    const divisionName = divisionMap[agent.divisionID] || 'Unknown';

    // Resolve location
    let locationType = 'unknown';
    let stationName = '';
    let solarSystemID = null;
    let solarSystemName = '';
    let securityStatus = null;

    if (ch.locationID) {
      const station = stationMap[ch.locationID];
      if (station) {
        locationType = 'station';
        stationName = '';
        solarSystemID = station.solarSystemID;
      } else {
        const system = systemMap[ch.locationID];
        if (system) {
          locationType = 'space';
          solarSystemID = ch.locationID;
        }
      }
    }

    if (solarSystemID && systemMap[solarSystemID]) {
      const sys = systemMap[solarSystemID];
      solarSystemName = sys.name.en || '';
      securityStatus = sys.securityStatus;
    }

    // Resolve corporation
    const corp = corpMap[ch.corporationID];
    const corpName = corp ? (corp.name.en || '') : '';
    const factionID = corp ? (corp.factionID || null) : null;
    const factionObj = factionID ? factionMap[factionID] : null;
    const factionName = factionObj ? (factionObj.name.en || '') : '';

    agents.push({
      characterID: ch._key,
      name: ch.name.en || '',
      corporationID: ch.corporationID,
      corporation: corpName,
      factionID: factionID,
      faction: factionName,
      agentType: agentTypeName,
      agentTypeID: agent.agentTypeID,
      division: divisionName,
      divisionID: agent.divisionID,
      level: agent.level,
      isLocator: agent.isLocator || false,
      locationType: locationType,
      stationID: locationType === 'station' ? ch.locationID : null,
      station: stationName,
      solarSystemID: solarSystemID,
      solarSystem: solarSystemName,
      securityStatus: securityStatus
    });
  });

  console.log('  agents extracted: ' + agents.length);
  console.log('  skipped (no agent): ' + skipped);

  // Write output (minified for browser)
  const outputPath = path.join(DATA_DIR, 'agents-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(agents));
  console.log('Written to ' + outputPath);
  console.log('  file size: ' + (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2) + ' MB');
}

build();
