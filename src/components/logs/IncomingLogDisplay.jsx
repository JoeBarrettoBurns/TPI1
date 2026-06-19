// src/components/logs/IncomingLogDisplay.jsx

import React, { useMemo } from 'react';
import { Edit, Trash2, Truck } from 'lucide-react';
import { groupDetailsByMaterial, orderLengthLabels } from './LogItemSummary';
import { AuditTag } from '../common/AuditTag';

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
                materialRows: groupDetailsByMaterial(displayDetails),
                dateOrdered: item.date,
                customer: item.supplier,
                qty: displayDetails.length,
                isEditable: (item.details || []).length > 0,
                isDeletable: (item.details || []).length > 0,
                dateIncoming: latestIncomingDate,
            };
        });
    }, [incomingItems]);

    const visibleItems = processedItems.slice(0, ordersToShow);

    // One shared set of length columns for the whole table (like the Categories view).
    const lengthColumns = useMemo(() => {
        const labels = [];
        visibleItems.forEach(item => item.materialRows.forEach(row => labels.push(...Object.keys(row.counts))));
        return orderLengthLabels(labels);
    }, [visibleItems]);

    if (visibleItems.length === 0) {
        return <p className="text-center text-zinc-400 py-8">No incoming stock logged.</p>;
    }

    return (
        <div className="overflow-x-auto mt-6 bg-zinc-800 rounded-xl shadow-sm border border-zinc-700">
            <table className="w-full text-center table-auto">
                <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-700">
                        <th className="px-3 py-4 font-semibold text-zinc-400">SUPPLIER</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-left">MATERIAL</th>
                        {lengthColumns.map(label => (
                            <th key={label} className="px-3 py-4 font-semibold text-zinc-400 text-center whitespace-nowrap">
                                {label === 'N/A' ? 'N/A' : `${label}x48"`}
                            </th>
                        ))}
                        <th className="px-3 py-4 font-semibold text-zinc-400 whitespace-nowrap">DATE ORDERED</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 whitespace-nowrap">DATE INCOMING</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-center">QTY</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-center whitespace-nowrap w-24">Actions</th>
                    </tr>
                </thead>
                {visibleItems.map((item, orderIdx) => {
                    const rows = item.materialRows.length > 0
                        ? item.materialRows
                        : [{ materialType: 'No item details', counts: {} }];
                    const span = rows.length;
                    const rowBg = item.isFuture ? 'bg-yellow-900/20' : '';

                    return (
                        <tbody key={item.id} className="group">
                            {orderIdx === 0 && (
                                <tr aria-hidden="true">
                                    <td colSpan={99} className="p-0"><div className="h-3" /></td>
                                </tr>
                            )}
                            {rows.map((row, idx) => (
                                <tr
                                    key={`${item.id}-${row.materialType}`}
                                    onClick={() => onRowClick(item)}
                                    className={`border-b border-zinc-700 cursor-pointer group-hover:bg-zinc-700/50 ${rowBg}`}
                                >
                                    {idx === 0 && (
                                        <td rowSpan={span} className="px-3 py-2 align-top text-zinc-300">{item.customer}</td>
                                    )}
                                    <td className="px-3 py-2 text-left text-zinc-200 font-medium whitespace-nowrap">{row.materialType}</td>
                                    {lengthColumns.map(label => {
                                        const qty = row.counts[label] || 0;
                                        return (
                                            <td key={label} className={`px-3 py-2 text-center font-mono ${qty ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                {qty || ''}
                                            </td>
                                        );
                                    })}
                                    {idx === 0 && (
                                        <>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-zinc-300 whitespace-nowrap">
                                                <div>{new Date(item.dateOrdered).toLocaleDateString()}</div>
                                                <div className="mt-1 flex justify-center">
                                                    <AuditTag createdBy={item.createdBy} lastEditedBy={item.lastEditedBy} />
                                                </div>
                                            </td>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-zinc-300 whitespace-nowrap">
                                                {item.dateIncoming ? new Date(item.dateIncoming).toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-green-400 font-mono text-center">+{item.qty}</td>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-center whitespace-nowrap w-24">
                                                {item.isFuture && (item.details || []).length > 0 && (
                                                    <button title="Receive Order" onClick={(e) => { e.stopPropagation(); onReceiveOrder(item); }} className="inline-flex align-middle text-green-500 hover:text-green-400 mr-2"><Truck size={16} /></button>
                                                )}
                                                {item.isEditable && (
                                                    <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="inline-flex align-middle text-blue-500 hover:text-blue-400 mr-2"><Edit size={16} /></button>
                                                )}
                                                {item.isDeletable && (
                                                    <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="inline-flex align-middle text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                                                )}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                            <tr aria-hidden="true">
                                <td colSpan={99} className="p-0"><div className="h-3" /></td>
                            </tr>
                        </tbody>
                    );
                })}
            </table>
        </div>
    );
};
