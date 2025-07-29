// clearData.js

// This script deletes all documents from the 'inventory' and 'usage_logs' collections.
// Run it from your terminal with: node clearData.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, query, limit } from 'firebase/firestore';

// IMPORTANT: We need to manually provide the Firebase config here
// because this script runs outside of the React app environment.
// Replace the placeholder values with your actual Firebase config.
const firebaseConfig = {
    apiKey: "AIzaSyCwDsY4PMsQPVNnse9WAaszlwIeddeiUGc", // Replace with your actual key
    authDomain: "technopan-inventory.firebaseapp.com",
    projectId: "technopan-inventory",
    storageBucket: "technopan-inventory.firebasestorage.app",
    messagingSenderId: "461563876434",
    appId: "1:461563876434:web:f852fe555fd5ef29163b8b",
    measurementId: "G-RKKP2Z5621"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = firebaseConfig.appId; // Use appId from your config

/**
 * Deletes all documents in a Firestore collection in batches.
 * @param {Firestore} db The Firestore database instance.
 * @param {string} collectionPath The path to the collection.
 * @param {number} batchSize The number of documents to delete at once.
 */
async function deleteCollection(db, collectionPath, batchSize) {
    console.log(`Starting deletion for collection: ${collectionPath}`);
    const collectionRef = collection(db, collectionPath);
    const q = query(collectionRef, limit(batchSize));

    let deletedCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const snapshot = await getDocs(q);

        if (snapshot.size === 0) {
            console.log(`No more documents to delete in ${collectionPath}.`);
            break;
        }

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        deletedCount += snapshot.size;
        console.log(`Deleted a batch of ${snapshot.size} documents. Total deleted: ${deletedCount}`);
    }
    console.log(`Finished deleting collection: ${collectionPath}. Total deleted: ${deletedCount}`);
}

/**
 * Main function to clear all specified collections.
 */
async function clearAllData() {
    console.log('--- Starting Data Deletion Script ---');
    if (!appId) {
        console.error('Firebase appId is not defined in your config. Please update the script.');
        return;
    }

    const inventoryPath = `artifacts/${appId}/public/data/inventory`;
    const usageLogsPath = `artifacts/${appId}/public/data/usage_logs`;

    try {
        await deleteCollection(db, inventoryPath, 100);
        await deleteCollection(db, usageLogsPath, 100);
        console.log('--- Script finished successfully. All specified logs and sheets have been deleted. ---');
    } catch (error) {
        console.error('An error occurred during deletion:', error);
    }
}

clearAllData();