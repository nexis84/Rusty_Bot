// Headless checks for the PI Template Builder (no browser needed).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const PI_DIR = path.join(__dirname, '..');

function makeCtx() {
    const calls = { fills: [], fillTexts: [] };
    let pathP = [];
    const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top', globalAlpha: 1,
        beginPath() { pathB = []; }, closePath() {},
        moveTo(x, y) { pathB.push([x, y]); },
        lineTo(x, y) { pathB.push([x, y]); },
        quadraticCurveTo(cx, cy, x, y) { pathB.push([x, y]); }, arc() {},
        fill() {
            if (!pathB.length) return;
            const xs = pathB.map(p => p[0]), ys = pathB.map(p => p[1]);
            const x = Math.min(...xs), y = Math.min(...ys);
            calls.fills.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, fillStyle: this.fillStyle });
        },
        stroke() {}, save() {}, restore() {}, clearRect() {},
        translate() {}, scale() {}, rotate() {}, setTransform() {}, resetTransform() {}, clip() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText(t) { return { width: t.length * 5.5 }; },
        fillText(t, x, y) { calls.fillTexts.push({ t, x, y, font: this.font }); }
    };
    ctx.__calls = calls;
    return ctx;
}

let pathB = [];
const ctx = makeCtx();
const elStub = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, textContent: '', innerHTML: '', value: '', appendChild() {}, insertAdjacentHTML() {}, getContext: () => ctx, querySelectorAll: () => [], querySelector: () => elStub(), parentElement: null });

const documentStub = {
    readyState: 'loading',
    addEventListener() {},
    getElementById: () => elStub(),
    querySelector: () => elStub(),
    querySelectorAll: () => [],
    createElement: () => elStub(),
    body: elStub()
};

const lsStore = {};

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: documentStub,
    window: { addEventListener() {}, PI_ASSET_VERSION: '13', history: { replaceState() {} } },
    localStorage: {
        getItem: k => (k in lsStore ? lsStore[k] : null),
        setItem(k, v) { lsStore[k] = String(v); },
        removeItem(k) { delete lsStore[k]; }
    },
    location: { href: '', pathname: '/PI/', origin: 'https://x.test', hash: '' },
    navigator: { userAgent: 'test', clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('no network in test')),
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Number, String, Object, Array, Set, Map, Infinity, isFinite, isNaN, parseFloat, parseInt,
    isLocalhost: false,
    escape, unescape, encodeURIComponent, decodeURIComponent, btoa, atob,
    Blob: function () {}, URL: { createObjectURL() { return 'blob:'; }, revokeObjectURL() {} }, FileReader: function () {},
    PI_DATA: {
        tiers: { 0: [2270], 1: [2312], 2: [2401] },
        materials: {
            2270: { id: 2270, name: 'Water', tier: 0, volume: 0.005 },
            2312: { id: 2312, name: 'Bacterial Cultures', tier: 1, volume: 0.01 },
            2401: { id: 2401, name: 'Oxides', tier: 2, volume: 0.01 },
            2286: { id: 2286, name: 'Planktic Colonies', tier: 0, volume: 0.005 }
        },
        recipes: {
            2270: { id: 1, name: 'Water', outputId: 2270, tier: 0, outputQty: 20, cycleTime: 1800 },
            2312: { id: 2, name: 'Bacterial Cultures', outputId: 2312, tier: 1, outputQty: 20, cycleTime: 3600 },
            2401: { id: 3, name: 'Oxides', outputId: 2401, tier: 2, outputQty: 10, cycleTime: 3600 }
        },
        planetTypes: { 11: { name: 'temperate' }, 12: { name: 'barren' } },
        p0ToPlanetTypes: { 2270: [11], 2286: [12] },
        regions: {}
    },
    PI_SYSTEMS: undefined,
    __ctx: ctx
};
vm.createContext(sandbox);

