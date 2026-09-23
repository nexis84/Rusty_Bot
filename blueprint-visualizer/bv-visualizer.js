// Blueprint Visualizer V1 — calculator + tree + BOM + handoffs + blueprints/invention/ledger
(function () {
'use strict';
const ESI = 'https://esi.evetech.net/latest';
const D = window.BV_DATA, DEF = D.defaults;
const $ = id => document.getElementById(id);
const fmtISK = n => (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US') + ' ISK';
const fmtN = n => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');
const nameCache = new Map(), priceCache = new Map(), bpCache = new Map();

// ---- CSV export (import is a future feature) ----
function csvEsc(v) { const s = (v === null || v === undefined) ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function escapeHtml(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- toast notifications ----
// Copy actions are easy to miss: the status line is often scrolled out of view
// in the long BOM/shopping tables. A toast puts the confirmation (or failure)
// where the eye already is, and auto-dismisses so it never blocks the UI.
const BV_TOAST_MS = 2600;
function toast(msg, kind, ms) {
  try {
    const wrap = $('toastWrap');
    if (!wrap) { status(msg); return; }
    const k = kind || 'info';
    const el = document.createElement('div');
    el.className = 'bv-toast ' + k;
    el.setAttribute('role', k === 'error' ? 'alert' : 'status');
    const icon = (k === 'error' || k === 'warn') ? 'fa-triangle-exclamation' : 'fa-check-circle';
    el.innerHTML = '<i class="fas ' + icon + '"></i><span>' + escapeHtml(msg) + '</span>';
    wrap.appendChild(el);
    void el.offsetWidth;            // force reflow so the entry transition runs
    el.classList.add('in');
    const kill = () => {
      el.classList.remove('in');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    };
    const timer = setTimeout(kill, ms || BV_TOAST_MS);
    el.addEventListener('click', () => { clearTimeout(timer); kill(); });
  } catch { try { status(msg); } catch {} }
}
// Single place for every clipboard copy, so no copy button can fail silently
// when the browser blocks clipboard access (no permission / insecure context).
// Falls back to a hidden textarea + execCommand, which still works where the
// async Clipboard API is unavailable, so the toast only claims success when
// the text really landed on the clipboard.
async function copyToClipboard(text, okMsg, emptyMsg) {
  if (!text) { toast(emptyMsg || 'Nothing to copy.', 'warn'); return false; }
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, 'success');
    return true;
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    if (ok) { toast(okMsg, 'success'); return true; }
  } catch {}
  toast('Copy failed — your browser blocked clipboard access.', 'error');
  return false;
}
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(csvEsc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBomCSV() {
  const bom = S.bom || [];
  if (!bom.length) { status('Nothing to export — run a calculation first.'); return; }
  const rows = [['type_name', 'type_id', 'quantity', 'unit_price', 'total_price', 'mode']];
  for (const l of bom) rows.push([l.name, l.type_id, l.qty, l.unit, l.total, l.mode]);
  downloadCSV('bv-bom.csv', rows);
  status('Exported BOM (' + bom.length + ' rows) to CSV.');
}
function exportBuildCSV() {
  const agg = S.buildAgg || [];
  if (!agg.length) { status('Nothing to export — set materials to Build first.'); return; }
  const rows = [['material', 'type_id', 'quantity', 'unit_price', 'total_price']];
  for (const a of agg) rows.push([a.name, a.type_id, a.qty, a.unit, a.unit * a.qty]);
  downloadCSV('bv-build-list.csv', rows);
  status('Exported build list (' + agg.length + ' rows) to CSV.');
}
function exportShoppingCSV() {
  const sr = S.shopRows || [];
  if (!sr.length) { status('Nothing to export — run a calculation first.'); return; }
  const rows = [['type_name', 'type_id', 'need', 'have', 'to_buy', 'unit_price', 'total_to_buy']];
  for (const r of sr) rows.push([r.l.name, r.l.type_id, r.l.qty, r.have, r.toBuy, r.unit, r.totalBuy]);
  downloadCSV('bv-shopping-list.csv', rows);
  status('Exported shopping list (' + sr.length + ' rows) to CSV.');
}
// SDE-derived set of every type ID used as a manufacturing/reaction material (bv-materials.js)
const BV_MATERIALS = (() => { try { return new Set((window.BV_MATERIAL_IDS || []).map(Number)); } catch { return new Set(); } })();
const BV_MAT_NAMES = (() => { try { return new Map((window.BV_MATERIAL_NAMES || []).map(([id, n]) => [+id, n])); } catch { return new Map(); } })();
// Backend base URL — mirrors bv-esi-auth.js (BV share/save endpoints live here).
const BV_API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:8080' : 'https://api.rustybot.co.uk';

async function fetchJSON(url, opts, timeout = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(url, { ...opts, signal: c.signal }); clearTimeout(t); if (!r.ok) { if (url.includes('/universe/names') && r.status === 400) return []; throw new Error('HTTP ' + r.status); } const ct = r.headers.get('content-type') || ''; return ct.includes('json') ? r.json() : r.text(); }
  catch (e) { clearTimeout(t); throw e; }
}
function status(m) { $('calcStatus').textContent = m || ''; console.log('[BV]', m); }
function hub() { return $('hubSelect').value || DEF.hub; }
function marketURL(typeId, region) { return '../market/?type=' + typeId + '&region=' + (region || hub()); }
function piURL(typeId) { return '../PI/#view=chain&product=' + typeId; }
function isPI(typeId) {
  try {
    const P = (typeof PI_DATA !== 'undefined' ? PI_DATA : (typeof window !== 'undefined' && window.PI_DATA ? window.PI_DATA : null));
    return !!(P && P.materials && P.materials[String(typeId)]);
  } catch { return false; }
}
function piTier(typeId) {
  try {
    const P = (typeof PI_DATA !== 'undefined' ? PI_DATA : null);
    const m = P && P.materials && P.materials[String(typeId)];
    return m ? ('P' + m.tier) : '';
  } catch { return ''; }
}
function piIcon(typeId) {
  if (!isPI(typeId)) return '';
  return '<a class="pi-link" target="_blank" rel="noopener" href="' + piURL(typeId) + '" title="View ' + piTier(typeId) + ' chain in PI Visualizer"><i class="fas fa-globe"></i></a>';
}
// Blueprint type IDs known from the generated index, so infoButton can hide
// itself for blueprints even when only an id is passed.
function bvIsBlueprintType(typeId) {
  try {
    const t = window.BV_TYPEINFO && window.BV_TYPEINFO.types && window.BV_TYPEINFO.types[String(+typeId)];
    if (!t) return false;
    return /blueprint|bpc/i.test(t.n || '');
  } catch { return false; }
}
// "Item info" button — opens the floating info panel (local SDE → Everef → ESI).
// EVE's in-client openwindow route is deliberately NOT used: CCP's client
// silently ignores it (esi-issues #1349), so we surface the info in-page.
function infoButton(typeId, name) {
  const id = +typeId;
  if (!Number.isFinite(id) || id <= 0) return '';
  // Blueprints have no useful description/stats — no button for them.
  if (/blueprint|bpc/i.test(String(name || '')) || bvIsBlueprintType(id)) return '';
  return '<button type="button" class="game-link" data-info="' + id + '" title="Item info"><img src="icons/showinfo.png" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'"><i class="fas fa-circle-info" style="display:none"></i></button>';
}

// ---- Item info panel (floating, draggable) ----
const infoCache = new Map();
function bvTypeInfoLocal(id) {
  try { return (window.BV_TYPEINFO && window.BV_TYPEINFO.types && window.BV_TYPEINFO.types[String(+id)]) || null; } catch { return null; }
}
function bvInfoName(map, id) {
  try { return (window.BV_TYPEINFO && window.BV_TYPEINFO[map] && window.BV_TYPEINFO[map][String(id)]) || ''; } catch { return ''; }
}
// Resolve a normalised info record: local SDE → Everef → ESI → minimal.
async function typeInfo(id) {
  const key = +id;
  if (infoCache.has(key)) return infoCache.get(key);
  let out = null;
  const local = bvTypeInfoLocal(key);
  if (local) {
    out = {
      id: key, name: local.n || ('Type ' + key), desc: local.d || '',
      group: bvInfoName('groups', local.g) || '', category: bvInfoName('categories', local.c) || '',
      marketGroup: bvInfoName('marketGroups', local.mg) || '',
      volume: local.v, packagedVolume: local.pv, portionSize: local.ps, basePrice: local.bp,
      radius: local.r, mass: local.m, iconID: local.ic, source: 'local SDE',
    };
  }
  if (!out) {
    try {
      const r = await fetchJSON('https://ref-data.everef.net/types/' + key);
      if (r && (r.name || r.type_id)) {
        const nm = (r.name && (r.name.en || Object.values(r.name)[0])) || ('Type ' + key);
        out = {
          id: key, name: nm, desc: (r.description && r.description.en) || '',
          group: '', category: '', marketGroup: '',
          volume: r.volume, packagedVolume: r.packaged_volume, portionSize: r.portion_size, basePrice: r.base_price,
          radius: (r.radius > 0 ? r.radius : undefined), mass: (r.mass > 0 ? r.mass : undefined), iconID: r.icon_id,
          source: 'Everef',
        };
        // Friendly group/category names via Everef (best effort).
        try {
          if (r.group_id) { const g = await fetchJSON('https://ref-data.everef.net/groups/' + r.group_id); if (g && g.name) out.group = (g.name.en || ''); if (g && g.category_id) { const c = await fetchJSON('https://ref-data.everef.net/categories/' + g.category_id); if (c && c.name) out.category = (c.name.en || ''); } }
        } catch {}
      }
    } catch {}
  }
  if (!out) {
    try {
      const t = await fetchJSON(ESI + '/universe/types/' + key + '/');
      out = { id: key, name: t.name || await typeName(key), desc: t.description || '', group: '', category: '', marketGroup: '', volume: t.volume, packagedVolume: t.packaged_volume, portionSize: t.portion_size, basePrice: t.base_price, radius: undefined, mass: undefined, iconID: t.icon_id, source: 'ESI' };
    } catch {}
  }
  if (!out) out = { id: key, name: await typeName(key).catch(() => 'Type ' + key), desc: '', group: '', category: '', marketGroup: '', source: 'minimal' };
  // Auto-link known item names in plain-text descriptions (Everef/ESI fallbacks).
  if (out.desc && !/<a\s/i.test(out.desc)) out.desc = bvLinkifyDescription(out.desc);
  infoCache.set(key, out);
  return out;
}
// Turn plain-text item names into showinfo anchors using the local autocomplete
// index. Conservative: only exact, reasonably long names.
function bvLinkifyDescription(text) {
  try {
    if (!BV_ITEMS.length) return text;
    const names = BV_ITEMS.filter(i => i.name && i.name.length >= 5).map(i => [i.id, i.name]);
    // Build one alternation of escaped names, longest first so substrings don't win.
    names.sort((a, b) => b[1].length - a[1].length);
    const re = new RegExp('\\b(' + names.slice(0, 4000).map(n => escRe(n[1])).join('|') + ')\\b', 'g');
    const byName = new Map(names.map(([id, n]) => [n.toLowerCase(), id]));
    return text.replace(re, (m) => { const id = byName.get(m.toLowerCase()); return id ? '<a href="showinfo:' + id + '">' + m + '</a>' : m; });
  } catch { return text; }
}
function bvFmtNum(v) { return (v === null || v === undefined || isNaN(v)) ? null : Number(v).toLocaleString('en-US'); }
function bvFmtIsk(v) { return (v === null || v === undefined || isNaN(v)) ? null : Number(v).toLocaleString('en-US') + ' ISK'; }
function bvInfoPanelEl() {
  let p = document.getElementById('bvInfoPanel');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'bvInfoPanel';
  p.className = 'panel bv-info-panel';
  p.style.display = 'none';
  document.body.appendChild(p);
  // Click inside: intercept showinfo links (nested browsing).
  p.addEventListener('click', e => {
    if (!e.target.closest) return;
    const a = e.target.closest('a[href^="showinfo:"]');
    if (a) { e.preventDefault(); const cid = +a.getAttribute('href').split(':')[1]; if (cid) openItemInfo(cid); return; }
  });
  // Close button — handled on pointerdown so drag/capture can never swallow it.
  p.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('[data-info-close]')) { e.preventDefault(); e.stopPropagation(); closeInfoPanel(); }
  });
  // Drag by header (never on the close button or other interactive bits).
  p.addEventListener('pointerdown', e => {
    if (!e.target.closest) return;
    if (e.target.closest('[data-info-close]') || e.target.closest('a')) return;
    const head = e.target.closest('.bv-info-head');
    if (!head) return;
    e.preventDefault();
    const rect = p.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    try { p.setPointerCapture(e.pointerId); } catch {}
    const move = ev => {
      const x = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx));
      const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
      p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto';
    };
    const up = ev => {
      p.removeEventListener('pointermove', move); p.removeEventListener('pointerup', up); p.removeEventListener('pointercancel', up);
      try { p.releasePointerCapture(e.pointerId); } catch {}
      try { localStorage.setItem('bvInfoPanelPos', JSON.stringify({ left: p.style.left, top: p.style.top })); } catch {}
    };
    p.addEventListener('pointermove', move); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
  });
  return p;
}
function bvInfoRestorePos() {
  const p = bvInfoPanelEl();
  try {
    const saved = JSON.parse(localStorage.getItem('bvInfoPanelPos') || 'null');
    if (saved && saved.left && saved.top) { p.style.left = saved.left; p.style.top = saved.top; p.style.right = 'auto'; p.style.bottom = 'auto'; return; }
  } catch {}
  // Default: bottom-right.
  p.style.left = 'auto'; p.style.top = 'auto'; p.style.right = '1rem'; p.style.bottom = '1rem';
}
function bvInfoRows(info) {
  const num = bvFmtNum, isk = bvFmtIsk;
  const rows = [];
  const vol = num(info.volume); if (vol !== null) rows.push(['Volume', vol + ' m³']);
  const pv = num(info.packagedVolume); if (pv !== null) rows.push(['Packaged volume', pv + ' m³']);
  const ps = num(info.portionSize); if (ps !== null) rows.push(['Portion size', ps]);
  const bp = isk(info.basePrice); if (bp !== null) rows.push(['Base price', bp]);
  const r = num(info.radius); if (r !== null) rows.push(['Radius', r + ' m']);
  // The SDE uses a 1e23-ish placeholder to mean "no mass" (celestials/asteroids).
  const m = (info.mass != null && info.mass > 0 && info.mass < 1e15) ? num(info.mass) : null; if (m !== null) rows.push(['Mass', m + ' kg']);
  return rows.map(([k, v]) => '<div class="summary-card"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>').join('');
}
async function openItemInfo(idRaw) {
  const id = +idRaw;
  if (!Number.isFinite(id) || id <= 0) return;
  const p = bvInfoPanelEl();
  bvInfoRestorePos();
  p.style.display = '';
  p.innerHTML = '<div class="bv-info-head"><span class="bv-info-title"><span class="hint">Loading…</span></span><button type="button" class="mode-btn" data-info-close title="Close">×</button></div>';
  let info;
  try { info = await typeInfo(id); } catch { info = { id, name: await typeName(id).catch(() => 'Type ' + id), desc: '', source: 'minimal' }; }
  const hubRegion = hub();
  const crumbs = [info.group, info.category, info.marketGroup].filter(Boolean).join(' › ');
  const descHtml = info.desc ? '<div class="bv-info-desc">' + info.desc + '</div>' : '<p class="hint">No description available.</p>';
  p.innerHTML =
    '<div class="bv-info-head">' +
      '<img class="bv-info-icon" src="https://images.evetech.net/types/' + id + '/icon?size=64" alt="" onerror="this.style.display=\'none\'">' +
      '<span class="bv-info-title"><b>' + info.name + '</b>' + (crumbs ? '<span class="hint">' + crumbs + '</span>' : '') + '</span>' +
      '<button type="button" class="mode-btn" data-info-close title="Close">×</button>' +
    '</div>' +
    '<div class="bv-info-body">' + descHtml + '</div>' +
    (bvInfoRows(info) ? '<div class="summary-grid bv-info-stats">' + bvInfoRows(info) + '</div>' : '') +
    '<div class="bv-info-links">' +
      '<a class="mkt-link" target="_blank" rel="noopener" href="https://everef.net/types/' + id + '">Everef</a>' +
      '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(id, hubRegion) + '">Market</a>' +
      '<a class="mkt-link" target="_blank" rel="noopener" href="' + ESI + '/universe/types/' + id + '/">ESI JSON</a>' +
      '<span class="hint bv-info-src">source: ' + info.source + '</span>' +
    '</div>';
}
function closeInfoPanel() { const p = document.getElementById('bvInfoPanel'); if (p) { p.style.display = 'none'; p.innerHTML = ''; } }
// Image-server miss cache: types confirmed icon-less this session skip the
// <img> entirely instead of 404ing on every render.
const bvIconMiss = new Set();
try { window.BVIconMiss = id => { try { bvIconMiss.add(+id); } catch {} }; } catch {}
function bvIconImg(typeId, style) {
  if (bvIconMiss.has(+typeId)) return '';
  return '<img src="https://images.evetech.net/types/' + typeId + '/icon?size=32" loading="lazy" onerror="this.style.display=\'none\';try{window.BVIconMiss&&window.BVIconMiss(' + typeId + ')}catch(e){}"' + (style ? ' style="' + style + '"' : '') + '>';
}
// EVE's image service has no renders for blueprint type IDs (returns 400), so skip their icons.
function iconHTML(typeId, name, style) {
  if (/blueprint|bpc/i.test(String(name || ''))) return '';
  return '<img src="https://images.evetech.net/types/' + typeId + '/icon?size=32" loading="lazy" onerror="this.style.display=\'none\'"' + (style ? ' style="' + style + '"' : '') + '>';
}
function isMineral(typeId) { try { return !!(D.minerals && D.minerals[typeId]); } catch { return false; } }// Ice products (isotopes, ozone, heavy water, strontium) resolve at runtime — see ensureIceProducts.
const iceProductIds = new Set();
let iceOreList = [], iceResolved = false;
async function ensureIceProducts() {
  if (iceResolved) return iceOreList;
  iceResolved = true;
  try {
    const names = (D.iceOres && D.iceOres.length ? D.iceOres : []);
    if (!names.length) return iceOreList;
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify(names) });
    const inv = Array.isArray(r) ? r : (r.inventory_types || []);
    iceOreList = (await Promise.all(inv.map(e => fetchOre(e.id, e.name).catch(() => null)))).filter(Boolean);
    for (const o of iceOreList) for (const mid of Object.keys(o.yields || {})) iceProductIds.add(+mid);
  } catch {}
  return iceOreList;
}
function isMineable(typeId) { try { if (isMineral(typeId)) return true; if (iceProductIds.has(+typeId)) return true; if (typeof BV_MINE_MATS !== 'undefined' && BV_MINE_MATS.has(+typeId)) return true; return false; } catch { return false; } }
function mineIcon(typeId) {
  if (!isMineable(typeId)) return '';
  return '<a class="mine-link" data-mine="' + typeId + '" title="Show mining plan for ' + (D.minerals[typeId] || 'ice product') + '"><i class="fas fa-gem"></i></a>';
}
function appraisalURL(lines, mode) {
  const p = new URLSearchParams(); p.set('items', lines.join('\n')); p.set('mode', mode || 'sell');
  const h = hub(); if (h && h !== 'all') p.set('hub', h);
  return '../appraisal/#' + p.toString();
}
async function typeName(id) {
  if (nameCache.has(id)) return nameCache.get(id);
  try { const t = await fetchJSON(ESI + '/universe/types/' + id + '/'); nameCache.set(id, t.name); return t.name; }
  catch { try { const r = await fetchJSON('https://ref-data.everef.net/types/' + id); nameCache.set(id, r.name || ('Type ' + id)); return nameCache.get(id); } catch { nameCache.set(id, 'Type ' + id); return nameCache.get(id); } }
}
async function marketPrice(typeId, region, basis) {
  const key = typeId + '|' + region + '|' + basis;
  if (priceCache.has(key)) return priceCache.get(key);
  const orderType = basis === 'buy' ? 'buy' : 'sell';
  const orders = await fetchJSON(ESI + '/markets/' + region + '/orders/?type_id=' + typeId + '&order_type=' + orderType);
  if (!orders || !orders.length) { priceCache.set(key, null); return null; }
  const p = basis === 'buy' ? Math.max(...orders.map(o => o.price)) : Math.min(...orders.map(o => o.price));
  priceCache.set(key, p); return p;
}
// Type volumes are static SDE data — cache in memory + localStorage (no TTL)
// and seed from the baked ore table, so volume math never storms ESI twice.
const volCache = new Map();
(function loadVolCache() {
  // NOTE: BV_ORES seeding happens after its definition below (TDZ safe).
  try {
    const saved = JSON.parse(localStorage.getItem('bvVols') || '{}');
    for (const [k, v] of Object.entries(saved || {})) if (!volCache.has(+k)) volCache.set(+k, +v || 0);
  } catch {}
})();
function saveVolCache() {
  try {
    const o = {};
    for (const [k, v] of volCache) o[k] = v;
    localStorage.setItem('bvVols', JSON.stringify(o));
  } catch {}
}
async function typeVolume(id) {
  const key = +id;
  if (volCache.has(key)) return volCache.get(key);
  try { const t = await fetchJSON(ESI + '/universe/types/' + id + '/'); volCache.set(key, t.volume || 0); return t.volume || 0; }
  catch { return 0; }
}
// Sync read of the volume cache — valid after preloadVolumes()/typeVolume()
// have run for the ids. No network, no await.
function typeVolumeCached(id) { const v = volCache.get(+id); return (v === undefined || v === null) ? 0 : v; }
// Batch-preload volumes for a set of type IDs (concurrency 10) so render
// loops below hit cache instead of firing sequential ESI requests.
async function preloadVolumes(ids) {
  const missing = [...new Set((ids || []).map(n => +n).filter(n => Number.isFinite(n) && n > 0 && !volCache.has(n)))];
  if (!missing.length) return;
  for (let i = 0; i < missing.length; i += 10) {
    await Promise.all(missing.slice(i, i + 10).map(async id => { try { await typeVolume(id); } catch {} }));
  }
  saveVolCache();
}

// ---- init selects ----
function fillRange(el, max, def) { el.innerHTML = ''; for (let i = 0; i <= max; i++) { const o = document.createElement('option'); o.value = i; o.textContent = (el.id === 'me' || el.id === 'te') ? i + '%' : i; if (i === def) o.selected = true; el.appendChild(o); } }
function init() {
  $('hubSelect').innerHTML = D.hubs.map(h => '<option value="' + h.region + '">' + h.name + '</option>').join('');
  $('hubSelect').value = DEF.hub;
  $('tracked').innerHTML = '<option value="">— none —</option>' + D.hubs.map(h => '<option value="' + h.region + '">' + h.name + '</option>').join('');
  $('tracked').value = DEF.tracked[0] || '';
  $('structure').innerHTML = D.structures.map(s => '<option value="' + s.id + '">' + s.name + '</option>').join('');
  $('rigs').innerHTML = D.rigs.map((r, i) => '<option value="' + i + '">' + r.label + '</option>').join('');
  $('rigs').value = DEF.rigs;
  $('implant').innerHTML = D.implants.map(x => '<option value="' + x.id + '">' + x.name + '</option>').join('');
  fillRange($('me'), 10, DEF.me); fillRange($('te'), 20, DEF.te);
  fillRange($('indSkill'), 5, DEF.industry); fillRange($('advSkill'), 5, DEF.advIndustry);
  $('basis').value = DEF.pricingBasis; $('reactions').value = DEF.reactions ? 'on' : 'off';
  $('mineShip').innerHTML = D.ships.map(s => '<option value="' + s.id + '">' + s.name + '</option>').join('');
  $('mineShip').value = 'retriever'; $('mineRate').value = 450;
  const _initSec = (parseFloat($('mineRate').value)||450)/60;
  if ($('mineRateSec')) $('mineRateSec').value = (Math.round(_initSec*10)/10).toString();
  $('scc').value = DEF.scc; $('salesTax').value = DEF.salesTax; $('broker').value = DEF.broker; $('jobTax').value = DEF.jobTax;
  // refining yield — migrate old mineEff Reprocess % if present
  try {
    const pEarly = JSON.parse(localStorage.getItem('bvPrefs') || '{}');
    if (pEarly.mineEff !== undefined && pEarly.refinePct === undefined) {
      $('refinePct').value = Math.min(100, Math.max(50, parseFloat(pEarly.mineEff) || 75));
    }
    if (DEF.refinePct !== undefined && !$('refinePct').value) $('refinePct').value = DEF.refinePct;
  } catch {}
  try { const pr = JSON.parse(localStorage.getItem('bvPresets') || '{}'); refreshPresets(pr); } catch {}
  try { const p = JSON.parse(localStorage.getItem('bvPrefs') || '{}'); for (const [k, v] of Object.entries(p)) { const el = $(k); if (!el || v === undefined) continue; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; } } catch {}
  try { S.own = ownRead(); } catch {}
  // ensure refinePct has a sane default if still empty
  try { if (!$('refinePct').value) $('refinePct').value = (DEF.refinePct ?? 75); } catch {}
  // ledger from share link
  if (location.hash.startsWith('#bv=')) { try { const e = JSON.parse(atob(location.hash.slice(4))); if (e && e.bp) { $('bpName').value = e.bp; $('runs').value = e.runs || 1; } } catch {} }
  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); $('tab-' + b.dataset.tab).classList.add('active');
    try { localStorage.setItem('bvActiveTab', b.dataset.tab); } catch {}
    if (b.dataset.tab === 'ledger') { try { renderSavedList(); } catch {} }
  });
  document.querySelectorAll('[data-mainview]').forEach(b => b.onclick = () => { switchMainView(b.dataset.mainview); try { localStorage.setItem('bvActiveView', b.dataset.mainview); } catch {} });
  // Resume preference toggle
  try { if ($('resumeLast')) $('resumeLast').checked = localStorage.getItem('bvResume') !== '0'; } catch {}
  updateSsoBtn(); renderLedger();
}
function savePrefs() {
  const ids = ['hubSelect', 'me', 'te', 'runs', 'indSkill', 'advSkill', 'implant', 'structure', 'rigs', 'jobTax', 'basis', 'reactions', 'scc', 'salesTax', 'broker', 'mfgIndex', 'tracked', 'systemName', 'preset', 'refinePct', 'mineRate', 'mineShip', 'matSource', 'stkAllSystems'];
  const p = {}; ids.forEach(k => { const el = $(k); if (el) p[k] = el.value; });

  try { localStorage.setItem('bvPrefs', JSON.stringify(p)); } catch {}
}
function refreshPresets(pr) { $('preset').innerHTML = '<option value="">— Load saved preset —</option>' + Object.keys(pr).map(k => '<option>' + k + '</option>').join(''); }

// ---- blueprint resolution ----
async function resolveBlueprint(name) {
  const base = name.replace(/\s+/g, ' ').trim();
  const cands = [...new Set([base, base + ' Blueprint', base.replace(/ blueprint$/i, '') + ' Blueprint', base.replace(/ blueprint$/i, '')])];
  const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify(cands) });
  const inv = Array.isArray(r) ? r : (r.inventory_types || []);
  let bp = inv.filter(e => /blueprint/i.test(e.name));
  if (bp.length === 1) return bp[0];
  if (!bp.length && inv.length === 1) {
    const v = [inv[0].name + ' Blueprint'];
    const r2 = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify(v) });
    const inv2 = Array.isArray(r2) ? r2 : (r2.inventory_types || []);
    if (inv2.length === 1) return inv2[0];
  }
  if (bp.length > 1) { const exact = bp.find(e => e.name.toLowerCase() === base.toLowerCase()) || bp.find(e => e.name.toLowerCase() === (base + ' blueprint').toLowerCase()); if (exact) return exact; }
  if (!bp.length) {
    // Fall through to Reaction Formulas (e.g. "Reinforced Carbon Fiber
    // Reaction Formula") — resolved as first-class calculations, not errors.
    const fcands = [...new Set([base, base + ' Reaction Formula', base.replace(/ reaction formula$/i, '') + ' Reaction Formula', base.replace(/ reaction formula$/i, '')])];
    try {
      const fr = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify(fcands) });
      const finv = Array.isArray(fr) ? fr : (fr.inventory_types || []);
      const f = finv.find(e => e.name.toLowerCase() === base.toLowerCase())
        || finv.find(e => e.name.toLowerCase() === (base + ' reaction formula').toLowerCase())
        || finv.filter(e => /reaction formula/i.test(e.name))[0];
      if (f) return { id: f.id, name: f.name, formula: true };
    } catch {}
  }
  throw new Error(bp.length > 1 ? 'Multiple matches (' + bp.map(b => b.name).slice(0, 5).join('; ') + '). Be more specific.' : 'Blueprint not found for "' + name + '"');
}
// Reaction-formula details for top-level formula calculations: reagents +
// products via Everef SDE mirror (Fuzzwork fallback, estimate output ×1).
async function formulaDetails(formulaId) {
  try {
    const b = await fetchJSON('https://ref-data.everef.net/blueprints/' + formulaId);
    const rx = b.activities && (b.activities.reaction || b.activities.reactions);
    const acts = Array.isArray(rx) ? rx[0] : rx;
    if (acts && acts.materials) {
      const reagents = Object.values(acts.materials);
      const products = acts.products ? Object.values(acts.products) : [];
      if (reagents.length) return { reagents, products, time: acts.time || 0, estimate: false };
    }
  } catch {}
  try {
    const fw = await fetchJSON('https://www.fuzzwork.co.uk/blueprint/api/blueprint.php?typeid=' + formulaId);
    const mats = fw.activityMaterials && fw.activityMaterials['11'];
    if (mats && mats.length) return { reagents: mats.map(m => ({ type_id: m.typeid || m.type_id, quantity: m.quantity })), products: [], time: 0, estimate: true };
  } catch {}
  return null;
}
// Baked SDE recipes (bv-blueprints.js): instant offline-capable lookup shaped
// like ESI responses ({activities: {manufacturing: {materials, products}}}).
function bpFromTable(typeId) {
  try {
    const T = (typeof window !== 'undefined' && window.BV_BLUEPRINTS) || null;
    const e = T && T[String(typeId)];
    if (!e || !e.m || !e.m.length) return null;
    return {
      activities: {
        manufacturing: {
          materials: e.m.map(([tid, q]) => ({ type_id: tid, quantity: q })),
          products: (e.p || []).map(([tid, q]) => ({ type_id: tid, quantity: q })),
          time: e.t || 0
        }
      }
    };
  } catch { return null; }
}
async function blueprintData(typeId) {
  if (bpCache.has(typeId)) return bpCache.get(typeId);
  // ESI first (live TQ data), then the baked SDE table (instant; covers the
  // blueprints ESI 404s, e.g. Capital Capacitor Battery 21020), Everef last.
  try { const b = await fetchJSON(ESI + '/universe/blueprints/' + typeId + '/'); bpCache.set(typeId, b); return b; }
  catch (e1) {
    const baked = bpFromTable(typeId);
    if (baked) { bpCache.set(typeId, baked); return baked; }
    const b = await fetchJSON('https://ref-data.everef.net/blueprints/' + typeId); bpCache.set(typeId, b); return b;
  }
}
async function childBlueprint(materialTypeId, materialName) {
  try {
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify([materialName + ' Blueprint']) });
    const inv = Array.isArray(r) ? r : (r.inventory_types || []);
    const m = inv.find(e => e.name.toLowerCase() === (materialName + ' blueprint').toLowerCase());
    if (!m) return null;
    const b = await blueprintData(m.id); const mats = b.activities?.manufacturing?.materials;
    const list = Array.isArray(mats) ? mats : (mats ? Object.values(mats) : null);
    if (!list || !list.length) return null;
    return { bpId: m.id, bpName: m.name, materials: list, products: b.activities.manufacturing.products };
  } catch { return null; }
}

// ---- state ----
const S = { root: null, nodes: new Map(), bom: [], product: null, trackedPrice: null, own: {}, pinnedBuilds: [], pinnedSel: null };
// Pinned builds (max 5, persisted): snapshot {bpId,bpName,mode,runs,children}
// so progress survives reloads and blueprint browsing. Ticks stay per-bpId.
const BV_MAX_PINS = 5;
function bpPinsRead(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    if (v && Array.isArray(v.pins)) return v;
  } catch {}
  return null;
}
function bpPinsLoad() {
  // Primary first, then the backup of the last good state (a corrupt/partial
  // primary write must not nuke pins — explicit unpin-all still saves a
  // valid empty primary, which correctly loads as empty).
  const v = bpPinsRead('bvPinnedBuilds') || bpPinsRead('bvPinnedBuilds.bak');
  if (v) {
    const fromBackup = !bpPinsRead('bvPinnedBuilds');
    S.pinnedBuilds = v.pins.filter(p => p && p.bpId && p.children).slice(0, BV_MAX_PINS);
    S.pinnedSel = v.sel || null;
    if (fromBackup) {
      // Recovered from backup — repair the primary so the next load is direct.
      try { localStorage.setItem('bvPinnedBuilds', JSON.stringify(v)); } catch {}
    }
  }
  if (!Array.isArray(S.pinnedBuilds)) S.pinnedBuilds = [];
}
function bpPinsSave() {
  try {
    // Stash the last good primary as backup BEFORE overwriting, so a bad
    // write here can never destroy the previous pins.
    const prev = bpPinsRead('bvPinnedBuilds');
    if (prev && prev.pins && prev.pins.length) {
      try { localStorage.setItem('bvPinnedBuilds.bak', JSON.stringify(prev)); } catch {}
    }
    localStorage.setItem('bvPinnedBuilds', JSON.stringify({ pins: (S.pinnedBuilds || []).slice(0, BV_MAX_PINS), sel: S.pinnedSel || null },
      // Background-only deep-chain fields (_deep/_deepState) never persist —
      // they bloat localStorage and go stale; re-resolved per session.
      (k, v) => ((k === '_deep' || k === '_deepState') ? undefined : v)));
  } catch {}
}
function bpProgSelPin() {
  const pins = S.pinnedBuilds || [];
  if (!pins.length || S.pinnedSel === 'live') return null;
  if (S.pinnedSel) return pins.find(p => String(p.bpId) === String(S.pinnedSel)) || pins[0];
  return pins[0];
}
// drill-down navigation: breadcrumb trail of {bp, runs}; pendingNeed scales runs on entry
const navStack = [];
let pendingNeed = null;

// ---- main calculate ----
async function calculate(opts) {
  opts = opts || {};
  savePrefs();
  // A new top-level calculation starts a fresh drill-down trail; only
  // Back / crumb / drill navigation keeps the existing one. Without this the
  // breadcrumb keeps showing the previously searched blueprint above the new
  // build (e.g. sending a fit to the calculator).
  if (!opts.fromNav) { try { navStack.length = 0; } catch {} }
  // A fresh calculation always starts from the full material list — removals
  // apply to the build on screen only, never carried to the next blueprint.
  calcRemovedReset();
  // A blueprint calculation belongs in the Calculator view even if Fit Builder is open.
  try { if ($('mainFit') && $('mainFit').style.display !== 'none') switchMainView('calc'); } catch {}
  const name = $('bpName').value.trim(); if (!name) { status('Enter a blueprint name.'); return; }
  let runs = Math.max(1, parseInt($('runs').value) || 1);
  const region = hub(), basis = $('basis').value;
  const meIn = Math.min(10, Math.max(0, parseFloat($('me').value) || 0));
  const st = D.structures.find(s => s.id === $('structure').value) || D.structures[0];
  const rig = D.rigs[parseInt($('rigs').value) || 0] || D.rigs[0];
  const meEff = Math.min(10, meIn + st.meBonus + rig.meBonus);
  const teIn = Math.min(20, Math.max(0, parseFloat($('te').value) || 0));
  const teBonus = teIn + st.teBonus + rig.teBonus;
  const ind = parseInt($('indSkill').value) || 0, adv = parseInt($('advSkill').value) || 0;
  const imp = D.implants.find(i => i.id === $('implant').value) || D.implants[0];
  status('Resolving blueprint…');
  let bpRef; try { bpRef = await resolveBlueprint(name); } catch (e) { status('Lookup failed: ' + e.message); return; }
  const isFormula = !!bpRef.formula;
  let mats = [], prods = [], formulaEstimate = false;
  if (isFormula) {
    // Top-level Reaction Formula: reagents price like materials; ME does not
    // apply to reactions, so per-run quantities are used unreduced.
    status('Fetching reaction formula ' + bpRef.name + ' (' + bpRef.id + ')…');
    let fd = null;
    try { fd = await formulaDetails(bpRef.id); } catch (e) { status('Reaction data unavailable: ' + e.message); return; }
    if (!fd || !fd.reagents.length) { status('Reaction data unavailable for ' + bpRef.name + '.'); return; }
    mats = fd.reagents; prods = fd.products; formulaEstimate = !!fd.estimate;
  } else {
    status('Fetching blueprint ' + bpRef.name + ' (' + bpRef.id + ')…');
    let bp; try { bp = await blueprintData(bpRef.id); } catch (e) { status('Blueprint data unavailable: ' + e.message); return; }
    let bmats = bp.activities?.manufacturing?.materials; bmats = Array.isArray(bmats) ? bmats : (bmats ? Object.values(bmats) : []);
    if (!bmats.length) { status('No manufacturing materials.'); return; }
    mats = bmats;
    let bprods = bp.activities.manufacturing.products; bprods = Array.isArray(bprods) ? bprods : (bprods ? Object.values(bprods) : []);
    prods = bprods;
  }
  const prod = prods[0] || null;
  if (pendingNeed) { runs = Math.max(1, Math.ceil(pendingNeed / ((prod && prod.quantity) || 1))); $('runs').value = runs; pendingNeed = null; }
  S.product = prod ? { type_id: prod.type_id, qty: prod.quantity || 1, name: await typeName(prod.type_id) } : null;
  S.nodes.clear(); S.bom = [];
  S.reactionsOn = ($('reactions').value === 'on');
  // build tree depth 1 (+ async depth 2 lookup, non-blocking for totals)
  S.root = { bpId: bpRef.id, bpName: bpRef.name, mode: isFormula ? 'react' : 'build', children: [] };
  for (const m of mats) {
    const baseQty = m.quantity || 0;
    const perRun = isFormula ? Math.max(0, Math.ceil(baseQty)) : Math.max(0, Math.ceil(baseQty * (1 - meEff / 100)));
    const nm = await typeName(m.type_id);
    S.root.children.push({ type_id: m.type_id, name: nm, baseQty, perRun, mode: 'buy', child: null, unitSell: null, unitBuy: null, childCost: null });
  }
  // Restore persisted Build/Buy/Mine/React toggles for this blueprint.
  const modesRestored = bvModesApply();
  // Fresh blueprints (no saved toggles) start auto-sourced, not all-Buy.
  const modesDefaulted = bvApplyDefaultTops(bpRef.id, S.root.children);
  if (isFormula && formulaEstimate) status('Note: formula output estimated ×1 (Fuzzwork fallback) — reagent math is exact.');
  status('Pricing ' + S.root.children.length + ' materials (' + region + ')…');
  let matCostSell = 0, matCostBuy = 0;
  for (const c of S.root.children) {
    c.unitSell = await marketPrice(c.type_id, region, 'sell');
    c.unitBuy = await marketPrice(c.type_id, region, 'buy');
    if (c.unitSell == null) c.unitSell = c.unitBuy; if (c.unitBuy == null) c.unitBuy = c.unitSell;
    matCostSell += (c.unitSell || 0) * c.perRun; matCostBuy += (c.unitBuy || 0) * c.perRun;
  }
  const matCost = basis === 'buy' ? matCostBuy : matCostSell;
  // fees: job tax on (cost) + scc/broker/sales on output later; mfg index scales job fee
  const jobTax = (parseFloat($('jobTax').value) || 0) / 100, mfgIdx = (parseFloat($('mfgIndex').value) || 4) / 100;
  const feePerRun = matCost * (jobTax + mfgIdx * 0.5);
  // product revenue
  let unitOut = null;
  if (S.product) unitOut = await marketPrice(S.product.type_id, region, 'sell');
  const outQty = (S.product ? S.product.qty : 0) * runs;
  const revenue = (unitOut || 0) * outQty;
  const scc = (parseFloat($('scc').value) || 0) / 100, sales = (parseFloat($('salesTax').value) || 0) / 100, broker = (parseFloat($('broker').value) || 0) / 100;
  const sellFees = revenue * (scc + sales + broker);
  const totalCost = (matCost + feePerRun) * runs;
  const profit = revenue - sellFees - totalCost;
  const roi = totalCost > 0 ? profit / totalCost * 100 : 0;
  // tracked compare
  S.trackedPrice = null;
  const tr = $('tracked').value;
  if (tr && S.product) { try { S.trackedPrice = { region: tr, price: await marketPrice(S.product.type_id, tr, 'sell') }; } catch {} }
  S.bom = effLeafCost(runs);
  const cash = bomCashSplit();
  const totalCash = cash.cash + feePerRun * runs;
  const profitCash = revenue - sellFees - totalCash;
  renderSummary({ bpName: bpRef.name, bpId: bpRef.id, runs, matCostSell, matCostBuy, feePerRun, totalCost, revenue, sellFees, profit, roi, unitOut, outQty, teBonus, imp, ind, adv, totalCash, profitCash, minedValue: cash.mined });
  renderCrumbs(bpRef.name);
  renderTree(runs);
  renderBom(runs);
  if (!opts.noLedger) pushLedger({ ts: Date.now(), bp: bpRef.name, bpId: bpRef.id, runs, cost: Math.round(totalCash), revenue: Math.round(revenue), profit: Math.round(profitCash), hub: region, mined: Math.round(cash.mined) });
  // Remember this view so the next visit resumes exactly here (bp + drill path).
  try { localStorage.setItem('bvLastCalc', JSON.stringify({ state: collectState(), ts: Date.now() })); } catch {}
  // async: resolve sub-blueprints for buildable children
  enrichChildren(runs);
  status('Done. Toggle Build/Buy on sub-components; sub-BOMs resolve in background.' + (modesRestored > 0 ? ' (' + modesRestored + ' saved toggle' + (modesRestored === 1 ? '' : 's') + ' restored.)' : ''));
}

// ---- reactions (refinery formulas, e.g. moon goo) ----
// ESI has no reaction endpoint, so formulas resolve via universe/ids and
// inputs/outputs come from Everef SDE mirror (Fuzzwork as fallback).
const reactCache = new Map();
async function childReaction(materialTypeId, materialName) {
  const key = 'rx' + materialTypeId;
  if (reactCache.has(key)) return reactCache.get(key);
  let out = null;
  try {
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify([materialName + ' Reaction Formula']) });
    const inv = Array.isArray(r) ? r : (r.inventory_types || []);
    const f = inv.find(e => e.name.toLowerCase() === (materialName + ' reaction formula').toLowerCase());
    if (!f) { reactCache.set(key, null); return null; }
    try {
      const b = await fetchJSON('https://ref-data.everef.net/blueprints/' + f.id);
      const rx = b.activities && (b.activities.reaction || b.activities.reactions);
      const acts = Array.isArray(rx) ? rx[0] : rx;
      if (acts && acts.materials) {
        const mats = Object.values(acts.materials);
        const prods = acts.products ? Object.values(acts.products) : [];
        const mine = prods.find(p => p.type_id === materialTypeId) || prods[0];
        if (mine) out = { formulaId: f.id, formulaName: f.name, reagents: mats, productQty: mine.quantity || 1, time: acts.time || 0, estimate: false };
      }
    } catch {}
    if (!out) {
      // Fuzzwork fallback: reaction inputs only, output qty unknown → estimate ×1
      const fw = await fetchJSON('https://www.fuzzwork.co.uk/blueprint/api/blueprint.php?typeid=' + f.id);
      const mats = fw.activityMaterials && fw.activityMaterials['11'];
      if (mats && mats.length) out = { formulaId: f.id, formulaName: f.name, reagents: mats.map(m => ({ type_id: m.typeid || m.type_id, quantity: m.quantity })), productQty: 1, time: 0, estimate: true };
    }
  } catch {}
  reactCache.set(key, out);
  return out;
}
function reactRunsNeeded(c, runs) {
  if (!c.reaction || !c.reaction.productQty) return 0;
  return Math.ceil((c.perRun * (runs || S.runs || 1)) / c.reaction.productQty);
}
// ---- Deep recipe trees (shared by Build List + Evemail) ----
// Recursively resolves manufacturing blueprints + reaction formulas until raw
// inputs (minerals, ice products, PI goods, other mineables). Session-memory
// cache only — pins and localStorage formats are untouched.
const deepCache = new Map(); // typeId -> {kind:'bp'|'rx',label,productQty,materials:[{type_id,quantity,name}]} | null
function deepIsLeaf(typeId) {
  const id = +typeId;
  try { if (isMineral(id)) return true; } catch {}
  try { if (iceProductIds && iceProductIds.has(id)) return true; } catch {}
  try { if (isPI(id)) return true; } catch {}
  // Other mineables (moon goo, gas) have no recipe — skip the wasted lookup.
  // Direct ref (not typeof): TDZ ReferenceError is caught when called pre-eval.
  try { if (BV_MINE_MATS && BV_MINE_MATS.has(id)) return true; } catch {}
  // Types a lookup already proved have no recipe. Without this the row keeps
  // offering an expand chevron that can only ever come back empty.
  try { if (progDeepNone.has(id)) return true; } catch {}
  return false;
}
function deepMatId(m) { try { const v = +(m.type_id ?? m.typeID ?? m.typeid); return Number.isFinite(v) ? v : NaN; } catch { return NaN; } }
function deepMatQty(m) { try { return Math.max(0, (+(m.quantity ?? m.qty ?? 0)) || 0); } catch { return 0; } }
// Whole reaction/manufacturing runs needed for a material need (shared math
// for Progress model, Evemail expander, calculator tree + build list).
function deepBatches(need, productQty) { return Math.max(1, Math.ceil((need || 0) / Math.max(1, productQty || 1))); }
// Row-key scheme shared by the Progress model, calculator tree/build-list
// collapse state, and Evemail tick checks. trail = full type path from the
// top-level material down to the row's own type (depth+1 entries).
function progKey(ci, trail, depth, rx) {
  try {
    const t = (trail || []).map(Number);
    if (depth <= 0) return 'c' + ci + ':' + t[0];
    if (depth === 1) return (rx ? 'r' : 'g') + ci + ':' + t[t.length - 1];
    return 'd' + ci + ':' + t.join('>');
  } catch { return 'x' + ci + ':' + depth; }
}
// Pricer for deep nodes (names come from deepResolve; units stay lazy).
async function deepPriceUnits(node) {
  try {
    const basis = ($('basis') && $('basis').value) || 'sell';
    for (const sm of ((node && node.materials) || [])) {
      if (sm.unit == null) { try { sm.unit = (await marketPrice(sm.type_id, hub(), basis)) || 0; } catch { sm.unit = 0; } }
    }
  } catch {}
}
async function deepResolve(typeId, name, trail, forceRx) {
  const id = +typeId;
  if (!Number.isFinite(id) || id <= 0) return null;
  if (deepIsLeaf(id)) return null;
  trail = trail || [];
  if (trail.indexOf(id) >= 0) return null; // cycle guard (A→B→A)
  if (deepCache.has(id)) return deepCache.get(id);
  let node = null;
  try {
    const kid = await childBlueprint(id, name);
    if (kid && kid.materials && kid.materials.length) {
      const prodQty = (kid.productQty) || (kid.products && kid.products[0] && kid.products[0].quantity) || 1;
      node = { kind: 'bp', label: kid.bpName, productQty: prodQty || 1,
        materials: kid.materials.map(m => ({ type_id: deepMatId(m), quantity: deepMatQty(m), name: m.name || null })).filter(m => Number.isFinite(m.type_id) && m.type_id > 0) };
      if (!node.materials.length) node = null;
    }
  } catch {}
  const rxOn = !!forceRx || !((typeof S !== 'undefined') && S && S.reactionsOn === false);
  if (!node && rxOn) {
    try {
      const rx = await childReaction(id, name);
      if (rx && rx.reagents && rx.reagents.length) {
        node = { kind: 'rx', label: rx.formulaName, productQty: rx.productQty || 1,
          materials: rx.reagents.map(r => ({ type_id: deepMatId(r), quantity: deepMatQty(r), name: r.name || null })).filter(m => Number.isFinite(m.type_id) && m.type_id > 0) };
        if (!node.materials.length) node = null;
      }
    } catch {}
  }
  if (node) {
    // Fill display names now (mail + tree need names; pricing stays with the consumer).
    for (const m of node.materials) {
      if (!m.name) { try { m.name = await typeName(m.type_id); } catch { m.name = 'Type ' + m.type_id; } }
    }
  }
  deepCache.set(id, node);
  return node;
}
// Seed the deep cache from already-enriched depth-1 data (avoids re-fetching
// universe/ids for materials the calculation resolved). Live refs — background
// enrichment filling in names lands in the cache too.
function deepSeedFrom(src) {
  try {
    const rxOn = !((typeof S !== 'undefined') && S && S.reactionsOn === false);
    for (const c of ((src && src.children) || [])) {
      if (!c || !Number.isFinite(+c.type_id)) continue;
      const id = +c.type_id;
      if (deepCache.has(id) || deepIsLeaf(id)) continue;
      if (c.child && c.child.materials && c.child.materials.length) {
        const prodQty = c.child.productQty || (c.child.products && c.child.products[0] && c.child.products[0].quantity) || 1;
        deepCache.set(id, { kind: 'bp', label: c.child.bpName, productQty: prodQty || 1, materials: c.child.materials });
      } else if (rxOn && c.reaction && c.reaction.reagents && c.reaction.reagents.length) {
        deepCache.set(id, { kind: 'rx', label: c.reaction.formulaName, productQty: c.reaction.productQty || 1, materials: c.reaction.reagents });
      }
    }
  } catch {}
}
// Session guard so the top-level retry pass runs once per type (explicit
// on-demand clicks bypass it).
const progDeepTopTries = new Map(); // src -> Map(typeId -> failed attempts)
const progDeepNone = new Set(); // typeIds confirmed to have no sub-materials
// Resolve ONE top-level child into enrichChildren-compatible c.child /
// c.reaction shapes (names + units + margins). forceRx bypasses the Reactions
// toggle for on-demand display (costing untouched — modes don't change).
async function progDeepResolveTop(c, forceRx) {
  if (!c || !Number.isFinite(+c.type_id) || deepIsLeaf(+c.type_id)) return false;
  const id = +c.type_id;
  if (c.child || (c.mode === 'react' && c.reaction)) return true;
  if (forceRx) {
    try { deepCache.delete(id); } catch {}
    try { reactCache.delete('rx' + id); } catch {}
  }
  let node = null;
  try { node = await deepResolve(id, c.name, [], !!forceRx); } catch {}
  if (!node || !node.materials || !node.materials.length) {
    try { c._tried = true; c._rxTried = true; } catch {}
    return false;
  }
  try { await deepPriceUnits(node); } catch {}
  if (node.kind === 'bp') {
    let sub = 0;
    for (const m of node.materials) sub += (m.unit || 0) * Math.ceil(deepMatQty(m));
    let outP = 0;
    try { outP = (await marketPrice(id, hub(), 'sell')) || 0; } catch {}
    c.child = { bpName: node.label, subCost: sub, outPrice: outP, margin: outP - sub, materials: node.materials, productQty: node.productQty || 1, products: [] };
    try { c._tried = true; } catch {}
  } else {
    const perRunCost = node.materials.reduce((s, m) => s + (m.unit || 0) * deepMatQty(m), 0);
    let outP = c.unitSell;
    if (outP == null) { try { outP = (await marketPrice(id, hub(), 'sell')) || 0; } catch { outP = 0; } }
    const unitCost = perRunCost / Math.max(1, node.productQty || 1);
    c.reaction = { formulaId: null, formulaName: node.label, reagents: node.materials, productQty: node.productQty || 1, time: 0, estimate: false, perRunCost, unitCost, margin: (outP || 0) - unitCost };
    try { c._rxTried = true; } catch {}
  }
  try { if (typeof bpProgRefreshPin === 'function') bpProgRefreshPin(); } catch {}
  return true;
}
// Locate a material object inside a tracked build for on-demand resolution.
// path = typeIds from the depth-1 material down to the target (inclusive).
function progFindMaterial(src, ci, path) {
  try {
    const c = src && src.children && src.children[ci];
    if (!c || !path || !path.length) return null;
    let mats = (c.child && c.child.materials) || (c.reaction && c.reaction.reagents) || [];
    let m = null;
    for (const tid of path) {
      m = (mats || []).find(x => +deepMatId(x) === +tid) || null;
      if (!m) return null;
      mats = (m._deep && m._deep.materials) || [];
    }
    return m;
  } catch { return null; }
}
async function enrichChildren(runs) {
  S.runs = runs;
  const rxOn = S.reactionsOn;
  for (const c of S.root.children) {
    if (c.include === false) continue; // Fit Builder: excluded items aren't resolved
    if (!c.child && !c._tried) {
      // raw minerals, ice products and PI goods are never manufactured — don't waste lookups on them
      if (isMineable(c.type_id) || isPI(c.type_id)) { c._tried = true; continue; }
      c._tried = true;
      const kid = await childBlueprint(c.type_id, c.name);
      if (kid) {
        let sub = 0;
        for (const m of kid.materials) {
          const q = Math.ceil((m.quantity || 0));
          const p = await marketPrice(m.type_id, hub(), $('basis').value);
          if (!m.name) { try { m.name = await typeName(m.type_id); } catch {} }
          m.unit = p || 0;
          sub += (p || 0) * q;
        }
        const outP = await marketPrice(c.type_id, hub(), 'sell');
        const prodQty = (kid.products && kid.products[0] && kid.products[0].quantity) || 1;
        c.child = { bpName: kid.bpName, subCost: sub, outPrice: outP, margin: (outP || 0) - sub, materials: kid.materials, productQty: prodQty, products: kid.products };
        // Fresh default: untouched rows flip to Build as recipes land.
        if (c.mode === 'buy' && !bvHasStoredTop(S.root.bpId, c.type_id)) { c.mode = 'build'; try { bvModesSave(); } catch {} }
        bpProgRefreshPin();
        renderTree(runs);
        renderBuildList(runs);
      }
    }
    if (rxOn && !c.reaction && !c._rxTried) {
      c._rxTried = true;
      const rx = await childReaction(c.type_id, c.name);
      if (rx) {
        for (const rg of rx.reagents) {
          rg.name = await typeName(rg.type_id);
          rg.unit = await marketPrice(rg.type_id, hub(), $('basis').value);
        }
        const perRunCost = rx.reagents.reduce((s, rg) => s + (rg.unit || 0) * rg.quantity, 0);
        const unitCost = perRunCost / Math.max(1, rx.productQty);
        const outP = (c.unitSell != null ? c.unitSell : await marketPrice(c.type_id, hub(), 'sell')) || 0;
        c.reaction = { ...rx, perRunCost, unitCost, margin: outP - unitCost };
        // Fresh default: untouched rows flip to React as formulas land.
        if (c.mode === 'buy' && !bvHasStoredTop(S.root.bpId, c.type_id)) { c.mode = 'react'; try { bvModesSave(); } catch {} }
        bpProgRefreshPin();
        renderTree(runs);
      }
    }
    // Lookups finished: an item with neither a manufacturing blueprint nor a
    // reaction formula can't be built or reacted, so a defaulted Build/React
    // falls back to Buy. Explicit user choices are left alone.
    try {
      const hasBp = !!(c.child && c.child.materials && c.child.materials.length);
      const hasRx = !!(c.reaction && c.reaction.reagents && c.reaction.reagents.length);
      if ((c.mode === 'build' || c.mode === 'react') && !hasBp && !hasRx && !bvHasStoredTop(S.root.bpId, c.type_id)) {
        c.mode = 'buy';
        try { bvModesSave(); } catch {}
        if (S.lastCalc && S.lastCalc.fit) { try { fitPersistModes(); } catch {} try { fitSchedule(); } catch {} }
        bpProgRefreshPin();
        renderTree(runs);
      }
    } catch {}
  }
  const nRx = S.root.children.filter(c => c.reaction).length;
  renderBom(runs);
  status('Done. Toggle Build/Buy' + (nRx ? '/React' : '') + ' on sub-components' + (nRx ? ' (' + nRx + ' reaction' + (nRx > 1 ? 's' : '') + ' found)' : '') + '.');
  // Deep chains for the live root (calculator tree + build list) as well as
  // the tracked build — the no-arg call below covers whichever is tracked.
  try { bpProgDeepEnrich(S.root); } catch {}
  try { bpProgDeepEnrich(); } catch {}
}

// ---- Build Progress deep chains ----
// Background BFS resolving nested manufacturing/reaction inputs for a build
// (live S.root or a pin), storing _deep nodes on material objects.
// bpProgModel picks them up on every render (progressive fill); pins strip
// _deep on save so localStorage stays lean (re-resolved per session).
const BV_PROG_DEEP_MAX = 500;
const progDeepActive = new Set(); // src objects currently enriching
function progDeepMats(children) {
  const out = [];
  for (const c of (children || [])) {
    if (!c) continue;
    if (c.child && c.child.materials) for (const m of c.child.materials) out.push(m);
    if (c.reaction && c.reaction.reagents) for (const rg of c.reaction.reagents) out.push(rg);
  }
  return out;
}
// Re-render every surface showing deep chains. Live surfaces (calculator
// tree, build list) only refresh when the enriched build is the live root.
function progDeepRerender(live) {
  try { renderBuildProgress(); } catch {}
  try { if (typeof fitSchedule === 'function') fitSchedule(); } catch {}
  if (!live) return;
  try { renderTree(S.runs || 1); } catch {}
  try {
    if (typeof renderBuildList === 'function') {
      const r = renderBuildList(S.runs || 1);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }
  } catch {}
}
async function bpProgDeepEnrich(forcedSrc) {
  const src = forcedSrc || ((typeof bpProgSource === 'function') ? bpProgSource() : null);
  if (!src || !src.children) return;
  if (progDeepActive.has(src)) return;
  progDeepActive.add(src);
  const live = (typeof S !== 'undefined') && src === S.root;
  try {
    try { deepSeedFrom(src); } catch {}
    // 0) Top-level children missing depth-1 data entirely (the RCF case:
    // pinned before enrichment, transient lookup failure, or rx-off at
    // calc time). Attempts are counted per source ONLY when a resolve
    // actually fails, so a slow/raced first attempt still gets retried on a
    // later pass. Capped at 3; after that the row keeps its manual
    // "Resolve sub-materials" chevron instead of silently staying dead.
    try {
      const triesFor = src => { let m = progDeepTopTries.get(src); if (!m) { m = new Map(); progDeepTopTries.set(src, m); } return m; };
      const tries = triesFor(src);
      const tops = (src.children || []).filter(c => c && !c.child && !(c.mode === 'react' && c.reaction)
        && Number.isFinite(+c.type_id) && (tries.get(+c.type_id) || 0) < 3 && !deepIsLeaf(+c.type_id));
      for (let i = 0; i < tops.length; i += 5) {
        const slice = tops.slice(i, i + 5);
        const rs = await Promise.all(slice.map(c => progDeepResolveTop(c, false).catch(() => false)));
        let flipped = false;
        slice.forEach((c, ix) => {
          if (!rs[ix]) tries.set(+c.type_id, (tries.get(+c.type_id) || 0) + 1);
          if (!rs[ix] || c.mode !== 'buy' || bvHasStoredTop(src.bpId, c.type_id)) return;
          if (c.child) c.mode = 'build';
          else if (c.reaction) c.mode = 'react';
          else return;
          flipped = true;
        });
        if (flipped && live) { try { bvModesSave(); } catch {} }
        if (rs.some(Boolean) || flipped) progDeepRerender(live);
      }
    } catch {}
    let done = 0, changed = false;
    let frontier = progDeepMats(src.children);
    while (frontier.length && done < BV_PROG_DEEP_MAX) {
      // Group by type so shared sub-materials resolve once, attach everywhere.
      const byTid = new Map();
      for (const m of frontier) {
        const tid = deepMatId(m);
        if (!Number.isFinite(tid) || tid <= 0 || (m && (m._deep || m._deepState === 'pending'))) continue;
        if (deepIsLeaf(tid)) continue;
        if (deepCache.has(tid)) {
          try {
            const node = deepCache.get(tid);
            if (node && node.materials) await deepPriceUnits(node);
            m._deep = node || null; m._deepState = 'done';
          } catch { try { m._deep = null; m._deepState = 'done'; } catch {} }
          changed = true;
          continue;
        }
        if (!byTid.has(tid)) byTid.set(tid, []);
        byTid.get(tid).push(m);
      }
      const groups = [...byTid.entries()];
      if (!groups.length && !changed) break;
      if (changed) { progDeepRerender(live); changed = false; }
      if (!groups.length) break;
      const next = [];
      for (let i = 0; i < groups.length; i += 5) {
        const slice = groups.slice(i, i + 5);
        await Promise.all(slice.map(async ([tid, mats]) => {
          const first = mats[0];
          try { for (const m of mats) { try { m._deepState = 'pending'; } catch {} } } catch {}
          try {
            const node = await deepResolve(tid, (first && first.name) || ('Type ' + tid), []);
            done++;
            if (node && node.materials && node.materials.length) await deepPriceUnits(node);
            for (const m of mats) { try { m._deep = (node && node.materials && node.materials.length) ? node : null; m._deepState = 'done'; } catch {} }
            try { if (node && node.materials && node.materials.length) progDeepNone.delete(tid); else progDeepNone.add(tid); } catch {}
            if (node && node.materials) for (const sm of node.materials) next.push(sm);
          } catch {
            for (const m of mats) { try { m._deep = null; m._deepState = 'done'; } catch {} }
          }
        }));
      }
      progDeepRerender(live);
      frontier = next;
    }
  } finally {
    try { progDeepActive.delete(src); } catch {}
    progDeepRerender(live);
  }
}

function effLeafCost(runs) {
  // Recursive roll-up: every node resolves by its own mode. Build/react
  // nodes expand into their recipe (children resolve by THEIR toggles);
  // buy/mine nodes are leaves. Output is aggregated leaf lines
  // {type_id,name,qty,unit,total,mode} — same shape as before, so every
  // consumer (BOM table, shopping, mining, multibuy, refinery) keeps working.
  const agg = new Map();
  const leaf = (tid, name, qty, mode, unit) => {
    if (!Number.isFinite(+tid) || +tid <= 0 || !(qty > 0)) return;
    const k = tid + '|' + mode;
    const e = agg.get(k);
    if (e) {
      // A later occurrence with a real price must win over an earlier unpriced
      // one — deep sub-materials can resolve with unit 0 when ESI has no quote,
      // and keeping that 0 would zero the whole merged line's total.
      if (!e.unit && unit) e.unit = unit;
      e.qty += qty;
      e.total = e.unit * e.qty;
    }
    else agg.set(k, { type_id: +tid, name, qty, unit: unit || 0, total: (unit || 0) * qty, mode });
  };
  const walk = (tid, name, fullNeed, node, ci, trail, depth, rxKind, unit) => {
    if (!(fullNeed > 0)) return;
    if (depth > 12) { leaf(tid, name, Math.floor(fullNeed), 'buy', unit); return; }
    const key = progKey(ci, trail.concat([+tid]), depth, rxKind);
    const hasBp = !!(node && node.kind === 'bp' && node.materials && node.materials.length);
    const hasRx = !!(node && node.kind === 'rx' && node.materials && node.materials.length);
    let mineable = false;
    try { mineable = isMineable(+tid); } catch {}
    const eff = deepModeFor(key, { hasBp, hasRx, mineable });
    if (eff === 'mine' || eff === 'extract') { leaf(tid, name, Math.floor(fullNeed), eff, unit); return; }
    let use = null, useRx = false;
    if (eff === 'build' && hasBp) use = node;
    else if (eff === 'react' && hasRx) { use = node; useRx = true; }
    if (!use) { leaf(tid, name, Math.floor(fullNeed), 'buy', unit); return; }
    const batches = deepBatches(fullNeed, use.productQty);
    for (const sm of (use.materials || [])) {
      const stid = deepMatId(sm);
      if (!Number.isFinite(stid) || stid <= 0) continue;
      const sqty = Math.floor(deepMatQty(sm) * batches);
      if (sqty <= 0) continue;
      walk(stid, sm.name || ('Type ' + stid), sqty, sm._deep || null, ci, trail.concat([+tid]), depth + 1, useRx || (sm._deep && sm._deep.kind === 'rx'), sm.unit);
    }
  };
  try {
    if (!S.root || !S.root.children) return [];
    (S.root.children || []).forEach((c, ci) => {
      if (!c) return;
      if (c.include === false) return; // Fit Builder: item excluded from the fit
      const need = c.perRun * runs;
      if (!(need > 0)) return;
      const u = ($('basis') && $('basis').value === 'buy' ? c.unitBuy : c.unitSell) || 0;
      let node = null;
      if (c.mode === 'build' && c.child && c.child.materials && c.child.materials.length) {
        node = { kind: 'bp', productQty: c.child.productQty || 1, materials: c.child.materials };
      } else if (c.mode === 'react' && c.reaction && c.reaction.reagents && c.reaction.reagents.length) {
        node = { kind: 'rx', productQty: c.reaction.productQty || 1, materials: c.reaction.reagents };
      }
      if (c.mode === 'mine' || c.mode === 'extract') { leaf(c.type_id, c.name, need, c.mode, u); return; }
      if (!node) { leaf(c.type_id, c.name, need, 'buy', u); return; }
      const batches = deepBatches(need, node.productQty);
      for (const m of node.materials) {
        const tid = deepMatId(m);
        if (!Number.isFinite(tid) || tid <= 0) continue;
        const qty = Math.floor(deepMatQty(m) * batches);
        if (qty <= 0) continue;
        walk(tid, m.name || ('Type ' + tid), qty, m._deep || null, ci, [+c.type_id], 1, node.kind === 'rx', m.unit);
      }
    });
  } catch {}
  return [...agg.values()];
}

// cash vs mined/extracted split of the current BOM: mined + extracted lines
// cost no ISK out of pocket (both tracked separately with opportunity value)
function bomCashSplit() {
  let cash = 0, mined = 0, extracted = 0;
  for (const l of (S.bom || [])) {
    if (l.mode === 'mine') mined += l.total || 0;
    else if (l.mode === 'extract') extracted += l.total || 0;
    else cash += l.total || 0;
  }
  return { cash, mined, extracted };
}

function renderSummary(s) {
  S.lastCalc = s;
  try { fitCalcNoteRender(); } catch {}
  if (s && s.fit) { const g = $('summaryGrid'); if (g) { g.style.display = 'grid'; g.innerHTML = fitSummaryHtml(); } return; }
  const g = $('summaryGrid'); g.style.display = 'grid';
  const brokName = (D.hubs.find(h => h.region === hub()) || {}).name || hub();
  let tracked = '';
  if (S.trackedPrice && S.trackedPrice.price) {
    const tn = (D.hubs.find(h => h.region === S.trackedPrice.region) || {}).name || S.trackedPrice.region;
    tracked = '<div class="summary-card"><div class="k">Output @ ' + tn + '</div><div class="v">' + fmtISK(S.trackedPrice.price * s.outQty) + '</div></div>';
  }
  // mode-aware cash totals: mined minerals + extracted PI are excluded from out-of-pocket cost
  const split = bomCashSplit();
  const totalCash = split.cash + s.feePerRun * s.runs;
  const profitCash = s.revenue - s.sellFees - totalCash;
  const roiCash = totalCash > 0 ? profitCash / totalCash * 100 : 0;
  const selfMade = (split.mined || 0) + (split.extracted || 0);
  const profitFull = profitCash - selfMade;
  const roiFull = (totalCash + selfMade) > 0 ? profitFull / (totalCash + selfMade) * 100 : 0;
  const minedNote = (split.mined > 0 ? ' · excl. ' + fmtISK(split.mined) + ' mined' : '') + (split.extracted > 0 ? ' · excl. ' + fmtISK(split.extracted) + ' extracted' : '');
  const oppNote = selfMade > 0 ? ' · valuing self-made: ' + fmtISK(profitFull) + ' (' + roiFull.toFixed(1) + '%)' : '';
  g.innerHTML =
    '<div class="summary-card"><div class="k">Total cost (' + s.runs + 'x)</div><div class="v">' + fmtISK(totalCash) + '</div><div class="k">' + fmtISK(totalCash / Math.max(1, s.runs)) + '/run' + minedNote + '</div></div>' +
    '<div class="summary-card"><div class="k">Output revenue ' + brokName + '</div><div class="v">' + fmtISK(s.revenue) + '</div><div class="k">' + fmtN(s.outQty) + 'x @ ' + fmtISK(s.unitOut) + '</div></div>' +
    '<div class="summary-card"><div class="k">Net profit</div><div class="v ' + (profitCash >= 0 ? 'green' : 'red') + '">' + fmtISK(profitCash) + '</div><div class="k">ROI ' + roiCash.toFixed(1) + '% · fees ' + fmtISK(s.sellFees) + oppNote + '</div></div>' +
    '<div class="summary-card"><div class="k">Blueprint</div><div class="v" style="font-size:.85rem">' + s.bpName + '</div><div class="k">TE bonus ' + s.teBonus.toFixed(0) + '% · Industry ' + s.ind + '/' + s.adv + ' · ' + s.imp.name + '</div></div>' + tracked;
}

// ---- main content views (Calculator vs Build Progress vs Fit Builder) ----
function switchMainView(v) {
  v = (v === 'prog' || v === 'fit') ? v : 'calc';
  try {
    $('mainCalc').style.display = v === 'calc' ? '' : 'none';
    $('mainProg').style.display = v === 'prog' ? '' : 'none';
    if ($('mainFit')) $('mainFit').style.display = v === 'fit' ? '' : 'none';
    document.querySelectorAll('[data-mainview]').forEach(b => b.classList.toggle('active', (b.dataset.mainview || 'calc') === v));
    if (v === 'prog') { renderBuildProgress(); try { bpProgDeepEnrich(); } catch {} }
    if (v === 'fit') { try { fitRenderAll(); } catch {} }
  } catch {}
}
// Jump the main content pane back to the top — used when loading a new build
// so the user lands on the summary/tree rather than mid-list.
function scrollContentTop() {
  try {
    const el = document.querySelector('.content-scroll');
    if (el) el.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  } catch {
    try { const el = document.querySelector('.content-scroll'); if (el) el.scrollTop = 0; } catch {}
  }
}
// ---- drill-down navigation (breadcrumb trail) ----
function renderCrumbs(current) {
  const bar = $('crumbBar');
  if (!S.root) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  let h = '<button class="crumb-back" data-nav="back"' + (navStack.length ? '' : ' disabled') + '><i class="fas fa-arrow-left"></i> Back</button>';
  navStack.forEach((e, i) => { h += '<button class="crumb-link" data-nav="crumb" data-i="' + i + '">' + e.bp + '</button><span class="crumb-sep">›</span>'; });
  h += '<span class="crumb-current">' + current + '</span>';
  h += '<button class="mode-btn" data-sendbuild style="margin-left:auto" title="Pin this blueprint to the Build Progress tab"><i class="fas fa-paper-plane"></i> Send to Build process</button>';
  bar.innerHTML = h;
}
function drillNavFail(e) {
  const msg = e && e.message ? e.message : String(e || 'unknown error');
  try { status('Drill-down failed: ' + msg); } catch {}
  try { toast('Drill-down failed — ' + msg, 'error', 5000); } catch {}
  try { console.error('[bv] drill-down failed', e); } catch {}
}
function drillCalc(opts) {
  // calculate() is async and does network lookups; without a catch a rejection
  // here surfaced as a click that appeared to do nothing at all.
  try { return Promise.resolve(calculate(opts)).catch(drillNavFail); } catch (e) { drillNavFail(e); return Promise.resolve(); }
}
function drillDown(i) {
  const c = S.root && S.root.children[i];
  if (!c) { try { status('Cannot open that item — it is no longer in the build.'); } catch {} return; }
  if (!c.child) {
    try { status('No manufacturing blueprint for ' + (c.name || 'that item') + ' — build it as a raw material instead.'); } catch {}
    try { toast('No blueprint to open for ' + (c.name || 'that item'), 'warn'); } catch {}
    return;
  }
  navStack.push({ bp: $('bpName').value.trim(), runs: parseInt($('runs').value) || 1 });
  if (navStack.length > 12) navStack.shift();
  $('bpName').value = c.child.bpName;
  pendingNeed = c.perRun * (S.runs || 1);
  status('Opening ' + c.child.bpName + ' (need ' + fmtN(pendingNeed) + ')…');
  drillCalc({ fromNav: true });
}
function goBack() {
  const prev = navStack.pop();
  if (!prev) return;
  $('bpName').value = prev.bp; $('runs').value = prev.runs;
  pendingNeed = null;
  drillCalc({ fromNav: true });
}
function goCrumb(i) {
  const target = navStack[i];
  if (!target) return;
  navStack.length = i;
  $('bpName').value = target.bp; $('runs').value = target.runs;
  pendingNeed = null;
  drillCalc({ fromNav: true });
}

// Canonical toggle order everywhere: Buy, Build, Mine, React, Extract
// (absent modes omitted, so Buy is always first — matches the Buy All /
// Build All toolbar). Pure string builder.
function topModeButtons(c, i, rxBtn) {
  const buyBtn = '<button class="mode-btn ' + (c.mode === 'buy' ? 'on-buy' : '') + '" data-i="' + i + '" data-m="buy">Buy</button>';
  if (isMineable(c.type_id)) return buyBtn + '<button class="mode-btn ' + (c.mode === 'mine' ? 'on-mine' : '') + '" data-i="' + i + '" data-m="mine"><i class="fas fa-gem"></i> Mine it</button>';
  if (isPI(c.type_id)) return buyBtn + '<button class="mode-btn ' + (c.mode === 'extract' ? 'on-extract' : '') + '" data-i="' + i + '" data-m="extract"><i class="fas fa-globe"></i> Extract</button>';
  // No Build offered once the lookup has come back empty — you can't build
  // what has no blueprint. Kept visible while the lookup is still pending.
  let h = buyBtn;
  try {
    const hasBp = !!(c.child && c.child.materials && c.child.materials.length);
    const pending = c.child === null && !c._tried;
    if (hasBp || pending) h += '<button class="mode-btn ' + (c.mode === 'build' ? 'on-build' : '') + '" data-i="' + i + '" data-m="build">Build</button>';
  } catch {}
  return h + (rxBtn || '');
}
// Expand state for calculator breakdowns (tree + build list share it;
// Build Progress keeps its own set so views don't fight). Calculator starts
// COLLAPSED — rows expand on click (opposite default to Progress).
const calcExpanded = new Set();
// Items the user removed from the current build's list. Deliberately
// session-only and in-memory: a removal applies to the calculation on screen
// and is forgotten the moment a different build is calculated, so a part you
// dropped from one blueprint never silently disappears from the next.
// Restorable via the "Restore removed" bar above the tree.
function calcRemovedRead() { return Array.isArray(S.calcRemoved) ? S.calcRemoved : []; }
function calcRemovedWrite(list) { S.calcRemoved = Array.isArray(list) ? list.map(Number).filter(n => n > 0) : []; return S.calcRemoved; }
function calcRemovedAdd(typeId) {
  const list = calcRemovedRead();
  if (!list.includes(+typeId)) list.push(+typeId);
  return calcRemovedWrite(list);
}
function calcRemovedReset() { calcRemovedWrite([]); }
// Remove one top-level item from the live build and everything derived from it.
function calcRemoveItem(i) {
  if (!S.root || !Array.isArray(S.root.children)) return;
  const c = S.root.children[i];
  if (!c) return;
  const name = c.name || ('Type ' + c.type_id);
  calcRemovedAdd(c.type_id);
  // Deliberately does NOT touch the fit's persistent include store: that store
  // belongs to the include checkboxes, which are the explicit "keep this
  // choice" control. The X is a one-off for the build on screen.
  c.include = false;
  removeChildAt(S.root, i);
  try { S._deepModes = null; } catch {}
  try { calcExpanded.clear(); } catch {}
  S.bom = effLeafCost(1);
  renderTree(S.runs || 1);
  try { renderBom(S.runs || 1); } catch {}
  try { renderBuildList(S.runs || 1); } catch {}
  try { if (S.lastCalc) renderSummary(S.lastCalc); } catch {}
  try { const p = renderShoppingList(S.runs || 1); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch {}
  try { bpProgRefreshPin(); } catch {}
  try { renderBuildProgress(); } catch {}
  try { fitRefresh(); } catch {}
  status('Removed ' + name + ' from the list.');
  try { if (S.lastCalc && S.lastCalc.fit) fitStatus('Removed ' + name + ' from the fit.'); } catch {}
}
// Restoring rebuilds the list from scratch — removals are session-only, so
// there is no stored set to simply put back.
async function calcRestoreRemoved() {
  if (!calcRemovedRead().length) { status('Nothing to restore.'); return; }
  // A pin may be showing a shorter list than the calculation; re-pin after the
  // rebuild so Build Progress matches. bpId survives, so it reuses the slot.
  const pinBpId = (() => { const p = bpProgSelPin(); return p ? p.bpId : null; })();
  calcRemovedReset();
  if (S.lastCalc && S.lastCalc.fit) {
    const t = ($('fitPaste') && $('fitPaste').value) || '';
    if (t) { await calculateFit(); if (pinBpId) bpProgPinCurrent(true); renderBuildProgress(); return; }
  }
  if (S.root && $('bpName') && $('bpName').value.trim()) {
    await calculate();
    if (pinBpId) bpProgPinCurrent(true);
    renderBuildProgress();
    return;
  }
  status('Removed items restored.');
}
// Wipe the live calculation and every panel that renders from it, returning the
// Calculator to its empty state. Pinned builds (Build Progress) and the saved
// fit paste are left alone — only the working calculation is cleared.
function calcResetAll() {
  S.root = null; S.nodes = new Map(); S.bom = []; S.product = null;
  S.trackedPrice = null; S.own = {}; S.lastCalc = null; S.runs = 1;
  S.fitEnriching = false;
  S._deepModes = null; S._deepModesBp = null;
  try { navStack.length = 0; } catch {}
  try { calcExpanded.clear(); } catch {}
  try { bpProgLastSrc = null; } catch {}
  try { fitInCalculator = false; } catch {}
  try { fitCalcNoteRender(); } catch {}
  try { fitProgressHide(); } catch {}
  const emptyRow = '<tr><td colspan="7" style="color:var(--text3)">No calculation yet.</td></tr>';
  const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  const txt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };
  hide('summaryGrid'); hide('crumbBar'); hide('shoppingSummary');
  set('treeWrap', ''); set('refineryWrap', ''); set('mineWrap', '');
  set('bomBody', '<tr><td colspan="8" style="color:var(--text3)">No calculation yet.</td></tr>');
  set('shoppingBody', emptyRow);
  txt('bomMeta', ''); txt('bomTotals', ''); txt('shopMeta', ''); txt('shoppingTotals', '');
  txt('buildMeta', ''); txt('buildTotals', '');
  set('buildList', '<p class="hint">No calculation yet — calculate a blueprint or send a fit.</p>');
  if ($('bpName')) $('bpName').value = '';
  if ($('runs')) $('runs').value = 1;
  if ($('systemName')) $('systemName').value = 'Jita';
  try { renderBuildProgress(); } catch {}
  status('Cleared.');
}
// Removing a top-level row shifts every later child index by one, and tick
// keys embed that index. Rebase saved ticks so the remaining rows keep the
// ticks the user already set. 'bpx:' blueprint ticks carry no index, so the
// pattern deliberately doesn't match them.
function bpProgRebaseTicks(bpId, removedCi) {
  try {
    const store = 'bvBuildProg_' + bpId;
    const m = JSON.parse(localStorage.getItem(store) || '{}');
    if (!m || typeof m !== 'object') return;
    const out = {};
    let moved = 0;
    for (const k of Object.keys(m)) {
      const mt = k.match(/^([cgrd])(\d+):([\s\S]*)$/);
      if (!mt) { out[k] = m[k]; continue; }
      const ci = parseInt(mt[2], 10);
      if (ci > removedCi) { out[mt[1] + (ci - 1) + ':' + mt[3]] = m[k]; moved++; }
      else out[k] = m[k];
    }
    if (moved) localStorage.setItem(store, JSON.stringify(out));
  } catch {}
}
// Splice a child out of a build root and rebase its saved ticks.
function removeChildAt(src, ci) {
  if (!src || !Array.isArray(src.children)) return null;
  const c = src.children[ci];
  if (!c) return null;
  src.children.splice(ci, 1);
  if (src.bpId) bpProgRebaseTicks(src.bpId, ci);
  return c;
}
// Remove one item from the build Build Progress is tracking. When that build
// is also live in the Calculator (a sent fit, or a pinned-then-edited
// blueprint) the live list is kept in step so the two views can't diverge.
function progRemoveItem(ci) {
  const src = bpProgSource();
  if (!src || !Array.isArray(src.children)) return;
  const c = src.children[ci];
  if (!c) return;
  if (src === S.root) { calcRemoveItem(ci); return; }
  const name = c.name || 'item';
  // Always record, so the "Restore removed" bar can offer an undo on a pin too.
  calcRemovedAdd(c.type_id);
  if (S.root && S.root !== src && String(S.root.bpId) === String(src.bpId) && (S.root.children || [])[ci]) {
    S.root.children.splice(ci, 1);
    try { S._deepModes = null; } catch {}
    try { calcExpanded.clear(); } catch {}
    S.bom = effLeafCost(1);
    try { renderTree(S.runs || 1); } catch {}
    try { renderBom(S.runs || 1); } catch {}
    try { renderBuildList(S.runs || 1); } catch {}
    try { if (S.lastCalc) renderSummary(S.lastCalc); } catch {}
    try { fitRefresh(); } catch {}
  }
  removeChildAt(src, ci);
  bpPinsSave();
  try { bpProgLastSrc = null; } catch {}
  renderBuildProgress();
  status('Removed ' + name + ' from the build.');
}
function renderTree(runs) {
  const w = $('treeWrap'); if (!S.root) { w.innerHTML = ''; return; }
  const piKids = S.root.children.filter(c => isPI(c.type_id));
  // Recursive display-only breakdowns: deep rows show prices but no toggles
  // (toggles stay top-level only).
  const renderTreeDeep = (mats, parentFull, productQty, depth, trail, ci, rx) => {
    const batches = deepBatches(parentFull, productQty);
    return mats.map(m => {
      const tid = deepMatId(m);
      if (!Number.isFinite(tid) || tid <= 0) return '';
      const qty = Math.max(0, Math.floor(deepMatQty(m) * batches));
      if (qty <= 0) return '';
      const nm = m.name || ('Type ' + tid);
      const sub = m._deep;
      const pend = !sub && m._deepState === 'pending';
      const hasKids = !!(sub && sub.materials && sub.materials.length) || pend;
      const key = progKey(ci, trail.concat([tid]), depth, rx);
      const open = calcExpanded.has(key);
      const unit = m.unit || 0;
      const dinfo = { hasBp: !!(sub && sub.kind === 'bp' && sub.materials && sub.materials.length), hasRx: !!(sub && sub.kind === 'rx' && sub.materials && sub.materials.length), mineable: isMineable(tid) };
      const dcur = deepModeFor(key, dinfo);
      const kids = (sub && sub.materials && sub.materials.length && open)
        ? '<div class="kids">' + renderTreeDeep(sub.materials, qty, sub.productQty || 1, depth + 1, trail.concat([tid]), ci, sub.kind === 'rx') + '</div>'
        : ((pend && open) ? '<div class="kids"><div class="rx-row prow"><span class="nm" style="color:var(--text3)">resolving sub-materials…</span></div></div>' : '');
      return '<div class="rx-row prow"><img src="https://images.evetech.net/types/' + tid + '/icon?size=32" onerror="this.style.display=\'none\'"><span class="nm">' + nm + ' × ' + fmtN(qty) + '</span>'
        + '<span class="row-tail"><span class="nums">' + fmtISK(unit) + ' ea</span><span class="nums">' + fmtISK(unit * qty) + '</span>'
        + '<span class="mode-toggle">' + deepModeButtons(key, dcur, dinfo) + '</span>'
        + (hasKids ? '<button class="mode-btn" data-tree-exp="' + key + '" title="' + (open ? 'Collapse' : 'Expand') + '"><i class="fas fa-chevron-' + (open ? 'up' : 'down') + '"></i></button>' : '')
        + '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(tid) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + piIcon(tid) + mineIcon(tid) + infoButton(tid) + '</span></div>' + kids;
    }).join('');
  };
  // "Restore removed" bar — only when this build actually has removals saved.
  let removedN = 0;
  try { removedN = calcRemovedRead().length; } catch {}
  let h = (piKids.length ? '<div class="pi-banner"><i class="fas fa-globe" style="color:#3fb950"></i><span>This build uses <b>' + piKids.length + ' PI material' + (piKids.length > 1 ? 's' : '') + '</b> (' + piKids.slice(0, 3).map(c => c.name).join(', ') + (piKids.length > 3 ? ', …' : '') + '). Plan them in our <a target="_blank" rel="noopener" href="' + piURL(piKids[0].type_id) + '">PI Visualizer</a></span></div>' : '') +
    (removedN ? '<div class="removed-bar"><i class="fas fa-trash-restore"></i><span><b>' + removedN + ' item' + (removedN === 1 ? '' : 's') + '</b> removed from this list.</span><button class="mode-btn" data-tree-restore="1" title="Bring the removed items back"><i class="fas fa-undo"></i> Restore removed</button></div>' : '') +
    '<div class="tree-node build"><div class="row1">' + (S.product ? iconHTML(S.product.type_id, S.product.name) : '') + '<span class="nm">' + S.root.bpName + ' × ' + runs + '</span>' + (S.root.mode === 'react' ? '<span class="pill react">REACT</span>' : '<span class="pill build">BUILD</span>') + '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(S.root.bpId) + '" title="Price check blueprint"><i class="fas fa-chart-line"></i></a>' + infoButton(S.root.bpId) + (S.product ? '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(S.product.type_id) + '" title="Price check product"><i class="fas fa-box"></i></a>' + piIcon(S.product.type_id) + infoButton(S.product.type_id) : '') + '</div><div class="kids">';
  S.root.children.forEach((c, i) => {
    const m = c.child ? (c.child.margin >= 0 ? '<span class="margin-pos">build margin +' + fmtISK(c.child.margin) + '</span>' : '<span class="margin-neg">build margin ' + fmtISK(c.child.margin) + '</span>') : (c.child === null && c._tried ? '' : '<span class="nums">checking build…</span>');
    const rm = c.reaction ? (c.reaction.margin >= 0 ? '<span class="margin-pos">react margin +' + fmtISK(c.reaction.margin) + '/u</span>' : '<span class="margin-neg">react margin ' + fmtISK(c.reaction.margin) + '/u</span>') + (c.reaction.estimate ? '<span class="nums" title="Output quantity estimated">est</span>' : '') : '';
    const rxBtn = c.reaction ? '<button class="mode-btn ' + (c.mode === 'react' ? 'on-react' : '') + '" data-i="' + i + '" data-m="react" title="' + c.reaction.formulaName + '">React</button>' : '';
    const topNeed = c.perRun * runs;
    const topKey = progKey(i, [+c.type_id], 0, false);
    const hasBreakdown = !!((c.child && c.child.materials && c.child.materials.length) || (c.reaction && c.reaction.reagents && c.reaction.reagents.length));
    const topOpen = calcExpanded.has(topKey);
    let rxKids = '', buildKids = '';
    // Mirror the Progress model branches (child first, then reaction) so the
    // calculator tree shows the same breakdowns in every mode. Built only
    // when expanded — the tree starts collapsed.
    if (hasBreakdown && topOpen) {
      if (c.child && c.child.materials && c.child.materials.length) {
        buildKids = '<div class="kids">' + renderTreeDeep(c.child.materials, topNeed, c.child.productQty || 1, 1, [+c.type_id], i, false) + '</div>';
      } else if (c.reaction && c.reaction.reagents && c.reaction.reagents.length) {
        const n = reactRunsNeeded(c);
        rxKids = '<div class="kids">' + renderTreeDeep(c.reaction.reagents, topNeed, c.reaction.productQty || 1, 1, [+c.type_id], i, true) + '</div>'
          + '<div class="rx-note">' + c.reaction.formulaName + ' · ×' + fmtN(c.reaction.productQty) + ' per run · ' + n + ' run' + (n === 1 ? '' : 's') + ' for ' + fmtN(c.perRun * runs) + ' needed</div>';
      }
    }
    const drillable = c.child && !(S.lastCalc && S.lastCalc.fit);
    const nmHtml = drillable
      ? '<a class="drill nm" data-drill="' + i + '" title="Open full build for ' + c.child.bpName + '">' + c.name + ' × ' + fmtN(c.perRun * runs) + ' <i class="fas fa-chevron-right" style="font-size:.7em"></i></a>'
      : '<span class="nm">' + c.name + ' × ' + fmtN(c.perRun * runs) + '</span>';
    h += '<div class="tree-node ' + c.mode + '"><div class="row1 prow"><img src="https://images.evetech.net/types/' + c.type_id + '/icon?size=32" onerror="this.style.display=\'none\'">' + nmHtml + '<span class="row-tail"><span class="nums">' + fmtISK((($('basis').value === 'buy' ? c.unitBuy : c.unitSell) || 0)) + ' ea</span><span class="nums">' + m + rm + '</span><span class="mode-toggle">' + topModeButtons(c, i, rxBtn) + '</span>' + (hasBreakdown ? '<button class="mode-btn" data-tree-exp="' + topKey + '" title="' + (topOpen ? 'Collapse breakdown' : 'Expand breakdown') + '"><i class="fas fa-chevron-' + (topOpen ? 'up' : 'down') + '"></i></button>' : '') + '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(c.type_id) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + piIcon(c.type_id) + mineIcon(c.type_id) + infoButton(c.type_id) + (isPI(c.type_id) ? '<span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(c.type_id) + '</span>' : '') + '<button class="mode-btn tree-remove" data-tree-rm="' + i + '" title="Remove ' + escapeHtml(c.name) + ' from this list"><i class="fas fa-xmark"></i></button></span></div>' + rxKids + buildKids + '</div>';
  });
  w.innerHTML = h + '</div></div>';
  w.querySelectorAll('[data-tree-rm]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); calcRemoveItem(+b.dataset.treeRm); });
  w.querySelectorAll('[data-tree-restore]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); calcRestoreRemoved(); });
  w.querySelectorAll('.mode-btn[data-m]').forEach(b => b.onclick = async () => {
    const idx = +b.dataset.i, mode = b.dataset.m;
    const c = S.root.children[idx];
    if (!c) return;
    // Cascade through the whole section: Buy pins the subtree to Buy, any
    // other mode auto-sources it (mine/react/extract/build by type).
    // Per-row tweaks can still override afterwards.
    try { await bulkApplyToTop(c, idx, mode === 'buy' ? 'buy' : 'auto', mode); } catch {}
    try { bvModesSave(); } catch {}
    try { if (S.lastCalc && S.lastCalc.fit) fitPersistModes(); } catch {}
    renderTree(runs); await renderBom(runs); await renderBuildList(runs); if (S.lastCalc) renderSummary(S.lastCalc);
    try { bpProgRefreshPin(); } catch {}
    try { renderBuildProgress(); } catch {}
    // auto-update mining plan in the background when sourcing changes — do NOT switch tabs or steal focus
    try { planMining(undefined, { auto: true }); } catch {}
  });
  w.querySelectorAll('[data-tree-exp]').forEach(b => b.onclick = () => {
    const k = b.dataset.treeExp;
    if (calcExpanded.has(k)) calcExpanded.delete(k); else calcExpanded.add(k);
    renderTree(runs);
  });
  bindDeepModeButtons(w);
}

// Persisted Build/Buy/Mine/React toggles per blueprint — restored on every
// calculate so drill-down/back, recalc, pin switches and reloads keep intent.
// Top-level modes key by type ID; DEEP (sub-component) modes key by row path
// ('g0:901', 'd0:900>901>34') so they survive object rebuilds. Only
// non-default modes are stored; stale entries are ignored on restore.
const BV_MODES_MAX_BP = 20;
function bvModesRead() { try { const v = JSON.parse(localStorage.getItem('bvModes') || '{}'); return (v && typeof v === 'object') ? v : {}; } catch { return {}; } }
function bvModesWrite(m) { try { localStorage.setItem('bvModes', JSON.stringify(m || {})); } catch {} }
// In-memory working map for the current blueprint (top typeIds + deep paths).
function deepModeMap() {
  try {
    const bp = String((S.root && S.root.bpId) || '');
    if (!S._deepModes || S._deepModesBp !== bp) {
      S._deepModesBp = bp;
      const entry = bvModesRead()[bp];
      S._deepModes = (entry && typeof entry === 'object') ? Object.assign({}, entry) : {};
    }
    return S._deepModes;
  } catch { return {}; }
}
// Effective mode for a deep node: stored toggle (validated against what
// recipes actually exist), else recipe default (buildable → build,
// reaction-only → react, raw → buy). Extract validates on PI goods only
// (parsed from the key so callers don't thread flags).
function bvModePiOf(key) {
  try {
    const tid = +String(key || '').split('>').pop().split(':').pop();
    return isPI(tid);
  } catch { return false; }
}
function deepModeFor(key, info) {
  const hasBp = !!(info && info.hasBp), hasRx = !!(info && info.hasRx);
  let mineable = !!(info && info.mineable);
  if (!mineable) { try { mineable = isMineable(+String(key || '').split('>').pop().split(':').pop()); } catch {} }
  let m = null;
  try { m = deepModeMap()[key]; } catch {}
  if (m === 'build' && hasBp) return 'build';
  if (m === 'react' && hasRx) return 'react';
  if (m === 'mine' && mineable) return 'mine';
  if (m === 'extract' && bvModePiOf(key)) return 'extract';
  if (m === 'buy') return 'buy';
  if (hasBp) return 'build';
  if (hasRx) return 'react';
  try { if (mineable) return 'mine'; } catch {}
  if (bvModePiOf(key)) return 'extract';
  return 'buy';
}
// Blueprint-level bulk sourcing: 'buy' sets EVERYTHING (all depths) to Buy;
// 'auto' (Build All) sources in-house by type — mineable→Mine, reaction→
// React, PI→Extract, blueprint→Build, else Buy. Per-row toggles still
// override afterwards. Unresolved rows: buy-all pins them Buy; auto skips
// them so recipe defaults (same mapping) apply on resolve.
async function bulkSetModes(kind) {
  if (!S.root || !S.root.children || !S.root.children.length) { status('Run a calculation first.'); return; }
  status(kind === 'buy' ? 'Setting everything to Buy…' : 'Auto-sourcing everything (mine/react/extract/build)…');
  try {
    const ciOf = new Map(S.root.children.map((c, i) => [c, i]));
    for (const c of S.root.children) {
      if (!c) continue;
      await bulkApplyToTop(c, ciOf.get(c), kind);
    }
    try { bvModesSave(); } catch {}
    try { if (S.lastCalc && S.lastCalc.fit) fitPersistModes(); } catch {}
    try { renderTree(S.runs || 1); } catch {}
    try { await renderBom(S.runs || 1); } catch {}
    try { await renderBuildList(S.runs || 1); } catch {}
    try { if (S.lastCalc) renderSummary(S.lastCalc); } catch {}
    try { bpProgRefreshPin(); } catch {}
    try { renderBuildProgress(); } catch {}
    try { planMining(undefined, { auto: true }); } catch {}
    status(kind === 'buy' ? 'Everything set to Buy — override any row as needed.' : 'Everything auto-sourced — override any row as needed.');
  } catch (e) {
    status('Bulk set failed: ' + (e && e.message ? e.message : e));
  }
}
// Apply a bulk kind to ONE top-level child + its whole subtree.
// 'buy' pins everything Buy (including unresolved rows); 'auto' sources by
// type (mine/react/extract/build) and skips unresolved rows so recipe
// defaults (same mapping) apply when they resolve. An explicit topMode
// (user's click) is never recomputed — only the subtree is mapped.
async function bulkApplyToTop(c, ci, kind, topMode) {
  if (!c) return;
  const map = deepModeMap();
  const autoTop = async c => {
    try {
      if (isMineable(+c.type_id)) return 'mine';
      if (isPI(+c.type_id)) return 'extract';
      if (c.child) return 'build';
      if (c.reaction && S.reactionsOn !== false) return 'react';
      const node = await deepResolve(+c.type_id, c.name, []);
      if (node && node.kind === 'bp') return 'build';
      if (node && node.kind === 'rx' && S.reactionsOn !== false) return 'react';
    } catch {}
    return 'buy';
  };
  const autoDeep = (tid, sub) => {
    try {
      if (isMineable(tid)) return 'mine';
      if (isPI(tid)) return 'extract';
      if (sub && sub.kind === 'bp') return 'build';
      if (sub && sub.kind === 'rx' && S.reactionsOn !== false) return 'react';
    } catch {}
    return null; // unknown yet — leave unset so defaults apply on resolve
  };
  c.mode = (kind === 'buy') ? 'buy' : (topMode || await autoTop(c));
  const rec = (mats, trail, depth, rx) => {
    for (const m of (mats || [])) {
      const tid = deepMatId(m);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      const key = progKey(ci, trail.concat([tid]), depth, rx);
      if (kind === 'buy') {
        try { map[key] = 'buy'; } catch {}
      } else {
        const sub = m._deep;
        const want = autoDeep(tid, sub);
        if (want) { try { map[key] = want; } catch {} }
      }
      const sub = m._deep;
      if (sub && sub.materials) rec(sub.materials, trail.concat([tid]), depth + 1, sub.kind === 'rx');
    }
  };
  const srcm = (c.child && c.child.materials) ? c.child.materials : ((c.reaction && c.reaction.reagents) || []);
  rec(srcm, [+c.type_id], 1, !!(c.reaction && !(c.child && c.child.materials)));
}
// Set a deep toggle and refresh every costing surface.
async function deepModeSet(key, mode) {
  try { deepModeMap()[key] = mode; bvModesSave(); } catch {}
  try { renderTree(S.runs || 1); } catch {}
  try { await renderBom(S.runs || 1); } catch {}
  try { await renderBuildList(S.runs || 1); } catch {}
  try { if (S.lastCalc) renderSummary(S.lastCalc); } catch {}
  try { renderBuildProgress(); } catch {}
  if (mode === 'mine' || mode === 'buy' || mode === 'extract') {
    try {
      const tid = +String(key || '').split('>').pop().split(':').pop();
      if (mode === 'mine' || mode === 'extract') { try { planMining(undefined, { auto: true }); } catch {} }
      else if (Number.isFinite(tid) && isMineable(tid)) { try { planMining(undefined, { auto: true }); } catch {} }
    } catch {}
  }
}
// Toggle buttons for one deep row. info: {hasBp, hasRx, mineable}.
// Always offers Buy; Build/React/Mine only where valid. Empty when the row
// is a plain buy leaf with no options.
function deepModeButtons(key, cur, info) {
  if (!info) info = {};
  if (bvModePiOf(key)) {
    const on = m => cur === m ? ' on-' + m : '';
    return '<button class="mode-btn' + on('buy') + '" data-dkey="' + key + '" data-dm="buy">Buy</button>'
      + '<button class="mode-btn' + on('extract') + '" data-dkey="' + key + '" data-dm="extract">Extract</button>';
  }
  if (!info.hasBp && !info.hasRx && !info.mineable) return '';
  const on = m => cur === m ? ' on-' + m : '';
  const btn = (m, label) => '<button class="mode-btn' + on(m) + '" data-dkey="' + key + '" data-dm="' + m + '">' + label + '</button>';
  if (info.mineable) return btn('buy', 'Buy') + btn('mine', '<i class="fas fa-gem"></i> Mine');
  let h = btn('buy', 'Buy');
  if (info.hasBp) h += btn('build', 'Build');
  if (info.hasRx) h += btn('react', 'React');
  return h;
}
function bindDeepModeButtons(box) {
  if (!box || !box.querySelectorAll) return;
  box.querySelectorAll('[data-dkey]').forEach(b => b.onclick = async () => {
    try { await deepModeSet(b.dataset.dkey, b.dataset.dm); }
    catch (e) { try { status('Toggle failed: ' + (e && e.message ? e.message : e)); } catch {} }
  });
}
function bvModesSave() {
  try {
    if (!S.root || !S.root.bpId || !S.root.children) return;
    const key = String(S.root.bpId);
    const all = bvModesRead();
    const prev = (all[key] && typeof all[key] === 'object') ? all[key] : {};
    const entry = {};
    for (const c of S.root.children) {
      if (c && Number.isFinite(+c.type_id) && c.mode && c.mode !== 'buy') entry[c.type_id] = c.mode;
    }
    // Preserve path-keyed deep toggles (contain ':') from memory or store.
    const src = (S._deepModesBp === key && S._deepModes) ? S._deepModes : prev;
    for (const k of Object.keys(src)) {
      if (k.indexOf(':') >= 0 && src[k]) entry[k] = src[k];
    }
    delete all[key]; // re-insert for recency
    if (Object.keys(entry).length) all[key] = entry;
    for (const k of Object.keys(all).slice(0, Math.max(0, Object.keys(all).length - BV_MODES_MAX_BP))) delete all[k];
    bvModesWrite(all);
  } catch {}
}
function bvModesApply() {
  try {
    if (!S.root || !S.root.bpId || !S.root.children) return 0;
    const entry = bvModesRead()[String(S.root.bpId)] || {};
    let n = 0;
    for (const c of S.root.children) {
      const m = entry[c.type_id];
      if (m !== 'build' && m !== 'buy' && m !== 'mine' && m !== 'react' && m !== 'extract') continue;
      if (m === 'react' && !S.reactionsOn) continue;
      if (m === 'mine') { try { if (!isMineable(c.type_id)) continue; } catch {} }
      if (m === 'extract') { try { if (!isPI(c.type_id)) continue; } catch {} }
      if (c.mode !== m) { c.mode = m; n++; }
    }
    return n;
  } catch { return 0; }
}
// Auto-source default for a top-level child with no stored toggle:
// mineable→Mine, PI→Extract, resolved child→Build, resolved reaction→React,
// else Buy (flips to Build/React later when recipes resolve).
function bvAutoTopMode(c) {
  try {
    if (isMineable(+c.type_id)) return 'mine';
    if (isPI(+c.type_id)) return 'extract';
    if (c.child) return 'build';
    if (c.reaction && S.reactionsOn !== false) return 'react';
  } catch {}
  return 'buy';
}
function bvHasStoredTop(bpId, tid) {
  try {
    const e = bvModesRead()[String(bpId)] || {};
    return e[tid] !== undefined;
  } catch { return false; }
}
// Apply defaults to tops lacking stored toggles (fresh blueprints start
// sourced, not all-Buy). Returns count changed.
function bvApplyDefaultTops(bpId, children) {
  let n = 0;
  try {
    for (const c of (children || [])) {
      if (!c || bvHasStoredTop(bpId, c.type_id)) continue;
      const m = bvAutoTopMode(c);
      if (c.mode !== m) { c.mode = m; n++; }
    }
  } catch {}
  return n;
}
// per-item "used own" toggle — persisted; unchecked BOM lines are bought in full regardless of inventory
function ownRead() { try { return JSON.parse(localStorage.getItem('bvOwnSet') || 'null') || {}; } catch { return {}; } }
function ownUse(typeId) { return S.own[typeId] === undefined ? true : !!S.own[typeId]; }
function ownSet(typeId, val) { S.own[typeId] = !!val; try { localStorage.setItem('bvOwnSet', JSON.stringify(S.own)); } catch {} }
// Owned-material flags are kept in localStorage so they survive reloads and
// inventory re-scans; this is the explicit way to wipe them.
function ownClearAll() {
  const n = Object.keys(S.own || {}).length;
  S.own = {};
  try { localStorage.removeItem('bvOwnSet'); } catch {}
  try { if (S.root) { const r = S.runs || 1; renderBom(r); } } catch {}
  status(n ? 'Cleared ' + n + ' owned-material flag' + (n === 1 ? '' : 's') + '.' : 'No owned-material flags to clear.');
}
function ownCell(l) {
  const usable = (l.mode === 'buy' || l.mode === 'react');
  return usable
    ? '<label title="Use owned materials for this item (deduct from inventory)" style="cursor:pointer"><input type="checkbox" data-own="' + l.type_id + '"' + (ownUse(l.type_id) ? ' checked' : '') + '></label>'
    : '<input type="checkbox" disabled checked style="opacity:.35" title="Not bought — own flag not applicable">';
}
// Bill of Materials section order — raw industry inputs first, manufactured
// items after, mirroring the Evemail grouping. Empty sections are skipped, so
// a build only ever shows the headings it actually has.
const BOM_SECTIONS = [
  { key: 'minerals', title: 'Minerals' },
  { key: 'ice', title: 'Ice Products' },
  { key: 'pi4', title: 'PI — P4' },
  { key: 'pi3', title: 'PI — P3' },
  { key: 'pi2', title: 'PI — P2' },
  { key: 'pi1', title: 'PI — P1' },
  { key: 'pi0', title: 'PI — P0' },
  { key: 'gas', title: 'Gas & Fullerenes' },
  { key: 'moon', title: 'Moon Materials' },
  { key: 'salvage', title: 'Salvage' },
  { key: 'ships', title: 'Ships & Drones' },
  { key: 'modules', title: 'Modules & Subsystems' },
  { key: 'charges', title: 'Charges & Ammunition' },
  { key: 'other', title: 'Other Materials' }
];
// The five oldest minerals (Plagioclase, Spodumain, Kernite, Hedbergite,
// Arkonor) sit in SDE category 25 in a group named after themselves, so the
// 'Mineral' group check misses them. Stable, tiny, and worth naming explicitly.
const BV_LEGACY_MINERALS = new Set([18, 19, 20, 21, 22]);
// Section for one BOM line. The SDE group name is checked first because it is
// complete and synchronous — the runtime iceProductIds set only fills in after
// load, and the gas name heuristic is loose (it would otherwise swallow
// "Atmospheric Gases", a moon material). PI is handled first of all because it
// needs its own per-tier split. Anything still unplaced falls back to category.
// R.A.M. / R.Db components are TOOLS, not hulls: CCP files them under group 332
// "Tool" (category 17 Commodity) instead of a ship group, and they were absent
// from the baked typeinfo, so the item NAME is the dependable signal. Covers
// both the components and their blueprints:
//   "R.A.M.- Ammunition Tech" / "R.A.M.- Ammunition Tech Blueprint"
//   "R.Db - CreoDron"        / "R.Db.- Hybrid Technology Blueprint"
function bvIsIndustrialComponentAlias(id, name) {
  try {
    if (/^(R\.A\.M\.|R\.Db\.?)\s*-/.test(String(name || '').trim())) return true;
    const info = bvTypeInfoLocal(id);
    if (info) {
      const mg = bvInfoName('marketGroups', info.mg);
      if (mg === 'R.A.M.' || mg === 'R.Db') return true;
    }
  } catch {}
  return false;
}
function bomSectionKey(l) {
  const id = +l.type_id;
  try {
    if (isPI(id)) {
      const t = bvMailPiTierNum(id);
      if (t >= 4) return 'pi4';
      if (t === 3) return 'pi3';
      if (t === 2) return 'pi2';
      if (t === 1) return 'pi1';
      return 'pi0';
    }
  } catch {}
  // R.A.M. / R.Db are tools (group 332), not ships — file them as components
  // rather than letting the old hull alias drop them in the Ships section.
  try { if (bvIsIndustrialComponentAlias(id, l.name)) return 'components'; } catch {}
  let grp = '', c;
  try { const info = bvTypeInfoLocal(id); if (info) { grp = bvInfoName('groups', info.g) || ''; c = info.c; } } catch {}
  if (grp === 'Mineral' || grp === 'Unrefined Mineral') return 'minerals';
  if (grp === 'Ice Product') return 'ice';
  if (grp === 'Moon Materials') return 'moon';
  if (grp === 'Ancient Salvage' || grp === 'Salvaged Materials' || grp === 'Abyssal Materials') return 'salvage';
  try { if (bvMailIsGas(id, l.name)) return 'gas'; } catch {}
  if (BV_LEGACY_MINERALS.has(id)) return 'minerals';
  try { if (isMineral(id)) return 'minerals'; } catch {}
  try { if (iceProductIds && iceProductIds.has(id)) return 'ice'; } catch {}
  try { if (bvMailIsMoon(id)) return 'moon'; } catch {}
  if (c === 6 || c === 18) return 'ships';
  if (c === 7 || c === 20 || c === 22 || c === 32) return 'modules';
  if (c === 8) return 'charges';
  if (c === 4 || c === 43) return 'components'; // reaction sub-materials, PI stragglers
  return 'other';
}
function bomRowHtml(l) {
  const clean = escapeHtml(cleanName(l.name || ('Type ' + l.type_id)));
  const v = Math.round(typeVolumeCached(l.type_id) * l.qty);
  return '<tr>'
    + '<td class="bom-name">' + bvIconImg(l.type_id) + ' ' + clean
      + (isPI(l.type_id) ? ' <span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(l.type_id) + '</span>' : '')
      + (l.mode === 'react' ? ' <span class="pill react">REACT</span>' : '') + '</td>'
    + '<td class="num">' + fmtN(l.qty) + '</td>'
    + '<td class="num">' + (v ? fmtN(v) + ' m3' : '—') + '</td>'
    + '<td class="num">' + fmtISK(l.unit) + '</td>'
    + '<td class="num">' + fmtISK(l.total) + '</td>'
    + '<td><span class="pill ' + l.mode + '">' + l.mode.toUpperCase() + '</span></td>'
    + '<td class="ctr">' + ownCell(l) + '</td>'
    + '<td class="ctr"><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(l.type_id) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + piIcon(l.type_id) + mineIcon(l.type_id) + infoButton(l.type_id) + '</td></tr>';
}
// Bill of Materials panel collapse. State is persisted so a reload keeps the
// user's choice; the panel's buttons stay visible either way.
function bomApplyOpen(open) {
  const wrap = $('bomWrap'), btn = $('toggleBomOpen');
  if (wrap) wrap.classList.toggle('hidden', !open);
  if (btn) btn.innerHTML = open ? '<i class="fas fa-chevron-up"></i> Hide' : '<i class="fas fa-chevron-down"></i> Show';
}
function bomToggleOpen() {
  const wrap = $('bomWrap');
  if (!wrap) return;
  const open = wrap.classList.contains('hidden');
  bomApplyOpen(open);
  try { localStorage.setItem('bvBomOpen', open ? '1' : '0'); } catch {}
}
async function renderBom(runs) {
  S.bom = effLeafCost(runs);
  const tb = $('bomBody');
  await preloadVolumes(S.bom.map(l => l.type_id));
  let vol = 0; for (const l of S.bom) vol += (await typeVolume(l.type_id)) * l.qty;
  // Group into fixed industry order, preserving the existing order within each
  // section, and drop any section that has no lines.
  const rank = new Map(BOM_SECTIONS.map((s, i) => [s.key, i]));
  const groups = new Map();
  for (const l of S.bom) {
    const k = bomSectionKey(l);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  const ordered = [...groups.entries()].sort((a, b) => (rank.has(a[0]) ? rank.get(a[0]) : 999) - (rank.has(b[0]) ? rank.get(b[0]) : 999));
  tb.innerHTML = ordered.map(([key, lines]) => {
    const sec = BOM_SECTIONS.find(s => s.key === key);
    let sub = 0; for (const l of lines) sub += l.total;
    return '<tr class="bom-sec"><td colspan="8"><span class="bom-sec-title">' + escapeHtml(sec ? sec.title : 'Other Materials') + '</span>'
      + '<span class="bom-sec-sub">' + lines.length + ' item' + (lines.length === 1 ? '' : 's') + ' · ' + fmtISK(sub) + '</span></td></tr>'
      + lines.map(bomRowHtml).join('');
  }).join('');
  $('bomMeta').textContent = S.bom.length + ' types · ' + ordered.length + ' section' + (ordered.length === 1 ? '' : 's');
  const split = bomCashSplit();
  $('bomTotals').textContent = 'Cash total ' + fmtISK(split.cash) + (split.mined > 0 ? ' (+ ' + fmtISK(split.mined) + ' mined @ market)' : '') + (split.extracted > 0 ? ' (+ ' + fmtISK(split.extracted) + ' extracted @ market)' : '') + ' · Volume ~' + fmtN(Math.round(vol)) + ' m3 · ' + hub();
  await renderShoppingList(runs);
  await renderBuildList(runs);
  await renderRefinery();
}

// Recursive leaf lines for ONE build-mode top child, honoring deep toggles
// (a Buy-toggled sub-assembly stops as a leaf instead of expanding).
// Same _deep data as Progress; subtotals roll up from these leaves.
async function buildLeafLines(c, need, ci) {
  const out = [];
  const src = (c && c.child && c.child.materials) ? c.child.materials : null;
  if (!src || !src.length) return out;
  const rec = async (mats, parentFull, pq, depth, trail) => {
    const batches = deepBatches(parentFull, pq);
    for (const m of mats) {
      const tid = deepMatId(m);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      const qty = Math.floor(deepMatQty(m) * batches);
      if (qty <= 0) continue;
      if (!m.name) { try { m.name = await typeName(tid); } catch { m.name = 'Type ' + tid; } }
      const key = progKey(ci, trail.concat([tid]), depth, false);
      const sub = m._deep;
      const info = { hasBp: !!(sub && sub.kind === 'bp'), hasRx: !!(sub && sub.kind === 'rx'), mineable: isMineable(tid) };
      const eff = deepModeFor(key, info);
      if ((eff === 'build' && info.hasBp) || (eff === 'react' && info.hasRx)) {
        await rec(sub.materials, qty, sub.productQty || 1, depth + 1, trail.concat([tid]));
      } else {
        if (m.unit == null) { try { let p = await marketPrice(tid, hub(), ($('basis') && $('basis').value) || 'sell'); if (p == null) p = await marketPrice(tid, hub(), 'sell'); m.unit = p || 0; } catch { m.unit = 0; } }
        const unit = m.unit || 0;
        out.push({ type_id: tid, name: m.name || ('Type ' + tid), qty, unit, total: unit * qty });
      }
    }
  };
  await rec(src, need, (c.child.productQty || 1), 1, [+c.type_id]);
  return out;
}
async function renderBuildList(runs) {
  const wrap = $('buildList'), meta = $('buildMeta'), totals = $('buildTotals');
  if (!wrap) return;
  S.buildAgg = [];
  if (!S.root || !S.root.children) { wrap.innerHTML = '<p class="hint">No calculation yet — set materials to <b>Build</b> in the tree above.</p>'; if (meta) meta.textContent=''; if (totals) totals.textContent=''; return; }
  const builds = S.root.children.filter(c => c.mode === 'build');
  if (!builds.length) { wrap.innerHTML = '<p class="hint">Nothing set to Build — toggle <b>Build</b> on materials in the tree above. The list below will break each Build item into its raw materials.</p>'; if (meta) meta.textContent='0 items'; if (totals) totals.textContent=''; return; }
  let html = '';
  let grandTotal = 0, grandVol = 0, totalRows = 0;
  const aggregated = new Map();
  // Preload all build-list volumes in one batch (was sequential ESI per row).
  try {
    const allIds = [];
    const gatherIds = list => {
      for (const m of (list || [])) {
        allIds.push(deepMatId(m));
        const s = m && m._deep;
        if (s && s.materials) gatherIds(s.materials);
      }
    };
    for (const b of builds) gatherIds((b.child && b.child.materials) || []);
    await preloadVolumes(allIds);
  } catch {}
  for (let idx=0; idx<builds.length; idx++) {
    const c = builds[idx];
    const need = c.perRun * (S.runs || 1);
    if (!c.child || !c.child.materials) {
      const checking = !c._tried ? 'checking blueprint…' : (c.child===null ? 'no manufacture blueprint' : 'loading…');
      html += '<details class="tree-node build" open style="margin-bottom:.6rem;padding:.6rem;background:var(--panel);border:1px solid var(--border);border-left:4px solid var(--build);border-radius:8px"><summary style="cursor:pointer;display:flex;align-items:center;gap:.6rem;list-style:none"><img src="https://images.evetech.net/types/' + c.type_id + '/icon?size=32" onerror="this.style.display=\'none\'" style="width:28px;height:28px;border-radius:4px;background:#111"><span class="nm" style="flex:1;font-weight:700">' + c.name + ' × ' + fmtN(need) + '</span><span class="pill build">BUILD</span><span class="nums">' + checking + '</span><span style="margin-left:auto;color:var(--text3)"><i class="fas fa-chevron-down"></i></span></summary><p class="hint" style="margin-top:.6rem">Raw materials are still resolving — they will appear here when the blueprint lookup finishes.</p></details>';
      continue;
    }
    const child = c.child;
    const mats = child.materials || [];
    const prodQty = child.productQty || (child.products && child.products[0] && child.products[0].quantity) || 1;
    const batches = deepBatches(need, prodQty);
    // Leaf roll-up honors deep toggles (Buy-toggled branches stop as leaves).
    const leafLines = await buildLeafLines(c, need, S.root.children.indexOf(c));
    let subTotal = 0; let subVol = 0;
    for (const L of leafLines) {
      subTotal += L.total;
      subVol += (await typeVolume(L.type_id)) * L.qty;
      if (!aggregated.has(L.type_id)) aggregated.set(L.type_id, { qty: 0, unit: L.unit || 0, name: L.name });
      const arow = aggregated.get(L.type_id);
      if (!arow.unit && L.unit) arow.unit = L.unit; // later real price wins over an earlier 0
      arow.qty += L.qty;
    }
    grandTotal += subTotal;
    grandVol += subVol;
    totalRows += leafLines.length;
    html += '<details class="tree-node build" open style="margin-bottom:.6rem;padding:.6rem;background:var(--panel);border:1px solid var(--border);border-left:4px solid var(--build);border-radius:8px"><summary style="cursor:pointer;display:flex;align-items:center;gap:.6rem;list-style:none"><img src="https://images.evetech.net/types/' + c.type_id + '/icon?size=32" onerror="this.style.display=\'none\'" style="width:28px;height:28px;border-radius:4px;background:#111"><span class="nm" style="flex:1;font-weight:700">' + c.name + ' × ' + fmtN(need) + '</span><span class="pill build">BUILD</span><span class="nums">' + fmtISK(subTotal) + ' for ' + leafLines.length + ' raws · ×' + batches + ' batch' + (batches>1?'es':'') + '</span><span style="margin-left:auto;color:var(--text3)"><i class="fas fa-chevron-down"></i></span></summary>';
    html += '<div style="margin-top:.6rem;overflow-x:auto"><table class="bom"><thead><tr><th>Raw material</th><th>Qty</th><th>Unit price</th><th>Total price</th><th></th></tr></thead><tbody>';
    const ci = S.root.children.indexOf(c);
    // Recursive display-only sub-rows (same _deep data as Progress; subtotals stay depth-1).
    const renderBuildDeep = (list, parentFull, productQty, depth, trail) => {
      const b2 = deepBatches(parentFull, productQty);
      return list.map(sm => {
        const tid = deepMatId(sm);
        if (!Number.isFinite(tid) || tid <= 0) return '';
        const qty = Math.max(0, Math.floor(deepMatQty(sm) * b2));
        if (qty <= 0) return '';
        const nm = sm.name || ('Type ' + tid);
        const unit = sm.unit || 0;
        const tot = unit * qty;
        const sub = sm._deep;
        const pend = !sub && sm._deepState === 'pending';
        const hasKids = !!(sub && sub.materials && sub.materials.length) || pend;
        const key = progKey(ci, trail.concat([tid]), depth, false);
        const open = calcExpanded.has(key);
        const pad = 'padding-left:' + (0.4 + depth * 1.1) + 'rem';
        const binfo = { hasBp: !!(sub && sub.kind === 'bp' && sub.materials && sub.materials.length), hasRx: !!(sub && sub.kind === 'rx' && sub.materials && sub.materials.length), mineable: isMineable(tid) };
        const bcur = deepModeFor(key, binfo);
        const bbtns = deepModeButtons(key, bcur, binfo);
        let row = '<tr><td style="' + pad + '"><img src="https://images.evetech.net/types/' + tid + '/icon?size=32" onerror="this.style.display=\'none\'" style="width:24px;height:24px;vertical-align:middle;margin-right:.4rem;border-radius:4px;background:#111">'
          + (hasKids ? '<button class="mode-btn" data-build-exp="' + key + '" title="' + (open ? 'Collapse' : 'Expand') + '" style="padding:0 .3rem"><i class="fas fa-chevron-' + (open ? 'up' : 'down') + '"></i></button> ' : '')
          + nm + (isPI(tid) ? ' <span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(tid) + '</span>' : '') + '</td><td>' + fmtN(qty) + '</td><td>' + fmtISK(unit) + '</td><td>' + fmtISK(tot) + '</td><td><a class="mkt-link" target="_blank" href="' + marketURL(tid) + '"><i class="fas fa-chart-line"></i></a>' + piIcon(tid) + mineIcon(tid) + infoButton(tid) + (bbtns ? '<br><span class="mode-toggle">' + bbtns + '</span>' : '') + '</td></tr>';
        if (sub && sub.materials && sub.materials.length && open) row += renderBuildDeep(sub.materials, qty, sub.productQty || 1, depth + 1, trail.concat([tid]));
        else if (pend && open) row += '<tr><td style="' + pad + 'color:var(--text3)">resolving sub-materials…</td><td></td><td></td><td></td><td></td></tr>';
        return row;
      }).join('');
    };
    html += renderBuildDeep(mats, need, prodQty, 1, [+c.type_id]);
    html += '</tbody></table></div><p class="hint" style="margin-top:.4rem">' + child.bpName + ' · product ×' + prodQty + ' per run · ' + leafLines.length + ' raws · subtotal ' + fmtISK(subTotal) + ' · <a class="mkt-link" target="_blank" href="' + marketURL(c.type_id) + '">price check build</a>' + infoButton(c.type_id) + '</p></details>';
  }
  S.buildAgg = Array.from(aggregated, ([type_id, v]) => ({ type_id: +type_id, name: v.name, qty: v.qty, unit: v.unit }));
  if (aggregated.size > 1 && builds.filter(c=>c.child && c.child.materials).length > 1) {
    html += '<div class="panel" style="margin-top:.6rem;background:var(--panel2)"><h4>Aggregated raw totals (' + aggregated.size + ' types across ' + builds.filter(c=>c.child).length + ' builds)</h4><div style="overflow-x:auto"><table class="bom"><thead><tr><th>Material</th><th>Total qty</th><th>Unit price</th><th>Total price</th><th></th></tr></thead><tbody>';
    let aggTotal = 0; let aggVol = 0;
    for (const [tid, v] of aggregated) {
      const tot = v.unit * v.qty;
      aggTotal += tot;
      aggVol += (await typeVolume(tid)) * v.qty;
      html += '<tr><td><img src="https://images.evetech.net/types/' + tid + '/icon?size=32" onerror="this.style.display=\'none\'" style="width:24px;height:24px;vertical-align:middle;margin-right:.4rem;border-radius:4px;background:#111">' + v.name + '</td><td>' + fmtN(v.qty) + '</td><td>' + fmtISK(v.unit) + '</td><td>' + fmtISK(tot) + '</td><td><a class="mkt-link" target="_blank" href="' + marketURL(tid) + '"><i class="fas fa-chart-line"></i></a>' + piIcon(tid) + mineIcon(tid) + infoButton(tid) + '</td></tr>';
    }
    html += '</tbody></table></div><p class="hint" style="margin-top:.4rem">Combined raw cost for all Build items: ' + fmtISK(aggTotal) + ' · Volume ~' + fmtN(Math.round(aggVol)) + ' m³</p></div>';
    grandTotal = aggTotal;
    grandVol = aggVol;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-build-exp]').forEach(b => b.onclick = async () => {
    const k = b.dataset.buildExp;
    if (calcExpanded.has(k)) calcExpanded.delete(k); else calcExpanded.add(k);
    try { await renderBuildList(S.runs || 1); } catch {}
  });
  bindDeepModeButtons(wrap);
  if (meta) meta.textContent = builds.length + ' item' + (builds.length>1?'s':'') + ' to build' + (builds.filter(c=>!c.child).length ? ' · ' + builds.filter(c=>!c.child).length + ' loading…' : '') + ' · raw ' + fmtISK(grandTotal);
  if (totals) totals.textContent = 'Raw total for Build List ' + fmtISK(grandTotal) + ' · Volume ~' + fmtN(Math.round(grandVol)) + ' m³ · ' + totalRows + ' material rows' + (aggregated.size ? ' · ' + aggregated.size + ' unique raws' : '');
  try { renderBuildProgress(); } catch {}
}

// ---- Build Progress checklist: collapsible parts + completion ticks + export ----
// One row per material (top-level) plus its sub-part rows (build raws /
// reaction reagents). Ticks persist per blueprint in localStorage; collapse
// state persists per render in bpProgExpanded (starts collapsed). Export reuses the same model.
const bpProgExpanded = new Set();
let bpProgLastSrc = null;
function bpProgStoreKey() { const src = bpProgSource(); return 'bvBuildProg_' + (src ? src.bpId : 'none'); }
function bpProgRead() { try { const v = JSON.parse(localStorage.getItem(bpProgStoreKey()) || '{}'); return (v && typeof v === 'object') ? v : {}; } catch { return {}; } }
function bpProgWrite(m) { try { localStorage.setItem(bpProgStoreKey(), JSON.stringify(m || {})); } catch {} }
// Flat row model for render + export so counts always agree.
// Recurses into background-resolved _deep nodes (depth 2+); depth-1 keys are
// unchanged for existing ticks, and deep keys ('d'+ci+':'+trail) match the
// Evemail expander exactly so ticks flow into mail.
function bpProgModel() {
  const rows = [];
  const src = bpProgSource();
  const selPin = bpProgSelPin();
  if (!src || !src.children) return { rows, rootName: '', runs: 1, pinned: !!selPin, selPin };
  const runs = src.runs || S.runs || 1;
  rows.push({ key: 'root', typeId: src.bpId, name: src.bpName + ' × ' + runs, qty: runs, unit: null, depth: -1, mode: src.mode });
  let deepRows = 0;
  const pushDeep = (matTid, matFull, node, ancestors, depth, parentKey, ci) => {
    if (!node || !node.materials || !node.materials.length || depth > 12 || deepRows > 1000) return;
    if (ancestors.concat([+matTid]).length > 12) return;
    const batches = deepBatches(matFull, node.productQty);
    for (const sm of node.materials) {
      const tid = deepMatId(sm);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      const trail = ancestors.concat([+matTid, tid]);
      if (trail.indexOf(tid) !== trail.lastIndexOf(tid)) continue; // cycle guard
      const full = Math.max(0, Math.floor(deepMatQty(sm) * batches));
      if (full <= 0) continue;
      const key = progKey(ci, trail, depth, node.kind === 'rx');
      const sub = sm._deep;
      const pend = !sub && sm._deepState === 'pending';
      const hasKids = !!(sub && sub.materials && sub.materials.length) || pend;
      deepRows++;
      rows.push({ key, typeId: tid, name: sm.name || ('Type ' + tid), qty: full, unit: sm.unit || 0, depth, mode: deepModeFor(key, { hasBp: sub && sub.kind === 'bp', hasRx: sub && sub.kind === 'rx', mineable: isMineable(tid) }), ci, parent: parentKey,
        hasKids, pending: pend, path: trail.slice(1), maybe: !hasKids && !pend && !deepIsLeaf(tid) });
      if (sub) pushDeep(tid, full, sub, ancestors.concat([+matTid]), depth + 1, key, ci);
    }
  };
  src.children.forEach((c, ci) => {
    if (!c || c.include === false) return; // Fit Builder: excluded item isn't part of the build
    const need = c.perRun * runs;
    const basis = ($('basis') && $('basis').value) || 'sell';
    const unit = basis === 'buy' ? c.unitBuy : c.unitSell;
    const topKey = progKey(ci, [+c.type_id], 0, false);
    // No resolved recipe yet: still offer a resolve chevron so the row is never
    // a dead end (the background enrich retries a few times, but a row that
    // stays unresolved must stay manually actionable).
    const topMaybe = !(c.child && c.child.materials && c.child.materials.length)
      && !(c.reaction && c.reaction.reagents && c.reaction.reagents.length)
      && !isMineable(c.type_id) && !isPI(c.type_id);
    const top = { key: topKey, typeId: c.type_id, name: c.name, qty: need, unit: unit || 0, depth: 0, mode: c.mode, ci, parent: 'root', hasKids: false, pending: false, path: [], maybe: topMaybe };
    rows.push(top);
    if (c.child && c.child.materials) {
      const prodQty = c.child.productQty || (c.child.products && c.child.products[0] && c.child.products[0].quantity) || 1;
      const batches = deepBatches(need, prodQty);
      for (const m of c.child.materials) {
        const key = progKey(ci, [+c.type_id, +m.type_id], 1, false);
        const sub = m._deep;
        const pend = !sub && m._deepState === 'pending';
        const hasKids = !!(sub && sub.materials && sub.materials.length) || pend;
        rows.push({ key, typeId: m.type_id, name: m.name || ('Type ' + m.type_id), qty: (m.quantity || 0) * batches, unit: m.unit || 0, depth: 1, mode: deepModeFor(key, { hasBp: sub && sub.kind === 'bp', hasRx: sub && sub.kind === 'rx', mineable: isMineable(+m.type_id) }), ci, parent: topKey,
          hasKids, pending: pend, path: [+m.type_id], maybe: !hasKids && !pend && !deepIsLeaf(+m.type_id) });
        if (sub) pushDeep(m.type_id, (m.quantity || 0) * batches, sub, [+c.type_id], 2, key, ci);
        top.hasKids = true;
      }
    } else if (c.reaction && c.reaction.reagents) {
      // Reaction reagents show in every mode (same as blueprint children
      // above): the breakdown is informational, and countable when built.
      const n = reactRunsNeeded(c, runs);
      for (const rg of c.reaction.reagents) {
        const key = progKey(ci, [+c.type_id, +rg.type_id], 1, true);
        const sub = rg._deep;
        const pend = !sub && rg._deepState === 'pending';
        const hasKids = !!(sub && sub.materials && sub.materials.length) || pend;
        rows.push({ key, typeId: rg.type_id, name: rg.name || ('Type ' + rg.type_id), qty: (rg.quantity || 0) * n, unit: rg.unit || 0, depth: 1, mode: deepModeFor(key, { hasBp: sub && sub.kind === 'bp', hasRx: sub && sub.kind === 'rx', mineable: isMineable(+rg.type_id) }), ci, parent: topKey,
          hasKids, pending: pend, path: [+rg.type_id], maybe: !hasKids && !pend && !deepIsLeaf(+rg.type_id) });
        if (sub) pushDeep(rg.type_id, (rg.quantity || 0) * n, sub, [+c.type_id], 2, key, ci);
        top.hasKids = true;
      }
    }
    if (!top.hasKids) { try { top.maybe = !deepIsLeaf(+c.type_id); } catch {} }
  });
  return { rows, rootName: src.bpName, runs, pinned: !!selPin, selPin };
}
function bpProgCounts() {
  const { rows } = bpProgModel();
  const ticked = bpProgRead();
  let done = 0;
  for (const r of rows) if (ticked[r.key]) done++;
  return { done, total: rows.length };
}
function bpProgOverall() {
  const { rows } = bpProgModel();
  const ticked = bpProgRead();
  const mat = rows.filter(r => r.key !== 'root');
  let done = 0;
  for (const r of mat) if (ticked[r.key]) done++;
  const total = mat.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  return { done, total, pct };
}
function bpProgRefreshHead() {
  try {
    const { done, total } = bpProgCounts();
    const meta = $('progMeta'), totals = $('progressTotals');
    if (meta) meta.textContent = total ? done + '/' + total + ' done' : '';
    const ov = bpProgOverall();
    const fill = $('progOverallFill'), lbl = $('progOverallLabel');
    if (fill) { fill.style.width = ov.pct + '%'; fill.classList.toggle('complete', ov.total > 0 && ov.done === ov.total); }
    if (lbl) lbl.textContent = ov.pct + '%';
    if (totals) {
      const { rows } = bpProgModel();
      const ticked = bpProgRead();
      let invAgg = {};
      try { invAgg = stkDeductMap() || {}; } catch {}
      const hasInv = Object.keys(invAgg).length > 0;
      let leftVal = 0, leftN = 0, covered = 0;
      for (const r of rows) {
        if (r.depth < 0 || ticked[r.key]) continue;
        leftN++;
        leftVal += (r.unit || 0) * r.qty;
        if (hasInv && (invAgg[r.typeId] || 0) >= r.qty) covered++;
      }
      totals.textContent = total ? (done === total ? 'Complete — everything collected/built.' : leftN + ' remaining' + (leftVal > 0 ? ' · ' + fmtISK(leftVal) + ' buy value left' : '') + (hasInv && covered ? ' · ' + covered + ' already in inventory' : '')) : '';
    }
  } catch {}
}
function renderBuildProgress() {
  const wrap = $('buildProgress');
  if (!wrap) return;
  const src = bpProgSource();
  if (!src || !src.children || !src.children.length) {
    wrap.innerHTML = '<p class="hint">No pinned build yet — open <b>My Blueprints</b> and hit <b>Send to Build</b> on any blueprint, or track the live calculation.</p>';
    const meta = $('progMeta'), totals = $('progressTotals');
    if (meta) meta.textContent = '';
    if (totals) totals.textContent = '';
    return;
  }
  const { rows, pinned, selPin } = bpProgModel();
  const ticked = bpProgRead();
  // Default to fully COLLAPSED whenever the tracked view changes (blueprint,
  // part count, run count, or Live-vs-pin selection — re-sending the same
  // blueprint with new runs counts as new); manual expand choices persist
  // only within that view.
  try {
    const srcKey = (selPin ? 'pin:' + selPin.bpId : 'live') + '|' + src.bpId + '|' + (src.children ? src.children.length : 0) + '|' + (src.runs || S.runs || 1);
    if (bpProgLastSrc !== srcKey) { bpProgLastSrc = srcKey; bpProgExpanded.clear(); }
  } catch {}
  // Pin selector: Live + up to 5 pinned builds (persisted). Unpin via ×.
  const pins = S.pinnedBuilds || [];
  let h = '';
  if (pins.length || S.root) {
    const liveOn = !selPin;
    h += '<div style="display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;margin-bottom:.5rem">'
      + '<button class="mode-btn' + (liveOn ? ' on-buy' : '') + '" data-pinsel="live" title="Track the live calculation">Live</button>'
      + pins.map(p => {
        const on = selPin && String(selPin.bpId) === String(p.bpId);
        return '<span style="display:inline-flex;gap:.15rem;align-items:center"><button class="mode-btn' + (on ? ' on-build' : '') + '" data-pinsel="' + p.bpId + '" title="Show ' + p.bpName + ' ×' + p.runs + '">' + p.bpName + ' ×' + p.runs + '</button>'
          + '<button class="mode-btn" data-unpin="' + p.bpId + '" title="Unpin ' + p.bpName + '" style="color:var(--danger)">×</button></span>';
      }).join('')
      + '<span class="hint" style="margin:0">' + pins.length + '/' + BV_MAX_PINS + ' pinned</span></div>';
  }
  // Live inventory for Have vs Required (same snapshot the Shopping list deducts).
  let invAgg = {};
  try { invAgg = stkDeductMap() || {}; } catch {}
  const hasInv = Object.keys(invAgg).length > 0;
  const haveBlock = (typeId, qty) => {
    if (!hasInv || !(qty > 0)) return '';
    const have = invAgg[typeId] || 0;
    const left = Math.max(0, qty - have);
    const pct = Math.min(100, Math.round(have / qty * 100));
    const ok = have >= qty;
    return '<span class="have-cell">'
      + '<span class="ref-track" title="Need ' + fmtN(qty) + ' · Have ' + fmtN(have) + ' · Left ' + fmtN(left) + ' (' + pct + '%)"><span class="ref-fill' + (ok ? '' : ' short') + '" style="width:' + pct + '%"></span></span><span class="prog-pct">' + pct + '%</span>'
      + '<span class="ref-cap"' + (ok ? ' style="color:var(--build)"' : '') + '>NEED ' + fmtN(qty) + ' · HAVE ' + fmtN(have) + ' · LEFT ' + fmtN(left) + '</span></span>';
  };
  const kidsOfKey = parentKey => rows.filter(r => r.parent === parentKey);
  // Recursive sub-tree renderer: every row with kids (or a pending lookup)
  // gets its own chevron + nested kids, so any sub-component opens to show
  // how it is built. Collapse state is keyed by row key (path strings).
  const renderKids = parentKey => {
    return kidsOfKey(parentKey).map(s => {
      const st = !!ticked[s.key];
      const kids = kidsOfKey(s.key);
      const open = bpProgExpanded.has(s.key);
      const kidsHtml = (s.pending && !kids.length)
        ? '<div class="kids"><div class="rx-row prow"><span class="nm" style="color:var(--text3)">resolving sub-materials…</span></div></div>'
        : (kids.length && open ? '<div class="kids">' + renderKids(s.key) + '</div>' : '');
      return '<div class="rx-row prow"' + (st ? ' style="opacity:.55"' : '') + '><label style="cursor:pointer;display:flex;align-items:center;gap:.5rem;flex-shrink:0" title="Mark collected"><input type="checkbox" data-prog="' + s.key + '"' + (st ? ' checked' : '') + '></label><span class="nm">' + bvIconImg(s.typeId) + s.name + ' × ' + fmtN(s.qty) + '</span>' + haveBlock(s.typeId, s.qty)
        + '<span class="row-tail">' + (s.unit ? '<span class="nums">' + fmtISK(s.unit) + ' ea</span>' : '') + '<span class="pill ' + s.mode + '">' + String(s.mode || 'buy').toUpperCase() + '</span>'
        + (s.hasKids ? '<button class="mode-btn" data-pexp="' + s.key + '" title="' + (open ? 'Collapse' : 'Expand') + '"><i class="fas fa-chevron-' + (open ? 'up' : 'down') + '"></i></button>'
          : (s.maybe ? '<button class="mode-btn" data-prog-resolve="' + s.ci + ':' + ((s.path || []).join('>')) + '" title="Resolve sub-materials"><i class="fas fa-chevron-down"></i></button>' : ''))
        + '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(s.typeId) + '"><i class="fas fa-chart-line"></i></a>' + infoButton(s.typeId) + '</span></div>' + kidsHtml;
    }).join('');
  };
  // Auto-finish: any material fully covered by inventory ticks itself
  // (persisted like manual ticks; the blueprint root row never auto-ticks).
  if (hasInv) {
    let changed = false;
    for (const r of rows) {
      if (r.depth >= 0 && r.qty > 0 && !ticked[r.key] && (invAgg[r.typeId] || 0) >= r.qty) { ticked[r.key] = true; changed = true; }
    }
    if (changed) bpProgWrite(ticked);
  }
  src.children.forEach((c, ci) => {
    const top = rows.find(r => r.key === 'c' + ci + ':' + c.type_id);
    if (!top) return;
    const t = !!ticked[top.key];
    const kidsHtml = (top.hasKids && bpProgExpanded.has(top.key)) ? '<div class="kids">' + renderKids(top.key) + '</div>' : '';
    h += '<div class="tree-node ' + c.mode + '"' + (t ? ' style="opacity:.55"' : '') + '><div class="row1 prow">'
      + '<label style="cursor:pointer;display:flex;align-items:center;flex-shrink:0" title="Mark collected/built"><input type="checkbox" data-prog="' + top.key + '"' + (t ? ' checked' : '') + '></label>'
      + '<span class="nm">' + bvIconImg(c.type_id) + top.name + ' × ' + fmtN(top.qty) + '</span>' + haveBlock(c.type_id, top.qty)
      + '<span class="row-tail">'
      + (top.unit ? '<span class="nums">' + fmtISK(top.unit) + ' ea</span>' : '')
      + '<span class="pill ' + c.mode + '">' + c.mode.toUpperCase() + '</span>'
      + (top.hasKids ? '<button class="mode-btn" data-pexp="' + top.key + '" title="' + (bpProgExpanded.has(top.key) ? 'Collapse' : 'Expand') + '"><i class="fas fa-chevron-' + (bpProgExpanded.has(top.key) ? 'up' : 'down') + '"></i></button>'
        : (top.maybe ? '<button class="mode-btn" data-prog-resolve="' + ci + ':" title="Resolve sub-materials"><i class="fas fa-chevron-down"></i></button>' : ''))
      + '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(c.type_id) + '"><i class="fas fa-chart-line"></i></a>' + infoButton(c.type_id) + '<button class="mode-btn tree-remove" data-prog-rm="' + ci + '" title="Remove ' + escapeHtml(top.name) + ' from this build"><i class="fas fa-xmark"></i></button></span></div>'
      + kidsHtml
      + '</div>';
  });
  // root row on top (with overall progress bar pinned far-right, % only)
  const rk = 'root', rt = !!ticked[rk];
  const rruns = src.runs || S.runs || 1;
  const rootIcon = (src === S.root && S.product) ? bvIconImg(S.product.type_id) : (src.productTypeId ? bvIconImg(src.productTypeId) : '');
  const ovDone = rows.filter(r => r.key !== 'root' && ticked[r.key]).length;
  const ovTotal = rows.filter(r => r.key !== 'root').length;
  const ovPct = ovTotal ? Math.round(ovDone / ovTotal * 100) : 0;
  h = '<div class="tree-node build"' + (rt ? ' style="opacity:.55"' : '') + '><div class="row1 prog-root"><label style="cursor:pointer;display:flex;align-items:center" title="Mark blueprint complete"><input type="checkbox" data-prog="' + rk + '"' + (rt ? ' checked' : '') + '></label><span class="nm">' + rootIcon + '<b>' + src.bpName + ' × ' + rruns + '</b></span><span class="row-tail prog-overall"><span class="pill ' + (src.mode === 'react' ? 'react' : 'build') + '">' + (src.mode === 'react' ? 'REACT' : 'BUILD') + '</span><span class="ref-track" title="' + ovDone + '/' + ovTotal + ' done"><span id="progOverallFill" class="ref-fill' + (ovTotal > 0 && ovDone === ovTotal ? ' complete' : '') + '" style="width:' + ovPct + '%"></span></span><span id="progOverallLabel" class="prog-pct">' + ovPct + '%</span></span></div></div>' + h;
  wrap.innerHTML = h;
  if (!wrap.dataset.bound) {
    wrap.dataset.bound = '1';
    wrap.addEventListener('change', e => {
      const box = e.target.closest('[data-prog]');
      if (!box) return;
      const m = bpProgRead();
      if (box.checked) m[box.dataset.prog] = true; else delete m[box.dataset.prog];
      bpProgWrite(m);
      const row = box.closest('.tree-node, .rx-row');
      if (row) row.style.opacity = box.checked ? '.55' : '';
      bpProgRefreshHead();
    });
    wrap.addEventListener('click', e => {
      const rm = e.target.closest('[data-prog-rm]');
      if (rm) { progRemoveItem(+rm.dataset.progRm); return; }
      const ps = e.target.closest('[data-pinsel]');
      if (ps) {
        S.pinnedSel = ps.dataset.pinsel === 'live' ? 'live' : String(ps.dataset.pinsel);
        bpPinsSave();
        renderBuildProgress();
        try { bpProgDeepEnrich(); } catch {}
        return;
      }
      const up = e.target.closest('[data-unpin]');
      if (up) {
        const id = String(up.dataset.unpin);
        S.pinnedBuilds = (S.pinnedBuilds || []).filter(p => String(p.bpId) !== id);
        if (S.pinnedSel === id) S.pinnedSel = null;
        bpPinsSave();
        renderBuildProgress();
        status('Unpinned.');
        return;
      }
      const b = e.target.closest('[data-pexp]');
      if (b) {
        const k = b.dataset.pexp;
        if (bpProgExpanded.has(k)) bpProgExpanded.delete(k); else bpProgExpanded.add(k);
        renderBuildProgress();
        return;
      }
      // On-demand resolve for rows with no recipe data yet (missed/slow
      // background lookup, pinned-before-enrichment, or Reactions off).
      // Bypasses the Reactions gate for display only — costing untouched.
      const rs = e.target.closest('[data-prog-resolve]');
      if (rs) {
        const raw = String(rs.dataset.progResolve || '');
        const cpos = raw.indexOf(':');
        const ci = +(cpos < 0 ? raw : raw.slice(0, cpos));
        const path = (cpos < 0 ? '' : raw.slice(cpos + 1)).split('>').map(Number).filter(n => Number.isFinite(n) && n > 0);
        progDeepResolveOne(ci, path);
        return;
      }
    });
  }
  bpProgRefreshHead();
  renderProgBlueprints();
  renderProgRemovedBar();
}

// Mirror the Calculator's "Restore removed" affordance here, so an item
// dropped from a tracked build can be brought back without switching tabs.
function renderProgRemovedBar() {
  const bar = $('progRemovedBar'), text = $('progRemovedText');
  if (!bar) return;
  let n = 0;
  try { n = calcRemovedRead().length; } catch {}
  if (!n) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  if (text) text.innerHTML = '<b>' + n + ' item' + (n === 1 ? '' : 's') + '</b> removed from this build.';
}

// Blueprints required for whichever build Build Progress is currently tracking (live or
// pinned). Re-rendered on every progress render so it grows as the background
// deep resolver discovers nested recipes. "Acquired" ticks share the per-build
// store under a 'bpx:' prefix so they never collide with material row keys.
function bpProgBpKey(typeId) { return 'bpx:' + (+typeId || 0); }
function progBpHead() {
  const meta = $('progBpMeta');
  if (!meta) return;
  let rows = [];
  try { rows = trackedBlueprintList(); } catch { rows = []; }
  if (!rows.length) { meta.textContent = ''; return; }
  const ticked = bpProgRead();
  const have = rows.filter(b => ticked[bpProgBpKey(b.typeId)]).length;
  meta.textContent = have + ' / ' + rows.length + ' acquired';
}
function renderProgBlueprints() {
  const panel = $('progBpPanel'), list = $('progBpList'), meta = $('progBpMeta');
  if (!panel || !list) return;
  let rows = [];
  try { rows = trackedBlueprintList(); } catch { rows = []; }
  panel.style.display = rows.length ? '' : 'none';
  if (!rows.length) { list.innerHTML = ''; if (meta) meta.textContent = ''; return; }
  const ticked = bpProgRead();
  list.innerHTML = rows.map(b => {
    const key = bpProgBpKey(b.typeId);
    const got = !!ticked[key];
    return '<div class="rx-row' + (got ? ' bp-have' : '') + '">'
      + '<label class="bp-check" title="I have this blueprint"><input type="checkbox" data-progbp="' + key + '"' + (got ? ' checked' : '') + '></label>'
      + '<img src="https://images.evetech.net/types/' + b.typeId + '/icon?size=32" loading="lazy" onerror="this.style.display=\'none\'">'
      + '<span class="nm">' + escapeHtml(b.name) + (b.kind === 'rx' ? ' <span class="pill react">FORMULA</span>' : ' <span class="pill">BP</span>') + (b.kind === 'bp' && bvBpIsT2(b.name) ? ' <span class="pill invent" title="Tech II — copy runs require invention">T2</span>' : '') + '</span>'
      + '<span class="row-tail"><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(b.typeId) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + infoButton(b.typeId) + '</span></div>';
  }).join('');
  list.querySelectorAll('[data-progbp]').forEach(box => {
    box.onchange = () => {
      const m = bpProgRead();
      if (box.checked) m[box.dataset.progbp] = true; else delete m[box.dataset.progbp];
      bpProgWrite(m);
      const row = box.closest('.rx-row');
      if (row) row.classList.toggle('bp-have', !!box.checked);
      progBpHead();
    };
  });
  progBpHead();
}
// Resolve a single row on demand (chevron click): bare top-level child or a
// material at path. Busts null-caches so transient failures retry.
async function progDeepResolveOne(ci, path) {
  const label = 'Resolve sub-materials';
  const fail = msg => { try { status(label + ' failed — ' + msg); } catch {} try { toast(label + ' failed — ' + msg, 'error', 5000); } catch {} };
  try {
    const src = (typeof bpProgSource === 'function') ? bpProgSource() : null;
    if (!src || !src.children || !Number.isFinite(ci)) { fail('no build is being tracked'); return; }
    if (!path || !path.length) {
      const c = src.children[ci];
      if (!c) { fail('that item is no longer in the build'); renderBuildProgress(); return; }
      if (c.child || (c.mode === 'react' && c.reaction)) { renderBuildProgress(); return; }
      try { deepCache.delete(+c.type_id); } catch {}
      try { reactCache.delete('rx' + (+c.type_id)); } catch {}
      status('Resolving ' + (c.name || ('Type ' + c.type_id)) + '…');
      await progDeepResolveTop(c, true);
      if (c.mode === 'buy' && !bvHasStoredTop(src.bpId, c.type_id)) {
        if (c.child) c.mode = 'build';
        else if (c.reaction) c.mode = 'react';
        if (src === S.root) { try { bvModesSave(); } catch {} }
      }
      if (!c.child && !c.reaction) fail('no manufacturing blueprint or reaction for ' + (c.name || ('Type ' + c.type_id)));
      renderBuildProgress();
      try { renderTree(S.runs || 1); } catch {}
    } else {
      const m = progFindMaterial(src, ci, path);
      if (!m) { fail('could not locate that material in the tracked build (item ' + ci + ', path ' + path.join('>') + ')'); renderBuildProgress(); return; }
      if (m._deep) { renderBuildProgress(); return; }
      const tid = deepMatId(m);
      const nm = m.name || ('Type ' + tid);
      try { deepCache.delete(tid); } catch {}
      try { reactCache.delete('rx' + tid); } catch {}
      try { m._deepState = 'pending'; } catch {}
      renderBuildProgress();
      let node = null, err = null;
      try { node = await deepResolve(tid, nm, [], true); } catch (e) { err = e; }
      if (node && node.materials) { try { await deepPriceUnits(node); } catch {} }
      const got = !!(node && node.materials && node.materials.length);
      try { m._deep = got ? node : null; m._deepState = 'done'; } catch {}
      try { if (got) progDeepNone.delete(tid); else progDeepNone.add(tid); } catch {}
      if (got) { try { status(nm + ' — ' + node.materials.length + ' sub-material' + (node.materials.length === 1 ? '' : 's') + '.'); } catch {} }
      else if (err) fail(nm + ': ' + (err.message || err));
      else fail(nm + ' has no further sub-materials in the SDE (nothing to expand)');
      renderBuildProgress();
    }
    try { bpProgDeepEnrich(); } catch {}
  } catch (e) {
    fail(e && e.message ? e.message : String(e || 'unknown error'));
  }
}
function bpProgExportText() {
  const { rows, rootName, runs } = bpProgModel();
  const ticked = bpProgRead();
  let invAgg = {};
  try { invAgg = stkDeductMap() || {}; } catch {}
  const hasInv = Object.keys(invAgg).length > 0;
  const lines = [rootName + ' ×' + runs + ' ' + (ticked['root'] ? '[x]' : '[ ]')];
  for (const r of rows) {
    if (r.depth < 0) continue;
    const pad = r.depth > 0 ? new Array(Math.min(r.depth, 4) + 1).join('  ') : '';
    const have = hasInv ? ' (have ' + fmtN(invAgg[r.typeId] || 0) + ')' : '';
    lines.push(pad + cleanName(r.name) + ' ×' + fmtN(r.qty) + have + ' ' + (ticked[r.key] ? '[x]' : '[ ]'));
  }
  return lines.join('\n');
}
function bpProgRemainingMultibuy() {
  const { rows } = bpProgModel();
  const ticked = bpProgRead();
  return rows.filter(r => r.depth >= 0 && !ticked[r.key]).map(r => cleanName(r.name) + ' x' + fmtN(r.qty));
}
// Shared by the top + bottom "Copy remaining multibuy" buttons.
async function copyRemainingMultibuy() {
  const lines = bpProgRemainingMultibuy();
  await copyToClipboard(
    lines.length ? lines.join('\n') : '',
    'Remaining multibuy copied (' + lines.length + ' lines).',
    'Nothing remaining — every item is ticked off.'
  );
}

// ---- Send remaining materials to Evemail (via shared RustyBot sender) ----
// Remaining = unticked rows minus inventory cover. Linked form uses EVE HTML:
//   <url=showinfo:{typeId}>Name</url> x{qty}
// Hard cap: max 3 mails per build. If the linked form needs more, warn and
// fall back to plain text (no links). Text overflow beyond 3 is truncated.
// Chunk cap is 7500 — ESI rejects mail bodies over 8000 chars, so we stay
// well clear (leaves room for the truncation note + encoding variance).
const BV_MAIL_MAX_PARTS = 3;
const BV_MAIL_CHUNK = 7500;
function bvMailStatus(m) { try { const el = $('mailStatus'); if (el) el.textContent = m || ''; } catch {} if (m) status(m); }
function bvMailEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// ---- Grouped Evemail sections (Full industry split, fixed order) ----
// Priority: minerals > ice > PI (by tier) > gas > moon > components > other.
// Uses only offline/runtime sources — no extra ESI calls at mail time.
function bvMailPiTierNum(typeId) {
  try {
    const P = (typeof PI_DATA !== 'undefined' ? PI_DATA : (typeof window !== 'undefined' && window.PI_DATA ? window.PI_DATA : null));
    const m = P && P.materials && P.materials[String(typeId)];
    const t = m ? +m.tier : NaN;
    return Number.isFinite(t) ? t : null;
  } catch { return null; }
}
let bvMailGasSet = null;
function bvMailGasMats() {
  if (bvMailGasSet) return bvMailGasSet;
  bvMailGasSet = new Set();
  try {
    // BV_ORES is defined further below — only touched at mail time (post-eval), so no TDZ issue.
    for (const [, e] of BV_ORES) {
      if (!e || e.category !== 2 || !e.yields) continue;
      for (const mid of Object.keys(e.yields)) bvMailGasSet.add(+mid);
    }
  } catch {}
  return bvMailGasSet;
}
function bvMailIsGas(typeId, name) {
  try { if (bvMailGasMats().has(+typeId)) return true; } catch {}
  try { if (/gas|fuller|mykoserocin|cytoserocin/i.test(String(name || ''))) return true; } catch {}
  return false;
}
function bvMailIsMoon(typeId) {
  try { if (BV_MINE_MATS && BV_MINE_MATS.has(+typeId)) return true; } catch {}
  return false;
}
// Returns section key: minerals|ice|pi4|pi3|pi2|pi1|pi0|gas|moon|components|other
function bvMailGroup(it) {
  const id = +it.typeId;
  try { if (isMineral(id)) return 'minerals'; } catch {}
  try { if (iceProductIds && iceProductIds.has(id)) return 'ice'; } catch {}
  try {
    if (isPI(id)) {
      const t = bvMailPiTierNum(id);
      if (t === 4) return 'pi4';
      if (t === 3) return 'pi3';
      if (t === 2) return 'pi2';
      if (t === 1) return 'pi1';
      if (t === 0) return 'pi0';
      return 'pi0';
    }
  } catch {}
  if (bvMailIsGas(id, it.name)) return 'gas';
  if (bvMailIsMoon(id)) return 'moon';
  if (it.buildable) return 'components';
  return 'other';
}
const BV_MAIL_SECTIONS = [
  { key: 'minerals', title: 'MINERALS' },
  { key: 'ice', title: 'ICE PRODUCTS' },
  { key: 'pi4', title: 'PI — P4' },
  { key: 'pi3', title: 'PI — P3' },
  { key: 'pi2', title: 'PI — P2' },
  { key: 'pi1', title: 'PI — P1' },
  { key: 'pi0', title: 'PI — P0' },
  { key: 'gas', title: 'GAS & FULLERENES' },
  { key: 'moon', title: 'MOON MATERIALS' },
  { key: 'components', title: 'COMPONENTS' },
  { key: 'other', title: 'OTHER MATERIALS' }
];
function bvMailIndent(depth) {
  if (!depth || depth <= 0) return '- ';
  let s = '';
  for (let i = 0; i < depth; i++) s += '  ';
  return s;
}
function bvMailBuildSections(blocks, fmtLine) {
  // blocks: [{root, rows:[descendants in pre-order]}] — one atomic unit each.
  // Sections group top-level parents (fixed industry order); descendants ride
  // along inline under their parent so the tree never splits across sections.
  const byKey = new Map();
  for (const b of (blocks || [])) {
    if (!b || !b.root) continue;
    const k = bvMailGroup(b.root);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(b);
  }
  const out = [];
  for (const s of BV_MAIL_SECTIONS) {
    const list = byKey.get(s.key);
    if (!list || !list.length) continue;
    list.sort((a, b) => String(a.root.name || '').localeCompare(String(b.root.name || '')));
    const flat = [], starts = [];
    for (const b of list) {
      starts.push(flat.length);
      flat.push(fmtLine(b.root));
      for (const r of (b.rows || [])) flat.push(fmtLine(r));
    }
    out.push({ key: s.key, title: s.title + ' (' + list.length + ')', lines: flat, starts });
  }
  return out;
}
// Safety cap on deep expansion per mail (pathological chains stop as leaves).
const BV_MAIL_DEEP_MAX = 500;
// Expand remaining top-level items into parent+subtree blocks.
// - Respects depth-1 ticks ('g'/'r' keys, matching bpProgModel) + inventory
//   deduct per row; deeper rows use 'd' keys (forward-compat, UI never writes
//   them yet). Ticked-out or fully-covered branches prune their whole subtree.
// - Batches derive from the FULL need (pre-deduct), matching depth-1 math.
// - maxDepth caps descendant depth (1 = today's flat content, tree-ordered).
async function bvMailExpand(items, maxDepth, onProgress) {
  const ticked = bpProgRead();
  let invAgg = {};
  try { invAgg = stkDeductMap() || {}; } catch {}
  const doDeduct = ($('stkDeduct') && $('stkDeduct').checked) && Object.keys(invAgg).length > 0;
  try { deepSeedFrom((typeof bpProgSource === 'function') ? bpProgSource() : null); } catch {}
  let resolved = 0, expanded = 0;
  const prog = () => { try { onProgress && onProgress(resolved); } catch {} };
  const deduct = (typeId, full) => {
    let have = 0;
    try { have = (doDeduct && ownUse(typeId)) ? (invAgg[typeId] || 0) : 0; } catch {}
    return doDeduct ? Math.max(0, full - Math.floor(have || 0)) : full;
  };
  async function kidsOf(parentTid, parentName, parentFull, ci, ancestors, depth) {
    if (depth > maxDepth || expanded >= BV_MAIL_DEEP_MAX) return [];
    const node = await deepResolve(parentTid, parentName, ancestors);
    resolved++; prog();
    if (!node || !node.materials || !node.materials.length) return [];
    const batches = deepBatches(parentFull, node.productQty);
    const trail = ancestors.concat([+parentTid]);
    const mats = [];
    for (const m of node.materials) {
      const tid = deepMatId(m);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      const full = Math.max(0, Math.floor(deepMatQty(m) * batches));
      if (full <= 0) continue;
      if (!m.name) { try { m.name = await typeName(tid); } catch { m.name = 'Type ' + tid; } }
      const ck = progKey(ci, trail.concat([tid]), depth, node.kind === 'rx');
      if (ticked[ck]) continue;
      const toSend = deduct(tid, full);
      if (toSend <= 0) continue;
      mats.push({ tid, nm: m.name || ('Type ' + tid), full, toSend, ck });
    }
    // Child recipes resolve in parallel (memoized); buy/mine leaves then cost
    // nothing extra, buildable branches expand exactly as before by default.
    for (let i = 0; i < mats.length; i += 10) {
      const slice = mats.slice(i, i + 10);
      await Promise.all(slice.map(async e => {
        try { e.childNode = await deepResolve(e.tid, e.nm, trail); } catch { e.childNode = null; }
      }));
    }
    const entries = [];
    for (const e of mats) {
      let mineable = false;
      try { mineable = isMineable(e.tid); } catch {}
      const info = { hasBp: !!(e.childNode && e.childNode.kind === 'bp'), hasRx: !!(e.childNode && e.childNode.kind === 'rx'), mineable };
      const eff = deepModeFor(e.ck, info);
      const row = { typeId: e.tid, name: cleanName(e.nm), qty: e.toSend, fullQty: e.full, depth, mode: eff, ci };
      if ((eff === 'build' && info.hasBp) || (eff === 'react' && info.hasRx)) entries.push({ row, sub: e });
      else { entries.push({ row, sub: null }); expanded++; }
    }
    // Recurse expandable branches (5-wide) preserving recipe order.
    const subIx = entries.map((e, i) => (e.sub ? i : -1)).filter(i => i >= 0);
    for (let i = 0; i < subIx.length; i += 5) {
      const slice = subIx.slice(i, i + 5);
      const rs = await Promise.all(slice.map(ix => {
        const e = entries[ix].sub;
        return kidsOf(e.tid, e.nm, e.full, ci, trail, depth + 1);
      }));
      slice.forEach((ix, j) => { entries[ix].kids = rs[j] || []; });
    }
    const out = [];
    for (const e of entries) {
      out.push(e.row); expanded++;
      for (const k of (e.kids || [])) out.push(k);
    }
    return out;
  }
  const blocks = [];
  for (const it of ((items || []).filter(x => x && x.depth === 0))) {
    const ci = (it.ci !== undefined && it.ci !== null) ? +it.ci : -1;
    const rows = await kidsOf(it.typeId, it.name, it.fullQty || it.qty || 0, ci, [], 1);
    blocks.push({ root: it, rows });
  }
  return blocks;
}
// Group-aware chunker: the atomic spill unit is one parent+subtree block.
// Blocks move whole to the next part when possible; an oversized single block
// splits line-by-line with a "(cont.)" header. Sections use sec.starts (block
// start indices); sections without starts degrade to one block.
function bvMailChunkGrouped(header, sections, footer) {
  const parts = [];
  let cur = header;
  const push = () => { parts.push(cur); cur = header; };
  for (const sec of (sections || [])) {
    const head = '-- ' + sec.title + ' --';
    const lines = sec.lines || [];
    if (!lines.length) continue;
    const starts = (sec.starts && sec.starts.length) ? sec.starts : [0];
    const blocks = starts.map((s, i) => lines.slice(s, i + 1 < starts.length ? starts[i + 1] : lines.length)).filter(b => b && b.length);
    if (!blocks.length) continue;
    let cont = false; // this section already started in an earlier part
    let headOpen = false; // section header already emitted into cur
    const headText = () => head + (cont ? ' (cont.)' : '');
    for (const block of blocks) {
      const btext = block.join('\n');
      // 1) Try to append atomically (header first when not open in cur).
      const sep = (cur === header) ? '' : '\n\n';
      const withHead = headOpen ? '' : (headText() + '\n');
      if ((cur + sep + withHead + btext).length <= BV_MAIL_CHUNK) {
        cur += sep + withHead + btext;
        headOpen = true;
        continue;
      }
      // 2) Spill the whole block to a fresh part (cont. only if this
      // section already emitted content — a spill before its first block
      // starts it clean in the new part).
      if (cur !== header) { if (headOpen) cont = true; push(); headOpen = false; }
      const fresh = header + headText() + '\n' + btext;
      if (fresh.length <= BV_MAIL_CHUNK) {
        cur = fresh;
        headOpen = true;
        continue;
      }
      // 3) Oversized single block — split its lines across parts.
      cur = header + headText();
      headOpen = true;
      for (let i = 0; i < block.length; i++) {
        const seg = '\n' + block[i];
        if ((cur + seg).length > BV_MAIL_CHUNK && cur !== header + headText()) {
          push(); cont = true;
          cur = header + headText();
          headOpen = true;
        }
        cur += seg;
      }
    }
  }
  if (footer) cur += '\n' + footer;
  parts.push(cur);
  return parts;
}
function bvMailRemainingItems() {
  const { rows, rootName, runs } = bpProgModel();
  const ticked = bpProgRead();
  let invAgg = {};
  try { invAgg = stkDeductMap() || {}; } catch {}
  const doDeduct = ($('stkDeduct') && $('stkDeduct').checked) && Object.keys(invAgg).length > 0;
  // Buildable lookup for COMPONENTS grouping: top-level rows whose material
  // resolved to a sub-blueprint or reaction formula.
  let src = null;
  try { src = (typeof bpProgSource === 'function') ? bpProgSource() : null; } catch { src = null; }
  const buildableTop = new Set();
  try {
    (src && src.children ? src.children : []).forEach((c, ci) => {
      if (c && (c.child || c.reaction)) buildableTop.add(ci);
    });
  } catch {}
  const items = [];
  for (const r of rows) {
    // Depth 0/1 only — deeper rows are regenerated by bvMailExpand from the
    // depth-0 roots (same batches, same 'd'-key ticks); listing them here too
    // would duplicate every sub-tree.
    if (r.depth < 0 || r.depth >= 2 || ticked[r.key]) continue;
    const qty = Math.max(0, Math.floor(r.qty || 0));
    if (qty <= 0) continue;
    const have = (doDeduct && ownUse(r.typeId)) ? (invAgg[r.typeId] || 0) : 0;
    const toSend = doDeduct ? Math.max(0, qty - Math.floor(have)) : qty;
    if (toSend <= 0) continue;
    const typeId = +r.typeId;
    if (!Number.isFinite(typeId) || typeId <= 0) continue;
    const ci = (r && r.ci !== undefined) ? +r.ci : null;
    items.push({ typeId, name: cleanName(r.name || ('Type ' + r.typeId)), qty: toSend, fullQty: qty, depth: r.depth, mode: r.mode, ci, buildable: (r.depth === 0 && ci !== null && buildableTop.has(ci)) });
  }
  return { items, rootName, runs };
}
function bvMailChunk(header, lines, footer) {
  const parts = [];
  let cur = header;
  for (let i = 0; i < lines.length; i++) {
    const last = i === lines.length - 1;
    const seg = (cur === header ? '' : '\n') + lines[i] + (last && footer ? '\n' + footer : '');
    if ((cur + seg).length > BV_MAIL_CHUNK && cur !== header) {
      parts.push(cur);
      cur = header + lines[i] + (last && footer ? '\n' + footer : '');
    } else {
      cur += seg;
    }
  }
  parts.push(cur);
  return parts;
}
async function sendProgMail() {
  const btn = $('sendProgMail');
  const setBusy = b => { if (btn) btn.disabled = !!b; };
  try {
    if (!window.BVAuth || !BVAuth.signedIn()) { bvMailStatus('Sign in with SSO first, then send materials to Evemail.'); return; }
    const ch = await resolveBvCharacter();
    const cid = ch && (ch.id || ch.character_id || ch.CharacterID);
    if (!cid) { bvMailStatus('Signed in, but no character found — sign out and sign in again.'); return; }
    const src = bpProgSource();
    if (!src || !src.children || !src.children.length) { bvMailStatus('Run a calculation or pin a build first.'); return; }
    const { items, rootName, runs } = bvMailRemainingItems();
    if (!items.length) { bvMailStatus('Nothing remaining — all materials ticked or covered by inventory.'); return; }
    try { await ensureIceProducts(); } catch {}
    // Fresh-token up front (auto-refreshes the ~20-min access token instead
    // of failing the whole send). Throws "SSO session expired" when there is
    // nothing renewable — caught below into mail status.
    let mailToken;
    try { mailToken = await BVAuth.getAccessToken(); }
    catch (e) { bvMailStatus(e && e.message ? e.message : 'SSO session expired — sign in again.'); return; }
    const dateStr = new Date().toISOString().slice(0, 10);
    const title = (rootName || 'Build') + ' ×' + (runs || 1);
    // Depth-aware formatters: parents '-', descendants indented per level.
    const fmtLinked = it => bvMailIndent(it.depth) + '<url=showinfo:' + it.typeId + '>' + bvMailEsc(it.name) + '</url> x' + fmtN(it.qty);
    const fmtText = it => bvMailIndent(it.depth) + it.name + ' x' + fmtN(it.qty);
    const linkedHeader = title + ' — remaining materials (' + dateStr + ')\nSent from Blueprint Visualizer by RustyBot\n\n';
    setBusy(true);
    // Wait-then-send: resolve the full chain tree before chunking.
    bvMailStatus('Resolving sub-material chains…');
    let blocks = await bvMailExpand(items, Infinity, n => bvMailStatus('Resolving sub-material chains (' + n + ' lookups)…'));
    let parts = bvMailChunkGrouped(linkedHeader, bvMailBuildSections(blocks, fmtLinked), '');
    let linked = true;
    if (parts.length > BV_MAIL_MAX_PARTS) {
      // Depth-cap fallback: retry the full tree at depth 1 (flat, tree-ordered)
      // before giving up links for plaintext.
      bvMailStatus('Full chain tree needs ' + parts.length + ' mails — retrying capped at depth 1…');
      blocks = await bvMailExpand(items, 1, null);
      parts = bvMailChunkGrouped(linkedHeader, bvMailBuildSections(blocks, fmtLinked), '');
    }
    if (parts.length > BV_MAIL_MAX_PARTS) {
      bvMailStatus('Build too large for linked Evemail (needs ' + parts.length + ' mails, cap is 3) — will send as plain text without clickable links.');
      const ok = window.confirm('This build is too large for linked Evemail (would need ' + parts.length + ' mails, max is 3).\n\nSend as plain text instead (no clickable item links)?\n\nOK = send text-only · Cancel = abort');
      if (!ok) { bvMailStatus('Evemail send cancelled — no mails sent.'); return; }
      blocks = await bvMailExpand(items, Infinity, null);
      parts = bvMailChunkGrouped(linkedHeader, bvMailBuildSections(blocks, fmtText), '');
      linked = false;
      if (parts.length > BV_MAIL_MAX_PARTS) {
        // Absolute cap: keep first 3, note truncation in the last part.
        parts = parts.slice(0, BV_MAIL_MAX_PARTS);
        parts[BV_MAIL_MAX_PARTS - 1] += '\n…truncated — full list in Blueprint Visualizer > Build Progress';
      }
    }
    const total = parts.length;
    const mailPost = async (subject, body, part, parts) => {
      const sendOnce = async token => {
        const r = await fetch(bvBackendBase() + '/api/bv/mail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ recipient_id: String(cid), subject, body, part, parts })
        });
        const j = await r.json().catch(() => ({}));
        return { r, j };
      };
      let { r, j } = await sendOnce(mailToken);
      if (r.status === 401) {
        // Token died mid-send (multi-part sends straddle expiry) — one
        // forced refresh + retry before giving up.
        try {
          await BVAuth.refreshToken();
          mailToken = await BVAuth.getAccessToken();
          ({ r, j } = await sendOnce(mailToken));
        } catch {}
      }
      if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    };
    for (let i = 0; i < total; i++) {
      const n = i + 1;
      bvMailStatus('Sending Evemail ' + n + '/' + total + (linked ? ' (linked items)…' : ' (plain text — too large for links)…'));
      const subject = (title + ' materials' + (total > 1 ? ' (Part ' + n + '/' + total + ')' : '')).slice(0, 1000);
      await mailPost(subject, parts[i], n, total);
    }
    bvMailStatus('Evemail sent to ' + ((ch && ch.name) || 'your character') + ' (' + total + '/' + total + (linked ? ', linked items' : ', plain text') + ') — check in-game mail from RustyBot.');
  } catch (e) {
    bvMailStatus('Evemail send failed: ' + (e && e.message ? e.message : e));
  } finally {
    setBusy(false);
  }
}

async function buildRawLines() {
  const out = [];
  if (!S.root || !S.root.children) return out;
  for (const c of S.root.children.filter(x=>x.mode==='build' && x.child && x.child.materials)) {
    const need = c.perRun * (S.runs||1);
    for (const L of (await buildLeafLines(c, need, S.root.children.indexOf(c)))) {
      out.push({ type_id: L.type_id, name: L.name, qty: L.qty, unit: L.unit, total: L.total });
    }
  }
  return out;
}
async function buildAggLines() {
  const map = new Map();
  for (const r of (await buildRawLines())) {
    const k = r.type_id;
    if (!map.has(k)) map.set(k, { type_id:k, name:r.name, qty:0, unit:r.unit });
    map.get(k).qty += r.qty;
  }
  return [...map.values()].map(v => ({ ...v, total: v.unit * v.qty }));
}

async function renderShoppingList(runs) {
  const sb = $('shoppingBody'), meta = $('shopMeta'), totals = $('shoppingTotals');
  if (!sb) return;
  S.shopRows = [];
  const bom = S.bom || effLeafCost(runs);
  const shop = bom.filter(l => l.mode === 'buy' || l.mode === 'react');
  if (!shop.length) {
    const msg = !bom.length ? 'No calculation yet.' : 'Nothing to buy — all items set to Build or Mine.';
    sb.innerHTML = '<tr><td colspan="7" style="color:var(--text3)">' + msg + '</td></tr>';
    const sg = $('shoppingSummary'); if (sg) { sg.style.display='none'; sg.innerHTML=''; }
    if (meta) meta.textContent = '0 items';
    if (totals) totals.textContent = bom.length ? 'Full total 0 ISK · Volume 0 m³' : '';
    return;
  }
  const ded = stkDeductSnapshot();
  const invAgg = ded.map;
  const doDeduct = ($('stkDeduct') && $('stkDeduct').checked) && Object.keys(invAgg || {}).length > 0;
  const snap = ded.snap;
  const locNameForDeduct = doDeduct ? ((snap && snap.systemName) ? (snap.systemName + (snap.eff ? ' @ ' + Math.round(snap.eff*100) + '% refine' : '')) : (stkCurrentSysName() || 'all locations')) : '';
  // compute per-line have/to-buy and volumes/totals
  // Preload volumes in one batch (was sequential ESI per row).
  try { await preloadVolumes(shop.map(l => l.type_id)); } catch {}
  let volNeed = 0, volBuy = 0, totalNeed = 0, totalBuy = 0;
  const rows = shop.map(l => {
    const have = doDeduct && ownUse(l.type_id) ? (invAgg[l.type_id] || 0) : 0;
    const toBuy = doDeduct ? Math.max(0, l.qty - have) : l.qty;
    const unit = l.unit || 0;
    return { l, have, toBuy, unit, totalNeed: unit * l.qty, totalBuy: unit * toBuy };
  });
  for (const r of rows) {
    volNeed += (await typeVolume(r.l.type_id)) * r.l.qty;
    volBuy += (await typeVolume(r.l.type_id)) * r.toBuy;
    totalNeed += r.totalNeed;
    totalBuy += r.totalBuy;
  }
  S.shopRows = rows;
  sb.innerHTML = rows.map(r => {
    const clean = cleanName(r.l.name);
    const useOwn = doDeduct && ownUse(r.l.type_id);
    const haveTxt = useOwn ? fmtN(r.have) : '—';
    const toBuyTxt = fmtN(r.toBuy);
    const needTxt = fmtN(r.l.qty);
    const haveCls = useOwn && r.have >= r.l.qty ? ' style="color:var(--build)"' : '';
    const toBuyCls = r.toBuy === 0 ? ' style="color:var(--build)"' : '';
    return '<tr><td>' + clean + (isPI(r.l.type_id) ? ' <span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(r.l.type_id) + '</span>' : '') + (r.l.mode === 'react' ? ' <span class="pill react">REACT</span>' : '') + '</td><td>' + needTxt + '</td><td' + haveCls + '>' + haveTxt + '</td><td' + toBuyCls + '>' + toBuyTxt + '</td><td>' + fmtISK(r.unit) + '</td><td>' + fmtISK(r.totalBuy) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(r.l.type_id) + '" title="Price check"><i class="fas fa-chart-line"></i></a>' + piIcon(r.l.type_id) + infoButton(r.l.type_id) + ' <a class="mine-link" data-mine="' + r.l.type_id + '" title="Mining plan"><i class="fas fa-gem"></i></a></td></tr>';
  }).join('');
  // prominent summary grid with full total — de-dupe when nothing is saved
  const sumGrid = $('shoppingSummary');
  const hubName = (D.hubs.find(h => h.region === hub()) || {}).name || hub();
  const basisLabel = ($('basis').value === 'buy' ? 'buy' : 'sell');
  if (sumGrid) {
    sumGrid.style.display = 'grid';
    const saving = totalNeed - totalBuy;
    if (doDeduct && saving > 0) {
      sumGrid.innerHTML =
        '<div class="summary-card"><div class="k">Full total (need)</div><div class="v">' + fmtISK(totalNeed) + '</div><div class="k">' + fmtN(Math.round(volNeed)) + ' m³ · ' + shop.length + ' type' + (shop.length>1?'s':'') + ' · @ ' + hubName + ' (' + basisLabel + ')</div></div>' +
        '<div class="summary-card"><div class="k">Inventory covers</div><div class="v" style="color:var(--build)">' + fmtISK(saving) + '</div><div class="k">saved · Have ' + fmtN(Object.values(invAgg).reduce((a,b)=>a+b,0)) + ' units tracked' + (locNameForDeduct ? ' @ ' + locNameForDeduct : '') + '</div></div>' +
        '<div class="summary-card"><div class="k">To buy total</div><div class="v" style="color:var(--accent)">' + fmtISK(totalBuy) + '</div><div class="k">' + fmtN(Math.round(volBuy)) + ' m³ to buy · after deduct' + (locNameForDeduct ? ' @ ' + locNameForDeduct : '') + '</div></div>';
    } else {
      // no saving — single total is enough, don't duplicate 32M/32M
      sumGrid.innerHTML =
        '<div class="summary-card"><div class="k">Total</div><div class="v">' + fmtISK(totalNeed) + '</div><div class="k">' + fmtN(Math.round(volNeed)) + ' m³ · ' + shop.length + ' type' + (shop.length>1?'s':'') + ' · @ ' + hubName + ' (' + basisLabel + ')'
        + (doDeduct && locNameForDeduct ? ' · @ ' + locNameForDeduct : '') + '</div></div>';
    }
  }
  if (meta) {
    const saving = totalNeed - totalBuy;
    if (doDeduct && saving > 0) meta.textContent = shop.length + ' items · full ' + fmtISK(totalNeed) + ' → buy ' + fmtISK(totalBuy) + ' (saved ' + fmtISK(saving) + ')';
    else meta.textContent = shop.length + ' items · ' + fmtISK(totalNeed);
  }
  if (totals) {
    const locHint = locNameForDeduct ? ' @ ' + locNameForDeduct : '';
    if (doDeduct && (totalNeed - totalBuy) > 0) {
      totals.textContent = 'Full total ' + fmtISK(totalNeed) + ' (' + fmtN(Math.round(volNeed)) + ' m³) · Have covers ' + fmtISK(totalNeed - totalBuy) + locHint + ' · To buy ' + fmtISK(totalBuy) + ' · Volume to buy ~' + fmtN(Math.round(volBuy)) + ' m³ · Prices @ ' + hubName + ' (' + basisLabel + ')';
    } else {
      totals.textContent = 'Total ' + fmtISK(totalNeed) + ' · Volume ~' + fmtN(Math.round(volNeed)) + ' m³ · Prices @ ' + hubName + ' (' + basisLabel + ') · ' + shop.length + ' type' + (shop.length>1?'s':'') + ' to buy' + (doDeduct && locHint ? locHint : '');
    }
  }
}

function shoppingLines() {
  const bom = S.bom || [];
  const shop = bom.filter(l => l.mode === 'buy' || l.mode === 'react');
  const invAgg = stkDeductMap();
  const doDeduct = ($('stkDeduct') && $('stkDeduct').checked) && Object.keys(invAgg || {}).length > 0;
  return shop.map(l => {
    const have = doDeduct && ownUse(l.type_id) ? (invAgg[l.type_id] || 0) : 0;
    const toBuy = doDeduct ? Math.max(0, l.qty - have) : l.qty;
    const needTxt = fmtN(l.qty);
    const haveTxt = doDeduct ? fmtN(have) : '0';
    const toBuyTxt = fmtN(toBuy);
    if (doDeduct) return cleanName(l.name) + ' need ' + needTxt + ' have ' + haveTxt + ' to buy ' + toBuyTxt + ' — ' + fmtISK(l.unit) + ' ea = ' + fmtISK(l.unit * toBuy);
    return cleanName(l.name) + ' x' + l.qty + ' — ' + fmtISK(l.unit) + ' ea = ' + fmtISK(l.total);
  });
}
function shoppingBuyLines() {
  const bom = S.bom || [];
  const shop = bom.filter(l => l.mode === 'buy' || l.mode === 'react');
  const invAgg = stkDeductMap();
  const doDeduct = ($('stkDeduct') && $('stkDeduct').checked) && Object.keys(invAgg || {}).length > 0;
  return shop.filter(l => {
    if (!doDeduct) return true;
    if (!ownUse(l.type_id)) return true;
    const toBuy = Math.max(0, l.qty - (invAgg[l.type_id]||0));
    return toBuy > 0;
  }).map(l => {
    const have = (doDeduct && ownUse(l.type_id)) ? (invAgg[l.type_id]||0) : 0;
    const toBuy = doDeduct ? Math.max(0, l.qty - have) : l.qty;
    return cleanName(l.name) + ' x' + toBuy;
  });
}

// ---- multibuy + appraisal ----
function cleanName(n) { return n.replace(/ \(built\)$/, '').replace(/ \(react: .*\)$/, ''); }
function multibuyLines() { return S.bom.filter(l => l.mode === 'buy' || l.mode === 'react').map(l => cleanName(l.name) + ' x' + l.qty); }
function bindHandoffs() {
  const bbAll = $('bulkBuyAll'); if (bbAll) bbAll.onclick = async () => { try { await bulkSetModes('buy'); } catch (e) { status('Bulk set failed.'); } };
  const bbAuto = $('bulkBuildAll'); if (bbAuto) bbAuto.onclick = async () => { try { await bulkSetModes('auto'); } catch (e) { status('Bulk set failed.'); } };
  $('copyMultibuy').onclick = async () => {
    const lines = multibuyLines();
    await copyToClipboard(
      lines.length ? lines.join('\n') : '',
      'Multibuy copied (' + lines.length + ' lines).',
      'Nothing to copy — everything is built.'
    );
  };
  $('appraiseBom').onclick = () => { const lines = S.bom.map(l => l.qty + ' x ' + cleanName(l.name)); if (!lines.length) return; window.open(appraisalURL(lines), '_blank', 'noopener'); };
  $('appraiseOut').onclick = () => { if (!S.product) return; window.open(appraisalURL([(S.product.qty * (parseInt($('runs').value) || 1)) + ' x ' + S.product.name]), '_blank', 'noopener'); };
  const cs = $('copyShopping'); if (cs) cs.onclick = async () => {
    const lines = shoppingLines();
    await copyToClipboard(
      lines.length ? lines.join('\n') : '',
      'Shopping list copied (' + lines.length + ' items).',
      'Nothing to buy — everything is built or mined.'
    );
  };
  const csm = $('copyShopMultibuy'); if (csm) csm.onclick = async () => {
    const lines = shoppingBuyLines();
    await copyToClipboard(
      lines.length ? lines.join('\n') : '',
      'Shopping multibuy copied (' + lines.length + ' lines — after inventory deduct).',
      'Nothing to buy — everything is covered by inventory.'
    );
  };
  const apS = $('appraiseShopping'); if (apS) apS.onclick = () => { const bom = S.bom || []; const shop = bom.filter(l => l.mode==='buy'||l.mode==='react'); const invAgg = stkDeductMap(); const doDeduct = ($('stkDeduct') && $('stkDeduct').checked) && Object.keys(invAgg||{}).length>0; const lines = shop.map(l => { const toBuy = (doDeduct && ownUse(l.type_id)) ? Math.max(0, l.qty - (invAgg[l.type_id]||0)) : l.qty; return toBuy>0 ? toBuy + ' x ' + cleanName(l.name) : null; }).filter(Boolean); if (!lines.length) { status('Nothing to appraise — all built/mined/owned.'); return; } window.open(appraisalURL(lines), '_blank', 'noopener'); };
  const cb = $('copyBuildList'); if (cb) cb.onclick = async () => { const lines = await buildRawLines(); const t = lines.map(r => r.name + ' x' + fmtN(r.qty) + ' — ' + fmtISK(r.unit) + ' ea = ' + fmtISK(r.total)).join('\n'); await copyToClipboard(t, 'Build list copied (' + lines.length + ' raws).', 'Nothing to build — set items to Build.'); };
  const cbm = $('copyBuildMultibuy'); if (cbm) cbm.onclick = async () => {
    const agg = await buildAggLines();
    await copyToClipboard(
      agg.length ? agg.map(v => v.name + ' x' + fmtN(v.qty)).join('\n') : '',
      'Build multibuy copied (' + agg.length + ' types).',
      'Nothing to build — set materials to Build.'
    );
  };
  const ab = $('appraiseBuildList'); if (ab) ab.onclick = async () => { const agg = await buildAggLines(); if (!agg.length) { status('Nothing to build.'); return; } const lines = agg.map(v => v.qty + ' x ' + v.name); window.open(appraisalURL(lines), '_blank', 'noopener'); };
  const tb = $('toggleBuildExpand'); if (tb) tb.onclick = () => { const ds = document.querySelectorAll('#buildList details'); if (!ds.length) return; const anyClosed = [...ds].some(d=>!d.open); ds.forEach(d=>d.open = anyClosed); tb.innerHTML = anyClosed ? '<i class="fas fa-compress"></i> Collapse' : '<i class="fas fa-expand"></i> Expand'; };
  const pinp = $('pinProgress'); if (pinp) pinp.onclick = () => {
    if (!S.root || !S.root.children) { status('Run a calculation first, then pin it.'); return; }
    bpProgPinCurrent();
  };
  const cp = $('copyProgress'); if (cp) cp.onclick = async () => { if (!S.root) { toast('Run a calculation first.', 'warn'); return; } const t = bpProgExportText(); await copyToClipboard(t, 'Checklist copied (' + t.split('\n').length + ' lines).', 'Nothing on the checklist yet.'); };
  const cpl = $('copyProgressLeft'); if (cpl) cpl.onclick = () => copyRemainingMultibuy();
  const cplB = $('copyProgressLeftBottom'); if (cplB) cplB.onclick = () => copyRemainingMultibuy();
  const tpe = $('toggleProgExpand'); if (tpe) tpe.onclick = () => {
    let withKids = [];
    try { withKids = bpProgModel().rows.filter(r => r.key !== 'root' && r.hasKids).map(r => r.key); } catch {}
    if (!withKids.length) return;
    const anyOpen = withKids.some(k => bpProgExpanded.has(k));
    if (anyOpen) withKids.forEach(k => bpProgExpanded.delete(k)); else withKids.forEach(k => bpProgExpanded.add(k));
    renderBuildProgress();
    tpe.innerHTML = anyOpen ? '<i class="fas fa-expand"></i> Expand' : '<i class="fas fa-compress"></i> Collapse';
  };
  const clp = $('clearProgress'); if (clp) clp.onclick = () => { bpProgWrite({}); renderBuildProgress(); status('Progress ticks cleared.'); };
  const pr = $('progRestore'); if (pr) pr.onclick = () => { calcRestoreRemoved(); };
  const cpb = $('copyProgBps'); if (cpb) cpb.onclick = async () => {
    let rows = [];
    try { rows = trackedBlueprintList(); } catch {}
    await copyToClipboard(rows.length ? rows.map(b => b.name).join('\n') : '', 'Blueprint list copied (' + rows.length + ').', 'No blueprints resolved yet.');
  };
  const xpb = $('clearProgBps'); if (xpb) xpb.onclick = () => {
    const m = bpProgRead();
    let n = 0;
    for (const k of Object.keys(m)) if (String(k).startsWith('bpx:')) { delete m[k]; n++; }
    bpProgWrite(m);
    renderProgBlueprints();
    status(n ? 'Cleared ' + n + ' blueprint tick' + (n === 1 ? '' : 's') + '.' : 'No blueprint ticks to clear.');
  };
  const unp = $('unpinProgress'); if (unp) unp.onclick = async () => {
    S.pinnedSel = 'live'; bpPinsSave();
    unp.disabled = true;
    try { await loadInventory(); } catch {}
    try { renderBuildProgress(); } catch {}
    unp.disabled = false;
    status('Tracking the live calculation — materials re-pulled from game.');
  };
  const smp = $('sendProgMail'); if (smp) smp.onclick = () => { sendProgMail(); };
}

// ---- OCR (kept from BPC, trimmed) ----
let tessWorker = null;
async function ensureTess() { if (window.Tesseract) return window.Tesseract; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); return window.Tesseract; }
async function ocrFile(f) {
  if (!f) return; status('Running OCR…');
  try {
    const T = await ensureTess();
    if (!tessWorker) tessWorker = await T.createWorker('eng');
    const { data: { text } } = await tessWorker.recognize(f);
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let ci = lines.findIndex(l => /copy.*run.*remaining/i.test(l));
    for (let i = Math.max(0, ci - 3); i < (ci > 0 ? ci : Math.min(10, lines.length)); i++) {
      const m = lines[i].match(/^(.+?)\s+blueprint/i); if (m && !/:/.test(lines[i])) { $('bpName').value = m[1].trim() + ' Blueprint'; break; }
    }
    const me = text.match(/ME[:\s]*(\d{1,2})\s*%/i), te = text.match(/TE[:\s]*(\d{1,2})\s*%/i), rn = text.match(/(\d+)\s+runs?\s+remaining/i);
    if (me) $('me').value = Math.min(10, me[1]); if (te) $('te').value = Math.min(20, te[1]); if (rn) $('runs').value = rn[1];
    status('OCR done — check name/ME/TE/runs, then Calculate.');
  } catch (e) { status('OCR failed: ' + e.message); }
}

// ---- My Blueprints ----
function updateSsoBtn() { const b = $('ssoBtn'); const c = window.BVAuth && BVAuth.character(); const nm = c && (c.name || c.character_name || c.CharacterName); if (nm) b.innerHTML = '<i class="fas fa-user"></i> ' + nm; }
// Shared null-safe character resolve (self-heals sessions stored before the char fix).
async function resolveBvCharacter() {
  if (!window.BVAuth || !BVAuth.signedIn()) return null;
  let ch = null;
  try { ch = BVAuth.character(); } catch { ch = null; }
  if (!ch) {
    try {
      const accessToken = await BVAuth.getAccessToken().catch(() => null);
      if (!accessToken) return null;
      const v = await (await fetch('https://login.eveonline.com/oauth/verify', { headers: { Authorization: 'Bearer ' + accessToken } })).json();
      if (v && v.CharacterID) { ch = { id: String(v.CharacterID), name: v.CharacterName || 'Unknown' }; try { localStorage.setItem('bv_esi_char', JSON.stringify(ch)); } catch {} }
    } catch {}
  }
  return ch || null;
}
// ESI skill type IDs for the calculator's Industry / Advanced Industry selects.
const SKILL_INDUSTRY = 3380, SKILL_ADV_INDUSTRY = 3388;
const SKILL_REPROCESSING = 3385, SKILL_REPROCESSING_EFF = 3386;
async function loadMySkills() {
  if (!window.BVAuth || !BVAuth.signedIn()) { status('Sign in with SSO first, then load skills.'); return; }
  status('Loading industry skills from SSO…');
  try {
    const ch = await resolveBvCharacter();
    if (!ch) { status('Signed in, but no character stored — Sign out and sign in again.'); return; }
    const cid = ch.id || ch.character_id || ch.CharacterID;
    if (!cid) { status('Signed in, but no character ID — Sign out and sign in again.'); return; }
    const s = await BVAuth.api('/characters/' + cid + '/skills/?datasource=tranquility');
    const list = (s && s.skills) || [];
    const lvl = id => { const r = list.find(x => x.skill_id === id); return r ? Math.min(5, Math.max(0, r.active_skill_level || 0)) : null; };
    const ind = lvl(SKILL_INDUSTRY), adv = lvl(SKILL_ADV_INDUSTRY);
    if (ind === null && adv === null) { status('No Industry skills found on this character (both left at current values).'); return; }
    if (ind !== null) $('indSkill').value = ind;
    if (adv !== null) $('advSkill').value = adv;
    status('Skills loaded: Industry ' + (ind === null ? '—' : ind) + ', Adv Industry ' + (adv === null ? '—' : adv) + ' — hit Calculate.');
  } catch (e) { status('Skill load failed: ' + e.message); }
}
async function loadRefiningYield() {
  if (!window.BVAuth || !BVAuth.signedIn()) { status('Sign in with SSO first, then sync refining.'); return; }
  status('Loading refining yield from SSO…');
  try {
    const ch = await resolveBvCharacter();
    if (!ch) { status('Signed in, but no character — Sign out and sign in again.'); return; }
    const cid = ch.id || ch.character_id || ch.CharacterID;
    if (!cid) { status('No character ID — re-login.'); return; }
    const s = await BVAuth.api('/characters/' + cid + '/skills/?datasource=tranquility');
    const list = (s && s.skills) || [];
    const lvl = id => { const r = list.find(x => x.skill_id === id); return r ? Math.min(5, Math.max(0, r.active_skill_level || 0)) : 0; };
    const R = (window.BV_DATA && BV_DATA.refining) || { base:50, skills:{reprocessing:3385, efficiency:3386}, rigBonus:[0,1,2], structureBonus:{npc:0,athannor:2,tatara:2} };
    const reproc = lvl(R.skills?.reprocessing ?? SKILL_REPROCESSING);
    const effic  = lvl(R.skills?.efficiency  ?? SKILL_REPROCESSING_EFF);
    let y = (R.base ?? 50) + 3*reproc + 2*effic;
    // structure + rig bonus from current picker (keeps Structure picker as source of truth)
    try {
      const stId = ($('structure') && $('structure').value) || 'npc';
      const sb = (R.structureBonus && R.structureBonus[stId] != null) ? R.structureBonus[stId] : 0;
      y += sb;
      const rigIdx = parseInt(($('rigs') && $('rigs').value) || 0, 10);
      const rb = (R.rigBonus && R.rigBonus[rigIdx] != null) ? R.rigBonus[rigIdx] : 0;
      y += rb;
    } catch {}
    y = Math.min(100, Math.max(50, y));
    const rounded = Math.round(y*10)/10;
    $('refinePct').value = rounded;
    try { savePrefs(); } catch {}
    status('Refining yield synced: ' + reproc + ' Reprocessing, ' + effic + ' Efficiency → ' + rounded + '% (structure/rig included, capped 100). Edit the box if you have RX implant or standing bonus.');
    // live-update mining plan if it is already visible
    if (S.root && S.root.children && S.root.children.some(c=>c.mode==='mine')) {
      try { planMining(undefined, { auto:true }); } catch {}
    }
  } catch (e) { status('Refining sync failed: ' + (e && e.message ? e.message : e)); }
}
// ESI (character + corp endpoints agree): runs === -1 marks an original;
// a copy carries runs remaining (>= 0). quantity is -1 for an original and
// -2 for a copy, so it must NOT be used the other way round — doing so hid
// every BPC behind the BPO tag and emptied the "BPC only" filter.
const bpIsBPO = b => b.runs === -1;
// Loaded list state — the search box filters these rows locally, no refetch.
// Location display is OFF for now (structure ACLs make it unreliable) — flip to true to re-enable.
const BV_SHOW_LOCATIONS = false;
let myBps = [], myBpNames = {}, myLocNames = {}, myStructScopeMissing = false, myStructNoAccess = false, myBpWarn = '';
// My Blueprints pager — the list used to be hard-capped at 100 rows, which
// silently cut every BPC past the originals. Now the full hangar loads and
// the UI pages through it.
const MY_BP_PAGE_OPTIONS = [25, 75, 100];
let myBpPageSize = 25, myBpPage = 1;
try {
  const saved = parseInt(localStorage.getItem('bvBpPageSize') || '', 10);
  if (MY_BP_PAGE_OPTIONS.includes(saved)) myBpPageSize = saved;
} catch {}
function filteredBpRows() {
  const q = (($('bpSearch') && $('bpSearch').value) || '').trim().toLowerCase();
  return myBps.filter(b => {
    if (!q) return true;
    const nm = (myBpNames[b.type_id] || '').toLowerCase();
    const loc = (BV_SHOW_LOCATIONS && bpLocName(b)) || '';
    return nm.includes(q) || loc.toLowerCase().includes(q) || String(b.type_id).includes(q);
  });
}
function setBpPage(pg, pages) {
  myBpPage = Math.min(Math.max(1, pg), Math.max(1, pages));
  renderBpRows();
}
// Player structure IDs are 13+ digits. Naming them needs esi-universe.read_structures.v1 AND
// docking access — ESI 403s by design when the character isn't on the structure ACL.
const bpIsStructureId = id => +id >= 1000000000000;
function bvTokenScopes() {
  try {
    const t = window.BVAuth && BVAuth.tokens();
    if (!t || !t.access_token) return [];
    const p = JSON.parse(atob(t.access_token.split('.')[1]));
    const s = p.scp || p.scope || [];
    return Array.isArray(s) ? s : String(s).split(' ');
  } catch { return []; }
}
// Structure name cache (7d) + denial stamps (1h, mirrors ESI's own error caching).
function bvStructCacheRead() { try { return JSON.parse(localStorage.getItem('bvStructNames') || '{}'); } catch { return {}; } }
function bvStructCacheWrite(c) { try { localStorage.setItem('bvStructNames', JSON.stringify(c)); } catch {} }
function bvDeniedRead() { try { return JSON.parse(localStorage.getItem('bvStructDenied') || '{}'); } catch { return {}; } }
function bvDeniedWrite(d) { try { localStorage.setItem('bvStructDenied', JSON.stringify(d)); } catch {} }
function bvPrefillStructNames() {
  try {
    const sc = bvStructCacheRead(), now = Date.now(), kept = {};
    for (const [id, e] of Object.entries(sc)) {
      if (e && e.name && now - e.ts < 7 * 864e5) { myLocNames[id] = e.name; kept[id] = e; }
    }
    bvStructCacheWrite(kept);
  } catch {}
}
function bpLocName(b) {
  if (myLocNames[b.location_id]) return myLocNames[b.location_id];
  // Unresolvable structure: show last digits so different structures stay distinguishable.
  if (bpIsStructureId(b.location_id)) return 'Structure …' + String(b.location_id).slice(-4);
  return null;
}
function bpRowHtml(b) {
  const tag = bpIsBPO(b) ? 'BPO' : ('BPC' + (b.runs > 0 ? ' ×' + b.runs : ''));
  const nm = myBpNames[b.type_id] || ('Type ' + b.type_id);
  const loc = BV_SHOW_LOCATIONS ? bpLocName(b) : null;
  const locHtml = loc ? ' · <span class="nums">@ ' + loc + (b.location_flag ? ' (' + b.location_flag + ')' : '') + '</span>' : '';
  return '<div style="display:flex;gap:.4rem;align-items:center;padding:.25rem 0;border-bottom:1px solid var(--border)"><span style="flex:1"><b data-bpname="' + b.type_id + '">' + nm + '</b> <span class="pill">' + tag + '</span> · ME' + b.material_efficiency + '/TE' + b.time_efficiency + locHtml + '</span>' + infoButton(b.type_id) + '<button class="mode-btn" data-bp="' + b.type_id + '" data-me="' + b.material_efficiency + '" data-te="' + b.time_efficiency + '" data-runs="' + (b.runs > 0 ? b.runs : '') + '" data-bpo="' + (bpIsBPO(b) ? '1' : '') + '">Load</button><button class="mode-btn" data-sendbp="' + b.type_id + '" data-me="' + b.material_efficiency + '" data-te="' + b.time_efficiency + '" data-runs="' + (b.runs > 0 ? b.runs : '') + '" data-bpo="' + (bpIsBPO(b) ? '1' : '') + '" title="Calculate and pin to the Build Progress tab">Send to Build</button></div>';
}
async function bpApplyRow(btn) {
  $('me').value = Math.min(10, +btn.dataset.me || 0); $('te').value = Math.min(20, +btn.dataset.te || 0);
  if (!btn.dataset.bpo && +btn.dataset.runs > 0) $('runs').value = +btn.dataset.runs;
  $('bpName').value = await typeName(+btn.dataset.bp);
  savePrefs();
}
// Shared by the sidebar + bottom-of-calculator Send buttons: recalculate,
// pin the live build, and switch to Build Progress.
async function sendCalcToBuild() {
  // A fit is already the live root — just pin it, don't re-run a blueprint calc.
  if (S.root && S.lastCalc && S.lastCalc.fit) {
    if (bpProgPinCurrent()) switchMainView('prog');
    else status('Nothing to send.');
    return;
  }
  const name = ($('bpName') && $('bpName').value || '').trim();
  if (!name) { status('Enter a blueprint name first.'); return; }
  await calculate();
  if (bpProgPinCurrent()) switchMainView('prog');
  else status('Nothing to send — calculation produced no materials.');
}
// Pin the current calculation into the tracked-build list (max 5, persisted).
// Progress keeps working while you browse other blueprints; sub-blueprint
// details merged in the background refresh the matching pin (child/reaction
// data only — pinned per-run quantities are preserved).
function bpProgPinCurrent(silent) {
  if (!S.root || !S.root.children) return false;
  try {
    if (!Array.isArray(S.pinnedBuilds)) S.pinnedBuilds = [];
    const snap = JSON.parse(JSON.stringify({ bpId: S.root.bpId, bpName: S.root.bpName, mode: S.root.mode, runs: S.runs || parseInt(($('runs') && $('runs').value) || 1), productTypeId: (S.product && S.product.type_id) || null, children: S.root.children }));
    const ix = S.pinnedBuilds.findIndex(p => String(p.bpId) === String(snap.bpId));
    if (ix >= 0) {
      // Re-send refreshes quantities; keep existing order, reselect it.
      S.pinnedBuilds[ix] = snap;
      S.pinnedSel = String(snap.bpId);
    } else {
      if (S.pinnedBuilds.length >= BV_MAX_PINS) {
        if (!silent) status('Pin limit (' + BV_MAX_PINS + ') — unpin one first.');
        return false;
      }
      S.pinnedBuilds.push(snap);
      S.pinnedSel = String(snap.bpId);
    }
    bpPinsSave();
    if (!silent) { renderBuildProgress(); switchMainView('prog'); status('Sent ' + snap.bpName + ' ×' + snap.runs + ' to Build Progress (' + S.pinnedBuilds.length + '/' + BV_MAX_PINS + ' pinned).'); }
    try { bpProgDeepEnrich(); } catch {}
    return true;
  } catch { return false; }
}
// Merge background-enriched child/reaction details into the matching pin
// without touching its pinned per-run quantities. Sourcing modes merge too
// so toggles (Buy/Build/…) stay live on pins; deep rows follow the shared
// path-keyed store on their own.
function bpProgRefreshPin() {
  try {
    if (!S.root || !S.root.bpId) return;
    const pin = (S.pinnedBuilds || []).find(p => String(p.bpId) === String(S.root.bpId));
    if (!pin || !pin.children) return;
    // Items the user removed from the live list drop out of the pin too, so
    // Build Progress mirrors the Calculator exactly.
    const liveIds = new Set((S.root.children || []).filter(Boolean).map(c => c.type_id));
    if (pin.children.length) {
      const before = pin.children.length;
      pin.children = pin.children.filter(x => x && liveIds.has(x.type_id));
      if (pin.children.length !== before) { try { bpProgLastSrc = null; } catch {} }
    }
    for (const c of (S.root.children || [])) {
      const pc = (pin.children || []).find(x => x && x.type_id === c.type_id);
      if (!pc) continue;
      if (c.mode) pc.mode = c.mode;
      // Fit Builder: mirror the include checkbox so unticking an item drops it
      // from the pinned Build Progress too. Non-fit blueprints never set
      // include, so their pins are left untouched.
      if (c.include !== undefined) pc.include = c.include;
      if (c.child) pc.child = JSON.parse(JSON.stringify(c.child));
      if (c.reaction) pc.reaction = JSON.parse(JSON.stringify(c.reaction));
    }
    bpPinsSave();
  } catch {}
}
function bpProgSource() { return bpProgSelPin() || S.root; }
function bindBpLoadButtons(box) {
  box.querySelectorAll('[data-bp]').forEach(btn => btn.onclick = async () => {
    await bpApplyRow(btn);
    document.querySelector('[data-tab="calc"]').click();
    status('Loading ' + $('bpName').value + ' (ME' + $('me').value + '/TE' + $('te').value + ( $('runs').value ? ' ×' + $('runs').value : '' ) + ')…');
    await calculate();
  });
  box.querySelectorAll('[data-sendbp]').forEach(btn => btn.onclick = async () => {
    await bpApplyRow(btn);
    status('Loading ' + $('bpName').value + ' for Build Progress…');
    await calculate();
    if (bpProgPinCurrent()) switchMainView('prog');
    else status('Nothing to send — calculation produced no materials.');
  });
}
function renderBpRows() {
  const box = $('bpList'); if (!box) return;
  const rows = filteredBpRows();
  const pages = Math.max(1, Math.ceil(rows.length / myBpPageSize));
  if (myBpPage > pages) myBpPage = pages;
  const start = (myBpPage - 1) * myBpPageSize;
  const page = rows.slice(start, start + myBpPageSize);
  const sizeOpts = MY_BP_PAGE_OPTIONS.map(n => '<option value="' + n + '"' + (n === myBpPageSize ? ' selected' : '') + '>' + n + '</option>').join('');
  const sizeSel = rows.length ? ' · per page <select data-pgsize style="width:auto;display:inline-block;padding:2px 6px">' + sizeOpts + '</select>' : '';
  const range = rows.length ? ('Showing ' + (start + 1) + '–' + (start + page.length) + ' of ' + rows.length + (rows.length !== myBps.length ? ' (filtered from ' + myBps.length + ')' : '') + sizeSel) : '';
  const count = myBps.length ? '<p class="hint">' + (range || 'No blueprints.') + '</p>' : '';
  const pager = pages > 1
    ? '<div style="display:flex;gap:.5rem;align-items:center;margin:.4rem 0"><button class="mode-btn" data-pg="prev"' + (myBpPage <= 1 ? ' disabled' : '') + '>‹ Prev</button><span class="hint">Page ' + myBpPage + ' of ' + pages + '</span><button class="mode-btn" data-pg="next"' + (myBpPage >= pages ? ' disabled' : '') + '>Next ›</button></div>'
    : '';
  const scopeHint = (myBpWarn ? '<p class="hint" style="color:var(--danger)">' + myBpWarn + '</p>' : '')
    + (!BV_SHOW_LOCATIONS ? ''
      : (myStructScopeMissing
        ? '<p class="hint">Some structures unnamed — Sign out and sign in again to grant the structure scope.</p>'
        : (myStructNoAccess
          ? '<p class="hint">Some structures withhold their name — no docking access there (hidden by CCP by design).</p>' : '')));
  box.innerHTML = scopeHint + count + pager + (page.map(bpRowHtml).join('') || (myBps.length ? '<p class="hint">No matches — clear the search.</p>' : 'No blueprints.'));
  box.querySelectorAll('[data-pg]').forEach(btn => btn.onclick = () => setBpPage(myBpPage + (btn.dataset.pg === 'next' ? 1 : -1), pages));
  const sel = box.querySelector('[data-pgsize]');
  if (sel) sel.onchange = () => {
    const n = parseInt(sel.value, 10);
    if (MY_BP_PAGE_OPTIONS.includes(n)) {
      myBpPageSize = n;
      try { localStorage.setItem('bvBpPageSize', String(n)); } catch {}
    }
    myBpPage = 1;
    renderBpRows();
  };
  bindBpLoadButtons(box);
}
async function loadBlueprints() {
  const box = $('bpList');
  if (!window.BVAuth || !BVAuth.signedIn()) { box.innerHTML = '<p class="hint">Sign in with SSO first (needs backend /api/bv/*). Or type a blueprint name in Calc.</p>'; return; }
  box.textContent = 'Loading blueprints…';
  try {
    const ch = await resolveBvCharacter();
    if (!ch) { box.innerHTML = '<p class="hint">Signed in, but no character stored — please Sign out (SSO button) and sign in again.</p>'; return; }
    const cid = ch.id || ch.character_id || ch.CharacterID;
    if (!cid) { box.innerHTML = '<p class="hint">Signed in, but no character ID — please Sign out (SSO button) and sign in again.</p>'; return; }
    const isBPO = bpIsBPO;
    const src = ($('bpSource') && $('bpSource').value) || 'personal';
    let bps = [];
    let corpWarn = null;
    if (src === 'corp' || src === 'both') {
      const sheet = await BVAuth.api('/characters/' + cid + '/?datasource=tranquility');
      if (!sheet || !sheet.corporation_id) {
        if (src === 'corp') throw new Error('No corporation found for this character.');
        corpWarn = 'No corporation found — corp blueprints skipped.';
      } else {
        // Page through (ESI pages corp blueprints at 1000/page) — a single call
        // silently drops everything past the first 1000.
        try {
          for (let pg = 1; pg <= 100; pg++) {
            const chunk = await BVAuth.api('/corporations/' + sheet.corporation_id + '/blueprints/?datasource=tranquility&page=' + pg);
            if (!Array.isArray(chunk) || !chunk.length) break;
            bps = bps.concat(chunk);
            if (chunk.length < 1000) break;
          }
        } catch (e) {
          const msg = String((e && e.message) || '');
          if (src === 'corp') throw (/403/.test(msg) ? new Error('Corporation blueprints need the Director role on this character.') : e);
          corpWarn = /403/.test(msg) ? 'Corp blueprints skipped (Director role required).' : ('Corp blueprints failed: ' + e.message);
        }
      }
    }
    if (src === 'personal' || src === 'both') {
      // Page through (ESI pages at 1000 entries) so big hangars aren't silently cut.
      for (let pg = 1; pg <= 100; pg++) {
        const chunk = await BVAuth.api('/characters/' + cid + '/blueprints/?datasource=tranquility&page=' + pg);
        if (!Array.isArray(chunk) || !chunk.length) break;
        bps = bps.concat(chunk);
        if (chunk.length < 1000) break;
      }
    }
    if (!Array.isArray(bps)) bps = [];
    if (src === 'both') {
      const seen = new Set();
      bps = bps.filter(b => {
        const k = b.item_id != null ? String(b.item_id) : (b.type_id + '|' + b.runs + '|' + b.location_id);
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    }
    myBpWarn = corpWarn || '';
    const type = $('bpType').value;
    if (type !== 'all') bps = bps.filter(b => type === 'bpo' ? isBPO(b) : !isBPO(b));
    // No row cap here — ESI lists originals before copies, so any cap hides
    // BPCs first. renderBpRows() pages the full list instead.
    myBps = bps;
    myBpPage = 1;
    myStructScopeMissing = false; myStructNoAccess = false;
    bvPrefillStructNames();
    renderBpRows();
    // Batch-resolve type names in one ESI call, then re-render (keeps any search filter applied).
    // (Location IDs rejoin the batch when BV_SHOW_LOCATIONS is re-enabled.)
    try {
      const ids = [...new Set(BV_SHOW_LOCATIONS
        ? bps.map(b => b.type_id).concat(bps.map(b => b.location_id).filter(id => id && !bpIsStructureId(id)))
        : bps.map(b => b.type_id))];
      if (ids.length) {
        try {
          // Chunked: full hangars can exceed what one names call handles.
          for (let i = 0; i < ids.length; i += 500) {
            const nm = await BVAuth.api('/universe/names/?datasource=tranquility', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify(ids.slice(i, i + 500)) });
            (Array.isArray(nm) ? nm : []).forEach(n => {
              if (!n || !n.id || !n.name) return;
              if (n.category === 'inventory_type') myBpNames[n.id] = n.name;
              else myLocNames[n.id] = n.name;
            });
          }
        } catch (e) { console.warn('[BV] names batch failed, falling back to per-type lookup:', e && e.message); }
        // Fill any gaps individually (ESI type endpoint + Everef fallback, cached) — never leave "Type X".
        const missing = [...new Set(bps.map(b => b.type_id).filter(id => !myBpNames[id]))];
        if (missing.length) {
          await Promise.all(missing.map(async id => { try { myBpNames[id] = await typeName(id); } catch {} }));
        }
        renderBpRows();
      }
    } catch (e) { console.warn('[BV] name resolution failed:', e && e.message); }
    // Player structures need individual authed lookups (the names endpoint can't resolve them).
    // Denials are stamped for 1h — ESI caches its own 403s that long, so refetching sooner is useless.
    // Skipped entirely while BV_SHOW_LOCATIONS is off.
    try {
      if (!BV_SHOW_LOCATIONS) throw 'off';
      const denied = bvDeniedRead(), now = Date.now();
      const hasScope = bvTokenScopes().includes('esi-universe.read_structures.v1');
      const structIds = [...new Set(bps.map(b => b.location_id).filter(id => {
        if (!id || !bpIsStructureId(id) || myLocNames[id]) return false;
        const d = denied[id];
        if (d && now - d < 3600e3) { if (hasScope) myStructNoAccess = true; else myStructScopeMissing = true; return false; }
        return true;
      }))];
      if (structIds.length) {
        const got = await Promise.all(structIds.map(id =>
          BVAuth.api('/universe/structures/' + id + '/?datasource=tranquility')
            .then(s => ({ id, name: s && s.name }))
            .catch(e => {
              // 403 with the scope granted = no docking access (CCP hides these); without it = relog needed.
              if (/403/.test((e && e.message) || '')) {
                denied[id] = Date.now();
                if (hasScope) myStructNoAccess = true;
                else myStructScopeMissing = true;
              }
              return null;
            })
        ));
        const sc = bvStructCacheRead();
        got.forEach(r => { if (r && r.name) { myLocNames[r.id] = r.name; sc[r.id] = { name: r.name, ts: Date.now() }; delete denied[r.id]; } });
        bvStructCacheWrite(sc); bvDeniedWrite(denied);
        renderBpRows();
      }
    } catch {}
  } catch (e) { box.textContent = 'Failed: ' + e.message; }
}
async function scanProfit() {
  // Scan the first 15 of the filtered list (not just the visible page).
  const rows = filteredBpRows().slice(0, 15);
  if (!rows.length) { status('Refresh first.'); return; }
  const box = $('bpList');
  for (const b of rows) {
    try {
      const p = await marketPrice(+b.type_id, hub(), 'sell');
      const btn = box.querySelector('[data-bp="' + b.type_id + '"]');
      if (btn) btn.parentElement.querySelector('span').textContent += ' · ' + fmtISK(p);
    } catch {}
  }
  status('Scan done (first ' + rows.length + ' of filter).');
}

// ---- Invention (V1: decryptor compare + queue) ----
const invQueue = [];
async function invCompare() {
  const q = $('invSearch').value.trim(); if (!q) return;
  const out = $('invOut'); out.textContent = 'Resolving ' + q + '…';
  try {
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify([q]) });
    const inv = Array.isArray(r) ? r : (r.inventory_types || []);
    if (!inv.length) { out.textContent = 'Not found.'; return; }
    const t2 = inv[0]; const target = Math.max(1, parseInt($('invTarget').value) || 5);
    const rows = D.decryptors.map(d => {
      const chance = Math.min(1, D.t2BaseChance * d.prob);
      const runsNeeded = Math.ceil(target / chance);
      return { ...d, chance, runsNeeded };
    }).sort((a, b) => a.runsNeeded - b.runsNeeded);
    out.innerHTML = '<p class="hint">' + t2.name + ' (' + t2.id + ') · base ' + (D.t2BaseChance * 100).toFixed(0) + '% · target ' + target + ' BPCs <a class="mkt-link" target="_blank" href="' + marketURL(t2.id) + '"><i class="fas fa-chart-line"></i></a>' + infoButton(t2.id) + '</p>' +
      rows.map((d, i) => '<div style="display:flex;gap:.4rem;align-items:center;padding:.3rem 0;border-bottom:1px solid var(--border)"><span style="flex:1">' + d.name + ' · ' + (d.chance * 100).toFixed(1) + '% · runs ' + d.runsNeeded + ' · ME' + d.me + '/TE' + d.te + '</span><button class="mode-btn" data-q="' + i + '">Queue</button></div>').join('');
    out.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { invQueue.push({ t2: t2.name, t2id: t2.id, d: rows[+b.dataset.q], target }); renderQueue(); });
  } catch (e) { out.textContent = 'Failed: ' + e.message; }
}
function renderQueue() {
  $('invQueue').innerHTML = invQueue.length ? invQueue.map((q, i) => '<div>' + (i + 1) + '. ' + q.t2 + ' × ' + q.target + ' via ' + q.d.name + ' (' + q.d.runsNeeded + ' runs) <a class="mkt-link" target="_blank" href="' + marketURL(q.t2id) + '"><i class="fas fa-chart-line"></i></a>' + infoButton(q.t2id) + '</div>').join('') : 'Nothing queued yet.';
}

// ---- Ledger + sharing ----
const LEDGER_MAX = 200;
const LEDGER_STATE_MAX = 25;            // keep full state only on the newest N
const LEDGER_BUDGET_BYTES = 1.5 * 1024 * 1024;
function ledRead() { try { return JSON.parse(localStorage.getItem('bvLedger') || '[]'); } catch { return []; } }
function ledWrite(l) {
  // Full state only on the newest LEDGER_STATE_MAX entries; strip beyond.
  const list = (l || []).slice(0, LEDGER_MAX);
  for (let i = LEDGER_STATE_MAX; i < list.length; i++) { if (list[i] && list[i].st) delete list[i].st; }
  // Total-size guard: strip state from oldest entries until under budget.
  let json = JSON.stringify(list);
  if (json.length > LEDGER_BUDGET_BYTES) {
    for (let i = list.length - 1; i >= 0 && json.length > LEDGER_BUDGET_BYTES; i--) {
      if (list[i] && list[i].st) { delete list[i].st; json = JSON.stringify(list); }
    }
  }
  try { localStorage.setItem('bvLedger', json); } catch {}
}
function pushLedger(e) { try { e.st = collectState(); } catch {} const l = ledRead(); l.unshift(e); ledWrite(l); renderLedger(); }
function renderLedger() {
  const l = ledRead(); const box = $('ledgerList'); if (!box) return;
  box.innerHTML = l.length ? l.slice(0, 30).map((e, i) => '<div style="padding:.3rem 0;border-bottom:1px solid var(--border)">' + new Date(e.ts).toLocaleString() + ' · <b>' + e.bp + '</b> ×' + e.runs + ' · profit ' + fmtISK(e.profit) + ' <a class="mkt-link" target="_blank" href="' + marketURL(e.bpId, e.hub) + '"><i class="fas fa-chart-line"></i></a>' + infoButton(e.bpId) + ' <button type="button" class="mkt-link icon-btn" data-ledgershare="' + i + '" title="Copy short share link"><i class="fas fa-link"></i></button></div>').join('') : '<p class="hint">No entries yet — run a calculation.</p>';
}

// ---- Full calculation state (share / save) ----
// Personal inventory (owned-material toggles, asset snapshots) is deliberately
// excluded from shared/saved state — only blueprint + inputs + sourcing modes.
const BV_STATE_INPUTS = ['hubSelect', 'me', 'te', 'indSkill', 'advSkill', 'implant', 'structure', 'rigs', 'jobTax', 'basis', 'reactions', 'scc', 'salesTax', 'broker', 'mfgIndex', 'tracked', 'systemName', 'refinePct', 'matSource'];
function collectState() {
  const inputs = {};
  for (const k of BV_STATE_INPUTS) { const el = $(k); if (el) inputs[k] = el.value; }
  const bpName = (($('bpName') && $('bpName').value) || '').trim();
  const runs = parseInt(($('runs') && $('runs').value) || 1, 10) || 1;
  const bpId = (S.root && S.root.bpId) || null;
  let modes = null;
  try { if (bpId) { const m = bvModesRead()[String(bpId)]; if (m && Object.keys(m).length) modes = m; } } catch {}
  let nav = [];
  try { nav = (navStack || []).map(e => ({ bp: e.bp, runs: e.runs })); } catch {}
  return { v: 1, bp: { bpName, runs, bpId: bpId ? +bpId : null }, inputs, modes, nav };
}
function applyState(st, opts) {
  opts = opts || {};
  if (!st || typeof st !== 'object') return false;
  const inputs = st.inputs || {};
  for (const k of Object.keys(inputs)) { const el = $(k); if (el && inputs[k] !== undefined) el.value = inputs[k]; }
  if (st.bp && st.bp.bpName) $('bpName').value = st.bp.bpName;
  if (st.bp && st.bp.runs) $('runs').value = st.bp.runs;
  if (st.modes && st.bp && st.bp.bpId) {
    try { const all = bvModesRead(); all[String(st.bp.bpId)] = st.modes; bvModesWrite(all); } catch {}
  }
  // Restore the exact drill-down trail so we land on the same sub-component.
  // fromNav keeps calculate() from wiping what we just restored — without it
  // the trail was rebuilt here and then cleared on the next line, so a resumed
  // session always lost its breadcrumbs.
  let restoredNav = 0;
  try {
    navStack.length = 0;
    if (Array.isArray(st.nav)) for (const e of st.nav) { if (e && e.bp) { navStack.push({ bp: e.bp, runs: parseInt(e.runs, 10) || 1 }); restoredNav++; } }
    pendingNeed = null;
  } catch {}
  // Drop the in-memory deep-mode cache so calculate() re-reads the seeded store.
  try { S._deepModes = null; S._deepModesBp = null; } catch {}
  savePrefs();
  calculate({ noLedger: !!opts.noLedger, fromNav: restoredNav > 0 });
  return true;
}
async function createShareCode(state) {
  const r = await fetch(BV_API + '/api/bv/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!j || !j.code) throw new Error('no code returned');
  return j.code;
}
function shareUrlFor(code) {
  if (!code) return '';
  const path = location.pathname.replace(/\/index\.html$/, '/');
  return location.origin + path + '#' + code;
}
// Reflect a created share code in the address bar (so "copy link address"
// works) without firing hashchange / re-running the calculation.
function showShareInAddressBar(code) {
  try { if (code) history.replaceState(null, '', location.pathname + location.search + '#' + code); } catch {}
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); status(okMsg); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { document.execCommand('copy'); ok = true; } catch {}
    ta.remove(); status(ok ? okMsg : 'Could not copy to clipboard.'); return ok;
  }
}
async function shareCurrent() {
  if (!S.root || !S.root.bpId) { status('Run a calculation first.'); return; }
  status('Creating share link…');
  try {
    const code = await createShareCode(collectState());
    if (!code) throw new Error('no code returned');
    showShareInAddressBar(code);
    await copyText(shareUrlFor(code), 'Share link copied to clipboard.');
  }
  catch (e) { status('Share link failed: ' + (e && e.message ? e.message : e)); }
}
async function shareLedgerEntry(i) {
  const e = (ledRead() || [])[i]; if (!e) return;
  status('Creating share link…');
  try {
    const state = e.st || { v: 1, bp: { bpName: e.bp, runs: e.runs, bpId: e.bpId ? +e.bpId : null }, inputs: e.hub ? { hubSelect: e.hub } : {}, modes: null, nav: [] };
    const code = await createShareCode(state);
    if (!code) throw new Error('no code returned');
    showShareInAddressBar(code);
    await copyText(shareUrlFor(code), 'Share link copied to clipboard.');
  } catch (err) { status('Share link failed: ' + (err && err.message ? err.message : err)); }
}

// ---- Local saves (browser-only, no login) ----
const LOCAL_SAVES_KEY = 'bvLocalSaves';
const LOCAL_SAVES_MAX = 30;
let accountSavesCache = null;
function localSavesRead() { try { const v = JSON.parse(localStorage.getItem(LOCAL_SAVES_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function localSavesWrite(list) {
  const trimmed = (list || []).slice(0, LOCAL_SAVES_MAX);
  try { localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(trimmed)); return true; }
  catch { try { localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(trimmed.slice(0, 10))); return true; } catch { status('Browser storage full — old saves kept.'); return false; } }
}
function localSaveId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function saveLocal(name) {
  if (!S.root || !S.root.bpId) { status('Run a calculation first.'); return; }
  if (!name) return;
  const list = localSavesRead();
  list.unshift({ id: localSaveId(), name: String(name).slice(0, 80), ts: Date.now(), state: collectState() });
  localSavesWrite(list);
  renderSavedList();
  status('Saved “' + name + '” locally.');
}
function loadLocal(id) {
  const e = localSavesRead().find(x => x && x.id === id); if (!e || !e.state) { status('Save not found.'); return; }
  applyState(e.state);
}
function deleteLocal(id) { localSavesWrite(localSavesRead().filter(x => x && x.id !== id)); renderSavedList(); }
async function shareLocal(id) {
  const e = localSavesRead().find(x => x && x.id === id); if (!e || !e.state) { status('Save not found.'); return; }
  status('Creating share link…');
  try { const code = await createShareCode(e.state); await copyText(shareUrlFor(code), 'Share link copied to clipboard.'); }
  catch (err) { status('Share link failed: ' + (err && err.message ? err.message : err)); }
}
async function syncLocal(id) {
  const e = localSavesRead().find(x => x && x.id === id); if (!e || !e.state) { status('Save not found.'); return; }
  if (!(window.BVAuth && BVAuth.signedIn())) {
    status('Sign in to sync…');
    try { await BVAuth.login(); } catch (er) { status('SSO unavailable: ' + (er && er.message ? er.message : er)); }
    return;
  }
  status('Syncing…');
  try {
    const code = await createShareCode(e.state);
    const token = await BVAuth.getAccessToken();
    const r = await fetch(BV_API + '/api/bv/saves', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ name: e.name, code }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = localSavesRead(); const cur = list.find(x => x && x.id === id); if (cur) { cur.synced = code; }
    localSavesWrite(list);
    accountSavesCache = null;
    status('Synced “' + e.name + '” to your account.');
    renderSavedList();
  } catch (err) { status('Sync failed: ' + (err && err.message ? err.message : err)); }
}
function exportLocalSaves() {
  const list = localSavesRead();
  if (!list.length) { status('No local saves to export.'); return; }
  const blob = new Blob([JSON.stringify({ v: 1, saves: list })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'bv-saves.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Exported ' + list.length + ' local save' + (list.length === 1 ? '' : 's') + '.');
}
async function importLocalSaves(file) {
  if (!file) return;
  try {
    const txt = await file.text();
    const j = JSON.parse(txt);
    const incoming = Array.isArray(j) ? j : (j && Array.isArray(j.saves) ? j.saves : []);
    if (!incoming.length) { status('No saves found in that file.'); return; }
    const list = localSavesRead();
    const have = new Set(list.map(x => x && x.id));
    let added = 0;
    for (const s of incoming) {
      if (!s || !s.state) continue;
      const id = (s.id && !have.has(s.id)) ? String(s.id) : localSaveId();
      list.unshift({ id, name: String(s.name || 'Imported').slice(0, 80), ts: s.ts || Date.now(), state: s.state, synced: s.synced || undefined });
      have.add(id); added++;
    }
    localSavesWrite(list);
    renderSavedList();
    status('Imported ' + added + ' save' + (added === 1 ? '' : 's') + '.');
  } catch (e) { status('Import failed: ' + (e && e.message ? e.message : e)); }
}
function importLocalSavesClick() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) importLocalSaves(f); };
  inp.click();
}
function saveCurrent() {
  if (!S.root || !S.root.bpId) { status('Run a calculation first.'); return; }
  const name = prompt('Name this calculation:', (S.root.bpName || 'Calculation') + ' ×' + (S.runs || 1));
  if (!name) return;
  saveLocal(name.trim());
}

// ---- Saved list (local + account) ----
async function fetchAccountSaves() {
  try {
    const token = await BVAuth.getAccessToken();
    const r = await fetch(BV_API + '/api/bv/saves', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    accountSavesCache = (j && j.saves) || [];
  } catch { accountSavesCache = []; }
  const box = $('savedList'); if (box) renderSavedList();
}
function renderSavedList() {
  const box = $('savedList'); if (!box) return;
  const locals = localSavesRead();
  let h = '<div class="hint" style="margin:.2rem 0 .1rem">Local saves</div>';
  h += locals.length
    ? locals.map(s => '<div style="display:flex;gap:.3rem;align-items:center;padding:.25rem 0;border-bottom:1px solid var(--border)"><span style="flex:1">' + escapeHtml(s.name) + ' <span class="hint">' + new Date(s.ts).toLocaleDateString() + '</span>' + (s.synced ? ' <span class="pill" style="border-color:var(--build);color:var(--build)">synced</span>' : '') + '</span><button class="mode-btn" data-sl-load="' + escapeHtml(s.id) + '">Load</button><button class="mode-btn" data-sl-share="' + escapeHtml(s.id) + '">Share</button><button class="mode-btn" data-sl-sync="' + escapeHtml(s.id) + '">Sync</button><button class="mode-btn" data-sl-del="' + escapeHtml(s.id) + '">Del</button></div>').join('')
    : '<p class="hint">No local saves yet — hit Save calculation.</p>';
  h += '<div class="btn-row tight" style="margin:.35rem 0"><button class="calc-btn secondary" data-sl-export><i class="fas fa-file-export"></i> Export saves</button><button class="calc-btn secondary" data-sl-import><i class="fas fa-file-import"></i> Import saves</button></div>';
  const signedIn = !!(window.BVAuth && BVAuth.signedIn());
  h += '<div class="hint" style="margin:.5rem 0 .1rem">Account saves</div>';
  if (!signedIn) h += '<p class="hint">Sign in to sync saves across devices.</p>';
  else if (accountSavesCache === null) h += '<p class="hint">Loading account saves…</p>';
  else if (!accountSavesCache.length) h += '<p class="hint">No account saves yet — use Sync on a local save.</p>';
  else h += accountSavesCache.map(s => '<div style="display:flex;gap:.3rem;align-items:center;padding:.25rem 0;border-bottom:1px solid var(--border)"><span style="flex:1">' + escapeHtml(s.name) + ' <span class="hint">' + new Date(s.ts).toLocaleDateString() + '</span></span><button class="mode-btn" data-saveload="' + escapeHtml(s.code) + '">Load</button><button class="mode-btn" data-savedel="' + escapeHtml(s.code) + '">Delete</button></div>').join('');
  box.innerHTML = h;
  if (signedIn && accountSavesCache === null) fetchAccountSaves();
}
async function deleteSaved(code) {
  try {
    const token = await BVAuth.getAccessToken();
    const r = await fetch(BV_API + '/api/bv/saves/' + encodeURIComponent(code), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    accountSavesCache = (accountSavesCache || []).filter(s => s && s.code !== code);
    renderSavedList();
  } catch (e) { status('Delete failed: ' + (e && e.message ? e.message : e)); }
}
async function loadShortCode(code) {
  try {
    const r = await fetch(BV_API + '/api/bv/share/' + encodeURIComponent(code));
    if (!r.ok) return false;
    const j = await r.json();
    if (j && j.state) { applyState(j.state); return true; }
  } catch {}
  return false;
}

// ---- autocomplete (blueprints / items / systems — offline via market DBs) ----
let BV_ITEMS = [], BV_BPS = [];
function bvBuildIndex() {
  if (BV_ITEMS.length) return;
  try {
    const db = (typeof AllMarketItems !== 'undefined' ? AllMarketItems : (typeof window !== 'undefined' && window.AllMarketItems ? window.AllMarketItems : {}));
    for (const cat of Object.values(db)) {
      if (!cat || !cat.items) continue;
      for (const it of cat.items) {
        BV_ITEMS.push(it);
        if (/blueprint/i.test(it.name)) BV_BPS.push(it);
      }
    }
  } catch {}
}
function bvScore(name, q) {
  const n = name.toLowerCase();
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500;
  if (n.split(/[\s\-'/]+/).some(w => w.startsWith(q))) return 300;
  if (n.includes(q)) return 200;
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) if (n[i] === q[qi]) qi++;
  if (qi === q.length) return 100;
  return 0;
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function attachAutocomplete(inputId, boxId, opts) {
  const input = $(inputId), box = $(boxId);
  if (!input || !box) return;
  let active = -1, current = [];
  const minLen = opts.source === 'systems' ? 2 : 2;
  function close() { box.classList.add('hidden'); box.innerHTML = ''; active = -1; current = []; }
  function highlight(name, q) {
    const i = name.toLowerCase().indexOf(q);
    if (i < 0) return name;
    return name.slice(0, i) + '<span class="hl">' + name.slice(i, i + q.length) + '</span>' + name.slice(i + q.length);
  }
  function render(q) {
    if (q.length < minLen) { close(); return; }
    bvBuildIndex();
    let pool, isSys = opts.source === 'systems';
    if (isSys) pool = ((typeof Systems !== 'undefined' ? Systems : (typeof window !== 'undefined' && window.Systems ? window.Systems : [])) || []).map(s => ({ id: s.id, name: s.name, sec: s.securityStatus, regionId: s.regionId }));
    else if (opts.source === 'blueprints') pool = BV_BPS;
    else pool = BV_ITEMS;
    if (!pool.length) { close(); return; }
    current = [];
    for (const it of pool) {
      const sc = bvScore(it.name, q);
      if (sc > 0) current.push({ it, sc });
      if (current.length > 4000 && sc === 0) continue;
    }
    current.sort((a, b) => b.sc - a.sc || a.it.name.localeCompare(b.it.name));
    current = current.slice(0, 8);
    if (!current.length) { close(); return; }
    active = -1;
    box.innerHTML = current.map((c, i) => {
      const sub = c.it.sec !== undefined
        ? (c.it.sec >= 0.5 ? 'High' : c.it.sec > 0 ? 'Low' : 'Null') + ' ' + c.it.sec.toFixed(1)
        : (opts.source === 'blueprints' || /blueprint/i.test(c.it.name) ? 'BPO/BPC' : 'Item');
      const img = c.it.sec !== undefined ? '' : '<img src="https://images.evetech.net/types/' + c.it.id + '/icon?size=32" loading="lazy" onerror="this.style.display=\'none\'">';
      return '<div class="suggest-item" data-i="' + i + '">' + img + '<span class="t">' + highlight(c.it.name, q) + '</span><span class="s">' + sub + '</span></div>';
    }).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.suggest-item').forEach(el => {
      el.onmousedown = e => { e.preventDefault(); pick(+el.dataset.i); };
    });
  }
  function pick(i) {
    const c = current[i]; if (!c) return;
    input.value = c.it.name;
    input.dataset.pickedId = c.it.id;
    close();
    if (opts.onPick) opts.onPick(c.it);
  }
  let deb = null;
  input.addEventListener('input', () => { delete input.dataset.pickedId; clearTimeout(deb); deb = setTimeout(() => render(input.value.trim().toLowerCase()), 120); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= minLen) render(input.value.trim().toLowerCase()); });
  input.addEventListener('keydown', e => {
    const items = box.querySelectorAll('.suggest-item');
    if (box.classList.contains('hidden') || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); return; }
    else if (e.key === 'Escape') { close(); return; }
    else return;
    items.forEach((el, i) => el.classList.toggle('active', i === active));
    items[active].scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('click', e => { if (!box.classList.contains('hidden') && !box.contains(e.target) && e.target !== input) close(); });
}
async function fetchSystemIndex(sys) {
  try {
    const all = await fetchJSON(ESI + '/industry/systems/?datasource=tranquility');
    const row = all.find(r => r.solar_system_id === sys.id);
    const mfg = row && row.cost_indices && row.cost_indices.find(c => c.activity === 'manufacturing');
    if (mfg) { $('mfgIndex').value = (mfg.cost_index * 100).toFixed(2); status(sys.name + ' index: manufacturing ' + (mfg.cost_index * 100).toFixed(2) + '% — mfg index updated.'); }
    else status(sys.name + ' selected — no manufacturing index found, kept current.');
  } catch (e) { status(sys.name + ' selected — index lookup failed, kept current.'); }
}
function initAutocomplete() {
  attachAutocomplete('bpName', 'bpSuggest', { source: 'blueprints', onPick: () => { try { calculate(); } catch {} } });
  attachAutocomplete('invSearch', 'invSuggest', { source: 'items' });
  attachAutocomplete('systemName', 'sysSuggest', { source: 'systems', onPick: fetchSystemIndex });
}

// ---- mining (what to mine for the BOM minerals + how long) ----
const oreCache = new Map();
(function loadOreCache() {
  try {
    const saved = JSON.parse(localStorage.getItem('bvOres2') || 'null');
    if (saved && Date.now() - saved.ts < 7 * 864e5 && saved.ores) {
      for (const [k, v] of Object.entries(saved.ores)) oreCache.set(+k, v);
    }
  } catch {}
})();
function saveOreCache() {
  try {
    const ores = {};
    for (const [k, v] of oreCache) ores[k] = v;
    localStorage.setItem('bvOres2', JSON.stringify({ ts: Date.now(), ores }));
  } catch {}
}
// Baked SDE ore table (bv-ores.js): id -> {portion, volume, category, yields}.
// Answers from local data with zero network; Everef stays only as a fallback
// for post-SDE-build types (rare — re-run scripts/build-bv-ores.mjs instead).
const BV_ORES = (() => {
  try {
    const o = (typeof window !== 'undefined' && window.BV_ORES) || {};
    const m = new Map();
    for (const [k, v] of Object.entries(o)) {
      if (!Array.isArray(v) || v.length < 5) continue;
      const yields = {};
      for (const [mid, q] of (v[4] || [])) yields[mid] = q;
      m.set(+k, { name: v[0], portion: v[1], volume: v[2], category: v[3], yields });
    }
    return m;
  } catch { return new Map(); }
})();
function oreFromTable(id) {
  const e = BV_ORES.get(+id);
  if (!e) return null;
  return { id: +id, name: e.name, volume: e.volume, portion: e.portion, yields: { ...e.yields }, category: e.category, baked: true };
}
// Seed volume cache from the baked ore table (runs after both exist).
try { for (const [id, e] of BV_ORES) { if (!volCache.has(id)) volCache.set(id, e.volume || 0); } } catch {}
// Every material yielded by a NON-compressed baked ore is mineable: minerals,
// ice products and the whole moon-material family (Hydrocarbons, Evaporite
// Deposits, …). SDE-driven — no hardcoded IDs. Compressed-only outputs stay
// out (you mine the rock, not the unit).
const BV_MINE_MATS = (() => {
  try {
    const s = new Set();
    for (const [, e] of BV_ORES) {
      if (!e || !e.yields || !Object.keys(e.yields).length) continue;
      if (/^compressed\s/i.test(e.name || '')) continue;
      for (const mid of Object.keys(e.yields)) s.add(+mid);
    }
    return s;
  } catch { return new Set(); }
})();
async function fetchOre(id, nameHint) {
  if (oreCache.has(id)) return oreCache.get(id);
  const baked = oreFromTable(id);
  if (baked) {
    if (nameHint && baked.name !== nameHint) baked.name = baked.name || nameHint;
    oreCache.set(id, baked);
    return baked;
  }
  const d = await fetchJSON('https://ref-data.everef.net/types/' + id);
  const yields = {};
  for (const [mid, m] of Object.entries(d.type_materials || {})) yields[mid] = m.quantity;
  const o = { id, name: nameHint || (D.ores.find(x => x.id === id) || {}).name || id, volume: d.volume || 0, portion: d.portion_size || 100, yields, category: d.category_id };
  oreCache.set(id, o); saveOreCache(); return o;
}
function mineralNeeds(forcedId) {
  const needs = {};
  const fid = forcedId != null ? +forcedId : null;
  // 1) raw minerals / ice products explicitly marked "Mine it" (BOM lines carry the mode)
  //    If a diamond was clicked, include that type even when its mode is still Buy.
  for (const l of (S.bom || [])) {
    if (!isMineable(l.type_id)) continue;
    if (l.mode !== 'mine' && +l.type_id !== fid) continue;
    needs[l.type_id] = (needs[l.type_id] || 0) + l.qty;
  }
  // forced click on a top-level material that hasn't been moved to Mine yet
  // covers the Buy->diamond case where BOM entry is still Buy but we want a plan anyway
  if (fid && isMineable(fid) && !needs[fid] && S.root && S.root.children) {
    const c = S.root.children.find(x => +x.type_id === fid);
    if (c) needs[fid] = (needs[fid] || 0) + c.perRun * (S.runs || 1);
  }
  // 2) REMOVED (deep-mode update): the recursive BOM now emits mine-mode
  //    leaves at every depth, so path 1 above already covers minerals
  //    inside built sub-components. The old depth-1-only scan would double
  //    count them. Mine deep minerals explicitly with the Mine toggle.
  return needs;
}
function fmtTime(mins) {
  if (!isFinite(mins)) return '—';
  if (mins < 10) return (Math.round(mins * 10) / 10) + ' min';
  if (mins < 60) return mins.toFixed(0) + ' min';
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h + 'h ' + m + 'm';
}
// Refinery breakdown from YOUR OWN stock of ore / compressed ore (inventory snapshots).
// Each owned ore stack is expanded to the minerals it refines into at the loaded refine %.
function oreDetailFor(ded) {
  if (ded.src === 'both') {
    const store = S.inventorySnapshots || stkSnapshotStoreRead();
    if (store['both'] && store['both'].oreDetail) return store['both'].oreDetail;
    const map = new Map();
    for (const s of ['personal', 'corp']) {
      const snap = store[s];
      for (const o of (snap && snap.oreDetail) || []) {
        const ex = map.get(o.oreId);
        if (!ex) { map.set(o.oreId, { ...o }); continue; }
        ex.oreQty += o.oreQty;
        for (const r of o.refined) {
          const er = ex.refined.find(x => x.mid === r.mid);
          if (er) er.qty += r.qty; else ex.refined.push({ ...r });
        }
      }
    }
    return [...map.values()];
  }
  const snap = ded.snap;
  return (snap && snap.oreDetail) || [];
}
async function renderRefinery() {
  const wrap = $('refineryWrap');
  if (!wrap) return;
  try {
    const ded = stkDeductSnapshot();
    const snap = ded.snap;
    const eff = snap && snap.eff ? snap.eff : (parseFloat(($('refinePct') && $('refinePct').value) || 75) || 75) / 100;
    const srcLabel = ded.src === 'both' ? 'Personal + Corp' : (ded.src === 'corp' ? 'Corp' : 'Personal');
    const locName = snap && snap.systemName ? snap.systemName : (stkCurrentSysName() || '');
    const oreDetail = oreDetailFor(ded);
    // the refine breakdown covers ore, compressed ore, ice and compressed ice
    const refineSources = oreDetail;
    // safety net: snapshots persisted before name resolution store bare type IDs — resolve them now
    for (const o of refineSources) {
      if (!o.oreName || /^\d+$/.test(String(o.oreName))) o.oreName = stkNames[o.oreId] || await typeName(o.oreId).catch(() => ('Type ' + o.oreId));
      for (const r of (o.refined || [])) if (!r.name || /^\d+$/.test(String(r.name))) r.name = D.minerals[r.mid] || stkNames[r.mid] || await typeName(r.mid).catch(() => ('Type ' + r.mid));
    }
    // BOM items ticked "Use own" that need refining (minerals / ice products, not bought/built)
    const selected = (S.bom || []).filter(l => ownUse(l.type_id) && (l.mode === 'buy' || l.mode === 'react') && isMineable(l.type_id));
    if (!selected.length || !refineSources.length) {
      const oresCount = refineSources.length;
      wrap.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-industry"></i> Refinery <span class="pill" style="margin-left:.5rem">' + srcLabel + (locName ? ' @ ' + locName : '') + '</span></h3><p class="hint">' +
        (selected.length ? 'Scope has <b>' + oresCount + '</b> ore / ice stack' + (oresCount === 1 ? '' : 's') + ', but none refine into the materials you ticked <b>Use own</b> (or none are ticked).' : 'Tick <b>Use own</b> on a mineral in the BOM, and load your ore / compressed ore in the <b>Inventory</b> tab (pick your build system, choose the right source, hit <b>Search</b>).') +
        '</p></div>';
      return;
    }
    const rows = [];
    for (const l of selected) {
      const mid = +l.type_id;
      for (const o of refineSources) {
        const r = o.refined.find(x => +x.mid === mid);
        if (!r) continue;
        rows.push({ mid, mineral: l.name, need: l.qty, oreId: o.oreId, ore: o.oreName, oreQty: o.oreQty, locs: o.locs || [], yield: r.qty });
      }
    }
    if (!rows.length) {
      wrap.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-industry"></i> Refinery</h3><p class="hint">None of your loaded ore / compressed ore / ice refines into the materials you ticked <b>Use own</b>. ' + (locName ? 'Loaded scope: ' + srcLabel + ' @ ' + locName + '.' : '') + '</p></div>';
      return;
    }
    const anyCompressed = rows.some(r => /compressed/i.test(r.ore || ''));
    // combine by material so each mineral is ONE row, not a row per ore stack
    const groups = new Map();
    for (const r of rows) {
      let g = groups.get(r.mid);
      if (!g) { g = { mid: r.mid, mineral: r.mineral, need: r.need, sources: [], total: 0, locs: new Set() }; groups.set(r.mid, g); }
      g.sources.push({ ore: r.ore, qty: r.oreQty, yield: r.yield });
      g.total += r.yield;
      for (const l of r.locs) g.locs.add(l);
    }
    // Shortfalls first so action items sit at the top; covered materials below.
    const ordered = [...groups.values()].sort((a, b) => {
      const sa = a.total >= a.need ? 1 : 0, sb = b.total >= b.need ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return (b.need - b.total) - (a.need - a.total);
    });
    const nCovered = ordered.filter(g => g.total >= g.need).length;
    const nShortUnits = ordered.reduce((s, g) => s + Math.max(0, g.need - g.total), 0);
    wrap.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-industry"></i> Refinery <span class="pill" style="margin-left:.5rem">' + srcLabel + (locName ? ' @ ' + locName : '') + '</span> <span class="pill" style="margin-left:.25rem">' + nCovered + '/' + ordered.length + ' covered</span></h3>' +
      '<p class="hint">' + (anyCompressed ? 'Compressed ore / ice included — un-compress at a structure before refining. ' : '') + 'Materials ticked <b>Use own</b> come from your ore / compressed ore / ice, refined at ' + Math.round(eff * 100) + '%.' + (nShortUnits ? ' Total shortfall <b>' + fmtN(nShortUnits) + '</b> units — mine or buy the rest.' : ' Everything covered — nothing left to mine or buy.') + '</p>' +
      '<div style="overflow-x:auto"><table class="bom"><thead><tr><th>Material</th><th>Need</th><th>Refines to</th><th>Coverage</th><th>From your ore</th><th>Location</th></tr></thead><tbody>' +
      ordered.map(g => {
        const covered = g.total >= g.need;
        const pct = g.need > 0 ? Math.min(100, Math.round(g.total / g.need * 100)) : 100;
        const srcRows = [...g.sources].sort((a, b) => b.yield - a.yield);
        const shown = srcRows.slice(0, 6);
        const sources = '<div class="ref-src">' + shown.map(s =>
          '<div class="ref-src-row"><span>' + s.ore + ' ×' + fmtN(s.qty) + '</span><span class="nums">+' + fmtN(s.yield) + '</span></div>'
        ).join('') + (srcRows.length > 6 ? '<div class="ref-src-more">+' + (srcRows.length - 6) + ' more</div>' : '') + '</div>';
        const locsTxt = g.locs.size ? [...g.locs].slice(0, 2).join(', ') + (g.locs.size > 2 ? ' +' + (g.locs.size - 2) : '') : '<span class="nums">—</span>';
        return '<tr><td>' + bvIconImg(g.mid, 'width:24px;height:24px;vertical-align:middle;margin-right:.4rem;border-radius:4px;background:#111') + '<b>' + g.mineral + '</b></td>'
          + '<td>' + fmtN(g.need) + '</td>'
          + '<td' + (covered ? ' style="color:var(--build)"' : '') + '>' + fmtN(g.total) + '</td>'
          + '<td><div class="ref-track"><span class="ref-fill' + (covered ? '' : ' short') + '" style="width:' + pct + '%"></span></div> <span class="ref-pct">' + pct + '%' + (covered ? ' ✓' : ' · short ' + fmtN(g.need - g.total)) + '</span></td>'
          + '<td>' + sources + '</td><td>' + locsTxt + '</td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
  } catch (e) {
    wrap.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-industry"></i> Refinery</h3><p class="hint" style="color:var(--danger)">Refinery failed: ' + (e && e.message ? e.message : e) + '</p></div>';
  }
}
async function planMining(forcedId, opts) {
  const box = $('mineWrap'), st = $('mineStatus');
  const isAuto = !!(opts && opts.auto);
  try {
  await ensureIceProducts().catch(() => {});
  const needs = mineralNeeds(forcedId);
  if (!S.root) {
    st.textContent = 'Run a calculation first.';
    box.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-gem"></i> Mining plan</h3><p class="hint">Enter a blueprint on the left, hit Calculate, then come back and press Plan mining.</p></div>';
    return;
  }
  if (!Object.keys(needs).length) {
    const built = (S.root.children || []).filter(c => c.mode === 'build' && !c.child).map(c => c.name);
    st.textContent = 'No mineable materials in this build.';
    box.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-gem"></i> Mining plan</h3>' +
      '<p class="hint">Nothing marked for mining. Press <b>Mine it</b> on any raw mineral/ice row above (or set a sub-component to Build to include its minerals), then press Plan mining again. ' +
      (built.length ? 'These sub-components are set to Build but their contents are still resolving: ' + built.slice(0, 4).join(', ') + ' — wait a few seconds and retry.' : '') + '</p></div>';
    return;
  }
  const rate = Math.max(1, parseFloat($('mineRate').value) || 450);
  const rawEff = parseFloat($('refinePct').value) || parseFloat(localStorage.getItem('bvPrefs') ? (JSON.parse(localStorage.getItem('bvPrefs')||'{}').mineEff) : null) || 75;
  const eff = Math.min(100, Math.max(50, rawEff)) / 100;
  const region = hub();
  const say = phase => {
    st.textContent = phase;
    box.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-spinner fa-spin"></i> Mining plan</h3><p class="hint">' + phase + '</p></div>';
  };
  say('Loading ore, ice + moon yields (SDE-baked)…');
  await new Promise(r => setTimeout(r, 30)); // let the spinner paint before the network storm
  const ores = (await Promise.all(D.ores.map(o => fetchOre(o.id).catch(() => null)))).filter(Boolean);
  // Moon ores as mineable alternatives (SDE-baked yields; compressed excluded —
  // you mine the rock, not the compressed unit). Common ones also yield
  // standard minerals (Pyerite/Mexallon), so they rank for those needs.
  const MOON_ORE_RE = /^(brimful|glistening|glowing|lavish|replete|shining|twinkling|copious|bountiful)?\s?(bitumens|coesite|sylvite|zeolites|scheelite|otavite|sperrylite|vanadinite|chromite|carnotite|zircon|pollucite|cinnabar|cobaltite|euxenite|titanite|loparite|monazite|xenotime|ytterbite)$/i;
  let moonOres = [];
  try {
    const seen = new Set();
    for (const o of (ores || []).concat(iceOreList || [])) if (o && o.id != null) seen.add(+o.id);
    if (typeof BV_ORES !== 'undefined' && BV_ORES instanceof Map) {
      for (const [id, e] of BV_ORES) {
        if (seen.has(+id) || !e || !e.yields || !Object.keys(e.yields).length) continue;
        if (!MOON_ORE_RE.test(e.name || '')) continue;
        seen.add(+id);
        moonOres.push({ id: +id, name: e.name, volume: e.volume, portion: e.portion, yields: { ...e.yields }, category: e.category });
      }
    }
  } catch {}
  const sources = ores.concat(iceOreList || [], moonOres);
  if (!sources.length) throw new Error('ore yield lookup failed (Everef unreachable)');
  say('Pricing ' + Object.keys(needs).length + ' materials @ ' + region + '…');
  await new Promise(r => setTimeout(r, 30));
  const minPrice = {};
  const priced = await Promise.all(Object.keys(needs).map(mid => marketPrice(+mid, region, 'sell').catch(() => null)));
  Object.keys(needs).forEach((mid, i) => { minPrice[mid] = priced[i] || 0; });
  const needName = {};
  await Promise.all(Object.keys(needs).map(async mid => { needName[mid] = D.minerals[mid] || await typeName(+mid); }));
  // per-material source with selectable alternative (for space-limited ores)
  // miningSelection[mid] remembers the player's pick per mineral so the plan recalculates with that rock
  if (typeof window.miningSelection === 'undefined') window.miningSelection = {};
  const perMin = [];
  for (const [mid, need] of Object.entries(needs)) {
    const ranked = [];
    for (const o of sources) {
      const y = o.yields[mid]; if (!y) continue;
      const units = Math.ceil(need / (y * eff) / o.portion) * o.portion;
      const m3 = units * o.volume;
      ranked.push({ ore: o, units, m3, mins: m3 / rate, y });
    }
    ranked.sort((a,b)=>a.m3 - b.m3);
    if (ranked.length) {
      const chosenId = window.miningSelection[mid];
      let chosen = ranked.find(r => r.ore.id === chosenId);
      if (!chosen) chosen = ranked[0];
      perMin.push({ mid, name: needName[mid], need, ...chosen, y: chosen.y, ranked, chosenId: chosen.ore.id });
    }
  }
  // combined plan: merge the per-mineral fastest picks by ore so every mineral is covered
  const byOre = {};
  for (const p of perMin) {
    const g = (byOre[p.ore.id] = byOre[p.ore.id] || { ore: p.ore, units: 0, m3: 0, mins: 0, for: [] });
    g.units += p.units; g.m3 += p.m3; g.mins += p.mins; g.for.push(p.name + ' ×' + fmtN(p.need));
  }
  const merged = Object.values(byOre).sort((a, b) => b.m3 - a.m3);
  const totalM3 = merged.reduce((s, g) => s + g.m3, 0);
  const totalMins = merged.reduce((s, g) => s + g.mins, 0);
  const totalValue = Object.entries(needs).reduce((s, [mid, n]) => s + n * (minPrice[mid] || 0), 0);
  const curShip = ($('mineShip') && $('mineShip').value) || 'retriever';
  const shipOpts = D.ships.map(s => '<option value="' + s.id + '"' + (s.id===curShip?' selected':'') + '>' + s.name + ' — ' + s.rate + ' m³/min (' + (Math.round(s.rate/60*10)/10) + '/sec)</option>').join('');
  const curSec = (Math.round((rate/60)*10)/10);
  let h = '<div class="panel" style="margin-top:.8rem"><div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;justify-content:space-between"><h3 style="margin:0"><i class="fas fa-gem"></i> Mining plan <span class="pill" style="margin-left:.5rem">' + fmtISK(totalValue) + ' of materials</span></h3><div style="display:flex;align-items:center;gap:.4rem"><label style="font-size:.78rem;color:var(--text2)">Ship</label><select id="mineShipTop" style="background:#141414;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:.35rem .5rem;font-family:inherit;font-size:.82rem;min-width:160px">' + shipOpts + '</select><span class="pill" style="font-size:.75rem">' + rate + ' m³/min · ' + curSec + ' /sec</span></div></div>';
  h += '<p class="hint">Needs from current BOM · ' + rate + ' m³/min (' + curSec + ' /sec) · refining ' + Math.round(eff * 100) + '% · prices ' + ((D.hubs.find(x => x.region === region) || {}).name || region) + '</p>';
  // Combined rock list: one line per rock with summed units across materials.
  const combinedLine = merged.map(g => '<b>' + g.ore.name + '</b> ×' + fmtN(g.units)).join(' · ');
  h += '<div class="summary-grid" style="margin-top:.6rem"><div class="summary-card"><div class="k">Total volume</div><div class="v">' + fmtN(Math.round(totalM3)) + ' m³</div></div>' +
    '<div class="summary-card"><div class="k">Total mining time</div><div class="v">' + fmtTime(totalMins) + '</div></div>' +
    '<div class="summary-card"><div class="k">Material value</div><div class="v">' + fmtISK(totalValue) + '</div><div class="k">' + fmtISK(totalMins > 0 ? totalValue / (totalMins / 60) : 0) + '/hr implied</div></div></div>';
  h += '<p class="hint" style="margin-top:.4rem"><b>Combined load:</b> ' + combinedLine + '</p>';
  h += '</div>'; // close the main mining-plan panel
  // Single per-material table: every alternative rock in the dropdown, the
  // fastest tagged ★ so it stands out. Changing the dropdown recalculates.
  h += '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-gem"></i> Mine this <span class="pill" style="margin-left:.5rem">' + perMin.length + '/' + Object.keys(needs).length + ' materials</span></h3><p class="hint" style="margin-top:.2rem">Pick the rock you can actually mine — ★ marks the fastest source per material. Changing the dropdown recalculates the totals above.</p><div style="overflow-x:auto"><table class="bom"><thead><tr><th>Material</th><th>Need</th><th>Source</th><th>Units</th><th>Volume</th><th>Time</th><th></th></tr></thead><tbody>' +
    perMin.map(p => {
      const fastestId = (p.ranked && p.ranked[0] && p.ranked[0].ore.id) || null;
      const opts = (p.ranked || []).map(r => '<option value="' + r.ore.id + '"' + (r.ore.id===p.chosenId?' selected':'') + '>' + (r.ore.id===fastestId ? '★ ' : '') + r.ore.name + ' — ' + fmtN(r.units) + ' units · ' + fmtN(Math.round(r.m3)) + ' m³ · ' + fmtTime(r.mins) + ' (' + fmtN(r.y) + '/portion)</option>').join('');
      const yieldHint = p.y ? ' ('+fmtN(p.y)+'/portion)' : '';
      const fastPill = (p.chosenId === fastestId) ? ' <span class="pill" style="border-color:var(--accent);color:var(--accent)" title="Fastest source for this material">★ fastest</span>' : '';
      return '<tr><td>' + p.name + '</td><td>' + fmtN(p.need) + '</td><td><select data-mine-choice="' + p.mid + '" style="background:#141414;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:.3rem .4rem;font-family:inherit;font-size:.82rem;max-width:260px">' + opts + '</select>' + fastPill + '<span class="nums">' + yieldHint + '</span></td><td>' + fmtN(p.units) + '</td><td>' + fmtN(Math.round(p.m3)) + ' m³</td><td>' + fmtTime(p.mins) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(p.ore.id) + '"><i class="fas fa-chart-line"></i></a>' + infoButton(p.ore.id) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
  box.innerHTML = h;
  if (!isAuto) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  st.textContent = '';
  } catch (e) {
    st.textContent = 'Mining plan failed: ' + (e && e.message ? e.message : e);
    box.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-gem"></i> Mining plan</h3><p class="hint">Failed: ' + (e && e.message ? e.message : e) + '. Check your connection and try again.</p></div>';
  }
}

// ---- Inventory (industrial stock: character + corp) ----
let stkRaw = [], stkAgg = {}, stkAllAgg = {}, stkAggBySystem = {}, stkAggByStation = {}, stkLocationNames = {}, stkNames = {}, stkPage = 1, stkPageSize = 25;
let stkSystems = {}, stkLocSystem = {}, stkSysLocIds = [], stkSysNames = {}, stkTypeLocs = {};
let stkOreDetail = [], stkRefineEff = 0.75;
// Option A: port from assest test — enriched per-stack list + flag/container/type caches + detail view state
let stkEnriched = [], stkEnrichedAll = [], stkTypeFlags = {}, stkTypeGroups = {}, stkContainerNames = {}, stkDetailPage = 1;
// Custom user-set names for containers/ships (ESI assets/names, item_id -> name).
// Preferred over type names in container display; cleared on Clear/source change.
let stkCustomNames = {};
// ESI error-limit circuit breaker: once a 420/429 is seen, the scan skips all
// remaining non-essential ESI lookups (names, per-type fallback, custom names)
// instead of hammering a rate-limited endpoint. Reset at each scan start.
let bvEsiLimited = false;
// Shared backend structure cache (crowdsourced structure_id -> system_id).
// Same backend that serves /api/bv/config + token-exchange.
function bvBackendBase() {
  try {
    const host = (typeof location !== 'undefined' && location.hostname) || '';
    if (['localhost', '127.0.0.1'].includes(host)) return 'http://localhost:8080';
  } catch {}
  return 'https://api.rustybot.co.uk';
}
// GET known mappings for unresolved IDs. Returns {id: {system_id, name}}.
async function bvSharedLookup(ids) {
  const out = {};
  const clean = [...new Set((ids || []).map(n => +n).filter(n => Number.isFinite(n) && n >= 1e12))];
  if (!clean.length) return out;
  try {
    for (let i = 0; i < clean.length; i += 500) {
      const r = await fetchJSON(bvBackendBase() + '/api/bv/structures?ids=' + clean.slice(i, i + 500).join(','));
      const got = (r && r.structures) || {};
      for (const [k, v] of Object.entries(got)) {
        if (v && v.system_id) out[String(k)] = v;
      }
    }
  } catch (e) { console.warn('[BV] shared structure lookup failed', e && e.message); }
  return out;
}
// POST ESI-authoritative resolutions (corp endpoint + successful GETs only —
// NEVER manual user mappings, which stay local so guesses can't poison it).
async function bvSharedUpload(list) {
  const rows = (list || []).filter(e => e && e.structure_id && e.system_id);
  if (!rows.length) return 0;
  try {
    // Fresh token (silent refresh) + one forced-refresh retry on 401 — a
    // background inventory scan must never force a re-login on its own.
    const postOnce = async token => fetch(bvBackendBase() + '/api/bv/structures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ structures: rows.slice(0, 200) })
    });
    let accessToken = await BVAuth.getAccessToken().catch(() => null);
    if (!accessToken) return 0;
    let r = await postOnce(accessToken);
    if (r.status === 401) {
      try {
        await BVAuth.refreshToken();
        accessToken = await BVAuth.getAccessToken();
        r = await postOnce(accessToken);
      } catch { return 0; }
    }
    if (!r.ok) { console.warn('[BV] shared structure upload rejected', r.status); return 0; }
    const j = await r.json().catch(() => ({}));
    return (j && j.accepted) || 0;
  } catch (e) { console.warn('[BV] shared structure upload failed', e && e.message); return 0; }
}
function bvHitLimit(e) {
  const hit = /420|\b429\b/.test(String((e && e.message) || e || ''));
  if (hit && !bvEsiLimited) { bvEsiLimited = true; console.warn('[BV] ESI rate limit hit — remaining ESI lookups skipped this scan'); }
  return hit;
}
// Resolve a container/ship asset's display name: custom name first, then type name.
function stkContainerDisplayName(itemId, typeId) {
  try { if (itemId != null && stkCustomNames[String(itemId)]) return stkCustomNames[String(itemId)]; } catch {}
  try {
    const pid = +typeId;
    if (stkNames[pid]) return stkNames[pid];
    if (BV_MAT_NAMES && BV_MAT_NAMES.get(pid)) return BV_MAT_NAMES.get(pid);
  } catch {}
  return 'Type ' + typeId;
}
// Batch-fetch custom names for container/ship item_ids (ESI assets/names,
// max 1000 IDs/call, same scopes as the asset scan so no relogin is needed).
// Missing entries simply have no custom name — callers fall back to type names.
async function stkFetchCustomNames(parentIds, src, cid, corpId) {
  const out = {};
  if (bvEsiLimited) return out;
  const ids = [...new Set((parentIds || []).map(n => +n).filter(n => Number.isFinite(n) && n > 0))];
  if (!ids.length) return out;
  const posts = [];
  if ((src === 'personal' || src === 'both') && cid) posts.push('/characters/' + cid + '/assets/names/?datasource=tranquility');
  if ((src === 'corp' || src === 'both') && corpId) posts.push('/corporations/' + corpId + '/assets/names/?datasource=tranquility');
  for (const path of posts) {
    for (let i = 0; i < ids.length; i += 1000) {
      try {
        const rows = await BVAuth.api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids.slice(i, i + 1000)) });
        (Array.isArray(rows) ? rows : []).forEach(r => { if (r && r.item_id && r.name) out[String(r.item_id)] = r.name; });
      } catch (e) { bvHitLimit(e); console.warn('[BV] assets/names batch failed (' + path + '):', e && e.message); break; }
    }
  }
  return out;
}
const STK_DETAIL_PAGE_SIZE = 25;
let stkSortCol = 'name', stkSortRev = false;
let _stkFilterTimer = null;
const STK_MAX_DISPLAY = 2500;
let stkFilters = [];
let stkTreeMode = false;
try { stkFilters = JSON.parse(localStorage.getItem('bvStkFilters') || '[]'); if (!Array.isArray(stkFilters)) stkFilters = []; } catch { stkFilters = []; }
try { stkTreeMode = localStorage.getItem('bvStkTreeMode') === '1'; } catch {}
function stkFlag() { try { return ($('stkFlag') && $('stkFlag').value) || 'All'; } catch { return 'All'; } }
function stkIndustrialOnly() { try { return !!($('stkIndustrialOnly') && $('stkIndustrialOnly').checked); } catch { return false; } }
const STK_COLS = ['All','Name','System','Location','Flag','Container','Quantity','Group','TypeID'];
const STK_CMPS = ['Contains','NotContains','Equals','NotEquals','Regex','GreaterThan','LessThan'];
function stkGetField(a, col) {
  const c = col || 'All';
  if (c === 'All') return '';
  if (c === 'Name') return stkTypeName(a.type_id) || '';
  if (c === 'System') return a.system_name || '';
  if (c === 'Location') return a.location_name || '';
  if (c === 'Flag') return a._flagDisplay || a.location_flag || '';
  if (c === 'Container') return a._containerName || '';
  if (c === 'Quantity') return String(a.quantity ?? '');
  if (c === 'Group') return stkTypeGroups[a.type_id] || a._containerGroup || '';
  if (c === 'TypeID') return String(a.type_id ?? '');
  return '';
}
function stkEvalCompare(fieldVal, compare, text) {
  const fv = String(fieldVal ?? '');
  const tv = String(text ?? '');
  const cmp = compare || 'Contains';
  if (cmp === 'Contains') return fv.toLowerCase().includes(tv.toLowerCase());
  if (cmp === 'NotContains') return !fv.toLowerCase().includes(tv.toLowerCase());
  if (cmp === 'Equals') return fv.toLowerCase() === tv.toLowerCase();
  if (cmp === 'NotEquals') return fv.toLowerCase() !== tv.toLowerCase();
  if (cmp === 'Regex') { try { const re = new RegExp(tv, 'i'); return re.test(fv); } catch { return false; } }
  if (cmp === 'GreaterThan') { const nF = parseFloat(fv), nT = parseFloat(tv); if (isNaN(nF) || isNaN(nT)) return false; return nF > nT; }
  if (cmp === 'LessThan') { const nF = parseFloat(fv), nT = parseFloat(tv); if (isNaN(nF) || isNaN(nT)) return false; return nF < nT; }
  return false;
}
function stkPassesOneFilter(a, f) {
  if (!f.enabled) return true;
  const txt = (f.text || '').trim();
  if (!txt && f.compare !== 'Regex') return true;
  const col = f.column || 'All';
  if (col === 'All') {
    // All columns: pass if any column matches
    for (const c of STK_COLS.slice(1)) {
      const fv = stkGetField(a, c);
      if (stkEvalCompare(fv, f.compare, txt)) return true;
    }
    return false;
  }
  const fv = stkGetField(a, col);
  return stkEvalCompare(fv, f.compare, txt);
}
function stkAdvancedActive() {
  // The JeveAssets filter-manager UI was removed from the page; stale saved
  // filters in localStorage must not silently nuke results with no way to clear them.
  try { if (!$('stkFilterRows')) return false; } catch { return false; }
  return !!(stkFilters && stkFilters.length);
}
function stkPassesAdvanced(a) {
  if (!stkAdvancedActive()) return true;
  if (!stkFilters || !stkFilters.length) return true;
  const enabled = stkFilters.filter(f => f.enabled && ((f.text || '').trim() !== '' || f.compare === 'Regex'));
  if (!enabled.length) return true;
  const ands = enabled.filter(f => f.logic === 'And');
  const orGroups = {};
  for (const f of enabled.filter(f => f.logic === 'Or')) { const g = String(f.group || '0'); if (!orGroups[g]) orGroups[g]=[]; orGroups[g].push(f); }
  for (const f of ands) if (!stkPassesOneFilter(a,f)) return false;
  for (const gid in orGroups) { let ok=false; for (const f of orGroups[gid]) if (stkPassesOneFilter(a,f)) { ok=true; break; } if (!ok) return false; }
  return true;
}
function stkSaveFilters() { try { localStorage.setItem('bvStkFilters', JSON.stringify(stkFilters)); } catch {} }
function stkPersistSets(sets) { try { localStorage.setItem('bvStkFilterSets', JSON.stringify(sets)); } catch {} }
function stkLoadSets() { try { const v = JSON.parse(localStorage.getItem('bvStkFilterSets') || '{}'); return v && typeof v==='object' ? v : {}; } catch { return {}; } }
function renderStkFilterRows() {
  const box = $('stkFilterRows'); if (!box) return;
  const sets = stkLoadSets();
  const sel = $('stkFilterLoadSelect');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Load saved —</option>' + Object.keys(sets).map(k => '<option value="' + k.replace(/"/g,'&quot;') + '">' + k + '</option>').join('');
    if (cur && sets[cur]) sel.value = cur;
  }
  if (!stkFilters.length) { box.innerHTML = '<p class="hint">No filters — showing all (JeveAssets: Add a filter to narrow). Quick filter + flag + Industrial toggle still apply.</p>'; return; }
  let h='';
  stkFilters.forEach((f,i) => {
    h += '<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:.35rem">'
      + '<label title="Enable/disable" style="display:flex;align-items:center;gap:.2rem"><input type="checkbox" data-fe="en" data-i="' + i + '"' + (f.enabled?' checked':'') + '></label>'
      + '<select data-fe="logic" data-i="' + i + '" style="width:70px;padding:2px 4px"><option value="And"' + (f.logic==='And'?' selected':'') + '>And</option><option value="Or"' + (f.logic==='Or'?' selected':'') + '>Or</option></select>'
      + '<input data-fe="group" data-i="' + i + '" type="number" min="0" max="9" value="' + (f.group||0) + '" title="Group for Or" style="width:52px;padding:2px 4px">'
      + '<select data-fe="col" data-i="' + i + '" style="width:110px;padding:2px 4px">' + STK_COLS.map(c => '<option value="' + c + '"' + (f.column===c?' selected':'') + '>' + c + '</option>').join('') + '</select>'
      + '<select data-fe="cmp" data-i="' + i + '" style="width:130px;padding:2px 4px">' + STK_CMPS.map(c => '<option value="' + c + '"' + (f.compare===c?' selected':'') + '>' + c.replace('NotContains','Does not contain').replace('GreaterThan','Greater than').replace('LessThan','Less than') + '</option>').join('') + '</select>'
      + '<input data-fe="text" data-i="' + i + '" type="text" placeholder="Text / number / regex" value="' + String(f.text||'').replace(/"/g,'&quot;') + '" style="flex:1;min-width:140px;padding:4px 6px;background:#141414;border:1px solid var(--border);color:var(--text);border-radius:6px">'
      + '<button class="mode-btn" data-fe="clone" data-i="' + i + '" title="Clone"><i class="fas fa-copy"></i></button>'
      + '<button class="mode-btn" data-fe="del" data-i="' + i + '" title="Remove" style="color:var(--danger)"><i class="fas fa-times"></i></button>'
      + '</div>';
  });
  box.innerHTML = h;
}
// Mirrors assest test/asset_classifier.py:filter_by_flag
function stkFlagMatchAsset(a, flag) {
  if (!flag || flag === 'All') return true;
  const f = (a.location_flag || '').toLowerCase();
  const cn = (a._containerName || '').toLowerCase();
  const cg = (a._containerGroup || '').toLowerCase();
  const q = flag.toLowerCase();
  if (q === 'hangar') return f.includes('hangar') || f.includes('corpsag') || f.includes('corp');
  if (q === 'bay') return f.includes('bay');
  if (q === 'can') {
    // Structural truth (like assest test: location_id in item_map ⇒ inside a container/can):
    // container names may be unresolved ("Type 12345") when the names batch 400s,
    // so a nested item counts as in a can/container even without the word in its name.
    if (a._isNested) return true;
    return cn.includes('container') || cg.includes('container') || ['cargo container','secure cargo container','audit log secure container','freight container'].includes(cg);
  }
  if (q === 'assetsafety') return f.includes('assetsafety');
  if (q === 'corp hangar') return f.includes('corpsag');
  return f.includes(q) || cn.includes(q);
}
// system-first: #stkSystem holds the selected solar_system_id (e.g. '30004691' for O4T-Z5)
function stkSysId() { try { return ($('stkSystem') && $('stkSystem').value) || ''; } catch { return ''; } }
function stkAllSystems() { try { return !!($('stkAllSystems') && $('stkAllSystems').checked); } catch { return false; } }

// A scan is in flight — set by loadInventory so the 20-minute auto-refresh
// can't start a second concurrent scan.
let stkScanBusy = false;
// ---- saved build systems ----
// Selecting a system adds it here so the common industrial systems stay one
// click away. Held in localStorage (survives reload) and de-duplicated by id.
const STK_SAVED_SYS_KEY = 'bvStkSavedSystems';
function stkSavedSystemsRead() {
  try {
    const v = JSON.parse(localStorage.getItem(STK_SAVED_SYS_KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter(e => e && e.id && e.name).map(e => ({ id: String(e.id), name: String(e.name) }));
  } catch { return []; }
}
function stkSavedSystemsWrite(list) {
  try { localStorage.setItem(STK_SAVED_SYS_KEY, JSON.stringify(list || [])); } catch {}
}
function stkSavedSystemAdd(id, name) {
  const sid = String(id || ''), nm = String(name || '').trim();
  if (!sid || !nm) return;
  const list = stkSavedSystemsRead().filter(e => e.id !== sid);
  list.unshift({ id: sid, name: nm });               // most recent first
  stkSavedSystemsWrite(list.slice(0, 12));
  renderStkSavedSystems();
}
function stkSavedSystemRemove(id) {
  stkSavedSystemsWrite(stkSavedSystemsRead().filter(e => e.id !== String(id)));
  renderStkSavedSystems();
}
function renderStkSavedSystems() {
  const box = $('stkSavedSys');
  if (!box) return;
  const list = stkSavedSystemsRead();
  const active = stkSysId();
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = list.map(e =>
    '<span class="stk-sys-chip' + (e.id === active ? ' active' : '') + '" data-syssid="' + escapeHtml(e.id) + '" title="' + escapeHtml(e.name) + ' (click to use)">'
    + '<span class="nm">' + escapeHtml(e.name) + '</span>'
    + '<button data-sysrm="' + escapeHtml(e.id) + '" title="Remove ' + escapeHtml(e.name) + ' from this list" aria-label="Remove ' + escapeHtml(e.name) + '">&times;</button></span>'
  ).join('');
  box.querySelectorAll('[data-sysrm]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    stkSavedSystemRemove(b.dataset.sysrm);
  });
  box.querySelectorAll('.stk-sys-chip').forEach(chip => chip.onclick = () => {
    const id = chip.dataset.syssid;
    const entry = stkSavedSystemsRead().find(x => x.id === id);
    if (!entry) return;
    const input = $('stkSystemInput');
    if ($('stkSystem')) $('stkSystem').value = entry.id;
    if (input) { input.value = entry.name; input.dataset.pickedId = entry.id; }
    try { stkSysNames[entry.id] = entry.name; } catch {}
    try { const cb = $('stkAllSystems'); if (cb && cb.checked) { cb.checked = false; try { localStorage.setItem('bvStkAllSystems', '0'); } catch {} } } catch {}
    renderStkSavedSystems();
    stkRescopeSystem();
  });
}
function stkSysIdName(id) {
  if (stkSysNames[id]) return stkSysNames[id];
  try { const s = (typeof Systems !== 'undefined' ? Systems.find(x => String(x.id) === String(id)) : null); if (s) { stkSysNames[id] = s.name; return s.name; } } catch {}
  return id;
}
function stkCurrentAgg() {
  // the scanned system aggregate lives in stkAgg; after a page reload fall back
  // to the saved snapshot so the list/refinery still show the last scan
  const snap = stkSnapshotRead(matSource());
  if (stkAllSystems()) {
    if (Object.keys(stkAllAgg).length) return stkAllAgg;
    if (snap && snap.allByType) return snap.allByType;
  } else {
    const scoped = stkAggBySystem[stkSysId()];
    if (scoped && Object.keys(scoped).length) return scoped;
    if (snap && snap.bySystem && snap.bySystem[stkSysId()]) return snap.bySystem[stkSysId()];
  }
  if (Object.keys(stkAgg).length) return stkAgg;
  if (snap && snap.byType) return snap.byType;
  return stkAgg;
}
function stkCurrentSysName() {
  if (stkAllSystems()) return 'All personal systems';
  const sys = stkSysId();
  if (sys) return stkSysIdName(sys);
  const snap = stkSnapshotRead(matSource());
  return (snap && snap.systemName) || '';
}
function stkHasLocationData() { return Object.keys(stkAggByStation).length > 0; }
// Persistent per-source inventory snapshots (personal + corp kept separately) in memory (S) +
// localStorage so Shopping/Build/Mining deduct them. The Calc tab's Materials-owned selector
// (matSource) picks which source(s) the calculator deducts from.
let stkRawSource = 'personal', stkLastSnapshotSource = 'personal';
// Bump when the snapshot layout changes (e.g. refining rules) so stale saved
// snapshots are ignored and rebuilt on the next inventory search.
const SNAPSHOT_VER = 2;
function stkSnapshotStoreRead() {
  try {
    const v = JSON.parse(localStorage.getItem('bvInventorySnapshot') || 'null');
    if (v && v._multi) {
      const out = { _multi: true };
      for (const [k, s] of Object.entries(v)) if (k !== '_multi' && s && s.ver === SNAPSHOT_VER) out[k] = s;
      return out;
    }
    if (v && v.refinedMap && v.ver === SNAPSHOT_VER) return { _multi: true, [v.source || 'personal']: v };
    return { _multi: true };
  } catch { return { _multi: true }; }
}
function stkSnapshotRead(source) {
  const store = S.inventorySnapshots || stkSnapshotStoreRead();
  return store[source || matSource()] || null;
}
function stkSnapshotWrite(s) {
  const src = (s && s.source) || 'personal';
  S.inventorySnapshots = S.inventorySnapshots || stkSnapshotStoreRead();
  S.inventorySnapshots[src] = s;
  stkLastSnapshotSource = src;
  try { localStorage.setItem('bvInventorySnapshot', JSON.stringify(S.inventorySnapshots)); } catch {}
}
function stkSnapshotClear() { S.inventorySnapshots = {}; try { localStorage.removeItem('bvInventorySnapshot'); } catch {} }
// Full scan-cache reset: wipes every locally cached scan artifact (structure
// names, 403 denials, station systems, snapshots, ore yields) plus any legacy
// manual structure mappings, from storage AND memory so the next scan starts
// completely fresh. Deliberately keeps UI prefs (bvPrefs), list filters and
// page sizes.
const BV_SCAN_CACHE_KEYS = ['bvStructNames', 'bvStructDenied', 'bvStaSys', 'bvInventorySnapshot', 'bvOres2', 'bvStructOverrides'];
function stkResetAllCaches() {
  try { for (const k of BV_SCAN_CACHE_KEYS) localStorage.removeItem(k); } catch {}
  try { oreCache.clear(); } catch {}
  try { stkIndustrialProbed.clear(); } catch {}
  S.inventorySnapshots = {};
  stkRaw = []; stkAgg = {}; stkAllAgg = {}; stkAggBySystem = {}; stkAggByStation = {};
  stkLocationNames = {}; stkSystems = {}; stkLocSystem = {}; stkTypeLocs = {};
  stkNames = {}; stkCustomNames = {}; stkOreDetail = [];
  stkEnriched = []; stkEnrichedAll = []; stkTypeFlags = {}; stkContainerNames = {}; stkTypeGroups = {};
  stkPage = 1; stkDetailPage = 1;
}
function matSource() { return ($('matSource') && $('matSource').value) || 'personal'; }
// Refined deduction map for the calculator's Materials-owned source (ore already refined to
// minerals at refine %), else the live scope. 'both' merges personal + corp snapshots.
function stkDeductSnapshot() {
  const src = matSource();
  const store = S.inventorySnapshots || stkSnapshotStoreRead();
  if (src === 'both') {
    const mergedSnap = store['both'];
    if (mergedSnap && mergedSnap.refinedMap) return { snap: mergedSnap, map: mergedSnap.refinedMap, src };
    const list = ['personal', 'corp'].map(s => store[s]).filter(s => s && s.refinedMap);
    if (list.length) {
      const out = {};
      for (const s of list) for (const [t, q] of Object.entries(s.refinedMap)) out[t] = (out[t] || 0) + q;
      return { snap: list[0], map: out, src };
    }
    return { snap: null, map: stkCurrentAgg(), src };
  }
  if (store[src] && store[src].refinedMap) return { snap: store[src], map: store[src].refinedMap, src };
  // No snapshot for the chosen source — fall back to the most recent one, else the live scope.
  if (stkLastSnapshotSource && store[stkLastSnapshotSource] && store[stkLastSnapshotSource].refinedMap) return { snap: store[stkLastSnapshotSource], map: store[stkLastSnapshotSource].refinedMap, src };
  if ((stkRawSource || 'personal') === src) return { snap: null, map: stkCurrentAgg(), src };
  return { snap: null, map: {}, src };
}
function stkDeductMap() { return stkDeductSnapshot().map; }
// Expand ore / compressed-ore / ice stacks into refined minerals at the selected
// Refining yield %, keep every row's provenance (which citadel/station/can), and
// store the whole system snapshot. aggOverride lets the refine-% auto-rebuild reuse
// the stored aggregate after a page reload (when the live stkAgg is empty).
async function buildInventorySnapshot(aggOverride, prevOreDetail, source, sysId, sysName) {
  const agg = aggOverride || stkCurrentAgg();
  const eff = (parseFloat(($('refinePct') && $('refinePct').value) || 75) || 75) / 100;
  stkRefineEff = eff;
  const refinedMap = {}; const oreDetail = [];
  const locsFor = t => {
    if (stkTypeLocs[t] && stkTypeLocs[t].size) return [...stkTypeLocs[t]].map(l => stkLocationNames[l] || ('Structure …' + String(l).slice(-4)));
    const prev = (prevOreDetail || []).find(o => o.oreId === t);
    return (prev && prev.locs) || [];
  };
  for (const [tid, qty] of Object.entries(agg)) {
    const t = +tid;
    if (D.minerals && D.minerals[t]) { refinedMap[t] = (refinedMap[t] || 0) + qty; continue; }
    if (iceProductIds.has(t)) { refinedMap[t] = (refinedMap[t] || 0) + qty; continue; }
    try { if (isPI(t)) { refinedMap[t] = (refinedMap[t] || 0) + qty; continue; } } catch {}
    // try ore refinement — ore, compressed ore, ice, compressed ice, moon ore,
    // compressed moon ore and gas. Ammo, salvage, modules etc. also carry
    // type_materials but must NOT be refined into minerals here, so only
    // ore-family types with yields refine (see stkIsRefinableOre).
    // Pre-filter: the baked SDE table answers instantly; only IDs in it (or
    // matching ore-name patterns but missing from the table, i.e. post-SDE
    // types) may hit the network. Ships/modules/ammo skip it entirely —
    // previously every one burned a sequential Everef round-trip here.
    let ore = null;
    try {
      const inTable = (typeof BV_ORES !== 'undefined' && BV_ORES.has(t)) || oreCache.has(t);
      if (inTable) ore = await fetchOre(t);
      else if (stkIndustrialNameMatch(stkTypeNameForFilter(t))) { try { ore = await fetchOre(t); } catch {} }
    } catch {}
    const yields = (ore && ore.yields) || {};
    if (stkIsRefinableOre(ore, t)) {
      const oreName = stkNames[t] || ore.name || ('Type ' + t);
      const minerals = [];
      for (const [mid, y] of Object.entries(yields)) {
        const rq = Math.floor(qty * (y || 0) / (ore.portion || 100) * eff);
        if (rq > 0) { refinedMap[mid] = (refinedMap[mid] || 0) + rq; minerals.push({ mid: +mid, name: (D.minerals[+mid] || stkNames[mid] || ('Type ' + mid)), qty: rq }); }
      }
      if (minerals.length) oreDetail.push({ oreId: t, oreName, oreQty: qty, locs: locsFor(t), refined: minerals });
      continue;
    }
    refinedMap[t] = (refinedMap[t] || 0) + qty;
  }
  stkOreDetail = oreDetail;
  stkSnapshotWrite({
    system: sysId || stkSysId(), systemName: sysName || stkSysIdName(stkSysId()),
    source: source || (($('stkSource') && $('stkSource').value) || 'personal'),
    ver: SNAPSHOT_VER, eff, at: Date.now(),
    byType: agg, byLoc: stkAggByStation, locNames: stkLocationNames,
    bySystem: stkAggBySystem, allByType: stkAllAgg, refinedMap, oreDetail
  });
  return oreDetail;
}
// Snapshot source: when Industrial-only is ticked the filtered set feeds the
// calculator (Shopping deduct + Refinery), otherwise the full scoped aggregate.
// Hulls are stripped here on purpose: the view shows industrial ships, but a
// hull is never a build material, so it must not deduct from a shopping list
// or be handed to the refinery.
function stkSnapshotAggForSource() {
  try {
    if (stkIndustrialOnly() && stkEnrichedAll.length) {
      const rows = stkFilteredAgg();
      if (rows && rows.length) {
        const map = {};
        for (const r of rows) {
          if (!isIndustrialMaterial(r.typeId)) continue;
          map[r.typeId] = (map[r.typeId] || 0) + r.qty;
        }
        // Return the map even when empty: the industrial filter DID match (we
        // are inside this branch), so the right answer is "deduct nothing",
        // not "fall back to the unscoped aggregate" which would feed every
        // asset in scope into the shopping deduct.
        return map;
      }
    }
  } catch {}
  return null;
}
// Re-run the ore->minerals math with the current Refining % from the stored snapshot
// (no asset re-fetch) and refresh Shopping + Refinery. Returns false if nothing loaded.
async function rebuildInventorySnapshot() {
  const ded = stkDeductSnapshot();
  const snap = ded.snap;
  if (!snap || !Object.keys(snap.byType || {}).length) return false;
  await buildInventorySnapshot(snap.byType, snap.oreDetail || [], ded.src, snap.system, snap.systemName);
  if (S.root) { try { await renderShoppingList(S.runs || 1); } catch {} }
  renderRefinery();
  return true;
}
const STK_PAGE_OPTIONS = [25, 50, 100];
try {
  const s = parseInt(localStorage.getItem('bvStkPageSize') || '', 10);
  if (STK_PAGE_OPTIONS.includes(s)) stkPageSize = s;
} catch {}
const COMPREHENSIVE_IDS = new Set([18, 19, 20, 21, 22, 34, 35, 36, 37, 38, 39, 40, 44, 1055, 1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1787, 1788, 2073, 2267, 2268, 2270, 2272, 2286, 2287, 2288, 2305, 2306, 2307, 2308, 2309, 2310, 2311, 2344, 2345, 2346, 2348, 2349, 2351, 2352, 2354, 2358, 2360, 2361, 2367, 2388, 2389, 2390, 2392, 2393, 2394, 2395, 2396, 2397, 2398, 2399, 2400, 2401, 2463, 2867, 2868, 2869, 2870, 2871, 2872, 2875, 2876, 3645, 3683, 3689, 3691, 3693, 3695, 3697, 3725, 3775, 3779, 3828, 9828, 9830, 9832, 9834, 9836, 9838, 9840, 9842, 9844, 9846, 9848, 11396, 11397, 11398, 11399, 15317, 16262, 16263, 16264, 16265, 16267, 16268, 16269, 16272, 16273, 16274, 16275, 16633, 16634, 16635, 16636, 16637, 16638, 16639, 16640, 16641, 16642, 16643, 16644, 16646, 16647, 16648, 16649, 16650, 16651, 16652, 17272, 17358, 17425, 17426, 17432, 17433, 17436, 17437, 17440, 17441, 17448, 17449, 17452, 17453, 17455, 17456, 17459, 17460, 17463, 17464, 17470, 17471, 17865, 17866, 17887, 17888, 17889, 17975, 25268, 25272, 25274, 25275, 25276, 25277, 25278, 25595, 25596, 25597, 25598, 25599, 25600, 25601, 25602, 25603, 25604, 25605, 25606, 25607, 25610, 25611, 25612, 25613, 25624, 25625, 28388, 28389, 28390, 28391, 28392, 28393, 28394, 28395, 28396, 28397, 28398, 28399, 28400, 28401, 28402, 28403, 28404, 28405, 28406, 28407, 28408, 28409, 28410, 28411, 28412, 28413, 28414, 28415, 28416, 28417, 28418, 28419, 28420, 28421, 28422, 28423, 28424, 28425, 28426, 28427, 28428, 28429, 28430, 28431, 28432, 28433, 28434, 28435, 28436, 28437, 28438, 28439, 28440, 28441, 28442, 30370, 30375, 30376, 30377, 30378]);
// Dynamically probed refinable/industrial type IDs (new compressed grades,
// moon/gas variants missing from the hardcoded lists). Filled per-scan by
// stkProbeIndustrial() via live SDE yields; cleared on Clear/source change.
const stkIndustrialProbed = new Set();
// Name patterns for ores the static lists miss (all compressed grades incl.
// 62xxx/82xxx, moon ores, ice, gas, isotopes). Used when SDE is unreachable.
// Name fallback for post-SDE-build types missing from every baked list/table.
// Hard-won exclusions (verified against SDE 3494416): blueprints are never
// industrial; mining crystals match "mercoxit" but are equipment; "Cold-Gas"
// modules match bare "gas"; "Compressed ..." railguns/coil guns match the
// compressed prefix. Real compressed ore all starts with "Compressed " and is
// in the baked table anyway — this only gates unknown future IDs.
function stkIndustrialNameMatch(nm) {
  if (!nm || /^(Type\s+\d+|ID\s+\d+)/i.test(nm)) return false;
  const n = String(nm);
  if (/blueprint/i.test(n)) return false;
  if (/crystal/i.test(n)) return false;
  if (/compressor/i.test(n)) return false;
  if (/reaction formula$/i.test(n)) return false;
  if (/design element/i.test(n) || /matte|satin|gloss/i.test(n)) return false;
  if (/ ore processing$/i.test(n)) return false;
  const l = n.toLowerCase();
  if (/^compressed\s/i.test(l) && !/(railgun|blaster|cannon|autocannon|artillery|launcher|laser|coil gun|shell)/i.test(l)) return true;
  if (/(arkonor|bistot|crokite|dark ochre|gneiss|hedbergite|hemorphite|jaspet|kernite|mercoxit|omber|plagioclase|pyroxeres|scordite|spodumain|veldspar|kylixium|hezorime|mordunium|nocxite|talassonite|glacial mass|dark glitt|blue ice|clear icicle|white glaze|gelidus|glare crust|krystallos)/i.test(l)) return true;
  if (/(mykoserocin|cytoserocin|fullerene|fullerite)/i.test(l)) return true;
  if (/(isotope|heavy water|liquid ozone|strontium clathrates?)/i.test(l)) return true;
  return false;
}
function stkTypeNameForFilter(id) {
  return stkNames[id] || (BV_MAT_NAMES && BV_MAT_NAMES.get(+id)) || '';
}
function isIndustrialMaterial(id){
  const nid=+id;
  if(COMPREHENSIVE_IDS.has(nid)) return true;
  if(BV_MATERIALS && BV_MATERIALS.has(nid)) return true;
  if(BV_MAT_NAMES && BV_MAT_NAMES.has(nid)) return true;
  if(D.minerals&&D.minerals[nid]) return true;
  if(iceProductIds && iceProductIds.has(nid)) return true;
  if(stkIndustrialProbed.has(nid)) return true;
  try{ if(typeof BV_ORES!=='undefined' && BV_ORES.has(nid)) return true; }catch{}
  try{ const P=(typeof PI_DATA!=='undefined'?PI_DATA:(typeof window!=='undefined'&&window.PI_DATA?window.PI_DATA:null)); if(P&&P.materials&&P.materials[String(nid)]) return true; }catch{}
  try{ if(D.ores&&D.ores.some(o=>o.id===nid)) return true; }catch{}
  try{ if(iceOreList&&iceOreList.some(o=>+o.id===nid)) return true; }catch{}
  try{ if(stkIndustrialNameMatch(stkTypeNameForFilter(nid))) return true; }catch{}
  return false;
}
// Industrial HULLS. Kept separate from isIndustrialMaterial on purpose: a ship
// is something you build or buy, never something you refine, so hulls must stay
// OUT of the Shopping deduct / Refinery snapshot that the calculator consumes.
// They are only wanted in the inventory *view* when "Industrial only" is on.
// Deliberately excludes combat command hulls (Command Ship / Command Destroyer /
// Combat Battlecruiser / Recon / Command Carrier) — those are not industrial.
const BV_INDUSTRIAL_HULL_GROUPS = new Set([
  'Capital Industrial Ship', 'Exhumer', 'Hauler', 'Industrial Command Ship', 'Mining Barge'
]);
function isIndustrialHull(id) {
  const nid = +id;
  if (!Number.isFinite(nid) || nid <= 0) return false;
  // R.A.M. / R.Db are deliberately NOT here: they are components filed under
  // the "Tool" group, not hulls. isIndustrialItem still counts them so the
  // inventory filter keeps them.
  try {
    const info = bvTypeInfoLocal(nid);
    if (info && info.c === 6 && BV_INDUSTRIAL_HULL_GROUPS.has(bvInfoName('groups', info.g) || '')) return true;
  } catch {}
  return false;
}
// Anything "Industrial only" should SHOW: build materials, industrial hulls,
// and the R.A.M. / R.Db tool components.
function isIndustrialItem(id) {
  try { if (bvIsIndustrialComponentAlias(id, stkTypeNameForFilter(+id))) return true; } catch {}
  return isIndustrialMaterial(id) || isIndustrialHull(id);
}
// Blueprints are inventory assets, so the scan already pulls them, but they are
// never "industrial" and never a build material — they get their own list.
// SDE category 9 is authoritative; the name suffix covers types the baked
// typeinfo is missing (and reaction formulas, which are not cat 9 but are
// inventory assets in the same family).
function isBlueprintAsset(id, name) {
  const nid = +id;
  if (!Number.isFinite(nid) || nid <= 0) return false;
  try {
    const info = bvTypeInfoLocal(nid);
    if (info) {
      if (info.c === 9) return true;
      if (info.c === 24) return true; // Reaction formula — same owned-assets family
    }
  } catch {}
  const n = String(name || stkTypeNameForFilter(nid) || '');
  return / blueprint$/i.test(n) || / reaction formula$/i.test(n);
}
// Every blueprint type present in the scanned inventory, aggregated by type.
function stkOwnedBlueprints() {
  const out = new Map();
  try {
    const src = stkCurrentAgg() || {};
    for (const key of Object.keys(src)) {
      const id = +key, qty = Number(src[key]) || 0;
      if (!(qty > 0) || !isBlueprintAsset(id)) continue;
      out.set(id, (out.get(id) || 0) + qty);
    }
  } catch {}
  return [...out.entries()]
    .map(([type_id, qty]) => ({ type_id, qty, name: stkTypeName(type_id) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }));
}
function renderStkBlueprintList() {
  const panel = $('stkBpPanel'), list = $('stkBpList'), meta = $('stkBpMeta');
  if (!panel || !list) return;
  const rows = stkOwnedBlueprints();
  panel.style.display = rows.length ? '' : 'none';
  if (!rows.length) { list.innerHTML = ''; if (meta) meta.textContent = ''; return; }
  const totalCopies = rows.reduce((a, r) => a + r.qty, 0);
  list.innerHTML = rows.map(r =>
    '<div class="rx-row"><span class="nm">' + escapeHtml(String(r.name)) + (r.qty > 1 ? ' <span class="pill">' + fmtN(r.qty) + '</span>' : '') + '</span></div>'
  ).join('');
  if (meta) meta.textContent = rows.length + ' type' + (rows.length === 1 ? '' : 's') + (totalCopies > rows.length ? ' · ' + fmtN(totalCopies) + ' copies' : '');
}
async function copyStkBlueprintList() {
  const rows = stkOwnedBlueprints();
  await copyToClipboard(
    rows.length ? rows.map(r => r.name + (r.qty > 1 ? ' x' + r.qty : '')).join('\n') : '',
    'Blueprint list copied (' + rows.length + ').',
    'No blueprints found in the scanned inventory.'
  );
}
function exportStkBlueprintsCSV() {
  const rows = stkOwnedBlueprints();
  if (!rows.length) { toast('No blueprints to export.', 'warn'); return; }
  downloadCSV('bv-inventory-blueprints.csv', [['type_name', 'type_id', 'quantity']].concat(rows.map(r => [r.name, r.type_id, r.qty])));
  status('Exported owned blueprints (' + rows.length + ' types) to CSV.');
}
// Pure local filter (NO network): classifies anything the static lists miss
// via the baked SDE ore table (scripts/build-bv-ores.mjs) + name patterns.
// The SDE already knows every refinable type, so classifying 500 types is
// instant — no Everef round-trips. Synchronous; callers may still await it.
function stkProbeIndustrial(ids) {
  const todo = (ids || []).map(n=>+n).filter(n=>Number.isFinite(n) && n>0 && !COMPREHENSIVE_IDS.has(n)
    && !(BV_MATERIALS && BV_MATERIALS.has(n)) && !(D.minerals&&D.minerals[n])
    && !(iceProductIds && iceProductIds.has(n)) && !stkIndustrialProbed.has(n));
  if (!todo.length) return;
  try {
    const P=(typeof PI_DATA!=='undefined'?PI_DATA:(typeof window!=='undefined'&&window.PI_DATA?window.PI_DATA:null));
    for (const id of todo) {
      try {
        if (P&&P.materials&&P.materials[String(id)]) { stkIndustrialProbed.add(id); continue; }
        if (typeof BV_ORES !== 'undefined' && BV_ORES.has(id)) { stkIndustrialProbed.add(id); continue; }
        if (stkIndustrialNameMatch(stkTypeNameForFilter(id))) { stkIndustrialProbed.add(id); continue; }
        try { if(D.ores&&D.ores.some(o=>o.id===id)) { stkIndustrialProbed.add(id); continue; } } catch {}
        try { if(iceOreList&&iceOreList.some(o=>+o.id===id)) { stkIndustrialProbed.add(id); continue; } } catch {}
      } catch {}
    }
  } catch {}
}
// Refinable = has SDE reprocessing yields and is an ore-family type. Category
// 25 covers classic ore/ice; moon/gas/compressed variants yield too — accept
// any probed industrial with yields rather than gating on one category.
function stkIsRefinableOre(ore, typeId) {
  const yields = (ore && ore.yields) || {};
  if (!ore || !Object.keys(yields).length) return false;
  if (ore.category === 25) return true;
  try { if (stkIndustrialProbed.has(+typeId)) return true; } catch {}
  try { if (stkIndustrialNameMatch(ore.name || stkTypeNameForFilter(typeId))) return true; } catch {}
  return false;
}
function stkTypeName(id) {
  return stkNames[id] || BV_MAT_NAMES.get(+id) || ('Type ' + id);
}
// Build per-stack enriched list like assest test/esi_client.py:enrich_assets + main.py:on_assets_ready
// Each entry gets _searchText, _systemText, _containerName, _containerGroup, _flagDisplay, system_name, location_name
function buildStkEnriched(raw, idToAsset, locSys, stkLocationNamesArg) {
  stkEnrichedAll = [];
  stkTypeFlags = {};
  stkContainerNames = {};
  stkTypeGroups = {};
  for (const a of raw) {
    if (!a || !a.type_id) continue;
    const qty = Number(a.quantity) || 0;
    if (qty <= 0) continue;
    // resolve top-level station/structure → system + location name.
    // A location_id matching an asset item_id is a container/ship (item_ids
    // also exceed 1e12), never a structure — check the map first.
    const topId = (() => {
      let cur = a, hops = 0;
      const seen = new Set();
      const isReal = n => (n >= 30000000 && n < 40000000) || (n >= 1e12) || (n >= 60000000 && n < 61000000);
      while (cur && cur.location_type === 'item' && cur.location_id && hops < 25) {
        const key = String(cur.item_id);
        if (seen.has(key)) break; seen.add(key);
        const lid = cur.location_id;
        const parent = idToAsset.get(String(lid));
        if (parent) { cur = parent; hops++; continue; }
        if (isReal(+lid)) return String(lid);
        break;
      }
      if (cur && cur.location_type !== 'item' && cur.location_id) return String(cur.location_id);
      if (cur && cur.location_id && !idToAsset.has(String(cur.location_id))) {
        const n = +cur.location_id;
        if ((n >= 30000000 && n < 40000000) || (n >= 1e12) || (n >= 60000000 && n < 61000000)) return String(cur.location_id);
      }
      return null;
    })();
    const sysId = (topId != null) ? locSys[topId] : null;
    const systemName = sysId ? stkSysIdName(String(sysId)) : 'Unknown System';
    const locationName = (topId != null) ? (stkLocationNames[topId] || ('ID ' + topId)) : 'Unknown location';
    // container chain: walk all ancestors for full provenance (can in can in ship…)
    let containerName = '', containerGroup = '';
    const chainNames = [];
    {
      let cur = a, hops = 0;
      const seen = new Set();
      while (cur && cur.location_id && hops < 10) {
        const key = String(cur.item_id);
        if (seen.has(key)) break; seen.add(key);
        const parent = idToAsset.get(String(cur.location_id));
        if (!parent || !parent.type_id) break;
        chainNames.push(stkContainerDisplayName(parent.item_id, parent.type_id));
        cur = parent; hops++;
        if (cur && cur.location_type !== 'item') break;
      }
      if (chainNames.length) { containerName = chainNames[0]; containerGroup = chainNames.join(' › '); }
    }
    const flag = a.location_flag || '';
    const flagDisplay = flag.replace('CorpSAG', 'Corp Hangar ').replace('Hangar', 'Hangar');
    const typeName = stkTypeName(a.type_id);
    const entry = {
      ...a,
      _topId: topId,
      system_name: systemName,
      location_name: locationName,
      _containerName: containerName,
      _containerGroup: containerGroup,
      _flagDisplay: flagDisplay,
      _isNested: chainNames.length > 0,
      _searchText: (typeName + ' ' + containerName + ' ' + containerGroup + ' ' + flagDisplay).toLowerCase(),
      _systemText: (systemName + ' ' + locationName).toLowerCase()
    };
    stkEnrichedAll.push(entry);
    // track flags per type for aggregated filter
    if (!stkTypeFlags[a.type_id]) stkTypeFlags[a.type_id] = new Set();
    stkTypeFlags[a.type_id].add(flag || '');
    if (containerName) stkContainerNames[a.type_id] = containerName;
  }
  // default enriched is all; strict system trim applied via stkApplyFlagSystemFilter()
  stkEnriched = stkEnrichedAll.slice();
  // strict system trim if not allSystems and system selected (mirrors assest test main.py:496 strict)
  if (!stkAllSystems() && stkSysId()) {
    const sid = stkSysIdName(stkSysId()).toLowerCase();
    const trimmed = stkEnrichedAll.filter(e => (e.system_name || '').toLowerCase() === sid);
    if (trimmed.length) stkEnriched = trimmed;
  }
}
function stkApplyFlagSystemFilter() {
  // Re-apply system strict + flag filter to stkEnriched (called on flag/system change without refetch)
  let base = stkEnrichedAll.slice();
  if (!stkAllSystems() && stkSysId()) {
    const sid = stkSysIdName(stkSysId()).toLowerCase();
    const trimmed = base.filter(e => (e.system_name || '').toLowerCase() === sid);
    if (trimmed.length) base = trimmed;
  }
  const flag = stkFlag();
  if (flag && flag !== 'All') {
    base = base.filter(e => stkFlagMatchAsset(e, flag));
  }
  stkEnriched = base;
}
function stkDetailFiltered() {
  const q = (($('stkSearch') && $('stkSearch').value) || '').trim().toLowerCase();
  let out = stkEnriched;
  if (q) out = out.filter(e => e._searchText.includes(q) || String(e.type_id).includes(q) || e._systemText.includes(q) || stkTypeName(e.type_id).toLowerCase().includes(q));
  if (stkIndustrialOnly()) out = out.filter(e => isIndustrialItem(e.type_id));
  // JeveAssets advanced filters (And/Or Group) — AND with quick filters
  if (stkFilters && stkFilters.length) out = out.filter(e => stkPassesAdvanced(e));
  return out;
}
function stkFilteredAgg() {
  // JeveAssets-like: aggregated derived from filtered per-stack list so every filter is respected
  if (stkEnrichedAll.length) {
    const filtered = stkDetailFiltered();
    const map = {};
    for (const a of filtered) map[a.type_id] = (map[a.type_id] || 0) + Number(a.quantity || 0);
    let out = Object.entries(map).map(([typeId, qty]) => ({ typeId: +typeId, qty }));
    if (stkSortCol === 'qty') out.sort((a, b) => stkSortRev ? b.qty - a.qty : a.qty - b.qty);
    else if (stkSortCol === 'type') out.sort((a, b) => stkSortRev ? b.typeId - a.typeId : a.typeId - b.typeId);
    else out.sort((a, b) => { const an = stkTypeName(a.typeId), bn = stkTypeName(b.typeId); const c = an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' }); return stkSortRev ? -c : c; });
    return out;
  }
  // fallback when no enriched (page reload with snapshot only) — evaluate at type-level
  const q = (($('stkSearch') && $('stkSearch').value) || '').trim().toLowerCase();
  const flag = stkFlag();
  const srcAgg = stkCurrentAgg();
  let entries = Object.entries(srcAgg).map(([typeId, qty]) => ({ typeId: +typeId, qty }));
  if (stkIndustrialOnly()) entries = entries.filter(e => isIndustrialItem(e.typeId));
  if (flag && flag !== 'All') {
    entries = entries.filter(e => {
      const flags = stkTypeFlags[e.typeId];
      if (!flags) return stkEnrichedAll.length ? false : true;
      for (const f of flags) if (stkFlagMatchAsset({ location_flag: f, _containerName: stkContainerNames[e.typeId] || '' }, flag)) return true;
      return false;
    });
  }
  if (q) entries = entries.filter(e => stkTypeName(e.typeId).toLowerCase().includes(q) || String(e.typeId).includes(q));
  // advanced at type-level (approximate via type row pseudo-asset)
  if (stkFilters && stkFilters.length) {
    entries = entries.filter(e => {
      const pseudo = { type_id: e.type_id, quantity: e.qty, system_name: '', location_name: '', _flagDisplay: '', _containerName: stkContainerNames[e.type_id]||'', _containerGroup: '', location_flag: '' };
      // Add enough fields for column eval
      pseudo._searchText = stkTypeName(e.type_id).toLowerCase();
      return stkPassesAdvanced(pseudo);
    });
  }
  if (stkSortCol === 'qty') entries.sort((a, b) => stkSortRev ? b.qty - a.qty : a.qty - b.qty);
  else if (stkSortCol === 'type') entries.sort((a, b) => stkSortRev ? b.typeId - a.typeId : a.typeId - b.typeId);
  else entries.sort((a, b) => { const an = stkTypeName(a.typeId), bn = stkTypeName(b.typeId); const c = an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' }); return stkSortRev ? -c : c; });
  return entries;
}
function stkSortBy(col) {
  if (stkSortCol === col) stkSortRev = !stkSortRev; else { stkSortCol = col; stkSortRev = (col === 'qty'); }
  stkPage = 1; renderStkRows(); renderStkDetail();
}
function renderStkDetail(){ const w=$('stkDetailWrap'); if(w) w.innerHTML=''; }
// Scan progress bar with ETA. Phases are weighted (fetch 30 / structures 15 /
// residue 20 / names 10 / classify+names 10 / snapshot 5); ETA derives from
// elapsed time vs completed fraction. Button locks during the scan.
let stkProgStart = 0;
// Mirror helper: the scan progress also shows in the Build tab so Update
// inventory displays a loading bar where the user pressed it.
function stkProgressMirror(frac, label, doneMsg, hide) {
  try {
    const wrap = $('progScanWrap'), bar = $('progScanBar'), lab = $('progScanLabel');
    if (!wrap || !bar) return;
    if (hide) { wrap.style.display = 'none'; bar.style.width = '0%'; return; }
    const f = Math.min(0.999, Math.max(0, frac || 0));
    wrap.style.display = 'block';
    bar.style.width = (f * 100).toFixed(1) + '%';
    if (lab) lab.textContent = doneMsg || ((label || 'Scanning…') + ' · ' + Math.round(f * 100) + '%');
  } catch {}
}
function stkProgress(frac, label) {
  try {
    const wrap = $('stkProgWrap'), bar = $('stkBar'), lab = $('stkBarLabel');
    if (!wrap || !bar) return;
    const f = Math.min(0.999, Math.max(0, frac || 0));
    if (!stkProgStart) stkProgStart = Date.now();
    wrap.style.display = 'block';
    bar.style.width = (f * 100).toFixed(1) + '%';
    let eta = '';
    const el = (Date.now() - stkProgStart) / 1000;
    if (f > 0.02 && el > 1) {
      const rem = el / f * (1 - f);
      eta = rem < 1 ? ' · <1s left' : ' · ~' + (rem < 60 ? Math.ceil(rem) + 's' : Math.floor(rem / 60) + 'm ' + Math.ceil(rem % 60) + 's') + ' left';
    }
    if (lab) lab.innerHTML = (label || 'Scanning…') + ' · ' + Math.round(f * 100) + '%' + eta;
    stkProgressMirror(f, label);
  } catch {}
}
function stkProgressDone(msg) {
  try {
    const wrap = $('stkProgWrap'), bar = $('stkBar'), lab = $('stkBarLabel');
    if (bar) bar.style.width = '100%';
    if (lab) lab.textContent = msg || 'Done.';
    setTimeout(() => { try { wrap.style.display = 'none'; if (bar) bar.style.width = '0%'; } catch {} }, 5000);
    stkProgressMirror(1, null, msg || 'Done.');
    setTimeout(() => stkProgressMirror(0, null, null, true), 5000);
  } catch {}
  stkProgStart = 0;
}
function stkProgressHide() {
  try {
    const wrap = $('stkProgWrap'), bar = $('stkBar');
    if (wrap) wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
    stkProgressMirror(0, null, null, true);
  } catch {}
  stkProgStart = 0;
}
function renderStkRows() {
  const box = $('stkList'), totals = $('stkTotals'); if (!box) return;
  // Owned-blueprint list tracks the same scan, so refresh it on every render
  // (before the early return — it must also clear when scope empties out).
  try { renderStkBlueprintList(); } catch {}
  // simple one-box view: Item | Qty | System  — hide detailed per-stack table
  const rows = stkFilteredAgg();
  const srcAgg = stkCurrentAgg();
  const totalTypes = Object.keys(srcAgg).length;
  if (!totalTypes) {
    box.innerHTML = '<p class="hint">No assets loaded. Pick a system and hit <b>Scan system</b>.</p>';
    if (totals) totals.textContent = '';
    return;
  }
  // build system map for simple System column (most common system per type)
  const typeSys = {};
  for (const a of (stkEnriched && stkEnriched.length ? stkEnriched : [])) {
    const tid = a.type_id; const sys = a.system_name || (a._systemText ? a._systemText.split(' ')[0] : '—');
    if (!typeSys[tid]) typeSys[tid] = {};
    typeSys[tid][sys] = (typeSys[tid][sys] || 0) + Number(a.quantity || 0);
  }
  const sysFor = (tid) => {
    const m = typeSys[tid];
    if (!m) return stkCurrentSysName() || '—';
    let best='—', mx=0; for (const [s,q] of Object.entries(m)) if (q>mx) {mx=q; best=s;}
    return best;
  };
  const pages = Math.max(1, Math.ceil(rows.length / stkPageSize));
  if (stkPage > pages) stkPage = pages;
  const start = (stkPage - 1) * stkPageSize;
  const page = rows.slice(start, start + stkPageSize);
  const countLine = '<p class="hint">' + rows.length + ' types' + (stkIndustrialOnly() ? ' · Industrial only' : ' · All') + '</p>';
  const pager = pages > 1
    ? '<div style="display:flex;gap:.5rem;align-items:center;margin:.4rem 0"><button class="mode-btn" data-stkpg="prev"' + (stkPage <= 1 ? ' disabled' : '') + '>‹ Prev</button><span class="hint">Page ' + stkPage + ' of ' + pages + ' — showing ' + (start+1) + '–' + (start+page.length) + ' of ' + rows.length + '</span><button class="mode-btn" data-stkpg="next"' + (stkPage >= pages ? ' disabled' : '') + '>Next ›</button> <select data-stkpgsize style="width:auto;display:inline-block;padding:2px 6px">' + STK_PAGE_OPTIONS.map(n => '<option value="'+n+'"' + (n===stkPageSize?' selected':'') + '>'+n+'</option>').join('') + '</select></div>'
    : (rows.length ? '<p class="hint">Showing ' + rows.length + ' types</p>' : '');
  let h = countLine + pager;
  h += '<div style="overflow-x:auto"><table class="bom"><thead><tr><th>Item</th><th>Qty</th><th>System</th></tr></thead><tbody>';
  if (!page.length) {
    h += '<tr><td colspan="3" style="color:var(--text3)">No matches — clear search.</td></tr>';
  } else {
    for (const r of page) {
      const nm = stkTypeName(r.typeId);
      const sys = sysFor(r.typeId);
      // No icon for blueprints (image server 400s) or unresolved names
      // (image server 404s) — avoids console error spam per row.
      // Item icons removed: the image server 404s on many industry types and
      // spams the console per row. Text-only list.
      const icon = '';
      h += '<tr><td>' + icon + nm + infoButton(r.typeId) + '</td><td>' + fmtN(r.qty) + '</td><td>' + sys + '</td></tr>';
    }
  }
  h += '</tbody></table></div>';
  box.innerHTML = h;
  box.querySelectorAll('[data-stkpg]').forEach(b => b.onclick = () => { stkPage += (b.dataset.stkpg === 'next' ? 1 : -1); renderStkRows(); });
  const sel = box.querySelector('[data-stkpgsize]');
  if (sel) sel.onchange = () => { const n = parseInt(sel.value,10); if (STK_PAGE_OPTIONS.includes(n)) { stkPageSize=n; try{localStorage.setItem('bvStkPageSize', String(n));}catch{} } stkPage=1; renderStkRows(); };
  if (totals) totals.textContent = rows.length + ' types in view';
}
function renderStkDetail(){ const w=$('stkDetailWrap'); if(w) w.innerHTML=''; }
async function loadInventory() {
  const box = $('stkList'), st = $('stkStatus'), totals = $('stkTotals');
  // Guard so the 20-min auto-refresh can never stack on a manual scan.
  if (stkScanBusy) return;
  if (!window.BVAuth || !BVAuth.signedIn()) { if(box) box.innerHTML='<p class="hint">Sign in with SSO first (needs esi-assets.read_assets.v1 / read_corporation_assets.v1). Tokens without the new scope need a re-login.</p>'; return; }
  const allSystems = stkAllSystems();
  if (!stkSysId() && !allSystems) { if (st) st.textContent = 'Pick a build system first, or enable all-systems search.'; if (box) box.innerHTML = '<p class="hint">Type your build system above, pick it from the list, or enable <b>Search all personal systems</b>.</p>'; return; }
  stkScanBusy = true;
  if (box) box.textContent = allSystems ? 'Scanning all personal systems…' : 'Scanning ' + stkSysIdName(stkSysId()) + '…';
  if (st) st.textContent = 'Fetching assets…';
  if (totals) totals.textContent = '';
  try {
    await ensureIceProducts().catch(()=>{});
    const ch = await resolveBvCharacter();
    if (!ch) { if(box) box.innerHTML='<p class="hint">Signed in but no character — Sign out and sign in again.</p>'; return; }
    const cid = ch.id || ch.character_id || ch.CharacterID;
    if (!cid) { if(box) box.innerHTML='<p class="hint">No character ID — re-login.</p>'; return; }
    const src = ($('stkSource') && $('stkSource').value) || 'personal';
    stkRawSource = src;
    // Fresh error budget each scan; 403 denials persist 1h so we never re-flood.
    bvEsiLimited = false;
    // follow the search source in the calculator's Materials-owned selector so a corp search deducts corp
    try { if ($('matSource')) $('matSource').value = src; } catch {}
    savePrefs();
    try { const rb = $('stkRefresh'); if (rb) rb.disabled = true; } catch {}
    stkProgress(0.03, 'Fetching assets…');
    let assets = [];
    let stkCorpWarn = null;
    let corpId = null;
    // character sheet is needed for corp pulls AND for the corp-structures call
    const sheet = await BVAuth.api('/characters/' + cid + '/?datasource=tranquility').catch(() => null);
    if (sheet && sheet.corporation_id) corpId = sheet.corporation_id;
    // who are we scanning as? (helps spot wrong-character/corp for personal structures)
    const scanWho = (ch && (ch.name || ch.character_name)) || ('Character ' + cid);
    let scanCorp = '';
    if (corpId) { try { const co = await fetchJSON(ESI + '/corporations/' + corpId + '/?datasource=tranquility'); if (co && co.name) scanCorp = co.name; } catch {} }
    if (src === 'corp' && !corpId) throw new Error('No corporation found for this character.');
    if (src === 'both' && !corpId) stkCorpWarn = 'No corporation found — corp assets skipped.';
    // The program's way: fetch EVERYTHING first via the X-Pages header, like
    // assest test. A short page no longer ends the fetch — only the header
    // (or an empty/404 page) does. Returns { assets, pages }.
    let stkPagesFatched = 0;
    const fetchAssetPages = async (path, prog) => {
      const all = [];
      let totalPages = null, fetched = 0;
      for (let pg = 1; pg <= 100; pg++) {
        let chunk = null, pages = null;
        try {
          const res = await BVAuth.apiRaw(path + '&page=' + pg);
          chunk = res.data; pages = res.pages;
        } catch (e) {
          // A 404 past the last page still carries the true X-Pages count.
          if (e && e.pages) totalPages = e.pages;
          // ESI can answer 404 for the first page after the last page.
          // That is a normal pagination terminator, not a failed scan.
          if (/\b404\b/.test(String((e && e.message) || ''))) break;
          throw e;
        }
        if (pages) totalPages = pages;
        if (!Array.isArray(chunk) || !chunk.length) break;
        all.push(...chunk);
        fetched++;
        if (prog) prog(pg, all.length, totalPages);
        if (totalPages ? pg >= totalPages : chunk.length < 1000) break;
      }
      stkPagesFatched += fetched;
      return { assets: all, pages: totalPages || fetched };
    };
    if ((src === 'corp' || src === 'both') && corpId) {
      try {
        assets = assets.concat((await fetchAssetPages('/corporations/' + corpId + '/assets/?datasource=tranquility',
          (pg, n, tp) => stkProgress(0.03 + 0.12 * (tp ? pg / tp : Math.min(pg, 10) / 10), 'Fetching corp assets (page ' + pg + (tp ? '/' + tp : '') + ', ' + fmtN(n) + ' stacks)…'))).assets);
      } catch(e) {
        const msg = String((e && e.message) || '');
        if (src === 'corp') throw (/403/.test(msg) ? new Error('Corp assets need Director role + esi-assets.read_corporation_assets.v1. Re-login to grant the new scope.') : e);
        stkCorpWarn = /403/.test(msg) ? 'Corp assets skipped (Director role required).' : ('Corp assets failed: ' + e.message);
      }
    }
    if (src === 'personal' || src === 'both') {
      assets = assets.concat((await fetchAssetPages('/characters/' + cid + '/assets/?datasource=tranquility',
        (pg, n, tp) => stkProgress(0.15 + 0.15 * (tp ? pg / tp : Math.min(pg, 10) / 10), 'Fetching assets (page ' + pg + (tp ? '/' + tp : '') + ', ' + fmtN(n) + ' stacks)…'))).assets);
    }
    stkRaw = assets;
    const selSysNum = parseInt(stkSysId(), 10);
    // aggregate by type_id across all hangars/containers (quantity summed) — global + per-station/citadel
    stkAgg = {}; stkAllAgg = {}; stkAggBySystem = {}; stkAggByStation = {}; stkLocationNames = {};
    // build item_id -> asset map to resolve containers (location_type=item -> walk to station/structure)
    const idToAsset = new Map();
    for (const a of assets) if (a && a.item_id) idToAsset.set(String(a.item_id), a);
    // Shared container-chain walk: a location_id that matches an asset item_id
    // is a container/ship, NEVER a structure — item_ids also exceed 1e12, so the
    // structure heuristic must only apply to non-asset IDs. Unresolvable chains
    // return null (strict mode excludes them) instead of guessing.
    // Memoized per scan: every asset resolves 3× (topLoc + stacks + scope
    // loops), so cache per item_id instead of re-walking up to 25 hops.
    const stationCache = new Map();
    function stationFor(a) {
      const key = a ? String(a.item_id) : '';
      if (stationCache.has(key)) return stationCache.get(key);
      const res = stationForWalk(a);
      stationCache.set(key, res);
      return res;
    }
    function stationForWalk(a) {
      let cur = a, hops = 0;
      const seen = new Set();
      const isRealLoc = n => (n >= 30000000 && n < 40000000) || (n >= 1e12) || (n >= 60000000 && n < 61000000);
      // walk container chain (cans inside cans, ship cargo, corp divisions) until we reach station/structure/system
      while (cur && cur.location_type === 'item' && cur.location_id && hops < 25) {
        const key = String(cur.item_id);
        if (seen.has(key)) break; // cycle guard
        seen.add(key);
        const locId = cur.location_id;
        const parent = idToAsset.get(String(locId));
        if (parent) { cur = parent; hops++; continue; } // container/ship — keep walking
        if (isRealLoc(+locId)) return locId; // top-level station/structure/system
        break; // parent container not in this asset list and not a real location — unresolvable
      }
      // deepest known non-item location is the authoritative station/structure/system
      if (cur && cur.location_type !== 'item' && cur.location_id) return cur.location_id;
      if (cur && cur.location_id && !idToAsset.has(String(cur.location_id))) {
        const n = +cur.location_id;
        if ((n >= 30000000 && n < 40000000) || (n >= 1e12) || (n >= 60000000 && n < 61000000)) return cur.location_id;
      }
      return null;
    }
    // resolve system for every distinct top-level location (station/citadel/system) so we can filter to the build system
    const topLocIds = [...new Set(assets.filter(a=>a && a.item_id).map(a => stationFor(a)).filter(v => v != null).map(v => String(v)))];
    const locSys = {};
    const staSysCache = (() => { try { return JSON.parse(localStorage.getItem('bvStaSys') || '{}'); } catch { return {}; } })();
    let staSysChanged = false;
    const now = Date.now();
    const structCache = bvStructCacheRead();
    for (const id of topLocIds) {
      const num = +id;
      if (num >= 30000000 && num < 40000000 && num < 1e9) { locSys[id] = num; continue; }
      if (num >= 60000000 && num < 61000000) {
        if (staSysCache[id] && now - staSysCache[id].ts < 7*864e5) { locSys[id] = staSysCache[id].sys; continue; }
        try {
          const s = await fetchJSON(ESI + '/universe/stations/' + num + '/?datasource=tranquility');
          if (s && s.system_id) { locSys[id] = s.system_id; staSysCache[id] = { sys: locSys[id], ts: now }; staSysChanged = true; }
        } catch {}
        continue;
      }
    }
    // Citadel/upwell structures (>=1e12): resolve systems + names from ONE paginated
    // call to /corporations/{corp_id}/structures/ (returns every structure the
    // character can access WITH its system_id and name), plus the local cache.
    // We deliberately do NOT call /universe/structures/{id} per structure — a big
    // corp's assets span hundreds of citadels across EVE, and most would 403,
    // flooding ESI and tripping the 420 rate limit.
    let structSys = {};
    let structWarn = null;
    if (corpId) {
      try {
        for (let pg = 1; pg <= 20; pg++) {
          const cs = await BVAuth.api('/corporations/' + corpId + '/structures/?datasource=tranquility&page=' + pg, { headers: { 'X-Compatibility-Date': '2026-08-18' } });
          if (!Array.isArray(cs) || !cs.length) break;
          for (const s of cs) {
            if (!s || !s.structure_id) continue;
            const key = String(s.structure_id);
            if (s.system_id) structSys[key] = s.system_id;
            if (s.name || s.system_id) {
              structCache[key] = { name: s.name || (structCache[key] && structCache[key].name) || ('Structure …' + String(s.structure_id).slice(-4)), system_id: s.system_id || (structCache[key] && structCache[key].system_id), ts: now };
            }
          }
          if (cs.length < 1000) break;
        }
        bvStructCacheWrite(structCache);
        console.log('[BV] corp structures endpoint returned ' + Object.keys(structSys).length + ' structures with system_id');
      } catch (e) {
        const msg = String((e && e.message) || '');
        structWarn = /403/.test(msg) ? 'Structure scope missing — re-login to grant esi-corporations.read_structures.v1 (using cached structures only).' : ('Structures lookup failed: ' + e.message);
      }
    }
    for (const id of topLocIds) {
      const num = +id;
      if (num >= 1e12) {
        locSys[id] = structSys[id] || (structCache[id] && structCache[id].system_id) || undefined;
        continue;
      }
    }
    // ESI-authoritative resolutions collected for the shared backend cache.
    const shareUpload = [];
    for (const [key, sys] of Object.entries(structSys)) {
      if (sys && topLocIds.includes(key)) {
        const nm = structCache[key] && structCache[key].name;
        if (!String(nm || '').startsWith('Structure …')) shareUpload.push({ structure_id: +key, system_id: sys, name: nm || null });
        else shareUpload.push({ structure_id: +key, system_id: sys });
      }
    }
    // Shared crowdsourced cache: other users' ESI resolutions fill gaps before
    // we spend per-structure GETs (and their 403s) on the residue below.
    let sharedHits = 0;
    try {
      const need = topLocIds.filter(id => +id >= 1e12 && !locSys[id]);
      if (need.length) {
        if (st) st.textContent = 'Checking shared structure cache (' + need.length + ' unknown)…';
        const shared = await bvSharedLookup(need);
        for (const [key, v] of Object.entries(shared)) {
          locSys[key] = +v.system_id;
          if (v.name) {
            structCache[key] = structCache[key] || {};
            if (!structCache[key].name || String(structCache[key].name).startsWith('Structure …')) structCache[key].name = v.name;
            structCache[key].system_id = +v.system_id;
            structCache[key].ts = Date.now();
          }
          sharedHits++;
        }
        if (sharedHits) {
          bvStructCacheWrite(structCache);
          console.log('[BV] shared cache resolved ' + sharedHits + '/' + need.length + ' structures');
        }
      }
    } catch (e) { console.warn('[BV] shared cache step failed', e && e.message); }
    // Residue: structures NOT covered by the corp call (e.g. a personal citadel the
    // character docks at but the corp doesn't own) or not yet cached. Strict
    // mode resolves EVERY accessible structure — rank by stack count (main
    // storage first), up to 25/scan, concurrency 2. 403s stamp as 1h denials
    // (excluded); any 420/429 trips the circuit breaker and stops the scan's
    // remaining ESI lookups instead of burning the error budget.
    // NOTE: POST /universe/names can NOT pre-classify these IDs — it 400s on
    // all dynamic IDs (structures AND containers/ships), so per-structure
    // authed GETs are the only resolution path. Anything still unresolved is
    // mappable by hand via the Unresolved panel (structure overrides).
    const stacksPer = {};
    const unresolved = [];
    {
      const seen = new Set();
      for (const a of assets) {
        if (!a || !a.type_id) continue;
        const _top = stationFor(a);
        if (_top == null) continue;
        const id = String(_top);
        const n = +id;
        if (n >= 1e12 && !locSys[id]) {
          stacksPer[id] = (stacksPer[id] || 0) + 1;
          if (!seen.has(id)) { seen.add(id); unresolved.push(id); }
        }
      }
    }
    let unresolvedLeft = unresolved.length;
    if (unresolved.length && !structWarn && !bvEsiLimited) {
      const denied = bvDeniedRead();
      unresolved.sort((a, b) => (stacksPer[b] || 0) - (stacksPer[a] || 0));
      // Resolve all unresolved structures; 403s stamp as denied (excluded).
      const targets = unresolved
        .filter(id => !locSys[id])
        .slice(0, 25)
        .filter(id => !(denied[id] && now - denied[id] < 3600e3));
      let deniedChanged = false, cacheDirty = false, attempts = 0, resolvedNow = 0, rateCut = false;
      const freshResolved = new Set();
      for (let i = 0; i < targets.length; i += 2) {
        stkProgress(0.45 + 0.20 * (i / Math.max(1, targets.length)), 'Resolving structures (' + Math.min(i + 2, targets.length) + '/' + targets.length + ')…');
        await Promise.all(targets.slice(i, i + 2).map(async id => {
          if (bvEsiLimited) return;
          attempts++;
          try {
            const st = await BVAuth.api('/universe/structures/' + id + '/?datasource=tranquility');
            if (st && st.solar_system_id) {
              locSys[id] = st.solar_system_id;
              structCache[id] = { name: st.name || ('Structure …' + String(id).slice(-4)), system_id: locSys[id], ts: now };
              cacheDirty = true;
              unresolvedLeft--;
              resolvedNow++;
              freshResolved.add(String(id));
            }
          } catch (e) {
            const emsg = String((e && e.message) || '');
            if (/403/.test(emsg)) { denied[id] = now; deniedChanged = true; }
            else if (bvHitLimit(e)) { rateCut = true; }
          }
        }));
        if (bvEsiLimited || rateCut) break;
        if (i + 2 < targets.length) await new Promise(r => setTimeout(r, 80));
      }
      if (cacheDirty) bvStructCacheWrite(structCache);
      if (deniedChanged) bvDeniedWrite(denied);
      console.log('[BV] residue attempted=' + attempts + ' resolvedNow=' + resolvedNow + ' unresolvedLeft=' + unresolvedLeft + ' unresolvedStructs=' + unresolved.length + (rateCut ? ' RATE-CUT' : ''));
      // Contribute ONLY this scan's fresh ESI GET resolutions to the shared
      // cache (never cached replays, never manual user mappings).
      try {
        for (const id of freshResolved) {
          const e = structCache[id];
          if (e && e.system_id) {
            const nm = String(e.name || '');
            shareUpload.push({ structure_id: +id, system_id: e.system_id, name: (!nm.startsWith('Structure …') && nm) || null });
          }
        }
        const uploaded = await bvSharedUpload(shareUpload);
        if (uploaded) console.log('[BV] shared cache uploaded ' + uploaded + ' resolutions');
      } catch (e) { console.warn('[BV] shared upload step failed', e && e.message); }
    }
    // Strict scope: unresolved / no-access locations are excluded, never
    // trusted as the selected system. Dead structures and locations without
    // ESI docking access leave no trace in the UI — not rows, not counts.
    if (staSysChanged) { try { localStorage.setItem('bvStaSys', JSON.stringify(staSysCache)); } catch {} }
    // diagnostic: report how the scan's locations resolved (helps debug personal/corp)
    try {
      const locTypes = { solar: 0, station: 0, struct: 0, other: 0 };
      for (const id of topLocIds) {
        const n = +id;
        if (n >= 30000000 && n < 40000000) locTypes.solar++;
        else if (n >= 1e12) locTypes.struct++;
        else if (n >= 60000000 && n < 61000000) locTypes.station++;
        else locTypes.other++;
      }
      const res = topLocIds.filter(id => +id >= 1e12 && locSys[id]).length;
      const unres = topLocIds.filter(id => +id >= 1e12 && !locSys[id]).length;
      let scopes = '';
      try { scopes = (bvTokenScopes() || []).join(',') || 'none'; } catch { scopes = 'none'; }
      console.log('[BV] scan src=' + src + ' assets=' + assets.length + ' locs=' + topLocIds.length + ' ' + JSON.stringify(locTypes) + ' structsResolved=' + res + ' structsUnresolved=' + unres + ' structWarn=' + (structWarn || 'none') + ' scopes=' + scopes);
    } catch {}
    // STRICT SCOPE: only keep assets whose location resolves to the selected build system
    stkAgg = {}; stkAllAgg = {}; stkAggBySystem = {}; stkAggByStation = {}; stkLocationNames = {}; stkLocSystem = {}; stkSystems = {}; stkTypeLocs = {};
    let keptCount = 0, skippedInaccessible = 0, skippedWrongSystem = 0;
    const systemBreakdown = {}; // system_id -> stack count
    for (const a of assets) {
      if (!a || !a.type_id) continue;
      const qty = Number(a.quantity) || 0;
      if (qty <= 0) continue;
      const _top = stationFor(a);
      if (_top == null) { skippedInaccessible++; continue; } // strict: unresolvable container chains are excluded
      const stnId = String(_top);
      const stnSys = locSys[stnId] != null ? locSys[stnId] : null;
      if (stnSys == null) { skippedInaccessible++; continue; } // strict: unresolved / no-access locations are excluded in every mode
      const scopeKey = String(stnSys);
      // Track all systems for diagnostics
      systemBreakdown[scopeKey] = (systemBreakdown[scopeKey] || 0) + 1;
      const inSelectedSystem = allSystems || stnSys === selSysNum;
      if (!allSystems && !inSelectedSystem) skippedWrongSystem++;
      if (!stkAggBySystem[scopeKey]) stkAggBySystem[scopeKey] = {};
      stkAggBySystem[scopeKey][a.type_id] = (stkAggBySystem[scopeKey][a.type_id] || 0) + qty;
      stkAllAgg[a.type_id] = (stkAllAgg[a.type_id] || 0) + qty;
      if (!inSelectedSystem) continue;
      keptCount++;
      stkAgg[a.type_id] = (stkAgg[a.type_id] || 0) + qty;
      if (stnId) {
        if (!stkAggByStation[stnId]) stkAggByStation[stnId] = {};
        stkAggByStation[stnId][a.type_id] = (stkAggByStation[stnId][a.type_id] || 0) + qty;
        (stkTypeLocs[a.type_id] = stkTypeLocs[a.type_id] || new Set()).add(stnId);
      }
    }
    // Log system breakdown for diagnostics
    console.log('[BV] system breakdown:', Object.entries(systemBreakdown).map(([sys, count]) => stkSysIdName(sys) + ':' + count).join(', '));
    console.log('[BV] filter results: kept=' + keptCount + ' skippedInaccessible=' + skippedInaccessible + ' skippedWrongSystem=' + skippedWrongSystem);
    // resolve names for this system's locations (local systems + station names + authed citadels), then dropdown + snapshot
    try {
      const locIds = Object.keys(stkAggByStation);
      const selSys = stkSysId();
      const selName = allSystems ? 'All personal systems' : stkSysIdName(selSys);
      // system-location ids -> local Systems names
      for (const id of locIds) { const num = +id; if (num >= 30000000 && num < 40000000) { stkLocationNames[id] = stkSysIdName(String(num)); } }
      // NPC stations (<1e12, not system ids) -> universe/names
      const stationIds = locIds.filter(id => { const n = +id; return n >= 60000000 && n < 61000000; });
      for (let i=0;i<stationIds.length;i+=200) {
        const chunk = stationIds.slice(i,i+200).map(n=>+n).filter(n=>Number.isFinite(n));
        if (!chunk.length) continue;
        let tries=0; while(tries<2){
          try {
            const nm = await fetchJSON(ESI + '/universe/names/?datasource=tranquility', { method:'POST', headers:{'Content-Type':'application/json','X-Compatibility-Date':'2026-08-18'}, body: JSON.stringify(chunk) });
            (Array.isArray(nm)?nm:[]).forEach(n=>{ if(n&&n.id&&n.name) stkLocationNames[n.id]=n.name; });
            break;
          } catch(e){ const msg=String(e&&e.message||''); if (/420|429|400|404/.test(msg) && tries===0){ await new Promise(r=>setTimeout(r,1200)); tries++; continue; } break; }
        }
        if (i+200 < stationIds.length) await new Promise(r=>setTimeout(r,250));
      }
// citadels (>=1e12) -> cache or placeholder only (no POST: ESI /universe/names
      // rejects structure IDs with 400, and authed GET 403s without ACL — the
      // system attribution already happened via locSys above (strict: unresolved
      // locations are excluded), so names here are display-only.
      const structIds = locIds.filter(id => String(id).length >= 12);
      if (structIds.length) {
        const denied = bvDeniedRead(), now = Date.now();
        for (const sid of structIds) {
          try { const sc=bvStructCacheRead(); if(sc[sid] && sc[sid].name) { stkLocationNames[sid]=sc[sid].name; continue; } } catch {}
          if (stkLocationNames[sid]) continue;
          if (denied[sid] && now - denied[sid] < 3600e3) { stkLocationNames[sid]='Structure …' + String(sid).slice(-4); continue; }
          stkLocationNames[sid]='Structure …' + String(sid).slice(-4);
        }
        try{ bvDeniedWrite(denied); }catch{}
      }
// stkSystems keyed by systemId + per-location system name
      stkSystems[selSys || 'all'] = locIds;
      stkSysNames[selSys || 'all'] = selName;
      for (const id of locIds) {
        let sId = locSys[id];
        if (!sId) { try { const sc=bvStructCacheRead(); if (sc[id] && sc[id].system_id) sId = sc[id].system_id; } catch {} }
        stkLocSystem[id] = sId ? stkSysIdName(String(sId)) : 'Unknown';
        if (!stkLocationNames[id]) stkLocationNames[id] = 'Structure …' + String(id).slice(-4);
      }
} catch {}
    // ---- resolve type names FIRST so the ore snapshot stores real ore names ----
    stkNames = {}; stkPage = 1;
    if (st) st.textContent = 'Resolving ' + Object.keys(stkAgg).length + ' types across ' + Object.keys(stkAggByStation).length + ' location(s)…';
    const ids = Object.keys(stkAgg).map(n=>+n).filter(n=>Number.isFinite(n) && n>0);
    if (ids.length) {
      stkProgress(0.65, 'Resolving ' + ids.length + ' type names…');
      for (let i=0;i<ids.length;i+=200) {
        stkProgress(0.65 + 0.10 * (i / ids.length), 'Resolving type names (' + Math.min(i + 200, ids.length) + '/' + ids.length + ')…');
        const chunk = ids.slice(i,i+200);
        let tries=0; while(tries<2){
          try {
            const nm = await fetchJSON(ESI + '/universe/names/?datasource=tranquility', { method:'POST', headers:{'Content-Type':'application/json','X-Compatibility-Date':'2026-08-18'}, body: JSON.stringify(chunk) });
            (Array.isArray(nm)?nm:[]).forEach(n=>{ if(n&&n.id&&n.name&&n.category==='inventory_type') stkNames[n.id]=n.name; });
            break;
          } catch(e){
            // Never retry a 420/429 — the error budget is gone; flag it and move on.
            if (bvHitLimit(e)) { console.warn('[BV] inventory names batch rate-limited, using cached names', e&&e.message); break; }
            console.warn('[BV] inventory names batch failed', e&&e.message); break;
          }
        }
        if (i+200 < ids.length) await new Promise(r=>setTimeout(r,300));
      }
      const missing = ids.filter(id=>!stkNames[id]);
      // Per-type fallback storms a rate-limited ESI — skip entirely when cut off.
      if (missing.length && !bvEsiLimited) {
        for (let i=0;i<missing.length;i+=5) {
          if (bvEsiLimited) break;
          stkProgress(0.75 + 0.05 * (i / missing.length), 'Filling ' + missing.length + ' missing names…');
          const batch = missing.slice(i,i+5);
          await Promise.all(batch.map(async id=>{ try{ stkNames[id]=await typeName(id);}catch(e){ bvHitLimit(e); } }));
          if (i+5 < missing.length) await new Promise(r=>setTimeout(r,250));
        }
      }
    }
    // ---- probe unknown types via live SDE so new compressed/moon/gas grades
    // count as industrial even though no hardcoded list has them ----
    try { if (st) st.textContent = 'Classifying ' + ids.length + ' types (industrial check)…'; stkProgress(0.82, 'Classifying industrial types…'); await stkProbeIndustrial(ids); stkProgress(0.88, 'Industrial check done.'); } catch(e) { console.warn('[BV] stkProbeIndustrial failed', e); }
    // ---- custom container/ship names (ESI assets/names) so cans show your
    // names instead of "Type NNN". Batch ONLY item_ids present in the current
    // asset manifest: assets/names 404s the whole request when fed station,
    // system or structure IDs (it resolves items only), so unresolved
    // top-level IDs stay out. Failures fall back to type names gracefully.
    try {
      if (st) st.textContent = 'Resolving container names…';
      stkProgress(0.90, 'Resolving container names…');
      const parentIds = [];
      for (const a of assets) {
        if (a && a.location_id && idToAsset.has(String(a.location_id))) parentIds.push(+a.location_id);
      }
      // 30s guard: BVAuth has no request timeout, so a hung ESI connection
      // must never stall the scan — fall back to type names on timeout.
      const namesTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('names timeout')), 30000));
      stkCustomNames = await Promise.race([stkFetchCustomNames(parentIds, src, cid, corpId), namesTimeout]);
      stkProgress(0.94, 'Container names done.');
    } catch(e) { console.warn('[BV] custom names failed', e); stkCustomNames = {}; }
    // ---- build per-stack enriched (assest test pattern) for flag/item search & detail table ----
    try { buildStkEnriched(assets, idToAsset, locSys, stkLocationNames); stkDetailPage = 1; } catch(e) { console.warn('[BV] buildStkEnriched failed', e); }
    // ---- ore/compressed-ore/ice/moon/gas -> refined minerals at Refining yield % + keep snapshot in memory ----
    stkProgress(0.96, 'Building snapshot…');
    await buildInventorySnapshot(stkSnapshotAggForSource());
    const wrongSysMsg = skippedWrongSystem ? ' · ' + skippedWrongSystem + ' stacks in other systems' : '';
    const scanScope = allSystems ? 'all personal systems' : stkSysIdName(stkSysId());
    const ownedBp = stkOwnedBlueprints().length;
    if (st) st.textContent = (stkCorpWarn ? stkCorpWarn + ' · ' : '') + (structWarn ? structWarn + ' · ' : '') + 'as ' + scanWho + (scanCorp ? ' (' + scanCorp + ')' : '') + ' · ' + scanScope + ': ' + assets.length + ' stacks (' + stkPagesFatched + ' page' + (stkPagesFatched===1?'':'s') + ') → ' + Object.keys(stkAggByStation).length + ' locations · ' + Object.keys(stkAgg).length + ' types · ' + Object.keys(stkAgg).filter(id => isIndustrialItem(+id)).length + ' industrial' + (ownedBp ? ' · ' + ownedBp + ' blueprint' + (ownedBp === 1 ? '' : 's') + ' owned' : '') + (allSystems ? '' : wrongSysMsg) + (sharedHits ? ' · ' + sharedHits + ' via shared cache' : '') + (stkOreDetail.length ? ' · ' + stkOreDetail.length + ' ore refined @ ' + Math.round(stkRefineEff*100) + '%' : '') + (bvEsiLimited ? ' · ESI rate-limited — some names show as Type IDs, rescan in a minute' : '') + ' — snapshot kept, deducting from Shopping/Build/Mining.';
    renderStkRows();
    await renderRefinery();
    // auto-apply to shopping list if checkbox was already checked and a calc exists
    if ($('stkDeduct') && $('stkDeduct').checked && S.root) { await renderShoppingList(S.runs||1); }
    stkProgressDone('Scan complete — ' + Object.keys(stkAgg).length + ' types in scope.');
    _stkLastScanAt = Date.now();
  } catch(e) {
    if (box) box.textContent = 'Failed: ' + e.message;
    if (st) st.textContent = e.message;
    stkProgressHide();
    try { renderStkBlueprintList(); } catch {}
  } finally {
    stkScanBusy = false;
    try { const rb = $('stkRefresh'); if (rb) rb.disabled = !stkSysId() && !stkAllSystems(); } catch {}
  }
}
async function applyInventoryToShopping() {
  if (!S.root) { status('Run a calculation first, then apply inventory.'); return; }
  if (!Object.keys(stkAgg).length) { status('Load inventory first (Refresh).'); return; }
  await renderShoppingList(S.runs||1);
  status('Inventory applied to shopping list — deducted owned qty.');
}
async function applyInventoryScope() {
  const next = stkAllSystems() ? stkAllAgg : (stkAggBySystem[stkSysId()] || {});
  if (!Object.keys(next).length) { stkPage = 1; stkDetailPage = 1; stkApplyFlagSystemFilter(); renderStkRows(); return; }
  stkAgg = next;
  stkPage = 1; stkDetailPage = 1;
  stkApplyFlagSystemFilter();
  const previous = stkSnapshotRead(matSource());
  await buildInventorySnapshot(stkSnapshotAggForSource() || next, previous && previous.oreDetail, matSource(), stkAllSystems() ? '' : stkSysId(), stkAllSystems() ? 'All personal systems' : stkSysIdName(stkSysId()));
  renderStkRows();
  await renderRefinery();
  if (!stkAllSystems() && $('stkDeduct') && $('stkDeduct').checked && S.root) await renderShoppingList(S.runs || 1);
}
// System autocomplete for the Inventory tab — search ALL systems (build system picked first).
function stkRescopeSystem() {
  const sysId = stkSysId();
  // enable Scan button once a system is picked
  try { const b = $('stkRefresh'); if (b) b.disabled = !sysId && !stkAllSystems(); } catch {}
  try { renderStkSavedSystems(); } catch {}
  stkPage = 1;
  applyInventoryScope().catch(() => { renderStkRows(); });
}

// ---- auto-refresh ----
// Re-runs the scan for the active system every 20 minutes so the material
// list, the owned-blueprint list and the deduct snapshot stay current without
// the user re-scanning by hand. Opt-out via the checkbox, and it no-ops when
// signed out, no system chosen, or a scan is already running.
const STK_AUTO_MS = 20 * 60 * 1000;
let _stkAutoTimer = null;
let _stkLastScanAt = 0;
function stkAutoRefreshOn() { try { return !($('stkAutoRefresh') && $('stkAutoRefresh').checked === false); } catch { return false; } }
function stkAutoRefreshReady() {
  return stkAutoRefreshOn()
    && !stkScanBusy
    && window.BVAuth && BVAuth.signedIn()
    && (stkSysId() || stkAllSystems());
}
async function stkAutoRefreshRun(reason) {
  try {
    if (!stkAutoRefreshReady() || document.hidden) return;
    const who = stkSysIdName(stkSysId()) || 'all systems';
    try { const st = $('stkStatus'); if (st) st.textContent = 'Auto-refreshing ' + who + (reason ? ' (' + reason + ')' : '') + '…'; } catch {}
    await loadInventory();
  } catch {}
}
function stkScheduleAutoRefresh() {
  if (_stkAutoTimer) { clearTimeout(_stkAutoTimer); _stkAutoTimer = null; }
  if (!stkAutoRefreshOn()) return;
  _stkAutoTimer = setTimeout(async () => {
    _stkAutoTimer = null;
    await stkAutoRefreshRun('20 min');
    // reschedule regardless of whether this tick actually scanned
    stkScheduleAutoRefresh();
  }, STK_AUTO_MS);
}
// A hidden tab is never scanned (saves ESI traffic), so catch up on the way
// back if the data has gone stale rather than showing an old snapshot.
function stkBindAutoRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    try { stkScheduleAutoRefresh(); } catch {}
    if (!stkAutoRefreshOn()) return;
    if (!_stkLastScanAt) return;
    if (Date.now() - _stkLastScanAt < STK_AUTO_MS) return;
    stkAutoRefreshRun('returned to tab');
  });
}
function attachStkSystemAutocomplete() {
  const input = $('stkSystemInput'), box = $('stkSysSuggest');
  if (!input || !box) return;
  let active = -1, current = [];
  function close() { box.classList.add('hidden'); box.innerHTML = ''; active = -1; current = []; }
  function render(q) {
    if (q.length < 2) { close(); return; }
    // pool = ALL systems (build system is chosen first, even if you own nothing there)
    const sysList = ((typeof Systems !== 'undefined' ? Systems : []) || []).slice();
    current = sysList
      .map(s => ({ id: s.id, name: s.name, sc: bvScore(s.name, q) }))
      .filter(c => c.sc > 0)
      .sort((a, b) => b.sc - a.sc || a.name.localeCompare(b.name))
      .slice(0, 8);
    if (!current.length) { close(); return; }
    active = -1;
    box.innerHTML = current.map((c, i) =>
      '<div class="suggest-item" data-i="' + i + '"><span class="t">' + highlight(c.name, q) + '</span><span class="s">' + (c.id) + '</span></div>'
    ).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.suggest-item').forEach(el => el.onmousedown = e => { e.preventDefault(); pick(+el.dataset.i); });
  }
  function pick(i) {
    const c = current[i]; if (!c) return;
    stkSysNames[String(c.id)] = c.name;
    $('stkSystem').value = String(c.id);
    input.value = c.name;
    input.dataset.pickedId = String(c.id);
    close();
    try{ const cb=$('stkAllSystems'); if(cb && cb.checked){ cb.checked=false; try{ localStorage.setItem('bvStkAllSystems','0'); }catch{} } }catch{}
    stkSavedSystemAdd(c.id, c.name);
    stkRescopeSystem();
  }
  let deb = null;
  input.addEventListener('input', () => { delete input.dataset.pickedId; clearTimeout(deb); deb = setTimeout(() => render(input.value.trim().toLowerCase()), 120); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) render(input.value.trim().toLowerCase()); });
  input.addEventListener('keydown', e => {
    const items = box.querySelectorAll('.suggest-item');
    if (box.classList.contains('hidden') || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); return; }
    else if (e.key === 'Escape') { close(); return; }
    else return;
    items.forEach((el, i) => el.classList.toggle('active', i === active));
    items[active].scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('click', e => { if (!box.classList.contains('hidden') && !box.contains(e.target) && e.target !== input) close(); });
}
function highlight(name, q) {
  const i = name.toLowerCase().indexOf(q);
  if (i < 0) return name;
  return name.slice(0, i) + '<span class="hl">' + name.slice(i, i + q.length) + '</span>' + name.slice(i + q.length);
}

// ===================== Fit Builder =====================
// Paste an EFT / EVE "Copy to Clipboard" fit -> resolve every item -> run the
// whole fit through the existing calculation pipeline as a synthetic
// multi-child root. Each row has an Include checkbox (part of the fit?) plus
// the usual Buy/Build/Mine toggle (how to source it).
const FIT_SAMPLE = [
  '[Stormbringer, Crossed Beams]',
  'Vorton Tuning System II',
  'Vorton Tuning System II',
  'Vorton Tuning System II',
  '',
  'Explosive Shield Hardener II',
  'Multispectrum Shield Hardener II',
  '10MN Afterburner II',
  'Pithum C-Type Medium Shield Booster',
  'Sensor Booster II',
  'Republic Fleet Large Cap Battery',
  '',
  'Medium Vorton Projector II',
  '',
  'Medium Ancillary Current Router II',
  'Medium Thermal Shield Reinforcer II',
  'Medium Thermal Shield Reinforcer II',
  '',
  'Sanshas Standard M x1',
  'StrikeSnipe Ultra M x3695',
  'ElectroPunch Ultra M x859',
  'Scan Resolution Script x1',
  'Sanshas Microwave M x2',
  'True Sansha Warp Disruptor x1',
  'Fleeting Compact Stasis Webifier x1'
].join('\n');

function fitStatus(m) { const el = $('fitStatus'); if (el) el.textContent = m || ''; console.log('[BV-fit]', m); }
function fitVisible() { try { return $('mainFit') && $('mainFit').style.display !== 'none'; } catch { return false; } }
// Progress bar across the two blocking phases of an analysis — name
// resolution and market pricing. Mirrors stkProgress's ETA maths, scoped here.
let _fitProgStart = 0, _fitProgTimer = null;
function fitProgress(frac, label) {
  try {
    if (_fitProgTimer) { clearTimeout(_fitProgTimer); _fitProgTimer = null; }
    const wrap = $('fitProgWrap'), bar = $('fitProgBar'), lab = $('fitProgLabel');
    if (!wrap || !bar) return;
    const f = Math.min(1, Math.max(0, frac || 0));
    if (!_fitProgStart) _fitProgStart = Date.now();
    wrap.style.display = 'block';
    bar.style.width = (f * 100).toFixed(1) + '%';
    let eta = '';
    const el = (Date.now() - _fitProgStart) / 1000;
    if (f > 0.02 && f < 0.999 && el > 0.8) {
      const rem = el / f * (1 - f);
      eta = rem < 1 ? ' · <1s left' : ' · ~' + (rem < 60 ? Math.ceil(rem) + 's' : Math.floor(rem / 60) + 'm ' + Math.ceil(rem % 60) + 's') + ' left';
    }
    if (lab) lab.textContent = (label || 'Working…') + ' · ' + Math.round(f * 100) + '%' + eta;
  } catch {}
}
function fitProgressDone(msg) {
  try {
    const wrap = $('fitProgWrap'), bar = $('fitProgBar'), lab = $('fitProgLabel');
    if (bar) bar.style.width = '100%';
    if (lab) lab.textContent = msg || 'Done.';
    if (_fitProgTimer) clearTimeout(_fitProgTimer);
    _fitProgTimer = setTimeout(() => {
      _fitProgTimer = null;
      try { if (wrap) wrap.style.display = 'none'; if (bar) bar.style.width = '0%'; } catch {}
    }, 2500);
  } catch {}
  _fitProgStart = 0;
}
function fitProgressHide() {
  if (_fitProgTimer) { clearTimeout(_fitProgTimer); _fitProgTimer = null; }
  try {
    const wrap = $('fitProgWrap'), bar = $('fitProgBar');
    if (wrap) wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
  } catch {}
  _fitProgStart = 0;
}
// True once the user has sent the fit to the Calculator (so background
// refreshes know whether to keep the Calculator's copy in sync).
let fitInCalculator = false;
// Reminder that a loaded fit was also pushed to Build Progress. Only shown
// while a fit is the live calculation in the Calculator.
function fitCalcNoteRender() {
  const el = $('fitCalcNote');
  if (!el) return;
  el.classList.toggle('hidden', !(fitInCalculator && S.lastCalc && S.lastCalc.fit));
}
// Load the current fit into the Calculator (tree / BOM / Build / Shopping).
function fitLoadToCalculator() {
  if (!(S.root && S.lastCalc && S.lastCalc.fit)) return false;
  fitInCalculator = true;
  // A fit is a brand-new build root, not a drill-down from whatever blueprint
  // was on screen, so drop the old trail — otherwise the breadcrumb keeps
  // showing the previously searched blueprint above the fit.
  try { navStack.length = 0; } catch {}
  try {
    renderCrumbs(S.root.bpName);
    renderTree(1);
    renderBom(1);
    renderSummary(S.lastCalc);
    fitCalcNoteRender();
  } catch {}
  return true;
}
// Debounced re-render. Background deep enrichment keeps adding recipes, which
// grows the "Blueprints needed" list, so refresh the Fit view as data lands.
let _fitT = null;
function fitSchedule() {
  if (_fitT) return;
  _fitT = setTimeout(() => { _fitT = null; try { if (fitVisible()) fitRenderAll(); } catch {} }, 400);
}
function fitIgnKey(bpId) { return 'bvFitIgnored_' + bpId; }
function fitIgnRead(bpId) { try { return JSON.parse(localStorage.getItem(fitIgnKey(bpId)) || '{}') || {}; } catch { return {}; } }
function fitIgnWrite(bpId, m) { try { localStorage.setItem(fitIgnKey(bpId), JSON.stringify(m || {})); } catch {} }
// Fit sourcing modes are stored explicitly (including 'buy') because a fit's
// default is Build — the shared bvModes store treats 'buy' as the implicit
// default, so it can't represent a fit item the user switched to Buy.
function fitModesKey(bpId) { return 'bvFitModes_' + bpId; }
function fitModesRead(bpId) { try { return JSON.parse(localStorage.getItem(fitModesKey(bpId)) || '{}') || {}; } catch { return {}; } }
function fitModesWrite(bpId, m) { try { localStorage.setItem(fitModesKey(bpId), JSON.stringify(m || {})); } catch {} }
function fitPersistModes() {
  try {
    if (!S.root || !S.root.bpId || !S.root.children) return;
    const m = {};
    for (const c of S.root.children) { if (c && Number.isFinite(+c.type_id) && c.mode) m[c.type_id] = c.mode; }
    fitModesWrite(S.root.bpId, m);
  } catch {}
}

// Real SDE category wins (6 Ship, 8 Charge, 18 Drone); name heuristic otherwise.
function fitSection(typeId, name) {
  try {
    const info = bvTypeInfoLocal(typeId);
    if (info) {
      if (info.c === 6) return 'hull';
      if (info.c === 8) return 'charge';
      if (info.c === 18) return 'drone';
      return 'module';
    }
  } catch {}
  return (window.BVFits && BVFits.classifyName) ? BVFits.classifyName(name) : 'module';
}

// Resolve a want-list of { name, qty } to type IDs: local index first, ESI
// /universe/ids/ for the rest. Never guesses — unresolved names are reported.
async function fitResolveNames(list, onProgress) {
  const idx = (window.BVFits && BVFits.localIndex) ? BVFits.localIndex() : new Map();
  const resolved = new Map();
  const pending = [];
  for (const n of list) {
    const hit = idx.get(String(n.name).toLowerCase());
    if (hit && hit.id) resolved.set(String(n.name).toLowerCase(), { id: hit.id, name: n.name });
    else pending.push(n);
  }
  const total = Math.ceil(pending.length / 300);
  let done = 0;
  for (let i = 0; i < pending.length; i += 300) {
    const chunk = pending.slice(i, i + 300);
    try {
      const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Compatibility-Date': '2026-08-18' }, body: JSON.stringify(chunk.map(x => x.name)) });
      const inv = Array.isArray(r) ? r : (r.inventory_types || []);
      for (const e of inv) resolved.set(String(e.name).toLowerCase(), { id: e.id, name: e.name });
    } catch {}
    done++;
    if (onProgress) { try { onProgress(done, total); } catch {} }
  }
  if (onProgress && !total) { try { onProgress(1, 1); } catch {} }
  const missing = [];
  for (const n of list) if (!resolved.has(String(n.name).toLowerCase())) missing.push(n.name);
  return { resolved, missing };
}

async function calculateFit() {
  calcRemovedReset();
  const text = ($('fitPaste') && $('fitPaste').value) || '';
  const fits = (window.BVFits && BVFits.parseEftFits) ? BVFits.parseEftFits(text) : [];
  if (!fits.length) { fitProgressHide(); fitStatus('Nothing parsed — paste a fit whose first line is [Ship, Fit Name].'); return; }
  const fit = fits[0];
  if (fits.length > 1) fitStatus('Multiple fits found — analysing "' + fit.ship + '" only.');
  const incHull = !$('fitIncHull') || $('fitIncHull').checked;
  const incDrones = !$('fitIncDrones') || $('fitIncDrones').checked;
  const incCharges = !$('fitIncCharges') || $('fitIncCharges').checked;
  const defQty = Math.max(1, parseInt(($('fitChargeQty') && $('fitChargeQty').value) || 1, 10) || 1);

  // Flatten -> aggregated want list (uses bv-fits flattenFit for consistency).
  const list = (window.BVFits && BVFits.flattenFit) ? BVFits.flattenFit(fit, { hull: incHull, chargeQty: defQty }) : [];
  if (!list.length) { fitProgressHide(); fitStatus('Fit has no items.'); return; }
  fitProgress(0.04, 'Resolving ' + list.length + ' item' + (list.length === 1 ? '' : 's'));
  const { resolved, missing } = await fitResolveNames(list, (done, total) => {
    fitProgress(0.04 + 0.26 * (total ? done / total : 1), 'Resolving item names');
  });

  // Build the synthetic root, honouring the hull/drone/charge include options.
  const kept = [], skipped = [];
  for (const w of list) {
    const r = resolved.get(String(w.name).toLowerCase());
    if (!r) { skipped.push({ name: w.name, reason: 'not found' }); continue; }
    const sec = fitSection(r.id, w.name);
    if (sec === 'drone' && !incDrones) { skipped.push({ name: w.name, reason: 'drones off' }); continue; }
    if (sec === 'charge' && !incCharges) { skipped.push({ name: w.name, reason: 'charges off' }); continue; }
    kept.push({ type_id: r.id, name: r.name, qty: w.qty, section: sec });
  }
  if (!kept.length) { fitProgressHide(); fitStatus('No items resolved — check the paste.'); return; }

  const shipWant = String(fit.ship || '').toLowerCase();
  const ship = kept.find(c => c.section === 'hull' && c.name.toLowerCase() === shipWant) || kept.find(c => c.section === 'hull') || null;
  const region = hub(), basis = $('basis').value;
  S.reactionsOn = ($('reactions').value === 'on');
  S.root = { bpId: 'fit-' + (ship ? ship.type_id : 'custom'), bpName: (fit.ship || 'Fit') + (fit.fitName ? ' — ' + fit.fitName : ''), mode: 'build', children: [] };
  S.product = ship ? { type_id: ship.type_id, qty: 1, name: ship.name } : null;

  const ign = fitIgnRead(S.root.bpId);
  for (const c of kept) {
    // Default every item to Build — the point of the Fit Builder is the build
    // tree. Raw mineables / PI resolve to Mine / Extract; saved toggles override.
    let mode = 'build';
    try { if (isMineable(c.type_id)) mode = 'mine'; else if (isPI(c.type_id)) mode = 'extract'; } catch {}
    S.root.children.push({
      type_id: c.type_id, name: c.name, baseQty: c.qty, perRun: c.qty,
      mode, child: null, reaction: null,
      unitSell: null, unitBuy: null, childCost: null, section: c.section,
      include: ign[c.type_id] !== false
    });
  }
  // Restore saved Build/Buy/Mine toggles for this fit (children now exist).
  let modesRestored = 0;
  try {
    const savedModes = fitModesRead(S.root.bpId);
    for (const c of S.root.children) {
      const m = savedModes[c.type_id];
      if (m === 'buy' || m === 'build' || m === 'mine' || m === 'react' || m === 'extract') {
        if (m === 'react' && !S.reactionsOn) continue;
        if (m === 'mine') { try { if (!isMineable(c.type_id)) continue; } catch {} }
        if (m === 'extract') { try { if (!isPI(c.type_id)) continue; } catch {} }
        if (c.mode !== m) { c.mode = m; modesRestored++; }
      }
    }
  } catch {}
  fitProgress(0.32, 'Pricing ' + S.root.children.length + ' items (' + region + ')');
  let buyAllSell = 0, buyAllBuy = 0, priced = 0;
  for (const c of S.root.children) {
    try { c.unitSell = await marketPrice(c.type_id, region, 'sell'); } catch {}
    try { c.unitBuy = await marketPrice(c.type_id, region, 'buy'); } catch {}
    if (c.unitSell == null) c.unitSell = c.unitBuy; if (c.unitBuy == null) c.unitBuy = c.unitSell;
    const u = (basis === 'buy' ? c.unitBuy : c.unitSell) || 0;
    buyAllSell += (c.unitSell || 0) * c.perRun;
    buyAllBuy += (c.unitBuy || 0) * c.perRun;
    priced++;
    fitProgress(0.32 + 0.66 * (priced / Math.max(1, S.root.children.length)), 'Pricing ' + (c.name || ('Type ' + c.type_id)));
  }
  S.bom = effLeafCost(1);
  const split = bomCashSplit();
  let unitOut = null;
  if (ship) { try { unitOut = await marketPrice(ship.type_id, region, 'sell'); } catch {} }
  S.lastCalc = {
    fit: true, bpName: S.root.bpName, bpId: S.root.bpId, runs: 1,
    matCostSell: buyAllSell, matCostBuy: buyAllBuy, feePerRun: 0,
    totalCost: split.cash, revenue: unitOut || 0, sellFees: 0, profit: 0, roi: 0,
    unitOut, outQty: ship ? 1 : 0, teBonus: 0, imp: D.implants[0], ind: 0, adv: 0,
    totalCash: split.cash, profitCash: 0, minedValue: (split.mined || 0) + (split.extracted || 0),
    missing, skipped, hullTypeId: ship ? ship.type_id : null
  };
  S.fitEnriching = true;
  fitInCalculator = false; // only load into the Calculator when the user sends it
  await fitRenderAll();
  fitProgressDone('Priced ' + S.root.children.length + ' item' + (S.root.children.length === 1 ? '' : 's'));
  try { localStorage.setItem('bvFit', JSON.stringify({ text, ts: Date.now() })); } catch {}
  try { pushLedger({ ts: Date.now(), bp: S.root.bpName, bpId: S.root.bpId, runs: 1, cost: Math.round(split.cash), revenue: Math.round(unitOut || 0), profit: 0, hub: region, fit: true }); } catch {}
  fitStatus('Priced ' + S.root.children.length + ' item' + (S.root.children.length === 1 ? '' : 's')
    + (missing.length ? ' · ' + missing.length + ' unresolved' : '')
    + (modesRestored > 0 ? ' · ' + modesRestored + ' saved toggle' + (modesRestored === 1 ? '' : 's') + ' restored' : '')
    + '. Resolving blueprints…');
  // Background: resolve each included item's recipe (buildable rows flip to Build).
  enrichChildren(1).then(finishFitEnrich).catch(finishFitEnrich);
}

function finishFitEnrich() {
  S.fitEnriching = false;
  const kids = (S.root && S.root.children) || [];
  // An item with no recipe can't stay on Build/React.
  for (const c of kids) {
    if (!c) continue;
    const hasBp = !!(c.child && c.child.materials && c.child.materials.length);
    const hasRx = !!(c.reaction && c.reaction.reagents && c.reaction.reagents.length);
    if (c.mode === 'build' && !hasBp) c.mode = (hasRx && S.reactionsOn !== false) ? 'react' : 'buy';
    else if (c.mode === 'react' && !hasRx) c.mode = hasBp ? 'build' : 'buy';
  }
  try { bvModesSave(); } catch {}
  try { fitPersistModes(); } catch {}
  try { fitRefresh(); } catch {}
  const built = kids.filter(c => c.include !== false && c.mode === 'build' && c.child && c.child.materials && c.child.materials.length).length;
  const noBp = kids.filter(c => c.include !== false && !(c.child && c.child.materials && c.child.materials.length) && !(c.reaction && c.reaction.reagents && c.reaction.reagents.length) && !isMineable(c.type_id) && !isPI(c.type_id) && !(S.product && c.type_id === S.product.type_id)).length;
  fitStatus('Done. ' + kids.length + ' item' + (kids.length === 1 ? '' : 's') + ' · ' + built + ' buildable' + (noBp ? ' · ' + noBp + ' buy-only' : '') + '. Tick what you want to send.');
  // Fill the nested material breakdowns with the same deep resolver the
  // Calculator uses (progressive; the fit view re-renders as data lands).
  bpProgDeepEnrich(S.root).then(() => { try { if (fitVisible()) fitRenderAll(); } catch {} }).catch(() => {});
}

function fitCard(k, v, sub, cls) {
  return '<div class="summary-card"><div class="k">' + escapeHtml(k) + '</div><div class="v' + (cls ? ' ' + cls : '') + '">' + v + '</div>' + (sub ? '<div class="k">' + sub + '</div>' : '') + '</div>';
}
// Summary cards for the current fit — shared by the Fit view and the
// Calculator's summary grid (which the fit is loaded into).
function fitSummaryHtml() {
  if (!S.root || !S.root.children) return '';
  const basis = ($('basis') && $('basis').value) || 'sell';
  const kids = S.root.children;
  const inc = kids.filter(c => c.include !== false);
  const split = bomCashSplit();
  let buyAll = 0;
  for (const c of inc) buyAll += ((basis === 'buy' ? c.unitBuy : c.unitSell) || 0) * c.perRun;
  const savings = buyAll - split.cash;
  const hull = kids.find(c => c.section === 'hull');
  const hubName = (D.hubs.find(h => h.region === hub()) || {}).name || hub();
  return fitCard('Fit', escapeHtml(S.root.bpName), inc.length + ' / ' + kids.length + ' items included')
    + fitCard('Buy all (market)', fmtISK(buyAll), inc.length + ' item' + (inc.length === 1 ? '' : 's') + ' @ ' + escapeHtml(hubName) + ' · ' + basis)
    + fitCard('Build cost (raw cash)', fmtISK(split.cash), (S.bom || []).length + ' BOM lines' + (split.mined ? ' · excl. ' + fmtISK(split.mined) + ' mined' : '') + (split.extracted ? ' · excl. ' + fmtISK(split.extracted) + ' extracted' : ''))
    + fitCard(savings >= 0 ? 'Saved by building' : 'Building costs more', fmtISK(Math.abs(savings)), 'vs buying everything', savings >= 0 ? 'green' : 'red')
    + (hull ? fitCard('Hull', escapeHtml(hull.name), fmtISK(hull.unitSell || 0) + ' market') : '');
}

async function fitRenderAll() {
  if (!S.root || !S.root.children) return;
  if (!(S.lastCalc && S.lastCalc.fit)) return; // never paint a blueprint calc into the Fit view
  const basis = ($('basis') && $('basis').value) || 'sell';
  const kids = S.root.children;
  const inc = kids.filter(c => c.include !== false);
  S.bom = effLeafCost(1);
  const split = bomCashSplit();
  const hull = kids.find(c => c.section === 'hull');
  const hubName = (D.hubs.find(h => h.region === hub()) || {}).name || hub();

  const sum = $('fitSummary');
  if (sum) {
    sum.style.display = 'grid';
    sum.innerHTML = fitSummaryHtml();
  }

  const warn = $('fitWarn');
  if (warn) {
    const noBp = S.fitEnriching ? [] : inc.filter(c => !(c.child && c.child.materials && c.child.materials.length) && !(c.reaction && c.reaction.reagents && c.reaction.reagents.length)
      && !isMineable(c.type_id) && !isPI(c.type_id) && !(S.product && c.type_id === S.product.type_id));
    const rows = [];
    if ((S.lastCalc && S.lastCalc.missing || []).length) rows.push('<b>Unresolved names</b> (not evaluated): ' + S.lastCalc.missing.map(escapeHtml).join(', '));
    if ((S.lastCalc && S.lastCalc.skipped || []).length) rows.push('<b>Skipped by options</b>: ' + S.lastCalc.skipped.map(s => escapeHtml(s.name) + ' (' + escapeHtml(s.reason) + ')').join(', '));
    if (noBp.length) rows.push('<b>Buy-only</b> — no manufacturing blueprint found: ' + noBp.map(c => escapeHtml(c.name)).join(', '));
    if (rows.length) { warn.style.display = ''; warn.innerHTML = '<h3><i class="fas fa-triangle-exclamation" style="color:#d29922"></i> Notes</h3>' + rows.map(r => '<p class="hint">' + r + '</p>').join(''); }
    else { warn.style.display = 'none'; warn.innerHTML = ''; }
  }

  const mb = $('fitModBody');
  if (mb) {
    mb.innerHTML = kids.map((c, i) => {
      const on = c.include !== false;
      const recipe = !!(c.child && c.child.materials && c.child.materials.length);
      const rxOn = !!(c.reaction && c.reaction.reagents && c.reaction.reagents.length && S.reactionsOn !== false);
      const mine = isMineable(c.type_id), pi = isPI(c.type_id);
      const pending = !c._tried;
      const btn = (m, label) => '<button class="mode-btn' + (c.mode === m ? ' on-' + m : '') + '" data-fitmode="' + i + '" data-fm="' + m + '">' + label + '</button>';
      let modes = btn('buy', 'Buy');
      if (mine) modes = btn('buy', 'Buy') + btn('mine', '<i class="fas fa-gem"></i> Mine');
      else if (pi) modes = btn('buy', 'Buy') + btn('extract', 'Extract');
      else {
        // Only offer Build/React once a recipe (or formula) actually exists —
        // while the lookup is still pending both are shown, after an empty
        // result neither is, so nothing unbuildable can be set to Build.
        if (recipe || pending) modes += btn('build', 'Build');
        if (rxOn) modes += btn('react', 'React');
      }
      const isHull = c.section === 'hull';
      const warnPill = (S.fitEnriching || recipe || rxOn || mine || pi || isHull) ? '' : ' <span class="pill" title="No manufacturing blueprint — buy only">no BP</span>';
      const secPill = (c.section && c.section !== 'module') ? ' <span class="pill">' + c.section.toUpperCase() + '</span>' : '';
      const unit = (basis === 'buy' ? c.unitBuy : c.unitSell) || 0;
      return '<tr' + (on ? '' : ' style="opacity:.45"') + '>'
        + '<td style="text-align:center"><input type="checkbox" data-fitinc="' + i + '"' + (on ? ' checked' : '') + ' title="Include this item in the fit"></td>'
        + '<td>' + bvIconImg(c.type_id) + ' ' + escapeHtml(c.name) + secPill + warnPill + '</td>'
        + '<td>' + fmtN(c.perRun) + '</td><td>' + fmtISK(unit) + '</td><td>' + fmtISK(unit * c.perRun) + '</td>'
        + '<td><span class="mode-toggle">' + modes + '</span></td>'
        + '<td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(c.type_id) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + infoButton(c.type_id) + '<button class="mode-btn tree-remove" data-fit-rm="' + i + '" title="Remove ' + escapeHtml(c.name) + ' from the fit"><i class="fas fa-xmark"></i></button></td></tr>';
    }).join('');
    const meta = $('fitModMeta'); if (meta) meta.textContent = inc.length + ' / ' + kids.length + ' selected';
    mb.querySelectorAll('[data-fitinc]').forEach(b => b.onchange = () => fitSetInclude(+b.dataset.fitinc, b.checked));
    mb.querySelectorAll('[data-fitmode]').forEach(b => b.onclick = () => fitSetMode(+b.dataset.fitmode, b.dataset.fm));
    mb.querySelectorAll('[data-fit-rm]').forEach(b => b.onclick = () => calcRemoveItem(+b.dataset.fitRm));
    const mp = $('fitModulesPanel'); if (mp) mp.style.display = '';
    const ap = $('fitActionsPanel'); if (ap) ap.style.display = '';
  }
}

// ---- T2 / invention flag for the required-blueprints list ----
// This SDE snapshot carries no metaGroupID and blueprint market groups are
// empty, so the blueprint type's GROUP is the only reliable signal. T2-only
// groups are listed here: ships (Cruiser and up, plus command/strategic/flag),
// T2 fighters, the "Advanced" T2 charge families, and Precursor weapons.
// Mixed groups (Energy/Hybrid/Projectile Weapon, Missile, Script, Capacitor
// Battery, …) are deliberately absent — those contain both T1 and T2, so the
// group can't tell them apart and guessing would be worse than no flag.
const BV_T2_BP_GROUPS = new Set([
  'Battlecruiser Blueprint', 'Battleship Blueprint', 'Carrier Blueprint', 'Cruiser Blueprint',
  'Destroyer Blueprint', 'Dreadnought Blueprint', 'Titan Blueprint', 'Supercarrier Blueprints',
  'Elite Hauler Blueprint', 'Freighter Blueprint', 'Command Destroyer Blueprint',
  'Tactical Destroyer Blueprint', 'Expedition Command Ship Blueprint',
  'Industrial Command Ship Blueprint', 'Strategic Cruiser Blueprints',
  'Support Fighter Blueprint', 'Command Burst Blueprint', 'Command Burst Charge Blueprint',
  'Precursor Weapon Blueprint', 'Energy Nosferatu Blueprint',
  'Advanced Frequency Crystal Blueprint', 'Advanced Hybrid Charge Blueprint',
  'Advanced Projectile Ammo Blueprint', 'Advanced Exotic Plasma Charge Blueprint',
  'Advanced Condenser Pack Blueprint', 'Exotic Plasma Charge Blueprint'
]);
let _bvBpNameIdx = null;
// Blueprint name -> SDE group name, via the local category-9 index. Built once.
function bvBpGroupForName(bpName) {
  try {
    if (_bvBpNameIdx === null) {
      _bvBpNameIdx = new Map();
      const T = (window.BV_TYPEINFO && window.BV_TYPEINFO.types) || {};
      for (const id in T) {
        const t = T[id];
        if (!t || t.c !== 9 || !t.n) continue;
        const k = t.n.toLowerCase();
        if (!_bvBpNameIdx.has(k)) _bvBpNameIdx.set(k, id);
      }
    }
    const id = _bvBpNameIdx.get(String(bpName || '').toLowerCase());
    if (!id) return '';
    const t = window.BV_TYPEINFO.types[id];
    return t ? (bvInfoName('groups', t.g) || '') : '';
  } catch { return ''; }
}
function bvBpIsT2(bpName) { return BV_T2_BP_GROUPS.has(bvBpGroupForName(bpName)); }
// Blueprints (and reaction formulas) needed for a build — walks every included
// item's build/reaction tree and collects the recipe labels actually being
// used. Works on any build root: the live calculation or a pinned snapshot.
//
// Listing rule: an entry appears only when we hold a real recipe for it AND the
// user is actually sourcing that item in-house. Anything we couldn't resolve a
// recipe for — raw minerals/PI, buy-only market items, names that failed to
// resolve — is never listed, so the list can only ever over-promise missing
// recipes, never invent one.
function blueprintListFor(src) {
  const out = new Map();
  const rxAllowed = S.reactionsOn !== false;
  const add = (name, typeId, kind) => { if (!name) return; const k = String(name).toLowerCase(); if (!out.has(k)) out.set(k, { name: String(name), typeId: typeId, kind: kind }); };
  // The recipe kind we're allowed to list for a resolved deep node.
  // Manufacturing always counts; a reaction formula only while Reactions is ON.
  const recipeKind = node => {
    if (!node || !node.materials || !node.materials.length) return null;
    if (node.kind === 'bp') return 'bp';
    if (node.kind === 'rx') return rxAllowed ? 'rx' : null;
    return null;
  };
  const walk = (mats, ci, trail, depth, rx, parentFull, productQty) => {
    const batches = deepBatches(parentFull, productQty);
    for (const m of (mats || [])) {
      const tid = deepMatId(m);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      const qty = Math.max(0, Math.floor(deepMatQty(m) * batches));
      if (!qty) continue;
      const key = progKey(ci, trail.concat([tid]), depth, rx);
      const sub = m._deep;
      const kind = recipeKind(sub);
      const info = { hasBp: kind === 'bp', hasRx: kind === 'rx', mineable: isMineable(tid) };
      const eff = deepModeFor(key, info);
      if (eff === 'build' && kind === 'bp') { add(sub.label, tid, 'bp'); walk(sub.materials, ci, trail.concat([tid]), depth + 1, false, qty, sub.productQty || 1); }
      else if (eff === 'react' && kind === 'rx') { add(sub.label, tid, 'rx'); walk(sub.materials, ci, trail.concat([tid]), depth + 1, true, qty, sub.productQty || 1); }
    }
  };
  const kids = (src && src.children) || [];
  kids.forEach((c, ci) => {
    if (!c || c.include === false) return;
    // Raw / PI goods are sourced by mining or extraction, never by a blueprint.
    if (isMineable(c.type_id) || isPI(c.type_id)) return;
    const need = c.perRun;
    if (c.mode === 'build') {
      // Top-level children only ever carry a manufacturing recipe (they're set
      // by childBlueprint, which returns null when there's no blueprint).
      if (c.child && c.child.bpName && c.child.materials && c.child.materials.length) {
        add(c.child.bpName, c.type_id, 'bp');
        walk(c.child.materials, ci, [+c.type_id], 1, false, need, c.child.productQty || 1);
      }
    } else if (c.mode === 'react') {
      const rx = c.reaction;
      if (rxAllowed && rx && rx.reagents && rx.reagents.length && rx.formulaName) { add(rx.formulaName, c.type_id, 'rx'); walk(rx.reagents, ci, [+c.type_id], 1, true, need, rx.productQty || 1); }
    }
  });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
// Blueprints required for the build Build Progress is currently tracking.
function trackedBlueprintList() {
  try { return blueprintListFor(bpProgSource()); } catch { return []; }
}

function fitRefresh() {
  if (!S.root || !S.root.children) return;
  S.bom = effLeafCost(1);
  try { fitRenderAll(); } catch {}
  // Keep the Calculator's copy of the fit in sync (only once it's been sent).
  try {
    if (fitInCalculator && S.lastCalc && S.lastCalc.fit) {
      renderCrumbs(S.root.bpName);
      renderTree(1);
      renderBom(1);
      renderSummary(S.lastCalc);
    }
  } catch {}
  try { fitCalcNoteRender(); } catch {}
  // Mirror live sourcing + include changes into the pinned build so Build
  // Progress always matches the fit even after it's been sent.
  try { bpProgRefreshPin(); } catch {}
  try { renderBuildProgress(); } catch {}
}
function fitSetInclude(i, val) {
  const c = S.root && S.root.children[i]; if (!c) return;
  c.include = !!val;
  const ig = fitIgnRead(S.root.bpId);
  if (c.include) delete ig[c.type_id]; else ig[c.type_id] = false;
  fitIgnWrite(S.root.bpId, ig);
  fitRefresh();
  if (c.include && !c.child && !c._tried) enrichChildren(1).then(() => { if (fitVisible()) fitRefresh(); }).catch(() => {});
}
function fitSetMode(i, m) {
  const c = S.root && S.root.children[i]; if (!c) return;
  if (m === 'build' && !(c.child && c.child.materials && c.child.materials.length)) { fitStatus('No manufacturing blueprint for ' + c.name + ' — buy only.'); return; }
  if (m === 'mine' && !isMineable(c.type_id)) return;
  if (m === 'extract' && !isPI(c.type_id)) return;
  if (m === 'react' && !(c.reaction && c.reaction.reagents && c.reaction.reagents.length && S.reactionsOn !== false)) return;
  c.mode = m;
  try { fitPersistModes(); } catch {}
  fitRefresh();
}
function fitSetAllInclude(v) {
  if (!S.root) return;
  const ig = {};
  S.root.children.forEach(c => { c.include = !!v; if (!v) ig[c.type_id] = false; });
  fitIgnWrite(S.root.bpId, ig);
  fitRefresh();
  if (v) enrichChildren(1).then(() => { if (fitVisible()) fitRefresh(); }).catch(() => {});
}
function fitSetAllMode(m) {
  if (!S.root) return;
  S.root.children.forEach((c, i) => { if (c.include === false) return; if (m === 'build') { if (c.child && c.child.materials && c.child.materials.length) c.mode = 'build'; } else c.mode = m; });
  try { fitPersistModes(); } catch {}
  fitRefresh();
}

// ---- wire ----
document.addEventListener('DOMContentLoaded', () => {
  try { bpPinsLoad(); } catch {}
  init(); bindHandoffs(); initAutocomplete();
  renderRefinery();
  // Resolve ice products in the background so Mine-it tags show on isotopes/ozone/water/strontium.
  ensureIceProducts().then(() => { if (S.root) { try { renderTree(S.runs || 1); renderBom(S.runs || 1); } catch {} } }).catch(() => {});
  $('calcBtn').onclick = calculate;
  const scb = $('sendCalcToBuild');
  if (scb) scb.onclick = () => sendCalcToBuild();
  const scbB = $('sendCalcToBuildBottom');
  if (scbB) scbB.onclick = () => sendCalcToBuild();
  $('bpName').addEventListener('keydown', e => { if (e.key === 'Enter') calculate(); });
  $('resetBtn').onclick = () => calcResetAll();
  $('savePreset').onclick = () => { const n = prompt('Preset name:'); if (!n) return; const pr = JSON.parse(localStorage.getItem('bvPresets') || '{}'); const ids = ['hubSelect', 'me', 'te', 'indSkill', 'advSkill', 'implant', 'structure', 'rigs', 'jobTax', 'basis', 'reactions', 'scc', 'salesTax', 'broker', 'mfgIndex', 'tracked', 'refinePct', 'mineRate', 'mineShip']; pr[n] = Object.fromEntries(ids.map(k => [k, $(k) ? $(k).value : undefined])); localStorage.setItem('bvPresets', JSON.stringify(pr)); refreshPresets(pr); status('Preset saved.'); };
  $('preset').onchange = e => { const pr = JSON.parse(localStorage.getItem('bvPresets') || '{}'); const p = pr[e.target.value]; if (p) for (const [k, v] of Object.entries(p)) if ($(k)) $(k).value = v; };
  $('reactions').onchange = () => {
    if (!S.root) return;
    S.reactionsOn = ($('reactions').value === 'on');
    if (!S.reactionsOn) S.root.children.forEach(c => { if (c.mode === 'react') c.mode = 'buy'; });
    renderTree(S.runs || 1); renderBom(S.runs || 1); if (S.lastCalc) renderSummary(S.lastCalc);
    try { bpProgRefreshPin(); } catch {}
    try { renderBuildProgress(); } catch {}
    if (S.reactionsOn) { status('Reactions ON — resolving formulas…'); enrichChildren(S.runs || 1); }
    else status('Reactions OFF — reaction materials priced from market.');
  };
  $('ssoBtn').onclick = async () => {
    if (window.BVAuth && BVAuth.signedIn()) {
      if (confirm('Sign out?')) BVAuth.logout();
      return;
    }
    try { await BVAuth.login(); } catch (e) { status('SSO unavailable: ' + e.message); }
  };
  $('shot').onchange = e => ocrFile(e.target.files[0]);
  $('pasteShot').onclick = async () => { try { const items = await navigator.clipboard.read(); for (const it of items) { const t = it.types.find(t => t.startsWith('image/')); if (t) { ocrFile(await it.getType(t)); return; } } status('No image in clipboard.'); } catch { status('Clipboard blocked — use file picker.'); } };
  $('bpRefresh').onclick = loadBlueprints; $('bpScan').onclick = scanProfit;
  // ---- Fit Builder wiring ----
  if ($('fitAnalyze')) $('fitAnalyze').onclick = calculateFit;
  if ($('fitSample')) $('fitSample').onclick = () => { if ($('fitPaste')) $('fitPaste').value = FIT_SAMPLE; calculateFit(); };
  if ($('fitClear')) $('fitClear').onclick = () => {
    if ($('fitPaste')) $('fitPaste').value = '';
    try { localStorage.removeItem('bvFit'); } catch {}
    fitStatus('');
    try { fitProgressHide(); } catch {}
    ['fitSummary', 'fitWarn', 'fitModulesPanel', 'fitActionsPanel'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    try { calcResetAll(); } catch {}
  };
  if ($('fitPaste')) $('fitPaste').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') calculateFit(); });
  if ($('fitIncAll')) $('fitIncAll').onclick = () => fitSetAllInclude(true);
  if ($('fitIncNone')) $('fitIncNone').onclick = () => fitSetAllInclude(false);
  if ($('fitBuyAll')) $('fitBuyAll').onclick = () => fitSetAllMode('buy');
  if ($('fitBuildAll')) $('fitBuildAll').onclick = () => fitSetAllMode('build');
  if ($('fitSendBoth')) $('fitSendBoth').onclick = () => {
    if (!(S.root && S.lastCalc && S.lastCalc.fit)) { fitStatus('Analyse a fit first.'); return; }
    fitLoadToCalculator();
    const pinned = bpProgPinCurrent(true);
    switchMainView('calc');
    scrollContentTop();
    fitStatus(pinned ? 'Loaded into the Calculator and sent to Build Progress.' : 'Loaded into the Calculator — pin limit reached, unpin one in Build Progress to track it there.');
  };
  // Restore last pasted fit (no auto-analyse — prices stay fresh on demand).
  try { const j = JSON.parse(localStorage.getItem('bvFit') || 'null'); if (j && j.text && $('fitPaste') && !$('fitPaste').value) $('fitPaste').value = j.text; } catch {}
  // Share links calculate automatically — on page load and when clicked from
  // the ledger (same-page hash change, no reload). Supports the new short
  // code (#<code>) and the legacy #bv=<base64> form.
  function hasShareHash() {
    const h = location.hash.slice(1);
    if (!h) return false;
    if (h.startsWith('bv=')) return true;
    return h.indexOf('=') === -1 && h.length <= 16 && /^[A-Za-z0-9_-]+$/.test(h);
  }
  function calcFromHash() {
    const h = location.hash.slice(1);
    if (!h) return false;
    if (h.startsWith('bv=')) {
      try {
        const e = JSON.parse(atob(h.slice(3)));
        if (e && e.bp) {
          $('bpName').value = e.bp;
          if (e.runs) $('runs').value = e.runs;
          calculate();
          return true;
        }
      } catch {}
      return false;
    }
    // Short share code: no '=' and a compact base64url token.
    if (h.indexOf('=') === -1 && h.length <= 16 && /^[A-Za-z0-9_-]+$/.test(h)) { loadShortCode(h); return true; }
    return false;
  }
  // Resume the last calculation (blueprint + exact drill path) unless a share
  // link is present. Live re-runs so prices are always fresh; no ledger entry.
  function resumeLast() {
    if (hasShareHash()) return false;
    try { if (localStorage.getItem('bvResume') === '0') return false; } catch {}
    let st = null;
    try { const j = JSON.parse(localStorage.getItem('bvLastCalc') || 'null'); st = j && j.state; } catch {}
    if (!st || !st.bp || !st.bp.bpName) return false;
    applyState(st, { noLedger: true });
    return true;
  }
  // Restore last active sidebar tab + main view.
  function restoreUiState() {
    try { const tab = localStorage.getItem('bvActiveTab'); if (tab) { const b = document.querySelector('.tab-btn[data-tab="' + tab + '"]'); if (b && !b.classList.contains('active')) b.click(); } } catch {}
    try { const v = localStorage.getItem('bvActiveView'); if (v === 'prog' || v === 'calc' || v === 'fit') switchMainView(v); } catch {}
    try { const lb = document.querySelector('.tab-btn[data-tab="ledger"]'); if (lb && lb.classList.contains('active')) renderSavedList(); } catch {}
  }
  window.addEventListener('hashchange', () => { try { calcFromHash(); } catch {} });
  try { const fromHash = calcFromHash(); if (!fromHash) resumeLast(); } catch {}
  try { restoreUiState(); } catch {}
  // ---- Inventory: saved build systems + 20-minute auto-refresh ----
  try { renderStkSavedSystems(); } catch {}
  if ($('stkAutoRefresh')) {
    const ar = $('stkAutoRefresh');
    try { ar.checked = localStorage.getItem('bvStkAutoRefresh') !== '0'; } catch {}
    ar.onchange = () => {
      try { localStorage.setItem('bvStkAutoRefresh', ar.checked ? '1' : '0'); } catch {}
  stkScheduleAutoRefresh();
  stkBindAutoRefresh();
    };
  }
  stkScheduleAutoRefresh();
  // Item info panel: close on Esc and on outside click.
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInfoPanel(); });
  document.addEventListener('pointerdown', e => {
    const p = document.getElementById('bvInfoPanel');
    if (p && p.style.display !== 'none' && !p.contains(e.target) && !(e.target.closest && e.target.closest('[data-info]'))) closeInfoPanel();
  });
  if ($('resumeLast')) $('resumeLast').onchange = () => { try { localStorage.setItem('bvResume', $('resumeLast').checked ? '1' : '0'); } catch {} };
  if ($('bpSearch')) $('bpSearch').addEventListener('input', () => { myBpPage = 1; renderBpRows(); });
  if ($('skillBtn')) $('skillBtn').onclick = loadMySkills;
  // refining sync (global % replaces Reprocess %)
  if ($('refineLoad')) $('refineLoad').onclick = loadRefiningYield;
  if ($('refinePct')) {
    $('refinePct').addEventListener('input', () => { try { savePrefs(); } catch {} });
    $('refinePct').addEventListener('change', async () => {
      try { savePrefs(); } catch {}
      // auto-rebuild the inventory deduction at the new refine % (no asset re-fetch)
      try { await rebuildInventorySnapshot(); } catch {}
      if (S.root && S.root.children && S.root.children.some(c=>c.mode==='mine')) {
        try { planMining(undefined, { auto:true }); } catch {}
      }
    });
  }
  // keep Structure picker as source of refining facility bonus — re-sync hint
  if ($('structure')) $('structure').addEventListener('change', () => { try { savePrefs(); } catch {} });
  if ($('rigs')) $('rigs').addEventListener('change', () => { try { savePrefs(); } catch {} });
  // inventory
  if ($('stkRefresh')) $('stkRefresh').onclick = loadInventory;
  if ($('stkSystemInput')) attachStkSystemAutocomplete();
  if ($('stkAllSystems')) $('stkAllSystems').onchange = () => { savePrefs(); stkRescopeSystem(); };
  if ($('stkResetCaches')) $('stkResetCaches').onclick = () => {
    stkResetAllCaches();
    stkProgressHide();
    if ($('stkList')) $('stkList').innerHTML = '<p class="hint">All scan caches cleared. Pick a system and hit Scan system for a fully fresh lookup.</p>';
    if ($('stkDetailWrap')) $('stkDetailWrap').innerHTML = '';
    if ($('stkStatus')) $('stkStatus').textContent = '';
    if ($('stkTotals')) $('stkTotals').textContent = '';
    if (S.root) { try { renderShoppingList(S.runs||1); } catch {} }
    renderRefinery();
    status('Scan caches cleared (structures, denials, snapshots, ore yields). Prefs kept.');
  };
  if ($('stkClear')) $('stkClear').onclick = () => {
    stkSnapshotClear();
    stkAgg = {}; stkAllAgg = {}; stkAggBySystem = {}; stkAggByStation = {}; stkLocationNames = {}; stkSystems = {}; stkLocSystem = {}; stkTypeLocs = {}; stkNames = {}; stkCustomNames = {}; stkOreDetail = []; stkEnriched=[]; stkEnrichedAll=[]; stkTypeFlags={}; stkContainerNames={}; stkTypeGroups={}; try { stkIndustrialProbed.clear(); } catch {}
    stkProgressHide();
    if ($('stkList')) $('stkList').innerHTML = '<p class="hint">Cleared. Pick a system and hit Scan system.</p>';
    if ($('stkDetailWrap')) $('stkDetailWrap').innerHTML = '';
    if ($('stkStatus')) $('stkStatus').textContent = '';
    if ($('stkTotals')) $('stkTotals').textContent = '';
    if (S.root) { try { renderShoppingList(S.runs||1); } catch {} }
    renderRefinery();
    try { renderStkBlueprintList(); } catch {}
    status('Inventory snapshot cleared.');
  };
  if ($('copyStkBps')) $('copyStkBps').onclick = () => { copyStkBlueprintList(); };
  if ($('stkBpExport')) $('stkBpExport').onclick = exportStkBlueprintsCSV;
  if ($('stkSource')) $('stkSource').onchange = () => { stkRaw=[]; stkAgg={}; stkAllAgg={}; stkAggBySystem={}; stkAggByStation={}; stkLocationNames={}; stkSystems={}; stkLocSystem={}; stkTypeLocs={}; stkNames={}; stkCustomNames={}; stkOreDetail=[]; stkEnriched=[]; stkEnrichedAll=[]; try { stkIndustrialProbed.clear(); } catch {} try { renderStkBlueprintList(); } catch {} if($('stkList')) $('stkList').innerHTML='<p class="hint">Source changed — hit Scan system.</p>'; if($('stkDetailWrap')) $('stkDetailWrap').innerHTML=''; if($('stkStatus')) $('stkStatus').textContent=''; if (S.root) try{ renderShoppingList(S.runs||1); }catch{}; renderRefinery(); };

  if ($('stkSystem')) $('stkSystem').onchange = stkRescopeSystem;
  function stkSchedFilter() {
    if (_stkFilterTimer) clearTimeout(_stkFilterTimer);
    _stkFilterTimer = setTimeout(() => { stkPage = 1; stkDetailPage = 1; stkApplyFlagSystemFilter(); renderStkRows(); }, 300);
  }
  if ($('stkSearch')) $('stkSearch').addEventListener('input', stkSchedFilter);
  if ($('stkFlag')) $('stkFlag').addEventListener('change', () => { stkPage = 1; stkDetailPage = 1; stkApplyFlagSystemFilter(); renderStkRows(); });
  if ($('stkExport')) $('stkExport').onclick = () => {
    const flag = stkFlag();
    const q = (($('stkSearch') && $('stkSearch').value) || '').trim();
    // export detail filtered stacks (per-stack) like assest test main.py:768
    const rows = stkDetailFiltered();
    if (!rows.length) { status('Nothing to export — no stacks match filter.'); return; }
    const sys = stkCurrentSysName() || 'all';
    let csv = 'type_name,type_id,quantity,system,location,location_flag,container,location_id,item_id\n';
    for (const a of rows) {
      const esc = s => '"' + String(s||'').replace(/"/g,'""') + '"';
      csv += [esc(stkTypeName(a.type_id)), a.type_id, a.quantity, esc(a.system_name), esc(a.location_name), esc(a.location_flag), esc(a._containerName), a.location_id, a.item_id].join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const al = document.createElement('a'); al.href = url; al.download = 'bv_inventory_' + sys.replace(/\s+/g,'_') + (flag!=='All'?'_' + flag : '') + (q?'_filtered':'') + '.csv'; al.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
    status('Exported ' + rows.length + ' stacks to CSV.');
  };
  // JeveAssets-like asset search: industrial toggle + multi-filter manager
  renderStkFilterRows();
  if ($('stkIndustrialOnly')) $('stkIndustrialOnly').addEventListener('change', async () => {
    stkPage=1; stkDetailPage=1; renderStkRows();
    // Industrial-only feeds the calculator: rebuild the snapshot from the
    // filtered set (no asset re-fetch) and refresh Shopping + Refinery.
    try {
      const agg = stkSnapshotAggForSource();
      const prev = stkSnapshotRead(matSource());
      if (agg && Object.keys(agg).length) await buildInventorySnapshot(agg, prev && prev.oreDetail, matSource(), stkAllSystems() ? '' : stkSysId(), stkCurrentSysName());
      else await rebuildInventorySnapshot();
      if (S.root) await renderShoppingList(S.runs||1);
      await renderRefinery();
    } catch(e) { console.warn('[BV] industrial toggle rebuild failed', e); }
  });
  if ($('stkFilterAdd')) $('stkFilterAdd').onclick = () => { stkFilters.push({ enabled:true, logic:'And', group:0, column:'All', compare:'Contains', text:'' }); stkSaveFilters(); renderStkFilterRows(); };
  if ($('stkFilterClear')) $('stkFilterClear').onclick = () => { stkFilters=[]; stkSaveFilters(); renderStkFilterRows(); stkPage=1; stkDetailPage=1; renderStkRows(); };
  if ($('stkFilterSave')) $('stkFilterSave').onclick = () => {
    const name = prompt('Save filter set as:'); if (!name) return;
    const sets = stkLoadSets(); sets[name] = JSON.parse(JSON.stringify(stkFilters)); stkPersistSets(sets); renderStkFilterRows(); status('Filter saved: ' + name);
  };
  if ($('stkFilterLoad')) $('stkFilterLoad').onclick = () => {
    const sel = $('stkFilterLoadSelect'); const name = sel ? sel.value : '';
    if (!name) { status('Pick a saved filter to load.'); return; }
    const sets = stkLoadSets(); if (!sets[name]) { status('No such set.'); return; }
    stkFilters = JSON.parse(JSON.stringify(sets[name])); stkSaveFilters(); renderStkFilterRows(); stkPage=1; stkDetailPage=1; renderStkRows(); status('Loaded: ' + name);
  };
  // delegated edits for filter rows (enable/logic/group/column/compare/text/clone/del)
  const fr = $('stkFilterRows');
  if (fr) {
    fr.addEventListener('change', e => {
      const t = e.target; if (!t.dataset.fe) return;
      const i = parseInt(t.dataset.i,10); const f = stkFilters[i]; if (!f) return;
      const fe = t.dataset.fe;
      if (fe==='en') f.enabled = t.checked;
      else if (fe==='logic') f.logic = t.value;
      else if (fe==='group') f.group = parseInt(t.value,10)||0;
      else if (fe==='col') f.column = t.value;
      else if (fe==='cmp') f.compare = t.value;
      else if (fe==='text') f.text = t.value;
      stkSaveFilters(); stkPage=1; stkDetailPage=1; renderStkRows();
    });
    fr.addEventListener('input', e => {
      const t = e.target; if (t.dataset.fe!=='text') return;
      const i = parseInt(t.dataset.i,10); const f = stkFilters[i]; if (!f) return;
      f.text = t.value; stkSaveFilters();
      // debounce like JeveAssets live filter
      if (_stkFilterTimer) clearTimeout(_stkFilterTimer);
      _stkFilterTimer = setTimeout(()=>{ stkPage=1; stkDetailPage=1; renderStkRows(); }, 300);
    });
    fr.addEventListener('click', e => {
      const b = e.target.closest('[data-fe]'); if (!b) return;
      const fe = b.dataset.fe; const i = parseInt(b.dataset.i,10);
      if (fe==='clone') { const f = stkFilters[i]; if (!f) return; stkFilters.splice(i+1,0, JSON.parse(JSON.stringify(f))); stkSaveFilters(); renderStkFilterRows(); stkPage=1; stkDetailPage=1; renderStkRows(); }
      else if (fe==='del') { stkFilters.splice(i,1); stkSaveFilters(); renderStkFilterRows(); stkPage=1; stkDetailPage=1; renderStkRows(); }
    });
  }
  if ($('stkDeduct')) $('stkDeduct').onchange = async () => { if (S.root) await renderShoppingList(S.runs||1); };
  if ($('matSource')) $('matSource').onchange = async () => { try { savePrefs(); } catch {}; if (S.root) await renderShoppingList(S.runs||1); renderRefinery(); };
  // ship picker + dual yield inputs (m³/min <-> m³/sec) — pick a ship for approx rate or type a custom rate, both stay in sync
  const syncMineSec = () => { try { const v = parseFloat($('mineRate').value)||0; if ($('mineRateSec')) $('mineRateSec').value = (Math.round((v/60)*10)/10).toString(); } catch {} };
  const syncMineMin = () => { try { const v = parseFloat($('mineRateSec').value)||0; if ($('mineRate')) $('mineRate').value = Math.max(1, Math.round(v*60)).toString(); } catch {} };
  $('mineShip').onchange = () => {
    const val = $('mineShip').value;
    const s = D.ships.find(x => x.id === val);
    if (s && s.rate) { $('mineRate').value = s.rate; if ($('mineRateSec')) $('mineRateSec').value = (Math.round((s.rate/60)*10)/10).toString(); }
    if (val === 'custom') { try { document.querySelector('[data-tab="mine"]')?.click(); if ($('mineRate')) $('mineRate').focus(); } catch {} }
    try { savePrefs(); } catch {}
    // live-update mining plan if already computed, without stealing focus
    if (S.root && S.root.children && S.root.children.some(c=>c.mode==='mine')) { try { planMining(undefined, { auto:true }); } catch {} }
  };
  if ($('mineRate')) {
    $('mineRate').addEventListener('input', () => { syncMineSec(); try { savePrefs(); } catch {} });
    $('mineRate').addEventListener('change', async () => { syncMineSec(); try { savePrefs(); } catch {}; if (S.root && S.root.children && S.root.children.some(c=>c.mode==='mine')) { try { planMining(undefined, { auto:true }); } catch {} } });
  }
  if ($('mineRateSec')) {
    $('mineRateSec').addEventListener('input', () => { syncMineMin(); try { savePrefs(); } catch {} });
    $('mineRateSec').addEventListener('change', async () => { syncMineMin(); try { savePrefs(); } catch {}; if (S.root && S.root.children && S.root.children.some(c=>c.mode==='mine')) { try { planMining(undefined, { auto:true }); } catch {} } });
  }
  // keep sec synced after prefs restore
  try { syncMineSec(); } catch {}
  $('mineGo').onclick = () => planMining();
  $('mineFromBom').onclick = () => planMining();
  // mining alternative ore picker — dropdown in the per-material detail table recalculates with that rock
  // and top-right ship picker (mining plan header) — custom opens left Mine panel
  document.addEventListener('change', e => {
    const ownBox = e.target.closest('[data-own]');
    if (ownBox) {
      ownSet(ownBox.dataset.own, ownBox.checked);
      if (S.root) renderShoppingList(S.runs || 1);
      renderRefinery();
      return;
    }
    const shipTop = e.target.closest('#mineShipTop');
    if (shipTop) {
      const val = shipTop.value;
      if ($('mineShip')) $('mineShip').value = val;
      const s = D.ships.find(x => x.id === val);
      if (s && s.rate) {
        $('mineRate').value = s.rate;
        if ($('mineRateSec')) $('mineRateSec').value = (Math.round((s.rate/60)*10)/10).toString();
      }
      if (val === 'custom') { try { document.querySelector('[data-tab="mine"]')?.click(); if ($('mineRate')) setTimeout(()=>$('mineRate')?.focus(), 50); } catch {} }
      try { savePrefs(); } catch {}
      if (S.root && S.root.children && S.root.children.some(c=>c.mode==='mine')) { try { planMining(undefined, { auto:true }); } catch {} }
      return;
    }
    const sel = e.target.closest('[data-mine-choice]');
    if (!sel) return;
    const mid = sel.dataset.mineChoice;
    const oreId = +sel.value;
    if (!mid || !oreId) return;
    if (typeof window.miningSelection === 'undefined') window.miningSelection = {};
    window.miningSelection[mid] = oreId;
    // re-run plan in auto mode so it updates the totals above without stealing scroll/focus
    try { planMining(undefined, { auto: true }); } catch {}
  });
  // gem icons on tree + BOM mineral rows, drill-down links, breadcrumb nav (re-rendered often, so delegate globally)
  document.addEventListener('click', e => {
    if (!e.target || !e.target.closest) return;
    const mine = e.target.closest('[data-mine]');
    if (mine) {
      e.preventDefault();
      const fid = mine.dataset.mine ? +mine.dataset.mine : null;
      // Don't change the Buy/Mine toggle - just force the mining plan to include this type
      // so the diamond always opens the mining section even when Buy is selected.
      planMining(fid);
      return;
    }
    const drill = e.target.closest('[data-drill]');
    if (drill) { e.preventDefault(); drillDown(+drill.dataset.drill); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      if (nav.dataset.nav === 'back') goBack();
      else goCrumb(+nav.dataset.i);
      return;
    }
    const info = e.target.closest('[data-info]');
    if (info) { e.preventDefault(); openItemInfo(info.dataset.info); return; }
    const lshare = e.target.closest('[data-ledgershare]');
    if (lshare) { e.preventDefault(); shareLedgerEntry(+lshare.dataset.ledgershare); return; }
    const sload = e.target.closest('[data-saveload]');
    if (sload) { e.preventDefault(); loadShortCode(sload.dataset.saveload); return; }
    const sdel = e.target.closest('[data-savedel]');
    if (sdel) { e.preventDefault(); if (confirm('Delete this saved calculation?')) deleteSaved(sdel.dataset.savedel); return; }
    const slload = e.target.closest('[data-sl-load]');
    if (slload) { e.preventDefault(); loadLocal(slload.dataset.slLoad); return; }
    const slshare = e.target.closest('[data-sl-share]');
    if (slshare) { e.preventDefault(); shareLocal(slshare.dataset.slShare); return; }
    const slsync = e.target.closest('[data-sl-sync]');
    if (slsync) { e.preventDefault(); syncLocal(slsync.dataset.slSync); return; }
    const sldel = e.target.closest('[data-sl-del]');
    if (sldel) { e.preventDefault(); if (confirm('Delete this local save?')) deleteLocal(sldel.dataset.slDel); return; }
    const slexp = e.target.closest('[data-sl-export]');
    if (slexp) { e.preventDefault(); exportLocalSaves(); return; }
    const slimp = e.target.closest('[data-sl-import]');
    if (slimp) { e.preventDefault(); importLocalSavesClick(); return; }
    const send = e.target.closest('[data-sendbuild]');
    if (send) {
      e.preventDefault();
      if (!bpProgPinCurrent()) status('Nothing to send — run a calculation first.');
      return;
    }
  });
  $('invGo').onclick = invCompare;
  $('invQueueBom').onclick = () => { if (!invQueue.length) return; const lines = invQueue.map(q => q.d.runsNeeded + ' x ' + q.t2 + ' (' + q.d.name + ')'); window.open(appraisalURL(lines), '_blank', 'noopener'); };
  if ($('bomExport')) $('bomExport').onclick = exportBomCSV;
  // Bill of Materials collapse (persisted, independent of the Build List toggle)
  if ($('toggleBomOpen')) $('toggleBomOpen').onclick = () => bomToggleOpen();
  try { bomApplyOpen(localStorage.getItem('bvBomOpen') !== '0'); } catch {}
  if ($('clearOwnFlags')) $('clearOwnFlags').onclick = ownClearAll;
  if ($('buildExport')) $('buildExport').onclick = exportBuildCSV;
  if ($('shopExport')) $('shopExport').onclick = exportShoppingCSV;
  if ($('shareCalc')) $('shareCalc').onclick = shareCurrent;
  if ($('saveCalc')) $('saveCalc').onclick = saveCurrent;
  // Account saves are fetched lazily when the Ledger tab opens (see init tab handler).
  $('ledgerExport').onclick = () => { const l = ledRead(); if (!l.length) return; const csv = 'ts,blueprint,runs,cost,revenue,profit,hub\n' + l.map(e => [new Date(e.ts).toISOString(), '"' + e.bp + '"', e.runs, e.cost, e.revenue, e.profit, e.hub].join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'bv-ledger.csv'; a.click(); };
  $('ledgerClear').onclick = () => { localStorage.removeItem('bvLedger'); renderLedger(); };
});
})();
