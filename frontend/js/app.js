// ── API BASE URL ─────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost'
  ? `http://localhost:${window.location.port || 3000}`
  : 'https://studyvault-api.onrender.com';

// ── ESCAPE HELPER (XSS) ──────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── FIREBASE AUTH ────────────────────────────────────
let currentUser = null;
let authToken = null;

firebase.auth().onAuthStateChanged(async (user) => {
  currentUser = user;
  if (user) {
    authToken = await user.getIdToken();
    updateNavAuth(true, user);
    // Register user in Firestore on first login
    await fetch(`${API_BASE}/api/users/me/register`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    }).catch(() => {});
    loadBookmarks();
    loadNotifications();
    checkAdmin();
    // Re-render cards to show bookmark stars (currentUser was null when cards first rendered)
    if (allPapers.length) renderCards(allPapers);
  } else {
    authToken = null;
    updateNavAuth(false);
    if (allPapers.length) renderCards(allPapers);
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
    const adminBtn = document.getElementById('profileAdminBtn');
    if (adminBtn) adminBtn.style.display = 'none';
  }
});

function updateNavAuth(signedIn, user) {
  const authEl = document.getElementById('navAuth');
  const bookmarksLi = document.querySelector('.nav-bookmark-li');
  const notifLi = document.getElementById('notifLi');
  if (signedIn && user) {
    const name = user.displayName || user.email || 'User';
    const initial = name.charAt(0).toUpperCase();
    if (authEl) authEl.innerHTML = `
      <button class="nav-avatar-btn" onclick="openProfileModal()">
        ${user.photoURL && /^https:\/\//i.test(user.photoURL)
          ? `<img src="${esc(user.photoURL)}" alt="" class="nav-avatar-img">`
          : `<div class="nav-avatar-circle">${esc(initial)}</div>`
        }
      </button>`;
    if (bookmarksLi) bookmarksLi.style.display = '';
    if (notifLi) notifLi.style.display = '';
  } else {
    if (authEl) authEl.innerHTML = `<button class="nav-btn" id="signInBtn" onclick="signInWithGoogle()">Sign In</button>`;
    if (bookmarksLi) bookmarksLi.style.display = 'none';
    if (notifLi) notifLi.style.display = 'none';
  }
}

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(err => {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Sign in failed. Try again.');
    }
  });
}

function signOut() {
  firebase.auth().signOut();
  const pm = document.getElementById('profileModal');
  if (pm) pm.classList.remove('open');
  showToast('Signed out successfully.');
}

async function getAuthToken() {
  if (currentUser) {
    return await currentUser.getIdToken();
  }
  return null;
}

