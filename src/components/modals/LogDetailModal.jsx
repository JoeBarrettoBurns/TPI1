// src/components/modals/LogDetailModal.jsx

import React, { useMemo } from 'react';
import { BaseModal } from './BaseModal';

export const LogDetailModal = ({ isOpen, onClose, logEntry, materials }) => {
    const groupedDetails = useMemo(() => {
        if (!logEntry?.details) return [];

        const isModificationOrDeletion = logEntry.job && (logEntry.job.startsWith('MODIFICATION') || logEntry.job.startsWith('DELETION'));
        if (isModificationOrDeletion) {
            return logEntry.details.map(d => ({ ...d, count: d.qty }));
        }

        const groups = {};
        logEntry.details.forEach(item => {
            const key = `${item.materialType}|${item.width}|${item.length}|${item.costPerPound}`;
            if (!groups[key]) {
                groups[key] = { ...item, count: 0 };
            }
            groups[key].count += 1;
        });
        return Object.values(groups);
    }, [logEntry]);

    if (!isOpen || !logEntry) return null;

    // Prefer usedAt for outgoing usage logs; prefer arrivalDate/date for incoming
    const displayDateIso = (() => {
        if (logEntry.arrivalDate) return logEntry.arrivalDate;
        if (logEntry.status) return logEntry.usedAt || logEntry.createdAt;
        if (logEntry.isAddition) return logEntry.arrivalDate || logEntry.date || logEntry.createdAt;
        return logEntry.usedAt || logEntry.date || logEntry.createdAt;
    })();

    const calculateWeight = (item) => {
        const material = materials[item.materialType];
        if (!material) return 0;
        return (item.width * item.length * material.thickness * material.density);
    };

    const calculateTotalCost = (item) => {
        const weight = calculateWeight(item);
        return (weight * (item.costPerPound || 0));
    };

    return (
        <BaseModal onClose={onClose} title="Log Entry Details">
            <div className="space-y-4 text-slate-300">
                <p><strong className="text-slate-400">Date:</strong> {displayDateIso ? new Date(displayDateIso).toLocaleString() : 'N/A'}</p>
                <p><strong className="text-slate-400">Job/PO:</strong> {logEntry.job}</p>
                <p><strong className="text-slate-400">Customer/Supplier:</strong> {logEntry.customer}</p>
                {logEntry.description && <p><strong className="text-slate-400">Description:</strong> {logEntry.description}</p>}

                <div className="mt-4 border-t border-slate-700 pt-4">
                    <h4 className="text-lg font-bold text-white mb-2">Items:</h4>
                    <div className="space-y-2">
                        {groupedDetails.map((item, index) => {
                            const quantity = item.count || 1;
                            const weightPerSheet = calculateWeight(item);
                            const totalWeight = weightPerSheet * quantity;
                            const costPerSheet = calculateTotalCost(item);
                            const totalCost = costPerSheet * quantity;

                            return (
                                <div key={index} className="bg-slate-700/50 p-3 rounded-lg">
                                    <p><strong className="text-blue-400">{item.materialType}</strong></p>
                                    <p>Size: {item.width}" x {item.length}"</p>
                                    <p>Quantity: {quantity}</p>
                                    <p>Weight: {totalWeight.toFixed(2)} lbs ({weightPerSheet.toFixed(2)} lbs/sheet)</p>
                                    <p>Cost/lb: ${item.costPerPound || 'N/A'}</p>
                                    <p>Total Cost: ${totalCost.toFixed(2)}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </BaseModal>
    );
};