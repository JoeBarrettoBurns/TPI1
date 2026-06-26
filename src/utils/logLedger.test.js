// src/utils/logLedger.test.js
//
// Verifies the append-only ledger resolver: base logs are never mutated, and a
// base folded with its amendments yields the effective log the rest of the app
// consumes. Legacy logs (no amendments) must pass through unchanged.

import {
  resolveUsageLogs,
  applyAmendments,
  buildFulfillmentAmendment,
  buildEditAmendment,
  buildVoidAmendment,
  baseLogFields,
  LEDGER_VERSION,
} from './logLedger';

const sheet = (id, length = 144) => ({
  id,
  materialType: 'GALV 144',
  length,
  width: 48,
  status: 'Used',
  job: 'STOCK',
});

describe('logLedger resolver', () => {
  test('legacy log with no amendments passes through unchanged', () => {
    const legacy = {
      id: 'L1',
      status: 'Completed',
      job: 'J100',
      qty: -2,
      details: [sheet('s1'), sheet('s2')],
      createdAt: '2026-06-01T00:00:00.000Z',
      usedAt: '2026-06-01T00:00:00.000Z',
    };
    const [eff] = resolveUsageLogs([legacy], []);
    expect(eff.isAmended).toBe(false);
    expect(eff.isVoided).toBe(false);
    expect(eff.status).toBe('Completed');
    expect(eff.qty).toBe(-2);
    expect(eff.details).toHaveLength(2);
  });

  test('scheduled base is never mutated; fulfillment amendment produces the effective completed log', () => {
    const base = {
      id: 'L2',
      ...baseLogFields(),
      status: 'Scheduled',
      job: 'J200',
      customer: 'ACME',
      qty: -3,
      details: [{ materialType: 'GALV 144', length: 144 }, { materialType: 'GALV 144', length: 144 }, { materialType: 'GALV 144', length: 144 }],
      createdAt: '2026-06-01T00:00:00.000Z',
      usedAt: '2026-06-10T23:59:59.000Z',
    };
    const am = buildFulfillmentAmendment({
      baseLogId: 'L2',
      by: 'Auto (sys@x.com)',
      details: [sheet('s1'), sheet('s2'), sheet('s3')],
    });
    const [eff] = resolveUsageLogs([base], [am]);

    // Base object itself is untouched.
    expect(base.status).toBe('Scheduled');
    expect(base.details.every((d) => !d.id)).toBe(true);

    // Effective log reflects the fulfillment.
    expect(eff.status).toBe('Completed');
    expect(eff.qty).toBe(-3);
    expect(eff.details.map((d) => d.id)).toEqual(['s1', 's2', 's3']);
    expect(eff.fulfilledAt).toBeTruthy();
    expect(eff.lastEditedBy).toBe('Auto (sys@x.com)');
    expect(eff.isAmended).toBe(true);
    expect(eff.amendments).toHaveLength(1);
  });

  test('edit amendment overrides job/customer/details and recomputes qty', () => {
    const base = {
      id: 'L3',
      ...baseLogFields(),
      status: 'Completed',
      job: 'WRONG',
      customer: 'OLD',
      qty: -4,
      details: [sheet('a'), sheet('b'), sheet('c'), sheet('d')],
      createdAt: '2026-06-01T00:00:00.000Z',
      usedAt: '2026-06-01T00:00:00.000Z',
    };
    const am = buildEditAmendment({
      baseLogId: 'L3',
      by: 'user@x.com',
      job: 'RIGHT',
      customer: 'NEW',
      details: [sheet('a'), sheet('b')],
      reason: 'over-counted',
    });
    const [eff] = resolveUsageLogs([base], [am]);

    expect(base.job).toBe('WRONG'); // original untouched
    expect(eff.job).toBe('RIGHT');
    expect(eff.customer).toBe('NEW');
    expect(eff.qty).toBe(-2);
    expect(eff.details).toHaveLength(2);
    expect(eff.amendments[0].reason).toBe('over-counted');
  });

  test('void amendment retires a log without deleting it', () => {
    const base = {
      id: 'L4',
      ...baseLogFields(),
      status: 'Completed',
      qty: -1,
      details: [sheet('z')],
      createdAt: '2026-06-01T00:00:00.000Z',
      usedAt: '2026-06-01T00:00:00.000Z',
    };
    const [eff] = resolveUsageLogs([base], [buildVoidAmendment({ baseLogId: 'L4', by: 'user@x.com' })]);
    expect(eff.isVoided).toBe(true);
    expect(eff.status).toBe('Voided');
    // A 'Voided' status is excluded by the app's `=== 'Completed'` count filters.
    expect((eff.status || 'Completed') === 'Completed').toBe(false);
  });

  test('amendments apply in chronological order regardless of input order', () => {
    const base = {
      id: 'L5',
      ...baseLogFields(),
      status: 'Completed',
      qty: -3,
      details: [sheet('a'), sheet('b'), sheet('c')],
      createdAt: '2026-06-01T00:00:00.000Z',
      usedAt: '2026-06-01T00:00:00.000Z',
    };
    const later = buildEditAmendment({ baseLogId: 'L5', by: 'u', details: [sheet('a')] });
    later.at = '2026-06-05T00:00:00.000Z';
    const earlier = buildEditAmendment({ baseLogId: 'L5', by: 'u', details: [sheet('a'), sheet('b')] });
    earlier.at = '2026-06-03T00:00:00.000Z';

    // Pass out of order; resolver must apply earlier then later → final qty -1.
    const eff = applyAmendments(base, [later, earlier]);
    expect(eff.qty).toBe(-1);
    expect(eff.details).toHaveLength(1);
    expect(eff.amendments.map((a) => a.at)).toEqual([
      '2026-06-03T00:00:00.000Z',
      '2026-06-05T00:00:00.000Z',
    ]);
  });

  test('baseLogFields stamps the ledger version', () => {
    expect(baseLogFields()).toEqual({ ledgerVersion: LEDGER_VERSION });
  });
});