// Check whether the signed-in user is an admin (for the discreet dashboard link).
async function checkAdmin() {
  if (!currentUser) return;
  const token = await getAuthToken();
  if (!token) return;
  const adminBtn = document.getElementById('profileAdminBtn');
  if (!adminBtn) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/check`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    adminBtn.style.display = res.ok ? 'inline-block' : 'none';
  } catch (e) { /* ignore */ }
}

// ── HAMBURGER MENU ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const navMenu   = document.getElementById('navMenu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      navMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
    });

    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        hamburger.classList.remove('active');
      });
    });
  }

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Close notification panel on outside click
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const bell  = document.getElementById('notifBell');
    if (!panel) return;
    if (panel.classList.contains('open') && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
      panel.classList.remove('open');
    }
  });
});

// ── NAV HELPERS ───────────────────────────────────────
function openContactModal() {
  const m = document.getElementById('contactModal');
  if (m) m.classList.add('open');
}

function goToReviews() {
  const el = document.getElementById('reviews');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.location.href = '/index.html#reviews';
  }
  return false;
}

// ── STATE ─────────────────────────────────────────────
let allPapers = [];
let currentChipCourse = '';
let bookmarkedIds = new Set();
let currentPage = 1;
let hasMore = false;
let isLoadingMore = false;
let currentQuery = '';
let searchTimer = null;
const PAPERS_PER_PAGE = 12;

// ── LOAD PAPERS FROM SERVER ───────────────────────────
function buildSearchParams(page = 1) {
  const params = new URLSearchParams();
  const q      = document.getElementById('searchInput')?.value.trim();
  const course = (document.getElementById('courseFilter')?.value) || currentChipCourse;
  const type   = document.getElementById('typeFilter')?.value;
  const year   = document.getElementById('yearFilter')?.value.trim();
  const univ   = document.getElementById('univFilter')?.value.trim();
  const sort   = document.getElementById('sortFilter')?.value;
  if (q)      params.set('search', q);
  if (course) params.set('course', course);
  if (type)   params.set('type', type);
  if (year)   params.set('year', year);
  if (univ)   params.set('university', univ);
  if (sort)   params.set('sort', sort);
  params.set('page', page);
  params.set('limit', PAPERS_PER_PAGE);
  return params;
}

async function fetchPage(query) {
  const res = await fetch(`${API_BASE}/api/papers?${query}`);
  if (!res.ok) throw new Error('Server error');
  return res.json();
}

async function loadPapers() {
  if (!document.getElementById('searchInput')) return;
  currentQuery = buildSearchParams(1).toString();
  const wakeTimer = setTimeout(() => {
    const area = document.getElementById('resultsArea');
    if (area && area.querySelector('.loading')) {
      area.innerHTML = '<div class="loading-wake">Server is waking up, please wait 30-60 seconds...</div>';
    }
  }, 4000);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const res = await fetch(`${API_BASE}/api/papers?${currentQuery}`, { signal: controller.signal });
    clearTimeout(timeout);
    clearTimeout(wakeTimer);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    allPapers = data.data || data;
    currentPage = 1;
    hasMore = !!(data.pagination && data.pagination.hasMore);
    const statEl = document.getElementById('statPapers');
    if (statEl) statEl.textContent = (data.pagination ? data.pagination.total : allPapers.length) + '+';
    renderCards(allPapers);
    updateLoadMore();
  } catch(e) {
    clearTimeout(wakeTimer);
    const area = document.getElementById('resultsArea');
    if (!area) return;
    if (e.name === 'AbortError') {
      area.innerHTML = '<div class="no-results">Server took too long to respond. <a href="#" onclick="loadPapers();return false;" style="color:var(--accent)">Try again</a></div>';
    } else {
      area.innerHTML = '<div class="no-results">Could not connect to server. <a href="#" onclick="loadPapers();return false;" style="color:var(--accent)">Try again</a></div>';
    }
  }
}

function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => performSearch(), 400);
}

async function performSearch() {
  if (!document.getElementById('resultsArea')) return;
  currentQuery = buildSearchParams(1).toString();
  const area = document.getElementById('resultsArea');
  area.innerHTML = '<div class="loading">Searching...</div>';
  try {
    const data = await fetchPage(currentQuery);
    allPapers = data.data || data;
    currentPage = 1;
    hasMore = !!(data.pagination && data.pagination.hasMore);
    const statEl = document.getElementById('statPapers');
    if (statEl) statEl.textContent = (data.pagination ? data.pagination.total : allPapers.length) + '+';
    renderCards(allPapers);
    updateLoadMore();
  } catch(e) {
    area.innerHTML = '<div class="no-results">Could not connect to server. <a href="#" onclick="performSearch();return false;" style="color:var(--accent)">Try again</a></div>';
  }
}

async function loadMorePapers() {
  if (isLoadingMore || !hasMore) return;
  isLoadingMore = true;
  const btn = document.getElementById('loadMoreBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }

  try {
    const params = new URLSearchParams(currentQuery || buildSearchParams(1).toString());
    params.set('page', currentPage + 1);
    const data = await fetchPage(params.toString());
    const more = data.data || [];
    allPapers = allPapers.concat(more);
    currentPage += 1;
    hasMore = !!(data.pagination && data.pagination.hasMore);
    const statEl = document.getElementById('statPapers');
    if (statEl && data.pagination) statEl.textContent = data.pagination.total + '+';
    renderCards(allPapers);
    updateLoadMore();
  } catch(e) {
    if (btn) btn.textContent = 'Load More';
  } finally {
    isLoadingMore = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Load More'; }
  }
}

function updateLoadMore() {
  const wrap = document.getElementById('loadMoreWrap');
  const btn = document.getElementById('loadMoreBtn');
  if (!wrap || !btn) return;
  const area = document.getElementById('resultsArea');
  const hasVisibleCards = area && area.querySelector('.results-grid');
  if (hasMore && hasVisibleCards) {
    wrap.style.display = 'block';
    btn.style.display = 'block';
  } else if (hasVisibleCards) {
    wrap.style.display = 'block';
    btn.style.display = 'none';
    const end = document.getElementById('loadMoreWrap').querySelector('.load-more-end');
    if (end) end.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

// ── RENDER CARDS ──────────────────────────────────────
function renderCards(data) {
  const area = document.getElementById('resultsArea');
  if (!area) return;
  if (!data || !data.length) {
    area.innerHTML = '<div class="no-results">No results found. Try a different search or upload the first one!</div>';
    return;
  }

  const typeBadge = { pyq: 'type-pyq', notes: 'type-notes', paper: 'type-paper', booklet: 'type-booklet' };
  const typeLabel = { pyq: 'PYQ', notes: 'Notes', paper: 'Model Paper', booklet: 'Booklet' };

  area.innerHTML = `<div class="results-grid">${data.map(p => {
    const safeURL = (p.downloadURL || '').replace(/'/g, "\\'");
    const course  = p.course || '';
    const univ    = p.university || 'Unknown University';
    const year    = p.year || '';
    const type    = p.type || 'pyq';
    const isBookmarked = bookmarkedIds.has(p.id);
    const tags    = p.tags || [];

    return `
    <div class="result-card">
      <div class="card-top">
        <div class="card-type ${typeBadge[type] || 'type-pyq'}">${typeLabel[type] || type}</div>
        ${currentUser ? `<button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="toggleBookmark('${p.id}', event)" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark this'}">
          ${isBookmarked ? '&#9733;' : '&#9734;'}
        </button>` : ''}
      </div>
      <div class="card-title">${esc(p.title)}</div>
      <div class="card-meta">${esc(univ)}${year ? ' · ' + esc(year) : ''}</div>
      <div class="card-footer">
        <div class="card-tags">
          ${course ? `<span class="tag">${esc(course)}</span>` : ''}
          ${tags.slice(0, 2).map(t => `<span class="tag tag-alt">${esc(t)}</span>`).join('')}
        </div>
        <div class="card-actions">
          <span class="dl-count" title="Downloads">${p.downloads || 0} &#11015;&#65039;</span>
          ${safeURL && (p.type === 'pyq' || p.type === 'notes' || p.type === 'paper')
            ? `<button class="preview-btn" data-url="${esc(safeURL)}" data-title="${esc(p.title || 'Preview')}" title="Preview">&#128065;</button>`
            : ''}
          ${safeURL
            ? `<a class="dl-btn" href="${esc(safeURL)}" target="_blank" rel="noopener" download onclick="trackDownload('${p.id}')">Download</a>`
            : `<button class="dl-btn" onclick="showToast('No file attached yet.')">Download</button>`
          }
        </div>
      </div>
      ${p.uploaderName ? `<div class="card-uploader">Uploaded by ${esc(p.uploaderName)}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ── SEARCH & FILTER ───────────────────────────────────
function setChip(el, course) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentChipCourse = course;
  const cf = document.getElementById('courseFilter');
  if (cf) cf.value = course;
  performSearch();
}

function setChipActive(course) {
  document.querySelectorAll('.chip').forEach(c => {
    const fn = c.getAttribute('onclick') || '';
    c.classList.toggle('active', fn.includes(`'${course}'`));
  });
}

// From the landing page, course cards navigate to the browse page.
function filterByCourse(course) {
  window.location.href = '/browse.html?course=' + encodeURIComponent(course);
}

// ── BOOKMARKS ────────────────────────────────────────
async function loadBookmarks() {
  if (!currentUser) return;
  const token = await getAuthToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/bookmarks`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    bookmarkedIds = new Set(data.map(b => b.paperId));
    // Re-render cards if they're visible
    if (allPapers.length) renderCards(allPapers);
  } catch(e) { /* ignore */ }
}

async function toggleBookmark(paperId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  if (!currentUser) {
    showToast('Please sign in to bookmark papers.');
    return;
  }
  const token = await getAuthToken();
  if (!token) return;

  const isBookmarked = bookmarkedIds.has(paperId);
  try {
    if (isBookmarked) {
      await fetch(`${API_BASE}/api/bookmarks/${paperId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      bookmarkedIds.delete(paperId);
      showToast('Bookmark removed.');
    } else {
      await fetch(`${API_BASE}/api/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ paperId })
      });
      bookmarkedIds.add(paperId);
      showToast('Paper bookmarked!');
    }
    if (allPapers.length) renderCards(allPapers);
  } catch(e) {
    showToast('Could not update bookmark.');
  }
}

