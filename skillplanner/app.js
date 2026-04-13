// Main Application Module
// Orchestrates all functionality and UI interactions

class SkillPlannerApp {
    constructor() {
        this.currentView = 'dashboard';
        this.currentCharacter = null;
        this.currentCharacterData = null;
        this.selectedSkill = null;
        this.init();
    }

    async init() {
        this.bindElements();
        this.bindEvents();
        this.startClock();
        
        // Check for OAuth callback
        try {
            const charData = await esiAuth.handleCallback();
            if (charData) {
                this.showMessage('Successfully authenticated!', 'success');
            }
        } catch (e) {
            this.showMessage('Authentication failed: ' + e.message, 'error');
        }
        
        // Load character if authenticated
        if (esiAuth.isAuthenticated()) {
            await this.loadCharacter(esiAuth.currentCharacter);
        }
        
        this.updateUI();
    }

    bindElements() {
        // Navigation
        this.navItems = document.querySelectorAll('.nav-item');
        this.views = document.querySelectorAll('.view');
        this.pageTitle = document.getElementById('pageTitle');
        
        // Character
        this.esiLoginBtn = document.getElementById('esiLoginBtn');
        this.loginPrompt = document.getElementById('loginPrompt');
        this.characterInfo = document.getElementById('characterInfo');
        this.charPortrait = document.getElementById('charPortrait');
        this.charName = document.getElementById('charName');
        this.charMeta = document.getElementById('charMeta');
        this.charSwitchBtn = document.getElementById('charSwitchBtn');
        this.characterList = document.getElementById('characterList');
        this.planBadge = document.getElementById('planBadge');
        this.planSummaryMini = document.getElementById('planSummaryMini');
        this.miniSkills = document.getElementById('miniSkills');
        this.miniTime = document.getElementById('miniTime');
        
        // Dashboard
        this.totalSp = document.getElementById('totalSp');
        this.skillsTrained = document.getElementById('skillsTrained');
        this.skillsAtFive = document.getElementById('skillsAtFive');
        this.unallocatedSp = document.getElementById('unallocatedSp');
        this.attrInt = document.getElementById('attrInt');
        this.attrMem = document.getElementById('attrMem');
        this.attrPer = document.getElementById('attrPer');
        this.attrWill = document.getElementById('attrWill');
        this.attrChar = document.getElementById('attrChar');
        this.valInt = document.getElementById('valInt');
        this.valMem = document.getElementById('valMem');
        this.valPer = document.getElementById('valPer');
        this.valWill = document.getElementById('valWill');
        this.valChar = document.getElementById('valChar');
        
        // Skills browser
        this.skillCategories = document.getElementById('skillCategories');
        this.skillDetails = document.getElementById('skillDetails');
        this.skillSearch = document.getElementById('skillSearch');
        this.skillFilter = document.getElementById('skillFilter');
        
        // Planner
        this.planName = document.getElementById('planName');
        this.planList = document.getElementById('planList');
        this.sumTotalSkills = document.getElementById('sumTotalSkills');
        this.sumTotalTime = document.getElementById('sumTotalTime');
        this.sumSpNeeded = document.getElementById('sumSpNeeded');
        this.sumBookCost = document.getElementById('sumBookCost');
        this.injLargeCount = document.getElementById('injLargeCount');
        this.injTotalCost = document.getElementById('injTotalCost');
        this.prereqWarning = document.getElementById('prereqWarning');
        
        // Calculator
        this.calcTabs = document.querySelectorAll('.calc-tab');
        this.calcPanes = document.querySelectorAll('.calc-pane');
        
        // Modals
        this.skillPickerModal = document.getElementById('skillPickerModal');
        this.skillDetailModal = document.getElementById('skillDetailModal');
        
        // Loading
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.messageArea = document.getElementById('messageArea');
    }

