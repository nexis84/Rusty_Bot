// ─── DATA ──────────────────────────────────────────
let statsData = null
let currentShips = []
let currentStat = ''
let isk = 0
let lives = 5
let streak = 0
let level = 0
const MAX_LIVES = 5
const MAX_LEVEL = 10
const ROUND_SECONDS = 30
const ROUND_PAUSE_SECONDS = 5
const EXCLUDED_CLASSES = new Set(['Capsule', 'Special Edition Yachts'])
const AT_SHIP_IDS = new Set([2834, 2836, 3516, 3518, 35779, 35781, 32788, 33397, 33395, 32207, 32209, 52250, 48636, 48635, 33820, 42125, 42241])
const SPECIAL_SHIP_IDS = new Set([617, 33081])

const IMG_BASE = 'https://images.evetech.net/types'
const LS_KEY = 'toptrumps_data'

// ─── UNLOCK TREE ────────────────────────────────────
const UNLOCK_TREE = [
  {
    group: 'SUBCAPITAL SHIPS',
    cats: [
      { name: 'Frigate', cost: 0, classes: ['Frigate'] },
      { name: 'Corvette', cost: 0, classes: ['Corvette'] },
      { name: 'Interceptor', cost: 50000, classes: ['Interceptor'] },
      { name: 'Covert Ops Frigate', cost: 50000, classes: ['Covert Ops'] },
      { name: 'Stealth Bomber', cost: 50000, classes: ['Stealth Bomber'] },
      { name: 'Assault Frigate', cost: 50000, classes: ['Assault Frigate'] },
      { name: 'Electronic Attack Frigate', cost: 50000, classes: ['Electronic Attack Ship'] },
      { name: 'Destroyer', cost: 200000, classes: ['Destroyer'] },
      { name: 'Interdictor', cost: 200000, classes: ['Interdictor'] },
      { name: 'Command Destroyer', cost: 200000, classes: ['Command Destroyer'] },
      { name: 'Tactical Destroyer', cost: 200000, classes: ['Tactical Destroyer'] },
      { name: 'Cruiser', cost: 500000, classes: ['Cruiser', 'Flag Cruiser'] },
      { name: 'Heavy Assault Cruiser', cost: 500000, classes: ['Heavy Assault Cruiser'] },
      { name: 'Heavy Interdiction Cruiser', cost: 500000, classes: ['Heavy Interdiction Cruiser'] },
      { name: 'Logistics Cruiser', cost: 500000, classes: ['Logistics'] },
      { name: 'Recon Ship', cost: 500000, classes: ['Combat Recon Ship', 'Force Recon Ship'] },
      { name: 'Strategic Cruiser', cost: 500000, classes: ['Strategic Cruiser'] },
      { name: 'Battlecruiser', cost: 1000000, classes: ['Battlecruiser', 'Combat Battlecruiser', 'Attack Battlecruiser'] },
      { name: 'Command Ship', cost: 1000000, classes: ['Command Ship'] },
      { name: 'Battleship', cost: 2500000, classes: ['Battleship'] },
      { name: 'Marauder', cost: 2500000, classes: ['Marauder'] },
      { name: 'Black Ops', cost: 2500000, classes: ['Black Ops'] },
    ],
  },
  {
    group: 'CAPITAL SHIPS',
    cats: [
      { name: 'Dreadnought', cost: 5000000, classes: ['Dreadnought'] },
      { name: 'Lancer Dreadnought', cost: 5000000, classes: ['Lancer Dreadnought'] },
      { name: 'Carrier', cost: 5000000, classes: ['Carrier', 'Command Carrier'] },
      { name: 'Force Auxiliary', cost: 5000000, classes: ['Force Auxiliary'] },
      { name: 'Supercarrier', cost: 10000000, classes: ['Supercarrier'] },
      { name: 'Titan', cost: 10000000, classes: ['Titan'] },
    ],
  },
  {
    group: 'INDUSTRIAL & UTILITY',
    cats: [
      { name: 'Shuttle', cost: 0, classes: ['Shuttle'] },
      { name: 'Expedition Frigate', cost: 50000, classes: ['Expedition Frigate', 'Prototype Exploration Ship', 'Logistics Frigate'] },
      { name: 'Mining Barge', cost: 500000, classes: ['Mining Barge', 'Exhumer'] },
      { name: 'Industrial Ship', cost: 1000000, classes: ['Hauler'] },
      { name: 'Transport Ship', cost: 1000000, classes: ['Blockade Runner', 'Deep Space Transport'] },
      { name: 'Freighter', cost: 2500000, classes: ['Freighter'] },
      { name: 'Jump Freighter', cost: 5000000, classes: ['Jump Freighter'] },
      { name: 'Capital Industrial Ship', cost: 5000000, classes: ['Capital Industrial Ship', 'Industrial Command Ship', 'Expedition Command Ship'] },
    ],
  },
  {
    group: 'ALLIANCE TOURNAMENT',
    cats: [
      { name: 'AT Frigates', cost: 5000000, ships: [2834, 32788, 32207, 3516, 52250, 35779, 33397, 48636] },
      { name: 'AT Cruisers', cost: 8000000, ships: [2836, 3518, 32209, 33395, 35781, 48635] },
      { name: 'AT Heavy', cost: 15000000, ships: [33820, 42125, 42241] },
    ],
  },
  {
    group: 'SPECIAL SHIPS',
    cats: [
      { name: 'Special Corvettes', cost: 1000000, ships: [617, 33081] },
    ],
  },
]

