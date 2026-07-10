const ESI = 'https://esi.evetech.net/latest';
const ESI_UNI = `${ESI}/universe`;
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, '').replace(/\/$/, '');
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_HOST = IS_LOCAL ? '' : 'https://rusty-bot-api.onrender.com';
const ESI_UNI_PROXY = API_HOST + BASE_PATH + '/api/esi/universe';
const ZKB_PROXY = API_HOST + BASE_PATH + '/api/zkb';
const ZKB_DIRECT = 'https://zkillboard.com/api';
const REDISQ_PROXY = API_HOST + BASE_PATH + '/api/redisq';
const IMG = 'https://images.evetech.net';
const AGENT = 'RustyBot-Killboard/1.0';

const CACHE_VERSION = 2;
const savedVersion = localStorage.getItem('rb_cache_version');
if (savedVersion != CACHE_VERSION) {
    localStorage.removeItem('rb_nameCache');
    localStorage.removeItem('rb_typeCache');
    localStorage.removeItem('rb_sysCache');
    localStorage.setItem('rb_cache_version', CACHE_VERSION);
}

const PROTOCOL = window.location.protocol;
const IS_FILE = PROTOCOL === 'file:';
var rangeWindow = function(min) { return min * 60 * 1000; };
const TOP_KILLS_MIN = 1000000000;
const TOP_KILLS_MAX = 5;
const TOP_KILLS_CACHE = 'rb_topKills';
const TOP_KILLS_EXPIRY = 6 * 60 * 60 * 1000;

function isWithin(kd, ms) {
    if (!kd?.killmail_time) return false;
    return Date.now() - new Date(kd.killmail_time).getTime() < ms;
}

function zkbUrl(path) {
    // Use proxy when on server, direct API when in file mode
    return IS_FILE ? ZKB_DIRECT + path : ZKB_PROXY + path;
}

async function fetchEsiKillmail(killId, hash) {
    return apiFetch(`${ESI}/killmails/${killId}/${hash}/`);
}

const State = {
    allKills: [],
    kills: [],
    searchEntity: '',
    isSearching: false,
    loading: false,
    loadingMore: false,
    maxSeenId: 0,
    detailKillId: null,
    _pollTimer: null,
    _pollRetry: 0,
    pollActive: true,
    timeRange: 30,
    minValue: 10000000,
    _searchQuery: '',
    get searchQuery() { return this._searchQuery; },
    set searchQuery(v) { this._searchQuery = v.toLowerCase(); },
    searchMode: false,
    searchResults: [],
    searchedCharacterName: '',
    searchedCharacterId: null,
    searchedType: '',
    searchPage: 0,
    searchHasMore: false,
    searchLoadingMore: false,
    characterMode: false,
    characterId: null,
    characterName: '',
    entityType: 'character',
    characterData: null,
    characterKills: [],
    characterLosses: [],
    characterKillsPage: 0,
    characterLossesPage: 0,
    characterKillsHasMore: false,
    characterLossesHasMore: false,
    characterKillsLoadingMore: false,
    characterLossesLoadingMore: false,
    topKills: [],
    topKillsLoaded: false,
    filterSec: 'all',
    filterAttackers: 'all',
    sortBy: 'date', // 'date', 'isk', 'ship', 'system'
};

const Cache = {
    names: new Map(),
    types: new Map(),
    systems: new Map(),
    _load() {
        try {
            const n = localStorage.getItem('rb_nameCache');
            const t = localStorage.getItem('rb_typeCache');
            const s = localStorage.getItem('rb_sysCache');
            if (n) { const d = JSON.parse(n); d.forEach(([k, v]) => this.names.set(Number(k), v)); }
            if (t) { const d = JSON.parse(t); d.forEach(([k, v]) => this.types.set(Number(k), v)); }
            if (s) { const d = JSON.parse(s); d.forEach(([k, v]) => this.systems.set(Number(k), v)); }
        } catch (e) { console.warn('[Cache] Failed to load cache:', e.message); }
    },
    _save() {
        try {
            localStorage.setItem('rb_nameCache', JSON.stringify([...this.names]));
            localStorage.setItem('rb_typeCache', JSON.stringify([...this.types]));
            localStorage.setItem('rb_sysCache', JSON.stringify([...this.systems]));
        } catch (e) { console.warn('[Cache] Failed to save cache:', e.message); }
    },
    getName(id) { return this.names.get(id); },
    setName(id, data) { this.names.set(id, data); this._save(); },
    getType(id) { return this.types.get(id); },
    setType(id, data) { this.types.set(id, data); this._save(); },
    getSystem(id) { return this.systems.get(id); },
    setSystem(id, data) { this.systems.set(id, data); this._save(); },
};
Cache._load();

function $(id) { return document.getElementById(id); }

function fmtIsk(n) {
    if (n == null) return '\u2014';
    const abs = Math.abs(n);
    let s;
    if (abs >= 1e12) s = (n / 1e12).toFixed(2) + 'T';
    else if (abs >= 1e9) s = (n / 1e9).toFixed(2) + 'B';
    else if (abs >= 1e6) s = (n / 1e6).toFixed(2) + 'M';
    else if (abs >= 1e3) s = (n / 1e3).toFixed(2) + 'K';
    else s = n.toFixed(2);
    return s.replace(/\.?0+([KMBT])/, '$1');
}

function fmtTime(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' EVE';
}

function secClass(sec) {
    if (sec == null) return 'wormhole';
    if (sec >= 0.5) return 'high';
    if (sec >= 0.1) return 'low';
    return 'null';
}

function fmtSec(sec) {
    if (sec == null) return 'W-Space';
    return sec.toFixed(1);
}

function efficiencyRating(dropped, total) {
    if (!total || total === 0) return { label: 'Unknown', cls: 'fair' };
    if (dropped == null) return { label: 'Unknown', cls: 'fair' };
    const pct = (dropped / total) * 100;
    if (pct >= 98) return { label: 'Perfect', cls: 'perfect' };
    if (pct >= 70) return { label: 'Great', cls: 'great' };
    if (pct >= 40) return { label: 'Fair', cls: 'fair' };
    return { label: 'Poor', cls: 'poor' };
}

function shipIconUrl(typeId) { return `${IMG}/types/${typeId}/icon?size=64`; }
function shipRenderUrl(typeId) { return `${IMG}/types/${typeId}/render?size=128`; }
function charPortrait(id, size = 64) { return `${IMG}/characters/${id}/portrait?size=${size}`; }
function corpLogo(id, size = 32) { return `${IMG}/corporations/${id}/logo?size=${size}`; }
function allyLogo(id, size = 32) { return `${IMG}/alliances/${id}/logo?size=${size}`; }

async function apiFetch(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out', 'AbortError')), 15000);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': AGENT, 'Accept': 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

async function fetchNames(ids) {
    ids = [...new Set(ids.filter(id => id && id > 0 && !Cache.getName(id)))];
    if (!ids.length) return;
    const batchSize = 1000;
    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        try {
            const res = await fetch(`${ESI_UNI}/names/`, {
                method: 'POST',
                headers: { 'User-Agent': AGENT, 'Content-Type': 'application/json' },
                body: JSON.stringify(batch),
            });
            if (res.ok) {
                const data = await res.json();
                data.forEach(item => Cache.setName(item.id, { name: item.name, category: item.category }));
            }
        } catch (e) { console.warn('[fetchNames] Failed to resolve names:', e.message); }
    }
}

async function fetchTypes(typeIds) {
    typeIds = [...new Set(typeIds.filter(id => id && id > 0 && !Cache.getType(id)))];
    if (!typeIds.length) return;
    const CONCURRENCY = 10;
    for (let i = 0; i < typeIds.length; i += CONCURRENCY) {
        const batch = typeIds.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async id => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const data = await apiFetch(`${ESI_UNI_PROXY}/types/${id}/`);
                    Cache.setType(id, { name: data.name });
                    return;
                } catch (e) {
                    if (attempt === 2) {
                        console.warn(`[fetchTypes] Failed to resolve type ${id}: ${e.message}`);
                    } else {
                        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                    }
                }
            }
        }));
    }
}

async function fetchSystems(systemIds) {
    systemIds = [...new Set(systemIds.filter(id => id && id > 0 && !Cache.getSystem(id)))];
    if (!systemIds.length) return;
    const CONCURRENCY = 10;
    for (let i = 0; i < systemIds.length; i += CONCURRENCY) {
        const batch = systemIds.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async id => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const data = await apiFetch(`${ESI_UNI_PROXY}/systems/${id}/`);
                    Cache.setSystem(id, { name: data.name, security: data.security_status });
                    return;
                } catch (e) {
                    if (attempt === 2) {
                        console.warn(`[fetchSystems] Failed to resolve system ${id}: ${e.message}`);
                    } else {
                        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                    }
                }
            }
        }));
    }
}

