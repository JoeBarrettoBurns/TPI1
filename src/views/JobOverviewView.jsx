// src/views/JobOverviewView.jsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Archive, ArchiveRestore, CalendarClock, Layers, Search } from 'lucide-react';
import { calculateSheetCost, buildCustomerJobGroups, parseJobPoParts } from '../utils/dataProcessing';
import { useJobOverviewArchive } from '../hooks/useJobOverviewArchive';

// ─── utilities ───────────────────────────────────────────────────────────────

function jobNameKey(jobLike) {
    return (jobLike?.job || '').trim().toUpperCase();
}

function jobPoArchiveKey(jobLike) {
    const { baseKey } = parseJobPoParts(jobLike?.job);
    return (baseKey || (jobLike?.job || '').trim()).toUpperCase();
}

function shortMat(type) {
    if (!type) return '?';
    return String(type).replace(/\bGALV\b/gi, 'Galv').replace(/\bALUM\b/gi, 'Al');
}

function uniqueSectionSuffixes(parts) {
    const seen = new Set();
    const out = [];
    for (const p of parts || []) {
        const suf = parseJobPoParts(p.job).partSuffix;
        if (!suf) continue;
        const k = suf.toUpperCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(suf);
    }
    return out;
}

function formatMoneyUSD(n) {
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);
}

const COST_EPS = 0.005;

function sortKeyFromPoGroup(group) {
    const base = (group.displayBase || group.baseKey || '').trim();
    const m = /^J(\d+)$/i.exec(base);
    if (m) return parseInt(m[1], 10);
    return null;
}

function formatJobTotalCost(totalCost, totalSheets) {
    if (!totalSheets) return null;
    if (!Number.isFinite(totalCost) || totalCost <= COST_EPS) return null;
    return formatMoneyUSD(totalCost);
}

function formatLineCost(sum) {
    if (!Number.isFinite(sum) || sum <= COST_EPS) return null;
    return formatMoneyUSD(sum);
}

