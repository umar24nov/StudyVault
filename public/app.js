// ── API BASE URL ─────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost'
  ? `http://localhost:${window.location.port || 3000}`
  : 'https://studyvault-api.onrender.com';

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
    document.getElementById('navAdminLi').style.display = '';
    // Re-render cards to show bookmark stars (currentUser was null when cards first rendered)
    if (allPapers.length) performSearch();
  } else {
    authToken = null;
    updateNavAuth(false);
    if (allPapers.length) performSearch();
    const adminLink = document.getElementById('navAdmin');
    if (adminLink) adminLink.style.display = 'none';
  }
});

function updateNavAuth(signedIn, user) {
  const authEl = document.getElementById('navAuth');
  const bookmarksLink = document.getElementById('navBookmarks');
  if (signedIn && user) {
    const name = user.displayName || user.email || 'User';
    const initial = name.charAt(0).toUpperCase();
    authEl.innerHTML = `
      <button class="nav-avatar-btn" onclick="openProfileModal()">
        ${user.photoURL
          ? `<img src="${user.photoURL}" alt="" class="nav-avatar-img">`
          : `<div class="nav-avatar-circle">${initial}</div>`
        }
      </button>`;
    if (bookmarksLink) bookmarksLink.parentElement.style.display = '';
  } else {
    authEl.innerHTML = `<button class="nav-btn" id="signInBtn" onclick="signInWithGoogle()">Sign In</button>`;
    if (bookmarksLink) bookmarksLink.parentElement.style.display = 'none';
    const adminLi = document.getElementById('navAdminLi');
    if (adminLi) adminLi.style.display = 'none';
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
  document.getElementById('profileModal').classList.remove('open');
  showToast('Signed out successfully.');
}

async function getAuthToken() {
  if (currentUser) {
    return await currentUser.getIdToken();
  }
  return null;
}

// ── HAMBURGER MENU ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const navMenu   = document.getElementById('navMenu');

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

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
});

// ── STATE ─────────────────────────────────────────────
let allPapers = [];
let currentChipCourse = '';
let bookmarkedIds = new Set();

// ── LOAD PAPERS FROM SERVER ───────────────────────────
async function loadPapers() {
  const wakeTimer = setTimeout(() => {
    const area = document.getElementById('resultsArea');
    if (area && area.querySelector('.loading')) {
      area.innerHTML = '<div class="loading-wake">Server is waking up, please wait 30-60 seconds...</div>';
    }
  }, 4000);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const res = await fetch(`${API_BASE}/api/papers`, { signal: controller.signal });
    clearTimeout(timeout);
    clearTimeout(wakeTimer);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    allPapers = data.data || data;
    const statEl = document.getElementById('statPapers');
    if (statEl) statEl.textContent = allPapers.length + '+';
    performSearch();
  } catch(e) {
    clearTimeout(wakeTimer);
    const area = document.getElementById('resultsArea');
    if (e.name === 'AbortError') {
      area.innerHTML = '<div class="no-results">Server took too long to respond. <a href="#" onclick="loadPapers();return false;" style="color:var(--accent)">Try again</a></div>';
    } else {
      area.innerHTML = '<div class="no-results">Could not connect to server. <a href="#" onclick="loadPapers();return false;" style="color:var(--accent)">Try again</a></div>';
    }
  }
}

// ── RENDER CARDS ──────────────────────────────────────
function renderCards(data) {
  const area = document.getElementById('resultsArea');
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
      <div class="card-title">${p.title || 'Untitled'}</div>
      <div class="card-meta">${univ}${year ? ' · ' + year : ''}</div>
      <div class="card-footer">
        <div class="card-tags">
          ${course ? `<span class="tag">${course}</span>` : ''}
          ${tags.slice(0, 2).map(t => `<span class="tag tag-alt">${t}</span>`).join('')}
        </div>
        <div class="card-actions">
          <span class="dl-count" title="Downloads">${p.downloads || 0} &#11015;&#65039;</span>
          ${safeURL && (p.type === 'pyq' || p.type === 'notes' || p.type === 'paper')
            ? `<button class="preview-btn" onclick="openPreview('${safeURL.replace(/\\/g, '\\\\')}', '${(p.title || 'Preview').replace(/'/g, "\\'")}')" title="Preview">&#128065;</button>`
            : ''}
          ${safeURL
            ? `<a class="dl-btn" href="${safeURL}" target="_blank" rel="noopener" download onclick="trackDownload('${p.id}')">Download</a>`
            : `<button class="dl-btn" onclick="showToast('No file attached yet.')">Download</button>`
          }
        </div>
      </div>
      ${p.uploaderName ? `<div class="card-uploader">Uploaded by ${p.uploaderName}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ── SEARCH & FILTER ───────────────────────────────────
function performSearch() {
  const q      = document.getElementById('searchInput').value.toLowerCase().trim();
  const course = document.getElementById('courseFilter').value || currentChipCourse;
  const type   = document.getElementById('typeFilter').value;

  const filtered = allPapers.filter(p => {
    const matchQ = !q
      || (p.title      || '').toLowerCase().includes(q)
      || (p.course     || '').toLowerCase().includes(q)
      || (p.university || '').toLowerCase().includes(q)
      || (p.year       || '').includes(q)
      || (p.tags       || []).some(t => t.toLowerCase().includes(q));
    const matchC = !course || (p.course || '').toLowerCase() === course.toLowerCase();
    const matchT = !type   || p.type === type;
    return matchQ && matchC && matchT;
  });

  renderCards(filtered);
}

function setChip(el, course) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentChipCourse = course;
  document.getElementById('courseFilter').value = course;
  performSearch();
}

function filterByCourse(course) {
  currentChipCourse = course;
  document.getElementById('courseFilter').value = course;
  document.querySelectorAll('.chip').forEach(c => {
    const fn = c.getAttribute('onclick') || '';
    c.classList.toggle('active', fn.includes(`'${course}'`));
  });
  document.getElementById('search').scrollIntoView({ behavior: 'smooth' });
  performSearch();
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
    if (allPapers.length) performSearch();
  } catch(e) { /* ignore */ }
}

async function toggleBookmark(paperId, event) {
  event.stopPropagation();
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
    performSearch();
  } catch(e) {
    showToast('Could not update bookmark.');
  }
}

async function showBookmarks() {
  if (!currentUser) { showToast('Please sign in first.'); return; }
  const token = await getAuthToken();
  if (!token) return;

  document.getElementById('bookmarksModal').classList.add('open');
  const list = document.getElementById('bookmarksList');

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
        <strong>${b.title || 'Untitled'}</strong><br>
        <span style="color:var(--muted);font-size:0.82rem">${b.course || ''} ${b.university ? '· ' + b.university : ''}</span>
      </div>
    `).join('');
  } catch(e) {
    list.innerHTML = '<div class="testimonial-loading">Could not load bookmarks.</div>';
  }
}

