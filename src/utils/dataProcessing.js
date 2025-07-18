import { MATERIAL_TYPES, STANDARD_LENGTHS, MATERIALS } from '../constants/materials';

export const getGaugeFromMaterial = (materialType) => {
    const match = materialType.match(/^(\d{2}GA)/);
    if (match) return match[1].replace('GA', '');
    const thicknessMatch = materialType.match(/(\d\.\d+)/);
    if (thicknessMatch) return thicknessMatch[1] + '"';
    return 'N/A';
};

export const calculateInventorySummary = (inventory) => {
    const summary = {};
    MATERIAL_TYPES.forEach(type => {
        summary[type] = { ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {}), custom: 0 };
    });
    inventory.filter(item => item.status !== 'Ordered').forEach(item => {
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

export const calculateIncomingSummary = (inventory) => {
    const summary = {};
    MATERIAL_TYPES.forEach(type => {
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
            groupedUsage[log.id] = {
                id: log.id, job: log.job, date: log.usedAt, customer: log.customer || 'N/A', isAddition: false, isDeletable: true,
                isFuture: false, details: log.details, ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {})
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

const calculateSheetCost = (item) => {
    const material = MATERIALS[item.materialType];
    if (!material || !item.costPerPound) return 0;
    const weight = (item.width * item.length * material.thickness * material.density);
    return weight * item.costPerPound;
};

export const calculateCostBySupplier = (inventory) => {
    const costMap = {};
    inventory.forEach(item => {
        if (item.supplier && item.costPerPound > 0) {
            const cost = calculateSheetCost(item);
            costMap[item.supplier] = (costMap[item.supplier] || 0) + cost;
        }
    });
    return Object.entries(costMap).map(([name, value]) => ({ name, value }));
};

export const calculateQuantityByMaterial = (inventory) => {
    const quantityMap = {};
    inventory.forEach(item => {
        if (item.materialType) {
            quantityMap[item.materialType] = (quantityMap[item.materialType] || 0) + 1;
        }
    });
    return Object.entries(quantityMap).map(([name, quantity]) => ({ name, quantity }));
};
