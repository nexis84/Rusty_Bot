#!/usr/bin/env python3
"""Top Trumps data generator.

Single source of truth for the game's data files. One pass over the local
SDE JSONL snapshot emits BOTH:
  - ship-stats.json  (per-ship stat values + stat metadata, consumed by app.js)
  - ships.js         (roster: {id, name, class, race}, consumed as global SHIPS)

Run after syncing the SDE (SDE tracker `node tracker.mjs`):
    python build_stats.py
"""
import json
from datetime import date
from pathlib import Path

SDE_DIR = Path(__file__).resolve().parent.parent / 'sde'
OUTPUT_STATS = Path(__file__).resolve().parent / 'ship-stats.json'
OUTPUT_ROSTER = Path(__file__).resolve().parent / 'ships.js'

# Dogma attribute IDs used as card stats (order defines card display order)
STATS_META = {
    'hp':                  {'name': 'Structure HP',      'unit': 'HP',  'highIsGood': True},
    'armorHP':             {'name': 'Armor HP',          'unit': 'HP',  'highIsGood': True},
    'shieldCapacity':     {'name': 'Shield HP',          'unit': 'HP',  'highIsGood': True},
    'maxVelocity':         {'name': 'Max Velocity',      'unit': 'm/s', 'highIsGood': True},
    'capacitorCapacity':  {'name': 'Capacitor',         'unit': 'GJ',  'highIsGood': True},
    'mass':                {'name': 'Mass',              'unit': 'kg',  'highIsGood': False},
    'agility':             {'name': 'Inertia Modifier',  'unit': '',    'highIsGood': False},
    'capacity':            {'name': 'Cargo',             'unit': 'm³',  'highIsGood': True},
    'droneCapacity':       {'name': 'Drone Bay',        'unit': 'm³',  'highIsGood': True},
    'scanResolution':      {'name': 'Scan Resolution',   'unit': 'mm',  'highIsGood': True},
    'warpSpeedMultiplier': {'name': 'Warp Speed',        'unit': 'x',   'highIsGood': True},
    'signatureRadius':     {'name': 'Signature Radius',  'unit': 'm',   'highIsGood': False},
    'maxTargetRange':      {'name': 'Target Range',      'unit': 'km', 'highIsGood': True},
    'maxLockedTargets':    {'name': 'Max Targets',       'unit': '',   'highIsGood': True},
    'basePrice':           {'name': 'Base Price',        'unit': 'ISK','highIsGood': True},
}

# dogma attributeID lookup (basePrice/mass/capacity come from the type itself)
DOGMA_ATTR_IDS = {
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


def load_jsonl(filename):
    data = {}
    with open(SDE_DIR / filename, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                obj = json.loads(line)
                data[obj['_key']] = obj
    return data


def read_build_meta():
    try:
        with open(SDE_DIR / '_sde.jsonl', 'r', encoding='utf-8') as f:
            meta = json.loads(f.read())
        return str(meta.get('buildNumber', '?'))
    except Exception:
        return '?'


def main():
    build = read_build_meta()
    print(f"SDE dir: {SDE_DIR} (build {build})")

    categories = load_jsonl('categories.jsonl')
    groups = load_jsonl('groups.jsonl')
    races = load_jsonl('races.jsonl')
    type_dogma = load_jsonl('typeDogma.jsonl')

    ship_cat_id = next(
        (cid for cid, c in categories.items()
         if c.get('name', {}).get('en') == 'Ship' and c.get('published')),
        None,
    )
    if ship_cat_id is None:
        raise SystemExit('Ship category not found in categories.jsonl')
    print(f"Ship category ID: {ship_cat_id}")

    ship_group_ids, group_names = set(), {}
    for gid, g in groups.items():
        if g.get('categoryID') == ship_cat_id and g.get('published'):
            ship_group_ids.add(int(gid))
            group_names[int(gid)] = g.get('name', {}).get('en', 'Unknown')
    print(f"Ship groups: {len(ship_group_ids)}")

    race_names = {int(rid): r.get('name', {}).get('en', 'Unknown')
                  for rid, r in races.items()}

    print("Processing types.jsonl ...")
    ships = {}
    with open(SDE_DIR / 'types.jsonl', 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            t = json.loads(line)
            if not t.get('published', False):
                continue
            gid = t.get('groupID')
            if gid not in ship_group_ids:
                continue
            type_id = int(t['_key'])
            ships[type_id] = {
                'name': t.get('name', {}).get('en', 'Unknown'),
                'race': race_names.get(t.get('raceID'), 'Unknown'),
                'class': group_names.get(gid, 'Unknown'),
                'basePrice': t.get('basePrice', 0),
                'mass': t.get('mass', 0),
                'capacity': t.get('capacity', 0),
            }
    print(f"Found {len(ships)} published ships")

    print("Applying dogma attributes ...")
    attr_name_by_id = {v: k for k, v in DOGMA_ATTR_IDS.items()}
    for raw_id, dogma_entry in type_dogma.items():
        type_id = int(raw_id)
        if type_id not in ships:
            continue
        for a in dogma_entry.get('dogmaAttributes', []):
            stat_name = attr_name_by_id.get(a['attributeID'])
            if stat_name:
                ships[type_id][stat_name] = a['value']

    # ---- build outputs (roster sorted by id for deterministic diffs) ----
    roster = [
        {'id': tid, 'name': s['name'], 'class': s['class'], 'race': s['race']}
        for tid, s in sorted(ships.items())
    ]
    stats_out = {
        'generated': date.today().isoformat(),
        'sdeBuild': build,
        'stats': STATS_META,
        'ships': {
            str(tid): {k: s[k] for k in STATS_META if k in s}
            for tid, s in sorted(ships.items())
        },
    }

    OUTPUT_STATS.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_STATS, 'w', encoding='utf-8') as f:
        json.dump(stats_out, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(stats_out['ships'])} ships -> {OUTPUT_STATS.name}")

    roster_js = (
        '// Auto-generated from EVE Online SDE by build_stats.py — do not edit by hand\n'
        f'// SDE build: {build}\n'
        f'// Ships: {len(roster)}\n'
        f'// Generated: {stats_out["generated"]}\n\n'
        f'var SHIPS = {json.dumps(roster, indent=2, ensure_ascii=False)};\n'
    )
    with open(OUTPUT_ROSTER, 'w', encoding='utf-8') as f:
        f.write(roster_js)
    print(f"Wrote {len(roster)} ships -> {OUTPUT_ROSTER.name}")

    # ---- validation ----
    print('\nValidation:')
    class_counts = {}
    for s in roster:
        class_counts[s['class']] = class_counts.get(s['class'], 0) + 1
    print(f'  classes: {len(class_counts)}')

    statless = [tid for tid, s in ships.items()
                if not any(k in s for k in STATS_META
                           if k not in ('basePrice', 'mass', 'capacity'))]
    print(f'  ships with no dogma stats: {len(statless)}'
          + (f' e.g. {[ships[t]["name"] for t in statless[:5]]}' if statless else ''))

    missing = []
    for stat in STATS_META:
        n = sum(1 for s in ships.values() if stat not in s)
        if n:
            missing.append(f'{stat}: {n} ships missing')
    print('  stat coverage: ' + ('all 15 stats on all ships'
          if not missing else '; '.join(missing)))

    roster_ids = {s['id'] for s in roster}
    stats_ids = {int(i) for i in stats_out['ships']}
    assert roster_ids == stats_ids, 'roster/stats id mismatch!'
    print('  cross-check: every roster id has stats OK')


if __name__ == '__main__':
    main()
