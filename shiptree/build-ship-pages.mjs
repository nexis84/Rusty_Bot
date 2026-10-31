#!/usr/bin/env node
/* Generate the static per-ship pages from the built ship-tree data.
 *
 *   node shiptree/build-ship-pages.mjs
 *
 * Output:
 *   shiptree/ship/<typeID>-<slug>/index.html   (one per hull)
 *   shiptree/ship/index.html                   (all-hulls index)
 *   sitemap.xml                                (ship-page block)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHIP_DIR = path.join(__dirname, 'ship');
const SITE = 'https://www.rustybot.co.uk';
const BASE = `${SITE}/shiptree`;
const IMG = 'https://images.evetech.net/types';

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/shiptree.json'), 'utf8'));
const DETAILS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/details.json'), 'utf8'));
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/version.json'), 'utf8'));

const laneById = new Map(DATA.lanes.map(l => [l.id, l]));
const rowById = new Map(DATA.rows.map(r => [r.id, r]));
const skillById = new Map(DATA.skills.map(s => [s.id, s]));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const num = n => Number(n || 0).toLocaleString('en-GB');
const isk = n => {
  if (!n && n !== 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K ISK`;
  return `${Math.round(n).toLocaleString('en-GB')} ISK`;
};
const roman = n => ['', 'I', 'II', 'III', 'IV', 'V'][Number(n)] || String(n);
const alignTime = (mass, agility) => (mass && agility ? Math.log(4) * (mass / 1e6) * agility : null);
const slugify = name => String(name)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'ship';
const shipSlug = ship => ship.slug || slugify(ship.name);

function tagHTML(ship) {
  const out = [];
  if (ship.tier) out.push(`<span class="tag tier">${esc(ship.tier)}</span>`);
  out.push(ship.alpha
    ? '<span class="tag alpha">Alpha</span>'
    : '<span class="tag omega">&#937; Omega only</span>');
  for (const t of ship.tags || []) {
    if (/^(Small|Medium|Large|X-Large)$/i.test(t)) continue;
    out.push(`<span class="tag">${esc(t)}</span>`);
  }
  return out.join('');
}

function heroLede(ship) {
  const cls = rowById.get(ship.row)?.name || 'ship';
  const faction = laneById.get(ship.lane)?.short || 'EVE';
  const st = ship.stats || {};
  const nonSize = (ship.tags || []).filter(t => !/^(Small|Medium|Large|X-Large)$/i.test(t));
  const specific = nonSize.filter(t => !/^(Combat|Support)$/i.test(t));
  const tags = (specific.length ? specific : nonSize).slice(0, 3).map(t => t.toLowerCase());
  const bits = [`A ${faction} ${cls}`];
  if (tags.length) {
    const tagList = tags.length > 1 ? `${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]}` : tags[0];
    bits.push(`focused on ${tagList}`);
  }
  const details = [];
  if (st.launchers) details.push(`${st.launchers} launchers`);
  if (st.turrets) details.push(`${st.turrets} turrets`);
  if (st.shield) details.push(`${num(st.shield)} shield`);
  let out = bits.join(' ');
  if (details.length) out += `. ${details.join(', ')}`;
  out += ship.alpha ? '. Alpha-flyable.' : '. Omega-only.';
  return out;
}

function metaDescription(ship) {
  const cls = rowById.get(ship.row)?.name || 'ship';
  const faction = laneById.get(ship.lane)?.short || 'EVE';
  const st = ship.stats || {};
  const bits = [`${ship.name}: ${faction} ${cls}${ship.tier ? ` (${ship.tier})` : ''}.`];
  if (st.launchers) bits.push(`${st.launchers} launchers.`);
  if (st.turrets) bits.push(`${st.turrets} turrets.`);
  if (st.shield) bits.push(`${num(st.shield)} shield.`);
  bits.push('Skills, stats, bonuses, mastery and estimated Jita price.');
  return bits.join(' ').replace(/\s+/g, ' ').trim();
}

function statsHTML(ship) {
  const st = ship.stats || {};
  const rows = [];
  const stat = (label, value, small) => {
    if (value == null || value === '') return;
    rows.push(`<div class="stat"><span>${esc(label)}</span><b>${value}${small ? ` <small>${small}</small>` : ''}</b></div>`);
  };
  if (![st.high, st.med, st.low].every(v => v == null)) {
    stat('high / med / low', `${st.high ?? 0} / ${st.med ?? 0} / ${st.low ?? 0}`);
  }
  if (st.rig != null) stat('rig slots', num(st.rig));
  if (st.cpu != null || st.pg != null) stat('CPU / powergrid', `${num(st.cpu ?? 0)} tf / ${num(st.pg ?? 0)} MW`);
  if (st.turrets) stat('turrets', num(st.turrets));
  if (st.launchers) stat('launchers', num(st.launchers));
  if (st.droneBay || st.droneBandwidth) {
    stat('drone bay', `${num(st.droneBay ?? 0)} m&sup3;`, `${num(st.droneBandwidth ?? 0)} Mbit/s`);
  }
  if (st.shield != null) stat('shield', num(st.shield));
  if (st.armor != null) stat('armor', num(st.armor));
  if (st.hull != null) stat('structure', num(st.hull));
  if (st.cap != null) {
    stat('capacitor', `${num(st.cap)} GJ`, st.capRecharge ? `${num(st.capRecharge / 1000)} s` : null);
  }
  if (st.velocity != null) stat('max velocity', `${num(st.velocity)} m/s`);
  if (st.warp != null) stat('warp speed', `${num(st.warp)} AU/s`);
  const at = alignTime(ship.mass, st.agility);
  if (at != null) stat('align time', `${at.toFixed(1)} s`);
  if (st.sig != null) stat('signature radius', `${num(st.sig)} m`);
  if (st.scanRes != null) stat('scan resolution', `${num(st.scanRes)} mm`);
  if (st.maxTargetRange != null) stat('target range', `${num(st.maxTargetRange / 1000)} km`);
  if (ship.capacity != null) stat('cargo', `${num(ship.capacity)} m&sup3;`);
  if (ship.mass != null) stat('mass', `${num(Math.round(ship.mass / 1000))} t`);
  if (ship.volume != null) stat('volume', `${num(ship.volume)} m&sup3;`);
  return rows.join('');
}

function bonusHTML(ship) {
  const [ri, si] = DETAILS.shipBonus?.[ship.id] || [];
  const role = DETAILS.bonusRoleSets?.[ri] || [];
  const shipSets = DETAILS.bonusShipSets?.[si] || [];
  if (!role.length && !shipSets.length) return '<p class="muted">No bonus data for this hull.</p>';
  const line = b => {
    const val = b.v == null ? '' : `<b>${b.v > 0 ? '+' : ''}${b.v}${esc(b.u || '')}</b> `;
    return `<div class="bonus">${val}${esc(b.t)}</div>`;
  };
  const groups = [];
  if (role.length) {
    groups.push(`<div class="bonus-group"><div class="src">Role bonuses</div>${role.map(line).join('')}</div>`);
  }
  for (const g of shipSets) {
    const skill = skillById.get(g.skill)?.name || 'Ship skill';
    groups.push(`<div class="bonus-group"><div class="src">${esc(skill)} &mdash; per level</div>${(g.lines || []).map(line).join('')}</div>`);
  }
  return `<div class="bonus-list">${groups.join('')}</div>`;
}

function requirementsHTML(ship) {
  const found = new Map();
  const walk = (id, level, depth) => {
    const prev = found.get(id);
    if (prev && prev.level >= level) return;
    found.set(id, { id, level, depth });
    const sk = skillById.get(id);
    for (const r of sk?.req || []) walk(r.skill, r.level, depth + 1);
  };
  for (const p of ship.prereqs || []) walk(p.skill, p.level, 0);
  const rows = [...found.values()]
    .map(x => ({ ...x, name: skillById.get(x.id)?.name || `Skill ${x.id}`, rank: skillById.get(x.id)?.rank }))
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

  if (!rows.length) {
    return `<p class="muted">This hull has no skill prerequisites.</p>
      <div class="actions" style="margin-top:14px"><a class="btn" href="../../?ship=${ship.id}">Open in ship tree</a></div>`;
  }

  const body = rows.map(r => `<div class="req-row" style="padding-left:${r.depth * 14}px">
    <span class="lvl">${roman(r.level)}</span>
    <span class="nm">${esc(r.name)}</span>
    <span class="rank">rank ${r.rank ?? '?'}</span>
  </div>`).join('');
  const mastery = ship.mastery != null
    ? `<a class="btn" href="../../?ship=${ship.id}&amp;plan=5">Mastery V plan</a>`
    : '';
  return `<div class="req-chain">${body}</div>
    <div class="actions" style="margin-top:14px">
      <a class="btn" href="../../?ship=${ship.id}&amp;plan=fly">Minimum plan</a>
      ${mastery}
    </div>`;
}

function masteryHTML(ship) {
  const profile = ship.mastery != null ? DETAILS.masteryProfiles?.[ship.mastery] : null;
  if (!profile) return '<p class="muted">No mastery profile for this hull.</p>';
  return `<div class="mastery-grid">${profile.map((skills, i) => `<div class="mastery">
    <b>${skills.length}</b><span>Grade ${roman(i + 1)}</span>
  </div>`).join('')}</div>
  <p class="muted" style="margin:12px 0 0">Skills required for each mastery grade. Open the tree to see the full training plan against your character.</p>`;
}

function relatedHTML(ship) {
  const seen = new Set([ship.id]);
  const sameRow = DATA.ships
    .filter(s => s.lane === ship.lane && s.row === ship.row && !seen.has(s.id))
    .sort((a, b) => (a.gateDepth - b.gateDepth) || a.name.localeCompare(b.name));
  const list = sameRow.slice(0, 4);
  list.forEach(s => seen.add(s.id));
  if (list.length < 4) {
    const rest = DATA.ships
      .filter(s => s.lane === ship.lane && !seen.has(s.id))
      .sort((a, b) => Math.abs((a.gateDepth || 0) - (ship.gateDepth || 0)) - Math.abs((b.gateDepth || 0) - (ship.gateDepth || 0))
        || (a.gateDepth - b.gateDepth) || a.name.localeCompare(b.name));
    list.push(...rest.slice(0, 4 - list.length));
  }
  if (!list.length) return '';
  return `<div class="related">${list.map(s => `<a href="../${s.id}-${shipSlug(s)}/">${esc(s.name)}</a>`).join('')}</div>`;
}

function loreHTML(ship) {
  const raw = DETAILS.descriptions?.[ship.id];
  if (!raw) return '';
  const safe = esc(raw)
    .replace(/&lt;(\/?)i&gt;/g, '<$1i>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>');
  return safe.split(/\n\n+/).filter(Boolean).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function blueprintHref(ship) {
  if (!ship.bp) return '';
  const hash = Buffer.from(JSON.stringify({ bp: ship.bp, runs: 1 })).toString('base64');
  return `${SITE}/blueprint-visualizer/#bv=${hash}`;
}

function pageHTML(ship) {
  const slug = shipSlug(ship);
  const url = `${BASE}/ship/${ship.id}-${slug}/`;
  const lane = laneById.get(ship.lane);
  const row = rowById.get(ship.row);
  const faction = lane?.short || 'EVE';
  const cls = row?.name || 'Ship';
  const tier = ship.tier || 'Hull';
  const desc = metaDescription(ship);
  const lore = loreHTML(ship);
  const bp = blueprintHref(ship);
  const omegaText = ship.omegaWhy
    ? `Needs ${esc(ship.omegaWhy.skill)} ${roman(ship.omegaWhy.level)}${ship.omegaWhy.cap ? `, which an Alpha can only train to ${roman(ship.omegaWhy.cap)}` : ', which an Alpha cannot train'}.`
    : 'This hull requires Omega-only skills.';
  const title = `${ship.name} — ${faction} ${cls} | EVE Online Ship Tree | RustyBot`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${ship.name} — ${faction} ${cls}`,
    description: desc,
    url,
    isPartOf: { '@type': 'WebSite', name: 'RustyBot', url: `${SITE}/` },
    primaryImageOfPage: { '@type': 'ImageObject', url: `${IMG}/${ship.id}/render?size=512` },
    about: {
      '@type': 'Product',
      name: ship.name,
      category: `${faction} ${cls}`,
      image: `${IMG}/${ship.id}/render?size=512`,
      description: lore.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || desc,
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Ship Tree', item: `${BASE}/` },
        { '@type': 'ListItem', position: 3, name: ship.name, item: url },
      ],
    },
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" type="image/png" href="https://www.rustybot.co.uk/rusty_bot.png">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#121212">
<meta property="og:type" content="article">
<meta property="og:site_name" content="RustyBot">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(`${ship.name} — ${faction} ${cls} | EVE Online Ship Tree`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${IMG}/${ship.id}/render?size=512">
<meta property="og:image:alt" content="${esc(`${ship.name}, ${faction} ${cls}`)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(`${ship.name} — ${faction} ${cls} | EVE Online Ship Tree`)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${IMG}/${ship.id}/render?size=512">
<link rel="stylesheet" href="../ship-page.css">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>

<header class="site-head">
  <div class="site-head-inner">
    <a class="brand-link" href="https://www.rustybot.co.uk/">
      <img class="brand-logo" src="https://www.rustybot.co.uk/rusty_bot.png" alt="RustyBot logo">
      <span class="brand">Rusty<span class="accent">Bot</span></span>
    </a>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="https://www.rustybot.co.uk/">Home</a>
      <span class="sep">/</span>
      <a href="../../">Ship Tree</a>
      <span class="sep">/</span>
      <span>${esc(ship.name)}</span>
    </nav>
  </div>
</header>

<main>
  <section class="hero">
    <div class="hero-art">
      <img src="${IMG}/${ship.id}/render?size=512" alt="${esc(`${ship.name}, ${faction} ${cls}`)}" width="512" height="512">
    </div>
    <div class="hero-copy">
      <div class="kicker">${esc(faction)} &middot; ${esc(cls)}</div>
      <h1>${esc(ship.name)}</h1>
      <p class="lede">${esc(heroLede(ship))}</p>
      <div class="tags">${tagHTML(ship)}</div>
      <div class="actions">
        <a class="btn primary" href="../../?ship=${ship.id}">Open in ship tree</a>
        <a class="btn" href="https://www.rustybot.co.uk/market/?type=${ship.id}&amp;region=10000002">Market</a>
        <a class="btn" href="https://zkillboard.com/ship/${ship.id}/">zKill</a>
        <a class="btn" href="https://wiki.eveuniversity.org/${encodeURIComponent(ship.name.replace(/ /g, '_'))}">Wiki</a>
        ${bp ? `<a class="btn" href="${bp}">Blueprint</a>` : ''}
      </div>
    </div>
  </section>

  <section class="quick-grid" aria-label="Quick facts">
    <div class="panel">
      <h2>Estimated Jita price</h2>
      <div class="quick-value isk" id="price-sell">fetching&hellip;</div>
      <div class="quick-label">sell percentile</div>
      <div class="muted" id="price-buy">buy &mdash;</div>
      <div class="muted" id="price-volume">market volume &mdash;</div>
    </div>
    <div class="panel">
      <h2>Clone state</h2>
      <div class="quick-value" style="color:${ship.alpha ? 'var(--ok)' : 'var(--omega)'}">${ship.alpha ? 'Alpha' : '&#937; Omega only'}</div>
      <div class="quick-label">${ship.alpha ? 'flyable on a free account' : 'requires Omega'}</div>
      <p class="muted" style="margin:8px 0 0">${ship.alpha ? 'Every prerequisite is within Alpha skill caps.' : omegaText}</p>
    </div>
    <div class="panel">
      <h2>CCP base price</h2>
      <div class="quick-value isk">${ship.basePrice ? isk(ship.basePrice) : '—'}</div>
      <div class="quick-label">reference price, not market</div>
      <p class="muted" style="margin:8px 0 0">${ship.bp ? `Blueprint: ${esc(ship.bp)}.` : 'No blueprint in the SDE.'}</p>
    </div>
  </section>

  <div class="content-grid">
    <section class="panel" aria-labelledby="stats-title">
      <h2 id="stats-title">Hull stats</h2>
      <div class="stat-grid">${statsHTML(ship)}</div>
    </section>
    <section class="panel" aria-labelledby="bonuses-title">
      <h2 id="bonuses-title">Bonuses</h2>
      ${bonusHTML(ship)}
    </section>
  </div>

  <div class="content-grid">
    <section class="panel" aria-labelledby="requirements-title">
      <h2 id="requirements-title">Skill requirements</h2>
      ${requirementsHTML(ship)}
    </section>
    <section class="panel" aria-labelledby="mastery-title">
      <h2 id="mastery-title">Mastery</h2>
      ${masteryHTML(ship)}
    </section>
  </div>

  ${lore ? `<section class="panel" style="margin-top:16px" aria-labelledby="lore-title">
    <h2 id="lore-title">Description</h2>
    <div class="lore">${lore}</div>
  </section>` : ''}

  ${relatedHTML(ship) ? `<section class="panel" style="margin-top:16px" aria-labelledby="related-title">
    <h2 id="related-title">Related hulls</h2>
    ${relatedHTML(ship)}
  </section>` : ''}
</main>

<footer class="site-foot">
  Data: EVE SDE <span id="build">build current</span> &middot; Prices: Fuzzwork Jita aggregates &middot;
  <a href="https://www.rustybot.co.uk/">RustyBot</a> &middot;
  <a href="../../">Ship Tree</a> &middot;
  <a href="../">All ship pages</a>
  <div style="margin-top:6px">EVE Online and the EVE logo are registered trademarks of Fenris Creations. All other trademarks are the property of their respective owners.</div>
</footer>

<script>
(() => {
  const typeId = ${ship.id};
  const fmt = n => {
    if (!n && n !== 0) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B ISK';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M ISK';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K ISK';
    return Math.round(n).toLocaleString() + ' ISK';
  };
  const num = n => Number(n || 0).toLocaleString();

  fetch('https://market.fuzzwork.co.uk/aggregates/?region=10000002&types=' + typeId)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => {
      const p = j[String(typeId)];
      if (!p) throw new Error('no price');
      const sell = Number(p.sell && p.sell.percentile) || 0;
      const buy = Number(p.buy && p.buy.percentile) || 0;
      const sellEl = document.getElementById('price-sell');
      const buyEl = document.getElementById('price-buy');
      const volEl = document.getElementById('price-volume');
      if (sellEl) { sellEl.textContent = fmt(sell); sellEl.title = num(Math.round(sell)) + ' ISK'; }
      if (buyEl) buyEl.textContent = 'buy ' + fmt(buy);
      if (volEl) volEl.textContent = 'market volume ' + num(p.sell && p.sell.volume) + ' sell · ' + num(p.buy && p.buy.volume) + ' buy';
    })
    .catch(() => {
      const el = document.getElementById('price-sell');
      if (el) el.textContent = 'unavailable offline';
    });

  fetch('../../data/version.json?cb=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(v => {
      if (!v) return;
      const el = document.getElementById('build');
      if (el) el.textContent = 'build ' + v.build + (v.generatedAt ? ' · ' + v.generatedAt.slice(0, 10) : '');
    })
    .catch(() => {});
})();
</script>

</body>
</html>`;
}

function indexPageHTML() {
  const byLane = new Map();
  for (const ship of DATA.ships) {
    if (!byLane.has(ship.lane)) byLane.set(ship.lane, []);
    byLane.get(ship.lane).push(ship);
  }
  const sections = DATA.lanes.map(lane => {
    const ships = byLane.get(lane.id) || [];
    if (!ships.length) return '';
    const sorted = ships.slice().sort((a, b) => (rowById.get(a.row)?.name || '').localeCompare(rowById.get(b.row)?.name || '') || a.name.localeCompare(b.name));
    return `<section class="panel" style="margin-top:16px">
      <h2>${esc(lane.name || lane.short)} <span class="muted">(${ships.length})</span></h2>
      <div class="ship-index-grid">${sorted.map(ship => `<a href="${ship.id}-${shipSlug(ship)}/">
        <strong>${esc(ship.name)}</strong>
        <small>${esc(rowById.get(ship.row)?.name || '')}</small>
      </a>`).join('')}</div>
    </section>`;
  }).join('');
  const url = `${BASE}/ship/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EVE Online Ship Pages — Every Hull | RustyBot</title>
<meta name="description" content="Every EVE Online hull, one page each: stats, skills, bonuses, mastery and estimated Jita price. Browse all ${DATA.ships.length} ship pages.">
<link rel="icon" type="image/png" href="https://www.rustybot.co.uk/rusty_bot.png">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#121212">
<link rel="stylesheet" href="ship-page.css">
</head>
<body>
<header class="site-head">
  <div class="site-head-inner">
    <a class="brand-link" href="https://www.rustybot.co.uk/">
      <img class="brand-logo" src="https://www.rustybot.co.uk/rusty_bot.png" alt="RustyBot logo">
      <span class="brand">Rusty<span class="accent">Bot</span></span>
    </a>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="https://www.rustybot.co.uk/">Home</a>
      <span class="sep">/</span>
      <a href="../">Ship Tree</a>
      <span class="sep">/</span>
      <span>Ship Pages</span>
    </nav>
  </div>
</header>
<main>
  <section class="hero" style="grid-template-columns:1fr">
    <div class="hero-copy">
      <div class="kicker">EVE Online &middot; ${DATA.ships.length} hulls</div>
      <h1>Ship pages</h1>
      <p class="lede">Every hull in the game, one page each: stats, skill requirements, bonuses, mastery and estimated Jita price. Open the interactive tree when you want to compare or plan.</p>
      <div class="actions">
        <a class="btn primary" href="../">Open the interactive tree</a>
        <a class="btn" href="../?rows=combat">Combat hulls</a>
        <a class="btn" href="../?rows=industry">Industry hulls</a>
      </div>
    </div>
  </section>
  ${sections}
</main>
<footer class="site-foot">
  Data: EVE SDE <span id="build">build current</span> &middot; Prices: Fuzzwork Jita aggregates &middot;
  <a href="https://www.rustybot.co.uk/">RustyBot</a> &middot;
  <a href="../">Ship Tree</a>
  <div style="margin-top:6px">EVE Online and the EVE logo are registered trademarks of Fenris Creations. All other trademarks are the property of their respective owners.</div>
</footer>
<script>
fetch('../data/version.json?cb=' + Date.now(), { cache: 'no-store' })
  .then(r => r.ok ? r.json() : null)
  .then(v => {
    if (!v) return;
    const el = document.getElementById('build');
    if (el) el.textContent = 'build ' + v.build + (v.generatedAt ? ' · ' + v.generatedAt.slice(0, 10) : '');
  })
  .catch(() => {});
</script>
</body>
</html>`;
}

function updateSitemap() {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) return 0;
  const date = (VERSION.generatedAt || new Date().toISOString()).slice(0, 10);
  const entries = [
    `  <url>\n    <loc>${BASE}/ship/</loc>\n    <lastmod>${date}</lastmod>\n    <priority>0.7</priority>\n  </url>`,
    ...DATA.ships.map(ship => `  <url>\n    <loc>${BASE}/ship/${ship.id}-${shipSlug(ship)}/</loc>\n    <lastmod>${date}</lastmod>\n    <priority>0.6</priority>\n  </url>`),
  ].join('\n');
  const block = `  <!-- shiptree-ship-pages:start -->\n${entries}\n  <!-- shiptree-ship-pages:end -->`;
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  if (/<!-- shiptree-ship-pages:start -->[\s\S]*?<!-- shiptree-ship-pages:end -->/.test(xml)) {
    xml = xml.replace(/  <!-- shiptree-ship-pages:start -->[\s\S]*?  <!-- shiptree-ship-pages:end -->/, block);
  } else {
    xml = xml.replace('</urlset>', `${block}\n</urlset>`);
  }
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  return DATA.ships.length + 1;
}

// ---------------------------------------------------------------- generate

fs.mkdirSync(SHIP_DIR, { recursive: true });
const keep = new Set();
for (const ship of DATA.ships) {
  const dirName = `${ship.id}-${shipSlug(ship)}`;
  keep.add(dirName);
  const dir = path.join(SHIP_DIR, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), pageHTML(ship), 'utf8');
}
fs.writeFileSync(path.join(SHIP_DIR, 'index.html'), indexPageHTML(), 'utf8');

// Remove pages for hulls that no longer exist.
for (const ent of fs.readdirSync(SHIP_DIR, { withFileTypes: true })) {
  if (ent.isDirectory() && /^\d+-/.test(ent.name) && !keep.has(ent.name)) {
    fs.rmSync(path.join(SHIP_DIR, ent.name), { recursive: true, force: true });
  }
}

const sitemapCount = updateSitemap();
console.log(`wrote ${DATA.ships.length} ship pages + index`);
console.log(`updated sitemap.xml with ${sitemapCount} entries`);
