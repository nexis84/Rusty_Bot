/* ============================================================================
 * Rusty Skill Planner - Welcome / Help overlay
 *
 * Shown on first load and re-openable from the compass button in the top bar.
 * The CTA buttons drive the existing app through its real navigation controls.
 * ==========================================================================*/
(() => {
    'use strict';

    const KEY = 'sp.welcome_seen';
    const dom = document.getElementById('welcomeDom');
    if (!dom) return;

    const store = {
        seen() {
            try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
        },
        mark() {
            try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
        }
    };

    const isOpen = () => !dom.classList.contains('hidden');

    function updateSso() {
        const button = document.getElementById('welcomeSsoLogin');
        const text = document.querySelector('#welcomeSso .welcome-sso-text p');
        const heading = document.querySelector('#welcomeSso .welcome-sso-text strong');
        const charId = window.esiAuth?.getCurrentCharacter?.();
        const character = charId ? window.esiAuth?.tokens?.[charId] : null;

        if (character && button) {
            button.innerHTML = `<i class="fas fa-circle-check"></i> Signed in as ${character.characterName || 'Pilot'}`;
            button.disabled = true;
            button.classList.add('is-done');
            if (heading) heading.textContent = 'Character connected';
            if (text) text.textContent = `Signed in as ${character.characterName || 'your pilot'}. Your skills and personal saved fittings are ready.`;
        } else if (button) {
            button.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign in with EVE';
            button.disabled = false;
            button.classList.remove('is-done');
            if (heading) heading.textContent = 'Unlock your character';
            if (text) text.textContent = 'Sign in with EVE SSO to load real skills, personal saved fittings, and doctrine readiness.';
        }
    }

    function open() {
        updateSso();
        dom.classList.remove('hidden');
        document.body.classList.add('welcome-open');
        setTimeout(() => dom.querySelector('.welcome-cta')?.focus(), 0);
    }

    function close() {
        dom.classList.add('hidden');
        document.body.classList.remove('welcome-open');
        store.mark();
    }

    function navigate(view) {
        close();
        const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
        if (nav) {
            nav.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function act(name) {
        if (name === 'close') { close(); return; }
        if (name === 'sso') {
            close();
            document.getElementById('esiLoginBtn')?.click();
            return;
        }
        navigate(name);
    }

    dom.addEventListener('click', event => {
        const action = event.target.closest('[data-welcome-act]');
        if (action) {
            event.preventDefault();
            act(action.getAttribute('data-welcome-act'));
            return;
        }
        if (event.target === dom) close();
    });

    document.getElementById('welcomeClose')?.addEventListener('click', close);
    document.getElementById('welcomeBtn')?.addEventListener('click', () => {
        if (isOpen()) close();
        else open();
    });
    document.getElementById('quickWelcomeBtn')?.addEventListener('click', open);
    document.getElementById('welcomeSsoLogin')?.addEventListener('click', () => act('sso'));

    window.updateWelcomeSso = updateSso;
    window.addEventListener('focus', updateSso);
    window.addEventListener('storage', updateSso);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isOpen()) {
            event.stopPropagation();
            close();
            return;
        }
        if (event.key !== 'Tab' || !isOpen()) return;

        const focusable = [...dom.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter(element => !element.disabled && element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }, true);

    // Do not cover a shared plan link; the recipient came for the plan.
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const isSharedPlan = params.has('plan') || hashParams.has('plan');
    if (!store.seen() && !isSharedPlan) open();
})();