async function showBookmarks() {
  if (!currentUser) { showToast('Please sign in first.'); return; }
  const token = await getAuthToken();
  if (!token) return;

  const modal = document.getElementById('bookmarksModal');
  const list = document.getElementById('bookmarksList');
  if (!modal || !list) return;
  modal.classList.add('open');

  try {
    const res = await fetch(`${API_BASE}/api/bookmarks`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.length) {
      list.innerHTML = '<div class="testimonial-loading">No bookmarks yet. Click the star on any paper to save it!</div>';
      return;
    }
    list.innerHTML = data.map(b => `
      <div class="modal-info-block" style="margin-bottom:0.5rem">
        <strong>${esc(b.title) || 'Untitled'}</strong><br>
        <span style="color:var(--muted);font-size:0.82rem">${esc(b.course || '')} ${b.university ? '· ' + esc(b.university) : ''}</span>
      </div>
    `).join('');
  } catch(e) {
    list.innerHTML = '<div class="testimonial-loading">Could not load bookmarks.</div>';
  }
}

// ── USER PROFILE ─────────────────────────────────────
async function openProfileModal() {
  if (!currentUser) return;
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.classList.add('open');

  const token = await getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/api/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    document.getElementById('profileName').textContent = data.name || 'User';
    document.getElementById('profileEmail').textContent = data.email || '';
    document.getElementById('statUploads').textContent = data.stats?.uploads || 0;
    document.getElementById('statBookmarks').textContent = data.stats?.bookmarks || 0;
    document.getElementById('statDownloads').textContent = data.stats?.totalDownloads || 0;

    const avatar = document.getElementById('profileAvatar');
    const pic = data.picture || '';
    if (pic && /^https:\/\//i.test(pic)) {
      avatar.innerHTML = `<img src="${esc(pic)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
      avatar.textContent = (data.name || 'U').charAt(0);
    }
  } catch(e) {
    document.getElementById('profileName').textContent = currentUser.displayName || 'User';
    document.getElementById('profileEmail').textContent = currentUser.email || '';
  }
}

// ── UPLOAD ────────────────────────────────────────────
function dragOver(e)  { e.preventDefault(); document.getElementById('dropzone').classList.add('drag-over'); }
function dragLeave()  { document.getElementById('dropzone').classList.remove('drag-over'); }

function dropFile(e) {
  e.preventDefault();
  dragLeave();
  const files = e.dataTransfer.files;
  if (files.length) {
    document.getElementById('fileInput').files = files;
    showFileChosen(files[0].name, files[0].size);
  }
}

function handleFile(input) {
  if (input.files[0]) showFileChosen(input.files[0].name, input.files[0].size);
}

function showFileChosen(name, size) {
  const el = document.getElementById('fileChosen');
  if (!el) return;
  const sizeTxt = size ? ` (${(size / (1024*1024)).toFixed(1)} MB)` : '';
  el.textContent = name + sizeTxt;
  if (size && size > 15 * 1024 * 1024) {
    el.style.color = '#ff6b6b';
    showToast(`File too large (${(size/(1024*1024)).toFixed(1)} MB). Max is 15 MB.`);
  } else {
    el.style.color = '';
    showToast(`"${name}" selected`);
  }
}

async function handleUpload() {
  const titleEl = document.getElementById('uploadTitle');
  if (!titleEl) return;
  if (!currentUser) {
    showToast('Please sign in to upload papers.');
    signInWithGoogle();
    return;
  }

  const title  = titleEl.value.trim();
  const course = document.getElementById('uploadCourse').value;
  const type   = document.getElementById('uploadType').value;
  const year   = document.getElementById('uploadYear').value.trim();
  const univ   = document.getElementById('uploadUniv').value.trim();
  const tags   = document.getElementById('uploadTags')?.value.trim() || '';
  const file   = document.getElementById('fileInput').files[0];

  if (!title)  { showToast('Please enter a title.'); return; }
  if (!course) { showToast('Please select a course.'); return; }
  if (!file)   { showToast('Please select a file to upload.'); return; }

  const MAX_SIZE_MB    = 15;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    showToast(`File too large (${(file.size/(1024*1024)).toFixed(1)} MB). Maximum is ${MAX_SIZE_MB} MB.`);
    return;
  }

  const token = await getAuthToken();
  if (!token) { showToast('Authentication error. Please sign in again.'); return; }

  const formData = new FormData();
  formData.append('file',       file);
  formData.append('title',      title);
  formData.append('course',     course);
  formData.append('type',       type);
  formData.append('year',       year);
  formData.append('university', univ);
  formData.append('tags',       tags);

  showToast('Uploading, please wait...');

  try {
    const res  = await fetch(`${API_BASE}/api/papers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('Thank you! Your upload has been sent for review. It will appear once approved.');
      titleEl.value                  = '';
      document.getElementById('uploadYear').value   = '';
      document.getElementById('uploadUniv').value   = '';
      document.getElementById('uploadCourse').value = '';
      document.getElementById('uploadType').value   = 'pyq';
      if (document.getElementById('uploadTags')) document.getElementById('uploadTags').value = '';
      document.getElementById('fileInput').value    = '';
      document.getElementById('fileChosen').textContent = '';
      loadMyUploads();
    } else {
      showToast('Upload failed: ' + (data.error || 'Unknown error'));
    }
  } catch(e) {
    showToast('Cannot reach server.');
  }
}

