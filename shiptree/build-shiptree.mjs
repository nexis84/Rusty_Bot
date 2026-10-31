#!/usr/bin/env node
/*
 * Ship tree builder
 * ----------------
 * Reads the local EVE SDE (JSONL flavour, e.g. ../sde) and emits
 * data/shiptree.json for the front end:
 *
 *   skills[]  ship-gating skills + their full prerequisite closure (depth,
 *             rank, attributes, prereqs), extended with the mastery-certificate
 *             skills so a training plan can name and cost every step
 *   ships[]   published hulls: those CCP places in the in-game ship tree plus
 *             the "specials" it leaves out (no shipTreeGroupID). Each with lane
 *             (faction, or the synthetic Special lane), row (hull class), tier,
 *             tags, prerequisites and the "gate" skill it hangs off (its most
 *             specific prerequisite)
 *   rows[]    hull-class metadata (name + role tags)
 *   lanes[]   faction metadata (name, colour, ship count)
 *   elements  CCP's ship-tree tag dictionary (size / role / weapon / tank)
 *
 * Two files are written. shiptree.json is everything the first paint needs;
 * details.json (the deduped per-hull mastery profiles, ship bonuses and the
 * passive skill -> hull-stat modifiers) is the bulk of the bytes and is only
 * read once a hull is opened, so the front end fetches it lazily.
 *
 * Usage:
 *   node build-shiptree.mjs            build + print sanity report
 *   node build-shiptree.mjs --quiet    build silently
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUIET = process.argv.includes('--quiet');

function loadConfig() {
  const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
  const cfg = JSON.parse(raw);
  return {
    sdeDir: path.resolve(__dirname, cfg.sdeDir || '../sde'),
    output: path.resolve(__dirname, cfg.output || 'data/shiptree.json'),
    detailsOutput: path.resolve(__dirname, cfg.detailsOutput || 'data/details.json'),
  };
}
const CONFIG = loadConfig();
const SDE = (...p) => path.join(CONFIG.sdeDir, ...p);

// ---------------------------------------------------------------- jsonl io

async function* jsonl(file) {
  if (!fs.existsSync(file)) throw new Error(`missing SDE file: ${file}`);
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const t = line.trim();
    if (t) yield JSON.parse(t);
  }
}

async function loadSmall(file) {
  const out = [];
  for await (const row of jsonl(file)) out.push(row);
  return out;
}

// ---------------------------------------------------------------- constants

// Faction lanes. 500001-500004 are the empires; the rest match invFactions IDs.
// SPECIAL_LANE is synthetic: it collects the published hulls CCP does not place
// in its own in-game ship tree (no shipTreeGroupID). It is not a real faction.
const SPECIAL_LANE = 599999;
const LANES = [
  { id: 500001, short: 'Caldari', color: '#4f86b8' },
  { id: 500002, short: 'Minmatar', color: '#bd6a41' },
  { id: 500003, short: 'Amarr', color: '#c9a75c' },
  { id: 500004, short: 'Gallente', color: '#5d9469' },
  { id: 500010, short: 'Guristas', color: '#9a4a4a' },
  { id: 500011, short: 'Angel Cartel', color: '#8a6aa0' },
  { id: 500012, short: 'Blood Raiders', color: '#a03a4e' },
  { id: 500019, short: "Sansha's Nation", color: '#7f9350' },
  { id: 500020, short: 'Serpentis', color: '#3f8f89' },
  { id: 500018, short: "Mordu's Legion", color: '#6a7090' },
  { id: 500017, short: 'SoCT', color: '#8f7cb0' },
  { id: 500016, short: 'Servant Sisters', color: '#b0708f' },
  { id: 500029, short: 'Deathless Circle', color: '#a08940' },
  { id: 500014, short: 'ORE', color: '#3f9a9a' },
  { id: 500026, short: 'Triglavian', color: '#d16a3c' },
  { id: 500027, short: 'EDENCOM', color: '#4a7fc0' },
  { id: 500006, short: 'CONCORD', color: '#8f96a3' },
  { id: 500005, short: 'Jove', color: '#a3abc0' },
  { id: SPECIAL_LANE, short: 'Special', name: 'Special Ships', color: '#b08d57' },
];
const LANE_ORDER = new Map(LANES.map((l, i) => [l.id, i]));

// raceID -> empire faction lane (types with no factionID fall back to race)
const RACE_TO_LANE = { 1: 500001, 2: 500002, 4: 500003, 8: 500004 };

// metaGroupID -> tier label. The SDE leaves metaGroupID 0 on plenty of base
// hulls (Ragnarok, Maelstrom, Archon...), so techLevel/absence falls back to T1.
const META_TIERS = {
  2: 'T2', 3: 'Storyline', 4: 'Faction', 5: 'Officer', 6: 'Deadspace',
  14: 'T3', 15: 'Abyssal', 17: 'Premium', 19: 'Limited', 52: 'Faction', 53: 'T2', 54: 'T1',
};
const tierFrom = (metaID, techLevel) =>
  META_TIERS[metaID] ?? (techLevel === 3 ? 'T3' : 'T1');

const ATTR = { primary: 180, secondary: 181, req1: 182, req2: 183, req3: 184, rank: 275 };
const REQ_LEVEL = { 182: 277, 183: 278, 184: 279 };

// Alpha clone skill caps (EVE University wiki, "Clone states" table, Feb 2026).
// A skill missing here cannot be trained by an Alpha at all, so any hull needing
// it is Omega-only. Caps for the racial hull skills are what allow Alphas up to
// battleship size plus basic haulers - which matches CCP's own wording.
const ALPHA_CAPS = {
  'Spaceship Command': 4,
  'Amarr Frigate': 4, 'Caldari Frigate': 4, 'Gallente Frigate': 4, 'Minmatar Frigate': 4,
  'Amarr Destroyer': 4, 'Caldari Destroyer': 4, 'Gallente Destroyer': 4, 'Minmatar Destroyer': 4,
  'Amarr Cruiser': 4, 'Caldari Cruiser': 4, 'Gallente Cruiser': 4, 'Minmatar Cruiser': 4,
  'Amarr Battlecruiser': 4, 'Caldari Battlecruiser': 4, 'Gallente Battlecruiser': 4, 'Minmatar Battlecruiser': 4,
  'Amarr Battleship': 4, 'Caldari Battleship': 4, 'Gallente Battleship': 4, 'Minmatar Battleship': 4,
  'Amarr Hauler': 1, 'Caldari Hauler': 1, 'Gallente Hauler': 1, 'Minmatar Hauler': 1,
  'Mining Frigate': 4, 'Mining Destroyer': 2,
  'CPU Management': 5, 'Drones': 5, 'Gunnery': 5, 'Industry': 5, 'Leadership': 3,
  'Mechanics': 5, 'Mining': 4, 'Navigation': 4, 'Power Grid Management': 5, 'Science': 4,
  'Astrometrics': 3, 'Drone Interfacing': 3, 'Electronics Upgrades': 5, 'Energy Grid Upgrades': 5,
  'Evasive Maneuvering': 3, 'Long Range Targeting': 3, 'Propulsion Jamming': 4,
  'Shield Operation': 4, 'Signature Analysis': 3, 'Survey': 3, 'Warp Drive Operation': 3,
  'Weapon Upgrades': 5, 'Advanced Weapon Upgrades': 3, 'Salvaging': 3,
};
const STAT_ATTRS = {
  high: 14, med: 13, low: 12, rig: 1137,
  cpu: 48, pg: 11, turrets: 102, launchers: 101,
  velocity: 37, agility: 70, sig: 552, warp: 600, scanRes: 564,
  shield: 263, armor: 265, hull: 9, cap: 482, capRecharge: 55,
  droneBay: 283, droneBandwidth: 1271, metaLevel: 633,
  maxTargetRange: 76,
};
const STAT_BY_ATTR = new Map(Object.entries(STAT_ATTRS).map(([k, v]) => [v, k]));

// ---------------------------------------------------------------- load small tables

if (!QUIET) console.log(`SDE: ${CONFIG.sdeDir}`);

const groups = await loadSmall(SDE('groups.jsonl'));
const categories = await loadSmall(SDE('categories.jsonl'));
const factions = await loadSmall(SDE('factions.jsonl'));
const metaGroups = await loadSmall(SDE('metaGroups.jsonl'));
const shipTreeGroups = await loadSmall(SDE('shipTreeGroups.jsonl'));
const shipTreeElements = await loadSmall(SDE('shipTreeElements.jsonl'));
const typeElements = await loadSmall(SDE('typeElements.jsonl'));
const dogmaAttributes = await loadSmall(SDE('dogmaAttributes.jsonl'));
const dogmaEffects = await loadSmall(SDE('dogmaEffects.jsonl'));

const groupCategory = new Map(groups.map(g => [g._key, g.categoryID]));
const groupById = new Map(groups.map(g => [g._key, g]));
const categoryName = new Map(categories.map(c => [c._key, c.name?.en ?? `category ${c._key}`]));
const factionName = new Map(factions.map(f => [f._key, f.name?.en ?? '']));
const metaGroupName = new Map(metaGroups.map(m => [m._key, m.name?.en ?? '']));
const attrName = new Map(dogmaAttributes.map(a => [a._key, a.displayName?.en ?? a.name ?? `attr ${a._key}`]));
const elementName = new Map(shipTreeElements.map(e => [e._key, e.name?.en ?? '']));
const effectMods = new Map(dogmaEffects.map(e => [e._key, e.modifierInfo ?? []]));

const SHIP_CAT = [...categoryName.entries()].find(([, n]) => n === 'Ship')?.[0];
const SKILL_CAT = [...categoryName.entries()].find(([, n]) => n === 'Skill')?.[0];
if (SHIP_CAT === undefined || SKILL_CAT === undefined) {
  throw new Error(`could not resolve Ship/Skill categories (got ${SHIP_CAT} / ${SKILL_CAT})`);
}

// hull-class rows straight from CCP's ship-tree groups
const ROWS = new Map();
for (const g of shipTreeGroups) {
  ROWS.set(g._key, {
    name: g.name?.en ?? `row ${g._key}`,
    tags: (g.elements ?? []).map(e => elementName.get(e._value) ?? '').filter(Boolean),
  });
}

/* Special hulls (no shipTreeGroupID) have no CCP hull-class row, so they get a
   synthetic one named after their inventory group ("Corvette", "Covert Ops",
   "Special Edition Yachts"...). The real tree orders its rows by
   shipTreeGroupID, which already follows the game; specials have no such id, so
   the class order is spelled out below (Corvette first, then the combat classes,
   then the support/industrial hulls). A name we have not listed still gets its
   own row, appended after the known ones. Non-combat specials carry a Hauling
   tag so the header's industry filter keeps treating them as industry rather
   than combat. */
