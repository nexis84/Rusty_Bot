
export interface GameState {
  word: string;
  guessedLetters: string[];
  attemptsRemaining: number;
  isk: number;
  oxygen: number; // percentage
  status: 'playing' | 'won' | 'lost';
  difficulty: 'highsec' | 'nullsec' | 'streamer' | 'wormhole';
  intelLevel: number;
}

export const WORD_BANK = {
  highsec: [
    'RAVEN', 'ROKH', 'DRAKE', 'TRISTAN', 'VENTURE', 'RIFTER', 'INCURSUS', 'EXECUTIONER',
    'BADGER', 'TAYRA', 'SIGIL', 'BESTOWER', 'ITERON', 'EPITHAL', 'MAMMOTH', 'WREATH',
    'MEGATHRON', 'ODYSSEUS', 'APOCALYPSE', 'ARMAGEDDON', 'TEMPEST',
    'TRITANIUM', 'POS'
  ],
  nullsec: [
    'VELDSPAR', 'SCORDITE', 'PYERITE', 'ISOGEN', 'MEXALLON', 'KERNITE', 'OMBER', 'JASPET',
    'CYNOSURAL', 'GOONSWARM', 'PANDEMIC', 'CAPSULEER', 'ISHTAR', 'GILA', 'STRATIOS', 'ASTERO',
    'NYX', 'EREBUS', 'AVATAR', 'LEVIATHAN', 'RAGNAROK',
    'FREKI', 'MIMIR', 'UTU', 'ADRESTIA', 'MALICE', 'VANGEL', 'CAMBION', 'ETANA',
    'CHREMOAS', 'MORACHA', 'WHIPTAIL', 'CHAMELEON', 'IMP', 'FIEND', 'CAEDES', 'RABISU',
    'VICTOR', 'VIRTUOSO', 'HYDRA', 'TIAMAT', 'RAIJU', 'LAELAPS', 'GERI', 'BESTLA',
    'SHAPASH', 'CYBELE', 'SIDEWINDER', 'COBRA', 'PYTHON', 'SKUA', 'ANHINGA',
    'AMARR', 'CALDARI', 'GALLENTE', 'MINMATAR', 'TRIGLAVIAN',
    'GURISTAS', 'SANSHA', 'SERPENTIS', 'CONCORD', 'EDENCOM',
    'ZEOLITES', 'SYLVITE', 'BITUMENS', 'COESITE', 'COBALTITE', 'EUXENITE', 'TITANITE',
    'SCHEELITE', 'CHROMITE', 'CARNOTITE', 'ZIRCON', 'POLLUCITE', 'CINNABAR',
    'LOPARITE', 'MONAZITE', 'XENOTIME', 'SPODUMAIN',
    'CROKITE', 'BISTOT', 'ARKONOR', 'MERCOXIT',
    'PLAGIOCLASE', 'HEMORPHITE', 'HEDBERGITE', 'GNEISS',
    'FULLERITE', 'OCHRE', 'BEZDNACINE', 'RAKOVENE', 'TALASSONITE',
    'ICICLE', 'GLACIAL', 'GLAZE', 'GELIDUS', 'KRYSTALLOS',
    'JITA', 'DELVE', 'POCHVEN', 'AMAMAKE', 'NULLSEC', 'GENESIS', 'TAMAR',
    'SCRAMBLER', 'AUTOCANNON', 'BLASTER',
    'GYROSTABILIZER', 'DAMAGEAWAY', 'NEUTRALIZER', 'TRACTORBEAM', 'CLOAKING', 'ENTOSIS',
    'MICROWARPDRIVE', 'AFTERBURNER',
    'HOBGOBLIN', 'WARRIOR', 'HORNET', 'ACOLYTE', 'VALKYRIE', 'VESPA',
    'OGRE', 'PRAETOR', 'GECKO', 'EINHERJI', 'FIRBOLG'
  ],
  streamer: [
    // Highsec words
    'RAVEN', 'ROKH', 'DRAKE', 'SCORPION', 'CARACAL', 'STABBER', 'MOA', 'THORAX', 'ARBITRATOR', 'VEXOR', 'OMEN', 'MALLER',
    'TRISTAN', 'INCURSUS', 'EXECUTIONER', 'SLASHER', 'ATRON', 'MERLIN', 'KESTREL', 'CONDOR',
    'VENTURE', 'RIFTER', 'PUNISHER', 'BREACHER', 'CATALYST', 'COERCER', 'THRASHER', 'CORMORANT',
    'HERON', 'IMICUS', 'PROBE', 'MAGNATE', 'BADGER', 'TAYRA', 'SIGIL', 'BESTOWER', 'ITERON', 'EPITHAL', 'MAMMOTH', 'WREATH',
    'CORAX', 'GRIFFIN', 'BANTAM', 'INSURANCE', 'BURST', 'HERON', 'ISHTAR', 'GILA', 'STRATIOS', 'ASTERO', 'NYX',
    'TENGU', 'LEGION', 'LOKI', 'PROTEUS',
    // Nullsec words
    'VELDSPAR', 'SCORDITE', 'PYERITE', 'ISOGEN', 'MEXALLON', 'KERNITE', 'OMBER', 'JASPET',
    'ZYDRINE', 'MEGACYTE', 'MORPHITE', 'CYNOSURAL', 'CAPSULEER',
    'EREBUS', 'AVATAR', 'LEVIATHAN', 'RAGNAROK', 'ARCHON', 'THANATOS', 'CHIMERA', 'NIDHOGGUR',
    'NAGLFAR', 'PHOENIX', 'MOROS', 'REVELATION', 'APOSTLE', 'MINOKAWA', 'LIF', 'AEON', 'WYVERN', 'HEL',
    'RORQUAL', 'ORCA', 'BOWHEAD', 'CHARON', 'FENRIR', 'OBELISK',
    'BHAALGORN', 'ASHIMMU', 'SUCCUBUS', 'CRUOR', 'MACHARIEL', 'VINDICATOR', 'NIGHTMARE', 'BARGHEST',
    'KRONOS', 'PALADIN', 'VARGUR', 'GOLEM', 'ARKONOR', 'DARKOCHRE', 'CROKITE',
    'FREKI', 'MIMIR', 'UTU', 'ADRESTIA', 'MALICE', 'VANGEL', 'CAMBION', 'ETANA',
    'CHREMOAS', 'MORACHA', 'WHIPTAIL', 'CHAMELEON', 'IMP', 'FIEND', 'CAEDES', 'RABISU',
    'VICTOR', 'VIRTUOSO', 'HYDRA', 'TIAMAT', 'RAIJU', 'LAELAPS', 'GERI', 'BESTLA',
    'SHAPASH', 'CYBELE', 'SIDEWINDER', 'COBRA', 'PYTHON', 'SKUA', 'ANHINGA',
    'AMARR', 'CALDARI', 'GALLENTE', 'MINMATAR', 'TRIGLAVIAN',
    'GURISTAS', 'SANSHA', 'SERPENTIS', 'CONCORD', 'EDENCOM',
    'ZEOLITES', 'SYLVITE', 'BITUMENS', 'COESITE', 'COBALTITE', 'EUXENITE', 'TITANITE',
    'SCHEELITE', 'CHROMITE', 'CARNOTITE', 'ZIRCON', 'POLLUCITE', 'CINNABAR',
    'LOPARITE', 'MONAZITE', 'XENOTIME', 'SPODUMAIN',
    'BISTOT', 'MERCOXIT', 'PLAGIOCLASE', 'HEMORPHITE', 'HEDBERGITE', 'GNEISS',
    'MEGATHRON', 'ODYSSEUS', 'APOCALYPSE', 'ARMAGEDDON', 'TEMPEST',
    'TRITANIUM', 'POS',
    'FULLERITE', 'OCHRE', 'BEZDNACINE', 'RAKOVENE', 'TALASSONITE',
    'ICICLE', 'GLACIAL', 'GLAZE', 'GELIDUS', 'KRYSTALLOS',
    'JITA', 'DELVE', 'POCHVEN', 'AMAMAKE', 'NULLSEC', 'GENESIS', 'TAMAR',
    'SCRAMBLER', 'AUTOCANNON', 'BLASTER',
    'GYROSTABILIZER', 'DAMAGEAWAY', 'NEUTRALIZER', 'TRACTORBEAM', 'CLOAKING', 'ENTOSIS',
    'MICROWARPDRIVE', 'AFTERBURNER',
    'HOBGOBLIN', 'WARRIOR', 'HORNET', 'ACOLYTE', 'VALKYRIE', 'VESPA',
    'OGRE', 'PRAETOR', 'GECKO', 'EINHERJI', 'FIRBOLG',
    'HOTDROP', 'CAREBEAR', 'MULTIBOXING', 'RATTING',
    'KEEPSTAR', 'FORTIZAR', 'ASTRAHUS', 'TATARA', 'ATHANOR', 'SOTIYO', 'AZBEL', 'RAITARU'
  ],
  wormhole: [
    // Harder words - Sleeper/Thera themed
    'SLEEPER', 'DRIFTER', 'UNIDENTIFIED', 'WORMHOLE', 'THERA', 'CYPHER', 'ENCRYPTED',
    'ANOMALY', 'SIGNATURE', 'COLLAPSE', 'CRITICAL', 'DESTABILIZED', 'MASS', 'TOTAL',
    'VANGUARD', 'WARDEN', 'SENTINEL', 'BARON', 'OVERSEER', 'KEEPER', 'GUARDIAN',
    'NEUTRON', 'PLASMA', 'MAGNETAR', 'PULSAR', 'WOLFRAYET', 'CATACLYSMIC', 'BLACK',
    'REDACTED', 'CLASSIFIED', 'RESTRICTED', 'QUARANTINE', 'ISOLATION', 'CONTAINMENT',
    'ARCHIVE', 'VAULT', 'REPOSITORY', 'CACHE', 'RELIQUARY', 'DATA', 'CORE',
    'BIOMATTER', 'NANITE', 'INFESTATION', 'MUTATION', 'EVOLUTION', 'ADAPTIVE',
    'FREKI', 'MIMIR', 'UTU', 'ADRESTIA', 'MALICE', 'VANGEL', 'CAMBION', 'ETANA',
    'CHREMOAS', 'MORACHA', 'WHIPTAIL', 'CHAMELEON', 'IMP', 'FIEND', 'CAEDES', 'RABISU',
    'VICTOR', 'VIRTUOSO', 'HYDRA', 'TIAMAT', 'RAIJU', 'LAELAPS', 'GERI', 'BESTLA',
    'SHAPASH', 'CYBELE', 'SIDEWINDER', 'COBRA', 'PYTHON', 'SKUA', 'ANHINGA',
    'AMARR', 'CALDARI', 'GALLENTE', 'MINMATAR', 'TRIGLAVIAN',
    'GURISTAS', 'SANSHA', 'SERPENTIS', 'CONCORD', 'EDENCOM',
    'ZEOLITES', 'SYLVITE', 'BITUMENS', 'COESITE', 'COBALTITE', 'EUXENITE', 'TITANITE',
    'SCHEELITE', 'CHROMITE', 'CARNOTITE', 'ZIRCON', 'POLLUCITE', 'CINNABAR',
    'LOPARITE', 'MONAZITE', 'XENOTIME', 'SPODUMAIN',
    'CROKITE', 'BISTOT', 'ARKONOR', 'MERCOXIT',
    'VELDSPAR', 'SCORDITE', 'PLAGIOCLASE', 'OMBER', 'KERNITE', 'JASPET',
    'HEMORPHITE', 'HEDBERGITE', 'GNEISS',
    'NULLSEC', 'DELVE', 'POCHVEN', 'CLOAKING', 'ENTOSIS',
    'SCRAMBLER', 'HOTDROP', 'CAREBEAR', 'MULTIBOXING', 'RATTING',
    'BLASTER', 'DAMAGEAWAY', 'NEUTRALIZER', 'TRACTORBEAM',
    'KEEPSTAR', 'FORTIZAR', 'ASTRAHUS', 'TATARA', 'ATHANOR', 'SOTIYO', 'AZBEL', 'RAITARU',
    'POS', 'HOBGOBLIN', 'WARRIOR', 'HORNET', 'ACOLYTE', 'VALKYRIE', 'VESPA',
    'OGRE', 'PRAETOR', 'GECKO', 'EINHERJI', 'FIRBOLG',
    'BEZDNACINE', 'RAKOVENE', 'TALASSONITE',
    'ICICLE', 'GLACIAL', 'GLAZE', 'GELIDUS', 'KRYSTALLOS',
    'MICROWARPDRIVE', 'AFTERBURNER', 'GYROSTABILIZER',
    'APOCALYPSE', 'ARMAGEDDON', 'TEMPEST', 'MEGATHRON', 'ODYSSEUS'
  ]
};

