// ESI OAuth2 Authentication Module with PKCE
// Handles secure authentication without backend server

const ESI_CONFIG = {
    clientId: 'ac86bbdbb05e404b85c6eb1546ed06b1', // Rusty Skill Planner
    redirectUri: 'https://www.rustybot.co.uk/skillplanner/index.html',
    authorizeUrl: 'https://login.eveonline.com/v2/oauth/authorize',
    tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
    revokeUrl: 'https://login.eveonline.com/v2/oauth/revoke',
    jwksUrl: 'https://login.eveonline.com/oauth/jwks',
    scopes: [
        'esi-skills.read_skills.v1',
        'esi-skills.read_skillqueue.v1'
    ]
};

class ESIAuth {
    constructor() {
        this.tokens = this.loadTokens();
        this.currentCharacter = this.loadCurrentCharacter();
    }

    // Generate PKCE code verifier and challenge
    async generatePKCE() {
        const verifier = this.generateRandomString(128);
        const challenge = await this.sha256Base64Url(verifier);
        return { verifier, challenge };
    }

    generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let text = '';
        for (let i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    // SHA256 hash and base64url encode
    async sha256Base64Url(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashBase64 = btoa(String.fromCharCode(...hashArray));
        return hashBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    // Initiate ESI login
    async initiateLogin() {
        const { verifier, challenge } = await this.generatePKCE();
        
        // Store verifier for later
        sessionStorage.setItem('esi_code_verifier', verifier);
        
        const state = this.generateRandomString(32);
        sessionStorage.setItem('esi_state', state);
        
        const params = new URLSearchParams({
            response_type: 'code',
            redirect_uri: ESI_CONFIG.redirectUri,
            client_id: ESI_CONFIG.clientId,
            scope: ESI_CONFIG.scopes.join(' '),
            state: state,
            code_challenge: challenge,
            code_challenge_method: 'S256'
        });
        
        window.location.href = `${ESI_CONFIG.authorizeUrl}?${params.toString()}`;
    }

    // Handle OAuth callback
    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        
        if (error) {
            throw new Error(`ESI Error: ${error}`);
        }
        
        if (!code) {
            return false; // Not a callback
        }
        
        // Verify state
        const storedState = sessionStorage.getItem('esi_state');
        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack');
        }
        
        // Exchange code for tokens
        const verifier = sessionStorage.getItem('esi_code_verifier');
        if (!verifier) {
            throw new Error('Code verifier not found');
        }
        
        const tokenResponse = await fetch(ESI_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Host': 'login.eveonline.com'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: ESI_CONFIG.clientId,
                code_verifier: verifier
            })
        });
        
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${errorText}`);
        }
        
        const tokens = await tokenResponse.json();
        
        // Decode JWT to get character info
        const characterInfo = this.decodeJWT(tokens.access_token);
        
        // Store tokens with character
        const characterData = {
            characterId: characterInfo.sub.split(':')[2],
            characterName: characterInfo.name,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000)
        };
        
        this.saveCharacterToken(characterData);
        this.setCurrentCharacter(characterData.characterId);
        
        // Clean up session storage
        sessionStorage.removeItem('esi_code_verifier');
        sessionStorage.removeItem('esi_state');
        
        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);
        
        return characterData;
    }

    // Decode JWT token (simple version)
    decodeJWT(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
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

    // ESI API helper
    async esiFetch(endpoint, characterId = null, options = {}) {
        const token = await this.getAccessToken(characterId);
        
        const url = endpoint.startsWith('http') ? endpoint : `https://esi.evetech.net/latest${endpoint}`;
        
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Token expired, try refresh once
                await this.refreshToken(characterId || this.currentCharacter);
                return this.esiFetch(endpoint, characterId, options);
            }
            throw new Error(`ESI Error ${response.status}: ${await response.text()}`);
        }
        
        return response.json();
    }
}

// Create global instance
const esiAuth = new ESIAuth();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ESIAuth, esiAuth };
}
