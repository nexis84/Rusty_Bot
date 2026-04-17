import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Database, 
  AlertTriangle, 
  Coins, 
  Activity,
  Search,
  Unlock,
  Skull,
  Terminal,
  Cpu,
  Trophy,
  RotateCcw,
  Clock,
  Target,
  Zap,
  Wrench,
  Battery,
  Package
} from 'lucide-react';
import { Tooltip } from './components/Tooltip';
import { HackingGrid } from './components/HackingGrid';
import { 
  WORD_BANK, 
  DIFFICULTY_SETTINGS, 
  INITIAL_ISK, 
  HINT_COST, 
  VOWEL_COST,
  EMERGENCY_BYPASS_COST,
  STANDING_LEVELS,
  getStandingLevel,
  SHIPS,
  type Ship
} from './constants';

type GameStatus = 'playing' | 'won' | 'lost';
type Difficulty = 'highsec' | 'nullsec' | 'streamer' | 'wormhole';

// User ID management
const getUserId = (): string => {
  let userId = localStorage.getItem('sleeper_user_id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('sleeper_user_id', userId);
  }
  return userId;
};

// --- Docking Mechanic State ---
const getDockedState = () => {
  const stored = localStorage.getItem('sleeper_docked');
  return stored === null ? true : stored === 'true';
};

const setDockedState = (docked: boolean) => {
  localStorage.setItem('sleeper_docked', docked ? 'true' : 'false');
};

// ISK persistence
const getStoredIsk = (): number => {
  const userId = getUserId();
  const stored = localStorage.getItem(`sleeper_isk_${userId}`);
  return stored ? parseInt(stored, 10) : INITIAL_ISK;
};

const storeIsk = (isk: number): void => {
  const userId = getUserId();
  localStorage.setItem(`sleeper_isk_${userId}`, isk.toString());
};

// Total earned persistence for standing system
const getStoredTotalEarned = (): number => {
  const userId = getUserId();
  const stored = localStorage.getItem(`sleeper_total_earned_${userId}`);
  return stored ? parseInt(stored, 10) : 0;
};

const storeTotalEarned = (total: number): void => {
  const userId = getUserId();
  localStorage.setItem(`sleeper_total_earned_${userId}`, total.toString());
};

// Ship inventory persistence
const getStoredShips = (): string[] => {
  const userId = getUserId();
  const stored = localStorage.getItem(`sleeper_ships_${userId}`);
  return stored ? JSON.parse(stored) : [];
};

const storeShip = (shipId: string): void => {
  const userId = getUserId();
  const ships = getStoredShips();
  if (!ships.includes(shipId)) {
    ships.push(shipId);
    localStorage.setItem(`sleeper_ships_${userId}`, JSON.stringify(ships));
  }
};

const getActiveShip = (): string | null => {
  const userId = getUserId();
  return localStorage.getItem(`sleeper_active_ship_${userId}`);
};

const setActiveShip = (shipId: string | null): void => {
  const userId = getUserId();
  if (shipId) {
    localStorage.setItem(`sleeper_active_ship_${userId}`, shipId);
  } else {
    localStorage.removeItem(`sleeper_active_ship_${userId}`);
  }
};

const SECURITY_CONNECTIONS_UNLOCK_THRESHOLD = 100000000; // 100M lifetime earned to unlock (Beta Clone tier)
const SECURITY_CONNECTIONS_COST = 10000000; // 10M ISK - 25% multiplier boost for 5 rounds
const SECURITY_CONNECTIONS_COOLDOWN_GAMES = 10; // Must play 10 games between purchases

// Security Connections booster persistence
const getStoredBooster = (): { active: boolean; roundsRemaining: number; gamesSinceLastPurchase: number } => {
  const userId = getUserId();
  const active = localStorage.getItem(`sleeper_booster_active_${userId}`) === 'true';
  const roundsRemaining = parseInt(localStorage.getItem(`sleeper_booster_rounds_${userId}`) || '0', 10);
  const gamesSinceLastPurchase = parseInt(localStorage.getItem(`sleeper_booster_cooldown_${userId}`) || '10', 10);
  return { active, roundsRemaining, gamesSinceLastPurchase };
};

const storeBooster = (active: boolean, roundsRemaining: number, gamesSinceLastPurchase: number): void => {
  const userId = getUserId();
  localStorage.setItem(`sleeper_booster_active_${userId}`, active.toString());
  localStorage.setItem(`sleeper_booster_rounds_${userId}`, roundsRemaining.toString());
  localStorage.setItem(`sleeper_booster_cooldown_${userId}`, gamesSinceLastPurchase.toString());
};

// Tool inventory persistence
const getStoredTools = (): { dataAnalyzers: number; emergencyBypasses: number; cargoScanners: number } => {
  const userId = getUserId();
  const dataAnalyzers = parseInt(localStorage.getItem(`sleeper_tools_analyzer_${userId}`) || '0', 10);
  const emergencyBypasses = parseInt(localStorage.getItem(`sleeper_tools_bypass_${userId}`) || '0', 10);
  const cargoScanners = parseInt(localStorage.getItem(`sleeper_tools_scanner_${userId}`) || '0', 10);
  return { dataAnalyzers, emergencyBypasses, cargoScanners };
};

const storeTools = (dataAnalyzers: number, emergencyBypasses: number, cargoScanners: number): void => {
  const userId = getUserId();
  localStorage.setItem(`sleeper_tools_analyzer_${userId}`, dataAnalyzers.toString());
  localStorage.setItem(`sleeper_tools_bypass_${userId}`, emergencyBypasses.toString());
  localStorage.setItem(`sleeper_tools_scanner_${userId}`, cargoScanners.toString());
};

