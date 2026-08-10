// EVE Online Item Appraisal (RustyAppraisal) - Main Application
// Paste clipboard items -> resolve to type IDs -> fetch live prices from trade hubs

const ESI_BASE = 'https://esi.evetech.net/latest';
const API_BASE = 'https://api.rustybot.co.uk/api';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const CONCURRENCY = 8;

// Trade hub region IDs (correct mappings)
const HUB_REGIONS = {
    '10000002': 'Jita',
    '10000043': 'Amarr',
    '10000032': 'Dodixie',
    '10000042': 'Hek',
    '10000030': 'Rens',
    '10000009': 'C-J6MT'
};
const HUB_NAMES = {};
for (const id in HUB_REGIONS) HUB_NAMES[HUB_REGIONS[id]] = id;
const ALL_HUB_IDS = Object.keys(HUB_REGIONS);

function el(id) { return document.getElementById(id); }
function fmt(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString(); }

function normalizeName(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---- Item database index ----
const ItemDB = (function buildItemDB() {
    const byLower = new Map();  // lowercase name -> { id, name }
    const byNorm = new Map();   // normalized name -> { id, name }
    const byId = new Map();     // type id -> { id, name }
    const all = [];
    if (typeof AllMarketItems === 'undefined') {
        return null;
    }
    const seen = new Set();
    Object.values(AllMarketItems).forEach(cat => {
        if (!cat.items || !Array.isArray(cat.items)) return;
        cat.items.forEach(item => {
            if (seen.has(item.id)) return;
            seen.add(item.id);
            const entry = { id: item.id, name: item.name, lower: item.name.toLowerCase(), norm: normalizeName(item.name) };
            if (!byLower.has(entry.lower)) byLower.set(entry.lower, entry);
            if (!byNorm.has(entry.norm)) byNorm.set(entry.norm, entry);
            if (!byId.has(entry.id)) byId.set(entry.id, entry);
            all.push(entry);
        });
    });
    return { byLower, byNorm, byId, all };
})();

function matchItem(rawName) {
    const lower = rawName.trim().toLowerCase();
    if (!lower) return null;

    // Exact case-insensitive match
    if (ItemDB.byLower.has(lower)) return { id: ItemDB.byLower.get(lower).id, name: ItemDB.byLower.get(lower).name };

    // Exact match on normalized name (ignores punctuation/spaces)
    const norm = normalizeName(lower);
    if (norm && ItemDB.byNorm.has(norm)) return { id: ItemDB.byNorm.get(norm).id, name: ItemDB.byNorm.get(norm).name };

    // Fuzzy matching
    const words = lower.split(/\s+/).filter(Boolean);
    const normWords = words.map(normalizeName).filter(Boolean);
    if (normWords.length === 0) return null;

    let best = null;
    let bestScore = -1;

    for (const item of ItemDB.all) {
        let score = -1;

        // Query is a prefix of the item name
        if (item.norm.startsWith(norm)) {
            score = 100000 - (item.norm.length - norm.length);
        } else if (item.norm.includes(norm) && norm.length >= 4) {
            score = 50000 - item.norm.indexOf(norm) * 10 - (item.norm.length - norm.length);
        } else {
            // All query tokens appear in order in the item name
            let pos = 0, matched = 0;
            for (const w of normWords) {
                const idx = item.norm.indexOf(w, pos);
                if (idx >= 0) { pos = idx + w.length; matched++; }
            }
            if (matched === normWords.length && matched > 0) {
                score = 20000 - (item.norm.length - norm.length) - pos;
            } else if (matched >= Math.min(2, normWords.length)) {
                score = 8000 + matched * 100 - (item.norm.length - norm.length);
            }
        }

        if (score > bestScore) {
            bestScore = score;
            best = { id: item.id, name: item.name };
        }
    }

    return bestScore >= 0 ? best : null;
}

// ---- Clipboard parsing ----
function parseQuantityNumber(str) {
    if (str === null || str === undefined) return null;
    const cleaned = str.replace(/[\s,.\u00a0]/g, '');
    if (!/^\d+$/.test(cleaned)) return null;
    const n = parseInt(cleaned, 10);
    return (n > 0) ? n : null;
}

function parseLine(line) {
    let text = line.trim().replace(/^[\"\u201c\u201d]+|[\"\u201c\u201d]+$/g, '').trim();
    if (!text) return null;

    let qty = null;
    let name = null;

    // 1) "qty x Name"  e.g. "25 x Tritanium"
    let m = text.match(/^([\d.,\s\u00a0]+)\s*[xX\u00d7]\s*(.+)$/);
    if (m) {
        qty = parseQuantityNumber(m[1]);
        name = m[2].trim();
    }

    // 2) "Name x qty"  e.g. "Pyerite x 1,000"
    if (qty === null && name === null) {
        m = text.match(/^(.+?)\s*[xX\u00d7]\s*([\d.,\s\u00a0]+)$/);
        if (m) {
            qty = parseQuantityNumber(m[2]);
            name = m[1].trim();
        }
    }

    // 3) "qty Name" (space/tab separated) e.g. "1000 Veldspar"
    if (qty === null && name === null) {
        m = text.match(/^([\d.,\u00a0]+)[\t ]+(\S.*)$/);
        if (m) {
            qty = parseQuantityNumber(m[1]);
            name = m[2].trim();
        }
    }

    // 4) "Name qty" (space/tab separated) e.g. "Veldspar 1000"
    if (qty === null && name === null) {
        m = text.match(/^(.+?)[\t ]+([\d.,\u00a0]+)$/);
        if (m) {
            qty = parseQuantityNumber(m[2]);
            name = m[1].trim();
        }
    }

    // 5) Bare name only
    if (name === null) {
        name = text;
    }

    if (!name) return null;
    return { name, qty: qty === null ? 1 : qty };
}

function parsePaste(text) {
    const results = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = parseLine(line);
        if (!parsed) continue;
        results.push(parsed);
    }
    return results;
}

// ---- ESI fetching ----
let activeController = null;
let appraisalCancelled = false;

async function fetchWithRetry(url, signal, attempt = 1) {
    try {
        const res = await fetch(url, {
            cache: 'no-cache',
            signal,
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
        });
        if ((res.status === 420 || res.status === 429) && attempt < 4) {
            const delay = 1000 * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, delay));
            return fetchWithRetry(url, signal, attempt + 1);
        }
        if (!res.ok) {
            throw new Error(`ESI request failed: ${res.status}`);
        }
        return res;
    } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        if (attempt < 3) {
            const delay = 500 * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, delay));
            return fetchWithRetry(url, signal, attempt + 1);
        }
        throw err;
    }
}

