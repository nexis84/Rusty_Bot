let ships = [];
let state = null;
// track previous remaining guesses to animate changes
let prevRemaining = null;
// track previous wrong guesses count so newest wrong can animate
let prevWrongCount = 0;

// Statistics tracking
let stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0, 0, 0] // index 0-7 for guesses 1-8
};

function loadStats() {
  const saved = localStorage.getItem('shipGameStats');
  if (saved) {
    try {
      stats = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }
}

function saveStats() {
  localStorage.setItem('shipGameStats', JSON.stringify(stats));
}

function updateStatsOnWin(guessesUsed) {
  stats.gamesPlayed++;
  stats.gamesWon++;
  stats.currentStreak++;
  if (stats.currentStreak > stats.maxStreak) {
    stats.maxStreak = stats.currentStreak;
  }
  // guessesUsed is 1-8, array index is 0-7
  const index = Math.max(0, Math.min(7, guessesUsed - 1));
  stats.guessDistribution[index]++;
  saveStats();
}

function updateStatsOnLoss() {
  stats.gamesPlayed++;
  stats.currentStreak = 0;
  saveStats();
}

function displayStats() {
  document.getElementById('stat-played').textContent = stats.gamesPlayed;
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  document.getElementById('stat-winrate').textContent = winRate;
  document.getElementById('stat-current-streak').textContent = stats.currentStreak;
  document.getElementById('stat-max-streak').textContent = stats.maxStreak;
  
  // Display guess distribution
  const distContainer = document.getElementById('distribution-bars');
  distContainer.innerHTML = '';
  const maxCount = Math.max(...stats.guessDistribution, 1); // avoid division by zero
  
  for (let i = 0; i < 8; i++) {
    const count = stats.guessDistribution[i];
    const percentage = (count / maxCount) * 100;
    
    const row = document.createElement('div');
    row.className = 'dist-row';
    
    const label = document.createElement('div');
    label.className = 'dist-label';
    label.textContent = i + 1;
    
    const barContainer = document.createElement('div');
    barContainer.className = 'dist-bar-container';
    
    const bar = document.createElement('div');
    bar.className = 'dist-bar';
    bar.style.width = Math.max(percentage, count > 0 ? 8 : 0) + '%';
    bar.textContent = count;
    
    // Highlight the most recent game's guess count
    if (state && state.won && (8 - state.guessesLeft) === (i + 1)) {
      bar.classList.add('highlight');
    }
    
    barContainer.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barContainer);
    distContainer.appendChild(row);
  }
}

function generateShareText() {
  if (!state) return '';
  
  const guessesUsed = 8 - state.guessesLeft;
  const resultText = state.won ? `${guessesUsed}/8` : 'X/8';
  
  let shareText = `Classified Hulls ${resultText}\n\n`;
  
  // Generate visual representation using emojis
  const totalGuesses = 8;
  for (let i = 0; i < totalGuesses; i++) {
    if (state.won && i < guessesUsed - 1) {
      shareText += '🟥'; // wrong guesses
    } else if (state.won && i === guessesUsed - 1) {
      shareText += '🟩'; // correct guess
    } else if (!state.won && i < guessesUsed) {
      shareText += '🟥'; // all wrong when lost
    } else {
      shareText += '⬜'; // unused guesses
    }
  }
  
  shareText += `\n\nShip: ${state.ship.name}`;
  shareText += `\nRace: ${state.ship.race} | Class: ${state.ship.class}`;
  
  return shareText;
}

async function shareResults() {
  const shareText = generateShareText();
  
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareText);
      showShareFeedback();
    } else {
      // Fallback for older browsers or non-HTTPS
      const textArea = document.createElement('textarea');
      textArea.value = shareText;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showShareFeedback();
      } catch (err) {
        alert('Failed to copy. Please try again.');
      }
      document.body.removeChild(textArea);
    }
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy results. Please try again.');
  }
}

function showShareFeedback() {
  const feedback = document.querySelector('.share-feedback');
  if (feedback) {
    feedback.classList.add('show');
    setTimeout(() => feedback.classList.remove('show'), 2000);
  }
}

async function loadData() {
  const res = await fetch('./data/ships.json');
  ships = await res.json();
}

function pickShip() {
  const idx = Math.floor(Math.random() * ships.length);
  return ships[idx];
}