function slotCategory(flag) {
    if ([11,12,13,14,15,16,17,18].includes(flag)) return 'low';
    if ([19,20,21,22,23,24,25,26].includes(flag)) return 'mid';
    if ([27,28,29,30,31,32,33,34].includes(flag)) return 'high';
    if ([92,93,94,95,96,97,98,99].includes(flag)) return 'rig';
    if ([125,126,127,128,129,130,131,132].includes(flag)) return 'subsystem';
    if ([87].includes(flag)) return 'drone';
    return 'cargo';
}

async function resolveKillIds(kill) {
    // If server pre-resolved names, just populate the cache
    if (kill._resolved) {
        const r = kill._resolved;
        if (r.names) Object.entries(r.names).forEach(([id, val]) => Cache.setName(Number(id), val));
        if (r.types) Object.entries(r.types).forEach(([id, val]) => Cache.setType(Number(id), val));
        if (r.systems) Object.entries(r.systems).forEach(([id, val]) => Cache.setSystem(Number(id), val));
        return;
    }
    const ids = { chars: new Set(), types: new Set(), systems: new Set() };
    if (kill.victim) {
        if (kill.victim.character_id) ids.chars.add(kill.victim.character_id);
        if (kill.victim.corporation_id) ids.chars.add(kill.victim.corporation_id);
        if (kill.victim.alliance_id) ids.chars.add(kill.victim.alliance_id);
        if (kill.victim.ship_type_id) ids.types.add(kill.victim.ship_type_id);
        if (kill.victim.items) kill.victim.items.forEach(i => {
            if (i.item_type_id) ids.types.add(i.item_type_id);
        });
    }
    if (kill.attackers) kill.attackers.forEach(a => {
        if (a.character_id) ids.chars.add(a.character_id);
        if (a.corporation_id) ids.chars.add(a.corporation_id);
        if (a.ship_type_id) ids.types.add(a.ship_type_id);
        if (a.weapon_type_id) ids.types.add(a.weapon_type_id);
    });
    if (kill.solar_system_id) ids.systems.add(kill.solar_system_id);
    
    await Promise.all([
        fetchNames([...ids.chars]),
        fetchTypes([...ids.types]),
        fetchSystems([...ids.systems])
    ]);
}

function getEntityName(id) { return (id && id > 0) ? (Cache.getName(id)?.name || `#${id}`) : 'Unknown'; }
function getTypeName(id) { return (id && id > 0) ? (Cache.getType(id)?.name || `Type #${id}`) : 'Unknown'; }
function getSysName(id) { return (id && id > 0) ? (Cache.getSystem(id)?.name || `System #${id}`) : 'Unknown'; }
function getSysSec(id) { return (id && id > 0) ? (Cache.getSystem(id)?.security ?? null) : null; }

async function enrichZkbWithEsi(items) {
    const results = [];
    const batchSize = 10;
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async item => {
            try {
                const esi = await fetchEsiKillmail(item.killmail_id, item.zkb.hash);
                if (esi && !esi.solar_system_id) {
                    console.warn('[esi] ESI response missing solar_system_id for', item.killmail_id, esi);
                }
                return { ...item, esi };
            } catch (e) {
                console.warn('[esi] Failed ESI enrich for', item.killmail_id, item.zkb.hash?.substring(0,8), e.message);
                return null;
            }
        }));
        results.push(...batchResults.filter(Boolean));
    }
    if (results.length) {
        console.log('[esi] Enriched', results.length, '/', items.length, 'kills | first solar_system_id:', results[0]?.esi?.solar_system_id);
    } else {
        console.warn('[esi] ALL enrichment failed —', items.length, 'items');
    }
    return results;
}



async function loadMoreSearchResults() {
    if (State.searchLoadingMore || !State.searchHasMore || !State.searchedCharacterId) return;
    State.searchLoadingMore = true;
    $('loadMoreBtn').textContent = 'Loading...';
    $('loadMoreBtn').disabled = true;
    try {
        const nextPage = State.searchPage + 1;
        const zkbPath = CAT_TO_ZKB[State.searchedType] || 'characterID';
        const raw = await apiFetch(zkbUrl(`/${zkbPath}/${State.searchedCharacterId}/page/${nextPage}/`));
        if (!raw || !raw.length) {
            State.searchHasMore = false;
            $('loadMoreBtn').classList.add('hidden');
            return;
        }
        State.searchHasMore = raw.length >= 200;
        const enriched = await enrichZkbWithEsi(raw);
        const newKills = enriched.map(r2z2ToKillData);
        const existingIds = new Set(State.searchResults.map(k => k.killmail_id));
        for (const kd of newKills) {
            if (!existingIds.has(kd.killmail_id)) {
                State.searchResults.push(kd);
            }
        }
        State.searchPage = nextPage;
        renderFeed();
    } catch (e) {
        console.error('[search] Load more failed:', e.message);
        showToast(`Failed to load more kills: ${e.message}`, 'error');
    } finally {
        State.searchLoadingMore = false;
        $('loadMoreBtn').textContent = 'Load More';
        $('loadMoreBtn').disabled = false;
    }
}

const SEARCH_ICONS = {
    pilot: '<i class="fas fa-user"></i>',
    corp: '<i class="fas fa-building"></i>',
    ally: '<i class="fas fa-flag"></i>',
    ship: '<i class="fas fa-space-shuttle"></i>',
    system: '<i class="fas fa-globe"></i>',
};
const SEARCH_LABELS = {
    pilot: 'Pilot', corp: 'Corp', ally: 'Alliance',
    ship: 'Ship', system: 'System',
};
const CAT_TO_ZKB = {
    pilot: 'characterID', corp: 'corporationID', ally: 'allianceID',
    ship: 'shipTypeID', system: 'systemID',
};
const CAT_TO_ZKB_SHORT = {
    pilot: 'character', corp: 'corporation', ally: 'alliance',
    ship: 'ship', system: 'system',
};

function doSearch(name, id, cat) {
    searchZkb(name, id, cat);
}

async function findAndSearch(val) {
    try {
        const res = await fetch(`${ESI}/universe/ids/`, {
            method: 'POST',
            headers: { 'User-Agent': AGENT, 'Content-Type': 'application/json' },
            body: JSON.stringify([val]),
        });
        if (!res.ok) { showToast('Search failed', 'error'); return; }
        const data = await res.json();
        for (const [key, cat] of [['characters', 'pilot'], ['corporations', 'corp'], ['alliances', 'ally']]) {
            const items = data[key] || [];
            if (items.length) {
                doSearch(items[0].name, items[0].id, cat);
                return;
            }
        }
        showToast(`No results found for "${val}"`, 'error');
    } catch (e) {
        console.error('[search] findAndSearch failed:', e.message);
        showToast(`Search failed: ${e.message}`, 'error');
    }
}

async function searchZkb(name, id, cat) {
    if (!name || !id) return;
    if (State.characterMode) exitCharacterView();
    exitSearchMode();
    const zkbPath = CAT_TO_ZKB[cat];
    const label = SEARCH_LABELS[cat] || cat;
    const icon = SEARCH_ICONS[cat] || '<i class="fas fa-search"></i>';
    try {
        showToast(`Loading ${label} ${name}...`, 'success');
        State.searchMode = true;
        State.searchedCharacterName = name;
        State.searchedCharacterId = id;
        State.searchedType = CAT_TO_ZKB_SHORT[cat];
        State.searchPage = 0;
        State.searchHasMore = false;
        const raw = await apiFetch(zkbUrl(`/${zkbPath}/${id}/`));
        if (raw && raw.length) {
            const enriched = await enrichZkbWithEsi(raw);
            State.searchResults = enriched.map(r2z2ToKillData);
            State.searchPage = 1;
            State.searchHasMore = enriched.length >= 200;
        }
        const banner = $('searchBanner');
        banner.innerHTML = `${icon} ${label}: ${escapeHtml(name)} <button class="search-exit-btn" onclick="exitSearchMode()"><i class="fas fa-times"></i> Clear</button>`;
        banner.classList.remove('hidden');
        renderFeed();
    } catch (e) {
        console.error('[search] Search failed:', e.message);
        showToast(`Search failed: ${e.message}`, 'error');
    }
}

