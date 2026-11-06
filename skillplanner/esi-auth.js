// ESI OAuth2 Authentication Module
// EVE SSO is handled by the RustyBot API so the client secret never reaches
// the browser. The browser only receives short-lived access tokens and the
// refresh token returned by our own API.

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const API_BASE = isLocalhost
    ? `${window.location.origin}/api`
    : 'https://api.rustybot.co.uk/api';

const REQUIRED_SCOPES = [
    'esi-skills.read_skills.v1',
    'esi-skills.read_skillqueue.v1',
    'esi-clones.read_implants.v1',
    'esi-clones.read_clones.v1'
];

// In Game Fits (Personal) needs this, but the rest of the planner should remain usable if
// EVE does not grant it. Users can re-login from the In Game Fits view.
const FITTINGS_SCOPE = 'esi-fittings.read_fittings.v1';

// Optional: resolves names of player-owned structures the character can dock in.
const STRUCTURES_SCOPE = 'esi-universe.read_structures.v1';

class ESIAuth {
    constructor() {
        this.tokens = this.loadTokens();
        this.currentCharacter = this.loadCurrentCharacter();
        this.refreshPromises = {};
    }

    // Ask the API to build the EVE authorize URL. The API owns the state nonce
    // and validates it again when EVE redirects back to /api/auth/eve/callback.
    async initiateLogin() {
        const callbackPage = `${window.location.origin}/skillplanner/sso-callback.html`;
        const loginUrl = new URL(`${API_BASE}/auth/eve/login`);
        loginUrl.searchParams.set('redirect', 'skillplanner');
        loginUrl.searchParams.set('return', callbackPage);

        const response = await fetch(loginUrl.toString(), {
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.url) {
            throw new Error(data.error || `Could not start EVE login (HTTP ${response.status})`);
        }

        if (data.state) {
            localStorage.setItem('esi_state', data.state);
        }
        try {
            localStorage.setItem('esi_return_to', window.location.hash || window.location.search || '');
        } catch (_) { /* storage may be unavailable */ }

        window.location.href = data.url;
    }

    // Exchange an authorization code for tokens through the API.
    async exchangeCodeForTokens(code) {
        const response = await fetch(`${API_BASE}/sp/token-exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.access_token) {
            throw new Error(data.error || `Token exchange failed (HTTP ${response.status})`);
        }

        return this.saveAuthResult(data);
    }

    // Save the API token response in the shape the rest of the planner uses.
    saveAuthResult(data) {
        const characterId = data.character_id == null ? '' : String(data.character_id);
        if (!characterId) {
            throw new Error('The API did not return a character ID');
        }

        const scopes = (Array.isArray(data.scopes) ? data.scopes : [])
            .flatMap(scope => String(scope).split(/\s+/))
            .filter(Boolean);
        const characterData = {
            characterId,
            characterName: data.character_name || 'Unknown',
            accessToken: data.access_token,
            refreshToken: data.refresh_token || null,
            expiresAt: Date.now() + ((data.expires_in || 1200) * 1000),
            scopes
        };

        this.saveCharacterToken(characterData);
        this.setCurrentCharacter(characterId);

        return characterData;
    }

    // Fallback handler for a code that lands on the planner page directly.
    // The normal flow uses sso-callback.html.
    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            throw new Error(`ESI Error: ${error}`);
        }
        if (!code) {
            return false;
        }

        const storedState = localStorage.getItem('esi_state');
        const state = urlParams.get('state');
        if (state !== storedState) {
            throw new Error('State mismatch - please start the sign-in again');
        }

        localStorage.removeItem('esi_state');
        const characterData = await this.exchangeCodeForTokens(code);
        window.history.replaceState({}, document.title, window.location.pathname);
        return characterData;
    }

    // Refresh an access token through the API. A refresh response may contain a
    // rotated refresh token, so always keep the newest one.
    async refreshToken(characterId) {
        const charId = characterId || this.currentCharacter;
        if (!charId) {
            throw new Error('No character selected');
        }
        if (this.refreshPromises[charId]) {
            return this.refreshPromises[charId];
        }

        const tokens = this.tokens[charId];
        if (!tokens || !tokens.refreshToken) {
            throw new Error('No refresh token available - please sign in again');
        }

        this.refreshPromises[charId] = (async () => {
            try {
                const response = await fetch(`${API_BASE}/sp/token-exchange`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        grant_type: 'refresh_token',
                        refresh_token: tokens.refreshToken
                    })
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok || !data.access_token) {
                    this.removeCharacter(charId);
                    throw new Error(data.error || 'SSO session expired - please sign in again');
                }

                tokens.accessToken = data.access_token;
                tokens.refreshToken = data.refresh_token || tokens.refreshToken;
                tokens.expiresAt = Date.now() + ((data.expires_in || 1200) * 1000);
                if (Array.isArray(data.scopes) && data.scopes.length) {
                    tokens.scopes = data.scopes;
                }
                this.saveCharacterToken(tokens);

                return tokens.accessToken;
            } finally {
                delete this.refreshPromises[charId];
            }
        })();

        return this.refreshPromises[charId];
    }

    // Get a valid access token, refreshing first if it is about to expire.
    async getAccessToken(characterId = null) {
        const charId = characterId || this.currentCharacter;
        if (!charId) {
            throw new Error('No character selected');
        }

        const tokens = this.tokens[charId];
        if (!tokens) {
            throw new Error('Character not authenticated');
        }

        if (Date.now() >= tokens.expiresAt - 60000) {
            return await this.refreshToken(charId);
        }

        return tokens.accessToken;
    }

    // Check that a stored session has the scopes this planner actually needs.
    hasRequiredScopes(characterId = null) {
        const charId = characterId || this.currentCharacter;
        const tokens = charId ? this.tokens[charId] : null;
        if (!tokens || !Array.isArray(tokens.scopes)) return false;
        return REQUIRED_SCOPES.every(scope => tokens.scopes.includes(scope));
    }

    hasFittingsScope(characterId = null) {
        const charId = characterId || this.currentCharacter;
        const tokens = charId ? this.tokens[charId] : null;
        return Boolean(tokens && Array.isArray(tokens.scopes) && tokens.scopes.includes(FITTINGS_SCOPE));
    }

    hasStructuresScope(characterId = null) {
        const charId = characterId || this.currentCharacter;
        const tokens = charId ? this.tokens[charId] : null;
        return Boolean(tokens && Array.isArray(tokens.scopes) && tokens.scopes.includes(STRUCTURES_SCOPE));
    }

    saveCharacterToken(characterData) {
        this.tokens[characterData.characterId] = characterData;
        localStorage.setItem('esi_tokens', JSON.stringify(this.tokens));
    }

    loadTokens() {
        try {
            const stored = localStorage.getItem('esi_tokens');
            const parsed = stored ? JSON.parse(stored) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    setCurrentCharacter(characterId) {
        this.currentCharacter = characterId || null;
        if (this.currentCharacter) {
            localStorage.setItem('esi_current_character', this.currentCharacter);
        } else {
            localStorage.removeItem('esi_current_character');
        }
    }

    loadCurrentCharacter() {
        return localStorage.getItem('esi_current_character');
    }

    getCurrentCharacter() {
        return this.currentCharacter;
    }

    removeCharacter(characterId) {
        delete this.tokens[characterId];
        localStorage.setItem('esi_tokens', JSON.stringify(this.tokens));

        if (this.currentCharacter === characterId) {
            const remainingChars = Object.keys(this.tokens);
            if (remainingChars.length > 0) {
                this.setCurrentCharacter(remainingChars[0]);
            } else {
                this.setCurrentCharacter(null);
            }
        }
    }

    getAuthenticatedCharacters() {
        return Object.values(this.tokens);
    }

    isAuthenticated() {
        return Boolean(this.currentCharacter && this.tokens[this.currentCharacter]);
    }

    logout(characterId = null) {
        const charId = characterId || this.currentCharacter;
        if (charId) {
            this.removeCharacter(charId);
        }
    }

    logoutAll() {
        this.tokens = {};
        this.currentCharacter = null;
        this.refreshPromises = {};
        localStorage.removeItem('esi_tokens');
        localStorage.removeItem('esi_current_character');
        localStorage.removeItem('esi_state');
    }

    // ESI API helper with timeout, one refresh retry on 401, and 429 backoff.
    async esiFetch(endpoint, characterId = null, options = {}, attempt = 0) {
        const charId = characterId || this.currentCharacter;
        const token = await this.getAccessToken(charId);
        const url = endpoint.startsWith('http') ? endpoint : `https://esi.evetech.net/latest${endpoint}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

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
                if (response.status === 401 && attempt < 1) {
                    await this.refreshToken(charId);
                    return this.esiFetch(endpoint, charId, options, attempt + 1);
                }

                if ((response.status === 429 || response.status === 420) && attempt < 3) {
                    const retryAfterHeader = response.headers.get('Retry-After');
                    const retryAfterSeconds = parseInt(retryAfterHeader || '2', 10);
                    const delayMs = Math.max(1000, (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 2) * 1000);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    return this.esiFetch(endpoint, charId, options, attempt + 1);
                }

                throw new Error(`ESI Error ${response.status}: ${await response.text()}`);
            }

            return response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                const isGet = !options.method || String(options.method).toUpperCase() === 'GET';
                if (isGet && attempt < 1) {
                    return this.esiFetch(endpoint, charId, options, attempt + 1);
                }
                throw new Error('ESI request timed out after 12 seconds. ESI may be busy - try Refresh.');
            }
            throw error;
        }
    }
}

// Create global instance
const esiAuth = new ESIAuth();
window.esiAuth = esiAuth;
window.SKILLPLANNER_API_BASE = API_BASE;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ESIAuth, esiAuth, REQUIRED_SCOPES, FITTINGS_SCOPE, STRUCTURES_SCOPE, API_BASE };
}
