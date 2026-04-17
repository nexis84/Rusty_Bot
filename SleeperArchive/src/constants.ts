
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
    'BADGER', 'TAYRA', 'SIGIL', 'BESTOWER', 'ITERON', 'EPITHAL', 'MAMMOTH', 'WREATH'
  ],
  nullsec: [
    'VELDSPAR', 'SCORDITE', 'PYERITE', 'ISOGEN', 'MEXALLON', 'KERNITE', 'OMBER', 'JASPET',
    'CYNOSURAL', 'GOONSWARM', 'PANDEMIC', 'CAPSULEER', 'ISHTAR', 'GILA', 'STRATIOS', 'ASTERO',
    'NYX', 'EREBUS', 'AVATAR', 'LEVIATHAN', 'RAGNAROK'
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
    'KRONOS', 'PALADIN', 'VARGUR', 'GOLEM', 'ARKONOR', 'DARKOCHRE', 'CROKITE'
  ],
  wormhole: [
    // Harder words - Sleeper/Thera themed
    'SLEEPER', 'DRIFTER', 'UNIDENTIFIED', 'WORMHOLE', 'THERA', 'CYPHER', 'ENCRYPTED',
    'ANOMALY', 'SIGNATURE', 'COLLAPSE', 'CRITICAL', 'DESTABILIZED', 'MASS', 'TOTAL',
    'VANGUARD', 'WARDEN', 'SENTINEL', 'BARON', 'OVERSEER', 'KEEPER', 'GUARDIAN',
    'NEUTRON', 'PLASMA', 'MAGNETAR', 'PULSAR', 'WOLFRAYET', 'CATACLYSMIC', 'BLACK',
    'REDACTED', 'CLASSIFIED', 'RESTRICTED', 'QUARANTINE', 'ISOLATION', 'CONTAINMENT',
    'ARCHIVE', 'VAULT', 'REPOSITORY', 'CACHE', 'RELIQUARY', 'DATA', 'CORE',
    'BIOMATTER', 'NANITE', 'INFESTATION', 'MUTATION', 'EVOLUTION', 'ADAPTIVE'
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
  };
  description: string;
}

export const SHIPS: Ship[] = [
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
    id: 'tengu',
    name: 'Tengu',
    tier: 4,
    cost: 1_800_000_000,
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
