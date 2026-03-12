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

function getLatestBuyOrderSizeBubbles(item) {
    const sizes = [];

    STANDARD_LENGTHS.forEach((length) => {
        const qty = parseInt(item?.[`qty${length}`] || 0, 10);
        if (qty > 0) {
            sizes.push({
                size: `${length}"x48"`,
                qty,
            });
        }
    });

    const customQty = parseInt(item?.customQty || 0, 10);
    const customWidth = parseFloat(item?.customWidth || 0);
    const customLength = parseFloat(item?.customLength || 0);
    if (customQty > 0 && customWidth > 0 && customLength > 0) {
        sizes.push({
            size: `${customLength}"x${customWidth}"`,
            qty: customQty,
        });
    }

    return sizes;
}

const BuyOrdersBox = ({ buyOrders, onAddBuyOrderToInventory }) => (
    <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
        <h2 className="text-2xl font-bold text-white mb-4">Buy Orders</h2>
        {buyOrders.length === 0 ? (
            <p className="text-zinc-400">No emailed buy orders are waiting to be added into inventory.</p>
        ) : (
            <div className="space-y-5">
                {buyOrders.map((buyOrder) => (
                    <div key={buyOrder.id} className="rounded-2xl border border-zinc-700 bg-zinc-900/40 px-5 py-4 md:px-6">
                        <div className="min-w-0">
                            <p className="text-xl font-bold tracking-tight text-blue-400">{buyOrder.supplier || 'Unknown Supplier'}</p>
                            <p className="text-sm text-zinc-400">
                                Opened email: {buyOrder.openedEmailAt ? new Date(buyOrder.openedEmailAt).toLocaleString() : 'N/A'}
                            </p>
                            <p className="text-sm text-zinc-500 mt-1">
                                {(buyOrder.items || []).length} material type{(buyOrder.items || []).length === 1 ? '' : 's'}
                            </p>
                        </div>
                        <div className="mt-5 grid grid-cols-1 gap-4">
                            {(buyOrder.items || []).map((item, index) => {
                                const sizeBubbles = getLatestBuyOrderSizeBubbles(item);

                                return (
                                    <div key={`${buyOrder.id}-${item.materialType}-${index}`} className="rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-4 md:px-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                            <Button
                                                onClick={() => onAddBuyOrderToInventory(buyOrder)}
                                                className="shrink-0 px-3 py-2 text-sm min-w-[92px]"
                                            >
                                                <Inbox size={15} />
                                                <span>Add</span>
                                            </Button>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xl md:text-2xl font-bold tracking-tight text-white">{item.materialType}</p>
                                                {sizeBubbles.length > 0 ? (
                                                    <div className="mt-3 flex flex-wrap gap-2.5">
                                                        {sizeBubbles.map((entry) => (
                                                            <span
                                                                key={`${item.materialType}-${entry.size}-${entry.qty}`}
                                                                className="inline-flex items-center gap-2 rounded-full border border-zinc-600 bg-zinc-800/90 px-3 py-1.5 text-sm md:text-base font-semibold text-zinc-100 shadow-sm"
                                                            >
                                                                <span className="text-zinc-200">{entry.size}</span>
                                                                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-blue-300">
                                                                    Qty {entry.qty}
                                                                </span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-base text-zinc-400 mt-2">No sheet sizes saved</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export const ReorderView = ({ inventorySummary, materials, onRestock, buyOrders = [], onAddBuyOrderToInventory, searchQuery, inventory, suppliers, supplierInfoOverrides }) => {
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
            <BuyOrdersBox buyOrders={buyOrders} onAddBuyOrderToInventory={onAddBuyOrderToInventory} />
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