#!/usr/bin/env node
// Builds data/npc-data.js for the Rusty NPC Tracker from the local EVE SDE.
//
// Usage (from this folder):
//   node build-data.mjs                 -> reads ../sde (the site's SDE folder)
//   node build-data.mjs --sde <dir>     -> reads a custom SDE folder
//
// Sources:
//   typeDogma.jsonl       attributeID 481 = entityKillBounty (raw ISK bounty per NPC type)
//   types.jsonl           type names + groupIDs
//   groups.jsonl          group names ("Deadspace Guristas Battleship" etc.)
//   mapSolarSystems.jsonl system names + security status + regionID
//   mapRegions.jsonl      region names
//   _sde.jsonl            SDE build number / release date
//
// Output: data/npc-data.js  (committed; re-run when the SDE updates)

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const sdeFlag = args.indexOf('--sde');
const SDE_DIR = path.resolve(__dirname, sdeFlag !== -1 && args[sdeFlag + 1] ? args[sdeFlag + 1] : path.join(__dirname, '..', 'sde'));
const OUT_FILE = path.join(__dirname, 'data', 'npc-data.js');

const BOUNTY_ATTR = 481;

// Coarse faction classification for the UI filter; matched against group name + NPC name.
// Order matters (first match wins, case-insensitive).
const FACTION_RULES = [
    ['Guristas', /guristas|dread guristas|\bpith|pithatis|pithum|pithi\b/i],
    ['Angel Cartel', /angel cartel|\bgist|domination|arch angel|angel\b/i],
    ['Sansha\u2019s Nation', /sansha|centus|centatis|centum|centii|centi\b|true sansha|true cent/i],
    ['Blood Raiders', /blood raider|blood|corpum|corpatis|corpus|corpii|corpior|elder blood|dark blood/i],
    ['Serpentis', /serpentis|\bcorelum|corelatis|coreli\b|core admiral|core rear|core flotilla|shadow serpentis/i],
    ['Rogue Drones', /rogue drone|\bdrone\b|infester|strain|alvum|alvatis|atomizer|defeater|devourer|disintegrator|annihilator/i],
    ['Triglavian Collective', /triglavian|dazh|vila|\bvedmak|\bkikimora|\bdrekavac|\brodvia|goro|zorya|stribog|svarog/i],
    ['Drifters', /drifter|seeker|apollo|artemis|hunter|libra/i],
    ['Sleepers', /sleeper|awakened|emerged|deviant|\bnt\b/i],
    ['Mordu\u2019s Legion', /mordu/i],
    ['EDENCOM', /edencom|stormbringer|thunderchild|skybreaker|enforcer|vedmak/i],
    ['CONCORD', /concord|police|dreadnought armageddon/i],
    ['Tetrimon', /tetrimon|order of/i],
    ['Amarr Empire', /amarr (imperial )?(navy|empire)|imperial navy|amarr navy/i],
    ['Caldari State', /caldari (state|navy)|caldari navy/i],
    ['Gallente Federation', /gallente (federation|navy)|gallente navy/i],
    ['Minmatar Republic', /minmatar (republic|navy)|republic fleet|republic navy/i],
    ['ORE', /ore syndicate|\bore\b|outer ring/i],
    ['Thukker Tribe', /thukker/i],
    ['Guristas Insurgency', /guristas insurgency/i],
    ['Frostline', /frostline/i],
    ['Deathglow', /deathglow/i],
    ['Dragonaurs', /dragonaurs/i],
    ['Focused Hostiles', /focused/i],
    ['Mercenaries', /mercenary|mercenaries|smuggler/i],
    ['Ransomers', /ransomer/i],
];

function enName(v) {
    if (!v) return '';
    return (typeof v === 'string' ? v : v.en || '').trim();
}

function classifyFaction(groupName, ratName) {
    const hay = (groupName + ' ' + ratName);
    for (const [label, re] of FACTION_RULES) {
        if (re.test(hay)) return label;
    }
    return 'Other';
}

