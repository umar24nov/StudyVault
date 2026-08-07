const express = require('express');
const fs = require('fs');
const admin = require('firebase-admin');
const { sendEmail } = require('../config/email');
const { stripDangerous } = require('../middleware/sanitize');
const { upload, verifyMagicBytes } = require('../middleware/upload');
const { verifyToken, optionalAuth, requireAdminAuth } = require('../middleware/auth');
const { uploadLimiter, downloadLimiter, writeLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const { paperUploadSchema, reportSchema, ratingSchema } = require('../middleware/schemas');
const { destroyPaperFile } = require('../utils/cloudinary');

function paperRoutes(db, cloudinary) {
  const router = express.Router();

  // GET /api/papers — with pagination, sorting, and search
  router.get('/', async (req, res, next) => {
    try {
      const { course, type, sort = 'newest', search, year, university, page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      let query = db.collection('papers').where('status', '==', 'approved');

      // Sort options
      if (sort === 'popular') {
        query = query.orderBy('downloads', 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }

      const snapshot = await query.get();
      let papers = snapshot.docs.map(doc => {
        const d = doc.data();
        const rc = d.ratingCount || 0;
        return { id: doc.id, ...d, ratingAvg: rc ? Math.round(((d.ratingSum || 0) / rc) * 10) / 10 : null };
      });

      // In-memory filters (avoid extra composite indexes)
      if (course) {
        const c = String(course).trim().toLowerCase();
        papers = papers.filter(p => (p.course || '').toLowerCase() === c);
      }
      if (type) {
        const t = String(type).trim().toLowerCase();
        papers = papers.filter(p => (p.type || '').toLowerCase() === t);
      }
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
      if (university) {
        const u = university.trim().toLowerCase();
        papers = papers.filter(p => (p.university || '').toLowerCase().includes(u));
      }
      if (year) {
        const y = year.trim().toLowerCase();
        papers = papers.filter(p => (p.year || '').toLowerCase().includes(y));
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

  // GET /api/papers/trending — top papers by downloads
  router.get('/trending', async (req, res, next) => {
    try {
      const snapshot = await db.collection('papers')
        .where('status', '==', 'approved')
        .limit(200)
        .get();

      const papers = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
        .slice(0, 10);

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

  // GET /api/papers/:id — single paper (only approved, or admin)
  router.get('/:id', async (req, res, next) => {
    try {
      const doc = await db.collection('papers').doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: 'Paper not found' });
      const data = doc.data();
      if (data.status !== 'approved') {
        return res.status(404).json({ error: 'Paper not found' });
      }
      const rc = data.ratingCount || 0;
      res.json({ id: doc.id, ...data, ratingAvg: rc ? Math.round(((data.ratingSum || 0) / rc) * 10) / 10 : null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/papers — upload a paper (auth optional)
  router.post('/', optionalAuth, uploadLimiter, upload.single('file'), verifyMagicBytes, validate(paperUploadSchema), async (req, res, next) => {
    try {
      const { tags } = req.body;
      const title = stripDangerous((req.body.title || '').slice(0, 200));
      const course = stripDangerous((req.body.course || '').slice(0, 100));
      const type = stripDangerous((req.body.type || '').slice(0, 20));
      const year = stripDangerous((req.body.year || '').slice(0, 20));
      const university = stripDangerous((req.body.university || '').slice(0, 200));
      const uploaderName = stripDangerous((req.body.uploaderName || '').slice(0, 100));
      const uploaderEmail = stripDangerous((req.body.uploaderEmail || '').slice(0, 200));
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
        fileName:    stripDangerous(file.originalname).slice(0, 255),
        publicId:    result.public_id,
        downloads:   0,
        status:      'pending',
        uploadedBy:  req.user ? req.user.uid : 'anonymous',
        uploaderName: req.user ? (req.user.name || req.user.email || uploaderName || 'Anonymous') : (uploaderName || 'Anonymous'),
        uploaderEmail: req.user ? (req.user.email || uploaderEmail || '') : (uploaderEmail || ''),
        createdAt:   admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(201).json({ success: true, id: docRef.id, downloadURL });

      sendEmail(`New paper uploaded: ${title}`, `<p><strong>Title:</strong> ${title}</p><p><strong>Course:</strong> ${course}</p><p><strong>Type:</strong> ${type || 'pyq'}</p><p><strong>Uploaded by:</strong> ${req.user ? (req.user.name || req.user.email || 'Anonymous') : (uploaderName || 'Anonymous')}</p>`);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/papers/:id — admin only
  router.delete('/:id', verifyToken, requireAdminAuth, async (req, res, next) => {
    try {
      const ref = db.collection('papers').doc(req.params.id);
      const doc = await ref.get();
      if (doc.exists) {
        await destroyPaperFile(cloudinary, doc.data());
        const bookmarks = await db.collection('bookmarks')
          .where('paperId', '==', req.params.id)
          .get();
        await Promise.all(bookmarks.docs.map(b => b.ref.delete()));
      }
      await ref.delete();
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
  router.post('/:id/download', optionalAuth, downloadLimiter, async (req, res, next) => {
    try {
      const ref = db.collection('papers').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists || doc.data().status !== 'approved') {
        return res.status(404).json({ error: 'Paper not found' });
      }
      const paper = doc.data();
      await ref.update({
        downloads: admin.firestore.FieldValue.increment(1)
      });

      // Record download history for signed-in users (for "Recently downloaded" + smarter recs)
      if (req.user) {
        db.collection('downloads').add({
          userId: req.user.uid,
          paperId: req.params.id,
          title: paper.title || '',
          course: paper.course || '',
          university: paper.university || '',
          downloadURL: paper.downloadURL || '',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/papers/:id/report — report a paper (auth optional, rate limited)
  router.post('/:id/report', optionalAuth, writeLimiter, validate(reportSchema), async (req, res, next) => {
    try {
      const reason = req.body.reason;

      const doc = await db.collection('papers').doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: 'Paper not found' });
      const paper = doc.data();

      await db.collection('reports').add({
        paperId: req.params.id,
        paperTitle: paper.title || '',
        userId: req.user ? req.user.uid : '',
        reporterEmail: req.user ? (req.user.email || '') : '',
        reason,
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(201).json({ success: true });

      sendEmail(`Report on "${paper.title || 'a paper'}"`, `<p>A user reported a paper:</p><p><strong>Paper:</strong> ${paper.title || 'Unknown'}</p><p><strong>Reason:</strong></p><p>${reason}</p>`);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/papers/:id/rating — rate a paper (1-5 stars, auth required)
  router.post('/:id/rating', verifyToken, writeLimiter, validate(ratingSchema), async (req, res, next) => {
    try {
      const starNum = req.body.stars;

      const paperRef = db.collection('papers').doc(req.params.id);
      const paperDoc = await paperRef.get();
      if (!paperDoc.exists) return res.status(404).json({ error: 'Paper not found' });

      // Upsert the user's rating, then update the paper's aggregate atomically
      const ratingQuery = await db.collection('ratings')
        .where('userId', '==', req.user.uid)
        .where('paperId', '==', req.params.id)
        .limit(1)
        .get();

      await db.runTransaction(async (tx) => {
        const pSnap = await tx.get(paperRef);
        const pData = pSnap.data() || {};
        const count = pData.ratingCount || 0;
        const sum = pData.ratingSum || 0;

        if (!ratingQuery.empty) {
          const existing = ratingQuery.docs[0].data();
          const delta = starNum - (existing.stars || 0);
          await tx.update(ratingQuery.docs[0].ref, { stars: starNum, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          await tx.update(paperRef, { ratingCount: count, ratingSum: sum + delta });
        } else {
          await tx.set(paperRef, { ratingCount: count + 1, ratingSum: sum + starNum }, { merge: true });
          await tx.set(db.collection('ratings').doc(), {
            userId: req.user.uid,
            paperId: req.params.id,
            stars: starNum,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = paperRoutes;
