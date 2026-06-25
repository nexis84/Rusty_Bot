const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://eve-survival.org/';
const ARCS_LIST_URL = BASE + '?wakka=MissionReportsEpicArc';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractInfoFields(text) {
  const fields = {};
  const lines = text.split('\n');
  const fieldPattern = /^\s*(Faction|Mission (?:and Space )?type|Space type|Damage dealt|Web\/?\s*Scram(?:ble)?|Recommended damage dealing|Recommended ships?(?: classes?)?|Recommended ship classes|Video|Blitz|Notes|Distance|Completion|Objective|Tip|Extras|Ojective)\s*:\s*(.+)$/i;
  for (const line of lines) {
    const match = line.match(fieldPattern);
    if (match) {
      let key = match[1].trim();
      let val = match[2].trim();
      // Normalize key
      if (/^Web\s*\/?\s*Scram/i.test(key)) key = 'Web/Scramble';
      if (/^Recommended\s+ships?/i.test(key)) key = 'Recommended ship classes';
      if (/^Mission\s+and\s+Space\s+type/i.test(key)) {
        fields['Mission type'] = val;
        continue;
      }
      if (/^Ojective$/i.test(key)) key = 'Objective';
      fields[key] = val;
    }
  }
  return fields;
}

function extractPockets($, content) {
  // Build a flat list of all elements and text nodes in document order,
  // stripping out non-semantic container tags like div/span.
  // This finds h4/h5 headings even when deeply nested.
  const flatNodes = [];

  function flatten(nodes) {
    nodes.each((_, node) => {
      if (node.type === 'tag') {
        const tag = node.name;
        if (['h3', 'h4', 'h5'].includes(tag)) {
          flatNodes.push({ type: 'heading', tag: tag, text: $(node).text().trim() });
          // Don't recurse into headings — their text content is captured via .text() above
          return;
        } else if (!['div', 'span', 'br', 'hr'].includes(tag)) {
          // Preserve raw text from semantic tags (like <p>, <ul>, <li>)
          const text = $(node).text().trim();
          if (text) {
            flatNodes.push({ type: 'line', tag: tag, text: text });
          }
        }
        // Recurse into containers that may contain headings
        flatten($(node).contents());
      } else if (node.type === 'text') {
        const text = $(node).text().trim();
        if (text) {
          flatNodes.push({ type: 'text', text: text });
        }
      }
    });
  }

  flatten(content.contents());

  // Build pockets from the flat node list
  const pockets = [];
  let currentPocket = null;

  for (const node of flatNodes) {
    if (node.type === 'heading' && ['h4', 'h5'].includes(node.tag)) {
      if (currentPocket) pockets.push(currentPocket);
      currentPocket = {
        heading: node.text,
        level: node.tag,
        lines: []
      };
    } else if (currentPocket) {
      // Accumulate text lines
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (text && !text.includes('javascript:') && text !== '>') {
        currentPocket.lines.push(text);
      }
    }
  }

  if (currentPocket) pockets.push(currentPocket);

  return pockets;
}

function cleanMissionLine(line) {
  const t = (line || '').trim();
  if (/^Category\w/i.test(t)) return null;
  if (/^Last edited by/i.test(t)) return null;
  return t.replace(/\uFFFD/g, "'").replace(/�/g, "'");
}

// Patterns that indicate a non-mission h3 (pocket structural heading)
const POCKET_H3_PATTERNS = /^(Single Pocket|Pocket\s+\d+|Group\s+\d+|Wave\s+\d+|Spawn\s+\d+|Initial\s+(?:Group|Spawn|Wave)|Reinforcement|Reinforcements|Trigger|End Of Arc|Acceleration Gate\w*|About The|What To Bring|Tips?|Blitz|Loot|Bounty)/i;

// Split content into h3-delimited sections, each representing one mission
function splitByH3($, content) {
  const sections = [];
  let currentSection = null;

  content.contents().each((_, node) => {
    if (node.type === 'tag' && node.name === 'h3') {
      const heading = $(node).text().trim();

      // If this is a pocket/structural h3, attach its content to the previous mission
      if (POCKET_H3_PATTERNS.test(heading) && currentSection) {
        // Add this h3 as a node within the current section
        currentSection.nodes.push(node);
        return;
      }

      if (currentSection) sections.push(currentSection);
      currentSection = { heading: heading, nodes: [] };
    } else if (currentSection) {
      currentSection.nodes.push(node);
    }
  });
  if (currentSection) sections.push(currentSection);
  return sections;
}

