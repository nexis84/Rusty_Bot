import csv
import json
import requests
from collections import defaultdict

print("="*60)
print("Complete Market Database Generator")
print("="*60)

EVE_FILES_URL = 'https://eve-files.com/chribba/typeid.txt'

# Try loading from SDE CSV files first, fallback to eve-files.com
use_sde = True
try:
    # Check if CSV files exist
    with open('invGroups.csv', 'r', encoding='utf-8') as f:
        pass
    with open('invTypes.csv', 'r', encoding='utf-8') as f:
        pass
    print("Using Fuzzwork SDE CSV Data")
except FileNotFoundError:
    print("SDE CSV files not found, falling back to eve-files.com")
    use_sde = False

# Step 1: Load groups to get category mappings (only if using SDE)
groups = {}
if use_sde:
    print("\n[1/4] Loading invGroups.csv...")
    with open('invGroups.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            groups[int(row['groupID'])] = {
                'name': row['groupName'],
                'categoryID': int(row['categoryID'])
            }
    print(f"Loaded {len(groups)} groups")

# Category ID mappings from EVE
CATEGORY_MAPPINGS = {
    6: 'ships',           # Ship
    7: 'modules',         # Module
    8: 'ammunition_and_charges',  # Charge
    18: 'drones',         # Drone
    20: 'implants_and_boosters',  # Implant
    9: 'blueprints',      # Blueprint
    4: 'materials',       # Material
    5: 'materials',       # Accessories
    16: 'skills',         # Skill
    43: 'trade_goods',    # Commodity
    46: 'modules',        # Orbitals
    65: 'modules',        # Structure Module
    66: 'ships',          # Structure
    87: 'modules',        # Fighter
    2: 'blueprints',      # Celestial (some blueprints)
    91: 'skins',          # SKINs
    17: 'materials',      # Commodity
    22: 'deployables',     # Deployable
    23: 'structures',     # Starbase
    24: 'blueprints',     # Reaction
    25: 'materials',      # Asteroid
    30: 'apparel',        # Apparel
    32: 'subsystems',     # Subsystem
    34: 'materials',      # Ancient Relics
    35: 'materials',      # Decryptors
    39: 'structures',     # Infrastructure Upgrades
    40: 'structures',     # Sovereignty Structures
    41: 'planetary_industry',  # Planetary Industry
    42: 'planetary_resources',  # Planetary Resources
    63: 'special_edition', # Special Edition Assets
    2100: 'skills',       # Expert Systems
    2118: 'apparel',      # Personalization
    2143: 'planetary_resources',  # Colony Resources
    # Add more as needed
}

