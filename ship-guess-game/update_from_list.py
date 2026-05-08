import json

# Read the list of ships to keep - try multiple encodings
ships_to_keep = set()
for encoding in ['utf-16', 'utf-8-sig', 'utf-8', 'latin-1']:
    try:
        with open('ships_to_edit.txt', 'r', encoding=encoding) as f:
            ships_to_keep = {line.strip() for line in f if line.strip()}
        break
    except (UnicodeDecodeError, UnicodeError):
        continue

# Load current ships data
with open('data/ships.json', 'r', encoding='utf-8') as f:
    all_ships = json.load(f)

# Filter ships
original_count = len(all_ships)
filtered_ships = [ship for ship in all_ships if ship['name'] in ships_to_keep]
new_count = len(filtered_ships)
removed_count = original_count - new_count

# Find which ships were removed for reporting
removed_ships = [ship['name'] for ship in all_ships if ship['name'] not in ships_to_keep]

# Save filtered ships
with open('data/ships.json', 'w', encoding='utf-8') as f:
    json.dump(filtered_ships, f, indent=2, ensure_ascii=False)

print(f"✓ Updated ships.json")
print(f"  Original: {original_count} ships")
print(f"  New: {new_count} ships")
print(f"  Removed: {removed_count} ships")

if removed_ships:
    print(f"\nRemoved ships:")
    for ship in sorted(removed_ships):
        print(f"  - {ship}")

# Statistics by race
race_counts = {}
for ship in filtered_ships:
    race = ship.get('race', 'Unknown')
    race_counts[race] = race_counts.get(race, 0) + 1

print(f"\nShips by race:")
for race in sorted(race_counts.keys()):
    print(f"  {race}: {race_counts[race]}")
