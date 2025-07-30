// src/views/ReorderView.jsx

import React, { useMemo } from 'react';
import { PlusCircle } from 'lucide-react';
import { STANDARD_LENGTHS } from '../constants/materials';

export const ReorderView = ({ inventorySummary, materials, onRestock, searchQuery }) => {
    const lowStockItems = useMemo(() => {
        const items = [];
        for (const materialType in inventorySummary) {
            const summary = inventorySummary[materialType];
            const materialInfo = materials[materialType];
            for (const length of STANDARD_LENGTHS) {
                const count = summary[length] || 0;
                if (count > 0 && count < 5) {
                    items.push({
                        materialType,
                        category: materialInfo?.category || 'N/A',
                        length,
                        count
                    });
                }
            }
        }

        const sorted = items.sort((a, b) => a.category.localeCompare(b.category) || a.materialType.localeCompare(b.materialType));

        if (!searchQuery) return sorted;
        const lowercasedQuery = searchQuery.toLowerCase();
        return sorted.filter(item =>
            item.materialType.toLowerCase().includes(lowercasedQuery) ||
            item.category.toLowerCase().includes(lowercasedQuery)
        );

    }, [inventorySummary, materials, searchQuery]);

    return (
        <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-white mb-4">Reorder List</h2>
            {lowStockItems.length === 0 ? (
                <p className="text-center text-zinc-400 py-8">
                    {searchQuery ? 'No matching items found.' : 'No items are currently low in stock.'}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm md:text-base text-left">
                        <thead>
                            <tr className="border-b border-zinc-700">
                                <th className="p-2 font-semibold text-zinc-400">Category</th>
                                <th className="p-2 font-semibold text-zinc-400">Material</th>
                                <th className="p-2 font-semibold text-zinc-400">Sheet Size</th>
                                <th className="p-2 font-semibold text-zinc-400 text-right">Quantity on Hand</th>
                                <th className="p-2 font-semibold text-zinc-400 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lowStockItems.map((item, index) => (
                                <tr key={index} className={`border-b border-zinc-700 last:border-b-0 ${index % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-800/50'}`}>
                                    <td className="p-2">{item.category}</td>
                                    <td className="p-2">{item.materialType}</td>
                                    <td className="p-2">{item.length}"x48"</td>
                                    <td className="p-2 text-right font-mono text-yellow-400">{item.count}</td>
                                    <td className="p-2 text-center">
                                        <button
                                            onClick={() => onRestock(item.materialType)}
                                            className="flex items-center gap-1 text-green-400 hover:text-green-300 transition-colors mx-auto"
                                            title={`Restock ${item.materialType}`}
                                        >
                                            <PlusCircle size={16} />
                                            <span>Restock</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};