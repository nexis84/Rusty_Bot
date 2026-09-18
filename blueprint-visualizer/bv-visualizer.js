// Blueprint Visualizer V1 — calculator + tree + BOM + handoffs + blueprints/invention/ledger
(function () {
'use strict';
const ESI = 'https://esi.evetech.net/latest';
const D = window.BV_DATA, DEF = D.defaults;
const $ = id => document.getElementById(id);
const fmtISK = n => (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US') + ' ISK';
const fmtN = n => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');
const nameCache = new Map(), priceCache = new Map(), bpCache = new Map();
// SDE-derived set of every type ID used as a manufacturing/reaction material (bv-materials.js)
const BV_MATERIALS = (() => { try { return new Set((window.BV_MATERIAL_IDS || []).map(Number)); } catch { return new Set(); } })();
const BV_MAT_NAMES = (() => { try { return new Map((window.BV_MATERIAL_NAMES || []).map(([id, n]) => [+id, n])); } catch { return new Map(); } })();

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
function isMineral(typeId) { try { return !!(D.minerals && D.minerals[typeId]); } catch { return false; } }
// Ice products (isotopes, ozone, heavy water, strontium) resolve at runtime — see ensureIceProducts.
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
function isMineable(typeId) { try { if (isMineral(typeId)) return true; return iceProductIds.has(+typeId); } catch { return false; } }
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
  });
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
  throw new Error(bp.length > 1 ? 'Multiple matches (' + bp.map(b => b.name).slice(0, 5).join('; ') + '). Be more specific.' : 'Blueprint not found for "' + name + '"');
}
async function blueprintData(typeId) {
  if (bpCache.has(typeId)) return bpCache.get(typeId);
  try { const b = await fetchJSON(ESI + '/universe/blueprints/' + typeId + '/'); bpCache.set(typeId, b); return b; }
  catch { const b = await fetchJSON('https://ref-data.everef.net/blueprints/' + typeId); bpCache.set(typeId, b); return b; }
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
const S = { root: null, nodes: new Map(), bom: [], product: null, trackedPrice: null, own: {} };
// drill-down navigation: breadcrumb trail of {bp, runs}; pendingNeed scales runs on entry
const navStack = [];
let pendingNeed = null;

// ---- main calculate ----
async function calculate() {
  savePrefs();
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
  status('Fetching blueprint ' + bpRef.name + ' (' + bpRef.id + ')…');
  let bp; try { bp = await blueprintData(bpRef.id); } catch (e) { status('Blueprint data unavailable: ' + e.message); return; }
  let mats = bp.activities?.manufacturing?.materials; mats = Array.isArray(mats) ? mats : (mats ? Object.values(mats) : []);
  if (!mats.length) { status('No manufacturing materials.'); return; }
  let prods = bp.activities.manufacturing.products; prods = Array.isArray(prods) ? prods : (prods ? Object.values(prods) : []);
  const prod = prods[0] || null;
  if (pendingNeed) { runs = Math.max(1, Math.ceil(pendingNeed / ((prod && prod.quantity) || 1))); $('runs').value = runs; pendingNeed = null; }
  S.product = prod ? { type_id: prod.type_id, qty: prod.quantity || 1, name: await typeName(prod.type_id) } : null;
  S.nodes.clear(); S.bom = [];
  S.reactionsOn = ($('reactions').value === 'on');
  // build tree depth 1 (+ async depth 2 lookup, non-blocking for totals)
  S.root = { bpId: bpRef.id, bpName: bpRef.name, mode: 'build', children: [] };
  for (const m of mats) {
    const baseQty = m.quantity || 0;
    const perRun = Math.max(0, Math.ceil(baseQty * (1 - meEff / 100)));
    const nm = await typeName(m.type_id);
    S.root.children.push({ type_id: m.type_id, name: nm, baseQty, perRun, mode: 'buy', child: null, unitSell: null, unitBuy: null, childCost: null });
  }
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
  pushLedger({ ts: Date.now(), bp: bpRef.name, bpId: bpRef.id, runs, cost: Math.round(totalCash), revenue: Math.round(revenue), profit: Math.round(profitCash), hub: region, mined: Math.round(cash.mined) });
  // async: resolve sub-blueprints for buildable children
  enrichChildren(runs);
  status('Done. Toggle Build/Buy on sub-components; sub-BOMs resolve in background.');
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
function reactRunsNeeded(c) {
  if (!c.reaction || !c.reaction.productQty) return 0;
  return Math.ceil((c.perRun * (S.runs || 1)) / c.reaction.productQty);
}
async function enrichChildren(runs) {
  S.runs = runs;
  const rxOn = S.reactionsOn;
  for (const c of S.root.children) {
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
        renderTree(runs);
      }
    }
  }
  const nRx = S.root.children.filter(c => c.reaction).length;
  renderBom(runs);
  status('Done. Toggle Build/Buy' + (nRx ? '/React' : '') + ' on sub-components' + (nRx ? ' (' + nRx + ' reaction' + (nRx > 1 ? 's' : '') + ' found)' : '') + '.');
}

function effLeafCost(runs) {
  // BOM uses Build/Buy/React modes. React expands into its reagents (rounded up to whole reaction runs).
  const out = [];
  for (const c of S.root.children) {
    if (c.mode === 'build' && c.child) { out.push({ type_id: c.type_id, name: c.name + ' (built)', qty: c.perRun * runs, unit: c.child.subCost / Math.max(1, c.perRun), total: c.child.subCost * runs, mode: 'build' }); }
    else if (c.mode === 'react' && c.reaction) {
      const n = reactRunsNeeded(c);
      for (const rg of c.reaction.reagents) {
        out.push({ type_id: rg.type_id, name: rg.name + ' (react: ' + c.name + ')', qty: rg.quantity * n, unit: rg.unit || 0, total: (rg.unit || 0) * rg.quantity * n, mode: 'react' });
      }
    }
    else {
      const u = $('basis').value === 'buy' ? c.unitBuy : c.unitSell;
      out.push({ type_id: c.type_id, name: c.name, qty: c.perRun * runs, unit: u || 0, total: (u || 0) * c.perRun * runs, mode: c.mode });
    }
  }
  return out;
}

// cash vs mined split of the current BOM: mined lines cost no ISK out of pocket
function bomCashSplit() {
  let cash = 0, mined = 0;
  for (const l of (S.bom || [])) {
    if (l.mode === 'mine') mined += l.total || 0;
    else cash += l.total || 0;
  }
  return { cash, mined };
}

function renderSummary(s) {
  S.lastCalc = s;
  const g = $('summaryGrid'); g.style.display = 'grid';
  const brokName = (D.hubs.find(h => h.region === hub()) || {}).name || hub();
  let tracked = '';
  if (S.trackedPrice && S.trackedPrice.price) {
    const tn = (D.hubs.find(h => h.region === S.trackedPrice.region) || {}).name || S.trackedPrice.region;
    tracked = '<div class="summary-card"><div class="k">Output @ ' + tn + '</div><div class="v">' + fmtISK(S.trackedPrice.price * s.outQty) + '</div></div>';
  }
  // mode-aware cash totals: mined minerals are excluded from out-of-pocket cost
  const split = bomCashSplit();
  const totalCash = split.cash + s.feePerRun * s.runs;
  const profitCash = s.revenue - s.sellFees - totalCash;
  const roiCash = totalCash > 0 ? profitCash / totalCash * 100 : 0;
  const profitFull = profitCash - split.mined;
  const roiFull = (totalCash + split.mined) > 0 ? profitFull / (totalCash + split.mined) * 100 : 0;
  const minedNote = split.mined > 0 ? ' · excl. ' + fmtISK(split.mined) + ' mined' : '';
  const oppNote = split.mined > 0 ? ' · valuing mined: ' + fmtISK(profitFull) + ' (' + roiFull.toFixed(1) + '%)' : '';
  g.innerHTML =
    '<div class="summary-card"><div class="k">Total cost (' + s.runs + 'x)</div><div class="v">' + fmtISK(totalCash) + '</div><div class="k">' + fmtISK(totalCash / Math.max(1, s.runs)) + '/run' + minedNote + '</div></div>' +
    '<div class="summary-card"><div class="k">Output revenue ' + brokName + '</div><div class="v">' + fmtISK(s.revenue) + '</div><div class="k">' + fmtN(s.outQty) + 'x @ ' + fmtISK(s.unitOut) + '</div></div>' +
    '<div class="summary-card"><div class="k">Net profit</div><div class="v ' + (profitCash >= 0 ? 'green' : 'red') + '">' + fmtISK(profitCash) + '</div><div class="k">ROI ' + roiCash.toFixed(1) + '% · fees ' + fmtISK(s.sellFees) + oppNote + '</div></div>' +
    '<div class="summary-card"><div class="k">Blueprint</div><div class="v" style="font-size:.85rem">' + s.bpName + '</div><div class="k">TE bonus ' + s.teBonus.toFixed(0) + '% · Industry ' + s.ind + '/' + s.adv + ' · ' + s.imp.name + '</div></div>' + tracked;
}

