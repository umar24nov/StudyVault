// ── HAMBURGER MENU ────────────────────────────────────
function toggleMenu() {
  const menu = document.getElementById('navMenu');
  const btn  = document.getElementById('hamburger');
  menu.classList.toggle('open');
  btn.classList.toggle('active');
}

// Close menu when a nav link is clicked
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#navMenu a').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('navMenu').classList.remove('open');
      document.getElementById('hamburger').classList.remove('active');
    });
  });
});

// ── STATE ─────────────────────────────────────────────
let allPapers = [];
let currentChipCourse = '';

// ── LOAD PAPERS FROM SERVER ───────────────────────────
async function loadPapers() {
  try {
    const res = await fetch('https://studyvault-api.onrender.com/api/papers');
    if (!res.ok) throw new Error('Server error');
    allPapers = await res.json();
    // Update stat counter
    const statEl = document.getElementById('statPapers');
    if (statEl) statEl.textContent = allPapers.length + '+';
    performSearch();
  } catch(e) {
    document.getElementById('resultsArea').innerHTML =
      '<div class="no-results">⚠️ Could not connect to server. Make sure <code>node server.js</code> is running.</div>';
  }
}

// ── RENDER CARDS ──────────────────────────────────────
function renderCards(data) {
  const area = document.getElementById('resultsArea');
  if (!data || !data.length) {
    area.innerHTML = '<div class="no-results">😕 No results found. Try a different search or upload the first one!</div>';
    return;
  }

  const typeBadge = { pyq: 'type-pyq', notes: 'type-notes', paper: 'type-paper' };
  const typeLabel = { pyq: '📄 PYQ', notes: '📝 Notes', paper: '📋 Model Paper' };

  area.innerHTML = `<div class="results-grid">${data.map(p => {
    const safeTitle = (p.title || 'Untitled').replace(/'/g, "\\'");
    const safeURL   = (p.downloadURL || '').replace(/'/g, "\\'");
    const course    = p.course || '';
    const univ      = p.university || 'Unknown University';
    const year      = p.year || '';
    const type      = p.type || 'pyq';

    return `
    <div class="result-card">
      <div class="card-type ${typeBadge[type] || 'type-pyq'}">${typeLabel[type] || type}</div>
      <div class="card-title">${p.title || 'Untitled'}</div>
      <div class="card-meta">${univ}${year ? ' · ' + year : ''}</div>
      <div class="card-footer">
        <div class="card-tags">
          ${course ? `<span class="tag">${course}</span>` : ''}
        </div>
        ${safeURL
          ? `<a class="dl-btn" href="${safeURL}" target="_blank" rel="noopener">⬇ Download</a>`
          : `<button class="dl-btn" onclick="showToast('No file attached yet.')">⬇ Download</button>`
        }
      </div>
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
      || (p.year       || '').includes(q);
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

// ── UPLOAD ────────────────────────────────────────────
function dragOver(e)  { e.preventDefault(); document.getElementById('dropzone').classList.add('drag-over'); }
function dragLeave()  { document.getElementById('dropzone').classList.remove('drag-over'); }

function dropFile(e) {
  e.preventDefault();
  dragLeave();
  const files = e.dataTransfer.files;
  if (files.length) {
    document.getElementById('fileInput').files = files;
    showFileChosen(files[0].name);
  }
}

function handleFile(input) {
  if (input.files[0]) showFileChosen(input.files[0].name);
}

function showFileChosen(name) {
  document.getElementById('fileChosen').textContent = '📎 ' + name;
  showToast(`📎 "${name}" selected`);
}

async function handleUpload() {
  const title  = document.getElementById('uploadTitle').value.trim();
  const course = document.getElementById('uploadCourse').value;
  const type   = document.getElementById('uploadType').value;
  const year   = document.getElementById('uploadYear').value.trim();
  const univ   = document.getElementById('uploadUniv').value.trim();
  const file   = document.getElementById('fileInput').files[0];

  if (!title)  { showToast('⚠️ Please enter a title.'); return; }
  if (!course) { showToast('⚠️ Please select a course.'); return; }
  if (!file)   { showToast('⚠️ Please select a file to upload.'); return; }

  const formData = new FormData();
  formData.append('file',       file);
  formData.append('title',      title);
  formData.append('course',     course);
  formData.append('type',       type);
  formData.append('year',       year);
  formData.append('university', univ);

  showToast('⏳ Uploading, please wait...');

  try {
    const res  = await fetch('https://studyvault-api.onrender.com/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
      showToast('✅ Uploaded successfully! Now visible to everyone.');
      // Clear form
      document.getElementById('uploadTitle').value  = '';
      document.getElementById('uploadYear').value   = '';
      document.getElementById('uploadUniv').value   = '';
      document.getElementById('uploadCourse').value = '';
      document.getElementById('uploadType').value   = 'pyq';
      document.getElementById('fileInput').value    = '';
      document.getElementById('fileChosen').textContent = '';
      // Reload papers list
      loadPapers();
loadTestimonials();
    } else {
      showToast('❌ Upload failed: ' + (data.error || 'Unknown error'));
    }
  } catch(e) {
    showToast('❌ Cannot reach server. Is node server.js running?');
  }
}

// ── REVIEW MODAL ──────────────────────────────────────
let selectedStar = 0;
const starLabels = ['', '😞 Poor', '😐 Fair', '🙂 Good', '😊 Great', '🤩 Excellent!'];

function openReviewModal()  { document.getElementById('reviewModal').classList.add('open'); }
function closeReviewModal() {
  document.getElementById('reviewModal').classList.remove('open');
  selectedStar = 0; renderStars(0);
  document.getElementById('starLabel').textContent = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reviewModal').addEventListener('click', function(e) {
    if (e.target === this) closeReviewModal();
  });
  document.getElementById('reviewMsg').addEventListener('input', function() {
    document.getElementById('reviewCharCount').textContent = this.value.length + ' / 150';
  });
});

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
  if (!selectedStar) { showToast('⚠️ Please select a star rating.'); return; }
  if (!name)         { showToast('⚠️ Please enter your name.'); return; }
  if (!msg)          { showToast('⚠️ Please write a short review.'); return; }
  try {
    const res  = await fetch('https://studyvault-api.onrender.com/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, message: msg, stars: selectedStar })
    });
    const data = await res.json();
    if (data.success) {
      closeReviewModal();
      document.getElementById('reviewName').value = '';
      document.getElementById('reviewMsg').value  = '';
      document.getElementById('reviewCharCount').textContent = '0 / 150';
      showToast('🎉 Thanks for your review!');
      loadTestimonials();
    } else {
      showToast('❌ Could not submit. Try again.');
    }
  } catch(e) { showToast('❌ Could not reach server.'); }
}

