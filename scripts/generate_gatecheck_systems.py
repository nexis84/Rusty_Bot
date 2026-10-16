#!/usr/bin/env python3
"""
Generate gatecheck/systems.js from EVE Online SDE JSONL data.

Contains every solar system reachable through the stargate network:
normal high/low/null security space plus Zarzakh.

Deliberately omitted ("strange" systems that cannot be gate-routed to):
  - Wormhole space (regionID >= 11000000, includes Thera)
  - UUA-F4 (Jove space)
  - Pochven (filament entry only, ESI route API finds no route)
  - Exordium (restricted region, ESI route API finds no route)
  - Abyssal deadspace (AD###), Vanguard space (V-###), GPMS-01, ...

systems.js: Reachable systems with ID, name, security status - sorted by name.
"""

import json
import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SDE_DIR = BASE_DIR / "sde"
GATECHECK_DIR = BASE_DIR / "gatecheck"

# Regions that exist in the SDE but are unreachable via the stargate network.
EXCLUDED_REGIONS = {
    10000004: "UUA-F4 (Jove space)",
    10000070: "Pochven (filament entry only)",
    10001004: "Exordium (restricted region)",
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
        system_list.append({
            "id": sid,
            "name": name,
            "sec": round(s.get("securityStatus", 0.0), 3),
        })

    system_list.sort(key=lambda x: x["name"].lower())

    print(f"  Reachable systems: {len(system_list)}")
    for label, count in sorted(skipped.items()):
        print(f"  Skipped {count}: {label}")

    output = []
    output.append("// Auto-generated from EVE Online SDE JSONL")
    output.append(f"// Reachable systems (stargate network): {len(system_list)}")
    output.append(f"// Generated: {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')} UTC")
    output.append("//")
    output.append("// Excludes wormhole space, Jove space (UUA-F4), Pochven, Exordium")
    output.append("// and other special regions that cannot be routed to by gates.")
    output.append("")
    output.append("const GATECHECK_SYSTEMS = [")
    for sys in system_list:
        name_escaped = sys["name"].replace("\\", "\\\\").replace("'", "\\'")
        output.append(f"    {{ id: {sys['id']}, name: '{name_escaped}', sec: {sys['sec']} }},")
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
