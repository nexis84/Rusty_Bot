// You Sunk My Titan — 10x10 mono-faction vs AI (Frigate 2 Scan, Titan 6 Doomsday) + SSO leaderboards
const GRID = 10;
const SIZES = { Titan:6, Carrier:5, Battleship:4, Cruiser:3, Frigate:2 };
const DIFF_MULT = { easy:1.0, medium:1.5, hard:2.5 };
const API_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:3000/api' : 'https://api.rustybot.co.uk/api';
const AUTH_KEY='titan_auth';
const LS_FACTION='titan_faction';
const LS_DIFF='titan_diff';

let shipsData=null;
let faction='Amarr';
let enemyFaction='Caldari';
let difficulty='easy';
let pilot=null;

let playerBoard, enemyBoard; // 2D arrays 0 empty 1 ship 2 hit 3 miss 4 sunk
let playerShips, enemyShips; // [{class,name,typeID,size,cells:[{r,c}],hits,sunk}]
let turn='setup'; // setup | player | ai | over
let shots=0, turns=0;
let scanUsed=false, scanArmed=false;
let doomAvailable=false, doomUsed=false, doomArmed=false, doomMode='row'; // row vs col
let placementHorizontal=true;
let placementIndex=0;
let placementShips=[]; // templates for current faction in order Titan->Frigate
let gameOver=false, playerWon=false;
let lbSort='efficiency';

const $ = id => document.getElementById(id);
const enemyBoardEl = $('enemyBoard');
const playerBoardEl = $('playerBoard');
const factionGrid = $('factionGrid');
const diffRow = $('diffRow');
const turnInfo = $('turnInfo');
const shotInfo = $('shotInfo');
const scoreInfo = $('scoreInfo');
const scanBtn = $('scanBtn');
const doomBtn = $('doomBtn');
const randomBtn = $('randomBtn');
const clearBtn = $('clearBtn');
const rotateBtn = $('rotateBtn');
const rotateLabel = $('rotateLabel');
const placingName = $('placingName');
const placingSize = $('placingSize');
const startBtn = $('startBtn');
const resetBtn = $('resetBtn');
const pilotStatus = $('pilotStatus');
const loginBtn = $('loginBtn');
const logoutBtn = $('logoutBtn');

