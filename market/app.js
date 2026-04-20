// EVE Market Browser - Main Application
// Full-featured market browser with category navigation, search, and ESI integration

const ESI_BASE = 'https://esi.evetech.net/latest';
const UNIVERSE_BASE = 'https://esi.evetech.net/universe';

// Global state
const AppState = {
    currentView: 'home',
    currentItem: null,
    currentCategory: null,
    currentRegion: '0',
    favorites: JSON.parse(localStorage.getItem('marketFavorites') || '[]'),
    chart: null,
    allItems: [],
    locationCache: {},
    systemCache: {},
    regionCache: {},
    securityCache: {},
    allRegionIds: null,
    sellSort: { column: 'price', direction: 'asc' },
    buySort: { column: 'price', direction: 'desc' },
    dashboardCharts: {
        marketOverview: null,
        categoryVolume: null
    },
    regionalChart: null,
    priceAlerts: JSON.parse(localStorage.getItem('marketPriceAlerts') || '{}')
};

// Utility functions
function el(id) { return document.getElementById(id); }
function fmt(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n) { return n === null || n ===undefined ? '—' : Number(n).toLocaleString(); }

async function loadPublicMarketTreeFromEveOS() {
    const groupsUrl = 'https://data.eveos.space/sdejsonl/marketGroups.jsonl';
    const typesUrl = 'https://data.eveos.space/sdejsonl/types.jsonl';

    function extractName(value) {
        if (typeof value === 'string') return value.trim();
        if (!value || typeof value !== 'object') return '';
        return (
            value['en-us'] ||
            value['en_us'] ||
            value.enUS ||
            value.en ||
            value.name ||
            ''
        ).toString().trim();
    }

    try {
        const [groupsRes, typesRes] = await Promise.all([fetch(groupsUrl), fetch(typesUrl)]);
        if (!groupsRes.ok || !typesRes.ok) {
            throw new Error(`EVEOS data request failed: groups=${groupsRes.status}, types=${typesRes.status}`);
        }

        const [groupsText, typesText] = await Promise.all([groupsRes.text(), typesRes.text()]);

        const groups = groupsText
            .split(/\r?\n/)
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line); } catch { return null; }
            })
            .filter(Boolean);

        const types = typesText
            .split(/\r?\n/)
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line); } catch { return null; }
            })
            .filter(Boolean);

        const nodes = new Map();

        groups.forEach(group => {
            const id = Number(group._key);
            if (!Number.isFinite(id)) return;

            const name = extractName(group['name_en-us']) || extractName(group.name);
            if (!name) return;

            nodes.set(id, {
                id,
                name,
                parentGroupID: Number.isFinite(Number(group.parentGroupID)) ? Number(group.parentGroupID) : null,
                children: [],
                items: []
            });
        });

        // Build group hierarchy links.
        nodes.forEach(node => {
            if (node.parentGroupID !== null && nodes.has(node.parentGroupID)) {
                nodes.get(node.parentGroupID).children.push(node);
            }
        });

        // Attach item types to their market groups.
        types.forEach(type => {
            const typeId = Number(type._key);
            const groupId = Number(type.marketGroupID);
            if (!Number.isFinite(typeId) || !Number.isFinite(groupId)) return;
            if (!nodes.has(groupId)) return;

            const name = extractName(type['name_en-us']) || extractName(type.name);
            if (!name) return;

            nodes.get(groupId).items.push({ id: typeId, name });
        });

        function sortNode(node) {
            node.children.sort((a, b) => String(a.name).localeCompare(String(b.name)));
            node.items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
            node.children.forEach(sortNode);
        }

        const topLevelNodes = [...nodes.values()]
            .filter(node => node.parentGroupID === null || !nodes.has(node.parentGroupID))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        topLevelNodes.forEach(sortNode);

        const builtTree = {};
        topLevelNodes.forEach(node => {
            builtTree[node.name] = {
                id: node.id,
                name: node.name,
                children: node.children,
                items: node.items
            };
        });

        if (Object.keys(builtTree).length > 0) {
            MarketTree = builtTree;
            console.log(`Loaded MarketTree from EVEOS public data (${Object.keys(builtTree).length} top-level categories)`);
            return true;
        }
    } catch (err) {
        console.warn('Falling back to bundled MarketTree data:', err);
    }

    return false;
}

function formatPrice(n) {
    if (n >= 1000000000) return (n / 1000000000).toFixed(2) + 'B';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    console.log('Initializing Market Browser...');
    
    // Check database availability
    console.log('Types available:', typeof Types !== 'undefined');
    console.log('MarketItems available:', typeof MarketItems !== 'undefined');
    console.log('AllMarketItems available:', typeof AllMarketItems !== 'undefined');
    console.log('SubCategories available:', typeof SubCategories !== 'undefined');
    if (typeof SubCategories !== 'undefined') {
        console.log('SubCategories keys:', Object.keys(SubCategories));
        console.log('blueprints subcat:', SubCategories.blueprints);
    }
    if (typeof AllMarketItems !== 'undefined') {
        console.log('AllMarketItems.blueprints:', AllMarketItems.blueprints);
        console.log('AllMarketItems.blueprints.items count:', AllMarketItems.blueprints?.items?.length || 0);
    }
    
    try {
        // Build all items list for search
        buildAllItemsList();
        console.log(`Built items list with ${AppState.allItems.length} items`);

        // Use the EVE Ref-based MarketTree loaded from market_tree.js
        // (loadPublicMarketTreeFromEveOS disabled to preserve EVE Ref structure)
        
        // Render category tree
        renderCategoryTree();
        
        // Render popular items (now async) - force refresh to clear cache
        await renderPopularItems(true);
        
        // Render favorites on home page
        renderHomeFavorites();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update EVE time
        updateEveTime();
        setInterval(updateEveTime, 1000);
        
        // Load favorites
        updateFavoritesView();
        
        // Check price alerts
        if (Object.keys(AppState.priceAlerts).length > 0) {
            checkPriceAlerts();
        }
        
        // Handle URL routing
        handleRoute();
        
        console.log('Market Browser initialized successfully');
    } catch (err) {
        console.error('Error initializing app:', err);
        showError('Failed to initialize market browser. Check console for details.');
    }
}

// Build flat list of all items for search
function buildAllItemsList() {
    const seen = new Set();
    AppState.allItems = [];
    
    // Use the new AllMarketItems object structure
    if (typeof AllMarketItems !== 'undefined') {
        Object.values(AllMarketItems).forEach(category => {
            if (category.items && Array.isArray(category.items)) {
                category.items.forEach(item => {
                    if (seen.has(item.id)) return;
                    seen.add(item.id);
                    AppState.allItems.push({
                        id: item.id,
                        name: item.name,
                        path: [category.name],
                        searchName: item.name.toLowerCase()
                    });
                });
            }
        });
    }
}

