import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { usePersistentState } from '../hooks/usePersistentState';
import { MaterialDetailItem } from '../components/dashboard/MaterialDetailItem';

export const MaterialDetailView = ({
    category, inventory, usageLog, inventorySummary, incomingSummary,
    onDeleteLog, onDeleteInventoryGroup, onEditOrder, onReceiveOrder, onFulfillLog,
    scrollToMaterial, onScrollToComplete, materials, materialTypes, searchQuery
}) => {
    // 1. A stable, default-sorted list of all materials in this category. This list is never filtered.
    const stableMaterialsInCategory = useMemo(() => {
        return materialTypes
            .filter(m => materials[m] && materials[m].category === category)
            .sort((a, b) => {
                const aSummary = inventorySummary[a] || {};
                const bSummary = inventorySummary[b] || {};
                const aTotal = Object.values(aSummary).reduce((sum, count) => sum + count, 0);
                const bTotal = Object.values(bSummary).reduce((sum, count) => sum + count, 0);
                return bTotal - aTotal;
            });
    }, [category, materials, materialTypes, inventorySummary]);

    // 2. The user's custom sort order, loaded from local storage.
    const [orderedMaterials, setOrderedMaterials] = usePersistentState(`material-order-${category}`, []);

    // 3. This effect syncs the persisted order with the master list of materials,
    // ensuring that new materials are added and old ones are removed without losing the user's custom order.
    useEffect(() => {
        setOrderedMaterials(prevOrder => {
            const liveItemsSet = new Set(stableMaterialsInCategory);
            const currentOrderSet = new Set(prevOrder);

            // Keep only the items in the order that still exist in the master list
            const validOrderedItems = prevOrder.filter(item => liveItemsSet.has(item));

            // Find any new items from the master list that are not in the current order
            const newItems = stableMaterialsInCategory.filter(item => !currentOrderSet.has(item));

            // Add new items to the end of the valid ordered list
            const newOrder = [...validOrderedItems, ...newItems];

            // Only update state if the order has actually changed to prevent infinite loops
            if (JSON.stringify(newOrder) !== JSON.stringify(prevOrder)) {
                return newOrder;
            }

            return prevOrder;
        });
    }, [stableMaterialsInCategory, setOrderedMaterials]);

    // 4. This is the master list for sorting. It uses the user's custom order if it's valid, otherwise it falls back to the default sort.
    // This list is provided to the drag-and-drop context. It is NOT filtered by search.
    const baseSortableOrder = useMemo(() => {
        // Use the custom order only if it contains all the materials. Otherwise, it's stale, so use the default.
        return orderedMaterials.length === stableMaterialsInCategory.length
            ? orderedMaterials
            : stableMaterialsInCategory;
    }, [orderedMaterials, stableMaterialsInCategory]);


    // 5. This is the list of materials that gets displayed. It takes the correctly sorted master list and *then* filters it.
    const displayMaterials = useMemo(() => {
        if (!searchQuery) {
            return baseSortableOrder;
        }
        const lowercasedQuery = searchQuery.toLowerCase();
        return baseSortableOrder.filter(m => m.toLowerCase().includes(lowercasedQuery));
    }, [baseSortableOrder, searchQuery]);

    const [activeMaterial, setActiveMaterial] = useState(null);
    const [highlightedMaterial, setHighlightedMaterial] = useState(null);
    const detailRefs = useRef({});

    useEffect(() => {
        if (scrollToMaterial) {
            setHighlightedMaterial(scrollToMaterial);
            if (detailRefs.current[scrollToMaterial]?.current) {
                detailRefs.current[scrollToMaterial].current.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
            const timer = setTimeout(() => {
                setHighlightedMaterial(null);
                onScrollToComplete();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [scrollToMaterial, onScrollToComplete]);


    const handleDragStart = (event) => setActiveMaterial(event.active.id);

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setOrderedMaterials((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
        setActiveMaterial(null);
    };

    const handleDragCancel = () => setActiveMaterial(null);

    return (
        <DndContext
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="space-y-8">
                {/* The SortableContext MUST receive the full, unfiltered, sorted list to work correctly */}
                <SortableContext items={baseSortableOrder} strategy={verticalListSortingStrategy}>
                    {/* We then MAP over the potentially filtered `displayMaterials` for rendering */}
                    {displayMaterials.map(matType => (
                        <MaterialDetailItem
                            key={matType}
                            id={matType}
                            matType={matType}
                            inventory={inventory}
                            usageLog={usageLog}
                            inventorySummary={inventorySummary}
                            incomingSummary={incomingSummary}
                            onDeleteLog={onDeleteLog}
                            onDeleteInventoryGroup={onDeleteInventoryGroup}
                            onEditOrder={onEditOrder}
                            onReceiveOrder={onReceiveOrder}
                            onFulfillLog={onFulfillLog}
                            materials={materials}
                            ref={el => detailRefs.current[matType] = { current: el }}
                            highlighted={highlightedMaterial === matType}
                        />
                    ))}
                </SortableContext>
                <DragOverlay>
                    {activeMaterial ? (
                        <MaterialDetailItem
                            id={activeMaterial}
                            matType={activeMaterial}
                            inventory={inventory}
                            usageLog={usageLog}
                            inventorySummary={inventorySummary}
                            incomingSummary={incomingSummary}
                            materials={materials}
                            isDragging
                        />
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
};