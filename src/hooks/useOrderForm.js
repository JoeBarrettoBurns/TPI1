import { useState } from 'react';
import { MATERIAL_TYPES, SUPPLIERS, STANDARD_LENGTHS } from '../constants/materials';

const createNewItem = () => ({ materialType: MATERIAL_TYPES[0], qty96: '', qty120: '', qty144: '', customWidth: '', customLength: '', customQty: '', costPerPound: '' });
const createNewJob = () => ({ jobName: '', customer: '', supplier: SUPPLIERS[0], status: 'Ordered', arrivalDate: '', items: [createNewItem()] });

// In src/hooks/useOrderForm.js

const transformInitialData = (initialData) => {
    if (!initialData) return [createNewJob()];

    // Get the saved ISO date string
    const arrivalDateISO = initialData.details[0]?.arrivalDate;
    // Convert it back to a YYYY-MM-DD string for the date input field
    const arrivalDateForInput = arrivalDateISO ? new Date(arrivalDateISO).toISOString().split('T')[0] : '';

    const jobData = {
        jobName: initialData.job || '',
        customer: initialData.customer || '',
        supplier: initialData.customer || SUPPLIERS[0],
        status: initialData.isFuture ? 'Ordered' : 'On Hand',
        arrivalDate: arrivalDateForInput, // Use the formatted date
        items: []
    };

    const itemsByMaterial = {};
    initialData.details.forEach(item => {
        if (!itemsByMaterial[item.materialType]) {
            itemsByMaterial[item.materialType] = {
                materialType: item.materialType, costPerPound: item.costPerPound,
                qty96: 0, qty120: 0, qty144: 0,
            };
        }
        if (STANDARD_LENGTHS.includes(item.length)) {
            itemsByMaterial[item.materialType][`qty${item.length}`]++;
        }
    });
    jobData.items = Object.values(itemsByMaterial);
    return [jobData];
};

export function useOrderForm(initialData) {
    const [jobs, setJobs] = useState(() => transformInitialData(initialData));

    const setJobField = (jobIndex, field, value) => {
        const newJobs = [...jobs];
        newJobs[jobIndex][field] = value;
        setJobs(newJobs);
    };

    const setItemField = (jobIndex, itemIndex, field, value) => {
        const newJobs = [...jobs];
        newJobs[jobIndex].items[itemIndex][field] = value;
        setJobs(newJobs);
    };

    const addJob = () => setJobs([...jobs, createNewJob()]);
    const removeJob = (jobIndex) => setJobs(jobs.filter((_, i) => i !== jobIndex));

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

    return { jobs, setJobs, setJobField, setItemField, addJob, removeJob, addMaterial, removeMaterial };
}