function startNewGame() {
  const ship = pickShip();
  // prepare hints queue: ship bonuses (split into items), then role-specific bonuses already in list, then race, then class
  const hints = [];
  // ship.bonuses may contain combined strings separated by ' - '.
  // Split them so each small bonus becomes its own hint.
  for (const b of ship.bonuses || []) {
    const parts = b.split(/\s*-\s*/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let p of parts) {
      // sanitize: do not leak race/class prefixes like "Caldari Battlecruiser: ..."
      // keep Role Bonus entries as-is
      if (/^role bonus:/i.test(p)) {
        hints.push(p);
        continue;
      }
      const m = p.match(/^([^:]+):\s*(.*)$/);
      if (m) {
        const prefix = m[1].toLowerCase();
        const body = m[2].trim();
        const shipRace = (ship.race || '').toLowerCase();
        const shipClass = (ship.class || '').toLowerCase();
        // normalize helper: lowercase, trim, remove trailing plural 's' for tolerant matching
        const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g,' ').replace(/s$/,'');
        const nPrefix = norm(prefix);
        const nRace = norm(shipRace);
        const nClass = norm(shipClass);
        // if the prefix matches (tolerantly) the ship's race or class, strip it to avoid leaking
        if ((nRace && nPrefix.includes(nRace)) || (nClass && nPrefix.includes(nClass)) || (nRace && nRace.includes(nPrefix)) || (nClass && nClass.includes(nPrefix))) {
          if (body) hints.push(body);
          else hints.push(p);
        } else {
          hints.push(p);
        }
      } else {
        hints.push(p);
      }
    }
  }
  // ensure uniqueness while preserving order
  const uniq = Array.from(new Set(hints));
  // final fallbacks
  uniq.push(`Race: ${ship.race || 'Unknown'}`);
  uniq.push(`Class: ${ship.class || 'Unknown'}`);

  state = {
    ship,
    hints: uniq,
    revealed: [],
    wrong: [],
    guessesLeft: 8,
  };
  // Reveal the first hint immediately (show a bonus at start)
  if (state.hints.length) {
    state.revealed.push(state.hints[0]);
  }
  renderState();
  focusAndClear();
}

function renderState() {
  const clues = document.getElementById('clues');
  clues.innerHTML = '';
  // Render most-recently revealed hints at the top (newest-first)
  const latestIndex = state.revealed.length - 1;
  for (let i = latestIndex; i >= 0; i--) {
    const h = state.revealed[i];
    const d = document.createElement('div');
    d.className = 'clue';
    // mark the most recently revealed hint (originally the last item)
    if (i === latestIndex) {
      d.classList.add('new', 'latest');
      // remove the transient classes after animation so the DOM doesn't keep animating
      setTimeout(() => { d.classList.remove('new'); d.classList.remove('latest'); }, 900);
    }
    const p = document.createElement('div');
    p.textContent = h;
    d.appendChild(p);
    // append so newest appears at the top (we're iterating newest-first)
    clues.appendChild(d);
  }
  document.getElementById('left').textContent = state.guessesLeft;
  // render visual guess indicator (8 total dots, filled for remaining)
  const indicator = document.getElementById('guess-indicator');
  if (indicator) {
    const total = 8;
    const remaining = Math.max(0, Math.min(total, state.guessesLeft));
    indicator.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      const isRemain = i < remaining;
      dot.className = 'guess-dot ' + (isRemain ? 'remain' : 'used');
      dot.title = isRemain ? 'Remaining' : 'Used';
      // if previous remaining exists, pulse dots that changed state
      if (prevRemaining !== null) {
        const previouslyRemain = i < prevRemaining;
        if (previouslyRemain !== isRemain) {
          // add pulse class briefly
          dot.classList.add('pulse');
          setTimeout(() => dot.classList.remove('pulse'), 600);
        }
      }
      indicator.appendChild(dot);
    }
    prevRemaining = remaining;
    indicator.setAttribute('aria-label', `${state.guessesLeft} guesses left`);
  }
  // render wrong guesses as chips for better readability
  const wrongEl = document.getElementById('wrong');
  wrongEl.innerHTML = '';
  if (state.wrong.length) {
    const label = document.createElement('span');
    label.className = 'wrong-label';
    label.textContent = 'Wrong guesses:';
    wrongEl.appendChild(label);
    for (let i = 0; i < state.wrong.length; i++) {
      const w = state.wrong[i];
      const chip = document.createElement('span');
      chip.className = 'wrong-chip';
      chip.textContent = w;
      // animate newest wrong guess
      if (i === state.wrong.length - 1 && state.wrong.length > prevWrongCount) {
        chip.classList.add('new');
        setTimeout(() => chip.classList.remove('new'), 700);
      }
      wrongEl.appendChild(chip);
    }
  }
  prevWrongCount = state.wrong.length;
  document.getElementById('result').textContent = '';
  // update info panel (hidden until solved or give up)
  document.getElementById('info-race').textContent = state.revealed.includes(`Race: ${state.ship.race}`) ? state.ship.race : '—';
  document.getElementById('info-class').textContent = state.revealed.includes(`Class: ${state.ship.class}`) ? state.ship.class : '—';
  const bList = document.getElementById('info-bonuses');
  bList.innerHTML = '';
    for (const r of state.revealed) {
      if (r.startsWith('Race:') || r.startsWith('Class:')) continue;
      const li = document.createElement('li');
      li.textContent = r;
      bList.appendChild(li);
    }
}