export const DIFFICULTY_SETTINGS = {
  highsec: {
    timer: 120,
    attempts: 15,
    reward: 1000000,
    label: 'HIGH-SEC (1.0)',
    system: 'JITA IV-4'
  },
  nullsec: {
    timer: 60,
    attempts: 10,
    reward: 3000000,
    label: 'NULL-SEC (0.0)',
    system: '6VDT-H'
  },
  streamer: {
    timer: 600,
    attempts: 12,
    reward: 5000000,
    label: 'STREAMER',
    system: 'TWITCH-1'
  },
  wormhole: {
    timer: 45,
    attempts: 8,
    reward: 8000000,
    label: 'WORMHOLE',
    system: 'THERA'
  }
};

export const INITIAL_ISK = 10000000;
export const HINT_COST = 1500000; // Data Analyzer - reduced from 5M to 2M
export const VOWEL_COST = 1000000;
export const EMERGENCY_BYPASS_COST = 3000000; // Reveals any letter instantly
export const SECURITY_CONNECTIONS_COST = 10000000; // 5M ISK - 25% multiplier boost for 5 rounds

// Standing system - rank up based on total ISK earned
export const STANDING_LEVELS = [
  { name: 'Alpha Clone', threshold: 0, multiplier: 1 },
  { name: 'Beta Clone', threshold: 100_000_000, multiplier: 1.25 },
  { name: 'Delta Clone', threshold: 250_000_000, multiplier: 1.5 },
  { name: 'Epsilon Clone', threshold: 500_000_000, multiplier: 1.75 },
  { name: 'Omega Clone', threshold: 750_000_000, multiplier: 2 }
] as const;

