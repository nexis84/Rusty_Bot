
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
export const HINT_COST = 2000000; // Data Analyzer - reduced from 5M to 2M
export const VOWEL_COST = 1000000;
export const EMERGENCY_BYPASS_COST = 5000000; // Reveals any letter instantly
export const SECURITY_CONNECTIONS_COST = 5000000; // 5M ISK - 25% multiplier boost for 5 rounds

// Standing system - rank up based on total ISK earned
export const STANDING_LEVELS = [
  { name: 'Alpha Clone', threshold: 0, multiplier: 1 },
  { name: 'Beta Clone', threshold: 100_000_000, multiplier: 1.25 },
  { name: 'Delta Clone', threshold: 250_000_000, multiplier: 1.5 },
  { name: 'Epsilon Clone', threshold: 400_000_000, multiplier: 1.75 },
  { name: 'Omega Clone', threshold: 500_000_000, multiplier: 2 }
] as const;

export type StandingLevel = typeof STANDING_LEVELS[number]['name'];

export const getStandingLevel = (totalEarned: number): typeof STANDING_LEVELS[number] => {
  for (let i = STANDING_LEVELS.length - 1; i >= 0; i--) {
    if (totalEarned >= STANDING_LEVELS[i].threshold) {
      return STANDING_LEVELS[i];
    }
  }
  return STANDING_LEVELS[0];
};