// small niceties: focus and clear guess input when starting
function focusAndClear() {
  const el = document.getElementById('guess');
  if (!el) return;
  // clear immediately, then ensure browser autofill or event handlers don't re-populate it
  el.value = '';
  // brief blur+focus after a tick helps prevent some browsers from restoring the value
  setTimeout(() => {
    try { el.blur(); } catch (e) {}
    try { el.focus(); } catch (e) {}
    el.value = '';
  }, 0);
}

function submitGuess() {
  const val = document.getElementById('guess').value.trim();
  if (!state) { document.getElementById('result').textContent = 'Start a new game first.'; return; }
  if (!val) return;
  const guessLower = val.toLowerCase();
  const target = state.ship.name.toLowerCase();
  if (guessLower === target) {
    // win
    state.won = true;
    const guessesUsed = 8 - state.guessesLeft + 1; // +1 for this correct guess
    updateStatsOnWin(guessesUsed);
    document.getElementById('result').textContent = `Correct! It was ${state.ship.name}.`;
    // reveal full info
    state.revealed = [...state.hints];
    renderState();
    // clear the input after the guess
    focusAndClear();
    // show a winning overlay with ship details
    showWinScreen(state.ship);
    return;
  }
  // wrong
  state.guessesLeft -= 1;
  state.wrong.push(val);
  // reveal next hint
  const next = state.hints.find(h => !state.revealed.includes(h));
  if (next) state.revealed.push(next);
  // if player has 4 wrong guesses, reveal either Race or Class (random choice) if not already revealed
  if (state.wrong.length === 4) {
    const raceHint = `Race: ${state.ship.race || 'Unknown'}`;
    const classHint = `Class: ${state.ship.class || 'Unknown'}`;
    // choose which to reveal; prefer the one not already revealed
    let toReveal = null;
    const raceRevealed = state.revealed.includes(raceHint);
    const classRevealed = state.revealed.includes(classHint);
    if (!raceRevealed && !classRevealed) {
      toReveal = (Math.random() < 0.5) ? raceHint : classHint;
    } else if (!raceRevealed) {
      toReveal = raceHint;
    } else if (!classRevealed) {
      toReveal = classHint;
    }
    if (toReveal) state.revealed.push(toReveal);
  }
  // at 6 wrong guesses, reveal the remaining Race or Class (so both are known by this point)
  if (state.wrong.length === 6) {
    const raceHint = `Race: ${state.ship.race || 'Unknown'}`;
    const classHint = `Class: ${state.ship.class || 'Unknown'}`;
    const raceRevealed = state.revealed.includes(raceHint);
    const classRevealed = state.revealed.includes(classHint);
    if (!raceRevealed && classRevealed) {
      state.revealed.push(raceHint);
    } else if (raceRevealed && !classRevealed) {
      state.revealed.push(classHint);
    } else if (!raceRevealed && !classRevealed) {
      // neither revealed yet (edge-case) — reveal one deterministically: pick randomly
      const toReveal = (Math.random() < 0.5) ? raceHint : classHint;
      state.revealed.push(toReveal);
    }
  }
  renderState();
  // clear and refocus the input after an incorrect guess
  focusAndClear();
    if (state.guessesLeft <= 0) {
      state.won = false;
      updateStatsOnLoss();
      document.getElementById('result').textContent = `Out of guesses! The ship was ${state.ship.name}.`;
      state.revealed = [...state.hints];
      renderState();
      // show lose overlay
      showLoseScreen(state.ship);
    }
}

