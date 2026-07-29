// src/utils/stockClaim.ts
//
// The single way stock is consumed. Every path that turns an `On Hand` sheet
// into a `Used` one goes through `reserveOnHandSheets` inside a Firestore
// transaction, so two clients (or two tabs, or a click racing the auto-fulfil
// timer) can never claim the same physical sheet.
//
// Sheets are pre-selected FIFO from the in-memory snapshot, which may be stale.
// The transaction re-reads each candidate and only claims the ones that are
// STILL `On Hand`, which is why callers pass a few more candidate ids than they
// need — the extra ones let a small race heal itself instead of failing.

import { doc } from '../firebase/firestoreWithTracking';

/** Thrown when stock changed between the in-memory snapshot and the transactional write. */
export class StockConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StockConflictError';
    }
}

/** How many extra FIFO candidates to offer the transaction beyond the needed qty. */
export const CLAIM_CANDIDATE_BUFFER = 5;

export interface SheetRequirement {
    materialType: string;
    length: number;
    qty: number;
    /** FIFO-ordered candidate sheet ids, ideally `qty + CLAIM_CANDIDATE_BUFFER` of them. */
    candidateIds: string[];
    /**
     * The first `qty` candidates — the ones actually added to the caller's
     * `alreadyAllocatedIds` set. Callers holding a long-lived reservation set
     * release exactly these, so they never free a sheet another in-flight
     * operation reserved out of the same buffer.
     */
    reservedIds: string[];
}

/**
 * Pick FIFO candidates for one requirement out of an in-memory inventory array.
 *
 * `alreadyAllocatedIds` keeps several requirements in the same submission from
 * choosing the same sheet. Throws when the snapshot cannot even offer `qty`, so
 * the caller fails before opening a transaction.
 */
export function planSheetRequirement(
    inventory: any[],
    { materialType, length, qty }: { materialType: string; length: number; qty: number },
    alreadyAllocatedIds: Set<string> = new Set()
): SheetRequirement {
    const matching = (inventory || [])
        .filter((i: any) =>
            i.materialType === materialType &&
            i.length === length &&
            i.status === 'On Hand' &&
            !alreadyAllocatedIds.has(i.id)
        )
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (matching.length < qty) {
        throw new StockConflictError(
            `Not enough stock for ${qty}x ${materialType} @ ${length}". Only ${matching.length} available.`
        );
    }

    const reservedIds = matching.slice(0, qty).map((s: any) => s.id);
    reservedIds.forEach((id: string) => alreadyAllocatedIds.add(id));

    return {
        materialType,
        length,
        qty,
        candidateIds: matching.slice(0, qty + CLAIM_CANDIDATE_BUFFER).map((s: any) => s.id),
        reservedIds,
    };
}

/** Group `{materialType, length}` snapshots into per-key counts, e.g. a log's details. */
export function countRequirementsByKey(details: any[] = []): Array<{ materialType: string; length: number; qty: number }> {
    const counts: Record<string, number> = {};
    details.forEach((d: any) => {
        if (!d?.materialType) return;
        const key = `${d.materialType}|${d.length}`;
        counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([key, qty]) => {
        const [materialType, lengthStr] = key.split('|');
        return { materialType, length: parseInt(lengthStr, 10), qty };
    });
}

/**
 * Atomically reserve On Hand sheets inside a Firestore transaction.
 *
 * Returns, per requirement, the first `qty` candidates that are still `On Hand`
 * and not already chosen in this transaction. It only READS, so it must be
 * called before any `tx` writes (Firestore requires all reads before writes).
 *
 * Throws {@link StockConflictError} when a requirement can no longer be
 * satisfied, which aborts the whole transaction — no partial consumption.
 */
export async function reserveOnHandSheets(
    tx: any,
    inventoryCollectionRef: any,
    requirements: SheetRequirement[]
): Promise<any[][]> {
    const uniqueIds = Array.from(new Set(requirements.flatMap((r) => r.candidateIds)));
    const snaps = await Promise.all(uniqueIds.map((id) => tx.get(doc(inventoryCollectionRef, id))));
    const dataById = new Map<string, any>();
    snaps.forEach((snap: any, i: number) => {
        dataById.set(uniqueIds[i], snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });

    const claimedInTxn = new Set<string>();
    const picksPerRequirement: any[][] = [];
    for (const req of requirements) {
        const picked: any[] = [];
        for (const id of req.candidateIds) {
            if (picked.length === req.qty) break;
            if (claimedInTxn.has(id)) continue;
            const data = dataById.get(id);
            if (data && data.status === 'On Hand') {
                claimedInTxn.add(id);
                picked.push(data);
            }
        }
        if (picked.length < req.qty) {
            throw new StockConflictError(
                `Stock for ${req.materialType} @ ${req.length}" changed before it could be saved (needed ${req.qty}, only ${picked.length} still available). Please refresh and try again.`
            );
        }
        picksPerRequirement.push(picked);
    }
    return picksPerRequirement;
}