const SPECIAL_ROW_BASE = 900000;
const SPECIAL_HAUL_ROW = /Yacht|Shuttle|Hauler|Industrial|Freighter|Barge|Mining/i;
const SPECIAL_ROW_ORDER = [
  'Corvette', 'Frigate', 'Prototype Exploration Ship', 'Interceptor',
  'Assault Frigate', 'Covert Ops', 'Electronic Attack Ship', 'Stealth Bomber',
  'Destroyer', 'Tactical Destroyer', 'Cruiser', 'Force Recon Ship',
  'Heavy Assault Cruiser', 'Heavy Interdiction Cruiser', 'Logistics',
  'Battlecruiser', 'Attack Battlecruiser', 'Command Ships', 'Battleship',
  'Black Ops', 'Marauder', 'Shuttle', 'Hauler', 'Special Edition Yachts', 'Capsule',
];
const specialRowRank = new Map(SPECIAL_ROW_ORDER.map((n, i) => [n, i]));
let nextSpecialRank = SPECIAL_ROW_ORDER.length;
function specialRow(groupID) {
  const name = groupById.get(groupID)?.name?.en ?? `group ${groupID}`;
  let rank = specialRowRank.get(name);
  if (rank === undefined) { rank = nextSpecialRank++; specialRowRank.set(name, rank); }
  const id = SPECIAL_ROW_BASE + rank;
  if (!ROWS.has(id)) ROWS.set(id, { name, tags: SPECIAL_HAUL_ROW.test(name) ? ['Hauling'] : [] });
  return id;
}

