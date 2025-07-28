import React, { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { LogDetailModal } from '../components/modals/LogDetailModal';
import { IncomingLogDisplay } from '../components/logs/IncomingLogDisplay';
import { OutgoingLogDisplay } from '../components/logs/OutgoingLogDisplay';

<<<<<<< Updated upstream
export const LogsView = ({ usageLog, inventory, onEditOrder, onDeleteLog, onDeleteInventoryGroup }) => {
=======
export const LogsView = ({ usageLog, inventory, onEditOrder, onDeleteLog, onDeleteInventoryGroup, materials, onFulfillLog, onReceiveOrder }) => {
>>>>>>> Stashed changes
    // State to manage which log entry is being viewed in detail
    const [detailLog, setDetailLog] = useState(null);
    // State to manage which log entry is pending deletion confirmation
    const [logToDelete, setLogToDelete] = useState(null);
    // State to control how many log entries are visible in each table
    const [incomingOrdersToShow, setIncomingOrdersToShow] = useState(5);
    const [outgoingOrdersToShow, setOutgoingOrdersToShow] = useState(5);

    const handleConfirmDeleteLog = () => {
        if (!logToDelete) return;

        // Differentiate between deleting a stock addition vs. a usage log
        if (logToDelete.isAddition && !logToDelete.job?.startsWith('MODIFICATION')) {
            onDeleteInventoryGroup(logToDelete);
        } else {
            onDeleteLog(logToDelete.id);
        }

        setLogToDelete(null); // Close the confirmation modal
    };

    return (
        <div className="space-y-12">
            {/* Modal for viewing detailed log information */}
            <LogDetailModal isOpen={!!detailLog} onClose={() => setDetailLog(null)} logEntry={detailLog} />

            {/* Modal for confirming deletion of a log entry */}
            <ConfirmationModal
                isOpen={!!logToDelete}
                onClose={() => setLogToDelete(null)}
                onConfirm={handleConfirmDeleteLog}
                title="Delete Entry"
                message="Are you sure you want to delete this entry? This action cannot be undone and will not revert inventory changes."
            />

            {/* Incoming Stock Log Section */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ArrowDownCircle size={24} /> Incoming Stock Log
                    </h2>
                    <div className="flex items-center gap-2">
                        <label htmlFor="show-incoming-logs" className="text-sm text-slate-400">Show:</label>
                        <select
                            id="show-incoming-logs"
                            value={incomingOrdersToShow > 20 ? 'all' : incomingOrdersToShow}
                            onChange={(e) => setIncomingOrdersToShow(e.target.value === 'all' ? 10000 : parseInt(e.target.value, 10))}
                            className="bg-slate-700 text-white p-2 rounded-lg"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={'all'}>All</option>
                        </select>
                    </div>
                </div>
                <IncomingLogDisplay
                    inventory={inventory}
                    onRowClick={setDetailLog}
                    onDelete={setLogToDelete}
                    onEdit={onEditOrder}
                    onReceiveOrder={onReceiveOrder}
                    ordersToShow={incomingOrdersToShow}
                />
            </div>

            {/* Outgoing Stock Log Section */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ArrowUpCircle size={24} /> Outgoing Stock Log
                    </h2>
                    <div className="flex items-center gap-2">
                        <label htmlFor="show-outgoing-logs" className="text-sm text-slate-400">Show:</label>
                        <select
                            id="show-outgoing-logs"
                            value={outgoingOrdersToShow > 20 ? 'all' : outgoingOrdersToShow}
                            onChange={(e) => setOutgoingOrdersToShow(e.target.value === 'all' ? 10000 : parseInt(e.target.value, 10))}
                            className="bg-slate-700 text-white p-2 rounded-lg"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={'all'}>All</option>
                        </select>
                    </div>
                </div>
                <OutgoingLogDisplay
                    usageLog={usageLog}
                    onRowClick={setDetailLog}
                    onDelete={setLogToDelete}
                    onEdit={onEditOrder}
                    ordersToShow={outgoingOrdersToShow}
                />
            </div>
        </div>
    );
};
