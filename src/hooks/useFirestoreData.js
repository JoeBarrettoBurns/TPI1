// src/hooks/useFirestoreData.js

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, writeBatch, runTransaction } from 'firebase/firestore';
import { db, appId, auth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from '../firebase/config';
import { STANDARD_LENGTHS } from '../constants/materials';

export function useFirestoreData() {
    const [inventory, setInventory] = useState([]);
    const [usageLog, setUsageLog] = useState([]);
    const [materials, setMaterials] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userId, setUserId] = useState(null);

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
        const inventoryRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const usageLogRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
        const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);

        const qInventory = query(inventoryRef, orderBy("createdAt", "desc"));
        const qUsageLog = query(usageLogRef, orderBy("createdAt", "desc"));

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

            console.log(`Found ${logsToFulfill.length} scheduled log(s) to fulfill.`);

            for (const log of logsToFulfill) {
                runTransaction(db, async (transaction) => {
                    const itemsNeeded = log.details.reduce((acc, item) => {
                        const key = `${item.materialType}|${item.length}`;
                        acc[key] = (acc[key] || 0) + 1;
                        return acc;
                    }, {});

                    let canFulfill = true;
                    const inventoryToDelete = [];

                    for (const [key, qty] of Object.entries(itemsNeeded)) {
                        const [materialType, lengthStr] = key.split('|');
                        const length = parseInt(lengthStr, 10);

                        const availableSheets = currentInventory.filter(i =>
                            i.materialType === materialType && i.length === length && i.status === 'On Hand'
                        ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                        if (availableSheets.length < qty) {
                            canFulfill = false;
                            console.warn(`Cannot fulfill scheduled log ${log.id}: Not enough stock for ${qty}x ${materialType} @ ${length}". Only ${availableSheets.length} available.`);
                            break;
                        }
                        inventoryToDelete.push(...availableSheets.slice(0, qty));
                    }

                    if (canFulfill) {
                        inventoryToDelete.forEach(sheet => {
                            const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, sheet.id);
                            transaction.delete(docRef);
                        });

                        const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, log.id);
                        transaction.update(logDocRef, { status: 'Completed' });
                        console.log(`Successfully fulfilled and completed scheduled log ${log.id}.`);
                    } else {
                        // Optionally, update the log with an error status
                        // const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, log.id);
                        // transaction.update(logDocRef, { status: 'Failed', error: 'Insufficient stock on scheduled date.' });
                    }
                }).catch(err => console.error(`Failed transaction for scheduled log ${log.id}:`, err));
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
            const usageData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsageLog(usageData);
            // We need current inventory to check for fulfillment
            onSnapshot(qInventory, (invSnap) => {
                const currentInventory = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                handleAutoFulfillScheduledUsage(usageData, currentInventory);
            });
        }, (err) => {
            console.error("Error fetching usage logs:", err);
            setError('Failed to load usage logs.');
        });

        const unsubMaterials = onSnapshot(materialsRef, (snap) => {
            const materialsData = {};
            snap.docs.forEach(doc => {
                materialsData[doc.id] = { id: doc.id, ...doc.data() };
            });
            setMaterials(materialsData);
        }, (err) => {
            console.error("Error fetching materials:", err);
            setError('Failed to load materials.');
        });

        return () => {
            unsubInventory();
            unsubUsageLog();
            unsubMaterials();
        };
    }, [userId]);

    return { inventory, usageLog, materials, loading, error, userId };
}