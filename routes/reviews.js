const express = require('express');
const { sendEmail } = require('../config/email');
const { verifyToken } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

function reviewRoutes(db) {
  const router = express.Router();

  // GET /api/reviews — top 3 approved by stars
  router.get('/', async (req, res, next) => {
    try {
      const snapshot = await db.collection('reviews')
        .where('status', '==', 'approved')
        .orderBy('stars', 'desc')
        .limit(3)
        .get();
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

  // POST /api/reviews — requires auth (default pending)
  router.post('/', verifyToken, writeLimiter, async (req, res, next) => {
    try {
      const { name, message, stars } = req.body;
      if (!name || !message || !stars)
        return res.status(400).json({ error: 'All fields required' });

      const starNum = parseInt(stars);
      if (starNum < 1 || starNum > 5)
        return res.status(400).json({ error: 'Stars must be between 1 and 5' });

      await db.collection('reviews').add({
        name, message,
        stars: starNum,
        status: 'pending',
        userId: req.user.uid,
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
      });
      res.status(201).json({ success: true });

      sendEmail(`New review from ${name}`, `<p><strong>Name:</strong> ${name}</p><p><strong>Stars:</strong> ${'★'.repeat(starNum)}${'☆'.repeat(5 - starNum)} (${starNum}/5)</p><p><strong>Review:</strong></p><p>${message}</p>`);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = reviewRoutes;