// ship tags from CCP's per-type element lists (size / role / weapon / tank)
const TYPE_TAGS = new Map();
for (const t of typeElements) {
  TYPE_TAGS.set(t._key, (t.elements ?? []).map(e => elementName.get(e._value) ?? '').filter(Boolean));
}

// blueprint per product type (so the UI can hand it to the Blueprint Visualizer).
// blueprints.jsonl only carries ids, so the names come from types.jsonl below.
const BP_BY_PRODUCT = new Map();      // product typeID -> blueprint typeID
const BP_IDS = new Set();
for await (const bp of jsonl(SDE('blueprints.jsonl'))) {
  const product = bp.activities?.manufacturing?.products?.[0]?.typeID;
  if (product && !BP_BY_PRODUCT.has(product)) {
    BP_BY_PRODUCT.set(product, bp._key);
    BP_IDS.add(bp._key);
  }
}

/* ---- masteries: static SDE data, not ESI. A ship's mastery I-V is a set of
   certificates; each certificate lists skills with five grades, and mastery
   level N is evaluated at grade N (basic..elite). We resolve that here into
   "skills needed for each level", deduped into shared profiles. */
const GRADES = ['basic', 'standard', 'improved', 'advanced', 'elite'];
const CERT_SKILLS = new Map();        // certificateID -> [{skill, basic..elite}]
for await (const c of jsonl(SDE('certificates.jsonl'))) {
  CERT_SKILLS.set(c._key, (c.skillTypes ?? []).map(s => ({ ...s, skill: s._key })));
}
const MASTERY_OF = new Map();         // ship typeID -> [[certID, ...] x5]
for await (const m of jsonl(SDE('masteries.jsonl'))) {
  MASTERY_OF.set(m._key, (m._value ?? []).map(v => v._value ?? []));
}

