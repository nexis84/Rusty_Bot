// Headless check of drawColonyLayout route-label placement (no browser needed).
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
        translate() {}, scale() {}, rotate() {}, setTransform() {}, resetTransform() {}, clip() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText(t) { return { width: t.length * 5.5 }; },
        fillText(t, x, y) { calls.fillTexts.push({ t, x, y, font: this.font }); }
    };
    ctx.__calls = calls;
    return ctx;
}

const ctx = makeCtx();
const elStub = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {}, textContent: '', innerHTML: '', value: '', appendChild() {}, insertAdjacentHTML() {}, getContext: () => ctx });

const documentStub = {
    readyState: 'loading',
    addEventListener() {},
    getElementById: () => elStub(),
    querySelector: () => elStub(),
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
    location: { href: '', pathname: '/PI/' },
    navigator: { userAgent: 'test' },
    fetch: () => Promise.reject(new Error('no network in test')),
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Number, String, Object, Array, Set, Map, Infinity, isFinite, isNaN, parseFloat, parseInt,
    PI_DATA: {
        tiers: { 0: [2270], 1: [2312], 2: [2401] },
        materials: {
            2270: { id: 2270, name: 'Water', tier: 0, volume: 0.005 },
            2312: { id: 2312, name: 'Bacterial Cultures', tier: 1, volume: 0.01 },
            2401: { id: 2401, name: 'Oxides', tier: 2, volume: 0.01 }
        },
        recipes: {
            2270: { id: 1, name: 'Water', outputId: 2270, tier: 0, outputQty: 20, cycleTime: 1800 },
            2312: { id: 2, name: 'Bacterial Cultures', outputId: 2312, tier: 1, outputQty: 20, cycleTime: 3600 },
            2401: { id: 3, name: 'Oxides', outputId: 2401, tier: 2, outputQty: 10, cycleTime: 3600 }
        },
        planetTypes: {}, regions: {}
    },
    PI_SYSTEMS: undefined,
    __ctx: ctx
};
vm.createContext(sandbox);

const code = fs.readFileSync(path.join(PI_DIR, 'pi-visualizer.js'), 'utf8')
    + '\n;globalThis.__test = { AppState, drawColonyLayout, drawColonyLayoutOverlay, analyseColony, colonyRadiusKm, setColonyRadiusOverride, navigateToProduct, LINK_CPU_BASE, LINK_CPU_PER_KM, LINK_PG_BASE, LINK_PG_PER_KM, ctx };';
vm.runInContext(code, sandbox, { filename: 'pi-visualizer.js' });
const T = sandbox.__test;
const drawOverlay = T.drawColonyLayoutOverlay;

// ---- Helpers ----
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const distToSegment = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Run one colony scenario; returns total failure count for that scenario.
function runScenario(name, detail, cssW, cssH) {
    const colony = { solar_system_id: 30000142, planet_type: 'barren', upgrade_level: 3, num_pins: detail.pins.length, detail };
    ctx.__calls.fills = [];
    ctx.__calls.fillTexts = [];
    T.AppState.cssW = cssW;
    T.AppState.cssH = cssH;
    T.AppState.layoutMode = true;
    T.AppState.layoutSel = null;
    T.AppState.layoutHover = null;
    T.AppState.systemsLoaded = false;
    T.drawColonyLayout(colony);

    // Chips = dark background fills (height ~13). One per wire (aggregated).
    const chips = ctx.__calls.fills.filter(r => r.fillStyle === 'rgba(15, 15, 15, 0.85)' && Math.abs(r.h - 13) < 0.5);
    const labels = chips.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h, cx: c.x + c.w / 2, cy: c.y + c.h / 2 }));
    const cards = ctx.__calls.fills.filter(r => r.fillStyle === 'rgba(30, 30, 30, 0.95)' && Math.abs(r.w - 150) < 0.5 && Math.abs(r.h - 46) < 0.5);

    // Every wire segment of the colony (consecutive pins of each route).
    const byId = T.AppState.colonyLayoutData.byId;
    const segs = [];
    detail.routes.forEach(r => {
        const ids = [r.source_pin_id, ...(r.waypoints || []), r.destination_pin_id];
        for (let i = 0; i < ids.length - 1; i++) {
            const a = byId[ids[i]], b = byId[ids[i + 1]];
            if (a && b) segs.push([a.x, a.y, b.x, b.y]);
        }
    });

    let fail = 0;
    labels.forEach((c, i) => {
        cards.forEach(k => { if (hit(c, k)) { fail++; console.error(`[${name}] FAIL: label ${i} overlaps card`); } });
        for (let j = 0; j < labels.length; j++) if (i !== j && hit(c, labels[j])) { fail++; console.error(`[${name}] FAIL: label ${i} overlaps label ${j}`); }
        let best = Infinity;
        segs.forEach(s => { best = Math.min(best, distToSegment(c.cx, c.cy, s[0], s[1], s[2], s[3])); });
        if (!isFinite(best) || best > 80) { fail++; console.error(`[${name}] FAIL: label ${i} is ${Math.round(best)}px from any wire (max 80)`); }
    });
    console.log(`[${name}] cards=${cards.length} labels=${labels.length}` + (fail ? ` -> ${fail} FAIL` : ' -> PASS'));
    return fail;
}

