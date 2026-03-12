// src/views/ReorderView.jsx

import React, { useMemo } from 'react';
import { PlusCircle, Mail, Inbox } from 'lucide-react';
import { STANDARD_LENGTHS } from '../constants/materials';
import { Button } from '../components/common/Button';
import { createSupplierMailtoLink } from '../utils/buyOrderUtils';

const EmailSupplierBox = ({ allSuppliers, lowStockItemsBySupplier, supplierInfoOverrides }) => (
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
                            href={createSupplierMailtoLink({ supplier, items, supplierInfoOverrides }).mailto}
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

function formatLatestBuyOrderSizes(item) {
    const sizes = [];

    STANDARD_LENGTHS.forEach((length) => {
        const qty = parseInt(item?.[`qty${length}`] || 0, 10);
        if (qty > 0) {
            sizes.push(`${length}"x48" x${qty}`);
        }
    });

    const customQty = parseInt(item?.customQty || 0, 10);
    const customWidth = parseFloat(item?.customWidth || 0);
    const customLength = parseFloat(item?.customLength || 0);
    if (customQty > 0 && customWidth > 0 && customLength > 0) {
        sizes.push(`${customLength}"x${customWidth}" x${customQty}`);
    }

    return sizes.join(', ');
}

const LatestBuyOrderBox = ({ latestBuyOrder, onAddLatestBuyOrderToInventory }) => (
    <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
                <h2 className="text-2xl font-bold text-white">Latest Buy Order</h2>
                {!latestBuyOrder ? (
                    <p className="text-zinc-400 mt-2">No emailed buy order is waiting to be added into inventory.</p>
                ) : (
                    <>
                        <p className="text-zinc-300 mt-2">
                            Supplier: <span className="font-semibold text-blue-400">{latestBuyOrder.supplier || 'Unknown'}</span>
                        </p>
                        <p className="text-zinc-400 text-sm">
                            Opened email: {latestBuyOrder.openedEmailAt ? new Date(latestBuyOrder.openedEmailAt).toLocaleString() : 'N/A'}
                        </p>
                    </>
                )}
            </div>
            <Button onClick={onAddLatestBuyOrderToInventory} disabled={!latestBuyOrder}>
                <Inbox size={16} />
                <span>Add to Inventory</span>
            </Button>
        </div>

        {latestBuyOrder && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {(latestBuyOrder.items || []).map((item, index) => (
                    <div key={`${item.materialType}-${index}`} className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
                        <p className="font-semibold text-white">{item.materialType}</p>
                        <p className="text-sm text-zinc-300 mt-1">{formatLatestBuyOrderSizes(item) || 'No sheet sizes saved'}</p>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export const ReorderView = ({ inventorySummary, materials, onRestock, latestBuyOrder, onAddLatestBuyOrderToInventory, searchQuery, inventory, suppliers, supplierInfoOverrides }) => {
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
            <LatestBuyOrderBox latestBuyOrder={latestBuyOrder} onAddLatestBuyOrderToInventory={onAddLatestBuyOrderToInventory} />
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
                                                onClick={() => onRestock(item)}
                                                className="flex items-center gap-1 text-green-400 hover:text-green-300 transition-colors mx-auto"
                                                title={`Buy ${item.materialType}`}
                                            >
                                                <PlusCircle size={16} />
                                                <span>Buy</span>
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