function exitSearchMode() {
    State.searchMode = false;
    State.searchResults = [];
    State.searchedCharacterName = '';
    State.searchedCharacterId = null;
    State.searchedType = '';
    State.searchPage = 0;
    State.searchHasMore = false;
    $('searchBanner').classList.add('hidden');
    $('loadMoreBtn').classList.add('hidden');
    $('searchInput').value = '';
    State.searchQuery = '';
    renderFeed();
}

function zkbEntityPath(type) {
    return type === 'character' ? 'characterID' : type === 'corporation' ? 'corporationID' : 'allianceID';
}
function zkbEntityPrefix(type) {
    return type === 'character' ? 'character' : type === 'corporation' ? 'corporation' : 'alliance';
}

async function showEntity(entityId, name, type) {
    if (State.characterMode) exitCharacterView();
    stopPolling();
    State.characterMode = true;
    State.entityType = type;
    State.characterId = entityId;
    State.characterName = name;
    State.characterKills = [];
    State.characterLosses = [];
    State.characterKillsPage = 0;
    State.characterLossesPage = 0;
    State.characterKillsHasMore = true;
    State.characterLossesHasMore = true;
    State.characterData = null;
    $('feedView').classList.add('hidden');
    $('detailView').classList.add('hidden');
    $('characterView').classList.remove('hidden');
    $('charLoading').classList.remove('hidden');
    $('charContent').classList.add('hidden');
    $('charError').classList.add('hidden');
    const prefix = zkbEntityPrefix(type);
    $('zkbCharLink').href = `https://zkillboard.com/${prefix}/${entityId}/`;
    const entityLabel = type === 'corporation' ? 'corporation' : type === 'alliance' ? 'alliance' : 'character';
    $('charLoading').querySelector('p').textContent = `Loading ${entityLabel} data...`;
    $('charError').querySelector('h3').textContent = `Failed to load ${entityLabel} data`;
    $('charKillsEmpty').querySelector('p').textContent = `This ${entityLabel} has no kills on record.`;
    $('charLossesEmpty').querySelector('p').textContent = `This ${entityLabel} has no losses on record.`;
    try {
        const stats = await apiFetch(zkbUrl(`/stats/${zkbEntityPath(type)}/${entityId}/`));
        if (stats) {
            State.characterData = stats;
            const info = stats.info || {};
            if (type === 'character') {
                const corpId = info.corporation_id || info.corporationID;
                const allyId = info.alliance_id || info.allianceID;
                if (corpId || allyId) await fetchNames([corpId, allyId].filter(Boolean));
            }
            renderCharacterInfo(stats);
            renderCharacterStats(stats);
        }
        $('charLoading').classList.add('hidden');
        $('charContent').classList.remove('hidden');
        const [firstKills, firstLosses] = await Promise.all([
            loadCharacterPage('kills', 1),
            loadCharacterPage('losses', 1),
        ]);
        State.characterKills = firstKills;
        State.characterKillsPage = 1;
        State.characterLosses = firstLosses;
        State.characterLossesPage = 1;
        await Promise.all([
            renderCharacterKills('kills'),
            renderCharacterKills('losses'),
        ]);
    } catch (e) {
        console.error('[character] Load failed:', e.message);
        $('charLoading').classList.add('hidden');
        $('charErrorMsg').textContent = e.message || 'Could not load character data.';
        $('charError').classList.remove('hidden');
    }
}

function exitCharacterView() {
    State.characterMode = false;
    State.characterId = null;
    State.characterName = '';
    State.entityType = 'character';
    State.characterKills = [];
    State.characterLosses = [];
    State.characterKillsPage = 0;
    State.characterLossesPage = 0;
    State.characterKillsHasMore = false;
    State.characterLossesHasMore = false;
    State.characterKillsLoadingMore = false;
    State.characterLossesLoadingMore = false;
    State.characterData = null;
    $('characterView').classList.add('hidden');
    $('charKillsLoadMore').classList.add('hidden');
    $('charLossesLoadMore').classList.add('hidden');
    $('charKillsGrid').innerHTML = '';
    $('charLossesGrid').innerHTML = '';
    startPolling();
    $('feedView').classList.remove('hidden');
    renderFeed();
}

async function loadCharacterPage(type, page) {
    const path = zkbEntityPath(State.entityType);
    const endpoint = page === 1
        ? `/${path}/${State.characterId}/${type}/`
        : `/${path}/${State.characterId}/${type}/page/${page}/`;
    const raw = await apiFetch(zkbUrl(endpoint));
    if (!raw || !raw.length) {
        if (type === 'kills') State.characterKillsHasMore = false;
        else State.characterLossesHasMore = false;
        return [];
    }
    if (type === 'kills') State.characterKillsHasMore = raw.length >= 200;
    else State.characterLossesHasMore = raw.length >= 200;
    const enriched = await enrichZkbWithEsi(raw);
    return enriched.map(r2z2ToKillData);
}

async function loadMoreCharacterKills(type) {
    const loadingKey = type === 'kills' ? 'characterKillsLoadingMore' : 'characterLossesLoadingMore';
    const hasMoreKey = type === 'kills' ? 'characterKillsHasMore' : 'characterLossesHasMore';
    const pageKey = type === 'kills' ? 'characterKillsPage' : 'characterLossesPage';
    const listKey = type === 'kills' ? 'characterKills' : 'characterLosses';
    const btnId = type === 'kills' ? 'charKillsLoadMore' : 'charLossesLoadMore';
    if (State[loadingKey] || !State[hasMoreKey] || !State.characterId) return;
    State[loadingKey] = true;
    $(btnId).textContent = 'Loading...';
    $(btnId).disabled = true;
    try {
        const nextPage = State[pageKey] + 1;
        const newKills = await loadCharacterPage(type, nextPage);
        if (!newKills.length) {
            State[hasMoreKey] = false;
            $(btnId).classList.add('hidden');
            return;
        }
        const existingIds = new Set(State[listKey].map(k => k.killmail_id));
        for (const kd of newKills) {
            if (!existingIds.has(kd.killmail_id)) {
                State[listKey].push(kd);
            }
        }
        State[pageKey] = nextPage;
        renderCharacterKills(type);
    } catch (e) {
        console.error(`[character] Load more ${type} failed:`, e.message);
        showToast(`Failed to load more ${type}: ${e.message}`, 'error');
    } finally {
        State[loadingKey] = false;
        $(btnId).textContent = 'Load More';
        $(btnId).disabled = false;
        $(btnId).classList.toggle('hidden', !State[hasMoreKey]);
    }
}

async function renderCharacterKills(type) {
    const listKey = type === 'kills' ? 'characterKills' : 'characterLosses';
    const gridId = type === 'kills' ? 'charKillsGrid' : 'charLossesGrid';
    const emptyId = type === 'kills' ? 'charKillsEmpty' : 'charLossesEmpty';
    const btnId = type === 'kills' ? 'charKillsLoadMore' : 'charLossesLoadMore';
    const countId = type === 'kills' ? 'charKillsCount' : 'charLossesCount';
    const hasMoreKey = type === 'kills' ? 'characterKillsHasMore' : 'characterLossesHasMore';
    const grid = $(gridId);
    grid.innerHTML = '';
    const list = State[listKey].slice();
    applySort(list);
    $(countId).textContent = State[listKey].length.toLocaleString();
    if (!list.length) {
        $(emptyId).classList.remove('hidden');
        $(btnId).classList.add('hidden');
        return;
    }
    $(emptyId).classList.add('hidden');
    await batchResolveKillIds(list);
    const frag = document.createDocumentFragment();
    for (const kd of list) {
        frag.appendChild(await renderKillCard(kd));
    }
    grid.appendChild(frag);
    $(btnId).classList.toggle('hidden', !State[hasMoreKey]);
}

