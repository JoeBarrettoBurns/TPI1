// src/components/modals/EditOutgoingLogModal.jsx
import React, { useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { STANDARD_LENGTHS, MATERIAL_TYPES } from '../../constants/materials';

export const EditOutgoingLogModal = ({ isOpen, onClose, logEntry, onSave }) => {
    const [jobData, setJobData] = useState({ jobName: '', customer: '', items: [] });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (logEntry) {
            const itemsByMaterial = {};
            logEntry.details.forEach(item => {
                const key = item.materialType;
                if (!itemsByMaterial[key]) {
                    itemsByMaterial[key] = { materialType: item.materialType, qty96: 0, qty120: 0, qty144: 0 };
                }
                if (STANDARD_LENGTHS.includes(item.length)) {
                    itemsByMaterial[key][`qty${item.length}`]++;
                }
            });
            setJobData({
                jobName: logEntry.job || '',
                customer: logEntry.customer || '',
                items: Object.values(itemsByMaterial)
            });
        }
    }, [logEntry]);

    if (!isOpen) return null;

    const handleItemChange = (itemIndex, field, value) => {
        const newItems = [...jobData.items];
        newItems[itemIndex][field] = value;
        setJobData(prev => ({ ...prev, items: newItems }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        try {
            // Note: The logic for editing a log can be complex as it might require
            // adding/removing inventory. This is a placeholder for the API call.
            await onSave(logEntry, jobData);
            onClose();
        } catch (err) {
            console.error("Failed to save log:", err);
            setError(err.message || "An error occurred while saving.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <BaseModal onClose={onClose} title="Edit Outgoing Log">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="p-4 border border-slate-700 rounded-lg bg-slate-900/50 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormInput label="Job #" name="jobName" value={jobData.jobName} onChange={(e) => setJobData(prev => ({ ...prev, jobName: e.target.value }))} />
                        <FormInput label="Customer" name="customer" value={jobData.customer} onChange={(e) => setJobData(prev => ({ ...prev, customer: e.target.value }))} required />
                    </div>
                    {jobData.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="border border-slate-700 p-4 rounded-lg bg-slate-800">
                            <FormInput label={`Material Type #${itemIndex + 1}`} name="materialType" value={item.materialType} as="select" disabled>{MATERIAL_TYPES.map(type => <option key={type}>{type}</option>)}</FormInput>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <FormInput label='96"x48" Qty' name="qty96" type="number" value={item.qty96} onChange={(e) => handleItemChange(itemIndex, 'qty96', e.target.value)} />
                                <FormInput label='120"x48" Qty' name="qty120" type="number" value={item.qty120} onChange={(e) => handleItemChange(itemIndex, 'qty120', e.target.value)} />
                                <FormInput label='144"x48" Qty' name="qty144" type="number" value={item.qty144} onChange={(e) => handleItemChange(itemIndex, 'qty144', e.target.value)} />
                            </div>
                        </div>
                    ))}
                </div>
                {error && <ErrorMessage message={error} />}
                <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </form>
        </BaseModal>
    );
};