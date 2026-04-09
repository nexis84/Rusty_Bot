import requests
import json
import time
import re

BASE_URL = "https://esi.evetech.net/latest"
HEADERS = {
    'User-Agent': 'EVE Market Browser - Missing Items Fetcher'
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

def extract_existing_type_ids(database_file='items_database.js'):
    """Extract all type IDs from the current items_database.js"""
    print("Reading existing items_database.js...")
    
    with open(database_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all { id: XXXXX, name: "..." } patterns
    pattern = r'\{\s*id:\s*(\d+),\s*name:'
    matches = re.findall(pattern, content)
    
    existing_ids = set(int(m) for m in matches)
    print(f"Found {len(existing_ids)} existing types in database")
    
    return existing_ids

def get_all_market_type_ids():
    """Fetch all type IDs from all market groups"""
    print("\nFetching market group IDs from ESI...")
    url = f"{BASE_URL}/markets/groups/"
    group_ids = fetch_with_retry(url)
    
    if not group_ids:
        print("Failed to fetch market groups")
        return set()
    
    print(f"Found {len(group_ids)} market groups")
    
    # Fetch all types from all groups
    all_type_ids = set()
    
    print("Fetching types from each market group...")
    for i, group_id in enumerate(group_ids):
        if i % 50 == 0:
            print(f"Progress: {i}/{len(group_ids)} groups...")
        
        url = f"{BASE_URL}/markets/groups/{group_id}/"
        details = fetch_with_retry(url)
        
        if details and 'types' in details:
            all_type_ids.update(details['types'])
        
        time.sleep(0.02)  # Small delay to avoid rate limits
    
    print(f"Found {len(all_type_ids)} total types across all market groups")
    return all_type_ids

def get_type_details(type_id):
    """Fetch details for a specific type"""
    url = f"{BASE_URL}/universe/types/{type_id}/"
    return fetch_with_retry(url)

def categorize_type(type_details):
    """Determine which category a type belongs to based on its group"""
    group_id = type_details.get('group_id')
    name = type_details.get('name', '').lower()
    
    # Skill detection
    if group_id in [255, 256, 257, 258, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 278, 1210, 1216, 1217, 1218, 1220, 1240, 1241, 1243, 1244, 1245, 1246, 1747, 2128]:
        return 'skills'
    
    # Ship detection - group IDs typically 25-100, 237, 324, 358, 380, 381, 419, 420, 463, 485, 513, 540, 541, etc.
    if group_id in range(25, 101) or group_id in [237, 324, 358, 380, 381, 419, 420, 463, 485, 513, 540, 541, 543, 547, 659, 883, 893, 894, 906, 941, 963, 1022, 1201, 1202, 1283, 1305, 1527, 1534, 1538, 1972, 2016, 2017, 4594]:
        return 'ships'
    
    # Blueprint detection
    if 'blueprint' in name or group_id in [105, 106, 108, 109, 443, 575, 716, 899, 1040, 1531]:
        return 'blueprints'
    
    # Ammunition & Charges
    if group_id in [83, 84, 85, 86, 87, 88, 89, 90, 176, 377, 384, 385, 386, 387, 1034, 1035, 1091, 1092, 1213, 1312]:
        return 'ammunition_and_charges'
    
    # Drones
    if group_id in [100, 101, 106, 107, 108, 109, 157, 159, 283, 288, 289, 290, 291, 292, 293, 294, 549, 639, 1023, 1159, 1174, 1275, 1537, 1606, 2205, 2206]:
        return 'drones'
    
    # Implants & Boosters
    if group_id in [300, 301, 302, 303, 304, 305, 306, 311, 312, 313, 361, 738, 1533, 1540, 1541, 1542, 1543, 1544]:
        return 'implants_and_boosters'
    
    # Modules (very broad category)
    if 'module' in name or group_id in range(400, 900):
        return 'modules'
    
    # Trade Goods
    if 'apparel' in name or 'skin' in name or group_id in [1950, 1955, 1956, 1957]:
        return 'trade_goods'
    
    # Materials (default for commodities, minerals, etc.)
    return 'materials'

def fetch_missing_types(existing_ids, market_type_ids):
    """Fetch details for types that exist in market but not in our database"""
    missing_ids = market_type_ids - existing_ids
    
    print(f"\nFound {len(missing_ids)} missing types to fetch")
    
    if not missing_ids:
        print("No missing types - database is up to date!")
        return {}
    
    print("Fetching details for missing types...")
    
    missing_types = {}
    categories = {}
    
    for i, type_id in enumerate(sorted(missing_ids)):
        if i % 20 == 0:
            print(f"Progress: {i}/{len(missing_ids)} types...")
        
        details = get_type_details(type_id)
        
        if details and details.get('published'):
            category = categorize_type(details)
            
            if category not in categories:
                categories[category] = []
            
            type_info = {
                'id': type_id,
                'name': details.get('name'),
                'group_id': details.get('group_id'),
                'market_group_id': details.get('market_group_id')
            }
            
            categories[category].append(type_info)
            missing_types[type_id] = type_info
        
        time.sleep(0.05)  # Rate limit protection
    
    return categories

def generate_javascript_supplement(categories):
    """Generate JavaScript code to add to items_database.js"""
    
    js_code = "// ===== NEW ITEMS FROM ESI =====\n"
    js_code += "// Generated on: " + time.strftime("%Y-%m-%d %H:%M:%S") + "\n"
    js_code += "// Add these items to their respective categories in items_database.js\n\n"
    
    category_names = {
        'skills': 'Skillbooks',
        'ships': 'Ships',
        'blueprints': 'Blueprints',
        'ammunition_and_charges': 'Ammunition & Charges',
        'drones': 'Drones',
        'implants_and_boosters': 'Implants & Boosters',
        'modules': 'Modules',
        'materials': 'Materials',
        'trade_goods': 'Trade Goods'
    }
    
    for category_key, types in sorted(categories.items()):
        if not types:
            continue
        
        category_name = category_names.get(category_key, category_key)
        js_code += f"// ===== {category_name} ({len(types)} new items) =====\n"
        
        # Sort by ID
        sorted_types = sorted(types, key=lambda x: x['id'])
        
        for type_obj in sorted_types:
            name_escaped = type_obj['name'].replace('"', '\\"')
            js_code += f'            {{ id: {type_obj["id"]}, name: "{name_escaped}" }},\n'
        
        js_code += "\n"
    
    return js_code

def generate_summary_report(categories, existing_count, total_market_count):
    """Generate a summary report"""
    report = "\n" + "="*60 + "\n"
    report += "MISSING ITEMS REPORT\n"
    report += "="*60 + "\n\n"
    
    report += f"Existing items in database: {existing_count}\n"
    report += f"Total items in ESI market: {total_market_count}\n"
    
    total_missing = sum(len(types) for types in categories.values())
    report += f"Missing items found: {total_missing}\n\n"
    
    report += "Breakdown by category:\n"
    
    category_names = {
        'skills': 'Skillbooks',
        'ships': 'Ships',
        'blueprints': 'Blueprints',
        'ammunition_and_charges': 'Ammunition & Charges',
        'drones': 'Drones',
        'implants_and_boosters': 'Implants & Boosters',
        'modules': 'Modules',
        'materials': 'Materials',
        'trade_goods': 'Trade Goods'
    }
    
    for category_key, types in sorted(categories.items()):
        category_name = category_names.get(category_key, category_key)
        report += f"  - {category_name}: {len(types)} items\n"
    
    report += "\n" + "="*60 + "\n"
    
    return report

if __name__ == "__main__":
    print("="*60)
    print("EVE ESI Hybrid Market Data Fetcher")
    print("="*60)
    print("\nThis will:")
    print("1. Read existing items_database.js")
    print("2. Check ESI for all market items")
    print("3. Fetch only NEW items not in database")
    print("4. Generate supplement code to add")
    print("\nThis should take 5-10 minutes.\n")
    
    try:
        # Step 1: Get existing IDs
        existing_ids = extract_existing_type_ids()
        
        # Step 2: Get all market type IDs from ESI
        market_type_ids = get_all_market_type_ids()
        
        # Step 3: Fetch missing types
        categories = fetch_missing_types(existing_ids, market_type_ids)
        
        # Step 4: Generate output
        if categories:
            js_code = generate_javascript_supplement(categories)
            
            with open('missing_items.js', 'w', encoding='utf-8') as f:
                f.write(js_code)
            
            with open('missing_items.json', 'w', encoding='utf-8') as f:
                json.dump(categories, f, indent=2)
            
            report = generate_summary_report(categories, len(existing_ids), len(market_type_ids))
            print(report)
            
            with open('missing_items_report.txt', 'w', encoding='utf-8') as f:
                f.write(report)
            
            print("\nFiles created:")
            print("  - missing_items.js (JavaScript code to add)")
            print("  - missing_items.json (JSON data)")
            print("  - missing_items_report.txt (summary report)")
        else:
            print("\n✓ No missing items - database is complete!")
    
    except FileNotFoundError:
        print("\nError: items_database.js not found in current directory")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