// ── MY UPLOADS (status page) ──────────────────────────
async function loadMyUploads() {
  const list = document.getElementById('myUploadsList');
  if (!list) return;
  if (!currentUser) {
    list.innerHTML = '<div class="no-results">Sign in to see the status of your uploads.</div>';
    return;
  }
  const token = await getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/api/users/me/uploads`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const papers = await res.json();
    if (!papers.length) {
      list.innerHTML = '<div class="no-results">You have not uploaded anything yet.</div>';
      return;
    }

    const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
    const typeLabel = { pyq: 'PYQ', notes: 'Notes', paper: 'Model Paper', booklet: 'Booklet' };

    list.innerHTML = papers.map(p => {
      const safeURL = (p.downloadURL || '').replace(/'/g, "\\'");
      return `
      <div class="upload-item">
        <div class="upload-item-main">
          <div class="upload-item-title">${esc(p.title) || 'Untitled'}</div>
          <div class="upload-item-meta">
            ${esc(typeLabel[p.type] || p.type || '')}
            ${p.course ? ' · ' + esc(p.course) : ''}
            ${p.year ? ' · ' + esc(p.year) : ''}
            ${p.university ? ' · ' + esc(p.university) : ''}
          </div>
        </div>
        <div class="upload-item-side">
          <span class="status-badge status-${esc(p.status || 'pending')}">${statusLabel[p.status] || esc(p.status || 'pending')}</span>
          <span class="dl-count">${p.downloads || 0} &#11015;&#65039;</span>
          ${p.status === 'approved' && safeURL
            ? `<a class="dl-btn" href="${esc(safeURL)}" target="_blank" rel="noopener" download onclick="trackDownload('${p.id}')">Download</a>`
            : ''}
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = '<div class="no-results">Could not load your uploads.</div>';
  }
}

