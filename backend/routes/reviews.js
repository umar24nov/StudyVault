const express = require('express');
const { sendEmail } = require('../config/email');
const { verifyToken } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

function reviewRoutes(db) {
  const router = express.Router();

  // GET /api/reviews — reviews sorted by stars (5 first) by default, or recency
  router.get('/', async (req, res, next) => {
    try {
      const sort = req.query.sort === 'recent' ? 'recent' : 'top';
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 6));

      const snapshot = await db.collection('reviews')
        .where('status', '==', 'approved')
        .get();

      let reviews = snapshot.docs.map(doc => {
        const data = doc.data();
        const { userId, ...rest } = data;
        return { id: doc.id, ...rest };
      });

      if (sort === 'top') {
        reviews.sort((a, b) => (b.stars || 0) - (a.stars || 0));
      } else {
        const time = t => (t && t.seconds) || (t && t._seconds) || 0;
        reviews.sort((a, b) => time(b.createdAt) - time(a.createdAt));
      }

      res.json(reviews.slice(0, limit));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/reviews — requires auth (default pending)
  router.post('/', verifyToken, writeLimiter, async (req, res, next) => {
    try {
      const { name, message, stars } = req.body;
      if (!name || !message || !stars)
        return res.status(400).json({ error: 'All fields required' });
      if (name.length > 100) return res.status(400).json({ error: 'Name must be under 100 characters' });
      if (message.length > 500) return res.status(400).json({ error: 'Message must be under 500 characters' });

      const starNum = parseInt(stars);
      if (starNum < 1 || starNum > 5)
        return res.status(400).json({ error: 'Stars must be between 1 and 5' });

      await db.collection('reviews').add({
        name, message,
        stars: starNum,
        status: 'approved',
        userId: req.user.uid,
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
      });

      // Remember that this user has reviewed, so we don't prompt again
      await db.collection('users').doc(req.user.uid).set(
        { hasReviewed: true, updatedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp() },
        { merge: true }
      ).catch(() => {});
      res.status(201).json({ success: true });

      sendEmail(`New review from ${name}`, `<p><strong>Name:</strong> ${name}</p><p><strong>Stars:</strong> ${'★'.repeat(starNum)}${'☆'.repeat(5 - starNum)} (${starNum}/5)</p><p><strong>Review:</strong></p><p>${message}</p>`);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = reviewRoutes;
