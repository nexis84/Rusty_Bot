// PI Visualizer ESI OAuth2 Auth Module
// Adapted from skillplanner/esi-auth.js — requests planetary colony scope.
// Tokens stored under pi_esi_* keys so they don't clash with skillplanner sessions.

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const PI_REDIRECT_URI = isLocalhost
    ? 'http://localhost:8080/PI/sso-callback.html'
    : 'https://www.rustybot.co.uk/PI/sso-callback.html';

const PI_TOKEN_EXCHANGE_URL = isLocalhost
    ? 'http://localhost:8080/api/pi/token-exchange'
    : 'https://api.rustybot.co.uk/api/pi/token-exchange';

const PI_ESI_CONFIG = {
    redirectUri: PI_REDIRECT_URI,
    authorizeUrl: 'https://login.eveonline.com/v2/oauth/authorize',
    tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
    scopes: [
        'esi-planets.manage_planets.v1',
        'esi-location.read_location.v1'
    ]
};

let piSsoClientId = null;
let piClientIdPromise = null;

function loadClientId() {
    if (!piClientIdPromise) {
        piClientIdPromise = fetch(PI_TOKEN_EXCHANGE_URL.replace('/api/pi/token-exchange', '/api/pi/config'))
            .then(r => {
                if (!r.ok) throw new Error(`Config endpoint returned HTTP ${r.status}`);
                return r.json();
            })
            .then(cfg => { piSsoClientId = cfg.eve_client_id || null; })
            .catch(err => {
                piClientIdPromise = null;
                piSsoClientId = null;
                throw err;
            });
    }
    return piClientIdPromise;
}

class PIESIAuth {
    constructor() {
        this.tokens = this.loadTokens();
        this.currentCharacter = this.loadCurrentCharacter();
        this.refreshPromises = {};
    }

    generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode.apply(null, array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    async initiateLogin() {
        try {
            await loadClientId();
        } catch (err) {
            throw new Error('Failed to load EVE SSO client config - is the API reachable?');
        }

        if (!piSsoClientId) {
            throw new Error('EVE SSO not configured - EVE_PI_CLIENT_ID is missing on the server');
        }

        const state = this.generateState();
        localStorage.setItem('pi_esi_state', state);

        const params = new URLSearchParams({
            response_type: 'code',
            redirect_uri: PI_ESI_CONFIG.redirectUri,
            client_id: piSsoClientId,
            scope: PI_ESI_CONFIG.scopes.join(' '),
            state: state
        });

        window.location.href = `${PI_ESI_CONFIG.authorizeUrl}?${params.toString()}`;
    }

    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) throw new Error(`ESI Error: ${error}`);
        if (!code) return false;

        const storedState = localStorage.getItem('pi_esi_state');
        const state = urlParams.get('state');
        if (state !== storedState) throw new Error('State mismatch - possible CSRF attack');
        localStorage.removeItem('pi_esi_state');

