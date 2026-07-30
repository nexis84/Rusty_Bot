const ESI_BASE = 'https://esi.evetech.net/latest';
const JITA_REGION = '10000002';
const IMG_BASE = 'https://images.evetech.net';

let state = null;
let priceCache = new Map();
let loadedShipIds = new Set();
const CACHE_TTL = 3600000;
const FETCH_TIMEOUT = 10000;
const MAX_ROUNDS = 50;
const SAVE_KEY = 'isk_game_state';
const LEADERBOARD_KEY = 'isk_leaderboard';

function getBuyLifeCost() {
  const x = state.livesBought;
  const tiers = [1, 25, 50, 90, 150, 250, 300];
  if (x < 7) return tiers[x] * 1000000;
  return 300000000;
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
  } catch { return null; }
}

function savePriceToCache(typeId, price) {
  try {
    localStorage.setItem(`ship_price_${typeId}`, JSON.stringify({ price, ts: Date.now() }));
  } catch {}
}

const SoundFX = {
  _ctx: null,
  _init() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
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
  click() { this._play(800, 0.05, 'sine'); },
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
  tick() { this._play(660, 0.08, 'sine'); },
  go() {
    this._play(880, 0.15, 'sine');
    setTimeout(() => this._play(1047, 0.2, 'sine'), 100);
  },
  lifeGained() {
    this._play(660, 0.1, 'sine');
    setTimeout(() => this._play(880, 0.1, 'sine'), 80);
    setTimeout(() => this._play(1100, 0.15, 'sine'), 160);
  },
  victory() {
    this._play(523, 0.1, 'sine');
    setTimeout(() => this._play(659, 0.1, 'sine'), 100);
    setTimeout(() => this._play(784, 0.12, 'sine'), 200);
    setTimeout(() => this._play(1047, 0.3, 'sine'), 300);
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

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' }
      });
      clearTimeout(timeout);
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timeout);
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      } else {
        throw e;
      }
    }
  }
  return null;
}

async function fetchShipPrice(typeId) {
  if (priceCache.has(typeId)) {
    const cached = priceCache.get(typeId);
    if (Date.now() - cached.ts < 60000) return cached.price;
  }

  const cachedPrice = loadPriceFromCache(typeId);
  if (cachedPrice !== null) {
    priceCache.set(typeId, { price: cachedPrice, ts: Date.now() });
    return cachedPrice;
  }

  const staticPrice = PRICE_DATA && PRICE_DATA.prices[typeId];

  try {
    const url = `${ESI_BASE}/markets/${JITA_REGION}/orders/?type_id=${typeId}&order_type=sell&_=${Date.now()}`;
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) return staticPrice || null;
    const orders = await res.json();
    if (!orders.length) return staticPrice || null;
    const price = Math.min(...orders.map(o => o.price));
    priceCache.set(typeId, { price, ts: Date.now() });
    savePriceToCache(typeId, price);
    return price;
  } catch {
    return staticPrice || null;
  }
}

function addRecent(id) { state.recentIds[id] = state.roundNum; }

function cleanRecent() {
  for (const id of Object.keys(state.recentIds)) {
    if (state.roundNum - state.recentIds[id] >= 15) delete state.recentIds[id];
  }
}

function isRecent(id) {
  const seen = state.recentIds[id];
  return seen != null && state.roundNum - seen < 15;
}

function getChallenger(currentShip, prices, streak, roundNum) {
  const currentPrice = prices[currentShip.id];
  const minDiff = getMinPriceDiff(streak);
  const tierCap = getTierCap(roundNum);
  const minPrice = currentPrice * (1 - minDiff);
  const maxPrice = Math.min(currentPrice * (1 + minDiff), tierCap);

  let pool = SHIPS.filter(s => {
    if (s.id === currentShip.id) return false;
    if (isRecent(s.id)) return false;
    const p = prices[s.id];
    return p != null && p > 0 && p >= minPrice && p <= maxPrice && p <= tierCap;
  });

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
    won: false,
    winnerSide: null,
    roundNum: 0,
    recentIds: {},
    totalReward: 0,
    lastReward: 0,
    lives: 3,
    livesUsed: 0,
    livesBought: 0,
    lifeSaved: false,
    allShuffled: [],
    countdownTimer: null,
    lifeTimer: null,
    refreshCap: 0
  };
}

