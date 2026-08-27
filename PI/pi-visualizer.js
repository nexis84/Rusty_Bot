// PI Chain Visualizer - Main Application
// SDE-driven: data loaded from pi-data.js (core) + pi-systems.js (lazy, system checker)

console.log('PI Visualizer loading...');

const ESI_BASE = 'https://esi.evetech.net/latest';
const DEFAULT_REGION = '10000002'; // Jita/The Forge

// Application State
const AppState = {
    canvasOffset: { x: 0, y: 0 },
    zoom: 1,
    viewMode: 'reference', // 'reference', 'system', 'chain', 'planets', 'colonies', 'finder'
    refSubview: 'materials', // 'materials' | 'planets' - sub-view inside the Reference canvas
    marketPrices: {},
    targetProduct: null,
    isDraggingCanvas: false,
    lastMousePos: { x: 0, y: 0 },
    chainLayout: null,
    chainHistory: [],        // product navigation stack for the Prev button
    suppressHistoryPush: false,
    viewHistory: [],           // view navigation stack for the Back button
    suppressViewHistoryPush: false,
    currentTab: 'ref',
    hoveredCard: null,
    hoverChainNode: null,    // material id of the chain node under the cursor (for tooltip)
    chainFocus: null,        // clicked node material id - highlights its input subtree, dims the rest
    _lastClickId: null,      // for double-click detection (click = focus, dbl-click = navigate)
    _lastClickTime: 0,
    systemsLoaded: false,
    planetsLoaded: false,
    colonies: null,
    coloniesLoading: false,
    colonyDetail: null,
    colonyCards: [],
    colonyPrices: {},
    colonySkills: null,     // { consolidation, ccUpgrades, fetchedAt } or null
    colonyIdleOnly: false,
    layoutMode: false,      // colony detail: show planet layout map instead of details
    layoutSel: null,        // selected pin id in layout view
    layoutHover: null,      // hovered pin id in layout view (shows breakdown)
    hoverPos: { x: 0, y: 0 }, // cursor position (canvas-relative) for tooltip placement
    colonyLayoutData: null, // projected layout for hit-testing (set during draw)
    pendingColonyId: null,  // deep link: open this colony once loaded
    pendingLayoutMode: false,
    cssW: 0, // CSS-pixel canvas size (backing store is scaled by devicePixelRatio)
    cssH: 0,
    pendingHit: null,
    pointerDown: null,
    pointerId: null,
    jumpsLoaded: false,
    finder: {
        originSystemId: null,   // resolved starting system for searches
        originSource: null,     // 'esi' | 'manual'
        expandedSpot: null,     // system id whose route line is expanded
        _bfs: null,             // last BFS result Map (for route reconstruction)
        spotRows: [],           // full-coverage build-spot results (canvas view)
        activePanel: null,      // which results the canvas shows: 'spot'
        spotProductName: '',    // product the spot cards are for (card header)
        scanResults: [],        // ranked products from the market scan
        bestProductId: null,    // #1 by Jita profit
        bestStats: null,        // {profit, margin, profitLocal, marginLocal} for the banner
        localRegionName: '',    // comparison region shown on next-best cards
        locationAuthNeeded: false // stale login lacks the location scope
    },
    finderCards: [],             // canvas hit areas for the finder view
    systemData: null,            // last System Checker result {system, planetTypes, skyhookTotals, counts, producibleP2/P3/P4}
    systemCards: []              // hit areas for producible items in system canvas view
};

const PI_COLORS = ['#6e7681', '#58a6ff', '#d29922', '#a371f7', '#3fb950'];

// Canvas setup
const canvas = document.getElementById('piCanvas');
const ctx = canvas.getContext('2d');

// DOM Elements
const elements = {
    regionSelect: document.getElementById('regionSelect'),
    finderProduct: document.getElementById('finderProduct'),
    viewReference: document.getElementById('viewReference'),
    viewSystem: document.getElementById('viewSystem'),
    viewChain: document.getElementById('viewChain'),
    viewPlanets: null, // standalone Planets toolbar tab removed; planets now live inside Reference
    chainProductSelect: document.getElementById('chainProductSelect'),
    chainProductGo: document.getElementById('chainProductGo'),
    viewColonies: document.getElementById('viewColonies'),
    viewFinder: document.getElementById('viewFinder'),
    backToRef: document.getElementById('backToRef'),
    zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'),
    zoomLevel: document.getElementById('zoomLevel'),
    fitView: document.getElementById('fitView'),
    marketLoading: document.getElementById('marketLoading'),
    marketContent: document.getElementById('marketContent'),
    outputValue: document.getElementById('outputValue'),
    inputCost: document.getElementById('inputCost'),
    rawCost: document.getElementById('rawCost'),
    profitValue: document.getElementById('profitValue'),
    profitMargin: document.getElementById('profitMargin'),
    priceList: document.getElementById('priceList'),
    // System checker elements
    systemInput: document.getElementById('systemInput'),
    checkSystem: document.getElementById('checkSystem'),
    systemResults: document.getElementById('systemResults'),
    systemInfo: document.getElementById('systemInfo'),
    systemPlanets: document.getElementById('systemPlanets'),
    producibleP2: document.getElementById('producibleP2'),
    producibleP3: document.getElementById('producibleP3'),
    producibleP4: document.getElementById('producibleP4'),
    // Reference elements
    refP1: document.getElementById('refP1'),
    refP2: document.getElementById('refP2'),
    refP3: document.getElementById('refP3'),
    refP4: document.getElementById('refP4'),
    // Colonies elements
    coloniesStatus: document.getElementById('coloniesStatus'),
    coloniesCharacter: document.getElementById('coloniesCharacter'),
    coloniesContent: document.getElementById('coloniesContent'),
    coloniesHeader: document.getElementById('coloniesHeader'),
    coloniesList: document.getElementById('coloniesList'),
    coloniesLogin: document.getElementById('coloniesLogin'),
    coloniesRefresh: document.getElementById('coloniesRefresh'),
    coloniesLogout: document.getElementById('coloniesLogout'),
    // Product breakdown (Planets Needed) panel
    productBreakdown: document.getElementById('productBreakdown'),
    breakdownContent: document.getElementById('breakdownContent'),
    // Finder elements
    finderControls: document.getElementById('finderControls'),
    finderLoginBtn: document.getElementById('finderLoginBtn'),
    finderCharacter: document.getElementById('finderCharacter'),
    finderLogout: document.getElementById('finderLogout'),
    finderLocate: document.getElementById('finderLocate'),
    finderOriginLabel: document.getElementById('finderOriginLabel'),
    finderSystemInput: document.getElementById('finderSystemInput'),
    finderSetSystem: document.getElementById('finderSetSystem'),
    finderJumps: document.getElementById('finderJumps'),
    finderMaxSystems: document.getElementById('finderMaxSystems'),
    finderSecFilter: document.getElementById('finderSecFilter'),
    finderSearchSpot: document.getElementById('finderSearchSpot'),
    finderSpotResults: document.getElementById('finderSpotResults'),
    finderScanProfit: document.getElementById('finderScanProfit'),
    finderScanRegion: document.getElementById('finderScanRegion'),
    finderProgress: document.getElementById('finderProgress'),
    finderProfitResults: document.getElementById('finderProfitResults'),
    finderDom: document.getElementById('finderDom'),
    finderHero: document.getElementById('finderHero'),
    finderMetric: document.getElementById('finderMetric'),
    finderSub: document.getElementById('finderSub'),
    finderGrid: document.getElementById('finderGrid'),
    finderEmpty: document.getElementById('finderEmpty'),
    finderMore: document.getElementById('finderMore'),
    finderNextBest: document.getElementById('finderNextBest'),
    finderNextBestGrid: document.getElementById('finderNextBestGrid'),
    finderKicker: document.getElementById('finderKicker'),
    colonyTimeline: document.getElementById('colonyTimeline'),
    coloniesTimelineMain: document.getElementById('coloniesTimelineMain'),
    coloniesDom: document.getElementById('coloniesDom'),
    coloniesHero: document.getElementById('coloniesHero'),
    coloniesMetric: document.getElementById('coloniesMetric'),
    coloniesSub: document.getElementById('coloniesSub'),
    coloniesTimelineDom: document.getElementById('coloniesTimelineDom'),
    coloniesGrid: document.getElementById('coloniesGrid'),
    coloniesEmpty: document.getElementById('coloniesEmpty'),
    coloniesMore: document.getElementById('coloniesMore'),
    coloniesKicker: document.getElementById('coloniesKicker'),
    colonySkillBanner: document.getElementById('colonySkillBanner'),
    colonyIdleFilter: document.getElementById('colonyIdleFilter'),
    colonyFilterCount: document.getElementById('colonyFilterCount')
};

// ---------- Data access helpers (new SDE-driven structure) ----------
function getMaterialsByTier(tier) {
    const ids = (PI_DATA.tiers && PI_DATA.tiers[tier]) || [];
    return ids.map(id => PI_DATA.materials[id]).filter(Boolean);
}

function getMaterialById(id) {
    return PI_DATA.materials[id] || null;
}

function getPlanetTypeData(typeId) {
    return PI_DATA.planetTypes[typeId] || null;
}

// Resolve a planet type from either an integer type ID (SDE) or an ESI string name
// (e.g. "temperate", "barren", "plasma"). Returns null if unknown.
let planetTypeNameCache = null;
function getPlanetTypeByNameOrId(value) {
    if (value === null || value === undefined || value === '') return null;

    // Integer ID (SDE keys) — direct lookup
    if (typeof value === 'number' || /^\d+$/.test(String(value))) {
        return getPlanetTypeData(Number(value));
    }

    // ESI string name — lazy-build a lowercase name -> planetTypes entry map
    if (!planetTypeNameCache) {
        planetTypeNameCache = {};
        for (const id in PI_DATA.planetTypes) {
            const pt = PI_DATA.planetTypes[id];
            const key = (pt.name || '').toLowerCase();
            if (key) planetTypeNameCache[key] = pt;
        }
    }

    return planetTypeNameCache[String(value).toLowerCase()] || null;
}

// Build a chain tree: { target, inputs } where every node has the shape
// { id, name, tier, batchSize, inputs: [ { id, qty, name, tier, subChain } ] }.
// subChain is the child node (or null for P0 / terminal materials).
function getChainForProduct(productId) {
    const mat = getMaterialById(productId);
    if (!mat) return null;

    const inputs = [];
    if (mat.inputs) {
        for (const [idStr, qty] of Object.entries(mat.inputs)) {
            const id = parseInt(idStr);
            const subMat = getMaterialById(id);
            const subChain = getChainForProduct(id);
            inputs.push({
                id,
                qty,
                name: subMat ? subMat.name : String(id),
                tier: subMat ? subMat.tier : 0,
                subChain: subChain ? subChain.target : null
            });
        }
    }

    const target = {
        id: mat.id,
        name: mat.name,
        tier: mat.tier,
        batchSize: mat.batchSize || 1,
        inputs,
        qty: 1
    };

    return { target, inputs };
}

// Flatten an input reference into a drawable node (uses subChain or a terminal P0 node)
function nodeFor(input) {
    return input.subChain || { id: input.id, name: input.name, tier: input.tier, batchSize: 1, inputs: [], qty: input.qty };
}

// P0 -> planet type IDs where it can be extracted
function getPlanetTypesForP0(p0Id) {
    const typeIds = (PI_DATA.p0ToPlanetTypes && PI_DATA.p0ToPlanetTypes[p0Id]) || [];
    return typeIds
        .map(tid => getPlanetTypeData(tid))
        .filter(Boolean)
        .map(pt => ({ type: pt.name, name: pt.name, color: pt.color }));
}

// Walk a material's input chain down to raw (P0) resources and return the
// distinct planet types required to produce it. Returns planet names + colors
// only (used by the "Planets Needed" aggregate panel).
function getRequiredPlanetTypes(materialId) {
    const p0Ids = new Set();
    const collectP0 = (node) => {
        if (!node || !node.inputs) return;
        node.inputs.forEach(input => {
            const sub = getMaterialById(input.id);
            const isRaw = !sub || sub.tier === 0 || !sub.inputs || Object.keys(sub.inputs).length === 0;
            if (isRaw) {
                p0Ids.add(input.id);
            } else {
                const subChain = getChainForProduct(input.id);
                if (subChain && subChain.target) collectP0(subChain.target);
            }
        });
    };
    const root = getChainForProduct(materialId);
    if (root && root.target) collectP0(root.target);
    const self = getMaterialById(materialId);
    if (self && (!self.inputs || Object.keys(self.inputs).length === 0)) {
        p0Ids.add(materialId);
    }

    const planetTypeIds = new Set();
    p0Ids.forEach(p0 => {
        const types = (PI_DATA.p0ToPlanetTypes && PI_DATA.p0ToPlanetTypes[p0]) || [];
        types.forEach(t => planetTypeIds.add(t));
    });

    const result = [];
    planetTypeIds.forEach(tid => {
        const pt = getPlanetTypeData(tid);
        if (pt) result.push({ id: tid, name: pt.name, color: pt.color });
    });
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
}

// Populate the product breakdown panel with the distinct planet types needed
// to produce the selected product across its whole chain.
function renderPlanetsNeeded(productId) {
    const panel = elements.productBreakdown;
    const container = elements.breakdownContent;
    if (!panel || !container) return;

    const planets = getRequiredPlanetTypes(productId);
    if (!planets.length) {
        container.innerHTML = '<p class="hint">This is a raw resource extracted directly from a planet type.</p>';
    } else {
        const badges = planets.map(p =>
            `<span class="planet-type-badge" style="background: ${p.color};" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>`
        ).join(' ');
        container.innerHTML =
            `<div class="planets-needed">` +
            `<span class="planets-needed-label"><i class="fas fa-globe"></i> Planets Needed:</span>` +
            `<span class="planets-needed-badges">${badges}</span></div>`;
    }
    panel.classList.remove('hidden');
}

// ---------- Initialize ----------
function init() {
    console.log('init() called');
    populateProductDropdowns();
    setupCanvas();
    setupEventListeners();
    setupTabs();
    setupReferenceGrids();
    setupSystemChecker();
    setupFinder();
    setupColonies();
    refreshColoniesAuthState();
    hideMarketData();
    // Respect SSO return hash — don't clobber it with a default view
    if (window.location.hash && window.location.hash.length > 1) {
        restoreFromUrl();
    } else {
        setViewMode('reference');
    }
    // Ensure timeline elements that were null at script load (before DOM) are bound now
    if (!elements.coloniesTimelineMain) elements.coloniesTimelineMain = document.getElementById('coloniesTimelineMain');
    if (!elements.coloniesDom) elements.coloniesDom = document.getElementById('coloniesDom');
    if (!elements.coloniesHero) elements.coloniesHero = document.getElementById('coloniesHero');
    if (!elements.coloniesMetric) elements.coloniesMetric = document.getElementById('coloniesMetric');
    if (!elements.coloniesSub) elements.coloniesSub = document.getElementById('coloniesSub');
    if (!elements.coloniesTimelineDom) elements.coloniesTimelineDom = document.getElementById('coloniesTimelineDom');
    if (!elements.coloniesGrid) elements.coloniesGrid = document.getElementById('coloniesGrid');
    if (!elements.coloniesEmpty) elements.coloniesEmpty = document.getElementById('coloniesEmpty');
    if (!elements.coloniesMore) elements.coloniesMore = document.getElementById('coloniesMore');
    if (!elements.coloniesKicker) elements.coloniesKicker = document.getElementById('coloniesKicker');
    if (!elements.colonyTimeline) elements.colonyTimeline = document.getElementById('colonyTimeline');
    if (!elements.colonySkillBanner) elements.colonySkillBanner = document.getElementById('colonySkillBanner');
    if (!elements.colonyIdleFilter) elements.colonyIdleFilter = document.getElementById('colonyIdleFilter');
    if (!elements.colonyFilterCount) elements.colonyFilterCount = document.getElementById('colonyFilterCount');
    console.log('Init complete');
}

// Market data filter state
AppState.hideMarketPrices = false;

function populateProductSelect(select) {
    if (!select) return;
    const groups = [
        { label: 'P4 Products', tier: 4 },
        { label: 'P3 Products', tier: 3 },
        { label: 'P2 Products', tier: 2 },
        { label: 'P1 Materials', tier: 1 }
    ];
    const frag = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select Product...';
    frag.appendChild(placeholder);
    groups.forEach(g => {
        const optGroup = document.createElement('optgroup');
        optGroup.label = g.label;
        getMaterialsByTier(g.tier).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            optGroup.appendChild(opt);
        });
        frag.appendChild(optGroup);
    });
    select.appendChild(frag);
}

function populateProductDropdowns() {
    populateProductSelect(elements.finderProduct);
    populateProductSelect(elements.chainProductSelect);
}

function setupCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    AppState.cssW = container.clientWidth;
    AppState.cssH = container.clientHeight;
    canvas.width = Math.round(AppState.cssW * dpr);
    canvas.height = Math.round(AppState.cssH * dpr);
    canvas.style.width = AppState.cssW + 'px';
    canvas.style.height = AppState.cssH + 'px';
    // Draw in CSS pixels; the backing store is dpr-scaled for sharp HiDPI output.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
}

function setupEventListeners() {
    // Canvas interactions - Pointer Events cover mouse, touch and pen, and
    // setPointerCapture keeps drags alive even when the pointer leaves the canvas.
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Controls
    elements.viewReference.addEventListener('click', () => setViewMode('reference'));
    if (elements.viewSystem) elements.viewSystem.addEventListener('click', () => setViewMode('system'));
    elements.viewChain.addEventListener('click', () => setViewMode('chain'));
    elements.viewColonies.addEventListener('click', () => {
        setViewMode('colonies');
        if (AppState.coloniesLoading || AppState.colonies) {
            draw();
        } else {
            refreshColoniesAuthState();
        }
    });
    elements.viewFinder.addEventListener('click', () => setViewMode('finder'));
    // Market data filter for reference page
    const marketFilterBtn = document.getElementById('marketFilterBtn');
    if (marketFilterBtn) {
        marketFilterBtn.addEventListener('click', () => {
            AppState.hideMarketPrices = !AppState.hideMarketPrices;
            marketFilterBtn.innerHTML = `<i class="fas fa-${AppState.hideMarketPrices ? 'eye-slash' : 'chart-line'}"></i> Market Prices`;
            draw();
        });
    }

    // Reference sub-view toggle (Materials <-> Planets), integrated inside Reference
    document.querySelectorAll('.subview-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sub = btn.dataset.sub;
            if (sub === AppState.refSubview) return;
            AppState.refSubview = sub;
            document.querySelectorAll('.subview-btn').forEach(b => b.classList.toggle('active', b === btn));
            // Reset scroll when switching sub-views so the new content starts at the top
            AppState.canvasOffset = { x: 0, y: 0 };
            draw();
        });
    });

    // Chain sidebar panel: pick a product to view its production chain
    const goChain = () => {
        const id = parseInt(elements.chainProductSelect?.value, 10);
        if (id) navigateToProduct(id);
    };
    if (elements.chainProductSelect) {
        elements.chainProductSelect.addEventListener('change', goChain);
    }
    if (elements.chainProductGo) {
        elements.chainProductGo.addEventListener('click', function () {
            goChain();
        });
    }
    elements.backToRef.addEventListener('click', () => {
        // Chain product history takes priority while in chain view (replaces Prev button)
        if (AppState.viewMode === 'chain' && AppState.chainHistory.length > 0) {
            const prev = AppState.chainHistory.pop();
            AppState.suppressHistoryPush = true;
            navigateToProduct(prev);
            return;
        }
        const prev = AppState.viewHistory.pop();
        if (!prev) {
            setViewMode('reference');
            return;
        }
        AppState.suppressViewHistoryPush = true;
        setViewMode(prev);
    });

    elements.zoomIn.addEventListener('click', () => setZoom(AppState.zoom * 1.2));
    elements.zoomOut.addEventListener('click', () => setZoom(AppState.zoom * 0.8));
    elements.fitView.addEventListener('click', fitView);

    // List views scroll with the keyboard too
    window.addEventListener('keydown', (e) => {
        if (AppState.viewMode !== 'finder' && AppState.viewMode !== 'system' && AppState.viewMode !== 'reference' && !(AppState.viewMode === 'colonies' && !(AppState.colonyDetail && AppState.layoutMode))) return;
        const tag = (e.target && e.target.tagName) || '';
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        const step = { ArrowUp: -48, ArrowDown: 48, PageUp: -240, PageDown: 240 }[e.key];
        if (step !== undefined) {
            e.preventDefault();
            AppState.canvasOffset.y += step;
            clampListScroll();
            draw();
        } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            resetViewport();
        }
    });

    elements.regionSelect.addEventListener('change', () => {
        if (AppState.targetProduct) {
            fetchMarketData();
        }
        if (AppState.colonies && AppState.colonies.length) {
            ensureColonyPrices();
        }
    });

    // Per-colony planet radius override (drives link CPU/Powergrid cost)
    elements.coloniesList.addEventListener('change', (e) => {
        const input = e.target;
        if (!input.classList || !input.classList.contains('colony-radius-input')) return;
        const planetId = Number(input.dataset.planet);
        setColonyRadiusOverride(planetId, input.value);
        const c = AppState.colonies && AppState.colonies.find(x => x.planet_id === planetId);
        if (c) delete c._analysis;
        if (AppState.colonyDetail && AppState.colonyDetail.planet_id === planetId) delete AppState.colonyDetail._analysis;
        if (AppState.viewMode === 'colonies') renderColonies(AppState.colonies || [], AppState.systemsLoaded);
        draw();
    });

    // Reference sidebar item clicks
    document.querySelectorAll('.ref-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            selectProduct(id);
        });
    });
}

