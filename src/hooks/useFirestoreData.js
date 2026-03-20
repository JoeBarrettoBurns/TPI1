// src/hooks/useFirestoreData.js

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    writeBatch,
    runTransaction,
    getDocs,
    getCountFromServer
} from '../firebase/firestoreWithTracking';
import { db, appId, auth, onAuthStateChanged, signInWithCustomToken, signOut } from '../firebase/config';
import { STANDARD_LENGTHS } from '../constants/materials';
import {
    getUnauthorizedMessage,
    isAllowlistEnabled,
    isGoogleEmailAllowed,
} from '../constants/authAllowlist';

const INVENTORY_CACHE_KEY = `inventory_cache_${appId}`;
const INVENTORY_CACHE_TTL_MS = 10 * 60 * 1000;
const SUMMARY_CACHE_KEY = `inventory_summary_cache_${appId}`;
const SUMMARY_CACHE_TTL_MS = 10 * 60 * 1000;

function buildEmptySummaries(materialIds) {
    const inventorySummary = {};
    const incomingSummary = {};

    materialIds.forEach((type) => {
        inventorySummary[type] = {
            ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {}),
            custom: 0,
            total: 0,
        };
        incomingSummary[type] = {
            lengths: { ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {}), custom: 0 },
            totalCount: 0,
            latestArrivalDate: null,
        };
    });

    return { inventorySummary, incomingSummary };
}

function readInventoryCache() {
    try {
        const raw = sessionStorage.getItem(INVENTORY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.data || !Array.isArray(parsed.data) || !parsed?.savedAt) return null;
        if (Date.now() - parsed.savedAt > INVENTORY_CACHE_TTL_MS) return null;
        return parsed.data;
    } catch {
        return null;
    }
}

function writeInventoryCache(data) {
    try {
        sessionStorage.setItem(
            INVENTORY_CACHE_KEY,
            JSON.stringify({ savedAt: Date.now(), data })
        );
    } catch {
        // Ignore cache write failures
    }
}

