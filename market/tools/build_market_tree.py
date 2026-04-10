import yaml
import json
import os

# Load market groups
with open('tools/sde/fsd/marketGroups.yaml', 'r', encoding='utf-8') as f:
    market_groups = yaml.safe_load(f)

# Load types  
print('Loading types.yaml (this may take a moment)...')
with open('tools/sde/fsd/types.yaml', 'r', encoding='utf-8') as f:
    types = yaml.safe_load(f)

# Build hierarchy
def get_children(parent_id):
    children = []
    for mg_id, mg_data in market_groups.items():
        if mg_data.get('parentGroupID') == parent_id:
            children.append({
                'id': int(mg_id),
                'name': mg_data.get('nameID', {}).get('en', 'Unknown'),
                'children': get_children(mg_id)
            })
    return children

# Build full tree
def build_tree():
    tree = {}
    for mg_id, mg_data in market_groups.items():
        if not mg_data.get('parentGroupID'):  # Root level
            name = mg_data.get('nameID', {}).get('en', 'Unknown')
            tree[name] = {
                'id': int(mg_id),
                'name': name,
                'children': get_children(mg_id)
            }
    return tree

tree = build_tree()

# Map items to market groups (filter out blueprints)
print('Mapping items to market groups...')
items_by_market_group = {}
for type_id, type_data in types.items():
    market_group_id = type_data.get('marketGroupID')
    if market_group_id:
        # Skip blueprints and reactions
        name = type_data.get('name', {}).get('en', 'Unknown')
        if 'Blueprint' in name or 'Reaction' in name:
            continue
        if market_group_id not in items_by_market_group:
            items_by_market_group[market_group_id] = []
        items_by_market_group[market_group_id].append({'id': int(type_id), 'name': name})

# Add items to tree
def add_items_to_group(group):
    mg_id = group['id']
    if mg_id in items_by_market_group:
        group['items'] = items_by_market_group[mg_id]
    for child in group.get('children', []):
        add_items_to_group(child)

for key, group in tree.items():
    add_items_to_group(group)

# Save to file
output_path = 'market/market_tree.json'
os.makedirs('market', exist_ok=True)
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(tree, f, indent=2, ensure_ascii=False)

print(f'Market tree saved to {output_path}')
print(f'Top-level categories: {list(tree.keys())}')

# Show Ships category structure
if 'Ships' in tree:
    print('\nShips structure:')
    for child in tree['Ships']['children']:
        item_count = len(child.get('items', []))
        child_items = f'({item_count} direct items)' if item_count > 0 else ''
        print(f'  {child["name"]} (ID: {child["id"]}) {child_items}')
        for sub in child.get('children', []):
            sub_count = len(sub.get('items', []))
            sub_items = f' - {sub_count} items' if sub_count > 0 else ''
            print(f'    - {sub["name"]}{sub_items}')
