const SDE = '../sde/';

const FILES = [
  'skins', 'skinLicenses', 'skinMaterials',
  'skinrComponents', 'skinrComponentCategories',
  'skinrComponentPointValues', 'skinrComponentRarities',
  'skinrSlotCategories', 'skinrSlotConfigurations',
  'skinrSlotNames', 'skinrSlots', 'skinrTierThresholds',
  'types', 'groups'
];

const SEQUENCER_NAMES = {
  81348: 'Alignment Sequencer',
  81349: 'Fermionic Sequencer',
  81350: 'Kerr Sequencer'
};

const CATEGORY_ICONS = { 1: 'fa-fill-drip', 2: 'fa-layer-group', 3: 'fa-gem' };
const CATEGORY_LABELS = { 1: 'Material', 2: 'Pattern', 3: 'Metallic' };

let data = {};
let calcState = {};

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

async function loadAll() {
  const [skins, skinLicenses, skinMaterials, skinrComponents,
         skinrComponentCategories, skinrComponentPointValues,
         skinrComponentRarities, skinrSlotCategories,
         skinrSlotConfigurations, skinrSlotNames, skinrSlots,
         skinrTierThresholds, types, groups] = await Promise.all(
    FILES.map(f => fetchJsonl(f))
  );

  data.types = byKey(types);
  data.skins = skins;
  data.skinLicenses = skinLicenses;
  data.skinMaterials = skinMaterials;
  data.skinrComponents = skinrComponents.filter(c => c.published !== false);
  data.skinrComponentCategories = byKey(skinrComponentCategories);
  data.skinrComponentRarities = byKey(skinrComponentRarities);
  data.skinrSlotCategories = byKey(skinrSlotCategories);
  data.skinrSlotConfigurations = skinrSlotConfigurations;
  data.skinrSlotNames = byKey(skinrSlotNames);
  data.skinrSlots = skinrSlots;
  data.skinrTierThresholds = skinrTierThresholds;
  data.skinrComponentPointValues = skinrComponentPointValues;
  data.groups = byKey(groups);

  buildShipLookup();
  buildComponentLookup();
}

function typeName(id) {
  const t = data.types[id];
  return t ? t.name.en : `Type #${id}`;
}

function rarityName(id) {
  const r = data.skinrComponentRarities[id];
  return r ? r.name.en : `Rarity ${id}`;
}

function catName(id) {
  const c = data.skinrComponentCategories[id];
  return c ? c.name : `Cat ${id}`;
}

/* ==================== COLOR SWATCH ==================== */
function parseSwatchColor(iconFile) {
  if (!iconFile) return null;
  const m = iconFile.match(/(\d{3})_(\d{3})_(\d{3})/);
  if (!m) return null;
  const h = parseInt(m[1]) / 100 * 360;
  const s = parseInt(m[2]) / 100 * 100;
  const l = parseInt(m[3]) / 100 * 100;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/* ==================== SHIP LOOKUP ==================== */
let shipNameToId = {};
let shipIdToName = {};
let configShips = [];

function buildShipLookup() {
  shipNameToId = {};
  shipIdToName = {};
  for (const [id, t] of Object.entries(data.types)) {
    const g = data.groups[t.groupID];
    if (g && g.categoryID === 6 && t.published !== false && t.name) {
      const n = t.name.en.toLowerCase();
      shipNameToId[n] = parseInt(id);
      shipIdToName[id] = t.name.en;
    }
  }

  configShips = data.skinrSlotConfigurations.map(conf => {
    const ids = conf.allowAllShips
      ? Object.keys(shipIdToName).map(Number)
      : (conf.ships || []);
    return { conf, shipIds: ids };
  });
}

function findShips(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results = [];
  for (const [name, id] of Object.entries(shipNameToId)) {
    if (name.includes(q)) {
      results.push({ id, name: shipIdToName[id] });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
}

/* ==================== COMPONENT LOOKUP ==================== */
let compsByCategory = {};

function buildComponentLookup() {
  compsByCategory = {};
  for (const c of data.skinrComponents) {
    const cat = c.category || 1;
    if (!compsByCategory[cat]) compsByCategory[cat] = [];
    compsByCategory[cat].push(c);
  }
}

/* ==================== TAB SWITCHING ==================== */
function setupTabs() {
  document.querySelector('.tab-bar').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'calc') renderCalculator();
    if (btn.dataset.tab === 'calc') renderCalcResult();
  });
}

