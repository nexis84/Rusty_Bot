(function () {
  'use strict';

  const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = IS_LOCAL ? '/api' : 'https://rusty-bot-api.onrender.com/api';
  const EVE_SSO_REDIRECT_URI = IS_LOCAL
    ? window.location.origin + '/api/auth/eve/callback'
    : 'https://rusty-bot-api.onrender.com/api/auth/eve/callback';
  const EVE_SSO_URL = 'https://login.eveonline.com/v2/oauth/authorize/';
  let ssoClientId = null;
  const EVE_SCOPE_SKINR = 'publicData esi.cosmetic.char:read';
  const EVE_SCOPE_PUBLIC = 'publicData';
  const SCOPE_OK_KEY = 'skinr_v2_scope_ok';

  const SDE = '../sde/';
  const SDE_FILES = ['skinrComponents', 'skinrComponentRarities', 'skinrComponentCategories', 'skinrSlots'];

  const BLEND_MODES = { normal: 'Normal', subtract: 'Subtract', exclusion: 'Exclusion', nested: 'Nested', nested_inverted: 'Nested Inverted' };

  let currentUser = null;
  let currentTab = 'licenses';
  let sde = {};
  let licenseCache = null;      // owned SKINr licenses (per session)
  let licenseEtag = null;
  let componentCache = null;    // owned component licenses (per session)
  let componentEtag = null;
  let skinrDetailCache = {};    // skinr_id -> attributes
  let namesCache = {};          // id -> { name, category }
  let scopeOk = false;          // whether the esi.cosmetic.char:read scope was granted

  const $ = id => document.getElementById(id);
  const tabs = { licenses: $('tab-licenses'), components: $('tab-components'), lookup: $('tab-lookup') };
  const navBtns = { licenses: $('nav-licenses'), components: $('nav-components'), lookup: $('nav-lookup') };

  function escapeHtml(str) {
    if (typeof str !== 'string' && typeof str !== 'number') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function showToast(msg, type) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast ' + (type || '');
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  /* ==================== SDE ==================== */

  async function fetchJsonl(name) {
    const res = await fetch(`${SDE}${name}.jsonl`);
    const text = await res.text();
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  function byKey(arr) {
    const map = {};
    for (const item of arr) map[item._key] = item;
    return map;
  }

  async function loadSde() {
    const [comps, rarities, cats, slots] = await Promise.all(SDE_FILES.map(f => fetchJsonl(f)));
    sde.components = byKey(comps.filter(c => c.published !== false));
    sde.componentsByTypeId = {};
    for (const comp of comps) {
      if (comp.associatedTypeIds) {
        for (const a of comp.associatedTypeIds) {
          sde.componentsByTypeId[a.typeID] = comp;
        }
      }
    }
    sde.rarities = byKey(rarities);
    sde.categories = byKey(cats);
    sde.slots = byKey(slots);
  }

  function slotName(id) {
    const s = sde.slots[id];
    return s ? s.name.en : `Slot ${id}`;
  }

  function componentForId(id) {
    return sde.components[id] || sde.componentsByTypeId[id] || null;
  }

  function rarityName(id) {
    const r = sde.rarities[id];
    return r ? r.name.en : `Rarity ${id}`;
  }

  function parseSwatchColor(iconFile) {
    if (!iconFile) return null;
    const m = iconFile.match(/(\d{3})_(\d{3})_(\d{3})/);
    if (!m) return null;
    const h = parseInt(m[1]) / 100 * 360;
    const s = parseInt(m[2]) / 100 * 100;
    const l = parseInt(m[3]) / 100 * 100;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /* ==================== AUTH ==================== */

  function loadAuth() {
    try {
      const raw = sessionStorage.getItem('skinr_v2_user');
      if (raw) currentUser = JSON.parse(raw);
    } catch (e) { currentUser = null; }
  }

  function saveAuth(user) {
    currentUser = user;
    if (user) sessionStorage.setItem('skinr_v2_user', JSON.stringify(user));
    else sessionStorage.removeItem('skinr_v2_user');
  }

  function tokenExpired() {
    return currentUser && currentUser.expires_at && Date.now() > currentUser.expires_at;
  }

  function updateAuthUI() {
    const area = $('auth-area');
    if (currentUser) {
      const expired = tokenExpired();
      area.innerHTML =
        '<span class="user-info">Logged in as <strong>' + escapeHtml(currentUser.character_name) + '</strong></span>' +
        (expired ? '<button class="auth-btn" onclick="SkinrV2.login()">Re-login</button>' : '<button class="auth-btn" onclick="SkinrV2.logout()">Logout</button>');
    } else {
      area.innerHTML =
        '<span class="auth-note">Log in to view your owned SKINr licenses and components.</span>' +
        '<button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> EVE SSO Login</button>';
    }
  }

  function handleAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const oauthError = params.get('error');

    // EVE SSO rejected the SKINr scope (still pre-release) — fall back to a
    // publicData-only login so the page can still be used for the UI/other tabs.
    if (oauthError && oauthError.indexOf('invalid_scope') !== -1) {
      sessionStorage.setItem(SCOPE_OK_KEY, 'false');
      sessionStorage.setItem('skinr_v2_fallback', 'true');
      showToast('SKINr API scope not available yet — logged in with basic scope.', '');
      const fallbackState = 'skinr2:' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
      const fp = new URLSearchParams({
        response_type: 'code',
        redirect_uri: EVE_SSO_REDIRECT_URI,
        client_id: ssoClientId,
        scope: EVE_SCOPE_PUBLIC,
        state: fallbackState
      });
      window.location.href = EVE_SSO_URL + '?' + fp.toString();
      return;
    }

    if (code) {
      fetch(API_BASE + '/token-exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      .then(r => r.json())
      .then(data => {
        if (data.access_token) {
          const expiresInMs = (data.expires_in || 1200) * 1000;
          const scopes = decodeScopes(data.access_token);
          const skinrOk = !!(scopes && scopes.indexOf('esi.cosmetic.char:read') !== -1);
          sessionStorage.setItem(SCOPE_OK_KEY, skinrOk ? 'true' : 'false');
          sessionStorage.removeItem('skinr_v2_fallback');
          saveAuth({
            access_token: data.access_token,
            character_id: data.character_id,
            character_name: data.character_name,
            expires_at: Date.now() + expiresInMs - 60000
          });
          updateAuthUI();
          showToast(skinrOk ? 'Logged in as ' + data.character_name : 'Logged in as ' + data.character_name + ' (SKINr scope unavailable)', '');
          window.history.replaceState({}, document.title, window.location.pathname);
          if (currentTab === 'licenses') renderLicenses();
          else if (currentTab === 'components') renderComponents();
        } else {
          showToast('Login failed: ' + (data.error || 'Unknown error'), 'error');
        }
      })
      .catch(err => showToast('Login error: ' + err.message, 'error'));
    }
  }

  function decodeScopes(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(decodeURIComponent(escape(atob(base64))));
      return json.scp || json.scope || null;
    } catch (e) {
      return null;
    }
  }

  /* ==================== API ==================== */

  function authHeaders() {
    const headers = { 'Accept': 'application/json' };
    if (currentUser && currentUser.access_token && !tokenExpired()) {
      headers['Authorization'] = 'Bearer ' + currentUser.access_token;
    }
    return headers;
  }

  // Generic GET against our proxy. Resolves on any terminal status; caller
  // inspects { status, data, retryAfter } to handle 202 Accepted.
  async function proxyGet(path, etag) {
    const headers = authHeaders();
    if (etag) headers['If-None-Match'] = etag;
    const res = await fetch(API_BASE + path, { headers });
    const retryAfterRaw = res.headers.get('retry-after');
    let retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : null;
    if (isNaN(retryAfter)) retryAfter = null;
    const etagOut = res.headers.get('etag');

    if (res.status === 204 || res.status === 304) {
      return { status: res.status, data: null, retryAfter, etag: etagOut };
    }
    if (res.status === 202) {
      return { status: 202, data: null, retryAfter, etag: etagOut };
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data, retryAfter, etag: etagOut };
  }

  async function fetchOwnedLicenses() {
    if (!currentUser) return { status: 401, data: null };
    return proxyGet(`/characters/${currentUser.character_id}/skinr`, licenseEtag);
  }

  async function fetchOwnedComponents() {
    if (!currentUser) return { status: 401, data: null };
    return proxyGet(`/characters/${currentUser.character_id}/skinr/components`, componentEtag);
  }

  async function fetchSkinrDetail(skinrId) {
    return proxyGet(`/skinr/${encodeURIComponent(skinrId)}`);
  }

  async function resolveNames(ids) {
    const unique = [...new Set(ids.filter(id => id && !namesCache[id]))];
    if (!unique.length) return namesCache;
    const res = await fetch(API_BASE + '/universe/names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unique)
    });
    if (res.ok) {
      const data = await res.json();
      for (const item of data) namesCache[item.id] = { name: item.name, category: item.category };
    }
    return namesCache;
  }

  async function shipName(typeId) {
    if (!typeId) return 'Unknown Ship';
    await resolveNames([typeId]);
    const n = namesCache[typeId];
    return n ? n.name : `Type #${typeId}`;
  }

  async function creatorName(charId) {
    if (!charId) return 'Unknown';
    await resolveNames([charId]);
    const n = namesCache[charId];
    return n ? n.name : `Character #${charId}`;
  }

  /* ==================== RENDER HELPERS ==================== */

  function rarityBadge(rarity) {
    const r = rarity || 1;
    return `<span class="rarity-tag rarity-${r}">${rarityName(r)}</span>`;
  }

  function layoutSlotsHtml(layout) {
    if (!layout || !layout.slots || !layout.slots.length) return '<div class="hint-text">No layout data.</div>';
    const blend = BLEND_MODES[layout.pattern_blend_mode] || layout.pattern_blend_mode;
    return layout.slots.map(slot => {
      const conf = slot.configuration || {};
      const parts = [];
      for (const key of ['nanocoating', 'pattern']) {
        const entry = conf[key];
        if (!entry || !entry.id) continue;
        const comp = componentForId(entry.id);
        if (!comp) {
          parts.push(`<span class="slot-comp">${key} #${entry.id}</span>`);
          continue;
        }
        const swatch = parseSwatchColor(comp.iconFile);
        const swatchHtml = swatch ? `<span class="comp-swatch" style="background:${swatch}"></span>` : '';
        parts.push(
          `<span class="slot-comp">${swatchHtml} ${escapeHtml(comp.name.en)} ${rarityBadge(comp.rarity)}</span>`
        );
      }
      if (!parts.length) parts.push('<span class="slot-comp" style="color:var(--text-subtle-color);">— empty —</span>');
      return `<div class="layout-slot"><div class="slot-name">${escapeHtml(slotName(slot.id))}</div>${parts.join('')}</div>`;
    }).join('') +
    (blend ? `<div class="blend-mode" style="margin-top:8px;">Pattern blend: <strong>${escapeHtml(blend)}</strong></div>` : '');
  }

  async function renderLicenseDetailsHtml(skinrId) {
    if (skinrDetailCache[skinrId]) {
      return { html: skinrDetailCache[skinrId].html, cache: skinrDetailCache[skinrId] };
    }
    let detail;
    try {
      const r = await fetchSkinrDetail(skinrId);
      if (r.status === 202) {
        return { pending: true, retryAfter: r.retryAfter };
      }
      if (r.status !== 200 || !r.data) {
        return { html: `<div class="detail-row"><span class="label">Attributes</span><span class="value" style="color:var(--danger-color);">Error (${r.status})</span></div>` };
      }
      detail = r.data;
    } catch (e) {
      return { html: `<div class="detail-row"><span class="label">Attributes</span><span class="value" style="color:var(--danger-color);">${escapeHtml(e.message)}</span></div>` };
    }

    const ship = await shipName(detail.ship_type_id);
    const creator = await creatorName(detail.creator_id);
    const tier = detail.tier && detail.tier.level ? detail.tier.level : null;
    const line = detail.line || '';

    const html = `
      <div class="detail-row"><span class="label">Ship</span><span class="value">${escapeHtml(ship)}</span></div>
      ${line ? `<div class="detail-row"><span class="label">Line</span><span class="value">${escapeHtml(line)}</span></div>` : ''}
      ${tier ? `<div class="detail-row"><span class="label">Tier</span><span class="value">${tier}</span></div>` : ''}
      <div class="detail-row"><span class="label">Creator</span><span class="value">${escapeHtml(creator)}</span></div>
      <div class="layout-section">
        <div class="layout-title"><i class="fa-solid fa-layer-group"></i> Layout</div>
        ${layoutSlotsHtml(detail.layout)}
      </div>`;

    skinrDetailCache[skinrId] = { html, data: detail };
    return { html, cache: skinrDetailCache[skinrId] };
  }

  /* ==================== LICENSES TAB ==================== */

  function scopeAvailable() {
    return scopeOk || sessionStorage.getItem(SCOPE_OK_KEY) === 'true';
  }

  function scopeUnavailableHtml(tab) {
    const name = tab === 'licenses' ? 'SKINr licenses' : 'component licenses';
    return `
      <div class="no-auth">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <strong>The SKINr cosmetics API is not available yet.</strong>
        <p>EVE has not yet enabled the <code>esi.cosmetic.char:read</code> scope on the live server. Once CCP releases it, log in again to see your ${name}.</p>
        <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> Re-login</button>
      </div>`;
  }

  async function renderLicenses() {
    const area = $('licenses-area');
    if (!currentUser) {
      area.innerHTML = `
        <div class="no-auth">
          <i class="fa-solid fa-palette"></i>
          <strong>Log in with EVE SSO to view your owned SKINr licenses.</strong>
          <p>Requires the esi.cosmetic.char:read scope.</p>
          <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> EVE SSO Login</button>
        </div>`;
      return;
    }
    if (tokenExpired()) {
      area.innerHTML = `
        <div class="no-auth">
          <i class="fa-solid fa-clock"></i>
          <strong>Your session has expired.</strong>
          <p>Please log in again to fetch your licenses.</p>
          <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> Re-login</button>
        </div>`;
      return;
    }
    if (!scopeAvailable()) {
      area.innerHTML = scopeUnavailableHtml('licenses');
      return;
    }

    if (licenseCache) {
      renderLicensesList(area);
      return;
    }

    area.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner"></i> Fetching your SKINr licenses...</div>';

    try {
      const r = await fetchOwnedLicenses();
      if (r.status === 202) {
        renderPending(area, r, renderLicenses);
        return;
      }
      if (r.status === 304 && licenseCache) {
        renderLicensesList(area);
        return;
      }
      if (r.status === 403) {
        area.innerHTML = `
          <div class="no-auth">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>Missing scope.</strong>
            <p>Please re-login to grant the esi.cosmetic.char:read permission.</p>
            <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> Re-login</button>
          </div>`;
        return;
      }
      if (r.status !== 200 || !r.data) {
        area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><strong>Failed to load licenses</strong><p>ESI returned status ${r.status}.</p></div>`;
        return;
      }
      licenseEtag = r.etag || null;
      licenseCache = (r.data.licenses || []).sort((a, b) => String(a.skinr_id).localeCompare(String(b.skinr_id)));
      renderLicensesList(area);
    } catch (e) {
      area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><strong>Error loading licenses</strong><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  function renderLicensesList(area) {
    if (!licenseCache || !licenseCache.length) {
      area.innerHTML = '<div class="empty-state"><i class="fa-solid fa-palette"></i><strong>No SKINr licenses owned</strong><p>You don&apos;t own any SKINr licenses yet.</p></div>';
      return;
    }

    const activated = licenseCache.filter(l => l.activated).length;
    const unactivated = licenseCache.reduce((sum, l) => sum + (l.unactivated || 0), 0);

    area.innerHTML = `
      <div class="stats-bar">
        <div class="stat-item"><div class="stat-num">${licenseCache.length}</div><div class="stat-label">Licenses</div></div>
        <div class="stat-item"><div class="stat-num">${activated}</div><div class="stat-label">Activated</div></div>
        <div class="stat-item"><div class="stat-num">${unactivated}</div><div class="stat-label">Unactivated Copies</div></div>
      </div>
      <div class="section-header">
        <i class="fa-solid fa-palette"></i><h2>Owned SKINr Licenses</h2><span class="line"></span>
        <button class="auth-btn" onclick="SkinrV2.refreshLicenses()"><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
      <div id="license-grid" class="license-grid">
        ${licenseCache.map(l => `<div class="license-card" data-skinr-id="${escapeHtml(l.skinr_id)}">
          <div class="license-card-image-wrap">
            <div class="license-card-image" style="background:linear-gradient(135deg,#1a1a1a,#2a2a2a);display:flex;align-items:center;justify-content:center;color:#555;"><i class="fa-solid fa-palette" style="font-size:3rem;"></i></div>
            <span class="license-status-badge ${l.activated ? 'activated' : 'unactivated'}">${l.activated ? 'ACTIVATED' : 'UNACTIVATED'}</span>
          </div>
          <div class="license-card-body">
            <h3>${escapeHtml(l.skinr_id)}</h3>
            <div class="ship-name">SKINr license</div>
            <div class="meta">
              <span class="count">${l.unactivated || 0} unactivated</span>
              <span class="expand-hint"><i class="fa-solid fa-chevron-down"></i> Details</span>
            </div>
          </div>
          <div class="license-details" style="display:none;"></div>
        </div>`).join('')}
      </div>`;

    area.querySelectorAll('.license-card').forEach(card => {
      card.addEventListener('click', () => {
        const wasExpanded = card.classList.contains('expanded');
        document.querySelectorAll('#license-grid .license-card.expanded').forEach(c => {
          c.classList.remove('expanded');
          const d = c.querySelector('.license-details');
          if (d) d.style.display = 'none';
        });
        if (wasExpanded) return;
        card.classList.add('expanded');
        const details = card.querySelector('.license-details');
        details.style.display = 'block';
        details.innerHTML = '<div class="loading" style="padding:1rem;"><i class="fa-solid fa-spinner"></i> Loading...</div>';
        loadCardDetails(card);
      });
    });
  }

  async function loadCardDetails(card) {
    const skinrId = card.dataset.skinrId;
    const details = card.querySelector('.license-details');
    const result = await renderLicenseDetailsHtml(skinrId);
    if (result.pending) {
      const wait = Math.max(result.retryAfter || 5, 2);
      details.innerHTML = `
        <div class="pending-panel" style="padding:1.5rem;">
          <i class="fa-solid fa-spinner"></i>
          <div class="pending-msg">SKINr attributes are being generated...</div>
          <div class="pending-note">Retrying in ${wait}s</div>
        </div>`;
      setTimeout(() => loadCardDetails(card), wait * 1000);
      return;
    }
    details.innerHTML = result.html;

    const shipTypeId = result.cache && result.cache.data ? result.cache.data.ship_type_id : null;
    if (shipTypeId) {
      const imgWrap = card.querySelector('.license-card-image');
      if (imgWrap) {
        const img = document.createElement('img');
        img.className = 'license-card-image';
        img.src = `https://images.evetech.net/types/${shipTypeId}/render?size=512`;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = () => { img.replaceWith(imgWrap); };
        imgWrap.replaceWith(img);
      }
      const nameEl = card.querySelector('.ship-name');
      if (nameEl) nameEl.textContent = await shipName(shipTypeId);
    }
  }

  /* ==================== COMPONENTS TAB ==================== */

  async function renderComponents() {
    const area = $('components-area');
    if (!currentUser) {
      area.innerHTML = `
        <div class="no-auth">
          <i class="fa-solid fa-fill-drip"></i>
          <strong>Log in with EVE SSO to view your owned component licenses.</strong>
          <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> EVE SSO Login</button>
        </div>`;
      return;
    }
    if (tokenExpired()) {
      area.innerHTML = `
        <div class="no-auth">
          <i class="fa-solid fa-clock"></i>
          <strong>Your session has expired.</strong>
          <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> Re-login</button>
        </div>`;
      return;
    }

    if (componentCache) {
      renderComponentsList(area);
      return;
    }

    if (!scopeAvailable()) {
      area.innerHTML = scopeUnavailableHtml('components');
      return;
    }

    area.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner"></i> Fetching your component licenses...</div>';

    try {
      const r = await fetchOwnedComponents();
      if (r.status === 202) {
        renderPending(area, r, renderComponents);
        return;
      }
      if (r.status === 304 && componentCache) {
        renderComponentsList(area);
        return;
      }
      if (r.status === 403) {
        area.innerHTML = `
          <div class="no-auth">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>Missing scope.</strong>
            <p>Please re-login to grant the esi.cosmetic.char:read permission.</p>
            <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> Re-login</button>
          </div>`;
        return;
      }
      if (r.status !== 200 || !r.data) {
        area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><strong>Failed to load components</strong><p>ESI returned status ${r.status}.</p></div>`;
        return;
      }
      componentEtag = r.etag || null;
      componentCache = (r.data.licenses || []).sort((a, b) => a.component_id - b.component_id);
      renderComponentsList(area);
    } catch (e) {
      area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><strong>Error loading components</strong><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  function renderComponentsList(area) {
    if (!componentCache || !componentCache.length) {
      area.innerHTML = '<div class="empty-state"><i class="fa-solid fa-fill-drip"></i><strong>No component licenses owned</strong><p>You don&apos;t own any SKINr component licenses yet.</p></div>';
      return;
    }

    const rows = componentCache.map(c => {
      const comp = componentForId(c.component_id);
      const name = comp ? comp.name.en : `Component #${c.component_id}`;
      const cat = comp ? (sde.categories[comp.category] ? sde.categories[comp.category].name : 'Unknown') : '';
      const rarity = comp ? comp.rarity : null;
      const swatch = comp ? parseSwatchColor(comp.iconFile) : null;
      const swatchHtml = swatch ? `<span class="comp-swatch" style="background:${swatch};display:inline-block;vertical-align:middle;"></span> ` : '';
      const runs = (c.runs && (c.runs.unlimited !== undefined || 'unlimited' in (c.runs || {})))
        ? 'Unlimited'
        : (c.runs && typeof c.runs.remaining === 'number' ? String(c.runs.remaining) : '—');
      return `<tr>
        <td>${swatchHtml}${escapeHtml(name)}</td>
        <td><span class="type-tag ${c.type === 'nanocoating' ? 'nanocoating' : 'pattern'}">${escapeHtml(c.type)}</span></td>
        <td>${escapeHtml(cat || '—')}</td>
        <td>${rarity ? rarityBadge(rarity) : '—'}</td>
        <td>${escapeHtml(runs)}</td>
      </tr>`;
    }).join('');

    area.innerHTML = `
      <div class="stats-bar">
        <div class="stat-item"><div class="stat-num">${componentCache.length}</div><div class="stat-label">Component Licenses</div></div>
      </div>
      <div class="section-header">
        <i class="fa-solid fa-fill-drip"></i><h2>Owned Component Licenses</h2><span class="line"></span>
        <button class="auth-btn" onclick="SkinrV2.refreshComponents()"><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Component</th><th>Type</th><th>Category</th><th>Rarity</th><th>Runs</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  /* ==================== LOOKUP TAB ==================== */

  async function renderLookup(skinrId) {
    const area = $('lookup-area');
    if (!skinrId) {
      area.innerHTML = '<div class="hint-text" style="text-align:center;">Enter a SKINr ID (e.g. a license ID from your collection) and hit Fetch.</div>';
      return;
    }
    if (!currentUser) {
      area.innerHTML = `
        <div class="no-auth">
          <i class="fa-solid fa-magnifying-glass"></i>
          <strong>Log in with EVE SSO to look up SKINr attributes.</strong>
          <button class="auth-btn" onclick="SkinrV2.login()"><i class="fa-solid fa-right-to-bracket"></i> EVE SSO Login</button>
        </div>`;
      return;
    }

    const btn = $('lookup-btn');
    btn.disabled = true;
    area.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner"></i> Fetching SKINr...</div>';

    try {
      const result = await renderLicenseDetailsHtml(String(skinrId));
      if (result.pending) {
        const wait = Math.max(result.retryAfter || 5, 2);
        renderPending(area, { retryAfter: result.retryAfter }, () => renderLookup(skinrId));
        return;
      }
      const shipTypeId = result.cache && result.cache.data ? result.cache.data.ship_type_id : null;
      const shipImg = shipTypeId
        ? `<div class="lookup-image-wrap"><img class="lookup-image" src="https://images.evetech.net/types/${shipTypeId}/render?size=512" alt="" loading="lazy"></div>`
        : '';
      area.innerHTML = `
        <div class="lookup-result">
          ${shipImg}
          <div class="section-header" style="padding:0.9rem 1rem 0;margin-bottom:0;">
            <i class="fa-solid fa-palette"></i><h2>SKINr ${escapeHtml(skinrId)}</h2><span class="line"></span>
          </div>
          <div class="license-details" style="border-top:none;padding-top:0.6rem;">${result.html}</div>
        </div>`;
    } catch (e) {
      area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><strong>Lookup failed</strong><p>${escapeHtml(e.message)}</p></div>`;
    } finally {
      btn.disabled = false;
    }
  }

  /* ==================== PENDING / RETRY ==================== */

  function renderPending(container, r, retryFn) {
    const wait = Math.max(r.retryAfter || 5, 2);
    container.innerHTML = `
      <div class="pending-panel">
        <i class="fa-solid fa-spinner"></i>
        <div class="pending-msg">EVE is generating this listing for the first time...</div>
        <div class="pending-note">Request accepted (202). Retrying automatically in ${wait}s.</div>
        <button class="auth-btn" style="margin-top:12px;" onclick="SkinrV2.retry()"><i class="fa-solid fa-rotate"></i> Try Now</button>
      </div>`;
    clearTimeout(SkinrV2._pendingTimer);
    SkinrV2._pendingTimer = setTimeout(retryFn, wait * 1000);
  }

  /* ==================== TAB SWITCHING ==================== */

  function switchTab(tab) {
    currentTab = tab;
    Object.keys(tabs).forEach(k => {
      tabs[k].classList.toggle('active', k === tab);
      navBtns[k].classList.toggle('active', k === tab);
    });
    if (tab === 'licenses') renderLicenses();
    else if (tab === 'components') renderComponents();
    else if (tab === 'lookup') renderLookup($('lookup-input').value.trim());
  }

  /* ==================== PUBLIC API ==================== */

  window.SkinrV2 = {
    login: function () {
      const state = 'skinr2:' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
      const params = new URLSearchParams({
        response_type: 'code',
        redirect_uri: EVE_SSO_REDIRECT_URI,
        client_id: ssoClientId,
        scope: EVE_SCOPE_SKINR,
        state: state
      });
      window.location.href = EVE_SSO_URL + '?' + params.toString();
    },
    logout: function () {
      saveAuth(null);
      licenseCache = null;
      componentCache = null;
      licenseEtag = null;
      componentEtag = null;
      sessionStorage.removeItem(SCOPE_OK_KEY);
      sessionStorage.removeItem('skinr_v2_fallback');
      updateAuthUI();
      showToast('Logged out');
      switchTab(currentTab);
    },
    switchTab: switchTab,
    retry: function () {
      if (currentTab === 'licenses') renderLicenses();
      else if (currentTab === 'components') renderComponents();
      else if (currentTab === 'lookup') renderLookup($('lookup-input').value.trim());
    },
    refreshLicenses: function () {
      licenseCache = null;
      licenseEtag = null;
      renderLicenses();
    },
    refreshComponents: function () {
      componentCache = null;
      componentEtag = null;
      renderComponents();
    }
  };

  /* ==================== INIT ==================== */

  async function init() {
    loadAuth();
    updateAuthUI();

    try {
      await loadSde();
    } catch (e) {
      console.warn('SDE load failed, continuing:', e.message);
    }

    handleAuthCallback();

    try {
      const res = await fetch(API_BASE + '/config');
      const cfg = await res.json();
      ssoClientId = cfg.eve_client_id || null;
    } catch (e) {
      console.warn('Config fetch failed:', e.message);
    }

    $('lookup-btn').addEventListener('click', () => renderLookup($('lookup-input').value.trim()));
    $('lookup-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') renderLookup($('lookup-input').value.trim());
    });

    switchTab('licenses');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
