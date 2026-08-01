const express = require('express');
const admin = require('firebase-admin');
const { verifyToken } = require('../middleware/auth');

function userRoutes(db) {
  const router = express.Router();

  // GET /api/users/me — get current user's profile + stats
  router.get('/me', verifyToken, async (req, res, next) => {
    try {
      const uid = req.user.uid;

      // Get user profile from Firestore
      const userDoc = await db.collection('users').doc(uid).get();
      const profile = userDoc.exists ? userDoc.data() : {};

      // Count user's uploads
      const uploadsSnap = await db.collection('papers')
        .where('uploadedBy', '==', uid)
        .get();

      // Count user's bookmarks
      const bookmarksSnap = await db.collection('bookmarks')
        .where('userId', '==', uid)
        .get();

      // Total downloads across all user's papers
      let totalDownloads = 0;
      uploadsSnap.docs.forEach(doc => {
        totalDownloads += (doc.data().downloads || 0);
      });

      res.json({
        uid,
        email: req.user.email,
        name: profile.name || req.user.name || req.user.email,
        picture: profile.picture || req.user.picture || '',
        university: profile.university || '',
        course: profile.course || '',
        level: profile.level || '',
        grade: profile.grade || '',
        board: profile.board || '',
        hasReviewed: !!profile.hasReviewed,
        joinedAt: profile.joinedAt || null,
        stats: {
          uploads: uploadsSnap.size,
          bookmarks: bookmarksSnap.size,
          totalDownloads
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/users/me — update profile
  router.put('/me', verifyToken, async (req, res, next) => {
    try {
      const { name, university, course, level, grade, board } = req.body;
      const uid = req.user.uid;

      const updates = {};
      if (name)       updates.name = String(name).slice(0, 100);
      if (university) updates.university = String(university).slice(0, 200);
      if (course)     updates.course = String(course).slice(0, 100);
      if (level)      updates.level = String(level).slice(0, 50);
      if (grade)      updates.grade = String(grade).slice(0, 10);
      if (board)      updates.board = String(board).slice(0, 50);
      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('users').doc(uid).set(updates, { merge: true });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/users/me/uploads — get papers uploaded by current user
  router.get('/me/uploads', verifyToken, async (req, res, next) => {
    try {
      const snapshot = await db.collection('papers')
        .where('uploadedBy', '==', req.user.uid)
        .get();

      const papers = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      res.json(papers);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/users/me/register — create/update user on first login
  router.post('/me/register', verifyToken, async (req, res, next) => {
    try {
      const uid = req.user.uid;
      const userDoc = await db.collection('users').doc(uid).get();

      if (!userDoc.exists) {
        await db.collection('users').doc(uid).set({
          name:      req.user.name || req.user.email,
          email:     req.user.email,
          picture:   req.user.picture || '',
          joinedAt:  admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.json({ success: true, isNew: true });
      }

      // Update last login
      await db.collection('users').doc(uid).update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true, isNew: false });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = userRoutes;
