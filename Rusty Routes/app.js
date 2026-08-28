/* ── Rusty Routes ─────────────────────────────────────────────
 * Plan, save, and push EVE Online autopilot routes.
 * Storage: localStorage. Auth via existing /api/token-exchange.
 * Push via server proxy /api/waypoints/push.
 * ───────────────────────────────────────────────────────────── */

const ESI         = 'https://esi.evetech.net/latest';
const UA          = 'RustyBot-RustyRoutes/1.0';
const STORE_KEY   = 'rustyroutes:v1:routes';
const AUTH_KEY    = 'rustyroutes:v1:auth';
const PUSH_DELAY  = 150; // ms between waypoint POSTs

const COMPAT_DATE = '2025-09-30'; // matches /route/ compat in ESI ref
const FLAG_BY_PREF = { shortest: 'shortest', secure: 'secure', insecure: 'insecure' };

const state = {
    auth:  null,   // { access_token, refresh_token, character_id, character_name, expires_at }
    current: null, // last planned route (for save)
    saved:   [],   // loaded from localStorage
};

// ── ESI helpers ────────────────────────────────────────────────

async function esiPost(path, body) {
    const r = await fetch(`${ESI}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`ESI ${r.status} POST ${path}`);
    return r.json();
}

async function esiGet(path) {
    const r = await fetch(`${ESI}${path}`, {
        headers: { 'User-Agent': UA, 'X-Compatibility-Date': COMPAT_DATE },
    });
    if (!r.ok) throw new Error(`ESI ${r.status} GET ${path}`);
    return r.json();
}

// ── Name / ID resolution ──────────────────────────────────────

const nameCache = new Map(); // lowercased name → id
const idCache   = new Map(); // id → { id, name, sec }

async function resolveNames(names) {
    const out = [];
    const missing = [];
    // Map: lowered input name -> stripped retry name (if station tag was removed)
    const retry = new Map();

    for (const n of names) {
        const key = (n || '').toLowerCase().trim();
        if (!key) continue;
        if (nameCache.has(key)) {
            out.push({ input: n, id: nameCache.get(key) });
        } else {
            missing.push(n);
            const stripped = stripStationTag(n);
            if (stripped && stripped.toLowerCase() !== key) {
                retry.set(key, stripped);
            }
        }
    }

    if (missing.length) {
        const data = await esiPost('/universe/ids/', missing);
        for (const item of (data?.systems || [])) {
            nameCache.set(item.name.toLowerCase(), item.id);
        }
        for (const orig of missing) {
            const k = orig.toLowerCase();
            // Direct match in this response
            const direct = (data?.systems || []).find(s => s.name.toLowerCase() === k);
            if (direct) { out.push({ input: orig, id: direct.id }); continue; }
        }
    }

    // Second pass: anything still unresolved gets retried as the stripped name.
    // We send ONLY the stripped names (deduped) to ESI so the response actually
    // contains a matching system entry (Amarr VIII as a character alone won't
    // help us find the Amarr system).
    const stillMissing = missing.filter(orig => {
        const k = orig.toLowerCase();
        return !out.find(o => o.input === orig) && retry.has(k);
    });
    if (stillMissing.length) {
        const strippedList = [...new Set(stillMissing.map(o => retry.get(o.toLowerCase())))];
        try {
            const data2 = await esiPost('/universe/ids/', strippedList);
            for (const item of (data2?.systems || [])) {
                nameCache.set(item.name.toLowerCase(), item.id);
            }
            for (const orig of stillMissing) {
                const strippedName = retry.get(orig.toLowerCase());
                const match = (data2?.systems || []).find(s => s.name.toLowerCase() === strippedName.toLowerCase());
                if (match) {
                    out.push({ input: orig, id: match.id, resolvedAs: match.name });
                }
            }
        } catch (e) {
            // Ignore — fall through to the "could not resolve" report
        }
    }

    return out;
}

async function enrichSystems(ids) {
    const missing = ids.filter(id => !idCache.has(id));
    if (missing.length) {
        // /universe/names/ caps at 1000 per call
        const CHUNK = 1000;
        for (let i = 0; i < missing.length; i += CHUNK) {
            const slice = missing.slice(i, i + CHUNK);
            const data = await esiPost('/universe/names/', slice);
            for (const d of (data || [])) {
                idCache.set(d.id, { id: d.id, name: d.name, sec: null });
            }
        }
    }
    return ids.map(id => idCache.get(id)).filter(Boolean);
}

async function resolveSystemFull(name) {
    const key = (name || '').toLowerCase().trim();
    if (nameCache.has(key)) {
        const id = nameCache.get(key);
        return enrichSystems([id]).then(a => ({ id, name: a[0]?.name || name, sec: null }));
    }
    // Try direct first, then fall back to stripping a station tag (e.g. "Amarr VIII" -> "Amarr")
    // Send both candidates in one request so ESI returns both in systems[].
    const stripped = stripStationTag(name);
    const candidates = stripped && stripped.toLowerCase() !== key
        ? [name, stripped] : [name];

    const data = await esiPost('/universe/ids/', candidates);
    const systems = data?.systems || [];
    // Prefer the exact-name match; otherwise take the stripped match
    const exact = systems.find(s => s.name.toLowerCase() === key);
    const match = exact || systems[0];
    if (match) {
        nameCache.set(key, match.id);
        idCache.set(match.id, { id: match.id, name: match.name, sec: null });
        return { id: match.id, name: match.name, sec: null };
    }
    return null;
}

async function getSystemSec(id) {
    if (idCache.has(id) && idCache.get(id).sec !== null) {
        return idCache.get(id).sec;
    }
    try {
        const data = await esiGet(`/universe/systems/${id}/`);
        const sec = data?.security_status ?? 0;
        const cur = idCache.get(id) || { id, name: `#${id}`, sec: null };
        idCache.set(id, { ...cur, sec });
        return sec;
    } catch {
        return 0;
    }
}

