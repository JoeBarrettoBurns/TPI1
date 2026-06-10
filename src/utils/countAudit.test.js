// src/utils/countAudit.test.js
//
// The auditor must (a) pass clean data and (b) catch every kind of corruption
// it claims to detect — otherwise "verified" means nothing.

import { auditCounts } from './countAudit';

let nextId = 0;
const makeSheet = (overrides = {}) => ({
    id: `sheet-${++nextId}`,
    materialType: '20GA-GALV',
    length: 144,
    width: 48,
    status: 'On Hand',
    job: 'J100',
    supplier: 'RYERSON',
    createdAt: '2026-06-01T15:30:00.000Z',
    ...overrides,
});

const makeCompletedLog = (id, details, overrides = {}) => ({
    id,
    job: 'J200',
    customer: 'ACME',
    status: 'Completed',
    createdAt: '2026-06-03T18:00:00.000Z',
    usedAt: '2026-06-03T18:00:00.000Z',
    details,
    qty: -details.length,
    ...overrides,
});

beforeEach(() => {
    nextId = 0;
});

describe('auditCounts', () => {
    test('clean data verifies with zero issues', () => {
        const all = Array.from({ length: 10 }, () => makeSheet());
        const used = all.slice(0, 4);
        const live = all.slice(4);

        const result = auditCounts(live, [makeCompletedLog('log-1', used)]);

        expect(result.ok).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.stats.sheetsChecked).toBe(10);
    });

    test('clean data with scheduled logs and manual edits still verifies', () => {
        const live = Array.from({ length: 5 }, () => makeSheet());
        const removed = [makeSheet(), makeSheet()];
        const logs = [
            makeCompletedLog('log-rm', removed, { job: 'MODIFICATION: REMOVE', customer: 'Manual Edit' }),
            {
                id: 'log-sched', job: 'J300', customer: 'ACME', status: 'Scheduled',
                createdAt: '2026-06-05T10:00:00.000Z', usedAt: '2026-06-20T23:59:59.000Z',
                details: [{ materialType: '20GA-GALV', length: 144, width: 48 }], qty: -1,
            },
        ];

        const result = auditCounts(live, logs);
        expect(result.ok).toBe(true);
    });

    test('catches a log whose stored qty disagrees with its item snapshots', () => {
        const used = [makeSheet(), makeSheet()];
        const log = makeCompletedLog('log-1', used, { qty: -5 });

        const result = auditCounts([], [log]);
        expect(result.ok).toBe(false);
        expect(result.issues.some(i => i.type === 'log-qty-mismatch')).toBe(true);
    });

    test('catches the same sheet claimed by two usage logs', () => {
        const sheet = makeSheet();
        const result = auditCounts([], [
            makeCompletedLog('log-1', [sheet]),
            makeCompletedLog('log-2', [sheet]),
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some(i => i.type === 'sheet-in-two-logs')).toBe(true);
    });

    test('catches the same sheet listed twice on a single log', () => {
        const sheet = makeSheet();
        const result = auditCounts([], [
            makeCompletedLog('log-1', [sheet, { ...sheet }]),
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some(i => i.type === 'sheet-duplicated-in-log' && i.logId === 'log-1')).toBe(true);
        // It must not be misreported as a conflict between two logs.
        expect(result.issues.some(i => i.type === 'sheet-in-two-logs')).toBe(false);
    });

    test('catches a sheet that is both live and marked used', () => {
        const sheet = makeSheet();
        const result = auditCounts([sheet], [makeCompletedLog('log-1', [sheet])]);

        expect(result.ok).toBe(false);
        expect(result.issues.some(i => i.type === 'sheet-live-and-used')).toBe(true);
    });

    test('flags legacy usage snapshots that cannot be traced to an order', () => {
        const log = makeCompletedLog('log-old', [
            { materialType: '20GA-GALV', length: 144, width: 48 }, // no id
        ], { qty: -1 });

        const result = auditCounts([], [log]);
        expect(result.ok).toBe(false);
        expect(result.issues.some(i => i.type === 'details-missing-ids')).toBe(true);
    });

    test('archived logs are excluded from all checks', () => {
        const log = makeCompletedLog('log-arch', [makeSheet(), makeSheet()], { qty: -99, status: 'Archived' });
        const result = auditCounts([], [log]);
        expect(result.ok).toBe(true);
    });
});
