// background_lists.js

// Helper function (remains the same)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const BackgroundLists = (() => {

    // --- Constants ---
    const OPTIONS = {
        BG_LIST_MAX_ITEMS_DISPLAY: 100, // Max unique items to fetch from participant list
        SCROLL_DURATION: 40, // seconds for one full scroll cycle (adjusts speed)
    };

    // --- State Variables ---
    let leftListUl = null;
    let rightListUl = null;
    let isInitialized = false;
    let currentParticipants = []; // Keep track of current participants
    let animationFrameId = null;
    let scrollPositions = { left: 0, right: 0 }; // Scroll position in % (0 to 100+)
    let lastTimestamp = 0;

    // --- Core Functions ---
    function _init() {
        console.log("BackgroundLists: Attempting init...");
        leftListUl = document.getElementById('left-bg-list-ul');
        rightListUl = document.getElementById('right-bg-list-ul');
        if (!leftListUl || !rightListUl) {
             console.error("BackgroundLists INIT FAILED: Could not find UL elements.");
             isInitialized = false;
             return false;
        }
        console.log("BackgroundLists: Initialization successful.");
        isInitialized = true;
        clearLists(); // Ensure lists are clear on init
        currentParticipants = [];
        scrollPositions = { left: 0, right: 0 };
        // Animation starts only when update is called with participants
        return true;
    }

     function _startAnimation() {
        if (!isInitialized || animationFrameId) return; // Don't restart if already running
        _stopAnimation(); // Ensure any existing animation is stopped cleanly first
        // Reset scroll positions to start from the top visually
        scrollPositions = { left: 0, right: 0 };
        leftListUl.style.transform = `translateY(0%)`;
        rightListUl.style.transform = `translateY(0%)`;
        lastTimestamp = performance.now();
        animationFrameId = requestAnimationFrame(_animate);
        console.log("BackgroundLists: Animation started.");
    }

    function _stopAnimation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            console.log("BackgroundLists: Animation stopped.");
        }
         // Reset transform explicitly when stopping
        if(leftListUl) leftListUl.style.transform = `translateY(0%)`;
        if(rightListUl) rightListUl.style.transform = `translateY(0%)`;
        scrollPositions = { left: 0, right: 0 };
    }

     function _animate(timestamp) {
        if (!isInitialized || !leftListUl || !rightListUl || !leftListUl.parentElement || !rightListUl.parentElement ) {
            console.warn("BackgroundLists: UL elements or parents lost, stopping animation.");
            _stopAnimation();
            return;
        }

        const deltaTime = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        // Calculate scroll amount based on elapsed time and scroll duration
        // The list needs to scroll 50% of its *doubled* height to loop once.
        // So, scroll 50% of the visual height in SCROLL_DURATION seconds.
        const scrollPercentPerSecond = 50 / OPTIONS.SCROLL_DURATION;
        const scrollAmount = scrollPercentPerSecond * (deltaTime / 1000); // % per second

        // Update scroll positions for both lists
        scrollPositions.left = (scrollPositions.left + scrollAmount) % 50; // Loop every 50%
        scrollPositions.right = (scrollPositions.right + scrollAmount) % 50; // Loop every 50%

        // Apply transform to lists using percentage
        // We translate negatively (upwards)
        leftListUl.style.transform = `translateY(-${scrollPositions.left}%)`;
        rightListUl.style.transform = `translateY(-${scrollPositions.right}%)`;

        // Continue the loop
        animationFrameId = requestAnimationFrame(_animate);
    }

    function clearLists() {
        if (!isInitialized) { console.warn("BackgroundLists: Cannot clear, not initialized."); return; }
        console.log("BackgroundLists: Clearing lists...");
        _stopAnimation(); // Stop animation before clearing

        // Clear content using innerHTML (simpler and generally faster for full clears)
        if (leftListUl) {
            leftListUl.innerHTML = '';
            // Reset styles that might affect positioning
            leftListUl.style.transform = 'translateY(0%)';
        }
        if (rightListUl) {
            rightListUl.innerHTML = '';
            rightListUl.style.transform = 'translateY(0%)';
        }

        console.log("BackgroundLists: Finished clearing lists.");
        scrollPositions = { left: 0, right: 0 }; // Reset scroll state
        currentParticipants = []; // Clear participant cache as well
    }


    function update(participants = []) {
        if (!isInitialized) { console.warn("BackgroundLists: Cannot update, not initialized."); return false; }
        if (!leftListUl || !rightListUl) { console.error("BackgroundLists UPDATE ERROR: UL elements lost!"); isInitialized = false; return false; }

        console.log(`BackgroundLists: Update called with ${participants.length} participants.`);
        currentParticipants = [...participants]; // Update internal state variable

        clearLists(); // Clear previous content and stop animation

        // Determine which participants to display (limit if necessary)
        let displayParticipants = participants;
        if (participants.length > OPTIONS.BG_LIST_MAX_ITEMS_DISPLAY) {
            displayParticipants = shuffleArray([...participants]).slice(0, OPTIONS.BG_LIST_MAX_ITEMS_DISPLAY); // Shuffle BEFORE slicing
            console.log(`BackgroundLists: Shuffled and sliced participants to ${OPTIONS.BG_LIST_MAX_ITEMS_DISPLAY}.`);
        } else if (participants.length > 0) {
            displayParticipants = shuffleArray([...participants]); // Shuffle even if not slicing for variety
             console.log(`BackgroundLists: Shuffled ${participants.length} participants.`);
        }

        // Handle the case of zero participants
        if (displayParticipants.length === 0) {
            console.log("BackgroundLists: No participants to display, adding placeholder.");
            const li = document.createElement('li');
            li.textContent = '--- NO ENTRANTS ---';
            li.style.opacity = '0.5';
            li.style.color = 'grey';
            if (leftListUl) leftListUl.appendChild(li.cloneNode(true));
            if (rightListUl) rightListUl.appendChild(li.cloneNode(true)); // Use cloneNode here too
             _stopAnimation(); // Ensure animation doesn't run with placeholder
            return true; // Indicate success (placeholder added)
        }

        // Create list items using DocumentFragment for performance
        const fragmentLeft = document.createDocumentFragment();
        const fragmentRight = document.createDocumentFragment();
        console.log(`BackgroundLists: Creating ${displayParticipants.length} list items...`);

        displayParticipants.forEach((name, index) => {
            const liLeft = document.createElement('li');
            liLeft.textContent = name || `Item ${index+1}`; // Basic fallback
            fragmentLeft.appendChild(liLeft);

            const liRight = document.createElement('li');
            liRight.textContent = name || `Item ${index+1}`;
            fragmentRight.appendChild(liRight);
        });
        console.log("BackgroundLists: Fragments created.");

        try {
            // Append the first batch of items
             if (leftListUl) leftListUl.appendChild(fragmentLeft);
             if (rightListUl) rightListUl.appendChild(fragmentRight);
             console.log("BackgroundLists: Appended initial fragments.");

             // Duplicate list items to enable continuous scrolling illusion
             if (leftListUl && leftListUl.children.length > 0) {
                 duplicateListContent(leftListUl);
             }
            if (rightListUl && rightListUl.children.length > 0) {
                 duplicateListContent(rightListUl);
             }
            console.log("BackgroundLists: List content duplicated.");

        } catch (e) {
            console.error("BackgroundLists ERROR appending fragments or duplicating:", e);
            return false; // Indicate failure
        }

        // Start the scrolling animation only if there's content
        if (leftListUl.children.length > 0 || rightListUl.children.length > 0) {
            _startAnimation();
        }
        console.log("BackgroundLists: Update finished.");
        return true; // Indicate success
    }

     function duplicateListContent(ulElement) {
        if (!ulElement || ulElement.children.length === 0) return; // Don't duplicate if empty

        const originalItemCount = ulElement.children.length;
        const fragment = document.createDocumentFragment();

        // Clone existing items to append
        for (let i = 0; i < originalItemCount; i++) {
             if (ulElement.children[i]) { // Check if child exists before cloning
                 const clone = ulElement.children[i].cloneNode(true);
                 fragment.appendChild(clone);
             } else {
                 console.warn(`BackgroundLists: Tried to clone non-existent child at index ${i} in`, ulElement.id);
             }
         }
        ulElement.appendChild(fragment);
        // The height should naturally be 200% of the original content now.
        // CSS handles the container overflow.
    }

    // --- Public Interface ---
    return {
        init: _init,
        update: update,
        clear: clearLists,
    };

})();

// Initialization is called from script.js's DOMContentLoaded
// Ensure this script is loaded *before* script.js in animation.html

// Ensure BackgroundLists module is initialized after DOM content is loaded.
// Typically called from the main script (script.js) which manages the overall page load.