// ---- drill-down navigation (breadcrumb trail) ----
function renderCrumbs(current) {
  const bar = $('crumbBar');
  if (!S.root) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  let h = '<button class="crumb-back" data-nav="back"' + (navStack.length ? '' : ' disabled') + '><i class="fas fa-arrow-left"></i> Back</button>';
  navStack.forEach((e, i) => { h += '<button class="crumb-link" data-nav="crumb" data-i="' + i + '">' + e.bp + '</button><span class="crumb-sep">›</span>'; });
  h += '<span class="crumb-current">' + current + '</span>';
  bar.innerHTML = h;
}
function drillDown(i) {
  const c = S.root && S.root.children[i];
  if (!c || !c.child) return;
  navStack.push({ bp: $('bpName').value.trim(), runs: parseInt($('runs').value) || 1 });
  if (navStack.length > 12) navStack.shift();
  $('bpName').value = c.child.bpName;
  pendingNeed = c.perRun * (S.runs || 1);
  status('Opening ' + c.child.bpName + ' (need ' + fmtN(pendingNeed) + ')…');
  calculate();
}
function goBack() {
  const prev = navStack.pop();
  if (!prev) return;
  $('bpName').value = prev.bp; $('runs').value = prev.runs;
  pendingNeed = null;
  calculate();
}
function goCrumb(i) {
  const target = navStack[i];
  if (!target) return;
  navStack.length = i;
  $('bpName').value = target.bp; $('runs').value = target.runs;
  pendingNeed = null;
  calculate();
}

function renderTree(runs) {
  const w = $('treeWrap'); if (!S.root) { w.innerHTML = ''; return; }
  const piKids = S.root.children.filter(c => isPI(c.type_id));
  let h = (piKids.length ? '<div class="pi-banner"><i class="fas fa-globe" style="color:#3fb950"></i><span>This build uses <b>' + piKids.length + ' PI material' + (piKids.length > 1 ? 's' : '') + '</b> (' + piKids.slice(0, 3).map(c => c.name).join(', ') + (piKids.length > 3 ? ', …' : '') + '). Plan them in our <a target="_blank" rel="noopener" href="' + piURL(piKids[0].type_id) + '">PI Visualizer</a></span></div>' : '') +
    '<div class="tree-node build"><div class="row1">' + (S.product ? iconHTML(S.product.type_id, S.product.name) : '') + '<span class="nm">' + S.root.bpName + ' × ' + runs + '</span><span class="pill build">BUILD</span><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(S.root.bpId) + '" title="Price check blueprint"><i class="fas fa-chart-line"></i></a>' + (S.product ? '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(S.product.type_id) + '" title="Price check product"><i class="fas fa-box"></i></a>' + piIcon(S.product.type_id) : '') + '</div><div class="kids">';
  S.root.children.forEach((c, i) => {
    const m = c.child ? (c.child.margin >= 0 ? '<span class="margin-pos">build margin +' + fmtISK(c.child.margin) + '</span>' : '<span class="margin-neg">build margin ' + fmtISK(c.child.margin) + '</span>') : (c.child === null && c._tried ? '' : '<span class="nums">checking build…</span>');
    const rm = c.reaction ? (c.reaction.margin >= 0 ? '<span class="margin-pos">react margin +' + fmtISK(c.reaction.margin) + '/u</span>' : '<span class="margin-neg">react margin ' + fmtISK(c.reaction.margin) + '/u</span>') + (c.reaction.estimate ? '<span class="nums" title="Output quantity estimated">est</span>' : '') : '';
    const rxBtn = c.reaction ? '<button class="mode-btn ' + (c.mode === 'react' ? 'on-react' : '') + '" data-i="' + i + '" data-m="react" title="' + c.reaction.formulaName + '">React</button>' : '';
    let rxKids = '';
    if (c.mode === 'react' && c.reaction) {
      const n = reactRunsNeeded(c);
      rxKids = '<div class="kids">' + c.reaction.reagents.map(rg =>
        '<div class="rx-row"><img src="https://images.evetech.net/types/' + rg.type_id + '/icon?size=32" onerror="this.style.display=\'none\'"><span class="nm">' + rg.name + ' × ' + fmtN(rg.quantity * n) + '</span><span class="nums">' + fmtISK(rg.unit || 0) + ' ea</span><span class="nums">' + fmtISK((rg.unit || 0) * rg.quantity * n) + '</span><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(rg.type_id) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + piIcon(rg.type_id) + '</div>'
      ).join('') + '<div class="rx-note">' + c.reaction.formulaName + ' · ×' + fmtN(c.reaction.productQty) + ' per run · ' + n + ' run' + (n === 1 ? '' : 's') + ' for ' + fmtN(c.perRun * runs) + ' needed</div></div>';
    }
    const nmHtml = c.child
      ? '<a class="drill nm" data-drill="' + i + '" title="Open full build for ' + c.child.bpName + '">' + c.name + ' × ' + fmtN(c.perRun * runs) + ' <i class="fas fa-chevron-right" style="font-size:.7em"></i></a>'
      : '<span class="nm">' + c.name + ' × ' + fmtN(c.perRun * runs) + '</span>';
    h += '<div class="tree-node ' + c.mode + '"><div class="row1"><img src="https://images.evetech.net/types/' + c.type_id + '/icon?size=32" onerror="this.style.display=\'none\'">' + nmHtml + '<span class="nums">' + fmtISK((($('basis').value === 'buy' ? c.unitBuy : c.unitSell) || 0)) + ' ea</span><span class="nums">' + m + rm + '</span><span class="mode-toggle">' + (isMineable(c.type_id)
      ? '<button class="mode-btn ' + (c.mode === 'mine' ? 'on-mine' : '') + '" data-i="' + i + '" data-m="mine"><i class="fas fa-gem"></i> Mine it</button><button class="mode-btn ' + (c.mode === 'buy' ? 'on-buy' : '') + '" data-i="' + i + '" data-m="buy">Buy</button>'
      : '<button class="mode-btn ' + (c.mode === 'build' ? 'on-build' : '') + '" data-i="' + i + '" data-m="build">Build</button><button class="mode-btn ' + (c.mode === 'buy' ? 'on-buy' : '') + '" data-i="' + i + '" data-m="buy">Buy</button>' + rxBtn) + '</span><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(c.type_id) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + piIcon(c.type_id) + mineIcon(c.type_id) + (isPI(c.type_id) ? '<span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(c.type_id) + '</span>' : '') + '</div>' + rxKids + '</div>';
  });
  w.innerHTML = h + '</div></div>';
  w.querySelectorAll('.mode-btn').forEach(b => b.onclick = async () => {
    const idx = +b.dataset.i, mode = b.dataset.m;
    S.root.children[idx].mode = mode;
    renderTree(runs); await renderBom(runs); await renderBuildList(runs); if (S.lastCalc) renderSummary(S.lastCalc);
    // auto-update mining plan in the background when Mine it is toggled — do NOT switch tabs or steal focus
    if (mode === 'mine' || mode === 'buy' || isMineable(S.root.children[idx].type_id)) {
      try { planMining(undefined, { auto: true }); } catch {}
    }
  });
}

