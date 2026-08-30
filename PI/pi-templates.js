// PI Template Builder — single-planet visual designer + localStorage library + export.
// Loaded after pi-visualizer.js; reuses its globals (PI_DATA, analyseColony, AppState, ctx...).

const TPL_VERSION = 1;
const PLANET_R = 300;
const PIN_R = 16;
const MAX_PINS = 24;
const CC_TYPE = 2254, ECU_TYPE = 2848, PROC_TYPE = 2469, STORAGE_TYPE = 2257, LPAD_TYPE = 2256;
const TPL_HANDLE_HIT_R = 10;
const TPL_HANDLE_DRAW_R = 5;
const TPL_HANDLE_ANGLES = [0, 90, 180, 270];

const TS = window.TemplateState = {
    current: null,
    tool: 'select',
    selectedPinId: null,
    routeSourceId: null,
    routeContentType: null,
    hoverPinId: null,
    drag: null,
    nextPinId: 1,
    currentId: null,
    dirty: false,
    fitted: false,
    panelBuilt: false
};

const LIB_KEY = 'pi_templates_v1';
const CUR_KEY = 'pi_template_current';

function tplPlanetTypeList() {
    return Object.keys(PI_DATA.planetTypes)
        .map(id => ({ id: Number(id), name: PI_DATA.planetTypes[id].name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

let _planetP0Cache = null;
function tplPlanetToP0() {
    if (_planetP0Cache) return _planetP0Cache;
    _planetP0Cache = {};
    for (const p0Id in (PI_DATA.p0ToPlanetTypes || {})) {
        const typeIds = PI_DATA.p0ToPlanetTypes[p0Id] || [];
        typeIds.forEach(tid => {
            const pt = PI_DATA.planetTypes[tid];
            if (!pt || !pt.name) return;
            (_planetP0Cache[pt.name] = _planetP0Cache[pt.name] || []).push(Number(p0Id));
        });
    }
    return _planetP0Cache;
}

function tplP0ForPlanet(name) {
    const map = tplPlanetToP0();
    const ids = (map[name] || []).slice();
    return ids.map(id => getMaterialById(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

let _recipeList = null;
function tplRecipeList() {
    if (_recipeList) return _recipeList;
    _recipeList = Object.keys(PI_DATA.recipes)
        .map(k => PI_DATA.recipes[k])
        .filter(r => r && r.id)
        .sort((a, b) => (a.tier || 0) - (b.tier || 0) || a.name.localeCompare(b.name));
    return _recipeList;
}

function tplRecipeBySchematic(id) {
    return getRecipeBySchematicId(id);
}

function tplClassifyPin(pin) {
    if (COMMAND_CENTER_TYPES.has(pin.type_id)) return 'cc';
    if (ECU_TYPES.has(pin.type_id)) return 'extractor';
    if (PROCESSOR_TYPES.has(pin.type_id)) return 'processor';
    if (LAUNCHPAD_TYPES.has(pin.type_id)) return 'launchpad';
    if (STORAGE_FACILITY_TYPES.has(pin.type_id)) return 'storage';
    return 'other';
}

function tplShortName(name) {
    return name && name.length > 11 ? name.slice(0, 10) + '…' : (name || '');
}

function tplPinLabel(pin) {
    const kind = tplClassifyPin(pin);
    if (kind === 'cc') return 'CC';
    if (kind === 'extractor') {
        const ed = pin.extractor_details;
        const m = ed && ed.product_type_id ? getMaterialById(ed.product_type_id) : null;
        return m ? tplShortName(m.name) : 'ECU';
    }
    if (kind === 'processor') {
        const r = pin.factory_details ? tplRecipeBySchematic(pin.factory_details.schematic_id) : null;
        return r ? tplShortName(r.name) : 'PROC';
    }
    if (kind === 'launchpad') return 'LP';
    if (kind === 'storage') return 'ST';
    return 'PIN';
}

function tplPlanetColor(name) {
    const map = {
        temperate: '#3b6e3b', barren: '#8a6d3b', oceanic: '#2f6f8f', ice: '#7fb6d6',
        gas: '#9b7bd6', lava: '#b5503a', storm: '#5a6b8f', plasma: '#b56a9b'
    };
    return map[name] || '#555';
}

function tplRadiusKm(t) {
    if (t.planetRadiusKm && t.planetRadiusKm > 0) return t.planetRadiusKm;
    return (PLANET_RADIUS_KM && PLANET_RADIUS_KM[t.planetType]) || 12000;
}

function tplLatLngToWorld(lat, lng) {
    const rr = PLANET_R * (90 - lat) / 180;
    const th = lng * Math.PI / 180;
    return { x: rr * Math.cos(th), y: -rr * Math.sin(th) };
}

function tplWorldToLatLng(x, y) {
    const rr = Math.hypot(x, y);
    let lat = 90 - (rr / PLANET_R) * 180;
    lat = Math.max(-90, Math.min(90, lat));
    let th = Math.atan2(-y, x);
    let lng = th * 180 / Math.PI;
    while (lng > 180) lng -= 360;
    while (lng < -180) lng += 360;
    return { lat, lng };
}

function tplPinWorld(pin) {
    return tplLatLngToWorld(pin.latitude, pin.longitude);
}

function tplHandleEdgeWorld(pin, angleDeg) {
    const w = tplPinWorld(pin);
    const a = angleDeg * Math.PI / 180;
    return { x: w.x + PIN_R * Math.cos(a), y: w.y + PIN_R * Math.sin(a) };
}

function tplHandleAt(pos) {
    if (!TS.current) return null;
    let best = null, bestD = Infinity;
    for (const p of TS.current.detail.pins) {
        const w = tplPinWorld(p);
        const s = worldToScreen(w.x, w.y);
        const rScreen = PIN_R * AppState.zoom;
        for (const ang of TPL_HANDLE_ANGLES) {
            const a = ang * Math.PI / 180;
            const hx = s.x + rScreen * Math.cos(a);
            const hy = s.y + rScreen * Math.sin(a);
            const d = Math.hypot(hx - pos.x, hy - pos.y);
            if (d < TPL_HANDLE_HIT_R && d < bestD) {
                bestD = d; best = { pinId: p.pin_id, angle: ang, pin: p };
            }
        }
    }
    return best;
}

function tplAnalyse() {
    if (!TS.current) return null;
    return analyseColony(TS.current.detail, TS.current.upgradeLevel, tplRadiusKm(TS.current));
}

function tplNewTemplate(planetType) {
    const t = {
        version: TPL_VERSION, id: null, name: 'Untitled Planet',
        planetType: planetType || 'temperate', planetRadiusKm: null, upgradeLevel: 0,
        detail: { pins: [], links: [], routes: [] }
    };
    t.detail.pins.push({ pin_id: 1, type_id: CC_TYPE, latitude: 0, longitude: 0 });
    TS.nextPinId = 2;
    return t;
}

function tplMaxPinId(t) {
    let m = 0;
    (t.detail.pins || []).forEach(p => { if (p.pin_id > m) m = p.pin_id; });
    return m;
}

function tplNextId() { return TS.nextPinId++; }

function tplPinById(id) {
    if (!TS.current) return null;
    return TS.current.detail.pins.find(p => p.pin_id === id) || null;
}

function tplCountPins() { return TS.current ? TS.current.detail.pins.length : 0; }

function tplFirstP0(planetType) {
    const list = tplP0ForPlanet(planetType);
    return list.length ? list[0].id : null;
}

function tplFirstSchematic() {
    const list = tplRecipeList();
    return list.length ? list[0].id : null;
}

function tplSelectPin(id) {
    TS.selectedPinId = id;
    TS.routeSourceId = null;
    tplRenderInspector();
    draw();
}

function tplPlacePin(tool, lat, lng) {
    const t = TS.current;
    if (!t) return;
    if (tool === 'cc') {
        if (t.detail.pins.some(p => tplClassifyPin(p) === 'cc')) { tplToast('Only one Command Center per planet'); return; }
        const pin = { pin_id: tplNextId(), type_id: CC_TYPE, latitude: lat, longitude: lng };
        t.detail.pins.push(pin); tplSelectPin(pin.pin_id);
    } else if (tool === 'extractor') {
        if (tplCountPins() >= MAX_PINS) { tplToast('Pin limit reached (' + MAX_PINS + ')'); return; }
        const pin = { pin_id: tplNextId(), type_id: ECU_TYPE, latitude: lat, longitude: lng,
            extractor_details: { product_type_id: tplFirstP0(t.planetType), qty_per_cycle: 0, cycle_time: 3600 } };
        t.detail.pins.push(pin); tplSelectPin(pin.pin_id);
    } else if (tool === 'processor') {
        if (tplCountPins() >= MAX_PINS) { tplToast('Pin limit reached (' + MAX_PINS + ')'); return; }
        const pin = { pin_id: tplNextId(), type_id: PROC_TYPE, latitude: lat, longitude: lng,
            factory_details: { schematic_id: tplFirstSchematic() } };
        t.detail.pins.push(pin); tplSelectPin(pin.pin_id);
    } else if (tool === 'storage') {
        if (tplCountPins() >= MAX_PINS) { tplToast('Pin limit reached (' + MAX_PINS + ')'); return; }
        const pin = { pin_id: tplNextId(), type_id: STORAGE_TYPE, latitude: lat, longitude: lng };
        t.detail.pins.push(pin); tplSelectPin(pin.pin_id);
    } else if (tool === 'launchpad') {
        if (tplCountPins() >= MAX_PINS) { tplToast('Pin limit reached (' + MAX_PINS + ')'); return; }
        const pin = { pin_id: tplNextId(), type_id: LPAD_TYPE, latitude: lat, longitude: lng };
        t.detail.pins.push(pin); tplSelectPin(pin.pin_id);
    }
    tplAutosave();
    draw();
}

function tplDeletePin(id) {
    const t = TS.current;
    if (!t) return;
    t.detail.pins = t.detail.pins.filter(p => p.pin_id !== id);
    t.detail.links = t.detail.links.filter(l => l.source_pin_id !== id && l.destination_pin_id !== id);
    t.detail.routes = t.detail.routes.filter(r => r.source_pin_id !== id && r.destination_pin_id !== id);
    if (TS.selectedPinId === id) TS.selectedPinId = null;
    if (TS.routeSourceId === id) TS.routeSourceId = null;
    tplAutosave();
    tplRenderInspector();
    draw();
}

function tplToggleLink(a, b) {
    if (a === b) return;
    const t = TS.current;
    const links = t.detail.links;
    const idx = links.findIndex(l =>
        (l.source_pin_id === a && l.destination_pin_id === b) ||
        (l.source_pin_id === b && l.destination_pin_id === a));
    if (idx >= 0) links.splice(idx, 1);
    else links.push({ source_pin_id: a, destination_pin_id: b, link_level: 0 });
    tplAutosave();
    draw();
}

function tplAddRoute(a, b, matId) {
    if (a === b || !matId) return;
    TS.current.detail.routes.push({ source_pin_id: a, destination_pin_id: b, content_type_id: matId, quantity: 0, waypoints: [] });
    tplAutosave();
    draw();
}

function tplDefaultRouteMat(pinId) {
    const p = tplPinById(pinId);
    if (!p) return null;
    const kind = tplClassifyPin(p);
    if (kind === 'extractor') return p.extractor_details ? p.extractor_details.product_type_id : null;
    if (kind === 'processor') {
        const r = p.factory_details ? tplRecipeBySchematic(p.factory_details.schematic_id) : null;
        if (r) {
            const out = getMaterialById(r.outputId || (PI_DATA.materials && null));
            if (out) return out.id;
            const byName = Object.values(PI_DATA.materials).find(m => m.name === r.name);
            return byName ? byName.id : null;
        }
    }
    return null;
}

function tplLoadLib() {
    try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch (_) { return []; }
}
function tplSaveLib(arr) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(arr)); } catch (_) {}
}
function tplUpsertLib(t) {
    const arr = tplLoadLib();
    const i = arr.findIndex(x => x.id === t.id);
    if (i >= 0) arr[i] = t; else arr.push(t);
    tplSaveLib(arr);
}
function tplDeleteLib(id) {
    tplSaveLib(tplLoadLib().filter(x => x.id !== id));
}
function tplLoadAutosave() {
    try { return JSON.parse(localStorage.getItem(CUR_KEY)); } catch (_) { return null; }
}
function tplAutosave() {
    try { localStorage.setItem(CUR_KEY, JSON.stringify(TS.current)); } catch (_) {}
    TS.dirty = true;
}

function tplEncode(t) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(t))));
}
function tplDecode(s) {
    return JSON.parse(decodeURIComponent(escape(atob(s))));
}

