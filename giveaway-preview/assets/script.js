// START script.js

// ========================================================
// --- Bridge Integration Block (QWebChannel + Browser) ---
// ========================================================
let pythonBackend = null; // To store the QObject proxy (Qt desktop app only)
let isWebChannelReady = false;

// Browser static-site mode: the host page defines window.RustyBridge
// (an object with jsVisualsComplete / jsConfirmationExpired / jsPrizeRevealComplete /
// jsRequestSound / js_ready). Without Qt, we fake a ready channel and route
// callbacks to that bridge.
function getRustyBridge() {
    return (typeof window !== 'undefined' && window.RustyBridge && typeof window.RustyBridge === 'object') ? window.RustyBridge : null;
}

function initializeWebChannel() {
    console.log("Attempting to initialize bridge...");
    if (typeof qt !== 'undefined' && typeof qt.webChannelTransport !== 'undefined') {
        try {
            new QWebChannel(qt.webChannelTransport, function (channel) {
                if (channel.objects.backend) {
                    pythonBackend = channel.objects.backend;
                    isWebChannelReady = true;
                    console.log("QWebChannel connection established. Python backend object acquired.");
                    setTimeout(() => {
                         if (pythonBackend && typeof pythonBackend.js_ready === 'function') {
                            try { pythonBackend.js_ready(); console.log("Called pythonBackend.js_ready()"); }
                            catch (e) { console.error("Error calling pythonBackend.js_ready():", e); }
                        } else { console.error("Python backend object found, but js_ready function is missing or not callable."); }
                    }, 50);
                } else { console.error("QWebChannel connected, but 'backend' object not found in channel.objects."); }
            });
        } catch (e) { console.error("Error creating QWebChannel:", e); setTimeout(initializeWebChannel, 1500); }
    } else if (getRustyBridge()) {
        // ==== BROWSER MODE ====
        console.log("Browser bridge detected. Running in static-site mode.");
        isWebChannelReady = true;
        setTimeout(() => {
            const bridge = getRustyBridge();
            if (bridge && typeof bridge.js_ready === 'function') {
                try { bridge.js_ready(); console.log("Called RustyBridge.js_ready()"); }
                catch (e) { console.error("Error calling RustyBridge.js_ready():", e); }
            }
        }, 50);
    } else {
        console.warn("qt.webChannelTransport not defined and no window.RustyBridge found. Retrying setup...");
        setTimeout(initializeWebChannel, 300);
    }
}

function callPythonBackend(methodName, ...args) {
    const isSoundRequest = methodName === 'jsRequestSound';

    // ==== BROWSER MODE: route to the static-site bridge first ====
    const bridge = getRustyBridge();
    if (bridge && typeof bridge[methodName] === 'function') {
        try {
            if (methodName === 'jsRequestSound') {
                if (args.length >= 1 && typeof args[0] === 'string') {
                    bridge.jsRequestSound(args[0]);
                } else if (args.length === 1 && typeof args[0] === 'object' && args[0].hasOwnProperty('stop')) {
                    bridge.jsRequestSound(`stop:${args[0].stop}`);
                } else if (args.length > 1 && typeof args[0] === 'string' && typeof args[1] === 'number') {
                    bridge.jsRequestSound(`play:${args[0]}:${args[1]}`);
                }
            } else {
                bridge[methodName](...args);
            }
        } catch (e) { console.error(`Error calling RustyBridge.${methodName}():`, e); }
        return;
    }
    if (getRustyBridge()) { return; } // Browser mode without that method: silently ignore

    // ==== QTWEBENGINE MODE (desktop app) ====
    if (isWebChannelReady && pythonBackend && typeof pythonBackend[methodName] === 'function') {
        try {
            if (methodName === 'jsRequestSound') {
                if (args.length >= 1 && typeof args[0] === 'string') {
                    pythonBackend.jsRequestSound(args[0]);
                } else if (args.length === 1 && typeof args[0] === 'object' && args[0].hasOwnProperty('stop')) {
                     pythonBackend.jsRequestSound(`stop:${args[0].stop}`);
                } else if (args.length > 1 && typeof args[0] === 'string' && typeof args[1] === 'number') {
                    pythonBackend.jsRequestSound(`play:${args[0]}:${args[1]}`);
                } else {
                    console.warn(`Cannot call pythonBackend.jsRequestSound with arguments:`, args);
                }
            } else {
                pythonBackend[methodName](...args);
            }
        }
        catch (e) { console.error(`Error calling pythonBackend.${methodName}():`, e); }
    } else {
        if (!isSoundRequest) {
            if (!pythonBackend || (isSoundRequest && typeof pythonBackend[methodName] !== 'function')) {
                console.warn(`Cannot call pythonBackend.${methodName}(), backend not ready or method missing.`);
            }
        }
    }
}
// --- End Bridge Integration Block ---
// ========================================================


// ========================================================
// --- Animation Options Block ---
// ========================================================
const OPTIONS = {
    BOX_COUNT: 25, DEFAULT_REVEAL_INTERVAL_MS: 300, CYCLE_INTERVAL_MS: 80, BOX_PULSE_DURATION_MS: 800, BOXES_APPEAR_DELAY_MS: 100, REVEAL_START_DELAY_MS: 600, CHARS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    TRIGLAVIAN_GLYPHS: "ABCČDEFGHILMNOPRSŠTUVZŽƕƆƗƖƜƞƚƶENTYΛƆЯƧИ",

    LIST_NUM_LIGHTS: 20,
    LIST_RAF_FAST_SPEED: 50,
    LIST_DECELERATION_DURATION_MS: 5000,
    LIST_FAST_SCROLL_DURATION_MS_FAST: 6000,
    LIST_FAST_SCROLL_DURATION_MS_NORMAL: 10000,
    LIST_FAST_SCROLL_DURATION_MS_SLOW: 20000,
    LIST_APPEAR_DELAY_MS: 100,
    LIST_SCROLL_START_DELAY_MS: 100,
    LIST_MIN_REPEATS_FEW_ENTRANTS: 25,
    LIST_MIN_REPEATS_MANY_ENTRANTS: 15,
    LIST_MANY_ENTRANTS_THRESHOLD: 50,
    LIST_RANDOM_FINAL_OFFSET_PX: 2,
    LIST_WINNER_DISPLAY_DELAY_MS: 300,
    COUNTDOWN_START_DELAY_AFTER_LIST_MS: 800,
    LIST_TEXT_UPDATE_INTERVAL_MS: 60,
    LIST_TARGET_SNAP_THRESHOLD_PX: 0.5,
    LIST_TICK_SOUND_KEY: "wheel_tick",
    LIST_HARD_CAP_DURATION_MS: 35000,

    TRIG_BOX_COUNT: 5, TRIG_APPEAR_DELAY_MS: 100, TRIG_BOXES_APPEAR_DELAY_MS: 100, TRIG_CYCLE_INTERVAL_MS: 90, TRIG_REVEAL_START_DELAY_MS: 500, TRIG_REVEAL_INTERVAL_MS_FAST: 200, TRIG_REVEAL_INTERVAL_MS_NORMAL: 350, TRIG_REVEAL_INTERVAL_MS_SLOW: 600, TRIG_SCAN_PING_DURATION_MS: 250, TRIG_SCAN_PING_DELAY_BEFORE_REVEAL_MS: 100, TRIG_PULSE_DURATION_MS: 600, TRIG_TEMP_REVEAL_CLEAR_DELAY_MS: 150, TRIG_WINNER_DISPLAY_DELAY_MS: 300, TRIG_PLACEHOLDER_CHAR: ' ', COUNTDOWN_START_DELAY_AFTER_TRIG_MS: 500,

    NODE_PATH_APPEAR_DELAY_MS: 100, NODE_PATH_GRID_APPEAR_DELAY_MS: 150, NODE_PATH_REVEAL_START_DELAY_MS: 400,
    NODE_PATH_MIN_PATH_LENGTH: 7, NODE_PATH_MAX_PATH_ATTEMPTS: 5, NODE_PATH_WINNER_REVEAL_DELAY_MS: 250, COUNTDOWN_START_DELAY_AFTER_NODE_PATH_MS: 500,
    NODE_PATH_MIDPOINT_PAUSE_MS: 2000,
    NODE_PATH_VOWEL_REVEAL_SOUND: "verified",
    NODE_PATH_PLACEHOLDER_CHAR: '_',

    TRIG_CONDUIT_NODE_COUNT: 7,
    TRIG_CONDUIT_APPEAR_DELAY_MS: 100,
    TRIG_CONDUIT_NODE_APPEAR_STAGGER_MS: 80,
    TRIG_CONDUIT_PULSE_ANIM_DURATION_MS: 1600,
    TRIG_CONDUIT_REVEAL_BASE_INTERVAL_MS_SLOW: 1200,
    TRIG_CONDUIT_REVEAL_BASE_INTERVAL_MS_NORMAL: 800,
    TRIG_CONDUIT_REVEAL_BASE_INTERVAL_MS_FAST: 450,
    TRIG_CONDUIT_WINNER_DISPLAY_DELAY_MS: 600,
    TRIG_CONDUIT_COUNTDOWN_DELAY_MS: 900,
    TRIG_CONDUIT_PLACEHOLDER_CHAR: '■',
    TRIG_CONDUIT_SCRAMBLE_DURATION_MS: 600,
    TRIG_CONDUIT_SCRAMBLE_CYCLES_PER_CHAR: 8,

    TRIG_CODE_DEFAULT_CHAR_SET: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCČDEFGHILMNOPRSŠTUVZŽƕƆƗƖƜƞƚƶENTYΛƆЯƧИ",
    TRIG_CODE_DEFAULT_LENGTH: 8,
    TRIG_CODE_MIN_MUTATIONS: 1,
    TRIG_CODE_MAX_MUTATIONS: 3,
    TRIG_CODE_DEFAULT_FINALIST_COUNT: 10,
    TRIG_CODE_FINAL_TWO_PAUSE_MS: 3000,
    TRIG_CODE_REVEAL_INTERVAL_MS_FAST: 300,
    TRIG_CODE_REVEAL_INTERVAL_MS_NORMAL: 500,
    TRIG_CODE_REVEAL_INTERVAL_MS_SLOW: 900,
    TRIG_CODE_PLACEHOLDER_CHAR: '·',
    TRIG_CODE_APPEAR_DELAY_MS: 100,
    TRIG_CODE_LIST_APPEAR_DELAY_MS: 250,
    TRIG_CODE_WINNER_CODE_REVEAL_START_DELAY_MS: 500,
    TRIG_CODE_ELIMINATION_DELAY_MS: 250,
    TRIG_CODE_ELIMINATION_ANIM_DURATION_MS: 400,
    TRIG_CODE_WINNER_NAME_DISPLAY_DELAY_MS: 300,
    COUNTDOWN_START_DELAY_AFTER_TRIG_CODE_MS: 600,

    SLIDE_UP_DELAY_MS: 100, COLOR_SHIFT_START_DELAY_MS: 2000, SOUND_NOTIFICATION_KEY: "notification",
    SOUND_CONDUIT_STABLE_KEY: "conduit_stable",
};

const NODE_PATH_SPEED_DURATIONS = { "Normal": 120, "Slow": 280, "Very Slow": 500 };
// ========================================================
// --- End Animation Options Block ---
// ========================================================

// --- DOM Elements ---
let bodyElement; let backgroundCanvas;
let animationContent; 
let boxRevealMode; let listRevealMode; let triglavianRevealMode; let nodePathRevealMode;
let trigConduitRevealMode; let trigCodeRevealMode;
let prizeRevealContainer, prizeRevealDisplay, prizeRevealName, prizeRevealDonator;
let boxesRow;
let listScrollContainer; let listPointer; let entrantList; let listWinnerDisplay; let listWinnerNameSpan;
let listLightsIndicator;
let triglavianBoxesRow; let triglavianWinnerDisplay; let triglavianWinnerNameSpan; /* ESI: */ let triglavianWinnerPortraitImg, triglavianWinnerCorpSpan, triglavianWinnerAllianceSpan;
let nodePathGridContainer; let nodePathSvgOverlay = null; let nodePathWinnerDisplay; let nodePathWinnerNameSpan; /* ESI: */ let nodePathWinnerPortraitImg, nodePathWinnerCorpSpan, nodePathWinnerAllianceSpan;
let trigConduitNodesContainer; let trigConduitWinnerDisplay; let trigConduitWinnerNameSpan; /* ESI: */ let trigConduitWinnerPortraitImg, trigConduitWinnerCorpSpan, trigConduitWinnerAllianceSpan;
let trigCodeParticipantsContainer; let trigCodeWinnerCodeDisplay; let trigCodeWinnerNameDisplay; let trigCodeWinnerNameSpan; /* ESI: */ let trigCodeWinnerPortraitImg, trigCodeWinnerCorpSpan, trigCodeWinnerAllianceSpan;


let countdownContainer; let countdownProgress; let countdownText;
// Keep references so we can temporarily move the live countdown into the overlay
let _countdownOriginalParent = null;
let _countdownOriginalNextSibling = null;
let _countdownOriginalInlineStyle = null; // store inline style so we can restore later
let _countdownResizeHandler = null; // handler to reposition countdown on resize

// --- State Variables ---
let fulltimerOverlay; let fulltimerWinner; let fulltimerTimer;
let boxes = []; let cyclingIntervalId = null; let revealTimeoutId = null; let revealedIndices = new Set(); let currentRevealInterval = OPTIONS.DEFAULT_REVEAL_INTERVAL_MS;
let isListScrolling = false;
let winnerLiElement = null;
let listAnimationFrameId = null;
let listScrollState = {
    currentTranslateY: 0, startTime: 0, lastTextUpdateTime: 0, targetTranslateY: 0, decelerationStartTime: 0,
    initialPosAtDeceleration: 0, currentPhase: 'fast-scroll',
    singleBlockHeight: 0,
    currentFastScrollDurationMs: OPTIONS.LIST_FAST_SCROLL_DURATION_MS_NORMAL,
    currentFastSpeed: OPTIONS.LIST_RAF_FAST_SPEED,
    listLights: [], numLightsCurrentlyOn: OPTIONS.LIST_NUM_LIGHTS, lightsTurnedOffThisCycle: false,
    cachedWinnerLiOffsetTop: 0,
    cachedWinnerLiHeight: 0,
    initialLightsOnAtDecel: 0,
    lastTickedItemGlobalIndex: -1,
    totalItemHeightWithMargin: 0,
    animationStartTime: 0,
};

let triglavianBoxes = []; let triglavianCyclingIntervalId = null; let triglavianRevealTimeoutId = null; let trigRevealSequence = []; let trigRevealedLetters = []; let trigTempRevealTimeouts = {};
let nodeGrid = []; let nodePathLines = {}; let currentPath = []; let nodePathRevealTimeoutId = null; let nodePathActiveNodeTimeoutId = null; let nodePathGenerationAttempts = 0;
let nodePathWinnerDisplayState = [];
let trigConduitNodes = [];
let trigConduitNamePlaceholders = [];
let trigConduitNodeCenters = [];
let trigConduitIntervalId = null;
let currentTrigConduitStepDuration = OPTIONS.TRIG_CONDUIT_REVEAL_BASE_INTERVAL_MS_NORMAL;
let trigConduitScrambleIntervals = {};
let trigConduitCore = null;

// Conduit atmosphere state
let conduitStarfieldCanvas = null;
let conduitStarfieldCtx = null;
let conduitStarfieldAnimId = null;
let conduitStars = [];

let trigCodeParticipantsData = [];
let trigCodeWinnerCode = "";

// Fulltimer overlay cycling lists state
let fulltimerBgListLeftUl = null;
let fulltimerBgListRightUl = null;
let trigCodeRevealedChars = [];
let trigCodeCurrentRevealIndex = 0;
let trigCodeRevealIntervalId = null;
let currentTrigCodeRevealStepDuration = OPTIONS.TRIG_CODE_REVEAL_INTERVAL_MS_NORMAL;
let currentTrigCodeCharSet = OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
let currentTrigCodeFinalistCount = OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;

let progressRingCircumference = 0; let animationSequenceTimeoutIds = [];
let isCountdownActive = false; let countdownStartTime = 0;
let countdownUrgencyActive = false;
let currentWinnerNameForCallback = "Unknown";
let currentCountdownDurationS = 30;
let currentWinnerPlatform = '';
let _cachedParticipantList = []; let isBackgroundListsReady = false;
let currentNodePathStepDuration = NODE_PATH_SPEED_DURATIONS["Normal"];

// Neon winner ESI DOM refs
let neonWinnerDisplay; let neonWinnerPortraitImg; let neonWinnerCorpSpan; let neonWinnerAllianceSpan; let neonWinnerNameSpan;
// Neon matrix-rain backdrop (canvas) rAF handle
let neonRainRAFId = null;
let neonRainDrops = [];

// Deep Seek DOM refs
let deepseekRevealMode; let dsCanvas; let dsPhaseText; let dsScanPct; let dsScanValue;
let dsLockText; let dsBracketContainer; let dsFinalName;
let dsCandidates; let dsCandidatesList;
let dsWarpText;
let deepseekWinnerDisplay; let deepseekWinnerNameSpan; let deepseekWinnerPortraitImg; let deepseekWinnerCorpSpan; let deepseekWinnerAllianceSpan;

// Neural Interface Decode state
let neuralDecodeColData = [];
let neuralDecodeCycleIntervalId = null;

// Deep Seek state (canvas + multi-phase)
let dsCanvasEl, dsCtx;
let dsAnimFrameId = null;
let dsProbes = [];
let dsSignatures = [];
let dsGridIntensity = 0;
let dsGridAngle = 0;
let dsPhase = 0;
let dsScanPctValue = 0;
let dsScanIntervalId = null;
let dsBracketSvg = null;
let dsSweepAngle = 0;
let dsSonarY = 0;
let dsSonarDirection = 1;
let dsSonarTickCooldown = 0;
let dsLaserFlashT = 0;
let dsLaserActive = false;
let dsCornerConvergeT = 0;
let dsCornerConvergeActive = false;
let dsCandidatesHighlightId = null;
let dsCandidatesIndex = 0;

let canPlayTickSound = true;
const tickSoundDebounceDelay = 120;
let _pendingAnimStart = null; // tracks delayed animation start for fade-out/fade-in transitions

// Multi-winner animation state
let isMultiWinnerMode = false;
let multiWinnerNamesArray = [];


// --- Helper Functions ---

// Universal animation state reset
function resetAllAnimationStates() {
    isMultiWinnerMode = false;
    multiWinnerNamesArray = [];
    resetListState();
    resetTriglavianState();
    resetNodePathState();
    resetTrigConduitState();
    resetTrigCodeRevealState();
    resetNeuralDecodeState();
    resetDeepSeekState();
    // Remove animation classes from all .box and winner containers
    document.querySelectorAll('.box, .triglavian-box, .trig-conduit-node').forEach(el => {
        el.classList.remove('box-pulse', 'revealed', 'showing-reveal', 'active', 'letter-placeholder', 'letter-revealed');
        el.textContent = '';
    });
    document.querySelectorAll('.winner-target-slot, .visible, .slide-up, .standalone').forEach(el => {
        el.classList.remove('winner-target-slot', 'visible', 'slide-up', 'standalone');
    });
    // Hide or clear winner name/portrait containers
    [
        'hacking-winner-name', 'list-winner-name', 'triglavian-winner-name',
        'node-path-winner-name', 'trig-conduit-winner-name', 'trig-code-winner-name', 'neon-winner-name',
        'nd-winner-name', 'ds-winner-name'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}
function clearAnimationSequenceTimeouts() { animationSequenceTimeoutIds.forEach(id => { clearTimeout(id); clearInterval(id); }); animationSequenceTimeoutIds = []; }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getRandomFloat(min, max) { return Math.random() * (max - min) + min; }
function getCssVariableValue(variableName) { try { return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim(); } catch (e) { console.error(`Error getting CSS variable ${variableName}:`, e); return null; } }
function parsePixels(cssValue) { if (!cssValue) return 0; const match = cssValue.match(/(\d+(\.\d+)?)px/); return match ? parseFloat(match[1]) : 0; }
function parseVmin(cssValue) { if (!cssValue) return 0; const match = cssValue.match(/(\d+(\.\d+)?)vmin/); if (!match) return 0; const val = parseFloat(match[1]); const vmin = Math.min(window.innerWidth, window.innerHeight) / 100; return val * vmin; }
function getRandomChar() { return OPTIONS.CHARS[Math.floor(Math.random() * OPTIONS.CHARS.length)]; }
function getRandomTrigGlyph() { return OPTIONS.TRIGLAVIAN_GLYPHS[Math.floor(Math.random() * OPTIONS.TRIGLAVIAN_GLYPHS.length)]; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }


// --- Initialization ---
function initializeDisplay() {
    resetAllAnimationStates();
    bodyElement = document.body; backgroundCanvas = document.getElementById('background-canvas');
    animationContent = document.getElementById('animation-content'); 
    boxRevealMode = document.getElementById('box-reveal-mode'); listRevealMode = document.getElementById('list-reveal-mode');
    triglavianRevealMode = document.getElementById('triglavian-reveal-mode');
    nodePathRevealMode = document.getElementById('node-path-reveal-mode');
    trigConduitRevealMode = document.getElementById('trig-conduit-reveal-mode');
    trigCodeRevealMode = document.getElementById('trig-code-reveal-mode');
    prizeRevealContainer = document.getElementById('prize-reveal-container'); 
    prizeRevealDisplay = document.getElementById('prize-reveal-display'); 
    prizeRevealName = document.getElementById('prize-reveal-name');
    prizeRevealDonator = document.getElementById('prize-reveal-donator');
    boxesRow = document.getElementById('boxes-row');
    listScrollContainer = document.getElementById('list-scroll-container'); listPointer = document.querySelector('#list-reveal-mode .list-pointer');
    entrantList = document.getElementById('entrant-list'); listWinnerDisplay = document.getElementById('list-winner-display'); listWinnerNameSpan = document.getElementById('list-winner-name');
    listLightsIndicator = document.getElementById('list-lights-indicator');
    
    triglavianBoxesRow = document.getElementById('triglavian-boxes-row');
    triglavianWinnerDisplay = document.getElementById('triglavian-winner-display');
    triglavianWinnerNameSpan = document.getElementById('triglavian-winner-name');
    triglavianWinnerPortraitImg = document.getElementById('triglavian-winner-portrait'); // ESI
    triglavianWinnerCorpSpan = document.getElementById('triglavian-winner-corp');     // ESI
    triglavianWinnerAllianceSpan = document.getElementById('triglavian-winner-alliance'); // ESI

    nodePathGridContainer = document.getElementById('node-path-grid-container'); nodePathSvgOverlay = null;
    nodePathWinnerDisplay = document.getElementById('node-path-winner-display');
    nodePathWinnerNameSpan = document.getElementById('node-path-winner-name');
    nodePathWinnerPortraitImg = document.getElementById('node-path-winner-portrait'); // ESI
    nodePathWinnerCorpSpan = document.getElementById('node-path-winner-corp');     // ESI
    nodePathWinnerAllianceSpan = document.getElementById('node-path-winner-alliance'); // ESI

    trigConduitNodesContainer = document.getElementById('trig-conduit-nodes-container');
    trigConduitWinnerDisplay = document.getElementById('trig-conduit-winner-display');
    trigConduitWinnerNameSpan = document.getElementById('trig-conduit-winner-name');
    trigConduitWinnerPortraitImg = document.getElementById('trig-conduit-winner-portrait'); // ESI
    trigConduitWinnerCorpSpan = document.getElementById('trig-conduit-winner-corp');     // ESI
    trigConduitWinnerAllianceSpan = document.getElementById('trig-conduit-winner-alliance'); // ESI
    
    trigCodeParticipantsContainer = document.getElementById('trig-code-participants-container');
    trigCodeWinnerCodeDisplay = document.getElementById('trig-code-winner-code-display');
    trigCodeWinnerNameDisplay = document.getElementById('trig-code-winner-name-display');
    trigCodeWinnerNameSpan = document.getElementById('trig-code-winner-name');
    trigCodeWinnerPortraitImg = document.getElementById('trig-code-winner-portrait'); // ESI
    trigCodeWinnerCorpSpan = document.getElementById('trig-code-winner-corp');     // ESI
    trigCodeWinnerAllianceSpan = document.getElementById('trig-code-winner-alliance'); // ESI

    // Neon ESI/winner display elements
    neonWinnerDisplay = document.getElementById('neon-winner-display');
    neonWinnerPortraitImg = document.getElementById('neon-winner-portrait');
    neonWinnerCorpSpan = document.getElementById('neon-winner-corp');
    neonWinnerAllianceSpan = document.getElementById('neon-winner-alliance');
    neonWinnerNameSpan = document.getElementById('neon-winner-name');

    // Deep Seek elements
    deepseekRevealMode = document.getElementById('deepseek-reveal-mode');
    dsCanvas = document.getElementById('ds-canvas');
    dsPhaseText = document.getElementById('ds-phase-text');
    dsScanPct = document.getElementById('ds-scan-pct');
    dsScanValue = document.getElementById('ds-scan-value');
    dsLockText = document.getElementById('ds-lock-text');
    dsBracketContainer = document.getElementById('ds-bracket-container');
    dsFinalName = document.getElementById('ds-final-name');
    dsCandidates = document.getElementById('ds-candidates');
    dsCandidatesList = document.getElementById('ds-candidates-list');
    deepseekWinnerDisplay = document.getElementById('ds-winner-display');
    deepseekWinnerNameSpan = document.getElementById('ds-winner-name');
    deepseekWinnerPortraitImg = document.getElementById('ds-winner-portrait');
    deepseekWinnerCorpSpan = document.getElementById('ds-winner-corp');
    deepseekWinnerAllianceSpan = document.getElementById('ds-winner-alliance');


    countdownContainer = document.getElementById('countdown-container'); countdownProgress = document.getElementById('countdown-progress'); countdownText = document.getElementById('countdown-text');
    dsWarpText = document.getElementById('ds-warp-text');

    if (!bodyElement || !animationContent || !triglavianRevealMode || !trigCodeRevealMode || !countdownContainer || !backgroundCanvas || !countdownProgress || !countdownText || !prizeRevealContainer || !prizeRevealDisplay || !prizeRevealName || !prizeRevealDonator) {
        console.error("Initialization Error: Core elements missing!"); if(bodyElement) bodyElement.innerHTML = "<h1 style='color:red; font-family: sans-serif;'>Init Error: Missing Core Elements!</h1>"; return false;
    }
    stopAnimationSequence();
    bodyElement.classList.remove('show-boxes', 'show-list', 'show-triglavian', 'show-node-path', 'show-trig-conduit', 'show-trig-code', 'show-neon-encrypted', 'show-neural-decode', 'show-deepseek');
    const _neonModeEl = document.getElementById('neon-encrypted-mode');
    const _ndModeEl = document.getElementById('neural-decode-mode');
    const _dsModeEl = document.getElementById('deepseek-reveal-mode');
    [boxRevealMode, listRevealMode, triglavianRevealMode, nodePathRevealMode, trigConduitRevealMode, trigCodeRevealMode, _neonModeEl, _ndModeEl, _dsModeEl].forEach(mode => {
        if(mode) { mode.style.display = 'none'; mode.classList.remove('visible', 'slide-up'); }
    });
    if(prizeRevealContainer) { prizeRevealContainer.style.display = 'none'; prizeRevealContainer.classList.remove('visible'); }
    if(animationContent) { animationContent.style.display = 'flex'; }
    if(boxesRow) boxesRow.classList.remove('visible');
    if(listWinnerDisplay) listWinnerDisplay.classList.remove('visible');
    if(listLightsIndicator) listLightsIndicator.innerHTML = '';
    
    // Reset ESI display elements too
    [triglavianWinnerDisplay, nodePathWinnerDisplay, trigConduitWinnerDisplay, trigCodeWinnerNameDisplay, neonWinnerDisplay, document.getElementById('nd-winner-display'), deepseekWinnerDisplay].forEach(el => { if(el) el.classList.remove('visible', 'standalone'); });
    [triglavianWinnerPortraitImg, nodePathWinnerPortraitImg, trigConduitWinnerPortraitImg, trigCodeWinnerPortraitImg, document.getElementById('list-winner-portrait'), deepseekWinnerPortraitImg].forEach(el => { if(el) { el.src="#"; el.style.display='none';} }); // Added list-winner-portrait
    [triglavianWinnerCorpSpan, triglavianWinnerAllianceSpan, nodePathWinnerCorpSpan, nodePathWinnerAllianceSpan, trigConduitWinnerCorpSpan, trigConduitWinnerAllianceSpan, trigCodeWinnerCorpSpan, trigCodeWinnerAllianceSpan, document.getElementById('list-winner-corp'), document.getElementById('list-winner-alliance'), deepseekWinnerCorpSpan, deepseekWinnerAllianceSpan].forEach(el => { if(el) el.textContent=''; }); // Added list ESI spans


    if(triglavianBoxesRow) triglavianBoxesRow.classList.remove('visible');
    if(nodePathGridContainer) nodePathGridContainer.classList.remove('visible');
    if(trigConduitNodesContainer) trigConduitNodesContainer.classList.remove('visible');
    if(trigCodeParticipantsContainer) { trigCodeParticipantsContainer.innerHTML = ''; trigCodeParticipantsContainer.classList.remove('visible');}
    if(trigCodeWinnerCodeDisplay) { trigCodeWinnerCodeDisplay.innerHTML = ''; trigCodeWinnerCodeDisplay.classList.remove('visible');}


    countdownContainer.classList.remove('visible');
    resetListState(); resetTriglavianState(); resetNodePathState(); resetTrigConduitState(); resetTrigCodeRevealState(); resetDeepSeekState();
    // Tear down any active countdown/fulltimer overlay from a previous draw so a
    // new animation never overlaps the overlay (overlap is a native WebEngine
    // crash vector on Qt 6.9.1/6.11.x — see CRASH_ANALYSIS_WEBENGINE.md).
    try { stopCountdownPhase(false); } catch (e) { /* ignore */ }
    try {
        if (fulltimerOverlay) {
            fulltimerOverlay.classList.remove('visible', 'countdown-urgent', 'overlay-ring-active');
            fulltimerOverlay.style.display = 'none';
            document.body.classList.remove('fulltimer-active');
        }
    } catch (e) { /* ignore */ }
    _stopHackLoop(); revealedIndices.clear(); boxes.forEach(box => { if (box) { box.char = ''; box.revealed = false; box.pulseT = 0; } });
    winnerLiElement = null;
    console.log("🔧 initializeDisplay: Creating Triglavian boxes...");
    createTriglavianBoxes(); // Hacking mode (createBoxes) removed in browser version — needs the Qt-only #boxes-row
    console.log("🔧 initializeDisplay: After creation - boxes.length:", boxes.length, "triglavianBoxes.length:", triglavianBoxes.length);
    initializeBackgroundNetwork();
    if (countdownProgress && progressRingCircumference === 0) { const radiusEl = countdownProgress.r?.baseVal; if (radiusEl) { const radius = radiusEl.value; progressRingCircumference = 2 * Math.PI * radius; } else { console.error("Could not get countdown radius."); progressRingCircumference = 283; } countdownProgress.style.strokeDasharray = `${progressRingCircumference} ${progressRingCircumference}`; }
    return true;
}

// --- Background Network Functions ---
function initializeBackgroundNetwork() { if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.init === 'function') { if (!window.networkAnimationRunning) { NetworkAnimation.init(updateCountdown); window.networkAnimationRunning = true; setTimeout(() => { if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.forceResizeCheck === 'function') { NetworkAnimation.forceResizeCheck(); } }, 150); } } else { console.error("NetworkAnimation module not found or init function missing!"); } }
function stopBackgroundNetworkAnimation() { if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.stop === 'function') { NetworkAnimation.stop(); window.networkAnimationRunning = false; } }

// --- Function Called by Python ---
function updateParticipantsJS(participantArray) { console.log("JS: updateParticipantsJS function ENTRY. Received type:", typeof participantArray, "Value:", participantArray ? participantArray.slice(0,5) : 'null/undefined'); try { _cachedParticipantList = Array.isArray(participantArray) ? participantArray : []; console.log("JS: _cachedParticipantList updated. Count:", _cachedParticipantList.length); if (isBackgroundListsReady && typeof BackgroundLists !== 'undefined' && typeof BackgroundLists.update === 'function') { console.log("JS: Calling BackgroundLists.update..."); BackgroundLists.update(_cachedParticipantList); console.log("JS: BackgroundLists.update call finished."); } else if (!isBackgroundListsReady) { console.warn("BackgroundLists module not ready yet, skipping update."); } else { console.warn("BackgroundLists module ready but update function not found!"); } } catch (e) { console.error("JS Error within updateParticipantsJS:", e); } }
window.updateParticipantsJS = updateParticipantsJS;

// --- Hacking (Box) Creation / Cycling / Reveal ---
// REBUILT as a single 2D canvas renderer. The old implementation created 25
// DOM .box divs with CSS transitions/keyframes and rapid textContent churn;
// that exact compositing path triggers a native QtWebEngine crash (0xC0000409 /
// 0xC0000005 in Qt6WebEngineCore.dll) on Qt 6.9.1 AND 6.11.x. Drawing the same
// boxes on a canvas keeps the identical look while staying on the stable
// raster/compositor path used by the network/conduit backgrounds.
let _hackCanvas = null;
let _hackCtx = null;
let _hackRAFId = null;
let _hackActive = false;

function _hackEnsureCanvas() {
    if (_hackCanvas && _hackCanvas.parentNode === boxesRow) return true;
    if (!boxesRow) return false;
    _hackCanvas = document.createElement('canvas');
    _hackCanvas.id = 'hacking-boxes-canvas';
    _hackCanvas.style.width = '100%';
    _hackCanvas.style.display = 'block';
    boxesRow.innerHTML = '';
    boxesRow.appendChild(_hackCanvas);
    _hackCtx = _hackCanvas.getContext('2d');
    return true;
}

