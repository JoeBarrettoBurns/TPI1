// src/components/modals/AddStockModal.tsx

import React from 'react';
import { Inbox, PlusCircle, Trash2 } from 'lucide-react';
import { STANDARD_LENGTHS } from '../../constants/materials';
import { BaseModal } from './BaseModal';
import { AddOrderModal } from './AddOrderModal';
import { Button } from '../common/Button';

function getBuyOrderSuppliers(buyOrder: any) {
    if (Array.isArray(buyOrder?.suppliers) && buyOrder.suppliers.length > 0) {
        return buyOrder.suppliers.filter(Boolean);
    }
    return buyOrder?.supplier ? [buyOrder.supplier] : [];
}

function getBuyOrderSubject(buyOrder: any) {
    return (buyOrder?.requestedEmailSubject || '').trim();
}

function getBuyOrderSizeBubbles(item: any) {
    const sizes: any[] = [];

    STANDARD_LENGTHS.forEach((length) => {
        const qty = parseInt(item?.[`qty${length}`] || 0, 10);
        if (qty > 0) {
            sizes.push({ size: `${length}"x48"`, qty });
        }
    });

    const customQty = parseInt(item?.customQty || 0, 10);
    const customWidth = parseFloat(item?.customWidth || 0);
    const customLength = parseFloat(item?.customLength || 0);
    if (customQty > 0 && customWidth > 0 && customLength > 0) {
        sizes.push({ size: `${customLength}"x${customWidth}"`, qty: customQty });
    }

    return sizes;
}

export const AddStockModal = ({
    onClose,
    onBackToList,
    onSaveManual,
    onAddBuyOrderToInventory,
    onAddNonEmailedStock,
    materialTypes,
    materials,
    suppliers,
    buyOrders = [],
    onClearAllBuyOrders,
    onDeleteBuyOrder,
    prefill = null,
    manual = false,
    linkedBuyOrderId = null,
}: any) => {
    const showForm = Boolean(prefill) || manual;

    if (showForm) {
        return (
            <AddOrderModal
                onClose={onClose}
                onBack={onBackToList}
                onSave={onSaveManual}
                title={linkedBuyOrderId ? 'Add Emailed Order to Stock' : 'Add New Stock'}
                materialTypes={materialTypes}
                materials={materials}
                suppliers={suppliers}
                prefill={prefill}
            />
        );
    }

    return (
        <BaseModal onClose={onClose} title="Add Stock" maxWidthClass="max-w-4xl">
            <div className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-zinc-400">
                        Emailed orders waiting to be added into inventory.
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={onAddNonEmailedStock} className="px-4 py-2 text-sm">
                            <PlusCircle size={16} />
                            <span>Add Non-Emailed Stock</span>
                        </Button>
                        <Button
                            variant="danger"
                            onClick={onClearAllBuyOrders}
                            disabled={buyOrders.length === 0}
                            className="px-4 py-2 text-sm"
                        >
                            <Trash2 size={16} />
                            <span>Clear All</span>
                        </Button>
                    </div>
                </div>

                {buyOrders.length === 0 ? (
                    <p className="text-center text-zinc-400 py-8">No emailed orders are waiting to be added into inventory.</p>
                ) : (
                    <div className="space-y-5">
                        {buyOrders.map((buyOrder: any) => {
                            const orderSuppliers = getBuyOrderSuppliers(buyOrder);
                            const orderSubject = getBuyOrderSubject(buyOrder);

                            return (
                                <div key={buyOrder.id} className="rounded-2xl border border-zinc-700 bg-zinc-900/40 px-5 py-4 md:px-6">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            {orderSubject && (
                                                <>
                                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Subject</p>
                                                    <p className="mt-1 text-lg font-semibold text-purple-300">{orderSubject}</p>
                                                </>
                                            )}
                                            <p className={`${orderSubject ? 'mt-4 ' : ''}text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500`}>Suppliers</p>
                                            <p className="text-xl font-bold tracking-tight text-blue-400">
                                                {orderSuppliers.length > 0 ? orderSuppliers.join(', ') : 'Unknown Supplier'}
                                            </p>
                                            <p className="text-sm text-zinc-400">
                                                Opened email: {buyOrder.openedEmailAt ? new Date(buyOrder.openedEmailAt).toLocaleString() : 'N/A'}
                                            </p>
                                            <p className="text-sm text-zinc-500">
                                                {(buyOrder.items || []).length} material type{(buyOrder.items || []).length === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="danger"
                                            onClick={() => onDeleteBuyOrder(buyOrder)}
                                            className="shrink-0 self-start px-3 py-2 text-sm"
                                            title="Remove this buy order from the queue"
                                        >
                                            <Trash2 size={16} />
                                            <span>Delete</span>
                                        </Button>
                                    </div>
                                    <div className="mt-5 grid grid-cols-1 gap-4">
                                        {(buyOrder.items || []).map((item: any, index: any) => {
                                            const sizeBubbles = getBuyOrderSizeBubbles(item);

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
                            );
                        })}
                    </div>
                )}
            </div>
        </BaseModal>
    );
};
