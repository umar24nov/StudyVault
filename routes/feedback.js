const express = require('express');
const { writeLimiter } = require('../middleware/rateLimit');

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const { Resend } = require('resend');
  return new Resend(key);
}

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

  // POST /api/feedback/contact
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

      // Send email notification via Resend (if configured)
      const resend = getResend();
      if (resend) {
        try {
          await resend.emails.send({
            from: 'StudyVault <onboarding@resend.dev>',
            to: ['studyvaultapp@gmail.com'],
            subject: `New contact from ${name}`,
            html: `<p><strong>Name:</strong> ${name}</p>
                   <p><strong>Email:</strong> ${email}</p>
                   <p><strong>Message:</strong></p>
                   <p>${message}</p>`
          });
        } catch (emailErr) {
          console.error('Email send failed:', emailErr.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = feedbackRoutes;