async function eachLine(file, fn) {
    const full = path.join(SDE_DIR, file);
    if (!fs.existsSync(full)) throw new Error('Missing SDE file: ' + full);
    const rl = readline.createInterface({
        input: fs.createReadStream(full, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });
    let n = 0;
    for await (const line of rl) {
        if (line) { fn(line, n++); }
    }
}

function log(...a) { console.log(...a); }

(async function main() {
    log('Rusty NPC Tracker — building data from SDE:', SDE_DIR);

    // 1. SDE build info
    let buildInfo = { buildNumber: 0, releaseDate: '' };
    await eachLine('_sde.jsonl', (line) => {
        try {
            const j = JSON.parse(line);
            if (j.buildNumber) buildInfo = { buildNumber: j.buildNumber, releaseDate: j.releaseDate || '' };
        } catch (e) { /* ignore */ }
    });
    log('  SDE build', buildInfo.buildNumber, buildInfo.releaseDate);

    // 2. Bounties: typeId -> bounty (attribute 481 > 0)
    const bountyByType = new Map();
    await eachLine('typeDogma.jsonl', (line) => {
        if (line.indexOf('"attributeID": 481') === -1) return;
        let j;
        try { j = JSON.parse(line); } catch (e) { return; }
        const id = j._key;
        for (const a of (j.dogmaAttributes || [])) {
            if (a.attributeID === BOUNTY_ATTR && a.value > 0) {
                bountyByType.set(id, a.value);
            }
        }
    });
    log('  types with bounty:', bountyByType.size);

    // 3. NPC names + groups (types.jsonl is big — stream and filter)
    const ratsRaw = [];
    await eachLine('types.jsonl', (line) => {
        // cheap pre-filter: only parse lines for wanted type ids
        const keyMatch = /^\{"_key": (\d+),/.exec(line);
        if (!keyMatch) return;
        const id = parseInt(keyMatch[1], 10);
        const bounty = bountyByType.get(id);
        if (bounty === undefined) return;
        let j;
        try { j = JSON.parse(line); } catch (e) { return; }
        const name = enName(j.name);
        if (!name) return;
        ratsRaw.push({ id, name, bounty, groupID: j.groupID || 0 });
    });
    log('  NPC rats resolved:', ratsRaw.length);

    // 4. Group names for referenced groups only
    const wantedGroups = new Set(ratsRaw.map((r) => r.groupID));
    const groupNames = new Map();
    await eachLine('groups.jsonl', (line) => {
        const keyMatch = /^\{"_key": (\d+),/.exec(line);
        if (!keyMatch) return;
        const id = parseInt(keyMatch[1], 10);
        if (!wantedGroups.has(id)) return;
        let j;
        try { j = JSON.parse(line); } catch (e) { return; }
        groupNames.set(id, enName(j.name));
    });
    log('  groups resolved:', groupNames.size);

    // 5. Systems + regions
    const systems = [];
    const wantedRegions = new Set();
    await eachLine('mapSolarSystems.jsonl', (line) => {
        let j;
        try { j = JSON.parse(line); } catch (e) { return; }
        const name = enName(j.name);
        if (!name) return;
        const sec = typeof j.securityStatus === 'number' ? Math.round(j.securityStatus * 100) / 100 : 0;
        const regionID = j.regionID || 0;
        wantedRegions.add(regionID);
        systems.push([name, sec, regionID]);
    });
    const regionNames = new Map();
    await eachLine('mapRegions.jsonl', (line) => {
        let j;
        try { j = JSON.parse(line); } catch (e) { return; }
        if (!wantedRegions.has(j._key)) return;
        regionNames.set(j._key, enName(j.name));
    });
    log('  systems:', systems.length, ' regions:', regionNames.size);

    // 6. Build faction list + assign indexes
    const factionIndex = new Map();
    factionIndex.set('Other', 0);
    const factions = ['Other'];
    function fidx(label) {
        if (!factionIndex.has(label)) { factionIndex.set(label, factions.length); factions.push(label); }
        return factionIndex.get(label);
    }

    // 7. Compose compact records
    // rat: [typeId, name, bounty, groupId, factionIdx, secNorm? no]
    ratsRaw.sort((a, b) => (b.bounty - a.bounty) || a.name.localeCompare(b.name));
    const rats = ratsRaw.map((r) => [
        r.id,
        r.name,
        r.bounty,
        r.groupID,
        fidx(classifyFaction(groupNames.get(r.groupID) || '', r.name)),
    ]);

    const groupsOut = {};
    for (const [id, name] of groupNames) groupsOut[id] = name;

    // system: [name, sec, regionIdx]
    const regionIndex = new Map();
    const regionsOut = [];
    for (const [id, name] of [...regionNames.entries()].sort((a, b) => a[0] - b[0])) {
        regionIndex.set(id, regionsOut.length);
        regionsOut.push(name || 'Unknown');
    }
    const systemsOut = systems.map(([name, sec, regionID]) => [
        name,
        sec,
        regionIndex.has(regionID) ? regionIndex.get(regionID) : -1,
    ]);
    systemsOut.sort((a, b) => a[0].localeCompare(b[0]));

    // 8. Write output
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    const payload = {
        sde: { build: buildInfo.buildNumber, date: (buildInfo.releaseDate || '').slice(0, 10) },
        factions,
        groups: groupsOut,
        regions: regionsOut,
        rats,
        systems: systemsOut,
    };
    const js = '// Generated by build-data.mjs — do not edit by hand.\n' +
        '// Source: EVE SDE build ' + payload.sde.build + ' (' + payload.sde.date + ')\n' +
        'window.RUSTY_NPC_DATA = ' + JSON.stringify(payload) + ';\n';
    fs.writeFileSync(OUT_FILE, js, 'utf8');
    log('Wrote', OUT_FILE, '(' + (fs.statSync(OUT_FILE).size / 1024).toFixed(0) + ' KB)');
    log('Done.');
})().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