export type StandingLevel = typeof STANDING_LEVELS[number]['name'];

// Ship definitions
export interface Ship {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  cost: number;
  bonuses: {
    iskMultiplier?: number;
    timerBonus?: number;
    extraAttempts?: number;
    toolCostReduction?: number;
    freeDataAnalyzer?: number;
    freeCargoScanner?: number;
    freeEmergencyBypass?: number;
    vowelScanBonus?: number;
    dataAnalyzerBonus?: number;
    emergencyBypassBonus?: number;
    boosterRoundsBonus?: number;
    boosterMultiplier?: number;
    boosterCooldownReduction?: number;
    standingProgressBonus?: number;
    bonusLootChance?: number;
    cloakAbility?: boolean;
    adaptiveShield?: boolean;
    ghostInMachine?: number;
    predatorInstinct?: boolean;
    blackOps?: number;
    shapeShifter?: boolean;
    immuneFirstWrong?: boolean;
    wrongGuessSurvivalChance?: number;
  };
  description: string;
}

export const SHIPS: Ship[] = [
  // Tier 0 - Starter Ship (Free)
  {
    id: 'velator',
    name: 'Velator',
    tier: 1,
    cost: 0,
    bonuses: {},
    description: 'Standard Gallente rookie ship - no bonuses'
  },
  // Tier 1 - Entry Level Frigates
  {
    id: 'magnate-navy',
    name: 'Magnate Navy Issue',
    tier: 1,
    cost: 50_000_000,
    bonuses: { iskMultiplier: 1.10, timerBonus: 5 },
    description: '+10% ISK reward per successful hack, +5 seconds to timer'
  },
  {
    id: 'heron-navy',
    name: 'Heron Navy Issue',
    tier: 1,
    cost: 60_000_000,
    bonuses: { bonusLootChance: 0.15, toolCostReduction: 0.20 },
    description: '+15% chance to find bonus loot (extra ISK on win), Data Analyzer cost reduced by 20%'
  },
  {
    id: 'imicus-navy',
    name: 'Imicus Navy Issue',
    tier: 1,
    cost: 60_000_000,
    bonuses: { freeDataAnalyzer: 1, standingProgressBonus: 0.10 },
    description: '+1 free Data Analyzer at start of each game, +10% to standing multiplier progression speed'
  },
  {
    id: 'probe-fleet',
    name: 'Probe Fleet Issue',
    tier: 1,
    cost: 55_000_000,
    bonuses: { vowelScanBonus: 1, timerBonus: 5 },
    description: 'Vowel scans reveal 2 vowels instead of 1, +5 seconds to timer per round'
  },
  // Tier 2 - Covert Ops Frigates
  {
    id: 'anathema',
    name: 'Anathema',
    tier: 2,
    cost: 150_000_000,
    bonuses: { cloakAbility: true, iskMultiplier: 1.20 },
    description: 'Cloak ability: 1x per game - skip a wrong guess, +20% ISK reward per successful hack'
  },
  {
    id: 'buzzard',
    name: 'Buzzard',
    tier: 2,
    cost: 150_000_000,
    bonuses: { timerBonus: 15, freeCargoScanner: 1 },
    description: '+15 seconds to timer on all difficulties, +1 free Cargo Scanner at start of each game'
  },
  {
    id: 'helios',
    name: 'Helios',
    tier: 2,
    cost: 160_000_000,
    bonuses: { dataAnalyzerBonus: 1, toolCostReduction: 0.30 },
    description: 'Data Analyzers reveal 2 letters instead of 1, Emergency Bypass cost reduced by 30%'
  },
  {
    id: 'cheetah',
    name: 'Cheetah',
    tier: 2,
    cost: 150_000_000,
    bonuses: { boosterRoundsBonus: 2, iskMultiplier: 1.10 },
    description: 'Security Connections booster lasts 7 rounds instead of 5, +10% to all ISK rewards'
  },
  // Tier 3 - Expedition Frigates
  {
    id: 'astero',
    name: 'Astero',
    tier: 3,
    cost: 400_000_000,
    bonuses: { iskMultiplier: 1.15, extraAttempts: 1, freeEmergencyBypass: 1 },
    description: '+15% ISK reward per successful hack, +1 maximum wrong attempts on all difficulties, Start with 1x free Emergency Bypass'
  },
  {
    id: 'stratios',
    name: 'Stratios',
    tier: 3,
    cost: 600_000_000,
    bonuses: { iskMultiplier: 1.15, toolCostReduction: 0.25, timerBonus: 10 },
    description: '+15% ISK reward per successful hack, All tool costs reduced by 25%, +10 seconds to timer on all difficulties'
  },
  {
    id: 'metamorphosis',
    name: 'Metamorphosis',
    tier: 3,
    cost: 750_000_000,
    bonuses: { shapeShifter: true, iskMultiplier: 1.15, freeDataAnalyzer: 1, freeCargoScanner: 1, freeEmergencyBypass: 1 },
    description: 'Upgraded Scanner: Once per game, change difficulty mid-hack (keeps progress), +15% ISK reward per successful hack, +1 free use of any tool per game'
  },
  {
    id: 'pacifier',
    name: 'Pacifier',
    tier: 3,
    cost: 800_000_000,
    bonuses: { blackOps: 2, iskMultiplier: 1.20, immuneFirstWrong: true },
    description: 'Black Ops: 2x per game - reveal any letter with no cost, +20% ISK reward per successful hack, Immune to first wrong guess (no penalty)'
  },
  // Tier 4 - Strategic Cruisers
  {
    id: 'legion',
    name: 'Legion',
    tier: 4,
    cost: 1_500_000_000,
    bonuses: { iskMultiplier: 1.25, boosterMultiplier: 0.30, freeDataAnalyzer: 1, freeCargoScanner: 1 },
    description: '+25% ISK reward per successful hack, Security Connections booster +30% instead of +25%, Start every game with 1 Data Analyzer + 1 Cargo Scanner'
  },
  {
    id: 'odysseus',
    name: 'Odysseus',
    tier: 4,
    cost: 1_700_000_000,
    bonuses: {
      iskMultiplier: 1.25,
      extraAttempts: 1,
      standingProgressBonus: 0.25,
      freeCargoScanner: 1,
      freeDataAnalyzer: 1,
    },
    description: 'Command Ship: +25% ISK reward per successful hack, +1 maximum wrong attempt on all difficulties, +25% to standing multiplier progression speed, Start with 1 free Cargo Scanner + 1 free Data Analyzer'
  },
  {
    id: 'tengu',
    name: 'Tengu',
    tier: 4,
    cost: 1_500_000_000,
    bonuses: { iskMultiplier: 1.25, adaptiveShield: true, timerBonus: 15 },
    description: '+25% ISK reward per successful hack, Adaptive shield: Can survive 1 hack failure per day (continue playing), +15 seconds to timer'
  },
  {
    id: 'proteus',
    name: 'Proteus',
    tier: 4,
    cost: 1_600_000_000,
    bonuses: { iskMultiplier: 1.30, ghostInMachine: 3, toolCostReduction: 0.40 },
    description: '+30% ISK reward per successful hack, Upgraded Subsystem: 3x per game - see if a letter is in the word before guessing, All tool costs reduced by 40%'
  },
  {
    id: 'loki',
    name: 'Loki',
    tier: 4,
    cost: 1_500_000_000,
    bonuses: { iskMultiplier: 1.35, predatorInstinct: true, emergencyBypassBonus: 1, boosterCooldownReduction: 5 },
    description: '+35% ISK reward per successful hack, Upgraded Subsystem: Auto-reveals 1 random letter at game start, Emergency Bypasses reveal 2 letters instead of 1, Security Connections cooldown reduced to 5 games'
  }
];

