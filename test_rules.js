const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'tecnopan-inventory',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('artifacts/tecnopan-inventory-app/config/access_allowlist').set({
      emails: ['test@example.com', 'another@gmail.com']
    });
  });

  const alice = testEnv.authenticatedContext('alice', {
    email: 'test@example.com',
    email_verified: true
  });

  const db = alice.firestore();

  try {
    await assertSucceeds(db.collection('artifacts/tecnopan-inventory-app/public/data/inventory').get());
    console.log('Read inventory succeeded for test@example.com');
  } catch (e) {
    console.error('Read inventory failed for test@example.com:', e);
  }

  const bob = testEnv.authenticatedContext('bob', {
    email: 'another@gmail.com',
    email_verified: true
  });

  const dbBob = bob.firestore();

  try {
    await assertSucceeds(dbBob.collection('artifacts/tecnopan-inventory-app/public/data/inventory').get());
    console.log('Read inventory succeeded for another@gmail.com');
  } catch (e) {
    console.error('Read inventory failed for another@gmail.com:', e);
  }

  const charlie = testEnv.authenticatedContext('charlie', {
    email: 'sahjin.ribeiro@gmail.com',
    email_verified: true
  });

  const dbCharlie = charlie.firestore();

  try {
    await assertSucceeds(dbCharlie.collection('artifacts/tecnopan-inventory-app/public/data/inventory').get());
    console.log('Read inventory succeeded for sahjin.ribeiro@gmail.com (fallback)');
  } catch (e) {
    console.error('Read inventory failed for sahjin.ribeiro@gmail.com:', e);
  }

  await testEnv.cleanup();
}

run().catch(console.error);
