// PI Chain Visualizer - Main Application
// SDE-driven: data loaded from pi-data.js (core) + pi-systems.js (lazy, system checker)

console.log('PI Visualizer loading...');

const ESI_BASE = 'https://esi.evetech.net/latest';
const DEFAULT_REGION = '10000002'; // Jita/The Forge

// Application State
const AppState = {
    canvasOffset: { x: 0, y: 0 },
    zoom: 1,
    viewMode: 'reference', // 'reference', 'chain', 'planets', 'colonies'
    marketPrices: {},
    targetProduct: null,
    isDraggingCanvas: false,
    lastMousePos: { x: 0, y: 0 },
    chainLayout: null,
    currentTab: 'system',
    hoveredCard: null,
    systemsLoaded: false,
    colonies: null,
    coloniesLoading: false,
    colonyDetail: null,
    colonyCards: []
};

const PI_COLORS = ['#6e7681', '#58a6ff', '#d29922', '#a371f7', '#3fb950'];

// Canvas setup
const canvas = document.getElementById('piCanvas');
const ctx = canvas.getContext('2d');

// DOM Elements
const elements = {
    regionSelect: document.getElementById('regionSelect'),
    targetProduct: document.getElementById('targetProduct'),
    calculateChain: document.getElementById('calculateChain'),
    viewReference: document.getElementById('viewReference'),
    viewChain: document.getElementById('viewChain'),
    viewPlanets: document.getElementById('viewPlanets'),
    viewColonies: document.getElementById('viewColonies'),
    backToRef: document.getElementById('backToRef'),
    zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'),
    zoomLevel: document.getElementById('zoomLevel'),
    fitView: document.getElementById('fitView'),
    marketLoading: document.getElementById('marketLoading'),
    marketContent: document.getElementById('marketContent'),
    outputValue: document.getElementById('outputValue'),
    inputCost: document.getElementById('inputCost'),
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
    coloniesContent: document.getElementById('coloniesContent'),
    coloniesHeader: document.getElementById('coloniesHeader'),
    coloniesList: document.getElementById('coloniesList'),
    coloniesLogin: document.getElementById('coloniesLogin'),
    coloniesRefresh: document.getElementById('coloniesRefresh'),
    coloniesLogout: document.getElementById('coloniesLogout')
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

// ---------- Initialize ----------
function init() {
    console.log('init() called');
    populateProductDropdowns();
    setupCanvas();
    setupEventListeners();
    setupTabs();
    setupReferenceGrids();
    setupSystemChecker();
    setupColonies();
    refreshColoniesAuthState();
    animate();
    setViewMode('reference');
    console.log('Init complete');
}

function populateProductDropdowns() {
    const groups = [
        { label: 'P4 Products', tier: 4 },
        { label: 'P3 Products', tier: 3 },
        { label: 'P2 Products', tier: 2 },
        { label: 'P1 Materials', tier: 1 }
    ];
    const select = elements.targetProduct;
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

function setupCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    draw();
}

function setupEventListeners() {
    // Canvas interactions
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Controls
    elements.calculateChain.addEventListener('click', () => runCalculate(elements.targetProduct.value));

    elements.viewReference.addEventListener('click', () => setViewMode('reference'));
    elements.viewChain.addEventListener('click', () => setViewMode('chain'));
    elements.viewPlanets.addEventListener('click', () => setViewMode('planets'));
    elements.viewColonies.addEventListener('click', () => {
        setViewMode('colonies');
        if (AppState.coloniesLoading || AppState.colonies) {
            draw();
        } else {
            refreshColoniesAuthState();
        }
    });
    elements.backToRef.addEventListener('click', () => setViewMode('reference'));

    elements.zoomIn.addEventListener('click', () => setZoom(AppState.zoom * 1.2));
    elements.zoomOut.addEventListener('click', () => setZoom(AppState.zoom * 0.8));
    elements.fitView.addEventListener('click', fitView);

    elements.regionSelect.addEventListener('change', () => {
        if (AppState.targetProduct) {
            fetchMarketData();
        }
    });

    // Reference sidebar item clicks
    document.querySelectorAll('.ref-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            selectProduct(id);
        });
    });
}

