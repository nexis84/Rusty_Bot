/**
 * Real integration test for inventory scanning.
 * Signs into EVE SSO and fetches actual assets.
 * 
 * Usage: node bv-inventory-real-test.js
 * 
 * This will:
 * 1. Open a browser for SSO login
 * 2. Fetch your character's assets
 * 3. Resolve structure systems
 * 4. Filter by a selected system
 * 5. Show detailed diagnostics
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const readline = require('readline');

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  // Use the same backend as the blueprint visualizer
  BACKEND_BASE: 'https://api.rustybot.co.uk',
  
  // Redirect URI - use production (must match what's registered for the client)
  REDIRECT_URI: 'https://www.rustybot.co.uk/blueprint-visualizer/sso-callback.html',
  
  // Local server port for OAuth flow
  PORT: 8080,
  
  // Scopes needed for asset scanning
  SCOPES: [
    'esi-assets.read_assets.v1',
    'esi-universe.read_structures.v1',
    'esi-corporations.read_structures.v1'
  ],
  
  // ESI endpoints
  ESI_BASE: 'https://esi.evetech.net/latest',
  SSO_BASE: 'https://login.eveonline.com',
  
  // Test configuration
  SELECTED_SYSTEM: 30004691, // O4T-Z5
  TRUST_UNRESOLVED: true
};

// ============================================================
// HTTP HELPERS
// ============================================================

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const req = protocol.request(urlObj, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RustyBot-Inventory-Test/1.0',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// ============================================================
// SSO AUTHENTICATION
// ============================================================

class EVEAuth {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
    this.refreshToken = null;
    this.characterId = null;
    this.characterName = null;
    this.corporationId = null;
    this.clientId = null;
  }
  
  async getClientId() {
    if (this.clientId) return this.clientId;
    
    const response = await fetchJSON(`${this.config.BACKEND_BASE}/api/bv/config`);
    this.clientId = response.eve_client_id;
    return this.clientId;
  }
  
  generateAuthURL() {
    const state = crypto.randomBytes(16).toString('hex');
    this.state = state;
    
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: this.config.REDIRECT_URI,
      client_id: this.clientId,
      scope: this.config.SCOPES.join(' '),
      state: state
    });
    
    return `${this.config.SSO_BASE}/v2/oauth/authorize?${params.toString()}`;
  }
  
  async exchangeCode(code) {
    // Use the backend token-exchange endpoint like the blueprint visualizer
    const response = await fetchJSON(`${this.config.BACKEND_BASE}/api/bv/token-exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.config.REDIRECT_URI
      })
    });
    
    this.accessToken = response.access_token;
    this.refreshToken = response.refresh_token;
    
    // Decode JWT to get character info
    const payload = JSON.parse(Buffer.from(this.accessToken.split('.')[1], 'base64').toString());
    this.characterId = payload.sub.split(':')[2];
    this.characterName = payload.name;
    
    return response;
  }
  
  async refreshAccessToken() {
    if (!this.refreshToken) throw new Error('No refresh token available');
    
    // Use the backend token-exchange endpoint for refresh too
    const response = await fetchJSON(`${this.config.BACKEND_BASE}/api/bv/token-exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken
      })
    });
    
    this.accessToken = response.access_token;
    return response;
  }
  
  async api(endpoint) {
    const url = `${this.config.ESI_BASE}${endpoint}`;
    return fetchJSON(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });
  }
  
  async getCharacterSheet() {
    const sheet = await this.api(`/characters/${this.characterId}/`);
    this.corporationId = sheet.corporation_id;
    return sheet;
  }
}

// ============================================================
// INVENTORY SCANNING LOGIC
// ============================================================

function isRealLoc(n) {
  return (n >= 30000000 && n < 40000000) || (n >= 1e12) || (n >= 60000000 && n < 61000000);
}

function stationFor(asset, idToAsset) {
  let cur = asset, hops = 0, anchor = null;
  const seen = new Set();
  
  while (cur && cur.location_type === 'item' && cur.location_id && hops < 25) {
    const key = String(cur.item_id);
    if (seen.has(key)) break;
    seen.add(key);
    const locId = cur.location_id;
    if (isRealLoc(+locId)) anchor = locId;
    const parent = idToAsset.get(String(locId));
    if (!parent) break;
    cur = parent;
    hops++;
  }
  if (cur && cur.location_type !== 'item' && cur.location_id) return cur.location_id;
  if (cur && cur.location_id && isRealLoc(+cur.location_id)) return cur.location_id;
  if (anchor !== null) return anchor;
  return asset.location_id;
}

// Simplified industrial material check - in real code this uses BV_MATERIALS
function isIndustrialMaterial(typeId) {
  // Minerals
  const minerals = [34, 35, 36, 37, 38, 39, 40, 11399];
  if (minerals.includes(typeId)) return true;
  
  // Ores (from bv-data.js)
  const ores = [18, 19, 20, 21, 22, 1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 11396];
  if (ores.includes(typeId)) return true;
  
  // Ice products (common type IDs)
  const iceProducts = [16273, 16274, 16275, 16276, 16277, 16278, 16279, 16280, 16281, 16282, 16283, 16284];
  if (iceProducts.includes(typeId)) return true;
  
  // Moon materials (common type IDs)
  const moonMaterials = [16643, 16644, 16645, 16646, 16647, 16648, 16649, 16650, 16651, 16652, 16653, 16654];
  if (moonMaterials.includes(typeId)) return true;
  
  // For now, assume anything else is non-industrial
  // In real code, this checks BV_MATERIALS, PI_DATA, etc.
  return false;
}

async function scanInventory(auth, selectedSystem, trustUnresolved) {
  console.log('\n[SCAN] Starting inventory scan...');
  console.log(`[SCAN] Character: ${auth.characterName} (${auth.characterId})`);
  console.log(`[SCAN] Selected system: ${selectedSystem}`);
  console.log(`[SCAN] Trust unresolved: ${trustUnresolved}`);
  
  // Fetch character sheet
  console.log('[SCAN] Fetching character sheet...');
  const sheet = await auth.getCharacterSheet();
  console.log(`[SCAN] Corporation: ${sheet.corporation_id}`);
  
  // Fetch assets (paginated)
  console.log('[SCAN] Fetching assets...');
  const assets = [];
  for (let page = 1; page <= 100; page++) {
    const chunk = await auth.api(`/characters/${auth.characterId}/assets/?datasource=tranquility&page=${page}`);
    if (!Array.isArray(chunk) || !chunk.length) break;
    assets.push(...chunk);
    console.log(`[SCAN] Page ${page}: ${chunk.length} assets (total: ${assets.length})`);
    if (chunk.length < 1000) break;
  }
  
  console.log(`[SCAN] Total assets: ${assets.length}`);
  
  // Build item map
  const idToAsset = new Map();
  for (const a of assets) {
    if (a && a.item_id) idToAsset.set(String(a.item_id), a);
  }
  
  // Get top locations
  const topLocIds = [...new Set(
    assets.filter(a => a && a.item_id).map(a => String(stationFor(a, idToAsset))).filter(Boolean)
  )];
  
  console.log(`[SCAN] Top locations: ${topLocIds.length}`);
  
  // Resolve systems
  const locSys = {};
  
  // NPC stations
  console.log('[SCAN] Resolving NPC stations...');
  let stationsResolved = 0, stationsFailed = 0;
  for (const id of topLocIds) {
    const num = +id;
    if (num >= 60000000 && num < 61000000) {
      try {
        const station = await fetchJSON(`${CONFIG.ESI_BASE}/universe/stations/${num}/`);
        locSys[id] = station.system_id;
        stationsResolved++;
        console.log(`[SCAN] Resolved station ${id}: system ${station.system_id}`);
      } catch (e) {
        stationsFailed++;
        console.log(`[SCAN] Failed to resolve station ${id}: ${e.message}`);
      }
    }
  }
  console.log(`[SCAN] Stations resolved: ${stationsResolved}, failed: ${stationsFailed}`);
  
  // Corp structures
  console.log('[SCAN] Fetching corporation structures...');
  try {
    const corpStructures = await auth.api(`/corporations/${auth.corporationId}/structures/`);
    console.log(`[SCAN] Corporation has ${corpStructures.length} structures`);
    for (const s of corpStructures) {
      const key = String(s.structure_id);
      if (topLocIds.includes(key)) {
        locSys[key] = s.system_id;
      }
    }
  } catch (e) {
    console.log(`[SCAN] Failed to fetch corp structures: ${e.message}`);
  }
  
  // Count unresolved before fallback
  const unresolvedBefore = topLocIds.filter(id => +id >= 1e12 && !locSys[id]);
  console.log(`[SCAN] Unresolved structures before fallback: ${unresolvedBefore.length}`);
  
  // Try to resolve some unresolved structures
  console.log('[SCAN] Attempting to resolve unresolved structures...');
  let resolvedCount = 0;
  for (const id of unresolvedBefore.slice(0, 10)) { // Try first 10
    try {
      const structure = await auth.api(`/universe/structures/${id}/`);
      locSys[id] = structure.solar_system_id;
      resolvedCount++;
      console.log(`[SCAN] Resolved structure ${id}: system ${structure.solar_system_id}`);
    } catch (e) {
      console.log(`[SCAN] Failed to resolve structure ${id}: ${e.message}`);
    }
  }
  console.log(`[SCAN] Resolved ${resolvedCount} structures`);
  
  // Fallback
  const trustFallbackStructs = new Set();
  if (trustUnresolved) {
    console.log('[SCAN] Applying trust fallback...');
    for (const id of topLocIds) {
      if (+id >= 1e12 && !locSys[id]) {
        locSys[id] = selectedSystem;
        trustFallbackStructs.add(id);
      }
    }
    console.log(`[SCAN] Trusted ${trustFallbackStructs.size} structures`);
  }
  
  // Filter to selected system
  console.log('[SCAN] Filtering to selected system...');
  const stkAgg = {};
  const stkAggByStation = {};
  let keptCount = 0, skippedInaccessible = 0, skippedWrongSystem = 0;
  let trustFallbackAssetCount = 0;
  const inaccessibleAssets = []; // Track inaccessible assets for diagnostics
  const keptByCategory = { industrial: 0, nonIndustrial: 0 };
  const keptIndustrialTypes = new Set();
  const keptNonIndustrialTypes = new Set();
  const inaccessibleIndustrialTypes = new Set();
  const wrongSystemIndustrialTypes = new Set();
  
  for (const a of assets) {
    if (!a || !a.type_id) continue;
    const qty = Number(a.quantity) || 0;
    if (qty <= 0) continue;
    
    const stnId = String(stationFor(a, idToAsset));
    const stnSys = locSys[stnId] != null ? locSys[stnId] : null;
    
    if (stnSys == null) { 
      skippedInaccessible++; 
      if (isIndustrialMaterial(a.type_id)) {
        inaccessibleIndustrialTypes.add(a.type_id);
      }
      if (inaccessibleAssets.length < 10) { // Track first 10 for diagnostics
        inaccessibleAssets.push({
          item_id: a.item_id,
          type_id: a.type_id,
          quantity: a.quantity,
          location_id: a.location_id,
          location_type: a.location_type,
          resolved_location: stnId
        });
      }
      continue; 
    }
    if (stnSys !== selectedSystem) { 
      skippedWrongSystem++; 
      if (isIndustrialMaterial(a.type_id)) {
        wrongSystemIndustrialTypes.add(a.type_id);
      }
      continue; 
    }
    
    if (trustFallbackStructs.has(stnId)) trustFallbackAssetCount += qty;
    keptCount++;
    stkAgg[a.type_id] = (stkAgg[a.type_id] || 0) + qty;
    
    // Track industrial vs non-industrial
    if (isIndustrialMaterial(a.type_id)) {
      keptByCategory.industrial++;
      keptIndustrialTypes.add(a.type_id);
    } else {
      keptByCategory.nonIndustrial++;
      keptNonIndustrialTypes.add(a.type_id);
    }
    
    if (stnId) {
      if (!stkAggByStation[stnId]) stkAggByStation[stnId] = {};
      stkAggByStation[stnId][a.type_id] = (stkAggByStation[stnId][a.type_id] || 0) + qty;
    }
  }
  
  return {
    totalAssets: assets.length,
    totalLocations: topLocIds.length,
    keptCount,
    skippedInaccessible,
    skippedWrongSystem,
    trustFallbackStructs: trustFallbackStructs.size,
    trustFallbackAssetCount,
    locationsInSystem: Object.keys(stkAggByStation).length,
    typesInSystem: Object.keys(stkAgg).length,
    stkAgg,
    stkAggByStation,
    locSys,
    inaccessibleAssets,
    keptByCategory,
    keptIndustrialTypes: Array.from(keptIndustrialTypes),
    keptNonIndustrialTypes: Array.from(keptNonIndustrialTypes),
    inaccessibleIndustrialTypes: Array.from(inaccessibleIndustrialTypes),
    wrongSystemIndustrialTypes: Array.from(wrongSystemIndustrialTypes)
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('='.repeat(70));
  console.log('REAL INVENTORY SCAN TEST');
  console.log('='.repeat(70));
  
  const auth = new EVEAuth(CONFIG);
  
  // Get client ID from backend
  console.log('\n[SSO] Fetching client ID from backend...');
  await auth.getClientId();
  console.log(`[SSO] Client ID: ${auth.clientId}`);
  
  // Generate auth URL
  const authURL = auth.generateAuthURL();
  
  // Check if URL was provided as command-line argument
  let redirectURL = process.argv[2];
  
  if (!redirectURL) {
    console.log('\n[SSO] Please open this URL in your browser:');
    console.log(authURL);
    console.log('\n[SSO] After signing in, you will be redirected to the production site.');
    console.log('[SSO] The URL will contain a "code" parameter.');
    console.log('[SSO] Copy the full redirect URL and paste it here.');
    
    // Read the redirect URL from stdin
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    redirectURL = await new Promise((resolve) => {
      rl.question('\n[SSO] Paste the redirect URL: ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  } else {
    console.log(`\n[SSO] Using provided URL: ${redirectURL}`);
  }
  
  // Extract code from URL
  const url = new URL(redirectURL);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code) {
    console.error('[SSO] ERROR: No code found in URL');
    process.exit(1);
  }
  
  if (state !== auth.state) {
    console.warn('[SSO] WARNING: State mismatch (expected, using URL from previous run)');
    // For testing, we'll accept the state from the URL
    auth.state = state;
  }
  
  // Exchange code for tokens
  console.log('\n[SSO] Exchanging code for tokens...');
  await auth.exchangeCode(code);
  
  console.log('\n[SSO] Authentication complete!');
  console.log(`[SSO] Character: ${auth.characterName} (${auth.characterId})`);
  
  // Run the scan
  const result = await scanInventory(auth, CONFIG.SELECTED_SYSTEM, CONFIG.TRUST_UNRESOLVED);
  
  // Display results
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70));
  console.log(`Total assets: ${result.totalAssets}`);
  console.log(`Total locations: ${result.totalLocations}`);
  console.log(`\nFiltered to system ${CONFIG.SELECTED_SYSTEM}:`);
  console.log(`  Kept: ${result.keptCount}`);
  console.log(`    - Industrial materials: ${result.keptByCategory.industrial}`);
  console.log(`    - Non-industrial items: ${result.keptByCategory.nonIndustrial}`);
  console.log(`  Skipped (inaccessible): ${result.skippedInaccessible}`);
  console.log(`  Skipped (wrong system): ${result.skippedWrongSystem}`);
  console.log(`\nTrust fallback:`);
  console.log(`  Structures trusted: ${result.trustFallbackStructs}`);
  console.log(`  Asset quantity trusted: ${result.trustFallbackAssetCount}`);
  console.log(`\nIn selected system:`);
  console.log(`  Locations: ${result.locationsInSystem}`);
  console.log(`  Total types: ${result.typesInSystem}`);
  console.log(`  Industrial types: ${result.keptIndustrialTypes.length}`);
  console.log(`  Non-industrial types: ${result.keptNonIndustrialTypes.length}`);
  
  // Show breakdown by location type
  const stationCount = Object.keys(result.locSys).filter(id => +id >= 60000000 && +id < 61000000).length;
  const structureCount = Object.keys(result.locSys).filter(id => +id >= 1e12).length;
  console.log(`\nLocation breakdown:`);
  console.log(`  NPC stations: ${stationCount}`);
  console.log(`  Structures: ${structureCount}`);
  
  // Show inaccessible assets diagnostics
  if (result.inaccessibleAssets.length > 0) {
    console.log(`\n[DIAGNOSTICS] First ${result.inaccessibleAssets.length} inaccessible assets:`);
    for (const asset of result.inaccessibleAssets) {
      const isIndustrial = isIndustrialMaterial(asset.type_id);
      console.log(`  Item ${asset.item_id} (type ${asset.type_id}, qty ${asset.quantity})${isIndustrial ? ' [INDUSTRIAL]' : ''}`);
      console.log(`    location_id: ${asset.location_id}, location_type: ${asset.location_type}`);
      console.log(`    resolved_location: ${asset.resolved_location}`);
      
      // Check what type of location this is
      const locNum = +asset.resolved_location;
      if (locNum >= 60000000 && locNum < 61000000) {
        console.log(`    -> NPC station (not resolved)`);
      } else if (locNum >= 1e12) {
        console.log(`    -> Structure (not resolved)`);
      } else if (locNum >= 30000000 && locNum < 40000000) {
        console.log(`    -> Solar system`);
      } else {
        console.log(`    -> Unknown location type (container/ship/item)`);
      }
    }
  }
  
  // Show industrial materials that are inaccessible or in wrong system
  if (result.inaccessibleIndustrialTypes.length > 0) {
    console.log(`\n[INDUSTRIAL IN ACCESSIBLE] ${result.inaccessibleIndustrialTypes.length} industrial types in inaccessible locations:`);
    console.log(`  Types: ${result.inaccessibleIndustrialTypes.join(', ')}`);
  }
  if (result.wrongSystemIndustrialTypes.length > 0) {
    console.log(`\n[INDUSTRIAL WRONG SYSTEM] ${result.wrongSystemIndustrialTypes.length} industrial types in other systems:`);
    console.log(`  Types: ${result.wrongSystemIndustrialTypes.join(', ')}`);
  }
  
  // Show industrial material breakdown
  console.log(`\n[INDUSTRIAL MATERIALS] Top 20 by quantity:`);
  const industrialItems = [];
  for (const [typeId, qty] of Object.entries(result.stkAgg)) {
    if (isIndustrialMaterial(+typeId)) {
      industrialItems.push({ typeId: +typeId, qty });
    }
  }
  industrialItems.sort((a, b) => b.qty - a.qty);
  for (const item of industrialItems.slice(0, 20)) {
    console.log(`  Type ${item.typeId}: ${item.qty.toLocaleString()} units`);
  }
  
  console.log(`\n[INDUSTRIAL TYPES] Found ${result.keptIndustrialTypes.length} industrial types:`);
  console.log(`  ${result.keptIndustrialTypes.join(', ')}`);
  
  // Show top 30 non-industrial types to see what's being kept
  console.log(`\n[NON-INDUSTRIAL] Top 30 types by quantity (these are NOT industrial):`);
  const nonIndustrialItems = [];
  for (const [typeId, qty] of Object.entries(result.stkAgg)) {
    if (!isIndustrialMaterial(+typeId)) {
      nonIndustrialItems.push({ typeId: +typeId, qty });
    }
  }
  nonIndustrialItems.sort((a, b) => b.qty - a.qty);
  for (const item of nonIndustrialItems.slice(0, 30)) {
    console.log(`  Type ${item.typeId}: ${item.qty.toLocaleString()} units`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
}

main().catch(e => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
