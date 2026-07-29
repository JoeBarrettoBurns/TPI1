// src/utils/stockClaim.test.js
//
// This module is the only way stock is consumed, so its guarantees are the ones
// that keep counts honest: FIFO selection, no sheet reserved twice, and a
// transaction that refuses to claim anything that is no longer On Hand.

import {
    planSheetRequirement,
    countRequirementsByKey,
    reserveOnHandSheets,
    StockConflictError,
    CLAIM_CANDIDATE_BUFFER,
} from './stockClaim';

const MAT = '20GA-GALV';

let nextId = 0;
const makeSheet = (overrides = {}) => ({
    id: `sheet-${++nextId}`,
    materialType: MAT,
    length: 144,
    status: 'On Hand',
    createdAt: '2026-06-01T15:30:00.000Z',
    ...overrides,
});

/** Minimal stand-in for a Firestore transaction over an in-memory sheet table. */
const makeTx = (sheetsById) => ({
    get: async (ref) => {
        const data = sheetsById[ref.id];
        return {
            id: ref.id,
            exists: () => Boolean(data),
            data: () => data,
        };
    },
});

// reserveOnHandSheets resolves refs through `doc(collectionRef, id)`; the mock
// keeps just the id, which is all the fake transaction needs.
jest.mock('../firebase/firestoreWithTracking', () => ({
    doc: (_collectionRef, id) => ({ id }),
}));

beforeEach(() => {
    nextId = 0;
});

describe('planSheetRequirement', () => {
    test('picks oldest-first and offers a buffer of extra candidates', () => {
        const inventory = [
            makeSheet({ createdAt: '2026-06-03T00:00:00.000Z' }),
            makeSheet({ createdAt: '2026-06-01T00:00:00.000Z' }),
            makeSheet({ createdAt: '2026-06-02T00:00:00.000Z' }),
        ];

        const req = planSheetRequirement(inventory, { materialType: MAT, length: 144, qty: 2 });

        expect(req.reservedIds).toEqual(['sheet-2', 'sheet-3']); // oldest two
        expect(req.candidateIds.length).toBe(3); // all that exist, capped by buffer
        expect(req.candidateIds.length).toBeLessThanOrEqual(2 + CLAIM_CANDIDATE_BUFFER);
    });

    test('ignores sheets that are not On Hand', () => {
        const inventory = [
            makeSheet({ status: 'Ordered' }),
            makeSheet({ status: 'Used' }),
            makeSheet(),
        ];

        const req = planSheetRequirement(inventory, { materialType: MAT, length: 144, qty: 1 });
        expect(req.reservedIds).toEqual(['sheet-3']);
    });

    test('two requirements in one submission never reserve the same sheet', () => {
        const inventory = [makeSheet(), makeSheet(), makeSheet()];
        const allocated = new Set();

        const first = planSheetRequirement(inventory, { materialType: MAT, length: 144, qty: 2 }, allocated);
        const second = planSheetRequirement(inventory, { materialType: MAT, length: 144, qty: 1 }, allocated);

        expect(first.reservedIds).toEqual(['sheet-1', 'sheet-2']);
        expect(second.reservedIds).toEqual(['sheet-3']);
        expect(allocated.size).toBe(3);
    });

    test('throws before opening a transaction when the snapshot is short', () => {
        expect(() => planSheetRequirement([makeSheet()], { materialType: MAT, length: 144, qty: 2 }))
            .toThrow(StockConflictError);
    });

    test('reservedIds are exactly what was added to the allocation set', () => {
        const inventory = Array.from({ length: 10 }, () => makeSheet());
        const allocated = new Set();

        const req = planSheetRequirement(inventory, { materialType: MAT, length: 144, qty: 2 }, allocated);

        expect(req.candidateIds.length).toBeGreaterThan(req.reservedIds.length); // buffer present
        expect([...allocated]).toEqual(req.reservedIds);
    });
});

