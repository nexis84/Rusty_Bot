// EVE Market Browser - Category Data
// Categories and popular items for browsing

const MarketCategories = {
    id: 0,
    name: "All Items",
    icon: "fa-boxes",
    children: [
        {
            id: 4,
            name: "Material",
            icon: "fa-cube",
            children: [
                { id: 4, name: "Material", children: [
                    { id: 34, name: "Tritanium" },
                    { id: 35, name: "Pyerite" },
                    { id: 36, name: "Mexallon" },
                    { id: 37, name: "Isogen" },
                    { id: 38, name: "Nocxium" },
                    { id: 39, name: "Zydrine" },
                    { id: 40, name: "Megacyte" },
                    { id: 11399, name: "Morphite" }
                ]},
                { id: 1034, name: "Salvaged Materials", children: [
                    { id: 25588, name: "Armor Plates" },
                    { id: 25605, name: "Capacitor Console" },
                    { id: 25600, name: "Charred Micro Circuit" },
                    { id: 25596, name: "Conductive Polymer" },
                    { id: 25592, name: "Contaminated Nanite Compound" },
                    { id: 25590, name: "Damaged Artificial Neural Network" },
                    { id: 25604, name: "Defective Current Pump" },
                    { id: 25601, name: "Fried Interface Circuit" },
                    { id: 25595, name: "Malfunctioning Shield Emitter" },
                    { id: 25597, name: "Melted Capacitor Console" },
                    { id: 25603, name: "Scorched Telemetry Processor" },
                    { id: 25589, name: "Smashed Trigger Unit" },
                    { id: 25602, name: "Tangled Power Conduit" },
                    { id: 25593, name: "Thruster Console" },
                    { id: 25591, name: "Tripped Power Circuit" },
                    { id: 25594, name: "Ward Console" }
                ]},
                { id: 1035, name: "Planetary Materials", children: [
                    { id: 2268, name: "Aqueous Liquids" },
                    { id: 2305, name: "Autotrophs" },
                    { id: 2267, name: "Base Metals" },
                    { id: 2288, name: "Carbon Compounds" },
                    { id: 2287, name: "Complex Organisms" },
                    { id: 2307, name: "Felsic Magma" },
                    { id: 2272, name: "Heavy Metals" },
                    { id: 2309, name: "Ionic Solutions" },
                    { id: 2073, name: "Micro Organisms" },
                    { id: 2310, name: "Noble Gases" },
                    { id: 2306, name: "Non-CS Crystals" },
                    { id: 2286, name: "Planktic Colonies" },
                    { id: 2311, name: "Reactive Gas" },
                    { id: 2308, name: "Suspended Plasma" }
                ]}
            ]
        },
        {
            id: 9,
            name: "Ships",
            icon: "fa-rocket",
            children: [
                { id: 25, name: "Frigate", children: [
                    { id: 587, name: "Rifter" },
                    { id: 586, name: "Condor" },
                    { id: 583, name: "Executioner" },
                    { id: 585, name: "Atron" },
                    { id: 582, name: "Bantam" },
                    { id: 592, name: "Navitas" },
                    { id: 590, name: "Burst" },
                    { id: 588, name: "Slasher" },
                    { id: 591, name: "Vigil" },
                    { id: 594, name: "Merlin" },
                    { id: 595, name: "Incursus" },
                    { id: 597, name: "Imicus" },
                    { id: 598, name: "Heron" },
                    { id: 599, name: "Kestrel" },
                    { id: 600, name: "Probe" },
                    { id: 11134, name: "Crucifier" }
                ]},
                { id: 26, name: "Cruiser", children: [
                    { id: 620, name: "Stabber" },
                    { id: 622, name: "Moa" },
                    { id: 623, name: "Maller" },
                    { id: 624, name: "Vexor" },
                    { id: 625, name: "Thorax" },
                    { id: 626, name: "Rupture" },
                    { id: 627, name: "Caracal" },
                    { id: 628, name: "Omen" },
                    { id: 629, name: "Arbitrator" },
                    { id: 630, name: "Exequror" },
                    { id: 631, name: "Bellicose" },
                    { id: 632, name: "Blackbird" },
                    { id: 633, name: "Augoror" },
                    { id: 634, name: "Vexor Navy Issue" }
                ]},
                { id: 27, name: "Battleship", children: [
                    { id: 642, name: "Raven" },
                    { id: 643, name: "Apocalypse" },
                    { id: 644, name: "Megathron" },
                    { id: 645, name: "Dominix" },
                    { id: 638, name: "Tempest" },
                    { id: 639, name: "Scorpion" },
                    { id: 640, name: "Armageddon" },
                    { id: 641, name: "Typhoon" },
                    { id: 552, name: "Hyperion" },
                    { id: 634, name: "Abaddon" },
                    { id: 635, name: "Rokh" },
                    { id: 636, name: "Maelstrom" }
                ]},
                { id: 513, name: "Industrial", children: [
                    { id: 648, name: "Badger" },
                    { id: 649, name: "Tayra" },
                    { id: 650, name: "Nereus" },
                    { id: 651, name: "Kryos" },
                    { id: 652, name: "Epithal" },
                    { id: 653, name: "Miasmos" },
                    { id: 654, name: "Iteron Mark V" },
                    { id: 656, name: "Mammoth" },
                    { id: 657, name: "Wreathe" },
                    { id: 658, name: "Sigil" },
                    { id: 660, name: "Bestower" },
                    { id: 661, name: "Providence" },
                    { id: 662, name: "Charon" },
                    { id: 663, name: "Obelisk" },
                    { id: 665, name: "Fenrir" }
                ]},
                { id: 28, name: "Capsule", children: [] },
                { id: 419, name: "Battlecruiser", children: [
                    { id: 24696, name: "Hurricane" },
                    { id: 24694, name: "Ferox" },
                    { id: 24698, name: "Brutix" },
                    { id: 24700, name: "Prophecy" },
                    { id: 24688, name: "Drake" },
                    { id: 24690, name: "Myrmidon" },
                    { id: 24692, name: "Harbinger" },
                    { id: 24702, name: "Cyclone" }
                ]},
                { id: 420, name: "Destroyer", children: [
                    { id: 16236, name: "Catalyst" },
                    { id: 16238, name: "Coercer" },
                    { id: 16240, name: "Cormorant" },
                    { id: 16242, name: "Thrasher" }
                ]}
            ]
        },
        {
            id: 23,
            name: "Structures",
            icon: "fa-building",
            children: [
                { id: 35921, name: "Standup Weapons", children: [
                    { id: 35921, name: "Standup Anticapital Missile Launcher I" },
                    { id: 47323, name: "Standup Anticapital Missile Launcher II" },
                    { id: 35928, name: "Standup Arcing Vorton Projector I" },
                    { id: 35923, name: "Standup Guided Bomb Launcher I" },
                    { id: 47325, name: "Standup Guided Bomb Launcher II" }
                ]},
                { id: 35881, name: "Structure Rigs", children: [
                    { id: 37174, name: "Standup L-Set Advanced Component Manufacturing Efficiency I" },
                    { id: 37175, name: "Standup L-Set Advanced Component Manufacturing Efficiency II" }
                ]},
                { id: 35878, name: "Structure Modules", children: [
                    { id: 35881, name: "Standup Capital Shipyard I" },
                    { id: 35894, name: "Standup Cloning Center I" },
                    { id: 35886, name: "Standup Invention Lab I" },
                    { id: 35878, name: "Standup Manufacturing Plant I" },
                    { id: 35892, name: "Standup Market Hub I" }
                ]}
            ]
        },
        {
            id: 7,
            name: "Modules",
            icon: "fa-microchip",
            children: [
                { id: 8, name: "Turrets & Launchers", children: [
                    { id: 55, name: "Projectile Weapon", children: [
                        { id: 292, name: "125mm Gatling AutoCannon I" },
                        { id: 293, name: "150mm Light AutoCannon I" },
                        { id: 294, name: "200mm AutoCannon I" },
                        { id: 295, name: "250mm Light Artillery Cannon I" },
                        { id: 296, name: "280mm Howitzer Artillery I" },
                        { id: 297, name: "650mm Artillery Cannon I" },
                        { id: 298, name: "720mm Howitzer Artillery I" },
                        { id: 299, name: "800mm Repeating Cannon I" },
                        { id: 300, name: "1200mm Artillery Cannon I" },
                        { id: 301, name: "1400mm Howitzer Artillery I" }
                    ]},
                    { id: 74, name: "Missile Launcher", children: [
                        { id: 1849, name: "Rocket Launcher I" },
                        { id: 1850, name: "Light Missile Launcher I" },
                        { id: 1851, name: "Heavy Missile Launcher I" },
                        { id: 1852, name: "Torpedo Launcher I" },
                        { id: 1853, name: "Siege Missile Launcher I" },
                        { id: 2420, name: "Rapid Light Missile Launcher I" },
                        { id: 2569, name: "Cruise Missile Launcher I" }
                    ]},
                    { id: 53, name: "Hybrid Weapon", children: [
                        { id: 315, name: "Light Electron Blaster I" },
                        { id: 316, name: "Light Ion Blaster I" },
                        { id: 317, name: "Light Neutron Blaster I" },
                        { id: 318, name: "Light Railgun I" },
                        { id: 319, name: "Heavy Electron Blaster I" },
                        { id: 320, name: "Heavy Ion Blaster I" },
                        { id: 321, name: "Heavy Neutron Blaster I" },
                        { id: 322, name: "Heavy Railgun I" },
                        { id: 323, name: "Electron Blaster Cannon I" },
                        { id: 324, name: "Ion Blaster Cannon I" },
                        { id: 325, name: "Neutron Blaster Cannon I" },
                        { id: 326, name: "425mm Railgun I" },
                        { id: 327, name: "650mm Artillery Cannon I" }
                    ]},
                    { id: 54, name: "Energy Weapon", children: [
                        { id: 302, name: "Dual Light Beam Laser I" },
                        { id: 303, name: "Dual Light Pulse Laser I" },
                        { id: 304, name: "Medium Beam Laser I" },
                        { id: 305, name: "Medium Pulse Laser I" },
                        { id: 306, name: "Dual Heavy Beam Laser I" },
                        { id: 307, name: "Dual Heavy Pulse Laser I" },
                        { id: 308, name: "Mega Beam Laser I" },
                        { id: 309, name: "Mega Pulse Laser I" },
                        { id: 310, name: "Tachyon Beam Laser I" },
                        { id: 311, name: "Tachyon Pulse Laser I" }
                    ]}
                ]},
                { id: 76, name: "Shield", children: [
                    { id: 77, name: "Shield Extender", children: [
                        { id: 377, name: "Small Shield Extender I" },
                        { id: 378, name: "Medium Shield Extender I" },
                        { id: 379, name: "Large Shield Extender I" },
                        { id: 380, name: "Micro Shield Extender I" }
                    ]},
                    { id: 78, name: "Shield Hardener", children: [
                        { id: 384, name: "EM Shield Hardener I" },
                        { id: 385, name: "Explosive Shield Hardener I" },
                        { id: 386, name: "Kinetic Shield Hardener I" },
                        { id: 387, name: "Thermal Shield Hardener I" },
                        { id: 388, name: "Adaptive Invulnerability Field I" },
                        { id: 389, name: "Shield Boost Amplifier I" }
                    ]},
                    { id: 40, name: "Shield Recharger", children: [
                        { id: 190, name: "Shield Recharger I" },
                        { id: 191, name: "Shield Power Relay I" },
                        { id: 192, name: "Shield Flux Coil I" }
                    ]},
                    { id: 39, name: "Shield Booster", children: [
                        { id: 361, name: "Small Shield Booster I" },
                        { id: 362, name: "Medium Shield Booster I" },
                        { id: 363, name: "Large Shield Booster I" },
                        { id: 364, name: "X-Large Shield Booster I" },
                        { id: 4027, name: "Micro Shield Booster I" }
                    ]}
                ]},
                { id: 1210, name: "Armor", children: [
                    { id: 329, name: "Armor Repair Unit", children: [
                        { id: 338, name: "Small Armor Repairer I" },
                        { id: 339, name: "Medium Armor Repairer I" },
                        { id: 340, name: "Large Armor Repairer I" }
                    ]},
                    { id: 98, name: "Armor Plates", children: [
                        { id: 323, name: "200mm Rolled Tungsten Compact Plates" },
                        { id: 324, name: "400mm Rolled Tungsten Compact Plates" },
                        { id: 326, name: "800mm Rolled Tungsten Compact Plates" },
                        { id: 327, name: "1600mm Rolled Tungsten Compact Plates" }
                    ]},
                    { id: 326, name: "Armor Hardener", children: [
                        { id: 354, name: "EM Armor Hardener I" },
                        { id: 355, name: "Explosive Armor Hardener I" },
                        { id: 356, name: "Kinetic Armor Hardener I" },
                        { id: 357, name: "Thermal Armor Hardener I" },
                        { id: 9832, name: "Adaptive Nano Plating I" }
                    ]},
                    { id: 285, name: "Damage Control", children: [
                        { id: 2048, name: "Damage Control I" }
                    ]}
                ]},
                { id: 1182, name: "Propulsion", children: [
                    { id: 46, name: "Propulsion Module", children: [
                        { id: 210, name: "1MN Afterburner I" },
                        { id: 211, name: "10MN Afterburner I" },
                        { id: 212, name: "100MN Afterburner I" },
                        { id: 343, name: "1MN Microwarpdrive I" },
                        { id: 344, name: "10MN Microwarpdrive I" },
                        { id: 345, name: "100MN Microwarpdrive I" }
                    ]}
                ]},
                { id: 209, name: "Electronic Warfare", children: [
                    { id: 71, name: "ECM", children: [
                        { id: 210, name: "ECM Burst I" },
                        { id: 211, name: "ECM - Spatial Destabilizer I" },
                        { id: 212, name: "ECM - Phase Inverter I" },
                        { id: 213, name: "ECM - Ion Field Projector I" },
                        { id: 214, name: "ECM - Multispectral Jammer I" }
                    ]},
                    { id: 72, name: "Weapon Disruption", children: [
                        { id: 221, name: "Tracking Disruptor I" },
                        { id: 222, name: "Sensor Dampener I" },
                        { id: 223, name: "Tracking Link I" }
                    ]},
                    { id: 73, name: "Warp Scrambling", children: [
                        { id: 448, name: "Warp Scrambler I" },
                        { id: 449, name: "Warp Disruptor I" }
                    ]}
                ]}
            ]
        },
        {
            id: 8,
            name: "Ammunition & Charges",
            icon: "fa-bullseye",
            children: [
                { id: 85, name: "Projectile Ammo", children: [
                    { id: 182, name: "Carbonized Lead S" },
                    { id: 183, name: "Nuclear S" },
                    { id: 184, name: "Proton S" },
                    { id: 185, name: "Depleted Uranium S" },
                    { id: 186, name: "Titanium Sabot S" },
                    { id: 187, name: "Fusion S" },
                    { id: 188, name: "Phased Plasma S" },
                    { id: 189, name: "EMP S" },
                    { id: 190, name: "Carbonized Lead M" },
                    { id: 191, name: "Nuclear M" },
                    { id: 192, name: "Proton M" },
                    { id: 193, name: "Depleted Uranium M" },
                    { id: 194, name: "Titanium Sabot M" },
                    { id: 195, name: "Fusion M" },
                    { id: 196, name: "Phased Plasma M" },
                    { id: 197, name: "EMP M" },
                    { id: 198, name: "Carbonized Lead L" },
                    { id: 199, name: "Nuclear L" },
                    { id: 200, name: "Proton L" },
                    { id: 201, name: "Depleted Uranium L" },
                    { id: 202, name: "Titanium Sabot L" },
                    { id: 203, name: "Fusion L" },
                    { id: 204, name: "Phased Plasma L" },
                    { id: 205, name: "EMP L" }
                ]},
                { id: 86, name: "Hybrid Charges", children: [
                    { id: 215, name: "Antimatter Charge S" },
                    { id: 216, name: "Iridium Charge S" },
                    { id: 217, name: "Iron Charge S" },
                    { id: 218, name: "Lead Charge S" },
                    { id: 219, name: "Plutonium Charge S" },
                    { id: 220, name: "Thorium Charge S" },
                    { id: 221, name: "Tungsten Charge S" },
                    { id: 222, name: "Uranium Charge S" },
                    { id: 223, name: "Antimatter Charge M" },
                    { id: 224, name: "Iridium Charge M" },
                    { id: 225, name: "Iron Charge M" },
                    { id: 226, name: "Lead Charge M" },
                    { id: 227, name: "Plutonium Charge M" },
                    { id: 228, name: "Thorium Charge M" },
                    { id: 229, name: "Tungsten Charge M" },
                    { id: 230, name: "Uranium Charge M" },
                    { id: 231, name: "Antimatter Charge L" },
                    { id: 232, name: "Iridium Charge L" },
                    { id: 233, name: "Iron Charge L" },
                    { id: 234, name: "Lead Charge L" },
                    { id: 235, name: "Plutonium Charge L" },
                    { id: 236, name: "Thorium Charge L" },
                    { id: 237, name: "Tungsten Charge L" },
                    { id: 238, name: "Uranium Charge L" }
                ]},
                { id: 89, name: "Frequency Crystals", children: [
                    { id: 255, name: "Multifrequency S" },
                    { id: 256, name: "Radio S" },
                    { id: 257, name: "Microwave S" },
                    { id: 258, name: "Infrared S" },
                    { id: 259, name: "Standard S" },
                    { id: 260, name: "Ultraviolet S" },
                    { id: 261, name: "Xray S" },
                    { id: 262, name: "Gamma S" },
                    { id: 263, name: "Multifrequency M" },
                    { id: 264, name: "Radio M" },
                    { id: 265, name: "Microwave M" },
                    { id: 266, name: "Infrared M" },
                    { id: 267, name: "Standard M" },
                    { id: 268, name: "Ultraviolet M" },
                    { id: 269, name: "Xray M" },
                    { id: 270, name: "Gamma M" }
                ]},
                { id: 90, name: "Missiles", children: [
                    { id: 245, name: "Inferno Rocket" },
                    { id: 246, name: "Nova Rocket" },
                    { id: 247, name: "Scourge Rocket" },
                    { id: 248, name: "Mjolnir Rocket" },
                    { id: 249, name: "Inferno Light Missile" },
                    { id: 250, name: "Nova Light Missile" },
                    { id: 251, name: "Scourge Light Missile" },
                    { id: 252, name: "Mjolnir Light Missile" },
                    { id: 253, name: "Inferno Heavy Missile" },
                    { id: 254, name: "Nova Heavy Missile" },
                    { id: 255, name: "Scourge Heavy Missile" },
                    { id: 256, name: "Mjolnir Heavy Missile" },
                    { id: 257, name: "Inferno Torpedo" },
                    { id: 258, name: "Nova Torpedo" },
                    { id: 259, name: "Scourge Torpedo" },
                    { id: 260, name: "Mjolnir Torpedo" }
                ]},
                { id: 91, name: "Capacitor Booster Charges", children: [
                    { id: 1123, name: "Cap Booster 25" },
                    { id: 1124, name: "Cap Booster 50" },
                    { id: 1125, name: "Cap Booster 75" },
                    { id: 1126, name: "Cap Booster 100" },
                    { id: 1127, name: "Cap Booster 150" },
                    { id: 1128, name: "Cap Booster 200" },
                    { id: 1129, name: "Cap Booster 400" },
                    { id: 1130, name: "Cap Booster 800" }
                ]},
                { id: 92, name: "Nanite Repair Paste", children: [
                    { id: 28668, name: "Nanite Repair Paste" }
                ]}
            ]
        },
        {
            id: 20,
            name: "Trade Goods",
            icon: "fa-coins",
            children: [
                { id: 43, name: "Trade Goods", children: [
                    { id: 34, name: "Tritanium" },
                    { id: 35, name: "Pyerite" },
                    { id: 36, name: "Mexallon" },
                    { id: 37, name: "Isogen" },
                    { id: 38, name: "Nocxium" },
                    { id: 39, name: "Zydrine" },
                    { id: 40, name: "Megacyte" },
                    { id: 11399, name: "Morphite" }
                ]},
                { id: 964, name: "Plex", children: [
                    { id: 44992, name: "30 Day Pilot's License Extension (PLEX)" },
                    { id: 48568, name: "Daily Alpha Injector" },
                    { id: 40520, name: "Large Skill Injector" },
                    { id: 40519, name: "Small Skill Injector" }
                ]}
            ]
        },
        {
            id: 3,
            name: "Blueprints",
            icon: "fa-scroll",
            children: [
                { id: 16, name: "Ship Blueprints", children: [
                    { id: 683, name: "Rifter Blueprint" },
                    { id: 684, name: "Condor Blueprint" },
                    { id: 685, name: "Executioner Blueprint" },
                    { id: 686, name: "Atron Blueprint" },
                    { id: 687, name: "Stabber Blueprint" },
                    { id: 688, name: "Moa Blueprint" },
                    { id: 689, name: "Maller Blueprint" },
                    { id: 690, name: "Vexor Blueprint" },
                    { id: 691, name: "Thorax Blueprint" },
                    { id: 692, name: "Rupture Blueprint" },
                    { id: 693, name: "Caracal Blueprint" },
                    { id: 694, name: "Omen Blueprint" },
                    { id: 695, name: "Raven Blueprint" },
                    { id: 696, name: "Apocalypse Blueprint" },
                    { id: 697, name: "Megathron Blueprint" },
                    { id: 698, name: "Dominix Blueprint" }
                ]},
                { id: 17, name: "Module Blueprints", children: [
                    { id: 699, name: "Small Armor Repairer I Blueprint" },
                    { id: 700, name: "Medium Armor Repairer I Blueprint" },
                    { id: 701, name: "Large Armor Repairer I Blueprint" },
                    { id: 702, name: "Small Shield Booster I Blueprint" },
                    { id: 703, name: "Medium Shield Booster I Blueprint" },
                    { id: 704, name: "Large Shield Booster I Blueprint" }
                ]},
                { id: 18, name: "Ammunition Blueprints", children: [
                    { id: 705, name: "Antimatter Charge S Blueprint" },
                    { id: 706, name: "Iridium Charge S Blueprint" },
                    { id: 707, name: "Iron Charge S Blueprint" },
                    { id: 708, name: "Lead Charge S Blueprint" },
                    { id: 709, name: "Plutonium Charge S Blueprint" },
                    { id: 710, name: "Thorium Charge S Blueprint" },
                    { id: 711, name: "Tungsten Charge S Blueprint" },
                    { id: 712, name: "Uranium Charge S Blueprint" }
                ]}
            ]
        },
        {
            id: 24,
            name: "Implants",
            icon: "fa-brain",
            children: [
                { id: 1220, name: "Attribute Enhancers", children: [
                    { id: 10216, name: "Ocular Filter - Basic" },
                    { id: 10217, name: "Memory Augmentation - Basic" },
                    { id: 10218, name: "Neural Boost - Basic" },
                    { id: 10219, name: "Cybernetic Subprocessor - Basic" },
                    { id: 10220, name: "Magnetic Field Stabilizer - Basic" },
                    { id: 10221, name: "Social Adaptation Chip - Basic" },
                    { id: 10222, name: "Eidetic Memory Interface - Basic" },
                    { id: 10223, name: "Limited Ocular Filter" },
                    { id: 10224, name: "Limited Memory Augmentation" },
                    { id: 10225, name: "Limited Neural Boost" },
                    { id: 10226, name: "Limited Cybernetic Subprocessor" },
                    { id: 10227, name: "Limited Magnetic Field Stabilizer" }
                ]},
                { id: 1221, name: "Skill Hardwiring", children: [
                    { id: 339, name: "Hardwiring - Zainou 'Deadeye' ZGC100" },
                    { id: 340, name: "Hardwiring - Zainou 'Deadeye' ZGC101" },
                    { id: 341, name: "Hardwiring - Zainou 'Deadeye' ZGC102" },
                    { id: 342, name: "Hardwiring - Zainou 'Deadeye' ZGC103" },
                    { id: 343, name: "Hardwiring - Zainou 'Deadeye' ZGC104" }
                ]}
            ]
        },
        {
            id: 25,
            name: "Skills",
            icon: "fa-graduation-cap",
            children: [
                { id: 505, name: "Spaceship Command", children: [
                    { id: 3327, name: "Spaceship Command" },
                    { id: 3328, name: "Gallente Frigate" },
                    { id: 3329, name: "Minmatar Frigate" },
                    { id: 3330, name: "Caldari Frigate" },
                    { id: 3331, name: "Amarr Frigate" },
                    { id: 3332, name: "Gallente Cruiser" },
                    { id: 3333, name: "Minmatar Cruiser" },
                    { id: 3334, name: "Caldari Cruiser" },
                    { id: 3335, name: "Amarr Cruiser" },
                    { id: 3336, name: "Gallente Battleship" },
                    { id: 3337, name: "Minmatar Battleship" },
                    { id: 3338, name: "Caldari Battleship" },
                    { id: 3339, name: "Amarr Battleship" },
                    { id: 3340, name: "Gallente Industrial" },
                    { id: 3341, name: "Minmatar Industrial" },
                    { id: 3342, name: "Caldari Industrial" },
                    { id: 3343, name: "Amarr Industrial" }
                ]},
                { id: 255, name: "Gunnery", children: [
                    { id: 3300, name: "Gunnery" },
                    { id: 3301, name: "Small Hybrid Turret" },
                    { id: 3302, name: "Small Projectile Turret" },
                    { id: 3303, name: "Small Energy Turret" },
                    { id: 3304, name: "Medium Hybrid Turret" },
                    { id: 3305, name: "Medium Projectile Turret" },
                    { id: 3306, name: "Medium Energy Turret" },
                    { id: 3307, name: "Large Hybrid Turret" },
                    { id: 3308, name: "Large Projectile Turret" },
                    { id: 3309, name: "Large Energy Turret" },
                    { id: 3310, name: "Rapid Firing" },
                    { id: 3311, name: "Sharpshooter" },
                    { id: 3312, name: "Motion Prediction" },
                    { id: 3313, name: "Surgical Strike" },
                    { id: 3314, name: "Controlled Bursts" },
                    { id: 3315, name: "Trajectory Analysis" }
                ]},
                { id: 505, name: "Missiles", children: [
                    { id: 3319, name: "Missile Launcher Operation" },
                    { id: 3320, name: "Rockets" },
                    { id: 3321, name: "Light Missiles" },
                    { id: 3322, name: "Heavy Missiles" },
                    { id: 3323, name: "Cruise Missiles" },
                    { id: 3324, name: "Torpedoes" },
                    { id: 3325, name: "Rapid Launch" },
                    { id: 3326, name: "Target Navigation Prediction" }
                ]}
            ]
        }
    ]
};