async function fetchOrders(region, typeId, signal) {
    const all = [];
    const cacheBuster = Date.now();
    const firstUrl = `${ESI_BASE}/markets/${region}/orders/?page=1&type_id=${typeId}&_=${cacheBuster}`;
    const firstRes = await fetchWithRetry(firstUrl, signal);
    let chunk = await firstRes.json();
    if (Array.isArray(chunk) && chunk.length) all.push(...chunk);

    const totalPages = Math.min(parseInt(firstRes.headers.get('x-pages') || '1', 10) || 1, 50);
    for (let p = 2; p <= totalPages; p++) {
        const url = `${ESI_BASE}/markets/${region}/orders/?page=${p}&type_id=${typeId}&_=${cacheBuster}`;
        const res = await fetchWithRetry(url, signal);
        chunk = await res.json();
        if (!Array.isArray(chunk) || chunk.length === 0) break;
        all.push(...chunk);
    }
    return all;
}

// Compute best buy/sell for one region from orders
function pricesFromOrders(orders) {
    let buy = null;
    let sell = null;
    for (const o of orders) {
        if (o.is_buy_order) {
            if (buy === null || o.price > buy) buy = o.price;
        } else {
            if (sell === null || o.price < sell) sell = o.price;
        }
    }
    return { buy, sell };
}