/* ==================== STATS ==================== */
function renderStats() {
  const s = [
    { label: 'Components', num: data.skinrComponents.length },
    { label: 'Slots', num: data.skinrSlots.length },
    { label: 'Configurations', num: data.skinrSlotConfigurations.length },
    { label: 'Traditional Skins', num: data.skins.length },
    { label: 'Skin Licenses', num: data.skinLicenses.length },
    { label: 'Material Sets', num: data.skinMaterials.length }
  ];
  document.getElementById('stats-bar').innerHTML = s.map(x =>
    `<div class="stat-item"><div class="stat-num">${x.num.toLocaleString()}</div><div class="stat-label">${x.label}</div></div>`
  ).join('');
}

/* ==================== BROWSE TAB ==================== */
let activeCat = 'all';
let activeRarity = 'all';
let searchQuery = '';

function renderComponents() {
  const grid = document.getElementById('component-grid');
  const filtered = data.skinrComponents.filter(c => {
    if (activeCat !== 'all' && c.category !== parseInt(activeCat)) return false;
    if (activeRarity !== 'all' && c.rarity !== parseInt(activeRarity)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(c.name.en || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  document.getElementById('component-count').textContent =
    `(${filtered.length} of ${data.skinrComponents.length})`;

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-search"></i><p>No components match.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(c => {
    const rarity = c.rarity || 1;
    const seqType = SEQUENCER_NAMES[c.sequenceBinder?.itemTypeID] || 'Sequencer';
    const seqCount = c.sequenceBinder?.count || 0;
    const swatch = parseSwatchColor(c.iconFile);
    const swatchHtml = swatch ? `<span class="comp-swatch" style="background:${swatch}"></span>` : '';
    return `<div class="comp-card" data-cat="${c.category}" data-rarity="${rarity}">
      <span class="cat-badge">${catName(c.category)}</span>
      <div class="comp-icon">${swatchHtml}<i class="fa-solid ${CATEGORY_ICONS[c.category] || 'fa-palette'}"></i></div>
      <div class="comp-name">${c.name.en}</div>
      <div class="comp-finish">${c.finish || ''}</div>
      <span class="rarity-badge rarity-${rarity}">${rarityName(rarity)}</span>
      <div class="seq-cost">Sequencing: <span>${seqCount}</span> × ${seqType}</div>
    </div>`;
  }).join('');
}

function setupFilters() {
  document.getElementById('category-filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#category-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCat = btn.dataset.cat;
    renderComponents();
  });

  document.getElementById('rarity-filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#rarity-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRarity = btn.dataset.rarity;
    renderComponents();
  });

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderComponents();
  });
}

function buildRarityFilters() {
  const container = document.getElementById('rarity-filters');
  for (let i = 1; i <= 6; i++) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.rarity = i;
    btn.textContent = rarityName(i);
    container.appendChild(btn);
  }
}

