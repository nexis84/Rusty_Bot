import json, re, os, shutil

MISSIONS_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'missions.json')
NPC_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'npc-ships.json')
BACKUP_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'missions-backup.json')

with open(MISSIONS_PATH, 'r', encoding='utf-8') as f:
    missions = json.load(f)

with open(NPC_DB_PATH, 'r', encoding='utf-8') as f:
    npc_db = json.load(f)

print(f'Missions: {len(missions)}')
print(f'NPC ships in DB: {len(npc_db)}')

# ===== CANONICAL FIELD NAMES =====
CANONICAL_FIELDS = {
    'damage dealt': 'Damage dealt', 'damage_dealt': 'Damage dealt',
    'recommended damage dealing': 'Recommended damage dealing',
    'recommended_damage_dealing': 'Recommended damage dealing',
    'web/scramble': 'Web/Scramble', 'web_scramble': 'Web/Scramble',
    'recommended ship classes': 'Recommended ship classes',
    'recommended_ship_classes': 'Recommended ship classes',
    'faction': 'Faction', 'blitz': 'Blitz', 'video': 'Video',
    'mission type': 'Mission type', 'space type': 'Space type',
}

def normalize_info(info):
    changed = {}
    for key in list(info.keys()):
        lower = key.lower().strip()
        if lower in CANONICAL_FIELDS and CANONICAL_FIELDS[lower] != key:
            changed[CANONICAL_FIELDS[lower]] = info[key]
            del info[key]
    for k, v in changed.items():
        if k not in info or not info[k]:
            info[k] = v

def get_info(info, key):
    normalize_info(info)
    return info.get(key, '')

def set_info(info, key, value):
    normalize_info(info)
    if key not in info or not info[key].strip():
        info[key] = value
        return True
    return False

# ===== NPC NAME INDEXING =====
npc_by_lower = {}
npc_by_short = {}
npc_name_fragments = {}

for name, ship in npc_db.items():
    lower = name.lower().strip()
    npc_by_lower[lower] = ship
    short = re.sub(r'[^a-z0-9\s]', '', lower)
    npc_by_short[short] = ship

    words = short.split()
    for i in range(len(words)):
        for j in range(i + 1, len(words) + 1):
            frag = ' '.join(words[i:j])
            if frag not in npc_name_fragments:
                npc_name_fragments[frag] = []
            npc_name_fragments[frag].append(ship)

# ===== FACTION DAMAGE PROFILES =====
FACTION_DAMAGE = {
    'angel': ('Explosive', 'Kinetic'),
    'guristas': ('Kinetic', 'Thermal'),
    'serpentis': ('Thermal', 'Kinetic'),
    'sansha': ('EM', 'Thermal'),
    'blood': ('EM', 'Thermal'),
    'amarr': ('EM', 'Thermal'),
    'caldari': ('Kinetic', 'Thermal'),
    'gallente': ('Thermal', 'Kinetic'),
    'minmatar': ('Explosive', 'Kinetic'),
    'mercenarie': ('Kinetic', 'Thermal'),
    'merc': ('Kinetic', 'Thermal'),
    'rogue': ('Kinetic', 'Thermal'),
    'sleeper': ('EM', 'Thermal'),
    'drifter': ('EM', 'Thermal'),
    'mordus': ('Kinetic', 'Thermal'),
}

# ===== NPC NAME EXTRACTION =====
def expand_npc_names(text):
    """Extract individual NPC ship names from lines like:
    '5x Destroyers (Gistior Defacer/Shatterer)' -> ['Gistior Defacer', 'Gistior Shatterer']
    '3x Cruisers (Gistum Predator/Smasher)' -> ['Gistum Predator', 'Gistum Smasher']
    '2x Mining Drone (Infester Alvi)' -> ['Infester Alvi']
    """
    results = []
    text_clean = re.sub(r'\([^)]*\)', lambda m: m.group(0).replace('\n', ' '), text)

    # Pattern 1: "Nx Something (Name1/Name2)" - names in parens
    for m in re.finditer(r'(\d+)\s*[x×X✕]\s*[^(]+\(([^)]+)\)', text_clean):
        content = m.group(2).strip()
        parts = [p.strip() for p in re.split(r'[,/]', content)]
        parts = [p for p in parts if p and len(p) > 2]

        # Handle prefix sharing: "Gistum Predator/Smasher" -> Gistum Predator, Gistum Smasher
        if parts and '/' in m.group(2):
            first_words = parts[0].split()
            for i, part in enumerate(parts):
                if i > 0 and not part.startswith(first_words[0]):
                    shared = first_words[0]
                    if len(first_words) > 1 and not part.startswith(first_words[-1]):
                        shared = ' '.join(first_words[:-1])
                    part = f'{shared} {part}'
                results.append(part)
        else:
            results.extend(parts)

    # Pattern 2: "Nx Name" without parens after
    for m in re.finditer(r'(\d+)\s*[x×X✕]\s*([A-Z][A-Za-z\s\'\-]+?)(?:\s*[\[(,–\-]|\s+--|Trigger|\s*$)', text_clean):
        name = m.group(2).strip().rstrip(',.;')
        if name and len(name) > 3 and not re.search(r'\b(group|wave|pocket|room|distance|km)\b', name, re.I):
            results.append(name)

    # Pattern 3: "Elite Frigates (Faction Webifier/Kyoukan)" 
    for m in re.finditer(r'\(([^)]*Web[^)]*)\)', text_clean):
        content = m.group(1).strip()
        for p in re.split(r'[,/]', content):
            p = p.strip()
            if p and len(p) > 2 and not re.search(r'\b(frigate|cruiser|battleship)\b', p, re.I):
                results.append(p)

    return list(dict.fromkeys(results))

