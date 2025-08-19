// src/views/JobOverviewView.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { STANDARD_LENGTHS } from '../constants/materials';

const JobCard = ({ job, onSelectJob, isSelected }) => (
    <div
        className={`p-4 rounded-lg border cursor-pointer transition-colors ${isSelected
            ? 'bg-blue-800 border-blue-600 ring-2 ring-blue-500'
            : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
            }`}
        onClick={() => onSelectJob(job)}
    >
        <div className="flex justify-between items-center">
            <span className="font-bold text-white truncate">{job.job}</span>
            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${job.status === 'Completed' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'}`}>
                {job.status}
            </span>
        </div>
        <p className="text-sm text-zinc-400 truncate">{job.customer || job.supplier}</p>
        <p className="text-xs text-zinc-500 mt-2">{new Date(job.date).toLocaleDateString()}</p>
    </div>
);

const JobDetails = ({ job, inventory, usageLog }) => {
    // Aggregate counts by material -> length for sheets CURRENTLY On Hand for this job
    const aggregated = useMemo(() => {
        const byMaterial = {};
        // Start from job history to ensure material rows exist
        for (const materialType in (job.materials || {})) {
            byMaterial[materialType] = { 96: 0, 120: 0, 144: 0 };
        }
        const jobKey = (job.job || '').trim().toUpperCase();
        (inventory || [])
            .filter(i => ((i.job || '').trim().toUpperCase() === jobKey) && i.status === 'On Hand')
            .forEach(i => {
                if (!byMaterial[i.materialType]) byMaterial[i.materialType] = { 96: 0, 120: 0, 144: 0 };
                if (STANDARD_LENGTHS.includes(i.length)) {
                    byMaterial[i.materialType][i.length] = (byMaterial[i.materialType][i.length] || 0) + 1;
                }
            });
        return byMaterial;
    }, [inventory, job.job, job.materials]);

    const neutralClasses = 'bg-zinc-800/40 border-zinc-700 text-zinc-300';
    const positiveClasses = 'bg-green-900/30 border-green-700 text-green-100';
    const dangerClasses = 'bg-red-900/40 border-red-700 text-red-100';

    // Scheduled Incoming (yellow)
    const scheduledIncoming = useMemo(() => {
        const byMaterial = {};
        const jobKey = (job.job || '').trim().toUpperCase();
        (inventory || [])
            .filter(i => ((i.job || '').trim().toUpperCase() === jobKey) && i.status === 'Ordered')
            .forEach(i => {
                if (!byMaterial[i.materialType]) byMaterial[i.materialType] = {};
                if (STANDARD_LENGTHS.includes(i.length)) {
                    byMaterial[i.materialType][i.length] = (byMaterial[i.materialType][i.length] || 0) + 1;
                }
            });
        return byMaterial;
    }, [inventory, job.job]);

    // Scheduled Outgoing (purple)
    const scheduledOutgoing = useMemo(() => {
        const byMaterial = {};
        const jobKey = (job.job || '').trim().toUpperCase();
        (usageLog || [])
            .filter(log => ((log.job || '').trim().toUpperCase() === jobKey) && (log.status || '') === 'Scheduled')
            .forEach(log => {
                (log.details || []).forEach(d => {
                    if (!byMaterial[d.materialType]) byMaterial[d.materialType] = {};
                    if (STANDARD_LENGTHS.includes(d.length)) {
                        byMaterial[d.materialType][d.length] = (byMaterial[d.materialType][d.length] || 0) + 1;
                    }
                });
            });
        return byMaterial;
    }, [usageLog, job.job]);

    // Completed usage counts (for showing red negative usage when no on-hand exists)
    const completedUsage = useMemo(() => {
        const byMaterial = {};
        const jobKey = (job.job || '').trim().toUpperCase();
        (usageLog || [])
            .filter(log => ((log.job || '').trim().toUpperCase() === jobKey) && (log.status || 'Completed') === 'Completed')
            .forEach(log => {
                (log.details || []).forEach(d => {
                    if (!byMaterial[d.materialType]) byMaterial[d.materialType] = {};
                    if (STANDARD_LENGTHS.includes(d.length)) {
                        byMaterial[d.materialType][d.length] = (byMaterial[d.materialType][d.length] || 0) + 1;
                    }
                });
            });
        return byMaterial;
    }, [usageLog, job.job]);

    const allMaterialKeys = useMemo(() => {
        const fallback = Object.keys(job.materials || {});
        return Array.from(new Set([
            ...Object.keys(aggregated || {}),
            ...Object.keys(scheduledIncoming || {}),
            ...Object.keys(scheduledOutgoing || {}),
            ...Object.keys(completedUsage || {}),
            ...fallback,
        ]));
    }, [aggregated, scheduledIncoming, scheduledOutgoing, completedUsage, job.materials]);

    return (
        <div className="p-6">
            <div className="pb-4 border-b border-zinc-700 mb-4">
                <h3 className="text-2xl font-bold text-white">{job.job}</h3>
                <p className="text-lg text-zinc-400">{job.customer || job.supplier}</p>
                <p className="text-sm text-zinc-500">{new Date(job.date).toLocaleDateString()}</p>
            </div>

            <div className="max-h-[40vh] overflow-y-auto pr-2">
                <div className="bg-zinc-900/50 p-3 rounded-lg">
                    {/* Column headers (sizes) shown once at the top */}
                    <div className="grid grid-cols-[140px,repeat(3,minmax(0,1fr))] gap-3 text-xs text-zinc-400 px-1 select-none">
                        <div></div>
                        {STANDARD_LENGTHS.map((len) => (
                            <div key={len} className="text-center font-mono">{len}" x 48"</div>
                        ))}
                    </div>

                    {/* Rows: material label on the left, large numeric totals per size on the right */}
                    <div className="mt-2 grid grid-cols-[140px,repeat(3,minmax(0,1fr))] gap-3">
                        {allMaterialKeys.map((materialType) => {
                            const byLength = aggregated[materialType] || {};
                            return (
                                <React.Fragment key={materialType}>
                                    <div className="flex items-center justify-start">
                                        <span className="font-semibold text-blue-400">{materialType}</span>
                                    </div>
                                    {STANDARD_LENGTHS.map((len) => {
                                        const onHand = (byLength[len] || 0);
                                        const scheduledOut = scheduledOutgoing[materialType]?.[len] || 0;
                                        const scheduledIn = scheduledIncoming[materialType]?.[len] || 0;
                                        const usedCompleted = completedUsage[materialType]?.[len] || 0;
                                        const hasDeficit = (onHand + scheduledIn) - scheduledOut < 0;
                                        const showUsageOnly = onHand === 0 && usedCompleted > 0;
                                        const cellColorClasses = showUsageOnly
                                            ? dangerClasses
                                            : (onHand === 0 ? (hasDeficit ? dangerClasses : neutralClasses) : positiveClasses);
                                        return (
                                            <div key={`${materialType}-${len}`} className={`p-2 rounded border min-h-[64px] flex flex-col items-center justify-center gap-1 ${cellColorClasses}`}>
                                                <span className="text-3xl md:text-4xl font-extrabold leading-none">{showUsageOnly ? `-${usedCompleted}` : onHand}</span>
                                                {(scheduledIn > 0 || scheduledOut > 0) && (
                                                    <div className="flex gap-2 text-xs">
                                                        {scheduledIn > 0 && (
                                                            <span className="px-1 rounded bg-yellow-900/40 text-yellow-200 border border-yellow-700">+{scheduledIn}</span>
                                                        )}
                                                        {scheduledOut > 0 && (
                                                            <span className="px-1 rounded bg-purple-900/40 text-purple-200 border border-purple-700">-{scheduledOut}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};


export const JobOverviewView = ({ allJobs, inventory, usageLog, materials, suppliers, handleAddOrEditOrder, handleUseStock, searchQuery, initialSelectedJob, onClearSelectedJob }) => {
    const [selectedJob, setSelectedJob] = useState(null);

    useEffect(() => {
        if (initialSelectedJob) {
            setSelectedJob(initialSelectedJob);
            onClearSelectedJob();
        }
    }, [initialSelectedJob, onClearSelectedJob]);

    const filteredJobs = useMemo(() => {
        if (!searchQuery) return allJobs;
        const lowercasedQuery = (searchQuery || '').toLowerCase();
        return allJobs.filter(job =>
            job.job.toLowerCase().includes(lowercasedQuery) ||
            (job.customer || job.supplier || '').toLowerCase().includes(lowercasedQuery)
        );
    }, [allJobs, searchQuery]);

    useEffect(() => {
        if (selectedJob && !filteredJobs.find(job => job.id === selectedJob.id)) {
            setSelectedJob(null);
        }
    }, [filteredJobs, selectedJob]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="xl:col-span-2 space-y-8">
                <div className="bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 min-h-[200px]">
                    {selectedJob ? (
                        <JobDetails job={selectedJob} inventory={inventory} usageLog={usageLog} />
                    ) : (
                        <div className="p-6 h-full flex items-center justify-center">
                            <p className="text-zinc-400">Select a job from the list below to view details</p>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredJobs.slice(0, 6).map(job => (
                        <JobCard key={job.id} job={job} onSelectJob={setSelectedJob} isSelected={selectedJob?.id === job.id} />
                    ))}
                </div>
            </div>

        </div>
    );
};