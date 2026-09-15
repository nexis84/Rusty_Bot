// Blueprint Visualizer SSO — blueprint + asset scopes. Graceful if backend not configured.
(function () {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const BASE = isLocal ? 'http://localhost:8080' : 'https://api.rustybot.co.uk';
  const REDIRECT = isLocal ? 'http://localhost:8080/blueprint-visualizer/sso-callback.html' : 'https://www.rustybot.co.uk/blueprint-visualizer/sso-callback.html';
  const SCOPES = ['esi-characters.read_blueprints.v1', 'esi-corporations.read_blueprints.v1', 'esi-assets.read_assets.v1', 'esi-skills.read_skills.v1'];
  let clientId = null;
  async function getClientId() {
    if (clientId) return clientId;
    const r = await fetch(BASE + '/api/bv/config');
    if (!r.ok) throw new Error('SSO not configured (BV backend missing)');
    const j = await r.json(); clientId = j.eve_client_id; return clientId;
  }
  function tokens() { try { return JSON.parse(localStorage.getItem('bv_esi_tokens') || 'null'); } catch { return null; } }
  function char_() { try { return JSON.parse(localStorage.getItem('bv_esi_char') || 'null'); } catch { return null; } }
  window.BVAuth = {
    tokens, character: char_,
    signedIn() { return !!tokens(); },
    async login() {
      const cid = await getClientId();
      const state = Math.random().toString(36).slice(2);
      localStorage.setItem('bv_esi_state', state);
      const p = new URLSearchParams({ response_type: 'code', redirect_uri: REDIRECT, client_id: cid, scope: SCOPES.join(' '), state });
      location.href = 'https://login.eveonline.com/v2/oauth/authorize?' + p.toString();
    },
    logout() { localStorage.removeItem('bv_esi_tokens'); localStorage.removeItem('bv_esi_char'); location.reload(); },
    async api(path, opts) {
      const t = tokens(); if (!t) throw new Error('Not signed in');
      const o = opts || {};
      const r = await fetch('https://esi.evetech.net/latest' + path, { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + t.access_token } });
      if (!r.ok) throw new Error('ESI ' + r.status + ' ' + path);
      return r.json();
    }
  };
})();
