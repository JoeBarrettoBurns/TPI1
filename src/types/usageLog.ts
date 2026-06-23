// src/types/usageLog.ts
//
// A usage log records stock leaving inventory for a job. It is also the home of
// the per-sheet snapshots (`details`) that history views rely on, since the
// consumed sheets themselves are never loaded into live state.

import type { UsedSheetSnapshot } from './inventory';

/**
 * `Scheduled` — a future use that auto-fulfills when its `usedAt` date is reached.
 * `Completed` — stock has actually been consumed; `details` holds the sheets.
 */
export type UsageLogStatus = 'Scheduled' | 'Completed';

export interface UsageLog {
  /** Firestore doc id. */
  id: string;
  status: UsageLogStatus;
  /** ISO timestamp the log was created. */
  createdAt: string;
  /**
   * ISO timestamp the stock is/was used. For a Scheduled log this is the future
   * fire date; auto-fulfill consumes the log once now >= usedAt.
   */
  usedAt: string;
  job?: string;
  customer?: string;
  /** Negative count of sheets consumed (e.g. -4). 0 while still Scheduled. */
  qty: number;
  /**
   * Frozen snapshots of every sheet this log consumed. THE source of truth for
   * historical counts — merge these back (deduped by sheet id) wherever you need
   * to show what a job used, since `Used` sheets are absent from live inventory.
   */
  details: UsedSheetSnapshot[];
  /** ISO timestamp a Scheduled log was actually fulfilled. */
  fulfilledAt?: string;
  lastEditedBy?: string;
  lastEditedAt?: string;
}