// Derive a reverse map: actual ship class -> category name
const CLASS_TO_CAT = {}
for (const group of UNLOCK_TREE) {
  for (const cat of group.cats) {
    if (!cat.classes) continue
    for (const cls of cat.classes) {
      CLASS_TO_CAT[cls] = cat.name
    }
  }
}

// ─── SAVE / LOAD ────────────────────────────────────
const SAVE_VERSION = 2

function defaultData() {
  return {
    version: SAVE_VERSION, lifetimeIsk: 0, unlocked: ['Frigate', 'Corvette', 'Shuttle'],
    bestRun: 0, toggled: null, sound: true,
    achievements: [], totalRounds: 0, totalCorrect: 0, seenAchievementIds: [],
  }
}

function migrate(data) {
  const base = defaultData()
  if (!data || typeof data !== 'object') return base
  const out = { ...base, ...data }
  if (out.toggled === null || out.toggled === undefined) out.toggled = base.toggled
  if (typeof out.sound !== 'boolean') out.sound = base.sound
  if (!Array.isArray(out.achievements)) out.achievements = []
  if (!Array.isArray(out.seenAchievementIds)) out.seenAchievementIds = []
  if (typeof out.totalRounds !== 'number') out.totalRounds = 0
  if (typeof out.totalCorrect !== 'number') out.totalCorrect = 0
  out.version = SAVE_VERSION
  return out
}

// ─── ACHIEVEMENTS ───────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_steps', icon: '👣', name: 'First Steps', desc: 'Finish your first run.', rewardISK: 10000, check: (r) => r.roundsPlayed >= 1 },
  { id: 'warm_up', icon: '🔥', name: 'Warm Up', desc: 'Win a run.', rewardISK: 25000, check: (r) => r.won },
  { id: 'perfect_run', icon: '💎', name: 'Perfect Run', desc: 'Win a run without losing a single life.', rewardISK: 100000, check: (r) => r.won && r.livesLost === 0 },
  { id: 'streak_3', icon: '⚡', name: 'Hot Streak', desc: 'Reach a 3 correct-answer streak.', rewardISK: 15000, check: (r) => r.bestStreak >= 3 },
  { id: 'streak_5', icon: '🔥', name: 'On Fire', desc: 'Reach a 5 correct-answer streak.', rewardISK: 30000, check: (r) => r.bestStreak >= 5 },
  { id: 'streak_10', icon: '⚡', name: 'Unstoppable', desc: 'Reach a 10 correct-answer streak.', rewardISK: 75000, check: (r) => r.bestStreak >= 10 },
  { id: 'level_5', icon: '⭐', name: 'Level 5', desc: 'Reach level 5 in a run.', rewardISK: 20000, check: (r) => r.level >= 5 },
  { id: 'level_10', icon: '🌟', name: 'Max Level', desc: 'Reach level 10 in a run.', rewardISK: 100000, check: (r) => r.level >= 10 },
  { id: 'isk_500k', icon: '💰', name: 'Isk Hauler', desc: 'Earn 500,000 ISK in a single run.', rewardISK: 50000, check: (r) => r.isk >= 500000 },
  { id: 'isk_2m', icon: '🤑', name: 'Isk Bomb', desc: 'Earn 2,000,000 ISK in a single run.', rewardISK: 150000, check: (r) => r.isk >= 2000000 },
  { id: 'speed_demon', icon: '🚀', name: 'Speed Demon', desc: 'Win a run in under 2 minutes.', rewardISK: 75000, check: (r) => r.won && r.elapsedSec < 120 },
  { id: 'precision', icon: '🎯', name: 'Precision', desc: 'Finish a run with at least 80% accuracy over 10+ rounds.', rewardISK: 50000, check: (r) => r.roundsPlayed >= 10 && r.roundsPlayed > 0 && r.correctCount / r.roundsPlayed >= 0.8 },
  { id: 'collector_5', icon: '🗃️', name: 'Collector', desc: 'Unlock 5 ship categories.', rewardISK: 25000, check: (r, d) => d.unlocked.length >= 5 },
  { id: 'collector_10', icon: '🗄️', name: 'Archivist', desc: 'Unlock 10 ship categories.', rewardISK: 75000, check: (r, d) => d.unlocked.length >= 10 },
  { id: 'collector_20', icon: '📚', name: 'Librarian', desc: 'Unlock 20 ship categories.', rewardISK: 200000, check: (r, d) => d.unlocked.length >= 20 },
  { id: 'grind_25', icon: '⛏️', name: 'The Grind', desc: 'Play 25 rounds in total.', rewardISK: 20000, check: (r, d) => d.totalRounds >= 25 },
  { id: 'grind_100', icon: '🧗', name: 'Grind Lord', desc: 'Play 100 rounds in total.', rewardISK: 100000, check: (r, d) => d.totalRounds >= 100 },
]

