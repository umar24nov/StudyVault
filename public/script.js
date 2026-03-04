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
    } else {
      showToast('❌ Upload failed: ' + (data.error || 'Unknown error'));
    }
  } catch(e) {
    showToast('❌ Cannot reach server. Is node server.js running?');
  }
}

// ── MODAL ─────────────────────────────────────────────
function openModal()  { document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }
document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── TOAST ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── INIT ──────────────────────────────────────────────
loadPapers();