function _hackMetrics() {
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    return {
        boxW: Math.min(70, Math.max(35, 5 * vmin)),
        boxH: Math.min(80, Math.max(40, 6 * vmin)),
        margin: 0.5 * vmin,
        border: Math.max(1, 0.2 * vmin),
        fontSize: Math.min(30, Math.max(14, 2.8 * vmin)),
    };
}

function _hackColor(varName, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return v || fallback;
    } catch (e) { return fallback; }
}

function _hackResize() {
    if (!_hackCanvas || !boxesRow) return;
    const m = _hackMetrics();
    const w = Math.max(10, boxesRow.clientWidth || boxesRow.getBoundingClientRect().width);
    const h = Math.max(10, m.boxH + 2 * m.margin);
    const dpr = window.devicePixelRatio || 1;
    _hackCanvas.style.height = h + 'px';
    _hackCanvas.width = Math.round(w * dpr);
    _hackCanvas.height = Math.round(h * dpr);
    _hackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function _hackDraw() {
    if (!_hackCtx || !boxesRow) return;
    const rect = boxesRow.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const m = _hackMetrics();
    _hackCtx.clearRect(0, 0, w, h);
    const n = OPTIONS.BOX_COUNT;
    const totalW = n * m.boxW + (n - 1) * 2 * m.margin;
    const startX = (w - totalW) / 2;
    const y = (h - m.boxH) / 2;
    const bg = _hackColor('--trig-dark-blue', '#0a2845');
    const cyan = _hackColor('--trig-cyan', '#4af1f2');
    const bright = _hackColor('--trig-cyan-bright', '#c0ffff');
    const grey = _hackColor('--trig-grey', '#9099a1');
    const now = performance.now();
    for (let i = 0; i < n; i++) {
        const box = boxes[i];
        if (!box) continue;
        const bx = startX + i * (m.boxW + 2 * m.margin);
        const by = y, bw = m.boxW, bh = m.boxH;
        box.rect = { left: bx, top: by, right: bx + bw, bottom: by + bh };
        let borderColor = cyan;
        let glow = 0;
        if (box.revealed && box.pulseT) {
            const t = (now - box.pulseT) / OPTIONS.BOX_PULSE_DURATION_MS;
            if (t < 1) glow = Math.max(0, 1 - t);
        }
        if (glow > 0) borderColor = bright;
        _hackCtx.fillStyle = bg;
        _hackCtx.fillRect(bx, by, bw, bh);
        _hackCtx.strokeStyle = borderColor;
        _hackCtx.lineWidth = m.border;
        _hackCtx.strokeRect(bx + m.border / 2, by + m.border / 2, bw - m.border, bh - m.border);
        if (glow > 0) {
            _hackCtx.fillStyle = 'rgba(100,255,255,' + (0.28 * glow).toFixed(3) + ')';
            _hackCtx.fillRect(bx, by, bw, bh);
        }
        const ch = box.char || '';
        _hackCtx.fillStyle = box.revealed ? '#ffffff' : grey;
        _hackCtx.font = (box.revealed ? '600 ' : 'normal ') + m.fontSize + 'px "Shentox-SemiBold", "Triglavian - Complete Regular", sans-serif';
        _hackCtx.textAlign = 'center';
        _hackCtx.textBaseline = 'middle';
        _hackCtx.fillText(ch, bx + bw / 2, by + bh / 2 + 1);
    }
}

function _hackLoop(ts) {
    if (!_hackActive) { _hackRAFId = null; return; }
    _hackResize();
    _hackDraw();
    _hackRAFId = requestAnimationFrame(_hackLoop);
}

function _startHackLoop() {
    if (_hackActive) return;
    _hackActive = true;
    _hackRAFId = requestAnimationFrame(_hackLoop);
}

function _stopHackLoop() {
    _hackActive = false;
    if (_hackRAFId) { cancelAnimationFrame(_hackRAFId); _hackRAFId = null; }
    if (_hackCtx && _hackCanvas) _hackCtx.clearRect(0, 0, _hackCanvas.width, _hackCanvas.height);
}

function createBoxes() {
    if (!boxesRow) { console.error("Boxes row missing!"); return; }
    if (boxes.length !== OPTIONS.BOX_COUNT) {
        if (!_hackEnsureCanvas()) { console.error("Could not create hacking canvas."); return; }
        boxes = [];
        for (let i = 0; i < OPTIONS.BOX_COUNT; i++) {
            boxes.push({ char: '', revealed: false, pulseT: 0, rect: null });
        }
    }
}
function cycleChars() { if (!bodyElement.classList.contains('show-boxes')) { if (cyclingIntervalId) { clearInterval(cyclingIntervalId); cyclingIntervalId = null; } return; } if (boxes.length !== OPTIONS.BOX_COUNT) return; boxes.forEach((box, index) => { if (box && !revealedIndices.has(index)) { box.char = getRandomChar(); box.revealed = false; } }); }
function pulseBox(index) { if (boxes[index]) boxes[index].pulseT = performance.now(); }
function revealLetter(box, letter, index) { if (!box) return; box.char = letter; box.revealed = true; pulseBox(index); revealedIndices.add(index); callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY); }
function checkRevealCompletion(remainingIndices) { if (remainingIndices.length === 0) { _stopHackLoop(); if (cyclingIntervalId) { clearInterval(cyclingIntervalId); cyclingIntervalId = null; } if (revealTimeoutId) clearTimeout(revealTimeoutId); revealTimeoutId = null; const revealMode = document.querySelector('.reveal-mode.visible'); if (revealMode) revealMode.classList.add('slide-up'); const countdownStartTimeoutId = setTimeout(() => { startCountdownPhase(); }, OPTIONS.SLIDE_UP_DELAY_MS); animationSequenceTimeoutIds.push(countdownStartTimeoutId); console.log(`JS checkRevealCompletion: Sending original name back: '${currentWinnerNameForCallback}'`); callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback); return true; } return false; }
function revealRandomLetter(winnerNameToReveal, leftPadding, unrevealedTargetIndices) { if (checkRevealCompletion(unrevealedTargetIndices)) return; const randomIndexInUnrevealed = Math.floor(Math.random() * unrevealedTargetIndices.length); const boxIndexToReveal = unrevealedTargetIndices[randomIndexInUnrevealed]; const letterIndexInName = boxIndexToReveal - leftPadding; const letter = winnerNameToReveal[letterIndexInName]?.toUpperCase() || '?'; const box = boxes[boxIndexToReveal]; if (!box) { console.error(`Target box ${boxIndexToReveal} not found! Skipping.`); unrevealedTargetIndices.splice(randomIndexInUnrevealed, 1); revealRandomLetter(winnerNameToReveal, leftPadding, unrevealedTargetIndices); } else { revealLetter(box, letter, boxIndexToReveal); unrevealedTargetIndices.splice(randomIndexInUnrevealed, 1); if (unrevealedTargetIndices.length > 0) { if (revealTimeoutId) clearTimeout(revealTimeoutId); revealTimeoutId = setTimeout(() => { revealRandomLetter(winnerNameToReveal, leftPadding, unrevealedTargetIndices); }, currentRevealInterval); animationSequenceTimeoutIds.push(revealTimeoutId); } else { checkRevealCompletion(unrevealedTargetIndices); } } }
function showBoxes() { if (boxesRow) { boxesRow.classList.add('visible'); _startHackLoop(); } else { console.error("Boxes row not found!"); } }

// --- Vertical List Logic (Hybrid Approach) ---
// ... (buildList, scrollListWithRAF, createListLights, updateAllLightsVisualState, resetListState remain the same) ...
function createListLights(indicatorElement = listLightsIndicator, stateObject = listScrollState, numLights = OPTIONS.LIST_NUM_LIGHTS) {
    if (!indicatorElement) return;
    indicatorElement.innerHTML = '';
    stateObject.listLights = [];
    stateObject.numLightsCurrentlyOn = numLights;

    for (let i = 0; i < numLights; i++) {
        const light = document.createElement('div');
        light.classList.add('list-light');
        indicatorElement.appendChild(light);
        stateObject.listLights.push(light);
    }
    updateAllLightsVisualState(stateObject);
}

function updateAllLightsVisualState(stateObject = listScrollState) {
    if (!stateObject.listLights || stateObject.listLights.length === 0) return;
    const totalLights = stateObject.listLights.length;
    const lightsToDisplayOn = stateObject.numLightsCurrentlyOn;
    const lightsOffEachSide = Math.floor((totalLights - lightsToDisplayOn) / 2);
    stateObject.listLights.forEach((light, index) => {
        let shouldBeOn = (lightsToDisplayOn === 0) ? false :
                         (totalLights % 2 === 1 && lightsToDisplayOn === 1) ? (index === Math.floor(totalLights / 2)) :
                         (index >= lightsOffEachSide && index < totalLights - lightsOffEachSide);
        const isOn = light.classList.contains('on');
        if (shouldBeOn && !isOn) light.classList.remove('off', 'dim'), light.classList.add('on');
        else if (!shouldBeOn && isOn) {
            light.classList.remove('on'), light.classList.add('dim');
            setTimeout(() => { light.classList.remove('dim'), light.classList.add('off'); }, 150);
        } else if (!shouldBeOn && !light.classList.contains('dim')) light.classList.add('off');
    });
}

function resetListState() {
    console.log("Resetting List State (Hybrid)");
    if (listAnimationFrameId) { cancelAnimationFrame(listAnimationFrameId); listAnimationFrameId = null; }
    if (entrantList) {
        entrantList.innerHTML = '';
        entrantList.style.transform = 'translateY(0px)';
        entrantList.style.transition = 'none';
    }
    if (listWinnerDisplay) listWinnerDisplay.classList.remove('visible');
    if (listWinnerNameSpan) listWinnerNameSpan.textContent = '';
    if (listLightsIndicator) listLightsIndicator.innerHTML = '';

    winnerLiElement = null;
    isListScrolling = false;
    listScrollState = {
        currentTranslateY: 0, startTime: 0, lastTextUpdateTime: 0, targetTranslateY: 0, decelerationStartTime: 0,
        initialPosAtDeceleration: 0, currentPhase: 'fast-scroll',
        singleBlockHeight: 0,
        currentFastScrollDurationMs: OPTIONS.LIST_FAST_SCROLL_DURATION_MS_NORMAL,
        currentFastSpeed: OPTIONS.LIST_RAF_FAST_SPEED,
        listLights: [], numLightsCurrentlyOn: OPTIONS.LIST_NUM_LIGHTS, lightsTurnedOffThisCycle: false,
        cachedWinnerLiOffsetTop: 0, cachedWinnerLiHeight: 0, initialLightsOnAtDecel: 0,
        lastTickedItemGlobalIndex: -1,
        totalItemHeightWithMargin: 0,
        animationStartTime: 0,
    };
    canPlayTickSound = true;
}

function buildList(winnerName, allParticipants) {
    console.log(`Building list for: ${winnerName} (Hybrid approach)`);
    if (!entrantList || !listScrollContainer) { console.error("List elements missing for buildList"); return false; }

    const participantsToUse = (allParticipants && allParticipants.length > 0) ? [...allParticipants] : [..._cachedParticipantList];
    if (!participantsToUse || participantsToUse.length === 0) {
        console.warn("buildList: No participants available.");
        entrantList.innerHTML = '<li>--- NO ENTRANTS ---</li>';
        listScrollState.totalItemHeightWithMargin = 0;
        winnerLiElement = null;
        return false;
    }

    let localShuffledParticipants = shuffleArray([...participantsToUse]);
    let winnerIndexInShuffled = localShuffledParticipants.indexOf(winnerName);

    if (winnerIndexInShuffled === -1) {
        console.warn(`Winner "${winnerName}" not in provided list. Adding to local copy for build.`);
        localShuffledParticipants.push(winnerName);
        localShuffledParticipants = shuffleArray(localShuffledParticipants);
        winnerIndexInShuffled = localShuffledParticipants.indexOf(winnerName);
        if (winnerIndexInShuffled === -1) {
            console.error("CRITICAL: Winner still not found after adding and reshuffling.");
            return false;
        }
    }

    entrantList.innerHTML = '';
    winnerLiElement = null;

    const listItemHeightValue = getCssVariableValue('--list-item-height');
    const listItemMarginValue = getCssVariableValue('--list-item-margin');
    const itemHeight = parsePixels(listItemHeightValue) || 40;
    const itemMargin = parsePixels(listItemMarginValue) || 4;
    listScrollState.totalItemHeightWithMargin = itemHeight + itemMargin;

    const containerHeight = listScrollContainer.offsetHeight;
    if (containerHeight <= 0 || listScrollState.totalItemHeightWithMargin <= itemMargin) {
        console.error("List container/item height invalid.");
        return false;
    }

    const numUniqueParticipants = localShuffledParticipants.length;
    listScrollState.singleBlockHeight = numUniqueParticipants * listScrollState.totalItemHeightWithMargin;

    const itemsPerViewport = Math.ceil(containerHeight / listScrollState.totalItemHeightWithMargin);
    const targetPhysicalItemCount = Math.max(itemsPerViewport * 5, numUniqueParticipants * 3, 60);
    let numRepeats = 1;
    if (numUniqueParticipants > 0) {
        numRepeats = Math.ceil(targetPhysicalItemCount / numUniqueParticipants);
    } else {
        numRepeats = OPTIONS.LIST_MIN_REPEATS_FEW_ENTRANTS;
    }
     numRepeats = Math.max(numRepeats, (numUniqueParticipants > OPTIONS.LIST_MANY_ENTRANTS_THRESHOLD)
                            ? OPTIONS.LIST_MIN_REPEATS_MANY_ENTRANTS
                            : OPTIONS.LIST_MIN_REPEATS_FEW_ENTRANTS);


    console.log(`List Build (Hybrid): Unique=${numUniqueParticipants}, Repeats=${numRepeats}, ItemH=${listScrollState.totalItemHeightWithMargin}, TargetPhysicalItems=${targetPhysicalItemCount}`);

    const fragment = document.createDocumentFragment();
    const targetWinnerRepeat = Math.floor(numRepeats / 2);

    for (let repeat = 0; repeat < numRepeats; repeat++) {
        localShuffledParticipants.forEach((name, indexInShuffled) => {
            const li = document.createElement('li');
            li.textContent = localShuffledParticipants[indexInShuffled] || "ErrorName"; // Ensure text content
            if (indexInShuffled === winnerIndexInShuffled && repeat === targetWinnerRepeat) {
                li.classList.add('winner-target-slot');
                winnerLiElement = li;
            }
            fragment.appendChild(li);
        });
    }
    entrantList.appendChild(fragment);

    if (!winnerLiElement) {
        console.error(`CRITICAL: winnerLiElement not assigned in buildList for "${winnerName}".`);
        return false;
    }

    listScrollState.cachedWinnerLiOffsetTop = winnerLiElement.offsetTop;
    listScrollState.cachedWinnerLiHeight = winnerLiElement.offsetHeight;

    const pointerCenterY = containerHeight / 2;
    const winnerLiCenterY = listScrollState.cachedWinnerLiOffsetTop + (listScrollState.cachedWinnerLiHeight / 2);
    listScrollState.targetTranslateY = pointerCenterY - winnerLiCenterY;
    listScrollState.targetTranslateY += (Math.random() * OPTIONS.LIST_RANDOM_FINAL_OFFSET_PX * 2 - OPTIONS.LIST_RANDOM_FINAL_OFFSET_PX);

    entrantList.style.transform = 'translateY(0px)';
    void entrantList.offsetWidth;
    console.log(`List built. Target DOM element for winner: ${winnerLiElement.textContent}. Target Y: ${listScrollState.targetTranslateY.toFixed(2)}`);
    return true;
}


function scrollListWithRAF(winnerName) {
    if (!entrantList || !listScrollContainer || !listLightsIndicator) {
        console.error("scrollListWithRAF: Core list or lights elements missing.");
        callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback); return;
    }
    if (!winnerLiElement) {
        console.error("scrollListWithRAF: winnerLiElement is null. Cannot start scroll.");
        if (listWinnerNameSpan) listWinnerNameSpan.textContent = winnerName;
        if (listWinnerDisplay) listWinnerDisplay.classList.add('visible');
        callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback); return;
    }

    createListLights(listLightsIndicator, listScrollState, OPTIONS.LIST_NUM_LIGHTS);

    requestAnimationFrame(() => {
        isListScrolling = true;
        entrantList.style.transition = 'none';

        listScrollState.animationStartTime = performance.now();
        listScrollState.startTime = listScrollState.animationStartTime;
        listScrollState.lastTextUpdateTime = listScrollState.startTime;
        listScrollState.currentPhase = 'fast-scroll';
        listScrollState.decelerationStartTime = 0;
        listScrollState.currentTranslateY = 0;
        listScrollState.lightsTurnedOffThisCycle = false;
        listScrollState.lastTickedItemGlobalIndex = -1;
        canPlayTickSound = true;

        const allPhysicalLIs = Array.from(entrantList.children);
        const numPhysicalLIs = allPhysicalLIs.length;
        const containerHeight = listScrollContainer.offsetHeight;
        const pointerCenterY = containerHeight / 2;
        const itemFullHeight = listScrollState.totalItemHeightWithMargin;
        const numUniqueNames = _cachedParticipantList.length;

        const itemsPerViewportApprox = Math.ceil(containerHeight / itemFullHeight);

        function forceFinishAnimation() {
            console.log("List Animation: Forcing finish (Hybrid).");
            isListScrolling = false;
            if (listAnimationFrameId) { cancelAnimationFrame(listAnimationFrameId); listAnimationFrameId = null; }

            listScrollState.numLightsCurrentlyOn = 0;
            updateAllLightsVisualState(listScrollState);

            entrantList.style.transform = `translateY(${listScrollState.targetTranslateY}px)`;
            listScrollState.currentTranslateY = listScrollState.targetTranslateY;

            const textUpdateBufferFinal = Math.max(5, itemsPerViewportApprox);
            const finalScrollTop = -listScrollState.targetTranslateY;
            const firstFinalVisiblePhysicalIndex = Math.max(0, Math.floor(finalScrollTop / itemFullHeight) - textUpdateBufferFinal);
            const lastFinalVisiblePhysicalIndex = Math.min(numPhysicalLIs - 1, firstFinalVisiblePhysicalIndex + itemsPerViewportApprox + 2 * textUpdateBufferFinal);

            const winnerLiDomIndex = allPhysicalLIs.indexOf(winnerLiElement);
            const winnerCachedIdx = numUniqueNames > 0 ? _cachedParticipantList.indexOf(winnerName) : -1;

            allPhysicalLIs.forEach((li, index) => {
                li.classList.remove('active');
                if (li === winnerLiElement) {
                    li.textContent = winnerName;
                    li.classList.add('active');
                } else if (index >= firstFinalVisiblePhysicalIndex && index <= lastFinalVisiblePhysicalIndex) {
                    if (numUniqueNames > 0 && winnerCachedIdx !== -1 && winnerLiDomIndex !== -1) {
                        const offsetFromWinner = index - winnerLiDomIndex;
                        let nameToShowIdx = (winnerCachedIdx + offsetFromWinner) % numUniqueNames;
                        if (nameToShowIdx < 0) nameToShowIdx += numUniqueNames;
                        li.textContent = _cachedParticipantList[nameToShowIdx] || "---";
                    } else if (numUniqueNames > 0) {
                         li.textContent = _cachedParticipantList[Math.abs(index) % numUniqueNames] || "---";
                    } else {
                         li.textContent = getRandomChar() + getRandomChar();
                    }
                }
            });

            if (listWinnerNameSpan) listWinnerNameSpan.textContent = winnerName;
            if (listWinnerDisplay) listWinnerDisplay.classList.add('visible');
            const revealMode = document.querySelector('.reveal-mode.visible');
            if (revealMode) revealMode.classList.add('slide-up');
            callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
            const cdt = setTimeout(() => startCountdownPhase(), OPTIONS.COUNTDOWN_START_DELAY_AFTER_LIST_MS);
            animationSequenceTimeoutIds.push(cdt);
        }

        function step(timestamp) {
            if (!isListScrolling) return;
            const totalElapsedTime = timestamp - listScrollState.animationStartTime;
            if (totalElapsedTime >= OPTIONS.LIST_HARD_CAP_DURATION_MS) { forceFinishAnimation(); return; }

            let newTranslateY = listScrollState.currentTranslateY;
            const timeInCurrentPhase = timestamp - listScrollState.startTime;

            if (listScrollState.currentPhase === 'fast-scroll') {
                newTranslateY -= listScrollState.currentFastSpeed;
                if (timeInCurrentPhase >= listScrollState.currentFastScrollDurationMs || (OPTIONS.LIST_HARD_CAP_DURATION_MS - totalElapsedTime) <= OPTIONS.LIST_DECELERATION_DURATION_MS + 500) {
                    listScrollState.currentPhase = 'decelerating';
                    listScrollState.decelerationStartTime = timestamp;
                    listScrollState.initialPosAtDeceleration = newTranslateY;
                    listScrollState.initialLightsOnAtDecel = listScrollState.numLightsCurrentlyOn;
                } else {
                    const fastScrollProgress = timeInCurrentPhase / listScrollState.currentFastScrollDurationMs;
                    const lightsThatShouldBeOn = Math.max(0, Math.round(OPTIONS.LIST_NUM_LIGHTS * (1-fastScrollProgress)));
                    if(lightsThatShouldBeOn < listScrollState.numLightsCurrentlyOn) {
                        listScrollState.numLightsCurrentlyOn = lightsThatShouldBeOn;
                        updateAllLightsVisualState(listScrollState);
                    }
                }
            } else if (listScrollState.currentPhase === 'decelerating') {
                const elapsedDecelTime = timestamp - listScrollState.decelerationStartTime;
                const effectiveDecelDuration = Math.min(OPTIONS.LIST_DECELERATION_DURATION_MS, (OPTIONS.LIST_HARD_CAP_DURATION_MS - (listScrollState.decelerationStartTime - listScrollState.animationStartTime) - 500));
                let decelProgress = Math.min(1, elapsedDecelTime / Math.max(1, effectiveDecelDuration));
                newTranslateY = listScrollState.initialPosAtDeceleration + (listScrollState.targetTranslateY - listScrollState.initialPosAtDeceleration) * easeOutQuint(decelProgress);

                if (listScrollState.initialLightsOnAtDecel > 0) {
                    const lightsOn = Math.round(listScrollState.initialLightsOnAtDecel * (1 - decelProgress));
                     if(lightsOn < listScrollState.numLightsCurrentlyOn){
                         listScrollState.numLightsCurrentlyOn = Math.max(0, lightsOn);
                         updateAllLightsVisualState(listScrollState);
                     }
                }
                if (elapsedDecelTime >= effectiveDecelDuration || Math.abs(newTranslateY - listScrollState.targetTranslateY) < OPTIONS.LIST_TARGET_SNAP_THRESHOLD_PX) {
                    forceFinishAnimation(); return;
                }
            }

            entrantList.style.transform = `translateY(${newTranslateY}px)`;
            listScrollState.currentTranslateY = newTranslateY;

            if (timestamp - listScrollState.lastTextUpdateTime > OPTIONS.LIST_TEXT_UPDATE_INTERVAL_MS) {
                const scrollTop = -newTranslateY;
                const viewportTopEdge = scrollTop;
                const viewportBottomEdge = scrollTop + containerHeight;

                const updateWindowMargin = containerHeight * 1.5;
                const updateWindowTop = viewportTopEdge - updateWindowMargin;
                const updateWindowBottom = viewportBottomEdge + updateWindowMargin;

                const winnerLiDomIndex = allPhysicalLIs.indexOf(winnerLiElement);
                const winnerCachedIdx = numUniqueNames > 0 ? _cachedParticipantList.indexOf(winnerName) : -1;

                allPhysicalLIs.forEach((li, physicalIndex) => {
                    const itemTop = physicalIndex * itemFullHeight;
                    const itemBottom = itemTop + itemFullHeight;

                    if (li === winnerLiElement && listScrollState.currentPhase === 'decelerating') {
                        li.textContent = winnerName;
                    } else if (itemBottom >= updateWindowTop && itemTop <= updateWindowBottom) {
                        if (numUniqueNames > 0) {
                            if (listScrollState.currentPhase === 'decelerating' && winnerCachedIdx !== -1 && winnerLiDomIndex !== -1) {
                                const offsetFromWinner = physicalIndex - winnerLiDomIndex;
                                let nameToShowIdx = (winnerCachedIdx + offsetFromWinner) % numUniqueNames;
                                if (nameToShowIdx < 0) nameToShowIdx += numUniqueNames;
                                li.textContent = _cachedParticipantList[nameToShowIdx] || "---";
                            } else {
                                li.textContent = _cachedParticipantList[Math.floor(Math.random() * numUniqueNames)] || "---";
                            }
                        } else {
                            li.textContent = getRandomChar() + getRandomChar() + "X";
                        }
                    } else {
                        if (!li.textContent || li.textContent.length < 2) {
                            if (numUniqueNames > 0) {
                                li.textContent = _cachedParticipantList[physicalIndex % numUniqueNames] || "Name";
                            } else {
                                li.textContent = getRandomChar();
                            }
                        }
                    }
                });
                listScrollState.lastTextUpdateTime = timestamp;
            }

            const currentItemPhysicalIndex = Math.floor(((-newTranslateY + pointerCenterY - itemFullHeight/2) / itemFullHeight));
            if (currentItemPhysicalIndex !== listScrollState.lastTickedItemGlobalIndex && canPlayTickSound) {
                if (OPTIONS.LIST_TICK_SOUND_KEY) { callPythonBackend('jsRequestSound', OPTIONS.LIST_TICK_SOUND_KEY); canPlayTickSound = false; setTimeout(() => { canPlayTickSound = true; }, tickSoundDebounceDelay); }
                listScrollState.lastTickedItemGlobalIndex = currentItemPhysicalIndex;
            }

            listAnimationFrameId = requestAnimationFrame(step);
        }
        listAnimationFrameId = requestAnimationFrame(step);
        animationSequenceTimeoutIds.push(listAnimationFrameId);
    });
}

// --- Triglavian Translation Logic ---
// ... (resetTriglavianState, createTriglavianBoxes, cycleTriglavianChars, pulseTriglavianBox, startTriglavianReveal, checkRevealCompletionTriglavian, showTriglavianBoxes remain same) ...
function resetTriglavianState() { console.log("Resetting Triglavian State"); if (triglavianCyclingIntervalId) clearInterval(triglavianCyclingIntervalId); triglavianCyclingIntervalId = null; if (triglavianRevealTimeoutId) clearTimeout(triglavianRevealTimeoutId); triglavianRevealTimeoutId = null; Object.values(trigTempRevealTimeouts).forEach(clearTimeout); trigTempRevealTimeouts = {}; triglavianBoxes.forEach(box => { if (box) { box.classList.remove('box-pulse', 'showing-reveal'); box.textContent = ''; } }); if(triglavianWinnerNameSpan) triglavianWinnerNameSpan.innerHTML = ''; if(triglavianWinnerDisplay) triglavianWinnerDisplay.classList.remove('visible', 'standalone'); if(triglavianBoxesRow) triglavianBoxesRow.classList.remove('visible'); trigRevealSequence = []; trigRevealedLetters = []; }
function createTriglavianBoxes() { 
    console.log("🔧 createTriglavianBoxes() called");
    if (!triglavianBoxesRow) { 
        console.error("🚨 createTriglavianBoxes: triglavianBoxesRow is null/undefined!"); 
        return; 
    }
    console.log(`🔧 createTriglavianBoxes: Current triglavianBoxes.length: ${triglavianBoxes.length}, expected: ${OPTIONS.TRIG_BOX_COUNT}`);
    if (triglavianBoxes.length !== OPTIONS.TRIG_BOX_COUNT) { 
        console.log("🔧 createTriglavianBoxes: Recreating boxes...");
        triglavianBoxesRow.innerHTML = ''; 
        triglavianBoxes = []; 
        for (let i = 0; i < OPTIONS.TRIG_BOX_COUNT; i++) { 
            const box = document.createElement('div'); 
            box.classList.add('triglavian-box'); 
            box.id = `trig-box-${i}`; 
            triglavianBoxesRow.appendChild(box); 
            triglavianBoxes.push(box); 
        } 
        console.log(`✅ createTriglavianBoxes: Created ${OPTIONS.TRIG_BOX_COUNT} Triglavian boxes.`); 
    } else {
        console.log("✅ createTriglavianBoxes: Triglavian boxes already exist");
    }
}
function cycleTriglavianChars() {
    // Debug: log cycling
    console.log('[Triglavian] cycleTriglavianChars called', Date.now());
    if (!bodyElement.classList.contains('show-triglavian')) {
        if (triglavianCyclingIntervalId) { clearInterval(triglavianCyclingIntervalId); cyclingIntervalId = null; }
        return;
    }
    if (triglavianBoxesRow && !triglavianBoxesRow.classList.contains('visible')) {
        triglavianBoxesRow.classList.add('visible');
    }
    if (triglavianBoxes.length !== OPTIONS.TRIG_BOX_COUNT) return;
    triglavianBoxes.forEach((box) => {
        if (box && !box.classList.contains('showing-reveal')) {
            box.textContent = getRandomTrigGlyph();
        }
    });
}
function pulseTriglavianBox(boxElement, duration = OPTIONS.TRIG_PULSE_DURATION_MS) { if (boxElement) { boxElement.classList.remove('box-pulse'); void boxElement.offsetWidth; boxElement.classList.add('box-pulse'); setTimeout(() => { if (boxElement) boxElement.classList.remove('box-pulse'); }, duration); } }
function startTriglavianReveal(winnerName, revealIntervalMs) {
    console.log(`Starting Triglavian reveal for: ${winnerName} with interval ${revealIntervalMs}ms`);
    if (!triglavianWinnerNameSpan || !triglavianWinnerDisplay || !triglavianBoxes || triglavianBoxes.length === 0 || !triglavianBoxesRow) {
        console.error("Triglavian elements not found. Aborting.");
        checkRevealCompletionTriglavian(winnerName);
        return;
    }
    const upperCaseWinner = winnerName.toUpperCase();
    const letterCounts = {};
    const nameLength = upperCaseWinner.length;
    trigRevealSequence = [];
    if (nameLength === 0) {
        console.warn("Triglavian reveal: Winner name empty.");
        checkRevealCompletionTriglavian(winnerName);
        return;
    }
    for (let i = 0; i < nameLength; i++) {
        const letter = upperCaseWinner[i];
        if (!letterCounts[letter]) letterCounts[letter] = 0;
        letterCounts[letter]++;
        trigRevealSequence.push({ index: i, letter: letter });
    }
    trigRevealSequence.sort((a, b) => letterCounts[b.letter] - letterCounts[a.letter] || a.index - b.index);
    console.log("Triglavian Reveal Sequence (Freq Ordered):", trigRevealSequence.map(item => item.letter + '@' + item.index));
    trigRevealedLetters = Array(nameLength).fill(OPTIONS.TRIG_PLACEHOLDER_CHAR);
    triglavianWinnerNameSpan.innerHTML = trigRevealedLetters.join('');
    triglavianWinnerNameSpan.classList.remove('revealed');
    triglavianWinnerDisplay.classList.add('visible');
    if (triglavianRevealTimeoutId) clearTimeout(triglavianRevealTimeoutId);
    triglavianRevealTimeoutId = null;
    Object.values(trigTempRevealTimeouts).forEach(clearTimeout);
    trigTempRevealTimeouts = {};
    if (triglavianCyclingIntervalId) clearInterval(triglavianCyclingIntervalId);
    triglavianCyclingIntervalId = null;

    function revealNextLetterFrequency() {
        if (trigRevealSequence.length === 0) {
            console.log("Triglavian frequency reveal complete.");
            checkRevealCompletionTriglavian();
            return;
        }
        const itemToReveal = trigRevealSequence.shift();
        if (!itemToReveal) {
            console.error("Shifted undefined item.");
            checkRevealCompletionTriglavian();
            return;
        }
        const { index, letter } = itemToReveal;
        const availablePingIndices = triglavianBoxes.map((box, idx) => (box && !box.classList.contains('showing-reveal')) ? idx : -1).filter(idx => idx !== -1);
        const pingBoxIndex = availablePingIndices.length > 0 ? availablePingIndices[getRandomInt(0, availablePingIndices.length - 1)] : getRandomInt(0, triglavianBoxes.length - 1);
        const pingBox = triglavianBoxes[pingBoxIndex];
        if(pingBox) {
            pulseTriglavianBox(pingBox, OPTIONS.TRIG_SCAN_PING_DURATION_MS);
        }
        const revealDelayTimeout = setTimeout(() => {
            trigRevealedLetters[index] = letter;
            triglavianWinnerNameSpan.innerHTML = trigRevealedLetters.join('');
            const availableRevealIndices = triglavianBoxes.map((box, idx) => (box && idx !== pingBoxIndex && !box.classList.contains('showing-reveal')) ? idx : -1).filter(idx => idx !== -1);
            let revealBoxIndex = availableRevealIndices.length > 0 ? availableRevealIndices[getRandomInt(0, availableRevealIndices.length - 1)] : (pingBoxIndex + 1) % triglavianBoxes.length;
            const revealBox = triglavianBoxes[revealBoxIndex];
            if (revealBox) {
                if (trigTempRevealTimeouts[revealBoxIndex]) {
                    clearTimeout(trigTempRevealTimeouts[revealBoxIndex]);
                    revealBox.classList.remove('showing-reveal');
                    revealBox.textContent = '';
                }
                revealBox.classList.add('showing-reveal');
                revealBox.textContent = letter;
                revealBox.style.backgroundColor = '';
                // --- Spark effect ---
                const sparkCount = 8;
                const sparksContainer = document.createElement('div');
                sparksContainer.className = 'triglavian-sparks';
                for (let s = 0; s < sparkCount; s++) {
                    const spark = document.createElement('div');
                    spark.className = 'triglavian-spark';
                    // Random direction and distance
                    const angle = (2 * Math.PI * s) / sparkCount + (Math.random() - 0.5) * 0.3;
                    const dist = 22 + Math.random() * 10;
                    const x = Math.cos(angle) * dist;
                    const y = Math.sin(angle) * dist;
                    const rot = (angle * 180 / Math.PI + 90) + (Math.random() - 0.5) * 40;
                    spark.style.setProperty('--spark-x', `${x.toFixed(1)}px`);
                    spark.style.setProperty('--spark-y', `${y.toFixed(1)}px`);
                    spark.style.setProperty('--spark-rot', `${rot.toFixed(1)}deg`);
                    sparksContainer.appendChild(spark);
                }
                revealBox.appendChild(sparksContainer);
                // --- End spark effect ---
                pulseTriglavianBox(revealBox, OPTIONS.TRIG_PULSE_DURATION_MS);
                callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
                if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.notifyGenericReveal === 'function')
                    NetworkAnimation.notifyGenericReveal(revealBox);
                const clearDelay = OPTIONS.TRIG_PULSE_DURATION_MS + OPTIONS.TRIG_TEMP_REVEAL_CLEAR_DELAY_MS;
                trigTempRevealTimeouts[revealBoxIndex] = setTimeout(() => {
                    if (revealBox) {
                        revealBox.classList.remove('showing-reveal');
                        revealBox.textContent = '';
                        // Remove sparks
                        const sparks = revealBox.querySelectorAll('.triglavian-sparks');
                        sparks.forEach(s => s.remove());
                    }
                    delete trigTempRevealTimeouts[revealBoxIndex];
                }, clearDelay);
            } else {
                console.warn("Could not find revealBox for index:", revealBoxIndex);
            }
            triglavianRevealTimeoutId = setTimeout(revealNextLetterFrequency, revealIntervalMs);
            animationSequenceTimeoutIds.push(triglavianRevealTimeoutId);
        }, OPTIONS.TRIG_SCAN_PING_DELAY_BEFORE_REVEAL_MS);
        animationSequenceTimeoutIds.push(revealDelayTimeout);
    }
    const startTimeout = setTimeout(revealNextLetterFrequency, OPTIONS.TRIG_REVEAL_START_DELAY_MS);
    animationSequenceTimeoutIds.push(startTimeout);
}
function checkRevealCompletionTriglavian() {
    console.log("Triglavian Reveal Sequence Complete.");
    if (triglavianRevealTimeoutId) clearTimeout(triglavianRevealTimeoutId);
    triglavianRevealTimeoutId = null;
    Object.values(trigTempRevealTimeouts).forEach(clearTimeout);
    trigTempRevealTimeouts = {};
    if (triglavianWinnerNameSpan) {
        if (triglavianWinnerNameSpan.textContent !== currentWinnerNameForCallback.toUpperCase()) {
            triglavianWinnerNameSpan.textContent = currentWinnerNameForCallback.toUpperCase();
        }
        triglavianWinnerNameSpan.classList.add('revealed');
    }
    if (triglavianWinnerDisplay) triglavianWinnerDisplay.classList.add('revealed');
    if (triglavianRevealMode) triglavianRevealMode.classList.add('slide-up');
    const countdownStartTimeoutId = setTimeout(() => {
        startCountdownPhase();
    }, OPTIONS.COUNTDOWN_START_DELAY_AFTER_TRIG_MS);
    animationSequenceTimeoutIds.push(countdownStartTimeoutId);
    console.log(`JS checkRevealCompletionTriglavian: Sending original name back: '${currentWinnerNameForCallback}'`);
    callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
}
function showTriglavianBoxes() { if (triglavianBoxesRow) { triglavianBoxesRow.classList.add('visible'); } else { console.error("Triglavian boxes row not found!"); } }