def extract_all_npc_names(all_lines):
    names = []
    for line in all_lines:
        names.extend(expand_npc_names(line))
    return list(dict.fromkeys(names))

# ===== NPC NAME MATCHING =====
def match_npc(name):
    key = name.lower().strip()
    key_ns = re.sub(r'[^a-z0-9\s]', '', key).strip()
    key_ns = re.sub(r'\s+', ' ', key_ns)

    direct = npc_by_lower.get(key)
    if direct: return direct
    direct = npc_by_lower.get(key_ns)
    if direct: return direct
    direct = npc_by_short.get(key_ns)
    if direct: return direct
    direct = npc_by_short.get(key)
    if direct: return direct

    # Exact fragment match
    if key_ns in npc_name_fragments:
        return npc_name_fragments[key_ns][0]

    # Try dropping trailing generic words
    for drop in [' elite', ' frigate', ' cruiser', ' destroyer', ' battleship', ' battlecruiser']:
        trimmed = key_ns.replace(drop, '')
        if trimmed in npc_name_fragments:
            return npc_name_fragments[trimmed][0]

    # Try each word subsequence against fragment index
    words = key_ns.split()
    best = None
    best_len = 0
    for i in range(len(words)):
        for j in range(i + 1, len(words) + 1):
            frag = ' '.join(words[i:j])
            if frag in npc_name_fragments and len(frag) > best_len:
                best = npc_name_fragments[frag][0]
                best_len = len(frag)

    # Substring match against all NPC names
    if not best and len(key_ns) > 4:
        for npc_name, ship in npc_db.items():
            npc_lower = npc_name.lower()
            npc_short = re.sub(r'[^a-z0-9\s]', '', npc_lower)
            words_in_npc = npc_short.split()
            for w in key_ns.split():
                if len(w) > 4 and w in npc_short:
                    # found word match
                    if len(words) >= 2 and any(w2 in npc_short for w2 in words if len(w2) > 3):
                        best = ship
                        break
            if best:
                break

    return best

# ===== FACTION DETECTION =====
def detect_faction(info, all_lines, matched_ships):
    info_faction = get_info(info, 'Faction')
    if info_faction:
        lower = info_faction.lower()
        for key in FACTION_DAMAGE:
            if key in lower:
                return key

    for ship in matched_ships:
        sf = ship.get('faction')
        if sf:
            return sf.lower().replace("'s", "").replace("'", "").strip()

    text = ' '.join(all_lines).lower()
    for key in FACTION_DAMAGE:
        if key in text:
            return key
    return None

# ===== DATA AGGREGATION =====
def aggregate_npc_data(matched_ships, faction_key):
    dmg_types = set()
    resists = {'em': [], 'thermal': [], 'kinetic': [], 'explosive': []}
    ewar = {'scramble': False, 'web': False}
    ship_classes = set()

    for ship in matched_ships:
        attrs = ship.get('attrs', {})
        for dt in ['em', 'thermal', 'kinetic', 'explosive']:
            val = attrs.get(f'{dt}Damage', 0)
            if val and val > 0.5:
                dmg_types.add(dt.title())

        ship_class = ship.get('class')
        if ship_class:
            ship_classes.add(ship_class)

        profile = ship.get('profile')
        if profile:
            for dt in ['em', 'thermal', 'kinetic', 'explosive']:
                rk = f'{dt}_resonance'
                if rk in profile:
                    resists[dt].append(profile[rk])

        se = ship.get('ewar', {})
        ewar['scramble'] = ewar['scramble'] or se.get('scramble', False)
        ewar['web'] = ewar['web'] or se.get('web', False)

    # Damage dealt = what NPCs shoot
    if dmg_types:
        order = ['Em', 'Thermal', 'Kinetic', 'Explosive']
        sorted_dmg = sorted(dmg_types, key=lambda x: order.index(x) if x in order else 99)
        dmg_dealt = '/'.join(sorted_dmg)
    else:
        dmg_dealt = ''

    # Recommended damage dealing = what NPCs are weak to (from resonance)
    has_resists = any(v for v in resists.values())
    if has_resists:
        avg = {}
        for dt, vals in resists.items():
            avg[dt] = sum(vals) / len(vals) if vals else 1.0
        sorted_weak = sorted(avg, key=lambda k: avg[k])
        rec_dmg = '/'.join(d.upper() for d in sorted_weak[:2])
    elif faction_key and faction_key in FACTION_DAMAGE:
        rec_dmg = '/'.join(FACTION_DAMAGE[faction_key])
    else:
        rec_dmg = dmg_dealt

    # Web/Scramble
    ewar_parts = []
    if ewar['scramble']: ewar_parts.append('Scramble')
    if ewar['web']: ewar_parts.append('Web')
    ewar_str = ', '.join(ewar_parts)

    # Ship classes
    class_order = ['Frigate', 'Destroyer', 'Cruiser', 'Battlecruiser', 'Battleship']
    sorted_classes = sorted(ship_classes, key=lambda c: class_order.index(c) if c in class_order else 99)

    return dmg_dealt, rec_dmg, ewar_str, ', '.join(sorted_classes)

