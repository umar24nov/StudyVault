const admin = require('firebase-admin');

function initFirebase(env) {
  if (!admin.apps.length) {
    // Normalize private key newlines — handle literal \n, double-escaped \\n, or real newlines
    const pk = env.FIREBASE_PRIVATE_KEY
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .trim();

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey:  pk
      })
    });
  }
  return admin.firestore();
}

module.exports = { initFirebase };
