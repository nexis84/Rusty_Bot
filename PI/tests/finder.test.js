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
      ' findSystemByName, secBandOf, activeSecBands, getFinderRadius, sortFinderSpotRows,' +
      ' getRequiredPlanetTypes, renderFinderSpotResults, drawFinderView, finderCardAt,' +
      ' buildFullCoverageSpotRows, drawNextBestCards,' +
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

// ---- 8) Spot-row ordering ----
{
    let f = 0;
    const rows = [
        { sys: { id: 1, security: 0.3 }, jumps: 2, missing: ['Gas'] },
        { sys: { id: 2, security: 0.9 }, jumps: 4, missing: [] },
        { sys: { id: 3, security: 0.6 }, jumps: 2, missing: [] },
        { sys: { id: 4, security: -0.2 }, jumps: 1, missing: ['Lava', 'Ice'] },
        { sys: { id: 5, security: 0.5 }, jumps: 9, missing: ['Storm'] }
    ];
    const sorted = T.sortFinderSpotRows(rows.slice());
    if (sorted[0].sys.id !== 3) { f++; console.error('[spotorder] FAIL: first should be id3 (2j, full, sec .6)'); }
    if (sorted[1].sys.id !== 2) { f++; console.error('[spotorder] FAIL: second should be id2 (4j, full)'); }
    if (sorted[2].sys.id !== 1) { f++; console.error('[spotorder] FAIL: third should be id1 (1 missing)'); }
    if (sorted[3].sys.id !== 5) { f++; console.error('[spotorder] FAIL: fourth should be id5 (1 missing, closer)'); }
    if (sorted[4].sys.id !== 4) { f++; console.error('[spotorder] FAIL: last should be id4 (2 missing)'); }
    console.log('[spotorder] coverage-first ordering' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
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
    // Full-coverage only now: every row must have no missing types
    T.AppState.finder.spotRows = [
        { sys: jitaSys, jumps: 0, requiredIds: [2016], missing: [], route: [30000142] },
        { sys: sobaseki, jumps: 1, requiredIds: [2016], missing: [], route: [30000142, 30001363] }
    ];
    T.AppState.finder.activePanel = 'spot';
    T.AppState.finder.spotProductName = 'Rocket Fuel';
    T.AppState.finder.bestStats = { profit: 12345.6, margin: 42.5, profitLocal: 11000, marginLocal: 38 };
    T.AppState.finder._bfs = bfs;
    T.AppState.cssW = 1200; T.AppState.cssH = 900;
    ctx.__calls.fillTexts = [];
    T.drawFinderView();
    const texts = ctx.__calls.fillTexts.map(t => t.t).join(' | ');
    if (!texts.includes('Jita')) { f++; console.error('[findercanvas] FAIL: Jita card not drawn'); }
    if (!texts.includes('FULL CHAIN')) { f++; console.error('[findercanvas] FAIL: full-chain chip not drawn'); }
    if (!texts.includes('best places to build')) { f++; console.error('[findercanvas] FAIL: header missing product name'); }
    if (!/#1 by .+ profit: 12\.35K ISK\/batch/.test(texts)) { f++; console.error('[findercanvas] FAIL: best-stats banner missing'); }
    if (!texts.includes('have every planet type needed')) { f++; console.error('[findercanvas] FAIL: full-coverage subline missing'); }
    if (T.AppState.finderCards.length !== 2) { f++; console.error(`[findercanvas] FAIL: expected 2 hit areas, got ${T.AppState.finderCards.length}`); }

    // Hit-test: center of first card hits it; a far corner misses
    const c0 = T.AppState.finderCards[0];
    if (T.finderCardAt({ x: c0.x + c0.w / 2, y: c0.y + c0.h / 2 }) !== c0) { f++; console.error('[findercanvas] FAIL: card centre should hit'); }
    if (T.finderCardAt({ x: 5, y: 5 }) !== null) { f++; console.error('[findercanvas] FAIL: empty corner should miss'); }

    // Expanded route renders system names joined by the arrow
    T.AppState.finder.expandedSpot = 30001363;
    ctx.__calls.fillTexts = [];
    T.drawFinderView();
    const texts2 = ctx.__calls.fillTexts.map(t => t.t).join(' | ');
    if (!/Jita .* Sobaseki|Jita.*Sobaseki/.test(texts2)) { f++; console.error('[findercanvas] FAIL: expanded route line missing'); }
    console.log('[findercanvas] spot cards + hit areas' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
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

// ---- 12) buildFullCoverageSpotRows filters to complete systems ----
{
    let f = 0;
    // Every returned row must be complete; across all P1s at least one product
    // must have a complete system within radius of Jita.
    T.AppState.finder._bfs = new Map([
        [30000142, { jumps: 0, parent: null }],
        [30001363, { jumps: 1, parent: 30000142 }]
    ]);
    T.AppState.finder.originSystemId = 30000142;
    const mats = vm.runInContext('PI_DATA.materials', sandbox);
    const p1ids = Object.keys(mats).filter(id => mats[id].tier === 1);
    let anyComplete = 0;
    p1ids.forEach(pid => {
        const rows = T.buildFullCoverageSpotRows(parseInt(pid, 10));
        rows.forEach(r => {
            const present = new Set(r.sys.planets.map(p => p.typeId));
            r.requiredIds.forEach(tid => {
                if (!present.has(tid)) { f++; console.error(`[fullcov] FAIL: ${r.sys.name} missing type ${tid}`); }
            });
        });
        if (rows.length > 0) anyComplete++;
    });
    if (anyComplete === 0) { f++; console.error('[fullcov] FAIL: no P1 has a complete system within 2j of Jita'); }
    console.log(`[fullcov] ${anyComplete}/${p1ids.length} P1s have complete systems near Jita` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- 13) Sidebar status lines after render* calls ----
{
    let f = 0;
    T.AppState.finder.spotRows = [
        { sys: { id: 1, name: 'Alpha', security: 0.9, regionId: 10000001, planets: [] }, jumps: 0, requiredIds: [2016], missing: [], route: [1] }
    ];
    T.renderFinderSpotResults();
    const st = els.finderSpotResults.textContent;
    if (!st.includes('on the main canvas') || !st.includes('in full')) { f++; console.error('[status] FAIL: spot status not set, got: ' + st); }
    console.log('[status] sidebar summaries' + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

console.log(totalFail === 0 ? '\nALL PASS' : `\n${totalFail} FAILURE(S)`);
process.exit(totalFail === 0 ? 0 : 1);
