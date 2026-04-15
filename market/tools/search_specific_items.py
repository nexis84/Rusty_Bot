import requests
import json
import urllib.parse

def search_items(query):
    encoded_query = urllib.parse.quote(query)
    url = f"https://esi.evetech.net/latest/search/?categories=inventory_type&datasource=tranquility&search={encoded_query}&strict=false"
    try:
        r = requests.get(url)
        if r.status_code == 200:
            return r.json().get('inventory_type', [])
    except Exception as e:
        print(f"Error searching for {query}: {e}")
    return []

def get_details(type_id):
    url = f"https://esi.evetech.net/latest/universe/types/{type_id}/?datasource=tranquility&language=en"
    try:
        r = requests.get(url)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"Error getting details for {type_id}: {e}")
    return None

def main():
    queries = [
        'Gallente Election',
        'Campaign Bus',
        'Presidential',
        'Officer-grade',
        'Candidate Favor'
    ]
    
    all_found_ids = set()
    for q in queries:
        print(f"Searching for {q}...")
        ids = search_items(q)
        all_found_ids.update(ids)
        
    print(f"Found {len(all_found_ids)} potential IDs. Fetching details...")
    
    results = []
    for tid in all_found_ids:
        details = get_details(tid)
        if details and details.get('published') and details.get('market_group_id'):
            results.append({
                'id': tid,
                'name': details['name'],
                'market_group_id': details['market_group_id']
            })
            print(f"Found Marketable Item: {details['name']} (ID: {tid})")
            
    with open('detected_new_items.json', 'w') as f:
        json.dump(results, f, indent=4)
        
    print(f"\nFinal count: {len(results)} items saved to detected_new_items.json")

if __name__ == "__main__":
    main()
