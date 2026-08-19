// Express server for EVE SSO token exchange and static file serving

const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');
const { verifyJWT } = require('./jwt-verify');
const rateLimit = require('express-rate-limit');
const app = express();

app.disable('x-powered-by');

// Load ../.env for local development (no dotenv dependency).
// On Render the vars are injected by the platform, so .env is ignored there.
(function loadLocalEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) { /* ignore .env parse errors */ }
})();

// SSO state nonce store (5-minute TTL)
const pendingStates = new Map();
setInterval(() => {
  const cutoff = Date.now() - 300000;
  for (const [key, entry] of pendingStates) {
    if (entry.created < cutoff) pendingStates.delete(key);
  }
}, 120000).unref();

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict rate limiter for token exchange
const tokenExchangeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token exchange attempts, please try again later.' },
});

app.use(globalLimiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Mount Analytics API
const analyticsRouter = require('../RustyStats/analytics.js');
app.use('/api', analyticsRouter);

// Minimal config endpoint (used by the skillplanner for its EVE SSO client ID)
app.get('/api/config', (req, res) => {
    res.json({ eve_client_id: process.env.EVE_CLIENT_ID || null });
});

// PI Visualizer config endpoint — returns the PI app's EVE SSO client ID
app.get('/api/pi/config', (req, res) => {
    res.json({ eve_client_id: process.env.EVE_PI_CLIENT_ID || null });
});

// EVE SSO login endpoint — generates a state nonce for CSRF protection
app.get('/api/auth/eve/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { created: Date.now() });
  const clientId = process.env.EVE_CLIENT_ID || '';
  const frontendUrl = process.env.FRONTEND_URL || '';
  const baseUrl = frontendUrl || 'https://api.rustybot.co.uk';
  const redirectUri = baseUrl + '/api/auth/eve/callback';
  const url = 'https://login.eveonline.com/v2/oauth/authorize/?' + new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    client_id: clientId,
    scope: 'publicData',
    state,
  }).toString();
  res.json({ state, url });
});

// EVE SSO callback relay — EVE redirects here, we forward back to the homepage.
app.get('/api/auth/eve/callback', (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || '';
  const baseUrl = frontendUrl || (req.get('origin') || '');
  const targetPage = '/';
  const redirectTarget = (baseUrl || '') + targetPage;

  if (!code) {
    return res.redirect(redirectTarget + '?error=no_code');
  }

  if (state && pendingStates.has(state)) {
    pendingStates.delete(state);
  }

  res.redirect(redirectTarget + '?code=' + encodeURIComponent(code) + (state ? '&state=' + encodeURIComponent(state) : ''));
});

// Health check endpoint (before express.static to take priority)
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'RustyBot API', routes: 'mounted', env: process.env.NODE_ENV || 'not set' });
});

// Diagnostic: list registered routes (disabled in production)
app.get('/__routes', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    const routes = app._router.stack
        .filter(r => r.route)
        .map(r => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));
    res.json({ routes, dir: __dirname });
});

function fetchWithTimeout(url, options = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        fetch(url, { ...options, signal: controller.signal })
            .then(res => { clearTimeout(id); resolve(res); })
            .catch(e => { clearTimeout(id); reject(e); });
    });
}

