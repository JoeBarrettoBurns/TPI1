// src/utils/backupService.test.js
//
// Restore is the single most destructive operation in the app. These tests pin
// the two rules that keep it from destroying live data:
//   - an empty backup collection never clears the live one
//   - restored documents are written before stale ones are pruned

jest.mock('../firebase/firestoreWithTracking', () => {
    const collection = (_db, path) => ({ path, __kind: 'collection' });
    const doc = (_db, path, id) => ({ path: `${path}/${id}`, id });
    return {
        collection,
        doc,
        getDocs: jest.fn(),
        writeBatch: jest.fn(),
        setDoc: jest.fn(),
        getDoc: jest.fn(),
        collectionGroup: jest.fn(),
    };
});

import { getDocs, writeBatch } from '../firebase/firestoreWithTracking';
import { restoreCollectionsFromBackup } from './backupService';

const APP_ID = 'test-app';

const snapshotOf = (docs) => ({
    size: docs.length,
    empty: docs.length === 0,
    docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
});

/** Records every batch operation in the order the code performs them. */
function installBatchRecorder() {
    const operations = [];
    writeBatch.mockImplementation(() => ({
        set: (ref) => operations.push({ op: 'set', path: ref.path }),
        delete: (ref) => operations.push({ op: 'delete', path: ref.path }),
        commit: async () => {},
    }));
    return operations;
}

/** `store[path]` is the docs each getDocs call should return for that path. */
function installStore(store) {
    getDocs.mockImplementation(async (ref) => snapshotOf(store[ref.path] || []));
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('restoreCollectionsFromBackup', () => {
    test('a backup with no documents for a collection leaves it untouched', async () => {
        const operations = installBatchRecorder();
        installStore({
            // The backup has materials but never captured usage_logs.
            [`artifacts/${APP_ID}/public/data/backups/B1/materials`]: [{ id: 'steel' }],
            [`artifacts/${APP_ID}/public/data/backups/B1/usage_logs`]: [],
            [`artifacts/${APP_ID}/public/data/materials`]: [{ id: 'steel' }],
            [`artifacts/${APP_ID}/public/data/usage_logs`]: [{ id: 'log-1' }, { id: 'log-2' }],
        });

        const result = await restoreCollectionsFromBackup(db(), APP_ID, 'B1', ['materials', 'usage_logs']);

        expect(result.skipped).toEqual(['usage_logs']);
        // The live usage logs must still be there.
        const deletedLogs = operations.filter(o => o.op === 'delete' && o.path.includes('/usage_logs/'));
        expect(deletedLogs).toEqual([]);
    });

    test('reports skipped collections through onProgress', async () => {
        installBatchRecorder();
        installStore({ [`artifacts/${APP_ID}/public/data/backups/B1/usage_logs`]: [] });
        const phases = [];

        await restoreCollectionsFromBackup(db(), APP_ID, 'B1', ['usage_logs'], (p) => phases.push(p.phase));

        expect(phases).toContain('skipped-empty');
        expect(phases).not.toContain('collection-complete');
    });

    test('writes restored documents before pruning stale ones', async () => {
        const operations = installBatchRecorder();
        installStore({
            [`artifacts/${APP_ID}/public/data/backups/B1/inventory`]: [{ id: 'keep-1' }],
            [`artifacts/${APP_ID}/public/data/inventory`]: [{ id: 'keep-1' }, { id: 'stale-1' }],
        });

        await restoreCollectionsFromBackup(db(), APP_ID, 'B1', ['inventory']);

        const firstDelete = operations.findIndex(o => o.op === 'delete');
        const lastSet = operations.map(o => o.op).lastIndexOf('set');
        // Every write happens before the first delete, so the collection is never
        // empty part-way through — an interrupted restore leaves extra docs, not a hole.
        expect(lastSet).toBeLessThan(firstDelete);
    });

    test('prunes only documents the backup does not contain', async () => {
        const operations = installBatchRecorder();
        installStore({
            [`artifacts/${APP_ID}/public/data/backups/B1/inventory`]: [{ id: 'keep-1' }, { id: 'keep-2' }],
            [`artifacts/${APP_ID}/public/data/inventory`]: [{ id: 'keep-1' }, { id: 'keep-2' }, { id: 'stale-1' }],
        });

        const result = await restoreCollectionsFromBackup(db(), APP_ID, 'B1', ['inventory']);

        const deleted = operations.filter(o => o.op === 'delete').map(o => o.path);
        expect(deleted).toEqual([`artifacts/${APP_ID}/public/data/inventory/stale-1`]);
        expect(result.restored).toBe(2);
        expect(result.removed).toBe(1);
    });

    test('restores into an empty live collection without trying to delete anything', async () => {
        const operations = installBatchRecorder();
        installStore({
            [`artifacts/${APP_ID}/public/data/backups/B1/inventory`]: [{ id: 'a' }, { id: 'b' }],
            [`artifacts/${APP_ID}/public/data/inventory`]: [],
        });

        const result = await restoreCollectionsFromBackup(db(), APP_ID, 'B1', ['inventory']);

        expect(result.restored).toBe(2);
        expect(result.removed).toBe(0);
        expect(operations.some(o => o.op === 'delete')).toBe(false);
    });
});

// The service only passes `db` through to the mocked helpers.
function db() {
    return {};
}