function getCacheKey(region, typeId) {
    return `appraisalCache_v1_${region}_${typeId}`;
}

async function getBestPrices(typeId, region, signal) {
    // Check cache
    const cacheKey = getCacheKey(region, typeId);
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.ts < CACHE_TTL) {
                return normalizePriceData(data);
            }
        }
    } catch (e) { /* ignore corrupt cache */ }

    let result;
    if (region === 'all') {
        // Aggregate across all trade hubs: best buy = max, best sell = min
        let buy = null, sell = null, buyHub = null, sellHub = null;
        for (const hubId of ALL_HUB_IDS) {
            if (appraisalCancelled) break;
            const orders = await fetchOrders(hubId, typeId, signal);
            const prices = pricesFromOrders(orders);
            if (prices.buy !== null && (buy === null || prices.buy > buy)) {
                buy = prices.buy;
                buyHub = hubId;
            }
            if (prices.sell !== null && (sell === null || prices.sell < sell)) {
                sell = prices.sell;
                sellHub = hubId;
            }
        }
        result = { buy, sell, buyHub, sellHub };
    } else {
        const orders = await fetchOrders(region, typeId, signal);
        const prices = pricesFromOrders(orders);
        result = { buy: prices.buy, sell: prices.sell, buyHub: region, sellHub: region };
    }

    const cacheData = { ...result, ts: Date.now() };
    try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (e) { /* storage full, ignore */ }
    return normalizePriceData(result);
}

// Normalize a price result (handles older cache entries missing hub ids)
function normalizePriceData(data) {
    const buyHubId = data.buyHub && HUB_REGIONS[data.buyHub] ? data.buyHub
        : (data.buyHub && HUB_NAMES[data.buyHub] ? HUB_NAMES[data.buyHub] : null);
    const sellHubId = data.sellHub && HUB_REGIONS[data.sellHub] ? data.sellHub
        : (data.sellHub && HUB_NAMES[data.sellHub] ? HUB_NAMES[data.sellHub] : null);
    return {
        buy: data.buy === undefined ? null : data.buy,
        sell: data.sell === undefined ? null : data.sell,
        buyHub: buyHubId ? HUB_REGIONS[buyHubId] : null,
        sellHub: sellHubId ? HUB_REGIONS[sellHubId] : null,
        buyHubId: buyHubId,
        sellHubId: sellHubId
    };
}

// Run async fn over items with limited concurrency, reporting progress
async function mapPool(items, limit, fn, onProgress) {
    const results = new Array(items.length);
    let next = 0;
    let done = 0;
    async function worker() {
        while (next < items.length) {
            if (appraisalCancelled) return;
            const i = next++;
            try {
                results[i] = await fn(items[i], i);
            } catch (err) {
                if (err && err.name === 'AbortError') return;
                results[i] = null;
                console.error(`Failed for item ${items[i]}:`, err.message || err);
            }
            done++;
            if (onProgress) onProgress(done, items.length);
        }
    }
    const workers = [];
    const count = Math.min(limit, items.length);
    for (let w = 0; w < count; w++) workers.push(worker());
    await Promise.all(workers);
    return results;
}

// ---- Rendering / sorting state ----
let sortState = { col: 'buyTotal', dir: 'desc' };

function rowValue(row, col) {
    switch (col) {
        case 'name': return row.name.toLowerCase();
        case 'qty': return row.qty;
        case 'buy': return row.buy;
        case 'sell': return row.sell;
        case 'split': return row.split;
        case 'buyTotal': return row.rowBuy;
        case 'sellTotal': return row.rowSell;
        case 'splitTotal': return row.rowSplit;
        default: return 0;
    }
}

