const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const admin   = require('firebase-admin');
const cloudinary = require('cloudinary').v2;
const fs      = require('fs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Firebase ───────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}
const db = admin.firestore();

// ── Cloudinary ─────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG allowed.'));
  }
});

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'StudyVault API is running!' }));

// ── GET papers ─────────────────────────────────────────
app.get('/api/papers', async (req, res) => {
  try {
    let query = db.collection('papers').orderBy('createdAt', 'desc');
    if (req.query.course) query = query.where('course', '==', req.query.course);
    if (req.query.type)   query = query.where('type',   '==', req.query.type);
    const snapshot = await query.get();
    res.status(200).json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.error('GET /api/papers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST upload ────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { title, course, type, year, university } = req.body;
    const file = req.file;
    if (!file)   return res.status(400).json({ error: 'No file uploaded' });
    if (!title)  return res.status(400).json({ error: 'Title is required' });
    if (!course) return res.status(400).json({ error: 'Course is required' });
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'studyvault',
      resource_type: 'auto',
      upload_preset: 'studyvault_public',
      use_filename: true,
      unique_filename: true,
      invalidate: true
    });
    try { fs.unlinkSync(file.path); } catch(e) {}

    // fl_attachment forces browser to download instead of display
    const rawURL = result.secure_url;
    const downloadURL = rawURL.replace('/upload/', '/upload/fl_attachment/');

    await db.collection('papers').add({
      title, course,
      type:       type       || 'pyq',
      year:       year       || '',
      university: university || '',
      downloadURL,
      fileName:    file.originalname,
      createdAt:   admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true, downloadURL });
  } catch (err) {
    console.error('POST /api/upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── MULTER ERROR HANDLER ──────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 15 MB.' });
  }
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ── DELETE paper ───────────────────────────────────────
app.delete('/api/papers/:id', async (req, res) => {
  try {
    await db.collection('papers').doc(req.params.id).delete();
    res.status(200).json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST feedback ──────────────────────────────────────
app.post('/api/feedback', async (req, res) => {
  try {
    const { type, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    await db.collection('feedback').add({
      type: type || 'other', message,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /api/feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST contact ───────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message)
      return res.status(400).json({ error: 'All fields required' });
    await db.collection('contacts').add({
      name, email, message,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /api/contact error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET reviews ────────────────────────────────────────
app.get('/api/reviews', async (req, res) => {
  try {
    const snapshot = await db.collection('reviews')
      .orderBy('createdAt', 'desc').limit(12).get();
    res.status(200).json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST review ────────────────────────────────────────
app.post('/api/reviews', async (req, res) => {
  try {
    const { name, message, stars } = req.body;
    if (!name || !message || !stars)
      return res.status(400).json({ error: 'All fields required' });
    await db.collection('reviews').add({
      name, message, stars: parseInt(stars),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── START ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ StudyVault API running on port ${PORT}`));