// ── REVIEW MODAL ──────────────────────────────────────
let selectedStar = 0;
const starLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

function openReviewModal() {
  if (!currentUser) { showToast('Please sign in to leave a review.'); signInWithGoogle(); return; }
  const modal = document.getElementById('reviewModal');
  if (modal) modal.classList.add('open');
}
function closeReviewModal() {
  const modal = document.getElementById('reviewModal');
  if (!modal) return;
  modal.classList.remove('open');
  selectedStar = 0;
  renderStars(0);
  document.getElementById('starLabel').textContent = '';
}

function selectStar(val) {
  selectedStar = val;
  renderStars(val);
  document.getElementById('starLabel').textContent = starLabels[val];
}

function renderStars(val) {
  document.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.val) <= val);
  });
}

async function submitReview() {
  const name = document.getElementById('reviewName').value.trim();
  const msg  = document.getElementById('reviewMsg').value.trim();
  if (!selectedStar) { showToast('Please select a star rating.'); return; }
  if (!name)         { showToast('Please enter your name.'); return; }
  if (!msg)          { showToast('Please write a short review.'); return; }
  const token = await getAuthToken();
  if (!token) { showToast('Please sign in first.'); return; }
  try {
    const res  = await fetch(`${API_BASE}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name, message: msg, stars: selectedStar })
    });
    const data = await res.json();
    if (data.success) {
      closeReviewModal();
      document.getElementById('reviewName').value = '';
      document.getElementById('reviewMsg').value  = '';
      document.getElementById('reviewCharCount').textContent = '0 / 150';
      showToast('Thank you! Your review has been sent for review. It will appear once approved.');
      loadTestimonials(currentReviewSort);
    } else {
      showToast('Could not submit. Try again.');
    }
  } catch(e) { showToast('Could not reach server.'); }
}

// ── TESTIMONIALS ──────────────────────────────────────
let currentReviewSort = 'recent';

async function loadTestimonials(sort = 'recent') {
  const grid = document.getElementById('testimonialsGrid');
  if (!grid) return;
  currentReviewSort = sort;
  try {
    const res  = await fetch(`${API_BASE}/api/reviews?sort=${sort}&limit=6`);
    const data = await res.json();
    if (!data.length) {
      grid.innerHTML = '<div class="testimonial-loading">No reviews yet — be the first!</div>';
      return;
    }
    grid.innerHTML = data.map(r => `
      <div class="testimonial-card">
        <div class="testimonial-stars">${'&#9733;'.repeat(r.stars)}${'&#9734;'.repeat(5 - r.stars)}</div>
        <div class="testimonial-msg">"${esc(r.message)}"</div>
        <div class="testimonial-name">— ${esc(r.name)}</div>
      </div>
    `).join('');
  } catch(e) {
    grid.innerHTML = '<div class="testimonial-loading">Could not load reviews.</div>';
  }
}

function changeReviewSort(sort) {
  document.querySelectorAll('.review-sort-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sort === sort);
  });
  loadTestimonials(sort);
}

// ── PDF PREVIEW ───────────────────────────────────────
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.preview-btn');
  if (btn) openPreview(btn.dataset.url, btn.dataset.title);
});

function openPreview(url, title) {
  const modal = document.getElementById('previewModal');
  if (!modal) return;
  // Convert download URL to inline preview URL (remove fl_attachment)
  const previewUrl = url.replace('/fl_attachment/', '/');
  document.getElementById('previewFrame').src = previewUrl;
  document.getElementById('previewTitle').textContent = title || 'Preview';
  document.getElementById('previewDownload').href = url;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  const modal = document.getElementById('previewModal');
  if (!modal) return;
  document.getElementById('previewFrame').src = '';
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ── DOWNLOAD TRACKING ─────────────────────────────────
function trackDownload(paperId) {
  fetch(`${API_BASE}/api/papers/${paperId}/download`, { method: 'POST' }).catch(() => {});
}

// ── TOAST ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── FOOTER FEEDBACK ───────────────────────────────────
async function submitFooterFeedback() {
  const type = document.getElementById('feedbackType').value;
  const msg  = document.getElementById('feedbackMsg').value.trim();
  if (!msg) { showToast('Please write your feedback first.'); return; }
  try {
    const res  = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message: msg })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('feedbackType').value = '';
      document.getElementById('feedbackMsg').value  = '';
      showToast('Thanks for your feedback!');
    } else { showToast('Could not send. Try again.'); }
  } catch(e) { showToast('Could not reach server.'); }
}

// ── CONTACT FORM ──────────────────────────────────────
async function submitContact() {
  const name  = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const msg   = document.getElementById('contactMsg').value.trim();
  if (!name || !email || !msg) { showToast('Please fill in all fields.'); return; }
  try {
    const res  = await fetch(`${API_BASE}/api/feedback/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message: msg })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('contactModal').classList.remove('open');
      document.getElementById('contactName').value  = '';
      document.getElementById('contactEmail').value = '';
      document.getElementById('contactMsg').value   = '';
      showToast('Message sent! We\'ll reply within 48 hours.');
    } else { showToast('Could not send. Try again.'); }
  } catch(e) { showToast('Could not reach server.'); }
}