// Popular items for quick access
const PopularItems = [
    { id: 44992, name: "30 Day Pilot's License Extension (PLEX)", category: "Trade Goods" },
    { id: 40520, name: "Large Skill Injector", category: "Trade Goods" },
    { id: 34, name: "Tritanium", category: "Material" },
    { id: 35, name: "Pyerite", category: "Material" },
    { id: 36, name: "Mexallon", category: "Material" },
    { id: 37, name: "Isogen", category: "Material" },
    { id: 38, name: "Nocxium", category: "Material" },
    { id: 39, name: "Zydrine", category: "Material" },
    { id: 40, name: "Megacyte", category: "Material" },
    { id: 28668, name: "Nanite Repair Paste", category: "Ammunition" },
    { id: 587, name: "Rifter", category: "Ships" },
    { id: 620, name: "Stabber", category: "Ships" },
    { id: 638, name: "Tempest", category: "Ships" },
    { id: 24696, name: "Hurricane", category: "Ships" },
    { id: 16242, name: "Thrasher", category: "Ships" },
    { id: 210, name: "1MN Afterburner I", category: "Modules" },
    { id: 343, name: "1MN Microwarpdrive I", category: "Modules" },
    { id: 377, name: "Small Shield Extender I", category: "Modules" },
    { id: 338, name: "Small Armor Repairer I", category: "Modules" },
    { id: 384, name: "EM Shield Hardener I", category: "Modules" },
    { id: 2048, name: "Damage Control I", category: "Modules" }
];

// Region data with trade hub info
const Regions = {
    0: { name: "All Regions (New Eden)", tradeHub: null },
    10000002: { name: "The Forge", tradeHub: "Jita IV - Moon 4 - Caldari Navy Assembly Plant" },
    10000043: { name: "Domain", tradeHub: "Amarr VIII (Oris) - Emperor Family Academy" },
    10000032: { name: "Sinq Laison", tradeHub: "Dodixie IX - Moon 20 - Federation Navy Assembly Plant" },
    10000030: { name: "Heimatar", tradeHub: "Rens VI - Moon 8 - Brutor Tribe Treasury" },
    10000042: { name: "Metropolis", tradeHub: "Hek VIII - Moon 12 - Boundless Creation Factory" }
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MarketCategories, PopularItems, Regions };
}
