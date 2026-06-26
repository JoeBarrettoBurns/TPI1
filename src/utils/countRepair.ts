// src/utils/countRepair.ts
//
// Repairs the count issues reported by auditCounts. The decision logic is pure
// (planCountRepairs) so it can be unit tested; repairCountIssues fetches the
// authoritative sheet documents from Firestore and applies the plan in batches.
//
// Ownership rule for a sheet claimed by two usage logs: the inventory document
// itself records which log consumed it (`usageLogId`) — that log keeps the
// sheet; every other log drops its stale snapshot. If the pointer is missing,
// the most recent log keeps it (the latest action reflects the current state).
// A sheet listed twice on the *same* log keeps only its first copy, and a log
// left with no items at all is deleted outright.

import { collection, doc, getDoc, writeBatch } from '../firebase/firestoreWithTracking';

const parseLogMs = (log: any): number => {
    const t = new Date(log?.usedAt || log?.createdAt || 0).getTime();
    return Number.isFinite(t) ? t : 0;
};

/** Fresh per-sheet truth fetched from Firestore, keyed by sheet id, for repair planning. */
export interface SheetInfo {
    exists: boolean;
    status?: string;
    usageLogId?: string | null;
}

export function planCountRepairs(issues: any[], usageLog: any[], sheetInfoById: Map<string, SheetInfo>) {
    const logsById = new Map((usageLog || []).map((l: any) => [l.id, l]));
    const removeByLog = new Map<string, Set<string>>();
    const pointerFixes: Array<{ sheetId: string; usageLogId: string | null }> = [];
    const unfixable: any[] = [];

    const markRemoval = (logId: string, sheetId: string) => {
        if (!removeByLog.has(logId)) removeByLog.set(logId, new Set<string>());
        removeByLog.get(logId)!.add(sheetId);
    };

    // Sheets claimed by multiple logs → exactly one keeper.
    const claims = new Map<string, Set<string>>();
    issues.filter(i => i.type === 'sheet-in-two-logs').forEach(i => {
        if (!claims.has(i.sheetId)) claims.set(i.sheetId, new Set<string>());
        (i.logIds || []).forEach((id: string) => claims.get(i.sheetId)!.add(id));
    });

    claims.forEach((logIdSet, sheetId) => {
        const logIds = [...logIdSet].filter(id => logsById.has(id));
        if (logIds.length < 2) return;

        const info = sheetInfoById.get(sheetId);
        let keeperId = info?.usageLogId && logIds.includes(info.usageLogId) ? info.usageLogId : null;
        if (!keeperId) {
            keeperId = logIds
                .slice()
                .sort((a, b) => parseLogMs(logsById.get(b)) - parseLogMs(logsById.get(a)))[0];
        }

        logIds.forEach(id => {
            if (id !== keeperId) markRemoval(id, sheetId);
        });

        if (info?.exists && info.status === 'Used' && info.usageLogId !== keeperId) {
            pointerFixes.push({ sheetId, usageLogId: keeperId });
        }
    });

    // Sheets that are live in inventory but still claimed by a log: the live
    // document is the source of truth (it is what the stock counts use), so the
    // stale claim is dropped — unless a fresh fetch says the sheet really is
    // Used, in which case local state was just stale and nothing is changed.
    issues.filter(i => i.type === 'sheet-live-and-used').forEach(i => {
        const info = sheetInfoById.get(i.sheetId);
        if (info?.exists && info.status === 'Used') return;
        if (!logsById.has(i.logId)) return;
        markRemoval(i.logId, i.sheetId);
    });

    // Logs that list the same sheet more than once in their own details: the
    // extra copies are dropped (the first occurrence is kept).
    const dedupeLogs = new Set<string>();
    issues.filter(i => i.type === 'sheet-duplicated-in-log').forEach(i => {
        if (logsById.has(i.logId)) dedupeLogs.add(i.logId);
    });

    const logUpdates: Array<{ logId: string; details?: any[]; qty: number; removed: number }> = [];
    const logDeletes: Array<{ logId: string; removed: number }> = [];
    const touchedLogs = new Set<string>();
    const logsToRewrite = new Set([...removeByLog.keys(), ...dedupeLogs]);
    logsToRewrite.forEach(logId => {
        const log = logsById.get(logId);
        const dropIds = removeByLog.get(logId) || new Set();
        const seenIds = new Set();
        const details = (log.details || []).filter((d: any) => {
            if (!d.id) return true; // legacy snapshots are never touched here
            if (dropIds.has(d.id)) return false;
            if (seenIds.has(d.id)) return false; // extra copy of the same sheet
            seenIds.add(d.id);
            return true;
        });
        const removed = (log.details || []).length - details.length;
        if (removed === 0) return;
        if (details.length === 0) {
            // Every sheet in this log belonged elsewhere — the log is an empty
            // husk and is deleted rather than left around with qty 0.
            logDeletes.push({ logId, removed });
        } else {
            logUpdates.push({ logId, details, qty: -details.length, removed });
        }
        touchedLogs.add(logId);
    });

    // Pure qty drift on logs not already rewritten above.
    issues.filter(i => i.type === 'log-qty-mismatch').forEach(i => {
        if (touchedLogs.has(i.logId)) return;
        const log = logsById.get(i.logId);
        if (!log) return;
        logUpdates.push({ logId: i.logId, qty: -(log.details || []).length || 0, removed: 0 });
        touchedLogs.add(i.logId);
    });

    issues.filter(i => i.type === 'details-missing-ids').forEach(i => unfixable.push(i));

    return { logUpdates, logDeletes, pointerFixes, unfixable };
}

