// fixUsageLogs.js

// This is a one-time script to fix older usage logs that are missing a 'createdAt' field.
// Run it from your terminal with: node fixUsageLogs.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch } from 'firebase/firestore';

// Your provided Firebase configuration.
const firebaseConfig = {
    apiKey: "AIzaSyCwDsY4PMsQPVNnse9WAaszlwIeddeiUGc",
    authDomain: "technopan-inventory.firebaseapp.com",
    projectId: "technopan-inventory",
    storageBucket: "technopan-inventory.appspot.com",
    messagingSenderId: "461563876434",
    appId: "1:461563876434:web:f852fe555fd5ef29163b8b",
    measurementId: "G-RKKP2Z5621"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = firebaseConfig.appId;

async function fixUsageLogs() {
    console.log('--- Starting Usage Log Fix Script ---');
    if (!appId) {
        console.error('Firebase appId is not defined in your config.');
        return;
    }

    const usageLogsPath = `artifacts/${appId}/public/data/usage_logs`;
    const logsRef = collection(db, usageLogsPath);

    try {
        console.log('Fetching usage logs...');
        const snapshot = await getDocs(logsRef);

        const batch = writeBatch(db);
        let updatedCount = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            // Check if 'createdAt' field is missing
            if (!data.createdAt) {
                // Use the 'usedAt' date as a fallback, or the current time if that's also missing
                const newTimestamp = data.usedAt || new Date().toISOString();
                batch.update(doc.ref, { createdAt: newTimestamp });
                updatedCount++;
                console.log(`Found and fixed log with ID: ${doc.id}`);
            }
        });

        if (updatedCount > 0) {
            await batch.commit();
            console.log(`\nSuccessfully updated ${updatedCount} log entries.`);
        } else {
            console.log('\nNo logs needed fixing. All entries seem to be up to date.');
        }

        console.log('--- Script finished successfully. ---');

    } catch (error) {
        console.error('An error occurred while fixing the logs:', error);
    }
}

fixUsageLogs();