function tplCopyText(text) {
    try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
        }
    } catch (_) {}
}

function tplToEveFormat() {
    const t = TS.current;
    if (!t) return null;
    const typeToPln = { temperate: 11, barren: 2016, oceanic: 2014, ice: 12, gas: 13, lava: 2015, storm: 2017, plasma: 2063, shattered: 30889 };
    const pins = t.detail.pins || [];
    const pinIndex = {};
    pins.forEach((p, i) => { pinIndex[p.pin_id] = i; });
    const L = (t.detail.links || []).map(l => {
        const s = pinIndex[l.source_pin_id], d = pinIndex[l.destination_pin_id];
        if (s == null || d == null) return null;
        return { D: d, Lv: l.link_level || 0, S: s };
    }).filter(Boolean);
    const P = pins.map(p => {
        const kind = tplClassifyPin(p);
        let S = null;
        if (kind === 'extractor' && p.extractor_details) S = p.extractor_details.product_type_id || null;
        else if (kind === 'processor' && p.factory_details) {
            const r = tplRecipeBySchematic(p.factory_details.schematic_id);
            S = r ? (r.outputId || null) : null;
        }
        const la = (p.latitude || 0) * Math.PI / 180;
        const lo = (p.longitude || 0) * Math.PI / 180;
        const H = kind === 'extractor' ? 8 : 0;
        return { H, La: +la.toFixed(5), Lo: +lo.toFixed(5), S, T: p.type_id };
    });
    const R = (t.detail.routes || []).map(r => {
        const s = pinIndex[r.source_pin_id], d = pinIndex[r.destination_pin_id];
        if (s == null || d == null) return null;
        const way = (r.waypoints || []).map(id => pinIndex[id]).filter(i => i != null);
        const path = [s, ...way, d];
        return { P: path, Q: r.quantity || 5, T: r.content_type_id };
    }).filter(Boolean);
    return {
        CmdCtrLv: t.upgradeLevel || 0,
        Cmt: t.name || 'Untitled Planet',
        Diam: tplRadiusKm(t) * 2,
        L, P, Pln: typeToPln[t.planetType] || 11, R
    };
}