// --- Node Path Reveal Logic (Mode 6) ---
// ... (resetNodePathState, createNodePathGrid, generateNodePath, createPathLines, revealVowelsInDisplay, startNodePathReveal, checkRevealCompletionNodePath remain same) ...
function _calculateAndStoreNodeCenters() { if (!nodePathGridContainer || nodeGrid.length === 0) return false; const containerRect = nodePathGridContainer.getBoundingClientRect(); if (containerRect.width === 0 || containerRect.height === 0) return false; const numRows = nodeGrid.length; const numCols = nodeGrid[0].length; for (let r = 0; r < numRows; r++) { for (let c = 0; c < numCols; c++) { const nodeData = nodeGrid[r]?.[c]; if (nodeData?.element) { const nodeElement = nodeData.element; const rect = nodeElement.getBoundingClientRect(); nodeData.center = { x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top + rect.height / 2 }; } } } return true; }
function resetNodePathState() { console.log("Resetting Node Path State"); if (nodePathGridContainer) { nodePathGridContainer.innerHTML = ''; nodePathGridContainer.classList.remove('visible'); nodePathGridContainer.style.gridTemplateColumns = ''; nodePathGridContainer.style.gridTemplateRows = ''; } if (nodePathWinnerDisplay) nodePathWinnerDisplay.classList.remove('visible'); if (nodePathWinnerNameSpan) nodePathWinnerNameSpan.textContent = ''; if (nodePathRevealTimeoutId) clearTimeout(nodePathRevealTimeoutId); nodePathRevealTimeoutId = null; if (nodePathActiveNodeTimeoutId) clearTimeout(nodePathActiveNodeTimeoutId); nodePathActiveNodeTimeoutId = null; const nodeLockLabel = document.getElementById('node-path-lock-label'); if (nodeLockLabel) nodeLockLabel.classList.remove('visible'); nodeGrid = []; nodePathLines = {}; currentPath = []; nodePathSvgOverlay = null; nodePathGenerationAttempts = 0; nodePathWinnerDisplayState = []; }
function createNodePathGrid() { if (!nodePathGridContainer) { console.error("Node Path Grid Container not found!"); return false; } resetNodePathState(); const containerWidth = nodePathGridContainer.offsetWidth; const containerHeight = nodePathGridContainer.offsetHeight; if (containerWidth <= 0 || containerHeight <= 0) { console.error("Node Path Grid Container has no dimensions yet."); return false; } const nodeSize = parseVmin(getCssVariableValue('--node-path-node-size')) || 20; const gap = parseVmin(getCssVariableValue('--node-path-grid-gap')) || 5; const nodePlusGap = nodeSize + gap; const numCols = Math.max(3, Math.floor((containerWidth - gap) / nodePlusGap)); const numRows = Math.max(4, Math.floor((containerHeight - gap) / nodePlusGap)); console.log(`Creating Node Grid: ${numCols} cols x ${numRows} rows (NodeSize: ${nodeSize}px, Gap: ${gap}px)`); nodePathGridContainer.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`; nodePathGridContainer.style.gridTemplateRows = `repeat(${numRows}, 1fr)`; nodeGrid = []; const fragment = document.createDocumentFragment(); for (let r = 0; r < numRows; r++) { nodeGrid[r] = []; for (let c = 0; c < numCols; c++) { const nodeElement = document.createElement('div'); nodeElement.classList.add('node-path-node'); nodeElement.dataset.row = r; nodeElement.dataset.col = c; fragment.appendChild(nodeElement); nodeGrid[r][c] = { element: nodeElement, row: r, col: c, center: null }; } } nodePathGridContainer.appendChild(fragment); nodePathSvgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg"); nodePathSvgOverlay.classList.add('node-path-svg-overlay'); nodePathSvgOverlay.setAttribute('width', '100%'); nodePathSvgOverlay.setAttribute('height', '100%'); nodePathGridContainer.appendChild(nodePathSvgOverlay); requestAnimationFrame(() => { _calculateAndStoreNodeCenters(); }); return true; }
function generateNodePath() { if (nodeGrid.length === 0 || nodeGrid[0].length === 0) { console.error("Cannot generate path, grid not initialized."); return false; } if (nodePathGenerationAttempts >= OPTIONS.NODE_PATH_MAX_PATH_ATTEMPTS) { console.error("Max path generation attempts reached. Failing."); return false; } nodePathGenerationAttempts++; const numRows = nodeGrid.length; const numCols = nodeGrid[0].length; const visited = new Set(); currentPath = []; let startCol = getRandomInt(0, numCols - 1); let currentRow = 0; let currentCol = startCol; currentPath.push({ row: currentRow, col: currentCol }); visited.add(`${currentRow},${currentCol}`); let attempts = 0; const maxAttempts = numRows * numCols * 2; while (attempts < maxAttempts) { attempts++; let possibleMoves = []; const candidates = [ { dr: 1, dc: 0 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 } ]; for (const move of candidates) { const nextRow = currentRow + move.dr; const nextCol = currentCol + move.dc; if (nextRow >= 0 && nextRow < numRows && nextCol >= 0 && nextCol < numCols) { if (!visited.has(`${nextRow},${nextCol}`)) { possibleMoves.push({ row: nextRow, col: nextCol, priority: move.dr }); } } } if (possibleMoves.length === 0) { console.log("Path generation stuck, ending path."); break; } possibleMoves.sort((a, b) => b.priority - a.priority || Math.random() - 0.5); const nextNode = possibleMoves[0]; currentRow = nextNode.row; currentCol = nextNode.col; currentPath.push({ row: currentRow, col: currentCol }); visited.add(`${currentRow},${currentCol}`); if (currentRow === numRows - 1 && currentPath.length >= OPTIONS.NODE_PATH_MIN_PATH_LENGTH) { console.log("Path reached bottom row."); break; } if(currentPath.length >= OPTIONS.NODE_PATH_MIN_PATH_LENGTH && possibleMoves.every(m => m.priority === 0)) { if(Math.random() < 0.3) { console.log("Path ending early based on length and available moves."); break; } } } if (currentPath.length < OPTIONS.NODE_PATH_MIN_PATH_LENGTH && attempts < maxAttempts) { console.warn(`Generated path too short (${currentPath.length}). Retrying (Attempt ${nodePathGenerationAttempts}).`); return generateNodePath(); } if (attempts >= maxAttempts) { console.error("Max attempts reached during path generation."); } console.log(`Generated Path (${currentPath.length} nodes):`, currentPath.map(n => `(${n.row},${n.col})`).join(' -> ')); _calculateAndStoreNodeCenters(); createPathLines(); return true; }
function createPathLines() { if (!nodePathSvgOverlay || currentPath.length < 2) { console.warn("Node Path: Cannot create path lines."); return; } nodePathSvgOverlay.innerHTML = ''; nodePathLines = {}; for (let i = 0; i < currentPath.length - 1; i++) { const node1Coords = currentPath[i]; const node2Coords = currentPath[i + 1]; const data1 = nodeGrid[node1Coords.row]?.[node1Coords.col]; const data2 = nodeGrid[node2Coords.row]?.[node2Coords.col]; if (data1?.center && data2?.center) { const line = document.createElementNS("http://www.w3.org/2000/svg", "line"); line.setAttribute('x1', data1.center.x); line.setAttribute('y1', data1.center.y); line.setAttribute('x2', data2.center.x); line.setAttribute('y2', data2.center.y); line.classList.add('node-path-line'); const lineKey = `${node1Coords.row}c${node1Coords.col}-${node2Coords.row}c${node2Coords.col}`; nodePathLines[lineKey] = line; nodePathSvgOverlay.appendChild(line); } else { console.warn(`Node Path: Missing center data for line between (${node1Coords.row},${node1Coords.col}) and (${node2Coords.row},${node2Coords.col})`); } } }
function revealVowelsInDisplay(winnerNameUpper) { const vowels = "AEIOU"; for(let i = 0; i < winnerNameUpper.length; i++) { if (vowels.includes(winnerNameUpper[i])) { nodePathWinnerDisplayState[i] = winnerNameUpper[i]; } } if (nodePathWinnerNameSpan) { nodePathWinnerNameSpan.textContent = nodePathWinnerDisplayState.join(''); } console.log("Node Path: Vowels revealed."); }
function startNodePathReveal(winnerName) { console.log("Starting Node Path Reveal for:", winnerName); if (!nodePathGridContainer || !nodePathWinnerDisplay || !nodePathWinnerNameSpan) { console.error("Node path elements missing."); checkRevealCompletionNodePath(winnerName); return; } if (!createNodePathGrid()) { console.error("Failed to create node path grid."); checkRevealCompletionNodePath(winnerName); return; } const winnerNameUpper = winnerName.toUpperCase(); const winnerNameLength = winnerNameUpper.length; nodePathWinnerDisplayState = Array(winnerNameLength).fill(OPTIONS.NODE_PATH_PLACEHOLDER_CHAR); nodePathWinnerDisplay.classList.remove('visible'); if (nodePathWinnerNameSpan) nodePathWinnerNameSpan.textContent = nodePathWinnerDisplayState.join(''); nodePathGridContainer.classList.add('visible'); setTimeout(() => { nodeGrid.flat().forEach(nodeData => nodeData?.element?.classList.add('visible')); }, 50); setTimeout(() => { nodePathGenerationAttempts = 0; if (!generateNodePath() || currentPath.length < 2) { console.error("Failed to generate valid node path."); checkRevealCompletionNodePath(winnerName); return; } let step = 0; let previousNodeElement = null; const stepDuration = currentNodePathStepDuration; const midPointIndex = Math.floor(currentPath.length / 2); console.log(`Node Path: Starting reveal. Step duration: ${stepDuration}ms. Path length: ${currentPath.length}. Midpoint: ${midPointIndex}`); if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.resetRevealState === 'function') { NetworkAnimation.resetRevealState(); } function revealNextStep() { if (step >= currentPath.length) { if (nodePathRevealTimeoutId) { checkRevealCompletionNodePath(winnerName); } nodePathRevealTimeoutId = null; return; } const nodeCoords = currentPath[step]; const nodeData = nodeGrid[nodeCoords.row]?.[nodeCoords.col]; if (!nodeData || !nodeData.element) { console.error(`Node data not found for step ${step}. Stopping.`); checkRevealCompletionNodePath(winnerName); return; } const currentNodeElement = nodeData.element; const isMidpoint = (step === midPointIndex); let nextStepDelay = stepDuration; if (nodePathActiveNodeTimeoutId) clearTimeout(nodePathActiveNodeTimeoutId); if (previousNodeElement) { previousNodeElement.classList.remove('active', 'vowel-reveal-node'); } currentNodeElement.classList.add('path', 'active'); if (step === currentPath.length - 1) currentNodeElement.classList.add('target'); if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.notifyGenericReveal === 'function') NetworkAnimation.notifyGenericReveal(currentNodeElement); if (step > 0) { const prevCoords = currentPath[step - 1]; const lineKey = `${prevCoords.row}c${prevCoords.col}-${nodeCoords.row}c${nodeCoords.col}`; const reverseLineKey = `${nodeCoords.row}c${nodeCoords.col}-${prevCoords.row}c${prevCoords.col}`; const lineElement = nodePathLines[lineKey] || nodePathLines[reverseLineKey]; if (lineElement) requestAnimationFrame(() => { lineElement.classList.add('visible'); }); } callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY); if (isMidpoint) { console.log(`Node Path: Midpoint (Step ${step}). Vowel reveal & pause.`); currentNodeElement.classList.add('vowel-reveal-node'); revealVowelsInDisplay(winnerNameUpper); if (nodePathWinnerDisplay) nodePathWinnerDisplay.classList.add('visible'); nextStepDelay += OPTIONS.NODE_PATH_MIDPOINT_PAUSE_MS; } else { currentNodeElement.classList.remove('vowel-reveal-node'); } nodePathActiveNodeTimeoutId = setTimeout(() => { currentNodeElement.classList.remove('active'); }, stepDuration * 1.5); animationSequenceTimeoutIds.push(nodePathActiveNodeTimeoutId); previousNodeElement = currentNodeElement; step++; if (step < currentPath.length) { nodePathRevealTimeoutId = setTimeout(revealNextStep, nextStepDelay); animationSequenceTimeoutIds.push(nodePathRevealTimeoutId); } else { nodePathRevealTimeoutId = setTimeout(() => checkRevealCompletionNodePath(winnerName), nextStepDelay); animationSequenceTimeoutIds.push(nodePathRevealTimeoutId); } } const revealStartTimeout = setTimeout(revealNextStep, OPTIONS.NODE_PATH_REVEAL_START_DELAY_MS); animationSequenceTimeoutIds.push(revealStartTimeout); }, OPTIONS.NODE_PATH_GRID_APPEAR_DELAY_MS); }
function checkRevealCompletionNodePath(winnerName = "Unknown") { console.log("Node Path Reveal Complete."); if (nodePathRevealTimeoutId) clearTimeout(nodePathRevealTimeoutId); nodePathRevealTimeoutId = null; if (nodePathActiveNodeTimeoutId) clearTimeout(nodePathActiveNodeTimeoutId); nodePathActiveNodeTimeoutId = null;
    // Mark target node; store coords for ripple origin
    let targetRow = -1, targetCol = -1;
    if (currentPath.length > 0) { const lastCoords = currentPath[currentPath.length - 1]; targetRow = lastCoords.row; targetCol = lastCoords.col; const lastNodeData = nodeGrid[targetRow]?.[targetCol]; if (lastNodeData?.element) { lastNodeData.element.classList.remove('active', 'vowel-reveal-node'); lastNodeData.element.classList.add('target'); } }
    const pathCoordSet = new Set(currentPath.map(c => `${c.row},${c.col}`));
    // Phase 1 (t=0): ripple-dark outward from target on all non-path nodes
    if (targetRow >= 0) { for (let r = 0; r < nodeGrid.length; r++) { for (let c = 0; c < (nodeGrid[r]?.length || 0); c++) { if (!pathCoordSet.has(`${r},${c}`)) { const dist = Math.abs(r - targetRow) + Math.abs(c - targetCol); const nodeEl = nodeGrid[r]?.[c]?.element; if (nodeEl) { const rt = setTimeout(() => { nodeEl.classList.add('ripple-dark'); }, Math.min(dist * 30, 600)); animationSequenceTimeoutIds.push(rt); } } } } }
    // Phase 2 (t=200ms): all path nodes + lines burst white - lock flash
    const lockFlashTimeout = setTimeout(() => { currentPath.forEach(coords => { const nodeEl = nodeGrid[coords.row]?.[coords.col]?.element; if (nodeEl) nodeEl.classList.add('locked'); }); for (const lk in nodePathLines) { if (nodePathLines[lk]) nodePathLines[lk].classList.add('locked'); } }, 200);
    animationSequenceTimeoutIds.push(lockFlashTimeout);
    // Phase 3 (t=380ms): LOCK ESTABLISHED label appears
    const lockLabel = document.getElementById('node-path-lock-label');
    const showLabelTimeout = setTimeout(() => { if (lockLabel) lockLabel.classList.add('visible'); }, 380);
    animationSequenceTimeoutIds.push(showLabelTimeout);
    // Phase 4 (t=1550ms): hide label
    const hideLabelTimeout = setTimeout(() => { if (lockLabel) lockLabel.classList.remove('visible'); }, 1550);
    animationSequenceTimeoutIds.push(hideLabelTimeout);
    // Phase 5 (t=1750ms): show winner display
    const showWinnerTimeout = setTimeout(() => { if (!nodePathWinnerDisplay) return; if (nodePathWinnerNameSpan) nodePathWinnerNameSpan.textContent = winnerName.toUpperCase(); nodePathWinnerDisplay.classList.add('visible'); requestAnimationFrame(() => { if (_calculateAndStoreNodeCenters()) { for (const lineKey in nodePathLines) { const lineElement = nodePathLines[lineKey]; if (lineElement) { const [node1Str, node2Str] = lineKey.split('-'); const [r1, c1] = node1Str.replace('c', ',').split(',').map(Number); const [r2, c2] = node2Str.replace('c', ',').split(',').map(Number); const data1 = nodeGrid[r1]?.[c1]; const data2 = nodeGrid[r2]?.[c2]; if (data1?.center && data2?.center) { lineElement.setAttribute('x1', data1.center.x); lineElement.setAttribute('y1', data1.center.y); lineElement.setAttribute('x2', data2.center.x); lineElement.setAttribute('y2', data2.center.y); } } } } const revealMode = document.querySelector('.reveal-mode.visible'); if (revealMode) revealMode.classList.add('slide-up'); callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback); const countdownStartDelay = parseFloat(getCssVariableValue('--countdown-start-delay-after-node-path-ms')) || OPTIONS.COUNTDOWN_START_DELAY_AFTER_NODE_PATH_MS; const countdownStartTimeoutId = setTimeout(() => { startCountdownPhase(); }, countdownStartDelay); animationSequenceTimeoutIds.push(countdownStartTimeoutId); }); }, 1750);
    animationSequenceTimeoutIds.push(showWinnerTimeout);
}


// --- Triglavian Conduit Logic (Mode 7) ---
// ... (resetTrigConduitState, createTriglavianConduitNodes, startTriglavianConduitAnimation, checkRevealCompletionTrigConduit remain same) ...
function resetTrigConduitState() {
    console.log("Resetting Triglavian Conduit State");
    stopConduitAtmosphere();
    if (trigConduitIntervalId) { clearInterval(trigConduitIntervalId); trigConduitIntervalId = null; }
    Object.values(trigConduitScrambleIntervals).forEach(clearInterval);
    trigConduitScrambleIntervals = {};
    trigConduitNodes = [];
    trigConduitRevealPath = [];
    trigConduitNamePlaceholders = [];
    if (trigConduitNodesContainer) {
        trigConduitNodesContainer.innerHTML = '';
        trigConduitNodesContainer.classList.remove('visible', 'final-pulse-effect');
    }
    trigConduitSvgOverlay = null;
    trigConduitCore = null;
    if (trigConduitWinnerNameSpan) {
        trigConduitWinnerNameSpan.innerHTML = '';
        trigConduitWinnerNameSpan.classList.remove('revealed');
    }
    if (trigConduitWinnerDisplay) trigConduitWinnerDisplay.classList.remove('visible');
    updateConduitHUD(0, OPTIONS.TRIG_CONDUIT_NODE_COUNT, null);
}

// ── Conduit Atmosphere ─────────────────────────────────────────────────────

function initConduitAtmosphere() {
    conduitStarfieldCanvas = document.getElementById('conduit-starfield-canvas');
    if (!conduitStarfieldCanvas) return;
    const modeEl = document.getElementById('trig-conduit-reveal-mode');
    if (modeEl) {
        conduitStarfieldCanvas.width  = modeEl.offsetWidth  || 800;
        conduitStarfieldCanvas.height = modeEl.offsetHeight || 500;
    }
    conduitStarfieldCtx = conduitStarfieldCanvas.getContext('2d');
    conduitStars = [];
    const W = conduitStarfieldCanvas.width;
    const H = conduitStarfieldCanvas.height;
    for (let i = 0; i < 140; i++) {
        conduitStars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.3 + 0.3,
            baseAlpha: Math.random() * 0.55 + 0.15,
            speed: Math.random() * 0.6 + 0.15,
            phase: Math.random() * Math.PI * 2
        });
    }
    if (conduitStarfieldAnimId) cancelAnimationFrame(conduitStarfieldAnimId);
    conduitStarfieldAnimId = requestAnimationFrame(_drawConduitAtmosphereFrame);
}

function _drawConduitAtmosphereFrame(ts) {
    if (!conduitStarfieldCtx || !conduitStarfieldCanvas) return;
    const ctx = conduitStarfieldCtx;
    const W = conduitStarfieldCanvas.width;
    const H = conduitStarfieldCanvas.height;
    ctx.clearRect(0, 0, W, H);

    // Nebula gradients
    const cx = W * 0.5, cy = H * 0.5;
    const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.48);
    g1.addColorStop(0,   'rgba(0, 180, 220, 0.07)');
    g1.addColorStop(0.5, 'rgba(0,  80, 180, 0.04)');
    g1.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.22);
    g2.addColorStop(0,   'rgba(200, 90, 30, 0.06)');
    g2.addColorStop(0.6, 'rgba(180, 50, 10, 0.025)');
    g2.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    const ox = W * 0.3, oy = H * 0.35;
    const g3 = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.min(W, H) * 0.28);
    g3.addColorStop(0,   'rgba(0, 220, 200, 0.04)');
    g3.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, W, H);

    // Stars
    const t = ts * 0.001;
    conduitStars.forEach(s => {
        const alpha = s.baseAlpha * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 230, 255, ${alpha.toFixed(3)})`;
        ctx.fill();
    });

    conduitStarfieldAnimId = requestAnimationFrame(_drawConduitAtmosphereFrame);
}

function stopConduitAtmosphere() {
    if (conduitStarfieldAnimId) {
        cancelAnimationFrame(conduitStarfieldAnimId);
        conduitStarfieldAnimId = null;
    }
    if (conduitStarfieldCtx && conduitStarfieldCanvas) {
        conduitStarfieldCtx.clearRect(0, 0, conduitStarfieldCanvas.width, conduitStarfieldCanvas.height);
    }
    conduitStars = [];
}

