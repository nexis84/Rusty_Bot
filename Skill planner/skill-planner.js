// Skill Planner Module
// Handles skill planning, prerequisite resolution, and plan management

const SKILLS = globalThis.SKILLS || (typeof window !== 'undefined' ? window.SKILLS : {}) || {};

class SkillPlanner {
    constructor() {
        this.plan = this.loadPlan();
        this.name = localStorage.getItem('skill_plan_name') || 'My Skill Plan';
        this.listeners = [];
    }

    // Load plan from localStorage
    loadPlan() {
        const stored = localStorage.getItem('skill_plan');
        return stored ? JSON.parse(stored) : [];
    }

    // Save plan to localStorage
    savePlan() {
        localStorage.setItem('skill_plan', JSON.stringify(this.plan));
        localStorage.setItem('skill_plan_name', this.name);
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
        
        const skillData = SKILLS[skillId];
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
        const skill = SKILLS[skillId];
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
                    skillName: SKILLS[prereqId]?.name || 'Unknown',
                    requiredLevel: requiredLevel,
                    currentLevel: currentLevel
                });
            }
        });
        
        return missing;
    }

    // Auto-resolve prerequisites
    autoResolvePrerequisites(currentSkills = null) {
        const added = [];
        let changed = true;
        const maxIterations = 50; // Safety limit
        let iterations = 0;
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            // Check each skill in plan
            for (const item of this.plan) {
                const missing = this.getMissingPrerequisites(item.skillId, item.targetLevel, currentSkills);
                
                for (const prereq of missing) {
                    // Add prerequisite if not already in plan
                    if (!this.isInPlan(prereq.skillId)) {
                        this.addSkill(prereq.skillId, prereq.requiredLevel, currentSkills);
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
            const skill = SKILLS[item.skillId];
            
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
            
            if (!data.skills || !Array.isArray(data.skills)) {
                return { success: false, message: 'Invalid plan format' };
            }
            
            this.plan = data.skills.map(s => ({
                skillId: s.skillId,
                skillName: SKILLS[s.skillId]?.name || 'Unknown',
                targetLevel: s.targetLevel,
                addedAt: Date.now()
            }));
            
            if (data.name) {
                this.name = data.name;
            }
            
            this.savePlan();
            return { success: true, message: `Imported ${this.plan.length} skills` };
        } catch (e) {
            return { success: false, message: 'Invalid JSON: ' + e.message };
        }
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
            const skill = SKILLS[item.skillId];
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
            const skill = SKILLS[item.skillId];
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
        localStorage.setItem('saved_plans', JSON.stringify(plans));
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
        const stored = localStorage.getItem('saved_plans');
        return stored ? JSON.parse(stored) : {};
    }

    // Delete saved plan
    deleteNamedPlan(name) {
        const plans = this.loadSavedPlans();
        delete plans[name];
        localStorage.setItem('saved_plans', JSON.stringify(plans));
    }

    // Get saved plan names
    getSavedPlanNames() {
        return Object.keys(this.loadSavedPlans());
    }
}

// Create global instance
const skillPlanner = new SkillPlanner();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SkillPlanner, skillPlanner };
}
