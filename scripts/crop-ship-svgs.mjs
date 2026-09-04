#!/usr/bin/env node
// Crop eve-ships-svg silhouettes to their tight bounding box and tag orientation.
// Reads SVGs from you sunk my titan/assets/svg, rewrites each viewBox (removing
// the potrace whitespace padding), and patches ships.json with portrait/aspect.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(__dirname, '../you sunk my titan');
const SVG_DIR = path.join(GAME_DIR, 'assets', 'svg');
const SHIPS_FILE = path.join(GAME_DIR, 'ships.json');

function bboxOfPathData(d){
  // Robust SVG path flattener (handles upper/lowercase + implicit repeats).
  // Samples curve points and returns the tight bbox of the actual curve.
  const re = /[MmHhVvLlCcSsQqTtAaZz]|-?\d+(?:\.\d+)?/g;
  const tokens = d.match(re) || [];
  let i=0;
  let x=0, y=0, sx=0, sy=0, px=0, py=0, ctrlX=0, ctrlY=0;
  let cmd=null;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const add=(X,Y)=>{ if(X<minX)minX=X; if(X>maxX)maxX=X; if(Y<minY)minY=Y; if(Y>maxY)maxY=Y; };
  const num=()=>{ const n=Number(tokens[i++]); return isNaN(n)?0:n; };
  const rel=cmd=>cmd===cmd.toLowerCase();

  while(i<tokens.length){
    const t=tokens[i];
    if(/[MmHhVvLlCcSsQqTtAaZz]/.test(t)){ cmd=t; i++; continue; }
    const lower = cmd.toLowerCase();
    const isRel = rel(cmd);
    let x1,y1,x2,y2,x3,y3, nx, ny;
    switch(lower){
      case 'm': nx=num(); ny=num(); if(isRel){nx+=x;ny+=y;} x=nx;y=ny; sx=x;sy=y; add(x,y); break;
      case 'l': nx=num(); ny=num(); if(isRel){nx+=x;ny+=y;} x=nx;y=ny; add(x,y); px=x;py=y; break;
      case 'h': nx=isRel? x+num():num(); x=nx; add(x,y); px=x;py=y; break;
      case 'v': ny=isRel? y+num():num(); y=ny; add(x,y); px=x;py=y; break;
      case 'c': {
        x1=num(); y1=num(); x2=num(); y2=num(); x3=num(); y3=num();
        if(isRel){ x1+=x; y1+=y; x2+=x; y2+=y; x3+=x; y3+=y; }
        const x0=x, y0=y;
        for(let s=1;s<=20;s++){
          const t=s/20, mt=1-t;
          const xx=mt*mt*mt*x0+3*mt*mt*t*x1+3*mt*t*t*x2+t*t*t*x3;
          const yy=mt*mt*mt*y0+3*mt*mt*t*y1+3*mt*t*t*y2+t*t*t*y3;
          add(xx,yy);
        }
        ctrlX=x2; ctrlY=y2; px=x3; py=y3; x=x3; y=y3;
        break;
      }
      case 's': {
        // reflect previous control point (only valid after c/s; approximate with current)
        x2 = x + (x - ctrlX); y2 = y + (y - ctrlY);
        if(cmd!==cmd.toLowerCase() && false){} // handled below
        x1=x2; y1=y2;
        x2=num(); y2=num(); x3=num(); y3=num();
        if(isRel){ x2+=x; y2+=y; x3+=x; y3+=y; }
        const x0=x, y0=y;
        for(let s=1;s<=20;s++){
          const t=s/20, mt=1-t;
          const xx=mt*mt*mt*x0+3*mt*mt*t*x1+3*mt*t*t*x2+t*t*t*x3;
          const yy=mt*mt*mt*y0+3*mt*mt*t*y1+3*mt*t*t*y2+t*t*t*y3;
          add(xx,yy);
        }
        ctrlX=x2; ctrlY=y2; px=x3; py=y3; x=x3; y=y3;
        break;
      }
      case 'z': x=sx; y=sy; break;
      default:
        // unsupported command, skip its args as numbers
        i++;
        continue;
    }
  }
  if(minX===Infinity) return null;
  return {minX, minY, maxX, maxY};
}

function processSvg(file){
  const p = path.join(SVG_DIR, file);
  if(!fs.existsSync(p)) return null;
  let txt = fs.readFileSync(p, 'utf8');
  const vb = txt.match(/viewBox="([^"]+)"/);
  if(!vb) return null;
  const vbParts = vb[1].trim().split(/\s+/).map(Number);
  const [vx, vy, vw, vh] = vbParts;

  const tr = txt.match(/<g transform="([^"]+)"/);
  if(!tr) return null;
  // parse translate(tx,ty) and scale(sx,sy) from transform
  const t = tr[1];
  const tm = t.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
  const sm = t.match(/scale\(([-\d.]+)[,\s]+([-\d.]+)\)/);
  if(!tm || !sm) return null;
  const tx=Number(tm[1]), ty=Number(tm[2]);
  const sx=Number(sm[1]), sy=Number(sm[2]);

  // collect all path d's
  const ds = [...txt.matchAll(/<path[^>]*d="([^"]+)"/g)].map(m=>m[1]);
  if(!ds.length) return null;
  let b=null;
  for(const d of ds){
    const bb = bboxOfPathData(d);
    if(!bb) continue;
    if(!b){ b={...bb}; continue; }
    b.minX=Math.min(b.minX,bb.minX); b.maxX=Math.max(b.maxX,bb.maxX);
    b.minY=Math.min(b.minY,bb.minY); b.maxY=Math.max(b.maxY,bb.maxY);
  }
  if(!b) return null;

  // map path-space bbox to viewBox units
  const minVX = sx*b.minX + tx;
  const maxVX = sx*b.maxX + tx;
  const minVY = sy*b.maxY + ty;
  const maxVY = sy*b.minY + ty;
  const nw = maxVX-minVX, nh = maxVY-minVY;
  if(!(nw>0 && nh>0)) return null;
  const pad = Math.max(nw,nh)*0.02;
  const newVb = `${(minVX-pad).toFixed(3)} ${(minVY-pad).toFixed(3)} ${(nw+2*pad).toFixed(3)} ${(nh+2*pad).toFixed(3)}`;
  txt = txt.replace(vb[0], `viewBox="${newVb}"`);
  fs.writeFileSync(p, txt, 'utf8');
  return { aspect: nw/nh, portrait: nh > nw };
}

// process all svg files present in assets/svg, and build a map by lowercase base name
const result = {};
for(const f of fs.readdirSync(SVG_DIR)){
  if(!f.toLowerCase().endsWith('.svg')) continue;
  const info = processSvg(f);
  if(info) result[f.replace(/\.svg$/i,'').toLowerCase()] = info;
}

// patch ships.json
const ships = JSON.parse(fs.readFileSync(SHIPS_FILE,'utf8'));
let updated = 0;
for(const [faction, roster] of Object.entries(ships.factions)){
  for(const s of roster){
    const key = s.svg.replace(/^assets\/svg\//,'').replace(/\.svg$/i,'').toLowerCase();
    if(result[key]){
      s.portrait = !!result[key].portrait;
      s.aspect = +result[key].aspect.toFixed(3);
      updated++;
    } else {
      console.warn('no crop info for', s.name, s.svg);
    }
  }
}
fs.writeFileSync(SHIPS_FILE, JSON.stringify(ships, null, 2), 'utf8');
console.log(`cropped ${Object.keys(result).length} svgs, patched ${updated} ships`);