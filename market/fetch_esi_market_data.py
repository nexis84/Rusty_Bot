import requests
import json
import time

BASE_URL = "https://esi.evetech.net/latest"
HEADERS = {
    'User-Agent': 'EVE Market Browser - ESI Data Fetcher'
}

def fetch_with_retry(url, max_retries=3, delay=1):
    """Fetch URL with retry logic for rate limits"""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=10)
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 420:  # Rate limited
                print(f"Rate limited, waiting {delay * (attempt + 1)} seconds...")
                time.sleep(delay * (attempt + 1))
            else:
                print(f"Error {response.status_code} for {url}")
                return None
        except Exception as e:
            print(f"Exception fetching {url}: {e}")
            if attempt < max_retries - 1:
                time.sleep(delay)
    return None

def get_all_market_groups():
    """Fetch all market group IDs"""
    print("Fetching market group IDs...")
    url = f"{BASE_URL}/markets/groups/"
    group_ids = fetch_with_retry(url)
    print(f"Found {len(group_ids) if group_ids else 0} market groups")
    return group_ids or []

def get_market_group_details(group_id):
    """Fetch details for a specific market group"""
    url = f"{BASE_URL}/markets/groups/{group_id}/"
    return fetch_with_retry(url)

def get_type_details(type_id):
    """Fetch details for a specific type"""
    url = f"{BASE_URL}/universe/types/{type_id}/"
    return fetch_with_retry(url)

def build_market_hierarchy():
    """Build complete market hierarchy from ESI"""
    print("\n=== Building Market Hierarchy from ESI ===\n")
    
    # Get all market groups
    group_ids = get_all_market_groups()
    
    # Fetch details for each group
    groups = {}
    root_groups = []
    
    print("Fetching market group details...")
    for i, group_id in enumerate(group_ids):
        if i % 50 == 0:
            print(f"Progress: {i}/{len(group_ids)} groups...")
        
        details = get_market_group_details(group_id)
        if details:
            groups[group_id] = details
            if 'parent_group_id' not in details:
                root_groups.append(group_id)
        time.sleep(0.05)  # Small delay to avoid rate limits
    
    print(f"\nFound {len(root_groups)} root market groups")
    
    # Now fetch all types in each group
    all_types = {}
    print("\nFetching type details for all market items...")
    
    type_count = 0
    for group_id, group_data in groups.items():
        if 'types' in group_data:
            for type_id in group_data['types']:
                if type_id not in all_types:
                    type_details = get_type_details(type_id)
                    if type_details and type_details.get('published'):
                        all_types[type_id] = {
                            'id': type_id,
                            'name': type_details.get('name'),
                            'group_id': type_details.get('group_id'),
                            'market_group_id': type_details.get('market_group_id'),
                            'description': type_details.get('description', '')
                        }
                        type_count += 1
                        if type_count % 100 == 0:
                            print(f"Fetched {type_count} types...")
                    time.sleep(0.05)  # Rate limit protection
    
    print(f"\nTotal types fetched: {len(all_types)}")
    
    return groups, all_types, root_groups