function getSortedRows(rows) {
    const { col, dir } = sortState;
    const dirMult = dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
        const va = rowValue(a, col);
        const vb = rowValue(b, col);
        if (col === 'name') {
            return va.localeCompare(vb) * dirMult;
        }
        // Numeric: nulls always sort to the bottom
        const aNull = va === null || va === undefined;
        const bNull = vb === null || vb === undefined;
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        return (va - vb) * dirMult;
    });
}

function updateSortIndicators() {
    document.querySelectorAll('#resultsTable th[data-sort]').forEach(th => {
        const col = th.dataset.sort;
        const icon = th.querySelector('i');
        th.classList.remove('sort-asc', 'sort-desc');
        if (icon) icon.className = 'fas fa-sort';
        if (col === sortState.col) {
            th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            if (icon) icon.className = 'fas fa-' + (sortState.dir === 'asc' ? 'sort-up' : 'sort-down');
        }
    });
}

function renderTable() {
    const rows = window.__appraisalRows || [];
    const region = window.__appraisalRegion;
    const prices = window.__appraisalPrices || {};
    const showHubTags = region === 'all';

    const sorted = getSortedRows(rows);
    const tbody = el('resultsBody');

    tbody.innerHTML = sorted.map(row => {
        const hasBuy = row.buy !== null;
        const hasSell = row.sell !== null;
        const hasSplit = row.split !== null;
        const buyTag = showHubTags && hasBuy && row.buyHub ? `<span class="hub-tag">${row.buyHub}</span>` : '';
        const sellTag = showHubTags && hasSell && row.sellHub ? `<span class="hub-tag">${row.sellHub}</span>` : '';
        const marketUrl = row.marketUrl;

        return `
            <tr>
                <td class="item-cell">
                    <div class="item-cell-inner">
                        <img src="https://images.evetech.net/types/${row.id}/icon?size=32" class="item-icon" alt="" loading="lazy" onerror="this.style.display='none'">
                        <a href="${marketUrl}" target="_blank" rel="noopener" class="item-link" title="View ${escapeHtml(row.name)} on the Market page">${escapeHtml(row.name)}</a>
                    </div>
                </td>
                <td class="num">${fmtInt(row.qty)}</td>
                <td class="num price${hasBuy ? '' : ' empty'}">${hasBuy ? fmt(row.buy) : '—'}${buyTag}</td>
                <td class="num price${hasSell ? '' : ' empty'}">${hasSell ? fmt(row.sell) : '—'}${sellTag}</td>
                <td class="num price${hasSplit ? '' : ' empty'}">${hasSplit ? fmt(row.split) : '—'}</td>
                <td class="num">${hasBuy ? fmt(row.rowBuy) : '—'}</td>
                <td class="num">${hasSell ? fmt(row.rowSell) : '—'}</td>
            </tr>`;
    }).join('');

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No items to display.</td></tr>`;
    }

    const totals = window.__appraisalTotals || { buyTotal: 0, sellTotal: 0 };
    const mode = getActiveValueMode();
    const modeLabels = { buy: 'Buy', split: 'Split', sell: 'Sell' };
    const activeTotal = mode === 'split' ? totals.splitTotal : (mode === 'sell' ? totals.sellTotal : totals.buyTotal);
    const foot = el('resultsFoot');
    foot.innerHTML = `
        <tr>
            <td class="total-label" colspan="6">Grand Total (${modeLabels[mode] || 'Buy'})</td>
            <td class="num active">${fmt(activeTotal)}</td>
        </tr>`;

    updateSortIndicators();
}

function getActiveValueMode() {
    const active = document.querySelector('.value-btn.active');
    return active ? active.dataset.value : 'buy';
}

function renderResults(items, prices, unmatched, region, hubName) {
    // Build rows
    const rows = [];
    let buyTotal = 0, sellTotal = 0;
    let pricedRows = 0;

    for (const item of items) {
        const price = prices[item.id] || {};
        const buy = price.buy !== null && price.buy !== undefined ? price.buy : null;
        const sell = price.sell !== null && price.sell !== undefined ? price.sell : null;
        const split = (buy !== null && sell !== null) ? (buy + sell) / 2 : (buy !== null ? buy : sell);
        const rowBuy = buy !== null ? item.qty * buy : 0;
        const rowSell = sell !== null ? item.qty * sell : 0;
        const rowSplit = split !== null ? item.qty * split : 0;
        if (buy !== null) buyTotal += rowBuy;
        if (sell !== null) sellTotal += rowSell;
        if (buy !== null || sell !== null) pricedRows++;

        let regionParam;
        if (region === 'all') {
            regionParam = (price.buyHubId && HUB_REGIONS[price.buyHubId]) ? price.buyHubId : 'major';
        } else {
            regionParam = region;
        }

        rows.push({
            id: item.id,
            name: item.name,
            qty: item.qty,
            buy,
            sell,
            split,
            rowBuy,
            rowSell,
            rowSplit,
            buyHub: price.buyHub || null,
            sellHub: price.sellHub || null,
            marketUrl: `../market/index.html?type=${item.id}&region=${regionParam}`
        });
    }

    const splitTotal = rows.reduce((sum, r) => sum + (r.split !== null ? r.rowSplit : 0), 0);

    window.__appraisalRows = rows;
    window.__appraisalPrices = prices;
    window.__appraisalRegion = region;
    window.__appraisalTotals = { buyTotal, sellTotal, splitTotal };
    window.__appraisalUnmatched = unmatched;

    // Default sort by the active total, descending
    const mode = getActiveValueMode();
    const defaultCol = mode === 'buy' ? 'buyTotal' : (mode === 'sell' ? 'sellTotal' : 'splitTotal');
    sortState = { col: defaultCol, dir: 'desc' };

    // Summary cards
    el('buyTotal').textContent = fmt(buyTotal);
    el('sellTotal').textContent = fmt(sellTotal);
    el('splitTotal').textContent = fmt(splitTotal);
    el('lineCount').textContent = fmtInt(items.length);
    el('itemCountNote').textContent = `${pricedRows} of ${items.length} items priced`;
    el('splitNote').textContent = (buyTotal > 0 && sellTotal > 0) ? 'Midpoint between buy and sell' : 'Midpoint of available prices';

    // Hub note
    const hubNote = el('resultsHubNote');
    if (region === 'all') {
        hubNote.textContent = 'Prices aggregated across Jita, Amarr, Dodixie, Hek, Rens and C-J6MT.';
    } else {
        hubNote.textContent = `Prices from ${hubName}. Click an item to view it on the Market page.`;
    }

    updateToggle();

    // Unmatched
    const umSection = el('unmatchedSection');
    const umList = el('unmatchedList');
    if (unmatched.length > 0) {
        umList.innerHTML = unmatched.map(u => `
            <li><i class="fas fa-triangle-exclamation"></i> <span>${escapeHtml(u.raw)}</span>${u.qty > 1 ? ` <span class="num">x ${fmtInt(u.qty)}</span>` : ''}</li>`).join('');
        umSection.classList.remove('hidden');
    } else {
        umSection.classList.add('hidden');
    }
}

function setValueMode(mode) {
    if (!['buy', 'split', 'sell'].includes(mode)) return;
    document.querySelectorAll('.value-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === mode);
    });
    updateToggle();
}

function updateToggle() {
    const mode = getActiveValueMode();
    const totals = window.__appraisalTotals || { buyTotal: 0, sellTotal: 0 };

    const buyCard = document.querySelector('.summary-card.sell');
    const sellCard = document.querySelector('.summary-card.buy');
    const splitCard = document.querySelector('.summary-card.spread');

    buyCard.classList.toggle('active', mode === 'buy');
    buyCard.classList.toggle('dimmed', mode !== 'buy');
    sellCard.classList.toggle('active', mode === 'sell');
    sellCard.classList.toggle('dimmed', mode !== 'sell');
    splitCard.classList.toggle('active', mode === 'split');
    splitCard.classList.toggle('dimmed', mode !== 'split');

    renderTable();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---- Copy results ----
async function copyResults() {
    const rows = window.__appraisalRows || [];
    if (rows.length === 0) {
        showMessage('Nothing to copy yet.', 'error');
        return;
    }
    const totals = window.__appraisalTotals || { buyTotal: 0, sellTotal: 0, splitTotal: 0 };
    const mode = getActiveValueMode();
    const text = `${fmt(modeTotal(totals, mode))} ISK`;

    try {
        await navigator.clipboard.writeText(text);
        showMessage('Amount copied to clipboard', 'success');
    } catch (e) {
        // Fallback for older browsers / non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showMessage('Amount copied to clipboard', 'success');
        } catch (err) {
            showMessage('Could not copy amount automatically', 'error');
        }
        document.body.removeChild(ta);
    }
}

// ---- Share link ----
async function buildShareLink() {
    const rows = window.__appraisalRows || [];
    const unmatched = window.__appraisalUnmatched || [];
    const lines = [];

    for (const row of rows) {
        if (row.id) {
            lines.push(`${row.qty}:${row.id}`);
        } else {
            lines.push(`${row.qty} x ${row.name}`);
        }
    }
    for (const u of unmatched) {
        lines.push(u.qty > 1 ? `${u.qty} x ${u.raw}` : u.raw);
    }

    const mode = getActiveValueMode();
    const region = window.__appraisalRegion;
    const body = { items: lines.join('\n'), mode };
    if (region && region !== 'all') body.hub = region;

    try {
        const res = await fetch(API_BASE + '/appraisal/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.code) {
            const path = location.pathname.replace(/\/index\.html$/, '/');
            return `${location.origin}${path}#${data.code}`;
        }
    } catch (e) {
        console.warn('Short link creation failed, falling back:', e.message);
    }

    // Fallback to legacy long link
    const params = new URLSearchParams();
    params.set('items', lines.join('\n'));
    params.set('mode', mode);
    if (region && region !== 'all') params.set('hub', region);
    const path = location.pathname.replace(/\/index\.html$/, '/');
    return `${location.origin}${path}#${params.toString()}`;
}