function saveGameState() {
  try {
    const save = {
      streak: state.streak,
      roundNum: state.roundNum,
      totalReward: state.totalReward,
      lives: state.lives,
      livesUsed: state.livesUsed,
      livesBought: state.livesBought,
      history: state.history,
      recentIds: state.recentIds,
      refreshCap: state.refreshCap,
      timestamp: Date.now()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {}
}

function clearGameState() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

function loadBestStreak() {
  try {
    const data = localStorage.getItem(LEADERBOARD_KEY);
    if (!data) return { bestStreak: 0, bestEarnings: 0 };
    return JSON.parse(data);
  } catch { return { bestStreak: 0, bestEarnings: 0 }; }
}

function saveBestStreak(streak, earnings) {
  try {
    const current = loadBestStreak();
    if (streak > current.bestStreak || (streak === current.bestStreak && earnings > current.bestEarnings)) {
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify({
        bestStreak: streak,
        bestEarnings: Math.max(earnings, current.bestEarnings),
        date: Date.now()
      }));
    }
  } catch {}
}

function makeShipCard(ship, prices, isCurrent, resolved, leftWon) {
  const price = prices[ship.id];
  let cls = 'ship-card';
  let priceCls = 'price-display';

  if (resolved) {
    const isWinner = (isCurrent && leftWon) || (!isCurrent && !leftWon);
    cls += isWinner ? ' reveal-high' : ' reveal-low';
    priceCls += isWinner ? ' reveal-high-price' : ' reveal-low-price';
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
  } else if (state.won) {
    const livesMsg = state.livesUsed > 0 ? ` • ${state.livesUsed} life${state.livesUsed > 1 ? 's' : ''} saved` : '';
    const topTier = getTierCap(state.roundNum);
    const lb = loadBestStreak();
    container.innerHTML = `<div class="game-over-panel">
      <div class="go-title win">You Win</div>
      <div class="go-label">You have successfully finished all ${MAX_ROUNDS} rounds</div>
      <div class="go-streak">${state.streak}</div>
      <div class="go-label">${state.streak} correct • ${state.history.length} ships seen • ${formatISKShort(state.totalReward)} ISK earned${livesMsg}</div>
      <div class="go-history">
        <div class="history-item"><span class="h-name">Final ship:</span><span class="h-price">${state.currentShip.name}</span></div>
        <div class="history-item"><span class="h-name">Tier reached:</span><span class="h-price">${formatISKShort(topTier)}</span></div>
        <div class="history-item"><span class="h-name">Personal Best:</span><span class="h-price">${lb.bestStreak} (${formatISKShort(lb.bestEarnings)} ISK)</span></div>
      </div><button class="result-btn" id="restart-btn">PLAY AGAIN</button></div>`;
    document.getElementById('restart-btn').addEventListener('click', startGame);
  } else if (state.gameOver) {
    const totalISK = state.history.reduce((sum, h) => sum + (h.price || 0), 0);
    const livesMsg = state.livesUsed > 0 ? ` • ${state.livesUsed} life${state.livesUsed > 1 ? 's' : ''} saved` : '';
    const lb = loadBestStreak();
    let html = `<div class="game-over-panel">
      <div class="go-title lose">GAME OVER</div>
      <div class="go-streak">${state.streak}</div>
      <div class="go-label">${state.streak} correct guess${state.streak !== 1 ? 'es' : ''} • ${formatISKShort(state.totalReward)} ISK earned${livesMsg}</div>
      <div class="go-history">
        <div class="history-item"><span class="h-name">${state.currentShip.name}</span><span class="h-price">${formatISKShort(state.prices[state.currentShip.id])} ISK</span></div>
        <div class="history-item"><span class="h-name">${state.challengerShip.name}</span><span class="h-price">${formatISKShort(state.prices[state.challengerShip.id])} ISK</span></div>
        <div class="history-item"><span class="h-name">Personal Best:</span><span class="h-price">${lb.bestStreak} (${formatISKShort(lb.bestEarnings)} ISK)</span></div>
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

    if (state.roundNum >= MAX_ROUNDS) {
      state.won = true;
      if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
      if (state.lifeTimer) { clearInterval(state.lifeTimer); state.lifeTimer = null; }
      SoundFX.victory();
      clearGameState();
      saveBestStreak(state.streak, state.totalReward);
      renderGame();
      updateHeader();
      renderButtons();
      return;
    }

    if (state.streak > 0 && state.streak % 5 === 0) SoundFX.streak();
    else SoundFX.correct();
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
  saveGameState();

  if (!correct && !state.lifeSaved) {
    state.gameOver = true;
    clearGameState();
    saveBestStreak(state.streak, state.totalReward);
  }
  renderButtons();

  if (correct) {
    startCountdown();
  } else if (state.lifeSaved) {
    startLifeCountdown();
  }
}

function startLifeCountdown() {
  if (state.lifeTimer) clearInterval(state.lifeTimer);
  let count = 2;
  const el = document.getElementById('life-countdown');
  if (!el) { nextRound(); return; }
  el.textContent = count;
  state.lifeTimer = setInterval(() => {
    count--;
    if (count > 0) {
      el.textContent = count;
      SoundFX.tick();
    } else {
      clearInterval(state.lifeTimer);
      state.lifeTimer = null;
      state.lifeSaved = false;
      SoundFX.go();
      nextRound();
    }
  }, 1000);
}

function startCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  let count = 3;
  const el = document.getElementById('countdown-number');
  if (!el) return;
  el.textContent = count;
  SoundFX.tick();
  state.countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      el.textContent = count;
      SoundFX.tick();
    } else {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      SoundFX.go();
      nextRound();
    }
  }, 1000);
}

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
        loadedShipIds.add(batch[i].id);
      }
    }
    if (offset < toRefresh.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

async function refreshPriceFromESI(typeId) {
  try {
    const url = `${ESI_BASE}/markets/${JITA_REGION}/orders/?type_id=${typeId}&order_type=sell&_=${Date.now()}`;
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) return null;
    const orders = await res.json();
    if (!orders.length) return null;
    return Math.min(...orders.map(o => o.price));
  } catch { return null; }
}

function getTierCap(roundNum) {
  if (roundNum <= 2) return 20000000;
  if (roundNum <= 7) return 50000000;
  if (roundNum <= 12) return 100000000;
  if (roundNum <= 17) return 500000000;
  if (roundNum <= 22) return 2000000000;
  if (roundNum <= 27) return 10000000000;
  if (roundNum <= 32) return 50000000000;
  return Infinity;
}

function getTierMinPrice(roundNum) {
  if (roundNum <= 2) return 0;
  if (roundNum <= 7) return 5000000;
  if (roundNum <= 12) return 20000000;
  if (roundNum <= 17) return 100000000;
  if (roundNum <= 22) return 500000000;
  if (roundNum <= 27) return 2000000000;
  if (roundNum <= 32) return 10000000000;
  return 50000000000;
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

  const tierMin = getTierMinPrice(state.roundNum);
  if (state.prices[state.currentShip.id] < tierMin) {
    const candidates = state.allShuffled.filter(s => {
      const p = state.prices[s.id];
      return p != null && p > 0 && p >= tierMin && p <= getTierCap(state.roundNum) && !isRecent(s.id);
    });
    if (candidates.length > 0) {
      state.currentShip = pickRandom(candidates);
      state.history.push({ name: state.currentShip.name, price: state.prices[state.currentShip.id] });
    }
  }

  const newTierCap = getTierCap(state.roundNum);
  if (newTierCap > state.refreshCap) {
    state.refreshCap = newTierCap;
    refreshTier(state.refreshCap).catch(() => {});
  }

  let challenger = getChallenger(state.currentShip, state.prices, state.streak, state.roundNum);

  if (!challenger) {
    state.gameOver = true;
    clearGameState();
    saveBestStreak(state.streak, state.totalReward);
    renderButtons();
    return;
  }

  state.challengerShip = challenger;

  const newPrice = await fetchShipPrice(challenger.id);
  if (newPrice == null) {
    state.gameOver = true;
    clearGameState();
    saveBestStreak(state.streak, state.totalReward);
    renderButtons();
    return;
  }
  state.prices[challenger.id] = newPrice;
  loadedShipIds.add(challenger.id);

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
    saveGameState();
  } else if (state.totalReward < cost) {
    const el = document.getElementById('feedback');
    el.className = 'feedback wrong';
    el.innerHTML = `Need ${formatISKShort(cost - state.totalReward)} more ISK to buy a life`;
    setTimeout(() => {
      if (!state.resolved) {
        el.className = 'feedback';
        el.textContent = '';
      }
    }, 2000);
  } else if (state.resolved) {
    const el = document.getElementById('feedback');
    el.className = 'feedback wrong';
    el.textContent = 'Cannot buy life during a round';
    setTimeout(() => {
      if (state.resolved) {
        el.className = 'feedback';
        el.textContent = '';
      }
    }, 2000);
  }
}

function updateHeader() {
  document.getElementById('streak-count').textContent = state.streak;
  document.getElementById('ships-seen').textContent = state.history.length + 1;
  document.getElementById('round-count').textContent = state.roundNum;
  document.getElementById('reward-total').textContent = state.totalReward.toLocaleString('en-US');
  const badge = document.getElementById('streak-badge');
  badge.textContent = `🔥 ${state.streak}`;
  badge.classList.toggle('fire', state.streak >= 5);
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
    buyBtn.title = canBuy
      ? `Purchase an extra life for ${formatISKShort(cost)} ISK`
      : state.resolved
        ? 'Cannot buy life during a round'
        : state.gameOver
          ? 'Game is over'
          : `Need ${formatISKShort(cost - state.totalReward)} more ISK`;
  }
}

function loadCachePrices() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('ship_price_')) {
      const typeId = parseInt(key.slice('ship_price_'.length), 10);
      if (!isNaN(typeId)) {
        const cached = loadPriceFromCache(typeId);
        if (cached != null && cached > 0) {
          loadedShipIds.add(typeId);
        }
      }
    }
  }
}

async function startGame() {
  initGame();

  document.getElementById('feedback').className = 'feedback';
  document.getElementById('feedback').textContent = '';
  document.getElementById('streak-count').textContent = '0';
  document.getElementById('ships-seen').textContent = '0';
  document.getElementById('round-count').textContent = '0';
  document.getElementById('reward-total').textContent = '0';
  document.getElementById('streak-badge').textContent = '🔥 0';
  const livesElStart = document.getElementById('lives-display');
  if (livesElStart) livesElStart.textContent = '❤️ 0';

  const shuffled = shuffle([...SHIPS]);
  state.allShuffled = shuffled;
  state.prices = {};
  loadedShipIds = new Set();

  // Load all prices from static reference data
  for (const ship of SHIPS) {
    const price = PRICE_DATA && PRICE_DATA.prices[ship.id];
    if (price != null && price > 0) {
      state.prices[ship.id] = price;
      priceCache.set(ship.id, { price, ts: Date.now() });
      loadedShipIds.add(ship.id);
    }
  }

  // Also load any prices cached in localStorage (from previous ESI fetches)
  loadCachePrices();
  for (const id of loadedShipIds) {
    if (state.prices[id] == null) {
      const cachedPrice = loadPriceFromCache(id);
      if (cachedPrice != null) {
        state.prices[id] = cachedPrice;
        priceCache.set(id, { price: cachedPrice, ts: Date.now() });
      }
    }
  }

  // Background ESI refresh for current tier
  state.refreshCap = getTierCap(0);
  refreshTier(state.refreshCap).catch(() => {});

  // Pick first two ships from the loaded ships within the starting price tier
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
  clearGameState();
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('buy-life-btn').addEventListener('click', buyLife);
  startGame();
});
