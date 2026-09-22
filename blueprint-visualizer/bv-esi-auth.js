// Blueprint Visualizer SSO — blueprint + asset scopes. Graceful if backend not configured.
//
// Access tokens live ~20 min; the refresh token is used transparently so calls
// made an hour after login don't 401 (ESI 401s even public endpoints when handed
// an expired Bearer token).
(function () {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const BASE = isLocal ? 'http://localhost:8080' : 'https://api.rustybot.co.uk';
  const REDIRECT = isLocal ? 'http://localhost:8080/blueprint-visualizer/sso-callback.html' : 'https://www.rustybot.co.uk/blueprint-visualizer/sso-callback.html';
  const SCOPES = ['esi-characters.read_blueprints.v1', 'esi-corporations.read_blueprints.v1', 'esi-assets.read_assets.v1', 'esi-assets.read_corporation_assets.v1', 'esi-skills.read_skills.v1', 'esi-universe.read_structures.v1', 'esi-corporations.read_structures.v1', 'esi-ui.open_window.v1'];
  // Refresh a minute before expiry so in-flight calls never race the clock.
  const REFRESH_SKEW_MS = 60000;
  let clientId = null;
  async function getClientId() {
    if (clientId) return clientId;
    const r = await fetch(BASE + '/api/bv/config');
    if (!r.ok) throw new Error('SSO not configured (BV backend missing)');
    const j = await r.json(); clientId = j.eve_client_id; return clientId;
  }
  function tokens() { try { return JSON.parse(localStorage.getItem('bv_esi_tokens') || 'null'); } catch { return null; } }
  function saveTokens(t) { try { localStorage.setItem('bv_esi_tokens', JSON.stringify(t)); } catch {} }
  function char_() { try { return JSON.parse(localStorage.getItem('bv_esi_char') || 'null'); } catch { return null; } }
  // The granted scopes live in the access token's `scp` claim — decode locally
  // (no network) so we can spot sessions created before a new scope was added.
  function tokenScopes() {
    try {
      const t = tokens();
      if (!t || !t.access_token) return [];
      const payload = JSON.parse(atob(t.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const scp = payload.scp || payload.scope || [];
      if (Array.isArray(scp)) return scp;
      return String(scp).split(/\s+/).filter(Boolean);
    } catch { return []; }
  }
  function expired(t) {
    // No timestamp (legacy sessions) counts as expired — the refresh below
    // will either renew it or fail cleanly into "sign in again".
    if (!t || !t.access_token) return true;
    if (!t.expires_at) return true;
    return Date.now() >= t.expires_at - REFRESH_SKEW_MS;
  }
  // Single-flight refresh: parallel api() calls share one backend request
  // (the token endpoint is rate-limited to 5/min).
  let refreshPromise = null;
  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const t = tokens();
      if (!t || !t.refresh_token) throw new Error('SSO session expired — sign in again');
      const r = await fetch(BASE + '/api/bv/token-exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: t.refresh_token })
      });
      if (!r.ok) {
        // Refresh rejected (e.g. revoked grant) — drop the dead session so the
        // UI falls back to "sign in" instead of 401-looping.
        try { localStorage.removeItem('bv_esi_tokens'); } catch {}
        throw new Error('SSO session expired — sign in again');
      }
      const j = await r.json();
      saveTokens({
        access_token: j.access_token,
        refresh_token: j.refresh_token || t.refresh_token,
        expires_at: Date.now() + (j.expires_in || 1200) * 1000
      });
      return tokens();
    })();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }
  async function doFetch(path, opts, accessToken) {
    const o = opts || {};
    return fetch('https://esi.evetech.net/latest' + path, { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + accessToken } });
  }
  window.BVAuth = {
    tokens, character: char_,
    signedIn() { return !!tokens(); },
    // Full granted scope list for the current session ([] when signed out).
    scopes() { return tokenScopes(); },
    hasScope(scope) { return tokenScopes().indexOf(scope) >= 0; },
    // Guaranteed-fresh access token for call sites that can't go through
    // api() (backend POSTs, oauth/verify). Proactively refreshes via the
    // shared single-flight refresh(); throws "SSO session expired" when
    // there is nothing to refresh with (caller prompts sign-in).
    async getAccessToken() {
      let t = tokens();
      if (!t || !t.access_token) throw new Error('SSO session expired — sign in again');
      if (expired(t)) t = await refresh();
      if (!t || !t.access_token) throw new Error('SSO session expired — sign in again');
      return t.access_token;
    },
    // Force a refresh regardless of expiry (used for one retry after a 401
    // from a backend call that already used a "fresh" token).
    async refreshToken() { return refresh(); },
    async login() {
      const cid = await getClientId();
      const state = Math.random().toString(36).slice(2);
      localStorage.setItem('bv_esi_state', state);
      const p = new URLSearchParams({ response_type: 'code', redirect_uri: REDIRECT, client_id: cid, scope: SCOPES.join(' '), state });
      location.href = 'https://login.eveonline.com/v2/oauth/authorize?' + p.toString();
    },
    logout() { localStorage.removeItem('bv_esi_tokens'); localStorage.removeItem('bv_esi_char'); location.reload(); },
    async apiRaw(path, opts) {
      let t = tokens(); if (!t) throw new Error('Not signed in');
      // Proactive: never send a token we already know is dead.
      if (expired(t)) t = await refresh();
      let r = await doFetch(path, opts, t.access_token);
      if (r.status === 401) {
        // Reactive: token died mid-session — one refresh + one retry.
        t = await refresh();
        r = await doFetch(path, opts, t.access_token);
      }
      if (!r.ok) {
        const err = new Error('ESI ' + r.status + ' ' + path);
        // Surface X-Pages on failures too (a 404 past the last page still
        // carries the true page count — the asset pager depends on this).
        try { err.pages = parseInt(r.headers.get('X-Pages') || '', 10) || null; } catch { err.pages = null; }
        throw err;
      }
      let pages = null;
      try { pages = parseInt(r.headers.get('X-Pages') || '', 10) || null; } catch {}
      const data = await r.json();
      return { data, pages };
    },
    async api(path, opts) {
      return (await this.apiRaw(path, opts)).data;
    }
  };
  // Silent keep-alive: while signed in and the tab is visible, renew the
  // token shortly before it dies so long build sessions never hit the
  // 20-minute cliff. Failures are silent — a revoked grant simply surfaces
  // as "sign in again" on the next action.
  const KEEPALIVE_MS = 14 * 60 * 1000;
  async function keepAlive() {
    try {
      if (typeof document !== 'undefined' && document.hidden) return;
      const t = tokens();
      if (!t || !t.access_token || !t.refresh_token) return;
      if (expired(t)) await refresh();
    } catch {}
  }
  try {
    setInterval(keepAlive, KEEPALIVE_MS);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAlive(); });
      if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('focus', keepAlive);
    }
  } catch {}
})();
