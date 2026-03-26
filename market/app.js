const ESI_BASE = 'https://esi.evetech.net/latest';

function el(id){return document.getElementById(id)}
function fmt(n){return n===null || n===undefined ? '—' : Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtInt(n){return n===null || n===undefined ? '—' : Number(n).toLocaleString()}

// Update EVE time display
function updateEveTime(){
  const now = new Date();
  const eveEl = el('eveTime');
  if(eveEl) eveEl.textContent = now.toISOString().substring(0,19).replace('T',' ') + ' UTC';
}
setInterval(updateEveTime, 1000);
updateEveTime();

async function searchType(name){
  // Use universe/ids endpoint which doesn't require auth
  const url = `${ESI_BASE}/universe/ids/?datasource=tranquility&language=en`;
  console.log('Searching ESI with name:', name);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([name])
  });
  
  console.log('Search response:', res.status, res.statusText);
  
  if(!res.ok){
    const errorText = await res.text().catch(() => '');
    console.error('ESI error response:', errorText);
    throw new Error(`ESI search failed: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  console.log('Search results:', data);
  
  // Check if we got inventory_types results
  if(data.inventory_types && data.inventory_types.length > 0) {
    return data.inventory_types[0].id;
  }
  
  return null;
}

async function fetchOrders(region, typeId){
  const all = [];
  const maxPages = 200; // safety cap
  
  // Fetch first page to get total pages
  const firstUrl = `${ESI_BASE}/markets/${region}/orders/?page=1&type_id=${typeId}`;
  let r = await fetch(firstUrl);
  if(!r.ok){
    throw new Error(`Orders fetch failed: ${r.status} ${r.statusText}`);
  }
  let chunk = await r.json();
  if(chunk && chunk.length) all.push(...chunk);
  
  let totalPages = parseInt(r.headers.get('x-pages') || '1', 10) || 1;
  if(totalPages > maxPages) totalPages = maxPages;

  // Fetch remaining pages
  if(totalPages > 1){
    updateMessage(`Fetching orders: page 1/${totalPages}...`);
    for(let p=2; p<=totalPages; p++){
      updateMessage(`Fetching orders: page ${p}/${totalPages}...`);
      const url = `${ESI_BASE}/markets/${region}/orders/?page=${p}&type_id=${typeId}`;
      r = await fetch(url);
      if(!r.ok){
        console.warn(`Failed to fetch page ${p}: ${r.status}`);
        break;
      }
      chunk = await r.json();
      if(!chunk || chunk.length===0) break;
      all.push(...chunk);
    }
  }
  
  return all;
}

async function fetchAllRegions(typeId){
  const regions = [
    { id: '10000002', name: 'The Forge' },
    { id: '10000043', name: 'Domain' },
    { id: '10000032', name: 'Sinq Laison' },
    { id: '10000030', name: 'Derelik' }
  ];
  
  const allOrders = [];
  
  for(let i = 0; i < regions.length; i++){
    const region = regions[i];
    updateMessage(`Fetching ${region.name} (${i+1}/${regions.length})...`);
    try{
      const orders = await fetchOrders(region.id, typeId);
      // Tag each order with region name
      orders.forEach(order => {
        order.region_name = region.name;
      });
      allOrders.push(...orders);
    } catch(err){
      console.warn(`Failed to fetch ${region.name}:`, err);
    }
  }
  
  return allOrders;
}

async function fetchHistory(region, typeId){
  const url = `${ESI_BASE}/markets/${region}/history/?type_id=${typeId}`;
  const r = await fetch(url);
  if(!r.ok){
    // non-fatal: return empty and log
    console.warn('History fetch failed', r.status, r.statusText);
    return [];
  }
  return r.json();
}

function summarizeOrders(orders){
  const buys = orders.filter(o=>o.is_buy_order).sort((a,b)=>b.price-a.price);
  const sells = orders.filter(o=>!o.is_buy_order).sort((a,b)=>a.price-b.price);
  return {buys,sells};
}

function updateMessage(msg){
  const msgEl = el('message');
  if(msgEl) msgEl.textContent = msg;
}

function clearMessage(){
  updateMessage('');
}

function showError(msg){
  const errEl = el('error');
  if(errEl){
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }
}

function hideError(){
  const errEl = el('error');
  if(errEl) errEl.classList.add('hidden');
}

function renderOrderRow(order){
  const div = document.createElement('div');
  div.className = 'order-row';
  const locationText = order.region_name || `Location: ${order.location_id || 'Unknown'}`;
  div.innerHTML = `
    <div class="order-price">${fmt(order.price)} ISK</div>
    <div class="order-qty">${fmtInt(order.volume_remain || order.volume_remaining || 0)}</div>
    <div class="order-location">${locationText}</div>
  `;
  return div;
}

function renderOrders(container, orders, limit = null){
  container.innerHTML = '';
  const ordersToShow = limit ? orders.slice(0, limit) : orders;
  
  if(ordersToShow.length === 0){
    container.innerHTML = '<div class="no-orders">No orders found</div>';
    return;
  }
  
  ordersToShow.forEach(order => {
    container.appendChild(renderOrderRow(order));
  });
  
  // Show total count
  if(limit && orders.length > limit){
    const moreDiv = document.createElement('div');
    moreDiv.className = 'more-orders';
    moreDiv.textContent = `Showing ${limit} of ${fmtInt(orders.length)} orders`;
    container.appendChild(moreDiv);
  } else if(orders.length > 0){
    const totalDiv = document.createElement('div');
    totalDiv.className = 'total-orders';
    totalDiv.textContent = `Total: ${fmtInt(orders.length)} orders`;
    container.appendChild(totalDiv);
  }
}

function clearResults(){
  el('itemTitle').textContent = '';
  el('topSell').textContent = '—';
  el('topBuy').textContent = '—';
  el('avg30').textContent = '—';
  el('vol30').textContent = '—';
  el('sellOrders').innerHTML = '';
  el('buyOrders').innerHTML = '';
}

let chart=null;
function renderHistoryChart(history){
  if(typeof Chart === 'undefined'){
    console.error('Chart.js not loaded');
    return;
  }
  const ctx = el('historyChart').getContext('2d');
  const labels = history.map(h=>h.date).reverse();
  const data = history.map(h=>h.average).reverse();
  if(chart) chart.destroy();
  chart = new Chart(ctx,{type:'line',data:{labels, datasets:[{label:'Average price',data, borderColor:'#e8d900', backgroundColor:'rgba(232,217,0,0.12)', tension:0.2}]}, options:{scales:{x:{ticks:{color:'#9aa6b2'}}, y:{ticks:{color:'#9aa6b2'}}}, plugins:{legend:{display:false}}}});
}

async function onSearch(){
  console.log('onSearch called');
  const q = el('itemInput').value.trim();
  const region = el('regionSelect').value;
  console.log('Search params:', q, region);
  
  hideError();
  clearMessage();
  
  if(!q){ 
    showError('Enter an item name.'); 
    return;
  }
  
  clearResults();
  el('results').classList.add('hidden');
  el('summary').classList.add('hidden');
  el('historySection').classList.add('hidden');
  
  updateMessage('Searching for item...');
  
  const btn = el('searchBtn');
  const btnText = el('btnText');
  const btnSpinner = el('btnSpinner');
  
  btn.disabled = true;
  btnText.classList.add('hidden');
  btnSpinner.classList.remove('hidden');
  
  try{
    const typeId = await searchType(q);
    if(!typeId){ 
      showError('No item found. Try a different search term.');
      return;
    }
    
    el('itemTitle').textContent = `${q} (${region === 'all' ? 'All Regions' : 'Single Region'})`;
    
    // Fetch orders from selected region(s)
    let orders;
    if(region === 'all'){
      orders = await fetchAllRegions(typeId);
    } else {
      orders = await fetchOrders(region, typeId);
    }
    
    // Fetch history (only for single region, use Forge for all)
    const historyRegion = region === 'all' ? '10000002' : region;
    const history = await fetchHistory(historyRegion, typeId);
    
    const {buys, sells} = summarizeOrders(orders);
    
    // Update summary stats
    el('topSell').textContent = sells.length ? fmt(sells[0].price) : '—';
    el('topBuy').textContent = buys.length ? fmt(buys[0].price) : '—';
    
    // Compute 30-day avg + volume from history
    if(history && history.length){
      const totalVol = history.reduce((s,h) => s + (h.volume||0), 0);
      const avg = history.reduce((s,h) => s + (h.average||0), 0) / history.length;
      el('avg30').textContent = fmt(avg);
      el('vol30').textContent = fmtInt(totalVol);
      
      // Show history section and render chart
      el('historySection').classList.remove('hidden');
      renderHistoryChart(history);
    }
    
    // Render orders (show more for single region, less for all)
    const displayLimit = region === 'all' ? 50 : 100;
    renderOrders(el('sellOrders'), sells, displayLimit);
    renderOrders(el('buyOrders'), buys, displayLimit);
    
    // Show results
    el('summary').classList.remove('hidden');
    el('results').classList.remove('hidden');
    clearMessage();
    
  } catch(err){
    console.error(err);
    showError('Error: ' + (err && err.message ? err.message : String(err)));
  } finally{
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
  }
}

// Make onSearch available globally for debugging
window.onSearch = onSearch;

document.addEventListener('DOMContentLoaded', ()=>{
  console.log('DOM loaded, setting up event listeners');
  const searchBtn = el('searchBtn');
  const itemInput = el('itemInput');
  
  console.log('searchBtn:', searchBtn);
  console.log('itemInput:', itemInput);
  
  if(searchBtn){
    searchBtn.addEventListener('click', (e) => {
      console.log('Button clicked');
      onSearch();
    });
    console.log('Click listener added to button');
  } else {
    console.error('searchBtn not found');
  }
  
  if(itemInput){
    itemInput.addEventListener('keydown', e => {
      if(e.key === 'Enter'){
        console.log('Enter key pressed');
        onSearch();
      }
    });
    console.log('Keydown listener added to input');
  } else {
    console.error('itemInput not found');
  }
});
