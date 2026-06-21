const ESI_BASE = 'https://esi.evetech.net/latest';
const JITA_REGION = '10000002';
const IMG_BASE = 'https://images.evetech.net';

let state = null;
let priceCache = new Map();
let loadedShipIds = new Set();
const CACHE_TTL = 3600000; // 1 hour in ms
const FETCH_TIMEOUT = 10000; // 10s abort timeout
const BUY_LIFE_BASE = 5000000; // 5M base ISK to buy a life, scales up

function getBuyLifeCost() {
  const x = state.livesBought;
  const tiers = [5, 50, 90, 150];
  if (x < 4) return tiers[x] * 1000000;
  return (10 * x * x + 10 * x + 30) * 1000000;
}

function loadPriceFromCache(typeId) {
  try {
    const cached = localStorage.getItem(`ship_price_${typeId}`);
    if (!cached) return null;
    const { price, ts } = JSON.parse(cached);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(`ship_price_${typeId}`);
      return null;
    }
    return price;
  } catch (e) {
    return null;
  }
}

function savePriceToCache(typeId, price) {
  try {
    localStorage.setItem(`ship_price_${typeId}`, JSON.stringify({ price, ts: Date.now() }));
  } catch (e) {}
}

// Sound effects using Web Audio API
const SoundFX = {
  _ctx: null,
  _init() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
  },
  _play(freq, duration, type, ramp) {
    this._init();
    if (!this._ctx) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, this._ctx.currentTime);
    gain.gain.setValueAtTime(0.15, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration + (ramp || 0.1));
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + duration + (ramp || 0.1));
  },
  correct() {
    this._play(523, 0.12, 'sine');
    setTimeout(() => this._play(659, 0.15, 'sine'), 100);
    setTimeout(() => this._play(784, 0.2, 'sine'), 200);
  },
  wrong() {
    this._play(300, 0.15, 'sawtooth');
    setTimeout(() => this._play(200, 0.25, 'sawtooth'), 120);
  },
  click() {
    this._play(800, 0.05, 'sine');
  },
  streak() {
    this._play(587, 0.08, 'sine');
    setTimeout(() => this._play(740, 0.08, 'sine'), 80);
    setTimeout(() => this._play(880, 0.1, 'sine'), 160);
    setTimeout(() => this._play(1047, 0.2, 'sine'), 240);
  },
  gameOver() {
    this._play(400, 0.2, 'triangle');
    setTimeout(() => this._play(350, 0.2, 'triangle'), 200);
    setTimeout(() => this._play(300, 0.3, 'triangle'), 400);
  },
  tick() {
    this._play(660, 0.08, 'sine');
  },
  go() {
    this._play(880, 0.15, 'sine');
    setTimeout(() => this._play(1047, 0.2, 'sine'), 100);
  },
  lifeGained() {
    this._play(660, 0.1, 'sine');
    setTimeout(() => this._play(880, 0.1, 'sine'), 80);
    setTimeout(() => this._play(1100, 0.15, 'sine'), 160);
  }
};

function formatISK(amount) {
  if (amount == null) return '??? ISK';
  if (amount >= 1e9) return (amount / 1e9).toFixed(2) + 'B ISK';
  if (amount >= 1e6) return (amount / 1e6).toFixed(2) + 'M ISK';
  if (amount >= 1e3) return (amount / 1e3).toFixed(1) + 'K ISK';
  return Math.round(amount).toLocaleString('en-US') + ' ISK';
}

