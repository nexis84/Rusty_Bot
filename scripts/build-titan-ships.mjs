#!/usr/bin/env node
// Build you-sunk-my-titan/ships.json from SDE — mono-faction 10x10 fleets 20HP
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDE_DIR = path.resolve(__dirname, '../sde');
const OUT = path.resolve(__dirname, '../you sunk my titan/ships.json');

// Locked hull mapping 2026-09-02 — Triglavian added 2026-09-02 (Zirnitra proxy for Titan/Carrier where no native hull)
const FLEETS = {
  Amarr:    { Titan:'Avatar',    Carrier:'Archon',   Battleship:'Abaddon',  Cruiser:'Maller',   Frigate:'Executioner' },
  Caldari:  { Titan:'Leviathan', Carrier:'Chimera',  Battleship:'Rokh',      Cruiser:'Caracal',  Frigate:'Merlin' },
  Gallente: { Titan:'Erebus',    Carrier:'Thanatos', Battleship:'Megathron', Cruiser:'Vexor',    Frigate:'Incursus' },
  Minmatar: { Titan:'Ragnarok',  Carrier:'Nidhoggur',Battleship:'Maelstrom', Cruiser:'Rupture',  Frigate:'Rifter' },
  Triglavian:{ Titan:'Zirnitra', Carrier:'Leshak',   Battleship:'Drekavac', Cruiser:'Vedmak',    Frigate:'Damavik' },
};
const SIZES = { Titan:6, Carrier:5, Battleship:4, Cruiser:3, Frigate:2 };

function en(o){ if(!o) return ''; if(typeof o==='string') return o.trim(); return (o.en||'').trim(); }

function loadJsonl(file){
  const p = path.join(SDE_DIR, file);
  if(!fs.existsSync(p)) throw new Error('Missing '+p);
  return fs.readFileSync(p,'utf8').split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l));
}

const types = loadJsonl('types.jsonl');
const byName = new Map();
for(const t of types){
  if(t.published!==true) continue;
  const n = en(t.name);
  if(!n) continue;
  // keep first published
  if(!byName.has(n)) byName.set(n, t);
}

const out = { meta:{ build: null, generatedAt: new Date().toISOString(), grid:10, totalHP:20 }, factions:{} };

try{
  const sdeMeta = JSON.parse(fs.readFileSync(path.join(SDE_DIR,'_sde.jsonl'),'utf8'));
  out.meta.build = sdeMeta.buildNumber;
}catch{}

for(const [faction, roster] of Object.entries(FLEETS)){
  const ships=[];
  for(const [cls, name] of Object.entries(roster)){
    const t = byName.get(name);
    if(!t) throw new Error(`Hull not found in SDE: ${name}`);
    const svgName = name.toLowerCase().replace(/\s+/g,'_').replace('maelstrom','maelstrom');
    // maelstorm.svg is actually maelstorm in source (CCP typo), normalize
    const svgFile = svgName === 'maelstrom' ? 'maelstrom.svg' : svgName + '.svg';
    ships.push({
      class: cls,
      name,
      typeID: t._key,
      size: SIZES[cls],
      groupID: t.groupID,
      factionID: t.factionID,
      render: `https://images.evetech.net/types/${t._key}/render?size=256`,
      icon: `https://images.evetech.net/types/${t._key}/icon?size=64`,
      svg: `assets/svg/${svgFile}`,
    });
  }
  out.factions[faction]=ships;
}

fs.mkdirSync(path.dirname(OUT), {recursive:true});
fs.writeFileSync(OUT, JSON.stringify(out,null,2),'utf8');
console.log(`Wrote ${OUT} — factions: ${Object.keys(out.factions).join(', ')}`);
for(const [f,ships] of Object.entries(out.factions)){
  console.log(`  ${f}: ${ships.map(s=>`${s.class}=${s.name}(${s.typeID})x${s.size}`).join(' | ')}`);
}
