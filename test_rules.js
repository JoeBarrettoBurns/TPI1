// test_rules.js
//
// Firestore security-rules tests. Requires the Firestore emulator:
//   npx firebase emulators:exec --only firestore "node test_rules.js"
//
// Covers the allowlist gate: allowlisted/fallback-staff accounts get data access,
// strangers with a valid Google sign-in get nothing, and ONLY authorized accounts
// can modify the allowlist itself (a writable allowlist would let anyone with a
// Google account grant themselves access).

const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');

let failures = 0;

async function check(label, promise) {
  try {
    await promise;
    console.log(`PASS  ${label}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL  ${label}:`, e.message || e);
  }
}

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
      emails: ['test@example.com', 'another@gmail.com'],
    });
    await db.doc('artifacts/tecnopan-inventory-app/public/data/inventory/sheet1').set({
      materialType: '20GA-GALV',
      status: 'On Hand',
    });
  });

  const allowlisted = testEnv.authenticatedContext('alice', {
    email: 'test@example.com',
    email_verified: true,
  }).firestore();

  const gmailAllowlisted = testEnv.authenticatedContext('bob', {
    email: 'another@gmail.com',
    email_verified: true,
  }).firestore();

  const fallbackStaff = testEnv.authenticatedContext('charlie', {
    email: 'sahjin.ribeiro@gmail.com',
    email_verified: true,
  }).firestore();

  // Any random person can complete Google sign-in; the rules must still deny them.
  const stranger = testEnv.authenticatedContext('mallory', {
    email: 'intruder@gmail.com',
    email_verified: true,
  }).firestore();

  const unauthenticated = testEnv.unauthenticatedContext().firestore();

  const dataPath = 'artifacts/tecnopan-inventory-app/public/data/inventory';
  const allowlistPath = 'artifacts/tecnopan-inventory-app/config/access_allowlist';

  // --- Authorized access works ---
  await check('allowlisted account can read data',
    assertSucceeds(allowlisted.collection(dataPath).get()));
  await check('allowlisted gmail alias can read data',
    assertSucceeds(gmailAllowlisted.collection(dataPath).get()));
  await check('fallback staff can read data',
    assertSucceeds(fallbackStaff.collection(dataPath).get()));
  await check('allowlisted account can write data',
    assertSucceeds(allowlisted.doc(`${dataPath}/sheet2`).set({ materialType: 'TEST', status: 'On Hand' })));

  // --- Strangers are locked out of data ---
  await check('stranger cannot read data',
    assertFails(stranger.collection(dataPath).get()));
  await check('stranger cannot write data',
    assertFails(stranger.doc(`${dataPath}/sheet3`).set({ hacked: true })));
  await check('unauthenticated cannot read data',
    assertFails(unauthenticated.collection(dataPath).get()));

  // --- Allowlist: readable while signed in, but only authorized accounts may change it ---
  await check('stranger can read allowlist (needed for pre-access check)',
    assertSucceeds(stranger.doc(allowlistPath).get()));
  await check('stranger CANNOT add themselves to the allowlist',
    assertFails(stranger.doc(allowlistPath).set({ emails: ['intruder@gmail.com'] }, { merge: true })));
  await check('unauthenticated cannot write allowlist',
    assertFails(unauthenticated.doc(allowlistPath).set({ emails: ['intruder@gmail.com'] })));
  await check('fallback staff can update the allowlist',
    assertSucceeds(fallbackStaff.doc(allowlistPath).set({ emails: ['test@example.com', 'another@gmail.com', 'new.hire@example.com'] }, { merge: true })));
  await check('allowlisted account can update the allowlist',
    assertSucceeds(allowlisted.doc(allowlistPath).set({ emails: ['test@example.com', 'another@gmail.com'] }, { merge: true })));

  await testEnv.cleanup();

  if (failures > 0) {
    console.error(`\n${failures} rules test(s) FAILED`);
    process.exit(1);
  }
  console.log('\nAll rules tests passed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