// ── Route compute ─────────────────────────────────────────────

async function getRoute(originId, destId, flag) {
    const f = FLAG_BY_PREF[flag] || 'shortest';
    const url = `/route/${originId}/${destId}/?flag=${f}&datasource=tranquility`;
    return esiGet(url);
}

// ── Paste parser ──────────────────────────────────────────────
// Accepts: "Current location: X", "• Y", "1. Z (stuff) - Region/Constellation"
// Also tolerates: "A > B > C", "A, B, C", "A\nB\nC"

function parsePastedRoute(text) {
    if (!text) return { origin: null, dest: null, waypoints: [], raw: [] };
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let origin = null;
    let dest   = null;
    const waypoints = [];
    const raw = [];

    for (const line of lines) {
        // Current location: X
        const mCur = line.match(/^Current\s+location\s*[:\-]\s*(.+)$/i);
        if (mCur) {
            const name = cleanSystemName(mCur[1]);
            origin = name; raw.push(name); continue;
        }
        // Numbered destination: 1. Name (stuff) - Region / Constellation
        const mNum = line.match(/^\d+[\.\)]\s*(.+)$/);
        if (mNum) {
            const name = cleanSystemName(mNum[1]);
            dest = name; raw.push(name); continue;
        }
        // Bullet
        if (/^[•·\-\*]\s+/.test(line)) {
            const name = cleanSystemName(line.replace(/^[•·\-\*]\s+/, ''));
            if (name) { waypoints.push(name); raw.push(name); }
            continue;
        }
        // Arrow / comma chain
        if (/[>→,]/.test(line)) {
            for (const part of line.split(/[>→,]/)) {
                const name = cleanSystemName(part);
                if (name) raw.push(name);
            }
            continue;
        }
        // Bare system name on its own line
        const name = cleanSystemName(line);
        if (name) raw.push(name);
    }

    if (!origin && raw.length) origin = raw[0];
    if (!dest   && raw.length) dest   = raw[raw.length - 1];
    // Remove origin/dest from middle waypoint list
    const mid = raw.slice(1, -1);
    return { origin, dest, waypoints: mid, raw };
}

const ROMAN_RE = /^(I{1,3}|IV|V|VI{1,3}|IX|X|XI{1,3}|XIV|XV|XVI{1,3}|XIX|XX)$/i;

function cleanSystemName(s) {
    if (!s) return '';
    // Drop "(anything)" and " - Region / Constellation" tail
    let n = s.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    n = n.split(/\s+-\s+/)[0].trim();
    // Strip trailing slashes
    n = n.replace(/\s*\/.*$/, '').trim();
    return n;
}

// Strip a trailing Roman-numeral station tag (e.g. "Amarr VIII" -> "Amarr").
// Returns the original string unchanged if no tag found.
function stripStationTag(name) {
    if (!name) return name;
    const parts = name.split(/\s+/);
    if (parts.length >= 2 && ROMAN_RE.test(parts[parts.length - 1])) {
        return parts.slice(0, -1).join(' ');
    }
    return name;
}