// Render category tree in sidebar - Hierarchical Categories → Groups → Items
function renderCategoryTree() {
    const container = el('categoryTree');
    container.innerHTML = '';
    
    // Build hierarchical structure from SDE data
    const categoryGroups = buildCategoryHierarchy();
    
    if (!categoryGroups || categoryGroups.length === 0) {
        console.error('No category data found');
        container.innerHTML = '<div class="empty-state">No categories available</div>';
        return;
    }
    
    console.log(`Rendering ${categoryGroups.length} top-level categories`);
    
    function getGroupItemCount(group) {
        const ownItems = Array.isArray(group.items) ? group.items.length : 0;
        const childItems = Array.isArray(group.children)
            ? group.children.reduce((sum, child) => sum + getGroupItemCount(child), 0)
            : 0;
        return ownItems + childItems;
    }

    function renderGroupNode(group) {
        const groupEl = document.createElement('div');
        groupEl.className = 'group-item';

        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';

        const totalItemCount = getGroupItemCount(group);
        groupHeader.innerHTML = `
            <i class="fas fa-angle-right toggle"></i>
            <span>${group.name}</span>
            <span class="item-count">${totalItemCount}</span>
        `;

        const groupChildrenContainer = document.createElement('div');
        groupChildrenContainer.className = 'group-children';

        if (Array.isArray(group.children) && group.children.length > 0) {
            group.children.forEach(childGroup => {
                groupChildrenContainer.appendChild(renderGroupNode(childGroup));
            });
        }

        if (Array.isArray(group.items) && group.items.length > 0) {
            const sortedItems = [...group.items].sort((a, b) => a.name.localeCompare(b.name));
            sortedItems.forEach(item => {
                const leaf = document.createElement('div');
                leaf.className = 'category-leaf';
                leaf.dataset.typeId = item.id;
                leaf.dataset.name = item.name;
                leaf.innerHTML = `<span>${item.name}</span>`;
                leaf.addEventListener('click', () => loadItem(item.id, item.name));
                groupChildrenContainer.appendChild(leaf);
            });
        }

        groupHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = groupChildrenContainer.classList.contains('expanded');
            const toggle = groupHeader.querySelector('.toggle');

            if (isExpanded) {
                groupChildrenContainer.classList.remove('expanded');
                toggle.classList.remove('expanded');
            } else {
                groupChildrenContainer.classList.add('expanded');
                toggle.classList.add('expanded');
            }
        });

        groupEl.appendChild(groupHeader);
        groupEl.appendChild(groupChildrenContainer);
        return groupEl;
    }

    categoryGroups.forEach(category => {
        const categoryEl = document.createElement('div');
        categoryEl.className = 'category-item';
        
        // Category header
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <i class="fas fa-caret-right toggle"></i>
            <i class="fas ${category.icon || 'fa-folder'} icon"></i>
            <span>${category.name}</span>
            <span class="group-count">${category.groups?.length || 0}</span>
        `;
        
        const groupsContainer = document.createElement('div');
        groupsContainer.className = 'category-children';
        
        // Add groups as nested sub-categories
        if (Array.isArray(category.groups) && category.groups.length > 0) {
            category.groups.forEach(group => {
                groupsContainer.appendChild(renderGroupNode(group));
            });
        }
        
        // Toggle category expansion
        header.addEventListener('click', () => {
            const isExpanded = groupsContainer.classList.contains('expanded');
            const toggle = header.querySelector('.toggle');
            
            if (isExpanded) {
                groupsContainer.classList.remove('expanded');
                toggle.classList.remove('expanded');
            } else {
                groupsContainer.classList.add('expanded');
                toggle.classList.add('expanded');
            }
        });
        
        categoryEl.appendChild(header);
        categoryEl.appendChild(groupsContainer);
        container.appendChild(categoryEl);
    });
}

// Build hierarchical category structure from MarketCategories with subcategories
function buildCategoryHierarchy() {
    console.log('buildCategoryHierarchy called');
    
    // If MarketTree is available, use SDE market group data
    if (typeof MarketTree !== 'undefined' && MarketTree) {
        console.log('Using MarketTree (SDE market groups)');
        return buildFromMarketTree();
    }
    
    // Fallback to MarketCategories + SubCategories
    if (typeof MarketCategories === 'undefined') {
        console.error('MarketCategories data not available');
        return null;
    }
    
    if (typeof AllMarketItems === 'undefined') {
        console.error('AllMarketItems data not available');
        return null;
    }

    // Map category names to MarketTree keys
    const categoryMapping = {
        'ships': 'Ships',
        'modules': 'Ship Equipment',
        'ammunition_and_charges': 'Ammunition & Charges',
        'drones': 'Drones',
        'implants_and_boosters': 'Implants & Boosters',
        'skills': 'Skills',
        'structures': 'Structures',
        'trade_goods': 'Trade Goods',
        'blueprints': 'Blueprints & Reactions'
    };

    // Use MarketCategories structure with SubCategories for grouping
    const categories = MarketCategories.children.map(category => {
        // If category has a categoryKey, get items from AllMarketItems
        const dataCategory = category.categoryKey && AllMarketItems[category.categoryKey];
        const allItems = dataCategory?.items || [];
        
        // Check if we have subcategory definitions for this category
        const subCatDef = SubCategories && SubCategories[category.categoryKey];
        
        // Debug for blueprints
        if (category.categoryKey === 'blueprints') {
            console.log('DEBUG blueprints categoryKey:', category.categoryKey);
            console.log('DEBUG subCatDef:', subCatDef);
            console.log('DEBUG subCatDef.groups:', subCatDef?.groups);
            console.log('DEBUG allItems.length:', allItems.length);
        }
        
        let groups = [];
        
        if (subCatDef && subCatDef.groups && allItems.length > 0) {
            // Group items by subcategory
            const assignedItems = new Set();
            
            subCatDef.groups.forEach(groupDef => {
                // Find items that match this group's filter (but haven't been assigned yet)
                const groupItems = allItems.filter(item => {
                    if (assignedItems.has(item.id)) return false;
                    const matches = groupDef.filter(item);
                    if (matches) assignedItems.add(item.id);
                    return matches;
                });
                
                // Debug for blueprints
                if (category.categoryKey === 'blueprints') {
                    console.log(`Group ${groupDef.name}: ${groupItems.length} items`);
                    if (groupItems.length === 0 && groupDef.id === 'reaction_formulas') {
                        console.log('Sample items:', allItems.slice(0, 3));
                        console.log('Testing filter on first item:', groupDef.filter(allItems[0]));
                    }
                }
                
                if (groupItems.length > 0 || groupDef.id.includes('other')) {
                    groups.push({
                        id: groupDef.id,
                        name: groupDef.name,
                        items: groupItems
                    });
                }
            });
        } else {
            // No subcategories, put all items in one group
            groups = [{
                id: category.id,
                name: category.name,
                items: allItems
            }];
        }
        
        console.log(`Category ${category.name}: ${allItems.length} items in ${groups.length} groups`);
        
        return {
            id: category.id,
            name: category.name,
            icon: category.icon,
            groups: groups
        };
    });
    
    console.log(`Built ${categories.length} categories`);
    return categories;
}

// Build category hierarchy from SDE MarketTree data
function buildFromMarketTree() {
    const iconRules = [
        { pattern: /ships?/i, icon: 'fa-rocket' },
        { pattern: /equipment|module|modifications?/i, icon: 'fa-cogs' },
        { pattern: /ammunition|charges?/i, icon: 'fa-bullseye' },
        { pattern: /drones?/i, icon: 'fa-dot-circle' },
        { pattern: /implants?|boosters?/i, icon: 'fa-user-plus' },
        { pattern: /skills?/i, icon: 'fa-graduation-cap' },
        { pattern: /structures?|infrastructure/i, icon: 'fa-building' },
        { pattern: /trade|services?/i, icon: 'fa-exchange-alt' },
        { pattern: /blueprints?|reactions?|manufacture|research/i, icon: 'fa-scroll' },
        { pattern: /skins?|personalization|apparel/i, icon: 'fa-palette' }
    ];

    function toCategoryId(name) {
        return String(name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
    }

    function getCategoryIcon(name) {
        const match = iconRules.find(rule => rule.pattern.test(name));
        return match ? match.icon : 'fa-folder';
    }
    
    const categories = [];
    
    Object.keys(MarketTree).forEach(treeKey => {
        const treeCategory = MarketTree[treeKey];
        if (!treeCategory) return;
        
        // Collect all items from this category and its children
        const allItems = [];
        function collectItems(group) {
            if (group.items && group.items.length > 0) {
                allItems.push(...group.items);
            }
            if (group.children) {
                group.children.forEach(child => collectItems(child));
            }
        }
        collectItems(treeCategory);
        
        // Build groups from children (subcategories)
        const groups = [];
        
        function processGroup(group) {
            if (!group || !group.name) return;

            const childNodes = [];
            if (Array.isArray(group.children) && group.children.length > 0) {
                group.children.forEach(child => {
                    const childNode = processGroup(child);
                    if (childNode) childNodes.push(childNode);
                });
            }

            const ownItems = Array.isArray(group.items) ? group.items : [];
            if (ownItems.length === 0 && childNodes.length === 0) return null;

            return {
                id: `group_${group.id}`,
                name: group.name,
                items: ownItems,
                children: childNodes
            };
        }

        // Include direct items under the top-level category, if any
        if (treeCategory.items && treeCategory.items.length > 0) {
            groups.push({
                id: `group_${treeCategory.id}`,
                name: treeKey,
                items: treeCategory.items,
                children: []
            });
        }
        
        // Process all children of this category
        if (treeCategory.children) {
            treeCategory.children.forEach(child => {
                const childNode = processGroup(child);
                if (childNode) groups.push(childNode);
            });
        }
        
        // Check if we have custom SubCategories for this category (e.g., blueprints)
        const categoryMapping = {
            'ships': 'Ships',
            'modules': 'Ship Equipment',
            'ammunition_and_charges': 'Ammunition & Charges',
            'drones': 'Drones',
            'implants_and_boosters': 'Implants & Boosters',
            'skills': 'Skills',
            'structures': 'Structures',
            'trade_goods': 'Trade Goods',
            'blueprints': 'Blueprints & Reactions'
        };
        const categoryKey = Object.keys(categoryMapping).find(key => categoryMapping[key] === treeKey) || toCategoryId(treeKey);
        const subCatDef = SubCategories && SubCategories[categoryKey];
        
        // If we have SubCategories for this category, use AllMarketItems instead of MarketTree items
        if (categoryKey && AllMarketItems && AllMarketItems[categoryKey]) {
            const dbItems = AllMarketItems[categoryKey].items || [];
            if (dbItems.length > 0) {
                allItems.length = 0; // Clear the array
                allItems.push(...dbItems); // Use database items instead
            }
        }
        
        let finalGroups;
        const marketTreeGroups = groups.filter(g => 
            (g.items && g.items.length > 0) || (g.children && g.children.length > 0)
        );
        const useCustomSubCategories = marketTreeGroups.length === 0 && subCatDef && subCatDef.groups && allItems.length > 0;

        if (useCustomSubCategories) {
            // Use SubCategories to group items
            const assignedItems = new Set();
            finalGroups = [];
            
            subCatDef.groups.forEach(groupDef => {
                const groupItems = allItems.filter(item => {
                    if (assignedItems.has(item.id)) return false;
                    const matches = groupDef.filter(item);
                    if (matches) assignedItems.add(item.id);
                    return matches;
                });
                
                if (groupItems.length > 0 || groupDef.id.includes('other')) {
                    finalGroups.push({
                        id: groupDef.id,
                        name: groupDef.name,
                        items: groupItems
                    });
                }
            });
            
            console.log(`Category ${treeKey}: Using SubCategories - ${finalGroups.length} groups with ${finalGroups.reduce((sum, g) => sum + g.items.length, 0)} total items`);
        } else {
            // Use MarketTree groups
            finalGroups = marketTreeGroups;
            
            // Count items recursively including children
            function countAllItems(group) {
                const ownItems = (group.items && group.items.length) || 0;
                const childItems = (group.children && group.children.length > 0)
                    ? group.children.reduce((sum, child) => sum + countAllItems(child), 0)
                    : 0;
                return ownItems + childItems;
            }
            const totalItems = finalGroups.reduce((sum, g) => sum + countAllItems(g), 0);
            
            console.log(`Category ${treeKey}: Using MarketTree - ${finalGroups.length} groups with ${totalItems} total items`);
        }

        categories.push({
            id: toCategoryId(treeKey),
            name: treeKey,
            icon: getCategoryIcon(treeKey),
            groups: finalGroups
        });
    });

    categories.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`Built ${categories.length} categories from MarketTree`);
    return categories;
}

// Render popular items on home page
async function renderPopularItems(forceRefresh = false) {
    const container = el('popularItems');
    container.innerHTML = '';
    
    const items = await fetchPopularItems(forceRefresh);
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        // Use FontAwesome icon for blueprints and SKINs as they don't have EVE image server icons
        const isBlueprint = item.name.toLowerCase().includes('blueprint') || item.name.toLowerCase().includes('reaction formula');
        const isSkin = item.name.toLowerCase().includes('skin');
        const iconHtml = isBlueprint
            ? '<div class="blueprint-icon"><i class="fas fa-scroll"></i></div>'
            : isSkin
            ? '<div class="skin-icon"><i class="fas fa-paint-brush"></i></div>'
            : `<img src="https://images.evetech.net/types/${item.id}/icon?size=64" alt="${item.name}" class="item-icon" onerror="this.style.display='none'" />`;
        card.innerHTML = `
            ${iconHtml}
            <div class="item-name">${item.name}</div>
            <div class="item-category">${item.category}</div>
        `;
        card.addEventListener('click', () => loadItem(item.id, item.name));
        container.appendChild(card);
    });
}

// Fetch high-volume items from ESI
async function fetchPopularItems(forceRefresh = false) {
    try {
        // Check cache first (24 hour cache)
        const cached = localStorage.getItem('popularItemsCache');
        if (cached && !forceRefresh) {
            const { data, timestamp } = JSON.parse(cached);
            const cacheAge = Date.now() - timestamp;
            if (cacheAge < 24 * 60 * 60 * 1000) {
                console.log('Using cached popular items');
                return data;
            }
        }
        
        if (forceRefresh) {
            console.log('Force refresh requested, clearing cache');
            localStorage.removeItem('popularItemsCache');
        } else {
            console.log('No valid cache, fetching fresh data');
        }
        
        // Fetch market history for The Forge (Jita) to find high-volume items
        // We'll check a sample of popular type IDs
        const typeIds = [34, 35, 36, 37, 38, 39, 40, 44, 24692, 22448, 24696, 24695];
        const volumeData = [];
        
        for (const typeId of typeIds) {
            try {
                const historyUrl = `${ESI_BASE}/markets/10000002/history/?type_id=${typeId}`;
                const response = await fetch(historyUrl);
                if (!response.ok) {
                    console.log(`Failed to fetch history for type ${typeId}: ${response.status}`);
                    continue;
                }
                
                const history = await response.json();
                if (history.length > 0) {
                    const last30Days = history.slice(0, 30);
                    const totalVolume = last30Days.reduce((sum, day) => sum + day.volume, 0);
                    const avgPrice = last30Days.reduce((sum, day) => sum + day.average, 0) / last30Days.length;
                    
                    // Find item name
                    const itemName = getItemName(typeId);
                    const category = getItemCategory(typeId);
                    
                    volumeData.push({
                        id: typeId,
                        name: itemName,
                        category: category,
                        volume30d: totalVolume,
                        avgPrice: avgPrice
                    });
                    
                    if (typeId === 29668) {
                        console.log('PLEX data fetched:', { name: itemName, volume: totalVolume });
                    }
                }
            } catch (error) {
                console.error(`Error fetching history for type ${typeId}:`, error);
            }
        }
        
        console.log('Total items fetched:', volumeData.length);
        console.log('Items:', volumeData.map(i => `${i.name} (${i.id})`).join(', '));
        
        // Sort by volume and take top 9 (leave room for PLEX)
        let sortedItems = volumeData.sort((a, b) => b.volume30d - a.volume30d).slice(0, 9);
        
        // Add PLEX as a hardcoded item since it's now in a unified market
        // PLEX (type_id 44992) is no longer in regional markets
        const plexItem = {
            id: 44992,
            name: 'PLEX',
            category: 'Trade Goods',
            volume30d: 0,
            avgPrice: 0
        };
        
        // Add PLEX at the beginning
        sortedItems = [plexItem, ...sortedItems.slice(0, 9)];
        console.log('PLEX added to popular items (hardcoded for unified market)');
        
        // Cache the results
        localStorage.setItem('popularItemsCache', JSON.stringify({
            data: sortedItems,
            timestamp: Date.now()
        }));
        
        return sortedItems;
    } catch (error) {
        console.error('Error fetching popular items:', error);
        // Fallback to hardcoded list
        return PopularItems;
    }
}

function getItemCategory(typeId) {
    for (const category in AllMarketItems) {
        const item = AllMarketItems[category].items.find(i => i.id === parseInt(typeId));
        if (item) return AllMarketItems[category].name;
    }
    return 'Item';
}

// Manufacturing/Blueprint Functions
async function loadManufacturingData(typeId) {
    try {
        const container = el('manufacturingInfo');
        if (!container) return;
        
        container.innerHTML = '<p class="loading-text">Loading manufacturing data...</p>';
        
        // Fetch manufacturing data from Fuzzwork API (CORS-friendly)
        const fuzzworkUrl = `https://www.fuzzwork.co.uk/blueprint/api/blueprint.php?typeid=${typeId}`;
        console.log('Fetching from Fuzzwork:', fuzzworkUrl);
        const response = await fetch(fuzzworkUrl);
        
        if (!response.ok) {
            console.log('Fuzzwork API failed:', response.status);
            container.innerHTML = `
                <div class="no-manufacturing">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Manufacturing data is not available for this item via Fuzzwork.</p>
                    <p class="small-text">Product type ID: ${typeId}</p>
                </div>
            `;
            return;
        }
        
        const fuzzworkData = await response.json();
        console.log('Fuzzwork data:', fuzzworkData);
        
        // Display manufacturing information from Fuzzwork data
        displayFuzzworkManufacturingInfo(fuzzworkData, typeId);
        
    } catch (error) {
        console.error('Error loading manufacturing data:', error);
        const container = el('manufacturingInfo');
        if (container) {
            container.innerHTML = `
                <div class="no-manufacturing">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load manufacturing data.</p>
                </div>
            `;
        }
    }
}