function updateConduitHUD(chargedCount, totalNodes, winnerName) {
    const nodesEl  = document.getElementById('cdp-nodes');
    const statusEl = document.getElementById('cdp-status');
    const targetEl = document.getElementById('cdp-target');

    if (nodesEl)  nodesEl.textContent  = `${chargedCount} / ${totalNodes}`;

    if (statusEl) {
        const pct = Math.round((chargedCount / totalNodes) * 100);
        if (chargedCount === 0) {
            statusEl.textContent = 'ENERGISING';
            statusEl.style.color = '';
        } else if (chargedCount < totalNodes) {
            statusEl.textContent = `CHARGING  ${pct}%`;
            statusEl.style.color = '#ff8c42';
        } else {
            statusEl.textContent = 'CONDUIT STABLE';
            statusEl.style.color = '#00ffcc';
        }
    }

    if (targetEl) {
        if (winnerName) {
            targetEl.textContent = winnerName.toUpperCase();
            targetEl.style.color = '#00ffcc';
        } else if (chargedCount === 0) {
            targetEl.textContent = 'ACQUIRING...';
            targetEl.style.color = '';
        } else {
            targetEl.textContent = 'LOCKED';
            targetEl.style.color = '#ff8c42';
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────

function createTriglavianConduitNodes() {
    if (!trigConduitNodesContainer) { console.error("Trig Conduit nodes container not found!"); return false; }
    trigConduitNodesContainer.innerHTML = '';
    trigConduitNodes = [];

    // NEW: Create SVG overlay for lines
    trigConduitSvgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    trigConduitSvgOverlay.classList.add('trig-conduit-svg-overlay');
    trigConduitNodesContainer.appendChild(trigConduitSvgOverlay);

    const numNodes = OPTIONS.TRIG_CONDUIT_NODE_COUNT;
    const containerSize = trigConduitNodesContainer.offsetWidth;
    const radius = containerSize / 2.8;
    const angleStep = (2 * Math.PI) / numNodes;
    const nodeSize = parseVmin(getCssVariableValue('--trig-conduit-node-size')) || 40;

    for (let i = 0; i < numNodes; i++) {
        const node = document.createElement('div');
        node.classList.add('trig-conduit-node');
        node.id = `trig-conduit-node-${i}`;

        const angle = i * angleStep - (Math.PI / 2);
        const centerX = (containerSize / 2) + (radius * Math.cos(angle));
        const centerY = (containerSize / 2) + (radius * Math.sin(angle));
        node.style.left = `${centerX - nodeSize / 2}px`;
        node.style.top = `${centerY - nodeSize / 2}px`;

        const rotationDeg = (angle * 180 / Math.PI) + 90;
        node.style.setProperty('--node-rotation', `${rotationDeg}deg`);

        trigConduitNodesContainer.appendChild(node);
        trigConduitNodes.push(node);

        setTimeout(() => { node.classList.add('visible'); }, OPTIONS.TRIG_CONDUIT_NODE_APPEAR_STAGGER_MS * i);
    }
    // Create central conduit core
    const core = document.createElement('div');
    core.classList.add('trig-conduit-core');
    core.style.left = `50%`;
    core.style.top = `50%`;
    trigConduitNodesContainer.appendChild(core);
    // store reference for later pulses
    trigConduitCore = core;

    // NEW: create three visual arms (Y-shaped) that converge on the center
    const armCount = 3;
    for (let a = 0; a < armCount; a++) {
        const arm = document.createElement('div');
        arm.classList.add('trig-conduit-arm');
        const angle = a * (2 * Math.PI / armCount) - (Math.PI / 2);
        const deg = angle * 180 / Math.PI;
        // center the arm and rotate so the narrow end points to center
        arm.style.left = '50%';
        arm.style.top = '50%';
        arm.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
        // stagger reveal for dramatic effect
        arm.style.transitionDelay = `${(a * 120)}ms`;
        trigConduitNodesContainer.appendChild(arm);
    }

    // store node centers for later animation targeting
    trigConduitNodeCenters = trigConduitNodes.map(node => ({
        x: node.offsetLeft + node.offsetWidth / 2,
        y: node.offsetTop + node.offsetHeight / 2
    }));
    // NEW: Calculate centers and draw initial faint lines after nodes are positioned
    requestAnimationFrame(() => {
        const nodeCenters = trigConduitNodes.map(node => {
            return {
                x: node.offsetLeft + node.offsetWidth / 2,
                y: node.offsetTop + node.offsetHeight / 2,
            };
        });

        // create inter-node mesh lines (faint) and spokes to the core
        for (let i = 0; i < numNodes; i++) {
            for (let j = i + 1; j < numNodes; j++) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute('x1', nodeCenters[i].x);
                line.setAttribute('y1', nodeCenters[i].y);
                line.setAttribute('x2', nodeCenters[j].x);
                line.setAttribute('y2', nodeCenters[j].y);
                line.classList.add('trig-conduit-line');
                // Create a consistent key for the line
                line.id = `conduit-line-${i}-${j}`;
                trigConduitSvgOverlay.appendChild(line);
            }
            // spoke to center
            const spoke = document.createElementNS("http://www.w3.org/2000/svg", "line");
            spoke.setAttribute('x1', nodeCenters[i].x);
            spoke.setAttribute('y1', nodeCenters[i].y);
            spoke.setAttribute('x2', containerSize/2);
            spoke.setAttribute('y2', containerSize/2);
            spoke.classList.add('trig-conduit-spoke');
            spoke.id = `conduit-spoke-${i}`;
            trigConduitSvgOverlay.appendChild(spoke);
        }
        // Also ensure arms visually point to center by updating their transform origin and length
        const arms = trigConduitNodesContainer.querySelectorAll('.trig-conduit-arm');
        // Staggered reveal for the three arms so they become visible after node positioning
        arms.forEach((arm, idx) => {
            // start slightly after nodes appear
            const delay = 200 + (idx * 120);
            // ensure initial opacity state is consistent
            arm.style.opacity = '0';
            setTimeout(() => {
                try {
                    arm.classList.add('visible');
                    // small nudge to ensure transition triggers in some WebEngine builds
                    arm.style.transform = arm.style.transform + ' translateZ(0)';
                } catch (e) {
                    console.warn('Failed to show trig-conduit arm', e);
                }
            }, delay);
        });
    });

    console.log(`Created ${numNodes} Trig Conduit nodes and SVG overlay.`);
    return true;
}

// Animate a small orb from (fromX,fromY) to (toX,toY) then call callback
function animateOrb(fromX, fromY, toX, toY, glyph, callback) {
    if (!trigConduitNodesContainer) { if (callback) callback(); return; }
    const orb = document.createElement('div');
    orb.className = 'conduit-orb';
    orb.style.left = `${fromX}px`;
    orb.style.top = `${fromY}px`;
    orb.textContent = '';
    trigConduitNodesContainer.appendChild(orb);

    // Force layout then animate
    requestAnimationFrame(() => {
        const dx = toX - fromX;
        const dy = toY - fromY;
        // shorter, punchier motion
        orb.style.transition = 'transform 0.45s cubic-bezier(.2,.9,.2,1), opacity 0.25s ease-out';
        orb.style.transform = `translate(${dx}px, ${dy}px) scale(0.6)`;
        orb.style.opacity = '1';
        // after transition, reveal glyph at target
        const onEnd = () => {
            try {
                if (glyph && typeof glyph === 'string' && glyph.length > 0) {
                    if (callback) callback(glyph);
                } else if (callback) callback();
            } finally {
                if (orb && orb.parentNode) orb.parentNode.removeChild(orb);
            }
        };
        orb.addEventListener('transitionend', onEnd, { once: true });
        // safety timeout
        setTimeout(() => { if (document.body.contains(orb)) { onEnd(); } }, 700);
    });
}

// Send orbs from a node to one or more placeholder indices
function sendOrbsFromNode(nodeIndex, targetIndices) {
    if (!trigConduitNodesContainer) return;
    const nodeCenter = trigConduitNodeCenters?.[nodeIndex];
    if (!nodeCenter) return;
    targetIndices.forEach((ti, i) => {
        const span = trigConduitNamePlaceholders[ti];
        if (!span) return;
        const spanRect = span.getBoundingClientRect();
        const containerRect = trigConduitNodesContainer.getBoundingClientRect();
        const toX = spanRect.left + spanRect.width / 2 - containerRect.left;
        const toY = spanRect.top + spanRect.height / 2 - containerRect.top;
        const fromX = nodeCenter.x;
        const fromY = nodeCenter.y;
        const glyph = getRandomTrigGlyph();
        // stagger slightly
        setTimeout(() => {
            animateOrb(fromX, fromY, toX, toY, glyph, (g) => {
                span.textContent = g;
                span.classList.remove('letter-placeholder');
                span.classList.add('letter-arrived');
                // small flash
                span.animate([{ transform: 'scale(1.2)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }], { duration: 250, easing: 'ease-out' });
            });
        }, i * 80);
    });
}

function startTriglavianConduitAnimation(winnerName, stepDurationMs) {
    console.log(`Starting Trig Conduit animation for: ${winnerName}, step: ${stepDurationMs}ms`);
    if (!trigConduitNodesContainer || !trigConduitWinnerDisplay || !trigConduitWinnerNameSpan) {
        console.error("Trig Conduit elements missing."); checkRevealCompletionTrigConduit(winnerName); return;
    }
    if (!createTriglavianConduitNodes()) { console.error("Failed to create Trig Conduit nodes."); checkRevealCompletionTrigConduit(winnerName); return; }

    trigConduitNodesContainer.classList.add('visible');
    trigConduitWinnerDisplay.classList.add('visible');
    trigConduitWinnerNameSpan.classList.remove('revealed');
    initConduitAtmosphere();

    const winnerNameUpper = winnerName.toUpperCase();
    const nameLength = winnerNameUpper.length;
    trigConduitWinnerNameSpan.innerHTML = '';
    trigConduitNamePlaceholders = [];
    for (let i = 0; i < nameLength; i++) {
        const span = document.createElement('span');
        span.textContent = OPTIONS.TRIG_CONDUIT_PLACEHOLDER_CHAR;
        span.classList.add('letter-placeholder');
        trigConduitWinnerNameSpan.appendChild(span);
        trigConduitNamePlaceholders.push(span);
    }
    // NEW: Generate a randomized path that visits each node once
    trigConduitRevealPath = shuffleArray([...Array(OPTIONS.TRIG_CONDUIT_NODE_COUNT).keys()]);
    console.log("Trig Conduit Reveal Path:", trigConduitRevealPath.join(' -> '));

    let currentStepIndex = 0;

    if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.resetRevealState === 'function') { NetworkAnimation.resetRevealState(); }

    // NEW: Separate function for the stabilization (power-up) phase
    function stabilizationStep() {
        if (currentStepIndex >= trigConduitRevealPath.length) {
            // Last node has been activated, now trigger the name scramble
            triggerNameScramble();
            return;
        }
        const currentNodeIndex = trigConduitRevealPath[currentStepIndex];
        const node = trigConduitNodes[currentNodeIndex];

        if (node) {
            // Deactivate previous node and mark its path as complete
            if (currentStepIndex > 0) {
                const prevNodeIndex = trigConduitRevealPath[currentStepIndex - 1];
                if (trigConduitNodes[prevNodeIndex]) {
                    trigConduitNodes[prevNodeIndex].classList.remove('active');
                    // Each successive charged node pulses faster, building urgency
                    const chargeDuration = Math.max(0.65, 1.8 - (currentStepIndex - 1) * 0.19);
                    trigConduitNodes[prevNodeIndex].style.setProperty('--charged-glow-duration', `${chargeDuration.toFixed(2)}s`);
                    trigConduitNodes[prevNodeIndex].classList.add('path-complete', 'charged');
                    updateConduitHUD(currentStepIndex, OPTIONS.TRIG_CONDUIT_NODE_COUNT, null);
                }
            }

            // Animate the line connecting to the previous node and make it stable
            if (currentStepIndex > 0) {
                const prevNodeIndex = trigConduitRevealPath[currentStepIndex - 1];
                const lineKey = `conduit-line-${Math.min(prevNodeIndex, currentNodeIndex)}-${Math.max(prevNodeIndex, currentNodeIndex)}`;
                const lineElement = document.getElementById(lineKey);
                if (lineElement) {
                    lineElement.classList.add('stable');
                }
            }

            node.classList.add('active');
            // make core pulse and enable spoke for this node
            try {
                if (trigConduitCore) {
                    trigConduitCore.classList.add('pulse');
                    // remove pulse class after animation completes so it can be re-triggered
                    setTimeout(() => { try { trigConduitCore.classList.remove('pulse'); } catch(e){} }, 800);
                }
                const spokeEl = document.getElementById(`conduit-spoke-${currentNodeIndex}`);
                if (spokeEl) {
                    spokeEl.classList.add('active');
                }
                // Apply node tilt (lean-in) towards the core while the spoke is active
                try {
                    if (node) {
                        // Apply static rotational-lean preset (one-shot)
                        node.style.setProperty('--node-lean-x', '4px');
                        node.style.setProperty('--node-lean-y', '-3px');
                        node.style.setProperty('--node-lean-rot', '-6deg');
                    }
                } catch(e) { console.warn('Failed to apply node lean', e); }
            } catch (e) { console.warn('Error activating core/spoke', e); }
            // emit a small orb or two from this node to random placeholder positions to show powering-up
            try {
                if (trigConduitNamePlaceholders && trigConduitNamePlaceholders.length > 0) {
                    const availableIndices = trigConduitNamePlaceholders.map((s, idx) => ({ s, idx })).filter(o => o.s && o.s.classList && o.s.classList.contains && o.s.classList.contains('letter-placeholder')).map(o => o.idx);
                    if (availableIndices.length === 0) {
                        // fallback: pick random indices
                        const r = getRandomInt(0, trigConduitNamePlaceholders.length - 1);
                        sendOrbsFromNode(currentNodeIndex, [r]);
                    } else {
                        const picks = shuffleArray(availableIndices).slice(0, Math.min(2, availableIndices.length));
                                sendOrbsFromNode(currentNodeIndex, picks);
                                // small delay to then dim the spoke after orbs are emitted
                                setTimeout(() => {
                                    try {
                                        const spokeEl2 = document.getElementById(`conduit-spoke-${currentNodeIndex}`);
                                        if (spokeEl2) spokeEl2.classList.remove('active');
                                        // also clear node lean variables
                                        try {
                                            if (node) {
                                                node.style.removeProperty('--node-lean-x');
                                                node.style.removeProperty('--node-lean-y');
                                                node.style.removeProperty('--node-lean-rot');
                                            }
                                        } catch (e) {}
                                    } catch (e) {}
                                }, Math.max(400, stepDurationMs * 0.6));
                    }
                }
            } catch (e) { console.warn('Error emitting conduit orb during stabilization', e); }
            callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
        }
        currentStepIndex++;

        trigConduitIntervalId = setTimeout(stabilizationStep, stepDurationMs);
        animationSequenceTimeoutIds.push(trigConduitIntervalId);
    }

    // NEW: Separate function for the decoding (scramble) phase
    function triggerNameScramble() {
        // Deactivate the final node — charge it at maximum speed (ring fully energised)
        const lastNodeIndex = trigConduitRevealPath[trigConduitRevealPath.length - 1];
        if (trigConduitNodes[lastNodeIndex]) {
            trigConduitNodes[lastNodeIndex].classList.remove('active');
            trigConduitNodes[lastNodeIndex].style.setProperty('--charged-glow-duration', '0.65s');
            trigConduitNodes[lastNodeIndex].classList.add('path-complete', 'charged');
        }
        updateConduitHUD(OPTIONS.TRIG_CONDUIT_NODE_COUNT, OPTIONS.TRIG_CONDUIT_NODE_COUNT, winnerName);

    callPythonBackend('jsRequestSound', OPTIONS.SOUND_CONDUIT_STABLE_KEY);
    // show a stronger final effect on core
        try {
            if (trigConduitCore) {
                trigConduitCore.classList.add('stable');
                setTimeout(() => { try { trigConduitCore.classList.remove('stable'); } catch(e){} }, 1400);
            }
        } catch(e){}

        let revealedCount = 0;
        trigConduitNamePlaceholders.forEach((span, index) => {
            let scrambleCycles = 0;
            const scrambleInterval = OPTIONS.TRIG_CONDUIT_SCRAMBLE_DURATION_MS / OPTIONS.TRIG_CONDUIT_SCRAMBLE_CYCLES_PER_CHAR;
            // send a decoding orb from a random node aimed at this placeholder
                try {
                const nodeToUse = getRandomInt(0, trigConduitNodes.length - 1);
                // briefly highlight spoke when decoding orb is sent and tilt node
                const spokeEl = document.getElementById(`conduit-spoke-${nodeToUse}`);
                const nodeEl = trigConduitNodes[nodeToUse];
                if (spokeEl) spokeEl.classList.add('active');
                // apply a short lean for scramble highlight
                try {
                    if (nodeEl) {
                        // Apply static rotational-lean preset for scramble highlight
                        nodeEl.style.setProperty('--node-lean-x', '4px');
                        nodeEl.style.setProperty('--node-lean-y', '-3px');
                        nodeEl.style.setProperty('--node-lean-rot', '-6deg');
                    }
                } catch(e) { console.warn('Failed to apply scramble node lean', e); }
                setTimeout(() => sendOrbsFromNode(nodeToUse, [index]), index * 60);
                setTimeout(() => { 
                    if (spokeEl) spokeEl.classList.remove('active'); 
                    try { if (nodeEl) { nodeEl.style.removeProperty('--node-lean-x'); nodeEl.style.removeProperty('--node-lean-y'); nodeEl.style.removeProperty('--node-lean-rot'); } } catch(e){}
                }, index * 60 + 500);
            } catch (e) { /* ignore */ }

            trigConduitScrambleIntervals[index] = setInterval(() => {
                span.textContent = getRandomTrigGlyph();
                scrambleCycles++;
                if (scrambleCycles >= OPTIONS.TRIG_CONDUIT_SCRAMBLE_CYCLES_PER_CHAR) {
                    clearInterval(trigConduitScrambleIntervals[index]);
                    delete trigConduitScrambleIntervals[index];
                    span.textContent = winnerNameUpper[index];
                    span.classList.remove('letter-placeholder');
                    span.classList.add('letter-revealed');
                    revealedCount++;

                    // When the last letter is revealed, call the completion function
                    if (revealedCount === nameLength) {
                        checkRevealCompletionTrigConduit(winnerName);
                    }
                }
            }, scrambleInterval);
            animationSequenceTimeoutIds.push(trigConduitScrambleIntervals[index]);
        });
    }

    trigConduitIntervalId = setTimeout(stabilizationStep, stepDurationMs / 2 + OPTIONS.TRIG_CONDUIT_NODE_APPEAR_STAGGER_MS * OPTIONS.TRIG_CONDUIT_NODE_COUNT);
    animationSequenceTimeoutIds.push(trigConduitIntervalId);
}

function checkRevealCompletionTrigConduit(winnerName = "Unknown") {
    console.log("Triglavian Conduit Reveal Complete.");
    if (trigConduitIntervalId) { clearTimeout(trigConduitIntervalId); trigConduitIntervalId = null; }
    Object.values(trigConduitScrambleIntervals).forEach(clearInterval);
    trigConduitScrambleIntervals = {};

    trigConduitNodes.forEach((node, index) => {
        if (node) node.classList.remove('active');
    });

    if (trigConduitWinnerNameSpan) {
        const winnerNameUpper = winnerName.toUpperCase();
        let finalHtml = "";
        for(let i = 0; i < winnerNameUpper.length; i++) {
            finalHtml += `<span class="letter-revealed">${winnerNameUpper[i]}</span>`;
        }
        trigConduitWinnerNameSpan.innerHTML = finalHtml;
        trigConduitWinnerNameSpan.classList.add('revealed');
    }

    callPythonBackend('jsRequestSound', OPTIONS.SOUND_CONDUIT_STABLE_KEY);

    // --- Node explosion effect ---
    const _explodeNodes = () => {
        if (!trigConduitNodesContainer) return;
        const containerSize = trigConduitNodesContainer.offsetWidth || 300;
        const containerCenterX = containerSize / 2;
        const containerCenterY = containerSize / 2;
        const explosionDistance = containerSize * 0.9;
        const nodeSize = parseVmin(getCssVariableValue('--trig-conduit-node-size')) || 40;
        const halfNode = nodeSize / 2;

        trigConduitNodes.forEach((node, index) => {
            if (!node) return;
            const nodeLeft = parseFloat(node.style.left) + halfNode;
            const nodeTop  = parseFloat(node.style.top)  + halfNode;
            const dx = nodeLeft - containerCenterX;
            const dy = nodeTop  - containerCenterY;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            node.style.setProperty('--explode-x', `${(dx / len * explosionDistance).toFixed(1)}px`);
            node.style.setProperty('--explode-y', `${(dy / len * explosionDistance).toFixed(1)}px`);

            setTimeout(() => {
                node.classList.remove('charged', 'path-complete');
                node.style.animation = 'none';
                void node.offsetWidth; // force reflow to kill chargedNodeGlow
                node.classList.add('exploding');
            }, index * 55);
        });

        if (trigConduitCore) trigConduitCore.classList.add('exploding');
    };
    const explodeTimeoutId = setTimeout(_explodeNodes, 260);
    animationSequenceTimeoutIds.push(explodeTimeoutId);

    const revealMode = document.querySelector('.reveal-mode.visible');
    if (revealMode) revealMode.classList.add('slide-up');

    const countdownStartTimeoutId = setTimeout(() => {
        startCountdownPhase();
    }, OPTIONS.TRIG_CONDUIT_COUNTDOWN_DELAY_MS);
    animationSequenceTimeoutIds.push(countdownStartTimeoutId);

    console.log(`JS checkRevealCompletionTrigConduit: Sending original name back: '${currentWinnerNameForCallback}'`);
    callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
}


// --- Triglavian Code Reveal Logic ---
// ... (resetTrigCodeRevealState, generateTriglavianCode, populateTrigCodeParticipants, startTrigCodeReveal, revealNextTrigCodeChar, checkRevealCompletionTrigCode remain same) ...
function resetTrigCodeRevealState() {
    console.log("Resetting Triglavian Code Reveal State");
    if (trigCodeRevealIntervalId) { clearInterval(trigCodeRevealIntervalId); trigCodeRevealIntervalId = null; }
    if (trigCodeParticipantsContainer) trigCodeParticipantsContainer.innerHTML = '';
    if (trigCodeWinnerCodeDisplay) trigCodeWinnerCodeDisplay.innerHTML = '';
    if (trigCodeWinnerNameDisplay) trigCodeWinnerNameDisplay.classList.remove('visible');
    if (trigCodeWinnerNameSpan) trigCodeWinnerNameSpan.textContent = '';

    trigCodeParticipantsData = [];
    trigCodeWinnerCode = "";
    trigCodeRevealedChars = [];
    trigCodeCurrentRevealIndex = 0;
    currentTrigCodeCharSet = OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    currentTrigCodeFinalistCount = OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;
}

function generateTriglavianCode(length, charSet = OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET) {
    let code = "";
    const effectiveCharSet = (typeof charSet === 'string' && charSet.length > 0) ? charSet : OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    if (effectiveCharSet.length === 0) {
        console.error("Trig Code: Character set is empty! Using fallback 'X'.");
        return 'X'.repeat(length);
    }
    for (let i = 0; i < length; i++) {
        code += effectiveCharSet[Math.floor(Math.random() * effectiveCharSet.length)];
    }
    return code;
}

function populateTrigCodeParticipants(winnerName, allParticipants, codeLength, charSet, finalistTargetCount) {
    if (!trigCodeParticipantsContainer) {
        console.error("Trig Code Participants container not found!");
        return false;
    }
    trigCodeParticipantsContainer.innerHTML = '';
    trigCodeParticipantsData = [];
    currentTrigCodeCharSet = (typeof charSet === 'string' && charSet.length > 0) ? charSet : OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    currentTrigCodeFinalistCount = finalistTargetCount || OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;

    const participantsToUse = (allParticipants && allParticipants.length > 0) ? [...allParticipants] : [..._cachedParticipantList];
    if (!participantsToUse || participantsToUse.length === 0) {
        console.warn("populateTrigCodeParticipants: No participants available.");
        trigCodeParticipantsContainer.innerHTML = '<div>--- NO ENTRANTS ---</div>';
        return false;
    }

    if (!participantsToUse.includes(winnerName)) {
        console.warn(`Winner "${winnerName}" not in participant list. Adding.`);
        participantsToUse.push(winnerName);
    }
    const shuffledDisplayParticipants = shuffleArray(participantsToUse);
    const assignedNonWinnerCodes = new Set();

    trigCodeWinnerCode = generateTriglavianCode(codeLength, currentTrigCodeCharSet);
    console.log(`Trig Code: Generated Winner Code for ${winnerName}: ${trigCodeWinnerCode}`);

    shuffledDisplayParticipants.forEach(name => {
        let participantCode;
        if (name === winnerName) {
            participantCode = trigCodeWinnerCode;
        } else {
            // Generate a mutated variant of the winner code for this non-winner participant
            let attempts = 0;
            const maxAttemptsPerParticipant = 50;
            let minMutations = OPTIONS.TRIG_CODE_MIN_MUTATIONS;
            let maxMutations = OPTIONS.TRIG_CODE_MAX_MUTATIONS;

            maxMutations = Math.min(maxMutations, codeLength);
            minMutations = Math.min(minMutations, maxMutations);
            if (minMutations <= 0) minMutations = 1;

            do {
                attempts++;
                // start with winner code as base
                const mutatedCodeArray = trigCodeWinnerCode.split('');
                const mutationCount = getRandomInt(minMutations, maxMutations);
                const mutationIndices = [];
                while (mutationIndices.length < mutationCount) {
                    const idx = getRandomInt(0, codeLength - 1);
                    if (!mutationIndices.includes(idx)) mutationIndices.push(idx);
                }

                // mutate selected indices
                mutationIndices.forEach(idx => {
                    let newChar;
                    let charAttempts = 0;
                    do {
                        newChar = currentTrigCodeCharSet[Math.floor(Math.random() * currentTrigCodeCharSet.length)];
                        charAttempts++;
                    } while (newChar === mutatedCodeArray[idx] && charAttempts < 10);
                    mutatedCodeArray[idx] = newChar;
                });

                participantCode = mutatedCodeArray.join('');

                // If we've exhausted attempts and still collided with winner, force a single-character change
                if (participantCode === trigCodeWinnerCode && attempts >= maxAttemptsPerParticipant) {
                    const diffIndex = getRandomInt(0, codeLength - 1);
                    let forcedChar;
                    let forceAttempts = 0;
                    do {
                        forcedChar = currentTrigCodeCharSet[Math.floor(Math.random() * currentTrigCodeCharSet.length)];
                        forceAttempts++;
                    } while (forcedChar === participantCode[diffIndex] && forceAttempts < 20);
                    const tempArr = participantCode.split('');
                    tempArr[diffIndex] = forcedChar;
                    participantCode = tempArr.join('');
                }

            } while ((participantCode === trigCodeWinnerCode || assignedNonWinnerCodes.has(participantCode)) && attempts < maxAttemptsPerParticipant);

            assignedNonWinnerCodes.add(participantCode);
        }

        const itemDiv = document.createElement('div');
        itemDiv.classList.add('trig-code-participant-item');
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('name');
        nameSpan.textContent = name;
        const codeSpan = document.createElement('span');
        codeSpan.classList.add('code');
        codeSpan.innerHTML = participantCode.split('').map(char => `<span>${char}</span>`).join('');

        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(codeSpan);
        trigCodeParticipantsContainer.appendChild(itemDiv);

        trigCodeParticipantsData.push({
            name: name,
            code: participantCode,
            element: itemDiv,
            codeElement: codeSpan,
            isEliminated: false,
            isVisiblyRemoved: false
        });
    });
    console.log(`Trig Code: Populated ${trigCodeParticipantsData.length} participants. Finalist target: ${currentTrigCodeFinalistCount}`);
    return true;
}


function startTrigCodeReveal(winnerName, codeLength, revealSpeedLabel, charSetFromOptions, finalistCount) {
    console.log(`Starting Trig Code Reveal for: ${winnerName}, Code Length: ${codeLength}, Speed: ${revealSpeedLabel}, Finalists: ${finalistCount}`);
    if (!trigCodeRevealMode || !trigCodeParticipantsContainer || !trigCodeWinnerCodeDisplay || !trigCodeWinnerNameDisplay || !trigCodeWinnerNameSpan) {
        console.error("Trig Code Reveal elements missing.");
        checkRevealCompletionTrigCode(winnerName);
        return;
    }

    currentTrigCodeCharSet = (typeof charSetFromOptions === 'string' && charSetFromOptions.length > 0)
                                ? charSetFromOptions
                                : OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    currentTrigCodeFinalistCount = finalistCount || OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;


    switch (revealSpeedLabel) {
        case 'Fast': currentTrigCodeRevealStepDuration = OPTIONS.TRIG_CODE_REVEAL_INTERVAL_MS_FAST; break;
        case 'Slow': currentTrigCodeRevealStepDuration = OPTIONS.TRIG_CODE_REVEAL_INTERVAL_MS_SLOW; break;
        default: currentTrigCodeRevealStepDuration = OPTIONS.TRIG_CODE_REVEAL_INTERVAL_MS_NORMAL;
    }

    resetTrigCodeRevealState();
    currentTrigCodeCharSet = (typeof charSetFromOptions === 'string' && charSetFromOptions.length > 0)
                                ? charSetFromOptions
                                : OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    currentTrigCodeFinalistCount = finalistCount || OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;


    if (!populateTrigCodeParticipants(winnerName, _cachedParticipantList, codeLength, currentTrigCodeCharSet, currentTrigCodeFinalistCount)) {
        console.error("Failed to populate Trig Code participants.");
        checkRevealCompletionTrigCode(winnerName);
        return;
    }

    trigCodeRevealedChars = Array(codeLength).fill(OPTIONS.TRIG_CODE_PLACEHOLDER_CHAR);
    trigCodeWinnerCodeDisplay.innerHTML = trigCodeRevealedChars.map(char => `<span class="placeholder-char">${char}</span>`).join('');

    setTimeout(() => {
        if (trigCodeWinnerCodeDisplay) trigCodeWinnerCodeDisplay.classList.add('visible');
        if (trigCodeParticipantsContainer) trigCodeParticipantsContainer.classList.add('visible');
    }, OPTIONS.TRIG_CODE_APPEAR_DELAY_MS);


    if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.resetRevealState === 'function') {
        NetworkAnimation.resetRevealState();
    }

    trigCodeCurrentRevealIndex = 0;
    trigCodeRevealIntervalId = setTimeout(() => {
        revealNextTrigCodeChar(winnerName);
    }, OPTIONS.TRIG_CODE_WINNER_CODE_REVEAL_START_DELAY_MS + OPTIONS.TRIG_CODE_APPEAR_DELAY_MS);
    animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
}

function revealNextTrigCodeChar(winnerName) {
    if (trigCodeCurrentRevealIndex >= trigCodeWinnerCode.length) {
        checkRevealCompletionTrigCode(winnerName);
        return;
    }

    let stepDelay = currentTrigCodeRevealStepDuration;
    const activeParticipantsBeforeStep = trigCodeParticipantsData.filter(p => !p.isEliminated && !p.isVisiblyRemoved).length;

    // Check for pause condition *before* revealing the next character IF it's the final character
    if (trigCodeCurrentRevealIndex === trigCodeWinnerCode.length - 1 && activeParticipantsBeforeStep === 2) {
        console.log("Trig Code: Down to final 2. Pausing...");
        stepDelay += OPTIONS.TRIG_CODE_FINAL_TWO_PAUSE_MS;
    }


    // Delay the actual reveal and elimination logic
    trigCodeRevealIntervalId = setTimeout(() => {
        const charToReveal = trigCodeWinnerCode[trigCodeCurrentRevealIndex];
        trigCodeRevealedChars[trigCodeCurrentRevealIndex] = charToReveal;

        let winnerCodeHtml = "";
        for(let i=0; i < trigCodeRevealedChars.length; i++) {
            const char = trigCodeRevealedChars[i];
            const charClass = (char === OPTIONS.TRIG_CODE_PLACEHOLDER_CHAR) ? 'placeholder-char' : 'revealed-char';
            winnerCodeHtml += `<span class="${charClass} ${(i === trigCodeCurrentRevealIndex) ? 'just-revealed' : ''}">${char}</span>`;
        }
        trigCodeWinnerCodeDisplay.innerHTML = winnerCodeHtml;
        setTimeout(() => {
            const justRevSpan = trigCodeWinnerCodeDisplay.querySelector('.just-revealed');
            if(justRevSpan) justRevSpan.classList.remove('just-revealed');
        }, currentTrigCodeRevealStepDuration * 0.8);

        callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
        if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.notifyGenericReveal === 'function' && trigCodeWinnerCodeDisplay) {
            NetworkAnimation.notifyGenericReveal(trigCodeWinnerCodeDisplay);
        }

        const currentRevealedPrefix = trigCodeWinnerCode.substring(0, trigCodeCurrentRevealIndex + 1);

        setTimeout(() => {
            let activeParticipantsAfterUpdate = 0;
             trigCodeParticipantsData.forEach(participant => {
                if (participant.isVisiblyRemoved) return;

                if (!participant.isEliminated) {
                    if (!participant.code.startsWith(currentRevealedPrefix)) {
                        participant.isEliminated = true;

                        const countBeforeThisOneIsRemoved = trigCodeParticipantsData.filter(p => !p.isEliminated && !p.isVisiblyRemoved).length;

                        if (countBeforeThisOneIsRemoved > currentTrigCodeFinalistCount) {
                             if (!participant.isVisiblyRemoved) {
                                participant.element.classList.add('eliminating');
                                setTimeout(() => {
                                    participant.element.style.display = 'none';
                                    participant.isVisiblyRemoved = true;
                                }, OPTIONS.TRIG_CODE_ELIMINATION_ANIM_DURATION_MS);
                            }
                        } else {
                            participant.element.classList.add('eliminated');
                            participant.element.classList.remove('highlight-match');
                        }
                    } else {
                        activeParticipantsAfterUpdate++;
                        let codeHtml = "";
                        for(let k=0; k < participant.code.length; k++) {
                            if (k <= trigCodeCurrentRevealIndex && participant.code[k] === trigCodeWinnerCode[k]) {
                                codeHtml += `<span class="matching-char">${participant.code[k]}</span>`;
                            } else {
                                codeHtml += `<span>${participant.code[k]}</span>`;
                            }
                        }
                        participant.codeElement.innerHTML = codeHtml;
                        if(!participant.element.classList.contains('eliminated')) {
                           participant.element.classList.add('highlight-match');
                           setTimeout(() => {
                               if (participant.name !== winnerName || trigCodeCurrentRevealIndex < trigCodeWinnerCode.length -1) {
                                   participant.element.classList.remove('highlight-match');
                               }
                           }, currentTrigCodeRevealStepDuration * 0.8);
                        }
                    }
                }
            });
             const finalVisibleCount = trigCodeParticipantsData.filter(p => !p.isVisiblyRemoved).length;
            console.log(`Trig Code: Char '${charToReveal}' revealed. Prefix: '${currentRevealedPrefix}'. Remaining visible: ${finalVisibleCount}`);

        }, OPTIONS.TRIG_CODE_ELIMINATION_DELAY_MS);

        trigCodeCurrentRevealIndex++;
        if (trigCodeCurrentRevealIndex < trigCodeWinnerCode.length) {
             trigCodeRevealIntervalId = setTimeout(() => revealNextTrigCodeChar(winnerName), currentTrigCodeRevealStepDuration);
             animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
        } else {
            trigCodeRevealIntervalId = setTimeout(() => checkRevealCompletionTrigCode(winnerName), Math.max(currentTrigCodeRevealStepDuration, OPTIONS.TRIG_CODE_ELIMINATION_DELAY_MS + OPTIONS.TRIG_CODE_ELIMINATION_ANIM_DURATION_MS + 100));
            animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
        }
    }, stepDelay);
    animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
}


function checkRevealCompletionTrigCode(winnerName) {
    console.log("Triglavian Code Reveal Complete.");
    if (trigCodeRevealIntervalId) { clearTimeout(trigCodeRevealIntervalId); trigCodeRevealIntervalId = null; }

    if (trigCodeWinnerNameSpan) trigCodeWinnerNameSpan.textContent = winnerName;
    if (trigCodeWinnerNameDisplay) trigCodeWinnerNameDisplay.classList.add('visible');

    trigCodeParticipantsData.forEach(p => {
        p.element.classList.remove('highlight-match', 'eliminating');
        if (p.name === winnerName) {
            p.isEliminated = false;
            p.isVisiblyRemoved = false;
            p.element.style.display = 'flex';
            p.element.classList.remove('eliminated');
            p.element.classList.add('highlight-match');
            p.codeElement.innerHTML = p.code.split('').map(c => `<span class="matching-char">${c}</span>`).join('');
            if (p.element.scrollIntoView) {
                 p.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            if (!p.isVisiblyRemoved) {
                p.element.classList.add('eliminated');
                p.codeElement.innerHTML = p.code.split('').map(c => `<span>${c}</span>`).join('');
            }
        }
    });

    const revealMode = document.querySelector('.reveal-mode.visible');
    if (revealMode) revealMode.classList.add('slide-up');

    const countdownStartTimeoutId = setTimeout(() => {
        startCountdownPhase();
    }, OPTIONS.COUNTDOWN_START_DELAY_AFTER_TRIG_CODE_MS);
    animationSequenceTimeoutIds.push(countdownStartTimeoutId);

    console.log(`JS checkRevealCompletionTrigCode: Sending original name back: '${currentWinnerNameForCallback}'`);
    callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
}

// --- Multi-Winner Triglavian Code Reveal ---
function startMultiTrigCodeReveal(winnerNamesArray, codeLength, revealSpeedLabel, charSetFromOptions, finalistCount) {
    const namesStr = (winnerNamesArray || []).join(', ');
    console.log(`Starting MULTI Trig Code Reveal for ${winnerNamesArray.length} winners: ${namesStr}`);
    if (!trigCodeRevealMode || !trigCodeParticipantsContainer || !trigCodeWinnerCodeDisplay || !trigCodeWinnerNameDisplay || !trigCodeWinnerNameSpan) {
        console.error("Trig Code Reveal elements missing.");
        callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
        return;
    }

    isMultiWinnerMode = true;
    multiWinnerNamesArray = winnerNamesArray.map(n => n.trim()).filter(n => n);

    currentTrigCodeCharSet = (typeof charSetFromOptions === 'string' && charSetFromOptions.length > 0)
                                ? charSetFromOptions
                                : OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    currentTrigCodeFinalistCount = finalistCount || OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;

    switch (revealSpeedLabel) {
        case 'Fast': currentTrigCodeRevealStepDuration = OPTIONS.TRIG_CODE_REVEAL_INTERVAL_MS_FAST; break;
        case 'Slow': currentTrigCodeRevealStepDuration = OPTIONS.TRIG_CODE_REVEAL_INTERVAL_MS_SLOW; break;
        default: currentTrigCodeRevealStepDuration = OPTIONS.TRIG_CODE_REVEAL_INTERVAL_MS_NORMAL;
    }

    resetTrigCodeRevealState();

    if (!populateMultiTrigCodeParticipants(multiWinnerNamesArray, _cachedParticipantList, codeLength, currentTrigCodeCharSet, currentTrigCodeFinalistCount)) {
        console.error("Failed to populate multi Trig Code participants.");
        callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
        return;
    }

    trigCodeRevealedChars = Array(codeLength).fill(OPTIONS.TRIG_CODE_PLACEHOLDER_CHAR);
    trigCodeWinnerCodeDisplay.innerHTML = trigCodeRevealedChars.map(char => `<span class="placeholder-char">${char}</span>`).join('');

    setTimeout(() => {
        if (trigCodeWinnerCodeDisplay) trigCodeWinnerCodeDisplay.classList.add('visible');
        if (trigCodeParticipantsContainer) trigCodeParticipantsContainer.classList.add('visible');
    }, OPTIONS.TRIG_CODE_APPEAR_DELAY_MS);

    if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.resetRevealState === 'function') {
        NetworkAnimation.resetRevealState();
    }

    trigCodeCurrentRevealIndex = 0;
    trigCodeRevealIntervalId = setTimeout(() => {
        revealNextMultiTrigCodeChar();
    }, OPTIONS.TRIG_CODE_WINNER_CODE_REVEAL_START_DELAY_MS + OPTIONS.TRIG_CODE_APPEAR_DELAY_MS);
    animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
}

function populateMultiTrigCodeParticipants(winnerNames, allParticipants, codeLength, charSet, finalistTargetCount) {
    if (!trigCodeParticipantsContainer) {
        console.error("Trig Code Participants container not found!");
        return false;
    }
    trigCodeParticipantsContainer.innerHTML = '';
    trigCodeParticipantsData = [];
    currentTrigCodeCharSet = (typeof charSet === 'string' && charSet.length > 0) ? charSet : OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    currentTrigCodeFinalistCount = finalistTargetCount || OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;

    const participantsToUse = (allParticipants && allParticipants.length > 0) ? [...allParticipants] : [..._cachedParticipantList];
    if (!participantsToUse || participantsToUse.length === 0) {
        console.warn("populateMultiTrigCodeParticipants: No participants available.");
        trigCodeParticipantsContainer.innerHTML = '<div>--- NO ENTRANTS ---</div>';
        return false;
    }

    const winnerSet = new Set(winnerNames.map(n => n.trim().toLowerCase()));
    winnerNames.forEach(w => {
        if (!participantsToUse.includes(w)) {
            console.warn(`Winner "${w}" not in participant list. Adding.`);
            participantsToUse.push(w);
        }
    });
    const shuffledDisplayParticipants = shuffleArray(participantsToUse);
    const assignedNonWinnerCodes = new Set();

    // Generate a winner code for each winner
    const winnerCodes = {};
    winnerNames.forEach(name => {
        winnerCodes[name] = generateTriglavianCode(codeLength, currentTrigCodeCharSet);
        console.log(`Multi Trig Code: Generated code for ${name}: ${winnerCodes[name]}`);
    });
    // Use the first winner's code as the "display" code (the one revealed in the center)
    trigCodeWinnerCode = winnerCodes[winnerNames[0]];

    shuffledDisplayParticipants.forEach(name => {
        let participantCode;
        const isWinner = winnerSet.has(name.trim().toLowerCase());
        if (isWinner) {
            participantCode = winnerCodes[name];
        } else {
            // Generate a code that doesn't match any winner code
            let attempts = 0;
            const maxAttemptsPerParticipant = 50;
            let minMutations = OPTIONS.TRIG_CODE_MIN_MUTATIONS;
            let maxMutations = OPTIONS.TRIG_CODE_MAX_MUTATIONS;
            maxMutations = Math.min(maxMutations, codeLength);
            minMutations = Math.min(minMutations, maxMutations);
            if (minMutations <= 0) minMutations = 1;

            let baseCode = trigCodeWinnerCode;
            do {
                attempts++;
                const mutatedCodeArray = baseCode.split('');
                const mutationCount = getRandomInt(minMutations, maxMutations);
                const mutationIndices = [];
                while (mutationIndices.length < mutationCount) {
                    const idx = getRandomInt(0, codeLength - 1);
                    if (!mutationIndices.includes(idx)) mutationIndices.push(idx);
                }
                mutationIndices.forEach(idx => {
                    let newChar;
                    let charAttempts = 0;
                    do {
                        newChar = currentTrigCodeCharSet[Math.floor(Math.random() * currentTrigCodeCharSet.length)];
                        charAttempts++;
                    } while (newChar === mutatedCodeArray[idx] && charAttempts < 10);
                    mutatedCodeArray[idx] = newChar;
                });
                participantCode = mutatedCodeArray.join('');

                // Make sure it doesn't match any winner code's prefix
                let matchesAnyWinner = false;
                for (const wName of winnerNames) {
                    if (participantCode === trigCodeWinnerCode || participantCode === winnerCodes[wName]) {
                        matchesAnyWinner = true;
                        break;
                    }
                }
                if (!matchesAnyWinner && assignedNonWinnerCodes.has(participantCode)) {
                    matchesAnyWinner = true;
                }
                if (matchesAnyWinner && attempts >= maxAttemptsPerParticipant) {
                    const diffIndex = getRandomInt(0, codeLength - 1);
                    let forcedChar;
                    let forceAttempts = 0;
                    do {
                        forcedChar = currentTrigCodeCharSet[Math.floor(Math.random() * currentTrigCodeCharSet.length)];
                        forceAttempts++;
                    } while (forcedChar === participantCode[diffIndex] && forceAttempts < 20);
                    const tempArr = participantCode.split('');
                    tempArr[diffIndex] = forcedChar;
                    participantCode = tempArr.join('');
                }
            } while (attempts < maxAttemptsPerParticipant &&
                     (winnerCodes[winnerNames[0]] === participantCode ||
                      assignedNonWinnerCodes.has(participantCode)));

            assignedNonWinnerCodes.add(participantCode);
        }

        const itemDiv = document.createElement('div');
        itemDiv.classList.add('trig-code-participant-item');
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('name');
        nameSpan.textContent = name;
        const codeSpan = document.createElement('span');
        codeSpan.classList.add('code');
        codeSpan.innerHTML = participantCode.split('').map(char => `<span>${char}</span>`).join('');

        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(codeSpan);
        trigCodeParticipantsContainer.appendChild(itemDiv);

        trigCodeParticipantsData.push({
            name: name,
            code: participantCode,
            element: itemDiv,
            codeElement: codeSpan,
            isEliminated: false,
            isVisiblyRemoved: false,
            isWinner: isWinner
        });
    });
    console.log(`Multi Trig Code: Populated ${trigCodeParticipantsData.length} participants with ${winnerNames.length} winners.`);
    return true;
}

function revealNextMultiTrigCodeChar() {
    if (trigCodeCurrentRevealIndex >= trigCodeWinnerCode.length) {
        checkRevealCompletionMultiTrigCode();
        return;
    }

    trigCodeRevealIntervalId = setTimeout(() => {
        const charToReveal = trigCodeWinnerCode[trigCodeCurrentRevealIndex];
        trigCodeRevealedChars[trigCodeCurrentRevealIndex] = charToReveal;

        let winnerCodeHtml = "";
        for(let i = 0; i < trigCodeRevealedChars.length; i++) {
            const char = trigCodeRevealedChars[i];
            const charClass = (char === OPTIONS.TRIG_CODE_PLACEHOLDER_CHAR) ? 'placeholder-char' : 'revealed-char';
            winnerCodeHtml += `<span class="${charClass} ${(i === trigCodeCurrentRevealIndex) ? 'just-revealed' : ''}">${char}</span>`;
        }
        trigCodeWinnerCodeDisplay.innerHTML = winnerCodeHtml;
        setTimeout(() => {
            const justRevSpan = trigCodeWinnerCodeDisplay.querySelector('.just-revealed');
            if(justRevSpan) justRevSpan.classList.remove('just-revealed');
        }, currentTrigCodeRevealStepDuration * 0.8);

        callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);

        const currentRevealedPrefix = trigCodeWinnerCode.substring(0, trigCodeCurrentRevealIndex + 1);

        setTimeout(() => {
            trigCodeParticipantsData.forEach(participant => {
                if (participant.isVisiblyRemoved) return;

                if (!participant.isEliminated) {
                    // Check if participant's code matches ANY winner code's prefix
                    const nonEliminatedWinners = trigCodeParticipantsData.filter(p => p.isWinner && !p.isEliminated);
                    let matchesAnyWinner = false;
                    for (const w of nonEliminatedWinners) {
                        if (participant.code.startsWith(w.code.substring(0, trigCodeCurrentRevealIndex + 1))) {
                            matchesAnyWinner = true;
                            break;
                        }
                    }
                    // If participant is a winner themselves, keep them
                    if (participant.isWinner) {
                        matchesAnyWinner = true;
                    }

                    if (!matchesAnyWinner) {
                        participant.isEliminated = true;
                        const countBeforeThisOneIsRemoved = trigCodeParticipantsData.filter(p => !p.isEliminated && !p.isVisiblyRemoved).length;
                        if (countBeforeThisOneIsRemoved > currentTrigCodeFinalistCount) {
                            if (!participant.isVisiblyRemoved) {
                                participant.element.classList.add('eliminating');
                                setTimeout(() => {
                                    participant.element.style.display = 'none';
                                    participant.isVisiblyRemoved = true;
                                }, OPTIONS.TRIG_CODE_ELIMINATION_ANIM_DURATION_MS);
                            }
                        } else {
                            participant.element.classList.add('eliminated');
                            participant.element.classList.remove('highlight-match');
                        }
                    } else {
                        let codeHtml = "";
                        for(let k = 0; k < participant.code.length; k++) {
                            if (k <= trigCodeCurrentRevealIndex) {
                                // Check if this char matches the corresponding winner code char
                                let matches = false;
                                for (const w of nonEliminatedWinners) {
                                    if (participant.code[k] === w.code[k]) {
                                        matches = true;
                                        break;
                                    }
                                }
                                codeHtml += matches ? `<span class="matching-char">${participant.code[k]}</span>` : `<span>${participant.code[k]}</span>`;
                            } else {
                                codeHtml += `<span>${participant.code[k]}</span>`;
                            }
                        }
                        participant.codeElement.innerHTML = codeHtml;
                        if(!participant.element.classList.contains('eliminated')) {
                           participant.element.classList.add('highlight-match');
                           setTimeout(() => {
                               if (!participant.isWinner || trigCodeCurrentRevealIndex < trigCodeWinnerCode.length - 1) {
                                   participant.element.classList.remove('highlight-match');
                               }
                           }, currentTrigCodeRevealStepDuration * 0.8);
                        }
                    }
                }
            });
        }, OPTIONS.TRIG_CODE_ELIMINATION_DELAY_MS);

        trigCodeCurrentRevealIndex++;
        if (trigCodeCurrentRevealIndex < trigCodeWinnerCode.length) {
             trigCodeRevealIntervalId = setTimeout(() => revealNextMultiTrigCodeChar(), currentTrigCodeRevealStepDuration);
             animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
        } else {
            trigCodeRevealIntervalId = setTimeout(() => checkRevealCompletionMultiTrigCode(), Math.max(currentTrigCodeRevealStepDuration, OPTIONS.TRIG_CODE_ELIMINATION_DELAY_MS + OPTIONS.TRIG_CODE_ELIMINATION_ANIM_DURATION_MS + 100));
            animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
        }
    }, currentTrigCodeRevealStepDuration);
    animationSequenceTimeoutIds.push(trigCodeRevealIntervalId);
}

function checkRevealCompletionMultiTrigCode() {
    console.log("Multi Triglavian Code Reveal Complete.");
    if (trigCodeRevealIntervalId) { clearTimeout(trigCodeRevealIntervalId); trigCodeRevealIntervalId = null; }

    // Show all winners in the display
    const winnerNames = multiWinnerNamesArray.filter(n => n.trim());
    const displayText = winnerNames.join(', ');
    if (trigCodeWinnerNameSpan) trigCodeWinnerNameSpan.textContent = displayText;
    if (trigCodeWinnerNameDisplay) trigCodeWinnerNameDisplay.classList.add('visible');

    trigCodeParticipantsData.forEach(p => {
        p.element.classList.remove('highlight-match', 'eliminating');
        if (p.isWinner) {
            p.isEliminated = false;
            p.isVisiblyRemoved = false;
            p.element.style.display = 'flex';
            p.element.classList.remove('eliminated');
            p.element.classList.add('highlight-match');
            p.codeElement.innerHTML = p.code.split('').map(c => `<span class="matching-char">${c}</span>`).join('');
            if (p.element.scrollIntoView) {
                 p.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            if (!p.isVisiblyRemoved) {
                p.element.classList.add('eliminated');
                p.codeElement.innerHTML = p.code.split('').map(c => `<span>${c}</span>`).join('');
            }
        }
    });

    const revealMode = document.querySelector('.reveal-mode.visible');
    if (revealMode) revealMode.classList.add('slide-up');

    const countdownStartTimeoutId = setTimeout(() => {
        startCountdownPhase();
    }, OPTIONS.COUNTDOWN_START_DELAY_AFTER_TRIG_CODE_MS);
    animationSequenceTimeoutIds.push(countdownStartTimeoutId);

    // Pass comma-separated winners as the callback
    const callbackName = winnerNames.join(',');
    console.log(`JS checkRevealCompletionMultiTrigCode: Sending winners back: '${callbackName}'`);
    callPythonBackend("jsVisualsComplete", callbackName);
}

// --- ESI Data Handling ---
function handleESIDataUpdate(esiData) {
    console.log("JS_DEBUG: handleESIDataUpdate received:", esiData);
    if (!esiData) {
        console.warn("JS_DEBUG: handleESIDataUpdate received null or undefined data.");
        return;
    }
    // console.log("JS_DEBUG: RAW DATA:", JSON.stringify(esiData));

    console.log(`JS_DEBUG: Portrait base64 present: ${!!esiData.portrait_base64}, Length: ${esiData.portrait_base64 ? esiData.portrait_base64.length : 0}, Type: ${esiData.portrait_content_type}`);
    console.log(`JS_DEBUG: ESI Data: Name=${esiData.name}, Corp=${esiData.corporation_name}, Alliance=${esiData.alliance_name}`);

    // Determine which animation mode's winner display is currently active
    let activeWinnerDisplayContainer = null;
    let portraitImgElem = null;
    let nameSpanElem = null;
    let corpSpanElem = null;
    let allianceSpanElem = null;

    console.log("JS_DEBUG: Checking active modes for ESI update:");
    if(boxRevealMode) console.log(`JS_DEBUG: boxRevealMode.classList.contains('visible') = ${boxRevealMode.classList.contains('visible')}`);
    if(listRevealMode) console.log(`JS_DEBUG: listRevealMode.classList.contains('visible') = ${listRevealMode.classList.contains('visible')}`);
    if (triglavianRevealMode) console.log(`JS_DEBUG: triglavianRevealMode.classList.contains('visible') = ${triglavianRevealMode.classList.contains('visible')}`);
    if (nodePathRevealMode) console.log(`JS_DEBUG: nodePathRevealMode.classList.contains('visible') = ${nodePathRevealMode.classList.contains('visible')}`);
    if (trigConduitRevealMode) console.log(`JS_DEBUG: trigConduitRevealMode.classList.contains('visible') = ${trigConduitRevealMode.classList.contains('visible')}`);
    if (trigCodeRevealMode) console.log(`JS_DEBUG: trigCodeRevealMode.classList.contains('visible') = ${trigCodeRevealMode.classList.contains('visible')}`);


    if (boxRevealMode && boxRevealMode.classList.contains('visible')) {
        activeWinnerDisplayContainer = boxRevealMode;
        portraitImgElem = document.getElementById('hacking-winner-portrait');
        nameSpanElem = document.getElementById('hacking-winner-name'); // Main name span for this mode
        corpSpanElem = document.getElementById('hacking-winner-corp');
        allianceSpanElem = document.getElementById('hacking-winner-alliance');
        console.log("JS_DEBUG: Targeting Hacking/Box Reveal display elements for ESI.");
    } else if (listRevealMode && listRevealMode.classList.contains('visible')) {
        activeWinnerDisplayContainer = listWinnerDisplay;
        portraitImgElem = document.getElementById('list-winner-portrait');
        nameSpanElem = listWinnerNameSpan; // This is the main name span for this mode
        corpSpanElem = document.getElementById('list-winner-corp');
        allianceSpanElem = document.getElementById('list-winner-alliance');
        console.log("JS_DEBUG: Targeting List Reveal display elements for ESI.");
    } else if (triglavianRevealMode && triglavianRevealMode.classList.contains('visible')) {
        activeWinnerDisplayContainer = triglavianWinnerDisplay;
        portraitImgElem = triglavianWinnerPortraitImg;
        nameSpanElem = triglavianWinnerNameSpan; // Main name span for this mode
        corpSpanElem = triglavianWinnerCorpSpan;
        allianceSpanElem = triglavianWinnerAllianceSpan;
         console.log("JS_DEBUG: Targeting Triglavian display elements for ESI.");
    } else if (nodePathRevealMode && nodePathRevealMode.classList.contains('visible')) {
        activeWinnerDisplayContainer = nodePathWinnerDisplay;
        portraitImgElem = nodePathWinnerPortraitImg;
        nameSpanElem = nodePathWinnerNameSpan; // Main name span for this mode
        corpSpanElem = nodePathWinnerCorpSpan;
        allianceSpanElem = nodePathWinnerAllianceSpan;
        console.log("JS_DEBUG: Targeting Node Path display elements for ESI.");
    } else if (trigConduitRevealMode && trigConduitRevealMode.classList.contains('visible')) {
        activeWinnerDisplayContainer = trigConduitWinnerDisplay;
        portraitImgElem = trigConduitWinnerPortraitImg;
        nameSpanElem = trigConduitWinnerNameSpan; // Main name span for this mode
        corpSpanElem = trigConduitWinnerCorpSpan;
        allianceSpanElem = trigConduitWinnerAllianceSpan;
        console.log("JS_DEBUG: Targeting Trig Conduit display elements for ESI.");
    } else if (trigCodeRevealMode && trigCodeRevealMode.classList.contains('visible')) {
        activeWinnerDisplayContainer = trigCodeWinnerNameDisplay;
        portraitImgElem = trigCodeWinnerPortraitImg;
        nameSpanElem = trigCodeWinnerNameSpan; // Main name span for this mode
        corpSpanElem = trigCodeWinnerCorpSpan;
        allianceSpanElem = trigCodeWinnerAllianceSpan;
        console.log("JS_DEBUG: Targeting Trig Code Reveal display elements for ESI.");
    } else if (document.getElementById('neon-encrypted-mode') && document.getElementById('neon-encrypted-mode').classList.contains('visible')) {
        activeWinnerDisplayContainer = neonWinnerDisplay;
        portraitImgElem = neonWinnerPortraitImg;
        nameSpanElem = neonWinnerNameSpan; // Main name span for this mode
        corpSpanElem = neonWinnerCorpSpan;
        allianceSpanElem = neonWinnerAllianceSpan;
        console.log("JS_DEBUG: Targeting Neon Encrypted display elements for ESI.");
    }


    if (activeWinnerDisplayContainer) {
        // Update name if ESI provided one (typically animation already did, but for consistency)
        if (nameSpanElem && esiData.name && nameSpanElem.textContent.toUpperCase() !== esiData.name.toUpperCase()) {
             // It's generally better to let the core animation logic handle the main winner name text
             // unless this is the *only* place it's set for a particular mode.
             // For now, let's assume other parts of the animation set the main name.
             // nameSpanElem.textContent = (esiData.name || "N/A").toUpperCase();
        }

        if (portraitImgElem) {
            if (esiData.portrait_base64 && esiData.portrait_content_type) {
                portraitImgElem.src = `data:${esiData.portrait_content_type};base64,${esiData.portrait_base64}`;
                portraitImgElem.alt = "";
                portraitImgElem.style.display = 'block';
                console.log("JS_DEBUG: Winner portrait SRC set and displayed.");
            } else {
                portraitImgElem.src = "#";
                portraitImgElem.style.display = 'none';
                console.log("JS_DEBUG: No portrait base64/type, hiding image.");
            }
        } else {
            console.warn("JS_DEBUG: Portrait img element not found in active display for ESI update.");
        }

        if (corpSpanElem) {
            corpSpanElem.textContent = `Corp: ${esiData.corporation_name || "N/A"}`;
            corpSpanElem.style.display = 'block';
        } else {
            console.warn("JS_DEBUG: Corp span element not found in active display.");
        }

        if (allianceSpanElem) {
            if (esiData.alliance_name) {
                allianceSpanElem.textContent = `Alliance: ${esiData.alliance_name}`;
                allianceSpanElem.style.display = 'block';
            } else {
                 allianceSpanElem.textContent = '';
                 allianceSpanElem.style.display = 'none';
            }
        } else {
            console.warn("JS_DEBUG: Alliance span element not found in active display.");
        }

    } else {
        console.warn("JS_DEBUG: No active/targeted winner display found to update with ESI data.");
    }
}
window.handleESIDataUpdate = handleESIDataUpdate;


// --- Countdown Phase Logic ---
// ... (startCountdownPhase, updateCountdown, stopCountdownPhase remain same) ...
// Mark a winner as confirmed in the overlay with a tick
function markMultiWinnerConfirmed(winnerName) {
    try {
        const winnersListEl = document.getElementById('fulltimer-winners-list');
        if (!winnersListEl) return;
        const items = winnersListEl.querySelectorAll('.multi-winner-item');
        items.forEach(item => {
            const name = item.textContent.replace(/^\d+\.\s*/, '').trim();
            if (name.toLowerCase() === winnerName.trim().toLowerCase()) {
                const tick = document.createElement('span');
                tick.textContent = ' \u2713';
                tick.style.color = '#4af1f2';
                tick.style.fontWeight = 'bold';
                tick.style.marginLeft = '8px';
                item.appendChild(tick);
            }
        });
    } catch(e) { console.warn('JS: Failed to mark winner confirmed', e); }
}

function showMultiWinnersInOverlay() {
    try {
        const winnersListEl = document.getElementById('fulltimer-winners-list');
        const headerEl = document.getElementById('fulltimer-header');
        if (!winnersListEl) return;
        if (isMultiWinnerMode && multiWinnerNamesArray.length > 0) {
            winnersListEl.style.display = 'flex';
            winnersListEl.innerHTML = '';
            if (headerEl) headerEl.textContent = 'WINNERS IDENTIFIED';
            const sortedWinners = [...new Set(multiWinnerNamesArray.map(n => n.trim()).filter(n => n))];
            sortedWinners.forEach((name, idx) => {
                const item = document.createElement('div');
                item.className = 'multi-winner-item';
                item.textContent = `${idx + 1}. ${name}`;
                item.style.animationDelay = `${idx * 0.12}s`;
                winnersListEl.appendChild(item);
            });
            const singleWinnerEl = document.getElementById('fulltimer-winner');
            if (singleWinnerEl) singleWinnerEl.style.display = 'none';
        } else {
            winnersListEl.style.display = 'none';
            winnersListEl.innerHTML = '';
            if (headerEl) headerEl.textContent = 'WINNER IDENTIFIED';
            const singleWinnerEl = document.getElementById('fulltimer-winner');
            if (singleWinnerEl) singleWinnerEl.style.display = 'block';
        }
    } catch(e) { console.warn('JS: Failed to show multi-winners list', e); }
}

function startCountdownPhase() {
    console.log("JS: startCountdownPhase() called");
    console.log("JS: Countdown elements check - container:", !!countdownContainer, "text:", !!countdownText, "progress:", !!countdownProgress);
    if (!countdownContainer || !countdownText || !countdownProgress) {
        console.error("Countdown elements missing!");
        return;
    }
    console.log(`JS: Starting countdown VISUAL phase (${currentCountdownDurationS}s)`);
    console.log("JS: About to add 'visible' class to countdown container");
    isCountdownActive = true;
    countdownStartTime = performance.now();
    countdownContainer.classList.add('visible');
    // Show the full-screen confirmation overlay with the winner name
    try {
        if (!fulltimerOverlay) {
            fulltimerOverlay = document.getElementById('fulltimer-overlay');
            fulltimerWinner = document.getElementById('fulltimer-winner');
            fulltimerTimer = document.getElementById('fulltimer-timer');
        }
        if (fulltimerOverlay && fulltimerWinner && fulltimerTimer) {
            fulltimerWinner.textContent = currentWinnerNameForCallback || '';
            // Multi-winner: show the list instead
            showMultiWinnersInOverlay();
            // Platform badge
            try {
                const platformEl = document.getElementById('fulltimer-platform');
                if (platformEl && currentWinnerPlatform && !isMultiWinnerMode) {
                    const platformClass = currentWinnerPlatform.toLowerCase();
                    platformEl.innerHTML = `WINNING FROM <span class="platform-name ${platformClass}">${currentWinnerPlatform}</span>`;
                    platformEl.className = 'fulltimer-platform';
                    platformEl.style.display = 'block';
                    requestAnimationFrame(() => platformEl.classList.add('visible'));
                } else if (platformEl) {
                    platformEl.style.display = 'none';
                    platformEl.classList.remove('visible');
                }
            } catch(e) { /* ignore */ }
            // Show overlay container and make it visible so CSS entrance animations run
            fulltimerOverlay.style.display = 'flex';
            void fulltimerOverlay.offsetWidth; // force reflow so CSS opacity transition plays
            fulltimerOverlay.classList.add('visible');
            
            // Populate and start cycling name lists for the overlay
            try {
                populateFulltimerCyclingLists();
            } catch (e) {
                console.warn('JS: Failed to populate fulltimer cycling lists', e);
            }
            // Switch the shared countdown into centered mode so the animated ring appears in the overlay
            try {
                console.log('JS: Activating centered countdown ring for overlay');
                // Add a body-level marker so we can hide the original right-side timer via CSS
                try { document.body.classList.add('fulltimer-active'); } catch(e) { /* ignore if unavailable */ }
                // Move the live countdown ring into the inner-panel so it flows below the winner name
                try {
                    const _ftInnerPanel = fulltimerOverlay ? fulltimerOverlay.querySelector('.fulltimer-content .inner-panel') : null;
                    const _ftSlot = _ftInnerPanel ? _ftInnerPanel.querySelector('.countdown-ring-slot') : null;
                    if (countdownContainer && _ftInnerPanel && countdownContainer.parentNode !== _ftInnerPanel) {
                        if (!_countdownOriginalParent) {
                            _countdownOriginalParent = countdownContainer.parentNode;
                            _countdownOriginalNextSibling = countdownContainer.nextSibling;
                        }
                        if (_ftSlot) {
                            _ftInnerPanel.insertBefore(countdownContainer, _ftSlot);
                        } else {
                            _ftInnerPanel.appendChild(countdownContainer);
                        }
                    }
                } catch (e) { console.warn('JS: failed to move countdown into inner panel', e); }

                // Schedule the centered/visible classes after layout/paint using two rAFs to reduce flicker
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        try {
                            // preserve any inline styles so we can restore them later
                            if (countdownContainer && !_countdownOriginalInlineStyle) {
                                _countdownOriginalInlineStyle = countdownContainer.getAttribute('style') || '';
                            }
                            countdownContainer.classList.add('in-ft-panel');
                            countdownContainer.classList.add('visible');
                            // mark overlay so CSS can hide the fallback numeric timer reliably
                            fulltimerOverlay.classList.add('overlay-ring-active');

                            // Position the countdown so it sits below the inner-panel to avoid overlap
                            function positionCountdownBelowInnerPanel() {
                                // Ring is now a flex item inside the inner-panel — CSS handles layout.
                                // Clear any stale inline styles so CSS rules take over cleanly.
                                try { if (countdownContainer) countdownContainer.removeAttribute('style'); } catch (e) { /* ignore */ }
                            }
                            // run once now
                            positionCountdownBelowInnerPanel();
                            // install resize handler to keep it placed correctly
                            _countdownResizeHandler = function () { positionCountdownBelowInnerPanel(); };
                            window.addEventListener('resize', _countdownResizeHandler);

                            // Emit computed-style debug info AFTER classes applied so we can inspect final visibility
                            try {
                                if (pythonBackend && typeof pythonBackend.jsDebugMessage === 'function') {
                                    const comp = window.getComputedStyle(countdownContainer);
                                    const parent = countdownContainer.parentElement;
                                    const info = {
                                        parentId: parent ? parent.id || null : null,
                                        parentTag: parent ? parent.tagName : null,
                                        classes: Array.from(countdownContainer.classList || []),
                                        display: comp.display,
                                        visibility: comp.visibility,
                                        opacity: comp.opacity,
                                        zIndex: comp.zIndex,
                                        position: comp.position,
                                        left: comp.left,
                                        top: comp.top,
                                        transform: comp.transform
                                    };
                                    pythonBackend.jsDebugMessage('overlay-countdown-styles:' + JSON.stringify(info));
                                }
                            } catch (e) { /* ignore debug emission errors */ }
                            // Additional detailed SVG/debug info
                            try {
                                if (pythonBackend && typeof pythonBackend.jsDebugMessage === 'function') {
                                    const rect = countdownContainer.getBoundingClientRect();
                                    const svg = countdownContainer.querySelector('.countdown-svg');
                                    const progressEl = countdownContainer.querySelector('.countdown-progress');
                                    const trackEl = countdownContainer.querySelector('.countdown-track');
                                    const svgInfo = {};
                                    if (svg) {
                                        svgInfo.viewBox = svg.getAttribute('viewBox');
                                        svgInfo.width = svg.clientWidth; svgInfo.height = svg.clientHeight;
                                    }
                                    if (progressEl) {
                                        const cs = window.getComputedStyle(progressEl);
                                        svgInfo.progressStroke = cs.stroke || progressEl.getAttribute('stroke') || null;
                                        svgInfo.progressStrokeWidth = cs.strokeWidth || progressEl.getAttribute('stroke-width') || null;
                                        svgInfo.dasharray = progressEl.style.strokeDasharray || progressEl.getAttribute('stroke-dasharray') || null;
                                        svgInfo.dashoffset = progressEl.style.strokeDashoffset || progressEl.getAttribute('stroke-dashoffset') || null;
                                    }
                                    if (trackEl) {
                                        const cst = window.getComputedStyle(trackEl);
                                        svgInfo.trackStroke = cst.stroke || trackEl.getAttribute('stroke') || null;
                                    }
                                    const debug2 = {
                                        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left },
                                        svgInfo: svgInfo
                                    };
                                    pythonBackend.jsDebugMessage('overlay-countdown-debug:' + JSON.stringify(debug2));
                                }
                            } catch (e) { /* swallow */ }
                        } catch (e) { console.warn('JS: error while activating centered countdown classes', e); }
                    });
                });
            } catch (e) { console.warn('JS: failed to activate centered ring', e); }
        }
    } catch (e) { console.warn('Failed to show fulltimer overlay', e); }
    // Update full-screen overlay timer as well
    try { if (fulltimerTimer && fulltimerOverlay && fulltimerOverlay.classList.contains('visible')) { fulltimerTimer.textContent = String(displayValue); } } catch(e) {}
    countdownText.textContent = Math.ceil(currentCountdownDurationS);
    countdownProgress.style.transition = 'none';
    countdownProgress.style.strokeDashoffset = 0;
    void countdownProgress.offsetWidth;
    countdownProgress.style.transition = 'stroke-dashoffset 0.1s linear, stroke 0.5s ease-out';
    countdownProgress.style.stroke = 'var(--countdown-yellow)';
    console.log("JS: Countdown visual setup complete. Container should now be visible.");

    if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.startCountdownEffects === 'function') {
        console.log("JS: Triggering NetworkAnimation countdown effects.");
        NetworkAnimation.startCountdownEffects(currentCountdownDurationS);
    } else {
        console.warn("NetworkAnimation module or startCountdownEffects function missing!");
    }
    // Note: overlay hide and expiry notification are handled by stopCountdownPhase()
}
function updateCountdown() {
    if (!isCountdownActive || !countdownText || !countdownProgress) return;
    const elapsedTime = performance.now() - countdownStartTime;
    const currentCountdownValue = Math.max(0, currentCountdownDurationS - elapsedTime / 1000);
    const displayValue = Math.ceil(currentCountdownValue);
    if (countdownText.textContent !== String(displayValue)) { countdownText.textContent = displayValue; }
    const progressFraction = currentCountdownValue / currentCountdownDurationS;
    const offset = progressRingCircumference * (1 - progressFraction);
    countdownProgress.style.strokeDashoffset = Math.max(0, offset);
    if (currentCountdownValue <= 5 && currentCountdownValue > 0) {
        if (!countdownUrgencyActive) {
            countdownUrgencyActive = true;
            if (countdownContainer) countdownContainer.classList.add('countdown-urgent');
            if (fulltimerOverlay) fulltimerOverlay.classList.add('countdown-urgent');
            countdownProgress.style.stroke = ''; // clear inline stroke so CSS flash animation plays
            countdownProgress.style.transition = 'none';
        }
    } else if (currentCountdownValue > 5) {
        if (countdownProgress.style.stroke !== 'var(--countdown-yellow)') {
            countdownProgress.style.stroke = 'var(--countdown-yellow)';
        }
    } else {
        // Expired
        stopCountdownPhase(true);
    }
}
function stopCountdownPhase(finishedNaturally = false) {
    if (!isCountdownActive) return;
    isCountdownActive = false;
    console.log(`JS: Stopping countdown VISUAL phase. Finished Naturally: ${finishedNaturally}`);
    if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.stopCountdownEffects === 'function') {
        NetworkAnimation.stopCountdownEffects(finishedNaturally);
    }
    if (countdownContainer) { countdownContainer.classList.remove('visible'); countdownContainer.classList.remove('countdown-urgent'); }
    countdownUrgencyActive = false;
    if (fulltimerOverlay) fulltimerOverlay.classList.remove('countdown-urgent');
    try { const platformEl = document.getElementById('fulltimer-platform'); if (platformEl) { platformEl.classList.remove('visible'); platformEl.style.display = 'none'; } } catch(e) {}
    if (countdownProgress) {
        countdownProgress.style.stroke = ''; // clear any urgency inline stroke
        countdownProgress.style.transition = 'none';
        countdownProgress.style.strokeDashoffset = 0;
        void countdownProgress.offsetWidth;
        countdownProgress.style.transition = 'stroke-dashoffset 0.1s linear, stroke 0.5s ease-out';
    }

    // Hide full-screen overlay if present
    try {
        if (!fulltimerOverlay) {
            fulltimerOverlay = document.getElementById('fulltimer-overlay');
            fulltimerWinner = document.getElementById('fulltimer-winner');
            fulltimerTimer = document.getElementById('fulltimer-timer');
        }
        if (fulltimerOverlay) {
            fulltimerOverlay.classList.remove('visible');
            setTimeout(() => {
                if (fulltimerOverlay) fulltimerOverlay.style.display = 'none';
                // Remove body-level marker so original right-side timer returns only after overlay is hidden
                try { document.body.classList.remove('fulltimer-active'); } catch(e) { /* ignore */ }
            }, 320);
        }
    // Restore countdown not-centered so it returns to its normal location
        try {
            console.log('JS: Deactivating centered countdown ring for overlay');
            // Remove centered/in-ft-panel/visible flags
            if (countdownContainer) { countdownContainer.classList.remove('centered'); countdownContainer.classList.remove('in-ft-panel'); }
            if (fulltimerOverlay) fulltimerOverlay.classList.remove('overlay-ring-active');

            // remove resize handler (if any)
            try {
                if (_countdownResizeHandler) {
                    window.removeEventListener('resize', _countdownResizeHandler);
                    _countdownResizeHandler = null;
                }
            } catch (e) { /* ignore */ }

            // If we previously moved the countdown into the overlay, move it back to its original parent
            try {
                if (countdownContainer && _countdownOriginalParent) {
                    if (_countdownOriginalNextSibling && _countdownOriginalNextSibling.parentNode === _countdownOriginalParent) {
                        _countdownOriginalParent.insertBefore(countdownContainer, _countdownOriginalNextSibling);
                    } else {
                        _countdownOriginalParent.appendChild(countdownContainer);
                    }
                    // Clear stored refs
                    _countdownOriginalParent = null;
                    _countdownOriginalNextSibling = null;
                }
            } catch (e) { console.warn('JS: failed to restore countdown to original parent', e); }

            // restore inline style if we saved one
            try {
                if (countdownContainer && typeof _countdownOriginalInlineStyle !== 'undefined' && _countdownOriginalInlineStyle !== null) {
                    if (_countdownOriginalInlineStyle.trim() === '') countdownContainer.removeAttribute('style');
                    else countdownContainer.setAttribute('style', _countdownOriginalInlineStyle);
                    _countdownOriginalInlineStyle = null;
                }
            } catch (e) { console.warn('JS: failed to restore countdown inline style', e); }
        } catch(e) { console.warn('JS: failed to deactivate centered ring', e); }
    } catch (e) { console.warn('Failed to hide fulltimer overlay', e); }

    // If the countdown finished naturally (timer expired), notify Python so it can play sound and handle timeout
    if (finishedNaturally) {
        try { callPythonBackend('jsConfirmationExpired', currentWinnerNameForCallback || ''); } catch(e) { console.warn('Failed to call backend for confirmation expiry', e); }
    }
}


