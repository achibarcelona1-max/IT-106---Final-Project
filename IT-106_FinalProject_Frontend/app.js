// ============================================================
//  MOCK MODE — No database. All data lives in memory.
//  When you're ready to connect Supabase, replace this file
//  with the Supabase version and restore the CDN script in index.html.
// ============================================================

// ---- Live data from API ----
let products = [];
let transactions = [];

function normalizeTxn(t) {
  const p = products.find(x => x.id === t.product_id);
  return {
    ...t,
    quantity_changed: t.quantity_changed ?? t.quantity ?? 0,
    created_at: t.created_at ?? t.transaction_date ?? null,
    products: t.products ?? (p ? { name: p.name } : null),
    users: t.users ?? null,
  };
}

async function fetchProducts() {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch('http://localhost:3000/api/products', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      products = await response.json();
    }
  } catch (error) {
    console.error('Error fetching products:', error);
  }
}

async function fetchTransactions() {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch('http://localhost:3000/api/transactions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      const data = await response.json();
      transactions = Array.isArray(data) ? data.map(normalizeTxn) : [];
      // #region agent log
      fetch('http://127.0.0.1:7728/ingest/f75f4bd3-c1c1-4dc9-9ac4-67d89466a261',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8dd7e0'},body:JSON.stringify({sessionId:'8dd7e0',location:'app.js:fetchTransactions',message:'fetch ok',data:{count:transactions.length,sample:transactions[0]?{action_type:transactions[0].action_type,date:transactions[0].created_at}:null},timestamp:Date.now(),runId:'post-fix-2',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } else {
      const errBody = await response.json().catch(() => ({}));
      console.error('Error fetching transactions:', response.status, errBody);
      transactions = [];
      toast(errBody?.message || 'Could not load transactions. Restart the backend server.', 'err');
      // #region agent log
      fetch('http://127.0.0.1:7728/ingest/f75f4bd3-c1c1-4dc9-9ac4-67d89466a261',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8dd7e0'},body:JSON.stringify({sessionId:'8dd7e0',location:'app.js:fetchTransactions',message:'fetch failed',data:{status:response.status,err:errBody?.message||errBody?.code},timestamp:Date.now(),runId:'post-fix-2',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

// ---- Mock users (login credentials) ----
const MOCK_USERS = [
  { id: 'u001', email: 'admin@demo.com', password: 'admin123', role: 'admin'  },
  { id: 'u002', email: 'staff@demo.com', password: 'staff123', role: 'staff'  },
];

// ---- App state ----
let currentUser = null;
let currentRole = 'staff';
let prodFilter  = 'all';
let prodSort    = '';
let txnFilter   = 'all';
let searchQ     = '';
let prodPage    = 1;
let txnPage     = 1;
const PP        = 8;
let editProdId  = null;
let lowThreshold = 10;
let delProdId   = null;
let mvProdId    = null;
let mvType      = 'RESTOCK';

// ---- ID generator ----
function genId() { return 'x' + Math.random().toString(36).slice(2, 10); }

// ---- Product emoji ----
function prodEmoji(name) {
  const n = (name||'').toLowerCase();
  if (/laptop|computer|monitor|keyboard|mouse|usb|hdmi|phone|tablet|printer|scanner/.test(n)) return '💻';
  if (/chair|desk|table|shelf|cabinet|drawer|sofa/.test(n)) return '🪑';
  if (/paper|pen|pencil|staple|tape|folder|notebook|marker|binder/.test(n)) return '📋';
  if (/drill|hammer|wrench|screwdriver|saw|nail|bolt/.test(n)) return '🔧';
  if (/food|rice|noodle|coffee|tea|water|juice|snack|biscuit/.test(n)) return '🍜';
  return '📦';
}

// ============================================================
//  AUTH  (mock)
// ============================================================
async function doLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  const btn   = document.getElementById('loginBtn');
  const err   = document.getElementById('loginErr');
  
  err.style.display = 'none';
  if (!email || !pass) { showErr('Please enter email and password.'); return; }

  btn.disabled = true; btn.textContent = 'Signing in...';

  try {
    // 1. The Waiter takes the order to the kitchen (Express API)
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass })
    });

    const data = await response.json();

    // 2. The Kitchen says yes or no
    if (response.ok) {
      // Save the VIP ticket (JWT) to the browser so we can use it later
      localStorage.setItem('token', data.token); 
      
      // Since we don't have the full user object yet, we just bypass for now
      currentUser = { email: email }; 
      currentRole = 'admin'; // You'll extract this from the token later
      enterApp();
    } else {
      showErr(data.message || 'Invalid credentials');
    }
  } catch (error) {
    showErr('Failed to connect to the server.');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

function showErr(msg) {
  const e = document.getElementById('loginErr');
  e.textContent = '⚠️ ' + msg;
  e.style.display = 'block';
}

async function enterApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display   = 'block';
  document.getElementById('sEmail').textContent  = currentUser.email;
  document.getElementById('sRole').textContent   = currentRole;
  document.getElementById('sAvatar').textContent = currentUser.email[0].toUpperCase();
  if (currentRole !== 'admin') {
    document.getElementById('addProductBtn').style.display = 'none';
  }
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
 
}