# Step 2: Load all types
if use_sde:
    print("\n[2/4] Loading invTypes.csv...")
    all_types = []
    category_counts = defaultdict(int)

    with open('invTypes.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            type_id = int(row['typeID'])
            group_id = int(row['groupID'])
            published = row.get('published', '0') == '1'
            market_group_id = row.get('marketGroupID', '')
            
            # Only include published items with market groups
            # Handle 'None' string and empty values
            if published and market_group_id and market_group_id.strip() and market_group_id.strip().lower() != 'none':
                group_info = groups.get(group_id, {})
                category_id = group_info.get('categoryID', 0)
                
                # Map to our categories
                category_key = CATEGORY_MAPPINGS.get(category_id, 'materials')
                
                try:
                    market_group_int = int(market_group_id.strip())
                except (ValueError, AttributeError):
                    continue
                
                type_info = {
                    'id': type_id,
                    'name': row['typeName'].strip(),
                    'groupID': group_id,
                    'categoryID': category_id,
                    'category': category_key,
                    'marketGroupID': market_group_int
                }
                
                all_types.append(type_info)
                category_counts[category_key] += 1

    print(f"Loaded {len(all_types)} published market items")
    print("\nBreakdown by category:")
    for cat, count in sorted(category_counts.items()):
        print(f"  {cat}: {count}")
else:
    # Fallback to eve-files.com
    print("\n[2/4] Loading type IDs from eve-files.com...")
    try:
        response = requests.get(EVE_FILES_URL, timeout=30)
        lines = response.text.split('\n')
        
        all_types = []
        category_counts = defaultdict(int)
        
        print("Fetching category information from ESI for each item...")
        print("This may take a while...")
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            # Parse format: "TypeID,Name"
            parts = line.split(',')
            if len(parts) < 2:
                continue
            
            try:
                type_id = int(parts[0])
                name = ','.join(parts[1:]).strip()
                
                # Get type details from ESI to check if it's published and get category
                type_response = requests.get(f'https://esi.evetech.net/latest/universe/types/{type_id}/', timeout=5)
                type_data = type_response.json()
                
                # Only include published items
                if not type_data.get('published', False):
                    continue
                
                # Check if it has a market group
                if not type_data.get('market_group_id'):
                    continue
                
                category_id = type_data.get('category_id')
                category_key = CATEGORY_MAPPINGS.get(category_id, 'materials')
                
                type_info = {
                    'id': type_id,
                    'name': name,
                    'category': category_key
                }
                
                all_types.append(type_info)
                category_counts[category_key] += 1
                
                if (i + 1) % 100 == 0:
                    print(f"  Processed {i + 1} items...")
                    
            except Exception as e:
                continue
        
        print(f"Loaded {len(all_types)} published market items from eve-files.com")
        print("\nBreakdown by category:")
        for cat, count in sorted(category_counts.items()):
            print(f"  {cat}: {count}")
            
    except Exception as e:
        print(f"Error loading from eve-files.com: {e}")
        print("Cannot generate database without data source")
        exit(1)

# Step 3: Organize by category
print("\n[3/4] Organizing items by category...")
categories = defaultdict(list)
for item in all_types:
    categories[item['category']].append(item)

# Sort items within each category by name
for category in categories:
    categories[category].sort(key=lambda x: x['name'])

# Step 4: Generate JavaScript
print("\n[4/4] Generating JavaScript...")

CATEGORY_META = {
    'ships': {'name': 'Ships', 'icon': 'fa-rocket'},
    'modules': {'name': 'Modules', 'icon': 'fa-microchip'},
    'ammunition_and_charges': {'name': 'Ammunition & Charges', 'icon': 'fa-bullseye'},
    'drones': {'name': 'Drones', 'icon': 'fa-dot-circle'},
    'implants_and_boosters': {'name': 'Implants & Boosters', 'icon': 'fa-user-plus'},
    'blueprints': {'name': 'Blueprints', 'icon': 'fa-file-blueprint'},
    'materials': {'name': 'Materials', 'icon': 'fa-cubes'},
    'trade_goods': {'name': 'Trade Goods', 'icon': 'fa-exchange-alt'},
    'skills': {'name': 'Skillbooks', 'icon': 'fa-graduation-cap'},
    'skins': {'name': 'Ship SKINs', 'icon': 'fa-paint-brush'},
    'deployables': {'name': 'Deployables', 'icon': 'fa-cube'},
    'structures': {'name': 'Structures', 'icon': 'fa-building'},
    'subsystems': {'name': 'Subsystems', 'icon': 'fa-cogs'},
    'apparel': {'name': 'Apparel', 'icon': 'fa-tshirt'},
    'special_edition': {'name': 'Special Edition', 'icon': 'fa-star'},
    'planetary_industry': {'name': 'Planetary Industry', 'icon': 'fa-globe'},
    'planetary_resources': {'name': 'Planetary Resources', 'icon': 'fa-leaf'}
}

js_output = []
js_output.append("// Auto-generated from Fuzzwork SDE CSV")
js_output.append("// Total items: " + str(len(all_types)))
js_output.append("// Generated: " + str(__import__('datetime').datetime.now()))
js_output.append("")
js_output.append("const AllMarketItems = {")

# Generate each category
category_order = ['ships', 'modules', 'ammunition_and_charges', 'drones', 'implants_and_boosters', 'blueprints', 'materials', 'trade_goods', 'skills', 'skins', 'apparel', 'deployables', 'subsystems', 'special_edition', 'planetary_industry', 'planetary_resources', 'structures']

for category_key in category_order:
    if category_key not in categories or not categories[category_key]:
        continue
    
    meta = CATEGORY_META.get(category_key, {'name': category_key.title(), 'icon': 'fa-cube'})
    items = categories[category_key]
    
    js_output.append(f"    // {meta['name']}")
    js_output.append(f"    {category_key}: {{")
    js_output.append(f"        name: \"{meta['name']}\",")
    js_output.append(f"        icon: \"{meta['icon']}\",")
    js_output.append(f"        items: [")
    
    for item in items:
        name_escaped = item['name'].replace('\\', '\\\\').replace('"', '\\"')
        js_output.append(f"            {{ id: {item['id']}, name: \"{name_escaped}\" }},")
    
    js_output.append(f"        ]")
    js_output.append(f"    }},")
    js_output.append("")

js_output.append("};")
js_output.append("")

# Add exports and helper objects
js_output.append("// Popular items (most commonly traded)")
js_output.append("const PopularItems = [")
js_output.append("    { id: 34, name: 'Tritanium', category: 'Materials' },")
js_output.append("    { id: 35, name: 'Pyerite', category: 'Materials' },")
js_output.append("    { id: 36, name: 'Mexallon', category: 'Materials' },")
js_output.append("    { id: 37, name: 'Isogen', category: 'Materials' },")
js_output.append("    { id: 38, name: 'Nocxium', category: 'Materials' },")
js_output.append("    { id: 39, name: 'Zydrine', category: 'Materials' },")
js_output.append("    { id: 40, name: 'Megacyte', category: 'Materials' },")
js_output.append("    { id: 44, name: 'Enriched Uranium', category: 'Materials' },")
js_output.append("    { id: 29668, name: 'PLEX', category: 'Trade Goods' },")
js_output.append("];")
js_output.append("")

js_output.append("// Market regions")
js_output.append("const Regions = {")
js_output.append("    10000002: 'The Forge',")
js_output.append("    10000043: 'Domain',")
js_output.append("    10000032: 'Sinq Laison',")
js_output.append("    10000030: 'Heimatar',")
js_output.append("    10000042: 'Metropolis',")
js_output.append("};")

# Write to file
output_file = 'items_database_complete.js'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_output))

print(f"\n✓ Generated {output_file}")
print(f"✓ Total items: {len(all_types)}")
print(f"✓ File size: {len('\n'.join(js_output)):,} bytes")

# Also save category breakdown
with open('database_stats.json', 'w', encoding='utf-8') as f:
    json.dump({
        'total_items': len(all_types),
        'categories': dict(category_counts),
        'generated': str(__import__('datetime').datetime.now())
    }, f, indent=2)

print(f"✓ Stats saved to database_stats.json")

print("\n" + "="*60)
print("COMPLETE!")
print("="*60)
print("\nTo use:")
print("1. Backup your current items_database.js")
print("2. Replace its content with items_database_complete.js")
print("3. Refresh your browser")
