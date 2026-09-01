// network_animation.js

// Helper Functions (remain the same)
function getRandomFloat(min, max) { return Math.random() * (max - min) + min; }
function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function distanceSq(x1, y1, x2, y2) { return Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2); }
function lerp(a, b, t) { return a + (b - a) * t; }
function parseRgba(colorString) { if (!colorString) return { r: 0, g: 0, b: 0, a: 1 }; colorString = colorString.trim(); let match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/); if (match) { return { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10), a: match[4] !== undefined ? parseFloat(match[4]) : 1, }; } match = colorString.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i); if (match) { return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16), a: 1, }; } match = colorString.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i); if (match) { return { r: parseInt(match[1] + match[1], 16), g: parseInt(match[2] + match[2], 16), b: parseInt(match[3] + match[3], 16), a: 1, }; } console.warn("NetworkAnimation: Could not parse color string:", colorString); return { r: 0, g: 0, b: 0, a: 1 }; }
function lerpColor(colorAStr, colorBStr, t) { const colorA = parseRgba(colorAStr); const colorB = parseRgba(colorBStr); const r = Math.round(lerp(colorA.r, colorB.r, t)); const g = Math.round(lerp(colorA.g, colorB.g, t)); const b = Math.round(lerp(colorA.b, colorB.b, t)); return `rgb(${r}, ${g}, ${b})`; }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }

