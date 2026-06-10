// src/components/modals/LogDetailModal.test.js
//
// The detail modal must show ONE slot per material + size. Sheets whose cost
// records differ (e.g. a manually added sheet stored with no cost) must not
// split the same material into separate quantity slots.

import { groupLogDetailItems } from './LogDetailModal';

const makeDetail = (overrides = {}) => ({
    id: `sheet-${Math.random()}`,
    materialType: '20GA-GALV',
    width: 48,
    length: 144,
    costPerPound: 0.8,
    ...overrides,
});

describe('groupLogDetailItems (Log Entry Details slots)', () => {
    test('same material and size with mixed cost records stays in ONE slot', () => {
        // The reported bug: 7 sheets at $0.8 and 1 sheet with no recorded cost
        // showed as two separate slots (Quantity 7 and Quantity 1).
        const logEntry = {
            job: 'J200',
            details: [
                ...Array.from({ length: 7 }, () => makeDetail()),
                makeDetail({ costPerPound: undefined }),
            ],
        };

        const groups = groupLogDetailItems(logEntry);

        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(8);
        // Cost info is preserved for aggregate display: seven $0.8 sheets + one unknown.
        expect(groups[0].costPerPoundValues.filter(v => v === 0.8)).toHaveLength(7);
        expect(groups[0].costPerPoundValues.filter(v => v === 0)).toHaveLength(1);
    });

    test('quantity always equals the number of sheets in the log', () => {
        const logEntry = {
            job: 'J200',
            details: Array.from({ length: 12 }, () => makeDetail()),
        };

        const groups = groupLogDetailItems(logEntry);
        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(12);
    });

    test('different sizes still get their own slots', () => {
        const logEntry = {
            job: 'J200',
            details: [
                ...Array.from({ length: 3 }, () => makeDetail({ length: 96 })),
                ...Array.from({ length: 5 }, () => makeDetail({ length: 144 })),
            ],
        };

        const groups = groupLogDetailItems(logEntry);
        expect(groups).toHaveLength(2);
        const counts = Object.fromEntries(groups.map(g => [g.length, g.count]));
        expect(counts).toEqual({ 96: 3, 144: 5 });
    });

    test('different materials still get their own slots', () => {
        const logEntry = {
            job: 'J200',
            details: [
                ...Array.from({ length: 2 }, () => makeDetail()),
                ...Array.from({ length: 4 }, () => makeDetail({ materialType: '16GA-ALUM' })),
            ],
        };

        const groups = groupLogDetailItems(logEntry);
        expect(groups).toHaveLength(2);
    });

    test('incoming orders keep separate slots per expected arrival date', () => {
        const logEntry = {
            job: 'J100',
            isAddition: true,
            details: [
                makeDetail({ arrivalDate: '2026-06-15T00:00:00.000Z' }),
                makeDetail({ arrivalDate: '2026-06-20T00:00:00.000Z' }),
            ],
        };

        const groups = groupLogDetailItems(logEntry);
        expect(groups).toHaveLength(2);
    });

    test('outgoing logs ignore arrival dates when grouping', () => {
        const logEntry = {
            job: 'J200',
            details: [
                makeDetail({ arrivalDate: '2026-06-15T00:00:00.000Z' }),
                makeDetail({ arrivalDate: '2026-06-20T00:00:00.000Z' }),
            ],
        };

        const groups = groupLogDetailItems(logEntry);
        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(2);
    });

    test('prefers displayDetails (full history) over live details', () => {
        const logEntry = {
            job: 'J100',
            displayDetails: Array.from({ length: 10 }, () => makeDetail()),
            details: Array.from({ length: 6 }, () => makeDetail()),
        };

        const groups = groupLogDetailItems(logEntry);
        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(10);
    });

    test('modification logs with aggregated qty entries pass through unchanged', () => {
        const logEntry = {
            job: 'MODIFICATION: REMOVE',
            details: [
                { materialType: '20GA-GALV', width: 48, length: 144, qty: -3 },
            ],
        };

        const groups = groupLogDetailItems(logEntry);
        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(-3);
    });
});
