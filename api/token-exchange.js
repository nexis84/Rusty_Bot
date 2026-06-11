// Express server for EVE SSO token exchange and static file serving
// This keeps the client secret secure on the server and serves the killboard

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const WebSocket = require('ws');
const app = express();

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const AGENT = 'RustyBot-Killboard/1.0 (contact: rustybot@gmail.com)';

const killQueue = [];
const killMeta = new Map();
const consumedIds = new Set(); // kill IDs already consumed from killQueue
const enriching = new Set(); // kill IDs currently being enriched (prevents races)
const killPool = []; // Shared pool of recent kills (single source of truth)
const POOL_MAX = 500;
const POOL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
let lastKillId = 0;

// Server-side name/type/system cache so the client doesn't need ESI calls
const nameCache = new Map();
const typeCache = new Map();
const systemCache = new Map();

async function resolveNames(ids) {
    ids = [...new Set(ids.filter(id => id && id > 0 && !nameCache.has(id)))];
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 1000) {
        const batch = ids.slice(i, i + 1000);
        try {
            const r = await fetchWithTimeout('https://esi.evetech.net/latest/universe/names/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': AGENT },
                body: JSON.stringify(batch),
            });
            if (r.ok) {
                const data = await r.json();
                for (const item of data) nameCache.set(item.id, { name: item.name, category: item.category });
            }
        } catch (e) { console.warn('[resolveNames] Failed:', e.message); }
    }
}

async function resolveTypes(typeIds) {
    typeIds = [...new Set(typeIds.filter(id => id && id > 0 && !typeCache.has(id)))];
    if (!typeIds.length) return;
    const CONCURRENCY = 5;
    for (let i = 0; i < typeIds.length; i += CONCURRENCY) {
        const batch = typeIds.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async id => {
            try {
                const r = await fetchWithTimeout('https://esi.evetech.net/latest/universe/types/' + id + '/', {
                    headers: { 'User-Agent': AGENT }
                }, 5000);
                if (r.ok) {
                    const data = await r.json();
                    typeCache.set(id, { name: data.name });
                }
            } catch (e) { /* skip */ }
        }));
    }
}

async function resolveSystems(systemIds) {
    systemIds = [...new Set(systemIds.filter(id => id && id > 0 && !systemCache.has(id)))];
    if (!systemIds.length) return;
    for (let i = 0; i < systemIds.length; i += 1000) {
        const batch = systemIds.slice(i, i + 1000);
        try {
            const r = await fetchWithTimeout('https://esi.evetech.net/latest/universe/names/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': AGENT },
                body: JSON.stringify(batch),
            });
            if (r.ok) {
                const data = await r.json();
                for (const item of data) {
                    if (item.category === 'solar_system') {
                        systemCache.set(item.id, { name: item.name });
                    }
                }
            }
        } catch (e) { console.warn('[resolveSystems] Failed:', e.message); }
    }
    // Also fetch security status for unresolved
    const missing = systemIds.filter(id => id && !systemCache.has(id));
    if (missing.length) {
        for (const id of missing.slice(0, 20)) {
            try {
                const r = await fetchWithTimeout('https://esi.evetech.net/latest/universe/systems/' + id + '/', {
                    headers: { 'User-Agent': AGENT }
                }, 5000);
                if (r.ok) {
                    const data = await r.json();
                    systemCache.set(id, { name: data.name, security: data.security_status });
                }
            } catch (e) { /* skip */ }
        }
    }
}