/* ---- ship bonuses: typeBonus.jsonl, keyed by the SHIP's own typeID.
   Each row carries two separate things:
     roleBonuses[]     inherent to the hull ("Can fit a Doomsday module",
                       "+200% Command Burst area of effect range")
     types[]._value[]  the hull's own bonuses, each group keyed by the SKILL
                       they scale with per level - so a Rifter's turret damage
                       scales off Minmatar Frigate, a Jackdaw's off Assault
                       Frigates. We keep that skill so the UI can label it.
   CCP stores the bonus text as CCP-flavoured HTML (<a href=showinfo:NNN>), which
   we flatten to plain text; the numeric value and unit are separate fields and
   the value is often absent (pure-text lines like "Immune to Interdiction"). */
const UNIT_OF = new Map();           // unitID -> display symbol ('%', '+', 'x', 'm')
for await (const u of jsonl(SDE('dogmaUnits.jsonl'))) {
  UNIT_OF.set(u._key, u.displayName?.en || u.symbol || '');
}
const TYPE_BONUS = new Map();         // ship typeID -> row
for await (const b of jsonl(SDE('typeBonus.jsonl'))) {
  TYPE_BONUS.set(b._key, b);
}

/** CCP's bonus markup -> plain text. Also decodes the handful of entities that
 *  actually appear in this table. */
const plainText = html => String(html ?? '')
  .replace(/<a[^>]*>/gi, '')
  .replace(/<\/a>/gi, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

/* Hull flavour text. CCP writes it as a tiny bit of HTML - across all 423 hulls
   the only tags that appear are <i> (144), <a href=showinfo:NNN> (58), <br> (19)
   and a couple of strays. We unwrap <a> to its inner text (the name is already
   in there, and the showinfo href is useless offline), keep <i> and <br>, and
   drop everything else. Paragraph breaks are a blank line. The front end escapes
   again and re-allows only <i>/<br>, so a malformed description can never inject. */
function loreText(html) {
  if (!html) return '';
  // <i> is parked behind sentinels while the catch-all strip runs, otherwise
  // the strip takes out the very tags we just decided to keep
  const I_OPEN = '\u0001';
  const I_CLOSE = '\u0002';
  return String(html)
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:i|em)\s*>/gi, m => (m[1] === '/' ? I_CLOSE : I_OPEN))
    .replace(/<[^>]*>/g, '')                    // any other tag goes
    .replace(new RegExp(I_OPEN, 'g'), '<i>')
    .replace(new RegExp(I_CLOSE, 'g'), '</i>')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')                  // CCP pads some of these
    .split('\n\n').map(p => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n\n')
    .trim();
}

/** One bonus line: { v, u, t } - value may be null for text-only lines. */
const bonusLine = b => ({
  v: b.bonus ?? null,
  u: b.unitID != null ? (UNIT_OF.get(b.unitID) ?? '') : '',
  t: plainText(b.bonusText?.en),
});

/** Sort by CCP's display priority (importance), lowest first. */
const byImportance = (a, b) => a.i - b.i;

/** Everything the Bonuses tab shows for one hull. */
function bonusesFor(shipId) {
  const row = TYPE_BONUS.get(shipId);
  if (!row) return null;
  const role = (row.roleBonuses ?? [])
    .map(b => ({ ...bonusLine(b), i: b.importance ?? 99 }))
    .sort(byImportance)
    .map(({ i, ...rest }) => rest);
  const ship = [];
  for (const grp of row.types ?? []) {
    ship.push({
      skill: grp._key ?? null,
      lines: (grp._value ?? [])
        .map(b => ({ ...bonusLine(b), i: b.importance ?? 99 }))
        .sort(byImportance)
        .map(({ i, ...rest }) => rest),
    });
  }
  if (!role.length && !ship.length) return null;
  return { role, ship };
}

// ---------------------------------------------------------------- pass 1: types

const ships = new Map();        // typeID -> ship record (partial)
const skillNames = new Map();   // typeID -> name
const bpNames = new Map();      // blueprint typeID -> name
let scannedTypes = 0;

