// End-to-end Finder flow against REAL SDE data with mocked ESI price responses:
// sets an origin, runs both Finder sections through their real entry points and
// asserts rendered output. Complements finder.test.js (pure logic).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const PI_DIR = path.join(__dirname, '..');

function makeCtx() {
    return {
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top', globalAlpha: 1,
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {},
        fill() {}, stroke() {}, save() {}, restore() {}, clearRect() {},
        translate() {}, scale() {}, rotate() {}, setTransform() {}, resetTransform() {}, clip() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText(t) { return { width: t.length * 5.5 }; },
        fillText() {}
    };
}
const ctx = makeCtx();

const els = {};
function makeEl(name) {
    return {
        name,
        addEventListener() {},
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
            toggle(c, force) { if (force === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (force) { this._set.add(c); } else { this._set.delete(c); } },
            contains(c) { return this._set.has(c); }
        },
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

// Deterministic mock ESI: every sell order priced by type id so profit math is stable.
const mockFetch = async (url) => {
    const m = String(url).match(/\/markets\/\d+\/orders\/\?type_id=(\d+)/);
    if (m) {
        const id = parseInt(m[1], 10);
        return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => [{ is_buy_order: false, price: 10 + (id % 9), volume_remain: 5000 }]
        };
    }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
};

const lsStore = {};
const sandbox = {
    console: { log() {}, warn() {}, error(...a) { console.error('[vm]', ...a); } },
    document: documentStub,
    window: {
        addEventListener() {}, PI_ASSET_VERSION: '33',
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
    fetch: mockFetch,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Number, String, Boolean, Object, Array, Set, Map,
    Infinity, isFinite, isNaN, parseFloat, parseInt,
    Uint8Array, URLSearchParams, Promise,
    crypto: require('crypto').webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = ['pi-data.js', 'pi-systems.js', 'pi-jumps.js', 'pi-esi-auth.js', 'pi-visualizer.js'];
const code = files.map(f => fs.readFileSync(path.join(PI_DIR, f), 'utf8')).join('\n;\n')
    + '\n;globalThis.__test = { AppState, PI_DATA,' +
      ' get runFindBestSystems() { return runFindBestSystems; },' +
      ' get runProfitScan() { return runProfitScan; },' +
      ' get materialsIndex() { return PI_DATA.materials; } };';
vm.runInContext(code, sandbox, { filename: 'combined-pi.js' });
const T = sandbox.__test;

let totalFail = 0;
(async () => {
    // Lazy loaders would inject <script> tags in a browser; data is already
    // loaded here, so short-circuit them like the site does after load.
    T.AppState.systemsLoaded = true;
    T.AppState.jumpsLoaded = true;
    T.AppState.finder.originSystemId = 30000142; // Jita
    T.AppState.finder.originSource = 'manual';

    // Pick a real P2 product ("Rocket Fuel") for the spot search
    let rocketFuel = null;
    for (const m of Object.values(T.materialsIndex)) {
        if (m.name === 'Rocket Fuel') { rocketFuel = m.id; break; }
    }
    if (!rocketFuel) { console.error('[flow] FAIL: Rocket Fuel not found in PI_DATA'); process.exit(1); }
    els.targetProduct.value = String(rocketFuel);

    // ---- Section A: find best systems ----
    await T.runFindBestSystems();
    let f = 0;
    const spotHtml = els.finderSpotResults.innerHTML;
    if (!spotHtml || spotHtml.includes('Set a starting location')) { f++; console.error('[flow] FAIL: no spot results rendered'); }
    if (!spotHtml.includes('Full chain')) { f++; console.error('[flow] FAIL: expected at least one full-chain system near Jita'); }
    if (!spotHtml.includes('finder-route') && !spotHtml.includes('row-sub')) { f++; console.error('[flow] FAIL: no detail lines rendered'); }
    console.log(`[flow] spot search -> ${spotHtml.length} chars` + (f ? ` FAIL x${f}` : ' PASS'));
    totalFail += f;

    // ---- Section B: profit scan (mocked prices) ----
    f = 0;
    els.regionSelect.value = '10000002';
    await T.runProfitScan();
    const profitHtml = els.finderProfitResults.innerHTML;
    if (!profitHtml || profitHtml.includes('No priced products')) { f++; console.error('[flow] FAIL: no profit rows rendered'); }
    if (!profitHtml.includes('ISK')) { f++; console.error('[flow] FAIL: profit rows missing ISK values'); }
    if (!profitHtml.includes('producible from')) { f++; console.error('[flow] FAIL: summary line missing'); }
    console.log(`[flow] profit scan -> ${profitHtml.length} chars` + (f ? ` FAIL x${f}` : ' PASS'));
    totalFail += f;

    // ---- Guards: no origin -> friendly message, no crash ----
    f = 0;
    T.AppState.finder.originSystemId = null;
    await T.runFindBestSystems();
    if (!els.finderSpotResults.innerHTML.includes('Set a starting location')) { f++; console.error('[flow] FAIL: missing-origin guard'); }
    await T.runProfitScan();
    if (!els.finderProfitResults.innerHTML.includes('Set a starting location')) { f++; console.error('[flow] FAIL: missing-origin guard (scan)'); }
    console.log('[flow] origin guards' + (f ? ` FAIL x${f}` : ' PASS'));
    totalFail += f;

    console.log(totalFail === 0 ? '\nALL PASS' : `\n${totalFail} FAILURE(S)`);
    process.exit(totalFail === 0 ? 0 : 1);
})().catch(e => { console.error('[flow] EXCEPTION:', e); process.exit(1); });
