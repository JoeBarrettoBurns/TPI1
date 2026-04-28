// src/components/logs/IncomingLogDisplay.jsx

import React, { useMemo } from 'react';
import { Edit, Trash2, Truck } from 'lucide-react';
import { LogItemSummary } from './LogItemSummary';

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
        const shortType = type
            .replace('GALV', 'Galv')
            .replace('ALUM', 'Al');
        return `${count}x ${shortType}`;
    }).join(', ');
};

export const IncomingLogDisplay = ({ incomingItems, materials, onRowClick, onDelete, onEdit, onReceiveOrder, ordersToShow }) => {
    const processedItems = useMemo(() => {
        return incomingItems.map(item => {
            const displayDetails = item.displayDetails || item.details || [];
            const latestIncomingDate = item.isFuture
                ? displayDetails.reduce(
                    (latest, curr) => !latest || (curr.arrivalDate && new Date(curr.arrivalDate) > new Date(latest)) ? curr.arrivalDate : latest,
                    null
                )
                : displayDetails.reduce(
                    (latest, curr) => !latest || (curr.dateReceived && new Date(curr.dateReceived) > new Date(latest)) ? curr.dateReceived : latest,
                    null
                );

            return {
                ...item,
                displayDetails,
                description: generateDescription(displayDetails),
                dateOrdered: item.date,
                customer: item.supplier,
                qty: displayDetails.length,
                isDeletable: (item.details || []).length > 0,
                dateIncoming: latestIncomingDate,
            };
        });
    }, [incomingItems]);

    const visibleItems = processedItems.slice(0, ordersToShow);

    if (visibleItems.length === 0) {
        return <p className="text-center text-zinc-400 py-8">No incoming stock logged.</p>;
    }

    return (
        <div className="overflow-x-auto mt-6 bg-zinc-800 rounded-xl shadow-sm border border-zinc-700">
            <table className="w-full text-left table-auto">
                <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-700">
                        <th className="px-3 py-4 font-semibold text-zinc-400">ORDER</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400">SUPPLIER</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 w-full">DESCRIPTION</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 whitespace-nowrap">DATE ORDERED</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 whitespace-nowrap">DATE INCOMING</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-right">QTY</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-center whitespace-nowrap w-24">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleItems.map(item => (
                        <tr key={item.id} onClick={() => onRowClick(item)} className={`border-b border-zinc-700 hover:bg-zinc-700/50 cursor-pointer ${item.isFuture ? 'bg-yellow-900/20' : ''}`}>
                            <td className="px-3 py-2 truncate text-zinc-300">{item.job}</td>
                            <td className="px-3 py-2 truncate text-zinc-300">{item.customer}</td>
                            <td className="px-3 py-2 text-zinc-300 w-full">
                                <LogItemSummary details={item.displayDetails} materials={materials} tone="incoming" />
                            </td>
                            <td className="px-3 py-2 truncate text-zinc-300 whitespace-nowrap">{new Date(item.dateOrdered).toLocaleDateString()}</td>
                            <td className="px-3 py-2 truncate text-zinc-300 whitespace-nowrap">
                                {item.dateIncoming ? new Date(item.dateIncoming).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-3 py-2 text-green-400 font-mono text-right">+{item.qty}</td>
                            <td className="px-3 py-2 text-center whitespace-nowrap w-24">
                                {item.isFuture && (item.details || []).length > 0 && (
                                    <button title="Receive Order" onClick={(e) => { e.stopPropagation(); onReceiveOrder(item); }} className="inline-flex align-middle text-green-500 hover:text-green-400 mr-2"><Truck size={16} /></button>
                                )}
                                {item.isDeletable && (
                                    <>
                                        <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="inline-flex align-middle text-blue-500 hover:text-blue-400 mr-2"><Edit size={16} /></button>
                                        <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="inline-flex align-middle text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
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