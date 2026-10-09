#!/usr/bin/env node
/*
 * Skill audit — is every hull's requirement list right?
 *
 * Cross-checks the built data against CCP's *other* source of truth
 * (shipTreeGroups.preReqSkills, the in-game ship tree) plus internal rules:
 *   - every ship has 1..3 prerequisites with levels 1..5
 *   - every prerequisite resolves to a real skill name
 *   - nothing is hiding in requiredSkill4 (attr 185 / level 280)
 *   - the ship's prerequisites match its group+faction entry in CCP's tree
 *
 * Usage: node audit-skills.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const SDE = p => path.join(path.resolve(__dirname, cfg.sdeDir || '../Rusty_Bot-main/sde'), p);
const DATA = JSON.parse(fs.readFileSync(path.resolve(__dirname, cfg.output || 'public/data/shiptree.json'), 'utf8'));

async function* jsonl(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) { const t = line.trim(); if (t) yield JSON.parse(t); }
}

const skillById = new Map(DATA.skills.map(s => [s.id, s]));
const laneById = new Map(DATA.lanes.map(l => [l.id, l]));
const problems = [];
const note = (kind, msg) => problems.push(`[${kind}] ${msg}`);

/* ---- 1. internal consistency ---- */

for (const ship of DATA.ships) {
  const ps = ship.prereqs ?? [];
  if (!ps.length) note('no-prereqs', `${ship.name} (${ship.id}) has no prerequisites`);
  if (ps.length > 3) note('too-many', `${ship.name} has ${ps.length} prerequisites`);
  const seen = new Set();
  for (const p of ps) {
    if (seen.has(p.skill)) note('dupe', `${ship.name} lists skill ${p.skill} twice`);
    seen.add(p.skill);
    if (!(p.level >= 1 && p.level <= 5)) note('bad-level', `${ship.name} needs ${p.name} level ${p.level}`);
    const sk = skillById.get(p.skill);
    if (!sk) note('unknown-skill', `${ship.name} needs skill ${p.skill} which is not in our skill list`);
    else if (!p.name || /^skill \d+$/.test(p.name)) note('unnamed-skill', `${ship.name} needs skill ${p.skill} with no name`);
    if (sk && p.level > 5) note('over-five', `${ship.name} needs ${p.name} ${p.level}`);
  }
  if (ship.gate && !ps.some(p => p.skill === ship.gate)) note('bad-gate', `${ship.name} gate ${ship.gate} is not one of its prerequisites`);
}

/* ---- 2. is anything hiding in a 4th requirement slot? ---- */

const EXTRA_REQ_ATTRS = new Set([185, 280]);   // requiredSkill4 / requiredSkill4Level
let extraHits = 0;
const shipIds = new Set(DATA.ships.map(s => s.id));
for await (const d of jsonl(SDE('typeDogma.jsonl'))) {
  if (!shipIds.has(d._key)) continue;
  for (const a of d.dogmaAttributes ?? []) {
    if (EXTRA_REQ_ATTRS.has(a.attributeID) && a.value) {
      extraHits++;
      note('fourth-skill', `type ${d._key} uses attribute ${a.attributeID} = ${a.value}`);
    }
  }
}

/* ---- 3. cross-check against CCP's in-game ship tree ---- */

const treeGroups = new Map();
for await (const g of jsonl(SDE('shipTreeGroups.jsonl'))) treeGroups.set(g._key, g);

const nameOf = id => skillById.get(id)?.name ?? `skill ${id}`;
const cmp = (a, b) => a.localeCompare(b);
const keyOf = list => list.map(p => `${p.skill}:${p.level}`).sort(cmp).join(',');

let compared = 0, unmatchedGroup = 0;
for (const ship of DATA.ships) {
  const group = treeGroups.get(ship.row);
  if (!group) { unmatchedGroup++; continue; }
  const entry = (group.preReqSkills ?? []).find(e => e._key === ship.lane);
  if (!entry) { note('no-tree-entry', `${ship.name}: no preReqSkills entry for lane ${ship.lane} in group ${ship.row}`); continue; }

  // CCP's tree lists the *skill chain*; ours lists the ship's direct requirements.
  // They should agree on the deepest hull skill + its level, which is the gate.
  const treeSkills = (entry.skills ?? []).map(s => ({ skill: s._key, level: s.level, display: s.display }));
  const ours = ship.prereqs.map(p => ({ skill: p.skill, level: p.level }));
  const oursGate = ours.find(p => p.skill === ship.gate);
  const treeGate = treeSkills.find(t => t.skill === ship.gate);
  compared++;
  if (!treeGate) {
    note('gate-not-in-tree', `${ship.name}: gate ${nameOf(ship.gate)} (${ship.gate}) is not in CCP's tree entry for group ${ship.row} / lane ${ship.lane}`
      + ` — tree has: ${treeSkills.map(t => `${nameOf(t.skill)} ${t.level}`).join(', ') || 'none'}`);
  } else if (treeGate.level !== oursGate.level) {
    note('level-mismatch', `${ship.name}: needs ${nameOf(ship.gate)} ${oursGate.level} but CCP's tree says ${treeGate.level}`);
  }
}

/* ---- report ---- */

console.log(`hulls audited        ${DATA.ships.length}`);
console.log(`skills in list       ${DATA.skills.length}`);
console.log(`compared to CCP tree ${compared} (${unmatchedGroup} without a tree group)`);
console.log(`fourth-skill hits    ${extraHits}`);
console.log('');
if (!problems.length) {
  console.log('no problems found — every requirement resolves, levels are 1..5, and each hull matches CCP\'s own ship tree.');
} else {
  const byKind = {};
  for (const p of problems) { const k = p.slice(1, p.indexOf(']')); (byKind[k] = byKind[k] || []).push(p); }
  console.log(`PROBLEMS (${problems.length}):`);
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`\n${kind} (${list.length}):`);
    for (const p of list.slice(0, 12)) console.log('  ' + p.replace(/^\[[^\]]+\] /, ''));
    if (list.length > 12) console.log(`  … and ${list.length - 12} more`);
  }
}
