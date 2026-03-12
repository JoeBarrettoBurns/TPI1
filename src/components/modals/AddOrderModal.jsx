// src/components/modals/AddOrderModal.jsx

import React, { useMemo, useState } from 'react';
import { X, Check, Calendar, Mail } from 'lucide-react';
import { useOrderForm } from '../../hooks/useOrderForm';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { calculateSheetCost } from '../../utils/dataProcessing';

function formatSheetPriceLabel(length, item, materials) {
    const sheetPrice = calculateSheetCost(
        {
            materialType: item.materialType,
            length,
            width: 48,
            costPerPound: parseFloat(item.costPerPound || 0),
        },
        materials
    );

    const baseLabel = `${length}"x48"`;
    if (!sheetPrice || sheetPrice <= 0) return baseLabel;

    return `${baseLabel} ($${sheetPrice.toFixed(2)}/sheet)`;
}

function formatCustomSheetPriceLabel(item, materials) {
    const customWidth = parseFloat(item.customWidth || 0);
    const customLength = parseFloat(item.customLength || 0);

    if (customWidth <= 0 || customLength <= 0) {
        return 'Optional Custom Sheet';
    }

    const sheetPrice = calculateSheetCost(
        {
            materialType: item.materialType,
            length: customLength,
            width: customWidth,
            costPerPound: parseFloat(item.costPerPound || 0),
        },
        materials
    );

    const baseLabel = `${customLength}"x${customWidth}"`;
    if (!sheetPrice || sheetPrice <= 0) return `${baseLabel} Custom`;

    return `${baseLabel} Custom ($${sheetPrice.toFixed(2)}/sheet)`;
}