// ── UNIVERSITIES ──────────────────────────────────────
async function loadUniversities() {
  const grid = document.getElementById('universitiesGrid');
  if (!grid) return;
  try {
    const res = await fetch(`${API_BASE}/api/papers/universities`);
    const unis = await res.json();
    if (!unis.length) {
      grid.innerHTML = '<div class="testimonial-loading">No universities yet. Be the first to upload!</div>';
      return;
    }
    grid.innerHTML = unis.map(u => `
      <div class="course-card" onclick="filterByUniversity(decodeURIComponent('${encodeURIComponent(u.name).replace(/'/g, '%27')}'))">
        <span class="course-icon">&#127891;</span>
        <div class="course-name">${esc(u.name)}</div>
        <div class="course-count">${u.count} paper${u.count !== 1 ? 's' : ''}</div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = '<div class="testimonial-loading">Could not load universities.</div>';
  }
}

// University cards navigate to the browse page with the filter applied.
function filterByUniversity(uniName) {
  window.location.href = '/browse.html?university=' + encodeURIComponent(uniName);
}

// ── NOTIFICATIONS ─────────────────────────────────────
let notifData = [];
let notifUnread = 0;

async function loadNotifications() {
  if (!currentUser) return;
  const token = await getAuthToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    notifData = data.data || [];
    notifUnread = data.unread || 0;
  } catch(e) { /* ignore */ }
  updateNotifBadge();
  if (document.getElementById('notifPanel')?.classList.contains('open')) {
    renderNotifications();
  }
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  badge.textContent = notifUnread;
  badge.style.display = notifUnread > 0 ? 'flex' : 'none';
}

function toggleNotifPanel(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const willOpen = !panel.classList.contains('open');
  panel.classList.toggle('open', willOpen);
  if (willOpen) {
    loadNotifications();
    renderNotifications();
  }
}

function fmtNotifTime(t) {
  if (!t) return '';
  let ts = null;
  if (typeof t === 'object' && t.seconds != null)       ts = t.seconds * 1000;
  else if (typeof t === 'object' && t._seconds != null) ts = t._seconds * 1000;
  else if (typeof t === 'string')                       ts = Date.parse(t);
  if (!ts || isNaN(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)    return 'Just now';
  if (mins < 60)   return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7)    return days + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function renderNotifications() {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!notifData.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  list.innerHTML = notifData.map(n => `
    <div class="notif-item ${n.read ? 'read' : 'unread'}" onclick="clickNotif('${n.id}')">
      <div class="notif-item-title">${esc(n.title)}</div>
      <div class="notif-item-msg">${esc(n.message)}</div>
      <div class="notif-item-time">${fmtNotifTime(n.createdAt)}</div>
    </div>
  `).join('');
}

function clickNotif(id) {
  const n = notifData.find(x => x.id === id);
  markNotifRead(id);
  if (n && n.link) window.location.href = n.link;
}

async function markNotifRead(id) {
  const token = await getAuthToken();
  if (!token) return;
  const item = notifData.find(x => x.id === id);
  if (item && item.read) return;
  try {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const target = notifData.find(x => x.id === id);
    if (target) target.read = true;
    notifUnread = Math.max(0, notifUnread - 1);
    updateNotifBadge();
    renderNotifications();
  } catch(e) { /* ignore */ }
}

async function markAllNotifRead() {
  const token = await getAuthToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    notifData.forEach(n => { n.read = true; });
    notifUnread = 0;
    updateNotifBadge();
    renderNotifications();
  } catch(e) { /* ignore */ }
}

// ── LANDING STATS ─────────────────────────────────────
async function loadStatsCount() {
  const statEl = document.getElementById('statPapers');
  if (!statEl) return;
  try {
    const res = await fetch(`${API_BASE}/api/papers?limit=1`);
    const data = await res.json();
    if (data.pagination) statEl.textContent = data.pagination.total + '+';
  } catch(e) { /* keep placeholder */ }
}

// ── BROWSE PAGE URL PARAMS ────────────────────────────
function initBrowseFromURL() {
  const params = new URLSearchParams(window.location.search);
  const q     = params.get('q');
  const course = params.get('course');
  const type   = params.get('type');
  const year   = params.get('year');
  const univ   = params.get('university');
  const sort   = params.get('sort');
  if (q)     document.getElementById('searchInput').value = q;
  if (course) { document.getElementById('courseFilter').value = course; currentChipCourse = course; setChipActive(course); }
  if (type)   document.getElementById('typeFilter').value = type;
  if (year)   document.getElementById('yearFilter').value = year;
  if (univ)   document.getElementById('univFilter').value = univ;
  if (sort)   document.getElementById('sortFilter').value = sort;
}

// ── INIT ──────────────────────────────────────────────
if (document.getElementById('searchInput')) {
  initBrowseFromURL();
  loadPapers();
}
if (document.getElementById('testimonialsGrid')) loadTestimonials('recent');
if (document.getElementById('universitiesGrid')) loadUniversities();
if (document.getElementById('myUploadsList')) loadMyUploads();
loadStatsCount();

// Poll unread notification count every 60 seconds while signed in.
setInterval(() => {
  if (currentUser && document.getElementById('notifBell')) loadNotifications();
}, 60000);

// Infinite scroll — auto-load next page when sentinel is visible
if ('IntersectionObserver' in window) {
  const sentinel = document.getElementById('scrollSentinel');
  if (sentinel) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
        loadMorePapers();
      }
    }, { rootMargin: '300px' });
    observer.observe(sentinel);
  }
}
