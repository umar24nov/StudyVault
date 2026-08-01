const express = require('express');
const admin = require('firebase-admin');
const { verifyToken } = require('../middleware/auth');
const { stripDangerous } = require('../middleware/sanitize');
const { destroyPaperFile } = require('../utils/cloudinary');

// Contributor badges based on approved uploads + total downloads.
function computeBadge(approvedUploads, totalDownloads) {
  if (approvedUploads >= 20 || totalDownloads >= 500) return 'Top Contributor';
  if (approvedUploads >= 5 || totalDownloads >= 100) return 'Active Contributor';
  return '';
}

function userRoutes(db, cloudinary) {
  const router = express.Router();

  // GET /api/users/me — get current user's profile + stats
  router.get('/me', verifyToken, async (req, res, next) => {
    try {
      const uid = req.user.uid;

      // Get user profile from Firestore
      const userDoc = await db.collection('users').doc(uid).get();
      const profile = userDoc.exists ? userDoc.data() : {};

      // Count user's uploads (total + approved) for stats and badge
      const uploadsSnap = await db.collection('papers')
        .where('uploadedBy', '==', uid)
        .get();

      // Count user's bookmarks
      const bookmarksSnap = await db.collection('bookmarks')
        .where('userId', '==', uid)
        .get();

      // Total downloads across all user's approved papers
      let totalDownloads = 0;
      let approvedUploads = 0;
      uploadsSnap.docs.forEach(doc => {
        if (doc.data().status === 'approved') {
          approvedUploads++;
          totalDownloads += (doc.data().downloads || 0);
        }
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
        badge: computeBadge(approvedUploads, totalDownloads),
        stats: {
          uploads: uploadsSnap.size,
          approvedUploads,
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
        .map(doc => {
          const d = doc.data();
          const rc = d.ratingCount || 0;
          return { id: doc.id, ...d, ratingAvg: rc ? Math.round(((d.ratingSum || 0) / rc) * 10) / 10 : null };
        })
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      res.json(papers);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/users/me/uploads/:id — edit an upload's metadata (owner only)
  router.put('/me/uploads/:id', verifyToken, async (req, res, next) => {
    try {
      const ref = db.collection('papers').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Paper not found' });
      const paper = doc.data();
      if (paper.uploadedBy !== req.user.uid) {
        return res.status(403).json({ error: 'You can only edit your own uploads' });
      }

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

      await ref.update(update);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/users/me/uploads/:id — delete an upload + its file + bookmarks (owner only)
  router.delete('/me/uploads/:id', verifyToken, async (req, res, next) => {
    try {
      const ref = db.collection('papers').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Paper not found' });
      const paper = doc.data();
      if (paper.uploadedBy !== req.user.uid) {
        return res.status(403).json({ error: 'You can only delete your own uploads' });
      }

      await destroyPaperFile(cloudinary, paper);
      const bookmarks = await db.collection('bookmarks')
        .where('paperId', '==', req.params.id)
        .get();
      await Promise.all(bookmarks.docs.map(b => b.ref.delete()));
      await ref.delete();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/users/me/downloads — recent download history for this user
  router.get('/me/downloads', verifyToken, async (req, res, next) => {
    try {
      const snapshot = await db.collection('downloads')
        .where('userId', '==', req.user.uid)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();

      const downloads = snapshot.docs.map(doc => {
        const { userId, ...rest } = doc.data();
        return { id: doc.id, ...rest };
      });
      res.json(downloads);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/users/me/recommendations — papers picked from user's course/level/university
  // and download history, falling back to popular approved papers.
  router.get('/me/recommendations', verifyToken, async (req, res, next) => {
    try {
      const uid = req.user.uid;
      const [userDoc, historySnap, papersSnap] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('downloads').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(15).get(),
        db.collection('papers').where('status', '==', 'approved').get()
      ]);
      const profile = userDoc.exists ? userDoc.data() : {};

      const tags = new Set();
      if (profile.course) tags.add(String(profile.course).toLowerCase());
      if (profile.level) tags.add(String(profile.level).toLowerCase());
      if (profile.university) tags.add(String(profile.university).toLowerCase());
      historySnap.docs.forEach(d => {
        if (d.data().course) tags.add(String(d.data().course).toLowerCase());
      });

      const downloadedIds = new Set(historySnap.docs.map(d => d.data().paperId));
      const ownIds = new Set(
        papersSnap.docs.filter(p => p.data().uploadedBy === uid).map(p => p.id)
      );

      const withRating = (doc) => {
        const d = doc.data();
        const rc = d.ratingCount || 0;
        return { id: doc.id, ...d, ratingAvg: rc ? Math.round(((d.ratingSum || 0) / rc) * 10) / 10 : null };
      };

      const scored = [];
      papersSnap.docs.forEach(doc => {
        const p = doc.data();
        if (p.uploadedBy === uid || downloadedIds.has(doc.id)) return;
        let score = 0;
        if (p.course && tags.has(String(p.course).toLowerCase())) score += 3;
        if (profile.university && p.university && String(p.university).toLowerCase() === String(profile.university).toLowerCase()) score += 2;
        if (profile.level && p.type === profile.level) score += 1;
        score += Math.log1p(p.downloads || 0);
        if (p.ratingCount) score += (p.ratingSum / p.ratingCount) * 0.5;
        scored.push({ score, paper: withRating(doc) });
      });
      scored.sort((a, b) => b.score - a.score);

      let recs = scored.slice(0, 10).map(s => s.paper);
      if (recs.length < 6) {
        const included = new Set(recs.map(r => r.id));
        const popular = papersSnap.docs
          .map(withRating)
          .filter(p => !included.has(p.id) && !ownIds.has(p.id) && !downloadedIds.has(p.id))
          .sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        recs = recs.concat(popular.slice(0, 6 - recs.length));
      }
      res.json(recs);
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