/* ==================== SHIPS TAB ==================== */
function setupShipSearch() {
  const input = document.getElementById('ship-search-input');
  const btn = document.getElementById('ship-search-btn');
  const doSearch = () => {
    const q = input.value;
    if (!q) return;
    const results = findShips(q);
    renderShipResults(results);
  };
  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

function renderShipResults(results) {
  const container = document.getElementById('ship-results');
  if (!results.length) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-ship"></i><p>No ships found.</p></div>';
    return;
  }

  container.innerHTML = results.map(ship => {
    const shipId = ship.id;

    const matchingConfigs = configShips.filter(cs => cs.shipIds.includes(shipId));

    if (!matchingConfigs.length) {
      return `<div class="ship-result-card">
        <h3>${ship.name}</h3>
        <div class="config-name">No SKINR configurations found for this ship.</div>
      </div>`;
    }

    return matchingConfigs.map(cs => {
      const conf = cs.conf;
      const slots = (conf.config || []).map(slotKey => {
        const slot = data.skinrSlots.find(sl => sl._key === slotKey);
        if (!slot) return null;
        const cats = (slot.allowedDesignComponentCategories || []).map(c => catName(c)).join(', ');
        return `<span class="slot-tag"><strong>${slot.name.en}</strong> (${cats})</span>`;
      }).filter(Boolean);

      return `<div class="ship-result-card">
        <h3>${ship.name}</h3>
        <div class="config-name">Configuration: <strong>${conf.name}</strong> (priority ${conf.priority != null ? conf.priority : '-'})</div>
        <div style="font-size:0.78rem;color:var(--dim);margin:4px 0;">Available slots:</div>
        <div class="slot-list">${slots.join('')}</div>
      </div>`;
    }).join('');
  }).join('');
}

/* ==================== CALCULATOR TAB ==================== */
function renderCalculator() {
  const configs = data.skinrSlotConfigurations;
  const slotContainer = document.getElementById('calc-slots');
  const configBar = document.getElementById('calc-config-selector');

  let html = '<label>Configuration:</label><select id="calc-config-select">';
  configs.forEach((c, i) => {
    html += `<option value="${i}">${c.name}</option>`;
  });
  html += '</select>';
  configBar.innerHTML = html;

  const select = document.getElementById('calc-config-select');
  select.addEventListener('change', () => {
    renderCalcSlots();
    renderCalcResult();
    renderShipPreview();
  });

  renderCalcSlots();
  renderShipPreview();
}

function renderCalcSlots() {
  const select = document.getElementById('calc-config-select');
  if (!select) return;
  const confIdx = parseInt(select.value);
  const conf = data.skinrSlotConfigurations[confIdx];
  const container = document.getElementById('calc-slots');
  const allComps = data.skinrComponents;

  calcState = {};

  const configSlots = (conf.config || []);
  container.innerHTML = configSlots.map(slotKey => {
    const slot = data.skinrSlots.find(sl => sl._key === slotKey);
    if (!slot) return '';
    const allowedCats = slot.allowedDesignComponentCategories || [];
    const options = allComps.filter(c => allowedCats.includes(c.category));

    const stateKey = `slot_${slotKey}`;
    calcState[stateKey] = calcState[stateKey] || '';

    let optsHtml = '<option value="">— none —</option>';
    options.forEach(c => {
      const selected = calcState[stateKey] === String(c._key) ? 'selected' : '';
      optsHtml += `<option value="${c._key}" ${selected}>${c.name.en} (${rarityName(c.rarity || 1)})</option>`;
    });

    return `<div class="calc-slot-card">
      <div class="slot-header">
        <span class="slot-name">${slot.name.en}</span>
        <span class="slot-cat">${catName(slot.category)}</span>
      </div>
      <select data-slot-key="${slotKey}" class="calc-slot-select">
        ${optsHtml}
      </select>
      <div class="slot-points" id="calc-points-${slotKey}">Points: <span>0</span></div>
    </div>`;
  }).join('');

  container.querySelectorAll('.calc-slot-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const sk = e.target.dataset.slotKey;
      calcState[`slot_${sk}`] = e.target.value;
      updateSlotPoints(sk);
      renderCalcResult();
      updateShipPreviewImage();
    });
  });

  configSlots.forEach(sk => updateSlotPoints(sk));
}

function updateSlotPoints(slotKey) {
  const span = document.getElementById(`calc-points-${slotKey}`);
  if (!span) return;
  const compKey = calcState[`slot_${slotKey}`];
  if (!compKey) {
    span.innerHTML = 'Points: <span>0</span>';
    return;
  }
  const comp = data.skinrComponents.find(c => c._key === parseInt(compKey));
  if (!comp) return;
  const rarity = comp.rarity || 1;
  const cat = comp.category || 1;
  const pv = data.skinrComponentPointValues.find(e => e._key === cat);
  let pts = 0;
  if (pv) {
    const entry = (pv._value || []).find(v => v._key === rarity);
    if (entry) pts = entry._value;
  }
  span.innerHTML = `Points: <span>${pts}</span>`;
}

