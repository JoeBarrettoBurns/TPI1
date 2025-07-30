// src/views/DashboardView.jsx

import React, { useMemo } from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { MaterialCategoryCard } from '../components/dashboard/MaterialCategoryCard';

export const DashboardView = ({
    inventorySummary,
    incomingSummary,
    isEditMode,
    onSave,
    onMaterialClick,
    materials,
    categories,
    activeCategory,
    onDeleteCategory,
    categoriesToDelete,
    searchQuery
}) => {
    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        const lowercasedQuery = searchQuery.toLowerCase();

        const materialTypes = Object.keys(materials);
        const matchingMaterials = materialTypes.filter(m => m.toLowerCase().includes(lowercasedQuery));
        const categoriesWithMatchingMaterials = new Set(matchingMaterials.map(m => materials[m].category));

        return categories.filter(c =>
            c.toLowerCase().includes(lowercasedQuery) ||
            categoriesWithMatchingMaterials.has(c)
        );
    }, [searchQuery, categories, materials]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <SortableContext items={filteredCategories} strategy={rectSortingStrategy}>
                {filteredCategories.map(category => (
                    <MaterialCategoryCard
                        key={category}
                        id={category}
                        category={category}
                        inventorySummary={inventorySummary}
                        incomingSummary={incomingSummary}
                        isEditMode={isEditMode}
                        onSave={onSave}
                        onMaterialClick={onMaterialClick}
                        materials={materials}
                        onDeleteCategory={onDeleteCategory}
                        isMarkedForDeletion={categoriesToDelete.includes(category)}
                    />
                ))}
            </SortableContext>

            <DragOverlay>
                {activeCategory ? (
                    <MaterialCategoryCard
                        id={activeCategory}
                        category={activeCategory}
                        inventorySummary={inventorySummary}
                        incomingSummary={incomingSummary}
                        isEditMode={isEditMode}
                        onSave={onSave}
                        onMaterialClick={onMaterialClick}
                        materials={materials}
                        isDragging
                    />
                ) : null}
            </DragOverlay>
        </div>
    )
};