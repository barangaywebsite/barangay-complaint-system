// script.js - Full UI, functionality and integration
// Replace with your deployed Apps Script Web App URL:
const API_URL = "https://script.google.com/macros/s/AKfycbzfCMZlCRRkpmmz-_a1dE5brdmBLtcV-3MejWZpEvC4-6TZHlv_WPecjLob8YSL4n5Q/exec"; // <-- PUT WEB APP URL HERE

// Utilities
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = (prefix='id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;

async function apiGetAll() {
  const res = await fetch(API_URL + '?action=getAll');
  return res.json();
}

async function apiPost(action, payload) {
  const body = { action };
  if(payload !== undefined) body.record = payload;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function apiUploadImage(filename, base64Data) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'uploadImage', filename, base64: base64Data })
  });
  return res.json();
}

// App state
let allRecords = [];
let currentUser = null;
let currentTab = 'complaints';
let adminSubTab = 'complaints';
let darkMode = false;

// Helpers
const USERS = () => allRecords.filter(r => r.__sheet_type === 'accounts');
const COMPLAINTS = () => allRecords.filter(r => r.__sheet_type === 'complaints');
const VOTES = () => allRecords.filter(r => r.__sheet_type === 'votes');
const ANNOUNCEMENTS = () => allRecords.filter(r => r.__sheet_type === 'announcements').sort((a,b)=>new Date(b.date)-new Date(a.date));
const OFFICIALS = () => allRecords.filter(r => r.__sheet_type === 'officials');
const HOTLINES = () => allRecords.filter(r => r.__sheet_type === 'hotlines');
const HOUSEHOLDS = () => allRecords.filter(r => r.__sheet_type === 'households');

function hasUserVoted(complaintId, userId) {
  return VOTES().some(v => v.complaint_id === complaintId && v.user_id === userId);
}

function formatDateISO(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString();
  } catch(e) { return dateStr; }
}

function showToast(msg, type='info') {
  const id = uid('toast');
  const el = document.createElement('div');
  el.id = id;
  el.className = 'fixed right-4 top-4 z-50 p-4 rounded-lg text-white font-semibold';
  el.style.background = type === 'success' ? '#16a34a' : type === 'error' ? '#ef4444' : '#2563eb';
  el.innerText = msg;
  document.body.appendChild(el);
  setTimeout(()=> {
    el.style.transition = 'opacity 0.35s';
    el.style.opacity = '0';
    setTimeout(()=> el.remove(), 350);
  }, 3000);
}