function renderCalcResult() {
  const container = document.getElementById('calc-result');
  if (!container) return;

  let total = 0;
  let filled = 0;
  const confIdx = parseInt(document.getElementById('calc-config-select')?.value || 0);
  const conf = data.skinrSlotConfigurations[confIdx];
  const configSlots = (conf.config || []);

  configSlots.forEach(sk => {
    const compKey = calcState[`slot_${sk}`];
    if (!compKey) return;
    const comp = data.skinrComponents.find(c => c._key === parseInt(compKey));
    if (!comp) return;
    filled++;
    const rarity = comp.rarity || 1;
    const cat = comp.category || 1;
    const pv = data.skinrComponentPointValues.find(e => e._key === cat);
    if (pv) {
      const entry = (pv._value || []).find(v => v._key === rarity);
      if (entry) total += entry._value;
    }
  });

  if (!filled) {
    container.innerHTML = '<div class="total-label">Select components above to calculate design points.</div>';
    container.className = 'calc-result';
    return;
  }

  container.className = 'calc-result has-selection';

  let tier = 1;
  const thresholds = data.skinrTierThresholds;
  for (const entry of thresholds) {
    const values = entry._value || [];
    for (const v of values) {
      if (v._key > tier && total >= v._value) {
        tier = v._key;
      }
    }
  }

  const filledText = `${filled} of ${configSlots.length} slots filled`;
  container.innerHTML = `
    <div class="total-label">Total Design Points</div>
    <div class="total-points">${total.toLocaleString()}</div>
    <div class="tier-label">Achieves Tier <span>${tier}</span></div>
    <div class="breakdown">${filledText}</div>`;
}

/* ==================== CALCULATOR SHIP PREVIEW ==================== */
function renderShipPreview() {
  const container = document.getElementById('calc-preview');
  if (!container) return;

  const confIdx = parseInt(document.getElementById('calc-config-select')?.value || 0);
  const conf = data.skinrSlotConfigurations[confIdx];

  const ships = conf.allowAllShips
    ? Object.entries(shipIdToName).map(([id, name]) => ({ id: parseInt(id), name }))
    : (conf.ships || []).map(id => ({ id, name: shipIdToName[id] || `Type #${id}` }));

  ships.sort((a, b) => a.name.localeCompare(b.name));

  const prevShipId = parseInt(document.getElementById('preview-ship-select')?.value);

  container.innerHTML = `<div class="preview-header">
    <i class="fa-solid fa-eye" style="color:var(--accent);"></i>
    <h3>Ship Preview</h3>
  </div>
  <div class="preview-controls">
    <label>Ship:</label>
    <select id="preview-ship-select">
      <option value="">— select a ship —</option>
      ${ships.map(s => `<option value="${s.id}" ${s.id === prevShipId ? 'selected' : ''}>${s.name}</option>`).join('')}
    </select>
  </div>
  <div id="preview-canvas" class="preview-canvas" style="display:none;">
    <div class="ship-render-wrap">
      <img id="ship-render-img" class="ship-render-img" src="" alt="Ship render" />
      <div id="ship-tint-overlay" class="ship-tint-overlay"></div>
    </div>
    <div id="preview-colors" class="preview-colors"></div>
  </div>`;

  document.getElementById('preview-ship-select').addEventListener('change', updateShipPreviewImage);

  if (prevShipId) updateShipPreviewImage();
}