function tplExportEve() {
    const eve = tplToEveFormat();
    if (!eve) return;
    const data = JSON.stringify(eve);
    tplCopyText(data);
    try {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (TS.current.name || 'pi-template').replace(/[^a-z0-9_-]+/gi, '_') + '_EVE.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (_) {}
    tplToast('EVE clipboard copied + downloaded (Paste in-game: Templates → Import & Export → Load from Clipboard)');
}

function tplExportJSON() {
    const data = JSON.stringify(TS.current, null, 2);
    try {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (TS.current.name || 'pi-template').replace(/[^a-z0-9_-]+/gi, '_') + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (_) {}
    tplCopyText(data);
    tplToast('Exported JSON (downloaded & copied)');
}

function tplShareURL() {
    const enc = tplEncode(TS.current);
    const url = location.origin + location.pathname + '#view=template&bp=' + enc;
    tplCopyText(url);
    try { history.replaceState(null, '', url); } catch (_) {}
    tplToast('Share link copied to clipboard');
}

function tplImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const t = JSON.parse(reader.result);
            if (!t || !t.detail || !Array.isArray(t.detail.pins)) throw new Error('bad');
            t.id = t.id || null;
            TS.current = t;
            TS.currentId = t.id;
            TS.nextPinId = tplMaxPinId(t) + 1;
            TS.selectedPinId = null;
            TS.routeSourceId = null;
            tplAutosave();
            tplSyncPanel();
            tplFitView();
            TS.fitted = true;
            tplToast('Template imported');
        } catch (e) {
            tplToast('Invalid template file');
        }
    };
    reader.readAsText(file);
}

