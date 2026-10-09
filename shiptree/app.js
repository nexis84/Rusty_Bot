/* ============================================================================
 * Ship tree — interactive EVE Online hull-progression viewer
 *
 * Data comes from data/shiptree.json, built by build-shiptree.mjs out of the
 * EVE Static Data Export:
 *   skills[]  ship-gating skills + prerequisite closure (depth, rank, attrs)
 *   ships[]   361 published hulls: lane (faction), row (hull class), tier,
 *             CCP tag list, prerequisites, gate skill
 *
 * Per faction lane the band is: [skill spine] -> [hull-class rows of ships],
 * every ship linked back to each hull skill it needs.
 * ==========================================================================*/
(() => {
'use strict';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const IMG = 'https://images.evetech.net/types';

/* ------------------------------------------------------------------ layout */

const G = {
  bandPad: 30,        // vertical gap between faction bands
  bandHead: 42,       // lane header strip
  padTop: 12, padBottom: 16, padX: 16,
  rowsGap: 18,        // gap between packed hull-class lines
  packGapX: 54,       // gap between two hull-class rows sharing a line
  minRowLabel: 120,   // minimum width a row label reserves when packing
  rowLabelH: 16,
  tileW: 66, tileH: 82, tileGapX: 6, tileGapY: 8,
  rowsMaxW: 1180,     // hull-class rows wrap at this width
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
/* ?debug=1 logs timings to the console. There are no tests around this file, so
   it is the only way to check a perf claim without guessing. */
const DEBUG = new URL(location.href).searchParams.has('debug');
const debug = (...a) => { if (DEBUG) console.log('[shiptree]', ...a); };

/* Respect the OS "reduce motion" setting in JS too - CSS alone cannot stop the
   rAF width tween or smooth scrollIntoView. */
const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* The drawer/layout switch lives at this width in style.css; JS follows it. */
const MOBILE_Q = matchMedia('(max-width: 900px)');
const isMobile = () => MOBILE_Q.matches;

/* The pilot's ESI training queue: the list of queued skills in the left panel,
   and the marker on the chip of the skill being trained right now. Both are
   wired up and verified working, but nothing on the page acts on them yet, so
   for now they only take up space in a panel the user reads to compare hulls.
   Flip this to true to bring both back - it gates the extra ESI request, the
   queue block and the chip marker, and nothing else. queueHTML() and
   trainingNow() stay defined either way.
   Note the chip only lights when the skill being trained is one the focused
   hull actually needs, which is why the marker can look absent at a glance. */
const SHOW_TRAINING_QUEUE = false;

let buildInfoText = '';
const setBuildInfo = text => {
  buildInfoText = text;
  const el = $('buildinfo');
  if (el) el.textContent = text;
};

/** Surface a hard failure (missing or corrupt data) as a centred card instead of
 *  a whisper in the status line nobody looks at. */
function showError(title, detail) {
  const box = $('errorBox');
  if (!box) return;
  box.innerHTML = `<h2>${esc(title)}</h2>`
    + `<p>${esc(detail)}</p>`
    + `<p>If this is a fresh checkout, run <code>node build-shiptree.mjs</code> first.</p>`;
  box.classList.remove('hidden');
}

const state = {
  lanes: new Set(),                 // visible lane ids
  rows: 'all',                      // all | combat | industry
  flyableOnly: false,
  noFlyOnly: false,                 // only hulls you cannot fly yet
  noMasteryV: false,                // only hulls not yet brought to Mastery V
  alphaOnly: false,                 // show only Alpha-flyable hulls
  levels: store.get('st.levels', {}),   // skill id -> your level (0..5)
  primary: store.get('st.p', 17),
  secondary: store.get('st.s', 17),
  selected: null,                   // ship id
  collapsed: new Set(store.get('st.collapsed', [])),   // folded faction sections
  esiChar: null,                    // { id, name } when signed in with EVE
  esiQueue: [],                     // character's skill queue
  skillLane: null,                  // lane whose skill tree is in the left panel
  panelTab: store.get('st.panelTab', 'overview'),  // which right-panel pane is open
  loreOpen: false,                 // hull description expanded?
  compare: null,                   // ship id pinned as the second compare column
  awaitCompare: false,             // next hull click fills the compare column
  showSkills: true,                 // left skills panel visible
  focusLocked: false,               // explicit lane choice wins until you scroll
  hover: null,                      // 's<id>' | 'k<id>'
  query: '',
  matchIndex: 0,
};

let DATA = null;
let skillById = new Map();
let shipById = new Map();
let laneById = new Map();
let rowById = new Map();
let hullSkills = new Set();
let shipsBySkill = new Map();       // skill id -> [ship ids] that require it
let hullChildren = new Map();       // skill id -> [hull skill ids] requiring it
let factionLogos = null;             // Set of lane ids that have a real logo file
let layout = null;                  // last computed layout
let view = { x: 0, y: 0, k: 1 };    // world transform
let matches = [];
const shipWorld = new Map();        // ship id -> {x,y} tile centre in world space

/* Rendered-node caches. Every one of these was a querySelector over ~360 tiles on
   each hover, click or scroll event; they are rebuilt by render() and nowhere
   else, so anything that reaches for a node must go through them. */
const tileNodes = [];               // every hull tile <g>, in render order
const tileById = new Map();         // ship id -> tile <g>
let focusTileId = null;             // tile that owns the roving tabindex (keyboard nav)
let keyboardNav = false;            // true while the user is driving the grid by keyboard
const bandNodes = [];               // every band <g>, parallel to layout.bands
const bandByLane = new Map();       // lane id -> band <g>

/* Stage size, cached: reading clientWidth/clientHeight forces layout, and the
   view maths did it on every wheel tick and pointermove. invalidate() is called
   on resize and on every animation frame while a panel is sliding. */
let stageBox = { w: 0, h: 0 };
function measureStage() {
  const st = $('stage');
  stageBox = { w: st.clientWidth, h: st.clientHeight };
}

/* ------------------------------------------------------------------ helpers */

const svgEl = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const roman = n => ROMAN[n] ?? String(n);

// SP needed to train a skill to `level` from scratch, and between two levels.
// Level 0 must be 0 SP, not level 1's cost - otherwise untrained requirements
// report no training time at all.
const spTotal = (rank, level) => (level <= 0 ? 0 : 250 * (rank || 1) * Math.pow(4, level - 1));
const spBetween = (rank, from, to) => Math.max(0, spTotal(rank, to) - spTotal(rank, Math.max(0, from)));

const spm = () => (state.primary || 17) + (state.secondary || 17) / 2;

function fmtMinutes(min) {
  if (!isFinite(min) || min <= 0) return '0m';
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
  const d = Math.floor(min / (60 * 24));
  const h = Math.round((min % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Wrap a hull name onto up to two tidy lines, ellipsising only if it must. */
function wrapName(name, maxChars = 14) {
  if (name.length <= maxChars) return [name];
  const words = name.split(' ');
  if (words.length === 1) return [name.slice(0, maxChars - 1) + '…'];
  let l1 = '', l2 = '';
  for (const w of words) {
    const cand = l1 ? `${l1} ${w}` : w;
    if (!l2 && cand.length <= maxChars) l1 = cand;
    else l2 = l2 ? `${l2} ${w}` : w;
  }
  if (l2.length > maxChars) l2 = l2.slice(0, maxChars - 1) + '…';
  return l2 ? [l1, l2] : [l1];
}

const shipClass = s => `ship ${(s.tier || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'other'}`;

/* Real text measurement for row-packing maths. Canvas measureText knows nothing
   about letter-spacing or text-transform, and the label rule carries both - so
   derive the font from a live probe of .row-label instead of restating it here.
   Hard-coded constants drifted once already: they named a font the page never
   loads, a bolder weight than it renders at, and skipped the uppercase. */
const measCtx = document.createElement('canvas').getContext('2d');
let labelMetrics = null;
function rowLabelMetrics() {
  if (labelMetrics) return labelMetrics;
  const cs = getComputedStyle(document.documentElement);
  const probe = document.createElementNS(NS, 'text');
  probe.setAttribute('class', 'row-label');
  probe.textContent = 'M';
  world.appendChild(probe);
  const s = getComputedStyle(probe);
  labelMetrics = {
    font: `${s.fontWeight} ${s.fontSize} / normal ${s.fontFamily || cs.fontFamily}`,
    spacing: parseFloat(s.letterSpacing) || 0,
    upper: s.textTransform === 'uppercase',
  };
  probe.remove();
  return labelMetrics;
}
const textWidth = (str) => {
  const m = rowLabelMetrics();
  const s = m.upper ? str.toUpperCase() : str;
  measCtx.font = m.font;
  return measCtx.measureText(s).width + s.length * m.spacing;
};

/* ------------------------------------------------------------- fleet status */

const yourLevel = id => state.levels[id] || 0;

/** Do we know any skill levels at all - from EVE, or from the level chips? */
const levelsKnown = () => !!state.esiChar || Object.keys(state.levels).length > 0;

function isFlyable(ship) {
  return ship.prereqs.every(p => yourLevel(p.skill) >= p.level);
}
/** Number of unmet prerequisites, and the "easiest" one to close next. */
function gaps(ship) {
  const miss = ship.prereqs.filter(p => yourLevel(p.skill) < p.level);
  miss.sort((a, b) => (a.level - yourLevel(a.skill)) - (b.level - yourLevel(b.skill)));
  return miss;
}
/** Flyability of a hull against the levels we know:
 *    fly     - every requirement met                      (green)
 *    partial - some progress toward it, but not there yet  (orange)
 *    no      - nothing trained toward it                   (red)
 *    unknown - we have no skill data at all                (neutral) */
function shipStatus(ship) {
  if (!levelsKnown()) return 'unknown';
  const miss = gaps(ship);
  if (!miss.length) return 'fly';
  return ship.prereqs.some(p => yourLevel(p.skill) > 0) ? 'partial' : 'no';
}

/** Verdict for the focused-hull panel: can you fly it, or are you one skill short?
 *  Kept separate from shipStatus() because that one drives the tile colour classes,
 *  which know nothing about "how many" skills are missing.
 *    fly     - every requirement met                        (green)
 *    next    - exactly one requirement missing              (amber)
 *    no      - two or more requirements missing             (red)
 *    unknown - we have no skill data at all                 (neutral) */
function shipVerdict(ship) {
  if (!levelsKnown()) return 'unknown';
  const miss = gaps(ship);
  if (!miss.length) return 'fly';
  return miss.length === 1 ? 'next' : 'no';
}

/** Screen-reader label for a hull tile: name, class, fly state, mastery, Omega. */
function tileAriaLabel(ship) {
  const st = shipStatus(ship);
  const status = st === 'fly' ? 'flyable' : st === 'partial' ? 'part trained'
    : st === 'no' ? 'cannot fly' : 'not checked';
  const lvl = masteryLevel(ship);
  return [
    ship.name,
    rowById.get(ship.row)?.name,
    status,
    levelsKnown() && lvl != null ? `mastery ${lvl === 0 ? 'none' : roman(lvl)}` : null,
    ship.alpha ? null : 'Omega only',
  ].filter(Boolean).join(', ');
}

/* ------------------------------------------------ hull-skill graph utilities */

/** Reverse indexes, built once. Hulls reference skill profiles by id and the
 *  highlight walk needs "what does this skill gate", which used to be a rescan of
 *  all 137 skills on every mousemove. */
function buildIndexes() {
  shipById = new Map(DATA.ships.map(s => [s.id, s]));
  shipsBySkill = new Map();
  for (const s of DATA.ships) {
    for (const p of s.prereqs) {
      if (!shipsBySkill.has(p.skill)) shipsBySkill.set(p.skill, []);
      shipsBySkill.get(p.skill).push(s.id);
    }
  }
  hullChildren = new Map();
  for (const s of DATA.skills) {
    if (!s.hull) continue;
    for (const p of s.req) {
      if (!hullChildren.has(p.skill)) hullChildren.set(p.skill, []);
      hullChildren.get(p.skill).push(s.id);
    }
  }
}

/** Hull skills downstream of `id`, via the precomputed reverse index. */
function descendantsOf(id) {
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    for (const child of hullChildren.get(stack.pop()) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ layout */

function rowAllowed(rowId) {
  if (state.rows === 'all') return true;
  const row = rowById.get(rowId);
  const haul = (row?.tags ?? []).some(t => /Hauling|Resource Harvesting/.test(t));
  return state.rows === 'combat' ? !haul : haul;
}

function visibleShips() {
  return DATA.ships.filter(s => state.lanes.has(s.lane) && rowAllowed(s.row)
    && (!state.flyableOnly || isFlyable(s))
    && (!state.noFlyOnly || !isFlyable(s))
    && (!state.noMasteryV || missingMasteryV(s))
    && (!state.alphaOnly || s.alpha));
}

function computeLayout() {
  const ships = visibleShips();
  const bands = [];
  let y = 24;
  const rowsX = G.padX;

  const byLane = new Map();
  for (const s of ships) {
    if (!byLane.has(s.lane)) byLane.set(s.lane, []);
    byLane.get(s.lane).push(s);
  }

  for (const lane of DATA.lanes) {
    const laneShips = byLane.get(lane.id);
    if (!laneShips || !laneShips.length) continue;

    // a collapsed section keeps its header but draws no rows
    if (state.collapsed.has(lane.id)) {
      const bandH = G.bandHead + 10;
      bands.push({ lane, y, h: bandH, rows: [], rowsH: 0, ships: laneShips.length, collapsed: true });
      y += bandH + G.bandPad;
      continue;
    }

    /* ---- hull-class rows: label + a line of hull tiles, packed ---- */
    const rowsMap = new Map();
    for (const s of laneShips) {
      const rid = s.row;
      if (!rowsMap.has(rid)) rowsMap.set(rid, []);
      rowsMap.get(rid).push(s);
    }
    const rows = [];
    let packX = rowsX;                       // cursor within the packed line
    let lineY = y + G.bandHead + G.padTop;   // top of the current line
    let lineH = 0;                           // tallest row in the current line
    for (const rid of [...rowsMap.keys()].sort((a, b) => a - b)) {
      const list = rowsMap.get(rid).sort((a, b) => a.gateDepth - b.gateDepth || a.name.localeCompare(b.name));
      const row = rowById.get(rid);
      // label carries the class + size + its leading role; full tags in the tip
      const tags = row?.tags ?? [];
      const label = `${row?.name ?? `row ${rid}`}${tags.length ? '  ·  ' + tags.slice(0, 2).join(' / ') : ''}`;
      const labelTip = `${row?.name ?? ''}${tags.length ? '\n' + tags.join(' · ') : ''}`;

      // lay this row's tiles out first so we know how wide it is
      const tiles = [];
      const perLine = Math.max(1, Math.floor((G.rowsMaxW - G.packGapX) / (G.tileW + G.tileGapX)));
      const lines = Math.ceil(list.length / perLine);
      for (let i = 0; i < list.length; i++) {
        const col = i % perLine, ln = Math.floor(i / perLine);
        tiles.push({ ship: list[i], x: col * (G.tileW + G.tileGapX), y: ln * (G.tileH + G.tileGapY) });
      }
      const tilesW = Math.min(list.length, perLine) * (G.tileW + G.tileGapX) - G.tileGapX;
      const tilesH = lines * G.tileH + (lines - 1) * G.tileGapY;
      const labelW = Math.max(G.minRowLabel, textWidth(label) + 10);
      const rowW = Math.max(tilesW, labelW);

      if (packX + rowW > rowsX + G.rowsMaxW && packX > rowsX) {
        packX = rowsX;
        lineY += lineH + G.rowsGap;
        lineH = 0;
      }
      const rowY = lineY + G.rowLabelH;
      for (const t of tiles) { t.x += packX; t.y += rowY; }
      const rowH = G.rowLabelH + tilesH;
      rows.push({ id: rid, label, labelTip, tags, x: packX, y: lineY, tiles, h: rowH });
      packX += rowW + G.packGapX;
      lineH = Math.max(lineH, rowH);
    }
    const rowsH = lineY + lineH - (y + G.bandHead + G.padTop);

    const bandH = G.bandHead + G.padTop + rowsH + G.padBottom;
    bands.push({ lane, y, h: bandH, rows, rowsH, ships: laneShips.length });
    y += bandH + G.bandPad;
  }

  return { bands, width: G.rowsMaxW + G.padX * 2, height: y + 10 };
}

/* ------------------------------------------------------------------ render */

const world = $('world');

function render() {
  const t0 = DEBUG ? performance.now() : 0;
  syncMasteryChip();               // may drop the mastery filter if levels went away
  const hadTileFocus = !!(document.activeElement?.dataset?.key?.startsWith('s'));
  layout = computeLayout();
  world.textContent = '';
  shipWorld.clear();
  tileNodes.length = 0;
  tileById.clear();
  bandNodes.length = 0;
  bandByLane.clear();
  litKey = '\u0000';              // fresh nodes carry no .lit, so force a repaint

  const visible = visibleShips();
  if (!visible.length) {
    $('empty').hidden = false;
    renderStatus();
    return;
  }
  $('empty').hidden = true;

  for (const band of layout.bands) {
    /* ---- band frame ---- */
    const g = svgEl('g', { class: `band${band.collapsed ? ' collapsed' : ''}`, 'data-lane': band.lane.id }, world);
    bandNodes.push(g);
    bandByLane.set(band.lane.id, g);
    const bandW = layout.width - G.padX;
    svgEl('rect', { class: 'band-bg', x: 0, y: band.y, width: bandW, height: band.h, rx: 6 }, g);
    // header strip: rounded on top only, tinted with the faction colour
    const hd = `M 0 ${band.y + 6} A 6 6 0 0 1 6 ${band.y} H ${bandW - 6} A 6 6 0 0 1 ${bandW} ${band.y + 6} V ${band.y + G.bandHead} H 0 Z`;
    svgEl('path', { class: 'band-head', d: hd, fill: band.lane.color, 'fill-opacity': .16 }, g);
    svgEl('rect', { class: 'band-head-line', x: 0, y: band.y, width: 3, height: G.bandHead, fill: band.lane.color }, g);
    svgEl('text', { class: 'band-title', x: G.padX, y: band.y + 19, text: band.lane.short }, g);
    svgEl('text', { class: 'band-count', x: G.padX, y: band.y + 34, text: `${band.ships} hulls · ${band.lane.name}` }, g);
    const headHit = svgEl('rect', { x: 0, y: band.y, width: bandW, height: G.bandHead, fill: 'transparent', style: 'cursor:pointer' }, g);
    svgEl('title', { text: `click for the ${band.lane.short} skill tree` }, headHit);
    headHit.addEventListener('click', ev => { ev.stopPropagation(); if (!clickSuppressed()) openSkills(band.lane.id); });

    // collapse control: folds the lane down to its header
    const isCollapsed = state.collapsed.has(band.lane.id);
    const chev = svgEl('g', {
      class: 'lane-toggle', transform: `translate(${bandW - 28} ${band.y + 10})`, style: 'cursor:pointer',
      role: 'button', tabindex: '0',
      'aria-label': `${isCollapsed ? 'expand' : 'collapse'} the ${band.lane.short} section`,
    }, g);
    svgEl('rect', { class: 'lane-toggle-box', width: 20, height: 20, rx: 4 }, chev);
    svgEl('text', {
      class: 'lane-toggle-glyph', x: 10, y: 14.5, 'text-anchor': 'middle',
      text: isCollapsed ? '\u25B8' : '\u25BE',
    }, chev);
    svgEl('title', { text: `${isCollapsed ? 'expand' : 'collapse'} the ${band.lane.short} section` }, chev);
    chev.addEventListener('click', ev => { ev.stopPropagation(); if (!clickSuppressed()) toggleCollapsed(band.lane.id); });
    chev.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.stopPropagation(); ev.preventDefault(); toggleCollapsed(band.lane.id); }
    });

    if (isCollapsed) {
      svgEl('text', {
        class: 'band-collapsed-note', x: bandW - 44, y: band.y + 24, 'text-anchor': 'end',
        text: `${band.ships} hulls hidden`,
      }, g);
      continue;                                    // no rows to draw
    }

    /* ---- hull-class rows ---- */
    for (const row of band.rows) {
      const lbl = svgEl('text', { class: 'row-label', x: row.x, y: row.y + 10, text: row.label }, g);
      if (row.labelTip) svgEl('title', { text: row.labelTip.trim() }, lbl);
      for (const t of row.tiles) {
        const s = t.ship;
        shipWorld.set(s.id, { x: t.x + G.tileW / 2, y: t.y + G.tileH / 2 });
        const tg = svgEl('g', {
          class: `${shipClass(s)} ${shipStatus(s)}${state.selected === s.id ? ' selected' : ''}`,
          'data-key': `s${s.id}`, transform: `translate(${t.x} ${t.y})`,
          role: 'button', 'aria-label': tileAriaLabel(s),
          tabindex: s.id === focusTileId ? 0 : -1,
        }, g);
        tileNodes.push(tg);
        tileById.set(s.id, tg);
        svgEl('rect', { class: 'tile-box', width: G.tileW, height: G.tileH, rx: 4 }, tg);
        svgEl('rect', { class: 'tile-accent', x: 0, y: 0, width: 5, height: G.tileH, rx: 2.5 }, tg);
        // selection / hover marker: a bar under the tile rather than a box around it
        svgEl('rect', { class: 'tile-mark', x: 4, y: G.tileH + 3, width: G.tileW - 8, height: 3, rx: 1.5 }, tg);
        svgEl('rect', { class: 'tile-plate', x: 6, y: 2, width: 54, height: 54, rx: 3 }, tg);
        const nameEls = wrapName(s.name).map((line, i) =>
          svgEl('text', { class: 'tile-name', x: G.tileW / 2, y: 66 + i * 9, 'text-anchor': 'middle', text: line }));
        const img = svgEl('image', {
          class: 'tile-img', x: 6, y: 2, width: 54, height: 54,
          preserveAspectRatio: 'xMidYMid meet',
        }, tg);
        img.setAttribute('href', `${IMG}/${s.id}/icon?size=64`);
        img.addEventListener('error', () => {
          img.remove();
          tg.insertBefore(svgEl('text', {
            x: G.tileW / 2, y: 36, 'text-anchor': 'middle', fill: '#8b93a7',
            'font-size': 14, 'font-weight': 700, text: s.name.slice(0, 2).toUpperCase(),
          }), nameEls[0]);
        });
        for (const n of nameEls) tg.appendChild(n);
        // no native <title> on the tile itself: it would fight the hover card
        if (!s.alpha) {
          const why = s.omegaWhy;
          svgEl('rect', { class: 'omega-pill', x: G.tileW - 17, y: 4, width: 13, height: 13, rx: 3 }, tg);
          const badge = svgEl('text', { class: 'omega-badge', x: G.tileW - 10.5, y: 14, 'text-anchor': 'middle', text: '\u03A9' }, tg);
          svgEl('title', {
            text: why
              ? `Omega clone only — needs ${why.skill} ${roman(why.level)}`
                + (why.cap ? ` (Alpha caps it at ${roman(why.cap)})` : ' (not trainable by Alpha)')
              : 'Omega clone only',
          }, badge);
        }
        tg.addEventListener('click', ev => { ev.stopPropagation(); if (!clickSuppressed()) selectShip(s.id, false); });
        tg.addEventListener('mousemove', ev => { setHover(`s${s.id}`); scheduleTip(s, ev); });
        tg.addEventListener('mouseleave', () => { setHover(null); clearTip(); });
      }
    }

    band.el = g;
  }

  // exactly one tile carries the roving tabindex; keep keyboard focus across a
  // rebuild (filters, level changes) so it does not fall back to the body
  if (tileNodes.length) {
    const node = (focusTileId != null && tileById.get(focusTileId)) || tileNodes[0];
    node.setAttribute('tabindex', '0');
    focusTileId = Number(node.dataset.key.slice(1));
    if (hadTileFocus) node.focus({ preventScroll: true });
  }

  markFocusedBand(focusedLaneId());
  applyHighlight();
  renderStatus();
  debug(`render: ${visible.length} tiles, ${(performance.now() - t0).toFixed(1)}ms`);
}

/** Fold / unfold a faction section (kept in localStorage). */
function toggleCollapsed(id) {
  if (state.collapsed.has(id)) state.collapsed.delete(id);
  else state.collapsed.add(id);
  store.set('st.collapsed', [...state.collapsed]);
  render();
  syncKey();
  applyView();
}

/* --------------------------------------------------------------- highlight */

function setHover(key) {
  if (state.hover === key) return;
  state.hover = key;
  applyHighlight();
}

function litSetFor(key) {
  if (!key) return null;
  const lit = new Set([key]);
  if (key.startsWith('k')) {
    // a skill lights every hull that requires it (and hulls of its descendants)
    const id = Number(key.slice(1));
    const ids = new Set([id, ...descendantsOf(id)]);
    for (const s of DATA.ships) {
      if (state.lanes.has(s.lane) && s.prereqs.some(p => ids.has(p.skill))) lit.add(`s${s.id}`);
    }
  }
  return lit;
}

let litKey = '\u0000';              // the set currently painted, to skip no-op repaints
function applyHighlight() {
  const key = state.hover || (state.selected ? `s${state.selected}` : null);
  if (key === litKey) return;
  litKey = key;
  const lit = key ? litSetFor(key) : null;
  for (const n of tileNodes) {
    n.classList.toggle('lit', !!lit && lit.has(n.dataset.key));
  }
}

/* ------------------------------------------------------------- interaction */

/** Recolour just the tiles whose requirements involve `skillId`.
 *  Falls back to a full render only when the tile set itself can change - the
 *  flyable / can't-fly filters select on levels, and the unknown/fly/partial/no
 *  colours all depend on whether we know any levels at all. */
function paintSkillTiles(skillId, knownBefore) {
  if (!levelsKnown() || !knownBefore || state.flyableOnly || state.noFlyOnly || state.noMasteryV) {
    render();                                    // tile membership or every colour changes
    return;
  }
  for (const shipId of shipsBySkill.get(skillId) ?? []) {
    const node = tileById.get(shipId);          // absent = filtered out of view
    if (!node) continue;
    node.classList.remove('fly', 'partial', 'no', 'unknown');
    node.classList.add(shipStatus(shipById.get(shipId)));
  }
}

function cycleSkill(id) {
  const cur = yourLevel(id);
  const knownBefore = levelsKnown();
  state.levels[id] = cur >= 5 ? 0 : cur + 1;
  store.set('st.levels', state.levels);
  paintSkillTiles(id, knownBefore);             // hull tiles recolour
  renderStatus();                               // the "flyable at your levels" tally
  renderSkillsPanel();                          // keep the level chips honest
  if (state.selected) renderPanel(shipById.get(state.selected));
}

function selectShip(id, pan) {
  state.selected = id;
  const ship = shipById.get(id);
  ensureDetails().catch(() => {});        // the panel needs bonuses/mastery
  const asCompare = takeCompare(id);
  const key = `s${id}`;
  for (const n of tileNodes) n.classList.toggle('selected', n.dataset.key === key);
  if (asCompare) {
    // B is the hull just clicked; the skills panel stays on the lane tree
    renderPanel(ship);
    syncURL();
    return;
  }
  applyHighlight();
  renderPanel(ship);                       // open the info panel first: it narrows the stage
  // the skills panel follows the hull: show its faction's tree, mark its needs,
  // and bring its gating skill into view
  if (ship && state.showSkills) {
    state.skillLane = ship.lane;
    state.focusLocked = true;              // hold this lane until the user scrolls
    renderSkillsPanel();
    scrollSkillIntoView(ship.gate);
  }
  if (pan && shipWorld.has(id)) {          // stage, so centre afterwards
    const p = shipWorld.get(id);
    focusWorld(p.x, p.y);
  }
  // otherwise renderPanel() has already started the slide, which re-centres for us
  syncURL();
}

/** Drop the current hull selection: hides the info panel, clears the selection
 *  bar and puts the skills panel back on the whole faction tree. */
function clearSelection() {
  if (state.selected == null) return;
  state.selected = null;
  for (const n of tileNodes) n.classList.remove('selected');
  applyHighlight();
  renderPanel(null);
  renderSkillsPanel();
  syncFocusedLane();          // hand the left panel back to whatever you scroll to
  syncURL();
}

/** Centre the view vertically on a world point (horizontal is locked). */
function focusWorld(x, y, minK = 0.75) {
  view.k = Math.min(maxK(), Math.max(view.k, minK));   // never zoom further out
  view.y = stageBox.h / 2 - y * view.k;
  applyView();
}

/* ------------------------------------------------------- skillbook cost */

/** Price the skillbooks for a hull: the ones you still need, and all of them.
 *  A skill and its skillbook are the same type in modern EVE, so the skill id
 *  is the market type id. */
async function fillBookCost(boxId, neededIds, allIds) {
  const box = $(boxId);
  if (!box) return;
  const ids = [...new Set([...allIds, ...neededIds])];
  const prices = await loadPrices(ids);
  if ($(boxId) !== box) return;                     // panel moved on
  const byId = new Map(ids.map((id, i) => [id, prices[i]]));
  const sum = list => list.reduce((a, id) => a + (byId.get(id)?.sell ?? byId.get(id)?.buy ?? 0), 0);
  const priced = list => list.filter(id => byId.get(id)).length;
  const needCost = sum(neededIds);
  const allCost = sum(allIds);
  if (!allCost && !needCost) {
    box.innerHTML = `<div class="stat"><span>skillbooks</span><b class="dim">price unavailable offline</b></div>`;
    return;
  }
  box.innerHTML =
    (neededIds.length
      ? `<div class="stat"><span>to buy (${neededIds.length} book${neededIds.length > 1 ? 's' : ''})</span><b class="isk">${isk(needCost)} ISK</b></div>`
      : '')
    + `<div class="stat"><span>all requirements (${allIds.length})</span><b>${isk(allCost)} ISK</b></div>`
    + (priced(ids) < ids.length
      ? `<div class="stat"><span>unpriced</span><b class="dim">${ids.length - priced(ids)} of ${ids.length}</b></div>`
      : '');
}

/* ------------------------------------------------------------ formatting */

const num = n => (n >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
const isk = n => {
  if (!n && n !== 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
};
const secs = ms => `${num(ms / 1000)} s`;
const tonnes = kg => `${num(kg / 1000)} t`;

/** Grid of hull stats, grouped the way the fitting window thinks. */
function statGrid(ship) {
  const st = ship.stats ?? {};
  const row = (label, value) => (value == null ? '' : `<div class="stat"><span>${label}</span><b>${value}</b></div>`);
  const slots = [st.high, st.med, st.low].every(v => v == null) ? null : `${st.high ?? 0} / ${st.med ?? 0} / ${st.low ?? 0}`;
  const weapons = [st.turrets, st.launchers].some(v => v) ? `${st.turrets ?? 0} turret${st.turrets === 1 ? '' : 's'} · ${st.launchers ?? 0} launcher${st.launchers === 1 ? '' : 's'}` : null;
  const drones = [st.droneBay, st.droneBandwidth].some(v => v) ? `${num(st.droneBay ?? 0)} m³ · ${num(st.droneBandwidth ?? 0)} Mbit/s` : null;
  const cap = st.cap == null ? null : `${num(st.cap)} GJ${st.capRecharge ? ` · ${secs(st.capRecharge)}` : ''}`;

  const groups = [
    ['fitting', [
      row('high / med / low', slots),
      row('rig slots', st.rig == null ? null : num(st.rig)),
      row('cpu / powergrid', (st.cpu == null && st.pg == null) ? null : `${num(st.cpu ?? 0)} tf · ${num(st.pg ?? 0)} MW`),
      row('hardpoints', weapons),
    ]],
    ['navigation', [
      row('max velocity', st.velocity == null ? null : `${num(st.velocity)} m/s`),
      row('warp speed', st.warp == null ? null : `${num(st.warp)} AU/s`),
      row('agility', st.agility == null ? null : num(st.agility)),
      row('signature radius', st.sig == null ? null : `${num(st.sig)} m`),
      row('scan resolution', st.scanRes == null ? null : `${num(st.scanRes)} mm`),
    ]],
    ['tank', [
      row('shield', st.shield == null ? null : num(st.shield)),
      row('armor', st.armor == null ? null : num(st.armor)),
      row('structure', st.hull == null ? null : num(st.hull)),
      row('capacitor', cap),
    ]],
    ['hold', [
      row('cargo capacity', ship.capacity == null ? null : `${num(ship.capacity)} m³`),
      row('drone bay / bandwidth', drones),
      row('mass', ship.mass ? tonnes(ship.mass) : null),
      row('volume', ship.volume ? `${num(ship.volume)} m³` : null),
    ]],
  ];
  return groups
    .map(([title, rows]) => {
      const body = rows.filter(Boolean).join('');
      return body ? `<div class="sect">${title}</div><div class="statgrid">${body}</div>` : '';
    })
    .join('');
}

/* ---------------------------------------------------------------- prices */

const PRICE_REGION = 10000002;                     // Jita
const priceCache = new Map();                      // typeID -> Promise<price|null>

const priceFrom = row => {
  if (!row) return null;
  const sell = Number(row.sell?.percentile || row.sell?.min || 0) || null;
  const buy = Number(row.buy?.percentile || row.buy?.max || 0) || null;
  if (!sell && !buy) return null;
  return { sell, buy, sellVolume: Number(row.sell?.volume || 0), buyVolume: Number(row.buy?.volume || 0) };
};

/** Prices for many types in one request (Fuzzwork accepts a comma list). */
async function loadPrices(ids) {
  const missing = [...new Set(ids)].filter(id => !priceCache.has(id));
  if (missing.length) {
    const batch = (async () => {
      try {
        const r = await fetch(`https://market.fuzzwork.co.uk/aggregates/?region=${PRICE_REGION}&types=${missing.join(',')}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch {
        return null;                                // offline / rate limited
      }
    })();
    for (const id of missing) priceCache.set(id, batch.then(j => priceFrom(j?.[String(id)])));
  }
  return Promise.all(ids.map(id => priceCache.get(id)));
}

function fetchPrice(typeId) {
  if (!priceCache.has(typeId)) loadPrices([typeId]);
  return priceCache.get(typeId);
}

async function fillPrice(typeId) {
  const box = $('priceBox');
  if (!box) return;
  const price = await fetchPrice(typeId);
  if ($('priceBox') !== box) return;               // panel moved on while we waited
  box.innerHTML = price
    ? `<div class="stat"><span>sell (Jita)</span><b class="isk">${isk(price.sell)} ISK</b></div>
       <div class="stat"><span>buy (Jita)</span><b>${isk(price.buy)} ISK</b></div>
       <div class="stat"><span>on market</span><b>${num(price.sellVolume)} sell · ${num(price.buyVolume)} buy</b></div>`
    : `<div class="stat"><span>price</span><b class="dim">unavailable offline</b></div>`;
}

/* ------------------------------------------------------------ EVE SSO auth */

function renderAuth() {
  const box = $('authBox');
  if (!box) return;
  const c = state.esiChar;
  if (!c) {
    box.innerHTML = `<button id="ssoLogin" class="chip auth-btn" title="Sign in with EVE to use your real skills">
      <span class="dot"></span>login</button>`;
    $('ssoLogin').onclick = () => EVE_SSO.login();
    return;
  }
  box.innerHTML = `<div class="pilot" title="Signed in as ${esc(c.name)} — using their trained skills">
      <img src="${EVE_SSO.portraitUrl(c.id, 64)}" alt="${esc(c.name)}">
      <span class="pilot-name">${esc(c.name)}</span>
      <button id="ssoSync" class="pilot-btn" title="Re-read skills from EVE">&#8635;</button>
      <button id="ssoOut" class="pilot-btn" title="Sign out">&#10005;</button>
    </div>`;
  $('ssoOut').onclick = () => { EVE_SSO.logout(); setEsiCharacter(null); };
  $('ssoSync').onclick = () => applyEsiSkills(true);
}

/** Sign in/out bookkeeping: swap the level source and refresh the panels. */
function setEsiCharacter(c) {
  state.esiChar = c;
  if (!c) {
    state.esiQueue = [];
    state.levels = store.get('st.levels', {});     // back to manual levels
  }
  renderAuth();
  render();
  renderSkillsPanel();
  if (state.selected) renderPanel(DATA.ships.find(s => s.id === state.selected));
}

/** Pull the character's trained levels and drive the whole tree from them. */
async function applyEsiSkills(announce) {
  try {
    // the queue is only fetched while something actually shows it
    const [levels, queue] = await Promise.all([
      EVE_SSO.fetchSkills(),
      SHOW_TRAINING_QUEUE ? EVE_SSO.fetchQueue() : Promise.resolve([]),
    ]);
    state.levels = Object.fromEntries([...levels.entries()].map(([id, lvl]) => [id, lvl]));
    state.esiQueue = queue;
    renderAuth();
    render();
    renderSkillsPanel();
    if (state.selected) renderPanel(DATA.ships.find(s => s.id === state.selected));
    if (announce) setBuildInfo(`skills synced — ${levels.size} trained`);
  } catch (e) {
    if (/not signed in|session expired/.test(e.message)) setEsiCharacter(null);
    else setBuildInfo(`skill sync failed: ${e.message}`);
  }
}

/** Faction mark for a panel footer: the real logo if we have one, else the
 *  house emblem (colour + initials). */
function factionLogoHTML(laneId, size = 64) {
  const lane = laneById.get(laneId);
  if (!lane) return '';
  if (factionLogos && factionLogos.has(laneId)) {
    return `<img src="img/factions/${laneId}.png" alt="" style="width:${size}px;height:${size}px">`;
  }
  return `<span class="panel-emblem" style="background:${lane.color}">${esc(initials(lane.short))}</span>`;
}

/** Deep link that pre-fills the Blueprint Visualizer with this hull's blueprint.
 *  BV reads `#bv=` + base64(JSON) and expects the blueprint *name*. */
function bpVisualizerHref(bpName) {
  const payload = { bp: bpName, runs: 1 };
  let hash = '';
  try {
    hash = btoa(JSON.stringify(payload));
  } catch {
    hash = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }
  return `https://www.rustybot.co.uk/blueprint-visualizer/#bv=${hash}`;
}

/* --------------------------------------------------------------- ESI queue */

/** The pilot's queued skills, soonest first (ESI puts the training one at 0). */
const trainingNow = () => (state.esiQueue ?? []).find(q => q.queue_position === 0) ?? null;

/** Queue block for the focused hull: what they are training, and what it buys. */
function queueHTML(need) {
  const q = state.esiQueue ?? [];
  if (!q.length) return '';
  const rows = q.slice(0, 4).map((item, i) => {
    const sk = skillById.get(item.skill_id);
    const wanted = need.has(item.skill_id);
    return `<div class="skill-row queue${i === 0 ? ' now' : ''}${wanted ? ' needed' : ''}" data-skill="${item.skill_id}">
      <span class="lvl locked">${i === 0 ? '&#9654;' : roman(i + 1)}</span>
      <span class="nm">${esc(sk?.name ?? `skill ${item.skill_id}`)}<small>${
        i === 0 ? 'training now' : `queued ${i + 1}`} &rarr; ${roman(item.level)
      }${wanted ? ' &middot; needed for this hull' : ''}</small></span>
    </div>`;
  }).join('');
  return `<div class="sect">your training queue</div><div class="skill-tree">${rows}</div>`;
}

/* ------------------------------------------------------ hull details (lazy) */

/* Mastery profiles and ship bonuses live in a second file (details.json) that is
   fetched after first paint - together they are the bulk of the payload and are
   only needed once a hull is open. Until it lands, DETAILS is null and every
   helper below returns null/'', which is exactly what masteryHTML(), the tooltip
   and the Bonuses tab already treat as "nothing to show here". Nothing else
   needs to know about the split. */
let DETAILS = null;

const masteryProfile = ship =>
  (DETAILS && ship.mastery != null ? DETAILS.masteryProfiles?.[ship.mastery] : null);
const masterySkillName = id => DETAILS?.masterySkills?.[id] ?? skillById.get(id)?.name ?? `skill ${id}`;

/** { role: [line], ship: [{skill, lines}] } for a hull, or null before load. */
function bonusProfile(ship) {
  if (!DETAILS) return null;
  const idx = DETAILS.shipBonus?.[ship.id];
  if (!idx) return null;
  return {
    role: DETAILS.bonusRoleSets?.[idx[0]] ?? [],
    ship: DETAILS.bonusShipSets?.[idx[1]] ?? [],
  };
}

/** Fetch the lazy file, checking it belongs to the shiptree.json we loaded.
 *  Hulls reference profiles and bonus sets by position, so a stale details.json
 *  paired with a fresh shiptree.json would show the WRONG mastery levels and the
 *  WRONG bonuses rather than none - on a mismatch we bust the cache and ask
 *  again. */
async function loadDetails() {
  const want = DATA.meta.detailsHash;
  const url = `data/${DATA.meta.detailsFile || 'details.json'}`;
  let res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  let body = await res.json();
  if (want && body?.meta?.detailsHash !== want) {
    res = await fetch(`${url}?v=${want}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    body = await res.json();
  }
  if (want && body?.meta?.detailsHash !== want) {
    throw new Error('details data does not match this build');
  }
  return body;
}

/* details.json is fetched once, on demand - a hull being opened, the mastery
   filter, a bonus search, or an idle warm. The promise is cached so those
   triggers share one request. */
let detailsPromise = null;
function ensureDetails() {
  if (!detailsPromise) {
    detailsPromise = loadDetails()
      .then(body => {
        DETAILS = body;
        buildSearchIndex();                 // bonus text is searchable now
        syncMasteryChip();                  // mastery profiles just became usable
        if (state.noMasteryV) { render(); applyView(); }
        if (state.selected) renderPanel(shipById.get(state.selected));
        return body;
      })
      .catch(e => {
        debug('details not loaded:', e.message);
        if (state.noMasteryV) showError('mastery data failed to load', e.message);
        throw e;                            // callers decide whether it matters
      });
  }
  return detailsPromise;
}

/** Warm the lazy file when the browser is idle, without blocking first paint. */
function scheduleDetailsWarm() {
  const warm = () => ensureDetails().catch(() => {});
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 2500 });
  else setTimeout(warm, 300);
}

/* ---------------------------------------------------------- ship bonuses */

/* A bonus line is { v, u, t } from the SDE: value, unit symbol ('%', '+', 'x',
   'm'), text. Many lines carry no value at all - "Can fit a Doomsday module" -
   so the number is optional and never assumed. */
function bonusHTML(b) {
  let n = '';
  if (b.v != null) {
    const neg = b.v < 0;
    const mag = Math.abs(b.v);
    const body = Number.isInteger(mag) ? mag : +mag.toFixed(2);
    if (b.u === 'x') n = `${neg ? '&minus;' : ''}&times;${body}`;
    else n = `${neg ? '&minus;' : '+'}${body}${b.u && b.u !== '+' ? esc(b.u) : ''}`;
  }
  return `<div class="bonus-line">`
    + `${n ? `<span class="bn">${n}</span>` : '<span class="bn none"></span>'}`
    + `<span class="bt">${esc(b.t)}</span></div>`;
}

/** The Bonuses tab: what the hull does on its own, then what its skills add. */
function bonusesHTML(ship) {
  if (!DETAILS) return `<div class="hint">bonuses still loading&hellip;</div>`;
  const prof = bonusProfile(ship);
  const role = prof?.role ?? [];
  const groups = prof?.ship ?? [];
  if (!role.length && !groups.length) {
    return `<div class="hint">no bonuses recorded for ${esc(ship.name)} in the static data.</div>`;
  }
  const shipBlocks = groups.map(g => {
    const raw = g.skill != null ? (skillById.get(g.skill)?.name ?? masterySkillName(g.skill)) : null;
    const known = raw && !/^skill \d+$/.test(raw);
    return `<div class="bonus-group">`
      + (known ? `<div class="bonus-src"><b>${esc(raw)}</b><small>per level</small></div>` : '')
      + g.lines.map(bonusHTML).join('')
      + `</div>`;
  }).join('');
  const skills = new Set(groups.map(g => g.skill).filter(s => s != null));
  // Both headings are the SDE's own array names. `roleBonuses` is NOT reliably
  // "what the hull does without any skill" - the Ibis keeps its Caldari Frigate
  // turret/missile/ECM bonuses in there - so we do not editorialise either one.
  return `
    ${role.length ? `<div class="sect">role bonuses (${role.length})</div>
      <div class="bonus-list">${role.map(bonusHTML).join('')}</div>` : ''}
    ${groups.length ? `<div class="sect">ship bonuses &mdash; ${groups.reduce((a, g) => a + g.lines.length, 0)} from ${
      skills.size > 1 ? `${skills.size} skills` : 'one skill'}</div>${shipBlocks}` : ''}`;
}

function masteryLevel(ship) {
  const prof = masteryProfile(ship);
  if (!prof) return null;
  for (let L = 5; L >= 1; L--) {
    if (prof[L - 1].every(([id, lvl]) => yourLevel(id) >= lvl)) return L;
  }
  return 0;
}

/** The "not mastery V" filter can only ask a meaningful question once we know the
 *  pilot's levels *and* the lazily fetched mastery profiles have landed. */
const masteryReady = () => levelsKnown() && !!DETAILS;

/** True when the hull has a mastery profile and the pilot has not met all of V. */
function missingMasteryV(ship) {
  const lvl = masteryLevel(ship);
  return lvl != null && lvl < 5;
}

/** Skills still missing for a given mastery level. */
function masteryGap(ship, level) {
  const prof = masteryProfile(ship);
  if (!prof || level < 1 || level > 5) return [];
  return prof[level - 1]
    .filter(([id, lvl]) => yourLevel(id) < lvl)
    .map(([id, lvl]) => ({ id, name: masterySkillName(id), need: lvl, you: yourLevel(id) }));
}

function masteryHTML(ship) {
  if (!levelsKnown() || !masteryProfile(ship)) return '';
  const lvl = masteryLevel(ship);
  const next = Math.min(5, lvl + 1);
  const gap = lvl >= 5 ? [] : masteryGap(ship, next);
  const badge = lvl === 0 ? '—' : roman(lvl);
  const text = lvl >= 5
    ? 'complete — every grade met.'
    : `${gap.length} skill${gap.length === 1 ? '' : 's'} from <b>${roman(next)}</b>`
      + (gap.length ? `<small>${gap.slice(0, 4).map(g => `${esc(g.name)} ${roman(g.need)}`).join(', ')}${gap.length > 4 ? `, +${gap.length - 4} more` : ''}</small>` : '');
  return `<div class="sect">mastery</div>
    <div class="mastery"><span class="m-badge">${badge}</span><span class="m-text">${text}</span></div>`;
}

/* ---------------------------------------------------------------- tooltip */

let tipTimer = null, tipShipId = null, tipSize = { w: 0, h: 0 };

function clearTip() {
  clearTimeout(tipTimer);
  tipTimer = null;
  tipShipId = null;
  $('tip').classList.add('hidden');
}

/** Hovering a hull for 2s pops a card with its picture and the basics. */
function scheduleTip(ship, ev) {
  ensureDetails().catch(() => {});         // so the mastery line can show in time
  if (tipShipId === ship.id) { positionTip(ev); return; }   // already pending/shown
  clearTip();
  tipShipId = ship.id;
  tipTimer = setTimeout(() => showTip(ship, ev), 2000);
}

function showTip(ship, ev) {
  const tip = $('tip');
  const lane = laneById.get(ship.lane);
  const row = rowById.get(ship.row);
  const lvl = masteryLevel(ship);
  const status = shipStatus(ship);
  const known = levelsKnown();
  tip.innerHTML = `
    <img src="${IMG}/${ship.id}/render?size=128" alt="">
    <div class="tip-body">
      <div class="tip-name">${esc(ship.name)}</div>
      <div class="tip-sub">${esc(lane?.short ?? '')} &middot; ${esc(row?.name ?? '')}${ship.tier ? ` &middot; ${esc(ship.tier)}` : ''}</div>
      <div class="tip-tags">${(ship.tags ?? []).slice(0, 4).map(t => `<span>${esc(t)}</span>`).join('')}</div>
      ${known && lvl != null ? `<div class="tip-line">mastery ${lvl === 0 ? '—' : roman(lvl)}</div>` : ''}
      ${known ? `<div class="tip-line ${status}">${status === 'fly' ? 'you can fly it' : status === 'partial' ? 'part trained' : 'not trained'}</div>` : ''}
      ${!ship.alpha ? '<div class="tip-line omega">\u03A9 omega only</div>' : ''}
      <div class="tip-needs">needs: ${ship.prereqs.map(p => `${esc(p.name)} ${roman(p.level)}`).join(', ') || '—'}</div>
    </div>`;
  tip.classList.remove('hidden');
  // measure once here: positionTip runs on every mousemove, and reading
  // offsetWidth there forces a synchronous layout against the styles just written
  tipSize = { w: tip.offsetWidth, h: tip.offsetHeight };
  positionTip(ev);
}

function positionTip(ev) {
  const tip = $('tip');
  if (tip.classList.contains('hidden') || !ev) return;
  const st = $('stage').getBoundingClientRect();
  const x = Math.max(8, Math.min(ev.clientX - st.left + 18, st.width - tipSize.w - 8));
  const y = Math.max(8, Math.min(ev.clientY - st.top + 18, st.height - tipSize.h - 8));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

/* ------------------------------------------------------------------- panel */

/* The right panel's panes. The chosen tab survives hull changes and reloads -
   you usually open a few ships in a row to compare the same thing. */
const PANEL_TABS = [
  { id: 'overview', label: 'overview', title: 'picture, description, mastery, price and base price' },
  { id: 'stats', label: 'stats', title: 'fitting, navigation, tank and hold' },
  { id: 'bonuses', label: 'bonuses', title: 'role bonuses and hull bonuses per skill' },
  { id: 'compare', label: 'compare', title: 'pin two hulls and diff them' },
];

function renderPanel(ship) {
  const panel = $('panel');
  const wasHidden = panel.classList.contains('hidden');
  if (!ship) {
    panel.classList.add('hidden');
    panel.inert = true;                              // keep hidden panes out of tab order
    setTimeout(() => { if (panel.classList.contains('hidden')) panel.innerHTML = ''; }, 300);
    if (!wasHidden) animateView();
    syncScrim();
    return;
  }
  panel.classList.remove('hidden');
  panel.inert = false;
  if (wasHidden) animateView();
  syncScrim();

  const lane = laneById.get(ship.lane);
  const row = rowById.get(ship.row);
  const gate = ship.gate ? skillById.get(ship.gate) : null;
  if (!PANEL_TABS.some(t => t.id === state.panelTab)) state.panelTab = 'overview';

  // Every pane is rendered up front and the tabs only toggle visibility, so
  // moving between them is free and the price fetch (which writes #priceBox) is
  // never restarted by a tab click.
  panel.innerHTML = `
    <div class="panel-head">
      <img class="head-img" src="${IMG}/${ship.id}/render?size=128" alt="${esc(ship.name)}">
      <div class="head-txt">
        <div class="kicker">${esc(lane?.short ?? '')} &middot; ${esc(row?.name ?? '')}</div>
        <h2>${esc(ship.name)}</h2>
        <div class="sub">${esc(ship.tier || 'hull')} &middot; ${ship.volume.toLocaleString()} m&sup3;${gate ? ` &middot; gated by ${esc(gate.name)}` : ''}</div>
      </div>
      <button id="panelCompare" data-compare title="pin this hull, then pick another to compare"${state.awaitCompare ? ' class="armed"' : ''}>&#8646;</button>
      <button id="panelClose" title="close">&#10005;</button>
    </div>
    <div class="panel-tabs" role="tablist">
      ${PANEL_TABS.map(t => `<button class="panel-tab${t.id === state.panelTab ? ' on' : ''}" role="tab"
        data-tab="${t.id}" aria-selected="${t.id === state.panelTab}" title="${esc(t.title)}">${esc(t.label)}</button>`).join('')}
    </div>
    <div class="panel-body">
      <div class="pane" data-pane="overview">
      <div class="chips-row">
        <span class="tag tier ${shipClass(ship).split(' ')[1] || ''}">${esc(ship.tier || 'hull')}</span>
        <span class="tag ${ship.alpha ? 'alpha' : 'omega'}" title="${ship.alpha ? 'flyable on an Alpha clone' : 'needs an Omega clone'}">${ship.alpha ? 'Alpha' : '\u03A9 Omega only'}</span>
        ${(ship.tags ?? []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>
      ${loreHTML(ship)}
      ${masteryHTML(ship)}
      <div class="sect">estimated market price</div>
      <div class="statgrid" id="priceBox"><div class="stat"><span>price</span><b class="dim">fetching…</b></div></div>
      ${ship.basePrice ? `<div class="stat" title="CCP's reference price for this hull - not a market price, and unrelated to the Jita figures above."><span>base price <i>CCP</i></span><b class="dim">${isk(ship.basePrice)} ISK</b></div>` : ''}
      <div class="note-dim">Skills, levels and training time for this hull are in the panel on the left.</div>
      </div>
      <div class="pane" data-pane="stats" hidden>${statGrid(ship)}</div>
      <div class="pane" data-pane="bonuses" hidden>${bonusesHTML(ship)}</div>
      <div class="pane" data-pane="compare" hidden>${
        compareHTML(state.compare != null ? shipById.get(state.compare) : null, ship)
      }</div>
    </div>
    <div class="panel-foot">
      <div class="links">
        <a href="https://zkillboard.com/ship/${ship.id}/" target="_blank" rel="noopener">zKill</a>
        <a href="https://www.rustybot.co.uk/market/?type=${ship.id}&region=${PRICE_REGION}" target="_blank" rel="noopener" title="RustyBot market — Jita">market</a>
        ${ship.bp ? `<a href="${bpVisualizerHref(ship.bp)}" target="_blank" rel="noopener" title="Open ${esc(ship.bp)} in the Blueprint Visualizer">blueprint \u2197</a>` : ''}
      </div>
      <div class="panel-logo">${factionLogoHTML(ship.lane)}</div>
    </div>`;

  fillPrice(ship.id);
  syncPanelTabs();

  $('panelClose').onclick = () => { clearSelection(); };
  panel.querySelector('[data-lore]')?.addEventListener('click', () => {
    state.loreOpen = !state.loreOpen;
    renderPanel(ship);
  });
  panel.querySelector('[data-compare]')?.addEventListener('click', () => startCompare());
  panel.querySelector('[data-compare-clear]')?.addEventListener('click', () => {
    state.compare = null;
    state.awaitCompare = false;
    renderPanel(shipById.get(state.selected));
  });
  panel.querySelectorAll('.panel-tab').forEach(el => {
    el.onclick = () => {
      if (state.panelTab === el.dataset.tab) return;
      state.panelTab = el.dataset.tab;
      store.set('st.panelTab', state.panelTab);
      syncPanelTabs();
    };
  });
  panel.querySelectorAll('.req .lvl').forEach(el => {
    el.onclick = () => { cycleSkill(Number(el.dataset.skill)); };
  });
}

/* ---------------------------------------------------------------- compare */

/* Which way is "better" for each stat. Most things reward more; mass, signature
   radius, agility and the cpu budget are costs, so those rows are marked 'down'.
   Anything without a dir is shown but never judged. */
const CMP_ROWS = [
  ['identity', [
    ['tier', s => s.tier || '—'],
    ['class', s => rowById.get(s.row)?.name ?? '—'],
    ['faction', s => laneById.get(s.lane)?.short ?? '—'],
    ['clone state', s => (s.alpha ? 'Alpha' : 'Ω Omega')],
    ['volume', s => `${num(s.volume)} m³`, 'up'],
    ['mass', s => tonnes(s.mass), 'down'],
  ]],
  ['fitting', [
    ['high / med / low', s => slotLine(s)],
    ['rig slots', s => s.stats?.rig ?? '—', 'up'],
    ['cpu / powergrid', s => (s.stats?.cpu == null && s.stats?.pg == null ? '—' : `${num(s.stats?.cpu ?? 0)} tf · ${num(s.stats?.pg ?? 0)} MW`), 'down'],
    ['hardpoints', s => hardpointLine(s)],
  ]],
  ['navigation', [
    ['max velocity', s => stat(s, 'velocity', ' m/s'), 'up'],
    ['warp speed', s => stat(s, 'warp', ' AU/s'), 'up'],
    ['agility', s => stat(s, 'agility', ''), 'down'],
    ['signature radius', s => stat(s, 'sig', ' m'), 'down'],
    ['scan resolution', s => stat(s, 'scanRes', ' mm'), 'up'],
  ]],
  ['tank', [
    ['shield', s => stat(s, 'shield', ''), 'up'],
    ['armor', s => stat(s, 'armor', ''), 'up'],
    ['structure', s => stat(s, 'hull', ''), 'up'],
    ['capacitor', s => (s.stats?.cap == null ? '—' : `${num(s.stats.cap)} GJ`), 'up'],
  ]],
  ['hold', [
    ['cargo capacity', s => `${num(s.capacity)} m³`, 'up'],
    ['drone bay / bandwidth', s => droneLine(s)],
    ['mass', s => tonnes(s.mass), 'down'],
  ]],
];

const stat = (s, key, unit) => (s.stats?.[key] == null ? '—' : `${num(s.stats[key])}${unit}`);
const slotLine = s => {
  const st = s.stats ?? {};
  if ([st.high, st.med, st.low].every(v => v == null)) return '—';
  return `${st.high ?? 0} / ${st.med ?? 0} / ${st.low ?? 0}`;
};
const hardpointLine = s => {
  const st = s.stats ?? {};
  if (!st.turrets && !st.launchers) return '—';
  return `${st.turrets ?? 0} turret${st.turrets === 1 ? '' : 's'} · ${st.launchers ?? 0} launcher${st.launchers === 1 ? '' : 's'}`;
};
const droneLine = s => {
  const st = s.stats ?? {};
  if (!st.droneBay && !st.droneBandwidth) return '—';
  return `${num(st.droneBay ?? 0)} m³ · ${num(st.droneBandwidth ?? 0)} Mbit/s`;
};

/** Numeric value behind a row, for deciding which column wins. Volume and mass
 *  live on the ship record, not in stats[] - an earlier version only special-cased
 *  them for labels containing a space, so 'volume' and 'mass' silently never won.
 *  Composite rows (slots, hardpoints) deliberately return null: there is no single
 *  number to compare. */
function cmpValue(ship, key) {
  if (key === 'volume') return ship.volume;
  if (key === 'mass') return ship.mass;
  if (key === 'cpu / powergrid') return ship.stats?.cpu ?? null;
  const raw = ship.stats?.[key];
  return typeof raw === 'number' ? raw : null;
}

/** Pin the open hull and wait for the user to pick the other one. */
function startCompare() {
  if (state.selected == null) return;
  state.compare = state.selected;
  state.awaitCompare = true;
  setBuildInfo('compare armed — click another hull on the canvas');
  renderPanel(shipById.get(state.selected));
}

/** True when a hull click should be treated as picking the compare column.
 *  A stays pinned (the hull you armed on), the clicked hull becomes B. */
function takeCompare(id) {
  if (!state.awaitCompare || id == null || id === state.compare) return false;
  state.awaitCompare = false;
  state.panelTab = 'compare';
  store.set('st.panelTab', 'compare');
  setBuildInfo(`comparing against ${shipById.get(state.compare)?.name ?? ''}`);
  return true;
}

function compareHTML(a, b) {
  if (!a) return `<div class="hint">pin a hull with the &#8646; button, then pick a second hull to compare against.</div>`;
  if (!b) return `<div class="hint">pinned <b>${esc(a.name)}</b> — now click another hull on the canvas.</div>`;

  const head = (s, tag) => `<div class="cmp-head">
      <img src="${IMG}/${s.id}/render?size=128" alt="">
      <b>${tag}</b><span>${esc(s.name)}</span>
    </div>`;

  const groups = CMP_ROWS.map(([title, rows]) => {
    const body = rows.map(([label, get, dir]) => {
      const va = get(a);
      const vb = get(b);
      let better = '';
      if (dir) {
        const na = cmpValue(a, label);
        const nb = cmpValue(b, label);
        // `dir` is the only source of truth: 'down' means lower wins
        if (na != null && nb != null && na !== nb) better = (dir === 'down' ? na < nb : na > nb) ? 'a' : 'b';
      }
      return `<div class="cmp-row">
        <span class="ck">${esc(label)}</span>
        <span class="cv${better === 'a' ? ' win' : ''}">${esc(va)}</span>
        <span class="cv${better === 'b' ? ' win' : ''}">${esc(vb)}</span>
      </div>`;
    }).join('');
    return `<div class="sect">${esc(title)}</div>${body}`;
  }).join('');

  // skills: what each hull needs that the other does not
  const need = s => new Map(s.prereqs.map(p => [p.skill, p.level]));
  const na = need(a);
  const nb = need(b);
  const onlyA = [...na].filter(([k]) => !nb.has(k));
  const onlyB = [...nb].filter(([k]) => !na.has(k));
  const shared = [...na].filter(([k]) => nb.has(k));
  const skName = id => skillById.get(id)?.name ?? `skill ${id}`;
  const list = (entries, cls) => entries.length
    ? entries.map(([id, lvl]) => `<div class="cmp-sk ${cls}"><span>${esc(skName(id))}</span><b>${roman(lvl)}</b></div>`).join('')
    : `<div class="cmp-sk none">—</div>`;

  return `${head(a, 'A')}${head(b, 'B')}
    ${groups}
    <div class="sect">skills only A needs</div>${list(onlyA, 'a')}
    <div class="sect">skills only B needs</div>${list(onlyB, 'b')}
    <div class="sect">shared</div>${list(shared, '')}
    <button class="ghost cmp-clear" data-compare-clear>clear comparison</button>`;
}

/* ---------------------------------------------------------- hull flavour text */

/* Lore arrives in the lazy file. CCP's markup has already been reduced to
   <i>/</i> and newlines by the builder; we escape it again and re-allow only
   those two, so a malformed description cannot inject markup. */
function loreHTML(ship) {
  const raw = DETAILS?.descriptions?.[ship.id];
  if (!raw) return '';
  const safe = esc(raw).replace(/&lt;(\/?)i&gt;/g, '<$1i>');
  const paras = safe.split(/\n\n+/).filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  const long = raw.length > 240;
  return `<div class="sect">ship description</div>
    <div class="lore${long && !state.loreOpen ? ' clamped' : ''}">${paras}</div>
    ${long ? `<button class="lore-toggle" data-lore>${state.loreOpen ? 'less' : 'more'}</button>` : ''}`;
}

/** Show the active pane. Pure class/attribute work - no re-render, so the
 *  already-fetched price and the already-built bonuses are never recomputed. */
function syncPanelTabs() {
  const panel = $('panel');
  if (!panel) return;
  panel.querySelectorAll('.panel-tab').forEach(el => {
    const on = el.dataset.tab === state.panelTab;
    el.classList.toggle('on', on);
    el.setAttribute('aria-selected', String(on));
  });
  panel.querySelectorAll('.pane').forEach(p => {
    p.hidden = p.dataset.pane !== state.panelTab;
  });
}

/* ------------------------------------------------------------ skills panel */

/** Skill tree for a lane, or — when a hull is selected — just that hull's needs. */
function laneSkillTree(laneId, ship) {
  const ids = new Set();
  const stack = [];
  const push = id => { if (!ids.has(id)) { ids.add(id); stack.push(id); } };
  if (ship) {
    for (const p of ship.prereqs) if (hullSkills.has(p.skill)) push(p.skill);
  } else {
    for (const s of DATA.ships) {
      if (s.lane !== laneId) continue;
      for (const p of s.prereqs) if (hullSkills.has(p.skill)) push(p.skill);
    }
  }
  while (stack.length) {
    const id = stack.pop();
    for (const p of skillById.get(id)?.req ?? []) if (hullSkills.has(p.skill)) push(p.skill);
  }

  const lineage = new Map();
  const children = new Map();
  for (const id of ids) children.set(id, []);
  for (const id of ids) {
    const ps = (skillById.get(id)?.req ?? []).map(p => p.skill).filter(p => ids.has(p));
    if (!ps.length) continue;
    const parent = ps.reduce((best, p) => (skillById.get(p).depth > skillById.get(best).depth ? p : best), ps[0]);
    lineage.set(id, parent);
    children.get(parent).push(id);
  }
  const nameOf = id => skillById.get(id).name;
  for (const [, list] of children) list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const roots = [...ids].filter(id => !lineage.has(id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  // hulls in this lane each skill gates (only meaningful for the whole-lane view)
  const gated = new Map();
  if (!ship) {
    for (const s of DATA.ships) {
      if (s.lane !== laneId) continue;
      for (const p of s.prereqs) if (ids.has(p.skill)) gated.set(p.skill, (gated.get(p.skill) ?? 0) + 1);
    }
  }

  const out = [];
  const walk = (id, depth) => {
    out.push({ id, depth, gated: gated.get(id) ?? 0 });
    for (const c of children.get(id)) walk(c, depth + 1);
  };
  for (const r of roots) walk(r, 0);

  // non-hull prerequisites: this hull's own, or everything the lane's hulls need
  const support = new Map();
  const addSupport = (skill, level, hulls) => {
    const cur = support.get(skill);
    if (!cur || level > cur.level) support.set(skill, { level, hulls: (cur?.hulls ?? 0) + hulls });
    else cur.hulls += hulls;
  };
  if (ship) {
    for (const p of ship.prereqs) if (!ids.has(p.skill)) addSupport(p.skill, p.level, 1);
  } else {
    for (const s of DATA.ships) {
      if (s.lane !== laneId) continue;
      for (const p of s.prereqs) if (!ids.has(p.skill)) addSupport(p.skill, p.level, 1);
    }
  }
  return { tree: out, support: [...support.entries()].sort((a, b) => skillById.get(a[0]).name.localeCompare(skillById.get(b[0]).name)), focused: !!ship };
}

function openSkills(laneId, scrollToSkill, flash = false) {
  state.skillLane = laneId;
  state.focusLocked = true;              // explicit choice: hold it until you scroll
  renderSkillsPanel();
  if (scrollToSkill) scrollSkillIntoView(scrollToSkill, flash);
  syncURL();
}

function renderSkillsPanel() {
  const panel = $('skillsPanel');
  const wasHidden = panel.classList.contains('hidden');
  const lane = laneById.get(state.skillLane);
  if (!lane) { panel.classList.add('hidden'); panel.inert = true; panel.innerHTML = ''; syncScrim(); return; }
  panel.classList.toggle('hidden', !state.showSkills);
  panel.inert = !state.showSkills;
  syncScrim();
  if (wasHidden !== panel.classList.contains('hidden')) animateView();
  if (!state.showSkills) return;

  // The selected hull only drives this panel while its own lane is on show.
  // Clicking a lane header explicitly asks for that lane, so the hull keeps its
  // canvas highlight but hands the left panel back to the whole faction tree -
  // otherwise its `needs IV` markers would be painted on an unrelated lane.
  const sel = state.selected ? DATA.ships.find(s => s.id === state.selected) : null;
  const selected = sel && sel.lane === lane.id ? sel : null;
  const { tree, support, focused } = laneSkillTree(lane.id, selected);
  // skills the currently selected hull needs, and at what level
  const need = new Map();
  if (selected) for (const p of selected.prereqs) need.set(p.skill, p.level);

  const row = (node, isSupport) => {
    const sk = skillById.get(node.id);
    const you = yourLevel(node.id);
    const req = need.get(node.id);
    const met = req !== undefined && you >= req;
    const sub = [
      sk.rank ? `rank ${sk.rank}` : null,
      isSupport ? `${node.hulls} hull${node.hulls > 1 ? 's' : ''}` : (node.gated ? `${node.gated} hull${node.gated > 1 ? 's' : ''}` : null),
      req !== undefined ? `needs ${roman(req)}${met ? ' ✓' : ''}` : null,
    ].filter(Boolean).join(' · ');
    // signed in: the levels are the pilot's real ones, so the chips are read-only
    const training = SHOW_TRAINING_QUEUE ? trainingNow() : null;
    const chip = state.esiChar
      ? `<span class="lvl locked${you ? ' have' : ''}${training?.skill_id === node.id ? ' training' : ''}" title="${training?.skill_id === node.id ? 'training this right now' : 'from your EVE character'}">${roman(you) || '0'}</span>`
      : `<span class="lvl${you ? ' have' : ''}" data-skill="${node.id}" role="button" tabindex="0" aria-label="set ${esc(sk.name)} level, now ${roman(you) || '0'}" title="click to set your level">${roman(you) || '0'}</span>`;
    return `<div class="skill-row${isSupport ? ' support' : ''}${req !== undefined ? ' needed' : ''}"
      data-skill="${node.id}"${isSupport ? '' : ` style="--indent:${node.depth * 13}px"`}>
      ${chip}
      <span class="nm">${esc(sk.name)}${isSupport && req !== undefined ? ` <b style="color:var(--accent)">${roman(req)}</b>` : ''}<small>${sub}</small></span>
    </div>`;
  };

  const rows = tree.map(n => row(n, false)).join('');
  const supportRows = support.map(([id, info]) => row({ id, depth: 0, gated: info.hulls, hulls: info.hulls }, true)).join('');
  const untrained = tree.filter(n => yourLevel(n.id) === 0).length;

  // When a hull is focused this panel owns everything skill-shaped for it: the
  // flyable verdict, the Omega reason and the training queue. The right-hand
  // panel is ship facts only, so nothing is duplicated.
  let verdictBlock = '';
  if (focused) {
    const rate = spm();
    const miss = gaps(selected);
    const status = shipVerdict(selected);
    const totalSp = selected.prereqs.reduce((a, p) => a + spBetween(skillById.get(p.skill)?.rank, yourLevel(p.skill), p.level), 0);
    // what is left to train, in the order it must be trained (prerequisites first)
    const todo = selected.prereqs
      .filter(p => yourLevel(p.skill) < p.level)
      .map(p => ({
        ...p,
        depth: skillById.get(p.skill)?.depth ?? 0,
        sp: spBetween(skillById.get(p.skill)?.rank, yourLevel(p.skill), p.level),
      }))
      .sort((a, b) => a.depth - b.depth || a.level - b.level);
    const todoSp = todo.reduce((a, p) => a + p.sp, 0);
    const trainBlock = todo.length
      ? `<div class="sect">to train &mdash; in order (${todo.length})</div>
         <div class="skill-tree">${todo.map(p => `<div class="train-row">
            <span class="lvl">${roman(yourLevel(p.skill)) || '0'}&rarr;${roman(p.level)}</span>
            <span class="nm">${esc(p.name)}<small>${p.sp.toLocaleString()} SP · ${fmtMinutes(p.sp / rate)}</small></span>
          </div>`).join('')}</div>
         <div class="req"><span class="nm"><b>${todoSp.toLocaleString()} SP</b><small>${fmtMinutes(todoSp / rate)} of training left at ${rate} SP/min</small></span></div>`
      : '';
    const omega = selected.alpha ? '' : (() => {
      const w = selected.omegaWhy;
      const tail = w
        ? `needs <b>${esc(w.skill)} ${roman(w.level)}</b>`
          + (w.cap ? `, which an Alpha can only train to ${roman(w.cap)}` : ', which an Alpha cannot train')
        : '';
      return `<div class="verdict omega">\u03A9 Omega clone only${tail ? ` &mdash; ${tail}` : ''}</div>`;
    })();
    const v = status === 'fly'
      ? `<div class="verdict ok">&#10003; flyable now — every requirement is met.</div>`
      : status === 'next'
        ? `<div class="verdict next">&#9651; one skill short — <b>${esc(miss[0].name)}</b> ${roman(yourLevel(miss[0].skill)) || '0'} &rarr; ${roman(miss[0].level)}</div>`
        : status === 'unknown'
          ? `<div class="verdict unknown">&#9673; not checked — sign in with EVE, or click a level below, to see if you can fly it.</div>`
          : `<div class="verdict no">&#10007; ${miss.length} skills missing — ${esc(miss.slice(0, 2).map(m => m.name).join(', '))}${miss.length > 2 ? ', …' : ''}</div>`;
    verdictBlock = `${v}${omega}
      ${trainBlock}
      ${SHOW_TRAINING_QUEUE ? queueHTML(need) : ''}
      <div class="sect">skillbook cost (Jita)</div>
      <div class="statgrid" id="bookBox"><div class="stat"><span>skillbooks</span><b class="dim">fetching…</b></div></div>
      <div class="sect">total from your current levels</div>
      <div class="req"><span class="nm"><b>${totalSp.toLocaleString()} SP</b><small>${fmtMinutes(totalSp / rate)} at ${rate} SP/min (${state.primary}/${state.secondary})</small></span></div>`;
  }

  panel.innerHTML = `
    <div class="panel-head">
      <div class="kicker">${focused ? `required for ${esc(selected.name)}` : `skill tree &middot; ${lane.count} hulls`}</div>
      <h2>${esc(lane.short)}</h2>
      <div class="sub">${focused ? `${esc(selected.name)} &middot; ${esc(lane.name)}` : esc(lane.name)}</div>
    </div>
    <div class="panel-body">
      ${verdictBlock}
      <div class="hint">${focused
        ? `Everything ${esc(selected.name)} needs. ${state.esiChar
            ? `Levels are read from <b>${esc(state.esiChar.name)}</b> on EVE.`
            : 'Click a level to mark what you have — hull tiles recolour.'}`
        : `Click a level to mark what you can fly — hull tiles recolour. ${untrained ? `${untrained} of ${tree.length} hull skills untrained.` : 'All hull skills marked.'}`}</div>
      <div class="sect">${focused ? 'skills this hull needs' : 'hull skills'}</div>
      <div class="skill-tree">${rows}</div>
      ${supportRows ? `<div class="sect">support skills</div><div class="skill-tree">${supportRows}</div>` : ''}
    </div>
    <div class="panel-logo">${factionLogoHTML(lane.id)}</div>`;

  panel.querySelectorAll('.lvl').forEach(el => {
    if (el.classList.contains('locked')) return;      // ESI levels: not editable
    const sid = Number(el.dataset.skill);
    el.onclick = () => cycleSkill(sid);
    el.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleSkill(sid); }
    };
    el.addEventListener('focus', () => setHover(`k${sid}`));
    el.addEventListener('blur', () => setHover(null));
  });
  // hovering a skill lights the hulls it gates, so the panels and canvas stay linked
  panel.querySelectorAll('.skill-row').forEach(el => {
    el.addEventListener('mousemove', () => setHover(`k${Number(el.dataset.skill)}`));
    el.addEventListener('mouseleave', () => setHover(null));
  });

  // price the skillbooks for the focused hull (one batched request)
  if (focused && selected) {
    fillBookCost(
      'bookBox',
      selected.prereqs.filter(p => yourLevel(p.skill) < p.level).map(p => p.skill),
      selected.prereqs.map(p => p.skill),
    );
  }
}

/** Bring a skill row into view. `flash` marks it briefly - used when a search
 *  lands on a skill, where that row is the answer the user was looking for. */
function scrollSkillIntoView(skillId, flash = false) {
  const el = $('skillsPanel').querySelector(`.skill-row[data-skill="${skillId}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  if (!flash) return;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

/* --------------------------------------------------------------- search */

/* Every bonus line for a hull, flattened with the section it came from, so a
   search hit can say which list it matched and later flash the exact line. */
function bonusLinesOf(ship) {
  const prof = bonusProfile(ship);
  if (!prof) return [];
  const out = [];
  for (const b of prof.role) out.push({ text: b.t, section: 'role' });
  for (const g of prof.ship) {
    const label = g.skill != null ? (skillById.get(g.skill)?.name ?? '') : '';
    for (const b of g.lines) out.push({ text: b.t, section: 'ship', skill: label });
  }
  return out;
}

/* A lowercase index of everything searchable, built once when the hull data
   loads and rebuilt when the bonus text arrives. Keystrokes then scan plain
   strings instead of rebuilding bonus lines for all 361 hulls. */
let searchIndex = [];
function buildSearchIndex() {
  searchIndex = DATA.ships.map(s => {
    const cls = rowById.get(s.row)?.name ?? '';
    const roles = (s.tags ?? []).filter(t => ROLE_VOCAB.includes(t));
    return {
      id: s.id, lane: s.lane, name: s.name,
      nameL: s.name.toLowerCase(), cls, clsL: cls.toLowerCase(),
      roles, rolesL: roles.join(' ').toLowerCase(),
      bonuses: DETAILS ? bonusLinesOf(s) : [],
    };
  });
}

const ROLE_VOCAB = ['Attack', 'Combat', 'Disruption', 'Support', 'Hauling',
  'Resource Harvesting', 'Exploration', 'Tackling'];

function runSearch(q) {
  state.query = q.trim().toLowerCase();
  if (!state.query) { matches = []; renderHits(); applyHighlight(); return; }
  ensureDetails().catch(() => {});        // make bonus text searchable once it lands
  const needle = state.query;

  const ships = [];
  const bonuses = [];
  for (const e of searchIndex) {
    if (!state.lanes.has(e.lane)) continue;
    let why = null;
    if (e.nameL.includes(needle)) why = laneById.get(e.lane)?.short ?? '';
    else if (e.clsL.includes(needle)) why = e.cls;
    else {
      const role = e.roles.find(t => t.toLowerCase().includes(needle));
      if (role) why = role;
    }
    if (why) ships.push({ kind: 'ship', id: e.id, name: e.name, sub: why });
    // bonus text only exists once the lazy file has landed
    if (DETAILS && !why) {
      const hit = e.bonuses.find(b => b.text.toLowerCase().includes(needle));
      if (hit) {
        bonuses.push({
          kind: 'bonus', id: e.id, name: e.name,
          sub: hit.section === 'role' ? 'role bonus' : (hit.skill || 'ship bonus'),
          line: hit.text,
        });
      }
    }
  }
  const skills = DATA.skills
    .filter(s => s.name.toLowerCase().includes(needle))
    .slice(0, 10)
    .map(s => ({ kind: 'skill', id: s.id, name: s.name, sub: `rank ${s.rank ?? '?'}` }));

  matches = [
    ...ships.slice(0, 25),
    ...bonuses.slice(0, 12),
    ...skills,
  ];
  state.matchIndex = 0;
  renderHits();
  markMatches();
}

function renderHits() {
  const box = $('hits');
  const input = $('q');
  if (!matches.length) {
    box.classList.remove('open');
    box.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    return;
  }
  box.classList.add('open');
  input.setAttribute('aria-expanded', 'true');
  const GROUPS = [
    ['Hulls', 'ship'], ['Bonuses', 'bonus'], ['Skills', 'skill'],
  ];
  let i = 0;
  let html = '';
  for (const [label, kind] of GROUPS) {
    const rows = matches.filter(m => m.kind === kind);
    if (!rows.length) continue;
    html += `<div class="hit-group" role="presentation">${label}<span>${rows.length}</span></div>`;
    for (const m of rows) {
      const on = i === state.matchIndex;
      const icon = kind === 'skill'
        ? '<span style="width:26px;text-align:center;color:var(--accent)">&#9873;</span>'
        : `<img src="${IMG}/${m.id}/icon?size=64" alt="">`;
      const why = kind === 'bonus'
        ? `<span class="why">${esc(trunc(m.line, 40))}</span>`
        : `<span class="kind">${esc(m.sub ?? m.kind)}</span>`;
      html += `<div class="hit${on ? ' on' : ''}" id="hit-${i}" role="option" aria-selected="${on}" data-i="${i}">${icon}<span>${esc(m.name)}</span>${why}</div>`;
      i++;
    }
  }
  box.innerHTML = html;
  const active = box.querySelector('.hit.on');
  if (active) input.setAttribute('aria-activedescendant', active.id);
  else input.removeAttribute('aria-activedescendant');
  box.querySelectorAll('.hit').forEach(el => {
    el.onclick = () => pickMatch(Number(el.dataset.i));
  });
}

function pickMatch(i) {
  const m = matches[i];
  if (!m) return;
  if (m.kind === 'ship') { selectShip(m.id, true); }
  else if (m.kind === 'bonus') {
    // a bonus hit opens the hull on the Bonuses tab and flashes the line that
    // matched, so the search term is visibly answered
    selectShip(m.id, true);
    state.panelTab = 'bonuses';
    store.set('st.panelTab', 'bonuses');
    renderPanel(shipById.get(m.id));
    flashBonusLine(m.line);
  } else {
    // a skill: open the skill tree of the first lane that uses it, and light it
    const lane = DATA.ships.find(s => s.prereqs.some(p => p.skill === m.id))?.lane;
    if (lane) { openSkills(lane, m.id, true); setHover(`k${m.id}`); }
  }
  $('hits').classList.remove('open');
}

/** Flash the bonus line whose text matches, once the Bonuses pane is visible. */
function flashBonusLine(text) {
  if (!text) return;
  const pane = $('panel')?.querySelector('.pane[data-pane="bonuses"]');
  if (!pane) return;
  const needle = text.toLowerCase();
  const row = [...pane.querySelectorAll('.bonus-line')]
    .find(n => n.textContent.replace(/\s+/g, ' ').toLowerCase().includes(needle.slice(0, 30)));
  if (!row) return;
  row.classList.add('flash');
  row.scrollIntoView({ block: 'center', behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  setTimeout(() => row.classList.remove('flash'), 1800);
}

/** Deep link ?skill=<id>: open the owning lane's tree and mark the skill. */
function pickMatchSkillOnly(skillId) {
  const lane = DATA.ships.find(s => s.prereqs.some(p => p.skill === skillId))?.lane;
  if (!lane) return;
  openSkills(lane, skillId, true);
}

function markMatches() {
  for (const n of tileNodes) n.classList.remove('match');
  if (!state.query) return;
  for (const s of DATA.ships) {
    if (!s.name.toLowerCase().includes(state.query)) continue;
    tileById.get(s.id)?.classList.add('match');
  }
}

/* ------------------------------------------------------------------- view */

/* The canvas is a fixed-width box, so the horizontal position is locked: the
   content is always centred and only vertical movement is possible. Zoom is
   capped at "full width fits", which keeps the whole band visible at any zoom. */
function maxK() {
  return layout ? stageBox.w / layout.width : 1;
}

function lockView() {
  if (!layout) return;
  view.k = Math.min(view.k, maxK());
  view.x = Math.round((stageBox.w - layout.width * view.k) / 2);
  // Clamp vertically too: the canvas must not be draggable past its first or
  // last band. When it all fits, centre it instead.
  const contentH = layout.height * view.k;
  const margin = 16;
  if (contentH <= stageBox.h - margin * 2) {
    view.y = Math.round((stageBox.h - contentH) / 2);
  } else {
    view.y = Math.round(Math.min(margin, Math.max(stageBox.h - margin - contentH, view.y)));
  }
}

function applyView() {
  lockView();
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  syncFocusedLane();
}

/** Same, minus the focus bookkeeping: cheap enough to run every animation frame. */
function applyViewOnly() {
  lockView();
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
}

/** A panel is animating its width: follow it frame by frame so the canvas
 *  re-centres smoothly instead of jumping when the panel finishes. */
function animateView(duration = 340) {
  if (REDUCE_MOTION) { measureStage(); applyView(); return; }   // no width tween
  const t0 = performance.now();
  const step = () => {
    measureStage();                    // the panel is changing the stage's width
    applyViewOnly();
    if (performance.now() - t0 < duration) requestAnimationFrame(step);
    else applyView();
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------- scroll-driven focus */

/** The lane whose band sits at the middle of the viewport. */
function focusedLaneId() {
  if (!layout || !layout.bands.length) return null;
  const worldY = (-view.y + stageBox.h / 2) / view.k;
  let best = null, bestDist = Infinity;
  for (const band of layout.bands) {
    const inside = worldY >= band.y && worldY <= band.y + band.h;
    const dist = inside ? 0 : Math.abs(worldY - (band.y + band.h / 2));
    if (dist < bestDist) { bestDist = dist; best = band.lane.id; }
  }
  return best;
}

/** Follow the lane you are scrolling through, so the skill panel keeps up.
 *  An explicit choice (clicking a hull or a lane header) wins until you scroll. */
function syncFocusedLane() {
  const id = focusedLaneId();
  if (id == null) return;
  // An explicit choice holds until you let go of it: a selected hull keeps its
  // faction's tree on screen while you scroll; clicking off hands it back.
  const held = state.selected != null || state.focusLocked;
  if (!held && state.showSkills && state.skillLane !== id) {
    state.skillLane = id;
    renderSkillsPanel();                 // note: no syncURL - scrolling is not a route
  }
  markFocusedBand(state.showSkills && held ? state.skillLane : id);
}

function markFocusedBand(id) {
  for (const b of bandNodes) {
    b.classList.toggle('focused', id != null && Number(b.dataset.lane) === id);
  }
}


function zoomAt(cx, cy, factor) {
  // cx is ignored on purpose: horizontal position is locked to centre
  const k2 = Math.min(maxK(), Math.max(0.06, view.k * factor));
  const sy = (cy - view.y) / view.k;          // keep the cursor's world y put
  view.k = k2;
  view.y = cy - sy * k2;
  state.focusLocked = false;                  // zooming hands focus back to scroll
  applyView();
}

function fitToScreen() {
  const w = stageBox.w, h = stageBox.h;
  const k = Math.min((w - 30) / layout.width, (h - 30) / layout.height);
  view.k = Math.max(0.06, k);
  view.x = (w - layout.width * view.k) / 2;
  view.y = (h - layout.height * view.k) / 2;
  applyView();
}

/** Opening view: zoomed all the way in on the top lane (Caldari). */
function focusTopLane() {
  const band = layout.bands[0];
  if (!band) { fitToScreen(); return; }
  view.k = maxK();                       // maximum zoom = a band exactly fills the width
  view.y = 16 - band.y * view.k;         // first band's header at the top
  applyView();
}

function wireView() {
  const svg = $('canvas');
  // belt and braces alongside the CSS: never let a drag start a text selection
  // or a native image drag
  svg.addEventListener('dragstart', e => e.preventDefault());
  svg.addEventListener('selectstart', e => e.preventDefault());

  let drag = null;
  const pts = new Map();                 // active pointers, for pinch-zoom
  let pinch = null;
  const pair = () => {
    const [a, b] = [...pts.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midY: (a.y + b.y) / 2 };
  };

  // Pointer capture is taken only once the pointer actually moves: capturing on
  // pointerdown would retarget the following `click` to the svg and swallow
  // every tile / skill-plate click.
  svg.addEventListener('pointerdown', e => {
    keyboardNav = false;                 // any pointer use means we are not keyboard-driving
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {                 // second finger: switch from pan to pinch-zoom
      drag = null;
      pinch = pair();
      clearTip();
      return;
    }
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId, moved: false };
  });
  svg.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {        // two-finger pinch: zoom about the midpoint
      const now = pair();
      if (pinch.dist > 0) {
        const r = svg.getBoundingClientRect();
        zoomAt(0, now.midY - r.top, now.dist / pinch.dist);
      }
      pinch = now;
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) + Math.abs(dy) <= 4) return;   // still a click
      drag.moved = true;
      state.focusLocked = false;                      // scrolling hands focus back
      clearTip();
      try { svg.setPointerCapture(e.pointerId); } catch { /* already gone */ }
      svg.classList.add('dragging');
    }
    view.y = drag.vy + dy;                            // vertical only: x is locked
    applyView();
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    if (drag.moved) {
      suppressClickUntil = Date.now() + 250;         // a pan must not select
      try { if (svg.hasPointerCapture(drag.id)) svg.releasePointerCapture(drag.id); } catch { /* ignore */ }
    }
    svg.classList.remove('dragging');
    drag = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', () => {
    $('hits').classList.remove('open');
    // a click on empty canvas clears the selection (but not the click that ends a pan)
    if (!clickSuppressed() && state.selected != null) {
      clearSelection();
      // renderPanel(null) animates the slide
    }
  });

  // Wheel scrolls the list (like any page); ctrl/⌘+wheel still zooms.
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      return;
    }
    const per = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stageBox.h : 1;
    view.y -= e.deltaY * per;
    applyView();                       // applyView clamps at the first/last section
  }, { passive: false });

  $('zin').onclick = () => zoomAt(stageBox.w / 2, stageBox.h / 2, 1.3);
  $('zout').onclick = () => zoomAt(stageBox.w / 2, stageBox.h / 2, 1 / 1.3);
  $('zfit').onclick = fitToScreen;
}

/* ------------------------------------------------------- tile keyboard nav */

const tileIdOf = node => Number(node.dataset.key.slice(1));

/** Next/previous tile in render order (left/right). */
function stepTile(id, dir) {
  const i = tileNodes.findIndex(n => n.dataset.key === `s${id}`);
  if (i < 0) return null;
  const n = tileNodes[i + dir];
  return n ? tileIdOf(n) : null;
}

/** Nearest tile above/below, favouring vertical alignment (up/down). */
function nearestTile(id, dir) {
  const from = shipWorld.get(id);
  if (!from) return null;
  let best = null, bestScore = Infinity;
  for (const n of tileNodes) {
    const sid = tileIdOf(n);
    if (sid === id) continue;
    const p = shipWorld.get(sid);
    if (!p) continue;
    const dy = p.y - from.y;
    if (dir < 0 ? dy > -1 : dy < 1) continue;
    const score = Math.abs(dy) * 5 + Math.abs(p.x - from.x);
    if (score < bestScore) { bestScore = score; best = sid; }
  }
  return best;
}

function focusTile(id) {
  const node = tileById.get(id);
  if (!node) return;
  node.focus({ preventScroll: true });
  const p = shipWorld.get(id);
  if (p) focusWorld(p.x, p.y);
}

/** Roving-tabindex keyboard control for the hull grid. */
function wireTileKeyboard() {
  const svg = $('canvas');

  // any keypress means keyboard driving, so Tab focus shows the hover card too
  document.addEventListener('keydown', () => { keyboardNav = true; }, true);

  svg.addEventListener('focusin', e => {
    const g = e.target.closest?.('.ship');
    if (!g) return;
    const id = tileIdOf(g);
    if (focusTileId !== id) {
      tileById.get(focusTileId)?.setAttribute('tabindex', '-1');
      focusTileId = id;
      g.setAttribute('tabindex', '0');
    }
    setHover(`s${id}`);
    const ship = shipById.get(id);
    if (keyboardNav && ship) {
      const r = g.getBoundingClientRect();
      showTip(ship, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    }
  });

  svg.addEventListener('focusout', () => { setHover(null); clearTip(); });

  svg.addEventListener('keydown', e => {
    const g = e.target.closest?.('.ship');
    if (!g) return;
    keyboardNav = true;
    const id = tileIdOf(g);
    let next = null;
    switch (e.key) {
      case 'ArrowLeft':  next = stepTile(id, -1); break;
      case 'ArrowRight': next = stepTile(id, 1); break;
      case 'ArrowUp':    next = nearestTile(id, -1); break;
      case 'ArrowDown':  next = nearestTile(id, 1); break;
      case 'Home':       next = tileNodes[0] && tileIdOf(tileNodes[0]); break;
      case 'End':        next = tileNodes.length && tileIdOf(tileNodes[tileNodes.length - 1]); break;
      case 'Enter': case ' ': e.preventDefault(); selectShip(id, true); return;
      default: return;
    }
    e.preventDefault();
    if (next != null) focusTile(next);
  });
}

let suppressClickUntil = 0;
/** True right after a pan, so the click that ends a drag selects nothing. */
const clickSuppressed = () => Date.now() < suppressClickUntil;

/* ----------------------------------------------------------------- status */

function renderStatus() {
  const shown = visibleShips().length;
  const fly = DATA.ships.filter(s => isFlyable(s)).length;
  $('status').innerHTML = `<span id="buildinfo">${esc(buildInfoText)}</span>`
    + `<span><b>${DATA.meta.counts.ships}</b> hulls</span>`
    + `<span><b>${layout ? layout.bands.length : DATA.lanes.length}</b> lanes</span>`
    + `<span><b>${shown}</b> shown</span>`
    + `<span><b>${fly}</b> flyable at your levels</span>`
    + `<span>${state.primary}/${state.secondary} &rarr; <b>${spm()}</b> SP/min</span>`
    + `<span class="legend">`
    + `<i class="dot ok"></i>flyable `
    + `<i class="dot warn"></i>partial `
    + `<i class="dot bad"></i>can't fly`
    + `</span>`
    + `<span style="margin-left:auto">scroll to move &middot; ctrl+scroll to zoom &middot; \u03A9 = Omega only</span>`;
  const live = $('live');
  if (live) live.textContent = `${shown} hulls shown, ${fly} flyable at your levels`;
}

/* ------------------------------------------------------------------- url */

function syncURL() {
  const u = new URL(location.href);
  const p = u.searchParams;
  const set = (k, v) => (v ? p.set(k, v) : p.delete(k));
  set('ship', state.selected ?? '');
  set('skills', state.skillLane ?? '');
  set('hideskills', state.showSkills ? '' : '1');
  set('rows', state.rows === 'all' ? '' : state.rows);
  set('fly', state.flyableOnly ? '1' : '');
  set('nofly', state.noFlyOnly ? '1' : '');
  set('nmv', state.noMasteryV ? '1' : '');
  set('alpha', state.alphaOnly ? '1' : '');
  set('p', state.primary === 17 ? '' : state.primary);
  set('s', state.secondary === 17 ? '' : state.secondary);
  // only record lanes when the user has hidden some — an all-lanes URL stays clean
  if (DATA && state.lanes.size === DATA.lanes.length) p.delete('lanes');
  else set('lanes', [...state.lanes].join(','));
  history.replaceState(null, '', u);
}

function readURL() {
  const p = new URL(location.href).searchParams;
  const rows = p.get('rows');
  if (['combat', 'industry'].includes(rows)) state.rows = rows;
  if (p.get('fly')) state.flyableOnly = true;
  if (p.get('nofly')) state.noFlyOnly = true;
  if (p.get('nmv')) state.noMasteryV = true;
  if (p.get('alpha')) state.alphaOnly = true;
  if (p.get('hideskills')) state.showSkills = false;
  if (p.get('p')) state.primary = Number(p.get('p')) || 17;
  if (p.get('s')) state.secondary = Number(p.get('s')) || 17;
  const lanes = p.get('lanes');
  return { ship: p.get('ship'), skill: p.get('skill'), skills: p.get('skills'), hideSkills: p.has('hideskills') };
}

/* --------------------------------------------------------------- filters */

/** Keep the "not mastery V" chip honest: it is only usable once we know levels
 *  and the mastery profiles have loaded, and it silently drops out otherwise. */
function syncMasteryChip() {
  const chip = $('masteryV');
  if (!chip) return;
  if (state.noMasteryV && !levelsKnown()) state.noMasteryV = false;
  const ready = masteryReady();
  chip.disabled = !ready;
  chip.classList.toggle('on', state.noMasteryV);
  chip.title = !levelsKnown()
    ? 'needs your skills — sign in with EVE, or set some skill levels'
    : !DETAILS ? 'mastery data still loading…'
      : 'only hulls you have not yet reached Mastery V with';
}

/** On phones the side panels are drawers over the canvas; dim the canvas behind
 *  whichever one is open and offer a tap-to-close backdrop. */
function syncScrim() {
  const scrim = $('scrim');
  if (!scrim) return;
  const open = isMobile()
    && (!$('panel').classList.contains('hidden') || !$('skillsPanel').classList.contains('hidden'));
  scrim.hidden = !open;
  scrim.classList.toggle('show', open);
}

function wireFilters() {
  $('rowFilter').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      $('rowFilter').querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      state.rows = b.dataset.rows;
      render(); applyView(); syncURL();     // keep the current zoom, just re-clamp
    };
  });
  const fly = $('flyable');
  const noFly = $('noFly');
  const setFlyChips = () => {
    fly.classList.toggle('on', state.flyableOnly);
    noFly.classList.toggle('on', state.noFlyOnly);
  };
  setFlyChips();
  fly.onclick = () => {
    state.flyableOnly = !state.flyableOnly;
    if (state.flyableOnly) state.noFlyOnly = false;      // mutually exclusive
    setFlyChips();
    render(); applyView(); syncURL();
  };
  noFly.onclick = () => {
    state.noFlyOnly = !state.noFlyOnly;
    if (state.noFlyOnly) state.flyableOnly = false;
    setFlyChips();
    render(); applyView(); syncURL();
  };

  const alphaBtn = $('alphaBtn');
  alphaBtn.classList.toggle('on', state.alphaOnly);
  alphaBtn.onclick = () => {
    state.alphaOnly = !state.alphaOnly;
    alphaBtn.classList.toggle('on', state.alphaOnly);
    render(); applyView(); syncURL();       // keep the current zoom
  };

  const masteryBtn = $('masteryV');
  syncMasteryChip();
  masteryBtn.onclick = () => {
    if (masteryBtn.disabled) return;
    state.noMasteryV = !state.noMasteryV;
    syncMasteryChip();
    render(); applyView(); syncURL();
  };

  // collapse / expand every faction section
  $('collapseAll').onclick = () => {
    state.collapsed = new Set(DATA.lanes.map(l => l.id));
    store.set('st.collapsed', [...state.collapsed]);
    render(); syncKey(); applyView();
  };
  $('expandAll').onclick = () => {
    state.collapsed = new Set();
    store.set('st.collapsed', []);
    render(); syncKey(); applyView();
  };

  const skillsBtn = $('skillsBtn');
  skillsBtn.classList.toggle('on', state.showSkills);
  skillsBtn.onclick = () => {
    state.showSkills = !state.showSkills;
    skillsBtn.classList.toggle('on', state.showSkills);
    renderSkillsPanel();
    // renderSkillsPanel() animates the slide
    syncURL();
  };

  const q = $('q');
  q.addEventListener('input', () => runSearch(q.value));
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { state.matchIndex = Math.min(matches.length - 1, state.matchIndex + 1); renderHits(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { state.matchIndex = Math.max(0, state.matchIndex - 1); renderHits(); e.preventDefault(); }
    if (e.key === 'Enter') pickMatch(state.matchIndex);
    if (e.key === 'Escape') { q.value = ''; runSearch(''); q.blur(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); q.select(); }
    if (e.key === 'Escape') { setHover(null); clearSelection(); }
  });

  // attributes popover
  const pop = $('attribPop'), btn = $('attribBtn');
  const placePop = (el, anchor, width) => {
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))}px`;
  };
  btn.onclick = e => {
    e.stopPropagation();
    $('keyPop').classList.add('hidden');
    placePop(pop, btn, 240);
    pop.classList.toggle('hidden');
  };
  $('keyBtn').onclick = e => {
    e.stopPropagation();
    pop.classList.add('hidden');
    placePop($('keyPop'), $('keyBtn'), 330);
    $('keyPop').classList.toggle('hidden');
    syncKey();
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('.pop') && !e.target.closest('#attribBtn') && !e.target.closest('#keyBtn')) {
      pop.classList.add('hidden');
      $('keyPop').classList.add('hidden');
    }
  });
  $('attrP').value = state.primary;
  $('attrS').value = state.secondary;
  const attribNote = () => { $('attrNote').textContent = `SP/min = primary + secondary/2 = ${spm()}`; };
  attribNote();
  $('attrP').oninput = () => { state.primary = clampAttr($('attrP').value); store.set('st.p', state.primary); attribNote(); render(); syncURL(); };
  $('attrS').oninput = () => { state.secondary = clampAttr($('attrS').value); store.set('st.s', state.secondary); attribNote(); render(); syncURL(); };
  $('attrReset').onclick = () => { state.levels = {}; store.set('st.levels', {}); render(); };

  // mobile drawer backdrop: tap outside to close whichever drawer is open
  $('scrim').onclick = () => {
    if (!$('panel').classList.contains('hidden')) clearSelection();
    else if (state.showSkills) {
      state.showSkills = false;
      $('skillsBtn').classList.remove('on');
      renderSkillsPanel();
      syncURL();
    }
  };
}

const clampAttr = v => Math.max(1, Math.min(50, Number(v) || 17));

/* -------------------------------------------------------------- faction key */

const initials = name => {
  const words = name.replace(/[^A-Za-z' ]/g, '').split(/[\s']+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
};

/** Optional real faction logos: img/factions/manifest.json lists lane ids. */
async function loadFactionLogos() {
  try {
    const r = await fetch('img/factions/manifest.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const list = await r.json();
    if (Array.isArray(list) && list.length) factionLogos = new Set(list.map(Number));
  } catch { /* no logos shipped - house emblems are used */ }
}

function buildKey() {
  const grid = $('keyGrid');
  grid.innerHTML = DATA.lanes.map(l => {
    // real faction logo when we have one, house emblem otherwise
    const mark = (factionLogos && factionLogos.has(l.id))
      ? `<img class="key-logo" src="img/factions/${l.id}.png" alt="">`
      : `<span class="key-emblem" style="background:${l.color}">${esc(initials(l.short))}</span>`;
    return `
    <button class="key-item" data-lane="${l.id}" title="${esc(l.name)} — ${l.count} hulls">
      ${mark}
      <span class="key-txt">
        <span class="key-name">${esc(l.short)}</span>
        <span class="key-count">${l.count} hulls</span>
      </span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.key-item').forEach(el => {
    el.onclick = () => { jumpToLane(Number(el.dataset.lane)); $('keyPop').classList.add('hidden'); };
  });
  syncKey();
}

/** Dim key entries whose lane is currently hidden. */
function syncKey() {
  $('keyGrid').querySelectorAll('.key-item').forEach(el => {
    el.classList.toggle('off', state.collapsed.has(Number(el.dataset.lane)));
  });
}

/** Take the view to a faction's band and flash it so you can see where you landed. */
function jumpToLane(laneId) {
  if (state.collapsed.has(laneId)) {       // folded section: open it so you can see it
    state.collapsed.delete(laneId);
    store.set('st.collapsed', [...state.collapsed]);
    render();
    syncKey();
  }
  const band = layout.bands.find(b => b.lane.id === laneId);
  if (!band) return;
  view.k = Math.min(maxK(), Math.max(view.k, 0.6));
  // Centre a band that fits the viewport, so the viewport centre lands inside it
  // (that is what decides the focused lane); top-align one taller than the view.
  const bandScreenH = band.h * view.k;
  const top = bandScreenH < stageBox.h * 0.8 ? (stageBox.h - bandScreenH) / 2 : 74;
  view.y = top - band.y * view.k;
  applyView();                             // also re-focuses the skills panel

  const el = bandByLane.get(laneId);
  if (el) {
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1400);
  }
  state.skillLane = laneId;
  renderSkillsPanel();
  syncURL();
}

/* ------------------------------------------------------------------ init */

async function init() {
  const res = await fetch('data/shiptree.json');
  if (!res.ok) throw new Error(`data/shiptree.json: HTTP ${res.status}`);
  const t0 = performance.now();
  DATA = await res.json();
  debug(`shiptree.json parsed in ${(performance.now() - t0).toFixed(1)}ms`);

  skillById = new Map(DATA.skills.map(s => [s.id, s]));
  laneById = new Map(DATA.lanes.map(l => [l.id, l]));
  rowById = new Map(DATA.rows.map(r => [r.id, r]));
  hullSkills = new Set(DATA.skills.filter(s => s.hull).map(s => s.id));
  buildIndexes();
  buildSearchIndex();
  measureStage();
  state.lanes = new Set(DATA.lanes.map(l => l.id));

  buildInfoText = `SDE build ${DATA.meta.sdeBuild ?? '?'} · ${DATA.meta.counts.ships} hulls · ${DATA.meta.counts.skills} skills`;

  const url = readURL();
  // On phones the skills drawer starts closed (unless the URL explicitly asked
  // for it open) so the canvas has the screen.
  if (isMobile() && !url.hideSkills) state.showSkills = false;
  wireView();
  wireTileKeyboard();
  wireFilters();
  // pick up an existing EVE session before the first render, so the tree comes
  // up already coloured by the pilot's real skills
  const pilot = EVE_SSO.character();
  if (pilot) state.esiChar = pilot;
  await loadFactionLogos();                                // before buildKey: real logos
  buildKey();
  state.skillLane = state.skillLane ?? DATA.lanes[0].id;   // left panel starts on a lane
  renderAuth();
  render();
  renderSkillsPanel();
  if (isMobile()) fitToScreen(); else focusTopLane();
  if (pilot) applyEsiSkills(false);

  // Mastery and bonuses are the bigger half of the data and nothing on screen
  // needs them yet, so they load on idle / first use rather than blocking the
  // first paint. When they land only an open hull or the mastery filter redraws.
  scheduleDetailsWarm();

  if (url.ship) {
    const id = Number(url.ship);
    if (DATA.ships.some(s => s.id === id)) selectShip(id, true);
  }
  if (url.skills && laneById.has(Number(url.skills))) openSkills(Number(url.skills));
  if (url.skill) pickMatchSkillOnly(Number(url.skill));

  window.addEventListener('resize', () => { measureStage(); applyView(); syncScrim(); });
  window.addEventListener('error', e => { if (String(e.message).includes('shiptree')) setBuildInfo('data missing - run build-shiptree.mjs'); });
}

init().catch(err => {
  console.error(err);
  showError('could not load the ship tree', err.message);
});

})();
