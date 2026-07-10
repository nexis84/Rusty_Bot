// PI Chain Visualizer - Main Application
// Interactive canvas for planning planetary interaction chains

console.log('PI Visualizer loading...');

const ESI_BASE = 'https://esi.evetech.net/latest';
const DEFAULT_REGION = '10000002'; // Jita/The Forge

// Application State
const AppState = {
    canvasOffset: { x: 0, y: 0 },
    zoom: 1,
    viewMode: 'reference', // 'reference', 'chain', or 'planets'
    marketPrices: {},
    targetProduct: null,
    isDraggingCanvas: false,
    lastMousePos: { x: 0, y: 0 },
    chainLayout: null,
    currentTab: 'system',
    hoveredCard: null,
    // Template builder state
    template: {
        pins: [],
        links: [],
        routes: [],
        selectedFacility: null,
        selectedPin: null,
        linkingFrom: null
    }
};

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
    viewTemplate: document.getElementById('viewTemplate'),
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
    systemPlanets: document.getElementById('systemPlanets'),
    producibleP2: document.getElementById('producibleP2'),
    producibleP3: document.getElementById('producibleP3'),
    // Reference elements
    refP1: document.getElementById('refP1'),
    refP2: document.getElementById('refP2'),
    refP3: document.getElementById('refP3'),
    // Template builder elements
    templateName: document.getElementById('templateName'),
    templatePlanetType: document.getElementById('templatePlanetType'),
    templateCmdLevel: document.getElementById('templateCmdLevel'),
    clearTemplate: document.getElementById('clearTemplate'),
    exportTemplate: document.getElementById('exportTemplate')
};

// Initialize
function init() {
    console.log('init() called');
    setupCanvas();
    console.log('Canvas setup done');
    setupEventListeners();
    console.log('Event listeners done');
    setupTabs();
    console.log('Tabs setup done');
    setupReferenceGrids();
    console.log('Reference grids done');
    setupSystemChecker();
    console.log('System checker done');
    setupTemplateBuilder();
    console.log('Template builder done');
    animate();
    
    // Start in reference view
    setViewMode('reference');
    console.log('Init complete');
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
    
    // Keyboard events
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' && AppState.viewMode === 'template') {
            deleteSelectedPin();
        }
    });

    // Controls
    elements.calculateChain.addEventListener('click', calculateChain);
    
    elements.viewReference.addEventListener('click', () => setViewMode('reference'));
    elements.viewChain.addEventListener('click', () => setViewMode('chain'));
    elements.viewPlanets.addEventListener('click', () => setViewMode('planets'));
    elements.viewTemplate.addEventListener('click', () => setViewMode('template'));
    elements.backToRef.addEventListener('click', () => setViewMode('reference'));
    
    elements.zoomIn.addEventListener('click', () => setZoom(AppState.zoom * 1.2));
    elements.zoomOut.addEventListener('click', () => setZoom(AppState.zoom * 0.8));
    elements.fitView.addEventListener('click', fitView);
    
    elements.regionSelect.addEventListener('change', () => {
        if (AppState.targetProduct) {
            fetchMarketData();
        }
    });
    
    // Template builder events
    document.querySelectorAll('.facility-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            console.log('Selected facility:', type);
            AppState.template.selectedFacility = type;
            document.querySelectorAll('.facility-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    elements.clearTemplate.addEventListener('click', clearTemplate);
    elements.exportTemplate.addEventListener('click', exportTemplate);
}

// Tab Management
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const tab = btn.dataset.tab;
            
            // Update buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const targetPanel = document.getElementById(`tab-${tab}`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
            
            AppState.currentTab = tab;
            
            // Auto-switch to template mode when template tab is clicked
            if (tab === 'template') {
                elements.viewTemplate.click();
            }
        });
    });
}

// Template Builder Setup
function setupTemplateBuilder() {
    // Facility type IDs (from EVE SDE)
    AppState.facilityTypes = {
        command: 2783,
        extractor: 2868,
        basic: 2474,
        advanced: 2475,
        hitech: 2476,
        storage: 2527,
        launchpad: 2552
    };
}

function clearTemplate() {
    AppState.template.pins = [];
    AppState.template.links = [];
    AppState.template.routes = [];
    AppState.template.selectedPin = null;
    AppState.template.linkingFrom = null;
    draw();
}

function deleteSelectedPin() {
    if (!AppState.template.selectedPin) return;
    
    const pinId = AppState.template.selectedPin.id;
    
    // Remove pin
    AppState.template.pins = AppState.template.pins.filter(p => p.id !== pinId);
    
    // Remove links connected to this pin
    AppState.template.links = AppState.template.links.filter(
        link => link.from !== pinId && link.to !== pinId
    );
    
    AppState.template.selectedPin = null;
    draw();
}

