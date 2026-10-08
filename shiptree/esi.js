/* ============================================================================
 * EVE SSO for the Ship tree — authorization code + PKCE, entirely client-side.
 *
 * EVE's token endpoint answers with `Access-Control-Allow-Origin: *`, so a
 * public client (no secret) can exchange the code in the browser. Nothing here
 * needs the RustyBot API, and no client secret is shipped.
 *
 * Usage:
 *   EVE_SSO.login()                  -> bounce to EVE
 *   EVE_SSO.character()              -> { id, name } | null
 *   EVE_SSO.fetchSkills()            -> Map(skillID -> trained level)
 *   EVE_SSO.logout()
 *   EVE_SSO.handleCallback()         -> for sso-callback.html only
 * ==========================================================================*/
window.EVE_SSO = (() => {
  'use strict';

  const CLIENT_ID = 'e5b8b41563364777b929e4f9f9f39720';
  const SCOPES = ['esi-skills.read_skills.v1', 'esi-skills.read_skillqueue.v1'];
  const PROD_CALLBACK = 'https://www.rustybot.co.uk/shiptree/sso-callback.html';
  const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
  const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
  const ESI = 'https://esi.evetech.net/latest';
  const REFRESH_SKEW_MS = 60000;

  // The registered callback, or this origin's own callback page when running
  // locally (add http://localhost:8777/sso-callback.html to the EVE app).
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const here = location.pathname.replace(/[^/]*$/, '');   // folder of this page
  const REDIRECT = isLocal ? `${location.origin}${here}sso-callback.html` : PROD_CALLBACK;

  const K = { tokens: 'st_esi_tokens', char: 'st_esi_char', pkce: 'st_esi_pkce' };
  const read = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };
  const write = (store, key, v) => { try { store.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };
  const drop = (store, key) => { try { store.removeItem(key); } catch { /* ignore */ } };

  const tokens = () => read(localStorage, K.tokens);
  const character = () => read(localStorage, K.char);

  /* ------------------------------------------------------------ PKCE bits */

  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const random = (bytes = 32) => {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return b64url(a.buffer);
  };

  async function challengeFor(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(digest);
  }

  const jwtPayload = token => {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch { return null; }
  };

  function remember(tok) {
    const payload = jwtPayload(tok.access_token) || {};
    const id = String(payload.sub || '').split(':').pop();
    write(localStorage, K.tokens, {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: Date.now() + (tok.expires_in || 1200) * 1000,
    });
    if (id) write(localStorage, K.char, { id, name: payload.name || 'Pilot' });
    return character();
  }

  /* ---------------------------------------------------------------- login */

  async function login() {
    const verifier = random(32);
    const state = random(16);
    write(sessionStorage, K.pkce, { verifier, state });
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      scope: SCOPES.join(' '),
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: 'S256',
    });
    location.href = `${AUTHORIZE_URL}?${params.toString()}`;
  }

  function logout() {
    drop(localStorage, K.tokens);
    drop(localStorage, K.char);
    drop(sessionStorage, K.pkce);
  }

  /* ------------------------------------------------------------- callback */

  /** Runs on sso-callback.html: swap ?code for tokens, then go back to the app. */
  async function handleCallback() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    const state = q.get('state');
    const err = q.get('error');
    if (err) return { ok: false, message: q.get('error_description') || err };
    if (!code) return { ok: false, message: 'No code returned.' };

    const pkce = read(sessionStorage, K.pkce);
    if (!pkce || pkce.state !== state) return { ok: false, message: 'State mismatch — start the sign-in again.' };

    try {
      const r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: CLIENT_ID,
          code_verifier: pkce.verifier,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        return { ok: false, message: j.error_description || `Token exchange failed (HTTP ${r.status})` };
      }
      const tok = await r.json();
      drop(sessionStorage, K.pkce);
      return { ok: true, character: remember(tok) };
    } catch (e) {
      return { ok: false, message: `Token exchange failed: ${e.message}` };
    }
  }

  /* --------------------------------------------------------------- tokens */

  let refreshing = null;
  async function ensureFresh() {
    const t = tokens();
    if (!t || !t.access_token) throw new Error('not signed in');
    if (t.expires_at && Date.now() < t.expires_at - REFRESH_SKEW_MS) return t;
    if (!t.refresh_token) { logout(); throw new Error('session expired'); }
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const r = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: t.refresh_token,
              client_id: CLIENT_ID,
            }),
          });
          if (!r.ok) throw new Error(`refresh HTTP ${r.status}`);
          const tok = await r.json();
          const next = {
            access_token: tok.access_token,
            refresh_token: tok.refresh_token || t.refresh_token,
            expires_at: Date.now() + (tok.expires_in || 1200) * 1000,
          };
          write(localStorage, K.tokens, next);
          return next;
        } catch (e) {
          logout();                     // dead grant: fall back to signed out
          throw new Error('session expired');
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  /* ----------------------------------------------------------------- ESI */

  async function esi(path) {
    const t = await ensureFresh();
    const r = await fetch(`${ESI}${path}`, { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (r.status === 401) { logout(); throw new Error('session expired'); }
    if (!r.ok) throw new Error(`ESI ${path} -> HTTP ${r.status}`);
    return r.json();
  }

  /** Trained levels for the signed-in character: Map(skillID -> level). */
  async function fetchSkills() {
    const c = character();
    if (!c) throw new Error('not signed in');
    const data = await esi(`/characters/${c.id}/skills/?datasource=tranquility`);
    const out = new Map();
    for (const s of data.skills || []) {
      const lvl = s.active_skill_level ?? s.trained_skill_level ?? 0;
      if (lvl > 0) out.set(Number(s.skill_id), Number(lvl));
    }
    return out;
  }

  /** What the character is training right now (or []). */
  async function fetchQueue() {
    const c = character();
    if (!c) return [];
    try {
      const q = await esi(`/characters/${c.id}/skillqueue/?datasource=tranquility`);
      return Array.isArray(q) ? q : [];
    } catch { return []; }
  }

  return {
    CLIENT_ID, SCOPES, REDIRECT,
    login, logout, handleCallback,
    tokens, character, ensureFresh,
    fetchSkills, fetchQueue,
    portraitUrl: (id, size = 64) => `https://images.evetech.net/characters/${id}/portrait?size=${size}`,
  };
})();
