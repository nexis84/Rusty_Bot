// Headless check of drawColonyLayout label placement (no browser needed).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const PI_DIR = path.join(__dirname, '..');

// ---- Minimal DOM / canvas stubs ----
function makeCtx() {
    const calls = { fills: [], fillTexts: [] };
    let path = [];
    const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top', globalAlpha: 1,
        beginPath() { path = []; }, closePath() {},
        moveTo(x, y) { path.push([x, y]); },
        lineTo(x, y) { path.push([x, y]); },
        quadraticCurveTo(cx, cy, x, y) { path.push([x, y]); }, arc() {},
        fill() {
            if (!path.length) return;
            const xs = path.map(p => p[0]), ys = path.map(p => p[1]);
            const x = Math.min(...xs), y = Math.min(...ys);
            calls.fills.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, fillStyle: this.fillStyle });
        },
        stroke() {}, save() {}, restore() {}, clearRect() {},
        measureText(t) { return { width: t.length * 5.5 }; },
        fillText(t, x, y) { calls.fillTexts.push({ t, x, y, font: this.font }); }
    };
    ctx.__calls = calls;
    return ctx;
}

const ctx = makeCtx();
const elStub = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {}, textContent: '', innerHTML: '', value: '', appendChild() {}, insertAdjacentHTML() {}, getContext: () => ctx });

const documentStub = {
    readyState: 'loading', // keeps init() from running
    addEventListener() {},
    getElementById: () => elStub(),
    createElement: () => elStub(),
    body: elStub()
};

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: documentStub,
    window: { addEventListener() {}, PI_ASSET_VERSION: '13' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: '', pathname: '/PI/' },
    navigator: { userAgent: 'test' },
    fetch: () => Promise.reject(new Error('no network in test')),
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Number, String, Object, Array, Set, Map, Infinity, isFinite, isNaN, parseFloat, parseInt,
    PI_DATA: {
        tiers: { 0: [2270], 1: [2312] },
        materials: {
            2270: { id: 2270, name: 'Water', tier: 0, volume: 0.005 },
            2312: { id: 2312, name: 'Bacterial Cultures', tier: 1, volume: 0.01 }
        },
        recipes: {
            2270: { id: 1, name: 'Water', outputId: 2270, tier: 0, outputQty: 20, cycleTime: 1800 },
            2312: { id: 2, name: 'Bacterial Cultures', outputId: 2312, tier: 1, outputQty: 20, cycleTime: 3600 }
        },
        planetTypes: {}, regions: {}
    },
    PI_SYSTEMS: undefined,
    __ctx: ctx
};
vm.createContext(sandbox);

const code = fs.readFileSync(path.join(PI_DIR, 'pi-visualizer.js'), 'utf8')
    + '\n;globalThis.__test = { AppState, drawColonyLayout, ctx };';
vm.runInContext(code, sandbox, { filename: 'pi-visualizer.js' });
const T = sandbox.__test;

// ---- Fabricated colony reproducing the screenshot ----
// Extractor -> [Processor A, Processor B (stacked, tight)] -> Storage,
// two routes A->B (20 + 20k => label collision), and one route E->S with
// waypoint B (=> old code stamped the label on B's card centre).
const detail = {
    pins: [
        { pin_id: 1, type_id: 2848, extractor_details: { product_type_id: 2270, qty_per_cycle: 3000, cycle_time: 900, expiry_time: new Date(Date.now() + 864e5).toISOString() } },
        { pin_id: 2, type_id: 2469, factory_details: { schematic_id: 1 } },
        { pin_id: 3, type_id: 2470, factory_details: { schematic_id: 2 } },
        { pin_id: 4, type_id: 2257 }
    ],
    links: [
        { source_pin_id: 1, destination_pin_id: 2, link_level: 0 },
        { source_pin_id: 2, destination_pin_id: 3, link_level: 0 },
        { source_pin_id: 3, destination_pin_id: 4, link_level: 0 }
    ],
    routes: [
        { source_pin_id: 2, destination_pin_id: 3, content_type_id: 2270, quantity: 20000, waypoints: [] },
        { source_pin_id: 2, destination_pin_id: 3, content_type_id: 2312, quantity: 20, waypoints: [] },
        { source_pin_id: 1, destination_pin_id: 4, content_type_id: 2270, quantity: 3000, waypoints: [3] }
    ]
};
const colony = { solar_system_id: 30000142, planet_type: 'barren', upgrade_level: 3, num_pins: 4, detail };

T.AppState.cssW = 1200;
T.AppState.cssH = 420; // short canvas -> processors stacked with a small gap
T.AppState.layoutMode = true;
T.AppState.layoutSel = null;
T.AppState.systemsLoaded = false;

T.drawColonyLayout(colony);

// Labels = quantity texts drawn in the bold-9px route-label font (works for
// old code with bare text and new code with chip backgrounds).
const labelFont = f => /bold 9px/.test(f);
const texts = ctx.__calls.fillTexts.filter(f => labelFont(f.font));
const labels = texts.map(f => {
    const w = f.t.length * 5.5;
    return { x: f.x - w / 2, y: f.y - 9, w, h: 12, t: f.t }; // centered, alphabetic baseline
});
const cards = ctx.__calls.fills.filter(r => r.fillStyle === 'rgba(30, 30, 30, 0.95)' && Math.abs(r.w - 150) < 0.5 && Math.abs(r.h - 46) < 0.5); // pin cards
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

let fail = 0;
labels.forEach((c, i) => {
    cards.forEach(k => {
        if (hit(c, k)) { fail++; console.error(`FAIL: label "${c.t}" (${JSON.stringify(c)}) overlaps card ${JSON.stringify(k)}`); }
    });
});
for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    if (hit(labels[i], labels[j])) { fail++; console.error(`FAIL: label "${labels[i].t}" overlaps label "${labels[j].t}"`); }
}

console.log(`cards=${cards.length} labels=${labels.length}`);
labels.forEach(c => console.log(`label: "${c.t}" at (${Math.round(c.x)},${Math.round(c.y)})`));
console.log(fail === 0 ? 'PASS: no label overlaps cards or other labels' : `FAIL: ${fail} overlap(s)`);
process.exit(fail === 0 ? 0 : 1);
