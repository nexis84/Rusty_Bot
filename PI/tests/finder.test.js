// Headless checks for the Finder tab: jump-graph BFS, system lookup, security
// bands, producible cascade, chain profit math, spot-row ordering and result
// rendering. Runs the REAL pi-data/pi-systems/pi-jumps files (no browser).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const PI_DIR = path.join(__dirname, '..');

// ---- Minimal DOM / canvas stubs ----
function makeCtx() {
    const calls = { fills: [], fillTexts: [] };
    let p = [];
    const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top', globalAlpha: 1,
        beginPath() { p = []; }, closePath() {},
        moveTo(x, y) { p.push([x, y]); }, lineTo(x, y) { p.push([x, y]); },
        quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {},
        save() {}, restore() {}, clearRect() {},
        translate() {}, scale() {}, rotate() {}, setTransform() {}, resetTransform() {}, clip() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText(t) { return { width: t.length * 5.5 }; },
        fillText(t, x, y) { calls.fillTexts.push({ t, x, y }); }
    };
    ctx.__calls = calls;
    return ctx;
}const ctx = makeCtx();

const els = {};
function makeEl(name) {
    return {
        name,
        addEventListener() {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        style: {}, textContent: '', innerHTML: '', value: '',
        dataset: {}, appendChild() {}, insertAdjacentHTML() {},
        querySelectorAll: () => [], querySelector: () => null, closest: () => null,
        getContext: () => ctx
    };
}

const documentStub = {
    readyState: 'loading',
    addEventListener() {},
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    body: makeEl('#body'),
    head: { appendChild() {} }
};

const lsStore = {};

const sandbox = {
    console: { log() {}, warn() {}, error(...a) { console.error('[vm]', ...a); } },
    document: documentStub,
    window: {
        addEventListener() {},
        PI_ASSET_VERSION: '33',
        location: { hostname: 'localhost', href: '', pathname: '/PI/' },
        history: { replaceState() {} }
    },
    location: { hostname: 'localhost', href: '', pathname: '/PI/' },
    localStorage: {
        getItem: k => (k in lsStore ? lsStore[k] : null),
        setItem(k, v) { lsStore[k] = String(v); },
        removeItem(k) { delete lsStore[k]; }
    },
    navigator: { userAgent: 'test' },
    fetch: () => Promise.reject(new Error('no network in test')),
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Number, String, Boolean, Object, Array, Set, Map,
    Infinity, isFinite, isNaN, parseFloat, parseInt,
    Uint8Array, URLSearchParams, Promise,
    crypto: require('crypto').webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    __ctx: ctx
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Concatenate into ONE script so top-level consts share scope (as in a browser).
const files = ['pi-data.js', 'pi-systems.js', 'pi-jumps.js', 'pi-esi-auth.js', 'pi-visualizer.js'];
const code = files.map(f => fs.readFileSync(path.join(PI_DIR, f), 'utf8')).join('\n;\n')
    + '\n;globalThis.__test = { AppState, finderBFS, computeProducible, chainProfitMath,' +
      ' findSystemByName, secBandOf, activeSecBands, getFinderRadius, getFinderMaxSystems,' +
      ' sortFinderSpotRows, getRequiredPlanetTypes, getRequiredP0, systemExtractableP0, renderFinderSpotResults, drawFinderView,' +
      ' finderCardAt, buildSpotGroups, drawNextBestCards,' +
      ' getMaterialsByTier, getMaterialById, getChainForProduct, collectMaterialIds };';
vm.runInContext(code, sandbox, { filename: 'combined-pi.js' });
const T = sandbox.__test;

let totalFail = 0;

// Authenticate the sandbox auth module - Finder paths are gated behind SSO.
{
    const A = vm.runInContext('piEsiAuth', sandbox);
    A.tokens['1'] = {
        characterId: '1', characterName: 'Test Pilot',
        accessToken: 'a.b.' + Buffer.from(JSON.stringify({ scp: ['esi-location.read_location.v1'] })).toString('base64'),
        refreshToken: 'r', expiresAt: Date.now() + 3600000
    };
    A.setCurrentCharacter('1');
}

// ---- 1) Jump graph BFS ----
{
    let f = 0;
    const jita = 30000142, amarr = 30002187;
    const d = T.finderBFS(jita, 50);
    if (d.get(amarr).jumps !== 11) { f++; console.error(`[bfs] FAIL: Jita->Amarr ${d.get(amarr).jumps} != 11`); }
    const sobaseki = 30001363; // direct neighbour of Jita
    if (!d.get(sobaseki) || d.get(sobaseki).jumps !== 1) { f++; console.error('[bfs] FAIL: Sobaseki not 1 jump from Jita'); }
    // Depth cap respected
    const d3 = T.finderBFS(jita, 3);
    for (const [id, node] of d3) {
        if (node.jumps > 3) { f++; console.error(`[bfs] FAIL: depth cap broken at ${id} (${node.jumps})`); break; }
    }
    // Origin present with parent null
    if (d.get(jita).parent !== null || d.get(jita).jumps !== 0) { f++; console.error('[bfs] FAIL: origin entry wrong'); }
    console.log(`[bfs] jita->amarr=${d.get(amarr).jumps} reachable=${d.size}` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 2) System lookup ----
{
    let f = 0;
    if (!T.findSystemByName('Jita') || T.findSystemByName('Jita').id !== 30000142) { f++; console.error('[sysname] FAIL: exact Jita'); }
    if (!T.findSystemByName('amarr') || T.findSystemByName('amarr').id !== 30002187) { f++; console.error('[sysname] FAIL: case-insensitive Amarr'); }
    if (T.findSystemByName('zzzznotasystem') !== null) { f++; console.error('[sysname] FAIL: miss should be null'); }
    console.log('[sysname] exact/case/miss' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 3) Security bands ----
{
    let f = 0;
    if (T.secBandOf(0.9) !== 'high') { f++; console.error('[secband] FAIL: 0.9 not high'); }
    if (T.secBandOf(0.5) !== 'high') { f++; console.error('[secband] FAIL: 0.5 not high'); }
    if (T.secBandOf(0.4) !== 'low') { f++; console.error('[secband] FAIL: 0.4 not low'); }
    if (T.secBandOf(0.05) !== 'low') { f++; console.error('[secband] FAIL: 0.05 not low'); }
    if (T.secBandOf(0) !== 'null') { f++; console.error('[secband] FAIL: 0 not null'); }
    if (T.secBandOf(-0.9) !== 'null') { f++; console.error('[secband] FAIL: -0.9 not null'); }
    console.log('[secband] boundaries' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 4) Sec filter chips -> active band set ----
{
    let f = 0;
    els.finderSecFilter.querySelectorAll = (sel) =>
        sel.includes('.active')
            ? [{ dataset: { sec: 'high' } }, { dataset: { sec: 'low' } }]
            : [];
    const bands = T.activeSecBands();
    if (bands.size !== 2 || !bands.has('high') || !bands.has('low')) { f++; console.error('[secfilter] FAIL: expected {high,low}, got', [...bands]); }
    // Empty selection means "all allowed"
    els.finderSecFilter.querySelectorAll = () => [];
    const all = T.activeSecBands();
    if (all.size !== 3) { f++; console.error('[secfilter] FAIL: empty selection should allow all'); }
    console.log('[secfilter] chip set / empty-fallback' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 5) Radius parsing ----
{
    let f = 0;
    els.finderJumps.value = '7';
    if (T.getFinderRadius() !== 7) { f++; console.error('[radius] FAIL: 7'); }
    els.finderJumps.value = '999';
    if (T.getFinderRadius() !== 50) { f++; console.error('[radius] FAIL: cap 50'); }
    els.finderJumps.value = '-4';
    if (T.getFinderRadius() !== 1) { f++; console.error('[radius] FAIL: floor 1'); }
    els.finderJumps.value = 'abc';
    if (T.getFinderRadius() !== 10) { f++; console.error('[radius] FAIL: default 10'); }
    console.log('[radius] parse/clamp' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 6) Producible cascade ----
{
    let f = 0;
    // Every P0 available -> every material of each tier producible
    const allP0 = new Set(T.getMaterialsByTier(0).map(m => m.id));
    const full = T.computeProducible(allP0);
    for (const tier of [1, 2, 3, 4]) {
        const key = 'p' + tier;
        if (full[key].size !== T.getMaterialsByTier(tier).length) {
            f++;
            console.error(`[producible] FAIL: full-P0 p${tier} ${full[key].size} != ${T.getMaterialsByTier(tier).length}`);
        }
    }
    // No P0 -> nothing producible
    const none = T.computeProducible(new Set());
    for (const key of ['p1', 'p2', 'p3', 'p4']) {
        if (none[key].size !== 0) { f++; console.error(`[producible] FAIL: empty P0 should yield nothing (${key})`); }
    }
    // Monotonicity: adding planet types never shrinks the producible set
    const ptBarren = 2016, ptLava = 2015;
    const barrenSet = new Set((T.AppState && []) || []);
    // build P0 sets from real planet type data
    const pdBarren = new Set();
    const pdBoth = new Set();
    const planetTypesSrc = vm.runInContext('PI_DATA.planetTypes', sandbox);
    (planetTypesSrc[ptBarren].p0Materials || []).forEach(id => { pdBarren.add(id); pdBoth.add(id); });
    (planetTypesSrc[ptLava].p0Materials || []).forEach(id => pdBoth.add(id));
    const onlyBarren = T.computeProducible(pdBarren);
    const both = T.computeProducible(pdBoth);
    onlyBarren.p1.forEach(id => { if (!both.p1.has(id)) { f++; console.error(`[producible] FAIL: monotonicity broken for ${id}`); } });
    // Barren alone must NOT produce everything
    if (onlyBarren.p4.size >= T.getMaterialsByTier(4).length) { f++; console.error('[producible] FAIL: barren-only produces all P4?'); }
    console.log(`[producible] full=${full.p1.size}/${full.p2.size}/${full.p3.size}/${full.p4.size} barrenOnlyP4=${onlyBarren.p4.size}` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 7) Chain profit math ----
{
    let f = 0;
    const chain = {
        target: { id: 100, batchSize: 5 },
        inputs: [
            { id: 200, qty: 2, subChain: { inputs: [{ id: 300, qty: 10 }] } },
            { id: 201, qty: 1 }
        ]
    };
    const prices = { 100: { sell: 100 }, 200: { sell: 100 }, 201: { sell: 50 }, 300: { sell: 1 } };
    const m = T.chainProfitMath(chain, prices);
    if (m.outputValue !== 500) { f++; console.error(`[profit] FAIL: outputValue ${m.outputValue} != 500`); }
    if (m.totalInputCost !== 250) { f++; console.error(`[profit] FAIL: inputCost ${m.totalInputCost} != 250`); }
    if (m.rawCost !== 60) { f++; console.error(`[profit] FAIL: rawCost ${m.rawCost} != 60 (leaf recursion)`); }
    if (m.profit !== 250) { f++; console.error(`[profit] FAIL: profit ${m.profit} != 250`); }
    if (Math.abs(m.margin - 100) > 0.001) { f++; console.error(`[profit] FAIL: margin ${m.margin} != 100 (profit/inputCost)`); }
    console.log('[profit] per-batch math' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 8) Plan ordering (groups: totalJumps, then size, then security) ----
{
    let f = 0;
    const rows = [
        { systems: [{ sys: { id: 1, security: 0.3 }, jumps: 2 }], totalJumps: 4 },
        { systems: [{ sys: { id: 2, security: 0.9 }, jumps: 4 }], totalJumps: 8 },
        { systems: [{ sys: { id: 3, security: 0.6 }, jumps: 2 }], totalJumps: 2 },
        { systems: [{ sys: { id: 4, security: -0.2 }, jumps: 1 }, { sys: { id: 5, security: 0.5 }, jumps: 1 }], totalJumps: 6 },
        { systems: [{ sys: { id: 6, security: 0.5 }, jumps: 9 }], totalJumps: 9 }
    ];
    const sorted = T.sortFinderSpotRows(rows.slice());
    const ids = sorted.map(g => g.systems[0].sys.id);
    if (ids.join(',') !== '3,1,4,2,6') { f++; console.error(`[spotorder] FAIL: order ${ids} != 3,1,4,2,6`); }
    console.log('[spotorder] totalJumps ordering' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 9) Required planet types carry ids ----
{
    let f = 0;
    const p4Id = parseInt(Object.keys(vm.runInContext('PI_DATA.materials', sandbox))
        .find(id => vm.runInContext('PI_DATA.materials', sandbox)[id].tier === 4), 10);
    const req = T.getRequiredPlanetTypes(p4Id);
    if (!req.length) { f++; console.error('[reqtypes] FAIL: no required types for a P4'); }
    req.forEach(r => {
        if (typeof r.id !== 'number' || !r.name || !r.color) { f++; console.error('[reqtypes] FAIL: bad entry', r); }
    });
    console.log(`[reqtypes] P4 ${p4Id} needs ${req.length} planet types w/ ids` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 10) Canvas view: full-coverage spot cards, expanded route, hit-testing ----
{
    let f = 0;
    const jitaSys = vm.runInContext('PI_SYSTEMS["30000142"]', sandbox);
    const sobaseki = vm.runInContext('PI_SYSTEMS["30001363"]', sandbox);
    const bfs = new Map([
        [30000142, { jumps: 0, parent: null }],
        [30001363, { jumps: 1, parent: 30000142 }]
    ]);
    // Full-coverage plans in group shape
    T.AppState.finder.spotRows = [
        { systems: [{ sys: jitaSys, jumps: 0, covers: [2016], route: [30000142] }], requiredIds: [2016], totalJumps: 0 },
        { systems: [{ sys: sobaseki, jumps: 1, covers: [2016], route: [30000142, 30001363] }], requiredIds: [2016], totalJumps: 1 }
    ];
    T.AppState.finder.activePanel = 'spot';
    T.AppState.finder.spotProductName = 'Rocket Fuel';
    T.AppState.finder.bestProductId = 2393; // Rocket Fuel type id (VIEW CHAIN chip)
    T.AppState.finder.bestStats = { profit: 12345.6, margin: 42.5, profitLocal: 11000, marginLocal: 38 };
    T.AppState.finder._bfs = bfs;
    els.finderJumps.value = '10';
    els.finderMaxSystems.value = '1';
    T.AppState.cssW = 1200; T.AppState.cssH = 900;
    ctx.__calls.fillTexts = [];
    T.drawFinderView();
    const texts = ctx.__calls.fillTexts.map(t => t.t).join(' | ');
    if (!texts.includes('Jita')) { f++; console.error('[findercanvas] FAIL: Jita card not drawn'); }
    if (!texts.includes('FULL CHAIN')) { f++; console.error('[findercanvas] FAIL: full-chain chip not drawn'); }
    if (!texts.includes('VIEW CHAIN')) { f++; console.error('[findercanvas] FAIL: view-chain link not drawn'); }
    if (!texts.includes('best places to build')) { f++; console.error('[findercanvas] FAIL: header missing product name'); }
    if (!/#1 by .+ profit: 12\.35K ISK\/batch/.test(texts)) { f++; console.error('[findercanvas] FAIL: best-stats banner missing'); }
     if (!texts.includes('covering every required raw material')) { f++; console.error('[findercanvas] FAIL: coverage subline missing'); }
    const spotCards = T.AppState.finderCards.filter(c => c.kind === 'spot');
    const chainCards = T.AppState.finderCards.filter(c => c.kind === 'openChain');
    if (spotCards.length !== 2) { f++; console.error(`[findercanvas] FAIL: expected 2 plan cards, got ${spotCards.length}`); }
    if (chainCards.length !== 1 || chainCards[0].productId !== 2393) { f++; console.error('[findercanvas] FAIL: openChain hit area wrong'); }

    // Hit-test: centre of a plan card hits it; a far corner misses
    const c0 = spotCards[0];
    if (T.finderCardAt({ x: c0.x + c0.w / 2, y: c0.y + c0.h / 2 }) !== c0) { f++; console.error('[findercanvas] FAIL: card centre should hit'); }
    if (T.finderCardAt({ x: 5, y: 5 }) !== null) { f++; console.error('[findercanvas] FAIL: empty corner should miss'); }

    // Expanded route renders system names joined by the arrow
    T.AppState.finder.expandedSpot = '30001363';
    ctx.__calls.fillTexts = [];
    T.drawFinderView();
    const texts2 = ctx.__calls.fillTexts.map(t => t.t).join(' | ');
    if (!/Jita .* Sobaseki|Jita.*Sobaseki/.test(texts2)) { f++; console.error('[findercanvas] FAIL: expanded route line missing'); }
    console.log('[findercanvas] plan cards + hit areas' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 10b) Multi-system plans when maxSystems > 1 (P0 coverage model) ----
{
    let f = 0;
    // Find two real systems whose COMBINED extractable P0 set satisfies a
    // product neither satisfies alone, then verify the greedy splitter yields
    // one valid 2-system plan.
    const target = 2389; // Plasmoids (P2)
    const reqP0 = T.getRequiredP0(target);
    T.AppState.finder.originSystemId = 30000142;
    els.finderJumps.value = '30';
    els.finderMaxSystems.value = '1';
    T.AppState.finder._bfs = T.finderBFS(30000142, 30);

    let sysA = null, sysB = null;
    for (const [idStr, node] of T.AppState.finder._bfs) {
        if (Number(idStr) === 30000142) continue;
        const sys = vm.runInContext('PI_SYSTEMS', sandbox)[idStr];
        if (!sys) continue;
        const sp0 = T.systemExtractableP0(sys);
        const covers = [...reqP0].filter(x => sp0.has(x));
        if (covers.length === 0 || covers.length === reqP0.size) continue;
        if (!sysA) sysA = { id: Number(idStr), node, sp0, covers };
        else {
            const have = new Set([...sysA.covers, ...covers]);
            if ([...reqP0].every(x => have.has(x))) { sysB = { id: Number(idStr), node, sp0, covers }; break; }
        }
    }
    if (!sysA || !sysB) {
        console.log('[maxsys] no complementary partial systems found - scenario skipped');
    } else {
        // Build a tiny BFS of just the two partial systems around sysA as origin
        // so neither alone is a full producer but the pair is.
        T.AppState.finder.originSystemId = sysA.id;
        T.AppState.finder._bfs = new Map([
            [sysA.id, { jumps: 0, parent: null }],
            [sysB.id, { jumps: 3, parent: sysA.id }]
        ]);
        els.finderMaxSystems.value = '1';
        if (T.buildSpotGroups(target).length !== 0) { f++; console.error('[maxsys] FAIL: split needed but plans returned at max=1'); }
        els.finderMaxSystems.value = '2';
        const groups = T.buildSpotGroups(target);
        if (!groups.length) { f++; console.error('[maxsys] FAIL: no combo plans at max=2'); }
        let sawSplit = false;
        groups.forEach(g => {
            if (g.systems.length > 2) { f++; console.error('[maxsys] FAIL: plan exceeds max systems'); }
            if (g.systems.length === 2) sawSplit = true;
            const have = new Set();
            g.systems.forEach(s => {
                const sum = g.systems.reduce((n, x) => n + x.jumps, 0);
                if (g.totalJumps !== sum) { f++; console.error('[maxsys] FAIL: totalJumps != sum of member jumps'); }
                s.covers.forEach(t => have.add(t));
            });
            g.requiredP0.forEach(t => {
                if (!have.has(t)) { f++; console.error(`[maxsys] FAIL: plan missing P0 ${t}`); }
            });
        });
        if (!sawSplit) { f++; console.error('[maxsys] FAIL: no 2-system plan among results'); }
        console.log(`[maxsys] ${groups.length} plan(s), e.g. (${groups[0] ? groups[0].systems.map(s => s.sys.name).join(' + ') : '-'})` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    }
    totalFail += f;
}

// ---- 11) Next-best product cards under the spot list ----
{
    let f = 0;
    T.AppState.finder.scanResults = [
        { id: 100, mat: { name: 'Rocket Fuel', tier: 2 }, profit: 20000, margin: 50, profitLocal: 18000, marginLocal: 44 },
        { id: 101, mat: { name: 'Biotech Research', tier: 3 }, profit: 9000, margin: 30, profitLocal: 8500, marginLocal: 28 },
        { id: 102, mat: { name: 'Supercomputers', tier: 4 }, profit: -50, margin: -3.1, profitLocal: -60, marginLocal: -4 }
    ];
    T.AppState.finder.bestProductId = 100;
    T.AppState.finder.localRegionName = 'Sinq Laison';
    ctx.__calls.fillTexts = [];
    T.drawNextBestCards(20, 620, 500);
    const texts = ctx.__calls.fillTexts.map(t => t.t).join(' | ');
    if (!texts.includes('NEXT BEST TO SELL')) { f++; console.error('[nextbest] FAIL: section header missing'); }
    if (!texts.includes('Biotech Research') || !texts.includes('#2')) { f++; console.error('[nextbest] FAIL: runner-up card missing'); }
    if (texts.includes('Rocket Fuel')) { f++; console.error('[nextbest] FAIL: best product should be excluded from next-best list'); }
    if (!texts.includes('9.00K ISK')) { f++; console.error('[nextbest] FAIL: Jita profit column missing'); }
    if (!texts.includes('Sinq Laison: 8.50K ISK')) { f++; console.error('[nextbest] FAIL: local region column missing'); }
    const nextCards = T.AppState.finderCards.filter(c => c.kind === 'nextProduct');
    if (nextCards.length !== 2) { f++; console.error(`[nextbest] FAIL: expected 2 hit areas, got ${nextCards.length}`); }
    console.log('[nextbest] compact ranked cards' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 12) buildSpotGroups returns complete coverage only ----
{
    let f = 0;
    T.AppState.finder._bfs = new Map([
        [30000142, { jumps: 0, parent: null }],
        [30001363, { jumps: 1, parent: 30000142 }]
    ]);
    T.AppState.finder.originSystemId = 30000142;
    els.finderMaxSystems.value = '1';
    const mats = vm.runInContext('PI_DATA.materials', sandbox);
    const p1ids = Object.keys(mats).filter(id => mats[id].tier === 1);
    let anyComplete = 0;
    p1ids.forEach(pid => {
        const groups = T.buildSpotGroups(parseInt(pid, 10));
        groups.forEach(g => {
            if (g.systems.length !== 1) { f++; console.error('[fullcov] FAIL: max=1 should yield single-system plans'); }
            g.systems.forEach(s => {
                s.covers.forEach(tid => {
                    if (!s.sysP0.has(tid)) {
                        f++; console.error(`[fullcov] FAIL: ${s.sys.name} claims P0 ${tid} it cannot extract`);
                    }
                });
            });
            const have = new Set();
            g.systems.forEach(s => s.covers.forEach(t => have.add(t)));
            g.requiredP0.forEach(t => {
                if (!have.has(t)) { f++; console.error(`[fullcov] FAIL: plan missing P0 ${t}`); }
            });
        });
        if (groups.length > 0) anyComplete++;
    });
    if (anyComplete === 0) { f++; console.error('[fullcov] FAIL: no P1 has a complete system within 2j of Jita'); }
    console.log(`[fullcov] ${anyComplete}/${p1ids.length} P1s have complete plans near Jita` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 13) Sidebar status lines after render* calls ----
{
    let f = 0;
    T.AppState.finder.spotRows = [
        { systems: [{ sys: { id: 1, name: 'Alpha', security: 0.9, regionId: 10000001, planets: [] }, jumps: 0, covers: [2016], route: [1] }], requiredIds: [2016], totalJumps: 0 }
    ];
    T.renderFinderSpotResults();
    const st = els.finderSpotResults.textContent;
    if (!st.includes('on the main canvas') || !st.includes('in full')) { f++; console.error('[status] FAIL: spot status not set, got: ' + st); }
    console.log('[status] sidebar summaries' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 14) Regression: 7P-J38 builds Rocket Fuel (P0 model, matches System Checker) ----
{
    let f = 0;
    T.AppState.finder.originSystemId = 30004691; // O4T-Z5
    T.AppState.finder._bfs = null;
    els.finderJumps.value = '10';
    els.finderMaxSystems.value = '1';
    const groups = T.buildSpotGroups(9830); // Rocket Fuel
    const hit = groups.find(g => g.systems.length === 1 && g.systems[0].sys.id === 30003165);
    if (!hit) { f++; console.error('[reg-7pj38] FAIL: 7P-J38 not listed as a single-system Rocket Fuel producer'); }
    else if (hit.systems[0].sys.name !== '7P-J38') { f++; console.error('[reg-7pj38] FAIL: matched wrong system ' + hit.systems[0].sys.name); }
    // Display must surface the system's actual planet types (coloured chips).
    const planets = hit.systems[0].planetTypes || [];
    if (!planets.includes(2017) || !planets.includes(13)) { f++; console.error('[reg-7pj38] FAIL: planet types not surfaced for display (got ' + planets + ')'); }
    // Must agree with the System Checker's own producibility check.
    const sysP0 = T.systemExtractableP0(vm.runInContext('PI_SYSTEMS["30003165"]', sandbox));
    if (!T.computeProducible(sysP0).p2.has(9830)) { f++; console.error('[reg-7pj38] FAIL: System Checker disagrees'); }
    console.log('[reg-7pj38] 7P-J38 single-system Rocket Fuel' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

console.log(totalFail === 0 ? '\nALL PASS' : `\n${totalFail} FAILURE(S)`);
process.exit(totalFail === 0 ? 0 : 1);
