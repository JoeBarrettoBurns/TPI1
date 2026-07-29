// diffLogHistory.js — READ ONLY. Does not modify any data.
//
// Proves (or disproves) "log quantities are silently changing." It walks every
// backup snapshot stored in Firestore, reconstructs the history of each usage
// log, and reports any log whose qty, detail count, or set of sheet ids changed
// from one snapshot to the next — and finally from the most recent backup to the
// CURRENT live data.
//
// Setup (one time):
//   Firebase Console -> Project Settings -> Service accounts ->
//   "Generate new private key". Then (Git Bash):
//     GOOGLE_APPLICATION_CREDENTIALS="/c/path/to/key.json" node diffLogHistory.js
//   Optional focus on one length:
//     GOOGLE_APPLICATION_CREDENTIALS="..." node diffLogHistory.js --length=144
//
// Nothing here writes — safe to run anytime.

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const appId = 'tecnopan-inventory-app';
const base = `artifacts/${appId}/public/data`;

const lengthArg = (process.argv.slice(2).find((a) => a.startsWith('--length=')) || '').split('=')[1];
const FILTER_LEN = lengthArg ? parseInt(lengthArg, 10) : null;

const sheetMatches = (d) => FILTER_LEN == null || d.length === FILTER_LEN;
// Per-length consumed counts for a log's details (so we can see WHICH size changed).
function lengthCounts(details = []) {
  const c = {};
  details.forEach((d) => {
    if (!sheetMatches(d)) return;
    c[d.length] = (c[d.length] || 0) + 1;
  });
  return c;
}
const fmtCounts = (c) =>
  Object.keys(c).length ? Object.entries(c).map(([l, n]) => `${l}":${n}`).join(' ') : '(none matching)';
const idSet = (details = []) => new Set(details.filter((d) => d.id && sheetMatches(d)).map((d) => d.id));
const setDiff = (a, b) => [...a].filter((x) => !b.has(x));

async function loadLogs(path) {
  const snap = await db.collection(path).get();
  const map = new Map();
  snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  return map;
}

(async () => {
  // Collect backup ids (timestamped) in chronological order.
  const backupsRoot = await db.collection(`${base}/backups`).get();
  const backupIds = backupsRoot.docs.map((d) => d.id).filter(Boolean).sort(); // ISO-ish ids sort chronologically

  console.log(`\n=== Usage-log history diff (READ ONLY) ===`);
  console.log(`Backups found: ${backupIds.length}${FILTER_LEN != null ? ` | length filter ${FILTER_LEN}` : ''}`);
  if (backupIds.length === 0) {
    console.log('No backups exist, so history cannot be reconstructed. Make a backup now (in-app Backup),');
    console.log('then run this again after the next time the count looks wrong to compare the two snapshots.');
  }

  // Build the ordered list of snapshots: each backup, then the live data last.
  const snapshots = [];
  for (const id of backupIds) {
    snapshots.push({ label: `backup ${id}`, logs: await loadLogs(`${base}/backups/${id}/usage_logs`) });
  }
  snapshots.push({ label: 'LIVE (current)', logs: await loadLogs(`${base}/usage_logs`) });

  let changeCount = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const header = `\n--- ${prev.label}  ->  ${curr.label} ---`;
    const lines = [];

    curr.logs.forEach((log, id) => {
      const before = prev.logs.get(id);
      if (!before) return; // newly created log — not a silent edit of an existing one
      const beforeN = (before.details || []).length;
      const afterN = (log.details || []).length;
      const beforeQty = Math.abs(before.qty ?? beforeN);
      const afterQty = Math.abs(log.qty ?? afterN);

      const bIds = idSet(before.details);
      const aIds = idSet(log.details);
      const added = setDiff(aIds, bIds);
      const removed = setDiff(bIds, aIds);

      const qtyChanged = beforeQty !== afterQty || beforeN !== afterN;
      const membershipChanged = added.length > 0 || removed.length > 0;
      if (!qtyChanged && !membershipChanged) return;

      changeCount++;
      lines.push(
        `  LOG ${id} | ${log.job} / ${log.customer} | status ${before.status || 'Completed'} -> ${log.status || 'Completed'}`
      );
      if (qtyChanged) {
        lines.push(`      qty ${beforeQty} -> ${afterQty}   |   details ${beforeN} -> ${afterN}`);
        lines.push(`      per-length(before): ${fmtCounts(lengthCounts(before.details))}`);
        lines.push(`      per-length(after):  ${fmtCounts(lengthCounts(log.details))}`);
      }
      if (added.length) lines.push(`      + sheets added:   ${added.join(', ')}`);
      if (removed.length) lines.push(`      - sheets removed: ${removed.join(', ')}`);
      if (log.lastEditedAt) lines.push(`      lastEditedBy ${log.lastEditedBy || '?'} @ ${log.lastEditedAt}`);
    });

    if (lines.length) {
      console.log(header);
      lines.forEach((l) => console.log(l));
    }
  }

  console.log(`\n=== ${changeCount} usage log(s) had their quantity/sheets change between snapshots ===`);
  if (changeCount === 0 && snapshots.length > 1) {
    console.log('No existing log had its quantities silently rewritten across the snapshots available.');
  }
  console.log('(no data was modified)\n');
  process.exit(0);
})().catch((e) => {
  console.error('\nDiff failed:', e.message);
  console.error('If this is a credentials error, set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON path.');
  process.exit(1);
});