def organize_by_category(groups, all_types, root_groups):
    """Organize types into categories matching the current structure"""
    
    # Map root market groups to categories
    category_mapping = {
        'Ships': [],
        'Modules': [],
        'Ammunition & Charges': [],
        'Drones': [],
        'Implants & Boosters': [],
        'Blueprints': [],
        'Materials': [],
        'Trade Goods': [],
        'Skillbooks': []
    }
    
    # Known root group IDs (these may need adjustment)
    # We'll scan the root groups and map them
    for root_id in root_groups:
        group = groups[root_id]
        name = group.get('name', '')
        
        print(f"Root group {root_id}: {name}")
        
        # Map to categories based on name
        if 'Ship' in name:
            category_mapping['Ships'].append(root_id)
        elif 'Module' in name or 'Equipment' in name:
            category_mapping['Modules'].append(root_id)
        elif 'Charge' in name or 'Ammunition' in name:
            category_mapping['Ammunition & Charges'].append(root_id)
        elif 'Drone' in name:
            category_mapping['Drones'].append(root_id)
        elif 'Implant' in name or 'Booster' in name:
            category_mapping['Implants & Boosters'].append(root_id)
        elif 'Blueprint' in name:
            category_mapping['Blueprints'].append(root_id)
        elif 'Skill' in name:
            category_mapping['Skillbooks'].append(root_id)
        elif 'Manufacture' in name or 'Resource' in name or 'Material' in name or 'Commodity' in name:
            category_mapping['Materials'].append(root_id)
        else:
            category_mapping['Trade Goods'].append(root_id)
    
    # Organize types by category
    categories = {}
    for category_name, root_ids in category_mapping.items():
        category_types = []
        
        # Get all types under these root groups
        def collect_types(group_id):
            if group_id not in groups:
                return []
            
            group = groups[group_id]
            types_in_group = []
            
            # Add types directly in this group
            if 'types' in group:
                for type_id in group['types']:
                    if type_id in all_types:
                        types_in_group.append(all_types[type_id])
            
            # Recursively add from child groups
            if 'child_groups' in group:
                for child_id in group['child_groups']:
                    types_in_group.extend(collect_types(child_id))
            
            return types_in_group
        
        for root_id in root_ids:
            category_types.extend(collect_types(root_id))
        
        categories[category_name] = category_types
        print(f"Category '{category_name}': {len(category_types)} types")
    
    return categories

def generate_javascript(categories):
    """Generate JavaScript code for items_database.js"""
    
    js_code = "// Auto-generated from ESI API\n"
    js_code += "// Generated on: " + time.strftime("%Y-%m-%d %H:%M:%S") + "\n\n"
    js_code += "const AllMarketItems = {\n"
    
    for category_name, types in categories.items():
        if not types:
            continue
            
        # Generate category object
        safe_key = category_name.lower().replace(' ', '_').replace('&', 'and')
        
        # Determine icon
        icon_map = {
            'Ships': 'fa-rocket',
            'Modules': 'fa-microchip',
            'Ammunition & Charges': 'fa-bullseye',
            'Drones': 'fa-dot-circle',
            'Implants & Boosters': 'fa-user-plus',
            'Blueprints': 'fa-file-blueprint',
            'Materials': 'fa-cubes',
            'Trade Goods': 'fa-exchange-alt',
            'Skillbooks': 'fa-graduation-cap'
        }
        
        icon = icon_map.get(category_name, 'fa-cube')
        
        js_code += f"    // {category_name}\n"
        js_code += f"    {safe_key}: {{\n"
        js_code += f"        name: \"{category_name}\",\n"
        js_code += f"        icon: \"{icon}\",\n"
        js_code += f"        items: [\n"
        
        # Sort types by name
        sorted_types = sorted(types, key=lambda x: x['name'])
        
        for type_obj in sorted_types:
            js_code += f"            {{ id: {type_obj['id']}, name: \"{type_obj['name'].replace('\"', '\\\"')}\" }},\n"
        
        js_code += f"        ]\n"
        js_code += f"    }},\n\n"
    
    js_code += "};\n\n"
    js_code += "// Export for use in app\n"
    js_code += "if (typeof module !== 'undefined' && module.exports) {\n"
    js_code += "    module.exports = AllMarketItems;\n"
    js_code += "}\n"
    
    return js_code

if __name__ == "__main__":
    print("EVE ESI Market Data Fetcher\n")
    print("This will fetch ALL market items from the ESI API.")
    print("This may take 10-30 minutes due to rate limits.\n")
    
    # Build hierarchy
    groups, all_types, root_groups = build_market_hierarchy()
    
    # Save raw data
    print("\nSaving raw data...")
    with open('esi_market_groups.json', 'w', encoding='utf-8') as f:
        json.dump(groups, f, indent=2)
    
    with open('esi_all_types.json', 'w', encoding='utf-8') as f:
        json.dump(all_types, f, indent=2)
    
    # Organize into categories
    print("\nOrganizing into categories...")
    categories = organize_by_category(groups, all_types, root_groups)
    
    # Generate JavaScript
    print("\nGenerating JavaScript...")
    js_code = generate_javascript(categories)
    
    with open('items_database_esi.js', 'w', encoding='utf-8') as f:
        f.write(js_code)
    
    print("\n=== Complete ===")
    print(f"Generated items_database_esi.js with {len(all_types)} total types")
    print("\nTo use: Replace items_database.js content with items_database_esi.js")