function exportTemplate() {
    const template = {
        CmdCtrLv: parseInt(elements.templateCmdLevel.value),
        Cmt: elements.templateName.value || 'My Template',
        Diam: 5820.0,
        L: AppState.template.links.map(link => ({
            D: link.to,
            Lv: 0,
            S: link.from
        })),
        P: AppState.template.pins.map((pin, index) => ({
            H: 0,
            La: pin.lat,
            Lo: pin.lon,
            S: pin.schematic || null,
            T: AppState.facilityTypes[pin.type]
        })),
        Pln: parseInt(elements.templatePlanetType.value),
        R: AppState.template.routes
    };
    
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.Cmt.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Canvas Event Handlers (simplified for reference view)
function onMouseDown(e) {
    const pos = getCanvasPos(e);
    AppState.mouseDownPos = pos; // Track for distinguishing click vs drag
    AppState.hasDragged = false;
    
    if (AppState.viewMode === 'reference') {
        // Check if clicked on a reference card
        const cols = Math.floor(canvas.width / 180);
        const spacing = canvas.width / cols;
        const cellWidth = spacing - 16;
        const cellHeight = 95;
        
        const allMaterials = [
            ...PI_DATA.getMaterialsByTier(1),
            ...PI_DATA.getMaterialsByTier(2),
            ...PI_DATA.getMaterialsByTier(3),
            ...PI_DATA.getMaterialsByTier(4)
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
        
        // Start drag
        AppState.isDraggingCanvas = true;
        AppState.lastMousePos = pos;
        return;
    }
    
    if (AppState.viewMode === 'template') {
        console.log('Template mode click. Selected facility:', AppState.template.selectedFacility);
        // Convert screen to world coordinates
        const worldPos = screenToWorld(pos.x, pos.y);
        console.log('World pos:', worldPos);
        
        // Check if clicking on existing pin
        const clickedPin = findPinAt(worldPos.x, worldPos.y);
        
        if (clickedPin) {
            // Right-click to start linking
            if (e.button === 2) {
                if (AppState.template.linkingFrom) {
                    // Complete the link
                    if (AppState.template.linkingFrom.id !== clickedPin.id) {
                        addLink(AppState.template.linkingFrom.id, clickedPin.id);
                    }
                    AppState.template.linkingFrom = null;
                } else {
                    // Start linking
                    AppState.template.linkingFrom = clickedPin;
                }
                return;
            }
            
            AppState.template.selectedPin = clickedPin;
            AppState.template.draggedPin = clickedPin;
            return;
        }
        
        // Don't place pin immediately - wait to see if it's a drag
        // Start canvas drag instead
        AppState.isDraggingCanvas = true;
        AppState.lastMousePos = pos;
        AppState.pendingPinPlacement = {
            x: worldPos.x,
            y: worldPos.y,
            type: AppState.template.selectedFacility
        };
        return;
    }
    
    AppState.isDraggingCanvas = true;
    AppState.lastMousePos = pos;
}

function onMouseMove(e) {
    const pos = getCanvasPos(e);
    
    // Check if this is a drag (moved more than 5 pixels)
    if (AppState.mouseDownPos) {
        const dx = pos.x - AppState.mouseDownPos.x;
        const dy = pos.y - AppState.mouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            AppState.hasDragged = true;
        }
    }
    
    if (AppState.viewMode === 'reference') {
        // Check for card hover
        const cols = Math.floor(canvas.width / 180);
        const spacing = canvas.width / cols;
        const cellWidth = spacing - 16;
        const cellHeight = 95;
        
        const allMaterials = [
            ...PI_DATA.getMaterialsByTier(1),
            ...PI_DATA.getMaterialsByTier(2),
            ...PI_DATA.getMaterialsByTier(3),
            ...PI_DATA.getMaterialsByTier(4)
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
    
    if (AppState.viewMode === 'template' && AppState.template.draggedPin) {
        const worldPos = screenToWorld(pos.x, pos.y);
        // Snap to grid
        const gridSize = 25;
        AppState.template.draggedPin.x = Math.round(worldPos.x / gridSize) * gridSize;
        AppState.template.draggedPin.y = Math.round(worldPos.y / gridSize) * gridSize;
        draw();
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
    AppState.template.draggedPin = null;
    
    // Handle pending pin placement (only if it was a click, not a drag)
    if (AppState.viewMode === 'template' && AppState.pendingPinPlacement && !AppState.hasDragged) {
        if (AppState.pendingPinPlacement.type) {
            addPin(AppState.pendingPinPlacement.x, AppState.pendingPinPlacement.y, AppState.pendingPinPlacement.type);
        }
    }
    
    AppState.pendingPinPlacement = null;
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
    console.log('setViewMode called with:', mode);
    AppState.viewMode = mode;
    elements.viewReference.classList.toggle('active', mode === 'reference');
    elements.viewChain.classList.toggle('active', mode === 'chain');
    elements.viewPlanets.classList.toggle('active', mode === 'planets');
    elements.viewTemplate.classList.toggle('active', mode === 'template');
    elements.backToRef.classList.toggle('hidden', mode === 'reference');
    
    // Hide market data panel in template mode
    const marketPanel = document.querySelector('.market-panel');
    if (marketPanel) {
        marketPanel.classList.toggle('hidden', mode === 'template');
    }
    
    // Hide product breakdown panel in template mode
    const breakdownPanel = document.getElementById('productBreakdown');
    if (breakdownPanel) {
        breakdownPanel.classList.toggle('hidden', mode === 'template');
    }
    
    // Hide target product toolbar section in template mode
    const targetSection = elements.targetProduct.closest('.toolbar-section');
    if (targetSection) {
        targetSection.classList.toggle('hidden', mode === 'template');
    }
    
    // Update canvas cursor and help text
    const helpText = document.querySelector('.canvas-help p');
    if (mode === 'reference') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> Click any material to view its production chain and market data';
    } else if (mode === 'planets') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> Planet breakdown view • Shows required planet types for each material';
    } else if (mode === 'template') {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> Template Builder • Click facility type, then click planet to place';
        // Center the planet in view
        AppState.canvasOffset.x = canvas.width / 2;
        AppState.canvasOffset.y = canvas.height / 2;
        AppState.zoom = 1;
    } else {
        canvas.style.cursor = 'default';
        helpText.innerHTML = '<i class="fas fa-info-circle"></i> Viewing production chain • Use controls to zoom and pan';
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

// Chain Calculation
function calculateChain() {
    const productId = elements.targetProduct.value;
    if (!productId) {
        alert('Please select a target product first');
        return;
    }
    
    AppState.targetProduct = parseInt(productId);
    
    // Generate visual chain layout
    generateChainLayout();
    
    // Fetch market data
    fetchMarketData();
    
    setViewMode('chain');
}

function showProductBreakdown(productId) {
    const material = PI_DATA.getMaterialById(productId);
    if (!material) return;
    
    const requirements = {};
    const visited = new Set();
    
    // Recursively calculate requirements based on material inputs
    const calculateRequirements = (materialId, multiplier = 1) => {
        // Prevent infinite recursion
        if (visited.has(materialId)) return;
        visited.add(materialId);
        
        const mat = PI_DATA.getMaterialById(materialId);
        if (!mat) return;
        
        if (mat.tier === 0) {
            // P0 material - add to requirements
            requirements[materialId] = (requirements[materialId] || 0) + multiplier;
        } else if (mat.inputs) {
            // P1-P4 material - add its inputs
            Object.entries(mat.inputs).forEach(([inputId, inputQty]) => {
                calculateRequirements(parseInt(inputId), inputQty * multiplier);
            });
        }
    };
    
    calculateRequirements(productId, 1);
    
    // Build breakdown HTML
    const breakdownContent = document.getElementById('breakdownContent');
    let html = '';
    
    Object.entries(requirements).forEach(([id, amount]) => {
        const mat = PI_DATA.getMaterialById(parseInt(id));
        if (mat) {
            html += `
                <div class="breakdown-item">
                    <span class="material-name">${mat.name}</span>
                    <span class="material-amount">${Math.round(amount)}</span>
                </div>
            `;
        }
    });
    
    breakdownContent.innerHTML = html;
    document.getElementById('productBreakdown').classList.remove('hidden');
}

function generateChainLayout() {
    const productId = AppState.targetProduct;
    const chain = PI_DATA.getChainForProduct(productId);
    
    if (!chain) return;
    
    const layout = {
        nodes: [],
        links: []
    };
    
    const levelWidth = 160;
    const nodeHeight = 100;
    
    // First pass: calculate tree depth and count nodes per level
    const nodeCounts = {};
    const maxDepth = { value: 0 };
    const visitedNodes = new Set();
    
    const countNodes = (nodeData, depth) => {
        // Prevent infinite recursion
        if (visitedNodes.has(nodeData.id)) return;
        visitedNodes.add(nodeData.id);
        
        maxDepth.value = Math.max(maxDepth.value, depth);
        nodeCounts[depth] = (nodeCounts[depth] || 0) + 1;
        
        if (nodeData.inputs) {
            // inputs is an object, convert to array
            Object.values(nodeData.inputs).forEach(input => {
                if (input.subChain) {
                    countNodes(input.subChain, depth + 1);
                }
            });
        }
    };
    
    countNodes(chain.target, 0);
    
    // Build tree structure with better positioning
    const visitedAddNodes = new Set();
    const levelIndices = {}; // Track position of nodes at each depth level
    
    const addNode = (nodeData, depth, parentId = null) => {
        // Prevent infinite recursion
        if (visitedAddNodes.has(nodeData.id)) return;
        visitedAddNodes.add(nodeData.id);
        
        // Track position at this depth level
        levelIndices[depth] = (levelIndices[depth] || 0) + 1;
        const index = levelIndices[depth] - 1;
        
        const levelCount = nodeCounts[depth] || 1;
        const levelSpacing = levelWidth;
        const totalWidth = (levelCount - 1) * levelSpacing;
        const x = (index * levelSpacing) - totalWidth / 2;
        const y = (maxDepth.value - depth) * nodeHeight;
        
        const node = {
            id: `node-${layout.nodes.length}`,
            materialId: nodeData.id,
            name: nodeData.name,
            tier: nodeData.tier,
            x,
            y,
            qty: nodeData.qty || 1,
            planetTypes: []
        };
        
        // For P0 materials, find which planets can extract them
        if (nodeData.tier === 0) {
            for (const [type, data] of Object.entries(PI_DATA.planets)) {
                if (data.p0Materials.includes(nodeData.id)) {
                    node.planetTypes.push({ type, name: data.name, color: data.color });
                }
            }
        }
        
        layout.nodes.push(node);
        
        if (parentId) {
            layout.links.push({ from: node.id, to: parentId });
        }
        
        if (nodeData.subChain) {
            nodeData.subChain.inputs?.forEach(input => {
                addNode(input, depth + 1, node.id);
            });
        } else if (nodeData.inputs) {
            Object.entries(nodeData.inputs).forEach(([id, qty]) => {
                const subChain = PI_DATA.getChainForProduct(parseInt(id));
                if (subChain) {
                    addNode({ ...subChain.target, qty }, depth + 1, node.id);
                } else {
                    addNode({ id: parseInt(id), ...PI_DATA.materials[id], qty }, depth + 1, node.id);
                }
            });
        }
        
        return node.id;
    };
    
    addNode(chain.target, 0);
    
    AppState.chainLayout = layout;
    
    // Center the view on the chain
    fitChainView(layout);
}

function fitChainView(layout) {
    if (!layout || layout.nodes.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    layout.nodes.forEach(n => {
        minX = Math.min(minX, n.x - 60);
        maxX = Math.max(maxX, n.x + 60);
        minY = Math.min(minY, n.y - 40);
        maxY = Math.max(maxY, n.y + 40);
    });
    
    const padding = 50;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    
    setZoom(Math.min(scaleX, scaleY, 1.5));
    
    AppState.canvasOffset.x = -minX * AppState.zoom + padding * AppState.zoom + (canvas.width - width * AppState.zoom) / 2;
    AppState.canvasOffset.y = -minY * AppState.zoom + padding * AppState.zoom + (canvas.height - height * AppState.zoom) / 2;
    
    draw();
}

// Market Data
async function fetchMarketData() {
    if (!AppState.targetProduct) return;
    
    elements.marketLoading.classList.remove('hidden');
    elements.marketContent.classList.add('hidden');
    
    const regionId = elements.regionSelect.value;
    const productId = AppState.targetProduct;
    
    // Get all materials in the chain
    const chain = PI_DATA.getChainForProduct(productId);
    const materialIds = collectMaterialIds(chain);
    
    try {
        const prices = await fetchPricesForMaterials(materialIds, regionId);
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
    
    ids.add(chain.target.id);
    
    if (chain.inputs) {
        chain.inputs.forEach(input => {
            ids.add(input.id);
            if (input.subChain) {
                collectMaterialIds(input.subChain, ids);
            }
        });
    }
    
    return ids;
}

async function fetchPricesForMaterials(ids, regionId) {
    const prices = {};
    const idArray = Array.from(ids);
    
    // Process in batches of 100 (ESI limit for orders endpoint is lower, use market prices)
    const batches = [];
    for (let i = 0; i < idArray.length; i += 100) {
        batches.push(idArray.slice(i, i + 100));
    }
    
    for (const batch of batches) {
        try {
            // Use market prices endpoint for all regions
            const url = `${ESI_BASE}/markets/prices/`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            batch.forEach(id => {
                const item = data.find(p => p.type_id === id);
                if (item) {
                    prices[id] = {
                        sell: item.average_price || 0,
                        buy: item.adjusted_price || 0
                    };
                }
            });
        } catch (err) {
            console.warn('Failed to fetch batch:', err);
        }
        
        // Small delay to be nice to ESI
        await new Promise(r => setTimeout(r, 100));
    }
    
    // Try to get better prices from orders for the selected region
    if (regionId !== 'major') {
        try {
            const ordersUrl = `${ESI_BASE}/markets/${regionId}/orders/?type_id=${idArray[0]}&order_type=sell`;
            const response = await fetch(ordersUrl);
            if (response.ok) {
                const orders = await response.json();
                if (orders.length > 0) {
                    const bestSell = orders
                        .filter(o => o.is_buy_order === false)
                        .sort((a, b) => a.price - b.price)[0];
                    if (bestSell) {
                        prices[idArray[0]].sell = bestSell.price;
                    }
                }
            }
        } catch (e) {
            // Ignore errors for individual items
        }
    }
    
    return prices;
}

function updateMarketDisplay(prices, chain) {
    // Calculate costs
    const targetId = chain.target.id;
    const targetPrice = prices[targetId]?.sell || 0;
    const targetBatch = PI_DATA.materials[targetId]?.batchSize || 1;
    const outputValue = targetPrice * targetBatch;
    
    // Calculate input costs
    let totalInputCost = 0;
    const priceItems = [];
    
    function calcInputCost(node) {
        if (!node.inputs) return;
        
        for (const input of node.inputs) {
            const matId = input.id;
            const qty = input.qty || 1;
            const price = prices[matId]?.sell || 0;
            const cost = price * qty;
            totalInputCost += cost;
            
            priceItems.push({
                name: input.name,
                price: price,
                qty: qty,
                total: cost,
                tier: input.tier
            });
            
            if (input.subChain) {
                calcInputCost(input.subChain);
            }
        }
    }
    
    calcInputCost(chain);
    
    const profit = outputValue - totalInputCost;
    const margin = totalInputCost > 0 ? (profit / totalInputCost) * 100 : 0;
    
    // Update display
    elements.outputValue.textContent = formatISK(outputValue);
    elements.inputCost.textContent = formatISK(totalInputCost);
    
    const profitEl = elements.profitValue;
    profitEl.textContent = formatISK(profit);
    profitEl.className = 'value isk ' + (profit >= 0 ? 'positive' : 'negative');
    
    elements.profitMargin.textContent = margin.toFixed(1) + '%';
    
    // Update price list
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

// Drawing
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background grid
    drawBackgroundGrid();
    
    if (AppState.viewMode === 'reference') {
        drawReferenceView();
        return;
    }
    
    ctx.save();
    ctx.translate(AppState.canvasOffset.x, AppState.canvasOffset.y);
    ctx.scale(AppState.zoom, AppState.zoom);
    
    if (AppState.viewMode === 'chain' && AppState.chainLayout) {
        drawChain();
    } else if (AppState.viewMode === 'planets' && AppState.chainLayout) {
        drawPlanetsView();
    } else if (AppState.viewMode === 'template') {
        drawTemplateView();
    }
    
    ctx.restore();
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

function drawReferenceView() {
    // Draw compact reference grid showing all P1/P2/P3/P4 materials
    const cols = Math.floor(canvas.width / 180);
    const spacing = canvas.width / cols;
    const cellWidth = spacing - 16;
    const cellHeight = 95;
    
    const allMaterials = [
        ...PI_DATA.getMaterialsByTier(1),
        ...PI_DATA.getMaterialsByTier(2),
        ...PI_DATA.getMaterialsByTier(3),
        ...PI_DATA.getMaterialsByTier(4)
    ];
    
    const tierColors = ['#6e7681', '#58a6ff', '#d29922', '#a371f7', '#3fb950'];
    
    allMaterials.forEach((mat, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * spacing + 8;
        const y = row * (cellHeight + 12) + 12 - AppState.canvasOffset.y;
        
        if (y > -cellHeight && y < canvas.height) {
            drawRefCard(mat, x, y, cellWidth, cellHeight, tierColors[mat.tier]);
        }
    });
}

function drawRefCard(mat, x, y, w, h, color) {
    const isHovered = AppState.hoveredCard === mat.id;
    
    // Card background with gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    if (isHovered) {
        gradient.addColorStop(0, 'rgba(60, 60, 60, 0.98)');
        gradient.addColorStop(1, 'rgba(40, 40, 40, 0.98)');
    } else {
        gradient.addColorStop(0, 'rgba(40, 40, 40, 0.98)');
        gradient.addColorStop(1, 'rgba(25, 25, 25, 0.98)');
    }
    ctx.fillStyle = gradient;
    
    // Subtle border
    ctx.strokeStyle = isHovered ? color : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = isHovered ? 2 : 1;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    
    // Left accent bar
    ctx.fillStyle = color;
    ctx.beginPath();
    roundRect(ctx, x, y, 4, h, [8, 0, 0, 8]);
    ctx.fill();
    
    // Tier badge
    ctx.fillStyle = color;
    ctx.beginPath();
    roundRect(ctx, x + 12, y + 8, 20, 16, 4);
    ctx.fill();
    
    ctx.fillStyle = '#121212';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${mat.tier}`, x + 22, y + 16);
    
    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    let name = mat.name;
    if (name.length > 18) name = name.substring(0, 16) + '...';
    ctx.fillText(name, x + 40, y + 10);
    
    // Volume info
    if (mat.volume) {
        ctx.fillStyle = '#555';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${mat.volume}m³`, x + w - 12, y + 12);
    }
    
    // Input summary with planet types
    if (mat.inputs) {
        const inputEntries = Object.entries(mat.inputs).slice(0, 2);
        let yPos = y + 38;
        
        inputEntries.forEach(([id, qty], i) => {
            const input = PI_DATA.materials[id];
            if (!input) return;
            
            // Input name
            ctx.fillStyle = '#888';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'left';
            
            let inputName = input.name;
            if (inputName.length > 16) inputName = inputName.substring(0, 14) + '...';
            ctx.fillText(`${qty}x ${inputName}`, x + 12, yPos);
            
            // Show planet types for P0 inputs
            if (input.tier === 0) {
                const planetTypes = [];
                for (const [type, data] of Object.entries(PI_DATA.planets)) {
                    if (data.p0Materials.includes(parseInt(id))) {
                        planetTypes.push({ type, color: data.color });
                    }
                }
                
                if (planetTypes.length > 0) {
                    const spacing = 11;
                    const startX = x + 12;
                    
                    planetTypes.forEach((planet, j) => {
                        const px = startX + j * spacing;
                        ctx.fillStyle = planet.color;
                        ctx.beginPath();
                        ctx.arc(px, yPos + 10, 4, 0, Math.PI * 2);
                        ctx.fill();
                        
                        // Glow effect
                        ctx.shadowColor = planet.color;
                        ctx.shadowBlur = 4;
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    });
                }
            }
            
            yPos += 18;
        });
        
        // Output amount
        ctx.fillStyle = '#666';
        ctx.font = '8px sans-serif';
        ctx.fillText(`→ ${mat.batchSize} units`, x + 12, yPos);
    }
    
    // Price if available
    const price = AppState.marketPrices[mat.id]?.sell;
    if (price) {
        ctx.fillStyle = '#e8d900';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatISK(price), x + w - 12, y + h - 12);
    }
}

function drawChain() {
    if (!AppState.chainLayout) return;
    
    const { nodes, links } = AppState.chainLayout;
    
    // Draw links as simple curved lines without arrows
    links.forEach((link, index) => {
        const from = nodes.find(n => n.id === link.from);
        const to = nodes.find(n => n.id === link.to);
        
        if (from && to) {
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            
            // Add slight curve offset based on link index
            const curveOffset = (index % 2 === 0 ? 10 : -10);
            
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(232, 217, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.moveTo(from.x, from.y);
            ctx.quadraticCurveTo(midX + curveOffset, midY, to.x, to.y);
            ctx.stroke();
        }
    });
    
    // Draw nodes
    nodes.forEach(node => {
        drawChainNode(node);
    });
}

function drawPlanetsView() {
    if (!AppState.chainLayout) return;
    
    const { nodes } = AppState.chainLayout;
    
    // Group nodes by planet type (for P0) or tier
    const planetGroups = {};
    const tierGroups = {};
    
    nodes.forEach(node => {
        if (node.tier === 0 && node.planetTypes.length > 0) {
            node.planetTypes.forEach(pt => {
                if (!planetGroups[pt.type]) {
                    planetGroups[pt.type] = { name: pt.name, color: pt.color, nodes: [] };
                }
                planetGroups[pt.type].nodes.push(node);
            });
        } else {
            const tier = `P${node.tier}`;
            if (!tierGroups[tier]) {
                tierGroups[tier] = { nodes: [] };
            }
            tierGroups[tier].nodes.push(node);
        }
    });
    
    // Draw planet groups
    let yOffset = -300;
    const groupSpacing = 120;
    
    // Planet type groups
    for (const [type, group] of Object.entries(planetGroups)) {
        drawPlanetGroup(group.name, group.color, group.nodes, 0, yOffset);
        yOffset += groupSpacing;
    }
    
    // Tier groups
    for (const [tier, group] of Object.entries(tierGroups)) {
        drawTierGroup(tier, group.nodes, 0, yOffset);
        yOffset += groupSpacing;
    }
}

function drawPlanetGroup(name, color, nodes, x, y) {
    // Group header
    ctx.fillStyle = color;
    ctx.font = 'bold 14px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(name, x, y);
    
    // Draw nodes in this group
    const nodeWidth = 140;
    const nodeHeight = 50;
    const spacing = 10;
    const cols = 4;
    
    nodes.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const nx = x + col * (nodeWidth + spacing);
        const ny = y + 25 + row * (nodeHeight + spacing);
        
        drawCompactNode(node, nx, ny, nodeWidth, nodeHeight, color);
    });
}

function drawTierGroup(tier, nodes, x, y) {
    // Group header
    ctx.fillStyle = '#888';
    ctx.font = 'bold 14px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tier + ' Materials', x, y);
    
    // Draw nodes in this group
    const nodeWidth = 140;
    const nodeHeight = 50;
    const spacing = 10;
    const cols = 4;
    
    const tierColors = { 'P0': '#6e7681', 'P1': '#58a6ff', 'P2': '#d29922', 'P3': '#a371f7', 'P4': '#3fb950' };
    const color = tierColors[tier] || '#666';
    
    nodes.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const nx = x + col * (nodeWidth + spacing);
        const ny = y + 25 + row * (nodeHeight + spacing);
        
        drawCompactNode(node, nx, ny, nodeWidth, nodeHeight, color);
    });
}

