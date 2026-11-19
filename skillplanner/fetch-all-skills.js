const fs = require('fs');
const path = require('path');

// Build the skill database from the local SDE JSONL files (pulled from the
// SDE API at sde.evetech.net by the refresh pipeline). ESI's /universe
// categories/groups/types routes were removed with compatibility date
// 2026-11-19, so the old per-record ESI walk no longer works — and the SDE
// files already contain everything it produced.
//
// Equivalent to scripts/generate_skillplanner_data.py, kept as a Node
// one-liner runner. Writes all-skills.json + all-skills.txt.

const SDE_DIR = path.resolve(__dirname, '..', 'sde');

function readJsonl(filename) {
    const file = path.join(SDE_DIR, filename);
    if (!fs.existsSync(file)) {
        throw new Error(`Missing ${filename} in ${SDE_DIR} — run refresh-sde.ps1 (or "SDE updater\\update-sde.mjs") first.`);
    }
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
    return lines.map(line => JSON.parse(line));
}

const SKILL_CATEGORY_ID = 16;

// Dogma attribute IDs used below: 275 = skill rank, 180 = primary training
// attribute, 181 = secondary training attribute. Attribute values are the
// character attribute IDs: 164 int, 165 mem, 166 cha, 167 per, 168 will.
const ATTR_MAP = { 164: 'int', 165: 'mem', 166: 'cha', 167: 'per', 168: 'will' };

function buildSkills() {
    const SKILLS = {};
    const SKILL_CATEGORIES = {};

    const groups = readJsonl('groups.jsonl');
    const types = readJsonl('types.jsonl');
    const typeDogma = readJsonl('typeDogma.jsonl');

    const skillGroups = new Map();
    for (const g of groups) {
        if (g.categoryID === SKILL_CATEGORY_ID && g.published !== false) {
            skillGroups.set(g._key, (g.name && g.name.en) || `Group ${g._key}`);
        }
    }

    const dogmaByType = new Map();
    for (const d of typeDogma) dogmaByType.set(d._key, d.dogmaAttributes || []);

    for (const t of types) {
        const groupName = skillGroups.get(t.groupID);
        if (!groupName) continue;
        if (t.published !== true) continue;
        const skillName = (t.name && t.name.en) || '';
        if (!skillName) continue;

        let rank = 1;
        let primary = 'int';
        let secondary = 'mem';
        const dogma = dogmaByType.get(t._key) || [];
        const rankAttr = dogma.find(a => a.attributeID === 275);
        if (rankAttr) rank = rankAttr.value;
        const primaryAttr = dogma.find(a => a.attributeID === 180);
        const secondaryAttr = dogma.find(a => a.attributeID === 181);
        if (primaryAttr) primary = ATTR_MAP[primaryAttr.value] || 'int';
        if (secondaryAttr) secondary = ATTR_MAP[secondaryAttr.value] || 'mem';

        const description = ((t.description && t.description.en) || '');

        SKILLS[t._key] = {
            name: skillName,
            group: groupName,
            rank: rank,
            primary: primary,
            secondary: secondary,
            desc: description.substring(0, 150).replace(/\n/g, ' ')
        };

        if (!SKILL_CATEGORIES[groupName]) SKILL_CATEGORIES[groupName] = { id: t.groupID, skills: [] };
        SKILL_CATEGORIES[groupName].skills.push(t._key);
    }

    return { SKILLS, SKILL_CATEGORIES };
}

try {
    const { SKILLS, SKILL_CATEGORIES } = buildSkills();

    console.log(`Total skills: ${Object.keys(SKILLS).length}`);
    console.log(`Categories: ${Object.keys(SKILL_CATEGORIES).length}`);

    // Save to JSON file
    const output = { SKILLS, SKILL_CATEGORIES };
    fs.writeFileSync('all-skills.json', JSON.stringify(output, null, 2));
    console.log('\nSaved to all-skills.json');

    // Also generate JavaScript file
    let jsContent = '// Auto-generated from the EVE SDE\n\nconst SKILLS = {\n';

    for (const [id, skill] of Object.entries(SKILLS)) {
        jsContent += `    ${id}: { name: '${skill.name.replace(/'/g, "\\'")}', group: '${skill.group}', rank: ${skill.rank}, primary: '${skill.primary}', secondary: '${skill.secondary}', desc: '${skill.desc.replace(/'/g, "\\'")}' },\n`;
    }

    jsContent += '};\n\n';

    jsContent += 'const SKILL_CATEGORIES = {\n';
    for (const [name, cat] of Object.entries(SKILL_CATEGORIES)) {
        jsContent += `    '${name}': { id: ${cat.id}, skills: [${cat.skills.join(', ')}] },\n`;
    }
    jsContent += '};\n';

    fs.writeFileSync('all-skills.txt', jsContent);
    console.log('Saved to all-skills.txt');
} catch (error) {
    console.error('Failed:', error.message);
    process.exitCode = 1;
}
