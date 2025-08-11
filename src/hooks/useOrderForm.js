import { useState, useCallback } from 'react';
import { STANDARD_LENGTHS } from '../constants/materials';

export function useOrderForm(initialData, materialTypes, suppliers, preselectedMaterial) {
    const createNewItem = (materialTypeOverride) => ({
        materialType: materialTypeOverride || (materialTypes && materialTypes.length > 0 ? materialTypes[0] : ''),
        qty96: '', qty120: '', qty144: '',
        customWidth: '', customLength: '', customQty: '',
        costPerPound: ''
    });
    const createNewJob = useCallback(() => ({
        jobName: '',
        customer: '',
        supplier: suppliers[0],
        status: 'Ordered',
        arrivalDate: '',
        createdAt: '',
        items: [createNewItem(preselectedMaterial)]
    }), [suppliers, materialTypes, preselectedMaterial]); // Dependencies for useCallback

    const transformInitialData = useCallback((data) => {
        if (!data) return [createNewJob()];

        const arrivalDateISO = data.details[0]?.arrivalDate;
        const arrivalDateForInput = arrivalDateISO ? new Date(arrivalDateISO).toISOString().split('T')[0] : '';

        const jobData = {
            jobName: data.job || '',
            customer: data.customer || '',
            supplier: data.customer || suppliers[0],
            status: data.isFuture ? 'Ordered' : 'On Hand',
            arrivalDate: arrivalDateForInput,
            createdAt: data.date ? new Date(data.date).toISOString().split('T')[0] : '',
            items: []
        };

        const itemsByMaterial = {};
        data.details.forEach(item => {
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
    }, [suppliers, createNewJob]); // Dependencies for useCallback

    const [jobs, setJobs] = useState(() => transformInitialData(initialData));

    const resetForm = useCallback(() => {
        setJobs([createNewJob()]);
    }, [createNewJob]);

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
        newJobs[jobIndex].items.push(createNewItem(null));
        setJobs(newJobs);
    };

    const removeMaterial = (jobIndex, itemIndex) => {
        const newJobs = [...jobs];
        newJobs[jobIndex].items.splice(itemIndex, 1);
        setJobs(newJobs);
    };

    return { jobs, setJobs, setJobField, setItemField, addJob, removeJob, addMaterial, removeMaterial, resetForm };
}