function runCalculate(productIdValue) {
    if (!productIdValue) {
        alert('Please select a target product first');
        return;
    }
    elements.targetProduct.value = productIdValue;
    calculateChain();
}

// Tab Management
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const tab = btn.dataset.tab;

            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const targetPanel = document.getElementById(`tab-${tab}`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            AppState.currentTab = tab;

            if (tab === 'colonies') {
                refreshColoniesAuthState();
            }
        });
    });
}

// ---------- Chain Calculation ----------
function calculateChain() {
    const productId = parseInt(elements.targetProduct.value);
    if (!productId) return;

    AppState.targetProduct = productId;

    generateChainLayout();
    fetchMarketData();
    setViewMode('chain');
}

function selectProduct(id) {
    elements.targetProduct.value = id;
    AppState.targetProduct = id;
    generateChainLayout();
    fetchMarketData();
    setViewMode('chain');
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
    const visited = new Set();

    const addNode = (nodeData, depth, parentId = null) => {
        if (visited.has(nodeData.id)) return;
        visited.add(nodeData.id);

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
        if (parentId) {
            layout.links.push({ from: node.id, to: parentId });
        }

        if (nodeData.inputs) {
            nodeData.inputs.forEach(input => {
                addNode(nodeFor(input), depth + 1, node.id);
            });
        }
    };

    addNode(chain.target, 0);
    AppState.chainLayout = layout;
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

    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;

    setZoom(Math.min(scaleX, scaleY, 1.5));

    AppState.canvasOffset.x = -minX * AppState.zoom + padding * AppState.zoom + (canvas.width - width * AppState.zoom) / 2;
    AppState.canvasOffset.y = -minY * AppState.zoom + padding * AppState.zoom + (canvas.height - height * AppState.zoom) / 2;

    draw();
}

// ---------- Market Data (ESI with light local caching) ----------
const MARKET_CACHE_KEY = 'pi_market_cache_v1';
const MARKET_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCachedPrices(regionId) {
    try {
        const raw = localStorage.getItem(MARKET_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (cache.region !== regionId) return null;
        if (Date.now() - cache.timestamp > MARKET_CACHE_TTL) return null;
        return cache.prices;
    } catch (e) {
        return null;
    }
}

function setCachedPrices(regionId, prices) {
    try {
        localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({
            region: regionId,
            timestamp: Date.now(),
            prices
        }));
    } catch (e) {
        // Storage may be full or unavailable - ignore
    }
}

async function fetchMarketData() {
    if (!AppState.targetProduct) return;

    elements.marketLoading.classList.remove('hidden');
    elements.marketContent.classList.add('hidden');

    const regionId = elements.regionSelect.value;
    const productId = AppState.targetProduct;

    const chain = getChainForProduct(productId);
    const materialIds = collectMaterialIds(chain);

    try {
        // Try cache first
        let prices = getCachedPrices(regionId);
        if (!prices) {
            prices = await fetchPricesForMaterials(Array.from(materialIds), regionId);
            setCachedPrices(regionId, prices);
        }
        AppState.marketPrices = prices;
        updateMarketDisplay(prices, chain);

        elements.marketLoading.classList.add('hidden');
        elements.marketContent.classList.remove('hidden');
    } catch (err) {
        console.error('Failed to fetch market data:', err);
        elements.marketLoading.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error loading prices';
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

async function fetchPricesForMaterials(ids, regionId) {
    const prices = {};
    const idArray = Array.from(ids);

    // Fetch region-specific sell orders for each type
    const jobs = idArray.map(async id => {
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
    });

    await Promise.all(jobs);

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
            }
        } catch (e) {
            // Ignore fallback errors
        }
    }

    return prices;
}