export const AddOrderModal = ({
    onClose,
    onSave,
    initialData,
    title = 'Add New Stock',
    materialTypes,
    materials,
    suppliers,
    prefill,
    mode = 'inventory'
}) => {
    const { jobs, setJobs, setJobField, setItemField, addMaterial, removeMaterial } = useOrderForm(
        initialData,
        materialTypes,
        suppliers,
        prefill,
        { multiSupplier: mode === 'buy' }
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const categories = useMemo(() => [...new Set(Object.values(materials || {}).map(m => m.category))], [materials]);
    const submitLabel = mode === 'buy' ? 'Open Email' : 'Submit Order';

    // Since we are only allowing one job group, we can reference it directly.
    const jobIndex = 0;
    const job = jobs[0];

    const toggleSupplierSelection = (supplierName) => {
        const selectedSuppliers = Array.isArray(job.suppliers) ? job.suppliers : [];
        const nextSuppliers = selectedSuppliers.includes(supplierName)
            ? selectedSuppliers.filter((supplier) => supplier !== supplierName)
            : [...selectedSuppliers, supplierName];
        const orderedSuppliers = suppliers.filter((supplier) => nextSuppliers.includes(supplier));
        setJobField(jobIndex, 'suppliers', orderedSuppliers);
        setJobField(jobIndex, 'supplier', orderedSuppliers[0] || '');
    };

    const handleStatusChange = (nextStatus) => {
        setJobField(jobIndex, 'status', nextStatus);
    };

    const handleSharedArrivalDateChange = (value) => {
        setJobs((currentJobs) => currentJobs.map((currentJob, index) => {
            if (index !== jobIndex) return currentJob;
            return {
                ...currentJob,
                arrivalDate: value,
                items: currentJob.useItemArrivalDates
                    ? currentJob.items
                    : currentJob.items.map((item) => ({ ...item, arrivalDate: value })),
            };
        }));
    };

    const handleMultipleArrivalDateToggle = (enabled) => {
        setJobs((currentJobs) => currentJobs.map((currentJob, index) => {
            if (index !== jobIndex) return currentJob;

            const firstItemArrivalDate = currentJob.items.find((item) => item.arrivalDate)?.arrivalDate || '';
            const nextSharedArrivalDate = currentJob.arrivalDate || firstItemArrivalDate;

            return {
                ...currentJob,
                useItemArrivalDates: enabled,
                arrivalDate: enabled ? currentJob.arrivalDate : nextSharedArrivalDate,
                items: currentJob.items.map((item) => ({
                    ...item,
                    arrivalDate: item.arrivalDate || nextSharedArrivalDate || '',
                })),
            };
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        for (const job of jobs) {
            if (job.items.length === 0) {
                setError(`The job/PO must have at least one material.`);
                return;
            }

            if (mode === 'buy') {
                const selectedSuppliers = Array.isArray(job.suppliers) ? job.suppliers.filter(Boolean) : [];
                if (selectedSuppliers.length === 0) {
                    setError('Select at least one supplier for the buy order.');
                    return;
                }
            }

            if (mode !== 'buy' && job.status === 'Ordered' && !job.useItemArrivalDates && !job.arrivalDate) {
                setError('Expected arrival date is required for ordered stock.');
                return;
            }

            for (const item of job.items) {
                if (mode !== 'buy') {
                    const cost = parseFloat(item.costPerPound);
                    if (isNaN(cost) || cost <= 0) {
                        setError(`Cost per Pound for "${item.materialType}" must be a positive number.`);
                        return;
                    }
                }

                if (mode !== 'buy' && job.status === 'Ordered' && job.useItemArrivalDates && !item.arrivalDate) {
                    setError(`Expected arrival date is required for "${item.materialType}".`);
                    return;
                }

                const hasStandardQuantity = parseInt(item.qty96 || 0, 10) > 0 || parseInt(item.qty120 || 0, 10) > 0 || parseInt(item.qty144 || 0, 10) > 0;
                const customQty = parseInt(item.customQty || 0, 10);
                const hasCustomQuantity = customQty > 0;
                const customWidth = parseFloat(item.customWidth || 0);
                const customLength = parseFloat(item.customLength || 0);
                const hasPartialCustomFields = Boolean(item.customWidth || item.customLength || item.customQty);

                if (hasCustomQuantity && (customWidth <= 0 || customLength <= 0)) {
                    setError(`Custom sheet dimensions for "${item.materialType}" must be positive numbers.`);
                    return;
                }

                if (hasPartialCustomFields && !hasCustomQuantity) {
                    setError(`Custom sheet quantity for "${item.materialType}" must be greater than zero when custom dimensions are provided.`);
                    return;
                }

                const hasQuantity = hasStandardQuantity || hasCustomQuantity;
                if (!hasQuantity) {
                    setError(`At least one quantity must be entered for "${item.materialType}".`);
                    return;
                }
            }
        }

        setIsSubmitting(true);
        setError('');
        try {
            const debugRunId = `buy-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            if (typeof window !== 'undefined') {
                window.__buyOrderDebugRunId = debugRunId;
            }
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/0a075336-d9fc-493f-a0d4-5d872ce7ae6e',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ae0430'},body:JSON.stringify({sessionId:'ae0430',runId:debugRunId,hypothesisId:'H1',location:'AddOrderModal.jsx:144',message:'Buy order submit requested',data:{mode,selectedSupplierCount:Array.isArray(job?.suppliers)?job.suppliers.filter(Boolean).length:0,itemCount:Array.isArray(job?.items)?job.items.length:0},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            const result = await onSave(jobs, initialData);
            if (mode !== 'buy' || result?.closeModalOnSuccess !== false) {
                onClose();
            }
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
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 border-t border-b border-zinc-700 py-4">
                    <div className="p-4 border border-zinc-700 rounded-lg bg-zinc-900/50 relative space-y-4">
                        <div className={`grid grid-cols-1 ${mode === 'buy' ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
                            {mode !== 'buy' && (
                                <FormInput label={`Job/PO #`} name="jobName" value={job.jobName} onChange={(e) => setJobField(jobIndex, 'jobName', (e.target.value || '').toUpperCase())} placeholder="e.g. 12345 or Stock" style={{ textTransform: 'uppercase' }} />
                            )}
                            {mode === 'buy' ? (
                                <div className="md:col-span-1">
                                    <label className="block text-sm font-medium text-zinc-300">Suppliers</label>
                                    <div className="mt-1 rounded-lg border border-zinc-600 bg-zinc-700 p-3 space-y-2 max-h-44 overflow-y-auto">
                                        {suppliers.map((supplierName) => {
                                            const isSelected = (job.suppliers || []).includes(supplierName);
                                            return (
                                                <label key={supplierName} className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-zinc-600 text-zinc-200 hover:border-zinc-500'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSupplierSelection(supplierName)}
                                                        className="h-4 w-4 accent-blue-500"
                                                    />
                                                    <span>{supplierName}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-2 text-xs text-zinc-400">
                                        {(job.suppliers || []).length > 0
                                            ? `${job.suppliers.length} supplier${job.suppliers.length === 1 ? '' : 's'} selected`
                                            : 'Select one or more suppliers to open separate emails.'}
                                    </p>
                                </div>
                            ) : (
                                <FormInput label="Supplier" name="supplier" value={job.supplier} onChange={(e) => setJobField(jobIndex, 'supplier', e.target.value)} as="select">{suppliers.map(s => <option key={s}>{s}</option>)}</FormInput>
                            )}
                            {mode === 'buy' ? (
                                <div className="md:col-span-1">
                                    <FormInput
                                        label="Email Subject"
                                        name="emailSubject"
                                        value={job.emailSubject || ''}
                                        onChange={(e) => setJobField(jobIndex, 'emailSubject', e.target.value)}
                                        placeholder="Leave blank to use each supplier's default subject"
                                    />
                                    <p className="mt-2 text-xs text-zinc-400">
                                        One email will open per selected supplier. Leave this blank to keep each supplier&apos;s default subject.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex gap-2 p-2 bg-zinc-800 rounded-lg">
                                    <button type="button" onClick={() => handleStatusChange('On Hand')} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${job.status === 'On Hand' ? 'bg-blue-800 text-white' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                                        <Check size={16} /> On Hand
                                    </button>
                                    <button type="button" onClick={() => handleStatusChange('Ordered')} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${job.status === 'Ordered' ? 'bg-purple-800 text-white' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                                        <Calendar size={16} /> Ordered
                                    </button>
                                </div>
                            )}
                        </div>
                        {mode !== 'buy' && (
                            <>
                                <FormInput label="Date Ordered" name="createdAt" type="date" value={job.createdAt || ''} onChange={(e) => setJobField(jobIndex, 'createdAt', e.target.value)} />
                                {job.status === 'Ordered' && (
                                    <div className="space-y-3">
                                        <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-800/70 p-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-zinc-200">Expected Arrival Dates</p>
                                                <p className="text-xs text-zinc-400">Turn this on if different materials in the same order should arrive on different dates.</p>
                                            </div>
                                            <label className="flex items-center gap-2 text-sm text-zinc-200">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(job.useItemArrivalDates)}
                                                    onChange={(e) => handleMultipleArrivalDateToggle(e.target.checked)}
                                                    className="h-4 w-4 accent-purple-500"
                                                />
                                                Multiple dates by material
                                            </label>
                                        </div>
                                        {!job.useItemArrivalDates && (
                                            <FormInput
                                                label="Expected Arrival Date"
                                                name="arrivalDate"
                                                type="date"
                                                value={job.arrivalDate}
                                                onChange={(e) => handleSharedArrivalDateChange(e.target.value)}
                                            />
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {job.items.map((item, itemIndex) => (
                            <div key={itemIndex} className="border border-zinc-700 p-4 rounded-lg bg-zinc-800 relative">
                                {!initialData && job.items.length > 1 && (
                                    <button type="button" onClick={() => removeMaterial(jobIndex, itemIndex)} className="absolute top-2 right-2 text-red-400 hover:text-red-300"><X size={18} /></button>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <FormInput
                                        label={`Category #${itemIndex + 1}`}
                                        name={`category-${itemIndex}`}
                                        value={materials[item.materialType]?.category || categories[0] || ''}
                                        onChange={(e) => {
                                            const newCategory = e.target.value;
                                            const firstInCat = materialTypes.find(t => (materials[t]?.category) === newCategory) || '';
                                            setItemField(jobIndex, itemIndex, 'materialType', firstInCat);
                                        }}
                                        as="select"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </FormInput>
                                    <FormInput
                                        label={`Material Type`}
                                        name={`materialType-${itemIndex}`}
                                        value={item.materialType}
                                        onChange={(e) => setItemField(jobIndex, itemIndex, 'materialType', e.target.value)}
                                        as="select"
                                    >
                                        {materialTypes
                                            .filter(t => (materials[t]?.category) === (materials[item.materialType]?.category || categories[0]))
                                            .map(type => <option key={type} value={type}>{type}</option>)}
                                    </FormInput>
                                </div>
                                <p className="text-sm font-medium text-zinc-300 mt-2">Standard Quantities:</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <FormInput label={mode === 'buy' ? '96"x48"' : formatSheetPriceLabel(96, item, materials)} name="qty96" type="number" placeholder="0" value={item.qty96} onChange={(e) => setItemField(jobIndex, itemIndex, 'qty96', e.target.value)} />
                                    <FormInput label={mode === 'buy' ? '120"x48"' : formatSheetPriceLabel(120, item, materials)} name="qty120" type="number" placeholder="0" value={item.qty120} onChange={(e) => setItemField(jobIndex, itemIndex, 'qty120', e.target.value)} />
                                    <FormInput label={mode === 'buy' ? '144"x48"' : formatSheetPriceLabel(144, item, materials)} name="qty144" type="number" placeholder="0" value={item.qty144} onChange={(e) => setItemField(jobIndex, itemIndex, 'qty144', e.target.value)} />
                                </div>
                                <p className="text-sm font-medium text-zinc-300 mt-4">Optional Custom Sheet:</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <FormInput label="Custom Width" name={`customWidth-${itemIndex}`} type="number" placeholder='48' value={item.customWidth} onChange={(e) => setItemField(jobIndex, itemIndex, 'customWidth', e.target.value)} />
                                    <FormInput label="Custom Length" name={`customLength-${itemIndex}`} type="number" placeholder='96' value={item.customLength} onChange={(e) => setItemField(jobIndex, itemIndex, 'customLength', e.target.value)} />
                                    <FormInput label={mode === 'buy' ? 'Custom Quantity' : formatCustomSheetPriceLabel(item, materials)} name={`customQty-${itemIndex}`} type="number" placeholder="0" value={item.customQty} onChange={(e) => setItemField(jobIndex, itemIndex, 'customQty', e.target.value)} />
                                </div>
                                {mode !== 'buy' && job.status === 'Ordered' && job.useItemArrivalDates && (
                                    <FormInput
                                        label="Expected Arrival Date"
                                        name={`arrivalDate-${itemIndex}`}
                                        type="date"
                                        value={item.arrivalDate || ''}
                                        onChange={(e) => setItemField(jobIndex, itemIndex, 'arrivalDate', e.target.value)}
                                    />
                                )}
                                {mode !== 'buy' && (
                                    <FormInput label="Cost per Pound ($)" name="costPerPound" type="number" value={item.costPerPound} onChange={(e) => setItemField(jobIndex, itemIndex, 'costPerPound', e.target.value)} step="0.01" required />
                                )}
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
                        {mode === 'buy' && !isSubmitting && <Mail size={16} />}
                        {isSubmitting ? 'Submitting...' : submitLabel}
                    </Button>
                </div>
            </form>
        </BaseModal>
    );
};