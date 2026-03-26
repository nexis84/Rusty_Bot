import json
from collections import defaultdict

# Load ships data
with open('data/ships.json', 'r', encoding='utf-8') as f:
    ships = json.load(f)

# Collect all bonuses
all_bonuses = []
role_bonuses = []
hull_bonuses = []

for ship in ships:
    for bonus in ship.get('bonuses', []):
        all_bonuses.append(bonus)
        # Check if it's a role bonus
        if bonus.strip().lower().startswith('role bonus:'):
            role_bonuses.append(bonus)
        else:
            hull_bonuses.append(bonus)

# Get unique bonuses
print("=" * 80)
print("HULL BONUSES (by skill level)")
print("=" * 80)
unique_hull = sorted(set(hull_bonuses))
for i, bonus in enumerate(unique_hull, 1):
    print(f"{i}. {bonus}")

print("\n" + "=" * 80)
print("ROLE BONUSES")
print("=" * 80)
unique_role = sorted(set(role_bonuses))
for i, bonus in enumerate(unique_role, 1):
    print(f"{i}. {bonus}")

print("\n" + "=" * 80)
print("STATISTICS")
print("=" * 80)
print(f"Total ships: {len(ships)}")
print(f"Total bonuses (all): {len(all_bonuses)}")
print(f"Unique hull bonuses: {len(unique_hull)}")
print(f"Unique role bonuses: {len(unique_role)}")
print(f"Total unique bonuses: {len(unique_hull) + len(unique_role)}")
