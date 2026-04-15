import requests
import json
import re
import concurrent.futures
import os
import sys

# Fix Unicode output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def get_existing_ids(file_path):
    ids = set()
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            matches = re.findall(r'id:\s*(\d+)', content)
            for m in matches:
                ids.add(int(m))
    except Exception as e:
        print(f"Error reading DB: {e}")
    return ids

def get_market_groups():
    url = "https://esi.evetech.net/latest/markets/groups/?datasource=tranquility"
    return requests.get(url).json()

def get_types_in_group(group_id):
    url = f"https://esi.evetech.net/latest/markets/groups/{group_id}/?datasource=tranquility"
    try:
        resp = requests.get(url).json()
        return resp.get('types', [])
    except:
        return []

def get_full_details(type_id):
    try:
        type_url = f"https://esi.evetech.net/latest/universe/types/{type_id}/?datasource=tranquility&language=en"
        type_resp = requests.get(type_url).json()
        
        group_id = type_resp.get('group_id')
        group_url = f"https://esi.evetech.net/latest/universe/groups/{group_id}/?datasource=tranquility"
        group_resp = requests.get(group_url).json()
        
        category_id = group_resp.get('category_id')
        
        return {
            'id': type_id,
            'name': type_resp.get('name'),
            'market_group_id': type_resp.get('market_group_id'),
            'category_id': category_id,
            'group_id': group_id
        }
    except Exception as e:
        return None

def main():
    db_path = r'c:\Users\nexis\Desktop\Rusty_Bot-main\market\items_database.js'
    existing_ids = get_existing_ids(db_path)
    print(f"Loaded {len(existing_ids)} existing IDs.")

    print("Fetching market groups...")
    groups = get_market_groups()
    print(f"Scanning {len(groups)} market groups for types...")
    
    all_marketable_ids = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        future_to_group = {executor.submit(get_types_in_group, gid): gid for gid in groups}
        for i, future in enumerate(concurrent.futures.as_completed(future_to_group)):
            types = future.result()
            all_marketable_ids.update(types)
            if i % 500 == 0:
                print(f"Processed {i}/{len(groups)} groups...")
            
    print(f"Found {len(all_marketable_ids)} marketable IDs in ESI.")
    new_ids = all_marketable_ids - existing_ids
    print(f"Found {len(new_ids)} new marketable IDs.")
    
    if not new_ids:
        print("No new items to add.")
        return

    print("Fetching full details for new items...")
    results = []
    total = len(new_ids)
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        future_to_type = {executor.submit(get_full_details, tid): tid for tid in new_ids}
        for i, future in enumerate(concurrent.futures.as_completed(future_to_type)):
            details = future.result()
            if details:
                results.append(details)
                safe_name = details['name'].encode('ascii', errors='replace').decode('ascii')
                print(f"[{i+1}/{total}] {safe_name} (Cat: {details['category_id']})")
            # Incremental save every 50 items
            if (i + 1) % 50 == 0:
                with open('detected_new_items.json', 'w', encoding='utf-8') as f:
                    json.dump(results, f, indent=4, ensure_ascii=False)

    with open('detected_new_items.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=4, ensure_ascii=False)
    
    print(f"\nDone! Saved {len(results)} new items to detected_new_items.json")

if __name__ == "__main__":
    main()