const ACH_BY_ID = {}
for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a

function unlockedAchievements(data) { return data.achievements || [] }

function checkAchievements(runData) {
  const data = loadData()
  const unlocked = new Set(data.achievements)
  const newly = []
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue
    if (a.check(runData, data)) {
      data.achievements.push(a.id)
      data.lifetimeIsk += a.rewardISK
      newly.push(a)
    }
  }
  if (newly.length) {
    saveData(data)
    newly.forEach((a, i) => setTimeout(() => showAchievementToast(a), i * 800))
  }
  return newly
}

function showAchievementToast(a) {
  if (!achToast) return
  achToast.innerHTML = `<span class="ach-toast-icon">${a.icon}</span><span class="ach-toast-text"><strong>${a.name}</strong> +${formatISK(a.rewardISK)} ISK</span>`
  achToast.classList.remove('hidden')
  achToast.classList.remove('show')
  void achToast.offsetWidth
  achToast.classList.add('show')
  clearTimeout(achToastTimer)
  achToastTimer = setTimeout(() => { achToast.classList.remove('show') }, 4000)
}

function loadData() {
  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(LS_KEY))
  } catch { raw = null }
  const data = migrate(raw)
  saveData(data)
  return data
}

function saveData(d) {
  localStorage.setItem(LS_KEY, JSON.stringify(d))
}

function isUnlocked(catName, data) { return data.unlocked.includes(catName) }

function formatISK(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}

// ─── DOM REFS ──────────────────────────────────────
const menuScreen = document.getElementById('menuScreen')
const gameScreen = document.getElementById('gameScreen')
const gameOverOverlay = document.getElementById('gameOverOverlay')
const lifetimeIskDisplay = document.getElementById('lifetimeIskDisplay')
const bestRunDisplay = document.getElementById('bestRunDisplay')
const unlockTree = document.getElementById('unlockTree')
const playBtn = document.getElementById('playBtn')
const backToMenuBtn = document.getElementById('backToMenuBtn')

const livesDisplay = document.getElementById('livesDisplay')
const iskDisplay = document.getElementById('iskDisplay')
const streakDisplay = document.getElementById('streakDisplay')
const activeLabel = document.getElementById('activeLabel')
const statBanner = document.getElementById('statBanner')
const statLabel = document.getElementById('statLabel')
const resultOverlay = document.getElementById('resultOverlay')
const resultMsg = document.getElementById('resultMsg')
const countdownMsg = document.getElementById('countdownMsg')
const levelDisplay = document.getElementById('levelDisplay')
const goIsk = document.getElementById('goIsk')
const goPrevBest = document.getElementById('goPrevBest')
const goCountdown = document.getElementById('goCountdown')
const newHighscoreBadge = document.getElementById('newHighscoreBadge')

const timerBar = document.getElementById('timerBar')
const timerFill = document.getElementById('timerFill')
const timerText = document.getElementById('timerText')
const diffPanel = document.getElementById('diffPanel')
const diffStatName = document.getElementById('diffStatName')
const diffRows = document.getElementById('diffRows')
const diffResult = document.getElementById('diffResult')
const soundBtn = document.getElementById('soundBtn')

const achToast = document.getElementById('achToast')
const achPanelBtn = document.getElementById('achPanelBtn')
const achPanel = document.getElementById('achPanel')
const achList = document.getElementById('achList')
let achToastTimer = null

const goAccuracy = document.getElementById('goAccuracy')
const goTime = document.getElementById('goTime')
const goBestStreak = document.getElementById('goBestStreak')
const goBreakdown = document.getElementById('goBreakdown')
const goPlayAgainBtn = document.getElementById('goPlayAgainBtn')
const goMenuBtn = document.getElementById('goMenuBtn')

