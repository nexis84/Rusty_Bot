/**
 * Local test for inventory scanning logic.
 * Simulates the full loadInventory flow with mock ESI data.
 * 
 * Run: node bv-inventory-local-test.js
 */

// ============================================================
// MOCK DATA - Simulating Nexis's scenario:
// - 979 assets across 199 locations
// - 26 NPC stations, 172 structures, 1 other
// - Only 7 structures resolved by corp endpoint
// - 165 structures unresolved (403 on /universe/structures/)
// - Selected system: O4T-Z5 (30004691)
// ============================================================

const SELECTED_SYSTEM = 30004691; // O4T-Z5
const OTHER_SYSTEM = 30000142;    // Jita

// Mock NPC stations in O4T-Z5
const MOCK_STATIONS = {};
for (let i = 0; i < 26; i++) {
  const stationId = 60010000 + i;
  MOCK_STATIONS[stationId] = {
    solar_system_id: SELECTED_SYSTEM,
    name: `O4T-Z5 Station ${i + 1}`
  };
}

// Mock structures - 7 resolved by corp endpoint, 165 unresolved
const MOCK_CORP_STRUCTURES = [];
for (let i = 0; i < 7; i++) {
  MOCK_CORP_STRUCTURES.push({
    structure_id: 1025000000001 + i,
    system_id: SELECTED_SYSTEM,
    name: `O4T-Z5 Corp Structure ${i + 1}`
  });
}

// Unresolved structures (would 403 on /universe/structures/)
const UNRESOLVED_STRUCT_IDS = [];
for (let i = 0; i < 165; i++) {
  UNRESOLVED_STRUCT_IDS.push(1025000000100 + i);
}

// Mock assets - distributed across locations
const MOCK_ASSETS = [];
let itemId = 1;

// 1. Assets in NPC stations (26 stations, ~5 assets each = 130 stacks)
for (const [stationId, station] of Object.entries(MOCK_STATIONS)) {
  for (let j = 0; j < 5; j++) {
    MOCK_ASSETS.push({
      item_id: itemId++,
      type_id: 34 + j, // Tritanium, Pyerite, etc.
      quantity: 1000 + j * 100,
      location_id: parseInt(stationId),
      location_type: 'station'
    });
  }
}

// 2. Assets in resolved corp structures (7 structures, ~10 assets each = 70 stacks)
for (const struct of MOCK_CORP_STRUCTURES) {
  for (let j = 0; j < 10; j++) {
    MOCK_ASSETS.push({
      item_id: itemId++,
      type_id: 34 + j,
      quantity: 5000 + j * 500,
      location_id: struct.structure_id,
      location_type: 'item'
    });
  }
}

// 3. Assets in unresolved structures (165 structures, ~3 assets each = 495 stacks)
// These are the ones the user wants to see!
for (const structId of UNRESOLVED_STRUCT_IDS) {
  for (let j = 0; j < 3; j++) {
    MOCK_ASSETS.push({
      item_id: itemId++,
      type_id: 34 + j,
      quantity: 2000 + j * 200,
      location_id: structId,
      location_type: 'item'
    });
  }
}

// 4. Assets in containers inside unresolved structures (container chain test)
// 10 containers, each with 2 assets = 20 stacks
for (let i = 0; i < 10; i++) {
  const containerId = itemId++;
  const parentStructId = UNRESOLVED_STRUCT_IDS[i];
  
  // The container itself
  MOCK_ASSETS.push({
    item_id: containerId,
    type_id: 1000, // Container type
    quantity: 1,
    location_id: parentStructId,
    location_type: 'item'
  });
  
  // Assets inside the container
  for (let j = 0; j < 2; j++) {
    MOCK_ASSETS.push({
      item_id: itemId++,
      type_id: 34 + j,
      quantity: 3000,
      location_id: containerId,
      location_type: 'item'
    });
  }
}

// 5. Assets in OTHER systems (should be filtered out)
for (let i = 0; i < 50; i++) {
  MOCK_ASSETS.push({
    item_id: itemId++,
    type_id: 34,
    quantity: 100,
    location_id: 60003760 + i, // Jita stations
    location_type: 'station'
  });
}

// Mock Jita stations
const MOCK_JITA_STATIONS = {};
for (let i = 0; i < 50; i++) {
  MOCK_JITA_STATIONS[60003760 + i] = {
    solar_system_id: OTHER_SYSTEM,
    name: `Jita Station ${i + 1}`
  };
}

// ============================================================
// SIMULATE THE ACTUAL CODE LOGIC
// ============================================================

function isRealLoc(n) {
  return (n >= 30000000 && n < 40000000) || (n >= 1e12) || (n >= 60000000 && n < 61000000);
}