export default function App() {
    // Docked/undocked state
    const [docked, setDocked] = useState(getDockedState());

    // Keep docked state in sync with localStorage
    useEffect(() => {
      setDockedState(docked);
    }, [docked]);
  const [word, setWord] = useState('');
  const [guessedLetters, setGuessedLetters] = useState<string[]>([]);
  const [isk, setIsk] = useState(getStoredIsk());
  const [totalEarned, setTotalEarned] = useState(getStoredTotalEarned());
  const [status, setStatus] = useState<GameStatus>('playing');
  const [difficulty, setDifficulty] = useState<Difficulty>('highsec');
  const [oxygen, setOxygen] = useState(120); // Seconds
  const [message, setMessage] = useState('ENCRYPTION BREACH IN PROGRESS...');
  const [showExplosion, setShowExplosion] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showDockedWin, setShowDockedWin] = useState(false);
  const [runEarnings, setRunEarnings] = useState(0);
  const [runRoundsCompleted, setRunRoundsCompleted] = useState(0);
  const [runTotalTime, setRunTotalTime] = useState(0);
  const [showDifficultyOptions, setShowDifficultyOptions] = useState(false);
  // Track ISK at start of run
  const runStartIskRef = useRef(isk);
  const roundStartTimeRef = useRef(Date.now());

  // When docking, reset run start ISK
  useEffect(() => {
    if (docked) {
      runStartIskRef.current = isk;
      setRunRoundsCompleted(0);
      setRunTotalTime(0);
    }
  }, [docked, isk]);

  // Auto-Scaling State
  const [scale, setScale] = useState(1);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        // Master resolution target: exactly 1920x1080 (1080p standard)
        const widthRatio = window.innerWidth / 1920;
        const heightRatio = window.innerHeight / 1080;
        setScale(Math.min(widthRatio, heightRatio));
      } else {
        setScale(1);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Tool inventory state
  const storedTools = getStoredTools();
  const [dataAnalyzers, setDataAnalyzers] = useState(storedTools.dataAnalyzers);
  const [emergencyBypasses, setEmergencyBypasses] = useState(storedTools.emergencyBypasses);
  const [cargoScanners, setCargoScanners] = useState(storedTools.cargoScanners);

  // Security Connections booster state
  const storedBooster = getStoredBooster();
  const [boosterActive, setBoosterActive] = useState(storedBooster.active);
  const [boosterRounds, setBoosterRounds] = useState(storedBooster.roundsRemaining);
  const [gamesSinceBooster, setGamesSinceBooster] = useState(storedBooster.gamesSinceLastPurchase);

  // Clone rank-up announcement state
  const [showRankUp, setShowRankUp] = useState(false);
  const [newRank, setNewRank] = useState<string>('');

  // Ship state
  const [ownedShips, setOwnedShips] = useState<string[]>(getStoredShips());
  // Always persist and load the equipped ship. Default to 'heron-navy' if none set.
  const getOrSetDefaultActiveShip = () => {
    let id = getActiveShip();
    if (!id) {
      id = 'heron-navy';
      setActiveShip(id);
    }
    return id;
  };
  const [activeShipId, setActiveShipId] = useState<string | null>(getOrSetDefaultActiveShip());
  const [showShipMarket, setShowShipMarket] = useState(false);
  const [marketTab, setMarketTab] = useState<'hints' | 'ships'>('hints'); // Market tab state 

  const activeShip = activeShipId ? SHIPS.find(s => s.id === activeShipId) : null;

  const buyShip = (ship: Ship) => {
    if (isk < ship.cost || ownedShips.includes(ship.id)) return;
    setIsk((prev: number) => prev - ship.cost);
    setOwnedShips((prev: string[]) => [...prev, ship.id]);
    storeShip(ship.id);
    // Auto-equip if first ship
    if (!activeShipId) {
      setActiveShipId(ship.id);
      setActiveShip(ship.id);
    }
  };

  const equipShip = (shipId: string | null) => {
    setActiveShipId(shipId);
    setActiveShip(shipId);
  };

  // Keep activeShipId in sync with localStorage
  useEffect(() => {
    setActiveShip(activeShipId);
  }, [activeShipId]);

  const isBoosterUnlocked = totalEarned >= SECURITY_CONNECTIONS_UNLOCK_THRESHOLD;
  const isBoosterAvailable = isBoosterUnlocked && !boosterActive && gamesSinceBooster >= SECURITY_CONNECTIONS_COOLDOWN_GAMES;

  const startNewGame = useCallback((diff: Difficulty = difficulty) => {
    const bank = WORD_BANK[diff];
    const settings = DIFFICULTY_SETTINGS[diff];
    
    // Decrement booster rounds if active, otherwise increment cooldown counter
    if (boosterActive && boosterRounds > 0) {
      const newRounds = boosterRounds - 1;
      setBoosterRounds(newRounds);
      if (newRounds <= 0) {
        setBoosterActive(false);
        storeBooster(false, 0, gamesSinceBooster + 1);
      } else {
        storeBooster(true, newRounds, gamesSinceBooster);
      }
    } else {
      // Increment games since last booster purchase (cap at cooldown limit)
      const newCooldown = Math.min(gamesSinceBooster + 1, SECURITY_CONNECTIONS_COOLDOWN_GAMES);
      setGamesSinceBooster(newCooldown);
      storeBooster(boosterActive, boosterRounds, newCooldown);
    }
    
    // Pick random word from bank
    const newWord = bank[Math.floor(Math.random() * bank.length)];
    
    setWord(newWord);
    setGuessedLetters([]);
    setStatus('playing');
    setShowExplosion(false);
    setShowSuccess(false);
    setShowGameOver(false);
    // Reset round timer
    roundStartTimeRef.current = Date.now();
    // Apply ship timer bonus
    const shipTimerBonus = activeShip?.bonuses.timerBonus || 0;
    setOxygen(settings.timer + shipTimerBonus);
    
    // Apply ship free tools at game start
    const freeAnalyzers = activeShip?.bonuses.freeDataAnalyzer || 0;
    const freeScanners = activeShip?.bonuses.freeCargoScanner || 0;
    const freeBypasses = activeShip?.bonuses.freeEmergencyBypass || 0;
    if (freeAnalyzers > 0) setDataAnalyzers((prev: number) => prev + freeAnalyzers);
    if (freeScanners > 0) setCargoScanners((prev: number) => prev + freeScanners);
    if (freeBypasses > 0) setEmergencyBypasses((prev: number) => prev + freeBypasses);
    
    // Loki: Predator Instinct - auto-reveal 1 letter at game start
    if (activeShip?.bonuses.predatorInstinct) {
      const letters = newWord.split('');
      const uniqueLetters = [...new Set(letters)];
      const randomLetter = uniqueLetters[Math.floor(Math.random() * uniqueLetters.length)];
      if (randomLetter) {
        setTimeout(() => {
          setGuessedLetters((prev: string[]) => [...prev, randomLetter]);
        }, 500);
      }
    }
    
    setMessage('ENCRYPTION BREACH IN PROGRESS...');
  }, [difficulty, boosterActive, boosterRounds, gamesSinceBooster, activeShip]);

  useEffect(() => {
    startNewGame();
  }, []);

  const handleLoss = useCallback((msg: string) => {
    setStatus('lost');
    setShowExplosion(true);
    setMessage(msg);
    setTimeout(() => {
      setShowExplosion(false);
      setShowGameOver(true);
    }, 2000);
  }, []);

  const handleWin = useCallback((baseReward: number) => {
    const standing = getStandingLevel(totalEarned);
    const boosterMultiplier = boosterActive ? 1.25 : 1;
    // Apply ship ISK multiplier
    const shipMultiplier = activeShip?.bonuses.iskMultiplier || 1;
    // Apply ship booster multiplier bonus (Legion)
    const shipBoosterMultiplier = activeShip?.bonuses.boosterMultiplier || 0;
    const effectiveBoosterMultiplier = boosterActive ? (1.25 + shipBoosterMultiplier) : 1;
    const actualReward = Math.floor(baseReward * standing.multiplier * shipMultiplier * effectiveBoosterMultiplier);
    
    // Track round completion time
    const roundEndTime = Date.now();
    const roundDuration = Math.floor((roundEndTime - roundStartTimeRef.current) / 1000);
    setRunRoundsCompleted(prev => prev + 1);
    setRunTotalTime(prev => prev + roundDuration);
    
    // Check for clone rank-up before updating totalEarned
    const newTotal = totalEarned + actualReward;
    const newStanding = getStandingLevel(newTotal);
    if (newStanding.name !== standing.name) {
      setNewRank(newStanding.name);
      setShowRankUp(true);
      setTimeout(() => setShowRankUp(false), 5000);
    }
    
    setStatus('won');
    setIsk((prev: number) => prev + actualReward);
    setTotalEarned((prev: number) => {
      const newTotal = prev + actualReward;
      localStorage.setItem('totalEarned', newTotal.toString());
      return newTotal;
    });
    const bonusText = boosterActive ? ' (Security Connections +25%)' : '';
    setMessage(`DECRYPTION SUCCESSFUL. RECOVERED ${actualReward.toLocaleString()} ISK.${bonusText}`);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setShowGameOver(true);
    }, 2002);
  }, [totalEarned, boosterActive]);

  // Oxygen/Timer
  useEffect(() => {
    if (status !== 'playing' || docked) return;

    const timer = setInterval(() => {
      setOxygen((prev: number) => {
        const newOxygen = prev - 1;
        return newOxygen;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, handleLoss, docked]);

  const wrongGuesses = guessedLetters.filter((l: string) => !word.includes(l));
  const currentSettings = DIFFICULTY_SETTINGS[difficulty as keyof typeof DIFFICULTY_SETTINGS];
  // Apply extra attempts from ship (Astero)
  const extraAttempts = activeShip?.bonuses.extraAttempts || 0;
  const maxAttempts = currentSettings.attempts + extraAttempts;
  const attemptsRemaining = maxAttempts - wrongGuesses.length;

  useEffect(() => {
    if (attemptsRemaining <= 0 && status === 'playing') {
      handleLoss('GATE GUNS AUTHORIZED LETHAL FORCE. SHIP DESTROYED.');
    }
  }, [attemptsRemaining, status, handleLoss]);

  useEffect(() => {
    if (word && word.split('').every((l: string) => guessedLetters.includes(l)) && status === 'playing') {
      const baseReward = currentSettings.reward;
      handleWin(baseReward);
    }
  }, [guessedLetters, word, status, currentSettings.reward, handleWin]);

  // Persist ISK to localStorage
  useEffect(() => {
    storeIsk(isk);
  }, [isk]);

  // Persist tools to localStorage
  useEffect(() => {
    storeTools(dataAnalyzers, emergencyBypasses, cargoScanners);
  }, [dataAnalyzers, emergencyBypasses, cargoScanners]);

  const handleGuess = (letter: string) => {
    if (status !== 'playing' || guessedLetters.includes(letter)) return;
    setGuessedLetters((prev: string[]) => [...prev, letter]);
  };

  // Calculate effective costs with ship bonuses
  const getEffectiveHintCost = () => {
    const reduction = activeShip?.bonuses.toolCostReduction || 0;
    // Heron Navy only reduces Data Analyzer specifically
    if (activeShip?.id === 'heron-navy') {
      return Math.floor(HINT_COST * 0.80);
    }
    return Math.floor(HINT_COST * (1 - reduction));
  };

  const getEffectiveBypassCost = () => {
    const reduction = activeShip?.bonuses.toolCostReduction || 0;
    // Helios has extra reduction on Emergency Bypass
    if (activeShip?.id === 'helios') {
      return Math.floor(EMERGENCY_BYPASS_COST * 0.70);
    }
    return Math.floor(EMERGENCY_BYPASS_COST * (1 - reduction));
  };

  const effectiveHintCost = getEffectiveHintCost();
  const effectiveBypassCost = getEffectiveBypassCost();

  // Buy tools (store in inventory)
  const buyDataAnalyzer = () => {
    if (isk < effectiveHintCost) return;
    setIsk((prev: number) => prev - effectiveHintCost);
    setDataAnalyzers((prev: number) => prev + 1);
  };

  const buyEmergencyBypass = () => {
    if (isk < effectiveBypassCost) return;
    setIsk((prev: number) => prev - effectiveBypassCost);
    setEmergencyBypasses((prev: number) => prev + 1);
  };

  const buyCargoScanner = () => {
    if (isk < VOWEL_COST) return;
    setIsk((prev: number) => prev - VOWEL_COST);
    setCargoScanners((prev: number) => prev + 1);
  };

  const buySecurityConnections = () => {
    if (!isBoosterAvailable || isk < SECURITY_CONNECTIONS_COST) return;
    setIsk((prev: number) => prev - SECURITY_CONNECTIONS_COST);
    setBoosterActive(true);
    setBoosterRounds(5);
    setGamesSinceBooster(0); // Reset cooldown counter
    storeBooster(true, 5, 0);
  };

  // Use tools from inventory
  const useDataAnalyzer = () => {
    if (dataAnalyzers <= 0 || status !== 'playing') return;
    const unrevealed = word.split('').filter((l: string) => !guessedLetters.includes(l));
    if (unrevealed.length === 0) return;
    const randomLetter = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    setGuessedLetters((prev: string[]) => [...prev, randomLetter]);
    setDataAnalyzers((prev: number) => prev - 1);
  };

  const useEmergencyBypass = () => {
    if (emergencyBypasses <= 0 || status !== 'playing') return;
    const unrevealed = word.split('').filter((l: string) => !guessedLetters.includes(l));
    if (unrevealed.length === 0) return;
    const randomLetter = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    setGuessedLetters((prev: string[]) => [...prev, randomLetter]);
    setEmergencyBypasses((prev: number) => prev - 1);
  };

  const useCargoScanner = () => {
    if (cargoScanners <= 0 || status !== 'playing') return;
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    const unrevealedVowels = vowels.filter(v => word.includes(v) && !guessedLetters.includes(v));
    if (unrevealedVowels.length === 0) return;
    const randomVowel = unrevealedVowels[Math.floor(Math.random() * unrevealedVowels.length)];
    setGuessedLetters((prev: string[]) => [...prev, randomVowel]);
    setCargoScanners((prev: number) => prev - 1);
  };

  const qwerty = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  // Calculate multiplier for display
  const standing = getStandingLevel(totalEarned);
  const currentMultiplier = standing.multiplier;

  return (
    <div className="relative min-h-[100dvh] flex flex-col p-2 lg:p-4 xl:p-6 overflow-x-hidden overflow-y-auto no-scrollbar bg-eve-bg selection:bg-eve-accent selection:text-black">
      <div className="scanline" />

      {/* Decorative Background Text */}
      <div className="fixed top-20 left-10 opacity-10 text-[8px] font-mono pointer-events-none select-none z-0 space-y-1 hidden lg:block">
        <div>&gt; INITIALIZING BREACH PROTOCOL...</div>
        <div>&gt; BYPASSING FACILITY SECURITY...</div>
        <div>&gt; DECRYPTING SECTOR 7 DATABASE...</div>
        <div>&gt; PACKET SNIFFING ACTIVE...</div>
        <div>&gt; ENCRYPTED DATA CORE DETECTED...</div>
        <div>&gt; ATTEMPTING BRUTE FORCE...</div>
        <div>&gt; SIGNAL STRENGTH: 98.4%</div>
        <div>&gt; FACILITY ALERT STATUS: SILENT</div>
      </div>

      {/* Clone Rank-Up Announcement */}
      <AnimatePresence>
        {showRankUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -50 }}
            transition={{ duration: 0.5, type: "spring" }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="bg-black/90 border-2 border-eve-accent p-8 rounded-lg shadow-[0_0_50px_rgba(0,255,255,0.3)] text-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-eve-accent text-xs uppercase tracking-[0.3em] mb-2">Clone Grade Enhanced</div>
                <div className="text-4xl font-display text-white uppercase tracking-widest mb-4">
                  {newRank}
                </div>
                <div className="text-eve-success text-sm uppercase tracking-wider">
                  Multiplier Increased to x{STANDING_LEVELS.find(l => l.name === newRank)?.multiplier.toFixed(2)}
                </div>
                <div className="mt-4 text-[10px] text-white/50 uppercase tracking-wider">
                  Neural pathways synchronized. Enhanced decryption capabilities unlocked.
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-40 right-10 opacity-10 text-[8px] font-mono pointer-events-none select-none z-0 space-y-1 text-right hidden lg:block">
        <div>01001110 01001111 01000100 01000101</div>
        <div>01011000 01011001 01011010 00110001</div>
        <div>MEMORY_DUMP: 0x0045FF21</div>
        <div>STACK_TRACE: SECTOR_7_FAIL</div>
        <div>RECOVERY_KEY: ********</div>
        <div>STATUS: BREACHING...</div>
      </div>

      {/* Difficulty Options Modal */}
      {showDifficultyOptions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-eve-panel p-8 rounded-lg border-2 border-eve-accent shadow-[0_0_50px_rgba(0,255,255,0.3)] max-w-2xl">
            <h2 className="text-2xl font-display text-eve-accent uppercase tracking-wider mb-6">Select Difficulty</h2>
            <div className="flex flex-col gap-3">
              {Object.entries(DIFFICULTY_SETTINGS).map(([key, settings]) => (
                <button
                  key={key}
                  onClick={() => {
                    setDifficulty(key as Difficulty);
                    setShowDifficultyOptions(false);
                    setShowGameOver(false);
                    startNewGame(key as Difficulty);
                  }}
                  className={`px-6 py-4 text-sm font-bold uppercase tracking-wide rounded-lg transition-all border-2 ${
                    difficulty === key 
                      ? 'bg-eve-accent text-black border-eve-accent' 
                      : 'bg-black/40 text-white border-white/20 hover:border-eve-accent/50 hover:bg-eve-accent/10'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span>{settings.label}</span>
                    <span className="text-xs opacity-70">{settings.system}</span>
                  </div>
                </button>
              ))}
              <button
                onClick={() => setShowDifficultyOptions(false)}
                className="mt-4 px-6 py-2 text-sm uppercase bg-transparent border border-white/30 text-white hover:bg-white/10 transition-all rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col lg:flex-row justify-between items-center z-20 mb-2 lg:mb-4 border-b border-eve-accent/20 pb-2 gap-2">
        <div className="flex items-center gap-2 lg:gap-4">
          <Terminal className="text-eve-accent w-5 h-5 lg:w-6 lg:h-6" />
          <h1 className="font-display text-sm md:text-lg lg:text-xl tracking-widest text-white text-center lg:text-left">
            SLEEPER ARCHIVE: <span className="text-eve-accent">UNSECURED ENCRYPTION NODE</span>
          </h1>
        </div>
          <div className="flex flex-col sm:flex-row gap-2 lg:gap-6 items-center">
            <div className="flex items-center gap-2 text-[10px] lg:text-xs opacity-50">
              <Cpu className="w-3 h-3" />
              <span>SYSTEM: {currentSettings.system}</span>
            </div>
            <div className="flex gap-1 bg-black/40 p-1 border border-white/10">
              {Object.entries(DIFFICULTY_SETTINGS).map(([key, settings]) => (
                <button 
                  key={key}
                  onClick={() => { setDifficulty(key as Difficulty); startNewGame(key as Difficulty); }}
                  className={`px-2 lg:px-3 py-1 text-[8px] lg:text-[10px] font-bold transition-all ${difficulty === key ? (key === 'highsec' ? 'bg-eve-accent text-black' : key === 'streamer' ? 'bg-purple-500 text-white' : key === 'wormhole' ? 'bg-purple-600 text-white' : 'bg-eve-danger text-black') : (key === 'highsec' ? 'text-eve-accent hover:bg-eve-accent/10' : key === 'streamer' ? 'text-purple-400 hover:bg-purple-500/10' : key === 'wormhole' ? 'text-purple-500 hover:bg-purple-600/10' : 'text-eve-danger hover:bg-eve-danger/10')}`}
                >
                  {settings.label}
                </button>
              ))}
            </div>
          </div>
      </header>

      {/* Main Layout Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 z-10 overflow-y-auto lg:overflow-visible">
        
        {/* Left Column: Tactical Overview & Loadout */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-4 lg:gap-6">
          <div className="panel-border bg-eve-panel p-4 flex-1 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-eve-accent/20 pb-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-eve-accent" />
              Tactical Overview
            </h2>
            <ul className="space-y-3 text-[11px] font-mono uppercase">
              <li className="flex justify-between">
                <span className="opacity-50">Operative:</span>
                <span className="text-eve-accent">Covert Ops Agent</span>
              </li>
              <li className="flex justify-between">
                <span className="opacity-50">Facility:</span>
                <span className="text-eve-accent">Serpentis Covert Research</span>
              </li>
              <li className="flex justify-between">
                <span className="opacity-50">Location:</span>
                <span className="text-eve-accent">CLASSIFIED</span>
              </li>
              <li className="flex justify-between">
                <span className="opacity-50">Security Level:</span>
                <span className="text-eve-accent">CLASSIFIED</span>
              </li>
            </ul>

            <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-1">
              <span className="text-[10px] opacity-50 uppercase">Active Hull</span>
              <span className="text-lg font-bold text-eve-accent uppercase tracking-widest">
                {activeShip?.name || 'Heron'}
              </span>
              <span className="text-base font-bold text-white/90 mt-1" style={{lineHeight: '1.3'}}>{activeShip?.description || 'Tech I Exploration Frigate'}</span>
            </div>
          </div>

          {/* Tactical Loadout - Under Tactical Overview */}
          <div className="panel-border bg-eve-panel p-4 flex-1 flex flex-col justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-eve-accent/20 pb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-eve-accent" />
              Tactical Loadout
            </h2>
            <div className="space-y-3">
              {/* Data Analyzer */}
              <div className="flex items-center justify-between p-2 bg-black/40 border border-white/10">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-eve-accent" />
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold">Data Analyzer</span>
                    <span className="text-[9px] opacity-50">Reveals any letter</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-display text-eve-accent">{dataAnalyzers}</span>
                  <button
                    onClick={useDataAnalyzer}
                    disabled={dataAnalyzers <= 0 || status !== 'playing'}
                    className="px-2 py-1 text-[9px] uppercase bg-eve-accent/20 border border-eve-accent/50 text-eve-accent hover:bg-eve-accent/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                  >
                    USE
                  </button>
                </div>
              </div>

              {/* Emergency Bypass */}
              <div className="flex items-center justify-between p-2 bg-black/40 border border-white/10">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-eve-warning" />
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-eve-warning">Emergency Bypass</span>
                    <span className="text-[9px] opacity-50">Instant reveal</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-display text-eve-warning">{emergencyBypasses}</span>
                  <button
                    onClick={useEmergencyBypass}
                    disabled={emergencyBypasses <= 0 || status !== 'playing'}
                    className="px-2 py-1 text-[9px] uppercase bg-eve-warning/20 border border-eve-warning/50 text-eve-warning hover:bg-eve-warning/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                  >
                    USE
                  </button>
                </div>
              </div>

              {/* Cargo Scanner */}
              <div className="flex items-center justify-between p-2 bg-black/40 border border-white/10">
                <div className="flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-eve-success" />
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-eve-success">Cargo Scanner</span>
                    <span className="text-[9px] opacity-50">Reveals vowels</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-display text-eve-success">{cargoScanners}</span>
                  <button
                    onClick={useCargoScanner}
                    disabled={cargoScanners <= 0 || status !== 'playing'}
                    className="px-2 py-1 text-[9px] uppercase bg-eve-success/20 border border-eve-success/50 text-eve-success hover:bg-eve-success/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                  >
                    USE
                  </button>
                </div>
              </div>

              {dataAnalyzers === 0 && emergencyBypasses === 0 && cargoScanners === 0 && (
                <div className="text-[10px] opacity-40 italic text-center py-2">
                  No tools in inventory. Purchase from The Market.
                </div>
              )}
            </div>
          </div>

          {/* Security Overload Gauge */}
          <div className="panel-border bg-eve-panel p-4 xl:p-6 flex-1 flex flex-col items-center justify-center gap-2 xl:gap-4">
            <h2 className="text-[10px] xl:text-xs font-bold uppercase tracking-widest mb-2 border-b border-eve-danger/20 pb-2 flex items-center gap-2 text-eve-danger">
              <AlertTriangle className="w-3 h-3 xl:w-4 xl:h-4" />
              Security Overload
            </h2>
            <div className="relative w-20 h-20 xl:w-32 xl:h-32">
              <svg viewBox="0 0 128 128" className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-white/5"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={364}
                  animate={{ strokeDashoffset: 364 - (364 * (wrongGuesses.length / maxAttempts)) }}
                  className="text-eve-danger"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {docked ? (
                  <span className="text-lg xl:text-xl font-display text-eve-accent">DOCKED</span>
                ) : (
                  <>
                    <span className="text-2xl font-display text-eve-danger">{wrongGuesses.length}</span>
                    <span className="text-[8px] uppercase opacity-50">/{maxAttempts} Failures</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-center mt-auto">
              <div className="text-[9px] xl:text-[10px] font-bold uppercase tracking-widest text-eve-danger animate-pulse">
                {docked ? 'Docked at Station' : wrongGuesses.length === 0 ? 'System Stable' : wrongGuesses.length < maxAttempts / 2 ? 'Intrusion Detected' : wrongGuesses.length < maxAttempts - 2 ? 'Security Alert' : 'CRITICAL OVERLOAD'}
              </div>
              <div className="text-[7px] xl:text-[8px] uppercase opacity-40 mt-1">
                {docked ? 'Protocol: Safe Harbor' : 'Protocol: Breach Detection'}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Main Game Area */}
        <div className="col-span-1 lg:col-span-6 flex flex-col items-center justify-center py-1 min-h-[54vh] lg:min-h-0">
          {docked ? (
            <div className="w-full flex flex-col items-center justify-center gap-8 p-8 bg-black/80 rounded-lg border border-eve-accent/30 shadow-lg">
              <h1 className="text-3xl font-bold mb-2 text-eve-accent">Docked at Station</h1>
              <p className="mb-4 text-lg opacity-80 text-white">Select your ship and difficulty, then undock to begin hacking and collecting loot!</p>

              {/* Ship Selection */}
              <div className="w-full max-w-xl mx-auto mb-6">
                <div className="text-xs uppercase font-bold text-eve-accent mb-2">Select Ship</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ownedShips.map(shipId => {
                    const ship = SHIPS.find(s => s.id === shipId);
                    if (!ship) return null;
                    const isEquipped = activeShipId === ship.id;
                    return (
                      <button
                        key={ship.id}
                        onClick={() => equipShip(ship.id)}
                        className={`p-4 border rounded-lg flex flex-col items-start transition-all ${isEquipped ? 'border-eve-success bg-eve-success/10' : 'border-eve-accent/30 bg-black/40 hover:border-eve-accent/80'}`}
                      >
                        <span className="text-base font-bold text-eve-accent">{ship.name}</span>
                        <span className="text-xs text-white/80 mb-2">{ship.description}</span>
                        {isEquipped && <span className="text-[10px] text-eve-success uppercase">Equipped</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Difficulty Selection */}
              <div className="w-full max-w-md mx-auto mb-6">
                <div className="text-xs uppercase font-bold text-eve-accent mb-2">Select Difficulty</div>
                <div className="flex gap-2 justify-center">
                  {Object.entries(DIFFICULTY_SETTINGS).map(([key, settings]) => (
                    <button
                      key={key}
                      onClick={() => setDifficulty(key as Difficulty)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all border-2 ${difficulty === key ? (key === 'highsec' ? 'bg-eve-accent text-black border-eve-accent' : key === 'streamer' ? 'bg-purple-500 text-white border-purple-500' : key === 'wormhole' ? 'bg-purple-600 text-white border-purple-600' : 'bg-eve-danger text-black border-eve-danger') : 'border-white/20 text-white/70 hover:border-eve-accent/50'}`}
                    >
                      {settings.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="px-8 py-4 bg-eve-accent text-black text-xl font-bold rounded-lg shadow-lg hover:bg-eve-accent/80 transition-all mt-4"
                onClick={() => { setDocked(false); startNewGame(difficulty); }}
              >
                Undock
              </button>
            </div>
          ) : (
            <>
              {/* Status Bar */}
              <div className="w-full space-y-3">
                <div className="text-center">
                  <div className="text-sm md:text-base uppercase font-bold tracking-wider">
                    Encryption Breach Status: <span className={attemptsRemaining < 5 ? 'text-eve-warning' : 'text-eve-accent'}>
                      {status === 'lost' ? 'TERMINATED' : status === 'won' ? 'SECURED' : attemptsRemaining < 5 ? 'WARNING' : 'STABLE'} ({wrongGuesses.length}/{maxAttempts} ATTEMPTS)
                    </span>
                  </div>
                </div>
                <div className="segmented-bar h-6">
                  {Array.from({ length: maxAttempts }).map((_, i) => (
                    <div 
                      key={i} 
                      className={`segment transition-all duration-300 ${i < (currentSettings.attempts - attemptsRemaining) ? 'active' : ''}`} 
                    />
                  ))}
                </div>
              </div>

              {/* Word Display */}
              <div className="flex flex-wrap justify-center gap-4 my-4">
                {word.split('').map((char, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`text-6xl md:text-8xl font-display transition-all ${guessedLetters.includes(char) ? 'text-eve-accent' : 'text-transparent'}`}
                    >
                      {guessedLetters.includes(char) ? char : '?'}
                    </motion.div>
                    {difficulty !== 'wormhole' && (
                      <div className={`w-12 md:w-16 h-1 mt-2 ${guessedLetters.includes(char) ? 'bg-eve-accent' : 'bg-eve-accent/20'}`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Visual Representation - Hacking Grid */}
              <div className="relative w-full h-[40vh] min-h-[220px] xl:h-[45vh] xl:min-h-[280px] max-h-[520px] flex items-center justify-center bg-black/20 rounded-lg border border-white/5 my-2 lg:my-0 overflow-hidden">
                <HackingGrid 
                  key={word} // Force remount when word changes
                  correctGuesses={guessedLetters.filter(l => word.includes(l)).length}
                  totalNodes={19}
                  word={word}
                  guessedLetters={guessedLetters}
                />

                <div className="absolute bottom-[-30px] left-0 right-0 text-center">
                  <div className="text-eve-warning text-[10px] font-bold uppercase tracking-widest">
                    WARNING: FACILITY DEFENSES ACTIVE
                  </div>
                  <div className="text-eve-warning text-[9px] uppercase opacity-70">
                    CONTAINMENT IN {oxygen} SECONDS
                  </div>
                </div>
              </div>

              {/* Keyboard */}
              <div className="w-full space-y-1 mt-2">
                {qwerty.map((row, i) => (
                  <div key={i} className="flex justify-center gap-2">
                    {row.map(letter => {
                      const isGuessed = guessedLetters.includes(letter);
                      const isCorrect = isGuessed && word.includes(letter);
                      const isWrong = isGuessed && !word.includes(letter);

                      return (
                        <motion.button
                          key={letter}
                          whileHover={!isGuessed && status === 'playing' ? { scale: 1.05 } : {}}
                          whileTap={!isGuessed && status === 'playing' ? { scale: 0.95 } : {}}
                          onClick={() => handleGuess(letter)}
                          disabled={isGuessed || status !== 'playing'}
                          className={`
                            w-8 h-8 sm:w-10 sm:h-10 lg:w-9 lg:h-9 xl:w-12 xl:h-12 font-display text-xs lg:text-sm xl:text-lg transition-all border relative overflow-hidden
                            ${isCorrect ? 'bg-eve-accent/30 border-eve-accent text-eve-accent shadow-[0_0_15px_rgba(0,255,255,0.2)]' : 
                              isWrong ? 'bg-black/60 border-eve-danger/20 text-eve-danger/30 line-through grayscale' : 
                              'bg-eve-panel border-white/10 text-white/60 hover:border-eve-accent hover:text-white focus:outline-none focus:ring-1 focus:ring-eve-accent/50'}
                          `}
                        >
                          {/* Status Indicator Corner */}
                          {isCorrect && (
                            <div className="absolute top-0 right-0 w-2 h-2 bg-eve-accent" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                          )}
                          {isWrong && (
                            <div className="absolute top-0 right-0 w-2 h-2 bg-eve-danger/50" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                          )}
                          
                          <span className="relative z-10">{letter}</span>
                          
                          {/* Scanline effect on keys */}
                          <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
                        </motion.button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right Sidebar: Clone State, Market & Timer */}
        <div className="col-span-1 lg:col-span-3 flex flex-col gap-4 lg:gap-6">
          {/* Clone State Panel */}
          <div className="panel-border bg-eve-panel p-4 flex-1 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-eve-accent/20 pb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-eve-accent" />
              Clone Status
            </h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] opacity-50 uppercase">Current Grade:</span>
                <span className={`text-lg font-bold ${getStandingLevel(totalEarned).name === 'Omega Clone' ? 'text-eve-warning' : 'text-eve-accent'}`}>
                  {getStandingLevel(totalEarned).name}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] opacity-50 uppercase">Active Ship:</span>
                <span className="text-sm font-bold text-eve-accent">
                  {activeShip?.name || 'None Equipped'}
                </span>
                {activeShip && (
                  <span className="text-[9px] opacity-60">
                    {activeShip.description}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] opacity-50 uppercase">ISK Multiplier:</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-display text-white">
                    x{(getStandingLevel(totalEarned).multiplier * (boosterActive ? 1.25 : 1) * (activeShip?.bonuses.iskMultiplier || 1)).toFixed(2)}
                  </span>
                  {boosterActive && (
                    <span className="text-[10px] text-eve-success">(+25% Security Connections)</span>
                  )}
                  {activeShip?.bonuses.iskMultiplier && activeShip.bonuses.iskMultiplier > 1 && (
                    <span className="text-[10px] text-eve-accent">(+{Math.round((activeShip.bonuses.iskMultiplier - 1) * 100)}% Ship)</span>
                  )}
                </div>
                <span className="text-[9px] opacity-40">
                  Base: x{getStandingLevel(totalEarned).multiplier}
                  {activeShip?.bonuses.iskMultiplier && activeShip.bonuses.iskMultiplier > 1 && ` × ${activeShip.bonuses.iskMultiplier.toFixed(2)} Ship`}
                  {boosterActive && ` × 1.25 Security Connections`}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] opacity-50 uppercase">Lifetime Earnings:</span>
                <span className="text-sm text-eve-accent">{totalEarned.toLocaleString()} ISK</span>
              </div>
              {getStandingLevel(totalEarned).name !== 'Omega Clone' && (
                <div className="pt-2 border-t border-white/10">
                  <span className="text-[9px] opacity-40 uppercase">
                    Next: {STANDING_LEVELS.find(l => l.threshold > totalEarned)?.name} @ {STANDING_LEVELS.find(l => l.threshold > totalEarned)?.threshold.toLocaleString()} ISK
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="panel-border bg-eve-panel p-4 flex-1 flex flex-col">
            <div className="mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                <Coins className="w-4 h-4 text-eve-accent" />
                The Market
              </h2>
              {/* Tabs */}
              <div className="flex gap-2 border-b border-eve-accent/20">
                <button
                  onClick={() => setMarketTab('hints')}
                  className={`flex-1 py-2 text-[10px] uppercase font-bold transition-all border-b-2 ${marketTab === 'hints' ? 'border-eve-accent text-eve-accent' : 'border-transparent text-white/50 hover:text-white/70'}`}
                >
                  Hints
                </button>
                <button
                  onClick={() => setMarketTab('ships')}
                  className={`flex-1 py-2 text-[10px] uppercase font-bold transition-all border-b-2 ${marketTab === 'ships' ? 'border-eve-accent text-eve-accent' : 'border-transparent text-white/50 hover:text-white/70'}`}
                >
                  Ships ({ownedShips.length})
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {marketTab === 'hints' && (
                <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] opacity-50 uppercase">Current Balance:</span>
                <span className="text-xl text-eve-accent font-bold">{isk.toLocaleString()} ISK</span>
                {getStandingLevel(totalEarned).multiplier > 1 && (
                  <span className="text-[10px] text-eve-warning">
                    {getStandingLevel(totalEarned).name} Bonus: x{getStandingLevel(totalEarned).multiplier} ISK
                  </span>
                )}
              </div>
              
              <Tooltip 
                content="Scan cargo manifests to detect contraband vowels hidden in encrypted data. Reveals a random vowel (A, E, I, O, U). Stores in inventory."
                subContent={`Cost: ${VOWEL_COST.toLocaleString()} ISK`}
                position="left"
              >
                <button 
                  onClick={buyCargoScanner}
                  disabled={isk < VOWEL_COST}
                  className="w-full flex justify-between items-center p-3 border border-eve-success/30 bg-eve-success/5 hover:bg-eve-success/10 disabled:opacity-20 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <Unlock className="w-3 h-3 text-eve-success" />
                    <span className="text-[10px] uppercase font-bold">Buy Cargo Scanner</span>
                  </div>
                  <span className="text-[11px] font-bold text-eve-success">{VOWEL_COST.toLocaleString()} ISK</span>
                </button>
              </Tooltip>

              <Tooltip 
                content="Deploy a specialized data analyzer to decrypt a random unrevealed letter in the target payload. Stores in inventory for later use."
                subContent={`Cost: ${effectiveHintCost.toLocaleString()} ISK${activeShip?.bonuses.toolCostReduction ? ` (${Math.round((1 - (activeShip?.id === 'heron-navy' ? 0.8 : 1 - activeShip.bonuses.toolCostReduction)) * 100)}% ship discount)` : ''}`}
                position="left"
              >
                <button 
                  onClick={buyDataAnalyzer}
                  disabled={isk < effectiveHintCost}
                  className="w-full flex justify-between items-center p-3 border border-eve-accent/30 bg-eve-accent/5 hover:bg-eve-accent/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <Search className="w-3 h-3 text-eve-accent" />
                    <span className="text-[10px] uppercase font-bold">Buy Data Analyzer</span>
                  </div>
                  <span className="text-[11px] font-bold text-eve-accent">{effectiveHintCost.toLocaleString()} ISK</span>
                </button>
              </Tooltip>

              <Tooltip 
                content="Emergency protocol bypass - reveals any letter instantly. High-tech solution for critical situations. Stores in inventory."
                subContent={`Cost: ${effectiveBypassCost.toLocaleString()} ISK${activeShip?.bonuses.toolCostReduction || activeShip?.id === 'helios' ? ` (${Math.round((1 - (activeShip?.id === 'helios' ? 0.7 : 1 - (activeShip?.bonuses.toolCostReduction || 0))) * 100)}% ship discount)` : ''}`}
                position="left"
              >
                <button 
                  onClick={buyEmergencyBypass}
                  disabled={isk < effectiveBypassCost}
                  className="w-full flex justify-between items-center p-3 border border-eve-warning/50 bg-eve-warning/5 hover:bg-eve-warning/10 disabled:opacity-20 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-eve-warning" />
                    <span className="text-[10px] uppercase font-bold">Emergency Bypass</span>
                  </div>
                  <span className="text-[11px] font-bold text-eve-warning">{effectiveBypassCost.toLocaleString()} ISK</span>
                </button>
              </Tooltip>

              <Tooltip 
                content={`Security Connections booster - temporarily increases ISK multiplier by 25% for the next 5 successful data breaches.${!isBoosterUnlocked ? ` Unlocks at ${SECURITY_CONNECTIONS_UNLOCK_THRESHOLD.toLocaleString()} ISK lifetime earnings.` : gamesSinceBooster < SECURITY_CONNECTIONS_COOLDOWN_GAMES ? ` Available in ${SECURITY_CONNECTIONS_COOLDOWN_GAMES - gamesSinceBooster} more games.` : ''}`}
                subContent={boosterActive ? `${boosterRounds} rounds remaining` : isBoosterAvailable ? `${SECURITY_CONNECTIONS_COST.toLocaleString()} ISK - AVAILABLE` : !isBoosterUnlocked ? `LOCKED (${totalEarned.toLocaleString()}/${SECURITY_CONNECTIONS_UNLOCK_THRESHOLD.toLocaleString()} ISK)` : `COOLDOWN (${gamesSinceBooster}/${SECURITY_CONNECTIONS_COOLDOWN_GAMES} games)`}
                position="left"
              >
                <button 
                  onClick={buySecurityConnections}
                  disabled={!isBoosterAvailable || isk < SECURITY_CONNECTIONS_COST}
                  className={`w-full flex justify-between items-center p-3 border transition-all group ${boosterActive ? 'border-eve-success/50 bg-eve-success/10' : isBoosterAvailable ? 'border-eve-accent/30 bg-eve-accent/5 hover:bg-eve-accent/10' : 'border-white/10 bg-black/40 opacity-50'}`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className={`w-3 h-3 ${boosterActive ? 'text-eve-success' : isBoosterAvailable ? 'text-eve-accent' : 'text-white/30'}`} />
                    <span className={`text-[10px] uppercase font-bold ${boosterActive ? 'text-eve-success' : isBoosterAvailable ? '' : 'text-white/50'}`}>
                      {boosterActive ? 'Security Connections Active' : isBoosterAvailable ? 'Buy Security Connections' : !isBoosterUnlocked ? 'Security Connections Locked' : 'Security Connections Cooldown'}
                    </span>
                  </div>
                  <span className={`text-[11px] font-bold ${boosterActive ? 'text-eve-success' : isBoosterAvailable ? 'text-eve-accent' : 'text-white/50'}`}>
                    {boosterActive ? `${boosterRounds} ROUNDS` : isBoosterAvailable ? `${SECURITY_CONNECTIONS_COST.toLocaleString()} ISK` : !isBoosterUnlocked ? 'LOCKED' : `${gamesSinceBooster}/${SECURITY_CONNECTIONS_COOLDOWN_GAMES}`}
                  </span>
                </button>
              </Tooltip>

              {/* Remove old Ship Market Button - now in tabs */}
              </div>
              )}

              {marketTab === 'ships' && (
                <div className="space-y-4 max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-theme">
                  {/* Current Balance */}
                  <div className="flex flex-col gap-1 pb-4 border-b border-white/10">
                    <span className="text-[10px] opacity-50 uppercase">Current Balance:</span>
                    <span className="text-xl text-eve-accent font-bold">{isk.toLocaleString()} ISK</span>
                  </div>

                  {/* Active Ship */}
                  {activeShip && (
                    <div className="bg-eve-accent/10 border border-eve-accent/30 p-3">
                      <div className="text-[9px] opacity-50 uppercase mb-1">Currently Equipped</div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-xs font-bold text-eve-accent">{activeShip.name}</div>
                          <div className="text-[9px] opacity-70">{activeShip.description}</div>
                        </div>
                        <button
                          onClick={() => equipShip(null)}
                          className="px-2 py-1 text-[9px] uppercase border border-white/20 hover:bg-white/10 transition-all"
                        >
                          Unequip
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Ships by Tier */}
                  {[1, 2, 3, 4].map(tier => {
                    const tierShips = SHIPS.filter(s => s.tier === tier);
                    const tierNames = ['', 'Frigates', 'Covert Ops', 'Expedition', 'Strategic Cruisers'];
                    return (
                      <div key={tier} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${tier === 1 ? 'bg-gray-400' : tier === 2 ? 'bg-blue-400' : tier === 3 ? 'bg-purple-400' : 'bg-eve-warning'}`} />
                          <h3 className="text-[10px] font-bold uppercase tracking-wider opacity-70">Tier {tier} - {tierNames[tier]}</h3>
                        </div>
                        <div className="space-y-2">
                          {tierShips.map(ship => {
                            const isOwned = ownedShips.includes(ship.id);
                            const isEquipped = activeShipId === ship.id;
                            const canAfford = isk >= ship.cost;
                            return (
                              <div 
                                key={ship.id}
                                className={`p-3 border transition-all ${isEquipped ? 'border-eve-success bg-eve-success/10' : isOwned ? 'border-eve-accent/30 bg-eve-accent/5' : canAfford ? 'border-white/10 bg-black/40 hover:border-eve-accent/50' : 'border-white/5 bg-black/20 opacity-50'}`}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div className="text-[11px] font-bold">{ship.name}</div>
                                  {isEquipped && <span className="text-[8px] text-eve-success uppercase">Equipped</span>}
                                  {isOwned && !isEquipped && <span className="text-[8px] text-eve-accent uppercase">Owned</span>}
                                </div>
                                <div className="text-[9px] opacity-60 mb-2">{ship.description}</div>
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-bold ${canAfford ? 'text-eve-accent' : 'text-eve-danger'}`}>
                                    {ship.cost.toLocaleString()} ISK
                                  </span>
                                  {isOwned ? (
                                    <button
                                      onClick={() => equipShip(isEquipped ? null : ship.id)}
                                      className={`px-2 py-1 text-[9px] uppercase border transition-all ${isEquipped ? 'border-eve-danger/50 text-eve-danger hover:bg-eve-danger/10' : 'border-eve-accent/50 text-eve-accent hover:bg-eve-accent/10'}`}
                                    >
                                      {isEquipped ? 'Unequip' : 'Equip'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => buyShip(ship)}
                                      disabled={!canAfford}
                                      className="px-2 py-1 text-[9px] uppercase border border-eve-accent/50 text-eve-accent hover:bg-eve-accent/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                    >
                                      Buy
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Auto-Destruct Gauge */}
          <div className="panel-border bg-eve-panel p-4 xl:p-6 flex-1 flex flex-col items-center justify-center gap-2 xl:gap-4">
            <div className="relative w-20 h-20 xl:w-32 xl:h-32 mb-auto">
              <svg viewBox="0 0 128 128" className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-white/5"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={364}
                  animate={{ strokeDashoffset: 364 - (364 * (oxygen / currentSettings.timer)) }}
                  className="text-eve-danger"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {docked ? (
                  <span className="text-lg xl:text-xl font-display text-eve-accent">DOCKED</span>
                ) : (
                  <>
                    <span className="text-2xl font-display text-eve-danger">{oxygen}</span>
                    <span className="text-[8px] uppercase opacity-50">Seconds</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-eve-danger animate-pulse">
                {docked ? 'Docked at Station' : 'Facility Lockdown'}
              </div>
              <div className="text-[8px] uppercase opacity-40 mt-1">
                {docked ? 'Protocol: Safe Harbor' : 'Protocol: Quarantine Breach'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Game Over Overlays */}
      <AnimatePresence>
        {showGameOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-2xl overflow-hidden panel-border bg-eve-panel relative"
            >
              <div className="h-1 w-full bg-eve-accent shadow-[0_0_15px_rgba(0,255,255,0.5)]" />
              <div className="p-8 md:p-12 space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
                  >
                    <div className="p-4 rounded-full bg-eve-success/10 border border-eve-success/30">
                      <Trophy className="w-16 h-16 text-eve-success" />
                    </div>
                  </motion.div>
                  
                  <div className="space-y-1">
                    <h2 className="font-display text-5xl md:text-6xl uppercase tracking-tighter text-eve-success">Mission Success</h2>
                    <div className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-bold">
                      Aura Tactical Intelligence Report // Ref: {Math.random().toString(16).slice(2, 10).toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Main Content: The Word */}
                <div className="bg-black/40 border border-white/5 p-6 text-center space-y-2 relative group">
                  <div className="text-[10px] uppercase tracking-widest opacity-30">Decryption Target Identified</div>
                  <div className="text-4xl md:text-5xl font-display text-white tracking-[0.3em] font-bold">
                    {word}
                  </div>
                  <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20" />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-black/60 border border-white/10 flex flex-col items-center justify-center text-center">
                    <Coins className="w-4 h-4 text-eve-accent mb-2 opacity-50" />
                    <div className="text-[9px] uppercase opacity-40 mb-1">Final Balance</div>
                    <div className="text-xl font-bold text-eve-accent">{isk.toLocaleString()}</div>
                  </div>
                  <div className="p-4 bg-black/60 border border-white/10 flex flex-col items-center justify-center text-center">
                    <Activity className="w-4 h-4 text-eve-accent mb-2 opacity-50" />
                    <div className="text-[9px] uppercase opacity-40 mb-1">Nodes Exposed</div>
                    <div className="text-xl font-bold text-eve-accent">{guessedLetters.filter(l => word.includes(l)).length}</div>
                  </div>
                  <div className="p-4 bg-black/60 border border-white/10 flex flex-col items-center justify-center text-center">
                    <Target className="w-4 h-4 text-eve-accent mb-2 opacity-50" />
                    <div className="text-[9px] uppercase opacity-40 mb-1">Accuracy</div>
                    <div className="text-xl font-bold text-white">
                      {Math.round(((word.length) / (word.length + wrongGuesses.length)) * 100)}%
                    </div>
                  </div>
                  <div className="p-4 bg-black/60 border border-white/10 flex flex-col items-center justify-center text-center">
                    <Clock className="w-4 h-4 text-eve-accent mb-2 opacity-50" />
                    <div className="text-[9px] uppercase opacity-40 mb-1">Time Left</div>
                    <div className="text-xl font-bold text-white">{oxygen}s</div>
                  </div>
                </div>

                {/* Footer Message */}
                <div className="text-center">
                  <p className="text-xs opacity-60 font-mono italic">
                    "{status === 'won' ? 'Data vault accessed. Extracting classified files. Evacuate immediately.' : 'Security breach detected. Quarantine protocols engaged. Operative status: MIA.'}"
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col md:flex-row gap-4 pt-4">
                  {status === 'won' ? (
                    <>
                      {/* Continue (New Breach) */}
                      <button 
                        onClick={() => { setShowGameOver(false); startNewGame(); }}
                        className="flex-1 min-w-[0] aspect-[1.6/1] py-5 flex items-center justify-center gap-3 font-display text-xl uppercase tracking-[0.2em] bg-eve-success text-black hover:bg-eve-success/80 transition-all group relative overflow-hidden border-2 border-eve-success shadow-lg"
                      >
                        <span className="relative flex items-center w-full justify-center">
                          <RotateCcw className="w-5 h-5 mr-2 transition-transform duration-500 group-hover:rotate-180" />
                          Continue
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                      </button>
                      {/* Dock Up */}
                      <button
                        onClick={() => {
                          setShowGameOver(false);
                          setRunEarnings(isk - runStartIskRef.current);
                          setShowDockedWin(true);
                        }}
                        className="flex-1 min-w-[0] aspect-[1.6/1] py-5 flex items-center justify-center gap-3 font-display text-xl uppercase tracking-[0.2em] bg-eve-accent text-black hover:bg-eve-accent/80 transition-all group relative overflow-hidden border-2 border-eve-accent shadow-lg"
                      >
                        <span className="relative flex items-center w-full justify-center">
                          <Database className="w-5 h-5 mr-2" />
                          Dock Up
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                      </button>
                      {/* Change Difficulty */}
                      <button
                        onClick={() => {
                          setShowDifficultyOptions(true); // Show difficulty options without docking up
                        }}
                        className="flex-1 min-w-[0] aspect-[1.6/1] py-5 flex items-center justify-center gap-3 font-display text-xl uppercase tracking-[0.1em] bg-purple-600 text-white hover:bg-purple-700 transition-all group relative overflow-hidden border-2 border-purple-600 shadow-lg"
                        style={{wordBreak: 'break-word', whiteSpace: 'normal', fontSize: '1.1rem', letterSpacing: '0.08em'}}
                      >
                        <span className="relative flex items-center w-full justify-center text-center">
                          <Wrench className="w-5 h-5 mr-2" />
                          <span className="block">Change<br />Difficulty</span>
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setShowGameOver(false); setDocked(true); startNewGame(); }}
                      className="flex-1 py-5 flex items-center justify-center gap-3 font-display text-xl uppercase tracking-[0.2em] bg-eve-danger text-white hover:bg-eve-danger/90 shadow-[0_0_20px_rgba(239,68,68,0.5)] hover:shadow-[0_0_30px_rgba(239,68,68,0.7)] animate-pulse border-2 border-eve-danger group"
                    >
                      <span className="relative flex items-center">
                        <RotateCcw className="w-5 h-5 mr-2 transition-transform duration-500 group-hover:rotate-180" />
                        Activate New Clone
                      </span>
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                    </button>
                  )}
                </div>
              </div>

              {/* Decorative Corner Accents */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/10" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/10" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Animation */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-eve-accent/10 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-2 border-dashed border-eve-accent rounded-full opacity-30"
                />
                <div className="p-8 rounded-full bg-eve-accent/20 border border-eve-accent shadow-[0_0_30px_rgba(0,255,255,0.4)]">
                  <Database className="w-24 h-24 text-eve-accent" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <h2 className="font-display text-6xl text-eve-accent tracking-tighter uppercase font-bold drop-shadow-[0_0_15px_rgba(0,255,255,0.6)]">
                  Data Secured
                </h2>
                <div className="text-xs uppercase tracking-[0.5em] text-white/60">
                  Transferring Assets to Wallet...
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Docked Win Modal */}
      <AnimatePresence>
        {showDockedWin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-2xl overflow-hidden panel-border bg-eve-panel relative"
            >
              <div className="h-1 w-full bg-eve-accent shadow-[0_0_15px_rgba(0,255,255,0.5)]" />
              <div className="p-8 md:p-12 space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
                  >
                    <div className="p-4 rounded-full bg-eve-accent/10 border border-eve-accent/30">
                      <Database className="w-16 h-16 text-eve-accent" />
                    </div>
                  </motion.div>
                  <div className="space-y-1">
                    <h2 className="font-display text-5xl md:text-6xl uppercase tracking-tighter text-eve-accent">Docking Request Accepted</h2>
                    <div className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-bold">
                      Run Complete // Assets Secured
                    </div>
                  </div>
                </div>
                <div className="bg-black/40 border border-white/5 p-6 text-center space-y-2 relative group">
                  <div className="text-[10px] uppercase tracking-widest opacity-30">Total ISK Earned This Run</div>
                  <div className="text-4xl md:text-5xl font-display text-eve-accent tracking-[0.3em] font-bold">
                    {runEarnings.toLocaleString()} ISK
                  </div>
                  <div className="text-[10px] uppercase tracking-widest opacity-30 mt-4">Average Time Per Round</div>
                  <div className="text-2xl font-display text-white tracking-[0.2em] font-bold">
                    {runRoundsCompleted > 0 ? (runTotalTime / runRoundsCompleted).toFixed(1) : 0}s
                  </div>
                  <div className="text-[10px] uppercase tracking-widest opacity-30 mt-4">ISK Per Round</div>
                  <div className="text-2xl font-display text-white tracking-[0.2em] font-bold">
                    {runRoundsCompleted > 0 ? Math.floor(runEarnings / runRoundsCompleted).toLocaleString() : 0} ISK
                  </div>
                  <div className="text-[10px] uppercase tracking-widest opacity-30 mt-4">Rounds Completed</div>
                  <div className="text-2xl font-display text-white tracking-[0.2em] font-bold">
                    {runRoundsCompleted}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest opacity-30 mt-4">Current Multiplier</div>
                  <div className="text-2xl font-display text-white tracking-[0.2em] font-bold">
                    x{currentMultiplier.toFixed(2)}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 pt-4">
                  <button
                    onClick={() => { 
                      setShowDockedWin(false);
                      setDocked(true);
                    }}
                    className="flex-1 min-w-[0] aspect-[3/1] py-1 px-2 flex items-center justify-center gap-1 font-display text-xs uppercase tracking-[0.1em] bg-eve-accent text-black hover:bg-eve-accent/80 transition-all group relative overflow-hidden border-2 border-eve-accent shadow-lg"
                  >
                    <span className="relative flex items-center w-full justify-center">
                      <RotateCcw className="w-3 h-3 mr-1 transition-transform duration-500 group-hover:rotate-180" />
                      Continue
                    </span>
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                  </button>
                </div>
              </div>
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/10" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/10" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Explosion Animation */}
      <AnimatePresence>
        {showExplosion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black"
          >
            {/* Flash */}
            <motion.div
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 4, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute h-64 w-64 rounded-full bg-white shadow-[0_0_100px_white]"
            />
            
            {/* Shockwave */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0, border: "20px solid white" }}
              animate={{ scale: 3, opacity: 1, border: "0px solid white" }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              className="absolute h-96 w-96 rounded-full border-white/50"
            />

            {/* Particles */}
            {[...Array(30)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                animate={{ 
                  x: (Math.random() - 0.5) * 1200, 
                  y: (Math.random() - 0.5) * 1200,
                  scale: 0,
                  opacity: 0,
                  rotate: Math.random() * 720
                }}
                transition={{ duration: 1.8, ease: "easeOut", delay: 0.2 }}
                className="absolute h-4 w-4 bg-orange-500 shadow-[0_0_15px_#f97316]"
              />
            ))}

            {/* Fireball */}
            <motion.div
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
              className="absolute h-80 w-80 rounded-full bg-gradient-to-r from-orange-600 via-red-500 to-yellow-400 blur-3xl"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="z-10 font-display text-5xl font-bold tracking-[0.5em] text-eve-danger drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]"
            >
              HULL BREACH
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ship Market Modal */}
      <AnimatePresence>
        {showShipMarket && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-5xl max-h-[90vh] overflow-y-auto panel-border bg-eve-panel relative"
            >
              {/* Header */}
              <div className="h-1 w-full bg-eve-accent shadow-[0_0_15px_rgba(0,255,255,0.5)]" />
              
              <div className="p-6 space-y-6">
                {/* Title */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-3xl uppercase tracking-tighter text-eve-accent">
                      Ship Market
                    </h2>
                    <p className="text-[10px] opacity-50 uppercase tracking-wider">
                      CONCORD Licensed Vessel Brokerage
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] opacity-50 uppercase">Current Balance</div>
                    <div className="text-xl font-bold text-eve-accent">{isk.toLocaleString()} ISK</div>
                  </div>
                </div>

                {/* Active Ship Display */}
                {activeShip && (
                  <div className="bg-eve-accent/10 border border-eve-accent/30 p-4">
                    <div className="text-[10px] opacity-50 uppercase mb-1">Currently Equipped</div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold text-eve-accent">{activeShip.name}</div>
                        <div className="text-[10px] opacity-70">{activeShip.description}</div>
                      </div>
                      <button
                        onClick={() => equipShip(null)}
                        className="px-4 py-2 text-[10px] uppercase border border-white/20 hover:bg-white/10 transition-all"
                      >
                        Unequip
                      </button>
                    </div>
                  </div>
                )}

                {/* Ship Grid by Tier */}
                {[1, 2, 3, 4].map(tier => {
                  const tierShips = SHIPS.filter(s => s.tier === tier);
                  const tierNames = ['', 'Frigates', 'Covert Ops', 'Expedition', 'Strategic Cruisers'];
                  return (
                    <div key={tier} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${tier === 1 ? 'bg-gray-400' : tier === 2 ? 'bg-blue-400' : tier === 3 ? 'bg-purple-400' : 'bg-eve-warning'}`} />
                        <h3 className="text-sm font-bold uppercase tracking-wider">Tier {tier} - {tierNames[tier]}</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {tierShips.map(ship => {
                          const isOwned = ownedShips.includes(ship.id);
                          const isEquipped = activeShipId === ship.id;
                          const canAfford = isk >= ship.cost;
                          return (
                            <div 
                              key={ship.id}
                              className={`p-4 border transition-all ${isEquipped ? 'border-eve-success bg-eve-success/10' : isOwned ? 'border-eve-accent/30 bg-eve-accent/5' : canAfford ? 'border-white/10 bg-black/40 hover:border-eve-accent/50' : 'border-white/5 bg-black/20 opacity-50'}`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div className="text-xs font-bold">{ship.name}</div>
                                {isEquipped && <span className="text-[8px] text-eve-success uppercase">Equipped</span>}
                                {isOwned && !isEquipped && <span className="text-[8px] text-eve-accent uppercase">Owned</span>}
                              </div>
                              <div className="text-[9px] opacity-60 mb-3 h-8">{ship.description}</div>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-bold ${canAfford ? 'text-eve-accent' : 'text-eve-danger'}`}>
                                  {ship.cost.toLocaleString()} ISK
                                </span>
                                {isOwned ? (
                                  <button
                                    onClick={() => equipShip(isEquipped ? null : ship.id)}
                                    className={`px-3 py-1 text-[9px] uppercase border transition-all ${isEquipped ? 'border-eve-danger/50 text-eve-danger hover:bg-eve-danger/10' : 'border-eve-accent/50 text-eve-accent hover:bg-eve-accent/10'}`}
                                  >
                                    {isEquipped ? 'Unequip' : 'Equip'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => buyShip(ship)}
                                    disabled={!canAfford}
                                    className="px-3 py-1 text-[9px] uppercase border border-eve-accent/50 text-eve-accent hover:bg-eve-accent/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                  >
                                    Buy
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Close Button */}
                <div className="flex justify-end pt-4 border-t border-white/10">
                  <button
                    onClick={() => setShowShipMarket(false)}
                    className="px-6 py-3 text-[10px] uppercase border border-white/20 hover:bg-white/10 transition-all"
                  >
                    Close Market
                  </button>
                </div>
              </div>

              {/* Decorative Corners */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-eve-accent/30" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-eve-accent/30" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Nebula Overlay */}
      <div className="fixed inset-0 nebula-gradient pointer-events-none opacity-40 -z-5" />
    </div>
  );
}
