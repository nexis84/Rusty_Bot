// Main Application Module
// Orchestrates all functionality and UI interactions

class SkillPlannerApp {
    constructor() {
        this.currentView = 'dashboard';
        this.currentCharacter = null;
        this.currentCharacterData = null;
        this.selectedSkill = null;
        this.expandedSkillGroups = new Set();
        this.calculatorOverrides = null;
        this.bookPriceCache = new Map();
        this.bookPriceCacheAt = 0;
        this.bookPricePromise = null;
        this.injectorPrice = 900000000;
        this.injectorPriceType = 40520; // Large Skill Injector
        this.fitData = null;
        this.fitDataPromise = null;
        this.fitAnalysis = null;
        this.savedFits = null;
        this.savedFitsLoading = false;
        this.savedFitsError = null;
        this.savedFitsErrorNeedsLogin = false;
        this.savedFitsRetryAction = 'load';
        this.savedFitsSyncedAt = 0;
        this.savedFitsCacheMs = 5 * 60 * 1000;
        this.selectedSavedFits = new Set();
        this.characterSyncedAt = null;
        this.fitDataById = null;
        this.shipData = [];
        this.typeNameCache = new Map();
        this.locationNameCache = new Map();
        this.implantRenderToken = 0;
        this.cloneLocationToken = 0;
        this.lastFitText = null;
        this.libraryRecords = this.loadLibraryRecords();
        this.libraryAnalyses = [];
        this.libraryLoading = false;
        this.libraryError = null;
        this.selectedLibraryFits = new Set();
        this.selectedPlanSkills = new Set();
        this.pendingLibraryAnalysis = null;
        this.pendingLibraryRecord = null;
        this.fitAliases = this.loadFitAliases();
        this.characterReadiness = null;
        this.shipBrowserLoading = false;
        this.shipReadinessCache = null;
        this.init();
    }

    async init() {
        this.bindElements();
        this.bindEvents();
        this.applyUiScale(this.readSavedUiScale(), false);
        this.restoreCloneState();
        this.startClock();
        
        // Validate SKILLS data is loaded
        if (!window.SKILLS || Object.keys(window.SKILLS).length === 0) {
            console.error('SKILLS data is empty or not loaded!');
            this.showMessage('Failed to load skill database. Please refresh the page.', 'error');
            return;
        }
        
        // Check for OAuth callback
        let charData = null;
        try {
            charData = await esiAuth.handleCallback();
            if (charData) {
                this.showMessage('Successfully authenticated!', 'success');
            }
        } catch (e) {
            this.showMessage('Authentication failed: ' + e.message, 'error');
        }
        
        // Load character if authenticated. Sessions created before the new
        // least-privilege SSO app may lack scope metadata, so ask for a fresh
        // sign-in rather than failing on the first ESI call.
        if (esiAuth.isAuthenticated()) {
            if (!esiAuth.hasRequiredScopes()) {
                const oldChar = esiAuth.tokens[esiAuth.currentCharacter];
                const oldName = oldChar?.characterName || 'your character';
                esiAuth.removeCharacter(esiAuth.currentCharacter);
                this.showMessage(`Please sign in again for ${oldName} - the Skill Planner needs updated skill permissions.`, 'warning');
                skillPlanner.setActiveCharacter(null);
            } else {
                await this.loadCharacter(esiAuth.currentCharacter, { force: Boolean(charData) });
            }
        } else {
            skillPlanner.setActiveCharacter(null);
        }
        
        this.updateUI();
        this.loadPlanFromUrl();
        this.updateInjectorPrice();
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
        this.sumCompletionDate = document.getElementById('sumCompletionDate');
        this.injLargeCount = document.getElementById('injLargeCount');
        this.injTotalCost = document.getElementById('injTotalCost');
        this.remapCount = document.getElementById('remapCount');
        this.injCompareRow = document.getElementById('injCompareRow');
        this.injCompareText = document.getElementById('injCompareText');
        this.prereqWarning = document.getElementById('prereqWarning');
        this.prereqBreakdownPanel = document.getElementById('prereqBreakdownPanel');
        this.prereqBreakdownContent = document.getElementById('prereqBreakdownContent');
        
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
        this.esiLoginBtn?.addEventListener('click', async () => {
            if (!this.esiLoginBtn) return;
            const original = this.esiLoginBtn.innerHTML;
            this.esiLoginBtn.disabled = true;
            this.esiLoginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
            try {
                await esiAuth.initiateLogin();
            } catch (error) {
                this.showMessage(error.message || 'Could not start EVE login', 'error');
                this.esiLoginBtn.disabled = false;
                this.esiLoginBtn.innerHTML = original;
            }
        });
        
        // Character switch / add / refresh
        this.charSwitchBtn?.addEventListener('click', () => this.toggleCharacterList());
        document.getElementById('charAddBtn')?.addEventListener('click', () => this.esiLoginBtn?.click());
        document.getElementById('charRefreshBtn')?.addEventListener('click', () => this.refreshCharacter());
        document.getElementById('charLogoutBtn')?.addEventListener('click', () => this.logoutCharacter());
        
        // Quick actions
        document.getElementById('quickPlanBtn')?.addEventListener('click', () => this.switchView('skills'));
        document.getElementById('quickFitBtn')?.addEventListener('click', () => this.openFitImport());
        document.getElementById('quickImportBtn')?.addEventListener('click', () => this.openImportPlan());
        document.getElementById('quickImportQueueBtn')?.addEventListener('click', () => this.importFromQueue());
        document.getElementById('quickExportBtn')?.addEventListener('click', () => this.downloadPlanText());
        document.getElementById('quickClearBtn')?.addEventListener('click', () => this.clearPlan());
        
        // Skill search
        this.skillSearch?.addEventListener('input', (e) => this.filterSkills(e.target.value));
        this.skillFilter?.addEventListener('change', () => this.renderSkillCategories());
        
        // My Skills search
        this.mySkillsSearch?.addEventListener('input', (e) => this.filterMySkills(e.target.value));
        this.mySkillsFilter?.addEventListener('change', () => this.renderMySkills());
        
        // Planner actions
        document.getElementById('plannerImportFitBtn')?.addEventListener('click', () => this.openFitImport());
        document.getElementById('plannerImportPlanBtn')?.addEventListener('click', () => this.openImportPlan());
        document.getElementById('plannerExportPlanBtn')?.addEventListener('click', () => this.downloadPlanText());
        document.getElementById('copyPlanBtn')?.addEventListener('click', () => this.copyPlanForEve());
        document.getElementById('bookListBtn')?.addEventListener('click', () => this.openBookList());
        document.getElementById('closeBookList')?.addEventListener('click', () => this.closeBookList());
        document.getElementById('closeBookListFooter')?.addEventListener('click', () => this.closeBookList());
        document.getElementById('copyBookListBtn')?.addEventListener('click', () => this.copyBookList());
        document.getElementById('sharePlanBtn')?.addEventListener('click', () => this.sharePlan());
        document.getElementById('renamePlanBtn')?.addEventListener('click', () => this.renamePlan());
        document.getElementById('loadPlanBtn')?.addEventListener('click', () => this.openPlanManager());
        document.getElementById('savePlanBtn')?.addEventListener('click', () => this.openPlanManager());
        document.getElementById('deletePlanBtn')?.addEventListener('click', () => this.openPlanManager());
        document.getElementById('optimizePlanBtn')?.addEventListener('click', () => this.optimizePlan());
        document.getElementById('uiScaleSelect')?.addEventListener('change', (event) => {
            this.applyUiScale(event.target.value, true);
        });
        document.getElementById('undoPlanBtn')?.addEventListener('click', () => this.undoPlan());
        document.getElementById('redoPlanBtn')?.addEventListener('click', () => this.redoPlan());
        document.getElementById('planBulkSetLevel')?.addEventListener('click', () => this.bulkSetPlanLevel());
        document.getElementById('planBulkRemove')?.addEventListener('click', () => this.bulkRemovePlanSkills());
        document.getElementById('planBulkClear')?.addEventListener('click', () => this.clearPlanSelection());
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
        document.getElementById('cloneState')?.addEventListener('change', (event) => {
            trainingCalc.setCloneState(event.target.value);
            this.persistCloneState(event.target.value);
            this.updateCloneStateUI();
            this.updateCalcDisplay();
        });

        // Calculator actions
        document.getElementById('applySuggestedRemap')?.addEventListener('click', () => this.applySuggestedRemap());
        document.getElementById('calcInjectorsBtn')?.addEventListener('click', () => this.runInjectorCalculator());
        document.getElementById('injectorPriceInput')?.addEventListener('input', (event) => {
            event.target.dataset.userEdited = '1';
        });
        
        // Modal close buttons
        document.getElementById('closeSkillPicker')?.addEventListener('click', () => this.closeSkillPicker());
        document.getElementById('closeSkillDetail')?.addEventListener('click', () => this.closeSkillDetail());
        document.getElementById('closeDetailBtn')?.addEventListener('click', () => this.closeSkillDetail());
        document.getElementById('addToPlanFromDetail')?.addEventListener('click', () => this.addSelectedSkillToPlan());

        // Saved plan manager
        document.getElementById('closePlanManager')?.addEventListener('click', () => this.closePlanManager());
        document.getElementById('closePlanManagerFooter')?.addEventListener('click', () => this.closePlanManager());
        document.getElementById('planManagerSave')?.addEventListener('click', () => this.savePlanFromManager());

        // Import modal
        document.getElementById('closePlanImport')?.addEventListener('click', () => this.closeImportPlan());
        document.getElementById('closePlanImportFooter')?.addEventListener('click', () => this.closeImportPlan());
        document.getElementById('confirmPlanImport')?.addEventListener('click', () => this.submitImportPlan());
        document.getElementById('planImportFileBtn')?.addEventListener('click', () => document.getElementById('planImportFile')?.click());
        document.getElementById('planImportFile')?.addEventListener('change', (event) => this.loadImportFile(event));

        // Fit import
        document.getElementById('closeFitImport')?.addEventListener('click', () => this.closeFitImport());
        document.getElementById('closeFitImportFooter')?.addEventListener('click', () => this.closeFitImport());
        document.getElementById('analyseFitBtn')?.addEventListener('click', () => this.analyseFit());
        document.getElementById('fitImportFileBtn')?.addEventListener('click', () => document.getElementById('fitImportFile')?.click());
        document.getElementById('fitImportFile')?.addEventListener('change', (event) => this.loadFitFile(event));
        document.getElementById('fitViewImportAnotherBtn')?.addEventListener('click', () => this.openFitImport());
        document.getElementById('fitViewEmptyImportBtn')?.addEventListener('click', () => this.openFitImport());
        document.getElementById('fitViewCreatePlanBtn')?.addEventListener('click', () => this.createFitPlan());
        document.getElementById('fitViewCopyBtn')?.addEventListener('click', () => this.copyCurrentFitEft());
        document.getElementById('fitViewSaveLibraryBtn')?.addEventListener('click', () => this.openLibrarySaveModal());
        document.getElementById('refreshSavedFitsBtn')?.addEventListener('click', () => this.loadSavedFits(true));
        document.getElementById('savedFitsCheckCharsBtn')?.addEventListener('click', () => this.openCharacterReadiness());
        document.getElementById('savedFitsImportBtn')?.addEventListener('click', () => this.openFitImport());
        document.getElementById('savedFitsMergeBtn')?.addEventListener('click', () => this.createCombinedFitsPlan());
        document.getElementById('savedFitsSearch')?.addEventListener('input', () => this.renderSavedFits());
        document.getElementById('savedFitsFilter')?.addEventListener('change', () => this.renderSavedFits());
        document.getElementById('savedFitsSort')?.addEventListener('change', () => this.renderSavedFits());

        document.getElementById('closeLibrarySave')?.addEventListener('click', () => this.closeLibrarySaveModal());
        document.getElementById('librarySaveCancel')?.addEventListener('click', () => this.closeLibrarySaveModal());
        document.getElementById('librarySaveConfirm')?.addEventListener('click', () => this.saveLibraryFromModal());
        document.getElementById('closeUnknownItems')?.addEventListener('click', () => this.closeUnknownItemResolver());
        document.getElementById('closeUnknownItemsFooter')?.addEventListener('click', () => this.closeUnknownItemResolver());
        document.getElementById('applyUnknownItems')?.addEventListener('click', () => this.applyUnknownItemMappings());
        document.getElementById('closeReadiness')?.addEventListener('click', () => this.closeCharacterReadiness());
        document.getElementById('closeReadinessFooter')?.addEventListener('click', () => this.closeCharacterReadiness());
        document.getElementById('closePlanCompare')?.addEventListener('click', () => this.closePlanCompare());
        document.getElementById('closePlanCompareFooter')?.addEventListener('click', () => this.closePlanCompare());

        // Doctrine library
        document.getElementById('libraryAddBtn')?.addEventListener('click', () => this.openLibraryImport());
        document.getElementById('libraryEmptyAddBtn')?.addEventListener('click', () => this.openLibraryImport());
        document.getElementById('libraryMergeBtn')?.addEventListener('click', () => this.createCombinedLibraryPlan());
        document.getElementById('libraryCheckCharsBtn')?.addEventListener('click', () => this.openCharacterReadiness());
        document.getElementById('librarySearch')?.addEventListener('input', () => this.renderLibrary());
        document.getElementById('libraryTagFilter')?.addEventListener('change', () => this.renderLibrary());
        document.getElementById('librarySort')?.addEventListener('change', () => this.renderLibrary());

        // Ship browser
        document.getElementById('shipsSearch')?.addEventListener('input', () => this.renderShipBrowser());
        document.getElementById('shipsFilter')?.addEventListener('change', () => this.renderShipBrowser());
        document.getElementById('shipsSort')?.addEventListener('change', () => this.renderShipBrowser());
        
        // Skill picker search
        document.getElementById('pickerSearch')?.addEventListener('input', (e) => this.filterPickerSkills(e.target.value));
        
        // Mobile toggle
        document.getElementById('toggleSidebar')?.addEventListener('click', () => this.toggleSidebar());

        // Keyboard shortcuts: Escape closes modals; "/" focuses skill search.
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeSkillPicker();
                this.closeSkillDetail();
                this.closePlanManager();
                this.closeImportPlan();
                this.closeFitImport();
                return;
            }