function tplToast(msg) {
    const el = document.getElementById('tplStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(tplToast._t);
    tplToast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

function tplBuildPanel() {
    if (TS.panelBuilt) return;
    const panel = document.getElementById('tab-template');
    if (!panel) return;
    panel.innerHTML =
        '<h3><i class="fas fa-cubes"></i> Template Builder</h3>' +
        '<p class="hint">Drag a side handle to link (Shift+drag for route flow). Copy EVE string → in-game Templates → Import & Export → Load from Clipboard.</p>' +
        '<div class="tpl-settings">' +
        '<div class="tpl-planet-pick"><span class="tpl-field-label">Planet:</span>' +
        '<div id="tplPlanetGrid" class="tpl-planet-grid"></div></div>' +
        '<label>Upgrade:<select id="tplUpgrade">' +
        '<option value="0">L0</option><option value="1">L1</option><option value="2">L2</option>' +
        '<option value="3">L3</option><option value="4">L4</option><option value="5">L5</option>' +
        '</select></label>' +
        '</div>' +
        '<div class="tpl-tools">' +
        '<button class="tpl-tool active" data-tool="select" title="Select / move pins">Select</button>' +
        '<button class="tpl-tool" data-tool="cc" title="Command Center">Cmd Center</button>' +
        '<button class="tpl-tool" data-tool="extractor" title="Extractor">Extractor</button>' +
        '<button class="tpl-tool" data-tool="processor" title="Processor">Processor</button>' +
        '<button class="tpl-tool" data-tool="storage" title="Storage">Storage</button>' +
        '<button class="tpl-tool" data-tool="launchpad" title="Launchpad">Launchpad</button>' +
        '<button class="tpl-tool" data-tool="link" title="Toggle link between two pins">Link</button>' +
        '<button class="tpl-tool" data-tool="route" title="Draw a material route">Route</button>' +
        '</div>' +
        '<div id="tplInspector" class="tpl-inspector hidden"></div>' +
        '<div class="tpl-actions">' +
        '<button id="tplNew" class="calc-btn secondary">New</button>' +
        '<button id="tplSave" class="calc-btn">Save</button>' +
        '<button id="tplCopyEve" class="calc-btn" style="background:var(--accent);color:#121212;font-weight:700" title="Copy EVE clipboard string — paste in-game via Templates → Import & Export → Load from Clipboard"><i class="fas fa-clipboard"></i> Copy EVE</button>' +
        '<button id="tplExport" class="calc-btn secondary">Export JSON</button>' +
        '<button id="tplShare" class="calc-btn secondary">Share URL</button>' +
        '<button id="tplImport" class="calc-btn secondary">Import</button>' +
        '<input type="file" id="tplImportFile" accept="application/json" class="hidden">' +
        '<button id="tplClear" class="calc-btn secondary">Clear</button>' +
        '</div>' +
        '<div id="tplStatus" class="tpl-status hidden"></div>' +
        '<div class="tpl-lib"><h4>Saved Templates</h4><div id="tplLibList"></div></div>';

    const planetGrid = document.getElementById('tplPlanetGrid');
    tplPlanetTypeList().forEach(pt => {
        const b = document.createElement('button');
        b.className = 'tpl-planet-btn';
        b.dataset.planet = pt.name;
        b.type = 'button';
        b.innerHTML = '<img src="planet-images/' + pt.name.toLowerCase() + '.jpg" alt="' + escapeHtml(pt.name) + '">' +
            '<span>' + escapeHtml(pt.name) + '</span>';
        b.addEventListener('click', () => {
            if (!TS.current) return;
            TS.current.planetType = pt.name;
            tplAutosave();
            tplSyncPanel();
            draw();
        });
        planetGrid.appendChild(b);
    });

    document.querySelectorAll('.tpl-tool').forEach(btn => {
        btn.addEventListener('click', () => {
            TS.tool = btn.dataset.tool;
            document.querySelectorAll('.tpl-tool').forEach(b => b.classList.toggle('active', b === btn));
            if (TS.tool !== 'route') { TS.routeSourceId = null; }
            tplRenderInspector();
            canvas.style.cursor = TS.tool === 'select' ? 'grab' : 'crosshair';
        });
    });

    document.getElementById('tplUpgrade').addEventListener('change', () => {
        if (!TS.current) return;
        TS.current.upgradeLevel = parseInt(document.getElementById('tplUpgrade').value, 10) || 0;
        tplAutosave();
        tplRenderInspector();
        draw();
    });

    document.getElementById('tplNew').addEventListener('click', () => {
        TS.current = tplNewTemplate(TS.current ? TS.current.planetType : 'temperate');
        TS.currentId = null;
        TS.selectedPinId = null;
        TS.routeSourceId = null;
        tplAutosave();
        tplSyncPanel();
        tplFitView();
        TS.fitted = true;
        tplToast('New planet started');
    });
    document.getElementById('tplSave').addEventListener('click', () => {
        const name = window.prompt('Template name:', TS.current.name || 'Untitled Planet');
        if (name === null) return;
        TS.current.name = name || 'Untitled Planet';
        if (!TS.current.id) TS.current.id = 't' + Date.now();
        TS.currentId = TS.current.id;
        tplUpsertLib(TS.current);
        tplRenderLib();
        tplToast('Saved to library');
    });
    document.getElementById('tplCopyEve').addEventListener('click', tplExportEve);
    document.getElementById('tplExport').addEventListener('click', tplExportJSON);
    document.getElementById('tplShare').addEventListener('click', tplShareURL);
    document.getElementById('tplImport').addEventListener('click', () => document.getElementById('tplImportFile').click());
    document.getElementById('tplImportFile').addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) tplImportFile(e.target.files[0]);
        e.target.value = '';
    });
    document.getElementById('tplClear').addEventListener('click', () => {
        if (!window.confirm('Clear all pins on this planet?')) return;
        TS.current.detail = { pins: [], links: [], routes: [] };
        TS.selectedPinId = null;
        TS.routeSourceId = null;
        tplAutosave();
        tplRenderInspector();
        draw();
    });

    document.getElementById('tplInspector').addEventListener('change', e => {
        const id = TS.selectedPinId;
        const pin = tplPinById(id);
        if (!pin) return;
        if (e.target.id === 'tplPinProduct' && pin.extractor_details) {
            pin.extractor_details.product_type_id = parseInt(e.target.value, 10) || 0;
            tplAutosave(); draw();
        } else if (e.target.id === 'tplPinSchematic' && pin.factory_details) {
            pin.factory_details.schematic_id = parseInt(e.target.value, 10) || 0;
            tplAutosave(); draw();
        } else if (e.target.id === 'tplRouteMat') {
            TS.routeContentType = parseInt(e.target.value, 10) || null;
        }
    });

    document.getElementById('tplInspector').addEventListener('click', e => {
        if (e.target.id === 'tplDeletePin') tplDeletePin(TS.selectedPinId);
    });

    document.addEventListener('keydown', e => {
        if (AppState.viewMode !== 'template') return;
        const tag = (e.target && e.target.tagName) || '';
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && TS.selectedPinId != null) {
            e.preventDefault();
            tplDeletePin(TS.selectedPinId);
        }
    });

    TS.panelBuilt = true;
}