async function findBlueprintType(productTypeId) {
    try {
        console.log('Finding blueprint for type ID:', productTypeId);
        
        // First, check if the current item is already a blueprint
        const currentTypeUrl = `${ESI_BASE}/universe/types/${productTypeId}`;
        const currentResponse = await fetch(currentTypeUrl);
        if (currentResponse.ok) {
            const currentTypeData = await currentResponse.json();
            console.log('Current item name:', currentTypeData.name);
            if (currentTypeData.name.toLowerCase().includes('blueprint')) {
                console.log('Item is already a blueprint');
                return parseInt(productTypeId);
            }
        }
        
        // Search local blueprint data first
        if (typeof AllMarketItems !== 'undefined' && AllMarketItems.blueprints) {
            const productTypeUrl = `${ESI_BASE}/universe/types/${productTypeId}`;
            const productResponse = await fetch(productTypeUrl);
            if (productResponse.ok) {
                const productTypeData = await productResponse.json();
                const productName = productTypeData.name;
                console.log('Product name:', productName);
                
                // Search for blueprint in local data
                const blueprintName = productName + ' Blueprint';
                const blueprint = AllMarketItems.blueprints.items.find(b => b.name === blueprintName);
                
                if (blueprint) {
                    console.log('Found blueprint in local data:', blueprint.id);
                    return blueprint.id;
                }
            }
        }
        
        // Fallback: Try common blueprint type ID patterns
        const attempts = [
            parseInt(productTypeId) + 1,  // Common pattern
            parseInt(productTypeId) - 1,  // Reverse pattern
        ];
        
        for (const blueprintTypeId of attempts) {
            try {
                const typeUrl = `${ESI_BASE}/universe/types/${blueprintTypeId}`;
                const response = await fetch(typeUrl);
                
                if (!response.ok) continue;
                
                const typeData = await response.json();
                
                // Check if this is actually a blueprint
                if (typeData.name.toLowerCase().includes('blueprint')) {
                    console.log('Found blueprint via pattern:', blueprintTypeId);
                    return blueprintTypeId;
                }
            } catch (error) {
                continue;
            }
        }
        
        console.log('No blueprint found');
        return null;
    } catch (error) {
        console.error('Error finding blueprint type:', error);
        return null;
    }
}

function displayManufacturingInfo(blueprintData, productTypeId) {
    const container = el('manufacturingInfo');
    if (!container) return;
    
    const activities = blueprintData.activities;
    if (!activities || !activities.manufacturing) {
        container.innerHTML = `
            <div class="no-manufacturing">
                <i class="fas fa-industry"></i>
                <p>No manufacturing data available for this item.</p>
            </div>
        `;
        return;
    }
    
    const manufacturing = activities.manufacturing;
    const materials = manufacturing.materials || [];
    const products = manufacturing.products || [];
    
    let html = '<div class="manufacturing-section">';
    
    // Display materials required
    if (materials.length > 0) {
        html += '<h4><i class="fas fa-cube"></i> Materials Required</h4>';
        html += '<div class="manufacturing-tree">';
        
        materials.forEach(material => {
            const materialName = getItemName(material.type_id);
            html += `
                <div class="manufacturing-item" onclick="loadItem(${material.type_id}, '${materialName.replace(/'/g, "\\'")}')">
                    <img src="https://images.evetech.net/types/${material.type_id}/icon?size=32" class="manufacturing-item-icon" alt="${materialName}" onerror="this.style.display='none'">
                    <div class="manufacturing-item-info">
                        <div class="manufacturing-item-name">${materialName}</div>
                        <div class="manufacturing-item-quantity">Quantity: ${material.quantity}</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    }
    
    // Display products
    if (products.length > 0) {
        html += '<h4><i class="fas fa-box"></i> Products</h4>';
        html += '<div class="manufacturing-tree">';
        
        products.forEach(product => {
            const productName = getItemName(product.type_id);
            html += `
                <div class="manufacturing-item" onclick="loadItem(${product.type_id}, '${productName.replace(/'/g, "\\'")}')">
                    <img src="https://images.evetech.net/types/${product.type_id}/icon?size=32" class="manufacturing-item-icon" alt="${productName}" onerror="this.style.display='none'">
                    <div class="manufacturing-item-info">
                        <div class="manufacturing-item-name">${productName}</div>
                        <div class="manufacturing-item-quantity">Quantity: ${product.quantity}</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function displayEverefManufacturingInfo(everefData, productTypeId) {
    const container = el('manufacturingInfo');
    if (!container) return;
    
    if (!everefData || !everefData.manufacturing) {
        container.innerHTML = `
            <div class="no-manufacturing">
                <i class="fas fa-industry"></i>
                <p>No manufacturing data available for this item.</p>
            </div>
        `;
        return;
    }
    
    const manufacturingData = everefData.manufacturing;
    const productData = manufacturingData[productTypeId];
    
    if (!productData) {
        container.innerHTML = `
            <div class="no-manufacturing">
                <i class="fas fa-industry"></i>
                <p>No manufacturing data available for this item.</p>
            </div>
        `;
        return;
    }
    
    const materials = productData.materials || {};
    const materialIds = Object.keys(materials);
    
    let html = '<div class="manufacturing-section">';
    
    // Display materials required
    if (materialIds.length > 0) {
        html += '<h4><i class="fas fa-cube"></i> Materials Required</h4>';
        html += '<div class="manufacturing-tree">';
        
        materialIds.forEach(materialId => {
            const material = materials[materialId];
            const materialName = getItemName(material.type_id);
            html += `
                <div class="manufacturing-item" onclick="loadItem(${material.type_id}, '${materialName.replace(/'/g, "\\'")}')">
                    <img src="https://images.evetech.net/types/${material.type_id}/icon?size=32" class="manufacturing-item-icon" alt="${materialName}" onerror="this.style.display='none'">
                    <div class="manufacturing-item-info">
                        <div class="manufacturing-item-name">${materialName}</div>
                        <div class="manufacturing-item-quantity">Quantity: ${material.quantity}</div>
                        ${material.cost ? `<div class="manufacturing-item-cost">Cost: ${formatISK(material.cost)}</div>` : ''}
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Display total cost
        if (productData.total_cost) {
            html += '<div class="manufacturing-summary">';
            html += `<h4><i class="fas fa-coins"></i> Manufacturing Cost Summary</h4>`;
            html += `<div class="cost-row"><span>Total Material Cost:</span> <span>${formatISK(productData.total_material_cost)}</span></div>`;
            html += `<div class="cost-row"><span>Total Job Cost:</span> <span>${formatISK(productData.total_job_cost)}</span></div>`;
            html += `<div class="cost-row total"><span>Total Cost:</span> <span>${formatISK(productData.total_cost)}</span></div>`;
            html += `<div class="cost-row"><span>Cost per Unit:</span> <span>${formatISK(productData.total_cost_per_unit)}</span></div>`;
            html += '</div>';
        }
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function formatISK(value) {
    if (value === undefined || value === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'ISK',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value).replace('ISK', '').trim() + ' ISK';
}

async function displayFuzzworkManufacturingInfo(fuzzworkData, productTypeId) {
    const container = el('manufacturingInfo');
    if (!container) return;
    
    console.log('Parsing Fuzzwork data for product:', productTypeId);
    console.log('activityMaterials:', fuzzworkData.activityMaterials);
    
    if (!fuzzworkData || !fuzzworkData.activityMaterials) {
        container.innerHTML = `
            <div class="no-manufacturing">
                <i class="fas fa-industry"></i>
                <p>No manufacturing data available for this item.</p>
            </div>
        `;
        return;
    }
    
    const activityMaterials = fuzzworkData.activityMaterials;
    console.log('Activity materials keys:', Object.keys(activityMaterials));
    
    // Activity ID 1 is manufacturing - it's an array of materials, not an object with materials property
    let materials = activityMaterials[1] || activityMaterials['1']; // Activity ID 1 is manufacturing
    
    console.log('Materials array:', materials);
    
    if (!materials || materials.length === 0) {
        container.innerHTML = `
            <div class="no-manufacturing">
                <i class="fas fa-industry"></i>
                <p>No manufacturing data available for this item.</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="manufacturing-section">';
    
    // Display blueprint information
    if (fuzzworkData.blueprintDetails) {
        const blueprintDetails = fuzzworkData.blueprintDetails;
        console.log('Blueprint details:', blueprintDetails);
        
        // Search for blueprint in local data
        let blueprintTypeId = null;
        if (typeof AllMarketItems !== 'undefined' && AllMarketItems.blueprints) {
            const productName = blueprintDetails.productTypeName || getItemName(productTypeId);
            const blueprintName = productName + ' Blueprint';
            console.log('Searching for blueprint:', blueprintName);
            
            // Try exact match
            let blueprint = AllMarketItems.blueprints.items.find(b => b.name === blueprintName);
            if (blueprint) {
                blueprintTypeId = blueprint.id;
                console.log('Found blueprint with exact match:', blueprintTypeId, blueprintName);
            } else {
                // Try case-insensitive search
                blueprint = AllMarketItems.blueprints.items.find(b => b.name.toLowerCase() === blueprintName.toLowerCase());
                if (blueprint) {
                    blueprintTypeId = blueprint.id;
                    console.log('Found blueprint with case-insensitive search:', blueprintTypeId, blueprint.name);
                } else {
                    // Try partial match - blueprint name contains product name
                    blueprint = AllMarketItems.blueprints.items.find(b => b.name.toLowerCase().includes(productName.toLowerCase()) && b.name.toLowerCase().includes('blueprint'));
                    if (blueprint) {
                        blueprintTypeId = blueprint.id;
                        console.log('Found blueprint with partial match:', blueprintTypeId, blueprint.name);
                    } else {
                        console.log('Blueprint not found in local data, trying ESI search API...');
                        // Try to get blueprint type ID from ESI search
                        try {
                            // Try with full blueprint name first
                            let searchUrl = `https://esi.evetech.net/latest/search/?categories=inventory_type&search=${encodeURIComponent(blueprintName)}&strict=false`;
                            let searchResponse = await fetch(searchUrl);
                            if (searchResponse.ok) {
                                const searchData = await searchResponse.json();
                                if (searchData.inventory_type && searchData.inventory_type.length > 0) {
                                    blueprintTypeId = searchData.inventory_type[0];
                                    console.log('Found blueprint via ESI search:', blueprintTypeId);
                                } else {
                                    // Try searching for just the product name to see if there's a blueprint
                                    searchUrl = `https://esi.evetech.net/latest/search/?categories=inventory_type&search=${encodeURIComponent(productName)}&strict=false`;
                                    searchResponse = await fetch(searchUrl);
                                    if (searchResponse.ok) {
                                        const searchData = await searchResponse.json();
                                        if (searchData.inventory_type && searchData.inventory_type.length > 0) {
                                            // Filter for blueprints
                                            for (const typeId of searchData.inventory_type) {
                                                const typeResponse = await fetch(`https://esi.evetech.net/latest/universe/types/${typeId}/`);
                                                if (typeResponse.ok) {
                                                    const typeData = await typeResponse.json();
                                                    if (typeData.name.toLowerCase().includes('blueprint')) {
                                                        blueprintTypeId = typeId;
                                                        console.log('Found blueprint via product name search:', blueprintTypeId, typeData.name);
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            } else {
                                console.log('ESI search returned non-OK response:', searchResponse.status);
                            }
                        } catch (e) {
                            console.log('ESI search API call failed:', e);
                        }
                    }
                }
            }
        }
        
        if (blueprintTypeId) {
            const blueprintName = getItemName(blueprintTypeId);
            const isFav = AppState.favorites.some(f => f.id === blueprintTypeId);
            html += '<h4><i class="fas fa-file-blueprint"></i> Blueprint Required</h4>';
            html += '<div class="manufacturing-tree">';
            html += `
                <div class="manufacturing-item" onclick="loadItem(${blueprintTypeId}, '${blueprintName.replace(/'/g, "\\'")}')">
                    <img src="https://images.evetech.net/types/${blueprintTypeId}/icon?size=32" class="manufacturing-item-icon" alt="${blueprintName}" onerror="this.style.display='none'">
                    <div class="manufacturing-item-info">
                        <div class="manufacturing-item-name">${blueprintName}</div>
                        <div class="manufacturing-item-quantity">Blueprint</div>
                    </div>
                    <button class="manufacturing-item-fav ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavoriteById(${blueprintTypeId}, '${blueprintName.replace(/'/g, "\\'")}')" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                        <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
                    </button>
                </div>
            `;
            html += '</div>';
        } else {
            // Blueprint not found - might be invention-only
            html += '<h4><i class="fas fa-file-blueprint"></i> Blueprint Required</h4>';
            html += '<div class="no-manufacturing">';
            html += '<p>Blueprint not available on market (invention-only or not tradable)</p>';
            html += '</div>';
        }
    }
    
    // Display materials required
    html += '<h4><i class="fas fa-cube"></i> Materials Required</h4>';
    html += '<div class="manufacturing-tree">';
    
    materials.forEach(material => {
        console.log('Material:', material);
        if (!material.typeid) return; // Skip materials with undefined typeid
        
        const materialName = getItemName(material.typeid);
        const isFav = AppState.favorites.some(f => f.id === material.typeid);
        html += `
            <div class="manufacturing-item" onclick="loadItem(${material.typeid}, '${materialName.replace(/'/g, "\\'")}')">
                <img src="https://images.evetech.net/types/${material.typeid}/icon?size=32" class="manufacturing-item-icon" alt="${materialName}" onerror="this.style.display='none'">
                <div class="manufacturing-item-info">
                    <div class="manufacturing-item-name">${materialName}</div>
                    <div class="manufacturing-item-quantity">Quantity: ${material.quantity}</div>
                </div>
                <button class="manufacturing-item-fav ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavoriteById(${material.typeid}, '${materialName.replace(/'/g, "\\'")}')" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                    <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
                </button>
            </div>
        `;
    });
    
    html += '</div>';
    html += '</div>';
    console.log('Generated HTML:', html);
    container.innerHTML = html;
}

// Render favorites on home page
function renderHomeFavorites() {
    const container = el('homeFavorites');
    const emptyState = el('homeFavoritesEmpty');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    if (AppState.favorites.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    container.style.display = 'grid';
    emptyState.style.display = 'none';
    
    AppState.favorites.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        // Use FontAwesome icon for blueprints and SKINs as they don't have EVE image server icons
        const isBlueprint = item.name.toLowerCase().includes('blueprint') || item.name.toLowerCase().includes('reaction formula');
        const isSkin = item.name.toLowerCase().includes('skin');
        const iconHtml = isBlueprint
            ? '<div class="blueprint-icon"><i class="fas fa-scroll"></i></div>'
            : isSkin
            ? '<div class="skin-icon"><i class="fas fa-paint-brush"></i></div>'
            : `<img src="https://images.evetech.net/types/${item.id}/icon?size=64" alt="${item.name}" class="item-icon" onerror="this.style.display='none'" />`;
        card.innerHTML = `
            ${iconHtml}
            <div class="item-name">${item.name}</div>
            <div class="item-category">${item.category || 'Item'}</div>
        `;
        card.addEventListener('click', () => loadItem(item.id, item.name));
        container.appendChild(card);
    });
}

// Setup all event listeners
function setupEventListeners() {
    // Sidebar toggle
    el('toggleSidebar')?.addEventListener('click', toggleSidebar);
    
    // Search suggestions
    el('globalSearch')?.addEventListener('input', handleSearchInput);
    el('globalSearch')?.addEventListener('focus', handleSearchInput);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar-search')) {
            el('searchSuggestions')?.classList.add('hidden');
        }
    });
    
    // Category tree expand/collapse
    el('expandAll')?.addEventListener('click', () => {
        document.querySelectorAll('.category-children').forEach(el => el.classList.add('expanded'));
        document.querySelectorAll('.toggle').forEach(el => el.classList.add('expanded'));
    });
    
    el('collapseAll')?.addEventListener('click', () => {
        document.querySelectorAll('.category-children').forEach(el => el.classList.remove('expanded'));
        document.querySelectorAll('.toggle').forEach(el => el.classList.remove('expanded'));
    });
    
    // Dashboard link
    el('dashboardLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadDashboard();
    });
    
    // Favorites link
    el('favoritesLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        showView('favorites');
    });
    
    // Enable notifications button
    el('enableNotifications')?.addEventListener('click', () => {
        if (!('Notification' in window)) {
            alert('This browser does not support desktop notifications');
            return;
        }
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                alert('Notifications enabled! You will receive price alerts for your favorite items.');
                el('enableNotifications').textContent = '✓ Notifications Enabled';
                el('enableNotifications').disabled = true;
            } else {
                alert('Notification permission denied. You will not receive price alerts.');
            }
        });
    });
    
    // Region selector
    el('regionSelect')?.addEventListener('change', (e) => {
        AppState.currentRegion = e.target.value;
        if (AppState.currentItem) {
            loadItem(AppState.currentItem.id, AppState.currentItem.name);
        }
    });
    
    // Breadcrumb home link - now navigates to main site, no special handler needed
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Time range buttons
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (AppState.currentItem) {
                loadHistory(AppState.currentItem.id, parseInt(btn.dataset.range));
            }
        });
    });
    
    // Order filters
    el('minQtyFilter')?.addEventListener('input', debounce(() => {
        if (AppState.currentItem && AppState.currentItem.orders) {
            renderOrders(AppState.currentItem.orders);
        }
    }, 300));
    
    el('systemFilter')?.addEventListener('change', () => {
        if (AppState.currentItem && AppState.currentItem.orders) {
            renderOrders(AppState.currentItem.orders);
        }
    });
    
    el('securityFilter')?.addEventListener('change', () => {
        if (AppState.currentItem && AppState.currentItem.orders) {
            renderOrders(AppState.currentItem.orders);
        }
    });
    
    el('orderTypeFilter')?.addEventListener('change', () => {
        if (AppState.currentItem && AppState.currentItem.orders) {
            renderOrders(AppState.currentItem.orders);
        }
    });
    
    // Refresh button
    el('refreshOrders')?.addEventListener('click', () => {
        if (AppState.currentItem) {
            loadItem(AppState.currentItem.id, AppState.currentItem.name, true);
        }
    });
    
    // Favorite button
    el('favoriteBtn')?.addEventListener('click', toggleFavorite);
    
    // Share button
    el('shareBtn')?.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            showMessage('Link copied to clipboard');
        });
    });
    
    // Window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            el('sidebar')?.classList.remove('open');
        }
    });
    
    // Popstate for routing
    window.addEventListener('popstate', handleRoute);
}

