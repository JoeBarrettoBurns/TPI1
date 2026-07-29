// src/utils/backupService.ts

import { collection, doc, getDocs, writeBatch, setDoc, getDoc, collectionGroup } from '../firebase/firestoreWithTracking';

export function generateBackupId(date: Date = new Date()): string {
  // YYYY-MM-DDTHH-mm-ss
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const MM = pad(date.getMinutes());
  const SS = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}T${HH}-${MM}-${SS}`;
}

export async function backupCollections(db: any, appId: string, collectionsToBackup: string[]) {
  const backupId = generateBackupId();
  // Store backups under public/data to match existing structure and permissions
  const rootPath = `artifacts/${appId}/public/data/backups/${backupId}`;

  let totalDocs = 0;

  for (const coll of collectionsToBackup) {
    const srcRef = collection(db, `artifacts/${appId}/public/data/${coll}`);
    const snap = await getDocs(srcRef);

    let batch = writeBatch(db);
    let ops = 0;
    for (const docSnap of snap.docs) {
      const dstRef = doc(db, `${rootPath}/${coll}`, docSnap.id);
      batch.set(dstRef, docSnap.data());
      ops += 1;
      totalDocs += 1;
      if (ops >= 450) {
        // commit periodically to stay well under 500 limit
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }
  }

  // Write metadata
  // Track latest backup under public/data as well
  const metaRef = doc(db, 'artifacts', appId, 'public', 'data', 'backups_meta', 'latest');
  await setDoc(metaRef, { id: backupId, createdAt: new Date().toISOString(), totalDocs }, { merge: true });

  // Also create a document for this backup so it appears in list queries
  const backupDocRef = doc(db, `artifacts/${appId}/public/data/backups`, backupId);
  await setDoc(backupDocRef, { createdAt: new Date().toISOString(), totalDocs }, { merge: true });

  return { backupId, totalDocs };
}

export async function getLatestBackupInfo(db: any, appId: string) {
  // Single canonical location under public/data
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'backups_meta', 'latest');
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Restore collections from a backup.
 *
 * Two safety rules, both learned the hard way:
 *
 * 1. A backup that holds NO documents for a collection never clears that
 *    collection. Older backups predate some collections, and a backup run can
 *    fail part-way, so "the source is empty" must mean "nothing to restore
 *    here", not "delete everything the business currently has".
 * 2. Restored documents are written BEFORE stale ones are pruned. Firestore has
 *    no multi-collection transaction, so a restore is always interruptible; this
 *    ordering means an interruption leaves extra documents (visible and
 *    removable) instead of a hole where the live data used to be.
 *
 * Skipped collections are returned so the caller can tell the user plainly.
 */
export async function restoreCollectionsFromBackup(db: any, appId: string, backupId: string, collectionsToRestore: string[], onProgress?: (info: any) => void) {
  const rootPath = `artifacts/${appId}/public/data/backups/${backupId}`;
  let restored = 0;
  let removed = 0;
  const skipped: string[] = [];

  for (const coll of collectionsToRestore) {
    const collectionPath = `artifacts/${appId}/public/data/${coll}`;
    const snap = await getDocs(collection(db, `${rootPath}/${coll}`));
    onProgress?.({ phase: 'read', collection: coll, count: snap.size });

    if (snap.empty) {
      skipped.push(coll);
      onProgress?.({ phase: 'skipped-empty', collection: coll });
      continue;
    }

    // WRITE first: upsert every document the backup holds.
    const restoredIds = new Set<string>();
    let batch = writeBatch(db);
    let ops = 0;
    for (const docSnap of snap.docs) {
      restoredIds.add(docSnap.id);
      batch.set(doc(db, collectionPath, docSnap.id), docSnap.data());
      ops += 1;
      restored += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
        onProgress?.({ phase: 'write-progress', collection: coll, restored });
      }
    }
    if (ops > 0) await batch.commit();

    // PRUNE second: drop only live documents the backup does not contain.
    const existingSnap = await getDocs(collection(db, collectionPath));
    let delBatch = writeBatch(db);
    let dels = 0;
    for (const d of existingSnap.docs) {
      if (restoredIds.has(d.id)) continue;
      delBatch.delete(doc(db, collectionPath, d.id));
      dels += 1;
      removed += 1;
      if (dels >= 450) {
        await delBatch.commit();
        delBatch = writeBatch(db);
        dels = 0;
        onProgress?.({ phase: 'delete-progress', collection: coll });
      }
    }
    if (dels > 0) await delBatch.commit();

    onProgress?.({ phase: 'collection-complete', collection: coll });
  }

  return { restored, removed, skipped };
}

export async function repairInventoryMaterialKeys(db: any, appId: string, materialsKeys: any[]) {
  // Normalize inventory.materialType to one of materialsKeys using hyphen/slash variants
  const srcRef = collection(db, `artifacts/${appId}/public/data/inventory`);
  const snap = await getDocs(srcRef);

  const keys = new Set(materialsKeys);
  const makeVariants = (k: string) => Array.from(new Set([k, k.replace(/\//g, '-'), k.replace(/-/g, '/')]));

  let updated = 0;
  let batch = writeBatch(db);
  let ops = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const mt = data.materialType;
    if (!keys.has(mt)) {
      const candidates = makeVariants(mt).filter((v) => keys.has(v));
      if (candidates.length === 1) {
        batch.update(doc(db, `artifacts/${appId}/public/data/inventory`, docSnap.id), { materialType: candidates[0] });
        updated += 1;
        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
  return { updated };
}

export async function listBackups(db: any, appId: string) {
  // Query the canonical backups collection under public/data
  const all = [];
  try {
    const ref = collection(db, `artifacts/${appId}/public/data/backups`);
    const snap = await getDocs(ref);
    all.push(...snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) })));
  } catch (e) {
    // If this fails due to missing list docs, fall back to collectionGroup scan below
  }

  // If nothing was found, infer backup IDs by scanning subcollections under the backups tree
  if (all.length === 0) {
    try {
      const subNames = ['materials', 'inventory', 'usage_logs'];
      const idSet = new Set();
      // Use collection group to find subcollections and extract backupId from path
      for (const sub of subNames) {
        const cg = await getDocs(collectionGroup(db, sub));
        cg.docs.forEach((d: any) => {
          const path = d.ref.path;
          // Look for the canonical root only
          const marker = `/artifacts/${appId}/public/data/backups/`;
          if (!path.includes(marker)) return;
          // path example: artifacts/<appId>/public/data/backups/<backupId>/<sub>/<docId>
          const rest = path.split(marker)[1] || '';
          const parts = rest.split('/');
          const backupId = parts[0];
          if (backupId) idSet.add(backupId);
        });
      }
      all.push(...Array.from(idSet).map((id) => ({ id })));
    } catch (e) {
      // Best-effort only
    }
  }

  const dedup: any[] = Object.values(
    all.reduce((acc: Record<string, any>, item: any) => {
      acc[item.id] = { ...(acc[item.id] || {}), ...item };
      return acc;
    }, {})
  );

  return dedup.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export async function backfillBackupIndex(db: any, appId: string) {
  // Ensure there are listing docs under public/data/backups for discovered backup IDs
  let discovered = await listBackups(db, appId);
  // If nothing discovered, at least ensure the latest meta id is indexed
  if (!discovered || discovered.length === 0) {
    try {
      const latest = await getLatestBackupInfo(db, appId);
      if (latest?.id) {
        discovered = [{ id: latest.id, createdAt: latest.createdAt, totalDocs: latest.totalDocs }];
      }
    } catch {}
  }
  let created = 0;
  for (const b of discovered) {
    try {
      const ref = doc(db, `artifacts/${appId}/public/data/backups`, b.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { createdAt: b.createdAt || new Date().toISOString(), totalDocs: b.totalDocs || undefined }, { merge: true });
        created += 1;
      }
    } catch (e) {
      // ignore individual failures and continue
    }
  }
  return { created, total: discovered.length };
}


