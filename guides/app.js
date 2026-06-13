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

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // ===== INIT =====
  async function init() {
    showLoading(true);
    try {
      const [a, b, c, d, e, f, g, h] = await Promise.all([
        fetch('data/missions-index.json'),
        fetch('data/missions.json'),
        fetch('data/anomalies-index.json'),
        fetch('data/anomalies.json'),
        fetch('data/anomalies-uniwiki.json'),
        fetch('data/anomic-missions.json'),
        fetch('data/anomic-missions-survival.json'),
        fetch('data/agents-index.json')
      ]);
      missionsIndex = await a.json();
      missionsDetails = await b.json();
      anomaliesIndex = await c.json();
      anomaliesDetails = await d.json();
      anomaliesUniWiki = await e.json();
      burnersData = await f.json();
      burnersSurvival = await g.json();
      agentsData = await h.json();

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
    applyHash();
    window.addEventListener('hashchange', applyHash);
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
        const pageName = parts.slice(3).join('/');
        const mission = findMissionByPage(pageName);
        if (mission && mission.levels[level]) {
          showMissionDetail(mission, level, pageName);
        }
      } else if (tab === 'anomalies') {
        const pageName = parts.slice(2).join('/');
        const entry = findEntryByPage(pageName);
        if (entry) showAnomalyDetail(entry);
      } else if (tab === 'burners') {
        const pageName = parts.slice(2).join('/');
        const entry = burnersData[pageName];
        if (entry) showBurnerDetail(entry);
      } else if (tab === 'agents') {
        const cid = parseInt(parts[2], 10);
        const agent = agentsData.find(a => a.characterID === cid);
        if (agent) showAgentDetail(agent);
      }
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
      ['Blitz', getInfoValue(info, 'Blitz')],
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

    // Pockets
    if (detail.pockets && detail.pockets.length) {
      html += '<div class="pocket-section">';
      for (const pocket of detail.pockets) {
        const heading = pocket.heading;

        if (pocket.level === 'h3') {
          html += '<div class="pocket-title">' + escapeHtml(heading) + '</div>';
        } else if (pocket.level === 'h4') {
          html += '<div class="pocket-subtitle">' + escapeHtml(heading) + '</div>';
        }

        if (pocket.level === 'h5') continue;

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
      }
      html += '</div>';
    }

    // Tips and loot
    const extraSections = [];
    if (detail.tips) extraSections.push({ title: 'Tips', content: detail.tips });
    if (detail.loot) extraSections.push({ title: 'Loot & Bounty', content: detail.loot });

    for (const section of extraSections) {
      html += '<div class="detail-section"><h3>' + section.title + '</h3><div>' + escapeHtml(section.content) + '</div></div>';
    }

    container.innerHTML = html;
  }

  function showMissionList() {
    $('#missionDetailView').style.display = 'none';
    $('#missionListView').style.display = 'block';
  }

  // ===== ANOMALIES =====
  let currentFilteredAnomalies = [];

  function initAnomalyControls() {
    populateAnomalyFactionFilter();
    renderAnomalyList();
    $('#anomalySearchInput').addEventListener('input', renderAnomalyList);
    $('#anomalyFactionFilter').addEventListener('change', renderAnomalyList);
    $('#backToAnomalyList').addEventListener('click', function() { window.location.hash = '#anomalies'; });
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

    currentFilteredAnomalies = filtered;

    // Group by tier and track indices
    const byTier = {};
    filtered.forEach((a, idx) => {
      const t = a.tier || 0;
      if (!byTier[t]) byTier[t] = [];
      byTier[t].push({ entry: a, idx });
    });

    const container = $('#anomalyList');
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">No anomalies match your filters.</div>';
      $('#anomalyStats').textContent = 'Showing 0 anomalies';
      return;
    }

    const sortedTiers = Object.keys(byTier).sort((a, b) => Number(a) - Number(b));
    let html = '';

    for (const tier of sortedTiers) {
      const items = byTier[tier];
      html += '<div class="tier-group">';
      html += '<div class="tier-header">Tier ' + tier + '</div>';
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

    $('#anomalyStats').textContent = 'Showing ' + filtered.length + ' of ' + anomaliesIndex.length + ' anomalies';
  }

  function createAnomalyCard(entry, idx) {
    const space = entry.space || {};
    const level = entry.level;
    const levelStr = level ? 'DED ' + level + '/10' : '';

    let html = '<div class="anomaly-card" data-filtered-idx="' + idx + '">';
    html += '<div class="anomaly-card-header">';
    html += '<span class="anomaly-faction">' + escapeHtml(entry.faction) + '</span>';
    if (levelStr) html += '<span class="anomaly-level-badge">' + levelStr + '</span>';
    html += '</div>';
    html += '<div class="anomaly-card-name">' + escapeHtml(entry.name) + '</div>';
    html += '<div class="anomaly-card-space">';
    if (space.high) html += '<span class="space-badge space-high">H</span>';
    if (space.low) html += '<span class="space-badge space-low">L</span>';
    if (space.null) html += '<span class="space-badge space-null">N</span>';
    html += '</div>';
    if (entry.escalation && entry.escalation.name) {
      html += '<div class="anomaly-card-escalation" data-esc-page="' + escapeHtml(entry.escalation.page || '') + '">Escalation: ' + escapeHtml(entry.escalation.name) + ' &rarr;</div>';
    }
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
    html += '<div class="detail-header">';
    html += '<h2>' + escapeHtml(entry.name) + '</h2>';
    html += '<span class="detail-level-badge">Tier ' + entry.tier + (entry.level ? ' &mdash; DED ' + entry.level + '/10' : '') + '</span>';
    html += '<span class="detail-faction">' + escapeHtml(entry.faction) + '</span>';
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
          if (pocket.level === 'h3') {
            html += '<div class="pocket-title">' + escapeHtml(heading) + '</div>';
          } else if (pocket.level === 'h4') {
            html += '<div class="pocket-subtitle">' + escapeHtml(heading) + '</div>';
          }
          if (pocket.level === 'h5') continue;

          if (pocket.lines && pocket.lines.length) {
            const filteredLines = pocket.lines.filter(l => !/^Last edited by/i.test(l.trim()));
            if (filteredLines.length) {
              html += '<div class="npc-group">';
              for (const line of filteredLines) {
                html += '<div class="npc-line">' + renderNpcLine(line) + '</div>';
              }
              html += '</div>';
            }
          }
        }
        html += '</div>';
      }

      if (survival.tips) html += '<div class="detail-section"><h3>Tips</h3><div>' + escapeHtml(survival.tips) + '</div></div>';
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
          const header = firstRow ? firstRow.join(' ') : '';
        if (header === 'DED Complexes' || header === 'Combat Anomalies' ||
            header === 'Angel Cartel' || header === 'Blood Raiders' ||
            header === 'Guristas Pirates' || header === "Sansha's Nation" ||
            header === 'Serpentis Corporation' || header === 'Rogue Drones') {
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
    // Clean up whitespace and format NPC lines
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map(l => '<div class="npc-line">' + escapeHtml(l) + '</div>').join('');
  }

  function renderUniWikiTable2(rows) {
    if (!rows || rows.length < 1) return '';
    let html = '<div class="npc-group"><table class="uniwiki-npc-table">';
    for (let r = 0; r < rows.length; r++) {
      html += '<tr>';
      for (let c = 0; c < rows[r].length; c++) {
        const cell = escapeHtml(rows[r][c]);
        if (r === 0) html += '<th>' + cell + '</th>';
        else html += '<td>' + cell + '</td>';
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
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
      if (!tbl.type === 'table' || !tbl.rows || tbl.rows.length < 1) continue;

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
      html += '<div class="detail-section"><h3>Mission briefing</h3><div><p>' + escapeHtml(briefing) + '</p></div></div>';
    }

    if (pocketGroups.length) {
      html += '<div class="pocket-section">';
      for (var gi = 0; gi < pocketGroups.length; gi++) {
        var group = pocketGroups[gi];
        html += '<div class="pocket-title">' + escapeHtml(group.title) + '</div>';
        html += '<div class="npc-group">';
        for (var li = 0; li < group.lines.length; li++) {
          html += '<div class="npc-line">' + renderNpcLine(group.lines[li]) + '</div>';
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

  // ===== SHARED =====
  function renderNpcLine(line) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (lower === 'trigger') {
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
