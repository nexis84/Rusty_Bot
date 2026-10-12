/* ============================================================================
 * Ship tree — Welcome / Help overlay
 *
 * Shown on first load, and re-openable from the top-bar "welcome" button.
 * The CTA buttons drive the existing app by clicking its real DOM controls,
 * so nothing inside app.js needs to change.
 * ==========================================================================*/
(() => {
  'use strict';

  const KEY = 'st.welcome_seen';
  const dom = document.getElementById('welcomeDom');
  if (!dom) return;

  const $ = sel => document.querySelector(sel);

  const store = {
    seen() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
    mark() { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } },
  };

  const isOpen = () => !dom.classList.contains('hidden');
  function open() { dom.classList.remove('hidden'); }
  function close() { dom.classList.add('hidden'); store.mark(); }

  const click = sel => { const el = $(sel); if (el) el.click(); };
  function focusSearch() {
    const q = $('#q');
    if (!q) return;
    q.focus();
    try { q.select(); } catch { /* ignore */ }
  }
  function signIn() {
    if (window.EVE_SSO && typeof window.EVE_SSO.login === 'function') window.EVE_SSO.login();
  }

  function act(name) {
    switch (name) {
      case 'explore': close(); break;
      case 'search': close(); focusSearch(); break;
      case 'combat': close(); click('#rowFilter button[data-rows="combat"]'); break;
      case 'industry': close(); click('#rowFilter button[data-rows="industry"]'); break;
      case 'flyable': close(); click('#flyable'); break;
      case 'alpha': close(); click('#alphaBtn'); break;
      case 'key': close(); click('#keyBtn'); break;
      case 'skills': close(); click('#skillsBtn'); break;
      case 'fit': close(); click('#zfit'); break;
      case 'sso': signIn(); break;
      default: close();
    }
  }

  // CTA buttons, feature cards and the backdrop.
  dom.addEventListener('click', e => {
    const el = e.target.closest('[data-welcome-act]');
    if (el) { e.preventDefault(); act(el.getAttribute('data-welcome-act')); return; }
    if (e.target === dom) close();
  });

  const ssoBtn = document.getElementById('welcomeSsoLogin');
  if (ssoBtn) ssoBtn.addEventListener('click', signIn);

  const openBtn = document.getElementById('welcomeBtn');
  if (openBtn) openBtn.addEventListener('click', () => (isOpen() ? close() : open()));

  // Esc closes the overlay (captured so it doesn't also clear the selection).
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(); }
  }, true);

  // Reflect an already-signed-in pilot.
  try {
    const c = window.EVE_SSO && window.EVE_SSO.character && window.EVE_SSO.character();
    if (c && ssoBtn) {
      ssoBtn.innerHTML = '<i class="fas fa-circle-check"></i> Signed in as ' + c.name;
      ssoBtn.disabled = true;
      ssoBtn.classList.add('is-done');
      const p = document.querySelector('.welcome-sso-text p');
      if (p) p.textContent = 'Signed in as ' + c.name + ' \u2014 the tree is coloured against your real trained skills.';
    }
  } catch { /* ignore */ }

  if (!store.seen()) open();
})();