function doLogout() {
  currentUser = null;
  currentRole = 'staff';
  document.getElementById('loginPage').style.display = '';
  document.getElementById('appPage').style.display   = 'none';
  document.getElementById('lEmail').value = '';
  document.getElementById('lPass').value  = '';
  document.getElementById('loginErr').style.display = 'none';
  showView('dashboard', document.getElementById('nav-dashboard'));
}

// ============================================================
//  DATA  (mock — operates on in-memory arrays)
// ============================================================
async function refreshAll() {
  await fetchProducts();
  await fetchTransactions();
  renderStats();
  renderProdTable();
  renderLowStock();
  renderTxnTable();
  renderDashTxns();
  updateTxnBadge();
}

// ============================================================
//  PRODUCTS CRUD  (mock)
// ============================================================
async function saveProduct() {
  const name = document.getElementById('pName').value.trim();
  const sku  = document.getElementById('pSku').value.trim();
  const qty  = parseInt(document.getElementById('pQty').value);
  
  if (!name || !sku || isNaN(qty)) { toast('Fill in all required fields.', 'err'); return; }

  setSavingState('pmSaveBtn', true);
  const token = localStorage.getItem('token');

  try {
    // Default to CREATE (POST)
    let url = 'http://localhost:3000/api/products';
    let method = 'POST';

    // If editProdId exists, switch to UPDATE (PUT)
    if (editProdId) {
      url = `http://localhost:3000/api/products/${editProdId}`;
      method = 'PUT';
    }

    const response = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      // Hardcoding price to 0 to satisfy your backend requirement
      body: JSON.stringify({ name: name, sku: sku, stock_quantity: qty, price: 0 }) 
    });

    if (response.ok) {
      toast(editProdId ? `"${name}" updated.` : `"${name}" added.`);
      closePM();
      await refreshAll();
    } else {
      toast('Error saving product to database.', 'err');
    }
  } catch (error) {
    toast('Network error.', 'err');
  } finally {
    setSavingState('pmSaveBtn', false);
  }
}

async function confirmDelete() {
  setSavingState('delConfirmBtn', true);
  const token = localStorage.getItem('token');

  try {
    const response = await fetch(`http://localhost:3000/api/products/${delProdId}`, {
      method: 'DELETE',
      headers: { 
        'Authorization': `Bearer ${token}` 
      }
    });

    if (response.ok) {
      toast('Product deleted.', 'err');
      closeDel();
      await refreshAll();
    } else {
      toast('Failed to delete product.', 'err');
    }
  } catch (error) {
    toast('Network error.', 'err');
  } finally {
    setSavingState('delConfirmBtn', false);
  }
}

