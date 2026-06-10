// src/components/modals/LogDetailModal.jsx

import React, { useMemo } from 'react';
import { BaseModal } from './BaseModal';

export const groupLogDetailItems = (logEntry) => {
    const sourceDetails = logEntry?.displayDetails || logEntry?.details;
    if (!sourceDetails) return [];

    const isModificationOrDeletion = logEntry.job && (logEntry.job.startsWith('MODIFICATION') || logEntry.job.startsWith('DELETION'));
    if (isModificationOrDeletion && sourceDetails.some(d => typeof d.qty === 'number')) {
        return sourceDetails.map(d => ({ ...d, count: d.qty }));
    }

    const groups = {};
    sourceDetails.forEach(item => {
        // One slot per material + size; sheets with differing cost records stay
        // in the same slot and their costs are aggregated for display.
        const key = `${item.materialType}|${item.width}|${item.length}|${logEntry.isAddition ? (item.arrivalDate || '') : ''}`;
        if (!groups[key]) {
            groups[key] = { ...item, count: 0, costPerPoundValues: [] };
        }
        groups[key].count += 1;
        groups[key].costPerPoundValues.push(item.costPerPound || 0);
    });
    return Object.values(groups);
};

export const LogDetailModal = ({ isOpen, onClose, logEntry, materials }) => {
    const groupedDetails = useMemo(() => groupLogDetailItems(logEntry), [logEntry]);

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

    return (
        <BaseModal onClose={onClose} title="Log Entry Details">
            <div className="space-y-4 text-slate-300">
                <p><strong className="text-slate-400">Date:</strong> {displayDateIso ? new Date(displayDateIso).toLocaleString() : 'N/A'}</p>
                <p><strong className="text-slate-400">Job/PO:</strong> {logEntry.job}</p>
                <p><strong className="text-slate-400">Customer/Supplier:</strong> {logEntry.customer}</p>
                {logEntry.createdBy && <p><strong className="text-slate-400">Logged by:</strong> {logEntry.createdBy}</p>}
                {logEntry.lastEditedBy && (
                    <p>
                        <strong className="text-slate-400">Last edited by:</strong> {logEntry.lastEditedBy}
                        {logEntry.lastEditedAt ? ` (${new Date(logEntry.lastEditedAt).toLocaleString()})` : ''}
                    </p>
                )}
                {logEntry.description && <p><strong className="text-slate-400">Description:</strong> {logEntry.description}</p>}

                <div className="mt-4 border-t border-slate-700 pt-4">
                    <h4 className="text-lg font-bold text-white mb-2">Items:</h4>
                    <div className="space-y-2">
                        {groupedDetails.map((item, index) => {
                            const quantity = item.count || 1;
                            const weightPerSheet = calculateWeight(item);
                            const totalWeight = weightPerSheet * quantity;
                            const costValues = item.costPerPoundValues || [item.costPerPound || 0];
                            const totalCost = item.costPerPoundValues
                                ? weightPerSheet * costValues.reduce((sum, value) => sum + value, 0)
                                : weightPerSheet * (item.costPerPound || 0) * quantity;
                            const costLabel = [...new Set(costValues)]
                                .sort((a, b) => b - a)
                                .map(value => (value ? `$${value}` : 'N/A'))
                                .join(' / ');

                            return (
                                <div key={index} className="bg-slate-700/50 p-3 rounded-lg">
                                    <p><strong className="text-blue-400">{item.materialType}</strong></p>
                                    <p>Size: {item.width}" x {item.length}"</p>
                                    {logEntry.isAddition && item.arrivalDate && <p>Expected Arrival: {new Date(item.arrivalDate).toLocaleDateString()}</p>}
                                    <p>Quantity: {quantity}</p>
                                    <p>Weight: {totalWeight.toFixed(2)} lbs ({weightPerSheet.toFixed(2)} lbs/sheet)</p>
                                    <p>Cost/lb: {costLabel}</p>
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