function drawCompactNode(node, x, y, w, h, color) {
    // Background
    ctx.fillStyle = 'rgba(40, 40, 40, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    
    // Name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Titillium Web, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    let name = node.name;
    if (name.length > 18) name = name.substring(0, 16) + '...';
    ctx.fillText(name, x + 8, y + 8);
    
    // Tier
    ctx.fillStyle = color;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`P${node.tier}`, x + w - 8, y + 8);
    
    // Price
    const price = AppState.marketPrices[node.materialId]?.sell;
    if (price) {
        ctx.fillStyle = '#e8d900';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatISK(price), x + w - 8, y + h - 8);
    }
}

// Template Builder Drawing
function drawTemplateView() {
    // Draw planet background
    drawPlanetBackground();
    
    // Draw links
    ctx.strokeStyle = 'rgba(232, 217, 0, 0.4)';
    ctx.lineWidth = 2;
    
    AppState.template.links.forEach(link => {
        const from = AppState.template.pins.find(p => p.id === link.from);
        const to = AppState.template.pins.find(p => p.id === link.to);
        
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        }
    });
    
    // Draw pins
    AppState.template.pins.forEach(pin => {
        drawPin(pin);
    });
}

function drawPlanetBackground() {
    const planetType = parseInt(elements.templatePlanetType.value);
    const planetColors = {
        2016: '#a16207', // Barren
        2017: '#14b8a6', // Gas
        2018: '#e0f2fe', // Ice
        2019: '#dc2626', // Lava
        2020: '#0ea5e9', // Oceanic
        2021: '#8b5cf6', // Plasma
        2022: '#6b7280', // Shattered
        2023: '#f59e0b', // Storm
        2024: '#4ade80'  // Temperate
    };
    
    const color = planetColors[planetType] || '#666';
    
    // Draw planet circle
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
    gradient.addColorStop(0, lighten(color, 20));
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, darken(color, 30));
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 400, 0, Math.PI * 2);
    ctx.fill();
    
    // Grid overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    for (let i = -400; i <= 400; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, -400);
        ctx.lineTo(i, 400);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-400, i);
        ctx.lineTo(400, i);
        ctx.stroke();
    }
}