async function enrichKillPoolEntry(entry) {
    const ids = { chars: new Set(), types: new Set(), systems: new Set() };
    const v = entry.victim;
    if (v) {
        if (v.character_id) ids.chars.add(v.character_id);
        if (v.corporation_id) ids.chars.add(v.corporation_id);
        if (v.alliance_id) ids.chars.add(v.alliance_id);
        if (v.ship_type_id) ids.types.add(v.ship_type_id);
        if (v.items) v.items.forEach(i => { if (i.item_type_id) ids.types.add(i.item_type_id); });
    }
    if (entry.attackers) entry.attackers.forEach(a => {
        if (a.character_id) ids.chars.add(a.character_id);
        if (a.corporation_id) ids.chars.add(a.corporation_id);
        if (a.ship_type_id) ids.types.add(a.ship_type_id);
        if (a.weapon_type_id) ids.types.add(a.weapon_type_id);
    });
    if (entry.solar_system_id) ids.systems.add(entry.solar_system_id);
    await Promise.all([
        resolveNames([...ids.chars]),
        resolveTypes([...ids.types]),
        resolveSystems([...ids.systems]),
    ]);
    entry._resolved = {
        names: Object.fromEntries([...ids.chars].filter(id => nameCache.has(id)).map(id => [id, nameCache.get(id)])),
        types: Object.fromEntries([...ids.types].filter(id => typeCache.has(id)).map(id => [id, typeCache.get(id)])),
        systems: Object.fromEntries([...ids.systems].filter(id => systemCache.has(id)).map(id => [id, systemCache.get(id)])),
    };
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// === Killboard: WebSocket + Kill Queue ===
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

function connectWs() {
    const ws = new WebSocket('wss://zkillboard.com/websocket/', {
        headers: { 'User-Agent': BROWSER_UA, 'Origin': 'https://zkillboard.com' }
    });

    ws.on('open', () => {
        console.log('[WS] Connected — subscribing to all:*');
        ws.send(JSON.stringify({ action: 'sub', channel: 'all:*' }));
    });

    ws.on('message', async data => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.action === 'littlekill' && msg.killID) {
                const id = msg.killID;
                if (!killMeta.has(id)) {
                    killMeta.set(id, {
                        killID: id,
                        character_id: msg.character_id || 0,
                        corporation_id: msg.corporation_id || 0,
                        alliance_id: msg.alliance_id || 0,
                        ship_type_id: msg.ship_type_id || 0,
                        solar_system_id: msg.solar_system_id || null,
                        totalValue: null,
                        hash: null,
                        _added: Date.now(),
                    });
                    enrichKill(id);
                }
            }
        } catch (e) { console.error('[WS] Failed to parse message:', e.message); }
    });

    ws.on('error', err => console.log('[WS] Error:', err.message));
    ws.on('close', () => {
        console.log('[WS] Disconnected — reconnecting in 5s');
        setTimeout(connectWs, 5000);
    });
}

