(function () {
  'use strict';

  let allSites = [];
  let details = {};
  let filtered = [];
  let activeTab = 'fw';

  const DETAIL_FIELDS = [
    ['Classification', 'Classification'],
    ['Location/Space', 'Location/Space'],
    ['Enemy Faction', 'Enemy Faction'],
    ['Damage to Deal', 'Damage to Deal'],
    ['Damage to Resist', 'Damage to Resist'],
    ['EWAR to Expect', 'EWAR to Expect'],
    ['Ship Restrictions/Recommendations', 'Ship Restrictions/Recommendations'],
    ['Notable Loot', 'Notable Loot'],
    ['Escalation / Mechanics', 'Escalation / Mechanics'],
    ['Brief Strategy Notes', 'Brief Strategy Notes'],
  ];

  const FW_TYPE_ORDER = ['Battlefield', 'Open Complex', 'Large Complex', 'Medium Complex', 'Small Complex', 'Scan Site', 'Scan Anomaly', 'Operation Center', 'Rendezvous Point', 'Other'];
  const INCURSION_TYPE_ORDER = ['Vanguard', 'Assault', 'Headquarters', 'Staging', 'Mothership', 'Incursion'];

  function $(s) { return document.querySelector(s); }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function empireOf(entry) {
    if (entry.category === 'Incursions') return 'Sansha';
    const m = /^(Amarr|Caldari|Gallente|Minmatar)\b/.exec(entry.name);
    return m ? m[1] : 'Other';
  }

  function typeOf(entry) {
    const detail = details[entry.id] || {};
    if (entry.category === 'Incursions') {
      const m = /\((Vanguard|Assault|Headquarters|Staging|Mothership)\)/.exec(detail['Classification'] || '');
      return m ? m[1] : 'Incursion';
    }
    const n = entry.name;
    if (/Battlefield/i.test(n)) return 'Battlefield';
    if (/Open (Complex|Plex)/i.test(n) || /Open Plex/i.test(detail['Classification'] || '')) return 'Open Complex';
    if (/\bLarge\b/i.test(n)) return 'Large Complex';
    if (/\bMedium\b/i.test(n)) return 'Medium Complex';
    if (/\bSmall\b/i.test(n)) return 'Small Complex';
    if (/Operation Center/i.test(n)) return 'Operation Center';
    if (/Rendezvous Point/i.test(n)) return 'Rendezvous Point';
    const c = detail['Classification'] || '';
    if (/Scan Anomaly/i.test(c)) return 'Scan Anomaly';
    if (/Scan Site/i.test(c)) return 'Scan Site';
    return 'Other';
  }

  function spaceOf(entry) {
    const s = entry.space || {};
    const out = [];
    if (s.high) out.push('High');
    if (s.low) out.push('Low');
    if (s.null) out.push('Null');
    if (s.pochven) out.push('Pochven');
    if (s.zarzakh) out.push('Zarzakh');
    return out;
  }

  function tierBadge(entry) {
    const m = /\b(ADV|NVY)-(\d)\b/i.exec(entry.name);
    if (!m) return '';
    return '<span class="fw-tier-badge">' + m[1].toUpperCase() + '-' + m[2] + '</span>';
  }

  async function loadData() {
    const [a, b] = await Promise.all([
      fetch('data/pve-sites-index.json'),
      fetch('data/pve-sites.json'),
    ]);
    const index = await a.json();
    details = await b.json();
    allSites = index
      .filter(e => e.category === 'Faction Warfare' || e.category === 'Incursions')
      .map(e => ({
        id: e.id,
        name: e.name,
        category: e.category,
        faction: e.faction,
        space: e.space || {},
        empire: empireOf(e),
        type: typeOf(e),
        spaceList: spaceOf(e),
      }));
  }

  function sitesForTab() {
    return allSites.filter(e => activeTab === 'fw' ? e.category === 'Faction Warfare' : e.category === 'Incursions');
  }

  function typeOrder() {
    return activeTab === 'fw' ? FW_TYPE_ORDER : INCURSION_TYPE_ORDER;
  }

  function populateEmpireFilter() {
    const sel = $('#fwincEmpireFilter');
    if (!sel) return;
    if (activeTab === 'incursions') {
      sel.style.display = 'none';
      sel.value = '';
      return;
    }
    sel.style.display = '';
    const current = sel.value;
    const empires = [...new Set(sitesForTab().map(e => e.empire))].sort();
    sel.innerHTML = '<option value="">All Empires</option>' +
      empires.map(e => '<option value="' + escapeHtml(e) + '">' + escapeHtml(e) + '</option>').join('');
    if (empires.includes(current)) sel.value = current;
  }

  function populateTypeFilter() {
    const sel = $('#fwincTypeFilter');
    if (!sel) return;
    const current = sel.value;
    const types = [...new Set(sitesForTab().map(e => e.type))];
    types.sort((a, b) => {
      const order = typeOrder();
      const ai = order.indexOf(a), bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    });
    sel.innerHTML = '<option value="">All Types</option>' +
      types.map(t => '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>').join('');
    if (types.includes(current)) sel.value = current;
  }

  function setTab(name, updateHash) {
    activeTab = name === 'incursions' ? 'incursions' : 'fw';
    document.querySelectorAll('.fwinc-subtab').forEach(b => {
      b.classList.toggle('active', b.dataset.fwinc === activeTab);
    });
    populateEmpireFilter();
    populateTypeFilter();
    if (updateHash) window.location.hash = 'fwinc/' + activeTab;
    showListView();
  }

  function renderList() {
    const q = ($('#fwincSearchInput').value || '').toLowerCase().trim();
    const empire = $('#fwincEmpireFilter').value;
    const type = $('#fwincTypeFilter').value;

    filtered = sitesForTab().filter(e => {
      if (q) {
        const hay = (e.name + ' ' + e.empire + ' ' + e.type + ' ' + (e.faction || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (empire && e.empire !== empire) return false;
      if (type && e.type !== type) return false;
      return true;
    });

    const container = $('#fwincList');
    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">No sites match your filters.</div>';
      $('#fwincStats').textContent = 'Showing 0 sites';
      return;
    }

    const byType = {};
    filtered.forEach(e => { (byType[e.type] ||= []).push(e); });

    const order = typeOrder();
    let html = '';
    Object.keys(byType).sort((a, b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    }).forEach(typeName => {
      const list = byType[typeName].sort((a, b) => a.name.localeCompare(b.name));
      html += '<div class="tier-group"><div class="tier-header">' + escapeHtml(typeName) +
        ' <span class="tier-count">' + list.length + '</span></div><div class="anomaly-grid">';
      list.forEach(e => { html += createCard(e); });
      html += '</div></div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.anomaly-card').forEach(card => {
      card.addEventListener('click', () => {
        window.location.hash = 'fwinc/detail/' + encodeURIComponent(card.dataset.id);
      });
    });

    $('#fwincStats').textContent = 'Showing ' + filtered.length + ' of ' + sitesForTab().length + ' ' +
      (activeTab === 'fw' ? 'Faction Warfare' : 'Incursion') + ' sites';
  }

  function factionClass(empire) {
    const map = { Amarr: 'amarr', Caldari: 'caldari', Gallente: 'gallente', Minmatar: 'minmatar', Sansha: 'sansha' };
    return 'faction-' + (map[empire] || 'rogue');
  }

  function createCard(entry) {
    let html = '<div class="anomaly-card ' + factionClass(entry.empire) + '" data-id="' + escapeHtml(entry.id) + '">';
    html += '<div class="anomaly-card-header">';
    html += '<span class="anomaly-faction">' + escapeHtml(entry.empire === 'Sansha' ? "Sansha's Nation" : entry.empire + ' Militia') + '</span>';
    html += '<span class="site-type-badge site-type-complex">' + escapeHtml(entry.type.replace(' Complex', '')) + '</span>';
    html += '</div>';
    html += '<div class="anomaly-card-name">' + escapeHtml(entry.name) + tierBadge(entry) + '</div>';
    html += '<div class="anomaly-card-space">';
    entry.spaceList.forEach(s => {
      const cls = s === 'Low' ? 'space-low' : s === 'High' ? 'space-high' : 'space-null';
      html += '<span class="space-badge ' + cls + '">' + escapeHtml(s) + '</span>';
    });
    html += '</div></div>';
    return html;
  }

  function showDetail(id) {
    const entry = allSites.find(e => e.id === id);
    const detail = details[id];
    if (!entry || !detail) return;

    const wanted = entry.category === 'Incursions' ? 'incursions' : 'fw';
    if (wanted !== activeTab) {
      activeTab = wanted;
      document.querySelectorAll('.fwinc-subtab').forEach(b => {
        b.classList.toggle('active', b.dataset.fwinc === activeTab);
      });
      populateEmpireFilter();
      populateTypeFilter();
    }

    $('#fwincListView').style.display = 'none';
    $('#fwincDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    let html = '<div class="detail-header">';
    html += '<h2>' + escapeHtml(entry.name) + '</h2>';
    html += '<span class="detail-level-badge">' + escapeHtml(entry.type) + '</span>';
    html += '<span class="detail-faction">' + escapeHtml(detail['Enemy Faction'] || entry.faction || '') + '</span>';
    html += '<span class="detail-faction" style="color:var(--info-color);font-size:0.85rem;">' + escapeHtml(entry.category) + '</span>';
    html += '</div>';

    DETAIL_FIELDS.forEach(([label, key]) => {
      const val = detail[key];
      if (!val) return;
      html += '<div class="detail-section"><h3>' + escapeHtml(label) + '</h3>';
      html += '<div class="fw-detail-value">' + escapeHtml(val) + '</div></div>';
    });

    html += '<div class="detail-section"><h3>Sources</h3><div><a href="https://wiki.eveuniversity.org/" target="_blank" rel="noopener">EVE University Wiki</a></div></div>';

    $('#fwincDetailContent').innerHTML = html;
  }

  function showListView() {
    $('#fwincDetailView').style.display = 'none';
    $('#fwincListView').style.display = 'block';
    renderList();
  }

  function applyHash(parts) {
    if (parts[0] !== 'fwinc') return false;
    if (parts[1] === 'detail' && parts[2]) {
      showDetail(decodeURIComponent(parts[2]));
      return true;
    }
    if (parts[1] === 'incursions' || parts[1] === 'fw') {
      activeTab = parts[1];
      populateEmpireFilter();
      populateTypeFilter();
    }
    document.querySelectorAll('.fwinc-subtab').forEach(b => {
      b.classList.toggle('active', b.dataset.fwinc === activeTab);
    });
    showListView();
    return true;
  }

  function initControls() {
    document.querySelectorAll('.fwinc-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        setTab(btn.dataset.fwinc, true);
      });
    });

    ['fwincSearchInput', 'fwincEmpireFilter', 'fwincTypeFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', renderList);
      if (el.tagName === 'SELECT') el.addEventListener('change', renderList);
    });

    $('#backToFwIncList').addEventListener('click', e => {
      e.preventDefault();
      window.location.hash = 'fwinc/' + activeTab;
    });
  }

  window.FwIncursions = {
    init: async function () {
      await loadData();
      initControls();
      populateEmpireFilter();
      populateTypeFilter();
      renderList();
    },
    applyHash,
    showListView,
    setTab,
  };
})();