function renderCharacterInfo(data) {
    const info = data.info || {};
    const name = info.name || State.characterName;
    const entityId = info.id || State.characterId;
    const type = State.entityType || 'character';
    const prefix = zkbEntityPrefix(type);
    const corpId = info.corporation_id || info.corporationID;
    const allyId = info.alliance_id || info.allianceID;
    const sec = info.security_status;
    const birthday = info.birthday;
    const memberSince = birthday ? new Date(birthday).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
    const typeLabel = type === 'character' ? 'Pilot' : type === 'corporation' ? 'Corporation' : 'Alliance';
    let portraitHtml;
    if (type === 'character') {
        portraitHtml = `<img src="${charPortrait(entityId, 128)}" alt="" loading="lazy">`;
    } else if (type === 'corporation') {
        portraitHtml = `<img src="${corpLogo(entityId, 128)}" alt="" loading="lazy">`;
    } else {
        portraitHtml = `<img src="${allyLogo(entityId, 128)}" alt="" loading="lazy">`;
    }
    $('charInfo').innerHTML = `
        <div class="char-portrait">
            ${portraitHtml}
            <div class="char-sec-status ${secClass(sec)}">${sec != null ? sec.toFixed(1) : '?'}</div>
        </div>
        <div class="char-id-details">
            <div class="char-name">${escapeHtml(name)}</div>
            <div class="char-type-label">${typeLabel}</div>
            ${type === 'character' ? `
            <div class="char-corp">
                <img src="${corpLogo(corpId, 32)}" alt="" loading="lazy" onerror="this.style.display='none'">
                <span id="charCorpName">${getEntityName(corpId)}</span>
            </div>` : ''}
            ${type === 'character' && allyId ? `<div class="char-ally">
                <img src="${allyLogo(allyId, 32)}" alt="" loading="lazy" onerror="this.style.display='none'">
                <span id="charAllyName">${getEntityName(allyId)}</span>
            </div>` : ''}
            ${memberSince ? `<div class="char-born"><i class="far fa-calendar-alt"></i> Member since ${memberSince}</div>` : ''}
            <a href="https://zkillboard.com/${prefix}/${entityId}/" target="_blank" rel="noopener" class="char-zkb-link">
                <i class="fas fa-external-link-alt"></i> zKillboard
            </a>
        </div>
    `;
}

function renderCharacterStats(data) {
    const destroyed = data.iskDestroyed || 0;
    const lost = data.iskLost || 0;
    const efficiency = (destroyed + lost) > 0 ? (destroyed / (destroyed + lost)) * 100 : 0;
    const kills = data.shipsDestroyed || 0;
    const losses = data.shipsLost || 0;
    const soloPct = data.soloRatio != null ? data.soloRatio : (data.soloKills || 0) / (kills || 1) * 100;
    const pointsDestroyed = data.pointsDestroyed || 0;
    const pointsLost = data.pointsLost || 0;
    $('charStats').innerHTML = `
        <div class="stat-card stat-kills">
            <div class="stat-label">Kills</div>
            <div class="stat-value">${kills.toLocaleString()}</div>
            <div class="stat-sub">${(data.attackersDestroyed || 0).toLocaleString()} attackers destroyed</div>
        </div>
        <div class="stat-card stat-losses">
            <div class="stat-label">Losses</div>
            <div class="stat-value">${losses.toLocaleString()}</div>
            <div class="stat-sub">${(data.attackersLost || 0).toLocaleString()} attackers lost</div>
        </div>
        <div class="stat-card stat-iskd">
            <div class="stat-label">ISK Destroyed</div>
            <div class="stat-value">${fmtIsk(destroyed)}</div>
            <div class="stat-sub">${fmtIsk(data.iskDestroyedSolo || 0)} solo</div>
        </div>
        <div class="stat-card stat-iskl">
            <div class="stat-label">ISK Lost</div>
            <div class="stat-value">${fmtIsk(lost)}</div>
            <div class="stat-sub">${fmtIsk(data.iskLostSolo || 0)} solo</div>
        </div>
        <div class="stat-card stat-eff">
            <div class="stat-label">Loot Fairy rating</div>
            <div class="stat-value">${efficiency.toFixed(1)}%</div>
            <div class="stat-sub">${data.dangerRatio != null ? `Danger ${data.dangerRatio}%` : ''}</div>
        </div>
        <div class="stat-card stat-solo">
            <div class="stat-label">Solo</div>
            <div class="stat-value">${soloPct.toFixed(1)}%</div>
            <div class="stat-sub">${data.soloKills || 0} solo kills</div>
        </div>
    `;
}

function r2z2ToKillData(raw) {
    const e = raw.esi;
    const z = raw.zkb;
    const result = {
        killmail_id: raw.killmail_id,
        hash: z.hash,
        killmail_time: e?.killmail_time || raw.killmail_time,
        solar_system_id: e?.solar_system_id || raw.solar_system_id,
        victim: e?.victim || raw.victim,
        attackers: e?.attackers || raw.attackers,
        totalValue: z.totalValue,
        fittedValue: z.fittedValue,
        droppedValue: z.droppedValue,
        destroyedValue: z.destroyedValue,
        attackerCount: z.attackerCount,
    };
    if (!result.solar_system_id) {
        console.warn('[r2z2] solar_system_id MISSING for', result.killmail_id, '| esi has solar_system_id:', !!e?.solar_system_id, '| raw has:', !!raw.solar_system_id);
    }
    return result;
}

async function renderKillCard(kd) {
    if (!kd.solar_system_id) console.warn('[render] kd.solar_system_id is', kd.solar_system_id, 'for kill', kd.killmail_id, '| victim char:', kd.victim?.character_id);
    await resolveKillIds({ victim: kd.victim, attackers: kd.attackers, solar_system_id: kd.solar_system_id });
    const v = kd.victim;
    const rat = efficiencyRating(kd.droppedValue, kd.totalValue);
    const sec = getSysSec(kd.solar_system_id);

    const card = document.createElement('div');
    card.className = 'kill-card' + (kd.solar_system_id ? '' : ' loading-location');
    const sysHtml = kd.solar_system_id
        ? `<span class="sec-badge ${secClass(sec)}">${fmtSec(sec)}</span> ${escapeHtml(getSysName(kd.solar_system_id))}`
        : '<span class="loc-loading">Loading...</span>';
    const shipIcon = v.ship_type_id
        ? `<img src="${shipIconUrl(v.ship_type_id)}" loading="lazy">`
        : '<i class="fas fa-question"></i>';
    const charName = v.character_id ? escapeHtml(getEntityName(v.character_id)) : 'Unknown Pilot';
    card.innerHTML = `
        <div class="kill-card-top">
            <div class="kill-card-ship">${shipIcon}</div>
            <div class="kill-card-info">
                <div class="kill-card-ship-name">${v.ship_type_id ? escapeHtml(getTypeName(v.ship_type_id)) : 'Unknown Ship'}</div>
                <div class="kill-card-victim">${charName}</div>
            </div>
            <div class="kill-card-value">
                <div class="value-display">${fmtIsk(kd.totalValue)}</div>
                <span class="rating-badge ${rat.cls}">Loot Fairy ${rat.label}</span>
            </div>
        </div>
        <div class="kill-card-bottom">
            <div class="kill-card-system">${sysHtml}</div>
            <div class="kill-card-time"><i class="far fa-clock"></i> ${fmtTime(kd.killmail_time)}</div>
        </div>
    `;
    card.dataset.killId = kd.killmail_id;
    card.onclick = () => showKillDetail(kd);
    return card;
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
}

function matchesSearch(kd) {
    const q = State.searchQuery;
    if (!q) return true;
    if (kd.victim) {
        if (getEntityName(kd.victim.character_id).toLowerCase().includes(q)) return true;
        if (getTypeName(kd.victim.ship_type_id).toLowerCase().includes(q)) return true;
    }
    if (kd.solar_system_id && getSysName(kd.solar_system_id).toLowerCase().includes(q)) return true;
    if (kd.attackers) {
        for (const a of kd.attackers) {
            if (a.character_id && getEntityName(a.character_id).toLowerCase().includes(q)) return true;
        }
    }
    return false;
}

function applySort(list) {
    const s = State.sortBy;
    if (s === 'date') {
        list.sort((a, b) => new Date(b.killmail_time) - new Date(a.killmail_time));
    } else if (s === 'isk') {
        list.sort((a, b) => b.totalValue - a.totalValue);
    } else if (s === 'ship') {
        list.sort((a, b) => {
            const sa = getEntityName(a.victim?.ship_type_id) || '';
            const sb = getEntityName(b.victim?.ship_type_id) || '';
            return sa.localeCompare(sb);
        });
    } else if (s === 'system') {
        list.sort((a, b) => {
            const sa = getEntityName(a.solar_system_id) || '';
            const sb = getEntityName(b.solar_system_id) || '';
            return sa.localeCompare(sb);
        });
    }
}

