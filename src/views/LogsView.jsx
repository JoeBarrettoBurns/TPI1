// src/views/LogsView.jsx

import React, { useState, useMemo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Download, ShieldCheck, ShieldAlert, Wrench } from 'lucide-react';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { LogDetailModal } from '../components/modals/LogDetailModal';
import { IncomingLogDisplay } from '../components/logs/IncomingLogDisplay';
import { OutgoingLogDisplay } from '../components/logs/OutgoingLogDisplay';
import { Button } from '../components/common/Button';
import { exportToCSV } from '../utils/csvExport';
import { groupInventoryByJob } from '../utils/dataProcessing';
import { auditCounts } from '../utils/countAudit';

const AUDIT_ISSUE_META = {
    'sheet-in-two-logs': {
        title: 'Sheets counted by two usage logs',
        reason: 'An older version of the app could leave a sheet on a previous log after that log was edited or its sheets were re-used, so two outgoing entries each count the same physical sheet. The fix keeps the sheet on the log that the inventory record itself points to and removes the stale duplicate from the other.',
        fixable: true,
    },
    'sheet-duplicated-in-log': {
        title: 'Sheets listed twice on the same log',
        reason: 'A single outgoing entry lists the same physical sheet more than once — usually from an older edit or merge that appended items instead of replacing them. Stock counts only ever count the sheet once, but the log\'s own item list and total are inflated. The fix removes the extra copies from that log (a log left with no items is deleted).',
        fixable: true,
    },
    'sheet-live-and-used': {
        title: 'Sheets both in stock and marked used',
        reason: 'A sheet is sitting in live inventory but a usage log still claims it was consumed — usually from an edit that returned the sheet without cleaning up the log. The live inventory record is the source of truth, so the fix removes the stale claim from the log.',
        fixable: true,
    },
    'log-qty-mismatch': {
        title: 'Log total differs from its items',
        reason: 'The stored quantity on the log no longer matches the number of sheets it actually lists. The fix recalculates the total from the items.',
        fixable: true,
    },
    'details-missing-ids': {
        title: 'Legacy entries without sheet records',
        reason: 'These logs predate per-sheet tracking, so their items cannot be traced to specific sheets. They cannot be fixed automatically — review them by hand if their totals matter.',
        fixable: false,
    },
    'display-recount-mismatch': {
        title: 'Displayed count differs from recount',
        reason: 'Usually a consequence of the issues above — fixing those and re-verifying normally clears these.',
        fixable: false,
    },
};