function updateMarketDisplay(prices, chain) {
    const targetId = chain.target.id;
    const targetPrice = prices[targetId]?.sell || 0;
    const targetBatch = chain.target.batchSize || 1;
    const outputValue = targetPrice * targetBatch;

    let totalInputCost = 0;
    const priceItems = [];

    function calcInputCost(node) {
        if (!node.inputs) return;
        node.inputs.forEach(input => {
            const matId = input.id;
            const qty = input.qty || 1;
            const price = prices[matId]?.sell || 0;
            const cost = price * qty;
            totalInputCost += cost;

            priceItems.push({
                name: input.name,
                price,
                qty,
                total: cost,
                tier: input.tier
            });

            if (input.subChain) {
                calcInputCost(input.subChain);
            }
        });
    }
    calcInputCost(chain);

    const profit = outputValue - totalInputCost;
    const margin = totalInputCost > 0 ? (profit / totalInputCost) * 100 : 0;

    elements.outputValue.textContent = formatISK(outputValue);
    elements.inputCost.textContent = formatISK(totalInputCost);

    const profitEl = elements.profitValue;
    profitEl.textContent = formatISK(profit);
    profitEl.className = 'value isk ' + (profit >= 0 ? 'positive' : 'negative');

    elements.profitMargin.textContent = margin.toFixed(1) + '%';

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
}

function refreshColoniesAuthState() {
    if (!window.piEsiAuth) return;
    if (piEsiAuth.isAuthenticated()) {
        loadColonies();
    } else {
        showColoniesLoggedOut();
    }
}

