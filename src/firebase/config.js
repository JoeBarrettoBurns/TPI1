import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBuNRK1SCGJcQ76BFAyEEnYZh-V84AJLFM",
    authDomain: "tecnopan-inventory.firebaseapp.com",
    projectId: "tecnopan-inventory",
    storageBucket: "tecnopan-inventory.firebasestorage.app",
    messagingSenderId: "984670798311",
    appId: "1:984670798311:web:e45e1d5c1366837e213d42",
    measurementId: "G-P01WFZ07E9"
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
