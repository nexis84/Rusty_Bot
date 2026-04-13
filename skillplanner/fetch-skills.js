// Fetch all EVE skills from ESI and generate skills-data.js content
async function fetchAllSkills() {
    const SKILLS = {};
    const SKILL_CATEGORIES = {};
    
    console.log('Fetching skill categories from ESI...');
    
    try {
        // Get all type categories
        const categoriesRes = await fetch('https://esi.evetech.net/latest/universe/categories/');
        const categories = await categoriesRes.json();
        
        // Category 16 is Skills
        console.log('Fetching skill groups (category 16)...');
        const skillCategoryRes = await fetch('https://esi.evetech.net/latest/universe/categories/16/');
        const skillCategory = await skillCategoryRes.json();
        
        console.log(`Found ${skillCategory.groups.length} skill groups`);
        
        // Fetch each skill group to get skill type IDs
        for (const groupId of skillCategory.groups) {
            try {
                const groupRes = await fetch(`https://esi.evetech.net/latest/universe/groups/${groupId}/`);
                const group = await groupRes.json();
                
                const categoryName = group.name;
                console.log(`Processing ${categoryName} (${group.types.length} skills)...`);
                
                // Store category info
                SKILL_CATEGORIES[categoryName] = {
                    id: groupId,
                    skills: []
                };
                
                // Fetch each skill type
                for (const typeId of group.types) {
                    try {
                        const typeRes = await fetch(`https://esi.evetech.net/latest/universe/types/${typeId}/`);
                        const type = await typeRes.json();
                        
                        // Extract skill info
                        const skillId = type.type_id;
                        const skillName = type.name;
                        const description = type.description || '';
                        
                        // Extract rank and attributes from dogma attributes if available
                        let rank = 1;
                        let primary = 'int';
                        let secondary = 'mem';
                        
                        if (type.dogma_attributes) {
                            const rankAttr = type.dogma_attributes.find(a => a.attribute_id === 275); // skillRank
                            if (rankAttr) rank = rankAttr.value;
                            
                            const primaryAttr = type.dogma_attributes.find(a => a.attribute_id === 180); // primaryAttribute
                            const secondaryAttr = type.dogma_attributes.find(a => a.attribute_id === 181); // secondaryAttribute
                            
                            if (primaryAttr) {
                                const attrMap = {
                                    164: 'int', // intelligence
                                    165: 'mem', // memory
                                    166: 'cha', // charisma
                                    167: 'per', // perception
                                    168: 'will' // willpower
                                };
                                primary = attrMap[primaryAttr.value] || 'int';
                            }
                            
                            if (secondaryAttr) {
                                const attrMap = {
                                    164: 'int',
                                    165: 'mem',
                                    166: 'cha',
                                    167: 'per',
                                    168: 'will'
                                };
                                secondary = attrMap[secondaryAttr.value] || 'mem';
                            }
                        }
                        
                        SKILLS[skillId] = {
                            name: skillName,
                            group: categoryName,
                            rank: rank,
                            primary: primary,
                            secondary: secondary,
                            desc: description.substring(0, 100) // Truncate for brevity
                        };
                        
                        SKILL_CATEGORIES[categoryName].skills.push(skillId);
                        
                    } catch (e) {
                        console.warn(`Failed to fetch type ${typeId}:`, e.message);
                    }
                    
                    // Rate limiting - don't hammer ESI
                    await new Promise(r => setTimeout(r, 50));
                }
                
            } catch (e) {
                console.warn(`Failed to fetch group ${groupId}:`, e.message);
            }
        }
        
        // Generate output
        console.log('\n=== GENERATED SKILLS DATA ===\n');
        console.log(`Total skills: ${Object.keys(SKILLS).length}`);
        console.log(`Categories: ${Object.keys(SKILL_CATEGORIES).length}`);
        
        // Save to file (in browser console, copy this output)
        window.SKILLS_DATA = { SKILLS, SKILL_CATEGORIES };
        console.log('Skills data stored in window.SKILLS_DATA');
        
        return { SKILLS, SKILL_CATEGORIES };
        
    } catch (error) {
        console.error('Failed to fetch skills:', error);
        return null;
    }
}

// Run it
fetchAllSkills().then(data => {
    if (data) {
        console.log('\nSuccess! Use window.SKILLS_DATA to access the data.');
    }
});
