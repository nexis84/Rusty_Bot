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

// CORS middleware — allow only configured origins.
// FRONTEND_URL (single) and/or CORS_ORIGINS (comma-separated) control the allowlist.
// If neither is set, falls back to localhost + the known production domains.
function allowedOrigins() {
    const fromEnv = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const base = [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://www.rustybot.co.uk',
        'https://rustybot.co.uk',
        'https://api.rustybot.co.uk',
    ];
    if (frontend) base.push(frontend);
    return base.concat(fromEnv);
}

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins().includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
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

// Diagnostic: list registered routes (enabled only when DEBUG_ROUTES=1)
app.get('/__routes', (req, res) => {
    if (process.env.DEBUG_ROUTES !== '1') {
        return res.status(404).json({ error: 'Not found' });
    }
    const routes = app._router.stack
        .filter(r => r.route)
        .map(r => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));
    res.json({ routes });
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

// ── Rusty Routes ───────────────────────────────────────────────
// Separate EVE SSO app credentials, kept isolated from the main app.
// Client ID / secret live in EVE_RR_CLIENT_ID / EVE_RR_CLIENT_SECRET.

// Rusty Routes login — returns the authorize URL with a fresh state nonce.
app.get('/api/auth/rr/login', (req, res) => {
    const clientId = process.env.EVE_RR_CLIENT_ID || '';
    const clientSecret = process.env.EVE_RR_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Rusty Routes SSO not configured on server' });
    }
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, { created: Date.now(), scope: 'rr' });
    // Callback URL must match what's registered in the EVE dev portal exactly.
    const callbackUrl = process.env.EVE_RR_CALLBACK_URL
        || 'https://www.rustybot.co.uk/Rusty%20Routes/auth-callback.html';
    const scope = [
        'publicData',
        'esi-ui.write_waypoint.v1',
    ].join(' ');
    const url = 'https://login.eveonline.com/v2/oauth/authorize/?' + new URLSearchParams({
        response_type: 'code',
        redirect_uri:  callbackUrl,
        client_id:     clientId,
        scope,
        state,
    }).toString();
    res.json({ state, url, callback: callbackUrl });
});

// Rusty Routes token exchange — swaps the auth code for an access token.
// Uses the Rusty Routes SSO app credentials (separate from main app).
app.post('/api/auth/rr/token-exchange', tokenExchangeLimiter, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing required parameter: code' });

    const clientId = process.env.EVE_RR_CLIENT_ID;
    const clientSecret = process.env.EVE_RR_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.error('RR token exchange blocked: EVE_RR_CLIENT_ID and EVE_RR_CLIENT_SECRET must be set');
        return res.status(500).json({ error: 'Rusty Routes SSO not configured on server' });
    }

    try {
        const tokenResponse = await fetchWithTimeout('https://login.eveonline.com/v2/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
            },
            body: new URLSearchParams({ grant_type: 'authorization_code', code }),
        });
        if (!tokenResponse.ok) {
            const errData = await tokenResponse.json().catch(() => ({}));
            console.error('RR token exchange error:', errData);
            return res.status(400).json({ error: errData.error_description || 'Token exchange failed' });
        }
        const tokenData = await tokenResponse.json();
        const decodedJWT = await verifyJWT(tokenData.access_token);
        if (!decodedJWT || !decodedJWT.sub) {
            return res.status(500).json({ error: 'Invalid access token' });
        }
        const characterId = decodedJWT.sub.split(':').pop();

        let characterName = 'Unknown';
        try {
            const r = await fetchWithTimeout(
                `https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`
            );
            if (r.ok) {
                const d = await r.json();
                characterName = d.name;
            }
        } catch (e) {
            console.error('RR ESI character fetch failed:', e.message);
        }

        return res.status(200).json({
            access_token:   tokenData.access_token,
            refresh_token:  tokenData.refresh_token,
            expires_in:     tokenData.expires_in,
            character_id:   characterId,
            character_name: characterName,
        });
    } catch (e) {
        console.error('Server error during RR token exchange:', e);
        return res.status(500).json({ error: 'Internal server error during Rusty Routes token exchange' });
    }
});

// Rusty Routes waypoint push — loops POST /ui/autopilot/waypoint on the server
// so the access token is not held longer than necessary in browser code.
const waypointPushLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many push attempts, please slow down.' },
});

