require('dotenv').config();
const admin = require('firebase-admin');

function normalizeKey(pk) {
  return pk
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('Missing Firebase env vars. Make sure .env is set up.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: normalizeKey(FIREBASE_PRIVATE_KEY),
  }),
});

const db = admin.firestore();

async function migrate(collection) {
  const snapshot = await db.collection(collection).get();
  const batch = db.batch();
  let count = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data.status || !['approved', 'pending', 'rejected'].includes(data.status)) {
      batch.update(doc.ref, { status: 'approved' });
      count++;
    }
  });

  if (count === 0) {
    console.log(`${collection}: nothing to migrate.`);
    return;
  }

  await batch.commit();
  console.log(`${collection}: ${count} documents updated to status='approved'.`);
}

(async () => {
  await migrate('papers');
  await migrate('reviews');
  console.log('Done.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
