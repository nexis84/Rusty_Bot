#!/usr/bin/env python3
"""
Regenerate market/items_database.js from EVE Online SDE JSONL data.
Preserves the existing category structure while updating all item entries
and adding comprehensive region data from mapRegions.jsonl.
"""

import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SDE_DIR = BASE_DIR / "sde"
MARKET_DIR = BASE_DIR / "market"

# Category order and metadata (preserved from existing file)
CATEGORY_META = [
    ("ships", "Ships", "fa-rocket"),
    ("modules", "Ship Equipment", "fa-cogs"),
    ("ammunition_and_charges", "Ammunition & Charges", "fa-bullseye"),
    ("drones", "Drones", "fa-dot-circle"),
    ("implants_and_boosters", "Implants & Boosters", "fa-user-plus"),
    ("blueprints", "Blueprints & Reactions", "fa-scroll"),
    ("materials", "Materials", "fa-cube"),
    ("trade_goods", "Trade Goods", "fa-exchange-alt"),
    ("skills", "Skills", "fa-graduation-cap"),
    ("skins", "Ship SKINs", "fa-paint-brush"),
    ("apparel", "Apparel", "fa-tshirt"),
    ("deployables", "Deployables", "fa-cube"),
    ("subsystems", "Subsystems", "fa-cogs"),
    ("special_edition", "Special Edition", "fa-star"),
    ("planetary_industry", "Planetary Industry", "fa-globe"),
    ("planetary_resources", "Planetary Resources", "fa-leaf"),
    ("structures", "Structures", "fa-building"),
]


def load_jsonl(filename):
    """Load a JSONL file and return a dict keyed by _key."""
    data = {}
    filepath = SDE_DIR / filename
    print(f"  Loading {filename}...")
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                obj = json.loads(line)
                data[obj["_key"]] = obj
    print(f"    -> {len(data)} entries")
    return data


