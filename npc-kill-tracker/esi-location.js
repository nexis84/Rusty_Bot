/* ============================================================================
 * Optional EVE SSO for Rusty NPC Tracker — authorization code + PKCE.
 *
 * Only scopes:
 *   esi-location.read_location.v1
 *   esi-location.read_ship_type.v1
 *   esi-location.read_online.v1
 *
 * Only API calls:
 *   GET /characters/{id}/location/
 *   GET /characters/{id}/ship/
 *   GET /characters/{id}/online/
 *
 * The tracker is a public client: no secret is shipped. EVE's token endpoint
 * supports CORS, so the code exchange happens in the browser.
 * ==========================================================================*/
window.RNPC_ESI = (() => {
    'use strict';

    const cfg = window.RNPC_ESI_CONFIG || {};
    const CLIENT_ID = String(cfg.clientId || '').trim();
    const CONFIGURED = !!CLIENT_ID && CLIENT_ID !== 'YOUR_CLIENT_ID';
    const SCOPES = [
        'esi-location.read_location.v1',
        'esi-location.read_ship_type.v1',
        'esi-location.read_online.v1',
    ];
    const PROD_CALLBACK = 'https://www.rustybot.co.uk/npc-kill-tracker/sso-callback.html';
    const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
    const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
    const ESI = 'https://esi.evetech.net/latest';
    const COMPAT_DATE = '2026-08-18';
    const REFRESH_SKEW_MS = 60000;

    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    const here = location.pathname.replace(/[^/]*$/, '');
    const REDIRECT = cfg.redirectUri || (isLocal
        ? `${location.origin}${here}sso-callback.html`
        : PROD_CALLBACK);

    const K = {
        tokens: 'rnpct_esi_tokens',
        char: 'rnpct_esi_char',
        pkce: 'rnpct_esi_pkce',
    };

    const read = (store, key) => {
        try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; }
    };
    const write = (store, key, value) => {
        try { store.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
    };
    const drop = (store, key) => {
        try { store.removeItem(key); } catch { /* ignore */ }
    };

    const tokens = () => read(localStorage, K.tokens);
    const character = () => read(localStorage, K.char);

    /* ------------------------------------------------------------ PKCE bits */

    const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
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

    function jwtPayload(token) {
        try {
            const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const bin = atob(part);
            const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            return null;
        }
    }

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
        if (!CONFIGURED) throw new Error('The NPC Tracker ESI app is not configured yet.');
        const verifier = random(32);
        const state = random(16);
        write(sessionStorage, K.pkce, { verifier, state, at: Date.now() });
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

    /** Runs on sso-callback.html: swap ?code for tokens, then return to the app. */
    async function handleCallback() {
        const q = new URLSearchParams(location.search);
        const code = q.get('code');
        const state = q.get('state');
        const err = q.get('error');
        if (err) return { ok: false, message: q.get('error_description') || err };
        if (!code) return { ok: false, message: 'No code returned.' };
        if (!CONFIGURED) return { ok: false, message: 'The NPC Tracker ESI app is not configured yet.' };

        const pkce = read(sessionStorage, K.pkce);
        if (!pkce || pkce.state !== state) {
            return { ok: false, message: 'State mismatch — start the sign-in again.' };
        }

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
                    if (!r.ok) {
                        if (r.status === 400 || r.status === 401) logout();
                        throw new Error(r.status === 400 || r.status === 401
                            ? 'session expired'
                            : `token refresh failed (HTTP ${r.status})`);
                    }
                    const tok = await r.json();
                    const next = {
                        access_token: tok.access_token,
                        refresh_token: tok.refresh_token || t.refresh_token,
                        expires_at: Date.now() + (tok.expires_in || 1200) * 1000,
                    };
                    write(localStorage, K.tokens, next);
                    return next;
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
        const r = await fetch(`${ESI}${path}`, {
            headers: {
                Authorization: `Bearer ${t.access_token}`,
                'X-Compatibility-Date': COMPAT_DATE,
                Accept: 'application/json',
            },
        });
        if (r.status === 401) { logout(); throw new Error('session expired'); }
        if (r.status === 420 || r.status === 429) {
            throw new Error('ESI rate limit — retrying shortly');
        }
        if (!r.ok) throw new Error(`ESI ${path} -> HTTP ${r.status}`);
        return r.json();
    }

    /** Current solar system (plus station_id / structure_id when docked). */
    async function getLocation() {
        const c = character();
        if (!c) throw new Error('not signed in');
        return esi(`/characters/${c.id}/location/?datasource=tranquility`);
    }

    /** Current ship: ship_type_id, ship_item_id, ship_name. */
    async function getShip() {
        const c = character();
        if (!c) throw new Error('not signed in');
        return esi(`/characters/${c.id}/ship/?datasource=tranquility`);
    }

    /** Online state + login statistics. */
    async function getOnline() {
        const c = character();
        if (!c) throw new Error('not signed in');
        return esi(`/characters/${c.id}/online/?datasource=tranquility`);
    }

    return {
        configured: CONFIGURED,
        CLIENT_ID,
        SCOPES,
        REDIRECT,
        COMPAT_DATE,
        login,
        logout,
        handleCallback,
        character,
        tokens,
        ensureFresh,
        getLocation,
        getShip,
        getOnline,
        portraitUrl: (id, size = 64) => `https://images.evetech.net/characters/${id}/portrait?size=${size}`,
    };
})();