// ============================================================
//  STOCK MOVEMENT  (mock)
// ============================================================
async function saveMovement() {
  const qty = parseInt(document.getElementById('smQty').value);
  if (!qty || qty < 1) { toast('Enter a valid quantity.', 'err'); return; }
  
  const product = products.find(p => p.id === mvProdId);
  if (mvType === 'DISPATCH' && qty > product.stock_quantity) {
    toast(`Cannot dispatch ${qty}. Only ${product.stock_quantity} in stock.`, 'err'); return;
  }
  
  setSavingState('smSaveBtn', true);
  const token = localStorage.getItem('token');

  // Calculate the new stock number
  const newQty = mvType === 'RESTOCK' 
    ? product.stock_quantity + qty 
    : product.stock_quantity - qty;

  try {
    const response = await fetch(`http://localhost:3000/api/products/${mvProdId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      // Sending back the existing name/sku, but with the updated stock number
      body: JSON.stringify({ 
        name: product.name, 
        sku: product.sku, 
        stock_quantity: newQty, 
        price: product.price || 0 
      })
    });

    if (response.ok) {
      const txnRes = await fetch('http://localhost:3000/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: mvProdId, action_type: mvType, quantity: qty }),
      });
      // #region agent log
      fetch('http://127.0.0.1:7728/ingest/f75f4bd3-c1c1-4dc9-9ac4-67d89466a261',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8dd7e0'},body:JSON.stringify({sessionId:'8dd7e0',location:'app.js:saveMovement',message:'stock PUT and txn POST',data:{mvType,qty,txnOk:txnRes.ok,txnStatus:txnRes.status},timestamp:Date.now(),hypothesisId:'D',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      toast(`${mvType}: ${qty} units for "${product.name}".`);
      closeSM();
      await refreshAll();
    } else {
      toast('Error updating stock.', 'err');
    }
  } catch (error) {
    toast('Network error.', 'err');
  } finally {
    setSavingState('smSaveBtn', false);
  }
}

// ============================================================
//  RENDER — STATS
// ============================================================
function getStatus(p) {
  if (p.stock_quantity <= 0)              return 'out';
  if (p.stock_quantity <= lowThreshold)  return 'low';
  return 'active';
}
function statusBadge(s) {
  if (s === 'active') return `<span class="badge b-active">In Stock</span>`;
  if (s === 'low')    return `<span class="badge b-low">Low Stock</span>`;
  return `<span class="badge b-out">Out of Stock</span>`;
}

function renderStats() {
  const totalQty = products.reduce((s, p) => s + p.stock_quantity, 0);
  const low      = products.filter(p => getStatus(p) !== 'active').length;
  document.getElementById('stTotal').textContent    = products.length;
  document.getElementById('stTotalQty').textContent = totalQty.toLocaleString();
  document.getElementById('stLow').textContent      = low;
  document.getElementById('stTxns').textContent     = transactions.length;
  document.getElementById('lowBadge').textContent   = low;
  document.getElementById('lowBadge').style.display = low ? '' : 'none';
}

// ============================================================
//  RENDER — PRODUCTS TABLE
// ============================================================
function getProdFiltered() {
  let d = [...products];
  if (prodFilter !== 'all') d = d.filter(p => getStatus(p) === prodFilter);
  if (searchQ) { const q = searchQ.toLowerCase(); d = d.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)); }
  if (prodSort === 'name')       d.sort((a, b) => a.name.localeCompare(b.name));
  if (prodSort === 'stock_asc')  d.sort((a, b) => a.stock_quantity - b.stock_quantity);
  if (prodSort === 'stock_desc') d.sort((a, b) => b.stock_quantity - a.stock_quantity);
  return d;
}

function renderProdTable() {
  const filtered = getProdFiltered();
  const total    = filtered.length;
  const start    = (prodPage - 1) * PP;
  const page     = filtered.slice(start, start + PP);
  const maxQty   = Math.max(...products.map(p => p.stock_quantity), 1);
  const isAdmin  = currentRole === 'admin';

  document.getElementById('prodSub').textContent = `${total} product${total !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('prodBody');
  if (!page.length) {
    tbody.innerHTML = `<tr class="ld-row"><td colspan="5" style="color:var(--text3)">No products found</td></tr>`;
  } else {
    tbody.innerHTML = page.map(p => {
      const st  = getStatus(p);
      const pct = Math.min((p.stock_quantity / maxQty) * 100, 100);
      const bc  = st === 'active' ? '#00e5a0' : st === 'low' ? '#ffa502' : '#ff4757';
      return `<tr>
        <td><div class="item-cell">
          <div class="item-thumb">${prodEmoji(p.name)}</div>
          <div><div class="item-name">${esc(p.name)}</div></div>
        </div></td>
        <td><span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--text2)">${esc(p.sku)}</span></td>
        <td><div class="qty-cell">
          <span style="font-family:'DM Mono',monospace;min-width:34px">${p.stock_quantity}</span>
          <div class="qty-bar"><div class="qty-fill" style="width:${pct}%;background:${bc}"></div></div>
        </div></td>
        <td>${statusBadge(st)}</td>
        <td><div class="acts" style="justify-content:flex-end">
          <button class="act-btn r" title="RESTOCK"  onclick="openStockModal('${p.id}','RESTOCK')">📥</button>
          <button class="act-btn s" title="DISPATCH" onclick="openStockModal('${p.id}','DISPATCH')">📤</button>
          ${isAdmin ? `<button class="act-btn e" title="Edit"   onclick="openProductModal('edit','${p.id}')">✏️</button>
          <button class="act-btn d" title="Delete" onclick="openDel('${p.id}')">🗑</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  }
  document.getElementById('prodInfo').textContent = `${start + 1}–${Math.min(start + PP, total)} of ${total}`;
  renderPages('prodPg', Math.ceil(total / PP), prodPage, n => { prodPage = n; renderProdTable(); });
}

// ============================================================
//  RENDER — TRANSACTIONS TABLE
// ============================================================
function getTxnFiltered() {
  let d = [...transactions];
  if (txnFilter !== 'all') d = d.filter(t => t.action_type === txnFilter);
  return d;
}

function renderTxnTable() {
  const filtered = getTxnFiltered();
  const total    = filtered.length;
  const start    = (txnPage - 1) * PP;
  const page     = filtered.slice(start, start + PP);

  const tbody = document.getElementById('txnBody');
  if (!page.length) {
    tbody.innerHTML = `<tr class="ld-row"><td colspan="5" style="color:var(--text3)">No transactions yet</td></tr>`;
  } else {
    tbody.innerHTML = page.map(t => {
      const isR   = t.action_type === 'RESTOCK';
      const pName = t.products?.name || t.product_id;
      const uEmail= t.users?.email   || t.user_id;
      const ts    = t.created_at ? new Date(t.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      return `<tr>
        <td><div class="item-cell">
          <div class="item-thumb" style="font-size:13px">${prodEmoji(pName)}</div>
          <div><div class="item-name">${esc(pName)}</div>
          </div>
        </div></td>
        <td><span class="badge ${isR ? 'b-restock' : 'b-dispatch'}">${t.action_type}</span></td>
        <td><span style="font-family:'DM Mono',monospace;font-size:14px;font-weight:600;color:${isR ? 'var(--accent)' : 'var(--accent3)'}">
          ${isR ? '+' : '−'}${t.quantity_changed ?? t.quantity ?? 0}
        </span></td>
        <td><div style="font-size:12px"><div>${esc(uEmail)}</div>
          </div></td>
        <td style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">${ts}</td>
      </tr>`;
    }).join('');
  }
  document.getElementById('txnInfo').textContent = `${start + 1}–${Math.min(start + PP, total)} of ${total}`;
  renderPages('txnPg', Math.ceil(total / PP), txnPage, n => { txnPage = n; renderTxnTable(); });
}

// ============================================================
//  RENDER — LOW STOCK VIEW
// ============================================================
function renderLowStock() {
  const low = products.filter(p => getStatus(p) !== 'active').sort((a, b) => a.stock_quantity - b.stock_quantity);

  document.getElementById('dashLow').innerHTML = low.length
    ? low.slice(0, 5).map(p => {
        const st = getStatus(p);
        return `<div class="stock-item">
          <div class="si-thumb">${prodEmoji(p.name)}</div>
          <div class="si-info"><div class="si-name">${esc(p.name)}</div><div class="si-sku">${p.sku}</div></div>
          <div class="si-qty ${st === 'out' ? 'crit' : 'low'}">${p.stock_quantity}</div>
        </div>`;
      }).join('')
    : '<p style="color:var(--text3);font-size:13px;text-align:center;padding:20px">✓ All items well stocked</p>';

  const tbody = document.getElementById('lowBody');
  if (!low.length) {
    tbody.innerHTML = `<tr class="ld-row"><td colspan="5" style="color:var(--accent)">✓ All products are sufficiently stocked!</td></tr>`;
  } else {
    tbody.innerHTML = low.map(p => {
      const st = getStatus(p);
      return `<tr>
        <td><div class="item-cell"><div class="item-thumb">${prodEmoji(p.name)}</div>
          <div><div class="item-name">${esc(p.name)}</div></div></div></td>
        <td style="font-family:'DM Mono',monospace;font-size:12px">${esc(p.sku)}</td>
        <td><span style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:${st === 'out' ? 'var(--danger)' : 'var(--warn)'}">
          ${p.stock_quantity}</span></td>
        <td>${statusBadge(st)}</td>
        <td><div class="acts" style="justify-content:flex-end">
          <button class="btn btn-restock btn-sm" onclick="openStockModal('${p.id}','RESTOCK')">📥 Restock</button>
        </div></td>
      </tr>`;
    }).join('');
  }
}

// ============================================================
//  RENDER — DASHBOARD TRANSACTIONS
// ============================================================
function renderDashTxns() {
  // #region agent log
  fetch('http://127.0.0.1:7728/ingest/f75f4bd3-c1c1-4dc9-9ac4-67d89466a261',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8dd7e0'},body:JSON.stringify({sessionId:'8dd7e0',location:'app.js:renderDashTxns',message:'renderDashTxns called',data:{count:transactions.length,sample:transactions[0]?{action_type:transactions[0].action_type,quantity_changed:transactions[0].quantity_changed,quantity:transactions[0].quantity,hasProducts:!!transactions[0].products}:null},timestamp:Date.now(),hypothesisId:'C,E'})}).catch(()=>{});
  // #endregion
  document.getElementById('dashTxns').innerHTML = transactions.slice(0, 6).map(t => {
    const isR   = t.action_type === 'RESTOCK';
    const pName = t.products?.name || '—';
    const uEmail= t.users?.email   || '—';
    const ts    = t.created_at ? new Date(t.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    return `<div class="txn-item">
      <div class="txn-dot ${isR ? 'restock' : 'dispatch'}">${isR ? '📥' : '📤'}</div>
      <div class="txn-body">
        <div class="txn-name">${esc(pName)}</div>
        <div class="txn-meta">${t.action_type} · by ${esc(uEmail)} · ${ts}</div>
      </div>
      <div class="txn-qty ${isR ? 'r' : 'd'}">${isR ? '+' : '−'}${t.quantity_changed ?? t.quantity ?? 0}</div>
    </div>`;
  }).join('') || '<p style="color:var(--text3);font-size:13px;text-align:center;padding:20px">No transactions yet</p>';
}

function updateTxnBadge() {
  const b = document.getElementById('txnBadge');
  if (transactions.length > 0) { b.style.display = ''; b.textContent = transactions.length; }
}

// ============================================================
//  MODALS
// ============================================================
function openProductModal(mode, id = null) {
  editProdId = null;
  if (mode === 'edit' && id) {
    editProdId = id;
    const p = products.find(x => x.id === id);
    document.getElementById('pmTitle').textContent = 'Edit Product';
    document.getElementById('pName').value = p.name;
    document.getElementById('pSku').value  = p.sku;
    document.getElementById('pQty').value  = p.stock_quantity;
  } else {
    document.getElementById('pmTitle').textContent = 'Add Product';
    ['pName','pSku','pQty'].forEach(i => document.getElementById(i).value = '');
  }
  document.getElementById('productModal').classList.add('open');
}
function closePM() { document.getElementById('productModal').classList.remove('open'); }

function openStockModal(productId, type = 'RESTOCK') {
  mvProdId = productId;
  const p = products.find(x => x.id === productId);
  document.getElementById('smProduct').innerHTML = `
    <div class="mv-thumb">${prodEmoji(p.name)}</div>
    <div class="mv-info">
      <div class="mv-name">${esc(p.name)}</div>
      <div class="mv-stock">Current stock: <b style="color:var(--accent)">${p.stock_quantity}</b> units · SKU: ${p.sku}</div>
    </div>`;
  document.getElementById('smQty').value = '';
  setMvType(type);
  document.getElementById('stockModal').classList.add('open');
}
function closeSM() { document.getElementById('stockModal').classList.remove('open'); }

function setMvType(type) {
  mvType = type;
  const rBtn = document.getElementById('typeRestock');
  const dBtn = document.getElementById('typeDispatch');
  rBtn.className = 'type-btn' + (type === 'RESTOCK' ? ' active-restock' : '');
  dBtn.className = 'type-btn' + (type === 'DISPATCH' ? ' active-dispatch' : '');
  document.getElementById('smTitle').textContent = type === 'RESTOCK' ? '📥 RESTOCK' : '📤 DISPATCH';
  document.getElementById('smNote').textContent  = type === 'RESTOCK'
    ? 'Stock will increase by the entered quantity.'
    : 'Stock will decrease by the entered quantity.';
}

function openDel(id) {
  delProdId = id;
  document.getElementById('delName').textContent = products.find(p => p.id === id)?.name;
  document.getElementById('deleteModal').classList.add('open');
}
function closeDel() { document.getElementById('deleteModal').classList.remove('open'); }

// ============================================================
//  VIEW SWITCHING
// ============================================================
const views = ['dashboard','products','transactions','lowstock','settings'];
function showView(name, navEl) {
  views.forEach(v => {
    document.getElementById('view-' + v).style.display = v === name ? '' : 'none';
  });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  navEl?.classList.add('active');
  document.getElementById('pageTitle').textContent =
    { dashboard: 'Dashboard', products: 'Products', transactions: 'Transactions', lowstock: 'Low Stock Alerts', settings: 'Settings' }[name];
  if (name === 'settings') populateSettings();
  document.getElementById('searchWrap').style.display = ['products','lowstock'].includes(name) ? '' : 'none';
  document.getElementById('addProductBtn').style.display = name === 'products' && currentRole === 'admin' ? '' : 'none';
}

// ============================================================
//  FILTERS / SORT
// ============================================================
function setProdFilter(el, v) { document.querySelectorAll('.f-chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); prodFilter = v; prodPage = 1; renderProdTable(); }
function setProdSort(v) { prodSort = v; renderProdTable(); }
function setTxnFilter(el, v) { document.querySelectorAll('#view-transactions .f-chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); txnFilter = v; txnPage = 1; renderTxnTable(); }
function onSearch() { searchQ = document.getElementById('searchQ').value; prodPage = 1; renderProdTable(); }

// ============================================================
//  PAGINATION
// ============================================================
function renderPages(containerId, total, current, cb) {
  const pg = document.getElementById(containerId);
  pg.innerHTML = '';
  if (total <= 1) return;
  for (let i = 1; i <= total; i++) {
    const b = document.createElement('div');
    b.className = 'pg-btn' + (i === current ? ' active' : '');
    b.textContent = i;
    b.onclick = () => cb(i);
    pg.appendChild(b);
  }
}

// ============================================================
//  UTILS
// ============================================================
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function setSavingState(btnId, on) {
  const b = document.getElementById(btnId);
  b.disabled = on;
  if (on) b.innerHTML = '<div class="spinner"></div> Saving...';
  else b.innerHTML = btnId === 'pmSaveBtn' ? '💾 Save Product' : btnId === 'smSaveBtn' ? '✅ Confirm & Save' : '🗑️ Delete';
}

function toast(msg, type = 'ok') {
  const tc = document.getElementById('tc');
  const t  = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : type === 'warn' ? ' warn' : '');
  t.innerHTML = `<span>${type === 'err' ? '❌' : type === 'warn' ? '⚠️' : '✅'}</span> ${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.style.animation = 'fadeOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3500);
}

// Close modals on overlay click
['productModal','stockModal','deleteModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById(id).classList.remove('open'); });
});


// ============================================================
//  PAGINATION ARROWS
// ============================================================
function prodPagePrev() { if (prodPage > 1) { prodPage--; renderProdTable(); } }
function prodPageNext() {
  const total = Math.ceil(getProdFiltered().length / PP);
  if (prodPage < total) { prodPage++; renderProdTable(); }
}
function txnPagePrev() { if (txnPage > 1) { txnPage--; renderTxnTable(); } }
function txnPageNext() {
  const total = Math.ceil(getTxnFiltered().length / PP);
  if (txnPage < total) { txnPage++; renderTxnTable(); }
}

function updateProdArrows() {
  const total = Math.ceil(getProdFiltered().length / PP);
  const prev = document.getElementById('prodPrev');
  const next = document.getElementById('prodNext');
  if (prev) prev.disabled = prodPage <= 1;
  if (next) next.disabled = prodPage >= total;
}
function updateTxnArrows() {
  const total = Math.ceil(getTxnFiltered().length / PP);
  const prev = document.getElementById('txnPrev');
  const next = document.getElementById('txnNext');
  if (prev) prev.disabled = txnPage <= 1;
  if (next) next.disabled = txnPage >= total;
}

// ============================================================
//  THEME
// ============================================================
function setTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  localStorage.setItem('theme', theme);
  document.getElementById('themeDark').classList.toggle('active',  theme === 'dark');
  document.getElementById('themeLight').classList.toggle('active', theme === 'light');
}

// ============================================================
//  SETTINGS
// ============================================================
function populateSettings() {
  document.getElementById('settingsEmail').textContent = currentUser?.email || '—';
  document.getElementById('settingsRole').textContent  = currentRole || '—';
  const saved = localStorage.getItem('theme') || 'dark';
  document.getElementById('themeDark').classList.toggle('active',  saved === 'dark');
  document.getElementById('themeLight').classList.toggle('active', saved === 'light');
  document.getElementById('thresholdInput').value = lowThreshold;
}

async function saveThreshold() {
  const val = parseInt(document.getElementById('thresholdInput').value);
  if (isNaN(val) || val < 1) { toast('Enter a valid threshold (min 1).', 'warn'); return; }
  lowThreshold = val;
  toast(`Low stock threshold set to ${val} units.`);
  await refreshAll();
}

// ============================================================
//  INIT
// ============================================================
