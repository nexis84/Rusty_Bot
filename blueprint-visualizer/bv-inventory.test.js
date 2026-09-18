const { describe, it } = require('node:test');
const assert = require('node:assert');

// Mock data for testing
const mockAssets = [
  // Assets in NPC station (system 30000142 = Jita)
  { item_id: 1001, type_id: 34, quantity: 100, location_id: 60003760, location_type: 'station' },
  { item_id: 1002, type_id: 35, quantity: 200, location_id: 60003760, location_type: 'station' },
  
  // Assets in player structure (system 30000143 = Perimeter)
  { item_id: 1003, type_id: 36, quantity: 300, location_id: 1025000000001, location_type: 'item' },
  
  // Assets in unresolved structure (no system_id available)
  { item_id: 1004, type_id: 37, quantity: 400, location_id: 1025000000002, location_type: 'item' },
  
  // Container inside structure 1025000000001
  { item_id: 2001, type_id: 34, quantity: 50, location_id: 1025000000001, location_type: 'item' },
  
  // Asset inside the container
  { item_id: 2002, type_id: 35, quantity: 75, location_id: 2001, location_type: 'item' },
];

const mockStructures = [
  { structure_id: 1025000000001, system_id: 30000143, name: 'Test Structure 1' },
  // Note: 1025000000002 is NOT in this list (simulates unresolved structure)
];

const mockStations = {
  60003760: { solar_system_id: 30000142, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }
};

const mockSystems = [
  { id: 30000142, name: 'Jita' },
  { id: 30000143, name: 'Perimeter' },
];

// Simulate the inventory scanning logic
function simulateInventoryScan(assets, structures, stations, selectedSystemId, trustUnresolved = false) {
  const systemBreakdown = {};
  const keptAssets = [];
  const skippedInaccessible = [];
  const skippedWrongSystem = [];
  const trustedStructures = new Set();
  
  // Build structure system map
  const structureSystemMap = {};
  structures.forEach(s => {
    structureSystemMap[s.structure_id] = s.system_id;
  });
  
  // Build station system map
  const stationSystemMap = {};
  Object.entries(stations).forEach(([id, data]) => {
    stationSystemMap[id] = data.solar_system_id;
  });
  
  // Build item map for container chain resolution
  const itemMap = {};
  assets.forEach(a => {
    itemMap[a.item_id] = a;
  });
  
  // Simulate stationFor function - walk container chain to find real location
  function stationFor(asset) {
    let current = asset;
    const visited = new Set();
    const maxHops = 25;
    let hops = 0;
    
    while (current && current.location_type === 'item' && hops < maxHops) {
      const key = current.item_id;
      if (visited.has(key)) break;
      visited.add(key);
      
      const locId = current.location_id;
      
      // Check if location is a real location (station, structure, or system)
      if (stationSystemMap[locId]) return locId; // Station
      if (structureSystemMap[locId] !== undefined) return locId; // Structure
      if (locId >= 30000000 && locId < 40000000) return locId; // System
      
      // Otherwise, walk up the chain
      const parent = itemMap[locId];
      if (!parent) break;
      current = parent;
      hops++;
    }
    
    // Return the final location
    return current ? current.location_id : null;
  }
  
  // Process each asset
  assets.forEach(asset => {
    const stationId = stationFor(asset);
    let systemId = null;
    
    if (stationId) {
      if (stationSystemMap[stationId]) {
        systemId = stationSystemMap[stationId];
      } else if (structureSystemMap[stationId] !== undefined) {
        systemId = structureSystemMap[stationId];
      } else if (stationId >= 30000000 && stationId < 40000000) {
        systemId = stationId; // Already a system ID
      } else if (trustUnresolved) {
        // Trust fallback: assign to selected system
        systemId = selectedSystemId;
        trustedStructures.add(stationId);
      }
    }
    
    // Track system breakdown
    if (systemId) {
      systemBreakdown[systemId] = (systemBreakdown[systemId] || 0) + 1;
      
      if (systemId === selectedSystemId) {
        keptAssets.push(asset);
      } else {
        skippedWrongSystem.push(asset);
      }
    } else {
      skippedInaccessible.push(asset);
    }
  });
  
  return {
    keptAssets,
    skippedInaccessible,
    skippedWrongSystem,
    systemBreakdown,
    trustedStructures: Array.from(trustedStructures)
  };
}

