// src/views/PriceHistoryView.jsx

import React, { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../components/common/Button';
import { exportToCSV } from '../utils/csvExport';

export const PriceHistoryView = ({ inventory, materials }) => {
    const [selectedCategory, setSelectedCategory] = useState('All');

    const categories = useMemo(() => ['All', ...new Set(Object.values(materials).map(m => m.category))].sort(), [materials]);

    const handleCategoryChange = (e) => {
        setSelectedCategory(e.target.value || null);
    };

    const priceHistory = useMemo(() => {
        const history = inventory.filter(item => {
            const materialInfo = materials[item.materialType];
            if (!materialInfo || !item.costPerPound || item.costPerPound <= 0) return false;
            return selectedCategory === 'All' || materialInfo.category === selectedCategory;
        });
        return history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [inventory, materials, selectedCategory]);

    const handleExport = () => {
        const headers = [
            { label: 'Material', key: 'materialType' },
            { label: 'Category', key: 'category' },
            { label: 'Supplier', key: 'supplier' },
            { label: 'Date Received', key: 'dateReceived' },
            { label: 'Cost Per Pound', key: 'costPerPound' },
        ];

        const dataToExport = priceHistory.map(item => ({
            materialType: item.materialType,
            category: materials[item.materialType]?.category || 'N/A',
            supplier: item.supplier,
            dateReceived: item.dateReceived ? new Date(item.dateReceived).toLocaleDateString() : new Date(item.createdAt).toLocaleDateString(),
            costPerPound: `$${item.costPerPound.toFixed(2)}`
        }));

        exportToCSV(dataToExport, `price_history_${selectedCategory.toLowerCase().replace(' ', '_')}.csv`);
    };

    return (
        <div className="space-y-6">
            <div className="bg-zinc-800 p-4 rounded-lg shadow-md border border-zinc-700">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <h2 className="text-xl font-semibold text-white">Select a Category to View its Price History</h2>
                    <div className="flex items-center gap-4">
                        <select
                            onChange={handleCategoryChange}
                            className="w-full md:w-auto p-2 rounded bg-zinc-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            value={selectedCategory || ''}
                        >
                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <Button onClick={handleExport} variant="secondary">
                            <Download size={16} /> Export
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-zinc-800 rounded-lg shadow-lg p-6 border border-zinc-700">
                <h3 className="text-xl font-bold text-blue-400 mb-4">{selectedCategory} Price History</h3>
                {priceHistory?.length > 0 ? (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-zinc-700">
                                <th className="p-2 font-semibold text-zinc-400">Date</th>
                                <th className="p-2 font-semibold text-zinc-400">Supplier</th>
                                <th className="p-2 font-semibold text-zinc-400">Material</th>
                                <th className="p-2 font-semibold text-zinc-400 text-right">Price per Pound</th>
                            </tr>
                        </thead>
                        <tbody>
                            {priceHistory.map((entry, index) => (
                                <tr key={entry.id || index} className="border-b border-zinc-700 last:border-b-0">
                                    <td className="p-2">{new Date(entry.createdAt).toLocaleDateString()}</td>
                                    <td className="p-2">{entry.supplier}</td>
                                    <td className="p-2">{entry.materialType}</td>
                                    <td className="p-2 text-right font-mono">${entry.costPerPound.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-zinc-400">No purchase history found for this category.</p>
                )}
            </div>
        </div>
    );
};