// ---- SSO ----
function loadPilot(){ try{ pilot=JSON.parse(localStorage.getItem(AUTH_KEY)); }catch{ pilot=null; } if(pilot && (!pilot.access_token || pilot.expires_at < Date.now())) pilot=null; }
function savePilot(){ if(pilot) localStorage.setItem(AUTH_KEY, JSON.stringify(pilot)); else localStorage.removeItem(AUTH_KEY); }
function renderPilotBar(){
  const lbGuestNotice=$('lbGuestNotice');
  if(pilot){
    pilotStatus.textContent=`Pilot: ${pilot.character_name}`;
    pilotStatus.classList.add('logged-in');
    loginBtn.classList.add('hidden'); logoutBtn.classList.remove('hidden');
    if(lbGuestNotice) lbGuestNotice.classList.add('hidden');
  } else {
    pilotStatus.textContent='Playing as guest — scores won\'t save to leaderboard';
    pilotStatus.classList.remove('logged-in');
    loginBtn.classList.remove('hidden'); logoutBtn.classList.add('hidden');
    if(lbGuestNotice) lbGuestNotice.classList.remove('hidden');
  }
}
async function startPilotLogin(){
  try{
    const res=await fetch(`${API_BASE}/auth/titan/login`);
    const data=await res.json();
    if(!data.url) throw new Error(data.error||'Login unavailable');
    location.href=data.url;
  }catch(e){ pilotStatus.textContent='Login failed: '+e.message; }
}
function pilotLogout(){ pilot=null; savePilot(); renderPilotBar(); }
async function handleSsoCallback(){
  const params=new URLSearchParams(location.search);
  const code=params.get('code');
  if(!code) return;
  try{
    const res=await fetch(`${API_BASE}/auth/titan/token-exchange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Token exchange failed');
    pilot={character_id:data.character_id, character_name:data.character_name, access_token:data.access_token, expires_at: Date.now()+(data.expires_in||1200)*1000-60000};
    savePilot();
  }catch(e){ console.error('[titan] SSO callback failed',e); }
  finally{ history.replaceState({},'', location.pathname); }
}

// ---- Boards ----
function emptyBoard(){ return Array.from({length:GRID},()=>Array(GRID).fill(0)); }
function createElBoard(container, isEnemy){
  container.innerHTML='';
  container.style.setProperty('--cols', GRID);
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      const cell=document.createElement('div');
      cell.className='cell';
      cell.dataset.r=r; cell.dataset.c=c;
      cell.addEventListener('click',()=>onCellClick(r,c,isEnemy));
      cell.addEventListener('mouseenter',()=>onCellHover(r,c,isEnemy,true));
      cell.addEventListener('mouseleave',()=>onCellHover(r,c,isEnemy,false));
      container.appendChild(cell);
    }
  }
}
function getCellEl(container,r,c){ return container.querySelector(`[data-r='${r}'][data-c='${c}']`); }

function canPlaceAt(board, size, r,c, horizontal){
  const cells=[];
  for(let i=0;i<size;i++){
    const rr= horizontal? r : r+i;
    const cc= horizontal? c+i : c;
    if(rr<0||rr>=GRID||cc<0||cc>=GRID) return null;
    if(board[rr][cc]!==0) return null;
    cells.push({r:rr,c:cc});
  }
  return cells;
}
function clearHover(){
  playerBoardEl.querySelectorAll('.cell.hover-ok').forEach(e=> e.classList.remove('hover-ok'));
  playerBoardEl.querySelectorAll('.cell.hover-bad').forEach(e=> e.classList.remove('hover-bad'));
  playerBoardEl.querySelectorAll('.ship-img.sil-preview').forEach(e=> e.remove());
}
function onCellHover(r,c,isEnemy,enter){
  if(isEnemy) return;
  if(turn!=='setup') return;
  clearHover();
  if(!enter) return;
  if(placementIndex>=placementShips.length) return;
  const tpl=placementShips[placementIndex];
  const direct = canPlaceAt(playerBoard, tpl.size, r,c, placementHorizontal);
  const fallback = direct? null : canPlaceAt(playerBoard, tpl.size, r,c, !placementHorizontal);
  const useHor = !!direct;
  const cells = direct || fallback;
  if(!cells){
    const el=getCellEl(playerBoardEl,r,c);
    if(el) el.classList.add('hover-bad');
    return;
  }
  for(const cl of cells){
    const el=getCellEl(playerBoardEl,cl.r,cl.c);
    if(el) el.classList.add('hover-ok');
  }
  // preview silhouette using the actual next ship
  const ghost = {
    name:tpl.name, svg:tpl.svg, icon:tpl.icon, aspect:tpl.aspect, portrait:!!tpl.portrait,
    cells, size:tpl.size, hits:0, sunk:false
  };
  placeShipOverlay(playerBoardEl, ghost, 'sil-preview');
}

function placeFleetRandom(factionName){
  const roster = shipsData.factions[factionName];
  if(!roster) throw new Error('No roster for '+factionName);
  // retry until valid
  for(let attempt=0; attempt<200; attempt++){
    const board=emptyBoard();
    const ships=[];
    let ok=true;
    for(const tpl of roster){
      let placed=false;
      for(let t=0;t<100;t++){
        const horizontal=Math.random()<0.5;
        const r=Math.floor(Math.random()*GRID);
        const c=Math.floor(Math.random()*GRID);
        const cells=[];
        for(let i=0;i<tpl.size;i++){
          const rr= horizontal? r : r+i;
          const cc= horizontal? c+i : c;
          if(rr>=GRID||cc>=GRID){ ok=false; break; }
          if(board[rr][cc]!==0){ ok=false; break; }
          cells.push({r:rr,c:cc});
        }
        if(cells.length!==tpl.size) continue;
        if(!ok){ ok=true; continue; }
        // place
        for(const cl of cells) board[cl.r][cl.c]=1;
        ships.push({class:tpl.class, name:tpl.name, typeID:tpl.typeID, size:tpl.size, icon:tpl.icon, render:tpl.render, cells, hits:0, sunk:false});
        placed=true; break;
      }
      if(!placed){ ok=false; break; }
    }
    if(ok && ships.length===roster.length) return {board, ships};
  }
  throw new Error('Failed to place fleet for '+factionName);
}

function cloneFleet(fleet){
  return fleet.map(s=> ({...s, cells:s.cells.map(c=>({...c})), hits:0, sunk:false}));
}

function isSunk(ship, board){
  for(const cl of ship.cells){ if(board[cl.r][cl.c]!==2 && board[cl.r][cl.c]!==4) return false; }
  return true;
}
function markSunk(ship, board){
  for(const cl of ship.cells) board[cl.r][cl.c]=4;
  ship.sunk=true;
}

function allSunk(ships){ return ships.every(s=>s.sunk); }

function fireAt(board, ships, r,c){
  if(board[r][c]===2||board[r][c]===3||board[r][c]===4) return {already:true};
  if(board[r][c]===1){
    board[r][c]=2;
    // find ship containing cell
    let hitShip=null;
    for(const s of ships){ if(s.cells.some(cl=>cl.r===r&&cl.c===c)){ hitShip=s; s.hits=(s.hits||0)+1; if(isSunk(s,board)){ markSunk(s,board); } break; } }
    // also need to find by reference
    for(const s of ships){ if(s.cells.some(cl=>cl.r===r&&cl.c===c)){ hitShip=s; break; } }
    const sunk = hitShip && hitShip.sunk;
    const shipName = hitShip? hitShip.name : null;
    const shipClass = hitShip? hitShip.class : null;
    return {hit:true, sunk, shipName, shipClass, already:false};
  } else {
    board[r][c]=3;
    return {hit:false, already:false};
  }
}

function scanAt(board, r,c){
  const res=[];
  for(let dr=-1;dr<=1;dr++){
    for(let dc=-1;dc<=1;dc++){
      const rr=r+dr, cc=c+dc;
      if(rr<0||rr>=GRID||cc<0||cc>=GRID) continue;
      const v=board[rr][cc];
      const isShip = v===1||v===2||v===4;
      res.push({r:rr,c:cc,isShip});
    }
  }
  return res;
}
function doomsdayAt(board, ships, r,c, mode){
  const affected=[];
  for(let i=0;i<GRID;i++){
    const rr = mode==='row'? r : i;
    const cc = mode==='row'? i : c;
    if(board[rr][cc]===2||board[rr][cc]===3||board[rr][cc]===4) continue;
    const before=board[rr][cc];
    const isShip = before===1;
    if(isShip) board[rr][cc]=2; else board[rr][cc]=3;
    affected.push({r:rr,c:cc,hit:isShip});
  }
  // update sunk flags
  for(const s of ships){ if(!s.sunk && isSunk(s,board)) markSunk(s,board); }
  return affected;
}

// ---- AI ----
let aiHuntStack=[]; // for medium
function aiPickEasy(board){
  const opts=[];
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++) if(board[r][c]===0||board[r][c]===1) opts.push([r,c]);
  return opts[Math.floor(Math.random()*opts.length)];
}
function aiPickMedium(board){
  // if stack has entries, drain it
  while(aiHuntStack.length){
    const [r,c]=aiHuntStack.pop();
    if(r<0||r>=GRID||c<0||c>=GRID) continue;
    if(board[r][c]===0||board[r][c]===1) return [r,c];
  }
  // hunt parity random among untried parity
  const parityOpts=[], anyOpts=[];
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
    if(board[r][c]!==0 && board[r][c]!==1) continue;
    anyOpts.push([r,c]);
    if((r+c)%2===0) parityOpts.push([r,c]);
  }
  const pool = parityOpts.length? parityOpts : anyOpts;
  return pool[Math.floor(Math.random()*pool.length)];
}
function aiPickHard(board, ships){
  // remaining sizes
  const remaining = ships.filter(s=>!s.sunk).map(s=>s.size);
  if(!remaining.length) return aiPickEasy(board);
  const prob = Array.from({length:GRID},()=>Array(GRID).fill(0));
  for(const L of remaining){
    for(let r=0;r<GRID;r++){
      for(let c=0;c<GRID;c++){
        // horizontal
        if(c+L<=GRID){
          let ok=true;
          for(let i=0;i<L;i++) if(board[r][c+i]===3) ok=false;
          if(ok) for(let i=0;i<L;i++) prob[r][c+i]++;
        }
        // vertical
        if(r+L<=GRID){
          let ok=true;
          for(let i=0;i<L;i++) if(board[r+i][c]===3) ok=false;
          if(ok) for(let i=0;i<L;i++) prob[r+i][c]++;
        }
      }
    }
  }
  // force hits: if there are hits (2) not yet sunk, intersect placements covering all hits of a connected component
  // simple: prefer cells adjacent to hits
  let best=-1, bestCells=[];
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
    if(board[r][c]!==0 && board[r][c]!==1) continue;
    let p=prob[r][c];
    // bias adjacent to hit
    const adjHit = [[-1,0],[1,0],[0,-1],[0,1]].some(([dr,dc])=>{
      const rr=r+dr, cc=c+dc; return rr>=0&&rr<GRID&&cc>=0&&cc<GRID&&board[rr][cc]===2;
    });
    if(adjHit) p+=200; // strong clamp
    if(p>best){ best=p; bestCells=[[r,c]]; }
    else if(p===best) bestCells.push([r,c]);
  }
  if(bestCells.length) return bestCells[Math.floor(Math.random()*bestCells.length)];
  return aiPickEasy(board);
}
function aiNotifyHit(r,c,board){
  // for medium: push neighbours
  if(difficulty!=='medium') return;
  const deltas=[[ -1,0],[1,0],[0,-1],[0,1]];
  for(const [dr,dc] of deltas){
    const rr=r+dr, cc=c+dc;
    if(rr>=0&&rr<GRID&&cc>=0&&cc<GRID && (board[rr][cc]===0||board[rr][cc]===1)){
      aiHuntStack.push([rr,cc]);
    }
  }
}
function aiNotifySunk(){
  if(difficulty==='medium') aiHuntStack=[];
}

// ---- Rendering ----
function updatePlacementUI(){
  if(rotateLabel) rotateLabel.textContent = placementHorizontal? 'Horizontal':'Vertical';
  if(placingName && placingSize){
    if(turn!=='setup' || placementIndex>=placementShips.length){
      if(turn==='setup' && placementIndex>=placementShips.length){
        $('playerLegend').innerHTML='Fleet ready — press <strong>Start Battle</strong>';
      } else if(turn==='setup'){
        const tpl=placementShips[placementIndex];
        placingName.textContent=tpl.name;
        placingSize.textContent=tpl.size;
      }
      // keep existing when not setup
    } else {
      const tpl=placementShips[placementIndex];
      placingName.textContent=tpl.name;
      placingSize.textContent=tpl.size;
    }
  }
  if(startBtn){
    const ready = placementIndex>=placementShips.length;
    startBtn.disabled = !ready;
    startBtn.title = ready? 'Start battle' : `Place all ships (${placementIndex}/${placementShips.length})`;
  }
}

function ensureSvgLayer(container){
  let layer = container.querySelector('.board-svg-layer');
  if(!layer){
    layer = document.createElement('div');
    layer.className='board-svg-layer';
    container.appendChild(layer);
  }
  return layer;
}

function isHorizontal(ship){
  if(!ship.cells.length) return true;
  return ship.cells.every(c=> c.r===ship.cells[0].r);
}

function styleSilSlice(el, url, vert, idx, span){
  el.style.backgroundImage=`url("${url}")`;
  el.style.backgroundRepeat='no-repeat';
  el.style.backgroundSize = vert ? `auto ${span*100}%` : `${span*100}% auto`;
  el.style.backgroundPosition = vert
    ? (span>1 ? `50% ${(idx/(span-1))*100}%` : '50% 50%')
    : (span>1 ? `${(idx/(span-1))*100}% 50%` : '50% 50%');
}

// Draw one ship as a single silhouette img sized so its long axis spans the ship's
// cells (natural aspect preserved, centered on the footprint, may overlap neighbors).
function placeShipOverlay(boardEl, ship, cls){
  const first = getCellEl(boardEl, ship.cells[0].r, ship.cells[0].c);
  const last = getCellEl(boardEl, ship.cells[ship.cells.length-1].r, ship.cells[ship.cells.length-1].c);
  if(!first || !last) return;
  const hor = isHorizontal(ship);
  const rect = hor ? {
    x: first.offsetLeft,
    y: first.offsetTop,
    w: last.offsetLeft + last.offsetWidth - first.offsetLeft,
    h: first.offsetHeight
  } : {
    x: first.offsetLeft,
    y: first.offsetTop,
    w: first.offsetWidth,
    h: last.offsetTop + last.offsetHeight - first.offsetTop
  };
  const aspect = ship.aspect || 3;
  const portrait = !!ship.portrait;
  const img = document.createElement('img');
  img.src = ship.svg || ship.icon;
  img.alt = ship.name;
  img.className = 'ship-img ' + cls;
  img.loading = 'lazy';
  let w, h;
  if(!portrait){
    if(hor){
      w = rect.w; h = w/aspect;
      img.style.left = (rect.x + (rect.w - w)/2) + 'px';
      img.style.top  = (rect.y + (rect.h - h)/2) + 'px';
      img.style.width  = w + 'px';
      img.style.height = h + 'px';
    } else {
      w = rect.h; h = w/aspect;
      img.style.width  = w + 'px';
      img.style.height = h + 'px';
      img.style.left = (rect.x + (rect.w - h)/2) + 'px';
      img.style.top  = (rect.y + (rect.h - w)/2) + 'px';
      img.style.transform = 'rotate(90deg)';
    }
  } else {
    if(hor){
      h = rect.w; w = h*aspect;
      img.style.height = h + 'px';
      img.style.width  = w + 'px';
      img.style.left = (rect.x + (rect.w - h)/2) + 'px';
      img.style.top  = (rect.y + (rect.h - w)/2) + 'px';
      img.style.transform = 'rotate(-90deg)';
    } else {
      h = rect.h; w = h*aspect;
      img.style.height = h + 'px';
      img.style.width  = w + 'px';
      img.style.left = (rect.x + (rect.w - w)/2) + 'px';
      img.style.top  = (rect.y + (rect.h - h)/2) + 'px';
    }
  }
  boardEl.appendChild(img);
}

function addSliceMarkers(cellEl, v){
  if(v===2){
    const m=document.createElement('div');
    m.className='cell-mark mark-hit';
    cellEl.appendChild(m);
  } else if(v===3){
    const m=document.createElement('div');
    m.className='cell-mark mark-miss';
    cellEl.appendChild(m);
  }
}

function renderBoards(){
  // reset all cells, draw state colors
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
    const el=getCellEl(playerBoardEl,r,c);
    if(!el) continue;
    el.className='cell';
    el.innerHTML='';
    const v=playerBoard[r][c];
    if(v===2) el.classList.add('hit');
    else if(v===3) el.classList.add('miss');
    else if(v===4) el.classList.add('sunk');
    const onShip = playerShips.some(s=> s.cells.some(cl=>cl.r===r&&cl.c===c));
    if(onShip && v!==3 && v!==4) el.classList.add('ship');
  }
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
    const el=getCellEl(enemyBoardEl,r,c);
    if(!el) continue;
    el.className='cell';
    el.innerHTML='';
    const v=enemyBoard[r][c];
    if(v===2) el.classList.add('hit');
    else if(v===3) el.classList.add('miss');
    else if(v===4) el.classList.add('sunk');
  }

  // clear previous ship overlays
  playerBoardEl.querySelectorAll('.ship-img').forEach(e=> e.remove());
  enemyBoardEl.querySelectorAll('.ship-img').forEach(e=> e.remove());

  // MY FLEET silhouettes (always visible)
  for(const ship of playerShips){
    let cls='sil-gold';
    if(ship.sunk) cls='sil-sunk';
    else if(ship.hits>0) cls='sil-dmg';
    placeShipOverlay(playerBoardEl, ship, cls);
    // per-cell hit/miss markers on top
    ship.cells.forEach(cl=> addSliceMarkers(getCellEl(playerBoardEl, cl.r, cl.c), playerBoard[cl.r][cl.c]));
  }

  // ENEMY FLEET fog: hidden until ship has a hit; shown faint, full when sunk
  if(turn!=='setup'){
    for(const ship of enemyShips){
      if(ship.hits===0 && !ship.sunk) continue;
      let cls = ship.sunk ? 'sil-sunk' : 'sil-enemy';
      placeShipOverlay(enemyBoardEl, ship, cls);
      ship.cells.forEach(cl=> addSliceMarkers(getCellEl(enemyBoardEl, cl.r, cl.c), enemyBoard[cl.r][cl.c]));
    }
  }
}

function renderFleets(){
  function fleetHtml(ships){
    return ships.map(s=>{
      const cls=s.sunk?'sunk': (s.hits>0?'hit':'');
      const src=s.svg||s.icon;
      return `<span class="ship-chip ${cls}"><img src="${src}" style="filter:brightness(0) invert(.9)" alt="">${s.name} (${s.size}) ${s.sunk?'— SUNK': s.hits?`— ${s.hits}/${s.size} hit`:''}</span>`;
    }).join('');
  }
  $('playerFleet').innerHTML=fleetHtml(playerShips);
  // during setup keep enemy fleet hidden (fog), after start show sunk progress
  if(turn==='setup'){
    $('enemyFleet').innerHTML=`<span class="ship-chip" style="opacity:.6">Enemy Fleet: ${enemyFaction} — hidden until battle</span>`;
  } else {
    $('enemyFleet').innerHTML=fleetHtml(enemyShips);
  }
}

function updateStatus(){
  turnInfo.textContent = turn==='setup'?'Setup': turn==='player'?'Your Turn': turn==='ai'?'Enemy Turn':'Over';
  shotInfo.textContent = shots;
  const sc = computeScore();
  scoreInfo.textContent = sc;
  scanBtn.textContent = scanUsed? 'Scan — Used' : (scanArmed? 'Scan — ARMED (pick 3×3)':'Scan (1×)');
  scanBtn.classList.toggle('active', scanArmed);
  scanBtn.disabled = scanUsed || turn!=='player' || gameOver;
  // doom
  if(doomUsed){
    doomBtn.textContent='Doomsday — Used';
    doomBtn.classList.remove('ready'); doomBtn.disabled=true;
  } else if(!doomAvailable){
    doomBtn.textContent='Doomsday — Locked';
    doomBtn.disabled=true; doomBtn.classList.remove('ready');
  } else {
    doomBtn.textContent = doomArmed? `Doomsday ARMED (${doomMode}) — pick cell` : 'Doomsday (1×) — Row/Col';
    doomBtn.classList.toggle('ready', doomAvailable && !doomUsed);
    doomBtn.disabled = turn!=='player' || gameOver;
  }
}

function computeScore(){
  if(shots===0) return 0;
  const base=10000;
  const mult=DIFF_MULT[difficulty]||1;
  const sc = Math.max(0, Math.round((base/shots)*mult - 2*shots));
  return sc;
}

// ---- Game flow ----
function pickRandomEnemyFaction(){
  const keys = Object.keys(shipsData.factions); // includes Triglavian
  let pick = keys[Math.floor(Math.random()*keys.length)];
  // ensure at least sometimes different from player for variety — 80% chance to re-roll if same
  if(pick===faction && keys.length>1 && Math.random()<0.8){
    const alts = keys.filter(k=>k!==faction);
    pick = alts[Math.floor(Math.random()*alts.length)];
  }
  return pick;
}

function initPlacementForFaction(){
  const roster = shipsData.factions[faction];
  if(!roster) return;
  // keep order Titan, Carrier, Battleship, Cruiser, Frigate for stable placement prompt
  const order = ['Titan','Carrier','Battleship','Cruiser','Frigate'];
  placementShips = order.map(cls=> roster.find(r=>r.class===cls)).filter(Boolean);
  placementIndex=0;
  placementHorizontal=true;
}

function newGame(){
  enemyFaction = pickRandomEnemyFaction();
  const resE = placeFleetRandom(enemyFaction);
  enemyBoard = resE.board;
  enemyShips = resE.ships;
  // player: empty board for manual placement
  playerBoard = emptyBoard();
  playerShips = [];
  initPlacementForFaction();
  turn='setup';
  shots=0; turns=0;
  scanUsed=false; scanArmed=false; doomAvailable=false; doomUsed=false; doomArmed=false;
  gameOver=false; playerWon=false;
  aiHuntStack=[];
  renderBoards(); renderFleets(); updateStatus(); updatePlacementUI();
}

function randomisePlayerFleet(){
  const resP = placeFleetRandom(faction);
  playerBoard = resP.board;
  playerShips = resP.ships;
  placementIndex = placementShips.length; // mark complete
  renderBoards(); renderFleets(); updatePlacementUI(); updateStatus();
}

function clearPlayerFleet(){
  playerBoard = emptyBoard();
  playerShips = [];
  placementIndex=0;
  placementHorizontal=true;
  renderBoards(); renderFleets(); updatePlacementUI(); updateStatus();
}

function tryPlaceCurrentShip(r,c){
  if(turn!=='setup') return false;
  if(placementIndex>=placementShips.length) return false;
  const tpl = placementShips[placementIndex];
  let cells = canPlaceAt(playerBoard, tpl.size, r,c, placementHorizontal);
  // try opposite orientation if blocked
  if(!cells) cells = canPlaceAt(playerBoard, tpl.size, r,c, !placementHorizontal);
  if(!cells) return false;
  // place
  for(const cl of cells) playerBoard[cl.r][cl.c]=1;
  playerShips.push({class:tpl.class, name:tpl.name, typeID:tpl.typeID, size:tpl.size, icon:tpl.icon, render:tpl.render, cells, hits:0, sunk:false});
  placementIndex++;
  renderBoards(); renderFleets(); updatePlacementUI(); updateStatus();
  if(placementIndex>=placementShips.length){
    flash('Fleet complete — press Start Battle', true);
  }
  return true;
}

function startBattle(){
  if(turn!=='setup') return;
  if(!shipsData) return;
  if(placementIndex < placementShips.length){
    flash(`Place all ships first (${placementIndex}/${placementShips.length})`, false);
    return;
  }
  turn='player'; turns=1;
  updateStatus(); updatePlacementUI();
  flash('Battle started — your turn — fire at Space right', false);
}

function onCellClick(r,c,isEnemyBoard){
  if(gameOver) return;
  // placement phase: clicks on YOUR board place fleet left
  if(turn==='setup' && !isEnemyBoard){
    // right-click style: if cell already part of fleet, remove last ship? Simpler: place next ship
    // if clicking a placed ship and fleet is complete, remove that ship to allow reposition
    if(placementIndex>=placementShips.length){
      // fleet complete — clicking a placed ship removes it for reposition
      const idx = playerShips.findIndex(s=> s.cells.some(cl=> cl.r===r && cl.c===c));
      if(idx>=0){
        const rem=playerShips[idx];
        for(const cl of rem.cells) playerBoard[cl.r][cl.c]=0;
        playerShips.splice(idx,1);
        // put that template back as next to place
        placementIndex = placementShips.length -1; // will place at end, but keep order not strict
        const tpl = placementShips.find(p=> p.class===rem.class);
        // move tpl to end for re-place continuity
        placementShips = placementShips.filter(p=> p.class!==rem.class);
        placementShips.push(tpl);
        renderBoards(); renderFleets(); updatePlacementUI(); updateStatus();
        flash(`${rem.name} removed — place again`, false);
        return;
      }
      return;
    }
    const placed = tryPlaceCurrentShip(r,c);
    if(!placed) flash('Cannot place there — blocked or out of bounds', false);
    return;
  }
  if(turn==='setup' && isEnemyBoard) return; // ignore enemy clicks during setup
  // if doom armed, handle on enemy board as doomsday
  if(doomArmed && isEnemyBoard){
    if(turn!=='player') return;
    // toggle mode on second click? For now doomMode toggles via button long-press; here we use current doomMode
    const res = doomsdayAt(enemyBoard, enemyShips, r,c, doomMode);
    doomArmed=false; doomUsed=true;
    shots+=1;
    renderBoards(); renderFleets(); updateStatus();
    checkWin();
    if(!gameOver){
      // show doom result
      const hits = res.filter(x=>x.hit).length;
      flash(`Doomsday ${doomMode} ${r},${c} — ${hits} hits`, hits>0);
      setTimeout(aiTurn, 500);
      turn='ai';
    }
    return;
  }
  if(scanArmed && isEnemyBoard){
    if(turn!=='player') return;
    const res = scanAt(enemyBoard, r,c);
    scanArmed=false; scanUsed=true;
    // visual scan overlay for 1.5s
    for(const cl of res){
      const el=getCellEl(enemyBoardEl, cl.r, cl.c);
      if(el){
        el.classList.add(cl.isShip? 'scan-hit':'scan-miss');
        setTimeout(()=> el.classList.remove('scan-hit','scan-miss'), 1300);
      }
    }
    const hits = res.filter(x=>x.isShip).length;
    flash(`Scan centered ${String.fromCharCode(65+c)}${r+1} — ${hits? hits+' contacts':'clear'}`, hits>0);
    updateStatus();
    return;
  }
  if(!isEnemyBoard) return;
  if(turn!=='player') return;
  if(enemyBoard[r][c]===2||enemyBoard[r][c]===3||enemyBoard[r][c]===4) return;

  const res = fireAt(enemyBoard, enemyShips, r,c);
  shots+=1;
  renderBoards(); renderFleets(); updateStatus();
  if(res.sunk){
    flash(`SUNK ${res.shipName} (${res.shipClass})!`, true);
  } else if(res.hit){
    flash('HIT!', true);
  } else {
    flash('MISS', false);
  }
  checkWin();
  if(gameOver) return;
  turn='ai';
  updateStatus();
  setTimeout(aiTurn, 450);
}

function aiTurn(){
  if(gameOver || turn!=='ai') return;
  let pick;
  if(difficulty==='easy') pick=aiPickEasy(playerBoard);
  else if(difficulty==='medium') pick=aiPickMedium(playerBoard);
  else pick=aiPickHard(playerBoard, playerShips);
  if(!pick){ turn='player'; updateStatus(); return; }
  const [r,c]=pick;
  const res=fireAt(playerBoard, playerShips, r,c);
  renderBoards(); renderFleets();
  // after AI hit, check titan damage unlock
  const playerTitan = playerShips.find(s=>s.class==='Titan');
  if(playerTitan && playerTitan.hits>0 && !doomAvailable && !doomUsed){
    doomAvailable=true;
  }
  if(res.hit){
    aiNotifyHit(r,c,playerBoard);
    if(res.sunk) aiNotifySunk();
  }
  // check player loss
  if(allSunk(playerShips)){
    endGame(false);
    return;
  }
  turn='player'; turns+=1;
  updateStatus();
}

function checkWin(){
  if(allSunk(enemyShips)){
    endGame(true);
  } else if(allSunk(playerShips)){
    endGame(false);
  }
}

function flash(msg, good){
  const o=$('resultOverlay'), m=$('resultMsg'), s=$('resultSub');
  m.textContent=msg;
  m.className = good? 'correct':'wrong';
  s.textContent='';
  o.classList.remove('hidden');
  setTimeout(()=> o.classList.add('hidden'), 1100);
}

function endGame(won){
  gameOver=true; playerWon=won; turn='over';
  const sc=computeScore();
  $('goResult').textContent = won? `Victory — You sunk their ${enemyFaction} Titan!` : `Defeat — Your ${faction} Titan was sunk`;
  $('goShots').textContent=shots;
  $('goTurns').textContent=turns;
  $('goDiff').textContent=difficulty + ` vs ${enemyFaction}`;
  $('goScore').textContent=sc;
  $('goSub').textContent = won? `All 5 enemy (${enemyFaction}) ships sunk in ${shots} shots` : `Outgunned by ${enemyFaction} fleet — better luck next sortie`;
  $('goTitle').textContent = won? 'VICTORY':'DEFEAT';
  $('goScoreStatus').textContent = pilot? 'Saving to leaderboard…' : 'Sign in with EVE to save to leaderboard (guest score not saved)';
  $('goScoreStatus').className='';
  $('gameOverOverlay').classList.remove('hidden');
  updateStatus();
  if(pilot){
    submitScore({won, shots, turns, difficulty, faction, enemyFaction, score:sc});
  }
}

async function submitScore(payload){
  const status=$('goScoreStatus');
  try{
    let res=await fetch(`${API_BASE}/titans/score`,{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${pilot.access_token}`},
      body: JSON.stringify(payload)
    });
    if(res.status===401){
      pilot=null; savePilot(); renderPilotBar();
      status.textContent='Session expired — sign in again for next game';
      status.className='err'; return;
    }
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Submit failed');
    status.textContent = data.isPersonalBest? `Saved — new personal best! Rank #${data.rank}` : `Saved — Rank #${data.rank}`;
    status.className='ok';
    loadLeaderboard(true);
  }catch(e){
    status.textContent='Save failed: '+e.message;
    status.className='err';
  }
}

