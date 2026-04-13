// Training Time Calculator Module
// Calculates skill training times based on attributes and implants

class TrainingCalculator {
    constructor() {
        this.baseAttributes = {
            intelligence: 20,
            memory: 20,
            perception: 20,
            willpower: 20,
            charisma: 19
        };
        
        this.implantBonuses = {
            6: { attr: 'intelligence', bonus: 0 },
            7: { attr: 'memory', bonus: 0 },
            8: { attr: 'perception', bonus: 0 },
            9: { attr: 'willpower', bonus: 0 },
            10: { attr: 'charisma', bonus: 0 }
        };
        
        this.cerebralAccelerator = false;
        this.acceleratorBonus = 10; // +10 all attributes
    }

    // Calculate SP needed for a skill level
    spForLevel(skillId, level) {
        const skill = window.SKILLS[skillId];
        if (!skill) return 0;
        
        let totalSP = 0;
        for (let i = 1; i <= level; i++) {
            totalSP += SP_TABLE[i] * skill.rank;
        }
        return totalSP;
    }

    // Calculate SP needed from current level to target level
    spNeeded(skillId, currentLevel, targetLevel) {
        if (targetLevel <= currentLevel) return 0;
        
        let sp = 0;
        for (let i = currentLevel + 1; i <= targetLevel; i++) {
            sp += SP_TABLE[i] * window.SKILLS[skillId].rank;
        }
        return sp;
    }

    // Get effective attributes
    getEffectiveAttributes() {
        const effective = { ...this.baseAttributes };
        
        // Apply implant bonuses
        Object.values(this.implantBonuses).forEach(implant => {
            if (implant.bonus > 0) {
                effective[implant.attr] += implant.bonus;
            }
        });
        
        // Apply cerebral accelerator
        if (this.cerebralAccelerator) {
            effective.intelligence += this.acceleratorBonus;
            effective.memory += this.acceleratorBonus;
            effective.perception += this.acceleratorBonus;
            effective.willpower += this.acceleratorBonus;
            effective.charisma += this.acceleratorBonus;
        }
        
        return effective;
    }

    // Calculate training time for SP amount
    // Formula: time = SP / (primary + secondary/2)
    calculateTime(sp, primaryAttr, secondaryAttr) {
        const attrs = this.getEffectiveAttributes();
        const primary = attrs[primaryAttr] || 20;
        const secondary = attrs[secondaryAttr] || 20;
        
        const spPerMinute = primary + (secondary / 2);
        const minutes = sp / spPerMinute;
        
        return minutes;
    }

    // Format time duration
    formatTime(minutes) {
        if (minutes < 1) {
            return '< 1m';
        }
        
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        const mins = Math.floor(minutes % 60);
        
        let result = '';
        if (days > 0) result += `${days}d `;
        if (hours > 0 || days > 0) result += `${hours}h `;
        result += `${mins}m`;
        
        return result.trim();
    }