// Load data
async function loadAllRecords() {
  try {
    const res = await apiGetAll();
    if (res && res.result === 'OK') {
      allRecords = res.data || [];
      renderUI();
    } else {
      console.error('Failed to load data', res);
      showToast('Failed to load data from server', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('Error connecting to server', 'error');
  }
}

// Auth handlers
async function handleSignup(form) {
  const fd = new FormData(form);
  const username = fd.get('username').trim();
  const password = fd.get('password');
  const full_name = fd.get('full_name') || '';
  const admin_id = fd.get('admin_id') || '';
  const type = fd.get('user_type') || 'resident';

  if (!username || !password) { showToast('Provide username and password', 'error'); return; }

  if (USERS().some(u => u.username === username)) { showToast('Username exists', 'error'); return; }

  const userData = {
    __sheet_type: 'accounts',
    __user_id: uid('user'),
    username, password, full_name,
    user_type: type,
    admin_id: type === 'admin' ? admin_id : '',
    created_at: new Date().toISOString()
  };

  const result = await apiPost('create', userData);
  if (result && result.result === 'OK') {
    showToast('Account created', 'success');
    await loadAllRecords();
    switchTo('login');
  } else {
    showToast('Failed to create account', 'error');
  }
}

function authenticate(username, password, type='resident', admin_id='') {
  const u = USERS().find(user => user.username === username && user.password === password && user.user_type === type && (type !== 'admin' || user.admin_id === admin_id));
  return u || null;
}

function handleLogin(form) {
  const fd = new FormData(form);
  const username = fd.get('username').trim();
  const password = fd.get('password');
  const user_type = fd.get('user_type') || 'resident';
  const admin_id = fd.get('admin_id') || '';

  const user = authenticate(username, password, user_type, admin_id);
  if (!user) { showToast('Invalid credentials', 'error'); return; }
  currentUser = user;
  showToast('Welcome, ' + (user.full_name || user.username), 'success');
  currentTab = 'complaints';
  renderUI();
}

// Main UI render
function renderUI() {
  if (darkMode) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');

  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <header class="py-4 shadow-sm card">
      <div class="container flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="text-2xl font-bold text-primary">🏘️ Barangay Portal</div>
          <div class="text-sm text-muted hide-sm">${currentUser ? 'Welcome, ' + (currentUser.full_name || currentUser.username) : 'Community complaints & services'}</div>
        </div>
        <div class="flex items-center gap-3">
          <button id="dark-toggle" class="px-3 py-2 rounded-md border" title="Toggle dark mode">${darkMode ? '<i class="fa fa-moon"></i>' : '<i class="fa fa-sun"></i>'}</button>
          ${currentUser ? `<button id="logout-btn" class="px-3 py-2 rounded-md border">Logout</button>` : ''}
        </div>
      </div>
    </header>

    <main class="container py-6">
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside class="col-span-1">
          ${renderSidebar()}
        </aside>

        <section class="col-span-3">
          <div id="content-area">
            ${renderContent()}
          </div>
        </section>
      </div>
    </main>

    <footer class="text-center py-6 text-sm text-muted">© Barangay Complaint System</footer>

    <div id="modals"></div>
  `;

  document.getElementById('dark-toggle').addEventListener('click', ()=>{ darkMode = !darkMode; localStorage.setItem('darkMode', darkMode); renderUI(); });
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', ()=> { currentUser = null; renderUI(); showToast('Logged out', 'success'); });

  attachContentListeners();
}

function renderSidebar() {
  const isAdmin = currentUser && currentUser.user_type === 'admin';
  return `
    <div class="card p-4">
      <nav class="flex flex-col gap-2">
        <button class="text-left w-full px-3 py-2 rounded ${currentTab==='complaints' ? 'bg-slate-100' : ''}" onclick="switchTo('complaints')">Complaints</button>
        ${!isAdmin ? `<button class="text-left w-full px-3 py-2 rounded ${currentTab==='submit' ? 'bg-slate-100' : ''}" onclick="switchTo('submit')">Submit Complaint</button>` : ''}
        <button class="text-left w-full px-3 py-2 rounded ${currentTab==='announcements' ? 'bg-slate-100' : ''}" onclick="switchTo('announcements')">Announcements</button>
        <button class="text-left w-full px-3 py-2 rounded ${currentTab==='officials' ? 'bg-slate-100' : ''}" onclick="switchTo('officials')">Officials</button>
        <button class="text-left w-full px-3 py-2 rounded ${currentTab==='hotlines' ? 'bg-slate-100' : ''}" onclick="switchTo('hotlines')">Emergency Hotlines</button>
        <button class="text-left w-full px-3 py-2 rounded ${currentTab==='households' ? 'bg-slate-100' : ''}" onclick="switchTo('households')">Households</button>
        ${isAdmin ? `<hr class="my-2"/><div class="text-xs font-semibold mb-2">Admin</div>
          <button class="text-left w-full px-3 py-2 rounded ${currentTab==='admin' && adminSubTab==='complaints' ? 'bg-slate-100' : ''}" onclick="openAdminSub('complaints')">Manage Complaints</button>
          <button class="text-left w-full px-3 py-2 rounded ${currentTab==='admin' && adminSubTab==='announcements' ? 'bg-slate-100' : ''}" onclick="openAdminSub('announcements')">Manage Announcements</button>
          <button class="text-left w-full px-3 py-2 rounded ${currentTab==='admin' && adminSubTab==='officials' ? 'bg-slate-100' : ''}" onclick="openAdminSub('officials')">Manage Officials</button>
          <button class="text-left w-full px-3 py-2 rounded ${currentTab==='admin' && adminSubTab==='hotlines' ? 'bg-slate-100' : ''}" onclick="openAdminSub('hotlines')">Manage Hotlines</button>
          <button class="text-left w-full px-3 py-2 rounded ${currentTab==='admin' && adminSubTab==='households' ? 'bg-slate-100' : ''}" onclick="openAdminSub('households')">Manage Households</button>
          <button class="text-left w-full px-3 py-2 rounded ${currentTab==='admin' && adminSubTab==='reports' ? 'bg-slate-100' : ''}" onclick="openAdminSub('reports')">Reports</button>
        ` : ''}
      </nav>
    </div>
  `;
}

function renderContent() {
  if (!currentUser) {
    return renderAuthPanel();
  }
  if (currentUser.user_type === 'admin') {
    if (currentTab === 'admin') {
      return renderAdminContent();
    } else {
      return renderPublicContent();
    }
  }
  return renderPublicContent();
}

function renderAuthPanel() {
  return `
    <div class="card p-6">
      <h2 class="text-xl font-semibold mb-4">Sign In or Register</h2>
      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <h3 class="font-semibold mb-2">Login</h3>
          <form id="login-form" class="flex flex-col gap-3">
            <input name="username" placeholder="Username" class="p-2 border rounded" required />
            <input name="password" type="password" placeholder="Password" class="p-2 border rounded" required />
            <select name="user_type" class="p-2 border rounded">
              <option value="resident">Resident</option>
              <option value="admin">Admin</option>
            </select>
            <input name="admin_id" placeholder="Admin ID (if admin)" class="p-2 border rounded" />
            <button class="mt-2 px-4 py-2 bg-primary text-white rounded">Login</button>
          </form>
        </div>
        <div>
          <h3 class="font-semibold mb-2">Sign Up</h3>
          <form id="signup-form" class="flex flex-col gap-3">
            <input name="full_name" placeholder="Full name" class="p-2 border rounded" />
            <input name="username" placeholder="Username" class="p-2 border rounded" required />
            <input name="password" type="password" placeholder="Password" class="p-2 border rounded" required />
            <select name="user_type" class="p-2 border rounded">
              <option value="resident">Resident</option>
              <option value="admin">Admin</option>
            </select>
            <input name="admin_id" placeholder="Admin ID (if admin)" class="p-2 border rounded" />
            <button class="mt-2 px-4 py-2 bg-primary text-white rounded">Create Account</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

// The rest of the UI rendering and functions (complaints, admin, modals, file uploads, charts)
// For brevity in this file, we reuse functions from earlier full implementation but ensure they exist
// Minimal implementations follow for core functionality:

function renderComplaintsList() {
  const list = COMPLAINTS().sort((a,b)=> (Number(b.upvotes||0) - Number(a.upvotes||0)));
  return `
    <div class="card p-4">
      <div class="flex justify-between items-center mb-3">
        <h2 class="text-xl font-semibold">Community Complaints</h2>
        <div class="flex gap-2">
          <select id="filter-category" class="p-2 border rounded">
            <option value="all">All Categories</option>
            ${['Roads','Garbage Collection','Noise/Disturbance','Drainage','Security','Lighting','Other'].map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          <button onclick="openReportModal()" class="px-3 py-2 border rounded">Generate Report</button>
        </div>
      </div>
      <div id="complaints-grid" class="grid gap-4">
        ${list.map(c=>renderComplaintCard(c)).join('') || '<p>No complaints yet.</p>'}
      </div>
    </div>
  `;
}

function renderComplaintCard(c) {
  const voted = currentUser ? hasUserVoted(c.__complaint_id, currentUser.__user_id) : false;
  return `
    <div class="card p-4 flex flex-col md:flex-row md:justify-between gap-3">
      <div>
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-semibold">${escapeHtml(c.title || '')}</h3>
          <span class="text-sm px-2 py-1 rounded" style="background:${getStatusColor(c.status)}; color: white;">${getStatusLabel(c.status)}</span>
        </div>
        <p class="mt-2 text-sm text-muted">${escapeHtml(c.description || '')}</p>
        ${c.image_url ? `<div class="mt-2"><img src="${c.image_url}" alt="evidence" class="max-h-48 rounded" /></div>` : ''}
        <p class="mt-2 text-xs text-muted">By ${escapeHtml(c.resident_name || 'Anonymous')} • ${formatDateISO(c.created_at)}</p>
      </div>
      <div class="flex flex-col items-start md:items-end justify-between gap-2">
        <div class="flex items-center gap-2">
          <button onclick="upvoteComplaint('${c.__complaint_id}')" class="px-3 py-2 rounded border ${voted ? 'opacity-60 cursor-not-allowed' : ''}" ${voted ? 'disabled' : ''}>
            👍 ${c.upvotes || 0}
          </button>
        </div>
        ${currentUser && currentUser.user_type === 'admin' ? `<div><select onchange="adminUpdateStatus('${c.__complaint_id}', this.value)" class="p-2 border rounded">
          <option value="submitted" ${c.status==='submitted'?'selected':''}>Submitted</option>
          <option value="under_review" ${c.status==='under_review'?'selected':''}>Under Review</option>
          <option value="assigned" ${c.status==='assigned'?'selected':''}>Assigned</option>
          <option value="in_progress" ${c.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="resolved" ${c.status==='resolved'?'selected':''}>Resolved</option>
        </select></div>` : ''}
      </div>
    </div>
  `;
}

function getStatusColor(status) {
  const map = { submitted:'#94a3b8', under_review:'#60a5fa', assigned:'#a78bfa', in_progress:'#fb923c', resolved:'#34d399' };
  return map[status] || '#94a3b8';
}
function getStatusLabel(status) {
  const map = { submitted:'Submitted', under_review:'Under Review', assigned:'Assigned', in_progress:'In Progress', resolved:'Resolved' };
  return map[status] || status;
}

function renderSubmitForm() {
  if (!currentUser) return `<div class="card p-4">Please login to submit a complaint.</div>`;
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold">Submit New Complaint</h2>
      <form id="complaint-form" class="grid gap-3 mt-3">
        <input name="title" placeholder="Title" class="p-2 border rounded" required />
        <select name="category" class="p-2 border rounded">
          ${['Roads','Garbage Collection','Noise/Disturbance','Drainage','Security','Lighting','Other'].map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
        <textarea name="description" rows="4" class="p-2 border rounded" placeholder="Details..."></textarea>
        <input name="location" placeholder="Location (optional)" class="p-2 border rounded" />
        <div class="flex items-center gap-2">
          <input type="file" name="evidence" id="evidence-file" accept="image/*" />
          <button type="button" id="upload-preview" class="px-3 py-2 border rounded">Upload & Preview</button>
        </div>
        <img id="evidence-preview" class="max-h-48 mt-2 hidden rounded" />
        <button class="px-4 py-2 bg-primary text-white rounded">Submit Complaint</button>
      </form>
    </div>
  `;
}

function renderAnnouncements() {
  const list = ANNOUNCEMENTS();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold">Announcements</h2>
      <div class="mt-4 space-y-3">
        ${list.map(a=>`
          <div class="p-3 border rounded">
            <div class="flex justify-between">
              <strong>${escapeHtml(a.announcement_title)}</strong>
              <small class="text-muted">${new Date(a.date).toLocaleDateString()}</small>
            </div>
            <p class="mt-2 text-sm">${escapeHtml(a.content)}</p>
          </div>
        `).join('') || '<p>No announcements.'}
      </div>
    </div>
  `;
}

function renderOfficialsList() {
  const list = OFFICIALS();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold">Barangay Officials</h2>
      <div class="mt-4 space-y-3">
        ${list.map(o=>`
          <div class="p-3 border rounded">
            <div class="flex justify-between">
              <strong>${escapeHtml(o.official_name)}</strong>
              <span class="text-primary">${escapeHtml(o.position)}</span>
            </div>
            <p class="mt-2 text-sm">Contact: <a href="mailto:${o.contact}" class="text-muted">${o.contact}</a></p>
          </div>
        `).join('') || '<p>No officials yet.</p>'}
      </div>
    </div>
  `;
}

function renderHotlinesList() {
  const list = HOTLINES();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold">Emergency Hotlines</h2>
      <div class="mt-4 space-y-3">
        ${list.map(h=>`
          <div class="p-3 border rounded flex justify-between items-center">
            <div>
              <strong>🚨 ${escapeHtml(h.service_name)}</strong>
              <div class="text-sm">${escapeHtml(h.hotline_description)}</div>
              <div class="text-xs text-muted">Hours: ${escapeHtml(h.available_hours)}</div>
            </div>
            <div>
              <a href="tel:${h.phone_number}" class="px-3 py-2 bg-primary text-white rounded">${h.phone_number}</a>
            </div>
          </div>
        `).join('') || '<p>No hotlines yet.</p>'}
      </div>
    </div>
  `;
}

function renderHouseholds() {
  const list = HOUSEHOLDS();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold">Households</h2>
      <div class="mt-4 space-y-3">
        ${list.map(h=>`
          <div class="p-3 border rounded">
            <strong>${escapeHtml(h.head_of_household)}</strong>
            <div class="text-sm">${escapeHtml(h.address)}</div>
            <div class="text-xs text-muted">Phone: ${escapeHtml(h.phone)}</div>
          </div>
        `).join('') || '<p>No households recorded.</p>'}
      </div>
    </div>
  `;
}

function renderAdminContent() {
  switch(adminSubTab) {
    case 'complaints': return renderAdminComplaints();
    case 'announcements': return renderAdminAnnouncementsManager();
    case 'officials': return renderAdminOfficialsManager();
    case 'hotlines': return renderAdminHotlinesManager();
    case 'households': return renderAdminHouseholdsManager();
    case 'reports': return renderAdminReports();
    default: return renderAdminComplaints();
  }
}

function renderAdminComplaints() {
  const list = COMPLAINTS();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold mb-3">Manage Complaints</h2>
      <div class="space-y-3">
        ${list.map(c => `
          <div class="p-3 border rounded flex justify-between items-center">
            <div>
              <strong>${escapeHtml(c.title)}</strong>
              <div class="text-xs text-muted">${escapeHtml(c.resident_name)} • ${formatDateISO(c.created_at)}</div>
            </div>
            <div class="flex items-center gap-2">
              <select onchange="adminUpdateStatus('${c.__complaint_id}', this.value)" class="p-2 border rounded">
                <option value="submitted" ${c.status==='submitted'?'selected':''}>Submitted</option>
                <option value="under_review" ${c.status==='under_review'?'selected':''}>Under Review</option>
                <option value="assigned" ${c.status==='assigned'?'selected':''}>Assigned</option>
                <option value="in_progress" ${c.status==='in_progress'?'selected':''}>In Progress</option>
                <option value="resolved" ${c.status==='resolved'?'selected':''}>Resolved</option>
              </select>
              <button onclick="openComplaintDetails('${c.__complaint_id}')" class="px-3 py-2 border rounded">Details</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAdminAnnouncementsManager() {
  const list = ANNOUNCEMENTS();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold mb-3">Manage Announcements</h2>
      <button onclick="openAnnouncementModal()" class="px-3 py-2 bg-primary text-white rounded mb-3">Create Announcement</button>
      <div class="space-y-3">
        ${list.map(a=>`
          <div class="p-3 border rounded flex justify-between items-center">
            <div>
              <strong>${escapeHtml(a.announcement_title)}</strong>
              <div class="text-xs text-muted">${new Date(a.date).toLocaleDateString()}</div>
            </div>
            <div class="flex gap-2">
              <button onclick="startEditAnnouncement('${a.__announcement_id}')" class="px-3 py-2 border rounded">Edit</button>
              <button onclick="deleteRecord('${a.__announcement_id}')" class="px-3 py-2 border rounded text-red-600">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAdminOfficialsManager() {
  const list = OFFICIALS();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold mb-3">Manage Officials</h2>
      <button onclick="openOfficialModal()" class="px-3 py-2 bg-primary text-white rounded mb-3">Add Official</button>
      <div class="space-y-3">${list.map(o=>`
        <div class="p-3 border rounded flex justify-between items-center">
          <div><strong>${escapeHtml(o.official_name)}</strong><div class="text-xs text-muted">${escapeHtml(o.position)}</div></div>
          <div class="flex gap-2">
            <button onclick="startEditOfficial('${o.__official_id}')" class="px-3 py-2 border rounded">Edit</button>
            <button onclick="deleteRecord('${o.__official_id}')" class="px-3 py-2 border rounded text-red-600">Delete</button>
          </div>
        </div>
      `).join('')}</div>
    </div>
  `;
}

function renderAdminHotlinesManager() {
  const list = HOTLINES();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold mb-3">Manage Hotlines</h2>
      <button onclick="openHotlineModal()" class="px-3 py-2 bg-primary text-white rounded mb-3">Add Hotline</button>
      <div class="space-y-3">
        ${list.map(h=>`
          <div class="p-3 border rounded flex justify-between items-center">
            <div><strong>${escapeHtml(h.service_name)}</strong><div class="text-xs">${escapeHtml(h.hotline_description)}</div></div>
            <div class="flex gap-2">
              <button onclick="startEditHotline('${h.__hotline_id}')" class="px-3 py-2 border rounded">Edit</button>
              <button onclick="deleteRecord('${h.__hotline_id}')" class="px-3 py-2 border rounded text-red-600">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAdminHouseholdsManager() {
  const list = HOUSEHOLDS();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold mb-3">Manage Households</h2>
      <button onclick="openHouseholdModal()" class="px-3 py-2 bg-primary text-white rounded mb-3">Add Household</button>
      <div class="space-y-3">
        ${list.map(h=>`
          <div class="p-3 border rounded flex justify-between items-center">
            <div><strong>${escapeHtml(h.head_of_household)}</strong><div class="text-xs">${escapeHtml(h.address)}</div></div>
            <div class="flex gap-2">
              <button onclick="startEditHousehold('${h.__household_id}')" class="px-3 py-2 border rounded">Edit</button>
              <button onclick="deleteRecord('${h.__household_id}')" class="px-3 py-2 border rounded text-red-600">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAdminReports() {
  const stats = generateReportData();
  return `
    <div class="card p-4">
      <h2 class="text-xl font-semibold mb-3">Reports</h2>
      <div class="grid md:grid-cols-2 gap-4">
        <div class="p-4 border rounded">
          <canvas id="statusChart" width="400" height="320"></canvas>
        </div>
        <div class="p-4 border rounded">
          <h3 class="font-semibold">Summary</h3>
          <p>Total complaints: ${stats.total}</p>
          ${Object.keys(stats.statusCounts).map(k=>`<div class="flex justify-between"><span>${getStatusLabel(k)}</span><strong>${stats.statusCounts[k]}</strong></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// Data actions (create/update/delete/upload)
async function submitComplaint(form) {
  const fd = new FormData(form);
  const title = fd.get('title') || '';
  const description = fd.get('description') || '';
  const category = fd.get('category') || 'Other';
  const location = fd.get('location') || '';
  const fileInput = document.querySelector('#evidence-file');

  let imageUrl = '';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const base64 = await fileToBase64(file);
    const ext = (file.name.split('.').pop() || 'png');
    const filename = uid('evidence') + '.' + ext;
    const uploadRes = await apiUploadImage(filename, base64);
    if (uploadRes && uploadRes.url) {
      imageUrl = uploadRes.url;
    } else {
      showToast('Image upload failed', 'error');
    }
  }

  const complaint = {
    __sheet_type: 'complaints',
    __complaint_id: uid('complaint'),
    title, description, category, status: 'submitted', upvotes: '0',
    image_url: imageUrl,
    created_at: new Date().toISOString(),
    resident_name: currentUser.full_name || currentUser.username,
    user_id: currentUser.__user_id,
    location
  };

  const res = await apiPost('create', complaint);
  if (res && res.result === 'OK') {
    showToast('Complaint submitted', 'success');
    document.getElementById('complaint-form')?.reset();
    await loadAllRecords();
    switchTo('complaints');
  } else {
    showToast('Failed to submit complaint', 'error');
  }
}

async function upvoteComplaint(cid) {
  if (!currentUser) { showToast('Please login to vote', 'error'); return; }
  if (hasUserVoted(cid, currentUser.__user_id)) { showToast('You already voted', 'error'); return; }

  const vote = {
    __sheet_type: 'votes',
    __vote_id: uid('vote'),
    complaint_id: cid,
    user_id: currentUser.__user_id,
    created_at: new Date().toISOString()
  };

  const vres = await apiPost('create', vote);
  if (vres && vres.result === 'OK') {
    const complaint = COMPLAINTS().find(c=>c.__complaint_id === cid);
    const updated = { ...complaint, upvotes: String(Number(complaint.upvotes || 0) + 1) };
    const ures = await apiPost('update', updated);
    if (ures && ures.result === 'OK') {
      showToast('Upvoted', 'success');
      await loadAllRecords();
    } else {
      showToast('Failed to update upvote', 'error');
    }
  } else showToast('Failed to record vote', 'error');
}

async function adminUpdateStatus(cid, status) {
  const complaint = COMPLAINTS().find(c=>c.__complaint_id === cid);
  if (!complaint) return;
  const updated = { ...complaint, status };
  const res = await apiPost('update', updated);
  if (res && res.result === 'OK') {
    showToast('Status updated', 'success');
    await loadAllRecords();
  } else showToast('Failed to update', 'error');
}

async function deleteRecord(idValue) {
  const res = await apiPost('delete', { __id_value: idValue });
  if (res && res.result === 'OK') {
    showToast('Deleted', 'success');
    await loadAllRecords();
  } else {
    showToast('Delete failed', 'error');
  }
}

async function createAnnouncement(payload) {
  const record = {
    __sheet_type: 'announcements',
    __announcement_id: uid('announcement'),
    announcement_title: payload.announcement_title,
    content: payload.content,
    priority: payload.priority,
    date: payload.date,
    created_at: new Date().toISOString()
  };
  const res = await apiPost('create', record);
  if (res && res.result === 'OK') { showToast('Announcement created', 'success'); await loadAllRecords(); } else showToast('Failed', 'error');
}

async function createOfficial(payload) {
  const record = { __sheet_type:'officials', __official_id: uid('official'), official_name: payload.official_name, position: payload.position, contact: payload.contact, created_at: new Date().toISOString() };
  const res = await apiPost('create', record);
  if (res && res.result==='OK') { showToast('Official added', 'success'); await loadAllRecords(); } else showToast('Error', 'error');
}
async function createHotline(payload) {
  const record = { __sheet_type:'hotlines', __hotline_id: uid('hotline'), service_name: payload.service_name, phone_number: payload.phone_number, hotline_description: payload.hotline_description, available_hours: payload.available_hours, created_at: new Date().toISOString() };
  const res = await apiPost('create', record);
  if (res && res.result==='OK') { showToast('Hotline added', 'success'); await loadAllRecords(); } else showToast('Error', 'error');
}
async function createHousehold(payload) {
  const record = { __sheet_type:'households', __household_id: uid('household'), head_of_household: payload.head_of_household, address: payload.address, phone: payload.phone, created_at: new Date().toISOString() };
  const res = await apiPost('create', record);
  if (res && res.result==='OK') { showToast('Household added', 'success'); await loadAllRecords(); } else showToast('Error', 'error');
}

function switchTo(tab) { currentTab = tab; renderUI(); }
function openAdminSub(sub) { currentTab = 'admin'; adminSubTab = sub; renderUI(); }
async function openComplaintDetails(id) {
  const c = COMPLAINTS().find(x => x.__complaint_id === id);
  if (!c) return;
  const html = `
    <div class="p-4">
      <h3 class="font-semibold">${escapeHtml(c.title)}</h3>
      <p class="text-sm mt-2">${escapeHtml(c.description)}</p>
      ${c.image_url ? `<img src="${c.image_url}" class="max-h-64 mt-3 rounded" />` : ''}
      <div class="mt-3 text-xs text-muted">By ${escapeHtml(c.resident_name)} • ${formatDateISO(c.created_at)}</div>
    </div>
  `;
  showModal('Complaint Details', html);
}

function openReportModal() {
  const html = `<div class="p-4"><canvas id="reportCanvas" width="600" height="400"></canvas></div>`;
  showModal('Complaints Report', html, ()=>{
    renderStatusChart();
  });
}

function showModal(title, html, onShown) {
  const modalId = uid('modal');
  const modals = document.getElementById('modals');
  modals.innerHTML = `
    <div id="${modalId}" class="fixed inset-0 flex items-center justify-center modal-backdrop z-50">
      <div class="modal card p-4 relative">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-semibold">${escapeHtml(title)}</h3>
          <button onclick="document.getElementById('${modalId}').remove()" class="px-2 py-1 rounded border">Close</button>
        </div>
        <div>${html}</div>
      </div>
    </div>
  `;
  if (onShown) setTimeout(onShown, 100);
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

async function renderStatusChart() {
  const stats = generateReportData();
  const ctx = document.getElementById('reportCanvas').getContext('2d');
  const labels = Object.keys(stats.statusCounts).map(k=>getStatusLabel(k));
  const data = Object.keys(stats.statusCounts).map(k=>stats.statusCounts[k]);
  new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: ['#94a3b8','#60a5fa','#a78bfa','#fb923c','#34d399'] }] }
  });
}

function generateReportData() {
  const complaints = COMPLAINTS();
  const counts = { submitted:0, under_review:0, assigned:0, in_progress:0, resolved:0 };
  complaints.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++; });
  return { statusCounts: counts, total: complaints.length };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = e => reject(e);
    reader.readAsDataURL(file);
  });
}

function attachContentListeners() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.onsubmit = (e) => { e.preventDefault(); handleLogin(e.target); };
  }
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.onsubmit = (e) => { e.preventDefault(); handleSignup(e.target); };
  }
  const complaintForm = document.getElementById('complaint-form');
  if (complaintForm) {
    complaintForm.onsubmit = (e)=>{ e.preventDefault(); submitComplaint(e.target); };
    const fileBtn = document.getElementById('upload-preview');
    if (fileBtn) {
      fileBtn.onclick = async () => {
        const fileInput = document.getElementById('evidence-file');
        const preview = document.getElementById('evidence-preview');
        if (fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          const base64 = await fileToBase64(file);
          preview.src = base64;
          preview.classList.remove('hidden');
        } else {
          showToast('Choose file first', 'error');
        }
      };
    }
  }
  const catFilter = document.getElementById('filter-category');
  if (catFilter) {
    catFilter.onchange = (e) => {
      const v = e.target.value;
      const all = COMPLAINTS();
      const filtered = v === 'all' ? all : all.filter(c=>c.category===v);
      const grid = document.getElementById('complaints-grid');
      grid.innerHTML = filtered.map(renderComplaintCard).join('');
    };
  }
}

