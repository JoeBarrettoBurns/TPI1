import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db, appId, auth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from '../firebase/config';

export function useFirestoreData() {
    const [inventory, setInventory] = useState([]);
    const [usageLog, setUsageLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userId, setUserId] = useState(null);

    // Authentication Effect
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (err) {
                    console.error("Authentication failed:", err);
                    setError("Authentication failed.");
                }
            }
        });
        return () => unsubAuth();
    }, []);

    // Data Fetching and Real-time Updates Effect
    useEffect(() => {
        if (!userId) return; // Don't fetch until authenticated

        setLoading(true);
        const inventoryRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const usageLogRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);

        const qInventory = query(inventoryRef, orderBy("createdAt", "desc"));
        const qUsageLog = query(usageLogRef, orderBy("createdAt", "desc"));

        const handleAutoReceive = (data) => {
            const now = new Date();
            const itemsToReceive = data.filter(item => item.status === 'Ordered' && item.arrivalDate && new Date(item.arrivalDate) <= now);
            if (itemsToReceive.length > 0) {
                const batch = writeBatch(db);
                itemsToReceive.forEach(item => {
                    const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                    batch.update(docRef, { status: 'On Hand', dateReceived: now.toISOString().split('T')[0] });
                });
                batch.commit().catch(err => console.error("Auto-receive failed:", err));
            }
        };

        const unsubInventory = onSnapshot(qInventory, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInventory(data);
            handleAutoReceive(data);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching inventory:", err);
            setError('Failed to load inventory.');
            setLoading(false);
        });

        const unsubUsageLog = onSnapshot(qUsageLog, (snap) => {
            setUsageLog(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => {
            console.error("Error fetching usage logs:", err);
            setError('Failed to load usage logs.');
        });

        return () => {
            unsubInventory();
            unsubUsageLog();
        };
    }, [userId]);

    return { inventory, usageLog, loading, error, userId };
}