function formatISKShort(amount) {
  if (amount == null) return '?';
  if (amount >= 1e9) return (amount / 1e9).toFixed(2) + 'B';
  if (amount >= 1e6) return (amount / 1e6).toFixed(2) + 'M';
  if (amount >= 1e3) return (amount / 1e3).toFixed(1) + 'K';
  return Math.round(amount).toLocaleString('en-US');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMinPriceDiff(streak) {
  if (streak <= 5) return 0.30;
  if (streak <= 10) return 0.22;
  if (streak <= 15) return 0.15;
  if (streak <= 20) return 0.10;
  if (streak <= 30) return 0.06;
  return 0.03;
}



async function fetchShipPrice(typeId) {
  // Check memory cache first
  if (priceCache.has(typeId)) {
    const cached = priceCache.get(typeId);
    if (Date.now() - cached.ts < 60000) return cached.price;
  }
  
  // Check localStorage cache
  const cachedPrice = loadPriceFromCache(typeId);
  if (cachedPrice !== null) {
    priceCache.set(typeId, { price: cachedPrice, ts: Date.now() });
    return cachedPrice;
  }

  // Static reference data as fallback
  const staticPrice = PRICE_DATA && PRICE_DATA.prices[typeId];
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const url = `${ESI_BASE}/markets/${JITA_REGION}/orders/?type_id=${typeId}&order_type=sell&_=${Date.now()}`;
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' }
    });
    clearTimeout(timeout);
    if (!res.ok) return staticPrice || null;
    const orders = await res.json();
    if (!orders.length) return staticPrice || null;
    const price = Math.min(...orders.map(o => o.price));
    priceCache.set(typeId, { price, ts: Date.now() });
    savePriceToCache(typeId, price);
    return price;
  } catch (e) {
    return staticPrice || null;
  }
}

function addRecent(id) {
  state.recentIds[id] = state.roundNum;
}

function cleanRecent() {
  for (const id of Object.keys(state.recentIds)) {
    if (state.roundNum - state.recentIds[id] >= 15) {
      delete state.recentIds[id];
    }
  }
}

function isRecent(id) {
  const seen = state.recentIds[id];
  if (seen == null) return false;
  return state.roundNum - seen < 15;
}

function getChallenger(currentShip, prices, streak) {
  const currentPrice = prices[currentShip.id];
  const minDiff = getMinPriceDiff(streak);
  const tierCap = getTierCap(streak);
  const minPrice = currentPrice * (1 - minDiff);
  const maxPrice = Math.min(currentPrice * (1 + minDiff), tierCap);

  let pool = SHIPS.filter(s => {
    if (s.id === currentShip.id) return false;
    if (isRecent(s.id)) return false;
    const p = prices[s.id];
    return p != null && p > 0 && p >= minPrice && p <= maxPrice && p <= tierCap;
  });

  // Second attempt: 50% to 200% range
  if (pool.length < 2) {
    const wideMin = currentPrice * 0.5;
    const wideMax = Math.min(currentPrice * 2, tierCap);
    pool = SHIPS.filter(s => {
      if (s.id === currentShip.id) return false;
      if (isRecent(s.id)) return false;
      const p = prices[s.id];
      return p != null && p > 0 && p >= wideMin && p <= wideMax && p <= tierCap;
    });
  }

  // Third attempt: 30% to 300% range
  if (pool.length < 2) {
    const wideMin = currentPrice * 0.3;
    const wideMax = Math.min(currentPrice * 3, tierCap);
    pool = SHIPS.filter(s => {
      if (s.id === currentShip.id) return false;
      if (isRecent(s.id)) return false;
      const p = prices[s.id];
      return p != null && p > 0 && p >= wideMin && p <= wideMax && p <= tierCap;
    });
  }

  // Final fallback: ignore recency, apply tier cap with progressive ratio
  if (pool.length < 2) {
    const ratios = [3, 5, 10, Infinity];
    for (const maxRatio of ratios) {
      const sorted = SHIPS
        .filter(s => {
          if (s.id === currentShip.id) return false;
          const p = prices[s.id];
          if (p == null || p <= 0) return false;
          if (p > tierCap) return false;
          if (!isFinite(maxRatio)) return true;
          const ratio = Math.max(p, currentPrice) / Math.min(p, currentPrice);
          return ratio <= maxRatio;
        })
        .sort((a, b) => Math.abs(prices[a.id] - currentPrice) - Math.abs(prices[b.id] - currentPrice));
      if (sorted.length >= 2) {
        pool = sorted.slice(0, 20);
        break;
      }
    }
  }

  pool = pool.filter(s => s.id !== currentShip.id);

  return pool.length > 0 ? pickRandom(pool) : null;
}