function tplSyncPanel() {
    const t = TS.current;
    const upSel = document.getElementById('tplUpgrade');
    if (!upSel || !t) return;
    document.querySelectorAll('.tpl-planet-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.planet === t.planetType);
    });
    upSel.value = String(t.upgradeLevel);
    tplRenderInspector();
    tplRenderLib();
}

function tplRenderInspector() {
    const el = document.getElementById('tplInspector');
    if (!el || !TS.current) return;
    const a = tplAnalyse();
    let html = '';
    if (a) {
        const cpuOk = a.usedCpu <= a.capCpu, pgOk = a.usedPg <= a.capPg;
        const pct = (v, c) => Math.max(0, Math.min(100, (v / c) * 100));
        html +=
            '<div class="tpl-validate">' +
            '<div class="tpl-val-row"><span>CPU</span>' +
            '<div class="tpl-bar"><div class="tpl-bar-fill ' + (cpuOk ? 'ok' : 'bad') + '" style="width:' + pct(a.usedCpu, a.capCpu) + '%"></div></div>' +
            '<span class="' + (cpuOk ? 'ok' : 'bad') + '">' + Math.round(a.usedCpu) + '/' + a.capCpu + '</span></div>' +
            '<div class="tpl-val-row"><span>PG</span>' +
            '<div class="tpl-bar"><div class="tpl-bar-fill ' + (pgOk ? 'ok' : 'bad') + '" style="width:' + pct(a.usedPg, a.capPg) + '%"></div></div>' +
            '<span class="' + (pgOk ? 'ok' : 'bad') + '">' + Math.round(a.usedPg) + '/' + a.capPg + '</span></div>' +
            '<div class="tpl-val-row"><span>Pins</span><span></span><span class="' + (tplCountPins() > MAX_PINS ? 'bad' : '') + '">' + tplCountPins() + '/' + MAX_PINS + '</span></div>' +
            '</div>';
    }

    const pin = tplPinById(TS.selectedPinId);
    if (pin) {
        const kind = tplClassifyPin(pin);
        html += '<div class="tpl-pin-edit"><h4>' + tplPinLabel(pin) + ' <span class="tpl-kind">(' + kind + ')</span></h4>';
        if (kind === 'extractor') {
            html += '<label>Product:<select id="tplPinProduct">';
            tplP0ForPlanet(TS.current.planetType).forEach(m => {
                html += '<option value="' + m.id + '"' + (pin.extractor_details && pin.extractor_details.product_type_id === m.id ? ' selected' : '') + '>' + escapeHtml(m.name) + '</option>';
            });
            html += '</select></label>';
            html += '<label>Qty/cycle:<input type="number" id="tplPinQty" value="' + (pin.extractor_details ? pin.extractor_details.qty_per_cycle : 0) + '" min="0"></label>';
        } else if (kind === 'processor') {
            html += '<label>Schematic:<select id="tplPinSchematic">';
            tplRecipeList().forEach(r => {
                html += '<option value="' + r.id + '"' + (pin.factory_details && pin.factory_details.schematic_id === r.id ? ' selected' : '') + '>' + escapeHtml(r.name) + ' (P' + (r.tier || '?') + ')</option>';
            });
            html += '</select></label>';
        }
        if (TS.tool === 'route' && TS.routeSourceId === pin.pin_id) {
            const def = TS.routeContentType || tplDefaultRouteMat(pin.pin_id);
            html += '<label>Route material:<select id="tplRouteMat">';
            Object.values(PI_DATA.materials).forEach(m => {
                html += '<option value="' + m.id + '"' + (def === m.id ? ' selected' : '') + '>' + escapeHtml(m.name) + '</option>';
            });
            html += '</select></label><p class="hint">Now click a destination pin.</p>';
        } else if (TS.tool === 'route' && TS.routeSourceId != null && TS.routeSourceId !== pin.pin_id) {
            html += '<p class="hint">Click the source pin first to pick a material, then a destination.</p>';
        }
        html += '<button id="tplDeletePin" class="calc-btn secondary tpl-del">Delete pin</button>';
        html += '</div>';
    } else if (TS.tool === 'link') {
        html += '<p class="hint">Click a source pin, then a destination pin, to toggle a link.</p>';
    } else if (TS.tool === 'route') {
        html += '<p class="hint">Click a source pin (pick material), then a destination pin.</p>';
    } else {
        html += '<p class="hint">Select a pin to edit it, or pick a tool above to add pins.</p>';
    }

    el.innerHTML = html;
    el.classList.remove('hidden');

    const qty = document.getElementById('tplPinQty');
    if (qty) {
        qty.addEventListener('change', () => {
            const p = tplPinById(TS.selectedPinId);
            if (p && p.extractor_details) {
                p.extractor_details.qty_per_cycle = parseInt(qty.value, 10) || 0;
                tplAutosave(); draw();
            }
        });
    }
}

