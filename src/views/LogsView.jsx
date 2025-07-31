// src/views/LogsView.jsx

import React, { useState, useMemo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Download } from 'lucide-react';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { LogDetailModal } from '../components/modals/LogDetailModal';
import { IncomingLogDisplay } from '../components/logs/IncomingLogDisplay';
import { OutgoingLogDisplay } from '../components/logs/OutgoingLogDisplay';
import { Button } from '../components/common/Button';
import { exportToCSV } from '../utils/csvExport';
import { groupInventoryByJob } from '../utils/dataProcessing';

export const LogsView = ({ usageLog, inventory, onEditOrder, onDeleteLog, onDeleteInventoryGroup, materials, onFulfillLog, onReceiveOrder, searchQuery }) => {
    const [detailLog, setDetailLog] = useState(null);
    const [logToDelete, setLogToDelete] = useState(null);
    const [incomingOrdersToShow, setIncomingOrdersToShow] = useState(5);
    const [outgoingOrdersToShow, setOutgoingOrdersToShow] = useState(5);

    const incomingItems = useMemo(() => {
        const grouped = groupInventoryByJob(inventory);
        if (!searchQuery) return grouped;
        const lowercasedQuery = (searchQuery || '').toLowerCase();
        return grouped.filter(group =>
            (group.job || '').toLowerCase().includes(lowercasedQuery) ||
            (group.supplier || '').toLowerCase().includes(lowercasedQuery) ||
            group.details.some(d => d.materialType.toLowerCase().includes(lowercasedQuery))
        );
    }, [inventory, searchQuery]);

    const filteredUsageLog = useMemo(() => {
        const filtered = usageLog.filter(log => log.status !== 'Archived');
        if (!searchQuery) return filtered;
        const lowercasedQuery = (searchQuery || '').toLowerCase();
        return filtered.filter(log =>
            (log.job || '').toLowerCase().includes(lowercasedQuery) ||
            (log.customer || '').toLowerCase().includes(lowercasedQuery) ||
            log.details.some(d => d.materialType.toLowerCase().includes(lowercasedQuery))
        );
    }, [usageLog, searchQuery]);

    const handleConfirmDeleteLog = () => {
        if (!logToDelete) return;
        if (logToDelete.isAddition) {
            onDeleteInventoryGroup(logToDelete);
        } else {
            onDeleteLog(logToDelete.id);
        }
        setLogToDelete(null);
    };

    const handleExportIncoming = () => {
        const headers = [
            { label: 'Date Ordered', key: 'dateOrdered' },
            { label: 'Date Incoming/Received', key: 'dateIncoming' },
            { label: 'Job/PO', key: 'job' },
            { label: 'Supplier', key: 'supplier' },
            { label: 'Material', key: 'materialType' },
            { label: 'Length', key: 'length' },
            { label: 'Qty', key: 'qty' },
            { label: 'Status', key: 'status' },
        ];

        const dataToExport = incomingItems.flatMap(group =>
            group.details.map(item => ({
                dateOrdered: new Date(group.date).toLocaleDateString(),
                dateIncoming: group.dateIncoming ? new Date(group.dateIncoming).toLocaleDateString() : 'N/A',
                job: group.job,
                supplier: group.customer,
                materialType: item.materialType,
                length: item.length,
                qty: 1,
                status: item.status,
            }))
        );

        exportToCSV(dataToExport, headers, 'incoming_stock_logs.csv');
    };

    const handleExportOutgoing = () => {
        const headers = [
            { label: 'Date Used', key: 'date' },
            { label: 'Job', key: 'job' },
            { label: 'Customer', key: 'customer' },
            { label: 'Material', key: 'materialType' },
            { label: 'Length', key: 'length' },
            { label: 'Status', key: 'status' },
        ];

        const dataToExport = filteredUsageLog.flatMap(log =>
            (log.details && log.details.length > 0) ? log.details.map(item => ({
                date: new Date(log.usedAt || log.createdAt).toLocaleDateString(),
                job: log.job,
                customer: log.customer,
                materialType: item.materialType,
                length: item.length,
                status: log.status,
            })) : []
        );

        exportToCSV(dataToExport, headers, 'outgoing_usage_logs.csv');
    };

    return (
        <div className="space-y-12">
            <LogDetailModal isOpen={!!detailLog} onClose={() => setDetailLog(null)} logEntry={detailLog} materials={materials} />
            <ConfirmationModal
                isOpen={!!logToDelete}
                onClose={() => setLogToDelete(null)}
                onConfirm={handleConfirmDeleteLog}
                title="Delete Entry"
                message="Are you sure you want to delete this entry? This action cannot be undone and will not revert inventory changes."
            />

            <div>
                <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ArrowDownCircle size={24} /> Incoming Stock Log
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label htmlFor="show-incoming-logs" className="text-sm text-zinc-400">Show:</label>
                            <select id="show-incoming-logs" value={incomingOrdersToShow > 20 ? 'all' : incomingOrdersToShow} onChange={(e) => setIncomingOrdersToShow(e.target.value === 'all' ? 10000 : parseInt(e.target.value, 10))} className="bg-zinc-700 text-white p-2 rounded-lg">
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={'all'}>All</option>
                            </select>
                        </div>
                        <Button onClick={handleExportIncoming} variant="secondary">
                            <Download size={16} /> <span className="hidden sm:inline">Export</span>
                        </Button>
                    </div>
                </div>
                <IncomingLogDisplay
                    incomingItems={incomingItems}
                    onRowClick={setDetailLog}
                    onDelete={setLogToDelete}
                    onEdit={onEditOrder}
                    onReceiveOrder={onReceiveOrder}
                    ordersToShow={incomingOrdersToShow}
                />
            </div>

            <div>
                <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ArrowUpCircle size={24} /> Outgoing Stock Log
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label htmlFor="show-outgoing-logs" className="text-sm text-zinc-400">Show:</label>
                            <select id="show-outgoing-logs" value={outgoingOrdersToShow > 20 ? 'all' : outgoingOrdersToShow} onChange={(e) => setOutgoingOrdersToShow(e.target.value === 'all' ? 10000 : parseInt(e.target.value, 10))} className="bg-zinc-700 text-white p-2 rounded-lg">
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={'all'}>All</option>
                            </select>
                        </div>
                        <Button onClick={handleExportOutgoing} variant="secondary">
                            <Download size={16} /> <span className="hidden sm:inline">Export</span>
                        </Button>
                    </div>
                </div>
                <OutgoingLogDisplay
                    usageLog={filteredUsageLog}
                    onRowClick={setDetailLog}
                    onDelete={setLogToDelete}
                    onEdit={onEditOrder}
                    onFulfillLog={onFulfillLog}
                    ordersToShow={outgoingOrdersToShow}
                />
            </div>
        </div>
    );
};