function modeTotal(totals, mode) {
    if (mode === 'sell') return totals.sellTotal;
    if (mode === 'split') return totals.splitTotal;
    return totals.buyTotal;
}

async function copyShareLink() {
    const rows = window.__appraisalRows || [];
    if (rows.length === 0) {
        showMessage('Nothing to share yet.', 'error');
        return;
    }
    const text = await buildShareLink();
    try {
        await navigator.clipboard.writeText(text);
        showMessage('Share link copied to clipboard', 'success');
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showMessage('Share link copied to clipboard', 'success');
        } catch (err) {
            showMessage('Could not copy the share link', 'error');
        }
        document.body.removeChild(ta);
    }
}

// ---- Progress / cancel ----
function setProgress(visible, text, pct) {
    const area = el('progressArea');
    const label = el('progressText');
    const fill = el('progressBarFill');
    if (visible) {
        area.classList.remove('hidden');
        if (text !== undefined) label.textContent = text;
        if (pct !== undefined) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    } else {
        area.classList.add('hidden');
        fill.style.width = '0%';
    }
}

// ---- Clear ----
function clearAppraisal() {
    if (activeController) activeController.abort();
    activeController = null;
    appraisalCancelled = true;

    el('appraisalText').value = '';
    el('appraisalText').focus();

    window.__appraisalRows = [];
    window.__appraisalPrices = {};
    window.__appraisalRegion = null;
    window.__appraisalTotals = { buyTotal: 0, sellTotal: 0, splitTotal: 0 };
    window.__appraisalUnmatched = [];

    el('resultsBody').innerHTML = '';
    el('resultsFoot').innerHTML = '';
    el('unmatchedList').innerHTML = '';
    el('unmatchedSection').classList.add('hidden');
    el('resultsSection').classList.add('hidden');
    el('buyTotal').textContent = '—';
    el('sellTotal').textContent = '—';
    el('splitTotal').textContent = '—';
    el('lineCount').textContent = '—';
    el('itemCountNote').textContent = '—';
    el('splitNote').textContent = 'Midpoint between buy and sell';

    setProgress(false);
    try {
        localStorage.removeItem('rustyAppraisalLast');
    } catch (e) { /* ignore */ }

    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

// ---- Message area ----
function showMessage(text, type) {
    const area = el('messageArea');
    area.textContent = text;
    area.className = 'message-area ' + (type || '');
    area.classList.remove('hidden');
    setTimeout(() => area.classList.add('hidden'), 3500);
}

// ---- Main appraisal flow ----
async function runAppraisal() {
    const text = el('appraisalText').value;
    if (!text.trim()) {
        showMessage('Paste some items first.', 'error');
        return;
    }

    const parsed = parsePaste(text);
    if (parsed.length === 0) {
        showMessage('No items could be read from the pasted text.', 'error');
        return;
    }

    const region = el('hubSelect').value;
    const btn = el('appraiseBtn');
    btn.disabled = true;
    appraisalCancelled = false;
    activeController = new AbortController();
    const signal = activeController.signal;

    const resultsSection = el('resultsSection');
    resultsSection.classList.remove('hidden');
    setProgress(true, 'Resolving item names...', 0);

    // Persist last appraisal for restore on next visit
    try {
        localStorage.setItem('rustyAppraisalLast', JSON.stringify({ text, hub: region, ts: Date.now() }));
    } catch (e) { /* ignore */ }

    // Resolve names to type IDs, combine duplicates
    const byId = new Map();
    const unmatched = [];
    for (const p of parsed) {
        const matched = matchItem(p.name);
        if (matched) {
            const existing = byId.get(matched.id);
            if (existing) {
                existing.qty += p.qty;
            } else {
                byId.set(matched.id, { id: matched.id, name: matched.name, qty: p.qty });
            }
        } else {
            unmatched.push({ raw: p.name, qty: p.qty });
        }
    }

    const items = Array.from(byId.values());
    const typeIds = items.map(i => i.id);

    if (items.length === 0) {
        setProgress(false);
        btn.disabled = false;
        renderResults([], {}, unmatched, region, hubDisplayName(region));
        showMessage('No items were recognized. Check the item names.', 'error');
        return;
    }

    // Fetch prices
    const prices = {};
    const priceResults = await mapPool(typeIds, CONCURRENCY, async (typeId) => {
        return await getBestPrices(typeId, region, signal);
    }, (done, total) => {
        setProgress(true, `Fetching prices for ${done} of ${total} unique items...`, (done / total) * 100);
    });

    typeIds.forEach((typeId, i) => {
        if (priceResults[i]) prices[typeId] = priceResults[i];
    });

    setProgress(false);
    btn.disabled = false;
    el('shareLinkBtn').disabled = false;

    if (appraisalCancelled) {
        showMessage('Appraisal cancelled. Showing partial results.', 'error');
    }

    renderResults(items, prices, unmatched, region, hubDisplayName(region));
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hubDisplayName(region) {
    if (region === 'all') return 'all trade hubs';
    return HUB_REGIONS[region] || `region ${region}`;
}

// ---- Share link loading ----
function handleShareHash() {
    const hash = location.hash.slice(1);
    if (!hash) return false;

    // Short code format (e.g. #aB3xK9m) — resolve via API (handles its own auto-run)
    if (hash.indexOf('=') === -1 && hash.length <= 12) {
        resolveShortCode(hash);
        return false;
    }

    let params;
    try {
        params = new URLSearchParams(hash);
    } catch (e) {
        return false;
    }
    const items = params.get('items');
    if (!items) return false;

    // Decode compact "qty:typeId" lines back to "qty x Name" for the textarea.
    // Old full-name links are left untouched.
    const decoded = items.split('\n').map(line => {
        const m = line.trim().match(/^(\d+):(\d+)$/);
        if (m && ItemDB && ItemDB.byId) {
            const entry = ItemDB.byId.get(Number(m[2]));
            if (entry) return `${m[1]} x ${entry.name}`;
        }
        return line;
    }).join('\n');

    el('appraisalText').value = decoded;
    const hub = params.get('hub');
    if (hub && el('hubSelect').querySelector(`option[value="${hub}"]`)) {
        el('hubSelect').value = hub;
    }
    const mode = params.get('mode');
    if (mode && ['buy', 'split', 'sell'].includes(mode)) {
        document.querySelectorAll('.value-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.value === mode);
        });
        updateToggle();
    }
    return true;
}

async function resolveShortCode(code) {
    try {
        const res = await fetch(API_BASE + '/appraisal/share/' + encodeURIComponent(code));
        if (!res.ok) return;
        const data = await res.json();
        if (data.items) {
            const decoded = data.items.split('\n').map(line => {
                const m = line.trim().match(/^(\d+):(\d+)$/);
                if (m && ItemDB && ItemDB.byId) {
                    const entry = ItemDB.byId.get(Number(m[2]));
                    if (entry) return `${m[1]} x ${entry.name}`;
                }
                return line;
            }).join('\n');
            el('appraisalText').value = decoded;
            if (data.hub && el('hubSelect').querySelector(`option[value="${data.hub}"]`)) {
                el('hubSelect').value = data.hub;
            }
            if (data.mode && ['buy', 'split', 'sell'].includes(data.mode)) {
                document.querySelectorAll('.value-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.value === data.mode);
                });
                updateToggle();
            }
            setTimeout(runAppraisal, 50);
        }
    } catch (e) {
        console.warn('Short code resolution failed:', e.message);
    }
}

