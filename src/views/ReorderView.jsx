// src/views/ReorderView.jsx

import React, { useMemo, useState } from 'react';
import { PlusCircle, Mail } from 'lucide-react';
import { STANDARD_LENGTHS } from '../constants/materials';
import { SUPPLIER_INFO, CC_EMAIL } from '../constants/suppliers';
import { Button } from '../components/common/Button';

const buildDefaultItemsBody = (info, items) => {
    if (info.bodyMaterial) {
        // Material header without extra blank line, followed by standard lengths
        return (
            `${info.bodyMaterial}\n` +
            `144"x48" -QTY:\n` +
            `120"x48" -QTY:\n` +
            `96"x48" -QTY:`
        );
    }
    if (items && items.length > 0) {
        return (
            "Please provide a quote for the following low-stock items:\n\n" +
            items.map(item => (
                `- Material: ${item.materialType}\n` +
                `  Size: ${item.length}"x48"\n` +
                `  Current Quantity: ${item.count}\n` +
                `  Requested Quantity: [PLEASE SPECIFY]`
            )).join('\n\n')
        );
    }
    return "Please provide a quote for the following items:\n\n[PLEASE LIST ITEMS]";
};

// Generates a mailto link for a supplier. The body will include low-stock items if they exist or a custom body if provided.
const generateMailtoLinkForSupplier = (supplier, items, supplierInfoOverrides, customBody) => {
    const supplierKey = (supplier || '').toUpperCase().replace(/\s+/g, '_');
    const override = supplierInfoOverrides?.[supplierKey];
    const info = override || SUPPLIER_INFO[supplierKey] || SUPPLIER_INFO.DEFAULT;

    const subject = encodeURIComponent(info.subject || `Quote Request`);
    const itemsBody = (customBody && customBody.trim().length > 0)
        ? customBody
        : (info.bodyTemplate && info.bodyTemplate.trim().length > 0)
            ? info.bodyTemplate
            : buildDefaultItemsBody(info, items);

    const greetingName = info.contactName ? `Hi ${info.contactName},` : 'Hello,';
    const body = encodeURIComponent(`${greetingName}\n\n${itemsBody}\n\nThank you.`);

    return `mailto:${info.email}?cc=${CC_EMAIL}&subject=${subject}&body=${body}`;
};

const EmailSupplierBox = ({ allSuppliers, lowStockItemsBySupplier, supplierInfoOverrides }) => {
    const [expanded, setExpanded] = useState({});
    const [customBodies, setCustomBodies] = useState({});

    return (
        <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-white mb-4">Email Suppliers</h2>
            <div className="space-y-4">
                {allSuppliers.map((supplier) => {
                    const items = lowStockItemsBySupplier[supplier] || [];
                    const isExpanded = !!expanded[supplier];
                    const supplierKey = (supplier || '').toUpperCase().replace(/\s+/g, '_');
                    const info = supplierInfoOverrides?.[supplierKey] || SUPPLIER_INFO[supplierKey] || SUPPLIER_INFO.DEFAULT;
                    const defaultBody = buildDefaultItemsBody(info, items);
                    const currentBody = customBodies[supplier] ?? '';
                    return (
                        <div key={supplier} className="bg-zinc-900/50 rounded-xl border border-zinc-700 p-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-blue-400">{supplier}</h3>
                                    <p className="text-sm text-zinc-400">
                                        {items.length > 0 ? `${items.length} low stock item(s)` : 'No items currently low on stock'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setExpanded(prev => ({ ...prev, [supplier]: !isExpanded }))}
                                        className="text-blue-300 hover:text-blue-200 underline"
                                    >
                                        {isExpanded ? 'Done' : 'Edit Body'}
                                    </button>
                                    <a
                                        href={generateMailtoLinkForSupplier(supplier, items, supplierInfoOverrides, currentBody || undefined)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <Button variant="primary">
                                            <Mail size={16} />
                                            <span>Email Order</span>
                                        </Button>
                                    </a>
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="mt-3">
                                    <label className="block text-sm font-medium text-zinc-300">Email Body</label>
                                    <textarea
                                        className="w-full mt-1 p-2 bg-zinc-700 border border-zinc-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={6}
                                        value={currentBody || defaultBody}
                                        onChange={(e) => setCustomBodies(prev => ({ ...prev, [supplier]: e.target.value }))}
                                    />
                                    <div className="mt-2 flex gap-2">
                                        <Button
                                            variant="secondary"
                                            onClick={() => setCustomBodies(prev => ({ ...prev, [supplier]: defaultBody }))}
                                        >
                                            Reset to Default
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

export const ReorderView = ({ inventorySummary, materials, onRestock, searchQuery, inventory, suppliers, supplierInfoOverrides }) => {
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
            <EmailSupplierBox allSuppliers={suppliers} lowStockItemsBySupplier={lowStockItemsBySupplier} supplierInfoOverrides={supplierInfoOverrides} />
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