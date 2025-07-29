// src/hooks/usePersistentDnd.js

import { useState, useEffect, useMemo } from 'react';
import { usePersistentState } from './usePersistentState';
import { arrayMove } from '@dnd-kit/sortable';

export function usePersistentDnd(key, initialItems) {
    const [orderedItems, setOrderedItems] = usePersistentState(key, initialItems);
    const [activeItem, setActiveItem] = useState(null);

    useEffect(() => {
        if (initialItems.length > 0) {
            setOrderedItems(prevOrder => {
                const newSet = new Set(initialItems);
                const orderedSet = new Set(prevOrder);

                const validOrdered = prevOrder.filter(item => newSet.has(item));
                const newItems = initialItems.filter(item => !orderedSet.has(item));

                return [...validOrdered, ...newItems];
            });
        }
    }, [initialItems, setOrderedItems]);

    const handleDragStart = (event) => {
        setActiveItem(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setOrderedItems((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
        setActiveItem(null);
    };

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