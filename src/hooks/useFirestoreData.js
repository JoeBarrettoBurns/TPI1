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
    getDoc,
    setDoc,
    writeBatch,
    getDocs,
    getCountFromServer
} from '../firebase/firestoreWithTracking';
import { db, appId, auth, onAuthStateChanged, signInWithCustomToken, signOut } from '../firebase/config';
import { STANDARD_LENGTHS } from '../constants/materials';
import {
    getUnauthorizedMessage,
    isFirebaseUserAllowed,
    FALLBACK_ALLOWED_EMAILS,
    normalizeEmail,
} from '../constants/authAllowlist';

const ACCESS_ALLOWLIST_DOC = () => doc(db, `artifacts/${appId}/config/access_allowlist`);

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
                // #region agent log
                fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H2',location:'src/hooks/useFirestoreData.js:60',message:'allowlist resolved from firestore',data:{appId,fallbackCount:fallback.length,firestoreCount:fromFs.length,mergedCount:merged.length,casingMismatch},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                return merged;
            }
        }
    } catch (e) {
        console.warn('Could not load access allowlist:', e);
    }
    // #region agent log
    fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H2',location:'src/hooks/useFirestoreData.js:67',message:'allowlist fallback used',data:{appId,fallbackCount:fallback.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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

function debugEmailMeta(email) {
    const normalized = normalizeEmail(email || '');
    if (!normalized || !normalized.includes('@')) return { present: false };
    const [local, domain] = normalized.split('@');
    return {
        present: true,
        domain,
        localLength: local.length,
        isGmailFamily: domain === 'gmail.com' || domain === 'googlemail.com',
    };
}

function debugProviderMetas(user) {
    return (user?.providerData || []).map((p) => ({
        providerId: p?.providerId || 'unknown',
        ...debugEmailMeta(p?.email || ''),
    }));
}

