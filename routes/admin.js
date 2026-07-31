const express = require('express');
const admin = require('firebase-admin');
const { verifyToken, requireAdminAuth } = require('../middleware/auth');

function adminRoutes(db) {
  const router = express.Router();

  // All admin routes require Firebase Auth + admin doc in Firestore
  router.use(verifyToken, requireAdminAuth);

  // GET /api/admin/papers — list all papers with optional status filter
  router.get('/papers', async (req, res, next) => {
    try {
      const { status = 'all', sort = 'newest' } = req.query;

      let query;
      if (status !== 'all') {
        query = db.collection('papers').where('status', '==', status);
      } else {
        query = db.collection('papers');
      }

      if (sort === 'popular') {
        query = query.orderBy('downloads', 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }

      const snapshot = await query.limit(200).get();
      const papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(papers);
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

  // DELETE /api/admin/papers/:id — delete a paper
  router.delete('/papers/:id', async (req, res, next) => {
    try {
      await db.collection('papers').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/papers/:id — update title, course, university, year
  router.patch('/papers/:id', async (req, res, next) => {
    try {
      const { title, type, course, university, year } = req.body;
      const update = {};
      if (typeof title === 'string' && title.trim()) update.title = title.trim().slice(0, 200);
      if (typeof type === 'string' && type.trim()) update.type = type.trim().slice(0, 20);
      if (typeof course === 'string' && course.trim()) update.course = course.trim().slice(0, 100);
      if (typeof university === 'string') update.university = university.trim().slice(0, 200);
      if (typeof year === 'string') update.year = year.trim().slice(0, 20);

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Nothing to update.' });
      }

      await db.collection('papers').doc(req.params.id).update(update);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/papers/:id/approve — approve a paper
  router.patch('/papers/:id/approve', async (req, res, next) => {
    try {
      await db.collection('papers').doc(req.params.id).update({
        status: 'approved',
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/papers/:id/reject — reject a paper
  router.patch('/papers/:id/reject', async (req, res, next) => {
    try {
      await db.collection('papers').doc(req.params.id).update({
        status: 'rejected',
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
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

  return router;
}

module.exports = adminRoutes;
