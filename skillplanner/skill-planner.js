// Skill Planner Module
// Handles skill planning, prerequisite resolution, and plan management

class SkillPlanner {
    constructor() {
        this.activeCharacterId = window.esiAuth?.getCurrentCharacter?.() || null;
        this.plan = this.loadPlan();
        this.name = this.loadPlanName();
        this.listeners = [];
        this.prereqCache = this.loadPrereqCache();
    }

    loadPrereqCache() {
        try {
            const raw = localStorage.getItem('skill_prereq_cache_v1');
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.warn('Failed to load prerequisite cache:', e);
            return {};
        }
    }

    savePrereqCache() {
        try {
            localStorage.setItem('skill_prereq_cache_v1', JSON.stringify(this.prereqCache));
        } catch (e) {
            console.warn('Failed to save prerequisite cache:', e);
        }
    }

    // Load prerequisites for a skill from ESI dogma attributes when local data does not include them.
    async fetchSkillPrerequisites(skillId) {
        const skill = window.SKILLS[skillId];
        if (!skill) return {};

        if (skill.prereqs && Object.keys(skill.prereqs).length > 0) {
            return skill.prereqs;
        }

        if (this.prereqCache[skillId]) {
            skill.prereqs = this.prereqCache[skillId];
            return skill.prereqs;
        }

        try {
            const response = await fetch(`https://esi.evetech.net/latest/universe/types/${skillId}/`);
            if (!response.ok) {
                throw new Error(`ESI ${response.status}`);
            }

            const data = await response.json();
            const attrs = Array.isArray(data.dogma_attributes) ? data.dogma_attributes : [];

            const getAttrVal = (id) => {
                const entry = attrs.find(a => a.attribute_id === id);
                return entry ? Number(entry.value) : NaN;
            };

            const mappings = [
                [182, 277],
                [183, 278],
                [184, 279],
                [1285, 1286],
                [1289, 1287],
                [1290, 1288]
            ];

            const prereqs = {};
            mappings.forEach(([skillAttrId, levelAttrId]) => {
                const prereqSkillId = Math.trunc(getAttrVal(skillAttrId));
                const prereqLevel = Math.trunc(getAttrVal(levelAttrId));

                if (Number.isFinite(prereqSkillId) && prereqSkillId > 0 && Number.isFinite(prereqLevel) && prereqLevel > 0) {
                    prereqs[prereqSkillId] = prereqLevel;
                }
            });

            skill.prereqs = prereqs;
            this.prereqCache[skillId] = prereqs;
            this.savePrereqCache();
            return prereqs;
        } catch (e) {
            console.warn(`Failed to fetch prerequisites for ${skillId}:`, e.message || e);
            skill.prereqs = {};
            this.prereqCache[skillId] = {};
            this.savePrereqCache();
            return {};
        }
    }

    getScopedStorageKey(baseKey, characterId = this.activeCharacterId) {
        if (!characterId) return null;
        return `${baseKey}_${characterId}`;
    }

    // Switch active character context for plan data
    setActiveCharacter(characterId) {
        this.activeCharacterId = characterId || null;
        this.plan = this.loadPlan();
        this.name = this.loadPlanName();
        this.notifyListeners();
    }

    // Clear in-memory plan state without deleting persisted character plans
    clearSessionPlan() {
        this.plan = [];
        this.name = 'My Skill Plan';
        this.notifyListeners();
    }

    // Load plan from localStorage
    loadPlan() {
        const scopedKey = this.getScopedStorageKey('skill_plan');
        if (!scopedKey) return [];

        let stored = localStorage.getItem(scopedKey);

        // One-time migration from legacy single-plan storage.
        if (!stored) {
            const legacy = localStorage.getItem('skill_plan');
            if (legacy) {
                localStorage.setItem(scopedKey, legacy);
                stored = legacy;
            }
        }

        return stored ? JSON.parse(stored) : [];
    }

    loadPlanName() {
        const scopedKey = this.getScopedStorageKey('skill_plan_name');
        if (!scopedKey) return 'My Skill Plan';

        let stored = localStorage.getItem(scopedKey);

        // One-time migration from legacy single-name storage.
        if (!stored) {
            const legacy = localStorage.getItem('skill_plan_name');
            if (legacy) {
                localStorage.setItem(scopedKey, legacy);
                stored = legacy;
            }
        }

        return stored || 'My Skill Plan';
    }