// Calculate search relevance score for an item
function calculateRelevance(item, query) {
    const name = item.searchName;
    const queryLower = query.toLowerCase();
    const nameLower = name.toLowerCase();
    
    // Exact match - highest priority
    if (nameLower === queryLower) return 1000;
    
    // Starts with query - high priority
    if (nameLower.startsWith(queryLower)) return 500;
    
    // Word boundary match (e.g., "Disintegrator" matches "Disintegrator Specialization")
    const words = nameLower.split(/[\s\-_]+/);
    for (const word of words) {
        if (word === queryLower) return 400;
        if (word.startsWith(queryLower)) return 300;
    }
    
    // Contains query as substring
    if (nameLower.includes(queryLower)) return 200;
    
    // Fuzzy match - each character in query appears in order
    let queryIndex = 0;
    for (let i = 0; i < nameLower.length && queryIndex < queryLower.length; i++) {
        if (nameLower[i] === queryLower[queryIndex]) {
            queryIndex++;
        }
    }
    if (queryIndex === queryLower.length) return 100;
    
    // No match
    return 0;
}

// Handle search input with suggestions
function handleSearchInput() {
    const input = el('globalSearch');
    const suggestions = el('searchSuggestions');
    const query = input.value.trim();
    
    if (query.length < 2) {
        suggestions.classList.add('hidden');
        return;
    }
    
    const queryLower = query.toLowerCase();
    
    // Score and sort all items by relevance
    const scored = AppState.allItems
        .map(item => ({
            ...item,
            score: calculateRelevance(item, queryLower)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50); // Show up to 50 results for comprehensive search
    
    if (scored.length === 0) {
        suggestions.classList.add('hidden');
        return;
    }
    
    // Highlight matching parts
    suggestions.innerHTML = scored.map(item => {
        return `
            <div class="suggestion-item ${item.score >= 1000 ? 'exact-match' : ''}" data-type-id="${item.id}" data-name="${item.name}">
                <div class="suggestion-text">
                    <span class="suggestion-name">${item.name}</span>
                    <span class="suggestion-type">${item.path[0]}</span>
                </div>
            </div>
        `;
    }).join('');
    
    suggestions.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const typeId = parseInt(item.dataset.typeId);
            const name = item.dataset.name;
            input.value = '';
            suggestions.classList.add('hidden');
            loadItem(typeId, name);
        });
    });
    
    suggestions.classList.remove('hidden');
}

// Highlight matching text in search results
function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// Escape special regex characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Toggle sidebar on mobile
function toggleSidebar() {
    el('sidebar').classList.toggle('open');
}

// Switch between views
function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    el(viewName + 'View')?.classList.remove('hidden');
    AppState.currentView = viewName;
    
    // Update URL
    if (viewName === 'home') {
        history.pushState({}, '', window.location.pathname);
    }
}

// Switch tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.add('hidden');
    });
    el(tabName + 'Tab')?.classList.remove('hidden');

    // Load regional comparison data when regional tab is selected
    if (tabName === 'regional' && AppState.currentItem) {
        loadRegionalComparison(AppState.currentItem.id);
    }

    // Load manufacturing data when manufacturing tab is selected
    if (tabName === 'manufacturing' && AppState.currentItem) {
        loadManufacturingData(AppState.currentItem.id);
    }
}

// Load item details
async function loadItem(typeId, name, forceRefresh = false) {
    const loadingMessage = (AppState.currentRegion === '0' || AppState.currentRegion === 'major')
        ? (AppState.currentRegion === '0' ? 'Loading market data from all regions in New Eden...' : 'Loading market data from major trade hubs...') 
        : 'Loading market data...';
    showLoading(loadingMessage);
    
    // Clear manufacturing tab when loading a new item
    const manufacturingContainer = el('manufacturingInfo');
    if (manufacturingContainer) {
        manufacturingContainer.innerHTML = '';
    }
    
    // Reload manufacturing data if manufacturing tab is currently active
    const manufacturingTab = el('manufacturingTab');
    if (manufacturingTab && !manufacturingTab.classList.contains('hidden')) {
        // Manufacturing tab is visible, reload data for new item
        setTimeout(() => {
            loadManufacturingData(typeId);
        }, 100);
    }
    
    try {
        console.log(`Loading item ${name} (ID: ${typeId}) in region ${AppState.currentRegion}`);
        
        // Update state
        AppState.currentItem = { id: typeId, name: name };
        
        // Update URL
        const url = `?type=${typeId}&region=${AppState.currentRegion}`;
        history.pushState({ typeId, region: AppState.currentRegion }, '', url);
        
        // Show item view
        showView('item');
        
        // Update header
        el('itemName').textContent = name;
        el('itemTypeId').textContent = `Type ID: ${typeId}`;
        
        // Update item icon
        const itemIconEl = el('itemIcon');
        // Use FontAwesome icon for blueprints and SKINs as they don't have EVE image server icons
        const isBlueprintItem = name.toLowerCase().includes('blueprint') || name.toLowerCase().includes('reaction formula');
        const isSkinItem = name.toLowerCase().includes('skin');
        if (isBlueprintItem) {
            itemIconEl.innerHTML = `<div class="blueprint-icon-large"><i class="fas fa-scroll"></i></div>`;
        } else if (isSkinItem) {
            itemIconEl.innerHTML = `<div class="skin-icon-large"><i class="fas fa-paint-brush"></i></div>`;
        } else {
            itemIconEl.innerHTML = `<img src="https://images.evetech.net/types/${typeId}/icon?size=128" alt="${name}" onerror="this.style.display='none'" />`;
        }
        
        // Check if favorite
        updateFavoriteButton();
        
        // Fetch data with individual error handling
        let itemData = null;
        let orders = [];
        let historyData = [];
        
        try {
            itemData = await fetchItemData(typeId);
            console.log('Item data fetched:', itemData);
        } catch (e) {
            console.error('Failed to fetch item data:', e.message || e);
        }
        
        try {
            orders = await fetchOrdersForItem(typeId, AppState.currentRegion);
            console.log(`Fetched ${orders.length} orders`);
        } catch (e) {
            console.error('Failed to fetch orders:', e.message || e);
        }
        
        try {
            let region;
            if (typeId === 44992) {
                // PLEX uses global market region 19000001
                region = '19000001';
            } else {
                region = (AppState.currentRegion === '0' || AppState.currentRegion === 'major') ? '10000002' : AppState.currentRegion;
            }
            historyData = await fetchHistory(region, typeId, 30);
            console.log(`Fetched ${historyData.length} history entries`);
        } catch (e) {
            console.error('Failed to fetch history:', e.message || e);
        }
        
        // Store orders
        AppState.currentItem.orders = orders;
        AppState.currentItem.history = historyData;
        
        // Update category badge
        const itemInfo = AppState.allItems.find(i => i.id === typeId);
        el('itemCategory').textContent = itemInfo?.path[0] || 'Unknown';
        
        // Check if we got any data
        const hasData = itemData || orders.length > 0 || historyData.length > 0;
        const hasOrders = orders.length > 0;
        
        if (!hasData) {
            // No data available - item might not exist in ESI or not be tradeable
            showNoDataMessage(typeId, name);
        } else if (!hasOrders) {
            // Item exists but no market orders
            showNoOrdersMessage(typeId, name);
        }
        
        // Render market summary
        renderMarketSummary(orders, historyData);
        
        // Render orders
        renderOrders(orders);
        
        // Render chart
        renderChart(historyData);
        
        // Render details
        renderDetails(itemData, historyData);
        
        // Update breadcrumb
        updateBreadcrumb(name);
        
        console.log('Item loaded successfully');
        
    } catch (err) {
        console.error('Error loading item:', err);
        console.error('Error details:', err.message, err.stack);
        showError('Failed to load market data. Please try again.');
    } finally {
        hideLoading();
    }
}