// Parse a single chapter page into individual missions
function parseChapterPage(pageName, html) {
  const $ = cheerio.load(html);
  const content = $('#content');
  const title = content.find('h1').first().text().trim();

  const sections = splitByH3($, content);

  const missions = [];
  for (const section of sections) {
    if (!section.heading) continue;

    // Build a mini-content from the section's nodes
    const sectionHtml = section.nodes.map(n => $.html(n)).join('');
    const $section = cheerio.load('<div>' + sectionHtml + '</div>');
    const sectionContent = $section('body > div');

    const infoText = sectionContent.text();
    const infoFields = extractInfoFields(infoText);
    const pockets = extractPockets($section, sectionContent);

    missions.push({
      heading: section.heading,
      pageName: pageName,
      sections: [],
      infoFields: infoFields || {},
      pockets: pockets || []
    });
  }

  // If no h3 found, treat whole page as one mission
  if (missions.length === 0) {
    const infoText = content.text();
    const infoFields = extractInfoFields(infoText);
    const pockets = extractPockets($, content);
    missions.push({
      heading: title,
      pageName: pageName,
      sections: [],
      infoFields: infoFields,
      pockets: pockets
    });
  }

  return { title, missions };
}

// Fetch arc overview page to get metadata
async function fetchArcOverview(pageName) {
  try {
    await sleep(1000);
    const html = await fetch(BASE + '?wakka=' + encodeURIComponent(pageName)).then(r => r.text());
    const $ = cheerio.load(html);
    const content = $('#content');
    const text = content.text();

    let agentName = '';
    let agentCorp = '';
    let agentLocation = '';
    let standingsRequired = '';
    let additionalRequirements = '';
    let description = '';

    // Extract agent info
    const agentMatch = text.match(/Agent\s*Name:\s*(.+?)(?:\n|$)/i);
    if (agentMatch) agentName = agentMatch[1].trim();

    const corpMatch = text.match(/Agent\s*Corporation:\s*(.+?)(?:\n|$)/i);
    if (corpMatch) agentCorp = corpMatch[1].trim();

    const locMatch = text.match(/Agent\s*Location:\s*(.+?)(?:\n|$)/i);
    if (locMatch) agentLocation = locMatch[1].trim();

    const standMatch = text.match(/Standings\s*Required:\s*(.+?)(?:\n|$)/i);
    if (standMatch) standingsRequired = standMatch[1].trim();

    const reqMatch = text.match(/Additional\s*Requirements:\s*(.+?)(?:\n|$)/i);
    if (reqMatch) additionalRequirements = reqMatch[1].trim();

    // Get first meaningful paragraph as description
    const firstP = content.find('p').first().text().trim();
    if (firstP) description = firstP;

    return {
      agentName,
      agentCorp,
      agentLocation,
      standingsRequired,
      additionalRequirements,
      description
    };
  } catch (err) {
    console.error('Failed to fetch arc overview ' + pageName + ': ' + err.message);
    return {};
  }
}