// --- Fulltimer Overlay Cycling Lists ---
function populateFulltimerCyclingLists() {
    // Get the list containers
    const leftUl = document.getElementById('fulltimer-left-bg-list-ul');
    const rightUl = document.getElementById('fulltimer-right-bg-list-ul');
    
    if (!leftUl || !rightUl) {
        console.warn('JS: Fulltimer cycling list containers not found');
        return;
    }
    
    // Store references for later cleanup
    fulltimerBgListLeftUl = leftUl;
    fulltimerBgListRightUl = rightUl;
    
    // Clear existing items
    leftUl.innerHTML = '';
    rightUl.innerHTML = '';
    
    // Get participant list from cached data (updated by updateParticipantsJS from Python backend)
    let participantNames = _cachedParticipantList && Array.isArray(_cachedParticipantList) && _cachedParticipantList.length > 0 ? _cachedParticipantList : [];
    
    console.log('JS: populateFulltimerCyclingLists - Participant count:', participantNames.length, 'Names:', participantNames.slice(0, 5));
    
    // If no participants, use a fallback
    if (!participantNames || participantNames.length === 0) {
        console.warn('JS: No participants in cached list, using fallback');
        participantNames = ['Entrant_01', 'Entrant_02', 'Entrant_03', 'Entrant_04', 'Entrant_05'];
    }
    
    console.log('JS: Populating fulltimer lists with ' + participantNames.length + ' participants');
    
    // For seamless infinite scrolling, repeat the list enough times to fill the viewport
    // This ensures no gaps when the animation loops
    const repeatedList = Array(50).fill(null).flatMap(() => participantNames);
    
    // Populate left list (regular names)
    repeatedList.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        leftUl.appendChild(li);
    });
    
    // Populate right list (same names for now; can be Triglavian codes if desired)
    repeatedList.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        rightUl.appendChild(li);
    });
    
    console.log('JS: Populated fulltimer cycling lists with ' + repeatedList.length + ' items each for seamless looping');
}