function updateShipPreviewImage() {
  const shipId = parseInt(document.getElementById('preview-ship-select')?.value);
  const canvas = document.getElementById('preview-canvas');
  const img = document.getElementById('ship-render-img');
  const overlay = document.getElementById('ship-tint-overlay');
  if (!canvas || !img || !overlay) return;

  if (!shipId) {
    canvas.style.display = 'none';
    return;
  }

  img.src = `https://images.evetech.net/types/${shipId}/render?size=512`;
  canvas.style.display = 'flex';

  const confIdx = parseInt(document.getElementById('calc-config-select')?.value || 0);
  const conf = data.skinrSlotConfigurations[confIdx];
  const configSlots = (conf.config || []);

  let primaryColor = null;
  const colors = [];

  configSlots.forEach(sk => {
    const compKey = calcState[`slot_${sk}`];
    if (!compKey) return;
    const comp = data.skinrComponents.find(c => c._key === parseInt(compKey));
    if (!comp) return;
    const color = parseSwatchColor(comp.iconFile);
    if (color) {
      colors.push({ color, name: comp.name.en });
      if (!primaryColor) primaryColor = color;
    }
  });

  if (primaryColor) {
    overlay.style.background = `linear-gradient(135deg, ${primaryColor} 0%, transparent 100%)`;
    overlay.style.opacity = '0.45';
    overlay.style.mixBlendMode = 'overlay';
  } else {
    overlay.style.background = 'none';
    overlay.style.opacity = '0';
  }

  const colorsContainer = document.getElementById('preview-colors');
  if (colors.length) {
    colorsContainer.innerHTML = colors.map(c =>
      `<div class="preview-color-chip">
        <span class="comp-swatch" style="background:${c.color}"></span>
        <span>${c.name}</span>
      </div>`
    ).join('');
  } else {
    colorsContainer.innerHTML = '<div class="hint-text" style="margin:0;">Select components to see colors</div>';
  }
}

/* ==================== CALCULATOR EXPORT ==================== */
function setupCalcExport() {
  document.getElementById('calc-export-btn').addEventListener('click', () => {
    const confIdx = parseInt(document.getElementById('calc-config-select')?.value || 0);
    const conf = data.skinrSlotConfigurations[confIdx];
    const configSlots = (conf.config || []);

    let lines = [`SKINR Design — ${conf.name}`, `Configuration: ${conf.name}`, ''];
    let total = 0;

    configSlots.forEach(sk => {
      const slot = data.skinrSlots.find(sl => sl._key === sk);
      const compKey = calcState[`slot_${sk}`];
      let compName = '(empty)';
      let pts = 0;
      if (compKey) {
        const comp = data.skinrComponents.find(c => c._key === parseInt(compKey));
        if (comp) {
          compName = `${comp.name.en} [${rarityName(comp.rarity || 1)}]`;
          const pv = data.skinrComponentPointValues.find(e => e._key === (comp.category || 1));
          if (pv) {
            const entry = (pv._value || []).find(v => v._key === (comp.rarity || 1));
            if (entry) pts = entry._value;
          }
        }
      }
      total += pts;
      lines.push(`  ${slot ? slot.name.en : 'Slot ' + sk}: ${compName} (${pts} pts)`);
    });

    lines.push('', `Total Points: ${total}`);

    let tier = 1;
    for (const entry of data.skinrTierThresholds) {
      for (const v of (entry._value || [])) {
        if (v._key > tier && total >= v._value) tier = v._key;
      }
    }
    lines.push(`Achieved Tier: ${tier}`);

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      showToast('Design copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy');
    });
  });

  document.getElementById('calc-clear-btn').addEventListener('click', () => {
    calcState = {};
    renderCalcSlots();
    renderCalcResult();
    updateShipPreviewImage();
    showToast('Selections cleared');
  });
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2200);
}