function tplRenderLib() {
    const el = document.getElementById('tplLibList');
    if (!el) return;
    const arr = tplLoadLib();
    if (!arr.length) { el.innerHTML = '<p class="hint">No saved templates yet.</p>'; return; }
    el.innerHTML = arr.map(t =>
        '<div class="tpl-lib-item" data-id="' + escapeHtml(String(t.id)) + '">' +
        '<span class="tpl-lib-name">' + escapeHtml(t.name || 'Untitled') + '</span>' +
        '<span class="tpl-lib-meta">' + escapeHtml(t.planetType || '') + ' · ' + ((t.detail && t.detail.pins.length) || 0) + ' pins</span>' +
        '<button class="tpl-lib-load" data-act="load">Load</button>' +
        '<button class="tpl-lib-del" data-act="del">×</button>' +
        '</div>'
    ).join('');
    el.querySelectorAll('.tpl-lib-item').forEach(item => {
        const id = item.dataset.id;
        item.querySelector('[data-act="load"]').addEventListener('click', () => {
            const t = tplLoadLib().find(x => String(x.id) === id);
            if (!t) return;
            TS.current = t;
            TS.currentId = t.id;
            TS.nextPinId = tplMaxPinId(t) + 1;
            TS.selectedPinId = null;
            TS.routeSourceId = null;
            tplAutosave();
            tplSyncPanel();
            tplFitView();
            TS.fitted = true;
            tplToast('Loaded: ' + (t.name || 'template'));
        });
        item.querySelector('[data-act="del"]').addEventListener('click', () => {
            tplDeleteLib(id);
            tplRenderLib();
        });
    });
}

function tplEnsureCurrent() {
    if (TS.current) return;
    const saved = tplLoadAutosave();
    if (saved && saved.detail && Array.isArray(saved.detail.pins)) {
        TS.current = saved;
        TS.nextPinId = tplMaxPinId(saved) + 1;
    } else {
        TS.current = tplNewTemplate('temperate');
    }
    tplSyncPanel();
}

function tplDrawPin(p, w) {
    const kind = tplClassifyPin(p);
    let color = '#888';
    if (kind === 'cc') color = '#e8d900';
    else if (kind === 'extractor') {
        const ed = p.extractor_details;
        const m = ed && ed.product_type_id ? getMaterialById(ed.product_type_id) : null;
        color = m ? (PI_COLORS[m.tier] || '#6e7681') : '#6e7681';
    } else if (kind === 'processor') {
        const r = p.factory_details ? tplRecipeBySchematic(p.factory_details.schematic_id) : null;
        color = r ? (PI_COLORS[r.tier] || '#d29922') : '#d29922';
    } else if (kind === 'launchpad') color = '#58a6ff';
    else if (kind === 'storage') color = '#a371f7';
    const sel = p.pin_id === TS.selectedPinId, hov = p.pin_id === TS.hoverPinId;
    ctx.beginPath();
    ctx.arc(w.x, w.y, PIN_R, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeStyle = sel ? '#fff' : (hov ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.45)');
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 10px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tplPinLabel(p), w.x, w.y);
    ctx.textBaseline = 'top';
    const showHandles = (p.pin_id === TS.hoverPinId || p.pin_id === TS.selectedPinId || (TS.drag && TS.drag.mode === 'handleLink' && TS.drag.pinId === p.pin_id));
    if (showHandles) {
        for (const ang of TPL_HANDLE_ANGLES) {
            const a = ang * Math.PI / 180;
            const hx = w.x + PIN_R * Math.cos(a);
            const hy = w.y + PIN_R * Math.sin(a);
            const isDraggingFrom = TS.drag && TS.drag.mode === 'handleLink' && TS.drag.pinId === p.pin_id && TS.drag.startAngle === ang;
            ctx.beginPath();
            ctx.arc(hx, hy, TPL_HANDLE_DRAW_R / AppState.zoom, 0, Math.PI * 2);
            ctx.fillStyle = isDraggingFrom ? '#e8d900' : 'rgba(26,26,26,0.95)';
            ctx.fill();
            ctx.lineWidth = 1.4 / AppState.zoom;
            ctx.strokeStyle = isDraggingFrom ? '#fff' : 'rgba(210,210,210,0.95)';
            ctx.stroke();
        }
    }
}