// --- Stop / Cleanup ---
function stopAnimationSequence(opts) {
    var _soOpts = opts || {};
    console.log("JS: Stopping ALL animation sequences...");
    if (_pendingAnimStart !== null) { clearTimeout(_pendingAnimStart); _pendingAnimStart = null; }
    clearAnimationSequenceTimeouts();

    // --- Force-wipe countdown visuals unconditionally ---
    // Guards against stuck timer caused by missed cleanup paths (e.g. early-exits skipped when !isCountdownActive).
    // DOM state is reset here; stopCountdownPhase() below will handle flag and NetworkAnimation cleanup.
    try {
        // Remove resize listener if registered
        if (_countdownResizeHandler) {
            try { window.removeEventListener('resize', _countdownResizeHandler); } catch(e) {}
            _countdownResizeHandler = null;
        }
        // Use the live module-level ref OR fresh DOM query
        const _cdEl = countdownContainer || document.getElementById('countdown-container');
        if (_cdEl) {
            _cdEl.classList.remove('visible', 'countdown-urgent', 'centered');
            // Restore inline style if one was saved
            try {
                if (typeof _countdownOriginalInlineStyle !== 'undefined' && _countdownOriginalInlineStyle !== null) {
                    if (_countdownOriginalInlineStyle.trim() === '') _cdEl.removeAttribute('style');
                    else _cdEl.setAttribute('style', _countdownOriginalInlineStyle);
                    _countdownOriginalInlineStyle = null;
                }
            } catch(e) {}
            // Restore countdown to its original DOM parent if it was moved to document.body
            if (_cdEl.parentNode === document.body && _countdownOriginalParent) {
                try {
                    if (_countdownOriginalNextSibling && _countdownOriginalNextSibling.parentNode === _countdownOriginalParent) {
                        _countdownOriginalParent.insertBefore(_cdEl, _countdownOriginalNextSibling);
                    } else {
                        _countdownOriginalParent.appendChild(_cdEl);
                    }
                } catch(e) {}
                _countdownOriginalParent = null;
                _countdownOriginalNextSibling = null;
            }
        }
        // Reset ring progress
        if (countdownProgress) {
            countdownProgress.style.stroke = '';
            countdownProgress.style.transition = 'none';
            countdownProgress.style.strokeDashoffset = 0;
        }
        countdownUrgencyActive = false;
        if (countdownContainer) { countdownContainer.classList.remove('centered'); countdownContainer.classList.remove('in-ft-panel'); }
        // Start fulltimer overlay fade-out via CSS transition (stopCountdownPhase will set display:none after transition completes)
        try {
            const _ftEl = fulltimerOverlay || document.getElementById('fulltimer-overlay');
            if (_ftEl) { _ftEl.classList.remove('visible'); _ftEl.classList.remove('countdown-urgent'); }
            const _ptEl = document.getElementById('fulltimer-platform');
            if (_ptEl) { _ptEl.classList.remove('visible'); _ptEl.style.display = 'none'; }
        } catch(e) {}
    } catch(e) { console.warn('JS: Force countdown wipe failed:', e); }
    // Remove jackpot gold theme
    try { document.body.classList.remove('jackpot-mode'); } catch(e) {}
    // --- end force-wipe ---
    if (listAnimationFrameId) { cancelAnimationFrame(listAnimationFrameId); listAnimationFrameId = null; }
    if(cyclingIntervalId) clearInterval(cyclingIntervalId); cyclingIntervalId = null;
    if(revealTimeoutId) clearTimeout(revealTimeoutId); revealTimeoutId = null;

    if (triglavianCyclingIntervalId) clearInterval(triglavianCyclingIntervalId); triglavianCyclingIntervalId = null;
    if (triglavianRevealTimeoutId) clearTimeout(triglavianRevealTimeoutId); triglavianRevealTimeoutId = null;
    Object.values(trigTempRevealTimeouts).forEach(clearTimeout); trigTempRevealTimeouts = {};
    if (nodePathRevealTimeoutId) clearTimeout(nodePathRevealTimeoutId); nodePathRevealTimeoutId = null;
    if (nodePathActiveNodeTimeoutId) clearTimeout(nodePathActiveNodeTimeoutId); nodePathActiveNodeTimeoutId = null;
    if (trigConduitIntervalId) { clearInterval(trigConduitIntervalId); trigConduitIntervalId = null; }
    Object.values(trigConduitScrambleIntervals).forEach(clearInterval); trigConduitScrambleIntervals = {};
    if (trigCodeRevealIntervalId) { clearInterval(trigCodeRevealIntervalId); trigCodeRevealIntervalId = null; }

    // Reset Neon Encrypted font classes and hide the mode element
    const lettersEl = document.getElementById('neon-encrypted-letters');
    if (lettersEl) {
        lettersEl.classList.remove('trig-font', 'final-font', 'scrambling');
    }
    const _neonStopEl = document.getElementById('neon-encrypted-mode');
    if (_neonStopEl) { _neonStopEl.style.display = 'none'; _neonStopEl.classList.remove('visible', 'slide-up'); }
    if (neonWinnerDisplay) { neonWinnerDisplay.style.display = 'none'; neonWinnerDisplay.classList.remove('visible'); }
    if (typeof bodyElement !== 'undefined' && bodyElement) { bodyElement.classList.remove('show-neon-encrypted'); }
    stopNeonMatrixRain();

    // Reset Neural Interface Decode
    if (neuralDecodeCycleIntervalId !== null) { clearInterval(neuralDecodeCycleIntervalId); neuralDecodeCycleIntervalId = null; }
    const _ndStopEl = document.getElementById('neural-decode-mode');
    if (_ndStopEl) { _ndStopEl.style.display = 'none'; _ndStopEl.classList.remove('visible', 'slide-up'); }
    if (typeof bodyElement !== 'undefined' && bodyElement) { bodyElement.classList.remove('show-neural-decode'); }
    neuralDecodeColData = [];
    const _ndColsStopEl = document.getElementById('nd-columns-container');
    if (_ndColsStopEl) _ndColsStopEl.innerHTML = '';

    if (prizeRevealContainer) {
        prizeRevealContainer.classList.remove('visible');
        // <<< THIS IS THE KEY CHANGE >>>
        // Removed the setTimeout to prevent a race condition when starting the prize reveal animation.
        // The calling function is now responsible for any desired fade-out transition.
        prizeRevealContainer.style.display = 'none';
    }
    if (animationContent) { 
        animationContent.style.display = 'flex';
        if (_soOpts.fadeIn) {
            // Fade the main content back in after the fulltimer overlay has begun fading out
            animationContent.style.opacity = '0';
            setTimeout(function() {
                if (animationContent) {
                    animationContent.style.transition = 'opacity 0.55s ease-in';
                    animationContent.style.opacity = '1';
                }
            }, 120);
        }
    }

    isListScrolling = false;
    stopCountdownPhase(false);
    resetListState();
    resetTriglavianState();
    resetNodePathState();
    resetTrigConduitState();
    resetTrigCodeRevealState();
    _stopHackLoop();
    boxes.forEach(box => { if (box) { box.char = ''; box.revealed = false; box.pulseT = 0; } });
    revealedIndices.clear();

    // Clear ESI display elements to prevent stale data "echo" between draws
    [triglavianWinnerDisplay, nodePathWinnerDisplay, trigConduitWinnerDisplay, trigCodeWinnerNameDisplay, neonWinnerDisplay, document.getElementById('nd-winner-display'), deepseekWinnerDisplay].forEach(function(el) { if(el) { el.classList.remove('visible', 'standalone'); } });
    [triglavianWinnerPortraitImg, nodePathWinnerPortraitImg, trigConduitWinnerPortraitImg, trigCodeWinnerPortraitImg, document.getElementById('list-winner-portrait'), deepseekWinnerPortraitImg].forEach(function(el) { if(el) { el.src = "#"; el.style.display = 'none'; } });
    [triglavianWinnerCorpSpan, triglavianWinnerAllianceSpan, nodePathWinnerCorpSpan, nodePathWinnerAllianceSpan, trigConduitWinnerCorpSpan, trigConduitWinnerAllianceSpan, trigCodeWinnerCorpSpan, trigCodeWinnerAllianceSpan, document.getElementById('list-winner-corp'), document.getElementById('list-winner-alliance'), deepseekWinnerCorpSpan, deepseekWinnerAllianceSpan].forEach(function(el) { if(el) el.textContent = ''; });
}

// --- Neon matrix-rain canvas backdrop ---
function startNeonMatrixRain(canvas, stageEl) {
    if (!canvas || !stageEl) return;
    stopNeonMatrixRain();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = stageEl.clientWidth || stageEl.offsetWidth || 400;
    const H = stageEl.clientHeight || stageEl.offsetHeight || 200;
    canvas.width = W;
    canvas.height = H;
    const glyphs = (OPTIONS.CHARS || 'ABCDEF0123456789') + (OPTIONS.TRIGLAVIAN_GLYPHS || '');
    const fontSize = Math.max(12, Math.min(20, Math.floor(H / 16)));
    ctx.font = `bold ${fontSize}px monospace`;
    const columns = Math.max(1, Math.floor(W / fontSize));
    if (neonRainDrops.length !== columns) {
        neonRainDrops = [];
        for (let i = 0; i < columns; i++) neonRainDrops.push(Math.floor(Math.random() * -60));
    }
    const rainGlyph = () => glyphs.charAt(Math.floor(Math.random() * glyphs.length));
    function draw() {
        ctx.fillStyle = 'rgba(3, 12, 3, 0.10)';
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'top';
        for (let i = 0; i < columns; i++) {
            const y = neonRainDrops[i] * fontSize;
            // occasional bright leading glyph
            const bright = Math.random() > 0.94;
            ctx.fillStyle = bright ? 'rgba(190, 255, 210, 0.9)' : 'rgba(16, 255, 50, 0.55)';
            ctx.fillText(rainGlyph(), i * fontSize, y);
            if (y > H && Math.random() > 0.975) {
                neonRainDrops[i] = Math.floor(Math.random() * -40);
            } else {
                neonRainDrops[i]++;
            }
        }
        neonRainRAFId = requestAnimationFrame(draw);
    }
    neonRainRAFId = requestAnimationFrame(draw);
}

function stopNeonMatrixRain() {
    if (neonRainRAFId) {
        cancelAnimationFrame(neonRainRAFId);
        neonRainRAFId = null;
    }
    const canvas = document.getElementById('neon-encrypted-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// --- Neon Encrypted Reveal (NEW) ---
function startNeonEncryptedReveal(winnerName, opts = {}) {
    console.log(`JS: startNeonEncryptedReveal called for '${winnerName}' with opts:`, opts);
    if (!document.getElementById('neon-encrypted-mode')) {
        console.error('Neon encrypted DOM missing');
        callPythonBackend('jsVisualsComplete', winnerName || '');
        return;
    }
    stopAnimationSequence(); // clear previous
    // Ensure main content container remains visible so mode children can be displayed
    // (previous behavior hid the parent container which prevented the neon mode from showing)
    if (animationContent) animationContent.style.display = 'flex';

    const modeEl = document.getElementById('neon-encrypted-mode');
    const lettersEl = document.getElementById('neon-encrypted-letters');
    const noiseEl = document.getElementById('neon-encrypted-left-noise');
    const phaseEl = document.getElementById('neon-encrypted-phase');
    const progressFill = document.getElementById('neon-encrypted-progress-fill');
    const currentEl = document.getElementById('neon-encrypted-current');

    if (!lettersEl || !phaseEl || !progressFill || !currentEl) {
        console.error('Neon encrypted elements missing');
        callPythonBackend('jsVisualsComplete', winnerName || '');
        return;
    }



    modeEl.style.display = 'flex';
    setTimeout(() => modeEl.classList.add('visible'), 30);

    // Kick off the matrix-rain backdrop behind the letters
    const rainCanvas = document.getElementById('neon-encrypted-canvas');
    const stageEl = document.getElementById('neon-encrypted-stage');
    setTimeout(() => startNeonMatrixRain(rainCanvas, stageEl), 60);

    const fullDuration = parseInt(opts.durationMs || 18000, 10);
    const scrambleDuration = Math.max(2000, Math.floor(fullDuration * 0.55));
    const finalRevealDelay = fullDuration - scrambleDuration;

    // Prepare an initial placeholder name of same length
    const cleanName = String(winnerName || 'WINNER').toUpperCase();
    const nameLen = cleanName.length;
    const placeholderArray = new Array(nameLen).fill('█');
    lettersEl.textContent = placeholderArray.join('');
    lettersEl.classList.add('scrambling', 'trig-font');  // Use trig-font for Triglavian display during scrambling

    // populate noise panel with small random glyphs (skip if hidden)
    try {
        if (noiseEl && window.getComputedStyle(noiseEl).display !== 'none') {
            const glyphs = OPTIONS.CHARS + OPTIONS.TRIGLAVIAN_GLYPHS;
            let noise = '';
            for (let r = 0; r < 12; r++) {
                let row = '';
                for (let c = 0; c < 60; c++) row += glyphs.charAt(Math.floor(Math.random()*glyphs.length));
                noise += row + '\n';
            }
            noiseEl.textContent = noise;
        }
    } catch(e) { /* ignore */ }

    // Animate scramble -> gradual reveal
    const scrambleIntervalMs = 45;
    let scrambleElapsed = 0;
    // Terminal helpers
    const terminalInner = document.getElementById('neon-terminal-inner');
    const terminalCaret = document.getElementById('neon-terminal-caret');
    const maxTerminalLines = 8;
    // track typing timeouts so we can clear them during cleanup
    let typingTimeouts = [];

    function trimTerminal() {
        if (!terminalInner) return;
        while (terminalInner.children.length > maxTerminalLines) terminalInner.removeChild(terminalInner.firstChild);
        // No scrolling — we hide overflow in CSS and keep a stable terminal height
    }

    // Append an empty line element and return it
    function createTerminalLine() {
        if (!terminalInner) return null;
        const line = document.createElement('div');
        line.className = 'line';
        terminalInner.appendChild(line);
        trimTerminal();
        return line;
    }

    // Typing function: types text char-by-char into a fresh line
    function typeTerminalLine(text, charDelay = 28, onComplete = null) {
        if (!terminalInner) {
            if (onComplete) onComplete();
            return;
        }
        const line = createTerminalLine();
        if (!line) { if (onComplete) onComplete(); return; }
        let idx = 0;
        function step() {
            if (idx <= text.length - 1) {
                line.textContent += text.charAt(idx);
                idx++;
                trimTerminal();
                const t = setTimeout(step, charDelay + Math.floor(Math.random()*6));
                typingTimeouts.push(t);
            } else {
                if (onComplete) onComplete();
            }
        }
        step();
    }

    // Predefined flavor steps that will print at percentage thresholds
    const flavorSteps = [
        { pct: 6, text: '[CONNECT] Establishing secure tunnel...' , done: false},
        { pct: 18, text: '[RX] Receiving encrypted payload...' , done: false},
        { pct: 34, text: '[DETECT] Entropy anomaly detected - spawning worker threads...' , done: false},
        { pct: 52, text: '[DECRYPT] Brute-forcing keys (this may take a while)...' , done: false},
        { pct: 74, text: '[CRACK] Partial key acquired. Testing vectors...' , done: false},
        { pct: 92, text: '[VERIFY] Candidate key validated.' , done: false},
    ];

    // ensure the terminal is visible with entrance animation
    try { const th = document.getElementById('neon-hacking-terminal'); if (th) { th.classList.add('visible'); } } catch (e) {}

    // Track which letters were revealed in previous frame to detect new reveals
    let prevRevealedIndices = new Set();
    let soundCooldown = 0;
    const soundCooldownMs = 350; // Prevent sound spam - time between sounds

    let scrambleIntervalId = setInterval(() => {
        scrambleElapsed += scrambleIntervalMs;
        // Systematic decryption sweep: a decrypt window moves left→right across the name.
        // Letters behind the window are solidly revealed, letters inside it flicker,
        // letters ahead of it stay scrambled - reads as a clean decrypt rather than noise.
        const sweepPos = Math.min(nameLen, (scrambleElapsed / scrambleDuration) * nameLen * 1.15);
        const windowSize = Math.max(1, Math.floor(nameLen * 0.3));
        let display = '';
        let currentRevealedIndices = new Set();
        
        for (let i = 0; i < nameLen; i++) {
            let shouldReveal = false;
            if (i <= sweepPos - windowSize) {
                shouldReveal = true;
            } else if (i <= sweepPos) {
                shouldReveal = Math.random() < 0.85;
            }
            if (shouldReveal) {
                // Revealed letters show in normal font with final-font styling
                display += '<span class="revealed-letter" style="font-family: Arial, sans-serif; font-size: 2.2em;">' + cleanName[i] + '</span>';
                currentRevealedIndices.add(i);
                
                // Play sound if this letter just got revealed (wasn't in previous frame)
                if (!prevRevealedIndices.has(i) && soundCooldown <= 0) {
                    try {
                        if (typeof callPythonBackend === 'function') {
                            callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
                            soundCooldown = soundCooldownMs;
                        }
                    } catch (e) {
                        console.error('Error playing sound:', e);
                    }
                }
            } else {
                // Unrevealed letters show in triglavian font
                display += '<span class="unrevealed-letter" style="font-family: \'Triglavian - Complete Regular\', monospace; font-size: 2.2em;">' + OPTIONS.CHARS.charAt(Math.floor(Math.random() * OPTIONS.CHARS.length)) + '</span>';
            }
        }
        prevRevealedIndices = currentRevealedIndices;
        soundCooldown -= scrambleIntervalMs;
        
        lettersEl.innerHTML = display;
        // update progress
        const pct = Math.min(100, Math.floor((scrambleElapsed / scrambleDuration) * 100));
        phaseEl.textContent = `ENCRYPTED (${pct}%)`;
        progressFill.style.width = `${pct}%`;
        const plainText = display.replace(/<[^>]*>/g, '');
        currentEl.textContent = plainText.slice(0, Math.min(4, plainText.length));

        // Emit flavor steps at thresholds (once each) — use typing for flavor lines
        try {
            flavorSteps.forEach(step => {
                if (!step.done && pct >= step.pct) { step.done = true; typeTerminalLine(step.text, 26); }
            });
            // Occasionally emit small noisy debug lines while scrambling
            if (Math.random() < 0.02) {
                const rnd = Math.random();
                if (rnd < 0.33) typeTerminalLine('[DBG] Packet checksum ok.', 20);
                else if (rnd < 0.66) typeTerminalLine('[DBG] Latency spike detected...', 20);
                else typeTerminalLine('[DBG] Noise floor within acceptable range.', 20);
            }
        } catch (e) { console.warn('Terminal flavor emission error', e); }

        if (scrambleElapsed >= scrambleDuration) {
            clearInterval(scrambleIntervalId);
            // final terminal messages before reveal
            typeTerminalLine('[DECRYPT] Finalizing decryption vector...', 20);
            const finalPreRevealTimeout = setTimeout(() => {
                typeTerminalLine('[SUCCESS] Decryption complete. Extracting payload...', 20);
            }, 420);
            animationSequenceTimeoutIds.push(finalPreRevealTimeout);

            // --- Dramatic per-letter flash reveal: white → bright green → settled ---
            // Build all letter spans (initially invisible), then stagger-fire the CSS flash
            lettersEl.innerHTML = '';
            lettersEl.classList.remove('scrambling', 'trig-font');
            lettersEl.classList.add('final-font');
            const letterSpans = [];
            for (let i = 0; i < nameLen; i++) {
                const span = document.createElement('span');
                span.className = 'neon-letter-slot';
                span.textContent = cleanName[i];
                lettersEl.appendChild(span);
                letterSpans.push(span);
            }
            const revealStagger = 120;
            for (let idx = 0; idx < nameLen; idx++) {
                const t = setTimeout(((i) => () => {
                    // Fire the CSS white→green flash on this letter
                    letterSpans[i].classList.add('neon-letter-flash');
                    // Update progress
                    const pct2 = Math.min(100, Math.floor(((i+1)/nameLen)*100));
                    phaseEl.textContent = 'DECRYPTED (' + pct2 + '%)';
                    progressFill.style.width = pct2 + '%';
                    currentEl.textContent = cleanName.slice(0, Math.min(4, i + 1));
                    typeTerminalLine('[CHAR] Revealed \'' + cleanName[i] + '\'', 12);

                    if (i === nameLen - 1) {
                        // Last letter revealed — finish up
                        const doneTimeout = setTimeout(() => {
                            phaseEl.textContent = 'DECRYPTION COMPLETE';
                            progressFill.style.width = '100%';
                            typeTerminalLine('[SYSTEM] Payload extracted.', 15);

                            try {
                                const revealMode = document.querySelector('.reveal-mode.visible') || modeEl;
                                if (revealMode) revealMode.classList.add('slide-up');
                            } catch (e) { /* ignore */ }

                            const countdownStartTimeoutId = setTimeout(() => {
                                startCountdownPhase();
                            }, OPTIONS.SLIDE_UP_DELAY_MS);
                            animationSequenceTimeoutIds.push(countdownStartTimeoutId);

                            console.log(`JS neon: Sending original name back: '${currentWinnerNameForCallback}'`);
                            callPythonBackend('jsVisualsComplete', currentWinnerNameForCallback);

                        }, 100);
                        animationSequenceTimeoutIds.push(doneTimeout);
                    }
                })(idx), idx * revealStagger);
                animationSequenceTimeoutIds.push(t);
            }
        }
    }, scrambleIntervalMs);

    animationSequenceTimeoutIds.push(scrambleIntervalId);
}


// ============================================================
// --- Neural Interface Decode Reveal ---
// ============================================================
function resetNeuralDecodeState() {
    if (neuralDecodeCycleIntervalId !== null) { clearInterval(neuralDecodeCycleIntervalId); neuralDecodeCycleIntervalId = null; }
    neuralDecodeColData = [];
    const c = document.getElementById('nd-columns-container');
    if (c) c.innerHTML = '';
}

function startNeuralDecodeReveal(winnerName, opts) {
    opts = opts || {};
    console.log(`JS: startNeuralDecodeReveal for '${winnerName}'`);
    const ndModeEl = document.getElementById('neural-decode-mode');
    if (!ndModeEl) {
        console.error('Neural decode DOM missing');
        callPythonBackend('jsVisualsComplete', winnerName || '');
        return;
    }
    stopAnimationSequence();
    if (animationContent) animationContent.style.display = 'flex';
    ndModeEl.style.display = 'flex';
    const visT = setTimeout(() => ndModeEl.classList.add('visible'), 30);
    animationSequenceTimeoutIds.push(visT);

    const TRIG = OPTIONS.TRIGLAVIAN_GLYPHS;
    const rndG = () => TRIG[Math.floor(Math.random() * TRIG.length)];
    const randGStr = (n) => Array.from({length: n}, rndG).join('');

    // --- Build candidate pool (winner + up to 5 others) ---
    const pool = Array.isArray(_cachedParticipantList) ? _cachedParticipantList.filter(n => n && n.trim()) : [];
    const winnerUpper = winnerName.trim().toUpperCase();
    const others = pool.filter(n => n.trim().toUpperCase() !== winnerUpper);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    let candidates = [winnerName.trim()].concat(others.slice(0, Math.min(4, others.length)));
    for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
    const totalCols = candidates.length;

    // --- Build column DOM ---
    const container = document.getElementById('nd-columns-container');
    container.innerHTML = '';
    neuralDecodeColData = [];
    candidates.forEach((name, idx) => {
        const upperName = name.toUpperCase();
        const isWinner = name.trim().toUpperCase() === winnerUpper;
        const col = document.createElement('div'); col.className = 'nd-column';
        const badge = document.createElement('div'); badge.className = 'nd-col-badge'; badge.textContent = String(idx + 1).padStart(2, '0');
        const rain = document.createElement('div'); rain.className = 'nd-col-rain'; rain.textContent = randGStr(10) + '\n' + randGStr(10);
        const lettersWrap = document.createElement('div'); lettersWrap.className = 'nd-col-letters';
        upperName.split('').forEach(() => {
            const span = document.createElement('span'); span.className = 'nd-letter'; span.textContent = rndG(); lettersWrap.appendChild(span);
        });
        const status = document.createElement('div'); status.className = 'nd-col-status'; status.textContent = 'SCANNING';
        col.appendChild(badge); col.appendChild(rain); col.appendChild(lettersWrap); col.appendChild(status);
        container.appendChild(col);
        neuralDecodeColData.push({ el: col, name: upperName, lettersEl: lettersWrap, rainEl: rain, statusEl: status, isWinner, resolved: false, eliminated: false });
    });

    // After layout, measure each column's actual pixel width and fit font to one line.
    // Shentox SemiBold runs ~0.80 char-width per font-px; use 0.84 for a small safety margin.
    const applyNdFontSizes = () => {
        neuralDecodeColData.forEach(cd => {
            const colPadPx = parseFloat(getComputedStyle(cd.el).paddingLeft || '0') +
                             parseFloat(getComputedStyle(cd.el).paddingRight || '0');
            const availPx = cd.el.offsetWidth - colPadPx;
            if (availPx < 10) return; // not rendered yet, skip
            const fsPx = Math.min(28, Math.max(7, availPx / (cd.name.length * 0.84)));
            cd.lettersEl.style.fontSize = fsPx + 'px';
        });
    };
    // Two-frame delay then 150ms to cover slow flex layout
    requestAnimationFrame(() => requestAnimationFrame(() => {
        applyNdFontSizes();
        setTimeout(applyNdFontSizes, 150);
    }));

    // --- Status bar helpers ---
    const statusPhaseEl = document.getElementById('nd-status-phase');
    const statusFillEl  = document.getElementById('nd-status-fill');
    const setStatus = (text, pct, gold) => {
        if (statusPhaseEl) { statusPhaseEl.textContent = text; statusPhaseEl.style.color = gold ? '#ffd700' : ''; }
        if (statusFillEl)  { statusFillEl.style.width = pct + '%'; statusFillEl.style.background = gold ? 'linear-gradient(90deg,rgba(180,120,0,.85),rgba(255,215,0,.95))' : 'linear-gradient(90deg,rgba(0,160,255,.8),rgba(0,255,200,.85))'; }
    };

    // --- Phase 1: Glyph rain cycling ---
    neuralDecodeCycleIntervalId = setInterval(() => {
        neuralDecodeColData.forEach(cd => {
            if (!cd.eliminated && !cd.resolved) {
                if (cd.rainEl) cd.rainEl.textContent = randGStr(10);
                Array.from(cd.lettersEl.children).forEach(sp => { sp.textContent = rndG(); });
            }
        });
    }, 90);
    setStatus('SCANNING CANDIDATES...', 5, false);

    // --- Phase 2: Resolve columns (non-winners first, winner last) ---
    const RAIN_DUR = 1500;
    const RESOLVE_STAGGER = 420;
    const RESOLVE_WINDOW = 1300;
    const nonWinnerCols = neuralDecodeColData.filter(c => !c.isWinner);
    const winnerColData  = neuralDecodeColData.find(c => c.isWinner);
    const resolveOrder   = [...nonWinnerCols, winnerColData];
    resolveOrder.forEach((cd, ri) => {
        if (!cd) return;
        const startMs = RAIN_DUR + ri * RESOLVE_STAGGER;
        const pct = 10 + (ri + 1) / totalCols * 25;
        const t = setTimeout(() => {
            setStatus('CANDIDATE IDENTIFIED: ' + cd.name.substring(0, 12), pct, false);
            resolveNDColumn(cd);
        }, startMs);
        animationSequenceTimeoutIds.push(t);
    });

    const allResolvedMs = RAIN_DUR + totalCols * RESOLVE_STAGGER + RESOLVE_WINDOW;

    // --- Phase 3: Elimination (accelerating) ---
    const elimOrder = [...nonWinnerCols];
    for (let i = elimOrder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [elimOrder[i], elimOrder[j]] = [elimOrder[j], elimOrder[i]]; }
    let elimCumMs = 0;
    elimOrder.forEach((cd, ei) => {
        const factor     = elimOrder.length > 1 ? ei / (elimOrder.length - 1) : 0;
        const intervalMs = Math.round(850 - factor * 600);
        elimCumMs += intervalMs;
        const remaining = elimOrder.length - ei - 1;
        const pct = 38 + (ei + 1) / Math.max(1, elimOrder.length) * 42;
        const t = setTimeout(() => {
            setStatus('ELIMINATING... ' + remaining + (remaining === 1 ? ' CANDIDATE REMAINING' : ' CANDIDATES REMAINING'), pct, false);
            eliminateNDColumn(cd);
        }, allResolvedMs + elimCumMs);
        animationSequenceTimeoutIds.push(t);
    });

    const allEliminatedMs = allResolvedMs + elimCumMs + 600;

    // --- Phase 4: Winner reveal ---
    const winnerRevT = setTimeout(() => {
        if (neuralDecodeCycleIntervalId !== null) { clearInterval(neuralDecodeCycleIntervalId); neuralDecodeCycleIntervalId = null; }
        if (!winnerColData || !winnerColData.el) return;
        setStatus('TARGET LOCKED — DECODING WINNER...', 82, true);
        winnerColData.el.classList.add('nd-winner-col');
        if (winnerColData.statusEl) winnerColData.statusEl.textContent = 'TARGET LOCKED';
        if (winnerColData.rainEl) winnerColData.rainEl.style.opacity = '0';

        const letters = Array.from(winnerColData.lettersEl.children);
        letters.forEach((span, li) => {
            const s1 = setTimeout(() => { if (span) span.textContent = rndG(); }, li * 180);
            const s2 = setTimeout(() => { if (span) span.textContent = rndG(); }, li * 180 + 70);
            const rv = setTimeout(() => {
                if (span) {
                    span.textContent = winnerColData.name[li] || span.textContent;
                    span.classList.add('nd-resolved', 'nd-gold');
                    callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
                }
            }, li * 180 + 130);
            animationSequenceTimeoutIds.push(s1, s2, rv);
        });

        const afterLettersMs = (letters.length > 0 ? (letters.length - 1) : 0) * 180 + 130 + 350;
        const boxT = setTimeout(() => {
            drawNDWinnerBox(winnerColData.el);
            setStatus('\u25c8  WINNER IDENTIFIED  \u25c8', 100, true);
        }, afterLettersMs);
        animationSequenceTimeoutIds.push(boxT);

        const cdT = setTimeout(() => {
            const revealMode = document.querySelector('.reveal-mode.visible');
            if (revealMode) revealMode.classList.add('slide-up');
            const cdStartT = setTimeout(() => startCountdownPhase(), OPTIONS.SLIDE_UP_DELAY_MS);
            animationSequenceTimeoutIds.push(cdStartT);
            callPythonBackend('jsVisualsComplete', currentWinnerNameForCallback);
        }, afterLettersMs + 1350);
        animationSequenceTimeoutIds.push(cdT);
    }, allEliminatedMs);
    animationSequenceTimeoutIds.push(winnerRevT);
}

function resolveNDColumn(cd) {
    if (!cd || !cd.el) return;
    cd.resolved = true;
    cd.el.classList.add('nd-resolved');
    if (cd.statusEl) cd.statusEl.textContent = 'IDENTIFIED';
    if (cd.rainEl) cd.rainEl.style.opacity = '0';
    const TRIG = OPTIONS.TRIGLAVIAN_GLYPHS;
    const rndG = () => TRIG[Math.floor(Math.random() * TRIG.length)];
    Array.from(cd.lettersEl.children).forEach((span, i) => {
        const t1 = setTimeout(() => { if (span) span.textContent = rndG(); },          i * 155);
        const t2 = setTimeout(() => { if (span) span.textContent = rndG(); },          i * 155 + 55);
        const t3 = setTimeout(() => {
            if (span) { span.textContent = cd.name[i] || rndG(); span.classList.add('nd-resolved'); }
        }, i * 155 + 110);
        animationSequenceTimeoutIds.push(t1, t2, t3);
    });
}

function eliminateNDColumn(cd) {
    if (!cd || !cd.el) return;
    cd.eliminated = true;
    cd.el.classList.add('nd-eliminating');
    if (cd.statusEl) cd.statusEl.textContent = 'ELIMINATED';
    callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
    const t = setTimeout(() => {
        if (cd.el) { cd.el.classList.remove('nd-eliminating'); cd.el.classList.add('nd-eliminated'); }
    }, 520);
    animationSequenceTimeoutIds.push(t);
}

function drawNDWinnerBox(colEl) {
    if (!colEl) return;
    const w = colEl.offsetWidth || 100;
    const h = colEl.offsetHeight || 100;
    const perim = Math.round(2 * (w + h));
    const svg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('nd-winner-box-svg');
    svg.setAttribute('width',  String(w + 6));
    svg.setAttribute('height', String(h + 6));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '3'); rect.setAttribute('y', '3');
    rect.setAttribute('width', String(w)); rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '4');
    rect.style.strokeDasharray  = perim + ' ' + perim;
    rect.style.strokeDashoffset = String(perim);
    svg.appendChild(rect);
    colEl.appendChild(svg);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            rect.style.transition = 'stroke-dashoffset 1.25s cubic-bezier(0.15,0.85,0.35,1)';
            rect.style.strokeDashoffset = '0';
        });
    });
}
// ============================================================

