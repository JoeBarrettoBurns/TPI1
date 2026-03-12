import { CC_EMAIL, SUPPLIER_INFO } from '../constants/suppliers';
import { STANDARD_LENGTHS } from '../constants/materials';

function normalizeSupplierKey(supplier) {
    return (supplier || '').toUpperCase().replace(/\s+/g, '_');
}

export function getSupplierEmailInfo(supplier, supplierInfoOverrides) {
    const supplierKey = normalizeSupplierKey(supplier);
    const override = supplierInfoOverrides?.[supplierKey];
    const fallback = SUPPLIER_INFO[supplierKey] || SUPPLIER_INFO.DEFAULT;
    return {
        ...SUPPLIER_INFO.DEFAULT,
        ...fallback,
        ...override,
        ccEmail: (override?.ccEmail || fallback?.ccEmail || CC_EMAIL || '').trim(),
    };
}

function formatLineItemSizes(item) {
    const lines = [];

    [...STANDARD_LENGTHS].sort((a, b) => b - a).forEach((length) => {
        const qty = parseInt(item?.[`qty${length}`] || 0, 10);
        if (qty > 0) {
            lines.push(`${length}"x48" -QTY: ${qty}`);
        }
    });

    const customQty = parseInt(item?.customQty || 0, 10);
    const customWidth = parseFloat(item?.customWidth || 0);
    const customLength = parseFloat(item?.customLength || 0);
    if (customQty > 0 && customWidth > 0 && customLength > 0) {
        lines.push(`${customLength}"x${customWidth}" -QTY: ${customQty}`);
    }

    return lines;
}

export function buildBuyOrderEmailBody(items) {
    const normalizedItems = Array.isArray(items) ? items : [];
    if (normalizedItems.length === 0) {
        return 'Please provide a quote for the following items:\n\n[PLEASE LIST ITEMS]';
    }

    return normalizedItems.map((item) => {
        const itemLines = formatLineItemSizes(item);
        const header = item?.materialType || 'Material';
        if (itemLines.length === 0) {
            return `${header}\nRequested Quantity: [PLEASE SPECIFY]`;
        }
        return [header, ...itemLines].join('\n');
    }).join('\n\n').trim();
}

function buildDefaultItemsBody(info, items) {
    if (info.bodyMaterial) {
        return (
            `${info.bodyMaterial}\n` +
            `144"x48" -QTY:\n` +
            `120"x48" -QTY:\n` +
            `96"x48" -QTY:`
        );
    }

    return buildBuyOrderEmailBody(items);
}

export function createSupplierMailtoLink({
    supplier,
    items = [],
    supplierInfoOverrides,
    customBody = '',
    customSubject = '',
}) {
    const info = getSupplierEmailInfo(supplier, supplierInfoOverrides);
    const resolvedSubject = customSubject && customSubject.trim().length > 0
        ? customSubject.trim()
        : (info.subject || 'Quote Request');
    const subject = encodeURIComponent(resolvedSubject);
    const greetingName = info.contactName ? `Hi ${info.contactName},` : 'Hello,';

    let bodyContent = '';
    if (customBody && customBody.trim().length > 0) {
        bodyContent = customBody.trim();
    } else if (info.bodyTemplate && info.bodyTemplate.trim().length > 0) {
        bodyContent = info.bodyTemplate.trim();
    } else {
        bodyContent = buildDefaultItemsBody(info, items);
    }

    const body = encodeURIComponent(`${greetingName}\n\n${bodyContent}\n\nThank you.`);
    const cc = encodeURIComponent((info.ccEmail || CC_EMAIL || '').trim());

    return {
        mailto: `mailto:${info.email || ''}?cc=${cc}&subject=${subject}&body=${body}`,
        subject: resolvedSubject,
        body: `${greetingName}\n\n${bodyContent}\n\nThank you.`,
        info,
    };
}