function tplDrawView() {
    const t = TS.current;
    if (!t) return;
    ctx.beginPath();
    ctx.arc(0, 0, PLANET_R, 0, Math.PI * 2);
    ctx.fillStyle = tplPlanetColor(t.planetType);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, PLANET_R * i / 4, 0, Math.PI * 2);
        ctx.stroke();
    }
    for (let a = 0; a < 360; a += 30) {
        const th = a * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(PLANET_R * Math.cos(th), -PLANET_R * Math.sin(th));
        ctx.stroke();
    }

    const byId = {};
    t.detail.pins.forEach(p => byId[p.pin_id] = p);

    function edgePoints(pa, pb) {
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        return {
            a: { x: pa.x + ux * PIN_R, y: pa.y + uy * PIN_R },
            b: { x: pb.x - ux * PIN_R, y: pb.y - uy * PIN_R },
            ux, uy, len
        };
    }
    t.detail.links.forEach(l => {
        const a = byId[l.source_pin_id], b = byId[l.destination_pin_id];
        if (!a || !b) return;
        const pa = tplPinWorld(a), pb = tplPinWorld(b);
        const e = edgePoints(pa, pb);
        ctx.strokeStyle = l.link_level >= 1 ? 'rgba(248,113,113,0.9)' : 'rgba(210,210,210,0.55)';
        ctx.lineWidth = l.link_level >= 1 ? 2.2 : 1.6;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
    });

    const animOff = (Date.now() / 28) % 9;
    t.detail.routes.forEach(r => {
        const a = byId[r.source_pin_id], b = byId[r.destination_pin_id];
        if (!a || !b) return;
        const pa = tplPinWorld(a), pb = tplPinWorld(b);
        const e = edgePoints(pa, pb);
        const mat = getMaterialById(r.content_type_id);
        const col = mat ? (PI_COLORS[mat.tier] || '#fff') : '#fff';
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -animOff;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        const ang = Math.atan2(e.uy, e.ux);
        const ah = 7 / AppState.zoom;
        const ax = e.b.x, ay = e.b.y;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - ah * Math.cos(ang - 0.45), ay - ah * Math.sin(ang - 0.45));
        ctx.lineTo(ax - ah * Math.cos(ang + 0.45), ay - ah * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fill();
    });

    if (TS.drag && (TS.drag.mode === 'link' || TS.drag.mode === 'route' || TS.drag.mode === 'handleLink') && TS.drag.pinId != null) {
        const a = byId[TS.drag.pinId];
        if (a && TS.drag.lastScreen) {
            const pa = tplHandleEdgeWorld(a, TS.drag.startAngle != null ? TS.drag.startAngle : 0);
            const sp = screenToWorld(TS.drag.lastScreen.x, TS.drag.lastScreen.y);
            const isRoute = TS.drag.kind === 'route' || TS.drag.mode === 'route';
            if (isRoute) {
                const matId = TS.routeContentType || tplDefaultRouteMat(TS.drag.pinId);
                const mat = matId ? getMaterialById(matId) : null;
                ctx.strokeStyle = mat ? (PI_COLORS[mat.tier] || '#e8d900') : 'rgba(232,217,0,0.85)';
            } else {
                ctx.strokeStyle = 'rgba(232,217,0,0.85)';
            }
            ctx.setLineDash(isRoute ? [5, 4] : [4, 4]);
            if (isRoute) ctx.lineDashOffset = -animOff;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(sp.x, sp.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }
    }
    if (t.detail.routes.length && AppState.viewMode === 'template') {
        try { requestAnimationFrame(() => { if (AppState.viewMode === 'template') draw(); }); } catch (_) {}
    }

    t.detail.pins.forEach(p => tplDrawPin(p, tplPinWorld(p)));
}

function tplFitView() {
    const pad = 80;
    const availW = AppState.cssW - pad * 2;
    const availH = AppState.cssH - pad * 2;
    const z = Math.max(0.25, Math.min(4, Math.min(availW / (PLANET_R * 2), availH / (PLANET_R * 2))));
    AppState.zoom = z;
    AppState.canvasOffset.x = AppState.cssW / 2;
    AppState.canvasOffset.y = AppState.cssH / 2;
    const zl = document.getElementById('zoomLevel');
    if (zl) zl.textContent = Math.round(z * 100) + '%';
    draw();
}

function tplPinAt(pos) {
    if (!TS.current) return null;
    let best = null, bestD = Infinity;
    TS.current.detail.pins.forEach(p => {
        const w = tplPinWorld(p);
        const s = worldToScreen(w.x, w.y);
        const d = Math.hypot(s.x - pos.x, s.y - pos.y);
        const r = PIN_R * AppState.zoom + 6;
        if (d < r && d < bestD) { bestD = d; best = p.pin_id; }
    });
    return best;
}