// per-item "used own" toggle — persisted; unchecked BOM lines are bought in full regardless of inventory
function ownRead() { try { return JSON.parse(localStorage.getItem('bvOwnSet') || 'null') || {}; } catch { return {}; } }
function ownUse(typeId) { return S.own[typeId] === undefined ? true : !!S.own[typeId]; }
function ownSet(typeId, val) { S.own[typeId] = !!val; try { localStorage.setItem('bvOwnSet', JSON.stringify(S.own)); } catch {} }
function ownCell(l) {
  const usable = (l.mode === 'buy' || l.mode === 'react');
  return usable
    ? '<label title="Use owned materials for this item (deduct from inventory)" style="cursor:pointer"><input type="checkbox" data-own="' + l.type_id + '"' + (ownUse(l.type_id) ? ' checked' : '') + '></label>'
    : '<input type="checkbox" disabled checked style="opacity:.35" title="Not bought — own flag not applicable">';
}
async function renderBom(runs) {
  S.bom = effLeafCost(runs);
  const tb = $('bomBody');
  await preloadVolumes(S.bom.map(l => l.type_id));
  let vol = 0; for (const l of S.bom) vol += (await typeVolume(l.type_id)) * l.qty;
  let total = 0;
  tb.innerHTML = S.bom.map(l => { total += l.total; return '<tr><td>' + l.name + (isPI(l.type_id) ? ' <span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(l.type_id) + '</span>' : '') + '</td><td>' + fmtN(l.qty) + '</td><td>' + fmtISK(l.unit) + '</td><td>' + fmtISK(l.total) + '</td><td><span class="pill ' + l.mode + '">' + l.mode.toUpperCase() + '</span></td><td style="text-align:center">' + ownCell(l) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(l.type_id) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + piIcon(l.type_id) + mineIcon(l.type_id) + '</td></tr>'; }).join('');
  $('bomMeta').textContent = S.bom.length + ' types';
  const split = bomCashSplit();
  $('bomTotals').textContent = 'Cash total ' + fmtISK(split.cash) + (split.mined > 0 ? ' (+ ' + fmtISK(split.mined) + ' mined @ market)' : '') + ' · Volume ~' + fmtN(Math.round(vol)) + ' m3 · ' + hub();
  await renderShoppingList(runs);
  await renderBuildList(runs);
  await renderRefinery();
}

async function renderBuildList(runs) {
  const wrap = $('buildList'), meta = $('buildMeta'), totals = $('buildTotals');
  if (!wrap) return;
  if (!S.root || !S.root.children) { wrap.innerHTML = '<p class="hint">No calculation yet — set materials to <b>Build</b> in the tree above.</p>'; if (meta) meta.textContent=''; if (totals) totals.textContent=''; return; }
  const builds = S.root.children.filter(c => c.mode === 'build');
  if (!builds.length) { wrap.innerHTML = '<p class="hint">Nothing set to Build — toggle <b>Build</b> on materials in the tree above. The list below will break each Build item into its raw materials.</p>'; if (meta) meta.textContent='0 items'; if (totals) totals.textContent=''; return; }
  let html = '';
  let grandTotal = 0, grandVol = 0, totalRows = 0;
  const aggregated = new Map();
  // Preload all build-list volumes in one batch (was sequential ESI per row).
  try {
    const allIds = [];
    for (const b of builds) for (const m of ((b.child && b.child.materials) || [])) allIds.push(m.type_id);
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
    const batches = Math.max(1, Math.ceil(need / Math.max(1, prodQty)));
    let subTotal = 0; let subVol = 0;
    for (const m of mats) {
      if (!m.name) { try { m.name = await typeName(m.type_id); } catch { m.name = 'Type ' + m.type_id; } }
      if (m.unit == null) { try { let p = await marketPrice(m.type_id, hub(), $('basis').value); if (p==null) p = await marketPrice(m.type_id, hub(), 'sell'); m.unit = p || 0; } catch { m.unit = 0; } }
      const qty = (m.quantity || 0) * batches;
      const tot = (m.unit || 0) * qty;
      subTotal += tot;
      subVol += (await typeVolume(m.type_id)) * qty;
      const key = m.type_id;
      if (!aggregated.has(key)) aggregated.set(key, { qty: 0, unit: m.unit||0, name: m.name || ('Type '+m.type_id) });
      aggregated.get(key).qty += qty;
    }
    grandTotal += subTotal;
    grandVol += subVol;
    totalRows += mats.length;
    html += '<details class="tree-node build" open style="margin-bottom:.6rem;padding:.6rem;background:var(--panel);border:1px solid var(--border);border-left:4px solid var(--build);border-radius:8px"><summary style="cursor:pointer;display:flex;align-items:center;gap:.6rem;list-style:none"><img src="https://images.evetech.net/types/' + c.type_id + '/icon?size=32" onerror="this.style.display=\'none\'" style="width:28px;height:28px;border-radius:4px;background:#111"><span class="nm" style="flex:1;font-weight:700">' + c.name + ' × ' + fmtN(need) + '</span><span class="pill build">BUILD</span><span class="nums">' + fmtISK(subTotal) + ' for ' + mats.length + ' raws · ×' + batches + ' batch' + (batches>1?'es':'') + '</span><span style="margin-left:auto;color:var(--text3)"><i class="fas fa-chevron-down"></i></span></summary>';
    html += '<div style="margin-top:.6rem;overflow-x:auto"><table class="bom"><thead><tr><th>Raw material</th><th>Qty</th><th>Unit price</th><th>Total price</th><th></th></tr></thead><tbody>';
    for (const m of mats) {
      const qty = (m.quantity || 0) * batches;
      const tot = (m.unit || 0) * qty;
      const clean = m.name || ('Type ' + m.type_id);
      html += '<tr><td><img src="https://images.evetech.net/types/' + m.type_id + '/icon?size=32" onerror="this.style.display=\'none\'" style="width:24px;height:24px;vertical-align:middle;margin-right:.4rem;border-radius:4px;background:#111">' + clean + (isPI(m.type_id) ? ' <span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(m.type_id) + '</span>' : '') + '</td><td>' + fmtN(qty) + '</td><td>' + fmtISK(m.unit) + '</td><td>' + fmtISK(tot) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(m.type_id) + '"><i class="fas fa-chart-line"></i></a>' + piIcon(m.type_id) + mineIcon(m.type_id) + '</td></tr>';
    }
    html += '</tbody></table></div><p class="hint" style="margin-top:.4rem">' + child.bpName + ' · product ×' + prodQty + ' per run · ' + mats.length + ' raws · subtotal ' + fmtISK(subTotal) + ' · <a class="mkt-link" target="_blank" href="' + marketURL(c.type_id) + '">price check build</a></p></details>';
  }
  if (aggregated.size > 1 && builds.filter(c=>c.child && c.child.materials).length > 1) {
    html += '<div class="panel" style="margin-top:.6rem;background:var(--panel2)"><h4>Aggregated raw totals (' + aggregated.size + ' types across ' + builds.filter(c=>c.child).length + ' builds)</h4><div style="overflow-x:auto"><table class="bom"><thead><tr><th>Material</th><th>Total qty</th><th>Unit price</th><th>Total price</th><th></th></tr></thead><tbody>';
    let aggTotal = 0; let aggVol = 0;
    for (const [tid, v] of aggregated) {
      const tot = v.unit * v.qty;
      aggTotal += tot;
      aggVol += (await typeVolume(tid)) * v.qty;
      html += '<tr><td><img src="https://images.evetech.net/types/' + tid + '/icon?size=32" onerror="this.style.display=\'none\'" style="width:24px;height:24px;vertical-align:middle;margin-right:.4rem;border-radius:4px;background:#111">' + v.name + '</td><td>' + fmtN(v.qty) + '</td><td>' + fmtISK(v.unit) + '</td><td>' + fmtISK(tot) + '</td><td><a class="mkt-link" target="_blank" href="' + marketURL(tid) + '"><i class="fas fa-chart-line"></i></a>' + piIcon(tid) + mineIcon(tid) + '</td></tr>';
    }
    html += '</tbody></table></div><p class="hint" style="margin-top:.4rem">Combined raw cost for all Build items: ' + fmtISK(aggTotal) + ' · Volume ~' + fmtN(Math.round(aggVol)) + ' m³</p></div>';
    grandTotal = aggTotal;
    grandVol = aggVol;
  }
  wrap.innerHTML = html;
  if (meta) meta.textContent = builds.length + ' item' + (builds.length>1?'s':'') + ' to build' + (builds.filter(c=>!c.child).length ? ' · ' + builds.filter(c=>!c.child).length + ' loading…' : '') + ' · raw ' + fmtISK(grandTotal);
  if (totals) totals.textContent = 'Raw total for Build List ' + fmtISK(grandTotal) + ' · Volume ~' + fmtN(Math.round(grandVol)) + ' m³ · ' + totalRows + ' material rows' + (aggregated.size ? ' · ' + aggregated.size + ' unique raws' : '');
}

function buildRawLines() {
  const out = [];
  if (!S.root || !S.root.children) return out;
  for (const c of S.root.children.filter(x=>x.mode==='build' && x.child && x.child.materials)) {
    const need = c.perRun * (S.runs||1);
    const prodQty = c.child.productQty || (c.child.products && c.child.products[0] && c.child.products[0].quantity) || 1;
    const batches = Math.max(1, Math.ceil(need / Math.max(1, prodQty)));
    for (const m of c.child.materials) {
      const qty = (m.quantity||0) * batches;
      const nm = m.name || ('Type ' + m.type_id);
      out.push({ type_id: m.type_id, name: nm, qty, unit: m.unit||0, total: (m.unit||0)*qty });
    }
  }
  return out;
}
function buildAggLines() {
  const map = new Map();
  for (const r of buildRawLines()) {
    const k = r.type_id;
    if (!map.has(k)) map.set(k, { type_id:k, name:r.name, qty:0, unit:r.unit });
    map.get(k).qty += r.qty;
  }
  return [...map.values()].map(v => ({ ...v, total: v.unit * v.qty }));
}

async function renderShoppingList(runs) {
  const sb = $('shoppingBody'), meta = $('shopMeta'), totals = $('shoppingTotals');
  if (!sb) return;
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
  sb.innerHTML = rows.map(r => {
    const clean = cleanName(r.l.name);
    const useOwn = doDeduct && ownUse(r.l.type_id);
    const haveTxt = useOwn ? fmtN(r.have) : '—';
    const toBuyTxt = fmtN(r.toBuy);
    const needTxt = fmtN(r.l.qty);
    const haveCls = useOwn && r.have >= r.l.qty ? ' style="color:var(--build)"' : '';
    const toBuyCls = r.toBuy === 0 ? ' style="color:var(--build)"' : '';
    return '<tr><td>' + clean + (isPI(r.l.type_id) ? ' <span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(r.l.type_id) + '</span>' : '') + (r.l.mode === 'react' ? ' <span class="pill react">REACT</span>' : '') + '</td><td>' + needTxt + '</td><td' + haveCls + '>' + haveTxt + '</td><td' + toBuyCls + '>' + toBuyTxt + '</td><td>' + fmtISK(r.unit) + '</td><td>' + fmtISK(r.totalBuy) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(r.l.type_id) + '" title="Price check"><i class="fas fa-chart-line"></i></a>' + piIcon(r.l.type_id) + ' <a class="mine-link" data-mine="' + r.l.type_id + '" title="Mining plan"><i class="fas fa-gem"></i></a></td></tr>';
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
  $('copyMultibuy').onclick = async () => { const t = multibuyLines().join('\n'); if (!t) { status('Nothing to copy (all built).'); return; } await navigator.clipboard.writeText(t); status('Multibuy copied (' + S.bom.filter(l=>l.mode==='buy'||l.mode==='react').length + ' lines).'); };
  $('appraiseBom').onclick = () => { const lines = S.bom.map(l => l.qty + ' x ' + cleanName(l.name)); if (!lines.length) return; window.open(appraisalURL(lines), '_blank', 'noopener'); };
  $('appraiseOut').onclick = () => { if (!S.product) return; window.open(appraisalURL([(S.product.qty * (parseInt($('runs').value) || 1)) + ' x ' + S.product.name]), '_blank', 'noopener'); };
  const cs = $('copyShopping'); if (cs) cs.onclick = async () => { const t = shoppingLines().join('\n'); if (!t) { status('Nothing to buy — all built/mined.'); return; } await navigator.clipboard.writeText(t); status('Shopping list copied (' + S.bom.filter(l=>l.mode==='buy'||l.mode==='react').length + ' items).'); };
  const csm = $('copyShopMultibuy'); if (csm) csm.onclick = async () => { const t = shoppingBuyLines().join('\n'); if (!t) { status('Nothing to buy — all covered by inventory.'); return; } await navigator.clipboard.writeText(t); status('Multibuy (shopping) copied (' + t.split('\n').length + ' lines — after inventory deduct).'); };
  const apS = $('appraiseShopping'); if (apS) apS.onclick = () => { const bom = S.bom || []; const shop = bom.filter(l => l.mode==='buy'||l.mode==='react'); const invAgg = stkDeductMap(); const doDeduct = ($('stkDeduct') && $('stkDeduct').checked) && Object.keys(invAgg||{}).length>0; const lines = shop.map(l => { const toBuy = (doDeduct && ownUse(l.type_id)) ? Math.max(0, l.qty - (invAgg[l.type_id]||0)) : l.qty; return toBuy>0 ? toBuy + ' x ' + cleanName(l.name) : null; }).filter(Boolean); if (!lines.length) { status('Nothing to appraise — all built/mined/owned.'); return; } window.open(appraisalURL(lines), '_blank', 'noopener'); };
  const cb = $('copyBuildList'); if (cb) cb.onclick = async () => { const lines = buildRawLines(); if (!lines.length) { status('Nothing to build — set items to Build.'); return; } const t = lines.map(r => r.name + ' x' + fmtN(r.qty) + ' — ' + fmtISK(r.unit) + ' ea = ' + fmtISK(r.total)).join('\n'); await navigator.clipboard.writeText(t); status('Build list copied (' + lines.length + ' raws).'); };
  const cbm = $('copyBuildMultibuy'); if (cbm) cbm.onclick = async () => { const agg = buildAggLines(); if (!agg.length) { status('Nothing to build.'); return; } const t = agg.map(v => v.name + ' x' + fmtN(v.qty)).join('\n'); await navigator.clipboard.writeText(t); status('Build multibuy copied (' + agg.length + ' types).'); };
  const ab = $('appraiseBuildList'); if (ab) ab.onclick = () => { const agg = buildAggLines(); if (!agg.length) { status('Nothing to build.'); return; } const lines = agg.map(v => v.qty + ' x ' + v.name); window.open(appraisalURL(lines), '_blank', 'noopener'); };
  const tb = $('toggleBuildExpand'); if (tb) tb.onclick = () => { const ds = document.querySelectorAll('#buildList details'); if (!ds.length) return; const anyClosed = [...ds].some(d=>!d.open); ds.forEach(d=>d.open = anyClosed); tb.innerHTML = anyClosed ? '<i class="fas fa-compress"></i> Collapse' : '<i class="fas fa-expand"></i> Expand'; };
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
      const t = BVAuth.tokens();
      if (!t) return null;
      const v = await (await fetch('https://login.eveonline.com/oauth/verify', { headers: { Authorization: 'Bearer ' + t.access_token } })).json();
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
  return '<div style="display:flex;gap:.4rem;align-items:center;padding:.25rem 0;border-bottom:1px solid var(--border)"><span style="flex:1"><b data-bpname="' + b.type_id + '">' + nm + '</b> <span class="pill">' + tag + '</span> · ME' + b.material_efficiency + '/TE' + b.time_efficiency + locHtml + '</span><button class="mode-btn" data-bp="' + b.type_id + '" data-me="' + b.material_efficiency + '" data-te="' + b.time_efficiency + '" data-runs="' + (b.runs > 0 ? b.runs : '') + '" data-bpo="' + (bpIsBPO(b) ? '1' : '') + '">Load</button></div>';
}
function bindBpLoadButtons(box) {
  box.querySelectorAll('[data-bp]').forEach(btn => btn.onclick = async () => {
    $('me').value = Math.min(10, +btn.dataset.me || 0); $('te').value = Math.min(20, +btn.dataset.te || 0);
    if (!btn.dataset.bpo && +btn.dataset.runs > 0) $('runs').value = +btn.dataset.runs;
    $('bpName').value = await typeName(+btn.dataset.bp);
    document.querySelector('[data-tab="calc"]').click();
    savePrefs();
    status('Loading ' + $('bpName').value + ' (ME' + $('me').value + '/TE' + $('te').value + ( $('runs').value ? ' ×' + $('runs').value : '' ) + ')…');
    await calculate();
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
    out.innerHTML = '<p class="hint">' + t2.name + ' (' + t2.id + ') · base ' + (D.t2BaseChance * 100).toFixed(0) + '% · target ' + target + ' BPCs <a class="mkt-link" target="_blank" href="' + marketURL(t2.id) + '"><i class="fas fa-chart-line"></i></a></p>' +
      rows.map((d, i) => '<div style="display:flex;gap:.4rem;align-items:center;padding:.3rem 0;border-bottom:1px solid var(--border)"><span style="flex:1">' + d.name + ' · ' + (d.chance * 100).toFixed(1) + '% · runs ' + d.runsNeeded + ' · ME' + d.me + '/TE' + d.te + '</span><button class="mode-btn" data-q="' + i + '">Queue</button></div>').join('');
    out.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { invQueue.push({ t2: t2.name, t2id: t2.id, d: rows[+b.dataset.q], target }); renderQueue(); });
  } catch (e) { out.textContent = 'Failed: ' + e.message; }
}
function renderQueue() {
  $('invQueue').innerHTML = invQueue.length ? invQueue.map((q, i) => '<div>' + (i + 1) + '. ' + q.t2 + ' × ' + q.target + ' via ' + q.d.name + ' (' + q.d.runsNeeded + ' runs) <a class="mkt-link" target="_blank" href="' + marketURL(q.t2id) + '"><i class="fas fa-chart-line"></i></a></div>').join('') : 'Nothing queued yet.';
}

// ---- Ledger ----
function ledRead() { try { return JSON.parse(localStorage.getItem('bvLedger') || '[]'); } catch { return []; } }
function pushLedger(e) { const l = ledRead(); l.unshift(e); try { localStorage.setItem('bvLedger', JSON.stringify(l.slice(0, 200))); } catch {} renderLedger(); }
function renderLedger() {
  const l = ledRead(); const box = $('ledgerList'); if (!box) return;
  box.innerHTML = l.length ? l.slice(0, 30).map(e => '<div style="padding:.3rem 0;border-bottom:1px solid var(--border)">' + new Date(e.ts).toLocaleString() + ' · <b>' + e.bp + '</b> ×' + e.runs + ' · profit ' + fmtISK(e.profit) + ' <a class="mkt-link" target="_blank" href="' + marketURL(e.bpId, e.hub) + '"><i class="fas fa-chart-line"></i></a> <a class="mkt-link" href="#bv=' + btoa(JSON.stringify({ bp: e.bp, runs: e.runs })) + '" title="Shareable link"><i class="fas fa-link"></i></a></div>').join('') : '<p class="hint">No entries yet — run a calculation.</p>';
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
  attachAutocomplete('bpName', 'bpSuggest', { source: 'blueprints' });
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
  // 2) minerals / ice products inside sub-components set to Build (BOM only shows one "(built)" line for these)
  const runs = S.runs || 1;
  for (const c of ((S.root && S.root.children) || [])) {
    if (c.mode === 'build' && c.child && c.child.materials) {
      for (const m of c.child.materials) {
        if (!isMineable(m.type_id)) continue;
        needs[m.type_id] = (needs[m.type_id] || 0) + (m.quantity || 0) * runs;
      }
    }
  }
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
      g.sources.push({ ore: r.ore, qty: r.oreQty });
      g.total += r.yield;
      for (const l of r.locs) g.locs.add(l);
    }
    wrap.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-industry"></i> Refinery <span class="pill" style="margin-left:.5rem">' + srcLabel + (locName ? ' @ ' + locName : '') + '</span></h3>' +
      '<p class="hint">' + (anyCompressed ? 'Compressed ore / ice included — un-compress at a structure before refining. ' : '') + 'Materials ticked <b>Use own</b> come from your ore / compressed ore / ice, refined at ' + Math.round(eff * 100) + '%. Each material combines every ore / ice stack you own that refines into it.</p>' +
      '<div style="overflow-x:auto"><table class="bom"><thead><tr><th>Material</th><th>Need</th><th>From your ore</th><th>Total refines to</th><th>Location</th></tr></thead><tbody>' +
      [...groups.values()].map(g => {
        const covered = g.total >= g.need;
        const sources = g.sources.map(s => s.ore + ' ×' + fmtN(s.qty)).join(' · ');
        const locsTxt = g.locs.size ? [...g.locs].slice(0, 2).join(', ') + (g.locs.size > 2 ? ' +' + (g.locs.size - 2) : '') : '<span class="nums">—</span>';
        return '<tr><td><b>' + g.mineral + '</b></td><td>' + fmtN(g.need) + '</td><td>' + sources + '</td><td' + (covered ? ' style="color:var(--build)"' : '') + '>' + g.mineral + ' ×' + fmtN(g.total) + (covered ? ' <span style="color:var(--build)">✓ covers</span>' : ' <span style="color:var(--danger)">short ' + fmtN(g.need - g.total) + '</span>') + '</td><td>' + locsTxt + '</td></tr>';
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
  say('Loading ore + ice yields (live SDE, cached for a week)…');
  await new Promise(r => setTimeout(r, 30)); // let the spinner paint before the network storm
  const ores = (await Promise.all(D.ores.map(o => fetchOre(o.id).catch(() => null)))).filter(Boolean);
  const sources = ores.concat(iceOreList || []);
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
  h += '<h4>Mine this (covers ' + perMin.length + '/' + Object.keys(needs).length + ' materials)</h4><div style="overflow-x:auto"><table class="bom"><thead><tr><th>Source</th><th>For</th><th>Units</th><th>Volume</th><th>Time</th><th></th></tr></thead><tbody>' +
    merged.map(g => '<tr><td><b>' + g.ore.name + '</b></td><td>' + g.for.join(', ') + '</td><td>' + fmtN(g.units) + '</td><td>' + fmtN(Math.round(g.m3)) + ' m³</td><td>' + fmtTime(g.mins) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(g.ore.id) + '"><i class="fas fa-chart-line"></i></a></td></tr>').join('') +
    '</tbody></table></div>';
  h += '<div class="summary-grid" style="margin-top:.6rem"><div class="summary-card"><div class="k">Total volume</div><div class="v">' + fmtN(Math.round(totalM3)) + ' m³</div></div>' +
    '<div class="summary-card"><div class="k">Total mining time</div><div class="v">' + fmtTime(totalMins) + '</div></div>' +
    '<div class="summary-card"><div class="k">Material value</div><div class="v">' + fmtISK(totalValue) + '</div><div class="k">' + fmtISK(totalMins > 0 ? totalValue / (totalMins / 60) : 0) + '/hr implied</div></div></div>';
  h += '</div>'; // close the main mining-plan panel
  // Fastest source detail — its own section
  h += '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-search"></i> Fastest source per material (detail)</h3><p class="hint" style="margin-top:.2rem">Pick the rock you can actually mine — e.g. Megacyte: Arkonor (333-366) → Bistot (170-187) → Spodumain (140-154). Changing the dropdown recalculates the volume/time above.</p><div style="overflow-x:auto"><table class="bom"><thead><tr><th>Material</th><th>Need</th><th>Source</th><th>Units</th><th>Volume</th><th>Time</th><th></th></tr></thead><tbody>' +
    perMin.map(p => {
      const opts = (p.ranked || []).map(r => '<option value="' + r.ore.id + '"' + (r.ore.id===p.chosenId?' selected':'') + '>' + r.ore.name + ' — ' + fmtN(r.units) + ' units · ' + fmtN(Math.round(r.m3)) + ' m³ · ' + fmtTime(r.mins) + ' (' + fmtN(r.y) + '/portion)</option>').join('');
      const yieldHint = p.y ? ' ('+fmtN(p.y)+'/portion)' : '';
      return '<tr><td>' + p.name + '</td><td>' + fmtN(p.need) + '</td><td><select data-mine-choice="' + p.mid + '" style="background:#141414;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:.3rem .4rem;font-family:inherit;font-size:.82rem;max-width:260px">' + opts + '</select><span class="nums">' + yieldHint + '</span></td><td>' + fmtN(p.units) + '</td><td>' + fmtN(Math.round(p.m3)) + ' m³</td><td>' + fmtTime(p.mins) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(p.ore.id) + '"><i class="fas fa-chart-line"></i></a></td></tr>';
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
// Manual structure -> system overrides (localStorage bvStructOverrides).
// Covers citadels ESI 403s despite in-game docking access (new/dead structures
// 403 by design) — the user knows where their stuff is, ESI won't say.
let stkUnresolvedLocs = [];
// Per-structure failure reasons for the mapping panel: [Forbidden] vs queued.
// Reset each scan; 403 denials persist separately (1h stamps).
let stkLocErr = {};
function stkLocReason(id) {
  try {
    const denied = bvDeniedRead();
    if (denied && denied[String(id)] && Date.now() - denied[String(id)] < 3600e3)
      return '[Forbidden] — ESI denied access (no ESI docking rights)';
    if (stkLocErr[String(id)]) return 'Lookup failed (ESI ' + stkLocErr[String(id)] + ')';
  } catch {}
  return 'Queued — over the 25/scan cap, retries on a later scan';
}
function stkOverrideRead() { try { const v = JSON.parse(localStorage.getItem('bvStructOverrides') || '{}'); return (v && typeof v === 'object') ? v : {}; } catch { return {}; } }
function stkOverrideWrite(o) { try { localStorage.setItem('bvStructOverrides', JSON.stringify(o || {})); } catch {} }
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
    const t = window.BVAuth && BVAuth.tokens();
    if (!t || !t.access_token) return 0;
    const r = await fetch(bvBackendBase() + '/api/bv/structures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t.access_token },
      body: JSON.stringify({ structures: rows.slice(0, 200) })
    });
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
// names, 403 denials, station systems, snapshots, ore yields) from storage AND
// memory so the next scan starts completely fresh. Deliberately keeps UI prefs
// (bvPrefs), list filters, page sizes, and manual structure mappings
// (bvStructOverrides) — mappings are explicit user data with per-row remove.
const BV_SCAN_CACHE_KEYS = ['bvStructNames', 'bvStructDenied', 'bvStaSys', 'bvInventorySnapshot', 'bvOres2'];
function stkResetAllCaches() {
  try { for (const k of BV_SCAN_CACHE_KEYS) localStorage.removeItem(k); } catch {}
  try { oreCache.clear(); } catch {}
  try { stkIndustrialProbed.clear(); } catch {}
  S.inventorySnapshots = {};
  stkRaw = []; stkAgg = {}; stkAllAgg = {}; stkAggBySystem = {}; stkAggByStation = {};
  stkLocationNames = {}; stkSystems = {}; stkLocSystem = {}; stkTypeLocs = {};
  stkNames = {}; stkCustomNames = {}; stkOreDetail = []; stkLocErr = {};
  stkEnriched = []; stkEnrichedAll = []; stkTypeFlags = {}; stkContainerNames = {}; stkTypeGroups = {};
  stkUnresolvedLocs = []; stkPage = 1; stkDetailPage = 1;
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
function stkSnapshotAggForSource() {
  try {
    if (stkIndustrialOnly() && stkEnrichedAll.length) {
      const rows = stkFilteredAgg();
      if (rows && rows.length) {
        const map = {};
        for (const r of rows) map[r.typeId] = (map[r.typeId] || 0) + r.qty;
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
// Unresolved-structures mapping panel: ESI 403s structures it won't identify
// (no ESI docking access, new types, dead structures 403 by design). The user
// knows where their stuff is — map structure ID -> system, persisted locally,
// applied at the next scan. Full IDs shown (suffixes collide across owners).
function attachOvSysComplete(input) {
  let box = input.parentElement.querySelector('[data-ovsysbox]');
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('data-ovsysbox', '');
    box.className = 'suggest hidden';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(box);
  }
  let current = [], deb = null;
  function close() { box.classList.add('hidden'); box.innerHTML = ''; current = []; }
  function render(q) {
    if (!q || q.length < 2) { close(); return; }
    const pool = ((typeof Systems !== 'undefined') ? Systems : []) || [];
    current = pool.map(s => ({ id: s.id, name: s.name, sc: bvScore(s.name, q) }))
      .filter(c => c.sc > 0).sort((a, b) => b.sc - a.sc || a.name.localeCompare(b.name)).slice(0, 8);
    if (!current.length) { close(); return; }
    box.innerHTML = current.map((c, i) => '<div class="suggest-item" data-i="' + i + '"><span class="t">' + highlight(c.name, q) + '</span><span class="s">' + c.id + '</span></div>').join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.suggest-item').forEach(el => {
      el.onmousedown = e => { e.preventDefault(); const c = current[+el.dataset.i]; if (!c) return; input.value = c.name; input.dataset.pickedId = String(c.id); close(); };
    });
  }
  input.addEventListener('input', () => { delete input.dataset.pickedId; clearTimeout(deb); deb = setTimeout(() => render(input.value.trim().toLowerCase()), 120); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) render(input.value.trim().toLowerCase()); });
  document.addEventListener('click', e => { if (!box.classList.contains('hidden') && !box.contains(e.target) && e.target !== input) close(); });
}
function stkResolveSysInput(input) {
  try {
    if (input.dataset.pickedId) return String(input.dataset.pickedId);
    const q = (input.value || '').trim().toLowerCase();
    if (!q) return null;
    const pool = ((typeof Systems !== 'undefined') ? Systems : []) || [];
    const exact = pool.find(s => (s.name || '').toLowerCase() === q);
    if (exact) return String(exact.id);
  } catch {}
  return null;
}
function renderStkOverrides() {
  const box = $('stkUnresolved');
  if (!box) return;
  const ov = stkOverrideRead();
  const mappedIds = Object.keys(ov);
  const open = (stkUnresolvedLocs || []).filter(e => ov[e.id] == null);
  if (!mappedIds.length && !open.length) { box.innerHTML = ''; return; }
  let h = '';
  if (open.length) {
    const bulkSys = (!stkAllSystems() && stkSysId()) ? stkSysId() : null;
    h += '<div class="panel" style="margin-top:.6rem"><h4><i class="fas fa-question-circle"></i> Unresolved structures (' + open.length + ') — ESI 403, system unknown</h4>'
      + '<p class="hint">Citadels ESI won\'t identify (no ESI docking access, new or dead structures). If you know where one lives, map it — it joins the next scan. Full IDs shown because suffixes collide.</p>'
      + (bulkSys ? '<div style="margin:.3rem 0 .5rem"><button class="calc-btn" data-mapall="' + bulkSys + '"><i class="fas fa-map-marked-alt"></i> Map all ' + open.length + ' to ' + stkSysIdName(bulkSys) + '</button> <span class="hint">You said you dock anywhere here — one click records every ID above as this system. Mappings stay editable below.</span></div>' : '')
      + open.slice(0, 50).map(e => '<div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;padding:.3rem 0;border-bottom:1px solid var(--border)">'
        + '<span class="nums" title="Full location ID">' + e.id + (e.customName ? ' · <b>' + String(e.customName).replace(/</g, '&lt;') + '</b>' : '') + '<br><span style="opacity:.75">' + e.reason + '</span></span>'
        + '<span style="flex:1;min-width:140px">' + e.stacks + ' stacks · ' + fmtN(e.qty) + ' units · ' + e.top.map(t => t.name + ' ×' + fmtN(t.qty)).join(', ') + '</span>'
        + '<span style="display:inline-flex;gap:.3rem;align-items:center;position:relative"><input class="form-input" data-ovsys="' + e.id + '" placeholder="System…" autocomplete="off" style="width:150px"><button class="mode-btn" data-map="' + e.id + '">Map</button></span>'
        + '</div>').join('')
      + (open.length > 50 ? '<p class="hint">Showing 50 of ' + open.length + ' — map these and rescan for more.</p>' : '') + '</div>';
  }
  if (mappedIds.length) {
    h += '<div class="panel" style="margin-top:.6rem"><h4><i class="fas fa-map-marked-alt"></i> Mapped structures (' + mappedIds.length + ')</h4>'
      + mappedIds.map(id => '<div style="display:flex;gap:.4rem;align-items:center;padding:.2rem 0;border-bottom:1px solid var(--border)"><span class="nums">' + id + '</span><span style="flex:1">→ ' + stkSysIdName(String(ov[id])) + '</span><button class="mode-btn" data-unmap="' + id + '" title="Remove mapping" style="color:var(--danger)"><i class="fas fa-times"></i></button></div>').join('') + '</div>';
  }
  box.innerHTML = h;
  box.querySelectorAll('input[data-ovsys]').forEach(inp => attachOvSysComplete(inp));
  box.querySelectorAll('[data-map]').forEach(btn => btn.onclick = () => {
    const row = btn.closest('div');
    const inp = row ? row.querySelector('input[data-ovsys]') : null;
    const sysId = inp ? stkResolveSysInput(inp) : null;
    if (!sysId) { status('Pick a system from the dropdown first.'); return; }
    const o = stkOverrideRead();
    o[btn.dataset.map] = sysId;
    stkOverrideWrite(o);
    status('Mapped ' + btn.dataset.map + ' → ' + stkSysIdName(sysId) + ' — rescanning…');
    loadInventory();
  });
  box.querySelectorAll('[data-unmap]').forEach(btn => btn.onclick = () => {
    const o = stkOverrideRead();
    delete o[btn.dataset.unmap];
    stkOverrideWrite(o);
    status('Mapping removed — rescanning…');
    loadInventory();
  });
  const mapAll = box.querySelector('[data-mapall]');
  if (mapAll) mapAll.onclick = () => {
    const sysId = mapAll.dataset.mapall;
    if (!sysId) return;
    const o = stkOverrideRead();
    let n = 0;
    for (const e of ((stkUnresolvedLocs || []).filter(x => o[x.id] == null))) {
      o[e.id] = sysId;
      n++;
    }
    stkOverrideWrite(o);
    status('Mapped ' + n + ' structures → ' + stkSysIdName(sysId) + ' — rescanning…');
    loadInventory();
  };
}
function stkDetailFiltered() {
  const q = (($('stkSearch') && $('stkSearch').value) || '').trim().toLowerCase();
  let out = stkEnriched;
  if (q) out = out.filter(e => e._searchText.includes(q) || String(e.type_id).includes(q) || e._systemText.includes(q) || stkTypeName(e.type_id).toLowerCase().includes(q));
  if (stkIndustrialOnly()) out = out.filter(e => isIndustrialMaterial(e.type_id));
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
  if (stkIndustrialOnly()) entries = entries.filter(e => isIndustrialMaterial(e.typeId));
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
  } catch {}
}
function stkProgressDone(msg) {
  try {
    const wrap = $('stkProgWrap'), bar = $('stkBar'), lab = $('stkBarLabel');
    if (bar) bar.style.width = '100%';
    if (lab) lab.textContent = msg || 'Done.';
    setTimeout(() => { try { wrap.style.display = 'none'; if (bar) bar.style.width = '0%'; } catch {} }, 5000);
  } catch {}
  stkProgStart = 0;
}
function stkProgressHide() {
  try {
    const wrap = $('stkProgWrap'), bar = $('stkBar');
    if (wrap) wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
  } catch {}
  stkProgStart = 0;
}
function renderStkRows() {
  const box = $('stkList'), totals = $('stkTotals'); if (!box) return;
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
      h += '<tr><td>' + icon + nm + '</td><td>' + fmtN(r.qty) + '</td><td>' + sys + '</td></tr>';
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
  if (!window.BVAuth || !BVAuth.signedIn()) { if(box) box.innerHTML='<p class="hint">Sign in with SSO first (needs esi-assets.read_assets.v1 / read_corporation_assets.v1). Tokens without the new scope need a re-login.</p>'; return; }
  const allSystems = stkAllSystems();
  if (!stkSysId() && !allSystems) { if (st) st.textContent = 'Pick a build system first, or enable all-systems search.'; if (box) box.innerHTML = '<p class="hint">Type your build system above, pick it from the list, or enable <b>Search all personal systems</b>.</p>'; return; }
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
    stkLocErr = {};
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
            else {
              const m = emsg.match(/ESI\s+(\d{3})/);
              try { stkLocErr[String(id)] = m ? m[1] : 'error'; } catch {}
            }
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
    // trusted as the selected system. If ESI cannot resolve a structure
    // (403 / no docking access), its stacks are skipped as inaccessible.
    if (staSysChanged) { try { localStorage.setItem('bvStaSys', JSON.stringify(staSysCache)); } catch {} }
    // Manual overrides win over ESI silence: structure IDs the user mapped to
    // a system are attributed directly (checked before the scope loop below).
    let mappedCount = 0;
    try {
      const ov = stkOverrideRead();
      for (const id of topLocIds) {
        if (!locSys[id] && ov[id] != null && String(ov[id]).trim() !== '') {
          locSys[id] = +ov[id];
          if (Number.isFinite(locSys[id])) mappedCount++;
          else delete locSys[id];
        }
      }
    } catch {}
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
    // ---- detail the still-unresolved structures for the manual mapping panel ----
    try {
      stkUnresolvedLocs = [];
      const byLoc = {};
      for (const a of assets) {
        if (!a || !a.type_id) continue;
        const _t = stationFor(a);
        if (_t == null) continue;
        const id = String(_t);
        if (+id >= 1e12 && !locSys[id]) {
          const e = (byLoc[id] = byLoc[id] || { stacks: 0, qty: 0, types: {} });
          e.stacks++;
          const q = Number(a.quantity) || 0;
          e.qty += q;
          e.types[a.type_id] = (e.types[a.type_id] || 0) + q;
        }
      }
      for (const [id, e] of Object.entries(byLoc)) {
        const top = Object.entries(e.types).sort((x, y) => y[1] - x[1]).slice(0, 3)
          .map(([t, q]) => ({ typeId: +t, qty: q, name: stkNames[+t] || BV_MAT_NAMES.get(+t) || ('Type ' + t) }));
        stkUnresolvedLocs.push({ id, stacks: e.stacks, qty: e.qty, top, reason: stkLocReason(id) });
      }
      stkUnresolvedLocs.sort((a, b) => b.qty - a.qty);
    } catch (e) { console.warn('[BV] unresolved detail failed', e); }
    // Panel renders after custom names arrive (below) so named ships/cans show names.
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
    try {
      for (const u of (stkUnresolvedLocs || [])) {
        try { if (stkCustomNames[String(u.id)]) u.customName = stkCustomNames[String(u.id)]; } catch {}
      }
      renderStkOverrides();
    } catch (e) { console.warn('[BV] overrides render failed', e); }
    // ---- build per-stack enriched (assest test pattern) for flag/item search & detail table ----
    try { buildStkEnriched(assets, idToAsset, locSys, stkLocationNames); stkDetailPage = 1; } catch(e) { console.warn('[BV] buildStkEnriched failed', e); }
    // ---- ore/compressed-ore/ice/moon/gas -> refined minerals at Refining yield % + keep snapshot in memory ----
    stkProgress(0.96, 'Building snapshot…');
    await buildInventorySnapshot(stkSnapshotAggForSource());
    const skippedMsg = skippedInaccessible ? ' · ' + skippedInaccessible + ' stacks skipped (structures you can\u2019t access)' : '';
    const wrongSysMsg = skippedWrongSystem ? ' · ' + skippedWrongSystem + ' stacks in other systems' : '';
    const scanScope = allSystems ? 'all personal systems' : stkSysIdName(stkSysId());
    if (st) st.textContent = (stkCorpWarn ? stkCorpWarn + ' · ' : '') + (structWarn ? structWarn + ' · ' : '') + 'as ' + scanWho + (scanCorp ? ' (' + scanCorp + ')' : '') + ' · ' + scanScope + ': ' + assets.length + ' stacks (' + stkPagesFatched + ' page' + (stkPagesFatched===1?'':'s') + ') → ' + Object.keys(stkAggByStation).length + ' locations · ' + Object.keys(stkAgg).length + ' types · ' + Object.keys(stkAgg).filter(id=>isIndustrialMaterial(+id)).length + ' industrial' + skippedMsg + (allSystems ? '' : wrongSysMsg) + (mappedCount ? ' · ' + mappedCount + ' manually mapped' : '') + (sharedHits ? ' · ' + sharedHits + ' via shared cache' : '') + (stkOreDetail.length ? ' · ' + stkOreDetail.length + ' ore refined @ ' + Math.round(stkRefineEff*100) + '%' : '') + (bvEsiLimited ? ' · ESI rate-limited — some names show as Type IDs, rescan in a minute' : '') + ' — snapshot kept, deducting from Shopping/Build/Mining.';
    renderStkRows();
    await renderRefinery();
    // auto-apply to shopping list if checkbox was already checked and a calc exists
    if ($('stkDeduct') && $('stkDeduct').checked && S.root) { await renderShoppingList(S.runs||1); }
    stkProgressDone('Scan complete — ' + Object.keys(stkAgg).length + ' types in scope.');
  } catch(e) {
    if (box) box.textContent = 'Failed: ' + e.message;
    if (st) st.textContent = e.message;
    stkProgressHide();
  } finally {
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
  stkPage = 1;
  applyInventoryScope().catch(() => { renderStkRows(); });
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

// ---- wire ----
document.addEventListener('DOMContentLoaded', () => {
  init(); bindHandoffs(); initAutocomplete();
  renderRefinery();
  // Resolve ice products in the background so Mine-it tags show on isotopes/ozone/water/strontium.
  ensureIceProducts().then(() => { if (S.root) { try { renderTree(S.runs || 1); renderBom(S.runs || 1); } catch {} } }).catch(() => {});
  $('calcBtn').onclick = calculate;
  $('bpName').addEventListener('keydown', e => { if (e.key === 'Enter') calculate(); });
  $('resetBtn').onclick = () => { ['bpName', 'runs', 'systemName'].forEach(k => $(k).value = k === 'runs' ? 1 : k === 'systemName' ? 'Jita' : ''); status(''); };
  $('savePreset').onclick = () => { const n = prompt('Preset name:'); if (!n) return; const pr = JSON.parse(localStorage.getItem('bvPresets') || '{}'); const ids = ['hubSelect', 'me', 'te', 'indSkill', 'advSkill', 'implant', 'structure', 'rigs', 'jobTax', 'basis', 'reactions', 'scc', 'salesTax', 'broker', 'mfgIndex', 'tracked', 'refinePct', 'mineRate', 'mineShip']; pr[n] = Object.fromEntries(ids.map(k => [k, $(k) ? $(k).value : undefined])); localStorage.setItem('bvPresets', JSON.stringify(pr)); refreshPresets(pr); status('Preset saved.'); };
  $('preset').onchange = e => { const pr = JSON.parse(localStorage.getItem('bvPresets') || '{}'); const p = pr[e.target.value]; if (p) for (const [k, v] of Object.entries(p)) if ($(k)) $(k).value = v; };
  $('reactions').onchange = () => {
    if (!S.root) return;
    S.reactionsOn = ($('reactions').value === 'on');
    if (!S.reactionsOn) S.root.children.forEach(c => { if (c.mode === 'react') c.mode = 'buy'; });
    renderTree(S.runs || 1); renderBom(S.runs || 1); if (S.lastCalc) renderSummary(S.lastCalc);
    if (S.reactionsOn) { status('Reactions ON — resolving formulas…'); enrichChildren(S.runs || 1); }
    else status('Reactions OFF — reaction materials priced from market.');
  };
  $('ssoBtn').onclick = async () => { if (window.BVAuth && BVAuth.signedIn()) { if (confirm('Sign out?')) BVAuth.logout(); return; } try { await BVAuth.login(); } catch (e) { status('SSO unavailable: ' + e.message); } };
  $('shot').onchange = e => ocrFile(e.target.files[0]);
  $('pasteShot').onclick = async () => { try { const items = await navigator.clipboard.read(); for (const it of items) { const t = it.types.find(t => t.startsWith('image/')); if (t) { ocrFile(await it.getType(t)); return; } } status('No image in clipboard.'); } catch { status('Clipboard blocked — use file picker.'); } };
  $('bpRefresh').onclick = loadBlueprints; $('bpScan').onclick = scanProfit;
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
    try { const uw = $('stkUnresolved'); if (uw) uw.innerHTML = ''; } catch {}
    stkProgressHide();
    if ($('stkList')) $('stkList').innerHTML = '<p class="hint">All scan caches cleared. Pick a system and hit Scan system for a fully fresh lookup.</p>';
    if ($('stkDetailWrap')) $('stkDetailWrap').innerHTML = '';
    if ($('stkStatus')) $('stkStatus').textContent = '';
    if ($('stkTotals')) $('stkTotals').textContent = '';
    if (S.root) { try { renderShoppingList(S.runs||1); } catch {} }
    renderRefinery();
    status('Scan caches cleared (structures, denials, snapshots, ore yields). Mappings and prefs kept.');
  };
  if ($('stkClear')) $('stkClear').onclick = () => {
    stkSnapshotClear();
    stkAgg = {}; stkAllAgg = {}; stkAggBySystem = {}; stkAggByStation = {}; stkLocationNames = {}; stkSystems = {}; stkLocSystem = {}; stkTypeLocs = {}; stkNames = {}; stkCustomNames = {}; stkOreDetail = []; stkEnriched=[]; stkEnrichedAll=[]; stkTypeFlags={}; stkContainerNames={}; stkTypeGroups={}; try { stkIndustrialProbed.clear(); } catch {}
    try { const uw = $('stkUnresolved'); if (uw) uw.innerHTML = ''; } catch {}
    stkUnresolvedLocs = [];
    stkProgressHide();
    if ($('stkList')) $('stkList').innerHTML = '<p class="hint">Cleared. Pick a system and hit Scan system.</p>';
    if ($('stkDetailWrap')) $('stkDetailWrap').innerHTML = '';
    if ($('stkStatus')) $('stkStatus').textContent = '';
    if ($('stkTotals')) $('stkTotals').textContent = '';
    if (S.root) { try { renderShoppingList(S.runs||1); } catch {} }
    renderRefinery();
    status('Inventory snapshot cleared.');
  };
  if ($('stkSource')) $('stkSource').onchange = () => { stkRaw=[]; stkAgg={}; stkAllAgg={}; stkAggBySystem={}; stkAggByStation={}; stkLocationNames={}; stkSystems={}; stkLocSystem={}; stkTypeLocs={}; stkNames={}; stkCustomNames={}; stkOreDetail=[]; stkEnriched=[]; stkEnrichedAll=[]; try { stkIndustrialProbed.clear(); } catch {} if($('stkList')) $('stkList').innerHTML='<p class="hint">Source changed — hit Scan system.</p>'; if($('stkDetailWrap')) $('stkDetailWrap').innerHTML=''; if($('stkStatus')) $('stkStatus').textContent=''; if (S.root) try{ renderShoppingList(S.runs||1); }catch{}; renderRefinery(); };

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
    }
  });
  $('invGo').onclick = invCompare;
  $('invQueueBom').onclick = () => { if (!invQueue.length) return; const lines = invQueue.map(q => q.d.runsNeeded + ' x ' + q.t2 + ' (' + q.d.name + ')'); window.open(appraisalURL(lines), '_blank', 'noopener'); };
  $('ledgerExport').onclick = () => { const l = ledRead(); if (!l.length) return; const csv = 'ts,blueprint,runs,cost,revenue,profit,hub\n' + l.map(e => [new Date(e.ts).toISOString(), '"' + e.bp + '"', e.runs, e.cost, e.revenue, e.profit, e.hub].join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'bv-ledger.csv'; a.click(); };
  $('ledgerClear').onclick = () => { localStorage.removeItem('bvLedger'); renderLedger(); };
});
})();
