import { useState, useEffect, useCallback } from 'react';
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
  Target
} from 'lucide-react';
import { Tooltip } from './components/Tooltip';
import { HackingGrid } from './components/HackingGrid';
import { 
  WORD_BANK, 
  DIFFICULTY_SETTINGS, 
  INITIAL_ISK, 
  HINT_COST, 
  VOWEL_COST,
  STANDING_LEVELS,
  getStandingLevel
} from './constants';

type GameStatus = 'playing' | 'won' | 'lost';
type Difficulty = 'highsec' | 'nullsec' | 'streamer';

// User ID management
const getUserId = (): string => {
  let userId = localStorage.getItem('sleeper_user_id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('sleeper_user_id', userId);
  }
  return userId;
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

export default function App() {
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

  const startNewGame = useCallback((diff: Difficulty = difficulty) => {
    const bank = WORD_BANK[diff];
    const settings = DIFFICULTY_SETTINGS[diff];
    
    // Pick random word from bank
    const newWord = bank[Math.floor(Math.random() * bank.length)];
    
    setWord(newWord);
    setGuessedLetters([]);
    setStatus('playing');
    setShowExplosion(false);
    setShowSuccess(false);
    setShowGameOver(false);
    setOxygen(settings.timer);
    setMessage('ENCRYPTION BREACH IN PROGRESS...');
  }, [difficulty]);

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
    const actualReward = Math.floor(baseReward * standing.multiplier);
    
    setStatus('won');
    setIsk(prev => prev + actualReward);
    setTotalEarned(prev => {
      const newTotal = prev + actualReward;
      storeTotalEarned(newTotal);
      return newTotal;
    });
    setMessage(`DECRYPTION SUCCESSFUL. RECOVERED ${actualReward.toLocaleString()} ISK.`);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setShowGameOver(true);
    }, 2000);
  }, [totalEarned]);

  // Oxygen/Timer
  useEffect(() => {
    if (status !== 'playing') return;

    const timer = setInterval(() => {
      setOxygen(prev => {
        if (prev <= 0) {
          handleLoss('OXYGEN DEPLETED. LIFE SUPPORT FAILURE.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, handleLoss]);

  const wrongGuesses = guessedLetters.filter(l => !word.includes(l));
  const currentSettings = DIFFICULTY_SETTINGS[difficulty];
  const attemptsRemaining = currentSettings.attempts - wrongGuesses.length;

  useEffect(() => {
    if (attemptsRemaining <= 0 && status === 'playing') {
      handleLoss('GATE GUNS AUTHORIZED LETHAL FORCE. SHIP DESTROYED.');
    }
  }, [attemptsRemaining, status, handleLoss]);

  useEffect(() => {
    if (word && word.split('').every(l => guessedLetters.includes(l)) && status === 'playing') {
      const baseReward = currentSettings.reward;
      handleWin(baseReward);
    }
  }, [guessedLetters, word, status, currentSettings.reward, handleWin]);

  // Persist ISK to localStorage
  useEffect(() => {
    storeIsk(isk);
  }, [isk]);

  const handleGuess = (letter: string) => {
    if (status !== 'playing' || guessedLetters.includes(letter)) return;
    setGuessedLetters(prev => [...prev, letter]);
  };

  const buyHint = () => {
    if (isk < HINT_COST || status !== 'playing') return;
    const unrevealed = word.split('').filter(l => !guessedLetters.includes(l));
    if (unrevealed.length === 0) return;
    const randomLetter = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    setGuessedLetters(prev => [...prev, randomLetter]);
    setIsk(prev => prev - HINT_COST);
  };

  const buyVowel = () => {
    if (isk < VOWEL_COST || status !== 'playing') return;
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    const unrevealedVowels = vowels.filter(v => word.includes(v) && !guessedLetters.includes(v));
    if (unrevealedVowels.length === 0) return;
    const randomVowel = unrevealedVowels[Math.floor(Math.random() * unrevealedVowels.length)];
    setGuessedLetters(prev => [...prev, randomVowel]);
    setIsk(prev => prev - VOWEL_COST);
  };

  const qwerty = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  return (
    <div className="relative min-h-screen flex flex-col p-2 md:p-4 lg:p-6 overflow-hidden bg-eve-bg selection:bg-eve-accent selection:text-black">
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

      <div className="fixed bottom-40 right-10 opacity-10 text-[8px] font-mono pointer-events-none select-none z-0 space-y-1 text-right hidden lg:block">
        <div>01001110 01001111 01000100 01000101</div>
        <div>01011000 01011001 01011010 00110001</div>
        <div>MEMORY_DUMP: 0x0045FF21</div>
        <div>STACK_TRACE: SECTOR_7_FAIL</div>
        <div>RECOVERY_KEY: ********</div>
        <div>STATUS: BREACHING...</div>
      </div>

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
                  className={`px-2 lg:px-3 py-1 text-[8px] lg:text-[10px] font-bold transition-all ${difficulty === key ? (key === 'highsec' ? 'bg-eve-accent text-black' : key === 'streamer' ? 'bg-purple-500 text-white' : 'bg-eve-danger text-black') : (key === 'highsec' ? 'text-eve-accent hover:bg-eve-accent/10' : key === 'streamer' ? 'text-purple-400 hover:bg-purple-500/10' : 'text-eve-danger hover:bg-eve-danger/10')}`}
                >
                  {settings.label}
                </button>
              ))}
            </div>
          </div>
      </header>

      {/* Main Layout Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 z-10 overflow-y-auto lg:overflow-visible">
        
        {/* Left Sidebar: Tactical Overview - Hidden on small screens */}
        <div className="hidden lg:block lg:col-span-3 flex flex-col gap-4 lg:gap-6">
          <div className="panel-border bg-eve-panel p-4 h-fit">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-eve-accent/20 pb-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-eve-accent" />
              Tactical Overview
            </h2>
            <ul className="space-y-3 text-[11px] font-mono uppercase">
              <li className="flex justify-between">
                <span className="opacity-50">Standing:</span>
                <span className={`font-bold ${getStandingLevel(totalEarned).name === 'Omega' ? 'text-eve-warning' : getStandingLevel(totalEarned).name === 'Legend' ? 'text-purple-400' : 'text-eve-accent'}`}>
                  {getStandingLevel(totalEarned).name}
                  {getStandingLevel(totalEarned).multiplier > 1 && ` (x${getStandingLevel(totalEarned).multiplier})`}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="opacity-50">Total Earned:</span>
                <span className="text-eve-accent">{totalEarned.toLocaleString()} ISK</span>
              </li>
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
          </div>

          <div className="panel-border bg-eve-panel p-4 h-fit">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-eve-accent/20 pb-2 flex items-center gap-2 text-eve-danger">
              <AlertTriangle className="w-4 h-4" />
              Incorrect Guesses
            </h2>
            <div className="flex flex-wrap gap-2 justify-center">
              {wrongGuesses.map((l, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={i} 
                  className="text-2xl font-display text-eve-danger border border-eve-danger/30 w-10 h-10 flex items-center justify-center bg-eve-danger/5"
                >
                  {l}
                </motion.div>
              ))}
              {wrongGuesses.length === 0 && <span className="text-[10px] opacity-30 italic">No errors detected</span>}
            </div>
          </div>
        </div>

        {/* Center: Main Game Area */}
        <div className="col-span-1 lg:col-span-6 flex flex-col items-center justify-between py-1 min-h-[54vh] lg:min-h-0">
          
          {/* Status Bar */}
          <div className="w-full space-y-3">
            <div className="text-center">
              <div className="text-sm md:text-base uppercase font-bold tracking-wider">
                Encryption Breach Status: <span className={attemptsRemaining < 5 ? 'text-eve-warning' : 'text-eve-accent'}>
                  {status === 'lost' ? 'TERMINATED' : status === 'won' ? 'SECURED' : attemptsRemaining < 5 ? 'WARNING' : 'STABLE'} ({currentSettings.attempts - attemptsRemaining}/{currentSettings.attempts} ATTEMPTS)
                </span>
              </div>
            </div>
            <div className="segmented-bar h-6">
              {Array.from({ length: currentSettings.attempts }).map((_, i) => (
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
                <div className={`w-12 md:w-16 h-1 mt-2 ${guessedLetters.includes(char) ? 'bg-eve-accent' : 'bg-eve-accent/20'}`} />
              </div>
            ))}
          </div>

          {/* Visual Representation - Hacking Grid */}
          <div className="relative w-full h-[45vh] min-h-[280px] max-h-[520px] flex items-center justify-center bg-black/20 rounded-lg border border-white/5 my-2 lg:my-0 overflow-hidden">
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
                        w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 font-display text-sm md:text-lg transition-all border relative overflow-hidden
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
        </div>

        {/* Right Sidebar: Market & Timer - Hidden on small screens */}
        <div className="hidden lg:block lg:col-span-3 flex flex-col gap-4 lg:gap-6">
          <div className="panel-border bg-eve-panel p-4 h-fit">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-eve-accent/20 pb-2 flex items-center gap-2">
              <Coins className="w-4 h-4 text-eve-accent" />
              The Market (Hints)
            </h2>
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
                content="Bypass encryption protocols to reveal a random vowel (A, E, I, O, U) in the target payload."
                subContent={`Cost: ${VOWEL_COST.toLocaleString()} ISK`}
                position="left"
              >
                <button 
                  onClick={buyVowel}
                  disabled={isk < VOWEL_COST || status !== 'playing'}
                  className="w-full flex justify-between items-center p-3 border border-eve-warning/30 bg-eve-warning/5 hover:bg-eve-warning/10 disabled:opacity-20 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <Unlock className="w-3 h-3 text-eve-warning" />
                    <span className="text-[10px] uppercase font-bold">Buy Vowel</span>
                  </div>
                  <span className="text-[11px] font-bold text-eve-warning">{VOWEL_COST.toLocaleString()} ISK</span>
                </button>
              </Tooltip>

              <Tooltip 
                content="Deploy a specialized data analyzer to decrypt a random unrevealed letter in the target payload."
                subContent={`Cost: ${HINT_COST.toLocaleString()} ISK`}
                position="left"
              >
                <button 
                  onClick={buyHint}
                  disabled={isk < HINT_COST || status !== 'playing'}
                  className="w-full flex justify-between items-center p-3 border border-eve-accent/30 bg-eve-accent/5 hover:bg-eve-accent/10 disabled:opacity-20 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <Search className="w-3 h-3 text-eve-accent" />
                    <span className="text-[10px] uppercase font-bold">Data Analyzer</span>
                  </div>
                  <span className="text-[11px] font-bold text-eve-accent">{HINT_COST.toLocaleString()} ISK</span>
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Auto-Destruct Gauge */}
          <div className="panel-border bg-eve-panel p-6 flex flex-col items-center gap-4">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
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
                <span className="text-2xl font-display text-eve-danger">{oxygen}</span>
                <span className="text-[8px] uppercase opacity-50">Seconds</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-eve-danger animate-pulse">
                Facility Lockdown
              </div>
              <div className="text-[8px] uppercase opacity-40 mt-1">
                Protocol: Quarantine Breach
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
              {/* Header Accent */}
              <div className={`h-1 w-full ${status === 'won' ? 'bg-eve-success shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-eve-danger shadow-[0_0_15px_rgba(239,68,68,0.5)]'}`} />
              
              <div className="p-8 md:p-12 space-y-8">
                {/* Mission Status Header */}
                <div className="flex flex-col items-center text-center space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
                  >
                    {status === 'won' ? (
                      <div className="p-4 rounded-full bg-eve-success/10 border border-eve-success/30">
                        <Trophy className="w-16 h-16 text-eve-success" />
                      </div>
                    ) : (
                      <div className="p-4 rounded-full bg-eve-danger/10 border border-eve-danger/30">
                        <Skull className="w-16 h-16 text-eve-danger" />
                      </div>
                    )}
                  </motion.div>
                  
                  <div className="space-y-1">
                    <h2 className={`font-display text-5xl md:text-6xl uppercase tracking-tighter ${status === 'won' ? 'text-eve-success' : 'text-eve-danger'}`}>
                      {status === 'won' ? 'Mission Success' : 'Mission Failed'}
                    </h2>
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
                  <button 
                    onClick={() => startNewGame()}
                    className={`flex-1 py-5 flex items-center justify-center gap-3 font-display text-xl uppercase tracking-[0.2em] transition-all group relative overflow-hidden ${status === 'won' ? 'bg-eve-success text-black hover:bg-eve-success/80' : 'bg-eve-danger text-white hover:bg-eve-danger/90 shadow-[0_0_20px_rgba(239,68,68,0.5)] hover:shadow-[0_0_30px_rgba(239,68,68,0.7)] animate-pulse'}`}
                  >
                    <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                    <span>New Breach</span>
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                  </button>
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

      {/* Background Nebula Overlay */}
      <div className="fixed inset-0 nebula-gradient pointer-events-none opacity-40 -z-5" />
    </div>
  );
}