export const LogsView = ({ usageLog, inventory, onEditOrder, onDeleteLog, onDeleteInventoryGroup, materials, onFulfillLog, onReceiveOrder, searchQuery, onRepairCountIssues }) => {
    const [detailLog, setDetailLog] = useState(null);
    const [logToDelete, setLogToDelete] = useState(null);
    const [incomingOrdersToShow, setIncomingOrdersToShow] = useState(5);
    const [outgoingOrdersToShow, setOutgoingOrdersToShow] = useState(5);
    const [auditRequested, setAuditRequested] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    const [repairSummary, setRepairSummary] = useState(null);

    // Recomputes automatically when Firestore pushes fresh data, so after a
    // repair the panel re-verifies itself in front of the user.
    const auditResult = useMemo(
        () => (auditRequested ? auditCounts(inventory, usageLog) : null),
        [auditRequested, inventory, usageLog]
    );

    const logsById = useMemo(() => new Map(usageLog.map(l => [l.id, l])), [usageLog]);
    const logLabel = (id) => {
        const log = logsById.get(id);
        if (!log) return 'a deleted log';
        const date = new Date(log.usedAt || log.createdAt).toLocaleDateString();
        return `"${log.job}" (${date})`;
    };

    const groupedAuditIssues = useMemo(() => {
        if (!auditResult || auditResult.ok) return [];

        const byType = new Map();
        auditResult.issues.forEach(issue => {
            if (!byType.has(issue.type)) byType.set(issue.type, []);
            byType.get(issue.type).push(issue);
        });

        return [...byType.entries()].map(([type, issues]) => {
            const meta = AUDIT_ISSUE_META[type] || { title: type, reason: '', fixable: false };
            let lines;

            if (type === 'sheet-in-two-logs') {
                // Collapse per-sheet noise into one line per pair of logs.
                const pairs = new Map();
                issues.forEach(i => {
                    const key = (i.logIds || []).join('|');
                    if (!pairs.has(key)) pairs.set(key, { logIds: i.logIds || [], materials: new Map() });
                    const pair = pairs.get(key);
                    const matKey = `${i.materialType} @ ${i.length}"`;
                    pair.materials.set(matKey, (pair.materials.get(matKey) || 0) + 1);
                });
                lines = [...pairs.values()].map(pair => {
                    const total = [...pair.materials.values()].reduce((a, b) => a + b, 0);
                    const breakdown = [...pair.materials.entries()].map(([mat, n]) => `${n}× ${mat}`).join(', ');
                    return `${total} sheet${total === 1 ? '' : 's'} (${breakdown}) counted by both ${logLabel(pair.logIds[0])} and ${logLabel(pair.logIds[1])}`;
                });
            } else if (type === 'sheet-duplicated-in-log') {
                // One line per log with a material breakdown of the extra copies.
                const byLog = new Map();
                issues.forEach(i => {
                    if (!byLog.has(i.logId)) byLog.set(i.logId, new Map());
                    const mats = byLog.get(i.logId);
                    const matKey = `${i.materialType} @ ${i.length}"`;
                    mats.set(matKey, (mats.get(matKey) || 0) + 1);
                });
                lines = [...byLog.entries()].map(([logId, mats]) => {
                    const total = [...mats.values()].reduce((a, b) => a + b, 0);
                    const breakdown = [...mats.entries()].map(([mat, n]) => `${n}× ${mat}`).join(', ');
                    return `${total} extra cop${total === 1 ? 'y' : 'ies'} (${breakdown}) listed on ${logLabel(logId)}`;
                });
            } else if (type === 'sheet-live-and-used') {
                lines = issues.map(i => `${i.materialType} @ ${i.length}" sheet is in stock but still claimed by ${logLabel(i.logId)}`);
            } else if (type === 'log-qty-mismatch') {
                lines = issues.map(i => `${logLabel(i.logId)} shows a total of ${i.stored} but lists ${i.snapshots} item${i.snapshots === 1 ? '' : 's'}`);
            } else if (type === 'details-missing-ids') {
                lines = issues.map(i => `${logLabel(i.logId)} has ${i.count} item${i.count === 1 ? '' : 's'} that cannot be traced to a sheet`);
            } else if (type === 'display-recount-mismatch') {
                lines = issues.map(i => `${i.materialType} @ ${i.length}": recount finds ${i.raw} sheet${i.raw === 1 ? '' : 's'} but the view displays ${i.displayed}`);
            } else {
                lines = issues.map(i => i.message);
            }

            return { type, meta, count: issues.length, lines };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auditResult, logsById]);

    const fixableIssueCount = useMemo(
        () => (auditResult ? auditResult.issues.filter(i => AUDIT_ISSUE_META[i.type]?.fixable).length : 0),
        [auditResult]
    );

    const handleVerifyCounts = () => {
        setRepairSummary(null);
        setAuditRequested(true);
    };

    const handleFixCounts = async () => {
        if (!auditResult || auditResult.ok || !onRepairCountIssues) return;
        setIsRepairing(true);
        setRepairSummary(null);
        try {
            const result = await onRepairCountIssues(auditResult.issues);
            setRepairSummary(
                `Repair complete: removed ${result.removedDuplicates} duplicate claim(s) across ${result.updatedLogs + (result.deletedLogs || 0)} log(s)` +
                (result.deletedLogs ? `, deleted ${result.deletedLogs} emptied log(s)` : '') +
                (result.pointerFixes ? `, relinked ${result.pointerFixes} sheet(s)` : '') +
                (result.unfixable ? `. ${result.unfixable} legacy entr${result.unfixable === 1 ? 'y' : 'ies'} need manual review.` : '. Re-verifying below with the fresh data.')
            );
        } catch (err) {
            console.error('Count repair failed:', err);
            setRepairSummary(`Repair failed: ${err?.message || 'unknown error'}`);
        } finally {
            setIsRepairing(false);
        }
    };

    const incomingItems = useMemo(() => {
        const grouped = groupInventoryByJob(inventory, usageLog);
        if (!searchQuery) return grouped;
        const lowercasedQuery = (searchQuery || '').toLowerCase();
        return grouped.filter(group =>
            (group.job || '').toLowerCase().includes(lowercasedQuery) ||
            (group.supplier || '').toLowerCase().includes(lowercasedQuery) ||
            (group.displayDetails || group.details || []).some(d => (d.materialType || '').toLowerCase().includes(lowercasedQuery))
        );
    }, [inventory, usageLog, searchQuery]);

    const filteredUsageLog = useMemo(() => {
        const filtered = usageLog.filter(log => log.status !== 'Archived');
        if (!searchQuery) return filtered;
        const lowercasedQuery = (searchQuery || '').toLowerCase();
        return filtered.filter(log =>
            (log.job || '').toLowerCase().includes(lowercasedQuery) ||
            (log.customer || '').toLowerCase().includes(lowercasedQuery) ||
            (log.details || []).some(d => (d.materialType || '').toLowerCase().includes(lowercasedQuery))
        );
    }, [usageLog, searchQuery]);

    const handleConfirmDeleteLog = () => {
        if (!logToDelete) return;
        if (logToDelete.isAddition) {
            onDeleteInventoryGroup(logToDelete);
        } else {
            onDeleteLog(logToDelete.id);
        }
        setLogToDelete(null);
    };

    const handleExportIncoming = () => {
        const headers = [
            { label: 'Date Ordered', key: 'dateOrdered' },
            { label: 'Date Incoming/Received', key: 'dateIncoming' },
            { label: 'Job/PO', key: 'job' },
            { label: 'Supplier', key: 'supplier' },
            { label: 'Material', key: 'materialType' },
            { label: 'Length', key: 'length' },
            { label: 'Qty', key: 'qty' },
            { label: 'Status', key: 'status' },
        ];

        const dataToExport = incomingItems.flatMap(group => {
            const displayDetails = group.displayDetails || group.details || [];
            const dateIncoming = group.isFuture
                ? displayDetails.reduce(
                    (latest, curr) => !latest || (curr.arrivalDate && new Date(curr.arrivalDate) > new Date(latest)) ? curr.arrivalDate : latest,
                    null
                )
                : displayDetails.reduce(
                    (latest, curr) => !latest || (curr.dateReceived && new Date(curr.dateReceived) > new Date(latest)) ? curr.dateReceived : latest,
                    null
                );

            return displayDetails.map(item => ({
                dateOrdered: new Date(group.date).toLocaleDateString(),
                dateIncoming: dateIncoming ? new Date(dateIncoming).toLocaleDateString() : 'N/A',
                job: group.job,
                supplier: group.customer,
                materialType: item.materialType,
                length: item.length,
                qty: 1,
                status: item.status,
            }));
        });

        exportToCSV(dataToExport, headers, 'incoming_stock_logs.csv');
    };

    const handleExportOutgoing = () => {
        const headers = [
            { label: 'Date Used', key: 'date' },
            { label: 'Job', key: 'job' },
            { label: 'Customer', key: 'customer' },
            { label: 'Material', key: 'materialType' },
            { label: 'Length', key: 'length' },
            { label: 'Status', key: 'status' },
        ];

        const dataToExport = filteredUsageLog.flatMap(log =>
            (log.details && log.details.length > 0) ? log.details.map(item => ({
                date: new Date(log.usedAt || log.createdAt).toLocaleDateString(),
                job: log.job,
                customer: log.customer,
                materialType: item.materialType,
                length: item.length,
                status: log.status,
            })) : []
        );

        exportToCSV(dataToExport, headers, 'outgoing_usage_logs.csv');
    };

    return (
        <div className="space-y-12">
            {(auditResult || repairSummary) && (
                <div className="space-y-3">
                    {repairSummary && (
                        <div className="rounded-lg bg-sky-500/15 px-4 py-2 text-sm text-sky-200">{repairSummary}</div>
                    )}
                    {auditResult && (auditResult.ok ? (
                        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                            <ShieldCheck size={22} className="shrink-0" />
                            <div>
                                <div className="font-semibold">All counts verified.</div>
                                <div className="text-emerald-200/80">
                                    {auditResult.stats.sheetsChecked} sheets across {auditResult.stats.incomingGroups} incoming orders
                                    and {auditResult.stats.usageLogsChecked} usage logs are fully consistent. This re-checks live whenever the data changes.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-2 text-base font-semibold">
                                    <ShieldAlert size={20} className="shrink-0 text-red-300" />
                                    {auditResult.issues.length} count issue{auditResult.issues.length === 1 ? '' : 's'} found
                                </div>
                                {fixableIssueCount > 0 && onRepairCountIssues && (
                                    <Button onClick={handleFixCounts} disabled={isRepairing}>
                                        <Wrench size={16} /> {isRepairing ? 'Fixing…' : `Fix ${fixableIssueCount} issue${fixableIssueCount === 1 ? '' : 's'} automatically`}
                                    </Button>
                                )}
                            </div>
                            {groupedAuditIssues.map(group => (
                                <div key={group.type} className="rounded-lg bg-zinc-900/40 p-3">
                                    <div className="flex items-center gap-2 font-semibold text-red-200">
                                        {group.meta.title} ({group.count})
                                        {group.meta.fixable
                                            ? <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">auto-fixable</span>
                                            : <span className="rounded-full bg-zinc-600/40 px-2 py-0.5 text-[10px] font-medium text-zinc-300">manual review</span>}
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed text-red-200/70">{group.meta.reason}</p>
                                    <ul className="mt-2 list-disc space-y-1 pl-5 text-red-100/90">
                                        {group.lines.slice(0, 8).map((line, i) => <li key={i}>{line}</li>)}
                                        {group.lines.length > 8 && <li>…and {group.lines.length - 8} more.</li>}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            <LogDetailModal isOpen={!!detailLog} onClose={() => setDetailLog(null)} logEntry={detailLog} materials={materials} />
            <ConfirmationModal
                isOpen={!!logToDelete}
                onClose={() => setLogToDelete(null)}
                onConfirm={handleConfirmDeleteLog}
                title="Delete Entry"
                message="Are you sure you want to delete this entry? This action cannot be undone. Deleting a completed usage log will return its sheets to On Hand."
            />

            <div>
                <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ArrowDownCircle size={24} /> Incoming Stock Log
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label htmlFor="show-incoming-logs" className="text-sm text-zinc-400">Show:</label>
                            <select id="show-incoming-logs" value={incomingOrdersToShow > 20 ? 'all' : incomingOrdersToShow} onChange={(e) => setIncomingOrdersToShow(e.target.value === 'all' ? 10000 : parseInt(e.target.value, 10))} className="bg-zinc-700 text-white p-2 rounded-lg">
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={'all'}>All</option>
                            </select>
                        </div>
                        <Button onClick={handleExportIncoming} variant="secondary">
                            <Download size={16} /> <span className="hidden sm:inline">Export</span>
                        </Button>
                        <Button onClick={handleVerifyCounts} variant="secondary" title="Re-count every sheet and cross-check it against what the logs display">
                            <ShieldCheck size={16} /> <span className="hidden sm:inline">Verify Counts</span>
                        </Button>
                    </div>
                </div>
                <IncomingLogDisplay
                    incomingItems={incomingItems}
                    materials={materials}
                    onRowClick={setDetailLog}
                    onDelete={setLogToDelete}
                    onEdit={onEditOrder}
                    onReceiveOrder={onReceiveOrder}
                    ordersToShow={incomingOrdersToShow}
                />
            </div>

            <div>
                <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ArrowUpCircle size={24} /> Outgoing Stock Log
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label htmlFor="show-outgoing-logs" className="text-sm text-zinc-400">Show:</label>
                            <select id="show-outgoing-logs" value={outgoingOrdersToShow > 20 ? 'all' : outgoingOrdersToShow} onChange={(e) => setOutgoingOrdersToShow(e.target.value === 'all' ? 10000 : parseInt(e.target.value, 10))} className="bg-zinc-700 text-white p-2 rounded-lg">
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={'all'}>All</option>
                            </select>
                        </div>
                        <Button onClick={handleExportOutgoing} variant="secondary">
                            <Download size={16} /> <span className="hidden sm:inline">Export</span>
                        </Button>
                    </div>
                </div>
                <OutgoingLogDisplay
                    usageLog={filteredUsageLog}
                    materials={materials}
                    onRowClick={setDetailLog}
                    onDelete={setLogToDelete}
                    onEdit={onEditOrder}
                    onFulfillLog={onFulfillLog}
                    ordersToShow={outgoingOrdersToShow}
                />
            </div>
        </div>
    );
};
