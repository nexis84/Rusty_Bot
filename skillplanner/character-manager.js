// Character Manager Module
// Handles fetching and caching character data from ESI

class CharacterManager {
    constructor() {
        this.characters = this.loadCharacters();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    // Load character data from localStorage
    loadCharacters() {
        const stored = localStorage.getItem('character_data');
        return stored ? JSON.parse(stored) : {};
    }

    // Save character data to localStorage
    saveCharacters() {
        localStorage.setItem('character_data', JSON.stringify(this.characters));
    }

    // Check if cache is valid
    isCacheValid(characterId, dataType) {
        const char = this.characters[characterId];
        if (!char || !char.cache) return false;
        
        const cache = char.cache[dataType];
        if (!cache) return false;
        
        return Date.now() - cache.timestamp < this.cacheExpiry;
    }

    // Get cached data or null
    getCachedData(characterId, dataType) {
        if (this.isCacheValid(characterId, dataType)) {
            return this.characters[characterId].cache[dataType].data;
        }
        return null;
    }

    // Set cached data
    setCachedData(characterId, dataType, data) {
        if (!this.characters[characterId]) {
            this.characters[characterId] = {};
        }
        if (!this.characters[characterId].cache) {
            this.characters[characterId].cache = {};
        }
        
        this.characters[characterId].cache[dataType] = {
            data: data,
            timestamp: Date.now()
        };
        
        this.saveCharacters();
    }

    // Fetch character public info
    async fetchCharacterInfo(characterId) {
        const cached = this.getCachedData(characterId, 'info');
        if (cached) return cached;
        
        const data = await esiAuth.esiFetch(`/characters/${characterId}/`);
        
        // Store basic info
        if (!this.characters[characterId]) {
            this.characters[characterId] = {};
        }
        this.characters[characterId].info = data;
        this.setCachedData(characterId, 'info', data);
        
        return data;
    }

    // Fetch character portrait URL
    getPortraitUrl(characterId, size = 128) {
        return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
    }

    // Fetch character skills
    async fetchSkills(characterId) {
        const cached = this.getCachedData(characterId, 'skills');
        if (cached) return cached;
        
        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/skills/`);
            this.setCachedData(characterId, 'skills', data);
            return data;
        } catch (e) {
            console.error('Failed to fetch skills:', e);
            return null;
        }
    }

    // Fetch skill queue
    async fetchSkillQueue(characterId) {
        const cached = this.getCachedData(characterId, 'skillQueue');
        if (cached) return cached;
        
        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/skillqueue/`);
            this.setCachedData(characterId, 'skillQueue', data);
            return data;
        } catch (e) {
            console.error('Failed to fetch skill queue:', e);
            return null;
        }
    }

    // Fetch character attributes (returns defaults if scope unavailable)
    async fetchAttributes(characterId) {
        const cached = this.getCachedData(characterId, 'attributes');
        if (cached) return cached;

        // Fallback defaults when scope is unavailable
        const defaults = {
            intelligence: 20,
            memory: 20,
            perception: 20,
            willpower: 20,
            charisma: 19,
            bonus_remaps: 0,
            last_remap_date: null,
            accrued_remap_cooldown_date: null
        };

        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/attributes/`);
            this.setCachedData(characterId, 'attributes', data);
            return data;
        } catch (e) {
            console.warn('Failed to fetch attributes, using defaults:', e.message || e);
            this.setCachedData(characterId, 'attributes', defaults);
            return defaults;
        }
    }

    // Fetch implants (returns empty array if scope unavailable)
    async fetchImplants(characterId) {
        const cached = this.getCachedData(characterId, 'implants');
        if (cached) return cached;

        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/implants/`);
            this.setCachedData(characterId, 'implants', data || []);
            return data || [];
        } catch (e) {
            console.warn('Failed to fetch implants, using empty list:', e.message || e);
            const empty = [];
            this.setCachedData(characterId, 'implants', empty);
            return empty;
        }
    }

    // Fetch active boosters (includes active cerebral accelerators when present)
    async fetchBoosters(characterId) {
        const cached = this.getCachedData(characterId, 'boosters');
        if (cached) return cached;

        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/boosters/`);
            this.setCachedData(characterId, 'boosters', data || []);
            return data || [];
        } catch (e) {
            console.warn('Failed to fetch boosters, using empty list:', e.message || e);
            const empty = [];
            this.setCachedData(characterId, 'boosters', empty);
            return empty;
        }
    }

    // Get full character data (skills + attributes + queue + implants + boosters)
    async getFullCharacterData(characterId) {
        const [skills, attributes, queue, implants, boosters] = await Promise.all([
            this.fetchSkills(characterId),
            this.fetchAttributes(characterId),
            this.fetchSkillQueue(characterId),
            this.fetchImplants(characterId),
            this.fetchBoosters(characterId)
        ]);
        
        return {
            skills: skills,
            attributes: attributes,
            skillQueue: queue,
            implants: implants,
            boosters: boosters
        };
    }

    // Calculate total SP from skills
    calculateTotalSP(skills) {
        if (!skills || !skills.skills) return 0;
        if (!window.SKILLS) {
            console.error('window.SKILLS is not defined! Skills data not loaded.');
            return 0;
        }
        
        return skills.skills.reduce((total, skill) => {
            const skillData = window.SKILLS[skill.skill_id];
            if (!skillData) return total;
            
            // Calculate SP trained for this skill
            let sp = 0;
            for (let i = 1; i <= skill.trained_skill_level; i++) {
                sp += SP_TABLE[i] * skillData.rank;
            }
            
            // Add active skill level SP (if different from trained)
            if (skill.active_skill_level > skill.trained_skill_level) {
                for (let i = skill.trained_skill_level + 1; i <= skill.active_skill_level; i++) {
                    sp += SP_TABLE[i] * skillData.rank;
                }
            }
            
            return total + sp + (skill.skillpoints_in_skill || 0);
        }, 0);
    }

    // Get skills at level 5 count
    getMaxedSkillsCount(skills) {
        if (!skills || !skills.skills) return 0;
        return skills.skills.filter(s => s.trained_skill_level === 5).length;
    }

    // Get skill level for a specific skill
    getSkillLevel(skills, skillId) {
        if (!skills || !skills.skills) return 0;
        const skill = skills.skills.find(s => s.skill_id === skillId);
        return skill ? skill.trained_skill_level : 0;
    }

    // Check if skill is in queue
    isSkillInQueue(queue, skillId) {
        if (!queue) return false;
        return queue.some(entry => entry.skill_id === skillId);
    }

    // Get queue position for skill
    getQueuePosition(queue, skillId) {
        if (!queue) return -1;
        return queue.findIndex(entry => entry.skill_id === skillId);
    }

    // Format SP number
    formatSP(sp) {
        if (sp >= 1000000000) {
            return (sp / 1000000000).toFixed(2) + 'B';
        } else if (sp >= 1000000) {
            return (sp / 1000000).toFixed(2) + 'M';
        } else if (sp >= 1000) {
            return (sp / 1000).toFixed(1) + 'K';
        }
        return sp.toString();
    }

    // Clear all cached data
    clearCache() {
        Object.keys(this.characters).forEach(charId => {
            if (this.characters[charId].cache) {
                this.characters[charId].cache = {};
            }
        });
        this.saveCharacters();
    }

    // Remove character data
    removeCharacter(characterId) {
        delete this.characters[characterId];
        this.saveCharacters();
    }

    // Get character summary for UI
    getCharacterSummary(characterId) {
        const char = this.characters[characterId];
        if (!char || !char.cache || !char.cache.skills) return null;
        
        const skills = char.cache.skills.data;
        console.log('ESI Skills data:', skills); // Debug
        console.log('Unallocated SP field:', skills.unallocated_skill_points); // Debug
        const totalSP = this.calculateTotalSP(skills);
        const maxedSkills = this.getMaxedSkillsCount(skills);
        
        return {
            characterId: characterId,
            totalSP: totalSP,
            skillsTrained: skills.skills ? skills.skills.length : 0,
            skillsAtFive: maxedSkills,
            unallocatedSP: skills.unallocated_skill_points || skills.unallocated_sp || 0
        };
    }
}

// Create global instance
const characterManager = new CharacterManager();
window.characterManager = characterManager;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CharacterManager, characterManager };
}
