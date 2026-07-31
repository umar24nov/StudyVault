const express = require('express');
const admin = require('firebase-admin');
const { verifyToken } = require('../middleware/auth');

function bookmarkRoutes(db) {
  const router = express.Router();

  // GET /api/bookmarks — get current user's bookmarks
  router.get('/', verifyToken, async (req, res, next) => {
    try {
      const snapshot = await db.collection('bookmarks')
        .where('userId', '==', req.user.uid)
        .orderBy('createdAt', 'desc')
        .get();

      const bookmarks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(bookmarks);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bookmarks — bookmark a paper
  router.post('/', verifyToken, async (req, res, next) => {
    try {
      const { paperId } = req.body;
      if (!paperId) return res.status(400).json({ error: 'paperId is required' });

      // Check if already bookmarked
      const existing = await db.collection('bookmarks')
        .where('userId', '==', req.user.uid)
        .where('paperId', '==', paperId)
        .limit(1)
        .get();

      if (!existing.empty) {
        return res.status(409).json({ error: 'Already bookmarked' });
      }

      // Get paper info for the bookmark
      const paperDoc = await db.collection('papers').doc(paperId).get();
      const paperData = paperDoc.exists ? paperDoc.data() : {};

      const docRef = await db.collection('bookmarks').add({
        userId:     req.user.uid,
        paperId,
        title:      paperData.title || '',
        course:     paperData.course || '',
        university: paperData.university || '',
        createdAt:  admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(201).json({ success: true, id: docRef.id });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/bookmarks/:paperId — remove bookmark
  router.delete('/:paperId', verifyToken, async (req, res, next) => {
    try {
      const snapshot = await db.collection('bookmarks')
        .where('userId', '==', req.user.uid)
        .where('paperId', '==', req.params.paperId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(404).json({ error: 'Bookmark not found' });
      }

      await snapshot.docs[0].ref.delete();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bookmarks/check/:paperId — check if user bookmarked a paper
  router.get('/check/:paperId', verifyToken, async (req, res, next) => {
    try {
      const snapshot = await db.collection('bookmarks')
        .where('userId', '==', req.user.uid)
        .where('paperId', '==', req.params.paperId)
        .limit(1)
        .get();

      res.json({ bookmarked: !snapshot.empty });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = bookmarkRoutes;