// ── localStorage ──────────────────────────────────────────────

function loadSaved() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        state.saved = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(state.saved)) state.saved = [];
    } catch {
        state.saved = [];
    }
}

function persistSaved() {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state.saved));
    } catch (e) {
        console.error('localStorage write failed', e);
    }
}

// ── Auth ──────────────────────────────────────────────────────

function loadAuth() {
    try {
        const raw = sessionStorage.getItem(AUTH_KEY);
        state.auth = raw ? JSON.parse(raw) : null;
    } catch { state.auth = null; }
}

function saveAuth(auth) {
    state.auth = auth;
    if (auth) sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else      sessionStorage.removeItem(AUTH_KEY);
    renderAuth();
}

function isAuthed() {
    return !!state.auth?.access_token;
}

function renderAuth() {
    const el = document.getElementById('authState');
    if (isAuthed()) {
        el.className = 'auth-logged-in';
        el.innerHTML = `
            <i class="fa-solid fa-user-astronaut"></i>
            Logged in as <span class="char-name">${escapeHtml(state.auth.character_name || 'Pilot')}</span>
            <button class="logout" id="logoutBtn">Logout</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', () => saveAuth(null));
    } else {
        el.className = 'auth-logged-out';
        el.innerHTML = `
            <button id="loginBtn" class="btn btn-primary">
                <i class="fa-solid fa-right-to-bracket"></i> Log in with EVE
            </button>
            <span class="auth-hint">Required to save and push routes.</span>
        `;
        document.getElementById('loginBtn').addEventListener('click', startLogin);
    }
    updateSaveBtnState();
}

// API base: the static site (www) and the API (api.rustybot.co.uk) are separate
// services, so we must use an absolute URL (matching the existing SSO pages).
const RR_API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8080/api'
    : 'https://api.rustybot.co.uk/api';

async function startLogin() {
    // Use the dedicated Rusty Routes login endpoint. It returns the authorize
    // URL and a state nonce; we stow the state in sessionStorage so the
    // callback page (after the EVE redirect) can pick it up.
    try {
        const res = await fetch(`${RR_API}/auth/rr/login`);
        if (!res.ok) throw new Error(`Login endpoint returned ${res.status}`);
        const { state, url } = await res.json();
        if (state) sessionStorage.setItem('rustyroutes:v1:oauth_state', state);
        sessionStorage.setItem('rustyroutes:v1:return_to', window.location.pathname);
        window.location.href = url;
    } catch (e) {
        alert(`Could not start EVE login: ${e.message}`);
    }
}

// ── Render: route chain ───────────────────────────────────────

function secClass(sec) {
    if (sec == null) return 'null';
    if (sec >= 0.5)  return 'high';
    if (sec >  0.0)  return 'low';
    return 'null';
}

function renderChain(systems) {
    const chain = document.getElementById('routeChain');
    chain.innerHTML = '';
    if (!systems?.length) {
        chain.textContent = 'No systems to display.';
        return;
    }
    systems.forEach((sys, i) => {
        if (i > 0) {
            const a = document.createElement('span');
            a.className = 'chip-arrow';
            a.textContent = '›';
            chain.appendChild(a);
        }
        const c = document.createElement('span');
        c.className = `chip ${secClass(sys.sec)}`;
        c.title = sys.sec != null ? `Sec ${sys.sec.toFixed(2)}` : '';
        c.innerHTML = `<span class="sec-dot"></span>${escapeHtml(sys.name || `#${sys.id}`)}`;
        chain.appendChild(c);
    });
    document.getElementById('routeCount').textContent =
        `(${systems.length - 1} jumps)`;
    document.getElementById('resultSection').classList.remove('hidden');
}

// ── Render: saved routes ──────────────────────────────────────

function renderSaved() {
    const grid = document.getElementById('savedList');
    const empty = document.getElementById('savedEmpty');
    grid.innerHTML = '';
    if (!state.saved.length) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');
    for (const r of state.saved) {
        const card = document.createElement('div');
        card.className = 'saved-card';
        const tagHtml = r.tag
            ? `<span class="saved-tag">${escapeHtml(r.tag)}</span>` : '';
        card.innerHTML = `
            <div class="saved-name">${escapeHtml(r.name)}</div>
            <div class="saved-meta">
                <span>${(r.systems?.length || 0) - 1} jumps</span>
                <span>${escapeHtml(r.origin?.name || '?')} → ${escapeHtml(r.dest?.name || '?')}</span>
                ${tagHtml}
            </div>
            <div class="saved-actions">
                <button class="btn btn-sm btn-ghost" data-act="recall" data-id="${r.id}">
                    <i class="fa-solid fa-eye"></i> Recall
                </button>
                <button class="btn btn-sm btn-primary" data-act="push" data-id="${r.id}">
                    <i class="fa-solid fa-paper-plane"></i> Push to EVE
                </button>
                <button class="btn btn-sm btn-danger" data-act="delete" data-id="${r.id}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        grid.appendChild(card);
    }
    grid.querySelectorAll('button[data-act]').forEach(btn => {
        btn.addEventListener('click', () => handleSavedAction(btn.dataset.act, btn.dataset.id));
    });
}

