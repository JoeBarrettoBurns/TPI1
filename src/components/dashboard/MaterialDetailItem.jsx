// src/components/dashboard/MaterialDetailItem.jsx

import React, { useState, useMemo, forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { calculateMaterialTransactions } from '../../utils/dataProcessing';
import { STANDARD_LENGTHS } from '../../constants/materials';
import { LogDetailModal } from '../modals/LogDetailModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { Truck, Edit, Trash2, GripVertical } from 'lucide-react';

export const MaterialDetailItem = forwardRef(({ id, matType, inventory, usageLog, inventorySummary, incomingSummary, onDeleteLog, onDeleteInventoryGroup, onEditOrder, onReceiveOrder, onFulfillLog, materials, isDragging, highlighted }, ref) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging: isSortableDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortableDragging ? 0.5 : 1,
        boxShadow: isDragging ? '0 25px 50px -12px rgb(0 0 0 / 0.25)' : '',
        zIndex: isDragging ? 10 : 'auto',
    };

    const transactions = useMemo(() => calculateMaterialTransactions([matType], inventory, usageLog), [matType, inventory, usageLog]);

    const [detailLog, setDetailLog] = useState(null);
    const [logToDelete, setLogToDelete] = useState(null);
    const [numToShow, setNumToShow] = useState(5);

    const matTransactions = transactions[matType] || [];
    const visibleTransactions = matTransactions.slice(0, numToShow);
    const totalIncomingSheets = incomingSummary[matType]?.totalCount || 0;
    const latestArrival = incomingSummary[matType]?.latestArrivalDate;

    const handleConfirmDelete = () => {
        if (!logToDelete) return;
        if (logToDelete.isAddition && !logToDelete.job?.startsWith('MODIFICATION')) {
            onDeleteInventoryGroup(logToDelete);
        } else {
            onDeleteLog(logToDelete.id);
        }
        setLogToDelete(null);
    };

    // Combine refs for dnd-kit and the parent's scroll-to functionality
    const combinedRef = (node) => {
        setNodeRef(node);
        if (ref) {
            ref.current = node;
        }
    };

    return (
        <div
            ref={combinedRef}
            style={style}
            {...attributes}
            className={`bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden transition-all duration-300 ${highlighted ? 'ring-2 ring-blue-500 shadow-xl shadow-blue-500/20' : 'ring-0 ring-transparent'}`}
        >
            <div {...listeners} className="p-4 bg-slate-900/50 flex flex-wrap justify-between items-center gap-4 cursor-grab active:cursor-grabbing">
                <div>
                    <h3 className="text-2xl font-bold text-blue-400">{matType}</h3>
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 mt-2">
                        <div>
                            <h4 className="text-sm font-semibold text-slate-400 mb-1">CURRENT INVENTORY</h4>
                            <div className="flex gap-4">
                                {STANDARD_LENGTHS.map(len => (
                                    <div key={len} className="text-center">
                                        <div className="text-xs text-slate-500">{len}"x48"</div>
                                        <div className="text-2xl font-bold text-green-300">{inventorySummary[matType]?.[len] || 0}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {totalIncomingSheets > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-slate-400 mb-1">FUTURE INVENTORY</h4>
                                <div className="flex gap-4">
                                    {STANDARD_LENGTHS.map(len => {
                                        const currentStock = inventorySummary[matType]?.[len] || 0;
                                        const incomingStock = incomingSummary[matType]?.lengths[len] || 0;
                                        const projectedTotal = currentStock + incomingStock;
                                        return (
                                            <div key={len} className="text-center">
                                                <div className="text-xs text-slate-500">{len}"x48"</div>
                                                <div className="text-2xl font-bold text-yellow-300">
                                                    {projectedTotal}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                {latestArrival && (
                                    <div className="text-xs text-yellow-400 mt-1 text-center sm:text-left">
                                        (Latest Due: {new Date(latestArrival).toLocaleDateString()})
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <GripVertical className="text-slate-500 mr-4" />
                    <label htmlFor={`show-orders-${matType}`} className="text-sm text-slate-400">Show:</label>
                    <select id={`show-orders-${matType}`} value={numToShow > 20 ? 'all' : numToShow} onChange={(e) => setNumToShow(e.target.value === 'all' ? 10000 : parseInt(e.target.value, 10))} className="bg-slate-700 text-white p-2 rounded-lg">
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={'all'}>All</option>
                    </select>
                </div>
            </div>
            {!isDragging && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-900/80">
                            <tr className="border-t border-b border-slate-700">
                                <th className="p-3 font-semibold text-slate-400">ORDER/JOB</th>
                                <th className="p-3 font-semibold text-slate-400">DATE</th>
                                <th className="p-3 font-semibold text-slate-400">CUSTOMER/SUPPLIER</th>
                                {STANDARD_LENGTHS.map(len => (<th key={len} className="p-3 font-semibold text-slate-400 text-center">{len}"x48"</th>))}
                                <th className="p-3 font-semibold text-slate-400 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleTransactions.map((t) => {
                                const rowClass = !t.isAddition && t.isFuture ? 'bg-purple-900/30'
                                    : t.isFuture ? 'bg-yellow-900/20'
                                        : !t.isAddition ? 'bg-red-900/20'
                                            : '';

                                return (
                                    <tr key={t.id} onClick={() => setDetailLog(t)} className={`border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/50 ${rowClass}`}>
                                        <td className="p-3 whitespace-nowrap">{t.job}</td>
                                        <td className="p-3 whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                                        <td className="p-3 whitespace-nowrap">{t.customer}</td>
                                        {STANDARD_LENGTHS.map(len => (
                                            <td key={len} className={`p-3 text-center font-mono ${t[len] < 0 ? 'text-red-400' : 'text-slate-300'}`}>{t[len] || ''}</td>
                                        ))}
                                        <td className="p-3 text-center">
                                            {t.isFuture && t.isAddition && <button title="Receive Order" onClick={(e) => { e.stopPropagation(); onReceiveOrder(t); }} className="text-green-500 hover:text-green-400 mr-2"><Truck size={16} /></button>}
                                            {t.isFulfillable && <button title="Fulfill Scheduled Usage" onClick={(e) => { e.stopPropagation(); onFulfillLog(t); }} className="text-purple-400 hover:text-purple-300 mr-2"><Truck size={16} /></button>}
                                            {t.isDeletable && (
                                                <>
                                                    <button title="Edit" onClick={(e) => { e.stopPropagation(); onEditOrder(t); }} className="text-blue-500 hover:text-blue-400 mr-2"><Edit size={16} /></button>
                                                    <button title="Delete" onClick={(e) => { e.stopPropagation(); setLogToDelete(t); }} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    <LogDetailModal isOpen={!!detailLog} onClose={() => setDetailLog(null)} logEntry={detailLog} materials={materials} />
                    <ConfirmationModal isOpen={!!logToDelete} onClose={() => setLogToDelete(null)} onConfirm={handleConfirmDelete} title="Delete Entry" message="Are you sure you want to delete this entry? This action cannot be undone." />
                </div>
            )}
        </div>
    );
});