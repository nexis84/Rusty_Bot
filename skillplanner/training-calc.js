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
        this.cloneState = 'omega';
    }

    // SP_TABLE holds cumulative SP per rank for each level:
    // I 250, II 1,415, III 8,000, IV 45,255, V 256,000.
    spForLevel(skillId, level) {
        if (!window.SKILLS || !window.SP_TABLE) {
            console.error('SKILLS or SP_TABLE not loaded');
            return 0;
        }

        const skill = window.SKILLS[skillId];
        if (!skill) {
            console.warn(`Skill ${skillId} not found in database`);
            return 0;
        }

        const clamped = Math.max(0, Math.min(5, Number(level) || 0));
        if (clamped === 0) return 0;

        if (!window.SP_TABLE[clamped]) {
            console.warn(`SP_TABLE missing level ${clamped}`);
            return 0;
        }

        return window.SP_TABLE[clamped] * skill.rank;
    }

    // Calculate SP needed from current level to target level.
    spNeeded(skillId, currentLevel, targetLevel) {
        const from = Math.max(0, Math.min(5, Number(currentLevel) || 0));
        const to = Math.max(0, Math.min(5, Number(targetLevel) || 0));
        if (to <= from) return 0;

        if (!window.SKILLS || !window.SP_TABLE) {
            console.error('SKILLS or SP_TABLE not loaded');
            return 0;
        }

        const skill = window.SKILLS[skillId];
        if (!skill) {
            console.warn(`Skill ${skillId} not found in database`);
            return 0;
        }

        const targetSp = window.SP_TABLE[to];
        const currentSp = from > 0 ? window.SP_TABLE[from] : 0;
        if (!Number.isFinite(targetSp) || !Number.isFinite(currentSp)) {
            console.warn(`SP_TABLE missing level data for ${skillId}: ${from} -> ${to}`);
            return 0;
        }

        return Math.max(0, (targetSp - currentSp) * skill.rank);
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

        // Alpha clones train at half the Omega rate. ESI does not expose clone
        // state, so this is driven by the manual calculator switch.
        return this.cloneState === 'alpha' ? minutes * 2 : minutes;
    }

    // Format training time from seconds (ESI skill queue format)
    formatTrainingTime(seconds) {
        return this.formatTime(seconds / 60);
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
        if (!window.SKILLS || !window.ATTRIBUTES) {
            console.error('SKILLS or ATTRIBUTES not loaded');
            return 0;
        }
        
        const skill = window.SKILLS[skillId];
        if (!skill) {
            console.warn(`Skill ${skillId} not found in database`);
            return 0;
        }
        
        const spNeeded = this.spNeeded(skillId, fromLevel, toLevel);
        if (spNeeded === 0) return 0;
        
        const primaryAttr = window.ATTRIBUTES[skill.primary];
        const secondaryAttr = window.ATTRIBUTES[skill.secondary];
        
        if (!primaryAttr || !secondaryAttr) {
            console.warn(`Invalid attributes for skill ${skillId}:`, skill.primary, skill.secondary);
            return 0;
        }
        
        return this.calculateTime(spNeeded, primaryAttr, secondaryAttr);
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

    // Set clone state. Alpha training takes twice as long as Omega.
    setCloneState(state) {
        this.cloneState = state === 'alpha' ? 'alpha' : 'omega';
    }

    // Load from character
    loadFromCharacter(characterId) {
        const char = characterManager.characters[characterId];
        if (!char) return;

        // Ensure values from a previously loaded character do not leak.
        this.reset();
        
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
        
        // Load attribute implants from the SDE-generated map. The old
        // hard-coded type-ID ranges did not match the actual implant data.
        if (char.cache && char.cache.implants) {
            const implants = char.cache.implants.data;
            const bonusMap = window.IMPLANT_BONUSES || {};
            const slots = {
                intelligence: 6,
                memory: 7,
                perception: 8,
                willpower: 9,
                charisma: 10
            };

            implants.forEach(implant => {
                const typeId = typeof implant === 'number' ? implant : implant?.type_id;
                const bonuses = bonusMap[typeId];
                if (!bonuses) return;
                Object.entries(bonuses).forEach(([attribute, bonus]) => {
                    const slot = slots[attribute];
                    if (slot) this.setImplant(slot, bonus);
                });
            });

            // ESI attributes are effective values (implants already applied).
            // Store the pre-implant values so getEffectiveAttributes() does not
            // add the same implants twice.
            if (char.cache.attributes) {
                Object.values(this.implantBonuses).forEach(implant => {
                    if (implant.bonus) {
                        this.baseAttributes[implant.attr] = Math.max(
                            1,
                            this.baseAttributes[implant.attr] - implant.bonus
                        );
                    }
                });
            }
        }

        // Load active cerebral accelerator from boosters when available.
        if (char.cache && char.cache.boosters && Array.isArray(char.cache.boosters.data)) {
            const boosters = char.cache.boosters.data;
            const active = boosters
                .map(b => window.CEREBRAL_ACCELERATORS?.find(a => a.typeId === b.type_id))
                .find(Boolean);

            if (active) {
                this.setCerebralAccelerator(true, active.bonus || 10);
            }
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

    // Brute-force the best legal remap for a plan. EVE remaps start at 17 in
    // every attribute and distribute 14 extra points (maximum +10 each).
    optimizeRemap(plan, currentSkills = null) {
        const attrNames = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'];
        const entries = (plan || []).map(item => {
            const skill = window.SKILLS?.[item.skillId];
            if (!skill) return null;
            const sp = this.spNeeded(item.skillId, this.getCurrentLevel(item.skillId, currentSkills), item.targetLevel);
            if (!sp) return null;
            const primary = window.ATTRIBUTES?.[skill.primary];
            const secondary = window.ATTRIBUTES?.[skill.secondary];
            if (!primary || !secondary) return null;
            return { sp, primary, secondary };
        }).filter(Boolean);

        const currentAttributes = { ...this.baseAttributes };
        const currentTime = this.calculatePlanTime(plan, currentSkills).totalMinutes;

        if (entries.length === 0) {
            return {
                attributes: currentAttributes,
                minutes: 0,
                formattedTime: '0m',
                currentMinutes: 0,
                savingsMinutes: 0,
                savingsFormatted: '0m'
            };
        }

        const implantBonus = {
            intelligence: this.implantBonuses[6]?.bonus || 0,
            memory: this.implantBonuses[7]?.bonus || 0,
            perception: this.implantBonuses[8]?.bonus || 0,
            willpower: this.implantBonuses[9]?.bonus || 0,
            charisma: this.implantBonuses[10]?.bonus || 0
        };
        const accelerator = this.cerebralAccelerator ? this.acceleratorBonus : 0;
        const alphaMultiplier = this.cloneState === 'alpha' ? 2 : 1;

        let best = null;
        const evaluate = values => {
            const effective = {};
            attrNames.forEach(name => {
                effective[name] = values[name] + implantBonus[name] + accelerator;
            });

            let minutes = 0;
            for (const entry of entries) {
                const primary = effective[entry.primary];
                const secondary = effective[entry.secondary];
                if (!primary || !secondary) return;
                minutes += entry.sp / (primary + secondary / 2);
            }
            minutes *= alphaMultiplier;

            if (!best || minutes < best.minutes) {
                best = { minutes, values: { ...values } };
            }
        };

        const values = {};
        const search = (index, remaining) => {
            if (index === attrNames.length - 1) {
                values[attrNames[index]] = 17 + remaining;
                evaluate(values);
                return;
            }
            for (let extra = 0; extra <= Math.min(10, remaining); extra++) {
                values[attrNames[index]] = 17 + extra;
                search(index + 1, remaining - extra);
            }
        };
        search(0, 14);

        const savings = currentTime - best.minutes;
        return {
            attributes: best.values,
            minutes: best.minutes,
            formattedTime: this.formatTime(best.minutes),
            currentMinutes: currentTime,
            savingsMinutes: savings,
            savingsFormatted: this.formatTime(Math.max(0, savings))
        };
    }

    // Optimize attributes for a plan (remap calculator)
    optimizeAttributes(plan, currentSkills = null) {
        if (!window.SKILLS || !window.ATTRIBUTES) {
            console.error('SKILLS or ATTRIBUTES not loaded for optimization');
            return { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 };
        }
        
        // Calculate primary and secondary attribute usage for plan
        const usage = { intelligence: 0, memory: 0, perception: 0, willpower: 0, charisma: 0 };
        
        plan.forEach(item => {
            const skill = window.SKILLS[item.skillId];
            if (!skill) {
                console.warn(`Skill ${item.skillId} not found in optimization`);
                return;
            }
            
            const sp = this.spNeeded(item.skillId, 
                this.getCurrentLevel(item.skillId, currentSkills), 
                item.targetLevel);
            
            const primaryAttr = window.ATTRIBUTES[skill.primary];
            const secondaryAttr = window.ATTRIBUTES[skill.secondary];
            
            if (primaryAttr) usage[primaryAttr] += sp;
            if (secondaryAttr) usage[secondaryAttr] += sp * 0.5; // Secondary counts half
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