function updateSaveBtnState() {
    const btn = document.getElementById('saveBtn');
    if (!btn) return;
    // Save only needs a planned route — it writes to localStorage, not the server.
    // The push button stays auth-gated because it needs the SSO token.
    const can = !!state.current;
    btn.disabled = !can;
    btn.title = !state.current ? 'Plan a route first' : '';
}

// ── Actions ───────────────────────────────────────────────────

async function doParseAndFill() {
    const text = document.getElementById('pasteBox').value;
    const parsed = parsePastedRoute(text);
    const status = document.getElementById('parseStatus');
    if (!parsed.raw.length) {
        status.className = 'parse-status err';
        status.textContent = 'No system names detected.';
        return;
    }
    status.className = 'parse-status';
    status.textContent = `Detected ${parsed.raw.length} systems — resolving IDs…`;
    try {
        // Resolve all names
        const resolved = await resolveNames(parsed.raw);
        if (resolved.length !== parsed.raw.length) {
            const missing = parsed.raw.filter(n => !resolved.find(r => r.input === n));
            status.className = 'parse-status err';
            status.textContent = `Could not resolve: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`;
            return;
        }
        // Fill From / To (show the actual system name, not the station tag)
        const originResolved = resolved.find(r => r.input === parsed.origin);
        const destResolved   = resolved.find(r => r.input === parsed.dest);
        const originDisplay  = originResolved?.resolvedAs || parsed.origin || '?';
        const destDisplay    = destResolved?.resolvedAs   || parsed.dest   || '?';
        if (parsed.origin) document.getElementById('origin').value      = originDisplay;
        if (parsed.dest)   document.getElementById('destination').value = destDisplay;
        status.className = 'parse-status ok';
        status.textContent =
            `Loaded ${parsed.raw.length} systems · From ${originDisplay} → ${destDisplay}`;

        // Auto-plan if both ends resolved
        if (parsed.origin && parsed.dest) doPlan();
    } catch (e) {
        status.className = 'parse-status err';
        status.textContent = `Resolve failed: ${e.message}`;
    }
}

async function doPasteFromClipboard() {
    const status = document.getElementById('parseStatus');
    if (!navigator.clipboard?.readText) {
        status.className = 'parse-status err';
        status.textContent = 'Clipboard read not supported in this browser — paste with Ctrl+V instead.';
        return;
    }
    try {
        const text = await navigator.clipboard.readText();
        if (!text?.trim()) {
            status.className = 'parse-status err';
            status.textContent = 'Clipboard is empty.';
            return;
        }
        document.getElementById('pasteBox').value = text;
        await doParseAndFill();
    } catch (e) {
        status.className = 'parse-status err';
        status.textContent = `Clipboard access denied — paste with Ctrl+V instead. (${e.message})`;
    }
}

