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

        /** Hide internal/rescheduled rows from per-material timeline; keep manual stock edits visible. */
        const skipInventoryItemInMaterialTimeline = (item) => {
            if (item.supplier === 'Rescheduled Return') return true;
            const job = item.job || '';
            if (job.startsWith('MODIFICATION')) {
                return item.supplier !== 'Manual Edit';
            }
            return false;
        };

        const getInventoryGroup = (item) => {
            if (item.materialType !== matType) return;
            if (skipInventoryItemInMaterialTimeline(item)) return;

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
        if ((item.job || '').startsWith('MODIFICATION')) {
            const editSessionKey = item.manualEditSessionId || createdDate;
            return `${item.job}|${editSessionKey}`;
        }
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
                isHistoryOnly: !!item.__historyOnly,
                sourceUsageLog: item.__sourceUsageLog || null,
                materials: {},
                details: [],
                displayDetails: [],
                _detailIds: new Set(),
                _displayDetailIds: new Set(),
                _sourceLogIds: new Set(),
            };
        }

        const group = grouped[key];
        if (!group.date && item.createdAt) group.date = item.createdAt;
        if (!group.supplier && item.supplier) {
            group.supplier = item.supplier;
            group.customer = item.supplier;
        }
        if (!group.sourceUsageLog && item.__sourceUsageLog) {
            group.sourceUsageLog = item.__sourceUsageLog;
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

    const addInventoryItemToGroup = (item, { includeDeletableDetail = true } = {}) => {
        const group = ensureGroup(item);
        if (includeDeletableDetail && pushUniqueDetail(group.details, group._detailIds, item)) {
            addMaterialCount(group, item);
        }
        pushUniqueDetail(group.displayDetails, group._displayDetailIds, item);
    };

    inventory.forEach(item => {
        if ((item.job || '').startsWith('MODIFICATION') && item.returnedByLogEdit) return;
        addInventoryItemToGroup(item);
    });

    usageLog
        .filter(log =>
            (log.status || 'Completed') === 'Completed' &&
            log.job === 'MODIFICATION: REMOVE' &&
            log.customer === 'Manual Edit'
        )
        .forEach(log => {
            (log.details || []).forEach((detail, index) => {
                if (!detail.materialType) return;
                const item = {
                    ...detail,
                    id: detail.id || `${log.id}-${index}-${detail.materialType}-${detail.length}`,
                    createdAt: detail.createdAt || log.createdAt,
                    __historyOnly: true,
                    __sourceLogId: log.id,
                    __sourceUsageLog: { id: log.id, ...log, isAddition: false },
                };
                addInventoryItemToGroup(item);
                const group = ensureGroup(item);
                if (log.id) group._sourceLogIds.add(log.id);
            });
    });

    return Object.values(grouped)
        .map(({ _detailIds, _displayDetailIds, _sourceLogIds, ...group }) => ({
            ...group,
            sourceLogIds: Array.from(_sourceLogIds || []),
        }))
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

function shallowCopyJobMaterials(materials) {
    if (!materials || typeof materials !== 'object') return {};
    const out = {};
    for (const [type, sheets] of Object.entries(materials)) {
        out[type] = Array.isArray(sheets) ? [...sheets] : sheets;
    }
    return out;
}

/** Common plural legal-name tokens → canonical form (pairs with hyphen/space normalize). */
const CUSTOMER_NAME_TOKEN_CANON = {
    SOLUTIONS: 'SOLUTION',
    SYSTEMS: 'SYSTEM',
    SERVICES: 'SERVICE',
    PRODUCTS: 'PRODUCT',
    INDUSTRIES: 'INDUSTRY',
    TECHNOLOGIES: 'TECHNOLOGY',
    MATERIALS: 'MATERIAL',
    GROUPS: 'GROUP',
    SUPPLIES: 'SUPPLY',
    ENTERPRISES: 'ENTERPRISE',
    PARTS: 'PART',
};

function canonicalizeCustomerTokens(upperSpaceSeparated) {
    return upperSpaceSeparated
        .split(' ')
        .filter(Boolean)
        .map((t) => CUSTOMER_NAME_TOKEN_CANON[t] || t)
        .join(' ');
}

/**
 * Normalize customer names so variants merge (e.g. "EI SOLUTION" vs "EI-SOLUTIONS").
 * Uppercase; hyphens/underscores/dots/commas → spaces; & → AND; collapse whitespace;
 * map common plural suffix tokens (SOLUTIONS→SOLUTION).
 */
export function normalizeCustomerKey(customer) {
    if (customer == null || typeof customer !== 'string') return '';
    let s = customer.trim();
    if (!s) return '';
    s = s.toUpperCase();
    s = s.replace(/[\u2013\u2014\u2212]/g, '-');
    s = s.replace(/[-_.]+/g, ' ');
    s = s.replace(/,/g, ' ');
    s = s.replace(/\s*&\s*/g, ' AND ');
    s = s.replace(/\s+/g, ' ').trim();
    s = canonicalizeCustomerTokens(s);
    return s;
}

/**
 * Split job names into purchase order base `JNNNN` and an optional part/rest string.
 * Supported shapes: `J5851_EXT`, `J5815-2IN-146`, `J5788-REPLACEMENT` (underscore or hyphen after the digits).
 * Names that do not start with `J` + digits stay in one leaf group keyed by uppercase full string.
 */
export function parseJobPoParts(raw) {
    const full = String(raw ?? '').trim();
    if (!full) return { baseKey: '', displayBase: '', partSuffix: '', full: '' };
    const m = full.match(/^J(\d+)(?:[_-](.+))?$/i);
    if (m) {
        const displayBase = `J${m[1]}`;
        const baseKey = displayBase.toUpperCase();
        const partSuffix = (m[2] || '').trim();
        return { baseKey, displayBase, partSuffix, full };
    }
    const fk = full.toUpperCase();
    return { baseKey: fk, displayBase: full, partSuffix: '', full };
}

/** Stable id for a customer + job pair derived from usage logs (Use Stock). */
export const customerJobPairId = (customer, jobName) =>
    `${normalizeCustomerKey(customer)}::${(jobName || '').trim().toUpperCase()}`;

/**
 * Customers come from usage logs where Use Stock recorded a customer name.
 * Jobs are grouped under that customer. Rows reuse materials from `allJobs` when the job name matches.
 * `orphanJobs` lists jobs from inventory/logs that never appeared on a usage log with a customer (incoming-only POs, etc.).
 */
export const buildCustomerJobGroups = (usageLog, allJobs = []) => {
    const logs = (usageLog || []).filter(log => (log.status || '') !== 'Archived');

    const usagePairs = logs.filter(log => {
        const jobName = (log.job || '').trim();
        const customer = (log.customer || '').trim();
        if (!jobName || jobName === 'N/A' || jobName.startsWith('MODIFICATION')) return false;
        return Boolean(customer);
    });

    const jobByName = new Map((allJobs || []).map(j => [j.job, j]));

    const parseMs = (iso) => {
        if (!iso) return 0;
        const n = new Date(iso).getTime();
        return Number.isFinite(n) ? n : 0;
    };

    const sortedPairs = [...usagePairs].sort((a, b) => parseMs(b.usedAt || b.createdAt) - parseMs(a.usedAt || a.createdAt));

    const pairMap = new Map();

    sortedPairs.forEach(log => {
        const jobName = log.job.trim();
        const customerLabel = log.customer.trim();
        const id = customerJobPairId(customerLabel, jobName);
        const logDate = log.usedAt || log.createdAt;
        const status = log.status || 'Completed';
        const enrich = jobByName.get(jobName);

        const existing = pairMap.get(id);
        if (!existing) {
            pairMap.set(id, {
                id,
                job: jobName,
                customer: customerLabel,
                supplier: enrich?.supplier,
                date: logDate,
                status,
                materials: shallowCopyJobMaterials(enrich?.materials || {}),
            });
            return;
        }

        if (parseMs(logDate) > parseMs(existing.date)) {
            existing.date = logDate;
        }
        if (status === 'Scheduled' || existing.status === 'Scheduled') {
            existing.status = 'Scheduled';
        }
        if (enrich?.materials && Object.keys(existing.materials || {}).length === 0) {
            existing.materials = shallowCopyJobMaterials(enrich.materials);
        }
    });

    const customerMap = new Map();

    pairMap.forEach(row => {
        const ck = normalizeCustomerKey(row.customer);
        if (!ck) return;
        if (!customerMap.has(ck)) {
            customerMap.set(ck, { jobs: [], labelCounts: new Map() });
        }
        const group = customerMap.get(ck);
        group.jobs.push(row);
        const rawLabel = row.customer.trim();
        group.labelCounts.set(rawLabel, (group.labelCounts.get(rawLabel) || 0) + 1);
    });

    const customerGroups = Array.from(customerMap.entries())
        .map(([customerKey, g]) => {
            const bestLabel = [...g.labelCounts.entries()].sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return b[0].length - a[0].length;
            })[0][0];
            return {
                customerKey,
                customer: bestLabel,
                jobs: g.jobs.sort((a, b) => new Date(b.date) - new Date(a.date)),
            };
        })
        .sort((a, b) => {
            const latestA = Math.max(...a.jobs.map(j => parseMs(j.date)));
            const latestB = Math.max(...b.jobs.map(j => parseMs(j.date)));
            return latestB - latestA;
        });

    const linkedJobNames = new Set([...pairMap.values()].map(r => r.job));

    const orphanJobs = (allJobs || [])
        .filter(j => j.job && !linkedJobNames.has(j.job))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    return { customerGroups, orphanJobs };
};