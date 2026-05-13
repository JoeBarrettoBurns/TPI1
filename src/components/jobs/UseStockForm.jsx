import React, { useState } from 'react';
import { X, Plus, Calendar, Minus } from 'lucide-react';
import { Button } from '../common/Button';
import { FormInput } from '../common/FormInput';
import { ErrorMessage } from '../common/ErrorMessage';
import { STANDARD_LENGTHS } from '../../constants/materials';
import { formatUseStockJobLabel } from '../../utils/dataProcessing';

export const UseStockForm = ({ onSave, inventory, materialTypes, inventorySummary, incomingSummary, suppliers }) => {
    const createNewItem = () => ({
        materialType: materialTypes[0] || '',
        ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [`qty${len}`]: '' }), {})
    });

    const createNewJob = () => ({
        jobName: '',
        jobNumber: '',
        jobSection: '',
        customer: '',
        items: [createNewItem()]
    });

    const [jobs, setJobs] = useState([createNewJob()]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [options, setOptions] = useState({ isScheduled: false, scheduledDate: '' });

    const handleJobChange = (jobIndex, field, value) => {
        const newJobs = [...jobs];
        newJobs[jobIndex][field] = value;
        setJobs(newJobs);
    };

    const handleItemChange = (jobIndex, itemIndex, field, value) => {
        const newJobs = [...jobs];
        newJobs[jobIndex].items[itemIndex][field] = value;
        setJobs(newJobs);
    };

    const addMaterial = (jobIndex) => {
        const newJobs = [...jobs];
        newJobs[jobIndex].items.push(createNewItem());
        setJobs(newJobs);
    };

    const removeMaterial = (jobIndex, itemIndex) => {
        const newJobs = [...jobs];
        newJobs[jobIndex].items.splice(itemIndex, 1);
        setJobs(newJobs);
    };

    const resetForm = () => {
        setJobs([createNewJob()]);
        setOptions({ isScheduled: false, scheduledDate: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (options.isScheduled && !options.scheduledDate) {
            setError('Please select a scheduled date.');
            return;
        }

        if (!formatUseStockJobLabel(jobs[0].jobNumber, jobs[0].jobSection)) {
            setError('Enter a Job #.');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSave(jobs, options);
            const jobLabel = formatUseStockJobLabel(jobs[0].jobNumber, jobs[0].jobSection) || jobs[0].jobName;
            setSuccessMessage(`Successfully logged usage for "${jobLabel}".`);
            resetForm();
        } catch (err) {
            console.error("Submission error:", err);
            setError(err.message || "An error occurred during submission.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const job = jobs[0]; // Assuming one job at a time for this form
    const jobIndex = 0;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput label="Job #" name="jobNumber" value={job.jobNumber} onChange={(e) => handleJobChange(jobIndex, 'jobNumber', (e.target.value || '').toUpperCase())} required style={{ textTransform: 'uppercase' }} placeholder="e.g. J5851 or 5851" />
                    <FormInput label="Section" name="jobSection" value={job.jobSection} onChange={(e) => handleJobChange(jobIndex, 'jobSection', (e.target.value || '').toUpperCase())} style={{ textTransform: 'uppercase' }} placeholder="Optional" />
                    <div className="md:col-span-2">
                        <FormInput label="Customer" name="customer" value={job.customer} onChange={(e) => handleJobChange(jobIndex, 'customer', (e.target.value || '').toUpperCase())} required style={{ textTransform: 'uppercase' }} />
                    </div>
                </div>

                <div className="flex gap-4 p-2 bg-zinc-900/50 rounded-lg">
                    <button type="button" onClick={() => setOptions({ ...options, isScheduled: false })} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${!options.isScheduled ? 'bg-blue-800 text-white' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                        <Minus size={16} /> Use Now
                    </button>
                    <button type="button" onClick={() => setOptions({ ...options, isScheduled: true })} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${options.isScheduled ? 'bg-purple-800 text-white' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                        <Calendar size={16} /> Schedule
                    </button>
                </div>

                {options.isScheduled && (
                    <FormInput label="Scheduled Date" type="date" value={options.scheduledDate} onChange={(e) => setOptions({ ...options, scheduledDate: e.target.value })} required />
                )}

                {job.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="border border-zinc-700 p-4 rounded-lg bg-zinc-900/50 relative">
                        {job.items.length > 1 && (
                            <button type="button" onClick={() => removeMaterial(jobIndex, itemIndex)} className="absolute top-2 right-2 text-red-400 hover:text-red-300"><X size={18} /></button>
                        )}
                        <FormInput as="select" label={`Material #${itemIndex + 1}`} value={item.materialType} onChange={(e) => handleItemChange(jobIndex, itemIndex, 'materialType', e.target.value)}>
                            {materialTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </FormInput>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {STANDARD_LENGTHS.map(len => (
                                <FormInput
                                    key={len}
                                    label={`${len}"x48"`}
                                    type="number"
                                    placeholder="0"
                                    value={item[`qty${len}`]}
                                    onChange={(e) => handleItemChange(jobIndex, itemIndex, `qty${len}`, e.target.value)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {error && <ErrorMessage message={error} />}
            {successMessage && <div className="p-3 bg-green-500/20 text-green-300 rounded-lg">{successMessage}</div>}

            <div className="flex justify-between items-center pt-4 border-t border-zinc-700">
                <Button variant="success" onClick={() => addMaterial(jobIndex)}>
                    <Plus size={16} /> Add Material
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Logging...' : 'Log Usage'}
                </Button>
            </div>
        </form>
    );
};