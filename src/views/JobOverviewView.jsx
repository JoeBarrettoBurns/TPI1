// src/views/JobOverviewView.jsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Briefcase, CalendarClock, ChevronDown, ChevronUp, Layers, Minus } from 'lucide-react';
import { calculateSheetCost, buildCustomerJobGroups, normalizeCustomerKey, parseJobPoParts } from '../utils/dataProcessing';

function jobsSelectionMatches(selected, candidate) {
    if (!selected || !candidate) return false;
    const sj = (selected.job || '').trim().toUpperCase();
    const cj = (candidate.job || '').trim().toUpperCase();
    if (sj !== cj) return false;
    const sc = normalizeCustomerKey(selected.customer || selected.supplier || '');
    const cc = normalizeCustomerKey(candidate.customer || candidate.supplier || '');
    if (!sc || !cc) return true;
    return sc === cc;
}

function shortMat(type) {
    if (!type) return '?';
    return String(type).replace(/\bGALV\b/gi, 'Galv').replace(/\bALUM\b/gi, 'Al');
}

function formatMoneyUSD(n) {
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const COST_EPS = 0.005;

/** Number of distinct job # groups (e.g. J5851…) shown before “more jobs”. */
const JOB_GROUPS_PREVIEW_LIMIT = 3;

function jobGroupNeedsSubheader(group) {
    if (group.parts.length > 1) return true;
    if (group.parts.length === 1) return Boolean(parseJobPoParts(group.parts[0].job).partSuffix);
    return false;
}

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
        const maxB = Math.max(...b.parts.map((p) => new Date(p.date).getTime() || 0), 0);
        const maxA = Math.max(...a.parts.map((p) => new Date(p.date).getTime() || 0), 0);
        return maxB - maxA;
    });
    return groups;
}

function summarizeCustomerJobs(jobs, inventory, usageLog, materials) {
    let totalSheets = 0;
    let totalCost = 0;
    let latestMs = 0;
    let scheduled = 0;
    let completed = 0;
    let inStock = 0;
    const masterKeys = new Set();

    for (const job of jobs) {
        const econ = buildJobEconomics(job.job, inventory, usageLog, materials);
        totalSheets += econ.totalSheets;
        totalCost += econ.totalCost;
        const t = new Date(job.date).getTime();
        if (Number.isFinite(t) && t > latestMs) {
            latestMs = t;
        }
        const st = job.status || 'Completed';
        if (st === 'Scheduled') scheduled += 1;
        else if (st === 'Completed') completed += 1;
        else if (st === 'In Stock') inStock += 1;
        const { baseKey } = parseJobPoParts(job.job);
        masterKeys.add(baseKey || (job.job || '').trim().toUpperCase());
    }

    return {
        masterJobCount: masterKeys.size,
        lineCount: jobs.length,
        totalSheets,
        totalCost,
        lastActivityMs: latestMs,
        scheduled,
        completed,
        inStock,
    };
}

function StatCard({ label, value, accent }) {
    return (
        <div className="flex flex-col gap-0.5 min-w-[5rem]">
            <span className="text-[9px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</span>
            <span className={`text-base font-bold tabular-nums leading-none ${accent || 'text-white'}`}>{value}</span>
        </div>
    );
}