const cardEls = [0, 1].map(i => ({
  card: document.getElementById(`card${i}`),
  img: document.getElementById(`img${i}`),
  name: document.getElementById(`name${i}`),
  cls: document.getElementById(`class${i}`),
  race: document.getElementById(`race${i}`),
  stats: document.getElementById(`stats${i}`),
}))

// ─── SOUND ──────────────────────────────────────────
let audioCtx = null
function soundOn() {
  const d = loadData()
  return d.sound !== false
}
function playTone(freq, dur, type = 'sine') {
  try {
    if (!soundOn()) return
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(0.15, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur)
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur)
  } catch {}
}
function playCorrect() { playTone(523, 0.12); setTimeout(() => playTone(659, 0.18), 80) }
function playWrong() { playTone(180, 0.25, 'sawtooth'); setTimeout(() => playTone(140, 0.2, 'sawtooth'), 120) }
function playVictory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.3), i * 150)) }

// ─── MENU SCREEN ────────────────────────────────────
function renderMenu() {
  const data = loadData()
  lifetimeIskDisplay.textContent = formatISK(data.lifetimeIsk)
  bestRunDisplay.textContent = formatISK(data.bestRun)

  if (soundBtn) {
    soundBtn.textContent = data.sound === false ? '🔇 Sound Off' : '🔊 Sound On'
    soundBtn.classList.toggle('muted', data.sound === false)
  }

  let html = ''
  for (const group of UNLOCK_TREE) {
    html += `<div class="ut-group"><div class="ut-group-title">${group.group}</div>`
    for (const cat of group.cats) {
      const unlocked = isUnlocked(cat.name, data)
      const affordable = data.lifetimeIsk >= cat.cost
      const canBuy = cat.cost > 0 && !unlocked && affordable
      const free = cat.cost === 0
      html += `<div class="ut-row ${unlocked ? 'ut-unlocked' : 'ut-locked'}">
        <div class="ut-info">
          <span class="ut-name">${unlocked ? '✅' : '🔒'} ${cat.name}</span>
          <span class="ut-cost">${free ? 'FREE' : formatISK(cat.cost) + ' ISK'}</span>
        </div>
        <div class="ut-actions">`
      if (unlocked) {
        const toggled = !!data.toggled && data.toggled.includes(cat.name)
        html += `<label class="ut-toggle"><input type="checkbox" data-cat="${cat.name}" ${toggled ? 'checked' : ''}> Play</label>`
      } else if (canBuy) {
        html += `<button class="ut-buy" data-cat="${cat.name}">Unlock</button>`
      } else if (!free) {
        html += `<span class="ut-locked-label">Locked</span>`
      }
      html += `</div></div>`
    }
    html += `</div>`
  }
  unlockTree.innerHTML = html

  // Event delegation for buy buttons and toggles
  unlockTree.querySelectorAll('.ut-buy').forEach(btn => {
    btn.addEventListener('click', () => {
      const data = loadData()
      const catName = btn.dataset.cat
      const cat = UNLOCK_TREE.flatMap(g => g.cats).find(c => c.name === catName)
      if (!cat || data.lifetimeIsk < cat.cost || data.unlocked.includes(catName)) return
      data.lifetimeIsk -= cat.cost
      data.unlocked.push(catName)
      data.toggled = [catName]
      saveData(data)
      checkAchievements({})
      renderMenu()
    })
  })
  unlockTree.querySelectorAll('.ut-toggle input').forEach(cb => {
    cb.addEventListener('change', () => {
      const data = loadData()
      const catName = cb.dataset.cat
      data.toggled = cb.checked ? [catName] : null
      saveData(data)
      renderMenu()
    })
  })

  renderAchievements()
}

function renderAchievements() {
  if (!achPanel || !achList || !achPanelBtn) return
  const data = loadData()
  const unlocked = new Set(data.achievements)
  achPanelBtn.textContent = `🏆 Achievements (${unlocked.size}/${ACHIEVEMENTS.length})`
  let html = ''
  for (const a of ACHIEVEMENTS) {
    const isUnlocked = unlocked.has(a.id)
    html += `<div class="ach-row ${isUnlocked ? 'ach-unlocked' : 'ach-locked'}">
      <span class="ach-icon">${a.icon}</span>
      <div class="ach-info">
        <span class="ach-name">${isUnlocked ? '🏆' : '🔒'} ${a.name}</span>
        <span class="ach-desc">${a.desc}</span>
      </div>
      <span class="ach-reward">${isUnlocked ? '+' + formatISK(a.rewardISK) : formatISK(a.rewardISK)} ISK</span>
    </div>`
  }
  achList.innerHTML = html
}

