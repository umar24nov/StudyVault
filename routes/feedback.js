const express = require('express');
const { writeLimiter } = require('../middleware/rateLimit');

function feedbackRoutes(db) {
  const router = express.Router();

  // POST /api/feedback
  router.post('/', writeLimiter, async (req, res, next) => {
    try {
      const { type, message } = req.body;
      if (!message) return res.status(400).json({ error: 'Message is required' });
      await db.collection('feedback').add({
        type: type || 'other', message,
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/contact
  router.post('/contact', writeLimiter, async (req, res, next) => {
    try {
      const { name, email, message } = req.body;
      if (!name || !email || !message)
        return res.status(400).json({ error: 'All fields required' });

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        return res.status(400).json({ error: 'Invalid email address' });

      await db.collection('contacts').add({
        name, email, message,
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = feedbackRoutes;
