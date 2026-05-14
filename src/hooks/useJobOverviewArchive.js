import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc, updateDoc, deleteField } from '../firebase/firestoreWithTracking';
import { db, appId } from '../firebase/config';

const archiveDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'job_overview_archive', 'settings');

export function useJobOverviewArchive(userId) {
    const [archivedBaseKeys, setArchivedBaseKeys] = useState(() => new Set());
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!userId) {
            setArchivedBaseKeys(new Set());
            setReady(false);
            return undefined;
        }

        const ref = archiveDocRef();
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const bases = snap.exists() ? snap.data()?.bases : null;
                const keys =
                    bases && typeof bases === 'object'
                        ? Object.keys(bases).map((k) => k.trim().toUpperCase()).filter(Boolean)
                        : [];
                setArchivedBaseKeys(new Set(keys));
                setReady(true);
            },
            (err) => {
                console.error('job_overview_archive listener:', err);
                setReady(true);
            }
        );
        return () => unsub();
    }, [userId]);

    const archivePoBase = useCallback(async (baseKeyRaw) => {
        const k = String(baseKeyRaw ?? '').trim().toUpperCase();
        if (!k) return;
        const ref = archiveDocRef();
        await setDoc(
            ref,
            {
                bases: { [k]: true },
                updatedAt: new Date().toISOString(),
            },
            { merge: true }
        );
    }, []);

    const restorePoBase = useCallback(async (baseKeyRaw) => {
        const k = String(baseKeyRaw ?? '').trim().toUpperCase();
        if (!k) return;
        const ref = archiveDocRef();
        try {
            await updateDoc(ref, { [`bases.${k}`]: deleteField() });
        } catch (e) {
            if (e?.code !== 'not-found') console.warn('restorePoBase:', e);
        }
    }, []);

    return { archivedBaseKeys, archiveReady: ready, archivePoBase, restorePoBase };
}
