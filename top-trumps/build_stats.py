#!/usr/bin/env python3
import json
from pathlib import Path

SDE_DIR = Path(r"c:\Users\nexis\Desktop\Rusty_Bot-main\sde")
OUTPUT_FILE = Path(r"c:\Users\nexis\Desktop\Rusty_Bot-main\top-trumps\ship-stats.json")

def load_jsonl(filename):
    data = {}
    filepath = SDE_DIR / filename
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                obj = json.loads(line)
                data[obj['_key']] = obj
    return data

ATTR_IDS = {
    'hp': 9,
    'maxVelocity': 37,
    'capacity': 38,
    'agility': 70,
    'maxLockedTargets': 192,
    'shieldCapacity': 263,
    'armorHP': 265,
    'droneCapacity': 283,
    'capacitorCapacity': 482,
    'scanResolution': 564,
    'warpSpeedMultiplier': 600,
    'signatureRadius': 552,
    'maxTargetRange': 76,
}

def main():
    print("Loading SDE files...")
    categories = load_jsonl('categories.jsonl')
    groups = load_jsonl('groups.jsonl')
    races = load_jsonl('races.jsonl')
    type_dogma = load_jsonl('typeDogma.jsonl')

    # Find ship category (should be ID 6)
    ship_cat_id = None
    for cid, c in categories.items():
        if c.get('name', {}).get('en') == 'Ship':
            ship_cat_id = cid
            break
    print(f"Ship category ID: {ship_cat_id}")

    # Collect ship group IDs
    ship_group_ids = set()
    group_names = {}
    for gid, g in groups.items():
        if g.get('categoryID') == ship_cat_id and g.get('published'):
            ship_group_ids.add(gid)
            group_names[gid] = g.get('name', {}).get('en', 'Unknown')

    race_names = {}
    for rid, r in races.items():
        race_names[rid] = r.get('name', {}).get('en', 'Unknown')

    print(f"Ship groups: {len(ship_group_ids)}")

    # Build lookups from hashes to ints for filtering ships later
    ship_group_ids_int = set()
    for x in ship_group_ids:
        if isinstance(x, str):
            ship_group_ids_int.add(int(x))
        else:
            ship_group_ids_int.add(x)

    group_names_int = {}
    for k, v in group_names.items():
        if isinstance(k, str):
            group_names_int[int(k)] = v
        else:
            group_names_int[k] = v

    race_names_int = {}
    for k, v in race_names.items():
        if isinstance(k, str):
            race_names_int[int(k)] = v
        else:
            race_names_int[k] = v

    print("Processing types.jsonl...")
    ships_data = {}
    with open(SDE_DIR / 'types.jsonl', 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            t = json.loads(line)
            type_id_raw = t['_key']
            type_id = int(type_id_raw) if isinstance(type_id_raw, str) else type_id_raw

            if not t.get('published', False):
                continue

            gid = t.get('groupID')
            if gid not in ship_group_ids_int:
                continue

            name = t.get('name', {}).get('en', 'Unknown')
            race_id = t.get('raceID')
            race = race_names_int.get(race_id, 'Unknown')
            ship_class = group_names_int.get(gid, 'Unknown')
            base_price = t.get('basePrice', 0)
            mass = t.get('mass', 0)
            cargo_capacity = t.get('capacity', 0)

            ships_data[type_id] = {
                'name': name,
                'race': race,
                'class': ship_class,
                'basePrice': base_price,
                'mass': mass,
                'capacity': cargo_capacity,
            }

    print(f"Found {len(ships_data)} ships in types.jsonl")

    # Apply dogma attributes
    print("Applying dogma attributes...")
    for raw_type_id, dogma_entry in type_dogma.items():
        type_id = int(raw_type_id) if isinstance(raw_type_id, str) else raw_type_id
        if type_id not in ships_data:
            continue
        attrs = dogma_entry.get('dogmaAttributes', [])
        for a in attrs:
            aid = a['attributeID']
            val = a['value']
            for stat_name, attr_id in ATTR_IDS.items():
                if aid == attr_id:
                    ships_data[type_id][stat_name] = val
                    break

    # Build final output: for each stat name, have display info and ship values
    stats_meta = {
        'hp': {'name': 'Structure HP', 'unit': 'HP', 'highIsGood': True},
        'armorHP': {'name': 'Armor HP', 'unit': 'HP', 'highIsGood': True},
        'shieldCapacity': {'name': 'Shield HP', 'unit': 'HP', 'highIsGood': True},
        'maxVelocity': {'name': 'Max Velocity', 'unit': 'm/s', 'highIsGood': True},
        'capacitorCapacity': {'name': 'Capacitor', 'unit': 'GJ', 'highIsGood': True},
        'mass': {'name': 'Mass', 'unit': 'kg', 'highIsGood': False},
        'agility': {'name': 'Inertia Modifier', 'unit': '', 'highIsGood': False},
        'capacity': {'name': 'Cargo', 'unit': 'm³', 'highIsGood': True},
        'droneCapacity': {'name': 'Drone Bay', 'unit': 'm³', 'highIsGood': True},
        'scanResolution': {'name': 'Scan Resolution', 'unit': 'mm', 'highIsGood': True},
        'warpSpeedMultiplier': {'name': 'Warp Speed', 'unit': 'x', 'highIsGood': True},
        'signatureRadius': {'name': 'Signature Radius', 'unit': 'm', 'highIsGood': False},
        'maxTargetRange': {'name': 'Target Range', 'unit': 'km', 'highIsGood': True},
        'maxLockedTargets': {'name': 'Max Targets', 'unit': '', 'highIsGood': True},
        'basePrice': {'name': 'Base Price', 'unit': 'ISK', 'highIsGood': True},
    }

    output = {
        'generated': '2026-07-31',
        'stats': stats_meta,
        'ships': {},
    }

    for type_id, ship in ships_data.items():
        entry = {}
        for stat_name in stats_meta:
            if stat_name in ship:
                entry[stat_name] = ship[stat_name]
        output['ships'][str(type_id)] = entry

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Written {len(ships_data)} ships to ship-stats.json")

if __name__ == '__main__':
    main()
