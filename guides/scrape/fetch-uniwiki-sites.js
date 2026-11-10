// UniWiki site crawler
// Pulls site pages from EVE University Wiki categories, parses the site
// infobox and NPC spawn tables, and writes guides/data/uniwiki-sites.json.
//
// Usage:
//   node fetch-uniwiki-sites.js                 # sites only
//   node fetch-uniwiki-sites.js --missions      # sites + missions
//   node fetch-uniwiki-sites.js --limit 5       # smoke test
//   node fetch-uniwiki-sites.js --categories "Combat Anomalies,DED Complexes"
//
// Content is CC BY-SA 4.0; keep the source URL with each record.

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const API = 'https://wiki.eveuniversity.org/api.php';
const USER_AGENT = 'RustyBot/1.0 (https://www.rustybot.co.uk; contact: admin@rustybot.co.uk)';
const OUT_FILE = path.join(__dirname, '..', 'data', 'uniwiki-sites.json');
const SDE_DIR = path.join(__dirname, '..', '..', 'sde');

const SITE_CATEGORIES = [
  'Combat Anomalies',
  'Cosmic Anomalies',
  'Cosmic Signatures',
  'DED Complexes',
  'Unrated Complexes',
  'Expeditions',
  'Wormhole sites',
  'Incursions sites',
  'Incursions',
  'Faction Warfare',
  'Homefront Operations',
  'COSMOS sites',
];

const MISSION_CATEGORIES = [
  'Missions',
  'Epic arc missions',
  'Anomic missions',
  'COSMOS missions',
];

const args = process.argv.slice(2);
const hasFlag = f => args.includes(f);
const argValue = (name, fallback = '') => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const includeMissions = hasFlag('--missions') || hasFlag('--all');
const appendMode = hasFlag('--append');
const limit = Number(argValue('--limit', '0')) || 0;
const customCategories = argValue('--categories', '');
const categories = customCategories
  ? customCategories.split(',').map(s => s.trim()).filter(Boolean)
  : [...SITE_CATEGORIES, ...(includeMissions ? MISSION_CATEGORIES : [])];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params, attempt = 1) {
  const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt <= 4) {
      await sleep(1000 * attempt * 2);
      return api(params, attempt + 1);
    }
    throw new Error(`API ${res.status} for ${url}`);
  }
  if (!res.ok) throw new Error(`API ${res.status} for ${url}`);
  const json = await res.json();
  if (json.error) throw new Error(`API error: ${json.error.code} ${json.error.info}`);
  return json;
}

async function listCategory(category) {
  const titles = [];
  let cont = null;
  do {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmtype: 'page',
      cmlimit: '500',
    };
    if (cont) params.cmcontinue = cont;
    const data = await api(params);
    for (const m of data.query?.categorymembers || []) titles.push(m.title);
    cont = data.continue?.cmcontinue || null;
    if (cont) await sleep(250);
  } while (cont);
  return titles;
}

async function fetchPage(title) {
  const data = await api({
    action: 'parse',
    page: title,
    prop: 'wikitext|text',
    redirects: '1',
  });
  const p = data.parse;
  return {
    page: p.title,
    revid: p.revid,
    wikitext: p.wikitext || '',
    html: p.text || '',
  };
}

// ---------- wikitext helpers ----------

function extractTemplate(wikitext, names) {
  for (const name of names) {
    const needle = '{{' + name;
    let start = wikitext.indexOf(needle);
    while (start >= 0) {
      let depth = 0, i = start;
      for (; i < wikitext.length - 1; i++) {
        if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; continue; }
        if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
          depth--;
          if (depth === 0) break;
          i++;
        }
      }
      const body = wikitext.slice(start + 2, i);
      const parts = splitTopLevel(body, '|');
      const tplName = parts.shift().trim();
      if (names.includes(tplName)) {
        const params = {};
        for (const part of parts) {
          const eq = part.indexOf('=');
          if (eq < 0) continue;
          params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
        }
        return { template: tplName, params };
      }
      start = wikitext.indexOf(needle, start + 2);
    }
  }
  return null;
}

