// Mining Refinery tab for RustyAppraisal.
// Reads MiningData (generated from the SDE) and uses the same live ESI price
// helpers as the main appraisal tool.

(function () {
    'use strict';

    const MINING_DATA = (typeof MiningData !== 'undefined' && MiningData && Array.isArray(MiningData.ores))
        ? MiningData
        : null;

    const byLower = new Map();
    const byNorm = new Map();
    let miningController = null;

    if (MINING_DATA) {
        for (const ore of MINING_DATA.ores) {
            const lower = ore.name.toLowerCase();
            byLower.set(lower, ore);
            byNorm.set(miningNorm(ore.name), ore);
        }
    }

    function el(id) { return document.getElementById(id); }
    function miningNorm(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function esc(value) { return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? ''); }
    function num(value) { return typeof fmt === 'function' ? fmt(value) : Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function int(value) { return typeof fmtInt === 'function' ? fmtInt(value) : Number(value).toLocaleString(); }

    function matchOre(rawName) {
        const lower = String(rawName || '').trim().toLowerCase();
        if (!lower) return null;
        if (byLower.has(lower)) return byLower.get(lower);
        const norm = miningNorm(lower);
        if (norm && byNorm.has(norm)) return byNorm.get(norm);
        return null;
    }

    function setMiningProgress(visible, text, percent) {
        const area = el('miningProgress');
        if (!area) return;
        area.classList.toggle('hidden', !visible);
        if (text) el('miningProgressText').textContent = text;
        if (percent !== undefined) el('miningProgressBarFill').style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }

    function getEfficiency() {
        const input = el('miningEfficiency');
        const value = parseFloat(input ? input.value : '75');
        return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    }

    function setEfficiency(value) {
        const input = el('miningEfficiency');
        if (!input) return;
        const n = parseFloat(value);
        input.value = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 75;
    }

    function calculate(oreLines, efficiency) {
        const mineralTotals = new Map();
        const breakdown = [];
        let totalOre = 0;
        let totalRefined = 0;
        let totalLeftover = 0;

        for (const line of oreLines) {
            const ore = line.ore;
            const qty = line.qty;
            const portionSize = Math.max(1, Number(ore.portionSize) || 1);
            const batches = Math.floor(qty / portionSize);
            const refined = batches * portionSize;
            const leftover = qty - refined;

            totalOre += qty;
            totalRefined += refined;
            totalLeftover += leftover;

            const outputs = [];
            for (const material of ore.materials) {
                const outputQty = Math.floor((Number(material.quantity) || 0) * batches * (efficiency / 100));
                if (outputQty <= 0) continue;
                outputs.push({ id: material.id, name: material.name, qty: outputQty });

                const existing = mineralTotals.get(material.id) || { id: material.id, name: material.name, qty: 0 };
                existing.qty += outputQty;
                mineralTotals.set(material.id, existing);
            }

            breakdown.push({ ore, qty, batches, refined, leftover, outputs });
        }

        const minerals = [...mineralTotals.values()].sort((a, b) => b.qty - a.qty);
        return { minerals, breakdown, totalOre, totalRefined, totalLeftover };
    }

    function priceRow(mineral, price) {
        const buy = price && price.buy !== null && price.buy !== undefined ? price.buy : null;
        const sell = price && price.sell !== null && price.sell !== undefined ? price.sell : null;
        const split = buy !== null && sell !== null ? (buy + sell) / 2 : (buy !== null ? buy : sell);
        return {
            ...mineral,
            buy,
            sell,
            split,
            buyTotal: buy !== null ? mineral.qty * buy : null,
            sellTotal: sell !== null ? mineral.qty * sell : null,
            splitTotal: split !== null ? mineral.qty * split : null,
        };
    }

    function renderMining(result, prices, region, efficiency) {
        const rows = result.minerals.map(mineral => priceRow(mineral, prices[mineral.id] || null));
        const buyTotal = rows.reduce((sum, row) => sum + (row.buyTotal || 0), 0);
        const sellTotal = rows.reduce((sum, row) => sum + (row.sellTotal || 0), 0);
        const splitTotal = rows.reduce((sum, row) => sum + (row.splitTotal || 0), 0);
        const pricedCount = rows.filter(row => row.buy !== null || row.sell !== null).length;

        el('miningBuyTotal').textContent = num(buyTotal);
        el('miningSellTotal').textContent = num(sellTotal);
        el('miningSplitTotal').textContent = num(splitTotal);
        el('miningOutputTotal').textContent = int(result.totalRefined);
        el('miningOutputNote').textContent = `${rows.length} mineral type${rows.length === 1 ? '' : 's'} from ${int(result.totalOre)} ore${result.totalLeftover ? ` · ${int(result.totalLeftover)} left over` : ''}${pricedCount < rows.length ? ` · ${rows.length - pricedCount} unpriced` : ''}`;

        const regionLabel = region === 'all'
            ? 'all trade hubs'
            : (typeof HUB_REGIONS !== 'undefined' && HUB_REGIONS[region] ? HUB_REGIONS[region] : `region ${region}`);
        el('miningHubNote').textContent = `Refined at ${efficiency}% efficiency using ${regionLabel} mineral prices. Ore left after a partial reprocessing batch is not refined.`;

        const tbody = el('miningBody');
        tbody.innerHTML = rows.map(row => {
            const marketRegion = region === 'all' ? 'major' : region;
            const buyText = row.buy !== null ? num(row.buy) : '—';
            const sellText = row.sell !== null ? num(row.sell) : '—';
            const buyTotalText = row.buyTotal !== null ? num(row.buyTotal) : '—';
            const sellTotalText = row.sellTotal !== null ? num(row.sellTotal) : '—';
            return `
                <tr>
                    <td class="item-cell">
                        <div class="item-cell-inner">
                            <img src="https://images.evetech.net/types/${row.id}/icon?size=32" class="item-icon" alt="" loading="lazy" onerror="this.style.display='none'">
                            <a href="../market/?type=${row.id}&region=${marketRegion}" target="_blank" rel="noopener" class="item-link" title="View ${esc(row.name)} on the Market page">${esc(row.name)}</a>
                        </div>
                    </td>
                    <td class="num">${int(row.qty)}</td>
                    <td class="num price${row.buy !== null ? '' : ' empty'}">${buyText}</td>
                    <td class="num price${row.sell !== null ? '' : ' empty'}">${sellText}</td>
                    <td class="num">${buyTotalText}</td>
                    <td class="num">${sellTotalText}</td>
                </tr>`;
        }).join('');

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No minerals would be produced at this efficiency.</td></tr>';
        }

        el('miningFoot').innerHTML = `
            <tr><td class="total-label" colspan="5">Refined Buy Total</td><td class="num active">${num(buyTotal)}</td></tr>
            <tr><td class="total-label" colspan="5">Refined Sell Total</td><td class="num">${num(sellTotal)}</td></tr>`;

        const oreBody = el('miningOreBody');
        oreBody.innerHTML = result.breakdown.map(row => {
            const minerals = row.outputs.length
                ? `<div class="ore-minerals">${row.outputs.map(output => `<span class="ore-mineral"><strong>${int(output.qty)}</strong> ${esc(output.name)}</span>`).join('')}</div>`
                : '<span class="mining-empty">Not enough for a full batch</span>';
            return `
                <tr>
                    <td class="item-cell">
                        <div class="item-cell-inner">
                            <img src="https://images.evetech.net/types/${row.ore.id}/icon?size=32" class="item-icon" alt="" loading="lazy" onerror="this.style.display='none'">
                            <span class="item-link">${esc(row.ore.name)}</span>
                        </div>
                    </td>
                    <td class="num">${int(row.qty)}</td>
                    <td class="num">${int(row.batches)}</td>
                    <td class="num">${int(row.refined)}</td>
                    <td class="num">${int(row.leftover)}</td>
                    <td>${minerals}</td>
                </tr>`;
        }).join('');

        if (!result.breakdown.length) {
            oreBody.innerHTML = '<tr><td colspan="6" class="empty-state">No ore to display.</td></tr>';
        }
    }

    function showUnmatched(unmatched) {
        const section = el('miningUnmatched');
        const list = el('miningUnmatchedList');
        if (!section || !list) return;
        if (!unmatched.length) {
            section.classList.add('hidden');
            list.innerHTML = '';
            return;
        }
        section.classList.remove('hidden');
        list.innerHTML = unmatched.map(item => `<li><strong>${esc(item.raw)}</strong>${item.qty ? ` × ${int(item.qty)}` : ''}</li>`).join('');
    }

    async function runMining() {
        if (!MINING_DATA) {
            showMessage('Mining data failed to load. Please refresh the page.', 'error');
            return;
        }

        const text = el('miningText').value;
        if (!text.trim()) {
            showMessage('Paste your mining hold first.', 'error');
            return;
        }

        const efficiency = getEfficiency();
        if (efficiency <= 0) {
            showMessage('Enter a reprocessing efficiency above 0%.', 'error');
            return;
        }

        const parsed = typeof parsePaste === 'function' ? parsePaste(text) : [];
        if (!parsed.length) {
            showMessage('No ore could be read from the pasted text.', 'error');
            return;
        }

        const byId = new Map();
        const unmatched = [];
        for (const line of parsed) {
            const ore = matchOre(line.name);
            if (!ore) {
                unmatched.push({ raw: line.name, qty: line.qty });
                continue;
            }
            const existing = byId.get(ore.id);
            if (existing) existing.qty += line.qty;
            else byId.set(ore.id, { ore, qty: line.qty });
        }

        if (!byId.size) {
            showUnmatched(unmatched);
            el('miningResults').classList.remove('hidden');
            showMessage('No ore names were recognized. Check the spelling.', 'error');
            return;
        }

        const result = calculate([...byId.values()], efficiency);
        publicLastMining(text, el('miningHubSelect').value, efficiency);

        el('miningResults').classList.remove('hidden');
        showUnmatched(unmatched);
        setMiningProgress(true, 'Fetching mineral prices...', 0);
        el('mineBtn').disabled = true;
        appraisalCancelled = false;
        miningController = new AbortController();

        const region = el('miningHubSelect').value;
        const mineralIds = result.minerals.map(mineral => mineral.id);
        let prices = {};

        try {
            const priceResults = await mapPool(
                mineralIds,
                6,
                async typeId => getBestPrices(typeId, region, miningController.signal),
                (done, total) => setMiningProgress(true, `Fetching mineral prices for ${done} of ${total} minerals...`, (done / total) * 100),
            );
            mineralIds.forEach((typeId, index) => {
                if (priceResults[index]) prices[typeId] = priceResults[index];
            });
        } catch (error) {
            if (!error || error.name !== 'AbortError') {
                console.error('Mining price fetch failed:', error);
                showMessage('Some mineral prices could not be fetched. Showing available prices.', 'error');
            }
        } finally {
            setMiningProgress(false);
            el('mineBtn').disabled = false;
            miningController = null;
        }

        renderMining(result, prices, region, efficiency);
        if (appraisalCancelled) {
            showMessage('Mining appraisal cancelled. Showing partial results.', 'error');
        }
        el('miningResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function publicLastMining(text, hub, efficiency) {
        try {
            localStorage.setItem('rustyMiningLast', JSON.stringify({ text, hub, efficiency, ts: Date.now() }));
        } catch (error) { /* ignore storage errors */ }
    }

    function clearMining() {
        el('miningText').value = '';
        el('miningResults').classList.add('hidden');
        el('miningBuyTotal').textContent = '—';
        el('miningSellTotal').textContent = '—';
        el('miningSplitTotal').textContent = '—';
        el('miningOutputTotal').textContent = '—';
        el('miningOutputNote').textContent = '—';
        showUnmatched([]);
        setMiningProgress(false);
        try { localStorage.removeItem('rustyMiningLast'); } catch (error) { /* ignore */ }
        el('miningText').focus();
    }

    function showTab(name) {
        const appraisal = el('appraisalTab');
        const mining = el('miningTab');
        if (!appraisal || !mining) return;
        const isMining = name === 'mining';
        appraisal.classList.toggle('hidden', isMining);
        mining.classList.toggle('hidden', !isMining);
        document.querySelectorAll('.app-tab').forEach(button => {
            const active = button.dataset.tab === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function setupTabs() {
        document.querySelectorAll('.app-tab').forEach(button => {
            button.addEventListener('click', () => showTab(button.dataset.tab));
        });
        const requested = new URLSearchParams(location.search).get('tab');
        if (requested === 'mining') showTab('mining');
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupTabs();

        el('mineBtn').addEventListener('click', runMining);
        el('clearMiningBtn').addEventListener('click', clearMining);

        document.querySelectorAll('[data-mining-rate]').forEach(button => {
            button.addEventListener('click', () => setEfficiency(button.dataset.miningRate));
        });

        el('miningEfficiency').addEventListener('keydown', event => {
            if (event.key === 'Enter') runMining();
        });

        el('miningText').addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runMining();
        });

        el('miningCancelBtn').addEventListener('click', () => {
            appraisalCancelled = true;
            if (miningController) miningController.abort();
        });

        try {
            const last = JSON.parse(localStorage.getItem('rustyMiningLast') || 'null');
            if (last && last.text) {
                el('miningText').value = last.text;
                if (last.hub && el('miningHubSelect').querySelector(`option[value="${last.hub}"]`)) {
                    el('miningHubSelect').value = last.hub;
                }
                if (last.efficiency !== undefined) setEfficiency(last.efficiency);
            }
        } catch (error) { /* ignore corrupt storage */ }

        if (!MINING_DATA) {
            el('mineBtn').disabled = true;
            el('mineBtn').title = 'Mining data failed to load';
        }
    });
})();