const code =
    fs.readFileSync(path.join(PI_DIR, 'pi-visualizer.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(PI_DIR, 'pi-templates.js'), 'utf8') + '\n' +
    ';globalThis.__test = { TS, tplLatLngToWorld, tplWorldToLatLng, tplEncode, tplDecode,' +
    ' tplNewTemplate, tplAnalyse, tplRecipeList, tplP0ForPlanet, tplPlacePin, tplToggleLink, tplAddRoute,' +
    ' tplClassifyPin, tplMaxPinId, analyseColony, CC_CAPACITY, TS };';
vm.runInContext(code, sandbox, { filename: 'pi-visualizer.js + pi-templates.js' });
const T = sandbox.__test;

let passed = 0, failed = 0;
function ok(name, cond) {
    if (cond) { passed++; console.log('PASS', name); }
    else { failed++; console.log('FAIL', name); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

// 1. Projection round trip
{
    const w = T.tplLatLngToWorld(45, 120);
    const ll = T.tplWorldToLatLng(w.x, w.y);
    ok('projection lat round-trip', approx(ll.lat, 45, 1e-6));
    ok('projection lng round-trip', approx(ll.lng, 120, 1e-6));
    const w2 = T.tplLatLngToWorld(-90, 0);
    ok('south pole at edge', approx(Math.hypot(w2.x, w2.y), 300, 1e-6));
}

// 2. Encode/decode round trip
{
    const t = T.tplNewTemplate('temperate');
    t.name = 'My Planet';
    t.detail.pins.push({ pin_id: 2, type_id: 2848, latitude: 10, longitude: 20, extractor_details: { product_type_id: 2270, qty_per_cycle: 100, cycle_time: 3600 } });
    const enc = T.tplEncode(t);
    const dec = T.tplDecode(enc);
    ok('encode/decode name', dec.name === 'My Planet');
    ok('encode/decode pin count', dec.detail.pins.length === 2);
    ok('encode/decode extractor product', dec.detail.pins[1].extractor_details.product_type_id === 2270);
}

// 3. New template seeds one Command Center
{
    const t = T.tplNewTemplate('temperate');
    ok('new template has CC', t.detail.pins.length === 1 && T.tplClassifyPin(t.detail.pins[0]) === 'cc');
    ok('new template no links/routes', t.detail.links.length === 0 && t.detail.routes.length === 0);
}

// 4. Analyse a fresh template: capacity from CC, zero usage
{
    T.TS.current = T.tplNewTemplate('temperate');
    const a = T.tplAnalyse();
    ok('fresh cap cpu = L0', a.capCpu === T.CC_CAPACITY[0].cpu);
    ok('fresh used cpu = 0', a.usedCpu === 0);
    ok('fresh within capacity', a.usedCpu <= a.capCpu && a.usedPg <= a.capPg);
}

// 5. Over-capacity detection (many processors at L0)
{
    T.TS.current = T.tplNewTemplate('temperate');
    const proc = { pin_id: 2, type_id: 2469, latitude: 5, longitude: 5, factory_details: { schematic_id: 2 } };
    for (let i = 0; i < 10; i++) {
        T.TS.current.detail.pins.push({ pin_id: 2 + i, type_id: 2469, latitude: i, longitude: i, factory_details: { schematic_id: 2 } });
    }
    const a = T.tplAnalyse();
    ok('10 processors exceed L0 CPU', a.usedCpu > a.capCpu);
}

// 6. Recipe + P0 data integrity
{
    ok('recipe list non-empty', T.tplRecipeList().length >= 2);
    const p0 = T.tplP0ForPlanet('temperate');
    ok('temperate P0 includes Water', p0.some(m => m.id === 2270));
    const barren = T.tplP0ForPlanet('barren');
    ok('barren P0 includes its resource', barren.some(m => m.id === 2286));
}

// 7. Link + route mutation through the public helpers
{
    T.TS.current = T.tplNewTemplate('temperate');
    const cc = T.TS.current.detail.pins[0];
    const procPin = { pin_id: 2, type_id: 2469, latitude: 10, longitude: 10, factory_details: { schematic_id: 2 } };
    T.TS.current.detail.pins.push(procPin);
    const lp = { pin_id: 3, type_id: 2256, latitude: -20, longitude: 30 };
    T.TS.current.detail.pins.push(lp);
    T.tplToggleLink(cc.pin_id, procPin.pin_id);
    ok('link added', T.TS.current.detail.links.length === 1);
    T.tplToggleLink(cc.pin_id, procPin.pin_id);
    ok('link toggled off', T.TS.current.detail.links.length === 0);
    T.tplAddRoute(procPin.pin_id, lp.pin_id, 2312);
    ok('route added', T.TS.current.detail.routes.length === 1);
    ok('route material correct', T.TS.current.detail.routes[0].content_type_id === 2312);
}

// 8. Place pin helper adds the right pin type
{
    T.TS.current = T.tplNewTemplate('temperate');
    const before = T.TS.current.detail.pins.length;
    T.tplPlacePin('extractor', 12, 34);
    ok('placePin adds extractor', T.TS.current.detail.pins.length === before + 1);
    const last = T.TS.current.detail.pins[T.TS.current.detail.pins.length - 1];
    ok('placed extractor classified', T.tplClassifyPin(last) === 'extractor');
    ok('placed extractor on planet', approx(last.latitude, 12) && approx(last.longitude, 34));
}

// 9. Only one Command Center allowed
{
    T.TS.current = T.tplNewTemplate('temperate');
    const before = T.TS.current.detail.pins.length;
    T.tplPlacePin('cc', 1, 1);
    ok('second CC rejected', T.TS.current.detail.pins.length === before);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