    // Save plan to localStorage
    savePlan() {
        const planKey = this.getScopedStorageKey('skill_plan');
        const nameKey = this.getScopedStorageKey('skill_plan_name');

        if (planKey && nameKey) {
            localStorage.setItem(planKey, JSON.stringify(this.plan));
            localStorage.setItem(nameKey, this.name);
        }

        this.notifyListeners();
    }

    // Add listener for plan changes
    addListener(callback) {
        this.listeners.push(callback);
    }

    // Remove listener
    removeListener(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    // Notify all listeners
    notifyListeners() {
        this.listeners.forEach(cb => {
            try {
                cb(this.plan);
            } catch (e) {
                console.error('Plan listener error:', e);
            }
        });
    }

    // Add skill to plan
    addSkill(skillId, targetLevel, currentSkills = null) {
        // Check if already in plan
        const existingIndex = this.plan.findIndex(item => item.skillId === skillId);
        
        // Get current level from character if available
        let currentLevel = 0;
        if (currentSkills && currentSkills.skills) {
            const charSkill = currentSkills.skills.find(s => s.skill_id === skillId);
            currentLevel = charSkill ? charSkill.trained_skill_level : 0;
        }
        
        // Only add if target > current
        if (targetLevel <= currentLevel) {
            return { success: false, message: 'Already trained to this level' };
        }
        
        const skillData = window.SKILLS[skillId];
        if (!skillData) {
            return { success: false, message: 'Skill not found' };
        }
        
        const planItem = {
            skillId: skillId,
            skillName: skillData.name,
            targetLevel: targetLevel,
            addedAt: Date.now()
        };
        
        if (existingIndex >= 0) {
            // Update if higher level requested
            if (targetLevel > this.plan[existingIndex].targetLevel) {
                this.plan[existingIndex].targetLevel = targetLevel;
                this.savePlan();
                return { success: true, message: 'Skill level updated' };
            }
            return { success: false, message: 'Already in plan at equal or higher level' };
        }
        
        this.plan.push(planItem);
        this.savePlan();
        return { success: true, message: 'Skill added to plan' };
    }

    // Get effective level from character skills plus current plan target levels
    getEffectiveSkillLevel(skillId, currentSkills = null) {
        let level = 0;

        if (currentSkills && currentSkills.skills) {
            const charSkill = currentSkills.skills.find(s => s.skill_id === skillId);
            level = charSkill ? charSkill.trained_skill_level : 0;
        }

        const inPlan = this.plan.find(p => p.skillId === skillId);
        if (inPlan && inPlan.targetLevel > level) {
            level = inPlan.targetLevel;
        }

        return level;
    }

    // Add a skill and recursively add all missing prerequisites based on current skills.
    async addSkillWithPrerequisites(skillId, targetLevel, currentSkills = null) {
        const rootSkill = window.SKILLS[skillId];
        if (!rootSkill) {
            return { success: false, message: 'Skill not found', added: [], upgraded: [], prerequisiteDetails: [] };
        }

        const existingLevel = this.getEffectiveSkillLevel(skillId, currentSkills);
        if (targetLevel <= existingLevel) {
            return { success: false, message: 'Already trained to this level', added: [], upgraded: [], prerequisiteDetails: [] };
        }

        const added = [];
        const upgraded = [];
        const visiting = new Set();
        const beforeLevels = new Map();
        const requiredPrereqLevels = new Map();
        const rootBeforeLevel = existingLevel;

        const resolveSkill = async (id, requiredLevel, isRoot = false) => {
            if (visiting.has(id)) return;

            const skill = window.SKILLS[id];
            if (!skill) return;

            if (!beforeLevels.has(id)) {
                beforeLevels.set(id, this.getEffectiveSkillLevel(id, currentSkills));
            }
            if (!isRoot) {
                const prevRequired = requiredPrereqLevels.get(id) || 0;
                requiredPrereqLevels.set(id, Math.max(prevRequired, requiredLevel));
            }

            visiting.add(id);

            const prereqs = await this.fetchSkillPrerequisites(id);
            if (prereqs && Object.keys(prereqs).length > 0) {
                for (const [prereqId, prereqLevel] of Object.entries(prereqs)) {
                    await resolveSkill(parseInt(prereqId), prereqLevel, false);
                }
            }

            const beforeLevel = this.getEffectiveSkillLevel(id, currentSkills);
            if (requiredLevel > beforeLevel) {
                const wasInPlan = this.isInPlan(id);
                const result = this.addSkill(id, requiredLevel, currentSkills);
                if (result.success) {
                    const entry = {
                        skillId: id,
                        skillName: skill.name,
                        fromLevel: beforeLevel,
                        toLevel: requiredLevel
                    };

                    if (beforeLevel > 0 || wasInPlan) {
                        upgraded.push(entry);
                    } else {
                        added.push(entry);
                    }
                }
            }

            visiting.delete(id);
        };

        await resolveSkill(skillId, targetLevel, true);

        const prerequisiteDetails = Array.from(requiredPrereqLevels.entries())
            .map(([id, requiredLevel]) => {
                const beforeLevel = beforeLevels.get(id) || 0;
                const afterLevel = this.getEffectiveSkillLevel(id, currentSkills);
                const changed = afterLevel > beforeLevel;
                return {
                    skillId: id,
                    skillName: window.SKILLS[id]?.name || `Skill ${id}`,
                    requiredLevel,
                    fromLevel: beforeLevel,
                    toLevel: afterLevel,
                    changed,
                    alreadyMet: beforeLevel >= requiredLevel
                };
            })
            .sort((a, b) => a.skillName.localeCompare(b.skillName));

        const totalChanges = added.length + upgraded.length;
        if (totalChanges === 0) {
            return { success: false, message: 'No prerequisite changes needed', added, upgraded, prerequisiteDetails };
        }

        if (added.length > 0 || upgraded.length > 0) {
            return {
                success: true,
                message: `${rootSkill.name} ${targetLevel} added with ${totalChanges - 1} prerequisite changes`,
                added,
                upgraded,
                prerequisiteDetails,
                rootChange: {
                    skillId,
                    skillName: rootSkill.name,
                    fromLevel: rootBeforeLevel,
                    toLevel: targetLevel
                }
            };
        }

        return {
            success: true,
            message: 'Skill added to plan',
            added,
            upgraded,
            prerequisiteDetails,
            rootChange: {
                skillId,
                skillName: rootSkill.name,
                fromLevel: rootBeforeLevel,
                toLevel: targetLevel
            }
        };
    }

    // Remove skill from plan
    removeSkill(skillId) {
        const index = this.plan.findIndex(item => item.skillId === skillId);
        if (index >= 0) {
            this.plan.splice(index, 1);
            this.savePlan();
            return true;
        }
        return false;
    }

    // Update skill target level
    updateSkillLevel(skillId, targetLevel) {
        const item = this.plan.find(item => item.skillId === skillId);
        if (item) {
            item.targetLevel = targetLevel;
            this.savePlan();
            return true;
        }
        return false;
    }

    // Move skill in plan (reorder)
    moveSkill(skillId, newIndex) {
        const currentIndex = this.plan.findIndex(item => item.skillId === skillId);
        if (currentIndex < 0) return false;
        
        const [item] = this.plan.splice(currentIndex, 1);
        this.plan.splice(newIndex, 0, item);
        this.savePlan();
        return true;
    }

    // Get plan
    getPlan() {
        return [...this.plan];
    }

    // Get plan length
    getPlanLength() {
        return this.plan.length;
    }

    // Check if skill is in plan
    isInPlan(skillId) {
        return this.plan.some(item => item.skillId === skillId);
    }

    // Get skill in plan
    getPlanSkill(skillId) {
        return this.plan.find(item => item.skillId === skillId);
    }

    // Clear plan
    clearPlan() {
        this.plan = [];
        this.savePlan();
    }

    // Set plan name
    setName(name) {
        this.name = name;
        this.savePlan();
    }

    // Get plan name
    getName() {
        return this.name;
    }

    // Get missing prerequisites for a skill
    getMissingPrerequisites(skillId, targetLevel, currentSkills = null) {
        const skill = window.SKILLS[skillId];
        if (!skill || !skill.prereqs) return [];
        
        const missing = [];
        
        Object.entries(skill.prereqs).forEach(([prereqId, requiredLevel]) => {
            // Get current level of prerequisite
            let currentLevel = 0;
            if (currentSkills && currentSkills.skills) {
                const charSkill = currentSkills.skills.find(s => s.skill_id === parseInt(prereqId));
                currentLevel = charSkill ? charSkill.trained_skill_level : 0;
            }
            
            // Also check if already in plan
            const inPlan = this.plan.find(p => p.skillId === parseInt(prereqId));
            if (inPlan && inPlan.targetLevel > currentLevel) {
                currentLevel = inPlan.targetLevel;
            }
            
            if (currentLevel < requiredLevel) {
                missing.push({
                    skillId: parseInt(prereqId),
                    skillName: window.SKILLS[prereqId]?.name || 'Unknown',
                    requiredLevel: requiredLevel,
                    currentLevel: currentLevel
                });
            }
        });
        
        return missing;
    }

    // Auto-resolve prerequisites
    async autoResolvePrerequisites(currentSkills = null) {
        const added = [];
        let changed = true;
        const maxIterations = 50; // Safety limit
        let iterations = 0;
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            // Check each skill in plan
            for (const item of this.plan) {
                await this.fetchSkillPrerequisites(item.skillId);
                const missing = this.getMissingPrerequisites(item.skillId, item.targetLevel, currentSkills);
                
                for (const prereq of missing) {
                    const result = this.addSkill(prereq.skillId, prereq.requiredLevel, currentSkills);
                    if (result.success) {
                        added.push({
                            skillId: prereq.skillId,
                            skillName: prereq.skillName,
                            targetLevel: prereq.requiredLevel
                        });
                        changed = true;
                    }
                }
            }
        }
        
        return added;
    }

