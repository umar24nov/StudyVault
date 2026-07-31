const API_BASE = window.location.hostname === 'localhost'
  ? `http://localhost:${window.location.port || 3000}`
  : 'https://studyvault-api.onrender.com';

// ── ESCAPE HELPERS (XSS) ─────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let adminUser = null;
let adminToken = null;
let allAdminPapers = [];

// ── AUTH ──────────────────────────────────────────────
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    adminUser = user;
    adminToken = await user.getIdToken();
    // Verify admin access
    try {
      const res = await apiFetch('/api/admin/stats');
      if (!res.ok) {
        document.getElementById('authError').textContent = 'You do not have admin access.';
        firebase.auth().signOut();
        return;
      }
      document.getElementById('authGate').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
      document.getElementById('adminName').textContent = user.displayName || user.email;
      loadDashboard();
    } catch (e) {
      document.getElementById('authError').textContent = 'Failed to verify admin access.';
      firebase.auth().signOut();
    }
  } else {
    adminUser = null;
    adminToken = null;
    document.getElementById('authGate').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }
});

function adminSignIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(err => {
    if (err.code !== 'auth/popup-closed-by-user') {
      document.getElementById('authError').textContent = 'Sign in failed. Try again.';
    }
  });
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// ── DASHBOARD ─────────────────────────────────────────
async function loadDashboard() {
  await Promise.all([loadStats(), loadAdminPapers()]);
}

async function loadStats() {
  try {
    const res = await apiFetch('/api/admin/stats');
    const data = await res.json();
    document.getElementById('sTotalPapers').textContent = data.totalPapers || 0;
    document.getElementById('sPending').textContent = data.pendingCount || 0;
    document.getElementById('sDownloads').textContent = (data.totalDownloads || 0).toLocaleString();
    document.getElementById('sUsers').textContent = data.totalUsers || 0;
    document.getElementById('sReviews').textContent = data.totalReviews || 0;
    document.getElementById('sFeedback').textContent = (data.totalFeedback || 0) + (data.totalContacts || 0);
  } catch (e) {
    showToast('Failed to load stats.');
  }
}

// ── PAPERS ────────────────────────────────────────────
async function loadAdminPapers() {
  const status = document.getElementById('statusFilter').value;
  try {
    const res = await apiFetch(`/api/admin/papers?status=${status}`);
    allAdminPapers = await res.json();
    renderAdminPapers(allAdminPapers);
  } catch (e) {
    document.getElementById('papersTableBody').innerHTML =
      '<tr><td colspan="8" class="table-loading">Failed to load papers.</td></tr>';
  }
}

function filterAdminPapers() {
  const q = document.getElementById('paperSearch').value.toLowerCase().trim();
  const filtered = allAdminPapers.filter(p =>
    (p.title || '').toLowerCase().includes(q) ||
    (p.course || '').toLowerCase().includes(q) ||
    (p.university || '').toLowerCase().includes(q)
  );
  renderAdminPapers(filtered);
}

function renderAdminPapers(papers) {
  const tbody = document.getElementById('papersTableBody');
  if (!papers.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-loading">No papers found.</td></tr>';
    return;
  }
  tbody.innerHTML = papers.map(p => `
    <tr>
      <td class="table-title" title="${escAttr(p.title || '')}">${esc(p.title) || 'Untitled'}</td>
      <td>${esc(p.course) || '-'}</td>
      <td>${esc(p.type) || '-'}</td>
      <td>${esc(p.year) || '-'}</td>
      <td><span class="status-badge status-${esc(p.status) || 'pending'}">${esc(p.status) || 'pending'}</span></td>
      <td>${p.downloads || 0}</td>
      <td>${esc(p.uploaderName) || '-'}</td>
      <td>
        <div class="table-actions">
          <button class="btn-sm btn-edit" data-edit-id="${p.id}" data-title="${escAttr(p.title || '')}" data-type="${escAttr(p.type || '')}" data-course="${escAttr(p.course || '')}" data-univ="${escAttr(p.university || p.univ || '')}" data-year="${escAttr(p.year || '')}" onclick="openEditPaper(this)">Edit</button>
          ${p.status !== 'approved' ? `<button class="btn-sm btn-approve" onclick="approvePaper('${p.id}')">Approve</button>` : ''}
          ${p.status !== 'rejected' ? `<button class="btn-sm btn-reject" onclick="rejectPaper('${p.id}')">Reject</button>` : ''}
          <button class="btn-sm btn-delete" onclick="deletePaper('${p.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── EDIT PAPER ────────────────────────────────────────
let editingPaperId = null;

function openEditPaper(btn) {
  editingPaperId = btn.dataset.editId;
  document.getElementById('editTitle').value = btn.dataset.title;
  document.getElementById('editType').value  = btn.dataset.type;
  document.getElementById('editCourse').value = btn.dataset.course;
  document.getElementById('editUniv').value  = btn.dataset.univ;
  document.getElementById('editYear').value  = btn.dataset.year;
  document.getElementById('editPaperModal').classList.add('open');
}

function closeEditPaper() {
  editingPaperId = null;
  document.getElementById('editPaperModal').classList.remove('open');
}

async function saveEditPaper() {
  const title = document.getElementById('editTitle').value.trim();
  const type = document.getElementById('editType').value;
  const course = document.getElementById('editCourse').value;
  const university = document.getElementById('editUniv').value.trim();
  const year = document.getElementById('editYear').value.trim();
  if (!title || !course) { showToast('Title and course are required.'); return; }
  try {
    await apiFetch(`/api/admin/papers/${editingPaperId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type, course, university, year })
    });
    closeEditPaper();
    showToast('Paper updated.');
    loadDashboard();
  } catch (e) { showToast('Failed to update.'); }
}

