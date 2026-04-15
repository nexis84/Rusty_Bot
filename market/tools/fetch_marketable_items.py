import requests
import json
import re
import concurrent.futures
import os

def get_existing_ids(file_path):
    ids = set()
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        matches = re.findall(r'id:\s*(\d+)', content)
        for m in matches:
            ids.add(int(m))
    return ids

def get_market_groups():
    url = "https://esi.evetech.net/latest/markets/groups/?datasource=tranquility"
    return requests.get(url).json()

def get_types_in_group(group_id):
    url = f"https://esi.evetech.net/latest/markets/groups/{group_id}/?datasource=tranquility"
    resp = requests.get(url).json()
    return resp.get('types', [])

def get_type_name(type_id):
    url = f"https://esi.evetech.net/latest/universe/types/{type_id}/?datasource=tranquility&language=en"
    resp = requests.get(url).json()
    return {'id': type_id, 'name': resp.get('name'), 'market_group_id': resp.get('market_group_id')}

def main():
    db_path = r'c:\Users\nexis\Desktop\Rusty_Bot-main\market\items_database.js'
    existing_ids = get_existing_ids(db_path)
    
    print("Fetching all market groups...")
    groups = get_market_groups()
    
    all_marketable_ids = set()
    print(f"Fetching types for {len(groups)} market groups...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        future_to_group = {executor.submit(get_types_in_group, gid): gid for gid in groups}
        for future in concurrent.futures.as_completed(future_to_group):
            types = future.result()
            all_marketable_ids.update(types)
            
    print(f"Found {len(all_marketable_ids)} total marketable IDs.")
    
    new_ids = all_marketable_ids - existing_ids
    print(f"Found {len(new_ids)} new marketable IDs.")
    
    if not new_ids:
        print("No new items found.")
        return

    print("Fetching details for new items...")
    new_items_details = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        future_to_type = {executor.submit(get_type_name, tid): tid for tid in new_ids}
        for future in concurrent.futures.as_completed(future_to_type):
            details = future.result()
            new_items_details.append(details)
            print(f"Found: {details['name']}")

    with open('detected_new_items.json', 'w') as f:
        json.dump(new_items_details, f, indent=4)
        
    print(f"Saved {len(new_items_details)} new items to detected_new_items.json")

if __name__ == "__main__":
    main()
