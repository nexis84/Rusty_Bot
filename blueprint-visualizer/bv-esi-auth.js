// Blueprint Visualizer SSO — blueprint + asset scopes. Graceful if backend not configured.
//
// Access tokens live ~20 min; the refresh token is used transparently so calls
// made an hour after login don't 401 (ESI 401s even public endpoints when handed
// an expired Bearer token).
(function () {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const BASE = isLocal ? 'http://localhost:8080' : 'https://api.rustybot.co.uk';
  const REDIRECT = isLocal ? 'http://localhost:8080/blueprint-visualizer/sso-callback.html' : 'https://www.rustybot.co.uk/blueprint-visualizer/sso-callback.html';
  const SCOPES = ['esi-characters.read_blueprints.v1', 'esi-corporations.read_blueprints.v1', 'esi-assets.read_assets.v1', 'esi-skills.read_skills.v1', 'esi-universe.read_structures.v1'];
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
  function expired(t) {
    return !t || !t.access_token || (t.expires_at && Date.now() >= t.expires_at - REFRESH_SKEW_MS);
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
    async login() {
      const cid = await getClientId();
      const state = Math.random().toString(36).slice(2);
      localStorage.setItem('bv_esi_state', state);
      const p = new URLSearchParams({ response_type: 'code', redirect_uri: REDIRECT, client_id: cid, scope: SCOPES.join(' '), state });
      location.href = 'https://login.eveonline.com/v2/oauth/authorize?' + p.toString();
    },
    logout() { localStorage.removeItem('bv_esi_tokens'); localStorage.removeItem('bv_esi_char'); location.reload(); },
    async api(path, opts) {
      let t = tokens(); if (!t) throw new Error('Not signed in');
      // Proactive: never send a token we already know is dead.
      if (expired(t)) t = await refresh();
      let r = await doFetch(path, opts, t.access_token);
      if (r.status === 401) {
        // Reactive: token died mid-session — one refresh + one retry.
        t = await refresh();
        r = await doFetch(path, opts, t.access_token);
      }
      if (!r.ok) throw new Error('ESI ' + r.status + ' ' + path);
      return r.json();
    }
  };
})();
