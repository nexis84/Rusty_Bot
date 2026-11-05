#!/usr/bin/env python3
"""Generate skillplanner/skills-data.js from the local EVE SDE JSONL files.

The planner needs every published skill, its rank/attributes, and the
prerequisite graph. Generating all of that at build time keeps the browser
off ESI and makes plans work offline.

Usage:
    python scripts/generate_skillplanner_data.py
"""

import json
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SDE_DIR = BASE_DIR / "sde"
OUT_FILE = BASE_DIR / "skillplanner" / "skills-data.js"

SKILL_CATEGORY_NAME = "Skill"

ATTRIBUTE_KEYS = {
    164: "int",
    165: "mem",
    166: "cha",
    167: "per",
    168: "will",
}

ATTRIBUTES = {
    "int": "intelligence",
    "mem": "memory",
    "per": "perception",
    "will": "willpower",
    "cha": "charisma",
}

SP_TABLE = {
    "1": 250,
    "2": 1415,
    "3": 8000,
    "4": 45255,
    "5": 256000,
}

# requiredSkill{1..6} -> requiredSkill{1..6}Level
PREREQUISITE_PAIRS = (
    (182, 277),
    (183, 278),
    (184, 279),
    (1285, 1286),
    (1289, 1287),
    (1290, 1288),
)

CEREBRAL_ACCELERATORS = [
    {"name": "Standard Cerebral Accelerator (+5)", "bonus": 5, "typeId": 2838},
    {"name": "Expert Cerebral Accelerator (+8)", "bonus": 8, "typeId": 55826},
    {"name": "Advanced Cerebral Accelerator (+17)", "bonus": 17, "typeId": 33087},
    {"name": "Event Accelerator (+2)", "bonus": 2, "typeId": 0},
    {"name": "Event Accelerator (+4)", "bonus": 4, "typeId": 0},
    {"name": "Event Accelerator (+6)", "bonus": 6, "typeId": 0},
    {"name": "Event Accelerator (+10)", "bonus": 10, "typeId": 0},
    {"name": "Event Accelerator (+12)", "bonus": 12, "typeId": 0},
]


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