function CustomerAnalysisOverview({ overview }) {
    const last =
        overview.lastActivityMs > 0
            ? new Date(overview.lastActivityMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';

    const costDisplay = formatJobTotalCost(overview.totalCost, overview.totalSheets);

    return (
        <div className="flex flex-wrap gap-x-4 gap-y-3 rounded-lg bg-zinc-900/60 border border-zinc-700/70 px-3 py-2.5 w-full">
            <StatCard label="Job #s" value={overview.masterJobCount} />
            <div className="w-px bg-zinc-700/60 self-stretch hidden sm:block" />
            <StatCard label="Parts" value={overview.lineCount} />
            <div className="w-px bg-zinc-700/60 self-stretch hidden sm:block" />
            <StatCard label="Sheets used" value={overview.totalSheets} />
            <div className="w-px bg-zinc-700/60 self-stretch hidden sm:block" />
            <StatCard label="Combined cost" value={costDisplay} accent="text-emerald-400" />
            <div className="w-px bg-zinc-700/60 self-stretch hidden sm:block" />
            {overview.scheduled > 0 && (
                <>
                    <StatCard label="Scheduled" value={overview.scheduled} accent="text-purple-300" />
                    <div className="w-px bg-zinc-700/60 self-stretch hidden sm:block" />
                </>
            )}
            <StatCard label="Last activity" value={last} accent="text-zinc-300" />
        </div>
    );
}

function CustomerJobsSection({
    sectionKey,
    heading,
    headingAside,
    jobs,
    expanded,
    onToggleExpanded,
    selectedJob,
    onSelectJob,
    showPartyColumn,
    inventory,
    usageLog,
    materials,
}) {
    const overview = useMemo(
        () => summarizeCustomerJobs(jobs, inventory, usageLog, materials),
        [jobs, inventory, usageLog, materials]
    );

    const groupedJobs = useMemo(() => groupJobsByPoNumber(jobs), [jobs]);

    const visibleGroups = expanded ? groupedJobs : groupedJobs.slice(0, JOB_GROUPS_PREVIEW_LIMIT);
    const needsExpand = groupedJobs.length > JOB_GROUPS_PREVIEW_LIMIT;
    const moreGroups = groupedJobs.length - JOB_GROUPS_PREVIEW_LIMIT;

    return (
        <section className="flex flex-col min-h-0 min-w-0 w-full max-w-[min(100%,42rem)] space-y-2">
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-700/70 w-full">
                <Briefcase className="text-blue-400 shrink-0" size={18} aria-hidden />
                <h2 className="text-base font-bold text-white leading-tight tracking-wide">{heading}</h2>
                {headingAside && <span className="text-xs text-zinc-500">{headingAside}</span>}
            </div>

            <CustomerAnalysisOverview overview={overview} />

            <div>
                <JobsGroupedLogTable
                    groups={visibleGroups}
                    selectedJob={selectedJob}
                    onSelectJob={onSelectJob}
                    showPartyColumn={showPartyColumn}
                    inventory={inventory}
                    usageLog={usageLog}
                    materials={materials}
                />
                {needsExpand && (
                    <button
                        type="button"
                        onClick={() => onToggleExpanded(sectionKey)}
                        className="flex items-center gap-1.5 w-full justify-center text-[11px] font-medium text-zinc-500 hover:text-zinc-300 py-1.5 rounded-b-md border border-t-0 border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/40 transition-colors"
                    >
                        {expanded ? (
                            <><ChevronUp size={13} aria-hidden /> Show fewer</>
                        ) : (
                            <><ChevronDown size={13} aria-hidden /> {moreGroups} more job{moreGroups === 1 ? '' : 's'}</>
                        )}
                    </button>
                )}
            </div>
        </section>
    );
}

function formatLineCost(sum) {
    if (!Number.isFinite(sum) || sum <= COST_EPS) return null;
    return formatMoneyUSD(sum);
}

function formatJobTotalCost(totalCost, totalSheets) {
    if (!totalSheets) return '—';
    if (!Number.isFinite(totalCost) || totalCost <= COST_EPS) return '—';
    return formatMoneyUSD(totalCost);
}

const BUCKET_ORDER = { used: 0, scheduled_use: 1, ordered: 2, on_hand: 3 };
const BUCKET_LABEL = {
    used: 'Used',
    scheduled_use: 'Sched',
    ordered: 'Due',
    on_hand: 'Stock',
};

/** Aggregate sheets / usage rows by PO with costing from inventory snapshots + logs. */
function buildJobEconomics(jobName, inventory, usageLog, materials) {
    const mats = materials || {};
    const jobKey = (jobName || '').trim().toUpperCase();
    const map = new Map();

    const addSheet = (bucket, sheet) => {
        if (!sheet?.materialType) return;
        const len = sheet.length;
        const mat = sheet.materialType;
        const k = `${bucket}|${mat}|${len}`;
        const prev = map.get(k) || { bucket, materialType: mat, length: len, qty: 0, costSum: 0 };
        prev.qty += 1;
        prev.costSum += calculateSheetCost({ ...sheet, width: sheet.width || 48 }, mats);
        map.set(k, prev);
    };

    (inventory || []).forEach((i) => {
        if ((i.job || '').trim().toUpperCase() !== jobKey) return;
        if (i.status === 'On Hand') addSheet('on_hand', i);
        else if (i.status === 'Ordered') addSheet('ordered', i);
    });

    (usageLog || []).forEach((log) => {
        if ((log.job || '').trim().toUpperCase() !== jobKey) return;
        const st = log.status || 'Completed';
        if (st === 'Archived') return;
        if (st === 'Scheduled') {
            (log.details || []).forEach((d) => addSheet('scheduled_use', d));
        } else if (st === 'Completed') {
            (log.details || []).forEach((d) => addSheet('used', d));
        }
    });

    const groups = [...map.values()]
        .sort((a, b) => {
            const bo = (BUCKET_ORDER[a.bucket] ?? 9) - (BUCKET_ORDER[b.bucket] ?? 9);
            if (bo !== 0) return bo;
            const mt = (a.materialType || '').localeCompare(b.materialType || '');
            if (mt !== 0) return mt;
            return (Number(a.length) || 0) - (Number(b.length) || 0);
        })
        .map((g) => ({
            ...g,
            key: `${g.bucket}|${g.materialType}|${g.length}`,
            bucketLabel: BUCKET_LABEL[g.bucket] || g.bucket,
        }));

    const totalSheets = groups.reduce((s, g) => s + g.qty, 0);
    const totalCost = groups.reduce((s, g) => s + g.costSum, 0);

    return { groups, totalSheets, totalCost };
}

function CompactEconomicsLines({ groups, dense = false }) {
    if (!groups?.length) {
        return <span className="text-zinc-500 text-[10px]">—</span>;
    }
    const sizeCls = dense ? 'text-[10px] leading-tight' : 'text-[11px] leading-snug';
    const tallList = !dense && groups.length > 8;
    const rowGrid =
        dense
            ? `${sizeCls} grid grid-cols-[2.75rem_2.125rem_minmax(0,1fr)_auto] gap-x-2 items-baseline py-px`
            : `${sizeCls} grid grid-cols-[3rem_2.5rem_minmax(0,1fr)_auto] gap-x-2.5 items-baseline`;
    return (
        <div
            className={`flex flex-col gap-1 ${tallList ? 'max-h-[min(40vh,14rem)] overflow-y-auto pr-1' : ''}`}
        >
            {groups.map((g) => {
                const desc = `${shortMat(g.materialType)} ${g.length}"`;
                return (
                    <div key={g.key} className={rowGrid}>
                        <span className="text-zinc-500 font-medium uppercase tracking-tight">{g.bucketLabel}</span>
                        <span className="font-mono text-zinc-200 tabular-nums text-right">{g.qty}×</span>
                        <span className="text-zinc-300 min-w-0 truncate" title={desc}>
                            {shortMat(g.materialType)}
                            <span className="text-zinc-500 font-normal"> {g.length}&quot;</span>
                        </span>
                        <span className="font-mono text-emerald-400/95 tabular-nums text-right whitespace-nowrap pl-1">
                            {formatLineCost(g.costSum) ?? <span className="text-zinc-600">—</span>}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function statusBadgeClass(status) {
    if (status === 'Scheduled') return 'bg-purple-500/25 text-purple-200';
    if (status === 'Completed') return 'bg-green-500/20 text-green-300';
    if (status === 'In Stock') return 'bg-blue-500/20 text-blue-300';
    return 'bg-zinc-600/40 text-zinc-300';
}

function rollupGroupEconomics(parts, inventory, usageLog, materials) {
    let totalSheets = 0;
    let totalCost = 0;
    for (const j of parts) {
        const e = buildJobEconomics(j.job, inventory, usageLog, materials);
        totalSheets += e.totalSheets;
        totalCost += e.totalCost;
    }
    return { totalSheets, totalCost };
}

/** Log-style rows grouped under each `JNNNN…` PO; part suffixes (`_EXT`) nest under a shared header row. */
function JobsGroupedLogTable({ groups, selectedJob, onSelectJob, showPartyColumn = false, inventory, usageLog, materials }) {
    if (!groups?.length) return null;

    const colSpan = showPartyColumn ? 5 : 4;

    const renderJobRow = (job, subgroupHeader, zebraIndex, extras = {}) => {
        const { topGroupSeparatorClass = '', partIndent = false } = extras;
        const parsed = parseJobPoParts(job.job);
        const lineTitle = subgroupHeader ? (parsed.partSuffix || job.job) : job.job;
        const selected = jobsSelectionMatches(selectedJob, job);
        const econ = buildJobEconomics(job.job, inventory, usageLog, materials);
        const zebra = zebraIndex % 2 === 1 && job.status !== 'Scheduled';

        const groupedBg = zebra ? 'bg-sky-950/40' : 'bg-sky-950/15';
        const standaloneBg = zebra ? 'bg-zinc-900/55' : 'bg-zinc-800/25';
        const rowBg = subgroupHeader ? groupedBg : standaloneBg;

        const totalCellBg = subgroupHeader ? 'bg-sky-950/35' : 'bg-zinc-900/30';

        return (
            <tr
                key={job.id}
                onClick={() => onSelectJob(job)}
                data-grouped={subgroupHeader ? 'true' : 'false'}
                className={`border-b border-zinc-700/80 cursor-pointer align-top transition-colors hover:bg-zinc-700/30 ${topGroupSeparatorClass} ${rowBg
                    } ${job.status === 'Scheduled' ? 'bg-purple-950/40' : ''} ${selected ? '!bg-blue-950/50 ring-1 ring-inset ring-blue-600/80' : ''}`}
            >
                <td
                    className={`px-3 py-2 whitespace-nowrap text-center tabular-nums align-middle ${partIndent ? 'border-l-[3px] border-l-sky-400/70' : ''
                        } ${!subgroupHeader ? 'border-l-[3px] border-l-zinc-500/90' : ''}`}
                >
                    <div className="inline-flex items-center gap-1 justify-center">
                        {job.status === 'Scheduled' && (
                            <CalendarClock size={12} className="text-purple-400 shrink-0" aria-hidden />
                        )}
                        <span>
                            {new Date(job.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })}
                        </span>
                    </div>
                </td>
                <td className="px-3 py-2 align-middle min-w-0">
                    <div className="flex flex-col gap-1 min-w-0">
                        <span className={`font-semibold truncate ${subgroupHeader ? 'text-blue-100 font-mono tracking-tight text-xs' : 'text-zinc-100'}`} title={job.job}>
                            {lineTitle}
                        </span>
                        {subgroupHeader && parsed.partSuffix && (
                            <span className="text-[9px] text-zinc-500 truncate tabular-nums" title={`Full PO: ${job.job}`}>{job.job}</span>
                        )}
                        <span className={`text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-md w-fit leading-none ${statusBadgeClass(job.status)}`}>
                            {job.status}
                        </span>
                    </div>
                </td>
                {showPartyColumn && (
                    <td className="px-3 py-2 align-middle text-zinc-400 truncate text-[10px]" title={(job.supplier || job.customer || '').trim()}>
                        {(job.supplier || job.customer || '—').trim()}
                    </td>
                )}
                <td className="px-3 py-2 align-middle min-w-0">
                    <CompactEconomicsLines groups={econ.groups} dense />
                </td>
                <td className={`px-3 py-2 align-middle border-l border-zinc-700/80 ${totalCellBg}`}>
                    <div className="flex flex-col items-end justify-center gap-0.5 min-h-[2.25rem]">
                        <span className="font-mono font-semibold text-emerald-400 tabular-nums text-xs leading-none">
                            {formatJobTotalCost(econ.totalCost, econ.totalSheets)}
                        </span>
                        {econ.totalSheets > 0 && (
                            <span className="text-[10px] text-zinc-500 tabular-nums leading-none">
                                {econ.totalSheets}sh
                            </span>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="w-full min-w-0 overflow-x-auto align-top rounded-md border border-zinc-700 bg-zinc-800">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-700/80 bg-zinc-900/50">
                <span className="inline-flex items-center gap-1.5 font-medium text-sky-300/90">
                    <Layers size={12} className="text-sky-400 shrink-0" aria-hidden />
                    <span>Job</span>
                    <span className="font-normal text-zinc-500">— one job #, multiple parts</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                    <Minus size={12} className="text-zinc-500 shrink-0" aria-hidden />
                    <span>Single line</span>
                    <span className="text-zinc-500">— one row, no part split</span>
                </span>
            </div>
            <table className="w-full text-[11px] border-collapse table-fixed min-w-[32rem]">
                <colgroup>
                    <col className="w-[5.25rem]" />
                    <col className="w-[26%]" />
                    {showPartyColumn && <col className="w-[16%]" />}
                    <col />
                    <col className="w-[7rem]" />
                </colgroup>
                <thead>
                    <tr className="bg-zinc-900/90 border-b border-zinc-600/80 text-[10px] uppercase tracking-wider text-zinc-400">
                        <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Date</th>
                        <th className="px-3 py-2 font-semibold text-left whitespace-nowrap">Part / job</th>
                        {showPartyColumn && (
                            <th className="px-3 py-2 font-semibold text-left truncate">Supplier</th>
                        )}
                        <th className="px-3 py-2 font-semibold text-left">
                            Sheets <span className="hidden sm:inline font-normal normal-case text-zinc-500">(status · qty · material · cost)</span>
                        </th>
                        <th className="px-3 py-2 font-semibold text-right whitespace-nowrap border-l border-zinc-700/80">Total</th>
                    </tr>
                </thead>
                {groups.map((group, groupIndex) => {
                    let zebraIndex = 0;
                    const subgroupHeader = jobGroupNeedsSubheader(group);
                    const rollup = subgroupHeader ? rollupGroupEconomics(group.parts, inventory, usageLog, materials) : null;
                    const showRollupFigures = rollup && rollup.totalSheets > 0;
                    const betweenGroupsCls = groupIndex > 0 ? 'border-t-2 border-t-zinc-500/95' : '';
                    /** Visually tuck part rows under the master job banner so the next unrelated `Jxxxx` reads as its own block. */
                    const partIndent = subgroupHeader;
                    const tbodyGroupedCls = subgroupHeader
                        ? 'bg-gradient-to-b from-sky-950/35 via-sky-950/12 to-zinc-900/30 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22)]'
                        : 'bg-zinc-900/25 shadow-[inset_3px_0_0_0_rgba(113,113,122,0.65)]';

                    return (
                        <tbody key={group.baseKey} className={`text-zinc-300 ${tbodyGroupedCls}`}>
                            {subgroupHeader && (
                                <tr className={`bg-gradient-to-r from-sky-950/80 to-zinc-900/90 border-y border-sky-700/40 ${betweenGroupsCls}`}>
                                    <td colSpan={colSpan} className="px-3 py-2">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/15 border border-sky-500/35 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-200">
                                                <Layers size={12} className="text-sky-400" aria-hidden />
                                                Job
                                            </span>
                                            <span className="text-xs font-bold text-white tracking-wide font-mono">{group.displayBase}</span>
                                            <span className="text-[10px] uppercase tracking-wide text-sky-200/70">{group.parts.length} part{group.parts.length === 1 ? '' : 's'}</span>
                                            {showRollupFigures && (
                                                <span className="text-[10px] tabular-nums text-zinc-300">
                                                    <span className="font-mono text-emerald-400">{formatJobTotalCost(rollup.totalCost, rollup.totalSheets)}</span>
                                                    <span className="text-zinc-500 mx-1">·</span>
                                                    <span>{rollup.totalSheets}sh</span>
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {group.parts.map((job, partIndex) => {
                                const row = renderJobRow(job, subgroupHeader, zebraIndex, {
                                    partIndent,
                                    topGroupSeparatorClass: !subgroupHeader && partIndex === 0 ? betweenGroupsCls : '',
                                });
                                zebraIndex += 1;
                                return row;
                            })}
                        </tbody>
                    );
                })}
            </table>
        </div>
    );
}

const JobDetails = ({ job, inventory, usageLog, materials }) => {
    const econ = useMemo(
        () => buildJobEconomics(job.job, inventory, usageLog, materials),
        [job.job, inventory, usageLog, materials]
    );

    const statusBadge =
        job.status === 'Scheduled'
            ? 'bg-purple-500/25 text-purple-200'
            : job.status === 'Completed'
                ? 'bg-green-500/20 text-green-300'
                : job.status === 'In Stock'
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-zinc-600/40 text-zinc-300';

    return (
        <div className="p-3 md:p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-700 pb-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{job.job}</h3>
                        {job.status === 'Scheduled' && <CalendarClock size={18} className="text-purple-400 shrink-0" aria-hidden />}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusBadge}`}>{job.status}</span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-0.5">{(job.customer || job.supplier || '').trim() || '—'}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Last activity: {new Date(job.date).toLocaleDateString()}</p>
                </div>
            </div>

            {econ.groups.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-6 border border-zinc-700 rounded-lg bg-zinc-900/30">
                    No sheets or usage rows tied to this PO yet.
                </p>
            ) : (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
                    <CompactEconomicsLines groups={econ.groups} />
                    <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-zinc-700 text-sm">
                        <span className="text-zinc-400">
                            Total ({econ.totalSheets} sheet{econ.totalSheets === 1 ? '' : 's'})
                        </span>
                        <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                            {formatJobTotalCost(econ.totalCost, econ.totalSheets)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

const OTHER_JOBS_SECTION_KEY = '__other_jobs__';

export const JobOverviewView = ({
    allJobs,
    inventory,
    usageLog,
    materials,
    initialSelectedJob,
    onClearSelectedJob,
    searchQuery,
}) => {
    const [selectedJob, setSelectedJob] = useState(null);
    const [expandedCustomerSections, setExpandedCustomerSections] = useState(() => new Set());

    const toggleCustomerSection = useCallback((key) => {
        setExpandedCustomerSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const { customerGroups, orphanJobs } = useMemo(
        () => buildCustomerJobGroups(usageLog, allJobs),
        [usageLog, allJobs]
    );

    useEffect(() => {
        if (initialSelectedJob) {
            setSelectedJob(initialSelectedJob);
            onClearSelectedJob?.();
        }
    }, [initialSelectedJob, onClearSelectedJob]);

    const filteredCustomerGroups = useMemo(() => {
        if (!searchQuery?.trim()) return customerGroups;
        const q = searchQuery.trim().toLowerCase();
        return customerGroups
            .map(section => {
                const custMatch = section.customer.toLowerCase().includes(q);
                const jobs = custMatch ? section.jobs : section.jobs.filter(j => j.job.toLowerCase().includes(q));
                return { ...section, jobs };
            })
            .filter(section => section.jobs.length > 0 || section.customer.toLowerCase().includes(q));
    }, [customerGroups, searchQuery]);

    const filteredOrphanJobs = useMemo(() => {
        const q = (searchQuery || '').trim().toLowerCase();
        let jobs = orphanJobs;
        if (q) {
            jobs = jobs.filter(j =>
                j.job.toLowerCase().includes(q) ||
                (j.customer || j.supplier || '').toLowerCase().includes(q)
            );
        }
        return jobs;
    }, [orphanJobs, searchQuery]);

    useEffect(() => {
        if (!selectedJob) return;
        const inGrouped = filteredCustomerGroups.some(g =>
            g.jobs.some(j => jobsSelectionMatches(selectedJob, j))
        );
        const inOrphan = filteredOrphanJobs.some(j => jobsSelectionMatches(selectedJob, j));
        if (!inGrouped && !inOrphan) {
            setSelectedJob(null);
        }
    }, [filteredCustomerGroups, filteredOrphanJobs, selectedJob]);

    return (
        <div className="space-y-3">
            {selectedJob && (
                <div className="bg-zinc-800 rounded-lg border border-zinc-700 shadow-lg">
                    <JobDetails job={selectedJob} inventory={inventory} usageLog={usageLog} materials={materials} />
                </div>
            )}

            <div className="flex flex-wrap gap-6 items-stretch justify-start">
                {filteredCustomerGroups.length === 0 && filteredOrphanJobs.length === 0 && (
                    <p className="text-zinc-500 py-6 text-sm w-full text-center">
                        No jobs match your search. Use Stock with a customer name to populate customer groups here.
                    </p>
                )}

                {filteredCustomerGroups.map((section) => (
                    <CustomerJobsSection
                        key={section.customerKey}
                        sectionKey={section.customerKey}
                        heading={section.customer}
                        headingAside={undefined}
                        jobs={section.jobs}
                        expanded={expandedCustomerSections.has(section.customerKey)}
                        onToggleExpanded={toggleCustomerSection}
                        selectedJob={selectedJob}
                        onSelectJob={setSelectedJob}
                        showPartyColumn={false}
                        inventory={inventory}
                        usageLog={usageLog}
                        materials={materials}
                    />
                ))}

                {filteredOrphanJobs.length > 0 && (
                    <CustomerJobsSection
                        sectionKey={OTHER_JOBS_SECTION_KEY}
                        heading="Other jobs"
                        headingAside="POs without a usage-log customer yet"
                        jobs={filteredOrphanJobs}
                        expanded={expandedCustomerSections.has(OTHER_JOBS_SECTION_KEY)}
                        onToggleExpanded={toggleCustomerSection}
                        selectedJob={selectedJob}
                        onSelectJob={setSelectedJob}
                        showPartyColumn
                        inventory={inventory}
                        usageLog={usageLog}
                        materials={materials}
                    />
                )}
            </div>
        </div>
    );
};