function drawPin(pin) {
    const isSelected = AppState.template.selectedPin?.id === pin.id;
    const facilityColors = {
        command: '#e8d900',
        extractor: '#f97316',
        basic: '#3b82f6',
        advanced: '#8b5cf6',
        hitech: '#ec4899',
        storage: '#6b7280',
        launchpad: '#14b8a6'
    };
    
    const color = facilityColors[pin.type] || '#666';
    const size = 15;
    
    // Pin body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, size, 0, Math.PI * 2);
    ctx.fill();
    
    // Selection highlight
    if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
    } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Pin label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pin.type[0].toUpperCase(), pin.x, pin.y);
}

function addPin(x, y, type) {
    // Check if trying to place a second command center
    if (type === 'command') {
        const hasCommandCenter = AppState.template.pins.some(p => p.type === 'command');
        if (hasCommandCenter) {
            console.log('Cannot place more than one command center');
            return;
        }
    }
    
    // Snap to grid
    const gridSize = 25;
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    
    const pin = {
        id: AppState.template.pins.length + 1,
        x: snappedX,
        y: snappedY,
        type,
        lat: (snappedY / 400) * 1.5708, // Convert to radians
        lon: (snappedX / 400) * 3.14159,
        schematic: null
    };
    
    AppState.template.pins.push(pin);
    draw();
}

