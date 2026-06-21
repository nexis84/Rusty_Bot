const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://eve-survival.org/';
const LIST_URL = BASE + '?wakka=MissionReports';

async function fetchMissions() {
  const html = await fetch(LIST_URL).then(r => r.text());
  const $ = cheerio.load(html);

  const missions = [];
  const seen = new Set();

  $('table.data tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;

    const nameCell = cells.eq(0);
    const factionCell = cells.eq(1);
    if (nameCell.find('a').length === 0 && nameCell.text().trim() === '') return;
    if (nameCell.find('th').length > 0) return;

    let missionName = nameCell.text().trim();

    // Normalize mission name
    missionName = missionName.replace(/\s*\(\s*\)\s*$/, '').trim(); // Remove empty ()
    // Convert "X, The" to "The X" and "X, the" to "The X"
    missionName = missionName.replace(/^(.+),\s*(t|T)he$/, function(match, rest, t) { return 'The ' + rest; });

    let faction = factionCell.text().trim();

    // Normalize faction name
    if (faction === 'Blitz information' || faction === 'Blitz Information') return;
    const factionMap = {
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
    faction = faction.replace(/\?/g, '').replace(/^Angel Catel/, 'Angel Cartel').trim();
    faction = (factionMap[faction] || faction);

    if (!missionName) return;

    const levels = {};
    for (let i = 2; i < cells.length; i++) {
      const levelIdx = i - 1;
      const link = cells.eq(i).find('a').first();
      if (link.length) {
        const href = link.attr('href') || '';
        const pageName = href.includes('/edit') ? '' : new URL(href, BASE).searchParams.get('wakka') || '';
        if (pageName) {
          levels[levelIdx] = pageName;
        }
      }
    }

    if (faction === 'Blitz information' || faction === 'Blitz Information') return;

    const key = missionName + '|' + faction;
    if (seen.has(key)) return;
    seen.add(key);

    missions.push({
      name: missionName,
      faction: faction,
      levels: levels
    });
  });

  const outPath = path.join(__dirname, '..', 'data', 'missions-index.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(missions, null, 2));
  console.log(`Indexed ${missions.length} mission entries`);
}

fetchMissions().catch(console.error);