function getActiveClasses(data) {
  const active = new Set()
  for (const group of UNLOCK_TREE) {
    for (const cat of group.cats) {
      if (isUnlocked(cat.name, data) && (!data.toggled || data.toggled.includes(cat.name))) {
        if (!cat.classes) continue
        for (const cls of cat.classes) {
          if (!EXCLUDED_CLASSES.has(cls)) active.add(cls)
        }
      }
    }
  }
  return active
}

// ─── GAME ──────────────────────────────────────────
let roundReady = false
let roundsPlayed = 0
let correctCount = 0
let wrongCount = 0
let timeoutCount = 0
let bestStreak = 0
let runStartTime = 0

function startGame() {
  const data = loadData()
  isk = 0; lives = MAX_LIVES; streak = 0; level = 0
  roundsPlayed = 0; correctCount = 0; wrongCount = 0; timeoutCount = 0; bestStreak = 0
  runStartTime = Date.now()
  roundReady = false
  clearTimer()
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  gameOverOverlay.classList.add('hidden')
  resultOverlay.classList.add('hidden')
  menuScreen.classList.add('hidden')
  gameScreen.classList.remove('hidden')
  updateGameUI()
  updateActiveLabel()
  deal()
}

// ─── ROUND TIMER ───────────────────────────────────
let timeLeft = ROUND_SECONDS
let timerInterval = null

function clearTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

function updateTimerUI() {
  const frac = timeLeft / ROUND_SECONDS
  timerFill.style.width = (frac * 100) + '%'
  timerText.textContent = timeLeft
  timerBar.classList.toggle('danger', timeLeft <= 5)
  timerBar.classList.toggle('warn', timeLeft > 5 && timeLeft <= 10)
}

function startTimer() {
  clearTimer()
  timeLeft = ROUND_SECONDS
  updateTimerUI()
  timerInterval = setInterval(() => {
    timeLeft--
    updateTimerUI()
    if (timeLeft <= 0) {
      clearTimer()
      handleTimeout()
    }
  }, 1000)
}

function handleTimeout() {
  if (locked) return
  locked = true
  revealed = true
  roundsPlayed++
  timeoutCount++
  cardEls.forEach(el => el.card.classList.remove('highlight'))
  renderCards()
  cardEls.forEach(el => el.card.classList.add('disabled'))
  const v0 = getStat(currentShips[0], currentStat)
  const v1 = getStat(currentShips[1], currentStat)
  const m = statsData.stats[currentStat]
  const winnerIndex = m.highIsGood ? (v0 > v1 ? 0 : 1) : (v0 < v1 ? 0 : 1)
  const tie = v0 === v1
  if (tie) {
    cardEls.forEach(x => x.card.classList.add('winner'))
    resultMsg.textContent = `⏰ TIME'S UP! It was a tie!`
    resultMsg.className = 'correct'
    isk += 10000 + level * 5000
    streak++
    bestStreak = Math.max(bestStreak, streak)
    correctCount++
    level++
    playCorrect()
  } else {
    cardEls[winnerIndex].card.classList.add('winner')
    cardEls[1 - winnerIndex].card.classList.add('loser')
    lives--
    streak = 0
    wrongCount++
    resultMsg.textContent = `⏰ TIME'S UP! ${currentShips[winnerIndex].name} wins with ${formatStatValue(currentStat, winnerIndex === 0 ? v0 : v1)}`
    resultMsg.className = 'wrong'
    playWrong()
  }
  updateGameUI()
  renderDifference()
  if (level >= MAX_LEVEL) {
    finishRun(true)
  } else if (lives <= 0) {
    finishRun(false)
  } else {
    resultOverlay.classList.remove('hidden')
    startCountdown(ROUND_PAUSE_SECONDS, () => { resultOverlay.classList.add('hidden'); deal() }, 'Next round in ')
  }
}

function getActiveShips(data) {
  const active = new Set()
  const classes = getActiveClasses(data)
  for (const ship of SHIPS) {
    if (classes.has(ship.class) && !AT_SHIP_IDS.has(ship.id) && !SPECIAL_SHIP_IDS.has(ship.id)) active.add(ship.id)
  }
  for (const group of UNLOCK_TREE) {
    for (const cat of group.cats) {
      if (!cat.ships) continue
      if (isUnlocked(cat.name, data) && (!data.toggled || data.toggled.includes(cat.name))) {
        cat.ships.forEach(id => active.add(id))
      }
    }
  }
  return active
}

