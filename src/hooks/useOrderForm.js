import { useState, useCallback } from 'react';
import { STANDARD_LENGTHS } from '../constants/materials';

function toInputDate(value) {
    if (!value) return '';
    try {
        return new Date(value).toISOString().split('T')[0];
    } catch {
        return '';
    }
}

export function useOrderForm(initialData, materialTypes, suppliers, prefill = null, options = {}) {
    const { multiSupplier = false } = options;

    const getDefaultSupplier = useCallback((preferredSupplier) => {
        if (preferredSupplier && suppliers.includes(preferredSupplier)) {
            return preferredSupplier;
        }
        return suppliers[0] || '';
    }, [suppliers]);

    const getDefaultSuppliers = useCallback((preferredSuppliers = [], preferredSupplier = '') => {
        const normalizedPreferred = Array.isArray(preferredSuppliers)
            ? preferredSuppliers.filter((supplier) => suppliers.includes(supplier))
            : [];
        if (normalizedPreferred.length > 0) {
            return normalizedPreferred;
        }

        const fallbackSupplier = getDefaultSupplier(preferredSupplier);
        return fallbackSupplier ? [fallbackSupplier] : [];
    }, [getDefaultSupplier, suppliers]);

    const createNewItem = useCallback((materialTypeOverride, itemOverride = {}, defaultArrivalDate = '') => ({
        materialType: materialTypeOverride || itemOverride.materialType || (materialTypes && materialTypes.length > 0 ? materialTypes[0] : ''),
        qty96: itemOverride.qty96 ?? '',
        qty120: itemOverride.qty120 ?? '',
        qty144: itemOverride.qty144 ?? '',
        customWidth: itemOverride.customWidth ?? '',
        customLength: itemOverride.customLength ?? '',
        customQty: itemOverride.customQty ?? '',
        costPerPound: itemOverride.costPerPound ?? '',
        arrivalDate: toInputDate(itemOverride.arrivalDate) || defaultArrivalDate || ''
    }), [materialTypes]);

    const createNewJob = useCallback((jobOverride = {}) => {
        const normalizedJobArrivalDate = toInputDate(jobOverride.arrivalDate ?? prefill?.arrivalDate);
        const distinctItemArrivalDates = Array.from(
            new Set(
                (Array.isArray(jobOverride.items) ? jobOverride.items : [])
                    .map((item) => toInputDate(item.arrivalDate))
                    .filter(Boolean)
            )
        );
        const useItemArrivalDates = jobOverride.useItemArrivalDates
            ?? prefill?.useItemArrivalDates
            ?? distinctItemArrivalDates.length > 1;
        const defaultItemArrivalDate = normalizedJobArrivalDate || distinctItemArrivalDates[0] || '';
        const items = Array.isArray(jobOverride.items) && jobOverride.items.length > 0
            ? jobOverride.items.map((item) => createNewItem(item.materialType, item, defaultItemArrivalDate))
            : [createNewItem(prefill?.materialType || jobOverride.materialType, {}, defaultItemArrivalDate)];

        return {
            jobName: jobOverride.jobName ?? '',
            customer: jobOverride.customer ?? '',
            supplier: getDefaultSupplier(jobOverride.supplier ?? prefill?.supplier),
            suppliers: multiSupplier
                ? getDefaultSuppliers(jobOverride.suppliers ?? prefill?.suppliers, jobOverride.supplier ?? prefill?.supplier)
                : [],
            emailSubject: jobOverride.emailSubject ?? prefill?.emailSubject ?? '',
            status: jobOverride.status ?? prefill?.status ?? 'Ordered',
            arrivalDate: normalizedJobArrivalDate,
            createdAt: jobOverride.createdAt ?? '',
            useItemArrivalDates,
            items
        };
    }, [createNewItem, getDefaultSupplier, getDefaultSuppliers, multiSupplier, prefill]);

    const transformInitialData = useCallback((data) => {
        if (!data) return null;

        const sharedArrivalDate = toInputDate(data.arrivalDate || data.details?.[0]?.arrivalDate);
        const distinctItemArrivalDates = Array.from(
            new Set((data.details || []).map((item) => toInputDate(item.arrivalDate)).filter(Boolean))
        );
        const jobData = {
            jobName: data.job || data.jobName || '',
            customer: data.customer || '',
            supplier: data.supplier || data.customer || suppliers[0] || '',
            suppliers: data.suppliers || (data.supplier ? [data.supplier] : []),
            emailSubject: data.requestedEmailSubject || data.emailSubject || '',
            status: data.isFuture ? 'Ordered' : (data.status || 'On Hand'),
            arrivalDate: sharedArrivalDate,
            createdAt: toInputDate(data.date || data.createdAt),
            useItemArrivalDates: distinctItemArrivalDates.length > 1,
            items: []
        };

        const itemsByKey = {};
        (data.details || []).forEach(item => {
            const isStandardLength = STANDARD_LENGTHS.includes(item.length);
            const itemArrivalDate = toInputDate(item.arrivalDate);
            const key = isStandardLength
                ? `${item.materialType}|standard|${itemArrivalDate}`
                : `${item.materialType}|custom|${item.width || 48}|${item.length}|${itemArrivalDate}`;

            if (!itemsByKey[key]) {
                itemsByKey[key] = {
                    materialType: item.materialType,
                    costPerPound: item.costPerPound ?? '',
                    qty96: '',
                    qty120: '',
                    qty144: '',
                    customWidth: '',
                    customLength: '',
                    customQty: '',
                    arrivalDate: itemArrivalDate
                };
            }

            if (isStandardLength) {
                const field = `qty${item.length}`;
                itemsByKey[key][field] = String((parseInt(itemsByKey[key][field] || 0, 10) + 1));
            } else {
                itemsByKey[key].customWidth = String(item.width || 48);
                itemsByKey[key].customLength = String(item.length || '');
                itemsByKey[key].customQty = String((parseInt(itemsByKey[key].customQty || 0, 10) + 1));
            }
        });

        jobData.items = Object.values(itemsByKey);
        return [createNewJob(jobData)];
    }, [createNewJob, suppliers]);

    const transformPrefill = useCallback((data) => {
        if (!data) return null;

        const items = Array.isArray(data.items) && data.items.length > 0
            ? data.items.map((item) => ({
                ...item,
                qty96: item.qty96 ?? '',
                qty120: item.qty120 ?? '',
                qty144: item.qty144 ?? '',
                customWidth: item.customWidth ?? '',
                customLength: item.customLength ?? '',
                customQty: item.customQty ?? '',
                costPerPound: item.costPerPound ?? ''
            }))
            : undefined;

        return [createNewJob({
            jobName: data.jobName || data.job || '',
            customer: data.customer || '',
            supplier: data.supplier || '',
            suppliers: data.suppliers || (data.supplier ? [data.supplier] : []),
            emailSubject: data.requestedEmailSubject || data.emailSubject || '',
            status: data.status === 'On Hand' ? 'On Hand' : 'Ordered',
            arrivalDate: toInputDate(data.arrivalDate),
            createdAt: toInputDate(data.createdAt),
            useItemArrivalDates: data.useItemArrivalDates,
            items
        })];
    }, [createNewJob]);

    const [jobs, setJobs] = useState(() => transformInitialData(initialData) || transformPrefill(prefill) || [createNewJob()]);

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
        const defaultArrivalDate = newJobs[jobIndex].items[0]?.arrivalDate || newJobs[jobIndex].arrivalDate || '';
        newJobs[jobIndex].items.push(createNewItem(null, {}, defaultArrivalDate));
        setJobs(newJobs);
    };

    const removeMaterial = (jobIndex, itemIndex) => {
        const newJobs = [...jobs];
        newJobs[jobIndex].items.splice(itemIndex, 1);
        setJobs(newJobs);
    };

    return { jobs, setJobs, setJobField, setItemField, addJob, removeJob, addMaterial, removeMaterial, resetForm };
}