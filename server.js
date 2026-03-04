const express = require('express');
const multer = require('multer');
const cors = require('cors');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
require('dotenv').config();

const app = express();

// ── CORS ───────────────────────────────────────────────
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

// ── Multer ─────────────────────────────────────────────
const upload = multer({ dest: '/tmp/uploads/' });

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'StudyVault API is running!' });
});

// ── GET papers ─────────────────────────────────────────
app.get('/api/papers', async (req, res) => {
  try {
    let query = db.collection('papers').orderBy('createdAt', 'desc');
    if (req.query.course) query = query.where('course', '==', req.query.course);
    if (req.query.type)   query = query.where('type',   '==', req.query.type);
    const snapshot = await query.get();
    const papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(papers);
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
      resource_type: 'auto'
    });

    // Delete temp file
    try { fs.unlinkSync(file.path); } catch(e) {}

    await db.collection('papers').add({
      title,
      course,
      type:        type || 'pyq',
      year:        year || '',
      university:  university || '',
      downloadURL: result.secure_url,
      fileName:    file.originalname,
      createdAt:   admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({ success: true, downloadURL: result.secure_url });
  } catch (err) {
    console.error('POST /api/upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE paper ───────────────────────────────────────
app.delete('/api/papers/:id', async (req, res) => {
  try {
    await db.collection('papers').doc(req.params.id).delete();
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ StudyVault API running on port ${PORT}`);
});