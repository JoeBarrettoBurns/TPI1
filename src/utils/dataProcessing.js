import { STANDARD_LENGTHS } from '../constants/materials';

export const getGaugeFromMaterial = (materialType) => {
    if (!materialType) return null;
    const match = materialType.match(/(\d+)\s*ga/i);
    return match ? parseInt(match[1], 10) : null;
};

export const calculateInventorySummary = (inventory, materialTypes) => {
    const summary = {};
    materialTypes.forEach(type => {
        summary[type] = {
            ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {}),
            'total': 0,
        };
    });

    inventory.forEach(item => {
        if (item.status === 'On Hand' && summary[item.materialType] && STANDARD_LENGTHS.includes(item.length)) {
            summary[item.materialType][item.length]++;
            summary[item.materialType]['total']++;
        }
    });
    return summary;
};

export const calculateIncomingSummary = (inventory, materialTypes) => {
    const summary = {};
    materialTypes.forEach(type => {
        summary[type] = {
            lengths: { ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {}), custom: 0 },
            totalCount: 0,
            latestArrivalDate: null,
        };
    });
    inventory.filter(item => item.status === 'Ordered').forEach(item => {
        if (summary[item.materialType]) {
            if (STANDARD_LENGTHS.includes(item.length)) {
                summary[item.materialType].lengths[item.length]++;
            } else {
                summary[item.materialType].lengths.custom++;
            }
            summary[item.materialType].totalCount++;
            if (item.arrivalDate) {
                if (!summary[item.materialType].latestArrivalDate || new Date(item.arrivalDate) > new Date(summary[item.materialType].latestArrivalDate)) {
                    summary[item.materialType].latestArrivalDate = item.arrivalDate;
                }
            }
        }
    });
    return summary;
};

export const calculateSheetCost = (sheet, materials) => {
    const materialInfo = materials[sheet.materialType];
    if (!materialInfo || !materialInfo.density || !materialInfo.thickness || !sheet.costPerPound) return 0;
    const volume = (sheet.length * (sheet.width || 48) * materialInfo.thickness);
    const weight = volume * materialInfo.density;
    return weight * sheet.costPerPound;
};

export const calculateMaterialTransactions = (materialTypes, inventory, usageLog) => {
    const allTransactions = {};
    materialTypes.forEach(matType => {
        const groupedInventory = {};
        inventory
            .filter(item => item.materialType === matType)
            // Hide internal/server-side only inventory adjustments from UI transactions
            .filter(item => !(
                (item.job || '').startsWith('MODIFICATION') ||
                (item.supplier === 'Manual Edit') ||
                (item.supplier === 'Rescheduled Return')
            ))
            .forEach(item => {
            const key = `${item.createdAt}-${item.job || 'stock'}-${item.supplier}`;
            if (!groupedInventory[key]) {
                groupedInventory[key] = {
                    id: key, job: item.job || item.supplier, 
                    date: item.createdAt, 
                    arrivalDate: item.arrivalDate, // <-- Add arrivalDate
                    customer: item.supplier, 
                    isAddition: true, 
                    isDeletable: true,
                    isFuture: item.status === 'Ordered', 
                    details: [], 
                    ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {})
                };
            }
            if (STANDARD_LENGTHS.includes(item.length)) {
                groupedInventory[key][item.length]++;
            }
            groupedInventory[key].details.push(item);
        });

        const groupedUsage = {};
        usageLog.filter(log => Array.isArray(log.details) && log.details.some(d => d.materialType === matType)).forEach(log => {
            const isModification = (log.job || '').startsWith('MODIFICATION');
            if (isModification && log.qty >= 0) return;

            const isScheduled = log.status === 'Scheduled';

            groupedUsage[log.id] = {
                id: log.id, job: log.job, 
                date: log.createdAt, // Keep original creation date for sorting
                usedAt: log.usedAt, // <-- Add usedAt
                customer: log.customer || 'N/A', 
                isAddition: false,
                isDeletable: true,
                isFulfillable: isScheduled,
                isFuture: isScheduled,
                details: log.details, 
                ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {})
            };
            log.details.forEach(detail => {
                if (detail.materialType === matType && STANDARD_LENGTHS.includes(detail.length)) {
                    groupedUsage[log.id][detail.length]--;
                }
            });
        });
        
        const transactions = [...Object.values(groupedInventory), ...Object.values(groupedUsage)];
        
        transactions.sort((a, b) => {
            const dateA = a.isAddition ? (a.arrivalDate || a.date) : (a.usedAt || a.date);
            const dateB = b.isAddition ? (b.arrivalDate || b.date) : (b.usedAt || b.date);
            return new Date(dateB) - new Date(dateA);
        });

        allTransactions[matType] = transactions;
    });
    return allTransactions;
};

