import sqlite3, json, re, os, sys

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'tmp', 'eve.db')
if not os.path.exists(DB_PATH):
    DB_PATH = r'C:\Users\nexis\AppData\Local\Temp\opencode\eve.db'

OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'npc-ships.json')

COMBAT_ATTRS = {
    9: 'hp', 37: 'maxVelocity', 51: 'speed', 54: 'maxRange',
    55: 'rechargeRate', 64: 'damageMultiplier',
    76: 'maxTargetRange', 79: 'scanSpeed',
    97: 'energyNeutralizerAmount', 98: 'energyNeutralizerRangeOptimal',
    103: 'warpScrambleRange', 105: 'warpScrambleStrength',
    114: 'emDamage', 116: 'explosiveDamage', 117: 'kineticDamage', 118: 'thermalDamage',
    158: 'falloff', 160: 'trackingSpeed',
    192: 'maxLockedTargets', 194: 'jammingResistance',
    208: 'scanRadarStrength', 209: 'scanLadarStrength',
    210: 'scanMagnetometricStrength', 211: 'scanGravimetricStrength',
    212: 'missileDamageMultiplier',
    247: 'entityAttackRange', 263: 'shieldCapacity',
    265: 'armorHP', 267: 'armorEmDamageResonance', 268: 'armorExplosiveDamageResonance',
    269: 'armorKineticDamageResonance', 270: 'armorThermalDamageResonance',
    271: 'shieldEmDamageResonance', 272: 'shieldExplosiveDamageResonance',
    273: 'shieldKineticDamageResonance', 274: 'shieldThermalDamageResonance',
    416: 'entityFlyRange', 423: 'entityDroneCount',
    456: 'entityEquipmentMin', 457: 'entityEquipmentMax',
    479: 'shieldRechargeRate', 482: 'capacitorCapacity',
    484: 'shieldUniformity', 504: 'entityWarpScrambleChance',
    505: 'warpScrambleDuration', 506: 'missileLaunchDuration',
    507: 'entityMissileTypeID', 508: 'entityCruiseSpeed',
    512: 'modifyTargetSpeedChance', 513: 'modifyTargetSpeedDuration',
    514: 'modifyTargetSpeedRange', 524: 'armorUniformity',
    552: 'signatureRadius', 630: 'entityArmorRepairDuration',
    631: 'entityArmorRepairAmount', 645: 'missileEntityVelocityMultiplier',
    646: 'missileEntityFlightTimeMultiplier', 858: 'missileEntityAoeCloudSizeMultiplier',
    859: 'missileEntityAoeVelocityMultiplier',
    931: 'energyNeutralizerEntityChance', 942: 'energyNeutralizerDuration',
    974: 'hullEmDamageResonance', 975: 'hullExplosiveDamageResonance',
    976: 'hullKineticDamageResonance', 977: 'hullThermalDamageResonance',
}

SHIP_CLASS_MAP = {
    'Frigate': 'Frigate', 'Frigates': 'Frigate',
    'Destroyer': 'Destroyer', 'Destroyers': 'Destroyer',
    'Cruiser': 'Cruiser', 'Cruisers': 'Cruiser',
    'Battlecruiser': 'Battlecruiser', 'Battlecruisers': 'Battlecruiser',
    'Battleship': 'Battleship', 'Battleships': 'Battleship',
    'Carrier': 'Carrier', 'Dreadnought': 'Dreadnought',
    'Hauler': 'Hauler', 'Freighter': 'Freighter',
    'Industrial': 'Industrial',
}

FACTION_PATTERNS = [
    (r'amarr|emperor|amarr navy|teslam|viziam|sarum|kador|kor-Azor|tash-murkon|ardishapur', 'Amarr Empire'),
    (r'caldari|civire|kaalakiota|lai dai|nu-goa|sukuuvestaa|hibaru|tibus', 'Caldari State'),
    (r'gallente|federation navy|aument|rouvenor', 'Gallente Federation'),
    (r'minmatar|republic|brutor|sebiestor|thukker|stars.?.?end|krusual|nefantar|vherokior', 'Minmatar Republic'),
    (r'angel|gistii|gistum|gist', 'Angel Cartel'),
    (r'blood raider|corpii|corpior|corpum', 'Blood Raiders'),
    (r'guristas|pithi|pithior|pithatis|pithum|pith', 'Guristas'),
    (r'sansha|true sansha|sansha.?s nation|elite frigate', 'Sansha\'s Nation'),
    (r'serpentis|coreli|corelior|corelum|corelatis|corelum', 'Serpentis'),
    (r'mordus|mordus legion', 'Mordus Legion'),
    (r'sleeper|sleepless|awakened|emergent', 'Sleepers'),
    (r'drifters?|drifter', 'Drifters'),
    (r'rogue drone', 'Rogue Drones'),
    (r'merc(enarie)?s?|mercenary', 'Mercenaries'),
]

def get_group_hierarchy(cursor):
    cursor.execute('SELECT groupID, categoryID, groupName FROM invGroups')
    return {r[0]: {'categoryID': r[1], 'groupName': r[2]} for r in cursor.fetchall()}

def classify_ship(group_name, type_name):
    lower = group_name.lower()
    if 'frigate' in lower: return 'Frigate'
    if 'destroyer' in lower: return 'Destroyer'
    if 'battlecruiser' in lower: return 'Battlecruiser'
    if 'battleship' in lower: return 'Battleship'
    if 'cruiser' in lower: return 'Cruiser'
    if 'carrier' in lower: return 'Carrier'
    if 'dreadnought' in lower: return 'Dreadnought'
    if 'hauler' in lower: return 'Hauler'
    if 'industrial' in lower: return 'Industrial'
    return None