// Tab Management
function activateSidebarTab(tab) {
    // Toggle the tab-button highlight
    document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.dataset.tab === tab) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
    // Switch the visible tab-content panel
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const targetPanel = document.getElementById(`tab-${tab}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }
    AppState.currentTab = tab;
    // Market Data only belongs on Chain and Ref tabs — hide on System/Colonies/Finder
    const marketPanel = document.getElementById('marketPanel');
    if (marketPanel) {
        const showMarket = tab === 'chain' || tab === 'ref';
        marketPanel.classList.toggle('hidden', !showMarket);
    }
}

function setupTabs() {
    const TAB_TO_VIEW = { chain: 'chain', system: 'system', colonies: 'colonies', finder: 'finder', ref: 'reference' };
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const tab = btn.dataset.tab;

            activateSidebarTab(tab);

            // Auto-select matching main canvas view
            const view = TAB_TO_VIEW[tab];
            if (view) setViewMode(view);

            if (tab === 'colonies') {
                refreshColoniesAuthState();
            } else {
                setColonyTick(false);
            }
            if (tab === 'finder') {
                refreshFinderAuthState();
            }
        });
    });
}

// ---------- Chain Calculation ----------
function navigateToProduct(id) {
    const idNum = parseInt(id);
    if (!idNum || !getMaterialById(idNum)) return;

    const prev = AppState.targetProduct;
    if (elements.finderProduct) elements.finderProduct.value = String(idNum);
    if (elements.chainProductSelect) elements.chainProductSelect.value = String(idNum);
    AppState.targetProduct = idNum;

    if (prev && prev !== idNum && !AppState.suppressHistoryPush) {
        AppState.chainHistory.push(prev);
    }
    AppState.suppressHistoryPush = false;
    AppState.chainFocus = null;

    // Switch to chain view before generating layout so fitChainView's zoom math
    // runs with isWorldZoomView()==true and the chain is centered.
    setViewMode('chain');
    generateChainLayout();
    fetchMarketData();
}

function selectProduct(id) {
    navigateToProduct(id);
}

function generateChainLayout() {
    const productId = AppState.targetProduct;
    const chain = getChainForProduct(productId);
    if (!chain) return;

    const layout = { nodes: [], links: [] };

    // Count nodes per depth for balanced layout
    const nodeCounts = {};
    const maxDepth = { value: 0 };
    const counted = new Set();
    const countNodes = (nodeData, depth) => {
        if (counted.has(nodeData.id)) return;
        counted.add(nodeData.id);
        maxDepth.value = Math.max(maxDepth.value, depth);
        nodeCounts[depth] = (nodeCounts[depth] || 0) + 1;
        if (nodeData.inputs) {
            nodeData.inputs.forEach(input => countNodes(nodeFor(input), depth + 1));
        }
    };
    countNodes(chain.target, 0);

    const levelWidth = 170;
    const nodeHeight = 110;
    const levelIndices = {};
    const nodeIdByMaterial = {};

    const addNode = (nodeData, depth, parentId = null) => {
        let nodeId = nodeIdByMaterial[nodeData.id];

        if (!nodeId) {
            levelIndices[depth] = (levelIndices[depth] || 0) + 1;
            const index = levelIndices[depth] - 1;
            const levelCount = nodeCounts[depth] || 1;
            const totalWidth = (levelCount - 1) * levelWidth;
            const x = (index * levelWidth) - totalWidth / 2;
            const y = (maxDepth.value - depth) * nodeHeight;

            const node = {
                id: `node-${layout.nodes.length}`,
                materialId: nodeData.id,
                name: nodeData.name,
                tier: nodeData.tier,
                x,
                y,
                qty: nodeData.qty || 1,
                planetTypes: nodeData.tier === 0 ? getPlanetTypesForP0(nodeData.id) : []
            };

            layout.nodes.push(node);
            nodeIdByMaterial[nodeData.id] = node.id;
            nodeId = node.id;
        }

        // Always record the edge, even when the child node is shared by
        // multiple parents (otherwise one parent's link would be dropped).
        if (parentId) {
            layout.links.push({ from: nodeId, to: parentId });
        }

        if (nodeData.inputs) {
            nodeData.inputs.forEach(input => {
                addNode(nodeFor(input), depth + 1, nodeId);
            });
        }
    };

    addNode(chain.target, 0);
    AppState.chainLayout = layout;
    renderPlanetsNeeded(productId);
    fitChainView(layout);
}

function fitChainView(layout) {
    if (!layout || layout.nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layout.nodes.forEach(n => {
        minX = Math.min(minX, n.x - 80);
        maxX = Math.max(maxX, n.x + 80);
        minY = Math.min(minY, n.y - 40);
        maxY = Math.max(maxY, n.y + 40);
    });

    const padding = 60;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    const scaleX = AppState.cssW / width;
    const scaleY = AppState.cssH / height;

    // Fit zoom must apply even if called before viewMode switches to chain
    // (reference -> chain navigation). Bypass isWorldZoomView guard.
    const targetZoom = Math.max(0.25, Math.min(4, Math.min(scaleX, scaleY, 1.5)));
    AppState.zoom = targetZoom;
    const zl = document.getElementById('zoomLevel');
    if (zl) zl.textContent = Math.round(AppState.zoom * 100) + '%';

    AppState.canvasOffset.x = -minX * AppState.zoom + padding * AppState.zoom + (AppState.cssW - width * AppState.zoom) / 2;
    AppState.canvasOffset.y = -minY * AppState.zoom + padding * AppState.zoom + (AppState.cssH - height * AppState.zoom) / 2;

    draw();
}

// ---------- Market Data (ESI with light local caching) ----------
const MARKET_CACHE_KEY = 'pi_market_cache_v2';
const MARKET_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MARKET_LOADING_HTML = '<i class="fas fa-spinner fa-spin"></i> Loading prices...';
const MARKET_ERROR_HTML = '<i class="fas fa-exclamation-circle"></i> Error loading prices';
let marketRequestId = 0;

function readMarketCache() {
    try {
        const raw = localStorage.getItem(MARKET_CACHE_KEY);
        if (!raw) return { region: null, entries: {} };
        const cache = JSON.parse(raw);
        if (!cache || typeof cache !== 'object' || !cache.entries || typeof cache.entries !== 'object') {
            return { region: null, entries: {} };
        }
        return cache;
    } catch (e) {
        return { region: null, entries: {} };
    }
}

// Returns a (possibly partial) map of typeId -> {sell} for the requested ids,
// using only entries that are fresh for this region.
function getCachedPrices(regionId, ids) {
    const cache = readMarketCache();
    if (String(cache.region) !== String(regionId)) return {};

    const now = Date.now();
    const prices = {};
    ids.forEach(id => {
        const entry = cache.entries[id];
        if (entry && entry.sell !== undefined && now - entry.ts <= MARKET_CACHE_TTL) {
            prices[id] = { sell: entry.sell };
        }
    });
    return prices;
}

function setCachedPrices(regionId, prices) {
    try {
        const cache = readMarketCache();
        if (String(cache.region) !== String(regionId)) {
            cache.region = String(regionId);
            cache.entries = {};
        }
        const now = Date.now();
        for (const id in prices) {
            cache.entries[id] = { sell: prices[id].sell, ts: now };
        }
        localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        // Storage may be full or unavailable - ignore
    }
}

async function fetchMarketData() {
    if (!AppState.targetProduct) return;

    const requestId = ++marketRequestId;
    const regionId = elements.regionSelect.value;
    const productId = AppState.targetProduct;

    const chain = getChainForProduct(productId);
    if (!chain) return;
    const materialIds = Array.from(collectMaterialIds(chain));

    elements.marketLoading.innerHTML = MARKET_LOADING_HTML;
    elements.marketLoading.classList.remove('hidden');
    elements.marketContent.classList.add('hidden');

    try {
        const cached = getCachedPrices(regionId, materialIds);
        const missing = materialIds.filter(id => !cached[id]);
        const prices = { ...cached };

        if (missing.length > 0) {
            const fetched = await fetchPricesForMaterials(missing, regionId);
            if (requestId !== marketRequestId) return; // a newer request superseded this one
            Object.assign(prices, fetched);
            setCachedPrices(regionId, fetched);
        }

        if (requestId !== marketRequestId) return; // stale

        AppState.marketPrices = prices;
        updateMarketDisplay(prices, chain);

        elements.marketLoading.classList.add('hidden');
        elements.marketContent.classList.remove('hidden');
    } catch (err) {
        if (requestId !== marketRequestId) return;
        console.error('Failed to fetch market data:', err);
        elements.marketLoading.innerHTML = MARKET_ERROR_HTML;
    }
}

function collectMaterialIds(chain, ids = new Set()) {
    if (!chain) return ids;

    const visit = (node) => {
        if (!node) return;
        ids.add(node.id);
        if (node.inputs) {
            node.inputs.forEach(input => visit(nodeFor(input)));
        }
    };
    visit(chain.target);

    return ids;
}

async function fetchPricesForMaterials(ids, regionId, onProgress) {
    const prices = {};
    const idArray = Array.from(ids);
    if (idArray.length === 0) return prices;

    // ESI has no batched market-orders endpoint, so fetch per type but throttle
    // to a small pool - firing all requests at once risked 420/429 rate limiting.
    const POOL_SIZE = 5;
    let cursor = 0;
    let done = 0;

    async function worker() {
        while (cursor < idArray.length) {
            const id = idArray[cursor++];
            try {
                const url = `${ESI_BASE}/markets/${regionId}/orders/?type_id=${id}&order_type=sell`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const orders = await response.json();
                const sells = orders.filter(o => o.is_buy_order === false && o.price > 0);
                if (sells.length > 0) {
                    sells.sort((a, b) => a.price - b.price);
                    prices[id] = { sell: sells[0].price };
                }
            } catch (e) {
                console.warn(`Failed to fetch orders for ${id}:`, e);
            }
            done++;
            if (onProgress) onProgress(done, idArray.length);
        }
    }

    const workers = Array.from({ length: Math.min(POOL_SIZE, idArray.length) }, worker);
    await Promise.all(workers);

    // Fill any missing prices from the region-wide price index
    const missing = idArray.filter(id => !prices[id]);
    if (missing.length > 0) {
        try {
            const res = await fetch(`${ESI_BASE}/markets/prices/`);
            if (res.ok) {
                const data = await res.json();
                missing.forEach(id => {
                    if (!prices[id]) {
                        const item = data.find(p => p.type_id === id);
                        if (item) {
                            prices[id] = { sell: item.average_price || item.adjusted_price || 0 };
                        }
                    }
                });
                // The index covers all tradeable types, so anything still missing
                // definitively has no market data - cache it as 0 so we don't
                // re-query these types on every fetch.
                missing.forEach(id => {
                    if (!prices[id]) prices[id] = { sell: 0 };
                });
            }
        } catch (e) {
            // Ignore fallback errors - unresolved ids will retry on the next fetch
        }
    }

    return prices;
}

// Pure chain math shared by the market panel and the Finder ISK maximizer:
// profit per batch = output sell value - buy cost of top-level inputs.
function chainProfitMath(chain, prices) {
    const targetPrice = prices[chain.target.id]?.sell || 0;
    const outputValue = targetPrice * (chain.target.batchSize || 1);

    // Buy cost: top-level inputs only (recursing would double-count intermediates)
    let totalInputCost = 0;
    (chain.inputs || []).forEach(input => {
        totalInputCost += (prices[input.id]?.sell || 0) * (input.qty || 1);
    });

    // Raw (P0/leaf) cost only - what the inputs cost if you extract everything yourself
    const isLeafInput = (input) =>
        !input.subChain || !input.subChain.inputs || input.subChain.inputs.length === 0;

    function sumRawCost(inputs) {
        let total = 0;
        (inputs || []).forEach(input => {
            if (isLeafInput(input)) {
                total += (prices[input.id]?.sell || 0) * (input.qty || 1);
            } else {
                total += sumRawCost(input.subChain.inputs);
            }
        });
        return total;
    }

    const rawCost = sumRawCost(chain.inputs);

    const profit = outputValue - totalInputCost;
    const margin = totalInputCost > 0 ? (profit / totalInputCost) * 100 : 0;

    return { outputValue, totalInputCost, rawCost, profit, margin };
}

function updateMarketDisplay(prices, chain) {
    const math = chainProfitMath(chain, prices);

    const priceItems = [];
    (chain.inputs || []).forEach(input => {
        const qty = input.qty || 1;
        const price = prices[input.id]?.sell || 0;
        priceItems.push({
            name: input.name,
            price,
            qty,
            total: price * qty,
            tier: input.tier
        });
    });

    elements.outputValue.textContent = formatISK(math.outputValue);
    elements.inputCost.textContent = formatISK(math.totalInputCost);
    if (elements.rawCost) elements.rawCost.textContent = formatISK(math.rawCost);

    const profitEl = elements.profitValue;
    profitEl.textContent = formatISK(math.profit);
    profitEl.className = 'value isk ' + (math.profit >= 0 ? 'positive' : 'negative');

    elements.profitMargin.textContent = math.margin.toFixed(1) + '%';

    elements.priceList.innerHTML = priceItems
        .sort((a, b) => b.tier - a.tier)
        .map(item => `
            <div class="price-item">
                <span class="material-name">${item.name} x${item.qty}</span>
                <span class="material-price">${formatISK(item.total)}</span>
            </div>
        `).join('');
}

function hideMarketData() {
    elements.marketLoading.classList.remove('hidden');
    elements.marketContent.classList.add('hidden');
    elements.marketLoading.innerHTML = '<i class="fas fa-chart-line"></i> Select a product to view market data';
}

// ---------- My Colonies (EVE SSO + ESI planetary management) ----------
function setupColonies() {
    if (elements.coloniesLogin) {
        elements.coloniesLogin.addEventListener('click', () => {
            if (!window.piEsiAuth) return;
            piEsiAuth.initiateLogin().catch(err => {
                console.error('PI SSO login failed:', err);
                if (elements.coloniesStatus) {
                    elements.coloniesStatus.classList.remove('hidden');
                    elements.coloniesStatus.innerHTML = '<div style="color: var(--danger)"><i class="fas fa-exclamation-circle"></i> ' + escapeHtml(err.message) + '</div>';
                }
            });
        });
    }
    if (elements.coloniesRefresh) {
        elements.coloniesRefresh.addEventListener('click', loadColonies);
    }
    if (elements.coloniesLogout) {
        elements.coloniesLogout.addEventListener('click', () => {
            if (window.piEsiAuth) piEsiAuth.logout();
            showColoniesLoggedOut();
        });
    }
    const idleEl = elements.colonyIdleFilter || document.getElementById('colonyIdleFilter');
    if (idleEl) {
        if (!elements.colonyIdleFilter) elements.colonyIdleFilter = idleEl;
        idleEl.addEventListener('change', (e) => {
            AppState.colonyIdleOnly = !!e.target.checked;
            if (AppState.colonies) renderColonies(AppState.colonies, AppState.systemsLoaded);
            if (AppState.viewMode === 'colonies') draw();
        });
    }
}

function refreshColoniesAuthState() {
    if (!window.piEsiAuth) return;
    updateSsoUI();
    if (piEsiAuth.isAuthenticated()) {
        loadColonies();
    } else {
        showColoniesLoggedOut();
    }
}

function showColoniesLoggedOut() {
    updateSsoUI();
    elements.coloniesStatus.classList.remove('hidden');
    elements.coloniesContent.classList.add('hidden');
}

// Shared login/logout state for the Finder + Colonies SSO sections
function updateSsoUI() {
    const authed = window.piEsiAuth && piEsiAuth.isAuthenticated();
    const label = authed ? 'Signed in: ' + (piEsiAuth.getCurrentCharacterName() || 'pilot') : 'Not signed in';
    if (elements.finderCharacter) elements.finderCharacter.textContent = label;
    if (elements.finderLoginBtn) elements.finderLoginBtn.classList.toggle('hidden', authed);
    if (elements.finderLogout) elements.finderLogout.classList.toggle('hidden', !authed);
    if (elements.coloniesCharacter) elements.coloniesCharacter.textContent = label;
    if (elements.coloniesLogin) elements.coloniesLogin.classList.toggle('hidden', authed);
    if (elements.coloniesLogout) elements.coloniesLogout.classList.toggle('hidden', !authed);
}

function showColoniesLoading() {
    elements.coloniesStatus.classList.add('hidden');
    elements.coloniesContent.classList.remove('hidden');
    elements.coloniesHeader.textContent = piEsiAuth.getCurrentCharacterName() ? `Loading colonies for ${piEsiAuth.getCurrentCharacterName()}...` : 'Loading colonies...';
    elements.coloniesList.innerHTML = '<div class="colony-item"><div class="colony-name"><i class="fas fa-spinner fa-spin"></i> Fetching colony data...</div></div>';
}

async function loadColonies() {
    if (!window.piEsiAuth || !piEsiAuth.isAuthenticated()) {
        showColoniesLoggedOut();
        return;
    }

    showColoniesLoading();
    AppState.coloniesLoading = true;
    AppState.colonies = null;

    try {
        const characterId = piEsiAuth.getCurrentCharacter();
        const colonies = await piEsiAuth.esiFetch(`/characters/${characterId}/planets/`);

        // Ensure system + planet data is loaded so we can resolve solar system
        // names and planet radii (radii power the link CPU/PG cost calc).
        const [systemsLoaded] = await Promise.all([ensureSystemsLoaded(), ensurePlanetsLoaded()]);

        // Fetch per-colony detail for producing/stored info (cached 600s by ESI)
        const detailed = [];
        for (const colony of colonies) {
            try {
                const detail = await piEsiAuth.esiFetch(`/characters/${characterId}/planets/${colony.planet_id}/`);
                detailed.push({ ...colony, detail });
            } catch (e) {
                console.warn(`Failed to fetch detail for planet ${colony.planet_id}:`, e);
                detailed.push({ ...colony, detail: null });
            }
        }

        // Fetch each planet's real radius + name (public ESI route) so link
        // CPU/PG cost is exact for every colony and the planet name is shown.
        await Promise.all(detailed.map(async c => {
            if (c.planet_id == null) return;
            const info = await ensurePlanetInfo(c.planet_id);
            c._esiRadius = info ? info.radius : null;
            c._planetName = info ? info.name : null;
        }));

        AppState.colonies = detailed;
        AppState.coloniesLoading = false;
        renderColonies(detailed, systemsLoaded);
        if (AppState.viewMode === 'colonies') draw();
        ensureColonyPrices();
        ensureColonySkills().then(() => { if (AppState.colonies) renderColonies(AppState.colonies, AppState.systemsLoaded); });

        // Colony deep link: open the requested colony once data is in
        if (AppState.pendingColonyId) {
            const target = detailed.find(c => c.planet_id === AppState.pendingColonyId);
            AppState.pendingColonyId = null;
            if (target) {
                AppState.colonyDetail = target;
                AppState.layoutMode = AppState.pendingLayoutMode;
                AppState.layoutSel = null;
                AppState.pendingLayoutMode = false;
                resetViewport();
                updateUrlState();
                draw();
            }
        }
    } catch (err) {
        console.error('Failed to load colonies:', err);
        AppState.coloniesLoading = false;
        AppState.colonies = null;
        elements.coloniesHeader.textContent = 'Colonies';
        elements.coloniesList.innerHTML = `<div class="colony-item" style="border-left-color: var(--danger)"><div class="colony-name">Failed to load colonies</div><div class="colony-meta">${escapeHtml(err.message)}</div></div>`;
    }
}

// Map a factory schematic ID -> recipe object (which carries outputId/name)
let schematicIndex = null;
function getRecipeBySchematicId(schematicId) {
    if (!schematicId) return null;
    if (!schematicIndex) {
        schematicIndex = {};
        for (const outputId in PI_DATA.recipes) {
            const recipe = PI_DATA.recipes[outputId];
            if (recipe && recipe.id) schematicIndex[recipe.id] = recipe;
        }
    }
    return schematicIndex[schematicId] || null;
}

// Summarise a colony's pins into "producing" and "stored" info.
// ---------- Colony storage pins (launchpads / storage / command centers) ----------
// Capacities from the SDE types.jsonl "capacity" attribute:
//   Launchpads (group 1030) = 10,000 m3, Storage Facilities (group 1029) = 12,000 m3,
//   Command Centers (group 1027, published) = 500 m3
const LAUNCHPAD_TYPES = new Set([2256, 2542, 2543, 2544, 2552, 2555, 2556, 2557]);
const STORAGE_FACILITY_TYPES = new Set([2257, 2535, 2536, 2541, 2558, 2560, 2561, 2562]);
const COMMAND_CENTER_TYPES = new Set([2254, 2524, 2525, 2533, 2534, 2549, 2550, 2551]);
const PIN_CAPACITY = {};
LAUNCHPAD_TYPES.forEach(id => { PIN_CAPACITY[id] = 10000; });
STORAGE_FACILITY_TYPES.forEach(id => { PIN_CAPACITY[id] = 12000; });
COMMAND_CENTER_TYPES.forEach(id => { PIN_CAPACITY[id] = 500; });
const PIN_KIND_NAMES = { launchpad: 'Launchpad', storage: 'Storage Facility', cc: 'Command Center', extractor: 'Extractor Control Unit', processor: 'Processor', other: 'Pin' };

// Per-pin CPU / Powergrid costs, sourced from the SDE (typeDogma attrs
// 48 = cpuOutput / 11 = powerOutput for Command Centres, which provide
// capacity and consume nothing; 49 = cpuLoad / 15 = powerLoad for every other
// pin type, which draws from it). Used by the colony analysis for CC bars.
const PIN_SPECS = {
    2254:{cpu:1675,pg:6000},2256:{cpu:3600,pg:700},2257:{cpu:500,pg:700},2469:{cpu:200,pg:800},
    2470:{cpu:500,pg:700},2471:{cpu:200,pg:800},2472:{cpu:500,pg:700},2473:{cpu:200,pg:800},
    2474:{cpu:500,pg:700},2475:{cpu:1100,pg:400},2480:{cpu:500,pg:700},2481:{cpu:200,pg:800},
    2482:{cpu:1100,pg:400},2483:{cpu:200,pg:800},2484:{cpu:500,pg:700},2485:{cpu:500,pg:700},
    2490:{cpu:200,pg:800},2491:{cpu:500,pg:700},2492:{cpu:200,pg:800},2493:{cpu:200,pg:800},
    2494:{cpu:500,pg:700},2524:{cpu:1675,pg:6000},2525:{cpu:1675,pg:6000},2533:{cpu:1675,pg:6000},
    2534:{cpu:1675,pg:6000},2535:{cpu:500,pg:700},2536:{cpu:500,pg:700},2541:{cpu:500,pg:700},
    2542:{cpu:3600,pg:700},2543:{cpu:3600,pg:700},2544:{cpu:3600,pg:700},2549:{cpu:1675,pg:6000},
    2550:{cpu:1675,pg:6000},2551:{cpu:1675,pg:6000},2552:{cpu:3600,pg:700},2555:{cpu:3600,pg:700},
    2556:{cpu:3600,pg:700},2557:{cpu:3600,pg:700},2558:{cpu:500,pg:700},2560:{cpu:500,pg:700},
    2561:{cpu:500,pg:700},2562:{cpu:500,pg:700},2848:{cpu:400,pg:2600},3060:{cpu:400,pg:2600},
    3061:{cpu:400,pg:2600},3062:{cpu:400,pg:2600},3063:{cpu:400,pg:2600},3064:{cpu:400,pg:2600},
    3067:{cpu:400,pg:2600},3068:{cpu:400,pg:2600}
};
// Command Centre CPU / Powergrid capacity per upgrade level (authoritative EVE
// values, e.g. EVE University / Ellatha). Not a linear +% per level.
const CC_CAPACITY = [
    { cpu: 1675, pg: 6000 },    // L0
    { cpu: 7057, pg: 9000 },    // L1
    { cpu: 12136, pg: 12000 },  // L2
    { cpu: 17215, pg: 15000 },  // L3
    { cpu: 21315, pg: 17000 },  // L4
    { cpu: 25415, pg: 19000 }   // L5
];
function ccCapacity(level) {
    const L = Math.max(0, Math.min(5, level || 0));
    return CC_CAPACITY[L];
}

// Link CPU / Powergrid draw. Base cost per link plus a per-km cost. These
// coefficients are calibrated to a real colony's in-game Command Centre window
// (structure-only usage subtracted from the total); the documented EVE
// University coefficients do not match current EVE, where links are
// Powergrid-dominant.
const LINK_CPU_BASE = 15, LINK_PG_BASE = 10;
const LINK_CPU_PER_KM = 0.672, LINK_PG_PER_KM = 2.388;

// Planet radius (km) used to turn pin lat/long angular separation into link
// distance. ESI omits planet diameter, so these are per-type defaults; the lava
// value comes from a real lava colony (diameter 13900 km -> radius 6950).
// A per-colony override can be set via localStorage (UI input) or c.radiusKm.
const PLANET_RADIUS_KM = {
    temperate: 12000, barren: 9000, oceanic: 13000, ice: 10000,
    gas: 22000, lava: 6950, storm: 14000, plasma: 15000
};
// Planet info (radius from the SDE pi-planets.js build; name from ESI
// /universe/planets/{id}/). Cached for the session; ESI caches the name route
// for a day. Radius is used for link distance so every colony's CPU/PG matches
// in-game without manual radius entry.
const planetInfoCache = {};
async function ensurePlanetInfo(planetId) {
    if (planetId == null) return null;
    if (planetInfoCache[planetId] !== undefined) return planetInfoCache[planetId];
    const info = { radius: null, name: null };
    if (typeof PI_PLANET_RADII !== 'undefined' && PI_PLANET_RADII && typeof PI_PLANET_RADII[planetId] === 'number') {
        info.radius = PI_PLANET_RADII[planetId];
    }
    try {
        const data = await piEsiAuth.esiFetch('/universe/planets/' + planetId + '/');
        if (data && typeof data.name === 'string') info.name = data.name;
    } catch (_) {}
    planetInfoCache[planetId] = info;
    return info;
}
async function ensurePlanetRadius(planetId) {
    const info = await ensurePlanetInfo(planetId);
    return info ? info.radius : null;
}
function getColonyRadiusOverride(planetId) {
    try {
        const v = Number(localStorage.getItem('pi_pi_radius_' + planetId));
        return isFinite(v) && v > 0 ? v : null;
    } catch (_) { return null; }
}
function setColonyRadiusOverride(planetId, km) {
    const k = Number(km);
    try {
        if (isFinite(k) && k > 0) localStorage.setItem('pi_pi_radius_' + planetId, String(k));
        else localStorage.removeItem('pi_pi_radius_' + planetId);
    } catch (_) {}
}
function colonyRadiusKm(c) {
    if (c && typeof c.radiusKm === 'number' && isFinite(c.radiusKm) && c.radiusKm > 0) return c.radiusKm;
    if (c && c.planet_id != null) {
        const o = getColonyRadiusOverride(c.planet_id);
        if (o) return o;
    }
    if (c && typeof c._esiRadius === 'number' && c._esiRadius > 0) return c._esiRadius;
    if (c && c.planet_type && PLANET_RADIUS_KM[c.planet_type]) return PLANET_RADIUS_KM[c.planet_type];
    return 12000;
}

// Thin filled capacity bar (used vs max).
function drawBar(x, y, w, h, frac, color) {
    const r = Math.min(2, h / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    roundRect(ctx, x, y, w, h, r); ctx.fill();
    const fw = Math.max(0, Math.min(1, frac)) * w;
    if (fw > 0.5) { ctx.fillStyle = color; roundRect(ctx, x, y, fw, h, r); ctx.fill(); }
}

// Pin classification for idle detection (SDE groups 1063 / 1028)
const ECU_TYPES = new Set([2848, 3060, 3061, 3062, 3063, 3064, 3067, 3068]);
const PROCESSOR_TYPES = new Set([2469, 2470, 2471, 2472, 2473, 2474, 2475, 2480, 2481, 2482, 2483, 2484, 2485, 2490, 2491, 2492, 2493, 2494]);

function storagePinInfo(pin) {
    if (!pin || !PIN_CAPACITY[pin.type_id]) return null;
    const kind = LAUNCHPAD_TYPES.has(pin.type_id) ? 'launchpad'
        : STORAGE_FACILITY_TYPES.has(pin.type_id) ? 'storage'
        : 'cc';
    let used = 0;
    (pin.contents || []).forEach(c => {
        if (!c || !c.type_id || !c.amount) return;
        const mat = getMaterialById(c.type_id);
        if (!mat || mat.volume === undefined) return; // unknown volume: ignore, never warn on it
        used += c.amount * mat.volume;
    });
    return { kind, typeId: pin.type_id, pinId: pin.pin_id, used, capacity: PIN_CAPACITY[pin.type_id], fill: used / PIN_CAPACITY[pin.type_id] };
}

// Days until a storage pin fills, based on inbound route volume per day.
// Returns Infinity if no inflow, 0 if already full.
function storageEtaDays(sp, detail, analysis) {
    if (!sp || sp.fill >= 1) return 0;
    if (!detail || !Array.isArray(detail.routes)) return Infinity;
    const inbound = detail.routes.filter(r => r.destination_pin_id === sp.pinId);
    if (!inbound.length) return Infinity;
    let m3PerDay = 0;
    // Route quantity is amount moved; volume derived via material volume (m3 per unit).
    // Factories cycleTime gives per-day throughput as fallback when route qty missing.
    inbound.forEach(r => {
        if (r.quantity && r.content_type_id) {
            const mat = getMaterialById(r.content_type_id);
            if (mat && mat.volume !== undefined) m3PerDay += r.quantity * mat.volume;
        }
    });
    // Fallback: factory output per day routing to this pin (when routes have no qty yet)
    if (m3PerDay === 0 && analysis && analysis.factories) {
        // approximate via factory per-day m3 if route exists but qty zero
        analysis.factories.forEach(f => {
            const mat = getMaterialById(f.outputId);
            if (!mat || mat.volume === undefined || !f.cycleTime) return;
            // check if this factory routes to this pin at all
            const hasRoute = inbound.some(r => r.source_pin_id === f.pinId);
            if (hasRoute) m3PerDay += (f.outputQty / f.cycleTime) * 86400 * mat.volume;
        });
    }
    if (m3PerDay <= 0) return Infinity;
    const remain = sp.capacity - sp.used;
    return remain / m3PerDay;
}
function formatEtaDays(d) {
    if (!isFinite(d) || d === Infinity) return '';
    if (d < 0.05) return 'hours';
    if (d < 1) return Math.ceil(d * 24) + 'h';
    if (d < 7) return d.toFixed(1) + 'd';
    return Math.round(d) + 'd';
}

// Idle factory details: pinIds that are idle and why
function getIdleFactoryDetails(detail) {
    if (!detail || !Array.isArray(detail.pins)) return [];
    const routesByDest = new Set((detail.routes || []).map(r => r.destination_pin_id));
    const out = [];
    detail.pins.forEach(pin => {
        if (!PROCESSOR_TYPES.has(pin.type_id)) return;
        const sched = pin.factory_details && pin.factory_details.schematic_id;
        if (!sched) { out.push({ pinId: pin.pin_id, reason: 'no schematic' }); return; }
        if (!routesByDest.has(pin.pin_id)) { out.push({ pinId: pin.pin_id, reason: 'no input route' }); }
    });
    return out;
}

function analyseColony(detail, level, radiusKm) {
    const producing = {}; // materialId -> {name, tier, count, amount}
    const stored = {};    // materialId -> amount
    const storagePins = [];
    const extractors = [];
    const factories = [];
    const idle = { extractors: 0, factories: 0, expired: 0 };
    const now = Date.now();

    if (!detail || !Array.isArray(detail.pins)) {
        return { producing: [], stored: [], storagePins: [], fullest: null, extraStorage: 0, extractors: [], factories: [], idle };
    }

    detail.pins.forEach(pin => {
        // Extractor control units: active program or idle
        if (ECU_TYPES.has(pin.type_id)) {
            const ed = pin.extractor_details;
            if (ed && ed.product_type_id) {
                const mat = getMaterialById(ed.product_type_id);
                const expiryMs = pin.expiry_time ? Date.parse(pin.expiry_time) : null;
                const expired = expiryMs !== null && !Number.isNaN(expiryMs) && expiryMs <= now;
                if (expired) idle.expired++;
                extractors.push({
                    pinId: pin.pin_id,
                    productId: ed.product_type_id,
                    productName: mat ? mat.name : `Type ${ed.product_type_id}`,
                    tier: mat ? mat.tier : 0,
                    qtyPerCycle: ed.qty_per_cycle || 0,
                    cycleTime: ed.cycle_time || 0,
                    expiryMs: (expiryMs !== null && !Number.isNaN(expiryMs)) ? expiryMs : null,
                    expired
                });
            } else {
                idle.extractors++;
            }
        }

        // Processors: running a schematic or idle
        if (PROCESSOR_TYPES.has(pin.type_id)) {
            if (pin.factory_details && pin.factory_details.schematic_id) {
                const recipe = getRecipeBySchematicId(pin.factory_details.schematic_id);
                factories.push({
                    pinId: pin.pin_id,
                    schematicId: pin.factory_details.schematic_id,
                    outputId: recipe ? recipe.outputId : null,
                    outputName: recipe ? recipe.name : `Schematic ${pin.factory_details.schematic_id}`,
                    outputQty: recipe ? (recipe.outputQty || 1) : 0,
                    cycleTime: recipe ? (recipe.cycleTime || 0) : 0
                });
            } else {
                idle.factories++;
            }
        }
        const sp = storagePinInfo(pin);
        if (sp) {
            // Top contents by m3 for the detail view
            sp.top = (pin.contents || [])
                .map(c => {
                    const mat = getMaterialById(c.type_id);
                    return {
                        name: mat ? mat.name : `Type ${c.type_id}`,
                        m3: (mat && mat.volume !== undefined && c.amount) ? c.amount * mat.volume : 0
                    };
                })
                .filter(t => t.m3 > 0)
                .sort((a, b) => b.m3 - a.m3)
                .slice(0, 3);
            storagePins.push(sp);
        }
        // Extractors: pull a raw material
        if (pin.extractor_details && pin.extractor_details.product_type_id) {
            const matId = pin.extractor_details.product_type_id;
            const mat = getMaterialById(matId);
            const qtyPerCycle = pin.extractor_details.qty_per_cycle || 0;
            const cycleSec = pin.extractor_details.cycle_time || 0;
            if (!producing[matId]) {
                producing[matId] = { name: mat ? mat.name : `Type ${matId}`, tier: mat ? mat.tier : 0, type: 'extractor', count: 0, amount: 0, cycleSec };
            }
            producing[matId].count++;
            producing[matId].amount += qtyPerCycle;
        }

        // Factories: run a schematic -> produce an output
        if (pin.factory_details && pin.factory_details.schematic_id) {
            const recipe = getRecipeBySchematicId(pin.factory_details.schematic_id);
            const outId = recipe ? recipe.outputId : null;
            const outMat = outId ? getMaterialById(outId) : null;
            if (!producing[outId || `schem-${pin.factory_details.schematic_id}`]) {
                producing[outId || `schem-${pin.factory_details.schematic_id}`] = {
                    name: outMat ? outMat.name : (recipe ? recipe.name : `Schematic ${pin.factory_details.schematic_id}`),
                    tier: outMat ? outMat.tier : (recipe ? recipe.tier : 0),
                    type: 'factory',
                    count: 0,
                    amount: 0,
                    cycleSec: recipe ? recipe.cycleTime : 0
                };
            }
            producing[outId || `schem-${pin.factory_details.schematic_id}`].count++;
        }

        // Storage contents in this pin
        if (Array.isArray(pin.contents)) {
            pin.contents.forEach(c => {
                if (c && c.type_id) {
                    stored[c.type_id] = (stored[c.type_id] || 0) + (c.amount || 0);
                }
            });
        }
    });

    // CPU / Powergrid: sum what every non-CC pin draws, and the CC capacity it
    // draws from (scales with the colony's command-centre upgrade level).
    let usedCpu = 0, usedPg = 0, capCpu = 0, capPg = 0;
    detail.pins.forEach(pin => {
        const spec = PIN_SPECS[pin.type_id];
        if (!spec) return;
        if (COMMAND_CENTER_TYPES.has(pin.type_id)) {
            const cap = ccCapacity(level || 0);
            capCpu += cap.cpu; capPg += cap.pg;
        } else {
            usedCpu += spec.cpu; usedPg += spec.pg;
        }
    });

    // Links: each structure-to-structure link draws CPU/PG based on its length
    // (planet radius x great-circle angle between the two pins). Extractor-head
    // links are not separate pins so they never appear in detail.links.
    const r = (typeof radiusKm === 'number' && isFinite(radiusKm) && radiusKm > 0) ? radiusKm : 12000;
    if (Array.isArray(detail.links) && detail.links.length) {
        const pos = {};
        detail.pins.forEach(pin => {
            if (pin && pin.pin_id != null && typeof pin.latitude === 'number' && typeof pin.longitude === 'number') {
                pos[pin.pin_id] = [pin.latitude, pin.longitude];
            }
        });
        detail.links.forEach(link => {
            const a = pos[link.source_pin_id], b = pos[link.destination_pin_id];
            if (!a || !b) return;
            const dLa = b[0] - a[0], dLo = b[1] - a[1];
            const h = Math.min(1, Math.sin(dLa / 2) ** 2 + Math.cos(a[0]) * Math.cos(b[0]) * Math.sin(dLo / 2) ** 2);
            const ang = 2 * Math.asin(Math.sqrt(h));
            const l = r * ang;
            usedCpu += LINK_CPU_BASE + LINK_CPU_PER_KM * l;
            usedPg += LINK_PG_BASE + LINK_PG_PER_KM * l;
        });
    }

    storagePins.sort((a, b) => b.fill - a.fill);
    extractors.sort((a, b) => (a.expiryMs || Infinity) - (b.expiryMs || Infinity));
    // attach ETA days per storage pin (for overflow predictor)
    storagePins.forEach(sp => { sp.etaDays = storageEtaDays(sp, detail, { factories, extractors }); });

    return {
        producing: Object.values(producing),
        stored: Object.entries(stored).map(([id, amount]) => {
            const mat = getMaterialById(Number(id));
            return { id: Number(id), name: mat ? mat.name : `Type ${id}`, tier: mat ? mat.tier : 0, amount };
        }).filter(s => s.amount > 0),
        storagePins,
        fullest: storagePins[0] || null,
        extraStorage: Math.max(0, storagePins.length - 1),
        extractors,
        factories,
        idle,
        idleDetails: getIdleFactoryDetails(detail),
        usedCpu, usedPg, capCpu, capPg
    };
}

// analyseColony scans all pins; cache the result on the colony object so canvas
// draws (which run on every pan/hover) don't recompute it. Cache invalidates
// naturally because loadColonies replaces the colony objects.
function analyseColonyCached(c) {
    if (!c._analysis) c._analysis = analyseColony(c.detail, c.upgrade_level, colonyRadiusKm(c));
    return c._analysis;
}

function renderColonies(colonies, systemsLoaded) {
    const charName = piEsiAuth.getCurrentCharacterName();
    const totals = totalColonyValuation();
    let header = `${charName || 'Character'} - ${colonies.length} ${colonies.length === 1 ? 'colony' : 'colonies'}`;
    if (totals.storedValue || totals.extractPerDay || totals.factoryPerDay) {
        header += ` · ${formatISK(totals.storedValue)} stored · ${formatISK(totals.extractPerDay + totals.factoryPerDay)}/day`;
    }
    elements.coloniesHeader.textContent = header;

    // Timeline (legacy hidden) + skill banner + idle filter UI + main DOM (Finder-style)
    renderColonyTimeline(colonies);
    renderColonySkillBanner(colonies);
    updateColonyIdleFilterCount(colonies);
    renderColoniesDom(colonies, systemsLoaded);

    let filtered = colonies;
    if (AppState.colonyIdleOnly) {
        filtered = colonies.filter(c => {
            const a = analyseColonyCached(c);
            return (a.idleDetails && a.idleDetails.length) || a.idle.factories || a.idle.extractors;
        });
        if (!filtered.length) {
            elements.coloniesList.innerHTML = '<div class="colony-item"><div class="colony-name">No idle colonies</div><div class="colony-meta">All factories have schematics and routes</div></div>';
            return;
        }
    }

    if (!filtered.length) {
        elements.coloniesList.innerHTML = '<div class="colony-item"><div class="colony-name">No colonies found</div><div class="colony-meta">Colonize a planet in-game to see it here</div></div>';
        return;
    }

    // Group by system for readability
    const bySystem = {};
    filtered.forEach(c => {
        const sysId = c.solar_system_id;
        if (!bySystem[sysId]) bySystem[sysId] = [];
        bySystem[sysId].push(c);
    });

    const systemIds = Object.keys(bySystem).map(Number).sort((a, b) => a - b);
    let html = '';

    systemIds.forEach(sysId => {
        const sys = (systemsLoaded && typeof PI_SYSTEMS !== 'undefined') ? PI_SYSTEMS[sysId] : null;
        const systemName = sys ? sys.name : `System ${sysId}`;
        const regionName = sys && sys.regionId && PI_DATA.regions && PI_DATA.regions[sys.regionId] ? PI_DATA.regions[sys.regionId] : null;
        const sec = sys ? sys.security : null;

        const coloniesInSystem = bySystem[sysId];
        const totalUpgrades = coloniesInSystem.reduce((sum, c) => sum + (c.upgrade_level || 0), 0);

        html += `<div class="colony-system">
            <div class="colony-system-name"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(systemName)}${regionName ? ` <span class="colony-region">(${escapeHtml(regionName)})</span>` : ''}</div>
            <div class="colony-system-meta">${sec !== null ? `Sec ${sec.toFixed(1)}` : ''}${sec !== null && coloniesInSystem.length ? ' &bull; ' : ''}${coloniesInSystem.length} planet${coloniesInSystem.length === 1 ? '' : 's'}${totalUpgrades ? ` &bull; ${totalUpgrades} upgrades` : ''}</div>
        </div>`;

        coloniesInSystem.forEach(c => {
            const pt = getPlanetTypeByNameOrId(c.planet_type);
            const typeName = pt ? pt.name : `Planet type ${c.planet_type}`;
            const planetName = c._planetName || null;
            const color = pt ? pt.color : '#666';

            const upgrades = c.upgrade_level || 0;
            const upgradeBar = [1, 2, 3, 4, 5].map(i =>
                `<span class="upgrade-dot ${i <= upgrades ? 'active' : ''}" style="${i <= upgrades ? 'background:' + color : ''}"></span>`
            ).join('');

            const lastUpdate = c.last_update ? new Date(c.last_update).toLocaleString() : '';
            const pinCount = c.num_pins ? `${c.num_pins} pins` : '';

            const analysis = analyseColonyCached(c);
            const { producing, stored } = analysis;
            const radiusVal = Math.round(colonyRadiusKm(c));

            let produceHtml = '';
            if (producing.length) {
                produceHtml = `<div class="colony-section"><div class="colony-section-title"><i class="fas fa-industry"></i> Producing</div>`;
                produceHtml += producing.map(p => {
                    const tierColor = PI_COLORS[p.tier] || '#888';
                    return `<div class="colony-produce-item">
                        <span class="cp-name" style="color: ${tierColor}">${escapeHtml(p.name)}</span>
                        <span class="cp-meta">x${p.count}${p.amount && p.type === 'extractor' ? ` &bull; ${p.amount}/cycle` : ''}</span>
                    </div>`;
                }).join('');
                produceHtml += `</div>`;
            }

            let storedHtml = '';
            if (stored.length) {
                storedHtml = `<div class="colony-section"><div class="colony-section-title"><i class="fas fa-boxes-stacked"></i> Stored</div>`;
                storedHtml += stored.map(s => {
                    const tierColor = PI_COLORS[s.tier] || '#888';
                    return `<div class="colony-produce-item">
                        <span class="cp-name" style="color: ${tierColor}">${escapeHtml(s.name)}</span>
                        <span class="cp-meta">${formatAmount(s.amount)}</span>
                    </div>`;
                }).join('');
                storedHtml += `</div>`;
            }

            const storageHtml = storageFillHtml(analysis);
            const insightHtml = colonyInsightHtml(analysis, valueColony(analysis, AppState.colonyPrices || {}));

            html += `<div class="colony-item" style="border-left-color: ${color}">
                <div class="colony-top">
                    <span class="colony-name" style="color: ${color}" title="${escapeHtml(planetName || typeName)}">${escapeHtml(planetName || typeName)}</span>
                    <span class="colony-upgrade" title="Command Center upgrade level">${upgradeBar}</span>
                </div>
                <div class="colony-meta">
                    ${planetName ? `<span><i class="fas fa-layer-group"></i>${escapeHtml(typeName)}</span>` : ''}
                    ${pinCount ? `<span><i class="fas fa-thumbtack"></i>${pinCount}</span>` : ''}
                    <span><i class="fas fa-cubes"></i>CC ${upgrades}</span>
                    <span class="colony-radius"><i class="fas fa-globe"></i>R <input class="colony-radius-input" data-planet="${c.planet_id}" type="number" min="1" step="100" value="${radiusVal}" title="Planet radius (km) - used to calculate link CPU/Powergrid cost"></span>
                </div>
                ${produceHtml}
                ${storedHtml}
                ${storageHtml}
                ${insightHtml}
                ${lastUpdate ? `<div class="colony-updated"><i class="fas fa-clock"></i> Last update: ${escapeHtml(lastUpdate)}</div>` : ''}
            </div>`;
        });
    });

    elements.coloniesList.innerHTML = html;
    elements.coloniesList.insertAdjacentHTML('beforeend', '<div class="colony-disclaimer"><i class="fas fa-info-circle"></i> CPU / Powergrid values are estimated and may differ slightly from in-game.</div>');
}

// ---------- New: Timeline + Idle Filter + Skill Banner ----------
function buildExpiryEntries(colonies) {
    const entries = [];
    const now = Date.now();
    (colonies || []).forEach(c => {
        const a = analyseColonyCached(c);
        const pt = getPlanetTypeByNameOrId(c.planet_type);
        const name = c._planetName || (pt ? pt.name : `Planet ${c.planet_id}`);
        (a.extractors || []).forEach(e => {
            if (!e.expiryMs) return;
            const msLeft = e.expiryMs - now;
            const expired = e.expired || msLeft <= 0;
            const hoursLeft = msLeft / 3600000;
            let cls = 'ok';
            if (expired) cls = 'expired';
            else if (hoursLeft < 24) cls = 'warn';
            else if (hoursLeft < 72) cls = 'amber';
            entries.push({ colony: c, extractor: e, name, cls, msLeft, expired });
        });
    });
    entries.sort((a, b) => a.msLeft - b.msLeft);
    return entries;
}
function renderColonyTimeline(colonies) {
    // Legacy: #coloniesTimelineMain is now display:none (superseded by coloniesDom). Keep sidebar tidy.
    const sideEl = elements.colonyTimeline || document.getElementById('colonyTimeline');
    if (sideEl) { sideEl.classList.add('hidden'); sideEl.innerHTML=''; }
    const mainEl = elements.coloniesTimelineMain || document.getElementById('coloniesTimelineMain');
    if (mainEl) { mainEl.classList.add('hidden'); mainEl.innerHTML=''; }
}

// Finder-style colonies DOM — replaces canvas colony cards
function renderColoniesDom(colonies, systemsLoaded) {
    const dom = elements.coloniesDom || document.getElementById('coloniesDom');
    const hero = elements.coloniesHero || document.getElementById('coloniesHero');
    const metric = elements.coloniesMetric || document.getElementById('coloniesMetric');
    const sub = elements.coloniesSub || document.getElementById('coloniesSub');
    const kicker = elements.coloniesKicker || document.getElementById('coloniesKicker');
    const grid = elements.coloniesGrid || document.getElementById('coloniesGrid');
    const empty = elements.coloniesEmpty || document.getElementById('coloniesEmpty');
    const timelineDom = elements.coloniesTimelineDom || document.getElementById('coloniesTimelineDom');
    if (!dom || !grid) return;
    // lazy bind
    if (!elements.coloniesDom) elements.coloniesDom = dom;
    if (!elements.coloniesTimelineDom) elements.coloniesTimelineDom = timelineDom;

    const authed = window.piEsiAuth && piEsiAuth.isAuthenticated();
    if (!authed) {
        if (kicker) kicker.textContent = 'My Colonies';
        if (hero) hero.innerHTML = '<div style="color:var(--muted);font-size:0.78rem;padding:10px">Sign in with EVE SSO to view your colonies</div>';
        if (metric) metric.innerHTML = '';
        if (sub) sub.textContent = 'Use the Colonies tab to sign in.';
        grid.innerHTML = ''; if (timelineDom) timelineDom.innerHTML=''; if (empty) empty.textContent='';
        return;
    }
    if (AppState.coloniesLoading) {
        if (kicker) kicker.textContent = 'My Colonies';
        if (hero) hero.innerHTML = '<div style="color:var(--muted);font-size:0.78rem;padding:10px"><i class="fas fa-spinner fa-spin"></i> Loading colonies...</div>';
        if (metric) metric.innerHTML='';
        grid.innerHTML='';
        return;
    }
    if (!colonies || !colonies.length) {
        if (kicker) kicker.textContent = 'My Colonies';
        if (hero) hero.innerHTML = '<div style="color:var(--muted);font-size:0.78rem;padding:10px">No colonies found — colonize a planet in-game</div>';
        if (metric) metric.innerHTML='';
        grid.innerHTML='';
        return;
    }
    // Totals
    const totals = totalColonyValuation();
    const charName = (piEsiAuth && piEsiAuth.getCurrentCharacterName()) || 'Character';
    if (kicker) kicker.textContent = `${charName} — ${colonies.length} ${colonies.length===1?'colony':'colonies'}`;
    if (hero) {
        const cCount = colonies.length;
        const sysCount = new Set(colonies.map(c=>c.solar_system_id)).size;
        hero.innerHTML = `<div class="finder-hero-card" style="cursor:default"><span class="finder-hero-badge" style="background:var(--accent);color:#121212"><i class="fas fa-globe"></i></span><span class="finder-hero-text"><b>${cCount} colonies in ${sysCount} system${sysCount===1?'':'s'}</b><span>Click a card to open • Layout shows planet map</span></span></div>`;
    }
    if (metric) {
        let pills = '';
        if (totals.storedValue) pills += `<span class="finder-metric-pill"><strong>${formatISK(totals.storedValue)} ISK</strong>&nbsp;stored</span>`;
        pills += `<span class="finder-metric-pill"><strong>${formatISK(totals.extractPerDay + totals.factoryPerDay)}/day</strong></span>`;
        const nearFull = colonies.filter(c=>{const a=analyseColonyCached(c); return a.fullest && a.fullest.fill>=0.8;}).length;
        if (nearFull) pills += `<span class="finder-metric-pill" style="border-color:rgba(251,191,36,0.5);background:rgba(251,191,36,0.1);color:#fbbf24">${nearFull} near full</span>`;
        const expiredTotal = colonies.reduce((n,c)=> n + analyseColonyCached(c).idle.expired, 0);
        if (expiredTotal) pills += `<span class="finder-metric-pill" style="border-color:rgba(248,113,113,0.5);background:rgba(248,113,113,0.1);color:#f87171">${expiredTotal} expired</span>`;
        metric.innerHTML = pills;
    }
    if (sub) {
        const idleCount = colonies.filter(c=>{const a=analyseColonyCached(c); return (a.idleDetails&&a.idleDetails.length)||a.idle.factories||a.idle.extractors;}).length;
        let txt = `${colonies.length} colonies • ${formatISK(totals.storedValue)} stored • ${formatISK(totals.extractPerDay + totals.factoryPerDay)}/day`;
        if (idleCount) txt += ` • ${idleCount} idle`;
        sub.textContent = txt;
    }
    // Timeline — Finder-style cards (compact, 2-3 columns)
    if (timelineDom) {
        const entries = buildExpiryEntries(colonies);
        if (!entries.length) timelineDom.innerHTML = '';
        else {
            let th = '<div class="colonies-timeline-header"><i class="fas fa-hourglass-half"></i> Expiry Timeline — soonest first</div><div class="finder-grid grid" style="padding:0;gap:8px">';
            entries.slice(0,12).forEach(e=>{
                const text = e.expired ? `EXPIRED ${formatDuration(-e.msLeft)} ago` : `ends in ${formatDuration(e.msLeft)}`;
                const cls = e.cls;
                const cardCls = cls==='expired' ? 'expired' : (cls==='warn' ? 'warn' : '');
                const dotColor = cls==='expired' ? '#f87171' : (cls==='warn' ? '#fbbf24' : (cls==='amber' ? '#f59e0b' : '#4ade80'));
                const pt = getPlanetTypeByNameOrId(e.colony.planet_type);
                const col = pt ? pt.color : '#666';
                th += `<div class="colonies-timeline-card ${cardCls}"><span class="timeline-dot" style="background:${dotColor}"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span><span class="finder-chip" style="background:${col}">${escapeHtml(e.extractor.productName)}</span><span style="flex:0 0 110px;text-align:right;white-space:nowrap;${cls==='expired'?'color:#f87171':'color:var(--muted)'}">${escapeHtml(text)}</span></div>`;
            });
            th += '</div>';
            if (entries.length>12) th += `<div style="font-size:0.62rem;color:var(--muted);margin-top:6px">+${entries.length-12} more programs</div>`;
            timelineDom.innerHTML = th;
        }
    }
    // Filtered colonies
    let filtered = colonies;
    if (AppState.colonyIdleOnly) {
        filtered = colonies.filter(c=>{const a=analyseColonyCached(c); return (a.idleDetails&&a.idleDetails.length)||a.idle.factories||a.idle.extractors;});
    }
    if (!filtered.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:0.78rem;padding:12px;text-align:center">No idle colonies — all factories have schematics and routes</div>';
        if (empty) empty.textContent='';
        return;
    }
    // Group by system like Finder
    const bySystem = {};
    filtered.forEach(c=>{ const id=c.solar_system_id; if(!bySystem[id]) bySystem[id]=[]; bySystem[id].push(c); });
    const sids = Object.keys(bySystem).map(Number).sort((a,b)=>a-b);
    let html='';
    sids.forEach(sysId=>{
        const sys = (systemsLoaded && typeof PI_SYSTEMS!=='undefined') ? PI_SYSTEMS[sysId] : null;
        const sysName = sys? sys.name : `System ${sysId}`;
        const region = sys && PI_DATA.regions[sys.regionId] ? PI_DATA.regions[sys.regionId] : '';
        const sec = sys? sys.security : null;
        const secCls = sec==null?'null':(sec>=0.5?'high':(sec>=0.1?'low':'null'));
        const secBadge = sec!=null ? `<span class="sec-badge ${secCls}">${sec.toFixed(1)}</span>` : '';
        const group = bySystem[sysId];
        const totalUp = group.reduce((s,c)=>s+(c.upgrade_level||0),0);
        html += `<div class="colony-system-header"><span class="sys-name"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(sysName)}${region?` <span style="color:var(--muted);font-weight:400">(${escapeHtml(region)})</span>`:''}</span>${secBadge}<span class="sys-meta">${group.length} planet${group.length>1?'s':''} • ${totalUp} upgrades</span></div>`;
        group.forEach(c=>{
            const pt = getPlanetTypeByNameOrId(c.planet_type);
            const typeName = pt? pt.name : `Planet type ${c.planet_type}`;
            const color = pt? pt.color : '#666';
            const planetName = c._planetName ? `${c._planetName} (${typeName})` : typeName;
            const analysis = analyseColonyCached(c);
            const val = valueColony(analysis, AppState.colonyPrices||{});
            const upgrades = c.upgrade_level||0;
            const dots = [1,2,3,4,5].map(i=>`<span class="upgrade-dot ${i<=upgrades?'active':''}" style="${i<=upgrades?'background:'+color:''}"></span>`).join('');
            const producing = analysis.producing.slice(0,3).map(p=>`<span class="finder-chip" style="background:${PI_COLORS[p.tier]||'#666'}">${escapeHtml(p.name)}</span>`).join('') || '<span style="color:var(--muted);font-size:0.62rem">No production</span>';
            const stored = analysis.stored.slice(0,3).map(s=>`<span class="finder-chip" style="background:${PI_COLORS[s.tier]||'#666'}">${escapeHtml(s.name)} ×${formatAmount(s.amount)}</span>`).join('');
            const sp = analysis.fullest;
            let barHtml='';
            if (sp) {
                const pct = Math.min(100, Math.round(sp.fill*100));
                const cls = sp.fill>=1?'full':(sp.fill>=0.8?'warn':'ok');
                const eta = sp.etaDays;
                let etaTxt='';
                if (sp.fill>=1) etaTxt='FULL — will jam';
                else if (eta!=null && isFinite(eta) && eta!==Infinity) etaTxt=`~${formatEtaDays(eta)} until full`;
                else if (sp.fill>=0.8) etaTxt='Inflow unknown';
                barHtml = `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--muted)"><span><i class="fas fa-warehouse"></i> ${PIN_KIND_NAMES[sp.kind]} ${pct}%</span><span class="${cls==='full'?'colony-eta full':cls==='warn'?'colony-eta warn':'colony-eta'}">${escapeHtml(etaTxt)}</span></div><div class="colony-card-bar"><div class="colony-card-bar-inner ${cls}" style="width:${pct}%"></div></div><div style="font-size:0.6rem;color:var(--muted)">${formatAmount(Math.round(sp.used))} / ${formatAmount(sp.capacity)} m³</div></div>`;
            }
            const active = analysis.extractors.filter(e=>e.expiryMs && !e.expired);
            const expiredN = analysis.extractors.filter(e=>e.expired).length;
            let metaBits = [`<span><i class="fas fa-thumbtack"></i> ${c.num_pins||0} pins</span>`, `<span>CC ${upgrades}</span>`];
            if (expiredN) metaBits.push(`<span style="color:#f87171;font-weight:700">${expiredN} EXPIRED</span>`);
            else if (active[0]) metaBits.push(`<span><i class="fas fa-hourglass-half"></i> ends in ${formatDuration(active[0].expiryMs - Date.now())}</span>`);
            if (val.extractPerDay||val.factoryPerDay) metaBits.push(`<span>${formatISK(val.extractPerDay+val.factoryPerDay)}/d</span>`);
            const idle = (()=>{ if (analysis.idleDetails && analysis.idleDetails.length) { const noSchem=analysis.idleDetails.filter(d=>d.reason==='no schematic').length; const noRoute=analysis.idleDetails.filter(d=>d.reason==='no input route').length; const parts=[]; if(noSchem) parts.push(`${noSchem} no schematic`); if(noRoute) parts.push(`${noRoute} no input route`); return `<div class="colony-warn-line"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(parts.join(' · '))}</div>`; } return (analysis.idle.factories||analysis.idle.extractors ? `<div class="colony-warn-line"><i class="fas fa-triangle-exclamation"></i> ${analysis.idle.factories||0} idle factories</div>` : ''); })();
            html += `<div class="finder-card colony-card" data-planet="${c.planet_id}" style="border-left:4px solid ${color}"><div class="colony-card-top"><span class="colony-card-title" style="color:${color}">${escapeHtml(planetName)}</span><span>${dots}</span></div><div class="colony-card-meta">${metaBits.join(' • ')}</div><div class="colony-card-chips"><span style="font-size:0.62rem;color:var(--muted);margin-right:4px">PRODUCING</span>${producing}</div>${stored?`<div class="colony-card-chips"><span style="font-size:0.62rem;color:var(--muted);margin-right:4px">STORED</span>${stored}</div>`:''}${barHtml}${idle}<div class="colony-card-isk" style="margin-top:6px"><span title="Stored"><i class="fas fa-boxes-stacked"></i> ${formatISK(val.storedValue)}</span><span><i class="fas fa-industry"></i> ${formatISK(val.extractPerDay)}/d</span><span><i class="fas fa-flask"></i> ${formatISK(val.factoryPerDay)}/d</span></div></div>`;
        });
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.colony-card').forEach(card=>{
        card.addEventListener('click',()=>{
            const pid = Number(card.dataset.planet);
            const target = (AppState.colonies||[]).find(x=>x.planet_id===pid);
            if (!target) return;
            AppState.colonyDetail = target;
            AppState.layoutMode = false;
            AppState.layoutSel = null;
            resetViewport();
            updateUrlState();
            draw();
        });
    });
    if (empty) empty.textContent = '';
    if (elements.coloniesGrid) elements.coloniesGrid = grid;
}
function updateColonyIdleFilterCount(colonies) {
    const cntEl = elements.colonyFilterCount || document.getElementById('colonyFilterCount');
    if (!cntEl) return;
    const idleCount = (colonies || []).filter(c => {
        const a = analyseColonyCached(c);
        return (a.idleDetails && a.idleDetails.length) || a.idle.factories || a.idle.extractors;
    }).length;
    cntEl.textContent = idleCount ? `${idleCount} idle` : '';
}
async function fetchColonySkills(characterId) {
    if (!characterId) return null;
    const cacheKey = 'pi_skills_' + characterId;
    try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
            const cached = JSON.parse(raw);
            if (cached && Date.now() - cached.fetchedAt < 3600000) return cached;
        }
    } catch (_) {}
    try {
        const data = await piEsiAuth.esiFetch(`/characters/${characterId}/skills/`, null, {}, 0);
        // ESI returns { skills: [{skill_id, active_skill_level}], total_sp }
        const byId = {};
        (data.skills || []).forEach(s => { byId[s.skill_id] = s.active_skill_level; });
        const result = { consolidation: byId[2495] ?? byId[2395] ?? 0, ccUpgrades: byId[2505] ?? byId[2403] ?? 0, fetchedAt: Date.now() };
        // skill 2495 = Interplanetary Consolidation, 2505 = Command Center Upgrades (fallbacks for older IDs)
        try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (_) {}
        return result;
    } catch (e) {
        // 403 means missing scope
        if (/40[13]/.test(e.message)) return { needLogin: true };
        return null;
    }
}
async function ensureColonySkills() {
    if (!piEsiAuth.isAuthenticated()) { AppState.colonySkills = null; return null; }
    const charId = piEsiAuth.getCurrentCharacter();
    // quick scope check without network: decode JWT
    try {
        const tok = await piEsiAuth.getAccessToken(charId);
        const payload = piEsiAuth.decodeJWT(tok);
        const scp = payload.scp || payload.scope || [];
        const list = Array.isArray(scp) ? scp : String(scp).split(' ');
        if (!list.includes('esi-skills.read_skills.v1')) {
            AppState.colonySkills = { needLogin: true };
            return AppState.colonySkills;
        }
    } catch (_) {}
    const sk = await fetchColonySkills(charId);
    AppState.colonySkills = sk;
    return sk;
}
function renderColonySkillBanner(colonies) {
    const el = elements.colonySkillBanner || document.getElementById('colonySkillBanner');
    if (!el) return;
    if (!colonies || !colonies.length) { el.classList.add('hidden'); el.innerHTML=''; return; }
    const sk = AppState.colonySkills;
    if (!sk) { el.classList.add('hidden'); el.innerHTML=''; return; }
    if (sk.needLogin) {
        el.className = 'colony-skill-banner need-login';
        el.classList.remove('hidden');
        el.innerHTML = '<i class="fas fa-user-lock"></i> Re-login to enable Skill Gate — your token lacks <code>esi-skills.read_skills.v1</code> <button id="skillRelogin" class="calc-btn secondary" style="margin-top:0.35rem;padding:0.3rem 0.6rem;font-size:0.68rem"><i class="fas fa-sign-in-alt"></i> Login again</button>';
        const btn = document.getElementById('skillRelogin');
        if (btn) btn.onclick = () => piEsiAuth.initiateLogin().catch(()=>{});
        return;
    }
    const maxLevel = Math.max(...colonies.map(c => c.upgrade_level || 0), 0);
    const count = colonies.length;
    const warns = [];
    if (maxLevel > (sk.ccUpgrades ?? 0)) warns.push(`CC Upgrades ${sk.ccUpgrades}/5 — colony needs level ${maxLevel}`);
    if (count > ((sk.consolidation ?? 0) + 1)) warns.push(`Consolidation ${sk.consolidation}/5 — you have ${count} colonies (max ${ (sk.consolidation ?? 0)+1})`);
    if (!warns.length) {
        el.className = 'colony-skill-banner ok';
        el.classList.remove('hidden');
        el.innerHTML = `<i class="fas fa-check-circle"></i> Skills OK — CC Upgrades ${sk.ccUpgrades}/5, Consolidation ${sk.consolidation}/5`;
    } else {
        el.className = 'colony-skill-banner warn';
        el.classList.remove('hidden');
        el.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Skill Gate: ${escapeHtml(warns.join(' · '))} — train or decommission`;
    }
}

// ---------- Colony countdown / valuation helpers ----------
function formatDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return m > 0 ? `${d}d ${h}h` : (h > 0 ? `${d}d ${h}h` : `${d}d`);
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
}

function extractorStatus(e) {
    const now = Date.now();
    if (e.expired || (e.expiryMs && e.expiryMs <= now)) {
        return { text: `EXPIRED ${formatDuration(now - e.expiryMs)} ago`, expired: true };
    }
    if (!e.expiryMs) return { text: 'no end time', expired: false };
    return { text: `ends in ${formatDuration(e.expiryMs - now)}`, expired: false };
}

// ISK figures for one colony given a price map (sell prices)
function valueColony(analysis, prices) {
    const now = Date.now();
    let storedValue = 0, extractPerDay = 0, factoryPerDay = 0, remainingValue = 0;

    (analysis.stored || []).forEach(s => {
        storedValue += s.amount * (prices[s.id]?.sell || 0);
    });

    (analysis.extractors || []).forEach(e => {
        const p = prices[e.productId]?.sell || 0;
        if (e.cycleTime > 0) extractPerDay += (e.qtyPerCycle / e.cycleTime) * 86400 * p;
        if (!e.expired && e.expiryMs && e.cycleTime > 0) {
            const cyclesLeft = Math.max(0, Math.floor((e.expiryMs - now) / (e.cycleTime * 1000)));
            remainingValue += cyclesLeft * e.qtyPerCycle * p;
        }
    });

    (analysis.factories || []).forEach(f => {
        const p = f.outputId ? (prices[f.outputId]?.sell || 0) : 0;
        if (f.cycleTime > 0 && f.outputQty > 0) factoryPerDay += (f.outputQty / f.cycleTime) * 86400 * p;
    });

    return { storedValue, extractPerDay, factoryPerDay, remainingValue };
}

// Total valuation across all loaded colonies
function totalColonyValuation() {
    const totals = { storedValue: 0, extractPerDay: 0, factoryPerDay: 0 };
    (AppState.colonies || []).forEach(c => {
        const v = valueColony(analyseColonyCached(c), AppState.colonyPrices || {});
        totals.storedValue += v.storedValue;
        totals.extractPerDay += v.extractPerDay;
        totals.factoryPerDay += v.factoryPerDay;
    });
    return totals;
}

// Load market prices for everything the colonies reference (non-blocking)
let colonyPricesRequestId = 0;
async function ensureColonyPrices() {
    const colonies = AppState.colonies;
    if (!colonies || !colonies.length) return;

    const ids = new Set();
    colonies.forEach(c => {
        const a = analyseColonyCached(c);
        (a.extractors || []).forEach(e => ids.add(e.productId));
        (a.factories || []).forEach(f => { if (f.outputId) ids.add(f.outputId); });
        (a.stored || []).forEach(s => ids.add(s.id));
    });
    const idList = Array.from(ids);
    if (!idList.length) return;

    const regionId = elements.regionSelect.value;
    const requestId = ++colonyPricesRequestId;

    try {
        const cached = getCachedPrices(regionId, idList);
        const missing = idList.filter(id => !cached[id]);
        let prices = { ...(AppState.colonyPrices || {}), ...cached };
        if (missing.length > 0) {
            const fetched = await fetchPricesForMaterials(missing, regionId);
            if (requestId !== colonyPricesRequestId) return;
            setCachedPrices(regionId, fetched);
            prices = { ...prices, ...fetched };
        }
        AppState.colonyPrices = prices;
        renderColonyValuation();
    } catch (e) {
        console.warn('Colony price fetch failed:', e);
    }
}

function renderColonyValuation() {
    if (AppState.currentTab === 'colonies' && AppState.colonies) {
        renderColonies(AppState.colonies, AppState.systemsLoaded);
    }
    if (AppState.viewMode === 'colonies') draw();
}

// Live countdown tick - only re-renders while colonies UI is visible
let colonyTickTimer = null;
function setColonyTick(active) {
    if (active && !colonyTickTimer) {
        colonyTickTimer = setInterval(() => {
            if (AppState.viewMode === 'colonies') draw();
            if (AppState.currentTab === 'colonies' && AppState.colonies && !AppState.coloniesLoading) {
                renderColonies(AppState.colonies, AppState.systemsLoaded);
            }
        }, 60000);
    } else if (!active && colonyTickTimer) {
        clearInterval(colonyTickTimer);
        colonyTickTimer = null;
    }
}

// Per-colony insight lines: countdown/expiry, ISK figures, idle warnings
function colonyInsightHtml(analysis, val) {
    let html = '';

    // Soonest active program + expired count
    const active = (analysis.extractors || []).filter(e => e.expiryMs && !e.expired);
    const expiredCount = (analysis.extractors || []).filter(e => e.expired).length;
    const soonest = active[0]; // extractors sorted by expiry
    const bits = [];
    if (expiredCount) bits.push(`<span class="colony-expired">${expiredCount} EXPIRED</span>`);
    if (soonest) {
        bits.push(`<span class="colony-countdown" title="${escapeHtml(soonest.productName)}"><i class="fas fa-hourglass-half"></i> ${escapeHtml(soonest.productName)} ${formatDuration(soonest.expiryMs - Date.now())}</span>`);
    }
    if (bits.length) html += `<div class="colony-insight-line">${bits.join(' ')}</div>`;

    // ISK figures (only when prices are loaded)
    if (val && (val.storedValue || val.extractPerDay || val.factoryPerDay)) {
        html += `<div class="colony-isk-line" title="Stored value / extracted ISK per day / factory output per day">
            <span title="Stored goods value"><i class="fas fa-boxes-stacked"></i> ${formatISK(val.storedValue)}</span>
            <span title="Extracted ISK per day"><i class="fas fa-industry"></i> ${formatISK(val.extractPerDay)}/d</span>
            <span title="Factory output ISK per day"><i class="fas fa-flask"></i> ${formatISK(val.factoryPerDay)}/d</span>
        </div>`;
    }

    // Idle warnings (enhanced with per-reason)
    const warns = [];
    if (analysis.idle.extractors) warns.push(`${analysis.idle.extractors} idle extractor${analysis.idle.extractors === 1 ? '' : 's'}`);
    if (analysis.idleDetails && analysis.idleDetails.length) {
        const noSchem = analysis.idleDetails.filter(d => d.reason === 'no schematic').length;
        const noRoute = analysis.idleDetails.filter(d => d.reason === 'no input route').length;
        if (noSchem) warns.push(`${noSchem} no schematic`);
        if (noRoute) warns.push(`${noRoute} no input route`);
    } else if (analysis.idle.factories) warns.push(`${analysis.idle.factories} idle factor${analysis.idle.factories === 1 ? 'y' : 'ies'}`);
    if (warns.length) html += `<div class="colony-warn-line"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(warns.join(' · '))}</div>`;

    return html;
}

// Sidebar storage fill block for the fullest storage pin on a colony (with ETA)
function storageFillHtml(analysis) {    const sp = analysis && analysis.fullest;
    if (!sp) return '';
    const pct = Math.min(100, Math.round(sp.fill * 100));
    const cls = sp.fill >= 1 ? 'full' : (sp.fill >= 0.8 ? 'warn' : '');
    const warnText = sp.fill >= 1 ? '<span class="storage-warn-text full">FULL</span>'
        : (sp.fill >= 0.8 ? '<span class="storage-warn-text warn">nearly full</span>' : '');
    const extra = analysis.extraStorage > 0 ? `<span class="storage-extra">+${analysis.extraStorage} more</span>` : '';
    let etaHtml = '';
    if (sp.etaDays !== undefined && isFinite(sp.etaDays) && sp.etaDays !== Infinity) {
        const etaStr = formatEtaDays(sp.etaDays);
        if (sp.fill < 1 && etaStr) {
            const etaCls = sp.etaDays < 2 ? 'warn' : '';
            etaHtml = `<div class="colony-eta ${etaCls}"><i class="fas fa-clock"></i> ~${escapeHtml(etaStr)} until full</div>`;
        } else if (sp.fill >= 1) {
            etaHtml = `<div class="colony-eta full"><i class="fas fa-triangle-exclamation"></i> Storage full — will jam</div>`;
        }
    } else if (sp.fill >= 0.8) {
        etaHtml = `<div class="colony-eta warn"><i class="fas fa-triangle-exclamation"></i> Inflow unknown — may jam</div>`;
    }
    return `<div class="storage-fill">
        <div class="storage-fill-label">
            <i class="fas fa-warehouse"></i> ${PIN_KIND_NAMES[sp.kind]}
            <span class="storage-fill-pct ${cls}">${pct}%</span>
            ${warnText}${extra}
        </div>
        <div class="storage-fill-bar"><div class="storage-fill-bar-inner ${cls}" style="width:${pct}%"></div></div>
        <div class="storage-fill-meta">${formatAmount(Math.round(sp.used))} / ${formatAmount(sp.capacity)} m&sup3;</div>
        ${etaHtml}
    </div>`;
}

function formatAmount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

// ---------- Drawing ----------
function draw() {
    clampListScroll();

    ctx.clearRect(0, 0, AppState.cssW, AppState.cssH);

    drawBackgroundGrid();

    if (AppState.viewMode === 'reference') {
        drawReferenceView();
        return;
    }

    if (AppState.viewMode === 'system') {
        drawSystemView();
        return;
    }

    if (AppState.viewMode === 'finder') {
        const dom = elements.finderDom || document.getElementById('finderDom');
        const hasDomFrag = typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function';
        if (dom && hasDomFrag && dom.classList && typeof dom.classList.contains === 'function' && !dom.classList.contains('hidden')) {
            renderFinderDom();
            return;
        }
        // Screen-space like the other list views - fixed size, wheel/keys scroll
        drawFinderView();
        return;
    }

    const layoutWorld = AppState.viewMode === 'colonies' &&
        AppState.colonyDetail && AppState.layoutMode;
    const coloniesListView = AppState.viewMode === 'colonies' && !AppState.colonyDetail;

    // Sync coloniesDom visibility (DOM list vs canvas detail/layout)
    const cDomSync = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('coloniesDom') : null;
    const fDomSync = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('finderDom') : null;
    const piCanvasSync = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('piCanvas') : null;
    if (cDomSync) cDomSync.classList.toggle('hidden', !coloniesListView);
    if (fDomSync && AppState.viewMode !== 'finder') { /* finder handled elsewhere */ }
    if (piCanvasSync) {
        const hideCanvas = (AppState.viewMode === 'finder') || coloniesListView;
        piCanvasSync.classList.toggle('hidden', hideCanvas);
    }

    if (coloniesListView) {
        const hasDomFrag = typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function';
        if (hasDomFrag) {
            renderColoniesDom(AppState.colonies, AppState.systemsLoaded);
            return;
        }
        drawColoniesView();
        return;
    }

    ctx.save();
    ctx.translate(AppState.canvasOffset.x, AppState.canvasOffset.y);
    ctx.scale(AppState.zoom, AppState.zoom);

    if (AppState.viewMode === 'colonies') {
        drawColonyLayout(AppState.colonyDetail);
    } else if (AppState.viewMode === 'chain' && AppState.chainLayout) {
        drawChain();
    } else if (AppState.viewMode === 'chain') {
        drawNoSelectionPrompt();
    } else if (AppState.viewMode === 'planets') {
        drawPlanetsView();
    }

    ctx.restore();

    if (AppState.viewMode === 'chain' && AppState.hoverChainNode && AppState.chainLayout) {
        const hn = AppState.chainLayout.nodes.find(n => n.materialId === AppState.hoverChainNode);
        if (hn) {
            const halfH = (hn.tier === 0 ? 78 : 62) / 2 * AppState.zoom;
            const sx = hn.x * AppState.zoom + AppState.canvasOffset.x;
            const sy = hn.y * AppState.zoom + AppState.canvasOffset.y - halfH;
            drawProductTooltip(AppState.hoverChainNode, sx, sy, true);
        }
    }

    if (layoutWorld) {
        drawColonyLayoutOverlay(AppState.colonyDetail);
    }
}

function drawNoSelectionPrompt() {
    const cx = AppState.cssW / 2;
    const cy = AppState.cssH / 2;

    ctx.fillStyle = 'rgba(20, 20, 20, 0.75)';
    roundRect(ctx, cx - 220, cy - 60, 440, 120, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 16px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Select a product to view its chain', cx, cy - 20);

    ctx.fillStyle = '#888';
    ctx.font = '12px Titillium Web, sans-serif';
    ctx.fillText('Use the Target Product selector or click any material in the Reference view', cx, cy + 18);
}

function drawBackgroundGrid() {
    const gridSize = 40;
    const offsetX = AppState.canvasOffset.x % gridSize;
    const offsetY = AppState.canvasOffset.y % gridSize;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;

    for (let x = offsetX; x < AppState.cssW; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, AppState.cssH);
        ctx.stroke();
    }

    for (let y = offsetY; y < AppState.cssH; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(AppState.cssW, y);
        ctx.stroke();
    }
}

// ---------- Reference View ----------
function drawReferenceView() {
    // Planets breakdown is now integrated as a sub-view inside Reference.
    if (AppState.refSubview === 'planets') {
        ctx.save();
        ctx.translate(AppState.canvasOffset.x, AppState.canvasOffset.y);
        ctx.scale(AppState.zoom, AppState.zoom);
        drawPlanetsView();
        ctx.restore();
        return;
    }

    const L = refCardLayout();

    let hoveredRect = null;

    L.materials.forEach((mat, i) => {
        const col = i % L.cols;
        const row = Math.floor(i / L.cols);
        const x = col * L.spacing + 8;
        const y = row * (L.cellHeight + 12) + 12 - AppState.canvasOffset.y;

        if (y > -L.cellHeight && y < AppState.cssH) {
            drawRefCard(mat, x, y, L.cellWidth, L.cellHeight, PI_COLORS[mat.tier]);
            if (mat.id === AppState.hoveredCard) hoveredRect = { x, y, w: L.cellWidth, h: L.cellHeight };
        }
    });

    if (hoveredRect && AppState.hoveredCard != null) {
        drawProductTooltip(AppState.hoveredCard, hoveredRect.x + hoveredRect.w / 2, hoveredRect.y, false);
    }
}

function drawRefCard(mat, x, y, w, h, color) {
    const isHovered = AppState.hoveredCard === mat.id;

    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    if (isHovered) {
        gradient.addColorStop(0, 'rgba(60, 60, 60, 0.98)');
        gradient.addColorStop(1, 'rgba(40, 40, 40, 0.98)');
    } else {
        gradient.addColorStop(0, 'rgba(40, 40, 40, 0.98)');
        gradient.addColorStop(1, 'rgba(25, 25, 25, 0.98)');
    }
    ctx.fillStyle = gradient;
    ctx.strokeStyle = isHovered ? color : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = isHovered ? 2 : 1;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    roundRect(ctx, x, y, 4, h, [8, 0, 0, 8]);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    roundRect(ctx, x + 12, y + 8, 20, 16, 4);
    ctx.fill();

    ctx.fillStyle = '#121212';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${mat.tier}`, x + 22, y + 16);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let name = mat.name;
    if (name.length > 18) name = name.substring(0, 16) + '...';
    ctx.fillText(name, x + 40, y + 10);

    if (mat.volume) {
        ctx.fillStyle = '#555';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${mat.volume}m³`, x + w - 12, y + 12);
    }

    if (mat.inputs && Object.keys(mat.inputs).length > 0) {
        const inputEntries = Object.entries(mat.inputs);
        let yPos = y + 36;

        // Collect tier-0 planet types first (for bottom-of-card grouping)
        const tier0Planets = [];
        inputEntries.forEach(([id, qty], i) => {
            const input = getMaterialById(parseInt(id));
            if (!input) return;
            if (input.tier === 0) {
                const ptypes = getPlanetTypesForP0(parseInt(id));
                if (ptypes.length > 0) tier0Planets.push(...ptypes);
            }
        });

        inputEntries.forEach(([id, qty], i) => {
            const input = getMaterialById(parseInt(id));
            if (!input) return;

            ctx.fillStyle = '#888';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'left';

            let inputName = input.name;
            if (inputName.length > 16) inputName = inputName.substring(0, 14) + '...';
            ctx.fillText(`${qty}x ${inputName}`, x + 12, yPos);

            yPos += 16;
        });

        // Cap yPos at card bottom with generous padding (cellHeight=95)
        // Keep inputs/planet markers/ footer all within y + 95 bounds
        const cardBottom = y + 85; // 10px from card bottom
        if (yPos > cardBottom) yPos = cardBottom;

        // Draw tier-0 planet markers in a row at the card bottom
        // Row at y + 78 (17px from bottom), with small 2.5px markers
        if (tier0Planets.length > 0) {
            const markerY = y + 78;
            const markerSpacing = 8;
            const baseX = x + 12; // align with input names
            const maxPerRow = Math.max(1, Math.floor(60 / markerSpacing));
            tier0Planets.forEach((planet, j) => {
                const px = baseX + (j % maxPerRow) * markerSpacing;
                // Only draw marker if within card bounds
                if (px >= x + 12 && px <= x + 200) { // 200 is rough card width limit
                    ctx.fillStyle = planet.color;
                    ctx.beginPath();
                    ctx.arc(px, markerY, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }

        // Draw "→ X units" footer at capped position with bottom padding
        ctx.fillStyle = '#666';
        ctx.font = '8px sans-serif';
        ctx.fillText(`→ ${mat.batchSize} units`, x + 12, yPos + 4);
    }

    // Market price - check filter first, then price data
    const showMarket = !AppState.hideMarketPrices;
    const price = showMarket && AppState.marketPrices && AppState.marketPrices[mat.id]?.sell;
    if (price) {
        ctx.fillStyle = '#e8d900';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatISK(price), x + w - 12, y + h - 12);
    } else if (showMarket && !price) {
        // Optionally show a "no data" indicator when filter is on but no price
        ctx.fillStyle = '#555';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('—', x + w - 12, y + h - 12);
    }
}

// ---------- Hover Tooltip ----------
// Shows what goes INTO a material (its inputs) when the user hovers a
// reference card or a chain node. anchorX/anchorY are screen pixels at the
// top-centre of the hovered element; worldSpace is unused (callers pass
// screen coords). The box is drawn in screen space so text stays crisp.
function drawProductTooltip(materialId, anchorX, anchorY) {
    const mat = getMaterialById(materialId);
    if (!mat) return;

    const inputEntries = Object.entries(mat.inputs || {});
    const lines = []; // { text, color }

    if (inputEntries.length > 0) {
        inputEntries.forEach(([idStr, qty]) => {
            const sub = getMaterialById(parseInt(idStr));
            lines.push({
                text: `${qty}x ${sub ? sub.name : String(idStr)}`,
                color: sub ? (PI_COLORS[sub.tier] || '#bbb') : '#bbb'
            });
        });
    } else if (mat.tier === 0) {
        lines.push({ text: 'Raw resource — extract from a planet', color: '#999' });
    } else {
        lines.push({ text: 'No inputs', color: '#999' });
    }

    const title = `${mat.name}  (P${mat.tier})`;
    const lineH = 18;
    const padX = 12, padY = 10;

    ctx.save();
    ctx.font = '11px Titillium Web, sans-serif';
    let boxW = ctx.measureText(title).width;
    lines.forEach(l => { boxW = Math.max(boxW, ctx.measureText(l.text).width); });
    boxW += padX * 2 + 14; // +14 for the tier colour swatch
    const boxH = padY * 2 + 18 + lines.length * lineH;

    // Prefer below the anchor; flip above if it would clip the bottom.
    let bx = Math.round(anchorX - boxW / 2);
    let by = Math.round(anchorY + 14);
    bx = Math.max(6, Math.min(bx, AppState.cssW - boxW - 6));
    if (by + boxH > AppState.cssH - 6) by = Math.round(anchorY - boxH - 14);

    ctx.fillStyle = 'rgba(12, 12, 12, 0.97)';
    ctx.strokeStyle = 'rgba(232, 217, 0, 0.55)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 12px Titillium Web, sans-serif';
    ctx.fillText(title, bx + padX, by + padY);

    let ty = by + padY + 22;
    ctx.font = '11px Titillium Web, sans-serif';
    lines.forEach(l => {
        ctx.fillStyle = l.color;
        ctx.beginPath();
        ctx.arc(bx + padX + 4, ty + 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ddd';
        ctx.fillText(l.text, bx + padX + 14, ty);
        ty += lineH;
    });

    ctx.restore();
}

// ---------- System View ----------
function drawSystemPrompt() {
    const cx = AppState.cssW / 2;
    const cy = AppState.cssH / 2;
    ctx.fillStyle = 'rgba(20, 20, 20, 0.75)';
    roundRect(ctx, cx - 220, cy - 50, 440, 100, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 16px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Select a system from the side bar', cx, cy - 12);
    ctx.fillStyle = '#888';
    ctx.font = '12px Titillium Web, sans-serif';
    ctx.fillText('Use the System Checker to search a system', cx, cy + 16);
}

function systemCardAt(pos) {
    return (AppState.systemCards || []).find(c =>
        pos.x >= c.x && pos.x <= c.x + c.w && pos.y >= c.y && pos.y <= c.y + c.h) || null;
}

function drawSystemView() {
    AppState.systemCards = [];
    if (!AppState.systemData) {
        drawSystemPrompt();
        return;
    }
    const d = AppState.systemData;
    const sys = d.system;
    const margin = 20;
    const offsetY = AppState.canvasOffset.y;
    let y = 20 - offsetY;

    // Header
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const regionName = PI_DATA.regions[sys.regionId] || 'Unknown Region';
    const secClass = sys.security >= 0.5 ? '#2ecc71' : (sys.security >= 0.1 ? '#e67e22' : '#e74c3c');
    // System name + sec badge
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 20px Titillium Web, sans-serif';
    ctx.fillText(sys.name, margin, y);
    const nameW = ctx.measureText(sys.name).width;
    ctx.fillStyle = secClass;
    ctx.font = 'bold 11px sans-serif';
    const secText = (sys.security != null ? sys.security.toFixed(1) : '?');
    const secW = ctx.measureText(secText).width + 12;
    const secX = margin + nameW + 10;
    roundRect(ctx, secX, y + 2, secW, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.fillText(secText, secX + secW/2, y + 6);
    ctx.textAlign = 'left';
    y += 6;
    ctx.fillStyle = '#888';
    ctx.font = '12px Titillium Web, sans-serif';
    ctx.fillText(regionName, margin, y + 22);
    y += 44;

    // Planet counts
    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 11px Titillium Web, sans-serif';
    ctx.fillText(d.planetTypes.length + ' PLANETS', margin, y);
    y += 16;
    // Planet type badges - wrap
    {
        const gapX = 6; const gapY = 6;
        let cx = margin; let cy = y;
        const maxW = AppState.cssW - margin*2;
        for (const [typeId, count] of Object.entries(d.counts)) {
            const pt = getPlanetTypeData(parseInt(typeId));
            if (!pt) continue;
            const label = pt.name + ' x' + count;
            ctx.font = 'bold 11px Titillium Web, sans-serif';
            let w = Math.ceil(ctx.measureText(label).width) + 16;
            if (cx + w > margin + maxW) { cx = margin; cy += 22; }
            roundRect(ctx, cx, cy, w, 18, 4);
            ctx.fillStyle = pt.color;
            ctx.fill();
            // darken overlay for readability
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            roundRect(ctx, cx, cy, w, 18, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx + w/2, cy + 9);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            cx += w + gapX;
        }
        y = cy + 26;
    }

    // Skyhooks if any
    if (d.skyhookTotals && (d.skyhookTotals.power || d.skyhookTotals.workforce || Object.keys(d.skyhookTotals.reagents).length)) {
        y += 4;
        ctx.fillStyle = 'rgba(30,30,30,0.85)';
        const boxX = margin; const boxW = AppState.cssW - margin*2;
        // estimate height
        let skyLines = 1;
        if (d.skyhookTotals.power) skyLines++;
        if (d.skyhookTotals.workforce) skyLines++;
        skyLines += Object.keys(d.skyhookTotals.reagents).length;
        const boxH = 14 + skyLines*18 + 10;
        roundRect(ctx, boxX, y, boxW, boxH, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.stroke();
        ctx.fillStyle = '#e8d900';
        ctx.font = 'bold 11px Titillium Web, sans-serif';
        ctx.fillText('SKYHOOKS', boxX + 10, y + 10);
        let sy = y + 28;
        ctx.font = '12px Titillium Web, sans-serif';
        if (d.skyhookTotals.power) { ctx.fillStyle = '#f1c40f'; ctx.fillText('Power: ' + d.skyhookTotals.power.toLocaleString(), boxX + 10, sy); sy += 18; }
        if (d.skyhookTotals.workforce) { ctx.fillStyle = '#3498db'; ctx.fillText('Workforce: ' + d.skyhookTotals.workforce.toLocaleString(), boxX + 10, sy); sy += 18; }
        for (const [typeId, amount] of Object.entries(d.skyhookTotals.reagents)) {
            const nm = (PI_DATA.reagentTypes && PI_DATA.reagentTypes[typeId]) || ('Reagent ' + typeId);
            ctx.fillStyle = '#2ecc71'; ctx.fillText(nm + ': ' + amount.toLocaleString(), boxX + 10, sy); sy += 18;
        }
        y += boxH + 16;
    } else {
        y += 8;
    }

    // Producible header
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 13px Titillium Web, sans-serif';
    ctx.fillText('CAN PRODUCE LOCALLY', margin, y);
    y += 20;

    const sections = [
        { label: 'P2', tier: 2, items: d.producibleP2 },
        { label: 'P3', tier: 3, items: d.producibleP3 },
        { label: 'P4', tier: 4, items: d.producibleP4 },
    ];

    const cardW = 160; const cardH = 34; const gap = 8;
    const cols = Math.max(1, Math.floor((AppState.cssW - margin*2 + gap) / (cardW + gap)));

    sections.forEach(sec => {
        ctx.fillStyle = PI_COLORS[sec.tier] || '#888';
        ctx.font = 'bold 12px Titillium Web, sans-serif';
        ctx.fillText(sec.label, margin, y);
        y += 18;
        if (!sec.items.length) {
            ctx.fillStyle = '#666';
            ctx.font = '11px Titillium Web, sans-serif';
            ctx.fillText('No ' + sec.label + ' producible locally', margin, y);
            y += 22;
            return;
        }
        let col = 0; let rowY = y;
        sec.items.forEach(mat => {
            const x = margin + col * (cardW + gap);
            const yy = rowY;
            // card bg
            ctx.fillStyle = 'rgba(40,40,40,0.95)';
            ctx.strokeStyle = PI_COLORS[mat.tier] || '#666';
            ctx.lineWidth = 1;
            roundRect(ctx, x, yy, cardW, cardH, 6);
            ctx.fill(); ctx.stroke();
            // left accent
            ctx.fillStyle = PI_COLORS[mat.tier] || '#666';
            roundRect(ctx, x, yy, 4, cardH, [6,0,0,6]);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '11px Titillium Web, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            let nm = mat.name; if (nm.length > 18) nm = nm.substring(0,16) + '...';
            ctx.fillText(nm, x + 10, yy + cardH/2);
            AppState.systemCards.push({ x, y: yy, w: cardW, h: cardH, productId: mat.id });
            col++;
            if (col >= cols) { col = 0; rowY += cardH + gap; }
        });
        if (col !== 0) rowY += cardH + gap;
        else rowY += 0;
        y = rowY + 12;
    });

    // store total height for scroll clamping via systemCards extent
}

// ---------- Chain View ----------
function drawChain() {
    if (!AppState.chainLayout) return;

    const { nodes, links } = AppState.chainLayout;

    // When a node is focused (clicked), highlight its input subtree and dim
    // everything else. The subtree = the node plus every material it consumes
    // (following input links downward to raw).
    let focusSet = null;
    if (AppState.chainFocus != null) {
        const focusNode = nodes.find(n => n.materialId === AppState.chainFocus);
        if (focusNode) {
            const childrenMap = {};
            links.forEach(l => {
                (childrenMap[l.to] = childrenMap[l.to] || []).push(l.from);
            });
            focusSet = new Set([focusNode.id]);
            const stack = [focusNode.id];
            while (stack.length) {
                const nid = stack.pop();
                (childrenMap[nid] || []).forEach(c => {
                    if (!focusSet.has(c)) { focusSet.add(c); stack.push(c); }
                });
            }
        }
    }

    links.forEach((link, index) => {
        const from = nodes.find(n => n.id === link.from);
        const to = nodes.find(n => n.id === link.to);
        if (from && to) {
            const inFocus = focusSet ? (focusSet.has(from.id) && focusSet.has(to.id)) : true;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const curveOffset = (index % 2 === 0 ? 10 : -10);

            ctx.beginPath();
            if (inFocus) {
                ctx.strokeStyle = 'rgba(232, 217, 0, 0.45)';
                ctx.lineWidth = 1.4;
            } else {
                ctx.strokeStyle = 'rgba(120, 120, 120, 0.12)';
                ctx.lineWidth = 1;
            }
            ctx.moveTo(from.x, from.y);
            ctx.quadraticCurveTo(midX + curveOffset, midY, to.x, to.y);
            ctx.stroke();
        }
    });

    nodes.forEach(node => {
        drawChainNode(node, focusSet ? !focusSet.has(node.id) : false);
    });
}

function drawChainNode(node, dimmed) {
    const width = 140;
    const height = node.tier === 0 ? 78 : 62;
    const x = node.x - width / 2;
    const y = node.y - height / 2;

    const baseColor = PI_COLORS[node.tier] || '#666';
    const color = dimmed ? '#555' : baseColor;

    ctx.globalAlpha = dimmed ? 0.35 : 1;

    ctx.fillStyle = dimmed ? 'rgba(20, 20, 20, 0.9)' : 'rgba(30, 30, 30, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = dimmed ? 1 : 2;

    roundRect(ctx, x, y, width, height, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 10, y + 10, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e0e0e0';
    ctx.font = '11px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    let name = node.name;
    if (name.length > 16) name = name.substring(0, 14) + '...';
    ctx.fillText(name, node.x, y + 6);

    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';

    const mat = getMaterialById(node.materialId);
    if (mat && mat.inputs && Object.keys(mat.inputs).length > 0) {
        const qtys = Object.values(mat.inputs);
        const label = qtys.join(' + ') + ` → ${mat.batchSize} units`;
        ctx.fillText(label, node.x, y + 22);
    }

    if (node.tier === 0 && node.planetTypes.length > 0) {
        ctx.fillStyle = '#777';
        ctx.font = '8px sans-serif';
        ctx.fillText('Found on:', node.x, y + 22);

        const planetSpacing = 14;
        const totalWidth = node.planetTypes.length * planetSpacing;
        const startX = node.x - totalWidth / 2 + planetSpacing / 2;

        node.planetTypes.forEach((planet, i) => {
            const px = startX + i * planetSpacing;
            const py = y + 40;

            ctx.fillStyle = planet.color;
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(planet.name[0].toUpperCase(), px, py);
        });
    }

    const price = AppState.marketPrices[node.materialId]?.sell;
    if (price) {
        ctx.fillStyle = '#e8d900';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatISK(price), node.x, y + height - 10);
    }

    ctx.globalAlpha = 1;
}

// ---------- Planets View ----------
// Standalone reference: every planet subtype and which raw (P0) materials it can extract.
function drawPlanetsView() {
    const planetTypeIds = Object.keys(PI_DATA.planetTypes)
        .map(Number)
        .sort((a, b) => a - b)
        .filter(id => (PI_DATA.planetTypes[id].p0Materials || []).length > 0);

    const nodeWidth = 160;
    const nodeHeight = 44;
    const groupGap = 24;
    const rowGap = 12;
    const nodeSpacing = 10;
    const headerH = 22;
    const cols = 5;

    let yOffset = 10;

    for (const typeId of planetTypeIds) {
        const pt = PI_DATA.planetTypes[typeId];

        // Group header
        ctx.fillStyle = pt.color;
        ctx.font = 'bold 15px Titillium Web, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(pt.name, 0, yOffset);

        // Raw materials extractable here
        const p0Ids = pt.p0Materials || [];
        const rows = Math.ceil(p0Ids.length / cols);
        const groupHeight = headerH + rows * (nodeHeight + rowGap);

        // Group background panel
        ctx.fillStyle = 'rgba(30, 30, 30, 0.55)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        roundRect(ctx, -8, yOffset - 6, cols * (nodeWidth + nodeSpacing) + 12, groupHeight + 14, 10);
        ctx.fill();
        ctx.stroke();

        p0Ids.forEach((matId, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const nx = col * (nodeWidth + nodeSpacing);
            const ny = yOffset + headerH + row * (nodeHeight + rowGap);
            drawPlanetP0Node(getMaterialById(matId), nx, ny, nodeWidth, nodeHeight, pt.color);
        });

        yOffset += groupHeight + groupGap;
    }
}

function drawPlanetP0Node(mat, x, y, w, h, color) {
    if (!mat) return;

    // Flat, static "info chip" styling - these nodes are not interactive.
    ctx.fillStyle = 'rgba(30, 30, 30, 0.45)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let name = mat.name;
    if (name.length > 20) name = name.substring(0, 18) + '...';
    ctx.fillText(name, x + 8, y + 8);

    ctx.fillStyle = color;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`P${mat.tier}`, x + w - 8, y + 8);

    const price = AppState.marketPrices[mat.id]?.sell;
    if (price) {
        ctx.fillStyle = '#e8d900';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatISK(price), x + w - 8, y + h - 8);
    }
}

// ---------- Colonies View ----------
// Draws the player's planetary colonies on the main canvas, grouped by solar system.
function drawColoniesView() {
    if (AppState.colonyDetail) {
        drawColonyDetail(AppState.colonyDetail);
        return;
    }

    if (AppState.coloniesLoading) {
        drawColoniesPrompt('Loading your colonies...', 'Fetching colony data from EVE');
        return;
    }

    if (!AppState.colonies) {
        if (window.piEsiAuth && piEsiAuth.isAuthenticated()) {
            drawColoniesPrompt('No colony data loaded', 'Click Refresh in the My Colonies tab, or press Refresh');
        } else {
            drawColoniesPrompt('Sign in with EVE SSO', 'Use the My Colonies tab to log in and view your planetary colonies');
        }
        return;
    }

    const colonies = AppState.colonies;

    // Header
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 18px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${piEsiAuth.getCurrentCharacterName() || 'Character'} - ${colonies.length} ${colonies.length === 1 ? 'colony' : 'colonies'}`, 20, 20);

    // ISK totals across colonies
    const totals = totalColonyValuation();
    let headerY = 44;
    if (totals.storedValue || totals.extractPerDay || totals.factoryPerDay) {
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Titillium Web, sans-serif';
        ctx.fillText(`Stored: ${formatISK(totals.storedValue)} ISK • Extract: ${formatISK(totals.extractPerDay)}/day • Factory: ${formatISK(totals.factoryPerDay)}/day`, 20, headerY);
        headerY += 20;
    }

    // Near-capacity warning across colonies
    const nearFull = colonies.filter(c => {
        const a = analyseColonyCached(c);
        return a.fullest && a.fullest.fill >= 0.8;
    });
    if (nearFull.length) {
        const anyFull = nearFull.some(c => analyseColonyCached(c).fullest.fill >= 1);
        ctx.fillStyle = anyFull ? '#f87171' : '#fbbf24';
        ctx.font = '12px Titillium Web, sans-serif';
        ctx.fillText(`${nearFull.length} ${nearFull.length === 1 ? 'colony' : 'colonies'} near storage capacity`, 20, headerY);
        headerY += 20;
    }

    if (colonies.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '14px Titillium Web, sans-serif';
        ctx.fillText('No colonies found. Colonize a planet in-game to see it here.', 20, 50);
        return;
    }

    // Group by system
    const bySystem = {};
    colonies.forEach(c => {
        const sysId = c.solar_system_id;
        if (!bySystem[sysId]) bySystem[sysId] = [];
        bySystem[sysId].push(c);
    });
    const systemIds = Object.keys(bySystem).map(Number).sort((a, b) => a - b);

    const cardWidth = 320;
    const cardHeight = 164;
    const gapX = 24;
    const gapY = 24;
    const headerH = 34;
    const margin = 40;
    const offsetY = AppState.canvasOffset.y;

    const cols = Math.max(1, Math.floor((AppState.cssW - margin * 2) / (cardWidth + gapX)));
    let y = Math.max(margin + headerH, headerY + 4) - offsetY;

    // Track card hit areas for click detection
    AppState.colonyCards = [];

    systemIds.forEach(sysId => {
        const sys = (AppState.systemsLoaded && typeof PI_SYSTEMS !== 'undefined') ? PI_SYSTEMS[sysId] : null;
        const systemName = sys ? sys.name : `System ${sysId}`;
        const regionName = sys && sys.regionId && PI_DATA.regions && PI_DATA.regions[sys.regionId] ? PI_DATA.regions[sys.regionId] : null;
        const sec = sys ? sys.security : null;

        const coloniesInSystem = bySystem[sysId];
        const totalUpgrades = coloniesInSystem.reduce((sum, c) => sum + (c.upgrade_level || 0), 0);

        // System header
        ctx.fillStyle = '#58a6ff';
        ctx.font = 'bold 14px Titillium Web, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${systemName}${regionName ? ` (${regionName})` : ''}`, margin, y);
        ctx.fillStyle = '#888';
        ctx.font = '11px Titillium Web, sans-serif';
        const meta = `${sec !== null ? `Sec ${sec.toFixed(1)}` : ''}${sec !== null && coloniesInSystem.length ? ' • ' : ''}${coloniesInSystem.length} planet${coloniesInSystem.length === 1 ? '' : 's'}${totalUpgrades ? ` • ${totalUpgrades} upgrades` : ''}`;
        ctx.fillText(meta, margin + 260, y + 4);
        y += headerH;

        // Colony cards
        let col = 0;
        coloniesInSystem.forEach(c => {
            const x = margin + col * (cardWidth + gapX);
            drawColonyCard(c, x, y, cardWidth, cardHeight);
            AppState.colonyCards.push({ colony: c, x, y, w: cardWidth, h: cardHeight });
            col++;
            if (col >= cols) {
                col = 0;
                y += cardHeight + gapY;
            }
        });
        if (col > 0) y += cardHeight + gapY;
    });
}