async function doPlan() {
    const errBox  = document.getElementById('planError');
    errBox.classList.add('hidden');

    const fromRaw = document.getElementById('origin').value.trim();
    const toRaw   = document.getElementById('destination').value.trim();
    const pref    = document.getElementById('preference').value;
    const avoid   = document.getElementById('avoid').value
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (!fromRaw || !toRaw) {
        errBox.textContent = 'Both From and To are required.';
        errBox.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('planBtn');
    const txt = document.getElementById('planBtnText');
    const spn = document.getElementById('planSpinner');
    btn.disabled = true;
    txt.textContent = 'Planning…';
    spn.classList.remove('hidden');

    try {
        const [originFull, destFull] = await Promise.all([
            resolveSystemFull(fromRaw),
            resolveSystemFull(toRaw),
        ]);
        if (!originFull) throw new Error(`Could not resolve origin: ${fromRaw}`);
        if (!destFull)   throw new Error(`Could not resolve destination: ${toRaw}`);
        if (originFull.id === destFull.id) throw new Error('Origin and destination are the same system.');

        const ids = await getRoute(originFull.id, destFull.id, pref);

        // Filter avoided
        let filteredIds = ids;
        if (avoid.length) {
            const avoidSet = new Set();
            for (const name of avoid) {
                const r = await resolveSystemFull(name).catch(() => null);
                if (r) avoidSet.add(r.id);
            }
            filteredIds = ids.filter(id => !avoidSet.has(id));
        }

        // Enrich with names + sec
        const systems = await enrichSystems(filteredIds);
        // fetch sec in parallel (cheap, ~8 requests for 25 systems)
        await Promise.all(systems.map(s => getSystemSec(s.id)));

        // Refetch with updated sec
        const enriched = systems.map(s => ({ ...s, sec: idCache.get(s.id)?.sec ?? 0 }));
        state.current = {
            origin: enriched[0],
            dest:   enriched[enriched.length - 1],
            flag:   pref,
            systems: enriched,
            avoid,
        };
        renderChain(enriched);
        updateSaveBtnState();
    } catch (e) {
        errBox.textContent = e.message;
        errBox.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        txt.textContent = 'Plan Route';
        spn.classList.add('hidden');
    }
}

function doSave() {
    if (!state.current) return;
    const name = document.getElementById('saveName').value.trim();
    const tag  = document.getElementById('saveTag').value.trim();
    if (!name) { alert('Route name is required.'); return; }

    const r = {
        id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name, tag: tag || undefined,
        origin: state.current.origin,
        dest:   state.current.dest,
        flag:   state.current.flag,
        systems: state.current.systems,
        avoid:   state.current.avoid,
        createdAt: Date.now(),
    };
    state.saved.unshift(r);
    persistSaved();
    renderSaved();
    document.getElementById('saveName').value = '';
    document.getElementById('saveTag').value  = '';
}

function handleSavedAction(act, id) {
    const r = state.saved.find(x => x.id === id);
    if (!r) return;
    if (act === 'recall') {
        state.current = { origin: r.origin, dest: r.dest, flag: r.flag, systems: r.systems, avoid: r.avoid || [] };
        document.getElementById('origin').value      = r.origin?.name || '';
        document.getElementById('destination').value = r.dest?.name   || '';
        document.getElementById('preference').value  = r.flag || 'shortest';
        renderChain(r.systems || []);
        document.getElementById('saveName').value = r.name;
        document.getElementById('saveTag').value  = r.tag || '';
        updateSaveBtnState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (act === 'delete') {
        if (!confirm(`Delete route "${r.name}"?`)) return;
        state.saved = state.saved.filter(x => x.id !== id);
        persistSaved();
        renderSaved();
    } else if (act === 'push') {
        if (!isAuthed()) { alert('Log in with EVE first.'); return; }
        pushRouteToEve(r);
    }
}

// Refresh the Rusty Routes access token using the stored refresh token.
// Returns true on success (state.auth is updated) or false if it can't.
async function refreshRRAuth() {
    if (!state.auth?.refresh_token) return false;
    try {
        const res = await fetch(`${RR_API}/auth/rr/token-exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                refresh_token: state.auth.refresh_token,
                grant_type:    'refresh_token',
            }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.access_token) return false;
        state.auth.access_token  = data.access_token;
        if (data.refresh_token) state.auth.refresh_token = data.refresh_token;
        state.auth.expires_at   = Date.now() + (data.expires_in || 1200) * 1000;
        saveAuth(state.auth);
        return true;
    } catch (e) {
        return false;
    }
}

async function pushRouteToEve(r) {
    const btn = document.querySelector(`button[data-act="push"][data-id="${r.id}"]`);
    const originalHtml = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 0/' + r.systems.length; }

    try {
        // EVE SSO tokens expire (~20 min). Refresh proactively if we're within 60s of expiry.
        if (state.auth.expires_at && Date.now() >= state.auth.expires_at - 60000) {
            const ok = await refreshRRAuth();
            if (!ok) throw new Error('Session expired — please log in again.');
        }

        const doPush = () => fetch(`${RR_API}/waypoints/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                access_token: state.auth.access_token,
                character_id: state.auth.character_id,
                // Full saved chain (origin -> ... -> destination). The autopilot flies
                // them in order; the FINAL system is the destination you end at, and
                // the intermediate systems are the saved waypoints along the route.
                systems:      r.systems.map(s => s.id),
                clear_first:  true,
            }),
        });

        let res = await doPush();
        // If the token was already stale, refresh once and retry.
        if (res.status === 401) {
            const ok = await refreshRRAuth();
            if (ok) res = await doPush();
        }

        const data = await res.json();
        if (!res.ok || !data.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (btn) btn.innerHTML = `<i class="fa-solid fa-check"></i> Pushed ${data.pushed}`;
        setTimeout(() => { if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; } }, 2500);
    } catch (e) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(e.message)}`;
        }
        alert(`Push failed: ${e.message}`);
    }
}

// ── Autocomplete (basic) ──────────────────────────────────────

function attachAutocomplete(input, boxId, onPick) {
    const box = document.getElementById(boxId);
    let timer = null;
    let active = -1;
    let items = [];

    function close() {
        box.classList.remove('open');
        box.innerHTML = '';
        items = []; active = -1;
    }

    function open(results) {
        items = results;
        if (!items.length) { close(); return; }
        box.innerHTML = items.map((s, i) =>
            `<div class="ac-item" data-i="${i}">${escapeHtml(s.name)}</div>`
        ).join('');
        box.classList.add('open');
        active = -1;
        box.querySelectorAll('.ac-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const i = +el.dataset.i;
                input.value = items[i].name;
                close();
                if (onPick) onPick(items[i]);
            });
        });
    }

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 3) { close(); return; }
        timer = setTimeout(async () => {
            try {
                const data = await esiPost('/universe/ids/', [q]);
                open(data?.systems || []);
            } catch { close(); }
        }, 200);
    });

    input.addEventListener('keydown', (e) => {
        if (!box.classList.contains('open')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); update(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); update(); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); input.value = items[active].name; close(); if (onPick) onPick(items[active]); }
        else if (e.key === 'Escape') close();
        function update() {
            box.querySelectorAll('.ac-item').forEach((el, i) =>
                el.classList.toggle('active', i === active)
            );
        }
    });

    input.addEventListener('blur', () => setTimeout(close, 150));
}

// ── Utilities ─────────────────────────────────────────────────

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// ── Init ──────────────────────────────────────────────────────

// Preview access gate. The static host (www) doesn't run server-side code, so we
// gate on the client. This is obscurity, not crypto — enough to keep a preview
// out of casual view. The page is also noindex'd and not linked anywhere.
// Key matches RR_ACCESS_KEY on the node host. On localhost the gate is skipped.
const RR_PREVIEW_KEY = 'rusty-routes-preview-2026';

function gateAccepted() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('access') === RR_PREVIEW_KEY) {
        sessionStorage.setItem('rustyroutes:v1:gate', '1');
        return true;
    }
    return sessionStorage.getItem('rustyroutes:v1:gate') === '1';
}

async function maybeGate() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal || gateAccepted()) return false;

    const gate  = document.getElementById('gate');
    const err   = document.getElementById('gateErr');
    const input = document.getElementById('gateKey');
    const btn   = document.getElementById('gateBtn');
    if (gate) gate.classList.remove('hidden');

    function submit() {
        const key = input.value.trim();
        if (key !== RR_PREVIEW_KEY) {
            err.textContent = 'Incorrect key.';
            return;
        }
        sessionStorage.setItem('rustyroutes:v1:gate', '1');
        // Cookie is read by the node-host server gate (if this page is served there).
        document.cookie = `rr_access=${encodeURIComponent(key)}; path=/; max-age=86400; samesite=lax`;
        // Clean URL so the key isn't left in the address bar
        const clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', clean);
        location.reload();
    }
    if (btn)   btn.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    return true;
}

function init() {
    loadAuth();
    loadSaved();
    renderAuth();
    renderSaved();

    document.getElementById('pasteClipboardBtn').addEventListener('click', doPasteFromClipboard);
    document.getElementById('loadPlannerBtn').addEventListener('click', doParseAndFill);
    document.getElementById('planBtn').addEventListener('click', doPlan);
    document.getElementById('saveBtn').addEventListener('click', doSave);

    attachAutocomplete(document.getElementById('origin'), 'origin-ac');
    attachAutocomplete(document.getElementById('destination'), 'destination-ac');
}

document.addEventListener('DOMContentLoaded', () => {
    maybeGate().then(gated => { if (!gated) init(); });
});