// ── TESTIMONIALS ──────────────────────────────────────
async function loadTestimonials() {
  try {
    const res  = await fetch('https://studyvault-api.onrender.com/api/reviews');
    const data = await res.json();
    const grid = document.getElementById('testimonialsGrid');
    if (!data.length) {
      grid.innerHTML = '<div class="testimonial-loading">No reviews yet — be the first! ⭐</div>';
      return;
    }
    grid.innerHTML = data.map(r => `
      <div class="testimonial-card">
        <div class="testimonial-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
        <div class="testimonial-msg">"${r.message}"</div>
        <div class="testimonial-name">— ${r.name}</div>
      </div>
    `).join('');
  } catch(e) {
    document.getElementById('testimonialsGrid').innerHTML =
      '<div class="testimonial-loading">Could not load reviews.</div>';
  }
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
  if (!msg) { showToast('⚠️ Please write your feedback first.'); return; }
  try {
    const res  = await fetch('https://studyvault-api.onrender.com/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message: msg })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('feedbackType').value = '';
      document.getElementById('feedbackMsg').value  = '';
      showToast('✅ Thanks for your feedback!');
    } else { showToast('❌ Could not send. Try again.'); }
  } catch(e) { showToast('❌ Could not reach server.'); }
}

// ── CONTACT FORM ──────────────────────────────────────
async function submitContact() {
  const name  = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const msg   = document.getElementById('contactMsg').value.trim();
  if (!name || !email || !msg) { showToast('⚠️ Please fill in all fields.'); return; }
  try {
    const res  = await fetch('https://studyvault-api.onrender.com/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message: msg })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('contactModal').classList.remove('open');
      document.getElementById('contactName').value  = '';
      document.getElementById('contactEmail').value = '';
      document.getElementById('contactMsg').value   = '';
      showToast('✅ Message sent! We'll reply within 48 hours.');
    } else { showToast('❌ Could not send. Try again.'); }
  } catch(e) { showToast('❌ Could not reach server.'); }
}

// ── INIT ──────────────────────────────────────────────
loadPapers();
loadTestimonials();