function startEditAnnouncement(id) {
  const a = ANNOUNCEMENTS().find(x=>x.__announcement_id===id);
  if (!a) return;
  const html = `
    <form id="edit-ann-form" class="grid gap-2">
      <input name="title" value="${escapeHtml(a.announcement_title)}" class="p-2 border rounded" />
      <textarea name="content" class="p-2 border rounded">${escapeHtml(a.content)}</textarea>
      <select name="priority" class="p-2 border rounded">
        <option value="normal" ${a.priority==='normal'?'selected':''}>Notice</option>
        <option value="high" ${a.priority==='high'?'selected':''}>High</option>
        <option value="emergency" ${a.priority==='emergency'?'selected':''}>Emergency</option>
      </select>
      <input type="date" name="date" value="${a.date ? a.date.split('T')[0] : ''}" class="p-2 border rounded" />
      <div class="flex gap-2">
        <button type="submit" class="px-3 py-2 bg-primary text-white rounded">Save</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Edit Announcement', html, ()=> {
    document.getElementById('edit-ann-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updated = { ...a, announcement_title: fd.get('title'), content: fd.get('content'), priority: fd.get('priority'), date: fd.get('date') };
      await apiPost('update', updated);
      document.getElementById('modals').innerHTML = '';
      await loadAllRecords();
    };
  });
}

function openAnnouncementModal() {
  const html = `
    <form id="new-ann-form" class="grid gap-2">
      <input name="title" placeholder="Title" class="p-2 border rounded" required />
      <textarea name="content" placeholder="Content" class="p-2 border rounded" required></textarea>
      <select name="priority" class="p-2 border rounded">
        <option value="normal">Notice</option>
        <option value="high">High</option>
        <option value="emergency">Emergency</option>
      </select>
      <input type="date" name="date" class="p-2 border rounded" value="${(new Date()).toISOString().split('T')[0]}" />
      <div class="flex gap-2">
        <button class="px-3 py-2 bg-primary text-white rounded">Create</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Create Announcement', html, ()=> {
    document.getElementById('new-ann-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await createAnnouncement({ announcement_title: fd.get('title'), content: fd.get('content'), priority: fd.get('priority'), date: fd.get('date') });
      document.getElementById('modals').innerHTML = '';
    };
  });
}

