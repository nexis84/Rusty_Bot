// EVE Online Skills Database
// Static skill data with prerequisites, attributes, and multipliers

const SKILL_CATEGORIES = {
    'Gunnery': { id: 255, skills: [] },
    'Missiles': { id: 256, skills: [] },
    'Spaceship Command': { id: 257, skills: [] },
    'Engineering': { id: 1218, skills: [] },
    'Shields': { id: 1219, skills: [] },
    'Armor': { id: 1220, skills: [] },
    'Electronic Systems': { id: 1221, skills: [] },
    'Drones': { id: 273, skills: [] },
    'Navigation': { id: 275, skills: [] },
    'Leadership': { id: 258, skills: [] },
    'Neural Enhancement': { id: 1223, skills: [] },
    'Production': { id: 268, skills: [] },
    'Science': { id: 270, skills: [] },
    'Scanning': { id: 269, skills: [] },
    'Social': { id: 278, skills: [] },
    'Trade': { id: 274, skills: [] },
    'Resource Processing': { id: 1224, skills: [] },
    'Planet Management': { id: 1044, skills: [] },
    'Subsystems': { id: 1245, skills: [] }
};

const SKILLS = {
    // Gunnery
    3300: { name: 'Gunnery', group: 'Gunnery', rank: 1, primary: 'per', secondary: 'will', desc: 'Basic turret operation skill.' },
    3301: { name: 'Small Hybrid Turret', group: 'Gunnery', rank: 1, primary: 'per', secondary: 'will', prereqs: { 3300: 1 }, desc: 'Operation of small hybrid turrets.' },
    3302: { name: 'Small Projectile Turret', group: 'Gunnery', rank: 1, primary: 'per', secondary: 'will', prereqs: { 3300: 1 }, desc: 'Operation of small projectile turrets.' },
    3303: { name: 'Small Energy Turret', group: 'Gunnery', rank: 1, primary: 'per', secondary: 'will', prereqs: { 3300: 1 }, desc: 'Operation of small energy turrets.' },
    3304: { name: 'Medium Hybrid Turret', group: 'Gunnery', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3301: 3 }, desc: 'Operation of medium hybrid turrets.' },
    3305: { name: 'Medium Projectile Turret', group: 'Gunnery', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3302: 3 }, desc: 'Operation of medium projectile turrets.' },
    3306: { name: 'Medium Energy Turret', group: 'Gunnery', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3303: 3 }, desc: 'Operation of medium energy turrets.' },
    3307: { name: 'Large Hybrid Turret', group: 'Gunnery', rank: 5, primary: 'per', secondary: 'will', prereqs: { 3304: 5 }, desc: 'Operation of large hybrid turrets.' },
    3308: { name: 'Large Projectile Turret', group: 'Gunnery', rank: 5, primary: 'per', secondary: 'will', prereqs: { 3305: 5 }, desc: 'Operation of large projectile turrets.' },
    3309: { name: 'Large Energy Turret', group: 'Gunnery', rank: 5, primary: 'per', secondary: 'will', prereqs: { 3306: 5 }, desc: 'Operation of large energy turrets.' },
    3310: { name: 'Rapid Firing', group: 'Gunnery', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3300: 2 }, desc: 'Increases turret rate of fire.' },
    3311: { name: 'Sharpshooter', group: 'Gunnery', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3300: 2 }, desc: 'Increases turret optimal range.' },
    3312: { name: 'Surgical Strike', group: 'Gunnery', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3300: 4 }, desc: 'Increases turret damage.' },
    3315: { name: 'Controlled Bursts', group: 'Gunnery', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3300: 2 }, desc: 'Reduces capacitor need for turrets.' },
    3316: { name: 'Trajectory Analysis', group: 'Gunnery', rank: 5, primary: 'per', secondary: 'will', prereqs: { 3311: 4 }, desc: 'Increases turret falloff range.' },
    3317: { name: 'Weapon Upgrades', group: 'Gunnery', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3300: 2 }, desc: 'Reduces CPU need for turrets and launchers.' },
    3318: { name: 'Motion Prediction', group: 'Gunnery', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3300: 2 }, desc: 'Improves tracking speed against fast targets.' },
    3319: { name: 'Advanced Weapon Upgrades', group: 'Gunnery', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3317: 5 }, desc: 'Further reduces fitting requirements.' },
    20327: { name: 'Turret Destabilization', group: 'Gunnery', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3300: 3 }, desc: 'ECM burst turret skill.' },

    // Missiles
    3319: { name: 'Missile Launcher Operation', group: 'Missiles', rank: 1, primary: 'per', secondary: 'will', desc: 'Basic missile operation skill.' },
    3320: { name: 'Rockets', group: 'Missiles', rank: 1, primary: 'per', secondary: 'will', prereqs: { 3319: 1 }, desc: 'Operation of rocket launchers.' },
    3321: { name: 'Light Missiles', group: 'Missiles', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3319: 1 }, desc: 'Operation of light missile launchers.' },
    3322: { name: 'Auto-Targeting Missiles', group: 'Missiles', rank: 1, primary: 'per', secondary: 'will', prereqs: { 3319: 1 }, desc: 'Auto-targeting missile operation.' },
    3323: { name: 'Defender Missiles', group: 'Missiles', rank: 1, primary: 'per', secondary: 'will', prereqs: { 3319: 1 }, desc: 'Defender missile operation.' },
    3324: { name: 'Heavy Missiles', group: 'Missiles', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3321: 3 }, desc: 'Operation of heavy missile launchers.' },
    3325: { name: 'Torpedoes', group: 'Missiles', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3320: 3 }, desc: 'Operation of torpedo launchers.' },
    3326: { name: 'Cruise Missiles', group: 'Missiles', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3324: 5 }, desc: 'Operation of cruise missile launchers.' },
    12441: { name: 'Heavy Assault Missiles', group: 'Missiles', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3321: 3 }, desc: 'Operation of HAM launchers.' },
    20211: { name: 'Rapid Launch', group: 'Missiles', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3319: 2 }, desc: 'Increases missile rate of fire.' },
    20212: { name: 'Missile Bombardment', group: 'Missiles', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3319: 2 }, desc: 'Increases missile flight time.' },
    20213: { name: 'Missile Projection', group: 'Missiles', rank: 4, primary: 'per', secondary: 'will', prereqs: { 20212: 3 }, desc: 'Increases missile velocity.' },
    20312: { name: 'Warhead Upgrades', group: 'Missiles', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3319: 4 }, desc: 'Increases missile damage.' },
    20314: { name: 'Guided Missile Precision', group: 'Missiles', rank: 5, primary: 'per', secondary: 'will', prereqs: { 3319: 5 }, desc: 'Decreases explosion radius factor.' },
    20315: { name: 'Missile Specialization', group: 'Missiles', rank: 8, primary: 'per', secondary: 'will', prereqs: { 20312: 4 }, desc: 'Specialization for T2 missiles.' },
    22043: { name: 'Citadel Cruise Missiles', group: 'Missiles', rank: 7, primary: 'per', secondary: 'will', prereqs: { 3326: 5 }, desc: 'Operation of citadel cruise missiles.' },
    32435: { name: 'Citadel Torpedoes', group: 'Missiles', rank: 7, primary: 'per', secondary: 'will', prereqs: { 3325: 5 }, desc: 'Operation of citadel torpedoes.' },

    // Spaceship Command
    3327: { name: 'Spaceship Command', group: 'Spaceship Command', rank: 1, primary: 'per', secondary: 'will', desc: 'Basic ship operation skill.' },
    3328: { name: 'Gallente Frigate', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3327: 1 }, desc: 'Gallente frigate operation.' },
    3329: { name: 'Minmatar Frigate', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3327: 1 }, desc: 'Minmatar frigate operation.' },
    3330: { name: 'Caldari Frigate', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3327: 1 }, desc: 'Caldari frigate operation.' },
    3331: { name: 'Amarr Frigate', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3327: 1 }, desc: 'Amarr frigate operation.' },
    3332: { name: 'Gallente Cruiser', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3328: 3 }, desc: 'Gallente cruiser operation.' },
    3333: { name: 'Minmatar Cruiser', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3329: 3 }, desc: 'Minmatar cruiser operation.' },
    3334: { name: 'Caldari Cruiser', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3330: 3 }, desc: 'Caldari cruiser operation.' },
    3335: { name: 'Amarr Cruiser', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3331: 3 }, desc: 'Amarr cruiser operation.' },
    3336: { name: 'Gallente Battleship', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3332: 4 }, desc: 'Gallente battleship operation.' },
    3337: { name: 'Minmatar Battleship', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3333: 4 }, desc: 'Minmatar battleship operation.' },
    3338: { name: 'Caldari Battleship', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3334: 4 }, desc: 'Caldari battleship operation.' },
    3339: { name: 'Amarr Battleship', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3335: 4 }, desc: 'Amarr battleship operation.' },
    3340: { name: 'Gallente Industrial', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3328: 3 }, desc: 'Gallente industrial ship operation.' },
    3341: { name: 'Minmatar Industrial', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3329: 3 }, desc: 'Minmatar industrial ship operation.' },
    3342: { name: 'Caldari Industrial', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3330: 3 }, desc: 'Caldari industrial ship operation.' },
    3343: { name: 'Amarr Industrial', group: 'Spaceship Command', rank: 3, primary: 'per', secondary: 'will', prereqs: { 3331: 3 }, desc: 'Amarr industrial ship operation.' },
    3344: { name: 'Gallente Destroyer', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3328: 3 }, desc: 'Gallente destroyer operation.' },
    3345: { name: 'Caldari Destroyer', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3330: 3 }, desc: 'Caldari destroyer operation.' },
    3346: { name: 'Amarr Destroyer', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3331: 3 }, desc: 'Amarr destroyer operation.' },
    3347: { name: 'Minmatar Destroyer', group: 'Spaceship Command', rank: 2, primary: 'per', secondary: 'will', prereqs: { 3329: 3 }, desc: 'Minmatar destroyer operation.' },
    3348: { name: 'Gallente Battlecruiser', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3332: 3 }, desc: 'Gallente battlecruiser operation.' },
    3349: { name: 'Caldari Battlecruiser', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3334: 3 }, desc: 'Caldari battlecruiser operation.' },
    3350: { name: 'Amarr Battlecruiser', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3335: 3 }, desc: 'Amarr battlecruiser operation.' },
    3351: { name: 'Minmatar Battlecruiser', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3333: 3 }, desc: 'Minmatar battlecruiser operation.' },
    12092: { name: 'Interceptors', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3453: 3 }, desc: 'Interceptor operation.' },
    12093: { name: 'Covert Ops', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3402: 3 }, desc: 'Covert ops operation.' },
    12095: { name: 'Assault Frigates', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3315: 3 }, desc: 'Assault frigate operation.' },
    12096: { name: 'Logistics Cruisers', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3412: 3 }, desc: 'Logistics cruiser operation.' },
    16591: { name: 'Heavy Assault Cruisers', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3312: 3 }, desc: 'HAC operation.' },
    17962: { name: 'Advanced Spaceship Command', group: 'Spaceship Command', rank: 5, primary: 'per', secondary: 'will', prereqs: { 3327: 5 }, desc: 'Advanced ship handling.' },
    19719: { name: 'Transport Ships', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3402: 3 }, desc: 'Transport ship operation.' },
    19759: { name: 'Recon Ships', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3402: 3 }, desc: 'Recon ship operation.' },
    19921: { name: 'Command Ships', group: 'Spaceship Command', rank: 8, primary: 'per', secondary: 'will', prereqs: { 3327: 5, 3350: 5 }, desc: 'Command ship operation.' },
    21603: { name: 'Exhumers', group: 'Spaceship Command', rank: 8, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3410: 5 }, desc: 'Exhumer operation.' },
    22551: { name: 'Marauders', group: 'Spaceship Command', rank: 8, primary: 'per', secondary: 'will', prereqs: { 3327: 5 }, desc: 'Marauder operation.' },
    22761: { name: 'Jump Freighters', group: 'Spaceship Command', rank: 9, primary: 'per', secondary: 'will', prereqs: { 3327: 5, 21551: 3 }, desc: 'Jump freighter operation.' },
    23950: { name: 'Titans', group: 'Spaceship Command', rank: 16, primary: 'per', secondary: 'will', prereqs: { 3327: 5 }, desc: 'Titan operation.' },
    24311: { name: 'Interdictors', group: 'Spaceship Command', rank: 5, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3413: 3 }, desc: 'Interdictor operation.' },
    24606: { name: 'Capital Ships', group: 'Spaceship Command', rank: 12, primary: 'per', secondary: 'will', prereqs: { 3327: 5, 17962: 3 }, desc: 'Capital ship operation.' },
    28374: { name: 'Capital Industrial Ships', group: 'Spaceship Command', rank: 10, primary: 'per', secondary: 'will', prereqs: { 3327: 5, 17962: 3 }, desc: 'Capital industrial operation.' },
    28609: { name: 'Electronic Attack Ships', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3432: 3 }, desc: 'EAS operation.' },
    28615: { name: 'Heavy Interdiction Cruisers', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3413: 3 }, desc: 'HIC operation.' },
    28656: { name: 'Black Ops', group: 'Spaceship Command', rank: 6, primary: 'per', secondary: 'will', prereqs: { 3327: 5, 3432: 3 }, desc: 'Black ops operation.' },
    28667: { name: 'Expedition Frigates', group: 'Spaceship Command', rank: 4, primary: 'per', secondary: 'will', prereqs: { 3327: 3, 3410: 3 }, desc: 'Expedition frigate operation.' },

    // Engineering
    3380: { name: 'Engineering', group: 'Engineering', rank: 1, primary: 'int', secondary: 'mem', desc: 'Basic engineering skill.' },
    3384: { name: 'Shield Operation', group: 'Engineering', rank: 1, primary: 'int', secondary: 'mem', prereqs: { 3380: 1 }, desc: 'Shield system operation.' },
    3385: { name: 'Shield Management', group: 'Engineering', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3384: 3 }, desc: 'Increases shield capacity.' },
    3386: { name: 'Shield Emission Systems', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3384: 2 }, desc: 'Remote shield boosting.' },
    3387: { name: 'Shield Upgrades', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3380: 2 }, desc: 'Shield extender and amplifier fitting.' },
    3390: { name: 'EM Shield Compensation', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3384: 4 }, desc: 'EM shield hardener bonus.' },
    3392: { name: 'Explosive Shield Compensation', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3384: 4 }, desc: 'Explosive shield hardener bonus.' },
    3393: { name: 'Kinetic Shield Compensation', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3384: 4 }, desc: 'Kinetic shield hardener bonus.' },
    3394: { name: 'Thermal Shield Compensation', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3384: 4 }, desc: 'Thermal shield hardener bonus.' },
    3412: { name: 'Capacitor Management', group: 'Engineering', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3380: 3 }, desc: 'Increases capacitor capacity.' },
    3413: { name: 'Capacitor Systems Operation', group: 'Engineering', rank: 1, primary: 'int', secondary: 'mem', prereqs: { 3380: 1 }, desc: 'Capacitor recharge rate.' },
    3416: { name: 'Weapon Upgrades', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3380: 2 }, desc: 'Weapon upgrade fitting.' },
    3417: { name: 'Advanced Weapon Upgrades', group: 'Engineering', rank: 6, primary: 'int', secondary: 'mem', prereqs: { 3416: 5 }, desc: 'Advanced weapon upgrades.' },
    3418: { name: 'CPU Management', group: 'Engineering', rank: 1, primary: 'int', secondary: 'mem', desc: 'Increases CPU output.' },
    3419: { name: 'Power Grid Management', group: 'Engineering', rank: 1, primary: 'int', secondary: 'mem', desc: 'Increases power grid output.' },
    3420: { name: 'Capacitor Emission Systems', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3413: 2 }, desc: 'Remote capacitor transfer.' },
    3424: { name: 'Energy Grid Upgrades', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3380: 2 }, desc: 'Energy upgrade fitting.' },
    3425: { name: 'Shield Compensation', group: 'Engineering', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3384: 3 }, desc: 'Passive shield hardening.' },
    3426: { name: 'Thermodynamics', group: 'Engineering', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3380: 3, 3413: 4 }, desc: 'Overheating skill.' },
    3435: { name: ' Tactical Shield Manipulation', group: 'Engineering', rank: 4, primary: 'int', secondary: 'mem', prereqs: { 3384: 4 }, desc: 'Shield booster operation.' },
    28164: { name: 'Capacitor Capacity', group: 'Engineering', rank: 4, primary: 'int', secondary: 'mem', prereqs: { 3380: 4 }, desc: 'Increases capacitor size.' },

    // Armor
    3396: { name: 'Armor Layering', group: 'Armor', rank: 4, primary: 'int', secondary: 'mem', prereqs: { 3395: 3 }, desc: 'Armor plate fitting.' },
    3395: { name: 'Hull Upgrades', group: 'Armor', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3398: 1 }, desc: 'Hull upgrade fitting.' },
    3397: { name: 'Remote Armor Repair Systems', group: 'Armor', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3395: 2 }, desc: 'Remote armor repair.' },
    3398: { name: 'Repair Systems', group: 'Armor', rank: 1, primary: 'int', secondary: 'mem', desc: 'Local armor repair.' },
    3399: { name: 'EM Armor Compensation', group: 'Armor', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3395: 3 }, desc: 'EM armor hardener bonus.' },
    3400: { name: 'Explosive Armor Compensation', group: 'Armor', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3395: 3 }, desc: 'Explosive armor hardener bonus.' },
    3401: { name: 'Kinetic Armor Compensation', group: 'Armor', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3395: 3 }, desc: 'Kinetic armor hardener bonus.' },
    3402: { name: 'Thermal Armor Compensation', group: 'Armor', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3395: 3 }, desc: 'Thermal armor hardener bonus.' },
    22806: { name: 'Armor Resistance Phasing', group: 'Armor', rank: 6, primary: 'int', secondary: 'mem', prereqs: { 3395: 5 }, desc: 'Armor adaptive hardener bonus.' },

    // Electronic Systems
    3432: { name: 'Electronic Warfare', group: 'Electronic Systems', rank: 2, primary: 'int', secondary: 'mem', desc: 'Electronic warfare operation.' },
    3433: { name: 'Remote Sensor Dampening', group: 'Electronic Systems', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3432: 2 }, desc: 'Sensor dampener operation.' },
    3434: { name: 'Sensor Linking', group: 'Electronic Systems', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3432: 3 }, desc: 'Remote sensor boosting.' },
    3436: { name: 'Weapon Disruption', group: 'Electronic Systems', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3432: 2 }, desc: 'Weapon disruptor operation.' },
    3437: { name: 'Propulsion Jamming', group: 'Electronic Systems', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3432: 3 }, desc: 'Stasis webifier and scrambler.' },
    3438: { name: 'Target Painting', group: 'Electronic Systems', rank: 2, primary: 'int', secondary: 'mem', prereqs: { 3432: 2 }, desc: 'Target painter operation.' },
    3551: { name: 'Signature Analysis', group: 'Electronic Systems', rank: 1, primary: 'int', secondary: 'mem', desc: 'Targeting speed.' },
    3553: { name: 'Frequency Modulation', group: 'Electronic Systems', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3432: 3 }, desc: 'EW falloff bonus.' },
    3562: { name: 'Long Range Targeting', group: 'Electronic Systems', rank: 2, primary: 'int', secondary: 'mem', desc: 'Targeting range.' },
    3579: { name: 'Turret Destabilization', group: 'Electronic Systems', rank: 4, primary: 'int', secondary: 'mem', prereqs: { 3432: 4 }, desc: 'Tracking disruptor.' },
    3580: { name: 'Missile Guidance', group: 'Electronic Systems', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3432: 3 }, desc: 'Guidance disruptor.' },
    19759: { name: 'Signal Suppression', group: 'Electronic Systems', rank: 5, primary: 'int', secondary: 'mem', prereqs: { 3432: 5 }, desc: 'ECM operation.' },
    19922: { name: 'Turret Burst', group: 'Electronic Systems', rank: 4, primary: 'int', secondary: 'mem', prereqs: { 3432: 4 }, desc: 'Weapon disruptor burst.' },

    // Drones
    3436: { name: 'Drones', group: 'Drones', rank: 1, primary: 'mem', secondary: 'per', desc: 'Basic drone operation.' },
    3437: { name: 'Drone Avionics', group: 'Drones', rank: 1, primary: 'mem', secondary: 'per', prereqs: { 3436: 1 }, desc: 'Drone control range.' },
    3438: { name: 'Drone Navigation', group: 'Drones', rank: 1, primary: 'mem', secondary: 'per', prereqs: { 3436: 1 }, desc: 'Drone speed.' },
    3439: { name: 'Drone Sharpshooting', group: 'Drones', rank: 1, primary: 'mem', secondary: 'per', prereqs: { 3436: 1 }, desc: 'Drone optimal range.' },
    3440: { name: 'Drone Durability', group: 'Drones', rank: 2, primary: 'mem', secondary: 'per', prereqs: { 3436: 2 }, desc: 'Drone HP bonus.' },
    3441: { name: 'Drone Interfacing', group: 'Drones', rank: 3, primary: 'mem', secondary: 'per', prereqs: { 3436: 4 }, desc: 'Drone damage and mining.' },
    3442: { name: 'Drone Navigation', group: 'Drones', rank: 4, primary: 'mem', secondary: 'per', prereqs: { 3438: 5 }, desc: 'Advanced drone speed.' },
    12305: { name: 'Heavy Drone Operation', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 3436: 5 }, desc: 'Heavy drone operation.' },
    12484: { name: 'Amarr Drone Specialization', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 3436: 5 }, desc: 'T2 Amarr drone bonus.' },
    12485: { name: 'Caldari Drone Specialization', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 3436: 5 }, desc: 'T2 Caldari drone bonus.' },
    12486: { name: 'Gallente Drone Specialization', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 3436: 5 }, desc: 'T2 Gallente drone bonus.' },
    12487: { name: 'Minmatar Drone Specialization', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 3436: 5 }, desc: 'T2 Minmatar drone bonus.' },
    22809: { name: 'Sentry Drone Interfacing', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 3436: 5 }, desc: 'Sentry drone bonus.' },
    23566: { name: 'Electronic Warfare Drones', group: 'Drones', rank: 4, primary: 'mem', secondary: 'per', prereqs: { 3436: 4 }, desc: 'EW drone operation.' },
    23594: { name: 'Sentry Drone Sharpshooting', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 22809: 4 }, desc: 'Sentry drone optimal.' },
    24241: { name: 'Fighter Hangar Management', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 3436: 5 }, desc: 'Carrier fighter bonus.' },
    24313: { name: 'Fighter Squadron Management', group: 'Drones', rank: 4, primary: 'mem', secondary: 'per', prereqs: { 24241: 3 }, desc: 'Fighter squadron bonus.' },
    32339: { name: 'Light Fighters', group: 'Drones', rank: 4, primary: 'mem', secondary: 'per', prereqs: { 24241: 4 }, desc: 'Light fighter operation.' },
    32340: { name: 'Support Fighters', group: 'Drones', rank: 4, primary: 'mem', secondary: 'per', prereqs: { 24241: 4 }, desc: 'Support fighter operation.' },
    32341: { name: 'Heavy Fighters', group: 'Drones', rank: 5, primary: 'mem', secondary: 'per', prereqs: { 24241: 5 }, desc: 'Heavy fighter operation.' },

    // Navigation
    3327: { name: 'Navigation', group: 'Navigation', rank: 1, primary: 'int', secondary: 'per', desc: 'Ship velocity bonus.' },
    3384: { name: 'Acceleration Control', group: 'Navigation', rank: 2, primary: 'int', secondary: 'per', prereqs: { 3327: 2 }, desc: 'Afterburner and MWD speed bonus.' },
    3390: { name: 'Evasive Maneuvering', group: 'Navigation', rank: 2, primary: 'int', secondary: 'per', prereqs: { 3327: 2 }, desc: 'Ship agility bonus.' },
    3397: { name: 'High Speed Maneuvering', group: 'Navigation', rank: 3, primary: 'int', secondary: 'per', prereqs: { 3384: 3 }, desc: 'MWD capacitor reduction.' },
    3405: { name: 'Afterburner', group: 'Navigation', rank: 1, primary: 'int', secondary: 'per', desc: 'Afterburner duration.' },
    3410: { name: 'Warp Drive Operation', group: 'Navigation', rank: 1, primary: 'int', secondary: 'per', desc: 'Warp capacitor reduction.' },
    3411: { name: 'Jump Drive Operation', group: 'Navigation', rank: 5, primary: 'int', secondary: 'per', prereqs: { 3410: 5 }, desc: 'Jump drive operation.' },
    3413: { name: 'Jump Drive Calibration', group: 'Navigation', rank: 6, primary: 'int', secondary: 'per', prereqs: { 3411: 4 }, desc: 'Jump range bonus.' },
    3417: { name: 'Jump Fuel Conservation', group: 'Navigation', rank: 4, primary: 'int', secondary: 'per', prereqs: { 3411: 3 }, desc: 'Jump fuel reduction.' },
    3449: { name: 'Warp Drive Operation', group: 'Navigation', rank: 2, primary: 'int', secondary: 'per', prereqs: { 3410: 2 }, desc: 'Warp speed.' },
    3450: { name: 'Micro Jump Drive Operation', group: 'Navigation', rank: 5, primary: 'int', secondary: 'per', prereqs: { 3384: 5 }, desc: 'MJD operation.' },
    3451: { name: 'Micro Jump Field Manipulation', group: 'Navigation', rank: 6, primary: 'int', secondary: 'per', prereqs: { 3450: 5 }, desc: 'MJFG operation.' },

    // Leadership
    3340: { name: 'Leadership', group: 'Leadership', rank: 1, primary: 'char', secondary: 'will', desc: 'Basic leadership.' },
    3341: { name: 'Skirmish Warfare', group: 'Leadership', rank: 2, primary: 'char', secondary: 'will', prereqs: { 3340: 2 }, desc: 'Skirmish command burst.' },
    3342: { name: 'Siege Warfare', group: 'Leadership', rank: 2, primary: 'char', secondary: 'will', prereqs: { 3340: 2 }, desc: 'Siege command burst.' },
    3343: { name: 'Information Warfare', group: 'Leadership', rank: 2, primary: 'char', secondary: 'will', prereqs: { 3340: 2 }, desc: 'Information command burst.' },
    3344: { name: 'Armored Warfare', group: 'Leadership', rank: 2, primary: 'char', secondary: 'will', prereqs: { 3340: 2 }, desc: 'Armored command burst.' },
    3345: { name: 'Shield Warfare', group: 'Leadership', rank: 2, primary: 'char', secondary: 'will', prereqs: { 3340: 2 }, desc: 'Shield command burst.' },
    3348: { name: 'Warfare Link Specialist', group: 'Leadership', rank: 5, primary: 'char', secondary: 'will', prereqs: { 3340: 5 }, desc: 'Command burst specialist.' },
    3350: { name: 'Skirmish Warfare Specialist', group: 'Leadership', rank: 5, primary: 'char', secondary: 'will', prereqs: { 3341: 5 }, desc: 'Skirmish burst specialist.' },
    3351: { name: 'Siege Warfare Specialist', group: 'Leadership', rank: 5, primary: 'char', secondary: 'will', prereqs: { 3342: 5 }, desc: 'Siege burst specialist.' },
    3352: { name: 'Information Warfare Specialist', group: 'Leadership', rank: 5, primary: 'char', secondary: 'will', prereqs: { 3343: 5 }, desc: 'Information burst specialist.' },
    3354: { name: 'Armored Warfare Specialist', group: 'Leadership', rank: 5, primary: 'char', secondary: 'will', prereqs: { 3344: 5 }, desc: 'Armored burst specialist.' },
    3355: { name: 'Shield Warfare Specialist', group: 'Leadership', rank: 5, primary: 'char', secondary: 'will', prereqs: { 3345: 5 }, desc: 'Shield burst specialist.' },
    12214: { name: 'Wing Command', group: 'Leadership', rank: 8, primary: 'char', secondary: 'will', prereqs: { 3340: 5 }, desc: 'Wing command.' },
    20494: { name: 'Fleet Command', group: 'Leadership', rank: 12, primary: 'char', secondary: 'will', prereqs: { 12214: 5 }, desc: 'Fleet command.' },

    // Neural Enhancement
    3385: { name: 'Cybernetics', group: 'Neural Enhancement', rank: 3, primary: 'int', secondary: 'mem', desc: 'Implant installation.' },
    3386: { name: 'Neural Analysis', group: 'Neural Enhancement', rank: 2, primary: 'int', secondary: 'mem', desc: 'Jump clone installation.' },
    3411: { name: 'Infomorph Psychology', group: 'Neural Enhancement', rank: 1, primary: 'char', secondary: 'will', desc: 'Extra jump clones.' },
    3412: { name: 'Infomorph Synchronizing', group: 'Neural Enhancement', rank: 2, primary: 'char', secondary: 'will', prereqs: { 3411: 1 }, desc: 'Jump clone cooldown reduction.' },
    3413: { name: 'Infomorph Economics', group: 'Neural Enhancement', rank: 3, primary: 'char', secondary: 'will', prereqs: { 3412: 3 }, desc: 'Clone grade preservation.' },
    3414: { name: 'Advanced Infomorph Psychology', group: 'Neural Enhancement', rank: 4, primary: 'char', secondary: 'will', prereqs: { 3411: 4 }, desc: 'More jump clones.' },
    3415: { name: 'Biology', group: 'Neural Enhancement', rank: 1, primary: 'int', secondary: 'mem', desc: 'Booster duration.' },
    3416: { name: 'Nanite Control', group: 'Neural Enhancement', rank: 4, primary: 'int', secondary: 'mem', desc: 'Booster side effect reduction.' },
    3417: { name: 'Neurotoxin Control', group: 'Neural Enhancement', rank: 2, primary: 'int', secondary: 'mem', desc: 'Booster side effect chance reduction.' },
    24241: { name: 'Neural Enhancement - Social', group: 'Neural Enhancement', rank: 2, primary: 'int', secondary: 'mem', desc: 'Social skill learning bonus.' },
    30091: { name: 'Neural Enhancement - Military', group: 'Neural Enhancement', rank: 2, primary: 'int', secondary: 'mem', desc: 'Military skill learning bonus.' },
    30092: { name: 'Neural Enhancement - Industry', group: 'Neural Enhancement', rank: 2, primary: 'int', secondary: 'mem', desc: 'Industry skill learning bonus.' },
    30093: { name: 'Neural Enhancement - Science', group: 'Neural Enhancement', rank: 2, primary: 'int', secondary: 'mem', desc: 'Science skill learning bonus.' },

    // Science
    3402: { name: 'Science', group: 'Science', rank: 1, primary: 'int', secondary: 'mem', desc: 'Basic science skill.' },
    3403: { name: 'Research', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3402: 1 }, desc: 'Blueprint research time.' },
    3404: { name: 'Scientific Networking', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3403: 3 }, desc: 'Remote research.' },
    3405: { name: 'Metallurgy', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3402: 3 }, desc: 'Material efficiency research.' },
    3406: { name: 'Astrogeology', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3402: 3 }, desc: 'Mining crystal bonus.' },
    3408: { name: 'Cybernetics', group: 'Science', rank: 3, primary: 'int', secondary: 'mem,', prereqs: { 3402: 3 }, desc: 'Implant manufacturing.' },
    3410: { name: 'Biology', group: 'Science', rank: 1, primary: 'int', secondary: 'mem', desc: 'Booster manufacturing.' },
    3413: { name: 'Laboratory Operation', group: 'Science', rank: 1, primary: 'int', secondary: 'mem', prereqs: { 3402: 1 }, desc: 'Lab slot usage.' },
    3414: { name: 'Advanced Laboratory Operation', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', prereqs: { 3413: 3 }, desc: 'Extra lab slot.' },
    3415: { name: 'Sleeper Technology', group: 'Science', rank: 5, primary: 'int', secondary: 'mem', desc: 'Sleeper tech usage.' },
    3416: { name: 'Caldari Encryption Methods', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Caldari invention.' },
    3417: { name: 'Minmatar Encryption Methods', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Minmatar invention.' },
    3418: { name: 'Amarr Encryption Methods', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Amarr invention.' },
    3419: { name: 'Gallente Encryption Methods', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Gallente invention.' },
    11433: { name: 'High Energy Physics', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'T2 component manufacturing.' },
    11442: { name: 'Laser Physics', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Laser-related invention.' },
    11443: { name: 'Electromagnetic Physics', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Hybrid invention.' },
    11444: { name: 'Rocket Science', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Rocket invention.' },
    11445: { name: 'Graviton Physics', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Shield invention.' },
    11446: { name: 'Quantum Physics', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Electronic invention.' },
    11447: { name: 'Molecular Engineering', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Armor invention.' },
    11448: { name: 'Nanite Engineering', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Nanite invention.' },
    11449: { name: 'Nuclear Physics', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Projectile invention.' },
    11450: { name: 'Mechanical Engineering', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Drone invention.' },
    11451: { name: 'Hydromagnetic Physics', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Shield invention.' },
    11452: { name: 'Amarr Starship Engineering', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Amarr T2 invention.' },
    11453: { name: 'Caldari Starship Engineering', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Caldari T2 invention.' },
    11454: { name: 'Gallente Starship Engineering', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Gallente T2 invention.' },
    11455: { name: 'Minmatar Starship Engineering', group: 'Science', rank: 2, primary: 'int', secondary: 'mem', desc: 'Minmatar T2 invention.' },
    11487: { name: 'Sleeper Encryption Methods', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', desc: 'Sleeper invention.' },
    13278: { name: 'Archaeology', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', desc: 'Relic analyzer.' },
    13279: { name: 'Remote Sensing', group: 'Science', rank: 1, primary: 'int', secondary: 'mem', desc: 'Planet scanning.' },
    17852: { name: 'Hacking', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', desc: 'Data analyzer.' },
    23087: { name: 'Astrometrics', group: 'Science', rank: 3, primary: 'int', secondary: 'mem', desc: 'Scanning strength.' },
    25538: { name: 'Astrometric Rangefinding', group: 'Science', rank: 5, primary: 'int', secondary: 'mem', prereqs: { 23087: 3 }, desc: 'Scanning deviation.' },
    25539: { name: 'Astrometric Pinpointing', group: 'Science', rank: 5, primary: 'int', secondary: 'mem', prereqs: { 23087: 3 }, desc: 'Scanning probe speed.' },
    25739: { name: 'Astrometric Acquisition', group: 'Science', rank: 5, primary: 'int', secondary: 'mem', prereqs: { 23087: 3 }, desc: 'Scanning probe strength.' },

    // Trade
    3443: { name: 'Trade', group: 'Trade', rank: 1, primary: 'char', secondary: 'mem', desc: 'Active order limit.' },
    3444: { name: 'Retail', group: 'Trade', rank: 2, primary: 'char', secondary: 'mem', prereqs: { 3443: 2 }, desc: 'Market order limit.' },
    3445: { name: 'Black Market Trading', group: 'Trade', rank: 4, primary: 'char', secondary: 'mem', prereqs: { 3443: 4 }, desc: 'NPC market margin.' },
    3446: { name: 'Broker Relations', group: 'Trade', rank: 2, primary: 'char', secondary: 'mem', prereqs: { 3443: 2 }, desc: 'Broker fee reduction.' },
    3447: { name: 'Visibility', group: 'Trade', rank: 3, primary: 'char', secondary: 'mem', prereqs: { 3443: 3 }, desc: 'Modify order range.' },
    3448: { name: 'Smuggling', group: 'Trade', rank: 6, primary: 'char', secondary: 'mem', prereqs: { 3443: 3 }, desc: 'NPC detection reduction.' },
    16597: { name: 'Accounting', group: 'Trade', rank: 3, primary: 'char', secondary: 'mem', prereqs: { 3443: 3 }, desc: 'Sales tax reduction.' },
    16598: { name: 'Marketing', group: 'Trade', rank: 3, primary: 'char', secondary: 'mem', prereqs: { 3444: 3 }, desc: 'Remote order placement.' },
    16622: { name: 'Procurement', group: 'Trade', rank: 3, primary: 'char', secondary: 'mem', prereqs: { 16597: 3 }, desc: 'Remote buy orders.' },
    16623: { name: 'Daytrading', group: 'Trade', rank: 3, primary: 'char', secondary: 'mem', prereqs: { 16598: 3 }, desc: 'Remote order modification.' },
    16624: { name: 'Wholesale', group: 'Trade', rank: 4, primary: 'char', secondary: 'mem', prereqs: { 16622: 3 }, desc: 'Order limit increase.' },
    16625: { name: 'Margin Trading', group: 'Trade', rank: 6, primary: 'char', secondary: 'mem', prereqs: { 16623: 4 }, desc: 'Minimum ISK for buy orders.' },
    16626: { name: 'Tycoon', group: 'Trade', rank: 6, primary: 'char', secondary: 'mem', prereqs: { 16624: 4 }, desc: 'Maximum order limit.' },
    18580: { name: 'Contracting', group: 'Trade', rank: 1, primary: 'char', secondary: 'mem', desc: 'Contract limit.' },
    19198: { name: 'Advanced Contracting', group: 'Trade', rank: 3, primary: 'char', secondary: 'mem', prereqs: { 18580: 3 }, desc: 'More contracts.' },

    // Add more categories as needed - this covers the core skills
};

// Skill Category Names for UI
const SKILL_GROUP_NAMES = {
    'Gunnery': 'Gunnery',
    'Missiles': 'Missiles', 
    'Spaceship Command': 'Spaceship Command',
    'Engineering': 'Engineering',
    'Shields': 'Shields',
    'Armor': 'Armor',
    'Electronic Systems': 'Electronic Systems',
    'Drones': 'Drones',
    'Navigation': 'Navigation',
    'Leadership': 'Leadership',
    'Neural Enhancement': 'Neural Enhancement',
    'Science': 'Science',
    'Scanning': 'Scanning',
    'Social': 'Social',
    'Trade': 'Trade',
    'Resource Processing': 'Resource Processing',
    'Planet Management': 'Planet Management',
    'Subsystems': 'Subsystems'
};

// Attribute display names
const ATTRIBUTES = {
    int: 'Intelligence',
    mem: 'Memory', 
    per: 'Perception',
    will: 'Willpower',
    char: 'Charisma'
};

// SP requirements for each skill level (before multiplier)
const SP_TABLE = [
    0,      // Level 0
    256,    // Level 1
    1415,   // Level 2
    8000,   // Level 3
    45255,  // Level 4
    256000  // Level 5
];

// Skill Book Type IDs (for market lookup)
// Maps skill ID to skill book type ID
const SKILL_BOOKS = {
    // Gunnery
    3300: 10273, 3301: 10275, 3302: 10277, 3303: 10279, 3304: 10281,
    3305: 10283, 3306: 10285, 3307: 10287, 3308: 10289, 3309: 10291,
    3310: 10293, 3311: 10295, 3312: 10297, 3315: 10303, 3316: 10305,
    3317: 10307, 3318: 10309, 3319: 10311, 20327: 21509,
    // Missiles
    3320: 10313, 3321: 10315, 3322: 10317, 3323: 10319, 3324: 10321,
    3325: 10323, 3326: 10325, 3327: 10327, 3328: 12412, 3329: 12413,
    3330: 12414, 3331: 12415, 3332: 12416, 3333: 12417, 3334: 12418,
    3335: 12419,
    // Navigation
    3385: 10373, 3386: 10375, 3387: 10377, 3388: 10379, 3389: 10381,
    3390: 10383, 3392: 10385, 3393: 10387, 3394: 10389, 3395: 10391,
    3396: 10393, 3397: 10395, 3398: 10397,
    // Engineering
    3380: 10353, 3381: 10355, 3412: 10419, 3413: 10421, 3416: 10425,
    3417: 10427, 3418: 10429, 3419: 10431, 3420: 10433, 3421: 10435,
    3422: 10437, 3423: 10439, 3424: 10441, 3425: 10443, 3426: 10445,
    3427: 10447, 3432: 10457, 3433: 10459, 28604: 28605,
    // Drones
    3436: 10467, 3437: 10469, 3438: 10471, 3439: 10473, 3440: 10475,
    3441: 10477, 3442: 10479, 12368: 12404, 23566: 23594, 23594: 23615,
    24241: 24242, 24613: 24622, 33608: 33609, 40535: 40536,
    // Spaceship Command
    33078: 33079, 33079: 33080, 33080: 33081, 33081: 33082, 33082: 33083,
    33083: 33084, 33084: 33085, 33085: 33086, 33086: 33087, 33087: 33088,
    33088: 33089, 33089: 33090, 33090: 33091, 33091: 33092, 33092: 33093,
    33093: 33094, 33094: 33095, 33095: 33096, 33096: 33097, 33097: 33098,
    33098: 33099, 33099: 33100, 33100: 33101, 33101: 33102, 33102: 33103,
    // Armor
    3396: 10393, 3397: 10395, 3398: 10397,
    // Science
    3402: 10403, 3403: 10405, 3405: 10409, 3406: 10411, 3408: 10415,
    3409: 10417, 3410: 24268, 3411: 20494,
    // Trade
    3443: 10481, 3444: 10483, 3445: 10485, 3446: 10487, 3447: 10489,
    3448: 10491, 3449: 10493, 3450: 10495, 3451: 10497, 3452: 10499,
    3453: 10501, 3454: 10503, 3455: 10505, 3456: 10507,
    // Social
    3355: 10243, 3356: 10245, 3357: 10247, 3358: 10249, 3359: 10251,
    3361: 10253, 3362: 10255, 3893: 10257, 3894: 10259,
    // Production
    3385: 10373, 3386: 10375, 3387: 10377, 3388: 10379, 3389: 10381,
    3390: 10383, 3391: 10385, 3392: 10387, 3393: 10389, 3394: 10391,
    // Scanning
    3411: 20494, 3412: 10419, 3413: 10421,
    // Resource Processing
    3385: 10373, 3386: 10375, 3387: 10377,
    // Neural Enhancement
    3348: 10235, 3349: 10237, 3350: 10239, 3351: 10241, 24311: 24312,
    24312: 24313, 25538: 25539,
    // Leadership
    3348: 10235, 3349: 10237, 3350: 10239, 3351: 10241, 3552: 10761,
    3553: 10763, 3554: 10765, 3555: 10767, 3556: 10769, 3557: 10771,
    3755: 10773, 3756: 10775, 3757: 10777, 3758: 10779, 3759: 10781,
    3760: 10783,
    // Generic fallback - many skill books share the skill ID
    // For skills not listed, we'll try skill ID directly or common patterns
};

// Generate market link for a skill book
function getSkillBookMarketLink(skillId) {
    const bookId = SKILL_BOOKS[skillId];
    if (!bookId) return null;
    // Link to RustyBot market with type ID
    return `../market/index.html?typeId=${bookId}`;
}

// Check if skill book data is available
function hasSkillBook(skillId) {
    return !!SKILL_BOOKS[skillId];
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SKILLS, SKILL_CATEGORIES, SKILL_GROUP_NAMES, ATTRIBUTES, SP_TABLE, SKILL_BOOKS, getSkillBookMarketLink, hasSkillBook };
}
