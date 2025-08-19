// src/components/logs/OutgoingLogDisplay.jsx

import React, { useMemo } from 'react';
import { Edit, Trash2, CalendarClock, Truck } from 'lucide-react';

// Helper function to generate a detailed description with shortened names
const generateDescription = (details) => {
    if (!Array.isArray(details) || details.length === 0) {
        return 'No item details';
    }

    const materialCounts = details.reduce((acc, item) => {
        const type = item.materialType || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    return Object.entries(materialCounts).map(([type, count]) => {
        const shortType = type.replace('GALV', 'Galv').replace('ALUM', 'Al');
        return `${count}x ${shortType}`;
    }).join(', ');
};

export const OutgoingLogDisplay = ({ usageLog, onRowClick, onDelete, onEdit, onFulfillLog, ordersToShow }) => {
    const outgoingItems = useMemo(() => {
        return usageLog
            .filter(item => {
                const job = item.job || '';
                const isModification = job.startsWith('MODIFICATION');
                // Hide all modification entries from UI; they are server-side only
                if (isModification) return false;
                return !!item.customer;
            })
            .map(item => ({
                ...item,
                isDeletable: true,
                isAddition: false,
                displayQty: item.qty,
                description: generateDescription(item.details),
                customer: item.customer || 'N/A'
            }))
            .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));
    }, [usageLog]);

    const visibleItems = outgoingItems.slice(0, ordersToShow);

    if (visibleItems.length === 0) {
        return <p className="text-center text-zinc-400 py-8">No outgoing stock logged.</p>;
    }

    return (
        <div className="overflow-x-auto mt-6 bg-zinc-800 rounded-xl shadow-sm border border-zinc-700">
            <table className="w-full text-left table-auto">
                <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-700">
                        <th className="p-4 font-semibold text-zinc-400">DATE</th>
                        <th className="p-4 font-semibold text-zinc-400">JOB #</th>
                        <th className="p-4 font-semibold text-zinc-400">CUSTOMER</th>
                        <th className="p-4 font-semibold text-zinc-400">DESCRIPTION</th>
                        <th className="p-4 font-semibold text-zinc-400 text-right">QTY</th>
                        <th className="p-4 font-semibold text-zinc-400 text-center">ACTIONS</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleItems.map(item => (
                        <tr
                            key={item.id}
                            onClick={() => onRowClick(item)}
                            className={`border-b border-zinc-700 hover:bg-zinc-700/50 cursor-pointer ${item.status === 'Scheduled' ? 'bg-purple-900/30' : ''
                                }`}
                        >
                            <td className="p-4 truncate text-zinc-300">
                                <div className="flex items-center gap-2">
                                    {item.status === 'Scheduled' && <CalendarClock size={16} className="text-purple-400 shrink-0" title="Scheduled" />}
                                    <span>{new Date(item.usedAt || item.createdAt).toLocaleString()}</span>
                                </div>
                            </td>
                            <td className="p-4 truncate text-zinc-300">{item.job}</td>
                            <td className="p-4 truncate text-zinc-300">{item.customer}</td>
                            <td className="p-4 text-zinc-300 whitespace-normal break-words">{item.description}</td>
                            <td className="p-4 text-red-400 font-mono text-right">{item.displayQty}</td>
                            <td className="p-4 text-center">
                                {item.status === 'Scheduled' && (
                                    <button title="Fulfill Scheduled Usage" onClick={(e) => { e.stopPropagation(); onFulfillLog(item); }} className="text-purple-400 hover:text-purple-300 mr-2"><Truck size={16} /></button>
                                )}
                                {item.isDeletable && (
                                    <>
                                        <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="text-blue-500 hover:text-blue-400 mr-2"><Edit size={16} /></button>
                                        <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};