// Fetch item data from ESI
async function fetchItemData(typeId) {
    try {
        const url = `${ESI_BASE}/universe/types/${typeId}/`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`fetchItemData failed: ${res.status} for type ${typeId}`);
            return null;
        }
        return res.json();
    } catch (err) {
        console.error(`fetchItemData error for type ${typeId}:`, err);
        return null;
    }
}

// Fetch orders for an item
async function fetchOrdersForItem(typeId, region) {
    const allOrders = [];
    
    // PLEX (44992) uses the global PLEX market (region 19000001)
    if (typeId === 44992) {
        try {
            const orders = await fetchOrders('19000001', typeId);
            orders.forEach(o => {
                o.region_name = 'Global PLEX Market';
            });
            allOrders.push(...orders);
        } catch (err) {
            console.warn(`Failed to fetch PLEX global market:`, err.message || err);
        }
        return allOrders;
    }
    
    if (region === 'major') {
        // Fetch from major trade hub regions (fast)
        const regions = ['10000002', '10000043', '10000032', '10000030', '10000042'];
        console.log(`Fetching market data from ${regions.length} major trade hubs...`);
        
        for (const regionId of regions) {
            try {
                const orders = await fetchOrders(regionId, typeId);
                if (orders.length > 0) {
                    const regionName = await getRegionName(regionId);
                    orders.forEach(o => {
                        o.region_name = regionName;
                        o.region_id = regionId;
                    });
                    allOrders.push(...orders);
                }
            } catch (err) {
                console.warn(`Failed to fetch region ${regionId}:`, err.message || err);
            }
        }
        console.log(`Fetched ${allOrders.length} total orders from major hubs`);
    } else if (region === '0') {
        // Fetch from all regions in New Eden
        const regions = await getAllRegionIds();
        console.log(`Fetching market data from ${regions.length} regions...`);
        
        // Update loading message with progress
        const loadingEl = document.querySelector('.loading-message');
        if (loadingEl) {
            loadingEl.textContent = `Scanning ${regions.length} regions for market data...`;
        }
        
        // Fetch orders from all regions in large parallel batches for speed
        const batchSize = 50; // Increased from 10 for much faster loading
        let processedCount = 0;
        
        for (let i = 0; i < regions.length; i += batchSize) {
            const batch = regions.slice(i, i + batchSize);
            const promises = batch.map(async regionId => {
                try {
                    const orders = await fetchOrders(regionId, typeId);
                    if (orders.length > 0) {
                        const regionName = await getRegionName(regionId);
                        orders.forEach(o => {
                            o.region_name = regionName;
                            o.region_id = regionId;
                        });
                        return orders;
                    }
                    return [];
                } catch (err) {
                    // Silently skip failed regions for speed
                    return [];
                }
            });
            
            const batchResults = await Promise.all(promises);
            batchResults.forEach(orders => allOrders.push(...orders));
            
            // Update progress
            processedCount += batch.length;
            if (loadingEl) {
                loadingEl.textContent = `Found ${allOrders.length} orders across ${processedCount}/${regions.length} regions...`;
            }
        }
        console.log(`Fetched ${allOrders.length} total orders from ${regions.length} regions`);
    } else {
        const orders = await fetchOrders(region, typeId);
        allOrders.push(...orders);
    }
    
    return allOrders;
}

// Fetch orders from ESI
async function fetchOrders(region, typeId) {
    const all = [];
    const maxPages = 50;
    
    try {
        const firstUrl = `${ESI_BASE}/markets/${region}/orders/?page=1&type_id=${typeId}`;
        console.log(`Fetching orders from ${firstUrl}`);
        let r = await fetch(firstUrl);
        
        if (!r.ok) {
            throw new Error(`Orders fetch failed: ${r.status} ${r.statusText}`);
        }
        
        let chunk = await r.json();
        if (chunk && chunk.length) all.push(...chunk);
        
        let totalPages = parseInt(r.headers.get('x-pages') || '1', 10) || 1;
        if (totalPages > maxPages) totalPages = maxPages;
        
        for (let p = 2; p <= totalPages; p++) {
            const url = `${ESI_BASE}/markets/${region}/orders/?page=${p}&type_id=${typeId}`;
            r = await fetch(url);
            if (!r.ok) break;
            chunk = await r.json();
            if (!chunk || chunk.length === 0) break;
            all.push(...chunk);
        }
    } catch (err) {
        console.error(`fetchOrders error for region ${region}, type ${typeId}:`, err.message || err);
        throw err;
    }
    
    return all;
}

// Fetch history from ESI
async function fetchHistory(region, typeId, days) {
    try {
        const url = `${ESI_BASE}/markets/${region}/history/?type_id=${typeId}`;
        console.log(`Fetching history from ${url}`);
        const r = await fetch(url);
        if (!r.ok) {
            console.warn(`History fetch failed: ${r.status} for region ${region}, type ${typeId}`);
            return [];
        }
        const data = await r.json();
        return data.slice(-days);
    } catch (err) {
        console.error(`fetchHistory error:`, err.message || err);
        return [];
    }
}

// Fetch all region IDs from ESI
async function getAllRegionIds() {
    // Return cached value if available
    if (AppState.allRegionIds) {
        return AppState.allRegionIds;
    }
    
    try {
        const url = `${ESI_BASE}/universe/regions/`;
        console.log(`Fetching all region IDs from ${url}`);
        const r = await fetch(url);
        if (!r.ok) {
            throw new Error(`Failed to fetch regions: ${r.status}`);
        }
        const regionIds = await r.json();
        
        // Filter out wormhole space and other non-market regions
        // ESI returns all regions including J-space which don't have markets
        AppState.allRegionIds = regionIds.filter(id => id < 11000000);
        console.log(`Found ${AppState.allRegionIds.length} market regions`);
        return AppState.allRegionIds;
    } catch (err) {
        console.error(`getAllRegionIds error:`, err.message || err);
        // Fallback to major trade hubs if fetch fails
        return [10000002, 10000043, 10000032, 10000030, 10000042];
    }
}

// Get region name by ID (with caching)
async function getRegionName(regionId) {
    // Check cache first
    if (AppState.regionCache[regionId]) {
        return AppState.regionCache[regionId];
    }
    
    // Check hardcoded regions
    if (Regions[regionId]) {
        AppState.regionCache[regionId] = Regions[regionId];
        return Regions[regionId];
    }
    
    // Fetch from ESI
    try {
        const url = `${ESI_BASE}/universe/regions/${regionId}/`;
        const r = await fetch(url);
        if (!r.ok) {
            throw new Error(`Failed to fetch region ${regionId}`);
        }
        const data = await r.json();
        AppState.regionCache[regionId] = data.name;
        return data.name;
    } catch (err) {
        console.error(`getRegionName error for ${regionId}:`, err.message || err);
        return `Region ${regionId}`;
    }
}

// Get system security status (cached)
async function getSystemSecurity(systemId) {
    // Check cache first
    if (AppState.securityCache[systemId] !== undefined) {
        return AppState.securityCache[systemId];
    }
    
    try {
        const url = `${ESI_BASE}/universe/systems/${systemId}/`;
        const r = await fetch(url);
        if (!r.ok) {
            throw new Error(`Failed to fetch system ${systemId}`);
        }
        const data = await r.json();
        const security = data.security_status;
        AppState.securityCache[systemId] = security;
        return security;
    } catch (err) {
        console.error(`getSystemSecurity error for ${systemId}:`, err.message || err);
        // Default to null sec if we can't determine
        AppState.securityCache[systemId] = -1;
        return -1;
    }
}

// Render market summary cards
function renderMarketSummary(orders, history) {
    const sells = orders.filter(o => !o.is_buy_order).sort((a, b) => a.price - b.price);
    const buys = orders.filter(o => o.is_buy_order).sort((a, b) => b.price - a.price);
    
    const bestSell = sells[0];
    const bestBuy = buys[0];
    
    // Check if viewing PLEX (global market)
    const isPlex = AppState.currentItem?.id === 44992;
    const showRegion = (AppState.currentRegion === '0' || AppState.currentRegion === 'major') && !isPlex;
    
    // Best sell
    el('bestSellPrice').textContent = bestSell ? formatPrice(bestSell.price) + ' ISK' : '—';
    if (bestSell && showRegion && bestSell.region_name) {
        el('bestSellLocation').textContent = `${bestSell.region_name} - Loading location...`;
    } else {
        el('bestSellLocation').textContent = bestSell 
            ? (isPlex ? 'Global Market' : 'Loading location...') 
            : 'No sell orders';
    }
    
    // Best buy
    el('bestBuyPrice').textContent = bestBuy ? formatPrice(bestBuy.price) + ' ISK' : '—';
    if (bestBuy && showRegion && bestBuy.region_name) {
        el('bestBuyLocation').textContent = `${bestBuy.region_name} - Loading location...`;
    } else {
        el('bestBuyLocation').textContent = bestBuy 
            ? (isPlex ? 'Global Market' : 'Loading location...') 
            : 'No buy orders';
    }
    
    // Spread
    if (bestSell && bestBuy) {
        const spread = bestSell.price - bestBuy.price;
        const spreadPct = (spread / bestBuy.price) * 100;
        el('priceSpread').textContent = formatPrice(spread) + ' ISK';
        el('spreadNote').textContent = `${spreadPct.toFixed(2)}% margin`;
    } else {
        el('priceSpread').textContent = '—';
        el('spreadNote').textContent = 'Insufficient data';
    }
    
    // Volume
    if (history && history.length) {
        const totalVol = history.reduce((s, h) => s + (h.volume || 0), 0);
        const avg = history.reduce((s, h) => s + (h.average || 0), 0) / history.length;
        el('volume30d').textContent = fmtInt(totalVol);
        el('avgPrice30d').textContent = 'Avg: ' + formatPrice(avg) + ' ISK';
    } else {
        el('volume30d').textContent = '—';
        el('avgPrice30d').textContent = 'Avg: —';
    }
    
    // Resolve locations (skip for PLEX since it uses global market)
    if (!isPlex) {
        if (bestSell) {
            resolveLocation(bestSell.location_id, (locationName) => {
                const element = el('bestSellLocation');
                if (element) {
                    if (showRegion && bestSell.region_name) {
                        element.textContent = `${bestSell.region_name} - ${locationName}`;
                    } else {
                        element.textContent = locationName;
                    }
                }
            });
        }
        if (bestBuy) {
            resolveLocation(bestBuy.location_id, (locationName) => {
                const element = el('bestBuyLocation');
                if (element) {
                    if (showRegion && bestBuy.region_name) {
                        element.textContent = `${bestBuy.region_name} - ${locationName}`;
                    } else {
                        element.textContent = locationName;
                    }
                }
            });
        }
    }
}

