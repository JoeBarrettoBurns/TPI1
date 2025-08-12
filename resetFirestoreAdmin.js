// resetFirestoreAdmin.js
// Use Firebase Admin SDK to delete Firestore data safely (bypasses security rules).
// Prereqs:
//   1) Install deps: npm i -D firebase-admin
//   2) Provide credentials (one of):
//      - Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path
//      - Or run in an environment with Application Default Credentials
// Usage:
//   node resetFirestoreAdmin.js --dry-run                 # show counts only
//   node resetFirestoreAdmin.js                           # delete inventory, usage_logs, purchase_orders
//   node resetFirestoreAdmin.js --include-materials       # also delete materials

const admin = require('firebase-admin');

try {
  admin.initializeApp({
    // Prefer ADC via GOOGLE_APPLICATION_CREDENTIALS; this works on CI or local dev if env var is set.
    credential: admin.credential.applicationDefault(),
  });
} catch (e) {
  console.error('Failed to initialize Firebase Admin. Ensure credentials are configured.');
  throw e;
}

const db = admin.firestore();

// Match the client appId used in the app paths
const appId = 'tecnopan-inventory-app';
const basePath = `artifacts/${appId}/public/data`;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const includeMaterials = args.includes('--include-materials');

// Core collections to clear for a fresh start (sheets = inventory; logs = usage_logs)
const collectionsToClear = ['inventory', 'usage_logs', 'purchase_orders'];
if (includeMaterials) {
  collectionsToClear.push('materials');
}

async function countDocs(collectionPath) {
  const snap = await db.collection(collectionPath).get();
  return snap.size;
}

async function deleteAllDocsInCollection(collectionPath) {
  // Chunked batched deletes to stay under Firestore batch limits
  let totalDeleted = 0;
  while (true) {
    const snap = await db.collection(collectionPath).limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
  }
  return totalDeleted;
}

(async () => {
  console.log(`\nFirestore reset via Admin SDK${isDryRun ? ' (dry run)' : ''}`);
  console.log(`Project: ${(await admin.app().options.projectId) || '(using ADC project)'}`);
  console.log(`AppId path: ${appId}`);
  console.log(`Base path: ${basePath}`);
  console.log('Collections:', collectionsToClear.join(', '), '\n');

  if (isDryRun) {
    for (const coll of collectionsToClear) {
      const path = `${basePath}/${coll}`;
      const n = await countDocs(path);
      console.log(`[DRY] ${coll}: ${n} docs would be deleted`);
    }
    console.log('\nDry run complete. No data was changed.');
    process.exit(0);
  }

  let totalDeleted = 0;
  for (const coll of collectionsToClear) {
    const path = `${basePath}/${coll}`;
    const deleted = await deleteAllDocsInCollection(path);
    totalDeleted += deleted;
    console.log(`Deleted ${deleted} docs from ${coll}`);
  }

  console.log(`\nDone. Total deleted: ${totalDeleted} documents.`);
  console.log('Note: backups are not removed by this script.');
})();


