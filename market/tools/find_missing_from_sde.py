#!/usr/bin/env python3
"""
Find missing tradeable items by comparing SDE against current database
Outputs results to ../../SDE/missing_items.json for review
"""

import json
import re
import yaml
from pathlib import Path
from datetime import datetime

# Paths
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent.resolve()
SDE_DIR = PROJECT_ROOT / "SDE"
DATABASE_FILE = PROJECT_ROOT / "market" / "items_database.js"
OUTPUT_FILE = SDE_DIR / "missing_items.json"

def load_current_items():
    """Load current items from items_database.js"""
    print("Loading current items from database...")
    
    with open(DATABASE_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract all item IDs using regex - matches { id: 123, name: "Item Name" }
    # Handles optional trailing commas, escaped quotes in names (\"), and various whitespace
    pattern = r'\{\s*id:\s*(\d+),\s*name:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\}'
    matches = re.findall(pattern, content)
    
    print(f"  Regex matched {len(matches)} items")
    
    # Build dict, handling duplicates (keep last occurrence)
    # Also unescape any escaped quotes in names
    current_items = {}
    for id_str, name in matches:
        item_id = int(id_str)
        # Unescape escaped quotes: \" -> "
        clean_name = name.replace('\\"', '"')
        if item_id in current_items:
            print(f"  WARNING: Duplicate ID {item_id}")
        current_items[item_id] = clean_name
    
    print(f"  Found {len(current_items)} unique items in database")
    
    # Debug: check for some known items
    test_ids = [47102, 92456, 3958]
    for test_id in test_ids:
        if test_id in current_items:
            print(f"  [OK] ID {test_id} found: {current_items[test_id]}")
        else:
            print(f"  [MISSING] ID {test_id} NOT FOUND in database")
    
    return current_items

def load_sde_types():
    """Load types from SDE YAML"""
    types_file = SDE_DIR / "fsd" / "types.yaml"
    
    if not types_file.exists():
        print(f"ERROR: SDE not found at {types_file}")
        print("Please run download_sde.py first")
        return None
    
    print(f"\nLoading SDE types from {types_file.name}...")
    print("  (This may take a minute - file is large)")
    
    with open(types_file, 'r', encoding='utf-8') as f:
        types_data = yaml.safe_load(f)
    
    print(f"  Loaded {len(types_data)} types from SDE")
    return types_data

def is_tradeable(type_data):
    """Check if an item is tradeable based on SDE data"""
    # Must be published
    if not type_data.get('published', False):
        return False
    
    # Must have a market group to be tradeable
    if type_data.get('marketGroupID') is None:
        return False
    
    return True

def main():
    # Load current database
    current_items = load_current_items()
    current_ids = set(current_items.keys())
    
    # Load SDE
    types_data = load_sde_types()
    if not types_data:
        return
    
    # Find missing tradeable items
    print("\nAnalyzing SDE for missing tradeable items...")
    missing_items = []
    
    for type_id, type_data in types_data.items():
        type_id = int(type_id)
        
        # Skip if already in database
        if type_id in current_ids:
            continue
        
        # Check if tradeable
        if not is_tradeable(type_data):
            continue
        
        # Get item details
        name = type_data.get('name', {}).get('en', f'Unknown_{type_id}')
        group_id = type_data.get('groupID')
        market_group_id = type_data.get('marketGroupID')
        volume = type_data.get('volume', 0)
        
        missing_items.append({
            'id': type_id,
            'name': name,
            'group_id': group_id,
            'market_group_id': market_group_id,
            'volume': volume
        })
    
    # Sort by name
    missing_items.sort(key=lambda x: x['name'])
    
    # Prepare output
    output = {
        'generated_at': datetime.now().isoformat(),
        'total_in_database': len(current_items),
        'total_in_sde': len(types_data),
        'missing_tradeable_count': len(missing_items),
        'missing_items': missing_items
    }
    
    # Save results
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Analysis complete!")
    print(f"  Items in database: {len(current_items)}")
    print(f"  Total items in SDE: {len(types_data)}")
    print(f"  Missing tradeable items: {len(missing_items)}")
    print(f"\nResults saved to: {OUTPUT_FILE}")
    
    # Show sample
    if missing_items:
        print(f"\nSample missing items (first 10):")
        for item in missing_items[:10]:
            print(f"  - {item['name']} (ID: {item['id']})")
        
        if len(missing_items) > 10:
            print(f"  ... and {len(missing_items) - 10} more")
        
        print(f"\nTo approve items for addition:")
        print(f"  1. Review {OUTPUT_FILE}")
        print(f"  2. Create an 'approved_ids.json' with IDs to add")
        print(f"  3. Run add_approved_items.py to update database")

if __name__ == "__main__":
    try:
        import yaml
    except ImportError:
        print("ERROR: PyYAML not installed")
        print("Install with: pip install pyyaml")
        sys.exit(1)
    
    main()
