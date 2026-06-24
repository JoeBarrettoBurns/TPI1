import { STANDARD_LENGTHS } from '../../constants/materials';

const formatMeasurement = (value: any) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;

    return Number.isInteger(number)
        ? String(number)
        : number.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};

const getLength = (item: any) => {
    const length = formatMeasurement(item.length);
    return length ? `${length}"` : null;
};

export const summarizeDetails = (details: any) => {
    if (!Array.isArray(details) || details.length === 0) return [];

    const groups: Record<string, any> = details.reduce((acc: Record<string, any>, item: any) => {
        const materialType = item.materialType || 'Unknown Material';
        const length = getLength(item);
        const key = `${materialType}|${length || ''}`;

        if (!acc[key]) {
            acc[key] = {
                materialType,
                length,
                quantity: 0,
            };
        }

        acc[key].quantity += 1;
        return acc;
    }, {});

    return Object.values(groups).sort((a, b) => (
        a.materialType.localeCompare(b.materialType) || (a.length || '').localeCompare(b.length || '')
    ));
};

// Standard length column labels (e.g. '96"'), matching the Categories view.
export const STANDARD_LENGTH_LABELS = STANDARD_LENGTHS.map((len) => `${len}"`);

// One entry per material with a per-length-label count map, e.g.
// [{ materialType: '2x2x14GA GALV', counts: { '96"': 5, '120"': 2 } }]
export const groupDetailsByMaterial = (details: any) => {
    const byMaterial = new Map();
    summarizeDetails(details).forEach(({ materialType, length, quantity }) => {
        const label = length || 'N/A';
        if (!byMaterial.has(materialType)) byMaterial.set(materialType, {});
        byMaterial.get(materialType)[label] = quantity;
    });
    return [...byMaterial.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([materialType, counts]) => ({ materialType, counts }));
};

// Ordered length columns to render: the standard lengths always (like the
// Categories view), then any non-standard lengths actually present
// (custom-cut sheets), with 'N/A' last.
export const orderLengthLabels = (labels: any[]) => {
    const present = new Set(labels);
    const extras = [...present]
        .filter((label) => label && label !== 'N/A' && !STANDARD_LENGTH_LABELS.includes(label))
        .sort((a, b) => (parseFloat(a) || Infinity) - (parseFloat(b) || Infinity));
    return [...STANDARD_LENGTH_LABELS, ...extras, ...(present.has('N/A') ? ['N/A'] : [])];
};