function drawColoniesPrompt(title, sub) {
    const cx = AppState.cssW / 2;
    const cy = AppState.cssH / 2;

    ctx.fillStyle = 'rgba(20, 20, 20, 0.75)';
    roundRect(ctx, cx - 240, cy - 60, 480, 120, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 16px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, cx, cy - 20);

    ctx.fillStyle = '#888';
    ctx.font = '12px Titillium Web, sans-serif';
    ctx.fillText(sub, cx, cy + 18);
}

function drawColonyCard(c, x, y, w, h) {
    const pt = getPlanetTypeByNameOrId(c.planet_type);
    const typeName = pt ? pt.name : `Planet type ${c.planet_type}`;
    const color = pt ? pt.color : '#666';
    const upgrades = c.upgrade_level || 0;
    const pinCount = c.num_pins || 0;

    // Card background
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, 'rgba(40, 40, 40, 0.98)');
    gradient.addColorStop(1, 'rgba(25, 25, 25, 0.98)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    // Left accent bar
    ctx.fillStyle = color;
    ctx.beginPath();
    roundRect(ctx, x, y, 4, h, [8, 0, 0, 8]);
    ctx.fill();

    // Planet type + name
    ctx.fillStyle = color;
    ctx.font = 'bold 13px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const title = c._planetName ? `${c._planetName} (${typeName})` : typeName;
    ctx.fillText(title, x + 16, y + 12);

    // Upgrade dots
    const dotSize = 10;
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < upgrades ? color : 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(x + w - 20 - (4 - i) * (dotSize + 4), y + 16, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Meta
    const analysis = analyseColonyCached(c);
    let meta = `${pinCount} pins • CC ${upgrades}`;
    const active = (analysis.extractors || []).filter(e => e.expiryMs && !e.expired);
    const expiredCount = (analysis.extractors || []).filter(e => e.expired).length;
    if (expiredCount) meta += ` • ${expiredCount} EXPIRED`;
    if (active[0]) meta += ` • ends ${formatDuration(active[0].expiryMs - Date.now())}`;
    const val = valueColony(analysis, AppState.colonyPrices || {});
    if (val.extractPerDay || val.factoryPerDay) {
        meta += ` • ${formatISK(val.extractPerDay + val.factoryPerDay)}/d`;
    }
    ctx.fillStyle = expiredCount ? '#f87171' : '#aaa';
    ctx.font = '11px Titillium Web, sans-serif';
    ctx.fillText(meta, x + 16, y + 32);

    // Producing / stored summary
    const { producing, stored } = analysis;
    const storageTop = y + h - 26;
    let py = y + 52;
    if (producing.length) {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 10px Titillium Web, sans-serif';
        ctx.fillText('PRODUCING', x + 16, py);
        py += 16;
        producing.forEach(p => {
            if (py + 13 > storageTop) return;
            const tierColor = PI_COLORS[p.tier] || '#888';
            ctx.fillStyle = tierColor;
            ctx.font = '10px Titillium Web, sans-serif';
            ctx.fillText(`${p.name}${p.amount && p.type === 'extractor' ? ` x${p.amount}/cyc` : ''}`, x + 16, py);
            py += 13;
        });
    }
    if (stored.length) {
        const storedItems = stored.slice(0, 3);
        if (py + 14 + storedItems.length * 13 <= storageTop) {
            ctx.fillStyle = '#888';
            ctx.font = 'bold 10px Titillium Web, sans-serif';
            ctx.fillText('STORED', x + 16, py);
            py += 14;
            storedItems.forEach(s => {
                const tierColor = PI_COLORS[s.tier] || '#888';
                ctx.fillStyle = tierColor;
                ctx.font = '10px Titillium Web, sans-serif';
                ctx.fillText(`${s.name} x${formatAmount(s.amount)}`, x + 16, py);
                py += 13;
            });
        }
    }

    // Storage fill strip (fullest storage pin)
    if (analysis.fullest) {
        const sp = analysis.fullest;
        const pct = Math.min(1, sp.fill);
        const barY = y + h - 14;
        const barW = w - 32;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, x + 16, barY, barW, 6, 3);
        ctx.fill();
        if (pct > 0) {
            ctx.fillStyle = sp.fill >= 1 ? '#f87171' : (sp.fill >= 0.8 ? '#fbbf24' : '#4ade80');
            roundRect(ctx, x + 16, barY, Math.max(6, barW * pct), 6, 3);
            ctx.fill();
        }
        ctx.fillStyle = '#999';
        ctx.font = '9px Titillium Web, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${PIN_KIND_NAMES[sp.kind]} ${Math.round(sp.fill * 100)}%`, x + 16, barY - 12);
    }
}

