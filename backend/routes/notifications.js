const express = require('express');
const admin = require('firebase-admin');
const { verifyToken } = require('../middleware/auth');

function notificationRoutes(db) {
  const router = express.Router();

  router.use(verifyToken);

  // GET /api/notifications — list current user's notifications
  router.get('/', async (req, res, next) => {
    try {
      const snapshot = await db.collection('notifications')
        .where('uid', '==', req.user.uid)
        .get();

      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const time = t => (t && t.seconds) || (t && t._seconds) || 0;
      data.sort((a, b) => time(b.createdAt) - time(a.createdAt));

      res.json({
        unread: data.filter(n => !n.read).length,
        data: data.slice(0, 50)
      });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/notifications/:id/read — mark one notification as read
  router.patch('/:id/read', async (req, res, next) => {
    try {
      const ref = db.collection('notifications').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Notification not found' });
      if (doc.data().uid !== req.user.uid) return res.status(403).json({ error: 'Not yours' });

      await ref.update({ read: true });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/notifications/read-all — mark all of the user's notifications as read
  router.post('/read-all', async (req, res, next) => {
    try {
      const snapshot = await db.collection('notifications')
        .where('uid', '==', req.user.uid)
        .get();
      const unread = snapshot.docs.filter(d => !d.data().read);
      await Promise.all(unread.map(d => d.ref.update({ read: true })));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = notificationRoutes;
