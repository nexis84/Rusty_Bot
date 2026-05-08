/* Skin Analyzer Logic Extraction */

// Fetch character assets from ESI (for ship detection)
async function fetchCharacterAssets() {
    const characterId = localStorage.getItem('eve_character_id');
    if (!characterId) return null;
    
    try {
        const response = await fetch(`${ESI_BASE}/characters/${characterId}/assets/?datasource=tranquility`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                await refreshAccessToken();
                return fetchCharacterAssets();
            }
            throw new Error(`ESI Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching assets:', error);
        showNotification('Failed to fetch assets from ESI. Please try again later.', 'warning');
        return null;
    }
}

// Fetch character's unlocked SKIN licenses from ESI
async function fetchCharacterSkins() {
    const characterId = localStorage.getItem('eve_character_id');
    if (!characterId) return null;
    
    try {
        const response = await fetch(`${ESI_BASE}/characters/${characterId}/skins/?datasource=tranquility`, {
            headers: getAuthHeaders()
        });
        
        // 401 = token expired, 403 = scope not granted — both treated as "not available"
        if (!response.ok) {
            console.warn(`Character skins endpoint returned ${response.status} — scope likely not available`);
            return null;
        }
        
        // Returns array of { skin_id, is_active, expiry_date? }
        return await response.json();
    } catch (error) {
        console.warn('Could not fetch character skins:', error.message);
        return null;
    }
}

// Load the skin_id → type_id mapping from EVE SDE via eveos.space
// skinLicenses maps licenseTypeID (market type_id) → skinID (ESI skin_id)
async function getSkinLicenseMap() {
    const CACHE_KEY = 'skinLicenseMap_v1';
    const CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_AGE) {
                return new Map(data); // skinId -> typeId
            }
        } catch {}
    }
    
    try {
        const res = await fetch('https://data.eveos.space/sdejsonl/skinLicenses.jsonl');
        if (!res.ok) throw new Error('skinLicenses not available from eveos.space');
        
        const text = await res.text();
        const skinToType = new Map(); // skinId -> typeId
        
        text.split(/\r?\n/).filter(Boolean).forEach(line => {
            try {
                const obj = JSON.parse(line);
                // _key is licenseTypeID (market type_id), skinID is the ESI skin_id
                if (obj._key && obj.skinID) {
                    skinToType.set(Number(obj.skinID), Number(obj._key));
                }
            } catch {}
        });
        
        if (skinToType.size > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                data: [...skinToType.entries()],
                timestamp: Date.now()
            }));
            console.log(`Loaded ${skinToType.size} skin license mappings from eveos.space`);
            return skinToType;
        }
    } catch (err) {
        console.warn('Could not load skinLicenses mapping from eveos.space:', err);
    }
    
    return null;
}

// Cache for skins indexed by ship name (full name)
let skinsByShipCache = null;

// Build the skin lookup index: maps lowercase ship name -> array of skin objects
function buildSkinsByShipCache() {
    if (skinsByShipCache) return;
    skinsByShipCache = {};
    const allSkins = AllMarketItems.skins?.items || [];
    
    // Build a set of all known ship names (lowercase) for accurate prefix matching
    const shipNames = new Set();
    if (AllMarketItems.ships?.items) {
        AllMarketItems.ships.items.forEach(s => shipNames.add(s.name.toLowerCase()));
    }
    
    allSkins.forEach(skin => {
        // SKIN names follow the pattern: "[Ship Name] [Theme] SKIN"
        // Strip " SKIN" suffix then find the longest prefix that matches a ship name
        const withoutSuffix = skin.name.replace(/\s+SKIN$/i, '').trim();
        const words = withoutSuffix.split(' ');
        
        let matchedShipKey = null;
        // Try progressively longer prefixes to find the longest ship name match
        for (let len = words.length - 1; len >= 1; len--) {
            const candidate = words.slice(0, len).join(' ').toLowerCase();
            if (shipNames.has(candidate)) {
                matchedShipKey = candidate;
                break;
            }
        }
        
        // Fallback: use first word if no exact ship match found
        if (!matchedShipKey) {
            matchedShipKey = words[0].toLowerCase();
        }
        
        if (!skinsByShipCache[matchedShipKey]) skinsByShipCache[matchedShipKey] = [];
        skinsByShipCache[matchedShipKey].push({
            id: skin.id,
            name: skin.name,
            skinTypeId: skin.id
        });
    });
}

// Get available skins for a specific ship type ID
function getAvailableSkinsForShip(shipTypeId) {
    const shipName = getItemName(shipTypeId);
    if (!shipName) return [];
    buildSkinsByShipCache();
    return skinsByShipCache[shipName.toLowerCase()] || [];
}

// Find item in database by type ID
function findItemInDatabase(typeId) {
    for (const category in AllMarketItems) {
        const item = AllMarketItems[category].items.find(i => i.id === typeId);
        if (item) return item;
    }
    return null;
}

// Analyze skins and find missing ones
async function analyzeSkins() {
    if (!isAuthenticated()) {
        showNotification('Please log in with EVE SSO first', 'warning');
        return;
    }
    
    showView('skinAnalyzer');
    showLoading('Fetching your ships and skins...');
    
    try {
        const [assets, characterSkins, licenseMap] = await Promise.all([
            fetchCharacterAssets(),
            fetchCharacterSkins().catch(() => null),
            getSkinLicenseMap()
        ]);
        
        if (!assets) throw new Error('Could not fetch your ship inventory from ESI.');
        
        showLoading('Analysing your skins...');
        
        const ownedShips = new Set();
        const unappliedSkinTypeIds = new Set();
        
        for (const asset of assets) {
            const category = getItemCategory(asset.type_id);
            if (category === 'Ships') {
                ownedShips.add(asset.type_id);
            } else {
                const allSkins = AllMarketItems.skins?.items || [];
                if (allSkins.some(s => s.id === asset.type_id)) {
                    unappliedSkinTypeIds.add(asset.type_id);
                }
            }
        }
        
        const ownedSkinTypeIds = new Set();
        
        if (characterSkins && licenseMap && licenseMap.size > 0) {
            for (const s of characterSkins) {
                const skinId = typeof s === 'object' ? s.skin_id : s;
                const typeId = licenseMap.get(skinId);
                if (typeId) ownedSkinTypeIds.add(typeId);
            }
        } else {
            unappliedSkinTypeIds.forEach(id => ownedSkinTypeIds.add(id));
        }
        
        const ownedSkinsList = [];
        const missingSkins = [];
        
        for (const shipId of ownedShips) {
            const availableSkins = getAvailableSkinsForShip(shipId);
            const shipName = getItemName(shipId);
            for (const skin of availableSkins) {
                const entry = { shipId, shipName, skinId: skin.id, skinName: skin.name, skinTypeId: skin.id };
                if (ownedSkinTypeIds.has(skin.id)) {
                    ownedSkinsList.push(entry);
                } else {
                    missingSkins.push(entry);
                }
            }
        }
        
        const skinsWithPrices = await fetchSkinPrices(missingSkins);
        AppState.lastSkinAnalysis = { owned: ownedSkinsList, missing: skinsWithPrices };
        displaySkinAnalysis(AppState.lastSkinAnalysis);
        
    } catch (error) {
        console.error('Skin analysis error:', error);
        showNotification('Failed to analyze skins: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Fetch market prices for skins
async function fetchSkinPrices(skins) {
    const regionId = '10000002';
    const BATCH_SIZE = 15;
    const skinsWithPrices = [];
    
    for (let i = 0; i < skins.length; i += BATCH_SIZE) {
        const batch = skins.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (skin) => {
            try {
                const response = await fetch(`${ESI_BASE}/markets/${regionId}/orders/?datasource=tranquility&order_type=sell&type_id=${skin.skinTypeId}`);
                const orders = await response.json();
                const cheapestPrice = orders.length > 0 ? Math.min(...orders.map(o => o.price)) : null;
                return { ...skin, cheapestPrice, orderCount: orders.length, region: 'The Forge' };
            } catch (error) {
                return { ...skin, cheapestPrice: null, orderCount: 0, region: 'The Forge' };
            }
        });
        const results = await Promise.all(promises);
        skinsWithPrices.push(...results);
    }
    return skinsWithPrices.sort((a, b) => (a.cheapestPrice || Infinity) - (b.cheapestPrice || Infinity));
}

// Filter skin analysis results
function filterSkinResults() {
    const query = el('skinSearch')?.value.toLowerCase().trim() || '';
    if (!AppState.lastSkinAnalysis) return;
    const { owned, missing } = AppState.lastSkinAnalysis;
    if (!query) { displaySkinAnalysis(AppState.lastSkinAnalysis); return; }
    const keywords = query.split(/\s+/).filter(k => k.length > 0);
    const matches = s => keywords.every(w => s.skinName.toLowerCase().includes(w) || s.shipName.toLowerCase().includes(w));
    displaySkinAnalysis({ owned: owned.filter(matches), missing: missing.filter(matches) }, true);
}

// Display skin analysis results
function displaySkinAnalysis({ owned = [], missing = [] } = {}, isFiltering = false) {
    const container = el('skinAnalyzerResults');
    if (!container) return;
    const query = el('skinSearch')?.value.toLowerCase().trim() || '';
    const keywords = query.split(/\s+/).filter(k => k.length > 0);
    
    const highlight = (text, words) => {
        if (!words.length) return escapeHtml(text);
        let html = escapeHtml(text);
        words.forEach(w => html = html.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<span class="search-highlight">$1</span>'));
        return html;
    };

    const skinCard = (skin, isOwned) => `
        <div class="item-card skin-card${isOwned ? ' skin-owned' : ''}" onclick="loadItem(${skin.skinTypeId}, '${skin.skinName.replace(/'/g, "\\'")}')">
            <div class="skin-icon"><i class="fas fa-${isOwned ? 'check-circle' : 'palette'}"></i></div>
            <div class="item-name">${highlight(skin.skinName, keywords)}</div>
            <div class="item-ship">For: ${highlight(skin.shipName, keywords)}</div>
            ${!isOwned ? `
            <div class="skin-price ${skin.cheapestPrice ? 'has-price' : 'no-price'}">
                <i class="fas fa-tag"></i> ${skin.cheapestPrice ? fmt(skin.cheapestPrice) + ' ISK' : 'No sell orders'}
            </div>
            <div class="skin-location"><i class="fas fa-map-marker-alt"></i> ${skin.region || 'The Forge'}</div>
            ${skin.orderCount > 0 ? `<div class="skin-orders">${skin.orderCount} orders</div>` : ''}` : ''}
        </div>`;

    const collapsibleSection = (id, icon, title, count, badgeClass, cards, extraHtml, defaultOpen) => `
        <div class="skin-section-panel">
            <button class="skin-section-toggle${defaultOpen ? ' open' : ''}" onclick="toggleSkinSection('${id}')">
                <span><i class="fas fa-${icon}"></i> ${title} <span class="skin-section-badge ${badgeClass}">${count}</span></span>
                ${extraHtml}
                <i class="fas fa-chevron-down skin-chevron"></i>
            </button>
            <div class="skin-section-body" id="${id}" style="display:${defaultOpen ? 'block' : 'none'}">
                <div class="item-grid skin-shopping-list">${cards}</div>
            </div>
        </div>`;

    const totalCost = missing.reduce((sum, s) => sum + (s.cheapestPrice || 0), 0);
    let html = '<div class="skin-sections">';
    if (owned.length > 0) html += collapsibleSection('skinOwnedSection', 'check-circle', 'Owned', owned.length, 'badge-owned', owned.map(s => skinCard(s, true)).join(''), '', false);
    if (missing.length > 0) html += collapsibleSection('skinMissingSection', 'shopping-cart', 'Missing', missing.length, 'badge-missing', missing.map(s => skinCard(s, false)).join(''), totalCost > 0 ? `<span>${fmt(totalCost)} ISK</span>` : '', true);
    html += '</div>';
    container.innerHTML = html;
}

function toggleSkinSection(id) {
    const body = el(id);
    const btn = body?.previousElementSibling;
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (btn) btn.classList.toggle('open', !isOpen);
}