// Resolve location ID to name
async function resolveLocation(locationId, elementIdOrCallback) {
    // Check cache first
    if (AppState.locationCache[locationId]) {
        const name = AppState.locationCache[locationId];
        if (typeof elementIdOrCallback === 'string') {
            const element = el(elementIdOrCallback);
            if (element) element.textContent = name;
        } else if (typeof elementIdOrCallback === 'function') {
            elementIdOrCallback(name);
        }
        return name;
    }
    
    let name = null;
    
    try {
        // Try station first (NPC stations)
        let url = `${ESI_BASE}/universe/stations/${locationId}/`;
        let r = await fetch(url);
        
        if (r.ok) {
            const data = await r.json();
            name = data.name;
            AppState.locationCache[locationId] = name;
            
            if (typeof elementIdOrCallback === 'string') {
                const element = el(elementIdOrCallback);
                if (element) element.textContent = name;
            } else if (typeof elementIdOrCallback === 'function') {
                elementIdOrCallback(name);
            }
            return name;
        }
        
        // Try structure (player-owned structures) - only if not a player citadel
        // Note: Player citadels (IDs >= 10^12) require auth and will always fail for public data
        // Outposts (IDs < 10^12) might be accessible, so we try those
        if (locationId < 1000000000000) {
            url = `${ESI_BASE}/universe/structures/${locationId}/`;
            r = await fetch(url);
            
            if (r.ok) {
                const data = await r.json();
                name = data.name;
                AppState.locationCache[locationId] = name;
                
                if (typeof elementIdOrCallback === 'string') {
                    const element = el(elementIdOrCallback);
                    if (element) element.textContent = name;
                } else if (typeof elementIdOrCallback === 'function') {
                    elementIdOrCallback(name);
                }
                return name;
            }
        }
        
        // If both fail, use fallback identification
        // Determine structure type based on ID range
        if (locationId < 60000000) {
            // Could be POCO, Mobile Depot, or other small structure
            name = `Structure ${locationId}`;
        } else if (locationId >= 1000000000000) {
            // Player-owned citadel/structure (requires auth to get name)
            name = `#${locationId.toString().slice(-6)}`;
        } else {
            // Unknown location type
            name = `Location ${locationId}`;
        }

    } catch (err) {
        console.warn(`Failed to resolve location ${locationId}:`, err.message || err);

        // Better fallback based on ID range
        if (locationId < 60000000) {
            name = `Structure ${locationId}`;
        } else if (locationId >= 1000000000000) {
            name = `#${locationId.toString().slice(-6)}`;
        } else {
            name = `Location ${locationId}`;
        }
    }
    
    // Cache the fallback name
    if (!name) {
        name = `Unknown ${locationId}`;
    }
    AppState.locationCache[locationId] = name;
    
    if (typeof elementIdOrCallback === 'string') {
        const element = el(elementIdOrCallback);
        if (element) element.textContent = name;
    } else if (typeof elementIdOrCallback === 'function') {
        elementIdOrCallback(name);
    }
    
    return name;
}

// Resolve location with system information
async function resolveLocationWithSystem(locationId, systemId, callback) {
    // Check cache first
    if (AppState.locationCache[locationId]) {
        if (callback) callback(AppState.locationCache[locationId]);
        return AppState.locationCache[locationId];
    }
    
    let locationName = null;
    let systemName = null;
    
    try {
        // Try to resolve the location (station or structure)
        // Try station first (NPC stations)
        let url = `${ESI_BASE}/universe/stations/${locationId}/`;
        let r = await fetch(url);
        
        if (r.ok) {
            const data = await r.json();
            locationName = data.name;
        } else if (locationId < 1000000000000) {
            // Try structure (will likely fail without auth for outposts)
            // Skip player citadels (IDs >= 10^12) as they always require auth
            url = `${ESI_BASE}/universe/structures/${locationId}/`;
            r = await fetch(url);
            
            if (r.ok) {
                const data = await r.json();
                locationName = data.name;
            }
        }
        
        // If location couldn't be resolved but we have a system, fetch system name
        if (!locationName && systemId) {
            // Check system cache first
            if (AppState.systemCache[systemId]) {
                systemName = AppState.systemCache[systemId];
            } else {
                const sysUrl = `${ESI_BASE}/universe/systems/${systemId}/`;
                const sysR = await fetch(sysUrl);
                
                if (sysR.ok) {
                    const sysData = await sysR.json();
                    systemName = sysData.name;
                    AppState.systemCache[systemId] = systemName;
                }
            }
            
            if (systemName) {
                // Create a descriptive name based on location ID range
                if (locationId < 60000000) {
                    locationName = `Structure ${locationId} (${systemName})`;
                } else if (locationId >= 1000000000000) {
                    locationName = `${systemName}`;
                } else {
                    locationName = `Location ${locationId} (${systemName})`;
                }
            }
        }
        
    } catch (err) {
        console.warn(`Failed to resolve location ${locationId} with system ${systemId}:`, err.message || err);
    }
    
    // Final fallback
    if (!locationName) {
        if (locationId < 60000000) {
            locationName = `Structure ${locationId}`;
        } else if (locationId >= 1000000000000) {
            locationName = `#${locationId.toString().slice(-6)}`;
        } else {
            locationName = `Location ${locationId}`;
        }
    }
    
    // Cache the result
    AppState.locationCache[locationId] = locationName;
    
    if (callback) callback(locationName);
    return locationName;
}

// Sort orders based on column and direction
function sortOrders(orders, column, direction, isBuyOrders = false) {
    const sorted = [...orders];
    const dir = direction === 'asc' ? 1 : -1;
    
    sorted.sort((a, b) => {
        let valA, valB;
        
        switch (column) {
            case 'price':
                valA = a.price;
                valB = b.price;
                break;
            case 'qty':
                valA = a.volume_remain;
                valB = b.volume_remain;
                break;
            case 'type':
                // Sort NPC first (true = 1), then Player (false = 0)
                valA = (a.location_id >= 60000000 && a.location_id < 64000000) ? 1 : 0;
                valB = (b.location_id >= 60000000 && b.location_id < 64000000) ? 1 : 0;
                break;
            case 'location':
                valA = AppState.locationCache[a.location_id] || '';
                valB = AppState.locationCache[b.location_id] || '';
                return dir * valA.localeCompare(valB);
            case 'expires':
                valA = a.duration;
                valB = b.duration;
                break;
            case 'range':
                valA = a.range === 'station' ? 0 : parseInt(a.range);
                valB = b.range === 'station' ? 0 : parseInt(b.range);
                break;
            default:
                valA = a.price;
                valB = b.price;
        }
        
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
    
    return sorted;
}

// Handle column header click for sorting
function handleSortClick(tableType, column) {
    const stateKey = tableType === 'sell' ? 'sellSort' : 'buySort';
    const currentSort = AppState[stateKey];
    
    // Toggle direction if clicking same column, otherwise default to asc for qty/location/expires, desc for price
    let newDirection;
    if (currentSort.column === column) {
        newDirection = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        newDirection = column === 'price' && tableType === 'buy' ? 'desc' : 'asc';
    }
    
    AppState[stateKey] = { column, direction: newDirection };
    
    // Re-render orders if we have them
    if (AppState.currentItem?.orders) {
        renderOrders(AppState.currentItem.orders);
    }
}

// Update sort header UI
function updateSortHeaders() {
    // Update sell table headers
    document.querySelectorAll('#sellOrdersTable th').forEach(th => {
        const column = th.dataset.sort;
        if (!column) return;
        
        th.classList.remove('sort-asc', 'sort-desc');
        if (AppState.sellSort.column === column) {
            th.classList.add(`sort-${AppState.sellSort.direction}`);
        }
        
        th.style.cursor = 'pointer';
        th.onclick = () => handleSortClick('sell', column);
    });
    
    // Update buy table headers
    document.querySelectorAll('#buyOrdersTable th').forEach(th => {
        const column = th.dataset.sort;
        if (!column) return;
        
        th.classList.remove('sort-asc', 'sort-desc');
        if (AppState.buySort.column === column) {
            th.classList.add(`sort-${AppState.buySort.direction}`);
        }
        
        th.style.cursor = 'pointer';
        th.onclick = () => handleSortClick('buy', column);
    });
}

// Render orders tables
async function renderOrders(orders) {
    const minQty = parseInt(el('minQtyFilter')?.value || 0);
    const selectedSystem = el('systemFilter')?.value || 'all';
    const orderType = el('orderTypeFilter')?.value || 'all';
    const securityFilter = el('securityFilter')?.value || 'all';
    
    // Pre-fetch security status for all unique systems if security filter is active
    if (securityFilter !== 'all') {
        const uniqueSystems = [...new Set(orders.map(o => o.system_id).filter(Boolean))];
        await Promise.all(uniqueSystems.map(systemId => getSystemSecurity(systemId)));
    }
    
    // Separate and apply filters
    let sells = orders.filter(o => {
        if (o.is_buy_order) return false;
        if (o.volume_remain < minQty) return false;
        
        // System filter
        if (selectedSystem !== 'all') {
            const locationName = AppState.locationCache[o.location_id] || '';
            if (!locationName.includes(selectedSystem)) return false;
        }
        
        // NPC/Player filter - NPC stations are in range 60000000-64000000
        const isNPC = o.location_id >= 60000000 && o.location_id < 64000000;
        if (orderType === 'npc' && !isNPC) return false;
        if (orderType === 'player' && isNPC) return false;
        
        // Security filter
        if (securityFilter !== 'all' && o.system_id) {
            const security = AppState.securityCache[o.system_id];
            if (security !== undefined) {
                if (securityFilter === 'highsec' && security < 0.5) return false;
                if (securityFilter === 'lowsec' && (security < 0.1 || security >= 0.5)) return false;
                if (securityFilter === 'nullsec' && security > 0.0) return false;
            }
        }
        
        return true;
    });
    
    let buys = orders.filter(o => {
        if (!o.is_buy_order) return false;
        if (o.volume_remain < minQty) return false;
        
        // System filter
        if (selectedSystem !== 'all') {
            const locationName = AppState.locationCache[o.location_id] || '';
            if (!locationName.includes(selectedSystem)) return false;
        }
        
        // NPC/Player filter - NPC stations are in range 60000000-64000000
        const isNPC = o.location_id >= 60000000 && o.location_id < 64000000;
        if (orderType === 'npc' && !isNPC) return false;
        if (orderType === 'player' && isNPC) return false;
        
        // Security filter
        if (securityFilter !== 'all' && o.system_id) {
            const security = AppState.securityCache[o.system_id];
            if (security !== undefined) {
                if (securityFilter === 'highsec' && security < 0.5) return false;
                if (securityFilter === 'lowsec' && (security < 0.1 || security >= 0.5)) return false;
                if (securityFilter === 'nullsec' && security > 0.0) return false;
            }
        }
        
        return true;
    });
    
    // Apply sorting
    sells = sortOrders(sells, AppState.sellSort.column, AppState.sellSort.direction, false);
    buys = sortOrders(buys, AppState.buySort.column, AppState.buySort.direction, true);
    
    // Update counts
    el('sellCount').textContent = `${sells.length} orders`;
    el('buyCount').textContent = `${buys.length} orders`;
    
    // Check if viewing PLEX (global market item)
    const isPlex = AppState.currentItem?.id === 44992;
    const showRegion = (AppState.currentRegion === '0' || AppState.currentRegion === 'major') && !isPlex; // Show region when viewing all regions
    
    // Render sell orders
    const sellBody = el('sellOrdersBody');
    sellBody.innerHTML = sells.slice(0, 50).map(o => {
        // For PLEX global market, all orders are player orders
        // For other items: NPC stations are 60000000-64000000
        const isNPC = !isPlex && (o.location_id >= 60000000 && o.location_id < 64000000);
        const npcBadge = isNPC ? '<span class="npc-badge" title="NPC Station">NPC</span>' : '<span class="player-badge" title="Player Structure">Player</span>';
        const locationCell = isPlex 
            ? '<td class="location-cell"><span class="location-name" title="PLEX can be traded from anywhere in New Eden">Global Market</span></td>'
            : `<td class="location-cell" data-location="${o.location_id}" data-system="${o.system_id || ''}">
                ${showRegion && o.region_name ? `<div class="region-name" style="font-size: 0.85em; color: #888; margin-bottom: 2px;">${o.region_name}</div>` : ''}
                <span class="location-name">${AppState.locationCache[o.location_id] || 'Loading...'}</span>
            </td>`;
        return `
        <tr>
            <td class="price">${formatPrice(o.price)}</td>
            <td>${fmtInt(o.volume_remain)}</td>
            <td class="type-cell">${npcBadge}</td>
            ${locationCell}
            <td>${formatDuration(o.duration)}</td>
        </tr>
    `;
    }).join('');
    
    // Render buy orders
    const buyBody = el('buyOrdersBody');
    buyBody.innerHTML = buys.slice(0, 50).map(o => {
        // For PLEX global market, all orders are player orders
        // For other items: NPC stations are 60000000-64000000
        const isNPC = !isPlex && (o.location_id >= 60000000 && o.location_id < 64000000);
        const npcBadge = isNPC ? '<span class="npc-badge" title="NPC Station">NPC</span>' : '<span class="player-badge" title="Player Structure">Player</span>';
        const locationCell = isPlex 
            ? '<td class="location-cell"><span class="location-name" title="PLEX can be traded from anywhere in New Eden">Global Market</span></td>'
            : `<td class="location-cell" data-location="${o.location_id}" data-system="${o.system_id || ''}">
                ${showRegion && o.region_name ? `<div class="region-name" style="font-size: 0.85em; color: #888; margin-bottom: 2px;">${o.region_name}</div>` : ''}
                <span class="location-name">${AppState.locationCache[o.location_id] || 'Loading...'}</span>
            </td>`;
        return `
        <tr>
            <td class="price">${formatPrice(o.price)}</td>
            <td>${fmtInt(o.volume_remain)}</td>
            <td class="type-cell">${npcBadge}</td>
            ${locationCell}
            <td>${o.range === 'station' ? 'Station' : o.range + ' jumps'}</td>
        </tr>
    `;
    }).join('');
    
    // Resolve locations (skip cells without data-location, e.g., PLEX global market)
    [...sellBody.querySelectorAll('.location-cell'), ...buyBody.querySelectorAll('.location-cell')].forEach(cell => {
        // Skip if no data-location (e.g., PLEX global market)
        if (!cell.dataset.location) return;
        
        const locationId = parseInt(cell.dataset.location);
        const systemId = parseInt(cell.dataset.system);
        const locationSpan = cell.querySelector('.location-name');
        if (!locationSpan) return;
        
        if (AppState.locationCache[locationId]) {
            locationSpan.textContent = AppState.locationCache[locationId];
        } else {
            resolveLocationWithSystem(locationId, systemId, (name) => {
                locationSpan.textContent = name;
            });
        }
    });
    
    // Update sort headers
    updateSortHeaders();
    
    // Update system filter options
    updateSystemFilter(orders);
}

// Update system filter dropdown
function updateSystemFilter(orders) {
    const filter = el('systemFilter');
    const currentValue = filter.value;
    
    const systems = new Set();
    orders.forEach(o => {
        if (AppState.locationCache[o.location_id]) {
            systems.add(AppState.locationCache[o.location_id]);
        }
    });
    
    // Build filter with major trade hubs first
    filter.innerHTML = '<option value="all">All Systems</option>';
    
    // Add major trade hub separators
    const majorHubs = [
        { value: 'Jita', label: 'Jita (The Forge)' },
        { value: 'Amarr', label: 'Amarr (Domain)' },
        { value: 'Dodixie', label: 'Dodixie (Sinq Laison)' },
        { value: 'Rens', label: 'Rens (Heimatar)' },
        { value: 'Hek', label: 'Hek (Metropolis)' }
    ];
    
    majorHubs.forEach(hub => {
        const option = document.createElement('option');
        option.value = hub.value;
        option.textContent = hub.label;
        filter.appendChild(option);
    });
    
    // Add separator if there are other systems
    if (systems.size > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '───────────────';
        filter.appendChild(separator);
    }
    
    // Add other systems found in orders
    [...systems].sort().forEach(system => {
        // Skip if it's already in the major hubs
        const systemName = system.split(' - ')[0]; // Get system name before station
        const isHub = majorHubs.some(hub => systemName.includes(hub.value));
        if (!isHub) {
            const option = document.createElement('option');
            option.value = system;
            option.textContent = system;
            filter.appendChild(option);
        }
    });
    
    filter.value = currentValue;
}

// Format duration
function formatDuration(days) {
    if (days === 1) return '1 day';
    return days + ' days';
}

// Render price chart
function renderChart(history) {
    const ctx = el('priceChart')?.getContext('2d');
    if (!ctx || !history || history.length === 0) return;
    
    if (AppState.chart) {
        AppState.chart.destroy();
    }
    
    const labels = history.map(h => h.date.substring(5)); // MM-DD
    const avgData = history.map(h => h.average);
    const highData = history.map(h => h.highest);
    const lowData = history.map(h => h.lowest);
    
    AppState.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Average',
                    data: avgData,
                    borderColor: '#ff8c3d',
                    backgroundColor: 'rgba(255, 140, 61, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'High',
                    data: highData,
                    borderColor: '#4caf50',
                    borderDash: [5, 5],
                    tension: 0.3,
                    pointRadius: 0
                },
                {
                    label: 'Low',
                    data: lowData,
                    borderColor: '#f44336',
                    borderDash: [5, 5],
                    tension: 0.3,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9aa6b2', font: { size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9aa6b2', callback: v => formatPrice(v) }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#9aa6b2', usePointStyle: true }
                },
                tooltip: {
                    backgroundColor: 'rgba(13, 17, 23, 0.95)',
                    titleColor: '#e6eef6',
                    bodyColor: '#9aa6b2',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1
                }
            }
        }
    });
    
    // Render history stats
    renderHistoryStats(history);
}