async function enrichKill(id) {
    // Prevent concurrent enrichment of the same kill ID (startup race: WS + poller)
    if (enriching.has(id)) return;
    enriching.add(id);
    try {
        const r = await fetchWithTimeout('https://zkillboard.com/api/killID/' + id + '/', {
            headers: { 'User-Agent': BROWSER_UA }
        }, 10000);
        if (r.ok) {
            const data = await r.json();
            if (!Array.isArray(data) || !data[0]) return;
            const k = data[0];
            const meta = killMeta.get(id);
            if (!meta) return;
            meta.totalValue = k.zkb?.totalValue || 0;
            meta.fittedValue = k.zkb?.fittedValue || 0;
            meta.droppedValue = k.zkb?.droppedValue || 0;
            meta.destroyedValue = k.zkb?.destroyedValue || 0;
            meta.attackerCount = k.zkb?.attackerCount || 0;
            if (k.zkb?.hash) {
                meta.hash = k.zkb.hash;
                try {
                    const esiResp = await fetchWithTimeout(
                        'https://esi.evetech.net/latest/killmails/' + id + '/' + meta.hash + '/',
                        { headers: { 'User-Agent': AGENT } }, 10000
                    );
                    if (esiResp.ok) {
                        const esiData = await esiResp.json();
                        meta.solar_system_id = esiData.solar_system_id || null;
                        meta.victim = esiData.victim;
                        meta.attackers = esiData.attackers;
                        meta.killmail_time = esiData.killmail_time;
                    } else {
                        // Fall back to zKB victim data if ESI fails
                        if (!meta.victim && k.victim) {
                            meta.victim = k.victim;
                            meta.attackers = k.attackers;
                            meta.solar_system_id = meta.solar_system_id || k.solar_system_id;
                            meta.killmail_time = meta.killmail_time || k.killmail_time;
                        }
                    }
                } catch (e) {
                    console.warn('[enrichKill] ESI fetch failed for', id, e.message);
                    // Fall back to zKB victim data if ESI fails
                    if (!meta.victim && k.victim) {
                        meta.victim = k.victim;
                        meta.attackers = k.attackers;
                        meta.solar_system_id = meta.solar_system_id || k.solar_system_id;
                        meta.killmail_time = meta.killmail_time || k.killmail_time;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[enrichKill] zKB API fetch failed for', id, e.message);
    } finally {
        enriching.delete(id);
    }
    maybeEnqueue(id);
}

function maybeEnqueue(id) {
    const meta = killMeta.get(id);
    if (!meta) return;
    // Don't enqueue without zKB verification — prevents 0 ISK / no-hash entries in the pool
    if (!meta.hash) return;
    const existingIdx = killQueue.findIndex(k => k.killID === id);
    const entry = {
        killID: id,
        character_id: meta.character_id,
        corporation_id: meta.corporation_id,
        alliance_id: meta.alliance_id,
        ship_type_id: meta.ship_type_id,
        solar_system_id: meta.solar_system_id,
        victim: meta.victim || null,
        attackers: meta.attackers || null,
        killmail_time: meta.killmail_time || null,
        zkb: {
            hash: meta.hash || '',
            locationID: meta.solar_system_id,
            totalValue: meta.totalValue || 0,
            fittedValue: meta.fittedValue || 0,
            droppedValue: meta.droppedValue || 0,
            destroyedValue: meta.destroyedValue || 0,
            attackerCount: meta.attackerCount || 0,
        }
    };
    if (existingIdx !== -1) {
        killQueue[existingIdx] = entry;
    } else {
        killQueue.push(entry);
    }
    // Also update the shared killPool
    const poolIdx = killPool.findIndex(k => k.killID === id);
    if (poolIdx !== -1) {
        killPool[poolIdx] = entry;
    } else {
        killPool.push(entry);
        if (killPool.length > POOL_MAX) killPool.shift();
    }
}

async function pollZkbCache() {
    try {
        const r = await fetchWithTimeout('https://zkillboard.com/api/kills/', {
            headers: { 'User-Agent': BROWSER_UA }
        }, 15000);
        if (!r.ok) return;
        const data = await r.json();
        for (const k of data) {
            const id = k.killmail_id;
            if (!killMeta.has(id)) {
                // zKB API already returns victim/system data — use it immediately
                const victim = k.victim || {};
                const attackers = k.attackers || [];
                killMeta.set(id, {
                    killID: id,
                    character_id: victim.character_id || 0,
                    corporation_id: victim.corporation_id || 0,
                    alliance_id: victim.alliance_id || 0,
                    ship_type_id: victim.ship_type_id || 0,
                    solar_system_id: k.solar_system_id || null,
                    totalValue: k.zkb?.totalValue || 0,
                    hash: k.zkb?.hash || '',
                    victim: victim,
                    attackers: attackers,
                    killmail_time: k.killmail_time || null,
                    _added: Date.now(),
                });
                // Add to pool immediately if we have a hash (zKB verified), enrichKill updates with ESI later
                if (k.zkb?.hash) maybeEnqueue(id);
                enrichKill(id);
            } else if (!consumedIds.has(id)) {
                const meta = killMeta.get(id);
                if (!meta.hash && k.zkb?.hash) {
                    meta.hash = k.zkb.hash;
                    meta.totalValue = meta.totalValue || k.zkb.totalValue || 0;
                    maybeEnqueue(id);
                }
            }
        }
    } catch (e) { console.error('[pollZkbCache] Failed:', e.message); }
}

// === Killboard API routes ===
function mountKillboardApi(prefix) {
    app.get(new RegExp('^' + prefix + '/esi/universe/(.+)'), async (req, res) => {
        const esiPath = req.params[0];
        const targetUrl = 'https://esi.evetech.net/latest/universe/' + esiPath;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetchWithTimeout(targetUrl, { headers: { 'User-Agent': AGENT } });
                if (response.ok) {
                    const data = await response.json();
                    return res.json(data);
                }
                if (response.status === 429 && attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                return res.status(502).json({ error: 'ESI returned ' + response.status });
            } catch (error) {
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                return res.status(502).json({ error: error.message });
            }
        }
    });

    app.get(prefix + '/zkb/*', async (req, res) => {
        const zkbPath = req.params[0];
        const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
        const targetUrl = 'https://zkillboard.com/api/' + zkbPath + query;
        try {
            const response = await fetchWithTimeout(targetUrl, { headers: { 'User-Agent': BROWSER_UA } });
            const data = await response.json();
            res.json(data);
        } catch (error) {
            res.status(502).json({ error: 'zKillboard unreachable', message: error.message });
        }
    });

    app.get(prefix + '/esi/killmail/:id/:hash', async (req, res) => {
        const { id, hash } = req.params;
        const targetUrl = 'https://esi.evetech.net/latest/killmails/' + id + '/' + hash + '/';
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetchWithTimeout(targetUrl, { headers: { 'User-Agent': AGENT } });
                if (response.ok) {
                    const data = await response.json();
                    return res.json(data);
                }
                if (response.status === 429 && attempt < 2) {
                    console.log('[ESI Proxy] 429 for', id, 'retrying...');
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                console.error('[ESI Proxy]', response.status, 'for', id, '/', hash.substring(0, 8));
                return res.status(502).json({ error: 'ESI returned ' + response.status });
            } catch (error) {
                if (attempt < 2) {
                    console.log('[ESI Proxy] Error for', id, 'retrying:', error.message);
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                console.error('[ESI Proxy Error]', id, '/', hash.substring(0, 8), ':', error.message);
                return res.status(502).json({ error: error.message });
            }
        }
    });

    app.get(prefix + '/redisq', (req, res) => {
        const kill = killQueue.shift();
        if (kill) consumedIds.add(kill.killID);
        res.json({ package: kill || null });
    });

    // Shared recent kills pool — both browsers see the same list
    app.get(prefix + '/kills/recent', async (req, res) => {
        try {
            let cutoff = Date.now() - POOL_WINDOW_MS;
            if (req.query.since) {
                const sinceMin = parseInt(req.query.since, 10);
                if (sinceMin > 0) cutoff = Date.now() - sinceMin * 60 * 1000;
            }
            const minValue = req.query.minValue ? parseFloat(req.query.minValue) : 0;
            let recent = killPool.filter(k => {
                if (k.zkb?.totalValue < minValue) return false;
                if (!k.killmail_time) return true;
                return new Date(k.killmail_time).getTime() > cutoff;
            });
            // Batch-resolve names server-side so client needs no ESI calls
            await Promise.all(recent.map(k => enrichKillPoolEntry(k)));
            res.json(recent);
        } catch (e) {
            console.error('[kills/recent] Error:', e.message);
            res.status(500).json({ error: 'Internal error', message: e.message });
        }
    });

    // System autocomplete cache
    let systemsCache = null;
    let systemsLoading = false;
    let systemsQueue = [];

    app.get(prefix + '/autocomplete/systems', async (req, res) => {
        const query = (req.query.q || '').toLowerCase().trim();
        if (query.length < 2) return res.json([]);

        if (!systemsCache) {
            if (systemsLoading) {
                await new Promise(r => systemsQueue.push(r));
            } else {
                systemsLoading = true;
                try {
                    const idsResp = await fetchWithTimeout('https://esi.evetech.net/latest/universe/systems/', { headers: { 'User-Agent': AGENT } });
                    const ids = await idsResp.json();
                    const names = [];
                    for (let i = 0; i < ids.length; i += 1000) {
                        const batch = ids.slice(i, i + 1000);
                        const resp = await fetchWithTimeout('https://esi.evetech.net/latest/universe/names/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'User-Agent': AGENT },
                            body: JSON.stringify(batch),
                        });
                        const items = await resp.json();
                        names.push(...items.filter(x => x.category === 'solar_system'));
                        await new Promise(r => setTimeout(r, 250));
                    }
                    systemsCache = names;
                } catch (e) {
                    console.error('[autocomplete] Failed to load systems:', e.message);
                    return res.status(502).json({ error: 'Failed to load systems' });
                } finally {
                    systemsLoading = false;
                    systemsQueue.forEach(r => r());
                    systemsQueue = [];
                }
            }
        }

        const matches = systemsCache
            .filter(s => s.name && s.name.toLowerCase().includes(query))
            .slice(0, 10)
            .map(s => ({ id: s.id, name: s.name }));
        res.json(matches);
    });
}

mountKillboardApi('/api');
mountKillboardApi('/Killboard/api');

// Health check endpoint (before express.static to take priority)
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'RustyBot API', routes: 'mounted', env: process.env.NODE_ENV || 'not set' });
});