for await (const t of jsonl(SDE('types.jsonl'))) {
  scannedTypes++;
  if (t.published !== true) continue;
  const cat = groupCategory.get(t.groupID);
  // shipTreeGroupID is also set on abyss filaments / mutaplasmids / Upwell cores,
  // so restrict to real hulls (category "Ship").
  if (cat === SHIP_CAT) {
    // Hulls CCP places in its own tree carry shipTreeGroupID. Everything else
    // published in category Ship is a "special" (tournament prizes, limited
    // editions, shuttles, yachts, faction corvettes like the Immolator...) and
    // gets a synthetic hull-class row so it can live in the Special lane.
    const special = !t.shipTreeGroupID;
    ships.set(t._key, {
      id: t._key,
      name: t.name?.en ?? `type ${t._key}`,
      raceID: t.raceID ?? 0,
      factionID: t.factionID ?? 0,
      metaGroupID: t.metaGroupID ?? 0,
      techLevel: t.techLevel ?? 0,
      row: special ? specialRow(t.groupID) : t.shipTreeGroupID,
      special,
      volume: t.volume ?? 0,
      mass: t.mass ?? 0,
      capacity: t.capacity ?? 0,
      basePrice: t.basePrice ?? 0,
      metaLevel: t.metaLevel ?? 0,
      // hull flavour text, from the same row we are already reading
      description: loreText(t.description?.en),
    });
  } else if (cat === SKILL_CAT) {
    skillNames.set(t._key, t.name?.en ?? `skill ${t._key}`);
  } else if (BP_IDS.has(t._key)) {
    bpNames.set(t._key, t.name?.en ?? '');
  }
}

// ---------------------------------------------------------------- pass 2: type dogma

/** typeID -> { primary, secondary, rank, req:[{skill,level}] } */
const dogma = new Map();
const WANT = new Set([ATTR.primary, ATTR.secondary, ATTR.rank, 182, 183, 184, 277, 278, 279]);

/* Passive skill -> hull-stat bonuses (CPU Management -> cpuOutput, Navigation ->
   maxVelocity, ...). CCP models each as a skill effect that carries a "bonus"
   attribute (cpuOutputBonus2 = 5) which a PostPercent modifier applies to the
   hull attribute, so the per-level value is simply that attribute's value on the
   skill. Only PostPercent modifiers (operation 6) onto a stat the UI shows are
   kept - that rules out count-style modifiers such as a turret slot. */
const skillMods = [];

for await (const d of jsonl(SDE('typeDogma.jsonl'))) {
  const id = d._key;
  if (!ships.has(id) && !skillNames.has(id)) continue;
  const rec = { primary: 0, secondary: 0, rank: 0, req: [], stats: null };
  const raw = new Map();
  for (const a of d.dogmaAttributes ?? []) {
    if (!WANT.has(a.attributeID) && !(ships.has(id) && STAT_BY_ATTR.has(a.attributeID))) continue;
    raw.set(a.attributeID, a.value);
  }
  rec.primary = raw.get(ATTR.primary) ?? 0;
  rec.secondary = raw.get(ATTR.secondary) ?? 0;
  rec.rank = raw.get(ATTR.rank) ?? 0;
  for (const skillAttr of [182, 183, 184]) {
    const sk = raw.get(skillAttr);
    if (!sk) continue;
    rec.req.push({ skill: sk, level: raw.get(REQ_LEVEL[skillAttr]) ?? 1 });
  }
  if (ships.has(id)) {
    const stats = {};
    for (const [attrId, key] of STAT_BY_ATTR) {
      const v = raw.get(attrId);
      if (v != null && v !== 0) stats[key] = v;
    }
    rec.stats = stats;
  } else if (skillNames.has(id)) {
    const own = new Map((d.dogmaAttributes ?? []).map(a => [a.attributeID, a.value]));
    for (const e of d.dogmaEffects ?? []) {
      for (const m of effectMods.get(e.effectID) ?? []) {
        if (m.domain !== 'shipID' || m.func !== 'ItemModifier' || m.skillTypeID || m.operation !== 6) continue;
        const key = STAT_BY_ATTR.get(m.modifiedAttributeID);
        const per = own.get(m.modifyingAttributeID);
        if (!key || per == null || per === 0) continue;
        skillMods.push({ skill: id, attr: key, op: m.operation, per });
      }
    }
  }
  dogma.set(id, rec);
}

// ---------------------------------------------------------------- skill graph

const needed = new Set();
const walkNeed = id => {
  if (needed.has(id)) return;
  needed.add(id);
  for (const q of dogma.get(id)?.req ?? []) walkNeed(q.skill);
};
for (const ship of ships.values()) {
  for (const p of dogma.get(ship.id)?.req ?? []) walkNeed(p.skill);
}
/* Mastery certificates name support skills (weapons, tanking, drones) that gate
   no hull, so they fall outside the walk above. A generated training plan still
   has to name and cost them, so pull in their prerequisite closure too. */
for (const perLevel of MASTERY_OF.values()) {
  for (const certIds of perLevel) {
    for (const certId of certIds) {
      for (const s of CERT_SKILLS.get(certId) ?? []) walkNeed(s.skill);
    }
  }
}

const depthCache = new Map();
function depthOf(id) {
  if (depthCache.has(id)) return depthCache.get(id);
  depthCache.set(id, 0); // cycle guard (should never trigger)
  const req = dogma.get(id)?.req ?? [];
  const d = req.length ? Math.max(...req.map(p => depthOf(p.skill) + 1)) : 0;
  depthCache.set(id, d);
  return d;
}
for (const id of needed) depthOf(id);

