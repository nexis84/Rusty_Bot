const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'data', 'epic-arcs-index.json');
const detailsPath = path.join(__dirname, '..', 'data', 'epic-arcs.json');

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
let details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));

// Known starting info for each arc
const arcInfo = {
  'the-blood-stained-stars': {
    startingAgent: 'Sister Alitura',
    startingSystem: 'Arnon',
    region: 'Essence',
    faction: 'Sisters of EVE',
    standingsRequired: 'None',
    additionalRequirements: 'None',
    description: 'The Blood-Stained Stars Epic Arc is a series of 50 missions divided into 7 chapters designed to allow a new pilot to experience the world of EVE and learn about the different type of missions, Pirate Factions and Empire space.'
  },
  'angel-sound': {
    startingAgent: 'Katar Erand (or other Angel Cartel agents)',
    startingSystem: 'Multiple',
    region: 'Multiple (low-sec)',
    faction: 'Angel Cartel',
    standingsRequired: 'None (Angel Cartel epic arc)',
    additionalRequirements: 'None'
  },
  'smash-and-grab': {
    startingAgent: 'Multiple Guristas agents',
    startingSystem: 'Multiple',
    region: 'Multiple (null-sec)',
    faction: 'Guristas Pirates',
    standingsRequired: 'None (Guristas epic arc)',
    additionalRequirements: 'None'
  },
  'right-to-rule': {
    startingAgent: 'Karde Romu',
    startingSystem: 'Kor-Azor Prime',
    region: 'Kor-Azor',
    faction: 'Amarr Empire',
    standingsRequired: '+5.0 Amarr Empire or Ministry of Internal Order',
    additionalRequirements: 'Hacking III (skill), Data Analyzer (module)'
  },
  'penumbra': {
    startingAgent: 'Aursa Kunivuri',
    startingSystem: 'Josameto',
    region: 'The Forge',
    faction: 'Caldari State',
    standingsRequired: '+5.0 Caldari State or Expert Distribution',
    additionalRequirements: 'Hacking III (skill), Data Analyzer (module)'
  },
  'syndication': {
    startingAgent: 'Brus Colterne',
    startingSystem: 'Dodixie',
    region: 'Sinq Laison',
    faction: 'Gallente Federation',
    standingsRequired: '+5.0 Gallente Federation or Federal Intelligence Office',
    additionalRequirements: 'Hacking III (skill), Data Analyzer (module)'
  },
  'wildfire': {
    startingAgent: 'Hiva Shesheva',
    startingSystem: 'Frarn',
    region: 'Heimatar',
    faction: 'Minmatar Republic',
    standingsRequired: '+5.0 Minmatar Republic or Krusual Tribe',
    additionalRequirements: 'Hacking III (skill), Archaeology III (skill), Data Analyzer, Relic Analyzer'
  }
};

// Update existing arcs with known info
for (const arc of index) {
  const info = arcInfo[arc.id];
  if (info) {
    arc.startingAgent = info.startingAgent;
    arc.startingSystem = info.startingSystem;
    arc.region = info.region;
    arc.faction = info.faction;
    arc.standingsRequired = info.standingsRequired || '';
    arc.additionalRequirements = info.additionalRequirements || '';
    arc.description = info.description || '';
  }
}

// Add Vision of Greatness
const visionArc = {
  id: 'vision-of-greatness',
  name: 'Vision of Greatness',
  faction: 'Association for Interdisciplinary Research',
  level: 1,
  startingAgent: 'AIR Representative',
  startingSystem: 'Manifest',
  region: 'Exordium',
  standingsRequired: 'None',
  additionalRequirements: 'None',
  description: 'Relive four defining moments in New Eden\'s history, with one hyper-real simulation for each empire. New players can better understand faction identities and allegiances, while veterans can experience legendary events long known through EVE lore.',
  chapters: [
    { name: 'Amarr Simulation', order: 1, pageName: '', missions: [] },
    { name: 'Caldari Simulation', order: 2, pageName: '', missions: [] },
    { name: 'Gallente Simulation', order: 3, pageName: '', missions: [] },
    { name: 'Minmatar Simulation', order: 4, pageName: '', missions: [] }
  ]
};

index.push(visionArc);

// Add Vision of Greatness placeholder in details
details['vision-of-greatness_overview'] = {
  pageName: 'vision-of-greatness_overview',
  title: 'Vision of Greatness',
  arc: 'vision-of-greatness',
  comingSoon: true,
  info: {
    'Faction': 'Association for Interdisciplinary Research',
    'Starting System': 'Manifest',
    'Region': 'Exordium',
    'Level': '1'
  },
  pockets: [],
  tips: '',
  loot: ''
};

fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
fs.writeFileSync(detailsPath, JSON.stringify(details, null, 2));

console.log('Updated index with ' + index.length + ' arcs');
console.log('Details has ' + Object.keys(details).length + ' missions');