app.post('/api/waypoints/push', waypointPushLimiter, async (req, res) => {
    const { access_token, character_id, systems, clear_first } = req.body || {};
    if (!access_token) return res.status(400).json({ error: 'Missing access_token' });
    if (!Array.isArray(systems) || !systems.length) {
        return res.status(400).json({ error: 'systems must be a non-empty array of system ids' });
    }
    if (systems.length > 50) {
        return res.status(400).json({ error: 'Too many waypoints in a single push (max 50)' });
    }

    let pushed = 0;
    for (let i = 0; i < systems.length; i++) {
        const sysId = systems[i];
        const url =
            `https://esi.evetech.net/latest/ui/autopilot/waypoint/?` +
            new URLSearchParams({
                add_to_beginning:     'false',
                clear_other_waypoints: i === 0 && clear_first ? 'true' : 'false',
                destination_id:       String(sysId),
            }).toString();
        try {
            const r = await fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + access_token,
                    'X-Compatibility-Date': '2020-01-01',
                    'User-Agent':   'RustyBot-RustyRoutes/1.0',
                },
            });
            if (!r.ok) {
                const txt = await r.text().catch(() => '');
                return res.status(502).json({
                    error: `ESI ${r.status} on system ${sysId}: ${txt || 'waypoint push failed'}`,
                    failedAt: i,
                    pushed,
                });
            }
            pushed++;
        } catch (e) {
            return res.status(502).json({
                error: `Network error on system ${sysId}: ${e.message}`,
                failedAt: i,
                pushed,
            });
        }
        // Small delay between calls to be friendlier to the client
        if (i < systems.length - 1) {
            await new Promise(r => setTimeout(r, 150));
        }
    }
    return res.json({ ok: true, pushed });
});

// Permissions-Policy + access gate for the Rusty Routes folder.
// When RR_ACCESS_KEY is set, the planner (and its assets) require the key via
// ?access=<key> or a cookie rr_access=<key>. The SSO callback is exempt so the
// EVE login round-trip still works. No key set = open (dev default off).
function getCookie(req, name) {
    const c = req.headers.cookie || '';
    const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
}

app.use((req, res, next) => {
    const decoded = decodeURIComponent(req.path || '');
    if (!(decoded.startsWith('/Rusty Routes/') || decoded === '/Rusty Routes')) {
        return next();
    }
    res.setHeader('Permissions-Policy', 'clipboard-read=self');

    const isHtml = decoded.endsWith('.html');
    const isCallback = decoded.endsWith('auth-callback.html');
    const key = process.env.RR_ACCESS_KEY;
    if (key && isHtml && !isCallback) {
        const provided = req.query.access || getCookie(req, 'rr_access') || '';
        if (provided !== key) {
            res.status(403).send(
                '<!doctype html><meta charset="utf-8">' +
                '<title>Access denied</title>' +
                '<body style="font-family:sans-serif;background:#0d0d0d;color:#ddd;' +
                'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
                '<div style="text-align:center"><h1 style="color:#e8d900">Rusty Routes</h1>' +
                '<p>This preview is private. Add <code>?access=KEY</code> or set the access cookie.</p></div>' +
                '</body>'
            );
            return;
        }
    }
    next();
});

// Static file serving (after routes for route priority).
// Only whitelisted extensions are served; sensitive files are always blocked.
const STATIC_ROOT = path.join(__dirname, '..');
const SENSITIVE_SEGMENTS = new Set([
    '.env', '.env.local', '.env.development.local',
    'deploy_state.json', 'snapshot.json', 'config.json',
    'deploy.tar.gz', 'deploy_oracle.ps1', 'deploy_to_oracle.ps1', 'update_oracle.ps1',
    'keys', 'node_modules', 'sde', 'SDE', '__pycache__',
    'serve.js', 'serve.py', 'server.js', 'deploy_all.ps1',
]);
const SENSITIVE_EXTENSIONS = new Set(['.key', '.pem', '.crt', '.p12', '.pfx', '.log']);
const SAFE_STATIC_EXTENSIONS = new Set([
    '.html', '.htm', '.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.gif',
    '.webp', '.svg', '.ico', '.json', '.xml', '.txt', '.woff', '.woff2', '.ttf',
]);

function isSensitiveStaticPath(relPath) {
    const parts = relPath.split(/[\\/]+/).filter(Boolean);
    for (const part of parts) {
        if (SENSITIVE_SEGMENTS.has(part)) return true;
        if (part.startsWith('.')) return true;
    }
    const ext = path.extname(relPath).toLowerCase();
    return SENSITIVE_EXTENSIONS.has(ext);
}

app.use((req, res, next) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent(req.path || '/');
    } catch (e) {
        return res.status(400).end('Bad request');
    }
    const rel = path.relative(STATIC_ROOT, path.normalize(path.join(STATIC_ROOT, urlPath)));
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return res.status(403).end('Forbidden');
    }
    if (isSensitiveStaticPath(rel)) {
        return res.status(403).end('Forbidden');
    }
    // Only serve known safe static extensions (skip requests to files like source).
    const ext = path.extname(rel).toLowerCase();
    if (ext && !SAFE_STATIC_EXTENSIONS.has(ext)) {
        return res.status(403).end('Forbidden');
    }
    next();
});
app.use(express.static(STATIC_ROOT));

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
