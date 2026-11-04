#!/usr/bin/env python3
"""Build local market skin icons from a SKIN Icons zip.

Usage:
    python scripts/build-skin-icons.py "C:\\path\\to\\SKIN Icons.zip"

The zip is expected to contain `skins.csv` with the columns
`typeID,typeName,skinID,skinName,shipTypeIDs,iconFile` plus the PNG files
named in `iconFile`.

The pack repeats the same 64x64 theme icon across many skins, so icons are
content-addressed: each unique image is written once as `<sha1>.png`, and
`market/skin-icons.js` maps every skin typeID to that file.
"""

import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "market" / "skin-icons"
MAP_FILE = ROOT / "market" / "skin-icons.js"


def load_sde_index():
    """Return (published ship names, {skin typeID: name}) from the local SDE."""
    sde = ROOT / "sde"
    types_path = sde / "types.jsonl"
    groups_path = sde / "groups.jsonl"
    categories_path = sde / "categories.jsonl"
    if not (types_path.is_file() and groups_path.is_file() and categories_path.is_file()):
        return set(), {}

    category_names = {}
    with categories_path.open(encoding="utf-8") as handle:
        for line in handle:
            rec = json.loads(line)
            category_names[rec["_key"]] = (rec.get("name") or {}).get("en", "")

    group_category = {}
    with groups_path.open(encoding="utf-8") as handle:
        for line in handle:
            rec = json.loads(line)
            group_category[rec["_key"]] = rec.get("categoryID")

    ship_cat = next((cid for cid, name in category_names.items() if name == "Ship"), 6)
    skin_cat = next((cid for cid, name in category_names.items() if name == "SKINs"), 91)

    ships = set()
    skins = {}
    with types_path.open(encoding="utf-8") as handle:
        for line in handle:
            rec = json.loads(line)
            if rec.get("published") is not True:
                continue
            name = (rec.get("name") or {}).get("en", "").strip()
            if not name:
                continue
            category = group_category.get(rec.get("groupID"))
            if category == ship_cat:
                ships.add(name)
            elif category == skin_cat:
                skins[str(rec["_key"])] = name
    return ships, skins


def split_theme(type_name: str, ship_names):
    """Split 'Odysseus Glacial Drift SKIN' -> 'Glacial Drift'."""
    base = re.sub(r"\s+SKIN$", "", type_name, flags=re.IGNORECASE).strip()
    for ship in ship_names:
        if base.startswith(ship + " "):
            return base[len(ship) + 1:].strip()
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 2

    zip_path = Path(sys.argv[1]).expanduser()
    if not zip_path.is_file():
        print(f"error: zip not found: {zip_path}")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    mapping: dict[str, str] = {}
    unique: dict[str, tuple[str, bytes]] = {}
    duplicate_types: list[str] = []
    missing_icons: list[tuple[str, str]] = []
    rows = 0
    collision_retries = 0
    theme_votes: dict[str, Counter] = {}

    # SDE data lets us fill skins that are newer than the icon pack by reusing
    # the pack's icon for the same theme (e.g. a new Odysseus Glacial Drift
    # hull uses the existing Glacial Drift icon).
    ship_names, sde_skins = load_sde_index()
    ship_names = sorted(ship_names, key=len, reverse=True)

    with zipfile.ZipFile(zip_path) as archive:
        names = set(archive.namelist())
        csv_name = next(
            (name for name in names if name.lower().endswith("skins.csv")),
            None,
        )
        if not csv_name:
            print("error: skins.csv not found in the zip")
            return 1

        with archive.open(csv_name) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
            reader = csv.DictReader(text)
            required = {"typeID", "typeName", "iconFile"}
            missing_columns = required - set(reader.fieldnames or [])
            if missing_columns:
                print(f"error: skins.csv is missing columns: {', '.join(sorted(missing_columns))}")
                return 1

            for row in reader:
                rows += 1
                type_id = (row.get("typeID") or "").strip()
                icon_name = (row.get("iconFile") or "").strip()
                if not type_id or not icon_name:
                    continue

                if type_id in mapping:
                    duplicate_types.append(type_id)

                icon_key = icon_name.replace("\\", "/")
                if icon_key not in names:
                    icon_key = Path(icon_key).name
                if icon_key not in names:
                    missing_icons.append((type_id, icon_name))
                    continue

                data = archive.read(icon_key)
                digest = hashlib.sha1(data).hexdigest()[:16]
                # Keep hashes stable but guard against the (vanishingly
                # unlikely) case of a truncated-hash collision.
                while digest in unique and unique[digest][1] != data:
                    collision_retries += 1
                    digest = hashlib.sha1(data + digest.encode("ascii")).hexdigest()[:16]
                unique.setdefault(digest, (icon_key, data))
                mapping[type_id] = f"{digest}.png"

                theme = split_theme(row.get("typeName") or "", ship_names)
                if theme:
                    key = re.sub(r"\s+", " ", theme.lower()).strip()
                    theme_votes.setdefault(key, Counter())[digest] += 1

    theme_icons = {
        theme: votes.most_common(1)[0][0]
        for theme, votes in theme_votes.items()
    }
    theme_fallbacks = 0
    for type_id, name in sde_skins.items():
        if type_id in mapping:
            continue
        theme = split_theme(name, ship_names)
        if not theme:
            continue
        key = re.sub(r"\s+", " ", theme.lower()).strip()
        digest = theme_icons.get(key)
        if not digest:
            # Newer themes sometimes pluralise the pack's name, e.g.
            # "Bluestar Defender" vs "Bluestar Defenders".
            alternate = key[:-1] if key.endswith("s") else key + "s"
            digest = theme_icons.get(alternate)
        if digest:
            mapping[type_id] = f"{digest}.png"
            theme_fallbacks += 1

    written = 0
    for digest, (_source, data) in sorted(unique.items()):
        path = OUT_DIR / f"{digest}.png"
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
            written += 1

    removed = 0
    keep = {f"{digest}.png" for digest in unique}
    for path in OUT_DIR.glob("*.png"):
        if path.name not in keep:
            path.unlink()
            removed += 1

    def sort_key(item: tuple[str, str]):
        type_id = item[0]
        return (0, int(type_id)) if type_id.isdigit() else (1, type_id)

    ordered = sorted(mapping.items(), key=sort_key)
    lines = [
        "// Auto-generated by scripts/build-skin-icons.py - do not edit by hand.",
        f"// {len(ordered)} skin type IDs -> {len(unique)} unique icons.",
        "window.SkinIcons = {",
        *(f'  "{type_id}": "{icon}",' for type_id, icon in ordered),
        "};",
        "",
    ]
    MAP_FILE.write_text("\n".join(lines), encoding="utf-8")

    total_bytes = sum(len(data) for _source, data in unique.values())
    print(f"csv rows:          {rows}")
    print(f"mapped type IDs:   {len(ordered)}")
    print(f"theme fallbacks:   {theme_fallbacks}")
    print(f"unique icons:      {len(unique)} ({total_bytes / 1048576:.1f} MB)")
    print(f"images written:    {written}")
    print(f"stale images gone: {removed}")
    if duplicate_types:
        print(f"duplicate typeIDs: {len(duplicate_types)} (last row wins)")
    if missing_icons:
        print(f"missing icons:     {len(missing_icons)}")
        for type_id, icon in missing_icons[:10]:
            print(f"  {type_id}: {icon}")
    if collision_retries:
        print(f"hash retries:      {collision_retries}")
    print(f"mapping:           {MAP_FILE}")
    print(f"icons:             {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
