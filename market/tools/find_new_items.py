import re
import requests
import json
import os

def get_existing_ids(file_path):
    ids = set()
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        matches = re.findall(r'id:\s*(\d+)', content)
        for m in matches:
            ids.add(int(m))
    return ids

def get_all_esi_types():
    all_ids = []
    page = 1
    while True:
        url = f"https://esi.evetech.net/latest/universe/types/?datasource=tranquility&page={page}"
        response = requests.get(url)
        if response.status_code != 200:
            break
        ids = response.json()
        if not ids:
            break
        all_ids.extend(ids)
        page += 1
    return set(all_ids)

def get_type_details(type_id):
    url = f"https://esi.evetech.net/latest/universe/types/{type_id}/?datasource=tranquility&language=en"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    return None

def main():
    db_path = r'c:\Users\nexis\Desktop\Rusty_Bot-main\market\items_database.js'
    existing_ids = get_existing_ids(db_path)
    print(f"Found {len(existing_ids)} existing IDs in database.")

    esi_ids = get_all_esi_types()
    print(f"Found {len(esi_ids)} IDs in ESI.")

    new_ids = esi_ids - existing_ids
    print(f"Found {len(new_ids)} potential new IDs.")

    # Filter for marketable and published items
    marketable_items = []
    # We only check a subset if there are too many, or we can look for high IDs first
    # New items usually have higher IDs
    sorted_new_ids = sorted(list(new_ids), reverse=True)
    
    # Let's check the first 500 new IDs (most likely to be the actual new ones)
    count = 0
    for tid in sorted_new_ids:
        if count >= 300: # Limit to 300 for speed
            break
        details = get_type_details(tid)
        if details and details.get('published') and details.get('market_group_id'):
            marketable_items.append({
                'id': tid,
                'name': details.get('name'),
                'market_group_id': details.get('market_group_id')
            })
            print(f"New Marketable Item: {tid} - {details.get('name')}")
        count += 1

    with open('new_items.json', 'w') as f:
        json.dump(marketable_items, f, indent=4)

if __name__ == "__main__":
    main()
