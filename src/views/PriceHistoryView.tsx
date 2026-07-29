// src/views/PriceHistoryView.tsx

import React, { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../components/common/Button';
import { exportToCSV } from '../utils/csvExport';
import { calculateSheetCost } from '../utils/dataProcessing';

export const PriceHistoryView = ({ inventory, materials, searchQuery }: any) => {
    // State to hold the selected category and material (thickness/gauge) for filtering
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedMaterialType, setSelectedMaterialType] = useState('All');

    // Get a sorted list of unique categories
    const categoriesForFilter = useMemo(() => {
        const categories = [...new Set(Object.values<any>(materials).map((m) => m.category).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        return ['All', ...categories];
    }, [materials]);

    // Material (thickness) options, scoped to the selected category
    const materialTypesForFilter = useMemo(() => {
        const types = Object.keys(materials)
            .filter((type) => selectedCategory === 'All' || materials[type]?.category === selectedCategory)
            .sort((a, b) => a.localeCompare(b));
        return ['All', ...types];
    }, [materials, selectedCategory]);

    // Picking a category invalidates a material selection from a different category
    const handleCategoryChange = (nextCategory: any) => {
        setSelectedCategory(nextCategory);
        if (selectedMaterialType !== 'All' && materials[selectedMaterialType]?.category !== nextCategory) {
            setSelectedMaterialType('All');
        }
    };

    // Memoized calculation for the price history data
    const priceHistory = useMemo(() => {
        const lowercasedQuery = (searchQuery || '').toLowerCase();

        // First, filter the raw inventory data
        const filteredInventory = inventory.filter((item: any) => {
            const materialInfo = materials[item.materialType];
            // Ensure the item has the necessary data to be included
            if (!materialInfo || !item.costPerPound || item.costPerPound <= 0) return false;

            // Filter by selected category
            if (selectedCategory !== 'All' && materialInfo.category !== selectedCategory) return false;

            // Filter by selected material type
            const matchesMaterial = selectedMaterialType === 'All' || item.materialType === selectedMaterialType;
            if (!matchesMaterial) return false;

            // Filter by search query if it exists
            if (searchQuery) {
                return item.materialType.toLowerCase().includes(lowercasedQuery) ||
                    (item.supplier || '').toLowerCase().includes(lowercasedQuery) ||
                    (item.job || '').toLowerCase().includes(lowercasedQuery);
            }

            return true;
        });

        // Now, create a de-duplicated list of unique price points (ignore dimensions)
        const uniquePricePoints = new Map();
        filteredInventory.forEach((item: any) => {
            const dateKey = (item.dateReceived || item.createdAt).split('T')[0];
            const key = `${item.materialType}-${item.supplier}-${dateKey}-${item.costPerPound}`;

            if (!uniquePricePoints.has(key)) {
                uniquePricePoints.set(key, {
                    id: key,
                    materialType: item.materialType,
                    supplier: item.supplier,
                    job: item.job,
                    dateReceived: item.dateReceived || item.createdAt,
                    costPerPound: item.costPerPound,
                });
            }
        });

        // Sort the final list by date
        return Array.from(uniquePricePoints.values())
            .sort((a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime());

    }, [inventory, materials, selectedCategory, selectedMaterialType, searchQuery]);

    // Handle exporting the current view to a CSV file
    const handleExport = () => {
        const headers = [
            { label: 'Job/PO', key: 'job' },
            { label: 'Material', key: 'materialType' },
            { label: 'Supplier', key: 'supplier' },
            { label: 'Date Received', key: 'dateReceived' },
            { label: 'Cost Per Pound', key: 'costPerPound' },
        ];

        const dataToExport = priceHistory.map(item => ({
            ...item,
            dateReceived: new Date(item.dateReceived).toLocaleDateString(),
            costPerPound: `$${item.costPerPound.toFixed(2)}`
        }));

        exportToCSV(
            dataToExport,
            headers,
            `price_history_${selectedCategory}_${selectedMaterialType}.csv`
        );
    };


    return (
        <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
            <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl md:text-2xl font-bold text-white">Price History</h2>
                    <Button onClick={handleExport} variant="secondary" className="shrink-0">
                        <Download size={16} /> <span className="hidden sm:inline">Export</span>
                    </Button>
                </div>

                {/* Materials, as selectable buttons... */}
                <div className="flex flex-wrap gap-2">
                    {categoriesForFilter.map((category) => {
                        const isActive = category === selectedCategory;
                        return (
                            <button
                                key={category}
                                type="button"
                                onClick={() => handleCategoryChange(category)}
                                className={`flex-1 min-w-[8rem] px-3 py-1.5 rounded-md text-sm font-semibold text-center transition-colors duration-200 ${
                                    isActive
                                        ? 'bg-blue-800/60 text-white'
                                        : 'bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/80 hover:text-white'
                                }`}
                            >
                                {category === 'All' ? 'All Materials' : category}
                            </button>
                        );
                    })}
                </div>

                {/* ...then the thicknesses of that material, as smaller buttons below */}
                <div className="flex flex-wrap gap-1.5 pl-1">
                    {materialTypesForFilter.map((type) => {
                        const isActive = type === selectedMaterialType;
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setSelectedMaterialType(type)}
                                className={`shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors duration-200 ${
                                    isActive
                                        ? 'bg-purple-800/70 text-white'
                                        : 'bg-zinc-700/30 text-zinc-400 hover:bg-zinc-600/60 hover:text-zinc-100'
                                }`}
                            >
                                {type === 'All' ? 'All Thicknesses' : type}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm md:text-base text-left">
                    <thead>
                        <tr className="border-b border-zinc-700">
                            <th className="p-2 font-semibold text-zinc-400">Date</th>
                            <th className="p-2 font-semibold text-zinc-400">Job/PO</th>
                            <th className="p-2 font-semibold text-zinc-400">Supplier</th>
                            <th className="p-2 font-semibold text-zinc-400">Material</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">Cost Per Pound</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">96</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">120</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">144</th>
                        </tr>
                    </thead>
                    <tbody>
                        {priceHistory.map((order, index) => {
                            const price96 = calculateSheetCost({ materialType: order.materialType, length: 96, width: 48, costPerPound: order.costPerPound }, materials);
                            const price120 = calculateSheetCost({ materialType: order.materialType, length: 120, width: 48, costPerPound: order.costPerPound }, materials);
                            const price144 = calculateSheetCost({ materialType: order.materialType, length: 144, width: 48, costPerPound: order.costPerPound }, materials);
                            return (
                                <tr key={order.id || index} className={`border-b border-zinc-700 last:border-b-0 ${index % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-800/50'}`}>
                                    <td className="p-2">{new Date(order.dateReceived).toLocaleDateString()}</td>
                                    <td className="p-2">{order.job}</td>
                                    <td className="p-2">{order.supplier}</td>
                                    <td className="p-2">{order.materialType}</td>
                                    <td className="p-2 text-right font-mono text-green-400">${order.costPerPound.toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono">${price96.toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono">${price120.toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono">${price144.toFixed(2)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {priceHistory.length === 0 && <p className="text-center text-zinc-400 py-8">No price history available for this material type or search query.</p>}
            </div>
        </div>
    );
};


