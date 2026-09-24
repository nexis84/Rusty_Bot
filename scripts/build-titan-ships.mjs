#!/usr/bin/env node
// Build you-sunk-my-titan/ships.json from SDE — mono-faction 10x10 fleets 20HP
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDE_DIR = path.resolve(__dirname, '../sde');
const OUT = path.resolve(__dirname, '../you-sunk-my-titan/ships.json');

// Locked hull mapping — one hull per class per race, classes verified against the SDE
const FLEETS = {
  Amarr:    { Titan:'Avatar',      Dreadnought:'Revelation', Carrier:'Archon',    Battleship:'Apocalypse', Cruiser:'Maller',   Frigate:'Executioner' },
  Caldari:  { Titan:'Leviathan',   Dreadnought:'Phoenix',    Carrier:'Chimera',   Battleship:'Raven',      Cruiser:'Caracal',  Frigate:'Kestrel' },
  Gallente: { Titan:'Erebus',      Dreadnought:'Moros',      Carrier:'Thanatos',  Battleship:'Megathron',  Cruiser:'Vexor',    Frigate:'Tristan' },
  Minmatar: { Titan:'Ragnarok',    Dreadnought:'Naglfar',    Carrier:'Nidhoggur', Battleship:'Typhoon',    Cruiser:'Rupture',  Frigate:'Rifter' },
};
const SIZES = { Titan:6, Dreadnought:6, Carrier:5, Battleship:4, Cruiser:3, Frigate:2 };

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
    const svgFile = name.toLowerCase().replace(/\s+/g,'_') + '.svg';
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
