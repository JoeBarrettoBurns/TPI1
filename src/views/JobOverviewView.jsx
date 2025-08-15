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

const JobDetails = ({ job }) => {
    // Aggregate counts by material -> length -> status
    const aggregated = useMemo(() => {
        const byMaterial = {};
        for (const materialType in job.materials) {
            const byLength = {};
            job.materials[materialType].forEach((sheet) => {
                const len = sheet.length;
                if (!byLength[len]) {
                    byLength[len] = { Used: 0, Other: 0 };
                }
                if ((sheet.status || '').toLowerCase() === 'used') {
                    byLength[len].Used += 1;
                } else {
                    byLength[len].Other += 1; // treat non-Used as available/other
                }
            });
            byMaterial[materialType] = byLength;
        }
        return byMaterial;
    }, [job.materials]);

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

                    {/* Rows: material label on the left, visualizers per size on the right */}
                    <div className="mt-2 grid grid-cols-[140px,repeat(3,minmax(0,1fr))] gap-3">
                        {Object.entries(aggregated).map(([materialType, byLength]) => (
                            <React.Fragment key={materialType}>
                                <div className="flex items-center justify-start">
                                    <span className="font-semibold text-blue-400">{materialType}</span>
                                </div>
                                {STANDARD_LENGTHS.map((len) => {
                                    const counts = byLength[len] || { Used: 0, Other: 0 };
                                    const total = (counts.Other || 0) + (counts.Used || 0);
                                    const blocks = [
                                        ...Array.from({ length: counts.Other }, (_, i) => ({ key: `o-${i}`, color: 'bg-green-500/70' })),
                                        ...Array.from({ length: counts.Used }, (_, i) => ({ key: `u-${i}`, color: 'bg-red-500/70' })),
                                    ];
                                    return (
                                        <div key={`${materialType}-${len}`} className="p-2 rounded border border-zinc-700 bg-zinc-800/40 min-h-[40px]">
                                            <div className="flex items-center flex-wrap gap-1">
                                                {blocks.map((b) => (
                                                    <div key={b.key} className={`${b.color} h-3 w-4 rounded-sm`} />
                                                ))}
                                                <span className="ml-2 text-xs font-mono text-zinc-300">{total}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
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
                        <JobDetails job={selectedJob} />
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