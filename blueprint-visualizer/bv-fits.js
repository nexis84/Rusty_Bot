// Fit Builder — EFT / EVE "Copy to Clipboard" fit parser.
// Pure parsing + a local name index only (no DOM, no network) so it can load
// before bv-visualizer.js and be unit-tested on its own.
(function () {
  'use strict';

  // Section labels some exporters add between slots — never items.
  var SECTION_LABEL = /^(high|med(ium)?|mid|low|rig|rigs|subsystem|drone|drones|cargo|charges?|implants?|boosters?)\s*(power|slots?)?$/i;

  // "Hobgoblin II x5" / "Hobgoblin II x 5" -> { name, qty } (qty null if absent).
  function splitQty(s) {
    var m = String(s).match(/^(.*?)\s*[xX\u00d7]\s*([\d.,\s\u00a0]+)$/);
    if (m) {
      var q = parseInt(String(m[2]).replace(/[\s,.\u00a0]/g, ''), 10);
      if (q > 0) return { name: m[1].trim(), qty: q };
    }
    return { name: String(s).trim(), qty: null };
  }

  // "Module, Charge" — EFT puts a loaded charge after the first comma.
  function parseLine(line) {
    var text = String(line).trim();
    if (!text) return null;
    var idx = text.indexOf(',');
    var left = idx >= 0 ? text.slice(0, idx) : text;
    var right = idx >= 0 ? text.slice(idx + 1) : '';
    var l = splitQty(left);
    if (!l.name) return null;
    var out = { name: l.name, qty: l.qty || 1, charge: null };
    if (right.trim()) {
      var c = splitQty(right);
      if (c.name) out.charge = { name: c.name, qty: c.qty };
    }
    return out;
  }

  // Parse text -> [ { ship, fitName, items: [{ name, qty, charge }] } ].
  // EVE's clipboard order is ship header, modules, drones, cargo; slot names
  // don't affect build math, so they're intentionally not tracked.
  function parseEftFits(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var fits = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var h = line.match(/^\[([^,\]]+?)(?:\s*,\s*(.*?))?\]$/);
      if (h) {
        var inside = h[1].trim();
        if (/^empty\b/i.test(inside)) { cur = null; continue; } // [Empty High slot]
        cur = { ship: inside, fitName: (h[2] || '').trim(), items: [] };
        fits.push(cur);
        continue;
      }
      if (!cur) continue;            // ignore anything before the first header
      if (SECTION_LABEL.test(line)) continue;
      var it = parseLine(line);
      if (it) cur.items.push(it);
    }
    return fits;
  }

  // Name-only section guess (type info isn't loaded here). The visualizer
  // prefers the real SDE category when available and falls back to this.
  function classifyName(name) {
    var n = String(name || '').toLowerCase();
    if (/\b(script|missile|torpedo|rocket|charge|crystal|ammo|ammunition|artillery|howitzer|blaster|railgun|autocannon|neutron|plasma|pulse|beam|laser|projectile|hybrid|bomb|mine)\b/.test(n)) return 'charge';
    if (/\b(drone|fighter|sentry|excavator|wasp|hammerhead|hobgoblin|warrior|valkyrie|ogre|berserker|praetor|infiltrator|vespa|hornet|acolyte|bouncer|curator|warden|garde|dragonfly|firbolg|einherji|templar)\b/.test(n)) return 'drone';
    return 'module';
  }

  // Flatten a parsed fit into an aggregated want-list (hull + items + loaded
  // charges). opts: { hull: bool, chargeQty: number }.
  function flattenFit(fit, opts) {
    opts = opts || {};
    var out = [];
    var add = function (name, qty) { if (name) out.push({ name: String(name).trim(), qty: Math.max(1, (qty | 0) || 1) }); };
    if (opts.hull !== false && fit && fit.ship) add(fit.ship, 1);
    var items = (fit && fit.items) || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      add(it.name, it.qty || 1);
      if (it.charge) add(it.charge.name, it.charge.qty != null ? it.charge.qty : (opts.chargeQty || 1));
    }
    var m = new Map();
    for (var j = 0; j < out.length; j++) {
      var k = out[j].name.toLowerCase();
      var e = m.get(k);
      if (e) e.qty += out[j].qty;
      else m.set(k, { name: out[j].name, qty: out[j].qty });
    }
    return Array.from(m.values());
  }

  // Local lowercased-name -> { id, cat } index from AllMarketItems
  // (market/items_database.js). Built once, lazily.
  var _index = null;
  function localIndex() {
    if (_index) return _index;
    _index = new Map();
    try {
      var db = (typeof AllMarketItems !== 'undefined' ? AllMarketItems : (typeof window !== 'undefined' && window.AllMarketItems) || {});
      Object.keys(db).forEach(function (catKey) {
        var cat = db[catKey];
        if (!cat || !cat.items) return;
        for (var i = 0; i < cat.items.length; i++) {
          var it = cat.items[i];
          if (!it || !it.name) continue;
          var k = it.name.toLowerCase();
          if (!_index.has(k)) _index.set(k, { id: it.id, cat: catKey });
        }
      });
    } catch (e) {}
    return _index;
  }

  window.BVFits = {
    parseEftFits: parseEftFits,
    flattenFit: flattenFit,
    classifyName: classifyName,
    localIndex: localIndex
  };
})();
