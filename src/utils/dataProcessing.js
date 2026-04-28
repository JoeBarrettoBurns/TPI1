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
            'custom': 0,
            'total': 0,
        };
    });

    inventory.forEach(item => {
        if (item.status === 'On Hand' && summary[item.materialType]) {
            if (STANDARD_LENGTHS.includes(item.length)) {
                summary[item.materialType][item.length]++;
            } else {
                summary[item.materialType]['custom']++;
            }
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

// Summarize scheduled outgoing usage by material and length
export const calculateScheduledOutgoingSummary = (usageLog, materialTypes) => {
    const summary = {};
    materialTypes.forEach(type => {
        summary[type] = {
            lengths: { ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {}), custom: 0 },
            totalCount: 0,
            earliestUseDate: null,
        };
    });

    (usageLog || [])
        .filter(log => (log.status || '') === 'Scheduled')
        .forEach(log => {
            (log.details || []).forEach(d => {
                const type = d.materialType;
                if (!summary[type]) return;
                if (STANDARD_LENGTHS.includes(d.length)) {
                    summary[type].lengths[d.length]++;
                } else {
                    summary[type].lengths.custom++;
                }
                summary[type].totalCount++;
            });
            if (log.usedAt) {
                const current = summary[(log.details?.[0]?.materialType) || '']?.earliestUseDate;
                const ts = log.usedAt;
                if (!current || new Date(ts) < new Date(current)) {
                    const typeForEarliest = (log.details?.[0]?.materialType) || null;
                    if (typeForEarliest && summary[typeForEarliest]) {
                        summary[typeForEarliest].earliestUseDate = ts;
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

        const isManualInventoryAdjustment = (item) => (
            (item.job || '').startsWith('MODIFICATION') ||
            (item.supplier === 'Manual Edit') ||
            (item.supplier === 'Rescheduled Return')
        );

        const getInventoryGroup = (item) => {
            if (item.materialType !== matType) return;
            if (isManualInventoryAdjustment(item)) return;

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
                    displayDetails: [],
                    _detailIds: new Set(),
                    _displayDetailIds: new Set(),
                    ...STANDARD_LENGTHS.reduce((acc, len) => ({ ...acc, [len]: 0 }), {})
                };
            }

            return groupedInventory[key];
        };

        const addInventoryItemToTimeline = (item, { includeActionDetail = true } = {}) => {
            const group = getInventoryGroup(item);
            if (!group) return;

            if (item.arrivalDate && (!group.arrivalDate || new Date(item.arrivalDate) > new Date(group.arrivalDate))) {
                group.arrivalDate = item.arrivalDate;
            }
            const dedupeKey = item.id || `${item.materialType}|${item.length}|${item.createdAt}|${item.supplier}|${item.job}`;

            if (includeActionDetail && !group._detailIds.has(dedupeKey)) {
                group._detailIds.add(dedupeKey);
                group.details.push(item);
            }
            if (!group._displayDetailIds.has(dedupeKey)) {
                group._displayDetailIds.add(dedupeKey);
                if (STANDARD_LENGTHS.includes(item.length)) {
                    group[item.length]++;
                }
                group.displayDetails.push(item);
            }
        };

        inventory.forEach(item => {
            addInventoryItemToTimeline(item);
        });

        (usageLog || [])
            .filter(log => (log.status || 'Completed') === 'Completed')
            .forEach(log => {
                (log.details || []).forEach(detail => {
                    if (!detail.id) return;
                    addInventoryItemToTimeline(
                        {
                            ...detail,
                            createdAt: detail.createdAt || log.createdAt,
                        },
                        { includeActionDetail: false }
                    );
                });
            });

        const groupedUsage = {};
        (usageLog || []).filter(log => Array.isArray(log.details) && log.details.some(d => d.materialType === matType)).forEach(log => {
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
        
        const transactions = [
            ...Object.values(groupedInventory).map(({ _detailIds, _displayDetailIds, ...rest }) => ({
                ...rest,
                isDeletable: rest.details.length > 0
            })), 
            ...Object.values(groupedUsage)
        ];
        
        transactions.sort((a, b) => {
            const dateA = a.isAddition ? (a.arrivalDate || a.date) : (a.usedAt || a.date);
            const dateB = b.isAddition ? (b.arrivalDate || b.date) : (b.usedAt || b.date);
            return new Date(dateB) - new Date(dateA);
        });

        allTransactions[matType] = transactions;
    });
    return allTransactions;
};

export const groupInventoryByJob = (inventory, usageLog = []) => {
    const grouped = {};

    const getGroupKey = (item) => {
        const createdDate = item.createdAt ? item.createdAt.split('T')[0] : 'unknown-date';
        return `${item.job || 'N/A'}|${createdDate}`;
    };

    const ensureGroup = (item) => {
        const key = getGroupKey(item);
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
                details: [],
                displayDetails: [],
                _detailIds: new Set(),
                _displayDetailIds: new Set(),
            };
        }

        const group = grouped[key];
        if (!group.date && item.createdAt) group.date = item.createdAt;
        if (!group.supplier && item.supplier) {
            group.supplier = item.supplier;
            group.customer = item.supplier;
        }
        group.isFuture = group.isFuture || item.status === 'Ordered';
        group.isReceived = group.isReceived || !!item.dateReceived;
        return group;
    };

    const addMaterialCount = (group, item) => {
        if (!group.materials[item.materialType]) {
            group.materials[item.materialType] = {};
        }
        if (!group.materials[item.materialType][item.length]) {
            group.materials[item.materialType][item.length] = 0;
        }
        group.materials[item.materialType][item.length]++;
    };

    const pushUniqueDetail = (target, ids, item) => {
        const dedupeKey = item.id || `${item.materialType}|${item.length}|${item.createdAt}|${item.supplier}|${item.job}`;
        if (ids.has(dedupeKey)) return false;
        ids.add(dedupeKey);
        target.push(item);
        return true;
    };

    inventory.forEach(item => {
        const group = ensureGroup(item);
        if (pushUniqueDetail(group.details, group._detailIds, item)) {
            addMaterialCount(group, item);
        }
        pushUniqueDetail(group.displayDetails, group._displayDetailIds, item);
    });

    return Object.values(grouped)
        .map(({ _detailIds, _displayDetailIds, ...group }) => group)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
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
            .flatMap(log => (log.details || []).map((d, index) => ({
                ...d,
                status: 'Used',
                id: d.id || `${log.id}-${index}-${d.materialType}-${d.length}`,
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
            const sheetWithId = { ...sheet, id: sheet.id || `${key}-${sheet.materialType}-${crypto.randomUUID()}` };
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