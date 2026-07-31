// In-app notification helper. Creates a Firestore document under
// `notifications/{uid}` keyed by user id, plus an auto-generated doc id.

const admin = require('firebase-admin');

// Creates a notification document for a user. Never throws.
async function createNotification(db, { uid, type, title, message, link }) {
  if (!uid) return;
  try {
    await db.collection('notifications').add({
      uid,
      type: type || 'info',
      title: String(title || '').slice(0, 200),
      message: String(message || '').slice(0, 500),
      link: String(link || ''),
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Notification create failed:', err.message);
  }
}

module.exports = { createNotification };
