// src/components/modals/AddOrderModal.jsx

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useOrderForm } from '../../hooks/useOrderForm';
import { SUPPLIERS } from '../../constants/materials';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';

export const AddOrderModal = ({ onClose, onSave, initialData, title = "Add New Stock", materialTypes }) => {
    const { jobs, setJobField, setItemField, addJob, removeJob, addMaterial, removeMaterial } = useOrderForm(initialData, materialTypes);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (jobs.some(j => !j.jobName.trim() && (jobs.length > 1 || j.jobName))) {
            setError('A Job Number or PO is required for all job groups.');
            return;
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

    return (
        <BaseModal onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 border-t border-b border-slate-700 py-4">
                    {jobs.map((job, jobIndex) => (
                        <div key={jobIndex} className="p-4 border border-slate-700 rounded-lg bg-slate-900/50 relative space-y-4">
                            {!initialData && jobs.length > 1 && (
                                <button type="button" onClick={() => removeJob(jobIndex)} className="absolute top-2 right-2 text-red-400 hover:text-red-300"><X size={18} /></button>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormInput label={`Job/PO #${jobIndex + 1}`} name="jobName" value={job.jobName} onChange={(e) => setJobField(jobIndex, 'jobName', e.target.value)} placeholder="e.g. 12345 or Stock" />
                                <FormInput label="Supplier" name="supplier" value={job.supplier} onChange={(e) => setJobField(jobIndex, 'supplier', e.target.value)} as="select">{SUPPLIERS.map(s => <option key={s}>{s}</option>)}</FormInput>
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
                                    <FormInput label="Cost per Pound ($)" name="costPerPound" type="number" value={item.costPerPound} onChange={(e) => setItemField(jobIndex, itemIndex, 'costPerPound', e.target.value)} step="0.01" />
                                </div>
                            ))}
                            {!initialData && <Button variant="ghost" className="w-full mt-2 !border-dashed !border-slate-600 hover:!border-blue-500" onClick={() => addMaterial(jobIndex)}>+ Add Material to this Job</Button>}
                        </div>
                    ))}
                </div>
                {!initialData && <Button variant="ghost" className="w-full !border-2 !border-dashed !border-slate-600 hover:!border-blue-500" onClick={addJob}>+ Add Another Job Group</Button>}
                {error && <ErrorMessage message={error} />}
                <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit Order'}</Button>
                </div>
            </form>
        </BaseModal>
    );
};