describe('Inventory Scanning', () => {
  describe('System Filtering', () => {
    it('should keep assets in selected system', () => {
      const result = simulateInventoryScan(
        mockAssets,
        mockStructures,
        mockStations,
        30000142, // Jita
        false
      );
      
      // Should keep 2 assets in Jita station (1001, 1002)
      assert.strictEqual(result.keptAssets.length, 2);
      assert.strictEqual(result.systemBreakdown[30000142], 2);
    });
    
    it('should skip assets in other systems', () => {
      const result = simulateInventoryScan(
        mockAssets,
        mockStructures,
        mockStations,
        30000142, // Jita
        false
      );
      
      // Should skip 3 assets in Perimeter structure (1003, 2001, 2002)
      assert.strictEqual(result.skippedWrongSystem.length, 3);
      assert.strictEqual(result.systemBreakdown[30000143], 3);
    });
    
    it('should skip assets in unresolved structures when trust is disabled', () => {
      const result = simulateInventoryScan(
        mockAssets,
        mockStructures,
        mockStations,
        30000142, // Jita
        false
      );
      
      // Should skip 1 asset in unresolved structure (1004)
      assert.strictEqual(result.skippedInaccessible.length, 1);
    });
  });
  
  describe('Trust Fallback', () => {
    it('should include unresolved structures when trust is enabled', () => {
      const result = simulateInventoryScan(
        mockAssets,
        mockStructures,
        mockStations,
        30000142, // Jita
        true // Trust unresolved
      );
      
      // Should keep 2 assets in Jita + 1 asset in unresolved structure (1004)
      assert.strictEqual(result.keptAssets.length, 3);
      assert.strictEqual(result.trustedStructures.length, 1);
      assert.strictEqual(result.trustedStructures[0], 1025000000002);
    });
    
    it('should track trusted structures separately', () => {
      const result = simulateInventoryScan(
        mockAssets,
        mockStructures,
        mockStations,
        30000142, // Jita
        true
      );
      
      // Should have 1 trusted structure
      assert.strictEqual(result.trustedStructures.length, 1);
      assert.ok(result.trustedStructures.includes(1025000000002));
    });
  });
  
  describe('Container Chain Resolution', () => {
    it('should resolve containers inside structures', () => {
      // Asset 2002 is in container 2001, which is in structure 1025000000001
      const result = simulateInventoryScan(
        mockAssets,
        mockStructures,
        mockStations,
        30000143, // Perimeter
        false
      );
      
      // Should keep 3 assets in Perimeter (1003, 2001, 2002)
      assert.strictEqual(result.keptAssets.length, 3);
    });
  });
  
  describe('System Breakdown', () => {
    it('should track asset counts per system', () => {
      const result = simulateInventoryScan(
        mockAssets,
        mockStructures,
        mockStations,
        30000142, // Jita
        true
      );
      
      // Should have breakdown for both systems
      assert.strictEqual(result.systemBreakdown[30000142], 3); // 2 station + 1 trusted
      assert.strictEqual(result.systemBreakdown[30000143], 3); // 1 structure + 1 container + 1 asset in container
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty asset list', () => {
    const result = simulateInventoryScan(
      [],
      mockStructures,
      mockStations,
      30000142,
      false
    );
    
    assert.strictEqual(result.keptAssets.length, 0);
    assert.strictEqual(result.skippedInaccessible.length, 0);
    assert.strictEqual(result.skippedWrongSystem.length, 0);
  });
  
  it('should handle assets with zero quantity', () => {
    const assets = [
      { item_id: 1001, type_id: 34, quantity: 0, location_id: 60003760, location_type: 'station' }
    ];
    
    const result = simulateInventoryScan(
      assets,
      mockStructures,
      mockStations,
      30000142,
      false
    );
    
    // Should still count the asset (quantity filtering happens elsewhere)
    assert.strictEqual(result.keptAssets.length, 1);
  });
  
  it('should handle multiple unresolved structures', () => {
    const assets = [
      { item_id: 1001, type_id: 34, quantity: 100, location_id: 1025000000001, location_type: 'item' },
      { item_id: 1002, type_id: 35, quantity: 200, location_id: 1025000000002, location_type: 'item' },
      { item_id: 1003, type_id: 36, quantity: 300, location_id: 1025000000003, location_type: 'item' },
    ];
    
    const structures = []; // No structures resolved
    
    const result = simulateInventoryScan(
      assets,
      structures,
      mockStations,
      30000142,
      true
    );
    
    // All 3 should be trusted and kept
    assert.strictEqual(result.keptAssets.length, 3);
    assert.strictEqual(result.trustedStructures.length, 3);
  });
});