function addLink(fromId, toId) {
    // Check if link already exists
    const exists = AppState.template.links.some(
        link => (link.from === fromId && link.to === toId) || 
                (link.from === toId && link.to === fromId)
    );
    
    if (!exists) {
        AppState.template.links.push({ from: fromId, to: toId });
        draw();
    }
}

function findPinAt(x, y) {
    const radius = 20;
    for (let i = AppState.template.pins.length - 1; i >= 0; i--) {
        const pin = AppState.template.pins[i];
        const dx = x - pin.x;
        const dy = y - pin.y;
        if (dx * dx + dy * dy <= radius * radius) {
            return pin;
        }
    }
    return null;
}

function drawChainNode(node) {
    const width = 120;
    const height = 50;
    const x = node.x - width / 2;
    const y = node.y - height / 2;
    
    const tierColors = ['#6e7681', '#58a6ff', '#d29922', '#a371f7', '#3fb950'];
    const color = tierColors[node.tier] || '#666';
    
    // Node background
    ctx.fillStyle = 'rgba(30, 30, 30, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    roundRect(ctx, x, y, width, height, 6);
    ctx.fill();
    ctx.stroke();
    
    // Tier indicator
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 10, y + 10, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Name
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '12px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const name = node.name.length > 14 ? node.name.substring(0, 12) + '...' : node.name;
    ctx.fillText(name, node.x, node.y);
    
    // Price (if available)
    const price = AppState.marketPrices[node.materialId]?.sell;
    if (price) {
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        ctx.fillText(formatISK(price), node.x, node.y + 16);
    }
}

