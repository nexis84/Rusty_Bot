#!/usr/bin/env python3
"""
Generate market/systems.js and market/stations.js from EVE Online SDE JSONL data.

systems.js: Solar systems with ID, name, regionID - sorted by name.
stations.js: NPC stations with ID, name, systemID - sorted by name.
"""

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SDE_DIR = BASE_DIR / "sde"
MARKET_DIR = BASE_DIR / "market"

# Station type ID -> type name mapping (common station types)
# The full name of a station is: "<OperationName> - <TypeName>"
# But for simplicity, we use the type name from types.jsonl
# However, npcStations uses operationID for the prefix part of the name.
# Full resolution requires celestial names (moon/planet) which is very complex.
# For this generator, we create a simple lookup with just the station type name.


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
    print("=== Generating systems.js and stations.js ===\n")

    # Load SDE data
    print("Loading SDE files...")
    systems_sde = load_jsonl("mapSolarSystems.jsonl")
    stations_sde = load_jsonl("npcStations.jsonl")
    operations = load_jsonl("stationOperations.jsonl")
    types = load_jsonl("types.jsonl")
    map_regions = load_jsonl("mapRegions.jsonl")

    # Build type name lookup
    type_names = {}
    for tid, t in types.items():
        name_en = t.get("name", {}).get("en", "")
        if name_en:
            type_names[tid] = name_en

    # Build operation name lookup
    op_names = {}
    for oid, o in operations.items():
        name_en = o.get("operationName", {}).get("en", "")
        if name_en:
            op_names[oid] = name_en

    # Build region name lookup
    region_names = {}
    for rid, r in map_regions.items():
        if isinstance(rid, int) and 10000001 <= rid < 11000000:
            name_en = r.get("name", {}).get("en", "")
            if name_en:
                region_names[rid] = name_en

    # Generate systems.js
    print(f"\nBuilding systems list...")
    system_list = []
    for sid, s in systems_sde.items():
        if not isinstance(sid, int):
            continue
        name_en = s.get("name", {}).get("en", "")
        if not name_en:
            continue
        rid = s.get("regionID")
        if rid is None:
            continue
        sec_status = s.get("securityStatus", 0.0)
        system_list.append({
            "id": sid,
            "name": name_en,
            "regionId": rid,
            "securityStatus": sec_status,
        })

    system_list.sort(key=lambda x: x["name"].lower())

    print(f"  Total systems: {len(system_list)}")

    output_systems = []
    output_systems.append("// Auto-generated from EVE Online SDE JSONL")
    output_systems.append(f"// Total systems: {len(system_list)}")
    import datetime
    output_systems.append(
        f"// Generated: {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')} UTC"
    )
    output_systems.append("")
    output_systems.append("const Systems = [")

    for sys in system_list:
        name_escaped = sys["name"].replace("\\", "\\\\").replace("'", "\\'")
        output_systems.append(
            f"    {{ id: {sys['id']}, name: '{name_escaped}', regionId: {sys['regionId']}, securityStatus: {sys['securityStatus']} }},"
        )

    output_systems.append("];")
    output_systems.append("")

    systems_path = MARKET_DIR / "systems.js"
    with open(systems_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_systems))
    print(f"  Wrote {len(output_systems)} lines to {systems_path}")

    # Generate stations.js - create simple station name from type name
    print(f"\nBuilding stations list...")
    station_list = []
    for stid, st in stations_sde.items():
        if not isinstance(stid, int):
            continue
        sys_id = st.get("solarSystemID")
        if sys_id is None:
            continue
        type_id = st.get("typeID")
        op_id = st.get("operationID")
        use_op_name = st.get("useOperationName", False)

        # Get station type name as base name
        type_name = type_names.get(type_id, f"Station {stid}")

        # If useOperationName, prefix with operation name
        if use_op_name and op_id:
            op_name = op_names.get(op_id, "")
            if op_name:
                station_name = f"{op_name} - {type_name}"
            else:
                station_name = type_name
        else:
            station_name = type_name

        station_list.append({
            "id": stid,
            "name": station_name,
            "systemId": sys_id,
        })

    station_list.sort(key=lambda x: x["name"].lower())

    print(f"  Total stations: {len(station_list)}")

    output_stations = []
    output_stations.append("// Auto-generated from EVE Online SDE JSONL")
    output_stations.append(f"// Total stations: {len(station_list)}")
    output_stations.append(
        f"// Generated: {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')} UTC"
    )
    output_stations.append("")
    output_stations.append("const Stations = {")

    for st in station_list:
        name_escaped = st["name"].replace("\\", "\\\\").replace("'", "\\'")
        output_stations.append(
            f"    {st['id']}: {{ name: '{name_escaped}', systemId: {st['systemId']} }},"
        )

    output_stations.append("};")
    output_stations.append("")

    stations_path = MARKET_DIR / "stations.js"
    with open(stations_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_stations))
    print(f"  Wrote {len(output_stations)} lines to {stations_path}")

    print(f"\nDone!")


if __name__ == "__main__":
    main()