    // Check entire plan for missing prerequisites
    checkAllPrerequisites(currentSkills = null) {
        const issues = [];
        
        this.plan.forEach(item => {
            const missing = this.getMissingPrerequisites(item.skillId, item.targetLevel, currentSkills);
            if (missing.length > 0) {
                issues.push({
                    skillId: item.skillId,
                    skillName: item.skillName,
                    missing: missing
                });
            }
        });
        
        return issues;
    }

    // Optimize plan order (train prerequisites first)
    optimizeOrder(currentSkills = null) {
        // Build dependency graph
        const graph = new Map();
        
        this.plan.forEach(item => {
            const deps = [];
            const skill = window.SKILLS[item.skillId];
            
            if (skill && skill.prereqs) {
                Object.entries(skill.prereqs).forEach(([prereqId, level]) => {
                    const prereqInPlan = this.plan.find(p => p.skillId === parseInt(prereqId));
                    if (prereqInPlan) {
                        deps.push(parseInt(prereqId));
                    }
                });
            }
            
            graph.set(item.skillId, deps);
        });
        
        // Topological sort
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();
        
        const visit = (skillId) => {
            if (visiting.has(skillId)) {
                // Cycle detected, skip
                return;
            }
            if (visited.has(skillId)) return;
            
            visiting.add(skillId);
            
            const deps = graph.get(skillId) || [];
            deps.forEach(dep => visit(dep));
            
            visiting.delete(skillId);
            visited.add(skillId);
            
            const item = this.plan.find(p => p.skillId === skillId);
            if (item) sorted.push(item);
        };
        
        this.plan.forEach(item => visit(item.skillId));
        
        // Update plan order
        this.plan = sorted;
        this.savePlan();
        
        return sorted;
    }