function tplPointerDown(e) {
    const pos = getCanvasPos(e);
    const w = screenToWorld(pos.x, pos.y);
    const rr = Math.hypot(w.x, w.y);
    const tool = TS.tool;

    if (['cc', 'extractor', 'processor', 'storage', 'launchpad'].includes(tool)) {
        if (rr <= PLANET_R) {
            const ll = tplWorldToLatLng(w.x, w.y);
            tplPlacePin(tool, ll.lat, ll.lng);
        } else {
            tplToast('Click inside the planet to place a pin');
        }
        AppState.pointerDown = pos;
        AppState.pointerId = e.pointerId;
        AppState.isDraggingCanvas = false;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        return;
    }

    const handle = tplHandleAt(pos);
    if (handle) {
        const kind = e.shiftKey || tool === 'route' ? 'route' : 'link';
        if (kind === 'route' && TS.routeSourceId == null) {
            TS.routeContentType = tplDefaultRouteMat(handle.pinId);
        }
        TS.drag = { mode: 'handleLink', pinId: handle.pinId, startAngle: handle.angle, lastScreen: pos, kind, moved: false };
        tplSelectPin(handle.pinId);
        AppState.pointerDown = pos;
        AppState.pointerId = e.pointerId;
        AppState.isDraggingCanvas = true;
        AppState.hasDragged = false;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        draw();
        return;
    }
    const hit = tplPinAt(pos);
    if (tool === 'select') {
        if (hit) {
            TS.drag = { mode: 'move', pinId: hit, lastScreen: pos, moved: false };
            tplSelectPin(hit);
        } else {
            TS.drag = { mode: 'pan', lastScreen: pos };
            TS.selectedPinId = null;
            tplRenderInspector();
        }
    } else if (tool === 'link') {
        if (hit) TS.drag = { mode: 'link', pinId: hit, lastScreen: pos };
    } else if (tool === 'route') {
        if (hit) {
            if (TS.routeSourceId == null) {
                TS.routeSourceId = hit;
                TS.routeContentType = tplDefaultRouteMat(hit);
                tplRenderInspector();
            } else if (hit !== TS.routeSourceId) {
                const mat = TS.routeContentType || tplDefaultRouteMat(TS.routeSourceId);
                tplAddRoute(TS.routeSourceId, hit, mat);
                TS.routeSourceId = null;
                tplRenderInspector();
            }
        } else {
            TS.routeSourceId = null;
            tplRenderInspector();
        }
    }
    AppState.pointerDown = pos;
    AppState.pointerId = e.pointerId;
    AppState.isDraggingCanvas = true;
    AppState.hasDragged = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
}

function tplPointerMove(e) {
    const pos = getCanvasPos(e);
    if (TS.drag && TS.drag.mode === 'pan') {
        const dx = pos.x - TS.drag.lastScreen.x;
        const dy = pos.y - TS.drag.lastScreen.y;
        AppState.canvasOffset.x += dx;
        AppState.canvasOffset.y += dy;
        TS.drag.lastScreen = pos;
        draw();
        return;
    }
    if (TS.drag && TS.drag.mode === 'move') {
        const w = screenToWorld(pos.x, pos.y);
        if (Math.hypot(w.x, w.y) <= PLANET_R) {
            const ll = tplWorldToLatLng(w.x, w.y);
            const p = tplPinById(TS.drag.pinId);
            if (p) { p.latitude = ll.lat; p.longitude = ll.lng; }
            tplAutosave();
            draw();
        }
        TS.drag.moved = true;
        return;
    }
    if (TS.drag && (TS.drag.mode === 'link' || TS.drag.mode === 'route' || TS.drag.mode === 'handleLink')) {
        TS.drag.lastScreen = pos;
        if (TS.drag.mode === 'handleLink') TS.drag.moved = true;
        draw();
        return;
    }
    const hovHandle = tplHandleAt(pos);
    const hit = hovHandle ? hovHandle.pinId : tplPinAt(pos);
    if (hit !== TS.hoverPinId) {
        TS.hoverPinId = hit;
        const isHandle = !!hovHandle;
        if (isHandle) {
            canvas.style.cursor = hovHandle ? 'grab' : 'pointer';
        } else {
            canvas.style.cursor = hit ? 'pointer' : (TS.tool === 'select' ? 'grab' : 'crosshair');
        }
        draw();
    } else if (hovHandle) {
        canvas.style.cursor = 'grab';
    }
}

function tplPointerUp(e) {
    const pos = getCanvasPos(e);
    if (TS.drag && TS.drag.mode === 'handleLink') {
        const targetHandle = tplHandleAt(pos);
        const targetPin = targetHandle ? targetHandle.pinId : tplPinAt(pos);
        if (targetPin && targetPin !== TS.drag.pinId) {
            if (TS.drag.kind === 'route') {
                const mat = TS.routeContentType || tplDefaultRouteMat(TS.drag.pinId);
                tplAddRoute(TS.drag.pinId, targetPin, mat);
                TS.routeSourceId = null;
                tplRenderInspector();
            } else {
                tplToggleLink(TS.drag.pinId, targetPin);
            }
        }
        TS.drag = null;
        AppState.isDraggingCanvas = false;
        AppState.pointerDown = null;
        AppState.pointerId = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        draw();
        return;
    }
    if (TS.drag && TS.drag.mode === 'link') {
        const hit = tplPinAt(pos);
        if (hit && hit !== TS.drag.pinId) tplToggleLink(TS.drag.pinId, hit);
    }
    if (TS.drag && TS.drag.mode === 'route') {
        const hit = tplPinAt(pos);
        if (hit && hit !== TS.drag.pinId) {
            const mat = TS.routeContentType || tplDefaultRouteMat(TS.drag.pinId);
            tplAddRoute(TS.drag.pinId, hit, mat);
            TS.routeSourceId = null;
            tplRenderInspector();
        }
    }
    TS.drag = null;
    AppState.isDraggingCanvas = false;
    AppState.pointerDown = null;
    AppState.pointerId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
}

function tplPointerCancel(e) {
    TS.drag = null;
    AppState.isDraggingCanvas = false;
    AppState.pointerDown = null;
    AppState.pointerId = null;
}

function tplSetup() {
    tplBuildPanel();
    tplEnsureCurrent();
    TS.fitted = false;
    if (window.__pendingTplHash) {
        try { restoreFromUrl(); } catch (_) { /* ignore malformed pending hash */ }
        window.__pendingTplHash = null;
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tplSetup);
    else tplSetup();
}