// Utility functions
function roundRect(ctx, x, y, width, height, radius) {
    // Handle array of radii [tl, tr, br, bl]
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

function lighten(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function darken(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function formatISK(value) {
    if (value >= 1000000000) {
        return (value / 1000000000).toFixed(2) + 'B';
    } else if (value >= 1000000) {
        return (value / 1000000).toFixed(2) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(2) + 'K';
    }
    return value.toFixed(2);
}

// Animation loop (for smooth interactions)
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


// Reference Grids Setup
function setupReferenceGrids() {
    // P1 Reference
    const p1Materials = PI_DATA.getMaterialsByTier(1);
    elements.refP1.innerHTML = p1Materials.map(m => `
        <div class="ref-item" data-id="${m.id}" title="${m.name}">${m.name}</div>
    `).join('');
    
    // P2 Reference
    const p2Materials = PI_DATA.getMaterialsByTier(2);
    elements.refP2.innerHTML = p2Materials.map(m => `
        <div class="ref-item" data-id="${m.id}" title="${m.name}">${m.name}</div>
    `).join('');
    
    // P3 Reference
    const p3Materials = PI_DATA.getMaterialsByTier(3);
    elements.refP3.innerHTML = p3Materials.map(m => `
        <div class="ref-item" data-id="${m.id}" title="${m.name}">${m.name}</div>
    `).join('');
    
    // Add click handlers to all ref items
    document.querySelectorAll('.ref-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            selectProduct(id);
        });
    });
}