function giveUp() {
  if (!state) return;
  state.won = false;
  updateStatsOnLoss();
  document.getElementById('result').textContent = `Gave up — the ship was ${state.ship.name}.`;
  state.revealed = [...state.hints];
  renderState();
  // clear the input when the user gives up
  focusAndClear();
  // show lose overlay when user gives up
  showLoseScreen(state.ship);
}

  function showLoseScreen(ship) {
    removeWinScreen();
    const overlay = document.createElement('div');
    overlay.id = 'win-screen';
    overlay.style.background = 'linear-gradient(180deg, rgba(20,6,6,0.85), rgba(0,0,0,0.85))';
    const card = document.createElement('div');
    card.className = 'overlay-card';

    const left = document.createElement('div');
    left.className = 'overlay-left';
    const right = document.createElement('div');
    right.className = 'overlay-right';

    const title = document.createElement('div');
    title.className = 'overlay-title';
    title.textContent = 'You Lost';

    const badge = document.createElement('div');
    badge.className = 'overlay-badge';
    badge.textContent = 'Result';

    const name = document.createElement('div');
    name.className = 'overlay-ship';
    name.textContent = ship.name;

    const meta = document.createElement('div');
    meta.className = 'overlay-meta';
    meta.innerHTML = `<strong>Race:</strong> ${ship.race || '—'} &nbsp; • &nbsp; <strong>Class:</strong> ${ship.class || '—'}`;

    const actions = document.createElement('div');
    actions.className = 'overlay-actions';
    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn';
    shareBtn.textContent = 'Share';
    shareBtn.addEventListener('click', () => { shareResults(); });
    const newBtn = document.createElement('button');
    newBtn.className = 'btn';
    newBtn.textContent = 'New Game';
    newBtn.addEventListener('click', () => { overlay.remove(); startNewGame(); });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'secondary';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(shareBtn);
    actions.appendChild(newBtn);
    actions.appendChild(closeBtn);
    
    const shareFeedback = document.createElement('div');
    shareFeedback.className = 'share-feedback';
    shareFeedback.textContent = '✓ Copied to clipboard!';

    left.appendChild(badge);
    left.appendChild(title);
    left.appendChild(name);
    left.appendChild(meta);
    left.appendChild(actions);
    left.appendChild(shareFeedback);

    const bonusHeader = document.createElement('div');
    bonusHeader.style.fontWeight = '700';
    bonusHeader.style.marginBottom = '8px';
    bonusHeader.textContent = 'Bonuses (revealed):';

    const ul = document.createElement('ul');
    ul.className = 'overlay-bonuses';
    // Split and normalize bonuses into readable lines
    for (const b of ship.bonuses || []) {
      const parts = String(b).split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const li = document.createElement('li');
        li.textContent = part;
        ul.appendChild(li);
      }
    }

    right.appendChild(bonusHeader);
    right.appendChild(ul);

    card.appendChild(left);
    card.appendChild(right);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    // trigger CSS enter animation
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

// remove any existing win overlay
function removeWinScreen() {
  const existing = document.getElementById('win-screen');
  if (existing) existing.remove();
}