/** Title-case ALL-CAPS strings coming from usage logs. */
function prettify(raw) {
    const t = (raw || '').trim();
    if (!t) return t;
    const shouting = t === t.toUpperCase() && /[A-Z]/.test(t) && t.length > 2;
    if (!shouting) return t;
    return t.toLowerCase().split(/\s+/).map((w) =>
        /^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
}

// ─── data helpers ─────────────────────────────────────────────────────────────

function groupJobsByPoNumber(jobs) {
    const map = new Map();
    for (const job of jobs) {
        const { baseKey, displayBase } = parseJobPoParts(job.job);
        const k = baseKey || (job.job || '').trim().toUpperCase();
        if (!map.has(k)) map.set(k, { baseKey: k, displayBase: displayBase || job.job || k, parts: [] });
        map.get(k).parts.push(job);
    }
    const groups = [...map.values()].map((g) => ({
        ...g,
        parts: [...g.parts].sort((a, b) => new Date(b.date) - new Date(a.date)),
    }));
    groups.sort((a, b) => {
        const na = sortKeyFromPoGroup(a);
        const nb = sortKeyFromPoGroup(b);
        if (na != null && nb != null) return nb - na;
        if (na != null) return -1;
        if (nb != null) return 1;
        const maxB = Math.max(...b.parts.map((p) => new Date(p.date).getTime() || 0), 0);
        const maxA = Math.max(...a.parts.map((p) => new Date(p.date).getTime() || 0), 0);
        return maxB - maxA;
    });
    return groups;
}

const BUCKET_ORDER = { used: 0, scheduled_use: 1, ordered: 2, on_hand: 3 };
const BUCKET_LABEL = { used: 'Used', scheduled_use: 'Sched', ordered: 'Due', on_hand: 'Stock' };

/** One-time index so job economics does not scan full inventory / usageLog per job. */
function buildInventoryByJobKey(inventory) {
    const map = new Map();
    for (const i of inventory || []) {
        const jk = (i.job || '').trim().toUpperCase();
        if (!jk) continue;
        let arr = map.get(jk);
        if (!arr) {
            arr = [];
            map.set(jk, arr);
        }
        arr.push(i);
    }
    return map;
}

/** Mirror buildJobEconomics usage-log rules into per–job-key slices (single pass over usageLog). */
function buildUsageWorkloadByJobKey(usageLog) {
    const map = new Map();
    const push = (jobKey, item) => {
        if (!jobKey) return;
        let arr = map.get(jobKey);
        if (!arr) {
            arr = [];
            map.set(jobKey, arr);
        }
        arr.push(item);
    };

    for (const log of usageLog || []) {
        const st = log.status || 'Completed';
        if (st === 'Archived') continue;
        const logJobKey = (log.job || '').trim().toUpperCase();

        if (logJobKey && st === 'Scheduled') {
            push(logJobKey, { kind: 'scheduled', log });
            continue;
        }
        if (logJobKey && st === 'Completed') {
            push(logJobKey, { kind: 'used_full_log', log });
            for (const d of log.details || []) {
                const dk = (d.job || '').trim().toUpperCase();
                if (dk && dk !== logJobKey) {
                    push(dk, { kind: 'used_detail', log, detail: d });
                }
            }
            continue;
        }
        if (st === 'Completed') {
            for (const d of log.details || []) {
                const dk = (d.job || '').trim().toUpperCase();
                if (dk) {
                    push(dk, { kind: 'used_detail', log, detail: d });
                }
            }
        }
    }
    return map;
}

function buildJobEconomicsIndex(inventory, usageLog) {
    return {
        inventoryByJob: buildInventoryByJobKey(inventory),
        usageByJob: buildUsageWorkloadByJobKey(usageLog),
    };
}

function buildJobEconomics(jobName, index, materials) {
    const mats = materials || {};
    const jobKey = (jobName || '').trim().toUpperCase();
    const map = new Map();

    const addSheet = (bucket, sheet) => {
        if (!sheet?.materialType) return;
        const k = `${bucket}|${sheet.materialType}|${sheet.length}`;
        const prev = map.get(k) || { bucket, materialType: sheet.materialType, length: sheet.length, qty: 0, costSum: 0 };
        prev.qty += 1;
        prev.costSum += calculateSheetCost({ ...sheet, width: sheet.width || 48 }, mats);
        map.set(k, prev);
    };

    for (const i of index.inventoryByJob.get(jobKey) || []) {
        if (i.status === 'On Hand') addSheet('on_hand', i);
        else if (i.status === 'Ordered') addSheet('ordered', i);
    }

    for (const u of index.usageByJob.get(jobKey) || []) {
        if (u.kind === 'scheduled') {
            (u.log.details || []).forEach((d) => addSheet('scheduled_use', d));
        } else if (u.kind === 'used_full_log') {
            (u.log.details || []).forEach((d) => addSheet('used', d));
        } else if (u.kind === 'used_detail') {
            addSheet('used', u.detail);
        }
    }

    const groups = [...map.values()]
        .sort((a, b) => {
            const bo = (BUCKET_ORDER[a.bucket] ?? 9) - (BUCKET_ORDER[b.bucket] ?? 9);
            if (bo !== 0) return bo;
            const mt = (a.materialType || '').localeCompare(b.materialType || '');
            if (mt !== 0) return mt;
            return (Number(a.length) || 0) - (Number(b.length) || 0);
        })
        .map((g) => ({ ...g, key: `${g.bucket}|${g.materialType}|${g.length}`, bucketLabel: BUCKET_LABEL[g.bucket] || g.bucket }));

    const totalSheets = groups.reduce((s, g) => s + g.qty, 0);
    const totalCost = groups.reduce((s, g) => s + g.costSum, 0);
    return { groups, totalSheets, totalCost };
}

function rollupGroupEconomics(parts, index, materials) {
    let totalSheets = 0, totalCost = 0;
    for (const j of parts) {
        const e = buildJobEconomics(j.job, index, materials);
        totalSheets += e.totalSheets;
        totalCost += e.totalCost;
    }
    return { totalSheets, totalCost };
}

function summarizeCustomerJobs(jobs, index, materials) {
    let totalSheets = 0, totalCost = 0, latestMs = 0, scheduled = 0;
    const masterKeys = new Set();
    for (const job of jobs) {
        const econ = buildJobEconomics(job.job, index, materials);
        totalSheets += econ.totalSheets;
        totalCost += econ.totalCost;
        const t = new Date(job.date).getTime();
        if (Number.isFinite(t) && t > latestMs) latestMs = t;
        if ((job.status || 'Completed') === 'Scheduled') scheduled += 1;
        const { baseKey } = parseJobPoParts(job.job);
        masterKeys.add(baseKey || (job.job || '').trim().toUpperCase());
    }
    return { masterJobCount: masterKeys.size, lineCount: jobs.length, totalSheets, totalCost, lastActivityMs: latestMs, scheduled };
}

// ─── small UI pieces ──────────────────────────────────────────────────────────

function PanelShell({ children, className = '' }) {
    return (
        <div className={`flex flex-col min-h-0 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900 ${className}`}>
            {children}
        </div>
    );
}

function PanelHeader({ children }) {
    return (
        <div className="shrink-0 border-b border-zinc-700/80 bg-zinc-900/90 px-3 py-2.5">
            {children}
        </div>
    );
}

function EmptyState({ children }) {
    return (
        <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-zinc-500">
            {children}
        </div>
    );
}

// ─── Column 1: Customer list ──────────────────────────────────────────────────

function CustomerColumn({ options, selectedKey, onSelectKey }) {
    const [q, setQ] = useState('');

    const filtered = useMemo(() => {
        const lq = q.trim().toLowerCase();
        if (!lq) return options;
        return options.filter((o) => {
            const label = prettify(o.label).toLowerCase();
            return label.includes(lq) || o.label.toLowerCase().includes(lq);
        });
    }, [options, q]);

    return (
        <PanelShell className="w-full h-[min(40vh,18rem)] lg:h-auto lg:w-52 lg:shrink-0">
            <PanelHeader>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Customer</p>
                <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" aria-hidden />
                    <input
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Filter…"
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800 pl-7 pr-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500/70"
                        autoComplete="off"
                    />
                </div>
            </PanelHeader>

            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-px" role="listbox">
                {filtered.length === 0 && (
                    <li className="py-6 text-center text-xs text-zinc-600">No matches</li>
                )}
                {filtered.map((o) => {
                    const active = o.key === selectedKey;
                    return (
                        <li key={o.key} role="option" aria-selected={active}>
                            <button
                                type="button"
                                onClick={() => onSelectKey(o.key)}
                                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                                    active
                                        ? 'bg-blue-600/25 text-white ring-1 ring-inset ring-blue-500/40'
                                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                                }`}
                            >
                                <span className="min-w-0 truncate text-sm font-medium leading-snug">
                                    {prettify(o.label)}
                                </span>
                                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                                    active ? 'bg-blue-500/30 text-blue-200' : 'bg-zinc-800 text-zinc-500'
                                }`}>
                                    {o.jobCount}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </PanelShell>
    );
}

// ─── Column 2: PO job list ────────────────────────────────────────────────────

function PoJobCard({ group, selected, onSelect, jobEconIndex, materials, showArchiveBtn, showRestoreBtn, onArchive, onRestore, archiveReady, isArchived }) {
    const multi = group.parts.length > 1;
    const rollup = multi
        ? rollupGroupEconomics(group.parts, jobEconIndex, materials)
        : buildJobEconomics(group.parts[0].job, jobEconIndex, materials);
    const hasScheduled = group.parts.some((p) => p.status === 'Scheduled');
    const latestMs = Math.max(...group.parts.map((p) => new Date(p.date).getTime() || 0), 0);
    const lastLabel = latestMs > 0
        ? new Date(latestMs).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })
        : null;
    const cost = formatJobTotalCost(rollup.totalCost, rollup.totalSheets);

    return (
        <li className="group/card flex items-stretch gap-1">
            <button
                type="button"
                onClick={() => onSelect(group.baseKey)}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected
                        ? 'border-blue-500/60 bg-blue-950/40 ring-1 ring-inset ring-blue-500/40'
                        : isArchived
                            ? 'border-zinc-700/40 bg-zinc-900/20 opacity-70 hover:opacity-100 hover:bg-zinc-800/40'
                            : 'border-zinc-700/60 bg-zinc-900/30 hover:bg-zinc-800/50 hover:border-zinc-600/70'
                }`}
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        {hasScheduled && <CalendarClock size={11} className="shrink-0 text-purple-400" aria-hidden />}
                        <span className="font-mono text-sm font-bold text-white tabular-nums truncate">
                            {group.displayBase}
                        </span>
                        {multi && (
                            <span className="shrink-0 rounded bg-sky-900/50 px-1 py-px text-[9px] font-semibold text-sky-300">
                                {group.parts.length}
                            </span>
                        )}
                    </div>
                    {cost && (
                        <span className="shrink-0 font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                            {cost}
                        </span>
                    )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                    {rollup.totalSheets > 0 && <span className="tabular-nums">{rollup.totalSheets} sh</span>}
                    {lastLabel && <span className="tabular-nums">{lastLabel}</span>}
                </div>
            </button>

            {(showArchiveBtn || showRestoreBtn) && (
                <button
                    type="button"
                    disabled={!archiveReady}
                    aria-label={showArchiveBtn ? `Archive ${group.displayBase}` : `Restore ${group.displayBase}`}
                    title={showArchiveBtn ? 'Archive job' : 'Restore job'}
                    onClick={() => showArchiveBtn ? onArchive(group.baseKey) : onRestore(group.baseKey)}
                    className="shrink-0 self-stretch flex items-center justify-center w-7 rounded-lg border border-zinc-700/60 bg-zinc-900/30 text-zinc-600 opacity-0 group-hover/card:opacity-100 hover:!text-amber-300 hover:border-amber-700/50 hover:bg-zinc-800 disabled:pointer-events-none transition-all"
                >
                    {showArchiveBtn ? <Archive size={12} aria-hidden /> : <ArchiveRestore size={12} aria-hidden />}
                </button>
            )}
        </li>
    );
}

function JobListColumn({ groups, archivedGroups, selectedBaseKey, onSelectBaseKey, jobEconIndex, materials, onArchive, onRestore, archiveReady, customerLabel, overview }) {
    const lastActivity = overview?.lastActivityMs > 0
        ? new Date(overview.lastActivityMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : null;
    const overviewCost = overview ? formatJobTotalCost(overview.totalCost, overview.totalSheets) : null;

    return (
        <PanelShell className="w-full h-[min(45vh,22rem)] lg:h-auto lg:w-64 lg:shrink-0">
            <PanelHeader>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Jobs</p>
                    {customerLabel && (
                        <span className="text-xs font-medium text-zinc-300 truncate max-w-[55%]">{prettify(customerLabel)}</span>
                    )}
                </div>
                {overview && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500 tabular-nums">
                        <span><span className="text-zinc-300 font-semibold">{overview.masterJobCount}</span> POs</span>
                        {overview.totalSheets > 0 && <span><span className="text-zinc-300 font-semibold">{overview.totalSheets}</span> sheets</span>}
                        {overviewCost && <span className="text-emerald-400 font-semibold">{overviewCost}</span>}
                        {overview.scheduled > 0 && <span className="text-purple-300 font-semibold">{overview.scheduled} sched</span>}
                        {lastActivity && <span>{lastActivity}</span>}
                    </div>
                )}
            </PanelHeader>

            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
                {groups.length === 0 && archivedGroups.length === 0 && (
                    <EmptyState>No jobs for this customer yet.</EmptyState>
                )}

                {groups.length > 0 && (
                    <ul className="p-2 space-y-1">
                        {groups.map((g) => (
                            <PoJobCard
                                key={g.baseKey}
                                group={g}
                                selected={selectedBaseKey === g.baseKey}
                                onSelect={onSelectBaseKey}
                                jobEconIndex={jobEconIndex}
                                materials={materials}
                                showArchiveBtn={archiveReady}
                                showRestoreBtn={false}
                                onArchive={onArchive}
                                archiveReady={archiveReady}
                                isArchived={false}
                            />
                        ))}
                    </ul>
                )}

                {archivedGroups.length > 0 && (
                    <>
                        <div className="sticky top-0 z-10 border-y border-zinc-700/60 bg-zinc-900/95 px-3 py-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Archived</p>
                        </div>
                        <ul className="p-2 space-y-1">
                            {archivedGroups.map((g) => (
                                <PoJobCard
                                    key={g.baseKey}
                                    group={g}
                                    selected={selectedBaseKey === g.baseKey}
                                    onSelect={onSelectBaseKey}
                                    jobEconIndex={jobEconIndex}
                                    materials={materials}
                                    showArchiveBtn={false}
                                    showRestoreBtn={archiveReady}
                                    onRestore={onRestore}
                                    archiveReady={archiveReady}
                                    isArchived
                                />
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </PanelShell>
    );
}

// ─── Column 3: PO detail ──────────────────────────────────────────────────────

function CompactEconomicsLines({ groups }) {
    if (!groups?.length) return <span className="text-zinc-500 text-xs">—</span>;
    const tallList = groups.length > 8;
    return (
        <div className={`flex flex-col gap-1 ${tallList ? 'max-h-56 overflow-y-auto pr-1' : ''}`}>
            {groups.map((g) => (
                <div key={g.key} className="grid grid-cols-[3rem_2.25rem_minmax(0,1fr)_auto] gap-x-2.5 items-baseline text-[11px] leading-snug">
                    <span className="text-zinc-500 font-medium uppercase tracking-tight">{g.bucketLabel}</span>
                    <span className="font-mono text-zinc-200 tabular-nums text-right">{g.qty}×</span>
                    <span className="text-zinc-300 min-w-0 truncate">
                        {shortMat(g.materialType)}<span className="text-zinc-500"> {g.length}&quot;</span>
                    </span>
                    <span className="font-mono text-emerald-400/95 tabular-nums text-right whitespace-nowrap pl-1">
                        {formatLineCost(g.costSum) ?? <span className="text-zinc-600">—</span>}
                    </span>
                </div>
            ))}
        </div>
    );
}

function JobSectionCard({ job, jobEconIndex, materials }) {
    const econ = useMemo(
        () => buildJobEconomics(job.job, jobEconIndex, materials),
        [job.job, jobEconIndex, materials]
    );
    const poParts = parseJobPoParts(job.job);
    const heading = poParts.partSuffix ? poParts.partSuffix.replace(/_/g, ' ') : job.job;

    const badgeCls =
        job.status === 'Scheduled' ? 'bg-purple-500/20 text-purple-200' :
        job.status === 'Completed' ? 'bg-green-500/15 text-green-300' :
        job.status === 'In Stock'  ? 'bg-blue-500/15 text-blue-300' :
                                     'bg-zinc-700/40 text-zinc-300';

    return (
        <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-700/60 px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {job.status === 'Scheduled' && <CalendarClock size={14} className="text-purple-400 shrink-0" aria-hidden />}
                        <h3 className="text-sm font-bold text-white uppercase truncate">{heading}</h3>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{new Date(job.date).toLocaleDateString()}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeCls}`}>{job.status}</span>
            </div>

            <div className="p-4">
                {econ.groups.length === 0 ? (
                    <p className="text-center text-zinc-600 text-xs py-4">No sheet rows yet.</p>
                ) : (
                    <>
                        <CompactEconomicsLines groups={econ.groups} />
                        <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-zinc-700/60 text-sm">
                            <span className="text-zinc-500">{econ.totalSheets} sheet{econ.totalSheets === 1 ? '' : 's'}</span>
                            <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                                {formatJobTotalCost(econ.totalCost, econ.totalSheets) ?? '—'}
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function DetailColumn({ group, jobEconIndex, materials }) {
    if (!group) {
        return (
            <PanelShell className="flex-1">
                <EmptyState>
                    <span>Select a job to view its sheets and costs.</span>
                </EmptyState>
            </PanelShell>
        );
    }

    const multi = group.parts.length > 1;
    const rollup = multi ? rollupGroupEconomics(group.parts, jobEconIndex, materials) : null;
    const sectionLabels = uniqueSectionSuffixes(group.parts);

    return (
        <PanelShell className="flex-1 min-w-0">
            <PanelHeader>
                <div className="flex items-baseline gap-2 flex-wrap">
                    <Layers size={15} className="text-sky-400 shrink-0" aria-hidden />
                    <h2 className="font-mono text-sm font-bold text-white">{group.displayBase}</h2>
                    {sectionLabels.length > 0 && (
                        <span className="text-xs text-zinc-400">{sectionLabels.map((s) => s.replace(/_/g, ' ')).join(', ')}</span>
                    )}
                    <span className="text-[10px] text-zinc-600">{group.parts.length} section{group.parts.length === 1 ? '' : 's'}</span>
                </div>
                {rollup && rollup.totalSheets > 0 && (
                    <p className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                        {rollup.totalSheets} sheets total
                        {formatJobTotalCost(rollup.totalCost, rollup.totalSheets) && (
                            <span className="ml-2 font-mono text-emerald-400 font-semibold">
                                {formatJobTotalCost(rollup.totalCost, rollup.totalSheets)}
                            </span>
                        )}
                    </p>
                )}
            </PanelHeader>

            <div className="overflow-y-auto flex-1 min-h-0 p-3 space-y-3">
                {group.parts.map((job) => (
                    <JobSectionCard key={job.id} job={job} jobEconIndex={jobEconIndex} materials={materials} />
                ))}
            </div>
        </PanelShell>
    );
}

// ─── constants ────────────────────────────────────────────────────────────────

const ALL_JOBS_SECTION_KEY = '__all_jobs__';
const OTHER_JOBS_SECTION_KEY = '__other_jobs__';

// ─── main view ────────────────────────────────────────────────────────────────

export const JobOverviewView = ({
    userId,
    allJobs,
    inventory,
    usageLog,
    materials,
    initialSelectedJob,
    onClearSelectedJob,
    searchQuery,
}) => {
    const [selectedCustomerKey, setSelectedCustomerKey] = useState('');
    const [selectedGroupBaseKey, setSelectedGroupBaseKey] = useState(null);

    const { archivedBaseKeys, archiveReady, archivePoBase, restorePoBase } = useJobOverviewArchive(userId);

    const jobEconIndex = useMemo(
        () => buildJobEconomicsIndex(inventory, usageLog),
        [inventory, usageLog]
    );

    const { customerGroups, orphanJobs } = useMemo(
        () => buildCustomerJobGroups(usageLog, allJobs),
        [usageLog, allJobs]
    );

    const filteredCustomerGroups = useMemo(() => {
        if (!searchQuery?.trim()) return customerGroups;
        const q = searchQuery.trim().toLowerCase();
        return customerGroups
            .map((s) => {
                const custMatch = s.customer.toLowerCase().includes(q);
                const jobs = custMatch ? s.jobs : s.jobs.filter((j) => j.job.toLowerCase().includes(q));
                return { ...s, jobs };
            })
            .filter((s) => s.jobs.length > 0 || s.customer.toLowerCase().includes(q));
    }, [customerGroups, searchQuery]);

    const filteredOrphanJobs = useMemo(() => {
        const q = (searchQuery || '').trim().toLowerCase();
        let jobs = orphanJobs;
        if (q) jobs = jobs.filter((j) => j.job.toLowerCase().includes(q) || (j.customer || j.supplier || '').toLowerCase().includes(q));
        return jobs;
    }, [orphanJobs, searchQuery]);

    const filteredAllJobs = useMemo(() => {
        const q = (searchQuery || '').trim().toLowerCase();
        let jobs = allJobs || [];
        if (q) jobs = jobs.filter((j) => j.job.toLowerCase().includes(q) || (j.customer || j.supplier || '').toLowerCase().includes(q));
        return jobs;
    }, [allJobs, searchQuery]);

    const customerPickerOptions = useMemo(() => {
        const opts = [];
        if (filteredAllJobs.length > 0) opts.push({ key: ALL_JOBS_SECTION_KEY, label: 'All jobs', jobCount: filteredAllJobs.length });
        opts.push(...filteredCustomerGroups.map((g) => ({ key: g.customerKey, label: g.customer, jobCount: g.jobs.length })));
        if (filteredOrphanJobs.length > 0) opts.push({ key: OTHER_JOBS_SECTION_KEY, label: 'Other jobs', jobCount: filteredOrphanJobs.length });
        return opts;
    }, [filteredAllJobs, filteredCustomerGroups, filteredOrphanJobs]);

    const jobsForCustomer = useMemo(() => {
        if (!selectedCustomerKey) return [];
        if (selectedCustomerKey === ALL_JOBS_SECTION_KEY) return filteredAllJobs;
        if (selectedCustomerKey === OTHER_JOBS_SECTION_KEY) return filteredOrphanJobs;
        const g = filteredCustomerGroups.find((c) => c.customerKey === selectedCustomerKey);
        return g?.jobs || [];
    }, [selectedCustomerKey, filteredAllJobs, filteredCustomerGroups, filteredOrphanJobs]);

    const { activeJobsForCustomer, archivedJobsForCustomer } = useMemo(() => {
        const active = [], archived = [];
        for (const j of jobsForCustomer) {
            (archivedBaseKeys.has(jobPoArchiveKey(j)) ? archived : active).push(j);
        }
        return { activeJobsForCustomer: active, archivedJobsForCustomer: archived };
    }, [jobsForCustomer, archivedBaseKeys]);

    const jobGroupsActive = useMemo(() => groupJobsByPoNumber(activeJobsForCustomer), [activeJobsForCustomer]);
    const jobGroupsArchived = useMemo(() => groupJobsByPoNumber(archivedJobsForCustomer), [archivedJobsForCustomer]);

    const customerOverview = useMemo(
        () => activeJobsForCustomer.length > 0 ? summarizeCustomerJobs(activeJobsForCustomer, jobEconIndex, materials) : null,
        [activeJobsForCustomer, jobEconIndex, materials]
    );

    const selectedGroup = useMemo(() => {
        return [...jobGroupsActive, ...jobGroupsArchived].find((g) => g.baseKey === selectedGroupBaseKey) || null;
    }, [jobGroupsActive, jobGroupsArchived, selectedGroupBaseKey]);

    const handleArchivePoBase = useCallback(
        async (baseKey) => {
            await archivePoBase(baseKey);
            setSelectedGroupBaseKey((cur) => (cur === baseKey ? null : cur));
        },
        [archivePoBase]
    );

    // sync when navigating here from search
    useEffect(() => {
        if (!initialSelectedJob) return;
        const jk = jobNameKey(initialSelectedJob);
        let ck = null;
        for (const g of customerGroups) {
            if (g.jobs.some((j) => jobNameKey(j) === jk)) { ck = g.customerKey; break; }
        }
        if (ck) setSelectedCustomerKey(ck);
        else if (orphanJobs.some((j) => jobNameKey(j) === jk)) setSelectedCustomerKey(OTHER_JOBS_SECTION_KEY);
        const { baseKey } = parseJobPoParts(initialSelectedJob.job);
        setSelectedGroupBaseKey(baseKey || jk);
        onClearSelectedJob?.();
    }, [initialSelectedJob, customerGroups, orphanJobs, onClearSelectedJob]);

    // default to All Jobs
    useEffect(() => {
        if (!selectedCustomerKey && filteredAllJobs.length > 0) setSelectedCustomerKey(ALL_JOBS_SECTION_KEY);
    }, [filteredAllJobs.length, selectedCustomerKey]);

    // reset if selection goes stale after search
    useEffect(() => {
        if (!selectedCustomerKey) return;
        const inAll = selectedCustomerKey === ALL_JOBS_SECTION_KEY && filteredAllJobs.length > 0;
        const inGroups = filteredCustomerGroups.some((g) => g.customerKey === selectedCustomerKey);
        const inOther = selectedCustomerKey === OTHER_JOBS_SECTION_KEY && filteredOrphanJobs.length > 0;
        if (!inAll && !inGroups && !inOther) { setSelectedCustomerKey(''); setSelectedGroupBaseKey(null); }
    }, [filteredAllJobs, filteredCustomerGroups, filteredOrphanJobs, selectedCustomerKey]);

    useEffect(() => {
        if (!selectedGroupBaseKey) return;
        const ok = jobGroupsActive.some((g) => g.baseKey === selectedGroupBaseKey) || jobGroupsArchived.some((g) => g.baseKey === selectedGroupBaseKey);
        if (!ok) setSelectedGroupBaseKey(null);
    }, [jobGroupsActive, jobGroupsArchived, selectedGroupBaseKey]);

    const hasAnyCustomers = filteredAllJobs.length > 0 || filteredCustomerGroups.length > 0 || filteredOrphanJobs.length > 0;

    if (!hasAnyCustomers) {
        return (
            <p className="py-12 text-center text-sm text-zinc-500">
                No jobs match your search. Use Stock with a customer name to populate groups here.
            </p>
        );
    }

    const selectedCustomerLabel = customerPickerOptions.find((o) => o.key === selectedCustomerKey)?.label || '';

    return (
        <div className="flex flex-col lg:flex-row gap-3 min-h-[min(80vh,44rem)] items-stretch">
            <CustomerColumn
                options={customerPickerOptions}
                selectedKey={selectedCustomerKey}
                onSelectKey={(key) => { setSelectedCustomerKey(key); setSelectedGroupBaseKey(null); }}
            />

            {selectedCustomerKey ? (
                <>
                    <JobListColumn
                        groups={jobGroupsActive}
                        archivedGroups={jobGroupsArchived}
                        selectedBaseKey={selectedGroupBaseKey}
                        onSelectBaseKey={setSelectedGroupBaseKey}
                        jobEconIndex={jobEconIndex}
                        materials={materials}
                        onArchive={handleArchivePoBase}
                        onRestore={restorePoBase}
                        archiveReady={archiveReady}
                        customerLabel={selectedCustomerLabel}
                        overview={customerOverview}
                    />
                    <DetailColumn
                        group={selectedGroup}
                        jobEconIndex={jobEconIndex}
                        materials={materials}
                    />
                </>
            ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-zinc-600 rounded-xl border border-dashed border-zinc-700">
                    Select a customer to see jobs.
                </div>
            )}
        </div>
    );
};