async function loadLeaderboard(force=false){
  const lbList=$('lbList');
  const lbPanel=$('lbPanel');
  if(!force && lbPanel.classList.contains('hidden')) return;
  lbList.innerHTML='<p class="lb-empty">Loading…</p>';
  try{
    const res=await fetch(`${API_BASE}/titans/leaderboard?sort=${lbSort}`,{cache:'no-store'});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Failed to load');
    if(!data.leaderboard.length){
      lbList.innerHTML='<p class="lb-empty">No scores yet — be the first!</p>'; return;
    }
    lbList.innerHTML=data.leaderboard.map(r=>`
      <div class="lb-row${r.rank<=3?' top3':''}${pilot&&r.name===pilot.character_name?' me':''}">
        <span class="lb-rank">#${r.rank}</span>
        <span class="lb-name">${escapeHtml(r.name)} <span style="color:var(--dim);font-size:.75rem">${r.faction||''} · ${r.difficulty||''}</span></span>
        <span class="lb-isk">${r.score} pts</span>
        <span style="color:var(--dim);font-size:.8rem">${r.turns||'?'} turns · ${r.shots||'?'} shots</span>
      </div>
    `).join('');
  }catch(e){ lbList.innerHTML=`<p class="lb-empty">Leaderboard unavailable: ${escapeHtml(e.message)}</p>`; }
}
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ---- Faction/Diff wiring ----
function renderFactionGrid(){
  const entries=[
    {key:'Amarr', sub:'Avatar · Archon · Abaddon · Maller · Executioner'},
    {key:'Caldari', sub:'Leviathan · Chimera · Rokh · Caracal · Merlin'},
    {key:'Gallente', sub:'Erebus · Thanatos · Megathron · Vexor · Incursus'},
    {key:'Minmatar', sub:'Ragnarok · Nidhoggur · Maelstrom · Rupture · Rifter'},
    {key:'Triglavian', sub:'Zirnitra · Leshak · Drekavac · Vedmak · Damavik'},
  ];
  factionGrid.innerHTML= entries.map(e=>`
    <button class="faction-btn ${faction===e.key?'active':''}" data-faction="${e.key}" type="button">
      <span class="f-name">${e.key}</span><span class="f-sub">${e.sub}</span>
    </button>
  `).join('');
  factionGrid.querySelectorAll('.faction-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      faction=btn.dataset.faction;
      localStorage.setItem(LS_FACTION,faction);
      renderFactionGrid();
      // reinit placement for new faction; enemy stays random Triglav-capable
      initPlacementForFaction();
      clearPlayerFleet();
      // re-roll enemy faction (random race) on faction change for surprise
      enemyFaction = pickRandomEnemyFaction();
      const resE = placeFleetRandom(enemyFaction);
      enemyBoard = resE.board; enemyShips = resE.ships;
      renderBoards(); renderFleets(); updateStatus(); updatePlacementUI();
    });
  });
}
function wireDiff(){
  diffRow.querySelectorAll('.diff-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      difficulty=btn.dataset.diff;
      localStorage.setItem(LS_DIFF, difficulty);
      diffRow.querySelectorAll('.diff-btn').forEach(b=> b.classList.toggle('active', b.dataset.diff===difficulty));
      updateStatus();
    });
  });
}

