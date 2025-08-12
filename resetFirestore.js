// resetFirestore.js
// Batch-delete Firestore data for a clean slate while keeping Firebase setup intact.
// Usage:
//   node resetFirestore.js --dry-run                 # show counts only
//   node resetFirestore.js                           # delete inventory, usage_logs, purchase_orders
//   node resetFirestore.js --include-materials       # also delete materials

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch, doc } = require('firebase/firestore');

// Firebase config copied from src/firebase/config.js / uploadMaterials.js (Firestore only usage)
const firebaseConfig = {
  apiKey: "AIzaSyCwDsY4PMsQPVNnse9WAaszlwIeddeiUGc",
  authDomain: "technopan-inventory.firebaseapp.com",
  projectId: "technopan-inventory",
  storageBucket: "technopan-inventory.firebasestorage.app",
  messagingSenderId: "461563876434",
  appId: "1:461563876434:web:f852fe555fd5ef29163b8b",
  measurementId: "G-RKKP2Z5621"
};

const appId = 'tecnopan-inventory-app';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const includeMaterials = args.includes('--include-materials');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const basePath = `artifacts/${appId}/public/data`;

// Core collections to clear for a fresh start (sheets = inventory; logs = usage_logs)
const collectionsToClear = ['inventory', 'usage_logs', 'purchase_orders'];
if (includeMaterials) {
  collectionsToClear.push('materials');
}

async function deleteAllDocsInCollection(collectionPath) {
  const snap = await getDocs(collection(db, collectionPath));
  if (snap.empty) return 0;

  let batch = writeBatch(db);
  let ops = 0;
  let deleted = 0;

  for (const d of snap.docs) {
    batch.delete(doc(db, collectionPath, d.id));
    ops += 1;
    deleted += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
  return deleted;
}

(async () => {
  try {
    console.log(`\nFirestore reset${isDryRun ? ' (dry run)' : ''}`);
    console.log(`Project: ${firebaseConfig.projectId}`);
    console.log(`AppId path: ${appId}`);
    console.log(`Base path: ${basePath}`);
    console.log('Collections:', collectionsToClear.join(', '), '\n');

    if (isDryRun) {
      for (const coll of collectionsToClear) {
        const path = `${basePath}/${coll}`;
        const snap = await getDocs(collection(db, path));
        console.log(`[DRY] ${coll}: ${snap.size} docs would be deleted`);
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
  } catch (err) {
    console.error('Reset failed:', err);
    process.exit(1);
  }
})();