function startEditOfficial(id) {
  const o = OFFICIALS().find(x=>x.__official_id===id);
  if (!o) return;
  const html = `
    <form id="edit-off-form" class="grid gap-2">
      <input name="name" value="${escapeHtml(o.official_name)}" class="p-2 border rounded" />
      <input name="position" value="${escapeHtml(o.position)}" class="p-2 border rounded" />
      <input name="contact" value="${escapeHtml(o.contact)}" class="p-2 border rounded" />
      <div class="flex gap-2">
        <button class="px-3 py-2 bg-primary text-white rounded">Save</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Edit Official', html, ()=> {
    document.getElementById('edit-off-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updated = { ...o, official_name: fd.get('name'), position: fd.get('position'), contact: fd.get('contact') };
      await apiPost('update', updated);
      document.getElementById('modals').innerHTML = '';
      await loadAllRecords();
    };
  });
}

function startEditHotline(id) {
  const h = HOTLINES().find(x=>x.__hotline_id===id);
  if (!h) return;
  const html = `
    <form id="edit-hot-form" class="grid gap-2">
      <input name="service_name" value="${escapeHtml(h.service_name)}" class="p-2 border rounded" />
      <input name="phone_number" value="${escapeHtml(h.phone_number)}" class="p-2 border rounded" />
      <textarea name="description" class="p-2 border rounded">${escapeHtml(h.hotline_description)}</textarea>
      <input name="hours" value="${escapeHtml(h.available_hours)}" class="p-2 border rounded" />
      <div class="flex gap-2">
        <button class="px-3 py-2 bg-primary text-white rounded">Save</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Edit Hotline', html, ()=> {
    document.getElementById('edit-hot-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updated = { ...h, service_name: fd.get('service_name'), phone_number: fd.get('phone_number'), hotline_description: fd.get('description'), available_hours: fd.get('hours') };
      await apiPost('update', updated);
      document.getElementById('modals').innerHTML = '';
      await loadAllRecords();
    };
  });
}

