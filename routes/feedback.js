const express = require('express');
const { sendEmail } = require('../config/email');
const { writeLimiter } = require('../middleware/rateLimit');

function feedbackRoutes(db) {
  const router = express.Router();

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

  router.post('/contact', writeLimiter, async (req, res, next) => {
    try {
      const { name, email, message } = req.body;
      if (!name || !email || !message)
        return res.status(400).json({ error: 'All fields required' });

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        return res.status(400).json({ error: 'Invalid email address' });

      await db.collection('contacts').add({
        name, email, message,
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
      });

      await sendEmail(`New contact from ${name}`, `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong></p><p>${message}</p>`);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = feedbackRoutes;
