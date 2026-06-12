const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';

const PAGES = [
  { name: 'Anomic Agent (Angel)', type: 'Agent', faction: 'Angel', page: 'Anomic_Agent_(Angel)' },
  { name: 'Anomic Agent (Blood Raider)', type: 'Agent', faction: 'Blood Raiders', page: 'Anomic_Agent_(Blood_Raider)' },
  { name: 'Anomic Agent (Guristas)', type: 'Agent', faction: 'Guristas', page: 'Anomic_Agent_(Guristas)' },
  { name: 'Anomic Agent (Sansha)', type: 'Agent', faction: "Sansha's Nation", page: 'Anomic_Agent_(Sansha%27s_Nation)' },
  { name: 'Anomic Agent (Serpentis)', type: 'Agent', faction: 'Serpentis', page: 'Anomic_Agent_(Serpentis)' },
  { name: 'Anomic Base (Angel)', type: 'Base', faction: 'Angel', page: 'Anomic_Base_(Angel)' },
  { name: 'Anomic Base (Blood Raider)', type: 'Base', faction: 'Blood Raiders', page: 'Anomic_Base_(Blood_Raider)' },
  { name: 'Anomic Base (Caldari)', type: 'Base', faction: 'Caldari', page: 'Anomic_Base_(Caldari)' },
  { name: 'Anomic Base (Serpentis)', type: 'Base', faction: 'Serpentis', page: 'Anomic_Base_(Serpentis)' },
  { name: 'Anomic Team (Amarr)', type: 'Team', faction: 'Amarr', page: 'Anomic_Team_(Amarr)' },
  { name: 'Anomic Team (Caldari)', type: 'Team', faction: 'Caldari', page: 'Anomic_Team_(Caldari)' },
  { name: 'Anomic Team (Gallente)', type: 'Team', faction: 'Gallente', page: 'Anomic_Team_(Gallente)' },
  { name: 'Anomic Team (Minmatar)', type: 'Team', faction: 'Minmatar', page: 'Anomic_Team_(Minmatar)' },
];

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

async function fetchOne(info) {
  const url = UNIWIKI + '/' + encodeURIComponent(decodeURIComponent(info.page));
  const html = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  const $ = cheerio.load(html);

  const npcTables = [];
  $('#mw-content-text table.wikitable').each(function(_, tbl) {
    var $tbl = $(tbl);
    var cls = $tbl.attr('class') || '';
    var rows = [];
    $tbl.find('tr').each(function(_, tr) {
      var cells = [];
      $(tr).find('th, td').each(function(_, td) {
        var text = $(td).text().trim().replace(/\s+/g, ' ');
        if (text) cells.push(text);
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length > 0) {
      var firstHeader = rows[0][0] || '';
      if (rows.length === 1 && firstHeader.endsWith(':') && rows[0].length === 1) {
        npcTables.push({ type: 'header', text: firstHeader.replace(':', '') });
        return;
      }
      if (rows.length === 2 && rows[0].length === 1 && rows[0][0].endsWith(':') && rows[1].length <= 2) {
        npcTables.push({ type: 'desc', text: rows[1].join(' ') });
        return;
      }
      npcTables.push({ type: 'table', rows: rows });
    }
  });

  // Extract section content
  var sections = {};
  $('#mw-content-text h2, #mw-content-text h3').each(function(_, h) {
    var text = $(h).text().trim();
    var chunks = [];
    var nxt = $(h).next();
    while (nxt.length && !['h2', 'h3'].includes((nxt.prop('tagName') || '').toLowerCase())) {
      var tag = (nxt.prop('tagName') || '').toLowerCase();
      if (tag === 'table') { nxt = nxt.next(); continue; }
      var t = nxt.text().trim();
      if (t && t.length > 2) chunks.push(t);
      nxt = nxt.next();
    }
    if (chunks.length) sections[text] = chunks.join('\n');
  });

  return {
    page: info.page,
    name: info.name,
    type: info.type,
    faction: info.faction,
    npcTables: npcTables,
    sections: sections
  };
}

async function main() {
  var outPath = path.join(__dirname, '..', 'data', 'anomic-missions.json');
  var result = {};
  var done = 0;
  for (var i = 0; i < PAGES.length; i++) {
    try {
      await sleep(1500);
      var d = await fetchOne(PAGES[i]);
      result[PAGES[i].page] = d;
      done++;
      console.log(done + '/' + PAGES.length + ' ' + PAGES[i].name);
    } catch (err) {
      console.log('Failed: ' + PAGES[i].name + ' - ' + err.message);
    }
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Saved ' + Object.keys(result).length + ' anomic missions');
}

main().catch(console.error);