function startEditHousehold(id) {
  const hh = HOUSEHOLDS().find(x=>x.__household_id===id);
  if (!hh) return;
  const html = `
    <form id="edit-hh-form" class="grid gap-2">
      <input name="head" value="${escapeHtml(hh.head_of_household)}" class="p-2 border rounded" />
      <input name="address" value="${escapeHtml(hh.address)}" class="p-2 border rounded" />
      <input name="phone" value="${escapeHtml(hh.phone)}" class="p-2 border rounded" />
      <div class="flex gap-2">
        <button class="px-3 py-2 bg-primary text-white rounded">Save</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Edit Household', html, ()=> {
    document.getElementById('edit-hh-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updated = { ...hh, head_of_household: fd.get('head'), address: fd.get('address'), phone: fd.get('phone') };
      await apiPost('update', updated);
      document.getElementById('modals').innerHTML = '';
      await loadAllRecords();
    };
  });
}

function openOfficialModal() {
  const html = `
    <form id="new-off-form" class="grid gap-2">
      <input name="name" placeholder="Full name" class="p-2 border rounded" />
      <input name="position" placeholder="Position" class="p-2 border rounded" />
      <input name="contact" placeholder="Contact email" class="p-2 border rounded" />
      <div class="flex gap-2">
        <button class="px-3 py-2 bg-primary text-white rounded">Add</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Add Official', html, ()=> {
    document.getElementById('new-off-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await createOfficial({ official_name: fd.get('name'), position: fd.get('position'), contact: fd.get('contact') });
      document.getElementById('modals').innerHTML = '';
    };
  });
}