function filterKills() {
    let list = State.allKills;
    const window = rangeWindow(State.timeRange);
    list = list.filter(k => isWithin(k, window));
    const topKillIds = new Set(State.topKills.map(k => k.killmail_id));
    return list.filter(k => {
        if (k.totalValue < State.minValue) return false;
        if (!matchesSearch(k)) return false;
        if (topKillIds.has(k.killmail_id)) return false;
        // Security filter
        if (State.filterSec !== 'all') {
            const sec = getSysSec(k.solar_system_id);
            if (State.filterSec === 'high' && (sec == null || sec < 0.5)) return false;
            if (State.filterSec === 'low' && (sec == null || sec < 0.1 || sec >= 0.5)) return false;
            if (State.filterSec === 'null' && (sec == null || sec >= 0.1)) return false;
            if (State.filterSec === 'wormhole' && sec != null) return false;
        }
        // Attacker count filter
        if (State.filterAttackers !== 'all') {
            const count = k.attackerCount || 0;
            if (State.filterAttackers === 'solo' && count !== 1) return false;
            if (State.filterAttackers === 'small' && (count < 2 || count > 5)) return false;
            if (State.filterAttackers === 'fleet' && (count < 6 || count > 10)) return false;
            if (State.filterAttackers === 'large' && count < 11) return false;
        }
        return true;
    });
}

async function batchResolveKillIds(kills) {
    const allIds = { chars: new Set(), types: new Set(), systems: new Set() };
    for (const kd of kills) {
        if (kd._resolved) continue; // already pre-resolved on server
        const v = kd.victim;
        if (v) {
            if (v.character_id) allIds.chars.add(v.character_id);
            if (v.corporation_id) allIds.chars.add(v.corporation_id);
            if (v.alliance_id) allIds.chars.add(v.alliance_id);
            if (v.ship_type_id) allIds.types.add(v.ship_type_id);
            if (v.items) v.items.forEach(i => { if (i.item_type_id) allIds.types.add(i.item_type_id); });
        }
        if (kd.attackers) kd.attackers.forEach(a => {
            if (a.character_id) allIds.chars.add(a.character_id);
            if (a.corporation_id) allIds.chars.add(a.corporation_id);
            if (a.ship_type_id) allIds.types.add(a.ship_type_id);
            if (a.weapon_type_id) allIds.types.add(a.weapon_type_id);
        });
        if (kd.solar_system_id) allIds.systems.add(kd.solar_system_id);
    }
    await Promise.all([
        fetchNames([...allIds.chars]),
        fetchTypes([...allIds.types]),
        fetchSystems([...allIds.systems]),
    ]);
}

async function renderFeed() {
    let filtered;
    const topKillIds = new Set(State.topKills.map(k => k.killmail_id));
    if (State.searchMode) {
        filtered = State.searchResults.filter(k => k.totalValue >= State.minValue && matchesSearch(k) && !topKillIds.has(k.killmail_id));
    } else {
        filtered = filterKills();
    }
    applySort(filtered);
    State.kills = filtered;
    const grid = $('killGrid');
    grid.innerHTML = '';
    if (!filtered.length) {
        $('feedEmpty').classList.remove('hidden');
        $('resultCount').textContent = '0 kills';
        $('loadMoreBtn').classList.add('hidden');
        return;
    }
    $('feedEmpty').classList.add('hidden');
    // Resolve all IDs in batch before rendering (avoids per-card API calls)
    await batchResolveKillIds(filtered);
    const frag = document.createDocumentFragment();
    for (const kd of filtered) frag.appendChild(await renderKillCard(kd));
    grid.appendChild(frag);
    const label = State.searchMode ? 'zKillboard' : `${State.timeRange}m`;
    $('resultCount').textContent = `${filtered.length} kills (${label})`;

    if (State.searchMode) {
        if (State.searchHasMore) {
            $('loadMoreBtn').classList.remove('hidden');
            $('loadMoreBtn').textContent = 'Load More';
        } else {
            $('loadMoreBtn').classList.add('hidden');
        }
    } else {
        $('loadMoreBtn').classList.add('hidden');
    }
}

function pushAllKills(kd) {
    const idx = State.allKills.findIndex(k => k.killmail_id === kd.killmail_id);
    if (idx !== -1) {
        State.allKills[idx] = kd;
    } else {
        State.allKills.unshift(kd);
        if (State.allKills.length > 500) State.allKills.pop();
    }
}

async function loadFeed(count = 100) {
    if (State.loading) return;
    State.loading = true;
    $('feedLoading').classList.remove('hidden');
    try {
        let kills = [];
        if (!IS_FILE) {
            // Load from shared server pool — both browsers see the same kills
            const since = State.timeRange;
            const params = new URLSearchParams({ since, minValue: State.minValue });
            const poolUrl = API_HOST + BASE_PATH + '/api/kills/recent?' + params;
            const raw = await apiFetch(poolUrl);
            kills = (raw || []).slice(0, count).map(pkg => makeKd(pkg));
            console.log('[loadFeed] Got', kills.length, 'kills from shared pool');
        } else {
            const raw = await apiFetch(zkbUrl('/kills/'));
            console.log('[loadFeed] Got', raw.length, 'raw kills from zKB');
            const enriched = await enrichZkbWithEsi(raw.slice(0, count));
            kills = enriched.map(r2z2ToKillData);
            console.log('[loadFeed] Enriched', kills.length, 'kills');
        }
        for (const kd of kills) {
            pushAllKills(kd);
        }
        console.log('[loadFeed] allKills now:', State.allKills.length);
        State.maxSeenId = Math.max(...State.allKills.map(k => k.killmail_id));
        console.log('[loadFeed] maxSeenId set to', State.maxSeenId);
        await renderFeed();
    } catch (e) {
        console.error('[loadFeed] ERROR:', e.message, e);
        showToast('Failed to load kills: ' + e.message, 'error');
    } finally {
        State.loading = false;
        $('feedLoading').classList.add('hidden');
    }
}

function topKillsFromCache() {
    try {
        const raw = localStorage.getItem(TOP_KILLS_CACHE);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() - data.timestamp > TOP_KILLS_EXPIRY) {
            localStorage.removeItem(TOP_KILLS_CACHE);
            return null;
        }
        return data.kills;
    } catch { return null; }
}

function topKillsSaveCache(kills) {
    try {
        localStorage.setItem(TOP_KILLS_CACHE, JSON.stringify({ kills, timestamp: Date.now() }));
    } catch (e) { console.warn('[topKills] Failed to save cache:', e.message); }
}

async function loadTopKills() {
    const cached = topKillsFromCache();
    if (cached) {
        State.topKills = cached;
        State.topKillsLoaded = true;
        renderTopKills();
        console.log('[topKills] Loaded', cached.length, 'from cache');
        return;
    }
    // Scan already-loaded kills for big ones
    let candidates = State.allKills.filter(k => k.totalValue >= TOP_KILLS_MIN);
    // If not enough, fetch more from the shared pool or zKB API
    if (candidates.length < TOP_KILLS_MAX) {
        try {
            let more = [];
            if (!IS_FILE) {
                const poolUrl = API_HOST + BASE_PATH + '/api/kills/recent?since=120';
                const raw = await apiFetch(poolUrl);
                more = (raw || []).map(pkg => makeKd(pkg));
            } else {
                const raw = await apiFetch(zkbUrl('/kills/'));
                if (raw && raw.length) {
                    const enriched = await enrichZkbWithEsi(raw);
                    more = enriched.map(r2z2ToKillData);
                }
            }
            for (const kd of more) {
                pushAllKills(kd);
            }
            candidates = State.allKills.filter(k => k.totalValue >= TOP_KILLS_MIN);
        } catch (e) {
            console.warn('[topKills] Fetch failed:', e.message);
        }
    }
    const kills = candidates
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, TOP_KILLS_MAX);
    if (kills.length) {
        State.topKills = kills;
        State.topKillsLoaded = true;
        topKillsSaveCache(kills);
        renderTopKills();
        console.log('[topKills] Loaded', kills.length, 'from feed');
    }
}

function removeTopKillsFromGrid() {
    const topKillIds = new Set(State.topKills.map(k => k.killmail_id));
    const grid = $('killGrid');
    State.kills = State.kills.filter(k => !topKillIds.has(k.killmail_id));
    const cards = grid.querySelectorAll('.kill-card');
    for (const card of cards) {
        if (topKillIds.has(Number(card.dataset.killId))) {
            card.remove();
        }
    }
    const label = State.searchMode ? 'zKillboard' : `${State.timeRange}m`;
    $('resultCount').textContent = `${State.kills.length} kills (${label})`;
}