function gmailAlternateEmail(email) {
    const normalized = normalizeEmail(email || '');
    if (normalized.endsWith('@gmail.com')) {
        return `${normalized.slice(0, -'@gmail.com'.length)}@googlemail.com`;
    }
    if (normalized.endsWith('@googlemail.com')) {
        return `${normalized.slice(0, -'@googlemail.com'.length)}@gmail.com`;
    }
    return normalized;
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
    const autoReceiveInFlightRef = useRef(false);
    const scheduledFulfillInFlightRef = useRef(new Set());
    const inventoryUnsubRef = useRef(null);
    const inventoryDetailsEnabledRef = useRef(false);
    const materialsSnapshotRef = useRef({});

    useEffect(() => {
        // #region agent log
        fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H6',location:'src/hooks/useFirestoreData.js:246',message:'hook startup',data:{appId,loadInventoryDetails},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
    }, [loadInventoryDetails]);

    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const allowed = await fetchAllowedEmailsLowercased();
                    const clientAllowed = isFirebaseUserAllowed(user, allowed);
                    const tokenResult = await user.getIdTokenResult(false).catch(() => null);
                    const tokenIdentityEmails = Array.isArray(tokenResult?.claims?.firebase?.identities?.email)
                        ? tokenResult.claims.firebase.identities.email
                        : [];
                    const primaryEmail = normalizeEmail(user.email || '');
                    const tokenEmail = normalizeEmail(tokenResult?.claims?.email || '');
                    const primaryAlt = gmailAlternateEmail(primaryEmail);
                    const tokenAlt = gmailAlternateEmail(tokenEmail);
                    // #region agent log
                    fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H1',location:'src/hooks/useFirestoreData.js:248',message:'auth allowlist evaluation',data:{appId,userIdPresent:!!user.uid,clientAllowed,allowedCount:allowed.length,primary:debugEmailMeta(user.email||''),providers:debugProviderMetas(user),tokenEmail:debugEmailMeta(tokenResult?.claims?.email||''),tokenIdentityDomains:tokenIdentityEmails.map((email)=>debugEmailMeta(email).domain).filter(Boolean),primaryAllowlistExact:primaryEmail ? allowed.includes(primaryEmail) : false,primaryAllowlistAlt:primaryAlt && primaryAlt !== primaryEmail ? allowed.includes(primaryAlt) : false,tokenAllowlistExact:tokenEmail ? allowed.includes(tokenEmail) : false,tokenAllowlistAlt:tokenAlt && tokenAlt !== tokenEmail ? allowed.includes(tokenAlt) : false},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
                    if (!clientAllowed) {
                    try {
                        await signOut(auth);
                    } catch (e) {
                        console.error('signOut after allowlist deny:', e);
                    }
                    // #region agent log
                    fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H4',location:'src/hooks/useFirestoreData.js:242',message:'client auth deny branch',data:{appId,primary:debugEmailMeta(user.email||''),providers:debugProviderMetas(user),tokenEmail:debugEmailMeta(tokenResult?.claims?.email||'')},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
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
                } catch (error) {
                    // #region agent log
                    fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H5',location:'src/hooks/useFirestoreData.js:286',message:'auth callback unexpected error',data:{appId,errorMessage:error?.message||String(error),errorName:error?.name||'',currentUserPrimary:debugEmailMeta(user.email||''),providers:debugProviderMetas(user)},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
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

                    const usedAtIso = now.toISOString();
                    const updatedDetails = [];

                    for (const s of selectedSheets) {
                        const r = doc(db, `artifacts/${appId}/public/data/inventory`, s.id);
                        batch.delete(r);
                        updatedDetails.push({ id: s.id, ...s });
                    }

                    const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, log.id);
                    batch.update(logDocRef, {
                        status: 'Completed',
                        details: updatedDetails,
                        fulfilledAt: usedAtIso,
                    });

                    await batch.commit();
                } catch (error) {
                    console.error(`Auto-fulfill failed for log ${log.id}:`, error);
                } finally {
                    scheduledFulfillInFlightRef.current.delete(log.id);
                }
            })();
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
        // #region agent log
        fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H3',location:'src/hooks/useFirestoreData.js:404',message:'usage logs subscription start',data:{appId,userIdPresent:!!userId,path:`artifacts/${appId}/public/data/usage_logs`,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||''),currentUserProviders:debugProviderMetas(auth.currentUser)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

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

        const loadUsageLogsViaFullRead = async () => {
            const snap = await getDocs(usageLogRef);
            if (snap.size > 8000) {
                throw new Error(
                    `usage_logs has ${snap.size} documents; deploy firestore indexes and use the ordered query instead of loading all.`
                );
            }
            return snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => parseCreatedAtMs(b) - parseCreatedAtMs(a))
                .slice(0, 100);
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
            (err) => {
                console.error('usage_logs snapshot error:', err);
                auth.currentUser?.getIdTokenResult?.(false)
                    .then((tokenResult) => {
                        const tokenIdentityEmails = Array.isArray(tokenResult?.claims?.firebase?.identities?.email)
                            ? tokenResult.claims.firebase.identities.email
                            : [];
                        // #region agent log
                        fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H4',location:'src/hooks/useFirestoreData.js:577',message:'usage logs snapshot error',data:{appId,errorCode:err?.code||'',errorMessage:err?.message||'',userIdPresent:!!userId,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||''),currentUserProviders:debugProviderMetas(auth.currentUser),tokenEmail:debugEmailMeta(tokenResult?.claims?.email||''),tokenIdentityDomains:tokenIdentityEmails.map((email)=>debugEmailMeta(email).domain).filter(Boolean)},timestamp:Date.now()})}).catch(()=>{});
                        // #endregion
                    })
                    .catch(() => {
                        // #region agent log
                        fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H4',location:'src/hooks/useFirestoreData.js:581',message:'usage logs snapshot error token lookup failed',data:{appId,errorCode:err?.code||'',errorMessage:err?.message||'',userIdPresent:!!userId,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||''),currentUserProviders:debugProviderMetas(auth.currentUser)},timestamp:Date.now()})}).catch(()=>{});
                        // #endregion
                    });
                hasUsage = true;
                markReady();
                (async () => {
                    try {
                        const usageData = await loadUsageLogsViaFullRead();
                        if (!isActive) return;
                        setUsageLog(usageData);
                        if (inventoryDetailsEnabledRef.current) {
                            handleAutoFulfillScheduledUsage(usageData, inventoryRef.current);
                        }
                        if (err?.code === 'failed-precondition') {
                            setError('');
                        } else {
                            setError(
                                `Usage logs: real-time listener failed (${err?.code || 'error'}). Loaded latest ${usageData.length} entries (fallback). If this persists, check the browser console and Firebase → Firestore → Indexes.`
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
                // #region agent log
                fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H7',location:'src/hooks/useFirestoreData.js:606',message:'materials fetch success',data:{appId,materialCount:snap.size,userIdPresent:!!userId,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||'')},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                setMaterials(materialsData);
                hasMaterials = true;
            } catch (err) {
                console.error('Failed to load materials:', err);
                // #region agent log
                fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H7',location:'src/hooks/useFirestoreData.js:611',message:'materials fetch error',data:{appId,errorCode:err?.code||'',errorMessage:err?.message||'',userIdPresent:!!userId,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||'')},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
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
        const qOnHand = query(inventoryCollectionRef, where('status', '==', 'On Hand'));
        const qOrdered = query(inventoryCollectionRef, where('status', '==', 'Ordered'));
        // #region agent log
        fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H8',location:'src/hooks/useFirestoreData.js:743',message:'inventory subscriptions start',data:{appId,userIdPresent:!!userId,onHandPath:`artifacts/${appId}/public/data/inventory`,orderedPath:`artifacts/${appId}/public/data/inventory`,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||'')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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
            setInventoryReady(true);
        };

        let snapshotErrorHandled = false;
        let unsubOnHand = () => {};
        let unsubOrdered = () => {};

        const handleInventorySnapshotError = async (err) => {
            if (snapshotErrorHandled || !isActive) return;
            snapshotErrorHandled = true;
            console.error('Inventory snapshot error:', err);
            // #region agent log
            fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H8',location:'src/hooks/useFirestoreData.js:718',message:'inventory snapshot error',data:{appId,errorCode:err?.code||'',errorMessage:err?.message||'',userIdPresent:!!userId,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||'')},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            unsubOnHand();
            unsubOrdered();
            try {
                await loadInventoryFallback();
            } catch (fallbackErr) {
                console.error('Inventory load fallback failed:', fallbackErr);
                // #region agent log
                fetch('http://127.0.0.1:7496/ingest/c991b8ad-d2e7-4957-a523-2d962e494a95',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'98f95f'},body:JSON.stringify({sessionId:'98f95f',runId:'usage-permission-pre',hypothesisId:'H8',location:'src/hooks/useFirestoreData.js:724',message:'inventory fallback error',data:{appId,errorCode:err?.code||'',errorMessage:err?.message||'',fallbackCode:fallbackErr?.code||'',fallbackMessage:fallbackErr?.message||'',userIdPresent:!!userId,currentUserPrimary:debugEmailMeta(auth.currentUser?.email||'')},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
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