const MAX_BATCH_OPS = 400;

/** Fetches sheet truth from Firestore, plans, and applies the repairs. */
export async function repairCountIssues(db: any, appId: string, issues: any[], usageLog: any[], actorLabel?: string) {
    const inventoryPath = `artifacts/${appId}/public/data/inventory`;
    const usageLogPath = `artifacts/${appId}/public/data/usage_logs`;

    const sheetIds = [...new Set(issues.map(i => i.sheetId).filter(Boolean))];
    const sheetInfoById = new Map<string, SheetInfo>();
    for (let i = 0; i < sheetIds.length; i += 25) {
        const chunk = sheetIds.slice(i, i + 25);
        const snaps = await Promise.all(chunk.map(id => getDoc(doc(db, inventoryPath, id))));
        snaps.forEach((snap, index) => {
            sheetInfoById.set(chunk[index], snap.exists()
                ? { exists: true, status: snap.data().status, usageLogId: snap.data().usageLogId || null }
                : { exists: false });
        });
    }

    const plan = planCountRepairs(issues, usageLog, sheetInfoById);
    const logsById = new Map((usageLog || []).map((l: any) => [l.id, l]));

    // Every sheet whose claim is being dropped — the repair corrects the count
    // downward, so these are recorded as a single COUNT REPAIR removal in the
    // Outgoing Stock Log (see below).
    const removedSheets: Array<{ materialType: any; length: any }> = [];
    plan.logUpdates.forEach(update => {
        const original: any[] = logsById.get(update.logId)?.details || [];
        const keptIds = new Set((update.details || []).map((d: any) => d.id).filter(Boolean));
        original.forEach((d: any) => {
            if (d.id && !keptIds.has(d.id)) removedSheets.push({ materialType: d.materialType, length: d.length });
        });
    });
    plan.logDeletes.forEach(del => {
        const original: any[] = logsById.get(del.logId)?.details || [];
        original.forEach((d: any) => {
            if (d.id) removedSheets.push({ materialType: d.materialType, length: d.length });
        });
    });

    const nowIso = new Date().toISOString();
    const ops: Array<(batch: any) => void> = [];
    plan.logUpdates.forEach(update => ops.push(batch => {
        const payload: any = {
            qty: update.qty,
            lastEditedBy: actorLabel || 'Count Repair',
            lastEditedAt: nowIso,
        };
        if (update.details) payload.details = update.details;
        batch.update(doc(db, usageLogPath, update.logId), payload);
    }));
    plan.logDeletes.forEach(del => ops.push(batch => {
        batch.delete(doc(db, usageLogPath, del.logId));
    }));
    plan.pointerFixes.forEach(fix => ops.push(batch => {
        batch.update(doc(db, inventoryPath, fix.sheetId), { usageLogId: fix.usageLogId });
    }));

    // Record the correction as a COUNT REPAIR entry in the Outgoing Stock Log so
    // there is a visible trail of what the repair removed. Sheet ids are
    // intentionally omitted from the snapshots: the entry is informational only,
    // and keeping ids would make the audit re-flag these sheets as a fresh claim.
    if (removedSheets.length > 0) {
        ops.push(batch => {
            batch.set(doc(collection(db, usageLogPath)), {
                job: 'COUNT REPAIR',
                customer: 'Count Repair',
                usedAt: nowIso,
                createdAt: nowIso,
                status: 'Completed',
                details: removedSheets.map(s => ({ materialType: s.materialType, length: s.length })),
                qty: -removedSheets.length,
                createdBy: actorLabel || 'Count Repair',
            });
        });
    }

    for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
        const batch = writeBatch(db);
        ops.slice(i, i + MAX_BATCH_OPS).forEach(addOp => addOp(batch));
        await batch.commit();
    }

    return {
        updatedLogs: plan.logUpdates.length,
        deletedLogs: plan.logDeletes.length,
        removedDuplicates:
            plan.logUpdates.reduce((sum, u) => sum + (u.removed || 0), 0) +
            plan.logDeletes.reduce((sum, d) => sum + (d.removed || 0), 0),
        pointerFixes: plan.pointerFixes.length,
        unfixable: plan.unfixable.length,
    };
}
