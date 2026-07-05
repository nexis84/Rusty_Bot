// PI Chain Data - Planetary Interaction Materials and Recipes
// Source: EVE Online SDE / Community Knowledge

const PI_DATA = {
    // Planet Types and their extractable P0 resources
    planets: {
        temperate: {
            name: 'Temperate',
            color: '#4ade80',
            p0Materials: [2267, 2268, 2270, 2272] // Nocxium, Water, Autotrophs, Complex Organisms
        },
        barren: {
            name: 'Barren',
            color: '#a16207',
            p0Materials: [2267, 2268, 2271, 2288] // Nocxium, Water, Tritanium, Reactive Metals
        },
        oceanic: {
            name: 'Oceanic',
            color: '#0ea5e9',
            p0Materials: [2268, 2270, 2272, 2287] // Water, Autotrophs, Complex Organisms, Planktic Colonies
        },
        lava: {
            name: 'Lava',
            color: '#dc2626',
            p0Materials: [2267, 2271, 2288, 2306, 2307, 2308, 2309, 2310, 2311] // Various
        },
        storm: {
            name: 'Storm',
            color: '#f59e0b',
            p0Materials: [2268, 2269, 2287, 2306, 2307, 2308, 2309, 2310, 2311] // Various
        },
        plasma: {
            name: 'Plasma',
            color: '#8b5cf6',
            p0Materials: [2267, 2269, 2271, 2288, 2306, 2307, 2308, 2309, 2310, 2311]
        },
        gas: {
            name: 'Gas',
            color: '#14b8a6',
            p0Materials: [2269, 2270, 2271, 2272, 2287, 2288]
        },
        ice: {
            name: 'Ice',
            color: '#e0f2fe',
            p0Materials: [2268, 2269, 2270, 2272]
        },
        shattered: {
            name: 'Shattered',
            color: '#6b7280',
            p0Materials: [] // No extraction possible
        }
    },

    // All PI Materials with their details
    materials: {
        // P0 - Raw Resources
        2267: { name: 'Nocxium', tier: 0, batchSize: 1, volume: 0.01 },
        2268: { name: 'Water', tier: 0, batchSize: 1, volume: 0.01 },
        2269: { name: 'Oxygen', tier: 0, batchSize: 1, volume: 0.01 },
        2270: { name: 'Autotrophs', tier: 0, batchSize: 1, volume: 0.01 },
        2271: { name: 'Tritanium', tier: 0, batchSize: 1, volume: 0.01 },
        2272: { name: 'Complex Organisms', tier: 0, batchSize: 1, volume: 0.01 },
        2287: { name: 'Planktic Colonies', tier: 0, batchSize: 1, volume: 0.01 },
        2288: { name: 'Reactive Metals', tier: 0, batchSize: 1, volume: 0.01 },
        2306: { name: 'Base Metals', tier: 0, batchSize: 1, volume: 0.01 },
        2307: { name: 'Noble Metals', tier: 0, batchSize: 1, volume: 0.01 },
        2308: { name: 'Suspended Plasma', tier: 0, batchSize: 1, volume: 0.01 },
        2309: { name: 'Ionic Solutions', tier: 0, batchSize: 1, volume: 0.01 },
        2310: { name: 'Noble Gas', tier: 0, batchSize: 1, volume: 0.01 },
        2311: { name: 'Microorganisms', tier: 0, batchSize: 1, volume: 0.01 },
        2312: { name: 'Felsic Magma', tier: 0, batchSize: 1, volume: 0.01 },
        2073: { name: 'Aqueous Liquids', tier: 0, batchSize: 1, volume: 0.01 },
        2317: { name: 'Non-CS Crystals', tier: 0, batchSize: 1, volume: 0.01 },
        2319: { name: 'Carbon Compounds', tier: 0, batchSize: 1, volume: 0.01 },
        2320: { name: 'Silicate', tier: 0, batchSize: 1, volume: 0.01 },
        2321: { name: 'Heavy Metals', tier: 0, batchSize: 1, volume: 0.01 },
        2324: { name: 'Electrolytes', tier: 0, batchSize: 1, volume: 0.01 },
        2328: { name: 'Pyroxeres', tier: 0, batchSize: 1, volume: 0.01 },

        // P1 - Processed Materials (3000 P0 → 20 P1 per hour)
        2389: { name: 'Biomass', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2287: 3000, 2311: 3000, 2268: 3000 } },
        2390: { name: 'Chiral Structures', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2288: 3000 } },
        2392: { name: 'Electrolytes', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2268: 3000, 2309: 3000 } },
        2393: { name: 'Oxidizing Compound', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2269: 3000, 2324: 3000 } },
        2395: { name: 'Plasmoids', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2308: 3000 } },
        2396: { name: 'Precious Metals', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2307: 3000 } },
        2397: { name: 'Reactive Metals', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2288: 3000 } },
        2398: { name: 'Silicon', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2320: 3000, 2312: 3000 } },
        2399: { name: 'Toxic Metals', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2267: 3000, 2321: 3000 } },
        2400: { name: 'Water', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2268: 3000 } },
        2401: { name: 'Bacteria', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2311: 3000 } },
        3779: { name: 'Biofuels', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2269: 3000, 2288: 3000, 2311: 3000 } },
        2403: { name: 'Proteins', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2272: 3000, 2268: 3000 } },
        3645: { name: 'Oxygen', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2269: 3000 } },
        3683: { name: 'Alloys', tier: 1, batchSize: 20, volume: 0.38, inputs: { 2306: 3000, 2307: 3000 } },

        // P2 - Refined Commodities (5 P1 → 3 P2 per hour)
        2329: { name: 'Biocells', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2389: 5, 2403: 5 } },
        2330: { name: 'Construction Blocks', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2397: 5, 3683: 5 } },
        2331: { name: 'Consumer Electronics', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2392: 5, 3645: 5 } },
        2332: { name: 'Coolant', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2392: 5, 2400: 5 } },
        2333: { name: 'Enriched Uranium', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2396: 5, 2399: 5 } },
        2334: { name: 'Fertilizer', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2397: 5, 2403: 5 } },
        2335: { name: 'Genetically Enhanced Livestock', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2403: 5, 2390: 5 } },
        2336: { name: 'Livestock', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2403: 5, 3779: 5 } },
        2337: { name: 'Mechanical Parts', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2397: 5, 3683: 5 } },
        2338: { name: 'Microfiber Shielding', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2398: 5, 2389: 5 } },
        2339: { name: 'Miniature Electronics', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2398: 5, 3645: 5 } },
        2340: { name: 'Nanites', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2389: 5, 2399: 5 } },
        2341: { name: 'Oxides', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2393: 5, 2398: 5 } },
        2342: { name: 'Polyaramids', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2390: 5, 2389: 5 } },
        2343: { name: 'Polytextiles', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2389: 5, 3779: 5 } },
        2344: { name: 'Rocket Fuel', tier: 2, batchSize: 3, volume: 1.5, inputs: { 3779: 5, 2392: 5 } },
        2345: { name: 'Silicate Glass', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2398: 5, 2400: 5 } },
        2346: { name: 'Superconductors', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2392: 5, 2395: 5 } },
        2347: { name: 'Supertensile Plastics', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2398: 5, 3779: 5 } },
        2348: { name: 'Synthetic Oil', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2393: 5, 3779: 5 } },
        2349: { name: 'Test Cultures', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2389: 5, 2401: 5 } },
        2350: { name: 'Transmitter', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2392: 5, 2398: 5 } },
        2351: { name: 'Viral Agent', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2393: 5, 2401: 5 } },
        2352: { name: 'Water-Cooled CPU', tier: 2, batchSize: 3, volume: 1.5, inputs: { 2331: 5, 3645: 5 } },

        // P3 - Specialized Commodities (3 P2 → 1 P3 per hour)
        2399: { name: 'Biotech Research Reports', tier: 3, batchSize: 1, volume: 6, inputs: { 2329: 3, 2352: 3 } },
        2400: { name: 'Camera Drones', tier: 3, batchSize: 1, volume: 6, inputs: { 2346: 3, 2339: 3 } },
        2401: { name: 'Condensates', tier: 3, batchSize: 1, volume: 6, inputs: { 2332: 3, 2351: 3 } },
        2402: { name: 'Cryoprotectant Solution', tier: 3, batchSize: 1, volume: 6, inputs: { 2329: 3, 2332: 3 } },
        2403: { name: 'Data Chips', tier: 3, batchSize: 1, volume: 6, inputs: { 2339: 3, 2352: 3 } },
        2404: { name: 'Guidance Systems', tier: 3, batchSize: 1, volume: 6, inputs: { 2337: 3, 2350: 3 } },
        2405: { name: 'Hermetic Membranes', tier: 3, batchSize: 1, volume: 6, inputs: { 2338: 3, 2345: 3 } },
        2406: { name: 'Hazmat Detection Systems', tier: 3, batchSize: 1, volume: 6, inputs: { 2338: 3, 2349: 3 } },
        2407: { name: 'Industrial Explosives', tier: 3, batchSize: 1, volume: 6, inputs: { 2334: 3, 2344: 3 } },
        2408: { name: 'Neocoms', tier: 3, batchSize: 1, volume: 6, inputs: { 2339: 3, 2350: 3 } },
        2409: { name: 'Nuclear Reactors', tier: 3, batchSize: 1, volume: 6, inputs: { 2333: 3, 2346: 3 } },
        2410: { name: 'Planetary Vehicles', tier: 3, batchSize: 1, volume: 6, inputs: { 2337: 3, 2336: 3 } },
        2411: { name: 'Robotics', tier: 3, batchSize: 1, volume: 6, inputs: { 2337: 3, 2349: 3 } },
        2412: { name: 'Smartfab Units', tier: 3, batchSize: 1, volume: 6, inputs: { 2330: 3, 2331: 3 } },
        2413: { name: 'Supercomputers', tier: 3, batchSize: 1, volume: 6, inputs: { 2347: 3, 2349: 3 } },
        2414: { name: 'Synthetic Synapses', tier: 3, batchSize: 1, volume: 6, inputs: { 2335: 3, 2338: 3 } },
        2415: { name: 'Transcranial Microcontrollers', tier: 3, batchSize: 1, volume: 6, inputs: { 2338: 3, 2352: 3 } },
        2416: { name: 'Ukomi Superconductors', tier: 3, batchSize: 1, volume: 6, inputs: { 2346: 3, 2351: 3 } },

        // P4 - Advanced Commodities (1 P3 → 1 P4 per hour, 2 different P3 required)
        2867: { name: 'Broadcast Node', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2413: 1 } },
        2868: { name: 'Integrity Response Drones', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2414: 1 } },
        2869: { name: 'Nano-Factory', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2412: 1 } },
        2870: { name: 'Organic Mortar Applicators', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2407: 1 } },
        2871: { name: 'Recursive Computing Module', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2415: 1 } },
        2872: { name: 'Self-Harmonizing Power Core', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2416: 1 } },
        2875: { name: 'Sterile Conduits', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2405: 1 } },
        2876: { name: 'Wetware Mainframe', tier: 4, batchSize: 1, volume: 100, inputs: { 2411: 1, 2399: 1 } }
    },

    // Factory types
    factories: {
        basic: {
            name: 'Basic Industry Facility',
            produces: 1, // P1
            inputs: 0,   // P0
            cycleTime: 30, // minutes per batch (3000 units)
            power: 800,
            cpu: 200
        },
        advanced: {
            name: 'Advanced Industry Facility',
            produces: 2, // P2/P3
            inputs: 1,   // P1/P2
            cycleTime: 60, // minutes per batch (P2: 5 units, P3: 3 units)
            power: 700,
            cpu: 500
        },
        hitech: {
            name: 'High-Tech Production Plant',
            produces: 3, // P4
            inputs: 2,   // P3
            cycleTime: 60,
            power: 400,
            cpu: 1100
        },
        extractor: {
            name: 'Extractor Head',
            produces: 0, // P0
            cycleTime: 15, // adjustable
            power: 550,
            cpu: 110
        }
    },

    // Schematic mappings (simplified)
    schematics: {
        // P1 schematics (from P0)
        2389: { input: [2287, 2311, 2268], qty: 3000, outputQty: 20 },
        2390: { input: [2288], qty: 3000, outputQty: 20 },
        2392: { input: [2268, 2309], qty: 3000, outputQty: 20 },
        2393: { input: [2269, 2324], qty: 3000, outputQty: 20 },
        2395: { input: [2308], qty: 3000, outputQty: 20 },
        2396: { input: [2307], qty: 3000, outputQty: 20 },
        2397: { input: [2288], qty: 3000, outputQty: 20 },
        2398: { input: [2320, 2312], qty: 3000, outputQty: 20 },
        2399: { input: [2267, 2321], qty: 3000, outputQty: 20 },
        2400: { input: [2268], qty: 3000, outputQty: 20 },
        2401: { input: [2311], qty: 3000, outputQty: 20 },
        3779: { input: [2269, 2288, 2311], qty: 3000, outputQty: 20 },
        2403: { input: [2272, 2268], qty: 3000, outputQty: 20 },
        3645: { input: [2269], qty: 3000, outputQty: 20 },
        3683: { input: [2306, 2307], qty: 3000, outputQty: 20 }
    },

    // Helper functions
    getMaterialById(id) {
        return this.materials[id] || null;
    },

    getMaterialsByTier(tier) {
        return Object.entries(this.materials)
            .filter(([_, mat]) => mat.tier === tier)
            .map(([id, mat]) => ({ id: parseInt(id), ...mat }));
    },

    getPlanetTypesForMaterial(materialId) {
        const result = [];
        for (const [type, data] of Object.entries(this.planets)) {
            if (data.p0Materials.includes(parseInt(materialId))) {
                result.push(type);
            }
        }
        return result;
    },

    getChainForProduct(productId, visited = new Set()) {
        const product = this.materials[productId];
        if (!product) return null;

        // Prevent infinite recursion
        if (visited.has(productId)) return null;
        visited.add(productId);

        const chain = {
            target: { id: parseInt(productId), ...product },
            inputs: []
        };

        if (product.inputs) {
            for (const [inputId, qty] of Object.entries(product.inputs)) {
                const inputMat = this.materials[inputId];
                if (inputMat) {
                    chain.inputs.push({
                        id: parseInt(inputId),
                        qty,
                        ...inputMat,
                        subChain: inputMat.inputs ? this.getChainForProduct(inputId, new Set(visited)) : null
                    });
                }
            }
        }

        return chain;
    },

    getRequiredP0Materials(productId) {
        const product = this.materials[productId];
        if (!product) return [];

        if (product.tier === 0) {
            return [{ id: parseInt(productId), ...product, qty: 1 }];
        }

        const p0List = [];
        const visited = new Set();

        const traverse = (id, qty) => {
            if (visited.has(id)) return;
            visited.add(id);

            const mat = this.materials[id];
            if (!mat) return;

            if (mat.tier === 0) {
                p0List.push({ id: parseInt(id), ...mat, qty });
                return;
            }

            if (mat.inputs) {
                for (const [inputId, inputQty] of Object.entries(mat.inputs)) {
                    traverse(inputId, qty * inputQty);
                }
            }
        };

        traverse(productId, 1);
        return p0List;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PI_DATA;
}