def main():
    print("=== Generating skillplanner/skills-data.js ===\n")
    categories = load_jsonl("categories.jsonl")
    groups = load_jsonl("groups.jsonl")
    types = load_jsonl("types.jsonl")
    type_dogma = load_jsonl("typeDogma.jsonl")

    skill_category_id = next(
        (key for key, category in categories.items() if english(category.get("name")) == SKILL_CATEGORY_NAME),
        None,
    )
    if skill_category_id is None:
        raise SystemExit("Could not find the 'Skill' category in categories.jsonl")

    skills = {}
    for type_id, item in types.items():
        if item.get("published") is not True:
            continue
        group = groups.get(item.get("groupID"))
        if not group or group.get("categoryID") != skill_category_id:
            continue
        skills[type_id] = item

    print(f"  Published skills: {len(skills)}")

    output_skills = {}
    categories_out = defaultdict(lambda: {"id": 0, "skills": []})
    missing_prereqs = []
    prerequisite_edges = 0

    for type_id in sorted(skills):
        item = skills[type_id]
        group = groups[item["groupID"]]
        group_name = english(group.get("name")) or "Unknown"
        attributes = {
            entry["attributeID"]: entry["value"]
            for entry in type_dogma.get(type_id, {}).get("dogmaAttributes", [])
        }

        rank = int(round(attributes.get(275, 1)))
        if rank < 1:
            rank = 1

        primary = ATTRIBUTE_KEYS.get(int(attributes.get(180, 0)), "int")
        secondary = ATTRIBUTE_KEYS.get(int(attributes.get(181, 0)), "mem")

        prereqs = {}
        for required_attr, level_attr in PREREQUISITE_PAIRS:
            required_id = int(attributes.get(required_attr, 0))
            required_level = int(attributes.get(level_attr, 0))
            if required_id > 0 and required_level > 0:
                prereqs[str(required_id)] = required_level
                prerequisite_edges += 1
                if required_id not in skills:
                    missing_prereqs.append((type_id, required_id))

        output_skills[str(type_id)] = {
            "name": english(item.get("name")),
            "group": group_name,
            "rank": rank,
            "primary": primary,
            "secondary": secondary,
            "desc": english(item.get("description")),
            "prereqs": prereqs,
        }

        categories_out[group_name]["id"] = item["groupID"]
        categories_out[group_name]["skills"].append(type_id)

    if missing_prereqs:
        details = ", ".join(f"{skill}->{prereq}" for skill, prereq in missing_prereqs[:10])
        raise SystemExit(
            f"{len(missing_prereqs)} prerequisite(s) point at unpublished/unknown skills: {details}"
        )

    # Detect cycles so the plan optimizer can always produce a stable order.
    visiting = set()
    visited = set()

    def visit(skill_id):
        if skill_id in visiting:
            raise SystemExit(f"Prerequisite cycle detected at skill {skill_id}")
        if skill_id in visited:
            return
        visiting.add(skill_id)
        for prereq_id in output_skills[str(skill_id)]["prereqs"]:
            visit(int(prereq_id))
        visiting.remove(skill_id)
        visited.add(skill_id)

    for skill_id in output_skills:
        visit(int(skill_id))

    for group_name in categories_out:
        categories_out[group_name]["skills"].sort()

    sde_meta = load_jsonl("_sde.jsonl").get("sde", {})
    build_number = sde_meta.get("buildNumber", "unknown")
    release_date = sde_meta.get("releaseDate", "unknown")

    def js(value):
        return json.dumps(value, ensure_ascii=False, indent=2)

    output = f"""// Generated by scripts/generate_skillplanner_data.py from EVE SDE build {build_number} ({release_date}).
// Do not edit by hand - run refresh-sde.ps1 instead.

const SKILLS = {js(output_skills)};

const SKILL_CATEGORIES = {js(dict(sorted(categories_out.items())))};

const SP_TABLE = {js(SP_TABLE)};

const SKILL_BOOKS = {{}};

function getSkillBookMarketLink(skillId) {{
  const bookId = SKILL_BOOKS[skillId];
  if (!bookId) return null;
  return `../market/?type=${{bookId}}`;
}}

function getRustyMarketSearchLink(query) {{
  if (!query) return '../market/';
  return `../market/?search=${{encodeURIComponent(query)}}`;
}}

function getRustyMarketTypeLink(typeId) {{
  if (!typeId) return '../market/';
  return `../market/?type=${{typeId}}`;
}}

function getSkillMarketLink(skillId) {{
  const directBookLink = getSkillBookMarketLink(skillId);
  if (directBookLink) return directBookLink;

  const skill = SKILLS[skillId];
  if (!skill?.name) return null;

  // Skill books share the skill's type ID in the SDE.
  return getRustyMarketTypeLink(skillId);
}}

function hasSkillBook(skillId) {{
  return Boolean(SKILL_BOOKS[skillId]);
}}

const CEREBRAL_ACCELERATORS = {js(CEREBRAL_ACCELERATORS)}.map(item => ({{
  ...item,
  marketLink: item.typeId ? getRustyMarketTypeLink(item.typeId) : '../market/'
}}));

const ATTRIBUTES = {js(ATTRIBUTES)};

const skillNameCache = {{}};

async function getSkillName(skillId) {{
  if (SKILLS[skillId]) return SKILLS[skillId].name;
  if (skillNameCache[skillId]) return skillNameCache[skillId];
  return `Skill ${{skillId}}`;
}}

const root = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined);
if (root) {{
  root.SKILLS = SKILLS;
  root.SKILL_CATEGORIES = SKILL_CATEGORIES;
  root.SP_TABLE = SP_TABLE;
  root.SKILL_BOOKS = SKILL_BOOKS;
  root.ATTRIBUTES = ATTRIBUTES;
  root.getSkillBookMarketLink = getSkillBookMarketLink;
  root.getSkillMarketLink = getSkillMarketLink;
  root.getRustyMarketSearchLink = getRustyMarketSearchLink;
  root.getRustyMarketTypeLink = getRustyMarketTypeLink;
  root.hasSkillBook = hasSkillBook;
  root.CEREBRAL_ACCELERATORS = CEREBRAL_ACCELERATORS;
  root.getSkillName = getSkillName;
}}

if (typeof window !== "undefined") {{
  window.SKILLS = SKILLS;
  window.SKILL_CATEGORIES = SKILL_CATEGORIES;
  window.SP_TABLE = SP_TABLE;
  window.SKILL_BOOKS = SKILL_BOOKS;
  window.ATTRIBUTES = ATTRIBUTES;
  window.getSkillBookMarketLink = getSkillBookMarketLink;
  window.getSkillMarketLink = getSkillMarketLink;
  window.getRustyMarketSearchLink = getRustyMarketSearchLink;
  window.getRustyMarketTypeLink = getRustyMarketTypeLink;
  window.hasSkillBook = hasSkillBook;
  window.CEREBRAL_ACCELERATORS = CEREBRAL_ACCELERATORS;
  window.getSkillName = getSkillName;
  console.log('skills-data.js: SKILLS loaded with', Object.keys(SKILLS).length, 'skills');
}}

if (typeof module !== "undefined" && module.exports) {{
  module.exports = {{
    SKILLS,
    SKILL_CATEGORIES,
    SP_TABLE,
    SKILL_BOOKS,
    ATTRIBUTES,
    getSkillBookMarketLink,
    getSkillMarketLink,
    getRustyMarketSearchLink,
    getRustyMarketTypeLink,
    hasSkillBook,
    CEREBRAL_ACCELERATORS,
    getSkillName
  }};
}}
"""

    OUT_FILE.write_text(output, encoding="utf-8")
    print(f"  Prerequisite edges: {prerequisite_edges}")
    print(f"  Groups: {len(categories_out)}")
    print(f"  Wrote {OUT_FILE.relative_to(BASE_DIR)} ({OUT_FILE.stat().st_size:,} bytes)")
    print(f"  SDE build: {build_number} ({release_date})")


if __name__ == "__main__":
    main()
