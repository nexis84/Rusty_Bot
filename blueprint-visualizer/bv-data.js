// Blueprint Visualizer static data — structures, rigs, implants, hubs, decryptors
window.BV_DATA = {
  hubs: [
    { region: '10000002', name: 'The Forge (Jita)' },
    { region: '10000043', name: 'Domain (Amarr)' },
    { region: '10000032', name: 'Sinq Laison (Dodixie)' },
    { region: '10000030', name: 'Kador (Rens)' },
    { region: '10000042', name: 'Hek (Curse)' },
    { region: '10001004', name: 'Manifest (Exordium)' }
  ],
  structures: [
    { id: 'npc', name: 'NPC Station', meBonus: 0, teBonus: 0, tax: 10 },
    { id: 'raitary', name: 'Raitary — M Engineering Complex', meBonus: 0, teBonus: 15, tax: 3 },
    { id: 'azbel', name: 'Azbel — L Engineering Complex', meBonus: 1, teBonus: 20, tax: 3 },
    { id: 'sotiyo', name: 'Sotiyo — XL Engineering Complex', meBonus: 1, teBonus: 30, tax: 3 },
    { id: 'athanor', name: 'Athanor — M Refinery', meBonus: 0, teBonus: 15, tax: 3 },
    { id: 'tatara', name: 'Tatara — L Refinery', meBonus: 1, teBonus: 20, tax: 3 }
  ],
  rigs: [
    { slots: 0, label: 'No rigs', meBonus: 0, teBonus: 0 },
    { slots: 1, label: '1 rig (T1: +2% TE)', meBonus: 0, teBonus: 2 },
    { slots: 2, label: '2 rigs (T1: +2% ME, +4% TE)', meBonus: 2, teBonus: 4 },
    { slots: 3, label: '3 rigs (T2 est: +4% ME, +8% TE)', meBonus: 4, teBonus: 8 }
  ],
  implants: [
    { id: 'none', name: 'None', bonus: 0 },
    { id: 'BX-801', name: "Zainou 'Beancounter' BX-801 (-1%)", bonus: 1 },
    { id: 'BX-802', name: "Zainou 'Beancounter' BX-802 (-2%)", bonus: 2 },
    { id: 'BX-804', name: "Zainou 'Beancounter' BX-804 (-4%)", bonus: 4 }
  ],
  // Simplified decryptor table for V1 invention (probability mult, ME/TE/run modifiers)
  decryptors: [
    { name: 'No Decryptor', prob: 1.0, me: 0, te: 0, runs: 0, price: 0 },
    { name: 'Accelerant Decryptor', prob: 1.1, me: 2, te: 10, runs: 1, price: 0 },
    { name: 'Attainment Decryptor', prob: 1.8, me: -1, te: -2, runs: 4, price: 0 },
    { name: 'Augmentation Decryptor', prob: 0.6, me: 2, te: 0, runs: 9, price: 0 },
    { name: 'Parity Decryptor', prob: 1.5, me: 1, te: -2, runs: 3, price: 0 },
    { name: 'Process Decryptor', prob: 1.1, me: 0, te: 0, runs: 0, price: 0 },
    { name: 'Symmetry Decryptor', prob: 1.0, me: 1, te: 8, runs: 2, price: 0 }
  ],
  t2BaseChance: 0.44,
  minerals: { 34: 'Tritanium', 35: 'Pyerite', 36: 'Mexallon', 37: 'Isogen', 38: 'Nocxium', 39: 'Zydrine', 40: 'Megacyte', 11399: 'Morphite' },
  ores: [
    { id: 1230, name: 'Veldspar' }, { id: 1228, name: 'Scordite' },
    { id: 1224, name: 'Pyroxeres' }, { id: 18, name: 'Plagioclase' },
    { id: 1227, name: 'Omber' }, { id: 20, name: 'Kernite' },
    { id: 1226, name: 'Jaspet' }, { id: 21, name: 'Hedbergite' },
    { id: 1231, name: 'Hemorphite' }, { id: 1229, name: 'Gneiss' },
    { id: 1232, name: 'Dark Ochre' }, { id: 1225, name: 'Crokite' },
    { id: 19, name: 'Spodumain' }, { id: 1223, name: 'Bistot' },
    { id: 22, name: 'Arkonor' }, { id: 11396, name: 'Mercoxit' }
  ],
  // Ice ores by exact in-game name — IDs + yields resolve at runtime (ESI ids, Everef SDE),
  // so isotopes / ozone / heavy water / strontium never need hardcoded type IDs.
  iceOres: [
    'Blue Ice', 'Clear Icicle', 'White Glaze', 'Glacial Mass',
    'Thick Blue Ice', 'Enriched Clear Icicle', 'Pristine White Glaze', 'Smooth Glacial Mass',
    'Dark Glitter', 'Gelidus', 'Glare Crust', 'Krystallos'
  ],
  ships: [
    { id: 'venture', name: 'Venture', rate: 800 },
    { id: 'prospect', name: 'Prospect', rate: 850 },
    { id: 'endurance', name: 'Endurance', rate: 960 },
    { id: 'procurer', name: 'Procurer', rate: 930 },
    { id: 'retriever', name: 'Retriever', rate: 1100 },
    { id: 'covetor', name: 'Covetor', rate: 1400 },
    { id: 'mackinaw', name: 'Mackinaw', rate: 1170 },
    { id: 'skiff', name: 'Skiff', rate: 930 },
    { id: 'hulk', name: 'Hulk', rate: 1580 },
    { id: 'porpoise', name: 'Porpoise', rate: 900 },
    { id: 'orca', name: 'Orca', rate: 1200 },
    { id: 'rorqual', name: 'Rorqual (Excavators)', rate: 3500 },
    { id: 'outrider', name: 'Outrider', rate: 2500 },
    { id: 'custom', name: 'Custom rate', rate: 0 }
  ],
  refining: {
    base: 50,
    skills: { reprocessing: 3385, efficiency: 3386 },
    // optional per-ore 2% hook (not used for global v1, keep map for future per-ore calc)
    oreSkills: { 1230:33836, 1228:33837,1224:33839,18:33840,1227:33838,20:33841,1226:33842,21:33843,1231:33844,1229:33845,1232:33846,1225:33847,19:33848,1223:33849,22:33850,11396:33851 },
    rigBonus: [0, 1, 2], // index = rig slot count from rigs selector (same slots)
    structureBonus: { npc:0, raitary:0, azbel:0, sotiyo:0, athanor:2, tatara:2 },
    implants: [ { id:'none', bonus:0 }, { id:'RX-802', bonus:2 }, { id:'RX-804', bonus:4 } ]
  },
  defaults: {
    hub: '10000002', structure: 'npc', rigs: 1, me: 10, te: 20,
    runs: 1, industry: 5, advIndustry: 5, implant: 'none',
    pricingBasis: 'sell', reactions: true,
    scc: 4, salesTax: 8, broker: 3, jobTax: 3,
    tracked: ['10000043'],
    refinePct: 75
  }
};
