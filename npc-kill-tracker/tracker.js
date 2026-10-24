/*
 * Rusty NPC Tracker — core engine (no DOM, no dependencies).
 * Loadable as a classic <script> (exposes window.RustyTracker) or require()d in Node.
 *
 * Responsibilities:
 *   - Parse EVE game logs (bounty lines, system jumps/undocks, NPC combat context)
 *   - Resolve bounty amounts to NPC types using the generated SDE data
 *   - Compute session statistics, ESS-adjusted ISK and ISK/hour
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RustyTracker = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ------------------------------------------------------------------
    // Log line parsing
    // ------------------------------------------------------------------

    var TS_RE = /^\[\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*\]/;
    var BOUNTY_RE = /^\[\s*\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2}\s*\]\s*\(bounty\)/;
    var BOUNTY_AMOUNT_RE = />([\d,]+)\s*ISK</;
    var JUMP_RE = /\]\s*\(\w+\)\s*Jumping from (.+?) to (.+?)\s*$/i;
    var UNDOCK_RE = /\]\s*\(\w+\)\s*Undocking from (.+?) to (.+?) solar system\.\s*$/i;
    var LISTENER_RE = /^\s*Listener:\s*(.+?)\s*$/;
    var SESSION_RE = /^\s*Session Started:\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*$/;
    var DRONES_RE = /\]\s*\(\w+\)\s*Drones engaging (.+?)\.?\s*$/i;
    var COMBAT_NAME_RE = /<font size=10>(to|from)<\/font>\s*<b><color=0x[0-9a-fA-F]+>([^<]+)<\/b>/;
    var LOCALIZED_RE = /<localized[^>]*>/g;
    var TAG_RE = /<[^>]+>/g;

    // Combat damage parsing (same shapes as Helper overlay/main/line-parser.js).
    var DAMAGE_RE = /<b>([\d,.]+)<\/b>\s*<color=0x[0-9a-f]+><font size=\d+>(to|from)<\/font>/i;
    var SOURCE_RE = /<b><color=0x[0-9a-f]+>([^<]+)<\/b>/i;
    var WEAPON_RE = / - (?:(.+?) - )?(Smashes|Penetrates|Hits|Grazes|Glances Off|Wrecks|Misses|Deflects|Absorbs)\s*(?:<\/font>)?\s*$/i;
    var MISS_YOU_RE = /\] \(combat\) (.+?) misses you( completely)?/i;
    var PLAIN_OUT_HIT_RE = /\] \(combat\) Your (.+?) hits (.+?),\s*doing\s+([\d,.]+)\s+damage/i;
    var PLAIN_OUT_MISS_RE = /\] \(combat\) Your (.+?) misses (.+?)( completely)?\s*(?:-?\s*<\/font>)?\s*$/i;
    var PLAIN_IN_HIT_RE = /\] \(combat\) (.+?) (?:aims well at you, inflicting|hits you, (?:doing|inflicting))\s+([\d,.]+)\s+damage/i;
    var REMOTE_REPAIR_RE = /remote\s+(armor|shield|hull|capacitor)/i;

    var EVIDENCE_WINDOW_MS = 45000;   // NPC activity considered "recent" for a kill
    var EVIDENCE_MAX = 8;             // names kept per kill event
    var EVIDENCE_KEEP_MS = 90000;     // prune nameless old evidence

    function parseTs(y, mo, d, h, mi, s) {
        return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    }

    function lineTimestamp(line) {
        var m = TS_RE.exec(line);
        if (!m) return null;
        return parseTs(m[1], m[2], m[3], m[4], m[5], m[6]);
    }

    function cleanName(name) {
        var s = String(name).replace(LOCALIZED_RE, '').replace(TAG_RE, '').trim();
        var bracket = s.indexOf('[');
        if (bracket > 0) s = s.slice(0, bracket).trim(); // strip [CORP (Ship)] suffixes
        return s;
    }

    function parseAmount(raw) {
        var n = parseFloat(String(raw).replace(/,/g, ''));
        if (!isFinite(n)) return null;
        return Math.round(n);
    }

    function splitPilotShip(raw) {
        var s = String(raw).trim();
        var shipM = s.match(/\(([^()]+)\)\s*$/);
        var ship = shipM ? shipM[1].trim() : '';
        var pilot = s.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*/g, ' ').trim() || s;
        return { pilot: pilot, ship: ship };
    }

    function parseCombatSource(line) {
        var m = SOURCE_RE.exec(line);
        if (!m) return { pilot: 'Unknown', ship: '' };
        var inner = m[1].trim();
        var shipM = inner.match(/\(([^()]+)\)\s*$/);
        var ship = shipM ? shipM[1].trim() : '';
        var pilot = inner.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*/g, ' ').trim() || inner;
        return { pilot: pilot, ship: ship };
    }

    /**
     * Parse one (combat) line into a damage hit or a miss.
     * Returns { ts, amount?, dir, pilot, ship, weapon, verb } / { ts, miss, dir, pilot, ship, weapon }.
     * Remote repair is deliberately ignored — it is not damage.
     */
    function parseCombatLine(line, ts) {
        if (!line || line.indexOf('(combat)') === -1) return null;
        if (REMOTE_REPAIR_RE.test(line)) return null;

        var plainOut = PLAIN_OUT_HIT_RE.exec(line);
        if (plainOut) {
            var pOut = parseAmount(plainOut[3]);
            if (pOut === null) return null;
            var tOut = splitPilotShip(plainOut[2]);
            return { ts: ts, amount: pOut, dir: 'out', pilot: tOut.pilot, ship: tOut.ship, weapon: plainOut[1].trim(), verb: 'Hits' };
        }

        var plainOutMiss = PLAIN_OUT_MISS_RE.exec(line);
        if (plainOutMiss) {
            var missTarget = plainOutMiss[2].replace(/\s+completely\.?$/i, '').replace(/\.$/, '').trim();
            var tMiss = splitPilotShip(missTarget);
            return { ts: ts, miss: true, dir: 'out', pilot: tMiss.pilot, ship: tMiss.ship, weapon: plainOutMiss[1].trim() };
        }

        var plainIn = PLAIN_IN_HIT_RE.exec(line);
        if (plainIn) {
            var pIn = parseAmount(plainIn[2]);
            if (pIn === null) return null;
            var sIn = splitPilotShip(plainIn[1]);
            return { ts: ts, amount: pIn, dir: 'in', pilot: sIn.pilot, ship: sIn.ship, weapon: '', verb: 'Hits' };
        }

        var missYou = MISS_YOU_RE.exec(line);
        if (missYou) {
            return { ts: ts, miss: true, dir: 'in', pilot: missYou[1].trim(), ship: '', weapon: '' };
        }

        var dmgM = DAMAGE_RE.exec(line);
        if (!dmgM) return null;
        var weaponM = WEAPON_RE.exec(line);
        if (!weaponM) return null;

        var dir = dmgM[2].toLowerCase() === 'to' ? 'out' : 'in';
        var verb = weaponM[2];
        if (/^(misses|deflects|absorbs)$/i.test(verb)) {
            return { ts: ts, miss: true, dir: dir };
        }
        var amount = parseAmount(dmgM[1]);
        if (amount === null) return null;
        var src = parseCombatSource(line);
        return {
            ts: ts,
            amount: amount,
            dir: dir,
            pilot: src.pilot,
            ship: src.ship,
            weapon: (weaponM[1] || '').trim(),
            verb: verb,
        };
    }

    /**
     * Streaming game log parser.
     * Feed raw text chunks; complete lines are parsed incrementally.
     */
    function LogParser() {
        this.buffer = '';
        this.char = null;
        this.sessionStart = null;
        this.system = null;       // current solar system name (from jumps/undocks)
        this.evidence = new Map(); // npc name -> last seen ms
        this.pending = [];        // events with unknown system (backfilled on first system info)
        this.damage = [];         // cumulative hits: {t,a,dir,pilot,ship,weapon,verb}
        this.misses = [];         // cumulative misses: {t,dir,pilot,ship,weapon}
    }

    LogParser.prototype._setSystem = function (systemName) {
        this.system = systemName;
        if (this.pending.length) {
            // Everything logged before the first known system happened in that system
            // (travel between systems always produces a "Jumping" line).
            for (var i = 0; i < this.pending.length; i++) this.pending[i].sys = systemName;
            this.pending.length = 0;
        }
    };

    LogParser.prototype.feed = function (chunk) {
        var events = [];
        var jumps = [];
        var damage = [];
        var misses = [];
        var text = this.buffer + chunk;
        var lines = text.split('\n');
        this.buffer = lines.pop(); // keep incomplete tail

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.charAt(line.length - 1) === '\r') line = line.slice(0, -1);
            if (!line) continue;
            this._line(line, events, jumps, damage, misses);
        }
        return { events: events, jumps: jumps, damage: damage, misses: misses };
    };

    LogParser.prototype._line = function (line, events, jumps, damage, misses) {
        // Header lines (no timestamp)
        if (this.char === null) {
            var lm = LISTENER_RE.exec(line);
            if (lm) { this.char = lm[1]; return; }
        }
        if (this.sessionStart === null) {
            var sm = SESSION_RE.exec(line);
            if (sm) { this.sessionStart = parseTs(sm[1], sm[2], sm[3], sm[4], sm[5], sm[6]); return; }
        }

        var ts = lineTimestamp(line);
        if (ts === null) return;

        // Bounty kill line
        if (BOUNTY_RE.test(line)) {
            var am = BOUNTY_AMOUNT_RE.exec(line);
            if (am) {
                var amount = parseInt(am[1].replace(/,/g, ''), 10);
                if (amount > 0) {
                    var event = {
                        t: ts,
                        a: amount,
                        sys: this.system,
                        ev: this._recentEvidence(ts),
                        ch: this.char,
                    };
                    if (line.indexOf('(payment adjusted)') !== -1) event.adj = true;
                    events.push(event);
                    if (!this.system) this.pending.push(event);
                }
            }
            return;
        }

        // System tracking
        var jm = JUMP_RE.exec(line);
        if (jm) {
            // Kills logged before the first jump happened in the jump's origin system.
            this._setSystem(jm[1].trim());
            this.system = jm[2].trim();
            jumps.push({ t: ts, from: jm[1].trim(), to: this.system });
            return;
        }
        var um = UNDOCK_RE.exec(line);
        if (um) { this._setSystem(um[2].trim()); jumps.push({ t: ts, from: null, to: this.system }); return; }

        // NPC activity evidence (drone engagements, damage lines)
        var dm = DRONES_RE.exec(line);
        if (dm) { this._noteEvidence(cleanName(dm[1]), ts); return; }

        var dmg = parseCombatLine(line, ts);
        if (dmg) {
            if (dmg.pilot) this._noteEvidence(cleanName(dmg.pilot), ts);
            if (dmg.miss) {
                var miss = { t: ts, dir: dmg.dir, pilot: dmg.pilot || '', ship: dmg.ship || '', weapon: dmg.weapon || '' };
                misses.push(miss);
                this.misses.push(miss);
            } else {
                var hit = {
                    t: ts, a: dmg.amount, dir: dmg.dir,
                    pilot: dmg.pilot || '', ship: dmg.ship || '',
                    weapon: dmg.weapon || '', verb: dmg.verb || '',
                };
                damage.push(hit);
                this.damage.push(hit);
            }
            return;
        }

        var cm = COMBAT_NAME_RE.exec(line);
        if (cm) { this._noteEvidence(cleanName(cm[2]), ts); return; }
    };

    LogParser.prototype._noteEvidence = function (name, ts) {
        if (!name) return;
        this.evidence.set(name, ts);
        if (this.evidence.size > 400) this._pruneEvidence(ts);
    };

    LogParser.prototype._pruneEvidence = function (now) {
        var cutoff = now - EVIDENCE_KEEP_MS;
        var self = this;
        this.evidence.forEach(function (seen, name) {
            if (seen < cutoff) self.evidence.delete(name);
        });
    };

    LogParser.prototype._recentEvidence = function (now) {
        var cutoff = now - EVIDENCE_WINDOW_MS;
        var recent = [];
        this.evidence.forEach(function (seen, name) {
            if (seen >= cutoff) recent.push([name, seen]);
        });
        recent.sort(function (a, b) { return b[1] - a[1]; });
        return recent.slice(0, EVIDENCE_MAX).map(function (r) { return r[0]; });
    };

    // ------------------------------------------------------------------
    // Data indexes + NPC resolution
    // ------------------------------------------------------------------

    // Payout adjustments (ESS bounty-risk modifier, insurgency/CRAB modifiers) can scale
    // the paid bounty. Amounts that miss the exact table get a bounded dynamic scan.
    var SCALE_MIN = 0.5;
    var SCALE_MAX = 1.5;
    var SCALE_TOLERANCE = 0.005; // 0.5%

    function buildIndexes(data) {
        var rats = data.rats;
        var ratById = new Map();
        var ratByName = new Map();
        var bountyIndex = new Map();
        var byBounty = new Map();
        for (var i = 0; i < rats.length; i++) {
            var r = rats[i];
            ratById.set(r[0], i);
            ratByName.set(r[1].toLowerCase(), i);
            var key = Math.round(r[2]);
            if (!byBounty.has(key)) byBounty.set(key, []);
            byBounty.get(key).push(i);
        }
        byBounty.forEach(function (list, key) { bountyIndex.set(key, list); });
        var systems = new Map();
        var systemsById = new Map();
        for (var s = 0; s < data.systems.length; s++) {
            var sy = data.systems[s];
            var region = (sy[2] >= 0 && data.regions[sy[2]]) ? data.regions[sy[2]] : '';
            var sysInfo = { name: sy[0], sec: sy[1], region: region };
            systems.set(sy[0].toLowerCase(), sysInfo);
            if (sy[3] != null) systemsById.set(Number(sy[3]), sysInfo);
        }
        return {
            data: data,
            rats: rats,
            ratById: ratById,
            ratByName: ratByName,
            bountyIndex: bountyIndex,
            byBounty: byBounty,
            systems: systems,
            systemsById: systemsById,
            scaleCache: new Map(), // amount -> [[ratIdx, mult], ...]
        };
    }

    /**
     * Find rats whose (possibly adjusted) payout explains `amount`.
     * Exact matches are handled by bountyIndex; this scans distinct raw bounties
     * for a scale factor in [SCALE_MIN, SCALE_MAX] within tolerance.
     */
    function scaledCandidates(amount, indexes) {
        var cached = indexes.scaleCache.get(amount);
        if (cached) return cached;
        var out = [];
        var tol = Math.max(1, amount * SCALE_TOLERANCE);
        indexes.byBounty.forEach(function (list, base) {
            var m = amount / base;
            if (m < SCALE_MIN || m > SCALE_MAX) return;
            if (Math.abs(amount - base * m) > tol) return;
            var rounded = Math.round(m * 1000) / 1000;
            for (var i = 0; i < list.length; i++) out.push([list[i], rounded]);
        });
        out.sort(function (a, b) { return Math.abs(a[1] - 1) - Math.abs(b[1] - 1); });
        indexes.scaleCache.set(amount, out);
        return out;
    }

    function ratName(indexes, idx) { return indexes.rats[idx] ? indexes.rats[idx][1] : '?'; }
    function ratBounty(indexes, idx) { return indexes.rats[idx] ? indexes.rats[idx][2] : 0; }
    function ratGroup(indexes, idx) {
        var r = indexes.rats[idx];
        if (!r) return '';
        return indexes.data.groups[r[3]] || '';
    }
    function ratFaction(indexes, idx) {
        var r = indexes.rats[idx];
        if (!r) return '';
        return indexes.data.factions[r[4]] || 'Other';
    }

    /**
     * Resolve one kill event to an NPC type.
     * event: {a, ev:[names], override: typeId?}
     * Returns { status: 'r'|'g'|'u', idx, mult, candidates: [idx], fromOverride }
     */
    function resolveEvent(event, indexes, opts) {
        opts = opts || {};
        if (event.override != null && indexes.ratById.has(event.override)) {
            return { status: 'm', idx: indexes.ratById.get(event.override), mult: 1, candidates: [], fromOverride: true };
        }
        var amount = event.a;
        var evNames = (opts.useContext !== false && event.ev) ? event.ev : [];
        var evSeen = new Map();
        for (var e = 0; e < evNames.length; e++) {
            var key = evNames[e].toLowerCase();
            if (!evSeen.has(key)) evSeen.set(key, e);
        }

        var scored = [];
        var exact = indexes.bountyIndex.get(amount);
        if (exact) {
            for (var i = 0; i < exact.length; i++) scored.push(makeCandidate(exact[i], 1, evSeen, indexes));
        }
        // Only fall back to scaled matching when the exact table has no entry at all.
        if (!scored.length) {
            var scaled = scaledCandidates(amount, indexes);
            for (var s = 0; s < scaled.length; s++) scored.push(makeCandidate(scaled[s][0], scaled[s][1], evSeen, indexes));
        }
        if (!scored.length) return { status: 'u', idx: null, mult: 1, candidates: [] };

        scored.sort(function (a, b) {
            if (a.seenRank !== b.seenRank) return a.seenRank - b.seenRank;
            if ((a.mult === 1) !== (b.mult === 1)) return a.mult === 1 ? -1 : 1;
            if (a.mult !== b.mult) return Math.abs(a.mult - 1) - Math.abs(b.mult - 1);
            return a.name.localeCompare(b.name);
        });
        var best = scored[0];
        var unique = scored.length === 1;
        var status = (unique || best.seenRank !== Infinity) ? 'r' : 'g';
        return {
            status: status,
            idx: best.idx,
            mult: best.mult,
            candidates: scored.slice(0, 12).map(function (c) { return c.idx; }),
            fromOverride: false,
        };
    }

    function makeCandidate(idx, mult, evSeen, indexes) {
        var name = ratName(indexes, idx);
        var seenRank = evSeen.has(name.toLowerCase()) ? evSeen.get(name.toLowerCase()) : Infinity;
        return { idx: idx, mult: mult, seenRank: seenRank, name: name };
    }

    // ------------------------------------------------------------------
    // ESS + stats
    // ------------------------------------------------------------------

    var DEFAULT_ESS = {
        enabled: true,
        nullsecRate: 40,      // % held by the ESS main bank in nullsec
        customRate: null,     // when set, used for every system instead of sec-based logic
        overrides: {},        // system name (lower) -> % (overrides both)
        includesBank: false,  // count the bank payout (eventually returned) in net totals
        taxPct: 0,            // corp tax on bounty income
        useContext: true,
    };

    function normalizeEssSettings(settings) {
        var out = {};
        for (var k in DEFAULT_ESS) out[k] = DEFAULT_ESS[k];
        if (settings) for (var k2 in settings) if (settings[k2] !== undefined && settings[k2] !== null) out[k2] = settings[k2];
        if (!out.overrides || typeof out.overrides !== 'object') out.overrides = {};
        return out;
    }

    /**
     * ESS share (%) taken from the bounty for a given system.
     * Returns { rate, source } where source: 'off'|'custom'|'override'|'nullsec'|'none'|'unknown'
     */
    function essRateFor(systemName, ess, systemsIndex) {
        if (!ess.enabled) return { rate: 0, source: 'off' };
        if (ess.customRate !== null && ess.customRate !== undefined) return { rate: ess.customRate, source: 'custom' };
        if (systemName) {
            var ov = ess.overrides[systemName.toLowerCase()];
            if (ov !== undefined && ov !== null) return { rate: ov, source: 'override' };
            var info = systemsIndex ? systemsIndex.get(systemName.toLowerCase()) : null;
            if (!info) return { rate: ess.nullsecRate, source: 'unknown' };
            if (info.sec < 0) return { rate: ess.nullsecRate, source: 'nullsec' };
            return { rate: 0, source: 'none' };
        }
        return { rate: ess.nullsecRate, source: 'unknown' };
    }

    /**
     * Session stats.
     * session: { events:[{t,a,sys,ev,override?}], start? }
     * Returns totals overall + grouped by NPC and by system, plus a timeline.
     */
    function computeStats(session, indexes, rawEssSettings, nowMs) {
        var ess = normalizeEssSettings(rawEssSettings);
        var now = nowMs || Date.now();
        var events = session.events || [];
        var eventsSorted = events.slice().sort(function (a, b) { return a.t - b.t; });

        var start = session.start || (eventsSorted.length ? eventsSorted[0].t : now);
        var lastT = eventsSorted.length ? eventsSorted[eventsSorted.length - 1].t : start;
        var end = session.live ? now : lastT;
        var spanMs = Math.max(0, end - start);

        var byNpc = new Map();     // key: rat idx or 'u:<amount>'
        var bySystem = new Map();  // key: system name or '' (unknown)
        var timeline = [];
        var grossTotal = 0, netTotal = 0, bankTotal = 0, taxTotal = 0, essTotal = 0;
        var resolved = 0, guessed = 0, unknown = 0, manual = 0;
        var cumNet = 0;

        for (var i = 0; i < eventsSorted.length; i++) {
            var ev = eventsSorted[i];
            var r = resolveEvent(ev, indexes, ess);
            if (r.status === 'r' || r.status === 'm') resolved++;
            else if (r.status === 'g') guessed++;
            else unknown++;
            if (r.status === 'm') manual++;

            var gross = ev.a;
            var essInfo = essRateFor(ev.sys, ess, indexes.systems);
            var essAmt = gross * (essInfo.rate / 100);
            var taxAmt = gross * (ess.taxPct / 100);
            var net = (gross - essAmt) * (1 - ess.taxPct / 100);
            var bank = essAmt * (1 - ess.taxPct / 100);
            if (ess.includesBank) net += bank;

            grossTotal += gross;
            netTotal += net;
            bankTotal += bank;
            taxTotal += taxAmt;
            essTotal += essAmt;
            cumNet += net;

            var key = r.idx != null ? String(r.idx) : 'u:' + gross;
            var npc = byNpc.get(key);
            if (!npc) {
                npc = {
                    idx: r.idx, amount: gross, qty: 0, gross: 0, net: 0, bank: 0,
                    conf: { r: 0, g: 0, u: 0, m: 0 }, status: r.status, systems: new Set(),
                };
                byNpc.set(key, npc);
            }
            npc.qty++;
            npc.gross += gross;
            npc.net += net;
            npc.bank += bank;
            if (npc.conf[r.status] !== undefined) npc.conf[r.status]++;
            if (r.status === 'u') npc.status = 'u';
            else if (r.status === 'g' && npc.status !== 'u') npc.status = 'g';
            else if (r.status === 'm' && npc.status === 'r') npc.status = 'm';
            if (ev.sys) npc.systems.add(ev.sys);

            var sysKey = ev.sys || '';
            var sys = bySystem.get(sysKey);
            if (!sys) {
                sys = { name: ev.sys || null, kills: 0, gross: 0, net: 0, bank: 0, first: ev.t, last: ev.t, essRate: essInfo.rate, essSource: essInfo.source };
                bySystem.set(sysKey, sys);
            }
            sys.kills++;
            sys.gross += gross;
            sys.net += net;
            sys.bank += bank;
            sys.last = ev.t;
            sys.essRate = Math.max(sys.essRate, essInfo.rate);
            if (sys.essSource !== essInfo.source && essInfo.rate > 0) sys.essSource = essInfo.source;

            timeline.push({ t: ev.t, cum: cumNet });
        }

        // Downsample timeline to ~150 points for drawing
        var drawn = timeline;
        if (timeline.length > 150) {
            drawn = [];
            var step = timeline.length / 150;
            for (var p = 0; p < timeline.length; p += step) drawn.push(timeline[Math.floor(p)]);
            drawn.push(timeline[timeline.length - 1]);
        }

        var npcList = [];
        byNpc.forEach(function (v) { npcList.push(v); });
        npcList.sort(function (a, b) { return b.net - a.net; });

        var sysList = [];
        bySystem.forEach(function (v) { sysList.push(v); });
        sysList.sort(function (a, b) { return b.net - a.net; });

        var spanHours = spanMs / 3600000;
        return {
            start: start,
            end: end,
            spanMs: spanMs,
            kills: eventsSorted.length,
            gross: grossTotal,
            net: netTotal,
            bank: bankTotal,
            ess: essTotal,
            tax: taxTotal,
            iskPerHour: spanHours > (1 / 60) ? netTotal / spanHours : null,
            grossPerHour: spanHours > (1 / 60) ? grossTotal / spanHours : null,
            resolved: resolved,
            guessed: guessed,
            unknown: unknown,
            manual: manual,
            byNpc: npcList,
            bySystem: sysList,
            timeline: drawn,
            essSettings: ess,
        };
    }

    // ------------------------------------------------------------------
    // DPS (combat log hits, rolling windows)
    // ------------------------------------------------------------------

    /**
     * Compute incoming/outgoing DPS for one session.
     * session: { damage:[{t,a,dir,...}], misses:[{t,dir,...}], start, end, live }
     * spanOverride: optional total span in ms (used by the "all sessions" view).
     */
    function computeDps(session, nowMs, spanOverride) {
        var damage = (session && session.damage) || [];
        var misses = (session && session.misses) || [];
        var now = nowMs || Date.now();
        var sorted = damage.slice().sort(function (a, b) { return a.t - b.t; });
        var firstT = sorted.length ? sorted[0].t : null;
        var lastT = sorted.length ? sorted[sorted.length - 1].t : null;
        var start = (session && session.start) || firstT || now;
        var end;
        if (session && session.live) end = now;
        else end = Math.max((session && session.end) || 0, lastT || 0, start);
        var spanMs = spanOverride != null ? spanOverride : Math.max(0, end - start);
        var activeMs = (firstT != null && lastT != null) ? Math.max(0, lastT - firstT) : 0;
        var activeSec = Math.max(1, activeMs / 1000);

        var liveCut = end - 10000;
        var cut60 = end - 60000;
        var inLive = 0, outLive = 0, in60 = 0, out60 = 0;
        var totalIn = 0, totalOut = 0, hitsIn = 0, hitsOut = 0;

        for (var i = 0; i < sorted.length; i++) {
            var e = sorted[i];
            var isIn = e.dir === 'in';
            if (isIn) { totalIn += e.a; hitsIn++; } else { totalOut += e.a; hitsOut++; }
            if (e.t >= liveCut) { if (isIn) inLive += e.a; else outLive += e.a; }
            if (e.t >= cut60) { if (isIn) in60 += e.a; else out60 += e.a; }
        }

        // Peak 10-second window (two-pointer; sorted by timestamp).
        var p = 0, sumIn = 0, sumOut = 0, peakIn = 0, peakOut = 0;
        for (var j = 0; j < sorted.length; j++) {
            if (sorted[j].dir === 'in') sumIn += sorted[j].a; else sumOut += sorted[j].a;
            while (sorted[j].t - sorted[p].t > 10000) {
                if (sorted[p].dir === 'in') sumIn -= sorted[p].a; else sumOut -= sorted[p].a;
                p++;
            }
            if (sumIn > peakIn) peakIn = sumIn;
            if (sumOut > peakOut) peakOut = sumOut;
        }

        var missIn = 0, missOut = 0;
        for (var m = 0; m < misses.length; m++) {
            if (misses[m].dir === 'in') missIn++; else if (misses[m].dir === 'out') missOut++;
        }
        var rate = function (hits, miss) {
            var total = hits + miss;
            return total > 0 ? (hits / total) * 100 : null;
        };

        return {
            live: { inDps: inLive / 10, outDps: outLive / 10 },
            avg60: { inDps: in60 / 60, outDps: out60 / 60 },
            avg: { inDps: totalIn / activeSec, outDps: totalOut / activeSec },
            peak: { inDps: peakIn / 10, outDps: peakOut / 10 },
            totals: { in: totalIn, out: totalOut },
            hits: { in: hitsIn, out: hitsOut },
            misses: { in: missIn, out: missOut },
            hitRate: { inPct: rate(hitsIn, missIn), outPct: rate(hitsOut, missOut) },
            spanMs: spanMs,
            activeMs: activeMs,
        };
    }

    // ------------------------------------------------------------------
    // Formatting helpers (shared with UI)
    // ------------------------------------------------------------------

    function fmtInt(n) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        return Math.round(n).toLocaleString('en-US');
    }

    function fmtISK(n, compact) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        var abs = Math.abs(n);
        if (compact) {
            if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
            if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
            if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
            return Math.round(n).toString();
        }
        return fmtInt(n);
    }

    function fmtDuration(ms) {
        if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '—';
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600); s -= h * 3600;
        var m = Math.floor(s / 60); s -= m * 60;
        if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
        return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
    }

    function fmtClock(ms) {
        if (!ms) return '—';
        var d = new Date(ms);
        var hh = ('0' + d.getUTCHours()).slice(-2);
        var mm = ('0' + d.getUTCMinutes()).slice(-2);
        var ss = ('0' + d.getUTCSeconds()).slice(-2);
        return hh + ':' + mm + ':' + ss;
    }

    function fmtDateTime(ms) {
        if (!ms) return '—';
        var d = new Date(ms);
        return d.toLocaleString();
    }

    function secClass(sec) {
        if (sec === null || sec === undefined) return 'sec-unknown';
        if (sec >= 0.5) return 'sec-high';
        if (sec > 0) return 'sec-low';
        return 'sec-null';
    }

    return {
        LogParser: LogParser,
        buildIndexes: buildIndexes,
        resolveEvent: resolveEvent,
        computeStats: computeStats,
        computeDps: computeDps,
        normalizeEssSettings: normalizeEssSettings,
        essRateFor: essRateFor,
        ratName: ratName,
        ratBounty: ratBounty,
        ratGroup: ratGroup,
        ratFaction: ratFaction,
        fmtInt: fmtInt,
        fmtISK: fmtISK,
        fmtDuration: fmtDuration,
        fmtClock: fmtClock,
        fmtDateTime: fmtDateTime,
        secClass: secClass,
        DEFAULT_ESS: DEFAULT_ESS,
        SCALE_MIN: SCALE_MIN,
        SCALE_MAX: SCALE_MAX,
    };
});
