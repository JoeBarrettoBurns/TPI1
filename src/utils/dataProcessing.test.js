// src/utils/dataProcessing.test.js
//
// Count-correctness tests for the Logs view data pipeline.
// The inventory subscription only loads On Hand/Ordered docs, so used sheets
// must be merged back from completed usage-log snapshots for log counts to
// stay equal to what was originally entered.

import { groupInventoryByJob, calculateMaterialTransactions } from './dataProcessing';
import { summarizeDetails } from '../components/logs/LogItemSummary';

const ORDER_CREATED_AT = '2026-06-01T15:30:00.000Z';

let nextId = 0;
const makeSheet = (overrides = {}) => ({
    id: `sheet-${++nextId}`,
    materialType: '2x2x14GA GALV',
    length: 120,
    width: 48,
    status: 'On Hand',
    job: 'J100',
    supplier: 'RYERSON',
    createdAt: ORDER_CREATED_AT,
    costPerPound: 1.5,
    ...overrides,
});

const makeSheets = (count, overrides = {}) => Array.from({ length: count }, () => makeSheet(overrides));

// Snapshot of a sheet as handleUseStock stores it on a completed usage log:
// the full sheet object at the moment of use (still status 'On Hand').
const makeCompletedLog = (id, usedSheets, overrides = {}) => ({
    id,
    job: 'J200',
    customer: 'ACME FABRICATION',
    status: 'Completed',
    createdAt: '2026-06-03T18:00:00.000Z',
    usedAt: '2026-06-03T18:00:00.000Z',
    details: usedSheets,
    qty: -usedSheets.length,
    ...overrides,
});

beforeEach(() => {
    nextId = 0;
});

describe('groupInventoryByJob (Incoming Stock Log counts)', () => {
    test('an untouched order shows exactly the typed quantity in one group', () => {
        const inventory = makeSheets(10);
        const groups = groupInventoryByJob(inventory, []);

        expect(groups).toHaveLength(1);
        expect(groups[0].job).toBe('J100');
        expect(groups[0].displayDetails).toHaveLength(10);
        expect(groups[0].details).toHaveLength(10);
    });

    test('quantities do not shrink after sheets are used by a job', () => {
        const allSheets = makeSheets(10);
        const usedSheets = allSheets.slice(0, 4);
        const liveSheets = allSheets.slice(4);

        const groups = groupInventoryByJob(liveSheets, [makeCompletedLog('log-1', usedSheets)]);

        expect(groups).toHaveLength(1);
        const group = groups[0];
        expect(group.job).toBe('J100');
        // Display count keeps the original 10; only the 6 live sheets stay deletable/editable.
        expect(group.displayDetails).toHaveLength(10);
        expect(group.details).toHaveLength(6);
    });

    test('used sheets merge back into the SAME group, not a separate row', () => {
        const allSheets = makeSheets(8);
        const usedSheets = allSheets.slice(0, 3);
        const liveSheets = allSheets.slice(3);

        const groups = groupInventoryByJob(liveSheets, [makeCompletedLog('log-1', usedSheets)]);

        // One row for the order, and one summary slot for the single material+length.
        expect(groups).toHaveLength(1);
        const summary = summarizeDetails(groups[0].displayDetails);
        expect(summary).toHaveLength(1);
        expect(summary[0]).toMatchObject({ materialType: '2x2x14GA GALV', length: '120"', quantity: 8 });
    });

    test('the consuming job does not appear as an incoming group', () => {
        const allSheets = makeSheets(5);
        const groups = groupInventoryByJob(allSheets.slice(2), [makeCompletedLog('log-1', allSheets.slice(0, 2))]);

        expect(groups.map(g => g.job)).toEqual(['J100']);
    });

    test('a fully used order still shows with its original count as history-only', () => {
        const usedSheets = makeSheets(10);
        const groups = groupInventoryByJob([], [makeCompletedLog('log-1', usedSheets)]);

        expect(groups).toHaveLength(1);
        const group = groups[0];
        expect(group.displayDetails).toHaveLength(10);
        expect(group.details).toHaveLength(0);
        expect(group.isHistoryOnly).toBe(true);
    });

    test('a sheet never counts twice even if it is both live and snapshotted', () => {
        const sheet = makeSheet();
        const groups = groupInventoryByJob(
            [sheet],
            [makeCompletedLog('log-1', [sheet]), makeCompletedLog('log-2', [sheet])]
        );

        expect(groups).toHaveLength(1);
        expect(groups[0].displayDetails).toHaveLength(1);
    });

    test('usage split across multiple logs still adds up to the typed total', () => {
        const allSheets = makeSheets(10);
        const groups = groupInventoryByJob(
            allSheets.slice(7),
            [
                makeCompletedLog('log-1', allSheets.slice(0, 4)),
                makeCompletedLog('log-2', allSheets.slice(4, 7), { job: 'J300' }),
            ]
        );

        expect(groups).toHaveLength(1);
        expect(groups[0].displayDetails).toHaveLength(10);
    });

    test('mixed lengths keep their own slots with the exact typed quantities', () => {
        const sheets120 = makeSheets(6, { length: 120 });
        const sheets96 = makeSheets(4, { length: 96 });
        const used = [...sheets120.slice(0, 2), ...sheets96.slice(0, 1)];
        const live = [...sheets120.slice(2), ...sheets96.slice(1)];

        const groups = groupInventoryByJob(live, [makeCompletedLog('log-1', used)]);

        expect(groups).toHaveLength(1);
        const summary = summarizeDetails(groups[0].displayDetails);
        expect(summary).toEqual([
            expect.objectContaining({ length: '120"', quantity: 6 }),
            expect.objectContaining({ length: '96"', quantity: 4 }),
        ]);
    });

    test('scheduled logs (no concrete sheets yet) do not inflate incoming counts', () => {
        const inventory = makeSheets(5);
        const scheduledLog = {
            id: 'log-sched',
            job: 'J400',
            customer: 'ACME',
            status: 'Scheduled',
            createdAt: '2026-06-05T10:00:00.000Z',
            usedAt: '2026-06-20T23:59:59.000Z',
            // Scheduled details carry no sheet ids.
            details: [{ materialType: '2x2x14GA GALV', length: 120, width: 48 }],
            qty: -1,
        };

        const groups = groupInventoryByJob(inventory, [scheduledLog]);
        expect(groups).toHaveLength(1);
        expect(groups[0].displayDetails).toHaveLength(5);
    });

    test('archived logs are ignored', () => {
        const usedSheets = makeSheets(3);
        const groups = groupInventoryByJob([], [makeCompletedLog('log-1', usedSheets, { status: 'Archived' })]);
        expect(groups).toHaveLength(0);
    });

    test('manual-edit removals still merge back and record their source log', () => {
        const allSheets = makeSheets(5);
        const removed = allSheets.slice(0, 2);
        const removeLog = makeCompletedLog('log-edit', removed, {
            job: 'MODIFICATION: REMOVE',
            customer: 'Manual Edit',
        });

        const groups = groupInventoryByJob(allSheets.slice(2), [removeLog]);

        expect(groups).toHaveLength(1);
        expect(groups[0].displayDetails).toHaveLength(5);
        expect(groups[0].sourceLogIds).toContain('log-edit');
    });

    test('snapshots of returned manual-edit sheets stay hidden', () => {
        const returnedSheet = makeSheet({ job: 'MODIFICATION: ADD', returnedByLogEdit: true, supplier: 'Manual Edit' });
        const groups = groupInventoryByJob([], [makeCompletedLog('log-1', [returnedSheet])]);
        expect(groups).toHaveLength(0);
    });
});