async function fetchEpicArcs() {
  console.log('Fetching epic arc list...');
  const html = await fetch(ARCS_LIST_URL).then(r => r.text());
  const $ = cheerio.load(html);

  // Parse the arc list page
  // Strategy: Find all h4 elements (faction headers),
  // then collect links between them
  const arcs = [];
  let currentFaction = '';
  let currentLevel = 0;

  $('#content h4').each((_, h4) => {
    const headerText = $(h4).text().trim();
    const levelMatch = headerText.match(/\(Level\s*(\d+)\)/i);
    const level = levelMatch ? parseInt(levelMatch[1]) : 0;
    const faction = headerText.replace(/\(Level\s*\d+\)/i, '').trim();

    // Collect links after this h4 until the next h4
    let aboutPage = '';
    const chapters = [];
    let next = $(h4).next();
    while (next.length && !next.is('h4')) {
      if (next.is('a')) {
        const href = next.attr('href') || '';
        const wakka = href.split('wakka=')[1]?.split('&')[0] || '';
        const text = next.text().trim();
        if (wakka && !wakka.includes('#')) {
          if (text.match(/About\s+the\s+Arc/i)) {
            aboutPage = wakka;
          } else if (text.match(/Chapter\s*\d+/i)) {
            const match = text.match(/Chapter\s*(\d+)\s*:\s*(.+)/i);
            if (match) {
              chapters.push({
                pageName: wakka,
                chapterNumber: parseInt(match[1]),
                name: match[2].trim()
              });
            }
          }
        }
      }
      next = next.next();
    }

    if (aboutPage || chapters.length) {
      arcs.push({
        aboutPage: aboutPage,
        faction: faction,
        level: level,
        chapters: chapters
      });
    }
  });

  console.log(`Found ${arcs.length} epic arcs`);

  // Fetch overview and chapter details for each arc
  const arcIndex = [];
  const arcDetails = {};

  // Arc name/faction mapping
  const arcNameMap = {
    'Sisters of Eve': { id: 'blood-stained-stars', name: 'The Blood-Stained Stars' },
    'Angel Cartel': { id: 'angel-sound', name: 'Angel Sound' },
    'Guristas': { id: 'smash-and-grab', name: 'Smash and Grab' },
    'Amarr': { id: 'right-to-rule', name: 'Right to Rule' },
    'Caldari': { id: 'penumbra', name: 'Penumbra' },
    'Gallente': { id: 'syndication', name: 'Syndication' },
    'Minmatar': { id: 'wildfire', name: 'Wildfire' },
  };

  for (let ai = 0; ai < arcs.length; ai++) {
    const arc = arcs[ai];
    const mapKey = arc.faction;
    const arcInfo = arcNameMap[mapKey] || { id: 'arc-' + ai, name: arc.faction + ' Epic Arc' };
    const arcId = arcInfo.id;
    const arcName = arcInfo.name;

    console.log(`\nProcessing arc: ${arcName} (${arc.faction}, L${arc.level})`);

    // Fetch arc overview
    const overview = arc.aboutPage ? await fetchArcOverview(arc.aboutPage) : {};

    // Build arc index entry
    const arcEntry = {
      id: arcName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
      name: arcName,
      faction: arc.faction,
      level: arc.level,
      startingAgent: overview.agentName || '',
      startingSystem: (overview.agentLocation || '').split(/\s+/).slice(0, 2).join(' '),
      region: '',
      standingsRequired: overview.standingsRequired || '',
      additionalRequirements: overview.additionalRequirements || '',
      description: overview.description || '',
      chapters: []
    };

    // Fetch each chapter page and extract missions
    for (const ch of arc.chapters) {
      console.log(`  Chapter ${ch.chapterNumber}: ${ch.name} (${ch.pageName})`);
      await sleep(1000);

      try {
        const html = await fetch(BASE + '?wakka=' + encodeURIComponent(ch.pageName)).then(r => r.text());
        const parsed = parseChapterPage(ch.pageName, html);

        const chapterMissions = [];
        const nonMissionPatterns = /^(Single Pocket|Pocket\s+\d+|End Of Arc|Acceleration Gate\w*|About The|What To Bring)/i;
    for (const mission of parsed.missions) {
          if (!mission.heading) continue;
          if (nonMissionPatterns.test(mission.heading)) continue;

          const missionKey = ch.pageName + '_' + mission.heading.replace(/[^a-zA-Z0-9]+/g, '');

          // Build mission detail entry
          const missionDetail = {
            pageName: missionKey,
            title: mission.heading,
            arc: arcEntry.id,
            chapter: ch.name,
            chapterOrder: ch.chapterNumber,
            missionOrder: chapterMissions.length + 1,
            info: mission.infoFields,
            pockets: mission.pockets,
            tips: '',
            loot: '',
            videoLinks: []
          };

          arcDetails[missionKey] = missionDetail;
          chapterMissions.push(missionKey);
          console.log(`    Mission: ${mission.heading}`);
        }

        arcEntry.chapters.push({
          name: ch.name,
          order: ch.chapterNumber,
          pageName: ch.pageName,
          missions: chapterMissions
        });

      } catch (err) {
        console.error(`  Failed to fetch chapter ${ch.pageName}: ${err.message}`);
        arcEntry.chapters.push({
          name: ch.name,
          order: ch.chapterNumber,
          pageName: ch.pageName,
          missions: []
        });
      }
    }

    arcIndex.push(arcEntry);
  }

  return { arcIndex, arcDetails };
}

async function main() {
  console.log('Starting epic arc data fetch...\n');
  const { arcIndex, arcDetails } = await fetchEpicArcs();

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const indexOut = path.join(dataDir, 'epic-arcs-index.json');
  fs.writeFileSync(indexOut, JSON.stringify(arcIndex, null, 2));
  console.log(`\nSaved ${arcIndex.length} arcs to epic-arcs-index.json`);

  const detailsOut = path.join(dataDir, 'epic-arcs.json');
  fs.writeFileSync(detailsOut, JSON.stringify(arcDetails, null, 2));
  console.log(`Saved ${Object.keys(arcDetails).length} mission details to epic-arcs.json`);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
