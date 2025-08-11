// src/utils/recoveryService.js

import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { getGaugeFromMaterial } from './dataProcessing';

function guessCategory(materialType) {
  const t = (materialType || '').toUpperCase();
  if (t.includes('GALV')) return 'Galvanized';
  if (t.includes('SATIN')) return 'Satin Coat';
  if (t.includes('SS')) return 'Stainless Steel';
  if (t.includes('WHITE') || t.includes('PAINT')) return 'Pre-Paint';
  if (t.includes('ALUM')) return 'Aluminum';
  return 'Recovered';
}

function defaultDensityForCategory(category) {
  const c = (category || '').toUpperCase();
  if (c.includes('ALUM')) return 0.0975; // Aluminum ~0.0975 lb/in^3
  // Default to steel density
  return 0.2833;
}

export async function rebuildMissingMaterialsFromInventory(db, appId, existingMaterialsKeys = []) {
  const materialsKeySet = new Set(existingMaterialsKeys);
  const invRef = collection(db, `artifacts/${appId}/public/data/inventory`);
  const invSnap = await getDocs(invRef);

  const missing = new Map();
  invSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const mt = data.materialType;
    if (!mt) return;
    if (!materialsKeySet.has(mt)) {
      if (!missing.has(mt)) {
        const category = guessCategory(mt);
        const thickness = getGaugeFromMaterial(mt) || 0;
        const density = defaultDensityForCategory(category);
        missing.set(mt, { category, thickness, density });
      }
    }
  });

  if (missing.size === 0) return { created: 0 };

  let batch = writeBatch(db);
  let ops = 0;
  for (const [id, mat] of missing.entries()) {
    batch.set(doc(db, `artifacts/${appId}/public/data/materials`, id), mat, { merge: true });
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
  return { created: missing.size };
}


