const admin = require('firebase-admin');

// Initialize the app with default credentials (if available) or we can just use the project ID
// Since we are in the project directory, we might need to use application default credentials.
// Let's try to initialize without credentials to see if it picks up the default ones.
try {
  admin.initializeApp({
    projectId: 'tecnopan-inventory'
  });

  const db = admin.firestore();

  async function check() {
    const doc = await db.doc('artifacts/tecnopan-inventory-app/config/access_allowlist').get();
    console.log('Exists:', doc.exists);
    if (doc.exists) {
      console.log('Data:', doc.data());
    }
  }

  check().catch(console.error);
} catch (e) {
  console.error('Failed to initialize:', e);
}