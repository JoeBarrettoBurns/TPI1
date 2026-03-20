// src/hooks/useSuppliersSync.js
// Keeps supplier list + autofill in sync via Firestore (shared across devices) with localStorage as cache.

import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from '../firebase/firestoreWithTracking';
import { db, appId } from '../firebase/config';
import { INITIAL_SUPPLIERS } from '../constants/materials';

const SUPPLIERS_LOCAL_KEY = 'suppliers';
const SUPPLIER_INFO_LOCAL_KEY = 'supplier-autofill';

function supplierSettingsDocRef() {
    return doc(db, `artifacts/${appId}/public/data/supplier_settings`, 'default');
}

function readLocalSuppliers() {
    try {
        const raw = localStorage.getItem(SUPPLIERS_LOCAL_KEY);
        if (raw) return JSON.parse(raw);
    } catch {
        /* ignore */
    }
    return INITIAL_SUPPLIERS;
}

function readLocalSupplierInfo() {
    try {
        const raw = localStorage.getItem(SUPPLIER_INFO_LOCAL_KEY);
        if (raw) return JSON.parse(raw);
    } catch {
        /* ignore */
    }
    return {};
}

function persistLocal(suppliers, supplierInfo) {
    try {
        localStorage.setItem(SUPPLIERS_LOCAL_KEY, JSON.stringify(suppliers));
        localStorage.setItem(SUPPLIER_INFO_LOCAL_KEY, JSON.stringify(supplierInfo));
    } catch (error) {
        console.error('Failed to persist suppliers locally', error);
    }
}

/** Firestore rejects undefined; strip recursively for maps of supplier rows. */
function sanitizeSupplierInfo(info) {
    if (!info || typeof info !== 'object') return {};
    const out = {};
    for (const [key, val] of Object.entries(info)) {
        if (!val || typeof val !== 'object') continue;
        const row = {};
        for (const [k, v] of Object.entries(val)) {
            if (v !== undefined) row[k] = v;
        }
        if (Object.keys(row).length) out[key] = row;
    }
    return out;
}

export function useSuppliersSync(userId) {
    const [suppliers, setSuppliers] = useState(readLocalSuppliers);
    const [supplierInfo, setSupplierInfo] = useState(readLocalSupplierInfo);
    const [syncReady, setSyncReady] = useState(false);
    const debounceTimerRef = useRef(null);
    /** When true, next state change came from Firestore — do not write back (avoids echo loop / 1 write per second). */
    const skipNextPersistRef = useRef(false);

    useEffect(() => {
        if (!userId) {
            setSyncReady(false);
            return undefined;
        }

        const docRef = supplierSettingsDocRef();
        const unsub = onSnapshot(
            docRef,
            async (snap) => {
                if (!snap.exists()) {
                    const s = readLocalSuppliers();
                    const si = readLocalSupplierInfo();
                    skipNextPersistRef.current = true;
                    setSuppliers(Array.isArray(s) ? s : INITIAL_SUPPLIERS);
                    setSupplierInfo(si && typeof si === 'object' ? si : {});
                    try {
                        await setDoc(docRef, {
                            suppliers: Array.isArray(s) ? s : INITIAL_SUPPLIERS,
                            supplierInfo: sanitizeSupplierInfo(si),
                            updatedAt: serverTimestamp(),
                        });
                    } catch (err) {
                        console.error('Failed to seed supplier settings in Firestore', err);
                    }
                    setSyncReady(true);
                    return;
                }

                const data = snap.data();
                const nextSuppliers =
                    Array.isArray(data.suppliers) && data.suppliers.length > 0 ? data.suppliers : INITIAL_SUPPLIERS;
                const nextInfo = data.supplierInfo && typeof data.supplierInfo === 'object' ? data.supplierInfo : {};

                skipNextPersistRef.current = true;
                setSuppliers(nextSuppliers);
                setSupplierInfo(nextInfo);
                setSyncReady(true);
            },
            (err) => {
                console.error('Supplier settings sync failed:', err);
                setSyncReady(true);
            }
        );

        return () => {
            unsub();
            setSyncReady(false);
        };
    }, [userId]);

    useEffect(() => {
        persistLocal(suppliers, supplierInfo);
    }, [suppliers, supplierInfo]);

    useEffect(() => {
        if (!userId || !syncReady) return undefined;

        if (skipNextPersistRef.current) {
            skipNextPersistRef.current = false;
            return undefined;
        }

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            if (skipNextPersistRef.current) {
                skipNextPersistRef.current = false;
                return;
            }
            const docRef = supplierSettingsDocRef();
            setDoc(
                docRef,
                {
                    suppliers: Array.isArray(suppliers) ? suppliers : INITIAL_SUPPLIERS,
                    supplierInfo: sanitizeSupplierInfo(supplierInfo),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            ).catch((err) => console.error('Failed to save supplier settings', err));
        }, 450);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [userId, syncReady, suppliers, supplierInfo]);

    return { suppliers, setSuppliers, supplierInfo, setSupplierInfo };
}