def classify_faction(group_name, type_name):
    combined = f'{group_name} {type_name}'.lower()
    for pattern, faction in FACTION_PATTERNS:
        if re.search(pattern, combined):
            return faction
    return None

def damage_resonance_to_profile(em, therm, kin, exp, label='unknown'):
    resists = {'em': em, 'therm': therm, 'kin': kin, 'exp': exp}
    best_in = sorted(resists, key=lambda k: resists[k])[:2]
    best_out = sorted(resists, key=lambda k: resists[k], reverse=True)[:2]
    return {
        'best_damage_to_deal': '/'.join(d.upper() for d in best_in),
        'best_damage_to_tank': '/'.join(d.upper() for d in best_out),
        'em_resonance': em, 'thermal_resonance': therm,
        'kinetic_resonance': kin, 'explosive_resonance': exp,
    }

def main():
    print(f'Connecting to SDE: {DB_PATH}')
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    groups = get_group_hierarchy(c)
    entity_group_ids = [gid for gid, g in groups.items() if g['categoryID'] == 11]

    print(f'Entity groups: {len(entity_group_ids)}')

    c.execute('''
        SELECT t.typeID, t.typeName, t.groupID, g.groupName
        FROM invTypes t
        JOIN invGroups g ON t.groupID = g.groupID
        WHERE t.groupID IN ({})
    '''.format(','.join('?' * len(entity_group_ids))), entity_group_ids)
    types = c.fetchall()
    print(f'Entity types: {len(types)}')

    c.execute('SELECT typeID, attributeID, valueFloat, valueInt FROM dgmTypeAttributes')
    all_attrs = {}
    for row in c.fetchall():
        tid = row['typeID']
        if tid not in all_attrs:
            all_attrs[tid] = {}
        val = row['valueFloat'] if row['valueFloat'] is not None else row['valueInt']
        all_attrs[tid][row['attributeID']] = val

    npc_ships = {}
    for t in types:
        type_id = t['typeID']
        type_name = t['typeName']
        group_id = t['groupID']
        group_name = t['groupName']

        attrs = all_attrs.get(type_id, {})
        if not attrs:
            continue

        ship_class = classify_ship(group_name, type_name)
        if not ship_class:
            continue

        faction = classify_faction(group_name, type_name)

        mapped = {}
        for attr_id, name in COMBAT_ATTRS.items():
            if attr_id in attrs:
                mapped[name] = attrs[attr_id]

        if not any(k in mapped for k in ['hp', 'armorHP', 'shieldCapacity']):
            continue

        dmg_types = []
        for dtype in ['emDamage', 'thermalDamage', 'kineticDamage', 'explosiveDamage']:
            if mapped.get(dtype, 0) > 0:
                dmg_types.append(dtype.replace('Damage', ''))

        has_ewar = mapped.get('warpScrambleStrength', 0) > 1 or mapped.get('entityWarpScrambleChance', 0) > 0.5
        has_web = mapped.get('modifyTargetSpeedChance', 0) > 0.5
        has_neut = mapped.get('energyNeutralizerAmount', 0) > 0 or mapped.get('energyNeutralizerEntityChance', 0) > 0.5
        has_target_painter = mapped.get('scanRadarStrength', 0) > 0

        profile = None
        if all(k in mapped for k in ['armorEmDamageResonance', 'armorThermalDamageResonance', 'armorKineticDamageResonance', 'armorExplosiveDamageResonance']):
            profile = damage_resonance_to_profile(
                mapped['armorEmDamageResonance'], mapped['armorThermalDamageResonance'],
                mapped['armorKineticDamageResonance'], mapped['armorExplosiveDamageResonance'],
                'armor'
            )
        elif all(k in mapped for k in ['shieldEmDamageResonance', 'shieldThermalDamageResonance', 'shieldKineticDamageResonance', 'shieldExplosiveDamageResonance']):
            profile = damage_resonance_to_profile(
                mapped['shieldEmDamageResonance'], mapped['shieldThermalDamageResonance'],
                mapped['shieldKineticDamageResonance'], mapped['shieldExplosiveDamageResonance'],
                'shield'
            )

        npc_ships[type_name] = {
            'typeID': type_id,
            'groupName': group_name,
            'class': ship_class,
            'faction': faction,
            'attrs': mapped,
            'damage_types': dmg_types,
            'ewar': {
                'scramble': has_ewar,
                'web': has_web,
                'neut': has_neut,
                'target_painter': has_target_painter,
            },
            'profile': profile,
        }

    print(f'Combat-relevant NPC ships: {len(npc_ships)}')

    for remove_name in list(npc_ships.keys()):
        if not npc_ships[remove_name]['faction'] and not any(
            keyword in remove_name.lower() for keyword in
            ['sleeper', 'drone', 'drifter', 'rogue', 'merc']
        ):
            pass

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(npc_ships, f, ensure_ascii=False, indent=2)
    print(f'Saved {len(npc_ships)} NPC ships to {OUTPUT}')

    factions = {}
    classes = {}
    for name, ship in npc_ships.items():
        f = ship.get('faction') or 'Unknown'
        factions[f] = factions.get(f, 0) + 1
        c = ship['class']
        classes[c] = classes.get(c, 0) + 1
    print('\nBy faction:', dict(sorted(factions.items(), key=lambda x: -x[1])))
    print('\nBy class:', dict(sorted(classes.items(), key=lambda x: -x[1])))

    conn.close()

if __name__ == '__main__':
    main()
