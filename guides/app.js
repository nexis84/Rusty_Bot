(function () {
  'use strict';

  let missionsIndex = [];
  let missionsDetails = {};
  let anomaliesIndex = [];
  let anomaliesDetails = {};
  let anomaliesUniWiki = {};
  let burnersData = {};
  let burnersSurvival = {};
  let agentsData = [];
  let epicArcsIndex = [];
  let epicArcsDetails = {};
  let currentArcId = '';
  let npcFactionsData = [];
  let anomalyFavorites = [];

  const FAVORITES_KEY = 'rustybot_anomaly_favorites';

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      anomalyFavorites = raw ? JSON.parse(raw) : [];
    } catch (e) {
      anomalyFavorites = [];
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(anomalyFavorites));
    } catch (e) { /* ignore */ }
  }

  function isFavorite(page) {
    return anomalyFavorites.includes(page);
  }

  function toggleFavorite(page) {
    const idx = anomalyFavorites.indexOf(page);
    if (idx >= 0) {
      anomalyFavorites.splice(idx, 1);
    } else {
      anomalyFavorites.push(page);
    }
    saveFavorites();
  }

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const factionSlugMap = {
    'Angel Cartel': 'angel',
    'Blood Raiders': 'blood',
    'Guristas Pirates': 'guristas',
    "Sansha's Nation": 'sansha',
    'Serpentis': 'serpentis',
    'Rogue Drones': 'rogue',
    'EDENCOM': 'edencom',
    'Triglavian': 'triglavian',
    'CONCORD': 'concord',
  };

  // ===== INIT =====
  async function init() {
    showLoading(true);
    try {
      const [a, b, c, d, e, f, g, h, i, j, k] = await Promise.all([
        fetch('data/missions-index.json'),
        fetch('data/missions.json'),
        fetch('data/anomalies-index.json'),
        fetch('data/anomalies.json'),
        fetch('data/anomalies-uniwiki.json'),
        fetch('data/anomic-missions.json'),
        fetch('data/anomic-missions-survival.json'),
        fetch('data/agents-index.json'),
        fetch('data/epic-arcs-index.json'),
        fetch('data/epic-arcs.json'),
        fetch('data/npc-factions.json')
      ]);
      missionsIndex = await a.json();
      missionsDetails = await b.json();
      anomaliesIndex = await c.json();
      anomaliesDetails = await d.json();
      anomaliesUniWiki = await e.json();
      burnersData = await f.json();
      burnersSurvival = await g.json();
      agentsData = await h.json();
      epicArcsIndex = await i.json();
      epicArcsDetails = await j.json();
      npcFactionsData = (await k.json()).factions || [];
      loadFavorites();

      // Normalize mission factions
      var factionMap = {
        'Ammar': 'Amarr Empire',
        'Galente': 'Gallente Federation',
        'Blood Raider': 'Blood Raiders',
        'Gallente': 'Gallente Federation',
        'Caldari': 'Caldari State',
        'Minmatar': 'Minmatar Republic',
        'Amarr': 'Amarr Empire',
        'Sansha Nation': "Sansha's Nation",
        'Mordus': 'Mordus Legion',
        'Mordu': 'Mordus Legion',
        'Thukker tribe': 'Thukker Tribe',
      };
      missionsIndex.forEach(function(m) {
        var f = m.faction;
        if (!f) return;
        var cleaned = f.replace(/\?/g, '').replace(/^Angel Catel/, 'Angel Cartel').trim();
        cleaned = factionMap[cleaned] || cleaned;
        m.faction = cleaned;
      });
    } catch (err) {
      console.error('Data load failed:', err);
      $('#missionList').innerHTML = '<div class="empty-state">Failed to load data. Try refreshing.</div>';
      $('#anomalyList').innerHTML = '<div class="empty-state">Failed to load data. Try refreshing.</div>';
      $('#burnerList').innerHTML = '<div class="empty-state">Failed to load data. Try refreshing.</div>';
      $('#agentList').innerHTML = '<div class="empty-state">Failed to load data. Try refreshing.</div>';
    } finally {
      showLoading(false);
    }

    initTabs();
    initMissionControls();
    initAnomalyControls();
    initBurnerControls();
    initAgentControls();
    initEpicArcControls();
    initNpcControls();
    applyHash();
    window.addEventListener('hashchange', applyHash);
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.briefing-toggle');
      if (!btn) return;
      var section = btn.closest('.briefing-section');
      if (!section) return;
      var content = section.querySelector('.briefing-content');
      if (!content) return;
      var isExpanded = content.classList.toggle('expanded');
      btn.textContent = isExpanded ? 'Show less' : 'Show more';
    });
  }

  // ===== TABS & ROUTING =====
  function initTabs() {
    $$('.tab-bar .tab').forEach(t => {
      t.addEventListener('click', e => {
        e.preventDefault();
        window.location.hash = t.dataset.tab;
      });
    });
  }

  function activateTab(name) {
    $$('.tab-bar .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
  }

  function showListView(tab) {
    if (tab === 'missions') { $('#missionDetailView').style.display = 'none'; $('#missionListView').style.display = 'block'; }
    if (tab === 'anomalies') { $('#anomalyDetailView').style.display = 'none'; $('#anomalyListView').style.display = 'block'; }
    if (tab === 'burners') { $('#burnerDetailView').style.display = 'none'; $('#burnerListView').style.display = 'block'; }
    if (tab === 'agents') { $('#agentDetailView').style.display = 'none'; $('#agentListView').style.display = 'block'; }
    if (tab === 'epicarcs') { $('#epicArcDetailView').style.display = 'none'; $('#epicArcMissionDetailView').style.display = 'none'; $('#epicArcListView').style.display = 'block'; }
    if (tab === 'npcs') { $('#npcDetailView').style.display = 'none'; $('#npcListView').style.display = 'block'; }
  }

  function applyHash() {
    const hash = window.location.hash.replace('#', '') || 'missions';
    const parts = hash.split('/');
    const tab = parts[0];

    if (!tab) return;
    activateTab(tab);

    if (parts[1] === 'detail' && parts[2]) {
      // Detail view
      if (tab === 'missions' && parts[3]) {
        const level = parseInt(parts[2], 10);
        const pageName = decodeURIComponent(parts.slice(3).join('/'));
        const mission = findMissionByPage(pageName);
        if (mission && mission.levels[level]) {
          showMissionDetail(mission, level, pageName);
        }
      } else if (tab === 'anomalies') {
        const pageName = parts.slice(2).join('/');
        const entry = findEntryByPage(pageName);
        if (entry) showAnomalyDetail(entry);
      } else if (tab === 'burners') {
        const rawPageName = parts.slice(2).join('/');
        let pageName = rawPageName;
        try { pageName = decodeURIComponent(rawPageName); } catch (e) { /* skip */ }
        const entry = burnersData[pageName] || burnersData[rawPageName];
        if (entry) showBurnerDetail(entry);
      } else if (tab === 'agents') {
        const cid = parseInt(parts[2], 10);
        const agent = agentsData.find(a => a.characterID === cid);
        if (agent) showAgentDetail(agent);
      } else if (tab === 'epicarcs') {
        const arcId = decodeURIComponent(parts[2]);
        const arc = epicArcsIndex.find(a => a.id === arcId);
        if (arc) showEpicArcDetail(arc);
      } else if (tab === 'npcs') {
        const factionId = decodeURIComponent(parts[2]);
        const faction = npcFactionsData.find(f => f.id === factionId);
        if (faction) showNpcDetail(faction);
      }
    } else if (tab === 'epicarcs' && parts[1] === 'mission' && parts[2]) {
      const pageName = decodeURIComponent(parts.slice(2).join('/'));
      const detail = epicArcsDetails[pageName];
      if (detail) showEpicArcMissionDetail(pageName);
    } else {
      // List view
      showListView(tab);
    }
  }

  function findMissionByPage(pageName) {
    for (const m of missionsIndex) {
      for (const lvl of Object.keys(m.levels)) {
        if (m.levels[lvl] === pageName) return m;
      }
    }
    return null;
  }

  function showLoading(v) {
    $('#loadingIndicator').style.display = v ? 'block' : 'none';
  }

  // ===== MISSIONS =====
  function initMissionControls() {
    populateFactionFilter();
    renderMissionList();
    $('#searchInput').addEventListener('input', renderMissionList);
    $('#levelFilter').addEventListener('change', renderMissionList);
    $('#factionFilter').addEventListener('change', renderMissionList);
    $('#backToMissionList').addEventListener('click', function() { window.location.hash = '#missions'; });
  }

  function populateFactionFilter() {
    const nonFactions = new Set(['Common', 'Courier', 'DED', 'General', 'Tutorial', 'Blitz information', 'Blitz Information', 'Concord', 'Deadspace Droneswarm', 'EoM', 'Mercenaries']);
    const factions = [...new Set(missionsIndex.map(function(m) { return m.faction; }).filter(Boolean))].filter(function(f) { return f && !nonFactions.has(f); }).sort();
    const sel = $('#factionFilter');
    factions.forEach(function(f) {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      sel.appendChild(o);
    });
  }

  function renderMissionList() {
    const query = $('#searchInput').value.toLowerCase().trim();
    const levelFilter = $('#levelFilter').value;
    const factionFilter = $('#factionFilter').value;

    let filtered = missionsIndex;

    if (query) {
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(query) ||
        (m.faction || '').toLowerCase().includes(query)
      );
    }

    if (levelFilter) {
      filtered = filtered.filter(m => m.levels[levelFilter]);
    }

    if (factionFilter) {
      filtered = filtered.filter(m => m.faction === factionFilter);
    }

    const container = $('#missionList');
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">No missions match your filters.</div>';
    } else {
      for (const m of filtered) {
        container.appendChild(createMissionRow(m));
      }
    }

    $('#stats').textContent = 'Showing ' + filtered.length + ' of ' + missionsIndex.length + ' missions';
  }

  function createMissionRow(mission) {
    const row = document.createElement('div');
    row.className = 'mission-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'mission-name';
    nameEl.textContent = mission.name;
    row.appendChild(nameEl);

    const factionEl = document.createElement('div');
    factionEl.className = 'mission-faction';
    factionEl.textContent = mission.faction;
    row.appendChild(factionEl);

    const levelsEl = document.createElement('div');
    levelsEl.className = 'mission-levels';

    for (let lvl = 1; lvl <= 5; lvl++) {
      const pageName = mission.levels[lvl];
      const badge = document.createElement('span');
      badge.className = 'level-badge';
      badge.textContent = lvl;
      if (pageName) {
        badge.classList.add('active');
        badge.addEventListener('click', e => {
          e.stopPropagation();
          window.location.hash = '#missions/detail/' + lvl + '/' + encodeURIComponent(pageName);
        });
      }
      levelsEl.appendChild(badge);
    }

    row.appendChild(levelsEl);

    row.addEventListener('click', () => {
      const levels = Object.keys(mission.levels).map(Number).sort((a, b) => a - b);
      if (levels.length > 0) {
        window.location.hash = '#missions/detail/' + levels[0] + '/' + encodeURIComponent(mission.levels[levels[0]]);
      }
    });

    return row;
  }

  function getInfoValue(info, key) {
    if (!info) return '';
    const lower = key.toLowerCase();
    for (const k of Object.keys(info)) {
      if (k.toLowerCase() === lower) return info[k];
    }
    return '';
  }

  function cleanMissionLine(line) {
    const t = (line || '').trim();
    if (/^Category\w/i.test(t)) return null;
    if (/^Last edited by/i.test(t)) return null;
    return t.replace(/\uFFFD/g, "'").replace(/�/g, "'").replace(/\\uFFFD/g, "'");
  }

  function showMissionDetail(mission, level, pageName) {
    $('#missionListView').style.display = 'none';
    $('#missionDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    const detail = missionsDetails[pageName];
    const container = $('#missionDetailContent');

    if (!detail) {
      container.innerHTML = '<div class="empty-state">No details found for "' + escapeHtml(pageName) + '".</div>';
      return;
    }

    const info = detail.info || {};
    const videoLinks = detail.videoLinks || [];

    let html = '';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + escapeHtml(detail.title || mission.name) + '</h2>';
    html += '<span class="detail-level-badge">Level ' + level + '</span>';
    var blitzVal = getInfoValue(info, 'Blitz');
    if (blitzVal) html += '<span class="detail-blitz-badge">Blitzable</span>';
    html += '<span class="detail-faction">' + escapeHtml(getInfoValue(info, 'Faction') || mission.faction) + '</span>';
    html += '</div>';

    // Info grid
    const infoFields = [
      ['Mission type', getInfoValue(info, 'Mission type')],
      ['Space type', getInfoValue(info, 'Space type')],
      ['Damage dealt', getInfoValue(info, 'Damage dealt')],
      ['Recommended damage', getInfoValue(info, 'Recommended damage dealing')],
      ['Web / Scramble', getInfoValue(info, 'Web/Scramble')],
      ['Recommended ships', getInfoValue(info, 'Recommended ship classes')],
    ].filter(([, v]) => v && v.trim());

    if (infoFields.length) {
      html += '<div class="info-grid">';
      for (const [label, value] of infoFields) {
        html += '<div class="info-card"><div class="label">' + label + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
      }
      const videoInfo = getInfoValue(info, 'Video');
      if (videoLinks.length) {
        html += '<div class="info-card"><div class="label">Video guides</div><div class="value video-link">';
        html += videoLinks.map(v => '<a href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener">' + escapeHtml(v.text || v.url) + '</a>').join(', ');
        html += '</div></div>';
      } else if (videoInfo) {
        html += '<div class="info-card"><div class="label">Video</div><div class="value">' + escapeHtml(videoInfo) + '</div></div>';
      }
      html += '</div>';
    }

    // Blitz instructions
    const blitzText = getInfoValue(info, 'Blitz');
    if (blitzText) {
      html += '<div class="detail-section"><h3>Blitz</h3><div>' + escapeHtml(blitzText) + '</div></div>';
    }

    // Pockets
    if (detail.pockets && detail.pockets.length) {
      html += '<div class="pocket-section">';
      for (const pocket of detail.pockets) {
        const heading = pocket.heading;
        const lowerHeading = heading.toLowerCase();
        const isBriefing = /^(mission )?brief(ing)?|message on warp in|info popup/i.test(lowerHeading);

        if (/^tip(s)?$/i.test(heading) && detail.tips) continue;

        if (isBriefing) {
          html += '<div class="briefing-section">';
          html += '<div class="briefing-heading">' + escapeHtml(heading) + '</div>';
          html += '<div class="briefing-content">';
        } else if (pocket.level === 'h3') {
          html += '<div class="pocket-title">' + escapeHtml(heading) + '</div>';
        } else if (pocket.level === 'h4') {
          html += '<div class="pocket-subtitle">' + escapeHtml(heading) + '</div>';
        } else if (pocket.level === 'h5') {
          html += '<div class="pocket-subgroup">' + escapeHtml(heading) + '</div>';
        }

        if (pocket.lines && pocket.lines.length) {
          const cleanLines = pocket.lines.map(cleanMissionLine).filter(Boolean);
          if (cleanLines.length) {
            if (heading === 'Ship Detail') {
              html += '<div class="npc-group"><table class="uniwiki-npc-table">';
              for (let li = 0; li < cleanLines.length; li++) {
                const cells = cleanLines[li].split(/\s{2,}/);
                html += '<tr>';
                for (const cell of cells) {
                  if (li === 0) html += '<th>' + escapeHtml(cell) + '</th>';
                  else html += '<td>' + escapeHtml(cell) + '</td>';
                }
                html += '</tr>';
              }
              html += '</table></div>';
            } else {
              html += '<div class="npc-group">';
              for (const line of cleanLines) {
                html += '<div class="npc-line">' + renderNpcLine(line) + '</div>';
              }
              html += '</div>';
            }
          }
        }

        if (isBriefing) {
          html += '</div>';
          html += '<button class="briefing-toggle">Show more</button>';
          html += '</div>';
        }
      }
      html += '</div>';
    }

    // Tips and loot
    if (detail.tips) {
      html += '<div class="briefing-section">';
      html += '<div class="briefing-heading">Tips</div>';
      html += '<div class="briefing-content"><div class="detail-section"><div>' + escapeHtml(detail.tips) + '</div></div></div>';
      html += '<button class="briefing-toggle">Show more</button>';
      html += '</div>';
    }
    if (detail.loot) {
      html += '<div class="detail-section"><h3>Loot & Bounty</h3><div>' + escapeHtml(detail.loot) + '</div></div>';
    }

    container.innerHTML = html;
  }

  function showMissionList() {
    $('#missionDetailView').style.display = 'none';
    $('#missionListView').style.display = 'block';
  }

  // ===== ANOMALIES =====
  let currentFilteredAnomalies = [];
  let anomalyActiveTab = 'green';

  function initAnomalyControls() {
    populateAnomalyFactionFilter();
    renderAnomalyList();
    $('#anomalySearchInput').addEventListener('input', renderAnomalyList);
    $('#anomalyFactionFilter').addEventListener('change', renderAnomalyList);
    $('#anomalyVariantFilter').addEventListener('change', renderAnomalyList);
    $('#anomalySpaceFilter').addEventListener('change', renderAnomalyList);
    $('#anomalyTierFilter').addEventListener('change', renderAnomalyList);
    $('#backToAnomalyList').addEventListener('click', function() { window.location.hash = '#anomalies'; });

    // Wire sub-tab buttons
    document.querySelectorAll('.anomaly-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.anomaly-subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        anomalyActiveTab = btn.dataset.type;
        renderAnomalyList();
      });
    });
  }

  function populateAnomalyFactionFilter() {
    const factions = [...new Set(anomaliesIndex.map(a => a.faction).filter(Boolean))].sort();
    const sel = $('#anomalyFactionFilter');
    factions.forEach(f => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      sel.appendChild(o);
    });
  }

  function renderAnomalyList() {
    const query = $('#anomalySearchInput').value.toLowerCase().trim();
    const faction = $('#anomalyFactionFilter').value;
    const variant = $('#anomalyVariantFilter').value;
    const space = $('#anomalySpaceFilter').value;
    const tierRange = $('#anomalyTierFilter').value;

    let filtered = anomaliesIndex;

    if (query) {
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(query) ||
        (a.faction || '').toLowerCase().includes(query)
      );
    }

    if (faction) {
      filtered = filtered.filter(a => a.faction === faction);
    }

    if (variant) {
      filtered = filtered.filter(a => a.variant === variant);
    }

    if (space) {
      filtered = filtered.filter(a => a.space && a.space[space]);
    }

    if (tierRange) {
      filtered = filtered.filter(a => {
        const t = a.tier || 0;
        if (tierRange === '0') return t === 0;
        const [lo, hi] = tierRange.split('-').map(Number);
        return t >= lo && t <= hi;
      });
    }

    // Apply active sub-tab filter
    if (anomalyActiveTab === 'scanable') {
      filtered = filtered.filter(a => a.anomalySubtype === 'scanable');
    } else if (anomalyActiveTab === 'favorites') {
      filtered = filtered.filter(a => isFavorite(a.page));
    } else {
      filtered = filtered.filter(a => a.anomalySubtype === anomalyActiveTab);
    }

    currentFilteredAnomalies = filtered;

    const container = $('#anomalyList');
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">No anomalies match your filters.</div>';
      $('#anomalyStats').textContent = 'Showing 0 anomalies';
      return;
    }

    // Group by tier
    const byTier = {};
    filtered.forEach((a, idx) => {
      const t = a.tier || 0;
      if (!byTier[t]) byTier[t] = [];
      byTier[t].push({ entry: a, idx });
    });

    const sortedTiers = Object.keys(byTier).sort((a, b) => Number(a) - Number(b));
    let html = '';

    for (const tier of sortedTiers) {
      const items = byTier[tier];
      const tierLabel = tier === '0' ? 'Unrated Complex' : 'Tier ' + tier;
      html += '<div class="tier-group">';
      html += '<div class="tier-header">' + tierLabel + ' <span class="tier-count">' + items.length + '</span></div>';
      html += '<div class="anomaly-grid">';
      for (const { entry, idx } of items) {
        html += createAnomalyCard(entry, idx);
      }
      html += '</div></div>';
    }

    container.innerHTML = html;

    // Wire click handlers using data-filtered-idx
    container.querySelectorAll('.anomaly-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.filteredIdx, 10);
        const entry = currentFilteredAnomalies[idx];
        if (entry && entry.page) {
          window.location.hash = '#anomalies/detail/' + encodeURIComponent(entry.page);
        }
      });
    });

    // Wire escalation click handlers on cards
    container.querySelectorAll('.anomaly-card-escalation').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const escPage = el.dataset.escPage;
        if (!escPage) return;
        const target = findEntryByPage(escPage);
        if (target && target.page) {
          window.location.hash = '#anomalies/detail/' + encodeURIComponent(target.page);
        } else {
          window.open('https://wiki.eveuniversity.org/' + encodeURIComponent(escPage), '_blank');
        }
      });
    });

    // Wire favorite star click handlers
    container.querySelectorAll('.favorite-star-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const page = btn.dataset.favPage;
        if (!page) return;
        toggleFavorite(page);
        const isFav = isFavorite(page);
        btn.classList.toggle('active', isFav);
        btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
      });
    });

    $('#anomalyStats').textContent = 'Showing ' + filtered.length + ' of ' + anomaliesIndex.length + ' anomalies';
  }

  function createAnomalyCard(entry, idx) {
    const space = entry.space || {};
    const dedRating = entry.dedRating || entry.level;
    let dedClass = '';
    if (dedRating) {
      if (dedRating <= 3) dedClass = 'ded-low';
      else if (dedRating <= 6) dedClass = 'ded-medium';
      else if (dedRating <= 8) dedClass = 'ded-high';
      else dedClass = 'ded-endgame';
    }
    const dedStr = dedRating ? 'DED ' + dedRating + '/10' : '';
    const slug = factionSlugMap[entry.faction] || 'rogue';
    const variantSlug = entry.variant ? entry.variant.toLowerCase() : 'normal';
    const isFav = isFavorite(entry.page);
    const subtypeLabels = { green: 'Green', escalation: 'Escalation', expedition: 'Expedition' };
    const subtypeSlugs = { green: 'green', escalation: 'complex', expedition: 'expedition' };
    const siteTypeLabel = subtypeLabels[entry.anomalySubtype] || 'Scan';
    const subtypeSlug = subtypeSlugs[entry.anomalySubtype] || 'complex';

    let html = '<div class="anomaly-card faction-' + slug + '" data-filtered-idx="' + idx + '">';
    html += '<div class="anomaly-card-header">';
    html += '<span class="anomaly-faction">' + escapeHtml(entry.faction) + '</span>';
    html += '<span class="site-type-badge site-type-' + subtypeSlug + '">' + siteTypeLabel + '</span>';
    // Show secondary type badge if this page has a dual nature
    const otherTypes = [...new Set(anomaliesIndex.filter(a => a.page === entry.page && a.anomalySubtype !== entry.anomalySubtype).map(a => subtypeLabels[a.anomalySubtype] || 'Scan').filter(Boolean))];
    for (const ot of otherTypes) {
      html += '<span class="site-type-badge site-type-dual">' + ot + '</span> ';
    }
    html += '</div>';
    html += '<div class="anomaly-card-name">' + escapeHtml(entry.name);
    if (entry.variant && entry.variant !== 'Normal') {
      html += '<span class="anomaly-variant-badge variant-' + variantSlug + '">' + escapeHtml(entry.variant) + '</span>';
    }
    html += '</div>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<div class="anomaly-card-space">';
    if (space.high) html += '<span class="space-badge space-high">High</span>';
    if (space.low) html += '<span class="space-badge space-low">Low</span>';
    if (space.null) html += '<span class="space-badge space-null">Null</span>';
    html += '</div>';
    if (dedStr) html += '<span class="anomaly-level-badge ' + dedClass + '">' + dedStr + '</span>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">';
    if (entry.escalation && entry.escalation.name) {
      html += '<div class="anomaly-card-escalation" data-esc-page="' + escapeHtml(entry.escalation.page || '') + '">Escalation: ' + escapeHtml(entry.escalation.name) + ' &rarr;</div>';
    } else {
      html += '<div></div>';
    }
    html += '<button class="favorite-star-btn' + (isFav ? ' active' : '') + '" data-fav-page="' + escapeHtml(entry.page || '') + '" title="' + (isFav ? 'Remove from favorites' : 'Add to favorites') + '">&#9733;</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function showAnomalyDetail(entry) {
    $('#anomalyListView').style.display = 'none';
    $('#anomalyDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    const container = $('#anomalyDetailContent');

    // === Data lookup ===
    // 1) EVE-Survival data
    let survivalKey = null;
    if (entry.page) {
      let key = entry.page.replace(/_/g, '');
      try { key = decodeURIComponent(key); } catch (e) { /* skip */ }
      key = key.replace(/\s+/g, '');
      if (anomaliesDetails[key]) survivalKey = key;
    }
    const survival = survivalKey ? anomaliesDetails[survivalKey] : null;
    const hasSurvivalData = survival && survival.pockets && survival.pockets.length > 0 && survival.info && Object.keys(survival.info).length > 0;

    // 2) EVE UniWiki data
    const uniwiki = entry.page ? anomaliesUniWiki[entry.page] : null;
    const hasUniWiki = uniwiki && (
      (uniwiki.npcTables && uniwiki.npcTables.length > 0) ||
      (uniwiki.info && Object.keys(uniwiki.info).length > 0) ||
      (uniwiki.description && uniwiki.description.length > 0)
    );

    let html = '';

    // === Header ===
    const dedRating = entry.dedRating || entry.level;
    const slug = factionSlugMap[entry.faction] || 'rogue';
    html += '<div class="detail-header">';
    html += '<h2>' + escapeHtml(entry.name) + '</h2>';
    html += '<span class="detail-level-badge">Tier ' + entry.tier + (dedRating ? ' &mdash; DED ' + dedRating + '/10' : '') + '</span>';
    html += '<span class="detail-faction">' + escapeHtml(entry.faction) + '</span>';
    if (entry.variant && entry.variant !== 'Normal') {
      html += '<span class="detail-faction" style="color:var(--info-color);font-size:0.85rem;">' + escapeHtml(entry.variant) + '</span>';
    }
    const isFav = isFavorite(entry.page);
    html += '<button class="favorite-star-btn' + (isFav ? ' active' : '') + '" data-fav-page="' + escapeHtml(entry.page || '') + '" title="' + (isFav ? 'Remove from favorites' : 'Add to favorites') + '" style="margin-left:auto;font-size:1.4rem;">&#9733;</button>';
    html += '</div>';

    // === Space info ===
    const space = entry.space || {};
    const spaceLabels = [];
    if (space.high) spaceLabels.push('High-Sec');
    if (space.low) spaceLabels.push('Low-Sec');
    if (space.null) spaceLabels.push('Null-Sec');
    if (spaceLabels.length) {
      html += '<div class="detail-section"><h3>Found in</h3><div>' + spaceLabels.join(', ') + '</div></div>';
    }

    // === Site Type ===
    const dtLabels = { green: 'Green Site (Combat Anomaly)', escalation: 'Escalation (DED Complex)', expedition: 'Expedition (Industrial Site)' };
    const dtSlugs = { green: 'green', escalation: 'complex', expedition: 'expedition' };
    const subtypes = [entry.anomalySubtype];
    // If multiple entries exist for this page with different subtypes, show all
    if (entry.page) {
      const allSubtypes = [...new Set(anomaliesIndex.filter(a => a.page === entry.page).map(a => a.anomalySubtype).filter(Boolean))];
      if (allSubtypes.length > 1) subtypes.push(...allSubtypes.filter(s => !subtypes.includes(s)));
    }
    html += '<div class="detail-section"><h3>Type</h3><div>';
    for (const st of [...new Set(subtypes)]) {
      const label = dtLabels[st] || (st === 'scanable' ? 'Scanable Site' : 'Scanable Site');
      const slug = dtSlugs[st] || 'complex';
      html += '<span class="site-type-badge site-type-' + slug + '">' + label + '</span> ';
    }
    html += '</div></div>';

    // === Escalation ===
    if (entry.escalation && entry.escalation.name) {
      html += '<div class="detail-section"><h3>Escalation</h3><div>';
      html += '<a class="escalation-link" data-esc-page="' + escapeHtml(entry.escalation.page || '') + '" href="#">';
      html += '<span class="anomaly-detail-escalation">' + escapeHtml(entry.escalation.name) + '</span>';
      html += '</a>';
      html += ' <span class="escalation-hint">(click to view escalated site)</span></div></div>';
    }

    // === EVE-Survival detail view (preferred) ===
    if (hasSurvivalData) {
      const info = survival.info || {};

      const infoFields = [
        ['Location', info['Location']],
        ['Damage Dealt', info['Damage Dealt']],
        ['Recommended Damage', info['Recommended Damage Dealing']],
        ['Web / Scramble', info['Web/Scramble']],
        ['Faction', info['Faction']],
      ].filter(([, v]) => v && v.trim());

      if (infoFields.length) {
        html += '<div class="info-grid">';
        for (const [label, value] of infoFields) {
          html += '<div class="info-card"><div class="label">' + label + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
        }
        html += '</div>';
      }

      // Pockets
      if (survival.pockets && survival.pockets.length) {
        html += '<div class="pocket-section">';
        for (const pocket of survival.pockets) {
          const heading = pocket.heading;
          const lowerHeading = heading.toLowerCase();
          const isBriefing = /^(mission )?brief(ing)?|message on warp in|info popup/i.test(lowerHeading);

          if (/^tip(s)?$/i.test(heading) && survival.tips) continue;

          if (isBriefing) {
            html += '<div class="briefing-section">';
            html += '<div class="briefing-heading">' + escapeHtml(heading) + '</div>';
            html += '<div class="briefing-content">';
          } else if (pocket.level === 'h3') {
            html += '<div class="pocket-title">' + escapeHtml(heading) + '</div>';
          } else if (pocket.level === 'h4') {
            html += '<div class="pocket-subtitle">' + escapeHtml(heading) + '</div>';
          } else if (pocket.level === 'h5') {
            html += '<div class="pocket-subgroup">' + escapeHtml(heading) + '</div>';
          }

          if (pocket.lines && pocket.lines.length) {
            const filteredLines = pocket.lines.map(cleanMissionLine).filter(Boolean);
            if (filteredLines.length) {
              html += '<div class="npc-group">';
              for (const line of filteredLines) {
                html += '<div class="npc-line">' + renderNpcLine(line) + '</div>';
              }
              html += '</div>';
            }
          }

          if (isBriefing) {
            html += '</div>';
            html += '<button class="briefing-toggle">Show more</button>';
            html += '</div>';
          }
        }
        html += '</div>';
      }

      if (survival.tips) {
        html += '<div class="briefing-section">';
        html += '<div class="briefing-heading">Tips</div>';
        html += '<div class="briefing-content"><div class="detail-section"><div>' + escapeHtml(survival.tips) + '</div></div></div>';
        html += '<button class="briefing-toggle">Show more</button>';
        html += '</div>';
      }
      if (survival.loot) html += '<div class="detail-section"><h3>Loot & Bounty</h3><div>' + escapeHtml(survival.loot) + '</div></div>';
    }

    // === EVE UniWiki detail view (fallback) ===
    if (!hasSurvivalData && hasUniWiki) {
      // UniWiki infobox
      const uInfo = uniwiki.info || {};
      const infoKeys = Object.keys(uInfo);
      if (infoKeys.length) {
        html += '<div class="info-grid">';
        const fieldOrder = ['Type', 'Rating', 'Found in', 'Max ship size', 'Faction', 'Best damage to deal', 'Damage to resist', 'Sig. strength'];
        for (const key of fieldOrder) {
          if (uInfo[key]) {
            html += '<div class="info-card"><div class="label">' + escapeHtml(key) + '</div><div class="value">' + escapeHtml(uInfo[key]) + '</div></div>';
          }
        }
        // Remaining keys not in fieldOrder
        for (const key of infoKeys) {
          if (!fieldOrder.includes(key)) {
            html += '<div class="info-card"><div class="label">' + escapeHtml(key) + '</div><div class="value">' + escapeHtml(uInfo[key]) + '</div></div>';
          }
        }
        html += '</div>';
      }

      // Description
      if (uniwiki.description) {
        html += '<div class="detail-section"><h3>Description</h3><div>' + escapeHtml(uniwiki.description) + '</div></div>';
      }

      // Render NPC tables and walkthrough as pockets
      const npcData = uniwiki.npcTables || [];
      const walkthrough = uniwiki.sections ? uniwiki.sections['Walkthrough'] : '';
      let pocketCounter = 0;
      let currentPockets = [];
      let hasPockets = false;

      for (const item of npcData) {
        if (!item || !item.type) continue;

        // Skip navigation/DED chain tables
        if (item.type === 'table') {
          const firstRow = item.rows && item.rows[0];
          const firstCell = firstRow ? (firstRow[0] || '') : '';
          const firstCellTrim = firstCell.trim();
        if (/^DED\s+Complexes/.test(firstCellTrim) ||
            /^Combat\s+Anomalies/.test(firstCellTrim) ||
            /^(Angel\s+Cartel|Blood\s+Raiders|Guristas\s+Pirates|Sansha'\s*s\s+Nation|Serpentis\s+Corporation|Rogue\s+Drones)$/i.test(firstCellTrim)) {
          continue; // Skip navigation tables
        }
        }

        if (item.type === 'desc') {
          // Start a new pocket for each description
          if (currentPockets.length > 0) {
            hasPockets = true;
            pocketCounter++;
            html += '<div class="pocket-section">';
            html += '<div class="pocket-title">Pocket ' + pocketCounter + '</div>';
            for (const p of currentPockets) {
              if (p.type === 'desc') html += '<div class="pocket-desc">' + escapeHtml(p.text) + '</div>';
              else if (p.type === 'table') html += renderUniWikiTable2(p.rows);
            }
            html += '</div>';
            currentPockets = [];
          }
          currentPockets.push({ type: 'desc', text: item.text });
        } else if (item.type === 'table') {
          currentPockets.push({ type: 'table', rows: item.rows });
        } else if (item.type === 'header') {
          currentPockets.push({ type: 'desc', text: item.text });
        }
      }

      // Last pocket
      if (currentPockets.length > 0) {
        hasPockets = true;
        pocketCounter++;
        html += '<div class="pocket-section">';
        html += '<div class="pocket-title">Pocket ' + pocketCounter + '</div>';
        for (const p of currentPockets) {
          if (p.type === 'desc') html += '<div class="pocket-desc">' + escapeHtml(p.text) + '</div>';
          else if (p.type === 'table') html += renderUniWikiTable2(p.rows);
        }
        html += '</div>';
      }

      // If no pockets but there are sections, show them
      if (!hasPockets && walkthrough) {
        html += '<div class="detail-section"><h3>Walkthrough</h3><div class="uniwiki-content">' + formatUniWikiContent(walkthrough) + '</div></div>';
      }
    }

    // === No data ===
    if (!hasSurvivalData && !hasUniWiki) {
      html += '<div class="empty-state">No detailed guide data available for this anomaly.</div>';
    }

    // === External links ===
    if (entry.page) {
      html += '<div class="detail-section external-link">';
      html += '<p>View on <a href="' + escapeHtml('https://wiki.eveuniversity.org/' + entry.page) + '" target="_blank" rel="noopener">EVE University Wiki</a> for more details.</p>';
      html += '</div>';
    }

    // === Next/Prev Navigation ===
    if (currentFilteredAnomalies.length > 1) {
      const currentIdx = currentFilteredAnomalies.findIndex(a => a.page === entry.page);
      if (currentIdx >= 0) {
        const prev = currentIdx > 0 ? currentFilteredAnomalies[currentIdx - 1] : null;
        const next = currentIdx < currentFilteredAnomalies.length - 1 ? currentFilteredAnomalies[currentIdx + 1] : null;
        html += '<div class="anomaly-nav">';
        if (prev) {
          html += '<a class="anomaly-nav-btn" href="#anomalies/detail/' + encodeURIComponent(prev.page) + '">';
          html += '<span class="nav-label">&larr; Previous</span>';
          html += '<span class="nav-name">' + escapeHtml(prev.name) + '</span>';
          html += '</a>';
        } else {
          html += '<div></div>';
        }
        if (next) {
          html += '<a class="anomaly-nav-btn" href="#anomalies/detail/' + encodeURIComponent(next.page) + '">';
          html += '<span class="nav-label">Next &rarr;</span>';
          html += '<span class="nav-name">' + escapeHtml(next.name) + '</span>';
          html += '</a>';
        } else {
          html += '<div></div>';
        }
        html += '</div>';
      }
    }

    container.innerHTML = html;

    // Wire escalation click handler
    const escLink = container.querySelector('.escalation-link');
    if (escLink) {
      escLink.addEventListener('click', (e) => {
        e.preventDefault();
        const escPage = escLink.dataset.escPage;
        if (!escPage) return;
        const target = findEntryByPage(escPage);
        if (target && target.page) {
          window.location.hash = '#anomalies/detail/' + encodeURIComponent(target.page);
        } else {
          window.open('https://wiki.eveuniversity.org/' + encodeURIComponent(escPage), '_blank');
        }
      });
    }

    // Wire favorite star in detail view
    const favBtn = container.querySelector('.favorite-star-btn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        const page = favBtn.dataset.favPage;
        if (!page) return;
        toggleFavorite(page);
        const isFav = isFavorite(page);
        favBtn.classList.toggle('active', isFav);
        favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
      });
    }
  }

  function findEntryByPage(page) {
    // Normalize: remove leading slash, URL decode
    let normalized = page.replace(/^\/+/, '');
    try { normalized = decodeURIComponent(normalized); } catch (e) { /* skip */ }
    // Try exact match first, then try decoding variations
    for (const entry of anomaliesIndex) {
      if (entry.page === normalized) return entry;
      // Try with URL encoding
      if (encodeURIComponent(entry.page) === normalized) return entry;
      // Try decoded version
      let entryDecoded = entry.page;
      try { entryDecoded = decodeURIComponent(entry.page); } catch (e) { /* skip */ }
      if (entryDecoded === normalized) return entry;
    }
    return null;
  }

  function formatUniWikiContent(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const filtered = lines.filter(l => {
      const t = l.toLowerCase();
      // Skip DED/combat navigation tables
      if (/^ded\s+complexes/i.test(t)) return false;
      if (/^combat\s+anomalies/i.test(t)) return false;
      if (/^(angel\s+cartel|blood\s+raiders|guristas\s+pirates|sansha'\s*s\s+nation|serpentis\s+corporation|rogue\s+drones)\b/i.test(t) && /\d+\/10/.test(t)) return false;
      if (/^\d+\/10/.test(t)) return false;
      if (/^hidden\s*·\s*forsaken\s*·\s*forlorn/i.test(t)) return false;
      if (/^last\s+modified|retrieved\s+from|content\s+is\s+available|copyright/i.test(t)) return false;
      // Skip lines that are just DED entries (e.g., "5/10Outgrowth Rogue Drone Hive")
      if (/\b\d+\/10[A-Z]/i.test(t)) return false;
      // Skip lines that are just navigation links
      if (/^(hideaway|burrow|refuge|den|yard|rally\s+point|port|hub|haven|sanctum|cluster|collection|assembly|gathering|surveillance|menagerie|herd|squad|patrol|horde|drone\s+infested\s+mine)\s*$/i.test(t)) return false;
      // Skip lines that are just DED ratings
      if (/^(\d+\/10\s*)+$/i.test(t)) return false;
      return true;
    });
    return filtered.map(l => '<div class="npc-line">' + escapeHtml(l) + '</div>').join('');
  }

  function renderUniWikiTable2(rows) {
    if (!rows || rows.length < 1) return '';
    const header = rows[0] || [];
    const isNpcTable = header.some(h => h === 'WD') && header.some(h => h === 'EWAR');
    // Check if column counts are consistent across rows
    const colCounts = rows.map(r => r.length);
    const maxCols = Math.max(...colCounts);
    const minCols = Math.min(...colCounts);
    const hasConsistentCols = maxCols === minCols;
    let html = '<div class="npc-group">';
    if (isNpcTable) {
      html += '<table class="uniwiki-npc-table">';
      for (let r = 0; r < rows.length; r++) {
        html += '<tr>';
        for (let c = 0; c < rows[r].length; c++) {
          const raw = rows[r][c];
          const cell = r > 0 && c === 0 ? formatNpcCell(raw) : escapeHtml(raw);
          if (r === 0) html += '<th>' + cell + '</th>';
          else if (c === 0) html += '<td class="npc-desc">' + cell + '</td>';
          else html += '<td>' + cell + '</td>';
        }
        html += '</tr>';
      }
      html += '</table>';
    } else if (hasConsistentCols) {
      html += '<table class="uniwiki-npc-table">';
      for (let r = 0; r < rows.length; r++) {
        html += '<tr>';
        for (let c = 0; c < rows[r].length; c++) {
          const cell = escapeHtml(rows[r][c]);
          if (r === 0) html += '<th>' + cell + '</th>';
          else html += '<td>' + cell + '</td>';
        }
        html += '</tr>';
      }
      html += '</table>';
    } else {
      // Inconsistent column counts: render as horizontal cell list per row
      html += '<div class="uniwiki-inline-table">';
      for (let r = 0; r < rows.length; r++) {
        html += '<div class="inline-row">';
        for (let c = 0; c < rows[r].length; c++) {
          const raw = rows[r][c];
          const cell = escapeHtml(raw);
          if (r === 0) html += '<span class="inline-cell inline-header">' + cell + '</span>';
          else html += '<span class="inline-cell">' + (cell || '\u00A0') + '</span>';
          if (c < rows[r].length - 1) html += '<span class="inline-sep">|</span>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function formatNpcCell(text) {
    // Escape then replace tags with badges
    let out = escapeHtml(text);
    out = out.replace(/\[ewar:([^\]]+)\]/g, function(_, ewar) {
      const types = ewar.split('/').map(t => t.trim()).filter(Boolean);
      return types.map(t => '<span class="badge badge-ewar">' + escapeHtml(t) + '</span>').join(' ');
    });
    out = out.replace(/\[trigger:([^\]]+)\]/g, function(_, trigger) {
      return '<span class="badge badge-trigger">' + escapeHtml(trigger) + '</span>';
    });
    out = out.replace(/\[note:([^\]]+)\]/g, function(_, note) {
      return '<span class="badge badge-note">' + escapeHtml(note) + '</span>';
    });
    return out;
  }

  function showAnomalyList() {
    $('#anomalyDetailView').style.display = 'none';
    $('#anomalyListView').style.display = 'block';
  }

  // ===== BURNERS =====
  let currentFilteredBurners = [];

  function initBurnerControls() {
    populateBurnerFactionFilter();
    renderBurnerList();
    $('#burnerSearchInput').addEventListener('input', renderBurnerList);
    $('#burnerTypeFilter').addEventListener('change', renderBurnerList);
    $('#burnerFactionFilter').addEventListener('change', renderBurnerList);
    $('#backToBurnerList').addEventListener('click', function() { window.location.hash = '#burners'; });
  }

  function populateBurnerFactionFilter() {
    const factions = [...new Set(Object.values(burnersData).map(b => b.faction).filter(Boolean))].sort();
    const sel = $('#burnerFactionFilter');
    factions.forEach(f => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      sel.appendChild(o);
    });
  }

  function renderBurnerList() {
    const query = $('#burnerSearchInput').value.toLowerCase().trim();
    const typeFilter = $('#burnerTypeFilter').value;
    const factionFilter = $('#burnerFactionFilter').value;

    let entries = Object.values(burnersData);
    if (query) {
      entries = entries.filter(b => b.name.toLowerCase().includes(query) || (b.faction || '').toLowerCase().includes(query));
    }
    if (typeFilter) {
      entries = entries.filter(b => b.type === typeFilter);
    }
    if (factionFilter) {
      entries = entries.filter(b => b.faction === factionFilter);
    }

    currentFilteredBurners = entries;
    const container = $('#burnerList');
    container.innerHTML = '';

    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state">No burners match your filters.</div>';
      $('#burnerStats').textContent = 'Showing 0 burner missions';
      return;
    }

    // Group by type
    const byType = {};
    entries.forEach(b => {
      const t = b.type || 'Unknown';
      if (!byType[t]) byType[t] = [];
      byType[t].push(b);
    });

    let html = '';
    const order = ['Agent', 'Team', 'Base'];
    for (const type of order) {
      const items = byType[type];
      if (!items) continue;
      html += '<div class="tier-group">';
      html += '<div class="tier-header">' + type + '</div>';
      html += '<div class="anomaly-grid">';
      for (const b of items) {
        html += '<div class="anomaly-card" data-page="' + escapeHtml(b.page) + '">';
        html += '<div class="anomaly-card-name">' + escapeHtml(b.name) + '</div>';
        html += '<div class="anomaly-card-faction">' + escapeHtml(b.faction) + '</div>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    container.innerHTML = html;
    $('#burnerStats').textContent = 'Showing ' + entries.length + ' of ' + Object.keys(burnersData).length + ' burner missions';

    container.querySelectorAll('.anomaly-card').forEach(card => {
      card.addEventListener('click', () => {
        const page = card.dataset.page;
        if (page) window.location.hash = '#burners/detail/' + encodeURIComponent(page);
      });
    });
  }

  // Map burner name to EVE-Survival wakka key
  function getBurnerSurvivalKey(name) {
    for (var key in burnersSurvival) {
      if (burnersSurvival[key].name === name) return key;
    }
    return null;
  }

  function showBurnerDetail(entry) {
    $('#burnerListView').style.display = 'none';
    $('#burnerDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    const container = $('#burnerDetailContent');
    const survivalKey = getBurnerSurvivalKey(entry.name);
    const survival = survivalKey ? burnersSurvival[survivalKey] : null;
    const hasSurvival = survival && survival.info && Object.keys(survival.info).length > 0;

    // Build info grid — consistent basic fields for all burners
    const shipRestrict = entry.type === 'Base' ? 'Battlecruiser' : 'Frigate';
    let infoGrid = [
      ['Faction', entry.faction],
      ['Best damage to deal', entry.bestDamageToDeal],
      ['Damage to resist', entry.damageToResist],
      ['Ship restriction', shipRestrict],
      ['Mission type', 'Encounter'],
      ['Space type', 'Deadspace'],
    ].filter(([, v]) => v && v.trim());

    let html = '';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + escapeHtml(entry.name) + '</h2>';
    html += '<span class="detail-level-badge">' + escapeHtml(entry.type) + '</span>';
    html += '<span class="detail-faction">' + escapeHtml(entry.faction) + '</span>';
    html += '</div>';

    // Info grid
    html += '<div class="info-grid">';
    for (var ii = 0; ii < infoGrid.length; ii++) {
      html += '<div class="info-card"><div class="label">' + infoGrid[ii][0] + '</div><div class="value">' + escapeHtml(infoGrid[ii][1]) + '</div></div>';
    }
    var vLinks = survival ? (survival.videoLinks || []) : [];
    if (vLinks.length) {
      html += '<div class="info-card"><div class="label">Video guides</div><div class="value video-link">';
      html += vLinks.map(function(v) { return '<a href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener">' + escapeHtml(v.text || v.url) + '</a>'; }).join(', ');
      html += '</div></div>';
    } else if (hasSurvival && survival.info['Video']) {
      html += '<div class="info-card"><div class="label">Video</div><div class="value">' + escapeHtml(survival.info['Video']) + '</div></div>';
    }
    html += '</div>';

    // === Mission content: always use UniWiki data for consistency ===
    var briefing = '';
    var pocketGroups = [];

    var tables = (entry.npcTables || []).slice();
    if (tables.length > 0 && tables[0].type === 'table' && tables[0].rows && tables[0].rows.length >= 2) {
      var firstRow = tables[0].rows[0] || [];
      if (firstRow[0] === 'Mission briefing') {
        briefing = tables[0].rows.slice(1).map(function(r) { return r.join(' '); }).join(' ');
        tables.shift();
      }
    }

    var sections = entry.sections || {};
    var secKeys = Object.keys(sections);
    var secIdx = 0;

    for (var ti = 0; ti < tables.length; ti++) {
      var tbl = tables[ti];
      if (tbl.type !== 'table' || !tbl.rows || tbl.rows.length < 1) continue;

      var sectionName = (secIdx < secKeys.length) ? secKeys[secIdx] : 'Room ' + (ti + 1);
      var rows = [];
      for (var ri = 1; ri < tbl.rows.length; ri++) {
        var line = tbl.rows[ri].join(' ').trim();
        if (line) {
          line = line.replace(/^Wave\s+\d+\s*[-–]\s*/i, '');
          if (/Acceleration Gate/i.test(line)) continue;
          rows.push(line);
        }
      }
      if (rows.length) {
        pocketGroups.push({ title: sectionName, lines: rows });
        if (secIdx < secKeys.length) secIdx++;
      }
    }

    if (briefing) {
      html += '<div class="briefing-section">';
      html += '<div class="briefing-heading">Mission briefing</div>';
      html += '<div class="briefing-content"><div class="detail-section"><div>' + escapeHtml(briefing) + '</div></div></div>';
      html += '<button class="briefing-toggle">Show more</button>';
      html += '</div>';
    }

    if (pocketGroups.length) {
      var shipDamage = entry.shipDamage || {};
      html += '<div class="pocket-section">';
      for (var gi = 0; gi < pocketGroups.length; gi++) {
        var group = pocketGroups[gi];
        html += '<div class="pocket-title">' + escapeHtml(group.title) + '</div>';
        html += '<div class="npc-group">';
        for (var li = 0; li < group.lines.length; li++) {
          var line = group.lines[li];
          var dmgTag = '';
          for (var shipName in shipDamage) {
            if (line.toLowerCase().includes(shipName.toLowerCase())) {
              var dmgTypes = shipDamage[shipName].split(/\s+/);
              var tags = [];
              for (var t = 0; t < dmgTypes.length; t++) {
                var cls = dmgTypes[t].toLowerCase();
                tags.push('<span class="tag tag-dmg tag-dmg-' + cls + '">deal ' + dmgTypes[t] + '</span>');
              }
              dmgTag = ' ' + tags.join(' ');
              break;
            }
          }
          html += '<div class="npc-line">' + renderNpcLine(line) + dmgTag + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    // External link
    if (entry.page) {
      html += '<div class="detail-section external-link">';
      html += '<p>View on <a href="' + escapeHtml('https://wiki.eveuniversity.org/' + entry.page) + '" target="_blank" rel="noopener">EVE University Wiki</a> for more details.</p>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function showBurnerList() {
    $('#burnerDetailView').style.display = 'none';
    $('#burnerListView').style.display = 'block';
  }

  // ===== AGENTS =====
  function initAgentControls() {
    renderAgentList();
    $('#agentSearchInput').addEventListener('input', renderAgentList);
    $('#agentDivisionFilter').addEventListener('change', renderAgentList);
    $('#agentLevelFilter').addEventListener('change', renderAgentList);
    $('#backToAgentList').addEventListener('click', function() { window.location.hash = '#agents'; });
  }

  function renderAgentList() {
    const query = $('#agentSearchInput').value.toLowerCase().trim();
    const divisionFilter = $('#agentDivisionFilter').value;
    const levelFilter = $('#agentLevelFilter').value;

    let filtered = agentsData;

    if (query) {
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.corporation.toLowerCase().includes(query) ||
        a.solarSystem.toLowerCase().includes(query) ||
        a.division.toLowerCase().includes(query) ||
        a.faction.toLowerCase().includes(query)
      );
    }

    if (divisionFilter) {
      filtered = filtered.filter(a => a.division === divisionFilter);
    }

    if (levelFilter) {
      filtered = filtered.filter(a => a.level === parseInt(levelFilter, 10));
    }

    // Group by corporation
    const byCorp = {};
    filtered.forEach(a => {
      const corp = a.corporation || 'Unknown Corporation';
      if (!byCorp[corp]) byCorp[corp] = { agents: [], faction: a.faction, corpID: a.corporationID };
      byCorp[corp].agents.push(a);
    });

    const container = $('#agentList');
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">No agents match your filters.</div>';
      $('#agentStats').textContent = 'Showing 0 agents';
      return;
    }

    const sortedCorps = Object.keys(byCorp).sort();
    let html = '';
    for (const corp of sortedCorps) {
      const group = byCorp[corp];
      html += '<div class="corp-group">';
      html += '<div class="corp-header">';
      html += '<span class="corp-name">' + escapeHtml(corp) + '</span>';
      if (group.faction) html += '<span class="corp-faction">' + escapeHtml(group.faction) + '</span>';
      html += '<span class="corp-count">' + group.agents.length + ' agent' + (group.agents.length !== 1 ? 's' : '') + '</span>';
      html += '</div>';

      for (const a of group.agents) {
        html += '<div class="agent-row" data-cid="' + a.characterID + '">';
        html += '<span class="agent-name">' + escapeHtml(a.name) + '</span>';
        html += '<span class="agent-division badge-' + a.division.toLowerCase() + '">' + escapeHtml(a.division) + '</span>';
        html += '<span class="level-badge active agent-level">' + a.level + '</span>';
        html += '<span class="agent-location">' + escapeHtml(a.solarSystem) + '</span>';
        html += '<span class="agent-security">' + (a.securityStatus !== null ? formatSecurity(a.securityStatus) : '') + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.agent-row').forEach(row => {
      row.addEventListener('click', () => {
        const cid = row.dataset.cid;
        if (cid) window.location.hash = '#agents/detail/' + cid;
      });
    });

    $('#agentStats').textContent = 'Showing ' + filtered.length + ' of ' + agentsData.length + ' agents';
  }

  function formatSecurity(status) {
    if (status === null || status === undefined) return '';
    const label = status >= 0.5 ? 'H' : status >= 0.0 ? 'L' : 'N';
    const cls = status >= 0.5 ? 'space-high' : status >= 0.0 ? 'space-low' : 'space-null';
    return '<span class="space-badge ' + cls + '">' + label + '</span>';
  }

  function showAgentDetail(agent) {
    $('#agentListView').style.display = 'none';
    $('#agentDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    const container = $('#agentDetailContent');

    let html = '';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + escapeHtml(agent.name) + '</h2>';
    html += '<span class="detail-level-badge">Level ' + agent.level + '</span>';
    html += '<span class="detail-faction">' + escapeHtml(agent.faction) + '</span>';
    html += '</div>';

    // Info grid
    const infoFields = [
      ['Corporation', agent.corporation],
      ['Division', agent.division],
      ['Agent type', agent.agentType],
      ['Level', agent.level],
      ['System', agent.solarSystem],
      ['Security', agent.securityStatus !== null ? agent.securityStatus.toFixed(3) : ''],
      ['Station', agent.station || (agent.locationType === 'space' ? 'In space' : '')],
    ].filter(([, v]) => v && v.trim());

    html += '<div class="info-grid">';
    for (const [label, value] of infoFields) {
      html += '<div class="info-card"><div class="label">' + label + '</div><div class="value">';
      if (label === 'Security') {
        html += formatSecurity(agent.securityStatus);
      } else {
        html += escapeHtml(value);
      }
      html += '</div></div>';
    }
    html += '</div>';

    // Same-corp agents
    const corpAgents = agentsData.filter(a => a.corporationID === agent.corporationID && a.characterID !== agent.characterID);
    if (corpAgents.length > 0) {
      html += '<div class="detail-section"><h3>Other ' + escapeHtml(agent.corporation) + ' agents</h3>';
      html += '<div class="corp-agent-list">';
      for (const ca of corpAgents) {
        html += '<div class="agent-row" data-cid="' + ca.characterID + '">';
        html += '<span class="agent-name">' + escapeHtml(ca.name) + '</span>';
        html += '<span class="agent-division badge-' + ca.division.toLowerCase() + '">' + escapeHtml(ca.division) + '</span>';
        html += '<span class="level-badge active agent-level">' + ca.level + '</span>';
        html += '<span class="agent-location">' + escapeHtml(ca.solarSystem) + '</span>';
        html += '<span class="agent-security">' + formatSecurity(ca.securityStatus) + '</span>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    // Browse missions link
    html += '<div class="detail-section mission-ref">';
    html += '<h3>Related Missions</h3>';
    html += '<p>Missions potentially available at Level ' + agent.level + ' (' + agent.division + '):</p>';

    const matchingMissions = missionsIndex.filter(m => m.levels[agent.level]);
    if (matchingMissions.length > 0) {
      html += '<div class="related-missions">';
      for (const m of matchingMissions.slice(0, 10)) {
        html += '<span class="mission-pill" data-mission="' + escapeHtml(m.name) + '" data-level="' + agent.level + '" data-page="' + escapeHtml(m.levels[agent.level]) + '">' + escapeHtml(m.name) + '</span>';
      }
      if (matchingMissions.length > 10) {
        html += '<span class="mission-pill-more">+' + (matchingMissions.length - 10) + ' more</span>';
      }
      html += '</div>';
    }

    html += '<p><a href="#" class="browse-link" data-level="' + agent.level + '" data-division="' + escapeHtml(agent.division) + '">Browse all Level ' + agent.level + ' missions &rarr;</a></p>';
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.agent-row').forEach(row => {
      row.addEventListener('click', () => {
        const cid = row.dataset.cid;
        if (cid) window.location.hash = '#agents/detail/' + cid;
      });
    });

    container.querySelectorAll('.mission-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const level = pill.dataset.level;
        const page = pill.dataset.page;
        if (page) {
          window.location.hash = '#missions/detail/' + level + '/' + encodeURIComponent(page);
        }
      });
    });

    const browseLink = container.querySelector('.browse-link');
    if (browseLink) {
      browseLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '#missions';
        $('#levelFilter').value = browseLink.dataset.level;
        renderMissionList();
      });
    }
  }

  function showAgentList() {
    $('#agentDetailView').style.display = 'none';
    $('#agentListView').style.display = 'block';
  }

  // ===== EPIC ARCS =====
  let currentEpicArcsFiltered = [];

  function initEpicArcControls() {
    renderEpicArcList();
    $('#epicArcSearchInput').addEventListener('input', renderEpicArcList);
    $('#backToEpicArcList').addEventListener('click', function() { window.location.hash = '#epicarcs'; });
    $('#backToEpicArcDetail').addEventListener('click', function() {
      if (currentArcId) window.location.hash = '#epicarcs/detail/' + encodeURIComponent(currentArcId);
    });
  }

  function renderEpicArcList() {
    const query = $('#epicArcSearchInput').value.toLowerCase().trim();

    let filtered = epicArcsIndex;
    if (query) {
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(query) ||
        (a.faction || '').toLowerCase().includes(query)
      );
    }

    currentEpicArcsFiltered = filtered;
    const container = $('#epicArcList');
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">No epic arcs match your filters.</div>';
      $('#epicArcStats').textContent = 'Showing 0 epic arcs';
      return;
    }

    let html = '<div class="anomaly-grid">';
    for (const arc of filtered) {
      const totalMissions = arc.chapters.reduce((sum, ch) => sum + (ch.missions ? ch.missions.length : 0), 0);
      html += '<div class="anomaly-card epic-arc-card" data-arc-id="' + escapeHtml(arc.id) + '">';
      html += '<div class="anomaly-card-header">';
      html += '<span class="anomaly-faction">' + escapeHtml(arc.faction) + '</span>';
      html += '<span class="detail-level-badge">Level ' + arc.level + '</span>';
      html += '</div>';
      html += '<div class="anomaly-card-name">' + escapeHtml(arc.name) + '</div>';
      if (arc.startingSystem) {
        html += '<div class="epic-arc-meta">' + escapeHtml(arc.startingSystem) + (arc.region ? ', ' + escapeHtml(arc.region) : '') + '</div>';
      }
      html += '<div class="epic-arc-meta">' + arc.chapters.length + ' chapter' + (arc.chapters.length !== 1 ? 's' : '') + ' &middot; ' + totalMissions + ' mission' + (totalMissions !== 1 ? 's' : '') + '</div>';
      html += '</div>';
    }
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.epic-arc-card').forEach(card => {
      card.addEventListener('click', () => {
        const arcId = card.dataset.arcId;
        if (arcId) window.location.hash = '#epicarcs/detail/' + encodeURIComponent(arcId);
      });
    });

    $('#epicArcStats').textContent = 'Showing ' + filtered.length + ' of ' + epicArcsIndex.length + ' epic arcs';
  }

  function showEpicArcDetail(arc) {
    $('#epicArcListView').style.display = 'none';
    $('#epicArcDetailView').style.display = 'block';
    $('#epicArcMissionDetailView').style.display = 'none';
    window.scrollTo(0, 0);
    currentArcId = arc.id;

    const container = $('#epicArcDetailContent');

    const totalMissions = arc.chapters.reduce((sum, ch) => sum + (ch.missions ? ch.missions.length : 0), 0);

    let html = '';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + escapeHtml(arc.name) + '</h2>';
    html += '<span class="detail-level-badge">Level ' + arc.level + '</span>';
    html += '<span class="detail-faction">' + escapeHtml(arc.faction) + '</span>';
    html += '</div>';

    // Overview info grid
    html += '<div class="info-grid">';
    if (arc.startingAgent) {
      html += '<div class="info-card"><div class="label">Starting Agent</div><div class="value">' + escapeHtml(arc.startingAgent) + '</div></div>';
    }
    if (arc.startingSystem) {
      html += '<div class="info-card"><div class="label">Starting System</div><div class="value">' + escapeHtml(arc.startingSystem) + '</div></div>';
    }
    if (arc.region) {
      html += '<div class="info-card"><div class="label">Region</div><div class="value">' + escapeHtml(arc.region) + '</div></div>';
    }
    html += '<div class="info-card"><div class="label">Chapters</div><div class="value">' + arc.chapters.length + '</div></div>';
    html += '<div class="info-card"><div class="label">Missions</div><div class="value">' + totalMissions + '</div></div>';
    if (arc.standingsRequired) {
      html += '<div class="info-card"><div class="label">Standings Required</div><div class="value">' + escapeHtml(arc.standingsRequired) + '</div></div>';
    }
    if (arc.additionalRequirements) {
      html += '<div class="info-card"><div class="label">Additional Requirements</div><div class="value">' + escapeHtml(arc.additionalRequirements) + '</div></div>';
    }
    html += '</div>';

    // Description
    if (arc.description) {
      html += '<div class="detail-section"><h3>About</h3><div>' + escapeHtml(arc.description) + '</div></div>';
    }

    // Chapters accordion
    html += '<div class="epic-arc-chapters">';
    for (const ch of arc.chapters) {
      const hasMissions = ch.missions && ch.missions.length > 0;
      html += '<div class="epic-arc-chapter">';
      html += '<div class="epic-arc-chapter-header" data-chapter="' + escapeHtml(ch.name) + '">';
      html += '<span class="epic-arc-chapter-name">Chapter ' + ch.order + ': ' + escapeHtml(ch.name) + '</span>';
      html += '<span class="epic-arc-chapter-count">' + (hasMissions ? ch.missions.length + ' mission' + (ch.missions.length !== 1 ? 's' : '') : 'Coming Soon') + '</span>';
      html += '<span class="epic-arc-chapter-toggle">&#9660;</span>';
      html += '</div>';
      html += '<div class="epic-arc-chapter-content">';
      if (hasMissions) {
        html += '<div class="chapter-mission-list">';
        for (let mi = 0; mi < ch.missions.length; mi++) {
          const missionKey = ch.missions[mi];
          const detail = epicArcsDetails[missionKey];
          const missionName = detail ? detail.title : missionKey;
          html += '<div class="chapter-mission-item" data-mission-key="' + escapeHtml(missionKey) + '">';
          html += '<span class="chapter-mission-number">' + (mi + 1) + '.</span>';
          html += '<span class="chapter-mission-name">' + escapeHtml(missionName) + '</span>';
          if (detail && detail.info && detail.info['Mission type']) {
            html += '<span class="chapter-mission-type">' + escapeHtml(detail.info['Mission type']) + '</span>';
          }
          html += '</div>';
        }
        html += '</div>';
      } else {
        html += '<div class="chapter-coming-soon">Mission data coming soon.</div>';
      }
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    container.innerHTML = html;

    // Wire chapter accordion toggles
    container.querySelectorAll('.epic-arc-chapter-header').forEach(header => {
      header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const toggle = header.querySelector('.epic-arc-chapter-toggle');
        const isOpen = content.classList.toggle('open');
        toggle.innerHTML = isOpen ? '&#9650;' : '&#9660;';
      });
    });

    // Wire mission click handlers
    container.querySelectorAll('.chapter-mission-item').forEach(item => {
      item.addEventListener('click', () => {
        const missionKey = item.dataset.missionKey;
        if (missionKey) {
          window.location.hash = '#epicarcs/mission/' + encodeURIComponent(missionKey);
        }
      });
    });
  }

  function showEpicArcMissionDetail(pageName) {
    $('#epicArcListView').style.display = 'none';
    $('#epicArcDetailView').style.display = 'none';
    $('#epicArcMissionDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    const detail = epicArcsDetails[pageName];
    const container = $('#epicArcMissionDetailContent');

    if (!detail) {
      container.innerHTML = '<div class="empty-state">No details found for this mission.</div>';
      return;
    }

    if (detail.comingSoon) {
      container.innerHTML = '<div class="coming-soon-page"><h2>Coming Soon</h2><p>Detailed mission data for <strong>Vision of Greatness</strong> is not yet available. This epic arc was released on June 9, 2026 as part of the <em>Cradle of War</em> expansion. Check back once community guides are published.</p><div class="info-grid"><div class="info-card"><div class="label">Faction</div><div class="value">' + escapeHtml(detail.info['Faction'] || '') + '</div></div><div class="info-card"><div class="label">Starting System</div><div class="value">' + escapeHtml(detail.info['Starting System'] || '') + '</div></div><div class="info-card"><div class="label">Region</div><div class="value">' + escapeHtml(detail.info['Region'] || '') + '</div></div></div></div>';
      return;
    }

    const info = detail.info || {};

    let html = '';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + escapeHtml(detail.title) + '</h2>';
    html += '<span class="detail-faction">' + escapeHtml(info['Faction'] || '') + '</span>';
    if (detail.arc) {
      const arc = epicArcsIndex.find(a => a.id === detail.arc);
      html += '<span class="detail-faction" style="color:var(--accent-color);font-size:0.85rem;">' + escapeHtml(arc ? arc.name : detail.arc) + '</span>';
    }
    html += '</div>';

    // Info grid — show all available info fields
    const infoEntries = Object.entries(info).filter(([, v]) => v && v.trim());
    if (infoEntries.length) {
      html += '<div class="info-grid">';
      for (const [key, value] of infoEntries) {
        html += '<div class="info-card"><div class="label">' + escapeHtml(key) + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
      }
      html += '</div>';
    }

    // Pockets
    if (detail.pockets && detail.pockets.length) {
      html += '<div class="pocket-section">';
      for (const pocket of detail.pockets) {
        const heading = pocket.heading;
        const lowerHeading = heading.toLowerCase();
        const isBriefing = /^(mission )?brief(ing)?|message on warp in|info popup/i.test(lowerHeading);

        if (/^tip(s)?$/i.test(heading) && detail.tips) continue;

        if (isBriefing) {
          html += '<div class="briefing-section">';
          html += '<div class="briefing-heading">' + escapeHtml(heading) + '</div>';
          html += '<div class="briefing-content">';
        } else if (pocket.level === 'h3') {
          html += '<div class="pocket-title">' + escapeHtml(heading) + '</div>';
        } else if (pocket.level === 'h4') {
          html += '<div class="pocket-subtitle">' + escapeHtml(heading) + '</div>';
        } else if (pocket.level === 'h5') {
          html += '<div class="pocket-subgroup">' + escapeHtml(heading) + '</div>';
        }

        if (pocket.lines && pocket.lines.length) {
          const cleanLines = pocket.lines.map(cleanMissionLine).filter(Boolean);
          if (cleanLines.length) {
            html += '<div class="npc-group">';
            for (const line of cleanLines) {
              html += '<div class="npc-line">' + renderNpcLine(line) + '</div>';
            }
            html += '</div>';
          }
        }

        if (isBriefing) {
          html += '</div>';
          html += '<button class="briefing-toggle">Show more</button>';
          html += '</div>';
        }
      }
      html += '</div>';
    }

    // Tips and loot
    if (detail.tips) {
      html += '<div class="briefing-section">';
      html += '<div class="briefing-heading">Tips</div>';
      html += '<div class="briefing-content"><div class="detail-section"><div>' + escapeHtml(detail.tips) + '</div></div></div>';
      html += '<button class="briefing-toggle">Show more</button>';
      html += '</div>';
    }
    if (detail.loot) {
      html += '<div class="detail-section"><h3>Loot & Bounty</h3><div>' + escapeHtml(detail.loot) + '</div></div>';
    }

    // Next / Previous mission navigation
    if (detail.arc) {
      const arc = epicArcsIndex.find(a => a.id === detail.arc);
      if (arc) {
        const chapters = arc.chapters.slice().sort((a, b) => a.order - b.order);
        let prevKey = null;
        let prevTitle = null;
        let nextKey = null;
        let nextTitle = null;

        for (let ci = 0; ci < chapters.length; ci++) {
          const ch = chapters[ci];
          if (!ch.missions) continue;
          const mi = ch.missions.indexOf(pageName);
          if (mi >= 0) {
            if (mi > 0) {
              prevKey = ch.missions[mi - 1];
            } else if (ci > 0 && chapters[ci - 1].missions) {
              const prevCh = chapters[ci - 1];
              prevKey = prevCh.missions[prevCh.missions.length - 1];
            }
            if (mi < ch.missions.length - 1) {
              nextKey = ch.missions[mi + 1];
            } else if (ci < chapters.length - 1 && chapters[ci + 1].missions) {
              const nextCh = chapters[ci + 1];
              nextKey = nextCh.missions[0];
            }
            break;
          }
        }

        if (prevKey || nextKey) {
          html += '<div class="epic-arc-nav">';
          if (prevKey) {
            const pd = epicArcsDetails[prevKey];
            prevTitle = pd ? pd.title : prevKey;
            html += '<button class="nav-mission-btn prev-btn" data-mission-key="' + escapeHtml(prevKey) + '">&larr; ' + escapeHtml(prevTitle) + '</button>';
          }
          if (nextKey) {
            const nd = epicArcsDetails[nextKey];
            nextTitle = nd ? nd.title : nextKey;
            html += '<button class="nav-mission-btn next-btn" data-mission-key="' + escapeHtml(nextKey) + '">' + escapeHtml(nextTitle) + ' &rarr;</button>';
          }
          html += '</div>';
        }
      }
    }

    container.innerHTML = html;

    container.querySelectorAll('.nav-mission-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.missionKey;
        if (key) window.location.hash = '#epicarcs/mission/' + encodeURIComponent(key);
      });
    });
  }

  function showEpicArcList() {
    $('#epicArcDetailView').style.display = 'none';
    $('#epicArcMissionDetailView').style.display = 'none';
    $('#epicArcListView').style.display = 'block';
  }

  // ===== NPC FACTIONS =====
  function initNpcControls() {
    var searchInput = $('#npcSearchInput');
    var categoryFilter = $('#npcCategoryFilter');

    function onFilter() { renderNpcList(); }

    if (searchInput) searchInput.addEventListener('input', onFilter);
    if (categoryFilter) categoryFilter.addEventListener('change', onFilter);

    $('#backToNpcList').addEventListener('click', function () {
      window.location.hash = '#npcs';
    });

    renderNpcList();
  }

  function renderNpcList() {
    var query = ($('#npcSearchInput') ? $('#npcSearchInput').value : '').toLowerCase();
    var category = $('#npcCategoryFilter') ? $('#npcCategoryFilter').value : '';

    var filtered = npcFactionsData.filter(function (f) {
      if (category && f.category !== category) return false;
      if (query) {
        var haystack = (f.name + ' ' + f.locations + ' ' + f.category).toLowerCase();
        if (haystack.indexOf(query) === -1) return false;
      }
      return true;
    });

    var statsEl = $('#npcStats');
    statsEl.textContent = 'Showing ' + filtered.length + ' of ' + npcFactionsData.length + ' factions';

    var container = $('#npcList');

    var categories = ['Empire', 'Pirate', 'Other'];
    var html = '';

    categories.forEach(function (cat) {
      var group = filtered.filter(function (f) { return f.category === cat; });
      if (group.length === 0) return;

      html += '<div class="npc-category-header">' + escapeHtml(cat) + '</div>';
      html += '<div class="npc-grid">';

      group.forEach(function (faction) {
        html += createNpcCard(faction);
      });

      html += '</div>';
    });

    if (filtered.length === 0) {
      html = '<div class="empty-state">No factions match your search.</div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.npc-card').forEach(function (card) {
      card.addEventListener('click', function () {
        window.location.hash = '#npcs/detail/' + encodeURIComponent(card.dataset.factionId);
      });
    });
  }

  function createNpcCard(faction) {
    var catClass = 'npc-cat-other';
    if (faction.category === 'Empire') catClass = 'npc-cat-empire';
    if (faction.category === 'Pirate') catClass = 'npc-cat-pirate';

    var html = '<div class="npc-card" data-faction-id="' + escapeHtml(faction.id) + '">';
    html += '<div class="npc-card-header">';
    html += '<div class="npc-card-name">' + escapeHtml(faction.name) + '</div>';
    html += '<span class="npc-card-category ' + catClass + '">' + escapeHtml(faction.category) + '</span>';
    html += '</div>';
    html += '<div class="npc-card-locations">' + escapeHtml(faction.locations) + '</div>';

    html += '<div class="npc-card-section-label">Deals</div>';
    html += renderDamageBarRow('EM', faction.damage_dealt.em, 'npc-dmg-em');
    html += renderDamageBarRow('Thermal', faction.damage_dealt.thermal, 'npc-dmg-thermal');
    html += renderDamageBarRow('Kinetic', faction.damage_dealt.kinetic, 'npc-dmg-kinetic');
    html += renderDamageBarRow('Explosive', faction.damage_dealt.explosive, 'npc-dmg-explosive');

    html += '<div class="npc-card-section-label">Weak To</div>';
    html += renderDamageBarRow('EM', faction.damage_weakness.em, 'npc-dmg-em');
    html += renderDamageBarRow('Thermal', faction.damage_weakness.thermal, 'npc-dmg-thermal');
    html += renderDamageBarRow('Kinetic', faction.damage_weakness.kinetic, 'npc-dmg-kinetic');
    html += renderDamageBarRow('Explosive', faction.damage_weakness.explosive, 'npc-dmg-explosive');

    if (faction.ewar && faction.ewar.length > 0) {
      html += '<div class="npc-card-section-label">E-War</div>';
      html += '<div class="npc-ewar-tags">';
      faction.ewar.forEach(function (ew) {
        html += '<span class="npc-ewar-tag">' + escapeHtml(ew) + '</span>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderDamageBarRow(label, pct, barClass) {
    var html = '<div class="npc-damage-bar-row">';
    html += '<span class="npc-damage-label">' + label + '</span>';
    html += '<div class="npc-damage-bar-bg"><div class="npc-damage-bar ' + barClass + '" style="width:' + pct + '%"></div></div>';
    html += '<span class="npc-damage-pct">' + pct + '%</span>';
    html += '</div>';
    return html;
  }

  function showNpcDetail(faction) {
    $('#npcListView').style.display = 'none';
    $('#npcDetailView').style.display = 'block';
    window.scrollTo(0, 0);

    var catClass = 'npc-cat-other';
    if (faction.category === 'Empire') catClass = 'npc-cat-empire';
    if (faction.category === 'Pirate') catClass = 'npc-cat-pirate';

    var html = '';

    html += '<div class="npc-detail-header">';
    html += '<h2>' + escapeHtml(faction.name) + '</h2>';
    html += '<span class="npc-detail-category ' + catClass + '">' + escapeHtml(faction.category) + '</span>';
    html += '</div>';

    html += '<div class="npc-detail-locations">Locations: ' + escapeHtml(faction.locations) + '</div>';

    html += '<div class="npc-detail-description">' + escapeHtml(faction.description) + '</div>';

    html += '<div class="npc-detail-stats">';

    // Damage Dealt card
    html += '<div class="npc-detail-stat-card">';
    html += '<h3>Damage They Deal</h3>';
    html += renderDetailDamageRow('EM', faction.damage_dealt.em, 'npc-dmg-em');
    html += renderDetailDamageRow('Thermal', faction.damage_dealt.thermal, 'npc-dmg-thermal');
    html += renderDetailDamageRow('Kinetic', faction.damage_dealt.kinetic, 'npc-dmg-kinetic');
    html += renderDetailDamageRow('Explosive', faction.damage_dealt.explosive, 'npc-dmg-explosive');
    html += '</div>';

    // Damage Weakness card
    html += '<div class="npc-detail-stat-card">';
    html += '<h3>Best Damage To Use</h3>';
    html += renderDetailDamageRow('EM', faction.damage_weakness.em, 'npc-dmg-em');
    html += renderDetailDamageRow('Thermal', faction.damage_weakness.thermal, 'npc-dmg-thermal');
    html += renderDetailDamageRow('Kinetic', faction.damage_weakness.kinetic, 'npc-dmg-kinetic');
    html += renderDetailDamageRow('Explosive', faction.damage_weakness.explosive, 'npc-dmg-explosive');
    html += '</div>';

    // E-War card
    html += '<div class="npc-detail-stat-card">';
    html += '<h3>Electronic Warfare</h3>';
    if (faction.ewar && faction.ewar.length > 0) {
      html += '<ul class="npc-detail-ewar-list">';
      faction.ewar.forEach(function (ew) {
        html += '<li>' + escapeHtml(ew) + '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p style="color:var(--text-subtle-color);font-size:0.9rem;">None reported</p>';
    }
    html += '</div>';

    html += '</div>';

    $('#npcDetailContent').innerHTML = html;
  }

  function renderDetailDamageRow(label, pct, barClass) {
    var html = '<div class="npc-detail-damage-row">';
    html += '<span class="npc-detail-damage-label">' + label + '</span>';
    html += '<div class="npc-detail-damage-bar-bg"><div class="npc-detail-damage-bar ' + barClass + '" style="width:' + pct + '%"></div></div>';
    html += '<span class="npc-detail-damage-pct">' + pct + '%</span>';
    html += '</div>';
    return html;
  }

  // ===== SHARED =====
  function renderNpcLine(line) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (/^trigger\b/i.test(lower)) {
      return '<span class="tag tag-trigger">TRIGGER</span>';
    }
    if (lower.includes('web') && lower.includes('scramble')) {
      return '<span class="tag tag-web">WEB / SCRAMBLE</span>';
    }
    if (lower === 'web' || lower === 'scramble') {
      return '<span class="tag tag-web">' + trimmed.toUpperCase() + '</span>';
    }
    if (lower.includes('target painter')) {
      return '<span class="tag tag-painter">TARGET PAINTER</span>';
    }

    return escapeHtml(trimmed);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