function getRewardRate(streak) {
  if (streak <= 5) return 0.01;
  if (streak <= 10) return 0.02;
  if (streak <= 15) return 0.03;
  if (streak <= 20) return 0.05;
  return 0.08;
}

function initGame() {
  state = {
    streak: 0,
    currentShip: null,
    challengerShip: null,
    prices: {},
    history: [],
    resolved: false,
    gameOver: false,
    winnerSide: null,
    roundNum: 0,
    recentIds: {},
    totalReward: 0,
    lastReward: 0,
    lives: 3,
    livesUsed: 0,
    livesBought: 0,
    lifeSaved: false,
    allShuffled: []
  };
}

function makeShipCard(ship, prices, isCurrent, resolved, leftWon) {
  const price = prices[ship.id];
  let cls = 'ship-card';
  let priceCls = 'price-display';

  if (resolved) {
    const isWinner = (isCurrent && leftWon) || (!isCurrent && !leftWon);
    if (isWinner) {
      cls += ' reveal-high';
      priceCls += ' reveal-high-price';
    } else {
      cls += ' reveal-low';
      priceCls += ' reveal-low-price';
    }
  } else {
    priceCls += ' hidden';
  }

  return `
    <div class="${cls}" data-is-current="${isCurrent}" data-id="${ship.id}">
      <div class="ship-image-wrap">
        <img src="${IMG_BASE}/types/${ship.id}/render?size=256"
             alt="${ship.name}"
             loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=\\'fallback-icon\\'>🚀</div>'">
      </div>
      <div class="ship-name">${ship.name}</div>
      <div class="ship-class">${ship.class}</div>
      <div class="ship-race">${ship.race}</div>
      <div class="${priceCls}">${resolved ? formatISK(price) : '??? ISK'}</div>
    </div>
  `;
}

function renderGame() {
  const area = document.getElementById('game-area');
  if (!state.currentShip || !state.challengerShip) {
    area.innerHTML = `<div class="loading"><div class="spinner"></div><div>Loading ships...</div></div>`;
    return;
  }

  if (state.currentShip.id === state.challengerShip.id) {
    area.innerHTML = `<div class="loading"><div class="spinner"></div><div>Error: duplicate ship</div></div>`;
    return;
  }

  const leftWon = state.resolved
    ? (state.prices[state.currentShip.id] >= state.prices[state.challengerShip.id])
    : null;

  area.innerHTML = [
    makeShipCard(state.currentShip, state.prices, true, state.resolved, leftWon),
    `<div class="vs-divider">VS</div>`,
    makeShipCard(state.challengerShip, state.prices, false, state.resolved, leftWon)
  ].join('');

  if (!state.resolved) {
    document.querySelectorAll('.ship-card').forEach(el => {
      el.addEventListener('click', () => handleGuess(el.dataset.isCurrent === 'true'));
    });
  }
}

