#!/usr/bin/env python3
"""Parse EVE Online SDE CSV and extract market skillbooks"""

import csv
import json

print("Loading invTypes.csv...")
types_dict = {}
with open('invTypes.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        types_dict[int(row['typeID'])] = row

print(f"Loaded {len(types_dict)} types")

# Extract only published skillbooks that are on the market
# CategoryID 16 = Skills
skills = []
for type_id, type_data in types_dict.items():
    # Check if it's a skill (some indication in the type name or we need groups)
    # For now, let's filter by skillbooks that have marketGroupID and are published
    if (int(type_data.get('published', 0)) == 1 and 
        type_data.get('marketGroupID') and 
        type_data['marketGroupID'].strip()):
        
        name = type_data['typeName']
        
        # Skills typically contain "Skill" or specific patterns
        # But really we need to check categoryID via groups
        # For now, let's just extract all published market items
        # and we can filter later
        pass

# Actually, let me load the groups to properly identify skills
print("Loading invGroups.csv...")
groups_dict = {}
with open('invGroups.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        groups_dict[int(row['groupID'])] = row

print(f"Loaded {len(groups_dict)} groups")

# Now extract skills properly (categoryID 16)
skills = []
for type_id, type_data in types_dict.items():
    group_id = int(type_data.get('groupID', 0))
    if group_id not in groups_dict:
        continue
        
    group_data = groups_dict[group_id]
    category_id = int(group_data.get('categoryID', 0))
    
    # Category 16 = Skills
    if category_id == 16:
        published = int(type_data.get('published', 0)) == 1
        has_market_group = type_data.get('marketGroupID') and type_data['marketGroupID'].strip()
        
        skills.append({
            'id': type_id,
            'name': type_data['typeName'],
            'groupID': group_id,
            'groupName': group_data['groupName'],
            'published': published,
            'hasMarketGroup': bool(has_market_group)
        })

# Sort by ID
skills.sort(key=lambda x: x['id'])

# Filter to published skills with market groups (actual sellable skillbooks)
market_skills = [s for s in skills if s['published'] and s['hasMarketGroup']]

print(f"\nFound {len(skills)} total skills")
print(f"Found {len(market_skills)} published skills with market groups (sellable skillbooks)")

# Generate JavaScript format
print("\nGenerating JavaScript format...")
js_lines = []
for skill in market_skills:
    # Escape quotes in names
    name = skill['name'].replace('"', '\\"')
    js_lines.append(f"            {{ id: {skill['id']}, name: \"{name}\" }},")

# Save to file
with open('skills_for_js.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_lines))

print(f"\nWrote {len(js_lines)} skills to skills_for_js.txt")
print("\nFirst 20 skills:")
for skill in market_skills[:20]:
    print(f"  {skill['id']}: {skill['name']}")

print("\nLast 20 skills:")
for skill in market_skills[-20:]:
    print(f"  {skill['id']}: {skill['name']}")

# Save full list as JSON for review
with open('skills_extracted.json', 'w', encoding='utf-8') as f:
    json.dump(market_skills, f, indent=2, ensure_ascii=False)

print(f"\nFull list saved to skills_extracted.json")