function getActiveCatNames(data) {
  const names = []
  for (const group of UNLOCK_TREE) {
    for (const cat of group.cats) {
      if (isUnlocked(cat.name, data) && (!data.toggled || data.toggled.includes(cat.name))) names.push(cat.name)
    }
  }
  return names
}

function updateActiveLabel() {
  const names = getActiveCatNames(loadData())
  activeLabel.textContent = names.length ? `Playing: ${names.join(', ')}` : 'No classes selected'
}

function deal() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  clearTimer()
  resultOverlay.classList.add('hidden')
  diffPanel.classList.add('hidden')
  revealed = false; locked = false; roundReady = false

  cardEls.forEach(el => el.card.classList.remove('winner', 'loser', 'disabled', 'highlight'))

  const activeIds = getActiveShips(loadData())
  const pool = SHIPS.filter(s => activeIds.has(s.id) && statsData.ships[s.id])
  if (pool.length < 2) {
    statLabel.textContent = 'Unlock more ships to play!'
    cardEls.forEach(el => el.card.classList.add('disabled'))
    return
  }

  const statKeys = Object.keys(statsData.stats)
  const byStat = {}
  for (const k of statKeys) {
    const entries = []
    for (const s of pool) {
      const v = getStat(s, k)
      if (v !== undefined) entries.push([s, v])
    }
    if (new Set(entries.map(e => e[1])).size >= 2) byStat[k] = entries
  }

  const statPool = Object.keys(byStat)
  if (!statPool.length) {
    statLabel.textContent = 'No compatible ships!'
    cardEls.forEach(el => el.card.classList.add('disabled'))
    return
  }

  const stat = statPool[Math.floor(Math.random() * statPool.length)]
  const entries = byStat[stat]
  const a = entries[Math.floor(Math.random() * entries.length)]
  const partners = entries.filter(e => e[0] !== a[0] && e[1] !== a[1])
  const b = partners[Math.floor(Math.random() * partners.length)]

  currentShips = [a[0], b[0]]
  currentStat = stat
  roundReady = true

  renderCards()
  updateBanner()
  cardEls.forEach(el => {
    el.card.classList.remove('deal')
    void el.card.offsetWidth
    el.card.classList.add('deal')
  })
  startTimer()
}

function getStat(ship, k) {
  const e = statsData.ships[ship.id]
  return e && e[k] !== undefined && e[k] !== null ? e[k] : undefined
}

function formatStatValue(k, v) {
  const m = statsData.stats[k]
  if (k === 'basePrice') {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B ISK'
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M ISK'
    return v.toLocaleString() + ' ISK'
  }
  if (k === 'maxTargetRange') return (v / 1000).toFixed(0) + ' km'
  const unit = m ? m.unit : ''
  if (v % 1 === 0) return v.toLocaleString() + (unit ? ' ' + unit : '')
  return v.toFixed(1) + (unit ? ' ' + unit : '')
}

function getStatColor(k) {
  const colors = {
    hp: 'var(--stat-hp)', armorHP: 'var(--stat-armor)', shieldCapacity: 'var(--stat-shield)',
    maxVelocity: 'var(--stat-speed)', capacitorCapacity: 'var(--stat-cap)',
    mass: 'var(--stat-mass)', agility: 'var(--stat-agility)', capacity: 'var(--stat-cargo)',
    droneCapacity: 'var(--stat-drone)', scanResolution: 'var(--stat-scan)',
    warpSpeedMultiplier: 'var(--stat-warp)', signatureRadius: 'var(--stat-signature)',
    maxTargetRange: 'var(--stat-targetrange)', maxLockedTargets: 'var(--stat-targets)',
    basePrice: 'var(--stat-price)',
  }
  return colors[k] || 'var(--text)'
}

let revealed = false, locked = false
let countdownTimer = null

function renderCards() {
  currentShips.forEach((ship, i) => {
    const el = cardEls[i]
    el.img.src = `${IMG_BASE}/${ship.id}/render?size=256`
    el.img.alt = ship.name
    el.name.textContent = ship.name
    el.cls.textContent = ship.class
    el.race.textContent = ship.race
    let html = ''
    const statKeys = Object.keys(statsData.stats)
    statKeys.forEach(k => {
      const v = getStat(ship, k)
      if (v === undefined) return
      const isTrump = k === currentStat
      const color = getStatColor(k)
      const cls = isTrump ? 'stat-row trump' : 'stat-row'
      const hidden = isTrump && !revealed
      const displayVal = hidden ? '?' : formatStatValue(k, v)
      const flipClass = isTrump && revealed ? 'stat-inner flip' : 'stat-inner'
      html += `<div class="${cls}">
        <span class="stat-label" style="${isTrump ? 'color:' + color : ''}">${statsData.stats[k].name}</span>
        <span class="stat-value" style="color:${hidden ? 'var(--text-dim)' : color}">
          <span class="${flipClass}">${displayVal}</span>
        </span>
      </div>`
    })
    el.stats.innerHTML = html
    el.card.classList.remove('disabled')
    el.card.classList.add('highlight')
  })
}