function renderButtons() {
  const container = document.getElementById('guess-buttons');
  const cur = state.currentShip;
  const chal = state.challengerShip;
  const pricesLoaded = cur && chal && state.prices[cur.id] != null && state.prices[chal.id] != null;
  
  if (state.resolved && state.lifeSaved) {
    container.innerHTML = `<div class="life-saved-area"><span class="next-round-msg">Continuing in...</span><span class="countdown-number" id="life-countdown">2</span></div>`;
  } else if (state.gameOver) {
    const totalISK = state.history.reduce((sum, h) => sum + (h.price || 0), 0);
    const livesMsg = state.livesUsed > 0 ? ` • ${state.livesUsed} life${state.livesUsed > 1 ? 's' : ''} saved` : '';
    let html = `<div class="game-over-panel">
      <div class="go-title lose">GAME OVER</div>
      <div class="go-streak">${state.streak}</div>
      <div class="go-label">${state.streak} correct guess${state.streak !== 1 ? 'es' : ''} • ${formatISKShort(state.totalReward)} ISK earned${livesMsg}</div>
      <div class="go-history">
        <div class="history-item"><span class="h-name">${state.currentShip.name}</span><span class="h-price">${formatISKShort(state.prices[state.currentShip.id])} ISK</span></div>
        <div class="history-item"><span class="h-name">${state.challengerShip.name}</span><span class="h-price">${formatISKShort(state.prices[state.challengerShip.id])} ISK</span></div>
      </div><button class="result-btn" id="restart-btn">PLAY AGAIN</button></div>`;
    container.innerHTML = html;
    document.getElementById('restart-btn').addEventListener('click', startGame);
  } else if (state.resolved) {
    container.innerHTML = `<div class="countdown-area"><span class="countdown-number" id="countdown-number">3</span></div>`;
  } else {
    const disabled = !pricesLoaded ? 'disabled' : '';
    container.innerHTML = `
      <button class="guess-btn" id="guess-this" ${disabled}>← THIS IS HIGHER</button>
      <button class="guess-btn" id="guess-other" ${disabled}>THIS IS HIGHER →</button>
    `;
    if (pricesLoaded) {
      document.getElementById('guess-this').addEventListener('click', () => handleGuess(true));
      document.getElementById('guess-other').addEventListener('click', () => handleGuess(false));
    }
  }
}

function handleGuess(guessedCurrentIsHigher) {
  if (state.resolved) return;
  state.resolved = true;

  const curPrice = state.prices[state.currentShip.id];
  const chalPrice = state.prices[state.challengerShip.id];
  const currentIsHigher = curPrice >= chalPrice;
  const correct = guessedCurrentIsHigher === currentIsHigher;

  state.roundNum++;
  cleanRecent();

  // Mark both ships as recently used so they don't repeat for 15 rounds
  addRecent(state.currentShip.id);
  addRecent(state.challengerShip.id);

  if (correct) {
    state.streak++;
    const winner = currentIsHigher ? state.currentShip : state.challengerShip;
    state.history.push({ name: winner.name, price: state.prices[winner.id] });
    state.winnerSide = currentIsHigher ? 'current' : 'challenger';
    state.lastReward = Math.round(state.prices[winner.id] * getRewardRate(state.streak));
    state.totalReward += state.lastReward;
    showFeedback(true, winner, state.prices[winner.id], state.lastReward);
    if (state.streak > 0 && state.streak % 5 === 0) {
      SoundFX.streak();
    } else {
      SoundFX.correct();
    }
  } else {
    if (state.lives > 0) {
      state.lives--;
      state.livesUsed++;
      state.history.push({ name: state.currentShip.name, price: curPrice });
      state.history.push({ name: state.challengerShip.name, price: chalPrice });
      state.winnerSide = null;
      state.lifeSaved = true;
      showFeedback(false, null, null, null, 'life');
      SoundFX.wrong();
    } else {
      state.history.push({ name: state.currentShip.name, price: curPrice });
      state.history.push({ name: state.challengerShip.name, price: chalPrice });
      state.winnerSide = null;
      showFeedback(false);
      SoundFX.wrong();
      setTimeout(() => SoundFX.gameOver(), 600);
    }
  }

  renderGame();
  updateHeader();

  if (!correct && !state.lifeSaved) {
    state.gameOver = true;
  }
  renderButtons();

  if (correct) {
    startCountdown();
  } else if (state.lifeSaved) {
    startLifeCountdown();
  }
}

let countdownTimer = null;
let lifeTimer = null;

