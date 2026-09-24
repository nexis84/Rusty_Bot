// Blueprint Visualizer SSO — blueprint + asset scopes. Graceful if backend not configured.
//
// Access tokens live ~20 min; the refresh token is used transparently so calls
// made an hour after login don't 401 (ESI 401s even public endpoints when handed
// an expired Bearer token).
(function () {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const BASE = isLocal ? 'http://localhost:8080' : 'https://api.rustybot.co.uk';
  const REDIRECT = isLocal ? 'http://localhost:8080/blueprint-visualizer/sso-callback.html' : 'https://www.rustybot.co.uk/blueprint-visualizer/sso-callback.html';
  const SCOPES = ['esi-characters.read_blueprints.v1', 'esi-corporations.read_blueprints.v1', 'esi-assets.read_assets.v1', 'esi-assets.read_corporation_assets.v1', 'esi-skills.read_skills.v1', 'esi-universe.read_structures.v1', 'esi-corporations.read_structures.v1'];
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
  function bvSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  // EVE daily downtime: Tranquility goes down ~12:00 UK for up to ~15 min and
  // ESI goes with it (5xx/timeouts on every endpoint). Retrying inside the
  // window is pointless — callers fail fast with a clear message instead.
  // Window 11:55–12:20 UK gives a buffer for pre/post flapping. Europe/London
  // keeps it correct across BST/GMT without hardcoding a UTC offset.
  function bvIsDailyDowntime(nowMs) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(nowMs == null ? Date.now() : nowMs));
      let h = 0, m = 0;
      for (const p of parts) {
        if (p.type === 'hour') h = (+p.value) % 24;
        else if (p.type === 'minute') m = +p.value;
      }
      const mins = h * 60 + m;
      return mins >= 11 * 60 + 55 && mins < 12 * 60 + 20;
    } catch {
      const d = new Date(nowMs == null ? Date.now() : nowMs);
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
      return mins >= 10 * 60 + 55 && mins < 11 * 60 + 20; // ≈ BST fallback
    }
  }
  function bvDowntimeError() {
    const err = new Error('EVE daily downtime (12:00–12:15 UK) — ESI is offline. Try again after downtime.');
    err.downtime = true;
    return err;
  }
  // Transient ESI gateway failures worth one more attempt. The assets endpoint
  // 504s routinely for asset-heavy characters — callers must not fail the
  // whole scan on the first one.
  function bvTransientStatus(s) {
    return s === 502 || s === 503 || s === 504 || s === 520 || s === 521 || s === 522 || s === 523 || s === 524;
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
    // True inside the daily downtime window (see bvIsDailyDowntime). UI code
    // checks this before starting scans so users get "downtime" instead of a
    // wall of 504 retries.
    isDowntime(nowMs) { return bvIsDailyDowntime(nowMs); },
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
      // Retry transient gateway errors (502/503/504 — the assets endpoint 504s
      // routinely) with exponential backoff + jitter before giving up.
      const MAX_TRANSIENT_RETRIES = 4;
      let r = null;
      let lastTransientStatus = 0;
      for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
        try {
          r = await doFetch(path, opts, t.access_token);
        } catch (netErr) {
          // Network-level failure (DNS/reset/abort) — retry like a 503,
          // unless Tranquility itself is down (fail fast, no retry storm).
          if (bvIsDailyDowntime()) throw bvDowntimeError();
          lastTransientStatus = 0;
          if (attempt >= MAX_TRANSIENT_RETRIES) throw new Error('ESI network error ' + path + ' — ' + (netErr && netErr.message ? netErr.message : netErr));
          await bvSleep(Math.min(10000, 800 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500));
          continue;
        }
        if (r.status === 401 && attempt === 0) {
          // Reactive: token died mid-session — one refresh + one retry.
          t = await refresh();
          r = await doFetch(path, opts, t.access_token);
        }
        if (r && bvTransientStatus(r.status)) {
          // Daily downtime: ESI 5xxes everything — don't burn retries.
          if (bvIsDailyDowntime()) throw bvDowntimeError();
          if (attempt < MAX_TRANSIENT_RETRIES) {
            lastTransientStatus = r.status;
            try { await r.text().catch(() => {}); } catch {}
            await bvSleep(Math.min(10000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 750));
            continue;
          }
        }
        break;
      }
      if (!r.ok) {
        let msg = 'ESI ' + r.status + ' ' + path;
        if (bvTransientStatus(r.status)) {
          msg += ' — ESI timed out serving this page. It usually succeeds on a rescan; wait ~30s and hit Scan again.';
        }
        const err = new Error(msg);
        err.status = r.status;
        err.transient = bvTransientStatus(r.status);
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
