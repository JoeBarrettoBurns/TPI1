// src/utils/backupService.js

import { collection, doc, getDocs, writeBatch, setDoc, getDoc } from 'firebase/firestore';

export function generateBackupId(date = new Date()) {
  // YYYY-MM-DDTHH-mm-ss
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const MM = pad(date.getMinutes());
  const SS = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}T${HH}-${MM}-${SS}`;
}

export async function backupCollections(db, appId, collectionsToBackup) {
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

  return { backupId, totalDocs };
}

export async function getLatestBackupInfo(db, appId) {
  const metaRef = doc(db, 'artifacts', appId, 'public', 'backups_meta', 'latest');
  const snap = await getDoc(metaRef);
  if (!snap.exists()) return null;
  return snap.data();
}

export async function restoreCollectionsFromBackup(db, appId, backupId, collectionsToRestore) {
  const rootPath = `artifacts/${appId}/public/data/backups/${backupId}`;
  let restored = 0;

  for (const coll of collectionsToRestore) {
    const srcRef = collection(db, `${rootPath}/${coll}`);
    const snap = await getDocs(srcRef);

    let batch = writeBatch(db);
    let ops = 0;
    for (const docSnap of snap.docs) {
      const dstRef = doc(db, `artifacts/${appId}/public/data/${coll}`, docSnap.id);
      batch.set(dstRef, docSnap.data());
      ops += 1;
      restored += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) {
      await batch.commit();
    }
  }

  return { restored };
}

export async function repairInventoryMaterialKeys(db, appId, materialsKeys) {
  // Normalize inventory.materialType to one of materialsKeys using hyphen/slash variants
  const srcRef = collection(db, `artifacts/${appId}/public/data/inventory`);
  const snap = await getDocs(srcRef);

  const keys = new Set(materialsKeys);
  const makeVariants = (k) => Array.from(new Set([k, k.replace(/\//g, '-'), k.replace(/-/g, '/')]));

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