function showColoniesLoggedOut() {
    elements.coloniesStatus.classList.remove('hidden');
    elements.coloniesContent.classList.add('hidden');
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

        // Ensure system data is loaded so we can resolve solar system names
        const systemsLoaded = await ensureSystemsLoaded();

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

        AppState.colonies = detailed;
        AppState.coloniesLoading = false;
        renderColonies(detailed, systemsLoaded);
        if (AppState.viewMode === 'colonies') draw();
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
function analyseColony(detail) {
    const producing = {}; // materialId -> {name, tier, count, amount}
    const stored = {};    // materialId -> amount

    if (!detail || !Array.isArray(detail.pins)) {
        return { producing: [], stored: [] };
    }

    detail.pins.forEach(pin => {
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

    return {
        producing: Object.values(producing),
        stored: Object.entries(stored).map(([id, amount]) => {
            const mat = getMaterialById(Number(id));
            return { id: Number(id), name: mat ? mat.name : `Type ${id}`, tier: mat ? mat.tier : 0, amount };
        }).filter(s => s.amount > 0)
    };
}

function renderColonies(colonies, systemsLoaded) {
    const charName = piEsiAuth.getCurrentCharacterName();
    elements.coloniesHeader.textContent = `${charName || 'Character'} - ${colonies.length} colony${colonies.length === 1 ? '' : 'ies'}`.replace('coloniesies', 'colonies');

    if (!colonies.length) {
        elements.coloniesList.innerHTML = '<div class="colony-item"><div class="colony-name">No colonies found</div><div class="colony-meta">Colonize a planet in-game to see it here</div></div>';
        return;
    }

    // Group by system for readability
    const bySystem = {};
    colonies.forEach(c => {
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
            const color = pt ? pt.color : '#666';

            const upgrades = c.upgrade_level || 0;
            const upgradeBar = [1, 2, 3, 4, 5].map(i =>
                `<span class="upgrade-dot ${i <= upgrades ? 'active' : ''}" style="${i <= upgrades ? 'background:' + color : ''}"></span>`
            ).join('');

            const lastUpdate = c.last_update ? new Date(c.last_update).toLocaleString() : '';
            const pinCount = c.num_pins ? `${c.num_pins} pins` : '';

            const { producing, stored } = analyseColony(c.detail);

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

            html += `<div class="colony-item" style="border-left-color: ${color}">
                <div class="colony-top">
                    <span class="colony-name" style="color: ${color}">${escapeHtml(typeName)}</span>
                    <span class="colony-upgrade" title="Command Center upgrade level">${upgradeBar}</span>
                </div>
                <div class="colony-meta">
                    ${pinCount ? `<span><i class="fas fa-thumbtack"></i>${pinCount}</span>` : ''}
                    <span><i class="fas fa-cubes"></i>CC ${upgrades}</span>
                </div>
                ${produceHtml}
                ${storedHtml}
                ${lastUpdate ? `<div class="colony-updated"><i class="fas fa-clock"></i> Last update: ${escapeHtml(lastUpdate)}</div>` : ''}
            </div>`;
        });
    });

    elements.coloniesList.innerHTML = html;
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackgroundGrid();

    if (AppState.viewMode === 'reference') {
        drawReferenceView();
        return;
    }

    if (AppState.viewMode === 'colonies') {
        drawColoniesView();
        return;
    }

    ctx.save();
    ctx.translate(AppState.canvasOffset.x, AppState.canvasOffset.y);
    ctx.scale(AppState.zoom, AppState.zoom);

    if (AppState.viewMode === 'chain' && AppState.chainLayout) {
        drawChain();
    } else if (AppState.viewMode === 'chain') {
        drawNoSelectionPrompt();
    } else if (AppState.viewMode === 'planets') {
        drawPlanetsView();
    }

    ctx.restore();
}

function drawNoSelectionPrompt() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

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

    for (let x = offsetX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = offsetY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// ---------- Reference View ----------
function drawReferenceView() {
    const cols = Math.floor(canvas.width / 180) || 1;
    const spacing = canvas.width / cols;
    const cellWidth = spacing - 16;
    const cellHeight = 95;

    const allMaterials = [
        ...getMaterialsByTier(1),
        ...getMaterialsByTier(2),
        ...getMaterialsByTier(3),
        ...getMaterialsByTier(4)
    ];

    allMaterials.forEach((mat, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * spacing + 8;
        const y = row * (cellHeight + 12) + 12 - AppState.canvasOffset.y;

        if (y > -cellHeight && y < canvas.height) {
            drawRefCard(mat, x, y, cellWidth, cellHeight, PI_COLORS[mat.tier]);
        }
    });
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

    if (mat.inputs) {
        const inputEntries = Object.entries(mat.inputs).slice(0, 2);
        let yPos = y + 38;

        inputEntries.forEach(([id, qty], i) => {
            const input = getMaterialById(parseInt(id));
            if (!input) return;

            ctx.fillStyle = '#888';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'left';

            let inputName = input.name;
            if (inputName.length > 16) inputName = inputName.substring(0, 14) + '...';
            ctx.fillText(`${qty}x ${inputName}`, x + 12, yPos);

            if (input.tier === 0) {
                const planetTypes = getPlanetTypesForP0(parseInt(id));
                if (planetTypes.length > 0) {
                    const spacing = 11;
                    const startX = x + 12;

                    planetTypes.forEach((planet, j) => {
                        const px = startX + j * spacing;
                        ctx.fillStyle = planet.color;
                        ctx.beginPath();
                        ctx.arc(px, yPos + 10, 4, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.shadowColor = planet.color;
                        ctx.shadowBlur = 4;
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    });
                }
            }

            yPos += 18;
        });

        ctx.fillStyle = '#666';
        ctx.font = '8px sans-serif';
        ctx.fillText(`→ ${mat.batchSize} units`, x + 12, yPos);
    }

    const price = AppState.marketPrices[mat.id]?.sell;
    if (price) {
        ctx.fillStyle = '#e8d900';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatISK(price), x + w - 12, y + h - 12);
    }
}

// ---------- Chain View ----------
function drawChain() {
    if (!AppState.chainLayout) return;

    const { nodes, links } = AppState.chainLayout;

    links.forEach((link, index) => {
        const from = nodes.find(n => n.id === link.from);
        const to = nodes.find(n => n.id === link.to);
        if (from && to) {
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const curveOffset = (index % 2 === 0 ? 10 : -10);

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(232, 217, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.moveTo(from.x, from.y);
            ctx.quadraticCurveTo(midX + curveOffset, midY, to.x, to.y);
            ctx.stroke();
        }
    });

    nodes.forEach(node => {
        drawChainNode(node);
    });
}

function drawChainNode(node) {
    const width = 140;
    const height = node.tier === 0 ? 78 : 62;
    const x = node.x - width / 2;
    const y = node.y - height / 2;

    const color = PI_COLORS[node.tier] || '#666';

    ctx.fillStyle = 'rgba(30, 30, 30, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

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
    if (mat && mat.inputs) {
        const inputQty = Object.values(mat.inputs)[0];
        ctx.fillText(`${inputQty} → ${mat.batchSize} units`, node.x, y + 22);
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

    let yOffset = -300;

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

    ctx.fillStyle = 'rgba(40, 40, 40, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

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
    ctx.fillText(`${piEsiAuth.getCurrentCharacterName() || 'Character'} - ${colonies.length} colony${colonies.length === 1 ? '' : 'ies'}`, 20, 20);

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
    const cardHeight = 150;
    const gapX = 24;
    const gapY = 24;
    const headerH = 34;
    const margin = 40;
    const offsetY = AppState.canvasOffset.y;

    const cols = Math.max(1, Math.floor((canvas.width - margin * 2) / (cardWidth + gapX)));
    let y = margin + headerH + offsetY;

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
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

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
    ctx.fillText(typeName, x + 16, y + 12);

    // Upgrade dots
    const dotSize = 10;
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < upgrades ? color : 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(x + w - 20 - (4 - i) * (dotSize + 4), y + 16, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Meta
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Titillium Web, sans-serif';
    ctx.fillText(`${pinCount} pins • CC ${upgrades}`, x + 16, y + 32);

    // Producing / stored summary
    const { producing, stored } = analyseColony(c.detail);
    let py = y + 52;
    if (producing.length) {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 10px Titillium Web, sans-serif';
        ctx.fillText('PRODUCING', x + 16, py);
        py += 16;
        producing.slice(0, 3).forEach(p => {
            const tierColor = PI_COLORS[p.tier] || '#888';
            ctx.fillStyle = tierColor;
            ctx.font = '10px Titillium Web, sans-serif';
            ctx.fillText(`${p.name}${p.amount && p.type === 'extractor' ? ` x${p.amount}/cyc` : ''}`, x + 16, py);
            py += 13;
        });
    }
    if (stored.length) {
        if (py < y + h - 26) {
            ctx.fillStyle = '#888';
            ctx.font = 'bold 10px Titillium Web, sans-serif';
            ctx.fillText('STORED', x + 16, py);
            py += 14;
            stored.slice(0, 3).forEach(s => {
                const tierColor = PI_COLORS[s.tier] || '#888';
                ctx.fillStyle = tierColor;
                ctx.font = '10px Titillium Web, sans-serif';
                ctx.fillText(`${s.name} x${formatAmount(s.amount)}`, x + 16, py);
                py += 13;
            });
        }
    }
}

// ---------- Colony Detail View ----------
// Shows a single colony's production chain, producing items and stored items.
function drawColonyDetail(c) {
    const pt = getPlanetTypeByNameOrId(c.planet_type);
    const typeName = pt ? pt.name : `Planet type ${c.planet_type}`;
    const color = pt ? pt.color : '#666';
    const sys = (AppState.systemsLoaded && typeof PI_SYSTEMS !== 'undefined') ? PI_SYSTEMS[c.solar_system_id] : null;
    const systemName = sys ? sys.name : `System ${c.solar_system_id}`;
    const regionName = sys && sys.regionId && PI_DATA.regions && PI_DATA.regions[sys.regionId] ? PI_DATA.regions[sys.regionId] : null;

    const margin = 30;
    let x = margin;
    let y = margin;

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
    y += 40;

    // Header
    ctx.fillStyle = color;
    ctx.font = 'bold 22px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(typeName, x, y);
    ctx.fillStyle = '#aaa';
    ctx.font = '13px Titillium Web, sans-serif';
    ctx.fillText(`${systemName}${regionName ? ` (${regionName})` : ''} • CC ${c.upgrade_level || 0} • ${c.num_pins || 0} pins`, x, y + 28);
    y += 58;

    const { producing, stored } = analyseColony(c.detail);

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
    let sx = canvas.width / 2;
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
            ctx.fillText(formatAmount(s.amount), canvas.width - margin, sy);
            ctx.textAlign = 'left';
            sy += 18;
        });
    }

    // ---- Production chain ----
    // Draw a chain box per produced material showing its inputs
    let cy = Math.max(py, sy) + 20;
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
        drawChainRow(chain, x, cy, canvas.width - margin * 2);
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
function onMouseDown(e) {
    const pos = getCanvasPos(e);
    AppState.mouseDownPos = pos;
    AppState.hasDragged = false;

    if (AppState.viewMode === 'colonies') {
        // Back button in detail view
        if (AppState.colonyDetail) {
            if (pos.x >= 30 && pos.x <= 120 && pos.y >= 30 && pos.y <= 58) {
                AppState.colonyDetail = null;
                draw();
                return;
            }
            return; // detail view is fixed layout, no drag
        } else {
            // Click a colony card to open its detail
            for (const card of AppState.colonyCards) {
                if (pos.x >= card.x && pos.x <= card.x + card.w &&
                    pos.y >= card.y && pos.y <= card.y + card.h) {
                    AppState.colonyDetail = card.colony;
                    draw();
                    return;
                }
            }
        }

        AppState.isDraggingCanvas = true;
        AppState.lastMousePos = pos;
        return;
    }

    if (AppState.viewMode === 'reference') {
        const cols = Math.floor(canvas.width / 180) || 1;
        const spacing = canvas.width / cols;
        const cellWidth = spacing - 16;
        const cellHeight = 95;

        const allMaterials = [
            ...getMaterialsByTier(1),
            ...getMaterialsByTier(2),
            ...getMaterialsByTier(3),
            ...getMaterialsByTier(4)
        ];

        for (let i = 0; i < allMaterials.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cardX = col * spacing + 8;
            const cardY = row * (cellHeight + 12) + 12 - AppState.canvasOffset.y;

            if (pos.x >= cardX && pos.x <= cardX + cellWidth &&
                pos.y >= cardY && pos.y <= cardY + cellHeight) {
                selectProduct(allMaterials[i].id);
                return;
            }
        }

        AppState.isDraggingCanvas = true;
        AppState.lastMousePos = pos;
        return;
    }

    AppState.isDraggingCanvas = true;
    AppState.lastMousePos = pos;
}

function onMouseMove(e) {
    const pos = getCanvasPos(e);

    if (AppState.mouseDownPos) {
        const dx = pos.x - AppState.mouseDownPos.x;
        const dy = pos.y - AppState.mouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            AppState.hasDragged = true;
        }
    }

    if (AppState.viewMode === 'reference') {
        const cols = Math.floor(canvas.width / 180) || 1;
        const spacing = canvas.width / cols;
        const cellWidth = spacing - 16;
        const cellHeight = 95;

        const allMaterials = [
            ...getMaterialsByTier(1),
            ...getMaterialsByTier(2),
            ...getMaterialsByTier(3),
            ...getMaterialsByTier(4)
        ];

        let foundHover = null;
        for (let i = 0; i < allMaterials.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cardX = col * spacing + 8;
            const cardY = row * (cellHeight + 12) + 12 - AppState.canvasOffset.y;

            if (pos.x >= cardX && pos.x <= cardX + cellWidth &&
                pos.y >= cardY && pos.y <= cardY + cellHeight) {
                foundHover = allMaterials[i].id;
                break;
            }
        }

        if (foundHover !== AppState.hoveredCard) {
            AppState.hoveredCard = foundHover;
            canvas.style.cursor = foundHover ? 'pointer' : 'default';
            draw();
        }
    }

    if (AppState.isDraggingCanvas) {
        const dx = pos.x - AppState.lastMousePos.x;
        const dy = pos.y - AppState.lastMousePos.y;
        AppState.canvasOffset.x += dx;
        AppState.canvasOffset.y += dy;
        AppState.lastMousePos = pos;
        draw();
    }
}

function onMouseUp(e) {
    AppState.isDraggingCanvas = false;

    AppState.mouseDownPos = null;
    AppState.hasDragged = false;
}

function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(AppState.zoom * delta);
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

// View Controls
function setZoom(zoom) {
    AppState.zoom = Math.max(0.25, Math.min(4, zoom));
    elements.zoomLevel.textContent = Math.round(AppState.zoom * 100) + '%';
    draw();
}

function setViewMode(mode) {
    if (mode !== 'colonies') {
        AppState.colonyDetail = null;
    }
    AppState.viewMode = mode;
    elements.viewReference.classList.toggle('active', mode === 'reference');
    elements.viewChain.classList.toggle('active', mode === 'chain');
    elements.viewPlanets.classList.toggle('active', mode === 'planets');
    elements.viewColonies.classList.toggle('active', mode === 'colonies');
    elements.backToRef.classList.toggle('hidden', mode === 'reference');

    const helpText = document.querySelector('.canvas-help p');
    if (mode === 'reference') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> Click any material to view its production chain and market data';
    } else if (mode === 'planets') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> Planet breakdown view • Shows which raw materials each planet subtype can extract';
    } else if (mode === 'colonies') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> My Colonies • Sign in with EVE SSO to view your planetary colonies';
    } else {
        canvas.style.cursor = 'default';
        if (AppState.chainLayout) {
            helpText.innerHTML = '<i class="fas fa-info-circle"></i> Viewing production chain • Use controls to zoom and pan';
        } else {
            helpText.innerHTML = '<i class="fas fa-info-circle"></i> Select a product to view its production chain';
        }
    }

    draw();
}