// show a simple full-screen win overlay with ship details and controls
function showWinScreen(ship) {
  removeWinScreen();
  const overlay = document.createElement('div');
  overlay.id = 'win-screen';
  overlay.style.background = 'linear-gradient(180deg, rgba(2,10,20,0.9), rgba(0,0,0,0.85))';
  const card = document.createElement('div');
  card.className = 'overlay-card';

  const left = document.createElement('div');
  left.className = 'overlay-left';
  const right = document.createElement('div');
  right.className = 'overlay-right';

  const title = document.createElement('div');
  title.className = 'overlay-title';
  title.textContent = 'You Win!';

  const badge = document.createElement('div');
  badge.className = 'overlay-badge';
  badge.textContent = 'Victory';

  const name = document.createElement('div');
  name.className = 'overlay-ship';
  name.textContent = ship.name;

  const meta = document.createElement('div');
  meta.className = 'overlay-meta';
  meta.innerHTML = `<strong>Race:</strong> ${ship.race || '—'} &nbsp; • &nbsp; <strong>Class:</strong> ${ship.class || '—'}`;

  const actions = document.createElement('div');
  actions.className = 'overlay-actions';
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn';
  shareBtn.textContent = 'Share';
  shareBtn.addEventListener('click', () => { shareResults(); });
  const newBtn = document.createElement('button');
  newBtn.className = 'btn';
  newBtn.textContent = 'New Game';
  newBtn.addEventListener('click', () => { removeWinScreen(); startNewGame(); });
  const closeBtn = document.createElement('button');
  closeBtn.className = 'secondary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => removeWinScreen());
  actions.appendChild(shareBtn);
  actions.appendChild(newBtn);
  actions.appendChild(closeBtn);
  
  const shareFeedback = document.createElement('div');
  shareFeedback.className = 'share-feedback';
  shareFeedback.textContent = '✓ Copied to clipboard!';

  left.appendChild(badge);
  left.appendChild(title);
  left.appendChild(name);
  left.appendChild(meta);
  left.appendChild(actions);
  left.appendChild(shareFeedback);

  const bonusHeader = document.createElement('div');
  bonusHeader.style.fontWeight = '700';
  bonusHeader.style.marginBottom = '8px';
  bonusHeader.textContent = 'Bonuses:';

  const ul = document.createElement('ul');
  ul.className = 'overlay-bonuses';
  for (const b of ship.bonuses || []) {
    const parts = String(b).split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const li = document.createElement('li');
      li.textContent = part;
      ul.appendChild(li);
    }
  }

  right.appendChild(bonusHeader);
  right.appendChild(ul);

  card.appendChild(left);
  card.appendChild(right);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  // trigger CSS enter animation
  requestAnimationFrame(() => overlay.classList.add('show'));
}

function populateDatalist() {
  const dl = document.getElementById('ships');
  dl.innerHTML = '';
  for (const s of ships) {
    const opt = document.createElement('option');
    opt.value = s.name;
    dl.appendChild(opt);
  }
}

document.getElementById('new').addEventListener('click', () => {
  console.log('New Game button clicked');
  try {
    startNewGame();
    console.log('startNewGame completed successfully');
  } catch (error) {
    console.error('Error in startNewGame:', error);
  }
});
document.getElementById('submit').addEventListener('click', () => submitGuess());
document.getElementById('giveup').addEventListener('click', () => giveUp());
document.getElementById('stats').addEventListener('click', () => {
  displayStats();
  document.getElementById('stats-screen').removeAttribute('hidden');
});
document.getElementById('close-stats').addEventListener('click', () => {
  document.getElementById('stats-screen').setAttribute('hidden', '');
});

// Close stats modal when clicking outside
document.getElementById('stats-screen').addEventListener('click', (e) => {
  if (e.target.id === 'stats-screen') {
    document.getElementById('stats-screen').setAttribute('hidden', '');
  }
});

// Close stats modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const statsScreen = document.getElementById('stats-screen');
    if (!statsScreen.hasAttribute('hidden')) {
      statsScreen.setAttribute('hidden', '');
    }
  }
});

document.getElementById('guess').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitGuess();
});

loadStats();
loadData().then(() => {
  populateDatalist();
  // start a new game immediately on first load
  startNewGame();
});

// wire the how-to toggle
document.addEventListener('DOMContentLoaded', () => {
  const howBtn = document.getElementById('howto-toggle');
  const how = document.getElementById('howto');
  if (!howBtn || !how) return;
  howBtn.addEventListener('click', () => {
    const open = how.getAttribute('hidden') === null ? true : false;
    if (open) {
      how.setAttribute('hidden', '');
      howBtn.setAttribute('aria-expanded', 'false');
      howBtn.textContent = 'How to play ▸';
    } else {
      how.removeAttribute('hidden');
      howBtn.setAttribute('aria-expanded', 'true');
      howBtn.textContent = 'How to play ▾';
    }
  });
});
