// src/utils/countAudit.js
//
// Live count verification. Re-counts every sheet through an independent path
// (no grouping, no date keys) and cross-checks it against what the Logs view
// displays, plus internal invariants of the raw Firestore data. Any deviation
// is reported with the offending document ids — nothing is silently corrected.

import { groupInventoryByJob } from './dataProcessing';

const isManualRemoveLog = (log) =>
    log.job === 'MODIFICATION: REMOVE' && log.customer === 'Manual Edit';

const skipDetail = (d) => (d.job || '').startsWith('MODIFICATION') && d.returnedByLogEdit;

/**
 * @returns {{ ok: boolean, issues: Array<object>, stats: object }}
 */
export function auditCounts(inventory, usageLog) {
    const issues = [];
    const liveInventory = inventory || [];
    const logs = (usageLog || []).filter(l => (l.status || '') !== 'Archived');
    const completedLogs = logs.filter(l => (l.status || 'Completed') === 'Completed');

    // ── Invariant 1: every usage log's stored qty equals its detail count ──
    logs.forEach(log => {
        const details = log.details || [];
        if (typeof log.qty === 'number' && Math.abs(log.qty) !== details.length) {
            issues.push({
                type: 'log-qty-mismatch',
                logId: log.id,
                job: log.job,
                snapshots: details.length,
                stored: Math.abs(log.qty),
                message: `Usage log ${log.id} (${log.job}) says qty ${Math.abs(log.qty)} but has ${details.length} item snapshots.`,
            });
        }
    });

    // ── Invariant 2: no sheet may be claimed twice — neither by two different
    // completed usage logs nor twice within the same log's details ──
    const sheetToLog = new Map();
    completedLogs.forEach(log => {
        const seenInThisLog = new Set();
        (log.details || []).forEach(d => {
            if (!d.id) return;
            if (seenInThisLog.has(d.id)) {
                issues.push({
                    type: 'sheet-duplicated-in-log',
                    sheetId: d.id,
                    materialType: d.materialType,
                    length: d.length,
                    logId: log.id,
                    message: `Sheet ${d.id} is listed more than once on usage log ${log.id} (${log.job}).`,
                });
                return;
            }
            seenInThisLog.add(d.id);
            if (sheetToLog.has(d.id)) {
                issues.push({
                    type: 'sheet-in-two-logs',
                    sheetId: d.id,
                    materialType: d.materialType,
                    length: d.length,
                    logIds: [sheetToLog.get(d.id), log.id],
                    message: `Sheet ${d.id} is claimed by two usage logs: ${sheetToLog.get(d.id)} and ${log.id}.`,
                });
            } else {
                sheetToLog.set(d.id, log.id);
            }
        });
    });

    // ── Invariant 3: a sheet cannot be live (On Hand/Ordered) AND used ──
    const liveById = new Map(liveInventory.filter(i => i.id).map(i => [i.id, i]));
    sheetToLog.forEach((logId, sheetId) => {
        const liveItem = liveById.get(sheetId);
        if (liveItem) {
            issues.push({
                type: 'sheet-live-and-used',
                sheetId,
                materialType: liveItem.materialType,
                length: liveItem.length,
                logId,
                message: `Sheet ${sheetId} is in live inventory but also marked used by log ${logId}. It is displayed once (deduplicated), but the underlying data disagrees with itself.`,
            });
        }
    });

    // ── Invariant 4: legacy completed logs whose snapshots lack sheet ids ──
    completedLogs.forEach(log => {
        if (isManualRemoveLog(log)) return;
        const missing = (log.details || []).filter(d => !d.id).length;
        if (missing > 0) {
            issues.push({
                type: 'details-missing-ids',
                logId: log.id,
                job: log.job,
                count: missing,
                message: `Usage log ${log.id} (${log.job}) has ${missing} legacy item(s) without sheet ids; they cannot be traced back to an incoming order.`,
            });
        }
    });

    // ── Independent recount vs what the Logs view displays ──
    // Raw path: walk every unique sheet (live docs + used snapshots) with a flat
    // global id set — no grouping logic involved.
    const rawTotals = {};
    const countedIds = new Set();
    const bump = (totals, d) => {
        const key = `${d.materialType}|${d.length}`;
        totals[key] = (totals[key] || 0) + 1;
    };

    liveInventory.forEach(item => {
        if (skipDetail(item)) return;
        if (item.id) {
            if (countedIds.has(item.id)) return;
            countedIds.add(item.id);
        }
        bump(rawTotals, item);
    });
    completedLogs.forEach(log => {
        const manualRemove = isManualRemoveLog(log);
        (log.details || []).forEach((d, index) => {
            if (!d.materialType || skipDetail(d)) return;
            const id = d.id || (manualRemove ? `${log.id}-${index}-${d.materialType}-${d.length}` : null);
            if (!id || countedIds.has(id)) return;
            countedIds.add(id);
            bump(rawTotals, d);
        });
    });

    // Display path: exactly what the Incoming Stock Log renders.
    const groups = groupInventoryByJob(liveInventory, usageLog || []);
    const displayedTotals = {};
    groups.forEach(g => (g.displayDetails || []).forEach(d => bump(displayedTotals, d)));

    const allKeys = new Set([...Object.keys(rawTotals), ...Object.keys(displayedTotals)]);
    allKeys.forEach(key => {
        const raw = rawTotals[key] || 0;
        const displayed = displayedTotals[key] || 0;
        if (raw !== displayed) {
            const [materialType, length] = key.split('|');
            issues.push({
                type: 'display-recount-mismatch',
                materialType,
                length,
                raw,
                displayed,
                message: `${materialType} @ ${length}": independent recount finds ${raw} sheet(s) but the log view displays ${displayed}.`,
            });
        }
    });

    return {
        ok: issues.length === 0,
        issues,
        stats: {
            sheetsChecked: countedIds.size,
            incomingGroups: groups.length,
            usageLogsChecked: logs.length,
            materialLengthSlots: allKeys.size,
        },
    };
}
