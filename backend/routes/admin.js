const express = require('express');
const admin = require('firebase-admin');
const { verifyToken, requireAdminAuth } = require('../middleware/auth');
const { stripDangerous } = require('../middleware/sanitize');
const { destroyPaperFile } = require('../utils/cloudinary');
const { createNotification } = require('../utils/notify');
const { sendEmail } = require('../config/email');
const { authLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const { paperPatchSchema, rejectReasonSchema } = require('../middleware/schemas');

function adminRoutes(db, cloudinary) {
  const router = express.Router();

  // All admin routes require Firebase Auth + admin doc in Firestore
  router.use(verifyToken, requireAdminAuth);

  // GET /api/admin/check — lightweight admin check for the frontend
  router.get('/check', authLimiter, (req, res) => {
    res.json({ isAdmin: true });
  });

  // GET /api/admin/papers — list papers with optional status filter + pagination
  router.get('/papers', async (req, res, next) => {
    try {
      const { status = 'all', sort = 'newest', page = 1, limit = 25, q = '' } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      let query;
      if (status !== 'all') {
        query = db.collection('papers').where('status', '==', status);
      } else {
        query = db.collection('papers');
      }

      const snapshot = await query.get();
      const searchTerm = String(q).trim().toLowerCase();
      const tsOf = (t) => {
        if (!t) return 0;
        if (typeof t === 'object' && t._seconds != null) return t._seconds * 1000;
        if (typeof t === 'object' && t.seconds != null)  return t.seconds * 1000;
        if (t instanceof Date) return t.getTime();
        const d = new Date(t);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      let all = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => {
          if (!searchTerm) return true;
          return [p.title, p.course, p.university, p.type, p.year]
            .some(field => field && String(field).toLowerCase().includes(searchTerm));
        });
      if (sort === 'popular') {
        all.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      } else {
        all.sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt));
      }
      const total = all.length;
      const papers = all.slice(offset, offset + limitNum);

      res.json({
        data: papers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(1, Math.ceil(total / limitNum)),
          hasMore: offset + limitNum < total
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/stats — dashboard overview
  router.get('/stats', async (req, res, next) => {
    try {
      const allPapers = await db.collection('papers').get();
      const allUsers = await db.collection('users').get();
      const allReviews = await db.collection('reviews').get();
      const allFeedback = await db.collection('feedback').get();
      const allContacts = await db.collection('contacts').get();

      let totalDownloads = 0;
      let pendingCount = 0;
      const courseCounts = {};
      const typeCounts = {};

      allPapers.docs.forEach(doc => {
        const data = doc.data();
        totalDownloads += (data.downloads || 0);
        if (data.status === 'pending') pendingCount++;
        courseCounts[data.course || 'unknown'] = (courseCounts[data.course || 'unknown'] || 0) + 1;
        typeCounts[data.type || 'unknown'] = (typeCounts[data.type || 'unknown'] || 0) + 1;
      });

      // Recent uploads (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentPapers = await db.collection('papers')
        .where('createdAt', '>=', weekAgo)
        .get();

      res.json({
        totalPapers: allPapers.size,
        totalUsers: allUsers.size,
        totalReviews: allReviews.size,
        totalFeedback: allFeedback.size,
        totalContacts: allContacts.size,
        totalDownloads,
        pendingCount,
        recentUploads: recentPapers.size,
        courseBreakdown: courseCounts,
        typeBreakdown: typeCounts
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/users — list all users
  router.get('/users', async (req, res, next) => {
    try {
      const snapshot = await db.collection('users').orderBy('joinedAt', 'desc').limit(100).get();
      const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      res.json(users);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/papers/:id — delete a paper + its file + bookmarks
  router.delete('/papers/:id', async (req, res, next) => {
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

  // PATCH /api/admin/papers/:id — update title, course, university, year
  router.patch('/papers/:id', validate(paperPatchSchema), async (req, res, next) => {
    try {
      const { title, type, course, university, year } = req.body;
      const update = {};
      if (typeof title === 'string' && title.trim()) update.title = stripDangerous(title.trim()).slice(0, 200);
      if (typeof type === 'string' && type.trim()) update.type = stripDangerous(type.trim()).slice(0, 20);
      if (typeof course === 'string' && course.trim()) update.course = stripDangerous(course.trim()).slice(0, 100);
      if (typeof university === 'string') update.university = stripDangerous(university.trim()).slice(0, 200);
      if (typeof year === 'string') update.year = stripDangerous(year.trim()).slice(0, 20);

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Nothing to update.' });
      }

      await db.collection('papers').doc(req.params.id).update(update);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // Resolve an uploader's email from the paper doc or the users collection.
  async function getUploaderEmail(paper) {
    if (paper.uploaderEmail) return paper.uploaderEmail;
    if (!paper.uploadedBy) return '';
    try {
      const userDoc = await db.collection('users').doc(paper.uploadedBy).get();
      return userDoc.exists ? (userDoc.data().email || '') : '';
    } catch (_err) {
      return '';
    }
  }

  // PATCH /api/admin/papers/:id/approve — approve a paper
  router.patch('/papers/:id/approve', async (req, res, next) => {
    try {
      const ref = db.collection('papers').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Paper not found' });
      const paper = doc.data();

      await ref.update({
        status: 'approved',
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true });

      createNotification(db, {
        uid: paper.uploadedBy,
        type: 'paper_approved',
        title: 'Your paper was approved! 🎉',
        message: `"${paper.title}" is now live on StudyVault.`,
        link: '/upload.html#myUploads'
      });
      getUploaderEmail(paper).then(email => {
        if (email) sendEmail(
          'Your paper is live on StudyVault 🎉',
          `<p>Hi ${paper.uploaderName || 'there'},</p><p>Your upload <strong>"${paper.title}"</strong> has been approved and is now visible to all students.</p><p>Keep contributing!</p>`,
          email
        );
      });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/papers/:id/reject — reject a paper (with optional reason)
  router.patch('/papers/:id/reject', validate(rejectReasonSchema), async (req, res, next) => {
    try {
      const ref = db.collection('papers').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Paper not found' });
      const paper = doc.data();

      const reason = (req.body && req.body.reason) || '';

      await ref.update({
        status: 'rejected',
        rejectReason: reason,
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true });

      const reasonLine = reason
        ? `<p><strong>Reason:</strong> ${reason}</p>`
        : '';
      createNotification(db, {
        uid: paper.uploadedBy,
        type: 'paper_rejected',
        title: 'Your paper was not approved',
        message: reason
          ? `"${paper.title}" did not pass review: ${reason}`
          : `"${paper.title}" did not pass review. Contact us if you think this was a mistake.`,
        link: '/upload.html#myUploads'
      });
      getUploaderEmail(paper).then(email => {
        if (email) sendEmail(
          'Update on your StudyVault upload',
          `<p>Hi ${paper.uploaderName || 'there'},</p><p>Your upload <strong>"${paper.title}"</strong> was not approved for the platform.</p>${reasonLine}<p>You can edit the details and try again, or reply to this email if you believe this was a mistake.</p>`,
          email
        );
      });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/reviews/:id — delete a review
  router.delete('/reviews/:id', async (req, res, next) => {
    try {
      await db.collection('reviews').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/reviews — list all reviews with status
  router.get('/reviews', async (req, res, next) => {
    try {
      const snapshot = await db.collection('reviews').orderBy('createdAt', 'desc').limit(100).get();
      const reviews = snapshot.docs.map(doc => {
        const data = doc.data();
        const { userId, ...rest } = data;
        return { id: doc.id, ...rest };
      });
      res.json(reviews);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/reviews/:id/approve — approve a review
  router.patch('/reviews/:id/approve', async (req, res, next) => {
    try {
      await db.collection('reviews').doc(req.params.id).update({
        status: 'approved',
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/reviews/:id/reject — reject a review
  router.patch('/reviews/:id/reject', async (req, res, next) => {
    try {
      await db.collection('reviews').doc(req.params.id).update({
        status: 'rejected',
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/feedback/:id — delete feedback
  router.delete('/feedback/:id', async (req, res, next) => {
    try {
      await db.collection('feedback').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/downloads — clear download history (optionally older than N days)
  router.delete('/downloads', async (req, res, next) => {
    try {
      let query = db.collection('downloads');
      const days = parseInt(req.query.olderThanDays);
      if (days > 0) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        query = query.where('createdAt', '<=', cutoff);
      }
      const snapshot = await query.limit(500).get();
      await Promise.all(snapshot.docs.map(d => d.ref.delete()));
      res.json({ success: true, deleted: snapshot.size });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/reports — list reported papers
  router.get('/reports', async (req, res, next) => {
    try {
      const { status = 'open' } = req.query;
      // Equality query only (no composite index), sorted in memory.
      let query = db.collection('reports');
      if (status !== 'all') query = query.where('status', '==', status);
      const snapshot = await query.limit(300).get();

      const tsOf = (t) => {
        if (!t) return 0;
        if (typeof t === 'object' && t._seconds != null) return t._seconds * 1000;
        if (typeof t === 'object' && t.seconds != null)  return t.seconds * 1000;
        if (t instanceof Date) return t.getTime();
        const d = new Date(t);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };

      const reports = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt));
      res.json(reports);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/reports/:id/resolve — mark a report resolved
  router.patch('/reports/:id/resolve', async (req, res, next) => {
    try {
      await db.collection('reports').doc(req.params.id).update({
        status: 'resolved',
        handledBy: req.user.uid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/reports/:id — remove a report
  router.delete('/reports/:id', async (req, res, next) => {
    try {
      await db.collection('reports').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = adminRoutes;
