import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCwDsY4PMsQPVNnse9WAaszlwIeddeiUGc", // Replace with your actual key
    authDomain: "technopan-inventory.firebaseapp.com",
    projectId: "technopan-inventory",
    storageBucket: "technopan-inventory.firebasestorage.app",
    messagingSenderId: "461563876434",
    appId: "1:461563876434:web:f852fe555fd5ef29163b8b",
    measurementId: "G-RKKP2Z5621"
};

// This is a placeholder for the app ID, which is often provided in a specific environment.
export const appId = typeof __app_id !== 'undefined' ? __app_id : 'tecnopan-inventory-app';

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export the auth functions that were missing. This will resolve the errors.
export { signInAnonymously, onAuthStateChanged, signInWithCustomToken };

// Set the log level for debugging Firebase issues.
setLogLevel('debug');
