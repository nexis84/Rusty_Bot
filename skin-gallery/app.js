(function () {
  'use strict';

  const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = IS_LOCAL ? '/api' : 'https://api.rustybot.co.uk/api';
  const EVE_SSO_REDIRECT_URI = 'https://api.rustybot.co.uk/api/auth/eve/callback';
  const EVE_SSO_URL = 'https://login.eveonline.com/v2/oauth/authorize/';
  let ssoClientId = null;

  let currentUser = null;
  let currentView = 'gallery';
  let currentPage = 1;
  let currentSearch = '';
  let currentSort = 'newest';
  let allSkins = [];
  let totalPages = 1;
  let currentEditSkinId = null;
  let adminIds = [];

  function isAdmin() {
    return currentUser && adminIds.includes(parseInt(currentUser.character_id));
  }

  const $ = id => document.getElementById(id);
  const views = {
    gallery: $('view-gallery'),
    upload: $('view-upload'),
    profile: $('view-profile'),
  };
  const navBtns = {
    gallery: $('nav-gallery'),
    upload: $('nav-upload'),
    profile: $('nav-profile'),
  };

  function showToast(msg, type) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast ' + (type || '');
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function loadAuth() {
    try {
      const raw = sessionStorage.getItem('skinr_user');
      if (raw) currentUser = JSON.parse(raw);
    } catch (e) { currentUser = null; }
  }

  function saveAuth(user) {
    currentUser = user;
    if (user) {
      sessionStorage.setItem('skinr_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('skinr_user');
    }
  }

  function updateAuthUI() {
    const area = $('auth-area');
    if (currentUser) {
      const adminBadge = isAdmin() ? ' <span class="admin-badge">ADMIN</span>' : '';
      area.innerHTML = '<span class="user-info">Logged in as <strong>' + escapeHtml(currentUser.character_name) + '</strong>' + adminBadge + '</span>' +
        '<button class="auth-btn" onclick="SkinrApp.logout()">Logout</button>';
    } else {
      area.innerHTML = '<button class="auth-btn" onclick="SkinrApp.login()">EVE SSO Login</button>';
    }
  }

  function handleAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      fetch(API_BASE + '/token-exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      .then(r => r.json())
      .then(data => {
        if (data.access_token) {
          saveAuth({ access_token: data.access_token, character_id: data.character_id, character_name: data.character_name });
          updateAuthUI();
          showToast('Logged in as ' + data.character_name, 'success');
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          showToast('Login failed: ' + (data.error || 'Unknown error'), 'error');
        }
      })
      .catch(err => showToast('Login error: ' + err.message, 'error'));
    }
  }

  window.SkinrApp = {
    login: function () {
      const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      const params = new URLSearchParams({ response_type: 'code', redirect_uri: EVE_SSO_REDIRECT_URI, client_id: ssoClientId, scope: 'publicData', state: state });
      window.location.href = EVE_SSO_URL + '?' + params.toString();
    },
    logout: function () {
      saveAuth(null);
      updateAuthUI();
      showToast('Logged out');
      switchView(currentView);
    }
  };

  async function apiFetch(path, options) {
    const headers = { 'Content-Type': 'application/json' };
    if (currentUser && currentUser.access_token) {
      headers['Authorization'] = 'Bearer ' + currentUser.access_token;
    }
    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function switchView(view) {
    currentView = view;
    currentEditSkinId = null;
    Object.keys(views).forEach(k => {
      views[k].classList.toggle('active', k === view);
      navBtns[k].classList.toggle('active', k === view);
    });
    if (view === 'gallery') loadGallery();
    else if (view === 'upload') initUpload();
    else if (view === 'profile') loadProfile();
  }

  // === GALLERY ===

  async function loadGallery(page) {
    if (page) currentPage = page;
    const list = $('gallery-list');
    list.innerHTML = '<div class="loading">Loading skins...</div>';

    try {
      const params = new URLSearchParams({ page: currentPage, limit: 20, sort: currentSort });
      if (currentSearch) params.set('search', currentSearch);

      const data = await apiFetch('/skins?' + params.toString());
      allSkins = data.skins || [];
      totalPages = data.totalPages || 1;

      if (!allSkins.length) {
        list.innerHTML = '<div class="gallery-grid-empty"><strong>No skins yet</strong><p>Be the first to <a href="#" onclick="SkinrApp.switchView(\'upload\'); return false;">upload a skin</a>!</p></div>';
        $('gallery-pagination').style.display = 'none';
        return;
      }

      list.innerHTML = '<div class="gallery-grid">' + allSkins.map(skin => `
        <div class="skin-card" onclick="SkinrApp.openDetail(${skin.id})">
          <img class="skin-card-image" src="${escapeHtml(skin.image_url)}" alt="${escapeHtml(skin.skin_name)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22280%22 height=%22200%22><rect fill=%22%231e1e1e%22 width=%22280%22 height=%22200%22/><text fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>No Image</text></svg>'">
          <div class="skin-card-body">
            <h3>${escapeHtml(skin.skin_name)}</h3>
            <div class="ship-name">${escapeHtml(skin.ship_name)}${skin.visibility === 'private' ? ' <span class="tag-private">PRIVATE</span>' : ''}</div>
            <div class="meta">
              <a class="author" href="#" onclick="event.stopPropagation();SkinrApp.viewProfile(${skin.character_id}); return false;">${escapeHtml(skin.character_name)}</a>
              <span class="likes">&#9829; ${skin.likes || 0}${skin.screenshots && skin.screenshots.length ? ' &middot; +' + skin.screenshots.length + ' shots' : ''}</span>
            </div>
          </div>
        </div>
      `).join('') + '</div>';

      const pagination = $('gallery-pagination');
      pagination.style.display = 'flex';
      pagination.innerHTML = `
        <button onclick="SkinrApp.loadGallery(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Previous</button>
        <span class="page-info">Page ${currentPage} of ${totalPages} (${data.total} skins)</span>
        <button onclick="SkinrApp.loadGallery(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
      `;
    } catch (err) {
      list.innerHTML = '<div class="gallery-grid-empty">Error loading skins: ' + escapeHtml(err.message) + '</div>';
    }
  }

  // === UPLOAD ===

  function initUpload(editSkin) {
    currentEditSkinId = editSkin ? editSkin.id : null;

    if (!currentUser) {
      $('upload-area').innerHTML = `
        <div class="no-auth-msg">
          <p>You need to log in with EVE SSO to upload skins.</p>
          <button class="auth-btn" onclick="SkinrApp.login()">EVE SSO Login</button>
        </div>
      `;
      return;
    }

    const isEdit = !!editSkin;
    const title = isEdit ? 'Edit Skin' : 'Upload New Skin';
    const btnText = isEdit ? 'Save Changes' : 'Upload Skin';

    $('upload-area').innerHTML = `
      <h2 style="text-align:center;color:var(--accent-color);margin-bottom:1.5rem;">${title}</h2>
      <form id="uploadForm" class="upload-form" onsubmit="return SkinrApp.submitUpload(event)">
        <div class="form-group">
          <label for="shipName">Ship Name</label>
          <input type="text" id="shipName" placeholder="e.g. Megathron, Purifier, Gila" value="${isEdit ? escapeHtml(editSkin.ship_name) : ''}" required>
        </div>
        <div class="form-group">
          <label for="skinName">Skin Name</label>
          <input type="text" id="skinName" placeholder="e.g. Blood Raider Victory, SKINR Custom" value="${isEdit ? escapeHtml(editSkin.skin_name) : ''}" required>
        </div>
        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" placeholder="Tell us about your skin design...">${isEdit ? escapeHtml(editSkin.description || '') : ''}</textarea>
        </div>
        <div class="form-group">
          <label for="visibility">Visibility</label>
          <select id="visibility">
            <option value="public" ${isEdit && editSkin.visibility === 'public' ? 'selected' : ''}>Public</option>
            <option value="private" ${isEdit && editSkin.visibility === 'private' ? 'selected' : ''}>Private (only you can see)</option>
          </select>
        </div>
        <div class="form-group">
          <label>${isEdit ? 'Add More Screenshots (optional)' : 'Screenshots (select or paste)'}</label>
          <div class="paste-zone" id="pasteZone">
            <div class="paste-zone-text">Click to browse or <strong>Ctrl+V</strong> to paste screenshots</div>
            <input type="file" id="skinImage" accept="image/jpeg,image/png,image/webp,image/gif" ${isEdit ? '' : 'required'} multiple onchange="SkinrApp.checkFiles(event)">
          </div>
          <div id="imagePreviews" class="image-previews"></div>
          <div id="pasteStatus" class="paste-status"></div>
        </div>
        ${isEdit && editSkin.screenshots && editSkin.screenshots.length ? `
          <div class="form-group">
            <label>Current Screenshots (click to remove)</label>
            <div class="existing-shots" id="existingShots">
              ${editSkin.screenshots.map((url, i) => `
                <div class="existing-shot" data-url="${escapeHtml(url)}">
                  <img src="${escapeHtml(url)}">
                  <button type="button" class="remove-shot" onclick="SkinrApp.removeExistingShot(this)">&times;</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div style="display:flex;gap:1rem;">
          <button type="submit" id="uploadBtn" class="btn-primary">${btnText}</button>
          ${isEdit ? '<button type="button" class="auth-btn" onclick="SkinrApp.cancelEdit()">Cancel</button>' : ''}
        </div>
      </form>
    `;

    const MAX_IMAGES = 4;
    function enforceFileLimit(files) {
      if (files.length > MAX_IMAGES) {
        $('pasteStatus').textContent = 'Maximum ' + MAX_IMAGES + ' images allowed. Only keeping the first ' + MAX_IMAGES + '.';
        $('pasteStatus').className = 'paste-status error';
        const dt = new DataTransfer();
        for (let i = 0; i < MAX_IMAGES; i++) dt.items.add(files[i]);
        return dt.files;
      }
      return files;
    }
    window.SkinrApp.checkFiles = function (e) {
      e.target.files = enforceFileLimit(e.target.files);
      SkinrApp.previewImages(e);
      if (e.target.files.length > 1) {
        $('pasteStatus').textContent = e.target.files.length + ' images selected';
        $('pasteStatus').className = 'paste-status success';
      }
    };
    const pasteZone = $('pasteZone');
    pasteZone.addEventListener('paste', function (e) {
      const items = e.clipboardData.items;
      const pasted = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) pasted.push(item.getAsFile());
      }
      if (!pasted.length) return;
      e.preventDefault();
      const fileInput = $('skinImage');
      const dt = new DataTransfer();
      for (const f of fileInput.files) dt.items.add(f);
      for (const f of pasted) dt.items.add(f);
      fileInput.files = enforceFileLimit(dt.files);
      SkinrApp.previewImages({ target: fileInput });
      $('pasteStatus').textContent = fileInput.files.length + ' image' + (fileInput.files.length !== 1 ? 's' : '') + ' ready';
      $('pasteStatus').className = 'paste-status success';
    });
  }

  window.SkinrApp.previewImages = function (e) {
    const container = $('imagePreviews');
    container.innerHTML = '';
    for (const file of e.target.files) {
      const reader = new FileReader();
      reader.onload = function (ev) {
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.className = 'form-preview-thumb';
        container.appendChild(img);
      };
      reader.readAsDataURL(file);
    }
  };

  window.SkinrApp.removeExistingShot = function (btn) {
    const shot = btn.parentElement;
    shot.style.transition = 'opacity 0.2s';
    shot.style.opacity = '0';
    setTimeout(() => {
      shot.remove();
      const container = document.getElementById('existingShots');
      if (container && !container.children.length) {
        const group = container.closest('.form-group');
        if (group) group.style.display = 'none';
      }
    }, 150);
  };

  window.SkinrApp.cancelEdit = function () {
    switchView('gallery');
  };

  window.SkinrApp.submitUpload = async function (e) {
    e.preventDefault();
    const btn = $('uploadBtn');
    btn.disabled = true;
    btn.textContent = currentEditSkinId ? 'Saving...' : 'Uploading...';

    try {
      const formData = new FormData();
      formData.append('ship_name', $('shipName').value.trim());
      formData.append('skin_name', $('skinName').value.trim());
      formData.append('description', $('description').value.trim());
      formData.append('visibility', $('visibility').value);

      const files = $('skinImage').files;
      const isEdit = !!currentEditSkinId;

      if (isEdit) {
        for (const file of files) {
          formData.append('images', file);
        }
        const remaining = [];
        const existingShots = document.querySelectorAll('#existingShots .existing-shot');
        existingShots.forEach(el => remaining.push(el.dataset.url));
        const origShots = JSON.parse(sessionStorage.getItem('skinr_edit_orig_shots') || '[]');
        const toRemove = origShots.filter(u => !remaining.includes(u));
        for (const url of toRemove) {
          formData.append('remove_screenshots', url);
        }
      } else {
        if (files.length === 1) {
          formData.append('image', files[0]);
        } else {
          for (const file of files) {
            formData.append('images', file);
          }
        }
      }

      const headers = {};
      if (currentUser && currentUser.access_token) {
        headers['Authorization'] = 'Bearer ' + currentUser.access_token;
      }

      const url = isEdit ? '/skins/' + currentEditSkinId : '/skins';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(API_BASE + url, { method, headers, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      showToast(isEdit ? 'Skin updated!' : 'Skin uploaded!', 'success');
      sessionStorage.removeItem('skinr_edit_orig_shots');
      currentEditSkinId = null;
      switchView('gallery');
    } catch (err) {
      showToast('Failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = currentEditSkinId ? 'Save Changes' : 'Upload Skin';
    }
  };

  // === PROFILE ===

  async function loadProfile(charId) {
    const container = $('profile-area');
    if (!charId && !currentUser) {
      container.innerHTML = `
        <div class="no-auth-msg">
          <p>Log in to view your profile or click an author name on a skin card.</p>
          <button class="auth-btn" onclick="SkinrApp.login()">EVE SSO Login</button>
        </div>
      `;
      return;
    }
    const id = charId || (currentUser ? currentUser.character_id : null);
    if (!id) {
      container.innerHTML = '<div class="gallery-grid-empty">Could not identify user.</div>';
      return;
    }
    container.innerHTML = '<div class="loading">Loading profile...</div>';
    try {
      const data = await apiFetch('/profile/' + id);
      container.innerHTML = `
        <div class="profile-header">
          <h2><span>${escapeHtml(data.character_name)}</span></h2>
          <div class="stats">${data.skin_count} skin${data.skin_count !== 1 ? 's' : ''} uploaded</div>
        </div>
        <div class="gallery-grid">
          ${data.skins.length ? data.skins.map(skin => `
            <div class="skin-card" onclick="SkinrApp.openDetail(${skin.id})">
              <img class="skin-card-image" src="${escapeHtml(skin.image_url)}" alt="${escapeHtml(skin.skin_name)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22280%22 height=%22200%22><rect fill=%22%231e1e1e%22 width=%22280%22 height=%22200%22/><text fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>No Image</text></svg>'">
              <div class="skin-card-body">
                <h3>${escapeHtml(skin.skin_name)}</h3>
                <div class="ship-name">${escapeHtml(skin.ship_name)}${skin.visibility === 'private' ? ' <span class="tag-private">PRIVATE</span>' : ''}</div>
                <div class="meta">
                  <span>${skin.screenshots && skin.screenshots.length ? '+' + skin.screenshots.length + ' shots' : ''}</span>
                  <span class="likes">&#9829; ${skin.likes || 0}</span>
                </div>
              </div>
            </div>
          `).join('') : '<div class="gallery-grid-empty">No skins uploaded yet.</div>'}
        </div>
      `;
    } catch (err) {
      container.innerHTML = '<div class="gallery-grid-empty">Error loading profile: ' + escapeHtml(err.message) + '</div>';
    }
  }

  window.SkinrApp.viewProfile = function (charId) {
    switchView('profile');
    loadProfile(charId);
  };

  // === DETAIL MODAL ===

  let modalImages = [];
  let modalImageIndex = 0;

  window.SkinrApp.openDetail = async function (id, replaceUrl) {
    const overlay = $('modal-overlay');
    overlay.classList.add('open');
    $('modal-content').innerHTML = '<div class="loading">Loading...</div>';

    const url = new URL(window.location);
    url.searchParams.set('skin', id);
    window.history[replaceUrl ? 'replaceState' : 'pushState']({ skin: id }, '', url);

    try {
      const skin = await apiFetch('/skins/' + id);
      const isOwner = currentUser && parseInt(currentUser.character_id) === skin.character_id;
      const isAdminUser = isAdmin();

      const allImages = [skin.image_url, ...(skin.screenshots || [])];
      modalImages = allImages;
      modalImageIndex = 0;

      const shareUrl = window.location.origin + window.location.pathname + '?skin=' + id;

      $('modal-content').innerHTML = `
        <div class="modal-gallery">
          <div class="modal-gallery-main">
            ${allImages.length > 1 ? '<button class="gallery-nav gallery-prev" onclick="SkinrApp.prevImage()">&lsaquo;</button>' : ''}
            <img class="modal-image" id="modalImage" src="${escapeHtml(skin.image_url)}" alt="${escapeHtml(skin.skin_name)}">
            ${allImages.length > 1 ? '<button class="gallery-nav gallery-next" onclick="SkinrApp.nextImage()">&rsaquo;</button>' : ''}
          </div>
          ${allImages.length > 1 ? '<div class="modal-gallery-thumbs">' + allImages.map((url, i) => '<img class="gallery-thumb' + (i === 0 ? ' active' : '') + '" src="' + escapeHtml(url) + '" onclick="SkinrApp.showImage(' + i + ')">').join('') + '</div>' : ''}
        </div>
        <div class="modal-body">
          <h2>${escapeHtml(skin.skin_name)}</h2>
          <div class="ship-name">${escapeHtml(skin.ship_name)} ${skin.visibility === 'private' ? '<span class="tag-private">PRIVATE</span>' : '<span class="tag-public">PUBLIC</span>'}</div>
          ${skin.description ? '<div class="description">' + escapeHtml(skin.description) + '</div>' : ''}
          <div class="meta-row">
            <span>By <a class="author-link" href="#" onclick="SkinrApp.closeDetail();SkinrApp.viewProfile(${skin.character_id}); return false;">${escapeHtml(skin.character_name)}</a> &middot; ${new Date(skin.created_at).toLocaleDateString()}</span>
            <span>
              <button class="like-btn" onclick="SkinrApp.likeSkin(${skin.id})">&#9829; <span id="like-count">${skin.likes || 0}</span></button>
              <button class="share-btn" onclick="SkinrApp.copyLink(${skin.id})" title="Copy share link">&#128279; Share</button>
              ${isOwner ? '<button class="edit-btn" onclick="SkinrApp.editSkin(' + skin.id + ')">Edit</button>' : ''}
              ${(isOwner || isAdminUser) ? '<button class="delete-btn" onclick="SkinrApp.deleteSkin(' + skin.id + ')">Delete</button>' : ''}
            </span>
          </div>
        </div>
      `;
    } catch (err) {
      $('modal-content').innerHTML = '<div class="modal-body"><p style="color: var(--danger-color);">Error: ' + escapeHtml(err.message) + '</p></div>';
    }
  };

  window.SkinrApp.showImage = function (i) {
    if (i < 0 || i >= modalImages.length) return;
    modalImageIndex = i;
    const img = $('modalImage');
    if (img) img.src = modalImages[i];
    document.querySelectorAll('.gallery-thumb').forEach((el, idx) => el.classList.toggle('active', idx === i));
  };

  window.SkinrApp.nextImage = function () {
    SkinrApp.showImage((modalImageIndex + 1) % modalImages.length);
  };

  window.SkinrApp.prevImage = function () {
    SkinrApp.showImage((modalImageIndex - 1 + modalImages.length) % modalImages.length);
  };

  window.SkinrApp.closeDetail = function () {
    $('modal-overlay').classList.remove('open');
    const url = new URL(window.location);
    url.searchParams.delete('skin');
    window.history.pushState({}, '', url);
  };

  window.SkinrApp.copyLink = function (id) {
    const link = window.location.origin + window.location.pathname + '?skin=' + id;
    navigator.clipboard.writeText(link).then(() => {
      showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy link', 'error');
    });
  };

  window.SkinrApp.editSkin = async function (id) {
    SkinrApp.closeDetail();
    try {
      const skin = await apiFetch('/skins/' + id);
      sessionStorage.setItem('skinr_edit_orig_shots', JSON.stringify(skin.screenshots || []));
      switchView('upload');
      initUpload(skin);
    } catch (err) {
      showToast('Failed to load skin for editing: ' + err.message, 'error');
    }
  };

  window.SkinrApp.likeSkin = async function (id) {
    if (!currentUser) { showToast('Log in to like skins', 'error'); return; }
    try {
      const data = await apiFetch('/skins/' + id + '/like', { method: 'POST' });
      const countEl = $('like-count');
      if (countEl) countEl.textContent = data.likes;
      showToast('Skin liked!', 'success');
    } catch (err) {
      showToast('Failed to like: ' + err.message, 'error');
    }
  };

  window.SkinrApp.deleteSkin = async function (id) {
    if (!confirm('Are you sure you want to delete this skin?')) return;
    try {
      await apiFetch('/skins/' + id, { method: 'DELETE' });
      showToast('Skin deleted', 'success');
      SkinrApp.closeDetail();
      loadGallery();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  };

  // === Search & Sort ===
  window.SkinrApp.search = function () {
    currentSearch = $('search-input').value;
    currentPage = 1;
    loadGallery();
  };

  window.SkinrApp.changeSort = function () {
    currentSort = $('sort-select').value;
    currentPage = 1;
    loadGallery();
  };

  window.SkinrApp.switchView = function (view) {
    switchView(view);
  };

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function init() {
    loadAuth();
    updateAuthUI();
    handleAuthCallback();
    fetch(API_BASE + '/config').then(r => r.json()).then(cfg => {
      ssoClientId = cfg.eve_client_id || null;
      adminIds = cfg.admin_ids || [];
      updateAuthUI();
    }).catch(() => {});
    switchView('gallery');

    const skinId = new URL(window.location).searchParams.get('skin');
    if (skinId) {
      SkinrApp.openDetail(parseInt(skinId), true);
    }

    window.addEventListener('popstate', function (e) {
      const skinId = new URL(window.location).searchParams.get('skin');
      if (skinId) {
        SkinrApp.openDetail(parseInt(skinId), true);
      } else {
        SkinrApp.closeDetail();
      }
    });

    $('search-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') SkinrApp.search();
    });

    $('modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) SkinrApp.closeDetail();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') SkinrApp.closeDetail();
      if (e.key === 'ArrowLeft' && $('modal-overlay').classList.contains('open')) SkinrApp.prevImage();
      if (e.key === 'ArrowRight' && $('modal-overlay').classList.contains('open')) SkinrApp.nextImage();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
