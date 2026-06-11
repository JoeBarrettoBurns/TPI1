// src/hooks/useFirestoreData.js

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    getDoc,
    setDoc,
    writeBatch,
    getDocs
} from '../firebase/firestoreWithTracking';
import { db, appId, auth, onAuthStateChanged, signInWithCustomToken, signOut } from '../firebase/config';
import { STANDARD_LENGTHS } from '../constants/materials';
import { localDateInputValue } from '../utils/dates';
import {
    getUnauthorizedMessage,
    isFirebaseUserAllowed,
    FALLBACK_ALLOWED_EMAILS,
    normalizeEmail,
} from '../constants/authAllowlist';

const ACCESS_ALLOWLIST_DOC = () => doc(db, `artifacts/${appId}/config/access_allowlist`);
const ALLOWLIST_CACHE_KEY = `access_allowlist_cache_${appId}`;

/**
 * Cached copy of the allowlist so sign-in does not block on a Firestore round
 * trip on every visit. Firestore security rules still enforce access
 * server-side; this only decides how fast the UI unlocks.
 */
function readCachedAllowlist() {
    try {
        const raw = localStorage.getItem(ALLOWLIST_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCachedAllowlist(emails) {
    try {
        localStorage.setItem(ALLOWLIST_CACHE_KEY, JSON.stringify(emails));
    } catch {
        // Ignore cache write failures
    }
}

/**
 * Audit label for writes triggered automatically (auto-receive, auto-fulfill).
 * Reads auth at call time so memoized callbacks never capture a stale account.
 */
function autoAuditActor() {
    const email = auth.currentUser?.email;
    return email ? `Auto (${email})` : 'Auto';
}

async function fetchAllowedEmailsLowercased() {
    const fallback = FALLBACK_ALLOWED_EMAILS.map((e) => normalizeEmail(e));
    try {
        const snap = await getDoc(ACCESS_ALLOWLIST_DOC());
        if (snap.exists()) {
            const raw = snap.data()?.emails;
            if (Array.isArray(raw) && raw.length > 0) {
                const fromFs = [...new Set(raw.map((e) => normalizeEmail(String(e))).filter(Boolean))];
                const merged = [...new Set([...fallback, ...fromFs])];
                const casingMismatch = raw.some(
                    (e) => normalizeEmail(String(e)) !== String(e).trim()
                );
                if (casingMismatch && fromFs.length > 0) {
                    try {
                        await setDoc(
                            ACCESS_ALLOWLIST_DOC(),
                            { emails: fromFs, updatedAt: new Date().toISOString() },
                            { merge: true }
                        );
                    } catch (e) {
                        console.warn('Could not normalize allowlist emails in Firestore (needs staff write):', e);
                    }
                }
                return merged;
            }
        }
    } catch (e) {
        console.warn('Could not load access allowlist:', e);
    }
    return fallback;
}

/** Sort usage log docs by createdAt (Firestore Timestamp, Date, or string). */
function parseCreatedAtMs(log) {
    const c = log?.createdAt;
    if (c && typeof c.toDate === 'function') return c.toDate().getTime();
    if (c && typeof c.seconds === 'number') return c.seconds * 1000;
    if (c) {
        const t = new Date(c).getTime();
        return Number.isNaN(t) ? 0 : t;
    }
    return 0;
}

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
    const usageLogDataRef = useRef([]);
    const autoReceiveInFlightRef = useRef(false);
    const scheduledFulfillInFlightRef = useRef(new Set());
    /** Sheets selected by an in-flight auto-fulfill; later logs in the same pass must not claim them too. */
    const autoFulfillClaimedSheetIdsRef = useRef(new Set());
    const inventoryUnsubRef = useRef(null);
    const inventoryDetailsEnabledRef = useRef(false);
    const materialsSnapshotRef = useRef({});

    useEffect(() => {
        const denyAccess = async (user) => {
            try {
                await signOut(auth);
            } catch (e) {
                console.error('signOut after allowlist deny:', e);
            }
            setAuthAccessDenied(true);
            const primary = user.email || '(no email on account)';
            const fromProviders = (user.providerData || [])
                .map((p) => p?.email)
                .filter(Boolean)
                .filter((e) => normalizeEmail(e) !== normalizeEmail(user.email || ''));
            const extra =
                fromProviders.length > 0
                    ? ` Provider emails: ${fromProviders.join(', ')}.`
                    : '';
            setAuthDeniedDetail(
                `${getUnauthorizedMessage()} You signed in as ${primary}.${extra} The allowlist must include that exact mailbox (Gmail vs googlemail.com both work if either form is listed). Ask an admin to add it under Authentication.`
            );
            setUserId(null);
            setAuthUser(null);
            setAuthReady(true);
            setLoading(false);
        };

        const grantAccess = (user) => {
            setAuthAccessDenied(false);
            setAuthDeniedDetail('');
            setUserId(user.uid);
            setAuthUser({
                uid: user.uid,
                email: user.email || null,
                displayName: user.displayName || null,
            });
            setAuthReady(true);
        };

        const unsubAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // Fast path: a cached allowlist unlocks the UI without waiting on a
                    // Firestore round trip. The fresh list is fetched in the background
                    // and access is revoked if the account was removed. Security rules
                    // still enforce access server-side either way.
                    const cachedAllowed = readCachedAllowlist();
                    if (cachedAllowed && isFirebaseUserAllowed(user, cachedAllowed)) {
                        grantAccess(user);
                        fetchAllowedEmailsLowercased()
                            .then((fresh) => {
                                writeCachedAllowlist(fresh);
                                if (!isFirebaseUserAllowed(user, fresh)) {
                                    denyAccess(user);
                                }
                            })
                            .catch((e) => console.warn('Background allowlist refresh failed:', e));
                        return;
                    }

                    const allowed = await fetchAllowedEmailsLowercased();
                    writeCachedAllowlist(allowed);
                    if (!isFirebaseUserAllowed(user, allowed)) {
                        await denyAccess(user);
                        return;
                    }
                    grantAccess(user);
                } catch (error) {
                    console.error('Auth evaluation failed:', error);
                    setError(error?.message || 'Authentication failed.');
                    setUserId(null);
                    setAuthUser(null);
                    setLoading(false);
                    setAuthReady(true);
                }
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
                batch.update(docRef, {
                    status: 'On Hand',
                    dateReceived: localDateInputValue(now),
                    lastEditedBy: autoAuditActor(),
                    lastEditedAt: now.toISOString(),
                });
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
            // Sheets claimed by an earlier log in this pass (or a still-pending
            // write from a previous pass) must not be selected again, or two
            // logs would consume the same physical sheet.
            const claimedSheetIds = autoFulfillClaimedSheetIdsRef.current;
            const sheetIdsForThisLog = [];
            (async () => {
                try {
                    const batch = writeBatch(db);
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
                            .filter((i) => i.materialType === materialType && i.length === length && i.status === 'On Hand' && !claimedSheetIds.has(i.id))
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

                    selectedSheets.forEach((s) => {
                        claimedSheetIds.add(s.id);
                        sheetIdsForThisLog.push(s.id);
                    });

                    const usedAtIso = now.toISOString();

                    for (const s of selectedSheets) {
                        const r = doc(db, `artifacts/${appId}/public/data/inventory`, s.id);
                        batch.update(r, {
                            status: 'Used',
                            usageLogId: log.id,
                            jobNameUsed: log.job || 'N/A',
                            customerUsed: log.customer || 'N/A',
                            usedAt: usedAtIso,
                        });
                    }

                    const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, log.id);
                    batch.update(logDocRef, {
                        status: 'Completed',
                        details: selectedSheets.map((s) => ({ ...s, status: 'Used' })),
                        qty: -selectedSheets.length,
                        fulfilledAt: usedAtIso,
                        lastEditedBy: autoAuditActor(),
                        lastEditedAt: usedAtIso,
                    });

                    await batch.commit();
                } catch (error) {
                    console.error(`Auto-fulfill failed for log ${log.id}:`, error);
                } finally {
                    scheduledFulfillInFlightRef.current.delete(log.id);
                    // Release claims once the write has settled — after a successful
                    // commit the snapshot refresh excludes these sheets anyway, and
                    // after a failure they are genuinely available again.
                    sheetIdsForThisLog.forEach((id) => claimedSheetIds.delete(id));
                }
            })();
        }
    }, []);

    useEffect(() => {
        if (!userId) return;

        let isActive = true;
        setLoading(true);
        setError('');

        const usageLogRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
        const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);
        const qUsageLog = query(usageLogRef, orderBy('createdAt', 'desc'));

        // Usage logs intentionally do NOT gate first paint: the collection holds
        // the full history (with per-sheet snapshots) and is the largest payload.
        // It streams in while the dashboard is already visible.
        let hasMaterials = false;
        let hasSummaries = false;

        const markReady = () => {
            if (isActive && hasMaterials && hasSummaries) {
                setLoading(false);
            }
        };

        // Summaries are derived from the live inventory listeners (one query each
        // for On Hand and Ordered). The cache only seeds the dashboard instantly
        // on repeat visits — no per-material count queries; those cost hundreds of
        // sequential round trips and dominated first-load time.
        const applyCachedSummaries = (materialIds) => {
            if (!materialIds.length) {
                setInventorySummaryData({});
                setIncomingSummaryData({});
                return;
            }

            const cachedSummary = readSummaryCache();
            if (!cachedSummary?.inventorySummary || !cachedSummary?.incomingSummary) return;

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
        };

        const loadUsageLogsViaFullRead = async () => {
            const snap = await getDocs(usageLogRef);
            if (snap.size > 25_000) {
                console.warn(
                    `[usage_logs] Loading ${snap.size} documents via full collection read; consider fixing the indexed listener for better performance.`
                );
            }
            return snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => parseCreatedAtMs(b) - parseCreatedAtMs(a));
        };

        const unsubUsageLog = onSnapshot(
            qUsageLog,
            (snap) => {
                const usageData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                usageLogDataRef.current = usageData;
                setUsageLog(usageData);

                if (inventoryDetailsEnabledRef.current) {
                    handleAutoFulfillScheduledUsage(usageData, inventoryRef.current);
                }
            },
            (err) => {
                console.error('usage_logs snapshot error:', err);
                (async () => {
                    try {
                        const usageData = await loadUsageLogsViaFullRead();
                        if (!isActive) return;
                        usageLogDataRef.current = usageData;
                        setUsageLog(usageData);
                        if (inventoryDetailsEnabledRef.current) {
                            handleAutoFulfillScheduledUsage(usageData, inventoryRef.current);
                        }
                        if (err?.code === 'failed-precondition') {
                            setError('');
                        } else {
                            setError(
                                `Usage logs: real-time listener failed (${err?.code || 'error'}). Loaded ${usageData.length} entries via full read (fallback). If this persists, check the browser console and Firebase → Firestore → Indexes.`
                            );
                        }
                    } catch (fallbackErr) {
                        console.error('usage_logs fallback failed:', fallbackErr);
                        if (!isActive) return;
                        const detail = [err?.code, err?.message, fallbackErr?.message].filter(Boolean).join(' — ');
                        setError(detail ? `Failed to load usage logs. ${detail}` : 'Failed to load usage logs.');
                    }
                })();
            }
        );

        // Live materials listener: with the persistent cache this paints from
        // IndexedDB immediately on repeat visits (getDocs would wait on the
        // server), and category/material edits sync across devices for free.
        const unsubMaterials = onSnapshot(
            materialsRef,
            (snap) => {
                const materialsData = {};
                snap.docs.forEach((d) => {
                    const name = d.id;
                    materialsData[name] = { id: d.id, name, ...d.data() };
                });
                setMaterials(materialsData);
                if (!hasMaterials) {
                    hasMaterials = true;
                    if (isActive) applyCachedSummaries(Object.keys(materialsData));
                    hasSummaries = true;
                }
                markReady();
            },
            (err) => {
                console.error('Failed to load materials:', err);
                setError('Failed to load materials.');
                hasMaterials = true;
                hasSummaries = true;
                markReady();
            }
        );

        return () => {
            isActive = false;
            unsubUsageLog();
            unsubMaterials();
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
        const qOnHand = query(inventoryCollectionRef, where('status', '==', 'On Hand'));
        const qOrdered = query(inventoryCollectionRef, where('status', '==', 'Ordered'));
        let isActive = true;

        const onHandRef = { current: [] };
        const orderedRef = { current: [] };

        const loadInventoryFallback = async () => {
            const [onHandSnap, orderedSnap] = await Promise.all([
                getDocs(query(inventoryCollectionRef, where('status', '==', 'On Hand'))),
                getDocs(query(inventoryCollectionRef, where('status', '==', 'Ordered'))),
            ]);

            const merged = [
                ...onHandSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                ...orderedSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            ];
            const deduped = Array.from(new Map(merged.map((item) => [item.id, item])).values()).sort(
                (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
            );

            if (!isActive) return;
            setInventory(deduped);
            inventoryRef.current = deduped;
            writeInventoryCache(deduped);
            const materialIds = getMaterialIdsForSummary(deduped, materialsSnapshotRef.current);
            const summaries = buildSummariesFromInventory(deduped, materialIds);
            setInventorySummaryData(summaries.inventorySummary);
            setIncomingSummaryData(summaries.incomingSummary);
            writeSummaryCache(summaries.inventorySummary, summaries.incomingSummary);
            handleAutoReceive(deduped);
            handleAutoFulfillScheduledUsage(usageLogDataRef.current, deduped);
            setInventoryReady(true);
        };

        const mergeSnapshotsAndApply = () => {
            const merged = [...onHandRef.current, ...orderedRef.current];
            const deduped = Array.from(new Map(merged.map((item) => [item.id, item])).values()).sort(
                (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
            );
            if (!isActive) return;
            setInventory(deduped);
            inventoryRef.current = deduped;
            writeInventoryCache(deduped);
            const materialIds = getMaterialIdsForSummary(deduped, materialsSnapshotRef.current);
            const summaries = buildSummariesFromInventory(deduped, materialIds);
            setInventorySummaryData(summaries.inventorySummary);
            setIncomingSummaryData(summaries.incomingSummary);
            writeSummaryCache(summaries.inventorySummary, summaries.incomingSummary);
            handleAutoReceive(deduped);
            // Usage logs may have arrived before inventory was ready; re-check
            // scheduled fulfillment now that stock data exists.
            handleAutoFulfillScheduledUsage(usageLogDataRef.current, deduped);
            setInventoryReady(true);
        };

        let snapshotErrorHandled = false;
        let unsubOnHand = () => {};
        let unsubOrdered = () => {};

        const handleInventorySnapshotError = async (err) => {
            if (snapshotErrorHandled || !isActive) return;
            snapshotErrorHandled = true;
            console.error('Inventory snapshot error:', err);
            unsubOnHand();
            unsubOrdered();
            try {
                await loadInventoryFallback();
            } catch (fallbackErr) {
                console.error('Inventory load fallback failed:', fallbackErr);
                const primary = [err?.code, err?.message].filter(Boolean).join(': ');
                const fb = [fallbackErr?.code, fallbackErr?.message].filter(Boolean).join(': ');
                const detail = primary || fb;
                setError(detail ? `Failed to load inventory. ${detail}` : 'Failed to load inventory.');
                setInventoryReady(true);
            }
        };

        unsubOnHand = onSnapshot(
            qOnHand,
            (snap) => {
                onHandRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                mergeSnapshotsAndApply();
            },
            handleInventorySnapshotError
        );

        unsubOrdered = onSnapshot(
            qOrdered,
            (snap) => {
                orderedRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                mergeSnapshotsAndApply();
            },
            handleInventorySnapshotError
        );

        inventoryUnsubRef.current = () => {
            unsubOnHand();
            unsubOrdered();
        };

        return () => {
            isActive = false;
            if (inventoryUnsubRef.current) {
                inventoryUnsubRef.current();
                inventoryUnsubRef.current = null;
            }
            inventoryDetailsEnabledRef.current = false;
        };
    }, [userId, loadInventoryDetails, handleAutoReceive, handleAutoFulfillScheduledUsage]);

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