function startLifeCountdown() {
  if (lifeTimer) clearInterval(lifeTimer);
  let count = 2;
  const el = document.getElementById('life-countdown');
  if (!el) { nextRound(); return; }
  el.textContent = count;
  lifeTimer = setInterval(() => {
    count--;
    if (count > 0) {
      el.textContent = count;
      SoundFX.tick();
    } else {
      clearInterval(lifeTimer);
      lifeTimer = null;
      state.lifeSaved = false;
      SoundFX.go();
      nextRound();
    }
  }, 1000);
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  let count = 3;
  const el = document.getElementById('countdown-number');
  if (!el) return;
  el.textContent = count;
  SoundFX.tick();
  countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      el.textContent = count;
      SoundFX.tick();
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      SoundFX.go();
      nextRound();
    }
  }, 1000);
}

let currentRefreshCap = 0;

async function refreshTier(cap) {
  const toRefresh = state.allShuffled.filter(s => {
    const staticPrice = PRICE_DATA && PRICE_DATA.prices[s.id];
    return staticPrice != null && staticPrice > 0 && staticPrice <= cap;
  });
  let offset = 0;
  while (offset < toRefresh.length) {
    const batch = toRefresh.slice(offset, offset + 6);
    offset += 6;
    const results = await Promise.allSettled(batch.map(s => refreshPriceFromESI(s.id)));
    for (let i = 0; i < batch.length; i++) {
      const price = results[i].status === 'fulfilled' ? results[i].value : null;
      if (price != null && price > 0) {
        state.prices[batch[i].id] = price;
        priceCache.set(batch[i].id, { price, ts: Date.now() });
      }
    }
    if (offset < toRefresh.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

async function refreshPriceFromESI(typeId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const url = `${ESI_BASE}/markets/${JITA_REGION}/orders/?type_id=${typeId}&order_type=sell&_=${Date.now()}`;
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const orders = await res.json();
    if (!orders.length) return null;
    return Math.min(...orders.map(o => o.price));
  } catch (e) {
    return null;
  }
}

function getTierCap(streak) {
  if (streak <= 10) return 20000000;
  if (streak <= 15) return 500000000;
  if (streak <= 20) return 2000000000;
  if (streak <= 25) return 10000000000;
  if (streak <= 30) return 50000000000;
  return Infinity;
}

async function nextRound() {
  SoundFX.click();
  state.resolved = false;
  state.lifeSaved = false;
  document.getElementById('feedback').className = 'feedback';
  document.getElementById('feedback').textContent = '';

  if (state.winnerSide === 'challenger') {
    state.currentShip = state.challengerShip;
  }
  state.winnerSide = null;

  // Expand ESI refresh if we crossed into a higher price tier
  const newTierCap = getTierCap(state.streak);
  if (newTierCap > currentRefreshCap) {
    currentRefreshCap = newTierCap;
    refreshTier(currentRefreshCap).catch(() => {});
  }

  let challenger = getChallenger(state.currentShip, state.prices, state.streak);
  
  if (!challenger) {
    state.gameOver = true;
    renderButtons();
    return;
  }

  state.challengerShip = challenger;

  const newPrice = await fetchShipPrice(challenger.id);
  if (newPrice == null) {
    state.gameOver = true;
    renderButtons();
    return;
  }
  state.prices[challenger.id] = newPrice;

  renderGame();
  renderButtons();
  updateHeader();
}

function showFeedback(correct, ship, price, reward, lifeUsed) {
  const el = document.getElementById('feedback');
  if (correct) {
    const lifeMsg = state.lives > 0 ? `  <span class="fb-life">❤️ ${state.lives}</span>` : '';
    el.className = 'feedback correct';
    el.innerHTML = `✓ CORRECT  <span class="fb-price">${formatISK(price)}</span>  <span class="fb-reward">+${formatISKShort(reward)} ISK</span>${lifeMsg}`;
  } else if (lifeUsed === 'life') {
    el.className = 'feedback life-saved';
    el.innerHTML = `✗ WRONG  <span class="fb-life-saved">❤️ Life saved! (${state.lives} left)</span>`;
  } else {
    el.className = 'feedback wrong';
    el.textContent = '✗ WRONG';
  }
}

function buyLife() {
  const cost = getBuyLifeCost();
  if (state.totalReward >= cost && !state.resolved && !state.gameOver) {
    state.totalReward -= cost;
    state.lives++;
    state.livesBought++;
    const el = document.getElementById('feedback');
    el.className = 'feedback life-saved';
    el.innerHTML = `<span class="fb-life-saved">🛒 Life purchased for ${formatISKShort(cost)} ISK! ❤️ ${state.lives}</span>`;
    SoundFX.lifeGained();
    updateHeader();
  }
}

function updateHeader() {
  document.getElementById('streak-count').textContent = state.streak;
  document.getElementById('ships-seen').textContent = state.history.length + 1;
  document.getElementById('reward-total').textContent = state.totalReward.toLocaleString('en-US');
  const badge = document.getElementById('streak-badge');
  badge.textContent = `🔥 ${state.streak}`;
  if (state.streak >= 5) {
    badge.classList.add('fire');
  } else {
    badge.classList.remove('fire');
  }
  const livesEl = document.getElementById('lives-display');
  if (livesEl) {
    livesEl.textContent = state.lives > 0 ? `❤️ ${state.lives}` : `❤️ 0`;
    livesEl.style.display = 'inline-block';
  }
  const buyBtn = document.getElementById('buy-life-btn');
  if (buyBtn) {
    const cost = getBuyLifeCost();
    const canBuy = state.totalReward >= cost && !state.resolved && !state.gameOver;
    buyBtn.textContent = `🛒 Buy Life ${formatISKShort(cost)}`;
    buyBtn.classList.toggle('btn-available', canBuy);
    buyBtn.classList.toggle('btn-locked', !canBuy);
  }
}

async function startGame() {
  initGame();
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (lifeTimer) {
    clearInterval(lifeTimer);
    lifeTimer = null;
  }
  document.getElementById('feedback').className = 'feedback';
  document.getElementById('feedback').textContent = '';
  document.getElementById('streak-count').textContent = '0';
  document.getElementById('ships-seen').textContent = '0';
  document.getElementById('reward-total').textContent = '0';
  document.getElementById('streak-badge').textContent = '🔥 0';
  const livesElStart = document.getElementById('lives-display');
  if (livesElStart) livesElStart.textContent = '❤️ 0';

  const shuffled = shuffle([...SHIPS]);
  state.allShuffled = shuffled;
  state.prices = {};
  loadedShipIds = new Set();

  // Load all prices from static reference data for instant start
  for (const ship of SHIPS) {
    const price = PRICE_DATA && PRICE_DATA.prices[ship.id];
    if (price != null && price > 0) {
      state.prices[ship.id] = price;
      priceCache.set(ship.id, { price, ts: Date.now() });
      loadedShipIds.add(ship.id);
    }
  }

  // Background ESI refresh for current tier's ships only
  currentRefreshCap = getTierCap(0);
  refreshTier(currentRefreshCap).catch(() => {});
  
  // Pick first two from the loaded ships within the starting price tier
  const tierCap = getTierCap(0);
  const validShips = state.allShuffled.filter(s => loadedShipIds.has(s.id) && state.prices[s.id] <= tierCap);
  if (validShips.length < 2) {
    document.getElementById('game-area').innerHTML =
      `<div class="error-msg">Could not load prices. <button class="retry-btn" onclick="startGame()">RETRY</button></div>`;
    return;
  }
  
  const shipA = validShips[0];
  const shipB = validShips[1];
  
  state.currentShip = shipA;
  state.challengerShip = shipB;
  state.history = [{ name: shipA.name, price: state.prices[shipA.id] }];
  
  renderGame();
  renderButtons();
  updateHeader();
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('buy-life-btn').addEventListener('click', buyLife);
  startGame();
});
