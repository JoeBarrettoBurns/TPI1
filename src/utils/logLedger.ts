// src/utils/logLedger.ts
//
// Append-only log ledger.
//
// A usage log written under this model (`ledgerVersion >= 2`) is IMMUTABLE: its
// base document at `usage_logs/{id}` is written once and never updated or
// deleted. Every later change — an edit, a fulfillment (manual or auto), or a
// void/delete — is appended as its own amendment record, stored flat at
// `usage_log_amendments/{amId}` with a `baseLogId` pointer back to the log.
//
// `resolveUsageLogs(baseLogs, amendments)` folds each base log together with its
// amendments (in chronological order) into a single EFFECTIVE log that has the
// same shape the rest of the app already consumes (dashboard timeline,
// groupInventoryByJob, calculateMaterialTransactions, countAudit). Legacy logs
// that have no amendments pass through unchanged, so existing data behaves
// exactly as before.
//
// Why this exists: previously a log's stored quantities could be rewritten in
// place from six different code paths (two automatic), so a wrong count could
// not be traced. Here the original is provable forever and every change is a
// visible sub-record.

import type { UsageLog } from '../types';

/** Marks a base log as belonging to the immutable ledger. Bump if the fold rules change. */
export const LEDGER_VERSION = 2;

export const AMENDMENTS_COLLECTION = 'usage_log_amendments';

export type LogAmendmentType = 'edit' | 'fulfillment' | 'void';

/**
 * One immutable change appended to a base log. Only the fields relevant to its
 * `type` are set; the resolver overlays them onto the running effective value.
 */
export interface LogAmendment {
  /** Firestore doc id of the amendment itself. */
  id?: string;
  /** Doc id of the base `usage_logs` entry this amends. */
  baseLogId: string;
  type: LogAmendmentType;
  /** ISO timestamp the amendment was appended — also its chronological sort key. */
  at: string;
  /** Who appended it. `Auto (...)` for system-driven fulfillment. */
  by: string;
  /** Optional human reason (shown in the amendment trail). */
  reason?: string;

  // ── 'edit' / 'fulfillment' payload (set only what changes) ──
  job?: string;
  customer?: string;
  /** Replacement sheet snapshots (fulfillment: the sheets actually consumed). */
  details?: any[];
  /** Replacement signed qty (negative = consumed). */
  qty?: number;
  /** Replacement use date. */
  usedAt?: string;
  /** Fulfillment stamp. */
  fulfilledAt?: string;
}

/** A base log folded together with its amendment history. */
export interface EffectiveLog extends Omit<UsageLog, 'status'> {
  status: UsageLog['status'] | 'Voided';
  /** True once at least one amendment has been applied. */
  isAmended: boolean;
  /** True if a `void` amendment retired this log (excluded from all counts). */
  isVoided: boolean;
  /** Full chronological amendment trail for display. */
  amendments: LogAmendment[];
  ledgerVersion?: number;
}

const byChrono = (a: LogAmendment, b: LogAmendment) => String(a.at).localeCompare(String(b.at));

/**
 * Fold one base log with its amendments into a single effective log. Amendments
 * are applied oldest-first; each overlays only the fields it carries. A base
 * with no amendments is returned essentially unchanged (legacy passthrough).
 */
export function applyAmendments(base: any, amendments: LogAmendment[] = []): EffectiveLog {
  const ordered = [...amendments].sort(byChrono);

  const effective: any = {
    ...base,
    isAmended: ordered.length > 0,
    isVoided: false,
    amendments: ordered,
  };

  for (const am of ordered) {
    switch (am.type) {
      case 'void':
        effective.isVoided = true;
        effective.status = 'Voided';
        break;
      case 'fulfillment':
        effective.status = 'Completed';
        if (am.details !== undefined) effective.details = am.details;
        if (am.qty !== undefined) effective.qty = am.qty;
        effective.fulfilledAt = am.fulfilledAt ?? am.at;
        if (am.job !== undefined) effective.job = am.job;
        if (am.customer !== undefined) effective.customer = am.customer;
        effective.lastEditedBy = am.by;
        effective.lastEditedAt = am.at;
        break;
      case 'edit':
        if (am.job !== undefined) effective.job = am.job;
        if (am.customer !== undefined) effective.customer = am.customer;
        if (am.details !== undefined) effective.details = am.details;
        if (am.qty !== undefined) effective.qty = am.qty;
        if (am.usedAt !== undefined) effective.usedAt = am.usedAt;
        effective.lastEditedBy = am.by;
        effective.lastEditedAt = am.at;
        break;
      default:
        break;
    }
  }

  return effective as EffectiveLog;
}

/**
 * Resolve a full set of base logs against a flat list of amendments. Returns the
 * effective logs the rest of the app consumes. Amendments whose `baseLogId` has
 * no matching base log are ignored (the base may not have streamed in yet).
 */
export function resolveUsageLogs(baseLogs: any[] = [], amendments: LogAmendment[] = []): EffectiveLog[] {
  const byLog = new Map<string, LogAmendment[]>();
  for (const am of amendments) {
    if (!am?.baseLogId) continue;
    if (!byLog.has(am.baseLogId)) byLog.set(am.baseLogId, []);
    byLog.get(am.baseLogId)!.push(am);
  }
  return baseLogs.map((base) => applyAmendments(base, byLog.get(base.id) || []));
}

// ── Builders: every write path constructs amendments through these so the shape
//    stays consistent and the base log is never touched. ──

/** Fields stamped on a brand-new immutable base log. Spread into the create payload. */
export function baseLogFields() {
  return { ledgerVersion: LEDGER_VERSION };
}

export function buildFulfillmentAmendment(params: {
  baseLogId: string;
  by: string;
  details: any[];
  fulfilledAt?: string;
  job?: string;
  customer?: string;
  reason?: string;
}): LogAmendment {
  const at = new Date().toISOString();
  return {
    baseLogId: params.baseLogId,
    type: 'fulfillment',
    at,
    by: params.by,
    details: params.details,
    qty: -params.details.length,
    fulfilledAt: params.fulfilledAt ?? at,
    ...(params.job !== undefined ? { job: params.job } : {}),
    ...(params.customer !== undefined ? { customer: params.customer } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
  };
}

export function buildEditAmendment(params: {
  baseLogId: string;
  by: string;
  job?: string;
  customer?: string;
  details?: any[];
  usedAt?: string;
  reason?: string;
}): LogAmendment {
  return {
    baseLogId: params.baseLogId,
    type: 'edit',
    at: new Date().toISOString(),
    by: params.by,
    ...(params.job !== undefined ? { job: params.job } : {}),
    ...(params.customer !== undefined ? { customer: params.customer } : {}),
    ...(params.details !== undefined ? { details: params.details, qty: -params.details.length } : {}),
    ...(params.usedAt !== undefined ? { usedAt: params.usedAt } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
  };
}

export function buildVoidAmendment(params: { baseLogId: string; by: string; reason?: string }): LogAmendment {
  return {
    baseLogId: params.baseLogId,
    type: 'void',
    at: new Date().toISOString(),
    by: params.by,
    ...(params.reason ? { reason: params.reason } : {}),
  };
}
