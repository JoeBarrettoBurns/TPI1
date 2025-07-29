// src/views/DashboardView.jsx

import React from 'react';
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
    categoriesToDelete
}) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SortableContext items={categories} strategy={rectSortingStrategy}>
            {categories.map(category => (
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
);