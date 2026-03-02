// Wraps Firestore API to track reads, writes, deletes for the debug panel.
// Re-exports everything from firebase/firestore with tracking on key operations.

import * as firestore from 'firebase/firestore';
import { recordRead, recordWrite, recordDelete } from '../utils/firestoreUsageTracker';

// Re-export all - we'll override the ones we track
export * from 'firebase/firestore';

// Tracked getDocs
export async function getDocs(queryConstraint) {
    const snap = await firestore.getDocs(queryConstraint);
    recordRead(snap.size);
    return snap;
}

// Tracked getDoc
export async function getDoc(documentRef) {
    const snap = await firestore.getDoc(documentRef);
    recordRead(snap.exists() ? 1 : 0);
    return snap;
}

// Tracked getCountFromServer - estimate 1 read per aggregate query
export async function getCountFromServer(queryConstraint) {
    const snap = await firestore.getCountFromServer(queryConstraint);
    recordRead(1);
    return snap;
}

// Tracked writeBatch - wraps batch to count set/update/delete
export function writeBatch(db) {
    const batch = firestore.writeBatch(db);
    const counts = { writes: 0, deletes: 0 };
    return {
        set: (...args) => {
            batch.set(...args);
            counts.writes++;
        },
        update: (...args) => {
            batch.update(...args);
            counts.writes++;
        },
        delete: (...args) => {
            batch.delete(...args);
            counts.deletes++;
        },
        commit: () =>
            batch.commit().then(() => {
                recordWrite(counts.writes);
                recordDelete(counts.deletes);
            }),
    };
}

// Tracked runTransaction - wraps transaction to count get/set/update/delete
export function runTransaction(db, updateFunction) {
    const counts = { reads: 0, writes: 0, deletes: 0 };
    const wrappedUpdate = async (transaction) => {
        const wrappedTx = {
            get: async (ref) => {
                const snap = await transaction.get(ref);
                counts.reads += snap.exists() ? 1 : 0;
                return snap;
            },
            set: (ref, data, options) => {
                transaction.set(ref, data, options);
                counts.writes++;
            },
            update: (ref, data) => {
                transaction.update(ref, data);
                counts.writes++;
            },
            delete: (ref) => {
                transaction.delete(ref);
                counts.deletes++;
            },
        };
        await updateFunction(wrappedTx);
    };
    return firestore.runTransaction(db, wrappedUpdate).then((result) => {
        recordRead(counts.reads);
        recordWrite(counts.writes);
        recordDelete(counts.deletes);
        return result;
    });
}

// Tracked updateDoc - single write
export async function updateDoc(documentRef, data) {
    const result = await firestore.updateDoc(documentRef, data);
    recordWrite(1);
    return result;
}

// Tracked setDoc - single write
export async function setDoc(documentRef, data, options) {
    const result = await firestore.setDoc(documentRef, data, options);
    recordWrite(1);
    return result;
}

// Tracked onSnapshot - each snapshot callback = docs.length reads
export function onSnapshot(refOrQuery, onNext, onError, onCompletion) {
    return firestore.onSnapshot(
        refOrQuery,
        (snap) => {
            recordRead(snap.size);
            onNext(snap);
        },
        onError,
        onCompletion
    );
}