export const getStandingLevel = (totalEarned: number): typeof STANDING_LEVELS[number] => {
  for (let i = STANDING_LEVELS.length - 1; i >= 0; i--) {
    if (totalEarned >= STANDING_LEVELS[i].threshold) {
      return STANDING_LEVELS[i];
    }
  }
  return STANDING_LEVELS[0];
};

// Material definitions
export interface Material {
  id: string;
  name: string;
  icon: string;
}

export const MATERIALS: Material[] = [
  { id: 'tritanium', name: 'Tritanium', icon: '◆' },
  { id: 'pyerite', name: 'Pyerite', icon: '◇' },
  { id: 'mexallon', name: 'Mexallon', icon: '■' },
  { id: 'isogen', name: 'Isogen', icon: '□' },
  { id: 'nocxium', name: 'Nocxium', icon: '▲' },
  { id: 'zydrine', name: 'Zydrine', icon: '△' },
  { id: 'megacyte', name: 'Megacyte', icon: '●' },
  { id: 'data_scraps', name: 'Data Scraps', icon: '▪' },
  { id: 'data_core', name: 'Data Core', icon: '◆' },
];

// Material drops per difficulty
export const MATERIAL_DROPS: Record<string, {
  common: { id: string; min: number; max: number }[];
  uncommon: { id: string; min: number; max: number }[];
  rare: { id: string; min: number; max: number }[];
}> = {
  highsec: {
    common: [
      { id: 'data_scraps', min: 20, max: 50 },
      { id: 'tritanium', min: 5, max: 15 },
    ],
    uncommon: [
      { id: 'pyerite', min: 3, max: 8 },
    ],
    rare: [
      { id: 'isogen', min: 1, max: 3 },
    ],
  },
  nullsec: {
    common: [
      { id: 'data_scraps', min: 40, max: 80 },
      { id: 'pyerite', min: 10, max: 25 },
    ],
    uncommon: [
      { id: 'mexallon', min: 5, max: 12 },
    ],
    rare: [
      { id: 'nocxium', min: 2, max: 5 },
    ],
  },
  streamer: {
    common: [
      { id: 'data_scraps', min: 60, max: 100 },
      { id: 'mexallon', min: 8, max: 20 },
    ],
    uncommon: [
      { id: 'zydrine', min: 4, max: 10 },
    ],
    rare: [
      { id: 'data_core', min: 1, max: 3 },
    ],
  },
  wormhole: {
    common: [
      { id: 'data_scraps', min: 80, max: 150 },
      { id: 'nocxium', min: 5, max: 15 },
    ],
    uncommon: [
      { id: 'megacyte', min: 3, max: 8 },
    ],
    rare: [
      { id: 'data_core', min: 2, max: 5 },
    ],
  },
};

