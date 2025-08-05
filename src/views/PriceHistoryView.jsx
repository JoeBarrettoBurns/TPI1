// src/views/PriceHistoryView.jsx

import React, { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../components/common/Button';
import { exportToCSV } from '../utils/csvExport';

export const PriceHistoryView = ({ inventory, materials, searchQuery }) => {
    // State to hold the selected thickness for filtering
    const [selectedThickness, setSelectedThickness] = useState('All');

    // Get a sorted list of unique thicknesses from the materials data
    const thicknesses = useMemo(() => {
        const uniqueThicknesses = new Set(Object.values(materials).map(m => m.thickness));
        return ['All', ...Array.from(uniqueThicknesses)].sort((a, b) => {
            if (a === 'All') return -1;
            if (b === 'All') return 1;
            return a - b;
        });
    }, [materials]);

    // Memoized calculation for the price history data
    const priceHistory = useMemo(() => {
        const lowercasedQuery = (searchQuery || '').toLowerCase();

        // First, filter the raw inventory data
        const filteredInventory = inventory.filter(item => {
            const materialInfo = materials[item.materialType];
            // Ensure the item has the necessary data to be included
            if (!materialInfo || !item.costPerPound || item.costPerPound <= 0) return false;

            // Filter by selected thickness
            const matchesThickness = selectedThickness === 'All' || materialInfo.thickness === selectedThickness;
            if (!matchesThickness) return false;

            // Filter by search query if it exists
            if (searchQuery) {
                return item.materialType.toLowerCase().includes(lowercasedQuery) ||
                    (item.supplier || '').toLowerCase().includes(lowercasedQuery) ||
                    (item.job || '').toLowerCase().includes(lowercasedQuery);
            }

            return true;
        });

        // Now, create a de-duplicated list of unique price points
        const uniquePricePoints = new Map();
        filteredInventory.forEach(item => {
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
                    thickness: materials[item.materialType]?.thickness || 'N/A',
                });
            }
        });

        // Sort the final list by date
        return Array.from(uniquePricePoints.values())
            .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));

    }, [inventory, materials, selectedThickness, searchQuery]);

    // Handle exporting the current view to a CSV file
    const handleExport = () => {
        const headers = [
            { label: 'Job/PO', key: 'job' },
            { label: 'Material', key: 'materialType' },
            { label: 'Thickness', key: 'thickness' },
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
            `price_history_thickness_${selectedThickness}.csv`
        );
    };


    return (
        <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
                <h2 className="text-xl md:text-2xl font-bold text-white">Price History</h2>
                <div className="flex items-center gap-4">
                    {/* Dropdown for selecting thickness */}
                    <select
                        value={selectedThickness}
                        onChange={(e) => setSelectedThickness(e.target.value === 'All' ? 'All' : parseFloat(e.target.value))}
                        className="bg-zinc-700 text-white border border-zinc-600 rounded-md px-3 py-2 text-sm md:text-base"
                    >
                        {thicknesses.map(thick => <option key={thick} value={thick}>{thick === 'All' ? 'All Thicknesses' : `${thick}"`}</option>)}
                    </select>
                    <Button onClick={handleExport} variant="secondary">
                        <Download size={16} /> <span className="hidden sm:inline">Export</span>
                    </Button>
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
                        </tr>
                    </thead>
                    <tbody>
                        {priceHistory.map((order, index) => (
                            <tr key={order.id || index} className={`border-b border-zinc-700 last:border-b-0 ${index % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-800/50'}`}>
                                <td className="p-2">{new Date(order.dateReceived).toLocaleDateString()}</td>
                                <td className="p-2">{order.job}</td>
                                <td className="p-2">{order.supplier}</td>
                                <td className="p-2">{order.materialType}</td>
                                <td className="p-2 text-right font-mono text-green-400">${order.costPerPound.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {priceHistory.length === 0 && <p className="text-center text-zinc-400 py-8">No price history available for this thickness or search query.</p>}
            </div>
        </div>
    );
};
