// src/components/modals/AddOrderModal.jsx

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useOrderForm } from '../../hooks/useOrderForm';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';

export const AddOrderModal = ({ onClose, onSave, initialData, title = "Add New Stock", materialTypes, suppliers, preselectedMaterial }) => {
    const { jobs, setJobField, setItemField, addMaterial, removeMaterial } = useOrderForm(initialData, materialTypes, suppliers, preselectedMaterial);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();

        for (const job of jobs) {
            if (job.items.length === 0) {
                setError(`The job/PO must have at least one material.`);
                return;
            }

            for (const item of job.items) {
                const cost = parseFloat(item.costPerPound);
                if (isNaN(cost) || cost <= 0) {
                    setError(`Cost per Pound for "${item.materialType}" must be a positive number.`);
                    return;
                }

                const hasQuantity = parseInt(item.qty96 || 0) > 0 || parseInt(item.qty120 || 0) > 0 || parseInt(item.qty144 || 0) > 0;
                if (!hasQuantity) {
                    setError(`At least one quantity must be entered for "${item.materialType}".`);
                    return;
                }
            }
        }

        setIsSubmitting(true);
        setError('');
        try {
            await onSave(jobs, initialData);
            onClose();
        } catch (err) {
            console.error("Submission error:", err);
            setError(err.message || "An error occurred during submission.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Since we are only allowing one job group, we can reference it directly.
    const jobIndex = 0;
    const job = jobs[0];

    return (
        <BaseModal onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 border-t border-b border-slate-700 py-4">
                    <div className="p-4 border border-slate-700 rounded-lg bg-slate-900/50 relative space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormInput label={`Job/PO #`} name="jobName" value={job.jobName} onChange={(e) => setJobField(jobIndex, 'jobName', e.target.value)} placeholder="e.g. 12345 or Stock" />
                            <FormInput label="Supplier" name="supplier" value={job.supplier} onChange={(e) => setJobField(jobIndex, 'supplier', e.target.value)} as="select">{suppliers.map(s => <option key={s}>{s}</option>)}</FormInput>
                            <FormInput label="Status" name="status" value={job.status} onChange={(e) => setJobField(jobIndex, 'status', e.target.value)} as="select">
                                <option value="Ordered">Ordered (Future)</option>
                                <option value="On Hand">On Hand</option>
                            </FormInput>
                        </div>
                        {job.status === 'Ordered' && <FormInput label="Expected Arrival Date" name="arrivalDate" type="date" value={job.arrivalDate} onChange={(e) => setJobField(jobIndex, 'arrivalDate', e.target.value)} />}

                        {job.items.map((item, itemIndex) => (
                            <div key={itemIndex} className="border border-slate-700 p-4 rounded-lg bg-slate-800 relative">
                                {!initialData && job.items.length > 1 && (
                                    <button type="button" onClick={() => removeMaterial(jobIndex, itemIndex)} className="absolute top-2 right-2 text-red-400 hover:text-red-300"><X size={18} /></button>
                                )}
                                <FormInput label={`Material Type #${itemIndex + 1}`} name="materialType" value={item.materialType} onChange={(e) => setItemField(jobIndex, itemIndex, 'materialType', e.target.value)} as="select">{materialTypes.map(type => <option key={type}>{type}</option>)}</FormInput>
                                <p className="text-sm font-medium text-slate-300 mt-2">Standard Quantities:</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <FormInput label='96"x48"' name="qty96" type="number" placeholder="0" value={item.qty96} onChange={(e) => setItemField(jobIndex, itemIndex, 'qty96', e.target.value)} />
                                    <FormInput label='120"x48"' name="qty120" type="number" placeholder="0" value={item.qty120} onChange={(e) => setItemField(jobIndex, itemIndex, 'qty120', e.target.value)} />
                                    <FormInput label='144"x48"' name="qty144" type="number" placeholder="0" value={item.qty144} onChange={(e) => setItemField(jobIndex, itemIndex, 'qty144', e.target.value)} />
                                </div>
                                <FormInput label="Cost per Pound ($)" name="costPerPound" type="number" value={item.costPerPound} onChange={(e) => setItemField(jobIndex, itemIndex, 'costPerPound', e.target.value)} step="0.01" required />
                            </div>
                        ))}
                    </div>
                </div>

                {error && <ErrorMessage message={error} />}

                <div className="flex justify-end items-center gap-4 pt-4">
                    {!initialData && (
                        <Button variant="success" onClick={() => addMaterial(jobIndex)}>
                            + Add Material
                        </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit Order'}
                    </Button>
                </div>
            </form>
        </BaseModal>
    );
};