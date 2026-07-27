// Firebase Auth verification middleware
// Verifies the Firebase ID token sent by the frontend SDK.
// This lets you know WHO is making each request without managing sessions.

const admin = require('firebase-admin');

// Extract and verify the Firebase ID token from the Authorization header.
// On success, attaches the decoded user to req.user.
async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authentication token provided.' });
  }

  const idToken = header.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;  // { uid, email, name, picture, ... }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Optional auth — doesn't reject unauthenticated users,
// but attaches user info if present.
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();  // No token? That's fine, continue without user.
  }
  const idToken = header.split('Bearer ')[1];
  try {
    req.user = await admin.auth().verifyIdToken(idToken);
  } catch (_err) {
    // Invalid token — just continue without user info
  }
  next();
}

// Check if the authenticated user is an admin.
// Admin UIDs are stored in Firestore collection 'admins'.
async function requireAdminAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const db = admin.firestore();
    const adminDoc = await db.collection('admins').doc(req.user.uid).get();
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify admin status.' });
  }
}

module.exports = { verifyToken, optionalAuth, requireAdminAuth };
