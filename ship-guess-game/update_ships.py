#!/usr/bin/env python3
"""
Extract ship data from EVE Online static data export and create ships.json for the guessing game.
"""

import json
import re
from pathlib import Path
from collections import defaultdict

# Path to the static data directory
STATIC_DATA_DIR = Path(r"c:\Users\nexis\Desktop\Rusty_Bot-main\ship-guess-game\Static Dump\jan 2026\eve-online-static-data-3171578-jsonl")
OUTPUT_FILE = Path(r"c:\Users\nexis\Desktop\Rusty_Bot-main\ship-guess-game\data\ships.json")

def load_jsonl(filename):
    """Load a JSONL file and return a dictionary keyed by _key"""
    data = {}
    filepath = STATIC_DATA_DIR / filename
    print(f"Loading {filename}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                obj = json.loads(line)
                data[obj['_key']] = obj
    return data

def clean_bonus_text(text):
    """Remove HTML tags from bonus text"""
    if not text:
        return ""
    # Remove <a href...> tags
    text = re.sub(r'<a [^>]*>', '', text)
    text = re.sub(r'</a>', '', text)
    return text.strip()

def main():
    # Load all required data files
    print("Loading static data files...")
    categories = load_jsonl('categories.jsonl')
    groups = load_jsonl('groups.jsonl')
    races = load_jsonl('races.jsonl')
    
    # Load type bonuses
    print("Loading type bonuses...")
    type_bonuses = {}
    with open(STATIC_DATA_DIR / 'typeBonus.jsonl', 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                obj = json.loads(line)
                type_key = obj['_key']
                type_bonuses[type_key] = obj
    
    # Find ship category ID (should be 6)
    ship_category_id = None
    for cat_id, cat_data in categories.items():
        if cat_data.get('name', {}).get('en') == 'Ship':
            ship_category_id = cat_id
            break
    
    print(f"Ship category ID: {ship_category_id}")
    
    # Find all ship group IDs
    ship_group_ids = set()
    group_names = {}
    for group_id, group_data in groups.items():
        if group_data.get('categoryID') == ship_category_id and group_data.get('published'):
            ship_group_ids.add(group_id)
            group_names[group_id] = group_data.get('name', {}).get('en', 'Unknown')
    
    print(f"Found {len(ship_group_ids)} ship groups")
    
    # Build race name lookup
    race_names = {}
    for race_id, race_data in races.items():
        race_names[race_id] = race_data.get('name', {}).get('en', 'Unknown')
    
    # Now process types.jsonl to find ships
    print("Processing types.jsonl to extract ships...")
    ships = []
    
    with open(STATIC_DATA_DIR / 'types.jsonl', 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            
            type_obj = json.loads(line)
            type_id = type_obj['_key']
            
            # Check if this is a published ship
            if not type_obj.get('published', False):
                continue
            
            group_id = type_obj.get('groupID')
            if group_id not in ship_group_ids:
                continue
            
            # This is a ship!
            ship_name = type_obj.get('name', {}).get('en', 'Unknown')
            
            # Get race
            race_id = type_obj.get('raceID')
            race = race_names.get(race_id, 'Unknown')
            
            # Get ship class from group
            ship_class = group_names.get(group_id, 'Unknown')
            
            # Get bonuses
            bonuses = []
            if type_id in type_bonuses:
                bonus_data = type_bonuses[type_id]
                
                # Add role bonuses
                if 'roleBonuses' in bonus_data:
                    for role_bonus in bonus_data['roleBonuses']:
                        bonus_text = role_bonus.get('bonusText', {}).get('en', '')
                        if bonus_text:
                            bonuses.append(clean_bonus_text(bonus_text))
                
                # Add type-specific bonuses
                if 'types' in bonus_data:
                    for type_bonus in bonus_data['types']:
                        if '_value' in type_bonus:
                            for val in type_bonus['_value']:
                                bonus_text = val.get('bonusText', {}).get('en', '')
                                if bonus_text:
                                    bonuses.append(clean_bonus_text(bonus_text))
            
            # Create ship entry
            ship_entry = {
                "name": ship_name,
                "race": race,
                "class": ship_class,
                "bonuses": bonuses
            }
            
            ships.append(ship_entry)
    
    print(f"Extracted {len(ships)} ships")
    
    # Sort ships by name
    ships.sort(key=lambda x: x['name'])
    
    # Write output
    print(f"Writing to {OUTPUT_FILE}...")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(ships, f, indent=2, ensure_ascii=False)
    
    print(f"Successfully created ships.json with {len(ships)} ships!")
    
    # Print some statistics
    race_counts = defaultdict(int)
    class_counts = defaultdict(int)
    for ship in ships:
        race_counts[ship['race']] += 1
        class_counts[ship['class']] += 1
    
    print("\nShips by race:")
    for race, count in sorted(race_counts.items()):
        print(f"  {race}: {count}")
    
    print(f"\nShips by class (top 10):")
    for ship_class, count in sorted(class_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"  {ship_class}: {count}")

if __name__ == '__main__':
    main()
