import json
from collections import defaultdict

with open('data/ships.json', encoding='utf-8') as f:
    ships = json.load(f)

print(f"\n=== ALL {len(ships)} SHIPS IN DATABASE ===\n")

# Group by race
by_race = defaultdict(list)
for ship in ships:
    by_race[ship['race']].append(ship)

# Print by race
for race in sorted(by_race.keys()):
    print(f"\n{race.upper()} ({len(by_race[race])} ships):")
    print("-" * 50)
    for ship in sorted(by_race[race], key=lambda x: x['name']):
        print(f"  • {ship['name']} ({ship['class']})")

# Notable new/special ships
print("\n\n=== NOTABLE SHIPS ===")
print("\nTriglavian Ships (Relatively New Faction):")
for ship in ships:
    if ship['race'] == 'Triglavian':
        print(f"  • {ship['name']} ({ship['class']})")

print("\nPirate Faction Ships:")
for ship in ships:
    if ship['race'] == 'Pirate':
        print(f"  • {ship['name']} ({ship['class']})")

print("\nUpwell Consortium Ships:")
for ship in ships:
    if ship['race'] == 'Upwell':
        print(f"  • {ship['name']} ({ship['class']})")
