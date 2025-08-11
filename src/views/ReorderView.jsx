// src/views/ReorderView.jsx

import React, { useMemo } from 'react';
import { PlusCircle, Mail } from 'lucide-react';
import { STANDARD_LENGTHS } from '../constants/materials';
import { SUPPLIER_INFO, CC_EMAIL } from '../constants/suppliers';
import { Button } from '../components/common/Button';

// Generates a mailto link for a supplier. The body will include low-stock items if they exist.
const generateMailtoLinkForSupplier = (supplier, items) => {
    const supplierKey = (supplier || '').toUpperCase().replace(/\s+/g, '_');
    const info = SUPPLIER_INFO[supplierKey] || SUPPLIER_INFO.DEFAULT;

    const subject = encodeURIComponent(info.subject || `Quote Request`);

    let itemsBody;
    if (items && items.length > 0) {
        itemsBody = "Please provide a quote for the following low-stock items:\n\n" + items.map(item =>
            `- Material: ${item.materialType}\n` +
            `  Size: ${item.length}"x48"\n` +
            `  Current Quantity: ${item.count}\n` +
            `  Requested Quantity: [PLEASE SPECIFY]`
        ).join('\n\n');
    } else {
        itemsBody = "Please provide a quote for the following items:\n\n[PLEASE LIST ITEMS]";
    }

    const body = encodeURIComponent(
        `Hello,\n\n` +
        `${itemsBody}\n\n` +
        `Thank you.`
    );

    return `mailto:${info.email}?cc=${CC_EMAIL}&subject=${subject}&body=${body}`;
};

const EmailSupplierBox = ({ allSuppliers, lowStockItemsBySupplier }) => (
    <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
        <h2 className="text-2xl font-bold text-white mb-4">Email Suppliers</h2>
        <div className="space-y-4">
            {allSuppliers.map((supplier) => {
                const items = lowStockItemsBySupplier[supplier] || [];
                return (
                    <div key={supplier} className="bg-zinc-900/50 rounded-xl border border-zinc-700 p-4 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-blue-400">{supplier}</h3>
                            <p className="text-sm text-zinc-400">
                                {items.length > 0 ? `${items.length} low stock item(s)` : 'No items currently low on stock'}
                            </p>
                        </div>
                        <a
                            href={generateMailtoLinkForSupplier(supplier, items)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button variant="primary">
                                <Mail size={16} />
                                <span>Email Order</span>
                            </Button>
                        </a>
                    </div>
                )
            })}
        </div>
    </div>
);

export const ReorderView = ({ inventorySummary, materials, onRestock, searchQuery, inventory, suppliers }) => {
    const lowStockItems = useMemo(() => {
        const items = [];
        for (const materialType in inventorySummary) {
            const summary = inventorySummary[materialType];
            const materialInfo = materials[materialType];

            for (const length of STANDARD_LENGTHS) {
                const count = summary[length] || 0;
                if (count > 0 && count < 5) {
                    const mostRecentPurchase = inventory
                        .filter(item => item.materialType === materialType && item.supplier)
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                    const supplier = mostRecentPurchase ? mostRecentPurchase.supplier : 'Unknown';

                    items.push({
                        materialType,
                        category: materialInfo?.category || 'N/A',
                        length,
                        count,
                        supplier
                    });
                }
            }
        }

        const sorted = items.sort((a, b) => a.category.localeCompare(b.category) || a.materialType.localeCompare(b.materialType));

        if (!searchQuery) return sorted;
        const lowercasedQuery = (searchQuery || '').toLowerCase();
        return sorted.filter(item =>
            item.materialType.toLowerCase().includes(lowercasedQuery) ||
            item.category.toLowerCase().includes(lowercasedQuery) ||
            item.supplier.toLowerCase().includes(lowercasedQuery)
        );

    }, [inventorySummary, materials, searchQuery, inventory]);

    const lowStockItemsBySupplier = useMemo(() => {
        const lowStockBySupplier = {};
        lowStockItems.forEach(item => {
            if (!lowStockBySupplier[item.supplier]) {
                lowStockBySupplier[item.supplier] = [];
            }
            lowStockBySupplier[item.supplier].push(item);
        });
        return lowStockBySupplier;
    }, [lowStockItems]);

    return (
        <div className="space-y-8">
            <EmailSupplierBox allSuppliers={suppliers} lowStockItemsBySupplier={lowStockItemsBySupplier} />
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
                                    <th className="p-2 font-semibold text-zinc-400">Supplier</th>
                                    <th className="p-2 font-semibold text-zinc-400">Sheet Size</th>
                                    <th className="p-2 font-semibold text-zinc-400 text-right">On Hand</th>
                                    <th className="p-2 font-semibold text-zinc-400 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStockItems.map((item, index) => (
                                    <tr key={index} className={`border-b border-zinc-700 last:border-b-0 ${index % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-800/50'}`}>
                                        <td className="p-2">{item.category}</td>
                                        <td className="p-2">{item.materialType}</td>
                                        <td className="p-2">{item.supplier}</td>
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
        </div>
    );
};