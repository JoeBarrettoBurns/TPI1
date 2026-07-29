// diagnoseCounts.js — READ ONLY. Does not modify any data.
//
// Explains the gap between the dashboard on-hand count and the physical count by
// dumping the true status of every sheet and the usage logs that claim them.
//
// Setup (one time):
//   1) Firebase Console -> Project Settings -> Service accounts ->
//      "Generate new private key". Save the JSON somewhere private.
//   2) Run (Git Bash):
//        GOOGLE_APPLICATION_CREDENTIALS="/c/path/to/key.json" node diagnoseCounts.js
//      Or focus on one length / material:
//        GOOGLE_APPLICATION_CREDENTIALS="..." node diagnoseCounts.js --length=144
//        GOOGLE_APPLICATION_CREDENTIALS="..." node diagnoseCounts.js --length=144 --material="ALUMINUM .063"
//
// Nothing here writes — safe to run anytime.

const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const appId = 'tecnopan-inventory-app';
const base = `artifacts/${appId}/public/data`;

const args = process.argv.slice(2);
const lengthArg = (args.find((a) => a.startsWith('--length=')) || '').split('=')[1];
const materialArg = (args.find((a) => a.startsWith('--material=')) || '').split('=')[1];
const FILTER_LEN = lengthArg ? parseInt(lengthArg, 10) : null;
const FILTER_MAT = materialArg || null;

const matchSheet = (s) =>
  (FILTER_LEN == null || s.length === FILTER_LEN) &&
  (FILTER_MAT == null || s.materialType === FILTER_MAT);

