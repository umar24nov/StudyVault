const express = require('express');
const { sendEmail } = require('../config/email');
const { writeLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const { feedbackSchema, contactSchema } = require('../middleware/schemas');

function feedbackRoutes(db) {
  const router = express.Router();

  router.post('/', writeLimiter, validate(feedbackSchema), async (req, res, next) => {
    try {
      const { type, message } = req.body;
      await db.collection('feedback').add({
        type: type || 'other', message,
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/contact', writeLimiter, validate(contactSchema), async (req, res, next) => {
    try {
      const { name, email, message } = req.body;
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