// Token exchange endpoint
app.post('/api/token-exchange', tokenExchangeLimiter, async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ 
            error: 'Missing required parameter: code' 
        });
    }

    try {
        const clientId = process.env.EVE_CLIENT_ID;
        const clientSecret = process.env.EVE_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            console.error('Token exchange blocked: EVE_CLIENT_ID and EVE_CLIENT_SECRET must be set in environment');
            return res.status(500).json({ error: 'SSO not configured on server' });
        }

        // Exchange authorization code for access token
        const tokenResponse = await fetchWithTimeout('https://login.eveonline.com/v2/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    clientId + ':' + clientSecret
                ).toString('base64')
            },
            body: new URLSearchParams({
                'grant_type': 'authorization_code',
                'code': code
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}));
            console.error('Token exchange error:', errorData);
            return res.status(400).json({ 
                error: errorData.error_description || 'Token exchange failed' 
            });
        }

        const tokenData = await tokenResponse.json();

        // Verify the JWT signature against EVE's JWKS keys
        const decodedJWT = await verifyJWT(tokenData.access_token);
        
        if (!decodedJWT || !decodedJWT.sub) {
            return res.status(500).json({ error: 'Invalid access token' });
        }

        // Extract character ID from the subject (format: CHARACTER:EVE:12345678)
        const characterId = decodedJWT.sub.split(':').pop();
        console.log('Extracted character ID:', characterId);

        // Fetch character name from ESI (with timeout)
        let characterName = 'Unknown';
        try {
            const characterResponse = await fetchWithTimeout(
                `https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`
            );
            if (characterResponse.ok) {
                const characterData = await characterResponse.json();
                characterName = characterData.name;
                console.log('Fetched character name:', characterName);
            } else {
                console.error('Failed to fetch character name from ESI:', characterResponse.status);
            }
        } catch (e) {
            console.error('ESI character fetch failed:', e.message);
        }

        // Return token data to the client
        return res.status(200).json({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            character_id: characterId,
            character_name: characterName
        });

    } catch (error) {
        console.error('Server error during token exchange:', error);
        return res.status(500).json({ 
            error: 'Internal server error during token exchange' 
        });
    }
});

// PI Visualizer token exchange — uses the PI EVE SSO app credentials
app.post('/api/pi/token-exchange', tokenExchangeLimiter, async (req, res) => {
    const { code, refresh_token, grant_type } = req.body;

    if (grant_type === 'refresh_token') {
        if (!refresh_token) {
            return res.status(400).json({ error: 'Missing required parameter: refresh_token' });
        }
    } else if (!code) {
        return res.status(400).json({
            error: 'Missing required parameter: code'
        });
    }

    try {
        const clientId = process.env.EVE_PI_CLIENT_ID;
        const clientSecret = process.env.EVE_PI_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            console.error('PI token exchange blocked: EVE_PI_CLIENT_ID and EVE_PI_CLIENT_SECRET must be set in environment');
            return res.status(500).json({ error: 'PI SSO not configured on server' });
        }

        const bodyParams = grant_type === 'refresh_token'
            ? { 'grant_type': 'refresh_token', 'refresh_token': refresh_token }
            : { 'grant_type': 'authorization_code', 'code': code };

        const tokenResponse = await fetchWithTimeout('https://login.eveonline.com/v2/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    clientId + ':' + clientSecret
                ).toString('base64')
            },
            body: new URLSearchParams(bodyParams)
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}));
            console.error('PI token exchange error:', errorData);
            return res.status(400).json({
                error: errorData.error_description || 'Token exchange failed'
            });
        }

        const tokenData = await tokenResponse.json();

        const decodedJWT = await verifyJWT(tokenData.access_token);

        if (!decodedJWT || !decodedJWT.sub) {
            return res.status(500).json({ error: 'Invalid access token' });
        }

        const characterId = decodedJWT.sub.split(':').pop();

        let characterName = 'Unknown';
        try {
            const characterResponse = await fetchWithTimeout(
                `https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`
            );
            if (characterResponse.ok) {
                const characterData = await characterResponse.json();
                characterName = characterData.name;
            } else {
                console.error('Failed to fetch character name from ESI:', characterResponse.status);
            }
        } catch (e) {
            console.error('ESI character fetch failed:', e.message);
        }

        return res.status(200).json({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            character_id: characterId,
            character_name: characterName
        });

    } catch (error) {
        console.error('Server error during PI token exchange:', error);
        return res.status(500).json({
            error: 'Internal server error during PI token exchange'
        });
    }
});

// Static file serving (after routes for route priority)
app.use(express.static(__dirname + '/..'));

// Global error handler — prevents async route crashes from hanging the response
app.use((err, req, res, next) => {
    console.error('[Global Error]', err?.message || err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
    console.log(`RustyBot SSO API running on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