function readSummaryCache() {
    try {
        const raw = localStorage.getItem(SUMMARY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.inventorySummary || !parsed?.incomingSummary || !parsed?.savedAt) return null;
        if (Date.now() - parsed.savedAt > SUMMARY_CACHE_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeSummaryCache(inventorySummary, incomingSummary) {
    try {
        localStorage.setItem(
            SUMMARY_CACHE_KEY,
            JSON.stringify({ savedAt: Date.now(), inventorySummary, incomingSummary })
        );
    } catch {
        // Ignore cache write failures
    }
}

function getMaterialIdsForSummary(inventoryItems, materialsMap) {
    const materialKeys = Object.keys(materialsMap || {});
    if (materialKeys.length > 0) return materialKeys;
    return Array.from(new Set((inventoryItems || []).map((item) => item.materialType).filter(Boolean)));
}

function buildSummariesFromInventory(items, materialIds) {
    const { inventorySummary, incomingSummary } = buildEmptySummaries(materialIds);

    (items || []).forEach((item) => {
        if (!item?.materialType) return;
        const mat = item.materialType;

        if (item.status === 'On Hand' && inventorySummary[mat]) {
            if (STANDARD_LENGTHS.includes(item.length)) {
                inventorySummary[mat][item.length] += 1;
            } else {
                inventorySummary[mat].custom += 1;
            }
            inventorySummary[mat].total += 1;
        }

        if (item.status === 'Ordered' && incomingSummary[mat]) {
            if (STANDARD_LENGTHS.includes(item.length)) {
                incomingSummary[mat].lengths[item.length] += 1;
            } else {
                incomingSummary[mat].lengths.custom += 1;
            }
            incomingSummary[mat].totalCount += 1;
            if (item.arrivalDate) {
                const prev = incomingSummary[mat].latestArrivalDate;
                if (!prev || new Date(item.arrivalDate) > new Date(prev)) {
                    incomingSummary[mat].latestArrivalDate = item.arrivalDate;
                }
            }
        }
    });

    return { inventorySummary, incomingSummary };
}

export function useFirestoreData({ loadInventoryDetails = true } = {}) {
    const [inventory, setInventory] = useState([]);
    const [usageLog, setUsageLog] = useState([]);
    const [materials, setMaterials] = useState({});
    const [inventorySummaryData, setInventorySummaryData] = useState({});
    const [incomingSummaryData, setIncomingSummaryData] = useState({});
    const [inventoryReady, setInventoryReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userId, setUserId] = useState(null);
    const [authUser, setAuthUser] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [authAccessDenied, setAuthAccessDenied] = useState(false);
    const [authDeniedDetail, setAuthDeniedDetail] = useState('');

    const clearAuthAccessDenied = useCallback(() => {
        setAuthAccessDenied(false);
        setAuthDeniedDetail('');
    }, []);

    const inventoryRef = useRef([]);
    const autoReceiveInFlightRef = useRef(false);
    const scheduledFulfillInFlightRef = useRef(new Set());
    const inventoryUnsubRef = useRef(null);
    const inventoryDetailsEnabledRef = useRef(false);
    const materialsSnapshotRef = useRef({});

    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                if (
                    isAllowlistEnabled() &&
                    user.email &&
                    !isGoogleEmailAllowed(user.email)
                ) {
                    try {
                        await signOut(auth);
                    } catch (e) {
                        console.error('signOut after allowlist deny:', e);
                    }
                    setAuthAccessDenied(true);
                    setAuthDeniedDetail(getUnauthorizedMessage());
                    setUserId(null);
                    setAuthUser(null);
                    setAuthReady(true);
                    setLoading(false);
                    return;
                }

                setAuthAccessDenied(false);
                setAuthDeniedDetail('');
                setUserId(user.uid);
                setAuthUser({
                    uid: user.uid,
                    email: user.email || null,
                    displayName: user.displayName || null,
                });
                setAuthReady(true);
            } else {
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        setUserId(null);
                        setAuthUser(null);
                        setLoading(false);
                        setAuthReady(true);
                    }
                } catch (err) {
                    console.error('Authentication failed:', err);
                    setError('Authentication failed.');
                    setUserId(null);
                    setAuthUser(null);
                    setLoading(false);
                    setAuthReady(true);
                }
            }
        });
        return () => unsubAuth();
    }, []);

    useEffect(() => {
        materialsSnapshotRef.current = materials;
    }, [materials]);

    const handleAutoReceive = useCallback((inventoryData) => {
        if (autoReceiveInFlightRef.current) return;
        const now = new Date();
        const itemsToReceive = inventoryData.filter(
            (item) => item.status === 'Ordered' && item.arrivalDate && new Date(item.arrivalDate) <= now
        );

        if (itemsToReceive.length > 0) {
            autoReceiveInFlightRef.current = true;
            const batch = writeBatch(db);
            itemsToReceive.forEach((item) => {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                batch.update(docRef, { status: 'On Hand', dateReceived: now.toISOString().split('T')[0] });
            });
            batch
                .commit()
                .catch((err) => console.error('Auto-receive failed:', err))
                .finally(() => {
                    autoReceiveInFlightRef.current = false;
                });
        }
    }, []);

    const handleAutoFulfillScheduledUsage = useCallback((usageData, currentInventory) => {
        const now = new Date();
        const logsToFulfill = usageData.filter(
            (log) =>
                log.status === 'Scheduled' &&
                new Date(log.usedAt) <= now &&
                !scheduledFulfillInFlightRef.current.has(log.id)
        );

        if (logsToFulfill.length === 0) return;

        for (const log of logsToFulfill) {
            scheduledFulfillInFlightRef.current.add(log.id);
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
                        .filter((i) => i.materialType === materialType && i.length === length && i.status === 'On Hand')
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                    if (availableSheets.length < qty) {
                        canFulfill = false;
                        console.warn(
                            `Cannot fulfill scheduled log ${log.id}: Not enough stock for ${qty}x ${materialType} @ ${length}". Only ${availableSheets.length} available.`
                        );
                        break;
                    }
                    selectedSheets.push(...availableSheets.slice(0, qty));
                }

                if (!canFulfill) return;

                // READS: validate all docs first
                const refs = selectedSheets.map((s) => doc(db, `artifacts/${appId}/public/data/inventory`, s.id));
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
            })
                .catch((err) => console.error(`Failed transaction for scheduled log ${log.id}:`, err))
                .finally(() => {
                    scheduledFulfillInFlightRef.current.delete(log.id);
                });
        }
    }, []);

    useEffect(() => {
        if (!userId) return;

        let isActive = true;
        setLoading(true);
        setError('');

        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const usageLogRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
        const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);
        const qUsageLog = query(usageLogRef, orderBy('createdAt', 'desc'), limit(100));

        let hasUsage = false;
        let hasMaterials = false;
        let hasSummaries = false;

        const markReady = () => {
            if (isActive && hasUsage && hasMaterials && hasSummaries) {
                setLoading(false);
            }
        };

        const runTasksInBatches = async (tasks, batchSize = 20) => {
            for (let i = 0; i < tasks.length; i += batchSize) {
                const chunk = tasks.slice(i, i + batchSize);
                await Promise.all(chunk.map((task) => task()));
            }
        };

        const fetchLightweightSummaries = async (materialIds) => {
            if (!materialIds.length) {
                setInventorySummaryData({});
                setIncomingSummaryData({});
                return;
            }

            const cachedSummary = readSummaryCache();
            if (cachedSummary?.inventorySummary && cachedSummary?.incomingSummary) {
                const empty = buildEmptySummaries(materialIds);
                const mergedInventory = { ...empty.inventorySummary };
                const mergedIncoming = { ...empty.incomingSummary };
                materialIds.forEach((id) => {
                    if (cachedSummary.inventorySummary[id]) {
                        mergedInventory[id] = {
                            ...mergedInventory[id],
                            ...cachedSummary.inventorySummary[id],
                        };
                    }
                    if (cachedSummary.incomingSummary[id]) {
                        mergedIncoming[id] = {
                            ...mergedIncoming[id],
                            ...cachedSummary.incomingSummary[id],
                            lengths: {
                                ...mergedIncoming[id].lengths,
                                ...(cachedSummary.incomingSummary[id].lengths || {}),
                            },
                        };
                    }
                });
                setInventorySummaryData(mergedInventory);
                setIncomingSummaryData(mergedIncoming);
                return;
            }

            const { inventorySummary, incomingSummary } = buildEmptySummaries(materialIds);
            const tasks = [];

            materialIds.forEach((materialType) => {
                tasks.push(async () => {
                    try {
                        const onHandTotalSnap = await getCountFromServer(
                            query(
                                inventoryCollectionRef,
                                where('status', '==', 'On Hand'),
                                where('materialType', '==', materialType)
                            )
                        );
                        inventorySummary[materialType].total = onHandTotalSnap.data().count || 0;
                    } catch (err) {
                        console.warn(`Summary count failed for On Hand total (${materialType})`, err);
                    }
                });

                tasks.push(async () => {
                    try {
                        const orderedTotalSnap = await getCountFromServer(
                            query(
                                inventoryCollectionRef,
                                where('status', '==', 'Ordered'),
                                where('materialType', '==', materialType)
                            )
                        );
                        incomingSummary[materialType].totalCount = orderedTotalSnap.data().count || 0;
                    } catch (err) {
                        console.warn(`Summary count failed for Ordered total (${materialType})`, err);
                    }
                });

                STANDARD_LENGTHS.forEach((len) => {
                    tasks.push(async () => {
                        try {
                            const onHandLenSnap = await getCountFromServer(
                                query(
                                    inventoryCollectionRef,
                                    where('status', '==', 'On Hand'),
                                    where('materialType', '==', materialType),
                                    where('length', '==', len)
                                )
                            );
                            inventorySummary[materialType][len] = onHandLenSnap.data().count || 0;
                        } catch (err) {
                            console.warn(`Summary count failed for On Hand ${materialType} @ ${len}"`, err);
                        }
                    });

                    tasks.push(async () => {
                        try {
                            const orderedLenSnap = await getCountFromServer(
                                query(
                                    inventoryCollectionRef,
                                    where('status', '==', 'Ordered'),
                                    where('materialType', '==', materialType),
                                    where('length', '==', len)
                                )
                            );
                            incomingSummary[materialType].lengths[len] = orderedLenSnap.data().count || 0;
                        } catch (err) {
                            console.warn(`Summary count failed for Ordered ${materialType} @ ${len}"`, err);
                        }
                    });
                });
            });

            await runTasksInBatches(tasks, 20);

            materialIds.forEach((materialType) => {
                const onHandKnownLengths = STANDARD_LENGTHS.reduce(
                    (sum, len) => sum + (inventorySummary[materialType][len] || 0),
                    0
                );
                inventorySummary[materialType].custom = Math.max(
                    0,
                    (inventorySummary[materialType].total || 0) - onHandKnownLengths
                );

                const orderedKnownLengths = STANDARD_LENGTHS.reduce(
                    (sum, len) => sum + (incomingSummary[materialType].lengths[len] || 0),
                    0
                );
                incomingSummary[materialType].lengths.custom = Math.max(
                    0,
                    (incomingSummary[materialType].totalCount || 0) - orderedKnownLengths
                );
            });

            if (!isActive) return;
            setInventorySummaryData(inventorySummary);
            setIncomingSummaryData(incomingSummary);
            writeSummaryCache(inventorySummary, incomingSummary);
        };

        const unsubUsageLog = onSnapshot(
            qUsageLog,
            (snap) => {
                const usageData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setUsageLog(usageData);

                if (inventoryDetailsEnabledRef.current) {
                    handleAutoFulfillScheduledUsage(usageData, inventoryRef.current);
                }

                hasUsage = true;
                markReady();
            },
            () => {
                setError('Failed to load usage logs.');
                hasUsage = true;
                markReady();
            }
        );

        const fetchMaterialsAndSummaries = async () => {
            let materialIds = [];
            try {
                const snap = await getDocs(materialsRef);
                const materialsData = {};
                snap.docs.forEach((d) => {
                    const name = d.id;
                    materialsData[name] = { id: d.id, name, ...d.data() };
                });
                materialIds = Object.keys(materialsData);
                setMaterials(materialsData);
                hasMaterials = true;
            } catch (err) {
                console.error('Failed to load materials:', err);
                setError('Failed to load materials.');
                hasMaterials = true;
                hasSummaries = true;
                markReady();
                return;
            }

            try {
                await fetchLightweightSummaries(materialIds);
            } catch (err) {
                console.warn('Lightweight summary query failed; using empty fallback.', err);
                if (isActive) {
                    const empty = buildEmptySummaries(materialIds);
                    setInventorySummaryData(empty.inventorySummary);
                    setIncomingSummaryData(empty.incomingSummary);
                }
            } finally {
                hasSummaries = true;
                markReady();
            }
        };

        fetchMaterialsAndSummaries();

        return () => {
            isActive = false;
            unsubUsageLog();
        };
    }, [userId, handleAutoFulfillScheduledUsage]);

    useEffect(() => {
        if (!userId || !loadInventoryDetails) return;
        if (inventoryUnsubRef.current) return;

        inventoryDetailsEnabledRef.current = true;
        const cachedInventory = readInventoryCache();
        if (cachedInventory && cachedInventory.length > 0) {
            setInventory(cachedInventory);
            inventoryRef.current = cachedInventory;
            setInventoryReady(true);
        } else {
            setInventoryReady(false);
        }

        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const qInventory = query(inventoryCollectionRef, where('status', 'in', ['On Hand', 'Ordered']));
        let isActive = true;

            const loadInventoryFallback = async () => {
            const [onHandSnap, orderedSnap] = await Promise.all([
                getDocs(query(inventoryCollectionRef, where('status', '==', 'On Hand'))),
                getDocs(query(inventoryCollectionRef, where('status', '==', 'Ordered')))
            ]);

            const merged = [
                ...onHandSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                ...orderedSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
            ];
            const deduped = Array.from(new Map(merged.map((item) => [item.id, item])).values())
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

            if (!isActive) return;
            setInventory(deduped);
            inventoryRef.current = deduped;
            writeInventoryCache(deduped);
                const materialIds = getMaterialIdsForSummary(deduped, materialsSnapshotRef.current);
                const summaries = buildSummariesFromInventory(deduped, materialIds);
                setInventorySummaryData(summaries.inventorySummary);
                setIncomingSummaryData(summaries.incomingSummary);
                writeSummaryCache(summaries.inventorySummary, summaries.incomingSummary);
            setInventoryReady(true);
        };

        const unsubInventory = onSnapshot(
            qInventory,
            (snap) => {
                const data = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                setInventory(data);
                inventoryRef.current = data;
                writeInventoryCache(data);
                const materialIds = getMaterialIdsForSummary(data, materialsSnapshotRef.current);
                const summaries = buildSummariesFromInventory(data, materialIds);
                setInventorySummaryData(summaries.inventorySummary);
                setIncomingSummaryData(summaries.incomingSummary);
                writeSummaryCache(summaries.inventorySummary, summaries.incomingSummary);
                handleAutoReceive(data);
                setInventoryReady(true);
            },
            async () => {
                try {
                    await loadInventoryFallback();
                } catch (fallbackErr) {
                    console.error('Inventory load fallback failed:', fallbackErr);
                    setError('Failed to load inventory.');
                    setInventoryReady(true);
                }
            }
        );

        inventoryUnsubRef.current = unsubInventory;

        return () => {
            isActive = false;
            if (inventoryUnsubRef.current) {
                inventoryUnsubRef.current();
                inventoryUnsubRef.current = null;
            }
            inventoryDetailsEnabledRef.current = false;
        };
    }, [userId, loadInventoryDetails, handleAutoReceive]);

    const refetchMaterials = async () => {
        if (!userId) return;
        const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);
        try {
            const snap = await getDocs(materialsRef);
            const materialsData = {};
            snap.docs.forEach((d) => {
                const name = d.id;
                materialsData[name] = { id: d.id, name, ...d.data() };
            });
            setMaterials(materialsData);
        } catch (err) {
            console.error('Failed to refetch materials:', err);
        }
    };

    return {
        inventory,
        usageLog,
        materials,
        inventorySummaryData,
        incomingSummaryData,
        inventoryReady,
        loading,
        error,
        userId,
        authUser,
        authReady,
        authAccessDenied,
        authDeniedDetail,
        clearAuthAccessDenied,
        refetchMaterials,
    };
}