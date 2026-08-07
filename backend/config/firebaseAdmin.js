// Compatibility facade — firebase-admin v14 is modularized (no more
// admin.firestore / admin.credential / admin.auth namespaces). This module
// restores the classic namespace API on the firebase-admin singleton so the
// rest of the codebase keeps working unchanged. Load it before any route.
const admin = require('firebase-admin');
const { cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

if (!admin.firestore) {
  const db = () => getFirestore();
  db.FieldValue = FieldValue;
  admin.firestore = db;
}
if (!admin.auth) admin.auth = () => getAuth();
if (!admin.credential) admin.credential = { cert };
if (!admin.apps) admin.apps = admin.getApps ? admin.getApps() : [];

module.exports = admin;