        const characterData = await this.exchangeCodeForTokens(code);
        window.history.replaceState({}, document.title, window.location.pathname);
        return characterData;
    }

    async exchangeCodeForTokens(code) {
        // Exchange through the server so the client secret stays server-side
        const response = await fetch(PI_TOKEN_EXCHANGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Token exchange failed: ${response.status}`);
        }

        const tokens = await response.json();

        const characterData = {
            characterId: String(tokens.character_id),
            characterName: tokens.character_name || 'Unknown',
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000)
        };

        this.saveCharacterToken(characterData);
        this.setCurrentCharacter(characterData.characterId);
        return characterData;
    }

    decodeJWT(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }

    async refreshToken(characterId) {
        // Single-flight: concurrent callers near expiry share one in-flight refresh.
        // (EVE SSO rotates refresh tokens, so two parallel refreshes would invalidate one.)
        if (this.refreshPromises[characterId]) {
            return this.refreshPromises[characterId];
        }

        const promise = this._doRefreshToken(characterId).finally(() => {
            delete this.refreshPromises[characterId];
        });
        this.refreshPromises[characterId] = promise;
        return promise;
    }

    async _doRefreshToken(characterId) {
        const tokens = this.tokens[characterId];
        if (!tokens || !tokens.refreshToken) throw new Error('No refresh token available');

        let response;
        try {
            response = await fetch(PI_TOKEN_EXCHANGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: tokens.refreshToken, grant_type: 'refresh_token' })
            });
        } catch (err) {
            // Network error - keep the tokens so the caller can retry when back online
            throw new Error('Token refresh failed - network error, please retry');
        }

        if (!response.ok) {
            // Only a definitive rejection invalidates the stored login; transient
            // server/network failures must not wipe the character.
            if (response.status === 400) {
                this.removeCharacter(characterId);
                throw new Error('Session expired - please login again');
            }
            throw new Error(`Token refresh failed (HTTP ${response.status}) - please retry`);
        }

        let newTokens;
        try {
            newTokens = await response.json();
        } catch (err) {
            throw new Error('Token refresh returned invalid data - please retry');
        }

        tokens.accessToken = newTokens.access_token;
        tokens.refreshToken = newTokens.refresh_token || tokens.refreshToken;
        tokens.expiresAt = Date.now() + (newTokens.expires_in * 1000);
        this.saveCharacterToken(tokens);
        return tokens.accessToken;
    }

    async getAccessToken(characterId = null) {
        const charId = characterId || this.currentCharacter;
        if (!charId) throw new Error('No character selected');

        const tokens = this.tokens[charId];
        if (!tokens) throw new Error('Character not authenticated');

        if (Date.now() >= tokens.expiresAt - 60000) {
            return await this.refreshToken(charId);
        }
        return tokens.accessToken;
    }

    saveCharacterToken(characterData) {
        this.tokens[characterData.characterId] = characterData;
        localStorage.setItem('pi_esi_tokens', JSON.stringify(this.tokens));
    }

    loadTokens() {
        try {
            const stored = localStorage.getItem('pi_esi_tokens');
            const parsed = stored ? JSON.parse(stored) : {};
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            console.warn('Corrupted PI token storage - resetting');
            try { localStorage.removeItem('pi_esi_tokens'); } catch (_) {}
            return {};
        }
    }

    setCurrentCharacter(characterId) {
        this.currentCharacter = characterId;
        localStorage.setItem('pi_esi_current_character', characterId);
    }

    loadCurrentCharacter() {
        return localStorage.getItem('pi_esi_current_character');
    }

    getCurrentCharacter() {
        return this.currentCharacter;
    }

    removeCharacter(characterId) {
        delete this.tokens[characterId];
        localStorage.setItem('pi_esi_tokens', JSON.stringify(this.tokens));

        if (this.currentCharacter === characterId) {
            const remainingChars = Object.keys(this.tokens);
            if (remainingChars.length > 0) {
                this.setCurrentCharacter(remainingChars[0]);
            } else {
                localStorage.removeItem('pi_esi_current_character');
                this.currentCharacter = null;
            }
        }
    }

    isAuthenticated() {
        return this.currentCharacter !== null && !!this.tokens[this.currentCharacter];
    }

    getCurrentCharacterName() {
        const charId = this.currentCharacter;
        return charId && this.tokens[charId] ? this.tokens[charId].characterName : null;
    }

    logout() {
        this.tokens = {};
        this.currentCharacter = null;
        localStorage.removeItem('pi_esi_tokens');
        localStorage.removeItem('pi_esi_current_character');
    }

    async esiFetch(endpoint, characterId = null, options = {}, attempt = 0) {
        const token = await this.getAccessToken(characterId);
        const url = endpoint.startsWith('http') ? endpoint : `https://esi.evetech.net/latest${endpoint}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401) {
                    // Cap the refresh-retry at one attempt so a persistently bad
                    // token can't loop forever.
                    if (attempt > 0) {
                        throw new Error('ESI authorization failed after token refresh');
                    }
                    await this.refreshToken(characterId || this.currentCharacter);
                    return this.esiFetch(endpoint, characterId, options, attempt + 1);
                }
                if ((response.status === 429 || response.status === 420) && attempt < 3) {
                    const retryAfterHeader = response.headers.get('Retry-After');
                    const retryAfterSeconds = parseInt(retryAfterHeader || '2', 10);
                    const delayMs = Math.max(1000, (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 2) * 1000);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    return this.esiFetch(endpoint, characterId, options, attempt + 1);
                }
                throw new Error(`ESI Error ${response.status}: ${await response.text()}`);
            }

            return response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error('ESI request timed out after 10 seconds');
            throw error;
        }
    }
}

const piEsiAuth = new PIESIAuth();
window.piEsiAuth = piEsiAuth;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PIESIAuth, piEsiAuth };
}