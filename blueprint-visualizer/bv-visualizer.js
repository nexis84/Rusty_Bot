// Blueprint Visualizer V1 — calculator + tree + BOM + handoffs + blueprints/invention/ledger
(function () {
'use strict';
const ESI = 'https://esi.evetech.net/latest';
const D = window.BV_DATA, DEF = D.defaults;
const $ = id => document.getElementById(id);
const fmtISK = n => (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US') + ' ISK';
const fmtN = n => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');
const nameCache = new Map(), priceCache = new Map(), bpCache = new Map();

async function fetchJSON(url, opts, timeout = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(url, { ...opts, signal: c.signal }); clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); const ct = r.headers.get('content-type') || ''; return ct.includes('json') ? r.json() : r.text(); }
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
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(names) });
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
async function typeVolume(id) { try { const t = await fetchJSON(ESI + '/universe/types/' + id + '/'); return t.volume || 0; } catch { return 0; } }

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
  $('scc').value = DEF.scc; $('salesTax').value = DEF.salesTax; $('broker').value = DEF.broker; $('jobTax').value = DEF.jobTax;
  try { const p = JSON.parse(localStorage.getItem('bvPrefs') || '{}'); for (const [k, v] of Object.entries(p)) { const el = $(k); if (el && v !== undefined) el.value = v; } } catch {}
  try { const pr = JSON.parse(localStorage.getItem('bvPresets') || '{}'); refreshPresets(pr); } catch {}
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
  const ids = ['hubSelect', 'me', 'te', 'runs', 'indSkill', 'advSkill', 'implant', 'structure', 'rigs', 'jobTax', 'basis', 'reactions', 'scc', 'salesTax', 'broker', 'mfgIndex', 'tracked', 'systemName'];
  const p = {}; ids.forEach(k => { const el = $(k); if (el) p[k] = el.value; });
  try { localStorage.setItem('bvPrefs', JSON.stringify(p)); } catch {}
}
function refreshPresets(pr) { $('preset').innerHTML = '<option value="">— Load saved preset —</option>' + Object.keys(pr).map(k => '<option>' + k + '</option>').join(''); }

// ---- blueprint resolution ----
async function resolveBlueprint(name) {
  const base = name.replace(/\s+/g, ' ').trim();
  const cands = [...new Set([base, base + ' Blueprint', base.replace(/ blueprint$/i, '') + ' Blueprint', base.replace(/ blueprint$/i, '')])];
  const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cands) });
  const inv = Array.isArray(r) ? r : (r.inventory_types || []);
  let bp = inv.filter(e => /blueprint/i.test(e.name));
  if (bp.length === 1) return bp[0];
  if (!bp.length && inv.length === 1) {
    const v = [inv[0].name + ' Blueprint'];
    const r2 = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
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
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([materialName + ' Blueprint']) });
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
const S = { root: null, nodes: new Map(), bom: [], product: null, trackedPrice: null };
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
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([materialName + ' Reaction Formula']) });
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
        for (const m of kid.materials) { const q = Math.ceil((m.quantity || 0)); const p = await marketPrice(m.type_id, hub(), $('basis').value); sub += (p || 0) * q; }
        const outP = await marketPrice(c.type_id, hub(), 'sell');
        c.child = { bpName: kid.bpName, subCost: sub, outPrice: outP, margin: (outP || 0) - sub, materials: kid.materials };
        renderTree(runs);
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
    '<div class="tree-node build"><div class="row1"><img src="https://images.evetech.net/types/' + S.root.bpId + '/icon?size=32" onerror="this.style.display=\'none\'"><span class="nm">' + S.root.bpName + ' × ' + runs + '</span><span class="pill build">BUILD</span><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(S.root.bpId) + '" title="Price check blueprint"><i class="fas fa-chart-line"></i></a>' + (S.product ? '<a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(S.product.type_id) + '" title="Price check product"><i class="fas fa-box"></i></a>' + piIcon(S.product.type_id) : '') + '</div><div class="kids">';
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
  w.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => { S.root.children[+b.dataset.i].mode = b.dataset.m; renderTree(runs); renderBom(runs); if (S.lastCalc) renderSummary(S.lastCalc); });
}