export const groupInventoryByJob = (inventory) => {
    const grouped = {};
    inventory.forEach(item => {
        const key = `${item.job || 'N/A'}|${item.createdAt.split('T')[0]}`;
        if (!grouped[key]) {
            grouped[key] = {
                id: key,
                job: item.job || 'N/A',
                date: item.createdAt,
                supplier: item.supplier,
                customer: item.supplier,
                isFuture: item.status === 'Ordered',
                isReceived: !!item.dateReceived,
                isAddition: true,
                materials: {},
                details: []
            };
        }
        if (!grouped[key].materials[item.materialType]) {
            grouped[key].materials[item.materialType] = {};
        }
        if (!grouped[key].materials[item.materialType][item.length]) {
            grouped[key].materials[item.materialType][item.length] = 0;
        }
        grouped[key].materials[item.materialType][item.length]++;
        grouped[key].details.push(item);
    });
    return Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const calculateCostBySupplier = (inventory, materials) => {
    const costData = {};

    inventory.forEach(sheet => {
        if (!sheet.supplier || sheet.costPerPound <= 0) return;

        const cost = calculateSheetCost(sheet, materials);
        if (cost === 0) return;

        // Normalize supplier name to uppercase to group them correctly.
        const normalizedSupplier = sheet.supplier.toUpperCase();

        if (!costData[normalizedSupplier]) {
            costData[normalizedSupplier] = { totalCost: 0, totalSheets: 0 };
        }

        costData[normalizedSupplier].totalCost += cost;
        costData[normalizedSupplier].totalSheets++;
    });

    return Object.entries(costData).map(([supplier, data]) => ({
        name: supplier,
        value: data.totalCost
    }));
};

export const calculateAnalyticsByCategory = (inventory, materials) => {
    const categoryData = {};

    inventory.forEach(sheet => {
        const materialInfo = materials[sheet.materialType];
        if (!materialInfo) return;

        const category = materialInfo.category;
        const cost = calculateSheetCost(sheet, materials);

        if (!categoryData[category]) {
            categoryData[category] = {};
        }

        if (!categoryData[category][sheet.materialType]) {
            categoryData[category][sheet.materialType] = { name: sheet.materialType, quantity: 0, cost: 0 };
        }

        categoryData[category][sheet.materialType].quantity++;
        if (sheet.status === 'On Hand') {
            categoryData[category][sheet.materialType].cost += cost;
        }
    });

    const result = {};
    for (const category in categoryData) {
        result[category] = Object.values(categoryData[category]);
    }
    return result;
};

export const groupLogsByJob = (inventory, usageLog) => {
    const jobs = {};

    // First pass: create job entries from both sources, only if a job name exists
    inventory.forEach(item => {
        if (!item.job || item.job === 'N/A' || item.job.startsWith('MODIFICATION')) return;
        const key = item.job;
        if (!jobs[key]) {
            jobs[key] = {
                id: key,
                job: item.job,
                supplier: item.supplier,
                date: item.createdAt,
                status: 'In Stock',
                materials: {},
            };
        }
    });

    usageLog.forEach(log => {
        if (!log.job || log.job === 'N/A' || log.job.startsWith('MODIFICATION')) return;
        const key = log.job;
        if (!jobs[key]) {
            jobs[key] = {
                id: key,
                job: log.job,
                customer: log.customer,
                date: log.usedAt || log.createdAt,
                status: log.status || 'Completed',
                materials: {},
            };
        }
        jobs[key].status = log.status || 'Completed';
        jobs[key].customer = jobs[key].customer || log.customer;
        jobs[key].date = log.usedAt || log.createdAt;
    });

    // Second pass: collate all sheets under the correct job
    const allSheets = [
        ...inventory,
        ...usageLog
            .filter(log => (log.status || 'Completed') === 'Completed')
            .flatMap(log => (log.details || []).map(d => ({
                ...d,
                status: 'Used',
                id: d.id || `${log.id}-${d.materialType}`,
                job: log.job,
                customer: log.customer
            })))
    ];

    allSheets.forEach(sheet => {
        if (!sheet.job || sheet.job === 'N/A' || sheet.job.startsWith('MODIFICATION')) return;
        const key = sheet.job;
        if (jobs[key]) {
            if (!jobs[key].materials[sheet.materialType]) {
                jobs[key].materials[sheet.materialType] = [];
            }
            const sheetWithId = { ...sheet, id: sheet.id || `${key}-${sheet.materialType}-${Math.random()}` };
            jobs[key].materials[sheet.materialType].push(sheetWithId);
        }
    });

    // Clean up materials to remove duplicates
    Object.values(jobs).forEach(job => {
        for (const mat in job.materials) {
            job.materials[mat] = Array.from(new Map(job.materials[mat].map(item => [item.id, item])).values());
        }
    });

    return Object.values(jobs).sort((a, b) => new Date(b.date) - new Date(a.date));
};