// ============================================================
// --- Deep Seek Reveal ---
// ============================================================
function resetDeepSeekState() {
    if (dsAnimFrameId !== null) { cancelAnimationFrame(dsAnimFrameId); dsAnimFrameId = null; }
    if (dsScanIntervalId !== null) { clearInterval(dsScanIntervalId); dsScanIntervalId = null; }
    dsProbes = [];
    dsSignatures = [];
    dsGridIntensity = 0;
    dsGridAngle = 0;
    dsPhase = 0;
    dsScanPctValue = 0;
    dsSweepAngle = 0;
    dsSonarY = 0;
    dsSonarDirection = 1;
    dsSonarTickCooldown = 0;
    dsLaserFlashT = 0;
    dsLaserActive = false;
    dsCornerConvergeT = 0;
    dsCornerConvergeActive = false;
    if (dsCanvas) { dsCanvas.width = 0; dsCanvas.height = 0; }
    dsCtx = null;
    if (dsPhaseText) { dsPhaseText.textContent = 'DEPLOYING PROBES...'; dsPhaseText.classList.remove('visible'); }
    if (dsScanPct) { dsScanPct.classList.remove('visible'); }
    if (dsScanValue) dsScanValue.textContent = '0%';
    if (dsLockText) { dsLockText.classList.remove('visible'); dsLockText.textContent = 'LOCK ACHIEVED!'; }
    if (dsCandidatesHighlightId !== null) { clearInterval(dsCandidatesHighlightId); dsCandidatesHighlightId = null; }
    dsCandidatesIndex = 0;
    if (dsCandidates) { dsCandidates.style.display = 'none'; dsCandidates.classList.remove('visible'); }
    if (dsCandidatesList) dsCandidatesList.innerHTML = '';
    if (dsBracketContainer) { dsBracketContainer.innerHTML = ''; dsBracketContainer.classList.remove('visible'); }
    if (dsFinalName) { dsFinalName.textContent = ''; dsFinalName.classList.remove('visible', 'locked', 'resolved'); dsFinalName.style.display = 'none'; }
    dsBracketSvg = null;
    if (deepseekWinnerDisplay) { deepseekWinnerDisplay.classList.remove('visible'); deepseekWinnerDisplay.style.display = 'none'; }
    if (deepseekWinnerNameSpan) deepseekWinnerNameSpan.textContent = '';
    if (dsWarpText) { dsWarpText.classList.remove('visible'); dsWarpText.style.display = 'none'; }
    if (deepseekRevealMode) deepseekRevealMode.classList.remove('ds-zoom', 'ds-warp-active');
}

function buildDeepSeekCandidates(sigPool, winnerName) {
    if (!dsCandidates || !dsCandidatesList) return;
    dsCandidatesList.innerHTML = '';
    var pool = Array.isArray(sigPool) ? sigPool.slice() : [];
    // NOTE: winner is intentionally NOT in the list yet — we cycle through
    // the potential targets and "pick" the winner at lock time.
    var shown = pool.slice(0, 10);
    for (var i = 0; i < shown.length; i++) {
        var name = String(shown[i] || '').toUpperCase();
        var row = document.createElement('div');
        row.className = 'ds-candidate-row';
        row.textContent = name;
        dsCandidatesList.appendChild(row);
    }
    dsCandidates.style.display = 'flex';
    dsCandidates.classList.add('visible');
    // Start cycling highlight through candidates
    if (dsCandidatesHighlightId !== null) { clearInterval(dsCandidatesHighlightId); dsCandidatesHighlightId = null; }
    dsCandidatesIndex = 0;
    dsCandidatesHighlightId = setInterval(function() {
        if (!dsCandidatesList) return;
        var rows = dsCandidatesList.querySelectorAll('.ds-candidate-row');
        if (rows.length === 0) return;
        for (var r = 0; r < rows.length; r++) rows[r].classList.remove('active');
        rows[dsCandidatesIndex % rows.length].classList.add('active');
        dsCandidatesIndex++;
        // Tick sound as the highlight moves through names
        callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
    }, 350);
}