// "Hull" skills are those in the Spaceship Command lineage - they define the
// visible spine. Support skills (Gunnery, Mechanics, Drones...) are still
// carried (they are flight requirements) but never position a ship.
const SPACESHIP_COMMAND = [...skillNames.entries()].find(([, n]) => n === 'Spaceship Command')?.[0] ?? 3327;
const hullCache = new Map();
function isHullSkill(id) {
  if (hullCache.has(id)) return hullCache.get(id);
  hullCache.set(id, false); // cycle guard
  if (id === SPACESHIP_COMMAND) { hullCache.set(id, true); return true; }
  const req = dogma.get(id)?.req ?? [];
  const r = req.some(p => isHullSkill(p.skill));
  hullCache.set(id, r);
  return r;
}

const skillName = id => skillNames.get(id) ?? `skill ${id}`;

const skills = [...needed].sort((a, b) => depthOf(a) - depthOf(b) || skillName(a).localeCompare(skillName(b)))
  .map(id => {
    const d = dogma.get(id) ?? { primary: 0, secondary: 0, rank: 0, req: [] };
    return {
      id,
      name: skillName(id),
      depth: depthOf(id),
      rank: d.rank || null,
      primary: d.primary || null,
      secondary: d.secondary || null,
      primaryName: d.primary ? attrName.get(d.primary) ?? null : null,
      secondaryName: d.secondary ? attrName.get(d.secondary) ?? null : null,
      req: d.req.map(p => ({ skill: p.skill, level: p.level })),
      hull: isHullSkill(id),
    };
  });
const skillById = new Map(skills.map(s => [s.id, s]));

// ---------------------------------------------------------------- ships

const laneCounts = new Map();
const lanesShips = [];
const problems = [];

/* mastery profiles, built once per unique requirement set (they repeat a lot) */
const masteryProfiles = [];
const masteryProfileIndex = new Map();
function masteryProfileFor(shipId) {
  const perLevel = MASTERY_OF.get(shipId);
  if (!perLevel) return null;
  const levels = perLevel.map((certIds, i) => {
    const need = new Map();
    for (const certId of certIds) {
      for (const s of CERT_SKILLS.get(certId) ?? []) {
        const lvl = s[GRADES[i]] ?? 0;
        if (lvl > 0) need.set(s.skill, Math.max(need.get(s.skill) ?? 0, lvl));
      }
    }
    return [...need.entries()].sort((a, b) => a[0] - b[0]);
  });
  const key = JSON.stringify(levels);
  let idx = masteryProfileIndex.get(key);
  if (idx === undefined) {
    idx = masteryProfiles.length;
    masteryProfiles.push(levels);
    masteryProfileIndex.set(key, idx);
  }
  return idx;
}

for (const ship of ships.values()) {
  const d = dogma.get(ship.id) ?? { req: [] };
  // Special hulls skip faction routing entirely: they are grouped into their own
  // synthetic lane regardless of race/faction (many have no empire race at all).
  const lane = ship.special
    ? SPECIAL_LANE
    : ship.factionID && LANE_ORDER.has(ship.factionID)
      ? ship.factionID
      : RACE_TO_LANE[ship.raceID] ?? 0;
  if (!lane) {
    problems.push(`lane unmapped: ${ship.id} ${ship.name} (raceID ${ship.raceID}, factionID ${ship.factionID})`);
    continue;
  }
  if (!ROWS.has(ship.row)) {
    problems.push(`row missing: ${ship.id} ${ship.name} (shipTreeGroupID ${ship.row})`);
    continue;
  }
  const prereqs = d.req.map(p => ({ skill: p.skill, level: p.level, name: skillName(p.skill) }));
  // Alpha clone? every prerequisite must be trainable by an Alpha at that level.
  // omegaWhy names the first requirement that is out of Alpha reach.
  const blocker = prereqs.find(p => (ALPHA_CAPS[skillName(p.skill)] ?? 0) < p.level);
  const alpha = !blocker;
  // Gate = the most specific *hull* prerequisite, so a ship sits in the column
  // of the skill that actually grants the hull. Support skills never gate.
  const gate = prereqs.length
    ? prereqs
        .map(p => ({ p, hull: skillById.get(p.skill)?.hull ? 1 : 0, depth: skillById.get(p.skill)?.depth ?? -1 }))
        .sort((a, b) => b.hull - a.hull || b.depth - a.depth)[0].p
    : null;
  lanesShips.push({
    id: ship.id,
    name: ship.name,
    lane,
    row: ship.row,
    special: !!ship.special,
    tier: tierFrom(ship.metaGroupID, ship.techLevel),
    tags: TYPE_TAGS.get(ship.id) ?? [],
    prereqs,
    alpha,
    bp: bpNames.get(BP_BY_PRODUCT.get(ship.id)) || null,
    mastery: masteryProfileFor(ship.id),
    omegaWhy: blocker ? { skill: blocker.name, level: blocker.level, cap: ALPHA_CAPS[blocker.name] ?? 0 } : null,
    gate: gate ? gate.skill : null,
    gateDepth: gate ? skillById.get(gate.skill)?.depth ?? 0 : 0,
    volume: ship.volume,
    mass: ship.mass,
    capacity: ship.capacity,
    basePrice: ship.basePrice,
    metaLevel: ship.metaLevel,
    stats: dogma.get(ship.id)?.stats ?? {},
  });
  laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
}

