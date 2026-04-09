const ESI   = 'https://esi.evetech.net/latest';
const ZKILL = 'https://zkillboard.com/api';
const UA    = 'RustyBot-GateCheck/1.0';

// Gate kill proximity threshold — 10,000 km in metres
const GATE_RADIUS_M = 10_000 * 1_000;

const cache = {
    ids:      new Map(), // name → id
    names:    new Map(), // id → name
    security: new Map(), // id → sec
    system:   new Map(), // id → full system data (stargates[])
    stargate: new Map(), // id → {name, position, destination_system_id}
};

// ── ESI ──────────────────────────────────────────────────────────────────────

async function esiPost(path, body) {
    const r = await fetch(`${ESI}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`ESI ${r.status}: ${path}`);
    return r.json();
}

async function esiGet(path) {
    const r = await fetch(`${ESI}${path}`, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`ESI ${r.status}: ${path}`);
    return r.json();
}

async function resolveSystemName(name) {
    const key = name.toLowerCase().trim();
    if (cache.ids.has(key)) return cache.ids.get(key);
    const data = await esiPost('/universe/ids/', [name]);
    const id = data?.systems?.[0]?.id ?? null;
    if (id) cache.ids.set(key, id);
    return id;
}

async function batchNames(ids) {
    const missing = ids.filter(id => !cache.names.has(id));
    if (missing.length) {
        const data = await esiPost('/universe/names/', missing);
        for (const d of (data || [])) cache.names.set(d.id, d.name);
    }
    return new Map(ids.map(id => [id, cache.names.get(id) || `#${id}`]));
}

async function getSystemData(id) {
    if (cache.system.has(id)) return cache.system.get(id);
    const data = await esiGet(`/universe/systems/${id}/`);
    cache.system.set(id, data);
    cache.security.set(id, data.security_status ?? 0);
    return data;
}

async function getStargate(id) {
    if (cache.stargate.has(id)) return cache.stargate.get(id);
    const data = await esiGet(`/universe/stargates/${id}/`);
    const sg = {
        id,
        name:                  data.name,           // e.g. "Stargate (Maurasi)"
        position:              data.position,        // {x, y, z}
        destination_system_id: data.destination.system_id
    };
    cache.stargate.set(id, sg);
    return sg;
}

async function getRoute(originId, destId, flag) {
    const data = await esiGet(`/route/${originId}/${destId}/?flag=${flag}`);
    return data || [];
}

// ── zKillboard ───────────────────────────────────────────────────────────────

async function getKillsRaw(systemId, duration, delayMs) {
    await new Promise(r => setTimeout(r, delayMs));
    try {
        const r = await fetch(`${ZKILL}/kills/systemID/${systemId}/pastSeconds/${duration}/`, {
            headers: { 'User-Agent': UA }
        });
        if (!r.ok) return [];
        return await r.json();
    } catch { return []; }
}

// Fetch full killmail from ESI to get victim position
async function getKillmailPosition(killId, hash) {
    try {
        const data = await esiGet(`/killmails/${killId}/${hash}/`);
        return data?.victim?.position ?? null;
    } catch { return null; }
}

// ── Gate kill filtering ───────────────────────────────────────────────────────

function dist3d(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// Returns only kills that happened within GATE_RADIUS_M of any gate in the system
async function filterGateKills(kills, stargates) {
    if (!kills.length || !stargates.length) return [];

    const gatePositions = stargates.map(sg => sg.position);

    // Fetch positions for all kills in parallel (staggered 50ms)
    const posResults = await Promise.all(
        kills.map((k, i) =>
            new Promise(res =>
                setTimeout(() =>
                    getKillmailPosition(k.killmail_id, k.zkb?.hash).then(res), i * 50)
            )
        )
    );

    const gateKills = [];
    for (let i = 0; i < kills.length; i++) {
        const pos = posResults[i];
        if (!pos) continue;
        const nearGate = gatePositions.some(gp => dist3d(pos, gp) <= GATE_RADIUS_M);
        if (nearGate) gateKills.push(kills[i]);
    }
    return gateKills;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

const INTERDICTOR_IDS = new Set([22452, 22456, 22460, 22464]);
const HIC_IDS         = new Set([11995, 12011, 12015, 12019]);
const SMARTBOMB_IDS   = new Set([
    3554,3556,3558,3560,
    10846,10848,10850,10852,
    13278,13280,13282,13284,
    19744,19746,19748,19750
]);

function analyzeKills(kills) {
    let camp = false, smartbomb = false, bubble = false;
    const details = [];

    for (const kill of kills) {
        for (const a of (kill.attackers || [])) {
            if (INTERDICTOR_IDS.has(a.ship_type_id) || HIC_IDS.has(a.ship_type_id)) bubble = true;
            if (SMARTBOMB_IDS.has(a.weapon_type_id)) smartbomb = true;
        }
    }

    if (kills.length >= 3) { camp = true; details.push(`${kills.length} gate kills in window`); }
    if (bubble)    details.push('Interdictor / HIC detected');
    if (smartbomb) details.push('Smartbomb kills detected');

    return { camp, smartbomb, bubble, killCount: kills.length, details };
}

function getThreat(hazard) {
    if (hazard.smartbomb || hazard.bubble) return 'extreme';
    if (hazard.camp || hazard.killCount >= 3) return 'high';
    if (hazard.killCount > 0) return 'moderate';
    return 'safe';
}

function secClass(sec) {
    if (sec >= 0.45) return 'hs';
    if (sec > 0)     return 'ls';
    return 'ns';
}

function secLabel(sec) {
    return Math.max(-1, Math.min(1, sec)).toFixed(1);
}

function killClass(hazard) {
    if (hazard.smartbomb) return 'ksb';
    if (hazard.bubble)    return 'kbub';
    if (hazard.killCount >= 3) return 'k3';
    if (hazard.killCount > 0)  return 'k12';
    return 'k0';
}

// ── System name database (Fuzzwork CSV) ──────────────────────────────────────

// Sorted array of system names (lowercase) for prefix search
let systemNames = []; // [{name, id}, ...]
let systemsLoaded = false;

async function loadSystemDatabase() {
    if (systemsLoaded) return;

    // Try sessionStorage cache first
    const cached = sessionStorage.getItem('fuzzwork_systems');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            systemNames = parsed;
            // Pre-populate cache.ids
            for (const s of systemNames) cache.ids.set(s.name.toLowerCase(), s.id);
            systemsLoaded = true;
            return;
        } catch { /* fall through to fetch */ }
    }

    try {
        const csvUrl = 'https://www.fuzzwork.co.uk/dump/latest/mapSolarSystems.csv';
        let text;
        try {
            const r = await fetch(csvUrl);
            if (!r.ok) throw new Error('direct fetch failed');
            text = await r.text();
        } catch {
            // Fallback: CORS proxy
            const r = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(csvUrl)}`);
            if (!r.ok) throw new Error('proxy fetch failed');
            text = await r.text();
        }

        const lines = text.split('\n');
        // Header: solarSystemID is col index 2, solarSystemName is col index 3
        // (0-indexed after splitting by comma)
        // Actual columns vary — find by header row
        const header = lines[0].split(',');
        const idIdx   = header.findIndex(h => h.trim() === 'solarSystemID');
        const nameIdx = header.findIndex(h => h.trim() === 'solarSystemName');

        const result = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length <= Math.max(idIdx, nameIdx)) continue;
            const id   = parseInt(cols[idIdx]);
            const name = cols[nameIdx]?.trim();
            if (!name || isNaN(id)) continue;
            result.push({ name, id });
        }

        // Sort alphabetically for binary search
        result.sort((a, b) => a.name.localeCompare(b.name));
        systemNames = result;

        // Pre-populate cache.ids
        for (const s of systemNames) cache.ids.set(s.name.toLowerCase(), s.id);

        // Cache in sessionStorage (compress by storing only what we need)
        try { sessionStorage.setItem('fuzzwork_systems', JSON.stringify(result)); } catch { /* quota */ }
        systemsLoaded = true;
    } catch (e) {
        console.warn('Could not load system database:', e.message);
        // Fall back gracefully — autocomplete just won't work
    }
}

function searchSystems(query, limit = 8) {
    if (!systemNames.length) return [];
    const q = query.toLowerCase();

    // Binary search for first match with this prefix
    let lo = 0, hi = systemNames.length - 1, start = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (systemNames[mid].name.toLowerCase() >= q) { start = mid; hi = mid - 1; }
        else lo = mid + 1;
    }
    if (start === -1) return [];

    const results = [];
    for (let i = start; i < systemNames.length && results.length < limit; i++) {
        if (!systemNames[i].name.toLowerCase().startsWith(q)) break;
        results.push(systemNames[i]);
    }
    return results;
}

// ── Autocomplete ─────────────────────────────────────────────────────────────

let acTimer = null;

function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    const box   = document.getElementById(`${inputId}-ac`);

    input.addEventListener('input', () => {
        clearTimeout(acTimer);
        const q = input.value.trim();
        if (q.length < 2) { box.style.display = 'none'; return; }
        acTimer = setTimeout(() => showSuggestions(q, input, box), 120);
    });

    input.addEventListener('keydown', e => {
        const items = box.querySelectorAll('.ac-item');
        const active = box.querySelector('.ac-item.active');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = active ? active.nextElementSibling : items[0];
            if (next) { active?.classList.remove('active'); next.classList.add('active'); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = active?.previousElementSibling;
            if (prev) { active.classList.remove('active'); prev.classList.add('active'); }
        } else if (e.key === 'Enter' && active) {
            e.stopPropagation();
            input.value = active.dataset.name;
            box.style.display = 'none';
        } else if (e.key === 'Escape') {
            box.style.display = 'none';
        }
    });

    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !box.contains(e.target)) box.style.display = 'none';
    });
}

function showSuggestions(query, input, box) {
    const matches = searchSystems(query);
    if (!matches.length) { box.style.display = 'none'; return; }

    box.innerHTML = '';
    for (const s of matches) {
        const item = document.createElement('div');
        item.className = 'ac-item';
        item.dataset.name = s.name;
        // Highlight the matching prefix
        const prefix = s.name.slice(0, query.length);
        const rest   = s.name.slice(query.length);
        item.innerHTML = `<span class="ac-match">${prefix}</span>${rest}`;
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            input.value = s.name;
            box.style.display = 'none';
        });
        box.appendChild(item);
    }
    box.style.display = 'block';
}

// ── EVE time ─────────────────────────────────────────────────────────────────

function updateEveTime() {
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const el = document.getElementById('eve-time');
    if (el) el.textContent = `EVE ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}
setInterval(updateEveTime, 1000);
updateEveTime();

// ── UI ────────────────────────────────────────────────────────────────────────

function setLoading(on) {
    document.getElementById('checkBtn').disabled = on;
    document.getElementById('btnText').textContent = on ? 'Checking...' : 'Check!';
    document.getElementById('btnSpinner').classList.toggle('hidden', !on);
}

function showError(msg) {
    const el = document.getElementById('error');
    el.textContent = msg;
    el.classList.remove('hidden');
}
function hideError() { document.getElementById('error').classList.add('hidden'); }

function renderSummary(systems) {
    const totalKills = systems.reduce((s, x) => s + x.hazard.killCount, 0);
    const dangerous  = systems.filter(x => ['high','extreme'].includes(x.threat)).length;
    const order      = ['safe','moderate','high','extreme'];
    const worst      = systems.reduce((w, x) => order.indexOf(x.threat) > order.indexOf(w) ? x.threat : w, 'safe');
    const verdicts   = { safe: '✅ Clear', moderate: '⚠️ Caution', high: '🔴 Danger', extreme: '☠️ Extreme' };
    const colors     = { safe: 'var(--safe)', moderate: 'var(--mod)', high: 'var(--high)', extreme: 'var(--sb)' };

    const el = document.getElementById('summary');
    el.innerHTML = `
        <div class="sum-box"><div class="sum-val">${systems.length}</div><div class="sum-label">Jumps</div></div>
        <div class="sum-box"><div class="sum-val" style="color:${totalKills>0?'var(--high)':'var(--safe)'}">${totalKills}</div><div class="sum-label">Gate Kills</div></div>
        <div class="sum-box"><div class="sum-val" style="color:${dangerous>0?'var(--high)':'var(--safe)'}">${dangerous}</div><div class="sum-label">Hot Systems</div></div>
        <div class="sum-box"><div class="sum-val" style="color:${colors[worst]};font-size:18px">${verdicts[worst]}</div><div class="sum-label">Verdict</div></div>
    `;
    el.classList.remove('hidden');
}

function renderResults(systems, origin, dest, avoidSet) {
    document.getElementById('route-label').textContent = `${origin} → ${dest}`;
    const body = document.getElementById('route-body');
    body.innerHTML = '';

    systems.forEach((sys, i) => {
        const avoided = avoidSet.has(sys.name.toLowerCase());
        const threat  = avoided ? 'avoided' : sys.threat;
        const kClass  = avoided ? 'k0' : killClass(sys.hazard);
        const icons   = avoided ? '🚫' : [
            sys.hazard.bubble    ? '🫧' : '',
            sys.hazard.smartbomb ? '💥' : '',
            sys.hazard.camp      ? '⛺' : '',
        ].join('');

        // Gate names: stargates leading OUT of this system
        const gateNames = sys.stargates
            .map(sg => sg.name.replace('Stargate (', '').replace(')', ''))
            .join(', ');

        const row = document.createElement('div');
        row.className = `route-row row-${threat}`;
        row.innerHTML = `
            <div class="hop">${i + 1}</div>
            <div>
                <div class="sys-name${avoided?' avoided':''}">${sys.name}</div>
                <div class="gate-names">${gateNames || '—'}</div>
            </div>
            <div class="sec ${secClass(sys.security)}">${secLabel(sys.security)}</div>
            <div class="kills ${kClass}">${sys.hazard.killCount > 0 ? sys.hazard.killCount : '—'}</div>
            <div class="hazard-icons">${icons}</div>
            <div class="status-badge ${threat}">${threat.charAt(0).toUpperCase()+threat.slice(1)}</div>
            <a class="zkill-btn" href="https://zkillboard.com/system/${sys.id}/" target="_blank">zKill ↗</a>
        `;

        const detail = document.createElement('div');
        detail.className = 'detail-row';
        const tags = sys.hazard.details.length
            ? sys.hazard.details.map(d => `<span class="detail-tag warn">${d}</span>`).join('')
            : '<span class="detail-tag">No gate activity detected</span>';
        detail.innerHTML = tags + `<span class="detail-tag">ID: ${sys.id}</span>`;

        row.addEventListener('click', () => {
            detail.classList.toggle('open');
            row.classList.toggle('expanded');
        });

        body.appendChild(row);
        body.appendChild(detail);
    });

    document.getElementById('results').classList.remove('hidden');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runGatecheck() {
    const origin   = document.getElementById('origin').value.trim();
    const dest     = document.getElementById('destination').value.trim();
    const pref     = document.getElementById('preference').value;
    const duration = parseInt(document.getElementById('duration').value);
    const avoidRaw = document.getElementById('avoid').value;
    const avoidSet = new Set(avoidRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));

    hideError();
    document.getElementById('summary').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    if (!origin || !dest) { showError('Enter both origin and destination.'); return; }

    setLoading(true);
    try {
        // Resolve names
        const [originId, destId] = await Promise.all([
            resolveSystemName(origin),
            resolveSystemName(dest)
        ]);
        if (!originId) { showError(`System not found: "${origin}"`); return; }
        if (!destId)   { showError(`System not found: "${dest}"`);   return; }

        // Get route
        const routeIds = await getRoute(originId, destId, pref);
        if (!routeIds.length) { showError('No route found.'); return; }

        // Fetch all system data in parallel (gives us stargate IDs + security)
        const systemDataArr = await Promise.all(routeIds.map(id => getSystemData(id)));

        // Batch resolve system names
        const nameById = await batchNames(routeIds);

        // Fetch all stargates for all systems in parallel
        const allStargateIds = systemDataArr.flatMap(sd => sd.stargates || []);
        const stargateArr    = await Promise.all(allStargateIds.map(id => getStargate(id)));
        const stargateById   = new Map(stargateArr.map(sg => [sg.id, sg]));

        // Fetch raw kills for all systems in parallel (staggered 80ms)
        const rawKillsArr = await Promise.all(
            routeIds.map((id, i) => getKillsRaw(id, duration, i * 80))
        );

        // For each system, filter kills to gate-only, then analyze
        const systems = await Promise.all(
            routeIds.map(async (id, i) => {
                const sd       = systemDataArr[i];
                const stargates = (sd.stargates || []).map(sgId => stargateById.get(sgId)).filter(Boolean);
                const rawKills  = rawKillsArr[i];

                // Filter to gate kills only
                const gateKills = await filterGateKills(rawKills, stargates);
                const hazard    = analyzeKills(gateKills);

                return {
                    id,
                    name:     nameById.get(id),
                    security: sd.security_status ?? 0,
                    stargates,
                    hazard,
                    threat:   getThreat(hazard)
                };
            })
        );

        renderSummary(systems);
        renderResults(systems, origin, dest, avoidSet);

    } catch (e) {
        showError(`Error: ${e.message}`);
    } finally {
        setLoading(false);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    setupAutocomplete('origin');
    setupAutocomplete('destination');
    // Start loading system database in background — ready by the time user types
    loadSystemDatabase();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT') runGatecheck();
});
