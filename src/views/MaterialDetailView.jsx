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
    const initialMaterials = useMemo(() =>
        materialTypes.filter(m => materials[m].category === category),
        [category, materials, materialTypes]
    );

    const [orderedMaterials, setOrderedMaterials] = usePersistentState(`material-order-${category}`, []);
    const [activeMaterial, setActiveMaterial] = useState(null);

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

    const detailRefs = useRef({});
    useEffect(() => {
        if (scrollToMaterial && detailRefs.current[scrollToMaterial]?.current) {
            detailRefs.current[scrollToMaterial].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            onScrollToComplete();
        }
    }, [scrollToMaterial, onScrollToComplete]);

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
                            highlighted={scrollToMaterial === matType}
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