// ---------- Colony Layout View ----------
// Flat schematic: pins grouped into functional columns (Command Center ->
// Extractors -> Processors -> Storage) with links and material routes drawn
// between them. Deliberately independent of ESI lat/long, which has proven
// unreliable to project and only recalculates in the game client.

const LAYOUT_CARD_W = 150;
const LAYOUT_CARD_H = 46;
const CC_CARD_H = 84; // taller: fits the upgrade level + two capacity bars with clear gaps
const LAYOUT_COLUMN_NAMES = ['Command Center', 'Extractors', 'Processors', 'Storage', 'Other'];

function pinColumnIndex(kind) {
    if (kind === 'cc') return 0;
    if (kind === 'extractor') return 1;
    if (kind === 'processor') return 2;
    if (kind === 'launchpad' || kind === 'storage') return 3;
    return 4;
}

// Toggle button rects for the colony detail header (Details | Layout)
function detailToggleRects() {
    const rightEdge = AppState.cssW - 30;
    return [
        { label: 'Details', mode: false, x: rightEdge - 190, y: 30, w: 88, h: 28 },
        { label: 'Layout', mode: true, x: rightEdge - 95, y: 30, w: 88, h: 28 }
    ];
}

function drawDetailToggles() {
    detailToggleRects().forEach(b => {
        const active = AppState.layoutMode === b.mode;
        ctx.fillStyle = active ? 'rgba(232, 217, 0, 0.15)' : 'rgba(40,40,40,0.95)';
        ctx.strokeStyle = active ? '#e8d900' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        roundRect(ctx, b.x, b.y, b.w, b.h, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = active ? '#e8d900' : '#aaa';
        ctx.font = 'bold 12px Titillium Web, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
    });
}

// Builds the colony graph: classified pins, links and routes (no coordinates)
function buildColonyLayout(detail) {
    const pins = [], links = [], routes = [];
    const byId = {};
    if (!detail || !Array.isArray(detail.pins)) return { pins, links, routes, byId };

    detail.pins.forEach(pin => {
        let kind = 'other', label = 'Pin', color = '#888';
        if (ECU_TYPES.has(pin.type_id)) {
            const ed = pin.extractor_details;
            const prod = ed && ed.product_type_id ? getMaterialById(ed.product_type_id) : null;
            kind = 'extractor';
            label = prod ? prod.name : 'ECU';
            color = prod ? (PI_COLORS[prod.tier] || '#6e7681') : '#6e7681';
        } else if (PROCESSOR_TYPES.has(pin.type_id)) {
            const recipe = pin.factory_details && pin.factory_details.schematic_id
                ? getRecipeBySchematicId(pin.factory_details.schematic_id) : null;
            kind = 'processor';
            label = recipe ? recipe.name : 'Processor';
            color = recipe ? (PI_COLORS[recipe.tier] || '#d29922') : '#d29922';
        } else if (LAUNCHPAD_TYPES.has(pin.type_id)) {
            kind = 'launchpad'; label = 'Launchpad'; color = '#58a6ff';
        } else if (STORAGE_FACILITY_TYPES.has(pin.type_id)) {
            kind = 'storage'; label = 'Storage'; color = '#a371f7';
        } else if (COMMAND_CENTER_TYPES.has(pin.type_id)) {
            kind = 'cc'; label = 'Command Center'; color = '#e8d900';
        }
        const p = { pinId: pin.pin_id, typeId: pin.type_id, kind, label, color, raw: pin };
        byId[p.pinId] = p;
        pins.push(p);
    });

    (detail.links || []).forEach(l => {
        links.push({ source: l.source_pin_id, dest: l.destination_pin_id, level: l.link_level || 0 });
    });
    (detail.routes || []).forEach(r => {
        routes.push({
            source: r.source_pin_id,
            dest: r.destination_pin_id,
            contentTypeId: r.content_type_id,
            quantity: r.quantity,
            waypoints: r.waypoints || []
        });
    });

    return { pins, links, routes, byId };
}

// Assign flat positions: used columns spread across the width, pins within a
// column spread evenly down the height.
function assignFlatLayout(layout, margin, top, availW, availH) {
    const columns = [[], [], [], [], []];
    layout.pins.forEach(p => columns[pinColumnIndex(p.kind)].push(p));

    const used = [];
    columns.forEach((colPins, i) => {
        if (colPins.length === 0) return;
        used.push({ index: i, name: LAYOUT_COLUMN_NAMES[i], pins: colPins });
    });

    const nCols = Math.max(1, used.length);
    const colW = availW / nCols;
    used.forEach((col, idx) => {
        col.cx = margin + colW * idx + colW / 2;
        const n = col.pins.length;
        col.pins.forEach((p, j) => {
            p.x = col.cx;
            p.y = top + availH * (j + 1) / (n + 1);
            p.h = p.kind === 'cc' ? CC_CARD_H : LAYOUT_CARD_H;
        });
    });
    return { used, colW };
}

function pinSubLabel(p, analysis) {
    if (p.kind === 'extractor') {
        const e = (analysis.extractors || []).find(x => x.pinId === p.pinId);
        if (!e) return 'no program';
        return extractorStatus(e).text;
    }
    if (p.kind === 'launchpad' || p.kind === 'storage') {
        const sp = (analysis.storagePins || []).find(x => x.typeId === p.typeId);
        return sp ? `${Math.round(sp.fill * 100)}% full` : '';
    }
    if (p.kind === 'cc') return 'command center';
    if (p.kind === 'processor') return 'processor';
    return '';
}

function colonyLayoutPinAt(pos) {
    const data = AppState.colonyLayoutData;
    if (!data) return null;
    let best = null, bestD = Infinity;
    data.pins.forEach(p => {
        const halfH = (p.h || LAYOUT_CARD_H) / 2;
        const dx = Math.max(0, Math.abs(pos.x - p.x) - LAYOUT_CARD_W / 2);
        const dy = Math.max(0, Math.abs(pos.y - p.y) - halfH);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = p; }
    });
    // Accept taps inside a card or within ~8px of one; ignore far clicks
    return bestD <= 64 ? best : null;
}