async function renderBom(runs) {
  S.bom = effLeafCost(runs);
  const tb = $('bomBody');
  let vol = 0; for (const l of S.bom) vol += (await typeVolume(l.type_id)) * l.qty;
  let total = 0;
  tb.innerHTML = S.bom.map(l => { total += l.total; return '<tr><td>' + l.name + (isPI(l.type_id) ? ' <span class="pill" style="border-color:#3fb950;color:#3fb950">' + piTier(l.type_id) + '</span>' : '') + '</td><td>' + fmtN(l.qty) + '</td><td>' + fmtISK(l.unit) + '</td><td>' + fmtISK(l.total) + '</td><td><span class="pill ' + l.mode + '">' + l.mode.toUpperCase() + '</span></td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(l.type_id) + '" title="Price check in Market Browser"><i class="fas fa-chart-line"></i></a>' + piIcon(l.type_id) + mineIcon(l.type_id) + '</td></tr>'; }).join('');
  $('bomMeta').textContent = S.bom.length + ' types';
  const split = bomCashSplit();
  $('bomTotals').textContent = 'Cash total ' + fmtISK(split.cash) + (split.mined > 0 ? ' (+ ' + fmtISK(split.mined) + ' mined @ market)' : '') + ' · Volume ~' + fmtN(Math.round(vol)) + ' m3 · ' + hub();
}

// ---- multibuy + appraisal ----
function cleanName(n) { return n.replace(/ \(built\)$/, '').replace(/ \(react: .*\)$/, ''); }
function multibuyLines() { return S.bom.filter(l => l.mode === 'buy' || l.mode === 'react').map(l => cleanName(l.name) + ' x' + l.qty); }
function bindHandoffs() {
  $('copyMultibuy').onclick = async () => { const t = multibuyLines().join('\n'); if (!t) { status('Nothing to copy (all built).'); return; } await navigator.clipboard.writeText(t); status('Multibuy copied (' + S.bom.length + ' lines).'); };
  $('appraiseBom').onclick = () => { const lines = S.bom.map(l => l.qty + ' x ' + cleanName(l.name)); if (!lines.length) return; window.open(appraisalURL(lines), '_blank', 'noopener'); };
  $('appraiseOut').onclick = () => { if (!S.product) return; window.open(appraisalURL([(S.product.qty * (parseInt($('runs').value) || 1)) + ' x ' + S.product.name]), '_blank', 'noopener'); };
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
// ESI (character + corp endpoints agree): runs === -1 marks an original;
// a copy carries runs remaining (>= 0). quantity is -1 for an original and
// -2 for a copy, so it must NOT be used the other way round — doing so hid
// every BPC behind the BPO tag and emptied the "BPC only" filter.
const bpIsBPO = b => b.runs === -1;
// Loaded list state — the search box filters these rows locally, no refetch.
// Location display is OFF for now (structure ACLs make it unreliable) — flip to true to re-enable.
const BV_SHOW_LOCATIONS = false;
let myBps = [], myBpNames = {}, myLocNames = {}, myStructScopeMissing = false, myStructNoAccess = false;
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
    document.querySelector('[data-tab="calc"]').click(); status('Loaded — hit Calculate.');
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
  const scopeHint = !BV_SHOW_LOCATIONS ? ''
    : (myStructScopeMissing
      ? '<p class="hint">Some structures unnamed — Sign out and sign in again to grant the structure scope.</p>'
      : (myStructNoAccess
        ? '<p class="hint">Some structures withhold their name — no docking access there (hidden by CCP by design).</p>' : ''));
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
    if (src === 'corp') {
      const sheet = await BVAuth.api('/characters/' + cid + '/?datasource=tranquility');
      if (!sheet || !sheet.corporation_id) throw new Error('No corporation found for this character.');
      // Page through like personal (ESI pages corp blueprints at 1000/page) —
      // a single call silently drops everything past the first 1000.
      try {
        for (let pg = 1; pg <= 5; pg++) {
          const chunk = await BVAuth.api('/corporations/' + sheet.corporation_id + '/blueprints/?datasource=tranquility&page=' + pg);
          if (!Array.isArray(chunk) || !chunk.length) break;
          bps = bps.concat(chunk);
          if (chunk.length < 1000) break;
        }
      } catch (e) {
        // Corp blueprints need the Director role — say so instead of a raw 403.
        if (/403/.test((e && e.message) || '')) throw new Error('Corporation blueprints need the Director role on this character.');
        throw e;
      }
    } else {
      // Page through (ESI pages at 1000 entries) so big hangars aren't silently cut.
      for (let pg = 1; pg <= 5; pg++) {
        const chunk = await BVAuth.api('/characters/' + cid + '/blueprints/?datasource=tranquility&page=' + pg);
        if (!Array.isArray(chunk) || !chunk.length) break;
        bps = bps.concat(chunk);
        if (chunk.length < 1000) break;
      }
    }
    if (!Array.isArray(bps)) bps = [];
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
            const nm = await BVAuth.api('/universe/names/?datasource=tranquility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids.slice(i, i + 500)) });
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
    const r = await fetchJSON(ESI + '/universe/ids/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([q]) });
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
    const saved = JSON.parse(localStorage.getItem('bvOres') || 'null');
    if (saved && Date.now() - saved.ts < 7 * 864e5 && saved.ores) {
      for (const [k, v] of Object.entries(saved.ores)) oreCache.set(+k, v);
    }
  } catch {}
})();
function saveOreCache() {
  try {
    const ores = {};
    for (const [k, v] of oreCache) ores[k] = v;
    localStorage.setItem('bvOres', JSON.stringify({ ts: Date.now(), ores }));
  } catch {}
}
async function fetchOre(id, nameHint) {
  if (oreCache.has(id)) return oreCache.get(id);
  const d = await fetchJSON('https://ref-data.everef.net/types/' + id);
  const yields = {};
  for (const [mid, m] of Object.entries(d.type_materials || {})) yields[mid] = m.quantity;
  const o = { id, name: nameHint || (D.ores.find(x => x.id === id) || {}).name || id, volume: d.volume || 0, portion: d.portion_size || 100, yields };
  oreCache.set(id, o); saveOreCache(); return o;
}
function mineralNeeds() {
  const needs = {};
  // 1) raw minerals / ice products explicitly marked "Mine it" (BOM lines carry the mode)
  for (const l of (S.bom || [])) {
    if (!isMineable(l.type_id)) continue;
    if (l.mode !== 'mine') continue;
    needs[l.type_id] = (needs[l.type_id] || 0) + l.qty;
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
async function planMining() {
  const box = $('mineWrap'), st = $('mineStatus');
  try {
  await ensureIceProducts().catch(() => {});
  const needs = mineralNeeds();
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
  const eff = Math.min(100, Math.max(1, parseFloat($('mineEff').value) || 75)) / 100;
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
  // per-material fastest source (least m3 per unit needed)
  const perMin = [];
  for (const [mid, need] of Object.entries(needs)) {
    let best = null;
    for (const o of sources) {
      const y = o.yields[mid]; if (!y) continue;
      const units = Math.ceil(need / (y * eff) / o.portion) * o.portion;
      const m3 = units * o.volume;
      if (!best || m3 < best.m3) best = { ore: o, units, m3, mins: m3 / rate };
    }
    if (best) perMin.push({ mid, name: needName[mid], need, ...best });
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
  let h = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-gem"></i> Mining plan <span class="pill" style="margin-left:.5rem">' + fmtISK(totalValue) + ' of materials</span></h3>';
  h += '<p class="hint">Needs from current BOM · ' + rate + ' m³/min · reprocess ' + Math.round(eff * 100) + '% · prices ' + ((D.hubs.find(x => x.region === region) || {}).name || region) + '</p>';
  h += '<h4>Mine this (covers ' + perMin.length + '/' + Object.keys(needs).length + ' materials)</h4><div style="overflow-x:auto"><table class="bom"><thead><tr><th>Source</th><th>For</th><th>Units</th><th>Volume</th><th>Time</th><th></th></tr></thead><tbody>' +
    merged.map(g => '<tr><td><b>' + g.ore.name + '</b></td><td>' + g.for.join(', ') + '</td><td>' + fmtN(g.units) + '</td><td>' + fmtN(Math.round(g.m3)) + ' m³</td><td>' + fmtTime(g.mins) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(g.ore.id) + '"><i class="fas fa-chart-line"></i></a></td></tr>').join('') +
    '</tbody></table></div>';
  h += '<div class="summary-grid" style="margin-top:.6rem"><div class="summary-card"><div class="k">Total volume</div><div class="v">' + fmtN(Math.round(totalM3)) + ' m³</div></div>' +
    '<div class="summary-card"><div class="k">Total mining time</div><div class="v">' + fmtTime(totalMins) + '</div></div>' +
    '<div class="summary-card"><div class="k">Material value</div><div class="v">' + fmtISK(totalValue) + '</div><div class="k">' + fmtISK(totalMins > 0 ? totalValue / (totalMins / 60) : 0) + '/hr implied</div></div></div>';
  h += '<h4 style="margin-top:.6rem">Fastest source per material (detail)</h4><div style="overflow-x:auto"><table class="bom"><thead><tr><th>Material</th><th>Need</th><th>Source</th><th>Units</th><th>Volume</th><th>Time</th><th></th></tr></thead><tbody>' +
    perMin.map(p => '<tr><td>' + p.name + '</td><td>' + fmtN(p.need) + '</td><td>' + p.ore.name + '</td><td>' + fmtN(p.units) + '</td><td>' + fmtN(Math.round(p.m3)) + ' m³</td><td>' + fmtTime(p.mins) + '</td><td><a class="mkt-link" target="_blank" rel="noopener" href="' + marketURL(p.ore.id) + '"><i class="fas fa-chart-line"></i></a></td></tr>').join('') +
    '</tbody></table></div>';
  box.innerHTML = h + '</div>';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  st.textContent = '';
  } catch (e) {
    st.textContent = 'Mining plan failed: ' + (e && e.message ? e.message : e);
    box.innerHTML = '<div class="panel" style="margin-top:.8rem"><h3><i class="fas fa-gem"></i> Mining plan</h3><p class="hint">Failed: ' + (e && e.message ? e.message : e) + '. Check your connection and try again.</p></div>';
  }
}

// ---- wire ----
document.addEventListener('DOMContentLoaded', () => {
  init(); bindHandoffs(); initAutocomplete();
  // Resolve ice products in the background so Mine-it tags show on isotopes/ozone/water/strontium.
  ensureIceProducts().then(() => { if (S.root) { try { renderTree(S.runs || 1); renderBom(S.runs || 1); } catch {} } }).catch(() => {});
  $('calcBtn').onclick = calculate;
  $('bpName').addEventListener('keydown', e => { if (e.key === 'Enter') calculate(); });
  $('resetBtn').onclick = () => { ['bpName', 'runs', 'systemName'].forEach(k => $(k).value = k === 'runs' ? 1 : k === 'systemName' ? 'Jita' : ''); status(''); };
  $('savePreset').onclick = () => { const n = prompt('Preset name:'); if (!n) return; const pr = JSON.parse(localStorage.getItem('bvPresets') || '{}'); const ids = ['hubSelect', 'me', 'te', 'indSkill', 'advSkill', 'implant', 'structure', 'rigs', 'jobTax', 'basis', 'reactions', 'scc', 'salesTax', 'broker', 'mfgIndex', 'tracked']; pr[n] = Object.fromEntries(ids.map(k => [k, $(k).value])); localStorage.setItem('bvPresets', JSON.stringify(pr)); refreshPresets(pr); status('Preset saved.'); };
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
  $('mineShip').onchange = () => { const s = D.ships.find(x => x.id === $('mineShip').value); if (s && s.rate) $('mineRate').value = s.rate; };
  $('mineGo').onclick = planMining;
  $('mineFromBom').onclick = () => { planMining(); };
  // gem icons on tree + BOM mineral rows, drill-down links, breadcrumb nav (re-rendered often, so delegate globally)
  document.addEventListener('click', e => {
    if (!e.target || !e.target.closest) return;
    const mine = e.target.closest('[data-mine]');
    if (mine) { e.preventDefault(); planMining(); return; }
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
