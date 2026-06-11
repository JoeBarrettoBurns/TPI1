import { initializeApp, getApp, getApps } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    signInWithCustomToken,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    fetchSignInMethodsForEmail,
    GoogleAuthProvider,
    signOut,
} from 'firebase/auth';
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from 'firebase/firestore';

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

const SECONDARY_APP_NAME = 'AuthProvisioning';
function getSecondaryApp() {
    return getApps().some((a) => a.name === SECONDARY_APP_NAME)
        ? getApp(SECONDARY_APP_NAME)
        : initializeApp(firebaseConfig, SECONDARY_APP_NAME);
}

/** Separate Auth instance so creating an email/password user does not replace the signed-in admin session. */
export const secondaryAuth = getAuth(getSecondaryApp());

// Persistent IndexedDB cache: repeat visits render from local data instantly
// while listeners sync only the deltas from the server.
let firestoreDb;
try {
    firestoreDb = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
} catch (e) {
    console.warn('Persistent Firestore cache unavailable; falling back to default cache.', e);
    firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

export {
    onAuthStateChanged,
    signInWithCustomToken,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    fetchSignInMethodsForEmail,
    GoogleAuthProvider,
    signOut,
};
