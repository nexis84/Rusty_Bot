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

// Prefer the ID of a system picked from the dropdown; fall back to name lookup
async function resolveInputSystem(inputId, value) {
    const picked = pickedSystem[inputId];
    if (picked && picked.name.toLowerCase() === value.toLowerCase()) return picked.id;
    return resolveSystemName(value);
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
    try {
        const data = await esiGet(`/route/${originId}/${destId}/?flag=${flag}`);
        return data || [];
    } catch (e) {
        if (String(e.message).includes('ESI 404')) return []; // ESI returns 404 when no route exists
        throw e;
    }
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

// ── System database (generated from SDE — grouped by accessibility) ──────────

// Systems reachable by gate + sections that exist in-game but have no
// stargate route. The sections are listed separately so they don't get
// mixed into normal searches.
const AC_SECTIONS = [
    { id: 'pochven',  label: 'Pochven',  note: 'filament entry only — no gate route' },
    { id: 'exordium', label: 'Exordium', note: 'restricted region — no gate route' },
];

const AC_LIMIT = 500;

// [{id, name, sec, key}] grouped per section; 'main' is the stargate network
let systemGroups = { main: [] };

function loadSystemDatabase() {
    if (typeof GATECHECK_SYSTEMS === 'undefined' || !Array.isArray(GATECHECK_SYSTEMS)) {
        console.warn('gatecheck/systems.js did not load — the system dropdown is empty, but typed names still resolve via ESI.');
        return;
    }
    systemGroups = { main: [] };
    for (const section of AC_SECTIONS) systemGroups[section.id] = [];

    for (const s of GATECHECK_SYSTEMS) {
        const entry = { id: s.id, name: s.name, sec: s.sec, key: s.name.toLowerCase() };
        (systemGroups[s.group] || systemGroups.main).push(entry);
        // Pre-populate the ESI name→id cache so typed system names resolve instantly
        cache.ids.set(entry.key, entry.id);
    }
}

// Search one group: name prefix first, then word start, then substring anywhere.
function searchGroup(list, q, limit) {
    if (!q) return { items: list.slice(0, limit), total: list.length };

    const byPrefix = [], byWord = [], bySubstring = [];
    for (const s of list) {
        if (!s.key.includes(q)) continue;
        if (s.key.startsWith(q)) byPrefix.push(s);
        else if (s.key.includes(' ' + q)) byWord.push(s);
        else bySubstring.push(s);
    }
    const total = byPrefix.length + byWord.length + bySubstring.length;
    return { items: byPrefix.concat(byWord, bySubstring).slice(0, limit), total };
}

// Returns { main: {items,total}, sections: [{id,label,note,items,total}], total, shown }
function filterSystems(query) {
    const q = query.trim().toLowerCase();

    const main = searchGroup(systemGroups.main, q, AC_LIMIT);
    const sections = AC_SECTIONS
        .map(section => {
            const { items, total } = searchGroup(systemGroups[section.id] || [], q, AC_LIMIT);
            return { ...section, items, total };
        })
        .filter(section => section.items.length || !q); // when searching, hide sections with no matches

    return {
        main,
        sections,
        total: main.total + sections.reduce((n, s) => n + s.total, 0),
        shown: main.items.length + sections.reduce((n, s) => n + s.items.length, 0),
    };
}

// ── Location comboboxes ──────────────────────────────────────────────────────

let acTimer = null;

// System picked from the dropdown per input — lets us skip the ESI name lookup
const pickedSystem = { origin: null, destination: null };

function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    const box   = document.getElementById(`${inputId}-ac`);

    const open = () => {
        clearTimeout(acTimer);
        acTimer = setTimeout(() => showSuggestions(input.value, input, box), 80);
    };

    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', () => {
        pickedSystem[inputId] = null; // typing invalidates a previous pick
        open();
    });

    input.addEventListener('keydown', e => {
        const items  = Array.from(box.querySelectorAll('.ac-item'));
        const active = box.querySelector('.ac-item.active');
        const idx    = active ? items.indexOf(active) : -1;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (box.style.display !== 'block') { open(); return; }
            if (!items.length) return;
            const next = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1);
            active?.classList.remove('active');
            items[next].classList.add('active');
            items[next].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (idx > 0) {
                active.classList.remove('active');
                items[idx - 1].classList.add('active');
                items[idx - 1].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter' && active) {
            e.stopPropagation();
            pickSystem(input, box, { id: Number(active.dataset.id), name: active.dataset.name });
        } else if (e.key === 'Escape') {
            box.style.display = 'none';
        }
    });

    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !box.contains(e.target)) box.style.display = 'none';
    });
}

function pickSystem(input, box, system) {
    input.value = system.name;
    pickedSystem[input.id] = system;
    box.style.display = 'none';
}

const escapeHtml = str => str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function highlightMatch(name, q) {
    const idx = q ? name.toLowerCase().indexOf(q) : -1;
    if (idx < 0) return escapeHtml(name);
    return escapeHtml(name.slice(0, idx))
        + `<span class="ac-match">${escapeHtml(name.slice(idx, idx + q.length))}</span>`
        + escapeHtml(name.slice(idx + q.length));
}

function makeItem(system, ql, input, box) {
    const item = document.createElement('div');
    item.className = 'ac-item';
    item.dataset.name = system.name;
    item.dataset.id = system.id;
    item.innerHTML = `<span class="ac-name">${highlightMatch(system.name, ql)}</span>`
        + `<span class="ac-sec ${secClass(system.sec)}">${secLabel(system.sec)}</span>`;
    item.addEventListener('mousedown', e => {
        e.preventDefault();
        pickSystem(input, box, system);
    });
    return item;
}

function showSuggestions(query, input, box) {
    const q  = query.trim();
    const ql = q.toLowerCase();

    if (!systemGroups.main.length) {
        box.innerHTML = '<div class="ac-empty">System list unavailable — you can still type a name and hit Check.</div>';
        box.style.display = 'block';
        return;
    }

    const { main, sections, total, shown } = filterSystems(q);
    box.innerHTML = '';

    if (!shown) {
        box.innerHTML = `<div class="ac-empty">No systems match “${escapeHtml(q)}”</div>`;
        box.style.display = 'block';
        return;
    }

    const frag = document.createDocumentFragment();
    for (const s of main.items) frag.appendChild(makeItem(s, ql, input, box));

    for (const section of sections) {
        if (!section.items.length) continue;
        const head = document.createElement('div');
        head.className = 'ac-section';
        head.innerHTML = `<span class="ac-section-label">${section.label}</span>`
            + `<span class="ac-section-note">${section.note}</span>`;
        frag.appendChild(head);
        for (const s of section.items) frag.appendChild(makeItem(s, ql, input, box));
    }
    box.appendChild(frag);

    const hint = document.createElement('div');
    hint.className = 'ac-hint';
    hint.textContent = shown < total
        ? `Showing ${shown} of ${total.toLocaleString()} systems — keep typing to narrow`
        : `${total.toLocaleString()} system${total === 1 ? '' : 's'}`;
    box.appendChild(hint);

    box.style.display = 'block';
    box.scrollTop = 0;
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
        // Use the ID of systems picked from the dropdown, otherwise resolve typed names
        const [originId, destId] = await Promise.all([
            resolveInputSystem('origin', origin),
            resolveInputSystem('destination', dest)
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
    loadSystemDatabase();
    setupAutocomplete('origin');
    setupAutocomplete('destination');
});

document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === 'Enter' && !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(tag)) runGatecheck();
});
