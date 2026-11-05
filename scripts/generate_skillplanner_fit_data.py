#!/usr/bin/env python3
"""Generate skillplanner/fit-data.json from the EVE SDE.

The Skill Planner's fit importer needs to resolve EFT item names and the
skills each hull/module/drone/charge requires. Keeping this in a small lazy
JSON file means the main planner payload stays fast.
"""

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SDE_DIR = BASE_DIR / "sde"
OUT_FILE = BASE_DIR / "skillplanner" / "fit-data.json"

# Categories that can appear in an EFT fit (or its cargo/charges).
FIT_CATEGORIES = {
    "Ship",
    "Module",
    "Charge",
    "Drone",
    "Fighter",
    "Subsystem",
    "Deployable",
    "Structure Module",
    "Implant",
}

PREREQUISITE_PAIRS = (
    (182, 277),
    (183, 278),
    (184, 279),
    (1285, 1286),
    (1289, 1287),
    (1290, 1288),
)


def load_jsonl(filename):
    data = {}
    with open(SDE_DIR / filename, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                obj = json.loads(line)
                data[obj["_key"]] = obj
    return data


def english(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("en", "")
    return ""


def normalize_name(value):
    return " ".join(str(value or "").split()).lower()


def main():
    print("=== Generating skillplanner/fit-data.json ===\n")
    categories = load_jsonl("categories.jsonl")
    groups = load_jsonl("groups.jsonl")
    types = load_jsonl("types.jsonl")
    type_dogma = load_jsonl("typeDogma.jsonl")

    category_name = {key: english(item.get("name")) for key, item in categories.items()}
    fit_category_ids = {
        key for key, name in category_name.items() if name in FIT_CATEGORIES
    }

    fit_data = {}
    duplicates = []
    with_skills = 0

    for type_id, item in types.items():
        # Include unpublished types too: some legitimate EFT fits contain
        # non-market items such as the Civilian Gatling Railgun.
        group = groups.get(item.get("groupID"))
        if not group or group.get("categoryID") not in fit_category_ids:
            continue

        name = english(item.get("name")).strip()
        if not name:
            continue

        attributes = {
            entry["attributeID"]: entry["value"]
            for entry in type_dogma.get(type_id, {}).get("dogmaAttributes", [])
        }
        skills = {}
        for required_attr, level_attr in PREREQUISITE_PAIRS:
            required_id = int(attributes.get(required_attr, 0))
            required_level = int(attributes.get(level_attr, 0))
            if required_id > 0 and required_level > 0:
                skills[str(required_id)] = required_level

        if skills:
            with_skills += 1

        key = normalize_name(name)
        entry = {
            "id": type_id,
            "name": name,
            "group": english(group.get("name")),
            "skills": skills,
        }

        existing = fit_data.get(key)
        if existing is None:
            fit_data[key] = entry
        else:
            duplicates.append(name)
            # Keep the entry with the richest requirement set. The fit parser
            # only knows names, so this is the safest deterministic choice.
            if len(skills) > len(existing.get("skills", {})):
                fit_data[key] = entry

    OUT_FILE.write_text(
        json.dumps(fit_data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(f"  Fit item names: {len(fit_data)}")
    print(f"  Items with skill requirements: {with_skills}")
    if duplicates:
        print(f"  Duplicate names kept: {len(duplicates)} (first/richest win)")
    print(f"  Wrote {OUT_FILE.relative_to(BASE_DIR)} ({OUT_FILE.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
