// src/utils/dataProcessing.js

import { STANDARD_LENGTHS } from '../constants/materials';

// Helper function to calculate the cost of a single sheet based on its properties
export const calculateSheetCost = (item, materials) => {
    const material = materials[item.materialType];
    if (!material || !item.costPerPound || item.costPerPound <= 0) return 0;
    // Assume standard width if not specified, for calculation purposes
    const width = item.width || 48;
    const weight = (width * item.length * material.thickness * material.density);
    return weight * item.costPerPound;
};

export const groupInventoryByJob = (inventory) => {
    const grouped = {};
    inventory.forEach(item => {
        // Use a more robust key that includes the supplier
        const key = `${item.job || 'N/A'}|${item.supplier}|${item.createdAt.split('T')[0]}`;
        if (!grouped[key]) {
            grouped[key] = {
                id: key, // The synthetic ID for the group
                job: item.job || 'N/A',
                date: item.createdAt,
                supplier: item.supplier,
                customer: item.supplier, // For consistency with log items
                isFuture: item.status === 'Ordered',
                isReceived: !!item.dateReceived,
                isAddition: true, // This was the missing piece
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


// --- Existing Functions (Unchanged) ---
export const getGaugeFromMaterial = (materialType) => {
    const match = materialType.match(/^(\d{2}GA)/);
    if (match) return match[1].replace('GA', '');
    const thicknessMatch = materialType.match(/(\d\.\d+)/);
    if (thicknessMatch) return thicknessMatch[1] + '"';
    return 'N/A';
};

export const calculateInventorySummary = (inventory, materialTypes) => {
    const summary = {};
    materialTypes.forEach(type => {
        summary[type] = { ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {}), custom: 0 };
    });
    inventory.filter(item => item.status === 'On Hand').forEach(item => {
        if (summary[item.materialType]) {
            if (STANDARD_LENGTHS.includes(item.length)) {
                summary[item.materialType][item.length]++;
            } else {
                summary[item.materialType].custom++;
            }
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

export const calculateMaterialTransactions = (materialsInCategory, inventory, usageLog) => {
    const allTransactions = {};
    materialsInCategory.forEach(matType => {
        const groupedInventory = {};
        inventory.filter(item => item.materialType === matType).forEach(item => {
            const key = `${item.createdAt}-${item.job || 'stock'}-${item.supplier}`;
            if (!groupedInventory[key]) {
                groupedInventory[key] = {
                    id: key, job: item.job || item.supplier, date: item.createdAt, customer: item.supplier, isAddition: true, isDeletable: true,
                    isFuture: item.status === 'Ordered', details: [], ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {})
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
                id: log.id, job: log.job, date: log.usedAt, customer: log.customer || 'N/A', isAddition: false,
                isDeletable: true,
                isFulfillable: isScheduled,
                isFuture: isScheduled,
                details: log.details, ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {})
            };
            log.details.forEach(detail => {
                if (detail.materialType === matType && STANDARD_LENGTHS.includes(detail.length)) {
                    groupedUsage[log.id][detail.length]--;
                }
            });
        });
        allTransactions[matType] = [...Object.values(groupedInventory), ...Object.values(groupedUsage)].sort((a, b) => new Date(b.date) - new Date(a.date));
    });
    return allTransactions;
};


export const calculateCostBySupplier = (inventory, materials) => {
    const costMap = {};
    inventory.forEach(item => {
        if (item.supplier && item.costPerPound > 0) {
            const cost = calculateSheetCost(item, materials);
            costMap[item.supplier] = (costMap[item.supplier] || 0) + cost;
        }
    });
    return Object.entries(costMap).map(([name, value]) => ({ name, value }));
};


export const calculateAnalyticsByCategory = (inventory, materials) => {
    const categoryMap = {};

    const materialMap = {};
    inventory.forEach(item => {
        if (!materialMap[item.materialType]) {
            materialMap[item.materialType] = {
                quantity: 0,
                cost: 0,
                category: materials[item.materialType]?.category,
            };
        }
        materialMap[item.materialType].quantity += 1;
        materialMap[item.materialType].cost += calculateSheetCost(item, materials);
    });

    Object.entries(materialMap).forEach(([materialName, data]) => {
        const { category, quantity, cost } = data;
        if (category) {
            if (!categoryMap[category]) {
                categoryMap[category] = [];
            }
            categoryMap[category].push({
                name: materialName,
                quantity,
                cost,
            });
        }
    });

    return categoryMap;
};