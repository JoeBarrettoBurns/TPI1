// src/hooks/useFirestoreData.js

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, writeBatch, runTransaction, getDocs } from 'firebase/firestore';
import { db, appId, auth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from '../firebase/config';

export function useFirestoreData() {
    const [inventory, setInventory] = useState([]);
    const [usageLog, setUsageLog] = useState([]);
    const [materials, setMaterials] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userId, setUserId] = useState(null);
    const inventoryRef = useRef([]);

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

    useEffect(() => {
        if (!userId) return;

        setLoading(true);
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const usageLogRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
        const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);

        const qInventory = query(inventoryCollectionRef, orderBy("createdAt", "desc"));
        const qUsageLog = query(usageLogRef, orderBy("createdAt", "desc"), limit(500));

        const handleAutoReceive = (inventoryData) => {
            const now = new Date();
            const itemsToReceive = inventoryData.filter(item => item.status === 'Ordered' && item.arrivalDate && new Date(item.arrivalDate) <= now);
            if (itemsToReceive.length > 0) {
                const batch = writeBatch(db);
                itemsToReceive.forEach(item => {
                    const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                    batch.update(docRef, { status: 'On Hand', dateReceived: now.toISOString().split('T')[0] });
                });
                batch.commit().catch(err => console.error("Auto-receive failed:", err));
            }
        };

        const handleAutoFulfillScheduledUsage = (usageData, currentInventory) => {
            const now = new Date();
            const logsToFulfill = usageData.filter(log => log.status === 'Scheduled' && new Date(log.usedAt) <= now);

            if (logsToFulfill.length === 0) return;

            for (const log of logsToFulfill) {
                runTransaction(db, async (transaction) => {
                    const itemsNeeded = log.details.reduce((acc, item) => {
                        const key = `${item.materialType}|${item.length}`;
                        acc[key] = (acc[key] || 0) + 1;
                        return acc;
                    }, {});

                    let canFulfill = true;
                    const selectedSheets = [];

                    for (const [key, qty] of Object.entries(itemsNeeded)) {
                        const [materialType, lengthStr] = key.split('|');
                        const length = parseInt(lengthStr, 10);

                        const availableSheets = currentInventory
                            .filter(i => i.materialType === materialType && i.length === length && i.status === 'On Hand')
                            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                        if (availableSheets.length < qty) {
                            canFulfill = false;
                            console.warn(`Cannot fulfill scheduled log ${log.id}: Not enough stock for ${qty}x ${materialType} @ ${length}\". Only ${availableSheets.length} available.`);
                            break;
                        }
                        selectedSheets.push(...availableSheets.slice(0, qty));
                    }

                    if (!canFulfill) return;

                    // READS: validate all docs first
                    const refs = selectedSheets.map(s => doc(db, `artifacts/${appId}/public/data/inventory`, s.id));
                    const usedAtIso = now.toISOString();
                    const updatedDetails = [];
                    for (const r of refs) {
                        const snap = await transaction.get(r);
                        if (!snap.exists()) {
                            throw new Error('Selected stock no longer exists during scheduled fulfillment.');
                        }
                        const current = snap.data();
                        if (current.status !== 'On Hand') {
                            throw new Error('Selected stock is no longer available during scheduled fulfillment.');
                        }
                        updatedDetails.push({ id: r.id, ...current });
                    }

                    // WRITES: delete inventory sheets to fully consume
                    for (const r of refs) {
                        transaction.delete(r);
                    }

                    const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, log.id);
                    transaction.update(logDocRef, {
                        status: 'Completed',
                        details: updatedDetails,
                        fulfilledAt: usedAtIso,
                    });
                }).catch(err => console.error(`Failed transaction for scheduled log ${log.id}:`, err));
            }
        };

        const unsubInventory = onSnapshot(qInventory, (snap) => {
            console.log('[Firestore Read] Inventory:', snap.docs.length, 'docs');
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInventory(data);
            inventoryRef.current = data;
            handleAutoReceive(data);
            setLoading(false);
        }, (err) => {
            setError('Failed to load inventory.');
            setLoading(false);
        });

        const unsubUsageLog = onSnapshot(qUsageLog, (snap) => {
            const usageData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsageLog(usageData);
            handleAutoFulfillScheduledUsage(usageData, inventoryRef.current);
        }, (err) => {
            setError('Failed to load usage logs.');
        });

        const fetchMaterials = async () => {
            try {
                const snap = await getDocs(materialsRef);
                console.log('[Firestore Read] Materials:', snap.docs.length, 'docs');
                const materialsData = {};
                snap.docs.forEach(doc => {
                    const name = doc.id;
                    materialsData[name] = { id: doc.id, name, ...doc.data() };
                });
                setMaterials(materialsData);
            } catch (err) {
                console.error("Failed to load materials:", err);
                setError('Failed to load materials.');
            }
        };

        fetchMaterials();

        return () => {
            unsubInventory();
            unsubUsageLog();
        };
    }, [userId]);

    const refetchMaterials = async () => {
        if (!userId) return;
        const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);
        try {
            const snap = await getDocs(materialsRef);
            const materialsData = {};
            snap.docs.forEach(doc => {
                const name = doc.id;
                materialsData[name] = { id: doc.id, name, ...doc.data() };
            });
            setMaterials(materialsData);
        } catch (err) {
            console.error("Failed to refetch materials:", err);
        }
    };

    return { inventory, usageLog, materials, loading, error, userId, refetchMaterials };
}