// System Checker
function setupSystemChecker() {
    elements.checkSystem.addEventListener('click', checkSystem);
    elements.systemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkSystem();
    });
}

async function checkSystem() {
    const systemName = elements.systemInput.value.trim();
    if (!systemName) return;
    
    elements.checkSystem.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    
    try {
        // Search for system
        const searchUrl = `${ESI_BASE}/search/?categories=solar_system&search=${encodeURIComponent(systemName)}&strict=true`;
        const searchRes = await fetch(searchUrl);
        
        if (!searchRes.ok) throw new Error('Search failed');
        const searchData = await searchRes.json();
        
        if (!searchData.solar_system || searchData.solar_system.length === 0) {
            elements.systemPlanets.innerHTML = '<div style="color: var(--danger)">System not found</div>';
            elements.systemResults.classList.remove('hidden');
            elements.checkSystem.innerHTML = '<i class="fas fa-search"></i> Check System';
            return;
        }
        
        const systemId = searchData.solar_system[0];
        
        // Get system planets
        const systemUrl = `${ESI_BASE}/universe/systems/${systemId}/`;
        const systemRes = await fetch(systemUrl);
        
        if (!systemRes.ok) throw new Error('System data failed');
        const systemData = await systemRes.json();
        
        // Get planet types
        const planetTypes = [];
        for (const planetId of systemData.planets || []) {
            try {
                const planetRes = await fetch(`${ESI_BASE}/universe/planets/${planetId}/`);
                if (planetRes.ok) {
                    const planetData = await planetRes.json();
                    const typeRes = await fetch(`${ESI_BASE}/universe/types/${planetData.type_id}/`);
                    if (typeRes.ok) {
                        const typeData = await typeRes.json();
                        const typeName = typeData.name.toLowerCase();
                        
                        // Map to our planet types
                        let mappedType = null;
                        if (typeName.includes('temperate')) mappedType = 'temperate';
                        else if (typeName.includes('barren')) mappedType = 'barren';
                        else if (typeName.includes('oceanic')) mappedType = 'oceanic';
                        else if (typeName.includes('lava')) mappedType = 'lava';
                        else if (typeName.includes('storm')) mappedType = 'storm';
                        else if (typeName.includes('plasma')) mappedType = 'plasma';
                        else if (typeName.includes('gas')) mappedType = 'gas';
                        else if (typeName.includes('ice')) mappedType = 'ice';
                        else if (typeName.includes('shattered')) mappedType = 'shattered';
                        
                        if (mappedType) planetTypes.push(mappedType);
                    }
                }
            } catch (e) {
                // Skip failed planets
            }
        }
        
        displaySystemResults(systemData.name, planetTypes);
        
    } catch (err) {
        console.error('System check failed:', err);
        elements.systemPlanets.innerHTML = '<div style="color: var(--danger)">Error checking system</div>';
        elements.systemResults.classList.remove('hidden');
    }
    
    elements.checkSystem.innerHTML = '<i class="fas fa-search"></i> Check System';
}