function drawColonyLayout(c) {
    const margin = 30;
    const top = 130; // below the back button + colony header
    const headerH = 22;
    const availW = AppState.cssW - margin * 2;
    const availH = AppState.cssH - top - margin;
    if (availW <= 0 || availH <= 0) return;

    const layout = buildColonyLayout(c.detail);
    const analysis = analyseColonyCached(c);
    AppState.colonyLayoutData = layout;

    if (!layout.pins.length) {
        ctx.fillStyle = '#888';
        ctx.font = '13px Titillium Web, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No pins on this colony', AppState.cssW / 2, top + 40);
        ctx.textAlign = 'left';
        return;
    }

    const flat = assignFlatLayout(layout, margin, top + headerH, availW, availH - headerH);

    // Column headers
    flat.used.forEach(col => {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 11px Titillium Web, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(col.name.toUpperCase(), col.cx, top + 6);
    });
    ctx.textAlign = 'left';

    const sel = AppState.layoutSel;
    const focus = sel || AppState.layoutHover;
    // Adjacency for highlight dimming (works for both selection and hover)
    let adjacent = null;
    if (focus) {
        adjacent = new Set([sel]);
        layout.links.forEach(l => {
            if (l.source === focus) adjacent.add(l.dest);
            if (l.dest === focus) adjacent.add(l.source);
        });
        layout.routes.forEach(r => {
            if (r.source === focus) adjacent.add(r.dest);
            if (r.dest === focus) adjacent.add(r.source);
            (r.waypoints || []).forEach(w => {
                if (w === focus) { adjacent.add(r.source); adjacent.add(r.dest); }
            });
        });
    }

    // Links (under the cards)
    layout.links.forEach(l => {
        const a = layout.byId[l.source], b = layout.byId[l.dest];
        if (!a || !b) return;
        const dim = adjacent && !adjacent.has(a.pinId) && !adjacent.has(b.pinId);
        ctx.strokeStyle = dim ? 'rgba(255,255,255,0.05)' : (focus ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)');
        ctx.lineWidth = 1 + (l.level || 0) / 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    });

    // Routes (material flows, under the cards)
    layout.routes.forEach(r => {
        const path = [layout.byId[r.source], ...(r.waypoints || []).map(w => layout.byId[w]), layout.byId[r.dest]];
        if (path.some(p => !p) || path.length < 2) return;
        const mat = getMaterialById(r.contentTypeId);
        const color = PI_COLORS[mat ? mat.tier : 0] || '#888';
        const dim = adjacent && !path.some(p => adjacent.has(p.pinId));
        ctx.strokeStyle = dim ? color + '22' : color;
        ctx.lineWidth = dim ? 1 : 2;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();

        // Arrowhead just outside the destination card edge
        const a2 = path[path.length - 2], b2 = path[path.length - 1];
        const ang = Math.atan2(b2.y - a2.y, b2.x - a2.x);
        const tipX = b2.x - Math.cos(ang) * (LAYOUT_CARD_W / 2 + 4);
        const tipY = b2.y - Math.sin(ang) * (LAYOUT_CARD_W / 2 + 4);
        ctx.fillStyle = dim ? color + '22' : color;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - 8 * Math.cos(ang - 0.4), tipY - 8 * Math.sin(ang - 0.4));
        ctx.lineTo(tipX - 8 * Math.cos(ang + 0.4), tipY - 8 * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
    });

    // Pin cards
    layout.pins.forEach(p => {
        const isSel = sel === p.pinId;
        const dim = adjacent && !adjacent.has(p.pinId);
        ctx.globalAlpha = dim ? 0.3 : 1;
        const ch = p.h || LAYOUT_CARD_H;
        const x = p.x - LAYOUT_CARD_W / 2, y = p.y - ch / 2;
        ctx.fillStyle = 'rgba(30, 30, 30, 0.95)';
        ctx.strokeStyle = isSel ? '#fff' : p.color;
        ctx.lineWidth = isSel ? 2 : 1.5;
        roundRect(ctx, x, y, LAYOUT_CARD_W, ch, 6);
        ctx.fill();
        ctx.stroke();
        ctx.textBaseline = 'alphabetic'; // explicit: a previous view may leave 'top'
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Titillium Web, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, p.x, y + 15, LAYOUT_CARD_W - 10);

        if (p.kind === 'cc') {
            // Upgrade level + two capacity bars (CPU red, Powergrid blue).
            // Label + value share one line; the bar sits on its own line below
            // with clear gaps so it never overlaps the text.
            ctx.fillStyle = p.color;
            ctx.font = '9px Titillium Web, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Upgrade level: ' + (c.upgrade_level || 0), p.x, y + 28, LAYOUT_CARD_W - 10);
            const cap = ccCapacity(c.upgrade_level || 0);
            const cpuFrac = cap.cpu ? analysis.usedCpu / cap.cpu : 0;
            const pgFrac = cap.pg ? analysis.usedPg / cap.pg : 0;
            const barX = x + 10, barW = LAYOUT_CARD_W - 20;
            // CPU row
            ctx.fillStyle = '#f87171';
            ctx.font = '8px Titillium Web, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('CPU', x + 8, y + 43);
            ctx.textAlign = 'right';
            ctx.fillText('≈ ' + analysis.usedCpu.toLocaleString() + ' / ' + cap.cpu.toLocaleString(), x + LAYOUT_CARD_W - 8, y + 43);
            drawBar(barX, y + 51, barW, 5, cpuFrac, '#f87171');
            // Powergrid row
            ctx.fillStyle = '#58a6ff';
            ctx.font = '8px Titillium Web, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('PG', x + 8, y + 67);
            ctx.textAlign = 'right';
            ctx.fillText('≈ ' + analysis.usedPg.toLocaleString() + ' / ' + cap.pg.toLocaleString(), x + LAYOUT_CARD_W - 8, y + 67);
            drawBar(barX, y + 75, barW, 5, pgFrac, '#58a6ff');
        } else {
            const sub = pinSubLabel(p, analysis);
            if (sub) {
                ctx.fillStyle = /EXPIRED/.test(sub) ? '#f87171' : '#999';
                ctx.font = '9px Titillium Web, sans-serif';
                ctx.fillText(sub, p.x, y + 32, LAYOUT_CARD_W - 10);
            }
        }
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    });

    // Route quantity labels: aggregate per wire (undirected segment) so one chip
    // summarises every material flowing on that link, each in its tier colour.
    // The full per-material breakdown is shown on hover/selection (overlay panel).
    const cardRects = layout.pins.map(p => {
        const h = p.h || LAYOUT_CARD_H;
        return { x: p.x - LAYOUT_CARD_W / 2, y: p.y - h / 2, w: LAYOUT_CARD_W, h };
    });
    const placed = [];
    const LABEL_H = 13;
    const GAP = 5;
    const hits = (r, list) => list.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);

    // Tally material quantities per wire segment (a route credits every segment
    // it traverses, so waypoint hops each show the flowing amount).
    const segMap = new Map();
    layout.routes.forEach(r => {
        if (!r.quantity) return;
        const path = [layout.byId[r.source], ...(r.waypoints || []).map(w => layout.byId[w]), layout.byId[r.dest]];
        if (path.some(p => !p) || path.length < 2) return;
        const mat = getMaterialById(r.contentTypeId);
        const tier = mat ? mat.tier : 0;
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i].pinId, b = path[i + 1].pinId;
            const key = a < b ? a + '|' + b : b + '|' + a;
            if (!segMap.has(key)) segMap.set(key, { a: Math.min(a, b), b: Math.max(a, b), mats: new Map() });
            const e = segMap.get(key);
            const cur = e.mats.get(tier) || { tier, qty: 0 };
            cur.qty += r.quantity;
            e.mats.set(tier, cur);
        }
    });

    segMap.forEach(entry => {
        const seg = [layout.byId[entry.a], layout.byId[entry.b]];
        if (!seg[0] || !seg[1]) return;
        const dim = adjacent && !adjacent.has(entry.a) && !adjacent.has(entry.b);
        if (dim) return; // non-incident wires stay quiet when a pin is focused

        // Coloured tokens, capped so the chip stays compact (+N if more).
        const mats = [...entry.mats.values()].sort((x, y) => x.tier - y.tier);
        const shown = mats.slice(0, 3);
        const tokens = shown.map(m => ({ text: formatAmount(Math.round(m.qty)), color: PI_COLORS[m.tier] || '#888' }));
        if (mats.length > shown.length) tokens.push({ text: '+' + (mats.length - shown.length), color: '#aaa' });

        ctx.font = 'bold 9px Titillium Web, sans-serif';
        const tokenW = tokens.reduce((s, t) => s + ctx.measureText(t.text).width, 0);
        const lw = Math.max(28, tokenW + GAP * Math.max(0, tokens.length - 1) + 10);

        const ax = (seg[0].x + seg[1].x) / 2, ay = (seg[0].y + seg[1].y) / 2;
        const dirx = seg[1].x - seg[0].x, diry = seg[1].y - seg[0].y;
        const segLen = Math.hypot(dirx, diry) || 1;
        const ux = dirx / segLen, uy = diry / segLen;   // along segment
        const px = -uy, py = ux;                         // perpendicular

        const makeRect = (t, side) => {
            const cx = ax + ux * t + px * side;
            const cy = ay + uy * t + py * side;
            return { x: cx - lw / 2, y: cy - LABEL_H + 4, w: lw, h: LABEL_H };
        };

        const maxT = Math.max(0, segLen / 2 - 30);
        const perps = [0, 18, -18, 38, -38, 58, -58];
        const alongs = [0, 16, -16, 34, -34, 50, -50];
        const order = [];
        for (const t of alongs) if (Math.abs(t) <= maxT) for (const s of perps) order.push([t, s]);

        let rect = null;
        for (const [t, side] of order) {
            const cand = makeRect(t, side);
            if (!hits(cand, cardRects) && !hits(cand, placed)) { rect = cand; break; }
        }
        if (!rect) {
            for (let t = 0; t <= maxT; t += 4) {
                for (const s of perps) {
                    const cand = makeRect(t, s);
                    if (!hits(cand, cardRects) && !hits(cand, placed)) { rect = cand; break; }
                }
                if (rect) break;
            }
        }
        if (!rect) rect = makeRect(0, 0);
        placed.push(rect);

        ctx.fillStyle = 'rgba(15, 15, 15, 0.85)';
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 3);
        ctx.fill();

        let x = rect.x + rect.w / 2 - (tokenW + GAP * Math.max(0, tokens.length - 1)) / 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        tokens.forEach(t => {
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, x, rect.y + 10);
            x += ctx.measureText(t.text).width + GAP;
        });
        ctx.textAlign = 'left';
    });
}

// Fixed screen-space UI drawn on top of the zoomable layout canvas
function drawColonyLayoutOverlay(c) {
    drawColonyChrome(c);

    const margin = 30;
    const top = 130;
    const layout = AppState.colonyLayoutData;
    if (!layout) return;

    const analysis = analyseColonyCached(c);
    const sel = AppState.layoutSel;
    const focus = sel || AppState.layoutHover;

    // Pin info panel (shown for the selected pin, or on hover)
    if (focus && layout.byId[focus]) {
        const p = layout.byId[focus];
        const lines = [
            { text: p.label, color: '#fff', bold: true },
            { text: PIN_KIND_NAMES[p.kind] || 'Pin', color: '#aaa' }
        ];
        if (p.kind === 'extractor') {
            const e = (analysis.extractors || []).find(x => x.pinId === p.pinId);
            if (e) {
                lines.push({ text: `${e.qtyPerCycle.toLocaleString()} / ${formatDuration(e.cycleTime * 1000)}`, color: '#aaa' });
                lines.push({ text: extractorStatus(e).text, color: extractorStatus(e).expired ? '#f87171' : '#aaa' });
            } else {
                lines.push({ text: 'No program', color: '#aaa' });
            }
        }
        if (p.kind === 'launchpad' || p.kind === 'storage' || p.kind === 'cc') {
            const sp = (analysis.storagePins || []).find(x => x.typeId === p.typeId);
            if (sp) lines.push({ text: `${formatAmount(Math.round(sp.used))} / ${formatAmount(sp.capacity)} m3 (${Math.round(sp.fill * 100)}%)`, color: '#aaa' });
            if (p.kind === 'cc') {
                const cap = ccCapacity(c.upgrade_level || 0);
                lines.push({ text: 'Structures + links', color: '#aaa' });
                lines.push({ text: `CPU ${analysis.usedCpu.toLocaleString()} / ${cap.cpu.toLocaleString()}`, color: '#f87171' });
                lines.push({ text: `PG ${analysis.usedPg.toLocaleString()} / ${cap.pg.toLocaleString()}`, color: '#58a6ff' });
                lines.push({ text: 'May differ slightly from in-game', color: '#777' });
            }
            const raw = p.raw;
            if (raw && Array.isArray(raw.contents) && raw.contents.length) {
                raw.contents.slice(0, 3).forEach(ct => {
                    const m = getMaterialById(ct.type_id);
                    lines.push({ text: `${m ? m.name : 'Type ' + ct.type_id}: ${formatAmount(ct.amount)}`, color: '#aaa' });
                });
            }
        }
        // Routes touching this pin, with material name + quantity, colour-coded
        const routeLines = [];
        layout.routes.forEach(r => {
            const isOut = r.source === focus;
            const isIn = r.dest === focus;
            const isVia = (r.waypoints || []).indexOf(focus) !== -1;
            if (!isOut && !isIn && !isVia) return;
            const m = getMaterialById(r.contentTypeId);
            const arrow = isOut ? '→' : isIn ? '←' : '↔';
            routeLines.push({ text: `${arrow} ${m ? m.name : 'Type ' + r.content_type_id} ${formatAmount(Math.round(r.quantity))}`, color: PI_COLORS[m ? m.tier : 0] || '#888' });
        });
        routeLines.slice(0, 6).forEach(rl => lines.push(rl));

        const w = 230, lh = 15, h = 12 + lines.length * lh;
        // Place the panel at the cursor when hovering, else beside the selected pin.
        let px, py;
        if (AppState.layoutHover && layout.byId[AppState.layoutHover]) {
            const hp = AppState.hoverPos || { x: margin + 4, y: top };
            px = hp.x + 14; py = hp.y + 14;
            if (px + w > AppState.cssW - 10) px = hp.x - w - 14; // flip left near edge
        } else {
            const sp = layout.byId[focus];
            const sx = sp.x * AppState.zoom + AppState.canvasOffset.x;
            const sy = sp.y * AppState.zoom + AppState.canvasOffset.y;
            px = sx + LAYOUT_CARD_W / 2 + 12; py = sy - h / 2;
        }
        px = Math.max(10, Math.min(px, AppState.cssW - w - 10));
        py = Math.max(10, Math.min(py, AppState.cssH - h - 10));
        ctx.fillStyle = 'rgba(20, 20, 20, 0.92)';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        roundRect(ctx, px, py, w, h, 6);
        ctx.fill();
        ctx.stroke();
        lines.forEach((ln, i) => {
            ctx.fillStyle = ln.color;
            ctx.font = (ln.bold ? 'bold 11px' : '10px') + ' Titillium Web, sans-serif';
            ctx.fillText(ln.text, px + 10, py + 8 + i * lh);
        });
    }

    // Notes + pin count
    ctx.fillStyle = 'rgba(15, 15, 15, 0.6)';
    roundRect(ctx, AppState.cssW - margin - 300, AppState.cssH - margin - 30, 300, 40, 6);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.font = '10px Titillium Web, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Layout from ESI - recalculates when viewed in game', AppState.cssW - margin, AppState.cssH - margin + 8);
    ctx.fillText(`${layout.pins.length} pin${layout.pins.length === 1 ? '' : 's'}`, AppState.cssW - margin, AppState.cssH - margin - 8);
    ctx.textAlign = 'left';
}

