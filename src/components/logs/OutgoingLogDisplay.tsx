// src/components/logs/OutgoingLogDisplay.tsx

import React, { useMemo } from 'react';
import { Edit, Trash2, CalendarClock, Truck } from 'lucide-react';
import { groupDetailsByMaterial, orderLengthLabels } from './LogItemSummary';
import { AuditTag } from '../common/AuditTag';

export const OutgoingLogDisplay = ({ usageLog, materials, onRowClick, onDelete, onEdit, onFulfillLog, ordersToShow }: any) => {
    const outgoingItems = useMemo(() => {
        return usageLog
            .filter((item: any) => {
                return !!item.customer;
            })
            .map((item: any) => ({
                ...item,
                isDeletable: true,
                isAddition: false,
                displayQty: item.qty,
                materialRows: groupDetailsByMaterial(item.details),
                customer: item.customer || 'N/A'
            }))
            .sort((a: any, b: any) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());
    }, [usageLog]);

    const visibleItems = outgoingItems.slice(0, ordersToShow);

    // One shared set of length columns for the whole table (like the Categories view).
    const lengthColumns = useMemo(() => {
        const labels: string[] = [];
        visibleItems.forEach((item: any) => item.materialRows.forEach((row: any) => labels.push(...Object.keys(row.counts))));
        return orderLengthLabels(labels);
    }, [visibleItems]);

    if (visibleItems.length === 0) {
        return <p className="text-center text-zinc-400 py-8">No outgoing stock logged.</p>;
    }

    return (
        <div className="overflow-x-auto mt-6 bg-zinc-800 rounded-xl shadow-sm border border-zinc-700">
            <table className="w-full text-center table-auto">
                <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-700">
                        <th className="px-3 py-4 font-semibold text-zinc-400 whitespace-nowrap">DATE</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400">JOB #</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400">CUSTOMER</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-left">MATERIAL</th>
                        {lengthColumns.map(label => (
                            <th key={label} className="px-3 py-4 font-semibold text-zinc-400 text-center whitespace-nowrap">
                                {label === 'N/A' ? 'N/A' : `${label}x48"`}
                            </th>
                        ))}
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-center">QTY</th>
                        <th className="px-3 py-4 font-semibold text-zinc-400 text-center whitespace-nowrap w-24">ACTIONS</th>
                    </tr>
                </thead>
                {visibleItems.map((item: any, orderIdx: any) => {
                    const rows = item.materialRows.length > 0
                        ? item.materialRows
                        : [{ materialType: 'No item details', counts: {} }];
                    const span = rows.length;
                    const rowBg = item.status === 'Scheduled' ? 'bg-purple-900/30' : '';

                    return (
                        <tbody key={item.id} className="group">
                            {orderIdx === 0 && (
                                <tr aria-hidden="true">
                                    <td colSpan={99} className="p-0"><div className="h-3" /></td>
                                </tr>
                            )}
                            {rows.map((row: any, idx: any) => (
                                <tr
                                    key={`${item.id}-${row.materialType}`}
                                    onClick={() => onRowClick(item)}
                                    className={`border-b border-zinc-700 cursor-pointer group-hover:bg-zinc-700/50 ${rowBg}`}
                                >
                                    {idx === 0 && (
                                        <>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-zinc-300 whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-2">
                                                    {item.status === 'Scheduled' && <CalendarClock size={16} className="text-purple-400 shrink-0" {...({ title: 'Scheduled' } as any)} />}
                                                    <span>{new Date(item.usedAt || item.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <div className="mt-1 flex justify-center">
                                                    <AuditTag createdBy={item.createdBy} lastEditedBy={item.lastEditedBy} />
                                                </div>
                                            </td>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-zinc-300">{item.job}</td>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-zinc-300">{item.customer}</td>
                                        </>
                                    )}
                                    <td className="px-3 py-2 text-left text-zinc-200 font-medium whitespace-nowrap">{row.materialType}</td>
                                    {lengthColumns.map(label => {
                                        const qty = row.counts[label] || 0;
                                        return (
                                            <td key={label} className={`px-3 py-2 text-center font-mono ${qty ? 'text-red-400' : 'text-zinc-600'}`}>
                                                {qty ? -qty : ''}
                                            </td>
                                        );
                                    })}
                                    {idx === 0 && (
                                        <>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-red-400 font-mono text-center">{item.displayQty}</td>
                                            <td rowSpan={span} className="px-3 py-2 align-top text-center whitespace-nowrap w-24">
                                                {item.status === 'Scheduled' && (
                                                    <button title="Fulfill Scheduled Usage" onClick={(e) => { e.stopPropagation(); onFulfillLog(item); }} className="inline-flex align-middle text-purple-400 hover:text-purple-300 mr-2"><Truck size={16} /></button>
                                                )}
                                                {item.isDeletable && (
                                                    <>
                                                        <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="inline-flex align-middle text-blue-500 hover:text-blue-400 mr-2"><Edit size={16} /></button>
                                                        <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="inline-flex align-middle text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                                                    </>
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