// Ships in a lane that is a single stray data entry (the Jove "Capsule") are
// dropped rather than rendered as a one-ship lane.
const MIN_LANE_SHIPS = 2;
const laneSet = new Set(
  LANES.filter(l => (laneCounts.get(l.id) ?? 0) >= MIN_LANE_SHIPS).map(l => l.id),
);
const shipsOut = lanesShips.filter(s => laneSet.has(s.lane));
const lanesOut = LANES.filter(l => laneSet.has(l.id)).map(l => ({
  id: l.id,
  name: l.name || factionName.get(l.id) || l.short,
  short: l.short,
  color: l.color,
  count: laneCounts.get(l.id) ?? 0,
}));

const rowsUsed = [...new Set(shipsOut.map(s => s.row))].sort((a, b) => a - b);
const rowsOut = rowsUsed.map(id => ({ id, ...ROWS.get(id) }));

// ---------------------------------------------------------------- emit

/* Mastery profiles and ship bonuses are the bulk of the payload but are only
 * read when a hull is actually opened, so they ship as a second, lazily fetched
 * file. Hulls refer to them by POSITION, which means a stale details.json next
 * to a fresh shiptree.json would silently show the wrong mastery levels and the
 * wrong bonuses - so both files carry the same hash and the front end refuses a
 * mismatched pair. */

/* Bonus sets repeat heavily - 194 distinct role-bonus sets and 385 distinct
   hull-bonus sets across 423 hulls - so each list is deduped on its own and a
   hull just holds the two indexes. Deduping the {role, ship} PAIR instead was
   tried first and collapsed to nearly one profile per hull, i.e. no dedup at
   all, because the hull-bonus half is near-unique per ship. The skill each
   hull-bonus group scales with is carried as an id only - the names already live
   in skills[] in shiptree.json. */
function bonusPayload(shipIds) {
  const roleSets = [];
  const shipSets = [];
  const roleIndex = new Map();
  const shipIndex = new Map();
  const shipBonus = {};
  let roleLines = 0;
  let shipLines = 0;
  for (const id of shipIds) {
    const b = bonusesFor(id);
    if (!b) continue;
    roleLines += b.role.length;
    for (const g of b.ship) shipLines += g.lines.length;

    const rk = JSON.stringify(b.role);
    let ri = roleIndex.get(rk);
    if (ri === undefined) {
      ri = roleSets.length;
      roleSets.push(b.role);
      roleIndex.set(rk, ri);
    }
    const sk = JSON.stringify(b.ship);
    let si = shipIndex.get(sk);
    if (si === undefined) {
      si = shipSets.length;
      shipSets.push(b.ship);
      shipIndex.set(sk, si);
    }
    shipBonus[id] = [ri, si];
  }
  return {
    bonusRoleSets: roleSets,
    bonusShipSets: shipSets,
    shipBonus,
    bonusCounts: {
      roleSets: roleSets.length,
      shipSets: shipSets.length,
      roleLines,
      shipLines,
    },
  };
}

const shipIds = shipsOut.map(s => s.id);
const detailsBody = {
  masteryProfiles,
  // mastery profiles are shared between hulls; `masterySkills` names every skill
  // they reference (some of which no hull requires directly)
  masterySkills: Object.fromEntries(
    [...new Set(masteryProfiles.flat(2).map(([id]) => id))].map(id => [id, skillName(id)]),
  ),
  // hull flavour text, only for hulls that actually have some. Read off the
  // working `ships` map, not shipsOut - shipsOut lists its fields explicitly so
  // the 188 KB of lore never reaches the eager shiptree.json.
  descriptions: Object.fromEntries(
    shipsOut.filter(s => ships.get(s.id)?.description).map(s => [s.id, ships.get(s.id).description]),
  ),
  // passive skill -> hull-stat modifiers, applied by the stats tab when we know
  // the pilot's levels; tiny, and only read once a hull is open
  skillMods: skillMods.slice().sort((a, b) => a.skill - b.skill || a.attr.localeCompare(b.attr)),
  ...bonusPayload(shipIds),
};
const detailsHash = crypto.createHash('sha1')
  .update(JSON.stringify(detailsBody)).digest('hex').slice(0, 16);

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    sdeBuild: readBuildNumber(),
    detailsHash,
    detailsFile: path.basename(CONFIG.detailsOutput),
    counts: {
      ships: shipsOut.length,
      skills: skills.length,
      rows: rowsOut.length,
      lanes: lanesOut.length,
      maxSkillDepth: skills.reduce((m, s) => Math.max(m, s.depth), 0),
      masteryProfiles: masteryProfiles.length,
    },
  },
  lanes: lanesOut,
  rows: rowsOut,
  skills,
  ships: shipsOut,
};