// ---- EVE time clock ----
function startEveClock() {
    const clockEl = el('eveClock');
    function tick() {
        const now = new Date();
        const h = String(now.getUTCHours()).padStart(2, '0');
        const m = String(now.getUTCMinutes()).padStart(2, '0');
        const s = String(now.getUTCSeconds()).padStart(2, '0');
        clockEl.textContent = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    if (!ItemDB) {
        showMessage('Item database failed to load. Please refresh the page.', 'error');
        el('appraiseBtn').disabled = true;
        return;
    }

    el('appraiseBtn').addEventListener('click', runAppraisal);
    el('copyResultsBtn').addEventListener('click', copyResults);
    el('shareLinkBtn').addEventListener('click', copyShareLink);

    el('clearBtn').addEventListener('click', clearAppraisal);

    el('cancelBtn').addEventListener('click', () => {
        appraisalCancelled = true;
        if (activeController) activeController.abort();
    });

    document.querySelectorAll('.value-btn').forEach(btn => {
        btn.addEventListener('click', () => setValueMode(btn.dataset.value));
    });

    document.querySelectorAll('.summary-card[data-value]').forEach(card => {
        card.addEventListener('click', () => setValueMode(card.dataset.value));
    });

    // Sortable headers
    document.querySelectorAll('#resultsTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (sortState.col === col) {
                sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                sortState = { col, dir: col === 'name' ? 'asc' : 'desc' };
            }
            renderTable();
        });
    });

    // Ctrl/Cmd+Enter in textarea runs appraisal
    el('appraisalText').addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            runAppraisal();
        }
    });

    // Share link or restore last appraisal
    const hasShare = handleShareHash();
    if (!hasShare) {
        try {
            const last = JSON.parse(localStorage.getItem('rustyAppraisalLast') || 'null');
            if (last && last.text) {
                el('appraisalText').value = last.text;
                if (last.hub && el('hubSelect').querySelector(`option[value="${last.hub}"]`)) {
                    el('hubSelect').value = last.hub;
                }
            }
        } catch (e) { /* ignore */ }
    }

    startEveClock();
    if (hasShare) {
        setTimeout(runAppraisal, 50);
    }
});
