#!/usr/bin/env python3
"""Parse EVE Online SDE and extract market items for items_database.js"""

import yaml
import json

# Read the types file
print("Loading types.yaml...")
with open('sde/fsd/types.yaml', 'r', encoding='utf-8') as f:
    types = yaml.safe_load(f)

# Read the groups file
print("Loading groups.yaml...")
with open('sde/fsd/groups.yaml', 'r', encoding='utf-8') as f:
    groups = yaml.safe_load(f)

# Read the categories file
print("Loading categories.yaml...")
with open('sde/fsd/categories.yaml', 'r', encoding='utf-8') as f:
    categories = yaml.safe_load(f)

# Read the market groups file
print("Loading marketGroups.yaml...")
with open('sde/fsd/marketGroups.yaml', 'r', encoding='utf-8') as f:
    market_groups = yaml.safe_load(f)

# Extract all skills (category ID 16)
print("\nExtracting skills...")
skills = []
for type_id, type_data in types.items():
    if not isinstance(type_data, dict):
        continue
    
    # Get group ID
    group_id = type_data.get('groupID')
    if not group_id or group_id not in groups:
        continue
    
    # Check if this group belongs to Skills category (16)
    group_data = groups[group_id]
    if group_data.get('categoryID') == 16:
        # This is a skill
        name = type_data.get('name', {})
        if isinstance(name, dict):
            name_en = name.get('en', f'Skill {type_id}')
        else:
            name_en = str(name)
        
        published = type_data.get('published', False)
        market_group_id = type_data.get('marketGroupID')
        
        skills.append({
            'id': int(type_id),
            'name': name_en,
            'groupID': group_id,
            'groupName': group_data.get('name', {}).get('en', ''),
            'published': published,
            'hasMarketGroup': market_group_id is not None
        })

# Sort by ID
skills.sort(key=lambda x: x['id'])

# Filter to published skills with market groups (actual sellable skillbooks)
market_skills = [s for s in skills if s['published'] and s['hasMarketGroup']]

print(f"\nFound {len(skills)} total skills")
print(f"Found {len(market_skills)} published skills with market groups")

# Save to JSON for review
with open('skills_extracted.json', 'w', encoding='utf-8') as f:
    json.dump(market_skills, f, indent=2, ensure_ascii=False)

# Generate JavaScript format
print("\nGenerating JavaScript format...")
js_lines = []
for skill in market_skills:
    js_lines.append(f"            {{ id: {skill['id']}, name: \"{skill['name']}\" }},")

# Save to file
with open('skills_for_js.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_lines))

print(f"\nWrote {len(js_lines)} skills to skills_for_js.txt")
print("\nFirst 10 skills:")
for skill in market_skills[:10]:
    print(f"  {skill['id']}: {skill['name']}")