describe('countRequirementsByKey', () => {
    test('collapses detail snapshots into per material+length counts', () => {
        const needs = countRequirementsByKey([
            { materialType: MAT, length: 144 },
            { materialType: MAT, length: 144 },
            { materialType: MAT, length: 96 },
            { materialType: 'OTHER', length: 96 },
        ]);

        expect(needs).toEqual([
            { materialType: MAT, length: 144, qty: 2 },
            { materialType: MAT, length: 96, qty: 1 },
            { materialType: 'OTHER', length: 96, qty: 1 },
        ]);
    });

    test('ignores malformed entries instead of creating a phantom requirement', () => {
        expect(countRequirementsByKey([null, {}, { length: 96 }])).toEqual([]);
        expect(countRequirementsByKey()).toEqual([]);
    });
});

describe('reserveOnHandSheets', () => {
    test('claims the first still-On-Hand candidates', async () => {
        const sheets = { a: { status: 'On Hand' }, b: { status: 'On Hand' } };
        const [picked] = await reserveOnHandSheets(makeTx(sheets), {}, [
            { materialType: MAT, length: 144, qty: 2, candidateIds: ['a', 'b'], reservedIds: ['a', 'b'] },
        ]);

        expect(picked.map((s) => s.id)).toEqual(['a', 'b']);
    });

    test('skips a candidate another client consumed and heals from the buffer', async () => {
        const sheets = {
            a: { status: 'Used' },      // taken since the snapshot
            b: { status: 'On Hand' },
            c: { status: 'On Hand' },   // buffer candidate
        };

        const [picked] = await reserveOnHandSheets(makeTx(sheets), {}, [
            { materialType: MAT, length: 144, qty: 2, candidateIds: ['a', 'b', 'c'], reservedIds: ['a', 'b'] },
        ]);

        expect(picked.map((s) => s.id)).toEqual(['b', 'c']);
    });

    test('aborts when the buffer cannot cover what was taken', async () => {
        const sheets = { a: { status: 'Used' }, b: { status: 'Used' } };

        await expect(reserveOnHandSheets(makeTx(sheets), {}, [
            { materialType: MAT, length: 144, qty: 2, candidateIds: ['a', 'b'], reservedIds: ['a', 'b'] },
        ])).rejects.toThrow(StockConflictError);
    });

    test('a deleted sheet is treated as unavailable, not claimed as undefined', async () => {
        const sheets = { b: { status: 'On Hand' } }; // 'a' no longer exists

        const [picked] = await reserveOnHandSheets(makeTx(sheets), {}, [
            { materialType: MAT, length: 144, qty: 1, candidateIds: ['a', 'b'], reservedIds: ['a'] },
        ]);

        expect(picked.map((s) => s.id)).toEqual(['b']);
    });

    test('two requirements in the same transaction never claim the same sheet', async () => {
        const sheets = { a: { status: 'On Hand' }, b: { status: 'On Hand' } };

        const [first, second] = await reserveOnHandSheets(makeTx(sheets), {}, [
            { materialType: MAT, length: 144, qty: 1, candidateIds: ['a', 'b'], reservedIds: ['a'] },
            { materialType: MAT, length: 144, qty: 1, candidateIds: ['a', 'b'], reservedIds: ['b'] },
        ]);

        expect(first.map((s) => s.id)).toEqual(['a']);
        expect(second.map((s) => s.id)).toEqual(['b']);
    });

    test('a later requirement running short aborts the whole claim', async () => {
        const sheets = { a: { status: 'On Hand' } };

        await expect(reserveOnHandSheets(makeTx(sheets), {}, [
            { materialType: MAT, length: 144, qty: 1, candidateIds: ['a'], reservedIds: ['a'] },
            { materialType: MAT, length: 96, qty: 1, candidateIds: ['a'], reservedIds: ['a'] },
        ])).rejects.toThrow(StockConflictError);
    });
});