function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0, bracket = 0, cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{' && text[i + 1] === '{') { depth++; cur += '{{'; i++; continue; }
    if (c === '}' && text[i + 1] === '}') { depth--; cur += '}}'; i++; continue; }
    if (c === '[' && text[i + 1] === '[') { bracket++; cur += '[['; i++; continue; }
    if (c === ']' && text[i + 1] === ']') { bracket--; cur += ']]'; i++; continue; }
    if (c === sep && depth === 0 && bracket === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function stripWiki(text) {
  return String(text || '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[File:[^\]]*\]\]/gi, ' ')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanInfoboxValue(value) {
  const damageCodes = { em: 'EM', th: 'Thermal', kin: 'Kinetic', ex: 'Explosive', explosive: 'Explosive' };
  return stripWiki(String(value || '')
    .replace(/\{\{\s*Damagetype\s*\|([^{}]*)\}\}/gi, (_, args) =>
      args.split('|').map(a => damageCodes[a.trim().toLowerCase()] || a.trim()).join('/'))
    .replace(/^\s*\[\[?|\]\]?\s*$/g, '')
    .replace(/\s*\}\}\s*$/, ''));
}

function shipClassFromAlts(alts) {
  const generic = /^(Frigate|Destroyer|Cruiser|Battlecruiser|Battleship|Commander Frigate|Elite Frigate|Elite Cruiser|Sentry|Structure|Fighter|Hauler|Industrial|Dreadnought|Carrier|Titan|Capital|Subcapital)$/i;
  return alts.find(a => generic.test(a)) || '';
}

// ---------- HTML helpers ----------

function parseNpcTables($) {
  const tables = [];
  $('table.wikitable').each((_, tbl) => {
    const $tbl = $(tbl);
    const cls = $tbl.attr('class') || '';
    const headerText = $tbl.find('tr').first().text();
    const isNpc = /NPC/i.test(cls) || (/\bWD\b/.test(headerText) && /\bEWAR\b/.test(headerText));
    if (!isNpc) return;

    let heading = '';
    $tbl.prevAll('div,h2,h3,h4,h5,p').each((__, el) => {
      if (heading) return;
      const t = $(el).text().replace(/\s+/g, ' ').trim()
        .replace(/\s*\[edit[^\]]*\]\s*$/i, '')
        .replace(/\s*\[edit.*$/i, '');
      if (t && t.length <= 90 && !/^WD|^EWAR|^L$/.test(t)) heading = t;
    });

    const waves = [];
    const notes = [];
    $tbl.find('tr').each((_, tr) => {
      const $tr = $(tr);
      if ($tr.hasClass('head')) return;
      const texts = [];
      const alts = [];
      $tr.find('th,td').each((__, td) => {
        const t = $(td).text().replace(/\s+/g, ' ').trim();
        if (t) texts.push(t);
        $(td).find('img').each((___, img) => {
          const alt = ($(img).attr('alt') || '').trim();
          if (alt) alts.push(alt);
        });
      });
      if (!texts.length) return;
      if (texts.length > 1 && /^On warp in:?$/i.test(texts[0])) return;

      const line = texts.join(' ');
      const m = /^(\d+(?:\s*-\s*\d+)?)\s*x\s+(.+)$/i.exec(line);
      if (!m) {
        if (line.length > 8 && !/^WD|^EWAR|^L$/.test(line)) notes.push(line);
        return;
      }
      const count = m[1].replace(/\s+/g, '');
      let rest = m[2].trim();
      const shipClass = shipClassFromAlts(alts);
      if (shipClass && rest.toLowerCase().startsWith(shipClass.toLowerCase())) {
        rest = rest.slice(shipClass.length).trim();
      }
      const ships = rest.split(/\s*\/\s*|\s*,\s*|\s+and\s+/).map(s => s.trim()).filter(Boolean);
      const noteAlts = alts.filter(a => a.length > 5 && a !== shipClass && !/^(Frigate|Destroyer|Cruiser|Battlecruiser|Battleship|Commander Frigate|Elite Frigate|Elite Cruiser|Sentry|Structure|Fighter|Hauler|Industrial|Dreadnought|Carrier|Titan|Capital|Subcapital)$/i.test(a));
      waves.push({ count, class: shipClass, ships, notes: noteAlts });
    });

    if (waves.length || notes.length) tables.push({ heading, waves, notes });
  });
  return tables;
}

function parseDescription($) {
  const paras = [];
  $('.mw-parser-output p, #mw-content-text p, p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').replace(/\[\d+\]/g, '').trim();
    if (t.length > 40 && !/^\[/.test(t) && !/^(Jump to|Navigation|Contents)/i.test(t)) paras.push(t);
  });
  return [...new Set(paras)].slice(0, 3).join('\n\n');
}

function parseEscalation(wikitext) {
  const m = /==\s*Escalation\s*==([\s\S]*?)(?=\n==[^=]|$)/i.exec(wikitext);
  if (!m) return '';
  const text = stripWiki(m[1]).replace(/\s+/g, ' ').trim();
  return text.slice(0, 600);
}

function parseCategories(wikitext) {
  return [...wikitext.matchAll(/\[\[Category:([^\]|]+)/gi)].map(m => m[1].trim());
}

function toPockets(tables) {
  const pockets = [];
  for (const table of tables) {
    if (!table.waves.length) continue;
    const lines = table.waves.map(w => {
      const cls = w.class ? w.class + ' ' : '';
      const ships = w.ships.join('/');
      const note = w.notes.length ? ' — ' + w.notes.join('; ') : '';
      return `${w.count}x ${cls}(${ships})${note}`.replace(/\s+—/, ' —');
    });
    pockets.push({ heading: table.heading || 'Spawn', level: 'h3', lines });
  }
  return pockets;
}

// ---------- SDE ship map ----------

async function loadShipMap() {
  const map = new Map();
  const file = path.join(SDE_DIR, 'types.jsonl');
  if (!fs.existsSync(file)) return map;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let t;
    try { t = JSON.parse(line); } catch { continue; }
    const name = t.name?.en;
    if (!name) continue;
    const key = normalizeName(name);
    if (!map.has(key)) map.set(key, { id: t._key, name, published: t.published === true, groupID: t.groupID });
  }
  return map;
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function attachTypeIds(tables, shipMap) {
  for (const table of tables) {
    for (const wave of table.waves) {
      wave.ships = wave.ships.map(name => {
        const hit = shipMap.get(normalizeName(name));
        return { name, typeID: hit?.id ?? null };
      });
    }
  }
}

// ---------- description backfill ----------

async function backfillDescriptions() {
  if (!fs.existsSync(OUT_FILE)) throw new Error(`Missing ${OUT_FILE}; run the crawler first.`);
  const output = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const titles = Object.keys(output.sites);
  console.log(`Backfilling descriptions for ${titles.length} pages`);

  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    try {
      const data = await api({
        action: 'query',
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        redirects: '1',
        titles: chunk.join('|'),
      });
      for (const page of data.query?.pages || []) {
        if (!page.extract) continue;
        const record = output.sites[page.title];
        if (record) record.description = page.extract.trim();
      }
      process.stdout.write(`\r  ${Math.min(i + 20, titles.length)}/${titles.length}`);
    } catch (err) {
      process.stdout.write(`\n  description batch failed (${i}): ${err.message}\n`);
    }
    await sleep(300);
    if (i % 200 === 0) fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nDescriptions written to ${OUT_FILE}`);
}

// ---------- main ----------

async function main() {
  if (hasFlag('--descriptions')) {
    await backfillDescriptions();
    return;
  }
  console.log('UniWiki crawler');
  console.log('Categories: ' + categories.join(', '));

  const pageSet = new Set();
  const categoryCounts = {};
  for (const category of categories) {
    try {
      const titles = await listCategory(category);
      categoryCounts[category] = titles.length;
      titles.forEach(t => pageSet.add(t));
      console.log(`  ${category}: ${titles.length} pages`);
    } catch (err) {
      console.log(`  ${category}: FAILED (${err.message})`);
    }
    await sleep(250);
  }

  let pages = [...pageSet].sort();
  if (limit) pages = pages.slice(0, limit);
  console.log(`Unique pages: ${pages.length}`);

  const shipMap = await loadShipMap();
  console.log(`SDE type names: ${shipMap.size}`);

  const output = appendMode && fs.existsSync(OUT_FILE)
    ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
    : {
        _meta: {
          source: 'https://wiki.eveuniversity.org',
          api: API,
          license: 'CC BY-SA 4.0',
          generatedAt: new Date().toISOString(),
          categories: {},
          pages: 0,
        },
        sites: {},
      };
  output._meta.categories = { ...output._meta.categories, ...categoryCounts };
  output._meta.generatedAt = new Date().toISOString();
  if (!output.sites) output.sites = {};

  const save = () => {
    output._meta.pages = Object.keys(output.sites).length;
    fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  };

  let done = 0;
  for (const title of pages) {
    if (/^(User|Talk|Archive|Template|Category):/i.test(title)) continue;
    try {
      const page = await fetchPage(title);
      const $ = cheerio.load(page.html);
      const infobox = extractTemplate(page.wikitext, [
        'CMBSiteInfo', 'MissionInfo', 'ComplexInfo', 'SiteInfo', 'IncursionSiteInfo',
      ]);
      const tables = parseNpcTables($);
      const pockets = toPockets(tables);
      attachTypeIds(tables, shipMap);
      const info = {};
      if (infobox) {
        for (const [key, value] of Object.entries(infobox.params)) info[key] = cleanInfoboxValue(value);
      }
      const record = {
        page: page.page,
        title: page.page,
        url: 'https://wiki.eveuniversity.org/' + encodeURIComponent(page.page.replace(/ /g, '_')),
        revid: page.revid,
        infobox: infobox ? { template: infobox.template, ...info } : {},
        description: parseDescription($),
        pockets,
        tables,
        hasData: Boolean(infobox) || tables.length > 0 || pockets.length > 0,
        escalation: parseEscalation(page.wikitext),
        categories: parseCategories(page.wikitext),
        flags: /Past content/i.test(page.wikitext) ? ['past-content'] : [],
      };
      output.sites[page.page] = record;
      done++;
      process.stdout.write(`\r  ${done}/${pages.length} ${page.page.slice(0, 40).padEnd(42)}`);
    } catch (err) {
      process.stdout.write(`\n  FAILED ${title}: ${err.message}\n`);
    }
    if (done % 20 === 0) save();
    await sleep(600);
  }

  save();
  console.log(`\nWrote ${Object.keys(output.sites).length} pages to ${OUT_FILE}`);
  const withSpawns = Object.values(output.sites).filter(s => s.pockets.length).length;
  console.log(`Pages with parsed spawn tables: ${withSpawns}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
