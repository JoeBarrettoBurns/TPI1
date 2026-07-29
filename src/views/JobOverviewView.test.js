// src/views/JobOverviewView.test.js
//
// Job economics rollups. A sheet ordered under a PO (`J5851`) but consumed by a
// section of that PO (`J5851_EXT`) is attributed to BOTH job names on purpose —
// each job's own card should show it. The rollups that sum several jobs must not
// inherit that double attribution, or a PO card reports more sheets (and more
// money) than physically exist.

// The view imports the archive hook, which pulls in the Firebase SDK. These pure
// helpers need none of it.
jest.mock('../firebase/config', () => ({ db: {}, appId: 'test', auth: {} }));
jest.mock('../firebase/firestoreWithTracking', () => ({
    collection: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), setDoc: jest.fn(),
    onSnapshot: jest.fn(), writeBatch: jest.fn(), getDocs: jest.fn(), query: jest.fn(),
    where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(), updateDoc: jest.fn(),
    runTransaction: jest.fn(),
}));

import {
    buildJobEconomicsIndex,
    buildJobEconomics,
    aggregateGroupEconomics,
    summarizeCustomerJobs,
} from './JobOverviewView';

const MAT = 'ALUMINUM .063';
const MATERIALS = { [MAT]: { category: 'ALUMINUM', density: 0.098, thickness: 0.063 } };

let nextId = 0;
const makeSheet = (overrides = {}) => ({
    id: `sheet-${++nextId}`,
    materialType: MAT,
    length: 144,
    width: 48,
    status: 'On Hand',
    job: 'J5851',
    supplier: 'RYERSON',
    createdAt: '2026-06-01T15:30:00.000Z',
    costPerPound: 1.5,
    ...overrides,
});

const makeLog = (id, job, details) => ({
    id,
    job,
    customer: 'EI SOLUTIONS',
    status: 'Completed',
    createdAt: '2026-06-03T18:00:00.000Z',
    usedAt: '2026-06-03T18:00:00.000Z',
    details,
    qty: -details.length,
});

beforeEach(() => {
    nextId = 0;
});

describe('job economics rollups', () => {
    // Two sheets bought on PO J5851: one used by the base job, one by its _EXT
    // section. Both jobs are parts of the same PO group.
    const buildScenario = () => {
        const usageLog = [
            makeLog('log-base', 'J5851', [makeSheet({ status: 'Used' })]),
            makeLog('log-ext', 'J5851_EXT', [makeSheet({ status: 'Used' })]),
        ];
        return {
            index: buildJobEconomicsIndex([], usageLog),
            parts: [{ job: 'J5851' }, { job: 'J5851_EXT' }],
        };
    };

    test('a single job still shows sheets attributed to it from another job', () => {
        const { index } = buildScenario();

        // J5851 sees its own use plus the sheet its PO supplied to J5851_EXT.
        expect(buildJobEconomics('J5851', index, MATERIALS).totalSheets).toBe(2);
        expect(buildJobEconomics('J5851_EXT', index, MATERIALS).totalSheets).toBe(1);
    });

    test('the PO rollup counts each physical sheet once', () => {
        const { index, parts } = buildScenario();
        const rollup = aggregateGroupEconomics(parts, index, MATERIALS);

        expect(rollup.totalSheets).toBe(2);
        expect(rollup.groups.filter(g => g.bucket === 'used').map(g => g.qty)).toEqual([2]);
    });

    test('the customer summary counts each physical sheet once', () => {
        const { index, parts } = buildScenario();
        const single = summarizeCustomerJobs([{ job: 'J5851' }], index, MATERIALS);
        const both = summarizeCustomerJobs(parts, index, MATERIALS);

        expect(both.totalSheets).toBe(2);
        // Cost must not be inflated either: two sheets, whichever jobs claim them.
        expect(both.totalCost).toBeCloseTo(single.totalCost, 6);
    });

    test('sheets that are only on one job are unaffected', () => {
        const usageLog = [makeLog('log-a', 'J7000', [makeSheet({ job: 'J7000', status: 'Used' })])];
        const index = buildJobEconomicsIndex([makeSheet({ job: 'J7000' })], usageLog);

        const rollup = aggregateGroupEconomics([{ job: 'J7000' }], index, MATERIALS);
        expect(rollup.totalSheets).toBe(2); // one on hand + one used
    });
});
