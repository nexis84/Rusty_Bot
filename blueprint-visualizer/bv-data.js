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
  ships: [
    { id: 'venture', name: 'Venture (approx)', rate: 130 },
    { id: 'retriever', name: 'Retriever (approx)', rate: 450 },
    { id: 'covetor', name: 'Covetor (approx)', rate: 700 },
    { id: 'hulk', name: 'Hulk (approx)', rate: 1600 },
    { id: 'custom', name: 'Custom rate', rate: 0 }
  ],
  defaults: {
    hub: '10000002', structure: 'npc', rigs: 1, me: 10, te: 20,
    runs: 1, industry: 5, advIndustry: 5, implant: 'none',
    pricingBasis: 'sell', reactions: true,
    scc: 4, salesTax: 8, broker: 3, jobTax: 3,
    tracked: ['10000043']
  }
};