// Implant definitions
export interface Implant {
  id: string;
  name: string;
  slot: 1 | 2 | 3 | 4 | 5;
  bonuses: {
    wrongGuessSurvivalChance?: number;
    timerBonus?: number;
    extraAttempts?: number;
    iskMultiplier?: number;
    freeDataAnalyzer?: number;
    freeCargoScanner?: number;
    emergencyBypassBonus?: number;
    dataAnalyzerBonus?: number;
    immuneFirstWrong?: boolean;
    standingProgressBonus?: number;
  };
  description: string;
}

export const IMPLANTS: Implant[] = [
  // Slot 1 - Neural Analysis
  {
    id: 'blackglass',
    name: 'Blackglass',
    slot: 1,
    bonuses: { wrongGuessSurvivalChance: 0.5 },
    description: 'Limited Ocular Filter - 50% chance wrong guesses do not consume an attempt'
  },
  {
    id: 'bypass-protocol-chip',
    name: 'Bypass Protocol Chip',
    slot: 1,
    bonuses: { emergencyBypassBonus: 1 },
    description: 'Emergency Bypass reveals 2 letters instead of 1'
  },
  // Slot 2 - Memory Core
  {
    id: 'analyzer-support-unit',
    name: 'Analyzer Support Unit',
    slot: 2,
    bonuses: { freeDataAnalyzer: 1 },
    description: 'Start each run with 1 free Data Analyzer'
  },
  {
    id: 'cargo-scanner-support',
    name: 'Cargo Scanner Support',
    slot: 2,
    bonuses: { freeCargoScanner: 1 },
    description: 'Start each run with 1 free Cargo Scanner'
  },
  // Slot 3 - Perception Filter
  {
    id: 'neural-accelerator',
    name: 'Neural Accelerator',
    slot: 3,
    bonuses: { timerBonus: 15 },
    description: '+15 seconds to hack timer on all difficulties'
  },
  {
    id: 'tachyon-sensor-booster',
    name: 'Tachyon Sensor Booster',
    slot: 3,
    bonuses: { dataAnalyzerBonus: 1 },
    description: 'Data Analyzers reveal 2 letters instead of 1'
  },
  // Slot 4 - Willpower Matrix
  {
    id: 'hardening-subprocessor',
    name: 'Hardening Subprocessor',
    slot: 4,
    bonuses: { extraAttempts: 1 },
    description: '+1 extra wrong attempt on all difficulties'
  },
  {
    id: 'neural-override',
    name: 'Neural Override',
    slot: 4,
    bonuses: { immuneFirstWrong: true },
    description: 'First wrong guess each run is forgiven (no penalty)'
  },
  // Slot 5 - Economic Logic
  {
    id: 'isk-optimizer',
    name: 'ISK Optimizer',
    slot: 5,
    bonuses: { iskMultiplier: 1.20 },
    description: '+20% ISK reward per successful hack'
  },
  {
    id: 'capital-connections',
    name: 'Experimental Social Implant',
    slot: 5,
    bonuses: { standingProgressBonus: 0.10 },
    description: '+10% to standing multiplier progression speed'
  },
];

