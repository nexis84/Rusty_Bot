const fs = require('fs');
const https = require('https');

// Simple HTTPS request helper
function httpsRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllSkills() {
    const SKILLS = {};
    const SKILL_CATEGORIES = {};
    
    console.log('Fetching skill categories from ESI...');
    
    try {
        // Category 16 is Skills
        console.log('Fetching skill groups (category 16)...');
        const skillCategory = await httpsRequest('https://esi.evetech.net/latest/universe/categories/16/');
        
        console.log(`Found ${skillCategory.groups.length} skill groups`);
        
        // Process each skill group
        for (let i = 0; i < skillCategory.groups.length; i++) {
            const groupId = skillCategory.groups[i];
            try {
                console.log(`[${i + 1}/${skillCategory.groups.length}] Fetching group ${groupId}...`);
                const group = await httpsRequest(`https://esi.evetech.net/latest/universe/groups/${groupId}/`);
                
                const categoryName = group.name;
                console.log(`  -> ${categoryName} (${group.types.length} skills)`);
                
                // Store category info
                SKILL_CATEGORIES[categoryName] = {
                    id: groupId,
                    skills: []
                };
                
                // Fetch each skill type (limit to avoid rate limiting)
                for (const typeId of group.types) {
                    try {
                        await sleep(100); // Rate limiting
                        const type = await httpsRequest(`https://esi.evetech.net/latest/universe/types/${typeId}/`);
                        
                        const skillId = type.type_id;
                        const skillName = type.name;
                        const description = type.description || '';
                        
                        // Extract rank and attributes
                        let rank = 1;
                        let primary = 'int';
                        let secondary = 'mem';
                        
                        if (type.dogma_attributes) {
                            const rankAttr = type.dogma_attributes.find(a => a.attribute_id === 275);
                            if (rankAttr) rank = rankAttr.value;
                            
                            const primaryAttr = type.dogma_attributes.find(a => a.attribute_id === 180);
                            const secondaryAttr = type.dogma_attributes.find(a => a.attribute_id === 181);
                            
                            const attrMap = {
                                164: 'int', 165: 'mem', 166: 'cha', 167: 'per', 168: 'will'
                            };
                            
                            if (primaryAttr) primary = attrMap[primaryAttr.value] || 'int';
                            if (secondaryAttr) secondary = attrMap[secondaryAttr.value] || 'mem';
                        }
                        
                        SKILLS[skillId] = {
                            name: skillName,
                            group: categoryName,
                            rank: rank,
                            primary: primary,
                            secondary: secondary,
                            desc: description.substring(0, 150).replace(/\n/g, ' ')
                        };
                        
                        SKILL_CATEGORIES[categoryName].skills.push(skillId);
                        
                    } catch (e) {
                        console.warn(`    Failed to fetch type ${typeId}: ${e.message}`);
                    }
                }
                
            } catch (e) {
                console.warn(`  Failed to fetch group ${groupId}: ${e.message}`);
            }
        }
        
        // Generate output
        console.log('\n=== COMPLETE ===');
        console.log(`Total skills: ${Object.keys(SKILLS).length}`);
        console.log(`Categories: ${Object.keys(SKILL_CATEGORIES).length}`);
        
        // Save to JSON file
        const output = {
            SKILLS,
            SKILL_CATEGORIES
        };
        
        fs.writeFileSync('all-skills.json', JSON.stringify(output, null, 2));
        console.log('\nSaved to all-skills.json');
        
        // Also generate JavaScript file
        let jsContent = '// Auto-generated from ESI\n\nconst SKILLS = {\n';
        
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
        console.error('Failed:', error);
    }
}

fetchAllSkills();
