(function () {
  'use strict';

  let pveIndex = [];
  let pveDetails = {};
  let filtered = [];
  let categories = [];

  const factionSlugMap = {
    'Angel Cartel': 'angel',
    'Blood Raider Covenant': 'blood',
    'Blood Raiders': 'blood',
    'Guristas Pirates': 'guristas',
    "Sansha's Nation": 'sansha',
    'Serpentis Corporation': 'serpentis',
    'Serpentis': 'serpentis',
    'Rogue Drones': 'rogue',
    'Sleepers': 'rogue',
    'Triglavian Collective': 'triglavian',
    'EDENCOM / Drifter allies': 'edencom',
  };

  function $(s) { return document.querySelector(s); }
  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadData() {
    const [a, b] = await Promise.all([
      fetch('data/pve-sites-index.json'),
      fetch('data/pve-sites.json'),
    ]);
    pveIndex = await a.json();
    pveDetails = await b.json();
    categories = [...new Set(pveIndex.map(e => e.category))].sort();
  }

  function initControls() {
    const catSel = $('#pveCategoryFilter');
    categories.forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      catSel.appendChild(o);
    });

    const factions = [...new Set(pveIndex.map(e => e.faction).filter(Boolean))].sort();
    const facSel = $('#pveFactionFilter');
    factions.forEach(f => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      facSel.appendChild(o);
    });

    ['pveSearchInput', 'pveCategoryFilter', 'pveFactionFilter', 'pveSpaceFilter', 'pveTierFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderList);
      if (el && el.tagName === 'SELECT') el.addEventListener('change', renderList);
    });

    $('#backToPveList').addEventListener('click', e => {
      e.preventDefault();
      window.location.hash = 'pve';
    });
  }

  function renderList() {
    const q = ($('#pveSearchInput').value || '').toLowerCase().trim();
    const cat = $('#pveCategoryFilter').value;
    const fac = $('#pveFactionFilter').value;
    const space = $('#pveSpaceFilter').value;
    const tier = $('#pveTierFilter').value;

    filtered = pveIndex.filter(e => {
      if (q && !(e.name.toLowerCase().includes(q) || (e.faction || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q))) return false;
      if (cat && e.category !== cat) return false;
      if (fac && e.faction !== fac) return false;
      if (space && !(e.space && e.space[space])) return false;
      if (tier) {
        const t = e.tier || 0;
        if (tier === '0') { if (t !== 0 && t !== null) return false; }
        else {
          const [lo, hi] = tier.split('-').map(Number);
          if (t == null || t < lo || t > hi) return false;
        }
      }
      return true;
    });

    const container = $('#pveList');
    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">No sites match your filters.</div>';
      $('#pveStats').textContent = 'Showing 0 sites';
      return;
    }

    const byCat = {};
    filtered.forEach((e, idx) => {
      if (!byCat[e.category]) byCat[e.category] = [];
      byCat[e.category].push({ e, idx });
    });

    let html = '';
    Object.keys(byCat).sort().forEach(category => {
      html += '<div class="tier-group"><div class="tier-header">' + escapeHtml(category) +
        ' <span class="tier-count">' + byCat[category].length + '</span></div><div class="anomaly-grid">';
      byCat[category].forEach(({ e, idx }) => {
        html += createCard(e, idx);
      });
      html += '</div></div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.anomaly-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        const entry = filtered[idx];
        if (entry) window.location.hash = 'pve/detail/' + encodeURIComponent(entry.id);
      });
    });

    $('#pveStats').textContent = 'Showing ' + filtered.length + ' of ' + pveIndex.length + ' PvE sites';
  }

  function createCard(entry, idx) {
    const slug = factionSlugMap[entry.faction] || 'rogue';
    const space = entry.space || {};
    let html = '<div class="anomaly-card faction-' + slug + '" data-idx="' + idx + '">';
    html += '<div class="anomaly-card-header">';
    html += '<span class="anomaly-faction">' + escapeHtml(entry.faction || entry.category) + '</span>';
    html += '<span class="site-type-badge site-type-complex">' + escapeHtml(entry.category.split(' ')[0]) + '</span>';
    html += '</div>';
    html += '<div class="anomaly-card-name">' + escapeHtml(entry.name);
    if (entry.variant && entry.variant !== 'Normal') {
      html += '<span class="anomaly-variant-badge variant-' + entry.variant.toLowerCase() + '">' + escapeHtml(entry.variant) + '</span>';
    }
    html += '</div>';
    html += '<div class="anomaly-card-space">';
    if (space.high) html += '<span class="space-badge space-high">High</span>';
    if (space.low) html += '<span class="space-badge space-low">Low</span>';
    if (space.null) html += '<span class="space-badge space-null">Null</span>';
    if (space.pochven) html += '<span class="space-badge space-null">Pochven</span>';
    html += '</div>';
    if (entry.tier) {
      html += '<span class="anomaly-level-badge ded-medium">Tier ' + entry.tier + '</span>';
    }
    html += '</div>';
    return html;
  }

  function showDetail(id) {
    const entry = pveIndex.find(e => e.id === id);
    const detail = pveDetails[id];
    if (!entry || !detail) return;

    $('#pveListView').style.display = 'none';
    $('#pveDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    const slug = factionSlugMap[entry.faction] || 'rogue';
    let html = '<div class="detail-header">';
    html += '<h2>' + escapeHtml(entry.name) + '</h2>';
    if (entry.tier) html += '<span class="detail-level-badge">Tier ' + entry.tier + '</span>';
    html += '<span class="detail-faction">' + escapeHtml(entry.faction || '') + '</span>';
    html += '<span class="detail-faction" style="color:var(--info-color);font-size:0.85rem;">' + escapeHtml(entry.category) + '</span>';
    html += '</div>';

    const fields = [
      ['Classification', detail['Classification']],
      ['Location/Space', detail['Location/Space']],
      ['Enemy Faction', detail['Enemy Faction']],
      ['Damage to Deal', detail['Damage to Deal']],
      ['Damage to Resist', detail['Damage to Resist']],
      ['EWAR to Expect', detail['EWAR to Expect']],
      ['Ship Restrictions/Recommendations', detail['Ship Restrictions/Recommendations']],
      ['Notable Loot', detail['Notable Loot']],
      ['Escalation / Mechanics', detail['Escalation / Mechanics']],
      ['Brief Strategy Notes', detail['Brief Strategy Notes']],
    ];

    fields.forEach(([label, val]) => {
      if (!val) return;
      html += '<div class="detail-section"><h3>' + escapeHtml(label) + '</h3>';
      html += '<div class="pve-field-value">' + escapeHtml(val) + '</div></div>';
    });

    html += '<div class="detail-section"><h3>Sources</h3><div><a href="https://wiki.eveuniversity.org/" target="_blank" rel="noopener">EVE University Wiki</a></div></div>';

    $('#pveDetailContent').innerHTML = html;
  }

  function showListView() {
    $('#pveDetailView').style.display = 'none';
    $('#pveListView').style.display = 'block';
    renderList();
  }

  function applyHash(parts) {
    if (parts[0] !== 'pve') return false;
    if (parts[1] === 'detail' && parts[2]) {
      showDetail(decodeURIComponent(parts[2]));
      return true;
    }
    showListView();
    return true;
  }

  window.PveSites = {
    init: async function () {
      await loadData();
      initControls();
      renderList();
    },
    applyHash,
    showListView,
  };
})();
