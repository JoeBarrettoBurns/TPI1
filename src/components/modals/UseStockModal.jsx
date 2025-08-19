// src/components/modals/UseStockModal.jsx

import React, { useMemo, useState } from 'react';
import { useOrderForm } from '../../hooks/useOrderForm';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { X, Calendar, Minus } from 'lucide-react';

export const UseStockModal = ({ onClose, onSave, materialTypes, materials, inventorySummary, incomingSummary, suppliers }) => {
    const {
        jobs,
        setJobField,
        setItemField,
        addMaterial,
        removeMaterial,
    } = useOrderForm(null, materialTypes, suppliers);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [scheduleSuggestion, setScheduleSuggestion] = useState(null);
    const categories = useMemo(() => [...new Set(Object.values(materials || {}).map(m => m.category))], [materials]);

    const clearError = () => {
        setError('');
        setScheduleSuggestion(null);
    }

    const submitForm = async (overrideOptions = {}) => {
        if (jobs.some((j) => !j.customer.trim())) {
            setError('A Customer name is required for all jobs.');
            return;
        }

        const currentOptions = { ...options, ...overrideOptions };
        if (currentOptions.isScheduled && !currentOptions.scheduledDate) {
            setError('Please select an expected use date for the scheduled order.');
            return;
        }

        setIsSubmitting(true);
        clearError();

        try {
            await onSave(jobs, currentOptions);
            onClose();
        } catch (err) {
            console.error('Transaction failed:', err);
            setError(err.message || 'Failed to update stock.');

            const match = err.message.match(/for \d+x (.*?) @/);
            if (match && match[1]) {
                const materialType = match[1];
                const incoming = incomingSummary[materialType];
                if (incoming && incoming.totalCount > 0 && incoming.latestArrivalDate) {
                    const arrivalDate = new Date(incoming.latestArrivalDate).toISOString().split('T')[0];
                    setScheduleSuggestion({
                        materialType: materialType,
                        count: incoming.totalCount,
                        date: arrivalDate
                    });
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        submitForm();
    };

    const handleScheduleInstead = () => {
        if (!scheduleSuggestion) return;
        submitForm({ isScheduled: true, scheduledDate: scheduleSuggestion.date });
    };

    const jobIndex = 0;
    const job = jobs[0];
    const [options, setOptions] = useState({ isScheduled: false, scheduledDate: '' });
    if (!job) return null;

    return (
        <BaseModal onClose={onClose} title="Use Stock for Jobs">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 border-t border-b border-slate-700 py-4">
                    <div className="p-4 border border-slate-700 rounded-lg bg-slate-900/50 relative">
                        <FormInput label="Customer" name="customer" value={job.customer} onChange={(e) => { const v = e.target.value.toUpperCase(); setJobField(jobIndex, 'customer', v); clearError(); }} required style={{ textTransform: 'uppercase' }} />
                        <div className="mt-4">
                            <FormInput label={`Job Name / Project`} name="jobName" value={job.jobName} onChange={(e) => { const v = e.target.value.toUpperCase(); setJobField(jobIndex, 'jobName', v); clearError(); }} style={{ textTransform: 'uppercase' }} />
                        </div>
                        <div className="mt-4 space-y-2">
                            {job.items.map((item, itemIndex) => {
                                const stock96 = inventorySummary[item.materialType]?.[96] || 0;
                                const stock120 = inventorySummary[item.materialType]?.[120] || 0;
                                const stock144 = inventorySummary[item.materialType]?.[144] || 0;

                                return (
                                    <div key={itemIndex} className="border border-slate-700 p-4 rounded-lg bg-slate-800 relative">
                                        {job.items.length > 1 && (<button type="button" onClick={() => removeMaterial(jobIndex, itemIndex)} className="absolute top-2 right-2 text-red-400 hover:text-red-300"><X size={18} /></button>)}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <FormInput
                                                label={`Category #${itemIndex + 1}`}
                                                name={`category-${itemIndex}`}
                                                value={materials[item.materialType]?.category || categories[0] || ''}
                                                onChange={(e) => {
                                                    const newCategory = e.target.value;
                                                    const firstInCat = materialTypes.find(t => (materials[t]?.category) === newCategory) || '';
                                                    setItemField(jobIndex, itemIndex, 'materialType', firstInCat);
                                                    clearError();
                                                }}
                                                as="select"
                                            >
                                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                            </FormInput>
                                            <FormInput
                                                label={`Material Type`}
                                                name={`materialType-${itemIndex}`}
                                                value={item.materialType}
                                                onChange={(e) => { setItemField(jobIndex, itemIndex, 'materialType', e.target.value); clearError(); }}
                                                as="select"
                                            >
                                                {materialTypes
                                                    .filter(t => (materials[t]?.category) === (materials[item.materialType]?.category || categories[0]))
                                                    .map(type => <option key={type} value={type}>{type}</option>)}
                                            </FormInput>
                                        </div>
                                        <p className="text-sm font-medium text-slate-300 mt-2">Quantities to Use (On Hand):</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <FormInput label={`96"x48" (${stock96})`} name="qty96" type="number" placeholder="0" value={item.qty96} onChange={(e) => { setItemField(jobIndex, itemIndex, 'qty96', e.target.value); clearError(); }} />
                                            <FormInput label={`120"x48" (${stock120})`} name="qty120" type="number" placeholder="0" value={item.qty120} onChange={(e) => { setItemField(jobIndex, itemIndex, 'qty120', e.target.value); clearError(); }} />
                                            <FormInput label={`144"x48" (${stock144})`} name="qty144" type="number" placeholder="0" value={item.qty144} onChange={(e) => { setItemField(jobIndex, itemIndex, 'qty144', e.target.value); clearError(); }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex gap-4 p-2 bg-zinc-900/50 rounded-lg">
                        <button type="button" onClick={() => setOptions({ ...options, isScheduled: false })} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${!options.isScheduled ? 'bg-blue-800 text-white' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                            <Minus size={16} /> Use Now
                        </button>
                        <button type="button" onClick={() => setOptions({ ...options, isScheduled: true })} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${options.isScheduled ? 'bg-purple-800 text-white' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                            <Calendar size={16} /> Schedule
                        </button>
                    </div>

                    {options.isScheduled && (<FormInput label="Expected Use Date" name="scheduledDate" type="date" value={options.scheduledDate} onChange={(e) => setOptions({ ...options, scheduledDate: e.target.value })} required />)}
                </div>

                {error && <ErrorMessage message={error} />}

                {scheduleSuggestion && (
                    <div className="text-center mt-2 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                        <p className="text-yellow-200 mb-3">
                            However, an order of {scheduleSuggestion.materialType} is scheduled to arrive on {new Date(scheduleSuggestion.date + 'T00:00:00').toLocaleDateString()}.
                        </p>
                        <Button variant="warning" onClick={handleScheduleInstead} type="button">
                            Schedule Usage for Arrival Date
                        </Button>
                    </div>
                )}

                <div className="flex justify-end items-center gap-4 pt-4">
                    <Button variant="success" onClick={() => addMaterial(jobIndex)} type="button">+ Add Material</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Processing...' : 'Confirm Usage'}
                    </Button>
                </div>
            </form>
        </BaseModal>
    )
}