// ── USER PROFILE ─────────────────────────────────────
async function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profileModal').classList.add('open');

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
    if (data.picture) {
      avatar.innerHTML = `<img src="${data.picture}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
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
  const sizeTxt = size ? ` (${(size / (1024*1024)).toFixed(1)} MB)` : '';
  const el = document.getElementById('fileChosen');
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
  if (!currentUser) {
    showToast('Please sign in to upload papers.');
    signInWithGoogle();
    return;
  }

  const title  = document.getElementById('uploadTitle').value.trim();
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
      showToast('Thank you! Your contribution has been submitted for review.');
      document.getElementById('uploadTitle').value      = '';
      document.getElementById('uploadYear').value       = '';
      document.getElementById('uploadUniv').value       = '';
      document.getElementById('uploadCourse').value     = '';
      document.getElementById('uploadType').value       = 'pyq';
      if (document.getElementById('uploadTags')) document.getElementById('uploadTags').value = '';
      document.getElementById('fileInput').value        = '';
      document.getElementById('fileChosen').textContent = '';
      loadPapers();
    } else {
      showToast('Upload failed: ' + (data.error || 'Unknown error'));
    }
  } catch(e) {
    showToast('Cannot reach server.');
  }
}

// ── REVIEW MODAL ──────────────────────────────────────
let selectedStar = 0;
const starLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

function openReviewModal() {
  if (!currentUser) { showToast('Please sign in to leave a review.'); signInWithGoogle(); return; }
  document.getElementById('reviewModal').classList.add('open');
}
function closeReviewModal() {
  document.getElementById('reviewModal').classList.remove('open');
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
      showToast('Thanks for your review!');
      loadTestimonials();
    } else {
      showToast('Could not submit. Try again.');
    }
  } catch(e) { showToast('Could not reach server.'); }
}

// ── TESTIMONIALS ──────────────────────────────────────
async function loadTestimonials() {
  try {
    const res  = await fetch(`${API_BASE}/api/reviews`);
    const data = await res.json();
    const grid = document.getElementById('testimonialsGrid');
    if (!data.length) {
      grid.innerHTML = '<div class="testimonial-loading">No reviews yet — be the first!</div>';
      return;
    }
    grid.innerHTML = data.map(r => `
      <div class="testimonial-card">
        <div class="testimonial-stars">${'&#9733;'.repeat(r.stars)}${'&#9734;'.repeat(5 - r.stars)}</div>
        <div class="testimonial-msg">"${r.message}"</div>
        <div class="testimonial-name">— ${r.name}</div>
      </div>
    `).join('');
  } catch(e) {
    document.getElementById('testimonialsGrid').innerHTML =
      '<div class="testimonial-loading">Could not load reviews.</div>';
  }
}

// ── PDF PREVIEW ───────────────────────────────────────
function openPreview(url, title) {
  // Convert download URL to inline preview URL (remove fl_attachment)
  const previewUrl = url.replace('/fl_attachment/', '/');
  document.getElementById('previewFrame').src = previewUrl;
  document.getElementById('previewTitle').textContent = title || 'Preview';
  document.getElementById('previewDownload').href = url;
  document.getElementById('previewModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  document.getElementById('previewFrame').src = '';
  document.getElementById('previewModal').classList.remove('open');
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
  try {
    const res = await fetch(`${API_BASE}/api/papers/universities`);
    const unis = await res.json();
    const grid = document.getElementById('universitiesGrid');
    if (!unis.length) {
      grid.innerHTML = '<div class="testimonial-loading">No universities yet. Be the first to upload!</div>';
      return;
    }
    grid.innerHTML = unis.map(u => `
      <div class="course-card" onclick="filterByUniversity('${u.name.replace(/'/g, "\\'")}')">
        <span class="course-icon">&#127891;</span>
        <div class="course-name">${u.name}</div>
        <div class="course-count">${u.count} paper${u.count !== 1 ? 's' : ''}</div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('universitiesGrid').innerHTML =
      '<div class="testimonial-loading">Could not load universities.</div>';
  }
}

function filterByUniversity(uniName) {
  document.getElementById('searchInput').value = uniName;
  currentChipCourse = '';
  document.getElementById('courseFilter').value = '';
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.chip').classList.add('active');
  document.getElementById('search').scrollIntoView({ behavior: 'smooth' });
  performSearch();
}

// ── INIT ──────────────────────────────────────────────
loadPapers();
loadTestimonials();
loadUniversities();
