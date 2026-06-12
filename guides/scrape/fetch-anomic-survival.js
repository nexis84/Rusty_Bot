const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://eve-survival.org';

const PAGES = [
  { wakka: 'AnomicAgent4an', name: 'Anomic Agent (Angel)', type: 'Agent', faction: 'Angel' },
  { wakka: 'AnomicAgent4BR', name: 'Anomic Agent (Blood Raider)', type: 'Agent', faction: 'Blood Raiders' },
  { wakka: 'AnomicAgent4gu', name: 'Anomic Agent (Guristas)', type: 'Agent', faction: 'Guristas' },
  { wakka: 'AnomicAgent4sa', name: 'Anomic Agent (Sansha)', type: 'Agent', faction: "Sansha's Nation" },
  { wakka: 'AnomicAgent4se', name: 'Anomic Agent (Serpentis)', type: 'Agent', faction: 'Serpentis' },
  { wakka: 'AnomicBase4an', name: 'Anomic Base (Angel)', type: 'Base', faction: 'Angel' },
  { wakka: 'AnomicBase4bl', name: 'Anomic Base (Blood Raider)', type: 'Base', faction: 'Blood Raiders' },
  { wakka: 'AnomicBase4ca', name: 'Anomic Base (Caldari)', type: 'Base', faction: 'Caldari' },
  { wakka: 'AnomicBase4se', name: 'Anomic Base (Serpentis)', type: 'Base', faction: 'Serpentis' },
  { wakka: 'AnomicTeam4am', name: 'Anomic Team (Amarr)', type: 'Team', faction: 'Amarr' },
  { wakka: 'AnomicTeam4ca', name: 'Anomic Team (Caldari)', type: 'Team', faction: 'Caldari' },
  { wakka: 'AnomicTeam4ga', name: 'Anomic Team (Gallente)', type: 'Team', faction: 'Gallente' },
  { wakka: 'AnomicTeam4mi', name: 'Anomic Team (Minmatar)', type: 'Team', faction: 'Minmatar' },
];

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function extractInfoFields(text) {
  var info = {};
  var patterns = [
    [ /^Faction:\s*(.+)$/im, 'Faction' ],
    [ /^Mission type:\s*(.+)$/im, 'Mission type' ],
    [ /^Space type:\s*(.+)$/im, 'Space type' ],
    [ /^Damage dealt:\s*(.+)$/im, 'Damage dealt' ],
    [ /^Web\/scramble:\s*(.+)$/im, 'Web/Scramble' ],
    [ /^Extras:\s*(.+)$/im, 'Extras' ],
    [ /^Recommended damage dealing:\s*(.+)$/im, 'Recommended damage dealing' ],
    [ /^Recommended ship types:\s*(.+)$/im, 'Recommended ship classes' ],
    [ /^Video:\s*(.+)$/im, 'Video' ],
    [ /^ECM:\s*(.+)$/im, 'ECM' ],
    [ /^Bounty:\s*(.+)$/im, 'Bounty' ],
    [ /^LP:\s*(.+)$/im, 'LP' ],
  ];
  for (var p of patterns) {
    var m = text.match(p[0]);
    if (m) info[p[1]] = m[1].trim();
  }
  return info;
}

function extractPockets($, contentEl) {
  var pockets = [];
  var currentHeading = null;
  var currentLevel = null;
  var currentLines = [];
  var headings = {};

  // Collect all headings and content
  contentEl.contents().each(function() {
    var el = this;
    var tag = (el.tagName || '').toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5'].includes(tag)) {
      // Save previous section
      if (currentHeading && currentLines.length > 0) {
        pockets.push({
          heading: currentHeading,
          level: currentLevel,
          lines: currentLines
        });
      }
      currentHeading = $(el).text().trim().replace(/^\[edit\]\s*/, '');
      currentLevel = tag;
      currentLines = [];
    } else if (tag === 'br') {
      // ignore line breaks
    } else if (el.type === 'text') {
      var text = $(el).text().trim().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
      // Filter out empty text, edit links, and horizontal rules
      if (text && text !== '----------------------------------------' && text !== '[' && text !== 'edit]') {
        currentLines.push(text);
      }
    } else if (tag === 'ul') {
      $(el).find('li').each(function() {
        var text = $(this).text().trim().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
        if (text) currentLines.push(text);
      });
    } else {
      var text = $(el).text().trim().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
      if (text && text !== '----------------------------------------') {
        currentLines.push(text);
      }
    }
  });

  // Last section
  if (currentHeading && currentLines.length > 0) {
    pockets.push({
      heading: currentHeading,
      level: currentLevel,
      lines: currentLines
    });
  }

  return pockets;
}

async function fetchOne(pageInfo) {
  var url = BASE + '/?wakka=' + pageInfo.wakka;
  var html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  var $ = cheerio.load(html);
  var contentEl = $('#content');

  var text = contentEl.text().trim();
  if (text.length === 0) {
    console.log('  EMPTY: ' + pageInfo.wakka + ' has no content');
    return null;
  }

  var info = extractInfoFields(text);
  var pockets = extractPockets($, contentEl);

  // Extract video links
  var videoLinks = [];
  contentEl.find('a.ext').each(function() {
    var href = $(this).attr('href') || '';
    if (href.includes('youtube.com') || href.includes('youtu.be') || href.includes('twitch.tv')) {
      videoLinks.push({ text: $(this).text().trim() || href, url: href });
    }
  });

  return {
    wakka: pageInfo.wakka,
    name: pageInfo.name,
    type: pageInfo.type,
    faction: pageInfo.faction,
    info: info,
    pockets: pockets,
    videoLinks: videoLinks
  };
}

async function main() {
  var outPath = path.join(__dirname, '..', 'data', 'anomic-missions-survival.json');
  var result = {};
  var done = 0;
  for (var i = 0; i < PAGES.length; i++) {
    try {
      await sleep(1500);
      var d = await fetchOne(PAGES[i]);
      if (d) {
        result[PAGES[i].wakka] = d;
        done++;
        console.log(done + '/13 ' + PAGES[i].name + ' (' + PAGES[i].wakka + ')');
      }
    } catch (err) {
      console.log('Failed: ' + PAGES[i].name + ' - ' + err.message);
    }
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Saved ' + Object.keys(result).length + ' EVE-Survival anomic missions');
}

main().catch(console.error);