function pickDeepSeekWinner(winnerName) {
    if (!dsCandidates || !dsCandidatesList) return;
    // Stop cycling highlight
    if (dsCandidatesHighlightId !== null) { clearInterval(dsCandidatesHighlightId); dsCandidatesHighlightId = null; }
    // Clear active highlight from all rows
    var rows = dsCandidatesList.querySelectorAll('.ds-candidate-row');
    for (var r = 0; r < rows.length; r++) rows[r].classList.remove('active');
    var winnerUpper = String(winnerName || '').toUpperCase();
    // If the winner is already in the list, mark it; otherwise append it as the picked target
    var existing = null;
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].textContent === winnerUpper) { existing = rows[i]; break; }
    }
    if (!existing) {
        existing = document.createElement('div');
        existing.className = 'ds-candidate-row ds-candidate-picked';
        existing.textContent = winnerUpper;
        dsCandidatesList.appendChild(existing);
    } else {
        existing.classList.add('ds-candidate-picked');
    }
    // Bring the picked target into view
    if (typeof existing.scrollIntoView === 'function') {
        try { existing.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
}

function startDeepSeekReveal(winnerName, opts) {
    opts = opts || {};
    console.log(`JS: startDeepSeekReveal for '${winnerName}'`);
    if (!deepseekRevealMode || !dsCanvas) {
        console.error('Deep Seek DOM missing');
        callPythonBackend('jsVisualsComplete', winnerName || '');
        return;
    }
    // resetAllAnimationStates() already called in initializeDisplay(); just clear pending timers
    clearAnimationSequenceTimeouts();
    if (animationContent) animationContent.style.display = 'flex';
    deepseekRevealMode.style.display = 'flex';
    const visT = setTimeout(() => deepseekRevealMode.classList.add('visible'), 30);
    animationSequenceTimeoutIds.push(visT);

    // Show "DEPLOYING PROBES..." during phase 0 (probe launch)
    if (dsPhaseText) dsPhaseText.classList.add('visible');
    // Deploying probes sound
    callPythonBackend('jsRequestSound', 'deploy', 0);

    const cleanName = String(winnerName || 'WINNER').toUpperCase();

    // Setup canvas
    const modeRect = deepseekRevealMode.getBoundingClientRect();
    const cw = Math.max(modeRect.width, 100);
    const ch = Math.max(modeRect.height, 100);
    dsCanvas.width = cw * window.devicePixelRatio;
    dsCanvas.height = ch * window.devicePixelRatio;
    dsCanvas.style.width = cw + 'px';
    dsCanvas.style.height = ch + 'px';
    dsCtx = dsCanvas.getContext('2d');
    dsCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Build participant pool for signatures (phase 2)
    const sigPool = Array.isArray(_cachedParticipantList)
        ? _cachedParticipantList.filter(function(n) { return n && n.trim() && n !== winnerName; })
        : [];
    if (sigPool.length === 0) {
        for (var i = 1; i <= 12; i++) sigPool.push('SIGNAL-' + (i < 10 ? '0' : '') + i);
    }

    // Initialize 4 probes from corners toward center area
    const margin = 50;
    dsProbes = [];
    for (let i = 0; i < 4; i++) {
        const sx = (i === 0 || i === 2) ? margin : cw - margin;
        const sy = (i < 2) ? margin : ch - margin;
        dsProbes.push({
            startX: sx, startY: sy,
            targetX: cw * 0.3 + Math.random() * cw * 0.4,
            targetY: ch * 0.3 + Math.random() * ch * 0.4,
            x: sx, y: sy, progress: 0,
            speed: 0.35 + Math.random() * 0.25,
            size: 2 + Math.random() * 2,
            trail: [],
        });
    }

    // --- Canvas draw helpers ---
    function dsHexToRgba(hex, alpha) {
        if (!hex) return 'rgba(0,180,255,' + alpha + ')';
        hex = String(hex).trim().replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(0,180,255,' + alpha + ')';
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    function dsColor(varName, fallback) {
        var v = getCssVariableValue(varName);
        return (v && v.length > 0) ? v : fallback;
    }
    // Theme colors cached ONCE at animation start (avoids getComputedStyle per frame)
    var dsTheme = {
        scan: dsColor('--ds-scan', '#00b4ff'),
        scanBright: dsColor('--ds-scan-bright', '#00dcff'),
        lock: dsColor('--ds-lock', '#ff2020'),
        resolved: dsColor('--ds-resolved', '#00ff44'),
        yellow: dsColor('--trig-yellow', '#f2d44a'),
    };

    function drawGrid(ctx, w, h, angle, intensity) {
        if (intensity <= 0) return;
        var spacing = 45;
        var cx = w / 2, cy = h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        var halfDim = Math.max(w, h) * 0.75;
        ctx.strokeStyle = dsHexToRgba(dsTheme.scan, 0.04 * intensity);
        ctx.lineWidth = 1;
        ctx.globalAlpha = intensity;
        for (var x = -halfDim; x <= halfDim; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, -halfDim);
            ctx.lineTo(x, halfDim);
            ctx.stroke();
        }
        for (var y = -halfDim; y <= halfDim; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(-halfDim, y);
            ctx.lineTo(halfDim, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawRadarSweep(ctx, w, h, angle, intensity) {
        if (intensity <= 0) return;
        var cx = w / 2, cy = h / 2;
        var radius = Math.max(w, h) * 0.75;
        var sweepWidth = 0.5;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -sweepWidth, 0);
        ctx.closePath();
        ctx.fillStyle = dsHexToRgba(dsTheme.scan, 0.10 * intensity);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -sweepWidth * 0.08, 0.02);
        ctx.closePath();
        ctx.fillStyle = dsHexToRgba(dsTheme.scanBright, 0.3 * intensity);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * Math.cos(0), radius * Math.sin(0));
        ctx.strokeStyle = dsHexToRgba(dsTheme.scanBright, 0.45 * intensity);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    function drawSonarScanLine(ctx, w, h, y) {
        var trailH = 40;
        var grad = ctx.createLinearGradient(0, y, 0, Math.min(h, y + trailH));
        grad.addColorStop(0, dsHexToRgba(dsTheme.scanBright, 0));
        grad.addColorStop(0.6, dsHexToRgba(dsTheme.scanBright, 0.15));
        grad.addColorStop(1, dsHexToRgba(dsTheme.scanBright, 0.55));
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, w, Math.min(trailH, h - y));
        ctx.fillStyle = dsHexToRgba(dsTheme.scanBright, 0.55);
        ctx.fillRect(0, Math.min(y + trailH, h) - 1, w, 1.5);
    }

    function drawProbes(ctx) {
        for (var pi = 0; pi < dsProbes.length; pi++) {
            var pr = dsProbes[pi];
            var a = pr.progress < 0.1 ? pr.progress / 0.1 : (pr.progress > 0.95 ? (1 - pr.progress) / 0.05 : 1);
            if (a <= 0) continue;
            for (var ti = 1; ti < pr.trail.length; ti++) {
                var t0 = pr.trail[ti - 1], t1 = pr.trail[ti];
                var fa = (ti / pr.trail.length) * a;
                ctx.beginPath();
                ctx.moveTo(t0.x, t0.y);
                ctx.lineTo(t1.x, t1.y);
                ctx.strokeStyle = dsHexToRgba(dsTheme.scanBright, fa * 0.22);
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(pr.x, pr.y, pr.size, 0, Math.PI * 2);
            ctx.fillStyle = dsHexToRgba(dsTheme.scan, a);
            ctx.fill();
            ctx.shadowBlur = 10;
            ctx.shadowColor = dsHexToRgba(dsTheme.scan, a * 0.5);
            ctx.beginPath();
            ctx.arc(pr.x, pr.y, pr.size * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = dsHexToRgba(dsTheme.scanBright, a * 0.8);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    function drawSignatures(ctx) {
        for (var si = 0; si < dsSignatures.length; si++) {
            var sig = dsSignatures[si];
            var sz = 10 + sig.life * 6;
            var al = sig.life < 0.15 ? sig.life / 0.15 : (sig.life > 0.7 ? (1 - sig.life) / 0.3 : 1);
            if (al <= 0) continue;
            ctx.beginPath();
            ctx.moveTo(sig.x - sz, sig.y - sz);
            ctx.lineTo(sig.x + sz, sig.y + sz);
            ctx.moveTo(sig.x + sz, sig.y - sz);
            ctx.lineTo(sig.x - sz, sig.y + sz);
            ctx.strokeStyle = dsHexToRgba(dsTheme.scan, al * 0.45);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.font = '9px "Shentox-SemiBold", sans-serif';
            ctx.fillStyle = dsHexToRgba(dsTheme.scan, al * 0.55);
            ctx.textAlign = 'center';
            ctx.fillText(sig.name, sig.x, sig.y + sz + 10);
            var strengthColor;
            if (sig.strength < 50) strengthColor = dsHexToRgba(dsTheme.lock, al * 0.9);
            else if (sig.strength < 85) strengthColor = dsHexToRgba(dsTheme.yellow, al * 0.9);
            else strengthColor = dsHexToRgba(dsTheme.resolved, al * 0.9);
            ctx.font = '10px "Courier New", Consolas, monospace';
            ctx.fillStyle = strengthColor;
            ctx.fillText(sig.strength.toFixed(1) + '%', sig.x, sig.y + sz + 22);
        }
    }

    function drawCornerConverge(ctx, w, h, t) {
        if (t < 0 || t > 1) return;
        var cx = w / 2, cy = h / 2;
        var startR = Math.max(w, h) * 0.55;
        var endR = Math.min(w, h) * 0.22;
        var r = startR + (endR - startR) * (t * t * (3 - 2 * t));
        var arm = Math.min(w, h) * 0.13;
        ctx.strokeStyle = dsHexToRgba(dsTheme.lock, 0.9);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (var q = 0; q < 4; q++) {
            var ang = q * Math.PI / 2 + Math.PI / 4;
            var vx = Math.cos(ang), vy = Math.sin(ang);
            var ux = -Math.sin(ang), uy = Math.cos(ang);
            var x = cx + vx * r, y = cy + vy * r;
            ctx.beginPath();
            ctx.moveTo(x + ux * arm, y + uy * arm);
            ctx.lineTo(x, y);
            ctx.lineTo(x + vx * arm, y + vy * arm);
            ctx.stroke();
        }
    }

    function drawLaserFlash(ctx, w, h, t) {
        if (t < 0 || t > 1) return;
        var y = t * h;
        var grad = ctx.createLinearGradient(0, y - 12, 0, y + 12);
        grad.addColorStop(0, dsHexToRgba(dsTheme.lock, 0));
        grad.addColorStop(0.5, dsHexToRgba(dsTheme.lock, 0.8));
        grad.addColorStop(1, dsHexToRgba(dsTheme.lock, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 12, w, 24);
        ctx.fillStyle = dsHexToRgba(dsTheme.scanBright, 0.9);
        ctx.fillRect(0, y - 1, w, 2);
    }

    var lastTime = performance.now();

    function animationLoop(timestamp) {
        var dt = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;
        dsCtx.clearRect(0, 0, cw, ch);

        // Grid
        dsGridAngle += 0.002;
        drawGrid(dsCtx, cw, ch, dsGridAngle, dsGridIntensity);

        // Radar sweep beam (phase 1+)
        if (dsGridIntensity > 0) {
            dsSweepAngle += dt * (dsPhase >= 2 ? 2.2 : 1.4);
            drawRadarSweep(dsCtx, cw, ch, dsSweepAngle, dsGridIntensity);
        }

        // Sonar scan line (phase 2)
        if (dsPhase >= 2) {
            dsSonarY += dsSonarDirection * dt * ch * 0.22;
            if (dsSonarY >= ch) { dsSonarY = 0; }
            drawSonarScanLine(dsCtx, cw, ch, dsSonarY);
        }

        // Probes
        for (var pi = 0; pi < dsProbes.length; pi++) {
            var pr = dsProbes[pi];
            if (pr.progress < 1) {
                pr.progress = Math.min(1, pr.progress + pr.speed * dt);
                pr.x = pr.startX + (pr.targetX - pr.startX) * pr.progress;
                pr.y = pr.startY + (pr.targetY - pr.startY) * pr.progress;
            }
            pr.trail.push({ x: pr.x, y: pr.y });
            if (pr.trail.length > 26) pr.trail.shift();
        }
        drawProbes(dsCtx);

        // Signatures (phase 2+)
        if (dsPhase >= 2) {
            for (var si = dsSignatures.length - 1; si >= 0; si--) {
                dsSignatures[si].life -= dt * 0.3;
                if (dsSignatures[si].life <= 0) dsSignatures.splice(si, 1);
            }
            drawSignatures(dsCtx);
        }

        // Corner converge (phase 3)
        if (dsCornerConvergeActive) {
            dsCornerConvergeT += dt / 0.8;
            if (dsCornerConvergeT >= 1) {
                dsCornerConvergeT = 1;
                dsCornerConvergeActive = false;
            }
            drawCornerConverge(dsCtx, cw, ch, dsCornerConvergeT);
        }

        // Laser lock flash
        if (dsLaserActive) {
            dsLaserFlashT += dt / 0.4;
            if (dsLaserFlashT >= 1) { dsLaserActive = false; dsLaserFlashT = 1; }
            drawLaserFlash(dsCtx, cw, ch, dsLaserFlashT);
        }

        dsAnimFrameId = requestAnimationFrame(animationLoop);
    }

    function addSignature() {
        var cx = cw / 2, cy = ch / 2;
        dsSignatures.push({
            x: cx + (Math.random() - 0.5) * cw * 0.55,
            y: cy + (Math.random() - 0.5) * ch * 0.55,
            name: sigPool[Math.floor(Math.random() * sigPool.length)],
            life: 0.85 + Math.random() * 0.15,
            strength: 35 + Math.random() * 65,
        });
    }

    function describeArc(x, y, innerR, outerR, startA, endA) {
        function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
            var angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
            return {
                x: centerX + (radius * Math.cos(angleInRadians)),
                y: centerY + (radius * Math.sin(angleInRadians))
            };
        }
        var p1 = polarToCartesian(x, y, outerR, endA);
        var p2 = polarToCartesian(x, y, outerR, startA);
        var p3 = polarToCartesian(x, y, innerR, startA);
        var p4 = polarToCartesian(x, y, innerR, endA);
        var largeArcFlag = Math.abs(endA - startA) <= 180 ? "0" : "1";
        return [
            "M", p1.x, p1.y,
            "A", outerR, outerR, 0, largeArcFlag, 0, p2.x, p2.y,
            "L", p3.x, p3.y,
            "A", innerR, innerR, 0, largeArcFlag, 1, p4.x, p4.y,
            "Z"
        ].join(" ");
    }

    function createBracketSvg() {
        dsBracketContainer.innerHTML = '';
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 280 280');
        svg.setAttribute('width', '240');
        svg.setAttribute('height', '240');
        svg.style.display = 'block';
        svg.style.overflow = 'visible';

        var cx = 140, cy = 140;

        // Dark transparent backing arc behind HP bars
        var bgArc = document.createElementNS(ns, 'path');
        bgArc.setAttribute('fill', 'rgba(15, 23, 30, 0.75)');
        bgArc.setAttribute('d', describeArc(cx, cy, 58, 113, -130, 130));
        svg.appendChild(bgArc);

        // Outer & inner circular border lines
        var outer = document.createElementNS(ns, 'circle');
        outer.setAttribute('cx', cx); outer.setAttribute('cy', cy);
        outer.setAttribute('r', '115');
        outer.setAttribute('class', 'ds-bracket-circle');
        outer.setAttribute('stroke-width', '1.8');
        outer.setAttribute('fill', 'none');
        svg.appendChild(outer);

        var inner = document.createElementNS(ns, 'circle');
        inner.setAttribute('cx', cx); inner.setAttribute('cy', cy);
        inner.setAttribute('r', '56');
        inner.setAttribute('class', 'ds-bracket-circle');
        inner.setAttribute('stroke-width', '1.5');
        inner.setAttribute('fill', 'none');
        svg.appendChild(inner);

        // Crosshair alignment ticks (N/S/E/W)
        var ticks = [
            'M140,17 L140,25', 'M140,255 L140,263',
            'M17,140 L25,140', 'M255,140 L263,140'
        ];
        for (var ti = 0; ti < ticks.length; ti++) {
            var tick = document.createElementNS(ns, 'path');
            tick.setAttribute('d', ticks[ti]);
            tick.setAttribute('class', 'ds-bracket-tick');
            tick.setAttribute('stroke-width', '2');
            tick.setAttribute('fill', 'none');
            svg.appendChild(tick);
        }

        // Bracket chevrons around ring (N/S/E/W)
        var chevD = [
            'M 124 10 L 140 26 L 156 10',
            'M 270 124 L 254 140 L 270 156',
            'M 10 156 L 26 140 L 10 124',
            'M 156 270 L 140 254 L 124 270'
        ];
        for (var ci = 0; ci < chevD.length; ci++) {
            var p = document.createElementNS(ns, 'path');
            p.setAttribute('d', chevD[ci].d);
            p.setAttribute('class', 'ds-bracket-chevron');
            p.setAttribute('stroke-width', '5');
            p.setAttribute('fill', 'none');
            p.setAttribute('stroke-linejoin', 'miter');
            p.setAttribute('stroke-linecap', 'square');
            svg.appendChild(p);
        }

        // Segmented Shield / Armor / Hull blocks across the top arc
        var numColumns = 36;
        var startAngle = -128;
        var endAngle = 128;
        var bands = [
            { rIn: 96, rOut: 110, cls: 'ds-hp-shield' },
            { rIn: 80, rOut: 94,  cls: 'ds-hp-armor' },
            { rIn: 64, rOut: 78,  cls: 'ds-hp-hull' }
        ];
        var angleStep = (endAngle - startAngle) / numColumns;
        var gapAngle = 0.8;
        for (var bi = 0; bi < bands.length; bi++) {
            for (var i = 0; i < numColumns; i++) {
                var segStart = startAngle + (i * angleStep) + (gapAngle / 2);
                var segEnd = startAngle + ((i + 1) * angleStep) - (gapAngle / 2);
                var seg = document.createElementNS(ns, 'path');
                seg.setAttribute('d', describeArc(cx, cy, bands[bi].rIn, bands[bi].rOut, segStart, segEnd));
                seg.setAttribute('class', 'ds-hp-seg ' + bands[bi].cls);
                seg.setAttribute('stroke', '#131b22');
                seg.setAttribute('stroke-width', '0.6');
                svg.appendChild(seg);
            }
        }

        // Central blank region (reticle center)
        var blank = document.createElementNS(ns, 'circle');
        blank.setAttribute('cx', cx); blank.setAttribute('cy', cy);
        blank.setAttribute('r', '56');
        blank.setAttribute('class', 'ds-bracket-center');
        blank.setAttribute('fill', 'rgba(8, 12, 16, 0.98)');
        blank.setAttribute('stroke', 'none');
        svg.appendChild(blank);

        // Random EVE ship in the center of the target (from the EVE image server)
        var shipTypeIds = [
            582, 587, 599, 620, 648, 638, 602, 605, 586, 591, 596, 609, 615, 633, 631, 644,
            624, 623, 607, 601, 594, 608, 613, 617, 634, 597, 588, 584, 583, 579, 578, 576,
            590, 585, 600, 604, 612, 616, 635, 632, 598, 603, 611, 619, 636, 628, 592, 610
        ];
        var randomShipId = shipTypeIds[Math.floor(Math.random() * shipTypeIds.length)];
        var shipImg = document.createElementNS(ns, 'image');
        shipImg.setAttribute('href', 'https://images.evetech.net/types/' + randomShipId + '/render?size=512');
        shipImg.setAttribute('class', 'ds-ship-img');
        shipImg.setAttribute('x', String(cx - 50));
        shipImg.setAttribute('y', String(cy - 50));
        shipImg.setAttribute('width', '100');
        shipImg.setAttribute('height', '100');
        // Clip the ship image to the circular center blank region (r=56)
        var clipDefs = document.createElementNS(ns, 'defs');
        var clipPath = document.createElementNS(ns, 'clipPath');
        clipPath.setAttribute('id', 'ds-ship-clip');
        var clipCircle = document.createElementNS(ns, 'circle');
        clipCircle.setAttribute('cx', cx);
        clipCircle.setAttribute('cy', cy);
        clipCircle.setAttribute('r', '54');
        clipPath.appendChild(clipCircle);
        clipDefs.appendChild(clipPath);
        svg.appendChild(clipDefs);
        shipImg.setAttribute('clip-path', 'url(#ds-ship-clip)');
        svg.appendChild(shipImg);

        dsBracketContainer.appendChild(svg);
        dsBracketSvg = svg;
    }

    // === Phase 0 -> 1 (2.5s) ===
    var p1T = setTimeout(function() {
        dsPhase = 1;
        dsPhaseText.textContent = 'SCANNING FOR TARGETS...';
        dsGridIntensity = 1;
        dsPhaseText.classList.add('visible');
        // Scanning for targets sound
        callPythonBackend('jsRequestSound', 'scan', 0);
    }, 2500);
    animationSequenceTimeoutIds.push(p1T);

    // === Phase 1 -> 2 (5.0s) ===
    var p2T = setTimeout(function() {
        dsPhase = 2;
        dsPhaseText.textContent = 'ANALYZING SIGNATURES...';
        dsScanPct.classList.add('visible');
        buildDeepSeekCandidates(sigPool, cleanName);

        // Scanning percentage counter
        dsScanPctValue = 0;
        dsScanIntervalId = setInterval(function() {
            dsScanPctValue = Math.min(100, dsScanPctValue + Math.floor(Math.random() * 5) + 1);
            if (dsScanValue) dsScanValue.textContent = dsScanPctValue + '%';
            if (dsScanPctValue >= 100 && dsScanIntervalId !== null) {
                clearInterval(dsScanIntervalId);
                dsScanIntervalId = null;
            }
        }, 80);
        animationSequenceTimeoutIds.push(dsScanIntervalId);

        // Initial signature burst
        for (var si = 0; si < 6; si++) {
            (function(delay) {
                var sigT = setTimeout(function() { addSignature(); }, delay);
                animationSequenceTimeoutIds.push(sigT);
            })(si * 350 + Math.random() * 200);
        }

        // Continuous signature generation
        var sigCount = 0;
        var sigGenId = setInterval(function() {
            if (dsPhase !== 2) { clearInterval(sigGenId); return; }
            addSignature();
            sigCount++;
            if (sigCount >= 10) clearInterval(sigGenId);
        }, 450);
        animationSequenceTimeoutIds.push(sigGenId);

    }, 5000);
    animationSequenceTimeoutIds.push(p2T);

    // === Phase 2 -> 3 (8.0s) ===
    var p3T = setTimeout(function() {
        dsPhase = 3;
        dsPhaseText.classList.remove('visible');
        if (dsScanIntervalId !== null) { clearInterval(dsScanIntervalId); dsScanIntervalId = null; }
        dsScanPct.classList.remove('visible');
        if (dsScanValue) dsScanValue.textContent = '100%';

        // Flash lock text
        dsLockText.textContent = 'LOCK ACHIEVED!';
        dsLockText.classList.add('visible');
        var hideLockT = setTimeout(function() { dsLockText.classList.remove('visible'); }, 2400);
        animationSequenceTimeoutIds.push(hideLockT);

        // Lock-on corner brackets converge, then laser flash
        dsCornerConvergeT = 0;
        dsCornerConvergeActive = true;
        var laserT = setTimeout(function() {
            dsLaserFlashT = 0;
            dsLaserActive = true;
        }, 600);
        animationSequenceTimeoutIds.push(laserT);

        // Bracket
        createBracketSvg();
        dsBracketContainer.classList.add('visible');

        // Winner display (name in the box)
        if (deepseekWinnerDisplay) {
            deepseekWinnerDisplay.style.display = 'grid';
            if (deepseekWinnerNameSpan) deepseekWinnerNameSpan.textContent = winnerName;
            var wdVisT = setTimeout(function() { deepseekWinnerDisplay.classList.add('visible'); }, 50);
            animationSequenceTimeoutIds.push(wdVisT);
        }

        // Pick the winner out of the potential targets list
        pickDeepSeekWinner(cleanName);

        // Freeze probes at destination
        for (var pi = 0; pi < dsProbes.length; pi++) dsProbes[pi].progress = 1;
        dsGridIntensity = 0.5;

    }, 8000);
    animationSequenceTimeoutIds.push(p3T);

    // === Phase 3 -> 4 / Resolve (10.0s) ===
    var p4T = setTimeout(function() {
        dsPhase = 4;
        dsGridIntensity = 0;

        // Bracket turns green
        var circles = dsBracketContainer.querySelectorAll('.ds-bracket-circle');
        var chevrons = dsBracketContainer.querySelectorAll('.ds-bracket-chevron');
        var ticks = dsBracketContainer.querySelectorAll('.ds-bracket-tick');
        var segs = dsBracketContainer.querySelectorAll('.ds-hp-seg');
        for (var ei = 0; ei < circles.length; ei++) circles[ei].classList.add('locked');
        for (var ei = 0; ei < chevrons.length; ei++) chevrons[ei].classList.add('locked');
        for (var ei = 0; ei < ticks.length; ei++) ticks[ei].classList.add('locked');
        for (var ei = 0; ei < segs.length; ei++) segs[ei].classList.add('locked');

        // Zoom
        deepseekRevealMode.classList.add('ds-zoom');

        // Slide up & countdown
        var slideT = setTimeout(function() {
            var revealMode = document.querySelector('.reveal-mode.visible');
            if (revealMode) revealMode.classList.add('slide-up');

            // Show "WARP DRIVE ACTIVATED" — runs its full sequence, then the timer starts
            if (dsWarpText) {
                dsWarpText.style.display = 'block';
                // Force reflow so the animation restarts cleanly
                void dsWarpText.offsetWidth;
                dsWarpText.classList.add('visible');
                callPythonBackend('jsRequestSound', 'warp', 0);
                // Push the winner display down so the warp text isn't over the top of it
                if (deepseekRevealMode) deepseekRevealMode.classList.add('ds-warp-active');
            }

            // Wait for the warp sequence to fully finish before showing the timer
            var warpDurMs = 1600;
            var cdT = setTimeout(function() {
                if (dsWarpText) {
                    dsWarpText.classList.remove('visible');
                    dsWarpText.style.display = 'none';
                }
                if (deepseekRevealMode) deepseekRevealMode.classList.remove('ds-warp-active');
                startCountdownPhase();
            }, OPTIONS.SLIDE_UP_DELAY_MS + warpDurMs + 200);
            animationSequenceTimeoutIds.push(cdT);
            callPythonBackend('jsVisualsComplete', currentWinnerNameForCallback);
        }, 1200);
        animationSequenceTimeoutIds.push(slideT);

    }, 10000);
    animationSequenceTimeoutIds.push(p4T);

    // Start animation loop
    dsAnimFrameId = requestAnimationFrame(animationLoop);
}
// ============================================================

// ========================================================
// --- ESI Loading Overlay ---
// ========================================================
(function() {
    const ESI_LINES = [
        'QUERYING ESI DATABASE...',
        'SCANNING CAPSULEER REGISTRY...',
        'RESOLVING CHARACTER ID...',
        'FETCHING CORPORATION DATA...',
        'RETRIEVING PORTRAIT...',
        'DECRYPTING CAPSULEER DOSSIER...',
    ];
    const ESI_LINE_DELAY_MS = 900;
    const ESI_CHAR_DELAY_MS = 22;

    let _esiOverlayActive = false;
    let _esiLineTimeouts = [];
    let _esiCharIntervals = [];
    let _esiBarInterval = null;
    let _esiFakeProgress = 0;

    function _clearESITimers() {
        _esiLineTimeouts.forEach(clearTimeout);
        _esiLineTimeouts = [];
        _esiCharIntervals.forEach(clearInterval);
        _esiCharIntervals = [];
        if (_esiBarInterval) { clearInterval(_esiBarInterval); _esiBarInterval = null; }
    }

    function _typeLineInto(lineEl, text, onDone) {
        let i = 0;
        lineEl.textContent = '';
        const iv = setInterval(() => {
            if (i < text.length) {
                lineEl.textContent += text.charAt(i++);
            } else {
                clearInterval(iv);
                _esiCharIntervals = _esiCharIntervals.filter(x => x !== iv);
                if (onDone) onDone();
            }
        }, ESI_CHAR_DELAY_MS);
        _esiCharIntervals.push(iv);
    }

    function _scheduleLines(terminal, lines, index) {
        if (!_esiOverlayActive || index >= lines.length) return;
        const row = document.createElement('div');
        row.className = 'esi-terminal-line';
        const prompt = document.createElement('span');
        prompt.className = 'esi-terminal-prompt';
        prompt.textContent = '>';
        const text = document.createElement('span');
        row.appendChild(prompt);
        row.appendChild(text);
        terminal.appendChild(row);
        // keep max 6 lines in view
        while (terminal.children.length > 6) terminal.removeChild(terminal.firstChild);
        requestAnimationFrame(() => row.classList.add('shown'));
        _typeLineInto(text, ' ' + lines[index], () => {
            const t = setTimeout(() => _scheduleLines(terminal, lines, index + 1), ESI_LINE_DELAY_MS);
            _esiLineTimeouts.push(t);
        });
    }

    function _startFakeBar(fillEl, statusEl) {
        _esiFakeProgress = 0;
        const targets = [12, 28, 45, 62, 78, 91];
        let tIdx = 0;
        const statuses = ['CONNECTING...', 'AUTHENTICATING...', 'SEARCHING REGISTRY...', 'LOADING DATA...', 'DECODING...', 'FINALISING...'];
        _esiBarInterval = setInterval(() => {
            if (!_esiOverlayActive) { clearInterval(_esiBarInterval); return; }
            if (tIdx < targets.length) {
                _esiFakeProgress = targets[tIdx];
                fillEl.style.width = _esiFakeProgress + '%';
                if (statusEl && statuses[tIdx]) statusEl.textContent = statuses[tIdx];
                tIdx++;
            }
        }, ESI_LINE_DELAY_MS);
    }

    window.showESILoadingOverlay = function(ignName) {
        const overlay = document.getElementById('esi-loading-overlay');
        const terminal = document.getElementById('esi-loading-terminal');
        const fillEl = document.getElementById('esi-loading-bar-fill');
        const statusEl = document.getElementById('esi-loading-status');
        if (!overlay || !terminal || !fillEl) return;

        _clearESITimers();
        _esiOverlayActive = true;
        try { document.body.classList.add('esi-loading-active'); } catch(e) {}
        terminal.innerHTML = '';
        fillEl.style.transition = 'none';
        fillEl.style.width = '0%';
        void fillEl.offsetWidth;
        fillEl.style.transition = 'width 0.4s ease-out';
        if (statusEl) statusEl.textContent = 'INITIALISING...';

        // First line shows the IGN being looked up
        if (ignName) {
            const row = document.createElement('div');
            row.className = 'esi-terminal-line shown';
            row.innerHTML = `<span class="esi-terminal-prompt">></span><span style="color:rgba(232,217,0,0.9)"> CAPSULEER: <strong>${String(ignName).toUpperCase()}</strong></span>`;
            terminal.appendChild(row);
        }
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('visible'));
        _scheduleLines(terminal, ESI_LINES, 0);
        _startFakeBar(fillEl, statusEl);
    };

    window.hideESILoadingOverlay = function() {
        _esiOverlayActive = false;
        _clearESITimers();
        try { document.body.classList.remove('esi-loading-active'); } catch(e) {}
        const overlay = document.getElementById('esi-loading-overlay');
        const fillEl = document.getElementById('esi-loading-bar-fill');
        const statusEl = document.getElementById('esi-loading-status');
        if (!overlay) return;
        // Complete the bar before hiding
        if (fillEl) { fillEl.style.width = '100%'; }
        if (statusEl) statusEl.textContent = 'IDENTITY CONFIRMED';
        setTimeout(() => {
            overlay.classList.remove('visible');
            setTimeout(() => { overlay.style.display = 'none'; }, 320);
        }, 350);
    };
})();
// --- End ESI Loading Overlay ---
// ========================================================

// --- Connection Failed Overlay (winner timeout / no response) ---
// ========================================================
(function() {
    const FAIL_LINES = [
        'PING TIMEOUT — NO RESPONSE DETECTED',
        'CAPSULEER UNREACHABLE',
        'RETRANSMITTING HAIL...',
        'NO ACKNOWLEDGEMENT RECEIVED',
        'MARKING CAPSULEER AS ABSENT',
        'CONNECTION TERMINATED',
    ];
    const FAIL_LINE_DELAY_MS = 750;
    const FAIL_CHAR_DELAY_MS = 18;

    let _failOverlayActive = false;
    let _failLineTimeouts = [];
    let _failCharIntervals = [];
    let _failBarInterval = null;

    function _clearFailTimers() {
        _failLineTimeouts.forEach(clearTimeout);
        _failLineTimeouts = [];
        _failCharIntervals.forEach(clearInterval);
        _failCharIntervals = [];
        if (_failBarInterval) { clearInterval(_failBarInterval); _failBarInterval = null; }
    }

    function _typeFailLine(lineEl, text, onDone) {
        let i = 0;
        lineEl.textContent = '';
        const iv = setInterval(() => {
            if (i < text.length) {
                lineEl.textContent += text.charAt(i++);
            } else {
                clearInterval(iv);
                _failCharIntervals = _failCharIntervals.filter(x => x !== iv);
                if (onDone) onDone();
            }
        }, FAIL_CHAR_DELAY_MS);
        _failCharIntervals.push(iv);
    }

    function _scheduleFailLines(terminal, lines, index) {
        if (!_failOverlayActive || index >= lines.length) return;
        const row = document.createElement('div');
        row.className = 'esi-terminal-line';
        const prompt = document.createElement('span');
        prompt.className = 'esi-terminal-prompt';
        prompt.textContent = '!';
        const text = document.createElement('span');
        row.appendChild(prompt);
        row.appendChild(text);
        terminal.appendChild(row);
        while (terminal.children.length > 6) terminal.removeChild(terminal.firstChild);
        requestAnimationFrame(() => row.classList.add('shown'));
        _typeFailLine(text, ' ' + lines[index], () => {
            const t = setTimeout(() => _scheduleFailLines(terminal, lines, index + 1), FAIL_LINE_DELAY_MS);
            _failLineTimeouts.push(t);
        });
    }

    function _startFailBar(fillEl, statusEl) {
        let progress = 0;
        const steps = [8, 22, 40, 55, 72, 88, 100];
        const statuses = ['ATTEMPTING RECONNECT...', 'NO CARRIER...', 'SIGNAL LOST...', 'ROUTE UNREACHABLE...', 'AUTH FAILED...', 'ABORTING...', 'CONNECTION FAILED'];
        let idx = 0;
        _failBarInterval = setInterval(() => {
            if (!_failOverlayActive) { clearInterval(_failBarInterval); return; }
            if (idx < steps.length) {
                progress = steps[idx];
                fillEl.style.width = progress + '%';
                if (statusEl && statuses[idx]) statusEl.textContent = statuses[idx];
                idx++;
            }
        }, FAIL_LINE_DELAY_MS);
    }

    window.showConnFailedOverlay = function(winnername) {
        const overlay = document.getElementById('conn-failed-overlay');
        const terminal = document.getElementById('conn-failed-terminal');
        const fillEl = document.getElementById('conn-failed-bar-fill');
        const statusEl = document.getElementById('conn-failed-status');
        if (!overlay || !terminal || !fillEl) return;

        _clearFailTimers();
        _failOverlayActive = true;
        terminal.innerHTML = '';
        fillEl.style.transition = 'none';
        fillEl.style.width = '0%';
        void fillEl.offsetWidth;
        fillEl.style.transition = 'width 0.4s ease-out';
        if (statusEl) statusEl.textContent = 'ATTEMPTING RECONNECT...';

        if (winnername) {
            const row = document.createElement('div');
            row.className = 'esi-terminal-line shown';
            row.innerHTML = `<span class="esi-terminal-prompt">!</span><span style="color:rgba(255,120,100,0.9)"> TARGET: <strong>${String(winnername).toUpperCase()}</strong></span>`;
            terminal.appendChild(row);
        }
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('visible'));
        _scheduleFailLines(terminal, FAIL_LINES, 0);
        _startFailBar(fillEl, statusEl);
    };

    window.hideConnFailedOverlay = function() {
        _failOverlayActive = false;
        _clearFailTimers();
        const overlay = document.getElementById('conn-failed-overlay');
        const fillEl = document.getElementById('conn-failed-bar-fill');
        const statusEl = document.getElementById('conn-failed-status');
        if (!overlay) return;
        if (fillEl) { fillEl.style.width = '100%'; }
        if (statusEl) statusEl.textContent = 'CONNECTION FAILED';
        setTimeout(() => {
            overlay.classList.remove('visible');
            setTimeout(() => { overlay.style.display = 'none'; }, 320);
        }, 400);
    };
})();
// --- End Connection Failed Overlay ---
// ========================================================

// --- Main Animation Trigger ---
// ... (startAnimation remains the same) ...
function startAnimation(winnerName, animationType = 'random', options = {}) {
    console.log(`JS: startAnimation called. Winner: ${winnerName}, Type: '${animationType}', Opts:`, options);
    console.log(`JS: Animation type comparison: animationType='${animationType}', typeof='${typeof animationType}'`);
    console.log(`JS: Checking if '${animationType}' === 'Triglavian Translation': ${animationType === 'Triglavian Translation'}`);
    
    if (!isWebChannelReady) { console.warn("WebChannel not ready. Retrying..."); setTimeout(() => startAnimation(winnerName, animationType, options), 200); return; }
    if (!document.body || !animationContent) { console.warn("DOM not ready. Retrying..."); setTimeout(() => startAnimation(winnerName, animationType, options), 100); return; }

    // Fade out current content before resetting DOM, then re-trigger after transition completes
    if (!options._fadedOut && animationContent
            && getComputedStyle(animationContent).display !== 'none'
            && parseFloat(getComputedStyle(animationContent).opacity) > 0.05) {
        if (_pendingAnimStart !== null) { clearTimeout(_pendingAnimStart); _pendingAnimStart = null; }
        animationContent.style.transition = 'opacity 0.35s ease-out';
        animationContent.style.opacity = '0';
        _pendingAnimStart = setTimeout(() => {
            _pendingAnimStart = null;
            startAnimation(winnerName, animationType, { ...options, _fadedOut: true });
        }, 380);
        return;
    }

    // SEND DEBUG INFO BACK TO PYTHON (after fade-out check so it fires only once)
    if (pythonBackend && typeof pythonBackend.jsDebugMessage === 'function') {
        try {
            pythonBackend.jsDebugMessage(`JS_DEBUG: startAnimation called with type='${animationType}', winner='${winnerName}'`);
            pythonBackend.jsDebugMessage(`JS_DEBUG: About to start condition checks...`);
        } catch (e) {
            console.error("Failed to send debug to Python:", e);
        }
    }

    currentCountdownDurationS = parseInt(options.countdownDurationS, 10) || parseInt(options.countdownDuration, 10) || 30; // Added fallback for older key
    console.log(`JS: Setting visual countdown duration to ${currentCountdownDurationS}s`);

    // <<< KEY CHANGE: Don't do a full reset if this is a continuation of a prize reveal sequence >>>
    if (!options.isContinuation) {
        if (!initializeDisplay()) { console.error("initializeDisplay failed."); return; };
    } else {
        // For continuation, clean up previous animations but don't do full DOM reset
        console.log("JS: Continuation mode - stopping previous animations and ensuring countdown elements are ready");
        stopAnimationSequence(); // CRITICAL: Clean up prize reveal and any other animations
        
        // Hide all animation mode containers to prevent overlap
        if (bodyElement) {
            bodyElement.classList.remove('show-boxes', 'show-list', 'show-triglavian', 'show-node-path', 'show-trig-conduit', 'show-trig-code', 'show-neon-encrypted', 'show-deepseek');
        }
        const _neonContEl = document.getElementById('neon-encrypted-mode');
        [boxRevealMode, listRevealMode, triglavianRevealMode, nodePathRevealMode, trigConduitRevealMode, trigCodeRevealMode, _neonContEl, deepseekRevealMode].forEach(mode => {
            if(mode) { mode.style.display = 'none'; mode.classList.remove('visible', 'slide-up'); }
        });
        
        countdownContainer = document.getElementById('countdown-container'); 
        countdownProgress = document.getElementById('countdown-progress'); 
        countdownText = document.getElementById('countdown-text');
        
        // Initialize progress ring circumference if not already done
        if (countdownProgress && progressRingCircumference === 0) { 
            const radiusEl = countdownProgress.r?.baseVal; 
            if (radiusEl) { 
                const radius = radiusEl.value; 
                progressRingCircumference = 2 * Math.PI * radius; 
            } else { 
                console.error("Could not get countdown radius."); 
                progressRingCircumference = 283; 
            } 
            countdownProgress.style.strokeDasharray = `${progressRingCircumference} ${progressRingCircumference}`; 
        }
        
        // Ensure countdown container is ready to be shown
        if (countdownContainer) {
            countdownContainer.classList.remove('visible'); // Reset state
        }
        
        if (!countdownContainer || !countdownProgress || !countdownText) {
            console.error("Continuation Error: Countdown elements missing!");
            return;
        }
        
        console.log("JS: Continuation mode - countdown elements verified and ready");
    }
    
    if (animationContent) animationContent.style.display = 'flex';
    // Snap new content to opacity 0 (no transition) then let CSS fade it in
    if (animationContent) {
        animationContent.style.transition = 'none';
        animationContent.style.opacity = '0';
        void animationContent.offsetWidth; // force reflow so opacity:0 is committed
        animationContent.style.transition = '';
    }

    currentWinnerNameForCallback = String(winnerName || "Unknown");
    currentWinnerPlatform = String(options.winnerPlatform || '').toUpperCase();
    console.log(`JS: Stored original winner name: '${currentWinnerNameForCallback}', platform: '${currentWinnerPlatform}'`);

    // === Jackpot Mode — gold theme ===
    // Class is added here (and also via direct Python call as a fallback).
    // Removal happens only in stopAnimationSequence — never remove here on non-jackpot draws
    // because this function can be called again mid-sequence (e.g. fade-out retry) without
    // the isJackpot flag, which would otherwise strip the class prematurely.
    if (options.isJackpot) {
        document.body.classList.add('jackpot-mode');
        console.log('JS: 🎰 JACKPOT MODE — gold theme active');
    }

    const revealInterval = options.revealInterval ?? OPTIONS.DEFAULT_REVEAL_INTERVAL_MS;

    const listPythonDurationSetting = options.listTotalDurationS ?? options.listDuration ?? 7; // Added fallback for older key
    if (listPythonDurationSetting <= 4) {
        listScrollState.currentFastScrollDurationMs = OPTIONS.LIST_FAST_SCROLL_DURATION_MS_FAST;
    } else if (listPythonDurationSetting >= 11) {
        listScrollState.currentFastScrollDurationMs = OPTIONS.LIST_FAST_SCROLL_DURATION_MS_SLOW;
    } else {
        listScrollState.currentFastScrollDurationMs = OPTIONS.LIST_FAST_SCROLL_DURATION_MS_NORMAL;
    }


    const trigRevealSpeedLabel = options.trigRevealSpeed || 'Slow';
    let trigRevealIntervalMs = OPTIONS.TRIG_REVEAL_INTERVAL_MS_SLOW;
    if (trigRevealSpeedLabel === 'Fast') trigRevealIntervalMs = OPTIONS.TRIG_REVEAL_INTERVAL_MS_FAST;
    else if (trigRevealSpeedLabel === 'Normal') trigRevealIntervalMs = OPTIONS.TRIG_REVEAL_INTERVAL_MS_NORMAL;

    const nodePathSpeedLabel = options.nodePathSpeed || 'Normal';
    currentNodePathStepDuration = NODE_PATH_SPEED_DURATIONS[nodePathSpeedLabel] || NODE_PATH_SPEED_DURATIONS['Normal'];

    const trigConduitSpeedLabel = options.trigConduitSpeed || 'Normal';
    if (trigConduitSpeedLabel === 'Fast') currentTrigConduitStepDuration = OPTIONS.TRIG_CONDUIT_REVEAL_BASE_INTERVAL_MS_FAST;
    else if (trigConduitSpeedLabel === 'Slow') currentTrigConduitStepDuration = OPTIONS.TRIG_CONDUIT_REVEAL_BASE_INTERVAL_MS_SLOW;
    else currentTrigConduitStepDuration = OPTIONS.TRIG_CONDUIT_REVEAL_BASE_INTERVAL_MS_NORMAL;
    console.log(`JS: Trig Conduit Step Duration set to ${currentTrigConduitStepDuration}ms for speed '${trigConduitSpeedLabel}'`);

    const trigCodeLength = parseInt(options.animation_trig_code_length || options.trigCodeLength, 10) || OPTIONS.TRIG_CODE_DEFAULT_LENGTH; // Support older key
    const trigCodeRevealSpeedLabel = options.animation_trig_code_reveal_speed || options.trigCodeRevealSpeed || 'Normal';
    const trigCodeCharSet = options.animation_trig_code_char_set || options.trigCodeCharSet || OPTIONS.TRIG_CODE_DEFAULT_CHAR_SET;
    const trigCodeFinalistCount = parseInt(options.animation_trig_code_finalist_count || options.trigCodeFinalistCount, 10) || OPTIONS.TRIG_CODE_DEFAULT_FINALIST_COUNT;

    currentRevealInterval = revealInterval;

    const winnerNameToAnimate = String(winnerName || "").trim();
    const finalWinnerName = winnerNameToAnimate || "WINNER";

    bodyElement.classList.remove('show-boxes', 'show-list', 'show-triglavian', 'show-node-path', 'show-trig-conduit', 'show-trig-code', 'show-neon-encrypted', 'show-deepseek');
    let modeElement = null;
    let appearDelay = OPTIONS.SLIDE_UP_DELAY_MS;

    if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.resetRevealState === 'function') { NetworkAnimation.resetRevealState(); }
    if (typeof NetworkAnimation !== 'undefined' && typeof NetworkAnimation.setIdle === 'function') { NetworkAnimation.setIdle(false); }

    if (animationType === 'Vertical List') {
         console.log(`[LIST SOUND] List animation selected. Ticking sound will be handled by scrollListWithRAF.`);
    } else if (['Hacking', 'Triglavian Translation', 'Node Path Reveal', 'Triglavian Conduit', 'Triglavian Code Reveal'].includes(animationType)) {
        // Python Main.py handles playing "animation_start" for these before calling this JS function.
    }


    if (animationType === 'Vertical List') {
        console.log(`🎯 JS: Taking VERTICAL LIST path`);
        modeElement = listRevealMode; appearDelay = OPTIONS.LIST_APPEAR_DELAY_MS; bodyElement.classList.add('show-list');
         if (!modeElement) { console.error("List mode container missing!"); return; }
         requestAnimationFrame(() => {
             requestAnimationFrame(() => {
                if (!bodyElement.classList.contains('show-list')) return;
                if (!buildList(finalWinnerName, _cachedParticipantList)) {
                    console.error("Failed to build vertical list.");
                    if (listWinnerNameSpan) listWinnerNameSpan.textContent = finalWinnerName;
                    if (listWinnerDisplay) listWinnerDisplay.classList.add('visible');
                    callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
                    const cdTimeout = setTimeout(() => startCountdownPhase(), OPTIONS.COUNTDOWN_START_DELAY_AFTER_LIST_MS);
                    animationSequenceTimeoutIds.push(cdTimeout);
                    return;
                }
                const scrollStartTimeout = setTimeout(() => {
                    scrollListWithRAF(finalWinnerName);
                }, appearDelay + OPTIONS.LIST_SCROLL_START_DELAY_MS);
                animationSequenceTimeoutIds.push(scrollStartTimeout);
            });
         });
    }
     else if (animationType === 'Triglavian Translation') {
        console.log("� JS: Taking TRIGLAVIAN TRANSLATION path for PRIZE REVEAL!");
        console.log(`🎯 JS: Triglavian elements check - triglavianRevealMode: ${triglavianRevealMode}, triglavianBoxesRow: ${triglavianBoxesRow}, triglavianBoxes.length: ${triglavianBoxes.length}, OPTIONS.TRIG_BOX_COUNT: ${OPTIONS.TRIG_BOX_COUNT}`);
        
        // Send debug message to Python
        if (pythonBackend && typeof pythonBackend.jsDebugMessage === 'function') {
            try {
                pythonBackend.jsDebugMessage(`JS_DEBUG: Taking TRIGLAVIAN TRANSLATION path!`);
                pythonBackend.jsDebugMessage(`JS_DEBUG: Element check - triglavianRevealMode: ${!!triglavianRevealMode}, triglavianBoxesRow: ${!!triglavianBoxesRow}, triglavianBoxes.length: ${triglavianBoxes ? triglavianBoxes.length : 'undefined'}, expected: ${OPTIONS.TRIG_BOX_COUNT}`);
            } catch (e) {
                console.error("Failed to send Triglavian debug to Python:", e);
            }
        }
        modeElement = triglavianRevealMode; appearDelay = OPTIONS.TRIG_APPEAR_DELAY_MS; bodyElement.classList.add('show-triglavian');
        if (!modeElement || !triglavianBoxesRow || triglavianBoxes.length !== OPTIONS.TRIG_BOX_COUNT ) { 
            console.error("🚨 JS: Triglavian elements missing! Falling back to default."); 
            console.error(`🚨 JS: Missing elements - modeElement: ${modeElement}, triglavianBoxesRow: ${triglavianBoxesRow}, triglavianBoxes.length: ${triglavianBoxes.length}, expected: ${OPTIONS.TRIG_BOX_COUNT}`);
            
            // Send debug message to Python about fallback
            if (pythonBackend && typeof pythonBackend.jsDebugMessage === 'function') {
                try {
                    pythonBackend.jsDebugMessage(`JS_DEBUG: FALLING BACK TO HACKING! Missing - modeElement: ${!!modeElement}, triglavianBoxesRow: ${!!triglavianBoxesRow}, triglavianBoxes.length: ${triglavianBoxes ? triglavianBoxes.length : 'undefined'}`);
                } catch (e) {
                    console.error("Failed to send fallback debug to Python:", e);
                }
            }
            
            // FORCE CREATION OF TRIGLAVIAN BOXES IF THEY'RE MISSING
            if (!triglavianBoxes || triglavianBoxes.length !== OPTIONS.TRIG_BOX_COUNT) {
                console.log("🔧 JS: Attempting to create missing Triglavian boxes...");
                createTriglavianBoxes();
                console.log(`🔧 JS: After createTriglavianBoxes() - triglavianBoxes.length: ${triglavianBoxes.length}`);
                
                // TRY AGAIN AFTER CREATION
                if (triglavianRevealMode && triglavianBoxesRow && triglavianBoxes.length === OPTIONS.TRIG_BOX_COUNT) {
                    console.log("✅ JS: Triglavian elements successfully created, proceeding with Triglavian animation");
                    modeElement = triglavianRevealMode;
                } else {
                    console.error("🚨 JS: Still can't create Triglavian elements. Cannot run Hacking fallback (removed — native WebEngine crash). Completing draw gracefully.");
                    bodyElement.classList.remove('show-triglavian');
                    if (triglavianWinnerNameSpan) triglavianWinnerNameSpan.textContent = finalWinnerName;
                    if (triglavianWinnerDisplay) triglavianWinnerDisplay.classList.add('visible');
                    callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
                    const cdStartT = setTimeout(() => startCountdownPhase(), OPTIONS.SLIDE_UP_DELAY_MS);
                    animationSequenceTimeoutIds.push(cdStartT);
                    return; // Graceful completion, no Hacking
                }
            } else {
                console.error("🚨 JS: Other Triglavian elements missing. Completing draw gracefully (no Hacking fallback).");
                if (triglavianWinnerNameSpan) triglavianWinnerNameSpan.textContent = finalWinnerName;
                callPythonBackend("jsVisualsComplete", currentWinnerNameForCallback);
                return; // Complete failure, just exit without Hacking
            }
        }
        console.log("✅ JS: Triglavian elements verified, starting animation");
        const boxesAppearTimeout = setTimeout(showTriglavianBoxes, OPTIONS.TRIG_BOXES_APPEAR_DELAY_MS); animationSequenceTimeoutIds.push(boxesAppearTimeout);
        if (OPTIONS.TRIG_CYCLE_INTERVAL_MS > 0) { if (triglavianCyclingIntervalId) clearInterval(triglavianCyclingIntervalId); const cycleStartTimeout = setTimeout(() => { if (bodyElement.classList.contains('show-triglavian')) { triglavianCyclingIntervalId = setInterval(cycleTriglavianChars, OPTIONS.TRIG_CYCLE_INTERVAL_MS); cycleTriglavianChars(); animationSequenceTimeoutIds.push(triglavianCyclingIntervalId); } }, OPTIONS.TRIG_BOXES_APPEAR_DELAY_MS + 50); animationSequenceTimeoutIds.push(cycleStartTimeout); } else { triglavianBoxes.forEach(box => box.textContent = '-'); }
        startTriglavianReveal(finalWinnerName, trigRevealIntervalMs);
    } else if (animationType === 'Node Path Reveal') {
        modeElement = nodePathRevealMode; appearDelay = OPTIONS.NODE_PATH_APPEAR_DELAY_MS; bodyElement.classList.add('show-node-path');
        if (!modeElement) { console.error("Node Path container missing!"); return; }
        const startRevealTimeout = setTimeout(() => { startNodePathReveal(finalWinnerName); }, appearDelay);
        animationSequenceTimeoutIds.push(startRevealTimeout);
    } else if (animationType === 'Triglavian Conduit') {
        modeElement = trigConduitRevealMode;
        appearDelay = OPTIONS.TRIG_CONDUIT_APPEAR_DELAY_MS;
        bodyElement.classList.add('show-trig-conduit');
        if (!modeElement) { console.error("Triglavian Conduit mode container missing!"); return; }
        const startConduitTimeout = setTimeout(() => {
            startTriglavianConduitAnimation(finalWinnerName, currentTrigConduitStepDuration);
        }, appearDelay);
        animationSequenceTimeoutIds.push(startConduitTimeout);
    } else if (animationType === 'Triglavian Code Reveal') {
        modeElement = trigCodeRevealMode;
        appearDelay = OPTIONS.TRIG_CODE_APPEAR_DELAY_MS;
        bodyElement.classList.add('show-trig-code');
        if (!modeElement) { console.error("Triglavian Code Reveal mode container missing!"); return; }
        const startCodeRevealTimeout = setTimeout(() => {
            // Check for multi-winner mode
            const multiWinners = options.multiWinnerNames;
            if (multiWinners && Array.isArray(multiWinners) && multiWinners.length > 1) {
                startMultiTrigCodeReveal(multiWinners, trigCodeLength, trigCodeRevealSpeedLabel, trigCodeCharSet, trigCodeFinalistCount);
            } else {
                startTrigCodeReveal(finalWinnerName, trigCodeLength, trigCodeRevealSpeedLabel, trigCodeCharSet, trigCodeFinalistCount);
            }
        }, appearDelay);
        animationSequenceTimeoutIds.push(startCodeRevealTimeout);
    }
    else if (animationType === 'Neon Encrypted') {
        console.log("✨ JS: Taking NEON ENCRYPTED path");
        modeElement = document.getElementById('neon-encrypted-mode');
        appearDelay = 80;
        bodyElement.classList.add('show-neon-encrypted');
        if (!modeElement) { console.error("Neon encrypted mode container missing!"); return; }
        const startNeonTimeout = setTimeout(() => {
            startNeonEncryptedReveal(finalWinnerName, { durationMs: (options.durationMs || 15000) });
        }, appearDelay);
        animationSequenceTimeoutIds.push(startNeonTimeout);
    }
    else if (animationType === 'Neural Interface Decode') {
        console.log("🔷 JS: Taking NEURAL INTERFACE DECODE path");
        modeElement = document.getElementById('neural-decode-mode');
        appearDelay = 80;
        bodyElement.classList.add('show-neural-decode');
        if (!modeElement) { console.error("Neural decode mode container missing!"); return; }
        const startNDTimeout = setTimeout(() => {
            startNeuralDecodeReveal(finalWinnerName, {});
        }, appearDelay);
        animationSequenceTimeoutIds.push(startNDTimeout);
    }
    else if (animationType === 'Deep Seek' || animationType === 'Signature Acquisition') {
        console.log("🔍 JS: Taking DEEP SEEK path");
        modeElement = deepseekRevealMode;
        appearDelay = 80;
        bodyElement.classList.add('show-deepseek');
        if (!modeElement) { console.error("Deep Seek mode container missing!"); return; }
        const startDSTimeout = setTimeout(() => {
            startDeepSeekReveal(finalWinnerName, {});
        }, appearDelay);
        animationSequenceTimeoutIds.push(startDSTimeout);
    }
    else { // Unknown type / legacy Hacking -> redirect to stable Triglavian
        console.log("🚨 JS: Unhandled animation type:", animationType, "— Hacking was removed (native WebEngine crash). Using Triglavian Translation.");
        if (pythonBackend && typeof pythonBackend.jsDebugMessage === 'function') {
            try {
                pythonBackend.jsDebugMessage(`JS_DEBUG: Unhandled animationType='${animationType}' — falling back to Triglavian Translation (Hacking removed due to native WebEngine crash).`);
            } catch (e) {
                console.error("Failed to send debug to Python:", e);
            }
        }
        if (!options._trigFallbackDispatched) {
            setTimeout(() => startAnimation(finalWinnerName, 'Triglavian Translation', { ...options, _trigFallbackDispatched: true }), 50);
            animationSequenceTimeoutIds.push(-1); // placeholder (real id added inside startAnimation)
            return;
        }
        // Last resort so the draw never hangs: report visuals complete.
        callPythonBackend('jsVisualsComplete', currentWinnerNameForCallback);
        return;
    }

    if (modeElement) {
        modeElement.style.display = 'flex';
        const modeVisibleTimeout = setTimeout(() => { if (modeElement) modeElement.classList.add('visible'); }, 50);
        animationSequenceTimeoutIds.push(modeVisibleTimeout);
    }
    // Fade animation content back in with a smooth, noticeable transition
    const fadeInTimeout = setTimeout(() => {
        if (animationContent) {
            animationContent.style.transition = 'opacity 0.5s ease-in';
            animationContent.style.opacity = '1';
        }
    }, 50);
    animationSequenceTimeoutIds.push(fadeInTimeout);
}

// <<< NEW/REWRITTEN: Prize Reveal with 2 lines >>>
function startPrizeRevealAnimation(prizeName, donatorName, options = {}) {
    console.log(`JS: Starting PRIZE reveal for: ${prizeName}`);
    if (!prizeRevealContainer || !prizeRevealDisplay || !prizeRevealName || !prizeRevealDonator) {
        console.error("Prize reveal elements are missing!");
        callPythonBackend('jsPrizeRevealComplete', prizeName || "", donatorName || "");
        return;
    }
    stopAnimationSequence(); // Clean up previous animations first
    
    // Hide the main animation area to prevent overlap
    if (animationContent) animationContent.style.display = 'none';

    prizeRevealName.textContent = (prizeName || "UNKNOWN PRIZE").toUpperCase();
    if (donatorName && donatorName !== "<NO DONATOR SET>") {
        if (donatorName.toUpperCase().startsWith('TRIGGERED BY:')) {
            prizeRevealDonator.textContent = donatorName.toUpperCase();
        } else {
            prizeRevealDonator.textContent = `(DONATED BY: ${donatorName.toUpperCase()})`;
        }
        prizeRevealDonator.style.display = 'block';
    } else {
        prizeRevealDonator.textContent = '';
        prizeRevealDonator.style.display = 'none';
    }

    prizeRevealDisplay.classList.remove('revealed');
    prizeRevealContainer.style.display = 'flex';
    
    // Use requestAnimationFrame to ensure display is set before transition starts
    requestAnimationFrame(() => {
        prizeRevealContainer.classList.add('visible');
    });

    const translationDelay = 2500;
    const holdDelay = 2000;
    const fadeoutDelay = 400;

    // 1. After a delay, "translate" the text to normal font
    const translateTimeout = setTimeout(() => {
        callPythonBackend('jsRequestSound', OPTIONS.SOUND_NOTIFICATION_KEY);
        prizeRevealDisplay.classList.add('revealed');
    }, translationDelay);
    animationSequenceTimeoutIds.push(translateTimeout);

    // 2. After another delay, start fading out
    const hideTimeout = setTimeout(() => {
        prizeRevealContainer.classList.remove('visible');
    }, translationDelay + holdDelay);
    animationSequenceTimeoutIds.push(hideTimeout);

    // 3. After the fade out is complete, hide the element and call back to Python
    const finalTimeout = setTimeout(() => {
        prizeRevealContainer.style.display = 'none';
        callPythonBackend('jsPrizeRevealComplete', prizeName || "", donatorName || "");
    }, translationDelay + holdDelay + fadeoutDelay);
    animationSequenceTimeoutIds.push(finalTimeout);
}


// --- Initial Setup & Cleanup ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing...");
    initializeWebChannel();
    isBackgroundListsReady = false;
    if (typeof BackgroundLists !== 'undefined' && typeof BackgroundLists.init === 'function') {
        isBackgroundListsReady = BackgroundLists.init();
    } else { console.error("BackgroundLists module not found or init function missing!"); }
    if (!isBackgroundListsReady) { console.error("BackgroundLists initialization FAILED (DOM load)."); }
    else { console.log("BackgroundLists initialized successfully (DOM load)."); BackgroundLists.clear(); }
    initializeDisplay();

});

window.addEventListener('beforeunload', () => {
    stopAnimationSequence();
});

// --- ESI Overlay Test Helper ---
window.testESIOverlay = function(name, durationMs) {
    showESILoadingOverlay(name || 'Test Capsuleer');
    setTimeout(hideESILoadingOverlay, durationMs || 5000);
};
// Alt+E on the animation panel triggers a 5-second test run
document.addEventListener('keydown', function(e) {
    if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        window.testESIOverlay('Test Capsuleer', 5000);
    }
});

// --- Expose functions ---
window.startAnimation = startAnimation;
window.startPrizeRevealAnimation = startPrizeRevealAnimation;
window.cancelAnimationAndCountdown = function() { stopAnimationSequence({ fadeIn: true }); };
// window.updateParticipantsJS is already exposed
// window.handleESIDataUpdate is already exposed

// END script.js