    // Format time in long form
    formatTimeLong(minutes) {
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        const mins = Math.floor(minutes % 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
        if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
        if (mins > 0) parts.push(`${mins} minute${mins > 1 ? 's' : ''}`);
        
        if (parts.length === 0) return '0 minutes';
        if (parts.length === 1) return parts[0];
        if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
        return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
    }

    // Calculate training time for a specific skill
    calculateSkillTime(skillId, fromLevel, toLevel) {
        const skill = window.SKILLS[skillId];
        if (!skill) return 0;
        
        const spNeeded = this.spNeeded(skillId, fromLevel, toLevel);
        if (spNeeded === 0) return 0;
        
        return this.calculateTime(spNeeded, ATTRIBUTES[skill.primary], ATTRIBUTES[skill.secondary]);
    }

    // Calculate total training time for a plan
    calculatePlanTime(plan, characterSkills = null) {
        let totalMinutes = 0;
        const details = [];
        
        plan.forEach(item => {
            const skillId = item.skillId;
            const targetLevel = item.targetLevel;
            
            // Get current level
            let currentLevel = 0;
            if (characterSkills && characterSkills.skills) {
                const charSkill = characterSkills.skills.find(s => s.skill_id === skillId);
                currentLevel = charSkill ? charSkill.trained_skill_level : 0;
            }
            
            // Only calculate if we need to train
            if (targetLevel > currentLevel) {
                const minutes = this.calculateSkillTime(skillId, currentLevel, targetLevel);
                totalMinutes += minutes;
                
                details.push({
                    skillId: skillId,
                    skillName: window.SKILLS[skillId]?.name || 'Unknown',
                    fromLevel: currentLevel,
                    toLevel: targetLevel,
                    minutes: minutes,
                    sp: this.spNeeded(skillId, currentLevel, targetLevel)
                });
            }
        });
        
        return {
            totalMinutes: totalMinutes,
            formattedTime: this.formatTime(totalMinutes),
            formattedTimeLong: this.formatTimeLong(totalMinutes),
            details: details
        };
    }

    // Set attributes
    setAttributes(attrs) {
        this.baseAttributes = { ...this.baseAttributes, ...attrs };
    }

    // Set implant bonus
    setImplant(slot, bonus) {
        if (this.implantBonuses[slot]) {
            this.implantBonuses[slot].bonus = bonus;
        }
    }

    // Set cerebral accelerator
    setCerebralAccelerator(enabled, bonus = 10) {
        this.cerebralAccelerator = enabled;
        this.acceleratorBonus = bonus;
    }

    // Load from character
    loadFromCharacter(characterId) {
        const char = characterManager.characters[characterId];
        if (!char) return;
        
        // Load attributes
        if (char.cache && char.cache.attributes) {
            const attrs = char.cache.attributes.data;
            this.setAttributes({
                intelligence: attrs.intelligence || 20,
                memory: attrs.memory || 20,
                perception: attrs.perception || 20,
                willpower: attrs.willpower || 20,
                charisma: attrs.charisma || 19
            });
        }
        
        // Load implants
        if (char.cache && char.cache.implants) {
            const implants = char.cache.implants.data;
            implants.forEach(implant => {
                // Parse implant type to determine bonus
                const typeId = implant.type_id;
                // Common attribute implant ranges
                // 9956-9960: +1 to +5 Int (slot 6)
                // 9961-9965: +1 to +5 Mem (slot 7)
                // 9966-9970: +1 to +5 Per/Will (slot 8)
                // 9971-9975: +1 to +5 Will/Per (slot 9)
                // 9976-9980: +1 to +5 Char (slot 10)
                
                let slot = 0;
                let bonus = 0;
                
                if (typeId >= 9956 && typeId <= 9960) {
                    slot = 6;
                    bonus = typeId - 9955;
                } else if (typeId >= 9961 && typeId <= 9965) {
                    slot = 7;
                    bonus = typeId - 9960;
                } else if (typeId >= 9966 && typeId <= 9970) {
                    slot = 8;
                    bonus = typeId - 9965;
                } else if (typeId >= 9971 && typeId <= 9975) {
                    slot = 9;
                    bonus = typeId - 9970;
                } else if (typeId >= 9976 && typeId <= 9980) {
                    slot = 10;
                    bonus = typeId - 9975;
                }
                
                if (slot > 0) {
                    this.setImplant(slot, bonus);
                }
            });
        }
    }

    // Reset to defaults
    reset() {
        this.baseAttributes = {
            intelligence: 20,
            memory: 20,
            perception: 20,
            willpower: 20,
            charisma: 19
        };
        
        Object.keys(this.implantBonuses).forEach(slot => {
            this.implantBonuses[slot].bonus = 0;
        });
        
        this.cerebralAccelerator = false;
    }

    // Optimize attributes for a plan (remap calculator)
    optimizeAttributes(plan, currentSkills = null) {
        // Calculate primary and secondary attribute usage for plan
        const usage = { intelligence: 0, memory: 0, perception: 0, willpower: 0, charisma: 0 };
        
        plan.forEach(item => {
            const skill = window.SKILLS[item.skillId];
            if (!skill) return;
            
            const sp = this.spNeeded(item.skillId, 
                this.getCurrentLevel(item.skillId, currentSkills), 
                item.targetLevel);
            
            usage[ATTRIBUTES[skill.primary]] += sp;
            usage[ATTRIBUTES[skill.secondary]] += sp * 0.5; // Secondary counts half
        });
        
        // Sort attributes by usage
        const sorted = Object.entries(usage)
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);
        
        // Remap: assign 27 to highest, 21 to second, 17 to lowest, rest at 17-21
        const remap = {};
        const base = 17;
        const bonusHigh = 10;
        const bonusMed = 4;
        
        sorted.forEach((attr, index) => {
            if (index === 0) remap[attr] = base + bonusHigh; // 27
            else if (index === 1) remap[attr] = base + bonusMed; // 21
            else remap[attr] = base;
        });
        
        return remap;
    }

    getCurrentLevel(skillId, skills) {
        if (!skills || !skills.skills) return 0;
        const skill = skills.skills.find(s => s.skill_id === skillId);
        return skill ? skill.trained_skill_level : 0;
    }

    // Compare training times with different attribute sets
    compareAttributeSets(plan, set1, set2, currentSkills = null) {
        this.setAttributes(set1);
        const time1 = this.calculatePlanTime(plan, currentSkills);
        
        this.setAttributes(set2);
        const time2 = this.calculatePlanTime(plan, currentSkills);
        
        return {
            set1: { ...time1, attributes: { ...set1 } },
            set2: { ...time2, attributes: { ...set2 } },
            difference: time1.totalMinutes - time2.totalMinutes,
            savings: this.formatTime(time1.totalMinutes - time2.totalMinutes)
        };
    }
}

// Create global instance
const trainingCalc = new TrainingCalculator();
window.trainingCalc = trainingCalc;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TrainingCalculator, trainingCalc };
}
