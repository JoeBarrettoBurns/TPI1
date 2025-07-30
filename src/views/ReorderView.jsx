// src/views/ReorderView.jsx

import React from 'react';
import { PlusCircle } from 'lucide-react';
import { STANDARD_LENGTHS } from '../constants/materials';

export const ReorderView = ({ inventorySummary, materials, onRestock }) => {
    const lowStockItems = React.useMemo(() => {
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
        return items.sort((a, b) => a.category.localeCompare(b.category) || a.materialType.localeCompare(b.materialType));
    }, [inventorySummary, materials]);

    if (lowStockItems.length === 0) {
        return (
            <div className="text-center text-slate-400 py-8">
                <h2 className="text-2xl font-bold text-white mb-4">Reorder List</h2>
                <p>No items are currently low in stock.</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Reorder List</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="p-2 font-semibold text-slate-400">Category</th>
                            <th className="p-2 font-semibold text-slate-400">Material</th>
                            <th className="p-2 font-semibold text-slate-400">Sheet Size</th>
                            <th className="p-2 font-semibold text-slate-400 text-right">Quantity on Hand</th>
                            <th className="p-2 font-semibold text-slate-400 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lowStockItems.map((item, index) => (
                            <tr key={index} className="border-b border-slate-700 last:border-b-0">
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
        </div>
    );
};