// Render history statistics
function renderHistoryStats(history) {
    const stats = el('historyStats');
    if (!history || history.length === 0) {
        stats.innerHTML = '';
        return;
    }
    
    const prices = history.map(h => h.average);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const totalVol = history.reduce((s, h) => s + h.volume, 0);
    const avgVol = totalVol / history.length;
    
    stats.innerHTML = `
        <div class="history-stat">
            <div class="stat-label">Lowest Price</div>
            <div class="stat-value">${formatPrice(min)}</div>
        </div>
        <div class="history-stat">
            <div class="stat-label">Highest Price</div>
            <div class="stat-value">${formatPrice(max)}</div>
        </div>
        <div class="history-stat">
            <div class="stat-label">Average Price</div>
            <div class="stat-value">${formatPrice(avg)}</div>
        </div>
        <div class="history-stat">
            <div class="stat-label">Avg Daily Volume</div>
            <div class="stat-value">${fmtInt(avgVol)}</div>
        </div>
    `;
}

// Render item details
function renderDetails(itemData, history) {
    const details = el('itemDetails');
    const metrics = el('marketMetrics');
    
    if (itemData) {
        details.innerHTML = `
            <dt>Name</dt><dd>${itemData.name}</dd>
            <dt>Type ID</dt><dd>${itemData.type_id}</dd>
            <dt>Group ID</dt><dd>${itemData.group_id}</dd>
            ${itemData.volume ? `<dt>Volume</dt><dd>${itemData.volume} m³</dd>` : ''}
            ${itemData.packaged_volume ? `<dt>Packaged</dt><dd>${itemData.packaged_volume} m³</dd>` : ''}
        `;
    } else {
        details.innerHTML = '<dt>Item data unavailable</dt><dd>—</dd>';
    }
    
    if (history && history.length) {
        const prices = history.map(h => h.average);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const totalVol = history.reduce((s, h) => s + h.volume, 0);
        const orderCount = history.reduce((s, h) => s + h.order_count, 0);
        
        metrics.innerHTML = `
            <dt>Price Range (30d)</dt><dd>${formatPrice(min)} - ${formatPrice(max)}</dd>
            <dt>Total Volume (30d)</dt><dd>${fmtInt(totalVol)}</dd>
            <dt>Avg Order Count</dt><dd>${Math.round(orderCount / history.length)}</dd>
            <dt>Volatility</dt><dd>${((max - min) / min * 100).toFixed(2)}%</dd>
        `;
    } else {
        metrics.innerHTML = '<dt>No market history</dt><dd>—</dd>';
    }
}

// Toggle favorite
function toggleFavorite() {
    if (!AppState.currentItem) return;
    
    const index = AppState.favorites.findIndex(f => f.id === AppState.currentItem.id);
    
    if (index === -1) {
        AppState.favorites.push({
            id: AppState.currentItem.id,
            name: AppState.currentItem.name,
            added: new Date().toISOString()
        });
        showMessage('Added to favorites');
    } else {
        AppState.favorites.splice(index, 1);
        showMessage('Removed from favorites');
    }
    
    localStorage.setItem('marketFavorites', JSON.stringify(AppState.favorites));
    updateFavoriteButton();
    updateFavoritesView();
    renderHomeFavorites();
}

function toggleFavoriteById(id, name) {
    const index = AppState.favorites.findIndex(f => f.id === id);
    
    if (index === -1) {
        AppState.favorites.push({
            id: id,
            name: name,
            added: new Date().toISOString()
        });
        showMessage('Added to favorites');
    } else {
        AppState.favorites.splice(index, 1);
        showMessage('Removed from favorites');
    }
    
    localStorage.setItem('marketFavorites', JSON.stringify(AppState.favorites));
    updateFavoritesView();
    renderHomeFavorites();
    
    // Refresh manufacturing view if it's currently displayed
    const container = el('manufacturingInfo');
    if (container && container.innerHTML.length > 0) {
        const currentTypeId = AppState.currentItem?.id;
        if (currentTypeId) {
            loadManufacturingData(currentTypeId);
        }
    }
}

// Update favorite button state
function updateFavoriteButton() {
    const btn = el('favoriteBtn');
    const isFav = AppState.favorites.some(f => f.id === AppState.currentItem?.id);
    
    btn.classList.toggle('active', isFav);
    btn.innerHTML = isFav ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
}

// Update favorites view
function updateFavoritesView() {
    const container = el('favoritesList');
    
    if (AppState.favorites.length === 0) {
        container.innerHTML = '<p class="empty-state">No favorite items yet. Click the star icon on any item to add it here.</p>';
        renderHomeFavorites();
        return;
    }
    
    const alerts = AppState.priceAlerts || {};
    
    container.innerHTML = '<div class="item-grid">' + 
        AppState.favorites.map(fav => {
            const itemAlerts = alerts[fav.id] || {};
            return `
            <div class="item-card" data-id="${fav.id}" data-name="${fav.name}">
                <div class="item-name">${fav.name}</div>
                <button class="remove-fav" data-id="${fav.id}"><i class="fas fa-times"></i></button>
                <div class="favorite-item-alerts">
                    <div class="alert-inputs">
                        <div class="alert-input-group">
                            <label>Sell Above:</label>
                            <input type="number" class="alert-input" data-id="${fav.id}" data-type="sellAbove" placeholder="—" value="${itemAlerts.sellAbove || ''}" step="0.01">
                        </div>
                        <div class="alert-input-group">
                            <label>Sell Below:</label>
                            <input type="number" class="alert-input" data-id="${fav.id}" data-type="sellBelow" placeholder="—" value="${itemAlerts.sellBelow || ''}" step="0.01">
                        </div>
                        <div class="alert-input-group">
                            <label>Buy Above:</label>
                            <input type="number" class="alert-input" data-id="${fav.id}" data-type="buyAbove" placeholder="—" value="${itemAlerts.buyAbove || ''}" step="0.01">
                        </div>
                        <div class="alert-input-group">
                            <label>Buy Below:</label>
                            <input type="number" class="alert-input" data-id="${fav.id}" data-type="buyBelow" placeholder="—" value="${itemAlerts.buyBelow || ''}" step="0.01">
                        </div>
                    </div>
                </div>
            </div>
        `;
        }).join('') + '</div>';
    
    // Add click handlers
    container.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.remove-fav') || e.target.classList.contains('alert-input')) return;
            loadItem(parseInt(card.dataset.id), card.dataset.name);
        });
    });
    
    // Add remove handlers
    container.querySelectorAll('.remove-fav').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            AppState.favorites = AppState.favorites.filter(f => f.id !== id);
            localStorage.setItem('marketFavorites', JSON.stringify(AppState.favorites));
            updateFavoritesView();
            updateFavoriteButton();
        });
    });
    
    // Add alert input handlers
    container.querySelectorAll('.alert-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const typeId = e.target.dataset.id;
            const alertType = e.target.dataset.type;
            const value = e.target.value;
            
            if (value) {
                savePriceAlert(typeId, alertType, value);
            } else {
                removePriceAlert(typeId, alertType);
            }
        });
    });
    
    // Update home page favorites
    renderHomeFavorites();
}

// Update breadcrumb
function updateBreadcrumb(itemName) {
    const breadcrumb = el('breadcrumb');
    breadcrumb.innerHTML = `
        <span class="breadcrumb-item"><a href="https://www.rustybot.co.uk/market/index.html">Home</a></span>
        <span class="breadcrumb-item"><a href="#">${AppState.allItems.find(i => i.id === AppState.currentItem?.id)?.path[0] || 'Market'}</a></span>
        <span class="breadcrumb-item"><a href="#">${itemName}</a></span>
    `;
}

// Handle URL routing
function handleRoute() {
    const params = new URLSearchParams(window.location.search);
    const typeId = params.get('type');
    const region = params.get('region');
    
    if (region) {
        AppState.currentRegion = region;
        el('regionSelect').value = region;
    }
    
    if (typeId) {
        const name = AppState.allItems.find(i => i.id === parseInt(typeId))?.name || 'Unknown Item';
        loadItem(parseInt(typeId), name);
    } else {
        showView('home');
    }
}

// Load history for different time ranges
async function loadHistory(typeId, days) {
    showLoading('Loading history...');
    
    try {
        let region;
        if (typeId === 44992) {
            // PLEX uses global market region 19000001
            region = '19000001';
        } else {
            region = (AppState.currentRegion === '0' || AppState.currentRegion === 'major') ? '10000002' : AppState.currentRegion;
        }
        const history = await fetchHistory(region, typeId, days);
        renderChart(history);
    } catch (err) {
        console.error('Error loading history:', err);
    } finally {
        hideLoading();
    }
}

// Update EVE time display
function updateEveTime() {
    const now = new Date();
    const timeStr = now.toISOString().substring(11, 19) + ' UTC';
    const el_time = el('sidebarEveTime');
    if (el_time) el_time.textContent = timeStr;
}