function displaySystemResults(systemName, planetTypes) {
    // Display planets
    elements.systemPlanets.innerHTML = `<h4>${systemName} - ${planetTypes.length} Planets</h4>`;
    
    const counts = {};
    planetTypes.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
    });
    
    for (const [type, count] of Object.entries(counts)) {
        const data = PI_DATA.planets[type];
        const planetEl = document.createElement('div');
        planetEl.className = 'system-planet';
        planetEl.style.backgroundColor = data.color;
        planetEl.style.color = type === 'ice' ? '#333' : '#fff';
        planetEl.textContent = count > 1 ? `${count}x` : type[0].toUpperCase();
        planetEl.title = `${data.name} x${count}`;
        elements.systemPlanets.appendChild(planetEl);
    }
    
    // Calculate producible P2/P3
    const availableP0 = new Set();
    planetTypes.forEach(type => {
        const data = PI_DATA.planets[type];
        data.p0Materials.forEach(id => availableP0.add(id));
    });
    
    // Find producible P1
    const producibleP1 = new Set();
    for (const [id, mat] of Object.entries(PI_DATA.materials)) {
        if (mat.tier === 1 && mat.inputs) {
            const inputIds = Object.keys(mat.inputs).map(k => parseInt(k));
            if (inputIds.every(i => availableP0.has(i))) {
                producibleP1.add(parseInt(id));
            }
        }
    }
    
    // Find producible P2 (all inputs must be producible P1 or available P0)
    const producibleP2 = [];
    for (const [id, mat] of Object.entries(PI_DATA.materials)) {
        if (mat.tier === 2 && mat.inputs) {
            const inputIds = Object.keys(mat.inputs).map(k => parseInt(k));
            if (inputIds.every(i => producibleP1.has(i) || availableP0.has(i))) {
                producibleP2.push({ id: parseInt(id), ...mat });
            }
        }
    }
    
    // Find producible P3
    const producibleP3 = [];
    for (const [id, mat] of Object.entries(PI_DATA.materials)) {
        if (mat.tier === 3 && mat.inputs) {
            const inputIds = Object.keys(mat.inputs).map(k => parseInt(k));
            if (inputIds.every(i => producibleP2.some(p => p.id === i) || producibleP1.has(i) || availableP0.has(i))) {
                producibleP3.push({ id: parseInt(id), ...mat });
            }
        }
    }
    
    // Display results
    elements.producibleP2.innerHTML = producibleP2.length > 0 
        ? producibleP2.map(p => `<div class="producible-item p2" data-id="${p.id}">${p.name}</div>`).join('')
        : '<div style="color: var(--muted); font-size: 0.7rem;">No P2 producible locally</div>';
    
    elements.producibleP3.innerHTML = producibleP3.length > 0
        ? producibleP3.map(p => `<div class="producible-item p3" data-id="${p.id}">${p.name}</div>`).join('')
        : '<div style="color: var(--muted); font-size: 0.7rem;">No P3 producible locally</div>';
    
    // Add click handlers
    document.querySelectorAll('.producible-item').forEach(item => {
        item.addEventListener('click', () => {
            selectProduct(parseInt(item.dataset.id));
        });
    });
    
    elements.systemResults.classList.remove('hidden');
}

function selectProduct(id) {
    AppState.targetProduct = id;
    elements.targetProduct.value = id;
    
    // Switch to chain view
    calculateChain();
}

// Update drawChainNode to show amounts and planet types
function drawChainNode(node) {
    const width = 130;
    const height = node.tier === 0 ? 75 : 60; // Taller for P0 to show planets
    const x = node.x - width / 2;
    const y = node.y - height / 2;
    
    const tierColors = ['#6e7681', '#58a6ff', '#d29922', '#a371f7', '#3fb950'];
    const color = tierColors[node.tier] || '#666';
    
    // Node background
    ctx.fillStyle = 'rgba(30, 30, 30, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    roundRect(ctx, x, y, width, height, 6);
    ctx.fill();
    ctx.stroke();
    
    // Tier indicator
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 10, y + 10, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Name
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '11px Titillium Web, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    let name = node.name;
    if (name.length > 16) name = name.substring(0, 14) + '...';
    ctx.fillText(name, node.x, y + 6);
    
    // Amount info
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    
    const mat = PI_DATA.materials[node.materialId];
    if (mat && mat.inputs) {
        const inputQty = Object.values(mat.inputs)[0];
        ctx.fillText(`${inputQty} → ${mat.batchSize} units`, node.x, y + 22);
    }
    
    // Planet types for P0
    if (node.tier === 0 && node.planetTypes.length > 0) {
        ctx.fillStyle = '#777';
        ctx.font = '8px sans-serif';
        ctx.fillText('Found on:', node.x, y + 22);
        
        // Draw planet dots
        const planetSpacing = 14;
        const totalWidth = node.planetTypes.length * planetSpacing;
        const startX = node.x - totalWidth / 2 + planetSpacing / 2;
        
        node.planetTypes.forEach((planet, i) => {
            const px = startX + i * planetSpacing;
            const py = y + 38;
            
            ctx.fillStyle = planet.color;
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // First letter
            ctx.fillStyle = planet.type === 'ice' ? '#333' : '#fff';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(planet.type[0].toUpperCase(), px, py);
        });
    }
    
    // Price
    const price = AppState.marketPrices[node.materialId]?.sell;
    if (price) {
        ctx.fillStyle = '#e8d900';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatISK(price), node.x, y + height - 12);
    }
}
