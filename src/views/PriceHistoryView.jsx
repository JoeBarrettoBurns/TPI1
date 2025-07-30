// src/views/PriceHistoryView.jsx

import React, { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../components/common/Button';
import { exportToCSV } from '../utils/csvExport';

export const PriceHistoryView = ({ inventory, materials }) => {
    const [selectedCategory, setSelectedCategory] = useState('All');

    const categories = useMemo(() => ['All', ...new Set(Object.values(materials).map(m => m.category))], [materials]);
    const filteredInventory = useMemo(() => {
        return inventory.filter(item => {
            const materialInfo = materials[item.materialType];
            if (!materialInfo) return false;
            const matchesCategory = selectedCategory === 'All' || materialInfo.category === selectedCategory;
            return matchesCategory && item.costPerPound > 0;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [inventory, materials, selectedCategory]);

    const handleExport = () => {
        const headers = [
            { label: 'Material', key: 'materialType' },
            { label: 'Category', key: 'category' },
            { label: 'Supplier', key: 'supplier' },
            { label: 'Date Received', key: 'dateReceived' },
            { label: 'Cost Per Pound', key: 'costPerPound' },
        ];

        const dataToExport = filteredInventory.map(item => ({
            materialType: item.materialType,
            category: materials[item.materialType]?.category || 'N/A',
            supplier: item.supplier,
            dateReceived: item.dateReceived ? new Date(item.dateReceived).toLocaleDateString() : new Date(item.createdAt).toLocaleDateString(),
            costPerPound: `$${item.costPerPound.toFixed(2)}`
        }));

        exportToCSV(dataToExport, headers, `price_history_${selectedCategory.toLowerCase().replace(' ', '_')}.csv`);
    };


    return (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
                <h2 className="text-2xl font-bold text-white">Price History</h2>
                <div className="flex items-center gap-4">
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="bg-slate-700 text-white border border-slate-600 rounded-md px-3 py-2"
                    >
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <Button onClick={handleExport} variant="secondary">
                        <Download size={16} className="mr-2" />
                        Export to CSV
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="p-2 font-semibold text-slate-400">Material</th>
                            <th className="p-2 font-semibold text-slate-400">Category</th>
                            <th className="p-2 font-semibold text-slate-400">Supplier</th>
                            <th className="p-2 font-semibold text-slate-400">Date Received</th>
                            <th className="p-2 font-semibold text-slate-400 text-right">Cost Per Pound</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInventory.map((item) => (
                            <tr key={item.id} className="border-b border-slate-700 last:border-b-0">
                                <td className="p-2">{item.materialType}</td>
                                <td className="p-2">{materials[item.materialType]?.category || 'N/A'}</td>
                                <td className="p-2">{item.supplier}</td>
                                <td className="p-2">{item.dateReceived ? new Date(item.dateReceived).toLocaleDateString() : new Date(item.createdAt).toLocaleDateString()}</td>
                                <td className="p-2 text-right font-mono text-green-400">${item.costPerPound.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredInventory.length === 0 && <p className="text-center text-slate-400 py-8">No price history available for this category.</p>}
            </div>
        </div>
    );
};