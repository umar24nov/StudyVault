const express = require('express');
const fs = require('fs');
const admin = require('firebase-admin');
const { sendEmail } = require('../config/email');
const { stripDangerous } = require('../middleware/sanitize');
const { upload } = require('../middleware/upload');
const { verifyToken, optionalAuth, requireAdminAuth } = require('../middleware/auth');
const { uploadLimiter, downloadLimiter } = require('../middleware/rateLimit');

function paperRoutes(db, cloudinary) {
  const router = express.Router();

  // GET /api/papers — with pagination, sorting, and search
  router.get('/', async (req, res, next) => {
    try {
      const { course, type, sort = 'newest', search, page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      let query = db.collection('papers').where('status', '==', 'approved');

      if (course) query = query.where('course', '==', course);
      if (type)   query = query.where('type',   '==', type);

      // Sort options
      if (sort === 'popular') {
        query = query.orderBy('downloads', 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }

      const snapshot = await query.get();
      let papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Client-side search (for text search across fields)
      if (search) {
        const q = search.toLowerCase();
        papers = papers.filter(p =>
          (p.title      || '').toLowerCase().includes(q) ||
          (p.course     || '').toLowerCase().includes(q) ||
          (p.university || '').toLowerCase().includes(q) ||
          (p.year       || '').includes(q) ||
          (p.tags       || []).some(t => t.toLowerCase().includes(q))
        );
      }

      const total = papers.length;
      const paginatedPapers = papers.slice(offset, offset + limitNum);

      res.json({
        data: paginatedPapers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: offset + limitNum < total
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/papers/trending — top papers by downloads (last 30 days)
  router.get('/trending', async (req, res, next) => {
    try {
      const snapshot = await db.collection('papers')
        .where('status', '==', 'approved')
        .orderBy('downloads', 'desc')
        .limit(10)
        .get();

      const papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(papers);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/papers/universities — list all unique universities with paper counts
  router.get('/universities', async (req, res, next) => {
    try {
      const snapshot = await db.collection('papers')
        .where('status', '==', 'approved')
        .get();

      const uniMap = {};
      snapshot.docs.forEach(doc => {
        const uni = (doc.data().university || '').trim();
        if (uni) {
          uniMap[uni] = (uniMap[uni] || 0) + 1;
        }
      });

      const universities = Object.entries(uniMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      res.json(universities);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/papers/university/:name — papers for a specific university
  router.get('/university/:name', async (req, res, next) => {
    try {
      const uniName = decodeURIComponent(req.params.name);
      const snapshot = await db.collection('papers')
        .where('status', '==', 'approved')
        .orderBy('createdAt', 'desc')
        .get();

      const papers = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => (p.university || '').toLowerCase() === uniName.toLowerCase());

      res.json({
        university: uniName,
        totalPapers: papers.length,
        data: papers
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/papers/:id — single paper
  router.get('/:id', async (req, res, next) => {
    try {
      const doc = await db.collection('papers').doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: 'Paper not found' });
      res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/papers — upload a paper (requires auth)
  router.post('/', verifyToken, uploadLimiter, upload.single('file'), async (req, res, next) => {
    try {
      const { tags } = req.body;
      const title = stripDangerous((req.body.title || '').slice(0, 200));
      const course = stripDangerous((req.body.course || '').slice(0, 100));
      const type = stripDangerous((req.body.type || '').slice(0, 20));
      const year = stripDangerous((req.body.year || '').slice(0, 20));
      const university = stripDangerous((req.body.university || '').slice(0, 200));
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

      try { fs.unlinkSync(file.path); } catch(_e) { /* ignore */ }

      const rawURL = result.secure_url;
      const downloadURL = rawURL.replace('/upload/', '/upload/fl_attachment/');

      // Parse tags — accept comma-separated string or array
      let parsedTags = [];
      if (tags) {
        parsedTags = Array.isArray(tags)
          ? tags
          : tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        parsedTags = parsedTags.map(t => stripDangerous(t.slice(0, 50))).filter(Boolean).slice(0, 10);
      }

      const docRef = await db.collection('papers').add({
        title, course,
        type:       type       || 'pyq',
        year:       year       || '',
        university: university || '',
        tags:       parsedTags,
        downloadURL,
        fileName:    file.originalname,
        downloads:   0,
        status:      'pending',
        uploadedBy:  req.user.uid,
        uploaderName: req.user.name || req.user.email || 'Anonymous',
        createdAt:   admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(201).json({ success: true, id: docRef.id, downloadURL });

      sendEmail(`New paper uploaded: ${title}`, `<p><strong>Title:</strong> ${title}</p><p><strong>Course:</strong> ${course}</p><p><strong>Type:</strong> ${type || 'pyq'}</p><p><strong>Uploaded by:</strong> ${req.user.name || req.user.email || 'Anonymous'}</p>`);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/papers/:id — admin only
  router.delete('/:id', verifyToken, requireAdminAuth, async (req, res, next) => {
    try {
      await db.collection('papers').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/papers/:id/approve — admin only
  router.patch('/:id/approve', verifyToken, requireAdminAuth, async (req, res, next) => {
    try {
      await db.collection('papers').doc(req.params.id).update({ status: 'approved' });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/papers/:id/reject — admin only
  router.patch('/:id/reject', verifyToken, requireAdminAuth, async (req, res, next) => {
    try {
      await db.collection('papers').doc(req.params.id).update({ status: 'rejected' });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/papers/:id/download — increment download counter
  router.post('/:id/download', downloadLimiter, async (req, res, next) => {
    try {
      const ref = db.collection('papers').doc(req.params.id);
      await ref.update({
        downloads: admin.firestore.FieldValue.increment(1)
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = paperRoutes;
