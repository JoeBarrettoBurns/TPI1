import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useFirestoreDnd } from '../hooks/useFirestoreDnd';
import { MaterialDetailItem } from '../components/dashboard/MaterialDetailItem';

export const MaterialDetailView = ({
    category, inventory, usageLog, inventorySummary, incomingSummary,
    onDeleteLog, onDeleteInventoryGroup, onEditOrder, onReceiveOrder, onFulfillLog,
    scrollToMaterial, onScrollToComplete, materials, materialTypes, searchQuery
}) => {
    const stableMaterialsInCategory = useMemo(() => {
        return materialTypes
            .filter(m => materials[m] && materials[m].category === category);
    }, [category, materials, materialTypes]);

    const {
        orderedItems: orderedMaterials,
        activeItem: activeMaterial,
        handleDragStart,
        handleDragEnd,
        handleDragCancel
    } = useFirestoreDnd(stableMaterialsInCategory, materials);

    const displayMaterials = useMemo(() => {
        if (!searchQuery) {
            return orderedMaterials;
        }
        const lowercasedQuery = searchQuery.toLowerCase();
        return orderedMaterials.filter(m => m.toLowerCase().includes(lowercasedQuery));
    }, [orderedMaterials, searchQuery]);

    const [highlightedMaterial, setHighlightedMaterial] = useState(null);
    const detailRefs = useRef({});

    useEffect(() => {
        if (!scrollToMaterial) return;

        const node = detailRefs.current[scrollToMaterial]?.current;
        if (!node) return;

        setHighlightedMaterial(scrollToMaterial);
        node.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        const timer = setTimeout(() => {
            setHighlightedMaterial(null);
            onScrollToComplete();
        }, 1200);
        return () => clearTimeout(timer);
    }, [scrollToMaterial, displayMaterials, onScrollToComplete]);

    return (
        <DndContext
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="space-y-8">
                <SortableContext items={orderedMaterials} strategy={verticalListSortingStrategy}>
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