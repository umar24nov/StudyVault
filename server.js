const express = require('express');
const multer = require('multer');
const cors = require('cors');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Firebase (Firestore only) ──────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});
const db = admin.firestore();

// ── Cloudinary (File Storage) ──────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Multer (temp local storage before upload) ──────────
const upload = multer({ dest: 'uploads/' });

// ── ROUTES ─────────────────────────────────────────────

// GET all papers (with optional filters)
app.get('/api/papers', async (req, res) => {
  try {
    let query = db.collection('papers').orderBy('createdAt', 'desc');
    if (req.query.course) query = query.where('course', '==', req.query.course);
    if (req.query.type)   query = query.where('type',   '==', req.query.type);
    const snapshot = await query.get();
    const papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(papers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload a paper
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { title, course, type, year, university } = req.body;
    const file = req.file;

    if (!file)  return res.status(400).json({ error: 'No file uploaded' });
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!course) return res.status(400).json({ error: 'Course is required' });

    // Upload file to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'studyvault',
      resource_type: 'auto',   // handles PDF, images, docs
      public_id: `${Date.now()}_${file.originalname}`
    });

    // Delete temp file from local uploads/ folder
    fs.unlinkSync(file.path);

    // Save metadata to Firestore
    const docRef = await db.collection('papers').add({
      title,
      course,
      type:        type || 'pyq',
      year:        year || '',
      university:  university || '',
      downloadURL: result.secure_url,
      fileName:    file.originalname,
      createdAt:   admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, id: docRef.id, downloadURL: result.secure_url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single paper by ID
app.get('/api/papers/:id', async (req, res) => {
  try {
    const doc = await db.collection('papers').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a paper by ID
app.delete('/api/papers/:id', async (req, res) => {
  try {
    await db.collection('papers').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START SERVER ───────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ StudyVault running at http://localhost:${PORT}`);
});