    // Export plan to JSON
    exportPlan() {
        return JSON.stringify({
            version: 1,
            name: this.name,
            created: new Date().toISOString(),
            skills: this.plan.map(item => ({
                skillId: item.skillId,
                targetLevel: item.targetLevel
            }))
        }, null, 2);
    }

    // Import plan from JSON
    importPlan(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Supported formats:
            // 1) { name, skills: [{ skillId, targetLevel }] }
            // 2) { name, plan: [{ skillId, targetLevel }] }
            // 3) [{ skillId, targetLevel }]
            // 4) [{ id, level }]
            const rawSkills = this.extractImportedSkillList(data);
            if (!rawSkills || rawSkills.length === 0) {
                return { success: false, message: 'Invalid plan format: no skills found' };
            }

            const normalized = this.normalizeImportedSkills(rawSkills);
            if (normalized.length === 0) {
                return { success: false, message: 'Import failed: no valid skills in file' };
            }

            this.plan = normalized;
            
            if (data.name) {
                this.name = data.name;
            }
            
            this.savePlan();
            return { success: true, message: `Imported ${this.plan.length} skills` };
        } catch (e) {
            return { success: false, message: 'Invalid JSON: ' + e.message };
        }
    }

    extractImportedSkillList(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (!data || typeof data !== 'object') {
            return [];
        }

        if (Array.isArray(data.skills)) {
            return data.skills;
        }

        if (Array.isArray(data.plan)) {
            return data.plan;
        }

        return [];
    }

    normalizeImportedSkills(rawSkills) {
        const map = new Map();

        rawSkills.forEach(item => {
            const skillId = parseInt(item.skillId ?? item.id);
            const targetLevel = parseInt(item.targetLevel ?? item.level);

            if (!Number.isInteger(skillId) || !window.SKILLS[skillId]) {
                return;
            }

            if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 5) {
                return;
            }

            const existing = map.get(skillId);
            if (!existing || targetLevel > existing.targetLevel) {
                map.set(skillId, {
                    skillId: skillId,
                    skillName: window.SKILLS[skillId].name,
                    targetLevel: targetLevel,
                    addedAt: Date.now()
                });
            }
        });

        return Array.from(map.values());
    }

    // Get plan summary stats
    getSummary(currentSkills = null) {
        const trainingResult = trainingCalc.calculatePlanTime(this.plan, currentSkills);
        
        // Calculate total SP needed
        let totalSpNeeded = 0;
        trainingResult.details.forEach(detail => {
            totalSpNeeded += detail.sp;
        });
        
        // Count prerequisites issues
        const prereqIssues = this.checkAllPrerequisites(currentSkills);
        
        return {
            totalSkills: this.plan.length,
            totalTime: trainingResult.formattedTime,
            totalTimeLong: trainingResult.formattedTimeLong,
            totalMinutes: trainingResult.totalMinutes,
            totalSP: totalSpNeeded,
            hasPrereqIssues: prereqIssues.length > 0,
            prereqIssueCount: prereqIssues.length
        };
    }

    // Get skills grouped by category
    getPlanByCategory() {
        const grouped = {};
        
        this.plan.forEach(item => {
            const skill = window.SKILLS[item.skillId];
            const category = skill ? skill.group : 'Unknown';
            
            if (!grouped[category]) {
                grouped[category] = [];
            }
            
            grouped[category].push(item);
        });
        
        return grouped;
    }

    // Get training queue format (for ESI skill queue simulation)
    getTrainingQueueFormat(currentSkills = null) {
        const optimized = this.optimizeOrder(currentSkills);
        
        return optimized.map((item, index) => ({
            queue_position: index,
            skill_id: item.skillId,
            finish_level: item.targetLevel,
            training_start_sp: trainingCalc.spForLevel(item.skillId, item.targetLevel - 1)
        }));
    }

    // Estimate completion dates
    getCompletionDates(currentSkills = null) {
        const optimized = this.optimizeOrder(currentSkills);
        const now = new Date();
        let accumulatedMinutes = 0;
        
        return optimized.map(item => {
            const skill = window.SKILLS[item.skillId];
            const minutes = trainingCalc.calculateSkillTime(
                item.skillId,
                this.getCurrentLevel(item.skillId, currentSkills),
                item.targetLevel
            );
            
            accumulatedMinutes += minutes;
            const completionDate = new Date(now.getTime() + accumulatedMinutes * 60000);
            
            return {
                skillId: item.skillId,
                skillName: item.skillName,
                targetLevel: item.targetLevel,
                minutes: minutes,
                completionDate: completionDate,
                formattedDate: completionDate.toLocaleDateString()
            };
        });
    }

    getCurrentLevel(skillId, skills) {
        if (!skills || !skills.skills) return 0;
        const skill = skills.skills.find(s => s.skill_id === skillId);
        return skill ? skill.trained_skill_level : 0;
    }

    // Save named plan
    saveNamedPlan(name) {
        const plans = this.loadSavedPlans();
        plans[name] = {
            plan: this.plan,
            savedAt: new Date().toISOString()
        };

        const savedPlansKey = this.getScopedStorageKey('saved_plans');
        if (savedPlansKey) {
            localStorage.setItem(savedPlansKey, JSON.stringify(plans));
        }
    }

    // Load saved plan
    loadNamedPlan(name) {
        const plans = this.loadSavedPlans();
        const saved = plans[name];
        if (saved) {
            this.plan = saved.plan;
            this.name = name;
            this.savePlan();
            return true;
        }
        return false;
    }

    // Load all saved plans
    loadSavedPlans() {
        const savedPlansKey = this.getScopedStorageKey('saved_plans');
        if (!savedPlansKey) return {};

        const stored = localStorage.getItem(savedPlansKey);
        return stored ? JSON.parse(stored) : {};
    }

    // Delete saved plan
    deleteNamedPlan(name) {
        const plans = this.loadSavedPlans();
        delete plans[name];

        const savedPlansKey = this.getScopedStorageKey('saved_plans');
        if (savedPlansKey) {
            localStorage.setItem(savedPlansKey, JSON.stringify(plans));
        }
    }

    // Get saved plan names
    getSavedPlanNames() {
        return Object.keys(this.loadSavedPlans());
    }
}

// Create global instance
const skillPlanner = new SkillPlanner();
window.skillPlanner = skillPlanner;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SkillPlanner, skillPlanner };
}
