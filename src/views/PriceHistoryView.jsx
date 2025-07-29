// src/views/PriceHistoryView.jsx

import React, { useState, useMemo } from 'react';

// This utility function now aggregates price history for an entire category
const getPriceHistoryByCategory = (inventory, materials) => {
    const historyByCategory = {};

    // Initialize an array for each category
    Object.values(materials).forEach(material => {
        if (!historyByCategory[material.category]) {
            historyByCategory[material.category] = [];
        }
    });

    // Group inventory items by PO/Job and date to get unique orders
    const orders = {};
    inventory.forEach(item => {
        const orderKey = `${item.job || 'N/A'}-${item.createdAt}`;
        if (!orders[orderKey]) {
            orders[orderKey] = {
                date: item.createdAt,
                supplier: item.supplier,
                items: {}
            };
        }
        // Store unique price points per material within an order
        if (!orders[orderKey].items[item.materialType]) {
            orders[orderKey].items[item.materialType] = item.costPerPound;
        }
    });

    // Populate the category history from the processed orders
    Object.values(orders).forEach(order => {
        Object.entries(order.items).forEach(([materialType, cost]) => {
            const materialInfo = materials[materialType];
            if (materialInfo && historyByCategory[materialInfo.category] && cost > 0) {
                historyByCategory[materialInfo.category].push({
                    date: new Date(order.date), // Keep as Date object for sorting
                    supplier: order.supplier,
                    price: cost,
                    material: materialType, // Keep track of the specific material
                });
            }
        });
    });

    // Sort each category's history by date
    for (const category in historyByCategory) {
        // Remove duplicate entries for the same order/price point
        const uniqueEntries = Array.from(new Map(
            historyByCategory[category].map(entry => [`${entry.date.toISOString()}-${entry.supplier}-${entry.price}-${entry.material}`, entry])
        ).values());

        historyByCategory[category] = uniqueEntries.sort((a, b) => b.date - a.date);
    }

    return historyByCategory;
};

export const PriceHistoryView = ({ inventory, materials }) => {
    const [selectedCategory, setSelectedCategory] = useState(null);

    const priceHistory = useMemo(() => getPriceHistoryByCategory(inventory, materials), [inventory, materials]);
    const categories = useMemo(() => [...new Set(Object.values(materials).map(m => m.category))].sort(), [materials]);

    const handleCategoryChange = (e) => {
        setSelectedCategory(e.target.value || null);
    };

    const selectedCategoryHistory = selectedCategory ? priceHistory[selectedCategory] : [];

    return (
        <div className="space-y-6">
            <div className="bg-slate-800 p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold text-white mb-2">Select a Category to View its Price History</h2>
                <select
                    onChange={handleCategoryChange}
                    className="w-full md:w-1/3 p-2 rounded bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    value={selectedCategory || ''}
                >
                    <option value="">-- Select a Material Category --</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
            </div>

            {selectedCategory && (
                <div className="bg-slate-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-bold text-blue-400 mb-4">{selectedCategory} Price History</h3>
                    {selectedCategoryHistory?.length > 0 ? (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="p-2 font-semibold text-slate-400">Date</th>
                                    <th className="p-2 font-semibold text-slate-400">Supplier</th>
                                    <th className="p-2 font-semibold text-slate-400">Material</th>
                                    <th className="p-2 font-semibold text-slate-400 text-right">Price per Pound</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedCategoryHistory.map((entry, index) => (
                                    <tr key={index} className="border-b border-slate-700 last:border-b-0">
                                        <td className="p-2">{entry.date.toLocaleDateString()}</td>
                                        <td className="p-2">{entry.supplier}</td>
                                        <td className="p-2">{entry.material}</td>
                                        <td className="p-2 text-right font-mono">${entry.price.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-slate-400">No purchase history found for this category.</p>
                    )}
                </div>
            )}
        </div>
    );
};