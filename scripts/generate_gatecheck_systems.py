#!/usr/bin/env python3
"""
Generate gatecheck/systems.js from EVE Online SDE JSONL data.

Contains all solar systems players can enter:
  - The normal stargate network (high/low/null security space) plus Zarzakh
  - Pochven and Exordium, tagged with a "group" so the dropdown can show
    them as separate sections (no stargate route exists to these)

Deliberately omitted ("strange" systems that are unreachable):
  - Wormhole space (regionID >= 11000000, includes Thera)
  - UUA-F4 (Jove space)
  - Abyssal deadspace (AD###), Vanguard space (V-###), GPMS-01, ...

systems.js: Systems with ID, name, security status and optional section
group - sorted by name.
"""

import json
import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SDE_DIR = BASE_DIR / "sde"
GATECHECK_DIR = BASE_DIR / "gatecheck"

# Regions that exist in the SDE but are completely unreachable.
EXCLUDED_REGIONS = {
    10000004: "UUA-F4 (Jove space)",
}

# Regions players can get to, but with no stargate route. These are tagged
# and shown as separate sections in the dropdown.
SECTION_REGIONS = {
    10000070: "pochven",
    10001004: "exordium",
}

# Everything at/above this region ID is wormhole / abyssal / special space.
WORMHOLE_REGION_MIN = 11000000


def load_jsonl(filename):
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
    print("=== Generating gatecheck/systems.js ===\n")

    print("Loading SDE files...")
    systems_sde = load_jsonl("mapSolarSystems.jsonl")

    system_list = []
    skipped = {}
    for sid, s in systems_sde.items():
        if not isinstance(sid, int):
            continue
        name = s.get("name", {}).get("en", "")
        if not name:
            continue
        rid = s.get("regionID")
        if rid is None:
            continue
        if rid >= WORMHOLE_REGION_MIN:
            skipped["wormhole/abyssal/special space"] = skipped.get("wormhole/abyssal/special space", 0) + 1
            continue
        if rid in EXCLUDED_REGIONS:
            label = EXCLUDED_REGIONS[rid]
            skipped[label] = skipped.get(label, 0) + 1
            continue
        entry = {
            "id": sid,
            "name": name,
            "sec": round(s.get("securityStatus", 0.0), 3),
        }
        group = SECTION_REGIONS.get(rid)
        if group:
            entry["group"] = group
        system_list.append(entry)

    system_list.sort(key=lambda x: x["name"].lower())

    section_counts = {}
    for s in system_list:
        if "group" in s:
            section_counts[s["group"]] = section_counts.get(s["group"], 0) + 1
    main_count = len(system_list) - sum(section_counts.values())

    print(f"  Systems: {len(system_list)} (main: {main_count})")
    for label, count in sorted(section_counts.items()):
        print(f"    section {label}: {count}")
    for label, count in sorted(skipped.items()):
        print(f"  Skipped {count}: {label}")

    output = []
    output.append("// Auto-generated from EVE Online SDE JSONL")
    output.append(f"// Systems: {len(system_list)} (main: {main_count})")
    for label, count in sorted(section_counts.items()):
        output.append(f"// Section {label}: {count}")
    output.append(f"// Generated: {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')} UTC")
    output.append("//")
    output.append("// Excludes wormhole space, Jove space (UUA-F4) and other special")
    output.append("// regions. Pochven/Exordium entries carry a \"group\" tag and are")
    output.append("// shown as separate sections in the Gate Check dropdown.")
    output.append("")
    output.append("const GATECHECK_SYSTEMS = [")
    for sys in system_list:
        name_escaped = sys["name"].replace("\\", "\\\\").replace("'", "\\'")
        group_txt = f", group: '{sys['group']}'" if "group" in sys else ""
        output.append(f"    {{ id: {sys['id']}, name: '{name_escaped}', sec: {sys['sec']}{group_txt} }},")
    output.append("];")
    output.append("")
    output.append('if (typeof module !== "undefined" && module.exports) module.exports = GATECHECK_SYSTEMS;')
    output.append("")

    out_path = GATECHECK_DIR / "systems.js"
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(output))
    print(f"  Wrote {len(system_list)} systems to {out_path}")

    print("\nDone!")


if __name__ == "__main__":
    main()