const detailsPayload = {
  meta: { detailsHash, profiles: masteryProfiles.length, ...detailsBody.bonusCounts },
  ...detailsBody,
};

function readBuildNumber() {
  try {
    const p = SDE('_sde.jsonl');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')).buildNumber ?? null;
  } catch { return null; }
}

const kb = p => `${(fs.statSync(p).size / 1024).toFixed(1)} KB`;
fs.mkdirSync(path.dirname(CONFIG.output), { recursive: true });
fs.mkdirSync(path.dirname(CONFIG.detailsOutput), { recursive: true });
fs.writeFileSync(CONFIG.output, JSON.stringify(payload), 'utf8');
fs.writeFileSync(CONFIG.detailsOutput, JSON.stringify(detailsPayload), 'utf8');

// ---------------------------------------------------------------- report

if (!QUIET) {
  const c = payload.meta.counts;
  console.log(`
wrote ${path.relative(process.cwd(), CONFIG.output)} (${kb(CONFIG.output)})
wrote ${path.relative(process.cwd(), CONFIG.detailsOutput)} (${kb(CONFIG.detailsOutput)}, lazy — fetched after first paint)
  details hash    ${detailsHash}
  bonus profiles  ${detailsBody.bonusCounts.roleSets} role sets + ${detailsBody.bonusCounts.shipSets} hull sets (${detailsBody.bonusCounts.roleLines} + ${detailsBody.bonusCounts.shipLines} lines)
  types scanned   ${scannedTypes}
  ships           ${c.ships}
  skills          ${c.skills}
  hull rows       ${c.rows}
  lanes           ${c.lanes}
  max skill depth ${c.maxSkillDepth}
  skill modifiers ${skillMods.length}

lanes:`);
  for (const l of lanesOut) {
    const names = shipsOut.filter(s => s.lane === l.id).map(s => s.name);
    console.log(`   ${String(l.count).padStart(4)}  ${l.short} (${l.id}) — ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''}`);
  }
  console.log('\nhull rows:');
  for (const r of rowsOut) console.log(`   ${String(r.id).padStart(4)}  ${r.name.padEnd(28)} [${r.tags.join(', ')}]`);
  const hullSkills = skills.filter(s => s.hull);
  const supportSkills = skills.filter(s => !s.hull);
  console.log(`\nskills: ${skills.length} total — ${hullSkills.length} hull / ${supportSkills.length} support`);
  console.log('support skills:', supportSkills.map(s => s.name).join(', '));
  console.log('\nhull skill spine:');
  for (const s of hullSkills) {
    console.log(`   d${s.depth} ${s.name.padEnd(34)} rank ${String(s.rank ?? '?').padStart(4)}  req: ${s.req.map(r => `${skillName(r.skill)} ${r.level}`).join(', ') || '-'}`);
  }
  const gateDepth = new Map();
  for (const s of shipsOut) gateDepth.set(s.gateDepth, (gateDepth.get(s.gateDepth) ?? 0) + 1);
  console.log('\nships by gate depth:', [...gateDepth.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `d${d}=${n}`).join('  '));
  const tiers = {};
  for (const s of shipsOut) tiers[s.tier || 'none'] = (tiers[s.tier || 'none'] ?? 0) + 1;
  console.log('tiers:', JSON.stringify(tiers));
  const alpha = shipsOut.filter(s => s.alpha).length;
  console.log(`clone state: ${alpha} alpha-flyable / ${shipsOut.length - alpha} omega-only`);
  const omegaClasses = {};
  for (const s of shipsOut) if (!s.alpha) omegaClasses[ROWS.get(s.row)?.name ?? s.row] = (omegaClasses[ROWS.get(s.row)?.name ?? s.row] ?? 0) + 1;
  console.log('omega-only by class:', Object.entries(omegaClasses).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(' | '));
  if (problems.length) console.log(`\nPROBLEMS (${problems.length}):\n` + problems.slice(0, 30).join('\n'));
  else console.log('\nno problems found');
}
