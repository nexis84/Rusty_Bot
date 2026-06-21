const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UNIWIKI = 'https://wiki.eveuniversity.org';

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

async function fetchOne(page) {
  const url = UNIWIKI + '/' + encodeURIComponent(decodeURIComponent(page));
  const res = await fetch(url, { headers: { 'User-Agent': 'RustyBot/1.0' }, redirect: 'manual' });
  const status = res.status;
  let html;
  if (status === 302 || status === 301) {
    // Follow redirect
    html = await fetch(res.headers.get('location'), { headers: { 'User-Agent': 'RustyBot/1.0' } }).then(function(r) { return r.text(); });
  } else {
    html = await res.text();
  }
  const $ = cheerio.load(html);

  const info = {};
  $('.infobox tr').each(function(_, row) {
    const th = $(row).find('th').first().text().trim();
    const td = $(row).find('td').first().text().trim();
    if (th && td && th !== '' && td !== '' && th.length < 30) info[th] = td;
  });

  const descs = [];
  $('#mw-content-text > .mw-parser-output > p, #mw-content-text > .mw-parser-output > ul li').each(function(_, el) {
    const t = $(el).text().trim();
    if (t && t.length > 30 && !t.startsWith('[') && !t.startsWith('{{')) descs.push(t);
  });

  const sections = {};
  $('#mw-content-text h2, #mw-content-text h3').each(function(_, h) {
    const text = $(h).text().trim();
    const chunks = [];
    var nxt = $(h).next();
    while (nxt.length && !['h2', 'h3'].includes((nxt.prop('tagName') || '').toLowerCase())) {
      const tag = (nxt.prop('tagName') || '').toLowerCase();
      if (tag === 'table') {
        nxt = nxt.next();
        continue;
      }
      const t = nxt.text().trim();
      if (t && t.length > 2) chunks.push(t);
      nxt = nxt.next();
    }
    if (chunks.length) sections[text] = chunks.join('\n');
  });

  const npcTables = [];
  $('#mw-content-text table.wikitable').each(function(_, tbl) {
    const $tbl = $(tbl);
    const cls = $tbl.attr('class') || '';
    if (cls.includes('collapsible') && ($tbl.find('th').text().includes('DED Complexes') || $tbl.find('tr').length <= 1)) {
      return;
    }
    if ($tbl.find('th').first().text().trim() === 'Item Name') return;

    const rows = [];
    $tbl.find('tr').each(function(_, tr) {
      const cells = [];
      $(tr).find('th, td').each(function(_, td) {
        let text = $(td).text().trim().replace(/\s+/g, ' ');
        if (text) cells.push(text);
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length > 0) {
      const firstHeader = rows[0][0] || '';
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

  console.log('  Fetched: ' + page + ' -> info=' + Object.keys(info).length + ', tables=' + npcTables.length);
  return { page: page, info: info, description: descs.join('\n\n'), sections: sections, npcTables: npcTables };
}

async function main() {
  const pages = [
    'Sansha%27s_Command_Relay_Outpost',
    'Angel%27s_Red_Light_District',
    'Sansha%27s_Nation_Neural_Paralytic_Facility',
    'Serpentis_Capital_Staging',
    'Pith%27s_Penal_Complex'
  ];

  const uniPath = path.join(__dirname, '..', 'data', 'anomalies-uniwiki.json');
  let uniData = {};
  if (fs.existsSync(uniPath)) {
    uniData = JSON.parse(fs.readFileSync(uniPath, 'utf8'));
  }

  for (const page of pages) {
    try {
      await sleep(1500);
      const d = await fetchOne(page);
      uniData[page] = d;
    } catch (err) {
      console.log('Failed: ' + page + ' - ' + err.message);
    }
  }

  console.log('Saving...');
  fs.writeFileSync(uniPath, JSON.stringify(uniData, null, 2));
  console.log('Done');
}

main().catch(console.error);
