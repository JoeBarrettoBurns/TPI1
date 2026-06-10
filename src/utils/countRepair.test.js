// src/utils/countRepair.test.js
//
// The repair planner decides which usage log keeps a disputed sheet. It must
// always defer to the inventory document's own usageLogId pointer, never
// delete data it cannot attribute, and leave totals exactly equal to the
// remaining item snapshots.

import { planCountRepairs } from './countRepair';

const sheet = (id) => ({ id, materialType: '20GA-GALV', length: 144, width: 48 });

const log = (id, details, overrides = {}) => ({
    id,
    job: `JOB-${id}`,
    customer: 'ACME',
    status: 'Completed',
    createdAt: '2026-06-01T10:00:00.000Z',
    usedAt: '2026-06-01T10:00:00.000Z',
    details,
    qty: -details.length,
    ...overrides,
});

const dupIssue = (sheetId, logIds) => ({
    type: 'sheet-in-two-logs',
    sheetId,
    materialType: '20GA-GALV',
    length: 144,
    logIds,
});

describe('planCountRepairs', () => {
    test('the log named by the sheet document keeps the sheet; the other loses it', () => {
        const s = sheet('s1');
        const logs = [
            log('logA', [s, sheet('s2')]),
            log('logB', [s, sheet('s3')], { usedAt: '2026-06-05T10:00:00.000Z' }),
        ];
        const sheetInfo = new Map([['s1', { exists: true, status: 'Used', usageLogId: 'logA' }]]);

        const plan = planCountRepairs([dupIssue('s1', ['logA', 'logB'])], logs, sheetInfo);

        expect(plan.logUpdates).toHaveLength(1);
        expect(plan.logUpdates[0].logId).toBe('logB');
        expect(plan.logUpdates[0].details.map(d => d.id)).toEqual(['s3']);
        expect(plan.logUpdates[0].qty).toBe(-1);
        // logA already owns it per the pointer — no relink needed.
        expect(plan.pointerFixes).toHaveLength(0);
    });

    test('without a pointer, the most recent log keeps the sheet and gets relinked', () => {
        const s = sheet('s1');
        const logs = [
            log('logOld', [s], { usedAt: '2026-06-01T10:00:00.000Z' }),
            log('logNew', [s], { usedAt: '2026-06-08T10:00:00.000Z' }),
        ];
        const sheetInfo = new Map([['s1', { exists: true, status: 'Used', usageLogId: null }]]);

        const plan = planCountRepairs([dupIssue('s1', ['logOld', 'logNew'])], logs, sheetInfo);

        // logOld loses its only sheet, so it is deleted rather than left empty.
        expect(plan.logUpdates).toHaveLength(0);
        expect(plan.logDeletes).toEqual([{ logId: 'logOld', removed: 1 }]);
        expect(plan.pointerFixes).toEqual([{ sheetId: 's1', usageLogId: 'logNew' }]);
    });

    test('a log emptied of all its sheets is planned for deletion, not a qty-0 update', () => {
        const s1 = sheet('s1');
        const s2 = sheet('s2');
        const logs = [
            log('logHusk', [s1, s2]),
            log('logKeeper', [s1, s2], { usedAt: '2026-06-09T10:00:00.000Z' }),
        ];
        const sheetInfo = new Map([
            ['s1', { exists: true, status: 'Used', usageLogId: 'logKeeper' }],
            ['s2', { exists: true, status: 'Used', usageLogId: 'logKeeper' }],
        ]);

        const plan = planCountRepairs(
            [dupIssue('s1', ['logHusk', 'logKeeper']), dupIssue('s2', ['logHusk', 'logKeeper'])],
            logs,
            sheetInfo
        );

        expect(plan.logUpdates).toHaveLength(0);
        expect(plan.logDeletes).toEqual([{ logId: 'logHusk', removed: 2 }]);
    });

    test('a sheet listed twice on the same log keeps one copy; legacy no-id items survive', () => {
        const s1 = sheet('s1');
        const legacy = { materialType: '20GA-GALV', length: 120 }; // no id
        const logs = [log('logA', [s1, { ...s1 }, legacy, sheet('s2')])];

        const plan = planCountRepairs(
            [{ type: 'sheet-duplicated-in-log', sheetId: 's1', logId: 'logA', materialType: '20GA-GALV', length: 144 }],
            logs,
            new Map([['s1', { exists: true, status: 'Used', usageLogId: 'logA' }]])
        );

        expect(plan.logDeletes).toHaveLength(0);
        expect(plan.logUpdates).toHaveLength(1);
        expect(plan.logUpdates[0].logId).toBe('logA');
        expect(plan.logUpdates[0].details.map(d => d.id)).toEqual(['s1', undefined, 's2']);
        expect(plan.logUpdates[0].qty).toBe(-3);
        expect(plan.logUpdates[0].removed).toBe(1);
    });

    test('a sheet duplicated within the keeper log AND claimed by another log is fully resolved', () => {
        const s1 = sheet('s1');
        const logs = [
            log('logLoser', [s1, sheet('s2')]),
            log('logKeeper', [s1, { ...s1 }], { usedAt: '2026-06-09T10:00:00.000Z' }),
        ];
        const sheetInfo = new Map([['s1', { exists: true, status: 'Used', usageLogId: 'logKeeper' }]]);

        const plan = planCountRepairs(
            [
                dupIssue('s1', ['logLoser', 'logKeeper']),
                { type: 'sheet-duplicated-in-log', sheetId: 's1', logId: 'logKeeper', materialType: '20GA-GALV', length: 144 },
            ],
            logs,
            sheetInfo
        );

        const loserUpdate = plan.logUpdates.find(u => u.logId === 'logLoser');
        const keeperUpdate = plan.logUpdates.find(u => u.logId === 'logKeeper');
        expect(loserUpdate.details.map(d => d.id)).toEqual(['s2']);
        expect(keeperUpdate.details.map(d => d.id)).toEqual(['s1']);
        expect(keeperUpdate.qty).toBe(-1);
    });

    test('a stale claim on a sheet that is genuinely back in stock is removed', () => {
        const s = sheet('s1');
        const logs = [log('logA', [s, sheet('s2')])];
        const sheetInfo = new Map([['s1', { exists: true, status: 'On Hand', usageLogId: null }]]);

        const plan = planCountRepairs(
            [{ type: 'sheet-live-and-used', sheetId: 's1', logId: 'logA' }],
            logs,
            sheetInfo
        );

        expect(plan.logUpdates).toHaveLength(1);
        expect(plan.logUpdates[0].details.map(d => d.id)).toEqual(['s2']);
        expect(plan.logUpdates[0].qty).toBe(-1);
    });

    test('does nothing when the fresh fetch shows the sheet really is used (stale UI)', () => {
        const s = sheet('s1');
        const logs = [log('logA', [s])];
        const sheetInfo = new Map([['s1', { exists: true, status: 'Used', usageLogId: 'logA' }]]);

        const plan = planCountRepairs(
            [{ type: 'sheet-live-and-used', sheetId: 's1', logId: 'logA' }],
            logs,
            sheetInfo
        );

        expect(plan.logUpdates).toHaveLength(0);
    });

    test('pure qty drift is corrected to match the items without touching them', () => {
        const logs = [log('logA', [sheet('s1'), sheet('s2')], { qty: -7 })];
        const plan = planCountRepairs(
            [{ type: 'log-qty-mismatch', logId: 'logA', job: 'JOB-logA', snapshots: 2, stored: 7 }],
            logs,
            new Map()
        );

        expect(plan.logUpdates).toEqual([{ logId: 'logA', qty: -2, removed: 0 }]);
    });

    test('legacy no-id entries are reported as unfixable, never modified', () => {
        const plan = planCountRepairs(
            [{ type: 'details-missing-ids', logId: 'logX', job: 'OLD', count: 3 }],
            [log('logX', [{ materialType: '20GA-GALV', length: 144 }])],
            new Map()
        );

        expect(plan.logUpdates).toHaveLength(0);
        expect(plan.unfixable).toHaveLength(1);
    });

    test('multiple disputed sheets on the same log are removed in one update', () => {
        const s1 = sheet('s1');
        const s2 = sheet('s2');
        const logs = [
            log('logA', [s1, s2, sheet('s3')]),
            log('logB', [s1, s2], { usedAt: '2026-06-09T10:00:00.000Z' }),
        ];
        const sheetInfo = new Map([
            ['s1', { exists: true, status: 'Used', usageLogId: 'logB' }],
            ['s2', { exists: true, status: 'Used', usageLogId: 'logB' }],
        ]);

        const plan = planCountRepairs(
            [dupIssue('s1', ['logA', 'logB']), dupIssue('s2', ['logA', 'logB'])],
            logs,
            sheetInfo
        );

        expect(plan.logUpdates).toHaveLength(1);
        expect(plan.logUpdates[0].logId).toBe('logA');
        expect(plan.logUpdates[0].details.map(d => d.id)).toEqual(['s3']);
        expect(plan.logUpdates[0].qty).toBe(-1);
        expect(plan.logUpdates[0].removed).toBe(2);
    });
});