function updateBanner() {
  const m = statsData.stats[currentStat]
  statLabel.innerHTML = `Pick the ship with the <strong>${m.highIsGood ? 'HIGHER' : 'LOWER'}</strong> <span class="stat-value" style="color:${getStatColor(currentStat)}">${m.name}</span>`
}

function updateGameUI() {
  const hearts = '❤️'.repeat(lives) + '🖤'.repeat(MAX_LIVES - lives)
  livesDisplay.textContent = hearts
  iskDisplay.textContent = formatISK(isk)
  streakDisplay.textContent = streak
  levelDisplay.textContent = `${level}/${MAX_LEVEL}`
}

function choose(index) {
  if (locked || !roundReady) return
  locked = true
  revealed = true
  clearTimer()
  roundsPlayed++

  cardEls.forEach(el => el.card.classList.remove('highlight'))

  const v0 = getStat(currentShips[0], currentStat)
  const v1 = getStat(currentShips[1], currentStat)
  const m = statsData.stats[currentStat]
  const winnerIndex = m.highIsGood ? (v0 > v1 ? 0 : 1) : (v0 < v1 ? 0 : 1)
  const tie = v0 === v1

  renderCards()
  cardEls.forEach(el => el.card.classList.add('disabled'))

  let win = false

  if (tie) {
    cardEls.forEach(el => el.card.classList.add('winner'))
    resultMsg.textContent = `TIE! Both have ${formatStatValue(currentStat, v0)}`
    resultMsg.className = 'correct'
    isk += 10000 + level * 5000
    streak++
    bestStreak = Math.max(bestStreak, streak)
    correctCount++
    level++
    playCorrect()
    win = true
  } else if (index === winnerIndex) {
    cardEls[winnerIndex].card.classList.add('winner')
    cardEls[1 - winnerIndex].card.classList.add('loser')
    const base = 10000 + level * 5000
    const bonus = streak * 5000
    const earned = base + bonus
    isk += earned
    streak++
    bestStreak = Math.max(bestStreak, streak)
    correctCount++
    level++
    resultMsg.innerHTML = `✅ CORRECT! +${formatISK(earned)} ISK${bonus > 0 ? ` (streak x${streak - 1})` : ''}`
    resultMsg.className = 'correct'
    playCorrect()
    win = true
  } else {
    cardEls[winnerIndex].card.classList.add('winner')
    cardEls[1 - winnerIndex].card.classList.add('loser')
    lives--
    streak = 0
    wrongCount++
    resultMsg.textContent = `❌ WRONG! ${currentShips[winnerIndex].name} wins with ${formatStatValue(currentStat, winnerIndex === 0 ? v0 : v1)}`
    resultMsg.className = 'wrong'
    playWrong()
  }

  updateGameUI()
  renderDifference()

  if (level >= MAX_LEVEL && win) {
    finishRun(true)
  } else if (lives <= 0) {
    finishRun(false)
  } else {
    resultOverlay.classList.remove('hidden')
    startCountdown(ROUND_PAUSE_SECONDS, () => { resultOverlay.classList.add('hidden'); deal() }, 'Next round in ')
  }
}

function renderDifference() {
  const v0 = getStat(currentShips[0], currentStat)
  const v1 = getStat(currentShips[1], currentStat)
  if (v0 === undefined || v1 === undefined) { diffPanel.classList.add('hidden'); return }
  const m = statsData.stats[currentStat]
  const color = getStatColor(currentStat)
  diffStatName.textContent = m.name
  diffStatName.style.color = color

  const rows = [
    { ship: currentShips[0], v: v0 },
    { ship: currentShips[1], v: v1 },
  ].sort((x, y) => (m.highIsGood ? y.v - x.v : x.v - y.v))
  diffRows.innerHTML = rows.map(r => `
    <div class="diff-row">
      <span class="diff-ship">${r.ship.name}</span>
      <span class="diff-val" style="color:${color}">${formatStatValue(currentStat, r.v)}</span>
    </div>
  `).join('')

  const diff = Math.abs(v0 - v1)
  if (diff === 0) {
    diffResult.textContent = 'Difference: 0 — Tie!'
  } else {
    const smaller = Math.min(v0, v1)
    if (smaller > 0) {
      const pct = (diff / smaller) * 100
      diffResult.innerHTML = `Difference: <strong>${formatStatValue(currentStat, diff)}</strong> <span class="diff-pct">(${pct >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%)</span>`
    } else {
      diffResult.innerHTML = `Difference: <strong>${formatStatValue(currentStat, diff)}</strong>`
    }
  }
  diffPanel.classList.remove('hidden')
}