async function approvePaper(id) {
  try {
    await apiFetch(`/api/admin/papers/${id}/approve`, { method: 'PATCH' });
    showToast('Paper approved.');
    loadDashboard();
  } catch (e) { showToast('Failed.'); }
}

async function rejectPaper(id) {
  try {
    await apiFetch(`/api/admin/papers/${id}/reject`, { method: 'PATCH' });
    showToast('Paper rejected.');
    loadDashboard();
  } catch (e) { showToast('Failed.'); }
}

async function deletePaper(id) {
  if (!confirm('Are you sure you want to delete this paper?')) return;
  try {
    await apiFetch(`/api/admin/papers/${id}`, { method: 'DELETE' });
    showToast('Paper deleted.');
    loadDashboard();
  } catch (e) { showToast('Failed.'); }
}

// ── TABS ──────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');

  document.getElementById('papersTab').classList.toggle('hidden', tab !== 'papers');
  document.getElementById('usersTab').classList.toggle('hidden', tab !== 'users');
  document.getElementById('reviewsTab').classList.toggle('hidden', tab !== 'reviews');
  document.getElementById('paperFilters').classList.toggle('hidden', tab !== 'papers');

  if (tab === 'users') loadAdminUsers();
  if (tab === 'reviews') loadAdminReviews();
}

async function loadAdminUsers() {
  try {
    const res = await apiFetch('/api/admin/users');
    const users = await res.json();
    const tbody = document.getElementById('usersTableBody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="table-loading">No users yet.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${esc(u.name) || '-'}</td>
        <td>${esc(u.email) || '-'}</td>
        <td>${u.joinedAt ? new Date(u.joinedAt.seconds * 1000).toLocaleDateString() : '-'}</td>
      </tr>
    `).join('');
  } catch (e) {
    document.getElementById('usersTableBody').innerHTML =
      '<tr><td colspan="3" class="table-loading">Failed to load users.</td></tr>';
  }
}

async function loadAdminReviews() {
  try {
    const res = await apiFetch('/api/admin/reviews');
    const reviews = await res.json();
    const tbody = document.getElementById('reviewsTableBody');
    if (!reviews.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No reviews yet.</td></tr>';
      return;
    }
    tbody.innerHTML = reviews.map(r => `
      <tr>
        <td>${esc(r.name) || '-'}</td>
        <td>${'&#9733;'.repeat(r.stars)}${'&#9734;'.repeat(5 - r.stars)}</td>
        <td class="table-title">${esc(r.message) || ''}</td>
        <td><span class="status-badge status-${esc(r.status) || 'pending'}">${esc(r.status) || 'pending'}</span></td>
        <td>
          <div class="table-actions">
            ${r.status !== 'approved' ? `<button class="btn-sm btn-approve" onclick="approveReview('${r.id}')">Approve</button>` : ''}
            ${r.status !== 'rejected' ? `<button class="btn-sm btn-reject" onclick="rejectReview('${r.id}')">Reject</button>` : ''}
            <button class="btn-sm btn-delete" onclick="deleteReview('${r.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    document.getElementById('reviewsTableBody').innerHTML =
      '<tr><td colspan="5" class="table-loading">Failed to load reviews.</td></tr>';
  }
}

async function approveReview(id) {
  try {
    await apiFetch(`/api/admin/reviews/${id}/approve`, { method: 'PATCH' });
    showToast('Review approved.');
    loadAdminReviews();
  } catch (e) { showToast('Failed.'); }
}

async function rejectReview(id) {
  try {
    await apiFetch(`/api/admin/reviews/${id}/reject`, { method: 'PATCH' });
    showToast('Review rejected.');
    loadAdminReviews();
  } catch (e) { showToast('Failed.'); }
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await apiFetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
    showToast('Review deleted.');
    loadAdminReviews();
  } catch (e) { showToast('Failed.'); }
}

// ── TOAST ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