def main():
    print("=== Generating items_database.js ===\n")

    # Load SDE data
    print("Loading SDE files...")
    types = load_jsonl("types.jsonl")
    groups = load_jsonl("groups.jsonl")
    categories = load_jsonl("categories.jsonl")
    map_regions = load_jsonl("mapRegions.jsonl")
    sde_meta = load_jsonl("_sde.jsonl")

    # Build group -> category mapping
    group_to_category = {}
    for gid, g in groups.items():
        group_to_category[gid] = g.get("categoryID")

    # Build category name -> ID mapping
    category_name_to_id = {}
    for cid, c in categories.items():
        name_en = c.get("name", {}).get("en", "")
        category_name_to_id[name_en] = cid

    print(f"\nCategories in SDE: {len(categories)}")
    for cid, c in sorted(categories.items()):
        name_en = c.get("name", {}).get("en", "")
        published = c.get("published", False)
        print(f"  {cid}: '{name_en}' (published={published})")

    # Derive SDE category mapping from existing types
    # Read current items_database.js to extract existing category mappings
    existing_path = MARKET_DIR / "items_database.js"
    existing_items = {}  # category_key -> set of type_ids
    for cat_key, _, _ in CATEGORY_META:
        existing_items[cat_key] = set()

    print(f"\nParsing existing items_database.js for category mapping...")
    current_cat = None
    with open(existing_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip()
            # Check for category start
            for cat_key, _, _ in CATEGORY_META:
                marker = f"    {cat_key}: {{"
                if marker in line:
                    current_cat = cat_key
                    break
            if current_cat:
                # Parse item entries: { id: 12345, name: "ItemName" },
                if "{ id:" in line or "{id:" in line:
                    import re
                    m = re.search(r"id:\s*(\d+)", line)
                    if m:
                        existing_items[current_cat].add(int(m.group(1)))
            # Check for end of category
            if current_cat and line.strip() == "}," and "items:" not in line:
                if line.strip() == "},":
                    pass  # Parent object closes too

    print(f"  Extracted item IDs from existing file")
    for cat_key, ids in existing_items.items():
        print(f"    {cat_key}: {len(ids)} items")

    # Map SDE categories to market categories based on existing items
    sde_cat_to_market_cat = {}
    for market_cat, ids in existing_items.items():
        sde_cat_counts = {}
        for tid in ids:
            t = types.get(tid)
            if not t:
                continue
            gid = t.get("groupID")
            sde_cat_id = group_to_category.get(gid)
            if sde_cat_id is not None:
                sde_cat_counts[sde_cat_id] = sde_cat_counts.get(sde_cat_id, 0) + 1
        if sde_cat_counts:
            best_cat = max(sde_cat_counts, key=sde_cat_counts.get)
            sde_cat_to_market_cat[best_cat] = market_cat
            name_en = categories.get(best_cat, {}).get("name", {}).get("en", "?")
            print(f"  Market '{market_cat}' <- SDE cat {best_cat} ('{name_en}') "
                  f"({sde_cat_counts[best_cat]}/{len(ids)} items)")

    # Handle special cases
    # "skins" come from skinLicenses, not types - keep existing
    # "special_edition" might use category 14 (Spawn Container) or just be curated
    # Check what we're missing
    mapped_market_cats = set(sde_cat_to_market_cat.values())
    for cat_key, _, _ in CATEGORY_META:
        if cat_key not in mapped_market_cats:
            print(f"  WARNING: '{cat_key}' has no SDE category mapping, keeping existing items")

    # Build item lists from new SDE
    print(f"\nBuilding item lists from new SDE...")
    all_published = 0
    categorized = 0

    new_items = {cat_key: [] for cat_key, _, _ in CATEGORY_META}

    for tid, t in types.items():
        if not t.get("published", False):
            continue
        if not isinstance(tid, int):
            continue
        all_published += 1

        name_en = t.get("name", {}).get("en", "")
        if not name_en:
            continue

        gid = t.get("groupID")
        sde_cat_id = group_to_category.get(gid)

        if sde_cat_id is not None and sde_cat_id in sde_cat_to_market_cat:
            market_cat = sde_cat_to_market_cat[sde_cat_id]
            new_items[market_cat].append({"id": tid, "name": name_en})
            categorized += 1

    print(f"  Total published types: {all_published}")
    print(f"  Categorized into market groups: {categorized}")
    for cat_key, items in new_items.items():
        items.sort(key=lambda x: x["name"].lower())
        print(f"    {cat_key}: {len(items)} items")

    # For unmapped categories (skins, special_edition), keep existing items
    # and add any new ones found from SDE
    print(f"\nMerging with existing items for unmapped categories...")

    # Load existing items database to preserve unmapped categories
    existing_by_cat = {}
    current_cat = None
    existing_items_parsed = {cat_key: [] for cat_key, _, _ in CATEGORY_META}

    with open(existing_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        for cat_key, _, _ in CATEGORY_META:
            marker = f"    {cat_key}: {{"
            if marker in line:
                current_cat = cat_key
                break
        if current_cat:
            import re
            m = re.search(r"\{\s*id:\s*(\d+),\s*name:\s*\"([^\"]+)\"\s*\}", line)
            if m:
                existing_items_parsed[current_cat].append({
                    "id": int(m.group(1)),
                    "name": m.group(2)
                })
        if line.strip() == "};" and current_cat:
            current_cat = None
        i += 1

    # For unmapped categories, use existing items (they don't come from types.jsonl)
    unmapped = set()
    for cat_key, _, _ in CATEGORY_META:
        if cat_key not in mapped_market_cats and cat_key not in ("skins", "special_edition"):
            unmapped.add(cat_key)

    # For categories with SDE mapping, check if we need to preserve any items
    # that the new SDE doesn't have (e.g., un-published items)
    for cat_key, _, _ in CATEGORY_META:
        if cat_key in mapped_market_cats:
            existing_ids = {item["id"] for item in existing_items_parsed[cat_key]}
            new_ids = {item["id"] for item in new_items[cat_key]}
            missing = existing_ids - new_ids
            if missing:
                print(f"  {cat_key}: {len(missing)} existing items missing from new SDE "
                      f"(keeping them)")
                # Add missing items back
                for item in existing_items_parsed[cat_key]:
                    if item["id"] in missing:
                        new_items[cat_key].append(item)
                new_items[cat_key].sort(key=lambda x: x["name"].lower())

    # Now build Regions object from mapRegions (market regions only: 10000001-10999999)
    print(f"\nBuilding Regions object...")
    region_entries = []
    for rid, r in sorted(map_regions.items()):
        if isinstance(rid, int) and 10000001 <= rid < 11000000:
            name_en = r.get("name", {}).get("en", "")
            if name_en:
                region_entries.append((rid, name_en))
    print(f"  Total market regions: {len(region_entries)}")

    # Read existing PopularItems
    print(f"\nReading existing PopularItems...")
    popular_items_start = None
    popular_items_end = None
    popular_lines = []
    for i, line in enumerate(lines):
        if "const PopularItems = [" in line:
            popular_items_start = i
        if popular_items_start is not None and line.rstrip() == "];":
            popular_items_end = i
            break
    if popular_items_start is not None and popular_items_end is not None:
        popular_lines = lines[popular_items_start:popular_items_end + 1]
        print(f"  Preserved {len(popular_lines)} lines of PopularItems")

    # Generate output file
    print(f"\nWriting items_database.js...")

    output = []
    import datetime
    build_number = sde_meta.get("sde", {}).get("buildNumber", "unknown")
    output.append("// Auto-generated from EVE Online SDE JSONL")
    output.append(f"// Total items: {categorized}")
    output.append(f"// SDE build: {build_number}")
    output.append(f"// Generated: {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')} UTC")
    output.append("")
    output.append("const AllMarketItems = {")

    for cat_key, cat_name, cat_icon in CATEGORY_META:
        items = new_items.get(cat_key, existing_items_parsed.get(cat_key, []))
        items.sort(key=lambda x: x["name"].lower())
        output.append(f"    // {cat_name}")
        output.append(f"    {cat_key}: {{")
        output.append(f'        name: "{cat_name}",')
        output.append(f'        icon: "{cat_icon}",')
        output.append(f"        items: [")
        for item in items:
            name_escaped = item["name"].replace("\\", "\\\\").replace('"', '\\"')
            output.append(f"            {{ id: {item['id']}, name: \"{name_escaped}\" }},")
        output.append(f"        ]")
        output.append(f"    }},")
        output.append("")

    output.append("};")
    output.append("")

    # Popular Items
    if popular_lines:
        for pl in popular_lines:
            output.append(pl.rstrip())
    else:
        output.append("const PopularItems = [")
        output.append("    { id: 34, name: 'Tritanium', category: 'Materials' },")
        output.append("    { id: 35, name: 'Pyerite', category: 'Materials' },")
        output.append("    { id: 36, name: 'Mexallon', category: 'Materials' },")
        output.append("    { id: 37, name: 'Isogen', category: 'Materials' },")
        output.append("    { id: 38, name: 'Nocxium', category: 'Materials' },")
        output.append("    { id: 39, name: 'Zydrine', category: 'Materials' },")
        output.append("    { id: 40, name: 'Megacyte', category: 'Materials' },")
        output.append("    { id: 44, name: 'Enriched Uranium', category: 'Materials' },")
        output.append("    { id: 29668, name: 'PLEX', category: 'Trade Goods' },")
        output.append("];")
    output.append("")

    # Regions
    output.append("// Market regions (all regions from SDE)")
    output.append("const Regions = {")
    for rid, name_en in region_entries:
        name_escaped = name_en.replace("\\", "\\\\").replace("'", "\\'")
        output.append(f"    {rid}: '{name_escaped}',")
    output.append("};")
    output.append("")

    # Write file
    output_path = MARKET_DIR / "items_database.js"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output))

    print(f"\nDone! Wrote {len(output)} lines to {output_path}")

    # Stats
    total = sum(len(new_items.get(c, existing_items_parsed.get(c, [])))
                for c, _, _ in CATEGORY_META)
    reg_count = len(region_entries)
    print(f"  Categories: {len(CATEGORY_META)}")
    print(f"  Total items: {total}")
    print(f"  Regions: {reg_count}")


if __name__ == "__main__":
    main()