/* ==================== REFERENCE TAB ==================== */
function renderSlots() {
  const container = document.getElementById('slot-content');
  const sCat = data.skinrSlotCategories;
  const sName = data.skinrSlotNames;
  const sConf = data.skinrSlotConfigurations;

  let html = '<div class="data-table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Slot</th><th>Category</th><th>Internal Name</th><th>Allows</th></tr></thead><tbody>';

  for (const slot of data.skinrSlots) {
    const cat = sCat[slot.category];
    const catLabel = cat ? cat.name.replace(/_/g, ' ') : `Cat ${slot.category}`;
    const allows = (slot.allowedDesignComponentCategories || []).map(c => catName(c)).join(', ');
    const sn = sName[slot._key];
    html += `<tr>
      <td>${slot.name.en}</td>
      <td>${catLabel}</td>
      <td style="color:var(--dim);font-size:0.78rem;">${sn ? sn.name : '-'}</td>
      <td>${allows}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';

  html += '<div style="margin-top:1.5rem;"><div class="section-header" style="margin-bottom:12px;">' +
    '<i class="fa-solid fa-cog"></i><h2>Configurations</h2><span class="line"></span></div>' +
    '<div class="data-table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Name</th><th>Priority</th><th>Slots</th><th>Ships</th></tr></thead><tbody>';

  for (const conf of sConf) {
    const slots = (conf.config || []).map(s => {
      const match = data.skinrSlots.find(sl => sl._key === s);
      return match ? match.name.en : `Slot ${s}`;
    }).join(', ');
    const shipCount = conf.ships ? conf.ships.length : (conf.allowAllShips ? 'All' : 0);
    html += `<tr>
      <td>${conf.name}</td>
      <td style="color:var(--dim)">${conf.priority != null ? conf.priority : '-'}</td>
      <td style="font-size:0.78rem;">${slots}</td>
      <td style="font-size:0.78rem;">${shipCount === 'All' ? 'All ships' : shipCount + ' ships'}</td>
    </tr>`;
  }

  html += '</tbody></table></div></div>';
  container.innerHTML = html;
}

function renderPointValues() {
  const container = document.getElementById('point-content');
  const pv = data.skinrComponentPointValues;
  let html = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Category</th>';
  for (let r = 1; r <= 6; r++) html += `<th>${rarityName(r)}</th>`;
  html += '</tr></thead><tbody>';

  for (const entry of pv) {
    const catLabel = catName(entry._key);
    const values = entry._value || [];
    const row = {};
    for (const v of values) row[v._key] = v._value;
    html += `<tr><td>${catLabel}</td>`;
    for (let r = 1; r <= 6; r++) html += `<td>${row[r] != null ? row[r] : '-'}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function renderTierThresholds() {
  const container = document.getElementById('tier-content');
  const tiers = data.skinrTierThresholds;
  let html = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Config ID</th>';
  for (let t = 1; t <= 19; t++) html += `<th>Tier ${t}</th>`;
  html += '</tr></thead><tbody>';

  for (const entry of tiers) {
    const values = entry._value || [];
    const row = {};
    for (const v of values) row[v._key] = v._value;
    html += `<tr><td>Config ${entry._key}</td>`;
    for (let t = 1; t <= 19; t++) html += `<td>${row[t] != null ? row[t] : '-'}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function renderSkins() {
  const container = document.getElementById('skin-content');
  const matSetCounts = {};
  for (const skin of data.skins) {
    const msid = skin.skinMaterialID;
    if (!matSetCounts[msid]) matSetCounts[msid] = 0;
    matSetCounts[msid]++;
  }

  document.getElementById('skin-count').textContent =
    `(${data.skins.length} skins, ${Object.keys(matSetCounts).length} material sets)`;

  let html = '<div class="skin-grid">';
  for (const mat of data.skinMaterials) {
    const count = matSetCounts[mat._key] || 0;
    html += `<div class="skin-tag" title="${count} skins">
      ${mat.displayName.en} <span style="color:var(--dim);font-size:0.7rem;">(${count})</span>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

/* ==================== INIT ==================== */
(async function init() {
  document.querySelector('.container').insertAdjacentHTML('afterbegin',
    '<div class="loading" id="loading"><i class="fa-solid fa-spinner"></i> Loading SKINR data...</div>');

  try {
    await loadAll();
    document.getElementById('loading')?.remove();

    renderStats();
    setupTabs();
    buildRarityFilters();
    renderComponents();
    setupFilters();
    setupShipSearch();
    setupCalcExport();
    renderSlots();
    renderPointValues();
    renderTierThresholds();
    renderSkins();

  } catch (err) {
    document.getElementById('loading').innerHTML =
      `<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent);"></i> Error loading data: ${err.message}`;
    console.error(err);
  }
})();