// ---- Scenario 1: tight pair of processors + waypoint route (original bug) ----
const detail1 = {
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

// ---- Scenario 2: realistic dense colony (distinct segments, one multi-waypoint) ----
const detail2 = { pins: [], links: [], routes: [] };
detail2.pins.push({ pin_id: 1, type_id: 2848, extractor_details: { product_type_id: 2270, qty_per_cycle: 3000, cycle_time: 900, expiry_time: new Date(Date.now() + 864e5).toISOString() } });
for (let i = 0; i < 8; i++) detail2.pins.push({ pin_id: 10 + i, type_id: 2469, factory_details: { schematic_id: (i % 3) + 1 } });
detail2.pins.push({ pin_id: 50, type_id: 2257 });
detail2.pins.push({ pin_id: 51, type_id: 2256 });
detail2.links.push({ source_pin_id: 1, destination_pin_id: 10, link_level: 0 });
detail2.pins.filter(p => p.pin_id >= 10 && p.pin_id < 18).forEach((p, i) => {
    if (i > 0) detail2.links.push({ source_pin_id: 10 + i - 1, destination_pin_id: 10 + i, link_level: 0 });
    detail2.links.push({ source_pin_id: p.pin_id, destination_pin_id: 50, link_level: 0 });
    detail2.links.push({ source_pin_id: p.pin_id, destination_pin_id: 51, link_level: 0 });
});
detail2.routes.push({ source_pin_id: 1, destination_pin_id: 51, content_type_id: 2270, quantity: 3000, waypoints: [10, 14, 17] });
detail2.pins.filter(p => p.pin_id >= 10 && p.pin_id < 18).forEach((p, i) => {
    detail2.routes.push({ source_pin_id: p.pin_id, destination_pin_id: 50, content_type_id: 2312, quantity: 20 + i * 5, waypoints: [] });
});
[10, 17].forEach((pid, k) => {
    detail2.routes.push({ source_pin_id: pid, destination_pin_id: 51, content_type_id: 2401, quantity: 40 + k * 10, waypoints: [] });
});

// ---- Scenario 3: many routes on ONE wire (aggregate -> single chip) ----
const detail3 = {
    pins: [
        { pin_id: 1, type_id: 2848, extractor_details: { product_type_id: 2270, qty_per_cycle: 3000, cycle_time: 900, expiry_time: new Date(Date.now() + 864e5).toISOString() } },
        { pin_id: 2, type_id: 2469, factory_details: { schematic_id: 1 } },
        { pin_id: 3, type_id: 2257 }
    ],
    links: [
        { source_pin_id: 1, destination_pin_id: 2, link_level: 0 },
        { source_pin_id: 2, destination_pin_id: 3, link_level: 0 }
    ],
    routes: Array.from({ length: 8 }, (_, k) => ({ source_pin_id: 2, destination_pin_id: 3, content_type_id: 2312, quantity: 20 + k * 5, waypoints: [] }))
};

let totalFail = 0;
totalFail += runScenario('tight', detail1, 1200, 420);
totalFail += runScenario('dense', detail2, 1200, 800);
totalFail += runScenario('shared', detail3, 1200, 600);

// ---- Scenario 4: hover tooltip follows the cursor ----
{
    const colony = { solar_system_id: 30000142, planet_type: 'barren', upgrade_level: 3, num_pins: detail2.pins.length, detail: detail2 };
    ctx.__calls.fills = []; ctx.__calls.fillTexts = [];
    T.AppState.cssW = 1200; T.AppState.cssH = 800;
    T.AppState.layoutMode = true;
    T.AppState.layoutSel = null;
    T.AppState.layoutHover = 10;          // a processor pin from detail2
    T.AppState.hoverPos = { x: 560, y: 320 };
    T.AppState.systemsLoaded = false;
    T.drawColonyLayout(colony);
    drawOverlay(colony);
    const panel = ctx.__calls.fills.find(r => r.fillStyle === 'rgba(20, 20, 20, 0.92)' && Math.abs(r.w - 230) < 0.5);
    let f = 0;
    if (!panel) { f++; console.error('[tooltip] FAIL: no hover panel drawn'); }
    else {
        // Panel top-left should sit at cursor + (14,14); allow small slack.
        const d = Math.hypot(panel.x - (560 + 14), panel.y - (320 + 14));
        if (d > 20) { f++; console.error(`[tooltip] FAIL: panel top-left ${Math.round(d)}px from cursor+14 (max 20)`); }
        if (panel.x < 0 || panel.y < 0 || panel.x + panel.w > 1200 || panel.y + panel.h > 800) { f++; console.error('[tooltip] FAIL: panel off-canvas'); }
    }
    console.log(`[tooltip] panel=${panel ? 'yes' : 'no'}` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

// ---- Scenario 5: Command Centre CPU/Powergrid capacity + usage ----
{
    const detail = {
        pins: [
            { pin_id: 1, type_id: 2254, extractor_details: null },                 // CC (level 3)
            { pin_id: 2, type_id: 2848, extractor_details: { product_type_id: 2270, qty_per_cycle: 1, cycle_time: 1 }, latitude: 0.0, longitude: 0.0 },
            { pin_id: 3, type_id: 2469, factory_details: { schematic_id: 1 }, latitude: 0.1, longitude: 0.0 },
            { pin_id: 4, type_id: 2257, latitude: 0.2, longitude: 0.0 },
            { pin_id: 5, type_id: 2256 }
        ],
        // Two links of 100 km each (planet radius 1000 km x 0.1 rad separation)
        links: [
            { source_pin_id: 2, destination_pin_id: 3, link_level: 0 },
            { source_pin_id: 3, destination_pin_id: 4, link_level: 0 }
        ],
        routes: []
    };
    const colony = { solar_system_id: 30000142, planet_type: 'barren', upgrade_level: 3, num_pins: detail.pins.length, detail, radiusKm: 1000 };
    T.AppState.layoutMode = true; T.AppState.layoutSel = null; T.AppState.layoutHover = null; T.AppState.systemsLoaded = false;
    T.drawColonyLayout(colony);
    const a = colony._analysis;
    // PIN_SPECS: ECU 2848=400/2600, PROC 2469=200/800, STOR 2257=500/700, LAUN 2256=3600/700
    const structCpu = 400 + 200 + 500 + 3600, structPg = 2600 + 800 + 700 + 700;
    // Two links at 100 km: cost = base + perKm * 100 each
    const linkCpu = T.LINK_CPU_BASE + T.LINK_CPU_PER_KM * 100, linkPg = T.LINK_PG_BASE + T.LINK_PG_PER_KM * 100;
    const expUsedCpu = structCpu + 2 * linkCpu, expUsedPg = structPg + 2 * linkPg;
    // CC L3 capacity: 17215 CPU / 15000 PG (authoritative EVE values)
    let f = 0;
    if (Math.abs(a.usedCpu - expUsedCpu) > 0.01) { f++; console.error(`[ccpower] FAIL: usedCpu ${a.usedCpu} != ${expUsedCpu}`); }
    if (Math.abs(a.usedPg - expUsedPg) > 0.01) { f++; console.error(`[ccpower] FAIL: usedPg ${a.usedPg} != ${expUsedPg}`); }
    if (a.capCpu !== 17215) { f++; console.error(`[ccpower] FAIL: capCpu ${a.capCpu} != 17215`); }
    if (a.capPg !== 15000) { f++; console.error(`[ccpower] FAIL: capPg ${a.capPg} != 15000`); }
    console.log(`[ccpower] usedCpu=${a.usedCpu.toFixed(1)} usedPg=${a.usedPg.toFixed(1)} capCpu=${a.capCpu} capPg=${a.capPg}` + (f ? ` -> ${f} FAIL` : ' -> PASS'));
    totalFail += f;
}

{
    // Radius priority: c.radiusKm > localStorage override > _esiRadius > type default > fallback
    let f = 0;
    Object.keys(lsStore).forEach(k => delete lsStore[k]);

    if (T.colonyRadiusKm({ planet_id: 900, planet_type: 'barren' }) !== 9000) { f++; console.error('[radius] FAIL: barren default != 9000'); }
    if (T.colonyRadiusKm({ planet_id: 901, planet_type: 'barren', _esiRadius: 5300 }) !== 5300) { f++; console.error('[radius] FAIL: _esiRadius 5300 not used'); }
    T.setColonyRadiusOverride(902, 7777);
    if (T.colonyRadiusKm({ planet_id: 902, planet_type: 'barren', _esiRadius: 5300 }) !== 7777) { f++; console.error('[radius] FAIL: localStorage override 7777 not used'); }
    if (T.colonyRadiusKm({ planet_id: 903, planet_type: 'unknown' }) !== 12000) { f++; console.error('[radius] FAIL: fallback != 12000'); }
    if (T.colonyRadiusKm({ planet_id: 904, planet_type: 'barren', _esiRadius: 0 }) !== 9000) { f++; console.error('[radius] FAIL: zero _esiRadius falls back to type default'); }
    console.log(`[radius] priority chain -> ${f ? f + ' FAIL' : 'PASS'}`);
    totalFail += f;
}

{
    // Chain "Prev" history: navigating products pushes, back pops without pushing
    let f = 0;
    T.AppState.targetProduct = null;
    T.AppState.chainHistory.length = 0;
    T.AppState.suppressHistoryPush = false;
    T.navigateToProduct(2270);  // Water (first target: no previous)
    T.navigateToProduct(2312);  // Bacterial Cultures -> push 2270
    T.navigateToProduct(2401);  // Oxides            -> push 2312
    if (T.AppState.targetProduct !== 2401) { f++; console.error('[chainback] FAIL: target != 2401'); }
    const hist = T.AppState.chainHistory;
    if (hist.length !== 2 || hist[0] !== 2270 || hist[1] !== 2312) { f++; console.error('[chainback] FAIL: history=' + JSON.stringify(hist)); }
    T.AppState.suppressHistoryPush = true;  // simulate Prev button
    T.navigateToProduct(hist.pop());
    if (T.AppState.targetProduct !== 2312) { f++; console.error('[chainback] FAIL: back target != 2312'); }
    if (T.AppState.chainHistory.length !== 1 || T.AppState.chainHistory[0] !== 2270) { f++; console.error('[chainback] FAIL: history after back=' + JSON.stringify(T.AppState.chainHistory)); }
    console.log(`[chainback] product history -> ${f ? f + ' FAIL' : 'PASS'}`);
    totalFail += f;
}

console.log(totalFail === 0 ? '\nALL PASS' : `\n${totalFail} FAILURE(S)`);
process.exit(totalFail === 0 ? 0 : 1);