function openHotlineModal() {
  const html = `
    <form id="new-hot-form" class="grid gap-2">
      <input name="service_name" placeholder="Service Name" class="p-2 border rounded" />
      <input name="phone_number" placeholder="Phone Number" class="p-2 border rounded" />
      <textarea name="description" placeholder="Description" class="p-2 border rounded"></textarea>
      <input name="available_hours" placeholder="Available hours" class="p-2 border rounded" />
      <div class="flex gap-2">
        <button class="px-3 py-2 bg-primary text-white rounded">Add</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Add Hotline', html, ()=> {
    document.getElementById('new-hot-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await createHotline({ service_name: fd.get('service_name'), phone_number: fd.get('phone_number'), hotline_description: fd.get('description'), available_hours: fd.get('available_hours') });
      document.getElementById('modals').innerHTML = '';
    };
  });
}

function openHouseholdModal() {
  const html = `
    <form id="new-hh-form" class="grid gap-2">
      <input name="head" placeholder="Head of Household" class="p-2 border rounded" />
      <input name="address" placeholder="Address" class="p-2 border rounded" />
      <input name="phone" placeholder="Phone" class="p-2 border rounded" />
      <div class="flex gap-2">
        <button class="px-3 py-2 bg-primary text-white rounded">Add</button>
        <button type="button" onclick="document.getElementById('modals').innerHTML=''" class="px-3 py-2 border rounded">Cancel</button>
      </div>
    </form>
  `;
  showModal('Add Household', html, ()=> {
    document.getElementById('new-hh-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await createHousehold({ head_of_household: fd.get('head'), address: fd.get('address'), phone: fd.get('phone') });
      document.getElementById('modals').innerHTML = '';
    };
  });
}

// initialization
(async function init() {
  if (localStorage.getItem('darkMode') === 'true') darkMode = true;
  await loadAllRecords();
})();