function startCountdown(secs, callback, prefix) {
  let remaining = secs
  countdownMsg.textContent = `${prefix}${remaining}...`
  countdownTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) { clearInterval(countdownTimer); countdownTimer = null; callback() }
    else countdownMsg.textContent = `${prefix}${remaining}...`
  }, 1000)
}

function finishRun(won) {
  clearTimer()
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  const data = loadData()
  data.lifetimeIsk += isk
  let newBest = false
  if (isk > data.bestRun) { data.bestRun = isk; newBest = true }
  data.totalRounds += roundsPlayed
  data.totalCorrect += correctCount
  saveData(data)

  const elapsedSec = Math.max(0, Math.floor((Date.now() - runStartTime) / 1000))
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
  const ss = String(elapsedSec % 60).padStart(2, '0')
  const accuracy = roundsPlayed > 0 ? Math.round((correctCount / roundsPlayed) * 100) : 0

  goIsk.textContent = formatISK(isk) + ' ISK'
  goPrevBest.textContent = formatISK(data.bestRun) + ' ISK'
  goAccuracy.textContent = accuracy + '%'
  goTime.textContent = `${mm}:${ss}`
  goBestStreak.textContent = bestStreak
  goBreakdown.textContent = `✅ ${correctCount} · ❌ ${wrongCount} · ⏰ ${timeoutCount}`
  newHighscoreBadge.classList.toggle('hidden', !newBest)

  const titleEl = document.getElementById('goTitle')
  const subEl = document.getElementById('goSubtitle')
  if (won) {
    titleEl.textContent = '🏆 VICTORY! 🏆'
    titleEl.className = 'victory-title'
    subEl.textContent = `You conquered all ${MAX_LEVEL} levels!`
    subEl.className = 'victory-subtitle'
    playVictory()
  } else {
    titleEl.textContent = 'GAME OVER'
    titleEl.className = 'go-title'
    subEl.textContent = ''
    subEl.className = ''
  }

  gameOverOverlay.classList.remove('hidden')

  const runData = {
    won, isk, bestStreak, roundsPlayed, correctCount, wrongCount, timeoutCount,
    level, elapsedSec, livesLost: MAX_LIVES - lives,
  }
  checkAchievements(runData)

  goCountdown.classList.add('hidden')
}

function goToMenu() {
  clearTimer()
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  gameOverOverlay.classList.add('hidden')
  gameScreen.classList.add('hidden')
  menuScreen.classList.remove('hidden')
  renderMenu()
}

// ─── HOTKEYS ──────────────────────────────────────
cardEls.forEach((el, i) => el.card.addEventListener('click', () => choose(i)))
document.addEventListener('keydown', (e) => {
  if (menuScreen.classList.contains('hidden') && !gameOverOverlay.classList.contains('hidden')) return
  if (e.key === '1' || e.key === 'ArrowLeft') { choose(0) }
  else if (e.key === '2' || e.key === 'ArrowRight') { choose(1) }
})

// ─── INIT ──────────────────────────────────────────
async function init() {
  const loadStatus = document.getElementById('loadStatus')
  loadStatus.textContent = 'Loading ship data…'
  playBtn.disabled = true

  try {
    const res = await fetch('ship-stats.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    statsData = await res.json()
  } catch (err) {
    console.error('Failed to load ship data:', err)
    loadStatus.textContent = 'Failed to load ship data.'
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.textContent = 'Retry'
    retry.className = 'ut-buy'
    retry.addEventListener('click', () => init())
    loadStatus.appendChild(document.createElement('br'))
    loadStatus.appendChild(retry)
    return
  }

  loadStatus.textContent = ''
  playBtn.disabled = false

  playBtn.addEventListener('click', startGame)
  backToMenuBtn.addEventListener('click', goToMenu)
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const data = loadData()
      data.sound = data.sound === false
      saveData(data)
      renderMenu()
    })
  }
  if (goPlayAgainBtn) goPlayAgainBtn.addEventListener('click', startGame)
  if (goMenuBtn) goMenuBtn.addEventListener('click', goToMenu)
  if (achPanelBtn) {
    achPanelBtn.addEventListener('click', () => {
      const hidden = achPanel.classList.toggle('hidden')
      achPanelBtn.classList.toggle('open', !hidden)
    })
  }

  renderMenu()
}

init()
