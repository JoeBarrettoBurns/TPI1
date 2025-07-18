import React, { useMemo } from 'react';
import { Edit, Trash2 } from 'lucide-react';

export const OutgoingLogDisplay = ({ usageLog, onRowClick, onDelete, onEdit, ordersToShow }) => {
    const outgoingItems = useMemo(() => {
        return usageLog
            .filter(item => {
                const job = item.job || '';
                const isModification = job.startsWith('MODIFICATION');
                // Show standard usage logs OR negative modifications (stock removal)
                return (item.customer && !isModification) || (isModification && item.qty < 0);
            })
            .map(item => ({
                ...item,
                isDeletable: true,
                isAddition: false,
                displayQty: item.qty,
                description: Array.isArray(item.details) && item.details.length > 0
                    ? `${item.details.length} sheet(s) of various materials`
                    : 'Single item usage',
                customer: item.customer || 'N/A'
            }))
            .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));
    }, [usageLog]);

    const visibleItems = outgoingItems.slice(0, ordersToShow);

    if (visibleItems.length === 0) {
        return <p className="text-center text-slate-400 py-8">No outgoing stock logged.</p>;
    }

    return (
        <div className="overflow-x-auto mt-6 bg-slate-800 rounded-xl shadow-sm border border-slate-700">
            <table className="w-full text-left table-auto">
                <thead>
                    <tr className="bg-slate-900/60 border-b border-slate-700">
                        <th className="p-4 font-semibold text-slate-400">DATE</th>
                        <th className="p-4 font-semibold text-slate-400">JOB #</th>
                        <th className="p-4 font-semibold text-slate-400">CUSTOMER</th>
                        <th className="p-4 font-semibold text-slate-400">DESCRIPTION</th>
                        <th className="p-4 font-semibold text-slate-400 text-right">QTY</th>
                        <th className="p-4 font-semibold text-slate-400 text-center">ACTIONS</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleItems.map(item => (
                        <tr key={item.id} onClick={() => onRowClick(item)} className="border-b border-slate-700 hover:bg-slate-700/50 cursor-pointer">
                            <td className="p-4 truncate text-slate-300">{new Date(item.usedAt).toLocaleDateString()}</td>
                            <td className="p-4 truncate text-slate-300">{item.job}</td>
                            <td className="p-4 truncate text-slate-300">{item.customer}</td>
                            <td className="p-4 truncate text-slate-300">{item.description}</td>
                            <td className="p-4 text-red-400 font-mono text-right">{item.displayQty}</td>
                            <td className="p-4 text-center">
                                {item.isDeletable && (
                                    <>
                                        <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="text-blue-500 hover:text-blue-400 mr-2"><Edit size={16} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
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