    bindEvents() {
        // Navigation
        this.navItems.forEach(item => {
            item.addEventListener('click', () => this.switchView(item.dataset.view));
        });

        // Character login
        this.esiLoginBtn?.addEventListener('click', () => esiAuth.initiateLogin());
        
        // Character switch
        this.charSwitchBtn?.addEventListener('click', () => this.toggleCharacterList());
        
        // Quick actions
        document.getElementById('quickPlanBtn')?.addEventListener('click', () => this.switchView('skills'));
        document.getElementById('quickImportBtn')?.addEventListener('click', () => this.importPlan());
        document.getElementById('quickExportBtn')?.addEventListener('click', () => this.exportPlan());
        document.getElementById('quickClearBtn')?.addEventListener('click', () => this.clearPlan());
        
        // Skill search
        this.skillSearch?.addEventListener('input', (e) => this.filterSkills(e.target.value));
        this.skillFilter?.addEventListener('change', () => this.renderSkillCategories());
        
        // Planner actions
        document.getElementById('renamePlanBtn')?.addEventListener('click', () => this.renamePlan());
        document.getElementById('loadPlanBtn')?.addEventListener('click', () => this.loadSavedPlan());
        document.getElementById('savePlanBtn')?.addEventListener('click', () => this.savePlanDialog());
        document.getElementById('optimizePlanBtn')?.addEventListener('click', () => this.optimizePlan());
        document.getElementById('addSkillToPlanBtn')?.addEventListener('click', () => this.openSkillPicker());
        document.getElementById('autoFixPrereqs')?.addEventListener('click', () => this.autoFixPrereqs());
        
        // Calculator tabs
        this.calcTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchCalcTab(tab.dataset.calc));
        });
        
        // Attribute sliders
        ['calcInt', 'calcMem', 'calcPer', 'calcWill', 'calcChar'].forEach(id => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', () => this.updateCalcDisplay());
            }
        });
        
        // Modal close buttons
        document.getElementById('closeSkillPicker')?.addEventListener('click', () => this.closeSkillPicker());
        document.getElementById('closeSkillDetail')?.addEventListener('click', () => this.closeSkillDetail());
        document.getElementById('closeDetailBtn')?.addEventListener('click', () => this.closeSkillDetail());
        document.getElementById('addToPlanFromDetail')?.addEventListener('click', () => this.addSelectedSkillToPlan());
        
        // Skill picker search
        document.getElementById('pickerSearch')?.addEventListener('input', (e) => this.filterPickerSkills(e.target.value));
        
        // Mobile toggle
        document.getElementById('toggleSidebar')?.addEventListener('click', () => this.toggleSidebar());
        
        // Plan name edit
        this.planName?.addEventListener('blur', () => {
            skillPlanner.setName(this.planName.value);
        });
        
        // Listen for plan changes
        skillPlanner.addListener(() => this.onPlanChanged());
    }

    // View switching
    switchView(viewName) {
        this.currentView = viewName;
        
        // Update nav
        this.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });
        
        // Update views
        this.views.forEach(view => {
            view.classList.toggle('active', view.id === viewName + 'View');
        });
        
        // Update title
        const titles = {
            dashboard: 'Dashboard',
            skills: 'Skill Browser',
            planner: 'Skill Planner',
            calculator: 'Training Calculator'
        };
        this.pageTitle.textContent = titles[viewName] || 'Skill Planner';
        
        // View-specific initialization
        if (viewName === 'skills') {
            this.renderSkillCategories();
        } else if (viewName === 'planner') {
            this.renderPlan();
            this.updatePlanSummary();
        } else if (viewName === 'calculator') {
            this.initCalculator();
        }
    }

    switchCalcTab(tabName) {
        this.calcTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.calc === tabName);
        });
        
        this.calcPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === 'calc' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
        });
    }

    // Character loading
    async loadCharacter(characterId) {
        this.showLoading('Loading character data...');
        
        try {
            this.currentCharacter = characterId;
            
            // Fetch all character data
            const [skills, attributes, queue] = await Promise.all([
                characterManager.fetchSkills(characterId),
                characterManager.fetchAttributes(characterId),
                characterManager.fetchSkillQueue(characterId)
            ]);
            
            this.currentCharacterData = { skills, attributes, queue };
            
            // Update UI
            await this.updateCharacterUI(characterId);
            
            // Load training calc attributes
            trainingCalc.loadFromCharacter(characterId);
            
        } catch (e) {
            this.showMessage('Failed to load character: ' + e.message, 'error');
            console.error(e);
        } finally {
            this.hideLoading();
        }
    }

    async updateCharacterUI(characterId) {
        const charData = esiAuth.tokens[characterId];
        if (!charData) return;
        
        // Show character info
        this.loginPrompt?.classList.add('hidden');
        this.characterInfo?.classList.remove('hidden');
        
        // Update portrait and name
        this.charPortrait.src = characterManager.getPortraitUrl(characterId, 128);
        this.charName.textContent = charData.characterName;
        
        // Update stats
        const summary = characterManager.getCharacterSummary(characterId);
        if (summary) {
            this.charMeta.textContent = `${characterManager.formatSP(summary.totalSP)} SP • ${summary.skillsTrained} Skills`;
            
            // Dashboard stats
            this.totalSp.textContent = characterManager.formatSP(summary.totalSP);
            this.skillsTrained.textContent = summary.skillsTrained;
            this.skillsAtFive.textContent = summary.skillsAtFive;
            this.unallocatedSp.textContent = characterManager.formatSP(summary.unallocatedSP);
        }
        
        // Update attributes
        if (this.currentCharacterData?.attributes) {
            const attrs = this.currentCharacterData.attributes;
            this.updateAttributeDisplay('Int', attrs.intelligence);
            this.updateAttributeDisplay('Mem', attrs.memory);
            this.updateAttributeDisplay('Per', attrs.perception);
            this.updateAttributeDisplay('Will', attrs.willpower);
            this.updateAttributeDisplay('Char', attrs.charisma);
        }
        
        // Render character list
        this.renderCharacterList();
    }

    updateAttributeDisplay(suffix, value) {
        const bar = document.getElementById('attr' + suffix);
        const val = document.getElementById('val' + suffix);
        if (bar && val) {
            const percent = ((value - 17) / 15) * 100; // 17 base, max ~32
            bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
            val.textContent = value;
        }
    }

    renderCharacterList() {
        const characters = esiAuth.getAuthenticatedCharacters();
        if (characters.length <= 1) {
            this.characterList?.classList.add('hidden');
            return;
        }
        
        this.characterList.innerHTML = characters.map(char => `
            <div class="char-list-item" data-char-id="${char.characterId}">
                <img src="${characterManager.getPortraitUrl(char.characterId, 64)}" alt="">
                <span>${char.characterName}</span>
            </div>
        `).join('');
        
        // Bind click events
        this.characterList.querySelectorAll('.char-list-item').forEach(item => {
            item.addEventListener('click', async () => {
                const charId = item.dataset.charId;
                esiAuth.setCurrentCharacter(charId);
                await this.loadCharacter(charId);
                this.characterList.classList.add('hidden');
            });
        });
    }

    toggleCharacterList() {
        this.characterList?.classList.toggle('hidden');
    }

    // Skill browser
    renderSkillCategories() {
        if (!this.skillCategories) return;
        
        const filter = this.skillFilter?.value || 'all';
        
        // Group skills by category
        const groups = {};
        Object.entries(SKILLS).forEach(([id, skill]) => {
            if (!groups[skill.group]) {
                groups[skill.group] = [];
            }
            groups[skill.group].push({ id: parseInt(id), ...skill });
        });
        
        this.skillCategories.innerHTML = Object.entries(groups).map(([groupName, skills]) => {
            // Filter skills
            const filtered = skills.filter(skill => {
                if (filter === 'all') return true;
                const level = this.getCharacterSkillLevel(skill.id);
                if (filter === 'untrained') return level === 0;
                if (filter === 'partial') return level > 0 && level < 5;
                if (filter === 'maxed') return level === 5;
                return true;
            });
            
            if (filtered.length === 0) return '';
            
            return `
                <div class="cat-group">
                    <div class="cat-header">
                        <i class="fas fa-chevron-right"></i>
                        <span>${groupName}</span>
                        <span class="cat-count">${filtered.length}</span>
                    </div>
                    <div class="cat-skills">
                        ${filtered.map(skill => this.renderSkillItem(skill)).join('')}
                    </div>
                </div>
            `;
        }).join('');
        
        // Bind events
        this.skillCategories.querySelectorAll('.cat-header').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('expanded');
                header.nextElementSibling?.classList.toggle('expanded');
            });
        });
        
        this.skillCategories.querySelectorAll('.skill-item').forEach(item => {
            item.addEventListener('click', () => {
                const skillId = parseInt(item.dataset.skillId);
                this.selectSkill(skillId);
                
                // Update active state
                this.skillCategories.querySelectorAll('.skill-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    renderSkillItem(skill) {
        const level = this.getCharacterSkillLevel(skill.id);
        const dots = Array(5).fill(0).map((_, i) => 
            `<span class="level-dot ${i < level ? 'trained' : ''}"></span>`
        ).join('');
        
        const inPlan = skillPlanner.isInPlan(skill.id);
        const planIcon = inPlan ? '<i class="fas fa-clipboard-check" style="color: var(--accent-color); margin-left: 5px;"></i>' : '';
        
        return `
            <div class="skill-item" data-skill-id="${skill.id}">
                <span>${skill.name}${planIcon}</span>
                <div class="skill-level">${dots}</div>
            </div>
        `;
    }

    getCharacterSkillLevel(skillId) {
        if (!this.currentCharacterData?.skills?.skills) return 0;
        const skill = this.currentCharacterData.skills.skills.find(s => s.skill_id === skillId);
        return skill ? skill.trained_skill_level : 0;
    }

    selectSkill(skillId) {
        this.selectedSkill = skillId;
        const skill = SKILLS[skillId];
        if (!skill) return;
        
        const currentLevel = this.getCharacterSkillLevel(skillId);
        const inPlan = skillPlanner.isInPlan(skillId);
        const planItem = skillPlanner.getPlanSkill(skillId);
        const plannedLevel = planItem ? planItem.targetLevel : null;
        
        // Calculate SP and time for next level
        let nextLevelHtml = '';
        if (currentLevel < 5) {
            const sp = trainingCalc.spNeeded(skillId, currentLevel, currentLevel + 1);
            const time = trainingCalc.calculateTime(sp, ATTRIBUTES[skill.primary], ATTRIBUTES[skill.secondary]);
            nextLevelHtml = `
                <div class="detail-next-level">
                    <h4>Next Level (${currentLevel + 1})</h4>
                    <p>SP Required: ${sp.toLocaleString()}</p>
                    <p>Training Time: ${trainingCalc.formatTime(time)}</p>
                    <button class="btn-primary" onclick="app.addSkillToPlan(${skillId}, ${currentLevel + 1})">
                        <i class="fas fa-plus"></i> Add to Plan
                    </button>
                </div>
            `;
        }
        
        // Prerequisites
        let prereqsHtml = '';
        if (skill.prereqs) {
            const prereqs = Object.entries(skill.prereqs).map(([prereqId, level]) => {
                const prereqSkill = SKILLS[prereqId];
                const prereqLevel = this.getCharacterSkillLevel(parseInt(prereqId));
                const met = prereqLevel >= level;
                return `
                    <div class="prereq-item ${met ? 'met' : 'missing'}">
                        <span>${prereqSkill?.name || 'Unknown'} ${level}</span>
                        <span>${met ? '<i class="fas fa-check"></i>' : `(Have: ${prereqLevel})`}</span>
                    </div>
                `;
            }).join('');
            
            prereqsHtml = `
                <div class="detail-prereqs">
                    <h4>Prerequisites</h4>
                    ${prereqs}
                </div>
            `;
        }
        
        // Attributes display
        const primaryAttr = ATTRIBUTES[skill.primary];
        const secondaryAttr = ATTRIBUTES[skill.secondary];
        
        this.skillDetails.innerHTML = `
            <div class="skill-detail-content">
                <h2>${skill.name}</h2>
                <p class="skill-desc">${skill.desc || ''}</p>
                
                <div class="detail-stats">
                    <div class="detail-stat">
                        <span class="label">Current Level</span>
                        <span class="value">${currentLevel}/5</span>
                    </div>
                    <div class="detail-stat">
                        <span class="label">Rank</span>
                        <span class="value">${skill.rank}</span>
                    </div>
                    <div class="detail-stat">
                        <span class="label">Primary</span>
                        <span class="value">${primaryAttr}</span>
                    </div>
                    <div class="detail-stat">
                        <span class="label">Secondary</span>
                        <span class="value">${secondaryAttr}</span>
                    </div>
                </div>
                
                ${inPlan ? `
                    <div class="detail-in-plan">
                        <i class="fas fa-clipboard-check"></i>
                        In plan at level ${plannedLevel}
                    </div>
                ` : ''}
                
                ${nextLevelHtml}
                ${prereqsHtml}
            </div>
        `;
        
        // Add some CSS for the detail view
        const style = document.createElement('style');
        style.textContent = `
            .skill-detail-content h2 { color: var(--accent-color); margin-bottom: 10px; }
            .skill-desc { color: var(--text-subtle-color); margin-bottom: 20px; line-height: 1.6; }
            .detail-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; }
            .detail-stat { display: flex; justify-content: space-between; padding: 10px; background: var(--secondary-color); border-radius: 4px; }
            .detail-stat .label { color: var(--text-subtle-color); }
            .detail-stat .value { font-weight: 600; }
            .detail-next-level { background: var(--secondary-color); padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .detail-next-level h4 { margin-bottom: 10px; color: var(--text-color); }
            .detail-next-level p { color: var(--text-subtle-color); margin-bottom: 5px; }
            .detail-next-level button { margin-top: 10px; }
            .detail-prereqs h4 { margin-bottom: 10px; }
            .prereq-item { display: flex; justify-content: space-between; padding: 8px; background: var(--bg-color); border-radius: 4px; margin-bottom: 5px; }
            .prereq-item.met { border-left: 3px solid var(--success-color); }
            .prereq-item.missing { border-left: 3px solid var(--warning-color); }
            .detail-in-plan { background: rgba(232, 217, 0, 0.1); border: 1px solid var(--accent-color); padding: 10px; border-radius: 6px; margin-bottom: 20px; color: var(--accent-color); }
        `;
        if (!document.getElementById('skill-detail-styles')) {
            style.id = 'skill-detail-styles';
            document.head.appendChild(style);
        }
    }

    filterSkills(searchTerm) {
        const term = searchTerm.toLowerCase();
        const items = this.skillCategories?.querySelectorAll('.skill-item');
        
        items?.forEach(item => {
            const name = item.querySelector('span')?.textContent.toLowerCase() || '';
            item.style.display = name.includes(term) ? '' : 'none';
        });
    }

    // Planner
    renderPlan() {
        if (!this.planList) return;
        
        const plan = skillPlanner.getPlan();
        
        if (plan.length === 0) {
            this.planList.innerHTML = '<p class="empty-state">No skills in plan yet. Add skills from the browser.</p>';
            this.planName.value = skillPlanner.getName();
            return;
        }
        
        this.planName.value = skillPlanner.getName();
        
        this.planList.innerHTML = plan.map(item => {
            const skill = SKILLS[item.skillId];
            const currentLevel = this.getCharacterSkillLevel(item.skillId);
            
            // Check prerequisites
            const missing = skillPlanner.getMissingPrerequisites(item.skillId, item.targetLevel, this.currentCharacterData?.skills);
            const hasPrereqIssue = missing.length > 0;
            
            // Calculate time
            const spNeeded = trainingCalc.spNeeded(item.skillId, currentLevel, item.targetLevel);
            const time = trainingCalc.calculateTime(spNeeded, ATTRIBUTES[skill.primary], ATTRIBUTES[skill.secondary]);
            
            return `
                <div class="plan-skill-item" data-skill-id="${item.skillId}">
                    <div class="skill-info">
                        <div class="skill-name">${skill.name}</div>
                        <div class="skill-prereq ${!hasPrereqIssue ? 'hidden' : ''}">
                            <i class="fas fa-exclamation-triangle"></i>
                            Missing prereqs
                        </div>
                    </div>
                    <select class="level-select" data-skill-id="${item.skillId}">
                        ${[1,2,3,4,5].map(l => `<option value="${l}" ${l === item.targetLevel ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                    <span class="skill-time">${trainingCalc.formatTime(time)}</span>
                    <button class="remove-btn" data-skill-id="${item.skillId}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        // Bind events
        this.planList.querySelectorAll('.level-select').forEach(select => {
            select.addEventListener('change', (e) => {
                skillPlanner.updateSkillLevel(parseInt(e.target.dataset.skillId), parseInt(e.target.value));
            });
        });
        
        this.planList.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                skillPlanner.removeSkill(parseInt(btn.dataset.skillId));
            });
        });
    }

    updatePlanSummary() {
        const summary = skillPlanner.getSummary(this.currentCharacterData?.skills);
        
        this.sumTotalSkills.textContent = summary.totalSkills;
        this.sumTotalTime.textContent = summary.totalTime;
        this.sumSpNeeded.textContent = characterManager.formatSP(summary.totalSP);
        
        // Injector estimate
        if (this.currentCharacterData?.skills) {
            const totalSp = characterManager.calculateTotalSP(this.currentCharacterData.skills);
            const injectorCalc = injectorCalc.calculateInjectors(totalSp, totalSp + summary.totalSP);
            const cost = injectorCalc.calculateCost(injectorCalc.count);
            
            this.injLargeCount.textContent = injectorCalc.count;
            this.injTotalCost.textContent = cost.formatted;
        }
        
        // Prereq warning
        this.prereqWarning?.classList.toggle('hidden', !summary.hasPrereqIssues);
        
        // Update badge
        this.updatePlanBadge();
    }

    updatePlanBadge() {
        const count = skillPlanner.getPlanLength();
        this.planBadge.textContent = count;
        this.planBadge?.classList.toggle('hidden', count === 0);
        
        // Update mini summary
        if (count > 0) {
            this.planSummaryMini?.classList.remove('hidden');
            this.miniSkills.textContent = count;
            
            const summary = skillPlanner.getSummary(this.currentCharacterData?.skills);
            this.miniTime.textContent = summary.totalTime;
        } else {
            this.planSummaryMini?.classList.add('hidden');
        }
    }

    onPlanChanged() {
        this.renderPlan();
        this.updatePlanSummary();
        
        // Refresh skill list to show icons
        if (this.currentView === 'skills') {
            this.renderSkillCategories();
        }
    }

    addSkillToPlan(skillId, targetLevel) {
        const result = skillPlanner.addSkill(skillId, targetLevel, this.currentCharacterData?.skills);
        this.showMessage(result.message, result.success ? 'success' : 'warning');
    }

    autoFixPrereqs() {
        const added = skillPlanner.autoResolvePrerequisites(this.currentCharacterData?.skills);
        if (added.length > 0) {
            this.showMessage(`Added ${added.length} prerequisite skills`, 'success');
        } else {
            this.showMessage('All prerequisites are satisfied', 'info');
        }
    }

    optimizePlan() {
        skillPlanner.optimizeOrder(this.currentCharacterData?.skills);
        this.showMessage('Plan optimized for prerequisite order', 'success');
    }

    clearPlan() {
        if (confirm('Clear all skills from plan?')) {
            skillPlanner.clearPlan();
            this.showMessage('Plan cleared', 'info');
        }
    }

    renamePlan() {
        const newName = prompt('Plan name:', skillPlanner.getName());
        if (newName) {
            skillPlanner.setName(newName);
        }
    }

    exportPlan() {
        const json = skillPlanner.exportPlan();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${skillPlanner.getName().replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage('Plan exported', 'success');
    }

    importPlan() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = skillPlanner.importPlan(event.target.result);
                this.showMessage(result.message, result.success ? 'success' : 'error');
            };
            reader.readAsText(file);
        };
        
        input.click();
    }

    savePlanDialog() {
        const name = prompt('Save plan as:', skillPlanner.getName());
        if (name) {
            skillPlanner.saveNamedPlan(name);
            this.showMessage('Plan saved', 'success');
        }
    }

    loadSavedPlan() {
        const plans = skillPlanner.getSavedPlanNames();
        if (plans.length === 0) {
            this.showMessage('No saved plans found', 'warning');
            return;
        }
        
        const selected = prompt('Saved plans:\n' + plans.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\nEnter number to load:');
        const index = parseInt(selected) - 1;
        
        if (index >= 0 && index < plans.length) {
            skillPlanner.loadNamedPlan(plans[index]);
            this.showMessage('Plan loaded', 'success');
        }
    }

    // Skill picker modal
    openSkillPicker() {
        this.skillPickerModal?.classList.remove('hidden');
        this.renderPickerCategories();
        this.renderPickerSkills();
    }

    closeSkillPicker() {
        this.skillPickerModal?.classList.add('hidden');
    }

    renderPickerCategories() {
        const container = document.getElementById('pickerCategories');
        if (!container) return;
        
        const groups = [...new Set(Object.values(SKILLS).map(s => s.group))];
        
        container.innerHTML = `
            <button class="picker-cat-btn active" data-cat="all">All</button>
            ${groups.map(g => `<button class="picker-cat-btn" data-cat="${g}">${g}</button>`).join('')}
        `;
        
        container.querySelectorAll('.picker-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.picker-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderPickerSkills(btn.dataset.cat);
            });
        });
    }

    renderPickerSkills(category = 'all', search = '') {
        const container = document.getElementById('pickerSkills');
        if (!container) return;
        
        let skills = Object.entries(SKILLS).map(([id, skill]) => ({ id: parseInt(id), ...skill }));
        
        if (category !== 'all') {
            skills = skills.filter(s => s.group === category);
        }
        
        if (search) {
            const term = search.toLowerCase();
            skills = skills.filter(s => s.name.toLowerCase().includes(term));
        }
        
        skills.sort((a, b) => a.name.localeCompare(b.name));
        
        container.innerHTML = skills.map(skill => {
            const currentLevel = this.getCharacterSkillLevel(skill.id);
            const inPlan = skillPlanner.isInPlan(skill.id);
            
            return `
                <div class="picker-skill-item" data-skill-id="${skill.id}">
                    <span>${skill.name}</span>
                    <select class="picker-level-select" data-skill-id="${skill.id}">
                        ${[1,2,3,4,5].map(l => `<option value="${l}" ${l === currentLevel + 1 ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                    <button class="btn-primary btn-small" onclick="app.addPickerSkill(${skill.id})">
                        <i class="fas fa-plus"></i> Add
                    </button>
                </div>
            `;
        }).join('');
    }

    filterPickerSkills(search) {
        const activeCat = document.querySelector('.picker-cat-btn.active')?.dataset.cat || 'all';
        this.renderPickerSkills(activeCat, search);
    }

    addPickerSkill(skillId) {
        const select = document.querySelector(`.picker-level-select[data-skill-id="${skillId}"]`);
        const level = parseInt(select?.value || 1);
        this.addSkillToPlan(skillId, level);
    }

    addSelectedSkillToPlan() {
        if (!this.selectedSkill) return;
        
        const currentLevel = this.getCharacterSkillLevel(this.selectedSkill);
        if (currentLevel < 5) {
            this.addSkillToPlan(this.selectedSkill, currentLevel + 1);
        }
        this.closeSkillDetail();
    }

    closeSkillDetail() {
        this.skillDetailModal?.classList.add('hidden');
    }

    // Calculator
    initCalculator() {
        if (this.currentCharacterData?.attributes) {
            const attrs = this.currentCharacterData.attributes;
            this.setSliderValue('calcInt', attrs.intelligence);
            this.setSliderValue('calcMem', attrs.memory);
            this.setSliderValue('calcPer', attrs.perception);
            this.setSliderValue('calcWill', attrs.willpower);
            this.setSliderValue('calcChar', attrs.charisma);
        }
        
        this.updateCalcDisplay();
        this.updateRemapSuggestion();
    }

    setSliderValue(id, value) {
        const slider = document.getElementById(id);
        const display = document.getElementById(id.replace('calc', 'disp'));
        if (slider) slider.value = value;
        if (display) display.textContent = value;
    }

    updateCalcDisplay() {
        // Update display values
        ['Int', 'Mem', 'Per', 'Will', 'Char'].forEach(attr => {
            const slider = document.getElementById('calc' + attr);
            const display = document.getElementById('disp' + attr);
            if (slider && display) {
                display.textContent = slider.value;
            }
        });
        
        // Calculate with current plan
        this.calculateImpact();
    }

    calculateImpact() {
        const attrs = {
            intelligence: parseInt(document.getElementById('calcInt')?.value || 20),
            memory: parseInt(document.getElementById('calcMem')?.value || 20),
            perception: parseInt(document.getElementById('calcPer')?.value || 20),
            willpower: parseInt(document.getElementById('calcWill')?.value || 20),
            charisma: parseInt(document.getElementById('calcChar')?.value || 20)
        };
        
        // Current time
        const currentTime = trainingCalc.calculatePlanTime(skillPlanner.getPlan(), this.currentCharacterData?.skills);
        document.getElementById('currentPlanTime').textContent = currentTime.formattedTime;
        
        // New time with adjusted attributes
        trainingCalc.setAttributes(attrs);
        const newTime = trainingCalc.calculatePlanTime(skillPlanner.getPlan(), this.currentCharacterData?.skills);
        document.getElementById('newPlanTime').textContent = newTime.formattedTime;
        
        // Difference
        const diff = currentTime.totalMinutes - newTime.totalMinutes;
        const diffEl = document.getElementById('timeDiff');
        if (diffEl) {
            if (diff > 0) {
                diffEl.innerHTML = `<span><i class="fas fa-arrow-down"></i> Save ${trainingCalc.formatTime(diff)}</span>`;
                diffEl.className = 'impact-diff positive';
            } else if (diff < 0) {
                diffEl.innerHTML = `<span><i class="fas fa-arrow-up"></i> Add ${trainingCalc.formatTime(-diff)}</span>`;
                diffEl.className = 'impact-diff negative';
            } else {
                diffEl.innerHTML = '<span>No change</span>';
                diffEl.className = 'impact-diff';
            }
        }
        
        // Reset training calc to character values
        if (this.currentCharacter) {
            trainingCalc.loadFromCharacter(this.currentCharacter);
        }
    }

    updateRemapSuggestion() {
        const plan = skillPlanner.getPlan();
        if (plan.length === 0) return;
        
        const suggested = trainingCalc.optimizeAttributes(plan, this.currentCharacterData?.skills);
        
        // Display suggested remap
        const container = document.getElementById('suggestedRemap');
        if (container) {
            container.innerHTML = Object.entries(suggested).map(([attr, val]) => `
                <div class="remap-attr">
                    <span class="attr-name">${attr.charAt(0).toUpperCase() + attr.slice(1)}</span>
                    <span class="attr-val">${val}</span>
                </div>
            `).join('');
        }
        
        // Display current (simplified - just showing base)
        const currentContainer = document.getElementById('currentRemap');
        if (currentContainer && this.currentCharacterData?.attributes) {
            const attrs = this.currentCharacterData.attributes;
            currentContainer.innerHTML = `
                <div class="remap-attr">
                    <span class="attr-name">Intelligence</span>
                    <span class="attr-val">${attrs.intelligence || 20}</span>
                </div>
                <div class="remap-attr">
                    <span class="attr-name">Memory</span>
                    <span class="attr-val">${attrs.memory || 20}</span>
                </div>
                <div class="remap-attr">
                    <span class="attr-name">Perception</span>
                    <span class="attr-val">${attrs.perception || 20}</span>
                </div>
                <div class="remap-attr">
                    <span class="attr-name">Willpower</span>
                    <span class="attr-val">${attrs.willpower || 20}</span>
                </div>
                <div class="remap-attr">
                    <span class="attr-name">Charisma</span>
                    <span class="attr-val">${attrs.charisma || 19}</span>
                </div>
            `;
        }
    }

    // Utility
    updateUI() {
        // Called when character changes or plan changes
        this.updatePlanBadge();
        
        if (this.currentView === 'planner') {
            this.renderPlan();
            this.updatePlanSummary();
        }
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            const eveTime = new Date(now.toUTCString());
            const timeStr = eveTime.toISOString().substr(11, 8);
            
            const el = document.getElementById('eveTime');
            if (el) el.textContent = timeStr;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    toggleSidebar() {
        document.getElementById('sidebar')?.classList.toggle('collapsed');
    }

    showLoading(text = 'Loading...') {
        this.loadingText.textContent = text;
        this.loadingOverlay?.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingOverlay?.classList.add('hidden');
    }

    showMessage(message, type = 'info') {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.innerHTML = message;
        
        this.messageArea?.appendChild(msg);
        this.messageArea?.classList.remove('hidden');
        
        setTimeout(() => {
            msg.remove();
            if (this.messageArea?.children.length === 0) {
                this.messageArea.classList.add('hidden');
            }
        }, 5000);
    }
}

// Initialize app
const app = new SkillPlannerApp();