function stationForWalk(asset, idToAsset) {
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

// Memoized: the scan resolves every asset 2+ times (topLoc + scope loops),
// so cache per item_id instead of re-walking up to 25 hops each time.
const stationCache = new Map();
function stationFor(asset, idToAsset) {
  const key = asset ? String(asset.item_id) : '';
  if (stationCache.has(key)) return stationCache.get(key);
  const res = stationForWalk(asset, idToAsset);
  stationCache.set(key, res);
  return res;
}

function simulateFullScan(assets, trustUnresolved) {
  const selSysNum = SELECTED_SYSTEM;
  
  // Build item map
  const idToAsset = new Map();
  for (const a of assets) {
    if (a && a.item_id) idToAsset.set(String(a.item_id), a);
  }
  
  // Get top locations
  const topLocIds = [...new Set(
    assets.filter(a => a && a.item_id).map(a => String(stationFor(a, idToAsset))).filter(Boolean)
  )];
  
  // Resolve systems
  const locSys = {};
  
  // NPC stations
  for (const id of topLocIds) {
    const num = +id;
    if (num >= 60000000 && num < 61000000) {
      const station = MOCK_STATIONS[id] || MOCK_JITA_STATIONS[id];
      if (station) locSys[id] = station.solar_system_id;
    }
  }
  
  // Corp structures
  for (const s of MOCK_CORP_STRUCTURES) {
    const key = String(s.structure_id);
    if (topLocIds.includes(key)) {
      locSys[key] = s.system_id;
    }
  }
  
  // Count unresolved before fallback
  const unresolvedBefore = topLocIds.filter(id => +id >= 1e12 && !locSys[id]);
  console.log(`[BEFORE FALLBACK] Unresolved structures: ${unresolvedBefore.length}`);
  
  // Fallback
  const trustFallbackStructs = new Set();
  if (trustUnresolved) {
    for (const id of topLocIds) {
      if (+id >= 1e12 && !locSys[id]) {
        locSys[id] = selSysNum;
        trustFallbackStructs.add(id);
      }
    }
  }
  
  console.log(`[AFTER FALLBACK] Trusted structures: ${trustFallbackStructs.size}`);
  
  // Filter to selected system
  const stkAgg = {};
  const stkAggByStation = {};
  let keptCount = 0, skippedInaccessible = 0, skippedWrongSystem = 0;
  let trustFallbackAssetCount = 0;
  
  for (const a of assets) {
    if (!a || !a.type_id) continue;
    const qty = Number(a.quantity) || 0;
    if (qty <= 0) continue;
    
    const stnId = String(stationFor(a, idToAsset));
    const stnSys = locSys[stnId] != null ? locSys[stnId] : null;
    
    if (stnSys == null) { skippedInaccessible++; continue; }
    if (stnSys !== selSysNum) { skippedWrongSystem++; continue; }
    
    if (trustFallbackStructs.has(stnId)) trustFallbackAssetCount += qty;
    keptCount++;
    stkAgg[a.type_id] = (stkAgg[a.type_id] || 0) + qty;
    
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
    stkAggByStation
  };
}

// ============================================================
// RUN TESTS
// ============================================================

console.log('='.repeat(70));
console.log('INVENTORY SCAN LOCAL TEST');
console.log('='.repeat(70));
console.log(`Total mock assets: ${MOCK_ASSETS.length}`);
console.log(`Selected system: O4T-Z5 (${SELECTED_SYSTEM})`);
console.log('');

// Test 1: Without trust fallback
console.log('--- TEST 1: Trust fallback OFF ---');
const result1 = simulateFullScan(MOCK_ASSETS, false);
console.log(`Kept: ${result1.keptCount}`);
console.log(`Skipped (inaccessible): ${result1.skippedInaccessible}`);
console.log(`Skipped (wrong system): ${result1.skippedWrongSystem}`);
console.log(`Locations in system: ${result1.locationsInSystem}`);
console.log(`Types in system: ${result1.typesInSystem}`);
console.log('');

// Test 2: With trust fallback
console.log('--- TEST 2: Trust fallback ON ---');
const result2 = simulateFullScan(MOCK_ASSETS, true);
console.log(`Kept: ${result2.keptCount}`);
console.log(`Skipped (inaccessible): ${result2.skippedInaccessible}`);
console.log(`Skipped (wrong system): ${result2.skippedWrongSystem}`);
console.log(`Trusted structures: ${result2.trustFallbackStructs}`);
console.log(`Trusted asset count: ${result2.trustFallbackAssetCount}`);
console.log(`Locations in system: ${result2.locationsInSystem}`);
console.log(`Types in system: ${result2.typesInSystem}`);
console.log('');

// Assertions
console.log('--- ASSERTIONS ---');
// Section 4 adds 10 containers + 20 contents = 30 stacks (not 20).
const expectedKept = 130 + 70 + 495 + 30; // stations + corp structs + unresolved + containers
const expectedWrongSys = 50; // Jita assets
// Unique top locations: the 10 containers sit inside UNRESOLVED_STRUCT_IDS[0..9],
// so they resolve to existing structures — 26 + 7 + 165 = 198, not 208.
const expectedLocs = 26 + 7 + 165;

console.log(`Expected kept (with fallback): ${expectedKept}, Actual: ${result2.keptCount} ${result2.keptCount === expectedKept ? '✓' : '✗'}`);
console.log(`Expected wrong system: ${expectedWrongSys}, Actual: ${result2.skippedWrongSystem} ${result2.skippedWrongSystem === expectedWrongSys ? '✓' : '✗'}`);
console.log(`Expected inaccessible: 0, Actual: ${result2.skippedInaccessible} ${result2.skippedInaccessible === 0 ? '✓' : '✗'}`);
console.log(`Expected locations: ${expectedLocs}, Actual: ${result2.locationsInSystem} ${result2.locationsInSystem === expectedLocs ? '✓' : '✗'}`);

// Test 3: Container chain resolution
console.log('');
console.log('--- TEST 3: Container chain resolution ---');
const containerAssets = MOCK_ASSETS.filter(a => a.location_type === 'item' && a.type_id !== 1000 && a.location_id >= 100000000);
console.log(`Assets inside containers: ${containerAssets.length}`);
console.log(`These should all resolve to their parent structure's system`);

// Verify container assets are in the kept set
let containerAssetsKept = 0;
for (const a of containerAssets) {
  if (result2.stkAgg[a.type_id]) {
    containerAssetsKept++;
  }
}
console.log(`Container assets found in system: ${containerAssetsKept}/${containerAssets.length} ${containerAssetsKept === containerAssets.length ? '✓' : '✗'}`);

console.log('');
console.log('='.repeat(70));
console.log('TEST COMPLETE');
console.log('='.repeat(70));