(async () => {
  const [invSnap, logSnap] = await Promise.all([
    db.collection(`${base}/inventory`).get(),
    db.collection(`${base}/usage_logs`).get(),
  ]);

  const inventory = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const logs = logSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`\n=== Firestore diagnostic (READ ONLY) ===`);
  console.log(`inventory docs: ${inventory.length} | usage_logs: ${logs.length}`);
  if (FILTER_LEN != null) console.log(`Filter: length=${FILTER_LEN}`);
  if (FILTER_MAT != null) console.log(`Filter: material=${FILTER_MAT}`);

  // 1) Live inventory status breakdown for the filtered sheets.
  const filtered = inventory.filter(matchSheet);
  const byStatus = {};
  filtered.forEach((s) => {
    const k = `${s.materialType} @ ${s.length}" | ${s.status || '(no status)'}`;
    byStatus[k] = (byStatus[k] || 0) + 1;
  });
  console.log(`\n--- Inventory docs by material/length/status (filtered) ---`);
  Object.entries(byStatus).sort().forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

  const onHand = filtered.filter((s) => s.status === 'On Hand').length;
  const ordered = filtered.filter((s) => s.status === 'Ordered').length;
  const usedDocs = filtered.filter((s) => s.status === 'Used').length;
  console.log(`\n  TOTAL filtered docs: ${filtered.length}  (On Hand ${onHand}, Ordered ${ordered}, Used ${usedDocs})`);
  console.log(`  -> Dashboard "current inventory" shows On Hand = ${onHand}.`);
  console.log(`  -> Physical sheets should equal On Hand + Used-but-still-physically-present.`);

  // 2) Which logs claim the filtered sheets, and were they edited?
  const filteredIds = new Set(filtered.map((s) => s.id));
  console.log(`\n--- Usage logs that CONSUME these sheets (status->Used claims) ---`);
  const claimingLogs = logs.filter((l) =>
    (l.details || []).some((d) => matchSheet(d) || (d.id && filteredIds.has(d.id)))
  );
  if (claimingLogs.length === 0) console.log('  (none)');
  claimingLogs
    .sort((a, b) => String(a.usedAt || a.createdAt).localeCompare(String(b.usedAt || b.createdAt)))
    .forEach((l) => {
      const matchCount = (l.details || []).filter((d) => matchSheet(d)).length;
      const edited = l.lastEditedAt ? ` | EDITED ${l.lastEditedAt} by ${l.lastEditedBy || '?'}` : '';
      console.log(
        `  log ${l.id} | ${l.job} / ${l.customer} | status=${l.status || 'Completed'} | ` +
          `qty=${l.qty} details=${(l.details || []).length} (matching ${matchCount}) | ` +
          `usedAt=${l.usedAt || '-'} createdAt=${l.createdAt || '-'}${edited}`
      );
    });

  // 3) Integrity checks (mirror of in-app auditCounts).
  console.log(`\n--- Integrity issues (all materials) ---`);
  const completed = logs.filter((l) => (l.status || 'Completed') === 'Completed' && (l.status || '') !== 'Archived');
  const sheetToLog = new Map();
  const issues = [];
  completed.forEach((log) => {
    const seen = new Set();
    (log.details || []).forEach((d) => {
      if (!d.id) return;
      if (seen.has(d.id)) issues.push(`DUP-IN-LOG sheet ${d.id} twice on log ${log.id} (${log.job})`);
      seen.add(d.id);
      if (sheetToLog.has(d.id)) issues.push(`TWO-LOGS sheet ${d.id} on logs ${sheetToLog.get(d.id)} AND ${log.id}`);
      else sheetToLog.set(d.id, log.id);
    });
  });
  const liveById = new Map(inventory.filter((i) => i.id).map((i) => [i.id, i]));
  sheetToLog.forEach((logId, sheetId) => {
    const live = liveById.get(sheetId);
    if (live) issues.push(`LIVE-AND-USED sheet ${sheetId} is ${live.status} in inventory but used by log ${logId}`);
  });
  logs.forEach((l) => {
    if (typeof l.qty === 'number' && Math.abs(l.qty) !== (l.details || []).length && (l.status || '') !== 'Archived') {
      issues.push(`QTY-MISMATCH log ${l.id} (${l.job}) qty=${Math.abs(l.qty)} but ${(l.details || []).length} snapshots`);
    }
  });
  if (issues.length === 0) console.log('  none found');
  else issues.forEach((i) => console.log('  ' + i));

  // 4) Recently edited logs (the "logs getting modified" hunch).
  console.log(`\n--- 15 most recently edited usage logs ---`);
  logs
    .filter((l) => l.lastEditedAt)
    .sort((a, b) => String(b.lastEditedAt).localeCompare(String(a.lastEditedAt)))
    .slice(0, 15)
    .forEach((l) =>
      console.log(
        `  ${l.lastEditedAt} | by ${l.lastEditedBy || '?'} | log ${l.id} | ${l.job} | status=${l.status} | qty=${l.qty}`
      )
    );

  // 5) Logs the SYSTEM touched automatically (auto-fulfill / auto-receive).
  console.log(`\n--- Logs last edited automatically by the system ("Auto ...") ---`);
  const autoEdited = logs.filter((l) => String(l.lastEditedBy || '').startsWith('Auto'));
  if (autoEdited.length === 0) console.log('  none — the system has not auto-edited any log');
  autoEdited
    .sort((a, b) => String(b.lastEditedAt).localeCompare(String(a.lastEditedAt)))
    .forEach((l) => {
      const matchCount = (l.details || []).filter((d) => matchSheet(d)).length;
      console.log(
        `  ${l.lastEditedAt} | log ${l.id} | ${l.job} / ${l.customer} | status=${l.status} | ` +
          `qty=${l.qty} | fulfilledAt=${l.fulfilledAt || '-'} | matching-sheets=${matchCount}`
      );
    });

  // 6) Pending scheduled uses that WILL auto-consume on-hand stock when their date passes.
  console.log(`\n--- Pending SCHEDULED uses (these auto-consume stock at their date) ---`);
  const scheduled = logs.filter((l) => (l.status || '') === 'Scheduled');
  if (scheduled.length === 0) console.log('  none');
  scheduled
    .sort((a, b) => String(a.usedAt).localeCompare(String(b.usedAt)))
    .forEach((l) => {
      const matchCount = (l.details || []).filter((d) => matchSheet(d)).length;
      console.log(
        `  due ${l.usedAt} | log ${l.id} | ${l.job} / ${l.customer} | qty=${l.qty} | ` +
          `matching-sheets=${matchCount} | createdBy=${l.createdBy || '?'}`
      );
    });

  console.log('\n=== done (no data was modified) ===\n');
  process.exit(0);
})().catch((e) => {
  console.error('\nDiagnostic failed:', e.message);
  console.error('If this is a credentials error, set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON path.');
  process.exit(1);
});
