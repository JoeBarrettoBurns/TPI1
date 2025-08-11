// src/utils/materialMigrations.js

import { collection, doc, getDocs, getDoc, writeBatch, setDoc, query, where } from 'firebase/firestore';

// Replace every '/' in material IDs and names with '-'.
// Also updates all references in inventory.materialType and usage_logs[].details[].materialType
export async function replaceSlashWithDashInMaterialNames(db, appId) {
  const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);
  const inventoryRef = collection(db, `artifacts/${appId}/public/data/inventory`);
  const usageLogsRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);

  const matsSnap = await getDocs(materialsRef);

  const idRenames = []; // { oldId, newId, data }
  const nameOnlyUpdates = []; // { id, newName }

  matsSnap.forEach((docSnap) => {
    const id = docSnap.id;
    const data = docSnap.data() || {};
    // Determine new ID if slash present in ID
    if (id.includes('/')) {
      const newId = id.replace(/\//g, '-');
      if (newId !== id) {
        idRenames.push({ oldId: id, newId, data });
      }
    } else if (typeof data.name === 'string' && data.name.includes('/')) {
      nameOnlyUpdates.push({ id, newName: data.name.replace(/\//g, '-') });
    }
  });

  // 1) Apply name-only field updates
  if (nameOnlyUpdates.length > 0) {
    let batch = writeBatch(db);
    let ops = 0;
    for (const { id, newName } of nameOnlyUpdates) {
      batch.set(doc(materialsRef, id), { name: newName }, { merge: true });
      ops += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  let materialsCreated = 0;
  let materialsDeleted = 0;
  let inventoryUpdated = 0;
  let usageLogsUpdated = 0;

  // 2) For each ID rename, create the new material doc (if not exists), update references, delete old
  for (const { oldId, newId, data } of idRenames) {
    // Ensure destination material exists
    const newRef = doc(materialsRef, newId);
    const newSnap = await getDoc(newRef);
    if (!newSnap.exists()) {
      await setDoc(newRef, { ...data, name: newId }, { merge: true });
      materialsCreated += 1;
    }

    // Update inventory references
    const invQuery = query(inventoryRef, where('materialType', '==', oldId));
    const invSnap = await getDocs(invQuery);
    if (!invSnap.empty) {
      let batch = writeBatch(db);
      let ops = 0;
      invSnap.forEach((s) => {
        batch.update(doc(inventoryRef, s.id), { materialType: newId });
        inventoryUpdated += 1;
        ops += 1;
        if (ops >= 450) {
          batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      });
      if (ops > 0) await batch.commit();
    }

    // Update usage log details references
    const logsSnap = await getDocs(usageLogsRef);
    if (!logsSnap.empty) {
      let batch = writeBatch(db);
      let ops = 0;
      logsSnap.forEach((logDoc) => {
        const log = logDoc.data();
        if (Array.isArray(log.details) && log.details.some((d) => d.materialType === oldId)) {
          const newDetails = log.details.map((d) => (d.materialType === oldId ? { ...d, materialType: newId } : d));
          batch.update(doc(usageLogsRef, logDoc.id), { details: newDetails });
          usageLogsUpdated += 1;
          ops += 1;
          if (ops >= 450) {
            batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
      });
      if (ops > 0) await batch.commit();
    }

    // Delete old material doc
    const oldRef = doc(materialsRef, oldId);
    try {
      await setDoc(oldRef, {}, { merge: true }); // no-op to ensure permissions
      // Delete via batch to keep consistent
      const batch = writeBatch(db);
      batch.delete(oldRef);
      await batch.commit();
      materialsDeleted += 1;
    } catch (e) {
      // If deletion fails due to permissions, leave both docs; references already updated
      // eslint-disable-next-line no-console
      console.warn('Could not delete old material doc', oldId, e?.message);
    }
  }

  return { materialsCreated, materialsDeleted, inventoryUpdated, usageLogsUpdated, nameOnlyUpdated: nameOnlyUpdates.length };
}


