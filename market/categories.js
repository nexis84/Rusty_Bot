// EVE Market Browser - Category Data
// Categories matching evemarketbrowser.com structure

const MarketCategories = {
    id: 0,
    name: "All Items",
    icon: "fa-boxes",
    children: [
        {
            id: "ammunition_charges",
            name: "Ammunition & Charges",
            icon: "fa-bullseye",
            categoryKey: "ammunition_and_charges"
        },
        {
            id: "blueprints_reactions",
            name: "Blueprints & Reactions",
            icon: "fa-scroll",
            categoryKey: "blueprints"
        },
        {
            id: "drones",
            name: "Drones",
            icon: "fa-dot-circle",
            categoryKey: "drones"
        },
        {
            id: "implants_boosters",
            name: "Implants & Boosters",
            icon: "fa-user-plus",
            categoryKey: "implants_and_boosters"
        },
        {
            id: "ship_equipment",
            name: "Ship Equipment",
            icon: "fa-cogs",
            categoryKey: "modules"
        },
        {
            id: "ships",
            name: "Ships",
            icon: "fa-rocket",
            categoryKey: "ships"
        },
        {
            id: "ship_skins",
            name: "Ship SKINs",
            icon: "fa-paint-brush",
            categoryKey: "skins"
        },
        {
            id: "apparel",
            name: "Apparel",
            icon: "fa-tshirt",
            categoryKey: "apparel"
        },
        {
            id: "deployables",
            name: "Deployables",
            icon: "fa-cube",
            categoryKey: "deployables"
        },
        {
            id: "subsystems",
            name: "Subsystems",
            icon: "fa-cogs",
            categoryKey: "subsystems"
        },
        {
            id: "special_edition",
            name: "Special Edition",
            icon: "fa-star",
            categoryKey: "special_edition"
        },
        {
            id: "planetary_industry",
            name: "Planetary Industry",
            icon: "fa-globe",
            categoryKey: "planetary_industry"
        },
        {
            id: "planetary_resources",
            name: "Planetary Resources",
            icon: "fa-leaf",
            categoryKey: "planetary_resources"
        },
        {
            id: "skills",
            name: "Skills",
            icon: "fa-graduation-cap",
            categoryKey: "skills"
        },
        {
            id: "structures",
            name: "Structures",
            icon: "fa-building",
            categoryKey: "structures"
        },
        {
            id: "trade_goods",
            name: "Trade Goods",
            icon: "fa-exchange-alt",
            categoryKey: "trade_goods"
        }
    ]
};