// Blueprint definitions
export interface Blueprint {
  id: string;
  name: string;
  cost: number;
  implantId: string;
  materials: { materialId: string; amount: number }[];
  description: string;
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: 'bp-blackglass',
    name: 'Blackglass',
    cost: 8_000_000,
    implantId: 'blackglass',
    materials: [
      { materialId: 'tritanium', amount: 500 },
      { materialId: 'pyerite', amount: 300 },
      { materialId: 'isogen', amount: 100 },
      { materialId: 'data_core', amount: 1 },
    ],
    description: 'Limited Ocular Filter schematic'
  },
  {
    id: 'bp-bypass-protocol-chip',
    name: 'Bypass Protocol Chip',
    cost: 6_000_000,
    implantId: 'bypass-protocol-chip',
    materials: [
      { materialId: 'nocxium', amount: 300 },
      { materialId: 'megacyte', amount: 100 },
      { materialId: 'data_core', amount: 1 },
    ],
    description: 'Emergency protocol override schematic'
  },
  {
    id: 'bp-analyzer-support-unit',
    name: 'Analyzer Support Unit',
    cost: 4_000_000,
    implantId: 'analyzer-support-unit',
    materials: [
      { materialId: 'pyerite', amount: 200 },
      { materialId: 'isogen', amount: 50 },
      { materialId: 'data_scraps', amount: 300 },
    ],
    description: 'Tool support subsystem schematic'
  },
  {
    id: 'bp-cargo-scanner-support',
    name: 'Cargo Scanner Support',
    cost: 4_000_000,
    implantId: 'cargo-scanner-support',
    materials: [
      { materialId: 'tritanium', amount: 150 },
      { materialId: 'isogen', amount: 100 },
      { materialId: 'data_scraps', amount: 250 },
    ],
    description: 'Scanner support subsystem schematic'
  },
  {
    id: 'bp-neural-accelerator',
    name: 'Neural Accelerator',
    cost: 5_000_000,
    implantId: 'neural-accelerator',
    materials: [
      { materialId: 'pyerite', amount: 400 },
      { materialId: 'mexallon', amount: 200 },
      { materialId: 'data_scraps', amount: 500 },
    ],
    description: 'Neural processing accelerator schematic'
  },
  {
    id: 'bp-tachyon-sensor-booster',
    name: 'Tachyon Sensor Booster',
    cost: 6_000_000,
    implantId: 'tachyon-sensor-booster',
    materials: [
      { materialId: 'mexallon', amount: 300 },
      { materialId: 'nocxium', amount: 150 },
      { materialId: 'data_core', amount: 1 },
    ],
    description: 'Sensor enhancement suite schematic'
  },
  {
    id: 'bp-hardening-subprocessor',
    name: 'Hardening Subprocessor',
    cost: 8_000_000,
    implantId: 'hardening-subprocessor',
    materials: [
      { materialId: 'mexallon', amount: 500 },
      { materialId: 'zydrine', amount: 100 },
      { materialId: 'data_core', amount: 2 },
    ],
    description: 'System hardening module schematic'
  },
  {
    id: 'bp-neural-override',
    name: 'Neural Override',
    cost: 10_000_000,
    implantId: 'neural-override',
    materials: [
      { materialId: 'nocxium', amount: 300 },
      { materialId: 'zydrine', amount: 100 },
      { materialId: 'data_scraps', amount: 500 },
    ],
    description: 'Neural override circuit schematic'
  },
  {
    id: 'bp-isk-optimizer',
    name: 'ISK Optimizer',
    cost: 7_000_000,
    implantId: 'isk-optimizer',
    materials: [
      { materialId: 'mexallon', amount: 300 },
      { materialId: 'nocxium', amount: 150 },
      { materialId: 'data_core', amount: 1 },
    ],
    description: 'Economic optimization module schematic'
  },
  {
    id: 'bp-capital-connections',
    name: 'Experimental Social Implant',
    cost: 5_000_000,
    implantId: 'capital-connections',
    materials: [
      { materialId: 'nocxium', amount: 200 },
      { materialId: 'megacyte', amount: 100 },
      { materialId: 'data_core', amount: 1 },
    ],
    description: 'Standing improvement network schematic'
  },
];