// Diagnostic: list registered routes
app.get('/__routes', (req, res) => {
    const routes = app._router.stack
        .filter(r => r.route)
        .map(r => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));
    res.json({ routes, dir: __dirname });
});

// Token exchange endpoint
app.post('/api/token-exchange', async (req, res) => {
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
        const tokenResponse = await fetch('https://login.eveonline.com/v2/oauth/token', {
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

        // Decode the JWT to get character info
        const decodedJWT = decodeJWT(tokenData.access_token);
        
        if (!decodedJWT || !decodedJWT.sub) {
            return res.status(500).json({ error: 'Invalid access token' });
        }

        // Extract character ID from the subject (format: CHARACTER:EVE:12345678)
        const characterId = decodedJWT.sub.split(':').pop();
        console.log('Extracted character ID:', characterId);

        // Fetch character name from ESI
        const characterResponse = await fetch(
            `https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`
        );
        
        let characterName = 'Unknown';
        if (characterResponse.ok) {
            const characterData = await characterResponse.json();
            characterName = characterData.name;
            console.log('Fetched character name:', characterName);
        } else {
            console.error('Failed to fetch character name from ESI:', characterResponse.status);
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

// Helper function to decode JWT
function decodeJWT(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('JWT decode error:', e);
        return null;
    }
}

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
app.listen(PORT, () => {
    console.log(`RustyBot SSO API running on port ${PORT}`);
    connectWs();
    pollZkbCache(); // seed pool immediately
    setInterval(pollZkbCache, 30000);
    // Clean old kills from pool every 5 minutes
    setInterval(() => {
        const cutoff = Date.now() - POOL_WINDOW_MS;
        // Clean killPool
        for (let i = killPool.length - 1; i >= 0; i--) {
            if (killPool[i].killmail_time && new Date(killPool[i].killmail_time).getTime() < cutoff) {
                killPool.splice(i, 1);
            }
        }
        // Clean killMeta, consumedIds, and enriching (entries no longer in pool/queue and older than 2h)
        const poolAndQueueIds = new Set([
            ...killPool.map(k => k.killID),
            ...killQueue.map(k => k.killID),
        ]);
        for (const [id, meta] of killMeta) {
            if (!poolAndQueueIds.has(id) && (Date.now() - (meta._added || 0)) > POOL_WINDOW_MS) {
                killMeta.delete(id);
                consumedIds.delete(id);
                enriching.delete(id);
            }
        }
    }, 300000);
});
