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
const SAVE_VERSION = 1

function defaultData() {
  return { version: SAVE_VERSION, lifetimeIsk: 0, unlocked: ['Frigate', 'Corvette', 'Shuttle'], bestRun: 0, toggled: null, sound: true }
}

function migrate(data) {
  const base = defaultData()
  if (!data || typeof data !== 'object') return base
  const out = { ...base, ...data }
  if (out.toggled === null || out.toggled === undefined) out.toggled = base.toggled
  if (typeof out.sound !== 'boolean') out.sound = base.sound
  out.version = SAVE_VERSION
  return out
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
const goStreak = document.getElementById('goStreak')
const goPrevBest = document.getElementById('goPrevBest')
const goCountdown = document.getElementById('goCountdown')
const newHighscoreBadge = document.getElementById('newHighscoreBadge')

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
function playTone(freq, dur, type = 'sine') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
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
function startGame() {
  const data = loadData()
  isk = 0; lives = MAX_LIVES; streak = 0; level = 0
  gameOverOverlay.classList.add('hidden')
  resultOverlay.classList.add('hidden')
  menuScreen.classList.add('hidden')
  gameScreen.classList.remove('hidden')
  updateGameUI()
  updateActiveLabel()
  deal()
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
  resultOverlay.classList.add('hidden')
  revealed = false; locked = false

  cardEls.forEach(el => el.card.classList.remove('winner', 'loser', 'disabled', 'highlight'))

  const activeIds = getActiveShips(loadData())
  const pool = SHIPS.filter(s => activeIds.has(s.id) && statsData.ships[s.id])
  if (pool.length < 2) { statLabel.textContent = 'Unlock more ships to play!'; return }

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
  if (!statPool.length) { statLabel.textContent = 'No compatible ships!'; return }

  const stat = statPool[Math.floor(Math.random() * statPool.length)]
  const entries = byStat[stat]
  const a = entries[Math.floor(Math.random() * entries.length)]
  const partners = entries.filter(e => e[0] !== a[0] && e[1] !== a[1])
  const b = partners[Math.floor(Math.random() * partners.length)]

  currentShips = [a[0], b[0]]
  currentStat = stat

  renderCards()
  updateBanner()
  cardEls.forEach(el => {
    el.card.classList.remove('deal')
    void el.card.offsetWidth
    el.card.classList.add('deal')
  })
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
  if (locked) return
  locked = true
  revealed = true

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
    resultMsg.textContent = `❌ WRONG! ${currentShips[winnerIndex].name} wins with ${formatStatValue(currentStat, winnerIndex === 0 ? v0 : v1)}`
    resultMsg.className = 'wrong'
    playWrong()
  }

  updateGameUI()

  if (level >= MAX_LEVEL && win) {
    finishRun(true)
  } else if (lives <= 0) {
    finishRun(false)
  } else {
    resultOverlay.classList.remove('hidden')
    startCountdown(3, () => { resultOverlay.classList.add('hidden'); deal() }, 'Next round in ')
  }
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
  const data = loadData()
  data.lifetimeIsk += isk
  let newBest = false
  if (isk > data.bestRun) { data.bestRun = isk; newBest = true }
  saveData(data)

  goIsk.textContent = formatISK(isk) + ' ISK'
  goStreak.textContent = streak
  goPrevBest.textContent = formatISK(data.bestRun) + ' ISK'
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

  let remaining = won ? 5 : 3
  goCountdown.textContent = `Returning to menu in ${remaining}...`
  countdownTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      clearInterval(countdownTimer); countdownTimer = null
      gameOverOverlay.classList.add('hidden')
      gameScreen.classList.add('hidden')
      menuScreen.classList.remove('hidden')
      renderMenu()
    } else {
      goCountdown.textContent = `Returning to menu in ${remaining}...`
    }
  }, 1000)
}

// ─── HOTKEYS ──────────────────────────────────────
cardEls.forEach((el, i) => el.card.addEventListener('click', () => choose(i)))

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
  backToMenuBtn.addEventListener('click', () => {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
    gameOverOverlay.classList.add('hidden')
    gameScreen.classList.add('hidden')
    menuScreen.classList.remove('hidden')
    renderMenu()
  })

  renderMenu()
}

init()