// SubCategories - uses SDE MarketTree data when available
// Falls back to filter-based groups if MarketTree is not loaded
const SubCategories = {
    // Ships subcategories
    ships: {
        groups: [
            { id: "corvettes", name: "Corvettes", filter: (item) => ['Reaper', 'Ibis', 'Velator', 'Impairor'].includes(item.name) },
            { id: "shuttles", name: "Shuttles", filter: (item) => item.name.toLowerCase().includes('shuttle') },
            { id: "frigates", name: "Standard Frigates", filter: (item) => !item.name.toLowerCase().includes('navy') && ['Rifter', 'Condor', 'Executioner', 'Atron', 'Bantam', 'Navitas', 'Burst', 'Slasher', 'Vigil', 'Merlin', 'Incursus', 'Imicus', 'Heron', 'Kestrel', 'Probe', 'Crucifier', 'Tristan', 'Breacher', 'Inquisitor', 'Tormentor', 'Punisher', 'Griffin'].some(n => item.name.includes(n)) },
            { id: "frigate_navy", name: "Navy Frigates", filter: (item) => item.name.toLowerCase().includes('navy') && item.name.toLowerCase().includes('issue') },
            { id: "destroyers", name: "Standard Destroyers", filter: (item) => ['Catalyst', 'Coercer', 'Cormorant', 'Thrasher', 'Algos', 'Corax', 'Dragoon', 'Sunesis', 'Catalyst', 'Thrasher', 'Cormorant'].some(n => item.name.includes(n)) },
            { id: "cruisers", name: "Standard Cruisers", filter: (item) => !item.name.toLowerCase().includes('navy') && ['Stabber', 'Moa', 'Maller', 'Vexor', 'Thorax', 'Rupture', 'Caracal', 'Omen', 'Arbitrator', 'Exequror', 'Bellicose', 'Blackbird', 'Augoror', 'Celestis'].some(n => item.name.includes(n)) },
            { id: "cruiser_navy", name: "Navy Cruisers", filter: (item) => item.name.toLowerCase().includes('navy') && item.name.toLowerCase().includes('issue') && !item.name.toLowerCase().includes('battleship') },
            { id: "battlecruisers", name: "Standard Battlecruisers", filter: (item) => !item.name.toLowerCase().includes('navy') && ['Hurricane', 'Ferox', 'Brutix', 'Prophecy', 'Drake', 'Myrmidon', 'Harbinger', 'Cyclone'].some(n => item.name.includes(n)) },
            { id: "battlecruiser_navy", name: "Navy Battlecruisers", filter: (item) => item.name.toLowerCase().includes('navy') && item.name.toLowerCase().includes('battlecruiser') },
            { id: "battleships", name: "Standard Battleships", filter: (item) => !item.name.toLowerCase().includes('navy') && ['Raven', 'Apocalypse', 'Megathron', 'Dominix', 'Tempest', 'Scorpion', 'Armageddon', 'Typhoon', 'Hyperion', 'Abaddon', 'Rokh', 'Maelstrom', 'Raven', 'Apocalypse'].some(n => item.name.includes(n)) },
            { id: "battleship_navy", name: "Navy Battleships", filter: (item) => item.name.toLowerCase().includes('navy') && item.name.toLowerCase().includes('battleship') },
            { id: "haulers", name: "Standard Haulers", filter: (item) => ['Badger', 'Tayra', 'Nereus', 'Kryos', 'Epithal', 'Miasmos', 'Iteron', 'Mammoth', 'Wreathe', 'Sigil', 'Bestower'].some(n => item.name.includes(n)) },
            { id: "mining_barges", name: "Mining Barges", filter: (item) => ['Covetor', 'Retriever', 'Procurer'].some(n => item.name === n) },
            { id: "exhumers", name: "Exhumers", filter: (item) => ['Mackinaw', 'Hulk', 'Skiff'].some(n => item.name === n) },
            { id: "freighters", name: "Freighters", filter: (item) => ['Providence', 'Charon', 'Obelisk', 'Fenrir', 'Bowhead'].some(n => item.name.includes(n)) },
            { id: "capitals", name: "Capital Ships", filter: (item) => ['Thanatos', 'Archon', 'Chimera', 'Nidhoggur', 'Moros', 'Naglfar', 'Phoenix', 'Revelation', 'Wyvern', 'Aeon', 'Nyx', 'Hel', 'Avatar', 'Erebus', 'Ragnarok', 'Leviathan'].some(n => item.name.includes(n)) },
            { id: "pirate", name: "Pirate Faction Ships", filter: (item) => ['Gila', 'Vagabond', 'Cynabal', 'Stratios', 'Orthrus', 'Barghest', 'Machariel', 'Nightmare', 'Vindicator', 'Rattlesnake', 'Bhaalgorn', 'Ashimmu', 'Succubus', 'Cruor', 'Dramiel', 'Worm', 'Garmur', 'Daredevil'].some(n => item.name.includes(n)) }
        ]
    },
    // Modules subcategories  
    modules: {
        groups: [
            { id: "turrets", name: "Turrets & Launchers", filter: (item) => item.name.toLowerCase().includes('blaster') || item.name.toLowerCase().includes('railgun') || item.name.toLowerCase().includes('cannon') || item.name.toLowerCase().includes('autocannon') || item.name.toLowerCase().includes('artillery') || item.name.toLowerCase().includes('laser') || item.name.toLowerCase().includes('beam') || item.name.toLowerCase().includes('pulse') || item.name.toLowerCase().includes('missile launcher') || item.name.toLowerCase().includes('rocket launcher') || item.name.toLowerCase().includes('torpedo') },
            { id: "shield", name: "Shield", filter: (item) => item.name.toLowerCase().includes('shield') && !item.name.toLowerCase().includes('harden') },
            { id: "shield_hardeners", name: "Shield Hardeners", filter: (item) => item.name.toLowerCase().includes('shield hardener') || item.name.toLowerCase().includes('invulnerability') },
            { id: "armor", name: "Armor", filter: (item) => (item.name.toLowerCase().includes('armor') && !item.name.toLowerCase().includes('hardener')) || item.name.toLowerCase().includes('plate') || item.name.toLowerCase().includes('damage control') },
            { id: "armor_hardeners", name: "Armor Hardeners", filter: (item) => item.name.toLowerCase().includes('armor hardener') || item.name.toLowerCase().includes('plating') || item.name.toLowerCase().includes('coating') },
            { id: "propulsion", name: "Propulsion", filter: (item) => item.name.toLowerCase().includes('afterburner') || item.name.toLowerCase().includes('microwarpdrive') || item.name.toLowerCase().includes('microwarp drive') },
            { id: "capacitor", name: "Capacitor", filter: (item) => item.name.toLowerCase().includes('capacitor') || item.name.toLowerCase().includes('cap battery') || item.name.toLowerCase().includes('capacitor booster') || item.name.toLowerCase().includes('cap recharger') },
            { id: "ewar", name: "Electronic Warfare", filter: (item) => item.name.toLowerCase().includes('ecm') || item.name.toLowerCase().includes('sensor damp') || item.name.toLowerCase().includes('tracking disrupt') || item.name.toLowerCase().includes('target painter') || item.name.toLowerCase().includes('warp scram') || item.name.toLowerCase().includes('warp disrupt') }
        ]
    },
    // Drones subcategories
    drones: {
        groups: [
            { id: "combat_drones", name: "Combat Drones", filter: (item) => ['Warrior', 'Valkyrie', 'Hobgoblin', 'Hammerhead', 'Ogre', 'Berserker', 'Wasp', 'Praetor', 'Infiltrator', 'Vespa', 'Hornet', 'Acolyte'].some(n => item.name.includes(n)) && !item.name.toLowerCase().includes('blueprint') },
            { id: "mining_drones", name: "Mining Drones", filter: (item) => item.name.toLowerCase().includes('mining drone') },
            { id: "logistic_drones", name: "Logistic Drones", filter: (item) => item.name.toLowerCase().includes('maintenance') },
            { id: "sentry_drones", name: "Sentry Drones", filter: (item) => ['Bouncer', 'Curator', 'Warden', 'Garde'].some(n => item.name.includes(n)) },
            { id: "fighters", name: "Fighters", filter: (item) => ['Dragonfly', 'Firbolg', 'Einherji', 'Templar'].some(n => item.name.includes(n)) || item.name.toLowerCase().includes('light fighter') || item.name.toLowerCase().includes('heavy fighter') }
        ]
    },
    // Implants subcategories
    implants_and_boosters: {
        groups: [
            { id: "implants", name: "Implants", filter: (item) => item.name.toLowerCase().includes('implant') || item.name.toLowerCase().includes('hardwiring') },
            { id: "boosters", name: "Boosters", filter: (item) => item.name.toLowerCase().includes('booster') && !item.name.toLowerCase().includes('cap booster') }
        ]
    },
    // Skills subcategories
    skills: {
        groups: [
            { id: "spaceship_command", name: "Spaceship Command", filter: (item) => item.name.toLowerCase().includes('spaceship command') },
            { id: "gunnery", name: "Gunnery", filter: (item) => item.name.toLowerCase().includes('gunnery') },
            { id: "missiles", name: "Missiles", filter: (item) => item.name.toLowerCase().includes('missiles') },
            { id: "navigation", name: "Navigation", filter: (item) => item.name.toLowerCase().includes('navigation') },
            { id: "engineering", name: "Engineering", filter: (item) => item.name.toLowerCase().includes('engineering') || item.name.toLowerCase().includes('armor') || item.name.toLowerCase().includes('shield') },
            { id: "electronics", name: "Electronics", filter: (item) => item.name.toLowerCase().includes('electronics') || item.name.toLowerCase().includes('targeting') },
            { id: "drones_skill", name: "Drones", filter: (item) => item.name.toLowerCase().includes('drones') },
            { id: "trade", name: "Trade", filter: (item) => item.name.toLowerCase().includes('trade') },
            { id: "industry", name: "Industry", filter: (item) => item.name.toLowerCase().includes('industry') || item.name.toLowerCase().includes('research') },
            { id: "other_skills", name: "Other Skills", filter: (item) => true }
        ]
    },
    // Blueprints subcategories - ordered to match in-game market grouping
    blueprints: {
        groups: [
            { id: "ammunition_blueprints", name: "Ammunition & Charges", filter: (item) => item.name.toLowerCase().includes('blueprint') && (item.name.toLowerCase().includes('charge') || item.name.toLowerCase().includes('crystal') || item.name.toLowerCase().includes(' ammo') || item.name.toLowerCase().includes('missile') || item.name.toLowerCase().includes('torpedo') || item.name.toLowerCase().includes('rocket') || item.name.toLowerCase().includes('battery') || item.name.toLowerCase().includes('capacitor booster') || item.name.toLowerCase().includes('nanite paste') || item.name.toLowerCase().includes('bomb')) },
            { id: "drone_blueprints", name: "Drones", filter: (item) => {
                const lowerName = item.name.toLowerCase();
                const droneNames = ['warrior', 'valkyrie', 'hobgoblin', 'hammerhead', 'ogre', 'berserker', 'wasp', 'praetor', 'infiltrator', 'vespa', 'hornet', 'acolyte'];
                return lowerName.includes('blueprint') && (lowerName.includes('drone') || lowerName.includes('fighter') || droneNames.some(n => lowerName.includes(n)));
            }},
            { id: "manufacture_research", name: "Manufacture & Research", filter: (item) => {
                const lowerName = item.name.toLowerCase();
                if (lowerName.includes('reaction formula') || lowerName.includes('standup')) return false;
                return !lowerName.includes('blueprint')
                    || lowerName.includes('copy')
                    || lowerName.includes('invention')
                    || lowerName.includes('research')
                    || lowerName.includes('optimization')
                    || lowerName.includes('fullerite')
                    || lowerName.includes('cytoserocin')
                    || lowerName.includes('mykoserocin')
                    || lowerName.includes('tricarboxyl')
                    || lowerName.includes('container');
            }},
            { id: "reaction_formulas", name: "Reaction Formulas", filter: (item) => item.name.toLowerCase().includes('reaction formula') },
            { id: "ship_equipment_blueprints", name: "Ship Equipment", filter: (item) => {
                const lowerName = item.name.toLowerCase();
                return lowerName.includes('blueprint')
                    && !lowerName.includes('standup')
                    && !lowerName.includes('rig')
                    && (lowerName.includes('laser') || lowerName.includes('lance') || lowerName.includes('disruptive') || lowerName.includes('mutagen') || lowerName.includes('decomposer') || lowerName.includes('blaster') || lowerName.includes('railgun') || lowerName.includes('autocannon') || lowerName.includes('artillery') || lowerName.includes('missile launcher') || lowerName.includes('turret') || lowerName.includes('afterburner') || lowerName.includes('microwarpdrive') || lowerName.includes('shield') || lowerName.includes('armor') || lowerName.includes('repairer') || lowerName.includes('harden') || lowerName.includes('plating') || lowerName.includes('ecm') || lowerName.includes('sensor') || lowerName.includes('warp') || lowerName.includes('capacitor') || lowerName.includes('power diagnostic') || lowerName.includes('reactor control') || lowerName.includes('mining laser') || lowerName.includes('strip miner') || lowerName.includes('tractor beam') || lowerName.includes('salvager') || lowerName.includes('smartbomb') || lowerName.includes('vampire') || lowerName.includes('neutralizer') || lowerName.includes('atgeir') || lowerName.includes('grenade') || lowerName.includes('flux') || lowerName.includes('coilgun'));
            }},
            { id: "ship_modifications", name: "Ship Modifications", filter: (item) => {
                const lowerName = item.name.toLowerCase();
                return lowerName.includes('blueprint') && !lowerName.includes('standup') && lowerName.includes('rig');
            }},
            // Ship hull blueprints exclude module/structure/utility blueprint keywords
            { id: "ship_blueprints", name: "Ships", filter: (item) => {
                const lowerName = item.name.toLowerCase();
                if (!lowerName.endsWith(' blueprint')) return false;

                // Primary path: exact hull-name match against known ships dataset.
                // This is the most accurate in browser/runtime where AllMarketItems is loaded.
                if (typeof AllMarketItems !== 'undefined' && AllMarketItems?.ships?.items) {
                    if (typeof globalThis.__shipBlueprintNameSet === 'undefined') {
                        globalThis.__shipBlueprintNameSet = new Set(
                            AllMarketItems.ships.items
                                .map(ship => String(ship.name || '').trim().toLowerCase())
                                .filter(Boolean)
                        );
                    }

                    const hullName = item.name.replace(/\s+blueprint$/i, '').trim().toLowerCase();
                    return globalThis.__shipBlueprintNameSet.has(hullName);
                }

                const nonShipKeywords = [
                    'standup', 'control tower', 'module', 'launcher', 'hardener', 'damage control',
                    'jammer', 'disruptor', 'scrambler', 'extender', 'subcontroller', 'probe', 'booster',
                    'laser', 'lance', 'disruptive', 'mutagen', 'decomposer', 'blaster', 'railgun',
                    'autocannon', 'artillery', 'turret', 'afterburner', 'microwarpdrive', 'shield',
                    'armor', 'repairer', 'harden', 'plating', 'ecm', 'sensor', 'warp', 'capacitor',
                    'power diagnostic', 'reactor control', 'rig', 'mining laser', 'strip miner',
                    'tractor beam', 'salvager', 'smartbomb', 'vampire', 'neutralizer', 'atgeir',
                    'grenade', 'flux', 'coilgun', 'charge', 'crystal', ' ammo', 'missile', 'torpedo',
                    'rocket', 'battery', 'nanite paste', 'bomb', 'drone', 'fighter', 'warrior',
                    'valkyrie', 'hobgoblin', 'hammerhead', 'ogre', 'berserker', 'wasp', 'praetor',
                    'infiltrator', 'vespa', 'hornet', 'acolyte', 'astrahus', 'fortizar', 'keepstar',
                    'athanor', 'tatara', 'azbel', 'sotiyo', 'raitaru', 'poco', 'customs office',
                    'citadel', 'refinery', 'engineering complex', 'prospecting array', 'moon mining',
                    'component', 'fuel block', 'capital construction', 'tech ii component',
                    'structure component'
                ];

                return !nonShipKeywords.some(kw => lowerName.includes(kw));
            }},
            { id: "structure_equipment", name: "Structure Equipment", filter: (item) => {
                const lowerName = item.name.toLowerCase();
                return lowerName.includes('blueprint')
                    && lowerName.includes('standup')
                    && !lowerName.includes('set')
                    && !lowerName.includes('rig');
            }},
            { id: "structure_modifications", name: "Structure Modifications", filter: (item) => {
                const lowerName = item.name.toLowerCase();
                return lowerName.includes('blueprint')
                    && lowerName.includes('standup')
                    && (lowerName.includes('set') || lowerName.includes('rig'));
            }},
            { id: "structures", name: "Structures", filter: (item) => item.name.toLowerCase().includes('blueprint') && (item.name.toLowerCase().includes('astrahus') || item.name.toLowerCase().includes('fortizar') || item.name.toLowerCase().includes('keepstar') || item.name.toLowerCase().includes('athanor') || item.name.toLowerCase().includes('tatara') || item.name.toLowerCase().includes('azbel') || item.name.toLowerCase().includes('sotiyo') || item.name.toLowerCase().includes('raitaru') || item.name.toLowerCase().includes('poco') || item.name.toLowerCase().includes('customs office') || item.name.toLowerCase().includes('citadel') || item.name.toLowerCase().includes('refinery') || item.name.toLowerCase().includes('engineering complex') || item.name.toLowerCase().includes('prospecting array') || item.name.toLowerCase().includes('moon mining')) },
            { id: "other_blueprints", name: "Other", filter: (item) => item.name.toLowerCase().includes('blueprint') }
        ]
    }
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MarketCategories, SubCategories };
}