describe('groupInventoryByJob (audit tags)', () => {
    test('groups expose who created the order', () => {
        const inventory = makeSheets(3, { createdBy: 'sahjin.ribeiro@gmail.com' });
        const groups = groupInventoryByJob(inventory, []);

        expect(groups).toHaveLength(1);
        expect(groups[0].createdBy).toBe('sahjin.ribeiro@gmail.com');
    });

    test('groups expose the most recent editor', () => {
        const inventory = [
            makeSheet({ createdBy: 'joe.barrettoburns@gmail.com', lastEditedBy: 'joe.barrettoburns@gmail.com', lastEditedAt: '2026-06-05T10:00:00.000Z' }),
            makeSheet({ createdBy: 'joe.barrettoburns@gmail.com', lastEditedBy: 'sahjin.ribeiro@gmail.com', lastEditedAt: '2026-06-08T10:00:00.000Z' }),
        ];
        const groups = groupInventoryByJob(inventory, []);

        expect(groups).toHaveLength(1);
        expect(groups[0].createdBy).toBe('joe.barrettoburns@gmail.com');
        expect(groups[0].lastEditedBy).toBe('sahjin.ribeiro@gmail.com');
        expect(groups[0].lastEditedAt).toBe('2026-06-08T10:00:00.000Z');
    });

    test('legacy entries without audit fields stay untagged instead of guessing', () => {
        const groups = groupInventoryByJob(makeSheets(2), []);

        expect(groups[0].createdBy).toBeNull();
        expect(groups[0].lastEditedBy).toBeNull();
    });

    test('merged-back used snapshots can still attribute the original creator', () => {
        const allSheets = makeSheets(4, { createdBy: 'sahjin.ribeiro@gmail.com' });
        const groups = groupInventoryByJob([], [makeCompletedLog('log-1', allSheets)]);

        expect(groups).toHaveLength(1);
        expect(groups[0].createdBy).toBe('sahjin.ribeiro@gmail.com');
    });
});

describe('summarizeDetails (per-row material summary slots)', () => {
    test('identical material and length collapse into a single slot', () => {
        const details = makeSheets(7);
        const summary = summarizeDetails(details);

        expect(summary).toHaveLength(1);
        expect(summary[0].quantity).toBe(7);
    });

    test('numeric and string lengths of the same size share one slot', () => {
        const summary = summarizeDetails([
            makeSheet({ length: 120 }),
            makeSheet({ length: '120' }),
        ]);

        expect(summary).toHaveLength(1);
        expect(summary[0]).toMatchObject({ length: '120"', quantity: 2 });
    });

    test('different lengths and materials get their own slots with exact counts', () => {
        const summary = summarizeDetails([
            ...makeSheets(3, { length: 96 }),
            ...makeSheets(5, { length: 120 }),
            ...makeSheets(2, { materialType: '1x1x16GA', length: 120 }),
        ]);

        const byKey = Object.fromEntries(summary.map(s => [`${s.materialType}|${s.length}`, s.quantity]));
        expect(byKey).toEqual({
            '2x2x14GA GALV|96"': 3,
            '2x2x14GA GALV|120"': 5,
            '1x1x16GA|120"': 2,
        });
    });
});

describe('calculateMaterialTransactions (Material timeline counts)', () => {
    test('addition rows keep original counts after partial use, and usage rows subtract exactly', () => {
        const allSheets = makeSheets(10);
        const usedSheets = allSheets.slice(0, 4);
        const liveSheets = allSheets.slice(4);
        const log = makeCompletedLog('log-1', usedSheets);

        const transactions = calculateMaterialTransactions(['2x2x14GA GALV'], liveSheets, [log])['2x2x14GA GALV'];

        const addition = transactions.find(t => t.isAddition);
        const usage = transactions.find(t => !t.isAddition);

        expect(addition[120]).toBe(10);
        expect(usage[120]).toBe(-4);
    });
});
