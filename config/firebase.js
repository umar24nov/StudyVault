const admin = require('firebase-admin');

function initFirebase(env) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey:  env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  }
  return admin.firestore();
}

module.exports = { initFirebase };