function renderTopKills() {
    const section = $('topKillsSection');
    const grid = $('topKillsGrid');
    grid.innerHTML = '';
    if (!State.topKills.length) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    $('topKillsTimer').textContent = fmtTime(State.topKills[0]?.killmail_time);
    for (const kd of State.topKills) {
        renderKillCard(kd).then(card => {
            card.classList.add('top-kill-card');
            grid.appendChild(card);
        });
    }
    removeTopKillsFromGrid();
}

function topKillsCheck(kd) {
    if (kd.totalValue < TOP_KILLS_MIN) return;
    const exists = State.topKills.find(k => k.killmail_id === kd.killmail_id);
    if (exists) return;
    State.topKills.push(kd);
    State.topKills.sort((a, b) => b.totalValue - a.totalValue);
    if (State.topKills.length > TOP_KILLS_MAX) State.topKills.pop();
    topKillsSaveCache(State.topKills);
    renderTopKills();
}

function makeKd(pkg) {
    return {
        killmail_id: pkg.killID,
        hash: pkg.zkb?.hash || '',
        killmail_time: pkg.killmail_time || new Date().toISOString(),
        solar_system_id: pkg.solar_system_id,
        victim: pkg.victim || {
            character_id: pkg.character_id,
            corporation_id: pkg.corporation_id,
            alliance_id: pkg.alliance_id,
            ship_type_id: pkg.ship_type_id,
            items: [],
        },
        attackers: pkg.attackers || [],
        totalValue: pkg.zkb?.totalValue || 0,
        fittedValue: pkg.zkb?.fittedValue || 0,
        droppedValue: pkg.zkb?.droppedValue || 0,
        destroyedValue: pkg.zkb?.destroyedValue || 0,
        attackerCount: pkg.zkb?.attackerCount || 0,
        _resolved: pkg._resolved || null,
    };
}

function shouldShow(kd) {
    if (kd.totalValue < State.minValue) return false;
    if (!isWithin(kd, rangeWindow(State.timeRange))) return false;
    if (!matchesSearch(kd)) return false;
    return true;
}

async function syncDisplayKill(kd) {
    const topKillIds = new Set(State.topKills.map(k => k.killmail_id));
    if (topKillIds.has(kd.killmail_id)) return;
    const existingIdx = State.kills.findIndex(k => k.killmail_id === kd.killmail_id);
    const grid = $('killGrid');
    if (existingIdx !== -1) {
        // Already in display — no need to replace (data is from same pool)
        return;
    }
    // Resolve IDs for this single new kill before rendering
    if (!kd._resolved) await batchResolveKillIds([kd]);
    State.kills.unshift(kd);
    const card = await renderKillCard(kd);
    card.classList.add('new-kill-anim');
    grid.insertBefore(card, grid.firstChild);
    if (State.kills.length > 200) State.kills.pop();
    // Hide empty state and update count when first kill arrives
    $('feedEmpty').classList.add('hidden');
    const label = State.searchMode ? 'zKillboard' : `${State.timeRange}m`;
    $('resultCount').textContent = `${State.kills.length} kills (${label})`;
}

async function catchUpPool() {
    if (State.searchMode || State.characterMode) return;
    try {
        const since = State.timeRange;
        const params = new URLSearchParams({ since, minValue: State.minValue });
        const poolUrl = API_HOST + BASE_PATH + '/api/kills/recent?' + params;
        const raw = await apiFetch(poolUrl);
        if (!raw || !raw.length) return;
        const existingIds = new Set(State.allKills.map(k => k.killmail_id));
        let newCount = 0;
        for (const pkg of raw) {
            const id = pkg.killID || pkg.killmail_id;
            if (!existingIds.has(id)) {
                const kd = makeKd(pkg);
                pushAllKills(kd);
                topKillsCheck(kd);
                if (id > State.maxSeenId) {
                    State.maxSeenId = id;
                    if (shouldShow(kd)) await syncDisplayKill(kd);
                }
                newCount++;
            }
        }
        if (newCount > 0) console.log('[catchUpPool] Merged', newCount, 'missed kills');
    } catch (e) {
        if (State._pollRetry < 3) console.warn('[catchUpPool] Error:', e.message);
    }
}

function removeDisplayKill(id) {
    const idx = State.kills.findIndex(k => k.killmail_id === id);
    if (idx !== -1) {
        State.kills.splice(idx, 1);
        const grid = $('killGrid');
        if (grid.children[idx]) grid.children[idx].remove();
        const label = State.searchMode ? 'zKillboard' : `${State.timeRange}m`;
        $('resultCount').textContent = `${State.kills.length} kills (${label})`;
        if (!State.kills.length) $('feedEmpty').classList.remove('hidden');
    }
}

async function pollNewKills() {
    if (!State.pollActive || IS_FILE) return;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new DOMException('RedisQ timed out', 'AbortError')), 10000);
        const response = await fetch(REDISQ_PROXY, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            State._pollRetry = 0;
            const data = await response.json();
            if (data && data.package) {
                const pkg = data.package;
                console.log('[poll] Got kill from RedisQ:', pkg.killID, 'has hash:', !!pkg.zkb?.hash, 'solar_system_id:', pkg.solar_system_id);
                if (pkg.zkb?.hash) {
                    if (pkg.victim && pkg.attackers) {
                        const kd = makeKd(pkg);
                        pushAllKills(kd);
                        topKillsCheck(kd);
                        if (pkg.killID > State.maxSeenId) {
                            State.maxSeenId = pkg.killID;
                            if (shouldShow(kd)) await syncDisplayKill(kd);
                        }
                    } else {
                        const enriched = await enrichZkbWithEsi([{ 
                            killmail_id: pkg.killID, 
                            zkb: { hash: pkg.zkb.hash, locationID: pkg.zkb.locationID, totalValue: pkg.zkb.totalValue, fittedValue: pkg.zkb.fittedValue, droppedValue: pkg.zkb.droppedValue, destroyedValue: pkg.zkb.destroyedValue, attackerCount: pkg.zkb.attackerCount } 
                        }]);
                        if (enriched.length) {
                            const kd = r2z2ToKillData(enriched[0]);
                            pushAllKills(kd);
                            topKillsCheck(kd);
                            if (pkg.killID > State.maxSeenId) {
                                State.maxSeenId = pkg.killID;
                                if (shouldShow(kd)) await syncDisplayKill(kd);
                            }
                        }
                    }
                } else if (pkg.ship_type_id) {
                    const kd = makeKd(pkg);
                    // Skip kills with no verified value (hash missing or 0 ISK) — server should prevent this,
                    // but safeguard in case one slips through
                    if (!kd.totalValue && !pkg.zkb?.hash) {
                        console.log('[poll] Skipping kill', pkg.killID, '— no zKB data yet');
                        return;
                    }
                    pushAllKills(kd);
                    topKillsCheck(kd);
                    if (pkg.killID > State.maxSeenId && shouldShow(kd) && !State.kills.find(k => k.killmail_id === kd.killmail_id)) {
                        State.maxSeenId = pkg.killID;
                        await syncDisplayKill(kd);
                    }
                }
            }
        }
        $('pollStatus').textContent = new Date().toLocaleTimeString();
    } catch (e) {
        if (State._pollRetry < 3 || State._pollRetry % 10 === 0) console.warn('[pollNewKills] RedisQ error:', e.message);
    } finally {
        if (State.pollActive) {
            State._cleanupTicks = (State._cleanupTicks || 0) + 1;
            if (State._cleanupTicks % 10 === 0) {
                const cleanupWindow = rangeWindow(State.timeRange);
                State.allKills = State.allKills.filter(k => isWithin(k, cleanupWindow));
                // Remove expired kills from display individually instead of full re-render
                const cutoff = Date.now() - cleanupWindow;
                const expired = State.kills.filter(k => !isWithin(k, cleanupWindow));
                if (expired.length > 0) {
                    for (const kd of expired) removeDisplayKill(kd.killmail_id);
                }
            }
            if (State._cleanupTicks % 30 === 0) {
                catchUpPool();
            }
            const delay = Math.min(1000 * Math.pow(2, State._pollRetry), 30000);
            State._pollRetry++;
            State._pollTimer = setTimeout(pollNewKills, delay);
        }
    }
}

function startPolling() {
    if (IS_FILE) return;
    State.pollActive = true;
    State._pollRetry = 0;
    pollNewKills(); // Start the first poll immediately
    $('liveIndicator')?.classList.remove('paused');
}

function stopPolling() {
    State.pollActive = false;
    if (State._pollTimer) {
        clearTimeout(State._pollTimer);
        State._pollTimer = null;
    }
}