// Show/hide loading
function showLoading(text = 'Loading...') {
    const overlay = el('loadingOverlay');
    el('loadingText').textContent = text;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    el('loadingOverlay').classList.add('hidden');
}

// Show message
function showMessage(text) {
    const area = el('messageArea');
    area.textContent = text;
    area.classList.remove('hidden');
    setTimeout(() => area.classList.add('hidden'), 3000);
}

// Show error
function showError(text) {
    showMessage('Error: ' + text);
}

// Show message when item has no market data (might not exist in ESI)
function showNoDataMessage(typeId, name) {
    const ordersTab = el('ordersTab');
    const historyTab = el('historyTab');
    
    const message = `
        <div class="no-data-message">
            <i class="fas fa-exclamation-circle"></i>
            <h3>No Market Data Available</h3>
            <p>The item "${name}" (Type ID: ${typeId}) doesn't appear to have market data.</p>
            <p>This could mean:</p>
            <ul>
                <li>The item ID doesn't exist in EVE's database</li>
                <li>The item is not tradeable on the market</li>
                <li>The item is a skillbook or blueprint that can't be sold</li>
            </ul>
        </div>
    `;
    
    if (ordersTab) {
        ordersTab.innerHTML = message;
        ordersTab.classList.remove('hidden');
    }
    
    if (historyTab) {
        historyTab.innerHTML = '<p class="no-data-note">Price history unavailable</p>';
    }
}

// Show message when item exists but has no active orders
function showNoOrdersMessage(typeId, name) {
    const sellBody = el('sellOrdersBody');
    const buyBody = el('buyOrdersBody');
    
    const message = `
        <tr>
            <td colspan="4" class="no-orders-message">
                <i class="fas fa-info-circle"></i>
                No active orders for this item in the selected region.
                <br><small>Try selecting "All Regions" or check back later.</small>
            </td>
        </tr>
    `;
    
    if (sellBody) sellBody.innerHTML = message;
    if (buyBody) buyBody.innerHTML = message;
}

// Debounce utility
function debounce(fn, ms) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
    };
}

// Dashboard Functions
async function loadDashboard() {
    console.log('Loading dashboard...');
    showView('dashboard');
    
    // Load dashboard data
    await loadTrendingItems();
    await loadDashboardCharts();
}

async function loadTrendingItems() {
    try {
        // Get popular items for trending
        const popularItems = PopularItems || [];
        
        // Top gainers (placeholder - would need historical data)
        const gainersContainer = el('topGainers');
        if (gainersContainer && popularItems.length > 0) {
            gainersContainer.innerHTML = popularItems.slice(0, 5).map((item, index) => `
                <div class="trend-item" onclick="loadItem(${item.id}, '${item.name.replace(/'/g, "\\'")}')">
                    <div class="trend-item-info">
                        <div class="trend-item-name">${item.name}</div>
                        <div class="trend-item-category">${item.category}</div>
                    </div>
                    <div class="trend-item-change positive">
                        <div class="trend-item-value">+${(Math.random() * 10 + 1).toFixed(2)}%</div>
                        <div class="trend-item-label">24h</div>
                    </div>
                </div>
            `).join('');
        }
        
        // Top losers (placeholder)
        const losersContainer = el('topLosers');
        if (losersContainer && popularItems.length > 0) {
            losersContainer.innerHTML = popularItems.slice(5, 10).map((item, index) => `
                <div class="trend-item" onclick="loadItem(${item.id}, '${item.name.replace(/'/g, "\\'")}')">
                    <div class="trend-item-info">
                        <div class="trend-item-name">${item.name}</div>
                        <div class="trend-item-category">${item.category}</div>
                    </div>
                    <div class="trend-item-change negative">
                        <div class="trend-item-value">-${(Math.random() * 5 + 1).toFixed(2)}%</div>
                        <div class="trend-item-label">24h</div>
                    </div>
                </div>
            `).join('');
        }
        
        // Most traded by volume (placeholder)
        const volumeContainer = el('topVolume');
        if (volumeContainer && popularItems.length > 0) {
            volumeContainer.innerHTML = popularItems.slice(0, 5).map((item, index) => `
                <div class="trend-item" onclick="loadItem(${item.id}, '${item.name.replace(/'/g, "\\'")}')">
                    <div class="trend-item-info">
                        <div class="trend-item-name">${item.name}</div>
                        <div class="trend-item-category">${item.category}</div>
                    </div>
                    <div class="trend-item-change">
                        <div class="trend-item-value">${fmtInt(Math.floor(Math.random() * 1000000 + 100000))}</div>
                        <div class="trend-item-label">24h Vol</div>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading trending items:', error);
    }
}

async function loadDashboardCharts() {
    try {
        // Market Overview Chart
        const overviewCtx = el('marketOverviewChart');
        if (overviewCtx && !AppState.dashboardCharts.marketOverview) {
            AppState.dashboardCharts.marketOverview = new Chart(overviewCtx, {
                type: 'line',
                data: {
                    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
                    datasets: [{
                        label: 'Market Activity',
                        data: [65, 59, 80, 81, 56, 55, 72],
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
        
        // Category Volume Chart
        const categoryCtx = el('categoryVolumeChart');
        if (categoryCtx && !AppState.dashboardCharts.categoryVolume) {
            const categories = Object.keys(AllMarketItems);
            const categoryData = categories.map(cat => ({
                name: AllMarketItems[cat].name,
                count: AllMarketItems[cat].items.length
            })).sort((a, b) => b.count - a.count).slice(0, 10);
            
            AppState.dashboardCharts.categoryVolume = new Chart(categoryCtx, {
                type: 'bar',
                data: {
                    labels: categoryData.map(d => d.name),
                    datasets: [{
                        label: 'Item Count',
                        data: categoryData.map(d => d.count),
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading dashboard charts:', error);
    }
}

async function loadRegionalComparison(typeId) {
    try {
        const regions = [
            { id: 10000002, name: 'The Forge (Jita)' },
            { id: 10000043, name: 'Domain (Amarr)' },
            { id: 10000032, name: 'Sinq Laison (Dodixie)' },
            { id: 10000030, name: 'Heimatar (Rens)' },
            { id: 10000042, name: 'Metropolis (Hek)' }
        ];

        const regionalData = [];
        
        for (const region of regions) {
            try {
                // Fetch orders for this region
                const ordersUrl = `${ESI_BASE}/markets/${region.id}/orders/?type_id=${typeId}`;
                const response = await fetch(ordersUrl);
                if (!response.ok) continue;
                
                const orders = await response.json();
                
                const sellOrders = orders.filter(o => o.is_buy_order === false);
                const buyOrders = orders.filter(o => o.is_buy_order === true);
                
                const bestSell = sellOrders.length > 0 ? Math.min(...sellOrders.map(o => o.price)) : null;
                const bestBuy = buyOrders.length > 0 ? Math.max(...buyOrders.map(o => o.price)) : null;
                
                // Fetch history for average price
                const historyUrl = `${ESI_BASE}/markets/${region.id}/history/?type_id=${typeId}`;
                const historyResponse = await fetch(historyUrl);
                let avgPrice = null;
                let totalVolume = 0;
                
                if (historyResponse.ok) {
                    const history = await historyResponse.json();
                    if (history.length > 0) {
                        const thirtyDays = history.slice(0, 30);
                        const totalAvg = thirtyDays.reduce((sum, day) => sum + day.average, 0);
                        avgPrice = totalAvg / thirtyDays.length;
                        totalVolume = thirtyDays.reduce((sum, day) => sum + day.volume, 0);
                    }
                }
                
                regionalData.push({
                    region: region.name,
                    regionId: region.id,
                    bestSell,
                    bestBuy,
                    spread: bestSell && bestBuy ? ((bestSell - bestBuy) / bestBuy * 100) : null,
                    volume30d: totalVolume,
                    avgPrice
                });
            } catch (error) {
                console.error(`Error fetching data for ${region.name}:`, error);
            }
        }
        
        // Update table
        const tableBody = el('regionalTableBody');
        if (tableBody) {
            tableBody.innerHTML = regionalData.map(data => `
                <tr>
                    <td class="region-name">${data.region}</td>
                    <td>${data.bestSell ? fmt(data.bestSell) : '—'}</td>
                    <td>${data.bestBuy ? fmt(data.bestBuy) : '—'}</td>
                    <td>${data.spread ? fmt(data.spread) + '%' : '—'}</td>
                    <td>${fmtInt(data.volume30d)}</td>
                    <td>${data.avgPrice ? fmt(data.avgPrice) : '—'}</td>
                </tr>
            `).join('');
        }
        
        // Update chart
        await loadRegionalChart(regionalData);
        
    } catch (error) {
        console.error('Error loading regional comparison:', error);
    }
}

async function loadRegionalChart(regionalData) {
    try {
        const ctx = el('regionalChart');
        if (!ctx) return;
        
        // Destroy existing chart
        if (AppState.regionalChart) {
            AppState.regionalChart.destroy();
        }
        
        AppState.regionalChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: regionalData.map(d => d.region),
                datasets: [
                    {
                        label: 'Best Sell',
                        data: regionalData.map(d => d.bestSell),
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'Best Buy',
                        data: regionalData.map(d => d.bestBuy),
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        tension: 0.1,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading regional chart:', error);
    }
}

// Price Alert Functions
function savePriceAlert(typeId, alertType, threshold) {
    if (!AppState.priceAlerts[typeId]) {
        AppState.priceAlerts[typeId] = {};
    }
    AppState.priceAlerts[typeId][alertType] = parseFloat(threshold);
    localStorage.setItem('marketPriceAlerts', JSON.stringify(AppState.priceAlerts));
}

function removePriceAlert(typeId, alertType) {
    if (AppState.priceAlerts[typeId]) {
        delete AppState.priceAlerts[typeId][alertType];
        if (Object.keys(AppState.priceAlerts[typeId]).length === 0) {
            delete AppState.priceAlerts[typeId];
        }
        localStorage.setItem('marketPriceAlerts', JSON.stringify(AppState.priceAlerts));
    }
}

async function checkPriceAlerts() {
    for (const typeId in AppState.priceAlerts) {
        try {
            const alerts = AppState.priceAlerts[typeId];
            const ordersUrl = `${ESI_BASE}/markets/10000002/orders/?type_id=${typeId}`;
            const response = await fetch(ordersUrl);
            if (!response.ok) continue;
            
            const orders = await response.json();
            const sellOrders = orders.filter(o => o.is_buy_order === false);
            const buyOrders = orders.filter(o => o.is_buy_order === true);
            
            const bestSell = sellOrders.length > 0 ? Math.min(...sellOrders.map(o => o.price)) : null;
            const bestBuy = buyOrders.length > 0 ? Math.max(...buyOrders.map(o => o.price)) : null;
            
            // Check sell price alerts
            if (alerts.sellAbove && bestSell && bestSell > alerts.sellAbove) {
                sendNotification(`Price Alert: Sell price above ${fmt(alerts.sellAbove)}`, `${getItemName(typeId)} is now ${fmt(bestSell)} ISK`);
            }
            if (alerts.sellBelow && bestSell && bestSell < alerts.sellBelow) {
                sendNotification(`Price Alert: Sell price below ${fmt(alerts.sellBelow)}`, `${getItemName(typeId)} is now ${fmt(bestSell)} ISK`);
            }
            
            // Check buy price alerts
            if (alerts.buyAbove && bestBuy && bestBuy > alerts.buyAbove) {
                sendNotification(`Price Alert: Buy price above ${fmt(alerts.buyAbove)}`, `${getItemName(typeId)} is now ${fmt(bestBuy)} ISK`);
            }
            if (alerts.buyBelow && bestBuy && bestBuy < alerts.buyBelow) {
                sendNotification(`Price Alert: Buy price below ${fmt(alerts.buyBelow)}`, `${getItemName(typeId)} is now ${fmt(bestBuy)} ISK`);
            }
        } catch (error) {
            console.error(`Error checking alerts for type ${typeId}:`, error);
        }
    }
}

function sendNotification(title, body) {
    if (!('Notification' in window)) {
        console.log('This browser does not support desktop notification');
        return;
    }
    
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'https://www.rustybot.co.uk/rusty_bot.png' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body, icon: 'https://www.rustybot.co.uk/rusty_bot.png' });
            }
        });
    }
}

function getItemName(typeId) {
    // Search through all categories to find the item name
    for (const category in AllMarketItems) {
        const item = AllMarketItems[category].items.find(i => i.id === parseInt(typeId));
        if (item) return item.name;
    }
    return `Item ${typeId}`;
}

// Expose some functions globally for debugging
window.MarketBrowser = {
    state: AppState,
    loadItem,
    showView
};