// ---------- Colony Detail View ----------
// Shows a single colony's production chain, producing items and stored items.
function drawColonyChrome(c) {
    const pt = getPlanetTypeByNameOrId(c.planet_type);
    const typeName = pt ? pt.name : `Planet type ${c.planet_type}`;
    const color = pt ? pt.color : '#666';
    const sys = (AppState.systemsLoaded && typeof PI_SYSTEMS !== 'undefined') ? PI_SYSTEMS[c.solar_system_id] : null;
    const systemName = sys ? sys.name : `System ${c.solar_system_id}`;
    const regionName = sys && sys.regionId && PI_DATA.regions && PI_DATA.regions[sys.regionId] ? PI_DATA.regions[sys.regionId] : null;
    const planetName = c._planetName ? `${c._planetName} (${typeName})` : typeName;

    const x = 30;
    let y = x;

    // Back button
    ctx.fillStyle = 'rgba(40,40,40,0.95)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, 90, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 12px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('< Back', x + 45, y + 14);
    drawDetailToggles();
    y += 40;

    // Header (shown in both Details and Layout modes)
    if (AppState.layoutMode) {
        ctx.fillStyle = 'rgba(15, 15, 15, 0.6)';
        roundRect(ctx, x - 10, y - 8, AppState.cssW - 60, 52, 8);
        ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.font = 'bold 22px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(planetName, x, y);
    ctx.fillStyle = '#aaa';
    ctx.font = '13px Titillium Web, sans-serif';
    ctx.fillText(`${systemName}${regionName ? ` (${regionName})` : ''} • CC ${c.upgrade_level || 0} • ${c.num_pins || 0} pins`, x, y + 28);
}

function drawColonyDetail(c) {
    const margin = 30;
    const x = margin;
    let y = 128;

    drawColonyChrome(c);

    const analysis = analyseColonyCached(c);
    const { producing, stored } = analysis;

    // ---- Extractor programs ----
    const val = valueColony(analysis, AppState.colonyPrices || {});
    if (analysis.extractors.length || analysis.idle.extractors || analysis.idle.factories || analysis.idle.expired) {
        ctx.fillStyle = '#e8d900';
        ctx.font = 'bold 14px Titillium Web, sans-serif';
        ctx.fillText('EXTRACTOR PROGRAMS', x, y);
        y += 22;

        if (!analysis.extractors.length) {
            ctx.fillStyle = '#888';
            ctx.font = '12px Titillium Web, sans-serif';
            ctx.fillText('No active extraction programs', x, y);
            y += 18;
        }

        const rightEdge = AppState.cssW - margin;
        analysis.extractors.forEach(e => {
            const st = extractorStatus(e);
            const tierColor = PI_COLORS[e.tier] || '#888';
            const cyclesLeft = (e.expired || !e.expiryMs || e.cycleTime <= 0)
                ? 0
                : Math.max(0, Math.floor((e.expiryMs - Date.now()) / (e.cycleTime * 1000)));
            const price = AppState.colonyPrices[e.productId]?.sell || 0;
            const remainingISK = cyclesLeft * e.qtyPerCycle * price;
            const perDay = e.cycleTime > 0 ? (e.qtyPerCycle / e.cycleTime) * 86400 * price : 0;

            ctx.fillStyle = st.expired ? '#f87171' : tierColor;
            ctx.font = 'bold 14px Titillium Web, sans-serif';
            ctx.fillText(e.productName, x, y);

            ctx.fillStyle = '#999';
            ctx.font = '13px Titillium Web, sans-serif';
            ctx.fillText(`${e.qtyPerCycle.toLocaleString()} per ${formatDuration(e.cycleTime * 1000)}`, x + 190, y);
            ctx.fillText(`${cyclesLeft} cycle${cyclesLeft === 1 ? '' : 's'} left`, x + 360, y);

            ctx.fillStyle = st.expired ? '#f87171' : '#aaa';
            ctx.fillText(st.text, x + 490, y);

            ctx.fillStyle = '#e8d900';
            ctx.textAlign = 'right';
            ctx.fillText(`≈${formatISK(remainingISK)} left`, rightEdge - 110, y);
            ctx.fillText(`${formatISK(perDay)}/day`, rightEdge, y);
            ctx.textAlign = 'left';
            y += 19;
        });

        const warns = [];
        if (analysis.idle.extractors) warns.push(`${analysis.idle.extractors} idle extractor${analysis.idle.extractors === 1 ? '' : 's'} (no program)`);
        if (analysis.idle.factories) warns.push(`${analysis.idle.factories} idle factor${analysis.idle.factories === 1 ? 'y' : 'ies'} (no schematic)`);
        if (warns.length) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = '11px Titillium Web, sans-serif';
            ctx.fillText(`Warning: ${warns.join(' · ')}`, x, y);
            y += 17;
        }
        y += 8;
    }

    // ---- Producing column ----
    let px = x;
    let py = y;
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 14px Titillium Web, sans-serif';
    ctx.fillText('PRODUCING', px, py);
    py += 24;
    if (!producing.length) {
        ctx.fillStyle = '#888';
        ctx.font = '12px Titillium Web, sans-serif';
        ctx.fillText('Nothing being produced', px, py);
    } else {
        producing.forEach(p => {
            const tierColor = PI_COLORS[p.tier] || '#888';
            ctx.fillStyle = tierColor;
            ctx.font = 'bold 13px Titillium Web, sans-serif';
            ctx.fillText(p.name, px, py);
            ctx.fillStyle = '#888';
            ctx.font = '11px Titillium Web, sans-serif';
            const extra = p.type === 'extractor' ? ` • ${p.amount}/cycle` : (p.cycleSec ? ` • ${p.cycleSec}s cycle` : '');
            ctx.fillText(`x${p.count}${extra}`, px + 170, py + 2);
            py += 18;
        });
    }

    // ---- Stored column ----
    let sx = AppState.cssW / 2;
    let sy = y;
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 14px Titillium Web, sans-serif';
    ctx.fillText('STORED', sx, sy);
    sy += 24;
    if (!stored.length) {
        ctx.fillStyle = '#888';
        ctx.font = '12px Titillium Web, sans-serif';
        ctx.fillText('Nothing stored', sx, sy);
    } else {
        stored.forEach(s => {
            const tierColor = PI_COLORS[s.tier] || '#888';
            ctx.fillStyle = tierColor;
            ctx.font = '13px Titillium Web, sans-serif';
            ctx.fillText(s.name, sx, sy);
            ctx.fillStyle = '#e8d900';
            ctx.font = 'bold 12px Titillium Web, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(formatAmount(s.amount), AppState.cssW - margin, sy);
            ctx.textAlign = 'left';
            sy += 18;
        });
    }

    // ---- Storage fill (below stored list) ----
    let storageBottom = sy;
    if (analysis.storagePins.length) {
        let fy = sy + 16;
        const colW = AppState.cssW - margin - sx;
        ctx.fillStyle = '#e8d900';
        ctx.font = 'bold 14px Titillium Web, sans-serif';
        ctx.fillText('STORAGE', sx, fy);
        fy += 24;

        analysis.storagePins.forEach(sp => {
            const pct = Math.min(100, Math.round(sp.fill * 100));
            const color = sp.fill >= 1 ? '#f87171' : (sp.fill >= 0.8 ? '#fbbf24' : '#4ade80');

            ctx.fillStyle = '#ccc';
            ctx.font = 'bold 11px Titillium Web, sans-serif';
            ctx.fillText(PIN_KIND_NAMES[sp.kind], sx, fy);
            ctx.fillStyle = color;
            ctx.textAlign = 'right';
            ctx.fillText(`${pct}%`, sx + colW, fy);
            ctx.textAlign = 'left';
            fy += 16;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            roundRect(ctx, sx, fy, colW, 6, 3);
            ctx.fill();
            if (pct > 0) {
                ctx.fillStyle = color;
                roundRect(ctx, sx, fy, Math.max(6, colW * Math.min(1, sp.fill)), 6, 3);
                ctx.fill();
            }
            fy += 12;

            ctx.fillStyle = '#888';
            ctx.font = '10px Titillium Web, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${formatAmount(Math.round(sp.used))} / ${formatAmount(sp.capacity)} m³`, sx + colW, fy);
            ctx.textAlign = 'left';
            fy += 14;

            if (sp.top && sp.top.length) {
                ctx.fillStyle = '#777';
                ctx.font = '10px Titillium Web, sans-serif';
                ctx.fillText(sp.top.map(t => `${t.name} ${formatAmount(Math.round(t.m3))}m³`).join(' · '), sx, fy);
                fy += 16;
            }
            fy += 6;
        });
        storageBottom = fy;
    }

    // ---- Production chain ----
    // Draw a chain box per produced material showing its inputs
    let cy = Math.max(py, storageBottom) + 20;
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 14px Titillium Web, sans-serif';
    ctx.fillText('PRODUCTION CHAIN', x, cy);
    cy += 24;

    if (!producing.length) {
        ctx.fillStyle = '#888';
        ctx.font = '12px Titillium Web, sans-serif';
        ctx.fillText('No chains to show', x, cy);
        return;
    }

    // For each producing item, show the chain from its inputs
    producing.forEach(p => {
        // If a factory output, resolve the material by finding it in recipes
        const chain = resolveColonyChain(p);
        drawChainRow(chain, x, cy, AppState.cssW - margin * 2);
        cy += chain ? chain.height : 34;
    });
}

// Resolve the chain inputs for a produced item. Returns { name, tier, color, inputs, height }
// inputs: array of { name, tier, qty }
function resolveColonyChain(p) {
    // Try to find the material by name in PI_DATA.materials
    let mat = null;
    for (const id in PI_DATA.materials) {
        if (PI_DATA.materials[id].name && PI_DATA.materials[id].name.toLowerCase() === p.name.toLowerCase()) {
            mat = PI_DATA.materials[id];
            break;
        }
    }

    const result = { name: p.name, tier: p.tier || 0, color: PI_COLORS[p.tier] || '#888', inputs: [], height: 0 };

    if (mat && mat.inputs) {
        for (const [idStr, qty] of Object.entries(mat.inputs)) {
            const subMat = getMaterialById(parseInt(idStr));
            result.inputs.push({
                name: subMat ? subMat.name : String(idStr),
                tier: subMat ? subMat.tier : 0,
                qty
            });
        }
    }

    result.height = 40 + Math.max(result.inputs.length, 1) * 18;
    return result;
}

function drawChainRow(chain, x, y, width) {
    // Card background
    ctx.fillStyle = 'rgba(30,30,30,0.95)';
    ctx.strokeStyle = chain.color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, width, chain.height, 8);
    ctx.fill();
    ctx.stroke();

    // Output name (left accent)
    ctx.fillStyle = chain.color;
    ctx.beginPath();
    roundRect(ctx, x, y, 4, chain.height, [8, 0, 0, 8]);
    ctx.fill();

    ctx.fillStyle = chain.color;
    ctx.font = 'bold 13px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(chain.name, x + 16, y + 10);

    ctx.fillStyle = '#888';
    ctx.font = '10px Titillium Web, sans-serif';
    ctx.fillText(`P${chain.tier}`, x + 16, y + 26);

    // Inputs on the right side
    let iy = y + 10;
    ctx.fillStyle = '#999';
    ctx.font = '11px Titillium Web, sans-serif';
    chain.inputs.forEach(inp => {
        const inpColor = PI_COLORS[inp.tier] || '#999';
        ctx.fillStyle = inpColor;
        ctx.fillText(`${inp.qty}x ${inp.name}`, x + width - 180, iy);
        iy += 18;
    });
}

// ---------- Canvas Event Handlers ----------
// Shared layout for reference-view cards so drawing, hit-testing and hover
// can never drift apart.
function refCardLayout() {
    const cols = Math.floor(AppState.cssW / 180) || 1;
    const spacing = AppState.cssW / cols;
    return {
        cols,
        spacing,
        cellWidth: spacing - 16,
        cellHeight: 95,
        materials: [
            ...getMaterialsByTier(1),
            ...getMaterialsByTier(2),
            ...getMaterialsByTier(3),
            ...getMaterialsByTier(4)
        ]
    };
}

function refCardAt(pos) {
    const L = refCardLayout();
    const col = Math.floor(pos.x / L.spacing);
    if (col < 0 || col >= L.cols) return null;
    const row = Math.floor((pos.y + AppState.canvasOffset.y - 12) / (L.cellHeight + 12));
    if (row < 0) return null;
    const i = row * L.cols + col;
    const mat = L.materials[i];
    if (!mat) return null;
    const cardX = col * L.spacing + 8;
    const cardY = row * (L.cellHeight + 12) + 12 - AppState.canvasOffset.y;
    if (pos.x < cardX || pos.x > cardX + L.cellWidth) return null;
    if (pos.y < cardY || pos.y > cardY + L.cellHeight) return null;
    return mat;
}

function colonyCardAt(pos) {
    for (const card of AppState.colonyCards) {
        if (pos.x >= card.x && pos.x <= card.x + card.w &&
            pos.y >= card.y && pos.y <= card.y + card.h) {
            return card;
        }
    }
    return null;
}

// Hit-test chain nodes (world space: node.x/y are the node centres)
function chainNodeAt(pos) {
    if (AppState.viewMode !== 'chain' || !AppState.chainLayout) return null;
    const wx = (pos.x - AppState.canvasOffset.x) / AppState.zoom;
    const wy = (pos.y - AppState.canvasOffset.y) / AppState.zoom;
    for (const node of AppState.chainLayout.nodes) {
        const w = 140;
        const h = node.tier === 0 ? 78 : 62;
        if (wx >= node.x - w / 2 && wx <= node.x + w / 2 &&
            wy >= node.y - h / 2 && wy <= node.y + h / 2) {
            return node;
        }
    }
    return null;
}

function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const pos = getCanvasPos(e);
    AppState.pointerDown = pos;
    AppState.pointerId = e.pointerId;
    AppState.hasDragged = false;
    AppState.isDraggingCanvas = true;
    AppState.lastMousePos = pos;

    // Remember what was pressed; the action fires on release (tap/click) only
    // if the user didn't drag, so press-drag never mis-selects.
    if (AppState.viewMode === 'colonies') {
        if (AppState.colonyDetail) {
            const overBack = pos.x >= 30 && pos.x <= 120 && pos.y >= 30 && pos.y <= 58;
            const toggle = detailToggleRects().find(t =>
                pos.x >= t.x && pos.x <= t.x + t.w && pos.y >= t.y && pos.y <= t.y + t.h);
            if (overBack) {
                AppState.pendingHit = { type: 'colonyBack' };
            } else if (toggle) {
                AppState.pendingHit = { type: 'detailToggle', mode: toggle.mode };
            } else if (AppState.layoutMode) {
                const wpos = screenToWorld(pos.x, pos.y);
                const pin = colonyLayoutPinAt(wpos);
                AppState.pendingHit = pin ? { type: 'layoutPin', pinId: pin.pinId } : { type: 'layoutClear' };
            } else {
                AppState.pendingHit = null;
            }
        } else {
            const card = colonyCardAt(pos);
            AppState.pendingHit = card ? { type: 'colony', colony: card.colony } : null;
        }
    } else if (AppState.viewMode === 'reference') {
        // The Planets sub-view is purely informational - its product nodes are
        // not clickable, so never treat them as navigable product hits.
        const mat = AppState.refSubview === 'planets' ? null : refCardAt(pos);
        AppState.pendingHit = mat ? { type: 'product', id: mat.id } : null;
    } else if (AppState.viewMode === 'system') {
        const card = systemCardAt(pos);
        AppState.pendingHit = card ? { type: 'systemProduct', id: card.productId } : null;
    } else if (AppState.viewMode === 'chain') {
        const node = chainNodeAt(pos);
        AppState.pendingHit = node ? { type: 'product', id: node.materialId } : null;
    } else if (AppState.viewMode === 'finder') {
        const card = finderCardAt(pos);
        AppState.pendingHit = card ? { type: 'finderCard', card } : null;
    } else {
        AppState.pendingHit = null;
    }

    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
}

function onPointerMove(e) {
    const pos = getCanvasPos(e);

    if (AppState.pointerDown && !AppState.hasDragged) {
        const dx = pos.x - AppState.pointerDown.x;
        const dy = pos.y - AppState.pointerDown.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            AppState.hasDragged = true;
        }
    }

    if (!AppState.isDraggingCanvas) {
        if (AppState.viewMode === 'reference') {
            // Planets sub-view is read-only: keep its product nodes non-interactive
            // (default cursor, no hover tooltip) so they read as static info.
            const mat = AppState.refSubview === 'planets' ? null : refCardAt(pos);
            const id = mat ? mat.id : null;
            if (id !== AppState.hoveredCard) {
                AppState.hoveredCard = id;
                canvas.style.cursor = id ? 'pointer' : 'default';
                draw();
            }
        } else if (AppState.viewMode === 'system') {
            const over = !!systemCardAt(pos);
            canvas.style.cursor = over ? 'pointer' : 'default';
        } else if (AppState.viewMode === 'chain') {
            const node = chainNodeAt(pos);
            const id = node ? node.materialId : null;
            canvas.style.cursor = node ? 'pointer' : 'default';
            if (id !== AppState.hoverChainNode) {
                AppState.hoverChainNode = id;
                AppState.hoverPos = pos;
                draw();
            }
        } else if (AppState.viewMode === 'finder') {
            const over = !!finderCardAt(pos);
            canvas.style.cursor = over ? 'pointer' : 'default';
        } else if (AppState.viewMode === 'colonies' && AppState.colonyDetail && AppState.layoutMode) {
            const wpos = screenToWorld(pos.x, pos.y);
            const pin = colonyLayoutPinAt(wpos);
            const id = pin ? pin.pinId : null;
            // Redraw on hover enter/leave AND on every move while over a pin, so
            // the info panel tracks the cursor.
            const changed = id !== AppState.layoutHover;
            AppState.layoutHover = id;
            AppState.hoverPos = pos;
            if (changed || id !== null) draw();
            canvas.style.cursor = id ? 'pointer' : 'default';
        }
    }

    if (AppState.isDraggingCanvas) {
        const dx = pos.x - AppState.lastMousePos.x;
        const dy = pos.y - AppState.lastMousePos.y;
        // Reference, system, finder and non-layout colonies views lay out vertically
        // only - panning X there desyncs the list from the background, so lock
        // to Y. Colony layout mode is a full world-space view, so it pans free.
        const lockY = AppState.viewMode === 'reference' ||
            AppState.viewMode === 'system' ||
            AppState.viewMode === 'finder' ||
            (AppState.viewMode === 'colonies' && !(AppState.colonyDetail && AppState.layoutMode));
        if (lockY) {
            AppState.canvasOffset.y += dy;
            clampListScroll();
        } else {
            AppState.canvasOffset.x += dx;
            AppState.canvasOffset.y += dy;
        }
        AppState.lastMousePos = pos;
        draw();
    }
}

function onPointerUp(e) {
    const wasDrag = AppState.hasDragged;
    const hit = AppState.pendingHit;

    AppState.isDraggingCanvas = false;
    AppState.pointerDown = null;
    AppState.pointerId = null;
    AppState.pendingHit = null;
    AppState.layoutHover = null;
    AppState.hasDragged = false;

    if (!wasDrag) {
        if (hit) {
            if (hit.type === 'systemProduct') {
                selectProduct(hit.id);
                return;
            }
            if (hit.type === 'product') {
                const id = hit.id;
                // Reference view: single click immediately opens the chain (user expectation).
                // Chain view retains single-click focus / double-click navigate behavior.
                if (AppState.viewMode === 'reference') {
                    selectProduct(id);
                    return;
                }
                if (AppState.chainFocus === id) {
                    // Click the focused node again -> clear the highlight.
                    AppState.chainFocus = null;
                } else {
                    const now = Date.now();
                    if (AppState._lastClickId === id && (now - AppState._lastClickTime) < 350) {
                        // Double-click -> drill into the product (navigate).
                        AppState.chainFocus = null;
                        AppState._lastClickId = null;
                        selectProduct(id);
                        return;
                    }
                    // Single click -> focus/highlight this node's input subtree.
                    AppState._lastClickId = id;
                    AppState._lastClickTime = now;
                    AppState.chainFocus = id;
                }
                draw();
            } else if (hit.type === 'colony') {
                AppState.colonyDetail = hit.colony;
                AppState.layoutMode = false;
                AppState.layoutSel = null;
                resetViewport();
                updateUrlState();
                draw();
            } else if (hit.type === 'colonyBack') {
                AppState.colonyDetail = null;
                AppState.layoutMode = false;
                AppState.layoutSel = null;
                resetViewport();
                updateUrlState();
                draw();
            } else if (hit.type === 'detailToggle') {
                AppState.layoutMode = hit.mode;
                AppState.layoutSel = null;
                resetViewport();
                draw();
            } else if (hit.type === 'layoutPin') {
                AppState.layoutSel = AppState.layoutSel === hit.pinId ? null : hit.pinId;
                draw();
            } else if (hit.type === 'layoutClear') {
                AppState.layoutSel = null;
                draw();
            } else if (hit.type === 'finderCard') {
                if (hit.card.kind === 'spot') {
                    const key = groupKey(hit.card.row);
                    AppState.finder.expandedSpot = AppState.finder.expandedSpot === key ? null : key;
                    draw();
                } else if (hit.card.kind === 'openChain') {
                    selectProduct(hit.card.productId);
                } else if (hit.card.kind === 'nextProduct') {
                    const r = hit.card.result;
                    const rows = buildSpotGroups(r.id);
                    if (!rows.length) return;
                    AppState.finder.bestProductId = r.id;
                    AppState.finder.bestStats = { profit: r.profit, margin: r.margin, profitLocal: r.profitLocal, marginLocal: r.marginLocal };
                    AppState.finder.spotRows = rows;
                    AppState.finder.spotProductName = r.mat.name;
                    AppState.finder.activePanel = 'spot';
                    AppState.finder.expandedSpot = null;
                    renderFinderSpotResults();
                } else {
                    selectProduct(hit.card.result.id);
                }
            }
        } else if (!hit && AppState.chainFocus !== null) {
            AppState.chainFocus = null;
            draw();
        }
    }
}

function onPointerCancel() {
    AppState.isDraggingCanvas = false;
    AppState.pointerDown = null;
    AppState.pointerId = null;
    AppState.pendingHit = null;
    AppState.hasDragged = false;
}

function onWheel(e) {
    e.preventDefault();

    // World-space views (chain graph, planets, colony layout map): the wheel
    // zooms to the cursor - scroll up zooms in.
    if (isWorldZoomView()) {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        zoomAt(AppState.zoom * factor, getCanvasPos(e));
        return;
    }

    // Flat list views (reference grid, colonies list, finder results): the
    // wheel scrolls the list naturally - wheel down moves content up.
    AppState.canvasOffset.y -= e.deltaY;
    clampListScroll();
    draw();
}

// Keep flat list views (reference grid, system, finder, colonies list) locked to the
// screen. When all content fits there is nothing to scroll (offset stays 0);
// when it overflows, scrolling is clamped so you can't drift past the top or
// bottom of the content.
function clampListScroll() {
    const isRef = AppState.viewMode === 'reference';
    const isSystem = AppState.viewMode === 'system';
    const isFinder = AppState.viewMode === 'finder';
    const isColoniesList = AppState.viewMode === 'colonies' &&
        !(AppState.colonyDetail && AppState.layoutMode);
    // Colonies now uses DOM (coloniesDom) like Finder — no canvas scroll
    if (isColoniesList) {
        const cDom = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('coloniesDom') : null;
        if (cDom && cDom.classList && !cDom.classList.contains('hidden')) return;
    }
    if (!isRef && !isSystem && !isFinder && !isColoniesList) return;

    let contentHeight = 0;
    if (isRef) {
        if (AppState.refSubview === 'planets') {
            // Mirror the layout maths from drawPlanetsView() so scrolling is bounded correctly.
            const planetTypeIds = Object.keys(PI_DATA.planetTypes)
                .map(Number).sort((a, b) => a - b)
                .filter(id => (PI_DATA.planetTypes[id].p0Materials || []).length > 0);
            const cols = 5, nodeHeight = 44, groupGap = 24, rowGap = 12, headerH = 22;
            let h = 10;
            planetTypeIds.forEach(typeId => {
                const p0Ids = PI_DATA.planetTypes[typeId].p0Materials || [];
                const rows = Math.ceil(p0Ids.length / cols);
                h += (headerH + rows * (nodeHeight + rowGap)) + groupGap;
            });
            contentHeight = h;
        } else {
            const L = refCardLayout();
            const rows = Math.ceil(L.materials.length / L.cols);
            contentHeight = rows * (L.cellHeight + 12) + 12;
        }
    } else if (isSystem) {
        const off = AppState.canvasOffset.y;
        contentHeight = (AppState.systemCards || []).reduce((m, c) => Math.max(m, c.y + off + c.h), 0);
        if (!contentHeight) contentHeight = AppState.cssH;
    } else if (isFinder) {
        const off = AppState.canvasOffset.y;
        // Header product card is fixed (y=10) - exclude it from scrollable height
        const scrollable = (AppState.finderCards || []).filter(c => c.kind === 'spot' || c.kind === 'nextProduct');
        const src = scrollable.length ? scrollable : (AppState.finderCards || []);
        contentHeight = src.reduce((m, c) => Math.max(m, c.y + off + c.h), 0);
        // Header itself is ~82px fixed at top, rows start below it - ensure height at least covers header + rows
        if (contentHeight < 100) contentHeight = 100;
    } else if (isColoniesList) {
        const off = AppState.canvasOffset.y;
        contentHeight = (AppState.colonyCards || []).reduce((m, c) => Math.max(m, c.y + off + c.h), 0);
    }
    if (!contentHeight) return;

    const maxScroll = Math.max(0, contentHeight - AppState.cssH);
    AppState.canvasOffset.y = Math.min(Math.max(AppState.canvasOffset.y, 0), maxScroll);
}

// Coordinate transforms
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - AppState.canvasOffset.x) / AppState.zoom,
        y: (screenY - AppState.canvasOffset.y) / AppState.zoom
    };
}

function worldToScreen(worldX, worldY) {
    return {
        x: worldX * AppState.zoom + AppState.canvasOffset.x,
        y: worldY * AppState.zoom + AppState.canvasOffset.y
    };
}

// Views rendered inside the world transform where zoom genuinely scales content
function isWorldZoomView() {
    return AppState.viewMode === 'chain' || AppState.viewMode === 'planets' ||
        (AppState.viewMode === 'colonies' && AppState.colonyDetail && AppState.layoutMode);
}

// View Controls
function zoomAt(newZoom, anchor) {
    if (!isWorldZoomView()) return; // flat list views don't scale - avoid offset drift
    const clamped = Math.max(0.25, Math.min(4, newZoom));
    if (anchor && clamped !== AppState.zoom) {
        // Keep the world point under the anchor stationary while zooming
        const ratio = clamped / AppState.zoom;
        AppState.canvasOffset.x = anchor.x - (anchor.x - AppState.canvasOffset.x) * ratio;
        AppState.canvasOffset.y = anchor.y - (anchor.y - AppState.canvasOffset.y) * ratio;
    }
    AppState.zoom = clamped;
    elements.zoomLevel.textContent = Math.round(AppState.zoom * 100) + '%';
    draw();
}

function setZoom(zoom) {
    zoomAt(zoom, { x: AppState.cssW / 2, y: AppState.cssH / 2 });
}

function setViewMode(mode) {
    if (!AppState.suppressViewHistoryPush && AppState.viewMode !== mode) {
        AppState.viewHistory.push(AppState.viewMode);
        if (AppState.viewHistory.length > 20) AppState.viewHistory.shift();
    }
    if (AppState.suppressViewHistoryPush) AppState.suppressViewHistoryPush = false;
    if (mode !== 'colonies') {
        AppState.colonyDetail = null;
        AppState.layoutMode = false;
        AppState.layoutSel = null;
    }
    AppState.viewMode = mode;
    AppState.hoverChainNode = null;
    AppState.hoveredCard = null;
    AppState.chainFocus = null;
    elements.viewReference.classList.toggle('active', mode === 'reference');
    if (elements.viewSystem) elements.viewSystem.classList.toggle('active', mode === 'system');
    elements.viewChain.classList.toggle('active', mode === 'chain');
    elements.viewColonies.classList.toggle('active', mode === 'colonies');
    elements.viewFinder.classList.toggle('active', mode === 'finder');
    elements.backToRef.classList.remove('hidden');

    // Keep the Reference sub-view toggle (now inside the sidebar) in sync
    if (mode === 'reference') {
        document.querySelectorAll('.subview-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.sub === AppState.refSubview));
    }

    const helpText = document.querySelector('.canvas-help p');
    if (helpText) {
    if (mode === 'reference') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> Click any material to view its production chain and market data';
    } else if (mode === 'system') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-search"></i> System view &bull; Search a system in the side bar to see its planets and what it can produce';
    } else if (mode === 'colonies') {
        canvas.style.cursor = 'default';
        const authed = window.piEsiAuth && piEsiAuth.isAuthenticated();
        helpText.innerHTML = authed
            ? '<i class="fas fa-info-circle"></i> My Colonies &bull; Click a colony card to open it, then use Layout to see the planet map - tap pins to inspect them'
            : '<i class="fas fa-info-circle"></i> My Colonies &bull; Sign in with EVE SSO to view your planetary colonies';
    } else if (mode === 'finder') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-location-arrow"></i> Finder results &bull; Click a system card to show its gate route &bull; Click a product to open its chain';
    } else {
        canvas.style.cursor = 'default';
        if (AppState.chainLayout) {
            helpText.innerHTML = '<i class="fas fa-info-circle"></i> Viewing production chain &bull; Click a node to re-target it &bull; Drag to pan, scroll to zoom';
        } else {
            helpText.innerHTML = '<i class="fas fa-info-circle"></i> Select a product to view its production chain';
        }
    }
    }

    // Sync sidebar tab (button highlight + panel content) with canvas view mode.
    const reverseViewToTab = { chain: 'chain', system: 'system', colonies: 'colonies', finder: 'finder', reference: 'ref' };
    const activeTab = reverseViewToTab[mode];
    activateSidebarTab(activeTab);

    // Hide the bottom canvas help pill in Finder (it was the clipped bar at screen bottom)
    const canvasHelp = document.querySelector('.canvas-help');
    if (canvasHelp) canvasHelp.classList.toggle('hidden', mode === 'finder');

    // Finder DOM overlay: show grid report instead of stretched canvas
    const isFinderView = mode === 'finder';
    const finderDom = document.getElementById('finderDom');
    const isColoniesListView = mode === 'colonies' && !(AppState.colonyDetail && AppState.layoutMode);
    const coloniesDom = document.getElementById('coloniesDom') || elements.coloniesDom;
    const piCanvasEl = document.getElementById('piCanvas');
    if (finderDom) finderDom.classList.toggle('hidden', !isFinderView);
    if (coloniesDom) coloniesDom.classList.toggle('hidden', !isColoniesListView);
    if (piCanvasEl) piCanvasEl.classList.toggle('hidden', isFinderView || isColoniesListView);
    if (isFinderView) {
        if (typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function') {
            try { renderFinderDom(); } catch (e) { /* headless stub may lack DOM helpers */ }
        }
    }
    if (isColoniesListView) {
        if (typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function') {
            try { renderColoniesDom(AppState.colonies, AppState.systemsLoaded); } catch (e) { /* headless */ }
        }
    }
    // Legacy timeline element (now hidden via CSS, kept for compat)
    const tlMain = document.getElementById('coloniesTimelineMain') || elements.coloniesTimelineMain;
    if (tlMain) tlMain.classList.add('hidden');
    updateUrlState();
    setColonyTick(mode === 'colonies');
    draw();
}

// ---------- Shareable URL state ----------
// Encodes the current view/product in the hash (e.g. #view=chain&product=2286)
// so chains can be bookmarked and shared.
function updateUrlState() {
    try {
        const params = new URLSearchParams();
        params.set('view', AppState.viewMode);
        if (AppState.targetProduct) params.set('product', AppState.targetProduct);
        if (AppState.viewMode === 'colonies' && AppState.colonyDetail) {
            params.set('colony', AppState.colonyDetail.planet_id);
            if (AppState.layoutMode) params.set('layout', '1');
        }
        const hash = '#' + params.toString();
        if (window.location.hash !== hash) {
            window.history.replaceState(null, '', hash);
        }
    } catch (e) { /* ignore */ }
}

