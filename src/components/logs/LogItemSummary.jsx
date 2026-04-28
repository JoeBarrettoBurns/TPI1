import React, { useMemo } from 'react';

const formatMeasurement = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;

    return Number.isInteger(number)
        ? String(number)
        : number.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};

const getLength = (item) => {
    const length = formatMeasurement(item.length);
    return length ? `${length}"` : null;
};

const summarizeDetails = (details) => {
    if (!Array.isArray(details) || details.length === 0) return [];

    const groups = details.reduce((acc, item) => {
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

const toneClasses = {
    incoming: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/25',
    outgoing: 'bg-rose-500/15 text-rose-200 ring-rose-400/25',
};

export const LogItemSummary = ({ details, tone = 'incoming' }) => {
    const summary = useMemo(() => summarizeDetails(details), [details]);

    if (summary.length === 0) {
        return <span className="text-zinc-400">No item details</span>;
    }

    const qtyTone = toneClasses[tone] || toneClasses.incoming;

    return (
        <div className="flex w-full flex-wrap items-center gap-1.5">
            {summary.map((item) => (
                <span key={`${item.materialType}-${item.length}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-900/50 p-2 text-base leading-none ring-1 ring-inset ring-zinc-700/80">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-base font-bold leading-none ring-1 ring-inset ${qtyTone}`}>
                        Qty {item.quantity}
                    </span>
                    {item.length && (
                        <span className="inline-flex items-center rounded-full bg-sky-500/15 px-3 py-1 text-base font-bold leading-none text-sky-200 ring-1 ring-inset ring-sky-400/25">
                            {item.length}
                        </span>
                    )}
                    <strong className="truncate font-semibold text-cyan-100">{item.materialType}</strong>
                </span>
            ))}
        </div>
    );
};
