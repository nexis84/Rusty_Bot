// Main Application Module
// Orchestrates all functionality and UI interactions

class SkillPlannerApp {
    constructor() {
        this.currentView = 'dashboard';
        this.currentCharacter = null;
        this.currentCharacterData = null;
        this.selectedSkill = null;
        this.calculatorOverrides = null;
        this.init();
    }

    async init() {
        this.bindElements();
        this.bindEvents();
        this.startClock();
        
        // Validate SKILLS data is loaded
        if (!window.SKILLS || Object.keys(window.SKILLS).length === 0) {
            console.error('SKILLS data is empty or not loaded!');
            this.showMessage('Failed to load skill database. Please refresh the page.', 'error');
            return;
        }
        
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
        } else {
            skillPlanner.setActiveCharacter(null);
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
        this.activeBooster = document.getElementById('activeBooster');
        this.cloneLocation = document.getElementById('cloneLocation');
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
        this.skillQueueList = document.getElementById('skillQueueList');
        this.recentSkillsList = document.getElementById('recentSkillsList');
        this.currentSkillsList = document.getElementById('currentSkillsList');
        
        // Skills browser
        this.skillCategories = document.getElementById('skillCategories');
        this.skillDetails = document.getElementById('skillDetails');
        this.skillSearch = document.getElementById('skillSearch');
        this.skillFilter = document.getElementById('skillFilter');
        
        // My Skills view
        this.mySkillsList = document.getElementById('mySkillsList');
        this.mySkillsSearch = document.getElementById('mySkillsSearch');
        this.mySkillsFilter = document.getElementById('mySkillsFilter');
        this.mySkillsTotal = document.getElementById('mySkillsTotal');
        this.mySkillsAtFive = document.getElementById('mySkillsAtFive');
        
        // Planner
        this.planName = document.getElementById('planName');
        this.planList = document.getElementById('planList');
        this.sumTotalSkills = document.getElementById('sumTotalSkills');
        this.sumTotalTime = document.getElementById('sumTotalTime');
        this.sumTotalTimeCompareRow = document.getElementById('sumTotalTimeCompareRow');
        this.sumTotalTimeCompare = document.getElementById('sumTotalTimeCompare');
        this.sumSpNeeded = document.getElementById('sumSpNeeded');
        this.sumBookCost = document.getElementById('sumBookCost');
        this.injLargeCount = document.getElementById('injLargeCount');
        this.injTotalCost = document.getElementById('injTotalCost');
        this.injCompareRow = document.getElementById('injCompareRow');
        this.injCompareText = document.getElementById('injCompareText');
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
        document.getElementById('charLogoutBtn')?.addEventListener('click', () => this.logoutCharacter());
        
        // Quick actions
        document.getElementById('quickPlanBtn')?.addEventListener('click', () => this.switchView('skills'));
        document.getElementById('quickImportBtn')?.addEventListener('click', () => this.importPlan());
        document.getElementById('quickExportBtn')?.addEventListener('click', () => this.exportPlan());
        document.getElementById('quickClearBtn')?.addEventListener('click', () => this.clearPlan());
        
        // Skill search
        this.skillSearch?.addEventListener('input', (e) => this.filterSkills(e.target.value));
        this.skillFilter?.addEventListener('change', () => this.renderSkillCategories());
        
        // My Skills search
        this.mySkillsSearch?.addEventListener('input', (e) => this.filterMySkills(e.target.value));
        this.mySkillsFilter?.addEventListener('change', () => this.renderMySkills());
        
        // Planner actions
        document.getElementById('plannerImportPlanBtn')?.addEventListener('click', () => this.importPlan());
        document.getElementById('plannerExportPlanBtn')?.addEventListener('click', () => this.exportPlan());
        document.getElementById('renamePlanBtn')?.addEventListener('click', () => this.renamePlan());
        document.getElementById('loadPlanBtn')?.addEventListener('click', () => this.loadSavedPlan());
        document.getElementById('savePlanBtn')?.addEventListener('click', () => this.savePlanDialog());
        document.getElementById('deletePlanBtn')?.addEventListener('click', () => this.deletePlan());
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

        // Implant and accelerator controls
        ['implant6', 'implant7', 'implant8', 'implant9', 'implant10'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.updateCalcDisplay());
        });
        document.getElementById('acceleratorPreset')?.addEventListener('change', () => {
            this.updateCalcDisplay();
        });

        // Calculator actions
        document.getElementById('calcImportPlanBtn')?.addEventListener('click', () => this.importPlan());
        document.getElementById('calcExportPlanBtn')?.addEventListener('click', () => this.exportPlan());
        document.getElementById('applySuggestedRemap')?.addEventListener('click', () => this.applySuggestedRemap());
        document.getElementById('calcInjectorsBtn')?.addEventListener('click', () => this.runInjectorCalculator());
        
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
            mySkills: 'My Skills',
            planner: 'Skill Planner',
            calculator: 'Training Calculator'
        };
        this.pageTitle.textContent = titles[viewName] || 'Skill Planner';
        
        // View-specific initialization
        if (viewName === 'skills') {
            this.renderSkillCategories();
        } else if (viewName === 'mySkills') {
            this.renderMySkills();
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
            this.calculatorOverrides = null;
            skillPlanner.setActiveCharacter(characterId);

            // Always refresh from ESI on character load to avoid stale skill cache.
            characterManager.clearCharacterCache(characterId);
            
            // Fetch character data through manager to avoid request bursts against ESI.
            const fullData = await characterManager.getFullCharacterData(characterId);
            this.currentCharacterData = {
                skills: fullData.skills,
                attributes: fullData.attributes,
                queue: fullData.skillQueue,
                implants: fullData.implants,
                boosters: fullData.boosters,
                clones: fullData.clones
            };
            
            // Update UI
            await this.updateCharacterUI(characterId);
            
            // Load training calc attributes
            trainingCalc.loadFromCharacter(characterId);

            // Re-render sections that depend on fresh character data.
            this.renderMySkills();
            this.renderPlan();
            this.updatePlanSummary();
            this.updatePlanBadge();
            
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
        
        // Update active booster
        // Note: active cerebral accelerators cannot be detected via ESI — set manually in Calculator
        if (this.activeBooster) {
            this.activeBooster.textContent = 'Set in Calculator';
            this.activeBooster.title = 'Active cerebral accelerators cannot be read from ESI. Select one manually in the Training Calculator.';
        }
        
        // Update clone location
        if (this.cloneLocation) {
            const clones = this.currentCharacterData?.clones;
            if (clones && clones.home_location) {
                const locationId = clones.home_location.location_id;
                const locationType = clones.home_location.location_type;
                this.cloneLocation.textContent = locationType === 'station' ? 'Station' : 'Structure';
            } else {
                this.cloneLocation.textContent = 'Unknown';
            }
        }
        
        // Update attributes with accelerator bonus if active
        if (this.currentCharacterData?.attributes) {
            const attrs = this.currentCharacterData.attributes;
            const accelBonus = trainingCalc.cerebralAccelerator ? trainingCalc.acceleratorBonus : 0;
            this.updateAttributeDisplay('Int', attrs.intelligence, accelBonus);
            this.updateAttributeDisplay('Mem', attrs.memory, accelBonus);
            this.updateAttributeDisplay('Per', attrs.perception, accelBonus);
            this.updateAttributeDisplay('Will', attrs.willpower, accelBonus);
            this.updateAttributeDisplay('Char', attrs.charisma, accelBonus);
        }
        
        // Render character list
        this.renderCharacterList();
        
        // Render skill queue, current skills, and recent skills
        this.renderSkillQueue();
        this.renderCurrentSkills();
        this.renderRecentSkills();
    }

    updateAttributeDisplay(suffix, baseValue, bonusValue = 0) {
        const bar = document.getElementById('attr' + suffix);
        const valBase = document.getElementById('val' + suffix + 'Base');
        const valBonus = document.getElementById('val' + suffix + 'Bonus');
        
        if (bar && valBase && valBonus) {
            const totalValue = baseValue + bonusValue;
            const percent = ((totalValue - 17) / 15) * 100; // 17 base, max ~32
            bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
            
            // Display base value
            valBase.textContent = baseValue;
            
            // Display bonus in different color if present
            if (bonusValue > 0) {
                valBonus.textContent = ' +' + bonusValue;
            } else {
                valBonus.textContent = '';
            }
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

    logoutCharacter() {
        const charId = esiAuth.getCurrentCharacter();
        if (!charId) return;
        
        const char = esiAuth.tokens[charId];
        const charName = char?.characterName || 'Character';
        
        if (confirm(`Logout ${charName}?`)) {
            // Reset visible planner state while keeping persisted per-character plans.
            skillPlanner.setActiveCharacter(null);
            skillPlanner.clearSessionPlan();

            this.currentCharacter = null;
            this.currentCharacterData = null;
            this.calculatorOverrides = null;

            esiAuth.removeCharacter(charId);
            characterManager.removeCharacter(charId);
            
            // Update UI
            this.characterInfo?.classList.add('hidden');
            this.loginPrompt?.classList.remove('hidden');
            this.charName.textContent = 'Character Name';
            this.charPortrait.src = '';
            this.charMeta.textContent = '0 SP • 0 Skills';
            
            // Clear dashboard stats
            this.totalSp.textContent = '--';
            this.skillsTrained.textContent = '--';
            this.skillsAtFive.textContent = '--';
            this.unallocatedSp.textContent = '--';
            if (this.activeBooster) this.activeBooster.textContent = '--';
            if (this.cloneLocation) this.cloneLocation.textContent = '--';
            
            // Clear queue and recent skills
            if (this.skillQueueList) {
                this.skillQueueList.innerHTML = '<p class="empty-hint">Login to see your active skill queue</p>';
            }
            if (this.recentSkillsList) {
                this.recentSkillsList.innerHTML = '<p class="empty-hint">Login to see your recent skill training</p>';
            }

            this.renderMySkills();
            this.renderPlan();
            this.updatePlanSummary();
            
            this.showMessage(`Logged out ${charName}`, 'success');
        }
    }

    renderSkillQueue() {
        if (!this.skillQueueList) return;
        
        const charId = esiAuth.getCurrentCharacter();
        if (!charId || !this.currentCharacterData?.queue) {
            this.skillQueueList.innerHTML = '<p class="empty-hint">Login to see your active skill queue</p>';
            return;
        }
        
        const queue = this.currentCharacterData.queue.data || this.currentCharacterData.queue;
        if (!queue || queue.length === 0) {
            this.skillQueueList.innerHTML = '<p class="empty-hint">No skills in queue</p>';
            return;
        }
        
        this.skillQueueList.innerHTML = queue.slice(0, 5).map((item, index) => {
            const skill = window.SKILLS[item.skill_id];
            const skillName = skill ? skill.name : `Skill ${item.skill_id}`;
            const level = item.level_end;
            const position = index === 0 ? 'training' : `queue #${index + 1}`;
            const time = trainingCalc.formatTrainingTime(item.training_time_remaining || 0);
            
            return `
                <div class="queue-item ${index === 0 ? 'active' : ''}">
                    <span class="queue-position">${position}</span>
                    <span class="queue-name">${skillName} ${this.roman(level)}</span>
                    <span class="queue-time">${time}</span>
                </div>
            `;
        }).join('');
    }

    renderCurrentSkills() {
        if (!this.currentSkillsList) return;
        
        const charId = esiAuth.getCurrentCharacter();
        if (!charId || !this.currentCharacterData?.skills) {
            this.currentSkillsList.innerHTML = '<p class="empty-hint">Login to see your trained skills</p>';
            return;
        }
        
        const skills = this.currentCharacterData.skills.skills || [];
        if (skills.length === 0) {
            this.currentSkillsList.innerHTML = '<p class="empty-hint">No skills trained yet</p>';
            return;
        }
        
        // Sort by level (highest first) and take top 10
        const topSkills = skills
            .filter(s => s.trained_skill_level > 0)
            .sort((a, b) => b.trained_skill_level - a.trained_skill_level)
            .slice(0, 10);
        
        this.currentSkillsList.innerHTML = topSkills.map(skill => {
            const skillData = window.SKILLS[skill.skill_id];
            const skillName = skillData ? skillData.name : `Skill ${skill.skill_id}`;
            const level = skill.trained_skill_level;
            const sp = skill.skillpoints_in_skill;
            
            return `
                <div class="current-skill-item">
                    <span class="current-skill-name">${skillName}</span>
                    <span class="current-skill-level">${this.roman(level)}</span>
                    <span class="current-skill-sp">${characterManager.formatSP(sp)} SP</span>
                </div>
            `;
        }).join('') + (skills.length > 10 ? `<p class="more-hint">...and ${skills.length - 10} more skills</p>` : '');
    }

    renderRecentSkills() {
        if (!this.recentSkillsList) return;
        
        const charId = esiAuth.getCurrentCharacter();
        if (!charId || !this.currentCharacterData?.skills) {
            this.recentSkillsList.innerHTML = '<p class="empty-hint">Login to see your recent skill training</p>';
            return;
        }
        
        const skills = this.currentCharacterData.skills.skills || [];
        const maxedSkills = skills.filter(s => s.trained_skill_level === 5);
        const recentSkills = maxedSkills.slice(-5).reverse();
        
        if (recentSkills.length === 0) {
            this.recentSkillsList.innerHTML = '<p class="empty-hint">No maxed skills yet</p>';
            return;
        }
        
        this.recentSkillsList.innerHTML = recentSkills.map(skill => {
            const skillData = window.SKILLS[skill.skill_id];
            const skillName = skillData ? skillData.name : `Skill ${skill.skill_id}`;
            const sp = skill.skillpoints_in_skill;
            
            return `
                <div class="recent-item">
                    <span class="recent-name">${skillName} V</span>
                    <span class="recent-sp">${characterManager.formatSP(sp)} SP</span>
                </div>
            `;
        }).join('');
    }

    renderMySkills() {
        if (!this.mySkillsList) return;
        
        const charId = esiAuth.getCurrentCharacter();
        const skillsData = this.currentCharacterData?.skills?.data || this.currentCharacterData?.skills;
        if (!charId || !skillsData) {
            this.mySkillsList.innerHTML = '<p class="empty-state">Login to see your trained skills</p>';
            if (this.mySkillsTotal) this.mySkillsTotal.textContent = '0 skills';
            if (this.mySkillsAtFive) this.mySkillsAtFive.textContent = '0 at Level V';
            return;
        }
        
        let skills = skillsData.skills || [];
        const filter = this.mySkillsFilter?.value || 'all';
        const search = this.mySkillsSearch?.value?.toLowerCase() || '';
        
        // Apply filter
        if (filter === 'maxed') {
            skills = skills.filter(s => s.trained_skill_level === 5);
        } else if (filter === 'high') {
            skills = skills.filter(s => s.trained_skill_level >= 4);
        } else if (filter === 'partial') {
            skills = skills.filter(s => s.trained_skill_level >= 1 && s.trained_skill_level <= 3);
        }
        
        // Apply search
        if (search) {
            skills = skills.filter(s => {
                const skillData = window.SKILLS[s.skill_id];
                const name = skillData ? skillData.name.toLowerCase() : '';
                return name.includes(search);
            });
        }
        
        // Update stats
        const totalSkills = skillsData.skills?.length || 0;
        const maxedCount = skillsData.skills?.filter(s => s.trained_skill_level === 5).length || 0;
        if (this.mySkillsTotal) this.mySkillsTotal.textContent = `${totalSkills} skills`;
        if (this.mySkillsAtFive) this.mySkillsAtFive.textContent = `${maxedCount} at Level V`;
        
        if (skills.length === 0) {
            this.mySkillsList.innerHTML = '<p class="empty-state">No skills match your filter</p>';
            return;
        }
        
        // Sort by level (highest first), then by name
        skills = skills.sort((a, b) => {
            if (b.trained_skill_level !== a.trained_skill_level) {
                return b.trained_skill_level - a.trained_skill_level;
            }
            const nameA = window.SKILLS[a.skill_id]?.name || '';
            const nameB = window.SKILLS[b.skill_id]?.name || '';
            return nameA.localeCompare(nameB);
        });
        
        this.mySkillsList.innerHTML = skills.map(skill => {
            const skillData = window.SKILLS[skill.skill_id];
            const skillName = skillData ? skillData.name : `Skill ${skill.skill_id}`;
            const level = skill.trained_skill_level;
            const sp = skill.skillpoints_in_skill;
            
            return `
                <div class="my-skill-item">
                    <span class="my-skill-name">${skillName}</span>
                    <span class="my-skill-level ${level === 5 ? 'maxed' : ''}">${this.roman(level)}</span>
                    <span class="my-skill-sp">${characterManager.formatSP(sp)} SP</span>
                </div>
            `;
        }).join('');
    }

    filterMySkills(search) {
        this.renderMySkills();
    }

    roman(num) {
        const romans = ['I', 'II', 'III', 'IV', 'V'];
        return romans[num - 1] || num;
    }

    // Skill browser
    renderSkillCategories() {
        if (!this.skillCategories) return;
        
        const filter = this.skillFilter?.value || 'all';
        
        // Group skills by category
        const groups = {};
        Object.entries(window.SKILLS).forEach(([id, skill]) => {
            const skillId = parseInt(id);
            if (!this.isSkillVisible(skillId, skill)) return;

            if (!groups[skill.group]) {
                groups[skill.group] = [];
            }
            groups[skill.group].push({ id: skillId, ...skill });
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
    
    isSkillVisible(skillId, skillData = null) {
        const skill = skillData || window.SKILLS[skillId];
        if (!skill || !skill.name) return false;

        const name = skill.name.toLowerCase();
        const desc = (skill.desc || '').toLowerCase();

        // Filter out fake/placeholder/test/unpublished skills
        if (desc.includes('fake skill')) return false;
        if (desc.includes('does not exist in game')) return false;
        if (desc.includes('test skill') && desc.includes('never appear')) return false;
        if (name === 'test') return false;
        if (name.startsWith('test ')) return false;
        if (name.includes('security clearance')) return false;
        if (skill.group === 'Fake Skills') return false;
        
        // Filter out Jove, Polaris, and Concord ship skills (not available to players)
        if (name.startsWith('jove ')) return false;
        if (name === 'polaris') return false;
        if (name === 'concord') return false;
        
        // Filter out dev/GM only skills
        if (name === 'omnipotent') return false;
        
        // Filter out skills with empty descriptions (unpublished)
        if (!skill.desc || skill.desc.trim() === '') return false;

        // Show all published skills
        return true;
    }

    selectSkill(skillId) {
        this.selectedSkill = skillId;
        const skill = window.SKILLS[skillId];
        if (!skill) return;
        
        const currentLevel = this.getCharacterSkillLevel(skillId);
        const inPlan = skillPlanner.isInPlan(skillId);
        const planItem = skillPlanner.getPlanSkill(skillId);
        const plannedLevel = planItem ? planItem.targetLevel : null;
        const marketLinkUrl = getSkillMarketLink(skillId);
        
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
                const prereqSkill = window.SKILLS[prereqId];
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
                
                ${marketLinkUrl ? `
                    <a href="${marketLinkUrl}" target="_blank" class="market-link-btn">
                        <i class="fas fa-external-link-alt"></i>
                        View Skill Book in Market
                    </a>
                ` : ''}
                
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
            .market-link-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--secondary-color); color: var(--accent-color); text-decoration: none; border-radius: 6px; margin-bottom: 20px; font-size: 0.9rem; transition: background 0.2s; }
            .market-link-btn:hover { background: var(--accent-color); color: var(--bg-color); }
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

    withTrainingCalcState(work) {
        const original = {
            attributes: { ...trainingCalc.baseAttributes },
            implants: Object.fromEntries(
                Object.entries(trainingCalc.implantBonuses).map(([slot, data]) => [slot, data.bonus])
            ),
            accelerator: trainingCalc.cerebralAccelerator,
            acceleratorBonus: trainingCalc.acceleratorBonus
        };

        try {
            return work();
        } finally {
            trainingCalc.setAttributes(original.attributes);
            Object.entries(original.implants).forEach(([slot, bonus]) => {
                trainingCalc.setImplant(parseInt(slot), bonus);
            });
            trainingCalc.setCerebralAccelerator(original.accelerator, original.acceleratorBonus);
        }
    }

    applyTrainingSettings(settings) {
        if (!settings) return;

        trainingCalc.setAttributes(settings.attributes);
        Object.entries(settings.implants).forEach(([slot, bonus]) => {
            trainingCalc.setImplant(parseInt(slot), parseInt(bonus));
        });
        trainingCalc.setCerebralAccelerator(!!settings.accelerator.enabled, settings.accelerator.bonus || 10);
    }

    getCharacterTrainingSettings() {
        const attrs = this.currentCharacterData?.attributes || {
            intelligence: 20,
            memory: 20,
            perception: 20,
            willpower: 20,
            charisma: 19
        };

        const settings = {
            attributes: {
                intelligence: attrs.intelligence || 20,
                memory: attrs.memory || 20,
                perception: attrs.perception || 20,
                willpower: attrs.willpower || 20,
                charisma: attrs.charisma || 19
            },
            implants: { 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
            accelerator: { enabled: false, bonus: 10, typeId: 0 }
        };

        const implants = this.currentCharacterData?.implants || [];
        implants.forEach(implant => {
            const typeId = implant.type_id;
            if (typeId >= 9956 && typeId <= 9960) settings.implants[6] = typeId - 9955;
            else if (typeId >= 9961 && typeId <= 9965) settings.implants[7] = typeId - 9960;
            else if (typeId >= 9966 && typeId <= 9970) settings.implants[8] = typeId - 9965;
            else if (typeId >= 9971 && typeId <= 9975) settings.implants[9] = typeId - 9970;
            else if (typeId >= 9976 && typeId <= 9980) settings.implants[10] = typeId - 9975;
        });

        const boosters = this.currentCharacterData?.boosters || [];
        const active = boosters
            .map(b => window.CEREBRAL_ACCELERATORS?.find(a => a.typeId === b.type_id))
            .find(Boolean);

        if (active) {
            settings.accelerator = {
                enabled: true,
                bonus: active.bonus || 10,
                typeId: active.typeId
            };
        }

        return settings;
    }

    getCalculatorSettingsFromUI() {
        const acceleratorSelect = document.getElementById('acceleratorPreset');
        const selectedOption = acceleratorSelect?.selectedOptions?.[0];
        const selectedTypeId = parseInt(selectedOption?.dataset?.typeId || 0);
        const selectedBonus = parseInt(selectedOption?.dataset?.bonus || 0);

        return {
            attributes: {
                intelligence: parseInt(document.getElementById('calcInt')?.value || 20),
                memory: parseInt(document.getElementById('calcMem')?.value || 20),
                perception: parseInt(document.getElementById('calcPer')?.value || 20),
                willpower: parseInt(document.getElementById('calcWill')?.value || 20),
                charisma: parseInt(document.getElementById('calcChar')?.value || 20)
            },
            implants: {
                6: parseInt(document.getElementById('implant6')?.value || 0),
                7: parseInt(document.getElementById('implant7')?.value || 0),
                8: parseInt(document.getElementById('implant8')?.value || 0),
                9: parseInt(document.getElementById('implant9')?.value || 0),
                10: parseInt(document.getElementById('implant10')?.value || 0)
            },
            accelerator: {
                enabled: selectedBonus > 0,
                bonus: selectedBonus,
                typeId: selectedTypeId
            }
        };
    }

    calculatePlanSummaryWithSettings(settings) {
        return this.withTrainingCalcState(() => {
            this.applyTrainingSettings(settings);
            const summary = skillPlanner.getSummary(this.currentCharacterData?.skills);
            const totalSp = this.currentCharacterData?.skills
                ? characterManager.calculateTotalSP(this.currentCharacterData.skills)
                : 0;
            const injectors = injectorCalc.calculateInjectors(totalSp, totalSp + summary.totalSP);
            const injectorCost = injectorCalc.calculateCost(injectors.count);

            return {
                summary,
                injectors,
                injectorCost
            };
        });
    }

    settingsDiffer(a, b) {
        return JSON.stringify(a) !== JSON.stringify(b);
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

        const baselineSettings = this.getCharacterTrainingSettings();
        const hasOverrides = this.calculatorOverrides && this.settingsDiffer(this.calculatorOverrides, baselineSettings);

        this.planList.innerHTML = plan.map(item => {
            const skill = window.SKILLS[item.skillId];
            const currentLevel = this.getCharacterSkillLevel(item.skillId);
            
            // Check prerequisites
            const missing = skillPlanner.getMissingPrerequisites(item.skillId, item.targetLevel, this.currentCharacterData?.skills);
            const hasPrereqIssue = missing.length > 0;
            
            // Calculate time
            const spNeeded = trainingCalc.spNeeded(item.skillId, currentLevel, item.targetLevel);
            const baselineMinutes = this.withTrainingCalcState(() => {
                this.applyTrainingSettings(baselineSettings);
                return trainingCalc.calculateTime(spNeeded, ATTRIBUTES[skill.primary], ATTRIBUTES[skill.secondary]);
            });

            let timeHtml;
            if (hasOverrides && spNeeded > 0) {
                const overrideMinutes = this.withTrainingCalcState(() => {
                    this.applyTrainingSettings(this.calculatorOverrides);
                    return trainingCalc.calculateTime(spNeeded, ATTRIBUTES[skill.primary], ATTRIBUTES[skill.secondary]);
                });
                const baselineFormatted = trainingCalc.formatTime(baselineMinutes);
                const overrideFormatted = trainingCalc.formatTime(overrideMinutes);
                if (baselineFormatted !== overrideFormatted) {
                    const improved = overrideMinutes < baselineMinutes;
                    timeHtml = `<span class="skill-time-compare"><span class="skill-time-before">${baselineFormatted}</span><i class="fas fa-arrow-right skill-time-arrow"></i><span class="skill-time-after ${improved ? 'improved' : 'worsened'}">${overrideFormatted}</span></span>`;
                } else {
                    timeHtml = `<span class="skill-time">${baselineFormatted}</span>`;
                }
            } else {
                timeHtml = `<span class="skill-time">${trainingCalc.formatTime(baselineMinutes)}</span>`;
            }

            const marketLinkUrl = getSkillMarketLink(item.skillId);
            const marketLink = marketLinkUrl ? `<a href="${marketLinkUrl}" target="_blank" class="plan-market-link" title="View in Market"><i class="fas fa-shopping-cart"></i></a>` : '';
            
            return `
                <div class="plan-skill-item" data-skill-id="${item.skillId}">
                    <div class="skill-info">
                        <div class="skill-name">
                            <a href="#" class="plan-skill-link" data-skill-id="${item.skillId}">${skill.name}</a>
                            ${marketLink}
                        </div>
                        <div class="skill-prereq ${!hasPrereqIssue ? 'hidden' : ''}">
                            <i class="fas fa-exclamation-triangle"></i>
                            Missing prereqs
                        </div>
                    </div>
                    <select class="level-select" data-skill-id="${item.skillId}">
                        ${[1,2,3,4,5].map(l => `<option value="${l}" ${l === item.targetLevel ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                    ${timeHtml}
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

        this.planList.querySelectorAll('.plan-skill-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const skillId = parseInt(link.dataset.skillId);
                this.switchView('skills');
                this.showSkillDetails(skillId);
            });
        });
    }

    updatePlanSummary() {
        const baselineSettings = this.getCharacterTrainingSettings();
        const baseline = this.calculatePlanSummaryWithSettings(baselineSettings);
        const activeSettings = this.calculatorOverrides || baselineSettings;
        const active = this.calculatePlanSummaryWithSettings(activeSettings);
        const hasOverrides = this.calculatorOverrides && this.settingsDiffer(this.calculatorOverrides, baselineSettings);

        this.sumTotalSkills.textContent = active.summary.totalSkills;
        this.sumTotalTime.textContent = active.summary.totalTime;
        this.sumSpNeeded.textContent = characterManager.formatSP(active.summary.totalSP);

        this.injLargeCount.textContent = active.injectors.count;
        this.injTotalCost.textContent = active.injectorCost.formatted;

        if (this.sumTotalTimeCompare) {
            if (hasOverrides) {
                const deltaMinutes = baseline.summary.totalMinutes - active.summary.totalMinutes;
                this.sumTotalTimeCompare.classList.remove('positive', 'negative', 'neutral');

                if (deltaMinutes > 0) {
                    this.sumTotalTimeCompare.textContent = `Saved ${trainingCalc.formatTime(deltaMinutes)} (${baseline.summary.totalTime} -> ${active.summary.totalTime})`;
                    this.sumTotalTimeCompare.classList.add('positive');
                } else if (deltaMinutes < 0) {
                    this.sumTotalTimeCompare.textContent = `Slower by ${trainingCalc.formatTime(Math.abs(deltaMinutes))} (${baseline.summary.totalTime} -> ${active.summary.totalTime})`;
                    this.sumTotalTimeCompare.classList.add('negative');
                } else {
                    this.sumTotalTimeCompare.textContent = `No change (${baseline.summary.totalTime})`;
                    this.sumTotalTimeCompare.classList.add('neutral');
                }

                this.sumTotalTimeCompareRow?.classList.remove('hidden');
            } else {
                this.sumTotalTimeCompare.textContent = '';
                this.sumTotalTimeCompare.classList.remove('positive', 'negative', 'neutral');
                this.sumTotalTimeCompareRow?.classList.add('hidden');
            }
        }

        if (this.injCompareRow && this.injCompareText) {
            if (hasOverrides) {
                const injectorDelta = baseline.injectors.count - active.injectors.count;
                this.injCompareText.classList.remove('positive', 'negative', 'neutral');

                if (injectorDelta > 0) {
                    this.injCompareText.textContent = `-${injectorDelta} (${baseline.injectors.count} -> ${active.injectors.count})`;
                    this.injCompareText.classList.add('positive');
                } else if (injectorDelta < 0) {
                    this.injCompareText.textContent = `+${Math.abs(injectorDelta)} (${baseline.injectors.count} -> ${active.injectors.count})`;
                    this.injCompareText.classList.add('negative');
                } else {
                    this.injCompareText.textContent = `No change (${active.injectors.count})`;
                    this.injCompareText.classList.add('neutral');
                }

                this.injCompareRow.classList.remove('hidden');
            } else {
                this.injCompareText.textContent = '';
                this.injCompareText.classList.remove('positive', 'negative', 'neutral');
                this.injCompareRow.classList.add('hidden');
            }
        }
        
        // Prereq warning
        this.prereqWarning?.classList.toggle('hidden', !active.summary.hasPrereqIssues);
        
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

            const activeSettings = this.calculatorOverrides || this.getCharacterTrainingSettings();
            const active = this.calculatePlanSummaryWithSettings(activeSettings);
            this.miniTime.textContent = active.summary.totalTime;
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

    deletePlan() {
        const plans = skillPlanner.getSavedPlanNames();
        if (plans.length === 0) {
            this.showMessage('No saved plans to delete', 'warning');
            return;
        }
        
        const selected = prompt('Delete which plan?\n' + plans.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\nEnter number to delete:');
        const index = parseInt(selected) - 1;
        
        if (index >= 0 && index < plans.length) {
            const planName = plans[index];
            if (confirm(`Delete plan "${planName}"?`)) {
                skillPlanner.deleteNamedPlan(planName);
                this.showMessage(`Plan "${planName}" deleted`, 'success');
            }
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
        
        const groups = [...new Set(
            Object.entries(window.SKILLS)
                .filter(([id, skill]) => this.isSkillVisible(parseInt(id), skill))
                .map(([, skill]) => skill.group)
        )];
        
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
        
        let skills = Object.entries(window.SKILLS)
            .map(([id, skill]) => ({ id: parseInt(id), ...skill }))
            .filter(skill => this.isSkillVisible(skill.id, skill));
        
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
        this.populateAcceleratorOptions();

        const settings = this.calculatorOverrides || this.getCharacterTrainingSettings();

        this.setSliderValue('calcInt', settings.attributes.intelligence);
        this.setSliderValue('calcMem', settings.attributes.memory);
        this.setSliderValue('calcPer', settings.attributes.perception);
        this.setSliderValue('calcWill', settings.attributes.willpower);
        this.setSliderValue('calcChar', settings.attributes.charisma);

        ['6', '7', '8', '9', '10'].forEach(slot => {
            const select = document.getElementById('implant' + slot);
            if (select) {
                select.value = String(settings.implants[slot] || 0);
            }
        });

        const acceleratorPreset = document.getElementById('acceleratorPreset');
        if (acceleratorPreset) {
            const selected = (window.CEREBRAL_ACCELERATORS || []).find(a =>
                settings.accelerator.enabled && (a.typeId === settings.accelerator.typeId || a.bonus === settings.accelerator.bonus)
            );
            acceleratorPreset.value = selected ? selected.name : 'None';
        }

        this.updateCalcDisplay();
        this.updateRemapSuggestion();
    }

    populateAcceleratorOptions() {
        const select = document.getElementById('acceleratorPreset');
        const list = document.getElementById('acceleratorList');
        const accelerators = window.CEREBRAL_ACCELERATORS || [];

        if (select) {
            select.innerHTML = `
                <option value="None" data-bonus="0" data-type-id="0">None</option>
                ${accelerators.map(a => `<option value="${a.name}" data-bonus="${a.bonus}" data-type-id="${a.typeId || 0}">${a.name}</option>`).join('')}
            `;
        }

        if (list) {
            list.innerHTML = accelerators.map(a => {
                if (a.typeId && a.marketLink) {
                    return `
                        <a href="${a.marketLink}" target="_blank" class="accelerator-item-link">
                            <span>${a.name}</span>
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    `;
                }

                return `
                    <div class="accelerator-item-link accelerator-item-disabled">
                        <span>${a.name}</span>
                    </div>
                `;
            }).join('');
        }
    }

    setSliderValue(id, value) {
        const slider = document.getElementById(id);
        const display = document.getElementById(id.replace('calc', 'disp'));
        if (slider) slider.value = value;
        if (display) display.textContent = value;
    }

    updateCalcDisplay() {
        this.calculatorOverrides = this.getCalculatorSettingsFromUI();

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
        this.updatePlanSummary();
        this.renderPlan();
        
        // Apply the accelerator selection to the persistent state so dashboard displays bonus
        if (this.calculatorOverrides?.accelerator) {
            trainingCalc.setCerebralAccelerator(
                this.calculatorOverrides.accelerator.enabled,
                this.calculatorOverrides.accelerator.bonus
            );
            // Update dashboard attributes to show the bonus
            this.updateCharacterUI(esiAuth.currentCharacter);
        }
    }

    calculateImpact() {
        const originalAttributes = { ...trainingCalc.baseAttributes };
        const originalImplants = Object.fromEntries(
            Object.entries(trainingCalc.implantBonuses).map(([slot, data]) => [slot, data.bonus])
        );
        const originalAccelerator = trainingCalc.cerebralAccelerator;
        const originalAcceleratorBonus = trainingCalc.acceleratorBonus;

        const attrs = {
            intelligence: parseInt(document.getElementById('calcInt')?.value || 20),
            memory: parseInt(document.getElementById('calcMem')?.value || 20),
            perception: parseInt(document.getElementById('calcPer')?.value || 20),
            willpower: parseInt(document.getElementById('calcWill')?.value || 20),
            charisma: parseInt(document.getElementById('calcChar')?.value || 20)
        };

        const implants = {
            6: parseInt(document.getElementById('implant6')?.value || 0),
            7: parseInt(document.getElementById('implant7')?.value || 0),
            8: parseInt(document.getElementById('implant8')?.value || 0),
            9: parseInt(document.getElementById('implant9')?.value || 0),
            10: parseInt(document.getElementById('implant10')?.value || 0)
        };
        const acceleratorSelect = document.getElementById('acceleratorPreset');
        const acceleratorBonus = parseInt(
            acceleratorSelect?.selectedOptions?.[0]?.dataset?.bonus || 0
        );
        
        // Current time
        const currentTime = trainingCalc.calculatePlanTime(skillPlanner.getPlan(), this.currentCharacterData?.skills);
        document.getElementById('currentPlanTime').textContent = currentTime.formattedTime;
        
        // New time with adjusted attributes
        trainingCalc.setAttributes(attrs);
        Object.entries(implants).forEach(([slot, bonus]) => {
            trainingCalc.setImplant(parseInt(slot), bonus);
        });
        trainingCalc.setCerebralAccelerator(acceleratorBonus > 0, acceleratorBonus);
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

        // Restore state after preview calculation so normal plan calculations are unaffected.
        trainingCalc.setAttributes(originalAttributes);
        Object.entries(originalImplants).forEach(([slot, bonus]) => {
            trainingCalc.setImplant(parseInt(slot), bonus);
        });
        trainingCalc.setCerebralAccelerator(originalAccelerator, originalAcceleratorBonus);
    }

    applySuggestedRemap() {
        const plan = skillPlanner.getPlan();
        if (plan.length === 0) {
            this.showMessage('Add skills to your plan before applying a remap', 'warning');
            return;
        }

        const suggested = trainingCalc.optimizeAttributes(plan, this.currentCharacterData?.skills);
        this.setSliderValue('calcInt', suggested.intelligence || 20);
        this.setSliderValue('calcMem', suggested.memory || 20);
        this.setSliderValue('calcPer', suggested.perception || 20);
        this.setSliderValue('calcWill', suggested.willpower || 20);
        this.setSliderValue('calcChar', suggested.charisma || 19);

        this.updateCalcDisplay();
        this.showMessage('Applied suggested remap to calculator preview', 'success');
    }

    runInjectorCalculator() {
        const currentSp = parseInt(document.getElementById('currentSpInput')?.value || 0);
        const targetSp = parseInt(document.getElementById('targetSpInput')?.value || 0);
        const injectorPrice = parseInt(document.getElementById('injectorPriceInput')?.value || 900000000);
        const results = document.getElementById('injectorResults');

        if (!results) return;

        if (!Number.isFinite(currentSp) || !Number.isFinite(targetSp) || currentSp < 0 || targetSp <= 0) {
            this.showMessage('Enter valid SP values', 'warning');
            return;
        }

        if (targetSp <= currentSp) {
            this.showMessage('Target SP must be greater than current SP', 'warning');
            return;
        }

        const summary = injectorCalc.generateSummary(currentSp, targetSp, injectorPrice);
        const calc = injectorCalc.calculateInjectors(currentSp, targetSp);
        results.innerHTML = `
            <div class="inj-result-row">
                <span>Injectors Needed</span>
                <strong>${calc.count}</strong>
            </div>
            <div class="inj-result-row">
                <span>Total Cost</span>
                <strong>${summary.cost}</strong>
            </div>
            <div class="inj-result-row">
                <span>Total SP Injected</span>
                <strong>${calc.totalSp.toLocaleString()}</strong>
            </div>
            <div class="inj-result-row">
                <span>SP Wasted</span>
                <strong>${calc.wastedSp.toLocaleString()}</strong>
            </div>
            <div class="inj-result-note">Efficiency: ${summary.efficiency}</div>
        `;
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