function restoreFromUrl() {
    if (!window.location.hash || window.location.hash === '#') return;
    try {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const view = params.get('view');
        const product = parseInt(params.get('product'));

        if (product && getMaterialById(product)) {
            if (elements.finderProduct) elements.finderProduct.value = String(product);
            if (elements.chainProductSelect) elements.chainProductSelect.value = String(product);
            AppState.targetProduct = product;
            // Defer layout until after view is set so fitChainView centers correctly
        }
        if (view === 'planets') {
            // Planets is now a sub-view inside Reference.
            AppState.refSubview = 'planets';
            AppState.suppressViewHistoryPush = true;
            setViewMode('reference');
        } else if (view && ['reference', 'system', 'chain', 'colonies', 'finder'].includes(view)) {
            AppState.suppressViewHistoryPush = true;
            setViewMode(view);
        } else if (product) {
            AppState.suppressViewHistoryPush = true;
            setViewMode('chain');
        }
        // Now that the view is correct (chain mode enables world zoom), generate/fit the chain centered
        if (product && getMaterialById(product)) {
            generateChainLayout();
            fetchMarketData();
            // If restore landed on reference/system/etc but a product is set, chain is ready in background
            // (no extra view switch needed — setViewMode already handled shareable URL case)
        }

        // Colony deep link: open this colony's detail once colonies have loaded
        const colony = parseInt(params.get('colony'));
        if (view === 'colonies' && colony) {
            AppState.pendingColonyId = colony;
            AppState.pendingLayoutMode = params.get('layout') === '1';
        }
    } catch (e) { /* ignore malformed hash */ }
}

function fitView() {
    if (AppState.viewMode === 'chain' && AppState.chainLayout) {
        fitChainView(AppState.chainLayout);
    } else {
        resetViewport();
    }
}

function resetViewport() {
    AppState.canvasOffset = { x: 0, y: 0 };
    setZoom(1);
}

// ---------- Reference Grids (sidebar) ----------
function setupReferenceGrids() {
    // The Reference sidebar panel was removed (Reference is now a main-toolbar view),
    // so these grid containers no longer exist. Guard to avoid null dereferences.
    if (!elements.refP1) return;
    [
        [elements.refP1, 1],
        [elements.refP2, 2],
        [elements.refP3, 3],
        [elements.refP4, 4]
    ].forEach(([el, tier]) => {
        el.innerHTML = getMaterialsByTier(tier).map(m => `
            <div class="ref-item" data-id="${m.id}" title="${m.name}">${m.name}</div>
        `).join('');
    });

    document.querySelectorAll('.ref-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            selectProduct(id);
        });
    });
}

// ---------- System Checker (offline SDE + skyhook) ----------
function setupSystemChecker() {
    elements.checkSystem.addEventListener('click', checkSystem);
    elements.systemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkSystem();
    });
}

let systemsLoadPromise = null;
function ensureSystemsLoaded() {
    if (AppState.systemsLoaded) return Promise.resolve(true);
    if (systemsLoadPromise) return systemsLoadPromise; // single-flight, avoids double 4.5MB download

    systemsLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'pi-systems.js?v=' + (window.PI_ASSET_VERSION || '1');
        script.onload = () => {
            AppState.systemsLoaded = true;
            resolve(true);
        };
        script.onerror = () => {
            console.error('Failed to load pi-systems.js');
            systemsLoadPromise = null; // allow a clean retry
            resolve(false);
        };
        document.head.appendChild(script);
    });
    return systemsLoadPromise;
}

let planetsLoadPromise = null;
function ensurePlanetsLoaded() {
    if (AppState.planetsLoaded) return Promise.resolve(true);
    if (planetsLoadPromise) return planetsLoadPromise; // single-flight

    planetsLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'pi-planets.js?v=' + (window.PI_ASSET_VERSION || '1');
        script.onload = () => {
            AppState.planetsLoaded = true;
            resolve(true);
        };
        script.onerror = () => {
            console.error('Failed to load pi-planets.js');
            planetsLoadPromise = null;
            resolve(false);
        };
        document.head.appendChild(script);
    });
    return planetsLoadPromise;
}

async function checkSystem() {
    const systemName = elements.systemInput.value.trim();
    if (!systemName) return;

    elements.checkSystem.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

    const loaded = await ensureSystemsLoaded();
    if (!loaded) {
        elements.systemPlanets.innerHTML = '<div style="color: var(--danger)">Failed to load system data</div>';
        elements.systemResults.classList.remove('hidden');
        elements.checkSystem.innerHTML = '<i class="fas fa-search"></i> Check System';
        return;
    }

    const lower = systemName.toLowerCase();

    const system = findSystemByName(lower);

    if (!system) {
        elements.systemPlanets.innerHTML = '<div style="color: var(--danger)">System not found</div>';
        elements.systemResults.classList.remove('hidden');
        elements.checkSystem.innerHTML = '<i class="fas fa-search"></i> Check System';
        return;
    }

    const planetTypes = system.planets.map(p => p.typeId).filter(Boolean);
    const skyhookTotals = { power: 0, workforce: 0, reagents: {} };

    system.planets.forEach(p => {
        if (p.skyhook) {
            if (p.skyhook.kind === 'power') skyhookTotals.power += p.skyhook.amount;
            else if (p.skyhook.kind === 'workforce') skyhookTotals.workforce += p.skyhook.amount;
            else if (p.skyhook.kind === 'reagent') {
                skyhookTotals.reagents[p.skyhook.reagentTypeId] =
                    (skyhookTotals.reagents[p.skyhook.reagentTypeId] || 0) + p.skyhook.amount;
            }
        }
    });

    displaySystemResults(system, planetTypes, skyhookTotals);

    elements.checkSystem.innerHTML = '<i class="fas fa-search"></i> Check System';
}

// Shared tier cascade: which material ids become producible given a set of
// available raw (P0) resources - used by the System Checker (one system) and
// the Finder ISK maximizer (whole jump-radius area).
function computeProducible(availableP0) {
    const p1 = new Set();
    for (const mat of getMaterialsByTier(1)) {
        if (mat.inputs && Object.keys(mat.inputs).every(i => availableP0.has(parseInt(i)))) {
            p1.add(mat.id);
        }
    }
    const p2 = new Set();
    for (const mat of getMaterialsByTier(2)) {
        if (mat.inputs && Object.keys(mat.inputs).every(i =>
            p1.has(parseInt(i)) || availableP0.has(parseInt(i)))) {
            p2.add(mat.id);
        }
    }
    const p3 = new Set();
    for (const mat of getMaterialsByTier(3)) {
        if (mat.inputs && Object.keys(mat.inputs).every(i =>
            p2.has(parseInt(i)) || p1.has(parseInt(i)) || availableP0.has(parseInt(i)))) {
            p3.add(mat.id);
        }
    }
    const p4 = new Set();
    for (const mat of getMaterialsByTier(4)) {
        if (mat.inputs && Object.keys(mat.inputs).every(i =>
            p3.has(parseInt(i)) || p2.has(parseInt(i)) ||
            p1.has(parseInt(i)) || availableP0.has(parseInt(i)))) {
            p4.add(mat.id);
        }
    }
    return { p1, p2, p3, p4 };
}

function formatSecurity(sec) {
    if (sec === null || sec === undefined) return '?';
    return sec.toFixed(1);
}

function displaySystemResults(system, planetTypes, skyhookTotals) {
    const regionName = PI_DATA.regions[system.regionId] || 'Unknown Region';
    const securityClass = system.security >= 0.5 ? 'hi' : (system.security >= 0.1 ? 'lo' : 'null');

    elements.systemInfo.innerHTML = `
        <strong>${system.name}</strong> <span class="sec-badge ${securityClass}">${formatSecurity(system.security)}</span>
        <span class="region-name">${regionName}</span>
    `;

    // Planet type counts
    const counts = {};
    planetTypes.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
    });

    let planetsHtml = `<h4>${planetTypes.length} Planets</h4>`;
    planetsHtml += '<div class="planet-count-row">';
    for (const [typeId, count] of Object.entries(counts)) {
        const pt = getPlanetTypeData(parseInt(typeId));
        if (pt) {
            planetsHtml += `
                <span class="planet-type-badge" style="background: ${pt.color};" title="${pt.name}">
                    ${pt.name} ×${count}
                </span>
            `;
        }
    }
    planetsHtml += '</div>';
    elements.systemPlanets.innerHTML = planetsHtml;

    // Skyhook summary
    if (skyhookTotals.power > 0 || skyhookTotals.workforce > 0 || Object.keys(skyhookTotals.reagents).length > 0) {
        let skyHtml = '<div class="skyhook-summary"><h4><i class="fas fa-satellite-dish"></i> Skyhooks</h4>';
        if (skyhookTotals.power > 0) skyHtml += `<div class="skyhook-item power"><i class="fas fa-bolt"></i> Power: ${skyhookTotals.power.toLocaleString()}</div>`;
        if (skyhookTotals.workforce > 0) skyHtml += `<div class="skyhook-item workforce"><i class="fas fa-users"></i> Workforce: ${skyhookTotals.workforce.toLocaleString()}</div>`;
        for (const [typeId, amount] of Object.entries(skyhookTotals.reagents)) {
            const reagentName = (PI_DATA.reagentTypes && PI_DATA.reagentTypes[typeId]) || ('Reagent ' + typeId);
            skyHtml += `<div class="skyhook-item reagent"><i class="fas fa-flask"></i> ${reagentName}: ${amount.toLocaleString()}</div>`;
        }
        skyHtml += '</div>';
        elements.systemPlanets.innerHTML += skyHtml;
    }

    // Calculate producible materials
    const availableP0 = new Set();
    planetTypes.forEach(typeId => {
        const pt = getPlanetTypeData(typeId);
        if (pt) {
            pt.p0Materials.forEach(id => availableP0.add(id));
        }
    });

    const prod = computeProducible(availableP0);
    const producibleP2 = [...prod.p2].map(id => getMaterialById(id)).filter(Boolean);
    const producibleP3 = [...prod.p3].map(id => getMaterialById(id)).filter(Boolean);
    const producibleP4 = [...prod.p4].map(id => getMaterialById(id)).filter(Boolean);

    elements.producibleP2.innerHTML = producibleP2.length > 0
        ? producibleP2.map(p => `<div class="producible-item p2" data-id="${p.id}">${p.name}</div>`).join('')
        : '<div style="color: var(--muted); font-size: 0.7rem;">No P2 producible locally</div>';

    elements.producibleP3.innerHTML = producibleP3.length > 0
        ? producibleP3.map(p => `<div class="producible-item p3" data-id="${p.id}">${p.name}</div>`).join('')
        : '<div style="color: var(--muted); font-size: 0.7rem;">No P3 producible locally</div>';

    elements.producibleP4.innerHTML = producibleP4.length > 0
        ? producibleP4.map(p => `<div class="producible-item p4" data-id="${p.id}">${p.name}</div>`).join('')
        : '<div style="color: var(--muted); font-size: 0.7rem;">No P4 producible locally</div>';

    document.querySelectorAll('.producible-item').forEach(item => {
        item.addEventListener('click', () => {
            selectProduct(parseInt(item.dataset.id));
        });
    });

    elements.systemResults.classList.remove('hidden');

    // Mirror to main canvas System tab
    AppState.systemData = {
        system,
        planetTypes,
        skyhookTotals,
        counts,
        producibleP2,
        producibleP3,
        producibleP4
    };
    AppState.canvasOffset.y = 0;
    setViewMode('system');
}

// ---------- Finder (location search + ISK maximizer) ----------
let jumpsLoadPromise = null;
function ensureJumpsLoaded() {
    if (AppState.jumpsLoaded) return Promise.resolve(true);
    if (jumpsLoadPromise) return jumpsLoadPromise; // single-flight

    jumpsLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'pi-jumps.js?v=' + (window.PI_ASSET_VERSION || '1');
        script.onload = () => {
            AppState.jumpsLoaded = true;
            resolve(true);
        };
        script.onerror = () => {
            console.error('Failed to load pi-jumps.js');
            jumpsLoadPromise = null;
            resolve(false);
        };
        document.head.appendChild(script);
    });
    return jumpsLoadPromise;
}

function findSystemByName(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    for (const key in PI_SYSTEMS) {
        if (PI_SYSTEMS[key].name.toLowerCase() === lower) return PI_SYSTEMS[key];
    }
    for (const key in PI_SYSTEMS) {
        if (PI_SYSTEMS[key].name.toLowerCase().includes(lower)) return PI_SYSTEMS[key];
    }
    return null;
}

function secBandOf(sec) {
    if (sec === null || sec === undefined) return 'null';
    if (sec >= 0.5) return 'high';
    if (sec > 0) return 'low';
    return 'null';
}

function activeSecBands() {
    const bands = new Set();
    elements.finderSecFilter.querySelectorAll('.sec-chip.active').forEach(chip => {
        bands.add(chip.dataset.sec);
    });
    if (bands.size === 0) return new Set(['high', 'low', 'null']);
    return bands;
}

function getFinderRadius() {
    const n = parseInt(elements.finderJumps.value, 10);
    if (!Number.isFinite(n)) return 10;
    return Math.min(50, Math.max(1, n));
}

// How many nearby systems may share production: 1 = whole chain in one system,
// higher allows splitting planets across up to N systems within radius.
function getFinderMaxSystems() {
    const n = parseInt(elements.finderMaxSystems && elements.finderMaxSystems.value, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.min(6, Math.max(1, n));
}

// BFS over the stargate graph from originId up to maxJumps.
// Returns Map(systemId -> {jumps, parent}) - parents allow route reconstruction.
function finderBFS(originId, maxJumps) {
    const dist = new Map([[originId, { jumps: 0, parent: null }]]);
    let frontier = [originId];
    let depth = 0;
    while (frontier.length && depth < maxJumps) {
        const next = [];
        for (const sysId of frontier) {
            const neighbors = (typeof PI_JUMPS !== 'undefined' && PI_JUMPS[sysId]) || [];
            for (const nb of neighbors) {
                if (dist.has(nb)) continue;
                dist.set(nb, { jumps: depth + 1, parent: sysId });
                next.push(nb);
            }
        }
        frontier = next;
        depth++;
    }
    return dist;
}

function finderRoutePath(destId, bfsMap) {
    const path = [];
    let cur = destId;
    // Safety bound: a valid chain can never exceed the number of visited nodes
    const maxSteps = (bfsMap ? bfsMap.size : 0) + 1;
    while (cur !== null && path.length <= maxSteps) {
        path.push(cur);
        const node = bfsMap ? bfsMap.get(cur) : null;
        cur = node ? node.parent : null;
    }
    return path.reverse();
}

function setFinderOrigin(systemId, source) {
    const sys = PI_SYSTEMS[systemId];
    AppState.finder.originSystemId = systemId;
    AppState.finder.originSource = source;
    AppState.finder.expandedSpot = null;
    const prefix = source === 'esi' ? 'Character: ' : 'Origin: ';
    const region = sys ? (PI_DATA.regions[sys.regionId] || '') : '';
    elements.finderOriginLabel.textContent = prefix + (sys ? sys.name : systemId) +
        (region ? ` (${region})` : '');
}

// True when the stored login's JWT carries the location scope. Logins made
// before the scope was added fail ESI calls until the user re-authenticates.
async function finderHasLocationScope() {
    try {
        const token = await piEsiAuth.getAccessToken();
        const payload = piEsiAuth.decodeJWT(token);
        const scp = payload.scp || payload.scope || [];
        const list = Array.isArray(scp) ? scp : String(scp).split(' ');
        return list.indexOf('esi-location.read_location.v1') !== -1;
    } catch (e) {
        return false;
    }
}

function startFinderRelogin() {
    elements.finderOriginLabel.textContent = 'Redirecting to EVE SSO...';
    piEsiAuth.initiateLogin().catch(err => {
        elements.finderOriginLabel.textContent = err.message || 'Login failed';
    });
}

function markFinderAuthNeeded(message) {
    AppState.finder.locationAuthNeeded = true;
    elements.finderLocate.innerHTML = '<i class="fas fa-user-lock"></i> Login to grant location';
    elements.finderOriginLabel.textContent = message;
}

async function finderUseMyLocation() {
    if (!piEsiAuth.isAuthenticated()) {
        AppState.finder.locationAuthNeeded = false;
        startFinderRelogin();
        return;
    }

    const originalHtml = elements.finderLocate.innerHTML;
    elements.finderLocate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating...';

    try {
        if (!(await finderHasLocationScope())) {
            markFinderAuthNeeded('Your EVE login predates location tracking - click again to grant permission');
            return;
        }
        const charId = piEsiAuth.getCurrentCharacter();
        const loc = await piEsiAuth.esiFetch(`/characters/${charId}/location/`);
        await ensureSystemsLoaded();
        if (!PI_SYSTEMS[loc.solar_system_id]) {
            elements.finderOriginLabel.textContent = 'Character is in an unknown system';
            return;
        }
        AppState.finder.locationAuthNeeded = false;
        elements.finderLocate.innerHTML = originalHtml;
        setFinderOrigin(loc.solar_system_id, 'esi');
    } catch (err) {
        if (/ESI Error 40[13]/.test(err.message) || /authorization/i.test(err.message)) {
            markFinderAuthNeeded('Location permission needed - click again to login & grant it');
        } else {
            elements.finderLocate.innerHTML = originalHtml;
            elements.finderOriginLabel.textContent = err.message || 'Location lookup failed';
        }
    }
}

function finderSetManualOrigin() {
    const name = elements.finderSystemInput.value.trim();
    if (!name) return;

    if (!AppState.systemsLoaded) {
        ensureSystemsLoaded().then(ok => {
            if (ok) finderSetManualOrigin();
            else elements.finderOriginLabel.textContent = 'Failed to load system data';
        });
        return;
    }

    const sys = findSystemByName(name);
    if (!sys) {
        elements.finderOriginLabel.textContent = `System "${name}" not found`;
        return;
    }
    setFinderOrigin(sys.id, 'manual');
}

const FINDER_MAX_ROWS = 25;   // canvas cards per spot search (scrollable, but bounded)

// Best plans first: fewer total jumps, then fewer systems, then safer security.
function sortFinderSpotRows(groups) {
    const minSec = g => Math.min(...g.systems.map(s => (s.sys.security == null ? -1 : s.sys.security)));
    groups.sort((a, b) => {
        if (a.totalJumps !== b.totalJumps) return a.totalJumps - b.totalJumps;
        if (a.systems.length !== b.systems.length) return a.systems.length - b.systems.length;
        return minSec(b) - minSec(a);
    });
    return groups;
}

function setFinderStatus(el, message) {
    if (!el) return;
    el.textContent = message || '';
}

async function runFindBestSystems() {
    setFinderStatus(elements.finderSpotResults, '');

    if (!window.piEsiAuth || !piEsiAuth.isAuthenticated()) {
        setFinderStatus(elements.finderSpotResults, 'Sign in with EVE SSO first.');
        return;
    }
    if (!AppState.finder.originSystemId) {
        setFinderStatus(elements.finderSpotResults, 'Set a starting location first.');
        return;
    }
    const productId = parseInt(elements.finderProduct.value, 10);
    if (!productId || !getMaterialById(productId)) {
        setFinderStatus(elements.finderSpotResults, 'Select a product first.');
        return;
    }

    elements.finderSearchSpot.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
    try {
        const ok = await Promise.all([ensureSystemsLoaded(), ensureJumpsLoaded()]);
        if (!ok[0] || !ok[1]) throw new Error('Failed to load system/jump data');

        AppState.finder._bfs = finderBFS(AppState.finder.originSystemId, getFinderRadius());
        AppState.finder.spotRows = buildSpotGroups(productId);
        AppState.finder.activePanel = 'spot';
        AppState.finder.expandedSpot = null;
        AppState.finder.bestProductId = productId;
        AppState.finder.bestStats = null;
        AppState.finder.spotProductName = getMaterialById(productId).name;
        renderFinderSpotResults();
    } catch (err) {
        console.error('Find best systems failed:', err);
        setFinderStatus(elements.finderSpotResults, err.message);
    } finally {
        elements.finderSearchSpot.innerHTML = '<i class="fas fa-search-location"></i> Find Best Systems';
    }
}

// Sidebar keeps only a status line; the ranked plans live on the main canvas.
function renderFinderSpotResults() {
    const rows = AppState.finder.spotRows;
    if (!rows.length) {
        setFinderStatus(elements.finderSpotResults,
            'No plan within radius covers every planet type needed. Widen the radius, max systems or sec filter.');
        resetViewport();
        setViewMode('finder');
        return;
    }
    const multi = rows.filter(r => r.systems.length > 1).length;
    setFinderStatus(elements.finderSpotResults,
        `${rows.length} plan${rows.length === 1 ? '' : 's'} can build ${AppState.finder.spotProductName} in full` +
        (multi ? ` (${multi} split across systems)` : '') +
        ' - shown on the main canvas');
    resetViewport();
    setViewMode('finder');
}

// Jita (The Forge) is the standard pricing reference for ranking; the
// selected region is priced alongside for comparison.
const FINDER_STANDARD_REGION = '10000002';

async function runProfitScan() {
    setFinderStatus(elements.finderProfitResults, '');
    elements.finderProgress.classList.add('hidden');

    if (!window.piEsiAuth || !piEsiAuth.isAuthenticated()) {
        setFinderStatus(elements.finderProfitResults, 'Sign in with EVE SSO first.');
        return;
    }
    if (!AppState.finder.originSystemId) {
        setFinderStatus(elements.finderProfitResults, 'Set a starting location first.');
        return;
    }

    const regionId = elements.regionSelect.value;
    const regionName = PI_DATA.regions[regionId] || ('Region ' + regionId);
    const jitaName = PI_DATA.regions[FINDER_STANDARD_REGION] || 'Jita';
    elements.finderScanRegion.textContent = ' · ranked by ' + jitaName;

    elements.finderScanProfit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    try {
        const ok = await Promise.all([ensureSystemsLoaded(), ensureJumpsLoaded()]);
        if (!ok[0] || !ok[1]) throw new Error('Failed to load system/jump data');

        const radius = getFinderRadius();
        const bfs = finderBFS(AppState.finder.originSystemId, radius);
        AppState.finder._bfs = bfs; // buildSpotGroups must use THIS origin, not a stale one
        const allowedBands = activeSecBands();

        const availableP0 = new Set();
        let systemsScanned = 0;
        for (const [sysIdStr] of bfs) {
            const sys = PI_SYSTEMS[sysIdStr];
            if (!sys) continue;
            if (!allowedBands.has(secBandOf(sys.security))) continue;
            systemsScanned++;
            sys.planets.forEach(p => {
                const pt = getPlanetTypeData(p.typeId);
                if (pt) pt.p0Materials.forEach(id => availableP0.add(id));
            });
        }

        const prod = computeProducible(availableP0);
        const candidateIds = [...prod.p1, ...prod.p2, ...prod.p3, ...prod.p4];

        if (!candidateIds.length || !systemsScanned) {
            setFinderStatus(elements.finderProfitResults,
                `Nothing producible within ${radius} jumps${systemsScanned ? '' : ' with the current sec filter'}. Widen the search.`);
            return;
        }

        // Gather every material id needed across all candidate chains
        const chains = new Map();
        const materialIds = new Set();
        candidateIds.forEach(id => {
            const chain = getChainForProduct(id);
            if (!chain) return;
            chains.set(id, chain);
            collectMaterialIds(chain, materialIds);
        });

        // Price against both markets (each cached per region by type id)
        elements.finderProgress.classList.remove('hidden');
        const total = materialIds.size * 2;
        let done = 0;
        const tick = () => {
            done++;
            elements.finderProgress.innerHTML =
                `<i class="fas fa-spinner fa-spin"></i> Fetching prices (${jitaName} + ${regionName})… ${done}/${total}`;
        };
        const jitaPrices = await fetchPricesForMaterials(materialIds, FINDER_STANDARD_REGION, tick);
        const localPrices = await fetchPricesForMaterials(materialIds, regionId, tick);
        elements.finderProgress.classList.add('hidden');

        const results = [];
        chains.forEach((chain, id) => {
            const j = chainProfitMath(chain, jitaPrices);
            const l = chainProfitMath(chain, localPrices);
            if (!(j.outputValue > 0)) return; // no sell data for the output
            results.push({
                id,
                mat: getMaterialById(id),
                profit: j.profit,
                margin: j.margin,
                profitLocal: l.profit,
                marginLocal: l.margin
            });
        });
        // Standard ranking: Jita profit per batch
        results.sort((a, b) => b.profit - a.profit);

        AppState.finder.scanResults = results;
        AppState.finder.localRegionName = regionName;

        // Merged flow: feature the highest-Jita-profit product whose planets
        // fit within the allowed number of systems in radius.
        let best = null;
        let rows = [];
        for (const r of results) {
            const candidate = buildSpotGroups(r.id);
            if (candidate.length) { best = r; rows = candidate; break; }
        }
        if (!best) {
            setFinderStatus(elements.finderProfitResults,
                `No product in the scan can be built within ${getFinderMaxSystems()} system(s) inside ${radius} jumps - widen the radius or max systems.`);
            draw();
            return;
        }

        AppState.finder.bestProductId = best.id;
        AppState.finder.bestStats = { profit: best.profit, margin: best.margin, profitLocal: best.profitLocal, marginLocal: best.marginLocal };
        AppState.finder.spotRows = rows;
        AppState.finder.activePanel = 'spot';
        AppState.finder.expandedSpot = null;
        AppState.finder.spotProductName = best.mat.name;

        const skipped = best.id !== results[0].id
            ? ` • ${results[0].mat.name} ranks highest but needs more than ${getFinderMaxSystems()} system(s) - showing the next best buildable`
            : '';
        setFinderStatus(elements.finderProfitResults,
            `Best sell: ${best.mat.name} (${formatISK(best.profit)} ISK/batch on ${jitaName}) - ${rows.length} plan${rows.length === 1 ? '' : 's'} cover it fully, shown on the main canvas${skipped}`);
        resetViewport();
        setViewMode('finder');
    } catch (err) {
        console.error('Profit scan failed:', err);
        elements.finderProgress.classList.add('hidden');
        setFinderStatus(elements.finderProfitResults, err.message);
    } finally {
        elements.finderScanProfit.innerHTML = '<i class="fas fa-chart-line"></i> Scan Market';
    }
}

// ---------- Finder Canvas View ----------
// Cards are stored in screen coordinates (finder is a flat, non-zooming list).
function finderCardAt(pos) {
    return (AppState.finderCards || []).find(c =>
        pos.x >= c.x && pos.x <= c.x + c.w && pos.y >= c.y && pos.y <= c.y + c.h) || null;
}

const SEC_BAND_COLORS = { high: '#2d7d46', low: '#a16207', null: '#b91c1c' };

function drawFinderView() {
    AppState.finderCards = [];
    const f = AppState.finder;

    if (!window.piEsiAuth || !piEsiAuth.isAuthenticated()) {
        drawFinderPrompt('Sign in with EVE SSO',
            'The Finder needs your login to track your character location',
            'and scan nearby markets. Use the Finder tab to sign in.');
        return;
    }
    if (f.activePanel === 'spot' && f.spotRows.length) {
        drawFinderSpotCards();
        return;
    }

    drawFinderPrompt('No finder results yet', null,
        'Set an origin in the Finder tab, pick a Target Product, then press "Find Best Systems" or "Scan Market"');
}

function drawFinderPrompt(title, sub1, sub2) {
    const cx = AppState.cssW / 2;
    const cy = AppState.cssH / 2;
    ctx.fillStyle = 'rgba(20, 20, 20, 0.75)';
    roundRect(ctx, cx - 250, cy - 60, 500, 120, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#e8d900';
    ctx.font = 'bold 16px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, cx, cy - (sub1 ? 18 : 24));
    ctx.fillStyle = '#aaa';
    ctx.font = '13px Titillium Web, sans-serif';
    if (sub1) ctx.fillText(sub1, cx, cy + 8);
    ctx.fillText(sub2, cx, cy + (sub1 ? 28 : 4));
}

// ---------- Finder DOM View (mock layout, RustyBot style) ----------
function renderFinderDom() {
    const f = AppState.finder;
    const dom = elements.finderDom || document.getElementById('finderDom');
    if (!dom) return;
    const heroEl = elements.finderHero || document.getElementById('finderHero');
    const metricEl = elements.finderMetric || document.getElementById('finderMetric');
    const subEl = elements.finderSub || document.getElementById('finderSub');
    const gridEl = elements.finderGrid || document.getElementById('finderGrid');
    const emptyEl = elements.finderEmpty || document.getElementById('finderEmpty');
    const moreEl = elements.finderMore || document.getElementById('finderMore');
    if (!gridEl || !heroEl || !metricEl || !subEl) return;

    const kickerEl = elements.finderKicker || document.getElementById('finderKicker');
    const authed = window.piEsiAuth && piEsiAuth.isAuthenticated();
    if (!authed) {
        if (kickerEl) { kickerEl.textContent = 'Top Profit Report'; kickerEl.style.color = ''; }
        heroEl.innerHTML = '<div style="color:var(--muted);font-size:0.78rem;padding:10px">Sign in with EVE SSO to use Finder</div>';
        metricEl.innerHTML = '';
        subEl.textContent = 'Use the Finder tab to sign in and track your character location.';
        gridEl.innerHTML = '';
        if (emptyEl) emptyEl.textContent = '';
        if (moreEl) moreEl.textContent = '';
        return;
    }

    const hasResults = f.activePanel === 'spot' && f.spotRows && f.spotRows.length;
    if (!hasResults) {
        // Product was searched but no system covers the required planet types
        const attemptedProduct = f.spotProductName && f.activePanel === 'spot' ? f.spotProductName : null;
        if (attemptedProduct) {
            if (kickerEl) kickerEl.textContent = attemptedProduct + ' — not available';
            if (kickerEl) kickerEl.style.color = '#f87171';
            const mat = f.bestProductId ? getMaterialById(f.bestProductId) : null;
            if (mat) {
                const tierColor = PI_COLORS[mat.tier] || '#d29922';
                heroEl.innerHTML = '<div class="finder-hero-card" id="finderHeroCard" title="Click to view chain">' +
                    '<span class="finder-hero-badge" style="background:' + tierColor + '">P' + mat.tier + '</span>' +
                    '<span class="finder-hero-text"><b>' + escapeHtml(mat.name) + '</b><span>best places to build &bull; click to view chain</span></span>' +
                    '</div>';
                const hc2 = document.getElementById('finderHeroCard');
                if (hc2) hc2.onclick = () => navigateToProduct(mat.id);
            } else {
                heroEl.innerHTML = '<div style="color:var(--text);font-weight:700;padding:10px">' + escapeHtml(attemptedProduct) + '</div>';
            }
            metricEl.innerHTML = '';
            const originSys2 = (AppState.systemsLoaded && typeof PI_SYSTEMS !== 'undefined' && f.originSystemId) ? PI_SYSTEMS[f.originSystemId] : null;
            const originName2 = originSys2 ? originSys2.name : 'origin';
            subEl.textContent = 'No suitable systems found for ' + attemptedProduct + ' within ' + getFinderRadius() + 'j of ' + originName2 + ' — widen the radius, max systems or sec filter.';
            // Hide next best when no main results
            const nbWrapEmpty = elements.finderNextBest || document.getElementById('finderNextBest');
            if (nbWrapEmpty) nbWrapEmpty.classList.add('hidden');
        } else {
            if (kickerEl) { kickerEl.textContent = 'Top Profit Report'; kickerEl.style.color = ''; }
            heroEl.innerHTML = '<div style="color:var(--muted);font-size:0.78rem;padding:10px">No finder results yet</div>';
            metricEl.innerHTML = '';
            subEl.textContent = 'Set an origin in the Finder tab, pick a product, then press \u201cFind Best Systems\u201d or \u201cScan Market\u201d.';
        }
        gridEl.innerHTML = '';
        if (emptyEl) emptyEl.textContent = '';
        if (moreEl) moreEl.textContent = '';
        return;
    }

    if (kickerEl) { kickerEl.textContent = 'Top Profit Report'; kickerEl.style.color = ''; }
    const chainMat = getMaterialById(f.bestProductId);
    const tierColor = chainMat ? (PI_COLORS[chainMat.tier] || '#d29922') : '#d29922';
    const name = chainMat ? chainMat.name : (f.spotProductName || 'Product');
    const tier = chainMat ? chainMat.tier : '';
    heroEl.innerHTML = '<div class="finder-hero-card" id="finderHeroCard" title="Click to view chain">' +
        '<span class="finder-hero-badge" style="background:' + tierColor + '">' + (tier !== '' ? 'P' + tier : 'P?') + '</span>' +
        '<span class="finder-hero-text"><b>' + escapeHtml(name) + '</b><span>best places to build &bull; click to view chain</span></span>' +
        '</div>';
    const hc = document.getElementById('finderHeroCard');
    if (hc) hc.onclick = () => { if (chainMat) navigateToProduct(chainMat.id); };

    if (f.bestStats) {
        metricEl.innerHTML = '<span class="finder-metric-pill"><strong>Profit: ' + formatISK(f.bestStats.profit) + ' ISK/batch (' + f.bestStats.margin.toFixed(1) + '% margin)</strong></span>';
    } else {
        metricEl.innerHTML = '';
    }

    const originSys = (AppState.systemsLoaded && typeof PI_SYSTEMS !== 'undefined' && f.originSystemId) ? PI_SYSTEMS[f.originSystemId] : null;
    const originName = originSys ? originSys.name : 'origin';
    const rowsAll = f.spotRows.slice(0, FINDER_MAX_ROWS);
    subEl.textContent = rowsAll.length + ' system' + (rowsAll.length === 1 ? '' : 's') + ' within ' + getFinderRadius() + 'j of ' + originName + ' \u2022 covering every planet type \u2022 click cards for details';

    const rows = rowsAll;
    gridEl.className = 'finder-grid grid';

    if (!rows.length) {
        gridEl.innerHTML = '';
        if (emptyEl) emptyEl.textContent = '';
        if (moreEl) moreEl.textContent = '';
    } else {
        if (emptyEl) emptyEl.textContent = '';
        let htmlAccum = '';
        const cardsMeta = [];
        rows.forEach(group => {
            const single = group.systems.length === 1;
            const key = groupKey(group);
            const expanded = f.expandedSpot === key;
            const sysLabel = single ? group.systems[0].sys.name : 'Split \u2022 ' + group.systems.length + ' systems';
            const primaryEntry = group.systems[0];
            const chipsHtml = (primaryEntry.covers || []).map(tid => {
                const pt = getPlanetTypeData(tid);
                if (!pt) return '';
                return '<span class="finder-chip" style="background:' + pt.color + '" title="' + escapeHtml(pt.name) + '">' + escapeHtml(pt.name) + '</span>';
            }).join('');
            const extraChips = group.systems.length > 1 ? ' <span style="font-size:0.62rem;color:var(--muted)">+' + (group.systems.length - 1) + ' system' + (group.systems.length > 2 ? 's' : '') + '</span>' : '';
            let cardHtml = '<div class="finder-card' + (single ? ' single' : '') + '" data-key="' + escapeHtml(key) + '"><div class="finder-card-top"><span class="finder-card-title">' + escapeHtml(sysLabel) + '</span><span class="finder-card-badge">' + (single ? 'Full Chain' : 'Full Coverage') + '</span></div>' +
                '<div class="finder-card-bottom"><span class="finder-card-chips">' + chipsHtml + extraChips + '</span><span class="finder-jumps">' + group.totalJumps + 'j</span></div>';
            if (expanded) {
                const lines = [];
                group.systems.forEach(entry => {
                    const rl = finderRouteLines(entry.route, 600, single ? null : entry.sys.name);
                    lines.push(...rl);
                });
                const hasWarn = lines.some(l => l.includes('sec)'));
                cardHtml += '<div class="finder-card-route' + (hasWarn ? ' warn' : '') + '">' + escapeHtml(lines.join('  ')) + '</div>';
            }
            cardHtml += '</div>';
            htmlAccum += cardHtml;
            cardsMeta.push({ key, sysName: primaryEntry.sys.name });
        });
        gridEl.innerHTML = htmlAccum;
        try {
            const cards = gridEl.querySelectorAll ? gridEl.querySelectorAll('.finder-card') : [];
            cards.forEach((el, i) => {
                const meta = cardsMeta[i];
                if (!meta) return;
                el.addEventListener('click', () => {
                    f.expandedSpot = (f.expandedSpot === meta.key) ? null : meta.key;
                    renderFinderDom();
                });
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const url = 'https://evemaps.dotlan.net/system/' + encodeURIComponent(meta.sysName);
                    if (typeof window.open === 'function') window.open(url, '_blank');
                });
            });
        } catch (e) { /* stub DOM in tests */ }
        if (moreEl) {
            const remaining = f.spotRows.length - rowsAll.length;
            moreEl.textContent = remaining > 0 ? '...and ' + remaining + ' more plans within radius \u2014 narrow the radius or filters' : '';
        }
    }

    // Next Best — ranked by Jita profit, buildable within current radius/filters
    const nbWrap = elements.finderNextBest || document.getElementById('finderNextBest');
    const nbGrid = elements.finderNextBestGrid || document.getElementById('finderNextBestGrid');
    if (nbWrap && nbGrid) {
        const hasOriginNb = !!f.originSystemId;
        const scan = f.scanResults || [];
        let nextBest = scan.filter(r => {
            if (r.id === f.bestProductId) return false;
            if (!getMaterialById(r.id)) return true;
            if (!hasOriginNb) return true;
            const rowsNb = buildSpotGroups(r.id);
            return rowsNb && rowsNb.length > 0;
        }).slice(0, NEXT_BEST_COUNT);
        if (!nextBest.length) {
            nbWrap.classList.add('hidden');
            nbGrid.innerHTML = '';
        } else {
            nbWrap.classList.remove('hidden');
            nbGrid.className = 'finder-grid grid';
            let nbHtml = '';
            nextBest.forEach((r, idx) => {
                const tierColor = PI_COLORS[r.mat.tier] || '#888';
                const rank = idx + 2;
                nbHtml += '<div class="finder-card nextbest" data-nextid="' + r.id + '" title="Click to show where to build">' +
                    '<div class="finder-card-top"><span class="finder-card-title" style="display:flex;align-items:center;gap:6px"><span class="finder-rank">#' + rank + '</span><span class="finder-tier-dot" style="background:' + tierColor + '"></span>' + escapeHtml(r.mat.name) + '</span><span class="finder-card-badge">' + r.margin.toFixed(1) + '% margin</span></div>' +
                    '<div class="finder-card-bottom"><span class="finder-jumps" style="font-size:0.7rem">Jita: ' + escapeHtml(formatISK(r.profit) + ' ISK') + '</span><span class="finder-jumps" style="font-size:0.68rem;color:var(--muted)">' + escapeHtml((f.localRegionName || 'Local') + ': ' + formatISK(r.profitLocal) + ' ISK') + '</span></div>' +
                    '</div>';
            });
            nbGrid.innerHTML = nbHtml;
            try {
                const nbCards = nbGrid.querySelectorAll ? nbGrid.querySelectorAll('.finder-card.nextbest') : [];
                nbCards.forEach(el => {
                    const nid = parseInt(el.getAttribute('data-nextid'), 10);
                    el.addEventListener('click', () => {
                        const rowsNb = buildSpotGroups(nid);
                        if (!rowsNb.length) return;
                        const mat = getMaterialById(nid);
                        f.bestProductId = nid;
                        f.spotProductName = mat ? mat.name : String(nid);
                        f.spotRows = rowsNb;
                        f.expandedSpot = null;
                        f.activePanel = 'spot';
                        const prof = scan.find(s => s.id === nid);
                        if (prof) f.bestStats = { profit: prof.profit, margin: prof.margin, profitLocal: prof.profitLocal, marginLocal: prof.marginLocal };
                        renderFinderDom();
                    });
                });
            } catch (e) {}
        }
    }
}

