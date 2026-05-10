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
    // Always returns undefined to force live ESI data fetches
    getCachedData(characterId, dataType) {
        return undefined;
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
        if (cached !== undefined) return cached;
        
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
        if (cached !== undefined) return cached;
        
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
        if (cached !== undefined) return cached;
        
        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/skillqueue/`);
            this.setCachedData(characterId, 'skillQueue', data);
            return data;
        } catch (e) {
            console.error('Failed to fetch skill queue:', e);
            return null;
        }
    }

    // Fetch character attributes from ESI
    async fetchAttributes(characterId) {
        const cached = this.getCachedData(characterId, 'attributes');
        if (cached !== undefined) {
            return cached;
        }
        
        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/attributes/`);
            this.setCachedData(characterId, 'attributes', data);
            return data;
        } catch (e) {
            console.warn('Failed to fetch attributes from ESI, using defaults:', e.message);
            // Return defaults as fallback
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
            this.setCachedData(characterId, 'attributes', defaults);
            return defaults;
        }
    }

    // Fetch implants from ESI
    async fetchImplants(characterId) {
        const cached = this.getCachedData(characterId, 'implants');
        if (cached !== undefined) return cached;
        
        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/implants/`);
            this.setCachedData(characterId, 'implants', data);
            return data;
        } catch (e) {
            if (e.message.includes('401')) {
                console.error('⚠ Failed to fetch implants: 401 Unauthorized - Your token may not have the "esi-clones.read_implants.v1" scope. Try logging out and back in.', e);
            } else {
                console.warn('Failed to fetch implants:', e);
            }
            // Return empty array as fallback
            const empty = [];
            this.setCachedData(characterId, 'implants', empty);
            return empty;
        }
    }

    // Cerebral accelerators cannot be detected via ESI.
    // There is no /characters/{id}/boosters/ endpoint in the ESI API.
    // Active boosters use a separate booster-slot system and are not exposed.
    async fetchBoosters(characterId) {
        return [];
    }

    // Fetch clones from ESI
    async fetchClones(characterId) {
        const cached = this.getCachedData(characterId, 'clones');
        if (cached !== undefined) return cached;
        
        try {
            const data = await esiAuth.esiFetch(`/characters/${characterId}/clones/`);
            this.setCachedData(characterId, 'clones', data);
            return data;
        } catch (e) {
            if (e.message.includes('401')) {
                console.error('⚠ Failed to fetch clones: 401 Unauthorized - Your token may not have the "esi-clones.read_clones.v1" scope. Try logging out and back in.', e);
            } else {
                console.warn('Failed to fetch clones:', e);
            }
            // Return null as fallback - clones data is not critical
            this.setCachedData(characterId, 'clones', null);
            return null;
        }
    }

    // Get full character data (skills + attributes + queue first, then implants/boosters/clones)
    async getFullCharacterData(characterId) {
        // Load critical data first (needed for immediate UI display)
        const [skills, attributes, queue] = await Promise.all([
            this.fetchSkills(characterId),
            this.fetchAttributes(characterId),
            this.fetchSkillQueue(characterId)
        ]);
        
        // Return immediately with critical data; load secondary data in background
        const data = {
            skills: skills,
            attributes: attributes,
            skillQueue: queue,
            implants: null,
            boosters: [],
            clones: null
        };
        
        // Load secondary data asynchronously without blocking UI
        // These are not critical for initial page load
        Promise.all([
            this.fetchImplants(characterId),
            this.fetchBoosters(characterId),
            this.fetchClones(characterId)
        ]).then(([implants, boosters, clones]) => {
            data.implants = implants;
            data.boosters = boosters;
            data.clones = clones;
        }).catch(err => {
            console.warn('Failed to load secondary character data:', err);
            // Secondary data is not critical, so silently fail
        });
        
        return data;
    }

    // Calculate total SP from skills (trained + unallocated)
    calculateTotalSP(skills) {
        if (!skills) return 0;

        // ESI total_sp is authoritative for trained SP.
        let trained = 0;
        const esiTotal = Number(skills.total_sp);
        if (Number.isFinite(esiTotal) && esiTotal >= 0) {
            trained = esiTotal;
        } else if (Array.isArray(skills.skills)) {
            // Fallback: sum per-skill SP when total_sp is unavailable.
            trained = skills.skills.reduce((total, skill) => {
                return total + (Number(skill.skillpoints_in_skill) || 0);
            }, 0);
        }

        // Include unallocated SP to match in-game total
        const unallocated = Number(skills.unallocated_skill_points) ||
                          Number(skills.unallocated_sp) || 0;

        return trained + unallocated;
    }

    // Calculate real-time SP by adding progress from the active skill queue
    calculateRealtimeSP(skills, queue) {
        const baseSP = this.calculateTotalSP(skills);
        if (!queue || !Array.isArray(queue) || queue.length === 0) return baseSP;

        const now = new Date();

        // Find the currently training skill (first item with start_date in the past)
        for (const item of queue) {
            const start = item.start_date ? new Date(item.start_date) : null;
            const finish = item.finish_date ? new Date(item.finish_date) : null;

            if (!start || !finish) continue;

            // If this skill is currently training
            if (now >= start && now < finish) {
                const totalMs = finish.getTime() - start.getTime();
                const elapsedMs = now.getTime() - start.getTime();
                const progress = elapsedMs / totalMs;

                // Calculate SP gained in this skill so far
                const startSP = Number(item.level_start_sp) || 0;
                const endSP = Number(item.level_end_sp) || 0;
                const spGained = (endSP - startSP) * progress;

                // The ESI snapshot already includes SP up to the snapshot time,
                // but the snapshot may be slightly stale. We add the difference
                // between real-time progress and what the snapshot captured.
                // Since ESI total_sp is a point-in-time value, we estimate the
                // additional SP earned since the snapshot by using the queue progress.
                // The simplest accurate approach: add SP gained since snapshot.
                // We use the skill's SP/min rate from attributes.
                const skillData = window.SKILLS[item.skill_id];
                if (skillData) {
                    const primaryAttr = window.ATTRIBUTES?.[skillData.primary];
                    const secondaryAttr = window.ATTRIBUTES?.[skillData.secondary];
                    if (primaryAttr) {
                        const attrs = trainingCalc.getEffectiveAttributes();
                        const spPerMin = attrs[primaryAttr] + (attrs[secondaryAttr] || 0) / 2;
                        // Estimate seconds since the skills endpoint was called
                        const skillsTimestamp = this.getSkillsTimestamp();
                        const secondsSinceSnapshot = skillsTimestamp
                            ? (now.getTime() - skillsTimestamp) / 1000
                            : 0;
                        if (secondsSinceSnapshot > 0 && secondsSinceSnapshot < 600) {
                            return Math.round(baseSP + (spPerMin * secondsSinceSnapshot / 60));
                        }
                    }
                }

                return baseSP;
            }

            // If start date is in the future, no active training
            if (start > now) break;
        }

        return baseSP;
    }

    // Get the timestamp of when skills data was last fetched from ESI
    getSkillsTimestamp() {
        const charId = esiAuth?.getCurrentCharacter?.();
        if (!charId || !this.characters[charId]?.cache?.skills) return null;
        return this.characters[charId].cache.skills.timestamp || null;
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

    // Format SP number with full precision
    formatSP(sp) {
        if (sp >= 1000000000) {
            return (sp / 1000000000).toFixed(3) + 'B';
        } else if (sp >= 1000000) {
            return (sp / 1000000).toFixed(3) + 'M';
        } else if (sp >= 1000) {
            return (sp / 1000).toFixed(1) + 'K';
        }
        return sp.toString();
    }

    // Format SP with exact number and commas
    formatSPExact(sp) {
        return Number(sp).toLocaleString();
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

    // Clear cached data for a specific character
    clearCharacterCache(characterId) {
        if (!this.characters[characterId] || !this.characters[characterId].cache) {
            return;
        }

        this.characters[characterId].cache = {};
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
        if (!skills) {
            console.warn('Skills data is null or undefined for character:', characterId);
            return null;
        }
        
        // Use real-time SP calculation (accounts for active training)
        const queue = char.cache.skillQueue?.data || null;
        const totalSP = this.calculateRealtimeSP(skills, queue);
        const maxedSkills = this.getMaxedSkillsCount(skills);
        
        // Handle both possible field names for unallocated SP
        const unallocatedSP = Number(skills.unallocated_skill_points) || 
                            Number(skills.unallocated_sp) || 0;
        
        // Trained SP only (totalSP includes unallocated)
        const trainedSP = totalSP - unallocatedSP;
        
        return {
            characterId: characterId,
            totalSP: totalSP,
            trainedSP: trainedSP,
            skillsTrained: skills.skills ? skills.skills.length : 0,
            skillsAtFive: maxedSkills,
            unallocatedSP: unallocatedSP
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