// --- Network Animation Module ---
const NetworkAnimation = (() => {

    // --- Constants ---
    const OPTIONS = { NODE_COUNT: 50,
                      NODE_RADIUS_MIN: 1.5, NODE_RADIUS_MAX: 3.0, NODE_SPEED: 0.1,
                      LINK_WIDTH: 1.5, PULSE_DURATION_MS: 750, PULSE_INTENSITY: 0.6,
                      EXTRA_LINKS_COUNT: 2, // Links added per reveal event
                      EXTRA_LINK_MAX_DIST_SQ: 200 * 200,
                      // RANDOM_LINK_MAX_DIST_SQ: 350 * 350, // Random linking disabled for now
                      // RANDOM_LINK_INTERVAL_MS: 150,
                      // FADE_START_INTERVAL_MS: 50, // Staggering fade start removed
                      RESIZE_REDISTRIBUTE_THRESHOLD: 0.25
                    };

    // --- State Variables ---
    let backgroundCanvas = null; let bgCtx = null; let networkNodes = []; let networkLinks = [];
    let bgAnimationFrameId = null; let lastTimestamp = 0;
    let lastRevealedNode = null; // Tracks the last node linked due to a reveal event
    let boxNodeMap = new Map(); // Specifically for Hacking mode box->node mapping
    let revealedNodeSet = new Set(); // Tracks nodes linked during current reveal sequence (can clear this later)

    // --- Idle Throttle ---
    // Reduces sustained WebEngine compositing load when the background is not
    // part of an active draw/countdown. Default idle (throttled ~4fps); active
    // draws switch to full 60fps.
    let _idle = true;
    let _lastDrawTime = 0;
    const IDLE_FRAME_MS = 250;

    function setIdle(idle) {
        _idle = !!idle;
        if (!_idle) _lastDrawTime = 0; // force an immediate full draw on next frame
    }

    // --- Countdown Effect State --- <<< NEW / MODIFIED >>>
    let isCountdownActive = false;      // Is the main countdown visual/effect phase active?
    let isColorShiftPhaseActive = false;// Has the 50% mark passed for color shifting?
    let isFadePhaseActive = false;      // Has the 50% mark passed for fading?
    let countdownStartTime = 0;         // Timestamp when countdown phase started
    let currentCountdownDurationS = 30; // Stores the total duration for timing calculations
    let countdownPhaseTimerId = null;   // Stores setTimeout ID for triggering phase change

    // --- Removed State (Replaced by new countdown logic) ---
    // let linkColorShiftActive = false; // Replaced by isColorShiftPhaseActive
    // let linkTransitionActive = false; // Replaced by isFadePhaseActive
    // let linkColorShiftStartTime = 0; // Timing now based on countdownStartTime
    // let linkTransitionStartTime = 0; // Timing now based on countdownStartTime
    // let randomLinkIntervalId = null; // Disabling random linking for now
    // let stopRandomLinkTimeoutId = null;
    // let linksToFade = []; // No longer staggering fade start
    // let fadeIntervalId = null;

    let onUpdateCallback = null; // External callback for countdown visuals etc.
    let previousCanvasWidth = 0; let previousCanvasHeight = 0;

    // --- Classes ---
    class NetworkNode { // No changes needed here
        constructor(x, y, radius, color, canvasWidth, canvasHeight) { this.x = x; this.y = y; this.relativeX = x / canvasWidth; this.relativeY = y / canvasHeight; this.radius = radius; this.color = color; this.canvasWidth = canvasWidth; this.canvasHeight = canvasHeight; this.velocityX = (Math.random() - 0.5) * OPTIONS.NODE_SPEED * 2; this.velocityY = (Math.random() - 0.5) * OPTIONS.NODE_SPEED * 2; }
        draw() { if (!bgCtx) return; bgCtx.beginPath(); bgCtx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); bgCtx.fillStyle = this.color; bgCtx.fill(); }
        update() { this.x += this.velocityX; this.y += this.velocityY; if (this.x - this.radius < 0 || this.x + this.radius > this.canvasWidth) { this.velocityX *= -1; this.x = Math.max(this.radius, Math.min(this.canvasWidth - this.radius, this.x)); } if (this.y - this.radius < 0 || this.y + this.radius > this.canvasHeight) { this.velocityY *= -1; this.y = Math.max(this.radius, Math.min(this.canvasHeight - this.radius, this.y)); } this.relativeX = this.x / this.canvasWidth; this.relativeY = this.y / this.canvasHeight; }
        scalePosition(newWidth, newHeight) { this.canvasWidth = newWidth; this.canvasHeight = newHeight; this.x = this.relativeX * newWidth; this.y = this.relativeY * newHeight; this.x = Math.max(this.radius, Math.min(this.canvasWidth - this.radius, this.x)); this.y = Math.max(this.radius, Math.min(this.canvasHeight - this.radius, this.y)); }
        randomizePosition(newWidth, newHeight) { this.canvasWidth = newWidth; this.canvasHeight = newHeight; this.x = Math.random() * (newWidth - this.radius * 2) + this.radius; this.y = Math.random() * (newHeight - this.radius * 2) + this.radius; this.relativeX = this.x / newWidth; this.relativeY = this.y / newHeight; }
     }

    class NetworkLink { // <<< MODIFIED draw and added isFadeComplete >>>
         constructor(node1, node2, color, pulseColor) {
             this.node1 = node1;
             this.node2 = node2;
             this.baseColor = color;
             this.pulseColor = pulseColor; // Might not use this with new effects
             const parsedColor = parseRgba(this.baseColor);
             this.baseAlpha = parsedColor.a;
             this.baseR = parsedColor.r;
             this.baseG = parsedColor.g;
             this.baseB = parsedColor.b;
             this.pulseTimer = 0;
             // No need for isFading state on link itself, will check global flags
         }

         pulse() { this.pulseTimer = OPTIONS.PULSE_DURATION_MS; }

         update(deltaTime) {
             if (this.pulseTimer > 0) {
                 this.pulseTimer -= deltaTime;
                 if (this.pulseTimer < 0) this.pulseTimer = 0;
             }
             // Links are removed based on fade in the main loop's filter
             return true;
         }

         // Helper to get progress within the second half of the countdown
         _getCoundownSecondHalfProgress() {
            if (!isCountdownActive || !isFadePhaseActive || countdownStartTime === 0) return 0;

            const now = performance.now();
            const totalCountdownMs = currentCountdownDurationS * 1000;
            const halfCountdownMs = totalCountdownMs / 2;
            const phaseStartTime = countdownStartTime + halfCountdownMs;
            const phaseDuration = halfCountdownMs;

            if (now < phaseStartTime) return 0; // Not in the second half yet

            const elapsedInPhase = now - phaseStartTime;
            const progress = Math.min(1, elapsedInPhase / Math.max(1, phaseDuration)); // Clamp progress between 0 and 1
            return progress;
         }


         draw() {
             if (!bgCtx || !this.node1 || !this.node2) return;

             let currentBaseAlpha = this.baseAlpha;
             let currentWidth = OPTIONS.LINK_WIDTH;
             let r = this.baseR;
             let g = this.baseG;
             let b = this.baseB;

             // --- Pulse Effect ---
             // Apply pulse effect primarily *before* the fade phase starts fully
             if (this.pulseTimer > 0 && !isFadePhaseActive) {
                 const pulseProgress = Math.sin((1 - this.pulseTimer / OPTIONS.PULSE_DURATION_MS) * Math.PI);
                 currentBaseAlpha = lerp(this.baseAlpha, this.baseAlpha + OPTIONS.PULSE_INTENSITY, pulseProgress);
                 // Optionally make pulse brighter too
                 // r = lerp(this.baseR, 200, pulseProgress); // Example: pulse towards white
                 // g = lerp(this.baseG, 240, pulseProgress);
                 // b = lerp(this.baseB, 255, pulseProgress);
             }

             let finalAlpha = Math.max(0, Math.min(1, currentBaseAlpha));

             // --- Countdown Effects (Color Shift & Fade) ---
             if (isCountdownActive) {
                 const phaseProgress = this._getCoundownSecondHalfProgress(); // Progress from 0 to 1 during second half

                 if (isColorShiftPhaseActive && phaseProgress > 0) {
                     const redColorStr = getComputedStyle(document.documentElement).getPropertyValue('--network-link-fade-to-color').trim() || 'rgb(212, 53, 30)';
                     const targetColor = parseRgba(redColorStr);
                     r = Math.round(lerp(this.baseR, targetColor.r, phaseProgress));
                     g = Math.round(lerp(this.baseG, targetColor.g, phaseProgress));
                     b = Math.round(lerp(this.baseB, targetColor.b, phaseProgress));
                 }

                 if (isFadePhaseActive && phaseProgress > 0) {
                     const targetAlpha = 0; // Fade out completely
                     // Start fading from the alpha value *at the beginning of the fade phase*
                     // For simplicity here, we fade from the current calculated alpha (including pulse if active)
                     finalAlpha = lerp(finalAlpha, targetAlpha, phaseProgress);
                     finalAlpha = Math.max(0, Math.min(1, finalAlpha)); // Clamp alpha
                 }
             }

             // --- Draw ---
             if (finalAlpha <= 0.01) return; // Don't draw if effectively invisible

             bgCtx.save();
             bgCtx.globalAlpha = finalAlpha;
             bgCtx.beginPath();
             bgCtx.moveTo(this.node1.x, this.node1.y);
             bgCtx.lineTo(this.node2.x, this.node2.y);
             bgCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
             bgCtx.lineWidth = currentWidth;
             // Optional: Add glow effect, especially during countdown phases
             if (isFadePhaseActive) {
                 bgCtx.shadowColor = `rgba(${r}, ${g}, ${b}, ${finalAlpha * 0.7})`;
                 bgCtx.shadowBlur = 5;
             }
             bgCtx.stroke();
             bgCtx.restore();
         }

        // <<< NEW: Check if the link should be considered faded out >>>
        isFadeComplete() {
            if (!isFadePhaseActive) return false; // Not fading yet
            // Complete if progress in the second half is >= 1
            return this._getCoundownSecondHalfProgress() >= 1.0;
        }
     }

    // --- Core Functions ---
    function _resizeCanvas() { // No changes needed here
        if (!backgroundCanvas || !bgCtx) return;
        const currentWidth = backgroundCanvas.offsetWidth; const currentHeight = backgroundCanvas.offsetHeight;
        const needsResize = backgroundCanvas.width !== currentWidth || backgroundCanvas.height !== currentHeight;
        if (needsResize && currentWidth > 0 && currentHeight > 0) {
            const oldWidth = backgroundCanvas.width; const oldHeight = backgroundCanvas.height;
            backgroundCanvas.width = currentWidth; backgroundCanvas.height = currentHeight;
            console.log(`NetworkAnimation: Resized canvas from ${oldWidth}x${oldHeight} to ${currentWidth}x${currentHeight}`);
            const needsCreation = networkNodes.length === 0;
            let needsRedistribute = false;
            if (!needsCreation && oldWidth > 0 && oldHeight > 0) { const widthChange = Math.abs(currentWidth - oldWidth) / oldWidth; const heightChange = Math.abs(currentHeight - oldHeight) / oldHeight; if (widthChange > OPTIONS.RESIZE_REDISTRIBUTE_THRESHOLD || heightChange > OPTIONS.RESIZE_REDISTRIBUTE_THRESHOLD || oldWidth < 50 || oldHeight < 50) { needsRedistribute = true; }
            } else if (!needsCreation && (oldWidth === 0 || oldHeight === 0)) { needsRedistribute = true; }
            if (needsCreation) { const nodeColor = getComputedStyle(document.documentElement).getPropertyValue('--network-node-color').trim() || 'rgba(74, 241, 242, 0.3)'; for (let i = 0; i < OPTIONS.NODE_COUNT; i++) { const radius = getRandomFloat(OPTIONS.NODE_RADIUS_MIN, OPTIONS.NODE_RADIUS_MAX); const x = Math.random() * (currentWidth - radius * 2) + radius; const y = Math.random() * (currentHeight - radius * 2) + radius; networkNodes.push(new NetworkNode(x, y, radius, nodeColor, currentWidth, currentHeight)); } console.log(`NetworkAnimation: Created ${OPTIONS.NODE_COUNT} nodes.`);
            } else if (needsRedistribute) { console.log(`NetworkAnimation: Redistributing ${networkNodes.length} nodes.`); networkNodes.forEach(node => { node.randomizePosition(currentWidth, currentHeight); });
            } else { console.log(`NetworkAnimation: Scaling positions for ${networkNodes.length} nodes.`); networkNodes.forEach(node => { node.scalePosition(currentWidth, currentHeight); }); }
            previousCanvasWidth = currentWidth; previousCanvasHeight = currentHeight;
            networkLinks = []; boxNodeMap.clear(); lastRevealedNode = null; revealedNodeSet.clear();
            stopCountdownEffects(false); // Ensure all effects stop on resize
            // stopPostRevealLinking(); // Random linking disabled
        }
    }

    function _animateNetwork(timestamp = 0) { // <<< MODIFIED filter condition >>>
        if (!bgCtx || !backgroundCanvas) { bgAnimationFrameId = null; return; } // Added canvas check
        const deltaTime = Math.max(1, timestamp - lastTimestamp);
        lastTimestamp = timestamp;

        // Idle throttle: when no countdown/reveal is active the background is just
        // drifting particles — redraw at ~4fps instead of 60fps. This cuts the
        // sustained WebEngine compositing load massively over long sessions (the
        // client crash came after ~4h uptime with software rendering). The rAF
        // chain stays alive so start/stop behaviour is unchanged.
        if (_idle && _lastDrawTime > 0 && (timestamp - _lastDrawTime) < IDLE_FRAME_MS) {
            bgAnimationFrameId = requestAnimationFrame(_animateNetwork);
            return;
        }
        _lastDrawTime = timestamp;

        bgCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
        networkNodes.forEach(node => { node.update(); node.draw(); });

        // Filter links: remove if they are fully faded
        networkLinks = networkLinks.filter(link => {
             link.update(deltaTime); // Update pulse timer etc.
             link.draw();            // Draw handles alpha/color based on global state
             return !link.isFadeComplete(); // Keep link if it's not fully faded
        });

        if (typeof onUpdateCallback === 'function') { onUpdateCallback(); } // Used for countdown text update
        bgAnimationFrameId = requestAnimationFrame(_animateNetwork);
    }

    function _stopAnimation() {
        if (bgAnimationFrameId) { cancelAnimationFrame(bgAnimationFrameId); bgAnimationFrameId = null; }
        stopCountdownEffects(false); // Ensure countdown timers/effects also stop
        // stopPostRevealLinking(); // Random linking disabled
        console.log("NetworkAnimation: Stopped.");
    }

    function _init(updateCallback) { // No changes needed here
        console.log("NetworkAnimation: Initializing...");
        backgroundCanvas = document.getElementById('background-canvas');
        if (!backgroundCanvas) { console.error("NetworkAnimation: Background canvas element not found!"); return; }
        bgCtx = backgroundCanvas.getContext('2d');
        if (!bgCtx) { console.error("NetworkAnimation: Could not get 2D context."); return; }
        onUpdateCallback = updateCallback;
        previousCanvasWidth = 0; previousCanvasHeight = 0;
        _stopAnimation();
        _resizeCanvas(); // Creates nodes if needed
        lastTimestamp = performance.now();
        bgAnimationFrameId = requestAnimationFrame(_animateNetwork);
        if (!window.networkAnimationResizeListenerAdded) {
             window.addEventListener('resize', _resizeCanvas);
             window.networkAnimationResizeListenerAdded = true;
             console.log("NetworkAnimation: Added resize listener.");
        }
    }

    // --- Interaction Functions ---
    function _findNodeNearElement(element) { /* ... (no changes) ... */ if (!backgroundCanvas || !element || networkNodes.length === 0) return null; const canvasRect = backgroundCanvas.getBoundingClientRect(); const elemRect = element.getBoundingClientRect(); const elemCenterX = (elemRect.left + elemRect.right) / 2 - canvasRect.left; const elemCenterY = (elemRect.top + elemRect.bottom) / 2 - canvasRect.top; let nearestNode = null; let minDistanceSq = Infinity; networkNodes.forEach(node => { const distSq = distanceSq(node.x, node.y, elemCenterX, elemCenterY); if (distSq < minDistanceSq) { minDistanceSq = distSq; nearestNode = node; } }); return nearestNode; }
    function _createOrPulseLink(nodeA, nodeB) { /* ... (no changes needed, draw handles countdown) ... */ if (!nodeA || !nodeB || nodeA === nodeB) return; let existingLink = networkLinks.find(l => (l.node1 === nodeA && l.node2 === nodeB) || (l.node1 === nodeB && l.node2 === nodeA)); if (existingLink) { existingLink.pulse(); } else { const linkColor = getComputedStyle(document.documentElement).getPropertyValue('--network-link-color').trim() || 'rgba(74, 241, 242, 0.4)'; const pulseColor = getComputedStyle(document.documentElement).getPropertyValue('--network-link-pulse-color').trim() || 'rgba(192, 255, 255, 0.9)'; const newLink = new NetworkLink(nodeA, nodeB, linkColor, pulseColor); networkLinks.push(newLink); newLink.pulse(); } }
    // function _addRandomLink() { /* ... (Disabled for now) ... */ }

    // --- Internal Reveal Linking Logic ---
    function _handleRevealLinking(targetNode) { // No changes needed here
        if (!targetNode) return;
        revealedNodeSet.add(targetNode); // Track revealed node
        if (lastRevealedNode && lastRevealedNode !== targetNode) {
            _createOrPulseLink(targetNode, lastRevealedNode);
        }
        if (networkNodes.length > 1) {
            const otherNodes = networkNodes.filter(node => node !== targetNode);
            if (otherNodes.length > 0) {
                const distances = otherNodes.map(otherNode => ({ node: otherNode, distSq: distanceSq(targetNode.x, targetNode.y, otherNode.x, otherNode.y) }));
                distances.sort((a, b) => a.distSq - b.distSq);
                let linksCreated = 0;
                for (const distInfo of distances) {
                    if (linksCreated >= OPTIONS.EXTRA_LINKS_COUNT) break;
                    if (distInfo.distSq <= OPTIONS.EXTRA_LINK_MAX_DIST_SQ) { _createOrPulseLink(targetNode, distInfo.node); linksCreated++; }
                    else { break; }
                }
            }
        }
        lastRevealedNode = targetNode; // Update the last node revealed
    }

    // --- Interface for script.js ---

    // Called specifically by Hacking mode
    function notifyBoxReveal(boxIndex, boxElement) { // No changes needed here
         let currentNode = boxNodeMap.get(boxIndex);
         if (!currentNode) { currentNode = _findNodeNearElement(boxElement); if (currentNode) { boxNodeMap.set(boxIndex, currentNode); } else { console.warn(`NetworkAnimation: Could not find node near box ${boxIndex}`); return; } }
         _handleRevealLinking(currentNode);
    }

    // Called by non-hacking modes (Triglavian, Node Path)
    function notifyGenericReveal(element) { // <<< RENAMED from notifyGenericReveal >>>
        const targetNode = _findNodeNearElement(element);
        if (targetNode) {
            // console.log("NetworkAnimation: Generic reveal near element, linking node."); // Debug
            _handleRevealLinking(targetNode); // Use common linking logic
        } else {
            console.warn("NetworkAnimation: Could not find node near generic reveal element.");
        }
    }

    function resetRevealState() { // No changes needed here
        lastRevealedNode = null;
        boxNodeMap.clear();
        revealedNodeSet.clear();
        networkLinks = []; // Clear all links on reset
        console.log("NetworkAnimation: Reveal state reset.");
    }

    // --- Random Linking Disabled ---
    // function startPostRevealLinking(durationMs) { /* ... */ }
    // function stopPostRevealLinking() { /* ... */ }

    // --- Countdown Effects --- <<< MODIFIED >>>
    function startCountdownEffects(durationS) {
        if (isCountdownActive) {
            console.warn("NetworkAnimation: startCountdownEffects called while already active.");
            stopCountdownEffects(false); // Stop previous cleanly before starting new
        }
        console.log(`NetworkAnimation: Starting countdown effects (Duration: ${durationS}s)`);
        setIdle(false); // Full 60fps while the countdown/reveal is on screen
        isCountdownActive = true;
        isColorShiftPhaseActive = false; // Reset phase flags
        isFadePhaseActive = false;
        currentCountdownDurationS = durationS;
        countdownStartTime = performance.now();

        // Clear any existing phase timer
        if (countdownPhaseTimerId) {
            clearTimeout(countdownPhaseTimerId);
            countdownPhaseTimerId = null;
        }

        // Set timer to trigger phase change at 50%
        const halfDurationMs = (currentCountdownDurationS / 2) * 1000;
        countdownPhaseTimerId = setTimeout(() => {
             if (!isCountdownActive) return; // Check if cancelled before timer fires
             console.log("NetworkAnimation: Reached 50% countdown mark. Activating color shift and fade phases.");
             isColorShiftPhaseActive = true;
             isFadePhaseActive = true;
             countdownPhaseTimerId = null; // Clear the timer ID
         }, halfDurationMs);
    }

    function stopCountdownEffects(naturalFinish = false) { // <<< MODIFIED >>>
        if (!isCountdownActive && !naturalFinish) {
             // Avoid resetting state if already stopped and not a natural finish call
             // console.log("NetworkAnimation: stopCountdownEffects called but not active."); // Debug
             return;
        }
        console.log(`NetworkAnimation: Stopping countdown effects (Natural Finish: ${naturalFinish}).`);
        setIdle(true); // Back to throttled idle background

        // Clear phase timer
        if (countdownPhaseTimerId) {
            clearTimeout(countdownPhaseTimerId);
            countdownPhaseTimerId = null;
        }

        // Reset global state flags
        isCountdownActive = false;
        isColorShiftPhaseActive = false;
        isFadePhaseActive = false;
        countdownStartTime = 0;

        // Reset links only if cancelled early
        if (!naturalFinish) {
            console.log("NetworkAnimation: Resetting link state due to cancellation.");
            // Setting flags to false is enough, the draw loop will stop applying effects.
            // We don't need to manually reset color/alpha on each link unless
            // we want an *instant* snap back, which might be jarring.
            // Letting them naturally return to base state via the draw loop seems smoother.
            // If an instant reset is desired, uncomment the loop below:
            /*
            networkLinks.forEach(link => {
                 // Reset any visual state modified by countdown effects
                 // Note: This requires Link class to store original values if needed
                 link.pulseTimer = 0; // Stop pulsing too
            });
            */
        } else {
            console.log("NetworkAnimation: Allowing natural fade out to complete (if any links remain).");
            // If finished naturally, links marked as fading continue fading via the draw loop
            // until isFadeComplete() returns true and they are filtered out.
        }
    }

    function forceResizeCheck() { console.log("NetworkAnimation: Forcing resize check..."); _resizeCanvas(); }

    // Public Interface
    return {
        init: _init,
        stop: _stopAnimation,
        setIdle: setIdle,
        notifyBoxReveal: notifyBoxReveal,           // For Hacking mode
        notifyGenericReveal: notifyGenericReveal, // For Triglavian, Node Path etc.
        resetRevealState: resetRevealState,
        // startPostRevealLinking / stopPostRevealLinking : // Disabled
        startCountdownEffects: startCountdownEffects, // Modified
        stopCountdownEffects: stopCountdownEffects,   // Modified
        forceResizeCheck: forceResizeCheck,
    };
})();