            const tag = document.activeElement?.tagName;
            if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
                event.preventDefault();
                this.switchView('skills');
                this.skillSearch?.focus();
            }
        });
        
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
            fit: 'Fit Analysis',
            savedFits: 'Saved Fits',
            library: 'Doctrine Library',
            ships: 'Ship Browser',
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
        } else if (viewName === 'fit') {
            this.renderFitAnalysis();
        } else if (viewName === 'savedFits') {
            this.renderSavedFits();
            const stale = !this.savedFitsSyncedAt || (Date.now() - this.savedFitsSyncedAt > 5 * 60 * 1000);
            if (esiAuth.isAuthenticated() && (this.savedFits === null || stale) && !this.savedFitsLoading) {
                this.loadSavedFits();
            }
        } else if (viewName === 'library') {
            this.renderLibrary();
            if (!this.libraryLoading && this.libraryAnalyses.length === 0) {
                this.loadLibrary();
            }
        } else if (viewName === 'ships') {
            this.renderShipBrowser();
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

    showStoredCharacterIdentity(characterId) {
        const character = esiAuth.tokens?.[characterId];
        if (!character) return;

        this.characterInfo?.classList.remove('hidden');
        this.loginPrompt?.classList.add('hidden');
        this.charPortrait.src = characterManager.getPortraitUrl(characterId, 128);
        this.charName.textContent = character.characterName || 'Character';
        this.charMeta.textContent = 'Loading character data...';

        const heroTitle = document.getElementById('dashboardHeroTitle');
        if (heroTitle) heroTitle.textContent = `Welcome, ${character.characterName || 'Pilot'}`;
        this.updateWelcomeIdentity();
    }

    // Character loading
    async loadCharacter(characterId, { force = false } = {}) {
        const characterChanged = this.currentCharacter !== characterId;
        this.showStoredCharacterIdentity(characterId);
        this.showLoading('Loading character data...');

        if (characterChanged) {
            this.resetSavedFitsState();
        }

        try {
            this.currentCharacter = characterId;
            this.calculatorOverrides = null;
            skillPlanner.setActiveCharacter(characterId);

            // Cache reads are disabled - all fetches hit ESI directly for live data.
            
            // Fetch character data through manager to avoid request bursts against ESI.
            const fullData = await characterManager.getFullCharacterData(characterId, { force });
            this.currentCharacterData = {
                skills: fullData.skills,
                attributes: fullData.attributes,
                queue: fullData.skillQueue,
                implants: fullData.implants,
                boosters: fullData.boosters,
                clones: fullData.clones
            };
            if (!fullData.attributes) {
                this.showMessage('Could not load attribute points from ESI. Click Refresh to try again.', 'error');
            }
            const cachedSkillsAt = characterManager.characters?.[characterId]?.cache?.skills?.timestamp;
            this.characterSyncedAt = cachedSkillsAt ? new Date(cachedSkillsAt) : new Date();
            this.updateSyncStatus();
            
            // Update UI
            await this.updateCharacterUI(characterId);
            
            // Load training calc attributes and the character's clone state.
            trainingCalc.loadFromCharacter(characterId);
            this.restoreCloneState(characterId);
            this.shipReadinessCache = null;
            if (characterChanged || force) {
                this.libraryAnalyses = [];
                if (this.currentView === 'library' && this.libraryRecords.length) {
                    this.loadLibrary();
                }
            }

            // Re-render sections that depend on fresh character data.
            this.renderMySkills();
            this.renderPlan();
            this.updatePlanSummary();
            this.updatePlanBadge();

            // A character switch while this view is open should immediately
            // replace the old character's fittings.
            if (characterChanged && this.currentView === 'savedFits') {
                this.loadSavedFits(true);
            }

            return true;
        } catch (e) {
            this.charMeta.textContent = 'Character data unavailable - try Refresh';
            this.showMessage('Failed to load character: ' + e.message, 'error');
            console.error(e);
            if (this.currentView === 'savedFits') {
                this.savedFitsError = 'Character data could not be loaded. Check your connection and try again.';
                this.savedFitsRetryAction = 'refresh';
                this.renderSavedFits();
            }
            return false;
        } finally {
            this.hideLoading();
        }
    }

    resetSavedFitsState() {
        this.savedFits = null;
        this.savedFitsLoading = false;
        this.savedFitsError = null;
        this.savedFitsErrorNeedsLogin = false;
        this.savedFitsRetryAction = 'load';
        this.savedFitsSyncedAt = 0;
        this.selectedSavedFits.clear();
        this.updateMergeButton();
    }

    getCloneStateStorageKey(characterId = esiAuth.getCurrentCharacter()) {
        return characterId ? `skill_clone_state_${characterId}` : 'skill_clone_state_guest';
    }

    persistCloneState(state) {
        try {
            localStorage.setItem(this.getCloneStateStorageKey(), state);
        } catch (_) {
            // Storage may be unavailable.
        }
    }

    readSavedUiScale() {
        try {
            const saved = parseFloat(localStorage.getItem('skillplanner_ui_scale'));
            return Number.isFinite(saved) ? saved : 1;
        } catch (_) {
            return 1;
        }
    }

    applyUiScale(scale, persist = false) {
        const value = Math.max(0.75, Math.min(2, Number(scale) || 1));
        document.documentElement.style.setProperty('--ui-scale', String(value));
        document.documentElement.style.fontSize = `${16 * value}px`;

        const select = document.getElementById('uiScaleSelect');
        if (select) select.value = String(value);

        if (persist) {
            try { localStorage.setItem('skillplanner_ui_scale', String(value)); } catch (_) {}
        }
    }

    restoreCloneState(characterId = null) {
        let state = 'omega';
        try {
            const key = this.getCloneStateStorageKey(characterId);
            state = localStorage.getItem(key)
                || localStorage.getItem('skill_clone_state')
                || 'omega';
        } catch (_) {
            // Storage may be unavailable; Omega is the safe default.
        }
        trainingCalc.setCloneState(state);
        this.updateCloneStateUI();
    }

    updateCloneStateUI() {
        const select = document.getElementById('cloneState');
        if (select) select.value = trainingCalc.cloneState || 'omega';

        const warning = document.getElementById('alphaWarning');
        warning?.classList.toggle('hidden', trainingCalc.cloneState !== 'alpha');

        const summary = document.getElementById('cloneStateSummary');
        if (summary) {
            summary.textContent = trainingCalc.cloneState === 'alpha' ? 'Alpha' : 'Omega';
            summary.classList.toggle('alpha', trainingCalc.cloneState === 'alpha');
        }
    }

    updateWelcomeIdentity() {
        try {
            window.updateWelcomeSso?.();
        } catch (_) {
            // The welcome overlay is optional.
        }
    }

    updateSyncStatus() {
        const el = document.getElementById('lastSynced');
        if (!el) return;
        if (!this.characterSyncedAt) {
            el.textContent = '--';
            el.title = '';
            return;
        }
        el.textContent = this.characterSyncedAt.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit'
        });
        el.title = this.characterSyncedAt.toLocaleString();
    }

    async refreshCharacter() {
        const charId = esiAuth.getCurrentCharacter();
        if (!charId) {
            this.showMessage('Sign in with EVE SSO first.', 'warning');
            return;
        }

        const button = document.getElementById('charRefreshBtn');
        const original = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            this.resetSavedFitsState();
            // loadCharacter displays its own detailed error message.
            const refreshed = await this.loadCharacter(charId, { force: true });
            if (!refreshed) {
                if (this.currentView === 'savedFits') {
                    this.savedFitsError = 'Character data could not be refreshed. Check your connection and try again.';
                    this.savedFitsRetryAction = 'refresh';
                    this.renderSavedFits();
                }
                return;
            }

            if (this.currentView === 'savedFits') {
                await this.loadSavedFits(true);
            }
            this.showMessage('Character refreshed.', 'success');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = original;
            }
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

        const heroTitle = document.getElementById('dashboardHeroTitle');
        if (heroTitle) {
            heroTitle.textContent = `Welcome, ${charData.characterName}`;
        }
        this.updateWelcomeIdentity();
        
        // Update stats
        const summary = characterManager.getCharacterSummary(characterId);
        if (summary) {
            this.charMeta.textContent = `${characterManager.formatSP(summary.totalSP)} SP • ${summary.skillsTrained} Skills`;
            
            // Dashboard stats - show exact SP on hover
            this.totalSp.textContent = characterManager.formatSP(summary.totalSP);
            this.totalSp.title = characterManager.formatSPExact(summary.totalSP) + ' SP (real-time)';
            this.skillsTrained.textContent = summary.skillsTrained;
            this.skillsAtFive.textContent = summary.skillsAtFive;
            this.unallocatedSp.textContent = characterManager.formatSP(summary.unallocatedSP);
            this.unallocatedSp.title = characterManager.formatSPExact(summary.unallocatedSP) + ' Unallocated SP';
        }
        
        // Update active booster
        // Note: active cerebral accelerators cannot be detected via ESI — set manually in Calculator
        // Update clone location
        if (this.cloneLocation) {
            this.renderCloneLocation(this.currentCharacterData?.clones?.home_location);
        }
        
        // ESI attributes already include implant bonuses. Split them back out
        // only for the base/+bonus display so the total stays truthful.
        if (this.currentCharacterData?.attributes) {
            const attrSource = document.getElementById('attrSource');
            if (attrSource) {
                attrSource.textContent = 'From ESI';
                attrSource.classList.remove('unavailable');
            }
            const attrs = this.getCharacterBaseAttributes();
            const implants = this.getCurrentImplantBonuses();
            this.updateAttributeDisplay('Int', attrs.intelligence, implants.intelligence);
            this.updateAttributeDisplay('Mem', attrs.memory, implants.memory);
            this.updateAttributeDisplay('Per', attrs.perception, implants.perception);
            this.updateAttributeDisplay('Will', attrs.willpower, implants.willpower);
            this.updateAttributeDisplay('Char', attrs.charisma, implants.charisma);
            this.renderImplantSummary();

            if (this.remapCount) {
                const rawAttrs = this.currentCharacterData.attributes;
                const remaps = Number(rawAttrs.bonus_remaps);
                this.remapCount.textContent = Number.isFinite(remaps) ? remaps : '0';
                this.remapCount.title = rawAttrs.accrued_remap_cooldown_date
                    ? `Next accrued remap: ${new Date(rawAttrs.accrued_remap_cooldown_date).toLocaleDateString()}`
                    : '';
            }
        } else {
            const attrSource = document.getElementById('attrSource');
            if (attrSource) {
                attrSource.textContent = 'ESI unavailable';
                attrSource.classList.add('unavailable');
            }
            ['Int', 'Mem', 'Per', 'Will', 'Char'].forEach(suffix => {
                const valBase = document.getElementById('val' + suffix + 'Base');
                const valBonus = document.getElementById('val' + suffix + 'Bonus');
                if (valBase) valBase.textContent = '--';
                if (valBonus) valBonus.textContent = '';
            });
            if (this.remapCount) this.remapCount.textContent = '--';
            this.renderImplantSummary();
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

            // Show the effective ESI total only. The base/implant split stays
            // in the tooltip for anyone who wants the detail.
            valBase.textContent = totalValue;
            valBonus.textContent = '';
            valBase.parentElement.title = bonusValue > 0
                ? `ESI attributes: ${baseValue} base + ${bonusValue} implant = ${totalValue}`
                : `ESI attribute: ${totalValue}`;
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
            // Return to the anonymous workspace. Character plans stay persisted
            // under their own key and are restored when the character returns.
            skillPlanner.setActiveCharacter(null);

            this.currentCharacter = null;
            this.currentCharacterData = null;
            this.calculatorOverrides = null;

            esiAuth.removeCharacter(charId);
            characterManager.removeCharacter(charId);

            this.characterSyncedAt = null;
            this.updateSyncStatus();
            this.resetSavedFitsState();
            this.renderSavedFits();
            this.restoreCloneState(null);
            
            // Update UI
            this.characterInfo?.classList.add('hidden');
            this.loginPrompt?.classList.remove('hidden');
            this.charName.textContent = 'Character Name';
            this.charPortrait.src = '';
            this.charMeta.textContent = '0 SP • 0 Skills';
            const heroTitle = document.getElementById('dashboardHeroTitle');
            if (heroTitle) heroTitle.textContent = 'Welcome to EVE Skill Planner';
            this.updateWelcomeIdentity();

            this.implantRenderToken++;
            const implantList = document.getElementById('implantList');
            const implantCount = document.getElementById('implantCount');
            const attrSource = document.getElementById('attrSource');
            if (implantList) implantList.innerHTML = '<span class="implant-empty">Sign in to load implants.</span>';
            if (implantCount) implantCount.textContent = '';
            if (attrSource) {
                attrSource.textContent = 'Sign in';
                attrSource.classList.remove('unavailable');
            }
            
            // Clear dashboard stats
            this.totalSp.textContent = '--';
            this.skillsTrained.textContent = '--';
            this.skillsAtFive.textContent = '--';
            this.unallocatedSp.textContent = '--';
            if (this.cloneLocation) this.cloneLocation.textContent = '--';
            
            // Clear queue and recent skills
            if (this.skillQueueList) {
                this.skillQueueList.innerHTML = '<p class="empty-hint">Login to see your active skill queue</p>';
            }
            if (this.recentSkillsList) {
                this.recentSkillsList.innerHTML = '<p class="empty-hint">Login to see your recent skill training</p>';
            }
            if (this.currentSkillsList) {
                this.currentSkillsList.innerHTML = '<p class="empty-hint">Login to see your trained skills</p>';
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
            const level = item.finished_level ?? item.finish_level;
            const position = index === 0 ? 'training' : `queue #${index + 1}`;

            // ESI's skill queue uses finished_level/finish_date. Older data used
            // finish_level/training_time_remaining, so keep a fallback for both.
            const finish = item.finish_date ? new Date(item.finish_date) : null;
            let time;
            if (finish && !Number.isNaN(finish.getTime())) {
                const minutes = Math.max(0, (finish.getTime() - Date.now()) / 60000);
                time = minutes <= 0 ? 'done' : trainingCalc.formatTime(minutes);
            } else {
                time = trainingCalc.formatTrainingTime(item.training_time_remaining || 0);
            }

            return `
                <div class="queue-item ${index === 0 ? 'active' : ''}">
                    <span class="queue-position">${position}</span>
                    <span class="queue-name">${skillName}${level ? ` ${this.roman(level)}` : ''}</span>
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
            .sort((a, b) => {
                const spDiff = (Number(b.skillpoints_in_skill) || 0) - (Number(a.skillpoints_in_skill) || 0);
                return spDiff || b.trained_skill_level - a.trained_skill_level;
            })
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
        
        const previousScrollTop = this.skillCategories.scrollTop;

        this.skillCategories.innerHTML = Object.entries(groups).map(([groupName, skills]) => {
            const isExpanded = this.expandedSkillGroups.has(groupName);
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
                    <div class="cat-header ${isExpanded ? 'expanded' : ''}" data-group="${this.escapeHtml(groupName)}" aria-expanded="${isExpanded}">
                        <i class="fas fa-chevron-right"></i>
                        <span>${groupName}</span>
                        <span class="cat-count">${filtered.length}</span>
                    </div>
                    <div class="cat-skills ${isExpanded ? 'expanded' : ''}">
                        ${filtered.map(skill => this.renderSkillItem(skill)).join('')}
                    </div>
                </div>
            `;
        }).join('');
        
        // Bind events
        this.skillCategories.querySelectorAll('.cat-header').forEach(header => {
            header.addEventListener('click', () => {
                const groupName = header.dataset.group || '';
                const isExpanded = header.classList.toggle('expanded');
                header.nextElementSibling?.classList.toggle('expanded', isExpanded);
                header.setAttribute('aria-expanded', String(isExpanded));
                if (isExpanded) this.expandedSkillGroups.add(groupName);
                else this.expandedSkillGroups.delete(groupName);
            });
        });
        
        this.skillCategories.querySelectorAll('.skill-item').forEach(item => {
            if (parseInt(item.dataset.skillId) === this.selectedSkill) item.classList.add('active');
            item.addEventListener('click', () => {
                const skillId = parseInt(item.dataset.skillId);
                this.selectSkill(skillId);
                
                // Update active state
                this.skillCategories.querySelectorAll('.skill-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // Re-renders triggered by adding to the plan should not jump the list.
        this.skillCategories.scrollTop = previousScrollTop;
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

    getCurrentImplantBonuses() {
        const bonuses = {
            intelligence: 0,
            memory: 0,
            perception: 0,
            willpower: 0,
            charisma: 0
        };
        const implants = this.currentCharacterData?.implants || [];
        const bonusMap = window.IMPLANT_BONUSES || {};

        implants.forEach(implant => {
            const typeId = typeof implant === 'number' ? implant : implant?.type_id;
            const implantBonuses = bonusMap[typeId];
            if (!implantBonuses) return;
            Object.entries(implantBonuses).forEach(([attribute, bonus]) => {
                if (attribute in bonuses) bonuses[attribute] += Number(bonus) || 0;
            });
        });
        return bonuses;
    }

    getImplantTypeIds() {
        return (this.currentCharacterData?.implants || [])
            .map(implant => typeof implant === 'number' ? implant : implant?.type_id)
            .filter(typeId => Number.isInteger(typeId) && typeId > 0);
    }

    formatImplantBonus(typeId) {
        const bonuses = (window.IMPLANT_BONUSES || {})[typeId];
        if (!bonuses) return 'No attribute bonus';
        const short = {
            intelligence: 'INT',
            memory: 'MEM',
            perception: 'PER',
            willpower: 'WIL',
            charisma: 'CHA'
        };
        return Object.entries(bonuses)
            .map(([attribute, bonus]) => `+${bonus} ${short[attribute] || attribute}`)
            .join(', ');
    }

    async resolveTypeNames(typeIds) {
        const names = new Map();
        const missing = [];

        typeIds.forEach(typeId => {
            const known = this.fitDataById?.[typeId]?.name || this.typeNameCache.get(typeId);
            if (known) names.set(typeId, known);
            else missing.push(typeId);
        });

        if (missing.length > 0) {
            try {
                const response = await fetch(
                    'https://esi.evetech.net/latest/universe/names/',
                    {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(missing)
                    }
                );
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                data.forEach(entry => {
                    const name = entry.name || `Type ${entry.id}`;
                    this.typeNameCache.set(entry.id, name);
                    names.set(entry.id, name);
                });
            } catch (_) {
                // Fall through to stable placeholders.
            }
        }

        typeIds.forEach(typeId => {
            if (!names.has(typeId)) names.set(typeId, `Type ${typeId}`);
        });
        return names;
    }

    async renderCloneLocation(location) {
        const element = this.cloneLocation;
        if (!element) return;

        const token = ++this.cloneLocationToken;
        const locationId = location?.location_id;
        const locationType = location?.location_type;

        if (!locationId) {
            element.textContent = 'Unknown';
            element.title = '';
            return;
        }

        if (locationType === 'station') {
            element.textContent = 'Station';
            element.title = 'Loading station name...';
            try {
                const response = await fetch(
                    `https://esi.evetech.net/latest/universe/stations/${locationId}/?datasource=tranquility`
                );
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (token !== this.cloneLocationToken) return;
                const name = data.name || 'Station';
                this.locationNameCache.set(`station:${locationId}`, name);
                element.textContent = name;
                element.title = name;
            } catch (_) {
                if (token !== this.cloneLocationToken) return;
                element.textContent = 'Station';
                element.title = 'Station name unavailable';
            }
            return;
        }

        if (!esiAuth.hasStructuresScope()) {
            element.innerHTML = 'Structure <button class="stat-link" id="structureNameLoginBtn" type="button">Show name</button>';
            element.title = 'Re-authorise with EVE SSO to reveal citadel names for structures you can dock in.';
            document.getElementById('structureNameLoginBtn')?.addEventListener('click', () => this.esiLoginBtn?.click());
            return;
        }

        element.textContent = 'Structure (loading...)';
        element.title = `Looking up structure ${locationId}...`;
        try {
            const data = await esiAuth.esiFetch(`/universe/structures/${locationId}/`);
            if (token !== this.cloneLocationToken) return;
            const name = data.name || 'Structure';
            this.locationNameCache.set(`structure:${locationId}`, name);
            element.textContent = name;
            element.title = name;
        } catch (error) {
            if (token !== this.cloneLocationToken) return;
            const message = String(error.message || error);
            const forbidden = message.includes('403');
            console.warn('[Skill Planner] Structure lookup failed', { locationId, message });

            // A few ESI records use the station ID range even when tagged as a
            // structure; try the public station endpoint as a fallback.
            try {
                const fallback = await fetch(
                    `https://esi.evetech.net/latest/universe/stations/${locationId}/?datasource=tranquility`
                );
                if (fallback.ok) {
                    const data = await fallback.json();
                    if (token !== this.cloneLocationToken) return;
                    if (data.name) {
                        element.textContent = data.name;
                        element.title = data.name;
                        return;
                    }
                }
            } catch (_) { /* fall through */ }

            element.innerHTML = forbidden
                ? 'Structure (no access) <button class="stat-link" id="structureNameRetryBtn" type="button">Retry</button>'
                : 'Structure (name unavailable) <button class="stat-link" id="structureNameRetryBtn" type="button">Retry</button>';
            element.title = `${forbidden ? 'ESI denied access to this structure.' : 'Could not read this structure from ESI.'}\nStructure ID: ${locationId}\n${message}`;
            document.getElementById('structureNameRetryBtn')?.addEventListener('click', () => this.renderCloneLocation(location));
        }
    }

    async renderImplantSummary() {
        const list = document.getElementById('implantList');
        const count = document.getElementById('implantCount');
        const boosterNote = document.getElementById('boosterNote');
        if (!list) return;

        const token = ++this.implantRenderToken;
        const typeIds = this.getImplantTypeIds();

        if (!this.currentCharacterData?.attributes) {
            if (count) count.textContent = '';
            list.innerHTML = '<span class="implant-empty">ESI attributes are unavailable.</span>';
            return;
        }

        if (typeIds.length === 0) {
            if (count) count.textContent = '0 active';
            list.innerHTML = '<span class="implant-empty">No active implants detected.</span>';
        } else {
            if (count) count.textContent = `${typeIds.length} active`;
            list.innerHTML = '<span class="implant-empty">Loading implant names...</span>';

            const names = await this.resolveTypeNames(typeIds);
            if (token !== this.implantRenderToken) return;

            const implants = typeIds.map(typeId => ({
                typeId,
                name: names.get(typeId),
                bonus: this.formatImplantBonus(typeId)
            }));

            list.innerHTML = implants.map(implant => `
                <span class="implant-chip" title="${this.escapeHtml(implant.name)} - ${this.escapeHtml(implant.bonus)}">
                    <strong>${this.escapeHtml(implant.name)}</strong>
                    <small>${this.escapeHtml(implant.bonus)}</small>
                </span>`).join('');
        }

        if (boosterNote) {
            const boosters = this.currentCharacterData?.boosters || [];
            if (boosters.length > 0) {
                const boosterIds = boosters
                    .map(booster => typeof booster === 'number' ? booster : booster?.type_id)
                    .filter(typeId => Number.isInteger(typeId) && typeId > 0);
                const boosterNames = await this.resolveTypeNames(boosterIds);
                if (token !== this.implantRenderToken) return;
                boosterNote.innerHTML = `<i class="fas fa-flask"></i> Active booster: ${boosterIds.map(typeId => this.escapeHtml(boosterNames.get(typeId))).join(', ')}. Its bonus is included in the totals above.`;
            } else {
                boosterNote.innerHTML = '<i class="fas fa-flask"></i> ESI does not expose the specific active booster. Any booster bonus is already included in the attribute totals above.';
            }
        }
    }

    // ESI returns effective attributes with implants (and any active cerebral
    // accelerator) already applied. Remove the known implant portion so the
    // calculator can add it back without double-counting.
    getCharacterBaseAttributes() {
        const attrs = this.currentCharacterData?.attributes || {
            intelligence: 20,
            memory: 20,
            perception: 20,
            willpower: 20,
            charisma: 19
        };
        const bonuses = this.getCurrentImplantBonuses();

        return {
            intelligence: Math.max(1, (attrs.intelligence || 20) - bonuses.intelligence),
            memory: Math.max(1, (attrs.memory || 20) - bonuses.memory),
            perception: Math.max(1, (attrs.perception || 20) - bonuses.perception),
            willpower: Math.max(1, (attrs.willpower || 20) - bonuses.willpower),
            charisma: Math.max(1, (attrs.charisma || 19) - bonuses.charisma)
        };
    }

    getCharacterTrainingSettings() {
        const settings = {
            attributes: this.getCharacterBaseAttributes(),
            implants: { 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
            accelerator: { enabled: false, bonus: 10, typeId: 0 }
        };

        const implants = this.currentCharacterData?.implants || [];
        const implantBonuses = window.IMPLANT_BONUSES || {};
        const implantSlots = {
            intelligence: 6,
            memory: 7,
            perception: 8,
            willpower: 9,
            charisma: 10
        };
        implants.forEach(implant => {
            const typeId = typeof implant === 'number' ? implant : implant?.type_id;
            const bonuses = implantBonuses[typeId];
            if (!bonuses) return;
            Object.entries(bonuses).forEach(([attribute, bonus]) => {
                const slot = implantSlots[attribute];
                if (slot) settings.implants[slot] = bonus;
            });
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
            const injectorCost = injectorCalc.calculateCost(injectors.count, this.injectorPrice);

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
            this.selectedPlanSkills.clear();
            this.updatePlanBulkBar();
            this.updatePlanHistoryButtons();
            return;
        }
        
        this.planName.value = skillPlanner.getName();

        const baselineSettings = this.getCharacterTrainingSettings();
        const hasOverrides = this.calculatorOverrides && this.settingsDiffer(this.calculatorOverrides, baselineSettings);

        const planIds = new Set(plan.map(item => item.skillId));
        this.selectedPlanSkills.forEach(id => {
            if (!planIds.has(id)) this.selectedPlanSkills.delete(id);
        });

        this.planList.innerHTML = plan.map((item, index) => {
            const skill = window.SKILLS[item.skillId];
            const selected = this.selectedPlanSkills.has(item.skillId);
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

                if (Math.abs(overrideMinutes - baselineMinutes) >= 0.5) {
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
                <div class="plan-skill-item ${selected ? 'selected' : ''}" data-skill-id="${item.skillId}" data-index="${index}" draggable="true">
                    <span class="plan-drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>
                    <input type="checkbox" class="plan-select" data-skill-id="${item.skillId}" ${selected ? 'checked' : ''} aria-label="Select ${this.escapeHtml(skill.name)}">
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

        this.planList.querySelectorAll('.plan-select').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const skillId = parseInt(checkbox.dataset.skillId);
                if (checkbox.checked) this.selectedPlanSkills.add(skillId);
                else this.selectedPlanSkills.delete(skillId);
                checkbox.closest('.plan-skill-item')?.classList.toggle('selected', checkbox.checked);
                this.updatePlanBulkBar();
            });
        });

        let draggedSkillId = null;
        this.planList.querySelectorAll('.plan-skill-item').forEach(row => {
            row.addEventListener('dragstart', event => {
                draggedSkillId = parseInt(row.dataset.skillId);
                row.classList.add('dragging');
                event.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => {
                draggedSkillId = null;
                row.classList.remove('dragging');
            });
            row.addEventListener('dragover', event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                row.classList.add('drag-over');
            });
            row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
            row.addEventListener('drop', event => {
                event.preventDefault();
                row.classList.remove('drag-over');
                if (draggedSkillId == null) return;
                const targetIndex = parseInt(row.dataset.index);
                skillPlanner.moveSkill(draggedSkillId, targetIndex);
            });
        });

        this.updatePlanBulkBar();
        this.updatePlanHistoryButtons();
    }

    updatePlanBulkBar() {
        const bar = document.getElementById('planBulkBar');
        const count = document.getElementById('planSelectedCount');
        const size = this.selectedPlanSkills.size;
        if (bar) bar.classList.toggle('hidden', size === 0);
        if (count) count.textContent = size;
    }

    clearPlanSelection() {
        this.selectedPlanSkills.clear();
        this.renderPlan();
    }

    bulkSetPlanLevel() {
        const level = parseInt(document.getElementById('planBulkLevel')?.value || 1);
        const count = skillPlanner.updateSkillLevels([...this.selectedPlanSkills], level);
        if (count) this.showMessage(`Updated ${count} skill${count === 1 ? '' : 's'} to level ${this.roman(level)}.`, 'success');
    }

    bulkRemovePlanSkills() {
        const count = skillPlanner.removeSkills([...this.selectedPlanSkills]);
        if (count) {
            this.selectedPlanSkills.clear();
            this.showMessage(`Removed ${count} skill${count === 1 ? '' : 's'} from the plan.`, 'info');
        }
    }

    updatePlanHistoryButtons() {
        const undo = document.getElementById('undoPlanBtn');
        const redo = document.getElementById('redoPlanBtn');
        if (undo) undo.disabled = !skillPlanner.canUndo();
        if (redo) redo.disabled = !skillPlanner.canRedo();
    }

    undoPlan() {
        if (skillPlanner.undo()) {
            this.updatePlanHistoryButtons();
            this.showMessage('Plan change undone.', 'info');
        }
    }

    redoPlan() {
        if (skillPlanner.redo()) {
            this.updatePlanHistoryButtons();
            this.showMessage('Plan change redone.', 'info');
        }
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

        const queueTiming = this.getQueueTiming();
        const now = new Date();
        const planStart = queueTiming.active && queueTiming.queueEnd > now
            ? queueTiming.queueEnd
            : now;

        if (this.sumCompletionDate) {
            if (active.summary.totalMinutes > 0) {
                const finish = new Date(now.getTime() + active.summary.totalMinutes * 60 * 1000);
                this.sumCompletionDate.textContent = finish.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                this.sumCompletionDate.title = 'Estimated from now, assuming continuous training';
            } else {
                this.sumCompletionDate.textContent = '--';
                this.sumCompletionDate.title = '';
            }
        }

        const planStartEl = document.getElementById('sumPlanStart');
        if (planStartEl) {
            planStartEl.textContent = queueTiming.active
                ? planStart.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                })
                : 'Now';
            planStartEl.title = queueTiming.active
                ? 'The plan starts when the current EVE skill queue finishes'
                : 'No active skill queue';
        }

        const completionQueueEl = document.getElementById('sumCompletionQueue');
        if (completionQueueEl) {
            if (active.summary.totalMinutes > 0) {
                const actualFinish = new Date(planStart.getTime() + active.summary.totalMinutes * 60 * 1000);
                completionQueueEl.textContent = actualFinish.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } else {
                completionQueueEl.textContent = queueTiming.active
                    ? planStart.toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    })
                    : '--';
            }
        }

        const queueNote = document.getElementById('queuePlanNote');
        if (queueNote) {
            const totalEntries = queueTiming.count + skillPlanner.getPlanLength();
            const batches = Math.ceil(totalEntries / 50);
            if (queueTiming.active) {
                queueNote.innerHTML = `<i class="fas fa-clock"></i> Current queue ends ${planStart.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. Training the plan starts after that.`;
                queueNote.classList.remove('hidden');
            } else if (batches > 1) {
                queueNote.innerHTML = `<i class="fas fa-triangle-exclamation"></i> EVE's skill queue holds 50 entries; this plan needs ${batches} queue batches.`;
                queueNote.classList.remove('hidden');
            } else {
                queueNote.classList.add('hidden');
            }

            if (queueTiming.active && batches > 1) {
                queueNote.innerHTML += ` EVE's queue holds 50 entries; this plan needs ${batches} batches.`;
            }
        }

        this.injLargeCount.textContent = active.injectors.count;
        this.injTotalCost.textContent = active.injectorCost.formatted;

        const tierLabel = document.getElementById('injTierLabel');
        if (tierLabel) {
            tierLabel.textContent = active.injectors.tierLabel || '500k';
        }

        // Fire-and-forget: the price lookup must never block plan rendering.
        this.updateBookCost();

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
        
        // Update badge and doctrine coverage
        this.updatePlanBadge();
        this.updatePlanImpact();
    }

    getAllFitAnalyses() {
        return [
            ...(this.savedFits || []),
            ...((this.libraryAnalyses || []).map(item => item.analysis))
        ].filter(Boolean);
    }

    getPlannedSkillLevels() {
        const levels = new Map();
        if (this.currentCharacterData?.skills?.skills) {
            this.currentCharacterData.skills.skills.forEach(skill => {
                levels.set(skill.skill_id, skill.trained_skill_level || 0);
            });
        }
        skillPlanner.getPlan().forEach(item => {
            levels.set(item.skillId, Math.max(levels.get(item.skillId) || 0, item.targetLevel));
        });
        return levels;
    }

    fitIsReadyWithLevels(fit, levels) {
        return Object.entries(fit.required || {}).every(([skillId, level]) => {
            return (levels.get(parseInt(skillId, 10)) || 0) >= level;
        });
    }

    getQueueTiming() {
        const rawQueue = this.currentCharacterData?.queue;
        const queue = Array.isArray(rawQueue) ? rawQueue : (rawQueue?.data || []);
        if (!queue.length) {
            return { active: false, queueEnd: null, count: 0 };
        }

        const last = queue[queue.length - 1];
        const end = last?.finish_date ? new Date(last.finish_date) : null;
        return {
            active: Boolean(end && end.getTime() > Date.now()),
            queueEnd: end,
            count: queue.length
        };
    }

    updatePlanImpact() {
        const target = document.getElementById('planImpactContent');
        if (!target) return;

        const fits = this.getAllFitAnalyses();
        if (fits.length === 0) {
            target.innerHTML = '<p class="empty-hint">Save an EVE fitting or add a doctrine to see what this plan unlocks.</p>';
            return;
        }

        const levels = this.getPlannedSkillLevels();
        const readyNow = fits.filter(fit => fit.missing.length === 0);
        const readyAfter = fits.filter(fit => this.fitIsReadyWithLevels(fit, levels));
        const unlocked = readyAfter.filter(fit => !readyNow.includes(fit));

        const unlockedNames = unlocked.slice(0, 4).map(fit => this.escapeHtml(fit.fitName));
        const more = unlocked.length > unlockedNames.length
            ? ` and ${unlocked.length - unlockedNames.length} more`
            : '';

        target.innerHTML = `
            <div class="impact-stat-grid">
                <div><b>${readyNow.length}/${fits.length}</b><span>ready now</span></div>
                <div><b>+${unlocked.length}</b><span>unlocked by plan</span></div>
            </div>
            <p class="impact-summary">
                ${unlocked.length
                    ? `This plan unlocks ${unlockedNames.join(', ')}${more}.`
                    : (skillPlanner.getPlanLength()
                        ? 'No additional saved fits are unlocked by the current plan yet.'
                        : 'Add skills to the plan to see which doctrines it unlocks.')}
            </p>`;
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
        this.updatePlanHistoryButtons();

        if (skillPlanner.getPlanLength() === 0) {
            this.prereqBreakdownPanel?.classList.add('hidden');
            if (this.prereqBreakdownContent) {
                this.prereqBreakdownContent.innerHTML = '';
            }
        }
        
        // Refresh skill list to show icons
        if (this.currentView === 'skills') {
            this.renderSkillCategories();
        }
    }

    renderPrerequisiteBreakdown(result) {
        if (!this.prereqBreakdownPanel || !this.prereqBreakdownContent || !result) return;

        const root = result.rootChange;
        const details = result.prerequisiteDetails || [];

        const lines = [];
        lines.push(`<div class="prereq-breakdown-line changed"><b>${root?.skillName || 'Skill'}:</b> from level ${root?.fromLevel ?? 0} to ${root?.toLevel ?? 0}</div>`);

        if (details.length === 0) {
            lines.push('<div class="prereq-breakdown-line met">No additional prerequisites required.</div>');
        } else {
            details.forEach(d => {
                if (d.changed) {
                    lines.push(`<div class="prereq-breakdown-line changed"><b>${d.skillName}</b>: from level ${d.fromLevel} to ${d.toLevel} (required ${d.requiredLevel})</div>`);
                } else {
                    lines.push(`<div class="prereq-breakdown-line met"><b>${d.skillName}</b>: already level ${d.fromLevel} (required ${d.requiredLevel})</div>`);
                }
            });
        }

        this.prereqBreakdownContent.innerHTML = lines.join('');
        this.prereqBreakdownPanel.classList.remove('hidden');
    }

    async addSkillToPlan(skillId, targetLevel) {
        const result = await skillPlanner.addSkillWithPrerequisites(skillId, targetLevel, this.currentCharacterData?.skills);

        if (result.success) {
            const changed = (result.prerequisiteDetails || []).filter(d => d.changed).length;
            const total = (result.prerequisiteDetails || []).length;
            this.renderPrerequisiteBreakdown(result);
            this.showMessage(`Added ${window.SKILLS[skillId]?.name || 'skill'} ${targetLevel}. Prerequisites: ${changed} updated, ${total - changed} already met.`, 'success');
        } else {
            this.showMessage(result.message, 'warning');
        }
    }

    async autoFixPrereqs() {
        const added = await skillPlanner.autoResolvePrerequisites(this.currentCharacterData?.skills);
        if (added.length > 0) {
            this.showMessage(`Added ${added.length} prerequisite skills`, 'success');
        } else {
            this.showMessage('All prerequisites are satisfied', 'info');
        }
    }

    optimizePlan() {
        if (skillPlanner.getPlanLength() === 0) return;
        skillPlanner.recordUndo();
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
        this.downloadPlanText();
    }

    // Saved plan manager
    openPlanManager() {
        const modal = document.getElementById('planManagerModal');
        const nameInput = document.getElementById('planManagerName');
        if (nameInput) nameInput.value = skillPlanner.getName();
        this.renderSavedPlans();
        modal?.classList.remove('hidden');
        nameInput?.focus();
    }

    closePlanManager() {
        document.getElementById('planManagerModal')?.classList.add('hidden');
    }

    renderSavedPlans() {
        const list = document.getElementById('savedPlanList');
        if (!list) return;

        const plans = skillPlanner.loadSavedPlans();
        const entries = Object.entries(plans).sort((a, b) => {
            return new Date(b[1].savedAt || 0) - new Date(a[1].savedAt || 0);
        });

        if (entries.length === 0) {
            list.innerHTML = '<p class="empty-state">No saved plans yet. Name this plan and click Save Current.</p>';
            return;
        }

        list.innerHTML = entries.map(([name, data]) => `
            <div class="saved-plan-item">
                <div class="saved-plan-info">
                    <strong>${this.escapeHtml(name)}</strong>
                    <small>${(data.plan || []).length} skills${data.savedAt ? ` &middot; ${new Date(data.savedAt).toLocaleString()}` : ''}</small>
                </div>
                <div class="saved-plan-actions">
                    <button class="btn-secondary btn-small" data-load-plan="${this.escapeHtml(name)}">Load</button>
                    <button class="btn-secondary btn-small" data-compare-plan="${this.escapeHtml(name)}">Compare</button>
                    <button class="btn-secondary btn-small" data-duplicate-plan="${this.escapeHtml(name)}">Duplicate</button>
                    <button class="btn-danger btn-small" data-delete-plan="${this.escapeHtml(name)}">Delete</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('[data-load-plan]').forEach(button => {
            button.addEventListener('click', () => this.loadPlanFromManager(button.dataset.loadPlan));
        });
        list.querySelectorAll('[data-delete-plan]').forEach(button => {
            button.addEventListener('click', () => this.deletePlanFromManager(button.dataset.deletePlan));
        });
        list.querySelectorAll('[data-duplicate-plan]').forEach(button => {
            button.addEventListener('click', () => this.duplicatePlanFromManager(button.dataset.duplicatePlan));
        });
        list.querySelectorAll('[data-compare-plan]').forEach(button => {
            button.addEventListener('click', () => this.comparePlanFromManager(button.dataset.comparePlan));
        });
    }

    savePlanFromManager() {
        const input = document.getElementById('planManagerName');
        const name = input?.value.trim() || skillPlanner.getName();
        if (!name) {
            this.showMessage('Enter a plan name first', 'warning');
            return;
        }
        skillPlanner.setName(name);
        skillPlanner.saveNamedPlan(name);
        this.renderSavedPlans();
        this.showMessage(`Plan "${name}" saved`, 'success');
    }

    loadPlanFromManager(name) {
        if (!skillPlanner.loadNamedPlan(name)) return;
        this.closePlanManager();
        this.planName.value = skillPlanner.getName();
        this.renderPlan();
        this.updatePlanSummary();
        this.updatePlanBadge();
        this.showMessage(`Plan "${name}" loaded`, 'success');
    }

    deletePlanFromManager(name) {
        if (!confirm(`Delete saved plan "${name}"?`)) return;
        skillPlanner.deleteNamedPlan(name);
        this.renderSavedPlans();
        this.showMessage(`Plan "${name}" deleted`, 'info');
    }

    duplicatePlanFromManager(name) {
        const newName = prompt('Name for the copy:', `${name} copy`);
        if (!newName || newName === name) return;
        if (skillPlanner.duplicateNamedPlan(name, newName)) {
            this.renderSavedPlans();
            this.showMessage(`Plan "${name}" duplicated as "${newName}".`, 'success');
        } else {
            this.showMessage('Could not duplicate that plan.', 'error');
        }
    }

    comparePlanFromManager(name) {
        const plans = skillPlanner.loadSavedPlans();
        const saved = plans[name];
        if (!saved) return;

        const current = new Map(skillPlanner.getPlan().map(item => [item.skillId, item.targetLevel]));
        const other = new Map((saved.plan || []).map(item => [item.skillId, item.targetLevel]));
        const ids = new Set([...current.keys(), ...other.keys()]);

        const rows = [...ids].map(skillId => {
            const currentLevel = current.get(skillId) || 0;
            const otherLevel = other.get(skillId) || 0;
            if (currentLevel === otherLevel) return null;

            const skill = window.SKILLS[skillId];
            let change;
            if (!currentLevel) change = `Only in saved plan: ${this.roman(otherLevel)}`;
            else if (!otherLevel) change = `Only in current plan: ${this.roman(currentLevel)}`;
            else change = `Current ${this.roman(currentLevel)} → saved ${this.roman(otherLevel)}`;

            return `<div class="compare-row"><span>${this.escapeHtml(skill?.name || `Skill ${skillId}`)}</span><small>${change}</small></div>`;
        }).filter(Boolean);

        const currentMinutes = trainingCalc.calculatePlanTime(skillPlanner.getPlan(), this.currentCharacterData?.skills).totalMinutes;
        const savedMinutes = trainingCalc.calculatePlanTime(
            (saved.plan || []).map(item => ({ skillId: item.skillId, targetLevel: item.targetLevel })),
            this.currentCharacterData?.skills
        ).totalMinutes;

        const content = document.getElementById('planCompareContent');
        const title = document.getElementById('planCompareTitle');
        if (title) title.textContent = `Current Plan vs ${name}`;
        if (content) {
            content.innerHTML = `
                <div class="compare-summary">
                    <div><span>Current plan</span><strong>${current.size} skills · ${trainingCalc.formatTime(currentMinutes)}</strong></div>
                    <div><span>${this.escapeHtml(name)}</span><strong>${other.size} skills · ${trainingCalc.formatTime(savedMinutes)}</strong></div>
                </div>
                ${rows.length ? `<div class="compare-list">${rows.join('')}</div>` : '<p class="fit-note success">The plans have identical skill targets.</p>'}`;
        }
        document.getElementById('planCompareModal')?.classList.remove('hidden');
    }

    closePlanCompare() {
        document.getElementById('planCompareModal')?.classList.add('hidden');
    }

    savePlanDialog() { this.openPlanManager(); }
    loadSavedPlan() { this.openPlanManager(); }
    deletePlan() { this.openPlanManager(); }

    // Import
    openImportPlan() {
        const modal = document.getElementById('planImportModal');
        const text = document.getElementById('planImportText');
        const file = document.getElementById('planImportFile');
        const label = document.getElementById('planImportFileLabel');
        if (text) text.value = '';
        if (file) file.value = '';
        if (label) label.textContent = '';
        modal?.classList.remove('hidden');
        text?.focus();
    }

    closeImportPlan() {
        document.getElementById('planImportModal')?.classList.add('hidden');
    }

    loadImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = document.getElementById('planImportText');
            if (text) text.value = reader.result;
            const label = document.getElementById('planImportFileLabel');
            if (label) label.textContent = file.name;
        };
        reader.readAsText(file);
    }

    async submitImportPlan() {
        const text = document.getElementById('planImportText')?.value.trim();
        if (!text) {
            this.showMessage('Paste a skill plan or choose a file first', 'warning');
            return;
        }

        const isJson = text.startsWith('{') || text.startsWith('[');
        const result = isJson
            ? skillPlanner.importPlan(text)
            : await skillPlanner.importPlanText(text, this.currentCharacterData?.skills);

        this.showMessage(result.message, result.success ? 'success' : 'error');
        if (!result.success) return;

        this.closeImportPlan();
        this.planName.value = skillPlanner.getName();
        this.renderPlan();
        this.updatePlanSummary();
        this.updatePlanBadge();
    }

    importPlan() {
        this.openImportPlan();
    }

    importFromQueue() {
        const charId = esiAuth.getCurrentCharacter();
        if (!charId) {
            this.showMessage('Please login with EVE SSO first', 'error');
            return;
        }

        const rawQueue = this.currentCharacterData?.queue;
        const queueData = Array.isArray(rawQueue) ? rawQueue : (rawQueue?.data || []);
        if (queueData.length === 0) {
            this.showMessage('No skills in your current queue', 'error');
            return;
        }

        const planSkills = queueData.map(item => ({
            skillId: item.skill_id,
            targetLevel: item.finished_level ?? item.finish_level
        })).filter(item => Number.isInteger(item.skillId) && Number.isInteger(item.targetLevel));

        const result = skillPlanner.importPlan(JSON.stringify({ skills: planSkills }));
        if (result.success) {
            this.showMessage(`Imported ${planSkills.length} skills from your queue`, 'success');
            this.renderPlan();
            this.updatePlanSummary();
            this.updatePlanBadge();
        } else {
            this.showMessage(result.message, 'error');
        }
    }

    // Fit import
    normalizeFitName(value) {
        return window.FitUtils
            ? window.FitUtils.normalizeFitName(value)
            : String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    resolveFitEntry(data, name) {
        const alias = this.fitAliases?.[this.normalizeFitName(name)];
        if (alias) {
            const aliased = window.FitUtils
                ? window.FitUtils.resolveFitEntry(data, alias)
                : (data[this.normalizeFitName(alias)] || null);
            if (aliased) return aliased;
        }
        return window.FitUtils
            ? window.FitUtils.resolveFitEntry(data, name)
            : (data[this.normalizeFitName(name)] || null);
    }

    buildFitItems(items, data) {
        return (items || []).map(item => {
            const entry = this.resolveFitEntry(data, item.name);
            return {
                name: entry?.name || item.name,
                quantity: item.quantity || 1,
                group: entry?.group || 'Unknown',
                known: Boolean(entry)
            };
        });
    }

    renderFitItems(items) {
        if (!items || items.length === 0) {
            return '<p class="fit-note">No fitted items were found.</p>';
        }

        return `<div class="fit-item-list">${items.map(item => `
            <span class="fit-item-chip ${item.known ? '' : 'unknown'}" title="${this.escapeHtml(item.group)}">
                <span>${this.escapeHtml(item.name)}</span>
                ${item.quantity > 1 ? `<b>&times;${item.quantity}</b>` : ''}
            </span>`).join('')}</div>`;
    }

    openUnknownItemResolver() {
        const modal = document.getElementById('unknownItemModal');
        const content = document.getElementById('unknownItemContent');
        if (!modal || !content || !this.fitAnalysis?.unknown?.length) return;

        this.unknownMappings = {};
        content.innerHTML = `
            <p class="hint">Some item names were not found in the SDE. Search for the correct item below. Mappings are remembered for future imports.</p>
            ${this.fitAnalysis.unknown.map((name, index) => `
                <div class="unknown-item-row">
                    <div class="unknown-item-head">
                        <strong>${this.escapeHtml(name)}</strong>
                        <span class="unknown-item-status" data-unknown-status="${index}">Not mapped</span>
                    </div>
                    <input type="text" class="form-input unknown-item-search" data-unknown-search="${index}" placeholder="Search SDE items..." autocomplete="off">
                    <div class="unknown-item-results" data-unknown-results="${index}"></div>
                </div>`).join('')}`;

        content.querySelectorAll('[data-unknown-search]').forEach(input => {
            input.addEventListener('input', () => this.searchUnknownItem(Number(input.dataset.unknownSearch), input.value));
        });
        modal.classList.remove('hidden');
    }

    searchUnknownItem(index, term) {
        const results = document.querySelector(`[data-unknown-results="${index}"]`);
        if (!results) return;

        const query = String(term || '').trim().toLowerCase();
        if (query.length < 2) {
            results.innerHTML = '';
            return;
        }

        const unkName = this.fitAnalysis?.unknown?.[index];
        if (!unkName) return;

        const matches = Object.values(this.fitData || {})
            .filter(entry => `${entry.name} ${entry.group}`.toLowerCase().includes(query))
            .slice(0, 8);

        results.innerHTML = matches.length
            ? matches.map(entry => `
                <button type="button" class="unknown-item-result" data-unknown-pick="${index}" data-entry-name="${this.escapeHtml(entry.name)}">
                    <span>${this.escapeHtml(entry.name)}</span>
                    <small>${this.escapeHtml(entry.group || entry.category || '')}</small>
                </button>`).join('')
            : '<p class="empty-hint">No matches</p>';

        results.querySelectorAll('[data-unknown-pick]').forEach(button => {
            button.addEventListener('click', () => {
                const entryName = button.dataset.entryName;
                this.unknownMappings[unkName] = entryName;
                const status = document.querySelector(`[data-unknown-status="${index}"]`);
                if (status) {
                    status.textContent = `Mapped to ${entryName}`;
                    status.classList.add('mapped');
                }
                results.innerHTML = '';
            });
        });
    }

    closeUnknownItemResolver() {
        document.getElementById('unknownItemModal')?.classList.add('hidden');
        this.unknownMappings = {};
    }

    async applyUnknownItemMappings() {
        const mappings = this.unknownMappings || {};
        const names = Object.keys(mappings);
        if (names.length === 0) {
            this.showMessage('No items have been mapped yet.', 'warning');
            return;
        }

        names.forEach(name => {
            this.fitAliases[this.normalizeFitName(name)] = mappings[name];
        });
        this.saveFitAliases();

        const text = this.fitAnalysis?.eftText || this.lastFitText;
        this.closeUnknownItemResolver();

        if (text) {
            try {
                const { analysis } = await this.analyseFitText(text, { remember: true });
                this.fitAnalysis = analysis;
                this.renderFitAnalysis();
                this.showMessage(`Mapped ${names.length} item${names.length === 1 ? '' : 's'}.`, 'success');
            } catch (error) {
                this.showMessage(error.message, 'error');
            }
        }
    }

    openLibraryImport() {
        this.openFitImport(true);
    }

    openFitImport(fromLibrary = false) {
        this.autoLibrarySave = Boolean(fromLibrary);
        const modal = document.getElementById('fitImportModal');
        const text = document.getElementById('fitImportText');
        const file = document.getElementById('fitImportFile');
        const label = document.getElementById('fitImportFileLabel');

        if (text) text.value = '';
        if (file) file.value = '';
        if (label) label.textContent = '';
        modal?.classList.remove('hidden');
        text?.focus();
    }

    closeFitImport() {
        document.getElementById('fitImportModal')?.classList.add('hidden');
    }

    loadFitFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = document.getElementById('fitImportText');
            if (text) text.value = reader.result;
            const label = document.getElementById('fitImportFileLabel');
            if (label) label.textContent = file.name;
        };
        reader.readAsText(file);
    }

    async readFitDataCache() {
        if (typeof indexedDB === 'undefined') return null;

        try {
            const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('rusty-skillplanner', 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains('assets')) {
                        request.result.createObjectStore('assets');
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            const cached = await new Promise((resolve, reject) => {
                const tx = db.transaction('assets', 'readonly');
                const request = tx.objectStore('assets').get('fit-data-v2');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            db.close();

            if (!cached?.data) return null;
            if (Date.now() - cached.timestamp > 24 * 60 * 60 * 1000) return null;
            return cached.data;
        } catch (_) {
            return null;
        }
    }

    async writeFitDataCache(data) {
        if (typeof indexedDB === 'undefined') return;

        try {
            const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('rusty-skillplanner', 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains('assets')) {
                        request.result.createObjectStore('assets');
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            await new Promise((resolve, reject) => {
                const tx = db.transaction('assets', 'readwrite');
                tx.objectStore('assets').put({ data, timestamp: Date.now() }, 'fit-data-v2');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch (_) {
            // IndexedDB is an optional performance improvement.
        }
    }

    async loadFitData() {
        if (this.fitData) return this.fitData;
        if (this.fitDataPromise) return this.fitDataPromise;

        this.fitDataPromise = (async () => {
            const cached = await this.readFitDataCache();
            if (cached) return cached;

            const response = await fetch('fit-data.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Fit data unavailable (HTTP ${response.status})`);
            const data = await response.json();
            this.writeFitDataCache(data);
            return data;
        })()
            .then(data => {
                this.fitData = data;
                this.fitDataById = {};
                Object.values(data).forEach(entry => {
                    if (entry?.id) this.fitDataById[entry.id] = entry;
                });
                this.shipData = Object.values(data)
                    .filter(entry => entry.category === 'Ship')
                    .sort((a, b) => a.name.localeCompare(b.name));
                return data;
            })
            .finally(() => {
                this.fitDataPromise = null;
            });

        return this.fitDataPromise;
    }

    parseFitText(text) {
        const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error('Paste an EFT fit first.');

        const header = lines.shift().match(/^\[([^\],]+)(?:,\s*(.+?))?\]$/);
        if (!header) throw new Error('The first line must look like [Ship, Fit Name].');

        const hullName = header[1].trim();
        // EVE prefixes simulated fittings with an asterisk; keep the name clean.
        const fitName = ((header[2] || '').trim() || `${hullName} fit`).replace(/^\*\s*/, '');
        const items = [];

        lines.forEach(line => {
            if (/^\[empty/i.test(line)) return;
            if (/^---/.test(line)) return;
            if (/^[;#]/.test(line)) return;

            const quantityMatch = line.match(/^(.+?)\s+x(\d+)$/i);
            const name = (quantityMatch ? quantityMatch[1] : line).trim();
            const quantity = quantityMatch ? Number(quantityMatch[2]) : 1;
            if (!name || /^\[empty/i.test(name)) return;
            items.push({ name, quantity });
        });

        return { hullName, fitName, items };
    }

    async analyseFitText(text, { remember = true } = {}) {
        const parsed = this.parseFitText(text);
        const fitData = await this.loadFitData();
        const hull = this.resolveFitEntry(fitData, parsed.hullName);
        if (!hull) {
            throw new Error(`Hull "${parsed.hullName}" was not found in the SDE.`);
        }

        const entries = [];
        const unknown = [];
        parsed.items.forEach(item => {
            const entry = this.resolveFitEntry(fitData, item.name);
            if (!entry) {
                unknown.push(item.name);
                return;
            }
            entries.push(entry);
        });

        const analysis = this.buildFitAnalysisFromEntries({
            hull,
            entries,
            items: this.buildFitItems(parsed.items, fitData),
            totalItems: parsed.items.length,
            unknown,
            fitName: parsed.fitName
        });

        if (analysis) {
            analysis.eftText = String(text || '').trim();
            if (remember) this.lastFitText = analysis.eftText;
        }
        return { analysis, parsed, fitData };
    }

    async analyseFit() {
        const text = document.getElementById('fitImportText')?.value.trim();
        if (!text) {
            this.showMessage('Paste an EFT fit first.', 'warning');
            return;
        }

        const button = document.getElementById('analyseFitBtn');
        const originalLabel = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analysing...';
        }

        try {
            const { analysis } = await this.analyseFitText(text);
            this.fitAnalysis = analysis;
            this.closeFitImport();
            this.switchView('fit');
            if (this.autoLibrarySave) {
                this.autoLibrarySave = false;
                this.pendingLibraryAnalysis = analysis;
                this.openLibrarySaveModal();
            }
        } catch (error) {
            this.showMessage(error.message, 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalLabel;
            }
        }
    }

    buildFitAnalysisFromEntries({ hull, entries = [], items = [], totalItems = 0, unknown = [], fitName, fittingId = null, description = '' }) {
        if (!hull) return null;

        const requirements = new Map();
        const addSkills = entry => {
            Object.entries(entry.skills || {}).forEach(([skillId, level]) => {
                const id = parseInt(skillId, 10);
                if (Number.isInteger(id) && level > 0) {
                    requirements.set(id, Math.max(requirements.get(id) || 0, level));
                }
            });
        };

        addSkills(hull);
        entries.forEach(addSkills);

        // Expand prerequisites so the summary and generated plan agree.
        const expanded = new Map();
        const visiting = new Set();
        const addRequirement = (skillId, level) => {
            const skill = window.SKILLS[skillId];
            if (!skill) return;

            const current = expanded.get(skillId) || 0;
            if (level <= current) return;
            expanded.set(skillId, level);

            if (visiting.has(skillId)) return;
            visiting.add(skillId);
            Object.entries(skill.prereqs || {}).forEach(([id, prereqLevel]) => {
                addRequirement(parseInt(id, 10), prereqLevel);
            });
            visiting.delete(skillId);
        };

        requirements.forEach((level, id) => addRequirement(id, level));

        const currentLevels = new Map();
        if (this.currentCharacterData?.skills?.skills) {
            this.currentCharacterData.skills.skills.forEach(skill => {
                currentLevels.set(skill.skill_id, skill.trained_skill_level || 0);
            });
        }

        const missing = [];
        expanded.forEach((level, skillId) => {
            const current = currentLevels.get(skillId) || 0;
            if (level > current) {
                missing.push({
                    skillId,
                    skillName: window.SKILLS[skillId]?.name || `Skill ${skillId}`,
                    targetLevel: level,
                    currentLevel: current
                });
            }
        });
        missing.sort((a, b) => a.skillName.localeCompare(b.skillName));

        let trainingMinutes = 0;
        try {
            trainingMinutes = this.withTrainingCalcState(() => {
                this.applyTrainingSettings(this.calculatorOverrides || this.getCharacterTrainingSettings());
                return missing.reduce((total, skill) => {
                    return total + trainingCalc.calculateSkillTime(
                        skill.skillId,
                        skill.currentLevel,
                        skill.targetLevel
                    );
                }, 0);
            });
        } catch (_) {
            trainingMinutes = 0;
        }

        const completionDate = trainingMinutes > 0
            ? new Date(Date.now() + trainingMinutes * 60 * 1000)
            : null;
        const eftName = String(fitName || hull.name).replace(/[\[\]\r\n]/g, ' ').trim();
        const eftText = [
            `[${hull.name}, ${eftName}]`,
            ...items.map(item => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
        ].join('\n');

        return {
            fittingId,
            description,
            fitName,
            hullName: hull.name,
            category: hull.category || '',
            matchedItems: entries.length,
            totalItems,
            items,
            unknown,
            required: Object.fromEntries(expanded),
            missing,
            trainingMinutes,
            trainingTime: trainingCalc.formatTime(trainingMinutes),
            completionDate,
            eftText
        };
    }

    renderFitAnalysis() {
        const content = document.getElementById('fitViewContent');
        const createBtn = document.getElementById('fitViewCreatePlanBtn');
        const importBtn = document.getElementById('fitViewImportAnotherBtn');
        const copyBtn = document.getElementById('fitViewCopyBtn');
        const saveBtn = document.getElementById('fitViewSaveLibraryBtn');
        const title = document.getElementById('fitViewTitle');
        const subtitle = document.getElementById('fitViewSubtitle');
        const badge = document.getElementById('fitBadge');

        if (!content) return;

        if (!this.fitAnalysis) {
            if (title) title.textContent = 'Import a fit to get started';
            if (subtitle) subtitle.textContent = 'Paste an EFT fit and the planner will work out which skills you are missing.';
            createBtn?.classList.add('hidden');
            importBtn?.classList.add('hidden');
            copyBtn?.classList.add('hidden');
            saveBtn?.classList.add('hidden');
            badge?.classList.add('hidden');
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-wrench"></i>
                    <h3>No fit analysed yet</h3>
                    <p>Paste an EFT fit to see the hull, matched modules and missing skills.</p>
                    <button class="btn-primary" id="fitViewEmptyImportBtn">
                        <i class="fas fa-file-import"></i> Import Fit
                    </button>
                </div>`;
            document.getElementById('fitViewEmptyImportBtn')?.addEventListener('click', () => this.openFitImport());
            return;
        }

        const analysis = this.fitAnalysis;
        const missing = analysis.missing;
        const requiredCount = Object.keys(analysis.required || {}).length;
        const trainedCount = Math.max(0, requiredCount - missing.length);
        const unknownNote = analysis.unknown.length
            ? `<div class="fit-note warn"><strong>Not recognised:</strong> ${analysis.unknown.map(item => this.escapeHtml(item)).join(', ')}
                <button class="btn-small" id="resolveUnknownItemsBtn"><i class="fas fa-link"></i> Map Items</button>
               </div>`
            : '';
        const completion = analysis.completionDate
            ? analysis.completionDate.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            })
            : '';

        if (title) title.textContent = analysis.fitName;
        if (subtitle) subtitle.textContent = `${analysis.hullName} · ${analysis.matchedItems}/${analysis.totalItems} items matched · ${missing.length ? `${analysis.trainingTime} to fly` : 'ready to fly'}`;
        createBtn?.classList.toggle('hidden', missing.length === 0);
        importBtn?.classList.remove('hidden');
        copyBtn?.classList.remove('hidden');
        saveBtn?.classList.remove('hidden');

        if (badge) {
            badge.textContent = missing.length;
            badge.classList.toggle('hidden', missing.length === 0);
        }

        content.innerHTML = `
            <div class="fit-summary">
                <div><span>Hull</span><strong>${this.escapeHtml(analysis.hullName)}</strong></div>
                <div><span>Items matched</span><strong>${analysis.matchedItems}/${analysis.totalItems}</strong></div>
                <div><span>Required skills</span><strong>${requiredCount}</strong></div>
                <div><span>Already trained</span><strong>${trainedCount}</strong></div>
                <div><span>Missing skills</span><strong>${missing.length}</strong></div>
                <div><span>Time to fly</span><strong>${missing.length ? analysis.trainingTime : 'Ready'}</strong></div>
                <div><span>Completion</span><strong>${completion || '--'}</strong></div>
            </div>
            <div class="fit-view-section-head">
                <h3>Fitted items</h3>
                <span>${analysis.matchedItems}/${analysis.totalItems} resolved from the SDE</span>
            </div>
            ${this.renderFitItems(analysis.items)}
            <div class="fit-view-section-head">
                <h3>${missing.length ? 'Skills you are missing' : 'You can fly this fit'}</h3>
                <span>${this.currentCharacterData?.skills ? 'Compared with your signed-in character' : 'Sign in with EVE SSO to compare with your character'}</span>
            </div>
            ${missing.length
                ? `<div class="fit-skill-list">${missing.map(skill => `
                    <div class="fit-skill-item">
                        <span>${this.escapeHtml(skill.skillName)}</span>
                        <b>${this.roman(skill.targetLevel)}</b>
                        <small>${skill.currentLevel ? `have ${this.roman(skill.currentLevel)}` : 'not trained'}</small>
                    </div>`).join('')}</div>
                    <p class="fit-note">Creating a plan will add these skills and their prerequisites, ordered for training.</p>`
                : '<p class="fit-note success">You already meet every skill requirement for this fit.</p>'}
            ${unknownNote}
        `;

        document.getElementById('resolveUnknownItemsBtn')?.addEventListener('click', () => this.openUnknownItemResolver());
    }

    async createFitPlan() {
        if (!this.fitAnalysis || this.fitAnalysis.missing.length === 0) return;

        if (skillPlanner.getPlan().length > 0) {
            const replace = confirm('Replace the current skill plan with this fit plan?');
            if (!replace) return;
        }

        const result = skillPlanner.buildPlanFromRequirements(
            this.fitAnalysis.required,
            this.currentCharacterData?.skills,
            `Fit: ${this.fitAnalysis.fitName}`
        );

        if (!result.missing) {
            this.showMessage('You already meet every skill requirement for this fit.', 'success');
            return;
        }

        this.closeFitImport();
        this.planName.value = skillPlanner.getName();
        this.renderPlan();
        this.updatePlanSummary();
        this.updatePlanBadge();
        this.switchView('planner');
        this.showMessage(`Created a plan with ${result.missing} missing skills for ${this.fitAnalysis.fitName}.`, 'success');
    }

    // Saved in-game fittings
    async loadSavedFits(force = false) {
        if (!esiAuth.isAuthenticated()) {
            this.savedFits = null;
            this.savedFitsError = null;
            this.renderSavedFits();
            return;
        }
        if (!esiAuth.hasFittingsScope()) {
            this.savedFits = null;
            this.savedFitsError = 'Saved Fits needs the fittings permission. Sign in again to grant it; the rest of the planner remains available.';
            this.savedFitsErrorNeedsLogin = true;
            this.savedFitsSyncedAt = 0;
            this.renderSavedFits();
            return;
        }
        if (this.savedFitsLoading) return;
        if (this.savedFits && !force && this.savedFitsSyncedAt
            && Date.now() - this.savedFitsSyncedAt < this.savedFitsCacheMs) {
            this.renderSavedFits();
            return;
        }

        this.savedFitsLoading = true;
        this.savedFitsError = null;
        this.savedFitsErrorNeedsLogin = false;
        this.savedFitsRetryAction = 'load';
        this.renderSavedFits();

        try {
            const characterId = esiAuth.getCurrentCharacter();
            const [fittings] = await Promise.all([
                esiAuth.esiFetch(`/characters/${characterId}/fittings/`),
                this.loadFitData()
            ]);

            const byId = this.fitDataById || {};
            const analyses = [];

            (fittings || []).forEach(fitting => {
                const hull = byId[fitting.ship_type_id];
                if (!hull) return;

                const rawItems = fitting.items || [];
                const entries = [];
                const unknown = [];
                const items = rawItems.map(item => {
                    const entry = byId[item.type_id];
                    if (entry) {
                        entries.push(entry);
                    } else {
                        unknown.push(`Type ${item.type_id}`);
                    }
                    return {
                        name: entry?.name || `Type ${item.type_id}`,
                        quantity: item.quantity || 1,
                        group: entry?.group || 'Unknown',
                        known: Boolean(entry)
                    };
                });

                const analysis = this.buildFitAnalysisFromEntries({
                    hull,
                    entries,
                    items,
                    totalItems: rawItems.length,
                    unknown,
                    fitName: fitting.name || `Fitting ${fitting.fitting_id}`,
                    fittingId: fitting.fitting_id,
                    description: fitting.description || ''
                });

                if (analysis) analyses.push(analysis);
            });

            analyses.sort((a, b) => {
                return (b.missing.length - a.missing.length) || a.fitName.localeCompare(b.fitName);
            });

            this.savedFits = analyses;
            this.savedFitsSyncedAt = Date.now();

            const validKeys = new Set(analyses.map(fit => String(fit.fittingId)));
            this.selectedSavedFits.forEach(key => {
                if (!validKeys.has(key)) this.selectedSavedFits.delete(key);
            });
        } catch (error) {
            const message = String(error.message || error);
            this.savedFits = null;
            this.savedFitsSyncedAt = 0;
            this.savedFitsErrorNeedsLogin = message.includes('403');
            this.savedFitsError = this.savedFitsErrorNeedsLogin
                ? 'EVE denied access to your fittings. Sign in again to grant the fittings permission.'
                : error.message || 'Could not load saved fittings.';
        } finally {
            this.savedFitsLoading = false;
            this.renderSavedFits();
        }
    }

    savedFitKey(fit) {
        return fit?.fittingId == null ? `name:${fit?.fitName || ''}` : String(fit.fittingId);
    }

    updateMergeButton() {
        const button = document.getElementById('savedFitsMergeBtn');
        if (!button) return;

        const count = this.selectedSavedFits.size;
        button.classList.toggle('hidden', count === 0);
        button.disabled = count === 0;
        button.innerHTML = `<i class="fas fa-layer-group"></i> Combine Selected${count ? ` (${count})` : ''}`;
    }

    renderSavedFits() {
        const content = document.getElementById('savedFitsContent');
        const badge = document.getElementById('savedFitsBadge');
        const subtitle = document.getElementById('savedFitsSubtitle');
        const refreshBtn = document.getElementById('refreshSavedFitsBtn');
        if (!content) return;

        if (refreshBtn) {
            refreshBtn.disabled = this.savedFitsLoading;
        }

        const synced = this.savedFitsSyncedAt
            ? new Date(this.savedFitsSyncedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
            })
            : null;
        if (subtitle) {
            subtitle.textContent = synced
                ? `Fittings saved on your signed-in character · Synced ${synced}`
                : 'Fittings saved on your signed-in character.';
        }

        if (!esiAuth.isAuthenticated()) {
            badge?.classList.add('hidden');
            this.updateMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-list-check"></i>
                    <h3>Sign in to load your saved fits</h3>
                    <p>Your personal EVE fittings will be checked against your trained skills.</p>
                    <button class="btn-primary" id="savedFitsLoginBtn">
                        <i class="fas fa-user-astronaut"></i> Login with EVE
                    </button>
                </div>`;
            document.getElementById('savedFitsLoginBtn')?.addEventListener('click', () => this.esiLoginBtn?.click());
            return;
        }

        if (this.savedFitsLoading) {
            this.updateMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <div class="loading-spinner"></div>
                    <h3>Loading and analysing saved fits</h3>
                    <p>Reading fittings and comparing their skills with your character.</p>
                </div>`;
            return;
        }

        if (this.savedFitsError) {
            badge?.classList.add('hidden');
            this.updateMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-triangle-exclamation"></i>
                    <h3>Could not load saved fits</h3>
                    <p>${this.escapeHtml(this.savedFitsError)}</p>
                    <div class="fit-view-actions fit-empty-actions">
                        ${this.savedFitsErrorNeedsLogin
                            ? '<button class="btn-primary" id="savedFitsReloginBtn"><i class="fas fa-user-astronaut"></i> Sign in Again</button>'
                            : ''}
                        <button class="btn-secondary" id="savedFitsRetryBtn">
                            <i class="fas fa-rotate"></i> Try Again
                        </button>
                    </div>
                </div>`;
            document.getElementById('savedFitsReloginBtn')?.addEventListener('click', () => this.esiLoginBtn?.click());
            document.getElementById('savedFitsRetryBtn')?.addEventListener('click', () => {
                if (this.savedFitsRetryAction === 'refresh') {
                    this.refreshCharacter();
                } else {
                    this.loadSavedFits(true);
                }
            });
            return;
        }

        if (!Array.isArray(this.savedFits)) {
            this.updateMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-list-check"></i>
                    <h3>Loading saved fits</h3>
                    <p>Your EVE fittings will appear here.</p>
                </div>`;
            return;
        }

        if (this.savedFits.length === 0) {
            badge?.classList.add('hidden');
            this.updateMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-list-check"></i>
                    <h3>No saved fits found</h3>
                    <p>Save a fitting in EVE Online, then refresh this page.</p>
                    <button class="btn-primary" id="savedFitsEmptyImportBtn">
                        <i class="fas fa-file-import"></i> Paste a Fit Instead
                    </button>
                </div>`;
            document.getElementById('savedFitsEmptyImportBtn')?.addEventListener('click', () => this.openFitImport());
            return;
        }

        const missingFits = this.savedFits.filter(fit => fit.missing.length > 0).length;
        if (badge) {
            badge.textContent = missingFits;
            badge.classList.toggle('hidden', missingFits === 0);
        }

        const search = (document.getElementById('savedFitsSearch')?.value || '').trim().toLowerCase();
        const filter = document.getElementById('savedFitsFilter')?.value || 'all';
        const sort = document.getElementById('savedFitsSort')?.value || 'missing-desc';

        let entries = this.savedFits.map((fit, index) => ({ fit, index }));
        if (search) {
            entries = entries.filter(({ fit }) => {
                const itemNames = (fit.items || []).map(item => item.name).join(' ');
                const haystack = `${fit.fitName} ${fit.hullName} ${fit.description || ''} ${itemNames}`.toLowerCase();
                return haystack.includes(search);
            });
        }
        if (filter === 'ready') {
            entries = entries.filter(({ fit }) => fit.missing.length === 0);
        } else if (filter === 'missing') {
            entries = entries.filter(({ fit }) => fit.missing.length > 0);
        } else if (filter === 'week') {
            entries = entries.filter(({ fit }) => fit.trainingMinutes <= 7 * 1440);
        } else if (filter === 'month') {
            entries = entries.filter(({ fit }) => fit.trainingMinutes <= 30 * 1440);
        }

        entries.sort((a, b) => {
            if (sort === 'name') return a.fit.fitName.localeCompare(b.fit.fitName);
            if (sort === 'ship') return a.fit.hullName.localeCompare(b.fit.hullName) || a.fit.fitName.localeCompare(b.fit.fitName);
            if (sort === 'missing-asc') return a.fit.missing.length - b.fit.missing.length || a.fit.fitName.localeCompare(b.fit.fitName);
            if (sort === 'time-asc') return a.fit.trainingMinutes - b.fit.trainingMinutes || a.fit.fitName.localeCompare(b.fit.fitName);
            if (sort === 'time-desc') return b.fit.trainingMinutes - a.fit.trainingMinutes || a.fit.fitName.localeCompare(b.fit.fitName);
            return b.fit.missing.length - a.fit.missing.length || a.fit.fitName.localeCompare(b.fit.fitName);
        });

        if (entries.length === 0) {
            this.updateMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-filter-circle-xmark"></i>
                    <h3>No fits match these filters</h3>
                    <p>Try a different search, filter or sort option.</p>
                    <button class="btn-secondary" id="clearSavedFitsFiltersBtn">
                        <i class="fas fa-rotate-left"></i> Reset Filters
                    </button>
                </div>`;
            document.getElementById('clearSavedFitsFiltersBtn')?.addEventListener('click', () => {
                const searchInput = document.getElementById('savedFitsSearch');
                const filterSelect = document.getElementById('savedFitsFilter');
                const sortSelect = document.getElementById('savedFitsSort');
                if (searchInput) searchInput.value = '';
                if (filterSelect) filterSelect.value = 'all';
                if (sortSelect) sortSelect.value = 'missing-desc';
                this.renderSavedFits();
            });
            return;
        }

        content.innerHTML = `<div class="saved-fits-list">${entries.map(({ fit, index }) => {
            const missing = fit.missing;
            const ready = missing.length === 0;
            const key = this.savedFitKey(fit);
            const selected = this.selectedSavedFits.has(key);
            const status = ready
                ? '<span class="fit-status ready"><i class="fas fa-check"></i> Ready to fly</span>'
                : `<span class="fit-status missing"><i class="fas fa-xmark"></i> ${missing.length} missing</span>`;
            const unknownNote = fit.unknown.length
                ? `<p class="fit-note warn"><strong>Not recognised:</strong> ${fit.unknown.map(item => this.escapeHtml(item)).join(', ')}</p>`
                : '';
            const description = fit.description
                ? `<p class="saved-fit-description">${this.escapeHtml(fit.description)}</p>`
                : '';
            const completion = fit.completionDate
                ? fit.completionDate.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                })
                : null;
            const timeLine = ready
                ? 'Ready now'
                : `${fit.trainingTime} to fly${completion ? ` · ${completion}` : ''}`;

            return `
                <details class="saved-fit-card ${ready ? 'ready' : 'missing'}">
                    <summary>
                        <label class="saved-fit-select" title="Select for a combined plan">
                            <input type="checkbox" data-fit-key="${this.escapeHtml(key)}" ${selected ? 'checked' : ''} aria-label="Select ${this.escapeHtml(fit.fitName)} for a combined plan">
                        </label>
                        <span class="saved-fit-main">
                            <strong>${this.escapeHtml(fit.fitName)}</strong>
                            <small>${this.escapeHtml(fit.hullName)} &middot; ${fit.matchedItems}/${fit.totalItems} items &middot; ${timeLine}</small>
                        </span>
                        ${status}
                        <i class="fas fa-chevron-down saved-fit-chevron" aria-hidden="true"></i>
                    </summary>
                    <div class="saved-fit-body">
                        ${description}
                        <div class="saved-fit-metrics">
                            <span><i class="fas fa-clock"></i> ${ready ? 'Ready to fly' : `${fit.trainingTime} training`}</span>
                            ${completion ? `<span><i class="fas fa-calendar-check"></i> ${completion}</span>` : ''}
                            <span><i class="fas fa-list-check"></i> ${missing.length} missing skill${missing.length === 1 ? '' : 's'}</span>
                        </div>
                        <div class="fit-view-section-head">
                            <h3>Fitted items</h3>
                            <span>${fit.matchedItems}/${fit.totalItems} resolved</span>
                        </div>
                        ${this.renderFitItems(fit.items)}
                        <div class="fit-view-section-head">
                            <h3>${ready ? 'Skills' : 'Missing skills'}</h3>
                            <span>${ready ? 'All requirements trained' : `${missing.length} to train`}</span>
                        </div>
                        ${ready
                            ? '<p class="fit-note success">All required skills are trained.</p>'
                            : `<div class="fit-skill-list">${missing.map(skill => `
                                <div class="fit-skill-item">
                                    <span>${this.escapeHtml(skill.skillName)}</span>
                                    <b>${this.roman(skill.targetLevel)}</b>
                                    <small>${skill.currentLevel ? `have ${this.roman(skill.currentLevel)}` : 'not trained'}</small>
                                </div>`).join('')}</div>`}
                        <div class="saved-fit-actions">
                            <button class="btn-secondary btn-small" data-saved-fit-copy="${index}">
                                <i class="fas fa-copy"></i> Copy EFT
                            </button>
                            <button class="btn-secondary btn-small" data-saved-fit-open="${index}">
                                <i class="fas fa-wrench"></i> Open Analysis
                            </button>
                            <button class="btn-secondary btn-small" data-saved-fit-library="${index}">
                                <i class="fas fa-book-bookmark"></i> Save to Library
                            </button>
                            ${ready ? '' : `<button class="btn-primary btn-small" data-saved-fit-plan="${index}">
                                <i class="fas fa-clipboard-list"></i> Create Skill Plan
                            </button>`}
                        </div>
                        ${unknownNote}
                    </div>
                </details>`;
        }).join('')}</div>`;

        content.querySelectorAll('.saved-fit-select').forEach(label => {
            label.addEventListener('click', event => event.stopPropagation());
        });

        content.querySelectorAll('[data-fit-key]').forEach(checkbox => {
            checkbox.addEventListener('click', event => event.stopPropagation());
            checkbox.addEventListener('change', () => {
                const key = checkbox.dataset.fitKey;
                if (checkbox.checked) {
                    this.selectedSavedFits.add(key);
                } else {
                    this.selectedSavedFits.delete(key);
                }
                this.updateMergeButton();
            });
        });

        content.querySelectorAll('[data-saved-fit-plan]').forEach(button => {
            button.addEventListener('click', () => this.createSavedFitPlan(Number(button.dataset.savedFitPlan)));
        });
        content.querySelectorAll('[data-saved-fit-copy]').forEach(button => {
            button.addEventListener('click', () => this.copySavedFitEft(Number(button.dataset.savedFitCopy)));
        });
        content.querySelectorAll('[data-saved-fit-open]').forEach(button => {
            button.addEventListener('click', () => this.openSavedFitAnalysis(Number(button.dataset.savedFitOpen)));
        });
        content.querySelectorAll('[data-saved-fit-library]').forEach(button => {
            button.addEventListener('click', () => this.saveSavedFitToLibrary(Number(button.dataset.savedFitLibrary)));
        });

        this.updateMergeButton();
        this.updatePlanImpact();
    }

    async createSavedFitPlan(index) {
        const analysis = this.savedFits?.[index];
        if (!analysis || analysis.missing.length === 0) return;
        this.fitAnalysis = analysis;
        await this.createFitPlan();
    }

    async copySavedFitEft(index) {
        const fit = this.savedFits?.[index];
        if (!fit?.eftText) {
            this.showMessage('EFT text is unavailable for this fit.', 'warning');
            return;
        }
        const ok = await this.copyText(fit.eftText);
        this.showMessage(
            ok ? `Copied ${fit.fitName} as EFT` : 'Could not copy the fit',
            ok ? 'success' : 'error'
        );
    }

    async copyCurrentFitEft() {
        if (!this.fitAnalysis?.eftText) {
            this.showMessage('No analysed fit to copy.', 'warning');
            return;
        }
        const ok = await this.copyText(this.fitAnalysis.eftText);
        this.showMessage(
            ok ? `Copied ${this.fitAnalysis.fitName} as EFT` : 'Could not copy the fit',
            ok ? 'success' : 'error'
        );
    }

    openSavedFitAnalysis(index) {
        const fit = this.savedFits?.[index];
        if (!fit) return;
        this.fitAnalysis = fit;
        this.lastFitText = fit.eftText || this.lastFitText;
        this.switchView('fit');
    }

    saveSavedFitToLibrary(index) {
        const fit = this.savedFits?.[index];
        if (!fit) return;
        this.pendingLibraryAnalysis = fit;
        this.openLibrarySaveModal();
    }

    async createCombinedFitsPlan() {
        const selected = (this.savedFits || []).filter(fit =>
            this.selectedSavedFits.has(this.savedFitKey(fit))
        );

        if (selected.length === 0) {
            this.showMessage('Select at least one saved fit to combine.', 'warning');
            return;
        }

        if (skillPlanner.getPlan().length > 0) {
            const replace = confirm('Replace the current skill plan with this combined fit plan?');
            if (!replace) return;
        }

        const required = {};
        selected.forEach(fit => {
            Object.entries(fit.required || {}).forEach(([skillId, level]) => {
                required[skillId] = Math.max(required[skillId] || 0, Number(level) || 0);
            });
        });

        const names = selected.map(fit => fit.fitName);
        const name = selected.length === 1
            ? `Fit: ${names[0]}`
            : `Doctrine: ${names.slice(0, 2).join(' + ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;

        const result = skillPlanner.buildPlanFromRequirements(
            required,
            this.currentCharacterData?.skills,
            name
        );

        if (!result.missing) {
            this.showMessage('You already meet every skill requirement for these fits.', 'success');
            return;
        }

        this.selectedSavedFits.clear();
        this.updateMergeButton();
        this.renderSavedFits();

        this.planName.value = skillPlanner.getName();
        this.renderPlan();
        this.updatePlanSummary();
        this.updatePlanBadge();
        this.switchView('planner');
        this.showMessage(
            `Created a combined plan with ${result.missing} missing skills for ${selected.length} ${selected.length === 1 ? 'fit' : 'fits'}.`,
            'success'
        );
    }

    // Locally saved doctrine fits
    loadLibraryRecords() {
        try {
            const parsed = JSON.parse(localStorage.getItem('skillplanner_library_fits') || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    saveLibraryRecords() {
        try {
            localStorage.setItem('skillplanner_library_fits', JSON.stringify(this.libraryRecords));
        } catch (_) {
            this.showMessage('Could not save the doctrine library in this browser.', 'error');
        }
    }

    loadFitAliases() {
        try {
            const parsed = JSON.parse(localStorage.getItem('skillplanner_fit_aliases') || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    saveFitAliases() {
        try {
            localStorage.setItem('skillplanner_fit_aliases', JSON.stringify(this.fitAliases));
        } catch (_) {
            // Aliases are an optional convenience.
        }
    }

    async loadLibrary() {
        this.libraryLoading = true;
        this.libraryError = null;
        this.renderLibrary();

        try {
            await this.loadFitData();
            const results = [];
            for (const record of this.libraryRecords) {
                try {
                    const { analysis } = await this.analyseFitText(record.eft, { remember: false });
                    results.push({ record, analysis, error: null });
                } catch (error) {
                    results.push({ record, analysis: null, error: error.message });
                }
            }
            this.libraryAnalyses = results;
        } catch (error) {
            this.libraryError = error.message || 'Could not load the doctrine library.';
            this.libraryAnalyses = [];
        } finally {
            this.libraryLoading = false;
            this.renderLibrary();
            this.populateLibraryTags();
            this.updatePlanImpact();
        }
    }

    populateLibraryTags() {
        const select = document.getElementById('libraryTagFilter');
        if (!select) return;

        const current = select.value || 'all';
        const tags = new Set();
        this.libraryRecords.forEach(record => {
            (record.tags || []).forEach(tag => tags.add(tag));
        });

        const options = [...tags].sort((a, b) => a.localeCompare(b));
        select.innerHTML = '<option value="all">All tags</option>' +
            options.map(tag => `<option value="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</option>`).join('');
        select.value = options.includes(current) ? current : 'all';
    }

    updateLibraryMergeButton() {
        const button = document.getElementById('libraryMergeBtn');
        if (!button) return;
        const count = this.selectedLibraryFits.size;
        button.classList.toggle('hidden', count === 0);
        button.disabled = count === 0;
        button.innerHTML = `<i class="fas fa-layer-group"></i> Combine Selected${count ? ` (${count})` : ''}`;
    }

    renderLibrary() {
        const content = document.getElementById('libraryContent');
        if (!content) return;

        if (this.libraryLoading) {
            this.updateLibraryMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <div class="loading-spinner"></div>
                    <h3>Loading doctrine library</h3>
                    <p>Resolving saved fits against the SDE.</p>
                </div>`;
            return;
        }

        if (this.libraryError) {
            this.updateLibraryMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-triangle-exclamation"></i>
                    <h3>Could not load the doctrine library</h3>
                    <p>${this.escapeHtml(this.libraryError)}</p>
                    <button class="btn-primary" id="libraryRetryBtn"><i class="fas fa-rotate"></i> Try Again</button>
                </div>`;
            document.getElementById('libraryRetryBtn')?.addEventListener('click', () => this.loadLibrary());
            return;
        }

        if (this.libraryRecords.length === 0) {
            this.updateLibraryMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-book-bookmark"></i>
                    <h3>No doctrine fits saved yet</h3>
                    <p>Paste an EFT fit and save it here to plan corp or alliance doctrines.</p>
                    <button class="btn-primary" id="libraryEmptyAddBtn"><i class="fas fa-plus"></i> Add a Fit</button>
                </div>`;
            document.getElementById('libraryEmptyAddBtn')?.addEventListener('click', () => this.openFitImport());
            return;
        }

        const search = (document.getElementById('librarySearch')?.value || '').trim().toLowerCase();
        const tag = document.getElementById('libraryTagFilter')?.value || 'all';
        const sort = document.getElementById('librarySort')?.value || 'time-asc';

        let entries = [...this.libraryAnalyses];
        if (search) {
            entries = entries.filter(({ record, analysis }) => {
                const itemNames = (analysis?.items || []).map(item => item.name).join(' ');
                const haystack = `${record.name} ${record.tags?.join(' ') || ''} ${record.notes || ''} ${analysis?.hullName || ''} ${itemNames}`.toLowerCase();
                return haystack.includes(search);
            });
        }
        if (tag !== 'all') {
            entries = entries.filter(({ record }) => (record.tags || []).includes(tag));
        }

        entries.sort((a, b) => {
            if (sort === 'name') return a.record.name.localeCompare(b.record.name);
            if (sort === 'ship') return (a.analysis?.hullName || '').localeCompare(b.analysis?.hullName || '') || a.record.name.localeCompare(b.record.name);
            if (sort === 'newest') return (b.record.createdAt || 0) - (a.record.createdAt || 0);
            return (a.analysis?.trainingMinutes ?? Infinity) - (b.analysis?.trainingMinutes ?? Infinity)
                || a.record.name.localeCompare(b.record.name);
        });

        if (entries.length === 0) {
            this.updateLibraryMergeButton();
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-filter-circle-xmark"></i>
                    <h3>No doctrine fits match</h3>
                    <p>Try a different search or tag.</p>
                </div>`;
            return;
        }

        content.innerHTML = `<div class="saved-fits-list">${entries.map(({ record, analysis, error }) => {
            if (error || !analysis) {
                return `
                    <div class="saved-fit-card missing">
                        <div class="saved-fit-body">
                            <strong>${this.escapeHtml(record.name)}</strong>
                            <p class="fit-note warn">Could not analyse this fit: ${this.escapeHtml(error || 'unknown error')}</p>
                            <div class="saved-fit-actions">
                                <button class="btn-secondary btn-small" data-library-edit="${record.id}"><i class="fas fa-pen"></i> Edit</button>
                                <button class="btn-danger btn-small" data-library-delete="${record.id}"><i class="fas fa-trash"></i> Delete</button>
                            </div>
                        </div>
                    </div>`;
            }

            const ready = analysis.missing.length === 0;
            const selected = this.selectedLibraryFits.has(record.id);
            const tags = (record.tags || []).map(t => `<span class="doctrine-tag">${this.escapeHtml(t)}</span>`).join('');
            const completion = analysis.completionDate
                ? analysis.completionDate.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                })
                : null;

            return `
                <details class="saved-fit-card ${ready ? 'ready' : 'missing'}">
                    <summary>
                        <label class="saved-fit-select" title="Select for a combined plan">
                            <input type="checkbox" data-library-key="${this.escapeHtml(record.id)}" ${selected ? 'checked' : ''} aria-label="Select ${this.escapeHtml(record.name)} for a combined plan">
                        </label>
                        <span class="saved-fit-main">
                            <strong>${this.escapeHtml(record.name)}</strong>
                            <small>${this.escapeHtml(analysis.hullName)} &middot; ${ready ? 'Ready now' : `${analysis.trainingTime} to fly${completion ? ` · ${completion}` : ''}`}</small>
                        </span>
                        <span class="fit-status ${ready ? 'ready' : 'missing'}">
                            <i class="fas ${ready ? 'fa-check' : 'fa-xmark'}"></i>
                            ${ready ? 'Ready to fly' : `${analysis.missing.length} missing`}
                        </span>
                        <i class="fas fa-chevron-down saved-fit-chevron" aria-hidden="true"></i>
                    </summary>
                    <div class="saved-fit-body">
                        ${record.notes ? `<p class="saved-fit-description">${this.escapeHtml(record.notes)}</p>` : ''}
                        <div class="doctrine-tags">${tags}</div>
                        <div class="saved-fit-metrics">
                            <span><i class="fas fa-clock"></i> ${ready ? 'Ready to fly' : `${analysis.trainingTime} training`}</span>
                            ${completion ? `<span><i class="fas fa-calendar-check"></i> ${completion}</span>` : ''}
                            <span><i class="fas fa-list-check"></i> ${analysis.missing.length} missing skill${analysis.missing.length === 1 ? '' : 's'}</span>
                        </div>
                        <div class="fit-view-section-head">
                            <h3>Fitted items</h3>
                            <span>${analysis.matchedItems}/${analysis.totalItems} resolved</span>
                        </div>
                        ${this.renderFitItems(analysis.items)}
                        <div class="fit-view-section-head">
                            <h3>${ready ? 'Skills' : 'Missing skills'}</h3>
                            <span>${ready ? 'All requirements trained' : `${analysis.missing.length} to train`}</span>
                        </div>
                        ${ready
                            ? '<p class="fit-note success">All required skills are trained.</p>'
                            : `<div class="fit-skill-list">${analysis.missing.map(skill => `
                                <div class="fit-skill-item">
                                    <span>${this.escapeHtml(skill.skillName)}</span>
                                    <b>${this.roman(skill.targetLevel)}</b>
                                    <small>${skill.currentLevel ? `have ${this.roman(skill.currentLevel)}` : 'not trained'}</small>
                                </div>`).join('')}</div>`}
                        <div class="saved-fit-actions">
                            <button class="btn-secondary btn-small" data-library-copy="${record.id}"><i class="fas fa-copy"></i> Copy EFT</button>
                            <button class="btn-secondary btn-small" data-library-open="${record.id}"><i class="fas fa-wrench"></i> Open Analysis</button>
                            <button class="btn-secondary btn-small" data-library-edit="${record.id}"><i class="fas fa-pen"></i> Edit</button>
                            <button class="btn-danger btn-small" data-library-delete="${record.id}"><i class="fas fa-trash"></i> Delete</button>
                            ${ready ? '' : `<button class="btn-primary btn-small" data-library-plan="${record.id}"><i class="fas fa-clipboard-list"></i> Create Skill Plan</button>`}
                        </div>
                    </div>
                </details>`;
        }).join('')}</div>`;

        content.querySelectorAll('.saved-fit-select').forEach(label => {
            label.addEventListener('click', event => event.stopPropagation());
        });
        content.querySelectorAll('[data-library-key]').forEach(checkbox => {
            checkbox.addEventListener('click', event => event.stopPropagation());
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) this.selectedLibraryFits.add(checkbox.dataset.libraryKey);
                else this.selectedLibraryFits.delete(checkbox.dataset.libraryKey);
                this.updateLibraryMergeButton();
            });
        });
        content.querySelectorAll('[data-library-plan]').forEach(button => {
            button.addEventListener('click', () => this.createLibraryPlan(button.dataset.libraryPlan));
        });
        content.querySelectorAll('[data-library-copy]').forEach(button => {
            button.addEventListener('click', () => this.copyLibraryEft(button.dataset.libraryCopy));
        });
        content.querySelectorAll('[data-library-open]').forEach(button => {
            button.addEventListener('click', () => this.openLibraryAnalysis(button.dataset.libraryOpen));
        });
        content.querySelectorAll('[data-library-edit]').forEach(button => {
            button.addEventListener('click', () => this.editLibraryRecord(button.dataset.libraryEdit));
        });
        content.querySelectorAll('[data-library-delete]').forEach(button => {
            button.addEventListener('click', () => this.deleteLibraryRecord(button.dataset.libraryDelete));
        });

        this.updateLibraryMergeButton();
        this.updatePlanImpact();
    }

    openLibrarySaveModal(record = null) {
        const modal = document.getElementById('librarySaveModal');
        const title = document.getElementById('librarySaveTitle');
        const nameInput = document.getElementById('libraryFitName');
        const tagsInput = document.getElementById('libraryFitTags');
        const notesInput = document.getElementById('libraryFitNotes');

        this.pendingLibraryRecord = record || null;
        if (record) {
            this.pendingLibraryAnalysis = null;
            if (title) title.textContent = 'Edit Doctrine Fit';
            if (nameInput) nameInput.value = record.name || '';
            if (tagsInput) tagsInput.value = (record.tags || []).join(', ');
            if (notesInput) notesInput.value = record.notes || '';
        } else {
            const analysis = this.pendingLibraryAnalysis || this.fitAnalysis;
            if (title) title.textContent = 'Save to Doctrine Library';
            if (nameInput) nameInput.value = analysis?.fitName || '';
            if (tagsInput) tagsInput.value = '';
            if (notesInput) notesInput.value = analysis?.description || '';
        }

        modal?.classList.remove('hidden');
        nameInput?.focus();
    }

    closeLibrarySaveModal() {
        document.getElementById('librarySaveModal')?.classList.add('hidden');
        this.pendingLibraryAnalysis = null;
        this.pendingLibraryRecord = null;
    }

    async saveLibraryFromModal() {
        const name = document.getElementById('libraryFitName')?.value.trim();
        const tags = (document.getElementById('libraryFitTags')?.value || '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);
        const notes = document.getElementById('libraryFitNotes')?.value.trim() || '';

        if (!name) {
            this.showMessage('Give this doctrine fit a name.', 'warning');
            return;
        }

        if (this.pendingLibraryRecord) {
            const record = this.libraryRecords.find(item => item.id === this.pendingLibraryRecord.id);
            if (!record) return;
            record.name = name;
            record.tags = tags;
            record.notes = notes;
            record.updatedAt = Date.now();
        } else {
            const analysis = this.pendingLibraryAnalysis || this.fitAnalysis;
            if (!analysis?.eftText) {
                this.showMessage('Analyse a fit before saving it to the library.', 'warning');
                return;
            }
            this.libraryRecords.push({
                id: `fit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name,
                tags,
                notes,
                eft: analysis.eftText,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        this.saveLibraryRecords();
        this.pendingLibraryRecord = null;
        this.pendingLibraryAnalysis = null;
        this.closeLibrarySaveModal();
        await this.loadLibrary();
        this.showMessage(`Saved ${name} to the doctrine library.`, 'success');
    }

    editLibraryRecord(id) {
        const record = this.libraryRecords.find(item => item.id === id);
        if (record) this.openLibrarySaveModal(record);
    }

    deleteLibraryRecord(id) {
        const record = this.libraryRecords.find(item => item.id === id);
        if (!record) return;
        if (!confirm(`Delete ${record.name} from the doctrine library?`)) return;
        this.libraryRecords = this.libraryRecords.filter(item => item.id !== id);
        this.selectedLibraryFits.delete(id);
        this.saveLibraryRecords();
        this.loadLibrary();
        this.showMessage(`Deleted ${record.name}.`, 'info');
    }

    getLibraryResult(id) {
        return this.libraryAnalyses.find(item => item.record.id === id);
    }

    async copyLibraryEft(id) {
        const result = this.getLibraryResult(id);
        const eft = result?.record?.eft || result?.analysis?.eftText;
        if (!eft) return;
        const ok = await this.copyText(eft);
        this.showMessage(
            ok ? `Copied ${result.record.name} as EFT` : 'Could not copy the fit',
            ok ? 'success' : 'error'
        );
    }

    openLibraryAnalysis(id) {
        const result = this.getLibraryResult(id);
        if (!result?.analysis) return;
        this.fitAnalysis = result.analysis;
        this.lastFitText = result.record.eft;
        this.switchView('fit');
    }

    async createLibraryPlan(id) {
        const result = this.getLibraryResult(id);
        if (!result?.analysis || result.analysis.missing.length === 0) return;
        this.fitAnalysis = result.analysis;
        await this.createFitPlan();
    }

    async createCombinedLibraryPlan() {
        const selected = this.libraryAnalyses
            .filter(item => this.selectedLibraryFits.has(item.record.id) && item.analysis)
            .map(item => item.analysis);

        if (selected.length === 0) {
            this.showMessage('Select at least one doctrine fit to combine.', 'warning');
            return;
        }

        if (skillPlanner.getPlan().length > 0) {
            const replace = confirm('Replace the current skill plan with this combined doctrine plan?');
            if (!replace) return;
        }

        const required = {};
        selected.forEach(fit => {
            Object.entries(fit.required || {}).forEach(([skillId, level]) => {
                required[skillId] = Math.max(required[skillId] || 0, Number(level) || 0);
            });
        });

        const names = selected.map(fit => fit.fitName);
        const name = selected.length === 1
            ? `Fit: ${names[0]}`
            : `Doctrine: ${names.slice(0, 2).join(' + ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;

        const result = skillPlanner.buildPlanFromRequirements(
            required,
            this.currentCharacterData?.skills,
            name
        );

        if (!result.missing) {
            this.showMessage('You already meet every skill requirement for these fits.', 'success');
            return;
        }

        this.selectedLibraryFits.clear();
        this.updateLibraryMergeButton();
        this.renderLibrary();
        this.planName.value = skillPlanner.getName();
        this.renderPlan();
        this.updatePlanSummary();
        this.updatePlanBadge();
        this.switchView('planner');
        this.showMessage(
            `Created a combined plan with ${result.missing} missing skills for ${selected.length} ${selected.length === 1 ? 'fit' : 'fits'}.`,
            'success'
        );
    }

    // Multi-character doctrine readiness
    closeCharacterReadiness() {
        document.getElementById('readinessModal')?.classList.add('hidden');
    }

    async openCharacterReadiness() {
        const modal = document.getElementById('readinessModal');
        const content = document.getElementById('readinessContent');
        if (!modal || !content) return;

        const fits = this.getAllFitAnalyses();
        if (fits.length === 0) {
            content.innerHTML = '<p class="empty-state">Save at least one EVE or doctrine fit first.</p>';
            modal.classList.remove('hidden');
            return;
        }

        const characters = esiAuth.getAuthenticatedCharacters();
        if (characters.length === 0) {
            content.innerHTML = '<p class="empty-state">Sign in with EVE SSO to check doctrine readiness across characters.</p>';
            modal.classList.remove('hidden');
            return;
        }

        content.innerHTML = `
            <div class="fit-empty-state">
                <div class="loading-spinner"></div>
                <h3>Checking ${characters.length} character${characters.length === 1 ? '' : 's'}</h3>
                <p>Comparing trained skills with each doctrine fit.</p>
            </div>`;
        modal.classList.remove('hidden');

        const skillsByCharacter = await Promise.all(characters.map(async character => {
            try {
                const skills = await characterManager.fetchSkills(character.characterId);
                return { character, skills };
            } catch (_) {
                return { character, skills: null };
            }
        }));

        const rows = fits.map(fit => {
            const cells = skillsByCharacter.map(({ skills }) => {
                if (!skills?.skills) return '<td class="readiness-unknown">--</td>';
                const levels = new Map(skills.skills.map(skill => [skill.skill_id, skill.trained_skill_level || 0]));
                const missing = Object.entries(fit.required || {}).filter(([skillId, level]) => {
                    return (levels.get(parseInt(skillId, 10)) || 0) < level;
                }).length;
                return missing === 0
                    ? '<td class="readiness-ready"><i class="fas fa-check"></i> Ready</td>'
                    : `<td class="readiness-missing">${missing} missing</td>`;
            }).join('');
            return `<tr><td><strong>${this.escapeHtml(fit.fitName)}</strong><small>${this.escapeHtml(fit.hullName)}</small></td>${cells}</tr>`;
        }).join('');

        content.innerHTML = `
            <p class="hint">Uses each character's last fetched skills. Refresh a character on the dashboard for the latest training.</p>
            <div class="readiness-table-wrap">
                <table class="readiness-table">
                    <thead><tr><th>Doctrine</th>${characters.map(character => `<th>${this.escapeHtml(character.characterName || 'Character')}</th>`).join('')}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    // Ship readiness browser
    getShipReadiness() {
        if (this.shipReadinessCache) return this.shipReadinessCache;

        this.shipReadinessCache = this.shipData.map(ship => {
            const analysis = this.buildFitAnalysisFromEntries({
                hull: ship,
                entries: [],
                items: [],
                totalItems: 0,
                unknown: [],
                fitName: ship.name
            });
            return { ship, analysis };
        });
        return this.shipReadinessCache;
    }

    async renderShipBrowser() {
        const content = document.getElementById('shipsContent');
        const subtitle = document.getElementById('shipsSubtitle');
        if (!content) return;

        if (!this.shipData.length) {
            if (this.shipBrowserLoading) return;
            this.shipBrowserLoading = true;
            content.innerHTML = `
                <div class="fit-empty-state">
                    <div class="loading-spinner"></div>
                    <h3>Loading ship requirements</h3>
                    <p>Reading the SDE ship index.</p>
                </div>`;
            try {
                await this.loadFitData();
            } catch (error) {
                content.innerHTML = `
                    <div class="fit-empty-state">
                        <i class="fas fa-triangle-exclamation"></i>
                        <h3>Could not load ships</h3>
                        <p>${this.escapeHtml(error.message)}</p>
                        <button class="btn-primary" id="shipRetryBtn"><i class="fas fa-rotate"></i> Try Again</button>
                    </div>`;
                document.getElementById('shipRetryBtn')?.addEventListener('click', () => this.renderShipBrowser());
                this.shipBrowserLoading = false;
                return;
            }
            this.shipBrowserLoading = false;
        }

        const search = (document.getElementById('shipsSearch')?.value || '').trim().toLowerCase();
        const filter = document.getElementById('shipsFilter')?.value || 'all';
        const sort = document.getElementById('shipsSort')?.value || 'readiness';

        content.innerHTML = `
            <div class="fit-empty-state">
                <div class="loading-spinner"></div>
                <h3>Checking ship requirements</h3>
                <p>Comparing hull skills with your character.</p>
            </div>`;
        await new Promise(resolve => setTimeout(resolve, 0));

        let entries = this.getShipReadiness();
        const readyCount = entries.filter(({ analysis }) => analysis.missing.length === 0).length;

        if (search) {
            entries = entries.filter(({ ship }) => {
                return `${ship.name} ${ship.group}`.toLowerCase().includes(search);
            });
        }
        if (filter === 'ready') {
            entries = entries.filter(({ analysis }) => analysis.missing.length === 0);
        } else if (filter === 'near') {
            entries = entries.filter(({ analysis }) => analysis.missing.length > 0 && analysis.missing.length <= 3);
        } else if (filter === 'missing') {
            entries = entries.filter(({ analysis }) => analysis.missing.length > 0);
        }

        entries.sort((a, b) => {
            if (sort === 'name') return a.ship.name.localeCompare(b.ship.name);
            if (sort === 'group') return a.ship.group.localeCompare(b.ship.group) || a.ship.name.localeCompare(b.ship.name);
            if (sort === 'time-asc') return a.analysis.trainingMinutes - b.analysis.trainingMinutes || a.ship.name.localeCompare(b.ship.name);
            const readyDiff = (a.analysis.missing.length === 0 ? 0 : 1) - (b.analysis.missing.length === 0 ? 0 : 1);
            return readyDiff || a.analysis.trainingMinutes - b.analysis.trainingMinutes || a.ship.name.localeCompare(b.ship.name);
        });

        if (subtitle) {
            subtitle.textContent = `${readyCount} of ${this.shipData.length} ships ready · hull requirements only, not a fitted doctrine`;
        }

        if (entries.length === 0) {
            content.innerHTML = `
                <div class="fit-empty-state">
                    <i class="fas fa-filter-circle-xmark"></i>
                    <h3>No ships match</h3>
                    <p>Try a different search or filter.</p>
                </div>`;
            return;
        }

        const limited = entries.slice(0, 120);
        content.innerHTML = `
            <p class="ships-count">Showing ${limited.length} of ${entries.length} matching ships</p>
            <div class="ship-browser-grid">${limited.map(({ ship, analysis }) => {
                const missing = analysis.missing;
                const ready = missing.length === 0;
                const statusClass = ready ? 'ready' : (missing.length <= 3 ? 'near' : 'missing');
                return `
                    <details class="ship-card ${statusClass}">
                        <summary>
                            <span class="ship-card-main">
                                <strong>${this.escapeHtml(ship.name)}</strong>
                                <small>${this.escapeHtml(ship.group)}</small>
                            </span>
                            <span class="fit-status ${ready ? 'ready' : 'missing'}">
                                <i class="fas ${ready ? 'fa-check' : 'fa-xmark'}"></i>
                                ${ready ? 'Ready' : `${missing.length} missing`}
                            </span>
                            <i class="fas fa-chevron-down saved-fit-chevron" aria-hidden="true"></i>
                        </summary>
                        <div class="ship-card-body">
                            <div class="saved-fit-metrics">
                                <span><i class="fas fa-clock"></i> ${ready ? 'Ready now' : analysis.trainingTime}</span>
                                <span><i class="fas fa-list-check"></i> ${missing.length} skill${missing.length === 1 ? '' : 's'} missing</span>
                            </div>
                            ${ready
                                ? '<p class="fit-note success">Hull requirements are trained.</p>'
                                : `<div class="fit-skill-list">${missing.map(skill => `
                                    <div class="fit-skill-item">
                                        <span>${this.escapeHtml(skill.skillName)}</span>
                                        <b>${this.roman(skill.targetLevel)}</b>
                                        <small>${skill.currentLevel ? `have ${this.roman(skill.currentLevel)}` : 'not trained'}</small>
                                    </div>`).join('')}</div>
                                    <div class="saved-fit-actions">
                                        <button class="btn-primary btn-small" data-ship-plan="${ship.id}">
                                            <i class="fas fa-clipboard-list"></i> Create Hull Plan
                                        </button>
                                    </div>`}
                        </div>
                    </details>`;
            }).join('')}</div>`;

        content.querySelectorAll('[data-ship-plan]').forEach(button => {
            button.addEventListener('click', () => this.createShipPlan(Number(button.dataset.shipPlan)));
        });
    }

    async createShipPlan(shipId) {
        const entry = this.getShipReadiness().find(item => item.ship.id === shipId);
        if (!entry || entry.analysis.missing.length === 0) return;

        if (skillPlanner.getPlan().length > 0) {
            const replace = confirm('Replace the current skill plan with this hull plan?');
            if (!replace) return;
        }

        const result = skillPlanner.buildPlanFromRequirements(
            entry.analysis.required,
            this.currentCharacterData?.skills,
            `Ship: ${entry.ship.name}`
        );

        if (!result.missing) {
            this.showMessage('You already meet the hull requirements.', 'success');
            return;
        }

        this.planName.value = skillPlanner.getName();
        this.renderPlan();
        this.updatePlanSummary();
        this.updatePlanBadge();
        this.switchView('planner');
        this.showMessage(`Created a hull plan with ${result.missing} missing skills for the ${entry.ship.name}.`, 'success');
    }

    // EVE clipboard / file export
    getPlanText() {
        return skillPlanner.planToText(this.currentCharacterData?.skills);
    }

    async copyPlanForEve() {
        const text = this.getPlanText();
        if (!text) {
            this.showMessage('Plan is empty or already trained', 'warning');
            return;
        }
        const ok = await this.copyText(text);
        this.showMessage(
            ok ? 'Plan copied - paste it into EVE\'s skill plan import' : 'Could not copy the plan',
            ok ? 'success' : 'error'
        );
    }

    downloadPlanText() {
        const text = this.getPlanText();
        if (!text) {
            this.showMessage('Plan is empty or already trained', 'warning');
            return;
        }

        const name = (skillPlanner.getName() || 'skill-plan').replace(/[^\w.-]+/g, '_');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}-plan.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        this.showMessage('Plan downloaded', 'success');
    }

    async sharePlan() {
        const payload = skillPlanner.sharePayload();
        if (!payload) {
            this.showMessage('Plan is empty', 'warning');
            return;
        }

        const apiBase = window.SKILLPLANNER_API_BASE || 'https://api.rustybot.co.uk/api';
        const name = skillPlanner.getName() || 'Shared Skill Plan';

        // Prefer a compact short link. Fall back to the legacy inline link if
        // the short-link service is unavailable.
        try {
            const response = await fetch(`${apiBase}/skillplan/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ plan: payload, name })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.code) {
                const url = new URL(window.location.href);
                url.search = '';
                url.hash = `plan=${data.code}`;
                const ok = await this.copyText(url.toString());
                this.showMessage(
                    ok ? 'Short share link copied' : 'Could not copy the share link',
                    ok ? 'success' : 'error'
                );
                return;
            }
        } catch (_) {
            // Fall through to the long-link fallback.
        }

        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('plan', payload);
        if (name) url.searchParams.set('name', name);

        const ok = await this.copyText(url.toString());
        this.showMessage(
            ok ? 'Short link unavailable - full share link copied' : 'Could not copy the share link',
            ok ? 'warning' : 'error'
        );
    }

    async copyText(text) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_) { /* fall through */ }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.cssText = 'position:fixed;top:-1000px;opacity:0';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            return ok;
        } catch (_) {
            return false;
        }
    }

    async loadPlanFromUrl() {
        const params = new URLSearchParams(window.location.search);
        let payload = params.get('plan');
        let name = params.get('name') || 'Shared Plan';
        let shortCode = null;

        if (!payload) {
            const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            shortCode = hash.get('plan');
            if (!shortCode) return;

            const apiBase = window.SKILLPLANNER_API_BASE || 'https://api.rustybot.co.uk/api';
            try {
                const response = await fetch(`${apiBase}/skillplan/share/${encodeURIComponent(shortCode)}`, {
                    headers: { 'Accept': 'application/json' }
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.plan) {
                    this.showMessage('That short share link is invalid or has expired.', 'error');
                    return;
                }
                payload = data.plan;
                name = data.name || name;
            } catch (_) {
                this.showMessage('Could not load that short share link.', 'error');
                return;
            }
        }

        if (payload.length > 20000) {
            this.showMessage('That share link is too large', 'warning');
            return;
        }

        const skills = payload.split(',').map(pair => {
            const [skillId, targetLevel] = pair.split(':').map(Number);
            return Number.isInteger(skillId) && targetLevel >= 1 && targetLevel <= 5
                ? { skillId, targetLevel }
                : null;
        }).filter(Boolean);

        if (skills.length === 0) {
            this.showMessage('That share link did not contain a valid plan', 'warning');
            return;
        }

        const result = skillPlanner.importPlan(JSON.stringify({ name, skills }));

        if (result.success) {
            this.showMessage(`Loaded shared plan "${name}"`, 'success');
            this.planName.value = name;
            this.renderPlan();
            this.updatePlanSummary();
            this.updatePlanBadge();
            this.switchView('planner');
        }

        params.delete('plan');
        params.delete('name');
        const cleanUrl = window.location.pathname
            + (params.toString() ? `?${params.toString()}` : '')
            + (!shortCode ? window.location.hash : '');
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // Skill book prices (Jita sell) for the plan summary.
    getPlanBookEntries() {
        const plan = skillPlanner.getPlan();
        const currentSkills = this.currentCharacterData?.skills;
        const bySkill = new Map();

        plan.forEach(item => {
            const current = currentSkills?.skills?.find(s => s.skill_id === item.skillId);
            const currentLevel = current?.trained_skill_level || 0;
            if (item.targetLevel <= currentLevel) return;
            bySkill.set(item.skillId, Math.max(bySkill.get(item.skillId) || 0, item.targetLevel));
        });

        return [...bySkill.entries()]
            .map(([skillId, level]) => ({
                skillId,
                name: window.SKILLS[skillId]?.name || `Skill ${skillId}`,
                level
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async openBookList() {
        const modal = document.getElementById('bookListModal');
        const content = document.getElementById('bookListContent');
        if (!modal || !content) return;

        const entries = this.getPlanBookEntries();
        this.bookListEntries = entries;
        this.bookListPrices = {};

        if (entries.length === 0) {
            content.innerHTML = '<p class="empty-state">The plan has no untrained skill books.</p>';
            modal.classList.remove('hidden');
            return;
        }

        content.innerHTML = `
            <div class="fit-empty-state">
                <div class="loading-spinner"></div>
                <h3>Pricing skill books</h3>
                <p>Loading Jita sell prices.</p>
            </div>`;
        modal.classList.remove('hidden');

        try {
            this.bookListPrices = await this.getBookPrices(entries.map(entry => entry.skillId));
        } catch (_) {
            this.bookListPrices = {};
        }

        let total = 0;
        let priced = 0;
        const rows = entries.map(entry => {
            const price = this.bookListPrices[entry.skillId];
            if (price) {
                total += price;
                priced++;
            }
            const marketLink = getSkillMarketLink(entry.skillId);
            return `
                <tr>
                    <td>${marketLink ? `<a href="${marketLink}" target="_blank">${this.escapeHtml(entry.name)}</a>` : this.escapeHtml(entry.name)}</td>
                    <td>${this.roman(entry.level)}</td>
                    <td>${price ? injectorCalc.formatISK(price) : '--'}</td>
                </tr>`;
        }).join('');

        content.innerHTML = `
            <p class="hint">One skill book per skill. Prices are Jita sell percentiles and may exclude books you already own.</p>
            <div class="book-list-table-wrap">
                <table class="book-list-table">
                    <thead><tr><th>Skill Book</th><th>Level</th><th>Price</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="book-list-total">
                <span>${priced}/${entries.length} priced</span>
                <strong>${total ? injectorCalc.formatISK(total) : '--'}</strong>
            </div>`;
    }

    closeBookList() {
        document.getElementById('bookListModal')?.classList.add('hidden');
    }

    async copyBookList() {
        const entries = this.bookListEntries || [];
        if (!entries.length) {
            this.showMessage('No skill books to copy.', 'warning');
            return;
        }

        const lines = entries.map(entry => {
            const price = this.bookListPrices?.[entry.skillId];
            return `${entry.name} ${this.roman(entry.level)}${price ? ` - ${injectorCalc.formatISK(price)}` : ''}`;
        });
        const ok = await this.copyText(lines.join('\n'));
        this.showMessage(ok ? 'Skill book list copied' : 'Could not copy the list', ok ? 'success' : 'error');
    }

    async updateBookCost() {
        const el = this.sumBookCost;
        if (!el) return;

        const plan = skillPlanner.getPlan();
        if (plan.length === 0) {
            el.textContent = '--';
            el.title = 'Skill book prices';
            return;
        }

        const currentSkills = this.currentCharacterData?.skills;
        const ids = [...new Set(plan.filter(item => {
            const current = currentSkills?.skills?.find(s => s.skill_id === item.skillId);
            return item.targetLevel > (current?.trained_skill_level || 0);
        }).map(item => item.skillId))];

        if (ids.length === 0) {
            el.textContent = '0 ISK';
            el.title = 'All plan skills are already trained';
            return;
        }

        try {
            const prices = await this.getBookPrices(ids);
            let total = 0;
            let missing = 0;
            for (const id of ids) {
                if (prices[id]) total += prices[id];
                else missing++;
            }
            el.textContent = total ? injectorCalc.formatISK(total) : '--';
            el.title = missing
                ? `${missing} skill book price${missing === 1 ? '' : 's'} unavailable`
                : 'Jita sell prices for skill books not already trained';
        } catch (_) {
            el.textContent = '--';
            el.title = 'Skill book prices unavailable';
        }
    }

    async getBookPrices(ids) {
        const now = Date.now();
        if (now - this.bookPriceCacheAt > 10 * 60 * 1000) {
            this.bookPriceCache.clear();
            this.bookPriceCacheAt = now;
        }

        const missing = ids.filter(id => !this.bookPriceCache.has(id));
        if (missing.length) {
            if (this.bookPricePromise) {
                try { await this.bookPricePromise; } catch (_) { /* handled below */ }
                return this.getBookPrices(ids);
            }

            this.bookPricePromise = (async () => {
                try {
                    const response = await fetch(
                        `https://market.fuzzwork.co.uk/aggregates/?region=10000002&types=${missing.join(',')}`
                    );
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    for (const id of missing) {
                        const row = data[String(id)];
                        const price = Number(row?.sell?.percentile || row?.sell?.min || 0) || null;
                        this.bookPriceCache.set(id, price);
                    }
                } catch (error) {
                    for (const id of missing) this.bookPriceCache.set(id, null);
                    throw error;
                } finally {
                    this.bookPricePromise = null;
                }
            })();

            try {
                await this.bookPricePromise;
            } catch (_) { /* prices unavailable */ }
        }

        return Object.fromEntries(ids.map(id => [id, this.bookPriceCache.get(id)]));
    }

    async updateInjectorPrice() {
        try {
            const prices = await this.getBookPrices([this.injectorPriceType]);
            const price = prices[this.injectorPriceType];
            if (!price) return;

            this.injectorPrice = price;

            const input = document.getElementById('injectorPriceInput');
            if (input && !input.dataset.userEdited) {
                input.value = Math.round(price);
            }

            const unit = document.getElementById('injUnitPrice');
            if (unit) unit.textContent = injectorCalc.formatISK(price);

            this.updatePlanSummary();
        } catch (_) {
            // Keep the manual/default price if the market lookup is unavailable.
        }
    }

    escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
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

        const cloneSelect = document.getElementById('cloneState');
        if (cloneSelect) {
            cloneSelect.value = trainingCalc.cloneState || 'omega';
        }

        // Initialize calculatorOverrides BEFORE calling updateCalcDisplay
        // This ensures renderPlan has valid overrides to compare against baseline
        this.calculatorOverrides = this.getCalculatorSettingsFromUI();
        
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
        this.shipReadinessCache = null;

        const acceleratorBonus = this.calculatorOverrides?.accelerator?.enabled
            ? this.calculatorOverrides.accelerator.bonus
            : 0;

        // Update display values
        ['Int', 'Mem', 'Per', 'Will', 'Char'].forEach(attr => {
            const slider = document.getElementById('calc' + attr);
            const display = document.getElementById('disp' + attr);
            if (slider && display) {
                const baseValue = slider.value;
                if (acceleratorBonus > 0) {
                    display.innerHTML = `<span class="calc-base">${baseValue}</span><span class="calc-bonus">+${acceleratorBonus}</span>`;
                } else {
                    display.innerHTML = `<span class="calc-base">${baseValue}</span>`;
                }
            }
        });
        
        // Calculate with current plan
        this.calculateImpact();
        this.updatePlanSummary();
        this.renderPlan();
        
        // Apply the accelerator selection to the persistent state and update dashboard attributes
        if (this.calculatorOverrides?.accelerator?.enabled) {
            trainingCalc.setCerebralAccelerator(
                true,
                this.calculatorOverrides.accelerator.bonus
            );
            
            // Update dashboard to show the selected what-if bonuses.
            if (this.currentCharacterData?.attributes) {
                const attrs = this.getCharacterBaseAttributes();
                const accelBonus = this.calculatorOverrides.accelerator.bonus;
                const implants = this.calculatorOverrides.implants || {};
                this.updateAttributeDisplay('Int', attrs.intelligence, accelBonus + (implants[6] || 0));
                this.updateAttributeDisplay('Mem', attrs.memory, accelBonus + (implants[7] || 0));
                this.updateAttributeDisplay('Per', attrs.perception, accelBonus + (implants[8] || 0));
                this.updateAttributeDisplay('Will', attrs.willpower, accelBonus + (implants[9] || 0));
                this.updateAttributeDisplay('Char', attrs.charisma, accelBonus + (implants[10] || 0));
            }
        } else {
            trainingCalc.setCerebralAccelerator(false, 0);
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

        const suggested = trainingCalc.optimizeRemap(plan, this.currentCharacterData?.skills).attributes;
        this.setSliderValue('calcInt', suggested.intelligence || 17);
        this.setSliderValue('calcMem', suggested.memory || 17);
        this.setSliderValue('calcPer', suggested.perception || 17);
        this.setSliderValue('calcWill', suggested.willpower || 17);
        this.setSliderValue('calcChar', suggested.charisma || 17);

        this.updateCalcDisplay();
        this.showMessage('Applied suggested remap to calculator preview', 'success');
    }

    runInjectorCalculator() {
        const currentSp = parseInt(document.getElementById('currentSpInput')?.value || 0);
        const targetSp = parseInt(document.getElementById('targetSpInput')?.value || 0);
        const injectorPrice = parseInt(document.getElementById('injectorPriceInput')?.value || this.injectorPrice);
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
        const attrs = this.currentCharacterData?.attributes;

        // Display current attributes (what the calculator is using).
        const currentContainer = document.getElementById('currentRemap');
        if (currentContainer) {
            const values = attrs || {
                intelligence: 20,
                memory: 20,
                perception: 20,
                willpower: 20,
                charisma: 19
            };
            currentContainer.innerHTML = [
                ['Intelligence', values.intelligence || 20],
                ['Memory', values.memory || 20],
                ['Perception', values.perception || 20],
                ['Willpower', values.willpower || 20],
                ['Charisma', values.charisma || 19]
            ].map(([name, value]) => `
                <div class="remap-attr">
                    <span class="attr-name">${name}</span>
                    <span class="attr-val">${value}</span>
                </div>
            `).join('');
        }

        if (this.remapCount) {
            const remaps = Number(attrs?.bonus_remaps);
            this.remapCount.textContent = Number.isFinite(remaps) ? remaps : '0';
        }

        const container = document.getElementById('suggestedRemap');
        if (!container) return;

        if (plan.length === 0) {
            container.innerHTML = '<p class="empty-state">Add skills to the plan to see a suggested remap.</p>';
            return;
        }

        const optimized = trainingCalc.optimizeRemap(plan, this.currentCharacterData?.skills);
        const suggested = optimized.attributes;
        container.innerHTML = Object.entries(suggested).map(([attr, val]) => `
            <div class="remap-attr">
                <span class="attr-name">${attr.charAt(0).toUpperCase() + attr.slice(1)}</span>
                <span class="attr-val">${val}</span>
            </div>
        `).join('');

        const savings = document.getElementById('remapSavings');
        if (savings) {
            savings.textContent = optimized.savingsMinutes > 0
                ? `Saves ${optimized.savingsFormatted} (${trainingCalc.formatTime(optimized.currentMinutes)} → ${optimized.formattedTime}).`
                : 'This is already close to the best allocation for the plan.';
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
