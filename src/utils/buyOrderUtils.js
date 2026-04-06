import { CC_EMAIL, SUPPLIER_INFO } from '../constants/suppliers';
import { STANDARD_LENGTHS } from '../constants/materials';

/**
 * Normalizes line breaks, strips invisible characters, and maps Unicode spaces to ASCII U+0020
 * so plain-text email bodies render with one consistent font (no odd fallback glyphs at line ends).
 */
export function normalizeEmailPlainText(input) {
    if (input == null || typeof input !== 'string') return '';
    let s = input.replace(/\uFEFF/g, '');
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.replace(/[\u200B-\u200D\u2060]/g, '');
    s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
    try {
        s = s.normalize('NFC');
    } catch {
        /* ignore */
    }
    s = s.replace(/[ \t]+$/gm, '');
    s = s.trimEnd();
    return s;
}

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

/** Full email body: greeting, standard intro, sheet block, closing. Exported for Manage Suppliers preview. */
export function formatSupplierEmailBody(info, sheetSectionText) {
    const name = (info?.contactName || '').trim();
    const greeting = name ? `Hi ${name}` : 'Hi';
    const sheet = (sheetSectionText || '').trim();
    return normalizeEmailPlainText(
        `${greeting}\n\nCan I get a quote and lead time for the following:\n\n${sheet}`
    );
}

/** Returned when a buy order has no line items; must not override a saved supplier `emailBody`. */
export const BUY_ORDER_EMPTY_ITEMS_PLACEHOLDER = '[PLEASE LIST ITEMS]';

export function buildBuyOrderEmailBody(items) {
    const normalizedItems = Array.isArray(items) ? items : [];
    if (normalizedItems.length === 0) {
        return BUY_ORDER_EMPTY_ITEMS_PLACEHOLDER;
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

/** Full default email body (greeting + intro + sheet block) when no saved `emailBody` exists. */
export function getDefaultSupplierEmailBody(info, items = []) {
    let sheetSection = '';
    if (info.bodyTemplate && info.bodyTemplate.trim().length > 0) {
        sheetSection = info.bodyTemplate.trim();
    } else {
        sheetSection = buildDefaultItemsBody(info, items);
    }
    return formatSupplierEmailBody(info, sheetSection);
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

    const trimmedCustom = (customBody || '').trim();
    const savedBody = (info.emailBody || '').trim();
    const hasSavedBody = savedBody.length > 0;
    /** True when `customBody` carries real order lines (buy order flow), not the empty-items placeholder. */
    const hasOrderLines =
        trimmedCustom.length > 0 && trimmedCustom !== BUY_ORDER_EMPTY_ITEMS_PLACEHOLDER;

    let fullBody;
    if (hasSavedBody && hasOrderLines) {
        fullBody = `${savedBody}\n\n${trimmedCustom}`;
    } else if (hasSavedBody) {
        fullBody = savedBody;
    } else if (hasOrderLines) {
        fullBody = formatSupplierEmailBody(info, trimmedCustom);
    } else {
        let sheetSection = '';
        if (info.bodyTemplate && info.bodyTemplate.trim().length > 0) {
            sheetSection = info.bodyTemplate.trim();
        } else {
            sheetSection = buildDefaultItemsBody(info, items);
        }
        fullBody = formatSupplierEmailBody(info, sheetSection);
    }
    fullBody = normalizeEmailPlainText(fullBody);
    const body = encodeURIComponent(fullBody);
    const cc = encodeURIComponent((info.ccEmail || CC_EMAIL || '').trim());

    return {
        mailto: `mailto:${info.email || ''}?cc=${cc}&subject=${subject}&body=${body}`,
        subject: resolvedSubject,
        body: fullBody,
        info,
    };
}
