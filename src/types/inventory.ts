// src/types/inventory.ts
//
// The core domain model: a physical SHEET. Every sheet of material is one
// document in the Firestore `inventory` collection. Inventory counts are just
// "how many sheet documents are at each status", grouped by materialType and
// length. The status field drives the whole lifecycle: Ordered -> On Hand -> Used.

/** A sheet's lifecycle stage. The single most important union in the app. */
export type SheetStatus = 'Ordered' | 'On Hand' | 'Used';

/**
 * One physical sheet of material (an `inventory` doc).
 *
 * Many fields are only meaningful at certain statuses — the JSDoc notes which.
 * They are typed optional rather than via a discriminated union so existing JS
 * call sites keep compiling during the migration; tighten to a union later.
 */
export interface Sheet {
  /** Firestore doc id. */
  id: string;

  // --- identity / dimensions (always present) ---
  materialType: string;
  /** Length in inches — 96/120/144 for standard, arbitrary for custom. */
  length: number;
  /** Width in inches. 48 for standard sheets. */
  width: number;
  /** Gauge parsed from the material name, or null if none. */
  gauge: number | null;
  density: number;
  thickness: number;

  // --- sourcing / cost ---
  supplier: string;
  costPerPound: number;
  /** ISO timestamp the sheet was created/ordered. */
  createdAt: string;
  /** Job this sheet was ordered/added for. */
  job: string;

  // --- lifecycle ---
  status: SheetStatus;

  /** Only while `Ordered`: when the order is expected (YYYY-MM-DD or null). */
  arrivalDate?: string | null;
  /** Set when the sheet is received (local YYYY-MM-DD). */
  dateReceived?: string;

  // --- only meaningful once `Used` ---
  /** The usage log that consumed this sheet. */
  usageLogId?: string | null;
  jobNameUsed?: string | null;
  customerUsed?: string | null;
  /** ISO timestamp the sheet was consumed. */
  usedAt?: string;

  // --- misc / audit ---
  workflowStatus?: string;
  lastEditedBy?: string;
  lastEditedAt?: string;
}

/**
 * A sheet currently held in React state. The app only subscribes to On Hand and
 * Ordered docs (see the inventory listeners in useFirestoreData), so a `Used`
 * sheet can never appear in live `inventory` — this narrowed type encodes that.
 */
export interface LiveSheet extends Sheet {
  status: 'On Hand' | 'Ordered';
}

/**
 * A frozen snapshot of a sheet at the moment it was consumed, stored inside a
 * usage log's `details[]`. Because `Used` sheets are NOT loaded into state,
 * these snapshots are the ONLY record of historical consumption — any history
 * or per-job count must merge them back in (deduped by id) as display-only rows.
 */
export interface UsedSheetSnapshot extends Sheet {
  status: 'Used';
}
