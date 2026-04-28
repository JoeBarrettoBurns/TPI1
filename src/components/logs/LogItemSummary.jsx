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

const chunkItems = (items, chunkSize) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
};

const qtyCellClasses = {
    incoming: 'bg-emerald-500/15 text-emerald-100',
    outgoing: 'bg-rose-500/15 text-rose-100',
};

export const LogItemSummary = ({ details, tone = 'incoming' }) => {
    const summary = useMemo(() => summarizeDetails(details), [details]);

    if (summary.length === 0) {
        return <span className="text-zinc-400">No item details</span>;
    }

    const qtyTone = qtyCellClasses[tone] || qtyCellClasses.incoming;
    const columns = chunkItems(summary, 3);

    return (
        <div className="flex w-full flex-wrap items-start gap-3">
            {columns.map((column, columnIndex) => (
                <table key={columnIndex} className="w-[18rem] table-fixed overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900/40 text-sm">
                    <tbody className="divide-y divide-zinc-700/70">
                        {column.map((item) => (
                            <tr key={`${item.materialType}-${item.length}`}>
                                <td className={`w-16 whitespace-nowrap px-2 py-1 text-center font-bold ${qtyTone}`}>
                                    {item.quantity}
                                </td>
                                <td className="w-16 whitespace-nowrap bg-sky-500/15 px-2 py-1 text-center font-bold text-sky-100">
                                    {item.length || 'N/A'}
                                </td>
                                <td className="min-w-0 bg-cyan-500/10 px-2 py-1 text-center font-semibold text-cyan-100">
                                    <span className="block truncate">{item.materialType}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ))}
        </div>
    );
};
