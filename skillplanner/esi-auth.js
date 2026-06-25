// ESI OAuth2 Authentication Module
// Uses server-side token exchange (like market) for security

// Determine redirect URI: use dynamic for localhost, hardcoded for production
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const REDIRECT_URI = isLocalhost
    ? 'http://localhost:8080/sso-callback.html'
    : 'https://www.rustybot.co.uk/skillplanner/sso-callback.html';

const TOKEN_EXCHANGE_URL = isLocalhost
    ? 'http://localhost:8080/api/token-exchange'
    : 'https://rusty-bot-api.onrender.com/api/token-exchange';

const ESI_CONFIG = {
    clientId: 'ac86bbdbb05e404b85c6eb1546ed06b1', // Rusty Skill Planner
    redirectUri: REDIRECT_URI,
    authorizeUrl: 'https://login.eveonline.com/v2/oauth/authorize',
    tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
    revokeUrl: 'https://login.eveonline.com/oauth/revoke',
    jwksUrl: 'https://login.eveonline.com/oauth/jwks',
    scopes: [
        'esi-skills.read_skills.v1',
        'esi-skills.read_skillqueue.v1',
        'esi-clones.read_implants.v1',
        'esi-clones.read_clones.v1'
    ]
};

class ESIAuth {
    constructor() {
        this.tokens = this.loadTokens();
        this.currentCharacter = this.loadCurrentCharacter();
    }

    // Generate random state parameter for CSRF protection
    generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode.apply(null, array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    // Initiate ESI login
    async initiateLogin() {
        const state = this.generateState();
        localStorage.setItem('esi_state', state);
        
        const params = new URLSearchParams({
            response_type: 'code',
            redirect_uri: ESI_CONFIG.redirectUri,
            client_id: ESI_CONFIG.clientId,
            scope: ESI_CONFIG.scopes.join(' '),
            state: state
        });
        
        const authUrl = `${ESI_CONFIG.authorizeUrl}?${params.toString()}`;
        window.location.href = authUrl;
    }

    // Handle OAuth callback (called from sso-callback.html)
    // Exchanges auth code for tokens directly with EVE SSO
    async exchangeCodeForTokens(code) {
        const response = await fetch(ESI_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: ESI_CONFIG.clientId
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token exchange failed: ${errorText}`);
        }
        
        const tokens = await response.json();
        
        // Decode JWT to get character info
        const characterInfo = this.decodeJWT(tokens.access_token);
        
        const characterData = {
            characterId: characterInfo.sub.split(':')[2],
            characterName: characterInfo.name,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000)
        };
        
        this.saveCharacterToken(characterData);
        this.setCurrentCharacter(characterData.characterId);
        
        return characterData;
    }

    // Decode JWT token
    decodeJWT(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }

    // Handle OAuth callback
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

        // Verify state
        const storedState = localStorage.getItem('esi_state');
        const state = urlParams.get('state');
        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack');
        }
        
        localStorage.removeItem('esi_state');
        
        // Exchange code for tokens
        const characterData = await this.exchangeCodeForTokens(code);
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        return characterData;
    }

    // Refresh access token
    async refreshToken(characterId) {
        const tokens = this.tokens[characterId];
        if (!tokens || !tokens.refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const response = await fetch(ESI_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Host': 'login.eveonline.com'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokens.refreshToken,
                client_id: ESI_CONFIG.clientId
            })
        });
        
        if (!response.ok) {
            // If refresh fails, remove the character
            this.removeCharacter(characterId);
            throw new Error('Token refresh failed - please login again');
        }
        
        const newTokens = await response.json();
        
        // Update stored tokens
        tokens.accessToken = newTokens.access_token;
        tokens.refreshToken = newTokens.refresh_token || tokens.refreshToken;
        tokens.expiresAt = Date.now() + (newTokens.expires_in * 1000);
        
        this.saveCharacterToken(tokens);
        
        return tokens.accessToken;
    }

    // Get valid access token (refresh if needed)
    async getAccessToken(characterId = null) {
        const charId = characterId || this.currentCharacter;
        if (!charId) {
            throw new Error('No character selected');
        }
        
        const tokens = this.tokens[charId];
        if (!tokens) {
            throw new Error('Character not authenticated');
        }
        
        // Check if token needs refresh (with 60s buffer)
        if (Date.now() >= tokens.expiresAt - 60000) {
            return await this.refreshToken(charId);
        }
        
        return tokens.accessToken;
    }

    // Save character token to localStorage
    saveCharacterToken(characterData) {
        this.tokens[characterData.characterId] = characterData;
        localStorage.setItem('esi_tokens', JSON.stringify(this.tokens));
    }

    // Load tokens from localStorage
    loadTokens() {
        const stored = localStorage.getItem('esi_tokens');
        return stored ? JSON.parse(stored) : {};
    }

    // Set current character
    setCurrentCharacter(characterId) {
        this.currentCharacter = characterId;
        localStorage.setItem('esi_current_character', characterId);
    }

    // Load current character from localStorage
    loadCurrentCharacter() {
        return localStorage.getItem('esi_current_character');
    }

    // Get current character ID
    getCurrentCharacter() {
        return this.currentCharacter;
    }

    // Remove character
    removeCharacter(characterId) {
        delete this.tokens[characterId];
        localStorage.setItem('esi_tokens', JSON.stringify(this.tokens));
        
        if (this.currentCharacter === characterId) {
            const remainingChars = Object.keys(this.tokens);
            if (remainingChars.length > 0) {
                this.setCurrentCharacter(remainingChars[0]);
            } else {
                localStorage.removeItem('esi_current_character');
                this.currentCharacter = null;
            }
        }
    }

    // Get all authenticated characters
    getAuthenticatedCharacters() {
        return Object.values(this.tokens);
    }

    // Check if authenticated
    isAuthenticated() {
        return this.currentCharacter !== null && this.tokens[this.currentCharacter];
    }

    // Logout
    logout(characterId = null) {
        const charId = characterId || this.currentCharacter;
        if (charId) {
            this.removeCharacter(charId);
        }
    }

    // Logout all
    logoutAll() {
        this.tokens = {};
        this.currentCharacter = null;
        localStorage.removeItem('esi_tokens');
        localStorage.removeItem('esi_current_character');
    }

    // ESI API helper with timeout
    async esiFetch(endpoint, characterId = null, options = {}, attempt = 0) {
        const token = await this.getAccessToken(characterId);
        
        const url = endpoint.startsWith('http') ? endpoint : `https://esi.evetech.net/latest${endpoint}`;
        
        // Add 10 second timeout to prevent hanging
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
                // Token expired, try refresh once
                await this.refreshToken(characterId || this.currentCharacter);
                return this.esiFetch(endpoint, characterId, options, attempt + 1);
            }

            // ESI frequently returns 429 during bursts; respect Retry-After and retry.
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
            if (error.name === 'AbortError') {
                throw new Error('ESI request timed out after 10 seconds');
            }
            throw error;
        }
    }
}

// Create global instance
const esiAuth = new ESIAuth();
window.esiAuth = esiAuth;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ESIAuth, esiAuth };
}