function fitView() {
    if (AppState.viewMode === 'chain' && AppState.chainLayout) {
        fitChainView(AppState.chainLayout);
    } else {
        AppState.canvasOffset = { x: 0, y: 0 };
        setZoom(1);
    }
}

// ---------- Reference Grids (sidebar) ----------
function setupReferenceGrids() {
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

async function ensureSystemsLoaded() {
    if (AppState.systemsLoaded) return true;
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'pi-systems.js?t=' + new Date().getTime();
        script.onload = () => {
            AppState.systemsLoaded = true;
            resolve(true);
        };
        script.onerror = () => {
            console.error('Failed to load pi-systems.js');
            resolve(false);
        };
        document.head.appendChild(script);
    });
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

    // Exact match first, then substring
    let system = null;
    for (const key in PI_SYSTEMS) {
        if (PI_SYSTEMS[key].name.toLowerCase() === lower) {
            system = PI_SYSTEMS[key];
            break;
        }
    }
    if (!system) {
        for (const key in PI_SYSTEMS) {
            if (PI_SYSTEMS[key].name.toLowerCase().includes(lower)) {
                system = PI_SYSTEMS[key];
                break;
            }
        }
    }

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

    // P1 producible
    const producibleP1 = new Set();
    for (const mat of getMaterialsByTier(1)) {
        if (mat.inputs && Object.keys(mat.inputs).every(i => availableP0.has(parseInt(i)))) {
            producibleP1.add(mat.id);
        }
    }

    // P2 producible (inputs are P1 or P0)
    const producibleP2 = getMaterialsByTier(2).filter(mat => {
        if (!mat.inputs) return false;
        return Object.keys(mat.inputs).every(i => producibleP1.has(parseInt(i)) || availableP0.has(parseInt(i)));
    });

    // P3 producible (inputs are P2, P1, or P0)
    const producibleP2Ids = new Set(producibleP2.map(m => m.id));
    const producibleP3 = getMaterialsByTier(3).filter(mat => {
        if (!mat.inputs) return false;
        return Object.keys(mat.inputs).every(i =>
            producibleP2Ids.has(parseInt(i)) || producibleP1.has(parseInt(i)) || availableP0.has(parseInt(i)));
    });

    // P4 producible (inputs are P3, P2, P1, or P0)
    const producibleP3Ids = new Set(producibleP3.map(m => m.id));
    const producibleP4 = getMaterialsByTier(4).filter(mat => {
        if (!mat.inputs) return false;
        return Object.keys(mat.inputs).every(i =>
            producibleP3Ids.has(parseInt(i)) || producibleP2Ids.has(parseInt(i)) ||
            producibleP1.has(parseInt(i)) || availableP0.has(parseInt(i)));
    });

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

// Animation loop
function animate() {
    draw();
    requestAnimationFrame(animate);
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}