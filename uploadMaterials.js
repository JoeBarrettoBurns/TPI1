// uploadMaterials.js

// Import Firebase and your local data
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const { MATERIALS } = require('./src/constants/materials');

// Your Firebase configuration from src/firebase/config.js
const firebaseConfig = {
    apiKey: "AIzaSyCwDsY4PMsQPVNnse9WAaszlwIeddeiUGc",
    authDomain: "technopan-inventory.firebaseapp.com",
    projectId: "technopan-inventory",
    storageBucket: "technopan-inventory.firebasestorage.app",
    messagingSenderId: "461563876434",
    appId: "1:461563876434:web:f852fe555fd5ef29163b8b",
    measurementId: "G-RKKP2Z5621"
};

const appId = 'tecnopan-inventory-app';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// uploadMaterials.js

// ... (Firebase imports and config remain the same)

// --- The Upload Function ---
async function uploadMaterials() {
    console.log('Starting material upload...');

    const materialEntries = Object.entries(MATERIALS);

    for (const [materialName, properties] of materialEntries) {
        // Replace forward slashes in the name to create a valid document ID
        const documentId = materialName.replace(/\//g, '-');
        const materialRef = doc(db, `artifacts/${appId}/public/data/materials`, documentId);

        try {
            await setDoc(materialRef, properties);
            console.log(`Successfully uploaded: ${documentId}`);
        } catch (error) {
            console.error(`Error uploading ${documentId}:`, error);
        }
    }

    console.log('Material upload complete!');
}

uploadMaterials();