async function showKillDetail(kd) {
    State.detailKillId = kd.killmail_id;
    $('feedView').classList.add('hidden');
    $('detailView').classList.remove('hidden');
    $('killDetailLoading').classList.remove('hidden');
    $('killDetailContent').innerHTML = '';
    
    try {
        await resolveKillIds(kd);
        renderDetail(kd);
        $('killDetailContent').classList.remove('hidden');
    } catch (e) {
        $('killDetailErrorMsg').textContent = e.message || 'The killmail could not be retrieved.';
        $('killDetailError').classList.remove('hidden');
    } finally {
        $('killDetailLoading').classList.add('hidden');
    }
}

function renderDetail(d) {
    const v = d.victim;
    const items = v.items || [];
    const grouped = {};
    items.forEach(item => {
        const cat = slotCategory(item.flag);
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    const slotLabels = { high: 'High Slots', mid: 'Mid Slots', low: 'Low Slots', rig: 'Rigs', subsystem: 'Subsystems', drone: 'Drones', cargo: 'Cargo' };

    function itemState(item) {
        const dropped = item.quantity_dropped || 0;
        const destroyed = item.quantity_destroyed || 0;
        if (dropped > 0 && destroyed > 0) return '<span class="fit-item-state dropped">Dropped</span><span class="fit-item-state destroyed">Destroyed</span>';
        if (dropped > 0) return '<span class="fit-item-state dropped">Dropped</span>';
        return '<span class="fit-item-state destroyed">Destroyed</span>';
    }

    function totalQty(item) {
        return (item.quantity_dropped || 0) + (item.quantity_destroyed || 0);
    }

    const attackers = d.attackers || [];
    const totalDmg = attackers.reduce((s, a) => s + (a.damage_done || 0), 0);

    const sec = getSysSec(d.solar_system_id);
    const eff = efficiencyRating(d.droppedValue, d.totalValue);
    const effPct = (d.totalValue && d.droppedValue != null) ? ((d.droppedValue / d.totalValue) * 100) : 0;

    $('killDetailContent').innerHTML = `
        <div class="kill-detail">
            <div class="detail-grid">
                <div class="detail-panel victim-panel">
                    <div class="victim-portrait">
                        <img src="${charPortrait(v.character_id, 64)}" alt="" loading="lazy">
                    </div>
                    <div class="victim-info">
                        <div class="victim-name">${escapeHtml(getEntityName(v.character_id))}</div>
                        <div class="victim-corp">
                            ${v.corporation_id ? `<img src="${corpLogo(v.corporation_id, 32)}" alt="" loading="lazy"> ${escapeHtml(getEntityName(v.corporation_id))}` : ''}
                        </div>
                        <div class="victim-alliance">
                            ${v.alliance_id ? `<img src="${allyLogo(v.alliance_id, 32)}" alt="" loading="lazy"> ${escapeHtml(getEntityName(v.alliance_id))}` : ''}
                        </div>
                    </div>
                </div>

                <div class="detail-panel ship-panel">
                    <div class="ship-render">
                        <img src="${shipRenderUrl(v.ship_type_id)}" alt="" loading="lazy">
                    </div>
                    <div class="ship-info">
                        <div class="ship-name">${escapeHtml(getTypeName(v.ship_type_id))}</div>
                    </div>
                </div>

                <div class="detail-panel full-width location-panel">
                    <div class="location-system">
                        <i class="fas fa-map-marker-alt"></i>
                        ${d.solar_system_id
                            ? `<span class="sys-name">${escapeHtml(getSysName(d.solar_system_id))}</span><span class="sec-badge ${secClass(sec)}">${fmtSec(sec)}</span>`
                            : '<span class="loc-loading">Location pending...</span>'}
                    </div>
                    <div class="location-time">
                        <i class="far fa-clock"></i> ${fmtDate(d.killmail_time)}
                    </div>
                </div>

                <div class="detail-panel full-width">
                    <div class="value-grid">
                        <div class="value-card val-fitted">
                            <div class="val-label">Fitted</div>
                            <div class="val-amount">${fmtIsk(d.fittedValue)}</div>
                        </div>
                        <div class="value-card val-dropped">
                            <div class="val-label">Dropped</div>
                            <div class="val-amount">${fmtIsk(d.droppedValue)}</div>
                        </div>
                        <div class="value-card val-destroyed">
                            <div class="val-label">Destroyed</div>
                            <div class="val-amount">${fmtIsk(d.destroyedValue)}</div>
                        </div>
                        <div class="value-card val-total">
                            <div class="val-label">Total</div>
                            <div class="val-amount">${fmtIsk(d.totalValue)}</div>
                        </div>
                    </div>
                    <div class="efficiency-section">
                        <div class="efficiency-bar-wrap">
                            <div class="efficiency-bar-label">
                                <span>Efficiency</span>
                                <span>${effPct.toFixed(1)}% (${eff.label})</span>
                            </div>
                            <div class="efficiency-bar">
                                <div class="fill" style="width: ${Math.min(effPct, 100)}%"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="detail-panel full-width fit-section">
                    <h3><i class="fas fa-cubes"></i> Fitted Modules</h3>
                    <div class="fit-slots">
                        ${['high', 'mid', 'low', 'rig', 'subsystem', 'drone', 'cargo'].filter(cat => grouped[cat]).map(cat => `
                            <div class="fit-slot-group">
                                <div class="fit-slot-header ${cat}">${slotLabels[cat]}</div>
                                ${grouped[cat].map(i => `
                                    <div class="fit-item">
                                        <div class="fit-item-icon">
                                            <img src="${shipIconUrl(i.item_type_id)}" alt="" loading="lazy">
                                        </div>
                                        <div class="fit-item-info">
                                            <div class="fit-item-name">${escapeHtml(getTypeName(i.item_type_id))}</div>
                                            <div class="fit-item-qty">x${totalQty(i)}</div>
                                        </div>
                                        ${itemState(i)}
                                        <div class="fit-item-value">&mdash;</div>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="detail-panel full-width">
                    <h3 style="margin-bottom:12px;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-secondary);display:flex;align-items:center;gap:8px"><i class="fas fa-users" style="color:var(--accent)"></i> Attackers (${attackers.length})</h3>
                    <table class="attackers-table">
                        <thead>
                            <tr>
                                <th>Character</th>
                                <th>Ship</th>
                                <th>Damage</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${attackers.map(a => {
                                const pct = totalDmg ? ((a.damage_done || 0) / totalDmg * 100) : 0;
                                return `
                                    <tr>
                                        <td>
                                            <div class="attacker-char">
                                                ${a.character_id ? `<div class="attacker-portrait"><img src="${charPortrait(a.character_id, 64)}" alt="" loading="lazy"></div>` : '<div class="attacker-portrait" style="background:var(--bg-tertiary)"><i class="fas fa-question" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--text-muted);font-size:12px"></i></div>'}
                                                <div>
                                                    <div class="attacker-name">${a.character_id ? escapeHtml(getEntityName(a.character_id)) : 'Unknown'}</div>
                                                    ${a.corporation_id ? `<span class="attacker-corp">${escapeHtml(getEntityName(a.corporation_id))}</span>` : ''}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="attacker-ship">
                                                ${a.ship_type_id ? `<img src="${shipIconUrl(a.ship_type_id)}" alt="" loading="lazy"> <span>${escapeHtml(getTypeName(a.ship_type_id))}</span>` : '<span>&mdash;</span>'}
                                            </div>
                                        </td>
                                        <td>
                                            <div class="dmg-bar-wrap">
                                                <div class="dmg-bar">
                                                    <div class="fill ${a.final_blow ? 'final-blow' : 'normal'}" style="width:${pct}%"></div>
                                                </div>
                                                <span class="dmg-pct">${pct.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td>${a.final_blow ? '<span class="final-blow-badge"><i class="fas fa-crosshairs"></i> Final</span>' : ''}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="detail-panel full-width actions-bar">
                    <a class="ext-link" href="https://zkillboard.com/kill/${d.killmail_id}/" target="_blank" rel="noopener">
                        <i class="fas fa-external-link-alt"></i> View on zKillboard
                    </a>
                    <button class="ext-link" onclick="copyKillLink(${d.killmail_id})">
                        <i class="fas fa-link"></i> Copy Link
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function init() {
    if (IS_FILE) {
        showToast('Running in local file mode. Kill feed will be static.', 'error');
    }
    await loadFeed(20);
    await loadTopKills();
    startPolling();

    const killParam = new URLSearchParams(window.location.search).get('kill');
    if (killParam) {
        const id = parseInt(killParam, 10);
        if (id) {
            const existing = State.allKills.find(k => k.killmail_id === id);
            if (existing) {
                showKillDetail(existing);
            } else {
                try {
                    const raw = await apiFetch(zkbUrl('/killID/' + id + '/'));
                    if (raw && raw.length) {
                        const enriched = await enrichZkbWithEsi(raw);
                        if (enriched.length) {
                            const kd = r2z2ToKillData(enriched[0]);
                            pushAllKills(kd);
                            showKillDetail(kd);
                            return;
                        }
                    }
                } catch (e) { console.warn('[deepLink] Failed to fetch kill', id, ':', e.message); }
                showToast('Kill not found', 'error');
            }
        }
    }
}

function showToast(msg, type) {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

function copyKillLink(killId) {
    const url = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '') + '/?kill=' + killId;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Kill link copied!', 'success');
    }).catch(() => {
        showToast('Failed to copy link', 'error');
    });
}

console.log('[Killboard] app.js loaded, version 25');
document.addEventListener('DOMContentLoaded', init);

$('backToFeed').onclick = () => {
    $('detailView').classList.add('hidden');
    $('feedView').classList.remove('hidden');
};

$('refreshBtn').onclick = () => loadFeed(20);

$('liveIndicator').onclick = () => {
    State.pollActive = !State.pollActive;
    if (State.pollActive) startPolling(); else stopPolling();
    $('liveIndicator').classList.toggle('paused', !State.pollActive);
};

$('filterTime').onchange = () => {
    State.timeRange = Number($('filterTime').value);
    if (State.searchMode) exitSearchMode();
    loadFeed(20);
};

$('minValue').onchange = () => {
    State.minValue = Number($('minValue').value);
    loadFeed(20);
};

$('filterSec').onchange = () => {
    State.filterSec = $('filterSec').value;
    renderFeed();
};

$('filterAttackers').onchange = () => {
    State.filterAttackers = $('filterAttackers').value;
    renderFeed();
};

$('filterSort').onchange = () => {
    State.sortBy = $('filterSort').value;
    renderFeed();
};

$('retryBtn').onclick = () => {
    $('feedError').classList.add('hidden');
    loadFeed(20);
};

$('loadMoreBtn').onclick = () => {
    if (State.searchMode) {
        loadMoreSearchResults();
    } else {
        loadFeed(20);
    }
};

$('retryDetailBtn').onclick = () => {
    $('killDetailError').classList.add('hidden');
    if (State.detailKillId) {
        const kd = State.kills.find(k => k.killmail_id === State.detailKillId);
        if (kd) showKillDetail(kd);
    }
};

// Time range is now controlled by #filterTime dropdown

let autoTimer = null;
function hideSuggestions() {
    $('searchSuggestions').classList.add('hidden');
    $('searchSuggestions').innerHTML = '';
}
function showNoResults() {
    $('searchSuggestions').innerHTML = '<div class="suggestion-no-results"><i class="fas fa-search"></i> No results found</div>';
    $('searchSuggestions').classList.remove('hidden');
}

async function fetchSuggestions(query) {
    if (query.length < 2) { hideSuggestions(); return; }
    const htmlParts = [];
    try {
        // Fetch all categories in parallel
        const [idsRes, sysRes, shipRes] = await Promise.all([
            fetch(`${ESI}/universe/ids/`, {
                method: 'POST',
                headers: { 'User-Agent': AGENT, 'Content-Type': 'application/json' },
                body: JSON.stringify([query]),
            }),
            fetch(`${API_HOST}${BASE_PATH}/api/autocomplete/systems?q=${encodeURIComponent(query)}`),
            fetch(`${ESI}/search/?categories=inventory_type&search=${encodeURIComponent(query)}&strict=false`),
        ]);
        // Parse characters/corps/alliances
        if (idsRes.ok) {
            const idsData = await idsRes.json();
            for (const [key, label, icon] of [['characters', 'Pilot', (id) => `<img src="${charPortrait(id, 32)}" alt="">`],
                                               ['corporations', 'Corp', () => '<i class="fas fa-building"></i>'],
                                               ['alliances', 'Ally', () => '<i class="fas fa-flag"></i>']]) {
                const items = idsData[key] || [];
                for (const c of items.slice(0, 5)) {
                    htmlParts.push(`<div class="suggestion-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-cat="${label.toLowerCase()}">
                        <div class="sug-icon">${typeof icon === 'function' ? icon(c.id) : ''}</div>
                        <div class="sug-name">${escapeHtml(c.name)}</div>
                        <div class="sug-cat">${label}</div>
                    </div>`);
                }
            }
        }
        // Parse systems
        if (sysRes.ok) {
            const sysData = await sysRes.json();
            for (const s of (sysData || []).slice(0, 5)) {
                htmlParts.push(`<div class="suggestion-item" data-id="${s.id}" data-name="${escapeHtml(s.name)}" data-cat="system">
                    <div class="sug-icon"><i class="fas fa-globe"></i></div>
                    <div class="sug-name">${escapeHtml(s.name)}</div>
                    <div class="sug-cat">System</div>
                </div>`);
            }
        }
        // Parse ships (ESI returns 404 when no matches — treat as empty)
        if (shipRes.ok || shipRes.status === 404) {
            if (shipRes.ok) {
                const shipData = await shipRes.json();
                const shipIds = (shipData.inventory_type || []).slice(0, 5);
                if (shipIds.length) {
                    await fetchTypes(shipIds);
                    for (const id of shipIds) {
                        htmlParts.push(`<div class="suggestion-item" data-id="${id}" data-name="${escapeHtml(getTypeName(id))}" data-cat="ship">
                            <div class="sug-icon"><img src="${shipIconUrl(id)}" alt=""></div>
                            <div class="sug-name">${escapeHtml(getTypeName(id))}</div>
                            <div class="sug-cat">Ship</div>
                        </div>`);
                    }
                }
            }
        }
    } catch { /* ignore errors, show whatever we have */ }
    if (htmlParts.length) {
        $('searchSuggestions').innerHTML = htmlParts.join('');
        $('searchSuggestions').classList.remove('hidden');
    } else {
        showNoResults();
    }
}

$('searchSuggestions').onclick = (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    const name = item.dataset.name;
    const id = item.dataset.id;
    const cat = item.dataset.cat;
    $('searchInput').value = name;
    hideSuggestions();
    doSearch(name, id, cat);
};

// Search disabled until rework is complete
document.querySelector('.search-container').classList.add('search-disabled');
$('searchInput').disabled = true;
$('searchInput').placeholder = 'Search disabled — coming soon';

$('searchInput').oninput = () => {
    State.searchQuery = $('searchInput').value;
    renderFeed();
    clearTimeout(autoTimer);
    const val = $('searchInput').value.trim();
    if (val.length >= 2) {
        autoTimer = setTimeout(() => fetchSuggestions(val), 300);
    } else {
        hideSuggestions();
    }
};

$('searchInput').onblur = () => {
    setTimeout(hideSuggestions, 200);
};

$('searchInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = $('searchInput').value.trim();
        if (!val) return;
        // If suggestions visible, pick first one
        const first = $('searchSuggestions').querySelector('.suggestion-item');
        if (first) {
            $('searchInput').value = first.dataset.name;
            hideSuggestions();
            doSearch(first.dataset.name, first.dataset.id, first.dataset.cat);
        } else {
            findAndSearch(val);
        }
    }
};

$('searchZkbBtn').onclick = () => {
    const val = $('searchInput').value.trim();
    if (!val) {
        showToast('Enter a name to search', 'error');
        return;
    }
    const first = $('searchSuggestions').querySelector('.suggestion-item');
    if (first) {
        $('searchInput').value = first.dataset.name;
        hideSuggestions();
        doSearch(first.dataset.name, first.dataset.id, first.dataset.cat);
    } else {
        findAndSearch(val);
    }
};

$('backFromCharBtn').onclick = exitCharacterView;
$('charSearchAgainBtn').onclick = () => {
    exitCharacterView();
    $('searchInput').focus();
};
$('retryCharBtn').onclick = () => {
    if (State.characterId && State.entityType) showEntity(State.characterId, State.characterName, State.entityType);
};
$('charKillsLoadMore').onclick = () => loadMoreCharacterKills('kills');
$('charLossesLoadMore').onclick = () => loadMoreCharacterKills('losses');
