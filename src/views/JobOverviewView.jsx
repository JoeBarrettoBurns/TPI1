// src/views/JobOverviewView.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { AddStockForm } from '../components/jobs/AddStockForm';
import { UseStockForm } from '../components/jobs/UseStockForm'; // New import

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
    // Group sheets by size and status
    const groupedMaterials = useMemo(() => {
        const materials = {};
        for (const matType in job.materials) {
            const sizeGroups = {};
            job.materials[matType].forEach(sheet => {
                const key = `${sheet.length}x${sheet.width || 48}-${sheet.status}`;
                if (!sizeGroups[key]) {
                    sizeGroups[key] = {
                        length: sheet.length,
                        width: sheet.width || 48,
                        status: sheet.status,
                        count: 0,
                    };
                }
                sizeGroups[key].count += 1;
            });
            materials[matType] = Object.values(sizeGroups).sort((a, b) => a.length - b.length);
        }
        return materials;
    }, [job.materials]);

    return (
        <div className="p-6">
            <div className="pb-4 border-b border-zinc-700 mb-4">
                <h3 className="text-2xl font-bold text-white">{job.job}</h3>
                <p className="text-lg text-zinc-400">{job.customer || job.supplier}</p>
                <p className="text-sm text-zinc-500">{new Date(job.date).toLocaleDateString()}</p>
            </div>

            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                {Object.entries(groupedMaterials).map(([materialType, sizeGroups]) => (
                    <div key={materialType} className="bg-zinc-900/50 p-3 rounded-lg">
                        <p className="font-semibold text-blue-400">{materialType}</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                            {sizeGroups.map(group => (
                                <div key={`${group.length}x${group.width}-${group.status}`} className={`p-2 rounded text-center text-sm ${group.status === 'Used' ? 'bg-zinc-700/50 text-zinc-400' : 'bg-green-900/50 text-green-300'}`}>
                                    <p className="font-mono font-bold">{group.count}x <span className="font-normal">{group.length}" x {group.width}"</span></p>
                                    <p className="text-xs opacity-75">{group.status}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
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
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
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
                    {filteredJobs.map(job => (
                        <JobCard key={job.id} job={job} onSelectJob={setSelectedJob} isSelected={selectedJob?.id === job.id} />
                    ))}
                </div>
            </div>

            <div className="bg-zinc-800 rounded-lg shadow-lg p-6 border border-zinc-700 h-fit sticky top-8">
                <h3 className="text-2xl font-bold text-white mb-4">Add New Stock / PO</h3>
                <AddStockForm
                    materialTypes={Object.keys(materials)}
                    suppliers={suppliers}
                    onSave={handleAddOrEditOrder}
                />
            </div>

            <div className="bg-zinc-800 rounded-lg shadow-lg p-6 border border-zinc-700 h-fit sticky top-8">
                <h3 className="text-2xl font-bold text-white mb-4">Use Stock</h3>
                <UseStockForm
                    onSave={handleUseStock}
                    inventory={inventory}
                    materialTypes={Object.keys(materials)}
                />
            </div>
        </div>
    );
};