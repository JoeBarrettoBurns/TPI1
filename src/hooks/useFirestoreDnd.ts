// src/hooks/useFirestoreDnd.ts
import { useState, useEffect, useCallback } from 'react';
import { doc, writeBatch } from '../firebase/firestoreWithTracking';
import { arrayMove } from '@dnd-kit/sortable';
import { db, appId } from '../firebase/config';

export function useFirestoreDnd(initialItems: string[], materials: Record<string, any>) {
    const [orderedItems, setOrderedItems] = useState<string[]>([]);
    const [activeItem, setActiveItem] = useState<any>(null);

    useEffect(() => {
        // Sort initial items based on the 'order' field from Firestore
        const sorted = [...initialItems].sort((a, b) => {
            const orderA = materials[a]?.order ?? Infinity;
            const orderB = materials[b]?.order ?? Infinity;
            return orderA - orderB;
        });

        // Sync with any new items that might not have an order yet
        const initialSet = new Set(sorted);
        const newItems = initialItems.filter(item => !initialSet.has(item));
        
        const finalOrder = [...sorted, ...newItems];

        if (JSON.stringify(finalOrder) !== JSON.stringify(orderedItems)) {
            setOrderedItems(finalOrder);
        }
    }, [initialItems, materials, orderedItems]);

    const handleDragStart = (event: any) => {
        setActiveItem(event.active.id);
    };

    const handleDragEnd = useCallback(async (event: any) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = orderedItems.indexOf(active.id);
            const newIndex = orderedItems.indexOf(over.id);
            const newOrder = arrayMove(orderedItems, oldIndex, newIndex);
            setOrderedItems(newOrder);

            // Update Firestore
            const batch = writeBatch(db);
            newOrder.forEach((matType, index) => {
                const material = materials[matType];
                if (material) {
                    const docId = material.id;
                    const docRef = doc(db, `artifacts/${appId}/public/data/materials`, docId);
                    batch.update(docRef, { order: index });
                }
            });

            try {
                await batch.commit();
            } catch (error) {
                console.error("Failed to update material order:", error);
                // Optionally revert state on failure
                setOrderedItems(orderedItems);
            }
        }
        setActiveItem(null);
    }, [orderedItems, materials]);

    const handleDragCancel = () => {
        setActiveItem(null);
    };

    return {
        orderedItems,
        activeItem,
        handleDragStart,
        handleDragEnd,
        handleDragCancel
    };
}