// Wraps text into lines that fit maxWidth using the current ctx.font.
function wrapCanvasText(text, maxWidth) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width <= maxWidth || !line) {
            line = test;
        } else {
            lines.push(line);
            line = word;
        }
    });
    if (line) lines.push(line);
    return lines;
}

function drawTypeChip(label, color, dim, x, y, maxW) {
    ctx.font = 'bold 10px Titillium Web, sans-serif';
    let w = Math.ceil(ctx.measureText(label).width) + 14;
    if (w > maxW) w = maxW;
    roundRect(ctx, x, y, w, 17, 3);
    ctx.fillStyle = dim ? '#3a3f4a' : color;
    ctx.fill();
    if (!dim) {
        // Same darkening overlay as the CSS .planet-type-badge so white text reads
        roundRect(ctx, x, y, w, 17, 3);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();
    }
    ctx.fillStyle = dim ? '#999' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 9.5);
    return w;
}

// Draws planet-type chips for a list of type ids, wrapped to maxW.
// Returns total height used.
function drawChips(ids, x, y, maxW) {
    const gapX = 6;
    let cx = x;
    let cy = y;
    ids.forEach(tid => {
        const pt = getPlanetTypeData(tid);
        if (!pt) return;
        ctx.font = 'bold 10px Titillium Web, sans-serif';
        const estW = Math.ceil(ctx.measureText(pt.name).width) + 14;
        if (cx > x && cx + Math.min(estW, maxW) > x + maxW) {
            cx = x;
            cy += 22;
        }
        const used = drawTypeChip(pt.name, pt.color, false, cx, cy, maxW - (cx - x));
        cx += used + gapX;
    });
    return (cy - y) + 22;
}

function finderRouteLines(route, maxW, label) {
    const systemsLoaded = AppState.systemsLoaded && typeof PI_SYSTEMS !== 'undefined';
    const names = route.map(id => (systemsLoaded && PI_SYSTEMS[id]) ? PI_SYSTEMS[id].name : String(id));
    const allowed = activeSecBands();
    const crossed = [...new Set(route
        .map(id => (systemsLoaded && PI_SYSTEMS[id]) ? secBandOf(PI_SYSTEMS[id].security) : null))]
        .filter(b => b && !allowed.has(b));
    let text = (label ? label + ':  ' : '') + names.join(' › ');
    if (crossed.length) text += `  (route crosses ${crossed.join(' + ')} sec)`;
    ctx.font = '11px Titillium Web, sans-serif';
    return wrapCanvasText(text, maxW);
}

function groupKey(group) {
    return group.systems.map(s => s.sys.id).join('+');
}

function drawFinderSpotCards() {
    const rows = AppState.finder.spotRows.slice(0, FINDER_MAX_ROWS);
    const offsetY = AppState.canvasOffset.y;
    const originSys = (AppState.systemsLoaded && typeof PI_SYSTEMS !== 'undefined')
        ? PI_SYSTEMS[AppState.finder.originSystemId] : null;

    const chainMat = getMaterialById(AppState.finder.bestProductId);
    // Product card in the middle - clickable to view chain (replaces plain title text)
    if (chainMat) {
        const cardW = 360;
        const cardH = 62;
        const cardX = AppState.cssW / 2 - cardW / 2;
        const cardY = 10;
        const tierColor = PI_COLORS[chainMat.tier] || '#888';
        const isCardHovered = AppState.finderCards.some(c => c.kind === 'hoverChainTitle') ? false : false;
        // Background
        const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
        grad.addColorStop(0, 'rgba(40,40,40,0.98)');
        grad.addColorStop(1, 'rgba(25,25,25,0.98)');
        ctx.fillStyle = grad;
        ctx.strokeStyle = tierColor;
        ctx.lineWidth = 1.4;
        roundRect(ctx, cardX, cardY, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();
        // Tier accent bar
        ctx.fillStyle = tierColor;
        roundRect(ctx, cardX, cardY, 5, cardH, [10, 0, 0, 10]);
        ctx.fill();
        // P-tier badge
        ctx.fillStyle = tierColor;
        roundRect(ctx, cardX + 16, cardY + 14, 28, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#121212';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`P${chainMat.tier}`, cardX + 30, cardY + 23);
        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px Titillium Web, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let displayName = chainMat.name;
        if (displayName.length > 28) displayName = displayName.slice(0, 26) + '…';
        ctx.fillText(displayName, cardX + 52, cardY + 12);
        // Subtitle
        ctx.fillStyle = '#9aa4b2';
        ctx.font = '11px Titillium Web, sans-serif';
        ctx.fillText('best places to build  •  click to view chain  •  VIEW CHAIN', cardX + 52, cardY + 33);
        // Hit area for the card
        AppState.finderCards.push({ kind: 'openChain', productId: chainMat.id, x: cardX, y: cardY, w: cardW, h: cardH });
    } else {
        // Fallback plain title if material not found
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#e8d900';
        ctx.font = 'bold 18px Titillium Web, sans-serif';
        ctx.fillText(`${AppState.finder.spotProductName} - best places to build`, AppState.cssW / 2, 20);
    }

    let headerY = 82;
    const stats = AppState.finder.bestStats;
    if (stats) {
        ctx.font = 'bold 12px Titillium Web, sans-serif';
        ctx.fillStyle = '#3fb950';
        const jitaName = PI_DATA.regions[FINDER_STANDARD_REGION] || 'Jita';
        const statsText = `#1 by ${jitaName} profit: ${formatISK(stats.profit)} ISK/batch (${stats.margin.toFixed(1)}% margin)` +
            ` • local: ${formatISK(stats.profitLocal)} ISK`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(statsText, AppState.cssW / 2, headerY);
        headerY += 20;
    }
    ctx.fillStyle = '#aaa';
    ctx.font = '12px Titillium Web, sans-serif';
    const originName = originSys ? originSys.name : 'origin';
    const multiCount = rows.filter(r => r.systems.length > 1).length;
    let sub = `${rows.length} plan${rows.length === 1 ? '' : 's'} within ${getFinderRadius()}j of ${originName}` +
        ` covering every planet type (max ${getFinderMaxSystems()} system${getFinderMaxSystems() === 1 ? '' : 's'})`;
    if (multiCount) sub += ` • ${multiCount} split across systems`;
    sub += ' • click a card for routes';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(sub, AppState.cssW / 2, headerY);

    const colW = Math.min(620, Math.max(360, AppState.cssW - 80));
    const x = Math.max(20, (AppState.cssW - colW) / 2);
    let y = headerY + 26 - offsetY;
    const gapY = 12;
    const pad = 14;

    rows.forEach(group => {
        const single = group.systems.length === 1;
        const expanded = AppState.finder.expandedSpot === groupKey(group);

        // Pre-measure: per-system blocks (name line + covered-type chips)
        const innerW = colW - pad * 2;
        const blocks = group.systems.map(entry => ({
            entry,
            chipsH: measureChipsHeight(entry.covers, innerW - 16)
        }));
        let h = pad + 24 + 6;
        blocks.forEach(b => { h += 18 + b.chipsH + 6; });
        let routeLineCount = 0;
        if (expanded) {
            group.systems.forEach(entry => {
                routeLineCount += finderRouteLines(entry.route, innerW - 8,
                    single ? null : entry.sys.name).length;
            });
            h += routeLineCount * 15 + 10;
        }

        // Card background + accent bar
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, 'rgba(40, 40, 40, 0.98)');
        gradient.addColorStop(1, 'rgba(25, 25, 25, 0.98)');
        ctx.fillStyle = gradient;
        roundRect(ctx, x, y, colW, h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(63, 185, 80, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = single ? '#3fb950' : '#58a6ff';
        ctx.beginPath();
        roundRect(ctx, x, y, 4, h, [8, 0, 0, 8]);
        ctx.fill();

        // Title row
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px Titillium Web, sans-serif';
        const title = single ? group.systems[0].sys.name
            : `Split across ${group.systems.length} systems`;
        ctx.fillText(title, x + pad + 6, y + pad + 13);

        // FULL CHAIN / FULL COVERAGE chip
        ctx.font = 'bold 10px Titillium Web, sans-serif';
        const chipLabel = single ? 'FULL CHAIN' : 'FULL COVERAGE';
        const chipW = Math.ceil(ctx.measureText(chipLabel).width) + 12;
        const chipX = x + colW - pad - 6 - chipW - 44;
        ctx.fillStyle = 'rgba(63, 185, 80, 0.18)';
        roundRect(ctx, chipX, y + pad + 2, chipW, 15, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(63, 185, 80, 0.5)';
        ctx.stroke();
        ctx.fillStyle = '#3fb950';
        ctx.textAlign = 'center';
        ctx.fillText(chipLabel, chipX + chipW / 2, y + pad + 13);

        ctx.font = 'bold 12px Titillium Web, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#58a6ff';
        ctx.fillText(`${group.totalJumps}j`, x + colW - pad - 6, y + pad + 13);

        // Per-system blocks: name + sec + jumps, then the types it provides
        let cy = y + pad + 30;
        blocks.forEach(b => {
            const e = b.entry;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = single ? '#9aa4b2' : '#e6edf3';
            ctx.font = single ? '11px Titillium Web, sans-serif' : 'bold 13px Titillium Web, sans-serif';
            const sysName = (single ? '' : '• ') + (single ? 'Provides:' : e.sys.name);
            ctx.fillText(sysName, x + pad + 6, cy + 12);
            const nameW = Math.ceil(ctx.measureText(sysName).width);

            if (!single) {
                const band = secBandOf(e.sys.security);
                ctx.font = 'bold 10px Titillium Web, sans-serif';
                const secLabel = formatSecurity(e.sys.security);
                const secW2 = Math.ceil(ctx.measureText(secLabel).width) + 8;
                ctx.fillStyle = SEC_BAND_COLORS[band];
                roundRect(ctx, x + pad + 14 + nameW, cy + 1, secW2, 13, 3);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.fillText(secLabel, x + pad + 14 + nameW + secW2 / 2, cy + 12);
            }

            ctx.textAlign = 'right';
            ctx.fillStyle = single ? '#9aa4b2' : '#888';
            ctx.font = '11px Titillium Web, sans-serif';
            ctx.fillText(`${e.jumps}j`, x + colW - pad - 6, cy + 12);

            ctx.textAlign = 'left';
            drawChips(b.entry.covers, x + pad + 16, cy + 17, innerW - 16);
            cy += 18 + b.chipsH + 6;
        });

        // Expanded: gate routes for every system in the plan
        if (expanded) {
            ctx.font = '11px Titillium Web, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            let li = 0;
            group.systems.forEach(entry => {
                const lines = finderRouteLines(entry.route, innerW - 8,
                    single ? null : entry.sys.name);
                lines.forEach(line => {
                    const isWarn = line.includes('sec)');
                    ctx.fillStyle = isWarn ? '#f59e0b' : '#9aa4b2';
                    ctx.fillText(line, x + pad + 6, cy + 4 + li * 15);
                    li++;
                });
            });
        }

        AppState.finderCards.push({ kind: 'spot', row: group, x, y, w: colW, h });
        y += h + gapY;
    });

    if (AppState.finder.spotRows.length > rows.length) {
        ctx.fillStyle = '#888';
        ctx.font = '12px Titillium Web, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`...and ${AppState.finder.spotRows.length - rows.length} more plans within radius - narrow the radius or filters`, x, y + 2);
        y += 24;
    }

    drawNextBestCards(x, colW, y + 14);
}

const NEXT_BEST_COUNT = 8;

// Compact ranked list under the build spots: every other product from the
// market scan. Only products buildable within the current jump radius / max
// systems / sec filter are shown. Clicking one replaces the main spot view
// with the systems where it can be built.
function drawNextBestCards(x, colW, yStart) {
    const hasOrigin = !!AppState.finder.originSystemId;
    const available = (AppState.finder.scanResults || []).filter(r => {
        if (r.id === AppState.finder.bestProductId) return false;
        if (!hasOrigin) return true; // headless tests use synthetic products
        if (!getMaterialById(r.id)) return true; // synthetic test ids have no planet data
        const rows = buildSpotGroups(r.id);
        return rows && rows.length > 0;
    });
    const results = available.slice(0, NEXT_BEST_COUNT);
    if (!results.length) return;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#58a6ff';
    ctx.font = 'bold 13px Titillium Web, sans-serif';
    const jitaName = PI_DATA.regions[FINDER_STANDARD_REGION] || 'Jita';
    ctx.fillText(`NEXT BEST TO SELL - ranked by ${jitaName} • click to see where to build it`, x, yStart);

    let y = yStart + 12;
    const cardH = 46;
    const gapY = 8;
    const listW = colW;

    results.forEach((r, idx) => {
        const tierColor = PI_COLORS[r.mat.tier] || '#888';
        const gradient = ctx.createLinearGradient(x, y, x, y + cardH);
        gradient.addColorStop(0, 'rgba(40, 40, 40, 0.98)');
        gradient.addColorStop(1, 'rgba(25, 25, 25, 0.98)');
        ctx.fillStyle = gradient;
        roundRect(ctx, x, y, listW, cardH, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = tierColor;
        ctx.beginPath();
        roundRect(ctx, x, y, 4, cardH, [8, 0, 0, 8]);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#666';
        ctx.font = 'bold 12px Titillium Web, sans-serif';
        const rankText = `#${idx + 2}`;
        ctx.fillText(rankText, x + 16, y + cardH / 2);
        const rankW = Math.ceil(ctx.measureText(rankText).width);

        ctx.fillStyle = tierColor;
        roundRect(ctx, x + 22 + rankW, y + cardH / 2 - 4, 9, 9, 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Titillium Web, sans-serif';
        ctx.fillText(r.mat.name, x + 38 + rankW, y + cardH / 2 - 7);
        ctx.fillStyle = '#888';
        ctx.font = '10px Titillium Web, sans-serif';
        ctx.fillText(`${r.margin.toFixed(1)}% margin`, x + 38 + rankW, y + cardH / 2 + 9);

        // Right side: Jita (standard) over local region
        ctx.textAlign = 'right';
        ctx.font = 'bold 12px Titillium Web, sans-serif';
        ctx.fillStyle = r.profit >= 0 ? '#3fb950' : '#f87171';
        ctx.fillText(`${formatISK(r.profit)} ISK`, x + listW - 14, y + cardH / 2 - 7);
        ctx.font = '10px Titillium Web, sans-serif';
        ctx.fillStyle = '#9aa4b2';
        ctx.fillText(`${AppState.finder.localRegionName || 'Local'}: ${formatISK(r.profitLocal)} ISK`, x + listW - 14, y + cardH / 2 + 9);

        AppState.finderCards.push({ kind: 'nextProduct', result: r, x, y, w: listW, h: cardH });
        y += cardH + gapY;
    });
}

// Height-only pass over the chip layout so cards can be sized before drawing.
function measureChipsHeight(ids, maxW) {
    const gapX = 6;
    let cx = 0;
    let cy = 0;
    ids.forEach(tid => {
        const pt = getPlanetTypeData(tid);
        if (!pt) return;
        ctx.font = 'bold 10px Titillium Web, sans-serif';
        const w = Math.min(Math.ceil(ctx.measureText(pt.name).width) + 14, maxW);
        if (cx > 0 && cx + w > maxW) {
            cx = 0;
            cy += 22;
        }
        cx += w + gapX;
    });
    return cy + 17;
}


// The Finder (and its canvas results) require an SSO login: the ship location
// comes from ESI and market scans are tied to the character session.
function refreshFinderAuthState() {
    if (!elements.finderControls) return;
    const authed = window.piEsiAuth && piEsiAuth.isAuthenticated();
    elements.finderControls.classList.toggle('hidden', !authed);
    updateSsoUI();
}

// Build "plans" for a product: every way to cover ALL required planet types
// within the radius using at most getFinderMaxSystems() systems.
// Returns groups sorted best-first:
//   { systems: [{sys, jumps, route, covers}], requiredIds, totalJumps }
function buildSpotGroups(productId) {
    if (!AppState.finder.originSystemId) return [];
    let bfs = AppState.finder._bfs;
    if (!bfs) {
        bfs = finderBFS(AppState.finder.originSystemId, getFinderRadius());
        AppState.finder._bfs = bfs;
    }
    const requiredIds = getRequiredPlanetTypes(productId).map(p => p.id);
    const allowedBands = activeSecBands();

    const candidates = [];
    for (const [sysIdStr, node] of bfs) {
        const sys = PI_SYSTEMS[sysIdStr];
        if (!sys) continue;
        if (!allowedBands.has(secBandOf(sys.security))) continue;
        const present = new Set(sys.planets.map(p => p.typeId));
        const covers = requiredIds.filter(tid => present.has(tid));
        if (!covers.length) continue;
        candidates.push({
            sys,
            jumps: node.jumps,
            route: finderRoutePath(Number(sysIdStr), bfs),
            covers
        });
    }

    // Single-system plans first - strictly better than splitting production.
    const groups = candidates
        .filter(c => c.covers.length === requiredIds.length)
        .map(c => ({ systems: [c], requiredIds, totalJumps: c.jumps }));
    if (groups.length) return sortFinderSpotRows(groups);

    // No single system works: greedy set-cover combos up to maxSystems.
    // Try each candidate as the anchor so a heavy-overlap top system can't
    // mask valid splits; keep the best few by total jump distance.
    const maxSys = Math.min(getFinderMaxSystems(), requiredIds.length);
    if (maxSys < 2) return [];
    const seen = new Set();
    const solutions = [];
    for (const anchor of candidates) {
        const chosen = [anchor];
        const need = new Set(requiredIds.filter(t => !anchor.covers.includes(t)));
        while (chosen.length < maxSys && need.size) {
            let pick = null;
            let pickGain = 0;
            for (const c of candidates) {
                if (chosen.includes(c)) continue;
                const gain = c.covers.filter(t => need.has(t)).length;
                if (gain && (!pick || gain > pickGain ||
                    (gain === pickGain && c.jumps < pick.jumps))) {
                    pick = c;
                    pickGain = gain;
                }
            }
            if (!pick) break;
            chosen.push(pick);
            pick.covers.forEach(t => need.delete(t));
        }
        if (need.size) continue;
        const key = chosen.map(c => c.sys.id).sort((a, b) => a - b).join('+');
        if (seen.has(key)) continue;
        seen.add(key);
        solutions.push({
            systems: [...chosen].sort((a, b) => a.jumps - b.jumps),
            requiredIds,
            totalJumps: chosen.reduce((n, c) => n + c.jumps, 0)
        });
    }
    solutions.sort((a, b) => a.totalJumps - b.totalJumps);
    return solutions.slice(0, 10);
}

function setupFinder() {
    if (!elements.finderLocate) return;

    refreshFinderAuthState();

    if (elements.finderLoginBtn) {
        elements.finderLoginBtn.addEventListener('click', () => {
            piEsiAuth.initiateLogin().catch(err => {
                setFinderStatus(elements.finderSpotResults, err.message || 'Login failed');
            });
        });
    }

    if (elements.finderLogout) {
        elements.finderLogout.addEventListener('click', () => {
            piEsiAuth.logout();
            AppState.finder.locationAuthNeeded = false;
            AppState.finder.originSystemId = null;
            AppState.finder.originSource = null;
            elements.finderLocate.innerHTML = '<i class="fas fa-satellite-dish"></i> Character location';
            setFinderStatus(elements.finderSpotResults, '');
            setFinderStatus(elements.finderProfitResults, '');
            refreshFinderAuthState();
            refreshColoniesAuthState();
            if (AppState.viewMode === 'finder') draw(); // prompt flips to signed-out card
        });
    }

    elements.finderLocate.addEventListener('click', () => {
        // After a scope/auth failure the button doubles as the re-login trigger
        if (AppState.finder.locationAuthNeeded) {
            startFinderRelogin();
            return;
        }
        finderUseMyLocation();
    });
    elements.finderSetSystem.addEventListener('click', finderSetManualOrigin);
    elements.finderSystemInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finderSetManualOrigin();
    });
    elements.finderSearchSpot.addEventListener('click', runFindBestSystems);
    elements.finderScanProfit.addEventListener('click', runProfitScan);

    elements.finderSecFilter.addEventListener('click', (e) => {
        const chip = e.target.closest('.sec-chip');
        if (!chip) return;
        chip.classList.toggle('active');
        if (!elements.finderSecFilter.querySelector('.sec-chip.active')) {
            elements.finderSecFilter.querySelectorAll('.sec-chip').forEach(c => c.classList.add('active'));
        }
    });

}

// ---------- Utility ----------
function roundRect(ctx, x, y, width, height, radius) {
    if (Array.isArray(radius)) {
        const [tl, tr, br, bl] = radius;
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + width - tr, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + tr);
        ctx.lineTo(x + width, y + height - br);
        ctx.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
        ctx.lineTo(x + bl, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - bl);
        ctx.lineTo(x, y + tl);
        ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
    } else {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}

function formatISK(value) {
    if (value >= 1000000000) {
        return (value / 1000000000).toFixed(2) + 'B';
    } else if (value >= 1000000) {
        return (value / 1000000).toFixed(2) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(2) + 'K';
    }
    return (value || 0).toFixed(2);
}

// Rendering is on-demand: every state change calls draw() explicitly. The old
// requestAnimationFrame loop redrew the full canvas ~60x/second even when idle.

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
