// src/views/MaterialDetailView.jsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { calculateMaterialTransactions } from '../utils/dataProcessing';
import { STANDARD_LENGTHS } from '../constants/materials';
import { LogDetailModal } from '../components/modals/LogDetailModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { Truck, Edit, Trash2 } from 'lucide-react';

export const MaterialDetailView = ({ category, inventory, usageLog, inventorySummary, incomingSummary, onDeleteLog, onDeleteInventoryGroup, onEditOrder, onReceiveOrder, scrollToMaterial, onScrollToComplete, materials, materialTypes }) => {
    const materialsInCategory = useMemo(() => materialTypes.filter(m => materials[m].category === category), [category, materials, materialTypes]);
    const transactions = useMemo(() => calculateMaterialTransactions(materialsInCategory, inventory, usageLog), [materialsInCategory, inventory, usageLog]);

    const [detailLog, setDetailLog] = useState(null);
    const [logToDelete, setLogToDelete] = useState(null);
    const [ordersToShow, setOrdersToShow] = useState({});

    const detailRefs = useRef({});
    materialsInCategory.forEach(matType => {
        detailRefs.current[matType] = detailRefs.current[matType] || React.createRef();
    });

    useEffect(() => {
        if (scrollToMaterial && detailRefs.current[scrollToMaterial]?.current) {
            detailRefs.current[scrollToMaterial].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            onScrollToComplete();
        }
    }, [scrollToMaterial, onScrollToComplete]);

    const handleConfirmDelete = () => {
        if (!logToDelete) return;
        if (logToDelete.isAddition && !logToDelete.job?.startsWith('MODIFICATION')) {
            onDeleteInventoryGroup(logToDelete);
        } else {
            onDeleteLog(logToDelete.id);
        }
        setLogToDelete(null);
    };

    const handleSetOrdersToShow = (matType, value) => {
        setOrdersToShow(prev => ({
            ...prev,
            [matType]: value === 'all' ? (transactions[matType]?.length || 5) : parseInt(value, 10),
        }));
    };

    return (
        <div className="space-y-8">
            {materialsInCategory.map(matType => {
                const matTransactions = transactions[matType] || [];
                const numToShow = ordersToShow[matType] || 5;
                const visibleTransactions = matTransactions.slice(0, numToShow);
                const totalIncomingSheets = incomingSummary[matType]?.totalCount || 0;
                const latestArrival = incomingSummary[matType]?.latestArrivalDate;

                return (
                    <div key={matType} ref={detailRefs.current[matType]} className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                        <div className="p-4 bg-slate-900/50 flex flex-wrap justify-between items-center gap-4">
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
                                        {latestArrival && totalIncomingSheets > 0 && (
                                            <div className="text-xs text-yellow-400 mt-1 text-center sm:text-left">
                                                (Latest Due: {new Date(latestArrival).toLocaleDateString()})
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <label htmlFor={`show-orders-${matType}`} className="text-sm text-slate-400">Show:</label>
                                <select id={`show-orders-${matType}`} value={numToShow > 20 ? 'all' : numToShow} onChange={(e) => handleSetOrdersToShow(matType, e.target.value)} className="bg-slate-700 text-white p-2 rounded-lg">
                                    <option value={5}>5</option>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={'all'}>All</option>
                                </select>
                            </div>
                        </div>
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
                                    {visibleTransactions.map((t) => (
                                        <tr key={t.id} onClick={() => setDetailLog(t)} className={`border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/50 ${t.isFuture ? 'bg-yellow-900/20' : !t.isAddition ? 'bg-red-900/20' : ''}`}>
                                            <td className="p-3 whitespace-nowrap">{t.job}</td>
                                            <td className="p-3 whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                                            <td className="p-3 whitespace-nowrap">{t.customer}</td>
                                            {STANDARD_LENGTHS.map(len => (
                                                <td key={len} className={`p-3 text-center font-mono ${t[len] < 0 ? 'text-red-400' : 'text-slate-300'}`}>{t[len] || ''}</td>
                                            ))}
                                            <td className="p-3 text-center">
                                                {t.isFuture && <button title="Receive Order" onClick={(e) => { e.stopPropagation(); onReceiveOrder(t); }} className="text-green-500 hover:text-green-400 mr-2"><Truck size={16} /></button>}
                                                {t.isDeletable && (
                                                    <>
                                                        <button title="Edit" onClick={(e) => { e.stopPropagation(); onEditOrder(t); }} className="text-blue-500 hover:text-blue-400 mr-2"><Edit size={16} /></button>
                                                        <button title="Delete" onClick={(e) => { e.stopPropagation(); setLogToDelete(t); }} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
            <LogDetailModal isOpen={!!detailLog} onClose={() => setDetailLog(null)} logEntry={detailLog} materials={materials} />
            <ConfirmationModal isOpen={!!logToDelete} onClose={() => setLogToDelete(null)} onConfirm={handleConfirmDelete} title="Delete Entry" message="Are you sure you want to delete this entry? This action cannot be undone." />
        </div>
    );
};