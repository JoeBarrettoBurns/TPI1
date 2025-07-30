// src/views/MaterialDetailView.jsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { usePersistentState } from '../hooks/usePersistentState';
import { MaterialDetailItem } from '../components/dashboard/MaterialDetailItem';

export const MaterialDetailView = ({
    category, inventory, usageLog, inventorySummary, incomingSummary,
    onDeleteLog, onDeleteInventoryGroup, onEditOrder, onReceiveOrder, onFulfillLog,
    scrollToMaterial, onScrollToComplete, materials, materialTypes
}) => {
    const initialMaterials = useMemo(() => {
        const materialsInCategory = materialTypes.filter(m => materials[m].category === category);
        return materialsInCategory.sort((a, b) => {
            const aSummary = inventorySummary[a] || {};
            const bSummary = inventorySummary[b] || {};
            const aTotal = Object.values(aSummary).reduce((sum, count) => sum + count, 0);
            const bTotal = Object.values(bSummary).reduce((sum, count) => sum + count, 0);
            return bTotal - aTotal;
        });
    }, [category, materials, materialTypes, inventorySummary]);

    const [orderedMaterials, setOrderedMaterials] = usePersistentState(`material-order-${category}`, []);
    const [activeMaterial, setActiveMaterial] = useState(null);
    const [highlightedMaterial, setHighlightedMaterial] = useState(null);
    const detailRefs = useRef({});

    useEffect(() => {
        setOrderedMaterials(prevOrder => {
            const liveItems = new Set(initialMaterials);
            const currentOrderSet = new Set(prevOrder);
            const filteredOrder = prevOrder.filter(item => liveItems.has(item));
            const newItems = initialMaterials.filter(item => !currentOrderSet.has(item));
            const newOrder = [...filteredOrder, ...newItems];
            if (JSON.stringify(newOrder) !== JSON.stringify(prevOrder)) {
                return newOrder;
            }
            return prevOrder;
        });
    }, [initialMaterials, setOrderedMaterials]);

    // This effect handles the scrolling and highlighting
    useEffect(() => {
        if (scrollToMaterial) {
            // 1. Set the local state to trigger the highlight
            setHighlightedMaterial(scrollToMaterial);

            // 2. Scroll the item into view
            if (detailRefs.current[scrollToMaterial]?.current) {
                detailRefs.current[scrollToMaterial].current.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }

            // 3. Set a timer to remove the highlight
            const timer = setTimeout(() => {
                setHighlightedMaterial(null);
                onScrollToComplete(); // Notify the parent app the process is done
            }, 1000); // 1.5 seconds

            // 4. Clean up the timer
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
                <SortableContext items={orderedMaterials} strategy={verticalListSortingStrategy}>
                    {orderedMaterials.map(matType => (
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
                            highlighted={highlightedMaterial === matType} // Use local state for highlight
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