# ===== MAIN =====
DESIRED_FIELDS = ['Damage dealt', 'Recommended damage dealing', 'Web/Scramble', 'Recommended ship classes']

def count_missing():
    counts = {k: 0 for k in DESIRED_FIELDS}
    for m in missions.values():
        info = m.get('info', {})
        for k in DESIRED_FIELDS:
            if not get_info(info, k):
                counts[k] = counts.get(k, 0) + 1
    return counts

before = count_missing()
print(f'\nMissing before:')
for k, v in sorted(before.items(), key=lambda x: -x[1]):
    print(f'  {k}: {v}')

stats = {
    'dmg_filled': 0, 'rec_filled': 0, 'web_filled': 0, 'ship_filled': 0,
    'matched': 0, 'total_candidates': 0,
    'by_faction': 0, 'by_sde': 0,
}

for name, m in missions.items():
    info = m.get('info', {})
    normalize_info(info)
    all_lines = [l for p in m.get('pockets', []) for l in p.get('lines', [])]

    npc_names = extract_all_npc_names(all_lines)
    matched_ships = []
    for n in npc_names:
        ship = match_npc(n)
        if ship:
            matched_ships.append(ship)

    stats['total_candidates'] += len(npc_names)
    stats['matched'] += len(matched_ships)

    faction_key = detect_faction(info, all_lines, matched_ships)

    if not matched_ships:
        # Fallback: use faction data
        if faction_key and faction_key in FACTION_DAMAGE:
            dmg = '/'.join(FACTION_DAMAGE[faction_key])
            if set_info(info, 'Damage dealt', dmg): stats['dmg_filled'] += 1
            if set_info(info, 'Recommended damage dealing', dmg): stats['rec_filled'] += 1
            stats['by_faction'] += 1
        continue

    dmg_dealt, rec_dmg, ewar_str, ship_classes = aggregate_npc_data(matched_ships, faction_key)

    if set_info(info, 'Damage dealt', dmg_dealt): stats['dmg_filled'] += 1
    if set_info(info, 'Recommended damage dealing', rec_dmg): stats['rec_filled'] += 1
    if set_info(info, 'Web/Scramble', ewar_str): stats['web_filled'] += 1
    if set_info(info, 'Recommended ship classes', ship_classes): stats['ship_filled'] += 1
    if matched_ships: stats['by_sde'] += 1

after = count_missing()
print(f'\nMissing after:')
for k, v in sorted(after.items(), key=lambda x: -x[1]):
    print(f'  {k}: {v}')

print(f'\nFill stats:')
print(f'  Damage dealt: {stats["dmg_filled"]}')
print(f'  Recommended damage: {stats["rec_filled"]}')
print(f'  Web/Scramble: {stats["web_filled"]}')
print(f'  Ship classes: {stats["ship_filled"]}')
print(f'  By SDE match: {stats["by_sde"]}, by faction fallback: {stats["by_faction"]}')
print(f'  NPC match rate: {stats["matched"]}/{stats["total_candidates"]} ({stats["matched"]*100//max(stats["total_candidates"],1)}%)')

shutil.copy2(MISSIONS_PATH, BACKUP_PATH)
print(f'\nBackup: {BACKUP_PATH}')

with open(MISSIONS_PATH, 'w', encoding='utf-8') as f:
    json.dump(missions, f, ensure_ascii=False, indent=2)
print(f'Saved: {MISSIONS_PATH}')

remaining = {k: [] for k in DESIRED_FIELDS}
for name, m in missions.items():
    info = m.get('info', {})
    for k in DESIRED_FIELDS:
        if not get_info(info, k):
            remaining[k].append((name, m.get('title', '?')))

print(f'\nStill missing:')
for k, items in sorted(remaining.items(), key=lambda x: -len(x[1])):
    print(f'  {k}: {len(items)}')
    if k == 'Damage dealt' and items:
        for n, t in items[:20]:
            fac = get_info(missions[n].get('info', {}), 'Faction')
            print(f'    {n}: {t} [{fac}]')