// ---- Controls ----
scanBtn.addEventListener('click',()=>{
  if(scanUsed||gameOver||turn!=='player') return;
  scanArmed=!scanArmed;
  if(scanArmed) doomArmed=false;
  updateStatus();
  if(scanArmed) flash('Scan ARMED — pick center of 3×3', true);
});
doomBtn.addEventListener('click',()=>{
  if(!doomAvailable||doomUsed||gameOver||turn!=='player') return;
  // toggle row/col mode on each click
  if(!doomArmed){
    doomArmed=true; scanArmed=false;
  } else {
    doomMode = doomMode==='row'? 'col':'row';
  }
  updateStatus();
  if(doomArmed) flash(`Doomsday ARMED — ${doomMode} — pick any cell`, true);
});
randomBtn.addEventListener('click',()=>{
  // randomise YOUR fleet only; keep setup state (enemy fleet already random)
  randomisePlayerFleet();
  flash('Fleet randomised — edit by clicking ships, R to rotate', false);
});
if(clearBtn) clearBtn.addEventListener('click',()=>{
  clearPlayerFleet();
  flash('Fleet cleared — place ships left board', false);
});
if(rotateBtn) rotateBtn.addEventListener('click',()=>{
  placementHorizontal=!placementHorizontal;
  updatePlacementUI();
});
document.addEventListener('keydown', (e)=>{
  if(e.key.toLowerCase()==='r' && turn==='setup'){
    placementHorizontal=!placementHorizontal;
    updatePlacementUI();
    clearHover();
  }
});
startBtn.addEventListener('click', startBattle);
resetBtn.addEventListener('click', ()=>{ newGame(); flash('Reset — place fleet left', false); $('gameOverOverlay').classList.add('hidden'); });
$('goAgainBtn').addEventListener('click',()=>{ $('gameOverOverlay').classList.add('hidden'); newGame(); });
$('goMenuBtn').addEventListener('click',()=> $('gameOverOverlay').classList.add('hidden'));
$('lbPanelBtn').addEventListener('click',()=>{
  const hidden=$('lbPanel').classList.toggle('hidden');
  $('lbPanelBtn').classList.toggle('open', !hidden);
  if(!hidden) loadLeaderboard(true);
});
document.querySelectorAll('.lb-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.lb-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    lbSort=btn.dataset.sort;
    loadLeaderboard(true);
  });
});

// ---- Init ----
async function init(){
  const savedF=localStorage.getItem(LS_FACTION);
  if(savedF) faction=savedF;
  const savedD=localStorage.getItem(LS_DIFF);
  if(savedD) difficulty=savedD;
  // reflect diff active
  diffRow.querySelectorAll('.diff-btn').forEach(b=> b.classList.toggle('active', b.dataset.diff===difficulty));

  try{
    const res=await fetch('ships.json?v=1');
    if(!res.ok) throw new Error('HTTP '+res.status);
    shipsData=await res.json();
  }catch(e){
    flash('Failed to load ships.json: '+e.message, false);
    return;
  }

  await handleSsoCallback();
  loadPilot(); renderPilotBar();
  if(loginBtn) loginBtn.addEventListener('click', startPilotLogin);
  if(logoutBtn) logoutBtn.addEventListener('click', pilotLogout);
  const lbLoginBtn=$('lbLoginBtn');
  if(lbLoginBtn) lbLoginBtn.addEventListener('click', startPilotLogin);

  renderFactionGrid();
  wireDiff();
  createElBoard(enemyBoardEl,true);
  createElBoard(playerBoardEl,false);
  newGame();
  // initial status reflect saved diff
  updateStatus();
}
init();
